"""Quick Monte Carlo: what fraction of null comparisons have gLower > threshold?

Answers the core question: is the 0.3 gLower gate permissive under null?

Key insight being tested: gLower is computed on |g| (absolute value).
Under null (true g=0), |g| follows a folded-t-like distribution centered
above zero. The 80% CI lower bound on |g| will be > 0 most of the time
because we're computing a one-sided CI on a non-negative quantity.

But the 0.3 gate requires the *lower bound* to be > 0.3, which is much
more stringent. This script measures the actual false positive rate.
"""
import os
import sys
import math

os.environ["OPENBLAS_NUM_THREADS"] = "1"

import numpy as np
from scipy import stats as sp_stats

sys.path.insert(0, "C:/pg/pcc/backend")

SAMPLE_SIZES = [3, 4, 5, 8, 10, 15, 20]
THRESHOLDS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.8, 1.0]
N_ITER = 20000
SEED = 42


def fast_hedges_g(a1, a2):
    n1, n2 = len(a1), len(a2)
    pooled_std = math.sqrt(
        ((n1 - 1) * float(np.var(a1, ddof=1))
         + (n2 - 1) * float(np.var(a2, ddof=1)))
        / (n1 + n2 - 2)
    )
    if pooled_std == 0:
        return 0.0
    d = (float(np.mean(a1)) - float(np.mean(a2))) / pooled_std
    df = n1 + n2 - 2
    j = 1 - 3 / (4 * df - 1)
    return d * j


def fast_g_lower(g, n1, n2, cl=0.80):
    abs_g = abs(g)
    df = n1 + n2 - 2
    scale = math.sqrt(n1 * n2 / (n1 + n2))
    lam = abs_g * scale
    if lam < 0.01:
        return 0.0
    target = cl
    lo, hi = 0.0, lam * 2 + 5
    for _ in range(40):
        mid = (lo + hi) / 2
        cdf = float(sp_stats.nct.cdf(lam, df, mid))
        if abs(cdf - target) < 1e-5:
            return max(0.0, mid / scale)
        if cdf > target:
            lo = mid
        else:
            hi = mid
        if hi - lo < 1e-5:
            return max(0.0, mid / scale)
    return max(0.0, (lo + hi) / 2 / scale)


def run():
    rng = np.random.default_rng(SEED)

    print("gLower NULL DISTRIBUTION -- Monte Carlo", flush=True)
    print(f"  {N_ITER} iterations per sample size, seed={SEED}", flush=True)
    print(f"  Both groups drawn from N(0,1) -- true effect = 0", flush=True)
    print("", flush=True)

    # Header
    hdr = f"{'N':>4s} | {'med|g|':>7s} {'med_gL':>7s}"
    for t in THRESHOLDS:
        hdr += f" | gL>{t:.1f}"
    print(hdr, flush=True)
    print("-" * len(hdr), flush=True)

    results = []

    for n in SAMPLE_SIZES:
        g_vals = []
        gl_vals = []
        for _ in range(N_ITER):
            ctrl = rng.normal(0, 1, size=n)
            trt = rng.normal(0, 1, size=n)
            g = fast_hedges_g(trt, ctrl)
            gl = fast_g_lower(g, n, n)
            g_vals.append(abs(g))
            gl_vals.append(gl)

        g_arr = np.array(g_vals)
        gl_arr = np.array(gl_vals)

        row = {
            "n": n,
            "med_abs_g": float(np.median(g_arr)),
            "med_gl": float(np.median(gl_arr)),
            "thresholds": {},
        }

        line = f"{n:4d} | {float(np.median(g_arr)):7.3f} {float(np.median(gl_arr)):7.3f}"
        for t in THRESHOLDS:
            pct = float(100.0 * np.mean(gl_arr > t))
            row["thresholds"][t] = pct
            line += f" | {pct:5.1f}%"
        print(line, flush=True)
        results.append(row)

    print("", flush=True)

    # Also show percentiles of gLower under null
    print("gLower PERCENTILES UNDER NULL:", flush=True)
    hdr2 = f"{'N':>4s} | {'p5':>6s} {'p10':>6s} {'p25':>6s} {'p50':>6s} {'p75':>6s} {'p90':>6s} {'p95':>6s} {'p99':>6s}"
    print(hdr2, flush=True)
    print("-" * len(hdr2), flush=True)
    for n in SAMPLE_SIZES:
        gl_vals = []
        rng2 = np.random.default_rng(SEED)
        for _ in range(N_ITER):
            ctrl = rng2.normal(0, 1, size=n)
            trt = rng2.normal(0, 1, size=n)
            g = fast_hedges_g(trt, ctrl)
            gl = fast_g_lower(g, n, n)
            gl_vals.append(gl)
        gl_arr = np.array(gl_vals)
        pcts = [5, 10, 25, 50, 75, 90, 95, 99]
        vals = [float(np.percentile(gl_arr, p)) for p in pcts]
        line = f"{n:4d} |"
        for v in vals:
            line += f" {v:6.3f}"
        print(line, flush=True)

    print("", flush=True)

    # Joint check: what fraction pass BOTH gLower > 0.3 AND p < 0.05?
    print("JOINT GATE: gLower > 0.3 AND p < 0.05 (Welch's t):", flush=True)
    print(f"{'N':>4s} | {'gL>0.3':>7s} {'p<0.05':>7s} {'both':>7s}", flush=True)
    print("-" * 40, flush=True)
    rng3 = np.random.default_rng(SEED)
    for n in SAMPLE_SIZES:
        gl_pass = 0
        p_pass = 0
        both_pass = 0
        for _ in range(N_ITER):
            ctrl = rng3.normal(0, 1, size=n)
            trt = rng3.normal(0, 1, size=n)
            g = fast_hedges_g(trt, ctrl)
            gl = fast_g_lower(g, n, n)
            _, p = sp_stats.ttest_ind(trt, ctrl, equal_var=False)
            gl_ok = gl > 0.3
            p_ok = p < 0.05
            if gl_ok:
                gl_pass += 1
            if p_ok:
                p_pass += 1
            if gl_ok and p_ok:
                both_pass += 1
        print(f"{n:4d} | {100*gl_pass/N_ITER:6.1f}% {100*p_pass/N_ITER:6.1f}% {100*both_pass/N_ITER:6.1f}%", flush=True)


if __name__ == "__main__":
    run()
