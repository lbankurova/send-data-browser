# Verification Report: Statistical Tests in statistics.py

## 1. Introduction

This report presents the verification of six statistical functions implemented in `statistics.py`:

- `welch_t_test` — Welch's t-test for two independent samples with unequal variances
- `mann_whitney_u` — Mann–Whitney U test for non-parametric two-sample comparison
- `spearman_correlation` — Spearman rank correlation coefficient
- `severity_trend` — Spearman correlation of average severity × dose level
- `welch_pairwise` — Pairwise Welch's t-tests for multiple treated groups vs control
- `bonferroni_correct` — Bonferroni multiplicity correction for p-values

Each function is validated against published numerical examples from peer-reviewed publications and reference software (R, SPSS, StatsDirect), complemented by cross-validation against direct `scipy.stats` calls and hand-calculated values.

---

## 2. Subject of Verification

### 2.1 welch_t_test

Wrapper around `scipy.stats.ttest_ind(equal_var=False)`. Strips NaN values from both groups before computation. Returns `{"statistic": None, "p_value": None}` when either group has fewer than 2 valid observations.

### 2.2 mann_whitney_u

Wrapper around `scipy.stats.mannwhitneyu(alternative="two-sided")`. Strips NaN values. Returns None dict for empty groups or when `mannwhitneyu` raises `ValueError`.

### 2.3 spearman_correlation

Wrapper around `scipy.stats.spearmanr`. Applies pairwise NaN removal (both x and y must be non-NaN for a pair to survive). Returns None dict when fewer than 3 valid pairs remain.

### 2.4 severity_trend

Thin wrapper over `spearmanr` specifically for dose-level × average-severity analysis. Adds a guard for constant severity input (returns None when all severity values are identical, since Spearman ρ is undefined for constant data).

### 2.5 welch_pairwise

Applies `welch_t_test` to each treated group vs a shared control group. Returns raw (uncorrected) p-values. Empty list when control has < 2 elements or no treated groups are provided.

### 2.6 bonferroni_correct

Multiplies each p-value by the number of non-None tests (or an explicit `n_tests`), capping at 1.0. None values pass through unchanged.

---

## 3. Verification Results

**Result: 91 / 91 tests passed.**

| # | Group | Tests | Source | What is Verified |
|---|---|---|---|---|
| 1 | welch_t_test — published references | 6 | [McDonald] pp. 128–129, [Rosetta] | t and p from body-temperature data; 3 Rosetta Code pairs including extreme variance ratio (df ≈ 2.0) |
| 2 | welch_t_test — scipy cross-validation | 5 | scipy.stats | Two-group, hand-calculated t = 3/√2, unequal sizes, numpy input |
| 3 | welch_t_test — NaN and edge cases | 8 | — | NaN stripping from both groups, n < 2 → None, empty group, all-NaN, zero variance → NaN, return types |
| 4 | mann_whitney_u — published references | 6 | [Shier] (SPSS-verified), [Statology] | Diabetes age data: U₁ + U₂ = n₁n₂ identity; tied ranks with averaged ranking |
| 5 | mann_whitney_u — edge cases | 4 | — | NaN removal, empty group → None, all-NaN → None, return types |
| 6 | spearman_correlation — published references | 10 | [AB94] p. 466, [StatsDirect], [WikiSpear] | ρ = 113/165 (exact rational), Σd² = 52, t ≈ 2.658; negative ρ = −29/165, non-significant p; perfect ±1.0 |
| 7 | spearman_correlation — edge cases | 5 | — | Pairwise NaN removal, tied ranks, n < 3 → None, return types |
| 8 | severity_trend — dose-severity | 8 | scipy.stats | Perfect ±1.0 trends, arbitrary data cross-check, constant severity → None guard, NaN removal, toxicology dose-response scenario |
| 9 | welch_pairwise — multi-group | 15 | Internal consistency | Each treated group matches individual welch_t_test; raw (uncorrected) p-values; NaN in control/treated; empty/insufficient → empty list or None; dose level preservation |
| 10 | bonferroni_correct — published references | 13 | [Abdi] Table 1, [Garcia/McDonald] pp. 262–263 | 3-test example (0.00004 × 3, cap at 1.0); 25-variable dietary study (only "Total calories" survives α = 0.05) |
| 11 | bonferroni_correct — algebraic properties | 11 | — | p × k formula, cap at 1.0, explicit n_tests override, None passthrough, order preservation, empty list, very small p scaling |

---

## 4. Reference Datasets

### 4.1 Welch's t-test

**[McDonald] Body temperature data (pp. 128–129).** Two groups of body temperatures (°F): 2 pm group (n₁ = 18) and 5 pm group (n₂ = 16). Published result: t = 1.3109, df = 31.175, p = 0.1995 (two-sided). Verified against R `t.test(..., var.equal = FALSE)`.

**[Rosetta] Three verified pairs.** Rosetta Code canonical test vectors, each independently confirmed via R and scipy:

| Pair | n₁ | n₂ | Published p (two-sided) | Key property |
|---|---|---|---|---|
| d1 vs d2 | 15 | 15 | 0.021378001462867 | Equal sizes, moderate effect |
| d7 vs d8 | 6 | 6 | 0.090773324285671 | Small n, tight distribution |
| x vs y | 4 | 3 | 0.010751561149785 | Extreme variance ratio, df ≈ 2.0009 |

The x-vs-y pair is particularly valuable: it produces t = −9.5595 with near-degenerate Welch–Satterthwaite degrees of freedom (df ≈ 2.0), exercising the implementation's behavior under extreme variance inequality.

### 4.2 Mann–Whitney U test

**[Shier] Diabetes age data (SPSS-verified).** Males: {19, 22, 16, 29, 24}, Females: {20, 11, 17, 12}. No ties. SPSS output: U = 3.0, Wilcoxon W = 13.0, z = −1.715, asymptotic p = 0.086. Hand verification: rank sum R₁ = 32, R₂ = 13, U₁ = 17, U₂ = 3, U₁ + U₂ = 20 = n₁ × n₂.

**[Statology] Drug vs placebo with tied ranks.** Drug: {3, 5, 1, 4, 3, 5}, Placebo: {4, 8, 6, 2, 1, 9}. Contains ties (two 1s, two 3s, two 5s) requiring averaged ranking.

### 4.3 Spearman rank correlation

**[AB94] Clinical psychology student rankings (p. 466).** Ten students ranked on career suitability and psychology knowledge. No ties (both variables are permutations of 1–10).

| Student | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Career (X) | 4 | 10 | 3 | 1 | 9 | 2 | 6 | 7 | 8 | 5 |
| Psychology (Y) | 5 | 8 | 6 | 2 | 10 | 3 | 9 | 4 | 7 | 1 |

Σd² = 52. Exact result: ρ = 1 − 6(52)/(10 × 99) = 113/165 ≈ 0.684848. The exact rational fraction 113/165 is used to verify floating-point precision. StatsDirect independently confirms ρ = 0.6848, t = 2.658 (df = 8), exact two-sided p = 0.0347.

**[WikiSpear] IQ vs TV-hours (negative correlation).** Ten observations: IQ = {106, 86, 100, 101, 99, 103, 97, 113, 112, 110}, TV = {7, 0, 27, 50, 28, 29, 20, 12, 6, 17}. Result: ρ = −29/165 ≈ −0.1758, non-significant (p ≈ 0.627). Tests the negative-correlation and non-significant code paths.

### 4.4 Bonferroni correction

**[Abdi] Three simultaneous tests (Table 1).** Raw p-values: {0.000040, 0.016100, 0.612300}, m = 3. Expected Bonferroni-adjusted: {0.000120, 0.048300, 1.000000}. The third value demonstrates the cap-at-1.0 boundary (0.6123 × 3 = 1.8369 → 1.0). Tests 1 and 2 remain significant at α = 0.05; test 3 does not.

**[Garcia/McDonald] 25-variable dietary study (pp. 262–263).** García-Arenzana et al. (2014), Int J Cancer 134(8):1916–1925, reproduced in McDonald's Handbook of Biological Statistics. Seven smallest raw p-values multiplied by 25:

| Variable | Raw p | Bonferroni (×25) | Significant at α = 0.05? |
|---|---|---|---|
| Total calories | 0.001 | 0.025 | Yes |
| Olive oil | 0.008 | 0.200 | No |
| Whole milk | 0.039 | 0.975 | No |
| White meat | 0.041 | 1.000 | No |
| Proteins | 0.042 | 1.000 | No |
| Nuts | 0.060 | 1.000 | No |
| Cereals and pasta | 0.074 | 1.000 | No |

Only "Total calories" survives Bonferroni correction — a demonstration of the method's conservatism with many tests.

---

## 5. Cross-Validation Strategy

Each function is verified at three levels:

1. **Published ground truth.** Exact numerical values from textbooks or SPSS/R output that pre-date the implementation. These are the strongest form of evidence because they are independent of scipy.

2. **scipy oracle.** Direct calls to `scipy.stats.ttest_ind`, `mannwhitneyu`, `spearmanr` with tolerance < 10⁻¹⁰. This confirms that the wrapper correctly invokes the underlying library (correct parameters, correct NaN handling before the call, correct extraction of return values).

3. **Algebraic / edge-case.** Hand-calculated values (e.g. t = 3/√2 for [4,6] vs [1,3]), algebraic identities (U₁ + U₂ = n₁n₂; ρ = 1 − 6Σd²/n(n²−1)), boundary conditions (n < 2, all-NaN, constant data), and return-type checks.

For `welch_pairwise`, which has no direct published benchmark, internal consistency is verified: each per-group result must exactly match an independent `welch_t_test` call on the same data, and p-values must be raw (not Bonferroni-multiplied).

---

## 6. Notes

### 6.1 Zero-Variance Groups in Welch's t-test

When both groups have zero variance (all identical values), `scipy.stats.ttest_ind` returns `NaN` for both t and p due to division by zero in the standard error denominator. The implementation passes this behavior through without modification. This is the mathematically correct result: the t-statistic is undefined when both sample variances are zero.

### 6.2 Asymptotic vs Exact P-values in Mann–Whitney

The implementation uses `scipy.stats.mannwhitneyu` which computes asymptotic (normal approximation) p-values. For small samples (e.g. Shier's n₁ = 5, n₂ = 4), this can differ from exact permutation p-values. For example, Shier reports asymptotic p = 0.086 vs exact p = 0.111. The tests verify against scipy's asymptotic output, matching the implementation's behavior.

### 6.3 Constant Severity Guard in severity_trend

The `severity_trend` function includes a guard not present in `spearman_correlation`: it returns None when all severity values are identical. This prevents scipy from returning ρ = NaN with a warning. This guard is specific to the toxicology use case where constant severity across dose groups indicates no dose-response relationship.

---

## 7. References

**[McDonald]** McDonald JH. *Handbook of Biological Statistics*, 3rd ed. Baltimore, MD: Sparky House Publishing; 2014. pp. 128–129 (Welch's t-test), pp. 262–263 (Bonferroni correction with García-Arenzana data).

**[Rosetta]** Rosetta Code. "Welch's t-test." rosettacode.org/wiki/Welch%27s_t-test. Three test vector pairs verified against R `t.test(..., var.equal=FALSE)` and `scipy.stats.ttest_ind`.

**[Shier]** Shier R. "Statistics: 2.3 The Mann–Whitney U Test." Mathematics Learning Support Centre, Loughborough University; 2004. statstutor.ac.uk/resources/uploaded/mannwhitney.pdf. SPSS-verified output.

**[Statology]** Statology. "Mann-Whitney U Test (Simply Explained)." 2022. statology.org/mann-whitney-u-test/

**[AB94]** Armitage P, Berry G. *Statistical Methods in Medical Research*, 3rd ed. Oxford: Blackwell Science; 1994. p. 466 (Spearman rank correlation worked example).

**[StatsDirect]** StatsDirect Ltd. "Spearman's Rank Correlation." statsdirect.com/help/nonparametric_methods/spearman.htm. Independent verification of Armitage & Berry example with exact permutation p-values.

**[WikiSpear]** Wikipedia. "Spearman's rank correlation coefficient." Worked example: IQ vs TV-hours, ρ = −29/165.

**[Abdi]** Abdi H. "Holm's Sequential Bonferroni Procedure." In: Salkind N, ed. *Encyclopedia of Research Design*. Thousand Oaks, CA: Sage; 2010. Table 1. personal.utdallas.edu/~herve/abdi-Holm2010-pretty.pdf

**[Garcia]** García-Arenzana N, Navarrete-Muñoz EM, Lope V, et al. Calorie intake, olive oil consumption and mammographic density among Spanish women. *Int J Cancer.* 2014;134(8):1916–1925. 25-variable Bonferroni example reproduced in [McDonald] pp. 262–263.

**[Welch]** Welch BL. The generalization of 'Student's' problem when several different population variances are involved. *Biometrika.* 1947;34(1–2):28–35.

**[MW47]** Mann HB, Whitney DR. On a test of whether one of two random variables is stochastically larger than the other. *Ann Math Stat.* 1947;18(1):50–60.

**[Spearman]** Spearman C. The proof and measurement of association between two things. *Am J Psychol.* 1904;15(1):72–101.

**[Dunn]** Dunn OJ. Multiple comparisons among means. *J Am Stat Assoc.* 1961;56(293):52–64.
