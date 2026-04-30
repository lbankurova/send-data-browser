# Statistical Methods Validation Report

This report documents the validation of statistical methods used in SENDEX.

Sources:

* [statistics.py](../../../backend/services/analysis/statistics.py)

* [williams.py](../../../backend/services/analysis/williams.py)

* [ancova.py](../../../backend/services/analysis/ancova.py)

Validation:

* [validate_all.py](../../../backend/services/analysis/validation/validate_all.py)

* [validate_fisher_boschloo.py](../../../backend/services/analysis/validation/validate_fisher_boschloo.py)

* [validate_ancova.py](../../../backend/services/analysis/validation/validate_ancova.py)

* [validate_dunnett.py](../../../backend/services/analysis/validation/validate_dunnett.py)

* [validate_fixed_williams.py](../../../backend/services/analysis/validation/validate_fixed_williams.py)

* [validate_hedges_g.py](../../../backend/services/analysis/validation/validate_hedges_g.py)

* [validate_helpers.py](../../../backend/services/analysis/validation/validate_helpers.py)

* [validate_trend_test.py](../../../backend/services/analysis/validation/validate_trend_test.py)

* [validate_trend_test_incidence.py](../../../backend/services/analysis/validation/validate_trend_test_incidence.py)

* [validate_trend_test_incidence_modified.py](../../../backend/services/analysis/validation/validate_trend_test_incidence_modified.py)

Updated & new files files:

* [statistics_fixed.py](../../../backend/services/analysis/statistics_fixed.py)

* [williams_fixed.py](../../../backend/services/analysis/williams_fixed.py)

* [williams_tables.py](../../../backend/services/analysis/williams_fixed.py)

* [trend_test_incidence_modified.py](../../../backend/services/analysis/trend_test_incidence_modified.py)

## Findings

### ⚠️ Dunnett's test 

Original method doesn't track statistics at all.

| Aspect | Original (`statistics.py`) | Fixed (`statistics_fixed.py`) |
|--------|---------------------------|-------------------------------|
| `dunnett_pairwise` statistic | Always `None` | Actual value from `result.statistic[j]` |
| Fallback (Welch) statistic | Not captured | Captured from `welch_t_test()` |

Validated against `scipy.stats.dunnett` (direct call) using the Dunnett (1955) blood count dataset. Both p-values and test statistics are compared within tolerance. See [validate_dunnett.py](../../../backend/services/analysis/validation/validate_dunnett.py).

### ⚠️❌ Jonckheere-Terpstra trend test 

Checked **UNTIED** variant against two independent sources:

* manual JT via `scipy.stats.mannwhitneyu`
* `jonckheere-test` library

❌ TO BE FIXED: **tied-correction** (see details [here](./JT/ties_correction_jt.md)).

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

### ✅ ANCOVA

The `ancova.py` implementation is **mathematically correct**: all 17 components (OLS, adjusted means, SE, pairwise comparisons, slope homogeneity, effect decomposition, Hedges' g) match published formulas and reproduce SAS output to within 10⁻⁵.

More [details](./ancova/ancova_verification_summary.md)

### ✅ Fisher's Exact Test & Boschloo's Exact Test

Both `fisher_exact` and `boschloo_exact` from SciPy are safe to use in the SENDEX pipeline for 2×2 incidence table analysis.

More [details](./fisher-boschloo/fisher-boschloo-report.md)

### ✅ Cochran-Armitage trend test for incidence

Implemented the modified version [trend_test_incidence_modified.py](../../../backend/services/analysis/trend_test_incidence_modified.py). The modified function extends the original with additional parameters while preserving backward compatibility.

Two versions of the implementation are verified: the original (baseline) version with fixed interface, and the modified version with extended functionality. Both are validated

More [details](./Cochran-Armitage-trend-test-for-incidence/verification_report.md).

### ✅ Rest

`welch_t_test`, `mann_whitney_u`, `spearman_correlation`,`severity_trend`,`welch_pairwise`, and `bonferroni_correct`are validated against published numerical examples from peer-reviewed publications and reference software (R, SPSS, StatsDirect), complemented by cross-validation against direct `scipy.stats` calls and hand-calculated values.

More [details](./rest/statistics_verification_report.md).
