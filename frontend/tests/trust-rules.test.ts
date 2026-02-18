import { describe, test, expect } from "vitest";
import {
  RULE_CATALOG,
  THRESHOLDS,
  PATTERN_SCORES,
  SIGNAL_SCORE_WEIGHTS,
  NOAEL_CONFIDENCE_PENALTIES,
  computeSignalScoreBreakdown,
  computeEvidenceScoreBreakdown,
  computeConfidenceBreakdown,
} from "@/lib/rule-definitions";

// ─── Catalog Integrity ────────────────────────────────────────

describe("catalog integrity", () => {
  test("RULE_CATALOG has 19 rules with unique IDs", () => {
    expect(RULE_CATALOG).toHaveLength(19);
    const ids = RULE_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(19);
  });

  test("every rule has required fields", () => {
    for (const r of RULE_CATALOG) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.scope).toMatch(/^(endpoint|organ|study)$/);
      expect(r.severity).toMatch(/^(info|warning|critical)$/);
      expect(r.condition).toBeTruthy();
      expect(r.template).toBeTruthy();
    }
  });

  test("threshold refs in rules all exist in THRESHOLDS", () => {
    const thresholdKeys = new Set(THRESHOLDS.map((t) => t.key));
    for (const r of RULE_CATALOG) {
      for (const ref of r.thresholdRefs) {
        expect(thresholdKeys.has(ref), `${r.id} references unknown threshold "${ref}"`).toBe(true);
      }
    }
  });

  test("signal score weights sum to 1.0", () => {
    const sum = SIGNAL_SCORE_WEIGHTS.pValue
      + SIGNAL_SCORE_WEIGHTS.trend
      + SIGNAL_SCORE_WEIGHTS.effectSize
      + SIGNAL_SCORE_WEIGHTS.pattern;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  test("PATTERN_SCORES covers standard patterns", () => {
    const required = [
      "monotonic_increase", "monotonic_decrease",
      "threshold", "non_monotonic", "flat", "insufficient_data",
    ];
    for (const p of required) {
      expect(p in PATTERN_SCORES, `missing pattern "${p}"`).toBe(true);
    }
  });

  test("NOAEL confidence penalties are all non-positive", () => {
    for (const p of NOAEL_CONFIDENCE_PENALTIES) {
      expect(p.penalty).toBeLessThanOrEqual(0);
    }
  });
});

// ─── Signal Score Breakdown ───────────────────────────────────

describe("computeSignalScoreBreakdown", () => {
  test("all nulls → zero score", () => {
    const b = computeSignalScoreBreakdown({
      p_value: null, trend_p: null, effect_size: null, dose_response_pattern: null,
    });
    expect(b.total).toBe(0);
    expect(b.pValueComponent).toBe(0);
    expect(b.trendComponent).toBe(0);
    expect(b.effectSizeComponent).toBe(0);
    expect(b.patternComponent).toBe(0);
  });

  test("p-value component: -log10(0.001)/4 * 0.35 = 0.2625", () => {
    const b = computeSignalScoreBreakdown({
      p_value: 0.001, trend_p: null, effect_size: null, dose_response_pattern: null,
    });
    expect(b.pValueComponent).toBeCloseTo(0.35 * (3 / 4), 4); // 0.2625
    expect(b.total).toBeCloseTo(0.2625, 4);
  });

  test("p-value caps at -log10(0.0001)/4 = 1.0", () => {
    const b = computeSignalScoreBreakdown({
      p_value: 0.000001, trend_p: null, effect_size: null, dose_response_pattern: null,
    });
    // -log10(1e-6) = 6, capped at 4 → component = 0.35 * 1.0
    expect(b.pValueComponent).toBeCloseTo(0.35, 4);
  });

  test("effect size caps at |d|/2.0 = 1.0", () => {
    const b = computeSignalScoreBreakdown({
      p_value: null, trend_p: null, effect_size: 5.0, dose_response_pattern: null,
    });
    expect(b.effectSizeComponent).toBeCloseTo(0.25, 4);
  });

  test("negative effect size uses absolute value", () => {
    const b = computeSignalScoreBreakdown({
      p_value: null, trend_p: null, effect_size: -1.0, dose_response_pattern: null,
    });
    expect(b.effectSizeComponent).toBeCloseTo(0.25 * (1.0 / 2.0), 4); // 0.125
  });

  test("monotonic pattern gets full pattern weight", () => {
    const b = computeSignalScoreBreakdown({
      p_value: null, trend_p: null, effect_size: null, dose_response_pattern: "monotonic_increase",
    });
    expect(b.patternComponent).toBeCloseTo(0.20 * 1.0, 4);
  });

  test("threshold pattern gets 0.7 weight", () => {
    const b = computeSignalScoreBreakdown({
      p_value: null, trend_p: null, effect_size: null, dose_response_pattern: "threshold",
    });
    expect(b.patternComponent).toBeCloseTo(0.20 * 0.7, 4);
  });

  test("unknown pattern gets 0", () => {
    const b = computeSignalScoreBreakdown({
      p_value: null, trend_p: null, effect_size: null, dose_response_pattern: "unknown_xyz",
    });
    expect(b.patternComponent).toBe(0);
  });

  test("total caps at 1.0 even with extreme inputs", () => {
    const b = computeSignalScoreBreakdown({
      p_value: 1e-20, trend_p: 1e-20, effect_size: 100, dose_response_pattern: "monotonic_increase",
    });
    expect(b.total).toBe(1.0);
  });

  test("combined: realistic endpoint (p=0.01, trend=0.03, d=0.8, monotonic)", () => {
    const b = computeSignalScoreBreakdown({
      p_value: 0.01, trend_p: 0.03, effect_size: 0.8, dose_response_pattern: "monotonic_increase",
    });
    const expectedP = 0.35 * Math.min(-Math.log10(0.01) / 4, 1.0);     // 0.35 * 0.5 = 0.175
    const expectedT = 0.20 * Math.min(-Math.log10(0.03) / 4, 1.0);     // 0.20 * ~0.381 = ~0.0762
    const expectedE = 0.25 * Math.min(0.8 / 2.0, 1.0);                 // 0.25 * 0.4 = 0.1
    const expectedPat = 0.20 * 1.0;                                      // 0.2
    const expectedTotal = expectedP + expectedT + expectedE + expectedPat;
    expect(b.pValueComponent).toBeCloseTo(expectedP, 4);
    expect(b.trendComponent).toBeCloseTo(expectedT, 4);
    expect(b.effectSizeComponent).toBeCloseTo(expectedE, 4);
    expect(b.patternComponent).toBeCloseTo(expectedPat, 4);
    expect(b.total).toBeCloseTo(expectedTotal, 4);
  });
});

// ─── Evidence Score Breakdown ─────────────────────────────────

describe("computeEvidenceScoreBreakdown", () => {
  test("single-domain convergence multiplier is 1.0", () => {
    const b = computeEvidenceScoreBreakdown({
      evidence_score: 0.5, n_endpoints: 3, n_domains: 1, domains: ["LB"], n_significant: 2,
    });
    expect(b.convergenceMultiplier).toBe(1.0);
    expect(b.avgSignalPerEndpoint).toBeCloseTo(0.5, 4);
  });

  test("2-domain convergence multiplier is 1.2", () => {
    const b = computeEvidenceScoreBreakdown({
      evidence_score: 0.6, n_endpoints: 4, n_domains: 2, domains: ["LB", "MI"], n_significant: 1,
    });
    expect(b.convergenceMultiplier).toBeCloseTo(1.2, 4);
    expect(b.avgSignalPerEndpoint).toBeCloseTo(0.6 / 1.2, 4);
  });

  test("3-domain convergence multiplier is 1.4", () => {
    const b = computeEvidenceScoreBreakdown({
      evidence_score: 0.7, n_endpoints: 5, n_domains: 3, domains: ["LB", "MI", "MA"], n_significant: 2,
    });
    expect(b.convergenceMultiplier).toBeCloseTo(1.4, 4);
  });

  test("evidence threshold at 0.3", () => {
    expect(computeEvidenceScoreBreakdown({
      evidence_score: 0.29, n_endpoints: 1, n_domains: 1, domains: ["LB"], n_significant: 0,
    }).meetsEvidenceThreshold).toBe(false);

    expect(computeEvidenceScoreBreakdown({
      evidence_score: 0.30, n_endpoints: 1, n_domains: 1, domains: ["LB"], n_significant: 1,
    }).meetsEvidenceThreshold).toBe(true);
  });

  test("significant threshold at >= 1", () => {
    expect(computeEvidenceScoreBreakdown({
      evidence_score: 0.5, n_endpoints: 2, n_domains: 1, domains: ["LB"], n_significant: 0,
    }).meetsSignificantThreshold).toBe(false);

    expect(computeEvidenceScoreBreakdown({
      evidence_score: 0.5, n_endpoints: 2, n_domains: 1, domains: ["LB"], n_significant: 1,
    }).meetsSignificantThreshold).toBe(true);
  });
});

// ─── NOAEL Confidence Breakdown ───────────────────────────────

describe("computeConfidenceBreakdown", () => {
  const baseRow = (overrides: Record<string, unknown> = {}) => ({
    sex: "M",
    noael_dose_level: 2,
    noael_label: "20 mg/kg",
    noael_confidence: 1.0,
    n_adverse_at_loael: 3,
    ...overrides,
  });

  test("no penalties → confidence 1.0", () => {
    const b = computeConfidenceBreakdown(
      baseRow(),
      [baseRow(), baseRow({ sex: "F" })],
    );
    expect(b.base).toBe(1.0);
    expect(b.total).toBe(1.0);
    expect(b.singleEndpointPenalty).toBe(0);
    expect(b.sexInconsistencyPenalty).toBe(0);
  });

  test("single endpoint penalty when n_adverse_at_loael <= 1", () => {
    const b = computeConfidenceBreakdown(
      baseRow({ noael_confidence: 0.8, n_adverse_at_loael: 1 }),
      [baseRow({ noael_confidence: 0.8, n_adverse_at_loael: 1 }), baseRow({ sex: "F" })],
    );
    expect(b.singleEndpointPenalty).toBe(-0.20);
  });

  test("sex inconsistency penalty when M and F NOAEL differ", () => {
    const b = computeConfidenceBreakdown(
      baseRow({ noael_confidence: 0.8, noael_dose_level: 2 }),
      [
        baseRow({ noael_confidence: 0.8, noael_dose_level: 2 }),
        baseRow({ sex: "F", noael_dose_level: 1, noael_label: "10 mg/kg" }),
      ],
    );
    expect(b.sexInconsistencyPenalty).toBe(-0.20);
    expect(b.sexInconsistencyDetail).toContain("M:");
    expect(b.sexInconsistencyDetail).toContain("F:");
  });

  test("Combined sex detects M/F inconsistency", () => {
    const b = computeConfidenceBreakdown(
      baseRow({ sex: "Combined", noael_confidence: 0.8 }),
      [
        baseRow({ sex: "Combined", noael_confidence: 0.8 }),
        baseRow({ sex: "M", noael_dose_level: 2 }),
        baseRow({ sex: "F", noael_dose_level: 1, noael_label: "10 mg/kg" }),
      ],
    );
    expect(b.sexInconsistencyPenalty).toBe(-0.20);
  });

  test("multiple penalties stack", () => {
    // confidence = 0.6 → 0.4 penalty budget → single endpoint + sex inconsistency
    const b = computeConfidenceBreakdown(
      baseRow({ noael_confidence: 0.6, n_adverse_at_loael: 1 }),
      [
        baseRow({ noael_confidence: 0.6, n_adverse_at_loael: 1 }),
        baseRow({ sex: "F", noael_dose_level: 1, noael_label: "10 mg/kg" }),
      ],
    );
    expect(b.singleEndpointPenalty).toBe(-0.20);
    expect(b.sexInconsistencyPenalty).toBe(-0.20);
    expect(b.total).toBe(0.6);
  });

  test("total always equals the input noael_confidence", () => {
    // The function reverse-engineers penalties from the stored confidence
    for (const conf of [1.0, 0.8, 0.6, 0.4]) {
      const b = computeConfidenceBreakdown(
        baseRow({ noael_confidence: conf, n_adverse_at_loael: 0 }),
        [baseRow({ noael_confidence: conf, n_adverse_at_loael: 0 })],
      );
      expect(b.total).toBe(conf);
    }
  });
});
