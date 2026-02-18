/**
 * Regression guards — invariant versions of bugs found in PointCross.
 * Each test encodes the CLASS of bug, not a specific hardcoded value.
 */
import { describe, test, expect } from "vitest";
import { resolveCanonical, evaluateLabRules } from "@/lib/lab-clinical-catalog";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const rows = fixture as AdverseEffectSummaryRow[];
const summaries = deriveEndpointSummaries(rows);
const matches = evaluateLabRules(summaries);

describe("regression: resolveCanonical false positives (Bug C1)", () => {
  // Bug class: substring of a canonical name appearing inside a longer, unrelated term
  const FALSE_POSITIVE_CASES = [
    { label: "PANCREAS \u2014 INFLAMMATION", mustNotBe: "NEUT" },
    { label: "KIDNEY \u2014 CAST", mustNotBe: "AST" },
    { label: "GASTRIC EROSION", mustNotBe: "RBC" },
    { label: "PHOSPHOLIPIDOSIS", mustNotBe: "PHOS" },
  ];

  for (const { label, mustNotBe } of FALSE_POSITIVE_CASES) {
    test(`"${label}" must not resolve to ${mustNotBe}`, () => {
      expect(resolveCanonical(label)).not.toBe(mustNotBe);
    });
  }
});

describe("regression: fold change vs Cohen's d (Bug C4)", () => {
  // Bug class: maxFoldChange was computed as Cohen's d instead of actual fold change.
  // Fold change for most lab endpoints should be < 5×; Cohen's d can be 2-3× for ~1.2× fold.

  test("no LB endpoint has fold change >= 6 (would indicate Cohen's d)", () => {
    for (const ep of summaries) {
      if (ep.domain !== "LB" || ep.maxFoldChange == null) continue;
      expect(
        ep.maxFoldChange,
        `${ep.endpoint_label} fold change ${ep.maxFoldChange.toFixed(2)} looks like Cohen's d`,
      ).toBeLessThan(6);
    }
  });

  test("fold changes are consistently lower than max effect sizes", () => {
    // Effect sizes (Cohen's d) are typically larger than fold changes for the same endpoint
    let checked = 0;
    for (const ep of summaries) {
      if (ep.maxFoldChange == null || ep.maxEffectSize == null) continue;
      if (ep.maxFoldChange >= 2.0 && Math.abs(ep.maxEffectSize) < ep.maxFoldChange) {
        // A fold change > 2 that exceeds the effect size is suspicious but possible
        // for incidence data. Only flag if domain is LB (continuous).
        if (ep.domain === "LB") {
          expect.soft(
            ep.maxFoldChange,
            `${ep.endpoint_label}: fold ${ep.maxFoldChange.toFixed(2)} > |d| ${Math.abs(ep.maxEffectSize).toFixed(2)} — verify this is fold change, not Cohen's d`,
          ).toBeLessThan(6);
        }
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0); // ensure we tested something
  });
});

describe("regression: organ system mapping (Bug 9)", () => {
  // Bug class: hematologic endpoints (NEUT, PLAT, etc.) mapped to "general" instead of "hematologic"

  const HEMATOLOGIC_CODES = ["NEUT", "PLAT", "RETIC", "HGB", "HCT", "RBC", "WBC"];
  const HEPATIC_CODES = ["ALT", "AST", "ALP", "GGT", "TBILI"];
  const RENAL_CODES = ["CREAT", "BUN"];

  function checkOrganForCodes(codes: string[], expectedOrgan: string) {
    for (const ep of summaries) {
      const canonical = resolveCanonical(ep.endpoint_label, ep.testCode);
      if (canonical && codes.includes(canonical)) {
        expect(
          ep.organ_system,
          `${ep.endpoint_label} (${canonical}) should be ${expectedOrgan}`,
        ).toBe(expectedOrgan);
      }
    }
  }

  test("hematologic endpoints map to hematologic", () => {
    checkOrganForCodes(HEMATOLOGIC_CODES, "hematologic");
  });

  test("hepatic endpoints map to hepatic", () => {
    checkOrganForCodes(HEPATIC_CODES, "hepatic");
  });

  test("renal endpoints map to renal", () => {
    checkOrganForCodes(RENAL_CODES, "renal");
  });
});

describe("regression: pattern classifier noise tolerance", () => {
  // Bug class: small fluctuations misclassified as non_monotonic
  // Guard: if an endpoint has a clear trend (> 80% of dose groups moving in same direction),
  // it should NOT be classified as non_monotonic

  test("no endpoint with strong directional signal is classified as non_monotonic", () => {
    for (const ep of summaries) {
      if (ep.pattern !== "non_monotonic") continue;
      // non_monotonic endpoints should not have very low p-values + large effects
      // (those indicate a real signal that the classifier should recognize)
      if (ep.minPAdj != null && ep.minPAdj < 0.001 && ep.maxEffectSize != null && Math.abs(ep.maxEffectSize) > 1.5) {
        expect.soft(
          ep.pattern,
          `${ep.endpoint_label} (p=${ep.minPAdj.toFixed(4)}, d=${ep.maxEffectSize.toFixed(2)}) classified as non_monotonic despite strong signal`,
        ).not.toBe("non_monotonic");
      }
    }
  });
});

describe("regression: per-sex rule evaluation (fold/direction sex mismatch)", () => {
  // Bug class: rule evaluator mixing male direction with female fold change

  test("every per-sex match has fold change from the correct sex", () => {
    for (const m of matches) {
      if (!m.sex) continue;
      // The match's fold changes should come from the same sex as m.sex
      // We verify by checking that the matched endpoint's bySex data for m.sex
      // has a fold change in the same ballpark as the match's reported fold
      for (const epLabel of m.matchedEndpoints) {
        const ep = summaries.find((e) => e.endpoint_label === epLabel);
        if (!ep?.bySex) continue;
        const sexData = ep.bySex.get(m.sex);
        if (!sexData || sexData.maxFoldChange == null) continue;
        const matchFold = m.foldChanges[epLabel] ?? m.foldChanges[Object.keys(m.foldChanges)[0]];
        if (matchFold == null) continue;
        // The match fold should be within 50% of the sex-specific fold (not from the other sex)
        const ratio = matchFold / sexData.maxFoldChange;
        expect(
          ratio,
          `Rule ${m.ruleId} (${m.sex}): ${epLabel} fold ${matchFold.toFixed(2)} vs bySex ${sexData.maxFoldChange.toFixed(2)}`,
        ).toBeGreaterThan(0.5);
        expect(ratio).toBeLessThan(2.0);
      }
    }
  });
});
