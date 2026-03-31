"""Validation: trend_test (Jonckheere-Terpstra).

Reference 1: manual JT statistic via pairwise scipy.stats.mannwhitneyu.
Reference 2: jonckheere-test library (two-sided, asymptotic).

Dataset: synthetic -- three normally distributed groups with increasing means (5, 6, 7).
"""

import importlib.util
import sys
from pathlib import Path

import numpy as np
from scipy import stats as sp_stats
from jonckheere_test import jonckheere_test

# Load ../statistics.py as "send_statistics" to avoid shadowing stdlib statistics
_stats_path = Path(__file__).resolve().parent.parent / "statistics_fixed.py"
_spec = importlib.util.spec_from_file_location("send_statistics", _stats_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
trend_test = _mod.trend_test

from validate_helpers import TOL_PVALUE, check, report

# --- Data ---
np.random.seed(42)
g1 = np.random.normal(5, 1, size=10)
g2 = np.random.normal(6, 1, size=12)
g3 = np.random.normal(7, 1, size=8)
groups = [g1, g2, g3]

# --- Reference: manual JT via pairwise Mann-Whitney U ---
# JT counts pairs where the higher-indexed group value exceeds the lower,
# so we pass (groups[j], groups[i]) to mannwhitneyu, which returns U = count(x > y).
J_ref = 0.0
for i in range(len(groups)):
    for j in range(i + 1, len(groups)):
        u, _ = sp_stats.mannwhitneyu(groups[j], groups[i], alternative="two-sided")
        J_ref += u

N = sum(len(g) for g in groups)
ns = [len(g) for g in groups]
E_J = (N * N - sum(n * n for n in ns)) / 4.0
Var_J = (N * N * (2 * N + 3) - sum(n * n * (2 * n + 3) for n in ns)) / 72.0
Z_ref = float((J_ref - E_J) / np.sqrt(Var_J))
p_ref = float(2 * (1 - sp_stats.norm.cdf(abs(Z_ref))))

# --- Our implementation ---
res = trend_test(groups)

# --- Compare ---
print("trend_test (Jonckheere-Terpstra): comparison with manual pairwise MW")
all_pass = True
if not check("Z-statistic", res["statistic"], Z_ref):
    all_pass = False
if not check("p_value", res["p_value"], p_ref, tol=TOL_PVALUE):
    all_pass = False

report("trend_test vs manual MW", all_pass)

# --- Reference 2: jonckheere-test library ---
data = np.concatenate(groups)
labels = np.concatenate([np.full(len(g), i + 1) for i, g in enumerate(groups)])
ref_lib = jonckheere_test(data, labels, alternative="two-sided", method="asymptotic")

print("trend_test (Jonckheere-Terpstra): comparison with jonckheere-test library")
all_pass2 = True
if not check("Z-statistic", res["statistic"], ref_lib.z_score):
    all_pass2 = False
if not check("p_value", res["p_value"], ref_lib.p_value, tol=TOL_PVALUE):
    all_pass2 = False

report("trend_test vs jonckheere-test lib", all_pass2)
if not all_pass or not all_pass2:
    sys.exit(1)
