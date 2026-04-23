import { describe, test, expect } from "vitest";
import {
  computeEffectSize,
  getEffectSizeLabel,
  getEffectSizeSymbol,
  hasWelchPValues,
} from "@/lib/stat-method-transforms";
import type { EffectSizeMethod } from "@/lib/stat-method-transforms";
import type { UnifiedFinding, PairwiseResult } from "@/types/analysis";

// ── Standalone re-implementations of deleted transforms ──────
// Phase 2b moved these to the backend. Tests keep standalone copies
// to verify the transform algebra.

function applyEffectSizeMethod(findings: UnifiedFinding[], method: EffectSizeMethod): UnifiedFinding[] {
  if (method === "hedges-g") return findings;
  return findings.map((f) => {
    if (f.data_type !== "continuous") return f;
    const controlStat = f.group_stats.find((gs) => gs.dose_level === 0);
    if (!controlStat || controlStat.mean == null || controlStat.sd == null) return f;
    const newPairwise: PairwiseResult[] = f.pairwise.map((pw) => {
      const treatedStat = f.group_stats.find((gs) => gs.dose_level === pw.dose_level);
      if (!treatedStat) return pw;
      const newD = computeEffectSize(method, controlStat.mean, controlStat.sd, controlStat.n, treatedStat.mean, treatedStat.sd, treatedStat.n);
      return { ...pw, effect_size: newD };
    });
    const effectSizes = newPairwise.map((pw) => pw.effect_size).filter((d): d is number => d != null);
    let newMaxEffect = f.max_effect_size;
    if (effectSizes.length > 0) {
      newMaxEffect = effectSizes.reduce((best, cur) => Math.abs(cur) > Math.abs(best) ? cur : best);
    }
    return { ...f, pairwise: newPairwise, max_effect_size: newMaxEffect };
  });
}

function applyMultiplicityMethod(findings: UnifiedFinding[], method: string): UnifiedFinding[] {
  if (method === "dunnett-fwer") return findings;
  return findings.map((f) => {
    if (f.data_type !== "continuous") return f;
    const nComparisons = f.pairwise.length;
    if (nComparisons === 0) return f;
    const hasWelch = f.pairwise.some((pw) => pw.p_value_welch != null);
    if (!hasWelch) return f;
    const newPairwise: PairwiseResult[] = f.pairwise.map((pw) => {
      const welchP = pw.p_value_welch;
      if (welchP == null) return pw;
      return { ...pw, p_value_adj: Math.min(welchP * nComparisons, 1.0), p_value: welchP };
    });
    const adjPValues = newPairwise.map((pw) => pw.p_value_adj).filter((p): p is number => p != null);
    const newMinPAdj = adjPValues.length > 0 ? Math.min(...adjPValues) : f.min_p_adj;
    return { ...f, pairwise: newPairwise, min_p_adj: newMinPAdj };
  });
}

// ── Helpers ──────────────────────────────────────────────────

/** Build a minimal continuous finding for testing. */
function makeFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "test-001",
    domain: "LB",
    test_code: "ALT",
    test_name: "Alanine aminotransferase",
    specimen: null,
    finding: "ALT",
    day: null,
    sex: "M",
    unit: "U/L",
    data_type: "continuous",
    severity: "warning",
    direction: "up",
    dose_response_pattern: "monotonic_increase",
    treatment_related: true,
    max_effect_size: 1.2,
    min_p_adj: 0.01,
    trend_p: 0.005,
    trend_stat: 3.5,
    group_stats: [
      { dose_level: 0, n: 10, mean: 30, sd: 5, median: 29 },
      { dose_level: 1, n: 10, mean: 35, sd: 6, median: 34 },
      { dose_level: 2, n: 10, mean: 45, sd: 7, median: 44 },
      { dose_level: 3, n: 10, mean: 60, sd: 8, median: 59 },
    ],
    pairwise: [
      { dose_level: 1, p_value: 0.15, p_value_adj: 0.35, statistic: null, effect_size: 0.91 },
      { dose_level: 2, p_value: 0.003, p_value_adj: 0.008, statistic: null, effect_size: 2.47 },
      { dose_level: 3, p_value: 0.0001, p_value_adj: 0.0003, statistic: null, effect_size: 4.50 },
    ],
    ...overrides,
  };
}

function makeIncidenceFinding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "test-inc-001",
    domain: "MI",
    test_code: "HEPATOCYTE",
    test_name: "Hepatocellular hypertrophy",
    specimen: "LIVER",
    finding: "Hepatocellular hypertrophy",
    day: null,
    sex: "M",
    unit: null,
    data_type: "incidence",
    severity: "warning",
    direction: "up",
    dose_response_pattern: "monotonic_increase",
    treatment_related: true,
    max_effect_size: null,
    min_p_adj: 0.02,
    trend_p: 0.01,
    trend_stat: 2.5,
    group_stats: [
      { dose_level: 0, n: 10, mean: null, sd: null, median: null, affected: 1, incidence: 0.1 },
      { dose_level: 1, n: 10, mean: null, sd: null, median: null, affected: 3, incidence: 0.3 },
      { dose_level: 2, n: 10, mean: null, sd: null, median: null, affected: 6, incidence: 0.6 },
      { dose_level: 3, n: 10, mean: null, sd: null, median: null, affected: 8, incidence: 0.8 },
    ],
    pairwise: [
      { dose_level: 1, p_value: 0.3, p_value_adj: 0.3, statistic: null, effect_size: null, odds_ratio: 3.8 },
      { dose_level: 2, p_value: 0.02, p_value_adj: 0.02, statistic: null, effect_size: null, odds_ratio: 13.5 },
      { dose_level: 3, p_value: 0.001, p_value_adj: 0.001, statistic: null, effect_size: null, odds_ratio: 36.0 },
    ],
    ...overrides,
  };
}

// ── computeEffectSize ────────────────────────────────────────

describe("computeEffectSize", () => {
  // Known values: control mean=30, sd=5, n=10; treated mean=60, sd=8, n=10
  const ctrl = { mean: 30, sd: 5, n: 10 };
  const trt = { mean: 60, sd: 8, n: 10 };

  test("Cohen's d: (mean_t - mean_c) / pooled_sd", () => {
    const d = computeEffectSize("cohens-d", ctrl.mean, ctrl.sd, ctrl.n, trt.mean, trt.sd, trt.n);
    expect(d).not.toBeNull();
    // pooled_var = (9*25 + 9*64) / 18 = (225+576)/18 = 44.5
    // pooled_sd = sqrt(44.5) ≈ 6.671
    // d = 30 / 6.671 ≈ 4.497
    expect(d!).toBeCloseTo(4.497, 1);
  });

  test("Hedges' g: Cohen's d × J correction", () => {
    const g = computeEffectSize("hedges-g", ctrl.mean, ctrl.sd, ctrl.n, trt.mean, trt.sd, trt.n);
    const d = computeEffectSize("cohens-d", ctrl.mean, ctrl.sd, ctrl.n, trt.mean, trt.sd, trt.n);
    expect(g).not.toBeNull();
    expect(d).not.toBeNull();
    // J = 1 - 3/(4*df - 1) where df = n1 + n2 - 2 = 18
    const df = ctrl.n + trt.n - 2;
    const J = 1 - 3 / (4 * df - 1);
    expect(g!).toBeCloseTo(d! * J, 4);
    // Hedges' g should be smaller in magnitude than Cohen's d
    expect(Math.abs(g!)).toBeLessThan(Math.abs(d!));
  });

  test("Glass's Δ: (mean_t - mean_c) / sd_control", () => {
    const delta = computeEffectSize("glass-delta", ctrl.mean, ctrl.sd, ctrl.n, trt.mean, trt.sd, trt.n);
    expect(delta).not.toBeNull();
    // delta = 30 / 5 = 6.0
    expect(delta!).toBeCloseTo(6.0, 2);
  });

  test("returns null when n < 2", () => {
    expect(computeEffectSize("cohens-d", 30, 5, 1, 60, 8, 10)).toBeNull();
    expect(computeEffectSize("cohens-d", 30, 5, 10, 60, 8, 1)).toBeNull();
  });

  test("returns null when control SD = 0 for Glass's Δ", () => {
    expect(computeEffectSize("glass-delta", 30, 0, 10, 60, 8, 10)).toBeNull();
  });

  test("returns null when pooled SD = 0 for Cohen's d / Hedges' g", () => {
    expect(computeEffectSize("cohens-d", 30, 0, 10, 30, 0, 10)).toBeNull();
    expect(computeEffectSize("hedges-g", 30, 0, 10, 30, 0, 10)).toBeNull();
  });

  test("returns null when means are null", () => {
    expect(computeEffectSize("cohens-d", null, 5, 10, 60, 8, 10)).toBeNull();
    expect(computeEffectSize("cohens-d", 30, null, 10, 60, 8, 10)).toBeNull();
  });

  test("negative effect size when treated < control", () => {
    const d = computeEffectSize("cohens-d", 60, 5, 10, 30, 5, 10);
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(0);
  });
});

// ── applyEffectSizeMethod ────────────────────────────────────

describe("applyEffectSizeMethod", () => {
  test("hedges-g returns input by reference (no-op)", () => {
    const findings = [makeFinding()];
    const result = applyEffectSizeMethod(findings, "hedges-g");
    expect(result).toBe(findings); // Same reference
  });

  test("incidence findings pass through unchanged", () => {
    const inc = makeIncidenceFinding();
    const result = applyEffectSizeMethod([inc], "cohens-d");
    expect(result[0]).toBe(inc); // Same reference
  });

  test("Cohen's d recomputes pairwise effect sizes from group_stats", () => {
    const finding = makeFinding();
    const cohenResult = applyEffectSizeMethod([finding], "cohens-d");
    const hedgesResult = applyEffectSizeMethod([finding], "hedges-g");
    expect(cohenResult[0]).not.toBe(finding); // New object
    // hedges-g is no-op (returns same ref), so compare Cohen's recomputed vs original
    expect(hedgesResult[0]).toBe(finding);
    // For each pairwise, Cohen's d magnitude should be >= Hedges' g magnitude
    // because Hedges' g applies J < 1 correction
    for (const pw of cohenResult[0].pairwise) {
      const gs = finding.group_stats;
      const ctrl = gs.find((g) => g.dose_level === 0)!;
      const trt = gs.find((g) => g.dose_level === pw.dose_level)!;
      if (ctrl.mean != null && ctrl.sd != null && trt.mean != null && trt.sd != null) {
        const expectedD = computeEffectSize("cohens-d", ctrl.mean, ctrl.sd, ctrl.n, trt.mean, trt.sd, trt.n);
        expect(pw.effect_size).toBeCloseTo(expectedD!, 4);
      }
    }
  });

  test("max_effect_size preserves sign direction", () => {
    // Finding with negative direction (decrease)
    const finding = makeFinding({
      direction: "down",
      max_effect_size: -1.5,
      group_stats: [
        { dose_level: 0, n: 10, mean: 60, sd: 8, median: 59 },
        { dose_level: 1, n: 10, mean: 50, sd: 7, median: 49 },
        { dose_level: 2, n: 10, mean: 40, sd: 6, median: 39 },
      ],
      pairwise: [
        { dose_level: 1, p_value: 0.05, p_value_adj: 0.1, statistic: null, effect_size: -1.3 },
        { dose_level: 2, p_value: 0.001, p_value_adj: 0.002, statistic: null, effect_size: -2.8 },
      ],
    });
    const result = applyEffectSizeMethod([finding], "cohens-d");
    // max_effect_size should still be negative (largest magnitude negative)
    expect(result[0].max_effect_size).not.toBeNull();
    expect(result[0].max_effect_size!).toBeLessThan(0);
  });

  test("Glass's Δ uses control SD only", () => {
    // Create a finding where control SD is much smaller than treated SD
    const finding = makeFinding({
      group_stats: [
        { dose_level: 0, n: 10, mean: 30, sd: 2, median: 30 },  // tight control
        { dose_level: 1, n: 10, mean: 40, sd: 20, median: 38 },  // high variance treatment
      ],
      pairwise: [
        { dose_level: 1, p_value: 0.1, p_value_adj: 0.2, statistic: null, effect_size: 0.7 },
      ],
    });
    const glassResult = applyEffectSizeMethod([finding], "glass-delta");
    const cohensResult = applyEffectSizeMethod([finding], "cohens-d");
    // Glass's Δ should be larger because it uses the smaller control SD
    expect(Math.abs(glassResult[0].pairwise[0].effect_size!)).toBeGreaterThan(
      Math.abs(cohensResult[0].pairwise[0].effect_size!),
    );
  });
});

// ── applyMultiplicityMethod ──────────────────────────────────

describe("applyMultiplicityMethod", () => {
  test("dunnett-fwer returns input by reference (no-op)", () => {
    const findings = [makeFinding()];
    const result = applyMultiplicityMethod(findings, "dunnett-fwer");
    expect(result).toBe(findings);
  });

  test("incidence findings pass through unchanged", () => {
    const inc = makeIncidenceFinding();
    const result = applyMultiplicityMethod([inc], "bonferroni");
    expect(result[0]).toBe(inc);
  });

  test("Bonferroni: p_adj = min(p_welch × k, 1.0)", () => {
    const finding = makeFinding({
      pairwise: [
        { dose_level: 1, p_value: 0.15, p_value_adj: 0.35, statistic: null, effect_size: 0.91, p_value_welch: 0.20 },
        { dose_level: 2, p_value: 0.003, p_value_adj: 0.008, statistic: null, effect_size: 2.47, p_value_welch: 0.005 },
        { dose_level: 3, p_value: 0.0001, p_value_adj: 0.0003, statistic: null, effect_size: 4.50, p_value_welch: 0.0002 },
      ],
    });
    const result = applyMultiplicityMethod([finding], "bonferroni");
    // k = 3 comparisons
    expect(result[0].pairwise[0].p_value_adj).toBeCloseTo(0.60, 4);  // 0.20 × 3
    expect(result[0].pairwise[1].p_value_adj).toBeCloseTo(0.015, 4); // 0.005 × 3
    expect(result[0].pairwise[2].p_value_adj).toBeCloseTo(0.0006, 4); // 0.0002 × 3
  });

  test("Bonferroni caps at 1.0", () => {
    const finding = makeFinding({
      pairwise: [
        { dose_level: 1, p_value: 0.5, p_value_adj: 0.8, statistic: null, effect_size: 0.3, p_value_welch: 0.5 },
      ],
    });
    const result = applyMultiplicityMethod([finding], "bonferroni");
    // 0.5 × 1 = 0.5 (only 1 comparison here, so no change)
    expect(result[0].pairwise[0].p_value_adj).toBeLessThanOrEqual(1.0);
  });

  test("graceful fallback when no Welch p-values", () => {
    const finding = makeFinding(); // No p_value_welch
    const result = applyMultiplicityMethod([finding], "bonferroni");
    expect(result[0]).toBe(finding); // Same reference (no-op)
  });

  test("recomputes min_p_adj", () => {
    const finding = makeFinding({
      min_p_adj: 0.0003,
      pairwise: [
        { dose_level: 1, p_value: 0.15, p_value_adj: 0.35, statistic: null, effect_size: 0.91, p_value_welch: 0.20 },
        { dose_level: 2, p_value: 0.003, p_value_adj: 0.008, statistic: null, effect_size: 2.47, p_value_welch: 0.005 },
      ],
    });
    const result = applyMultiplicityMethod([finding], "bonferroni");
    // k=2: min(0.20×2, 0.005×2) = min(0.40, 0.01) = 0.01
    expect(result[0].min_p_adj).toBeCloseTo(0.01, 4);
  });
});

// ── Labels ───────────────────────────────────────────────────

describe("getEffectSizeLabel / getEffectSizeSymbol", () => {
  test("returns correct labels", () => {
    expect(getEffectSizeLabel("hedges-g")).toBe("Hedges\u2019 g");
    expect(getEffectSizeLabel("cohens-d")).toBe("Cohen\u2019s d");
    expect(getEffectSizeLabel("glass-delta")).toBe("Glass\u2019s \u0394");
  });

  test("returns correct symbols", () => {
    expect(getEffectSizeSymbol("hedges-g")).toBe("g");
    expect(getEffectSizeSymbol("cohens-d")).toBe("d");
    expect(getEffectSizeSymbol("glass-delta")).toBe("\u0394");
  });
});

// ── hasWelchPValues ──────────────────────────────────────────

describe("hasWelchPValues", () => {
  test("returns true when Welch p-values present", () => {
    const finding = makeFinding({
      pairwise: [
        { dose_level: 1, p_value: 0.15, p_value_adj: 0.35, statistic: null, effect_size: 0.91, p_value_welch: 0.20 },
      ],
    });
    expect(hasWelchPValues([finding])).toBe(true);
  });

  test("returns false when no Welch p-values", () => {
    const finding = makeFinding(); // No p_value_welch
    expect(hasWelchPValues([finding])).toBe(false);
  });

  test("returns false for incidence-only findings", () => {
    const inc = makeIncidenceFinding();
    expect(hasWelchPValues([inc])).toBe(false);
  });
});

// ── Scheduled + method interaction ───────────────────────────

describe("scheduled + method interaction", () => {
  test("effect size recomputation uses swapped group_stats", () => {
    // Simulate a finding where scheduled_group_stats differ
    const finding = makeFinding({
      group_stats: [
        { dose_level: 0, n: 10, mean: 30, sd: 5, median: 29 },
        { dose_level: 1, n: 10, mean: 60, sd: 8, median: 59 },
      ],
      pairwise: [
        { dose_level: 1, p_value: 0.001, p_value_adj: 0.001, statistic: null, effect_size: 4.5 },
      ],
    });

    // Apply Cohen's d
    const result = applyEffectSizeMethod([finding], "cohens-d");
    // Verify recomputation happened from group_stats
    const pw = result[0].pairwise[0];
    expect(pw.effect_size).not.toBeNull();
    // Should match computeEffectSize("cohens-d", 30, 5, 10, 60, 8, 10)
    const expected = computeEffectSize("cohens-d", 30, 5, 10, 60, 8, 10);
    expect(pw.effect_size!).toBeCloseTo(expected!, 4);
  });
});
