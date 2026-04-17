"""Monte Carlo calibration for LOO (Leave-One-Out) stability ratios.

Simulates bidirectional LOO at preclinical sample sizes to determine:
1. Distribution of stability ratios under null and real effects
2. False positive rates at various thresholds
3. Treated-side vs control-side asymmetry
4. Sensitivity under outlier contamination
5. Recommended per-sample-size thresholds

Uses production-identical statistical functions (Hedges' g + non-central t CI).

SEQUENTIAL execution to avoid Windows multiprocessing zombie issues.
Adaptive iteration counts by sample size to keep total runtime under 10 min.
"""

import os
import sys
import math

# MUST set before numpy import to avoid OPENBLAS hang on Windows
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import time
from datetime import datetime

# Add backend to path so we can import production functions
sys.path.insert(0, "C:/pg/pcc/backend")

import numpy as np
from scipy import stats as sp_stats

# -- Configuration -----------------------------------------------------------

SAMPLE_SIZES = [3, 4, 5, 10, 15, 20]
EFFECT_SIZES = [0.0, 0.5, 1.0, 2.0]
# Adaptive iterations: cheap N gets more, expensive N gets fewer
# Runtime budget: ~10ms/iter at N=3, ~60ms at N=20
ITER_BY_N = {3: 5000, 4: 4000, 5: 3000, 10: 1500, 15: 1000, 20: 1000}
CONFIDENCE_LEVEL = 0.80
SEED = 42
CONTAMINATION_EFFECT = 1.0


# -- Inlined fast versions ---------------------------------------------------

def fast_hedges_g(a1, a2):
    """Hedges' g -- clean float arrays, len >= 2, no NaN."""
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
    """Lower CI bound of |g| via bisection on non-central t CDF.

    Uses 40 bisection iterations (1e-5 precision -- sufficient for ratios).
    """
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


# -- Core LOO computation ---------------------------------------------------

def loo_treated_side(control, treated, g_lower_full):
    n2 = len(treated)
    if n2 <= 2:
        return 0.0
    n1 = len(control)
    min_gl = float("inf")
    for i in range(n2):
        loo = np.delete(treated, i)
        g = fast_hedges_g(loo, control)
        gl = fast_g_lower(g, n1, n2 - 1, CONFIDENCE_LEVEL)
        if gl <= 0:
            return 0.0
        if gl < min_gl:
            min_gl = gl
    return min_gl / g_lower_full if min_gl < float("inf") else 1.0


def loo_control_side(control, treated, g_lower_full):
    n1 = len(control)
    if n1 <= 2:
        return 0.0
    n2 = len(treated)
    min_gl = float("inf")
    for j in range(n1):
        loo = np.delete(control, j)
        g = fast_hedges_g(treated, loo)
        gl = fast_g_lower(g, n1 - 1, n2, CONFIDENCE_LEVEL)
        if gl <= 0:
            return 0.0
        if gl < min_gl:
            min_gl = gl
    return min_gl / g_lower_full if min_gl < float("inf") else 1.0


# -- Summary helpers ---------------------------------------------------------

def summarize(ratios):
    if not ratios:
        return None
    a = np.array(ratios)
    return {
        "median": float(np.median(a)),
        "p5": float(np.percentile(a, 5)),
        "p10": float(np.percentile(a, 10)),
        "p25": float(np.percentile(a, 25)),
        "p75": float(np.percentile(a, 75)),
        "p90": float(np.percentile(a, 90)),
        "p95": float(np.percentile(a, 95)),
        "pct_below_0.8": float(100.0 * np.mean(a < 0.8)),
        "pct_below_0.5": float(100.0 * np.mean(a < 0.5)),
    }


# -- Run one condition -------------------------------------------------------

def run_condition(n, effect, contamination, n_iter, rng):
    treated_ratios = []
    control_ratios = []
    bidir_ratios = []
    signal_count = 0

    for _ in range(n_iter):
        control = rng.normal(0, 1, size=n)
        treated = rng.normal(effect, 1, size=n)

        if contamination == "control_outlier" and n >= 2:
            control[0] = rng.normal(3, 1)
        elif contamination == "treated_outlier" and n >= 2:
            treated[0] = rng.normal(effect + 3, 1)

        g = fast_hedges_g(treated, control)
        gl = fast_g_lower(g, n, n, CONFIDENCE_LEVEL)

        if gl <= 0:
            continue

        signal_count += 1
        t_r = loo_treated_side(control, treated, gl)
        c_r = loo_control_side(control, treated, gl)
        b_r = min(t_r, c_r)

        treated_ratios.append(t_r)
        control_ratios.append(c_r)
        bidir_ratios.append(b_r)

    pct_signal = 100.0 * signal_count / n_iter if n_iter > 0 else 0

    fpr10 = None
    if effect == 0.0 and contamination == "clean" and bidir_ratios:
        fpr10 = float(np.percentile(np.array(bidir_ratios), 10))

    return {
        "n": n,
        "effect": effect,
        "contamination": contamination,
        "n_iter": n_iter,
        "n_signal": signal_count,
        "pct_signal": round(pct_signal, 1),
        "treated": summarize(treated_ratios),
        "control": summarize(control_ratios),
        "bidir": summarize(bidir_ratios),
        "fpr10_threshold": round(fpr10, 4) if fpr10 is not None else None,
        "raw_bidir": bidir_ratios,
    }


# -- Output formatting -------------------------------------------------------

def fmt_val(s, field):
    if s is None:
        return "  n/a"
    v = s[field]
    if field.startswith("pct"):
        return f"{v:5.1f}"
    return f"{v:6.3f}"


def format_console(results):
    lines = []
    lines.append("")
    lines.append("=" * 130)
    lines.append("LOO STABILITY CALIBRATION -- MONTE CARLO RESULTS")
    lines.append(f"  Adaptive iterations by N: {ITER_BY_N}")
    lines.append(f"  Confidence level: {CONFIDENCE_LEVEL}")
    lines.append(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("=" * 130)

    lines.append("")
    lines.append("--- CLEAN DATA ---")
    lines.append("")
    lines.append(f"{'':>3s} {'':>4s} {'':>5s} | {'':>5s} | "
                 f"{'--- TREATED ---':^37s} | "
                 f"{'--- CONTROL ---':^37s} | "
                 f"{'--- BIDIRECTIONAL ---':^37s}")
    hdr = (
        f"{'N':>3s} {'g':>4s} {'iter':>5s} | {'%sig':>5s} | "
        f"{'med':>6s} {'p5':>6s} {'p25':>6s} {'p75':>6s} {'p95':>6s} "
        f"{'<.8':>5s} {'<.5':>5s} | "
        f"{'med':>6s} {'p5':>6s} {'p25':>6s} {'p75':>6s} {'p95':>6s} "
        f"{'<.8':>5s} {'<.5':>5s} | "
        f"{'med':>6s} {'p5':>6s} {'p25':>6s} {'p75':>6s} {'p95':>6s} "
        f"{'<.8':>5s} {'<.5':>5s}"
    )
    lines.append(hdr)
    lines.append("-" * 130)

    for effect in EFFECT_SIZES:
        for n in SAMPLE_SIZES:
            key = (n, effect, "clean")
            r = results.get(key)
            if not r:
                continue
            line = (
                f"{n:3d} {effect:4.1f} {r['n_iter']:5d} | {r['pct_signal']:5.1f} | "
                f"{fmt_val(r['treated'], 'median')} "
                f"{fmt_val(r['treated'], 'p5')} "
                f"{fmt_val(r['treated'], 'p25')} "
                f"{fmt_val(r['treated'], 'p75')} "
                f"{fmt_val(r['treated'], 'p95')} "
                f"{fmt_val(r['treated'], 'pct_below_0.8')} "
                f"{fmt_val(r['treated'], 'pct_below_0.5')} | "
                f"{fmt_val(r['control'], 'median')} "
                f"{fmt_val(r['control'], 'p5')} "
                f"{fmt_val(r['control'], 'p25')} "
                f"{fmt_val(r['control'], 'p75')} "
                f"{fmt_val(r['control'], 'p95')} "
                f"{fmt_val(r['control'], 'pct_below_0.8')} "
                f"{fmt_val(r['control'], 'pct_below_0.5')} | "
                f"{fmt_val(r['bidir'], 'median')} "
                f"{fmt_val(r['bidir'], 'p5')} "
                f"{fmt_val(r['bidir'], 'p25')} "
                f"{fmt_val(r['bidir'], 'p75')} "
                f"{fmt_val(r['bidir'], 'p95')} "
                f"{fmt_val(r['bidir'], 'pct_below_0.8')} "
                f"{fmt_val(r['bidir'], 'pct_below_0.5')}"
            )
            lines.append(line)
        lines.append("")

    lines.append("--- CONTAMINATION (g=1.0) ---")
    lines.append("")
    for contam in ["clean", "control_outlier", "treated_outlier"]:
        for n in SAMPLE_SIZES:
            key = (n, 1.0, contam)
            r = results.get(key)
            if not r:
                continue
            line = (
                f"{n:3d} {contam:>17s} {r['n_iter']:5d} | {r['pct_signal']:5.1f} | "
                f"{fmt_val(r['treated'], 'median')} "
                f"{fmt_val(r['treated'], 'p5')} "
                f"{fmt_val(r['treated'], 'p25')} "
                f"{fmt_val(r['treated'], 'p75')} "
                f"{fmt_val(r['treated'], 'p95')} "
                f"{fmt_val(r['treated'], 'pct_below_0.8')} "
                f"{fmt_val(r['treated'], 'pct_below_0.5')} | "
                f"{fmt_val(r['control'], 'median')} "
                f"{fmt_val(r['control'], 'p5')} "
                f"{fmt_val(r['control'], 'p25')} "
                f"{fmt_val(r['control'], 'p75')} "
                f"{fmt_val(r['control'], 'p95')} "
                f"{fmt_val(r['control'], 'pct_below_0.8')} "
                f"{fmt_val(r['control'], 'pct_below_0.5')} | "
                f"{fmt_val(r['bidir'], 'median')} "
                f"{fmt_val(r['bidir'], 'p5')} "
                f"{fmt_val(r['bidir'], 'p25')} "
                f"{fmt_val(r['bidir'], 'p75')} "
                f"{fmt_val(r['bidir'], 'p95')} "
                f"{fmt_val(r['bidir'], 'pct_below_0.8')} "
                f"{fmt_val(r['bidir'], 'pct_below_0.5')}"
            )
            lines.append(line)
        lines.append("")

    return "\n".join(lines)


def format_markdown(results):
    lines = []
    lines.append("# LOO Stability Calibration -- Monte Carlo Results")
    lines.append("")
    lines.append(f"- **Iterations per N:** `{ITER_BY_N}`")
    lines.append(f"- **Confidence level:** {CONFIDENCE_LEVEL}")
    lines.append(f"- **Date:** {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"- **Seed:** {SEED}")
    lines.append(f"- **Sample sizes:** {SAMPLE_SIZES}")
    lines.append(f"- **True effect sizes (g):** {EFFECT_SIZES}")
    lines.append("")

    lines.append("## Method")
    lines.append("")
    lines.append("For each (N, g, contamination) condition:")
    lines.append("")
    lines.append("1. Draw control ~ N(0, 1), treated ~ N(g, 1)")
    lines.append("2. Compute Hedges' g (small-sample corrected) and "
                  "gLower (80% CI lower bound via non-central t)")
    lines.append("3. Skip if gLower <= 0 (no detectable signal)")
    lines.append("4. **Treated-side LOO:** remove each treated animal, "
                  "recompute, record min(LOO-gLower)/gLower_full")
    lines.append("5. **Control-side LOO:** remove each control animal, "
                  "recompute, record min(LOO-gLower)/gLower_full")
    lines.append("6. **Bidirectional:** min(treated-side, control-side)")
    lines.append("")
    lines.append("Contamination conditions (g=1.0 only):")
    lines.append("- **Control outlier:** One control from N(3, 1)")
    lines.append("- **Treated outlier:** One treated from N(g+3, 1)")
    lines.append("")

    # Clean data
    lines.append("## Clean Data")
    lines.append("")
    for side_label, side_key in [("Treated-Side LOO", "treated"),
                                  ("Control-Side LOO", "control"),
                                  ("Bidirectional LOO", "bidir")]:
        lines.append(f"### {side_label}")
        lines.append("")
        lines.append("| N | g | iters | %signal | median | p5 | p10 | p25 "
                     "| p75 | p95 | %<0.8 | %<0.5 |")
        lines.append("|--:|--:|------:|--------:|-------:|---:|----:|----:"
                     "|----:|----:|------:|------:|")
        for effect in EFFECT_SIZES:
            for n in SAMPLE_SIZES:
                key = (n, effect, "clean")
                r = results.get(key)
                if not r:
                    continue
                s = r[side_key]
                if s is None:
                    lines.append(
                        f"| {n} | {effect:.1f} | {r['n_iter']} "
                        f"| {r['pct_signal']:.1f} "
                        f"| -- | -- | -- | -- | -- | -- | -- | -- |")
                else:
                    lines.append(
                        f"| {n} | {effect:.1f} | {r['n_iter']} "
                        f"| {r['pct_signal']:.1f} "
                        f"| {s['median']:.3f} | {s['p5']:.3f} "
                        f"| {s['p10']:.3f} | {s['p25']:.3f} "
                        f"| {s['p75']:.3f} | {s['p95']:.3f} "
                        f"| {s['pct_below_0.8']:.1f} "
                        f"| {s['pct_below_0.5']:.1f} |")
        lines.append("")

    # Contamination
    lines.append("## Contamination (g=1.0)")
    lines.append("")
    for contam in ["control_outlier", "treated_outlier"]:
        label = {"control_outlier": "Control Outlier (one from N(3,1))",
                 "treated_outlier": "Treated Outlier (one from N(g+3,1))"}[contam]
        lines.append(f"### {label}")
        lines.append("")
        for side_label, side_key in [("Treated-Side", "treated"),
                                      ("Control-Side", "control"),
                                      ("Bidirectional", "bidir")]:
            lines.append(f"#### {side_label}")
            lines.append("")
            lines.append("| N | iters | %signal | median | p5 | p25 | p75 "
                         "| p95 | %<0.8 | %<0.5 |")
            lines.append("|--:|------:|--------:|-------:|---:|----:|----:"
                         "|----:|------:|------:|")
            for n in SAMPLE_SIZES:
                key = (n, 1.0, contam)
                r = results.get(key)
                if not r:
                    continue
                s = r[side_key]
                if s is None:
                    lines.append(f"| {n} | {r['n_iter']} "
                                 f"| {r['pct_signal']:.1f} "
                                 f"| -- | -- | -- | -- | -- | -- | -- |")
                else:
                    lines.append(
                        f"| {n} | {r['n_iter']} "
                        f"| {r['pct_signal']:.1f} "
                        f"| {s['median']:.3f} | {s['p5']:.3f} "
                        f"| {s['p25']:.3f} | {s['p75']:.3f} "
                        f"| {s['p95']:.3f} "
                        f"| {s['pct_below_0.8']:.1f} "
                        f"| {s['pct_below_0.5']:.1f} |")
            lines.append("")

    # Analysis
    lines.append("## Analysis")
    lines.append("")

    # Q1
    lines.append("### Q1: Null-effect flagging rates at small N")
    lines.append("")
    lines.append("At g=0 (null), what fraction with detectable signal "
                 "show LOO < 0.8?")
    lines.append("")
    lines.append("| N | iters | %signal | treated <0.8 | control <0.8 "
                 "| bidir <0.8 | bidir <0.5 |")
    lines.append("|--:|------:|--------:|-------------:|-------------:"
                 "|-----------:|-----------:|")
    for n in SAMPLE_SIZES:
        r = results.get((n, 0.0, "clean"))
        if not r:
            continue

        def sp(s, f):
            return f"{s[f]:.1f}" if s else "--"

        lines.append(
            f"| {n} | {r['n_iter']} | {r['pct_signal']:.1f} "
            f"| {sp(r['treated'], 'pct_below_0.8')} "
            f"| {sp(r['control'], 'pct_below_0.8')} "
            f"| {sp(r['bidir'], 'pct_below_0.8')} "
            f"| {sp(r['bidir'], 'pct_below_0.5')} |")
    lines.append("")

    # Q2
    lines.append("### Q2: Threshold for ~10% FPR under null")
    lines.append("")
    lines.append("p10 of bidirectional LOO at g=0 (clean). "
                 "Threshold rounded down to nearest 0.05.")
    lines.append("")
    lines.append("| N | p10 (bidir) | p5 (bidir) "
                 "| recommended threshold |")
    lines.append("|--:|------------:|-----------:"
                 "|---------------------:|")
    for n in SAMPLE_SIZES:
        r = results.get((n, 0.0, "clean"))
        if not r or r["fpr10_threshold"] is None:
            lines.append(f"| {n} | -- | -- | -- |")
            continue
        p10 = r["fpr10_threshold"]
        p5 = r["bidir"]["p5"] if r["bidir"] else None
        thr = max(0.0, math.floor(p10 * 20) / 20)
        p5_str = f"{p5:.3f}" if p5 is not None else "--"
        lines.append(
            f"| {n} | {p10:.3f} "
            f"| {p5_str} "
            f"| {thr:.2f} |")
    lines.append("")

    # Q3
    lines.append("### Q3: Treated vs control asymmetry")
    lines.append("")
    lines.append("| N | g | treated med | control med | delta "
                 "| more fragile |")
    lines.append("|--:|--:|-----------:|-----------:|------:"
                 "|-------------:|")
    for effect in [0.5, 1.0, 2.0]:
        for n in SAMPLE_SIZES:
            r = results.get((n, effect, "clean"))
            if not r:
                continue
            tm = r["treated"]["median"] if r["treated"] else None
            cm = r["control"]["median"] if r["control"] else None
            if tm is not None and cm is not None:
                d = tm - cm
                frag = ("treated" if tm < cm
                        else "control" if cm < tm else "equal")
                lines.append(
                    f"| {n} | {effect:.1f} | {tm:.3f} | {cm:.3f} "
                    f"| {d:+.3f} | {frag} |")
            else:
                lines.append(
                    f"| {n} | {effect:.1f} | -- | -- | -- | -- |")
    lines.append("")

    # Q4
    lines.append("### Q4: Contamination detection (g=1.0)")
    lines.append("")
    lines.append("| N | condition | treated <0.8 | control <0.8 "
                 "| bidir <0.8 | bidir <0.5 |")
    lines.append("|--:|:----------|-------------:|-------------:"
                 "|-----------:|-----------:|")
    for n in SAMPLE_SIZES:
        for contam in ["clean", "control_outlier", "treated_outlier"]:
            r = results.get((n, 1.0, contam))
            if not r:
                continue

            def sp(s, f):
                return f"{s[f]:.1f}" if s else "--"

            lines.append(
                f"| {n} | {contam} "
                f"| {sp(r['treated'], 'pct_below_0.8')} "
                f"| {sp(r['control'], 'pct_below_0.8')} "
                f"| {sp(r['bidir'], 'pct_below_0.8')} "
                f"| {sp(r['bidir'], 'pct_below_0.5')} |")
    lines.append("")

    # Q5
    lines.append("### Q5: Recommended thresholds")
    lines.append("")
    lines.append("p10-based threshold; then % of true effects/contamination "
                 "flagged at that threshold.")
    lines.append("")
    lines.append("| N | threshold | g=0.5 flagged | g=1.0 flagged "
                 "| g=2.0 flagged | ctrl-outlier | trt-outlier |")
    lines.append("|--:|----------:|--------------:|--------------:"
                 "|--------------:|-------------:|------------:|")
    for n in SAMPLE_SIZES:
        nr = results.get((n, 0.0, "clean"))
        if not nr or nr["fpr10_threshold"] is None:
            lines.append(f"| {n} | -- | -- | -- | -- | -- | -- |")
            continue
        thr = max(0.0, math.floor(nr["fpr10_threshold"] * 20) / 20)
        parts = [f"| {n} | {thr:.2f}"]
        for eff in [0.5, 1.0, 2.0]:
            raw = results.get((n, eff, "clean"), {}).get("raw_bidir", [])
            if raw:
                pct = float(100.0 * np.mean(np.array(raw) < thr))
                parts.append(f" {pct:.1f}%")
            else:
                parts.append(" --")
        for c in ["control_outlier", "treated_outlier"]:
            raw = results.get((n, 1.0, c), {}).get("raw_bidir", [])
            if raw:
                pct = float(100.0 * np.mean(np.array(raw) < thr))
                parts.append(f" {pct:.1f}%")
            else:
                parts.append(" --")
        lines.append(" |".join(parts) + " |")
    lines.append("")

    # Key findings
    lines.append("## Key Findings")
    lines.append("")
    for n in [3, 4, 5]:
        r = results.get((n, 0.0, "clean"))
        if r and r["bidir"]:
            pct = r["bidir"]["pct_below_0.8"]
            v = ("useless" if pct > 50
                 else "marginal" if pct > 30 else "ok")
            lines.append(
                f"- **N={n}, g=0, bidir <0.8:** {pct:.1f}% ({v})")
    lines.append("")
    for n in [3, 5, 10, 20]:
        r = results.get((n, 1.0, "clean"))
        if r and r["treated"] and r["control"]:
            lines.append(
                f"- **N={n}, g=1.0:** treated med="
                f"{r['treated']['median']:.3f}, "
                f"control med={r['control']['median']:.3f} "
                f"(delta="
                f"{r['treated']['median']-r['control']['median']:+.3f})")
    lines.append("")
    for n in [5, 10]:
        cl = results.get((n, 1.0, "clean"))
        co = results.get((n, 1.0, "control_outlier"))
        to = results.get((n, 1.0, "treated_outlier"))
        if (cl and cl["bidir"] and co and co["bidir"]
                and to and to["bidir"]):
            lines.append(
                f"- **N={n} contamination (bidir <0.8):** "
                f"clean={cl['bidir']['pct_below_0.8']:.1f}%, "
                f"ctrl-out={co['bidir']['pct_below_0.8']:.1f}%, "
                f"trt-out={to['bidir']['pct_below_0.8']:.1f}%")
    lines.append("")

    return "\n".join(lines)


# -- Validation ---------------------------------------------------------------

def validate_inlined():
    from services.analysis.statistics import (
        compute_effect_size as prod_es,
        compute_g_lower as prod_gl,
    )
    rng = np.random.default_rng(99)
    for _ in range(30):
        n = int(rng.integers(3, 20))
        ctrl = rng.normal(0, 1, size=n)
        trt = rng.normal(1, 1, size=n)
        assert abs(prod_es(trt, ctrl) - fast_hedges_g(trt, ctrl)) < 1e-10
        pg = prod_gl(prod_es(trt, ctrl), n, n, 0.80)
        fg = fast_g_lower(fast_hedges_g(trt, ctrl), n, n, 0.80)
        if pg is not None and pg > 0:
            assert abs(pg - fg) < 1e-3, f"gLower mismatch: {pg} vs {fg}"
    print("  Validation: inlined functions match production.", flush=True)


# -- Main ---------------------------------------------------------------------

if __name__ == "__main__":
    print("LOO Stability Calibration -- Monte Carlo Simulation", flush=True)

    # Build conditions: clean x all effects, contamination x g=1.0 only
    conditions = []
    for effect in EFFECT_SIZES:
        for n in SAMPLE_SIZES:
            conditions.append((n, effect, "clean"))
    for contam in ["control_outlier", "treated_outlier"]:
        for n in SAMPLE_SIZES:
            conditions.append((n, CONTAMINATION_EFFECT, contam))

    total_iters = sum(ITER_BY_N[c[0]] for c in conditions)
    print(f"  {len(conditions)} conditions, {total_iters:,} total iterations",
          flush=True)
    print(f"  Adaptive iterations: {ITER_BY_N}", flush=True)
    print("", flush=True)

    validate_inlined()
    print("", flush=True)

    results = {}
    rng = np.random.default_rng(SEED)
    start = time.time()

    for idx, (n, effect, contamination) in enumerate(conditions):
        n_iter = ITER_BY_N[n]
        cond_start = time.time()
        r = run_condition(n, effect, contamination, n_iter, rng)
        cond_elapsed = time.time() - cond_start
        key = (n, effect, contamination)
        results[key] = r

        elapsed = time.time() - start
        eta = (elapsed / (idx + 1)) * (len(conditions) - idx - 1)
        print(
            f"  [{idx+1}/{len(conditions)}] "
            f"N={n:2d} g={effect:.1f} {contamination:17s} "
            f"iters={n_iter:5d} "
            f"-- signal={r['pct_signal']:5.1f}% "
            f"({cond_elapsed:.0f}s, total {elapsed:.0f}s, ~{eta:.0f}s left)",
            flush=True)

    total_elapsed = time.time() - start
    print(f"\nDone in {total_elapsed:.1f}s ({total_elapsed/60:.1f}min)",
          flush=True)

    # Console
    print(format_console(results))

    # Markdown
    md = format_markdown(results)
    outpath = "C:/pg/pcc/backend/simulations/loo_calibration_results.md"
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"\nFull results: {outpath}", flush=True)
