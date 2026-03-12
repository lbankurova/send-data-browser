/**
 * n-value-integrity.test.ts — Comprehensive N-value correctness across all UI surfaces
 *
 * Core invariant: every N the UI displays must equal the known correct value
 * from the source data. No aggregation may sum across measurement days, and
 * every emitted N must fall within study design bounds.
 *
 * Surfaces covered:
 *   - flattenFindingsToDRRows (derive-summaries.ts)
 *   - doseLevelBreakdown aggregation (DoseResponseContextPanel logic)
 *   - deriveEndpointSummaries controlStats/worstTreatedStats
 *   - lesion_severity_summary.json (histopathology)
 *   - study_signal_summary.json
 *   - affected ≤ N everywhere
 *   - study design bound enforcement
 *
 * Motivated by BW N-inflation bug (66c34c6): DoseResponseRow was missing the
 * `day` field, causing doseLevelBreakdown to sum N across 15 BW measurement
 * days (N=401 instead of ~30).
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { flattenFindingsToDRRows, deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type {
  DoseResponseRow,
  LesionSeverityRow,
  SignalSummaryRow,
  AdverseEffectSummaryRow,
} from "@/types/analysis-views";

// ─── Paths ──────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "../..");
const UNIFIED_PATH = path.join(ROOT, "backend/generated/PointCross/unified_findings.json");
const LESION_PATH = path.join(ROOT, "backend/generated/PointCross/lesion_severity_summary.json");
const SIGNAL_PATH = path.join(ROOT, "backend/generated/PointCross/study_signal_summary.json");
const AE_PATH = path.join(ROOT, "backend/generated/PointCross/adverse_effect_summary.json");

const hasGenerated = fs.existsSync(UNIFIED_PATH);

// ─── Study Design Bounds (PointCross) ───────────────────────
// These are the known study design parameters for PointCross.
const DESIGN = {
  doseLevels: 4,             // 0 (control), 1, 2, 3
  mainPerSex: 10,            // main study arm: 10M + 10F per dose
  recoveryPerSex: 5,         // recovery arm: 5M + 5F per dose
  pooledPerSex: 15,          // main + recovery: 15 per sex per dose
  pooledPerDose: 30,         // 15M + 15F
  tkPerSex: 5,               // satellite/TK: 5 per sex (dose groups 1-3 only)
  /** Maximum plausible N for a single sex at one dose level.
   *  pooled(15) + TK(5) = 20. Some LB endpoints pool TK animals. */
  maxPerSex: 20,
  /** Maximum plausible N for both sexes combined at one dose level */
  maxPerDose: 40,
  /** Hard ceiling — any N above this is certainly a bug (e.g. cross-day summation) */
  hardCeiling: 50,
} as const;

// ─── Load Data ──────────────────────────────────────────────

let doseGroups: DoseGroup[] = [];
let findings: UnifiedFinding[] = [];
let lesionRows: LesionSeverityRow[] = [];
let signalRows: SignalSummaryRow[] = [];
let aeRows: AdverseEffectSummaryRow[] = [];
let drRows: DoseResponseRow[] = [];

if (hasGenerated) {
  const unified = JSON.parse(fs.readFileSync(UNIFIED_PATH, "utf-8"));
  doseGroups = unified.dose_groups;
  findings = unified.findings;
  drRows = flattenFindingsToDRRows(findings, doseGroups);

  if (fs.existsSync(LESION_PATH)) {
    lesionRows = JSON.parse(fs.readFileSync(LESION_PATH, "utf-8"));
  }
  if (fs.existsSync(SIGNAL_PATH)) {
    signalRows = JSON.parse(fs.readFileSync(SIGNAL_PATH, "utf-8"));
  }
  if (fs.existsSync(AE_PATH)) {
    aeRows = JSON.parse(fs.readFileSync(AE_PATH, "utf-8"));
  }
}

// ─── Helper: simulate doseLevelBreakdown (DoseResponseContextPanel logic) ──
function computeDoseLevelBreakdown(
  rows: DoseResponseRow[],
  endpointLabel: string,
): { dose_level: number; n: number }[] | null {
  let filtered = rows.filter((r) => r.endpoint_label === endpointLabel);
  if (filtered.length === 0) return null;

  // Peak-effect day filter (mirrors the fix in DoseResponseContextPanel)
  const days = new Set(filtered.map((r) => r.day));
  if (days.size > 1) {
    let peakDay: number | null = null;
    let peakEffect = -1;
    for (const d of days) {
      if (d == null) continue;
      const dayRows = filtered.filter((r) => r.day === d);
      for (const r of dayRows) {
        const abs = r.effect_size != null ? Math.abs(r.effect_size) : 0;
        if (abs > peakEffect) {
          peakEffect = abs;
          peakDay = d;
        }
      }
    }
    if (peakDay != null) {
      filtered = filtered.filter((r) => r.day === peakDay);
    }
  }

  // Group by dose level, sum N across sexes
  const byDose = new Map<number, number>();
  for (const r of filtered) {
    byDose.set(r.dose_level, (byDose.get(r.dose_level) ?? 0) + (r.n ?? 0));
  }

  return Array.from(byDose.entries())
    .map(([dose_level, n]) => ({ dose_level, n }))
    .sort((a, b) => a.dose_level - b.dose_level);
}

// ═════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════

describe("N-value integrity", () => {

  // ── Preconditions ──────────────────────────────────────────

  test.skipIf(!hasGenerated)("generated data exists and has expected structure", () => {
    expect(doseGroups.length).toBe(DESIGN.doseLevels);
    expect(findings.length).toBeGreaterThan(0);
    expect(drRows.length).toBeGreaterThan(0);
  });

  // ── 1. Dose groups: authoritative N matches study design ──

  describe.skipIf(!hasGenerated)("dose_groups — authoritative N values", () => {
    test("each dose group has correct main arm N", () => {
      for (const dg of doseGroups) {
        expect(dg.n_male, `dose ${dg.dose_level} n_male`).toBe(DESIGN.mainPerSex);
        expect(dg.n_female, `dose ${dg.dose_level} n_female`).toBe(DESIGN.mainPerSex);
        expect(dg.n_total, `dose ${dg.dose_level} n_total`).toBe(DESIGN.mainPerSex * 2);
      }
    });

    test("each dose group has correct pooled N", () => {
      for (const dg of doseGroups) {
        expect(dg.pooled_n_male, `dose ${dg.dose_level} pooled_n_male`).toBe(DESIGN.pooledPerSex);
        expect(dg.pooled_n_female, `dose ${dg.dose_level} pooled_n_female`).toBe(DESIGN.pooledPerSex);
        expect(dg.pooled_n_total, `dose ${dg.dose_level} pooled_n_total`).toBe(DESIGN.pooledPerDose);
      }
    });
  });

  // ── 2. Source group_stats N within bounds ──────────────────

  describe.skipIf(!hasGenerated)("unified_findings — group_stats N within study bounds", () => {
    test("every group_stats.n ≤ max per-sex bound", () => {
      const violations: string[] = [];
      for (const f of findings) {
        for (const gs of f.group_stats) {
          if (gs.n > DESIGN.maxPerSex) {
            violations.push(
              `${f.endpoint_label ?? f.finding} (${f.domain}, sex=${f.sex}, day=${f.day}, dose=${gs.dose_level}): n=${gs.n} > max ${DESIGN.maxPerSex}`
            );
          }
        }
      }
      expect(violations, `${violations.length} N values exceed per-sex bound:\n${violations.slice(0, 10).join("\n")}`).toHaveLength(0);
    });

    test("every group_stats.affected ≤ group_stats.n", () => {
      const violations: string[] = [];
      for (const f of findings) {
        for (const gs of f.group_stats) {
          if (gs.affected != null && gs.affected > gs.n) {
            violations.push(
              `${f.endpoint_label ?? f.finding} (${f.domain}, dose=${gs.dose_level}): affected=${gs.affected} > n=${gs.n}`
            );
          }
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });

    test("scheduled_group_stats.n ≤ max per-sex bound", () => {
      const violations: string[] = [];
      for (const f of findings) {
        if (!f.scheduled_group_stats) continue;
        for (const gs of f.scheduled_group_stats) {
          if (gs.n > DESIGN.maxPerSex) {
            violations.push(
              `${f.endpoint_label ?? f.finding} (${f.domain}, sex=${f.sex}, dose=${gs.dose_level}): scheduled n=${gs.n} > max ${DESIGN.maxPerSex}`
            );
          }
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });
  });

  // ── 3. flattenFindingsToDRRows — N preservation ───────────

  describe.skipIf(!hasGenerated)("flattenFindingsToDRRows — N fidelity", () => {
    test("DR row count = sum of group_stats counts across all findings", () => {
      const expectedCount = findings.reduce((sum, f) => sum + f.group_stats.length, 0);
      expect(drRows.length).toBe(expectedCount);
    });

    test("every DoseResponseRow.n equals its source group_stats.n exactly", () => {
      // Verify by index: flattenFindingsToDRRows produces rows in
      // findings × group_stats order, so we can verify 1:1 by position.
      let idx = 0;
      const violations: string[] = [];
      for (const f of findings) {
        for (const gs of f.group_stats) {
          const dr = drRows[idx];
          if (!dr) {
            violations.push(`Missing DR row at index ${idx}`);
            idx++;
            continue;
          }
          if (dr.n !== gs.n) {
            violations.push(
              `${dr.endpoint_label} (${dr.domain}, sex=${dr.sex}, dose=${dr.dose_level}, day=${dr.day}): DR n=${dr.n} ≠ source n=${gs.n}`
            );
          }
          if (dr.day !== f.day) {
            violations.push(
              `${dr.endpoint_label} (${dr.domain}, sex=${dr.sex}, dose=${dr.dose_level}): DR day=${dr.day} ≠ source day=${f.day}`
            );
          }
          idx++;
        }
      }
      expect(violations, `${violations.length} mismatches:\n${violations.slice(0, 10).join("\n")}`).toHaveLength(0);
    });

    test("no DoseResponseRow.n exceeds per-sex study bound", () => {
      const violations: string[] = [];
      for (const r of drRows) {
        if (r.n != null && r.n > DESIGN.maxPerSex) {
          violations.push(
            `${r.endpoint_label} (${r.domain}, sex=${r.sex}, dose=${r.dose_level}, day=${r.day}): n=${r.n} > max ${DESIGN.maxPerSex}`
          );
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });

    test("DoseResponseRow.affected ≤ n everywhere", () => {
      const violations: string[] = [];
      for (const r of drRows) {
        if (r.affected != null && r.n != null && r.affected > r.n) {
          violations.push(
            `${r.endpoint_label} (dose=${r.dose_level}, sex=${r.sex}): affected=${r.affected} > n=${r.n}`
          );
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });

    test("BW findings have day populated in DR rows", () => {
      const bwDR = drRows.filter((r) => r.domain === "BW");
      expect(bwDR.length).toBeGreaterThan(0);
      for (const r of bwDR) {
        expect(r.day, `BW row at dose ${r.dose_level} sex ${r.sex} has null day`).not.toBeNull();
      }
    });
  });

  // ── 4. Multi-day N-inflation guard (the BW bug) ───────────

  describe.skipIf(!hasGenerated)("multi-day N-inflation guard", () => {
    test("BW endpoint has multiple measurement days", () => {
      const bwRows = drRows.filter((r) => r.domain === "BW");
      const days = new Set(bwRows.map((r) => r.day).filter((d) => d != null));
      expect(days.size, "BW should have multiple measurement days").toBeGreaterThan(1);
    });

    test("doseLevelBreakdown for BW does not inflate N across days", () => {
      const breakdown = computeDoseLevelBreakdown(drRows, "Body Weight");
      expect(breakdown, "BW doseLevelBreakdown should exist").not.toBeNull();

      for (const entry of breakdown!) {
        // Combined M+F at one dose on one day: max pooledPerDose = 30
        expect(
          entry.n,
          `BW dose ${entry.dose_level}: breakdown n=${entry.n} exceeds pooled dose max ${DESIGN.pooledPerDose}`
        ).toBeLessThanOrEqual(DESIGN.pooledPerDose);
      }
    });

    test("no endpoint doseLevelBreakdown exceeds hard ceiling", () => {
      // The doseLevelBreakdown sums N across sexes (and possibly MI+MA for
      // same specimen). The hard ceiling catches cross-day inflation bugs.
      const endpoints = new Set(drRows.map((r) => r.endpoint_label));
      const violations: string[] = [];

      for (const ep of endpoints) {
        const breakdown = computeDoseLevelBreakdown(drRows, ep);
        if (!breakdown) continue;

        for (const entry of breakdown) {
          if (entry.n > DESIGN.hardCeiling) {
            violations.push(
              `${ep} dose ${entry.dose_level}: breakdown n=${entry.n} > hard ceiling ${DESIGN.hardCeiling}`
            );
          }
        }
      }
      expect(violations, `${violations.length} N-inflation violations:\n${violations.join("\n")}`).toHaveLength(0);
    });

    test("doseLevelBreakdown N = sum of per-sex DR rows on filtered day", () => {
      // For each endpoint, verify breakdown N equals the sum of the per-sex
      // source rows after day filtering (i.e., no hidden summation).
      const endpoints = new Set(drRows.map((r) => r.endpoint_label));
      const violations: string[] = [];

      for (const ep of endpoints) {
        const breakdown = computeDoseLevelBreakdown(drRows, ep);
        if (!breakdown) continue;

        // Re-apply the same day-filter to get expected rows
        let filtered = drRows.filter((r) => r.endpoint_label === ep);
        const days = new Set(filtered.map((r) => r.day));
        if (days.size > 1) {
          let peakDay: number | null = null;
          let peakEffect = -1;
          for (const d of days) {
            if (d == null) continue;
            for (const r of filtered.filter((r) => r.day === d)) {
              const abs = r.effect_size != null ? Math.abs(r.effect_size) : 0;
              if (abs > peakEffect) { peakEffect = abs; peakDay = d; }
            }
          }
          if (peakDay != null) filtered = filtered.filter((r) => r.day === peakDay);
        }

        for (const entry of breakdown) {
          const sourceRows = filtered.filter((r) => r.dose_level === entry.dose_level);
          const expectedN = sourceRows.reduce((sum, r) => sum + (r.n ?? 0), 0);
          if (entry.n !== expectedN) {
            violations.push(
              `${ep} dose ${entry.dose_level}: breakdown n=${entry.n} ≠ sum-of-source n=${expectedN}`
            );
          }
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });
  });

  // ── 5. deriveEndpointSummaries — controlStats / worstTreatedStats N ──

  describe.skipIf(!hasGenerated || aeRows.length === 0)("deriveEndpointSummaries — group stats N", () => {
    const summaries = aeRows.length > 0 ? deriveEndpointSummaries(aeRows) : [];

    test("controlStats.n ≤ max per-sex study bound", () => {
      const violations: string[] = [];
      for (const ep of summaries) {
        if (!ep.controlStats) continue;
        if (ep.controlStats.n > DESIGN.maxPerSex) {
          violations.push(
            `${ep.endpoint_label} controlStats.n=${ep.controlStats.n} > max ${DESIGN.maxPerSex}`
          );
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });

    test("worstTreatedStats.n ≤ max per-sex study bound", () => {
      const violations: string[] = [];
      for (const ep of summaries) {
        if (!ep.worstTreatedStats) continue;
        if (ep.worstTreatedStats.n > DESIGN.maxPerSex) {
          violations.push(
            `${ep.endpoint_label} worstTreatedStats.n=${ep.worstTreatedStats.n} > max ${DESIGN.maxPerSex}`
          );
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });

    test("controlStats.n > 0 when present", () => {
      for (const ep of summaries) {
        if (!ep.controlStats) continue;
        expect(ep.controlStats.n, `${ep.endpoint_label} controlStats.n=0`).toBeGreaterThan(0);
      }
    });

    test("worstTreatedStats.n > 0 when present", () => {
      for (const ep of summaries) {
        if (!ep.worstTreatedStats) continue;
        expect(ep.worstTreatedStats.n, `${ep.endpoint_label} worstTreatedStats.n=0`).toBeGreaterThan(0);
      }
    });
  });

  // ── 6. Histopathology — lesion_severity_summary N ─────────

  describe.skipIf(!hasGenerated || lesionRows.length === 0)("lesion_severity_summary — N values", () => {
    test("every lesion N ≤ pooled per-sex maximum", () => {
      const violations: string[] = [];
      for (const r of lesionRows) {
        if (r.n > DESIGN.pooledPerSex) {
          violations.push(
            `${r.specimen} — ${r.finding} (sex=${r.sex}, dose=${r.dose_level}): n=${r.n} > max ${DESIGN.pooledPerSex}`
          );
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });

    test("every lesion affected ≤ n", () => {
      const violations: string[] = [];
      for (const r of lesionRows) {
        if (r.affected > r.n) {
          violations.push(
            `${r.specimen} — ${r.finding} (sex=${r.sex}, dose=${r.dose_level}): affected=${r.affected} > n=${r.n}`
          );
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });

    test("incidence = affected / n", () => {
      const violations: string[] = [];
      for (const r of lesionRows) {
        if (r.n === 0) continue;
        const expected = r.affected / r.n;
        if (Math.abs(r.incidence - expected) > 0.001) {
          violations.push(
            `${r.specimen} — ${r.finding} (sex=${r.sex}, dose=${r.dose_level}): incidence=${r.incidence} ≠ ${r.affected}/${r.n}=${expected.toFixed(4)}`
          );
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });

    test("histopath N values are within expected set", () => {
      const nValues = new Set(lesionRows.map((r) => r.n));
      const allowed = new Set([DESIGN.mainPerSex, DESIGN.pooledPerSex]);
      const unexpected = [...nValues].filter((n) => !allowed.has(n));
      expect(
        unexpected,
        `unexpected histopath N values: ${unexpected.join(", ")} — expected only ${[...allowed].join(" or ")}`
      ).toHaveLength(0);
    });
  });

  // ── 7. Signal summary — N values ──────────────────────────

  describe.skipIf(!hasGenerated || signalRows.length === 0)("study_signal_summary — N values", () => {
    test("every signal N ≤ max per-sex bound", () => {
      const violations: string[] = [];
      for (const r of signalRows) {
        if (r.n > DESIGN.maxPerSex) {
          violations.push(
            `${r.endpoint_label} (${r.domain}, sex=${r.sex}, dose=${r.dose_level}): n=${r.n} > max ${DESIGN.maxPerSex}`
          );
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });

    test("signal summary N is non-negative", () => {
      for (const r of signalRows) {
        expect(r.n, `${r.endpoint_label}: negative n=${r.n}`).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── 8. Regression guard: specific BW N-inflation scenario ─

  describe.skipIf(!hasGenerated)("regression: BW N-inflation (66c34c6)", () => {
    test("BW has 15 unique measurement days in source findings", () => {
      const bwFindings = findings.filter((f) => f.domain === "BW");
      const days = new Set(bwFindings.map((f) => f.day).filter((d) => d != null));
      expect(days.size).toBe(15);
    });

    test("BW DR rows per (sex, dose) per day have n ≤ pooled per-sex max", () => {
      const bwDR = drRows.filter((r) => r.domain === "BW");
      for (const r of bwDR) {
        expect(
          r.n,
          `BW sex=${r.sex} dose=${r.dose_level} day=${r.day}: n=${r.n}`
        ).toBeLessThanOrEqual(DESIGN.pooledPerSex);
      }
    });

    test("BW doseLevelBreakdown produces n=30 per dose (15M + 15F on peak day)", () => {
      const breakdown = computeDoseLevelBreakdown(drRows, "Body Weight");
      expect(breakdown).not.toBeNull();
      for (const entry of breakdown!) {
        expect(
          entry.n,
          `BW dose ${entry.dose_level}: breakdown n=${entry.n}, expected ${DESIGN.pooledPerDose}`
        ).toBe(DESIGN.pooledPerDose);
      }
    });

    test("without day field, BW would inflate to ~450 per dose (documenting the bug)", () => {
      // Simulate the bug: strip day from DR rows and re-aggregate without filtering
      const bwRows = drRows.filter((r) => r.endpoint_label === "Body Weight");
      const withoutDayFilter = new Map<number, number>();
      for (const r of bwRows) {
        withoutDayFilter.set(
          r.dose_level,
          (withoutDayFilter.get(r.dose_level) ?? 0) + (r.n ?? 0)
        );
      }
      // Without day filtering, N gets summed across all 15 days × 2 sexes
      for (const [dose, totalN] of withoutDayFilter) {
        expect(
          totalN,
          `BW dose ${dose}: unfiltered N=${totalN} should be >> 30 (proving the bug exists without the fix)`
        ).toBeGreaterThan(DESIGN.pooledPerDose * 5);
      }
    });
  });
});
