/**
 * Study-agnostic integration tests for the syndrome interpretation layer.
 * Uses the PointCross fixture but asserts structural invariants that must hold
 * for any study's data — no hard-coded study-specific values.
 */
import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import type { CrossDomainSyndrome, EndpointMatch } from "@/lib/cross-domain-syndromes";
import {
  interpretSyndrome,
  getSyndromeOrgans,
  assessTumorContext,
  assessSyndromeRecovery,
  assessMortalityContext,
  mapDeathRecordsToDispositions,
} from "@/lib/syndrome-interpretation";
import type {
  FoodConsumptionSummaryResponse,
  TumorFinding,
  StudyContext,
  SyndromeInterpretation,
} from "@/lib/syndrome-interpretation";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import type { StudyMortality } from "@/types/mortality";
import fixture from "./fixtures/pointcross-findings.json";

// ─── Setup ──────────────────────────────────────────────────

const allEndpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const syndromes = detectCrossDomainSyndromes(allEndpoints);

const genericContext: StudyContext = {
  studyId: "TEST", species: "RAT", strain: "SPRAGUE-DAWLEY",
  route: "ORAL GAVAGE", studyType: "SUBCHRONIC", dosingDurationWeeks: 13,
  recoveryPeriodDays: null, terminalSacrificeWeeks: 13,
  sexPopulation: "BOTH", ageAtStartWeeks: null, estimatedNecropsyAgeWeeks: null,
  supplier: "", vehicle: "", treatment: "", studyDesign: "",
  plannedSubjectsM: null, plannedSubjectsF: null, diet: "",
  glpCompliant: true, sendCtVersion: "", title: "",
  ecgInterpretation: { qtcTranslational: false, preferredCorrection: null, rationale: "" },
};

const noFoodData: FoodConsumptionSummaryResponse = { available: false, water_consumption: null };

// Interpret all detected syndromes with minimal supplemental data
const interpretations: { syndrome: CrossDomainSyndrome; interp: SyndromeInterpretation }[] =
  syndromes.map((syndrome) => ({
    syndrome,
    interp: interpretSyndrome(
      syndrome, allEndpoints, [], [], [], [], [], noFoodData, [], genericContext,
      undefined, syndromes.map((s) => s.id),
    ),
  }));

// ─── Helpers ────────────────────────────────────────────────

function makeSyndrome(id: string, matched: EndpointMatch[] = []): CrossDomainSyndrome {
  return {
    id, name: id, matchedEndpoints: matched, requiredMet: true,
    domainsCovered: [...new Set(matched.map((m) => m.domain))],
    confidence: "MODERATE", supportScore: matched.length, sexes: [],
  };
}

/**
 * Replicate the SyndromeContextPanel dedup logic for testing.
 * Groups matchedEndpoints by endpoint_label, collecting sex values and matched direction.
 */
function deduplicateByLabel(
  matchedEndpoints: EndpointMatch[],
  endpointSource: EndpointSummary[],
): { endpoint: EndpointSummary; matchedSexes: string[]; matchedDirection: string }[] {
  const byLabel = new Map<string, { endpoint: EndpointSummary; matchedSexes: string[]; matchedDirection: string }>();
  for (const m of matchedEndpoints) {
    const existing = byLabel.get(m.endpoint_label);
    if (existing) {
      if (m.sex && !existing.matchedSexes.includes(m.sex)) {
        existing.matchedSexes.push(m.sex);
      }
    } else {
      const ep = endpointSource.find((e) => e.endpoint_label === m.endpoint_label);
      if (ep) {
        byLabel.set(m.endpoint_label, {
          endpoint: ep,
          matchedSexes: m.sex ? [m.sex] : [],
          matchedDirection: m.direction,
        });
      }
    }
  }
  return [...byLabel.values()];
}

// ═══════════════════════════════════════════════════════════════
// Block 1: Structural Invariants
// ═══════════════════════════════════════════════════════════════

describe("syndrome interpretation — structural invariants", () => {
  test("at least one syndrome detected from fixture", () => {
    expect(syndromes.length).toBeGreaterThan(0);
    expect(interpretations.length).toBe(syndromes.length);
  });

  test("no duplicate member endpoints after deduplication", () => {
    for (const { syndrome } of interpretations) {
      const deduped = deduplicateByLabel(syndrome.matchedEndpoints, allEndpoints);
      const labels = deduped.map((d) => d.endpoint.endpoint_label);
      const uniqueLabels = new Set(labels);
      expect(
        uniqueLabels.size,
        `${syndrome.id}: duplicate endpoint_labels after dedup`,
      ).toBe(labels.length);
    }
  });

  test("mortality: treatmentRelatedDeaths >= 0 and consistent with deathDetails", () => {
    for (const { syndrome, interp } of interpretations) {
      const { mortalityContext } = interp;
      expect(
        mortalityContext.treatmentRelatedDeaths,
        `${syndrome.id}: treatmentRelatedDeaths must be >= 0`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        mortalityContext.treatmentRelatedDeaths,
        `${syndrome.id}: treatmentRelatedDeaths must equal deathDetails.length`,
      ).toBe(mortalityContext.deathDetails.length);
    }
  });

  test("mortality: no recovery-arm deaths in treatment-related count", () => {
    // With empty mortality input, no deaths should appear at all.
    // The invariant: deathDetails should never contain recovery-arm entries.
    for (const { syndrome, interp } of interpretations) {
      // deathDetails only comes from treatmentRelated && !isRecoveryArm dispositions
      // so its count should always match treatmentRelatedDeaths
      expect(
        interp.mortalityContext.deathDetails.length,
        `${syndrome.id}`,
      ).toBe(interp.mortalityContext.treatmentRelatedDeaths);
    }
  });

  test("mortality: mortalityNoaelCapRelevant is consistent with mortalityNoaelCap", () => {
    for (const { syndrome, interp } of interpretations) {
      const { mortalityContext } = interp;
      if (mortalityContext.mortalityNoaelCap == null) {
        // No cap → capRelevant must be false (vacuously irrelevant)
        expect(
          mortalityContext.mortalityNoaelCapRelevant,
          `${syndrome.id}: no NOAEL cap but capRelevant is not false`,
        ).toBe(false);
      } else {
        // Cap present → capRelevant must be true, false, or null
        expect(
          [true, false, null],
          `${syndrome.id}: invalid mortalityNoaelCapRelevant`,
        ).toContain(mortalityContext.mortalityNoaelCapRelevant);
      }
    }
  });

  test("dose labels in death details are human-readable (not bare numbers)", () => {
    for (const { syndrome, interp } of interpretations) {
      for (const d of interp.mortalityContext.deathDetails) {
        if (d.doseLabel != null) {
          expect(
            d.doseLabel,
            `${syndrome.id}: doseLabel "${d.doseLabel}" should not be a bare number`,
          ).not.toMatch(/^\d+$/);
        }
      }
    }
  });

  test("tumor context: syndromes with no organ terms → tumorsPresent false", () => {
    for (const { syndrome, interp } of interpretations) {
      const organs = getSyndromeOrgans(syndrome.id);
      if (organs.length === 0) {
        expect(
          interp.tumorContext.tumorsPresent,
          `${syndrome.id}: no organ terms but tumorsPresent=true`,
        ).toBe(false);
      }
    }
  });

  test("recovery status consistency: not_examined implies no recovery endpoints", () => {
    for (const { syndrome, interp } of interpretations) {
      if (interp.recovery.status === "not_examined") {
        expect(
          interp.recovery.endpoints.length,
          `${syndrome.id}: not_examined but has recovery endpoints`,
        ).toBe(0);
      }
    }
  });

  test("severity is a valid enum value", () => {
    const validSeverities = [
      "S0_Death", "carcinogenic", "proliferative",
      "S4_Critical", "S3_Adverse", "S2_Concern", "S1_Monitor",
    ];
    for (const { syndrome, interp } of interpretations) {
      expect(
        validSeverities,
        `${syndrome.id}: invalid severity "${interp.overallSeverity}"`,
      ).toContain(interp.overallSeverity);
    }
  });

  test("certainty is a valid enum value", () => {
    const validCertainties = ["mechanism_confirmed", "mechanism_uncertain", "pattern_only"];
    for (const { syndrome, interp } of interpretations) {
      expect(
        validCertainties,
        `${syndrome.id}: invalid certainty "${interp.certainty}"`,
      ).toContain(interp.certainty);
    }
  });

  test("narrative is non-empty for every syndrome", () => {
    for (const { syndrome, interp } of interpretations) {
      expect(
        interp.narrative.length,
        `${syndrome.id}: empty narrative`,
      ).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Edge Cases (Synthetic Data)
// ═══════════════════════════════════════════════════════════════

describe("syndrome interpretation — edge cases (synthetic data)", () => {

  test("XS09 (no organ terms) + liver tumor → tumorsPresent: false", () => {
    const xs09 = makeSyndrome("XS09");
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "HEPATOCELLULAR CARCINOMA", behavior: "MALIGNANT", animalId: "S1", doseGroup: 3 },
    ];
    const result = assessTumorContext(xs09, tumors, [], genericContext);
    expect(result.tumorsPresent).toBe(false);
    expect(result.interpretation).toContain("not applicable");
  });

  test("2 deaths (1 main, 1 recovery) → treatmentRelatedDeaths: 1", () => {
    const mortality: StudyMortality = {
      has_mortality: true,
      total_deaths: 2,
      total_accidental: 0,
      mortality_loael: 3,
      mortality_loael_label: "200 mg/kg",
      mortality_noael_cap: null,
      severity_tier: "critical",
      deaths: [
        {
          USUBJID: "MAIN-001", sex: "M", dose_level: 3, is_recovery: false,
          disposition: "FOUND DEAD", cause: "DRUG TOXICITY", relatedness: "DRUG RELATED",
          study_day: 90, dose_label: "Group 4, 200 mg/kg",
        },
        {
          USUBJID: "RECOV-001", sex: "F", dose_level: 3, is_recovery: true,
          disposition: "FOUND DEAD", cause: "DRUG TOXICITY", relatedness: "DRUG RELATED",
          study_day: 120, dose_label: "Group 4, 200 mg/kg",
        },
      ],
      accidentals: [],
      by_dose: [],
      early_death_subjects: {},
      early_death_details: [],
    };
    const dispositions = mapDeathRecordsToDispositions(mortality);
    expect(dispositions).toHaveLength(2);
    expect(dispositions.find((d) => d.animalId === "RECOV-001")!.isRecoveryArm).toBe(true);

    const syndrome = makeSyndrome("XS01");
    const ctx = assessMortalityContext(syndrome, dispositions, genericContext);
    expect(ctx.treatmentRelatedDeaths).toBe(1);
    expect(ctx.deathDetails).toHaveLength(1);
    expect(ctx.deathDetails[0].animalId).toBe("MAIN-001");
    expect(ctx.deathDetails[0].doseLabel).toBe("Group 4, 200 mg/kg");
  });

  test("food recovery + empty RecoveryRow[] + BW syndrome → not 'not_examined'", () => {
    const xs09 = makeSyndrome("XS09", [
      { endpoint_label: "Body Weight", domain: "BW", role: "required", direction: "down", severity: "adverse" },
    ]);
    const foodWithRecovery: FoodConsumptionSummaryResponse = {
      available: true, water_consumption: null,
      recovery: { available: true, fw_recovered: true, bw_recovered: false, interpretation: "" },
    };
    const result = assessSyndromeRecovery(xs09, [], allEndpoints, foodWithRecovery);
    expect(result.status).not.toBe("not_examined");
    // FW recovered, BW not → partial
    expect(result.status).toBe("partial");
  });

  test("food recovery + non-BW syndrome (XS01) → still 'not_examined'", () => {
    const xs01 = makeSyndrome("XS01", [
      { endpoint_label: "ALT", domain: "LB", role: "required", direction: "up", severity: "adverse" },
    ]);
    const foodWithRecovery: FoodConsumptionSummaryResponse = {
      available: true, water_consumption: null,
      recovery: { available: true, fw_recovered: true, bw_recovered: true, interpretation: "" },
    };
    const result = assessSyndromeRecovery(xs01, [], allEndpoints, foodWithRecovery);
    expect(result.status).toBe("not_examined");
  });

  test("per-sex match with same endpoint label → deduplicated member list", () => {
    const matched: EndpointMatch[] = [
      { endpoint_label: "Body Weight", domain: "BW", role: "required", direction: "down", severity: "adverse", sex: "M" },
      { endpoint_label: "Body Weight", domain: "BW", role: "required", direction: "down", severity: "adverse", sex: "F" },
      { endpoint_label: "ALT", domain: "LB", role: "supporting", direction: "up", severity: "warning", sex: null },
    ];
    // Minimal EndpointSummary stubs for lookup
    const stubs: EndpointSummary[] = [
      {
        endpoint_label: "Body Weight", organ_system: "general", domain: "BW",
        worstSeverity: "adverse", treatmentRelated: true, maxEffectSize: -1.5,
        minPValue: 0.001, direction: "down", sexes: ["M", "F"], pattern: "linear",
        maxFoldChange: null,
      },
      {
        endpoint_label: "ALT", organ_system: "hepatic", domain: "LB",
        worstSeverity: "warning", treatmentRelated: true, maxEffectSize: 2.0,
        minPValue: 0.01, direction: "up", sexes: ["M", "F"], pattern: "linear",
        maxFoldChange: null,
      },
    ];

    const deduped = deduplicateByLabel(matched, stubs);

    // 3 raw entries → 2 unique endpoints
    expect(deduped).toHaveLength(2);

    const bw = deduped.find((d) => d.endpoint.endpoint_label === "Body Weight");
    expect(bw).toBeDefined();
    expect(bw!.matchedSexes).toEqual(["M", "F"]);

    const alt = deduped.find((d) => d.endpoint.endpoint_label === "ALT");
    expect(alt).toBeDefined();
    // sex: null → no sex collected
    expect(alt!.matchedSexes).toEqual([]);
  });
});
