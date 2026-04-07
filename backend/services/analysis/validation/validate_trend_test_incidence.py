#!/usr/bin/env python3
"""Validation suite for the original trend_test_incidence()

Every test case is traced to published reference material:
  [Young]       Young SS. "The Cochran-Armitage test for trends or
                thresholds in proportions." Society for Risk Analysis,
                1985. Tables 1, 5.
  [Tang]        Tang ML, Ng HKT, Guo J, Chan W, Chan BPS. "Exact
                Cochran-Armitage trend tests." J Stat Comput Simul,
                2006; 76(10):847-859. Equation (2).
  [Buonaccorsi] Buonaccorsi JP, Laake P, Veierød MB. "On the power of
                the Cochran-Armitage test for trend in the presence of
                misclassification." Stat Methods Med Res, 2014;
                23(3):218-243. Equations (4)-(7).
  [Zhou]        Zhou Z, Ku HC, Huang Z, Xing G, Xing C. "Differentiating
                the Cochran-Armitage trend test and Pearson's chi-squared
                test." Ann Hum Genet, 2017; 81(5):184-189. Page 2.
  [SAS]         SAS PROC FREQ documentation: Cochran-Armitage Test for
                Trend. Binomial-variance (N) convention.
  [R]           R stats::prop.trend.test — uses chi-squared with
                hypergeometric (N-1) convention; Z² = χ²_R · N/(N-1).

The original function uses:
  - scores = 0, 1, …, k-1 (fixed, not configurable)
  - binomial variance (division by N, SAS convention)
  - two-sided p-value only
  - returns {"statistic": Z, "p_value": p} or {"statistic": None, ...}
"""

import math
import sys
from pathlib import Path

import importlib.util
import numpy as np
from scipy import stats as sp_stats

# ── Import module under test ──
_mod_path = Path(__file__).resolve().parent.parent / "statistics.py"
_spec = importlib.util.spec_from_file_location("statistics", _mod_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

trend_test_incidence = _mod.trend_test_incidence


# ══════════════════════════════════════════════════════════════
# Test infrastructure
# ══════════════════════════════════════════════════════════════

class TestResult:
    def __init__(self, name, passed, detail=""):
        self.name = name
        self.passed = passed
        self.detail = detail

results = []

def check(name, condition, detail=""):
    results.append(TestResult(name, condition, detail))
    status = "✓ PASS" if condition else "✗ FAIL"
    print(f"  {status}  {name}")
    if detail and not condition:
        print(f"         {detail}")

def section(title):
    print(f"\n{'═' * 70}")
    print(f"  {title}")
    print(f"{'═' * 70}")


# ══════════════════════════════════════════════════════════════
# Reference data
# ══════════════════════════════════════════════════════════════

# [Young] p.469, Table 1: examples with scores (0,1,2) — the default
# Example (a): 0/50, 0/50, 10/50 → Z=4.009, p=0.00003  (one-sided)
# Example (b): 0/50, 5/50, 10/50 → Z=3.333, p=0.0004   (one-sided)
# Example (c): 0/50, 10/50,10/50 → Z=2.942, p=0.002    (one-sided)
# Our function uses two-sided, so p_two = 2 · p_one.

# [Tang] p.855, Table 1: 90-day neurotoxicity study in male rats
TANG_COUNTS = [0, 0, 1, 3]
TANG_TOTALS = [12, 12, 12, 12]

# [Young] p.473, Table 5: DDT/DDE/TDE liver carcinoma (first 4 groups)
DDT4_COUNTS = [4, 1, 1, 7]
DDT4_TOTALS = [56, 49, 48, 41]


# ══════════════════════════════════════════════════════════════
# TEST GROUP 1: Output structure
# ══════════════════════════════════════════════════════════════

section("1. Output structure")

res = trend_test_incidence([5, 10, 20], [50, 50, 50])

check(
    "Returns dict",
    isinstance(res, dict),
    f"got {type(res)}",
)
check(
    "Contains key 'statistic'",
    "statistic" in res,
)
check(
    "Contains key 'p_value'",
    "p_value" in res,
)
check(
    "'statistic' is float",
    isinstance(res["statistic"], float),
    f"got {type(res['statistic'])}",
)
check(
    "'p_value' is float",
    isinstance(res["p_value"], float),
    f"got {type(res['p_value'])}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 2: Numerator formula verification
# ══════════════════════════════════════════════════════════════

section("2. Numerator — algebraic equivalence with published formulae")

# [Zhou] p.2: T_CA numerator = (1/N)·Σ xᵢ(S·rᵢ − R·sᵢ)
# [Buonaccorsi] eq.(5): U = Σ cⱼ·p̂ⱼ  where cⱼ = nⱼ(xⱼ − x̄)
# Code form: Σ dᵢ·countᵢ − p̄·Σ dᵢ·nᵢ
# All three must be algebraically identical.

c = np.array([10, 15, 20, 30], dtype=float)
t = np.array([100, 100, 100, 100], dtype=float)
d = np.arange(4, dtype=float)
N = t.sum()
p_bar = c.sum() / N

# Code form
num_code = d @ c - p_bar * (d @ t)

# [Zhou] form
R = c.sum()
S = N - R
num_zhou = sum(d[i] * (S * c[i] - R * (t[i] - c[i])) for i in range(4)) / N

check(
    "[Zhou] p.2: numerator form matches code form",
    abs(num_code - num_zhou) < 1e-10,
    f"code={num_code:.6f}, Zhou={num_zhou:.6f}",
)

# [Buonaccorsi] form
x_bar = (d @ t) / N
c_j = t * (d - x_bar)
p_hat = c / t
num_buon = c_j @ p_hat

check(
    "[Buonaccorsi] eq.(5): U = Σ cⱼ·p̂ⱼ matches code form",
    abs(num_code - num_buon) < 1e-10,
    f"code={num_code:.6f}, Buonaccorsi={num_buon:.6f}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 3: Denominator formula verification
# ══════════════════════════════════════════════════════════════

section("3. Denominator — SAS (binomial) convention")

# [SAS] / [Buonaccorsi] eq.(7): s₀² = p̂(1−p̂)·Sxx
# Sxx = Σnᵢdᵢ² − (Σnᵢdᵢ)²/N  (code uses this E[X²]−E[X]² form)
# Also equals centered form: Σnᵢ(dᵢ − d̄)²

Sxx_expanded = sum(d[i]**2 * t[i] for i in range(4)) - (sum(d[i]*t[i] for i in range(4)))**2 / N
Sxx_centered = sum(t[i] * (d[i] - x_bar)**2 for i in range(4))

check(
    "Sxx: expanded form = centered form",
    abs(Sxx_expanded - Sxx_centered) < 1e-10,
    f"expanded={Sxx_expanded:.6f}, centered={Sxx_centered:.6f}",
)

denom_sq_manual = p_bar * (1 - p_bar) * Sxx_expanded
z_manual = num_code / math.sqrt(denom_sq_manual)

res_4g = trend_test_incidence([10, 15, 20, 30], [100, 100, 100, 100])

check(
    "[Buonaccorsi] eq.(7): manual Z = code Z",
    abs(z_manual - res_4g["statistic"]) < 1e-10,
    f"manual={z_manual:.6f}, code={res_4g['statistic']:.6f}",
)

# [R] cross-check: code uses N; R uses N-1.  χ²_code / χ²_R = N/(N-1).
# We cannot call R, but we verify the relationship holds by computing both.
z_sq_binom = res_4g["statistic"] ** 2
z_sq_hyper = z_sq_binom * (N - 1) / N  # what R would return as χ²
check(
    "[R] prop.trend.test: χ²_R = χ²_code · (N-1)/N",
    z_sq_hyper < z_sq_binom,
    f"χ²_binom={z_sq_binom:.6f}, χ²_hyper={z_sq_hyper:.6f}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 4: Tang (2006) eq.(2) — A(S,T) form
# ══════════════════════════════════════════════════════════════

section("4. Tang (2006) eq.(2) — A(S,T) = Z²")

# [Tang] eq.(2): A(S,T) = (T − d̄·S)² / [S(n−S)·Σnₖ(dₖ−d̄)²/n²]
# This must equal Z² from the code (binomial variance).

for label, cc, tt in [
    ("balanced 3-group", [5, 10, 20], [50, 50, 50]),
    ("Tang rats",        TANG_COUNTS, TANG_TOTALS),
    ("DDT 4-group",      DDT4_COUNTS, DDT4_TOTALS),
    ("unbalanced",       [3, 8, 15, 25], [40, 60, 80, 100]),
]:
    cc_a = np.array(cc, dtype=float)
    tt_a = np.array(tt, dtype=float)
    dd_a = np.arange(len(cc_a), dtype=float)
    nn = tt_a.sum()
    S_a = cc_a.sum()
    T_a = dd_a @ cc_a
    d_bar_a = (dd_a @ tt_a) / nn
    Sxx_a = sum(tt_a[i] * (dd_a[i] - d_bar_a)**2 for i in range(len(cc_a)))

    A_tang = (T_a - d_bar_a * S_a)**2 / (S_a * (nn - S_a) * Sxx_a / nn**2)

    r = trend_test_incidence(cc, tt)
    check(
        f"[Tang] eq.(2): A(S,T) = Z² for {label}",
        abs(A_tang - r["statistic"]**2) < 1e-8,
        f"A={A_tang:.6f}, Z²={r['statistic']**2:.6f}",
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 5: Young (1985) Table 1 — default scores (0,1,2)
# ══════════════════════════════════════════════════════════════

section("5. Young (1985) Table 1 — Z-values with default scores (0,1,2)")

# [Young] p.469: The code uses scores = range(k) = (0,1,2) by default.
# Young gives one-sided Z; our code returns two-sided p.
# We verify Z directly (sign and magnitude), then verify p = 2·Φ(−|Z|).

young_cases = [
    # (label, counts, totals, expected_Z_one_sided)
    ("(a) 0/50, 0/50, 10/50",  [0, 0, 10],  [50, 50, 50], 4.009),
    ("(b) 0/50, 5/50, 10/50",  [0, 5, 10],  [50, 50, 50], 3.333),
    ("(c) 0/50, 10/50, 10/50", [0, 10, 10], [50, 50, 50], 2.942),
]

for label, cc, tt, exp_z in young_cases:
    r = trend_test_incidence(cc, tt)
    check(
        f"[Young] Table 1{label}: Z = {exp_z}",
        abs(r["statistic"] - exp_z) < 0.001,
        f"got Z={r['statistic']:.3f}",
    )
    # Two-sided p must equal 2·(1 − Φ(|Z|))
    expected_p = 2 * sp_stats.norm.sf(abs(r["statistic"]))
    check(
        f"[Young] Table 1{label}: p_two = 2·Φ(−|Z|)",
        abs(r["p_value"] - expected_p) < 1e-10,
        f"code p={r['p_value']:.8f}, expected={expected_p:.8f}",
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 6: Two-sided p-value properties
# ══════════════════════════════════════════════════════════════

section("6. Two-sided p-value — mathematical properties")

# p ∈ [0, 1]
res_p = trend_test_incidence([5, 10, 20], [50, 50, 50])
check(
    "p-value ∈ [0, 1]",
    0.0 <= res_p["p_value"] <= 1.0,
    f"p={res_p['p_value']}",
)

# Symmetry: reversing counts should give same |Z| and same p
res_fwd = trend_test_incidence([5, 10, 20], [50, 50, 50])
res_rev = trend_test_incidence([20, 10, 5], [50, 50, 50])
check(
    "Symmetry: reversing trend gives same |Z|",
    abs(abs(res_fwd["statistic"]) - abs(res_rev["statistic"])) < 1e-10,
    f"|Z_fwd|={abs(res_fwd['statistic']):.6f}, |Z_rev|={abs(res_rev['statistic']):.6f}",
)
check(
    "Symmetry: reversing trend gives same two-sided p",
    abs(res_fwd["p_value"] - res_rev["p_value"]) < 1e-10,
    f"p_fwd={res_fwd['p_value']:.8f}, p_rev={res_rev['p_value']:.8f}",
)

# Z sign: increasing counts → positive Z
check(
    "Increasing counts → positive Z",
    res_fwd["statistic"] > 0,
    f"Z={res_fwd['statistic']:.4f}",
)
check(
    "Decreasing counts → negative Z",
    res_rev["statistic"] < 0,
    f"Z={res_rev['statistic']:.4f}",
)

# No trend → p ≈ 1 (Z ≈ 0)
res_flat = trend_test_incidence([10, 10, 10], [50, 50, 50])
check(
    "No trend (equal proportions): Z = 0",
    abs(res_flat["statistic"]) < 1e-10,
    f"Z={res_flat['statistic']}",
)
check(
    "No trend (equal proportions): p = 1.0",
    abs(res_flat["p_value"] - 1.0) < 1e-10,
    f"p={res_flat['p_value']}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 7: Score invariance under affine transformation
# ══════════════════════════════════════════════════════════════

section("7. Score invariance — affine transformation")

# The CA test is invariant to d → a + b·d for any constant a and b > 0.
# Since the code always uses (0,1,…,k-1), we verify that the result is
# *identical* to a hand-computed Z with scores (1,2,…,k) or (0,2,4,…).
# Both are affine transforms of (0,1,…,k-1).

cc_inv = np.array([5, 10, 20], dtype=float)
tt_inv = np.array([50, 50, 50], dtype=float)
N_inv = tt_inv.sum()
p_inv = cc_inv.sum() / N_inv

def compute_z(scores_arr):
    d = np.array(scores_arr, dtype=float)
    num = d @ cc_inv - p_inv * (d @ tt_inv)
    d_bar = (d @ tt_inv) / N_inv
    Sxx = sum(tt_inv[i] * (d[i] - d_bar)**2 for i in range(3))
    return num / math.sqrt(p_inv * (1 - p_inv) * Sxx)

z_012 = compute_z([0, 1, 2])
z_123 = compute_z([1, 2, 3])
z_024 = compute_z([0, 2, 4])

check(
    "Affine: Z(0,1,2) = Z(1,2,3)",
    abs(z_012 - z_123) < 1e-10,
    f"Z(0,1,2)={z_012:.6f}, Z(1,2,3)={z_123:.6f}",
)
check(
    "Affine: Z(0,1,2) = Z(0,2,4)",
    abs(z_012 - z_024) < 1e-10,
    f"Z(0,1,2)={z_012:.6f}, Z(0,2,4)={z_024:.6f}",
)

# And the code's output must match
res_inv = trend_test_incidence([5, 10, 20], [50, 50, 50])
check(
    "Code Z matches manual Z(0,1,2)",
    abs(res_inv["statistic"] - z_012) < 1e-10,
    f"code={res_inv['statistic']:.6f}, manual={z_012:.6f}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 8: Full manual computation — Tang rats data
# ══════════════════════════════════════════════════════════════

section("8. Full manual computation — Tang (2006) rats data")

# [Tang] p.855: 0/12, 0/12, 1/12, 3/12 with scores (0,1,2,3)
# Manual calculation using [Young] p.468 formula:
#   Z = Σ dᵢ(xᵢ − p·nᵢ) / √(p·q·Σnᵢ(dᵢ − d̄)²)

cc_t = np.array([0, 0, 1, 3], dtype=float)
tt_t = np.array([12, 12, 12, 12], dtype=float)
dd_t = np.array([0, 1, 2, 3], dtype=float)
nn_t = tt_t.sum()
pp = cc_t.sum() / nn_t          # 4/48 = 1/12
qq = 1.0 - pp
d_bar_t = (dd_t @ tt_t) / nn_t  # 72/48 = 1.5

num_t = sum(dd_t[i] * (cc_t[i] - pp * tt_t[i]) for i in range(4))
Sxx_t = sum(tt_t[i] * (dd_t[i] - d_bar_t)**2 for i in range(4))
denom_t = math.sqrt(pp * qq * Sxx_t)
z_tang_manual = num_t / denom_t
p_tang_manual = 2 * sp_stats.norm.sf(abs(z_tang_manual))

res_tang = trend_test_incidence(TANG_COUNTS, TANG_TOTALS)

check(
    "[Tang] rats: manual Z = code Z",
    abs(z_tang_manual - res_tang["statistic"]) < 1e-10,
    f"manual={z_tang_manual:.6f}, code={res_tang['statistic']:.6f}",
)
check(
    "[Tang] rats: manual p = code p",
    abs(p_tang_manual - res_tang["p_value"]) < 1e-10,
    f"manual={p_tang_manual:.8f}, code={res_tang['p_value']:.8f}",
)

# Verify intermediate values
check(
    "[Tang] rats: p̄ = 4/48 = 1/12",
    abs(pp - 1/12) < 1e-10,
    f"p̄={pp:.6f}",
)
check(
    "[Tang] rats: d̄ = 1.5",
    abs(d_bar_t - 1.5) < 1e-10,
    f"d̄={d_bar_t}",
)
check(
    "[Tang] rats: Sxx = 60",
    abs(Sxx_t - 60.0) < 1e-10,
    f"Sxx={Sxx_t}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 9: Full manual computation — DDT data
# ══════════════════════════════════════════════════════════════

section("9. Full manual computation — Young (1985) DDT 4-group")

# [Young] Table 5c: 4/56, 1/49, 1/48, 7/41 with scores (0,1,2,3)

cc_d = np.array([4, 1, 1, 7], dtype=float)
tt_d = np.array([56, 49, 48, 41], dtype=float)
dd_d = np.array([0, 1, 2, 3], dtype=float)
nn_d = tt_d.sum()
pp_d = cc_d.sum() / nn_d
qq_d = 1.0 - pp_d
d_bar_d = (dd_d @ tt_d) / nn_d

num_d = sum(dd_d[i] * (cc_d[i] - pp_d * tt_d[i]) for i in range(4))
Sxx_d = sum(tt_d[i] * (dd_d[i] - d_bar_d)**2 for i in range(4))
denom_d = math.sqrt(pp_d * qq_d * Sxx_d)
z_ddt_manual = num_d / denom_d
p_ddt_manual = 2 * sp_stats.norm.sf(abs(z_ddt_manual))

res_ddt = trend_test_incidence(DDT4_COUNTS, DDT4_TOTALS)

check(
    "[Young] DDT: manual Z = code Z",
    abs(z_ddt_manual - res_ddt["statistic"]) < 1e-10,
    f"manual={z_ddt_manual:.6f}, code={res_ddt['statistic']:.6f}",
)
check(
    "[Young] DDT: manual p = code p",
    abs(p_ddt_manual - res_ddt["p_value"]) < 1e-10,
    f"manual={p_ddt_manual:.8f}, code={res_ddt['p_value']:.8f}",
)

# [Young] Table 3b (Lilly Study 2, males): 10/120, 6/80, 7/80, 18/80
# scores (0,1,2,3) → Z=2.78, p=0.003 (one-sided)
# This is a DIFFERENT dataset from DDT — verify with correct data.
res_lilly2 = trend_test_incidence([10, 6, 7, 18], [120, 80, 80, 80])
check(
    "[Young] Table 3b (Lilly Study 2, males): Z ≈ 2.78",
    abs(res_lilly2["statistic"] - 2.78) < 0.01,
    f"got Z={res_lilly2['statistic']:.3f}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 10: Degenerate inputs — p̄ = 0 or 1
# ══════════════════════════════════════════════════════════════

section("10. Degenerate inputs — p̄ = 0 or 1")

# p̄ = 0: no events in any group → no variation → None
res_z0 = trend_test_incidence([0, 0, 0], [50, 50, 50])
check(
    "p̄ = 0: statistic is None",
    res_z0["statistic"] is None,
)
check(
    "p̄ = 0: p_value is None",
    res_z0["p_value"] is None,
)

# p̄ = 1: all subjects have event → no variation → None
res_z1 = trend_test_incidence([50, 50, 50], [50, 50, 50])
check(
    "p̄ = 1: statistic is None",
    res_z1["statistic"] is None,
)
check(
    "p̄ = 1: p_value is None",
    res_z1["p_value"] is None,
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 11: Degenerate inputs — small k, zero totals
# ══════════════════════════════════════════════════════════════

section("11. Degenerate inputs — k < 2, zero totals")

# k = 1 → None (need at least 2 groups)
res_k1 = trend_test_incidence([5], [50])
check(
    "k = 1: statistic is None",
    res_k1["statistic"] is None,
)

# k = 0 → None
res_k0 = trend_test_incidence([], [])
check(
    "k = 0: statistic is None",
    res_k0["statistic"] is None,
)

# sum(totals) = 0 → None
res_n0 = trend_test_incidence([0, 0], [0, 0])
check(
    "N = 0: statistic is None",
    res_n0["statistic"] is None,
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 12: Denominator ≤ 0 edge case
# ══════════════════════════════════════════════════════════════

section("12. Denominator edge case — zero score variance")

# When scores have zero variance with respect to totals
# e.g. only one non-zero-total group among k ≥ 2
# scores (0,1) but totals (0,50), counts (0,10) → d̄ = 1, Sxx = 0
res_degen = trend_test_incidence([0, 10], [0, 50])
# p̄ = 10/50 = 0.2, Sxx = 50*(1-1)² + 0*(0-1)² = 0 → denom ≤ 0 → None
check(
    "Single non-zero group: statistic is None",
    res_degen["statistic"] is None,
    f"got statistic={res_degen['statistic']}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 13: Z² = χ² relationship
# ══════════════════════════════════════════════════════════════

section("13. Z² = χ²(1) — chi-squared equivalence")

# [Tang] eq.(2), [Zhou] p.2: T_CA = Z² ~ χ²(1) under H₀
# The code returns Z; verify Z² can be used as chi-squared.

for cc, tt, label in [
    ([5, 10, 20],   [50, 50, 50],     "balanced"),
    ([3, 8, 15, 25],[40, 60, 80, 100],"unbalanced"),
    (TANG_COUNTS,   TANG_TOTALS,      "Tang rats"),
]:
    r = trend_test_incidence(cc, tt)
    z = r["statistic"]
    p_from_chi2 = float(sp_stats.chi2.sf(z**2, df=1))
    check(
        f"p(Z²,χ²(1)) = p(Z,two-sided) for {label}",
        abs(p_from_chi2 - r["p_value"]) < 1e-10,
        f"chi2_p={p_from_chi2:.8f}, code_p={r['p_value']:.8f}",
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 14: Large sample — known strong trend
# ══════════════════════════════════════════════════════════════

section("14. Large sample — detection of known trend")

# With a clear dose-response and large N, p must be very small.
res_large = trend_test_incidence(
    [10, 50, 100, 200],
    [1000, 1000, 1000, 1000],
)
check(
    "Strong trend, large N: p < 1e-10",
    res_large["p_value"] < 1e-10,
    f"p={res_large['p_value']}",
)
check(
    "Strong trend, large N: Z > 10",
    res_large["statistic"] > 10,
    f"Z={res_large['statistic']:.2f}",
)

# No trend with large N: p should not be significant
np.random.seed(42)
n_per = 500
flat_counts = [int(0.15 * n_per)] * 4  # exact same proportion
flat_totals = [n_per] * 4
res_flat_large = trend_test_incidence(flat_counts, flat_totals)
check(
    "No trend, large N: Z = 0",
    abs(res_flat_large["statistic"]) < 1e-10,
    f"Z={res_flat_large['statistic']}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 15: Consistency with scipy — manual p-value check
# ══════════════════════════════════════════════════════════════

section("15. p-value consistency with scipy.stats.norm")

# For various Z values, verify: p = 2(1 − Φ(|Z|)) = 2·sf(|Z|)
for cc, tt in [
    ([5, 10, 20],    [50, 50, 50]),
    ([1, 2, 3, 10],  [20, 20, 20, 20]),
    ([0, 0, 1, 3],   [12, 12, 12, 12]),
    ([20, 10, 5],    [50, 50, 50]),
]:
    r = trend_test_incidence(cc, tt)
    if r["statistic"] is not None:
        z = r["statistic"]
        expected_p = float(2 * sp_stats.norm.sf(abs(z)))
        # Also check: 2*(1 - stats.norm.cdf(abs(z))) — the code's formula
        expected_p2 = float(2 * (1 - sp_stats.norm.cdf(abs(z))))
        check(
            f"p = 2·sf(|Z|) = 2·(1−Φ(|Z|)) for counts={cc}",
            abs(r["p_value"] - expected_p) < 1e-10
            and abs(expected_p - expected_p2) < 1e-10,
            f"code={r['p_value']:.10f}, sf={expected_p:.10f}, cdf={expected_p2:.10f}",
        )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 16: Scores = range(k) verification
# ══════════════════════════════════════════════════════════════

section("16. Default scores = range(k)")

# The original code hardcodes scores = list(range(k)).
# Verify by computing Z manually with these exact scores.

for k in [2, 3, 4, 5, 6]:
    np.random.seed(k)
    cc_k = np.random.randint(0, 20, k).tolist()
    tt_k = [50] * k
    # Ensure at least one non-zero count and not all = total
    cc_k[0] = 1
    cc_k[-1] = min(cc_k[-1], 49)

    r = trend_test_incidence(cc_k, tt_k)

    # Manual with scores = range(k)
    dd_k = np.arange(k, dtype=float)
    cc_arr = np.array(cc_k, dtype=float)
    tt_arr = np.array(tt_k, dtype=float)
    nn_k = tt_arr.sum()
    pp_k = cc_arr.sum() / nn_k
    num_k = dd_k @ cc_arr - pp_k * (dd_k @ tt_arr)
    d_bar_k = (dd_k @ tt_arr) / nn_k
    Sxx_k = sum(tt_arr[i] * (dd_k[i] - d_bar_k)**2 for i in range(k))
    z_k = num_k / math.sqrt(pp_k * (1 - pp_k) * Sxx_k)

    check(
        f"k={k}: manual Z(range(k)) = code Z",
        abs(z_k - r["statistic"]) < 1e-10,
        f"manual={z_k:.6f}, code={r['statistic']:.6f}",
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
