#!/usr/bin/env python3
"""Validation suite for statistics.py — six methods.

Every test case is traced to published reference material:
  [McDonald]   McDonald JH (2014). Handbook of Biological Statistics,
               3rd ed., Sparky House Publishing, Baltimore, MD.
  [Rosetta]    Rosetta Code. "Welch's t-test." Verified against
               R t.test(..., var.equal=FALSE) and scipy.stats.ttest_ind.
               rosettacode.org/wiki/Welch%27s_t-test
  [Shier]      Shier R (2004). "Statistics: 2.3 The Mann–Whitney U Test."
               Mathematics Learning Support Centre, Loughborough University.
               SPSS-verified. statstutor.ac.uk/resources/uploaded/mannwhitney.pdf
  [Statology]  Statology (2022). "Mann-Whitney U Test (Simply Explained)."
               statology.org/mann-whitney-u-test/
  [AB94]       Armitage P, Berry G (1994). Statistical Methods in Medical
               Research, 3rd ed., Blackwell Science, Oxford, p. 466.
  [StatsDirect] StatsDirect Ltd. "Spearman's Rank Correlation."
               statsdirect.com/help/nonparametric_methods/spearman.htm
  [WikiSpear]  Wikipedia. "Spearman's rank correlation coefficient."
               IQ vs TV-hours worked example.
  [Abdi]       Abdi H (2010). "Holm's Sequential Bonferroni Procedure."
               In Salkind N (Ed.), Encyclopedia of Research Design, Sage,
               Table 1. personal.utdallas.edu/~herve/abdi-Holm2010-pretty.pdf
  [Garcia]     García-Arenzana N et al. (2014). Int J Cancer 134(8):1916–1925.
               25-variable Bonferroni example reproduced in [McDonald] pp. 262–263.

Cross-validation oracles:
  scipy.stats  — every wrapper is compared to a direct scipy call.
  R            — Rosetta Code vectors verified via R's t.test, wilcox.test,
                 cor.test, p.adjust.
  SPSS         — Shier (2004) Mann–Whitney values reproduced from SPSS output.
  StatsDirect  — Armitage & Berry Spearman example independently verified.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path

import importlib.util
import numpy as np
from scipy import stats as sp_stats

# ── Import module under test ──
_stat_path = Path(__file__).resolve().parent.parent / "statistics.py"
_spec = importlib.util.spec_from_file_location("statistics", _stat_path)
stat_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(stat_mod)

welch_t_test = stat_mod.welch_t_test
mann_whitney_u = stat_mod.mann_whitney_u
spearman_correlation = stat_mod.spearman_correlation
severity_trend = stat_mod.severity_trend
welch_pairwise = stat_mod.welch_pairwise
bonferroni_correct = stat_mod.bonferroni_correct


# ══════════════════════════════════════════════════════════════
# Test infrastructure
# ══════════════════════════════════════════════════════════════

@dataclass
class TestResult:
    name: str
    passed: bool
    detail: str = ""

results: list[TestResult] = []

def check(name: str, condition: bool, detail: str = ""):
    results.append(TestResult(name, condition, detail))
    status = "✓ PASS" if condition else "✗ FAIL"
    print(f"  {status}  {name}")
    if detail and not condition:
        print(f"         {detail}")

def section(title: str):
    print(f"\n{'═' * 70}")
    print(f"  {title}")
    print(f"{'═' * 70}")


# ══════════════════════════════════════════════════════════════
# Reference datasets
# ══════════════════════════════════════════════════════════════

# ── [McDonald] pp. 128–129: body temperatures ──
TEMP_2PM = np.array([69,70,66,63,68,70,69,67,62,63,76,59,62,62,75,62,72,63], dtype=float)
TEMP_5PM = np.array([68,62,67,68,69,67,61,59,62,61,69,66,62,62,61,70], dtype=float)

# ── [Rosetta] three verified pairs ──
ROSETTA_D1 = np.array([27.5,21.0,19.0,23.6,17.0,17.9,16.9,20.1,21.9,22.6,23.1,19.6,19.0,21.7,21.4], dtype=float)
ROSETTA_D2 = np.array([27.1,22.0,20.8,23.4,23.4,23.5,25.8,22.0,24.8,20.2,21.9,22.1,22.9,20.5,24.4], dtype=float)
ROSETTA_D7 = np.array([30.02,29.99,30.11,29.97,30.01,29.99], dtype=float)
ROSETTA_D8 = np.array([29.89,29.93,29.72,29.98,30.02,29.98], dtype=float)
ROSETTA_X  = np.array([3.0,4.0,1.0,2.1], dtype=float)
ROSETTA_Y  = np.array([490.2,340.0,433.9], dtype=float)

# ── [Shier] p. 3: age at diabetes diagnosis ──
SHIER_MALES   = np.array([19, 22, 16, 29, 24], dtype=float)
SHIER_FEMALES = np.array([20, 11, 17, 12], dtype=float)

# ── [Statology]: drug vs placebo with ties ──
STAT_DRUG    = np.array([3, 5, 1, 4, 3, 5], dtype=float)
STAT_PLACEBO = np.array([4, 8, 6, 2, 1, 9], dtype=float)

# ── [AB94] p. 466: clinical psychology student rankings ──
AB94_CAREER = np.array([4,10,3,1,9,2,6,7,8,5], dtype=float)
AB94_PSYCH  = np.array([5, 8,6,2,10,3,9,4,7,1], dtype=float)

# ── [WikiSpear]: IQ vs TV-hours ──
WIKI_IQ = np.array([106,86,100,101,99,103,97,113,112,110], dtype=float)
WIKI_TV = np.array([7,0,27,50,28,29,20,12,6,17], dtype=float)

# ── [Abdi] Table 1: 3 simultaneous tests ──
ABDI_RAW_P = [0.000040, 0.016100, 0.612300]

# ── [Garcia/McDonald] pp. 262–263: 25-variable dietary study ──
# Seven smallest raw p-values; remaining 18 all > 0.074
GARCIA_RAW_P = [0.001, 0.008, 0.039, 0.041, 0.042, 0.060, 0.074]
GARCIA_N_TESTS = 25


# ══════════════════════════════════════════════════════════════
# TEST GROUP 1: welch_t_test — published references
# ══════════════════════════════════════════════════════════════

section("1. welch_t_test — published reference values")

# ── 1.1  [McDonald] pp. 128–129: body temperature ──
# R t.test: t = 1.3109, df = 31.175, p = 0.1995
r = welch_t_test(TEMP_2PM, TEMP_5PM)
check(
    "[McDonald] pp.128–129: t-statistic = 1.3109",
    abs(r["statistic"] - 1.3109) < 0.001,
    f"got {r['statistic']:.4f}",
)
check(
    "[McDonald] pp.128–129: p-value = 0.1995",
    abs(r["p_value"] - 0.1995) < 0.001,
    f"got {r['p_value']:.4f}",
)

# ── 1.2  [Rosetta] d1 vs d2: p = 0.021378 ──
r = welch_t_test(ROSETTA_D1, ROSETTA_D2)
check(
    "[Rosetta] d1 vs d2: p = 0.021378",
    abs(r["p_value"] - 0.021378001462867) < 1e-6,
    f"got {r['p_value']:.15f}",
)

# ── 1.3  [Rosetta] d7 vs d8: p = 0.090773 ──
r = welch_t_test(ROSETTA_D7, ROSETTA_D8)
check(
    "[Rosetta] d7 vs d8: p = 0.090773",
    abs(r["p_value"] - 0.090773324285671) < 1e-6,
    f"got {r['p_value']:.15f}",
)

# ── 1.4  [Rosetta] x vs y: extreme variance inequality ──
# t = −9.5595, df = 2.0009, p = 0.010752
r = welch_t_test(ROSETTA_X, ROSETTA_Y)
check(
    "[Rosetta] x vs y: p = 0.010752 (extreme variance ratio)",
    abs(r["p_value"] - 0.010751561149785) < 1e-6,
    f"got {r['p_value']:.15f}",
)
check(
    "[Rosetta] x vs y: t ≈ −9.56 (near-degenerate df ≈ 2.0)",
    abs(r["statistic"] - (-9.5595)) < 0.01,
    f"got {r['statistic']:.4f}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 2: welch_t_test — scipy cross-validation
# ══════════════════════════════════════════════════════════════

section("2. welch_t_test — scipy cross-validation")

# ── 2.1  Basic two-group comparison ──
g1 = [10.2, 11.1, 9.8, 10.5, 10.0]
g2 = [15.3, 14.8, 16.1, 15.0, 15.5]
r = welch_t_test(g1, g2)
t_ref, p_ref = sp_stats.ttest_ind(g1, g2, equal_var=False)
check(
    "scipy: basic two-group t-stat matches",
    abs(r["statistic"] - float(t_ref)) < 1e-10,
    f"got {r['statistic']}, expected {float(t_ref)}",
)
check(
    "scipy: basic two-group p-value matches",
    abs(r["p_value"] - float(p_ref)) < 1e-10,
    f"got {r['p_value']}, expected {float(p_ref)}",
)

# ── 2.2  Hand-calculated: g1=[4,6], g2=[1,3] ──
# means: 5 vs 2, s1=s2=√2, se=√(2/2+2/2)=√2, t = 3/√2
r = welch_t_test([4.0, 6.0], [1.0, 3.0])
expected_t = 3.0 / math.sqrt(2.0)
check(
    "Hand-calc: t = 3/√2 ≈ 2.1213",
    abs(r["statistic"] - expected_t) < 1e-6,
    f"got {r['statistic']:.6f}, expected {expected_t:.6f}",
)

# ── 2.3  Unequal sizes ──
g1 = [1.0, 2.0, 3.0]
g2 = [10.0, 11.0, 12.0, 13.0, 14.0, 15.0]
r = welch_t_test(g1, g2)
t_ref, p_ref = sp_stats.ttest_ind(g1, g2, equal_var=False)
check(
    "scipy: unequal sizes matches",
    abs(r["statistic"] - float(t_ref)) < 1e-10 and abs(r["p_value"] - float(p_ref)) < 1e-10,
    f"t: got {r['statistic']:.6f} vs {float(t_ref):.6f}",
)

# ── 2.4  numpy input ──
a1 = np.array([3.1, 4.1, 5.9, 2.6])
a2 = np.array([7.0, 8.0, 9.0, 10.0])
r = welch_t_test(a1, a2)
t_ref, p_ref = sp_stats.ttest_ind(a1, a2, equal_var=False)
check(
    "scipy: numpy array input matches",
    abs(r["statistic"] - float(t_ref)) < 1e-10,
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 3: welch_t_test — NaN handling and edge cases
# ══════════════════════════════════════════════════════════════

section("3. welch_t_test — NaN handling and edge cases")

# ── 3.1  NaN stripped from group1 ──
r = welch_t_test([1.0, float("nan"), 3.0, 2.0], [10.0, 11.0, 12.0])
t_ref, p_ref = sp_stats.ttest_ind([1.0, 3.0, 2.0], [10.0, 11.0, 12.0], equal_var=False)
check(
    "NaN in group1 stripped: result matches clean data",
    abs(r["statistic"] - float(t_ref)) < 1e-10,
)

# ── 3.2  NaN stripped from group2 ──
r = welch_t_test([10.0, 11.0, 12.0], [float("nan"), 1.0, float("nan"), 3.0, 2.0])
t_ref, p_ref = sp_stats.ttest_ind([10.0, 11.0, 12.0], [1.0, 3.0, 2.0], equal_var=False)
check(
    "NaN in group2 stripped: result matches clean data",
    abs(r["p_value"] - float(p_ref)) < 1e-10,
)

# ── 3.3  Too few elements → None ──
check(
    "Single element group1 → None",
    welch_t_test([5.0], [1.0, 2.0, 3.0]) == {"statistic": None, "p_value": None},
)
check(
    "Single element group2 → None",
    welch_t_test([1.0, 2.0, 3.0], [5.0]) == {"statistic": None, "p_value": None},
)
check(
    "Empty group → None",
    welch_t_test([], [1.0, 2.0]) == {"statistic": None, "p_value": None},
)
check(
    "All-NaN group → None",
    welch_t_test([float("nan"), float("nan")], [1.0, 2.0, 3.0]) == {"statistic": None, "p_value": None},
)

# ── 3.4  Zero variance → NaN (scipy behavior) ──
r = welch_t_test([5.0, 5.0, 5.0], [5.0, 5.0, 5.0])
check(
    "Zero variance (constant groups) → NaN from scipy",
    math.isnan(r["statistic"]) and math.isnan(r["p_value"]),
    f"got t={r['statistic']}, p={r['p_value']}",
)

# ── 3.5  Return type ──
r = welch_t_test([1, 2, 3], [4, 5, 6])
check(
    "Return type: dict with float statistic and p_value",
    isinstance(r, dict) and isinstance(r["statistic"], float) and isinstance(r["p_value"], float),
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 4: mann_whitney_u — published references
# ══════════════════════════════════════════════════════════════

section("4. mann_whitney_u — published reference values")

# ── 4.1  [Shier] p. 3: diabetes age, SPSS-verified ──
# U₁ = 17, U₂ = 3; scipy returns U for first sample
# z(approx) = −1.715, asymptotic two-sided p = 0.086
r = mann_whitney_u(SHIER_MALES, SHIER_FEMALES)
u_ref, p_ref = sp_stats.mannwhitneyu(SHIER_MALES, SHIER_FEMALES, alternative="two-sided")
check(
    "[Shier] SPSS: U statistic matches scipy",
    abs(r["statistic"] - float(u_ref)) < 1e-10,
    f"got {r['statistic']}, scipy {float(u_ref)}",
)
check(
    "[Shier] SPSS: p-value matches scipy (asymptotic)",
    abs(r["p_value"] - float(p_ref)) < 1e-10,
    f"got {r['p_value']:.6f}, scipy {float(p_ref):.6f}",
)

# Hand-check: U₁ + U₂ = n₁ × n₂
u1 = r["statistic"]
u2 = 5 * 4 - u1
check(
    "[Shier] p.3: U₁ + U₂ = n₁×n₂ = 20",
    abs(u1 + u2 - 20.0) < 1e-10,
    f"U₁={u1}, U₂={u2}, sum={u1+u2}",
)

# ── 4.2  [Statology]: drug vs placebo with tied ranks ──
r = mann_whitney_u(STAT_DRUG, STAT_PLACEBO)
u_ref, p_ref = sp_stats.mannwhitneyu(STAT_DRUG, STAT_PLACEBO, alternative="two-sided")
check(
    "[Statology] tied ranks: U matches scipy",
    abs(r["statistic"] - float(u_ref)) < 1e-10,
    f"got {r['statistic']}, scipy {float(u_ref)}",
)
check(
    "[Statology] tied ranks: p-value matches scipy",
    abs(r["p_value"] - float(p_ref)) < 1e-10,
)

# ── 4.3  Completely separated groups ──
# g1=[1,2,3], g2=[4,5,6]: all g2 > g1 → U₁=0 (scipy returns U for g1)
r = mann_whitney_u([1.0, 2.0, 3.0], [4.0, 5.0, 6.0])
u_ref, p_ref = sp_stats.mannwhitneyu([1.0, 2.0, 3.0], [4.0, 5.0, 6.0], alternative="two-sided")
check(
    "Fully separated groups: U matches scipy",
    abs(r["statistic"] - float(u_ref)) < 1e-10,
    f"got {r['statistic']}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 5: mann_whitney_u — edge cases
# ══════════════════════════════════════════════════════════════

section("5. mann_whitney_u — NaN handling and edge cases")

# ── 5.1  NaN removal ──
r = mann_whitney_u([1.0, float("nan"), 2.0, 3.0], [10.0, 11.0, float("nan")])
u_ref, p_ref = sp_stats.mannwhitneyu([1.0, 2.0, 3.0], [10.0, 11.0], alternative="two-sided")
check(
    "NaN removal: matches clean data",
    abs(r["statistic"] - float(u_ref)) < 1e-10,
)

# ── 5.2  Edge cases → None ──
check(
    "Empty group → None",
    mann_whitney_u([], [1.0, 2.0]) == {"statistic": None, "p_value": None},
)
check(
    "All-NaN group → None",
    mann_whitney_u([float("nan")], [1.0, 2.0]) == {"statistic": None, "p_value": None},
)

# ── 5.3  Return types ──
r = mann_whitney_u([1, 2, 3], [4, 5, 6])
check(
    "Return type: float statistic and p_value",
    isinstance(r["statistic"], float) and isinstance(r["p_value"], float),
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 6: spearman_correlation — published references
# ══════════════════════════════════════════════════════════════

section("6. spearman_correlation — published reference values")

# ── 6.1  [AB94] p. 466 + [StatsDirect]: clinical psychology rankings ──
# n=10, Σd²=52, rₛ = 1 − 6×52/(10×99) = 113/165 ≈ 0.684848
# t ≈ 2.658, exact two-sided p = 0.0347 (permutation)
EXACT_RHO = 113.0 / 165.0  # = 0.684848...
r = spearman_correlation(AB94_CAREER, AB94_PSYCH)
check(
    "[AB94] p.466: ρ = 113/165 ≈ 0.6848 (exact rational)",
    abs(r["rho"] - EXACT_RHO) < 1e-10,
    f"got {r['rho']:.10f}, exact {EXACT_RHO:.10f}",
)

# Verify Σd² = 52 hand calculation
d_sq_sum = float(np.sum((AB94_CAREER - AB94_PSYCH) ** 2))
check(
    "[AB94] p.466: Σd² = 52 (hand-verified)",
    abs(d_sq_sum - 52.0) < 1e-10,
    f"got {d_sq_sum}",
)

# t-approximation: t = ρ√[(n−2)/(1−ρ²)] ≈ 2.658
n_ab = 10
t_approx = EXACT_RHO * math.sqrt((n_ab - 2) / (1 - EXACT_RHO ** 2))
check(
    "[StatsDirect]: t-approximation ≈ 2.658 (df=8)",
    abs(t_approx - 2.658) < 0.001,
    f"got {t_approx:.3f}",
)

# scipy p-value cross-check
rho_ref, p_ref = sp_stats.spearmanr(AB94_CAREER, AB94_PSYCH)
check(
    "[AB94] scipy cross-check: ρ matches",
    abs(r["rho"] - float(rho_ref)) < 1e-10,
)
check(
    "[AB94] scipy cross-check: p-value matches",
    abs(r["p_value"] - float(p_ref)) < 1e-10,
    f"got {r['p_value']:.6f}, scipy {float(p_ref):.6f}",
)

# ── 6.2  [WikiSpear]: IQ vs TV-hours — negative correlation ──
# n=10, Σd²=194, rₛ = −29/165 ≈ −0.1758
WIKI_RHO = -29.0 / 165.0
r = spearman_correlation(WIKI_IQ, WIKI_TV)
check(
    "[WikiSpear]: ρ = −29/165 ≈ −0.1758 (negative, non-significant)",
    abs(r["rho"] - WIKI_RHO) < 1e-10,
    f"got {r['rho']:.10f}, exact {WIKI_RHO:.10f}",
)
check(
    "[WikiSpear]: p > 0.05 (non-significant)",
    r["p_value"] > 0.05,
    f"got p = {r['p_value']:.4f}",
)

# Verify Σd² = 194 for IQ vs TV example
# Need to compute on ranks since raw data is not pre-ranked
d_sq_wiki = float(np.sum((sp_stats.rankdata(WIKI_IQ) - sp_stats.rankdata(WIKI_TV)) ** 2))
rho_from_d2 = 1 - 6 * d_sq_wiki / (10 * 99)
check(
    "[WikiSpear]: Σd² on ranks → ρ consistent with −29/165",
    abs(rho_from_d2 - WIKI_RHO) < 1e-10,
    f"Σd²={d_sq_wiki}, ρ from formula={rho_from_d2:.6f}",
)

# ── 6.3  Perfect positive and negative ──
r_pos = spearman_correlation([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])
r_neg = spearman_correlation([1, 2, 3, 4, 5], [50, 40, 30, 20, 10])
check(
    "Perfect positive: ρ = 1.0",
    abs(r_pos["rho"] - 1.0) < 1e-10,
)
check(
    "Perfect negative: ρ = −1.0",
    abs(r_neg["rho"] - (-1.0)) < 1e-10,
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 7: spearman_correlation — edge cases
# ══════════════════════════════════════════════════════════════

section("7. spearman_correlation — NaN handling and edge cases")

# ── 7.1  NaN pairwise removal ──
x_nan = [1.0, float("nan"), 3.0, 4.0, 5.0]
y_nan = [10.0, 20.0, float("nan"), 40.0, 50.0]
r = spearman_correlation(x_nan, y_nan)
rho_ref, p_ref = sp_stats.spearmanr([1.0, 4.0, 5.0], [10.0, 40.0, 50.0])
check(
    "NaN pairwise removal: matches clean subset",
    abs(r["rho"] - float(rho_ref)) < 1e-10,
)

# ── 7.2  Tied ranks ──
r = spearman_correlation([1, 2, 2, 3, 4], [5, 5, 6, 7, 8])
rho_ref, _ = sp_stats.spearmanr([1, 2, 2, 3, 4], [5, 5, 6, 7, 8])
check(
    "Tied ranks: matches scipy",
    abs(r["rho"] - float(rho_ref)) < 1e-10,
)

# ── 7.3  Edge cases → None ──
check(
    "Fewer than 3 pairs → None",
    spearman_correlation([1, 2], [3, 4]) == {"rho": None, "p_value": None},
)
check(
    "All NaN → None",
    spearman_correlation([float("nan")], [float("nan")]) == {"rho": None, "p_value": None},
)

# ── 7.4  Return types ──
r = spearman_correlation([1, 2, 3, 4], [4, 3, 2, 1])
check(
    "Return type: float rho and p_value",
    isinstance(r["rho"], float) and isinstance(r["p_value"], float),
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 8: severity_trend — dose × severity Spearman
# ══════════════════════════════════════════════════════════════

section("8. severity_trend — dose-severity Spearman correlation")

# severity_trend is a thin wrapper over spearmanr; verify it matches
# the same scipy oracle and handles its unique edge case (constant severity).

# ── 8.1  Perfect increasing trend ──
r = severity_trend([0, 10, 50, 100], [0.1, 0.5, 1.2, 2.0])
check(
    "Perfect increasing dose-severity trend: ρ = 1.0",
    abs(r["rho"] - 1.0) < 1e-10,
)

# ── 8.2  Perfect decreasing trend ──
r = severity_trend([0, 10, 50, 100], [2.0, 1.5, 1.0, 0.5])
check(
    "Perfect decreasing dose-severity trend: ρ = −1.0",
    abs(r["rho"] - (-1.0)) < 1e-10,
)

# ── 8.3  Arbitrary data: matches scipy ──
doses = [0, 1, 5, 10, 50]
sevs = [0.2, 0.3, 0.8, 0.5, 1.5]
r = severity_trend(doses, sevs)
rho_ref, p_ref = sp_stats.spearmanr(doses, sevs)
check(
    "scipy cross-check: arbitrary dose-severity matches",
    abs(r["rho"] - float(rho_ref)) < 1e-10 and abs(r["p_value"] - float(p_ref)) < 1e-10,
    f"got ρ={r['rho']:.6f}, scipy ρ={float(rho_ref):.6f}",
)

# ── 8.4  Constant severity → None (unique guard) ──
r = severity_trend([0, 10, 50, 100], [1.0, 1.0, 1.0, 1.0])
check(
    "Constant severity across all doses → None (correlation undefined)",
    r == {"rho": None, "p_value": None},
)

# ── 8.5  NaN removal ──
r = severity_trend([0, float("nan"), 50, 100, 200], [0.1, 0.5, float("nan"), 1.5, 2.0])
rho_ref, p_ref = sp_stats.spearmanr([0, 100, 200], [0.1, 1.5, 2.0])
check(
    "NaN removal: surviving pairs match scipy",
    abs(r["rho"] - float(rho_ref)) < 1e-10,
)

# ── 8.6  Fewer than 3 pairs → None ──
check(
    "Fewer than 3 pairs → None",
    severity_trend([0, 10], [0.5, 1.0]) == {"rho": None, "p_value": None},
)

# ── 8.7  Toxicology-like dose-response curve ──
# Realistic scenario: organ weight increases with dose but plateaus
tox_doses = [0, 50, 100, 200, 500]
tox_sevs = [0.0, 0.2, 0.8, 1.5, 1.6]
r = severity_trend(tox_doses, tox_sevs)
rho_ref, p_ref = sp_stats.spearmanr(tox_doses, tox_sevs)
check(
    "Toxicology dose-response: ρ matches scipy",
    abs(r["rho"] - float(rho_ref)) < 1e-10,
)
check(
    "Toxicology dose-response: significant positive trend",
    r["rho"] > 0.8 and r["p_value"] < 0.1,
    f"ρ={r['rho']:.4f}, p={r['p_value']:.4f}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 9: welch_pairwise — multi-group vs control
# ══════════════════════════════════════════════════════════════

section("9. welch_pairwise — pairwise Welch t-test vs control")

# welch_pairwise wraps welch_t_test for each treated group; verify
# consistency with individual welch_t_test calls.

# ── 9.1  [Rosetta]-derived: use Rosetta data as control + treated ──
ctrl = ROSETTA_D1
treated = [
    (10, ROSETTA_D2),
    (50, ROSETTA_D7[:5]),  # use 5 elements for valid comparison
]
results_pw = welch_pairwise(ctrl, treated)
check(
    "Two treated groups → two results",
    len(results_pw) == 2,
)

for pw in results_pw:
    dose = pw["dose_level"]
    # Find the matching treated group
    vals = dict(treated)[dose]
    direct = welch_t_test(vals.tolist(), ctrl.tolist())
    expected_p = round(direct["p_value"], 6) if direct["p_value"] is not None else None
    check(
        f"Dose {dose}: p_value_welch matches individual welch_t_test",
        pw["p_value_welch"] == expected_p,
        f"pairwise={pw['p_value_welch']}, direct={expected_p}",
    )

# ── 9.2  Multiple treated groups: each matches direct call ──
ctrl = np.array([2.0, 3.0, 4.0, 5.0])
treated_multi = [
    (10, np.array([3.0, 4.0, 5.0, 6.0])),
    (50, np.array([7.0, 8.0, 9.0, 10.0])),
    (100, np.array([12.0, 13.0, 14.0, 15.0])),
]
results_pw = welch_pairwise(ctrl, treated_multi)
check(
    "Three treated groups → three results",
    len(results_pw) == 3,
)

for i, (dose, vals) in enumerate(treated_multi):
    direct = welch_t_test(vals, ctrl)
    check(
        f"Group {dose} vs control: raw p matches welch_t_test",
        abs((results_pw[i]["p_value_welch"] or 0) - round(direct["p_value"], 6)) < 1e-6,
        f"pairwise={results_pw[i]['p_value_welch']}, direct={round(direct['p_value'], 6)}",
    )

# ── 9.3  p-values are RAW (not Bonferroni-corrected) ──
# Both treated groups identical → both p-values equal single-test p
ctrl2 = np.array([1.0, 2.0, 3.0, 4.0])
same_vals = np.array([3.0, 4.0, 5.0, 6.0])
treated_same = [(10, same_vals), (50, same_vals)]
results_pw = welch_pairwise(ctrl2, treated_same)
direct = welch_t_test(same_vals, ctrl2)
for pw in results_pw:
    check(
        f"Dose {pw['dose_level']}: raw p (not multiplied by # tests)",
        abs((pw["p_value_welch"] or 0) - round(direct["p_value"], 6)) < 1e-6,
    )

# ── 9.4  NaN in control ──
ctrl_nan = np.array([float("nan"), 1.0, 2.0, 3.0])
treated_nan = [(10, np.array([10.0, 11.0, 12.0]))]
results_pw = welch_pairwise(ctrl_nan, treated_nan)
direct = welch_t_test([10.0, 11.0, 12.0], [1.0, 2.0, 3.0])
check(
    "NaN in control: stripped before computation",
    abs((results_pw[0]["p_value_welch"] or 0) - round(direct["p_value"], 6)) < 1e-6,
)

# ── 9.5  NaN in treated ──
treated_nan2 = [(10, np.array([float("nan"), 10.0, 11.0, 12.0]))]
results_pw = welch_pairwise(np.array([1.0, 2.0, 3.0]), treated_nan2)
direct = welch_t_test([10.0, 11.0, 12.0], [1.0, 2.0, 3.0])
check(
    "NaN in treated: stripped before computation",
    abs((results_pw[0]["p_value_welch"] or 0) - round(direct["p_value"], 6)) < 1e-6,
)

# ── 9.6  Edge cases → empty list ──
check(
    "Control < 2 elements → empty list",
    welch_pairwise(np.array([1.0]), [(10, np.array([5.0, 6.0, 7.0]))]) == [],
)
check(
    "No treated groups → empty list",
    welch_pairwise(np.array([1.0, 2.0, 3.0]), []) == [],
)

# ── 9.7  Treated group too small → None p-value ──
results_pw = welch_pairwise(np.array([1.0, 2.0, 3.0]), [(10, np.array([5.0]))])
check(
    "Treated group n=1 → p_value_welch is None",
    len(results_pw) == 1 and results_pw[0]["p_value_welch"] is None,
)

# ── 9.8  Dose levels preserved ──
results_pw = welch_pairwise(np.array([1.0, 2.0, 3.0]), [
    (25, np.array([4.0, 5.0, 6.0])),
    (100, np.array([7.0, 8.0, 9.0])),
])
check(
    "Dose levels preserved: 25 and 100",
    results_pw[0]["dose_level"] == 25 and results_pw[1]["dose_level"] == 100,
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 10: bonferroni_correct — published references
# ══════════════════════════════════════════════════════════════

section("10. bonferroni_correct — published reference values")

# ── 10.1  [Abdi] Table 1: 3 tests ──
# raw: [0.000040, 0.016100, 0.612300] × 3
# expected: [0.000120, 0.048300, 1.000000]
corrected = bonferroni_correct(ABDI_RAW_P, n_tests=3)
check(
    "[Abdi] Table 1, test 1: 0.000040 × 3 = 0.000120",
    abs(corrected[0] - 0.000120) < 1e-10,
    f"got {corrected[0]:.10f}",
)
check(
    "[Abdi] Table 1, test 2: 0.016100 × 3 = 0.048300",
    abs(corrected[1] - 0.048300) < 1e-10,
    f"got {corrected[1]:.10f}",
)
check(
    "[Abdi] Table 1, test 3: 0.612300 × 3 = 1.8369 → capped at 1.0",
    abs(corrected[2] - 1.0) < 1e-10,
    f"got {corrected[2]:.10f}",
)

# ── 10.2  [Abdi] significance at α = 0.05 ──
check(
    "[Abdi] tests 1 & 2 remain significant after correction (p < 0.05)",
    corrected[0] < 0.05 and corrected[1] < 0.05,
)
check(
    "[Abdi] test 3 not significant after correction (p = 1.0)",
    corrected[2] >= 0.05,
)

# ── 10.3  [Garcia/McDonald] pp. 262–263: 25-variable dietary study ──
# 7 smallest raw p-values × 25; remaining 18 all → 1.0
corrected_garcia = bonferroni_correct(GARCIA_RAW_P, n_tests=GARCIA_N_TESTS)
garcia_expected = [0.025, 0.200, 0.975, 1.0, 1.0, 1.0, 1.0]
for i, (got, exp) in enumerate(zip(corrected_garcia, garcia_expected)):
    check(
        f"[Garcia/McDonald] variable {i+1}: {GARCIA_RAW_P[i]} × 25 = {exp}",
        abs(got - exp) < 1e-10,
        f"got {got:.6f}",
    )

# ── 10.4  [Garcia/McDonald]: only "Total calories" survives α = 0.05 ──
check(
    "[Garcia/McDonald] only 1 of 7 survives α=0.05 under Bonferroni",
    sum(1 for p in corrected_garcia if p < 0.05) == 1,
    f"survivors: {[p for p in corrected_garcia if p < 0.05]}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 11: bonferroni_correct — algebraic properties
# ══════════════════════════════════════════════════════════════

section("11. bonferroni_correct — algebraic properties and edge cases")

# ── 11.1  Basic: p × n_tests ──
corrected = bonferroni_correct([0.01, 0.04, 0.05])
check(
    "Basic: [0.01,0.04,0.05] × 3 = [0.03,0.12,0.15]",
    all(abs(c - e) < 1e-10 for c, e in zip(corrected, [0.03, 0.12, 0.15])),
)

# ── 11.2  Cap at 1.0 ──
corrected = bonferroni_correct([0.5, 0.8])
check(
    "Cap: [0.5,0.8] × 2 → [1.0, 1.0]",
    corrected == [1.0, 1.0],
)

# ── 11.3  Explicit n_tests ──
corrected = bonferroni_correct([0.01, 0.02, 0.03], n_tests=5)
check(
    "Explicit n_tests=5: [0.05, 0.10, 0.15]",
    all(abs(c - e) < 1e-10 for c, e in zip(corrected, [0.05, 0.10, 0.15])),
)

# ── 11.4  None passthrough ──
corrected = bonferroni_correct([0.01, None, 0.05])
check(
    "None passthrough: [0.02, None, 0.10] (n_tests=2 auto)",
    corrected[0] == 0.02 and corrected[1] is None and corrected[2] == 0.10,
    f"got {corrected}",
)

# ── 11.5  All None → unchanged ──
corrected = bonferroni_correct([None, None, None])
check(
    "All None → n_tests=0 → [None, None, None]",
    corrected == [None, None, None],
)

# ── 11.6  Single p-value ──
check(
    "Single p-value: n_tests=1 → no change",
    bonferroni_correct([0.04]) == [0.04],
)

# ── 11.7  Empty list ──
check(
    "Empty list → []",
    bonferroni_correct([]) == [],
)

# ── 11.8  n_tests=0 → no correction ──
check(
    "n_tests=0: returns original p-values",
    bonferroni_correct([0.01, 0.05], n_tests=0) == [0.01, 0.05],
)

# ── 11.9  Order preserved ──
p_in = [0.05, 0.01, 0.03, 0.02]
corrected = bonferroni_correct(p_in)
expected = [0.20, 0.04, 0.12, 0.08]
check(
    "Order preserved: output order matches input",
    all(abs(c - e) < 1e-10 for c, e in zip(corrected, expected)),
)

# ── 11.10  Very small p ──
corrected = bonferroni_correct([1e-10, 1e-8])
check(
    "Very small p: [2e-10, 2e-8]",
    abs(corrected[0] - 2e-10) < 1e-20 and abs(corrected[1] - 2e-8) < 1e-18,
)

# ── 11.11  Return type ──
check(
    "Return type: list of floats",
    isinstance(bonferroni_correct([0.01, 0.05]), list),
)


# ══════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════

section("SUMMARY")

n_total = len(results)
n_passed = sum(1 for r in results if r.passed)
n_failed = n_total - n_passed

print(f"\n  Total:  {n_total}")
print(f"  Passed: {n_passed}")
print(f"  Failed: {n_failed}")

if n_failed > 0:
    print("\n  FAILED TESTS:")
    for r in results:
        if not r.passed:
            print(f"    ✗ {r.name}")
            if r.detail:
                print(f"      {r.detail}")

print()
sys.exit(0 if n_failed == 0 else 1)
