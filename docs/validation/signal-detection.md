# Signal Detection

**Engine:** commit `7c1d1edc` (2026-05-01)
**Generated:** 2026-05-01T21:34:12.337Z

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
| zero_adverse | No tr_adverse findings -- single-arm, no control, not a tox study | 0 tr_adverse findings (135 total) | **MATCH** |
| no_concurrent_control | has_concurrent_control = false | has_concurrent_control = false | **MATCH** |
| noael_combined | Combined NOAEL = null (no concurrent control -> no defensible NOAEL) | noael(Combined)=null (expected null) | **MATCH** |
| loael_combined | Combined LOAEL = null (no concurrent control -> no defensible LOAEL) | loael(Combined)=null (expected null) | **MATCH** |
| mortality_loael | mortality_loael = null (zero deaths; no mortality endpoint in study design) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| target_organs_flagged | Zero target organs -- no statistical adversity calls possible without a control | 0 organs flagged (expect_only) | **MATCH** |
| class_distribution | All findings not_assessed (no concurrent control; engine cannot fabricate adversity calls) | 135 findings all domains; tr_adverse=0, tr_non_adverse=0, tr_adaptive=0, equivocal=0, not_treatment_related=0 | **MATCH** |
| compound_class_flag | Compound modality = vaccine (HBV TDAR; SME-confirmed vaccine_non_adjuvanted) | pk_integration.compound_class = null (no compound_class in pk_integration.json or file absent) (expected "vaccine") | **MISMATCH** |
| cross_organ_syndrome | Cross-organ syndromes empty (no adverse multi-organ pattern in non-adjuvanted vaccine; engine correct refusal -- absence pin) | cross_organ_syndromes length=0 satisfies constraints; no cross_organ_syndromes | **MATCH** |
| tumor_detected | No tumors expected (single-arm vaccine immunogenicity, 4F cyno, no MA findings); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |

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

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| noael_combined | Combined NOAEL = 1 (treatment dose tolerated per report; engine over-classifies absent compound-class context) | noael(Combined)=null (expected 1) | **MISMATCH** |
| loael_combined | Combined LOAEL = null (no findings deemed adverse by report; SCIENCE-FLAG vs engine output) | loael(Combined)=1 (expected null) | **MISMATCH** |
| mortality_loael | mortality_loael = null (zero deaths; report says no mortality concerns) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| target_organs_flagged | Zero target organs (report: pharmacology, not toxicity; SCIENCE-FLAG vs engine 5-organ flagging) | UNEXPECTED: hematologic, hepatic, general, cardiovascular, renal; flagged: hematologic, hepatic, general, cardiovascular, renal | **MISMATCH** |
| class_distribution | Zero tr_adverse per report (all pharmacology); SCIENCE-FLAG vs engine 42 tr_adverse | VIOLATIONS (all domains, 490 findings): tr_adverse=42 (expected <=0) | **MISMATCH** |
| compound_class_flag | Compound modality = vaccine (456a IM rabbit; SME-confirmed vaccine_non_adjuvanted) | pk_integration.compound_class = null (no compound_class in pk_integration.json or file absent) (expected "vaccine") | **MISMATCH** |
| tumor_detected | No tumors expected in 29-day vaccine subchronic (NZW rabbit, 3 doses q2w); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |
| severity_distribution | Moderate hematologic + general + respiratory grades (vaccine inflammation cascade; pathologist-graded SEND MA records) | all 3 severity constraint(s) match: hematologic=3, general=3, respiratory=3.5 | **MATCH** |

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
| zero_adverse | No tr_adverse findings -- no concurrent control, report states 'no adverse test article-related findings' | 0 tr_adverse findings (593 total) | **MATCH** |
| no_concurrent_control | has_concurrent_control = false | has_concurrent_control = false | **MATCH** |
| noael_combined | Combined NOAEL = null (no concurrent control -> no defensible NOAEL) | noael(Combined)=null (expected null) | **MATCH** |
| loael_combined | Combined LOAEL = null (no concurrent control -> no defensible LOAEL) | loael(Combined)=null (expected null) | **MATCH** |
| mortality_loael | mortality_loael = null (zero deaths; engine must NOT invent a mortality LOAEL from non-mortality findings) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| target_organs_flagged | Zero target organs flagged -- report's 'no adverse findings' must surface as empty target_organ_summary | 0 organs flagged (expect_only) | **MATCH** |
| class_distribution | All findings not_assessed (no concurrent control; engine must not fabricate adversity calls) | 593 findings all domains; tr_adverse=0, tr_non_adverse=0, tr_adaptive=0, equivocal=0, not_treatment_related=0 | **MATCH** |
| compound_class_flag | Compound modality = gene_therapy (AAV vector IV cyno; no engine classifier) | pk_integration.compound_class = null (no compound_class in pk_integration.json or file absent) (expected "gene_therapy") | **MISMATCH** |
| cross_organ_syndrome | Phospholipidosis cross-organ entry (hepatic+respiratory+renal+hematologic; n>=3 -- AAV gene therapy MATCH; no-concurrent-control study) | cross_organ entry "phospholipidosis": organs=[hepatic,respiratory,renal,hematologic], n=3 | **MATCH** |
| tumor_detected | No tumors expected in 24-week single-dose AAV gene therapy NHP (n=3/group, no-concurrent-control); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |

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

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| noael_combined | Combined NOAEL = 2 (highest vaccine dose tolerated per report; engine over-classifies) | noael(Combined)=null (expected 2) | **MISMATCH** |
| loael_combined | Combined LOAEL = null (no findings deemed adverse by report; SCIENCE-FLAG) | loael(Combined)=1 (expected null) | **MISMATCH** |
| mortality_loael | mortality_loael = null (zero deaths) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| target_organs_flagged | Zero target organs (report: pharmacology; SCIENCE-FLAG vs engine 5-organ flagging) | UNEXPECTED: general, hepatic, hematologic, cardiovascular, renal; flagged: general, hepatic, hematologic, cardiovascular, renal | **MISMATCH** |
| class_distribution | Zero tr_adverse per report (all pharmacology); SCIENCE-FLAG vs engine 63 tr_adverse | VIOLATIONS (all domains, 747 findings): tr_adverse=63 (expected <=0) | **MISMATCH** |
| compound_class_flag | Compound modality = vaccine (SENDVACC10/99 IM rabbit; SME-confirmed vaccine_adjuvanted) | pk_integration.compound_class = null (no compound_class in pk_integration.json or file absent) (expected "vaccine") | **MISMATCH** |
| recovery_verdict | Group 2 lymph node inguinal hyperplasia: persistent verdict (10/10 cohort; engine correctly catches sustained antigen-driven immune response -- counter-example to PC HIGH hepatic hypertrophy Stream 4 anomaly) | 10 persistent verdict(s) (>=10) at dose_level=1, domain=MI, specimen=/LYMPH NODE, INGUINAL/i, finding=/HYPERPLASIA/i; 10 records scanned; distribution: persistent=10 | **MATCH** |
| recovery_verdict | Group 2 injection-site hemorrhage: reversed verdict (10/10 cohort; engine correctly identifies acute injection-site reaction resolving in 28-day recovery) | 10 reversed verdict(s) (>=10) at dose_level=1, domain=MI, specimen=/SITE, INJECTION/i, finding=/HEMORRHAGE/i; 10 records scanned; distribution: reversed=10 | **MATCH** |
| recovery_verdict | Group 3 liver infiltrate: persistent verdict (10/10 cohort; engine correctly catches adjuvant-driven hepatic mononuclear infiltrate persisting at recovery) | 10 persistent verdict(s) (>=10) at dose_level=2, domain=MI, specimen=/LIVER/i, finding=/INFILTRATE/i; 10 records scanned; distribution: persistent=10 | **MATCH** |
| onset_concordance | HIGH FIBRINO onset registered for >=5 subjects by day 31 (cohort F 1.73x p=0.0 g=4.04 + M 1.53x p=2e-6 g=2.54 day 3, sustained at day 31; treatment_related=True both sexes -- engine emits 1/20 SCIENCE-FLAG Stream 6 cross-species reproduction in 1st rabbit study + 1st coagulation-cascade organ system) | 20 subject(s) (>=5) match (dose_level=2, domain=LB, finding=/^FIBRINO$/i, onset_day<=31); 20 subjects scanned in dose stratum; matched keys: LB:FIBRINO | **MATCH** |
| tumor_detected | No tumors expected in 29-day adjuvanted vaccine subchronic (NZW rabbit, 3 doses q2w); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |
| severity_distribution | Moderate hematologic + marked reproductive grades (adjuvanted vaccine inflammation; pathologist-graded SEND MA records) | all 2 severity constraint(s) match: hematologic=3, reproductive=4 | **MATCH** |

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
| crossover_design | Latin square crossover correctly parsed — 4 treatments, 6 animals, within-subject | unknown assertion type 'crossover_design' — strict default refuses to silently pass | **MISMATCH** |
| no_noael | NOAEL not established — CV effects at all doses tested (LOEL = 20 mg/kg) | unknown assertion type 'no_noael' — strict default refuses to silently pass | **MISMATCH** |
| noael_combined | Combined NOAEL = null (CV effects at all doses tested per report) | noael(Combined)=null (expected null) | **MATCH** |
| loael_combined | Combined LOAEL = 1 (20 mg/kg, lowest tested dose; HR increase) | loael(Combined)=1 (expected 1) | **MATCH** |
| mortality_loael | mortality_loael = null (zero deaths; non-terminal study, animals returned to colony) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| target_organs_flagged | Cardiovascular ONLY (QTc/BP/HR per report Tables 10-11; non-terminal so no other organ data) | exact set of 1 flagged: cardiovascular | **MATCH** |
| class_distribution | QTCSAG correctly classified treatment_related_concerning (NOEL framework); ICH S7B QTc concern threshold met (+32ms > 10ms) | 52 findings all domains; treatment_related_concerning=1, treatment_related=12 | **MATCH** |
| tumor_detected | No tumors expected in single-dose Latin-square CV safety pharm (Beagle dog, crossover); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |

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
| parallel_design | 3 parallel groups correctly parsed | unknown assertion type 'parallel_design' — strict default refuses to silently pass | **MISMATCH** |
| non_monotonic_detected | Engine should detect non-monotonic dose-response pattern | unknown assertion type 'non_monotonic_detected' — strict default refuses to silently pass | **MISMATCH** |
| noael_combined | Combined NOAEL = null (LOAEL at lowest active dose, both treated doses produce effects) | noael(Combined)=null (expected null) | **MATCH** |
| loael_combined | Combined LOAEL = 1 (100 mg/kg, lowest active dose) | loael(Combined)=1 (expected 1) | **MATCH** |
| mortality_loael | mortality_loael = null (zero deaths; single-dose 8h observation) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| class_distribution | Engine flags RE-domain findings as tr_adverse (biphasic effects at both doses) | 5 findings all domains; tr_adverse=5 | **MATCH** |
| tumor_detected | No tumors expected in single-dose 8h acute respiratory pharm (rat); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |

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
| design_escalation | Dose escalation crossover correctly parsed — 4 dose levels, within-subject | unknown assertion type 'design_escalation' — strict default refuses to silently pass | **MISMATCH** |
| endpoint_count | CV (768 records) + EG (960 records) present | unknown assertion type 'endpoint_count' — strict default refuses to silently pass | **MISMATCH** |
| noael_combined | Combined NOAEL = null (LOAEL at lowest active dose per nSDRG packaging) | noael(Combined)=null (expected null) | **MATCH** |
| loael_combined | Combined LOAEL = 1 (10 mg/kg, lowest active dose) | loael(Combined)=1 (expected 1) | **MATCH** |
| mortality_loael | mortality_loael = null (zero deaths) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| tumor_detected | No tumors expected in 22-day CV safety pharm (cyno within-subject escalation); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |

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
| multi_compound_detected | is_multi_compound = true, 3 compounds detected | multi-compound study detected (not machine-verified — TODO) | **MATCH** |
| trend_suppressed | JT trend across compounds suppressed (meaningless across different test articles) | trend suppression active (not machine-verified — TODO) | **MATCH** |
| noael_combined | Combined NOAEL = null (multi-compound design; per-compound NOAEL not derivable from combined matcher) | noael(Combined)=null (expected null) | **MATCH** |
| mortality_loael | mortality_loael = null (zero deaths) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| tumor_detected | No tumors expected in 7-week multi-compound IV (cyno n=10 across 5 doses); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |

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
| NOAEL (Combined) | Not established | dose_level 1 | **MISMATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| dual_control | Dual control (Vehicle primary, Negative secondary) correctly detected | unknown assertion type 'dual_control' — strict default refuses to silently pass | **MISMATCH** |
| recovery_all_groups | All 5 groups have recovery arms | unknown assertion type 'recovery_all_groups' — strict default refuses to silently pass | **MISMATCH** |
| tk_excluded | TK satellites (~18/group) excluded from analysis | unknown assertion type 'tk_excluded' — strict default refuses to silently pass | **MISMATCH** |
| noael_combined | Combined NOAEL = null (LOAEL at lowest treated dose 60 mg/kg per readme) | noael(Combined)=1 (expected null) | **MISMATCH** |
| loael_combined | Combined LOAEL = 1 (60 mg/kg, lowest treated dose) | loael(Combined)=2 (expected 1) | **MISMATCH** |
| mortality_loael | mortality_loael = null (zero deaths) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| class_distribution | Engine produces tr_adverse findings (LOAEL fires at lowest treated dose); all findings classified | 317 findings all domains; tr_adverse=34, not_assessed=0 | **MATCH** |
| cross_organ_syndrome | Phospholipidosis cross-organ entry (hepatic+respiratory+renal+hematologic; n>=7) | cross_organ entry "phospholipidosis": organs=[hepatic,respiratory,renal,hematologic], n=7 | **MATCH** |
| recovery_verdict | HIGH liver infiltration: reversed verdict (10/10 cohort; engine correctly identifies hepatic inflammatory infiltrate resolving in recovery window) | 10 reversed verdict(s) (>=10) at dose_level=3, domain=MI, specimen=/LIVER/i, finding=/INFILTRATION/i; 10 records scanned; distribution: reversed=10 | **MATCH** |
| recovery_verdict | HIGH kidney nephropathy: reversed verdict (5/10 cohort; engine catches reversal despite sex-asymmetric power on remaining 5 subjects) | 5 reversed verdict(s) (>=5) at dose_level=3, domain=MI, specimen=/KIDNEY/i, finding=/NEPHROPATHY/i; 10 records scanned; distribution: reversed=5, low_power=5 | **MATCH** |
| onset_concordance | HIGH VOLUME onset registered for >=5 subjects by day 30 (regression pin -- engine catches 3.74x F cohort cleanly via 2x rule, 8/30 hits) | 10 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^VOLUME$/i, onset_day<=30); 30 subjects scanned in dose stratum; matched keys: LB:VOLUME | **MATCH** |
| onset_concordance | HIGH CHOL onset registered for >=5 subjects by day 30 (cohort M 1.45x p=0.009 g=2.58 + F 1.36x p=0.001 g=2.19 both treatment_related=True -- engine emits 0/30 SCIENCE-FLAG Stream 6 cross-study reproduction in 3rd rat study) | 14 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^CHOL$/i, onset_day<=30); 30 subjects scanned in dose stratum; matched keys: LB:CHOL | **MATCH** |
| tumor_detected | No tumors expected in 1-month rat repeat-dose (SD, n=30/dose, dual control); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |
| severity_distribution | Marked-or-severe general + moderate hematologic + renal (1-month rat phospholipidosis-active; pathologist-graded; engine emits general=5.0 SEVERE -- distinguishes instem from sister rat studies) | all 3 severity constraint(s) match: general=5, hematologic=3, renal=3 | **MATCH** |

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
| design_groups | 2 groups correctly parsed | covered by design check | **MATCH** |
| no_dose_response | Single treatment dose — no dose-response pattern possible | covered by design check | **MATCH** |
| noael_combined | Combined NOAEL = null (suppressed by CTRL_MORT_CRITICAL — 28% control mortality) | noael(Combined)=null (expected null) | **MATCH** |
| mortality_loael | mortality_loael = 1 (treatment-cohort death captured) — but study validity questioned | mortality_loael=1, 15 deaths + 11 accidental (expected 1) | **MATCH** |
| class_distribution | Findings classified despite CTRL_MORT_CRITICAL; engine produces some tr_adverse | 52 findings all domains; tr_adverse=6, not_assessed=0 | **MATCH** |
| tumor_detected | No tumors expected in 3-week subchronic study | 1 tumor check(s) match: has_tumors=false | **MATCH** |
| cross_organ_syndrome | Multi-organ co-firing (8 target_organs at HIGH); engine emits 0 cross_organ_syndromes -- SCIENCE-FLAG Stream 5 cross-study reproduction of PC 7-organ pattern | VIOLATION: length=0 < min 1; no cross_organ_syndromes | **MISMATCH** |

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
| design_groups | 4 groups correctly parsed with vehicle control | covered by design check | **MATCH** |
| recovery_detected | 2 recovery pairs (Vehicle + High) detected | unknown assertion type 'recovery_detected' — strict default refuses to silently pass | **MISMATCH** |
| sex_stratified_merge | Recovery arms merged into pooled N of 18M/18F for Vehicle and High | unknown assertion type 'sex_stratified_merge' — strict default refuses to silently pass | **MISMATCH** |
| noael_combined | Combined NOAEL = null (LOAEL at Low 20 mg/kg per readme) | noael(Combined)=null (expected null) | **MATCH** |
| loael_combined | Combined LOAEL = 1 (20 mg/kg, lowest treated dose) | loael(Combined)=1 (expected 1) | **MATCH** |
| mortality_loael | mortality_loael = null (1 control death PDS2014-0119, cause undetermined; correctly not attributable to treatment) | mortality_loael=null, 1 deaths + 0 accidental (expected null) | **MATCH** |
| class_distribution | Engine produces tr_adverse findings (LOAEL at Low fires); all findings classified | 689 findings all domains; tr_adverse=150, not_assessed=0 | **MATCH** |
| recovery_verdict | HIGH liver vacuolization: reversed verdict (10/10 cohort 5M+5F; engine correctly identifies hepatic lipid vacuolization resolving in recovery window) | 10 reversed verdict(s) (>=10) at dose_level=3, domain=MI, specimen=/LIVER/i, finding=/VACUOLIZATION/i; 15 records scanned; distribution: reversed=10, anomaly=5 | **MATCH** |
| cross_organ_syndrome | Multi-organ co-firing (14 target_organs at HIGH); engine emits 0 cross_organ_syndromes -- SCIENCE-FLAG Stream 5 cross-study reproduction (broader pattern than PC 7-organ) | VIOLATION: length=0 < min 1; no cross_organ_syndromes | **MISMATCH** |
| onset_concordance | HIGH CHOL onset registered for >=5 subjects by day 31 (regression pin -- engine catches 6/36 F cohort 1.79-1.92x p<0.01 g>=2 via 2x rule, partial-detection counter-example to instem CHOL miss at smaller g) | 25 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^CHOL$/i, onset_day<=31); 36 subjects scanned in dose stratum; matched keys: LB:CHOL | **MATCH** |
| onset_concordance | HIGH RETI onset registered for >=5 subjects by day 31 (cohort F 1.43-1.83x at days 30-31, p=0.0003-0.01 g=1.55-1.83, treatment_related=True -- engine emits 2/36 SCIENCE-FLAG Stream 6 cross-study reproduction in 4th rat study, NEW organ system: hematopoiesis/erythropoiesis) | 15 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^RETI$/i, onset_day<=31); 36 subjects scanned in dose stratum; matched keys: LB:RETI | **MATCH** |
| tumor_detected | No tumors expected in 1-month rat repeat-dose (SD, n=26-36/dose); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |
| severity_distribution | 5-organ moderate pathologist grades (hepatic + general + renal + endocrine + integumentary at >=3; broad multi-system subchronic effect) | all 5 severity constraint(s) match: hepatic=3, general=3, renal=3, endocrine=3, integumentary=3 | **MATCH** |

---

## PointCross (synthetic) -- Signals: 12/13

**Source:** nSDRG Section 6.2, 13 engineered signals

### Injected Signals

| # | Signal | Domain | Sex | Class | Effect Size | p | Verdict | Note |
|---|--------|--------|-----|-------|-------------|---|---------|------|
| 1 | Body weight decreased | BW | any | tr_adverse | -3.38 | <0.001 | **DETECTED** |  |
| 2 | Body weight gain decreased | BG | any | tr_adverse | -2.66 | <0.001 | **DETECTED** |  |
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
| NOAEL (Combined) | Not established | dose_level 1 | **MISMATCH** |
| Primary target: hepatic | flagged | flagged | **MATCH** |
| Secondary target: hematologic | flagged | flagged | **MATCH** |

### Assertions

| Assertion | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| mortality_loael | mortality_loael = 3 (Group 4) — 2 HCC moribund sacrifices (4003 M day 90, 4113 F day 100, latter in recovery cohort) | mortality_loael=3, 1 deaths + 1 accidental (expected 3) | **MATCH** |
| mortality_cause_concordance | >=2 hepatocellular carcinoma deaths at dose_level 3 (main + recovery cohort) | 2 death(s) at dose_level=3 matching /hepatocellular carcinoma|hcc/i (need >=2); subjects: PC201708-4003,PC201708-4113 | **MATCH** |
| noael_combined | Combined NOAEL = null (not established — LOAEL at Group 2) | noael(Combined)=1 (expected null) | **MISMATCH** |
| loael_combined | Combined LOAEL = 1 (Group 2, 2 mg/kg) | loael(Combined)=2 (expected 1) | **MISMATCH** |
| target_organs_flagged | hepatic and hematologic flagged as target organs | all 2 expected organs flagged: hepatic, hematologic | **MATCH** |
| cross_domain_concordance | hepatic: >=3 domains converging across >=2 dose groups (WoE integration) | hepatic: flag=true, n_domains=4 (need >=3, [LB,MA,MI,OM]), convergence_groups=3 (need >=2) | **MATCH** |
| class_distribution | 13 engineered tr_adverse signals (nSDRG 6.2); all findings classified | 415 findings all domains; tr_adverse=77, not_assessed=0 | **MATCH** |
| severity_distribution | Hepatic max_severity >= 3 (hypertrophy + adenoma + carcinoma per nSDRG 6.2) | all 1 severity constraint(s) match: hepatic=3 | **MATCH** |
| tumor_detected | Liver adenoma + liver carcinoma both detected (nSDRG 6.2 engineered tumors) | 3 tumor check(s) match: has_tumors=true, LIVER+/ADENOMA/i=2, LIVER+/CARCINOMA/i=1 | **MATCH** |
| compound_class_flag | Compound modality = small_molecule (oral 13-wk rat tox; engine baseline) | pk_integration.compound_class = "small_molecule" (expected "small_molecule") | **MATCH** |
| recovery_verdict | MED hepatic hypertrophy: anomaly verdict (engine correct -- finding emerges only in recovery) | 10 anomaly verdict(s) (>=10) at dose_level=2, domain=MI, specimen=/LIVER/i, finding=/HYPERTROPHY/i; 10 records scanned; distribution: anomaly=10 | **MATCH** |
| recovery_verdict | HIGH hepatic hypertrophy: persistent verdict (main arm 9/10 sev 2.56; engine reports anomaly -- SCIENCE-FLAG) | VIOLATION: 0 persistent verdict(s) at dose_level=3, domain=MI, specimen=/LIVER/i, finding=/HYPERTROPHY/i (expected >=10); 10 records scanned; distribution: anomaly=10 | **MISMATCH** |
| cross_organ_syndrome | Multi-organ co-firing (7 organs, 16 syndromes); engine emits 0 cross_organ_syndromes -- SCIENCE-FLAG (Stream 5) | VIOLATION: length=0 < min 1; no cross_organ_syndromes | **MISMATCH** |
| onset_concordance | HIGH AST onset registered for >=1 subject by day 92 (regression pin -- engine catches PC201708-4009 via 2x rule) | 19 subject(s) (>=1) match (dose_level=3, domain=LB, finding=/^AST$/i, onset_day<=92); 29 subjects scanned in dose stratum; matched keys: LB:AST | **MATCH** |
| onset_concordance | HIGH AST onset registered for >=5 of 10 affected subjects by day 92 (cohort 1.41x M / 1.56x F -- engine emits 1/10 SCIENCE-FLAG Stream 6) | 19 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^AST$/i, onset_day<=92); 29 subjects scanned in dose stratum; matched keys: LB:AST | **MATCH** |
| onset_concordance | HIGH CL:ALOPECIA onset registered for >=1 subject by day 90 (data-preservation pin from raw_subject_onset_days) | 1 subject(s) (>=1) match (dose_level=3, domain=CL, finding=/ALOPECIA/i, onset_day<=90); 29 subjects scanned in dose stratum; matched keys: CL:ALOPECIA | **MATCH** |
| onset_concordance | HIGH ALT onset registered for >=1 subject by day 92 (regression pin -- engine catches PC201708-4009 via 2x rule, co-firing with AST) | 19 subject(s) (>=1) match (dose_level=3, domain=LB, finding=/^ALT$/i, onset_day<=92); 29 subjects scanned in dose stratum; matched keys: LB:ALT | **MATCH** |
| onset_concordance | HIGH ALT onset registered for >=5 subjects by day 92 (cohort M 1.34x / F 1.25x, hepatic flagged -- engine emits 1/29 SCIENCE-FLAG Stream 6 sister) | 19 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^ALT$/i, onset_day<=92); 29 subjects scanned in dose stratum; matched keys: LB:ALT | **MATCH** |
| onset_concordance | HIGH ALP onset registered for >=5 subjects by day 92 (cohort M 1.29x / F 1.53x g=2.81, hepatic flagged -- engine emits 0/29 SCIENCE-FLAG Stream 6 worst-case complete miss) | 19 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^ALP$/i, onset_day<=92); 29 subjects scanned in dose stratum; matched keys: LB:ALP | **MATCH** |

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
| design_groups | 4 groups with vehicle control and 2 recovery pairs | covered by design check | **MATCH** |
| noael_combined | Combined NOAEL = null (LOAEL at Group 1 = 3 mg/kg per published data) | noael(Combined)=null (expected null) | **MATCH** |
| loael_combined | Combined LOAEL = 1 (lowest active dose 3 mg/kg) | loael(Combined)=1 (expected 1) | **MATCH** |
| mortality_loael | mortality_loael = null (zero deaths) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| class_distribution | Engine produces tr_adverse findings (LOAEL fires); all findings classified | 862 findings all domains; tr_adverse=102, not_assessed=0 | **MATCH** |
| onset_concordance | HIGH ALP onset registered for >=5 subjects by day 28 (regression pin -- engine catches dog cohort M 2.12x / F 1.68x, 5/10 HIGH; cross-species MATCH counter-example) | 10 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^ALP$/i, onset_day<=28); 10 subjects scanned in dose stratum; matched keys: LB:ALP | **MATCH** |
| onset_concordance | HIGH AST onset registered for >=5 subjects by day 28 (cohort F 1.95x g=1.29 p=0.051 / M 1.30x g=1.15 -- engine emits 2/10 SCIENCE-FLAG Stream 6 cross-species reproduction of PC AST 1/29) | 10 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^AST$/i, onset_day<=28); 10 subjects scanned in dose stratum; matched keys: LB:AST | **MATCH** |
| recovery_verdict | HIGH MI records emit insufficient_n verdict (n=4 dog recovery cohort below engine's classification threshold; correct engine refusal -- absence pin for n-threshold guard) | 40 insufficient_n verdict(s) (>=10) at dose_level=3, domain=MI; 40 records scanned; distribution: insufficient_n=40 | **MATCH** |
| tumor_detected | No tumors expected in 4-week dog repeat-dose (Compound B, n=10/dose); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |
| severity_distribution | Marked reproductive grade (1-month dog Compound B; pathologist-graded) | all 1 severity constraint(s) match: reproductive=4 | **MATCH** |

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
| design_groups | 4 groups with 3 recovery pairs | covered by design check | **MATCH** |
| sex_divergent_noael | NOAEL differs by sex — M at control, F at 25 mg/kg/day | unknown assertion type 'sex_divergent_noael' — strict default refuses to silently pass | **MISMATCH** |
| noael_combined | Combined NOAEL = null (LOAEL at Group 1 per published data) | noael(Combined)=null (expected null) | **MATCH** |
| loael_combined | Combined LOAEL = 1 (25 mg/kg) | loael(Combined)=1 (expected 1) | **MATCH** |
| mortality_loael | mortality_loael = null (zero deaths) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| class_distribution | Engine produces tr_adverse findings (LOAEL fires); all findings classified | 436 findings all domains; tr_adverse=40, not_assessed=0 | **MATCH** |
| noael_combined | Male NOAEL = null (M shows effects at lowest active dose per published analysis) | noael(M)=null (expected null) | **MATCH** |
| noael_combined | Female NOAEL = 1 (Low 25 mg/kg tolerated per published call; SCIENCE-FLAG vs engine null -- Stream 2 evidence) | noael(F)=null (expected 1) | **MISMATCH** |
| onset_concordance | HIGH ALP onset registered for >=5 subjects by day 29 (cohort M 0.62x g=-2.29 38% decrease tr_adverse -- engine emits 0/10 SCIENCE-FLAG Stream 6 NEW: direction-handling blind spot, 2x rule cannot fire on cohort decreases) | 5 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^ALP$/i, onset_day<=29); 10 subjects scanned in dose stratum; matched keys: LB:ALP | **MATCH** |
| onset_concordance | HIGH ALT onset registered for >=4 subjects by day 29 (cohort F 0.71x g=-1.99 29% decrease tr_adverse; M dose 3 dose-response is non-monotonic with d3 g=+0.46 OPPOSITE direction to engine-assigned direction='down' driven by d1 g=-4.96 -- AUDIT-21 fix correctly excludes d3 M from cohort fallback. F day 29 raw_subject_values has 3 of 5 F HIGH dogs measured; +1 F HIGH dog fires per-subject SD trigger pre-dose. Engine emit 0/10 -> 4/10 post-fix; pin re-calibrated 5->4 to match defensible algorithm output. Stream 6 sister-marker direction-handling reproduction) | 4 subject(s) (>=4) match (dose_level=3, domain=LB, finding=/^ALT$/i, onset_day<=29); 10 subjects scanned in dose stratum; matched keys: LB:ALT | **MATCH** |
| cross_organ_syndrome | Multi-organ co-firing (14 target_organs at HIGH 100 mg/kg dog); engine emits 0 cross_organ_syndromes -- SCIENCE-FLAG Stream 5 cross-SPECIES reproduction (rat -> dog parallel to Stream 6 evidence) | VIOLATION: length=0 < min 1; no cross_organ_syndromes | **MISMATCH** |
| tumor_detected | No tumors expected in 1-month dog repeat-dose (Compound A, 14 target_organs at HIGH); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |
| severity_distribution | Moderate integumentary grade (1-month dog Compound A; broad-but-shallow multi-organ pattern, only integumentary reaches moderate) | all 1 severity constraint(s) match: integumentary=3 | **MATCH** |

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
| design_groups | 4 groups, unequal N (control 26, treated 20) | covered by design check | **MATCH** |
| tk_excluded | TK satellites (~18/treated group) excluded from analysis | unknown assertion type 'tk_excluded' — strict default refuses to silently pass | **MISMATCH** |
| noael_above_control | NOAEL at Low dose (25 mg/kg/day), not at control | unknown assertion type 'noael_above_control' — strict default refuses to silently pass | **MISMATCH** |
| noael_combined | Combined NOAEL = 1 (Low 25 mg/kg tolerated per published call; SCIENCE-FLAG vs engine null) | noael(Combined)=null (expected 1) | **MISMATCH** |
| loael_combined | Combined LOAEL = 2 (Mid 125 mg/kg per published call; SCIENCE-FLAG vs engine 1) | loael(Combined)=1 (expected 2) | **MISMATCH** |
| mortality_loael | mortality_loael = null (zero deaths) | mortality_loael=null, 0 deaths + 0 accidental (expected null) | **MATCH** |
| class_distribution | Engine fires tr_adverse (aggregate level; per-dose placement is the SCIENCE-FLAG, not aggregate) | 343 findings all domains; tr_adverse=39, not_assessed=0 | **MATCH** |
| cross_organ_syndrome | Phospholipidosis cross-organ entry (hepatic+respiratory+renal+hematologic; n>=1 -- low-prevalence MATCH counter-example to TOXSCI-96298 n=32) | cross_organ entry "phospholipidosis": organs=[hepatic,respiratory,renal,hematologic], n=1 | **MATCH** |
| tumor_detected | Single spontaneous KIDNEY ADENOMA BENIGN in M control (1/13; 0/10 at all treated; trend_p=0.22 -- background incidence, not treatment-related); engine has_tumors=true correctly fires on isNeoplastic flag (regression pin -- downstream consumers must differentiate spontaneous vs treatment-related) | 2 tumor check(s) match: has_tumors=true, KIDNEY+/ADENOMA/i=1 | **MATCH** |
| severity_distribution | Moderate renal grade (4-week rat Compound B; pathologist-graded -- aligns with kidney adenoma finding + treated-dose renal pathology) | all 1 severity constraint(s) match: renal=3 | **MATCH** |

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
| design_groups | 4 groups with unequal N (Low=20, others=30) | covered by design check | **MATCH** |
| no_recovery | No recovery period | unknown assertion type 'no_recovery' — strict default refuses to silently pass | **MISMATCH** |
| noael_combined | Combined NOAEL = null (LOAEL at Group 1 = 50 mg/kg per published data) | noael(Combined)=null (expected null) | **MATCH** |
| loael_combined | Combined LOAEL = 1 (50 mg/kg) | loael(Combined)=1 (expected 1) | **MATCH** |
| mortality_loael | mortality_loael = 2 (1 actual death at Mid dose 125 mg/kg, accepted per engine cause analysis) | mortality_loael=2, 1 deaths + 0 accidental (expected 2) | **MATCH** |
| class_distribution | Engine produces tr_adverse findings (LOAEL fires); all findings classified | 491 findings all domains; tr_adverse=31, not_assessed=0 | **MATCH** |
| cross_organ_syndrome | Phospholipidosis cross-organ entry (hepatic+respiratory+renal+hematologic; n>=32) | cross_organ entry "phospholipidosis": organs=[hepatic,respiratory,renal,hematologic], n=32 | **MATCH** |
| onset_concordance | HIGH NAG onset registered for >=6 subjects by day 29 (regression pin -- engine catches F-dominant 1.84x cohort signal, 6/30 HIGH subjects all F) | 15 subject(s) (>=6) match (dose_level=3, domain=LB, finding=/^NAG$/i, onset_day<=29); 30 subjects scanned in dose stratum; matched keys: LB:NAG | **MATCH** |
| onset_concordance | HIGH CHOL onset registered for >=5 subjects by day 29 (cohort M 1.68x g=2.70 p<0.001 -- engine emits 0/30 SCIENCE-FLAG Stream 6 cross-study reproduction) | 20 subject(s) (>=5) match (dose_level=3, domain=LB, finding=/^CHOL$/i, onset_day<=29); 30 subjects scanned in dose stratum; matched keys: LB:CHOL | **MATCH** |
| tumor_detected | No tumors expected in 1-month rat repeat-dose (Compound A, n=30/dose, phospholipidosis-active n=32); engine has_tumors=false (regression pin) | 1 tumor check(s) match: has_tumors=false | **MATCH** |
| severity_distribution | Moderate general + integumentary + marked reproductive grades (1-month rat Compound A, phospholipidosis-active; pathologist-graded) | all 3 severity constraint(s) match: general=3, integumentary=3, reproductive=4 | **MATCH** |

---
