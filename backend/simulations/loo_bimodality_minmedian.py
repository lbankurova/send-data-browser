"""Focused LOO bimodality comparison: min(t,c) vs median(t,c) summaries.

Companion simulation to loo_calibration.py. Addresses the duplicate-GAP-202
follow-up from the LOO calibration R2 review:

  > GAP-187 now resolved (min -> median). Simulation re-run with median
  > summary needed to verify whether bimodality dissolves.

GAP-187 (commit 573f3031) replaced min(per-animal LOO ratios) with median in
the production scoring path (statistics.py). The original Monte Carlo
simulation still uses min(t,c) as the bidirectional summary; this script
runs a focused N=3 null-effect, clean-condition test (5000 iterations) that
emits BOTH summaries side-by-side, computes the bimodality coefficient
(Sarle's b = (g^2 + 1) / kurtosis), and prints the histogram bins.

If b > 5/9 = 0.555 the distribution is considered bimodal (Pfister et al.
2013). The R2 reviewer's claim was that ~50% of null iterations cluster at
the upper bimodal mode (~1.0), with sparse density in 0.2-0.8 — this script
verifies whether the median summary smooths that.

Output: stdout + backend/simulations/loo_bimodality_minmedian.md.

Runtime: ~30-60 seconds at N=3, 5000 iterations, single-threaded.
"""

from __future__ import annotations

import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from simulations.loo_calibration import (
    fast_hedges_g, fast_g_lower, loo_treated_side, loo_control_side,
    CONFIDENCE_LEVEL,
)


def bimodality_coefficient(arr: np.ndarray) -> float:
    """Sarle's bimodality coefficient. b > 5/9 = 0.555 indicates bimodality."""
    n = arr.size
    if n < 4:
        return float("nan")
    m = arr.mean()
    s = arr.std(ddof=1)
    if s == 0:
        return float("nan")
    z = (arr - m) / s
    g1 = float(np.mean(z ** 3))
    g2 = float(np.mean(z ** 4) - 3.0)
    denom = g2 + 3.0 * (n - 1) ** 2 / ((n - 2) * (n - 3))
    if denom <= 0:
        return float("nan")
    return (g1 ** 2 + 1.0) / denom


def histogram_str(arr: np.ndarray, bins: int = 10, lo: float = 0.0, hi: float = 1.05) -> str:
    edges = np.linspace(lo, hi, bins + 1)
    counts, _ = np.histogram(arr, bins=edges)
    n = arr.size
    out = []
    max_count = int(counts.max()) if counts.size else 1
    bar_width = 30
    for i in range(bins):
        pct = 100.0 * counts[i] / n if n else 0.0
        bar = "#" * int(round(bar_width * counts[i] / max_count)) if max_count else ""
        out.append(f"  [{edges[i]:.2f}, {edges[i+1]:.2f})  {counts[i]:5d}  {pct:5.1f}%  {bar}")
    return "\n".join(out)


def run(n: int = 3, n_iter: int = 5000, seed: int = 42) -> dict:
    rng = np.random.default_rng(seed)
    min_ratios: list[float] = []
    median_ratios: list[float] = []
    signal_count = 0

    for _ in range(n_iter):
        control = rng.normal(0, 1, size=n)
        treated = rng.normal(0, 1, size=n)  # null effect
        g = fast_hedges_g(treated, control)
        gl = fast_g_lower(g, n, n, CONFIDENCE_LEVEL)
        if gl <= 0:
            continue
        signal_count += 1
        t_r = loo_treated_side(control, treated, gl)
        c_r = loo_control_side(control, treated, gl)
        min_ratios.append(min(t_r, c_r))
        median_ratios.append(float(np.median([t_r, c_r])))

    min_arr = np.array(min_ratios)
    med_arr = np.array(median_ratios)

    return {
        "n": n,
        "n_iter": n_iter,
        "seed": seed,
        "signal_count": signal_count,
        "pct_signal": 100.0 * signal_count / n_iter,
        "min_summary": {
            "mean": float(min_arr.mean()),
            "median": float(np.median(min_arr)),
            "std": float(min_arr.std(ddof=1)),
            "p5": float(np.percentile(min_arr, 5)),
            "p25": float(np.percentile(min_arr, 25)),
            "p75": float(np.percentile(min_arr, 75)),
            "p95": float(np.percentile(min_arr, 95)),
            "bimodality_coef": bimodality_coefficient(min_arr),
            "histogram": histogram_str(min_arr),
            "frac_below_0.2": float((min_arr < 0.2).mean()),
            "frac_above_0.8": float((min_arr > 0.8).mean()),
            "frac_in_middle_0.2_0.8": float(((min_arr >= 0.2) & (min_arr <= 0.8)).mean()),
        },
        "median_summary": {
            "mean": float(med_arr.mean()),
            "median": float(np.median(med_arr)),
            "std": float(med_arr.std(ddof=1)),
            "p5": float(np.percentile(med_arr, 5)),
            "p25": float(np.percentile(med_arr, 25)),
            "p75": float(np.percentile(med_arr, 75)),
            "p95": float(np.percentile(med_arr, 95)),
            "bimodality_coef": bimodality_coefficient(med_arr),
            "histogram": histogram_str(med_arr),
            "frac_below_0.2": float((med_arr < 0.2).mean()),
            "frac_above_0.8": float((med_arr > 0.8).mean()),
            "frac_in_middle_0.2_0.8": float(((med_arr >= 0.2) & (med_arr <= 0.8)).mean()),
        },
    }


def write_results_md(result: dict, out_path: Path) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    BIMODAL_THRESHOLD = 5.0 / 9.0
    min_b = result["min_summary"]["bimodality_coef"]
    med_b = result["median_summary"]["bimodality_coef"]
    min_label = "BIMODAL" if min_b > BIMODAL_THRESHOLD else "unimodal"
    med_label = "BIMODAL" if med_b > BIMODAL_THRESHOLD else "unimodal"

    lines = [
        "# LOO bimodality: min(t,c) vs median(t,c) summary comparison",
        "",
        f"**Generated:** {ts}",
        f"**Source:** `backend/simulations/loo_bimodality_minmedian.py`",
        f"**Seed:** {result['seed']}  N={result['n']}  iterations={result['n_iter']:,}",
        f"**Signal count (gLower>0):** {result['signal_count']:,} of {result['n_iter']:,} = {result['pct_signal']:.1f}%",
        "",
        "## Summary",
        "",
        "| Metric | min(t,c) | median(t,c) |",
        "|---|---:|---:|",
        f"| Mean | {result['min_summary']['mean']:.3f} | {result['median_summary']['mean']:.3f} |",
        f"| Median | {result['min_summary']['median']:.3f} | {result['median_summary']['median']:.3f} |",
        f"| SD | {result['min_summary']['std']:.3f} | {result['median_summary']['std']:.3f} |",
        f"| P5 | {result['min_summary']['p5']:.3f} | {result['median_summary']['p5']:.3f} |",
        f"| P25 | {result['min_summary']['p25']:.3f} | {result['median_summary']['p25']:.3f} |",
        f"| P75 | {result['min_summary']['p75']:.3f} | {result['median_summary']['p75']:.3f} |",
        f"| P95 | {result['min_summary']['p95']:.3f} | {result['median_summary']['p95']:.3f} |",
        f"| **Bimodality coef (Sarle's b)** | **{min_b:.3f}** ({min_label}) | **{med_b:.3f}** ({med_label}) |",
        f"| Frac in tails (<0.2 or >0.8) | {result['min_summary']['frac_below_0.2'] + result['min_summary']['frac_above_0.8']:.3f} | {result['median_summary']['frac_below_0.2'] + result['median_summary']['frac_above_0.8']:.3f} |",
        f"| Frac in middle [0.2, 0.8] | {result['min_summary']['frac_in_middle_0.2_0.8']:.3f} | {result['median_summary']['frac_in_middle_0.2_0.8']:.3f} |",
        "",
        "**Sarle's b threshold for bimodality:** > 5/9 = 0.555 (Pfister et al. 2013).",
        "",
        "## Histogram: min(t,c) bidir ratio",
        "",
        "```",
        result["min_summary"]["histogram"],
        "```",
        "",
        "## Histogram: median(t,c) bidir ratio",
        "",
        "```",
        result["median_summary"]["histogram"],
        "```",
        "",
        "## Interpretation (duplicate-GAP-202 / R2-F1 follow-up)",
        "",
        "The original R2 finding flagged that the LOO bidirectional null distribution at small N is bimodal — values cluster near 0 or 1 with sparse density in the 0.2-0.8 range where the sigmoid gradient is steepest. The R2 reviewer's claim implied ~50% of null iterations were in the upper mode (~1.0).",
        "",
        f"**Empirical result (N=3, 5000 iterations, seed=42):**",
        f"- min(t,c) summary: bimodality coef = {min_b:.3f} ({min_label}). Frac in middle [0.2, 0.8] = {result['min_summary']['frac_in_middle_0.2_0.8']:.3f}.",
        f"- median(t,c) summary: bimodality coef = {med_b:.3f} ({med_label}). Frac in middle [0.2, 0.8] = {result['median_summary']['frac_in_middle_0.2_0.8']:.3f}.",
        "",
        "**Verdict:**",
        (
            "- The median summary REDUCES bimodality vs min when Sarle's b drops below the 0.555 threshold (or moves substantially toward unimodality)."
            if med_b < min_b
            else
            "- The median summary does NOT meaningfully reduce bimodality vs min in this run — both summaries show the same shape class."
        ),
        f"- Middle-density fraction shifts from {result['min_summary']['frac_in_middle_0.2_0.8']:.3f} (min) to {result['median_summary']['frac_in_middle_0.2_0.8']:.3f} (median) — {('substantial' if abs(result['median_summary']['frac_in_middle_0.2_0.8'] - result['min_summary']['frac_in_middle_0.2_0.8']) > 0.10 else 'modest')} change.",
        "- The production scoring change (commit 573f3031, GAP-187) using median rather than min is mechanically what's now consumed by the sigmoid; this simulation confirms whether the change resolves the R2-flagged degeneracy.",
        "",
        "## Reproduction",
        "",
        "```bash",
        "cd backend && OPENBLAS_NUM_THREADS=1 venv/Scripts/python.exe simulations/loo_bimodality_minmedian.py",
        "```",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    out_path = Path(__file__).resolve().parent / "loo_bimodality_minmedian.md"
    print(f"[run] N=3 null-effect, 5000 iter, seed=42 ...")
    t0 = datetime.now()
    result = run(n=3, n_iter=5000, seed=42)
    elapsed = (datetime.now() - t0).total_seconds()
    print(f"[done] {elapsed:.1f}s, {result['signal_count']} signal iterations")
    print(f"[min ] bimodality_coef = {result['min_summary']['bimodality_coef']:.3f}  middle_frac = {result['min_summary']['frac_in_middle_0.2_0.8']:.3f}")
    print(f"[med ] bimodality_coef = {result['median_summary']['bimodality_coef']:.3f}  middle_frac = {result['median_summary']['frac_in_middle_0.2_0.8']:.3f}")
    write_results_md(result, out_path)
    print(f"[wrote] {out_path}")
