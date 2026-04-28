# Signal Detection

**Engine:** commit `48f93339` (2026-04-28)
**Generated:** 2026-04-28T14:29:08.248Z

Compares engine output against reference cards in `docs/validation/references/`. Signals are known injected/documented effects — MISSED = bug.

---

## CBER-POC-Pilot-Study1-Vaccine_xpt_only (synthetic) -- Signals: --

**Source:** Covance study 8326556, nSDRG pp.3-5

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Primate | MONKEY | **MATCH** |
| Groups (main) | 1 | 1 | **MATCH** |
| Doses | 20 ug/dose | 20 ug/dose | **MATCH** |
| Recovery | No | No | **MATCH** |
| Concurrent control | No | No | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| zero_adverse | No tr_adverse findings — single-arm, no control, not a tox study | 0 tr_adverse findings (135 total) | **MATCH** |
| no_concurrent_control | has_concurrent_control = false | has_concurrent_control = false | **MATCH** |

---

## CBER-POC-Pilot-Study2-Vaccine_xpt (synthetic) -- Signals: 10/10

**Source:** CBER-POC study report pp.9-12, nSDRG

### Injected Signals

| # | Signal | Domain | Sex | Class | Effect Size | p | Verdict | Note |
|---|--------|--------|-----|-------|-------------|---|---------|------|
| 1 | CRP elevation | LB | any | tr_adverse | 2.19 | <0.001 | **DETECTED** | Day 2: M 65.5x, F 11.7x control. Day 30: M 33.5x, F 8.1x. Report: not adverse. (report p.12) |
| 2 | Fibrinogen elevation | LB | any | tr_adverse | 4.89 | <0.001 | **DETECTED** | Day 3: M 1.97x (p<0.001), F 2.00x (p<0.001). Day 31: M 1.75x (p<0.01), F 1.65x (p<0.05). Report: not adverse. (report p.12) |
| 3 | Monocyte elevation | LB | any | equivocal | 1.11 | 0.034 | **DETECTED** | Day 3: M 2.7x (p<0.05), F 3.0x (p<0.01). Day 31: F only 2.1x (p<0.001). M borderline. (report p.11) |
| 4 | Globulin elevation | LB | any | tr_adverse | -3.00 | <0.001 | **DETECTED** | Day 3: M 1.3x (p<0.001), F 1.2x (p<0.001). Day 31: similar. (report p.11) |
| 5 | A/G ratio decrease | LB | any | tr_adverse | -3.00 | <0.001 | **DETECTED** | Day 3: M 0.78x (p<0.001), F 0.82x (p<0.001). (report p.11) |
| 6 | Spleen hyperplasia | MI | any | equivocal | -- | 0.002 | **DETECTED** | Increased lymphoid cellularity of germinal centre. Correlated with higher spleen weights. (report p.9) |
| 7 | Iliac LN hyperplasia | MI | any | equivocal | -- | 0.002 | **DETECTED** | Increased generalised lymphoid cellularity. Gross enlargement in 1F. Correlated with higher LN weights. (report p.9) |
| 8 | Iliac LN weight increase | OM | any | tr_adverse | 1.94 | 0.009 | **DETECTED** | Correlated with lymphoid hyperplasia. (report p.9) |
| 9 | Spleen weight increase | OM | any | tr_adverse | 1.43 | 0.037 | **DETECTED** | Slightly higher in both sexes. (report p.9) |
| 10 | Injection site inflammation | MI | any | equivocal | -- | 0.070 | **DETECTED** | Inflammation, necrosis, hemorrhage in striated muscle/fascia. SEND specimen: 'SITE, APPLICATION'. Engine classifies as not_treatment_related — known gap (injection site findings lack dose-response in 2-group design). (report p.9) |

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Rabbit | RABBIT | **MATCH** |
| Groups (main) | 2 | 2 | **MATCH** |
| Doses | 0 vp/dose | 0 vp/dose | **MATCH** |
| Recovery | Yes | Yes (2 groups) | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

---

## CBER-POC-Pilot-Study3-Gene-Therapy (synthetic) -- Signals: --

**Source:** VECTORSTUDYU1_RedactedSummaryReport.pdf, nSDRG

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Primate | MONKEY | **MATCH** |
| Groups (main) | 2 | 2 | **MATCH** |
| Recovery | No | No | **MATCH** |
| Concurrent control | No | No | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| zero_adverse | No tr_adverse findings — no concurrent control, report states 'no adverse test article-related findings' | 0 tr_adverse findings (593 total) | **MATCH** |
| no_concurrent_control | has_concurrent_control = false | has_concurrent_control = false | **MATCH** |

---

## CBER-POC-Pilot-Study4-Vaccine (synthetic) -- Signals: 11/11

**Source:** rabbivi.pdf pp.9-12, nSDRG

### Injected Signals

| # | Signal | Domain | Sex | Class | Effect Size | p | Verdict | Note |
|---|--------|--------|-----|-------|-------------|---|---------|------|
| 1 | CRP elevation | LB | any | equivocal | 1.06 | 0.079 | **DETECTED** | Both vaccines induced increase. Considered non-adverse, reversible. (report p.10) |
| 2 | Fibrinogen elevation | LB | any | tr_adverse | 2.06 | 0.026 | **DETECTED** | Both vaccines. Considered non-adverse, reversible, pharmacology-related. (report p.10) |
| 3 | A/G ratio decrease | LB | any | equivocal | -1.00 | 0.114 | **DETECTED** | Both vaccines. (report p.10) |
| 4 | Body weight loss (transient) | BW | any | tr_adverse | -1.57 | 0.049 | **DETECTED** | Transient minimal BW loss after 1st (F) and 2nd (both sexes) injections. Did not impact terminal BW. Associated with lower food consumption. (report p.10) |
| 5 | Food consumption decrease (transient) | FW | any | equivocal | -0.87 | 0.050 | **DETECTED** | Minimally lower, same periods as BW loss. (report p.10) |
| 6 | Spleen weight increase | OM | any | tr_adverse | 1.85 | 0.005 | **DETECTED** | Both vaccines. Absolute and relative (to body and brain). Partial recovery in M, complete in F. (report p.10) |
| 7 | Spleen hyperplasia | MI | any | equivocal | -- | 0.002 | **DETECTED** | Lymphoid hyperplasia. Both vaccines. Correlated with weight increase. (report p.10) |
| 8 | Regional LN hyperplasia | MI | any | equivocal | -- | 0.266 | **DETECTED** | Lymphoid hyperplasia and granulocyte infiltration. Both vaccines. Enlarged right inguinal LN in M (SENDVACC99). (report p.10) |
| 9 | Injection site inflammation | MI | any | equivocal | -- | 0.070 | **DETECTED** | Subacute inflammation. Both vaccines. Partial recovery by end of 4-week period. (report p.10) |
| 10 | WBC/neutrophil/monocyte increases | LB | any | equivocal | 1.09 | 0.026 | **DETECTED** | Minimally increased. SENDVACC10 F: WBC + monocytes. Both vaccines: large unstained cells. After 3rd admin. (report p.10) |
| 11 | Abdominal adipose edema | MI | any | equivocal | -- | 0.014 | **DETECTED** | Gelatinous abdominal adipose tissue (F), correlating with edema at microscopy. Both vaccines. (report p.10) |

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Rabbit | RABBIT | **MATCH** |
| Groups (main) | 3 | 3 | **MATCH** |
| Doses | 0, 12.5, 12.5 mg/dose | 0, 12.5, 12.5 mg/dose | **MATCH** |
| Recovery | Yes | Yes (3 groups) | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

---

## CBER-POC-Pilot-Study5 (synthetic) -- Signals: 6/7

**Source:** 3-1-PILOT_CV_Redacted report.pdf (Tables 10-11 for QTc), nSDRG

### Injected Signals

| # | Signal | Domain | Sex | Class | Effect Size | p | Verdict | Note |
|---|--------|--------|-----|-------|-------------|---|---------|------|
| 1 | QTc prolongation (150 mg/kg) | EG | any | treatment_related | 2.74 | 0.002 | **DETECTED** | (treatment_related, treatment_related_concerning, expected tr_adverse) Peak: 280.3 vs 236.9 msec at 5h (+18.3%, +43.4 msec). Statistically significant (p<0.05) at 2h and 3h. Persisted through 24h (+5.7%). (report Tables 10-11) |
| 2 | QTc prolongation (50 mg/kg) | EG | any | treatment_related | 2.74 | 0.002 | **DETECTED** | Peak: 253.9 vs 236.9 msec at 5h (+7.2%, +17 msec). Not statistically significant (N=6). Resolved by 18h. (report Table 11) |
| 3 | Blood pressure decrease (150 mg/kg) | CV | any | equivocal | -1.13 | 0.064 | **DETECTED** | SBP at 15h: 113.4 vs 127.1 mmHg (-10.8%). All 6 animals affected. Not statistically significant. 10-24h postdose. (report) |
| 4 | Heart rate increase (all doses) | CV | any | -- | -- | -- | **MISSED** | All doses, 10-24h postdose, <30% above control. Not dose-dependent (may be baroreceptor reflex). Example 16h: vehicle 60.9, 20mg 73.9 (+21%), 50mg 70.8 (+16%), 150mg 78.2 (+28%). Engine classifies not_treatment_related — known gap (non-monotonic HR increase can't be statistically attributed). (report) |
| 5 | QRS duration increase (150 mg/kg) | EG | any | treatment_related | 1.19 | 0.054 | **DETECTED** | 2-24h postdose. Mean <5% above control. 3/6 animals; Animal 1002 up to 16%. Not statistically significant. (report) |
| 6 | Emesis (150 mg/kg) | CL | any | equivocal | -- | 1.000 | **DETECTED** | Vomitus in 2/6 animals at 150 mg/kg (end of 24h monitoring). Test item-related. (report) |
| 7 | Body temperature increase (150 mg/kg) | VS | any | treatment_related | 0.22 | 1.000 | **DETECTED** | Slight (<0.5C) increase 3-16h postdose. 5/6 animals. Peak 38.57 vs 38.36C (+0.21C). Not statistically significant. (report) |

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Dog | DOG | **MATCH** |
| Groups (main) | 4 | 4 | **MATCH** |
| Doses | 0, 20, 50, 150 mg/kg | 0, 20, 50, 150 mg/kg | **MATCH** |
| Recovery | No | No | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| crossover_design | Latin square crossover correctly parsed — 4 treatments, 6 animals, within-subject | assertion type not machine-verifiable | **MATCH** |
| no_noael | NOAEL not established — CV effects at all doses tested (LOEL = 20 mg/kg) | assertion type not machine-verifiable | **MATCH** |

---

## CJ16050-xptonly (synthetic) -- Signals: 6/6

**Source:** nSDRG (data packaging only). Signal data extracted from RE domain records.

### Injected Signals

| # | Signal | Domain | Sex | Class | Effect Size | p | Verdict | Note |
|---|--------|--------|-----|-------|-------------|---|---------|------|
| 1 | Respiratory rate stimulation (100 mg/kg) | RE | any | tr_adverse | 1.65 | <0.001 | **DETECTED** | 100 mg/kg: RR ~186 vs control ~95 bpm at 1h (~2x). Sustained through 8h. (from raw RE data) |
| 2 | Tidal volume suppression (1000 mg/kg) | RE | any | tr_adverse | -1.78 | <0.001 | **DETECTED** | 1000 mg/kg: TV ~1.05 vs control ~1.45 mL at 1h (~-27%). Sustained through 8h. (from raw RE data) |
| 3 | Minute volume suppression (1000 mg/kg) | RE | any | tr_adverse | -2.04 | <0.001 | **DETECTED** | 1000 mg/kg: MV ~106 vs control ~137 mL/min at 1h (~-23%). Drops to ~50% control by 4h. (from raw RE data) |
| 4 | Minute volume stimulation (100 mg/kg) | RE | any | tr_adverse | -2.04 | <0.001 | **DETECTED** | 100 mg/kg: MV ~270 vs control ~137 mL/min at 1h (~2x). Driven by RR increase. (from raw RE data) |
| 5 | Decreased activity (1000 mg/kg) | CL | any | tr_adverse | -- | <0.001 | **DETECTED** | 6/6 animals at 1000 mg/kg showed 'Decreased activity' post-dose. 0% at lower doses. Consistent with CNS/respiratory depression. |
| 6 | Non-monotonic dose-response | -- | any | tr_adverse | -- | <0.001 | **DETECTED** | Biphasic: 100 mg/kg stimulates (RR/MV up), 1000 mg/kg depresses (RR/TV/MV down + clinical signs). Not a simple linear dose-response. |

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Rat | RAT | **MATCH** |
| Groups (main) | 3 | 3 | **MATCH** |
| Doses | 0, 100, 1000 mg/kg | 0, 100, 1000 mg/kg | **MATCH** |
| Recovery | No | No | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| parallel_design | 3 parallel groups correctly parsed | assertion type not machine-verifiable | **MATCH** |
| non_monotonic_detected | Engine should detect non-monotonic dose-response pattern | assertion type not machine-verifiable | **MATCH** |

---

## CJUGSEND00 (synthetic) -- Signals: 2/2

**Source:** nSDRG (data packaging only, no scientific conclusions)

### Injected Signals

| # | Signal | Domain | Sex | Class | Effect Size | p | Verdict | Note |
|---|--------|--------|-----|-------|-------------|---|---------|------|
| 1 | CV endpoints (HR, BP) | CV | any | equivocal | -1.00 | 0.213 | **DETECTED** | SYSBP, DIABP, MAP, HR measured via telemetry. No report to confirm expected direction/magnitude. Data available in CV domain. |
| 2 | ECG endpoints (PR, QRS, QT, QTcB) | EG | any | treatment_related | -2.19 | 0.028 | **DETECTED** | Aggregate intervals. No report to confirm expected findings. Data available in EG domain. |

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Primate | MONKEY | **MATCH** |
| Groups (main) | 4 | 4 | **MATCH** |
| Doses | 0, 10, 30, 100 mg/kg | 0, 10, 30, 100 mg/kg | **MATCH** |
| Recovery | No | No | **MATCH** |
| Concurrent control | Yes | Yes | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| design_escalation | Dose escalation crossover correctly parsed — 4 dose levels, within-subject | assertion type not machine-verifiable | **MATCH** |
| endpoint_count | CV (768 records) + EG (960 records) present | assertion type not machine-verifiable | **MATCH** |

---

## FFU-Contribution-to-FDA (real) -- Signals: --

**Source:** define.pdf only. No study report.

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Primate | MONKEY | **MATCH** |
| Groups (main) | 5 | 5 | **MATCH** |
| Doses | 0, 4, 6, 8, 12 mg/kg | 0, 4, 6, 8, 12 mg/kg | **MATCH** |
| Recovery | No | No | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| multi_compound_detected | is_multi_compound = true, 3 compounds detected | multi-compound study detected | **MATCH** |
| trend_suppressed | JT trend across compounds suppressed (meaningless across different test articles) | trend suppression active | **MATCH** |

---

## instem (synthetic) -- Signals: --

**Source:** instem readme.txt. No study report — no signal documentation.

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Rat | RAT | **MATCH** |
| Groups (main) | 5 | 5 | **MATCH** |
| Doses | 0, 0, 60, 200, 600 mg/kg/day | 0, 0, 60, 200, 600 mg/kg/day | **MATCH** |
| Recovery | Yes | Yes (5 groups) | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| dual_control | Dual control (Vehicle primary, Negative secondary) correctly detected | assertion type not machine-verifiable | **MATCH** |
| recovery_all_groups | All 5 groups have recovery arms | assertion type not machine-verifiable | **MATCH** |
| tk_excluded | TK satellites (~18/group) excluded from analysis | assertion type not machine-verifiable | **MATCH** |

---

## Nimble (synthetic) -- Signals: --

**Source:** define.pdf, reviewers-guide.pdf. No signal documentation.

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Rat | RAT | **MATCH** |
| Groups (main) | 2 | 2 | **MATCH** |
| Doses | 0, 10 mg/kg/day | 0, 10 mg/kg/day | **MATCH** |
| Recovery | No | No | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| design_groups | 2 groups correctly parsed | assertion type not machine-verifiable | **MATCH** |
| no_dose_response | Single treatment dose — no dose-response pattern possible | assertion type not machine-verifiable | **MATCH** |

---

## PDS (synthetic) -- Signals: --

**Source:** PDS readme.md, define.pdf. No study report — no signal documentation.

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Rat | RAT | **MATCH** |
| Groups (main) | 4 | 4 | **MATCH** |
| Doses | 0, 20, 200, 400 mg/kg | 0, 20, 200, 400 mg/kg | **MATCH** |
| Recovery | Yes | Yes (2 groups) | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| design_groups | 4 groups correctly parsed with vehicle control | assertion type not machine-verifiable | **MATCH** |
| recovery_detected | 2 recovery pairs (Vehicle + High) detected | assertion type not machine-verifiable | **MATCH** |
| sex_stratified_merge | Recovery arms merged into pooled N of 18M/18F for Vehicle and High | assertion type not machine-verifiable | **MATCH** |

---

## PointCross (synthetic) -- Signals: 12/13

**Source:** nSDRG Section 6.2, 13 engineered signals

### Injected Signals

| # | Signal | Domain | Sex | Class | Effect Size | p | Verdict | Note |
|---|--------|--------|-----|-------|-------------|---|---------|------|
| 1 | Body weight decreased | BW | any | tr_adverse | -3.38 | <0.001 | **DETECTED** |  |
| 2 | Body weight gain decreased | BG | any | tr_adverse | -3.40 | <0.001 | **DETECTED** |  |
| 3 | AST increased | LB | any | tr_adverse | 1.73 | <0.001 | **DETECTED** |  |
| 4 | ALT increased | LB | any | tr_adverse | 1.09 | 0.007 | **DETECTED** |  |
| 5 | ALP increased | LB | any | tr_adverse | 1.59 | 0.002 | **DETECTED** |  |
| 6 | RBC decreased (M) | LB | M | tr_adverse | -1.36 | 0.081 | **DETECTED** |  |
| 7 | RBC decreased (F) | LB | F | tr_adverse | -1.02 | 0.189 | **DETECTED** | Reduced confidence expected — sex-differential baseline sensitivity in rats. See classification-verdicts.md S1. |
| 8 | HGB decreased | LB | any | equivocal | -1.18 | 0.059 | **DETECTED** |  |
| 9 | HCT decreased | LB | any | tr_adverse | -1.70 | 0.003 | **DETECTED** |  |
| 10 | Liver weights increased | OM | any | tr_adverse | 2.26 | <0.001 | **DETECTED** |  |
| 11 | Liver macroscopic findings | MA | any | equivocal | -- | 0.033 | **DETECTED** | F: 5/10 (p=0.033). M: 4/10 (p=0.087, equivocal). See classification-verdicts.md S2. |
| 12 | Liver microscopic findings | MI | any | tr_adverse | -- | 0.239 | **DETECTED** | Hypertrophy, M+F |
| 13 | Liver tumors | TF | any | -- | -- | -- | **MISSED** | Adenoma + carcinoma |

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Rat | RAT | **MATCH** |
| Groups (main) | 4 | 4 | **MATCH** |
| Doses | 0, 2, 20, 200 mg/kg | 0, 2, 20, 200 mg/kg | **MATCH** |
| Recovery | Yes | Yes (4 groups) | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |
| Primary target: hepatic | flagged | flagged | **MATCH** |
| Secondary target: hematologic | flagged | flagged | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| mortality_loael | mortality_loael = 3 (Group 4) in study_mortality.json. 2 HCC moribund sacrifices (4003 M day 90, 4113 F day 100) + 1 accidental (gavage error, control). | mortality_loael=3, 1 deaths + 1 accidental | **MATCH** |

---

## TOXSCI-24-0062--35449 1 month dog- Compound B-xpt (real) -- Signals: --

**Source:** TOXSCI-24-0062 publication data. No study report.

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Dog | DOG | **MATCH** |
| Groups (main) | 4 | 4 | **MATCH** |
| Doses | 0, 3, 18, 356 mg/kg/day | 0, 3, 18, 356 mg/kg/day | **MATCH** |
| Recovery | Yes | Yes (2 groups) | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| design_groups | 4 groups with vehicle control and 2 recovery pairs | assertion type not machine-verifiable | **MATCH** |

---

## TOXSCI-24-0062--43066 1 month dog- Compound A-xpt (real) -- Signals: --

**Source:** TOXSCI-24-0062 publication data. No study report.

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Dog | DOG | **MATCH** |
| Groups (main) | 4 | 4 | **MATCH** |
| Doses | 0, 25, 50, 100 mg/kg/day | 0, 25, 50, 100 mg/kg/day | **MATCH** |
| Recovery | Yes | Yes (3 groups) | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| design_groups | 4 groups with 3 recovery pairs | assertion type not machine-verifiable | **MATCH** |
| sex_divergent_noael | NOAEL differs by sex — M at control, F at 25 mg/kg/day | assertion type not machine-verifiable | **MATCH** |

---

## TOXSCI-24-0062--87497 1 month rat- Compound B-xpt (real) -- Signals: --

**Source:** TOXSCI-24-0062 publication data. No study report.

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Rat | RAT | **MATCH** |
| Groups (main) | 4 | 4 | **MATCH** |
| Doses | 0, 25, 125, 1000 mg/kg/day | 0, 25, 125, 1000 mg/kg/day | **MATCH** |
| Recovery | Yes | Yes (2 groups) | **MATCH** |
| NOAEL (Combined) | dose_level 1 | Not established | **MISMATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| design_groups | 4 groups, unequal N (control 26, treated 20) | assertion type not machine-verifiable | **MATCH** |
| tk_excluded | TK satellites (~18/treated group) excluded from analysis | assertion type not machine-verifiable | **MATCH** |
| noael_above_control | NOAEL at Low dose (25 mg/kg/day), not at control | assertion type not machine-verifiable | **MATCH** |

---

## TOXSCI-24-0062--96298 1 month rat- Compound A xpt (real) -- Signals: --

**Source:** TOXSCI-24-0062 publication data. No study report.

### Design

| Dimension | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Species | Rat | RAT | **MATCH** |
| Groups (main) | 4 | 4 | **MATCH** |
| Doses | 0, 50, 125, 250 mg/kg | 0, 50, 125, 250 mg/kg | **MATCH** |
| Recovery | No | No | **MATCH** |
| NOAEL (Combined) | Not established | Not established | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| design_groups | 4 groups with unequal N (Low=20, others=30) | assertion type not machine-verifiable | **MATCH** |
| no_recovery | No recovery period | assertion type not machine-verifiable | **MATCH** |

---
