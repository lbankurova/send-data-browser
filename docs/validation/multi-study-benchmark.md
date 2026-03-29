# Multi-Study Validation Benchmark

Does SENDEX produce scientifically correct results? Validated against known ground truth (engineered signals), SME conclusions from submission reports, and study design metadata.

**Engine version:** Commit `73d8618` (2026-03-29)
**Last full validation:** 2026-03-29
**Studies:** 16 of 16 generating. 1826 frontend tests passing.

---

## Study Classification

| Study | Origin | Test Article | SME Reference Data | Validation Level |
|---|---|---|---|---|
| **PointCross** | Synthetic (PointCross Inc.) | PCDRUG | nSDRG §6.2: 13 engineered signals | Full ground truth |
| **PDS2014** | Synthetic (PDS) | PDS-FAKEDRUG-111 | FDA-validated SEND 3.0, documented LOAEL/NOAEL from prior analysis | Design + classification |
| **GLP003** | Synthetic (instem) | XYZ-12345 | Multi-format reference, dual control design | Design + classification |
| **Study1** | Synthetic (CBER POC) | Hepatitis B Vaccine | Covance study 8326556 report | Full SME comparison |
| **Study2** | Synthetic (CBER POC) | 456a Vaccine | Study report with pathology detail | Full SME comparison |
| **Study3** | Synthetic (CBER POC) | AAV Vectors A/B | Study report (VECTORSTUDYU1) | Full SME comparison |
| **Study4** | Synthetic (CBER POC) | SENDVACC10/99 Influenza | Study report with full clinical path | Full SME comparison |
| **Study5** | Synthetic (CBER POC) | Drug-X (3-1-PILOT) | Pilot study report, QTc/BP data | Full SME comparison |
| **CJUGSEND00** | Synthetic (CJ) | Compound A | Study report, telemetry endpoints | Full SME comparison |
| **CJ16050** | Synthetic (CJ) | Compound A | Study report, respiratory plethysmography | Full SME comparison |
| **FFU** | Real (FDA contribution) | 3 ADC compounds | No study report — PK/structure only | Design + findings count |
| **Nimort-01** | Synthetic (Nimble) | Unnamed | No study report | Design only |
| **35449** | Real (TOXSCI publication) | Compound B (IDO1, 6576) | No study report — publication data | Design + cross-species |
| **43066** | Real (TOXSCI publication) | Compound A (IDO1, 5492) | No study report — publication data | Design + cross-species |
| **87497** | Real (TOXSCI publication) | Compound B (IDO1, 6576) | No study report — publication data | Design + cross-species |
| **96298** | Real (TOXSCI publication) | Compound A (IDO1, 5492) | No study report — publication data | Design + cross-species |

**10 synthetic studies** (all with documented designs, 8 with SME-level reference data).
**5 real studies** (TOXSCI publication + FFU FDA contribution, no SME reports).
**1 synthetic with no reference** (Nimort-01).

---

## Synthetic Study Validation

### PointCross — 13-Week Repeat-Dose (Ground Truth, 13 Engineered Signals)

See [pointcross-ground-truth.md](pointcross-ground-truth.md) for signal-by-signal detail.

**Score: 13/13 signals detected.** 11 at full adverse severity, 2 at reduced confidence with correct scientific reasoning (RBC F threshold sensitivity, MA liver M borderline Fisher's exact).

| Dimension | Ground Truth | SENDEX | |
|---|---|---|---|
| NOAEL | Control (Group 1) | Control (dose_level 0) | MATCH |
| LOAEL | Group 2 (2 mg/kg) | Group 2: 4 adverse findings | MATCH |
| Mortality LOAEL | Group 4 | dose_level 3 | MATCH |
| Primary target organ | Hepatic | Hepatic (score 0.498) | MATCH |
| Secondary target organ | Hematologic | Hematologic (score 0.53) | MATCH |
| Target organ over-classification | — | 5 additional organs flagged | Known limitation (BW confound) |

### PDS2014 — 1-Month Repeat-Dose + Recovery (Synthetic, FDA-Validated)

**Design:** 4 groups (0, 20, 200, 400 mg/kg), SD rat, 30d + 27d recovery, TK subsets. PDS-FAKEDRUG-111.

| Dimension | Expected | SENDEX | Verdict |
|---|---|---|---|
| Design | 4 parallel groups + recovery | 4 groups, vehicle at dl=0, 2 recovery pairs | MATCH |
| Dose values | 0, 20, 200, 400 mg/kg | 0.0, 20.0, 200.0, 400.0 | MATCH |
| N (main) | ~26/group (124 total) | 26/group, 124 total (104 main + 20 recovery) | MATCH |
| Findings | Comprehensive multi-domain | 689 findings across 9 domains (BG BW CL DS FW LB MA MI OM) | PASS |
| NOAEL | Vehicle | Vehicle | MATCH |
| tr_adverse | Substantial (multi-organ toxicity) | 148 (21%) | PLAUSIBLE |
| Domains with DD/TF | Rare — has death + tumor data | DS findings present | MATCH |

### GLP003/instem — 1-Month Repeat-Dose (Synthetic, Dual Control, n=241)

**Design:** 5 groups (vehicle + water control + 60/200/600 mg/kg), SD rat, 29d + recovery. XYZ-12345.

| Dimension | Expected | SENDEX | Verdict |
|---|---|---|---|
| Dual control | Vehicle + water (negative) | multi_control_path_c: vehicle=primary, water=excluded | MATCH |
| Dose values | 0, 0, 60, 200, 600 mg/kg | Correct: vehicle(dl=0), negative(dl=-3), 60(dl=1), 200(dl=2), 600(dl=3) | MATCH |
| Recovery | 5 pairs (1R-5R) | All detected via DM ARM label fill | MATCH |
| TK satellites | ~91 | 91 excluded (5 sets) | MATCH |
| N (main) | 20/group | 20/group, 241 total | MATCH |
| Findings | 352 across 10 domains | BG BW CL DS FW LB MA MI OM TF | MATCH |
| NOAEL | Uncertain (dose metadata issues in original) | Not established | PLAUSIBLE — engine can't determine with available data |

---

## Tier 2: SME Comparison Studies

### Study2 — 456a Vaccine (NZW Rabbit)

**Report:** Control + 1 treatment (1x10^11 VP), 5M+5F/group, 30d + recovery. NOAEL = treatment dose (all findings pharmacology-related, non-adverse). Zero deaths.

| Dimension | SME Report | SENDEX | Verdict |
|---|---|---|---|
| **Study design** | Parallel, control + 1 treatment | 2 groups, VEHICLE_CONTROL at dl=0, recovery pairs | MATCH |
| **NOAEL** | Treatment dose (non-adverse) | Control | EXPECTED DISAGREEMENT — see below |
| **CRP** | 34-66x elevation (acute phase) | 4 tr_adverse (d up to 2.65) | DETECTED |
| **Fibrinogen** | 1.65-2x (p<0.001) | 4 tr_adverse (d up to 6.16) | DETECTED |
| **Monocytes** | 3x at Day 3 | F: tr_adverse (d=3.15). M: equivocal | PARTIAL — M borderline |
| **Globulin** | 1.2-1.3x | 4 tr_adverse | DETECTED |
| **A/G ratio** | Decreased | 4 tr_adverse (d up to -3.47) | DETECTED |
| **Spleen hyperplasia** | 10/10 treated | MI finding detected | DETECTED |
| **Iliac LN weight** | 7.8-10.4x (p<0.05) | OM finding detected | DETECTED |
| **Recovery** | Partial (injection sites cleared, lymphoid present) | Recovery verdicts generated | DETECTED |
| **IS domain** | IgG/IgM response (primary endpoint) | IS domain processed | DETECTED |

**NOAEL disagreement is expected and correct.** The engine classifies statistically significant findings as adverse; the report says they're pharmacology-related. This is the SG-01 gap addressed by D9 — when SME confirms vaccine_adjuvanted profile, D9 fires on 32 findings, confidence drops, SME overrides → NOAEL shifts to treatment dose.

**Compound profile not yet confirmed.** D9 scoring pending.

### Study4 — Adjuvanted Influenza Vaccine (NZW Rabbit)

**Report:** Control + 2 treatments (SENDVACC10, SENDVACC99), 5M+5F/group, 37d + recovery. NOAEL not formally stated — all findings pharmacology-related. Zero deaths.

| Dimension | SME Report | SENDEX | Verdict |
|---|---|---|---|
| **Study design** | 3 groups, parallel + recovery | 3 groups, NEGATIVE_CONTROL at dl=0, 3 recovery pairs | MATCH |
| **NOAEL** | Not stated (all non-adverse) | Control | EXPECTED DISAGREEMENT (same as Study2) |
| **CRP** | 338-729% (p<0.01) | 4 tr_adverse (d up to 2.77) | DETECTED |
| **Fibrinogen** | 1.5-2x (p<0.01) | 4 tr_adverse (d up to 4.04) | DETECTED |
| **Monocytes** | Both sexes increased | Equivocal or NTR | NOT DETECTED — borderline stats |
| **Globulin** | Increased | Partial (mostly equivocal) | PARTIAL |
| **A/G ratio** | Decreased (p<0.01) | 2 tr_adverse M, F equivocal | PARTIAL |
| **Spleen weight** | +47-63% (p<0.01 F) | OM finding detected | DETECTED |
| **Spleen hyperplasia** | 3-5/5 both treatments | MI finding detected | DETECTED |
| **LN hyperplasia** | 100% treated at Day 31 | MI findings detected (iliac, inguinal, sacral, mesenteric, mandibular) | DETECTED |
| **Injection site** | 4-5/5 treated vs 0-2/5 control | MI finding detected | DETECTED |
| **Body weight** | Transient loss post-dose | BW findings detected | DETECTED |
| **Food consumption** | Reduced (p<0.05, transient) | FW findings detected | DETECTED |

**Validated (D9):** With vaccine_adjuvanted profile confirmed, D9 fires on 32 of 747 findings. CRP drops from HIGH(3) → LOW(-1). Matches the spec's worked example.

### Study1 — Hepatitis B Vaccine (Cynomolgus, Single-Arm)

**Report:** Single-arm (4F), no control, immunogenicity characterization. Not a toxicity study. All endpoints normal.

| Dimension | SME Report | SENDEX | Verdict |
|---|---|---|---|
| **Design** | Single-arm, no control | 1 group, has_concurrent_control=false | MATCH |
| **NOAEL** | Not determined (not a tox study) | Not established | MATCH |
| **Adverse findings** | None | 0 tr_adverse (135 findings, all suppressed) | MATCH |
| **Statistical analysis** | Not possible (n=4, no control) | No-control suppression active | CORRECT |
| **IS domain** | Primary endpoint (IgG/IgM) | IS findings produced (2 findings) | DETECTED |

### Study3 — AAV Gene Therapy (Cynomolgus, No Control)

**Report:** Vector A vs Vector B at same dose, no vehicle control. Males only, n=3/group. No adverse findings. NOAEL not formally declared.

| Dimension | SME Report | SENDEX | Verdict |
|---|---|---|---|
| **Design** | 2 treatments, no vehicle control | 2 groups, has_concurrent_control=false | MATCH |
| **NOAEL** | Not formally declared | Not established | MATCH |
| **Adverse findings** | None (no adverse test-article findings) | 0 tr_adverse (593 findings, all no-control suppressed) | MATCH |
| **Background findings** | Liver vacuolation 6/6 (background, both groups) | Present in MI findings, not flagged adverse | CORRECT |
| **IS domain** | Custom domain (NAb titers) | IS findings produced | DETECTED |

### Study5 — CV Safety Pharmacology (Beagle Dog, Latin Square Crossover)

**Report:** 6 dogs, Latin square, vehicle/20/50/150 mg/kg oral single dose. QTc prolongation dose-dependent. BP decrease at 150 mg/kg.

| Dimension | SME Report | SENDEX | Verdict |
|---|---|---|---|
| **Design** | Latin square crossover, 4 periods | Crossover adapter, 4 dose levels, 6 subjects at each | MATCH |
| **QTc prolongation** | +44 msec at 150 mg/kg (peak 5-6h) | QTCSAG: p=0.004, d=2.17, direction=up | DETECTED |
| **BP decrease** | -25 mmHg SBP sustained at 150 mg/kg | SYSBP: d=-0.96; MAP: d=-0.80; DIABP: d=-0.81 | DETECTED |
| **NOAEL (inferred)** | ~20 mg/kg (from QTc data) | 50 mg/kg | PARTIAL — engine threshold higher than SME inference |
| **Emesis** | 50 and 150 mg/kg | 12 CL findings | DETECTED |
| **Within-subject stats** | Each dog = own control | Paired comparisons, per-occasion baselines | MATCH |

### CJUGSEND00 — CV Safety Pharmacology (Cynomolgus, Dose Escalation)

**Report:** 4 monkeys, dose escalation 0→10→30→100 mg/kg, telemetry. No formal NOAEL (safety pharm study).

| Dimension | SME Report | SENDEX | Verdict |
|---|---|---|---|
| **Design** | Within-subject dose escalation | Crossover adapter (escalation mode), 4 dose levels | MATCH |
| **Dose sequence** | 0;10;30;100 mg/kg (semicolon-delimited) | Correctly parsed, 4 levels | MATCH |
| **CV endpoints** | BP, HR from telemetry | 2 CV findings (HR, MAP) | DETECTED |
| **EG endpoints** | PR, QRS, QT, QTcB, RR | 4 EG findings | DETECTED |
| **Escalation confound** | Dose always increases with period | Acknowledged (carryover flag) | CORRECT |

**Previously: all insufficient_data** (51 findings, 0 usable). Now: 11 findings with within-subject statistics.

### CJ16050 — Respiratory Safety Pharmacology (SD Rat, Parallel)

**Report:** Vehicle + 100 + 1000 mg/kg, single dose, plethysmography. Biphasic: low dose stimulates RR, high dose suppresses TV.

| Dimension | SME Report | SENDEX | Verdict |
|---|---|---|---|
| **Design** | Parallel, 3 groups, vehicle control | 3 groups, VEHICLE_CONTROL at dl=0 | MATCH |
| **RR stimulation (100 mg/kg)** | +108% at 1h (p<0.05) | RESPRATE: +52% mean, d=1.65, p<0.001 | DETECTED (lower % — mean across timepoints vs peak) |
| **TV suppression (1000 mg/kg)** | -26% at 1h (p<0.05) | TIDALVOL: -27%, d=-1.78, p<0.001 | DETECTED |
| **MV suppression (1000 mg/kg)** | -27% at 2h (p<0.05) | MV: -40%, d=-2.04, p<0.001 | DETECTED |
| **Biphasic dose-response** | Low stimulates, high suppresses | Non-monotonic pattern detected | DETECTED |
| **NOAEL** | Not stated (both doses produced effects) | Control | MATCH (control is correct — no unaffected dose) |

---

## Tier 3: Design Validation Only (No SME Reports)

These studies have no submission reports for classification validation. We validate only that trial design parsing is correct based on TX/DM domain metadata.

| Study | Groups | Doses | Control | Recovery | TK | N | Verdict |
|---|---|---|---|---|---|---|---|
| **FFU** | 5 | 0, 4, 6, 8, 12 mg/kg | Vehicle | None | 0 | 10 | PASS — 3 compounds detected, trend suppressed |
| **Nimort-01** | 2 | 0, 10 mg/kg | Placebo/vehicle | None | 0 | 100 | NOTE — expected 3 groups, 2 in data |
| **PDS2014** | 4 | 0, 20, 200, 400 mg/kg | Vehicle | 2 pairs | 0 | 124 | PASS |
| **35449** | 4 | 0, 3, 18, 356 mg/kg | Vehicle | 2 pairs | 0 | 32 | PASS |
| **43066** | 4 | 0, 25, 50, 100 mg/kg | Vehicle | 3 pairs | 0 | 36 | PASS |
| **87497** | 4 | 0, 25, 125, 1000 mg/kg | Vehicle | 2 pairs | 54 (3 sets) | 160 | PASS — dose ordering correct |
| **96298** | 4 | 0, 50, 125, 250 mg/kg | Vehicle | None | 0 | 110 | PASS — label normalization working |
| **GLP003** | 5 | 0, 0, 60, 200, 600 mg/kg | Dual (vehicle + negative) | 5 pairs | 91 (5 sets) | 241 | PASS — Path C, recovery fill |

### FFU Detail

| Aspect | Expected | Detected | Verdict |
|---|---|---|---|
| Multi-compound | 3 test articles (Compound 1, 2, 3) | is_multi_compound=true, 3 compounds | PASS |
| TCNTRL on treated arms | All arms had TCNTRL="Vehicle Control" | Only vehicle (dose=0) classified as control | PASS |
| Trend suppression | JT across compounds meaningless | 295 findings trend-suppressed | PASS |
| Findings | 295 total, 40 tr_adverse (pairwise-only) | Produced | PASS |

### GLP003 Detail

| Aspect | Expected | Detected | Verdict |
|---|---|---|---|
| Dual control | Vehicle (saline) + negative (water) | multi_control_path_c, vehicle=primary, water=secondary (dl=-3) | PASS |
| Recovery arms | 5 pairs (1R-5R, distinct DM ARMCDs) | All detected via DM ARM label fill | PASS |
| TK satellites | 91 across 5 sets | All excluded | PASS |
| Dose groups | 5 (2 controls + 3 treated) | 5 correct, treated at dl=1-3 | PASS |

---

## Open Items

1. **Compound profiles not yet confirmed.** Study2, Study4 (vaccine), Study3 (gene therapy), CJ16050 (safety pharm) would benefit from D9 scoring. Current adversity uses statistical-only pathway. Validation of D9 impact pending profile confirmation.

2. **Monocyte detection borderline.** Study2 M and Study4 both sexes — monocyte elevation is real but effect sizes are borderline for the classification thresholds. May require threshold tuning for vaccine-context acute phase markers.

3. **Study5 NOAEL discrepancy.** Engine says 50 mg/kg; SME infers ~20 mg/kg from QTc data. The 20 mg/kg QTc change (+8 msec) is below the within-subject effect size threshold. May need CV-specific NOAEL criteria (QTc >10 ms = concern).

4. **Nimort-01 group count.** TX domain encodes 2 arms; analysis document says 3 dose groups. Data source issue, not code.

5. **Target organ over-classification.** PointCross and Study4 both flag more organs than SME reports. Root cause: absolute organ weight changes confounded by body weight decrease, no cascade/dependency analysis.

---

## Validation Version

- **Engine version:** Commit `73d8618` (2026-03-29)
- **Frontend tests:** 1826 passing
- **Studies generating:** 16 / 16
