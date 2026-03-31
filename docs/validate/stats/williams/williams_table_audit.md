# Audit of `WILLIAMS_TABLE`: Comparison with Original Williams (1971, 1972)

## Sources

- Williams, D.A. (1971). *A test for differences between treatment means when several dose levels are compared with a zero dose control.* Biometrics **27**, 103–117. Tables 1 and 2.
- Williams, D.A. (1972). *The comparison of several dose levels with a zero dose control.* Biometrics **28**, 519–531. Tables 1–4.

## Verdict

**The existing `WILLIAMS_TABLE` does not match the original.** Three categories of errors were found.

---

## 1. Monotonicity violation at df=20 (α=0.01)

Critical values must decrease as df increases. In the α=0.01 column, values at df=20 are **higher** than at df=15:

| k | df=15 | df=20 | Δ |
|:---:|:---:|:---:|:---:|
| 2 | 2.44 | **2.46** | +0.02 |
| 3 | 2.49 | **2.54** | +0.05 |
| 4 | 2.53 | **2.57** | +0.04 |

Likely cause: values for df ≤ 15 and df ≥ 20 originate from different sources (or were computed with different parameters) and were mechanically merged into a single table.

---

## 2. α=0.05 column: systematic upward bias

Every value in `WILLIAMS_TABLE` exceeds the original. The bias grows with k:

| k | Range of Δ | Mean Δ |
|:---:|:---:|:---:|
| 2 | +0.01 … +0.06 | +0.04 |
| 3 | +0.01 … +0.10 | +0.06 |
| 4 | +0.01 … +0.11 | +0.07 |
| 5 | +0.11 … +0.12 | +0.12 |

Largest discrepancies:

| k | df | `WILLIAMS_TABLE` | Williams (1971) | Δ |
|:---:|:---:|:---:|:---:|:---:|
| 5 | 20 | 1.98 | 1.86 | **+0.12** |
| 5 | 30 | 1.94 | 1.82 | **+0.12** |
| 4 | 20 | 1.96 | 1.85 | **+0.11** |
| 4 | 30 | 1.92 | 1.81 | **+0.11** |
| 3 | 20 | 1.93 | 1.83 | **+0.10** |

**Impact:** inflated critical values make the test overly conservative — actual power falls below the nominal level. At Δ ≈ +0.10, a result that should be declared significant may be missed.

---

## 3. α=0.01 column: systematic downward bias

Every value is lower than the original. The discrepancy is especially large at small df:

| k | df | `WILLIAMS_TABLE` | Williams (1971) | Δ |
|:---:|:---:|:---:|:---:|:---:|
| 2 | 5 | 3.02 | 3.50 | **−0.48** |
| 3 | 5 | 3.08 | 3.55 | **−0.47** |
| 4 | 5 | 3.13 | 3.57 | **−0.44** |
| 2 | 6 | 2.87 | 3.26 | **−0.39** |
| 3 | 6 | 2.92 | 3.29 | **−0.37** |
| 4 | 6 | 2.97 | 3.31 | **−0.34** |

At larger df (≥ 20) the discrepancy narrows but persists:

| k | df | `WILLIAMS_TABLE` | Williams (1971) | Δ |
|:---:|:---:|:---:|:---:|:---:|
| 2 | 120 | 2.29 | 2.40 | −0.11 |
| 3 | 120 | 2.36 | 2.41 | −0.05 |
| 4 | 120 | 2.39 | 2.42 | −0.03 |

**Impact:** deflated critical values make the test overly liberal — the actual Type I error rate exceeds the nominal 1%. At df=5 the gap of ≈ 0.5 means the true α may be several times larger than claimed.

---

## Summary

| Issue | Column | Direction | Max error | Effect on test |
|:---|:---:|:---:|:---:|:---|
| Monotonicity violation | α=0.01 | — | — | Invalid values |
| Systematic upward bias | α=0.05 | + | +0.12 | Conservative (power loss) |
| Systematic downward bias | α=0.01 | − | −0.48 | Liberal (inflated α) |

---

## Recommendation

Replace `WILLIAMS_TABLE` entirely with tables digitized from the original papers. Ready-to-use module: **`williams_tables.py`** (all 6 tables from Williams 1971 and 1972 with `lookup_1971()` and `lookup_1972()` helper functions).
