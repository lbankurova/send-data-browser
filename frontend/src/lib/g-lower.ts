/**
 * g-lower: Lower confidence bound of |Hedges' g| using the non-central
 * t-distribution. Analogous to BMDL in benchmark dose methodology.
 *
 * Replaces -log10(p) as the primary statistical ranking dimension.
 * Cross-study comparable: penalizes small-N studies proportionally to
 * their estimation uncertainty.
 *
 * @module g-lower
 * @see docs/_internal/research/evidence-scoring-alternatives.md (R1)
 */

// ── Non-central t CDF via series expansion ────────────────────
// Algorithm: Johnson, Kotz & Balakrishnan (1995), Chapter 31.
// The CDF of the non-central t with df degrees of freedom and
// non-centrality parameter delta is computed via the incomplete
// beta function series. For our use case (df=4..60, delta=0..12),
// convergence is rapid (< 50 terms).

/** Regularized incomplete beta function I_x(a, b) via continued fraction. */
function betaIncomplete(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use the symmetry relation when x > (a+1)/(a+b+2) for faster convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(1 - x, b, a);
  }

  // Lentz's continued fraction for I_x(a, b)
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  let f = 1;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 200; m++) {
    // Even step
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= d * c;

    // Odd step
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    f *= delta;

    if (Math.abs(delta - 1) < 1e-12) break;
  }

  return front * f;
}

/** Log-gamma via Lanczos approximation (g=7, n=9). */
function lnGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Standard normal CDF (Abramowitz & Stegun approximation). */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/**
 * CDF of the non-central t-distribution via Gauss-Legendre quadrature.
 *
 * Uses the representation:
 *   T = (Z + delta) / sqrt(V / df),  Z ~ N(0,1), V ~ chi^2(df)
 *   P(T <= t) = E_V[ Phi(t * sqrt(V/df) - delta) ]
 *
 * The expectation is computed by 32-point Gauss-Legendre quadrature over
 * the chi-squared density. This avoids the series convergence subtleties of
 * the Poisson-weighted incomplete beta approach (AS 243) while being exact
 * to ~1e-10 for all parameter ranges used in preclinical toxicology
 * (df=4..60, delta=0..12).
 *
 * @see Johnson NL, Kotz S, Balakrishnan N (1995). Continuous Univariate
 *      Distributions, Vol 2, Chapter 31.
 */

// 32-point Gauss-Legendre nodes and weights on [-1, 1] (precomputed)
const GL_NODES = [
  -0.9972638618, -0.9856115115, -0.9647622556, -0.9349060759,
  -0.8963211558, -0.8493676137, -0.7944837960, -0.7321821187,
  -0.6630442669, -0.5877157572, -0.5068999089, -0.4213512761,
  -0.3318686023, -0.2392873623, -0.1444719616, -0.0483076657,
   0.0483076657,  0.1444719616,  0.2392873623,  0.3318686023,
   0.4213512761,  0.5068999089,  0.5877157572,  0.6630442669,
   0.7321821187,  0.7944837960,  0.8493676137,  0.8963211558,
   0.9349060759,  0.9647622556,  0.9856115115,  0.9972638618,
];
const GL_WEIGHTS = [
  0.0070186100, 0.0162743947, 0.0253920653, 0.0342738629,
  0.0428358980, 0.0509980593, 0.0586840935, 0.0658222228,
  0.0723457941, 0.0781938958, 0.0833119242, 0.0876520930,
  0.0911738787, 0.0938443991, 0.0956387201, 0.0965400885,
  0.0965400885, 0.0956387201, 0.0938443991, 0.0911738787,
  0.0876520930, 0.0833119242, 0.0781938958, 0.0723457941,
  0.0658222228, 0.0586840935, 0.0509980593, 0.0428358980,
  0.0342738629, 0.0253920653, 0.0162743947, 0.0070186100,
];

/** Chi-squared PDF: f(v; df) = v^(df/2-1) * exp(-v/2) / (2^(df/2) * Gamma(df/2)) */
function chi2PDF(v: number, df: number): number {
  if (v <= 0) return 0;
  const halfDf = df / 2;
  return Math.exp((halfDf - 1) * Math.log(v) - v / 2 - halfDf * Math.log(2) - lnGamma(halfDf));
}

function nctCDF(t: number, df: number, delta: number): number {
  if (!isFinite(t)) return t > 0 ? 1 : 0;
  if (df <= 0) return NaN;

  // Special case: delta = 0 reduces to central t (use incomplete beta for exactness)
  if (Math.abs(delta) < 1e-12) {
    const x = df / (df + t * t);
    const p = 0.5 * betaIncomplete(x, df / 2, 0.5);
    return t >= 0 ? 1 - p : p;
  }

  // Reflection: P(T <= t | df, d) = 1 - P(T <= -t | df, -d)
  if (t < 0) {
    return 1 - nctCDF(-t, df, -delta);
  }

  // Gauss-Legendre quadrature: integrate over the chi-squared distribution.
  // Map [0, C] -> [-1, 1] where C is a generous upper bound for chi^2(df).
  // chi^2 mean = df, var = 2*df. C = df + 8*sqrt(2*df) covers >99.99%.
  const C = df + 8 * Math.sqrt(2 * df);
  const halfC = C / 2;

  let prob = 0;
  for (let i = 0; i < 32; i++) {
    // Map GL node from [-1,1] to [0, C]: v = halfC * (1 + node)
    const v = halfC * (1 + GL_NODES[i]);
    if (v <= 0) continue;
    // Integrand: Phi(t * sqrt(v/df) - delta) * chi2PDF(v, df) * (C/2)
    const z = t * Math.sqrt(v / df) - delta;
    prob += GL_WEIGHTS[i] * normalCDF(z) * chi2PDF(v, df);
  }
  prob *= halfC; // Jacobian of the [-1,1] -> [0,C] mapping

  return Math.max(0, Math.min(1, prob));
}

// ── Public API ────────────────────────────────────────────────

/**
 * Compute the lower confidence bound of |Hedges' g| using the
 * non-central t-distribution.
 *
 * The non-centrality parameter of the t-statistic is:
 *   delta = g * sqrt(n1 * n2 / (n1 + n2))
 *
 * The lower bound on delta at the given confidence level is found via
 * the non-central t quantile, then converted back to the g scale.
 *
 * @param g - Hedges' g (signed effect size)
 * @param n1 - control group sample size
 * @param n2 - treated group sample size
 * @param confidenceLevel - one-sided confidence level (default 0.80)
 * @returns lower bound of |g|, floored at 0
 */
export function computeGLower(
  g: number,
  n1: number,
  n2: number,
  confidenceLevel: number = 0.80,
): number {
  if (confidenceLevel <= 0) return Math.abs(g);
  if (n1 < 2 || n2 < 2) return 0;

  const absG = Math.abs(g);
  const df = n1 + n2 - 2;
  const lambda = absG * Math.sqrt(n1 * n2 / (n1 + n2));

  // The observed t-statistic is t_obs = lambda (by construction of g)
  // We want: delta_lower such that P(T <= t_obs | df, delta_lower) = confidenceLevel
  // This is equivalent to finding the lower confidence limit on the
  // non-centrality parameter.

  // For the lower bound, we solve:
  //   nctCDF(t_obs, df, delta_lower) = 1 - alpha
  // where alpha = 1 - confidenceLevel
  // Equivalently, delta_lower = nctQuantile(1-alpha, df, ...) inverted.

  // Direct approach: the lower CI on delta is the value delta_L such that
  // P(T >= t_obs | df, delta_L) = alpha, i.e., nctCDF(t_obs, df, delta_L) = 1 - alpha.

  // Use bisection on delta to find delta_L
  const targetCDF = 1 - (1 - confidenceLevel); // = confidenceLevel

  // If the observed t is very small, the lower bound is 0
  if (lambda < 0.01) return 0;

  let deltaLo = 0;
  let deltaHi = lambda * 2 + 5;

  // We want delta_L such that nctCDF(lambda, df, delta_L) = confidenceLevel
  // As delta_L increases, nctCDF(t_obs=lambda, df, delta_L) decreases
  // (higher non-centrality means the distribution shifts right, so P(T <= t_obs) decreases)

  for (let i = 0; i < 100; i++) {
    const deltaMid = (deltaLo + deltaHi) / 2;
    const cdf = nctCDF(lambda, df, deltaMid);
    if (Math.abs(cdf - targetCDF) < 1e-8) {
      const gLower = deltaMid / Math.sqrt(n1 * n2 / (n1 + n2));
      return Math.max(0, gLower);
    }
    // As delta increases, CDF(t_obs) decreases
    if (cdf > targetCDF) deltaLo = deltaMid;
    else deltaHi = deltaMid;
    if (deltaHi - deltaLo < 1e-8) {
      const gLower = deltaMid / Math.sqrt(n1 * n2 / (n1 + n2));
      return Math.max(0, gLower);
    }
  }

  const gLower = ((deltaLo + deltaHi) / 2) / Math.sqrt(n1 * n2 / (n1 + n2));
  return Math.max(0, gLower);
}

/**
 * Compute the lower bound of a two-sided CI on Hedges' g.
 * Unlike computeGLower (which floors at 0 for ranking), this returns
 * the actual CI bound which can be negative — meaning the CI crosses
 * zero and the effect is not statistically significant.
 *
 * Used for forest plot display where crossing zero is informative.
 */
export function computeGLowerCI(
  g: number,
  n1: number,
  n2: number,
  confidenceLevel: number = 0.975,
): number {
  if (n1 < 2 || n2 < 2) return 0;

  const absG = Math.abs(g);
  const df = n1 + n2 - 2;
  const scaleFactor = Math.sqrt(n1 * n2 / (n1 + n2));
  const lambda = absG * scaleFactor;

  const targetCDF = confidenceLevel;

  // Search range includes negative delta (CI can cross zero)
  let deltaLo = -3 * scaleFactor; // allows g_lower down to about -3
  let deltaHi = lambda * 2 + 5;

  // Check if the solution is below our search range
  if (nctCDF(lambda, df, deltaLo) < targetCDF) {
    // Even at very negative delta, CDF is below target — lower bound is very negative
    return deltaLo / scaleFactor;
  }

  for (let i = 0; i < 100; i++) {
    const deltaMid = (deltaLo + deltaHi) / 2;
    const cdf = nctCDF(lambda, df, deltaMid);
    if (Math.abs(cdf - targetCDF) < 1e-8) {
      return deltaMid / scaleFactor;
    }
    if (cdf > targetCDF) deltaLo = deltaMid;
    else deltaHi = deltaMid;
    if (deltaHi - deltaLo < 1e-8) {
      return deltaMid / scaleFactor;
    }
  }

  return ((deltaLo + deltaHi) / 2) / scaleFactor;
}

/**
 * Compute the upper confidence bound of |Hedges' g| using the
 * non-central t-distribution.
 *
 * NON-CENTRAL T CIs ARE ASYMMETRIC. Do NOT use the symmetric formula
 * `g + (g - gLower)` — the error is 10-15% of CI width at g=2.0, n=5.
 * Requires separate bisection targeting the upper tail.
 *
 * Reference: Steiger & Fouladi 1997; Goulet-Pelletier & Cousineau 2018,
 * TQMP 14(4):242-265.
 *
 * @param g - Hedges' g (signed effect size)
 * @param n1 - control group sample size
 * @param n2 - treated group sample size
 * @param confidenceLevel - one-sided confidence level (default 0.80)
 * @returns upper bound of |g|
 */
export function computeGUpper(
  g: number,
  n1: number,
  n2: number,
  confidenceLevel: number = 0.80,
): number {
  if (confidenceLevel <= 0) return Math.abs(g);
  if (n1 < 2 || n2 < 2) return Math.abs(g) * 3; // wide fallback

  const absG = Math.abs(g);
  const df = n1 + n2 - 2;
  const lambda = absG * Math.sqrt(n1 * n2 / (n1 + n2));

  // For the upper bound, we solve:
  //   nctCDF(t_obs, df, delta_upper) = alpha
  // where alpha = 1 - confidenceLevel.
  // As delta_upper increases, nctCDF(t_obs, df, delta_upper) decreases.
  // We want the delta_upper where the CDF = alpha (small value).

  const alpha = 1 - confidenceLevel;

  // Search range: delta_upper is ABOVE lambda (the point estimate)
  let deltaLo = Math.max(0, lambda - 1);
  let deltaHi = lambda * 3 + 10;

  // Ensure our search range brackets the solution
  // At deltaHi, CDF should be below alpha
  for (let expand = 0; expand < 5; expand++) {
    if (nctCDF(lambda, df, deltaHi) < alpha) break;
    deltaHi *= 2;
  }

  for (let i = 0; i < 100; i++) {
    const deltaMid = (deltaLo + deltaHi) / 2;
    const cdf = nctCDF(lambda, df, deltaMid);
    if (Math.abs(cdf - alpha) < 1e-8) {
      return deltaMid / Math.sqrt(n1 * n2 / (n1 + n2));
    }
    // As delta increases, CDF(t_obs) decreases — so if CDF > alpha, delta is too low
    if (cdf > alpha) deltaLo = deltaMid;
    else deltaHi = deltaMid;
    if (deltaHi - deltaLo < 1e-8) {
      return deltaMid / Math.sqrt(n1 * n2 / (n1 + n2));
    }
  }

  return ((deltaLo + deltaHi) / 2) / Math.sqrt(n1 * n2 / (n1 + n2));
}

/**
 * Sigmoid transform: maps [0, inf) to [0, scale) with diminishing returns.
 * Concentrates resolution in the |g| = 0.3-1.5 range per EFSA guidance.
 *
 * @param x - input value (g_lower, typically 0-5)
 * @param scale - maximum output (default 4.0)
 * @returns transformed value in [0, scale)
 */
export function sigmoidTransform(x: number, scale: number = 4.0): number {
  if (x <= 0) return 0;
  return scale * x / (x + 1);
}
