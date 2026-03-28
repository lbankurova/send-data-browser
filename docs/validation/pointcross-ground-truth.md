# PointCross Ground Truth Validation

**Study:** PC201708 — 13-week repeat-dose toxicity of PCDRUG in Sprague-Dawley rats
**Source:** [PhUSE SEND pilot](https://github.com/phuse-org/phuse-scripts/tree/master/data/send) (MIT license)
**Design:** 4 dose groups (Vehicle, 2, 20, 200 mg/kg), 10M+10F/group main study, 5M+5F recovery, daily oral gavage
**Ground truth:** nSDRG Section 6.2 explicitly documents 13 engineered signals

## Detection Results

| # | Engineered Signal | Groups | Domain | SENDEX Detection | Verdict | Notes |
|---|---|---|---|---|---|---|
| 1 | Body weight decreased | 3, 4 | BW | 26 adverse BW findings, M+F | **MATCH** | |
| 2 | Body weight gain decreased | 3, 4 | BG | Detected | **MATCH** | |
| 3 | AST increased | 4 | LB | Adverse, M+F | **MATCH** | |
| 4 | ALT increased | 4 | LB | Adverse, M+F | **MATCH** | |
| 5 | ALP increased | 4 | LB | Adverse, M+F | **MATCH** | |
| 6 | RBC decreased | 4 | LB | M: adverse (p_trend=0.024). F: warning, finding_class=tr_adverse (p_adj=0.189, p_trend=0.141) | **MATCH** | F correctly detected at lower confidence — sex-differential baseline sensitivity (see classification-verdicts.md §1) |
| 7 | HGB decreased | 4 | LB | Adverse, M+F | **MATCH** | |
| 8 | HCT decreased | 4 | LB | Adverse, M+F | **MATCH** | |
| 9 | Liver weights increased | 4 | OM | Adverse, M+F | **MATCH** | |
| 10 | Liver macroscopic findings | 3, 4 | MA | F: adverse (5/10, p=0.033). M: equivocal (4/10, p=0.087) | **MATCH** | M correctly graded lower — Fisher's exact at 4/10 vs 0/10 genuinely misses p<0.05. MI+OM cover the male signal (see classification-verdicts.md §2) |
| 11 | Liver microscopic findings | 3, 4 | MI | Adverse, M+F (HYPERTROPHY) | **MATCH** | |
| 12 | Liver tumors | 4 | TF | finding_class=tr_adverse, severity=adverse, treatment_related=true | **MATCH** | Adenoma + carcinoma both detected. Tumor summary correct. |
| 13 | Premature deaths (HCC) | 4 | DD | 1 death detected, mortality LOAEL at Group 4 | **MATCH** | |

**Score: 13/13 detected** (11 at full adverse severity, 2 at reduced confidence with correct scientific reasoning)

## NOAEL / LOAEL

| Dimension | Ground Truth | SENDEX | Verdict |
|---|---|---|---|
| NOAEL | Control (Group 1) | Control (dose_level 0) | **MATCH** |
| LOAEL | Group 2 or 3 (depends on synthesis) | Group 2 (2 mg/kg): 3 adverse (M), 1 (F), 4 (combined) | **MATCH** |
| Mortality LOAEL | Group 4 | dose_level 3 (Group 4) | **MATCH** |
| Control detection | Vehicle at Group 1 | is_control=true for Group 1 | **MATCH** |

## Target Organ Assessment

| Organ System | SENDEX Flags? | Ground Truth | Verdict | Explanation |
|---|---|---|---|---|
| Hepatic | Yes (score=0.498) | **Primary target** | **MATCH** | ALT, AST, ALP, liver weight, MA, MI, TF concordant |
| Hematologic | Yes (score=0.53) | **Secondary target** | **MATCH** | RBC, HGB, HCT, WBC + spleen/thymus |
| General | Yes (score=0.492) | Not listed | **Over-classified** | Driven by BW findings — genuine signal but not a "target organ" per STP convention |
| Neurological | Yes (score=0.76) | Not listed | **Over-classified** | Brain weight artifact from body weight confound (F +44% while BW down) |
| Cardiovascular | Yes (score=0.434) | Not listed | **Over-classified** | Heart weight artifact from body weight confound |
| Renal | Yes (score=0.388) | Not listed | **Over-classified** | Kidney weight BW-confound + hepatorenal secondary creatinine |
| Metabolic | Yes (score=0.357) | Not listed | **Over-classified** | Only 1 tr_adverse finding (Cholesterol M) — liver function marker |

**Primary and secondary target organs correctly identified.** 5 additional organs flagged due to: (a) absolute organ weight changes confounded by significant body weight decrease, (b) no cascade/dependency analysis for secondary effects. See classification-verdicts.md §3 for detailed assessment and improvement plan.

## Recovery

| Dimension | Result | Verdict |
|---|---|---|
| Recovery period detected | Yes (2-week) | **MATCH** |
| Recovery verdicts generated | Yes | **MATCH** |

## Syndrome Detection

PointCross triggers 10 cross-domain syndromes (XS01, XS03, XS04, XS05, XS07, XS08, XS09, XC01a, XC03a, XC04c). XS01 (Hepatocellular injury) is the primary expected syndrome for the engineered hepatotoxicity pattern. See `docs/scientific-logic.md` for full syndrome evaluation traces.
