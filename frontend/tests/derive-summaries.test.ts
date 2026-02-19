import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { resolveCanonical } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const rows = fixture as AdverseEffectSummaryRow[];
const summaries = deriveEndpointSummaries(rows);

const KNOWN_ORGANS = new Set([
  "hematologic", "hepatic", "renal", "electrolyte", "metabolic",
  "general", "musculoskeletal", "nervous", "respiratory", "cardiovascular",
  "gastrointestinal", "dermal", "lymphoid", "urogenital", "endocrine", "ocular",
]);

const VALID_DIRECTIONS = new Set(["up", "down", null, undefined]);
const VALID_PATTERNS = new Set([
  "monotonic_increase", "monotonic_decrease",
  "threshold_increase", "threshold_decrease",
  "non_monotonic", "flat", "insufficient_data", null, undefined,
]);

// Organ overrides: LB endpoints with a known test_code must map to their canonical organ
const ORGAN_OVERRIDES: Record<string, string> = {
  ALT: "hepatic", AST: "hepatic", ALP: "hepatic", GGT: "hepatic",
  NEUT: "hematologic", PLAT: "hematologic", HGB: "hematologic",
  RBC: "hematologic", WBC: "hematologic", RETIC: "hematologic", HCT: "hematologic",
  CREAT: "renal", BUN: "renal",
  K: "electrolyte", SODIUM: "electrolyte", CA: "electrolyte",
  GLUC: "metabolic", CHOL: "metabolic", TRIG: "metabolic",
  ALB: "hepatic", TBILI: "hepatic",
};

describe("deriveEndpointSummaries — structural invariants", () => {
  // ── Basic output ──

  test("produces at least 1 endpoint from any non-empty fixture", () => {
    expect(summaries.length).toBeGreaterThan(0);
  });

  test("endpoint count <= unique endpoint_labels in raw data", () => {
    const rawLabels = new Set(rows.map((r) => r.endpoint_label));
    expect(summaries.length).toBeLessThanOrEqual(rawLabels.size);
  });

  // ── Organ system mapping ──

  test("every endpoint has a non-empty organ_system", () => {
    for (const ep of summaries) {
      expect(ep.organ_system, `${ep.endpoint_label} has empty organ_system`).toBeTruthy();
    }
  });

  test("LB endpoints with known test_code map to correct organ via overrides", () => {
    for (const ep of summaries) {
      if (ep.domain !== "LB") continue;
      // Find the raw row's test_code
      const raw = rows.find((r) => r.endpoint_label === ep.endpoint_label && r.domain === "LB");
      if (!raw?.test_code) continue;
      const canonical = resolveCanonical(ep.endpoint_label, raw.test_code);
      if (canonical && ORGAN_OVERRIDES[canonical]) {
        expect(
          ep.organ_system,
          `${ep.endpoint_label} (${canonical}) should be ${ORGAN_OVERRIDES[canonical]}, got ${ep.organ_system}`,
        ).toBe(ORGAN_OVERRIDES[canonical]);
      }
    }
  });

  // ── Direction ──

  test("every endpoint direction is valid (up/down/null)", () => {
    for (const ep of summaries) {
      expect(
        VALID_DIRECTIONS.has(ep.direction),
        `${ep.endpoint_label} has invalid direction "${ep.direction}"`,
      ).toBe(true);
    }
  });

  // ── Pattern ──

  test("every endpoint pattern is a known value", () => {
    for (const ep of summaries) {
      expect(
        VALID_PATTERNS.has(ep.pattern),
        `${ep.endpoint_label} has unknown pattern "${ep.pattern}"`,
      ).toBe(true);
    }
  });

  // ── Fold change ──

  test("fold changes are positive and reasonable (not Cohen's d)", () => {
    for (const ep of summaries) {
      if (ep.maxFoldChange == null) continue;
      expect(ep.maxFoldChange, `${ep.endpoint_label} fold change should be > 0`).toBeGreaterThan(0);
      // Fold changes above 10× are extremely rare in tox studies — flag as suspicious
      expect(ep.maxFoldChange, `${ep.endpoint_label} fold change ${ep.maxFoldChange} is suspiciously high`).toBeLessThan(20);
    }
  });

  test("continuous LB endpoints have fold change < 6 (not Cohen's d)", () => {
    // Cohen's d can be 2-3 when fold change is ~1.2-1.5. Any LB fold >= 6 is suspicious.
    // Basophils (5x) and Ketones (5.33x) legitimately exceed 5 due to low baselines.
    for (const ep of summaries) {
      if (ep.domain !== "LB" || ep.maxFoldChange == null) continue;
      expect(
        ep.maxFoldChange,
        `${ep.endpoint_label} LB fold change ${ep.maxFoldChange} looks like Cohen's d`,
      ).toBeLessThan(6);
    }
  });

  // ── Severity ──

  test("every endpoint severity is valid", () => {
    for (const ep of summaries) {
      expect(["adverse", "warning", "normal"]).toContain(ep.worstSeverity);
    }
  });

  // ── Sexes ──

  test("sexes array contains only valid values", () => {
    for (const ep of summaries) {
      for (const sex of ep.sexes) {
        expect(["M", "F"]).toContain(sex);
      }
    }
  });

  // ── Direction-aligned fold change (cross-sex fix) ──

  test("fold change < 1.0 for ↓ endpoints with group stats", () => {
    // Endpoints with direction="down" and controlStats/worstTreatedStats should
    // have FC < 1.0 (treated mean < control mean). This verifies the cross-sex
    // alignment fix — previously some ↓ endpoints showed FC > 1.0 because
    // group stats came from a different sex than the one that set direction.
    for (const ep of summaries) {
      if (ep.direction !== "down" || ep.maxFoldChange == null) continue;
      if (!ep.controlStats || !ep.worstTreatedStats) continue;
      expect(
        ep.maxFoldChange,
        `${ep.endpoint_label} (↓) has FC=${ep.maxFoldChange} — should be < 1.0`,
      ).toBeLessThan(1.0);
    }
  });

  test("fold change > 1.0 for ↑ endpoints with group stats", () => {
    for (const ep of summaries) {
      if (ep.direction !== "up" || ep.maxFoldChange == null) continue;
      if (!ep.controlStats || !ep.worstTreatedStats) continue;
      expect(
        ep.maxFoldChange,
        `${ep.endpoint_label} (↑) has FC=${ep.maxFoldChange} — should be > 1.0`,
      ).toBeGreaterThan(1.0);
    }
  });

  // ── Per-organ group stats uniqueness ──

  test("different OM organs have different control group stats", () => {
    const omEndpoints = summaries.filter(
      (ep) => ep.domain === "OM" && ep.controlStats != null,
    );
    // Group by control mean to find sharing
    const byMean = new Map<number, string[]>();
    for (const ep of omEndpoints) {
      const mean = ep.controlStats!.mean;
      const key = Math.round(mean * 10000); // group by rounded value
      if (!byMean.has(key)) byMean.set(key, []);
      byMean.get(key)!.push(ep.endpoint_label);
    }
    // No more than 1 organ should share the same control mean
    // (different organs have genuinely different weights)
    for (const [, labels] of byMean) {
      expect(
        labels.length,
        `OM organs sharing control mean: ${labels.join(", ")}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  // ── Cross-sex groupStats alignment ──

  test("groupStats control mean aligns with direction (cross-sex coherence)", () => {
    // For multi-sex endpoints where direction is set, the worstTreatedStats
    // should deviate from control in the direction's expected way.
    for (const ep of summaries) {
      if (!ep.controlStats || !ep.worstTreatedStats || ep.direction == null) continue;
      const dev = ep.worstTreatedStats.mean - ep.controlStats.mean;
      if (ep.direction === "down") {
        expect(
          dev,
          `${ep.endpoint_label} (↓) worst treated should be below control`,
        ).toBeLessThan(0);
      } else if (ep.direction === "up") {
        expect(
          dev,
          `${ep.endpoint_label} (↑) worst treated should be above control`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
