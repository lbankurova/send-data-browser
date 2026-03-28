# SENDEX Validation Suite

Automated validation of SENDEX signal detection against known ground truth and expert (SME) reference data from submission reports.

## Approach

SENDEX is validated at three levels:

1. **Ground truth** — PointCross (PC201708) is a synthetic 13-week rat toxicity study with 13 explicitly engineered signals documented in the nSDRG. We verify detection of every known signal.
2. **Cross-study benchmark** — 7 additional studies spanning repeat-dose, single-dose, vaccine, gene therapy, and safety pharmacology designs. Automated results are compared against conclusions from submission reports (nSDRGs, define.xml, study reports).
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

## Automated Regression

The ground truth assertions are encoded as vitest tests in `frontend/tests/ground-truth-validation.test.ts`. These run on every commit via the pre-commit hook.

To regenerate all study data and validate:

```bash
bash scripts/regenerate-validation.sh
```

## Documents

- [pointcross-ground-truth.md](pointcross-ground-truth.md) — Signal-by-signal detection results for the synthetic benchmark study
- [multi-study-benchmark.md](multi-study-benchmark.md) — Cross-study comparison: automated vs SME conclusions
- [classification-verdicts.md](classification-verdicts.md) — Expert evaluation of every discrepancy with literature references

## Validation Version

- **Engine version:** Commit `119dcdf` (2026-03-28)
- **Last full validation:** 2026-03-28
- **Frontend tests at validation time:** 1784 passing
