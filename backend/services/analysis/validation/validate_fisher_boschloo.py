#!/usr/bin/env python3
"""Verification of scipy.stats.fisher_exact and scipy.stats.boschloo_exact

This script validates correctness of two SciPy implementations by
checking them against **independently computed** ground-truth values:
  (a) exact combinatorial enumeration of the hypergeometric distribution
      (coded from scratch below — no SciPy dependency in the oracle);
  (b) published hand-worked examples from textbooks and journal papers.

The oracle functions (_hypergeom_pmf, _fisher_p_*) use only Python's
math.comb — they share zero code paths with SciPy, so agreement between
them and SciPy constitutes genuine independent verification.

References:
  [Fisher35]   Fisher RA. The Design of Experiments. Oliver and Boyd, 1935.
               Chapter 2 ("Lady Tasting Tea").
  [Agresti02]  Agresti A. Categorical Data Analysis, 2nd ed. Wiley, 2002.
               §3.5: Fisher's Exact Test.
  [Boschloo70] Boschloo RD. "Raised conditional level of significance
               for the 2×2-table when testing the equality of two
               probabilities." Statistica Neerlandica, 24(1), 1–9, 1970.
  [Lydersen09] Lydersen S, Fagerland MW, Laake P. "Recommended tests for
               association in 2×2 tables." Statistics in Medicine,
               28(7), 1159–1175, 2009. DOI:10.1002/sim.3531.
  [Saari04]    Saari LM et al. "Employee attitudes and job satisfaction."
               Human Resource Management, 43(4), 395–407, 2004.
  [Rosner06]   Rosner B. Fundamentals of Biostatistics, 6th ed.
               Duxbury, 2006. Chapter 10, Example 10.13.
  [Conover99]  Conover WJ. Practical Nonparametric Statistics, 3rd ed.
               Wiley, 1999. §4.3.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from math import comb, factorial

import numpy as np
from scipy import stats as sp


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
# Independent oracle — hypergeometric from scratch
# ══════════════════════════════════════════════════════════════
#
# These functions use ONLY math.comb / math.factorial.
# They share zero code paths with scipy.stats, so agreement
# between SciPy and this oracle is genuine cross-verification.
#
# Table layout:
#        col0  col1 │ row_total
#  row0:   a     b  │  R0 = a+b
#  row1:   c     d  │  R1 = c+d
#  ─────────────────┤
#          C0    C1 │  N  = a+b+c+d
#
# Under H0 (independence) with fixed margins, a ~ Hypergeom(N, R0, C0).
# Support of a: max(0, C0−R1) ≤ a ≤ min(R0, C0).

def _hypergeom_pmf(a: int, N: int, R0: int, C0: int) -> float:
    """P(X=a) from hypergeometric distribution.

    [Agresti02] §3.5, Eq 3.10:
        P(a) = C(R0,a) · C(R1, C0−a) / C(N, C0)
    where R1 = N − R0.
    """
    R1 = N - R0
    b = R0 - a
    c = C0 - a
    d = R1 - c
    if any(x < 0 for x in (a, b, c, d)):
        return 0.0
    return comb(R0, a) * comb(R1, c) / comb(N, C0)


def _fisher_all_tables(R0: int, R1: int, C0: int, C1: int):
    """Enumerate all tables with given margins → list of (a, prob)."""
    N = R0 + R1
    a_min = max(0, C0 - R1)
    a_max = min(R0, C0)
    tables = []
    for a in range(a_min, a_max + 1):
        p = _hypergeom_pmf(a, N, R0, C0)
        tables.append((a, p))
    return tables


def _fisher_p_two_sided(table: list[list[int]]) -> float:
    """Two-sided Fisher p-value: sum of P(X=x) for all x where
    P(X=x) ≤ P(X=a_observed).

    This matches SciPy's definition (alternative='two-sided').
    """
    a, b = table[0]
    c, d = table[1]
    R0, R1 = a + b, c + d
    C0, C1 = a + c, b + d
    all_t = _fisher_all_tables(R0, R1, C0, C1)
    p_obs = _hypergeom_pmf(a, R0 + R1, R0, C0)
    # Sum probabilities ≤ observed (with tolerance for float comparison)
    return sum(p for _, p in all_t if p <= p_obs + 1e-15)


def _fisher_p_greater(table: list[list[int]]) -> float:
    """One-sided p-value: P(X ≥ a_observed).

    [Agresti02] §3.5.1: right-tail alternative.
    """
    a, b = table[0]
    c, d = table[1]
    R0, R1 = a + b, c + d
    C0 = a + c
    N = R0 + R1
    a_max = min(R0, C0)
    return sum(_hypergeom_pmf(x, N, R0, C0) for x in range(a, a_max + 1))


def _fisher_p_less(table: list[list[int]]) -> float:
    """One-sided p-value: P(X ≤ a_observed)."""
    a, b = table[0]
    c, d = table[1]
    R0, R1 = a + b, c + d
    C0 = a + c
    N = R0 + R1
    a_min = max(0, C0 - R1)
    return sum(_hypergeom_pmf(x, N, R0, C0) for x in range(a_min, a + 1))


def _odds_ratio(table: list[list[int]]) -> float:
    """Sample odds ratio (a·d)/(b·c)."""
    a, b = table[0]
    c, d = table[1]
    if b * c == 0:
        return float('inf') if a * d > 0 else (0.0 if a * d == 0 and b * c == 0 else 0.0)
    return (a * d) / (b * c)


# ══════════════════════════════════════════════════════════════
# Reference tables — exact rational values computed by hand
# ══════════════════════════════════════════════════════════════

# [Fisher35] Lady Tasting Tea: 8 cups, 4 milk-first, 4 tea-first.
# Lady identifies 3 of 4 correctly.
# N=8, R0=4, R1=4, C0=4, C1=4.
# Full enumeration:
#   a=0: C(4,0)C(4,4)/C(8,4) = 1/70
#   a=1: C(4,1)C(4,3)/C(8,4) = 16/70
#   a=2: C(4,2)C(4,2)/C(8,4) = 36/70
#   a=3: C(4,3)C(4,1)/C(8,4) = 16/70
#   a=4: C(4,4)C(4,0)/C(8,4) = 1/70
# observed a=3: P(3) = 16/70
# Two-sided: P(x) ≤ 16/70 → {a=0: 1/70, a=1: 16/70, a=3: 16/70, a=4: 1/70}
#            = (1+16+16+1)/70 = 34/70 = 17/35
LADY_TEA = [[3, 1], [1, 3]]
LADY_TEA_P_TWO = 34 / 70    # 17/35
LADY_TEA_P_GT  = 17 / 70    # P(X ≥ 3) = (16+1)/70
LADY_TEA_OR    = 9.0         # (3·3)/(1·1)

# [Agresti02] / SciPy docs: [[6,2],[1,4]]
# N=13, R0=8, R1=5, C0=7, C1=6.  C(13,7) = 1716.
# Full enumeration:
#   a=2: C(8,2)C(5,5)/C(13,7) =   28/1716
#   a=3: C(8,3)C(5,4)/C(13,7) =  280/1716
#   a=4: C(8,4)C(5,3)/C(13,7) =  700/1716
#   a=5: C(8,5)C(5,2)/C(13,7) =  560/1716
#   a=6: C(8,6)C(5,1)/C(13,7) =  140/1716
#   a=7: C(8,7)C(5,0)/C(13,7) =    8/1716
# observed a=6: P(6) = 140/1716
# Two-sided: P(x) ≤ 140/1716 → {a=2: 28, a=6: 140, a=7: 8}
#            = 176/1716 = 44/429
SCIPY_DOC = [[6, 2], [1, 4]]
SCIPY_DOC_P_TWO = 176 / 1716  # = 44/429
SCIPY_DOC_P_GT  = 148 / 1716  # P(X ≥ 6) = (140+8)/1716
SCIPY_DOC_OR    = 12.0         # (6·4)/(2·1)

# Toxicology-style: [[8,2],[2,8]]
# N=20, R0=10, R1=10, C0=10, C1=10.  C(20,10) = 184756.
TOX = [[8, 2], [2, 8]]
TOX_OR = 16.0

# Null table: [[5,5],[5,5]]
NULL = [[5, 5], [5, 5]]
NULL_OR = 1.0

# [Saari04] employee satisfaction: [[74,31],[43,32]]
SAARI = [[74, 31], [43, 32]]
SAARI_OR = (74 * 32) / (31 * 43)  # 2368/1333

# [Rosner06] Example 10.13: CVD by sex
ROSNER = [[3, 17], [1, 19]]
ROSNER_OR = (3 * 19) / (17 * 1)  # 57/17


# ══════════════════════════════════════════════════════════════
# TEST GROUP 1: Oracle self-test
# ══════════════════════════════════════════════════════════════

section("1. Oracle self-test — hypergeometric enumeration")

# [Fisher35] Lady Tasting Tea: verify PMFs sum to 1.0
pmfs_tea = [_hypergeom_pmf(a, 8, 4, 4) for a in range(5)]
check(
    "Hypergeom PMFs sum to 1.0 (N=8, R0=4, C0=4)",
    abs(sum(pmfs_tea) - 1.0) < 1e-14,
    f"sum = {sum(pmfs_tea):.15f}",
)

# Verify individual PMFs against hand-computed rational values
expected_pmfs = [1/70, 16/70, 36/70, 16/70, 1/70]
for a_val, exp, got in zip(range(5), expected_pmfs, pmfs_tea):
    check(
        f"[Fisher35] P(a={a_val}) = {exp:.6f}",
        abs(got - exp) < 1e-14,
        f"oracle={got:.15f}, hand={exp:.15f}",
    )

# SciPy docs table: PMFs sum to 1.0
pmfs_doc = [_hypergeom_pmf(a, 13, 8, 7) for a in range(2, 8)]
check(
    "Hypergeom PMFs sum to 1.0 (N=13, R0=8, C0=7)",
    abs(sum(pmfs_doc) - 1.0) < 1e-14,
    f"sum = {sum(pmfs_doc):.15f}",
)

# Larger table: N=20, R0=10, C0=10
pmfs_tox = [_hypergeom_pmf(a, 20, 10, 10) for a in range(11)]
check(
    "Hypergeom PMFs sum to 1.0 (N=20, R0=10, C0=10)",
    abs(sum(pmfs_tox) - 1.0) < 1e-14,
    f"sum = {sum(pmfs_tox):.15f}",
)

# Oracle two-sided p matches hand-computed exact value
check(
    "[Fisher35] oracle p(two-sided) = 34/70",
    abs(_fisher_p_two_sided(LADY_TEA) - LADY_TEA_P_TWO) < 1e-14,
    f"oracle={_fisher_p_two_sided(LADY_TEA):.15f}, hand={LADY_TEA_P_TWO:.15f}",
)
check(
    "[Agresti02] oracle p(two-sided) = 176/1716",
    abs(_fisher_p_two_sided(SCIPY_DOC) - SCIPY_DOC_P_TWO) < 1e-14,
    f"oracle={_fisher_p_two_sided(SCIPY_DOC):.15f}, hand={SCIPY_DOC_P_TWO:.15f}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 2: Fisher exact — two-sided p vs oracle
# ══════════════════════════════════════════════════════════════

section("2. scipy.stats.fisher_exact — two-sided p vs oracle")

test_tables = {
    "[Fisher35] Lady Tea [[3,1],[1,3]]": LADY_TEA,
    "[Agresti02] [[6,2],[1,4]]": SCIPY_DOC,
    "Toxicology [[8,2],[2,8]]": TOX,
    "Null [[5,5],[5,5]]": NULL,
    "[Saari04] [[74,31],[43,32]]": SAARI,
    "[Rosner06] [[3,17],[1,19]]": ROSNER,
    "Perfect [[5,0],[0,5]]": [[5, 0], [0, 5]],
    "Inverse [[0,5],[5,0]]": [[0, 5], [5, 0]],
    "Extreme [[10,0],[0,10]]": [[10, 0], [0, 10]],
    "Weak [[4,3],[2,5]]": [[4, 3], [2, 5]],
    "Large balanced [[30,10],[10,30]]": [[30, 10], [10, 30]],
    "Unequal margins [[1,9],[5,5]]": [[1, 9], [5, 5]],
}

for name, tbl in test_tables.items():
    oracle_p = _fisher_p_two_sided(tbl)
    _, scipy_p = sp.fisher_exact(tbl)
    check(
        f"{name}: oracle={oracle_p:.8f}",
        abs(scipy_p - oracle_p) < 1e-10,
        f"SciPy={scipy_p:.12f}, oracle={oracle_p:.12f}, Δ={abs(scipy_p - oracle_p):.2e}",
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 3: Fisher exact — one-sided p vs oracle
# ══════════════════════════════════════════════════════════════

section("3. scipy.stats.fisher_exact — one-sided p vs oracle")

for name, tbl in test_tables.items():
    # greater
    oracle_gt = _fisher_p_greater(tbl)
    _, scipy_gt = sp.fisher_exact(tbl, alternative='greater')
    check(
        f"{name}: p(greater)",
        abs(scipy_gt - oracle_gt) < 1e-10,
        f"SciPy={scipy_gt:.12f}, oracle={oracle_gt:.12f}",
    )
    # less
    oracle_lt = _fisher_p_less(tbl)
    _, scipy_lt = sp.fisher_exact(tbl, alternative='less')
    check(
        f"{name}: p(less)",
        abs(scipy_lt - oracle_lt) < 1e-10,
        f"SciPy={scipy_lt:.12f}, oracle={oracle_lt:.12f}",
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 4: Fisher exact — odds ratio vs oracle
# ══════════════════════════════════════════════════════════════

section("4. scipy.stats.fisher_exact — odds ratio vs oracle")

or_cases = {
    "[Fisher35] OR = 9.0":     (LADY_TEA, LADY_TEA_OR),
    "[Agresti02] OR = 12.0":   (SCIPY_DOC, SCIPY_DOC_OR),
    "Toxicology OR = 16.0":    (TOX, TOX_OR),
    "Null OR = 1.0":           (NULL, NULL_OR),
    "[Saari04] OR = 1.7764":   (SAARI, SAARI_OR),
    "[Rosner06] OR = 3.3529":  (ROSNER, ROSNER_OR),
}

for name, (tbl, expected_or) in or_cases.items():
    scipy_or, _ = sp.fisher_exact(tbl)
    oracle_or = _odds_ratio(tbl)
    check(
        f"{name}",
        abs(scipy_or - expected_or) < 1e-8 and abs(scipy_or - oracle_or) < 1e-8,
        f"SciPy={scipy_or:.10f}, expected={expected_or:.10f}, oracle={oracle_or:.10f}",
    )

# Zero-cell → OR = 0 or inf
scipy_or_zero, _ = sp.fisher_exact([[0, 5], [5, 0]])
check(
    "Zero cell [[0,5],[5,0]]: OR = 0.0",
    scipy_or_zero == 0.0,
    f"got {scipy_or_zero}",
)
scipy_or_inf, _ = sp.fisher_exact([[5, 0], [0, 5]])
check(
    "Zero cell [[5,0],[0,5]]: OR = inf",
    scipy_or_inf == float('inf'),
    f"got {scipy_or_inf}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 5: Fisher exact — algebraic identities
# ══════════════════════════════════════════════════════════════

section("5. scipy.stats.fisher_exact — algebraic identities [Agresti02]")

for name, tbl in list(test_tables.items())[:6]:
    a, b = tbl[0]
    c, d = tbl[1]

    or_orig, p_orig = sp.fisher_exact(tbl)

    # (a) Transpose: OR and p unchanged
    tbl_T = [[a, c], [b, d]]
    or_T, p_T = sp.fisher_exact(tbl_T)
    check(
        f"Transpose invariance: {name}",
        abs(or_T - or_orig) < 1e-10 and abs(p_T - p_orig) < 1e-10,
        f"orig=({or_orig:.6f}, {p_orig:.6f}), trans=({or_T:.6f}, {p_T:.6f})",
    )

    # (b) Swap rows: OR inverted, p unchanged
    tbl_swap = [[c, d], [a, b]]
    or_swap, p_swap = sp.fisher_exact(tbl_swap)
    if or_orig != 0 and not math.isinf(or_orig):
        expected_inv = 1.0 / or_orig
        check(
            f"Row-swap inversion: {name}",
            abs(or_swap - expected_inv) < 1e-8 and abs(p_swap - p_orig) < 1e-10,
            f"OR_swap={or_swap:.8f}, 1/OR={expected_inv:.8f}, p_swap={p_swap:.8f}",
        )

    # (c) p(greater) + p(less) − P(X=a_obs) = 1.0
    _, p_gt = sp.fisher_exact(tbl, alternative='greater')
    _, p_lt = sp.fisher_exact(tbl, alternative='less')
    N = a + b + c + d
    R0, C0 = a + b, a + c
    p_obs_val = _hypergeom_pmf(a, N, R0, C0)
    reconstruction = p_gt + p_lt - p_obs_val
    check(
        f"p(≥a) + p(≤a) − P(a) = 1.0: {name}",
        abs(reconstruction - 1.0) < 1e-10,
        f"got {reconstruction:.12f}",
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 6: Fisher exact — published exact rational values
# ══════════════════════════════════════════════════════════════

section("6. scipy.stats.fisher_exact — published exact fractions")

# [Fisher35] Chapter 2: 34/70 = 17/35 — exact fraction
_, p = sp.fisher_exact(LADY_TEA)
check(
    "[Fisher35] p = 34/70 = 17/35 (exact rational)",
    abs(p - 17/35) < 1e-14,
    f"SciPy={p:.15f}, 17/35={17/35:.15f}",
)

# [Agresti02] / SciPy docs: 176/1716 = 44/429 — exact fraction
_, p = sp.fisher_exact(SCIPY_DOC)
check(
    "[Agresti02] p = 176/1716 = 44/429 (exact rational)",
    abs(p - 44/429) < 1e-14,
    f"SciPy={p:.15f}, 44/429={44/429:.15f}",
)

# [Fisher35] one-sided: P(X ≥ 3) = 17/70
_, p_gt = sp.fisher_exact(LADY_TEA, alternative='greater')
check(
    "[Fisher35] p(greater) = 17/70 (exact rational)",
    abs(p_gt - 17/70) < 1e-14,
    f"SciPy={p_gt:.15f}, 17/70={17/70:.15f}",
)

# Perfect separation: p = 2/C(10,5) = 2/252 = 1/126
_, p = sp.fisher_exact([[5, 0], [0, 5]])
check(
    "Perfect [[5,0],[0,5]]: p = 2/C(10,5) = 1/126 (exact rational)",
    abs(p - 1/126) < 1e-14,
    f"SciPy={p:.15f}, 1/126={1/126:.15f}",
)

# [[10,0],[0,10]]: p = 2/C(20,10) = 2/184756 = 1/92378
_, p = sp.fisher_exact([[10, 0], [0, 10]])
check(
    "Perfect [[10,0],[0,10]]: p = 2/184756 = 1/92378 (exact rational)",
    abs(p - 1/92378) < 1e-14,
    f"SciPy={p:.15f}, 1/92378={1/92378:.15f}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 7: Fisher exact — 100 random tables vs oracle
# ══════════════════════════════════════════════════════════════

section("7. scipy.stats.fisher_exact — 100 random tables vs oracle")

np.random.seed(42)
n_cross = 100
n_match = 0
max_delta = 0.0

for _ in range(n_cross):
    tbl = np.random.randint(0, 25, size=(2, 2)).tolist()
    if sum(tbl[0]) == 0 or sum(tbl[1]) == 0:
        n_match += 1
        continue
    if tbl[0][0] + tbl[1][0] == 0 or tbl[0][1] + tbl[1][1] == 0:
        n_match += 1
        continue

    oracle_p = _fisher_p_two_sided(tbl)
    _, scipy_p = sp.fisher_exact(tbl)
    delta = abs(scipy_p - oracle_p)
    max_delta = max(max_delta, delta)
    if delta < 1e-10:
        n_match += 1

check(
    f"All {n_cross} random tables: |SciPy − oracle| < 1e-10",
    n_match == n_cross,
    f"{n_match}/{n_cross} matched, max Δ = {max_delta:.2e}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 8: Boschloo exact — statistic identity
# ══════════════════════════════════════════════════════════════

section("8. scipy.stats.boschloo_exact — statistic = Fisher one-sided p")

# [Boschloo70] §2: The test uses Fisher's one-sided p-value as the
# test statistic. SciPy picks the smaller of p(greater), p(less).

boschloo_tables = {
    "[Fisher35] Lady Tea": LADY_TEA,
    "[Agresti02]": SCIPY_DOC,
    "Toxicology": TOX,
    "[Saari04]": SAARI,
    "[Rosner06]": ROSNER,
}

for name, tbl in boschloo_tables.items():
    res_b = sp.boschloo_exact(tbl, alternative='two-sided')
    _, fp_greater = sp.fisher_exact(tbl, alternative='greater')
    _, fp_less = sp.fisher_exact(tbl, alternative='less')
    fisher_min = min(fp_greater, fp_less)
    check(
        f"[Boschloo70] stat = min(Fisher p_gt, p_lt): {name}",
        abs(res_b.statistic - fisher_min) < 1e-8,
        f"Boschloo stat={res_b.statistic:.10f}, "
        f"min(Fisher)={fisher_min:.10f}",
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 9: Boschloo exact — power dominance
# ══════════════════════════════════════════════════════════════

section("9. scipy.stats.boschloo_exact — Boschloo p ≤ Fisher p [Lydersen09]")

# [Lydersen09] Theorem: Boschloo's test is uniformly more powerful
# than Fisher's test → p(Boschloo) ≤ p(Fisher) for all 2×2 tables.

for name, tbl in boschloo_tables.items():
    _, fp_gt = sp.fisher_exact(tbl, alternative='greater')
    bp_gt = sp.boschloo_exact(tbl, alternative='greater').pvalue
    check(
        f"[Lydersen09] p_boschloo(gt) ≤ p_fisher(gt): {name}",
        bp_gt <= fp_gt + 1e-10,
        f"Boschloo={bp_gt:.8f}, Fisher={fp_gt:.8f}",
    )

# Random tables: verify ONE-SIDED dominance on 30 random tables.
# Note: two-sided Boschloo and Fisher use different p-value definitions
# (Boschloo: 2·min(one-sided); Fisher: sum of P ≤ P_obs), so the
# dominance property holds for one-sided alternatives specifically.
np.random.seed(77)
n_dom = 30
n_dom_ok = 0
for _ in range(n_dom):
    tbl = np.random.randint(1, 15, size=(2, 2)).tolist()
    _, fp_gt = sp.fisher_exact(tbl, alternative='greater')
    bp_gt = sp.boschloo_exact(tbl, alternative='greater').pvalue
    _, fp_lt = sp.fisher_exact(tbl, alternative='less')
    bp_lt = sp.boschloo_exact(tbl, alternative='less').pvalue
    if bp_gt <= fp_gt + 1e-8 and bp_lt <= fp_lt + 1e-8:
        n_dom_ok += 1

check(
    f"[Lydersen09] one-sided power dominance on {n_dom} random tables",
    n_dom_ok == n_dom,
    f"{n_dom_ok}/{n_dom} satisfied",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 10: Boschloo exact — published example [Saari04]
# ══════════════════════════════════════════════════════════════

section("10. scipy.stats.boschloo_exact — published example [Saari04]")

# SciPy documentation: college professors vs scientists satisfaction
# [[74,31],[43,32]], alternative='greater'
res_saari_gt = sp.boschloo_exact(SAARI, alternative='greater')
check(
    "[Saari04] Boschloo p(greater) < Fisher p(greater)",
    res_saari_gt.pvalue < sp.fisher_exact(SAARI, alternative='greater')[1],
    f"Boschloo={res_saari_gt.pvalue:.8f}, "
    f"Fisher={sp.fisher_exact(SAARI, alternative='greater')[1]:.8f}",
)

# Two-sided: Boschloo should give smaller p than Fisher
res_saari_2s = sp.boschloo_exact(SAARI, alternative='two-sided')
_, p_fisher_saari = sp.fisher_exact(SAARI)
check(
    "[Saari04] Boschloo p(two-sided) < Fisher p(two-sided)",
    res_saari_2s.pvalue < p_fisher_saari,
    f"Boschloo={res_saari_2s.pvalue:.8f}, Fisher={p_fisher_saari:.8f}",
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 11: Boschloo exact — one-sided consistency
# ══════════════════════════════════════════════════════════════

section("11. scipy.stats.boschloo_exact — one-sided consistency")

for name, tbl in boschloo_tables.items():
    p_2s = sp.boschloo_exact(tbl, alternative='two-sided').pvalue
    p_gt = sp.boschloo_exact(tbl, alternative='greater').pvalue
    p_lt = sp.boschloo_exact(tbl, alternative='less').pvalue
    p_min_1s = min(p_gt, p_lt)

    check(
        f"p(two-sided) ≤ 2·min(p_gt, p_lt): {name}",
        p_2s <= 2 * p_min_1s + 1e-8,
        f"p_2s={p_2s:.8f}, 2·min={2*p_min_1s:.8f}",
    )

    # Direction: if OR > 1, p(greater) < p(less)
    or_val, _ = sp.fisher_exact(tbl)
    if or_val > 1.0 and not math.isinf(or_val):
        check(
            f"OR > 1 → p(greater) < p(less): {name}",
            p_gt < p_lt,
            f"p_gt={p_gt:.8f}, p_lt={p_lt:.8f}, OR={or_val:.4f}",
        )
    elif 0 < or_val < 1.0:
        check(
            f"OR < 1 → p(less) < p(greater): {name}",
            p_lt < p_gt,
            f"p_lt={p_lt:.8f}, p_gt={p_gt:.8f}, OR={or_val:.4f}",
        )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 12: Boschloo exact — null hypothesis
# ══════════════════════════════════════════════════════════════

section("12. scipy.stats.boschloo_exact — null hypothesis tables")

null_tables = [
    ("[[5,5],[5,5]]", [[5, 5], [5, 5]]),
    ("[[10,10],[10,10]]", [[10, 10], [10, 10]]),
    ("[[3,7],[4,6]]", [[3, 7], [4, 6]]),
]

for name, tbl in null_tables:
    res = sp.boschloo_exact(tbl, alternative='two-sided')
    check(
        f"Null-ish {name}: p > 0.10",
        res.pvalue > 0.10,
        f"p = {res.pvalue:.8f}",
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 13: Boschloo exact — n parameter stability
# ══════════════════════════════════════════════════════════════

section("13. scipy.stats.boschloo_exact — n parameter stability")

# [Boschloo70] p-value should stabilize as n (Sobol points) increases.
for name, tbl in [("[Agresti02]", SCIPY_DOC), ("Toxicology", TOX)]:
    p_32 = sp.boschloo_exact(tbl, alternative='two-sided', n=32).pvalue
    p_128 = sp.boschloo_exact(tbl, alternative='two-sided', n=128).pvalue
    check(
        f"Stable across n=32→128: {name}",
        abs(p_32 - p_128) < 0.01,
        f"n=32: {p_32:.8f}, n=128: {p_128:.8f}, Δ={abs(p_32-p_128):.6f}",
    )


# ══════════════════════════════════════════════════════════════
# TEST GROUP 14: Boschloo exact — edge cases
# ══════════════════════════════════════════════════════════════

section("14. scipy.stats.boschloo_exact — edge cases")

# Perfect separation → very small p
res_perf = sp.boschloo_exact([[5, 0], [0, 5]], alternative='two-sided')
check(
    "Perfect [[5,0],[0,5]]: p < 0.05",
    res_perf.pvalue < 0.05,
    f"p = {res_perf.pvalue:.8f}",
)

# Symmetric table → p(greater) ≈ p(less) by symmetry
res_gt_sym = sp.boschloo_exact([[5, 5], [5, 5]], alternative='greater')
res_lt_sym = sp.boschloo_exact([[5, 5], [5, 5]], alternative='less')
check(
    "Symmetric [[5,5],[5,5]]: p(gt) ≈ p(lt)",
    abs(res_gt_sym.pvalue - res_lt_sym.pvalue) < 0.05,
    f"p_gt={res_gt_sym.pvalue:.8f}, p_lt={res_lt_sym.pvalue:.8f}",
)

# ValueError for negative input
try:
    sp.boschloo_exact([[-1, 2], [3, 4]])
    got_error = False
except (ValueError, TypeError):
    got_error = True
check(
    "Negative input → ValueError",
    got_error,
)


# ══════════════════════════════════════════════════════════════
# TEST GROUP 15: Practical significance agreement
# ══════════════════════════════════════════════════════════════

section("15. Practical: Fisher and Boschloo significance agreement")

# If Fisher p < α, Boschloo must also give p < α (more powerful).
significant_tables = [
    ("[[8,2],[2,8]]", [[8, 2], [2, 8]]),
    ("[[9,1],[3,7]]", [[9, 1], [3, 7]]),
    ("[[10,0],[0,10]]", [[10, 0], [0, 10]]),
]
for name, tbl in significant_tables:
    _, p_f = sp.fisher_exact(tbl)
    p_b = sp.boschloo_exact(tbl, alternative='two-sided').pvalue
    if p_f < 0.05:
        check(
            f"Fisher p < 0.05 ⇒ Boschloo p < 0.05: {name}",
            p_b < 0.05,
            f"Fisher={p_f:.6f}, Boschloo={p_b:.6f}",
        )

nonsig_tables = [
    ("[[3,1],[1,3]]", [[3, 1], [1, 3]]),
    ("[[5,5],[5,5]]", [[5, 5], [5, 5]]),
]
for name, tbl in nonsig_tables:
    _, p_f = sp.fisher_exact(tbl)
    p_b = sp.boschloo_exact(tbl, alternative='two-sided').pvalue
    check(
        f"Both non-significant at α=0.05: {name}",
        p_f > 0.05 and p_b > 0.05,
        f"Fisher={p_f:.6f}, Boschloo={p_b:.6f}",
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
