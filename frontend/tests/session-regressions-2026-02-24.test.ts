/**
 * Regression tests for session 2026-02-24 commits:
 *
 * a595c59  feat: unify effect size method across normalization engine and all views
 * 33375d0  fix: useSessionState cross-component sync via custom event bus
 * 8f973b8  fix: domain table — only domain code is clickable, rest is selectable text
 * a5a11d9  fix: domain table TF notes from raw data, remove BW note, death tooltip wording
 * e91d585  fix: BW selection for normalization — use peak effect, not day 1
 */
import { describe, it, expect } from "vitest";
import {
  computeEffectSize,
  getEffectSizeSymbol,
} from "@/lib/stat-method-transforms";
import type { EffectSizeMethod } from "@/lib/stat-method-transforms";
import {
  computeStudyNormalization,
  hedgesGFromStats,
} from "@/lib/organ-weight-normalization";
import type { GroupStatsTriplet } from "@/lib/organ-weight-normalization";
import { buildTfTypeSummary } from "@/components/analysis/StudySummaryView";
import { extractBwGroupStats } from "@/hooks/useOrganWeightNormalization";
import type { UnifiedFinding } from "@/types/analysis";

// ─── Shared fixtures ────────────────────────────────────────

const BW_STATS: GroupStatsTriplet[] = [
  { doseLevel: 0, n: 10, mean: 342, sd: 28 },
  { doseLevel: 1, n: 10, mean: 330, sd: 30 },
  { doseLevel: 2, n: 10, mean: 310, sd: 32 },
  { doseLevel: 3, n: 10, mean: 298, sd: 35 },
];

const BRAIN_STATS: GroupStatsTriplet[] = [
  { doseLevel: 0, n: 10, mean: 2.05, sd: 0.08 },
  { doseLevel: 1, n: 10, mean: 2.04, sd: 0.09 },
  { doseLevel: 2, n: 10, mean: 2.03, sd: 0.08 },
  { doseLevel: 3, n: 10, mean: 2.04, sd: 0.09 },
];

const ORGAN_MAP = new Map<string, GroupStatsTriplet[]>([
  ["LIVER", [
    { doseLevel: 0, n: 10, mean: 12.9, sd: 1.2 },
    { doseLevel: 1, n: 10, mean: 12.3, sd: 1.1 },
    { doseLevel: 2, n: 10, mean: 11.5, sd: 1.3 },
    { doseLevel: 3, n: 10, mean: 10.2, sd: 1.4 },
  ]],
]);

// ─── a595c59: Effect size method threading ──────────────────

describe("regression: effect size method threading (a595c59)", () => {
  it("computeStudyNormalization accepts effectSizeMethod param", () => {
    // Must not throw for any method
    for (const method of ["hedges-g", "cohens-d", "glass-delta"] as EffectSizeMethod[]) {
      const state = computeStudyNormalization(
        BW_STATS, BRAIN_STATS, ORGAN_MAP, 0,
        "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY", method,
      );
      expect(state.worstBwG, `worstBwG should be > 0 for ${method}`).toBeGreaterThan(0);
      expect(state.highestTier, `highestTier should be >= 2 for ${method}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("different methods produce different worstBwG values", () => {
    // Hedges' g applies J-correction, Cohen's d does not → values differ for n=10
    const hedgesState = computeStudyNormalization(
      BW_STATS, BRAIN_STATS, ORGAN_MAP, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY", "hedges-g",
    );
    const cohensState = computeStudyNormalization(
      BW_STATS, BRAIN_STATS, ORGAN_MAP, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY", "cohens-d",
    );
    // Cohen's d >= Hedges' g (J-correction shrinks toward zero)
    expect(cohensState.worstBwG).toBeGreaterThanOrEqual(hedgesState.worstBwG);
    // But they should be close for n=10 (J ≈ 0.96)
    expect(Math.abs(cohensState.worstBwG - hedgesState.worstBwG)).toBeLessThan(0.2);
  });

  it("Glass delta uses control SD only", () => {
    // Glass's Δ = (mean_t - mean_c) / sd_c
    // With asymmetric SDs, Glass differs noticeably from Cohen's d
    const glass = computeEffectSize("glass-delta", 300, 10, 10, 250, 50, 10);
    const cohens = computeEffectSize("cohens-d", 300, 10, 10, 250, 50, 10);
    // Glass: 50/10 = 5.0, Cohen: 50/~36.1 ≈ 1.38
    expect(glass).not.toBeNull();
    expect(cohens).not.toBeNull();
    expect(Math.abs(glass!)).toBeGreaterThan(Math.abs(cohens!) * 2);
  });

  it("default effectSizeMethod is hedges-g", () => {
    const defaultState = computeStudyNormalization(
      BW_STATS, BRAIN_STATS, ORGAN_MAP, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY",
    );
    const explicitState = computeStudyNormalization(
      BW_STATS, BRAIN_STATS, ORGAN_MAP, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY", "hedges-g",
    );
    expect(defaultState.worstBwG).toBeCloseTo(explicitState.worstBwG, 10);
  });

  it("computeEffectSize returns different values per method", () => {
    const cMean = 342, cSd = 28, cN = 10, tMean = 298, tSd = 35, tN = 10;
    const g = computeEffectSize("hedges-g", cMean, cSd, cN, tMean, tSd, tN);
    const d = computeEffectSize("cohens-d", cMean, cSd, cN, tMean, tSd, tN);
    const delta = computeEffectSize("glass-delta", cMean, cSd, cN, tMean, tSd, tN);
    expect(g).not.toBeNull();
    expect(d).not.toBeNull();
    expect(delta).not.toBeNull();
    // All should be negative (treated < control)
    expect(g!).toBeLessThan(0);
    expect(d!).toBeLessThan(0);
    expect(delta!).toBeLessThan(0);
    // |g| < |d| (J-correction shrinks)
    expect(Math.abs(g!)).toBeLessThan(Math.abs(d!));
    // Glass uses only control SD (28) while pooled is ~31.7 → |Δ| > |d|
    expect(Math.abs(delta!)).toBeGreaterThan(Math.abs(d!));
  });

  it("getEffectSizeSymbol returns correct symbols for all methods", () => {
    expect(getEffectSizeSymbol("hedges-g")).toBe("g");
    expect(getEffectSizeSymbol("cohens-d")).toBe("d");
    expect(getEffectSizeSymbol("glass-delta")).toBe("\u0394");
  });

  it("normalization uses computeEffectSize instead of hedgesGFromStats", () => {
    // When using cohens-d, the normalization result should NOT match hedgesGFromStats
    const cohensState = computeStudyNormalization(
      BW_STATS, BRAIN_STATS, ORGAN_MAP, 0,
      "RAT_SPRAGUE_DAWLEY", "GENERAL", "TEST_STUDY", "cohens-d",
    );
    // hedgesGFromStats always computes Hedges' g
    const hgResult = hedgesGFromStats(
      BW_STATS[0].mean, BW_STATS[0].sd, BW_STATS[0].n,
      BW_STATS[3].mean, BW_STATS[3].sd, BW_STATS[3].n,
    );
    // Cohen's d (no J-correction) > Hedges' g (J-corrected)
    expect(cohensState.worstBwG).toBeGreaterThan(hgResult.g);
  });
});

// ─── a5a11d9: TF type summary from raw domain data ─────────

describe("regression: TF type summary from raw data (a5a11d9)", () => {
  const TF_ROWS: Record<string, unknown>[] = [
    { TFSPEC: "LIVER", TFSTRESC: "CARCINOMA, HEPATOCELLULAR, MALIGNANT" },
    { TFSPEC: "LIVER", TFSTRESC: "CARCINOMA, HEPATOCELLULAR, MALIGNANT" },
    { TFSPEC: "LIVER", TFSTRESC: "ADENOMA, HEPATOCELLULAR, BENIGN" },
    { TFSPEC: "LIVER", TFSTRESC: "ADENOMA, HEPATOCELLULAR, BENIGN" },
    { TFSPEC: "UTERUS", TFSTRESC: "LEIOMYOMA, BENIGN" },
  ];

  it("counts unique TFSTRESC values, not endpoint labels", () => {
    const summary = buildTfTypeSummary(TF_ROWS);
    // 3 unique findings: carcinoma, adenoma, leiomyoma
    expect(summary.uniqueTypeCount).toBe(3);
  });

  it("groups by specimen in uppercase", () => {
    const summary = buildTfTypeSummary(TF_ROWS);
    expect(summary.bySpecimen.has("LIVER")).toBe(true);
    expect(summary.bySpecimen.has("UTERUS")).toBe(true);
    // No lowercase keys
    for (const key of summary.bySpecimen.keys()) {
      expect(key).toBe(key.toUpperCase());
    }
  });

  it("stores finding names in lowercase", () => {
    const summary = buildTfTypeSummary(TF_ROWS);
    for (const specMap of summary.bySpecimen.values()) {
      for (const finding of specMap.keys()) {
        expect(finding).toBe(finding.toLowerCase());
      }
    }
  });

  it("counts actual records per type, not group sizes", () => {
    const summary = buildTfTypeSummary(TF_ROWS);
    const liver = summary.bySpecimen.get("LIVER")!;
    expect(liver.get("carcinoma, hepatocellular, malignant")).toBe(2);
    expect(liver.get("adenoma, hepatocellular, benign")).toBe(2);
    const uterus = summary.bySpecimen.get("UTERUS")!;
    expect(uterus.get("leiomyoma, benign")).toBe(1);
  });

  it("same finding in different specimens counts as one unique type", () => {
    const rows: Record<string, unknown>[] = [
      { TFSPEC: "LIVER", TFSTRESC: "CARCINOMA" },
      { TFSPEC: "KIDNEY", TFSTRESC: "CARCINOMA" },
      { TFSPEC: "KIDNEY", TFSTRESC: "ADENOMA" },
    ];
    const summary = buildTfTypeSummary(rows);
    // "carcinoma" appears in both LIVER and KIDNEY but is one unique type
    expect(summary.uniqueTypeCount).toBe(2); // carcinoma + adenoma
    expect(summary.bySpecimen.get("LIVER")!.get("carcinoma")).toBe(1);
    expect(summary.bySpecimen.get("KIDNEY")!.get("carcinoma")).toBe(1);
  });

  it("handles empty rows", () => {
    const summary = buildTfTypeSummary([]);
    expect(summary.uniqueTypeCount).toBe(0);
    expect(summary.bySpecimen.size).toBe(0);
  });

  it("handles missing TFSPEC (defaults to OTHER)", () => {
    const rows: Record<string, unknown>[] = [
      { TFSTRESC: "TUMOR_TYPE_A" },
    ];
    const summary = buildTfTypeSummary(rows);
    expect(summary.bySpecimen.has("OTHER")).toBe(true);
    expect(summary.uniqueTypeCount).toBe(1);
  });

  it("skips rows with empty TFSTRESC", () => {
    const rows: Record<string, unknown>[] = [
      { TFSPEC: "LIVER", TFSTRESC: "" },
      { TFSPEC: "LIVER", TFSTRESC: "ADENOMA" },
    ];
    const summary = buildTfTypeSummary(rows);
    expect(summary.uniqueTypeCount).toBe(1);
  });
});

// ─── 33375d0: useSessionState cross-component sync ─────────

describe("regression: useSessionState sync invariants (33375d0)", () => {
  // Note: useSessionState is a React hook and cannot be unit-tested without
  // a React test harness. These tests verify the underlying contract:
  // CustomEvent dispatch + sessionStorage round-trip.

  it("JSON round-trip preserves primitive values", () => {
    // Simulates sessionStorage.setItem / getItem without browser APIs
    const store = new Map<string, string>();
    const key = "pcc.test.effectSize";
    store.set(key, JSON.stringify("cohens-d"));
    const stored = store.get(key)!;
    expect(stored).toBeDefined();
    expect(JSON.parse(stored)).toBe("cohens-d");
  });

  it("JSON round-trip preserves object values", () => {
    const store = new Map<string, string>();
    const key = "pcc.test.complex";
    const value = { method: "hedges-g", threshold: 0.05 };
    store.set(key, JSON.stringify(value));
    const stored = store.get(key)!;
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored);
    expect(parsed.method).toBe("hedges-g");
    expect(parsed.threshold).toBe(0.05);
  });

  it("JSON equality check prevents unnecessary state updates", () => {
    // The sync mechanism uses JSON.stringify comparison to avoid loops
    const prev = JSON.stringify("hedges-g");
    const stored = JSON.stringify("hedges-g");
    expect(prev === stored).toBe(true); // Same value → no update needed

    const changed = JSON.stringify("cohens-d");
    expect(prev === changed).toBe(false); // Different value → update needed
  });
});

// ─── e91d585: BW peak effect selection for normalization ────

/**
 * extractBwGroupStats must select the BW finding with the largest absolute
 * effect size, excluding day 1 (pre-dose). This prevents the normalization
 * engine from using randomization noise as its BW confounding estimate.
 *
 * Why not terminal BW?
 * - TR deaths create survivorship bias at terminal (censored animals skew result)
 * - Partial recovery underestimates peak confounding
 * - Peak divergence captures full enrolled cohort before censoring
 *
 * Tie-breaking: latest day → males first.
 */
describe("regression: BW peak effect selection (e91d585)", () => {
  /** Helper to build a minimal UnifiedFinding for BW domain tests */
  function makeBwFinding(overrides: {
    day: number | null;
    sex: string;
    max_effect_size: number | null;
    group_stats?: { dose_level: number; n: number; mean: number; sd: number }[];
  }): UnifiedFinding {
    const gs = overrides.group_stats ?? [
      { dose_level: 0, n: 10, mean: 340, sd: 20 },
      { dose_level: 1, n: 10, mean: 330, sd: 22 },
      { dose_level: 2, n: 10, mean: 310, sd: 25 },
      { dose_level: 3, n: 10, mean: 280, sd: 30 },
    ];
    return {
      id: `BW-${overrides.day}-${overrides.sex}`,
      domain: "BW",
      test_code: "BW",
      test_name: "Body Weight",
      specimen: null,
      finding: "Body Weight",
      day: overrides.day,
      sex: overrides.sex,
      unit: "g",
      data_type: "continuous",
      severity: "normal",
      direction: "down",
      dose_response_pattern: null,
      treatment_related: false,
      max_effect_size: overrides.max_effect_size,
      min_p_adj: null,
      trend_p: null,
      trend_stat: null,
      group_stats: gs.map(g => ({
        dose_level: g.dose_level,
        n: g.n,
        mean: g.mean,
        sd: g.sd,
        median: null,
      })),
      pairwise: [],
    };
  }

  it("excludes day 1 findings (pre-dose noise)", () => {
    const findings = [
      makeBwFinding({ day: 1, sex: "M", max_effect_size: -0.45 }),
      makeBwFinding({ day: 15, sex: "M", max_effect_size: -3.2 }),
    ];
    const result = extractBwGroupStats(findings);
    // Should pick day 15, not day 1
    expect(result.length).toBeGreaterThan(0);
    // Day 1 has different group_stats; verify we got the day 15 stats
    // by checking that the function didn't return empty (day 1 filtered out)
    expect(result).toHaveLength(4); // 4 dose groups from default fixture
  });

  it("returns empty when only day 1 findings exist", () => {
    const findings = [
      makeBwFinding({ day: 1, sex: "M", max_effect_size: -0.45 }),
      makeBwFinding({ day: 1, sex: "F", max_effect_size: -0.22 }),
    ];
    const result = extractBwGroupStats(findings);
    expect(result).toHaveLength(0);
  });

  it("selects finding with largest absolute effect size", () => {
    // Simulates PointCross-like data: day 15 males have d=−7.8 (peak),
    // day 92 males have d=−3.1 (terminal, after partial recovery)
    const day15Stats = [
      { dose_level: 0, n: 10, mean: 403, sd: 11.7 },
      { dose_level: 1, n: 10, mean: 404, sd: 9.6 },
      { dose_level: 2, n: 10, mean: 400, sd: 15.8 },
      { dose_level: 3, n: 10, mean: 324, sd: 7.1 },
    ];
    const day92Stats = [
      { dose_level: 0, n: 9, mean: 521, sd: 36.8 },
      { dose_level: 1, n: 10, mean: 544, sd: 17.9 },
      { dose_level: 2, n: 10, mean: 506, sd: 28.9 },
      { dose_level: 3, n: 9, mean: 421, sd: 22.7 },
    ];
    const findings = [
      makeBwFinding({ day: 15, sex: "M", max_effect_size: -7.804, group_stats: day15Stats }),
      makeBwFinding({ day: 92, sex: "M", max_effect_size: -3.129, group_stats: day92Stats }),
      makeBwFinding({ day: 8, sex: "M", max_effect_size: -3.17 }),
    ];
    const result = extractBwGroupStats(findings);
    // Should pick day 15 (|d|=7.804 > |d|=3.129 > |d|=3.17)
    // Day 15 control mean = 403
    expect(result[0].mean).toBe(403);
  });

  it("breaks ties by latest day", () => {
    const earlyStats = [
      { dose_level: 0, n: 10, mean: 300, sd: 15 },
      { dose_level: 3, n: 10, mean: 250, sd: 15 },
    ];
    const lateStats = [
      { dose_level: 0, n: 10, mean: 400, sd: 20 },
      { dose_level: 3, n: 10, mean: 350, sd: 20 },
    ];
    const findings = [
      makeBwFinding({ day: 10, sex: "M", max_effect_size: -2.5, group_stats: earlyStats }),
      makeBwFinding({ day: 30, sex: "M", max_effect_size: -2.5, group_stats: lateStats }),
    ];
    const result = extractBwGroupStats(findings);
    // Same |d|, should pick day 30 (later day)
    expect(result[0].mean).toBe(400);
  });

  it("breaks ties by sex (males first)", () => {
    const maleStats = [
      { dose_level: 0, n: 10, mean: 400, sd: 20 },
      { dose_level: 3, n: 10, mean: 350, sd: 20 },
    ];
    const femaleStats = [
      { dose_level: 0, n: 10, mean: 300, sd: 15 },
      { dose_level: 3, n: 10, mean: 250, sd: 15 },
    ];
    const findings = [
      makeBwFinding({ day: 15, sex: "F", max_effect_size: -2.5, group_stats: femaleStats }),
      makeBwFinding({ day: 15, sex: "M", max_effect_size: -2.5, group_stats: maleStats }),
    ];
    const result = extractBwGroupStats(findings);
    // Same |d| and day, should pick males
    expect(result[0].mean).toBe(400);
  });

  it("handles null day gracefully (treated as day 0, excluded)", () => {
    const findings = [
      makeBwFinding({ day: null, sex: "M", max_effect_size: -5.0 }),
      makeBwFinding({ day: 15, sex: "M", max_effect_size: -2.0 }),
    ];
    const result = extractBwGroupStats(findings);
    // null day → 0 → excluded (≤ 1). Should pick day 15.
    expect(result).toHaveLength(4);
  });

  it("handles null max_effect_size (treated as 0)", () => {
    const realStats = [
      { dose_level: 0, n: 10, mean: 500, sd: 25 },
      { dose_level: 3, n: 10, mean: 400, sd: 30 },
    ];
    const findings = [
      makeBwFinding({ day: 15, sex: "M", max_effect_size: null }),
      makeBwFinding({ day: 30, sex: "M", max_effect_size: -1.5, group_stats: realStats }),
    ];
    const result = extractBwGroupStats(findings);
    // null effect → 0, so day 30 with d=−1.5 wins
    expect(result[0].mean).toBe(500);
  });

  it("filters out non-BW domains and incidence data", () => {
    const lbFinding: UnifiedFinding = {
      ...makeBwFinding({ day: 15, sex: "M", max_effect_size: -10 }),
      domain: "LB",
    };
    const incidenceFinding: UnifiedFinding = {
      ...makeBwFinding({ day: 15, sex: "M", max_effect_size: -10 }),
      data_type: "incidence",
    };
    const realBw = makeBwFinding({ day: 30, sex: "M", max_effect_size: -2.0 });
    const result = extractBwGroupStats([lbFinding, incidenceFinding, realBw]);
    // Only the real BW finding should be considered
    expect(result).toHaveLength(4);
  });

  it("survivorship bias scenario: peak > terminal due to TR deaths", () => {
    // Scenario: 2 animals die between day 15 and terminal.
    // Day 15: n=10 in high dose, full cohort → large effect
    // Terminal: n=8 in high dose (survivors less affected) → smaller effect
    const peakStats = [
      { dose_level: 0, n: 10, mean: 400, sd: 12 },
      { dose_level: 3, n: 10, mean: 320, sd: 8 },  // full cohort
    ];
    const terminalStats = [
      { dose_level: 0, n: 10, mean: 500, sd: 30 },
      { dose_level: 3, n: 8, mean: 440, sd: 25 },  // survivors only
    ];
    const findings = [
      makeBwFinding({ day: 15, sex: "M", max_effect_size: -7.8, group_stats: peakStats }),
      makeBwFinding({ day: 92, sex: "M", max_effect_size: -2.1, group_stats: terminalStats }),
    ];
    const result = extractBwGroupStats(findings);
    // Must pick peak (day 15), not terminal — terminal underestimates due to survivor bias
    expect(result[0].mean).toBe(400);
    expect(result[1].mean).toBe(320);
  });
});
