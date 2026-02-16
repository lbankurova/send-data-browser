/** Statistical test utilities for small-sample tox data. */

// ─── Log-factorial with memoization ─────────────────────────────────────────

const logFacCache: number[] = [0, 0]; // logFac(0) = 0, logFac(1) = 0

function logFac(n: number): number {
  if (n < 0) return 0;
  if (n < logFacCache.length) return logFacCache[n];
  let val = logFacCache[logFacCache.length - 1];
  for (let i = logFacCache.length; i <= n; i++) {
    val += Math.log(i);
    logFacCache.push(val);
  }
  return val;
}

// ─── Fisher's exact test (2×2) ──────────────────────────────────────────────

/**
 * Two-sided Fisher's exact test for a 2×2 contingency table.
 *
 *           | Col1 | Col2 |
 *     Row1  |  a   |  b   |  R1 = a+b
 *     Row2  |  c   |  d   |  R2 = c+d
 *           | C1   | C2   |  N
 *
 * Returns the two-sided p-value.
 * For histopath: a = maleAffected, b = maleUnaffected, c = femaleAffected, d = femaleUnaffected
 */
export function fishersExact2x2(a: number, b: number, c: number, d: number): number {
  const N = a + b + c + d;
  if (N === 0) return 1;

  const R1 = a + b;
  const R2 = c + d;
  const C1 = a + c;
  const C2 = b + d;

  // Log of hypergeometric probability for a specific table configuration
  const logHyper = (x: number): number =>
    logFac(R1) + logFac(R2) + logFac(C1) + logFac(C2)
    - logFac(N) - logFac(x) - logFac(R1 - x) - logFac(C1 - x) - logFac(N - R1 - C1 + x);

  // Observed probability
  const logPobs = logHyper(a);

  // Enumerate all possible values of a (cell [0,0])
  // a ranges from max(0, C1-R2) to min(R1, C1)
  const aMin = Math.max(0, C1 - R2);
  const aMax = Math.min(R1, C1);

  let pValue = 0;
  for (let x = aMin; x <= aMax; x++) {
    const logPx = logHyper(x);
    // Two-sided: include tables as extreme or more extreme than observed
    if (logPx <= logPobs + 1e-10) {
      pValue += Math.exp(logPx);
    }
  }

  return Math.min(pValue, 1.0);
}
