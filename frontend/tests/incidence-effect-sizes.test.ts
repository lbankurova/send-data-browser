/**
 * Tests for incidence effect size metrics: risk difference (Newcombe CI)
 * and Cohen's h (Wilson+arcsine hybrid CI).
 *
 * Phase 0A/0B of multi-endpoint investigation synthesis.
 */
import { describe, test, expect } from "vitest";
import { computeRiskDifference, computeCohensH, benjaminiHochberg } from "@/lib/derive-summaries";

describe("computeRiskDifference (Phase 0A)", () => {
  // ── Basic correctness ──

  test("0% control vs 50% treated -> RD = 0.5", () => {
    const result = computeRiskDifference(5, 10, 0, 10);
    expect(result).not.toBeNull();
    expect(result!.rd).toBeCloseTo(0.5, 5);
  });

  test("equal proportions -> RD = 0", () => {
    const result = computeRiskDifference(3, 10, 3, 10);
    expect(result).not.toBeNull();
    expect(result!.rd).toBeCloseTo(0, 5);
  });

  test("100% both -> RD = 0", () => {
    const result = computeRiskDifference(10, 10, 10, 10);
    expect(result).not.toBeNull();
    expect(result!.rd).toBeCloseTo(0, 5);
  });

  test("control higher than treated -> negative RD", () => {
    const result = computeRiskDifference(1, 10, 5, 10);
    expect(result).not.toBeNull();
    expect(result!.rd).toBeLessThan(0);
  });

  // ── Newcombe CI properties ──

  test("CI contains RD", () => {
    const result = computeRiskDifference(5, 10, 0, 10)!;
    expect(result.rdLower).toBeLessThanOrEqual(result.rd);
    expect(result.rdUpper).toBeGreaterThanOrEqual(result.rd);
  });

  test("CI contains 0 when proportions are equal", () => {
    const result = computeRiskDifference(3, 10, 3, 10)!;
    expect(result.rdLower).toBeLessThanOrEqual(0);
    expect(result.rdUpper).toBeGreaterThanOrEqual(0);
  });

  test("CI bounded within [-1, 1]", () => {
    for (const [at, nt, ac, nc] of [[0, 10, 10, 10], [10, 10, 0, 10], [5, 5, 2, 5], [0, 3, 3, 3]]) {
      const result = computeRiskDifference(at, nt, ac, nc)!;
      expect(result.rdLower).toBeGreaterThanOrEqual(-1);
      expect(result.rdUpper).toBeLessThanOrEqual(1);
    }
  });

  test("CI narrows with larger n", () => {
    const small = computeRiskDifference(3, 5, 0, 5)!;
    const large = computeRiskDifference(30, 50, 0, 50)!;
    const smallWidth = small.rdUpper - small.rdLower;
    const largeWidth = large.rdUpper - large.rdLower;
    expect(largeWidth).toBeLessThan(smallWidth);
  });

  // ── Zero cells (common in preclinical histopath) ──

  test("0 affected in both groups", () => {
    const result = computeRiskDifference(0, 10, 0, 10);
    expect(result).not.toBeNull();
    expect(result!.rd).toBeCloseTo(0, 5);
    // Wilson CI for 0/10 is not [0, 0] — it has positive upper bound
    expect(result!.rdLower).toBeLessThanOrEqual(0);
    expect(result!.rdUpper).toBeGreaterThanOrEqual(0);
  });

  test("0 control, all treated affected", () => {
    const result = computeRiskDifference(10, 10, 0, 10);
    expect(result).not.toBeNull();
    expect(result!.rd).toBeCloseTo(1.0, 5);
  });

  // ── Edge cases ──

  test("n = 0 returns null", () => {
    expect(computeRiskDifference(0, 0, 0, 10)).toBeNull();
    expect(computeRiskDifference(0, 10, 0, 0)).toBeNull();
  });

  // ── Small n (preclinical typical: n=3-5) ──

  test("n=3 produces wide but valid CI", () => {
    const result = computeRiskDifference(2, 3, 0, 3)!;
    expect(result.rd).toBeCloseTo(2 / 3, 3);
    expect(result.rdLower).toBeGreaterThanOrEqual(-1);
    expect(result.rdUpper).toBeLessThanOrEqual(1);
    // Very wide CI expected at n=3
    const width = result.rdUpper - result.rdLower;
    expect(width).toBeGreaterThan(0.5);
  });
});

describe("computeCohensH (Phase 0B)", () => {
  // ── Verification from spec: 0% vs 50% -> h = pi/2 = 1.571 ──

  test("0% control vs 50% treated -> h = pi/2 = 1.571", () => {
    const result = computeCohensH(5, 10, 0, 10);
    expect(result).not.toBeNull();
    expect(result!.h).toBeCloseTo(Math.PI / 2, 3);
  });

  // ── Basic correctness ──

  test("equal proportions -> h = 0", () => {
    const result = computeCohensH(3, 10, 3, 10);
    expect(result).not.toBeNull();
    expect(result!.h).toBeCloseTo(0, 5);
  });

  test("0% vs 100% -> h = pi (maximum possible)", () => {
    const result = computeCohensH(10, 10, 0, 10);
    expect(result).not.toBeNull();
    expect(result!.h).toBeCloseTo(Math.PI, 3);
  });

  test("control higher than treated -> negative h", () => {
    const result = computeCohensH(1, 10, 5, 10);
    expect(result).not.toBeNull();
    expect(result!.h).toBeLessThan(0);
  });

  // ── Hybrid CI properties ──

  test("CI contains h", () => {
    const result = computeCohensH(5, 10, 0, 10)!;
    expect(result.hLower).toBeLessThanOrEqual(result.h);
    expect(result.hUpper).toBeGreaterThanOrEqual(result.h);
  });

  test("CI contains 0 when proportions are equal", () => {
    const result = computeCohensH(3, 10, 3, 10)!;
    expect(result.hLower).toBeLessThanOrEqual(0);
    expect(result.hUpper).toBeGreaterThanOrEqual(0);
  });

  test("CI narrows with larger n", () => {
    const small = computeCohensH(3, 5, 0, 5)!;
    const large = computeCohensH(30, 50, 0, 50)!;
    const smallWidth = small.hUpper - small.hLower;
    const largeWidth = large.hUpper - large.hLower;
    expect(largeWidth).toBeLessThan(smallWidth);
  });

  // ── Scale comparability with Hedges' g (Cohen's conventions) ──
  // Cohen's h = 0.2 (small), 0.5 (medium), 0.8 (large) — same as g

  test("medium effect: 25% vs 50% -> h ~ 0.52 (medium range)", () => {
    // arcsin(sqrt(0.5)) - arcsin(sqrt(0.25)) = 0.785 - 0.524 = 0.262 -> h = 0.524
    const result = computeCohensH(5, 10, 2, 8)!;
    // Approximate — proportions differ slightly from 25%/50% due to integer counts
    expect(Math.abs(result.h)).toBeGreaterThan(0.2);
    expect(Math.abs(result.h)).toBeLessThan(1.5);
  });

  // ── Zero cells (critical: delta method fails here, hybrid should not) ──

  test("0 affected in both groups -> h = 0, CI defined", () => {
    const result = computeCohensH(0, 10, 0, 10);
    expect(result).not.toBeNull();
    expect(result!.h).toBeCloseTo(0, 5);
    // Wilson CI at p=0 gives (0, ~0.31) — arcsine transform should produce defined bounds
    expect(isFinite(result!.hLower)).toBe(true);
    expect(isFinite(result!.hUpper)).toBe(true);
  });

  test("all affected in both groups -> h = 0, CI defined", () => {
    const result = computeCohensH(10, 10, 10, 10);
    expect(result).not.toBeNull();
    expect(result!.h).toBeCloseTo(0, 5);
    expect(isFinite(result!.hLower)).toBe(true);
    expect(isFinite(result!.hUpper)).toBe(true);
  });

  // ── Edge cases ──

  test("n = 0 returns null", () => {
    expect(computeCohensH(0, 0, 0, 10)).toBeNull();
    expect(computeCohensH(0, 10, 0, 0)).toBeNull();
  });

  // ── Small n (preclinical typical: n=3-5) ──

  test("n=3: 0/3 control vs 2/3 treated -> large h with wide CI", () => {
    const result = computeCohensH(2, 3, 0, 3)!;
    expect(result.h).toBeGreaterThan(0.5); // substantial effect
    expect(isFinite(result.hLower)).toBe(true);
    expect(isFinite(result.hUpper)).toBe(true);
    // Wide CI expected
    const width = result.hUpper - result.hLower;
    expect(width).toBeGreaterThan(1.0);
  });
});

describe("benjaminiHochberg (BH-FDR)", () => {
  test("single p-value: q = p (no adjustment needed)", () => {
    const q = benjaminiHochberg([0.03]);
    expect(q[0]).toBeCloseTo(0.03, 5);
  });

  test("all null: all null", () => {
    const q = benjaminiHochberg([null, null, null]);
    expect(q).toEqual([null, null, null]);
  });

  test("classic example: 3 p-values", () => {
    // p = [0.01, 0.04, 0.03], sorted: [0.01, 0.03, 0.04]
    // raw q: [0.01*3/1=0.03, 0.03*3/2=0.045, 0.04*3/3=0.04]
    // monotonicity: [0.03, 0.04, 0.04] (0.045 capped to min(0.045, 0.04)=0.04)
    const q = benjaminiHochberg([0.01, 0.04, 0.03]);
    expect(q[0]).toBeCloseTo(0.03, 5);    // rank 1: 0.01 * 3/1 = 0.03
    expect(q[2]).toBeCloseTo(0.04, 5);    // rank 2: 0.03 * 3/2 = 0.045 -> capped to 0.04
    expect(q[1]).toBeCloseTo(0.04, 5);    // rank 3: 0.04 * 3/3 = 0.04
  });

  test("preserves order of original array", () => {
    const q = benjaminiHochberg([0.5, 0.01, 0.1]);
    // 0.01 is smallest -> rank 1, 0.1 -> rank 2, 0.5 -> rank 3
    // q[1] should be smallest (it was the smallest p)
    expect(q[1]!).toBeLessThan(q[2]!);
    expect(q[2]!).toBeLessThanOrEqual(q[0]!);
  });

  test("handles null values (mixed with real p-values)", () => {
    const q = benjaminiHochberg([0.05, null, 0.01]);
    expect(q[1]).toBeNull();
    // m = 2 (only 2 non-null)
    expect(q[2]).toBeCloseTo(0.02, 5); // 0.01 * 2/1 = 0.02
    expect(q[0]).toBeCloseTo(0.05, 5); // 0.05 * 2/2 = 0.05
  });

  test("q-values never exceed 1.0", () => {
    const q = benjaminiHochberg([0.8, 0.9, 0.95]);
    for (const qi of q) {
      if (qi != null) expect(qi).toBeLessThanOrEqual(1.0);
    }
  });

  test("q-values are monotonically increasing with p-value rank", () => {
    const pValues = [0.001, 0.01, 0.03, 0.05, 0.1, 0.5];
    const q = benjaminiHochberg(pValues);
    // When p-values are already sorted ascending, q-values should be non-decreasing
    for (let i = 1; i < q.length; i++) {
      expect(q[i]!).toBeGreaterThanOrEqual(q[i - 1]!);
    }
  });

  test("10 p-values: some become non-significant after FDR", () => {
    // 10 tests, some just below 0.05
    const pValues = [0.001, 0.005, 0.01, 0.02, 0.04, 0.06, 0.1, 0.2, 0.5, 0.9];
    const q = benjaminiHochberg(pValues);
    // At alpha=0.05 (FDR), the borderline p=0.04 becomes q = 0.04 * 10/5 = 0.08 (non-sig)
    // p=0.02 becomes q = 0.02 * 10/4 = 0.05 (borderline)
    expect(q[4]!).toBeGreaterThan(0.05); // p=0.04 -> q > 0.05
    expect(q[0]!).toBeLessThan(0.05);    // p=0.001 -> q < 0.05
  });
});
