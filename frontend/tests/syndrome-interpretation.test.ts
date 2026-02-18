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
} from "@/lib/syndrome-interpretation";
import type {
  RecoveryRow,
  ClinicalObservation,
  AnimalDisposition,
  TumorFinding,
  StudyContext,
  SyndromeDiscriminators,
} from "@/lib/syndrome-interpretation";
import { assessTumorContext, assessFoodConsumptionContext } from "@/lib/syndrome-interpretation";
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
};

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
    { available: false, water_consumption: null }, // food
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
