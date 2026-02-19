import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { evaluateLabRules } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const matches = evaluateLabRules(endpoints);

describe("evaluateLabRules — structural invariants", () => {
  test("returns an array (possibly empty if no rules fire)", () => {
    expect(Array.isArray(matches)).toBe(true);
  });

  test("every match has a valid ruleId (starts with L)", () => {
    for (const m of matches) {
      expect(m.ruleId, `unexpected ruleId format: ${m.ruleId}`).toMatch(/^L\d+/);
    }
  });

  test("every match has at least 1 matched endpoint", () => {
    for (const m of matches) {
      expect(
        m.matchedEndpoints.length,
        `Rule ${m.ruleId} fired with 0 matched endpoints`,
      ).toBeGreaterThan(0);
    }
  });

  test("every matched endpoint exists in endpoint summaries", () => {
    const epLabels = new Set(endpoints.map((e) => e.endpoint_label));
    for (const m of matches) {
      for (const label of m.matchedEndpoints) {
        expect(
          epLabels.has(label),
          `Rule ${m.ruleId} references "${label}" not in summaries`,
        ).toBe(true);
      }
    }
  });

  test("every match has a valid severity (S1-S4)", () => {
    for (const m of matches) {
      expect(["S1", "S2", "S3", "S4"]).toContain(m.severity);
    }
  });

  test("S3/S4 rules have adequate evidence (fold > 1.5 or multi-parameter)", () => {
    for (const m of matches) {
      if (m.severity !== "S3" && m.severity !== "S4") continue;
      const foldValues = Object.values(m.foldChanges);
      const maxFold = foldValues.length > 0 ? Math.max(...foldValues) : 0;
      const isMultiParam = m.matchedEndpoints.length >= 2;
      expect(
        maxFold > 1.5 || isMultiParam,
        `Rule ${m.ruleId} (${m.severity}) has max fold ${maxFold.toFixed(2)} and ${m.matchedEndpoints.length} endpoint(s)`,
      ).toBe(true);
    }
  });

  test("per-sex rules have a sex field matching M or F", () => {
    for (const m of matches) {
      if (m.sex) {
        expect(["M", "F"]).toContain(m.sex);
      }
    }
  });

  test("fold changes in matches are positive", () => {
    for (const m of matches) {
      for (const [key, fc] of Object.entries(m.foldChanges)) {
        expect(fc, `Rule ${m.ruleId}: ${key} fold change should be > 0`).toBeGreaterThan(0);
      }
    }
  });

  test("L10 ALP fold change is non-zero when ALP has data", () => {
    const alpEndpoint = endpoints.find(e => e.testCode === "ALP");
    if (!alpEndpoint) return; // ALP not present — skip
    expect(alpEndpoint.maxFoldChange, "ALP aggregate fold change").toBeGreaterThan(0);

    // Check per-sex ALP fold changes
    if (alpEndpoint.bySex) {
      for (const [sex, sexData] of alpEndpoint.bySex) {
        if (sexData.maxFoldChange != null) {
          expect(sexData.maxFoldChange, `ALP sex=${sex} fold change`).toBeGreaterThan(0);
        }
      }
    }

    // Check L10 matches specifically
    const l10Matches = matches.filter(m => m.ruleId === "L10");
    for (const m of l10Matches) {
      const alpFc = m.foldChanges["ALP"];
      expect(
        alpFc,
        `L10 (sex=${m.sex ?? "null"}) should have ALP fold change > 0, got ${alpFc}`,
      ).toBeGreaterThan(0);
    }
  });

  test("L10 ALP fold change is correct with per-dose-level data (live format)", () => {
    // Reproduce live data format: per-dose-level rows with sex-divergent endpoints
    const liveFormatRows: AdverseEffectSummaryRow[] = [
      // ALT — both sexes up (needed for L10)
      { endpoint_label: "Alanine Aminotransferase", endpoint_type: "continuous", domain: "LB", organ_system: "hepatic", dose_level: 1, dose_label: "Low", sex: "F", p_value: 0.01, effect_size: 1.5, direction: "up", severity: "adverse", treatment_related: true, dose_response_pattern: "monotonic_increase", test_code: "ALT", specimen: null, finding: "ALT", max_incidence: null, max_fold_change: 2.1 },
      { endpoint_label: "Alanine Aminotransferase", endpoint_type: "continuous", domain: "LB", organ_system: "hepatic", dose_level: 1, dose_label: "Low", sex: "M", p_value: 0.02, effect_size: 1.2, direction: "up", severity: "adverse", treatment_related: true, dose_response_pattern: "monotonic_increase", test_code: "ALT", specimen: null, finding: "ALT", max_incidence: null, max_fold_change: 1.8 },
      // ALP — both sexes up
      { endpoint_label: "Alkaline Phosphatase", endpoint_type: "continuous", domain: "LB", organ_system: "hepatic", dose_level: 1, dose_label: "Low", sex: "F", p_value: 0.17, effect_size: -0.92, direction: "up", severity: "adverse", treatment_related: true, dose_response_pattern: "non_monotonic", test_code: "ALP", specimen: null, finding: "ALP", max_incidence: null, max_fold_change: 1.52 },
      { endpoint_label: "Alkaline Phosphatase", endpoint_type: "continuous", domain: "LB", organ_system: "hepatic", dose_level: 3, dose_label: "High", sex: "F", p_value: 0.00001, effect_size: 2.94, direction: "up", severity: "adverse", treatment_related: true, dose_response_pattern: "non_monotonic", test_code: "ALP", specimen: null, finding: "ALP", max_incidence: null, max_fold_change: 1.52 },
      { endpoint_label: "Alkaline Phosphatase", endpoint_type: "continuous", domain: "LB", organ_system: "hepatic", dose_level: 1, dose_label: "Low", sex: "M", p_value: 0.34, effect_size: 0.75, direction: "up", severity: "adverse", treatment_related: true, dose_response_pattern: "threshold_increase", test_code: "ALP", specimen: null, finding: "ALP", max_incidence: null, max_fold_change: 1.28 },
      { endpoint_label: "Alkaline Phosphatase", endpoint_type: "continuous", domain: "LB", organ_system: "hepatic", dose_level: 3, dose_label: "High", sex: "M", p_value: 0.018, effect_size: 1.59, direction: "up", severity: "adverse", treatment_related: true, dose_response_pattern: "threshold_increase", test_code: "ALP", specimen: null, finding: "ALP", max_incidence: null, max_fold_change: 1.28 },
      // A sex-divergent endpoint to trigger per-sex contexts
      { endpoint_label: "Neutrophils", endpoint_type: "continuous", domain: "LB", organ_system: "hematologic", dose_level: 1, dose_label: "Low", sex: "M", p_value: 0.05, effect_size: -1.0, direction: "down", severity: "warning", treatment_related: true, dose_response_pattern: "monotonic_decrease", test_code: "NEUT", specimen: null, finding: "Neutrophils", max_incidence: null, max_fold_change: 1.3 },
      { endpoint_label: "Neutrophils", endpoint_type: "continuous", domain: "LB", organ_system: "hematologic", dose_level: 1, dose_label: "Low", sex: "F", p_value: 0.05, effect_size: 1.0, direction: "up", severity: "warning", treatment_related: true, dose_response_pattern: "monotonic_increase", test_code: "NEUT", specimen: null, finding: "Neutrophils", max_incidence: null, max_fold_change: 1.3 },
    ];

    const liveEndpoints = deriveEndpointSummaries(liveFormatRows);
    const liveMatches = evaluateLabRules(liveEndpoints);

    // Per-sex contexts should be generated (Neutrophils diverges)
    const perSexMatches = liveMatches.filter(m => m.sex != null);
    expect(perSexMatches.length, "should have per-sex matches").toBeGreaterThan(0);

    // L10 should fire for both sexes
    const l10Matches = liveMatches.filter(m => m.ruleId === "L10");
    expect(l10Matches.length, "L10 should fire at least once").toBeGreaterThan(0);

    for (const m of l10Matches) {
      const alpFc = m.foldChanges["ALP"];
      expect(
        alpFc,
        `L10 sex=${m.sex}: ALP fold change should be > 0, got ${alpFc}`,
      ).toBeGreaterThan(0);
      expect(
        alpFc,
        `L10 sex=${m.sex}: ALP fold change should be ~1.28-1.52`,
      ).toBeGreaterThanOrEqual(1.0);
    }
  });

  test("per-sex fold changes match endpoint bySex data", () => {
    // For per-sex matches, the fold change should come from the actual endpoint data
    for (const m of matches) {
      if (!m.sex) continue;
      for (const [canonical, fc] of Object.entries(m.foldChanges)) {
        // Find the endpoint for this canonical
        const ep = endpoints.find(e => {
          const testHit = e.testCode?.toUpperCase() === canonical;
          const labelHit = e.endpoint_label.toLowerCase().includes(canonical.toLowerCase());
          return testHit || labelHit;
        });
        if (!ep) continue;
        // If the endpoint has bySex data for this sex, fold change should reflect it
        if (ep.bySex?.has(m.sex)) {
          const sexData = ep.bySex.get(m.sex)!;
          if (sexData.maxFoldChange != null) {
            expect(
              fc,
              `Rule ${m.ruleId} sex=${m.sex} ${canonical}: fold change ${fc} should be > 0 (sexData has ${sexData.maxFoldChange})`,
            ).toBeGreaterThan(0);
          }
        }
        // Aggregate fallback: if no bySex, the aggregate fold change should still be > 0
        if (ep.maxFoldChange != null) {
          expect(
            fc,
            `Rule ${m.ruleId} sex=${m.sex} ${canonical}: fold change ${fc} should be > 0 (aggregate has ${ep.maxFoldChange})`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});
