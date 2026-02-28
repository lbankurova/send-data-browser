# Methods Index

One-line lookup for all methods in `methods.md`. Scan this first; drill into the full file only for relevant entries.

## Statistical Tests (STAT)

| ID | Name | Purpose |
|----|------|---------|
| STAT-01 | Welch's t-Test | Pairwise treated vs. control means, continuous endpoints |
| STAT-02 | Mann-Whitney U | Nonparametric pairwise, ordinal/non-normal data |
| STAT-03 | Fisher's Exact (2x2) | Pairwise incidence rates, binary endpoints |
| STAT-04 | Jonckheere-Terpstra | Monotonic dose-response trend, continuous |
| STAT-05 | Cochran-Armitage | Dose-dependent trend, binary incidence |
| STAT-06 | One-Way ANOVA F-Test | Omnibus test, any group mean differs |
| STAT-07 | Dunnett's Test | Multiple comparisons vs. control, FWER control |
| STAT-08 | Kruskal-Wallis H | Nonparametric omnibus (alt to ANOVA) |
| STAT-09 | Spearman Rank Correlation | Monotonic relationship assessment |
| STAT-10 | Bonferroni Correction | Familywise error rate control |
| STAT-11 | Binomial SE Tolerance | Equivalence band for incidence sampling noise |
| STAT-12 | Hedges' g Effect Size | Standardized mean difference, bias-corrected |
| STAT-12b | Cohen's d | Standardized mean difference, uncorrected |
| STAT-12c | Glass's Delta | Standardized mean difference, control SD only |
| STAT-13 | Welch Pairwise (raw) | Raw p-values for frontend Bonferroni |

## Algorithmic Methods (METH)

| ID | Name | Purpose |
|----|------|---------|
| METH-01 | Dual-Pass Early-Death Exclusion | Separate analysis with/without early deaths |
| METH-02 | BW Percent Change | Body weight as % change from baseline |
| METH-03 | Relative Organ Weight | Organ-to-body weight ratio normalization |
| METH-03a | OW Normalization Auto-Selection | Auto-detect BW confounding, select normalization strategy |
| METH-04 | MI Severity Score Mapping | Text severity grades to numeric scores |
| METH-05 | Incidence Normalization | Proportion affected per dose group |
| METH-06 | Organ System Resolution | Map any finding to organ system |
| METH-07 | Tumor Morphology to Cell Type | Cell lineage from tumor text |
| METH-08 | SETCD to Dose Level Mapping | TK satellite group to dose level |
| METH-08a | TK Satellite Detection | Identify/exclude TK animals from stats |
| METH-09 | ISO 8601 Duration Parsing | PK elapsed time to numeric hours |
| METH-10 | BQL Handling | Below-quantification-limit imputation (LLOQ/2) |
| METH-11 | TK Survivorship Cross-Ref | TK animal survival determination |
| METH-12 | Rule Suppression | Deduplicate redundant rule signals |
| METH-13 | Direction Determination | Assign "up"/"down" to findings |
| METH-14 | Cross-Domain Syndrome Detection | Multi-organ syndrome matching (XS01-XS10) |
| METH-15 | Compound Expression Evaluator | Boolean logic in syndrome definitions |
| METH-16 | Endpoint Synonym Resolution | Map varied labels to canonical names |
| METH-17 | Endpoint Aggregation | Collapse multi-row endpoints to single summary |
| METH-18 | Organ Coherence Derivation | Cross-domain evidence convergence per organ |
| METH-19 | Histopathology Proxy Matching | Morphological proxy for expected findings |
| METH-20 | Sex-Divergence Projection | Aggregate stats to sex-specific values |
| METH-21 | MedDRA Dictionary Key Building | Standardized concordance lookup keys |
| METH-22 | Discriminator Evaluation | Two-pass discriminating evidence assessment |
| METH-23 | Finding Term Normalization | Raw text to INHAND-aligned categories |
| METH-24 | Stress Confound Detection | XS07/XS04 overlap with stress (XS08) |
| METH-25 | Adaptive Response Pattern | Enzyme induction vs. hepatotoxicity |
| METH-26 | Species-Specific Biomarkers | Superior biomarker availability annotation |
| METH-27 | Treatment-Relatedness Trace | Factor-by-factor TR reasoning transparency |
| METH-28 | Histopath Severity Grade Extraction | Max MI severity from pathologist grading |
| METH-29 | Data Sufficiency Gate | Certainty cap for missing domains |
| METH-30 | Magnitude Floor | Prevent biologically trivial findings from matching |
| METH-31 | Certainty Upgrade Evidence | Corroborating evidence to lift tier caps |
| METH-32 | Food Consumption Key Stats | Per-sex BW/FC/FE metrics at highest dose |
| METH-33 | Two-Gate OM Classification | Organ-specific two-gate (statistical + magnitude) OM assessment |
| METH-34 | Adaptive Decision Trees | Context-dependent finding assessment via 6 organ-specific decision trees; liver tree includes full Hall 2012 LB panel gate (9 markers, min 5 clean, ALT+AST critical) |

## Classification Algorithms (CLASS)

| ID | Name | Purpose |
|----|------|---------|
| CLASS-01 | Severity Classification | Adverse/warning/normal from stats + magnitude |
| CLASS-02 | Dose-Response Pattern (Continuous) | Curve shape classification, noise-tolerant |
| CLASS-03 | Dose-Response Pattern (Incidence) | Frontend pattern for incidence/histopath |
| CLASS-04 | Pattern Confidence Scoring | Trust level for pattern label |
| CLASS-05 | Treatment-Relatedness | Treatment-related vs. spontaneous |
| CLASS-06 | NOAEL/LOAEL (Backend) | NOAEL/LOAEL from dose-group findings |
| CLASS-07 | Endpoint NOAEL (Frontend) | Per-endpoint NOAEL with tier classification |
| CLASS-08 | Target Organ Flagging | Aggregated signal evidence per organ |
| CLASS-09 | Syndrome Confidence | Evidence quality for detected syndromes |
| CLASS-10 | Recovery Verdict | Reversed/persisted/progressed classification |
| CLASS-11 | Protective Signal | Pharmacological/secondary/background classification |
| CLASS-12 | Syndrome Certainty | Mechanistic certainty from discriminating evidence |
| CLASS-13 | Adversity Assessment (ECETOC) | Per-finding (backend `assess_finding`) + per-syndrome (frontend `computeAdversity`) |
| CLASS-14 | Overall Severity Cascade | Mortality + tumor + mechanism + adversity integration |
| CLASS-15 | Lab Rule Severity | 31 graded clinical significance rules |
| CLASS-16 | Endpoint Confidence (Rail) | Adverse signal confidence for findings rail |
| CLASS-17 | Dose-Proportionality | Log-log PK regression |
| CLASS-18 | Rule Engine (R01-R19) | 19 signal rules across endpoint/organ/study |
| CLASS-19 | Finding Nature | Biological nature categories + reversibility |
| CLASS-20 | Recovery Classification | Interpretive categories from CLASS-10 verdicts |
| CLASS-21 | OPI Classification | Organ weight proportionality to body weight |
| CLASS-22 | Non-Monotonic Detection | Detect threshold patterns with peak not at highest dose |
| CLASS-23 | Trend Test Validity | Variance homogeneity check for JT trend test |
| CLASS-24 | Normalization Confidence Ceiling | FEMALE_REPRODUCTIVE organ weight confidence cap |
| CLASS-25 | Integrated Endpoint Confidence | 4-dimension min(stat, bio, DR, trend) confidence |
| CLASS-26 | NOAEL Contribution Weight | Endpoint weight for NOAEL derivation (1.0/0.7/0.3/0.0) |
| CLASS-27 | Weighted NOAEL Derivation | Study-level NOAEL from weighted endpoint contributions |

## Scoring & Aggregation (SCORE/AGG)

Entries at end of methods.md:
- Signal score composite (0-1), organ signal aggregation, rail sorting, NOAEL confidence, lab rule match confidence, histopath pattern confidence, histopath pattern weight, syndrome treatment-relatedness (ECETOC A), translational confidence, effect size to severity mapping, max fold change, HED conversion, recovery animal pooling.
