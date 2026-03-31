"""Validation: dunnett_pairwise vs scipy.stats.dunnett.

Dataset: Dunnett (1955) -- blood counts (millions cells/mm3),
two drug groups vs control.
"""

import importlib.util
import sys
from pathlib import Path

import numpy as np
from scipy import stats as sp_stats

# Load ../statistics.py as "send_statistics" to avoid shadowing stdlib statistics
_stats_path = Path(__file__).resolve().parent.parent / "statistics_fixed.py"
_spec = importlib.util.spec_from_file_location("send_statistics", _stats_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
dunnett_pairwise = _mod.dunnett_pairwise

from validate_helpers import TOL_PVALUE, check, report

# --- Data ---
control = np.array([7.40, 8.50, 7.20, 8.24, 9.84, 8.32])
drug_a  = np.array([9.76, 8.80, 7.68, 9.36])
drug_b  = np.array([12.80, 9.68, 12.16, 9.20, 10.55])

# --- Reference ---
ref = sp_stats.dunnett(drug_a, drug_b, control=control)

# --- Our implementation ---
treated = [(1, drug_a), (2, drug_b)]
result = dunnett_pairwise(control, treated)

# --- Compare ---
all_pass = True

print("dunnett_pairwise: p-value comparison")
for i, r in enumerate(result):
    if not check(f"dose {r['dose_level']} p_value", r["p_value"], ref.pvalue[i], tol=TOL_PVALUE):
        all_pass = False

print("\ndunnett_pairwise: statistic comparison")
for i, r in enumerate(result):
    if not check(f"dose {r['dose_level']} statistic", r["statistic"], ref.statistic[i]):
        all_pass = False

report("dunnett_pairwise", all_pass)
if not all_pass:
    sys.exit(1)
