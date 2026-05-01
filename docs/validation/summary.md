# Validation Summary

**Engine:** commit `b2e83ed7` (2026-05-01)
**Generated:** 2026-05-01T23:15:50.624Z

| Study | Origin | Signals | Design | Assertions | Notes |
|-------|--------|---------|--------|------------|-------|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | synthetic | -- | 6/6 | 9/10 |  |
| CBER-POC-Pilot-Study2-Vaccine_xpt | synthetic | 10/10 | 5/5 | 3/8 |  |
| CBER-POC-Pilot-Study3-Gene-Therapy | synthetic | -- | 5/5 | 9/10 |  |
| CBER-POC-Pilot-Study4-Vaccine | synthetic | 11/11 | 5/5 | 7/12 |  |
| CBER-POC-Pilot-Study5 | synthetic | 6/7 | 5/5 | 6/8 | 1 class note(s), MISSED |
| CJ16050-xptonly | synthetic | 6/6 | 5/5 | 5/7 |  |
| CJUGSEND00 | synthetic | 2/2 | 6/6 | 4/6 |  |
| FFU-Contribution-to-FDA | real | -- | 5/5 | 5/5 |  |
| instem | synthetic | -- | 4/5 | 9/14 | MISMATCH |
| Nimble | synthetic | -- | 5/5 | 7/7 |  |
| PDS | synthetic | -- | 5/5 | 11/13 |  |
| PointCross | synthetic | 12/13 | 6/7 | 16/19 | MISMATCH, MISSED |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | real | -- | 5/5 | 10/10 |  |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | real | -- | 5/5 | 11/13 |  |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | real | -- | 4/5 | 6/10 | MISMATCH |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | real | -- | 5/5 | 10/11 |  |

**Totals:** 47/49 signals detected, 81/84 design matched, 128/163 assertions passed

## Missed Signals

| Study | Signal | Domain | Note |
|-------|--------|--------|------|
| CBER-POC-Pilot-Study5 | Heart rate increase (all doses) | CV | All doses, 10-24h postdose, <30% above control. Not dose-dependent (may be baroreceptor reflex). Example 16h: vehicle 60.9, 20mg 73.9 (+21%), 50mg 70.8 (+16%), 150mg 78.2 (+28%). Engine classifies not_treatment_related — known gap (non-monotonic HR increase can't be statistically attributed). (report) |
| PointCross | Liver tumors | TF | Adenoma + carcinoma |

## Design Mismatches

| Study | Dimension | Expected | Actual |
|-------|-----------|----------|--------|
| instem | NOAEL (Combined) | Not established | dose_level 1 |
| PointCross | NOAEL (Combined) | Not established | dose_level 1 |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | NOAEL (Combined) | dose_level 1 | Not established |

## Classification Notes

| Study | Note |
|-------|------|
| CBER-POC-Pilot-Study5 | QTc prolongation (150 mg/kg): (treatment_related, treatment_related_concerning, expected tr_adverse) |
