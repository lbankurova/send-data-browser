# Validation Summary

**Engine:** commit `b2ba39f2` (2026-04-29)
**Generated:** 2026-04-29T23:34:26.989Z

| Study | Origin | Signals | Design | Assertions | Notes |
|-------|--------|---------|--------|------------|-------|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | synthetic | -- | 6/6 | 6/6 |  |
| CBER-POC-Pilot-Study2-Vaccine_xpt | synthetic | 10/10 | 5/5 | 1/4 |  |
| CBER-POC-Pilot-Study3-Gene-Therapy | synthetic | -- | 5/5 | 6/6 |  |
| CBER-POC-Pilot-Study4-Vaccine | synthetic | 11/11 | 5/5 | 1/4 |  |
| CBER-POC-Pilot-Study5 | synthetic | 6/7 | 5/5 | 0/2 | 1 class note(s), MISSED |
| CJ16050-xptonly | synthetic | 6/6 | 5/5 | 0/2 |  |
| CJUGSEND00 | synthetic | 2/2 | 6/6 | 0/2 |  |
| FFU-Contribution-to-FDA | real | -- | 5/5 | 2/2 |  |
| instem | synthetic | -- | 5/5 | 0/3 |  |
| Nimble | synthetic | -- | 5/5 | 4/4 |  |
| PDS | synthetic | -- | 5/5 | 1/3 |  |
| PointCross | synthetic | 12/13 | 7/7 | 6/6 | MISSED |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | real | -- | 5/5 | 1/1 |  |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | real | -- | 5/5 | 1/2 |  |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | real | -- | 4/5 | 1/3 | MISMATCH |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | real | -- | 5/5 | 1/2 |  |

**Totals:** 47/49 signals detected, 83/84 design matched, 31/52 assertions passed

## Missed Signals

| Study | Signal | Domain | Note |
|-------|--------|--------|------|
| CBER-POC-Pilot-Study5 | Heart rate increase (all doses) | CV | All doses, 10-24h postdose, <30% above control. Not dose-dependent (may be baroreceptor reflex). Example 16h: vehicle 60.9, 20mg 73.9 (+21%), 50mg 70.8 (+16%), 150mg 78.2 (+28%). Engine classifies not_treatment_related — known gap (non-monotonic HR increase can't be statistically attributed). (report) |
| PointCross | Liver tumors | TF | Adenoma + carcinoma |

## Design Mismatches

| Study | Dimension | Expected | Actual |
|-------|-----------|----------|--------|
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | NOAEL (Combined) | dose_level 1 | Not established |

## Classification Notes

| Study | Note |
|-------|------|
| CBER-POC-Pilot-Study5 | QTc prolongation (150 mg/kg): (treatment_related, treatment_related_concerning, expected tr_adverse) |
