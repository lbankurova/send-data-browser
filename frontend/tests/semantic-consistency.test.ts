/**
 * Semantic Consistency Tests
 *
 * Automated tests that catch logical contradictions between syndrome detection,
 * term matching, and interpretation. These run in CI and prevent regressions.
 *
 * Context: 8 bugs shipped in XS09 because tests verified structure (valid types,
 * no dupes) but not semantic correctness. A review found 5 logic-level issues:
 *   - Direction mismatch (KIDNEY WEIGHT)
 *   - Misleading dose-response label
 *   - Conflated NOAEL cap
 *   - Missing CL support explanation
 *   - Unlabeled effect sizes
 *
 * These tests catch the *class* of contradiction, not just specific instances.
 */
import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import {
  detectCrossDomainSyndromes,
  getSyndromeTermReport,
  getSyndromeDefinition,
} from "@/lib/cross-domain-syndromes";
import type {
  CrossDomainSyndrome,
  SyndromeTermReport,
  TermReportEntry,
} from "@/lib/cross-domain-syndromes";
import {
  computeTreatmentRelatedness,
  assessClinicalObservationSupport,
} from "@/lib/syndrome-interpretation";
import type {
  ClinicalObservation,
  ClinicalObservationSupport,
  FoodConsumptionSummaryResponse,
} from "@/lib/syndrome-interpretation";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";

import fixture from "./fixtures/pointcross-findings.json";

// ─── Setup ───────────────────────────────────────────────────

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const syndromes = detectCrossDomainSyndromes(endpoints);
const byId = new Map(syndromes.map((s) => [s.id, s]));

const noClSupport: ClinicalObservationSupport = {
  correlatingObservations: [],
  assessment: "no_cl_data",
};

// ─── Helpers ─────────────────────────────────────────────────

/** Extract the expected direction from a term entry label (↑ = up, ↓ = down) */
function labelDirection(label: string): "up" | "down" | "any" {
  if (label.includes("↑")) return "up";
  if (label.includes("↓")) return "down";
  return "any";
}

/** Collect all term report entries (required + supporting) */
function allEntries(report: SyndromeTermReport): TermReportEntry[] {
  return [...report.requiredEntries, ...report.supportingEntries];
}

// ─── Test 1: Term-endpoint direction coherence ───────────────

describe("Test 1: Term-endpoint direction coherence", () => {
  // Known bugs: XS07 (Lymphocytes), XS08 (Lymphocytes sex-divergent: ↓ males, ↑ females).
  // Per-sex detection matches male LYMPH ↓, but aggregate term report sees ↑ → "opposite."
  // When sex-aware term reporting is implemented, remove from KNOWN set.
  // REM-12: XS10 removed by significance gate (no longer detected).
  const KNOWN_OPPOSITE_IN_MATCHED = new Set(["XS07", "XS08"]);

  test.each(syndromes.map((s) => [s.id, s] as const))(
    "%s — opposite-direction endpoints must not appear in matchedEndpoints",
    (_id, syndrome) => {
      const report = getSyndromeTermReport(syndrome.id, endpoints, syndrome.sexes);
      expect(report).not.toBeNull();

      const matchedLabels = new Set(
        syndrome.matchedEndpoints.map((m) => m.endpoint_label),
      );

      // Opposite-direction terms should NOT also be in matchedEndpoints
      const oppositeEntries = allEntries(report!).filter(
        (e) => e.status === "opposite",
      );

      const violations: string[] = [];
      for (const entry of oppositeEntries) {
        if (entry.matchedEndpoint && matchedLabels.has(entry.matchedEndpoint)) {
          violations.push(
            `${entry.label}: opposite-direction endpoint "${entry.matchedEndpoint}" is also in matchedEndpoints`,
          );
        }
      }

      if (KNOWN_OPPOSITE_IN_MATCHED.has(syndrome.id)) {
        // TODO: fix detection logic so opposite-direction endpoints are excluded from matchedEndpoints
        // These are known bugs — test documents them. When fixed, remove from KNOWN set.
        if (violations.length > 0) return; // Expected to have violations
        // If a "known bad" syndrome suddenly has no violations, the bug was fixed — remove from set
        expect.fail(`${syndrome.id} no longer has opposite-direction violations — remove from KNOWN_OPPOSITE_IN_MATCHED`);
      }

      if (violations.length > 0) {
        expect.soft(violations).toEqual([]);
      }
    },
  );

  test.each(syndromes.map((s) => [s.id, s] as const))(
    "%s — matched terms have consistent direction",
    (_id, syndrome) => {
      const report = getSyndromeTermReport(syndrome.id, endpoints, syndrome.sexes);
      expect(report).not.toBeNull();

      const matchedEntries = allEntries(report!).filter(
        (e) => e.status === "matched",
      );

      const violations: string[] = [];
      for (const entry of matchedEntries) {
        const termDir = labelDirection(entry.label);
        if (termDir === "any") continue; // Any direction is fine

        if (entry.foundDirection && entry.foundDirection !== termDir) {
          violations.push(
            `${entry.label}: term expects ${termDir}, endpoint found ${entry.foundDirection}`,
          );
        }
      }

      if (violations.length > 0) {
        expect.soft(violations).toEqual([]);
      }
    },
  );
});

// ─── Test 2: Dose-response label vs individual endpoint strength ──

describe("Test 2: Dose-response label vs individual endpoint strength", () => {
  test.each(syndromes.map((s) => [s.id, s] as const))(
    "%s — weak doseResponse must not have strongly monotonic endpoints",
    (_id, syndrome) => {
      const clSupport = assessClinicalObservationSupport(syndrome.id, []);
      const relatedness = computeTreatmentRelatedness(
        syndrome,
        endpoints,
        clSupport,
      );

      if (relatedness.doseResponse !== "weak") return; // Only check weak ratings

      const matchedLabels = new Set(
        syndrome.matchedEndpoints.map((m) => m.endpoint_label),
      );
      const matchedEps = endpoints.filter((ep) =>
        matchedLabels.has(ep.endpoint_label),
      );

      const anomalies: string[] = [];
      for (const ep of matchedEps) {
        const isMonotonic =
          ep.pattern.includes("monotonic") || ep.pattern === "linear";
        const strongEffect =
          ep.maxEffectSize != null && Math.abs(ep.maxEffectSize) > 2.0;
        const highlySignificant =
          ep.minPValue != null && ep.minPValue < 0.001;

        if (isMonotonic && strongEffect && highlySignificant) {
          anomalies.push(
            `${ep.endpoint_label}: pattern=${ep.pattern}, |d|=${Math.abs(ep.maxEffectSize!).toFixed(2)}, p=${ep.minPValue!.toFixed(6)} — too strong for "weak" overall`,
          );
        }
      }

      // This may correctly identify a known logic gap — annotated with skip if needed
      if (anomalies.length > 0) {
        expect.soft(anomalies).toEqual([]);
      }
    },
  );
});

// ─── Test 3: Opposite-direction endpoints flagged in term report ──

describe("Test 3: Opposite-direction endpoints flagged in term report", () => {
  test.each(syndromes.map((s) => [s.id, s] as const))(
    "%s — opposite-direction supporting matches have oppositeCount > 0",
    (_id, syndrome) => {
      const report = getSyndromeTermReport(syndrome.id, endpoints, syndrome.sexes);
      expect(report).not.toBeNull();

      const oppositeEntries = allEntries(report!).filter(
        (e) => e.status === "opposite",
      );

      if (oppositeEntries.length === 0) return; // No opposite entries to check

      // If there are opposite entries, oppositeCount must reflect them
      expect(report!.oppositeCount).toBe(oppositeEntries.length);
    },
  );
});

// ─── Test 4: CL correlates coverage ─────────────────────────

describe("Test 4: CL correlates coverage", () => {
  // Syndromes known to have CL correlates (from SYNDROME_CL_CORRELATES)
  // We test that when synthetic matching CL observations exist, assessClinicalObservationSupport
  // correctly returns "strengthens" — verifying the gate logic works.
  const CL_CORRELATE_MAP: Record<string, string[]> = {
    XS01: ["JAUNDICE", "DARK URINE"],
    XS03: ["POLYURIA", "POLYDIPSIA"],
    XS04: ["PALLOR", "PETECHIAE"],
    XS05: ["PALLOR", "DARK URINE"],
    XS08: ["PILOERECTION", "DECREASED ACTIVITY", "CHROMODACRYORRHEA"],
    XS09: ["EMACIATION", "THIN", "DECREASED ACTIVITY", "HUNCHED POSTURE"],
    XS10: ["BRADYCARDIA", "TACHYCARDIA", "ARRHYTHMIA", "DYSPNEA"],
  };

  /** Create synthetic dose-dependent CL observations for a given observation term */
  function makeDoseDependentCL(observation: string): ClinicalObservation[] {
    // 3 dose groups with increasing incidence — satisfies isDoseDependentCL()
    return [
      { observation, doseGroup: 0, sex: "M", incidence: 0, totalN: 10 },
      { observation, doseGroup: 1, sex: "M", incidence: 2, totalN: 10 },
      { observation, doseGroup: 2, sex: "M", incidence: 5, totalN: 10 },
      { observation, doseGroup: 3, sex: "M", incidence: 8, totalN: 10 },
    ];
  }

  for (const [syndromeId, expectedObs] of Object.entries(CL_CORRELATE_MAP)) {
    test(`${syndromeId} — CL correlates produce "strengthens" when matching observations present`, () => {
      // Create synthetic CL observations for all expected terms
      const clObs = expectedObs.flatMap((obs) => makeDoseDependentCL(obs));

      const result = assessClinicalObservationSupport(syndromeId, clObs);
      expect(result.assessment).toBe("strengthens");
      expect(result.correlatingObservations.length).toBeGreaterThan(0);
    });

    test(`${syndromeId} — empty CL returns "no_cl_data"`, () => {
      const result = assessClinicalObservationSupport(syndromeId, []);
      expect(result.assessment).toBe("no_cl_data");
    });
  }

  // Verify syndromes WITHOUT CL correlates return no_cl_data even with observations
  const allSyndromeIds = syndromes.map((s) => s.id);
  const withoutCorrelates = allSyndromeIds.filter(
    (id) => !(id in CL_CORRELATE_MAP),
  );

  if (withoutCorrelates.length > 0) {
    test.each(withoutCorrelates)(
      "%s — no CL correlates defined, always returns no_cl_data",
      (syndromeId) => {
        const clObs = makeDoseDependentCL("SOME OBSERVATION");
        const result = assessClinicalObservationSupport(syndromeId, clObs);
        expect(result.assessment).toBe("no_cl_data");
      },
    );
  }
});

// ─── Test 5: doseResponse derived from endpoint patterns ─────

describe("Test 5: doseResponse derivation is pattern-based", () => {
  /**
   * Verifies that computeTreatmentRelatedness derives doseResponse from actual
   * endpoint dose-response patterns (not from syndrome.confidence). The mapping:
   *   - "strong": at least one matched endpoint has a strong pattern (monotonic,
   *     threshold, linear) with p < 0.05
   *   - "weak": at least one matched endpoint has a non-flat, non-insufficient pattern
   *   - "absent": all matched endpoints are flat or insufficient_data
   */

  const STRONG_PATTERNS = new Set([
    "linear", "monotonic", "threshold", "threshold_increase", "threshold_decrease",
  ]);

  test.each(syndromes.map((s) => [s.id, s] as const))(
    "%s — doseResponse rating matches endpoint pattern analysis",
    (_id, syndrome) => {
      const clSupport = assessClinicalObservationSupport(syndrome.id, []);
      const result = computeTreatmentRelatedness(syndrome, endpoints, clSupport);

      // Reconstruct expected doseResponse from raw endpoint data
      const matchedLabels = new Set(
        syndrome.matchedEndpoints.map((m) => m.endpoint_label),
      );
      const matchedEps = endpoints.filter((ep) =>
        matchedLabels.has(ep.endpoint_label),
      );

      const hasStrongPattern = matchedEps.some(
        (ep) =>
          STRONG_PATTERNS.has(ep.pattern) &&
          ep.minPValue != null &&
          ep.minPValue < 0.05,
      );
      const hasAnyPattern = matchedEps.some(
        (ep) => ep.pattern !== "flat" && ep.pattern !== "insufficient_data",
      );

      const expected = hasStrongPattern
        ? "strong"
        : hasAnyPattern
          ? "weak"
          : "absent";

      expect(result.doseResponse).toBe(expected);
    },
  );

  test("crossEndpoint concordance reflects domain count", () => {
    for (const syndrome of syndromes) {
      const clSupport = assessClinicalObservationSupport(syndrome.id, []);
      const result = computeTreatmentRelatedness(syndrome, endpoints, clSupport);
      const expected =
        syndrome.domainsCovered.length >= 2 ? "concordant" : "isolated";
      expect(result.crossEndpoint).toBe(expected);
    }
  });
});
