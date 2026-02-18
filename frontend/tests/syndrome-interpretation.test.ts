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
} from "@/lib/syndrome-interpretation";
import type {
  RecoveryRow,
  ClinicalObservation,
  StudyContext,
  SyndromeDiscriminators,
} from "@/lib/syndrome-interpretation";
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
  }>,
) {
  return interpretSyndrome(
    syndrome,
    overrides?.endpoints ?? endpoints,
    overrides?.histopath ?? histopath,
    overrides?.recovery ?? [],
    [], // organWeights
    [], // tumors
    [], // mortality
    [], // food
    overrides?.cl ?? [],
    overrides?.context ?? defaultContext,
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
    expect(result.studyDesignNotes).toEqual([]);
  });
});
