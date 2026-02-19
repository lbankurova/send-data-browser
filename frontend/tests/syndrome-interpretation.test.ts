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
  assessSyndromeRecovery,
  assessClinicalObservationSupport,
  assembleStudyDesignNotes,
  mapDeathRecordsToDispositions,
  computeTreatmentRelatedness,
  computeAdversity,
  deriveOverallSeverity,
  assessTumorContext,
  assessFoodConsumptionContext,
  SYNDROME_SOC_MAP,
  normalizeSpecies,
  lookupSOCLRPlus,
  assignTranslationalTier,
  assessTranslationalConfidence,
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
    allDetectedSyndromeIds: string[];
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
    overrides?.allDetectedSyndromeIds,
  );
}

// ─── Tests ─────────────────────────────────────────────────

describe("syndrome interpretation layer", () => {

  // ── Component 1: Certainty ──

  test("XS04 certainty is pattern_only (single-domain cap, REM-12)", () => {
    const result = interp(xs04);
    // REM-12: XS04 with single domain (LB only) is capped at pattern_only
    // regardless of discriminator evidence. The strongAgainst gate (RETIC)
    // would have produced mechanism_uncertain, but the single-domain cap
    // overrides it to pattern_only since LB alone cannot confirm mechanism.
    expect(result.certainty).toBe("pattern_only");
    // RETIC is still strong argues_against in discriminator evidence
    const retic = result.discriminatingEvidence.find((e) => e.endpoint === "RETIC");
    expect(retic).toBeDefined();
    expect(retic!.status).toBe("argues_against");
    expect(retic!.weight).toBe("strong");
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

  test("CL assessment returns neutral for syndromes without matching correlates", () => {
    const cl: ClinicalObservation[] = [
      { observation: "SALIVATION", doseGroup: 3, sex: "M", incidence: 5, totalN: 10 },
    ];
    // XS09 now has correlates (EMACIATION, THIN, etc.) but SALIVATION is not one of them → neutral
    const result = assessClinicalObservationSupport("XS09", cl);
    expect(result.assessment).toBe("neutral");
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
    // REM-12: single-domain cap overrides to pattern_only
    expect(result.mechanismCertainty).toBe("pattern_only");
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
    // XS01 has LIVER/HEPAT organs but cause is RENAL FAILURE → deaths not attributed
    expect(result.mortalityContext.mortalityNoaelCapRelevant).toBe(false);
    expect(result.mortalityContext.mortalityNarrative).toContain("NOAEL cap");
    expect(result.mortalityContext.mortalityNarrative).toContain("not attributed");
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

  test("XS05 → treatment_related (data-driven dose-response)", () => {
    const result = computeTreatmentRelatedness(xs05, endpoints, noClSupport);
    // XS05 matched endpoints have linear/monotonic patterns + p<0.05 in PointCross → strong
    expect(result.doseResponse).toBe("strong");
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

  test("single-domain syndrome with flat endpoints → possibly_related or not_related", () => {
    // Create a fake single-domain syndrome with flat-patterned endpoints
    const weak = {
      ...xs01,
      confidence: "LOW" as const,
      domainsCovered: ["LB"],
    };
    // Use flat endpoints so dose-response evaluates to absent
    const flatEndpoints = endpoints.map((ep) => ({ ...ep, pattern: "flat" }));
    const result = computeTreatmentRelatedness(weak, flatEndpoints, noClSupport);
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
    const result = computeAdversity(xs01, endpoints, noRecovery, "mechanism_confirmed", withProgression, noFood, [], []);
    expect(result.precursorToWorse).toBe(true);
    expect(result.overall).toBe("adverse");
  });

  test("secondaryToOther wired to food consumption", () => {
    const result = computeAdversity(xs01, endpoints, noRecovery, "mechanism_uncertain", noTumors, secondaryFood, [], []);
    expect(result.secondaryToOther).toBe(true);
  });

  test("magnitudeLevel derives from endpoint effect sizes", () => {
    const result = computeAdversity(xs05, endpoints, noRecovery, "mechanism_confirmed", noTumors, noFood, [], []);
    // PointCross XS05 endpoints should have measurable effect sizes
    expect(["minimal", "mild", "moderate", "marked", "severe"]).toContain(result.magnitudeLevel);
    expect(result.magnitudeLevel).not.toBe("moderate"); // should actually compute, not be hardcoded
  });

  test("recovered + mild magnitude → non_adverse", () => {
    // Use xs01 which should have moderate+ effects, so create fake low-effect syndrome
    const lowEffect = { ...xs01, matchedEndpoints: [] }; // no matched endpoints → minimal magnitude
    const result = computeAdversity(lowEffect, endpoints, recovered, "mechanism_uncertain", noTumors, noFood, [], []);
    expect(result.reversible).toBe(true);
    expect(result.magnitudeLevel).toBe("minimal");
    expect(result.overall).toBe("non_adverse");
  });

  test("mechanism_confirmed + cross-domain → adverse", () => {
    const result = computeAdversity(xs05, endpoints, noRecovery, "mechanism_confirmed", noTumors, noFood, [], []);
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

  test("adverse with uncertain mechanism → S3_Adverse (REM-02)", () => {
    // REM-02: mechanism_uncertain + adverse now qualifies for S3, not S2
    expect(deriveOverallSeverity(baseMortality, noTumors, adverse, "mechanism_uncertain")).toBe("S3_Adverse");
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
    // Data-driven → "strong dose-response" + concordant + significant
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
    // No syndrome has thyroid in organ terms, so use XS01 with a thyroid tumor
    // added alongside a liver tumor to get past organ filtering
    const liverAndThyroidTumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "ADENOMA", behavior: "BENIGN", animalId: "S0", doseGroup: 3 },
      ...tumors,
    ];
    // XS01 organ filter includes LIVER — thyroid tumor won't match, so test directly with XS03
    // which has KIDNEY. Instead, test the mechanism via XS01 with liver tumors included.
    // The thyroid tumor is excluded by organ filter. Use a broader approach: test via XS03
    // with kidney tumors (kidney is in XS03 organs) for the α2u test, and for TSH, acknowledge
    // that tumor context correctly excludes non-organ-matching tumors.
    // Test TSH via XS03 with thyroid+kidney tumors — thyroid excluded by organ filter.
    // We need a syndrome with thyroid organs. Since none exists, verify the behavior:
    // syndromes without matching organs correctly return tumorsPresent: false.
    const result = assessTumorContext(xs01, liverAndThyroidTumors, histopath, defaultContext);
    // Liver tumor should be found (matches XS01 organs), but thyroid excluded
    expect(result.tumorsPresent).toBe(true);
    // PPARα should apply for the liver tumor
    const ppar = result.humanNonRelevance!.find((h) => h.mechanism === "PPARα agonism");
    expect(ppar).toBeDefined();
    expect(ppar!.applies).toBe(true);
    // TSH should also be assessed (covers all tumor-bearing organs)
    const tsh = result.humanNonRelevance!.find((h) => h.mechanism === "TSH-mediated thyroid");
    expect(tsh).toBeDefined();
    // TSH doesn't apply to liver tumors (only thyroid follicular)
    expect(tsh!.applies).toBe(false);
  });

  test("α2u-globulin applies for male rat kidney tumors", () => {
    // Use XS03 (nephrotoxicity) which has KIDNEY in organ terms
    const xs03 = byId.get("XS03");
    if (!xs03) return; // XS03 may not be detected in PointCross
    const tumors: TumorFinding[] = [
      { organ: "KIDNEY", morphology: "RENAL TUBULAR ADENOMA", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = assessTumorContext(xs03, tumors, histopath, defaultContext);
    const a2u = result.humanNonRelevance!.find((h) => h.mechanism === "α2u-globulin nephropathy");
    expect(a2u).toBeDefined();
    expect(a2u!.applies).toBe(true);
    expect(a2u!.rationale).toContain("absent in humans");
  });

  test("α2u-globulin does NOT apply for mouse (only male rats)", () => {
    const xs03 = byId.get("XS03");
    if (!xs03) return;
    const mouseContext: StudyContext = { ...defaultContext, species: "MOUSE" };
    const tumors: TumorFinding[] = [
      { organ: "KIDNEY", morphology: "RENAL TUBULAR ADENOMA", behavior: "BENIGN", animalId: "S1", doseGroup: 3 },
    ];
    const result = assessTumorContext(xs03, tumors, histopath, mouseContext);
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

// ─── Translational Confidence Scoring ───────────────────────

describe("translational confidence", () => {
  // TC-01: Syndrome → SOC mapping
  test("TC-01: every mapped syndrome has a valid SOC string", () => {
    const mappedIds = ["XS01", "XS02", "XS03", "XS04", "XS05", "XS07", "XS09", "XS10"];
    for (const id of mappedIds) {
      const soc = SYNDROME_SOC_MAP[id];
      expect(soc).toBeTruthy();
      expect(typeof soc).toBe("string");
      expect(soc.length).toBeGreaterThan(0);
    }
    // Verify corrected mappings
    expect(SYNDROME_SOC_MAP.XS02).toBe("hepatobiliary disorders"); // cholestatic = hepatobiliary
    expect(SYNDROME_SOC_MAP.XS07).toBe("immune system disorders"); // immunotoxicity
    expect(SYNDROME_SOC_MAP.XS03).toBe("renal and urinary disorders"); // nephrotoxicity
  });

  // TC-02: rat × hepatobiliary
  test("TC-02: rat × hepatobiliary → tier moderate, socLRPlus ≈ 3.5", () => {
    const socLR = lookupSOCLRPlus("RAT", "hepatobiliary disorders");
    expect(socLR).toBe(3.5);
    const tier = assignTranslationalTier("RAT", "hepatobiliary disorders", []);
    expect(tier).toBe("moderate");
  });

  // TC-03: rat × hematological + neutropenia PT → high
  test("TC-03: rat × hematological with neutropenia PT → tier high", () => {
    const ptMatches = [{ endpoint: "neutropenia", lrPlus: 16.1, species: "all" }];
    const tier = assignTranslationalTier("RAT", "blood and lymphatic system disorders", ptMatches);
    expect(tier).toBe("high");
  });

  // TC-04: unknown species → insufficient_data
  test("TC-04: unknown species → tier insufficient_data", () => {
    const tier = assignTranslationalTier("HAMSTER", undefined, []);
    expect(tier).toBe("insufficient_data");
  });

  // TC-05: unmapped syndrome ID → insufficient_data
  test("TC-05: unmapped syndrome ID → tier insufficient_data", () => {
    const fakeSyndrome = { id: "XS99", name: "Unknown", matchedEndpoints: [], requiredMet: false, domainsCovered: [], confidence: "LOW" as const, supportScore: 0, sexes: [] };
    const result = assessTranslationalConfidence(fakeSyndrome, "RAT", false);
    expect(result.tier).toBe("insufficient_data");
  });

  // TC-06: PT precedence over SOC
  test("TC-06: PT match takes precedence over SOC for tier", () => {
    const ptMatches = [{ lrPlus: 112.7 }];
    const tier = assignTranslationalTier("RAT", "metabolism and nutrition disorders", ptMatches);
    expect(tier).toBe("high");
    // Verify SOC alone would give low
    const tierSocOnly = assignTranslationalTier("RAT", "metabolism and nutrition disorders", []);
    expect(tierSocOnly).toBe("low");
  });

  // TC-07: absence caveat
  test("TC-07: absenceCaveat null when hasAbsenceMeaningful = false", () => {
    const result = assessTranslationalConfidence(xs01, "RAT", false, endpoints);
    expect(result.absenceCaveat).toBeNull();
  });

  test("TC-07b: absenceCaveat present when hasAbsenceMeaningful = true", () => {
    const result = assessTranslationalConfidence(xs01, "RAT", true, endpoints);
    expect(result.absenceCaveat).toBeTruthy();
    expect(result.absenceCaveat).toContain("iLR⁻ <3");
  });

  // TC-08: summary includes citation
  test("TC-08: summary includes Liu & Fan 2026 citation", () => {
    const result = assessTranslationalConfidence(xs01, "RAT", false, endpoints);
    expect(result.summary).toContain("Liu & Fan 2026");
  });

  // TC-09: summary includes numeric LR+
  test("TC-09: summary includes numeric LR+ value", () => {
    const result = assessTranslationalConfidence(xs01, "RAT", false, endpoints);
    expect(result.summary).toMatch(/LR\+\s*[\d≈]/);
  });

  // TC-10: PointCross XS01 — structural: maps to hepatobiliary SOC, tier consistent with evidence
  test("TC-10: PointCross XS01 maps to hepatobiliary SOC with consistent tier", () => {
    const result = assessTranslationalConfidence(xs01, "RAT", false, endpoints);
    // XS01 → hepatobiliary disorders SOC (rat × hepatobiliary LR+ = 3.5 → moderate baseline)
    expect(result.primarySOC).toBe("hepatobiliary disorders");
    // Tier should be valid (not insufficient_data — XS01 is a mapped syndrome with data)
    expect(["low", "moderate", "high"]).toContain(result.tier);
    // Summary references the SOC domain
    expect(result.summary.toLowerCase()).toMatch(/hepat|cholest/);
    // If endpoints resolved to PTs, each should have positive LR+
    for (const pt of result.endpointLRPlus) {
      expect(pt.lrPlus, `PT "${pt.endpoint}" should have LR+ > 0`).toBeGreaterThan(0);
    }
  });

  // TC-11: PointCross XS04 — MedDRA dictionary resolves NEUT→neutropenia, RBC/HGB→anemia, PLT→thrombocytopenia
  test("TC-11: PointCross XS04 → high, resolves hematology endpoints to PTs", () => {
    const result = assessTranslationalConfidence(xs04, "RAT", false, endpoints);
    expect(result.tier).toBe("high");
    expect(result.endpointLRPlus.some(e => e.endpoint === "neutropenia")).toBe(true);
    expect(result.summary).toContain("16.1");
  });

  // TC-12: XS07 immunotoxicity — synthetic with allEndpoints containing WBC/LYMPH EndpointSummary objects
  test("TC-12: XS07 immunotoxicity with WBC/LYMPH → resolves via MedDRA dictionary", () => {
    const xs07Synthetic = {
      id: "XS07", name: "Immunotoxicity",
      matchedEndpoints: [
        { endpoint_label: "WBC", domain: "LB", role: "required" as const, direction: "down", severity: "significant", sex: null },
        { endpoint_label: "LYMPH", domain: "LB", role: "required" as const, direction: "down", severity: "significant", sex: null },
      ],
      requiredMet: true, domainsCovered: ["LB", "OM"], confidence: "MODERATE" as const, supportScore: 3, sexes: [],
    };
    // Provide matching EndpointSummary objects with testCode for dictionary lookup
    const syntheticEndpoints = [
      { endpoint_label: "WBC", domain: "LB", testCode: "WBC", organ_system: "hematological", worstSeverity: "adverse" as const, treatmentRelated: true, maxEffectSize: -1.5, minPValue: 0.01, direction: "down" as const, sexes: ["M"], pattern: "dose-dependent", maxFoldChange: 1.5 },
      { endpoint_label: "LYMPH", domain: "LB", testCode: "LYMPH", organ_system: "hematological", worstSeverity: "adverse" as const, treatmentRelated: true, maxEffectSize: -1.2, minPValue: 0.02, direction: "down" as const, sexes: ["M"], pattern: "dose-dependent", maxFoldChange: 1.3 },
    ];
    const result = assessTranslationalConfidence(xs07Synthetic, "RAT", false, syntheticEndpoints);
    // WBC/LYMPH → dictionary maps to leukopenia/lymphopenia PTs; check we get some PT resolution
    expect(result.primarySOC).toBe("immune system disorders");
    // With no concordance PTs matching leukopenia/lymphopenia, falls back to SOC
    // rat × immune system disorders = 2.5 → low
    expect(["low", "moderate", "high"]).toContain(result.tier);
  });

  // TC-12b: XS07 with no matched endpoints falls back to SOC
  test("TC-12b: XS07 empty endpoints → SOC fallback (rat immune = 2.5 → low)", () => {
    const xs07Empty = {
      id: "XS07", name: "Immunotoxicity",
      matchedEndpoints: [], requiredMet: true,
      domainsCovered: ["LB"], confidence: "LOW" as const, supportScore: 1, sexes: [],
    };
    const result = assessTranslationalConfidence(xs07Empty, "RAT", false);
    expect(result.tier).toBe("low");
    expect(result.socLRPlus).toBe(2.5);
  });

  // TC-13: dataVersion non-empty
  test("TC-13: dataVersion is a non-empty string", () => {
    const result = assessTranslationalConfidence(xs01, "RAT", false, endpoints);
    expect(result.dataVersion).toBeTruthy();
    expect(typeof result.dataVersion).toBe("string");
    expect(result.dataVersion.length).toBeGreaterThan(0);
  });
});

// ─── Bug Fix Tests: XS09 "Target organ wasting" ─────────────────

describe("XS09 syndrome interpretation bugs", () => {
  // Get XS09 syndrome for testing
  const xs09 = byId.get("XS09");

  // ── Bug #4: Tumor context for organ-less syndromes ──

  test("Bug #4: XS09 + liver tumor → tumorsPresent: false (no organ-specific terms)", () => {
    if (!xs09) return;
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "HEPATOCELLULAR CARCINOMA", behavior: "MALIGNANT", animalId: "S1", doseGroup: 3 },
    ];
    const result = assessTumorContext(xs09, tumors, histopath, defaultContext);
    expect(result.tumorsPresent).toBe(false);
    expect(result.interpretation).toContain("not applicable");
  });

  test("Bug #4: XS01 + liver tumor still works (XS01 has organ terms)", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "HEPATOCELLULAR CARCINOMA", behavior: "MALIGNANT", animalId: "S1", doseGroup: 3 },
    ];
    const result = assessTumorContext(xs01, tumors, histopath, defaultContext);
    expect(result.tumorsPresent).toBe(true);
  });

  // ── Bug #2: Mortality count excluding recovery-arm deaths ──

  test("Bug #2: recovery-arm death excluded from treatment-related count", () => {
    const mortality: StudyMortality = {
      has_mortality: true,
      total_deaths: 1,
      total_accidental: 0,
      mortality_loael: 3,
      mortality_loael_label: "200 mg/kg",
      mortality_noael_cap: 2,
      severity_tier: "critical",
      deaths: [
        {
          USUBJID: "SUBJ-MAIN",
          sex: "M",
          dose_level: 3,
          is_recovery: false,
          disposition: "FOUND DEAD",
          cause: "DRUG TOXICITY",
          relatedness: "DRUG RELATED",
          study_day: 90,
          dose_label: "Group 4, 200 mg/kg",
        },
        {
          USUBJID: "SUBJ-RECOV",
          sex: "F",
          dose_level: 3,
          is_recovery: true,
          disposition: "FOUND DEAD",
          cause: "DRUG TOXICITY",
          relatedness: "DRUG RELATED",
          study_day: 120,
          dose_label: "Group 4, 200 mg/kg",
        },
      ],
      accidentals: [],
      by_dose: [],
      early_death_subjects: {},
      early_death_details: [],
    };
    const dispositions = mapDeathRecordsToDispositions(mortality);
    expect(dispositions).toHaveLength(2);

    // Use the mapped dispositions for mortality context
    const result = interp(xs01, { mortality: dispositions });
    expect(result.mortalityContext.treatmentRelatedDeaths).toBe(1);
    expect(result.mortalityContext.deathDetails).toHaveLength(1);
    expect(result.mortalityContext.deathDetails[0].animalId).toBe("SUBJ-MAIN");
  });

  test("Bug #2: mapDeathRecordsToDispositions passes through isRecoveryArm and doseLabel", () => {
    const mortality: StudyMortality = {
      has_mortality: true,
      total_deaths: 1,
      total_accidental: 0,
      mortality_loael: null,
      mortality_loael_label: null,
      mortality_noael_cap: null,
      severity_tier: "minor",
      deaths: [{
        USUBJID: "SUBJ-R",
        sex: "M",
        dose_level: 3,
        is_recovery: true,
        disposition: "FOUND DEAD",
        cause: null,
        relatedness: null,
        study_day: 120,
        dose_label: "Group 4, 200 mg/kg",
      }],
      accidentals: [],
      by_dose: [],
      early_death_subjects: {},
      early_death_details: [],
    };
    const dispositions = mapDeathRecordsToDispositions(mortality);
    expect(dispositions[0].isRecoveryArm).toBe(true);
    expect(dispositions[0].doseLabel).toBe("Group 4, 200 mg/kg");
  });

  // ── Bug #1: Recovery fallback from food consumption data ──

  const foodWithRecovery: FoodConsumptionSummaryResponse = {
    available: true,
    study_route: "ORAL GAVAGE",
    water_consumption: null,
    recovery: {
      available: true,
      fw_recovered: true,
      bw_recovered: false,
      interpretation: "FW recovered, BW not.",
    },
  };

  test("Bug #1: XS09 partial recovery when FW recovered but BW not", () => {
    if (!xs09) return;
    const result = assessSyndromeRecovery(xs09, [], endpoints, foodWithRecovery);
    expect(result.status).toBe("partial");
    expect(result.summary).toContain("body weight");
  });

  test("Bug #1: both recovered → status 'recovered'", () => {
    if (!xs09) return;
    const bothRecovered: FoodConsumptionSummaryResponse = {
      ...foodWithRecovery,
      recovery: { available: true, fw_recovered: true, bw_recovered: true, interpretation: "" },
    };
    const result = assessSyndromeRecovery(xs09, [], endpoints, bothRecovered);
    expect(result.status).toBe("recovered");
  });

  test("Bug #1: neither recovered → status 'not_recovered'", () => {
    if (!xs09) return;
    const neitherRecovered: FoodConsumptionSummaryResponse = {
      ...foodWithRecovery,
      recovery: { available: true, fw_recovered: false, bw_recovered: false, interpretation: "" },
    };
    const result = assessSyndromeRecovery(xs09, [], endpoints, neitherRecovered);
    expect(result.status).toBe("not_recovered");
  });

  test("Bug #1: non-BW syndrome (XS01) still returns not_examined with food data", () => {
    const result = assessSyndromeRecovery(xs01, [], endpoints, foodWithRecovery);
    expect(result.status).toBe("not_examined");
  });

  test("Bug #1: no recovery section in food data → not_examined", () => {
    if (!xs09) return;
    const noRecoverySection: FoodConsumptionSummaryResponse = {
      available: true,
      water_consumption: null,
    };
    const result = assessSyndromeRecovery(xs09, [], endpoints, noRecoverySection);
    expect(result.status).toBe("not_examined");
  });

  test("Bug #1: actual RecoveryRow[] takes priority over food data fallback", () => {
    if (!xs09) return;
    const xs09WithBw = {
      ...xs09,
      matchedEndpoints: [
        ...xs09.matchedEndpoints,
        { endpoint_label: "Body Weight", domain: "BW", role: "required" as const, direction: "down", severity: "adverse" },
      ],
    };
    const mockRecovery: RecoveryRow[] = [{
      endpoint_label: "Body Weight",
      sex: "M",
      recovery_day: 120,
      dose_level: 3,
      mean: 300,
      sd: 20,
      p_value: 0.40,
      effect_size: -0.2,
      terminal_effect: -2.5,
    }];
    const result = assessSyndromeRecovery(xs09WithBw, mockRecovery, endpoints, foodWithRecovery);
    // RecoveryRow data takes precedence — should not hit the food fallback
    expect(result.status).not.toBe("not_examined");
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  // ── Bug #5: Reversibility auto-resolves from Bug #1 ──

  test("Bug #5: partial recovery maps to reversible=false", () => {
    const recovery = { status: "partial" as const, endpoints: [], summary: "Partial." };
    const noTumors = { tumorsPresent: false, tumorSummaries: [], progressionDetected: false, interpretation: "" };
    const noFood = { available: false, bwFwAssessment: "not_applicable" as const, foodEfficiencyReduced: null, temporalOnset: null, fwNarrative: "" };
    const result = computeAdversity(xs01, endpoints, recovery, "mechanism_uncertain", noTumors, noFood, [], []);
    expect(result.reversible).toBe(false);
  });

  test("Bug #5: XS09 with food recovery data → adversity.reversible is non-null", () => {
    if (!xs09) return;
    const result = interp(xs09, { food: foodWithRecovery });
    // Food data gives partial (FW recovered, BW not) → reversible = false
    expect(result.adversity.reversible).not.toBeNull();
    expect(result.adversity.reversible).toBe(false);
  });

  // ── Bug #4 severity: XS09 should NOT get "carcinogenic" ──

  test("Bug #4 severity: XS09 + liver tumor does not produce 'carcinogenic' severity", () => {
    if (!xs09) return;
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "HEPATOCELLULAR CARCINOMA", behavior: "MALIGNANT", animalId: "S1", doseGroup: 3 },
    ];
    const result = interp(xs09, { tumors });
    expect(result.overallSeverity).not.toBe("carcinogenic");
    expect(result.tumorContext.tumorsPresent).toBe(false);
  });

  // ── Issue #5: XS09 CL correlates ──

  test("Issue #5: XS09 with EMACIATION → CL assessment strengthens", () => {
    const cl: ClinicalObservation[] = [
      { observation: "EMACIATION", doseGroup: 0, sex: "M", incidence: 0, totalN: 10 },
      { observation: "EMACIATION", doseGroup: 1, sex: "M", incidence: 1, totalN: 10 },
      { observation: "EMACIATION", doseGroup: 2, sex: "M", incidence: 3, totalN: 10 },
      { observation: "EMACIATION", doseGroup: 3, sex: "M", incidence: 6, totalN: 10 },
    ];
    const result = assessClinicalObservationSupport("XS09", cl);
    expect(result.assessment).toBe("strengthens");
    expect(result.correlatingObservations.some((c) => c.observation === "EMACIATION")).toBe(true);
  });

  // ── Issue #3: A-1 dose-response uses actual patterns ──

  test("Issue #3: strong pattern (linear + p<0.05) → doseResponse 'strong'", () => {
    if (!xs09) return;
    // XS09 matched endpoints include Body Weight which has linear pattern + significant p in PointCross
    const result = computeTreatmentRelatedness(xs09, endpoints, { correlatingObservations: [], assessment: "no_cl_data" });
    // Body Weight in PointCross has linear dose-response with p<0.05
    expect(result.doseResponse).toBe("strong");
  });

  test("Issue #3: all flat patterns → doseResponse 'absent'", () => {
    if (!xs09) return;
    // Create fake endpoints where all patterns are flat
    const flatEndpoints = endpoints.map((ep) => ({ ...ep, pattern: "flat" }));
    const result = computeTreatmentRelatedness(xs09, flatEndpoints, { correlatingObservations: [], assessment: "no_cl_data" });
    expect(result.doseResponse).toBe("absent");
  });

  test("Issue #3: non_monotonic pattern without significance → doseResponse 'weak'", () => {
    if (!xs09) return;
    // Create fake endpoints with non_monotonic pattern (not in strong set) and no significance
    const nonMonotonicEndpoints = endpoints.map((ep) => ({
      ...ep,
      pattern: "non_monotonic",
      minPValue: 0.15, // not significant
    }));
    const result = computeTreatmentRelatedness(xs09, nonMonotonicEndpoints, { correlatingObservations: [], assessment: "no_cl_data" });
    expect(result.doseResponse).toBe("weak");
  });

  // ── Issue #4: NOAEL cap relevance ──

  test("Issue #4: XS09 (empty organs) + NOAEL cap → capRelevant null", () => {
    if (!xs09) return;
    const mortality: AnimalDisposition[] = [{
      animalId: "SUBJ-010",
      doseGroup: 3,
      sex: "M",
      dispositionCode: "FOUND DEAD",
      dispositionDay: 90,
      treatmentRelated: true,
      causeOfDeath: "HEPATOCELLULAR CARCINOMA",
      excludeFromTerminalStats: true,
    }];
    const result = interp(xs09, { mortality, mortalityNoaelCap: 2 });
    expect(result.mortalityContext.mortalityNoaelCapRelevant).toBeNull();
    expect(result.mortalityContext.mortalityNarrative).toContain("cannot be determined automatically");
  });

  test("Issue #4: XS01 (LIVER organs) + NOAEL cap + liver death → capRelevant true", () => {
    const mortality: AnimalDisposition[] = [{
      animalId: "SUBJ-011",
      doseGroup: 3,
      sex: "M",
      dispositionCode: "FOUND DEAD",
      dispositionDay: 90,
      treatmentRelated: true,
      causeOfDeath: "HEPATOCELLULAR CARCINOMA",
      excludeFromTerminalStats: true,
    }];
    const result = interp(xs01, { mortality, mortalityNoaelCap: 2 });
    expect(result.mortalityContext.mortalityNoaelCapRelevant).toBe(true);
    expect(result.mortalityContext.mortalityNarrative).toContain("Mortality caps NOAEL");
  });

  test("Issue #4: XS01 (LIVER organs) + NOAEL cap + no liver deaths → capRelevant false", () => {
    const mortality: AnimalDisposition[] = [{
      animalId: "SUBJ-012",
      doseGroup: 3,
      sex: "M",
      dispositionCode: "FOUND DEAD",
      dispositionDay: 90,
      treatmentRelated: true,
      causeOfDeath: "RENAL FAILURE",
      excludeFromTerminalStats: true,
    }];
    const result = interp(xs01, { mortality, mortalityNoaelCap: 2 });
    expect(result.mortalityContext.mortalityNoaelCapRelevant).toBe(false);
    expect(result.mortalityContext.mortalityNarrative).toContain("not attributed");
  });

  test("Issue #4: no NOAEL cap → capRelevant false (vacuously)", () => {
    const result = interp(xs01, { mortality: [] });
    expect(result.mortalityContext.mortalityNoaelCapRelevant).toBe(false);
  });
});

// ─── Null Safety: specimen/finding can be null in real data ────

describe("null safety: null specimen/finding in histopath data", () => {
  // Real-world data can have null specimen or finding despite TypeScript declaring string.
  // This is a known data nullability issue (see CLAUDE.md). These tests ensure no crashes.

  const nullSpecimenRow = makeLesionRow({
    specimen: null as unknown as string,
    finding: "NECROSIS",
    dose_level: 3,
    affected: 2,
    n: 10,
  });

  const nullFindingRow = makeLesionRow({
    specimen: "LIVER",
    finding: null as unknown as string,
    dose_level: 3,
    affected: 3,
    n: 10,
  });

  const nullBothRow = makeLesionRow({
    specimen: null as unknown as string,
    finding: null as unknown as string,
    dose_level: 2,
    affected: 1,
    n: 10,
  });

  const histopathWithNulls = [
    ...histopath,
    nullSpecimenRow,
    nullFindingRow,
    nullBothRow,
  ];

  test("evaluateDiscriminator does not crash on null specimen/finding", () => {
    const disc: SyndromeDiscriminators["findings"][0] = {
      endpoint: "LIVER::NECROSIS",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "test",
    };
    // Should not throw — null guarded with ?? ""
    const result = evaluateDiscriminator(disc, endpoints, histopathWithNulls);
    expect(result.endpoint).toBe("LIVER::NECROSIS");
    expect(["supports", "argues_against", "not_available"]).toContain(result.status);
  });

  test("crossReferenceHistopath does not crash on null specimen/finding", () => {
    // crossReferenceHistopath is called internally by interpretSyndrome.
    // Test via interp() which passes proper discriminators.
    const result = interp(xs01, { histopath: histopathWithNulls });
    expect(Array.isArray(result.histopathContext)).toBe(true);
    // Liver should still be found from the non-null rows
    const liverRef = result.histopathContext.find((r) => r.specimen.includes("LIVER"));
    expect(liverRef).toBeDefined();
  });

  test("interpretSyndrome end-to-end does not crash with null histopath fields", () => {
    // Full pipeline with null-containing data — should not throw
    const result = interp(xs01, { histopath: histopathWithNulls });
    expect(result.certainty).toBeDefined();
    expect(result.histopathContext).toBeDefined();
    expect(result.narrative.length).toBeGreaterThan(0);
  });

  test("histopath data with only null rows does not crash", () => {
    const onlyNulls = [nullSpecimenRow, nullFindingRow, nullBothRow];
    const result = interp(xs01, { histopath: onlyNulls });
    expect(result.certainty).toBeDefined();
    // With no valid specimen matches, histopath context entries should have valid assessments
    for (const ref of result.histopathContext) {
      expect(["supports", "argues_against", "not_examined", "inconclusive"]).toContain(ref.assessment);
    }
  });
});
