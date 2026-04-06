# Fisher's Exact Test & Boschloo's Exact Test

`scipy.stats.fisher_exact` and `scipy.stats.boschloo_exact` are **verified correct**: all 114 checks pass against an independent oracle (hypergeometric enumeration from `math.comb`, zero shared code paths with SciPy), published exact fractions, and algebraic identities.

**Validation script**: [validate_fisher_boschloo.py](../../../backend/services/analysis/validation/validate_fisher_boschloo.py)

**References**:

| # | Reference | Description |
|---|-----------|-------------|
| 1 | Fisher RA (1935) | The Design of Experiments — "Lady Tasting Tea" (Chapter 2) |
| 2 | Agresti A (2002) | Categorical Data Analysis, 2nd ed. — §3.5: Fisher's Exact Test |
| 3 | Boschloo RD (1970) | "Raised conditional level of significance…" — Statistica Neerlandica, 24(1) |
| 4 | Lydersen S et al. (2009) | "Recommended tests for association in 2×2 tables" — Statistics in Medicine, 28(7) |
| 5 | Rosner B (2006) | Fundamentals of Biostatistics, 6th ed. — Example 10.13 |

**Results** (114 / 114 passed):

| Test group | # Tests | What is verified |
|------------|:-------:|------------------|
| 1. Oracle self-test | 10 | Hypergeometric PMFs sum to 1.0; match hand-computed rational values [Fisher35] |
| 2. Fisher two-sided p vs oracle | 12 | SciPy matches independent oracle on 12 tables (|Δ| < 10⁻¹⁰) |
| 3. Fisher one-sided p vs oracle | 24 | `greater` and `less` alternatives on same 12 tables |
| 4. Fisher odds ratio vs oracle | 8 | OR values incl. published [Fisher35, Agresti02, Rosner06], zero-cell (0, ∞) |
| 5. Algebraic identities [Agresti02] | 18 | Transpose invariance, row-swap OR inversion, p(≥a)+p(≤a)−P(a)=1 |
| 6. Published exact fractions | 5 | 17/35 [Fisher35], 44/429 [Agresti02], 1/126, 1/92378 |
| 7. 100 random tables vs oracle | 1 | All 100 random 2×2 tables: |SciPy − oracle| < 10⁻¹⁰ |
| 8. Boschloo statistic identity | 5 | stat = min(Fisher p_gt, p_lt) per [Boschloo70] §2 |
| 9. Boschloo power dominance | 6 | p(Boschloo) ≤ p(Fisher) on named + 30 random tables [Lydersen09] |
| 10. Published example [Saari04] | 2 | Boschloo < Fisher for both one-sided and two-sided |
| 11. Boschloo one-sided consistency | 10 | p(2s) ≤ 2·min(p_gt, p_lt); OR direction ↔ p ordering |
| 12. Null hypothesis tables | 3 | Balanced/near-null tables → p > 0.10 |
| 13. n parameter stability | 2 | |p(n=32) − p(n=128)| < 0.01 |
| 14. Edge cases | 3 | Perfect separation, symmetry, negative input → ValueError |
| 15. Practical significance | 5 | Fisher p < 0.05 ⇒ Boschloo p < 0.05; non-significant agreement |

### Conclusion

Both `fisher_exact` and `boschloo_exact` from SciPy are safe to use in the SENDEX pipeline for 2×2 incidence table analysis.
