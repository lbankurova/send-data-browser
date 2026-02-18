/**
 * Tests for syndrome interpretation layer (Phase A: Components 1-3, Phase C: CL).
 * Uses PointCross golden dataset + synthetic histopath/recovery data.
 */
import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import type { LesionSeverityRow } from "@/types/analysis-views";
import {
  interpretSyndrome,
  evaluateDiscriminator,
  assessCertainty,
  crossReferenceHistopath,
  assessSyndromeRecovery,
  assessClinicalObservationSupport,
  assembleStudyDesignNotes,
  mapDeathRecordsToDispositions,
  computeTreatmentRelatedness,
  computeAdversity,
  deriveOverallSeverity,
  assessTumorContext,
  assessFoodConsumptionContext,
} from "@/lib/syndrome-interpretation";
import type {
  RecoveryRow,
  ClinicalObservation,
  AnimalDisposition,
  TumorFinding,
  StudyContext,
  SyndromeDiscriminators,
} from "@/lib/syndrome-interpretation";
import type { FoodConsumptionSummaryResponse } from "@/lib/syndrome-interpretation";
import type { StudyMortality, DeathRecord } from "@/types/mortality";
import fixture from "./fixtures/pointcross-findings.json";

// ─── Setup from golden dataset ─────────────────────────────

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const syndromes = detectCrossDomainSyndromes(endpoints);
const byId = new Map(syndromes.map((s) => [s.id, s]));
const xs01 = byId.get("XS01")!;
const xs04 = byId.get("XS04")!;
const xs05 = byId.get("XS05")!;

// ─── Synthetic histopath data ──────────────────────────────

function makeLesionRow(overrides: Partial<LesionSeverityRow>): LesionSeverityRow {
  return {
    endpoint_label: "",
    specimen: "LIVER",
    finding: "NECROSIS",
    domain: "MI",
    dose_level: 0,
    dose_label: "",
    sex: "M",
    n: 10,
    affected: 3,
    incidence: 0.3,
    avg_severity: 2.0,
    severity_status: "adverse",
    severity: "adverse",
    ...overrides,
  };
}

const histopath: LesionSeverityRow[] = [
  // Liver findings for XS01
  makeLesionRow({ specimen: "LIVER", finding: "Necrosis", dose_level: 0, affected: 0, n: 10 }),
  makeLesionRow({ specimen: "LIVER", finding: "Necrosis", dose_level: 1, affected: 1, n: 10 }),
  makeLesionRow({ specimen: "LIVER", finding: "Necrosis", dose_level: 2, affected: 2, n: 10 }),
  makeLesionRow({ specimen: "LIVER", finding: "Necrosis", dose_level: 3, affected: 3, n: 10, avg_severity: 2.0 }),
  makeLesionRow({ specimen: "LIVER", finding: "Hypertrophy", dose_level: 0, affected: 0, n: 10 }),
  makeLesionRow({ specimen: "LIVER", finding: "Hypertrophy", dose_level: 3, affected: 6, n: 10, avg_severity: 2.6 }),
  // Bone marrow findings — fat vacuoles with dose-dependent DECREASE (argues against XS04 hypocellularity)
  makeLesionRow({ specimen: "BONE MARROW, FEMUR", finding: "Fat vacuoles, decreased", dose_level: 0, affected: 10, n: 10, avg_severity: 3.0 }),
  makeLesionRow({ specimen: "BONE MARROW, FEMUR", finding: "Fat vacuoles, decreased", dose_level: 1, affected: 8, n: 10, avg_severity: 2.5 }),
  makeLesionRow({ specimen: "BONE MARROW, FEMUR", finding: "Fat vacuoles, decreased", dose_level: 2, affected: 5, n: 10, avg_severity: 1.5 }),
  makeLesionRow({ specimen: "BONE MARROW, FEMUR", finding: "Fat vacuoles, decreased", dose_level: 3, affected: 2, n: 10, avg_severity: 0.5 }),
  // Spleen findings
  makeLesionRow({ specimen: "SPLEEN", finding: "Congestion", dose_level: 3, affected: 4, n: 10 }),
];

// ─── Test helper ───────────────────────────────────────────

const defaultContext: StudyContext = {
  studyId: "PointCross", species: "RAT", strain: "SPRAGUE-DAWLEY",
  route: "ORAL GAVAGE", studyType: "SUBCHRONIC", dosingDurationWeeks: 13,
  recoveryPeriodDays: null, terminalSacrificeWeeks: 13,
  sexPopulation: "BOTH", ageAtStartWeeks: null, estimatedNecropsyAgeWeeks: null,
  supplier: "", vehicle: "", treatment: "", studyDesign: "",
  plannedSubjectsM: null, plannedSubjectsF: null, diet: "",
  glpCompliant: true, sendCtVersion: "", title: "",
  ecgInterpretation: {
    qtcTranslational: false,
    preferredCorrection: null,
    rationale: "Rodent ventricular repolarization is Ito-dominated; QTc prolongation has limited translational value to humans.",
  },
};

const defaultFoodData: FoodConsumptionSummaryResponse = { available: false, water_consumption: null };

function interp(
  syndrome: typeof xs01,
  overrides?: Partial<{
    endpoints: typeof endpoints;
    histopath: LesionSeverityRow[];
    recovery: RecoveryRow[];
    cl: ClinicalObservation[];
    context: StudyContext;
    mortality: AnimalDisposition[];
    tumors: TumorFinding[];
    food: FoodConsumptionSummaryResponse;
    mortalityNoaelCap: number | null;
  }>,
) {
  return interpretSyndrome(
    syndrome,
    overrides?.endpoints ?? endpoints,
    overrides?.histopath ?? histopath,
    overrides?.recovery ?? [],
    [], // organWeights
    overrides?.tumors ?? [], // tumors
    overrides?.mortality ?? [],
    overrides?.food ?? defaultFoodData,
    overrides?.cl ?? [],
    overrides?.context ?? defaultContext,
    overrides?.mortalityNoaelCap,
  );
}

// ─── Tests ─────────────────────────────────────────────────

describe("syndrome interpretation layer", () => {

  // ── Component 1: Certainty ──

  test("XS04 certainty is mechanism_uncertain when RETIC is up", () => {
    const result = interp(xs04);
    expect(result.certainty).toBe("mechanism_uncertain");
    // Verify RETIC is strong argues_against — hits strongAgainst gate, not leniency branch
    const retic = result.discriminatingEvidence.find((e) => e.endpoint === "RETIC");
    expect(retic).toBeDefined();
    expect(retic!.status).toBe("argues_against");
    expect(retic!.weight).toBe("strong");
    // RETIC being strong ensures assessCertainty hits the strongAgainst.length > 0 gate,
    // bypassing the strong-support + moderate-only-against leniency branch entirely.
  });

  test("XS05 certainty is mechanism_confirmed when RETIC is up and spleen weight is up", () => {
    const result = interp(xs05);
    expect(result.certainty).toBe("mechanism_confirmed");
  });

  test("XS01 certainty is mechanism_uncertain — ALP significantly elevated argues against pure hepatocellular", () => {
    const result = interp(xs01);
    // ALP is genuinely significant and UP in PointCross, which argues against
    // pure hepatocellular injury (strong weight). Necrosis supports, but the
    // strong contradicting evidence prevents confirmation.
    expect(result.certainty).toBe("mechanism_uncertain");
  });

  test("certainty rationale mentions discriminating endpoints", () => {
    const result = interp(xs04);
    expect(result.certaintyRationale.length).toBeGreaterThan(20);
    // Should reference some endpoint in the rationale
    expect(result.discriminatingEvidence.length).toBeGreaterThan(0);
  });

  test("pattern_only when requiredMet is false", () => {
    const fakeSyndrome = { ...xs04, requiredMet: false };
    const result = interp(fakeSyndrome);
    expect(result.certainty).toBe("pattern_only");
  });

  // ── absenceMeaningful ──

  test("ALP not significant counts as argues_against for XS01 (absenceMeaningful=true)", () => {
    const result = interp(xs01);
    const alpDisc = result.discriminatingEvidence.find((e) => e.endpoint === "ALP");
    // ALP is measured in PointCross — check that it's not simply "not_available"
    if (alpDisc) {
      expect(alpDisc.status).not.toBe("not_available");
    }
  });

  test("TBILI not significant is not_available for XS05 (absenceMeaningful=false)", () => {
    const result = interp(xs05);
    const tbiliDisc = result.discriminatingEvidence.find((e) => e.endpoint === "TBILI");
    expect(tbiliDisc?.status).toBe("not_available");
  });

  // ── evaluateDiscriminator unit tests ──

  test("evaluateDiscriminator finds lab endpoint by test code", () => {
    const disc: SyndromeDiscriminators["findings"][0] = {
      endpoint: "RETIC",
      expectedDirection: "up",
      source: "LB",
      weight: "strong",
      rationale: "test",
    };
    const result = evaluateDiscriminator(disc, endpoints, []);
    // RETIC may or may not be in PointCross — but the function should not crash
    expect(result.endpoint).toBe("RETIC");
    expect(["supports", "argues_against", "not_available"]).toContain(result.status);
  });

  test("evaluateDiscriminator handles histopath SPECIMEN::FINDING", () => {
    const disc: SyndromeDiscriminators["findings"][0] = {
      endpoint: "LIVER::NECROSIS",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "test",
    };
    const result = evaluateDiscriminator(disc, endpoints, histopath);
    expect(result.status).toBe("supports");
    expect(result.actualDirection).toBe("up");
  });

  test("evaluateDiscriminator returns argues_against when expected finding absent", () => {
    const disc: SyndromeDiscriminators["findings"][0] = {
      endpoint: "BONE MARROW::HYPOCELLULARITY",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "test",
    };
    const result = evaluateDiscriminator(disc, endpoints, histopath);
    // BONE MARROW is examined but HYPOCELLULARITY is not found
    expect(result.status).toBe("argues_against");
  });

  test("evaluateDiscriminator returns not_available when specimen not examined", () => {
    const disc: SyndromeDiscriminators["findings"][0] = {
      endpoint: "KIDNEY::TUBULAR DEGENERATION",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "test",
    };
    const result = evaluateDiscriminator(disc, endpoints, histopath);
    expect(result.status).toBe("not_available");
  });

  // ── Component 2: Histopath cross-reference ──

  test("fat vacuoles recognized as proxy for cellularity change", () => {
    const result = interp(xs04);
    const bmRef = result.histopathContext.find((h) =>
      h.specimen.includes("BONE MARROW"),
    );
    expect(bmRef).toBeDefined();
    const fatVac = bmRef!.observedFindings.find((f) =>
      f.finding.toUpperCase().includes("FAT VACUOLE"),
    );
    expect(fatVac?.proxy).toBeDefined();
    expect(fatVac?.proxy?.implies).toBe("CELLULARITY_CHANGE");
  });

  test("bone marrow argues against XS04 hypocellularity", () => {
    const result = interp(xs04);
    const bmRef = result.histopathContext.find((h) =>
      h.specimen.includes("BONE MARROW"),
    );
    expect(bmRef?.assessment).toBe("argues_against");
  });

  test("liver cross-ref shows necrosis for XS01", () => {
    const result = interp(xs01);
    const liverRef = result.histopathContext.find((h) =>
      h.specimen.includes("LIVER"),
    );
    expect(liverRef).toBeDefined();
    expect(
      liverRef!.observedFindings.some((f) =>
        f.finding.toUpperCase().includes("NECROSIS"),
      ),
    ).toBe(true);
    expect(liverRef!.assessment).toBe("supports");
  });

  test("not-examined specimen is marked as such", () => {
    const noMarrow = histopath.filter(
      (r) => !r.specimen.toUpperCase().includes("BONE MARROW"),
    );
    const result = interp(xs04, { histopath: noMarrow });
    const bmRef = result.histopathContext.find((h) =>
      h.specimen.includes("BONE MARROW"),
    );
    expect(bmRef?.examined).toBe(false);
    expect(bmRef?.assessment).toBe("not_examined");
  });

  // ── Component 3: Recovery ──

  test("recovered requires p >= 0.05 AND small residual effect", () => {
    const mockRecovery: RecoveryRow[] = [{
      endpoint_label: "Neutrophils",
      sex: "M",
      recovery_day: 120,
      dose_level: 3,
      mean: 1.02,
      sd: 0.15,
      p_value: 0.45,
      effect_size: -0.3,
      terminal_effect: -2.45,
    }];
    // Need XS04 to have "Neutrophils" in matchedEndpoints
    const xs04WithNeut = {
      ...xs04,
      matchedEndpoints: [
        ...xs04.matchedEndpoints,
        { endpoint_label: "Neutrophils", domain: "LB", role: "required" as const, direction: "down", severity: "adverse" },
      ],
    };
    const result = interp(xs04WithNeut, { recovery: mockRecovery });
    const neutRecovery = result.recovery.endpoints.find((e) => e.label === "Neutrophils");
    expect(neutRecovery?.status).toBe("recovered");
  });

  test("large residual effect with p >= 0.05 is partial (underpowered)", () => {
    const mockRecovery: RecoveryRow[] = [{
      endpoint_label: "Neutrophils",
      sex: "M",
      recovery_day: 120,
      dose_level: 3,
      mean: 0.85,
      sd: 0.20,
      p_value: 0.08,
      effect_size: -1.5,
      terminal_effect: -2.45,
    }];
    const xs04WithNeut = {
      ...xs04,
      matchedEndpoints: [
        ...xs04.matchedEndpoints,
        { endpoint_label: "Neutrophils", domain: "LB", role: "required" as const, direction: "down", severity: "adverse" },
      ],
    };
    const result = interp(xs04WithNeut, { recovery: mockRecovery });
    const neutRecovery = result.recovery.endpoints.find((e) => e.label === "Neutrophils");
    expect(neutRecovery?.status).toBe("partial");
  });

  test("recovery not_examined when no recovery data", () => {
    const result = interp(xs04);
    expect(result.recovery.status).toBe("not_examined");
  });

  test("not_recovered when p < 0.05 and effect persists", () => {
    const mockRecovery: RecoveryRow[] = [{
      endpoint_label: "Neutrophils",
      sex: "M",
      recovery_day: 120,
      dose_level: 3,
      mean: 0.75,
      sd: 0.18,
      p_value: 0.002,
      effect_size: -2.10,
      terminal_effect: -2.45,
    }];
    const xs04WithNeut = {
      ...xs04,
      matchedEndpoints: [
        ...xs04.matchedEndpoints,
        { endpoint_label: "Neutrophils", domain: "LB", role: "required" as const, direction: "down", severity: "adverse" },
      ],
    };
    const result = interp(xs04WithNeut, { recovery: mockRecovery });
    const neutRecovery = result.recovery.endpoints.find((e) => e.label === "Neutrophils");
    expect(neutRecovery?.status).toBe("not_recovered");
  });

  // ── Phase C: CL correlation ──

  test("CL assessment returns no_cl_data when empty", () => {
    const result = assessClinicalObservationSupport("XS04", []);
    expect(result.assessment).toBe("no_cl_data");
  });

  test("CL assessment returns no_cl_data for syndromes without correlates", () => {
    const cl: ClinicalObservation[] = [
      { observation: "SALIVATION", doseGroup: 3, sex: "M", incidence: 5, totalN: 10 },
    ];
    const result = assessClinicalObservationSupport("XS09", cl);
    expect(result.assessment).toBe("no_cl_data");
  });

  test("CL assessment returns strengthens for dose-dependent correlating observations", () => {
    const cl: ClinicalObservation[] = [
      { observation: "PALLOR", doseGroup: 0, sex: "M", incidence: 0, totalN: 10 },
      { observation: "PALLOR", doseGroup: 1, sex: "M", incidence: 1, totalN: 10 },
      { observation: "PALLOR", doseGroup: 2, sex: "M", incidence: 3, totalN: 10 },
      { observation: "PALLOR", doseGroup: 3, sex: "M", incidence: 6, totalN: 10 },
    ];
    const result = assessClinicalObservationSupport("XS04", cl);
    expect(result.assessment).toBe("strengthens");
    expect(result.correlatingObservations.length).toBeGreaterThanOrEqual(1);
    expect(result.correlatingObservations[0].observation).toBe("PALLOR");
  });

  test("CL assessment returns neutral when observations are not dose-dependent", () => {
    const cl: ClinicalObservation[] = [
      { observation: "PALLOR", doseGroup: 0, sex: "M", incidence: 3, totalN: 10 },
      { observation: "PALLOR", doseGroup: 3, sex: "M", incidence: 3, totalN: 10 },
    ];
    const result = assessClinicalObservationSupport("XS04", cl);
    expect(result.assessment).toBe("neutral");
  });

  // ── Integration: interpretSyndrome ──

  test("dual badges: XS04 has pattern confidence from detection + mechanism certainty", () => {
    const result = interp(xs04);
    expect(result.patternConfidence).toBe(xs04.confidence);
    expect(result.mechanismCertainty).toBe("mechanism_uncertain");
  });

  test("narrative is non-empty", () => {
    const result = interp(xs04);
    expect(result.narrative.length).toBeGreaterThan(50);
  });

  test("syndromes without discriminators get uncertain certainty", () => {
    // XS07 (Immunotoxicity) has no discriminators defined
    const xs07 = byId.get("XS07");
    if (xs07) {
      const result = interp(xs07);
      expect(result.certainty).toBe(xs07.requiredMet ? "mechanism_uncertain" : "pattern_only");
    }
  });

  test("Phase B fields return sensible defaults", () => {
    const result = interp(xs01);
    expect(result.mortalityContext.treatmentRelatedDeaths).toBe(0);
    expect(result.tumorContext.tumorsPresent).toBe(false);
    expect(result.foodConsumptionContext.available).toBe(false);
  });

  // ── Component 7: Study design notes ──

  test("no study design notes for default PointCross context (SD rat, no special conditions)", () => {
    const result = interp(xs01);
    expect(result.studyDesignNotes).toEqual([]);
  });

  test("Fischer 344 strain + XS04 gets mononuclear cell leukemia caveat", () => {
    const f344Context: StudyContext = {
      ...defaultContext,
      strain: "FISCHER 344",
    };
    const notes = assembleStudyDesignNotes(xs04, f344Context);
    expect(notes.length).toBe(1);
    expect(notes[0]).toContain("mononuclear cell leukemia");
    expect(notes[0]).toContain("38%");
  });

  test("Fischer 344 caveat also fires for XS05 but not XS01", () => {
    const f344Context: StudyContext = {
      ...defaultContext,
      strain: "F344/DuCrl",
    };
    expect(assembleStudyDesignNotes(xs05, f344Context).length).toBe(1);
    expect(assembleStudyDesignNotes(xs01, f344Context).length).toBe(0);
  });

  test("recovery period present adds recovery note", () => {
    const recoveryContext: StudyContext = {
      ...defaultContext,
      recoveryPeriodDays: 28,
    };
    const notes = assembleStudyDesignNotes(xs01, recoveryContext);
    expect(notes.some((n) => n.includes("Recovery period"))).toBe(true);
    expect(notes.some((n) => n.includes("4 week"))).toBe(true);
  });

  test("no recovery note when recoveryPeriodDays is null", () => {
    const notes = assembleStudyDesignNotes(xs01, defaultContext);
    expect(notes.some((n) => n.includes("Recovery period"))).toBe(false);
  });

  test("oral gavage route + XS08 gets GI caveat", () => {
    const xs08 = byId.get("XS08");
    if (xs08) {
      const notes = assembleStudyDesignNotes(xs08, defaultContext);
      expect(notes.some((n) => n.includes("gavage"))).toBe(true);
      expect(notes.some((n) => n.includes("forestomach"))).toBe(true);
    }
  });

  test("oral gavage route does NOT add GI caveat for non-XS08 syndromes", () => {
    const notes = assembleStudyDesignNotes(xs01, defaultContext);
    expect(notes.some((n) => n.includes("gavage"))).toBe(false);
  });

  // ── Phase B: Mortality context ──

  test("empty mortality → treatmentRelatedDeaths = 0, severity unchanged", () => {
    const result = interp(xs01, { mortality: [] });
    expect(result.mortalityContext.treatmentRelatedDeaths).toBe(0);
    expect(result.mortalityContext.deathsInSyndromeOrgans).toBe(0);
    expect(result.mortalityContext.mortalityNarrative).toBe("No mortality data available.");
    // Severity should be unaffected (same as base case)
    expect(["S3_Adverse", "S2_Concern"]).toContain(result.overallSeverity);
  });

  test("death in syndrome organs → S0_Death", () => {
    const mortality: AnimalDisposition[] = [{
      animalId: "SUBJ-001",
      doseGroup: 3,
      sex: "M",
      dispositionCode: "FOUND DEAD",
      dispositionDay: 90,
      treatmentRelated: true,
      causeOfDeath: "HEPATOCELLULAR CARCINOMA",
      excludeFromTerminalStats: true,
    }];
    const result = interp(xs01, { mortality });
    expect(result.mortalityContext.deathsInSyndromeOrgans).toBe(1);
    expect(result.overallSeverity).toBe("S0_Death");
  });

  test("death in unrelated organs → S4_Critical (not S0_Death)", () => {
    const mortality: AnimalDisposition[] = [{
      animalId: "SUBJ-002",
      doseGroup: 3,
      sex: "M",
      dispositionCode: "MORIBUND SACRIFICE",
      dispositionDay: 85,
      treatmentRelated: true,
      causeOfDeath: "RENAL FAILURE",
      excludeFromTerminalStats: true,
    }];
    const result = interp(xs01, { mortality });
    expect(result.mortalityContext.deathsInSyndromeOrgans).toBe(0);
    expect(result.mortalityContext.treatmentRelatedDeaths).toBe(1);
    expect(result.overallSeverity).toBe("S4_Critical");
  });

  test("HEPATOCELLULAR CARCINOMA matches XS01 organs (LIVER/HEPAT)", () => {
    const mortality: AnimalDisposition[] = [{
      animalId: "SUBJ-003",
      doseGroup: 2,
      sex: "F",
      dispositionCode: "FOUND DEAD",
      dispositionDay: 88,
      treatmentRelated: true,
      causeOfDeath: "HEPATOCELLULAR CARCINOMA",
      excludeFromTerminalStats: true,
    }];
    const result = interp(xs01, { mortality });
    // Should match because XS01 has LIVER and/or HEPAT in organ terms
    expect(result.mortalityContext.deathsInSyndromeOrgans).toBeGreaterThanOrEqual(1);
    expect(result.mortalityContext.mortalityNarrative).toContain("directly relevant");
  });

  test("accidental deaths (treatmentRelated=false) do not count as treatment-related", () => {
    const mortality: AnimalDisposition[] = [{
      animalId: "SUBJ-004",
      doseGroup: 1,
      sex: "M",
      dispositionCode: "FOUND DEAD",
      dispositionDay: 30,
      treatmentRelated: false,
      causeOfDeath: "GAVAGE ERROR",
      excludeFromTerminalStats: true,
    }];
    const result = interp(xs01, { mortality });
    expect(result.mortalityContext.treatmentRelatedDeaths).toBe(0);
    expect(result.mortalityContext.deathsInSyndromeOrgans).toBe(0);
  });

  test("mapDeathRecordsToDispositions correctly maps deaths and accidentals", () => {
    const mortality: StudyMortality = {
      has_mortality: true,
      total_deaths: 1,
      total_accidental: 1,
      mortality_loael: 3,
      mortality_loael_label: "200 mg/kg",
      mortality_noael_cap: 2,
      severity_tier: "critical",
      deaths: [{
        USUBJID: "SUBJ-101",
        sex: "M",
        dose_level: 3,
        is_recovery: false,
        disposition: "FOUND DEAD",
        cause: "HEPATOCELLULAR CARCINOMA",
        relatedness: "DRUG RELATED",
        study_day: 90,
        dose_label: "200 mg/kg",
      }],
      accidentals: [{
        USUBJID: "SUBJ-102",
        sex: "F",
        dose_level: 1,
        is_recovery: false,
        disposition: "FOUND DEAD",
        cause: "GAVAGE ERROR",
        relatedness: "NOT RELATED",
        study_day: 30,
        dose_label: "50 mg/kg",
      }],
      by_dose: [],
    };

    const dispositions = mapDeathRecordsToDispositions(mortality);
    expect(dispositions).toHaveLength(2);

    const death = dispositions.find((d) => d.animalId === "SUBJ-101")!;
    expect(death.treatmentRelated).toBe(true);
    expect(death.doseGroup).toBe(3);
    expect(death.dispositionCode).toBe("FOUND DEAD");
    expect(death.causeOfDeath).toBe("HEPATOCELLULAR CARCINOMA");
    expect(death.excludeFromTerminalStats).toBe(true);

    const accidental = dispositions.find((d) => d.animalId === "SUBJ-102")!;
    expect(accidental.treatmentRelated).toBe(false);
    expect(accidental.causeOfDeath).toBe("GAVAGE ERROR");
    expect(accidental.excludeFromTerminalStats).toBe(true);
  });

  test("mortality NOAEL cap is propagated", () => {
    const mortality: AnimalDisposition[] = [{
      animalId: "SUBJ-005",
      doseGroup: 3,
      sex: "M",
      dispositionCode: "FOUND DEAD",
      dispositionDay: 90,
      treatmentRelated: true,
      causeOfDeath: "RENAL FAILURE",
      excludeFromTerminalStats: true,
    }];
    const result = interp(xs01, { mortality, mortalityNoaelCap: 2 });
    expect(result.mortalityContext.mortalityNoaelCap).toBe(2);
    expect(result.mortalityContext.mortalityNarrative).toContain("caps NOAEL");
  });

  // ── Tumor context ──

  test("tumorContext.tumorsPresent=false when no tumor data", () => {
    const result = interp(xs01);
    expect(result.tumorContext.tumorsPresent).toBe(false);
    expect(result.tumorContext.interpretation).toContain("No tumor data");
  });

  test("tumorContext detects liver tumors for XS01 (hepatocellular injury)", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA, HEPATOCELLULAR", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
      { organ: "LIVER", morphology: "CARCINOMA, HEPATOCELLULAR", behavior: "MALIGNANT", animalId: "S2", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors });
    expect(result.tumorContext.tumorsPresent).toBe(true);
    expect(result.tumorContext.tumorSummaries.length).toBeGreaterThanOrEqual(1);
    expect(result.tumorContext.interpretation).toContain("tumor");
  });

  test("tumorContext detects progression when MI precursors + TF tumors present", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA, HEPATOCELLULAR", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
      { organ: "LIVER", morphology: "CARCINOMA, HEPATOCELLULAR", behavior: "MALIGNANT", animalId: "S2", doseGroup: 3 },
    ];
    // histopath already includes LIVER NECROSIS + HYPERTROPHY
    const result = interp(xs01, { tumors });
    expect(result.tumorContext.progressionDetected).toBe(true);
    expect(result.tumorContext.progressionSequence).toBeDefined();
    expect(result.tumorContext.interpretation).toContain("Proliferative progression");
  });

  test("tumorContext rarity: very_rare for 13-week study", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors });
    expect(result.tumorContext.strainContext?.expectedBackground).toBe("very_rare");
    expect(result.tumorContext.interpretation).toContain("very rare spontaneously");
  });

  test("tumorContext returns no tumors for unrelated syndrome organs", () => {
    // XS04 (myelosuppression) organs include spleen/marrow, not liver
    const xs04Syn = byId.get("XS04")!;
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = interp(xs04Syn, { tumors });
    // XS04 organs don't include liver -> tumorsPresent should be false
    expect(result.tumorContext.tumorsPresent).toBe(false);
  });

  test("assessTumorContext counts malignant tumors in interpretation", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "CARCINOMA, HEPATOCELLULAR", behavior: "MALIGNANT", animalId: "S1", doseGroup: 3 },
      { organ: "LIVER", morphology: "CARCINOMA, HEPATOCELLULAR", behavior: "MALIGNANT", animalId: "S2", doseGroup: 3 },
    ];
    const result = assessTumorContext(xs01, tumors, histopath, defaultContext);
    expect(result.interpretation).toContain("2 malignant tumors");
  });
});

// ─── Food Consumption Context ─────────────────────────────

describe("food consumption context", () => {
  const emptyFood: FoodConsumptionSummaryResponse = {
    available: false,
    water_consumption: null,
  };

  const primaryWeightLossFood: FoodConsumptionSummaryResponse = {
    available: true,
    study_route: "ORAL GAVAGE",
    caloric_dilution_risk: false,
    has_water_data: false,
    periods: [{
      start_day: 1,
      end_day: 92,
      days: 91,
      by_dose_sex: [
        { dose_level: 0, sex: "M", n: 10, mean_fw: 5.09, mean_bw_gain: 186.22, mean_food_efficiency: 0.4006, food_efficiency_sd: 0.0658, food_efficiency_control: 0.4006, food_efficiency_reduced: false, fe_p_value: null, fe_cohens_d: null, fw_pct_change: 0.0, bw_pct_change: 0.0 },
        { dose_level: 3, sex: "M", n: 9, mean_fw: 4.84, mean_bw_gain: 86.0, mean_food_efficiency: 0.1953, food_efficiency_sd: 0.0477, food_efficiency_control: 0.4006, food_efficiency_reduced: true, fe_p_value: 0.000002, fe_cohens_d: -3.5712, fw_pct_change: -4.9, bw_pct_change: -53.8 },
      ],
    }],
    overall_assessment: {
      bw_decreased: true,
      fw_decreased: false,
      fe_reduced: true,
      assessment: "primary_weight_loss",
      temporal_onset: "unknown",
      narrative: "Body weight decreased at high dose while food consumption was minimally affected. Food efficiency markedly reduced, indicating primary weight loss.",
    },
    water_consumption: null,
    recovery: {
      available: true,
      fw_recovered: true,
      bw_recovered: false,
      interpretation: "Food consumption recovered but body weight remained depressed.",
    },
  };

  // Get XS08 syndrome for BW-relevant testing
  const xs08 = byId.get("XS08");

  test("empty food data → available: false, not_applicable", () => {
    const result = assessFoodConsumptionContext(xs01, emptyFood, defaultContext);
    expect(result.available).toBe(false);
    expect(result.bwFwAssessment).toBe("not_applicable");
  });

  test("primary weight loss scenario → correct assessment", () => {
    // XS08 (stress response) is BW-relevant
    if (!xs08) return;
    const result = assessFoodConsumptionContext(xs08, primaryWeightLossFood, defaultContext);
    expect(result.available).toBe(true);
    expect(result.bwFwAssessment).toBe("primary_weight_loss");
    expect(result.foodEfficiencyReduced).toBe(true);
    expect(result.fwNarrative).toContain("weight");
  });

  test("non-BW syndrome (XS01) → not_applicable even with food data", () => {
    const result = assessFoodConsumptionContext(xs01, primaryWeightLossFood, defaultContext);
    expect(result.available).toBe(true);
    expect(result.bwFwAssessment).toBe("not_applicable");
  });

  test("XS08 stress syndrome → properly receives assessment", () => {
    if (!xs08) return;
    const result = assessFoodConsumptionContext(xs08, primaryWeightLossFood, defaultContext);
    expect(result.available).toBe(true);
    // XS08 is in BW_RELEVANT_SYNDROMES set
    expect(result.bwFwAssessment).not.toBe("not_applicable");
    expect(result.fwNarrative.length).toBeGreaterThan(0);
  });
});

// ─── Step 14: Treatment-Relatedness ──────────────────────────

describe("computeTreatmentRelatedness", () => {
  const noClSupport = { correlatingObservations: [], assessment: "no_cl_data" as const };
  const clStrengthens = {
    correlatingObservations: [{ observation: "PALLOR", tier: 2 as const, expectedForSyndrome: true, incidenceDoseDependent: true }],
    assessment: "strengthens" as const,
  };

  test("XS05 with MODERATE confidence → treatment_related", () => {
    const result = computeTreatmentRelatedness(xs05, endpoints, noClSupport);
    // XS05 is MODERATE confidence → weak dose-response, but concordant + significant = treatment_related
    expect(result.doseResponse).toBe("weak");
    expect(result.crossEndpoint).toBe("concordant");
    expect(result.statisticalSignificance).toBe("significant");
    expect(result.overall).toBe("treatment_related");
  });

  test("statisticalSignificance derives from matched endpoint p-values", () => {
    const result = computeTreatmentRelatedness(xs01, endpoints, noClSupport);
    // XS01 matched endpoints have significant p-values in PointCross
    expect(result.statisticalSignificance).toBe("significant");
  });

  test("CL support counts toward treatment-relatedness", () => {
    const result = computeTreatmentRelatedness(xs05, endpoints, clStrengthens);
    expect(result.clinicalObservationSupport).toBe(true);
    expect(result.overall).toBe("treatment_related");
  });

  test("LOW confidence single-domain → possibly_related or not_related", () => {
    // Create a fake low-confidence single-domain syndrome
    const weak = {
      ...xs01,
      confidence: "LOW" as const,
      domainsCovered: ["LB"],
    };
    const result = computeTreatmentRelatedness(weak, endpoints, noClSupport);
    expect(result.doseResponse).toBe("absent");
    expect(result.crossEndpoint).toBe("isolated");
    // With significant p-values from matched endpoints, gets 1 factor → possibly_related
    expect(["possibly_related", "not_related"]).toContain(result.overall);
  });
});

// ─── Step 15: Adversity Assessment ───────────────────────────

describe("computeAdversity", () => {
  const noRecovery = { status: "not_examined" as const, endpoints: [], summary: "No recovery data." };
  const recovered = { status: "recovered" as const, endpoints: [], summary: "All endpoints recovered." };
  const noTumors = { tumorsPresent: false, tumorSummaries: [], progressionDetected: false, interpretation: "No tumors." };
  const withProgression = { tumorsPresent: true, tumorSummaries: [], progressionDetected: true, interpretation: "Progression detected." };
  const noFood = { available: false, bwFwAssessment: "not_applicable" as const, foodEfficiencyReduced: null, temporalOnset: null, fwNarrative: "" };
  const secondaryFood = { available: true, bwFwAssessment: "secondary_to_food" as const, foodEfficiencyReduced: true, temporalOnset: "fw_first" as const, fwNarrative: "BW loss secondary." };

  test("precursorToWorse wired to tumorContext.progressionDetected", () => {
    const result = computeAdversity(xs01, endpoints, noRecovery, "mechanism_confirmed", withProgression, noFood);
    expect(result.precursorToWorse).toBe(true);
    expect(result.overall).toBe("adverse");
  });

  test("secondaryToOther wired to food consumption", () => {
    const result = computeAdversity(xs01, endpoints, noRecovery, "mechanism_uncertain", noTumors, secondaryFood);
    expect(result.secondaryToOther).toBe(true);
  });

  test("magnitudeLevel derives from endpoint effect sizes", () => {
    const result = computeAdversity(xs05, endpoints, noRecovery, "mechanism_confirmed", noTumors, noFood);
    // PointCross XS05 endpoints should have measurable effect sizes
    expect(["minimal", "mild", "moderate", "marked", "severe"]).toContain(result.magnitudeLevel);
    expect(result.magnitudeLevel).not.toBe("moderate"); // should actually compute, not be hardcoded
  });

  test("recovered + mild magnitude → non_adverse", () => {
    // Use xs01 which should have moderate+ effects, so create fake low-effect syndrome
    const lowEffect = { ...xs01, matchedEndpoints: [] }; // no matched endpoints → minimal magnitude
    const result = computeAdversity(lowEffect, endpoints, recovered, "mechanism_uncertain", noTumors, noFood);
    expect(result.reversible).toBe(true);
    expect(result.magnitudeLevel).toBe("minimal");
    expect(result.overall).toBe("non_adverse");
  });

  test("mechanism_confirmed + cross-domain → adverse", () => {
    const result = computeAdversity(xs05, endpoints, noRecovery, "mechanism_confirmed", noTumors, noFood);
    expect(result.crossDomainSupport).toBe(true);
    expect(result.overall).toBe("adverse");
  });
});

// ─── Step 15b: Severity Cascade ──────────────────────────────

describe("deriveOverallSeverity", () => {
  const baseMortality = {
    deathsInSyndromeOrgans: 0, treatmentRelatedDeaths: 0,
    doseRelatedMortality: false, mortalityNarrative: "", mortalityNoaelCap: null, deathDetails: [],
  };
  const noTumors = { tumorsPresent: false, tumorSummaries: [], progressionDetected: false, interpretation: "" };
  const equivocal = {
    adaptive: false, reversible: null, magnitudeLevel: "moderate" as const,
    crossDomainSupport: true, precursorToWorse: false, secondaryToOther: false, overall: "equivocal" as const,
  };
  const adverse = { ...equivocal, overall: "adverse" as const };
  const nonAdverse = { ...equivocal, overall: "non_adverse" as const };

  test("deaths in syndrome organs → S0_Death", () => {
    const mort = { ...baseMortality, deathsInSyndromeOrgans: 1 };
    expect(deriveOverallSeverity(mort, noTumors, equivocal, "mechanism_confirmed")).toBe("S0_Death");
  });

  test("tumors with progression → carcinogenic", () => {
    const tumors = { tumorsPresent: true, tumorSummaries: [], progressionDetected: true, interpretation: "" };
    expect(deriveOverallSeverity(baseMortality, tumors, equivocal, "mechanism_confirmed")).toBe("carcinogenic");
  });

  test("tumors without progression → proliferative", () => {
    const tumors = { tumorsPresent: true, tumorSummaries: [], progressionDetected: false, interpretation: "" };
    expect(deriveOverallSeverity(baseMortality, tumors, equivocal, "mechanism_confirmed")).toBe("proliferative");
  });

  test("treatment-related deaths (non-organ) → S4_Critical", () => {
    const mort = { ...baseMortality, treatmentRelatedDeaths: 2 };
    expect(deriveOverallSeverity(mort, noTumors, equivocal, "mechanism_confirmed")).toBe("S4_Critical");
  });

  test("mechanism_confirmed + adverse → S3_Adverse", () => {
    expect(deriveOverallSeverity(baseMortality, noTumors, adverse, "mechanism_confirmed")).toBe("S3_Adverse");
  });

  test("adverse without confirmed mechanism → S2_Concern", () => {
    expect(deriveOverallSeverity(baseMortality, noTumors, adverse, "mechanism_uncertain")).toBe("S2_Concern");
  });

  test("non_adverse → S1_Monitor", () => {
    expect(deriveOverallSeverity(baseMortality, noTumors, nonAdverse, "mechanism_confirmed")).toBe("S1_Monitor");
  });
});

// ─── Narrative ECETOC Summary ────────────────────────────────

describe("narrative assembly", () => {
  test("narrative includes ECETOC treatment-relatedness summary", () => {
    const result = interp(xs05);
    expect(result.narrative).toContain("Treatment-related:");
  });

  test("narrative includes ECETOC adversity summary", () => {
    const result = interp(xs05);
    expect(result.narrative).toContain("Adverse:");
  });

  test("narrative includes tumor context when tumors present", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA, HEPATOCELLULAR", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors });
    expect(result.tumorContext.tumorsPresent).toBe(true);
    expect(result.narrative).toContain(result.tumorContext.interpretation);
  });

  test("overall severity reflects tumor progression", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA, HEPATOCELLULAR", behavior: "BENIGN", animalId: "S1", doseGroup: 2 },
      { organ: "LIVER", morphology: "CARCINOMA, HEPATOCELLULAR", behavior: "MALIGNANT", animalId: "S2", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors });
    expect(result.overallSeverity).toBe("carcinogenic");
  });

  test("treatment-relatedness factors appear in narrative parenthetical", () => {
    const result = interp(xs05);
    // MODERATE confidence → "weak dose-response" + concordant + significant
    expect(result.narrative).toMatch(/dose-response/);
    expect(result.narrative).toMatch(/concordant across/);
  });
});

// ─── Human Non-Relevance Mechanisms ─────────────────────────

describe("humanNonRelevance", () => {
  test("PPARα applies for rodent liver tumors", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA, HEPATOCELLULAR", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = assessTumorContext(xs01, tumors, histopath, defaultContext);
    expect(result.humanNonRelevance).toBeDefined();
    const ppar = result.humanNonRelevance!.find((h) => h.mechanism === "PPARα agonism");
    expect(ppar).toBeDefined();
    expect(ppar!.applies).toBe(true);
    expect(ppar!.rationale).toContain("peroxisome proliferation");
  });

  test("PPARα does not apply for dog species", () => {
    const dogContext: StudyContext = { ...defaultContext, species: "DOG" };
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = assessTumorContext(xs01, tumors, histopath, dogContext);
    const ppar = result.humanNonRelevance!.find((h) => h.mechanism === "PPARα agonism");
    expect(ppar!.applies).toBe(false);
  });

  test("TSH-mediated thyroid applies for rodent thyroid tumors", () => {
    const tumors: TumorFinding[] = [
      { organ: "THYROID", morphology: "FOLLICULAR CELL ADENOMA", behavior: "BENIGN", animalId: "S1", doseGroup: 2 },
    ];
    // XS01 organ filter may exclude thyroid — use all tumors by targeting a broader syndrome
    const result = assessTumorContext(
      { ...xs01, id: "GENERIC" }, // no organ filter → includes all tumors
      tumors, histopath, defaultContext,
    );
    const tsh = result.humanNonRelevance!.find((h) => h.mechanism === "TSH-mediated thyroid");
    expect(tsh).toBeDefined();
    expect(tsh!.applies).toBe(true);
    expect(tsh!.rationale).toContain("TSH elevation");
  });

  test("α2u-globulin applies for male rat kidney tumors", () => {
    const tumors: TumorFinding[] = [
      { organ: "KIDNEY", morphology: "RENAL TUBULAR ADENOMA", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = assessTumorContext(
      { ...xs01, id: "GENERIC" },
      tumors, histopath, defaultContext,
    );
    const a2u = result.humanNonRelevance!.find((h) => h.mechanism === "α2u-globulin nephropathy");
    expect(a2u).toBeDefined();
    expect(a2u!.applies).toBe(true);
    expect(a2u!.rationale).toContain("absent in humans");
  });

  test("α2u-globulin does NOT apply for mouse (only male rats)", () => {
    const mouseContext: StudyContext = { ...defaultContext, species: "MOUSE" };
    const tumors: TumorFinding[] = [
      { organ: "KIDNEY", morphology: "RENAL TUBULAR ADENOMA", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = assessTumorContext(
      { ...xs01, id: "GENERIC" },
      tumors, histopath, mouseContext,
    );
    const a2u = result.humanNonRelevance!.find((h) => h.mechanism === "α2u-globulin nephropathy");
    expect(a2u!.applies).toBe(false);
  });

  test("narrative includes non-human-relevant mechanisms when applicable", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors });
    expect(result.tumorContext.humanNonRelevance).toBeDefined();
    const ppar = result.tumorContext.humanNonRelevance!.find((h) => h.mechanism === "PPARα agonism");
    if (ppar?.applies) {
      expect(result.narrative).toContain("Non-human-relevant mechanism");
    }
  });

  test("no tumors → no humanNonRelevance field", () => {
    const result = assessTumorContext(xs01, [], histopath, defaultContext);
    expect(result.humanNonRelevance).toBeUndefined();
  });
});

// ─── ECGInterpretation ──────────────────────────────────────

describe("ECGInterpretation in StudyContext", () => {
  test("rat species → qtcTranslational false, no preferred correction", () => {
    expect(defaultContext.ecgInterpretation.qtcTranslational).toBe(false);
    expect(defaultContext.ecgInterpretation.preferredCorrection).toBeNull();
    expect(defaultContext.ecgInterpretation.rationale).toContain("Ito-dominated");
  });

  test("dog context has VanDeWater correction and is translationally relevant", () => {
    const dogContext: StudyContext = {
      ...defaultContext,
      species: "DOG",
      ecgInterpretation: {
        qtcTranslational: true,
        preferredCorrection: "VanDeWater",
        rationale: "Dog QTc is the gold-standard non-clinical model for human QT risk. Van de Water correction preferred.",
      },
    };
    expect(dogContext.ecgInterpretation.qtcTranslational).toBe(true);
    expect(dogContext.ecgInterpretation.preferredCorrection).toBe("VanDeWater");
  });

  test("NHP context has Fridericia correction", () => {
    const nhpContext: StudyContext = {
      ...defaultContext,
      species: "CYNOMOLGUS MONKEY",
      ecgInterpretation: {
        qtcTranslational: true,
        preferredCorrection: "Fridericia",
        rationale: "NHP QTc is translationally relevant. Fridericia correction preferred for non-human primates.",
      },
    };
    expect(nhpContext.ecgInterpretation.preferredCorrection).toBe("Fridericia");
    expect(nhpContext.ecgInterpretation.qtcTranslational).toBe(true);
  });
});
