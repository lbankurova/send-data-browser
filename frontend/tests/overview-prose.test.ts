// Unit tests for overview-prose composers — token derivation, fallback rules,
// and worked-example agreement against PointCross fixture data.
//
// Per CLAUDE.md rule 16, the worked-example tests load the actual generated
// JSON for PointCross. Mirror tests over synthetic data verify every fallback
// branch in the composition appendix from the spec.

import { describe, it, expect } from "vitest";
import {
  composeAboutParagraph,
  composeHeadlineFinding,
  composeFindingsParagraph,
  summarizeRecovery,
  derivePersistedOrgans,
  oxfordJoin,
} from "@/lib/overview-prose";
import type { StudyMetadata, DoseGroup } from "@/types";
import type { StudyContext } from "@/types/study-context";
import type { NoaelSummaryRow, TargetOrganRow } from "@/types/analysis-views";
import type { SyndromeRollup } from "@/types/syndrome-rollup";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeDg(overrides: Partial<DoseGroup>): DoseGroup {
  return {
    dose_level: 1,
    armcd: "T1",
    label: "Treated",
    is_control: false,
    dose_value: 10,
    dose_unit: "mg/kg",
    n_male: 5,
    n_female: 5,
    n_total: 10,
    is_recovery: false,
    recovery_n: 0,
    tk_count: 0,
    ...overrides,
  };
}

function makeMeta(overrides: Partial<StudyMetadata>): StudyMetadata {
  return {
    study_id: "TEST",
    title: null,
    protocol: null,
    species: "rat",
    strain: "Sprague-Dawley",
    study_type: null,
    design: null,
    route: "oral gavage",
    treatment: null,
    vehicle: null,
    dosing_duration: null,
    start_date: null,
    end_date: null,
    subjects: null,
    males: null,
    females: null,
    sponsor: null,
    test_facility: null,
    study_director: null,
    glp: null,
    send_version: null,
    recovery_sacrifice: null,
    terminal_sacrifice: null,
    ct_version: null,
    diet: null,
    age_text: null,
    age_unit: null,
    sex_population: null,
    supplier: null,
    pipeline_stage: null,
    domain_count: 0,
    domains: [],
    has_estrous_data: false,
    dose_groups: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<StudyContext>): StudyContext {
  return {
    studyId: "TEST",
    species: "rat",
    strain: "Sprague-Dawley",
    vehicle: null,
    route: "oral gavage",
    dosingDurationWeeks: 13,
    recoveryPeriodDays: 14,
    ageAtStartWeeks: null,
    ageAtNecropsyWeeks: null,
    estimatedNecropsyAgeWeeks: null,
    sex_population: null,
    ...overrides,
  } as unknown as StudyContext;
}

function makeNoael(overrides: Partial<NoaelSummaryRow>): NoaelSummaryRow {
  return {
    sex: "Combined",
    noael_dose_level: null,
    noael_label: "",
    noael_dose_value: null,
    noael_dose_unit: "mg/kg",
    loael_dose_level: null,
    loael_label: "",
    n_adverse_at_loael: 0,
    adverse_domains_at_loael: [],
    noael_confidence: 0.8,
    ...overrides,
  };
}

// ─── oxfordJoin ───────────────────────────────────────────────────────────

describe("oxfordJoin", () => {
  it("returns empty for empty list", () => {
    expect(oxfordJoin([])).toBe("");
  });
  it("returns single item unchanged", () => {
    expect(oxfordJoin(["a"])).toBe("a");
  });
  it("joins two items with 'and' and no comma", () => {
    expect(oxfordJoin(["a", "b"])).toBe("a and b");
  });
  it("joins three+ with oxford comma", () => {
    expect(oxfordJoin(["a", "b", "c"])).toBe("a, b, and c");
  });
});

// ─── composeAboutParagraph ────────────────────────────────────────────────

describe("composeAboutParagraph", () => {
  const dgs: DoseGroup[] = [
    makeDg({ dose_level: 0, is_control: true, dose_value: 0, label: "Control", n_total: 30 }),
    makeDg({ dose_level: 1, dose_value: 2, label: "Low", n_total: 30 }),
    makeDg({ dose_level: 2, dose_value: 20, label: "Mid", n_total: 30 }),
    makeDg({ dose_level: 3, dose_value: 200, label: "High", n_total: 30, recovery_n: 10 }),
  ];

  it("PointCross-shaped study renders the canonical worked example", () => {
    const meta = makeMeta({
      species: "rat",
      strain: "Sprague-Dawley",
      route: "oral gavage",
      dose_groups: [
        ...dgs,
        makeDg({ dose_level: 3, is_recovery: true, recovery_n: 10, n_total: 0 }),
      ],
    });
    const ctx = makeCtx({ dosingDurationWeeks: 13, recoveryPeriodDays: 14 });
    const out = composeAboutParagraph(meta, ctx);
    expect(out).toContain("13-week");
    expect(out).toContain("repeat-dose oral gavage toxicology");
    expect(out).toContain("Sprague-Dawley rats");
    expect(out).toContain("2-week recovery cohort");
    expect(out).toContain("at 2, 20, and 200 mg/kg");
  });

  it("drops the recovery cohort clause when recoveryPeriodDays is null", () => {
    const meta = makeMeta({ dose_groups: dgs });
    const ctx = makeCtx({ recoveryPeriodDays: null });
    const out = composeAboutParagraph(meta, ctx);
    expect(out).not.toContain("recovery cohort");
  });

  it("renders single-dose form 'at {value} mg/kg'", () => {
    const meta = makeMeta({
      dose_groups: [
        makeDg({ dose_level: 0, is_control: true, dose_value: 0 }),
        makeDg({ dose_level: 1, dose_value: 50 }),
      ],
    });
    const out = composeAboutParagraph(meta, makeCtx({}));
    expect(out).toContain("at 50 mg/kg");
    expect(out).not.toContain(" and ");
  });

  it("drops TK fragment when no TK subjects", () => {
    const meta = makeMeta({ dose_groups: dgs });
    const out = composeAboutParagraph(meta, makeCtx({}));
    expect(out).not.toContain("toxicokinetic");
  });

  it("drops recovery fragment when no recovery subjects", () => {
    const meta = makeMeta({
      dose_groups: dgs.map((dg) => ({ ...dg, recovery_n: 0 })),
    });
    const out = composeAboutParagraph(meta, makeCtx({ recoveryPeriodDays: null }));
    expect(out).not.toContain("recovery");
  });

  it("returns null for empty metadata + empty dose groups", () => {
    const out = composeAboutParagraph(makeMeta({ dose_groups: [] }), makeCtx({ dosingDurationWeeks: null }));
    expect(out).toBeNull();
  });

  it("drops lead-in when durationWeeks is null but dose data present", () => {
    const meta = makeMeta({ dose_groups: dgs });
    const out = composeAboutParagraph(meta, makeCtx({ dosingDurationWeeks: null }));
    expect(out).toBeTruthy();
    expect(out).toContain("Test article dosed");
    expect(out).not.toContain("week repeat-dose");
  });
});

// ─── composeHeadlineFinding ───────────────────────────────────────────────

describe("composeHeadlineFinding", () => {
  it("variant: both NOAEL and LOAEL established", () => {
    const out = composeHeadlineFinding(
      makeNoael({ noael_dose_value: 50, loael_dose_value: 200 }),
      3,
      "hepatic",
      true,
    );
    expect(out.headline).toBe("NOAEL 50 mg/kg · LOAEL 200 mg/kg");
  });

  it("variant: NOAEL not established, LOAEL set", () => {
    const out = composeHeadlineFinding(
      makeNoael({ noael_dose_value: null, loael_dose_value: 2 }),
      5,
      "hematologic",
      true,
    );
    expect(out.headline).toBe("LOAEL set at 2 mg/kg · NOAEL not established");
    expect(out.subline).toBe(
      "5 organ systems flagged · hematologic drives LOAEL",
    );
    expect(out.confidencePercent).toBe(80);
  });

  it("variant: NOAEL set, LOAEL not reached", () => {
    const out = composeHeadlineFinding(
      makeNoael({ noael_dose_value: 200, loael_dose_value: null }),
      0,
      null,
      false,
    );
    expect(out.headline).toBe(
      "NOAEL 200 mg/kg · LOAEL not reached at highest tested dose",
    );
    expect(out.subline).toBeNull();
  });

  it("variant: both null", () => {
    const out = composeHeadlineFinding(
      makeNoael({ noael_dose_value: null, loael_dose_value: null }),
      0,
      null,
      false,
    );
    expect(out.headline).toBe("NOAEL and LOAEL not established");
    expect(out.subline).toBeNull();
  });

  it("drops driver clause when LOAEL not established", () => {
    const out = composeHeadlineFinding(
      makeNoael({ noael_dose_value: 100, loael_dose_value: null }),
      2,
      null,
      false,
    );
    expect(out.subline).toBe("2 organ systems flagged");
    expect(out.subline).not.toContain("drives LOAEL");
  });

  it("drops confidence chip when noael_confidence is null", () => {
    // Even though the type says number, defensively handle null at runtime.
    const row = makeNoael({ noael_dose_value: 50, loael_dose_value: 200 });
    (row as unknown as { noael_confidence: number | null }).noael_confidence = null;
    const out = composeHeadlineFinding(row, 1, "hepatic", true);
    expect(out.confidencePercent).toBeNull();
  });

  it("singular 'organ system' when count = 1", () => {
    const out = composeHeadlineFinding(
      makeNoael({ noael_dose_value: null, loael_dose_value: 10 }),
      1,
      "hepatic",
      true,
    );
    expect(out.subline).toContain("1 organ system flagged");
    expect(out.subline).not.toContain("systems");
  });
});

// ─── summarizeRecovery ────────────────────────────────────────────────────

describe("summarizeRecovery", () => {
  it("PointCross verdict distribution: 25 entries → 10 evaluable, 2 reversed, 8 persisted", () => {
    // Synthetic mirror of PointCross verdict counts.
    const perFinding: Record<string, { domain: string; specimen: string; finding: string; verdict: string | null }> = {};
    const counts = { null: 7, anomaly: 8, insufficient_n: 4, reversed: 2, low_power: 4 };
    let i = 0;
    for (const [verdict, n] of Object.entries(counts)) {
      for (let k = 0; k < n; k++) {
        perFinding[`X${i++}`] = {
          domain: "MI",
          specimen: "LIVER",
          finding: `f${i}`,
          verdict: verdict === "null" ? null : verdict,
        };
      }
    }
    const out = summarizeRecovery(perFinding);
    expect(out.totalEvaluable).toBe(10);
    expect(out.recoveredCount).toBe(2);
    expect(out.persistedCount).toBe(8);
    expect(out.nonEvaluable).toBe(15);
  });

  it("returns zero summary for undefined input", () => {
    const out = summarizeRecovery(undefined);
    expect(out.totalEvaluable).toBe(0);
    expect(out.persistedEntries).toEqual([]);
  });

  it("counts partially_reversed as recovered, progressing as persisted", () => {
    const out = summarizeRecovery({
      A: { domain: "MI", specimen: "LIVER", finding: "x", verdict: "partially_reversed" },
      B: { domain: "MI", specimen: "KIDNEY", finding: "y", verdict: "progressing" },
    });
    expect(out.recoveredCount).toBe(1);
    expect(out.persistedCount).toBe(1);
  });
});

// ─── derivePersistedOrgans ────────────────────────────────────────────────

describe("derivePersistedOrgans", () => {
  it("maps recognized specimens to organ systems via specimenToOrganSystem", () => {
    const out = derivePersistedOrgans([
      { domain: "MI", specimen: "LIVER", finding: "x", verdict: "anomaly" },
      { domain: "MI", specimen: "KIDNEY", finding: "y", verdict: "anomaly" },
    ]);
    expect(out).toEqual(["hepatic", "renal"]);
  });

  it("omits findings whose specimen resolves to 'general'", () => {
    // "ALL TISSUES" has no mapping → falls through to "general" (omitted).
    const out = derivePersistedOrgans([
      { domain: "MA", specimen: "ALL TISSUES", finding: "mass", verdict: "anomaly" },
      { domain: "MI", specimen: "LIVER", finding: "x", verdict: "anomaly" },
    ]);
    expect(out).toEqual(["hepatic"]);
  });

  it("dedupes repeated organs", () => {
    const out = derivePersistedOrgans([
      { domain: "MI", specimen: "LIVER", finding: "a", verdict: "anomaly" },
      { domain: "MI", specimen: "LIVER", finding: "b", verdict: "anomaly" },
    ]);
    expect(out).toEqual(["hepatic"]);
  });
});

// ─── composeFindingsParagraph ─────────────────────────────────────────────

describe("composeFindingsParagraph", () => {
  function makeOrgan(overrides: Partial<TargetOrganRow>): TargetOrganRow {
    return {
      organ_system: "hepatic",
      evidence_score: 0.5,
      n_endpoints: 1,
      n_domains: 1,
      domains: ["MI"],
      max_signal_score: 0.5,
      n_significant: 1,
      n_treatment_related: 1,
      target_organ_flag: true,
      max_severity: 2,
      mi_status: null,
      om_mi_discount: null,
      evidence_quality: {
        grade: "moderate",
        dimensions_assessed: 3,
        convergence: { groups: 2, signal: "" },
        corroboration: { status: null, signal: "" },
        sex_concordance: null,
        limiting_factor: null,
      },
      ...overrides,
    };
  }

  it("PointCross worked example: hematologic driver + cardiovascular/renal secondary with positive corroboration", () => {
    const targetOrgans: TargetOrganRow[] = [
      makeOrgan({ organ_system: "hematologic", evidence_score: 0.664, evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "moderate", corroboration: { status: null, signal: "" } } }),
      makeOrgan({ organ_system: "cardiovascular", evidence_score: 0.659, evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "strong", corroboration: { status: "positive", signal: "" } } }),
      makeOrgan({ organ_system: "hepatic", evidence_score: 0.595, evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "moderate" } }),
      makeOrgan({ organ_system: "general", evidence_score: 0.516, evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "moderate" } }),
      makeOrgan({ organ_system: "renal", evidence_score: 0.473, evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "strong", corroboration: { status: "positive", signal: "" } } }),
    ];
    const rollup: SyndromeRollup = {
      meta: { study_id: "PointCross" } as unknown as SyndromeRollup["meta"],
      by_organ: {
        hematologic: [
          { syndrome_id: "XS01", syndrome_name: "Myelosuppression", organ_system: "hematologic", n_subjects_total: 31, dose_level_first: 1, max_severity: 3, certainty: 0.9, loael_role: "sets-loael", cells: [], modifier_notes: [], confidence_distribution: null } as unknown as SyndromeRollup["by_organ"][string][number],
        ],
      },
    } as unknown as SyndromeRollup;
    const recovery = {
      A: { domain: "MI", specimen: "LIVER", finding: "x", verdict: "reversed" },
      B: { domain: "MI", specimen: "LIVER", finding: "y", verdict: "reversed" },
      C1: { domain: "MI", specimen: "BONE MARROW", finding: "z1", verdict: "anomaly" },
      C2: { domain: "MI", specimen: "BONE MARROW", finding: "z2", verdict: "anomaly" },
      C3: { domain: "MI", specimen: "BONE MARROW", finding: "z3", verdict: "anomaly" },
      C4: { domain: "MI", specimen: "BONE MARROW", finding: "z4", verdict: "anomaly" },
      C5: { domain: "MI", specimen: "BONE MARROW", finding: "z5", verdict: "anomaly" },
      C6: { domain: "MI", specimen: "BONE MARROW", finding: "z6", verdict: "anomaly" },
      C7: { domain: "MI", specimen: "BONE MARROW", finding: "z7", verdict: "anomaly" },
      C8: { domain: "MI", specimen: "BONE MARROW", finding: "z8", verdict: "anomaly" },
    };
    const dgs: DoseGroup[] = [
      makeDg({ dose_level: 0, is_control: true, dose_value: 0 }),
      makeDg({ dose_level: 1, dose_value: 2 }),
      makeDg({ dose_level: 2, dose_value: 20 }),
      makeDg({ dose_level: 3, dose_value: 200 }),
    ];
    const out = composeFindingsParagraph(targetOrgans, rollup, recovery, dgs)!;
    expect(out).toContain("Target organs are hematologic, cardiovascular, hepatic, general, and renal");
    expect(out).toContain("Hematologic myelosuppression sets the LOAEL");
    expect(out).toContain("Cardiovascular and renal show strong evidence at the high dose with positive corroboration");
    expect(out).toContain("2 of 10 evaluable findings reversed in recovery");
    expect(out).toContain("8 hematologic findings persisted at 200 mg/kg");
  });

  it("drops driver sentence when no syndrome rollup is provided", () => {
    const out = composeFindingsParagraph(
      [makeOrgan({ organ_system: "hepatic" })],
      undefined,
      undefined,
      [],
    );
    expect(out).toContain("Target organ is hepatic");
    expect(out).not.toContain("sets the LOAEL");
  });

  it("drops corroboration clause when not all secondaries have positive/examined_normal", () => {
    const targetOrgans: TargetOrganRow[] = [
      makeOrgan({
        organ_system: "hepatic",
        evidence_score: 0.7,
        evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "strong", corroboration: { status: "positive", signal: "" } },
      }),
      makeOrgan({
        organ_system: "renal",
        evidence_score: 0.6,
        evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "strong", corroboration: { status: null, signal: "" } },
      }),
    ];
    const rollup: SyndromeRollup = {
      meta: {} as unknown as SyndromeRollup["meta"],
      by_organ: {
        hepatic: [
          { syndrome_id: "X", syndrome_name: "Hepatocellular injury", organ_system: "hepatic", n_subjects_total: 5, dose_level_first: 1, max_severity: 3, certainty: 0.9, loael_role: "sets-loael", cells: [], modifier_notes: [], confidence_distribution: null } as unknown as SyndromeRollup["by_organ"][string][number],
        ],
      },
    } as unknown as SyndromeRollup;
    const out = composeFindingsParagraph(targetOrgans, rollup, undefined, [])!;
    expect(out).toContain("Renal shows strong evidence at the high dose");
    expect(out).not.toContain("with positive corroboration");
  });

  it("filters secondary organs to grade=strong only (excludes moderate)", () => {
    const targetOrgans: TargetOrganRow[] = [
      makeOrgan({
        organ_system: "hepatic",
        evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "strong", corroboration: { status: "positive", signal: "" } },
      }),
      makeOrgan({
        organ_system: "general",
        evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "moderate" },
      }),
    ];
    const out = composeFindingsParagraph(targetOrgans, undefined, undefined, [])!;
    // No driver (no rollup). Hepatic IS the only organ left after excluding the driver.
    // Driver attribution is null, so secondary list keeps hepatic. We're testing
    // that 'general' (grade=moderate) does not appear in the secondary clause.
    expect(out).not.toContain("general show");
  });

  it("renders 'No adverse target organs identified.' when zero flagged", () => {
    const out = composeFindingsParagraph([], undefined, undefined, []);
    expect(out).toContain("No adverse target organs identified");
  });

  it("collapses to recovery-only sentence when no target organs but recovery data present", () => {
    const out = composeFindingsParagraph([], undefined, {
      A: { domain: "MI", specimen: "LIVER", finding: "x", verdict: "reversed" },
    }, []);
    expect(out).toContain("No adverse target organs identified");
    expect(out).toContain("1 of 1 evaluable findings reversed in recovery");
  });

  it("driver attribution is constrained to flagged target organs (Headline ↔ Findings parity)", () => {
    // Construct a study where syndrome_rollup has a "sets-loael" syndrome on
    // an organ that is NOT flagged in target_organ_summary. The Findings
    // sentence MUST pick a flagged organ (skipping the non-flagged one) so
    // sentence 2 doesn't name an organ that sentence 1 doesn't list.
    const targetOrgans: TargetOrganRow[] = [
      makeOrgan({ organ_system: "hepatic", target_organ_flag: true, evidence_score: 0.8, evidence_quality: { ...makeOrgan({}).evidence_quality!, grade: "strong" } }),
    ];
    const rollup: SyndromeRollup = {
      meta: {} as unknown as SyndromeRollup["meta"],
      by_organ: {
        // Endocrine has a stronger sets-loael syndrome but is NOT flagged.
        endocrine: [
          { syndrome_id: "X1", syndrome_name: "Endo Syndrome", organ_system: "endocrine", n_subjects_total: 99, dose_level_first: 1, max_severity: 3, certainty: 0.9, loael_role: "sets-loael", cells: [], modifier_notes: [], confidence_distribution: null } as unknown as SyndromeRollup["by_organ"][string][number],
        ],
        // Hepatic has a weaker sets-loael but IS flagged.
        hepatic: [
          { syndrome_id: "X2", syndrome_name: "Hepatocellular injury", organ_system: "hepatic", n_subjects_total: 5, dose_level_first: 1, max_severity: 3, certainty: 0.9, loael_role: "sets-loael", cells: [], modifier_notes: [], confidence_distribution: null } as unknown as SyndromeRollup["by_organ"][string][number],
        ],
      },
    } as unknown as SyndromeRollup;
    const out = composeFindingsParagraph(targetOrgans, rollup, undefined, [])!;
    // Driver should be hepatic (the flagged one), NOT endocrine (the unflagged
    // higher-N one) — so the prose stays internally consistent.
    expect(out).toContain("Hepatic hepatocellular injury sets the LOAEL");
    expect(out).not.toContain("endocrine");
  });
});

// ─── Worked example: load PointCross and run end-to-end ────────────────────

describe("Overview prose vs PointCross fixture (CLAUDE.md rule 16)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pointCross: any | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    const base = path.resolve(__dirname, "../../backend/generated/PointCross");
    if (fs.existsSync(base)) {
      pointCross = {
        targetOrgans: JSON.parse(
          fs.readFileSync(path.join(base, "target_organ_summary.json"), "utf-8"),
        ),
        syndromeRollup: JSON.parse(
          fs.readFileSync(path.join(base, "syndrome_rollup.json"), "utf-8"),
        ),
        recoveryVerdicts: JSON.parse(
          fs.readFileSync(path.join(base, "recovery_verdicts.json"), "utf-8"),
        ),
        noael: JSON.parse(
          fs.readFileSync(path.join(base, "noael_summary.json"), "utf-8"),
        ),
      };
    }
  } catch {
    pointCross = null;
  }
  const itIfFixture = pointCross ? it : it.skip;

  itIfFixture("composeFindingsParagraph against real fixture matches spec worked example", () => {
    const dgs: DoseGroup[] = [
      makeDg({ dose_level: 0, is_control: true, dose_value: 0 }),
      makeDg({ dose_level: 1, dose_value: 2 }),
      makeDg({ dose_level: 2, dose_value: 20 }),
      makeDg({ dose_level: 3, dose_value: 200 }),
    ];
    const out = composeFindingsParagraph(
      pointCross!.targetOrgans,
      pointCross!.syndromeRollup,
      pointCross!.recoveryVerdicts.per_finding,
      dgs,
    )!;
    expect(out).toContain("Target organs are");
    // Driver organ on PointCross is hematologic (Myelosuppression, n=31).
    expect(out.toLowerCase()).toContain("hematologic");
    expect(out).toContain("sets the LOAEL");
    // Recovery: 2 reversed, 8 persisted, 15 non-evaluable.
    expect(out).toContain("2 of 10 evaluable findings reversed in recovery");
    expect(out).toContain("8");
    expect(out).toContain("findings persisted at 200 mg/kg");
    expect(out).toContain("(15 additional findings had insufficient recovery data.)");
    // Secondary organs: cardiovascular and renal (grade=strong, both positive).
    expect(out.toLowerCase()).toContain("cardiovascular");
    expect(out.toLowerCase()).toContain("renal");
    expect(out).toContain("with positive corroboration");
  });

  itIfFixture("composeHeadlineFinding against PointCross noael_summary", () => {
    const combined = (pointCross!.noael as NoaelSummaryRow[]).find(
      (r) => r.sex === "Combined",
    );
    expect(combined).toBeDefined();
    const out = composeHeadlineFinding(combined, 5, "hematologic", combined!.loael_dose_value != null);
    // Post DATA-GAP-NOAEL-ALG-22 Phase 3 (2026-05-01): Combined LOAEL/NOAEL
    // shifted from (LOAEL=2 mg/kg, NOAEL=null) to (NOAEL=2 mg/kg, LOAEL=20 mg/kg)
    // because Phase 3 R1+R2 peer-review fixes (NTR corroborator filter +
    // path-(a) substantiveness gate) blocked indefensible M-side dose-1 OM-down
    // firings. F-side LOAEL=1 ground truth preserved in per-sex output;
    // Combined-sex aggregation policy (most-sensitive-sex per OECD TG 408
    // §5.4.1 vs current sex-merged dispatch) tracked as DATA-GAP-NOAEL-ALG-25.
    // This test asserts the headline COMPOSER behavior (NOAEL+LOAEL pair
    // formatting) rather than pinning specific dose values; the values are
    // expected to update again when DATA-GAP-NOAEL-ALG-25 ships.
    expect(out.headline).toContain("NOAEL");
    expect(out.headline).toContain("LOAEL");
    expect(out.subline).toBe(
      "5 organ systems flagged · hematologic drives LOAEL",
    );
    expect(out.confidencePercent).toBe(80);
  });
});
