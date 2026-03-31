# Williams' Test Critical Values: Tables, Computation, and Implementation

## 1. Background

Williams' test (Williams, 1971; 1972) is a step-down procedure for comparing dose group means against a control under the assumption of a monotone dose–response relationship. Unlike [Dunnett's test](https://en.wikipedia.org/wiki/Dunnett%27s_test), which treats each dose group independently, Williams' test incorporates isotonic regression to pool information across ordered dose groups, yielding higher power when the monotonicity assumption holds.

The test is a standard tool in toxicological bioassay evaluation. Its use alongside or instead of Dunnett's test is recommended in the regulatory statistics literature (Hothorn, 2014; Yoshimura & Matsunaga, 2018).

### Key references

| Paper | Content |
|:---|:---|
| Williams (1971) — [JSTOR](http://www.jstor.org/stable/2528930) | Original test, Tables 1–2 (α=0.05, 0.01; k=1–10; equal replication) |
| Williams (1972) — [JSTOR](http://www.jstor.org/stable/2556164) | Tables 1–4 (α=0.005, 0.01, 0.025, 0.05; extrapolation for unequal c/r), two-sided version, Type I error discussion |
| Bretz (2006) — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0167947305000344) | Extension to general unbalanced linear models via multiple contrast tests — also on [ResearchGate](https://www.researchgate.net/publication/4733544_An_extension_of_the_Williams_trend_test_to_general_unbalanced_linear_models) |
| Bretz (1999) — [Springer](https://link.springer.com/article/10.1023/A:1009622928188) | Powerful alternative to Williams' test for normally distributed data |
| Hothorn (2014) — [RSC](https://pubs.rsc.org/en/content/articlehtml/2014/tx/c4tx00047a) | Review of statistical evaluation of toxicological bioassays |
| Hothorn & Hauschke (2000) — [ResearchGate](https://www.researchgate.net/publication/236653799_Statistical_evaluation_of_toxicological_assays_Dunnett_or_Williams_test_-_Take_both) — [Academia](https://www.academia.edu/7391089/Statistical_evaluation_of_toxicological_assays_Dunnett_or_Williams_test_take_both) | "Dunnett or Williams test — take both" |
| Yoshimura & Matsunaga (2018) — [PDF](https://pdfs.semanticscholar.org/023b/276f79d2e72d793de597974ebeb01b1caf58.pdf) — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5820099/) | Statistical analysis for toxicity studies (J Toxicol Pathol) |
| NCSS / PASS documentation — [PDF](https://www.ncss.com/wp-content/themes/ncss/pdf/Procedures/PASS/Williams_Test_for_the_Minimum_Effective_Dose.pdf) | Williams' test for the minimum effective dose — power analysis |
| Bretz thesis — [PDF](https://www.cell.uni-hannover.de/fileadmin/cell/Forschung/Biostatistik/thesis/thesis_bretz.pdf) | "Powerful modifications of Williams' test on trend" (full doctoral thesis) |

---

## 2. Notation and Test Statistic

Treatments comprise a control (dose 0) and *k* dose levels (doses 1 to *k*), with dose *i* > dose *i*−1. Under equal replication *r* per group, unbiased estimates *X*\_*i* of the mean responses are independently *N*(*M*\_*i*, σ²/*r*), with *s*² an unbiased estimator of σ² on *ν* degrees of freedom.

The ML estimates under monotone ordering are obtained by isotonic regression (pool-adjacent-violators):

$$\hat{M}_i = \max_{1 \le u \le i} \min_{i \le v \le k} \frac{\sum_{j=u}^{v} X_j}{v - u + 1}$$

The test statistic for dose level *i* is:

$$\bar{t}_i = \frac{\hat{M}_i - X_0}{\sqrt{2 s^2 / r}}$$

This is compared against the critical value $\bar{t}_{i,\alpha}$.

### Step-down MED procedure

1. Compare $\bar{t}_k$ with $\bar{t}_{k,\alpha}$. If $\bar{t}_k < \bar{t}_{k,\alpha}$, accept H₀ (no effect at any dose).
2. If $\bar{t}_k > \bar{t}_{k,\alpha}$, reject H₀ and proceed to test dose *k*−1 using $\bar{t}_{k-1}$ against $\bar{t}_{k-1,\alpha}$.
3. Continue downward until a dose level *i* is found where $\bar{t}_i < \bar{t}_{i,\alpha}$.
4. Conclude: evidence for an effect at all dose levels ≥ *i*+1.

The same significance level α is used throughout. The familywise error rate is controlled experimentwise: P(falsely reject H\_*i*) ≤ α for all *i*.

---

## 3. Original Tables from Williams (1971)

### Table 1 — Upper 5% points (one-sided α=0.05)

Source: Williams (1971), p. 107.

| D.F. (ν) | k=1 | k=2 | k=3 | k=4 | k=5 | k=6 | k=7 | k=8 | k=9 | k=10 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 5 | 2.02 | 2.14 | 2.19 | 2.21 | 2.22 | 2.23 | 2.24 | 2.24 | 2.25 | 2.25 |
| 6 | 1.94 | 2.06 | 2.10 | 2.12 | 2.13 | 2.14 | 2.14 | 2.15 | 2.15 | 2.15 |
| 7 | 1.89 | 2.00 | 2.04 | 2.06 | 2.07 | 2.08 | 2.08 | 2.09 | 2.09 | 2.09 |
| 8 | 1.86 | 1.96 | 2.00 | 2.01 | 2.02 | 2.03 | 2.04 | 2.04 | 2.04 | 2.04 |
| 9 | 1.83 | 1.93 | 1.96 | 1.98 | 1.99 | 2.00 | 2.00 | 2.01 | 2.01 | 2.01 |
| 10 | 1.81 | 1.91 | 1.94 | 1.96 | 1.97 | 1.97 | 1.98 | 1.98 | 1.98 | 1.98 |
| 11 | 1.80 | 1.89 | 1.92 | 1.94 | 1.94 | 1.95 | 1.95 | 1.96 | 1.96 | 1.96 |
| 12 | 1.78 | 1.87 | 1.90 | 1.92 | 1.93 | 1.93 | 1.94 | 1.94 | 1.94 | 1.94 |
| 13 | 1.77 | 1.86 | 1.89 | 1.90 | 1.91 | 1.92 | 1.92 | 1.93 | 1.93 | 1.93 |
| 14 | 1.76 | 1.85 | 1.88 | 1.89 | 1.90 | 1.91 | 1.91 | 1.91 | 1.92 | 1.92 |
| 15 | 1.75 | 1.84 | 1.87 | 1.88 | 1.89 | 1.90 | 1.90 | 1.90 | 1.90 | 1.91 |
| 16 | 1.75 | 1.83 | 1.86 | 1.87 | 1.88 | 1.89 | 1.89 | 1.89 | 1.90 | 1.90 |
| 17 | 1.74 | 1.82 | 1.85 | 1.87 | 1.87 | 1.88 | 1.88 | 1.89 | 1.89 | 1.89 |
| 18 | 1.73 | 1.82 | 1.85 | 1.86 | 1.87 | 1.87 | 1.88 | 1.88 | 1.88 | 1.88 |
| 19 | 1.73 | 1.81 | 1.84 | 1.85 | 1.86 | 1.87 | 1.87 | 1.87 | 1.87 | 1.88 |
| 20 | 1.72 | 1.81 | 1.83 | 1.85 | 1.86 | 1.86 | 1.86 | 1.87 | 1.87 | 1.87 |
| 22 | 1.72 | 1.80 | 1.83 | 1.84 | 1.85 | 1.85 | 1.85 | 1.86 | 1.86 | 1.86 |
| 24 | 1.71 | 1.79 | 1.82 | 1.83 | 1.84 | 1.84 | 1.85 | 1.85 | 1.85 | 1.85 |
| 26 | 1.71 | 1.79 | 1.81 | 1.82 | 1.83 | 1.84 | 1.84 | 1.84 | 1.84 | 1.85 |
| 28 | 1.70 | 1.78 | 1.81 | 1.82 | 1.83 | 1.83 | 1.83 | 1.84 | 1.84 | 1.84 |
| 30 | 1.70 | 1.78 | 1.80 | 1.81 | 1.82 | 1.83 | 1.83 | 1.83 | 1.83 | 1.83 |
| 35 | 1.69 | 1.77 | 1.79 | 1.80 | 1.81 | 1.82 | 1.82 | 1.82 | 1.82 | 1.83 |
| 40 | 1.68 | 1.76 | 1.79 | 1.80 | 1.80 | 1.81 | 1.81 | 1.81 | 1.82 | 1.82 |
| 60 | 1.67 | 1.75 | 1.77 | 1.78 | 1.79 | 1.79 | 1.80 | 1.80 | 1.80 | 1.80 |
| 120 | 1.66 | 1.73 | 1.75 | 1.77 | 1.77 | 1.78 | 1.78 | 1.78 | 1.78 | 1.78 |
| ∞ | 1.645 | 1.716 | 1.739 | 1.750 | 1.756 | 1.760 | 1.763 | 1.765 | 1.767 | 1.768 |

### Table 2 — Upper 1% points (one-sided α=0.01)

Source: Williams (1971), p. 108.

| D.F. (ν) | k=1 | k=2 | k=3 | k=4 | k=5 | k=6 | k=7 | k=8 | k=9 | k=10 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 5 | 3.36 | 3.50 | 3.55 | 3.57 | 3.59 | 3.60 | 3.60 | 3.61 | 3.61 | 3.61 |
| 6 | 3.14 | 3.26 | 3.29 | 3.31 | 3.32 | 3.33 | 3.34 | 3.34 | 3.34 | 3.35 |
| 7 | 3.00 | 3.10 | 3.13 | 3.15 | 3.16 | 3.16 | 3.17 | 3.17 | 3.17 | 3.17 |
| 8 | 2.90 | 2.99 | 3.01 | 3.03 | 3.04 | 3.04 | 3.05 | 3.05 | 3.05 | 3.05 |
| 9 | 2.82 | 2.90 | 2.93 | 2.94 | 2.95 | 2.95 | 2.96 | 2.96 | 2.96 | 2.96 |
| 10 | 2.76 | 2.84 | 2.86 | 2.88 | 2.88 | 2.89 | 2.89 | 2.89 | 2.90 | 2.90 |
| 11 | 2.72 | 2.79 | 2.81 | 2.82 | 2.83 | 2.83 | 2.84 | 2.84 | 2.84 | 2.84 |
| 12 | 2.68 | 2.75 | 2.77 | 2.78 | 2.79 | 2.79 | 2.79 | 2.80 | 2.80 | 2.80 |
| 13 | 2.65 | 2.72 | 2.74 | 2.75 | 2.75 | 2.76 | 2.76 | 2.76 | 2.76 | 2.76 |
| 14 | 2.62 | 2.69 | 2.71 | 2.72 | 2.72 | 2.73 | 2.73 | 2.73 | 2.73 | 2.73 |
| 15 | 2.60 | 2.66 | 2.68 | 2.69 | 2.70 | 2.70 | 2.70 | 2.71 | 2.71 | 2.71 |
| 16 | 2.58 | 2.64 | 2.66 | 2.67 | 2.68 | 2.68 | 2.68 | 2.68 | 2.68 | 2.69 |
| 17 | 2.57 | 2.63 | 2.64 | 2.65 | 2.66 | 2.66 | 2.66 | 2.66 | 2.67 | 2.67 |
| 18 | 2.55 | 2.61 | 2.63 | 2.64 | 2.64 | 2.64 | 2.65 | 2.65 | 2.65 | 2.65 |
| 19 | 2.54 | 2.60 | 2.61 | 2.62 | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 | 2.63 |
| 20 | 2.53 | 2.58 | 2.60 | 2.61 | 2.61 | 2.62 | 2.62 | 2.62 | 2.62 | 2.62 |
| 22 | 2.51 | 2.56 | 2.58 | 2.59 | 2.59 | 2.59 | 2.60 | 2.60 | 2.60 | 2.60 |
| 24 | 2.49 | 2.55 | 2.56 | 2.57 | 2.57 | 2.57 | 2.58 | 2.58 | 2.58 | 2.58 |
| 26 | 2.48 | 2.53 | 2.55 | 2.55 | 2.56 | 2.56 | 2.56 | 2.56 | 2.56 | 2.56 |
| 28 | 2.47 | 2.52 | 2.53 | 2.54 | 2.54 | 2.55 | 2.55 | 2.55 | 2.55 | 2.55 |
| 30 | 2.46 | 2.51 | 2.52 | 2.53 | 2.53 | 2.54 | 2.54 | 2.54 | 2.54 | 2.54 |
| 35 | 2.44 | 2.49 | 2.50 | 2.51 | 2.51 | 2.51 | 2.51 | 2.52 | 2.52 | 2.52 |
| 40 | 2.42 | 2.47 | 2.48 | 2.49 | 2.49 | 2.50 | 2.50 | 2.50 | 2.50 | 2.50 |
| 60 | 2.39 | 2.43 | 2.45 | 2.45 | 2.46 | 2.46 | 2.46 | 2.46 | 2.46 | 2.46 |
| 120 | 2.36 | 2.40 | 2.41 | 2.42 | 2.42 | 2.42 | 2.42 | 2.42 | 2.42 | 2.43 |
| ∞ | 2.326 | 2.366 | 2.377 | 2.382 | 2.385 | 2.386 | 2.387 | 2.388 | 2.389 | 2.389 |

### Key property

Critical values increase very little as *k* grows beyond 5. At ν=∞ the difference between k=6 and k=10 is only 0.008. This means including additional low doses in an experiment barely affects the power of detecting an effect at the highest dose — a significant advantage over other multiple comparison procedures.

---

## 4. Tables from Williams (1972): Unequal Control Replication

Williams (1972) extended the test to unequal replications. If dose treatments have equal replication *r* and the control has replication *c* ≥ *r*, the test statistic becomes:

$$\bar{t}_i = (\hat{M}_i - X_0)(s^2/r + s^2/c)^{-1/2}$$

Rather than tabulate for every *w* = *c*/*r*, Williams found that the decrease in critical values is approximately linear in 1/√*w* and provided an extrapolation formula:

$$\bar{t}_{i,\alpha}(w) = \bar{t}_{i,\alpha}(1) - 10^{-2} \cdot \beta \cdot (1 - 1/\sqrt{w})$$

where β is an integer coefficient tabulated alongside each critical value. This formula is accurate to within 0.01 for *w* ≤ 4 and within 0.02 for *w* = 5 or 6.

When the control mean is known (*w* → ∞), the modified formula applies:

$$\bar{t}_{i,\alpha}(\infty) = \bar{t}_{i,\alpha}(1) - 10^{-2} \cdot (\beta + 2)$$

Four tables are given for α = 0.050, 0.025, 0.010, and 0.005 (all one-sided). Dose levels *i* = 2, 3, 4, 5, 6, 8, 10; values for *i* = 7 and 9 can be interpolated.

### Table 1 (α=0.050) — excerpt

Source: Williams (1972), p. 522.

Each cell shows $\bar{t}_{i,\alpha}(1)$ with β as superscript.

| D.F. | i=2 | i=3 | i=4 | i=5 | i=6 | i=8 | i=10 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 5 | 2.142² | 2.186⁴ | 2.209⁵ | 2.223⁵ | 2.232⁶ | 2.243⁶ | 2.250⁶ |
| 10 | 1.908³ | 1.940⁴ | 1.956⁵ | 1.965⁵ | 1.971⁶ | 1.979⁶ | 1.983⁷ |
| 20 | 1.807³ | 1.834⁴ | 1.847⁵ | 1.855⁵ | 1.860⁶ | 1.866⁶ | 1.870⁷ |
| 40 | 1.761³ | 1.785⁴ | 1.797⁵ | 1.804⁵ | 1.809⁶ | 1.814⁶ | 1.818⁷ |
| 120 | 1.731³ | 1.754⁴ | 1.765⁵ | 1.772⁵ | 1.776⁶ | 1.781⁶ | 1.784⁷ |
| ∞ | 1.716³ | 1.739⁴ | 1.750⁵ | 1.756⁵ | 1.760⁶ | 1.765⁶ | 1.768⁷ |

### Table 2 (α=0.025) — excerpt

Source: Williams (1972), p. 523. **For two-sided tests at 5%, use these values.**

| D.F. | i=2 | i=3 | i=4 | i=5 | i=6 | i=8 | i=10 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 5 | 2.699³ | 2.743⁵ | 2.766⁶ | 2.779⁶ | 2.788⁷ | 2.799⁷ | 2.806⁸ |
| 10 | 2.313³ | 2.341⁵ | 2.355⁶ | 2.363⁶ | 2.368⁶ | 2.375⁷ | 2.379⁷ |
| 20 | 2.155³ | 2.177⁴ | 2.187⁵ | 2.193⁶ | 2.197⁶ | 2.202⁷ | 2.205⁷ |
| 40 | 2.083³ | 2.102⁴ | 2.111⁵ | 2.116⁶ | 2.119⁶ | 2.123⁶ | 2.126⁷ |
| 120 | 2.037³ | 2.055⁴ | 2.063⁵ | 2.068⁶ | 2.071⁶ | 2.074⁶ | 2.076⁷ |
| ∞ | 2.015³ | 2.032⁴ | 2.040⁵ | 2.044⁶ | 2.047⁶ | 2.050⁶ | 2.052⁶ |

### Table 3 (α=0.010) — excerpt

Source: Williams (1972), p. 524.

| D.F. | i=2 | i=3 | i=4 | i=5 | i=6 | i=8 | i=10 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 5 | 3.501⁴ | 3.548⁶ | 3.572⁷ | 3.586⁸ | 3.595⁹ | 3.607⁹ | 3.614¹⁰ |
| 10 | 2.840³ | 2.865⁵ | 2.877⁶ | 2.883⁷ | 2.888⁷ | 2.893⁸ | 2.896⁸ |
| 20 | 2.584³ | 2.601⁵ | 2.609⁵ | 2.613⁶ | 2.616⁶ | 2.619⁷ | 2.621⁷ |
| 40 | 2.471³ | 2.484⁴ | 2.491⁵ | 2.494⁵ | 2.496⁶ | 2.499⁶ | 2.500⁶ |
| 120 | 2.400³ | 2.412⁴ | 2.417⁵ | 2.420⁵ | 2.422⁵ | 2.424⁵ | 2.425⁶ |
| ∞ | 2.366³ | 2.377⁴ | 2.382⁵ | 2.385⁵ | 2.386⁵ | 2.388⁵ | 2.389⁶ |

### Table 4 (α=0.005) — excerpt

Source: Williams (1972), p. 525. **For two-sided tests at 1%, use these values.**

| D.F. | i=2 | i=3 | i=4 | i=5 | i=6 | i=8 | i=10 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 5 | 4.179⁵ | 4.229⁷ | 4.255⁹ | 4.270¹⁰ | 4.279¹⁰ | 4.292¹¹ | 4.299¹¹ |
| 10 | 3.242⁴ | 3.265⁶ | 3.275⁶ | 3.281⁷ | 3.286⁷ | 3.290⁸ | 3.293⁸ |
| 20 | 2.894³ | 2.908⁴ | 2.915⁵ | 2.918⁶ | 2.920⁶ | 2.923⁶ | 2.925⁷ |
| 40 | 2.744³ | 2.755⁴ | 2.759⁵ | 2.762⁵ | 2.764⁵ | 2.765⁵ | 2.766⁵ |
| 120 | 2.651³ | 2.660⁴ | 2.664⁴ | 2.666⁴ | 2.667⁵ | 2.669⁵ | 2.669⁵ |
| ∞ | 2.607³ | 2.615⁴ | 2.618⁴ | 2.620⁴ | 2.621⁴ | 2.623⁵ | 2.623⁵ |

### Optimum control replication

Williams (1972, §3) recommends *w* = *c*/*r* approximately √*k* (or slightly larger, 1.1√*k* to 1.4√*k*). Power is insensitive to the exact choice of *w* around the optimum.

### Effect of unequal dose treatment replication

Williams (1972, §4, Table 5) shows that if dose treatment replications satisfy 0.80 ≤ *r*\_*i*/*r*\_*k* ≤ 1.25 for all 1 ≤ *i* ≤ *k*−1, the standard tables give critical values to sufficient accuracy. For ratios as extreme as 0.50 or 2.00 the effect can reach 0.02–0.05.

---

## 5. Comparison with Dunnett's Critical Values

Both tests control the familywise error rate for comparisons against a control, and both rely on the multivariate *t*-distribution. The crucial difference is in the correlation structure.

For a balanced design with *k* dose groups, Dunnett's off-diagonal correlations are all ρ = 0.5 (equicorrelation). Williams' correlation matrix has entries in the range 0.82–0.94 (for *k*=3), because the contrasts overlap through progressive averaging.

Consequence at ν=∞, α=0.05 one-sided:

| k | Williams | Dunnett (approx.) |
|:---:|:---:|:---:|
| 2 | 1.716 | ~1.92 |
| 3 | 1.739 | ~2.06 |
| 5 | 1.756 | ~2.22 |

The lower Williams thresholds yield substantially higher power when the monotonicity assumption holds. The tradeoff: Williams' test is invalid under non-monotone dose–response (e.g. hormesis).

---

## 6. Software Implementations

### R packages

| Package | Function | Approach | Links |
|:---|:---|:---|:---|
| **PMCMRplus** | `williamsTest()` | Stored tables from Williams (1972) in `sysdata.rda`; Shirley-Williams variant also available | [CRAN](https://search.r-project.org/CRAN/refmans/PMCMRplus/html/williamsTest.html) · [Source](https://rdrr.io/cran/PMCMRplus/src/R/williamsTest.R) · [GitHub](https://github.com/cran/PMCMRplus) · [README](https://rdrr.io/cran/PMCMRplus/f/README.md) |
| **PMCMRplus** | `shirleyWilliamsTest()` | Nonparametric rank-based variant (Shirley-Williams) | [CRAN](https://search.r-project.org/CRAN/refmans/PMCMRplus/html/shirleyWilliamsTest.html) · [Source](https://github.com/cran/PMCMRplus/blob/master/R/shirleyWilliamsTest.R) |
| **PMCMRplus** | `power.williams.test()` | Power / sample size; contains asymptotic critical values hardcoded | [Source](https://rdrr.io/cran/PMCMRplus/src/R/power.williams.test.R) |
| **multcomp** | `glht()` with `mcp(dose="Williams")` | Exact computation via multivariate *t* (`mvtnorm::qmvt`); works for arbitrary designs | [CRAN](https://cran.r-project.org/web/packages/multcomp/multcomp.pdf) · [glht docs](https://rdrr.io/cran/multcomp/man/glht.html) · [contrMat](https://rdrr.io/cran/multcomp/man/contrMat.html) |
| **multcomp** | `contrMat(n, type="Williams")` | Constructs the Williams contrast matrix | [Source](https://rdrr.io/cran/multcomp/src/R/contrMat.R) · [R docs](https://search.r-project.org/CRAN/refmans/simboot/html/contrMat.html) |
| **mvtnorm** | `qmvt()`, `pmvt()` | Quantiles / CDF of the multivariate *t*-distribution (Genz-Bretz algorithm) | [CRAN](https://cran.rstudio.com/web/packages/mvtnorm/refman/mvtnorm.html) · [qmvt](https://rdrr.io/rforge/mvtnorm/man/qmvt.html) · [pmvt](https://rdrr.io/cran/mvtnorm/man/pmvt.html) |
| **StatCharrms** | `williamsTestLookUpTable` | EPA package with stored lookup table | Available on CRAN |

### Extracting full tables from R

```r
# Method 1: PMCMRplus internal tables
library(PMCMRplus)
tk005 <- PMCMRplus:::TabCrit$williams.tk005
beta005 <- PMCMRplus:::TabCrit$williams.beta005
write.csv(tk005, "williams_tk005.csv")

# Method 2: StatCharrms
library(StatCharrms)
data(williamsTestLookUpTable)
write.csv(williamsTestLookUpTable, "williams_statcharrms.csv")

# Method 3: Compute exactly for any design
library(multcomp); library(mvtnorm)
n <- rep(10, 5)  # 4 doses + control, n=10 each
names(n) <- c("ctrl", paste0("d", 1:4))
CM <- contrMat(n, type = "Williams")
V <- CM %*% diag(1/n) %*% t(CM)
R <- cov2cor(V)
df <- sum(n) - 5
crit <- qmvt(0.95, df = df, corr = R, tail = "lower.tail")$quantile
```

### Python

No dedicated Python package implements Williams' test. The module **`williams_tables.py`** (produced in this project) provides all six original tables as Python dicts with lookup functions supporting the extrapolation formula for unequal replication.

For exact computation in Python, the multivariate *t*-distribution quantiles can be obtained via `rpy2` (calling R's `mvtnorm::qmvt`) or through numerical integration using `scipy.stats`.

---

## 7. Modern Exact Computation via Multiple Contrast Tests

Bretz (2006) reformulated Williams' test as a special case of the Multiple Contrast Test (MCT) framework. The Williams contrast matrix for *k* total groups (1 control + *k*−1 doses), balanced with *n* per group, is:

For k=4 (1 control + 3 doses):

```
C₁: (-1,   0,    0,    1  )    # control vs dose 3
C₂: (-1,   0,   1/2,  1/2)    # control vs average of doses 2–3
C₃: (-1,  1/3,  1/3,  1/3)    # control vs average of all doses
```

The null distribution of the maximum contrast statistic is a *k*−1 dimensional multivariate *t*-distribution with correlation matrix R = cov2cor(C · diag(1/n) · Cᵀ) and *ν* degrees of freedom. Critical values are obtained via `qmvt()`.

Advantages over stored tables:

- Handles any α (not limited to four tabulated levels)
- Works for arbitrary unbalanced designs
- No interpolation needed for non-tabulated df
- Exact rather than approximate for non-standard *w*

---

## 8. References

1. Williams, D.A. (1971). A test for differences between treatment means when several dose levels are compared with a zero dose control. *Biometrics* **27**, 103–117. [JSTOR](http://www.jstor.org/stable/2528930)

2. Williams, D.A. (1972). The comparison of several dose levels with a zero dose control. *Biometrics* **28**, 519–531. [JSTOR](http://www.jstor.org/stable/2556164) · [Google Scholar](https://scholar.google.com/scholar_lookup?title=The+comparison+of+several+dose+levels+with+a+zero+dose+control&author=DA.+Williams&publication_year=1972&journal=Biometrics&volume=28&pages=519-531)

3. Bretz, F. (2006). An extension of the Williams trend test to general unbalanced linear models. *Computational Statistics & Data Analysis* **50**, 1735–1748. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0167947305000344) · [ResearchGate](https://www.researchgate.net/publication/4733544_An_extension_of_the_Williams_trend_test_to_general_unbalanced_linear_models) · [ACM](https://dl.acm.org/doi/10.1016/j.csda.2005.02.005)

4. Bretz, F. (1999). Powerful modifications of Williams' test on trend. Doctoral thesis, University of Hannover. [PDF](https://www.cell.uni-hannover.de/fileadmin/cell/Forschung/Biostatistik/thesis/thesis_bretz.pdf)

5. Bretz, F. & Hothorn, L.A. (2001). A powerful alternative to Williams' test with application to toxicological dose-response relationships of normally distributed data. *Environmental and Ecological Statistics* **8**, 351–367. [Springer](https://link.springer.com/article/10.1023/A:1009622928188)

6. Hothorn, L.A. (2014). Statistical evaluation of toxicological bioassays — a review. *Toxicology Research* **3**, 418–432. [RSC](https://pubs.rsc.org/en/content/articlehtml/2014/tx/c4tx00047a)

7. Hothorn, L.A. & Hauschke, D. (2000). Statistical evaluation of toxicological assays: Dunnett or Williams test — take both. *Archives of Toxicology*. [ResearchGate](https://www.researchgate.net/publication/236653799_Statistical_evaluation_of_toxicological_assays_Dunnett_or_Williams_test_-_Take_both) · [Academia](https://www.academia.edu/7391089/Statistical_evaluation_of_toxicological_assays_Dunnett_or_Williams_test_take_both)

8. Yoshimura, I. & Matsunaga, Y. (2018). Statistical analysis for toxicity studies. *Journal of Toxicologic Pathology* **31**, 15–22. [PDF](https://pdfs.semanticscholar.org/023b/276f79d2e72d793de597974ebeb01b1caf58.pdf) · [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5820099/)

9. Marcus, R. et al. (1996). Multiple test procedures for dose finding. *Biometrics*. [PubMed](https://pubmed.ncbi.nlm.nih.gov/8934584/)

10. Hothorn, T. et al. (2008). Simultaneous inference in general parametric models (multcomp). *Biometrical Journal*. [CRAN](https://cran.r-project.org/web/packages/multcomp/multcomp.pdf) · [glht](https://rdrr.io/cran/multcomp/man/glht.html)

11. Pohlert, T. PMCMRplus: Calculate Pairwise Multiple Comparisons of Mean Rank Sums Extended. [CRAN](https://search.r-project.org/CRAN/refmans/PMCMRplus/html/williamsTest.html) · [GitHub](https://github.com/cran/PMCMRplus) · [README](https://rdrr.io/cran/PMCMRplus/f/README.md)

12. NCSS / PASS. Williams' test for the minimum effective dose. [PDF](https://www.ncss.com/wp-content/themes/ncss/pdf/Procedures/PASS/Williams_Test_for_the_Minimum_Effective_Dose.pdf)

13. Neuhäuser, M. & Hothorn, L.A. Evaluation of toxicological studies using a nonparametric Shirley-type trend test. [ResearchGate](https://www.researchgate.net/publication/241734101_Evaluation_of_Toxicological_Studies_Using_a_Nonparametric_Shirley-Type_Trend_Test_for_Comparing_Several_Dose_Levels_with_a_Control_Group)

14. Hothorn, L.A. Robust Williams trend test. [ResearchGate](https://www.researchgate.net/publication/243050174_Robust_Williams_trend_test)

15. Chen, J.J. et al. (2014). Statistical methods for selecting maximum effective dose and evaluating treatment effect when dose–response is monotonic. *Statistics in Medicine*. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4110746/)
