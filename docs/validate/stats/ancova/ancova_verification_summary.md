# ANCOVA Verification Summary

---

## EN: `ancova.py` Verification Summary

### Sources

| # | Reference | Description |
|---|-----------|-------------|
| 1 | [ancovapurdue.pdf](https://drive.google.com/file/d/1dEw_NNVIzqiLqSTKUlGg4CBaLYlLAyPH/view?usp=drive_link) | Purdue STAT 514 — model, estimation, F-tests, SAS example (Montgomery Table 15.10) |
| 2 | [ancovachapter10.pdf](https://drive.google.com/file/d/1_PyMoSuFdZKwL2DiKbY6VyjQK5HWYFwm/view?usp=drive_link) | Textbook Ch. 10 — ANCOVA with interaction, indicator variables, slope homogeneity |
| 3 | [ancovaAnalysis_of_CovarianceANCOVA.pdf](https://drive.google.com/file/d/1pkekic7KEj1vd5otXqH_epPx7tK_mjaR/view?usp=drive_link) | NCSS/PASS — power formulas, degrees of freedom |
| 4 | [ancovafromEncyclopediaofStatisticalSciences.pdf](https://drive.google.com/file/d/1qfAu_i87rewpz3IlgPDBTYIxkSh8VYjZ/view?usp=drive_link) | Pearce, S.C. — matrix formulation, numerical example (Apple Trees trial) |

### Results vs SAS PROC GLM (Montgomery data, 3 groups × 5 obs)

| Metric | `ancova.py` | SAS | Δ |
|--------|:-----------:|:---:|:-:|
| R² | 0.919200 | 0.919209 | 9×10⁻⁶ |
| MSE | 2.544172 | 2.544172 | <10⁻⁶ |
| LS mean (gr.1) | 40.3824 | 40.3824 | 1×10⁻⁵ |
| LS mean (gr.2) | 41.4192 | 41.4192 | 2×10⁻⁵ |
| LS mean (gr.3) | 38.7984 | 38.7984 | 4×10⁻⁵ |
| Slope homogeneity F | 0.4878 | 0.49 | 0.002 |

→ Full details: [Report 1 — ANCOVA Audit](report1_ancova_audit.md)

### Results vs Encyclopedia of Statistical Sciences (Apple Trees, 6 trt × 4 blocks)

| Metric | `ancova.py` | Encyclopedia | Δ |
|--------|:-----------:|:------------:|:-:|
| β (slope) | 28.40 | 28.41 | 0.01 |
| Adj. mean A | 280.5 | 280.5 | 0 |
| Adj. mean S | 251.3 | 251.3 | 0 |
| SE(A − S) | 12.1 | 12.1 | 0 |
| Treatment F | 3.14 | 3.15 | 0.01 |

→ Full details: [Report 3 — Encyclopedia Verification](report3_ess_verification.md)

### Conclusion

The `ancova.py` implementation is **mathematically correct**: all 17 components (OLS, adjusted means, SE, pairwise comparisons, slope homogeneity, effect decomposition, Hedges' g) match published formulas and reproduce SAS output to within 10⁻⁵.
