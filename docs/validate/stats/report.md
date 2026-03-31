# Statistical Methods Validation Report

This report documents the validation of statistical methods used in SENDEX.

Sources:

* [statistics.py](../../../backend/services/analysis/statistics.py)

* [williams.py](../../../backend/services/analysis/williams.py)

Validation:

* [validate_all.py](../../../backend/services/analysis/validation/validate_all.py)

Updated & new files files:

* [statistics_fixed.py](../../../backend/services/analysis/statistics_fixed.py)

* [williams_fixed.py](../../../backend/services/analysis/williams_fixed.py)

* [williams_tables.py](../../../backend/services/analysis/williams_fixed.py)

## Findings

### ⚠️ Dunnett's test 

Original method doesn't track statistics at all.

| Aspect | Original (`statistics.py`) | Fixed (`statistics_fixed.py`) |
|--------|---------------------------|-------------------------------|
| `dunnett_pairwise` statistic | Always `None` | Actual value from `result.statistic[j]` |
| Fallback (Welch) statistic | Not captured | Captured from `welch_t_test()` |

Validated against `scipy.stats.dunnett` (direct call) using the Dunnett (1955) blood count dataset. Both p-values and test statistics are compared within tolerance. See [validate_dunnett.py](../../../backend/services/analysis/validation/validate_dunnett.py).

### ✅ Jonckheere-Terpstra trend test 

Checked against two independent sources:

* manual JT via `scipy.stats.mannwhitneyu`
* `jonckheere-test` library

### ✅ Hedges' g

Checked:

* Cohen's d vs NIST.

* J correction: approximation vs exact.

* End-to-end - verifies that the full pipeline works correctly.

### ❌ Williams

[This audit](./williams/williams_audit_report.md) found:

✅ Correct:

* PAVA (isotonic regression) algorithm
* t-bar statistic formula
* Step-down logic

❌ Two critical errors:

* All 88 critical values in WILLIAMS_TABLE are wrong (see also [here](./williams/williams_table_audit.md)).

* Monte Carlo fallback gives incorrect values during step-down.

**Practical impact**: the test could be too liberal at lower doses.

**References** (original papers):

* [paper1](https://drive.google.com/file/d/1JG96l135hAyZILspqOkE4K5wJpCUBSzV/view?usp=drive_link)

* [paper2](https://drive.google.com/file/d/1YkgadKQF48wYeAyaTPFE_mt2Hvn7uwF8/view?usp=drive_link)

**Solution**:

* Extracted the tables from the papers: [williams_tables.py](../../../backend/services/analysis/williams_fixed.py) and [williams_critical_values.xlsx](./williams/williams_critical_values.xlsx)

* Implemented the fixed version - [williams_fixed.py](../../../backend/services/analysis/williams_fixed.py)

* Validated against orignial papers - [validate_fixed_williams.py](../../../backend/services/analysis/validation/validate_fixed_williams.py) ✅
