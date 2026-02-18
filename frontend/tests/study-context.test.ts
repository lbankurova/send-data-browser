/**
 * Tests for parseStudyContext and parseIsoDurationDays.
 * Validates ISO 8601 duration parsing, GLP detection, and field mapping.
 */
import { describe, test, expect } from "vitest";
import { parseStudyContext, parseIsoDurationDays } from "@/lib/parse-study-context";
import type { StudyMetadata } from "@/types";

// ─── Helper: minimal StudyMetadata with PointCross-like values ────────

function makeMetadata(overrides?: Partial<StudyMetadata>): StudyMetadata {
  return {
    study_id: "PointCross",
    title: "13-Week Oral Gavage Toxicity Study in Rats",
    protocol: null,
    species: "RAT",
    strain: "SPRAGUE-DAWLEY",
    study_type: "REPEAT DOSE TOXICITY",
    design: "PARALLEL",
    route: "ORAL GAVAGE",
    treatment: "PCDRUG",
    vehicle: "Saline",
    dosing_duration: "P13W",
    start_date: null,
    end_date: null,
    subjects: "150",
    males: "75",
    females: "75",
    sponsor: null,
    test_facility: null,
    study_director: null,
    glp: "GLP",
    send_version: null,
    recovery_sacrifice: "P14D",
    terminal_sacrifice: "P13W",
    ct_version: "SEND Terminology 2017-03-31",
    diet: "STANDARD",
    age_text: "6-7",
    age_unit: "WEEKS",
    sex_population: "BOTH",
    supplier: "Rat Labs",
    domain_count: 16,
    domains: ["DM", "DS", "LB", "MI"],
    dose_groups: null,
    ...overrides,
  };
}

// ─── ISO 8601 duration parsing ───────────────────────────────

describe("parseIsoDurationDays", () => {
  test("P13W → 91 days", () => {
    expect(parseIsoDurationDays("P13W")).toBe(91);
  });

  test("P14D → 14 days", () => {
    expect(parseIsoDurationDays("P14D")).toBe(14);
  });

  test("P6M → ~183 days", () => {
    expect(parseIsoDurationDays("P6M")).toBe(Math.round(6 * 30.44));
  });

  test("null → null", () => {
    expect(parseIsoDurationDays(null)).toBeNull();
  });

  test("empty string → null", () => {
    expect(parseIsoDurationDays("")).toBeNull();
  });

  test("invalid format → null", () => {
    expect(parseIsoDurationDays("13 weeks")).toBeNull();
    expect(parseIsoDurationDays("P")).toBeNull();
    expect(parseIsoDurationDays("P13")).toBeNull();
  });

  test("case insensitive", () => {
    expect(parseIsoDurationDays("p13w")).toBe(91);
    expect(parseIsoDurationDays("P14d")).toBe(14);
  });
});

// ─── parseStudyContext ───────────────────────────────────────

describe("parseStudyContext", () => {
  test("PointCross metadata → correct dosingDurationWeeks (13)", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.dosingDurationWeeks).toBe(13);
  });

  test("PointCross metadata → species RAT", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.species).toBe("RAT");
  });

  test("PointCross metadata → strain SPRAGUE-DAWLEY", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.strain).toBe("SPRAGUE-DAWLEY");
  });

  test("PointCross metadata → route ORAL GAVAGE", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.route).toBe("ORAL GAVAGE");
  });

  test("GLP parsing: non-null glp → glpCompliant true", () => {
    const ctx = parseStudyContext(makeMetadata({ glp: "GLP" }));
    expect(ctx.glpCompliant).toBe(true);
  });

  test("GLP parsing: null glp → glpCompliant false", () => {
    const ctx = parseStudyContext(makeMetadata({ glp: null }));
    expect(ctx.glpCompliant).toBe(false);
  });

  test("GLP parsing: empty string → glpCompliant false", () => {
    const ctx = parseStudyContext(makeMetadata({ glp: "" }));
    expect(ctx.glpCompliant).toBe(false);
  });

  test("recovery period: P14D → 14 days", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.recoveryPeriodDays).toBe(14);
  });

  test("terminal sacrifice: P13W → 13 weeks", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.terminalSacrificeWeeks).toBe(13);
  });

  test("age parsing: 6-7 WEEKS → midpoint 6.5", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.ageAtStartWeeks).toBe(6.5);
  });

  test("estimated necropsy age: 6.5 + 13 = 19.5 weeks", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.estimatedNecropsyAgeWeeks).toBe(19.5);
  });

  test("sex population: BOTH", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.sexPopulation).toBe("BOTH");
  });

  test("planned subjects: males=75, females=75", () => {
    const ctx = parseStudyContext(makeMetadata());
    expect(ctx.plannedSubjectsM).toBe(75);
    expect(ctx.plannedSubjectsF).toBe(75);
  });

  test("null handling: missing fields produce empty strings / null numbers", () => {
    const ctx = parseStudyContext(makeMetadata({
      species: null,
      strain: null,
      route: null,
      dosing_duration: null,
      recovery_sacrifice: null,
      terminal_sacrifice: null,
      age_text: null,
      males: null,
      females: null,
    }));
    expect(ctx.species).toBe("");
    expect(ctx.strain).toBe("");
    expect(ctx.route).toBe("");
    expect(ctx.dosingDurationWeeks).toBeNull();
    expect(ctx.recoveryPeriodDays).toBeNull();
    expect(ctx.terminalSacrificeWeeks).toBeNull();
    expect(ctx.ageAtStartWeeks).toBeNull();
    expect(ctx.estimatedNecropsyAgeWeeks).toBeNull();
    expect(ctx.plannedSubjectsM).toBeNull();
    expect(ctx.plannedSubjectsF).toBeNull();
  });

  // ── ECGInterpretation derivation ──

  test("RAT → qtcTranslational false, no preferred correction", () => {
    const ctx = parseStudyContext(makeMetadata({ species: "RAT" }));
    expect(ctx.ecgInterpretation.qtcTranslational).toBe(false);
    expect(ctx.ecgInterpretation.preferredCorrection).toBeNull();
    expect(ctx.ecgInterpretation.rationale).toContain("Ito-dominated");
  });

  test("MOUSE → qtcTranslational false", () => {
    const ctx = parseStudyContext(makeMetadata({ species: "MOUSE" }));
    expect(ctx.ecgInterpretation.qtcTranslational).toBe(false);
  });

  test("DOG → qtcTranslational true, VanDeWater correction", () => {
    const ctx = parseStudyContext(makeMetadata({ species: "DOG" }));
    expect(ctx.ecgInterpretation.qtcTranslational).toBe(true);
    expect(ctx.ecgInterpretation.preferredCorrection).toBe("VanDeWater");
    expect(ctx.ecgInterpretation.rationale).toContain("gold-standard");
  });

  test("BEAGLE → same as DOG", () => {
    const ctx = parseStudyContext(makeMetadata({ species: "BEAGLE" }));
    expect(ctx.ecgInterpretation.qtcTranslational).toBe(true);
    expect(ctx.ecgInterpretation.preferredCorrection).toBe("VanDeWater");
  });

  test("CYNOMOLGUS MONKEY → Fridericia correction", () => {
    const ctx = parseStudyContext(makeMetadata({ species: "CYNOMOLGUS MONKEY" }));
    expect(ctx.ecgInterpretation.qtcTranslational).toBe(true);
    expect(ctx.ecgInterpretation.preferredCorrection).toBe("Fridericia");
    expect(ctx.ecgInterpretation.rationale).toContain("non-human primates");
  });

  test("MACAQUE → same as monkey (NHP)", () => {
    const ctx = parseStudyContext(makeMetadata({ species: "MACAQUE" }));
    expect(ctx.ecgInterpretation.qtcTranslational).toBe(true);
    expect(ctx.ecgInterpretation.preferredCorrection).toBe("Fridericia");
  });

  test("unknown species → qtcTranslational false, no preferred correction", () => {
    const ctx = parseStudyContext(makeMetadata({ species: "GUINEA PIG" }));
    expect(ctx.ecgInterpretation.qtcTranslational).toBe(false);
    expect(ctx.ecgInterpretation.preferredCorrection).toBeNull();
  });

  test("null species → defaults to unknown", () => {
    const ctx = parseStudyContext(makeMetadata({ species: null }));
    expect(ctx.ecgInterpretation.qtcTranslational).toBe(false);
    expect(ctx.ecgInterpretation.preferredCorrection).toBeNull();
  });
});
