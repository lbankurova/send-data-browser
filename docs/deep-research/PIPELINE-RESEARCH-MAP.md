# Pipeline-to-Research Document Map

Cross-reference between computational/data pipeline components and the deep research documents that provide the evidence basis for each choice. Use this to review whether a pipeline decision is well-grounded.

**Diagrams referenced:**
- `docs/diagrams/computational-pipeline.html` (CP)
- `docs/diagrams/pipeline.html` (DP)
- `docs/diagrams/classification-algorithms.html` (CA)

**Research documents:** all in `docs/deep-research/`

---

## Stage 1 — Input Preparation & Dose Group Assignment

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Dose group ordinal assignment (DM + TX) | CP Stage 1, DP Ingestion | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Domain integration | DM/TX join logic, TK satellite exclusion criteria |
| Three-pass split (all / scheduled-only / main-only) | CP Stage 1 (METH-01) | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §DS/DD domains | Rationale for excluding early deaths, recovery arm separation |
| Early death detection (DS + DD domains) | CP Stage 1 (BFIELD-46-52) | `how-FDA-reviews-SEND-submissions.md` §DD/DS as severity ceiling; `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Mortality | FDA treatment of mortality as ceiling, accidental reclassification rules |

## Stage 2 — Statistical Tests

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Dunnett's t-test (pairwise, continuous) | CP Stage 2 (STAT-07) | `github-repos-overlay-tox-assessment.md` §ToxicR; `reg-standards-for-auto-tox-finding-assessment.md` §Statistical significance | Choice of Dunnett's over Williams' as default; FWER control approach |
| Williams' test + ANCOVA (OM-specific) | CP Stage 2 (STAT-14) | `dr-organ_weight_normalization_research_complete.md` §ANCOVA vs ratio; `reg-standards-for-auto-tox-finding-assessment.md` §Organ weight | ANCOVA with BW covariate justification, Williams' step-down for monotone alternatives |
| Jonckheere-Terpstra trend test | CP Stage 2 (STAT-04) | `reg-standards-for-auto-tox-finding-assessment.md` §Dose-response | Trend test selection, normal approximation validity |
| Hedges' g effect size | CP Stage 2 (STAT-12) | `dr-organ_weight_normalization_research_complete.md` §Four-tier Hedges' g framework; `reg-standards-for-auto-tox-finding-assessment.md` §Magnitude | Bias correction formula, choice over Cohen's d / Glass' delta |
| Fisher's exact test (incidence) | CP Stage 2 (STAT-03) | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §MI domain; `reg-standards-for-auto-tox-finding-assessment.md` | 2x2 table construction for rare events |
| Cochran-Armitage trend (incidence) | CP Stage 2 (STAT-05) | `evaluating-tumor-findings-in-SEND.md` §Statistical methods | Score assignment for dose levels, relationship to Poly-3 |

## Stage 3 — Dose-Response Pattern Classification

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Equivalence-band method | CP Stage 3 (CLASS-02) | `reg-standards-for-auto-tox-finding-assessment.md` §Dose-response quality | Band = frac x pooled_SD approach, monotonic/threshold/non-monotonic discrimination |
| CV-tiered equivalence fractions | CA §6 | `brain-weights-thresholds.md` §CV by species; `dr-organ_weight_normalization_research_complete.md` §BW CV ranges; `reproductive_organ_research.md` §CV ranges | Tier 1/2/3 cutoffs (CV <10% / 10-20% / >20%), organ-specific tier assignments |
| Pattern enum + onset dose | CP Stage 3, CA §6 | `reg-standards-for-auto-tox-finding-assessment.md` §ECETOC A-1 factor | Threshold onset detection, confidence scoring formula |

## Stage 4 — Severity Classification

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Continuous severity (p + effect size gates) | CP Stage 4, CA §2 | `reg-standards-for-auto-tox-finding-assessment.md` §Biological vs statistical significance | \|g\| ≥ 0.5 / 0.8 / 1.0 thresholds, fallback logic |
| Incidence severity (direction-aware) | CA §2 | `reg-standards-for-auto-tox-finding-assessment.md` §Intrinsically adverse findings; `evaluating-tumor-findings-in-SEND.md` §Tumor direction | Protective (decrease) never classified adverse — regulatory basis |
| Treatment-relatedness gates | CP Stage 4 (CLASS-05), CA §7 | `reg-standards-for-auto-tox-finding-assessment.md` §ECETOC Step 1 | Three-gate boolean logic, convergence of p + trend + pattern |

## Stage 5 — ECETOC Finding-Level Assessment

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| **A-factor scoring (treatment-relatedness)** | CP Stage 5, CA §3 Step 1 | `reg-standards-for-auto-tox-finding-assessment.md` §ECETOC A-factors | A-1 through A-6 weights and scoring |
| A-1: Dose-response quality | | `reg-standards-for-auto-tox-finding-assessment.md` §Dose-response | monotonic=+2, threshold=+1.5, non_mono=+0.5 |
| A-2: Corroboration | | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Cross-domain concordance; `engine/deep-research-briefs-targeted.md` Brief 3 | Cross-domain syndrome matching, 33 syndrome definitions |
| A-3: Historical control range | | `engine/deep-research-briefs-targeted.md` Brief 4 (NTP CEBS); `reg-standards-for-auto-tox-finding-assessment.md` §HCD | HCD strain/organ/duration matching, within=-0.5 / outside=+0.5 |
| A-6: Statistical significance | | `reg-standards-for-auto-tox-finding-assessment.md` §Statistical significance | p<0.05=+1, trend<0.05=+0.5 |
| **B-factor gates (adversity)** | CP Stage 5, CA §3 Step 2 | `reg-standards-for-auto-tox-finding-assessment.md` §ECETOC B-factors | |
| B-1: Large magnitude (\|g\| ≥ 1.5) | | `reg-standards-for-auto-tox-finding-assessment.md` §Magnitude | Threshold selection for "large" effect |
| B-2: Moderate + corroborated (\|g\| ≥ 0.8) | | `engine/deep-research-briefs-targeted.md` Brief 2 (adaptive classification) | Non-liver adaptive response rules |
| B-3: Small effect (\|g\| < 0.5) | | `reg-standards-for-auto-tox-finding-assessment.md` §Adaptation | tr_non_adverse classification basis |
| B-6: Progression chains (14 chains) | CA §5, CP Stage 5 | `engine/deep-research-briefs-targeted.md` Brief 6; `evaluating-tumor-findings-in-SEND.md` §Progression | Precursor-to-tumor chains, severity triggers, species specificity |
| **MI/MA intrinsic adversity dictionary** | CA §3 Step 0, §5 | `reg-standards-for-auto-tox-finding-assessment.md` §Intrinsically adverse; `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §MI severity | 3-tier classification (always/likely/context-dependent), 22 terms |
| **6 Adaptive decision trees** | CA §5, CP Stage 5 | `engine/deep-research-briefs-targeted.md` Brief 2; see individual organs below | |
| Liver adaptive tree (Hall 2012) | | `lab-clinical-significance-thresholds.md` §Hy's Law, §Liver enzymes; `engine/deep-research-briefs-targeted.md` Brief 2 §1 | ALT/AST/ALP/GGT panel, enzyme fold thresholds, 3/7 clean check |
| Thyroid adaptive tree | | `engine/deep-research-briefs-targeted.md` Brief 2 §1 (Thyroid); Brief 3 §Thyroid | T3/T4/TSH cascade, liver-thyroid axis, rodent specificity (Capen 1997) |
| Adrenal adaptive tree | | `engine/deep-research-briefs-targeted.md` Brief 2 §2 (Adrenal); Brief 3 §Adrenal | Cortisol/ACTH pathway, stress vs. direct toxicity |
| Thymus/spleen adaptive tree | | `engine/deep-research-briefs-targeted.md` Brief 2 §3 (Lymphoid); Brief 3 §Bone marrow | Stress lymphocytolysis vs. immunotoxicity (ICH S8) |
| Kidney adaptive tree | | `engine/deep-research-briefs-targeted.md` Brief 2 §4 (Renal); Brief 3 §Bone marrow | BUN/CREAT/UrProt, alpha-2u-globulin exclusion |
| Gastric adaptive tree | | `engine/deep-research-briefs-targeted.md` Brief 2 §5 (Gastric) | Forestomach human relevance, mucosal hyperplasia vs. erosion |

## Stage 6 — Cross-Finding Enrichment

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| HCD reference ranges (A-3) | CP Stage 6, CA §1 | `engine/deep-research-briefs-targeted.md` Brief 4 (NTP CEBS profiling); `reg-standards-for-auto-tox-finding-assessment.md` §HCD | 7 strains, 16 organs, mu ± 2sigma range, strain matching criteria |
| Corroboration (syndrome matching) | CP Stage 6, CA §11 | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Cross-domain; `engine/deep-research-briefs-targeted.md` Brief 3 | 33 syndrome definitions (10 XS + 23 XC), term matching strategies, quality gate |
| Organ weight normalization | CP Stage 6 | `dr-organ_weight_normalization_research_complete.md` (primary); `brain-weights-thresholds.md` §Brain sparing; `reproductive_organ_research.md` §All subgroups | Bailey 2004 metric selection, BW correlation tiers, brain-ratio organs, reproductive organ exceptions |
| Organ system mapping | CP Stage 6 (METH-06) | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Domain structure | BIOMARKER_MAP (165 test codes), ORGAN_SYSTEM_MAP (100+ specimens) |

## Stage 7 — OM Two-Gate Classification

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Organ-specific thresholds (ceiling/floor/strong) | CA §4 | `engine/deep-research-briefs-targeted.md` Brief 1 (organ thresholds); `dr-organ_weight_normalization_research_complete.md` §Thresholds | 13 organs with species-aware thresholds, CV-derived basis |
| Brain special case (floor=0%) | CA §4 | `brain-weights-thresholds.md` (primary) | Brain as highly conserved organ, any stat sig = adverse |
| Two-gate decision matrix | CA §4 | `reg-standards-for-auto-tox-finding-assessment.md` §Organ weight magnitude; `engine/deep-research-briefs-targeted.md` Brief 1 | Stat x Mag matrix, HCD override logic, strong adverse override |
| Reproductive organ thresholds | CA §4 | `reproductive_organ_research.md` (primary) | Testes \|g\| ≥ 0.8, ovaries \|g\| ≥ 1.5, prostate \|g\| ≥ 1.0, absolute-weight preference |

## Stage 8 — Rules Engine (R01-R19)

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| R01-R03: Signal detection | CP Stage 7 | `reg-standards-for-auto-tox-finding-assessment.md` §Treatment-relatedness | TR, p-value, trend triggers |
| R04-R07: Severity & pattern | CP Stage 7 | `reg-standards-for-auto-tox-finding-assessment.md` §Adversity | Adverse flagging, monotonic/threshold/non-monotonic rules |
| R12-R13: Histopath incidence/severity | CP Stage 7 | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §MI severity; `reg-standards-for-auto-tox-finding-assessment.md` §Histopath | Incidence increase warning, severity gradient detection |
| R17: Mortality signal | CP Stage 7 | `how-FDA-reviews-SEND-submissions.md` §DD/DS ceiling; `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Mortality | Critical severity for death signals |
| R18-R19: Protective signals | CP Stage 7 | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Cross-domain | Incidence decrease, drug repurposing detection |

## Stage 9 — Signal Scoring & Confidence

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Signal score formula (continuous) | CP Stage 8, CA §9 | `reg-standards-for-auto-tox-finding-assessment.md` §Evidence hierarchy | Weight allocation (0.35 p + 0.20 trend + 0.25 effect + 0.20 pattern) |
| Signal score formula (incidence) | CP Stage 8, CA §9 | `reg-standards-for-auto-tox-finding-assessment.md` §Evidence hierarchy | Redistributed weights (0.45 p + 0.30 trend + 0.25 pattern), MI severity bonus |
| GRADE-style 6-dimension confidence | CP Stage 8 | `reg-standards-for-auto-tox-finding-assessment.md` §GRADE framework; `engine/deep-research-briefs-targeted.md` Brief 5 (temporal dimension) | D1-D6 scoring, HIGH/MOD/LOW thresholds, temporal dimension inclusion decision |
| Target organ evidence score | CP Stage 8, CA §10 | `reg-standards-for-auto-tox-finding-assessment.md` §Cross-endpoint; `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` | Convergence group logic, evidence ≥ 0.3 threshold |

## Stage 10 — NOAEL Determination

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| NOAEL derivation (LOAEL - 1) | CP Stage 9, CA §8 | `reg-standards-for-auto-tox-finding-assessment.md` §NOAEL as professional opinion | Filter for derived endpoints, adverse + p<0.05 gate |
| Mortality cap | CA §8 | `how-FDA-reviews-SEND-submissions.md` §DD/DS ceiling; `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Mortality | NOAEL cannot exceed mortality LOAEL |
| NOAEL confidence penalties | CA §8 | `reg-standards-for-auto-tox-finding-assessment.md` §NOAEL confidence | Single endpoint, sex inconsistency, uncorroborated penalty values |
| Per-sex NOAEL | CA §8 | `reg-standards-for-auto-tox-finding-assessment.md` §Sex-specific assessment | Min(M,F) default with exceptions |
| Scheduled-only dual pass | CA §8 | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Early death exclusion | Sensitivity analysis excluding early deaths |

## Stage 11 — Cross-Domain Syndrome Detection (Frontend)

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| 10 XS syndromes | CP Stage 12 | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` (primary); `engine/deep-research-briefs-targeted.md` Brief 3 | |
| XS01 Hepatocellular | | `lab-clinical-significance-thresholds.md` §Hy's Law; `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Liver | ALT/AST + OM liver + MI liver concordance |
| XS02 Cholestatic | | `lab-clinical-significance-thresholds.md` §R ratio; `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Liver | ALP + GGT/5NT + bile duct findings |
| XS03 Nephrotoxicity | | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Kidney | CREAT + BUN + kidney weight + MI kidney |
| XS04 Myelosuppression | | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Hematopoietic; `engine/deep-research-briefs-targeted.md` Brief 3 §Bone marrow | NEUT/PLAT/RBC+HGB concordance |
| XS05 Hemolytic Anemia | | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §Hematopoietic | RBC down + RETIC up + bilirubin + spleen |
| XS07 Immunotoxicity | | `engine/deep-research-briefs-targeted.md` Brief 2 §3 (Lymphoid) | WBC/LYMPH + thymus/spleen weight concordance |
| XS08 Stress Response | | `engine/deep-research-briefs-targeted.md` Brief 2 §2 (Adrenal), §3 (Lymphoid) | Adrenal weight + BW/thymus/lymph — secondary vs. primary |
| XS10 Cardiovascular | | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §EG/VS | QTc/PR/RR/HR/BP, species-specific correction |
| 23 XC organ chains | | `engine/deep-research-briefs-targeted.md` Brief 3 (concordance map) | Organ-specific corroboration with direction gates |

## Stage 12 — Syndrome Interpretation Cascade (Frontend)

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Certainty grading | CP Stage 13 | `reg-standards-for-auto-tox-finding-assessment.md` §Cross-domain plausibility (4-tier) | mechanism_confirmed / uncertain / pattern_only discrimination |
| Certainty caps (4 caps) | CP Stage 13 | `reg-standards-for-auto-tox-finding-assessment.md` §Cross-domain; `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` | Directional, single-domain, data sufficiency, liver enzyme caps |
| Treatment-relatedness (syndrome-level A-factors) | CP Stage 13 | `reg-standards-for-auto-tox-finding-assessment.md` §ECETOC Step 1 | D-R + concordance + stats at syndrome grain |
| Adversity (syndrome-level B-factors) | CP Stage 13 | `reg-standards-for-auto-tox-finding-assessment.md` §ECETOC Step 2 | Magnitude, convergence, progression, corroboration |
| Overall severity cascade (S0-S4) | CP Stage 13 | `reg-standards-for-auto-tox-finding-assessment.md` §Evidence hierarchy; `evaluating-tumor-findings-in-SEND.md` §NTP classification | Priority ordering, carcinogenic/proliferative tiers |

## Stage 13 — Translational Confidence

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Species normalization | CP Stage 14 | `integrating-pk-with-tox-to-compute-preclinical-exposure-margins.md` §Species Km | Strain → canonical species mapping |
| SOC lookup (LR+) | CP Stage 14 | `integrating-pk-with-tox-to-compute-preclinical-exposure-margins.md` §Safety margins; `how-FDA-reviews-SEND-submissions.md` §Cross-species | Olson/Bailey concordance rates, MedDRA SOC mapping |
| Translational tier (HIGH/MOD/LOW) | CP Stage 14 | `integrating-pk-with-tox-to-compute-preclinical-exposure-margins.md` §ICH margins | LR+ ≥ 5.0 / 2.0-5.0 / <2.0 cutoffs |

## Stage 14 — Tumor Analysis

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Tumor summary aggregation | DP Phase 1d | `evaluating-tumor-findings-in-SEND.md` (primary) | TF domain structure, adenoma-carcinoma combination rules |
| Poly-3 survival adjustment | | `evaluating-tumor-findings-in-SEND.md` §Poly-3 test | k=3 Weibull shape, Haseman significance criteria |
| Historical control tumor rates | | `evaluating-tumor-findings-in-SEND.md` §HCD; `engine/deep-research-briefs-targeted.md` Brief 4 | 5-year rolling window, strain-specific rates |
| Progression chains (neoplastic) | CA §5 | `evaluating-tumor-findings-in-SEND.md` §Progression; `engine/deep-research-briefs-targeted.md` Brief 6 | Hyperplasia → adenoma → carcinoma, obligate precursors |

## Stage 15 — PK Integration

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| TK design detection | DP Phase 3 | `integrating-pk-with-tox-to-compute-preclinical-exposure-margins.md` §TK profiles | Satellite group handling, PC/PP domain parsing |
| Human equivalent dose (HED) | DP Phase 3 | `integrating-pk-with-tox-to-compute-preclinical-exposure-margins.md` §HED formula | Km-based conversion: rat=6, dog=20, monkey=12, human=37 |
| Dose proportionality | DP Phase 3 | `integrating-pk-with-tox-to-compute-preclinical-exposure-margins.md` §Nonlinear kinetics | Power model assessment, saturation detection |
| Exposure margins | DP Phase 3 | `integrating-pk-with-tox-to-compute-preclinical-exposure-margins.md` §ICH M3(R2) | AUC/Cmax margin computation, 50-fold/10-fold thresholds |

## Stage 16 — Food Consumption & Body Weight

| Pipeline Component | Diagram | Research Document(s) | What to Verify |
|---|---|---|---|
| Food efficiency ratio | DP Phase 1e | `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` §FW/BW analysis | Palatability vs. toxicity discrimination (Flamm/Mayhew) |
| Body weight as secondary effect trigger | Various | `dr-organ_weight_normalization_research_complete.md` §10% OECD MTD; `reg-standards-for-auto-tox-finding-assessment.md` §BW threshold | ≥10% MTD, ≥20% adverse, normalization switching |

---

## Research Documents Not Directly Mapped to Current Pipeline

| Document | Content | Pipeline Gap / Future Use |
|---|---|---|
| `concordance-sources (1).xlsx` | Source catalog for cross-domain concordance evidence | Reference data for Brief 3 concordance map expansion |
| `send_browser_source_catalog.xlsx` | Master catalog of all research sources used | Traceability audit — verify all pipeline citations |
| `engine/deep-research-briefs-targeted.md` Brief 5 | GRADE temporal dimension design decision | D6 confidence dimension — include/merge/drop decision pending |

---

## Quick Lookup: Research Document → Pipeline Coverage

| Research Document | Pipeline Stages Covered |
|---|---|
| `reg-standards-for-auto-tox-finding-assessment.md` | Stages 2-5, 7-10, 12 (broadest coverage — primary regulatory basis) |
| `dr-organ_weight_normalization_research_complete.md` | Stages 2, 3, 6, 7, 16 (OM normalization, Hedges' g tiers, ANCOVA) |
| `integrating-SEND-domains-for-automated-nonclinical-safety-assessment.md` | Stages 1, 2, 6, 8, 10-12 (cross-domain integration, DS/DD, syndromes) |
| `engine/deep-research-briefs-targeted.md` | Stages 5-7, 9, 11, 14 (gap-filling: HCD, adaptive trees, concordance, progression) |
| `evaluating-tumor-findings-in-SEND.md` | Stage 14 (tumor analysis, Poly-3, progression) |
| `integrating-pk-with-tox-to-compute-preclinical-exposure-margins.md` | Stage 13, 15 (translational, HED, PK) |
| `brain-weights-thresholds.md` | Stages 3, 7 (brain CV, brain two-gate special case) |
| `reproductive_organ_research.md` | Stages 6, 7 (reproductive organ normalization and thresholds) |
| `lab-clinical-significance-thresholds.md` | Stages 5, 11 (Hy's Law, liver enzyme thresholds, R ratio) |
| `how-FDA-reviews-SEND-submissions.md` | Stages 1, 8, 10, 13 (FDA review patterns, mortality ceiling, validation) |
| `github-repos-overlay-tox-assessment.md` | Stage 2 (open-source statistical tool landscape, gap analysis) |
