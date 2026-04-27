# LOO bimodality: min(t,c) vs median(t,c) summary comparison

**Generated:** 2026-04-27T19:53:10Z
**Source:** `backend/simulations/loo_bimodality_minmedian.py`
**Seed:** 42  N=3  iterations=5,000
**Signal count (gLower>0):** 4,969 of 5,000 = 99.4%

## Summary

| Metric | min(t,c) | median(t,c) |
|---|---:|---:|
| Mean | 0.651 | 0.716 |
| Median | 0.923 | 0.945 |
| SD | 0.445 | 0.435 |
| P5 | 0.000 | 0.000 |
| P25 | 0.031 | 0.378 |
| P75 | 1.030 | 1.061 |
| P95 | 1.126 | 1.190 |
| **Bimodality coef (Sarle's b)** | **0.794** (BIMODAL) | **0.638** (BIMODAL) |
| Frac in tails (<0.2 or >0.8) | 0.816 | 0.748 |
| Frac in middle [0.2, 0.8] | 0.184 | 0.252 |

**Sarle's b threshold for bimodality:** > 5/9 = 0.555 (Pfister et al. 2013).

## Histogram: min(t,c) bidir ratio

```
  [0.00, 0.11)   1303   26.2%  ##############################
  [0.11, 0.21)     80    1.6%  ##
  [0.21, 0.32)     88    1.8%  ##
  [0.32, 0.42)    116    2.3%  ###
  [0.42, 0.53)     95    1.9%  ##
  [0.53, 0.63)    544   10.9%  #############
  [0.63, 0.74)     59    1.2%  #
  [0.74, 0.84)      3    0.1%  
  [0.84, 0.95)    507   10.2%  ############
  [0.95, 1.05)   1141   23.0%  ##########################
```

## Histogram: median(t,c) bidir ratio

```
  [0.00, 0.11)    929   18.7%  #########################
  [0.11, 0.21)     86    1.7%  ##
  [0.21, 0.32)    149    3.0%  ####
  [0.32, 0.42)    131    2.6%  ####
  [0.42, 0.53)    195    3.9%  #####
  [0.53, 0.63)    600   12.1%  ################
  [0.63, 0.74)    164    3.3%  ####
  [0.74, 0.84)      7    0.1%  
  [0.84, 0.95)    220    4.4%  ######
  [0.95, 1.05)   1119   22.5%  ##############################
```

## Interpretation (duplicate-GAP-202 / R2-F1 follow-up)

The original R2 finding flagged that the LOO bidirectional null distribution at small N is bimodal — values cluster near 0 or 1 with sparse density in the 0.2-0.8 range where the sigmoid gradient is steepest. The R2 reviewer's claim implied ~50% of null iterations were in the upper mode (~1.0).

**Empirical result (N=3, 5000 iterations, seed=42):**
- min(t,c) summary: bimodality coef = 0.794 (BIMODAL). Frac in middle [0.2, 0.8] = 0.184.
- median(t,c) summary: bimodality coef = 0.638 (BIMODAL). Frac in middle [0.2, 0.8] = 0.252.

**Verdict:**
- The median summary REDUCES bimodality vs min when Sarle's b drops below the 0.555 threshold (or moves substantially toward unimodality).
- Middle-density fraction shifts from 0.184 (min) to 0.252 (median) — modest change.
- The production scoring change (commit 573f3031, GAP-187) using median rather than min is mechanically what's now consumed by the sigmoid; this simulation confirms whether the change resolves the R2-flagged degeneracy.

## Reproduction

```bash
cd backend && OPENBLAS_NUM_THREADS=1 venv/Scripts/python.exe simulations/loo_bimodality_minmedian.py
```
