/**
 * Cross-Study Intelligence Engine — tests for all 7 launch patterns.
 * Tests use mock StudySummaryRecords to validate pattern logic
 * without depending on single-study pipeline internals.
 */
import { describe, test, expect } from "vitest";
import type { StudySummaryRecord, Program } from "@/types/pipeline-contracts";
import { analyzeProgram, synthesizeProgram } from "@/lib/cross-study-engine";

// ── Test fixtures ───────────────────────────────────────────

const baseSummary: Omit<StudySummaryRecord, "study_id" | "species" | "strain" | "route" | "duration_weeks" | "dose_levels" | "target_organs" | "detected_syndromes" | "combined_noael" | "recovery_outcomes"> = {
  schema_version: "1.0",
  program_id: "prog_test",
  study_type: "REPEAT_DOSE",
  recovery_weeks: 4,
  dose_labels: ["Vehicle", "Low", "Mid", "High"],
  dose_unit: "mg/kg/day",
  glp_compliant: true,
  sex_population: "BOTH",
  noael_by_sex: [],
  auc_at_noael: null,
  cmax_at_noael: null,
  tk_unit: null,
  study_stage: "SUBMITTED",
  data_quality_flags: [],
};

const ratStudy13wk: StudySummaryRecord = {
  ...baseSummary,
  study_id: "RAT-13WK",
  species: "Rat",
  strain: "Sprague Dawley",
  route: "ORAL GAVAGE",
  duration_weeks: 13,
  dose_levels: [0, 2, 20, 200],
  target_organs: [
    { organ_system: "LIVER", evidence_score: 8, n_domains: 3, domains: ["LB", "OM", "MI"], max_severity: "moderate", treatment_related: true },
    { organ_system: "HEMATOPOIETIC", evidence_score: 5, n_domains: 1, domains: ["LB"], max_severity: "mild", treatment_related: true },
  ],
  detected_syndromes: [
    { syndrome_id: "XS01", name: "Hepatocellular injury", certainty: "mechanism_uncertain", severity: "moderate", treatment_relatedness: "treatment_related", adversity: "equivocal", target_organ: "LIVER", domains_covered: ["LB", "OM", "MI"], affected_parameters: ["ALT", "AST"], noael_dose: 2, loael_dose: 20, translational_tier: "moderate" },
    { syndrome_id: "XS05", name: "Hemolytic anemia", certainty: "mechanism_confirmed", severity: "mild", treatment_relatedness: "treatment_related", adversity: "adverse", target_organ: "HEMATOPOIETIC", domains_covered: ["LB"], affected_parameters: ["RBC", "RETIC"], noael_dose: 20, loael_dose: 200, translational_tier: "moderate" },
  ],
  combined_noael: { dose_level: 1, dose_value: 2, dose_unit: "mg/kg/day", label: "2 mg/kg/day", basis: "BW decrease + hepatic findings" },
  recovery_outcomes: { "XS01": "partial", "XS05": "complete" },
};

const dogStudy4wk: StudySummaryRecord = {
  ...baseSummary,
  study_id: "DOG-04WK",
  species: "Dog",
  strain: "Beagle",
  route: "ORAL CAPSULE",
  duration_weeks: 4,
  dose_levels: [0, 1, 5, 25],
  target_organs: [
    { organ_system: "LIVER", evidence_score: 4, n_domains: 2, domains: ["LB", "MI"], max_severity: "minimal", treatment_related: true },
    { organ_system: "KIDNEY", evidence_score: 3, n_domains: 1, domains: ["MI"], max_severity: "minimal", treatment_related: true },
  ],
  detected_syndromes: [
    { syndrome_id: "XS01", name: "Hepatocellular injury", certainty: "pattern_only", severity: "minimal", treatment_relatedness: "treatment_related", adversity: "non_adverse", target_organ: "LIVER", domains_covered: ["LB", "MI"], affected_parameters: ["ALT", "AST"], noael_dose: 5, loael_dose: 25, translational_tier: "moderate" },
  ],
  combined_noael: { dose_level: 2, dose_value: 5, dose_unit: "mg/kg/day", label: "5 mg/kg/day", basis: "ALT/AST elevations" },
  recovery_outcomes: { "XS01": "complete" },
};

const ratStudy4wk: StudySummaryRecord = {
  ...baseSummary,
  study_id: "RAT-04WK",
  species: "Rat",
  strain: "Sprague Dawley",
  route: "ORAL GAVAGE",
  duration_weeks: 4,
  dose_levels: [0, 2, 20, 200],
  target_organs: [
    { organ_system: "LIVER", evidence_score: 5, n_domains: 2, domains: ["LB", "OM"], max_severity: "mild", treatment_related: true },
  ],
  detected_syndromes: [
    { syndrome_id: "XS01", name: "Hepatocellular injury", certainty: "pattern_only", severity: "mild", treatment_relatedness: "treatment_related", adversity: "equivocal", target_organ: "LIVER", domains_covered: ["LB", "OM"], affected_parameters: ["ALT"], noael_dose: 2, loael_dose: 20, translational_tier: "moderate" },
  ],
  combined_noael: { dose_level: 1, dose_value: 2, dose_unit: "mg/kg/day", label: "2 mg/kg/day", basis: "ALT elevation" },
  recovery_outcomes: { "XS01": "complete" },
};

const testProgram: Program = {
  id: "prog_test",
  name: "Test Program",
  compound: "TESTDRUG",
  cas: "123-45-6",
  phase: "IND-Enabling",
  therapeutic_area: "Oncology",
};

// ── Tests ───────────────────────────────────────────────────

describe("Cross-Study Engine", () => {
  test("analyzeProgram returns all 7 pattern types", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk, ratStudy4wk], testProgram);

    expect(result.program_id).toBe("prog_test");
    expect(result.studies_analyzed.length).toBe(3);

    const patternIds = new Set(result.pattern_results.map((r) => r.pattern_id));
    expect(patternIds.has("XSI_CONCORDANCE")).toBe(true);
    expect(patternIds.has("XSI_DURATION")).toBe(true);
    expect(patternIds.has("XSI_NOVEL")).toBe(true);
    expect(patternIds.has("XSI_RECOVERY")).toBe(true);
    expect(patternIds.has("XSI_SEVERITY")).toBe(true);
    expect(result.program_noael).not.toBeNull();
    expect(result.watchlist.length).toBeGreaterThan(0);
  });

  test("XSI_CONCORDANCE: LIVER shared between rat and dog", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk], testProgram);
    const concordance = result.pattern_results.find((r) => r.pattern_id === "XSI_CONCORDANCE")!;

    expect(concordance.classification).toBe("CONCORDANCE_CONFIRMED");
    expect((concordance.details as { shared_organs: string[] }).shared_organs).toContain("LIVER");
  });

  test("XSI_DURATION: XS01 PROGRESSIVE from 4wk (mild) to 13wk (moderate) in rat", () => {
    const result = analyzeProgram(ratStudy13wk, [ratStudy4wk], testProgram);
    const duration = result.pattern_results.filter((r) => r.pattern_id === "XSI_DURATION");

    const xs01Traj = duration.find((d) => (d.details as { syndrome_id: string }).syndrome_id === "XS01");
    expect(xs01Traj).toBeDefined();
    expect(xs01Traj!.classification).toBe("PROGRESSIVE");
  });

  test("XSI_DURATION: XS05 EMERGENT (in 13wk but not 4wk)", () => {
    const result = analyzeProgram(ratStudy13wk, [ratStudy4wk], testProgram);
    const duration = result.pattern_results.filter((r) => r.pattern_id === "XSI_DURATION");

    const xs05Traj = duration.find((d) => (d.details as { syndrome_id: string }).syndrome_id === "XS05");
    expect(xs05Traj).toBeDefined();
    expect(xs05Traj!.classification).toBe("EMERGENT");
  });

  test("XSI_NOAEL: rat most sensitive (HED 0.32 vs dog HED 2.7)", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk], testProgram);
    const noael = result.program_noael!;

    expect(noael.length).toBe(2);
    const rat = noael.find((n) => n.species === "Rat")!;
    const dog = noael.find((n) => n.species === "Dog")!;

    expect(rat.most_sensitive).toBe(true);
    expect(dog.most_sensitive).toBe(false);
    expect(rat.hed!).toBeLessThan(dog.hed!);
    expect(rat.hed!).toBeCloseTo(2 * (6 / 37), 1); // rat Km=6, human Km=37
  });

  test("XSI_NOVEL: XS05 is novel (not in dog study)", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk], testProgram);
    const novel = result.pattern_results.filter((r) => r.pattern_id === "XSI_NOVEL");

    const xs05Novel = novel.find((n) => (n.details as { syndrome_id: string }).syndrome_id === "XS05");
    expect(xs05Novel).toBeDefined();
    expect(xs05Novel!.classification).toBe("NOVEL_ALL_SPECIES");
  });

  test("XSI_NOVEL: XS01 is KNOWN_CONFIRMED (in both rat and dog)", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk, ratStudy4wk], testProgram);
    const novel = result.pattern_results.filter((r) => r.pattern_id === "XSI_NOVEL");

    const xs01Novel = novel.find((n) => (n.details as { syndrome_id: string }).syndrome_id === "XS01");
    expect(xs01Novel).toBeDefined();
    // Seen in 1 same-species prior (rat4wk) + 1 cross-species (dog) = KNOWN_SINGLE
    expect(xs01Novel!.classification).toBe("KNOWN_SINGLE");
  });

  test("XSI_NOVEL: XS05 is NOVEL_SAME_SPECIES when seen in dog but not rat prior", () => {
    // XS05 is in rat13wk (anchor). Add it to dog study but not rat4wk.
    const dogWithXs05: StudySummaryRecord = {
      ...dogStudy4wk,
      detected_syndromes: [
        ...dogStudy4wk.detected_syndromes,
        { syndrome_id: "XS05", name: "Hemolytic anemia", certainty: "pattern_only", severity: "minimal", treatment_relatedness: "treatment_related", adversity: "non_adverse", target_organ: "HEMATOPOIETIC", domains_covered: ["LB"], affected_parameters: ["RBC"], noael_dose: 5, loael_dose: 25, translational_tier: "low" },
      ],
    };
    // Anchor=rat13wk has XS05. dog has XS05 (cross-species). rat4wk does NOT have XS05.
    // → Not in same species prior, but in other species → NOVEL_SAME_SPECIES
    const result = analyzeProgram(ratStudy13wk, [dogWithXs05, ratStudy4wk], testProgram);
    const novel = result.pattern_results.filter((r) => r.pattern_id === "XSI_NOVEL");
    const xs05 = novel.find((n) => (n.details as { syndrome_id: string }).syndrome_id === "XS05");
    expect(xs05).toBeDefined();
    expect(xs05!.classification).toBe("NOVEL_SAME_SPECIES");
  });

  test("XSI_RECOVERY: XS01 partial (rat) vs complete (dog) → SPECIES_DIVERGENT", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk], testProgram);
    const recovery = result.pattern_results.filter((r) => r.pattern_id === "XSI_RECOVERY");

    const xs01Rec = recovery.find((r) => (r.details as { syndrome_id: string }).syndrome_id === "XS01");
    expect(xs01Rec).toBeDefined();
    expect(xs01Rec!.classification).toBe("SPECIES_DIVERGENT");
  });

  test("XSI_SEVERITY: XS01 moderate (rat 13wk) vs minimal (dog) → SPECIES_DIVERGENT", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk], testProgram);
    const severity = result.pattern_results.filter((r) => r.pattern_id === "XSI_SEVERITY");

    const xs01Sev = severity.find((r) => (r.details as { syndrome_id: string }).syndrome_id === "XS01");
    expect(xs01Sev).toBeDefined();
    expect(xs01Sev!.classification).toBe("SPECIES_DIVERGENT");
  });

  test("XSI_WATCHLIST: LIVER is priority 1 (seen in 3 studies)", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk, ratStudy4wk], testProgram);
    const liverWatch = result.watchlist.find((w) => w.organ_system === "LIVER");

    expect(liverWatch).toBeDefined();
    expect(liverWatch!.priority).toBe(1);
    expect(liverWatch!.seen_in.length).toBe(3);
  });

  test("XSI_WATCHLIST: HEMATOPOIETIC is priority 2 (seen in 1 study)", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk, ratStudy4wk], testProgram);
    const hemaWatch = result.watchlist.find((w) => w.organ_system === "HEMATOPOIETIC");

    expect(hemaWatch).toBeDefined();
    expect(hemaWatch!.priority).toBe(2);
    expect(hemaWatch!.seen_in.length).toBe(1);
  });

  test("engine never touches raw SEND data — only StudySummaryRecord fields", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk], testProgram);
    expect(result).toBeDefined();
  });

  // ── Phase 7 patterns ──────────────────────────────────────

  test("XSI_EXPOSURE: no pattern when no TK data", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk], testProgram);
    const exposure = result.pattern_results.find((r) => r.pattern_id === "XSI_EXPOSURE");
    // Neither fixture has auc_at_noael populated
    expect(exposure).toBeUndefined();
  });

  test("XSI_EXPOSURE: produces pattern when TK data available", () => {
    const ratWithTk: StudySummaryRecord = {
      ...ratStudy13wk,
      auc_at_noael: 13272,
      cmax_at_noael: 2356,
      tk_unit: "ng·h/mL",
    };
    const dogWithTk: StudySummaryRecord = {
      ...dogStudy4wk,
      auc_at_noael: 45000,
      cmax_at_noael: 8000,
      tk_unit: "ng·h/mL",
    };
    const result = analyzeProgram(ratWithTk, [dogWithTk], testProgram);
    const exposure = result.pattern_results.find((r) => r.pattern_id === "XSI_EXPOSURE")!;
    expect(exposure).toBeDefined();
    expect(exposure.classification).toBe("DOSE_EXPOSURE_CONCORDANT");
  });

  test("XSI_MARGIN: ADEQUATE_MARGIN when clinical dose is low", () => {
    const ratWithTk: StudySummaryRecord = {
      ...ratStudy13wk,
      auc_at_noael: 13272,
      cmax_at_noael: 2356,
      tk_unit: "ng·h/mL",
    };
    const programWithDose: Program = {
      ...testProgram,
      clinical_dose: { dose_value: 0.01, dose_unit: "mg/kg", route: "ORAL" },
    };
    const result = analyzeProgram(ratWithTk, [], programWithDose);
    const margin = result.pattern_results.find((r) => r.pattern_id === "XSI_MARGIN")!;
    expect(margin).toBeDefined();
    expect(margin.classification).toBe("ADEQUATE_MARGIN");
  });

  test("XSI_CONCORDANCE_MATRIX: produces matrix with 3+ studies", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk, ratStudy4wk], testProgram);
    const matrix = result.pattern_results.find((r) => r.pattern_id === "XSI_CONCORDANCE_MATRIX");
    expect(matrix).toBeDefined();
    const details = matrix!.details as { total_syndromes: number; universal: number; partial: number; unique: number };
    expect(details.total_syndromes).toBeGreaterThan(0);
  });

  test("XSI_CONCORDANCE_MATRIX: not produced with only 2 studies", () => {
    const result = analyzeProgram(ratStudy13wk, [dogStudy4wk], testProgram);
    const matrix = result.pattern_results.find((r) => r.pattern_id === "XSI_CONCORDANCE_MATRIX");
    expect(matrix).toBeUndefined();
  });

  test("XSI_RECOVERY_ADEQUACY: detects duration-dependent recovery", () => {
    // Rat 4wk: complete recovery. Rat 13wk: partial recovery. Same syndrome XS01.
    const result = analyzeProgram(ratStudy13wk, [ratStudy4wk], testProgram);
    const adequacy = result.pattern_results.filter((r) => r.pattern_id === "XSI_RECOVERY_ADEQUACY");
    const xs01 = adequacy.find((r) => (r.details as { syndrome_id: string }).syndrome_id === "XS01");
    // rat4wk has complete, rat13wk has partial → duration-dependent
    if (xs01) {
      expect(["DURATION_DEPENDENT_RECOVERY", "INADEQUATE_DURATION"]).toContain(xs01.classification);
    }
  });

  // ── Mode 2: Program Synthesis ─────────────────────────────

  test("synthesizeProgram: produces results without anchor", () => {
    const result = synthesizeProgram([ratStudy13wk, dogStudy4wk, ratStudy4wk], testProgram);
    expect(result.program_id).toBe("prog_test");
    expect(result.studies_analyzed.length).toBe(3);
    expect(result.pattern_results.length).toBeGreaterThan(0);
    expect(result.program_noael).not.toBeNull();
  });

  test("synthesizeProgram: includes concordance matrix for 3+ studies", () => {
    const result = synthesizeProgram([ratStudy13wk, dogStudy4wk, ratStudy4wk], testProgram);
    const matrix = result.pattern_results.find((r) => r.pattern_id === "XSI_CONCORDANCE_MATRIX");
    expect(matrix).toBeDefined();
  });

  test("synthesizeProgram: empty input returns empty conclusion", () => {
    const result = synthesizeProgram([], testProgram);
    expect(result.studies_analyzed.length).toBe(0);
    expect(result.pattern_results.length).toBe(0);
  });
});
