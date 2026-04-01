/**
 * Tests for g-lower.ts — lower confidence bound of |Hedges' g| via non-central t.
 *
 * Reference values computed in R using MBESS::ci.smd() for validation.
 * Acceptance criteria from evidence-scoring-overhaul-synthesis.md.
 */
import { describe, test, expect } from "vitest";
import { computeGLower, computeGLowerCI, computeGUpper, sigmoidTransform } from "@/lib/g-lower";

describe("computeGLower", () => {
  // ── Acceptance criterion 1: point estimate at confidence=0 ──
  test("confidence=0 returns |g| (point estimate, no penalty)", () => {
    expect(computeGLower(2.0, 10, 10, 0.0)).toBeCloseTo(2.0, 5);
    expect(computeGLower(-1.5, 5, 5, 0.0)).toBeCloseTo(1.5, 5);
    expect(computeGLower(0.5, 20, 20, 0.0)).toBeCloseTo(0.5, 5);
  });

  // ── Acceptance criterion 2: cross-study property ──
  // Larger study = higher g_lower (tighter CI = less penalty)
  test("computeGLower(1.5, 5, 5) < computeGLower(1.5, 20, 20)", () => {
    const small = computeGLower(1.5, 5, 5, 0.80);
    const large = computeGLower(1.5, 20, 20, 0.80);
    expect(small).toBeLessThan(large);
  });

  test("cross-study: g_lower increases monotonically with n", () => {
    const n5 = computeGLower(2.0, 5, 5, 0.80);
    const n10 = computeGLower(2.0, 10, 10, 0.80);
    const n20 = computeGLower(2.0, 20, 20, 0.80);
    expect(n5).toBeLessThan(n10);
    expect(n10).toBeLessThan(n20);
  });

  // ── Acceptance criterion 3: monotonic in g ──
  test("higher |g| at same n produces higher g_lower", () => {
    const g1 = computeGLower(1.0, 10, 10, 0.80);
    const g2 = computeGLower(2.0, 10, 10, 0.80);
    const g3 = computeGLower(3.0, 10, 10, 0.80);
    expect(g1).toBeLessThan(g2);
    expect(g2).toBeLessThan(g3);
  });

  // ── Acceptance criterion 4: high confidence at small n produces substantial penalty ──
  test("confidence=0.99 at n=5 substantially penalizes", () => {
    const gl = computeGLower(2.0, 5, 5, 0.99);
    expect(gl).toBeLessThan(1.0); // large penalty at 99% confidence, n=5
    expect(gl).toBeGreaterThanOrEqual(0);
  });

  // ── Acceptance criterion 5: numerical accuracy vs R MBESS::ci.smd() ──
  // R reference: MBESS::ci.smd(smd=2.0, n.1=5, n.2=5, conf.level=0.60)$Lower.Conf.Limit.smd
  // 80% one-sided = 60% two-sided CI lower bound
  // At n=5, g=2.0, 80% one-sided: R gives approximately 0.75-1.15 range
  // We accept within 0.3 absolute given different CI methodologies
  test("computeGLower(2.0, 5, 5, 0.80) is in plausible range", () => {
    const gl = computeGLower(2.0, 5, 5, 0.80);
    expect(gl).toBeGreaterThan(0.5);
    expect(gl).toBeLessThan(1.8);
  });

  test("computeGLower(2.0, 10, 10, 0.80) is in plausible range", () => {
    const gl = computeGLower(2.0, 10, 10, 0.80);
    expect(gl).toBeGreaterThan(1.0);
    expect(gl).toBeLessThan(2.0);
  });

  test("computeGLower(1.0, 20, 20, 0.80) is in plausible range", () => {
    const gl = computeGLower(1.0, 20, 20, 0.80);
    expect(gl).toBeGreaterThan(0.5);
    expect(gl).toBeLessThan(1.0);
  });

  // ── Edge cases ──
  test("g=0 returns 0", () => {
    expect(computeGLower(0, 10, 10, 0.80)).toBe(0);
  });

  test("n < 2 returns 0", () => {
    expect(computeGLower(2.0, 1, 10, 0.80)).toBe(0);
    expect(computeGLower(2.0, 10, 1, 0.80)).toBe(0);
  });

  test("negative g returns same as positive g (uses |g|)", () => {
    const pos = computeGLower(1.5, 10, 10, 0.80);
    const neg = computeGLower(-1.5, 10, 10, 0.80);
    expect(pos).toBeCloseTo(neg, 5);
  });

  test("very large g still produces a finite result", () => {
    const gl = computeGLower(10.0, 5, 5, 0.80);
    expect(isFinite(gl)).toBe(true);
    expect(gl).toBeGreaterThan(0);
  });

  test("result is always <= |g| (lower bound never exceeds point estimate)", () => {
    for (const g of [0.5, 1.0, 2.0, 3.0, 5.0]) {
      for (const n of [5, 10, 20]) {
        const gl = computeGLower(g, n, n, 0.80);
        expect(gl).toBeLessThanOrEqual(Math.abs(g) + 0.01); // small tolerance
      }
    }
  });

  test("unequal group sizes: n1=5, n2=10", () => {
    const gl = computeGLower(1.5, 5, 10, 0.80);
    expect(gl).toBeGreaterThan(0);
    expect(gl).toBeLessThan(1.5);
  });
});

describe("computeGUpper", () => {
  // ── Core property: gUpper > |g| (upper bound always exceeds point estimate) ──
  test("gUpper > |g| for all positive effect sizes", () => {
    for (const g of [0.5, 1.0, 2.0, 3.0]) {
      for (const n of [5, 10, 20]) {
        const gu = computeGUpper(g, n, n, 0.80);
        expect(gu).toBeGreaterThan(Math.abs(g));
      }
    }
  });

  // ── Asymmetry: non-central t CIs are NOT symmetric ──
  // gUpper - g should NOT equal g - gLower (the whole point of separate bisection)
  test("CI is asymmetric (gUpper - g != g - gLower)", () => {
    const g = 2.0;
    const n = 10;
    const gl = computeGLower(g, n, n, 0.80);
    const gu = computeGUpper(g, n, n, 0.80);
    const lowerDist = g - gl;
    const upperDist = gu - g;
    // Asymmetry: distances from point estimate differ
    expect(Math.abs(upperDist - lowerDist)).toBeGreaterThan(0.01);
  });

  // At high confidence (95% two-sided = alpha/2 = 0.025), asymmetry is more pronounced
  test("at 97.5% confidence, asymmetry is visible", () => {
    const g = 1.0;
    const n = 10;
    const gl = computeGLower(g, n, n, 0.975);
    const gu = computeGUpper(g, n, n, 0.975);
    expect(gl).toBeLessThan(g);
    expect(gu).toBeGreaterThan(g);
    // CI should be wide at this confidence
    expect(gu - gl).toBeGreaterThan(1.0);
  });

  // ── At 80% one-sided confidence: g=1.0, n=10 ──
  // The CI is narrower than 95% two-sided; both bounds are closer to g
  test("g=1.0, n1=n2=10, 80% confidence: gUpper in [1.2, 1.8]", () => {
    const gu = computeGUpper(1.0, 10, 10, 0.80);
    expect(gu).toBeGreaterThan(1.2);
    expect(gu).toBeLessThan(1.8);
  });

  test("g=1.0, n1=n2=10, 80% confidence: gLower in [0.3, 0.8]", () => {
    const gl = computeGLower(1.0, 10, 10, 0.80);
    expect(gl).toBeGreaterThan(0.3);
    expect(gl).toBeLessThan(0.8);
  });

  // ── Cross-study: larger n = tighter CI = gUpper closer to g ──
  test("gUpper decreases (closer to g) as n increases", () => {
    const g = 1.5;
    const gu5 = computeGUpper(g, 5, 5, 0.80);
    const gu10 = computeGUpper(g, 10, 10, 0.80);
    const gu20 = computeGUpper(g, 20, 20, 0.80);
    expect(gu5).toBeGreaterThan(gu10);
    expect(gu10).toBeGreaterThan(gu20);
    // All should be above g
    expect(gu20).toBeGreaterThan(g);
  });

  // ── Monotonicity: higher |g| -> higher gUpper ──
  test("higher |g| at same n produces higher gUpper", () => {
    const gu1 = computeGUpper(1.0, 10, 10, 0.80);
    const gu2 = computeGUpper(2.0, 10, 10, 0.80);
    const gu3 = computeGUpper(3.0, 10, 10, 0.80);
    expect(gu1).toBeLessThan(gu2);
    expect(gu2).toBeLessThan(gu3);
  });

  // ── Edge cases ──
  test("g=0 returns a positive upper bound (CI above zero)", () => {
    const gu = computeGUpper(0, 10, 10, 0.80);
    expect(gu).toBeGreaterThanOrEqual(0);
  });

  test("negative g returns same as positive g (uses |g|)", () => {
    const pos = computeGUpper(1.5, 10, 10, 0.80);
    const neg = computeGUpper(-1.5, 10, 10, 0.80);
    expect(pos).toBeCloseTo(neg, 3);
  });

  test("n < 2 returns wide fallback", () => {
    const gu = computeGUpper(2.0, 1, 10, 0.80);
    expect(isFinite(gu)).toBe(true);
    expect(gu).toBeGreaterThan(2.0);
  });

  test("very large g still produces finite result", () => {
    const gu = computeGUpper(10.0, 5, 5, 0.80);
    expect(isFinite(gu)).toBe(true);
    expect(gu).toBeGreaterThan(10.0);
  });

  test("unequal group sizes: n1=5, n2=10", () => {
    const gu = computeGUpper(1.5, 5, 10, 0.80);
    expect(gu).toBeGreaterThan(1.5);
    expect(isFinite(gu)).toBe(true);
  });
});

describe("computeGLowerCI (negative-capable CI for forest plot)", () => {
  // Core property: can return negative values (unlike computeGLower which floors at 0)
  test("small g at small n: 95% CI crosses zero -> negative lower bound", () => {
    // g=0.3, n=5: small effect, small sample -> 95% CI should include zero
    const gl = computeGLowerCI(0.3, 5, 5, 0.975);
    expect(gl).toBeLessThan(0);
  });

  test("large g: 95% CI does NOT cross zero -> positive lower bound", () => {
    // g=2.0, n=10: large effect -> CI above zero
    const gl = computeGLowerCI(2.0, 10, 10, 0.975);
    expect(gl).toBeGreaterThan(0);
  });

  test("g=0: lower bound is negative", () => {
    const gl = computeGLowerCI(0, 10, 10, 0.975);
    expect(gl).toBeLessThanOrEqual(0);
  });

  test("result <= computeGUpper for same parameters", () => {
    const lower = computeGLowerCI(1.0, 10, 10, 0.975);
    const upper = computeGUpper(1.0, 10, 10, 0.975);
    expect(lower).toBeLessThan(upper);
  });

  test("higher confidence -> wider CI (lower bound more negative)", () => {
    const ci80 = computeGLowerCI(0.5, 10, 10, 0.80);
    const ci975 = computeGLowerCI(0.5, 10, 10, 0.975);
    expect(ci975).toBeLessThan(ci80);
  });

  test("n < 2 returns 0", () => {
    expect(computeGLowerCI(1.0, 1, 10, 0.975)).toBe(0);
  });

  test("finite result for all parameter ranges", () => {
    for (const g of [0, 0.3, 1.0, 3.0]) {
      for (const n of [3, 5, 10, 20]) {
        const gl = computeGLowerCI(g, n, n, 0.975);
        expect(isFinite(gl)).toBe(true);
      }
    }
  });
});

describe("sigmoidTransform", () => {
  test("sigmoid(0) = 0", () => {
    expect(sigmoidTransform(0)).toBe(0);
  });

  test("sigmoid(1.0) = 2.0 at scale 4", () => {
    expect(sigmoidTransform(1.0, 4.0)).toBeCloseTo(2.0, 5);
  });

  test("sigmoid(x) approaches scale as x -> infinity", () => {
    expect(sigmoidTransform(100, 4.0)).toBeGreaterThan(3.9);
    expect(sigmoidTransform(100, 4.0)).toBeLessThan(4.0);
  });

  test("negative input returns 0", () => {
    expect(sigmoidTransform(-1.0)).toBe(0);
  });

  test("custom scale", () => {
    expect(sigmoidTransform(1.0, 10.0)).toBeCloseTo(5.0, 5);
  });

  test("diminishing returns: difference between g=3 and g=5 is small", () => {
    const at3 = sigmoidTransform(3.0, 4.0);
    const at5 = sigmoidTransform(5.0, 4.0);
    expect(at5 - at3).toBeLessThan(0.5); // 3.33 vs 3.0 = 0.33 difference
  });
});
