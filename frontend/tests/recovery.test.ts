/**
 * Recovery assessment, classification, and finding nature tests.
 *
 * Tests the pure functions in:
 * - recovery-assessment.ts (CLASS-10): computeVerdict, worstVerdict, format helpers
 * - recovery-classification.ts (CLASS-20): classifyRecovery
 * - finding-nature.ts (CLASS-19): classifyFindingNature, reversibilityLabel
 */
import { describe, test, expect } from "vitest";
import {
  computeVerdict,
  worstVerdict,
  verdictPriority,
  verdictArrow,
  verdictLabel,
  formatRecoveryFraction,
  assessRecoveryAdequacy,
  deriveRecoveryAssessments,
  deriveRecoveryAssessmentsSexAware,
  DEFAULT_VERDICT_THRESHOLDS,
} from "@/lib/recovery-assessment";
import type {
  RecoveryVerdict,
  RecoveryAssessment,
  RecoveryDoseAssessment,
} from "@/lib/recovery-assessment";
import type { SubjectHistopathEntry } from "@/types/timecourse";
import {
  classifyRecovery,
  CLASSIFICATION_LABELS,
} from "@/lib/recovery-classification";
import type {
  RecoveryContext,
  RecoveryClassificationType,
} from "@/lib/recovery-classification";
import {
  discriminateAnomaly,
  isPrecursorOf,
  PRECURSOR_MAP,
  DELAYED_ONSET_PROPENSITY,
} from "@/lib/anomaly-discrimination";
import {
  classifyFindingNature,
  reversibilityLabel,
} from "@/lib/finding-nature";
import type { FindingNatureInfo } from "@/lib/finding-nature";
import {
  lookupRecoveryDuration,
  lookupContinuousRecovery,
  computeUncertaintyBands,
} from "@/lib/recovery-duration-table";
import type { LookupConfidence } from "@/lib/recovery-duration-table";

// ─── Test helpers ────────────────────────────────────────

interface ArmStats {
  n: number;
  examined: number;
  affected: number;
  incidence: number;
  avgSeverity: number;
  maxSeverity: number;
}

function arm(overrides: Partial<ArmStats> = {}): ArmStats {
  const base: ArmStats = {
    n: 10,
    examined: 10,
    affected: 5,
    incidence: 0.5,
    avgSeverity: 2.0,
    maxSeverity: 3,
  };
  const a = { ...base, ...overrides };
  // Auto-derive incidence from affected/examined if not explicitly overridden
  if (overrides.affected !== undefined && overrides.incidence === undefined && a.examined > 0) {
    a.incidence = a.affected / a.examined;
  }
  return a;
}

function doseAssessment(
  overrides: Partial<RecoveryDoseAssessment> & { main?: Partial<ArmStats>; recovery?: Partial<ArmStats> } = {},
): RecoveryDoseAssessment {
  const main = arm(overrides.main ?? {});
  const recovery = arm({ n: 5, examined: 5, affected: 1, avgSeverity: 0.5, maxSeverity: 1, ...overrides.recovery });
  return {
    doseLevel: 1,
    doseGroupLabel: "Dose 1",
    main,
    recovery: { ...recovery, subjectDetails: [] },
    verdict: computeVerdict(main, recovery),
    ...overrides,
    // Re-apply main/recovery after spread to avoid override conflicts
  } as RecoveryDoseAssessment;
}

function assessment(
  finding: string,
  doses: RecoveryDoseAssessment[],
  overall?: RecoveryVerdict,
): RecoveryAssessment {
  return {
    finding,
    assessments: doses,
    overall: overall ?? worstVerdict(doses.map((d) => d.verdict)),
  };
}

function context(overrides: Partial<RecoveryContext> = {}): RecoveryContext {
  return {
    isAdverse: true,
    doseConsistency: "Strong",
    doseResponsePValue: 0.001,
    clinicalClass: null,
    signalClass: "adverse",
    historicalControlIncidence: null,
    crossDomainCorroboration: null,
    recoveryPeriodDays: null,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════
// computeVerdict — guard chain
// ═════════════════════════════════════════════════════════

describe("computeVerdict — guard chain", () => {
  test("Guard 0: not_examined when recovery.examined === 0", () => {
    const v = computeVerdict(arm(), arm({ examined: 0 }));
    expect(v).toBe("not_examined");
  });

  test("Guard 1: insufficient_n when recovery.examined < 3", () => {
    const v = computeVerdict(arm(), arm({ examined: 2, n: 5, affected: 1, avgSeverity: 1, maxSeverity: 1 }));
    expect(v).toBe("insufficient_n");
  });

  test("Guard 2: anomaly when main incidence=0 but recovery has findings", () => {
    const v = computeVerdict(
      arm({ incidence: 0, affected: 0 }),
      arm({ n: 5, examined: 5, affected: 2 }),
    );
    expect(v).toBe("anomaly");
  });

  test("Guard 3 (v4): not_observed when both arms have zero findings", () => {
    // v4 fix: not_observed now precedes low_power. When main.incidence === 0,
    // both arms are clean negatives — verdict should be not_observed, not low_power.
    const v = computeVerdict(
      arm({ incidence: 0, affected: 0 }),
      arm({ n: 5, examined: 5, affected: 0, incidence: 0 }),
    );
    expect(v).toBe("not_observed");
  });

  test("Guard 3 (v4): not_observed even with large recovery group", () => {
    const v = computeVerdict(
      arm({ incidence: 0, affected: 0, n: 20, examined: 20 }),
      arm({ n: 10, examined: 10, affected: 0, incidence: 0 }),
    );
    expect(v).toBe("not_observed");
  });

  test("Guard 4 (v4): low_power when main has low incidence and recovery N is small", () => {
    // main incidence=0.1, recovery.examined=5 → 0.1 * 5 = 0.5 < 2
    const v = computeVerdict(
      arm({ incidence: 0.1, affected: 1 }),
      arm({ n: 5, examined: 5, affected: 0, incidence: 0 }),
    );
    expect(v).toBe("low_power");
  });

  test("Guard 5: reversed when recovery.incidence === 0 (tissue examined, no findings)", () => {
    const v = computeVerdict(
      arm({ incidence: 0.5, affected: 5 }),
      arm({ n: 5, examined: 5, affected: 0, incidence: 0 }),
    );
    expect(v).toBe("reversed");
  });

  test("v4 guard order: anomaly fires before not_observed when recovery has findings", () => {
    // main=0 affected, recovery>0 affected → anomaly (Guard 2), NOT not_observed (Guard 3)
    const v = computeVerdict(
      arm({ incidence: 0, affected: 0 }),
      arm({ n: 5, examined: 5, affected: 1 }),
    );
    expect(v).toBe("anomaly");
  });

  test("v4 low_power boundary: product exactly 2.0 passes guard", () => {
    // main.incidence * recovery.examined = 0.4 * 5 = 2.0 → NOT < 2, so guard passes
    const v = computeVerdict(
      arm({ incidence: 0.4, affected: 4 }),
      arm({ n: 5, examined: 5, affected: 0, incidence: 0 }),
    );
    // Should pass low_power (product = 2.0 is NOT < 2) and hit Guard 5 → reversed
    expect(v).toBe("reversed");
  });

  test("v4 low_power boundary: product just below 2.0 triggers guard", () => {
    // main.incidence * recovery.examined = 0.3 * 5 = 1.5 < 2 → low_power
    const v = computeVerdict(
      arm({ incidence: 0.3, affected: 3 }),
      arm({ n: 5, examined: 5, affected: 0, incidence: 0 }),
    );
    expect(v).toBe("low_power");
  });
});

// ═════════════════════════════════════════════════════════
// computeVerdict — ratio computation
// ═════════════════════════════════════════════════════════

describe("computeVerdict — ratio computation", () => {
  test("progressing when incidence ratio > 1.1 and recovery affected > main", () => {
    const v = computeVerdict(
      arm({ incidence: 0.3, affected: 3, avgSeverity: 2.0 }),
      arm({ n: 10, examined: 10, affected: 5, incidence: 0.5, avgSeverity: 2.0, maxSeverity: 3 }),
    );
    expect(v).toBe("progressing");
  });

  test("progressing when severity ratio > 1.2", () => {
    const v = computeVerdict(
      arm({ incidence: 0.5, affected: 5, avgSeverity: 2.0 }),
      arm({ n: 5, examined: 5, affected: 3, incidence: 0.6, avgSeverity: 2.5, maxSeverity: 4 }),
    );
    expect(v).toBe("progressing");
  });

  test("reversed when incidence ratio ≤ 0.2 and severity ratio ≤ 0.3", () => {
    const v = computeVerdict(
      arm({ incidence: 0.5, affected: 5, avgSeverity: 2.0 }),
      arm({ n: 5, examined: 5, affected: 0, incidence: 0.1, avgSeverity: 0.3, maxSeverity: 1 }),
    );
    expect(v).toBe("reversed");
  });

  test("reversing when incidence ratio ≤ 0.5 (but not reversed thresholds)", () => {
    const v = computeVerdict(
      arm({ incidence: 0.5, affected: 5, avgSeverity: 2.0 }),
      arm({ n: 5, examined: 5, affected: 1, incidence: 0.2, avgSeverity: 1.5, maxSeverity: 2 }),
    );
    expect(v).toBe("reversing");
  });

  test("reversing when severity ratio ≤ 0.5 (but incidence not low enough)", () => {
    const v = computeVerdict(
      arm({ incidence: 0.5, affected: 5, avgSeverity: 3.0 }),
      arm({ n: 5, examined: 5, affected: 2, incidence: 0.4, avgSeverity: 1.0, maxSeverity: 1 }),
    );
    expect(v).toBe("reversing");
  });

  test("persistent when ratios are in the middle range", () => {
    const v = computeVerdict(
      arm({ incidence: 0.5, affected: 5, avgSeverity: 2.0 }),
      arm({ n: 5, examined: 5, affected: 3, incidence: 0.6, avgSeverity: 1.5, maxSeverity: 2 }),
    );
    // incidence ratio = 0.6/0.5 = 1.2 → > 1.1 but affected(3) not > main(5) → not progressing
    // severity ratio = 1.5/2.0 = 0.75 → not > 1.2 → not progressing
    // incidence ratio 1.2 > 0.5 and sev ratio 0.75 > 0.5 → not reversing
    expect(v).toBe("persistent");
  });
});

// ═════════════════════════════════════════════════════════
// computeVerdict — v4 duration awareness
// ═════════════════════════════════════════════════════════

describe("computeVerdict — duration awareness", () => {
  const hypertrophyNature: FindingNatureInfo = {
    nature: "adaptive",
    expected_reversibility: "high",
    typical_recovery_weeks: 6,
    reversibilityQualifier: "expected",
    source: "substring_match",
  };

  test("persistent verdict unchanged despite short recovery period (duration awareness removed)", () => {
    // recovery period 2 weeks < typical 6 weeks — duration no longer overrides per-dose verdict
    const v = computeVerdict(
      arm({ incidence: 0.5, affected: 5, avgSeverity: 2.0 }),
      arm({ n: 5, examined: 5, affected: 3, incidence: 0.6, avgSeverity: 1.5, maxSeverity: 2 }),
      DEFAULT_VERDICT_THRESHOLDS,
      14, // 2 weeks
      hypertrophyNature,
    );
    expect(v).toBe("persistent");
  });

  test("no duration override when recovery period >= typical weeks", () => {
    const v = computeVerdict(
      arm({ incidence: 0.5, affected: 5, avgSeverity: 2.0 }),
      arm({ n: 5, examined: 5, affected: 3, incidence: 0.6, avgSeverity: 1.5, maxSeverity: 2 }),
      DEFAULT_VERDICT_THRESHOLDS,
      56, // 8 weeks > typical 6 weeks
      hypertrophyNature,
    );
    expect(v).toBe("persistent"); // No override — had enough time
  });

  test("no duration override for irreversible findings (none)", () => {
    const fibrosisNature: FindingNatureInfo = {
      nature: "degenerative",
      expected_reversibility: "none",
      typical_recovery_weeks: null,
      reversibilityQualifier: "none",
      source: "substring_match",
    };
    const v = computeVerdict(
      arm({ incidence: 0.5, affected: 5, avgSeverity: 2.0 }),
      arm({ n: 5, examined: 5, affected: 3, incidence: 0.6, avgSeverity: 1.5, maxSeverity: 2 }),
      DEFAULT_VERDICT_THRESHOLDS,
      14, // 2 weeks
      fibrosisNature,
    );
    expect(v).toBe("persistent"); // fibrosis is irreversible — no duration override
  });
});

// ═════════════════════════════════════════════════════════
// worstVerdict
// ═════════════════════════════════════════════════════════

describe("worstVerdict", () => {
  test("returns anomaly as worst (highest priority)", () => {
    expect(worstVerdict(["reversed", "anomaly", "reversing"])).toBe("anomaly");
  });

  test("returns progressing over persistent", () => {
    expect(worstVerdict(["persistent", "progressing", "reversed"])).toBe("progressing");
  });

  test("returns persistent over reversing", () => {
    expect(worstVerdict(["reversing", "persistent"])).toBe("persistent");
  });

  test("returns no_data for empty array", () => {
    expect(worstVerdict([])).toBe("no_data");
  });
});

// ═════════════════════════════════════════════════════════
// Verdict display helpers
// ═════════════════════════════════════════════════════════

describe("verdict display helpers", () => {
  test("verdictPriority returns index for known verdicts", () => {
    expect(verdictPriority("anomaly")).toBe(0);
    expect(verdictPriority("reversed")).toBe(6);
    expect(verdictPriority("no_data")).toBe(9);
  });

  test("verdictPriority returns max for undefined", () => {
    expect(verdictPriority(undefined)).toBe(10); // VERDICT_PRIORITY.length (recovery_too_short removed)
  });

  test("verdictArrow returns correct symbols", () => {
    expect(verdictArrow("reversed")).toBe("\u2193");      // ↓
    expect(verdictArrow("progressing")).toBe("\u2191");    // ↑
    expect(verdictArrow("persistent")).toBe("\u2192");     // →
    expect(verdictArrow("not_examined")).toBe("\u2205");   // ∅
  });

  test("verdictLabel formats verdict with arrow and display name", () => {
    expect(verdictLabel("reversed")).toBe("\u2193 reversed");
    expect(verdictLabel("insufficient_n")).toBe("\u2020 insufficient N");
    expect(verdictLabel("not_examined")).toBe("\u2205 not examined");
    expect(verdictLabel("low_power")).toBe("~ low power");
  });
});

// ═════════════════════════════════════════════════════════
// formatRecoveryFraction
// ═════════════════════════════════════════════════════════

describe("formatRecoveryFraction", () => {
  test("standard format when examined === n", () => {
    expect(formatRecoveryFraction(2, 10, 10)).toBe("2/10 (20%)");
  });

  test("examination-aware format when examined < n", () => {
    expect(formatRecoveryFraction(2, 8, 10)).toBe("2/8 (25%) [of 10]");
  });

  test("not examined format when examined === 0", () => {
    expect(formatRecoveryFraction(0, 0, 10)).toBe("\u2014/10 (not examined)");
  });

  test("zero affected with full examination", () => {
    expect(formatRecoveryFraction(0, 5, 5)).toBe("0/5 (0%)");
  });
});

// ═════════════════════════════════════════════════════════
// assessRecoveryAdequacy
// ═════════════════════════════════════════════════════════

describe("assessRecoveryAdequacy", () => {
  test("adequate when actual weeks >= expected weeks", () => {
    // Generic fallback matches LIVER hypertrophy_hepatocellular: range {1–4 weeks}
    // assessRecoveryAdequacy uses recovery_weeks_range.high (conservative) = 4
    const nature = classifyFindingNature("Hypertrophy");
    const result = assessRecoveryAdequacy(42, nature); // 6 weeks
    expect(result).not.toBeNull();
    expect(result!.adequate).toBe(true);
    expect(result!.actualWeeks).toBe(6);
    expect(result!.expectedWeeks).toBe(4);
    expect(result!.findingNature).toBe("adaptive");
  });

  test("inadequate when actual weeks < expected weeks", () => {
    const nature = classifyFindingNature("Hypertrophy");
    const result = assessRecoveryAdequacy(14, nature); // 2 weeks
    expect(result).not.toBeNull();
    expect(result!.adequate).toBe(false);
    expect(result!.actualWeeks).toBe(2);
    expect(result!.expectedWeeks).toBe(4);
    expect(result!.findingNature).toBe("adaptive");
  });

  test("returns null when recoveryDays is null", () => {
    const nature = classifyFindingNature("Hypertrophy");
    expect(assessRecoveryAdequacy(null, nature)).toBeNull();
  });

  test("adequate for irreversible findings regardless of duration", () => {
    const nature = classifyFindingNature("Fibrosis"); // expected_reversibility: "none"
    const result = assessRecoveryAdequacy(7, nature); // 1 week
    expect(result).not.toBeNull();
    expect(result!.adequate).toBe(true);
    expect(result!.expectedWeeks).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════
// classifyFindingNature
// ═════════════════════════════════════════════════════════

describe("classifyFindingNature", () => {
  test("matches adaptive keywords", () => {
    // Generic fallback: LIVER hypertrophy_hepatocellular {low:1, high:4}, midpoint=3
    const r = classifyFindingNature("Hypertrophy");
    expect(r.nature).toBe("adaptive");
    expect(r.expected_reversibility).toBe("high");
    expect(r.typical_recovery_weeks).toBe(3);
    expect(r.recovery_weeks_range).toEqual({ low: 1, high: 4 });
  });

  test("matches degenerative keywords", () => {
    // Generic fallback: LIVER necrosis_hepatocellular {low:1, high:8}, midpoint=5
    const r = classifyFindingNature("Necrosis");
    expect(r.nature).toBe("degenerative");
    expect(r.expected_reversibility).toBe("moderate");
    expect(r.typical_recovery_weeks).toBe(5);
  });

  test("matches proliferative keywords — irreversible", () => {
    const r = classifyFindingNature("Carcinoma");
    expect(r.nature).toBe("proliferative");
    expect(r.expected_reversibility).toBe("none");
    expect(r.typical_recovery_weeks).toBeNull();
  });

  test("matches inflammatory keywords", () => {
    // Generic fallback: LIVER inflammation_portal_lobular {low:2, high:8}, midpoint=5
    const r = classifyFindingNature("Inflammation, chronic");
    expect(r.nature).toBe("inflammatory");
    expect(r.expected_reversibility).toBe("moderate");
    expect(r.typical_recovery_weeks).toBe(5);
  });

  test("matches vascular keywords", () => {
    // "Hemorrhage" may be CT-mapped with high reversibility or keyword-matched with moderate
    const r = classifyFindingNature("Hemorrhage");
    expect(r.nature).toBe("vascular");
    expect(["high", "moderate"]).toContain(r.expected_reversibility);
  });

  test("matches depositional keywords", () => {
    const r = classifyFindingNature("Hemosiderin deposition");
    expect(r.nature).toBe("depositional");
    expect(r.expected_reversibility).toBe("low");
  });

  test("case-insensitive matching", () => {
    const r = classifyFindingNature("HYPERTROPHY, centrilobular");
    expect(r.nature).toBe("adaptive");
  });

  test("returns unknown for unrecognized finding", () => {
    const r = classifyFindingNature("Some Unknown Finding XYZ");
    expect(r.nature).toBe("unknown");
  });

  test("severity modulation — low severity adaptive (S_MODEST)", () => {
    // LIVER hypertrophy_hepatocellular, S_MODEST, sev=1 (minimal=1.0)
    // weeks = {1*1, 4*1} = {1, 4}, midpoint=3
    const r = classifyFindingNature("Hypertrophy", 1);
    expect(r.reversibilityQualifier).toBe("expected");
    expect(r.typical_recovery_weeks).toBe(3);
  });

  test("severity modulation — mid severity adaptive (S_MODEST)", () => {
    // LIVER hypertrophy_hepatocellular, calibrated sev=3 (moderate=1.3)
    // weeks = {1*1.3, 4*1.3} = {1.3, 5.2}, midpoint=round(3.25)=3
    const r = classifyFindingNature("Hypertrophy", 3);
    expect(r.reversibilityQualifier).toBe("expected");
    expect(r.typical_recovery_weeks).toBe(3);
  });

  test("severity modulation — marked severity adaptive (S_MODEST)", () => {
    // LIVER hypertrophy_hepatocellular, S_MODEST, sev=4 (marked=1.5)
    // weeks = {1.5, 6}, midpoint=round(3.75)=4, qualifier stays "expected"
    const r = classifyFindingNature("Hypertrophy", 4);
    expect(r.reversibilityQualifier).toBe("expected");
    expect(r.typical_recovery_weeks).toBe(4);
  });

  test("severity modulation — threshold model caps at marked (S_THRESH)", () => {
    // LIVER inflammation_portal_lobular, S_THRESH, sev=4 (marked=null → cap)
    // Reversibility downgraded: "possible" → "unlikely", weeks stay {2, 8}, midpoint=5
    const r = classifyFindingNature("Inflammation", 4);
    expect(r.reversibilityQualifier).toBe("unlikely");
    expect(r.typical_recovery_weeks).toBe(5);
    expect(r.severity_capped).toBe(true);
  });

  test("fibrosis is irreversible regardless of severity", () => {
    const r = classifyFindingNature("Fibrosis", 1);
    expect(r.nature).toBe("degenerative");
    expect(r.expected_reversibility).toBe("none");
    expect(r.typical_recovery_weeks).toBeNull();
  });

  // ── Organ-specific lookup tests ────────────────────────────

  test("organ-specific lookup — liver hypertrophy", () => {
    const r = classifyFindingNature("Hypertrophy", null, "LIVER");
    expect(r.nature).toBe("adaptive");
    expect(r.source).toBe("organ_lookup");
    expect(r.organ_key).toBe("LIVER");
    expect(r.recovery_weeks_range).toEqual({ low: 1, high: 4 });
    expect(r.typical_recovery_weeks).toBe(3);
    expect(r.reversibilityQualifier).toBe("expected");
  });

  test("organ-specific lookup — kidney tubular degeneration", () => {
    const r = classifyFindingNature("Tubular degeneration", null, "KIDNEY");
    expect(r.source).toBe("organ_lookup");
    expect(r.organ_key).toBe("KIDNEY");
    expect(r.recovery_weeks_range).toEqual({ low: 1, high: 8 });
    expect(r.reversibilityQualifier).toBe("possible");
  });

  test("organ-specific lookup — thyroid follicular cell hypertrophy", () => {
    const r = classifyFindingNature("Hypertrophy", null, "GLAND, THYROID");
    expect(r.source).toBe("organ_lookup");
    expect(r.organ_key).toBe("THYROID");
    expect(r.recovery_weeks_range).toEqual({ low: 2, high: 4 });
  });

  test("organ-specific lookup — species modifier", () => {
    const r = classifyFindingNature("Hypertrophy", null, "LIVER", "RAT");
    expect(r.source).toBe("organ_lookup");
    // SP_LIVER rat modifier = 1.0 → no change from base {1, 4}
    expect(r.recovery_weeks_range).toEqual({ low: 1, high: 4 });
  });

  test("organ-specific lookup with severity cap (S_THRESH)", () => {
    // Liver necrosis with marked severity → S_THRESH marked=null → cap
    const r = classifyFindingNature("Necrosis", 4, "LIVER");
    expect(r.source).toBe("organ_lookup");
    expect(r.severity_capped).toBe(true);
    expect(r.reversibilityQualifier).toBe("unlikely");
  });

  test("generic fallback without organ still uses lookup table", () => {
    const r = classifyFindingNature("Hypertrophy");
    // Should match via generic fallback (no organ specified)
    expect(r.source).toBe("organ_lookup");
    expect(r.recovery_weeks_range).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════
// reversibilityLabel
// ═════════════════════════════════════════════════════════

describe("reversibilityLabel", () => {
  test("formats adaptive with timeline", () => {
    const info = classifyFindingNature("Hypertrophy");
    const label = reversibilityLabel(info);
    expect(label).toContain("reverse");
    expect(label).toContain("weeks");
  });

  test("formats irreversible finding", () => {
    const info = classifyFindingNature("Fibrosis");
    const label = reversibilityLabel(info);
    expect(label).toContain("Not expected");
  });

  test("handles unknown finding", () => {
    const info = classifyFindingNature("Unknown xyz");
    const label = reversibilityLabel(info);
    // Unknown findings get expected_reversibility="moderate" → "may be reversible"
    expect(label).toContain("reversible");
  });
});

// ═════════════════════════════════════════════════════════
// classifyRecovery — classification ladder
// ═════════════════════════════════════════════════════════

describe("classifyRecovery — classification ladder", () => {
  test("Step 0: UNCLASSIFIABLE for guard verdicts", () => {
    for (const gv of ["not_examined", "insufficient_n", "low_power", "no_data"] as RecoveryVerdict[]) {
      const a = assessment("Finding", [doseAssessment()], gv);
      const r = classifyRecovery(a, context());
      expect(r.classification).toBe("UNCLASSIFIABLE");
      expect(r.rationale).toBeTruthy();
    }
  });

  test("Step 0: not_examined has recommended action", () => {
    const a = assessment("Finding", [doseAssessment()], "not_examined");
    const r = classifyRecovery(a, context());
    expect(r.recommendedAction).toContain("recovery-arm tissue");
  });

  test("Step 0b: UNCLASSIFIABLE for proliferative findings (neoplastic)", () => {
    const a = assessment("Carcinoma", [doseAssessment()], "reversed");
    const proliferativeNature = classifyFindingNature("Carcinoma");
    const r = classifyRecovery(a, context({ findingNature: proliferativeNature }));
    expect(r.classification).toBe("UNCLASSIFIABLE");
    expect(r.confidence).toBe("High"); // Neoplastic = high confidence it won't reverse
    expect(r.rationale).toContain("Neoplastic");
  });

  test("Step 1: INCOMPLETE_RECOVERY when recovery > main, weak dose, non-adverse", () => {
    const d = doseAssessment({
      main: { incidence: 0.2, affected: 2, avgSeverity: 1.0 },
      recovery: { n: 5, examined: 5, affected: 3, incidence: 0.6, avgSeverity: 1.5, maxSeverity: 2 },
      verdict: "progressing",
    });
    const a = assessment("Finding", [d], "progressing");
    const r = classifyRecovery(a, context({
      isAdverse: false,
      doseConsistency: "Weak",
      signalClass: "normal",
    }));
    // PATTERN_ANOMALY removed — anomaly discrimination routes to DELAYED_ONSET_POSSIBLE
    expect(r.classification).toBe("DELAYED_ONSET_POSSIBLE");
  });

  test("Step 2: anomaly discrimination when main ≤10%, recovery ≥20%, non-adverse", () => {
    const d = doseAssessment({
      main: { incidence: 0.05, affected: 1, n: 20, examined: 20, avgSeverity: 0.5 },
      recovery: { n: 5, examined: 5, affected: 2, incidence: 0.4, avgSeverity: 1.0, maxSeverity: 2 },
      verdict: "progressing",
    });
    const a = assessment("Finding", [d], "progressing");
    const r = classifyRecovery(a, context({
      isAdverse: false,
      signalClass: "normal",
    }));
    // Non-adverse progressing now routes through anomaly discrimination
    expect(r.classification).toBe("DELAYED_ONSET_POSSIBLE");
    expect(r.rationale).toBeTruthy();
  });

  test("Step 3: INCOMPLETE_RECOVERY when persistent and significant incidence", () => {
    const d = doseAssessment({
      main: { incidence: 0.5, affected: 5, avgSeverity: 2.0 },
      recovery: { n: 5, examined: 5, affected: 3, incidence: 0.6, avgSeverity: 1.5, maxSeverity: 2 },
      verdict: "persistent",
    });
    const a = assessment("Finding", [d], "persistent");
    const r = classifyRecovery(a, context());
    expect(r.classification).toBe("INCOMPLETE_RECOVERY");
  });

  test("Step 4: EXPECTED_REVERSIBILITY when reversed and adverse", () => {
    const d = doseAssessment({
      main: { incidence: 0.5, affected: 5, avgSeverity: 2.0 },
      recovery: { n: 5, examined: 5, affected: 0, incidence: 0, avgSeverity: 0, maxSeverity: 0 },
      verdict: "reversed",
    });
    const a = assessment("Finding", [d], "reversed");
    const r = classifyRecovery(a, context({ isAdverse: true }));
    expect(r.classification).toBe("EXPECTED_REVERSIBILITY");
  });

  test("Step 4: EXPECTED_REVERSIBILITY when reversing with strong dose consistency", () => {
    const d = doseAssessment({
      main: { incidence: 0.5, affected: 5, avgSeverity: 2.0 },
      recovery: { n: 5, examined: 5, affected: 1, incidence: 0.2, avgSeverity: 0.5, maxSeverity: 1 },
      verdict: "reversing",
    });
    const a = assessment("Finding", [d], "reversing");
    const r = classifyRecovery(a, context({ isAdverse: false, doseConsistency: "Strong", signalClass: "normal" }));
    expect(r.classification).toBe("EXPECTED_REVERSIBILITY");
  });

  test("Step 5: INCIDENTAL_RECOVERY_SIGNAL when non-adverse, weak dose, reversed", () => {
    const d = doseAssessment({
      main: { incidence: 0.5, affected: 5, avgSeverity: 2.0 },
      recovery: { n: 5, examined: 5, affected: 0, incidence: 0, avgSeverity: 0, maxSeverity: 0 },
      verdict: "reversed",
    });
    const a = assessment("Finding", [d], "reversed");
    const r = classifyRecovery(a, context({
      isAdverse: false,
      doseConsistency: "Weak",
      signalClass: "normal",
    }));
    expect(r.classification).toBe("INCIDENTAL_RECOVERY_SIGNAL");
  });
});

// ═════════════════════════════════════════════════════════
// classifyRecovery — confidence model
// ═════════════════════════════════════════════════════════

describe("classifyRecovery — confidence", () => {
  test("high confidence with all inputs provided, strong dose, high N, large delta", () => {
    const d = doseAssessment({
      main: { incidence: 0.8, affected: 16, n: 20, examined: 20, avgSeverity: 3.0 },
      recovery: { n: 10, examined: 10, affected: 1, incidence: 0.1, avgSeverity: 0.5, maxSeverity: 1 },
      verdict: "reversed",
    });
    const a = assessment("Finding", [d], "reversed");
    // Provide ALL optional inputs to avoid "missing inputs → cap Moderate"
    const r = classifyRecovery(a, context({
      isAdverse: true,
      doseConsistency: "Strong",
      doseResponsePValue: 0.001,
      historicalControlIncidence: 0.05,
      crossDomainCorroboration: true,
      recoveryPeriodDays: 28,
    }));
    expect(r.confidence).toBe("High");
  });

  test("confidence capped at Moderate when missing inputs", () => {
    const d = doseAssessment({
      main: { incidence: 0.5, affected: 5, avgSeverity: 2.0 },
      recovery: { n: 5, examined: 5, affected: 0, incidence: 0, avgSeverity: 0, maxSeverity: 0 },
      verdict: "reversed",
    });
    const a = assessment("Finding", [d], "reversed");
    // Missing: historicalControlIncidence, crossDomainCorroboration, recoveryPeriodDays, clinicalClass
    const r = classifyRecovery(a, context({
      isAdverse: true,
      doseConsistency: "Strong",
    }));
    // Has missing inputs → capped at Moderate
    expect(["Moderate", "High"]).toContain(r.confidence);
  });

  test("confidence Low when examined < 5", () => {
    const d = doseAssessment({
      main: { incidence: 0.5, affected: 5, avgSeverity: 2.0 },
      recovery: { n: 4, examined: 4, affected: 0, incidence: 0, avgSeverity: 0, maxSeverity: 0 },
      verdict: "reversed",
    });
    const a = assessment("Finding", [d], "reversed");
    const r = classifyRecovery(a, context());
    expect(r.confidence).toBe("Low");
  });

  test("classification tracks inputs used", () => {
    const d = doseAssessment({
      main: { incidence: 0.5, affected: 5, avgSeverity: 2.0 },
      recovery: { n: 5, examined: 5, affected: 0, incidence: 0, avgSeverity: 0, maxSeverity: 0 },
      verdict: "reversed",
    });
    const a = assessment("Finding", [d], "reversed");
    const r = classifyRecovery(a, context({
      isAdverse: true,
      doseConsistency: "Strong",
      doseResponsePValue: 0.001,
    }));
    expect(r.inputsUsed).toContain("mechanical_verdict");
    expect(r.inputsUsed).toContain("adverse_classification");
    expect(r.inputsUsed).toContain("dose_consistency");
    expect(r.inputsUsed).toContain("dose_response_pvalue");
    expect(r.inputsMissing).toContain("historical_controls");
    expect(r.inputsMissing).toContain("cross_domain_corroboration");
  });
});

// ═════════════════════════════════════════════════════════
// classifyRecovery — ASSESSMENT_LIMITED_BY_DURATION
// ═════════════════════════════════════════════════════════

describe("classifyRecovery — duration-limited classification", () => {
  test("Step 2b: ASSESSMENT_LIMITED_BY_DURATION when inadequate duration + persistent dose", () => {
    // Persistent verdict + 2 weeks recovery (< 6 expected for adaptive)
    const d = doseAssessment({
      main: { incidence: 0.5, affected: 5, avgSeverity: 2.0 },
      recovery: { n: 5, examined: 5, affected: 3, incidence: 0.6, avgSeverity: 1.5, maxSeverity: 2 },
      verdict: "persistent",
    });
    const a = assessment("Finding", [d], "persistent");
    const r = classifyRecovery(a, context({
      isAdverse: true,
      recoveryPeriodDays: 14, // 2 weeks < 6 expected
      findingNature: classifyFindingNature("Hypertrophy"),
    }));
    expect(r.classification).toBe("ASSESSMENT_LIMITED_BY_DURATION");
    expect(r.rationale.toLowerCase()).toContain("recovery period");
  });

  test("Step 2b: no ASSESSMENT_LIMITED_BY_DURATION when all doses reversed", () => {
    // All reversed → short duration doesn't limit assessment
    const d = doseAssessment({
      main: { incidence: 0.5, affected: 5, avgSeverity: 2.0 },
      recovery: { n: 5, examined: 5, affected: 0, incidence: 0, avgSeverity: 0, maxSeverity: 0 },
      verdict: "reversed",
    });
    const a = assessment("Finding", [d], "reversed");
    const r = classifyRecovery(a, context({
      isAdverse: true,
      recoveryPeriodDays: 14, // 2 weeks < 6 expected, but all reversed
      findingNature: classifyFindingNature("Hypertrophy"),
    }));
    expect(r.classification).not.toBe("ASSESSMENT_LIMITED_BY_DURATION");
  });
});

// ═════════════════════════════════════════════════════════
// End-to-end: full pipeline verdict → classification
// ═════════════════════════════════════════════════════════

describe("end-to-end recovery pipeline", () => {
  test("hypertrophy with complete reversal → EXPECTED_REVERSIBILITY", () => {
    const nature = classifyFindingNature("Hypertrophy, centrilobular", 2);
    expect(nature.nature).toBe("adaptive");

    const mainArm = arm({ incidence: 0.6, affected: 6, avgSeverity: 2.0 });
    const recoveryArm = arm({ n: 5, examined: 5, affected: 0, incidence: 0, avgSeverity: 0, maxSeverity: 0 });
    const verdict = computeVerdict(mainArm, recoveryArm);
    expect(verdict).toBe("reversed");

    const d: RecoveryDoseAssessment = {
      doseLevel: 3,
      doseGroupLabel: "Dose 3 (100 mg/kg)",
      main: mainArm,
      recovery: { ...recoveryArm, subjectDetails: [] },
      verdict,
    };
    const a = assessment("Hypertrophy, centrilobular", [d], verdict);
    const cls = classifyRecovery(a, context({
      isAdverse: true,
      doseConsistency: "Strong",
      findingNature: nature,
      recoveryPeriodDays: 28,
    }));
    expect(cls.classification).toBe("EXPECTED_REVERSIBILITY");
  });

  test("necrosis persisting through recovery → INCOMPLETE_RECOVERY", () => {
    const nature = classifyFindingNature("Necrosis, hepatocellular", 3);
    expect(nature.nature).toBe("degenerative");

    const mainArm = arm({ incidence: 0.4, affected: 4, avgSeverity: 2.5 });
    const recoveryArm = arm({ n: 5, examined: 5, affected: 3, incidence: 0.6, avgSeverity: 2.0, maxSeverity: 3 });
    const verdict = computeVerdict(mainArm, recoveryArm);
    // incidence ratio 0.6/0.4=1.5 > 1.1, recovery.affected(3) < main.affected(4) → not progressing via incidence
    // sev ratio 2.0/2.5=0.8 → not progressing via severity
    // incidence ratio 1.5 > 0.5, sev ratio 0.8 > 0.5 → persistent
    expect(verdict).toBe("persistent");

    const d: RecoveryDoseAssessment = {
      doseLevel: 2,
      doseGroupLabel: "Dose 2 (50 mg/kg)",
      main: mainArm,
      recovery: { ...recoveryArm, subjectDetails: [] },
      verdict,
    };
    const a = assessment("Necrosis, hepatocellular", [d], verdict);
    const cls = classifyRecovery(a, context({
      isAdverse: true,
      doseConsistency: "Strong",
      findingNature: nature,
    }));
    expect(cls.classification).toBe("INCOMPLETE_RECOVERY");
  });

  test("carcinoma → UNCLASSIFIABLE (neoplastic cannot reverse)", () => {
    const nature = classifyFindingNature("Hepatocellular carcinoma");
    expect(nature.nature).toBe("proliferative");

    const a = assessment("Hepatocellular carcinoma", [doseAssessment()], "reversed");
    const cls = classifyRecovery(a, context({ findingNature: nature }));
    expect(cls.classification).toBe("UNCLASSIFIABLE");
    expect(cls.rationale).toContain("Neoplastic");
  });
});

// ═════════════════════════════════════════════════════════
// Anomaly discrimination
// ═════════════════════════════════════════════════════════

describe("anomaly discrimination", () => {
  // Helper: make an anomaly dose assessment (0 main → >0 recovery)
  function anomalyDose(overrides: {
    doseLevel?: number;
    recoveryAffected?: number;
    recoveryExamined?: number;
    recoveryAvgSev?: number;
    recoveryMaxSev?: number;
  } = {}): RecoveryDoseAssessment {
    const recExamined = overrides.recoveryExamined ?? 5;
    const recAffected = overrides.recoveryAffected ?? 2;
    return doseAssessment({
      doseLevel: overrides.doseLevel ?? 1,
      doseGroupLabel: `Dose ${overrides.doseLevel ?? 1}`,
      main: { incidence: 0, affected: 0, avgSeverity: 0, maxSeverity: 0 },
      recovery: {
        n: recExamined,
        examined: recExamined,
        affected: recAffected,
        incidence: recAffected / recExamined,
        avgSeverity: overrides.recoveryAvgSev ?? 1.0,
        maxSeverity: overrides.recoveryMaxSev ?? 1,
      },
      verdict: "anomaly",
    });
  }

  test("isPrecursorOf: necrosis → fibrosis", () => {
    expect(isPrecursorOf("Hepatocellular necrosis", "Fibrosis, portal")).toBe(true);
  });

  test("isPrecursorOf: degeneration → necrosis", () => {
    expect(isPrecursorOf("Tubular degeneration", "Necrosis, tubular")).toBe(true);
  });

  test("isPrecursorOf: unrelated findings return false", () => {
    expect(isPrecursorOf("Congestion", "Fibrosis")).toBe(false);
    expect(isPrecursorOf("Vacuolation", "Necrosis")).toBe(false);
  });

  test("precursor in main → delayed_onset", () => {
    // Fibrosis in recovery with necrosis in main arm
    const fibrosisAssessment = assessment("Fibrosis", [anomalyDose()], "anomaly");
    const necrosisAssessment = assessment("Necrosis, hepatocellular", [
      doseAssessment({
        main: { incidence: 0.4, affected: 4, avgSeverity: 2.0 },
        verdict: "reversing",
      }),
    ], "reversing");

    const nature = classifyFindingNature("Fibrosis");
    const result = discriminateAnomaly(
      fibrosisAssessment,
      [fibrosisAssessment, necrosisAssessment],
      context({ findingNature: nature }),
    );

    expect(result.subtype).toBe("delayed_onset");
    expect(result.evidence.precursorInMain).toContain("Necrosis, hepatocellular");
    expect(result.rationale).toContain("Precursor");
  });

  test("precursor dose-related → high confidence", () => {
    // Necrosis at 2 dose levels → dose-related precursor
    const fibrosisAssessment = assessment("Fibrosis", [anomalyDose()], "anomaly");
    const necrosisAssessment = assessment("Necrosis", [
      doseAssessment({ doseLevel: 1, main: { incidence: 0.1, affected: 1 }, verdict: "reversing" }),
      doseAssessment({ doseLevel: 2, main: { incidence: 0.3, affected: 3 }, verdict: "reversing" }),
    ], "reversing");

    const nature = classifyFindingNature("Fibrosis");
    const result = discriminateAnomaly(
      fibrosisAssessment,
      [fibrosisAssessment, necrosisAssessment],
      context({ findingNature: nature }),
    );

    expect(result.subtype).toBe("delayed_onset");
    expect(result.confidence).toBe("High");
  });

  test("dose-response in recovery with high propensity → delayed_onset", () => {
    // Degenerative finding, recovery incidence increases with dose
    const d1 = anomalyDose({ doseLevel: 1, recoveryAffected: 1 });
    const d2 = anomalyDose({ doseLevel: 2, recoveryAffected: 3 });
    const a = assessment("Atrophy, tubular", [d1, d2], "anomaly");

    const nature = classifyFindingNature("Atrophy, tubular");
    expect(nature.nature).toBe("degenerative");

    const result = discriminateAnomaly(a, [a], context({ findingNature: nature }));
    expect(result.subtype).toBe("delayed_onset");
    expect(result.evidence.doseResponseInRecovery).toBe(true);
  });

  test("dose-response in recovery with low propensity → delayed_onset_possible", () => {
    // Adaptive finding with dose-response in recovery
    const d1 = anomalyDose({ doseLevel: 1, recoveryAffected: 1 });
    const d2 = anomalyDose({ doseLevel: 2, recoveryAffected: 3 });
    const a = assessment("Hyperplasia", [d1, d2], "anomaly");

    const nature = classifyFindingNature("Hyperplasia");
    expect(nature.nature).toBe("adaptive");

    const result = discriminateAnomaly(a, [a], context({ findingNature: nature }));
    expect(result.subtype).toBe("delayed_onset_possible");
  });

  test("within HCD → possible_spontaneous", () => {
    const a = assessment("Vacuolation", [anomalyDose({ recoveryAffected: 1 })], "anomaly");
    const nature = classifyFindingNature("Vacuolation");

    const result = discriminateAnomaly(a, [a], context({
      findingNature: nature,
      historicalControlIncidence: 0.15, // 15% HCD, recovery is 1/5=20% ≤ 15%*1.5=22.5%
    }));

    expect(result.subtype).toBe("possible_spontaneous");
    expect(result.evidence.withinHistoricalControl).toBe(true);
  });

  test("single animal, low propensity → possible_spontaneous", () => {
    const a = assessment("Vacuolation", [anomalyDose({ recoveryAffected: 1 })], "anomaly");
    const nature = classifyFindingNature("Vacuolation");
    expect(DELAYED_ONSET_PROPENSITY[nature.nature]).toBe("low");

    const result = discriminateAnomaly(a, [a], context({ findingNature: nature }));
    expect(result.subtype).toBe("possible_spontaneous");
    expect(result.evidence.singleAnimalOnly).toBe(true);
    expect(result.confidence).toBe("Low");
  });

  test("same finding at higher dose in main → delayed_onset_possible (not spontaneous)", () => {
    // Liver hypertrophy: 0/10 main at low dose, 1/5 recovery at low dose,
    // but 5/9 main at high dose (clearly treatment-related at high dose).
    // The low-dose recovery occurrence should NOT be classified as spontaneous.
    const a = assessment("Hypertrophy", [
      // Low dose: anomaly (0 main → 1 recovery)
      anomalyDose({ recoveryAffected: 1, doseLevel: 1 }),
      // High dose: treatment-related (5/9 main, 2/5 recovery → reversing)
      doseAssessment({
        main: { incidence: 0.56, affected: 5, n: 9, examined: 9, avgSeverity: 1.5 },
        recovery: { incidence: 0.40, affected: 2, n: 5, examined: 5, avgSeverity: 1.0 },
        verdict: "reversing",
        doseLevel: 3,
      }),
    ], "anomaly");
    const nature = classifyFindingNature("Hypertrophy");
    expect(nature.nature).toBe("adaptive");

    const result = discriminateAnomaly(a, [a], context({ findingNature: nature }));
    expect(result.subtype).toBe("delayed_onset_possible");
    expect(result.rationale).toContain("higher dose");
  });

  test("same finding NOT at higher dose → still possible_spontaneous for single animal", () => {
    // Only one dose level, anomaly, single animal, adaptive → spontaneous
    const a = assessment("Hypertrophy", [
      anomalyDose({ recoveryAffected: 1, doseLevel: 1 }),
    ], "anomaly");
    const nature = classifyFindingNature("Hypertrophy");

    const result = discriminateAnomaly(a, [a], context({ findingNature: nature }));
    expect(result.subtype).toBe("possible_spontaneous");
  });

  test("fallback → anomaly_unresolved", () => {
    // Multiple animals affected, no precursors, no dose-response, no HCD
    const a = assessment("Some finding", [anomalyDose({ recoveryAffected: 3 })], "anomaly");

    const result = discriminateAnomaly(a, [a], context({
      findingNature: undefined,
    }));

    expect(result.subtype).toBe("anomaly_unresolved");
    expect(result.recommendedAction).toContain("re-review");
  });

  test("anomaly via classifyRecovery → routed through discrimination", () => {
    const a = assessment("Fibrosis", [anomalyDose()], "anomaly");
    const nature = classifyFindingNature("Fibrosis");
    const cls = classifyRecovery(a, context({ findingNature: nature }));
    // Without precursors or dose-response, degenerative anomaly with multiple animals
    // → anomaly_unresolved → UNCLASSIFIABLE
    expect(cls.classification).toBe("UNCLASSIFIABLE");
    expect(cls.inputsUsed).toContain("anomaly_discrimination");
  });

  test("anomaly with precursor via classifyRecovery → DELAYED_ONSET", () => {
    const fibrosisA = assessment("Fibrosis", [anomalyDose()], "anomaly");
    const necrosisA = assessment("Necrosis", [
      doseAssessment({ main: { incidence: 0.3, affected: 3 }, verdict: "reversing" }),
    ], "reversing");

    const nature = classifyFindingNature("Fibrosis");
    const cls = classifyRecovery(fibrosisA, context({
      findingNature: nature,
      allAssessments: [fibrosisA, necrosisA],
    }));

    expect(cls.classification).toBe("DELAYED_ONSET");
    expect(cls.rationale).toContain("Precursor");
  });
});

// ═════════════════════════════════════════════════════════
// Recovery duration table v3 — null base_weeks (irreversible)
// ═════════════════════════════════════════════════════════

describe("v3: null base_weeks for irreversible findings", () => {
  test("kidney mineralization → null weeks, reversibility none", () => {
    const r = classifyFindingNature("Mineralization", null, "KIDNEY");
    expect(r.recovery_weeks_range).toBeNull();
    expect(r.reversibilityQualifier).toBe("none");
  });

  test("heart cardiomyocyte necrosis → null weeks, reversibility none", () => {
    const r = classifyFindingNature("Necrosis", null, "HEART");
    expect(r.recovery_weeks_range).toBeNull();
    expect(r.reversibilityQualifier).toBe("none");
  });

  test("heart fibrosis → null weeks, reversibility none", () => {
    const r = classifyFindingNature("Fibrosis", null, "HEART");
    expect(r.recovery_weeks_range).toBeNull();
    expect(r.reversibilityQualifier).toBe("none");
  });
});

// ═════════════════════════════════════════════════════════
// Recovery duration table v3 — deposit_proportional severity
// ═════════════════════════════════════════════════════════

describe("v3: deposit_proportional severity model", () => {
  test("spleen hemosiderosis severity=3 → weeks scaled by 1.5x", () => {
    const r = lookupRecoveryDuration("Hemosiderosis", { organ: "SPLEEN", maxSeverity: 3 });
    expect(r).not.toBeNull();
    // base {4, 12} * moderate 1.5 = {6, 18}
    expect(r!.weeks).toEqual({ low: 6, high: 18 });
    expect(r!.severity_capped).toBe(false);
  });

  test("spleen hemosiderosis severity=5 → weeks scaled by 2.5x, NOT capped", () => {
    const r = lookupRecoveryDuration("Hemosiderosis", { organ: "SPLEEN", maxSeverity: 5 });
    expect(r).not.toBeNull();
    // base {4, 12} * severe 2.5 = {10, 30}
    expect(r!.weeks).toEqual({ low: 10, high: 30 });
    expect(r!.severity_capped).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════
// Recovery duration table v3 — new findings
// ═════════════════════════════════════════════════════════

describe("v3: new findings", () => {
  test("liver phospholipidosis → organ_specific source, range {2,8}", () => {
    const r = classifyFindingNature("Phospholipidosis", null, "LIVER");
    expect(r.source).toBe("organ_lookup");
    expect(r.recovery_weeks_range).toEqual({ low: 2, high: 8 });
  });

  test("GENERAL hemorrhage (no organ) → fallback hits GENERAL, range {0.5,3}", () => {
    const r = lookupRecoveryDuration("Hemorrhage");
    expect(r).not.toBeNull();
    expect(r!.weeks).toEqual({ low: 0.5, high: 3 });
    expect(r!.organ_key).toBe("GENERAL");
  });

  test("GENERAL pigmentation with severity → deposit_proportional scaling", () => {
    const r = lookupRecoveryDuration("Pigmentation", { maxSeverity: 4 });
    expect(r).not.toBeNull();
    // base {4, 26} * marked 2.0 = {8, 52}
    expect(r!.weeks).toEqual({ low: 8, high: 52 });
    expect(r!.severity_capped).toBe(false);
  });

  test("thyroid focal hyperplasia — {8, null} high bound → null weeks throughout", () => {
    // follicular_cell_hyperplasia_focal is the only finding with a null high bound.
    // Current design: null in either bound → applySeverityModulation returns weeks: null.
    // The 8-week lower bound is intentionally discarded (system requires both bounds).
    const r = classifyFindingNature("Focal hyperplasia", null, "GLAND, THYROID");
    expect(r.source).toBe("organ_lookup");
    expect(r.organ_key).toBe("THYROID");
    // Null propagation through the chain
    expect(r.recovery_weeks_range).toBeNull();
    expect(r.typical_recovery_weeks).toBeNull();
    // Reversibility preserved from entry (unlikely → "low")
    expect(r.reversibilityQualifier).toBe("unlikely");
    expect(r.expected_reversibility).toBe("low");
    // Display layer: no crash, renders "Poorly reversible" (not "8–null weeks")
    const label = reversibilityLabel(r);
    expect(label).toBe("Poorly reversible");
  });
});

// ═════════════════════════════════════════════════════════
// Recovery duration table v3 — critical species modifier fix
// ═════════════════════════════════════════════════════════

describe("v3: species modifier corrections", () => {
  test("testis spermatogenesis + cynomolgus → high = 12 * 0.8 = 9.6", () => {
    const r = lookupRecoveryDuration("Decreased spermatogenesis", {
      organ: "TESTIS",
      species: "CYNOMOLGUS",
    });
    expect(r).not.toBeNull();
    // base {6, 12} * nhp 0.8 = {4.8, 9.6}
    expect(r!.weeks!.high).toBeCloseTo(9.6, 1);
    expect(r!.weeks!.low).toBeCloseTo(4.8, 1);
  });

  test("forestomach + dog → species modifier null → base range unmodified", () => {
    const r = lookupRecoveryDuration("Mucosal hyperplasia forestomach", {
      organ: "STOMACH",
      species: "DOG",
    });
    expect(r).not.toBeNull();
    // dog modifier is null → pass through unmodified
    expect(r!.weeks).toEqual({ low: 2, high: 13 });
  });
});

// ═════════════════════════════════════════════════════════
// Recovery duration table v3 — updated values
// ═════════════════════════════════════════════════════════

describe("v3: updated values from cross-validation", () => {
  test("kupffer cell → {1,6}, reversibility expected", () => {
    const r = lookupRecoveryDuration("Kupffer cell", { organ: "LIVER" });
    expect(r).not.toBeNull();
    expect(r!.weeks).toEqual({ low: 1, high: 6 });
    expect(r!.reversibility).toBe("expected");
  });

  test("glycogen depletion → low: 0.1", () => {
    const r = lookupRecoveryDuration("Glycogen depletion", { organ: "LIVER" });
    expect(r).not.toBeNull();
    expect(r!.weeks!.low).toBe(0.1);
  });

  test("seminiferous tubule atrophy → {8,24}", () => {
    const r = lookupRecoveryDuration("Atrophy", { organ: "TESTIS" });
    expect(r).not.toBeNull();
    expect(r!.weeks).toEqual({ low: 8, high: 24 });
  });
});

// ═════════════════════════════════════════════════════════
// Recovery duration table v3 — continuous endpoints
// ═════════════════════════════════════════════════════════

describe("v3: continuous endpoints", () => {
  test("ALT_increase exists with {0.5, 2}", () => {
    const entry = lookupContinuousRecovery("clinical_chemistry", "ALT_increase");
    expect(entry).not.toBeNull();
    expect(entry!.base_weeks).toEqual({ low: 0.5, high: 2 });
  });

  test("AST_increase exists with {0.3, 1}", () => {
    const entry = lookupContinuousRecovery("clinical_chemistry", "AST_increase");
    expect(entry).not.toBeNull();
    expect(entry!.base_weeks).toEqual({ low: 0.3, high: 1 });
  });

  test("legacy ALT_AST_increase key → returns null", () => {
    const entry = lookupContinuousRecovery("clinical_chemistry", "ALT_AST_increase");
    expect(entry).toBeNull();
  });

  test("legacy BUN_creatinine_increase key → returns null", () => {
    const entry = lookupContinuousRecovery("clinical_chemistry", "BUN_creatinine_increase");
    expect(entry).toBeNull();
  });

  test("kidney_weight_change exists with {2, 6}", () => {
    const entry = lookupContinuousRecovery("organ_weights", "kidney_weight_change");
    expect(entry).not.toBeNull();
    expect(entry!.base_weeks).toEqual({ low: 2, high: 6 });
  });

  test("RBC species modifiers: dog 1.8, nhp 2.0", () => {
    const entry = lookupContinuousRecovery("hematology", "rbc_hgb_hct_decrease");
    expect(entry).not.toBeNull();
    expect(entry!.species.dog).toBe(1.8);
    expect(entry!.species.nhp).toBe(2.0);
  });
});

// ═════════════════════════════════════════════════════════
// Recovery duration table v3 — uncertainty model
// ═════════════════════════════════════════════════════════

describe("v3: uncertainty model", () => {
  test("high confidence → tight bands", () => {
    const bands = computeUncertaintyBands({ low: 1, high: 4 }, "high");
    // low: 1 - 1*0.25 = 0.75 → clamped to 0.75, high: 4 + 4*0.35 = 5.4
    expect(bands.lower).toBeCloseTo(0.8, 1);
    expect(bands.upper).toBeCloseTo(5.4, 1);
  });

  test("low confidence → wide bands", () => {
    const bands = computeUncertaintyBands({ low: 2, high: 8 }, "low");
    // low: 2 - 2*0.25 = 1.5, high: 8 + 8*0.75 = 14
    expect(bands.lower).toBeCloseTo(1.5, 1);
    expect(bands.upper).toBeCloseTo(14, 1);
  });

  test("organ-specific tightening (liver hypertrophy)", () => {
    const bands = computeUncertaintyBands(
      { low: 1, high: 4 },
      "moderate",
      "LIVER",
      "hypertrophy_hepatocellular",
    );
    // Tightened: low 1 - 1*0.2 = 0.8, high: 4 + 4*0.3 = 5.2
    expect(bands.lower).toBeCloseTo(0.8, 1);
    expect(bands.upper).toBeCloseTo(5.2, 1);
  });

  test("max margin cap at 8 weeks", () => {
    // Very long range → margin should be capped
    const bands = computeUncertaintyBands({ low: 26, high: 52 }, "low");
    // high margin: 52 * 0.75 = 39 → capped at 8 → upper = 52 + 8 = 60
    expect(bands.upper).toBe(60);
  });
});

// ═════════════════════════════════════════════════════════
// Recovery duration table v3 — null-safety integration
// ═════════════════════════════════════════════════════════

describe("v3: null-safety integration", () => {
  test("classifyFindingNature mineralization in KIDNEY → typical_recovery_weeks null", () => {
    const r = classifyFindingNature("Mineralization", null, "KIDNEY");
    expect(r.typical_recovery_weeks).toBeNull();
    expect(r.expected_reversibility).toBe("none");
  });

  test("reversibilityLabel with null weeks → 'Not expected to reverse'", () => {
    const r = classifyFindingNature("Mineralization", null, "KIDNEY");
    const label = reversibilityLabel(r);
    expect(label).toContain("Not expected");
  });
});

// ═════════════════════════════════════════════════════════
// MI-based examination counting (computeGroupStats via deriveRecoveryAssessments)
// ═════════════════════════════════════════════════════════

describe("MI-based examination counting", () => {
  const NORMAL: SubjectHistopathEntry["findings"] = { NORMAL: { severity: null, severity_num: 0 } };

  function makeSubject(overrides: Partial<SubjectHistopathEntry>): SubjectHistopathEntry {
    return {
      usubjid: "SUBJ-001",
      sex: "M",
      dose_level: 1,
      dose_label: "100 mg/kg",
      is_recovery: false,
      findings: {},
      disposition: null,
      disposition_day: null,
      ...overrides,
    };
  }

  function buildSubjects(
    opts: {
      mainCount: number;
      recCount: number;
      mainFindings?: Record<string, { severity: string | null; severity_num: number }>;
      recFindings?: Record<string, { severity: string | null; severity_num: number }>;
      examined?: boolean; // default true — give non-finding subjects NORMAL
    },
  ): SubjectHistopathEntry[] {
    const defaultFindings = opts.examined !== false ? NORMAL : {};
    const subjects: SubjectHistopathEntry[] = [];
    for (let i = 0; i < opts.mainCount; i++) {
      subjects.push(makeSubject({
        usubjid: `MAIN-${i}`,
        is_recovery: false,
        findings: i === 0 && opts.mainFindings ? opts.mainFindings : defaultFindings,
      }));
    }
    for (let i = 0; i < opts.recCount; i++) {
      subjects.push(makeSubject({
        usubjid: `REC-${i}`,
        is_recovery: true,
        findings: i === 0 && opts.recFindings ? opts.recFindings : defaultFindings,
      }));
    }
    return subjects;
  }

  test("all examined (NORMAL findings), no abnormal findings → not_observed", () => {
    const subjects = buildSubjects({ mainCount: 5, recCount: 5 });
    const results = deriveRecoveryAssessments(["Necrosis"], subjects);
    expect(results).toHaveLength(1);
    const verdict = results[0].assessments[0].verdict;
    expect(verdict).toBe("not_observed");
  });

  test("no MI findings at all → not_examined", () => {
    // Empty findings dict = tissue not examined
    const subjects = buildSubjects({ mainCount: 5, recCount: 5, examined: false });
    const results = deriveRecoveryAssessments(["Necrosis"], subjects);
    expect(results).toHaveLength(1);
    const verdict = results[0].assessments[0].verdict;
    expect(verdict).toBe("not_examined");
  });

  test("all examined, some with abnormal findings → correct incidence", () => {
    const finding = { severity: "MODERATE", severity_num: 3 };
    const subjects = buildSubjects({
      mainCount: 5,
      recCount: 5,
      mainFindings: { Necrosis: finding },
      recFindings: { Necrosis: finding },
    });
    const results = deriveRecoveryAssessments(["Necrosis"], subjects);
    const da = results[0].assessments[0];
    // main: 1 affected out of 5 examined → incidence = 0.2
    expect(da.main.examined).toBe(5);
    expect(da.main.affected).toBe(1);
    expect(da.main.incidence).toBeCloseTo(0.2);
    // recovery: 1 affected out of 5 examined → incidence = 0.2
    expect(da.recovery.examined).toBe(5);
    expect(da.recovery.affected).toBe(1);
  });

  test("per-subject MI examination count (not all-or-nothing)", () => {
    const finding = { severity: "MILD", severity_num: 2 };
    const subjects = buildSubjects({
      mainCount: 5,
      recCount: 5,
      mainFindings: { Necrosis: finding },
      recFindings: { Necrosis: finding },
    });
    const results = deriveRecoveryAssessments(["Necrosis"], subjects);
    const da = results[0].assessments[0];
    expect(da.main.examined).toBe(5);
    expect(da.recovery.examined).toBe(5);
  });

  test("some recovery subjects not examined → examined count based on MI findings", () => {
    // 5 recovery subjects, only 3 had tissue examined (have NORMAL findings)
    const subjects: SubjectHistopathEntry[] = [];
    for (let i = 0; i < 5; i++) {
      subjects.push(makeSubject({
        usubjid: `MAIN-${i}`,
        is_recovery: false,
        findings: i === 0 ? { Necrosis: { severity: "MILD", severity_num: 2 } } : NORMAL,
      }));
    }
    for (let i = 0; i < 5; i++) {
      subjects.push(makeSubject({
        usubjid: `REC-${i}`,
        is_recovery: true,
        findings: i < 3 ? NORMAL : {}, // 3 examined, 2 not
      }));
    }
    const results = deriveRecoveryAssessments(["Necrosis"], subjects);
    const da = results[0].assessments[0];
    expect(da.recovery.examined).toBe(3);
    expect(da.recovery.n).toBe(5);
  });
});

// ═════════════════════════════════════════════════════════
// GAP-59: deriveRecoveryAssessmentsSexAware
// ═════════════════════════════════════════════════════════

describe("deriveRecoveryAssessmentsSexAware — sex stratification (GAP-59)", () => {
  /** Subjects default to NORMAL findings (= examined). Override findings: {} for unexamined. */
  const NORMAL: SubjectHistopathEntry["findings"] = { NORMAL: { severity: null, severity_num: 0 } };

  function mkSubj(overrides: Partial<SubjectHistopathEntry>): SubjectHistopathEntry {
    return {
      usubjid: "S-001",
      sex: "M",
      dose_level: 1,
      dose_label: "100 mg/kg",
      is_recovery: false,
      findings: NORMAL,
      disposition: null,
      disposition_day: null,
      ...overrides,
    };
  }

  const FINDING = { severity: "MODERATE" as string | null, severity_num: 2 };

  test("single-sex recovery delegates to base function (no merge)", () => {
    // All subjects are male — should produce identical result to deriveRecoveryAssessments
    const subjects: SubjectHistopathEntry[] = [];
    for (let i = 0; i < 10; i++) {
      subjects.push(mkSubj({ usubjid: `MAIN-${i}`, sex: "M", is_recovery: false, findings: i < 3 ? { Necrosis: FINDING } : NORMAL }));
    }
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `REC-${i}`, sex: "M", is_recovery: true, findings: i < 1 ? { Necrosis: FINDING } : NORMAL }));
    }

    const base = deriveRecoveryAssessments(["Necrosis"], subjects);
    const sexAware = deriveRecoveryAssessmentsSexAware(["Necrosis"], subjects);

    expect(sexAware.length).toBe(base.length);
    expect(sexAware[0].overall).toBe(base[0].overall);
    expect(sexAware[0].assessments.length).toBe(base[0].assessments.length);
    expect(sexAware[0].assessments[0].verdict).toBe(base[0].assessments[0].verdict);
  });

  test("sex-restricted recovery: males-only recovery + both-sex main", () => {
    // The bug scenario: recovery arm has only males, main arm has both sexes.
    // Pooling dilutes main incidence (F add unaffected subjects to denominator).
    // Sex-aware compares only M main vs M recovery.
    const subjects: SubjectHistopathEntry[] = [];

    // Main: 5F (0 affected) + 5M (4 affected)
    // Pooled main incidence: 4/10 = 40%. Male-only main incidence: 4/5 = 80%.
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `MAIN-F-${i}`, sex: "F", dose_level: 1, is_recovery: false }));
    }
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `MAIN-M-${i}`, sex: "M", dose_level: 1, is_recovery: false, findings: i < 4 ? { Necrosis: FINDING } : NORMAL }));
    }

    // Recovery: 5M only, 2 affected → 40% incidence
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `REC-M-${i}`, sex: "M", dose_level: 1, is_recovery: true, findings: i < 2 ? { Necrosis: FINDING } : NORMAL }));
    }

    const pooled = deriveRecoveryAssessments(["Necrosis"], subjects);
    const sexAware = deriveRecoveryAssessmentsSexAware(["Necrosis"], subjects);

    // Pooled: rec 40% / main 40% = 1.0 → persistent (F dilution hides the improvement)
    expect(pooled[0].assessments[0].verdict).toBe("persistent");
    // Sex-aware: rec 40% / main-M 80% = 0.5 → reversing (correct: real improvement visible)
    expect(sexAware[0].assessments[0].verdict).toBe("reversing");
  });

  test("both-sex recovery: merges worst verdict across sexes", () => {
    // F: finding resolved in recovery. M: finding persistent in recovery.
    // Merged should take worst = persistent.
    const subjects: SubjectHistopathEntry[] = [];

    // Female main: 5F, 3 affected
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `MAIN-F-${i}`, sex: "F", dose_level: 1, is_recovery: false, findings: i < 3 ? { Necrosis: FINDING } : NORMAL }));
    }
    // Female recovery: 5F, 0 affected → reversed (NORMAL findings = examined, not "not_examined")
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `REC-F-${i}`, sex: "F", dose_level: 1, is_recovery: true }));
    }

    // Male main: 5M, 3 affected
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `MAIN-M-${i}`, sex: "M", dose_level: 1, is_recovery: false, findings: i < 3 ? { Necrosis: FINDING } : NORMAL }));
    }
    // Male recovery: 5M, 3 affected → persistent (same incidence)
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `REC-M-${i}`, sex: "M", dose_level: 1, is_recovery: true, findings: i < 3 ? { Necrosis: FINDING } : NORMAL }));
    }

    const result = deriveRecoveryAssessmentsSexAware(["Necrosis"], subjects);

    // F = reversed, M = persistent → merged worst = persistent
    expect(result[0].overall).toBe("persistent");
    expect(result[0].assessments.length).toBe(1);
    expect(result[0].assessments[0].verdict).toBe("persistent");
  });

  test("both-sex recovery: per-dose worst when sexes differ by dose level", () => {
    const subjects: SubjectHistopathEntry[] = [];

    // Dose 1: F reversed, M reversed → merged = reversed
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `MF-D1-${i}`, sex: "F", dose_level: 1, is_recovery: false, findings: i < 3 ? { Necrosis: FINDING } : NORMAL }));
      subjects.push(mkSubj({ usubjid: `RF-D1-${i}`, sex: "F", dose_level: 1, is_recovery: true }));
      subjects.push(mkSubj({ usubjid: `MM-D1-${i}`, sex: "M", dose_level: 1, is_recovery: false, findings: i < 3 ? { Necrosis: FINDING } : NORMAL }));
      subjects.push(mkSubj({ usubjid: `RM-D1-${i}`, sex: "M", dose_level: 1, is_recovery: true }));
    }

    // Dose 2: F persistent, M reversed → merged = persistent
    for (let i = 0; i < 5; i++) {
      subjects.push(mkSubj({ usubjid: `MF-D2-${i}`, sex: "F", dose_level: 2, is_recovery: false, findings: i < 3 ? { Necrosis: FINDING } : NORMAL }));
      subjects.push(mkSubj({ usubjid: `RF-D2-${i}`, sex: "F", dose_level: 2, is_recovery: true, findings: i < 3 ? { Necrosis: FINDING } : NORMAL }));
      subjects.push(mkSubj({ usubjid: `MM-D2-${i}`, sex: "M", dose_level: 2, is_recovery: false, findings: i < 3 ? { Necrosis: FINDING } : NORMAL }));
      subjects.push(mkSubj({ usubjid: `RM-D2-${i}`, sex: "M", dose_level: 2, is_recovery: true }));
    }

    const result = deriveRecoveryAssessmentsSexAware(["Necrosis"], subjects);

    expect(result[0].assessments.length).toBe(2);
    // Dose 1: both reversed → reversed
    expect(result[0].assessments[0].verdict).toBe("reversed");
    // Dose 2: F persistent, M reversed → persistent (worst)
    expect(result[0].assessments[1].verdict).toBe("persistent");
    // Overall: worst across all dose levels = persistent
    expect(result[0].overall).toBe("persistent");
  });

  test("no recovery subjects → empty result (same as base)", () => {
    const subjects = [
      mkSubj({ usubjid: "MAIN-1", is_recovery: false, findings: { Necrosis: FINDING } }),
      mkSubj({ usubjid: "MAIN-2", is_recovery: false }),
    ];
    const result = deriveRecoveryAssessmentsSexAware(["Necrosis"], subjects);
    expect(result).toEqual([]);
  });

  test("multiple findings handled independently", () => {
    const subjects: SubjectHistopathEntry[] = [];
    const FINDING_B = { severity: "MILD" as string | null, severity_num: 1 };

    // Main: 5M, finding A in 3, finding B in 4, subject 4 examined but neither finding
    for (let i = 0; i < 5; i++) {
      const findings: Record<string, { severity: string | null; severity_num: number }> = {};
      if (i < 3) findings["Necrosis"] = FINDING;
      if (i < 4) findings["Inflammation"] = FINDING_B;
      if (Object.keys(findings).length === 0) findings["NORMAL"] = { severity: null, severity_num: 0 };
      subjects.push(mkSubj({ usubjid: `MAIN-M-${i}`, sex: "M", dose_level: 1, is_recovery: false, findings }));
    }

    // Recovery: 5M, finding A in 0 (reversed), finding B in 4 (persistent), subject 4 examined
    for (let i = 0; i < 5; i++) {
      const findings: Record<string, { severity: string | null; severity_num: number }> = {};
      if (i < 4) findings["Inflammation"] = FINDING_B;
      if (Object.keys(findings).length === 0) findings["NORMAL"] = { severity: null, severity_num: 0 };
      subjects.push(mkSubj({ usubjid: `REC-M-${i}`, sex: "M", dose_level: 1, is_recovery: true, findings }));
    }

    const result = deriveRecoveryAssessmentsSexAware(["Necrosis", "Inflammation"], subjects);

    expect(result.length).toBe(2);
    expect(result[0].finding).toBe("Necrosis");
    expect(result[0].overall).toBe("reversed");
    expect(result[1].finding).toBe("Inflammation");
    expect(result[1].overall).toBe("persistent");
  });
});
