/**
 * Tests for recovery-table-verdicts.ts — buildFindingVerdictMap utility.
 *
 * Covers: continuous verdict, incidence verdict, OM specimen matching,
 * sex filtering, terminal day selection, missing data, override detection,
 * worst-case priority ordering.
 */
import { describe, it, expect } from "vitest";
import {
  buildFindingVerdictMap,
  VERDICT_PRIORITY,
} from "@/lib/recovery-table-verdicts";
import type { FindingVerdictInfo } from "@/lib/recovery-table-verdicts";
import type { UnifiedFinding } from "@/types/analysis";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import type { RecoveryOverrideAnnotation } from "@/hooks/useRecoveryOverrideActions";

// ── Minimal mock helpers ─────────────────────────────────────

function makeFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "f1",
    domain: "LB",
    test_code: "ALB",
    test_name: "Albumin",
    specimen: null,
    finding: "Albumin",
    day: 29,
    sex: "M",
    unit: "g/dL",
    data_type: "continuous",
    severity: "adverse",
    direction: "down",
    dose_response_pattern: "monotonic",
    treatment_related: true,
    max_effect_size: -1.5,
    min_p_adj: 0.01,
    trend_p: 0.005,
    trend_stat: 3.2,
    max_fold_change: 0.8,
    max_incidence: null,
    group_stats: [],
    pairwise: [],
    endpoint_label: "Albumin",
    ...overrides,
  } as UnifiedFinding;
}

function makeRecoveryData(
  overrides: Partial<RecoveryComparisonResponse> = {},
): RecoveryComparisonResponse {
  return {
    available: true,
    recovery_day: 120,
    last_dosing_day: 90,
    recovery_days_available: {},
    rows: [],
    incidence_rows: [],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("buildFindingVerdictMap", () => {
  it("returns empty map when recoveryData is undefined", () => {
    const findings = [makeFinding()];
    const result = buildFindingVerdictMap(findings, undefined, undefined);
    expect(result.size).toBe(0);
  });

  it("returns empty map when recoveryData.available is false", () => {
    const findings = [makeFinding()];
    const recovery = makeRecoveryData({ available: false });
    const result = buildFindingVerdictMap(findings, recovery, undefined);
    expect(result.size).toBe(0);
  });

  it("continuous finding with recovery rows gets a verdict", () => {
    const finding = makeFinding({ id: "f1", test_code: "ALB", sex: "M" });
    const recovery = makeRecoveryData({
      rows: [
        {
          endpoint_label: "Albumin",
          test_code: "ALB",
          sex: "M",
          day: 120,
          recovery_day: 120,
          dose_level: 1,
          mean: 4.0,
          sd: 0.5,
          p_value: 0.05,
          effect_size: -0.3,
          terminal_effect: -1.5,
          terminal_effect_same_arm: -1.4,
          terminal_day: 90,
          peak_effect: -2.0,
          peak_day: 60,
        },
      ],
    });

    const result = buildFindingVerdictMap([finding], recovery, undefined);
    expect(result.has("f1")).toBe(true);
    const info = result.get("f1")!;
    expect(info.verdict).toBeDefined();
    expect(info.isOverridden).toBe(false);
    expect(info.effectiveVerdict).toBe(info.verdict);
  });

  it("incidence finding with incidence_rows gets a verdict", () => {
    const finding = makeFinding({
      id: "f2",
      domain: "MI",
      test_code: "MICRO",
      data_type: "incidence",
      finding: "Hepatocellular hypertrophy",
      sex: "M",
      specimen: "LIVER",
    });
    const recovery = makeRecoveryData({
      incidence_rows: [
        {
          domain: "MI",
          finding: "Hepatocellular hypertrophy",
          sex: "M",
          dose_level: 3,
          dose_label: "High",
          main_affected: 4,
          main_n: 10,
          recovery_affected: 1,
          recovery_n: 5,
          recovery_day: 120,
          verdict: "partially_reversed",
          confidence: "adequate",
          specimen: "LIVER",
        },
      ],
    });

    const result = buildFindingVerdictMap([finding], recovery, undefined);
    expect(result.has("f2")).toBe(true);
    expect(result.get("f2")!.effectiveVerdict).toBe("partially_reversed");
  });

  it("OM finding matches by specimen not test_code", () => {
    const finding = makeFinding({
      id: "f3",
      domain: "OM",
      test_code: "WEIGHT",
      specimen: "BRAIN",
      finding: "Organ weight",
      sex: "F",
    });
    const recovery = makeRecoveryData({
      rows: [
        // This row has test_code "BRAIN" — OM matching uses specimen
        {
          endpoint_label: "Brain weight",
          test_code: "BRAIN",
          sex: "F",
          day: 120,
          recovery_day: 120,
          dose_level: 2,
          mean: 1.8,
          sd: 0.2,
          p_value: 0.03,
          effect_size: -0.2,
          terminal_effect: -1.0,
          terminal_effect_same_arm: -0.9,
          terminal_day: 90,
          peak_effect: -1.2,
          peak_day: 60,
        },
        // This row with test_code "WEIGHT" should NOT match (wrong key for OM)
        {
          endpoint_label: "Body weight",
          test_code: "WEIGHT",
          sex: "F",
          day: 120,
          recovery_day: 120,
          dose_level: 2,
          mean: 200,
          sd: 10,
          p_value: 0.5,
          effect_size: -2.5,
          terminal_effect: -2.5,
          terminal_effect_same_arm: -2.5,
          terminal_day: 90,
          peak_effect: -3.0,
          peak_day: 60,
        },
      ],
    });

    const result = buildFindingVerdictMap([finding], recovery, undefined);
    expect(result.has("f3")).toBe(true);
    // The BRAIN row gives effect_size=-0.2 (reversed), not WEIGHT row
    expect(result.get("f3")!.verdict).toBe("reversed");
  });

  it("sex filtering works (M finding ignores F rows)", () => {
    const findingM = makeFinding({ id: "fm", sex: "M", test_code: "ALB" });
    const recovery = makeRecoveryData({
      rows: [
        {
          endpoint_label: "Albumin",
          test_code: "ALB",
          sex: "F",
          day: 120,
          recovery_day: 120,
          dose_level: 1,
          mean: 4.0,
          sd: 0.5,
          p_value: 0.01,
          effect_size: -2.0,
          terminal_effect: -1.5,
          terminal_effect_same_arm: -1.4,
          terminal_day: 90,
          peak_effect: null,
          peak_day: null,
        },
      ],
    });

    const result = buildFindingVerdictMap([findingM], recovery, undefined);
    // M finding should NOT match the F row
    expect(result.has("fm")).toBe(false);
  });

  it("multi-day rows collapse to terminal (max day only)", () => {
    const finding = makeFinding({ id: "f4", test_code: "ALB", sex: "M" });
    const recovery = makeRecoveryData({
      rows: [
        // Earlier recovery day — should be dropped
        {
          endpoint_label: "Albumin",
          test_code: "ALB",
          sex: "M",
          day: 100,
          recovery_day: 100,
          dose_level: 1,
          mean: 3.5,
          sd: 0.4,
          p_value: 0.01,
          effect_size: -1.8,
          terminal_effect: -1.5,
          terminal_effect_same_arm: -1.4,
          terminal_day: 90,
          peak_effect: null,
          peak_day: null,
        },
        // Later recovery day — should be kept (terminal recovery)
        {
          endpoint_label: "Albumin",
          test_code: "ALB",
          sex: "M",
          day: 120,
          recovery_day: 120,
          dose_level: 1,
          mean: 4.0,
          sd: 0.5,
          p_value: 0.05,
          effect_size: -0.3,
          terminal_effect: -1.5,
          terminal_effect_same_arm: -1.4,
          terminal_day: 90,
          peak_effect: null,
          peak_day: null,
        },
      ],
    });

    const result = buildFindingVerdictMap([finding], recovery, undefined);
    expect(result.has("f4")).toBe(true);
    // Terminal recovery (day 120) has effect_size=-0.3, which is reversed (|g|<0.5)
    expect(result.get("f4")!.verdict).toBe("reversed");
  });

  it("override detection sets isOverridden=true and uses override verdict", () => {
    const finding = makeFinding({ id: "f5", test_code: "ALB", sex: "M" });
    const recovery = makeRecoveryData({
      rows: [
        {
          endpoint_label: "Albumin",
          test_code: "ALB",
          sex: "M",
          day: 120,
          recovery_day: 120,
          dose_level: 1,
          mean: 4.0,
          sd: 0.5,
          p_value: 0.05,
          effect_size: -0.3,
          terminal_effect: -1.5,
          terminal_effect_same_arm: -1.4,
          terminal_day: 90,
          peak_effect: null,
          peak_day: null,
        },
      ],
    });

    const overrides: Record<string, RecoveryOverrideAnnotation> = {
      f5: {
        verdict: "persistent",
        original_verdict: "reversed",
        data_type: "continuous",
      },
    };

    const result = buildFindingVerdictMap([finding], recovery, overrides);
    expect(result.has("f5")).toBe(true);
    const info = result.get("f5")!;
    expect(info.isOverridden).toBe(true);
    expect(info.verdict).toBe("reversed"); // auto verdict unchanged
    expect(info.effectiveVerdict).toBe("persistent"); // override takes effect
  });

  it("worst-case priority ordering is correct (progressing > persistent > partially_reversed)", () => {
    const finding = makeFinding({ id: "f6", test_code: "ALB", sex: "M" });
    const recovery = makeRecoveryData({
      rows: [
        // Dose 1: effect_size=-0.3 (reversed — below 0.5 threshold)
        {
          endpoint_label: "Albumin",
          test_code: "ALB",
          sex: "M",
          day: 120,
          recovery_day: 120,
          dose_level: 1,
          mean: 4.0,
          sd: 0.5,
          p_value: 0.4,
          effect_size: -0.3,
          terminal_effect: -1.5,
          terminal_effect_same_arm: -1.4,
          terminal_day: 90,
          peak_effect: null,
          peak_day: null,
        },
        // Dose 2: effect_size=-2.0, terminal=-1.5 => progressing (worse than terminal)
        {
          endpoint_label: "Albumin",
          test_code: "ALB",
          sex: "M",
          day: 120,
          recovery_day: 120,
          dose_level: 2,
          mean: 2.0,
          sd: 0.5,
          p_value: 0.001,
          effect_size: -2.0,
          terminal_effect: -1.5,
          terminal_effect_same_arm: -1.4,
          terminal_day: 90,
          peak_effect: null,
          peak_day: null,
        },
      ],
    });

    const result = buildFindingVerdictMap([finding], recovery, undefined);
    expect(result.has("f6")).toBe(true);
    // Worst case should be progressing (dose 2: recovery |g| > terminal |g|)
    expect(result.get("f6")!.verdict).toBe("progressing");
  });

  it("skips rows with insufficient_n", () => {
    const finding = makeFinding({ id: "f7", test_code: "ALB", sex: "M" });
    const recovery = makeRecoveryData({
      rows: [
        {
          endpoint_label: "Albumin",
          test_code: "ALB",
          sex: "M",
          day: 120,
          recovery_day: 120,
          dose_level: 1,
          mean: 4.0,
          sd: 0.5,
          p_value: 0.05,
          effect_size: -0.3,
          terminal_effect: -1.5,
          terminal_effect_same_arm: null,
          terminal_day: 90,
          peak_effect: null,
          peak_day: null,
          insufficient_n: true,
        },
      ],
    });

    const result = buildFindingVerdictMap([finding], recovery, undefined);
    expect(result.has("f7")).toBe(false);
  });

  it("skips rows with no_concurrent_control", () => {
    const finding = makeFinding({ id: "f8", test_code: "ALB", sex: "M" });
    const recovery = makeRecoveryData({
      rows: [
        {
          endpoint_label: "Albumin",
          test_code: "ALB",
          sex: "M",
          day: 120,
          recovery_day: 120,
          dose_level: 1,
          mean: 4.0,
          sd: 0.5,
          p_value: 0.05,
          effect_size: -0.3,
          terminal_effect: -1.5,
          terminal_effect_same_arm: null,
          terminal_day: 90,
          peak_effect: null,
          peak_day: null,
          no_concurrent_control: true,
        },
      ],
    });

    const result = buildFindingVerdictMap([finding], recovery, undefined);
    expect(result.has("f8")).toBe(false);
  });

  it("incidence finding with specimen matches by specimen", () => {
    const finding = makeFinding({
      id: "f9",
      domain: "MI",
      data_type: "incidence",
      finding: "Necrosis",
      sex: "M",
      specimen: "LIVER",
    });
    const recovery = makeRecoveryData({
      incidence_rows: [
        {
          domain: "MI",
          finding: "Necrosis",
          sex: "M",
          dose_level: 2,
          dose_label: "Mid",
          main_affected: 3,
          main_n: 10,
          recovery_affected: 0,
          recovery_n: 5,
          recovery_day: 120,
          verdict: "reversed",
          specimen: "LIVER",
        },
        // Same finding but KIDNEY — should NOT match
        {
          domain: "MI",
          finding: "Necrosis",
          sex: "M",
          dose_level: 2,
          dose_label: "Mid",
          main_affected: 3,
          main_n: 10,
          recovery_affected: 3,
          recovery_n: 5,
          recovery_day: 120,
          verdict: "persistent",
          specimen: "KIDNEY",
        },
      ],
    });

    const result = buildFindingVerdictMap([finding], recovery, undefined);
    expect(result.has("f9")).toBe(true);
    // Only the LIVER row should match — verdict "reversed"
    expect(result.get("f9")!.verdict).toBe("reversed");
  });
});

describe("VERDICT_PRIORITY", () => {
  it("has correct ordering", () => {
    expect(VERDICT_PRIORITY["not_assessed"]).toBeLessThan(VERDICT_PRIORITY["reversed"]);
    expect(VERDICT_PRIORITY["reversed"]).toBeLessThan(VERDICT_PRIORITY["overcorrected"]);
    expect(VERDICT_PRIORITY["overcorrected"]).toBeLessThan(VERDICT_PRIORITY["partially_reversed"]);
    expect(VERDICT_PRIORITY["partially_reversed"]).toBeLessThan(VERDICT_PRIORITY["persistent"]);
    expect(VERDICT_PRIORITY["persistent"]).toBeLessThan(VERDICT_PRIORITY["progressing"]);
    expect(VERDICT_PRIORITY["progressing"]).toBe(VERDICT_PRIORITY["anomaly"]);
  });
});
