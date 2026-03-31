"""Validation: compute_effect_size (Hedges' g) vs NIST reference.

Reference: NIST/SEMATECH Dataplot HEDGES G statistic
https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/hedgeg.htm

Dataset: Fisher's Iris (Anderson, 1935 / Fisher, 1936).
NIST computes Hedges' g between Y1 (sepal length) and Y2 (sepal width)
for each species.  Note: NIST's "Hedges' g" is Cohen's d with a weighted
pooled SD — it does NOT apply the small-sample bias correction factor J.

Our compute_effect_size applies Hedges' correction J = 1 - 3/(4*df - 1).

This test validates two things:
  1. The pooled-SD Cohen's d (before correction) matches NIST exactly.
  2. The J correction matches the exact gamma-function formula.

NIST values:
    X=1 (setosa)     ->  g = 4.311260
    X=2 (versicolor) ->  g = 7.412040
    X=3 (virginica)  ->  g = 7.168413
"""

import importlib.util
import math
import sys
from pathlib import Path

import numpy as np

# Load ../statistics.py as "send_statistics" to avoid shadowing stdlib statistics
_stats_path = Path(__file__).resolve().parent.parent / "statistics_fixed.py"
_spec = importlib.util.spec_from_file_location("send_statistics", _stats_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
compute_effect_size = _mod.compute_effect_size

from validate_helpers import check, report

# --- Fisher's Iris data: sepal_length (Y1) and sepal_width (Y2) per species ---

# Setosa (X=1), n=50
setosa_y1 = np.array([
    5.1, 4.9, 4.7, 4.6, 5.0, 5.4, 4.6, 5.0, 4.4, 4.9,
    5.4, 4.8, 4.8, 4.3, 5.8, 5.7, 5.4, 5.1, 5.7, 5.1,
    5.4, 5.1, 4.6, 5.1, 4.8, 5.0, 5.0, 5.2, 5.2, 4.7,
    4.8, 5.4, 5.2, 5.5, 4.9, 5.0, 5.5, 4.9, 4.4, 5.1,
    5.0, 4.5, 4.4, 5.0, 5.1, 4.8, 5.1, 4.6, 5.3, 5.0,
])
setosa_y2 = np.array([
    3.5, 3.0, 3.2, 3.1, 3.6, 3.9, 3.4, 3.4, 2.9, 3.1,
    3.7, 3.4, 3.0, 3.0, 4.0, 4.4, 3.9, 3.5, 3.8, 3.8,
    3.4, 3.7, 3.6, 3.3, 3.4, 3.0, 3.4, 3.5, 3.4, 3.2,
    3.1, 3.4, 4.1, 4.2, 3.1, 3.2, 3.5, 3.6, 3.0, 3.4,
    3.5, 2.3, 3.2, 3.5, 3.8, 3.0, 3.8, 3.2, 3.7, 3.3,
])

# Versicolor (X=2), n=50
versicolor_y1 = np.array([
    7.0, 6.4, 6.9, 5.5, 6.5, 5.7, 6.3, 4.9, 6.6, 5.2,
    5.0, 5.9, 6.0, 6.1, 5.6, 6.7, 5.6, 5.8, 6.2, 5.6,
    5.9, 6.1, 6.3, 6.1, 6.4, 6.6, 6.8, 6.7, 6.0, 5.7,
    5.5, 5.5, 5.8, 6.0, 5.4, 6.0, 6.7, 6.3, 5.6, 5.5,
    5.5, 6.1, 5.8, 5.0, 5.6, 5.7, 5.7, 6.2, 5.1, 5.7,
])
versicolor_y2 = np.array([
    3.2, 3.2, 3.1, 2.3, 2.8, 2.8, 3.3, 2.4, 2.9, 2.7,
    2.0, 3.0, 2.2, 2.9, 2.9, 3.1, 3.0, 2.7, 2.2, 2.5,
    3.2, 2.8, 2.5, 2.8, 2.9, 3.0, 2.8, 3.0, 2.9, 2.6,
    2.4, 2.4, 2.7, 2.7, 3.0, 3.4, 3.1, 2.3, 3.0, 2.5,
    2.6, 3.0, 2.6, 2.3, 2.7, 3.0, 2.9, 2.9, 2.5, 2.8,
])

# Virginica (X=3), n=50
virginica_y1 = np.array([
    6.3, 5.8, 7.1, 6.3, 6.5, 7.6, 4.9, 7.3, 6.7, 7.2,
    6.5, 6.4, 6.8, 5.7, 5.8, 6.4, 6.5, 7.7, 7.7, 6.0,
    6.9, 5.6, 7.7, 6.3, 6.7, 7.2, 6.2, 6.1, 6.4, 7.2,
    7.4, 7.9, 6.4, 6.3, 6.1, 7.7, 6.3, 6.4, 6.0, 6.9,
    6.7, 6.9, 5.8, 6.8, 6.7, 6.7, 6.3, 6.5, 6.2, 5.9,
])
virginica_y2 = np.array([
    3.3, 2.7, 3.0, 2.9, 3.0, 3.0, 2.5, 2.9, 2.5, 3.6,
    3.2, 2.7, 3.0, 2.5, 2.8, 3.2, 3.0, 3.8, 2.6, 2.2,
    3.2, 2.8, 2.8, 2.7, 3.3, 3.2, 2.8, 3.0, 2.8, 3.0,
    2.8, 3.8, 2.8, 2.8, 2.6, 3.0, 3.4, 3.1, 3.0, 3.1,
    3.1, 3.1, 2.7, 3.2, 3.3, 3.0, 2.5, 3.0, 3.4, 3.0,
])

# --- NIST reference values (uncorrected d with pooled SD) ---
cases = [
    ("setosa (X=1)",     setosa_y1,     setosa_y2,     4.311260),
    ("versicolor (X=2)", versicolor_y1, versicolor_y2, 7.412040),
    ("virginica (X=3)",  virginica_y1,  virginica_y2,  7.168413),
]

TOL = 1e-4

# ---------------------------------------------------------------------------
# Part 1: verify Cohen's d (before J correction) matches NIST
# ---------------------------------------------------------------------------
all_pass = True

print("Part 1: Cohen's d (uncorrected) vs NIST Hedges' g")
print("=" * 55)


def cohens_d(g1: np.ndarray, g2: np.ndarray) -> float:
    """Cohen's d with weighted pooled SD (same formula as NIST 'Hedges g')."""
    n1, n2 = len(g1), len(g2)
    pooled = np.sqrt(((n1 - 1) * np.var(g1, ddof=1) +
                      (n2 - 1) * np.var(g2, ddof=1)) / (n1 + n2 - 2))
    return float((np.mean(g1) - np.mean(g2)) / pooled)


for name, y1, y2, ref_g in cases:
    d = cohens_d(y1, y2)
    ok = check(f"{name} d", round(abs(d), 6), ref_g, tol=TOL)
    all_pass = all_pass and ok

# ---------------------------------------------------------------------------
# Part 2: verify our J correction vs exact gamma formula
# ---------------------------------------------------------------------------
print()
print("Part 2: J correction (approx vs exact gamma)")
print("=" * 55)

for name, y1, y2, _ in cases:
    df = len(y1) + len(y2) - 2
    j_approx = 1 - 3 / (4 * df - 1)
    j_exact = math.gamma(df / 2) / (math.sqrt(df / 2) * math.gamma((df - 1) / 2))
    ok = check(f"{name} J(df={df})", round(j_approx, 6), j_exact, tol=1e-4)
    all_pass = all_pass and ok

# ---------------------------------------------------------------------------
# Part 3: verify compute_effect_size = d * J (end-to-end)
# ---------------------------------------------------------------------------
print()
print("Part 3: compute_effect_size = NIST_d * J (end-to-end)")
print("=" * 55)

for name, y1, y2, ref_d in cases:
    our_g = compute_effect_size(y1, y2)
    df = len(y1) + len(y2) - 2
    j_exact = math.gamma(df / 2) / (math.sqrt(df / 2) * math.gamma((df - 1) / 2))
    expected = ref_d * j_exact
    ok = check(f"{name} g", round(abs(our_g), 6), expected, tol=TOL)
    all_pass = all_pass and ok

report("Hedges' g NIST validation", all_pass)

if not all_pass:
    sys.exit(1)
