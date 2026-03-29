# SENDEX Validation Suite

Automated validation of SENDEX signal detection against known ground truth and expert (SME) reference data from submission reports.

## Approach

SENDEX is validated at three levels:

1. **Ground truth** — PointCross (PC201708) is a synthetic 13-week rat toxicity study with 13 explicitly engineered signals documented in the nSDRG. We verify detection of every known signal.
2. **Cross-study benchmark** — 16 additional studies spanning repeat-dose, single-dose, vaccine, gene therapy, safety pharmacology, and multi-compound designs across rat, dog, rabbit, and monkey species. Automated results are compared against conclusions from submission reports (nSDRGs, define.xml, study reports). 9 studies added 2026-03-28 are pending generator run.
3. **Classification verdicts** — Expert evaluation of every partial match, gap, and over-classification to determine whether each is (a) correct behavior requiring human judgment, (b) a genuine algorithmic issue to fix, or (c) a valid additional signal.

## Study Sources

All datasets are from [PhUSE SEND pilot](https://github.com/phuse-org/phuse-scripts/tree/master/data/send) (MIT license).

| Study | Type | Species | Design | Validation Role |
|---|---|---|---|---|
| PointCross (PC201708) | 13-week repeat-dose | SD Rat | 4 groups, M+F, recovery | **Ground truth** — 13 engineered signals |
| Study2 (CBER-POC) | Repeat-dose vaccine | NZW Rabbit | Control + 1 treatment | Multi-domain detection, adversity classification |
| Study4 (CBER-POC) | Repeat-dose vaccine | NZW Rabbit | Control + 2 treatments | Best non-PointCross study, target organ evaluation |
| Study1 (CBER-POC) | Immunogenicity | Cynomolgus | Single-arm, no control | Edge case: no-control handling |
| Study3 (CBER-POC) | Single-dose gene therapy | Cynomolgus | 2 treatments, no control | Edge case: no-control NOAEL |
| Study5 (CBER-POC) | CV safety pharmacology | Beagle Dog | Latin square crossover | Unsupported design validation |
| CJUGSEND00 | CV safety pharmacology | Cynomolgus | Dose escalation | Unsupported design validation |
| CJ16050 | Respiratory safety pharm | SD Rat | Parallel, single dose | Non-monotonic dose-response |
| CV01 (CDISC POC) | CV safety pharmacology | Beagle Dog | Latin square crossover, 4 doses | Proper crossover with CV+EG+VS |
| FFU | Repeat-dose IV (multi-compound) | Cynomolgus | 5 groups, 3 compounds | Multi-compound handling, small N |
| Nimort-01 (Nimble) | 3-week repeat-dose | F344 Rat | 3 groups, parallel | Non-SD rat strain, unbalanced sex |
| PDS2014 | 1-month repeat-dose + recovery | SD Rat | 4 groups + TK subsets | Comprehensive PointCross-like |
| 35449 (TOXSCI) | 1-month repeat-dose | Beagle Dog | 4 groups + recovery | First non-crossover dog, IDO1 inhibitor |
| 43066 (TOXSCI) | 1-month repeat-dose | Beagle Dog | 4 groups + recovery | Cross-compound comparison |
| 87497 (TOXSCI) | 1-month repeat-dose | SD Rat | 4 groups + recovery | Largest rat study (n=160), cross-species |
| 96298 (TOXSCI) | 1-month repeat-dose | SD Rat | 4 groups + recovery | Death data, cross-species comparison |
| GLP003 (instem) | 1-month repeat-dose + recovery | SD Rat | 5 groups (dual control) | Largest study (n=241), dual control |

## Automated Regression

The ground truth assertions are encoded as vitest tests in `frontend/tests/ground-truth-validation.test.ts`. These run on every commit via the pre-commit hook.

To regenerate all study data and validate:

```bash
bash scripts/regenerate-validation.sh
```

## Documents

- [pointcross-ground-truth.md](pointcross-ground-truth.md) — Signal-by-signal detection results for the synthetic benchmark study
- [multi-study-benchmark.md](multi-study-benchmark.md) — Combined validation: trial design (dose groups, controls, recovery, TK, crossover), classification (findings, adversity, NOAEL), and systemic gap resolution
- [classification-verdicts.md](classification-verdicts.md) — Expert evaluation of every discrepancy with literature references

## Validation Version

- **Engine version:** Commit `6aadd74` (2026-03-29)
- **Last full validation:** 2026-03-29
- **Frontend tests at validation time:** 1826 passing
- **Studies generating:** 16 of 16
- **Root causes resolved:** 9 of 9 (RC-1 through RC-9)
- **Previous validation:** Commit `119dcdf` (2026-03-28) — 7 of 16 studies, pre root-cause fixes
