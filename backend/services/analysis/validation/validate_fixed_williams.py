#!/usr/bin/env python3
"""Validation suite for williams-fixed.py

Every test case is traced to the original Williams papers:
  [1971] Williams DA. Biometrics 1971;27(1):103–117.
  [1972] Williams DA. Biometrics 1972;28(2):519–531.

Page numbers refer to the journal pagination (e.g. p.106 = Biometrics page 106).
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass

import importlib.util
from pathlib import Path

import numpy as np
from scipy import stats as sp_stats

# ── Import modules under test from parent directory ──
_parent = Path(__file__).resolve().parent.parent

_spec_wt = importlib.util.spec_from_file_location("williams_tables", _parent / "williams_tables.py")
_wt = importlib.util.module_from_spec(_spec_wt)
_spec_wt.loader.exec_module(_wt)
sys.modules["williams_tables"] = _wt  # so williams_fixed can "from williams_tables import ..."
lookup_1971 = _wt.lookup_1971
lookup_1972 = _wt.lookup_1972
WILLIAMS_1971_TABLE1_ALPHA005 = _wt.WILLIAMS_1971_TABLE1_ALPHA005
WILLIAMS_1971_TABLE2_ALPHA001 = _wt.WILLIAMS_1971_TABLE2_ALPHA001
WILLIAMS_1972_TABLE1_ALPHA0050 = _wt.WILLIAMS_1972_TABLE1_ALPHA0050
WILLIAMS_1972_TABLE2_ALPHA0025 = _wt.WILLIAMS_1972_TABLE2_ALPHA0025
WILLIAMS_1972_TABLE3_ALPHA0010 = _wt.WILLIAMS_1972_TABLE3_ALPHA0010
WILLIAMS_1972_TABLE4_ALPHA0005 = _wt.WILLIAMS_1972_TABLE4_ALPHA0005

_spec_wf = importlib.util.spec_from_file_location("williams_fixed", _parent / "williams_fixed.py")
wf = importlib.util.module_from_spec(_spec_wf)
sys.modules["williams_fixed"] = wf  # register before exec so @dataclass can resolve module
_spec_wf.loader.exec_module(wf)


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
# TEST GROUP 1: PAVA algorithm
# ══════════════════════════════════════════════════════════════

section("1. PAVA — Pool-Adjacent-Violators Algorithm")

# ── 1.1  Numerical example from [1971] Section 2, p.106 ──
# "x0=10.4, x1=9.9, x2=10.0, x3=10.6, x4=11.4, x5=11.9, x6=11.7"
# PAVA (increasing) on all 7 gives:
#   M̄0=M̄1=M̄2=10.1, M̄3=10.6, M̄4=11.4, M̄5=M̄6=11.8
# But for the fixed code, PAVA is on dose groups only (1..6):
#   [9.9, 10.0, 10.6, 11.4, 11.8, 11.8]

x_1971 = np.array([10.4, 9.9, 10.0, 10.6, 11.4, 11.9, 11.7])
w_1971 = np.ones(7)

# [1971] Section 2, p.105-106: PAVA on all groups including control
pava_all = wf.pava_increasing(x_1971, w_1971)
expected_all = np.array([10.1, 10.1, 10.1, 10.6, 11.4, 11.8, 11.8])
check(
    "[1971] §2 p.106: PAVA on all groups matches paper",
    np.allclose(pava_all, expected_all, atol=0.05),
    f"got {pava_all}, expected {expected_all}"
)

# [1971] §2, p.106: "M̄5 = M̄6 = X5,6 = ½(X5+X6) = 11.8"
check(
    "[1971] §2 p.106: M̄5 = M̄6 = 11.8",
    abs(pava_all[5] - 11.8) < 0.01 and abs(pava_all[6] - 11.8) < 0.01,
)

# [1971] §2, p.106: "M̄0 = M̄1 = M̄2 = X0,1,2 = ⅓(2·10.15 + 10.0) = 10.1"
check(
    "[1971] §2 p.106: M̄0 = M̄1 = M̄2 = 10.1",
    all(abs(pava_all[j] - 10.1) < 0.05 for j in [0, 1, 2]),
)

# ── 1.2  PAVA on dose groups only → used for test statistics ──
pava_doses = wf.pava_increasing(x_1971[1:], w_1971[1:])
check(
    "[1971] §2: PAVA doses-only: M̄6 = 11.8 (same as full)",
    abs(pava_doses[5] - 11.8) < 0.01,
    f"got {pava_doses[5]}"
)

# ── 1.3  Trivial monotone input: no pooling needed ──
x_mono = np.array([1.0, 2.0, 3.0, 4.0])
check(
    "PAVA: already monotone → unchanged",
    np.allclose(wf.pava_increasing(x_mono, np.ones(4)), x_mono),
)

# ── 1.4  Constant input ──
x_const = np.array([5.0, 5.0, 5.0])
check(
    "PAVA: constant input → unchanged",
    np.allclose(wf.pava_increasing(x_const, np.ones(3)), x_const),
)

# ── 1.5  Fully reversed input ──
x_rev = np.array([4.0, 3.0, 2.0, 1.0])
expected_rev = np.full(4, 2.5)
check(
    "PAVA: fully reversed → global mean",
    np.allclose(wf.pava_increasing(x_rev, np.ones(4)), expected_rev),
)

# ── 1.6  Decreasing PAVA: [1972] Section 7, p.530 ──
# "m̂1=X1=52.7, m̂2=m̂3=(9·45.2+10·47.1)/19=46.2, m̂4=m̂5=(10·44.8+8·46.6)/18=45.6"
x_1972_doses = np.array([52.7, 45.2, 47.1, 44.8, 46.6])
w_1972_doses = np.array([10.0, 9.0, 10.0, 10.0, 8.0])
pava_dec = wf.pava_decreasing(x_1972_doses, w_1972_doses)
expected_dec = np.array([52.7, 46.2, 46.2, 45.6, 45.6])
check(
    "[1972] §7 p.530: PAVA decreasing on dose groups",
    np.allclose(pava_dec, expected_dec, atol=0.05),
    f"got {np.round(pava_dec, 2)}, expected {expected_dec}"
)

# ── 1.7  [1972] §7 p.530: exact pooled values ──
m23_exact = (9 * 45.2 + 10 * 47.1) / 19  # = 46.2
m45_exact = (10 * 44.8 + 8 * 46.6) / 18   # = 45.6
check(
    "[1972] §7 p.530: m̂2=m̂3 = (9×45.2+10×47.1)/19 = 46.2",
    abs(pava_dec[1] - m23_exact) < 0.01 and abs(pava_dec[2] - m23_exact) < 0.01,
    f"got {pava_dec[1]:.4f}, expected {m23_exact:.4f}"
)
check(
    "[1972] §7 p.530: m̂4=m̂5 = (10×44.8+8×46.6)/18 = 45.6",
    abs(pava_dec[3] - m45_exact) < 0.01 and abs(pava_dec[4] - m45_exact) < 0.01,
    f"got {pava_dec[3]:.4f}, expected {m45_exact:.4f}"
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 2: Test statistic computation
# ══════════════════════════════════════════════════════════════

section("2. Test statistic formula")

# ── 2.1  [1971] §2, p.106: t̄ = (11.8 - 10.4) / 0.538 = 2.60 ──
# "s² = 1.16", "√(2s²/r) = √0.29 = 0.538"
s2_1971 = 1.16
r_1971 = 8
se_1971 = math.sqrt(2 * s2_1971 / r_1971)
t_stat_1971 = (11.8 - 10.4) / se_1971
check(
    "[1971] §2 p.106: √(2s²/r) = √0.29 = 0.538",
    abs(se_1971 - 0.538) < 0.001,
    f"got {se_1971:.4f}"
)
check(
    "[1971] §2 p.106: t̄ = (11.8 - 10.4)/0.538 = 2.60",
    abs(t_stat_1971 - 2.60) < 0.01,
    f"got {t_stat_1971:.4f}"
)

# ── 2.2  [1972] §7, p.530: all five test statistics ──
# "t̄1 = -1.40, t̄2 = 2.02, t̄3 = 2.09, t̄4 = 2.42, t̄5 = 2.24"
x0_1972 = 50.1
s2_1972 = 22.28
c_1972 = 18
r_vals = [10, 9, 10, 10, 8]
m_hat = [52.7, m23_exact, m23_exact, m45_exact, m45_exact]
expected_t = [-1.40, 2.02, 2.09, 2.42, 2.24]

for idx in range(5):
    se_i = math.sqrt(s2_1972 / r_vals[idx] + s2_1972 / c_1972)
    t_i = (x0_1972 - m_hat[idx]) / se_i
    check(
        f"[1972] §7 p.530: t̄{idx+1} = {expected_t[idx]:.2f}",
        abs(t_i - expected_t[idx]) < 0.01,
        f"got {t_i:.4f}"
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 3: Critical value tables — Williams (1971)
# ══════════════════════════════════════════════════════════════

section("3. Critical values — Williams (1971) Tables 1 & 2")

# ── 3.1  Spot checks from the numerical example ──
# [1971] §2, p.106: "t̄_{6,0.05} = 1.81 and t̄_{6,0.01} = 2.50 for v = 42"
# Note: v=42 → table rounds down to v=40
check(
    "[1971] §2 p.106: t̄_{6,0.05} for v=42 = 1.81",
    lookup_1971(6, 42, 0.05) == 1.81,
    f"got {lookup_1971(6, 42, 0.05)}"
)
check(
    "[1971] §2 p.106: t̄_{6,0.01} for v=42 = 2.50",
    lookup_1971(6, 42, 0.01) == 2.50,
    f"got {lookup_1971(6, 42, 0.01)}"
)

# ── 3.2  [1971] §5, p.117: step-down critical values ──
# "t̄_{6,0.05}=1.81, t̄_{5,0.05}=1.80, t̄_{4,0.05}=1.80, t̄_{3,0.05}=1.79"
step_down_cvs = {6: 1.81, 5: 1.80, 4: 1.80, 3: 1.79}
for k_val, expected_cv in step_down_cvs.items():
    cv = lookup_1971(k_val, 42, 0.05)
    check(
        f"[1971] §5 p.117: t̄_{{{k_val},0.05}} for v=42 = {expected_cv}",
        abs(cv - expected_cv) < 0.005,
        f"got {cv}"
    )

# ── 3.3  Table 1 boundary values (p.107) ──
# [1971] Table 1, p.107: k=1, v=∞ → 1.645 (matches normal z_{0.05})
check(
    "[1971] Table 1 p.107: k=1, v=∞, α=0.05 → 1.645",
    lookup_1971(1, float('inf'), 0.05) == 1.645,
)

# [1971] Table 1, p.107: k=10, v=5 → 2.25
check(
    "[1971] Table 1 p.107: k=10, v=5, α=0.05 → 2.25",
    lookup_1971(10, 5, 0.05) == 2.25,
)

# [1971] Table 1, p.107: k=1, v=5 → 2.02 (Student's t one-sided 5%)
check(
    "[1971] Table 1 p.107: k=1, v=5, α=0.05 → 2.02",
    lookup_1971(1, 5, 0.05) == 2.02,
)

# ── 3.4  Table 2 boundary values (p.108) ──
# [1971] Table 2, p.108: k=1, v=∞ → 2.326 (normal z_{0.01})
check(
    "[1971] Table 2 p.108: k=1, v=∞, α=0.01 → 2.326",
    lookup_1971(1, float('inf'), 0.01) == 2.326,
)

# [1971] Table 2, p.108: k=2, v=5 → 3.50
check(
    "[1971] Table 2 p.108: k=2, v=5, α=0.01 → 3.50",
    lookup_1971(2, 5, 0.01) == 3.50,
)

# ── 3.5  [1971] §3, p.109: critical values increase little for k > 5 ──
# "the critical values are seen to increase very little as k is increased from k=5 to k=10"
for v in [10, 20, 60]:
    cv5 = lookup_1971(5, v, 0.05)
    cv10 = lookup_1971(10, v, 0.05)
    diff = cv10 - cv5
    check(
        f"[1971] §3 p.109: k=10 vs k=5 at v={v}: diff = {diff:.2f} ≤ 0.02",
        diff <= 0.02,
        f"cv5={cv5}, cv10={cv10}, diff={diff}"
    )

# ── 3.6  Full table integrity: monotonicity in k (for fixed v) ──
# Critical values must be non-decreasing in k for fixed v
for v in [5, 10, 20, 60, 120]:
    for alpha in [0.05, 0.01]:
        vals = [lookup_1971(k, v, alpha) for k in range(1, 11)]
        monotone = all(vals[j] <= vals[j+1] + 0.001 for j in range(len(vals)-1))
        check(
            f"[1971] Table monotonicity: v={v}, α={alpha}: non-decreasing in k",
            monotone,
            f"values: {vals}"
        )

# ── 3.7  Full table integrity: monotonicity in v (for fixed k) ──
# Critical values must be non-increasing in v for fixed k
df_list = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
           22, 24, 26, 28, 30, 35, 40, 60, 120]
for k in [1, 5, 10]:
    for alpha in [0.05, 0.01]:
        vals = [lookup_1971(k, v, alpha) for v in df_list]
        monotone = all(vals[j] >= vals[j+1] - 0.001 for j in range(len(vals)-1))
        check(
            f"[1971] Table monotonicity: k={k}, α={alpha}: non-increasing in v",
            monotone,
            f"values: {vals}"
        )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 4: Critical value tables — Williams (1972)
# ══════════════════════════════════════════════════════════════

section("4. Critical values — Williams (1972) Tables 1–4")

# ── 4.1  [1972] §7, p.530: extrapolation formula examples ──
# "t̄_{2,0.025} = 2.060 - 0.03(1 - √(9/18)) = 2.05"
cv = lookup_1972(2, 60, 0.025, w=18/9)
check(
    "[1972] §7 p.530: t̄_{2,0.025}(w=18/9) ≈ 2.05",
    abs(cv - 2.05) < 0.02,
    f"got {cv}"
)

# "t̄_{3,0.025} = 2.078 - 0.04(1 - √(10/18)) = 2.06"
cv = lookup_1972(3, 60, 0.025, w=18/10)
check(
    "[1972] §7 p.530: t̄_{3,0.025}(w=18/10) ≈ 2.06",
    abs(cv - 2.06) < 0.02,
    f"got {cv}"
)

# "t̄_{4,0.025} = 2.087 - 0.05(1 - √(10/18)) = 2.07"
cv = lookup_1972(4, 60, 0.025, w=18/10)
check(
    "[1972] §7 p.530: t̄_{4,0.025}(w=18/10) ≈ 2.07",
    abs(cv - 2.07) < 0.02,
    f"got {cv}"
)

# "t̄_{5,0.025} = 2.092 - 0.06(1 - √(8/18)) = 2.06"
cv = lookup_1972(5, 60, 0.025, w=18/8)
check(
    "[1972] §7 p.530: t̄_{5,0.025}(w=18/8) ≈ 2.06",
    abs(cv - 2.06) < 0.02,
    f"got {cv}"
)

# ── 4.2  [1972] Table 1, p.522: spot checks at w=1 ──
# i=6, v=∞, α=0.050 → 1.760
check(
    "[1972] Table 1 p.522: i=6, v=∞, α=0.050, w=1 → 1.760",
    lookup_1972(6, float('inf'), 0.050, 1.0) == 1.760,
    f"got {lookup_1972(6, float('inf'), 0.050, 1.0)}"
)

# ── 4.3  [1972] Table 3, p.524: i=2, v=5, α=0.010 → 3.501 ──
check(
    "[1972] Table 3 p.524: i=2, v=5, α=0.010, w=1 → 3.501",
    lookup_1972(2, 5, 0.010, 1.0) == 3.501,
    f"got {lookup_1972(2, 5, 0.010, 1.0)}"
)

# ── 4.4  [1972] Table 4, p.525: i=10, v=∞, α=0.005 → 2.623 ──
check(
    "[1972] Table 4 p.525: i=10, v=∞, α=0.005, w=1 → 2.623",
    lookup_1972(10, float('inf'), 0.005, 1.0) == 2.623,
    f"got {lookup_1972(10, float('inf'), 0.005, 1.0)}"
)

# ── 4.5  1972 w=1 values must agree with 1971 tables ──
# For α=0.05 and α=0.01, the 1972 tables at w=1 should match 1971.
# 1972 dose levels: 2,3,4,5,6,8,10
# 1971 k values:    1,2,3,4,5,6,7,8,9,10
n_compared = 0
n_matched = 0
for i_1972 in [2, 3, 4, 5, 6, 8, 10]:
    for v in [5, 10, 20, 60, float('inf')]:
        for alpha_1971, alpha_1972 in [(0.05, 0.050), (0.01, 0.010)]:
            v1971 = lookup_1971(i_1972, v, alpha_1971)
            v1972 = lookup_1972(i_1972, v, alpha_1972, 1.0)
            n_compared += 1
            # 1971 tables: 2 decimal places; 1972 tables: 3 decimal places.
            # Tolerance 0.006 accounts for rounding in 1971 (e.g. 1.807 → 1.81).
            if abs(v1971 - v1972) < 0.006:
                n_matched += 1
check(
    "[1971/1972] Cross-check: 1972 w=1 ≈ 1971 for matching (i, v, α)",
    n_matched == n_compared,
    f"{n_matched}/{n_compared} matched"
)

# ── 4.6  Extrapolation: w > 1 must give lower critical values ──
# [1972] §2, p.521: "the value of t̄_{i,α} decreases as the ratio w = c/r increases"
for i in [2, 5, 10]:
    for alpha in [0.050, 0.010]:
        cv1 = lookup_1972(i, 20, alpha, 1.0)
        cv2 = lookup_1972(i, 20, alpha, 2.0)
        cv4 = lookup_1972(i, 20, alpha, 4.0)
        check(
            f"[1972] §2 p.521: cv decreases with w: i={i}, α={alpha}",
            cv1 >= cv2 >= cv4,
            f"w=1:{cv1}, w=2:{cv2}, w=4:{cv4}"
        )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 5: williams_test() — full integration
# ══════════════════════════════════════════════════════════════

section("5. williams_test() — integration with paper examples")

# ── 5.1  [1971] §2+§5, p.106-117: Complete example ──
# k=6 dose levels, r=8, s²=1.16, v=42 (RBD, but code uses CRD df=49)
# MED = dose 4
means_1971 = np.array([10.4, 9.9, 10.0, 10.6, 11.4, 11.9, 11.7])
ns_1971 = np.array([8, 8, 8, 8, 8, 8, 8])
sds_1971 = np.full(7, math.sqrt(1.16))
labels_1971 = [str(i) for i in range(7)]

out_1971 = wf.williams_test(means_1971, sds_1971, ns_1971, labels_1971,
                             direction="increase", alpha=0.05)

check(
    "[1971] §5 p.117: MED = dose 4",
    out_1971.minimum_effective_dose == "4",
    f"got MED = {out_1971.minimum_effective_dose}"
)
check(
    "[1971] §5 p.117: doses 6,5,4 significant, dose 3 not",
    len(out_1971.step_down_results) == 4
    and all(r.significant for r in out_1971.step_down_results[:3])
    and not out_1971.step_down_results[3].significant,
)

# [1971] §2 p.106: t̄6 = 2.60
check(
    "[1971] §2 p.106: t̄6 ≈ 2.60",
    abs(out_1971.step_down_results[0].test_statistic - 2.60) < 0.01,
    f"got {out_1971.step_down_results[0].test_statistic}"
)

# [1971] §5 p.117: t̄3 = 0.37
check(
    "[1971] §5 p.117: t̄3 ≈ 0.37",
    abs(out_1971.step_down_results[3].test_statistic - 0.37) < 0.01,
    f"got {out_1971.step_down_results[3].test_statistic}"
)

# ── 5.2  [1972] §7, p.530: Complete example ──
# k=5, two-sided 5% → one-sided α=0.025, direction=decrease
# MED = dose 3 (original procedure)
means_1972 = np.array([50.1, 52.7, 45.2, 47.1, 44.8, 46.6])
ns_1972 = np.array([18, 10, 9, 10, 10, 8])
sds_1972 = np.full(6, math.sqrt(22.28))
labels_1972 = [str(i) for i in range(6)]

out_1972 = wf.williams_test(means_1972, sds_1972, ns_1972, labels_1972,
                             direction="decrease", alpha=0.025)

check(
    "[1972] §7 p.530: constrained means match paper",
    np.allclose([r for r in out_1972.constrained_means],
                [50.1, 52.7, 46.2, 46.2, 45.6, 45.6], atol=0.05),
    f"got {out_1972.constrained_means}"
)

check(
    "[1972] §7 p.530: MED = dose 3 (original procedure)",
    out_1972.minimum_effective_dose == "3",
    f"got MED = {out_1972.minimum_effective_dose}"
)

# [1972] §7 p.530: t̄5=2.24, t̄4=2.42, t̄3=2.09, t̄2=2.02
expected_stats_1972 = {5: 2.24, 4: 2.42, 3: 2.09, 2: 2.02}
for r in out_1972.step_down_results:
    if r.dose_index in expected_stats_1972:
        exp = expected_stats_1972[r.dose_index]
        check(
            f"[1972] §7 p.530: t̄{r.dose_index} ≈ {exp:.2f}",
            abs(r.test_statistic - exp) < 0.02,
            f"got {r.test_statistic:.4f}"
        )

# [1972] §7 p.530: "t̄2 < t̄_{2,α} → not significant at dose 2"
dose2_result = [r for r in out_1972.step_down_results if r.dose_index == 2]
if dose2_result:
    check(
        "[1972] §7 p.530: dose 2 not significant (original procedure)",
        not dose2_result[0].significant,
        f"t̄2={dose2_result[0].test_statistic:.4f}, cv={dose2_result[0].critical_value:.4f}"
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 6: Edge cases and special values
# ══════════════════════════════════════════════════════════════

section("6. Edge cases and special values")

# ── 6.1  k=1: must reduce to Student's t ──
# [1971] Table 1, p.107: k=1 column = Student's t one-sided
means_k1 = np.array([10.0, 12.0])
sds_k1 = np.array([1.0, 1.0])
ns_k1 = np.array([10, 10])
out_k1 = wf.williams_test(means_k1, sds_k1, ns_k1, ["0", "1"], "increase", 0.05)
student_cv = float(sp_stats.t.ppf(0.95, 18))
check(
    "[1971] Table 1: k=1 → Student's t critical value",
    abs(out_k1.step_down_results[0].critical_value - student_cv) < 0.001,
    f"got {out_k1.step_down_results[0].critical_value}, expected {student_cv:.4f}"
)

# ── 6.2  No effect: all means equal → no significance ──
means_null = np.array([10.0, 10.0, 10.0, 10.0])
sds_null = np.array([1.0, 1.0, 1.0, 1.0])
ns_null = np.array([10, 10, 10, 10])
out_null = wf.williams_test(means_null, sds_null, ns_null,
                             ["0", "1", "2", "3"], "increase", 0.05)
check(
    "No effect: all means equal → MED is None",
    out_null.minimum_effective_dose is None,
)

# ── 6.3  Strong effect: all doses clearly above control ──
means_strong = np.array([0.0, 5.0, 10.0, 15.0])
sds_strong = np.array([1.0, 1.0, 1.0, 1.0])
ns_strong = np.array([20, 20, 20, 20])
out_strong = wf.williams_test(means_strong, sds_strong, ns_strong,
                               ["0", "1", "2", "3"], "increase", 0.05)
check(
    "Strong effect: all doses significant → MED = dose 1",
    out_strong.minimum_effective_dose == "1",
    f"got {out_strong.minimum_effective_dose}"
)
check(
    "Strong effect: all_groups_tested = True",
    out_strong.all_groups_tested,
)

# ── 6.4  Auto-detect direction ──
means_dec = np.array([50.0, 45.0, 40.0])
out_auto = wf.williams_test(means_dec, np.array([2., 2., 2.]),
                             np.array([10, 10, 10]), ["0", "1", "2"],
                             direction="auto", alpha=0.05)
check(
    "Auto-detect: highest dose < control → direction = 'decrease'",
    out_auto.direction == "decrease",
)

means_inc = np.array([10.0, 12.0, 15.0])
out_auto2 = wf.williams_test(means_inc, np.array([2., 2., 2.]),
                              np.array([10, 10, 10]), ["0", "1", "2"],
                              direction="auto", alpha=0.05)
check(
    "Auto-detect: highest dose > control → direction = 'increase'",
    out_auto2.direction == "increase",
)

# ── 6.5  Insufficient data: k < 1 or df < 1 ──
out_tiny = wf.williams_test(np.array([1.0]), np.array([1.0]),
                             np.array([5]), ["0"], alpha=0.05)
check(
    "Edge: single group → no results",
    len(out_tiny.step_down_results) == 0 and out_tiny.minimum_effective_dose is None,
)

# ── 6.6  Convenience wrappers ──
dose_groups = [
    {"label": "0", "mean": 10.0, "sd": 1.0, "n": 10},
    {"label": "1", "mean": 11.0, "sd": 1.0, "n": 10},
    {"label": "2", "mean": 13.0, "sd": 1.0, "n": 10},
]
out_wrapper = wf.williams_from_dose_groups(dose_groups, alpha=0.05)
check(
    "williams_from_dose_groups: returns valid output",
    out_wrapper is not None and out_wrapper.direction in ("increase", "decrease"),
)

group_stats = [
    {"dose_level": 0, "mean": 10.0, "sd": 1.0, "n": 10},
    {"dose_level": 100, "mean": 11.0, "sd": 1.0, "n": 10},
    {"dose_level": 200, "mean": 13.0, "sd": 1.0, "n": 10},
]
out_gs = wf.williams_from_group_stats(group_stats, alpha=0.05)
check(
    "williams_from_group_stats: returns valid output, sorted by dose_level",
    out_gs is not None and out_gs.direction in ("increase", "decrease"),
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
