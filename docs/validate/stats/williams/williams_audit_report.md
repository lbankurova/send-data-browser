# Williams' Test Implementation Audit

*Verification of williams.py against original Williams (1971, 1972) papers*

---

## Description

The file `williams.py` implements Williams' step-down trend test for dose-response assessment in toxicological studies. The test is designed to determine the minimum effective dose (MED) — the lowest dose level at which a statistically significant effect is observed.

This report presents the results of a systematic verification of the implementation against the original papers. The audit included: comparison of all 88 values in the built-in `WILLIAMS_TABLE` dictionary against the original tables, reproduction of numerical examples from both papers, analysis of the PAVA algorithm, verification of the Monte Carlo simulation, and analysis of the step-down procedure.

## Sources

- **williams.py** — implementation file (454 lines): PAVA, critical value tables, Monte Carlo fallback, step-down procedure
- **Williams, D.A. (1971).** A test for differences between treatment means when several dose levels are compared with a zero dose control. *Biometrics* 27(1), 103–117. Tables 1 and 2.
- **Williams, D.A. (1972).** The comparison of several dose levels with a zero dose control. *Biometrics* 28(2), 519–531. Tables 1–4, numerical example (section 7).

## What Is Implemented Correctly

### PAVA (Isotonic Regression)

The pool-adjacent-violators algorithm is implemented correctly. Verification against the numerical example from the 1971 paper (section 2): input means `[10.4, 9.9, 10.0, 10.6, 11.4, 11.9, 11.7]` produce the expected result `[10.1, 10.1, 10.1, 10.6, 11.4, 11.8, 11.8]`. The 1972 example with unequal weights is also reproduced exactly.

### t̄ Statistic Formula

For equal replication: t̄ᵢ = (M̄ᵢ − X₀) / √(2s²/r). For unequal: t̄ᵢ = (M̄ᵢ − X₀) / √(s²/rᵢ + s²/c). Correctly uses X₀ (unconstrained control mean), not M̄₀. The test statistic for the 1971 example = 2.60, exactly matching the paper.

### Step-Down Logic

The procedure starts at the highest dose, steps down, and stops at the first non-significant result. MED for the 1971 example is correctly determined as dose 4.

## Critical Errors

### Error 1: All 88 WILLIAMS_TABLE Values Are Incorrect

Programmatic comparison of all 88 values in the built-in `WILLIAMS_TABLE` dictionary against Tables 1 and 2 of Williams (1971) showed that **all 88 of 88 values are wrong**.

The **α = 0.05 column** contains systematic upward bias in critical values (from +0.01 to +0.12), growing with k. The **α = 0.01 column** contains systematic downward bias (from −0.01 to −0.48), catastrophic at low df. Values do not match any column of the original tables.

Representative sample of discrepancies:

| (k, df) | α | williams.py | Paper 1971 | Δ |
|---------|------|-------------|------------|--------|
| (2, 5) | 0.05 | 2.13 | 2.14 | −0.01 |
| (2, 5) | 0.01 | 3.02 | 3.50 | −0.48 |
| (2, 10) | 0.05 | 1.95 | 1.91 | +0.04 |
| (2, 10) | 0.01 | 2.57 | 2.84 | −0.27 |
| (2, 20) | 0.05 | 1.87 | 1.81 | +0.06 |
| (2, 20) | 0.01 | 2.46 | 2.58 | −0.12 |
| (3, 20) | 0.05 | 1.93 | 1.83 | +0.10 |
| (3, 20) | 0.01 | 2.54 | 2.60 | −0.06 |
| (4, 20) | 0.05 | 1.96 | 1.85 | +0.11 |
| (4, 20) | 0.01 | 2.57 | 2.61 | −0.04 |
| (5, 20) | 0.05 | 1.98 | 1.86 | +0.12 |
| (5, 40) | 0.05 | 1.92 | 1.80 | +0.12 |
| (5, 120) | 0.05 | 1.88 | 1.77 | +0.11 |

### Error 2: Monte Carlo Gives Incorrect Critical Values During Step-Down

When a table value is not found, `williams_critical_value()` uses Monte Carlo simulation. For `dose_index < k`, the simulation runs PAVA on **all** k+1 groups instead of groups 0…dose_index only. This dramatically underestimates the critical value.

Per Williams (1971, section 5), when testing dose i in the step-down procedure, the critical value t̄_{i,α} is based on the distribution with PAVA on groups 0…i. For `dose_index = k` there is no error (full and partial PAVA coincide).

Comparison results (k=6, df≈49, 200,000 simulations):

| dose_index | α | MC williams.py | Correct MC | Paper 1971 |
|------------|------|----------------|------------|------------|
| 6 (= k) | 0.05 | 1.802 | 1.802 | 1.81 |
| 6 (= k) | 0.01 | 2.488 | 2.488 | 2.50 |
| 3 (< k) | 0.05 | **1.269** | 1.776 | 1.79 |
| 3 (< k) | 0.01 | **1.848** | 2.460 | 2.48 |

## Practical Impact

At the **highest dose** (first step-down step) the result is approximately correct: Monte Carlo for `dose_index = k` works correctly, and the table error is small.

During **step-down to lower doses**, critical values are severely underestimated (e.g., 1.27 instead of 1.78 for `dose_index=3` with k=6). This makes the test far too **liberal** — false positive rates multiply at lower dose levels.

**Result:** the step-down procedure will often declare significance at lower doses than it should, leading to an underestimated MED and overestimation of toxicity. This may lead to erroneous conclusions about substance safety in toxicological studies.
