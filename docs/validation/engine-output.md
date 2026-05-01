# Engine Output

**Engine:** commit `e3fe04e5` (2026-05-01)
**Generated:** 2026-05-01T16:24:14.741Z

Auto-generated from `backend/generated/{study}/` JSON. No manual edits — regenerate with `/regen-validation`.

---

## CBER-POC-Pilot-Study1-Vaccine_xpt_only

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | MONKEY / CYNOMOLGUS |
| Route | INTRAMUSCULAR |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | Hepatitis B Vaccine |
| Groups (main) | 1 |
| Recovery groups | 0 |
| Last dosing day | 29 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 20 ug/dose | 0/4 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 10 | 0 | 0 | 0 | 0 | 0 |
| BW | 11 | 0 | 0 | 0 | 0 | 0 |
| CL | 8 | 0 | 0 | 0 | 0 | 0 |
| IS | 2 | 0 | 0 | 0 | 0 | 0 |
| LB | 104 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **135** | **0** | **0** | **0** | **0** | **0** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | N/A | 0 | -- | 0.00 | no_concurrent_control |
| F | Not established | N/A | 0 | -- | 0.00 | no_concurrent_control |
| Combined | Not established | N/A | 0 | -- | 0.00 | no_concurrent_control |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-006 | Control group identified from ARM label (no explicit control flag in EX/TX). Verify assignment. |
| Prov-008 | Compound classified as Non-adjuvanted vaccine (inferred). Expected-effect profile has 6 entries. D9 pharmacological scoring active — matching findings receive reduced adversity confidence. |
| Prov-012 | No concurrent control detected -- adversity determination suppressed. Descriptive statistics only. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| FDA-001-LB | Warning | LB | 7 |
| SD-003 | Warning | DM | 4 |
| FDA-004-DS | Info | DS | 1 |
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 2 warnings, 2 info

---

## CBER-POC-Pilot-Study2-Vaccine_xpt

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | RABBIT / NEW ZEALAND |
| Route | INTRAMUSCULAR |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | 456a |
| Vehicle | Saline |
| Groups (main) | 2 |
| Recovery groups | 0 |
| Last dosing day | 31 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 vp/dose | 5/5 | VEHICLE_CONTROL | 0 |
| 1 | null vp/dose | 5/5 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BW | 32 | 0 | 1 | 0 | 14 | 17 |
| CL | 17 | 0 | 0 | 0 | 1 | 16 |
| FW | 15 | 0 | 0 | 0 | 1 | 14 |
| LB | 281 | 29 | 18 | 0 | 78 | 156 |
| MA | 18 | 0 | 0 | 0 | 2 | 16 |
| MI | 41 | 2 | 0 | 0 | 15 | 24 |
| OM | 70 | 9 | 0 | 0 | 43 | 18 |
| VS | 16 | 2 | 0 | 0 | 8 | 6 |
| **Total** | **490** | **42** | **19** | **0** | **162** | **267** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | Group 2 - 456a 1x10^11 VP | 38 | FW, LB, MI, OM, VS | 0.80 | below_tested_range |
| F | Not established | Group 2 - 456a 1x10^11 VP | 28 | BW, LB, MI, OM, VS | 0.80 | below_tested_range |
| Combined | Not established | Group 2 - 456a 1x10^11 VP | 66 | BW, FW, LB, MI, OM, VS | 0.80 | below_tested_range |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| hematologic | 0.839 | 0.988 | 54 | 23 | LB, MA, MI, OM | -- | -- |
| hepatic | 0.628 | 0.968 | 24 | 7 | LB, OM | -- | -- |
| general | 0.479 | 0.988 | 63 | 6 | BW, CL, FW, LB, MA, MI, OM | -- | -- |
| cardiovascular | 0.428 | 0.880 | 8 | 2 | OM, VS | -- | -- |
| renal | 0.349 | 0.882 | 14 | 2 | LB, MI, OM | -- | -- |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain for 20 subjects; derived from TX for 20 subjects. |
| Prov-002 | Route of administration from EX domain. |
| Prov-004 | Recovery groups detected in 2 arm(s). Recovery-phase data is analyzed separately. |
| Prov-006 | Control group identified from ARM label (no explicit control flag in EX/TX). Verify assignment. |
| Prov-008 | Compound classified as Non-adjuvanted vaccine (inferred). Expected-effect profile has 6 entries. D9 pharmacological scoring active — matching findings receive reduced adversity confidence. |

---

## CBER-POC-Pilot-Study3-Gene-Therapy

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | MONKEY / CYNOMOLGUS |
| Route | INTRAVENOUS |
| Study type | SINGLE DOSE TOXICITY |
| Treatment | Vector A |
| Vehicle | PBS + 0.001% Pluronic F-68 |
| Groups (main) | 2 |
| Recovery groups | 0 |
| Last dosing day | 1 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | null vg/kg | 3/0 | -- | 0 |
| 1 | null vg/kg | 3/0 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BW | 33 | 0 | 0 | 0 | 0 | 0 |
| CL | 9 | 0 | 0 | 0 | 0 | 0 |
| IS | 1 | 0 | 0 | 0 | 0 | 0 |
| LB | 528 | 0 | 0 | 0 | 0 | 0 |
| MA | 6 | 0 | 0 | 0 | 0 | 0 |
| MI | 16 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **593** | **0** | **0** | **0** | **0** | **0** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | N/A | 0 | -- | 0.00 | no_concurrent_control |
| F | Not established | N/A | 0 | -- | 0.00 | no_concurrent_control |
| Combined | Not established | N/A | 0 | -- | 0.00 | no_concurrent_control |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain for 5 subjects; derived from TX for 1 subjects. |
| Prov-002 | Route of administration from EX domain. |
| Prov-006 | Control group identified from ARM label (no explicit control flag in EX/TX). Verify assignment. |
| Prov-012 | No concurrent control detected -- adversity determination suppressed. Descriptive statistics only. |

---

## CBER-POC-Pilot-Study4-Vaccine

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | RABBIT / NEW ZEALAND |
| Route | INTRAMUSCULAR |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | SENDVACC99 |
| Vehicle | NONE |
| Groups (main) | 3 |
| Recovery groups | 0 |
| Last dosing day | 45 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/dose | 5/5 | NEGATIVE_CONTROL | 0 |
| 1 | 12.5 mg/dose | 5/5 | -- | 0 |
| 2 | 12.5 mg/dose | 5/5 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 34 | 2 | 0 | 0 | 16 | 16 |
| BW | 38 | 13 | 1 | 0 | 6 | 18 |
| CL | 9 | 0 | 0 | 0 | 1 | 8 |
| FW | 97 | 1 | 6 | 0 | 57 | 33 |
| IS | 2 | 0 | 2 | 0 | 0 | 0 |
| LB | 349 | 35 | 20 | 0 | 135 | 159 |
| MA | 17 | 1 | 0 | 0 | 4 | 12 |
| MI | 108 | 3 | 0 | 0 | 34 | 71 |
| OM | 73 | 8 | 0 | 0 | 13 | 52 |
| VS | 20 | 0 | 1 | 0 | 8 | 11 |
| **Total** | **747** | **63** | **30** | **0** | **274** | **380** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | Group 2, SENDVACC10 | 48 | BG, BW, FW, IS, LB, MI, OM | 0.80 | below_tested_range |
| F | Not established | Group 2, SENDVACC10 | 32 | BG, BW, IS, LB, MA, MI, OM | 0.80 | below_tested_range |
| Combined | Not established | Group 2, SENDVACC10 | 80 | BG, BW, FW, IS, LB, MA, MI, OM | 0.80 | below_tested_range |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| general | 0.801 | 0.980 | 63 | 17 | BG, BW, CL, FW, IS, LB, MA, MI, OM | -- | -- |
| hepatic | 0.765 | 0.926 | 27 | 10 | LB, MI, OM | -- | -- |
| hematologic | 0.615 | 1.000 | 75 | 23 | LB, MA, MI, OM | -- | -- |
| cardiovascular | 0.516 | 0.788 | 10 | 2 | MI, OM, VS | -- | -- |
| renal | 0.490 | 0.781 | 20 | 1 | LB, MI, OM | -- | -- |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-004 | Recovery groups detected in 3 arm(s). Recovery-phase data is analyzed separately. |
| Prov-008 | Compound classified as Adjuvanted vaccine (inferred). Expected-effect profile has 9 entries. D9 pharmacological scoring active — matching findings receive reduced adversity confidence. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 0 warnings, 1 info

---

## CBER-POC-Pilot-Study5

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | DOG / BEAGLE |
| Route | ORAL GAVAGE |
| Study type | CARDIOVASCULAR PHARMACOLOGY |
| Treatment | Drug-X |
| Vehicle | 0.5% hydroxypropylmethylcellulose |
| Groups (main) | 4 |
| Recovery groups | 0 |
| Last dosing day | 36 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg | 6/0 | Yes | 0 |
| 1 | 20 mg/kg | 6/0 | -- | 0 |
| 2 | 50 mg/kg | 6/0 | -- | 0 |
| 3 | 150 mg/kg | 6/0 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| CL | 12 | 0 | 0 | 0 | 3 | 9 |
| CV | 16 | 0 | 0 | 0 | 10 | 6 |
| EG | 20 | 0 | 0 | 0 | 0 | 8 |
| VS | 4 | 0 | 0 | 0 | 0 | 3 |
| **Total** | **52** | **0** | **0** | **0** | **13** | **26** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | 20 mg/kg | 2 | EG | ? | noel_framework |
| F | Not established | N/A | 0 | -- | ? | noel_framework |
| Combined | Not established | 20 mg/kg | 2 | EG | ? | noel_framework |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| cardiovascular | 0.690 | 1.000 | 28 | 5 | CV, EG, VS | -- | -- |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-005 | 6 subject(s) have variable dosing across study. Maximum dose used for group assignment. Review EX domain for per-timepoint doses. |
| Prov-006 | 6 control groups detected: 0/20/50/150 mg Drug-X/kg, 150/50/20/0 mg Drug-X/kg, 0/50/20/150 mg Drug-X/kg, 150/20/50/0 mg Drug-X/kg, 20/0/150/50 mg Drug-X/kg, 50/150/0/20 mg Drug-X/kg. '0/20/50/150 mg Drug-X/kg' used as primary comparator for statistical tests. |
| Prov-011 | Empty (0-byte) XPT file(s) skipped: LB. These domains were excluded from the analysis. Replace with valid XPT files and re-run the generator. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| FDA-003-PC | Warning | PC | 6 |
| SD-005 | Warning | EX | 6 |
| FDA-004-DS | Info | DS | 1 |
| FDA-004-EG | Info | EG | 1 |
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 2 warnings, 3 info

---

## CJ16050-xptonly

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | RAT / SPRAGUE-DAWLEY |
| Route | ORAL GAVAGE |
| Study type | RESPIRATORY PHARMACOLOGY |
| Treatment | Compound A |
| Vehicle | 0.5w/v% methylcellulose 400 solution |
| Groups (main) | 3 |
| Recovery groups | 0 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg | 6/0 | VEHICLE_CONTROL | 0 |
| 1 | 100 mg/kg | 6/0 | -- | 0 |
| 2 | 1000 mg/kg | 6/0 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| CL | 2 | 2 | 0 | 0 | 0 | 0 |
| RE | 3 | 3 | 0 | 0 | 0 | 0 |
| **Total** | **5** | **5** | **0** | **0** | **0** | **0** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | Compound A 100 mg/kg | 2 | RE | 1.00 | below_tested_range |
| F | Not established | N/A | 0 | -- | 0.80 | not_established |
| Combined | Not established | Compound A 100 mg/kg | 2 | RE | 1.00 | below_tested_range |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 0 warnings, 1 info

---

## CJUGSEND00

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | MONKEY / CYNOMOLGUS |
| Route | ORAL GAVAGE |
| Study type | CARDIOVASCULAR PHARMACOLOGY |
| Treatment | Compound A |
| Vehicle | 0.5 w/v% methylcellulose solution |
| Groups (main) | 4 |
| Recovery groups | 0 |
| Last dosing day | 1 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg | 4/0 | Yes | 0 |
| 1 | 10 mg/kg | 4/0 | -- | 0 |
| 2 | 30 mg/kg | 4/0 | -- | 0 |
| 3 | 100 mg/kg | 4/0 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| CL | 1 | 0 | 0 | 0 | 0 | 1 |
| CV | 12 | 0 | 0 | 0 | 2 | 10 |
| EG | 15 | 0 | 0 | 0 | 3 | 11 |
| VS | 3 | 0 | 0 | 0 | 0 | 2 |
| **Total** | **31** | **0** | **0** | **0** | **5** | **24** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | 10 mg/kg | 1 | EG | ? | noel_framework |
| F | Not established | N/A | 0 | -- | ? | noel_framework |
| Combined | Not established | 10 mg/kg | 1 | EG | ? | noel_framework |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| cardiovascular | 0.551 | 0.765 | 22 | 2 | CV, EG, VS | -- | -- |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-005 | 4 subject(s) have variable dosing across study. Maximum dose used for group assignment. Review EX domain for per-timepoint doses. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| SD-005 | Warning | EX | 4 |
| FDA-004-DS | Info | DS | 1 |
| FDA-007-EG | Info | EG | 1 |
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 1 warnings, 3 info

---

## FFU-Contribution-to-FDA

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | MONKEY / CYNOMOLGUS |
| Route | INTRAVENOUS |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | Compound |
| Vehicle | 15 mM histidine buffer, pH 6.0 ± 0.05 |
| Groups (main) | 5 |
| Recovery groups | 0 |
| Last dosing day | 47 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg | 0/2 | VEHICLE_CONTROL | 0 |
| 1 | 4 mg/kg | 0/2 | -- | 0 |
| 2 | 6 mg/kg | 0/2 | -- | 0 |
| 3 | 8 mg/kg | 0/2 | -- | 0 |
| 4 | 12 mg/kg | 0/2 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 27 | 4 | 7 | 0 | 5 | 11 |
| BW | 33 | 13 | 7 | 0 | 5 | 8 |
| CL | 34 | 0 | 0 | 0 | 28 | 6 |
| LB | 616 | 112 | 61 | 0 | 211 | 232 |
| MA | 3 | 0 | 0 | 0 | 2 | 1 |
| MI | 38 | 2 | 0 | 0 | 25 | 11 |
| OM | 60 | 5 | 2 | 0 | 16 | 37 |
| **Total** | **811** | **136** | **77** | **0** | **292** | **306** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | Not determined (single dose level) | 0 | -- | 0.80 | single_dose_not_established |
| F | Not established | G2 - Compound 1: 12 mg/kg | 38 | BW, CL, LB, MI, OM | 0.65 | single_dose_not_established |
| Combined | Not established | G2 - Compound 1: 12 mg/kg | 38 | BW, CL, LB, MI, OM | 0.65 | single_dose_not_established |
| M | Not established | N/A | 0 | -- | 0.80 | not_established |
| F | Not established | G3 - Compound 2: 4 mg/kg | 28 | BG, CL, LB, MI, OM | 0.65 | below_tested_range |
| Combined | Not established | G3 - Compound 2: 4 mg/kg | 28 | BG, CL, LB, MI, OM | 0.65 | below_tested_range |
| M | Not established | Not determined (single dose level) | 0 | -- | 0.80 | single_dose_not_established |
| F | Not established | G5 - Compound 3: 6 mg/kg | 57 | BG, BW, CL, LB, MI, OM | 0.65 | single_dose_not_established |
| Combined | Not established | G5 - Compound 3: 6 mg/kg | 57 | BG, BW, CL, LB, MI, OM | 0.65 | single_dose_not_established |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| hematologic | 0.982 | 0.860 | 23 | 11 | LB, MI, OM | -- | -- |
| general | 0.809 | 0.750 | 24 | 2 | BG, BW, CL, LB, MI, OM | -- | -- |
| hepatic | 0.793 | 0.750 | 14 | 4 | LB, MI, OM | -- | -- |
| renal | 0.645 | 0.834 | 10 | 2 | LB, MI, OM | -- | -- |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-006 | 4 control groups detected: Vehicle control:1, Dose:3, Dose:4, Dose:5. 'Vehicle control:1' used as primary comparator for statistical tests. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 0 warnings, 1 info

---

## Nimble

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | RAT / FISCHER 344 |
| Route | ORAL |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | Example Compound Name |
| Vehicle | SALINE |
| Groups (main) | 2 |
| Recovery groups | 0 |
| Last dosing day | 21 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg/day | 18/32 | VEHICLE_CONTROL | 0 |
| 1 | 10 mg/kg/day | 19/31 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 2 | 0 | 0 | 0 | 0 | 2 |
| BW | 2 | 0 | 0 | 0 | 1 | 1 |
| CL | 10 | 0 | 0 | 0 | 3 | 7 |
| DS | 2 | 2 | 0 | 0 | 0 | 0 |
| FW | 4 | 0 | 0 | 0 | 0 | 4 |
| LB | 6 | 0 | 0 | 0 | 0 | 6 |
| MA | 12 | 2 | 0 | 0 | 4 | 6 |
| MI | 10 | 2 | 0 | 0 | 4 | 4 |
| OM | 4 | 0 | 0 | 0 | 0 | 4 |
| **Total** | **52** | **6** | **0** | **0** | **12** | **34** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | N/A | 0 | -- | 0.00 | control_mortality_critical |
| F | Not established | N/A | 0 | -- | 0.00 | control_mortality_critical |
| Combined | Not established | N/A | 0 | -- | 0.00 | control_mortality_critical |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| general | 0.410 | 0.587 | 24 | 5 | BG, BW, CL, DS, FW, MI | -- | -- |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain for 67 subjects; derived from TX for 33 subjects. |
| Prov-002 | Route of administration from EX domain. |
| Prov-006 | 2 control groups detected: Treatment, Placebo. 'Treatment' used as primary comparator for statistical tests. |
| Prov-013 | 28.0% control mortality in 3.0w study. NOAEL determination suppressed due to critical control mortality. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| SD-003 | Warning | DM | 8 |
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 1 warnings, 1 info

---

## PDS

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | RAT / SPRAGUE-DAWLEY |
| Route | ORAL GAVAGE |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | PDS-FAKEDRUG-111 |
| Vehicle | methocell |
| Groups (main) | 4 |
| Recovery groups | 0 |
| Last dosing day | 30 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg | 13/13 | VEHICLE_CONTROL | 0 |
| 1 | 20 mg/kg | 13/13 | -- | 0 |
| 2 | 200 mg/kg | 13/13 | -- | 0 |
| 3 | 400 mg/kg | 13/13 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 78 | 11 | 1 | 0 | 28 | 38 |
| BW | 66 | 57 | 0 | 0 | 2 | 7 |
| CL | 12 | 1 | 0 | 0 | 3 | 8 |
| DS | 1 | 0 | 0 | 0 | 0 | 1 |
| FW | 18 | 12 | 0 | 0 | 2 | 4 |
| LB | 345 | 53 | 3 | 0 | 100 | 189 |
| MA | 29 | 1 | 0 | 0 | 2 | 26 |
| MI | 82 | 6 | 0 | 0 | 33 | 43 |
| OM | 58 | 9 | 0 | 0 | 16 | 33 |
| **Total** | **689** | **150** | **4** | **0** | **186** | **349** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | Low | 22 | BG, FW, LB | 0.80 | below_tested_range |
| F | Not established | Low | 50 | BG, BW, FW, LB, OM | 0.80 | below_tested_range |
| Combined | Not established | Low | 72 | BG, BW, FW, LB, OM | 0.80 | below_tested_range |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| hepatic | 0.727 | 1.000 | 35 | 10 | LB, MA, MI, OM | positive | 1.00 |
| hematologic | 0.677 | 0.940 | 57 | 17 | LB, MA, MI, OM | -- | -- |
| general | 0.640 | 1.000 | 170 | 34 | BG, BW, CL, DS, FW, LB, MA, MI, OM | -- | -- |
| neurological | 0.597 | 0.940 | 5 | 1 | MA, OM | positive | 1.00 |
| renal | 0.502 | 0.940 | 36 | 11 | LB, MA, MI, OM | positive | 1.00 |
| cardiovascular | 0.488 | 0.792 | 8 | 4 | MI, OM | positive | 1.00 |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-003 | 24 subject(s) in 8 combined TK set(s) retained in analysis (same animals serve tox + PK). |
| Prov-004 | Recovery groups detected in 2 arm(s). Recovery-phase data is analyzed separately. |
| Prov-010 | Sex-stratified arms detected: 10 sex-specific arms merged into 4 combined dose groups by dose value. Per-sex statistical comparisons preserved within each merged group. |
| Prov-013 | 3.9% control mortality in 4.3w study. Control mortality 4% in 4.3w study requires investigation |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| FDA-005-DS | Error | DS | 1 |
| FDA-001-LB | Warning | LB | 34 |
| FDA-003-PC | Warning | PC | 20 |
| SD-004 | Info | TS | 1 |

**Summary:** 1 errors, 2 warnings, 1 info

---

## PointCross

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | RAT / SPRAGUE-DAWLEY |
| Route | ORAL GAVAGE |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | PCDRUG |
| Vehicle | Saline |
| Groups (main) | 4 |
| Recovery groups | 0 |
| Last dosing day | 91 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg | 10/10 | VEHICLE_CONTROL | 0 |
| 1 | 2 mg/kg | 10/10 | -- | 10 |
| 2 | 20 mg/kg | 10/10 | -- | 10 |
| 3 | 200 mg/kg | 10/10 | -- | 10 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 9 | 2 | 0 | 0 | 1 | 6 |
| BW | 29 | 26 | 0 | 0 | 0 | 3 |
| CL | 9 | 1 | 0 | 0 | 3 | 5 |
| DS | 1 | 0 | 0 | 0 | 0 | 1 |
| EG | 6 | 0 | 0 | 0 | 1 | 5 |
| FW | 5 | 0 | 0 | 0 | 1 | 4 |
| LB | 161 | 27 | 0 | 0 | 38 | 96 |
| MA | 72 | 4 | 0 | 0 | 10 | 58 |
| MI | 101 | 6 | 0 | 3 | 36 | 56 |
| OM | 20 | 11 | 1 | 0 | 4 | 4 |
| VS | 2 | 0 | 1 | 0 | 0 | 1 |
| **Total** | **415** | **77** | **2** | **3** | **94** | **239** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | Group 2,2 mg/kg PCDRUG | 10 | BG, BW, LB, OM | 0.80 | below_tested_range |
| F | Not established | Group 2,2 mg/kg PCDRUG | 3 | BW, LB | 0.80 | below_tested_range |
| Combined | Not established | Group 2,2 mg/kg PCDRUG | 13 | BG, BW, LB, OM | 0.80 | below_tested_range |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| hematologic | 0.664 | 0.940 | 65 | 23 | LB, MA, MI, OM | -- | -- |
| cardiovascular | 0.659 | 0.940 | 12 | 3 | EG, MI, OM, VS | positive | 1.00 |
| hepatic | 0.595 | 0.940 | 37 | 17 | LB, MA, MI, OM | -- | -- |
| general | 0.516 | 0.940 | 61 | 15 | BG, BW, CL, DS, FW, MA, MI, OM | -- | -- |
| renal | 0.473 | 0.940 | 32 | 9 | LB, MA, MI, OM | positive | 1.00 |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-003 | 30 TK satellite subject(s) in 3 set(s) excluded from statistical analysis (detection: TKDESC). |
| Prov-004 | Recovery groups detected in 4 arm(s). Recovery-phase data is analyzed separately. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| FDA-005-DS | Error | DS | 1 |
| DC-001-MI | Warning | MI | 12 |
| FDA-001-LB | Warning | LB | 1 |
| FDA-003-PC | Warning | PC | 5 |
| FDA-007-EG | Info | EG | 1 |
| SD-004 | Info | TS | 1 |

**Summary:** 1 errors, 3 warnings, 2 info

---

## TOXSCI-24-0062--35449 1 month dog- Compound B-xpt

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | DOG / BEAGLE |
| Route | ORAL GAVAGE |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | 6576 |
| Vehicle | Polymer without drug in ultra pure water. (polymer: 70% hydroxypropylmethylcellulose-acetate-succinate-(medium substitution grade) [HPMC-AS-M] (w/w)) |
| Groups (main) | 4 |
| Recovery groups | 0 |
| Last dosing day | 28 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg/day | 3/3 | VEHICLE_CONTROL | 0 |
| 1 | 3 mg/kg/day | 3/3 | -- | 0 |
| 2 | 18 mg/kg/day | 3/3 | -- | 0 |
| 3 | 356 mg/kg/day | 3/3 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 12 | 3 | 0 | 0 | 4 | 5 |
| BW | 17 | 0 | 3 | 0 | 6 | 8 |
| CL | 98 | 22 | 0 | 0 | 30 | 46 |
| EG | 30 | 5 | 2 | 0 | 15 | 8 |
| FW | 71 | 10 | 1 | 0 | 39 | 21 |
| LB | 524 | 52 | 94 | 0 | 105 | 273 |
| MA | 20 | 1 | 0 | 0 | 12 | 7 |
| MI | 20 | 0 | 0 | 0 | 11 | 9 |
| OM | 61 | 6 | 0 | 0 | 28 | 27 |
| VS | 9 | 3 | 1 | 0 | 3 | 2 |
| **Total** | **862** | **102** | **101** | **0** | **253** | **406** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | Group 2 - 6576 3 mg/kg/day | 20 | BG, EG, FW, LB, OM, VS | 0.80 | below_tested_range |
| F | Not established | Group 2 - 6576 3 mg/kg/day | 20 | CL, EG, FW, LB, MA, VS | 0.80 | below_tested_range |
| Combined | Not established | Group 2 - 6576 3 mg/kg/day | 40 | BG, CL, EG, FW, LB, MA, OM, VS | 0.80 | below_tested_range |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| renal | 0.800 | 0.847 | 18 | 4 | LB, MA, OM | -- | -- |
| hepatic | 0.750 | 0.878 | 27 | 7 | LB, MI, OM | -- | -- |
| hematologic | 0.725 | 0.878 | 58 | 13 | LB, MA, MI, OM | -- | -- |
| cardiovascular | 0.725 | 0.793 | 20 | 4 | EG, OM, VS | -- | -- |
| general | 0.681 | 0.860 | 125 | 39 | BG, BW, CL, FW, LB, MA, MI, OM | -- | -- |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-003 | 6 set(s) had ambiguous TK classification (TK keyword present but subjects have tox data) — classified as combined, manual review recommended. 32 subject(s) in 6 combined TK set(s) retained in analysis (same animals serve tox + PK). |
| Prov-004 | Recovery groups detected in 2 arm(s). Recovery-phase data is analyzed separately. |
| Prov-005 | 22 subject(s) have variable dosing across study. Maximum dose used for group assignment. Review EX domain for per-timepoint doses. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| FDA-001-LB | Warning | LB | 2 |
| FDA-002-EG | Warning | EG | 1 |
| FDA-002-LB | Warning | LB | 1 |
| FDA-003-PC | Warning | PC | 49 |
| SD-005 | Warning | EX | 22 |
| FDA-004-EG | Info | EG | 5 |
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 5 warnings, 2 info

---

## TOXSCI-24-0062--43066 1 month dog- Compound A-xpt

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | DOG / BEAGLE |
| Route | ORAL GAVAGE |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | 5492 |
| Vehicle | 0.5% Methocel A4M, 0.1% Tween 80 and 99.4% water |
| Groups (main) | 4 |
| Recovery groups | 0 |
| Last dosing day | 28 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg/day | 3/3 | VEHICLE_CONTROL | 0 |
| 1 | 25 mg/kg/day | 3/3 | -- | 0 |
| 2 | 50 mg/kg/day | 3/3 | -- | 0 |
| 3 | 100 mg/kg/day | 3/3 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BW | 21 | 0 | 5 | 0 | 15 | 1 |
| CL | 30 | 7 | 0 | 0 | 3 | 20 |
| LB | 273 | 22 | 6 | 0 | 94 | 151 |
| MA | 3 | 0 | 0 | 0 | 2 | 1 |
| MI | 42 | 1 | 0 | 0 | 30 | 11 |
| OM | 55 | 9 | 0 | 0 | 18 | 28 |
| VS | 12 | 1 | 0 | 0 | 6 | 5 |
| **Total** | **436** | **40** | **11** | **0** | **168** | **217** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | Group 2 25 mg/kg/day | 17 | CL, LB, OM, VS | 0.80 | below_tested_range |
| F | Not established | Group 2 25 mg/kg/day | 10 | LB, MI, OM | 0.80 | below_tested_range |
| Combined | Not established | Group 2 25 mg/kg/day | 27 | CL, LB, MI, OM, VS | 0.80 | below_tested_range |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| renal | 0.791 | 0.803 | 17 | 2 | LB, MA, OM | positive | 1.00 |
| hematologic | 0.701 | 0.775 | 47 | 3 | LB, MI, OM | -- | -- |
| cardiovascular | 0.653 | 0.803 | 16 | 2 | MI, OM, VS | positive | 1.00 |
| hepatic | 0.584 | 0.777 | 30 | 3 | LB, MA, MI, OM | -- | -- |
| general | 0.577 | 0.787 | 59 | 12 | BW, CL, LB, MA, MI, OM | -- | -- |
| reproductive | 0.562 | 0.813 | 10 | 1 | MI, OM | positive | 1.00 |
| neurological | 0.487 | 0.756 | 9 | 1 | MI, OM | positive | 1.00 |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-004 | Recovery groups detected in 3 arm(s). Recovery-phase data is analyzed separately. |
| Prov-005 | 26 subject(s) have variable dosing across study. Maximum dose used for group assignment. Review EX domain for per-timepoint doses. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| FDA-001-LB | Warning | LB | 1 |
| FDA-003-PC | Warning | PC | 88 |
| SD-005 | Warning | EX | 26 |
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 3 warnings, 1 info

---

## TOXSCI-24-0062--87497 1 month rat- Compound B-xpt

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | RAT / SPRAGUE-DAWLEY |
| Route | ORAL GAVAGE |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | 6576 |
| Vehicle | 1% Hydroxyethylcellulose, 0.25% Polysorbate 80, 0.05% Antifoam in purified water |
| Groups (main) | 4 |
| Recovery groups | 0 |
| Last dosing day | 28 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg/day | 13/13 | VEHICLE_CONTROL | 0 |
| 1 | 25 mg/kg/day | 10/10 | -- | 18 |
| 2 | 125 mg/kg/day | 10/10 | -- | 18 |
| 3 | 1000 mg/kg/day | 10/10 | -- | 18 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 26 | 5 | 1 | 0 | 9 | 11 |
| BW | 26 | 14 | 0 | 0 | 6 | 6 |
| CL | 72 | 0 | 0 | 0 | 6 | 66 |
| FW | 1 | 0 | 0 | 0 | 0 | 1 |
| LB | 82 | 8 | 4 | 0 | 37 | 33 |
| MA | 21 | 0 | 0 | 0 | 2 | 19 |
| MI | 45 | 0 | 0 | 1 | 11 | 33 |
| OM | 67 | 11 | 0 | 0 | 15 | 41 |
| VS | 3 | 1 | 0 | 0 | 1 | 1 |
| **Total** | **343** | **39** | **5** | **1** | **87** | **211** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | Group 2 - 6576  25 mg/kg/day | 20 | BG, BW, LB, OM | 0.80 | below_tested_range |
| F | Not established | Group 2 - 6576  25 mg/kg/day | 8 | BW, LB | 0.80 | below_tested_range |
| Combined | Not established | Group 2 - 6576  25 mg/kg/day | 28 | BG, BW, LB, OM | 0.80 | below_tested_range |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| cardiovascular | 0.704 | 0.798 | 7 | 1 | OM, VS | -- | -- |
| reproductive | 0.689 | 0.908 | 9 | 4 | MI, OM | positive | 1.00 |
| hematologic | 0.525 | 0.874 | 54 | 7 | LB, MA, MI, OM | -- | -- |
| hepatic | 0.496 | 0.925 | 34 | 4 | LB, MA, MI, OM | positive | 1.00 |
| general | 0.475 | 0.940 | 94 | 10 | BG, BW, CL, FW, MA, MI, OM | -- | -- |
| renal | 0.349 | 0.825 | 36 | 4 | LB, MA, MI, OM | -- | -- |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-003 | 54 TK satellite subject(s) in 3 set(s) excluded from statistical analysis (detection: SET_label_candidate). |
| Prov-004 | Recovery groups detected in 2 arm(s). Recovery-phase data is analyzed separately. |
| Prov-005 | 124 subject(s) have variable dosing across study. Maximum dose used for group assignment. Review EX domain for per-timepoint doses. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| FDA-001-LB | Warning | LB | 1 |
| FDA-003-PC | Warning | PC | 12 |
| SD-005 | Warning | EX | 124 |
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 3 warnings, 1 info

---

## TOXSCI-24-0062--96298 1 month rat- Compound A xpt

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | RAT / SPRAGUE-DAWLEY |
| Route | ORAL GAVAGE |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | 5492 |
| Vehicle | Methocel (Methylcellulose)/Tween80/H2O |
| Groups (main) | 4 |
| Recovery groups | 0 |
| Last dosing day | 30 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg | 15/15 | VEHICLE_CONTROL | 0 |
| 1 | 50 mg/kg | 10/10 | -- | 0 |
| 2 | 125 mg/kg | 15/15 | -- | 0 |
| 3 | 250 mg/kg | 15/15 | -- | 0 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 18 | 1 | 0 | 0 | 7 | 10 |
| BW | 20 | 1 | 2 | 0 | 6 | 11 |
| CL | 31 | 1 | 0 | 0 | 4 | 26 |
| DS | 1 | 0 | 0 | 0 | 0 | 1 |
| FW | 14 | 4 | 0 | 0 | 3 | 7 |
| LB | 264 | 18 | 8 | 0 | 100 | 138 |
| MA | 12 | 0 | 0 | 0 | 2 | 10 |
| MI | 70 | 2 | 0 | 0 | 29 | 39 |
| OM | 61 | 4 | 0 | 0 | 10 | 47 |
| **Total** | **491** | **31** | **10** | **0** | **161** | **289** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | 50 mg/kg | 8 | FW, LB, MI, OM | 0.80 | below_tested_range |
| F | Not established | 50 mg/kg | 6 | FW, LB, OM | 0.80 | below_tested_range |
| Combined | Not established | 50 mg/kg | 14 | FW, LB, MI, OM | 0.80 | below_tested_range |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| general | 0.810 | 0.941 | 109 | 21 | BG, BW, CL, DS, FW, LB, MA, MI, OM | -- | -- |
| hematologic | 0.753 | 0.883 | 50 | 19 | LB, MA, MI, OM | -- | -- |
| hepatic | 0.625 | 0.940 | 32 | 10 | LB, MA, MI, OM | positive | 1.00 |
| cardiovascular | 0.407 | 0.620 | 10 | 3 | MI, OM | positive | 1.00 |
| renal | 0.377 | 0.645 | 31 | 1 | LB, MA, MI, OM | -- | -- |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-005 | 79 subject(s) have variable dosing across study. Maximum dose used for group assignment. Review EX domain for per-timepoint doses. |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| FDA-001-LB | Warning | LB | 1 |
| FDA-003-PC | Warning | PC | 70 |
| SD-005 | Warning | EX | 79 |
| FDA-006-SE | Info | SE | 30 |
| SD-004 | Info | TS | 1 |

**Summary:** 0 errors, 3 warnings, 2 info

---

## instem

### Design

| Dimension | Value |
|-----------|-------|
| Species / Strain | RAT / SPRAGUE-DAWLEY |
| Route | ORAL GAVAGE |
| Study type | REPEAT DOSE TOXICITY |
| Treatment | XYZ-12345 |
| Vehicle | Saline |
| Groups (main) | 5 |
| Recovery groups | 0 |
| Last dosing day | 30 |

### Dose Groups

| Level | Dose | N (M/F) | Control | TK |
|-------|------|---------|---------|-----|
| 0 | 0 mg/kg/day | 10/10 | VEHICLE_CONTROL | 18 |
| -3 | 0 mg/kg/day | 10/10 | NEGATIVE_CONTROL | 18 |
| 1 | 60 mg/kg/day | 10/10 | -- | 18 |
| 2 | 200 mg/kg/day | 10/10 | -- | 19 |
| 3 | 600 mg/kg/day | 10/10 | -- | 18 |

### Finding Classification

| Domain | Total | tr_adverse | tr_non_adverse | tr_adaptive | equivocal | not_treatment_related |
|--------|-------| --- | --- | --- | --- | --- |
| BG | 12 | 0 | 0 | 0 | 2 | 10 |
| BW | 16 | 1 | 0 | 0 | 1 | 14 |
| CL | 35 | 4 | 0 | 0 | 6 | 25 |
| FW | 13 | 1 | 2 | 0 | 4 | 6 |
| LB | 174 | 24 | 8 | 0 | 90 | 52 |
| MA | 8 | 0 | 0 | 0 | 0 | 8 |
| MI | 37 | 1 | 0 | 0 | 15 | 21 |
| OM | 22 | 3 | 1 | 0 | 7 | 11 |
| **Total** | **317** | **34** | **11** | **0** | **125** | **147** |

### NOAEL / LOAEL

| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |
|-----|-------|-------|-----------|---------|------------|--------|
| M | Not established | 60 mg/kg/day XYZ-12345 | 11 | CL, LB, MI | 0.80 | below_tested_range |
| F | Not established | 60 mg/kg/day XYZ-12345 | 15 | BW, CL, LB, OM | 0.80 | below_tested_range |
| Combined | Not established | 60 mg/kg/day XYZ-12345 | 26 | BW, CL, LB, MI, OM | 0.80 | below_tested_range |

### Target Organs

| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |
|-------------|-------|-----------|------|-------|---------|-----------|-------|
| hepatic | 0.682 | 0.858 | 22 | 6 | LB, MI, OM | positive | 1.00 |
| hematologic | 0.675 | 0.753 | 44 | 5 | LB, MA, MI, OM | -- | -- |
| renal | 0.610 | 1.000 | 24 | 5 | LB, MA, MI, OM | -- | -- |
| general | 0.536 | 0.922 | 64 | 14 | BG, BW, CL, FW, LB, MA, MI, OM | -- | -- |
| cardiovascular | 0.329 | 0.588 | 6 | 1 | MI, OM | positive | 1.00 |

### Provenance

| Rule | Message |
|------|---------|
| Prov-001 | Dose values extracted from EX domain. |
| Prov-002 | Route of administration from EX domain. |
| Prov-003 | 91 TK satellite subject(s) in 5 set(s) excluded from statistical analysis (detection: SET_label_candidate). |
| Prov-004 | Recovery groups detected in 5 arm(s). Recovery-phase data is analyzed separately. |
| Prov-006 | 2 control groups detected: Control Vehicle, Control Water. 'Control Vehicle' used as primary comparator for statistical tests. |
| Prov-009 | 2 control groups detected. '0 mg/kg/day Vehicle Control' designated as primary reference for statistical tests. Secondary control(s): 0 mg/kg/day Negative Control. Vehicle effects detected in 6/94 endpoints (BH-adjusted). Largest: Monocytes (F, d=2.0317), Basophils (F, d=1.9437), Alanine Aminotransferase (M, d=1.8255). |

### Validation Issues

| Rule | Severity | Domain | Records |
|------|----------|--------|---------|
| FDA-005-DS | Error | DS | 4 |
| FDA-003-PC | Warning | PC | 71 |
| SD-004 | Info | TS | 1 |

**Summary:** 1 errors, 1 warnings, 1 info

---
