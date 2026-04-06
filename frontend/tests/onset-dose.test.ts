import { describe, it, expect } from "vitest";
import {
  resolveOnsetDose,
  formatOnsetDose,
  defaultOnsetForPattern,
  onsetNeedsAttention,
} from "../src/lib/onset-dose";
import type { DoseGroup, UnifiedFinding } from "../src/types/analysis";

// Minimal finding factory
function makeFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "TEST_M_day92",
    domain: "LB",
    test_code: "TEST",
    test_name: "Test Parameter",
    specimen: null,
    finding: "Test Parameter",
    day: 92,
    sex: "M",
    unit: "U/L",
    data_type: "continuous",
    severity: "normal",
    direction: "down",
    dose_response_pattern: "flat",
    treatment_related: false,
    max_effect_size: null,
    min_p_adj: null,
    trend_p: null,
    trend_stat: null,
    group_stats: [],
    pairwise: [],
    ...overrides,
  };
}

const DOSE_GROUPS: DoseGroup[] = [
  { dose_level: 0, armcd: "G1", label: "Control", dose_value: 0, dose_unit: "mg/kg", n_male: 10, n_female: 10, n_total: 20 },
  { dose_level: 1, armcd: "G2", label: "Low", dose_value: 2, dose_unit: "mg/kg", n_male: 10, n_female: 10, n_total: 20 },
  { dose_level: 2, armcd: "G3", label: "Mid", dose_value: 20, dose_unit: "mg/kg", n_male: 10, n_female: 10, n_total: 20 },
  { dose_level: 3, armcd: "G4", label: "High", dose_value: 200, dose_unit: "mg/kg", n_male: 10, n_female: 10, n_total: 20 },
];

describe("resolveOnsetDose", () => {
  it("returns null for flat pattern with no significant pairwise", () => {
    const f = makeFinding();
    expect(resolveOnsetDose(f)).toBeNull();
  });

  it("returns override onset when pattern override has onset_dose_level", () => {
    const f = makeFinding({
      _pattern_override: {
        pattern: "monotonic",
        original_pattern: "flat",
        original_direction: "down",
        onset_dose_level: 1,
        original_onset_dose_level: null,
        timestamp: "2026-01-01",
      },
    });
    expect(resolveOnsetDose(f)).toEqual({ doseLevel: 1, source: "override" });
  });

  it("returns algorithm onset for threshold pattern with onset_dose_level", () => {
    const f = makeFinding({
      dose_response_pattern: "threshold_decrease",
      onset_dose_level: 2,
    });
    expect(resolveOnsetDose(f)).toEqual({ doseLevel: 2, source: "algorithm" });
  });

  it("falls back to pvalue when no onset_dose_level", () => {
    const f = makeFinding({
      dose_response_pattern: "monotonic_decrease",
      pairwise: [
        { dose_level: 1, p_value: 0.3, p_value_adj: 0.4, effect_size: 0.5 },
        { dose_level: 2, p_value: 0.01, p_value_adj: 0.03, effect_size: 1.2 },
        { dose_level: 3, p_value: 0.001, p_value_adj: 0.003, effect_size: 2.0 },
      ],
    });
    expect(resolveOnsetDose(f)).toEqual({ doseLevel: 2, source: "pvalue" });
  });

  it("returns n.s. (null) when no pairwise is significant", () => {
    const f = makeFinding({
      dose_response_pattern: "monotonic_decrease",
      pairwise: [
        { dose_level: 1, p_value: 0.3, p_value_adj: 0.4, effect_size: 0.5 },
        { dose_level: 2, p_value: 0.1, p_value_adj: 0.15, effect_size: 0.8 },
      ],
    });
    expect(resolveOnsetDose(f)).toBeNull();
  });

  it("ignores override onset when pattern is no_change", () => {
    const f = makeFinding({
      _pattern_override: {
        pattern: "no_change",
        original_pattern: "threshold_decrease",
        original_direction: "down",
        onset_dose_level: 2,
        original_onset_dose_level: 2,
        timestamp: "2026-01-01",
      },
    });
    // no_change override is excluded, falls through to algorithm/pvalue
    expect(resolveOnsetDose(f)).toBeNull();
  });

  it("prefers override over algorithm", () => {
    const f = makeFinding({
      onset_dose_level: 2,
      _pattern_override: {
        pattern: "threshold",
        original_pattern: "threshold_decrease",
        original_direction: "down",
        onset_dose_level: 1,
        original_onset_dose_level: 2,
        timestamp: "2026-01-01",
      },
    });
    expect(resolveOnsetDose(f)).toEqual({ doseLevel: 1, source: "override" });
  });

  it("heart weight bug: threshold pattern with onset_dose_level but no significant pairwise", () => {
    // This is the exact bug: backend sets onset_dose_level for threshold,
    // but old code ignored it and only checked pairwise p-values
    const f = makeFinding({
      dose_response_pattern: "threshold_decrease",
      onset_dose_level: 3,
      pairwise: [
        { dose_level: 1, p_value: 0.5, p_value_adj: 0.6, effect_size: 0.2 },
        { dose_level: 2, p_value: 0.15, p_value_adj: 0.2, effect_size: 0.7 },
        { dose_level: 3, p_value: 0.06, p_value_adj: 0.08, effect_size: 1.1 },
      ],
    });
    const result = resolveOnsetDose(f);
    expect(result).not.toBeNull();
    expect(result!.doseLevel).toBe(3);
    expect(result!.source).toBe("algorithm");
  });
});

describe("formatOnsetDose", () => {
  it("formats dose_level to value + unit string", () => {
    expect(formatOnsetDose(1, DOSE_GROUPS)).toBe("2 mg/kg");
    expect(formatOnsetDose(2, DOSE_GROUPS)).toBe("20 mg/kg");
    expect(formatOnsetDose(3, DOSE_GROUPS)).toBe("200 mg/kg");
  });

  it("falls back to label for missing dose_value", () => {
    const groups: DoseGroup[] = [
      { dose_level: 1, armcd: "G2", label: "Low Dose", dose_value: null, dose_unit: null, n_male: 10, n_female: 10, n_total: 20 },
    ];
    expect(formatOnsetDose(1, groups)).toBe("Low Dose");
  });

  it("falls back to Level N for unknown dose_level", () => {
    expect(formatOnsetDose(99, DOSE_GROUPS)).toBe("Level 99");
  });
});

describe("defaultOnsetForPattern", () => {
  it("returns 1 for monotonic", () => {
    expect(defaultOnsetForPattern("monotonic")).toBe(1);
  });

  it("returns null for threshold", () => {
    expect(defaultOnsetForPattern("threshold")).toBeNull();
  });

  it("returns null for non_monotonic", () => {
    expect(defaultOnsetForPattern("non_monotonic")).toBeNull();
  });

  it("returns null for u_shaped", () => {
    expect(defaultOnsetForPattern("u_shaped")).toBeNull();
  });

  it("returns null for no_change", () => {
    expect(defaultOnsetForPattern("no_change")).toBeNull();
  });
});

describe("onsetNeedsAttention", () => {
  it("returns false for no_change", () => {
    expect(onsetNeedsAttention("no_change", null)).toBe(false);
  });

  it("returns true for directional with null onset", () => {
    expect(onsetNeedsAttention("threshold", null)).toBe(true);
    expect(onsetNeedsAttention("monotonic", null)).toBe(true);
    expect(onsetNeedsAttention("non_monotonic", null)).toBe(true);
  });

  it("returns false for monotonic with any set onset (BUG-16: removed false-positive)", () => {
    expect(onsetNeedsAttention("monotonic", 2)).toBe(false);
    expect(onsetNeedsAttention("monotonic", 1)).toBe(false);
  });

  it("returns false for flat pattern (BUG-16: treat flat same as no_change)", () => {
    expect(onsetNeedsAttention("flat", null)).toBe(false);
  });

  it("returns false for threshold with set onset", () => {
    expect(onsetNeedsAttention("threshold", 2)).toBe(false);
  });
});
