# Architecture

## Pipeline

The generator entry point (`backend/generator/generate.py`) orchestrates the
full pipeline, producing 29 JSON files per study to
`backend/generated/{study_id}/`. Three stages:

1. **Domain extraction** — 15 domain-specific findings modules in
   `backend/services/analysis/` (`findings_bg.py` through `findings_vs.py`)
   parse raw SEND domains and compute per-endpoint statistics
2. **Orchestration** — `findings_pipeline.py` merges domains, computes fold
   change, applies classification labels, runs confidence scoring
3. **View assembly** — 18 generator modules reshape findings into view-specific
   JSON; `generate.py` orchestrates the full output set

### Generated output (per study)

| File | Contents |
|------|----------|
| `unified_findings.json` | All findings with group stats, classifications, confidence scores |
| `study_metadata_enriched.json` | Design interpretation, dose groups, species, provenance |
| `study_mortality.json` | Deaths, cause categorization, mortality LOAEL |
| `noael_summary.json` | NOAEL/LOAEL per sex, driving findings, confidence |
| `recovery_verdicts.json` | Per-finding recovery verdicts (5 categories) |
| `subject_sentinel.json` | Per-animal outlier z-scores, Hamada residuals, POC/COC, detection metadata |
| `subject_similarity.json` | Gower MDS coordinates, clustering, ARI |
| `animal_influence.json` | LOO influence per animal per endpoint |
| `subject_noael_overlay.json` | Which animals drive NOAEL determination |
| `subject_syndromes.json` | Per-subject syndrome matching |
| `subject_context.json` | Per-animal dose assignment, arm, recovery status |
| `subject_onset_days.json` | First abnormal day per subject per endpoint |
| `rule_results.json` | ECETOC assessment tier evaluations |
| `protective_syndromes.json` | Boschloo + Bayesian dual-gate protective effects |
| `dose_response_metrics.json` | D-R pattern classification per endpoint |
| `finding_dose_trends.json` | Trend test results per finding |
| `food_consumption_summary.json` | FW domain summary for BW context |
| `organ_evidence_detail.json` | Per-organ evidence aggregation |
| `target_organ_summary.json` | Target organ identification and coherence |
| `tumor_summary.json` | TF domain tumor classification and progression |
| `pk_integration.json` | Cmax, AUC, Tmax from PC/PP domains |
| `cross_animal_flags.json` | Tissue battery completeness, tumor linkage |
| `provenance_messages.json` | Prov-001 to Prov-011 interpretation decisions |
| `study_signal_summary.json` | Study-level signal aggregation |
| `adverse_effect_summary.json` | Adverse effect classification summary |
| `lesion_severity_summary.json` | MI severity distribution per organ |
| `unrecognized_terms.json` | Terms not matched by recognition pipeline |
| `validation_results.json` | CDISC CORE + custom rule results |
| `static/` | HTML charts (dose-response) |

## Statistical methods

**Group comparisons**

| Method | Module | Purpose |
|---|---|---|
| Dunnett's test | `statistics.py` | Pairwise dose-vs-control comparisons (FWER-controlled) |
| Williams' test | `williams.py` | Monotone dose-response detection via isotonic regression (PAVA) |
| Welch's t-test | `statistics.py` | Pairwise comparison with unequal variance |
| Mann-Whitney U | `statistics.py` | Non-parametric group comparison |
| Fisher's exact test | `statistics.py` | 2x2 incidence comparison (histopath, clinical signs) |
| Boschloo's exact test | `statistics.py` | Unconditional exact test for protective syndrome detection |
| ANCOVA | `ancova.py` | Organ weight normalization by body weight covariate |

**Trend tests**

| Method | Module | Purpose |
|---|---|---|
| Jonckheere-Terpstra | `statistics.py` | Continuous dose-response trend |
| Cochran-Armitage | `statistics.py` | Binary (incidence) dose-response trend |
| Severity trend | `statistics.py` | Ordinal severity grade dose-response |
| Spearman correlation | `statistics.py` | Organ-weight and endpoint correlations |

**Effect size and confidence**

| Method | Module | Purpose |
|---|---|---|
| Hedges' g | `statistics.py` | Continuous effect size (small-sample corrected Cohen's d) |
| Cohen's h | `statistics.py` | Incidence effect size (arcsine-transformed proportion difference) |
| Risk difference | `statistics.py` | Absolute incidence difference with Wilson score CI |
| Bayesian incidence posterior | `statistics.py` | Beta-binomial posterior for incidence (dual-gate with Boschloo) |

**Outlier and sensitivity**

| Method | Module | Purpose |
|---|---|---|
| Qn robust scale | `statistics.py` | Scale estimator for small N (MAD alternative, 50% breakdown) |
| Hamada studentized residuals | `statistics.py` | Dose-response residual outlier detection |
| Leave-one-out stability | `statistics.py` | Per-animal signal fragility (recompute without each subject) |
| Bonferroni correction | `statistics.py` | Multiplicity adjustment for pairwise comparisons |

## Classification engine

`classification.py` — effect size grading, fold change categorization,
dose-response characterization, treatment-relatedness determination.

`adaptive_trees.py` — decision trees implementing ECETOC assessment tiers for
adversity determination.

`progression_chains.py` — cross-organ progression chain detection (e.g.,
hepatocellular hypertrophy -> necrosis -> enzyme elevation).

`compound_class.py` — 30 compound profiles across 9 modalities. Expected
pharmacological findings gated from adverse classification within severity
thresholds.

## Confidence scoring

`confidence.py` — 9-dimension per-finding confidence model:

| Dimension | What it measures |
|-----------|-----------------|
| D1 Statistical | p-value strength across methods |
| D2 Dose-response | Pattern quality (monotonic, threshold, etc.) |
| D3 Concordance | Cross-domain corroboration |
| D4 Historical control | Comparison against HCD ranges |
| D5 Cross-sex | Male/female consistency |
| D6 Tier 2 equivocal | Evidence for equivocal findings |
| D7 Direction | Consistency of effect direction |
| D8 Sample size | N-driven power and reliability |
| D9 Pharmacological | Compound class expected-effect matching |

## Historical control database

SQLite database built from multiple published sources via 8 ETL modules in
`backend/etl/`:

| Source | Species | Data |
|--------|---------|------|
| NTP IAD | Rat (SD, F344), Mouse (B6C3F1, C57BL/6, CD-1) | Organ weights, lab values, body weights |
| He 2017 | Rat (SD) | Lab reference intervals |
| Choi 2011 | Dog (Beagle) | Organ weights (15 organs, 950 animals), lab values (30 tests) |
| Amato 2022 | Monkey (Cynomolgus) | Organ weights (7 organs, 4047 animals) |
| Kim 2016 | Monkey (Cynomolgus) | Lab values (64 tests) |
| Ozkan 2012 | Rabbit (NZW) | Lab values (25 tests, low confidence) |
| Inotiv | Rat (Wistar Han) | Organ weights (16 organs, 190+ studies) |
| ViCoG | Rat (Wistar Han) | Lab reference intervals |

Queried at analysis time by `hcd.py` and `hcd_database.py` to contextualize
findings against historical ranges. Supports user-uploaded
HCD via annotation JSON with priority chain (user > system > none).

## Subject analysis pipeline

Four generator modules produce per-animal analytics:

| Module | Output | Purpose |
|--------|--------|---------|
| `subject_sentinel.py` | `subject_sentinel.json` | Qn/MAD robust z-scores, Hamada D-R residuals, per-organ concordance (POC), cross-organ concordance (COC), Everds stress triad, detection metadata (CV, window bounds) |
| `subject_similarity.py` | `subject_similarity.json` | Gower distance MDS, hierarchical clustering, adjusted Rand index |
| `animal_influence.py` | `animal_influence.json` | Leave-one-out influence per animal per endpoint, biological extremity scoring |
| `noael_overlay.py` | `subject_noael_overlay.json` | Which subjects drive NOAEL determination |

## Recovery and reversibility

| Module | Purpose |
|--------|---------|
| `incidence_recovery.py` | Effect-size comparison between terminal and recovery cohorts |
| `onset_recovery.py` | Subject-level onset day and recovery timing |
| `recovery-classification.ts` (frontend) | 6 recovery categories + confidence model |
| `recovery-duration-table.ts` (frontend) | 56 histo types + 61 continuous endpoints, species/severity-modulated durations across 14 organ systems |
| `recovery-verdict.ts` (frontend) | 5-verdict per-finding recovery determination |

## Syndrome detection

Two engines at different abstraction levels (intentionally separate):

| Module | Scope |
|---|---|
| `cross-domain-syndromes.ts` | 33 cross-domain syndromes (XS01-XS10 organ-focused + XC01a-XC12c cross-organ chains) spanning clinical path, histopath, organ weights |
| `syndrome-rules.ts` | 14 histopathology-specific syndrome rules |
| `corroboration.py` (backend) | Presence-based syndrome term matching, progression chains |
| `protective_syndromes.py` (backend) | R18-R25 protective effects (Boschloo + Bayesian dual gate) |

Species-specific overrides (2-11 per species) modify syndrome thresholds and
term matching for physiological differences.

## Frontend intelligence engines

78 modules in `frontend/src/lib/`. Key categories:

**Scoring and characterization**

| Module | Purpose |
|---|---|
| `signals-panel-engine.ts` | Signal scoring, panel-level aggregation |
| `endpoint-confidence.ts` | Per-endpoint confidence scoring (D1-D9 rendering) |
| `findings-rail-engine.ts` | Rail grouping, sorting, signal tier classification |
| `filter-engine.ts` | Multi-predicate finding filter logic |
| `pattern-classification.ts` | Dose-response pattern classification |

**Organ weight normalization**

| Module | Purpose |
|---|---|
| `organ-weight-normalization.ts` | ANCOVA-based organ weight adjustment |
| `organ-analytics.ts` | Target organ identification |
| `organ-sex-concordance.ts` | 14 organ-specific bands with concordance/divergence scoring |
| `organ-proportionality.ts` | Organ-to-body-weight proportionality |

**Synthesis and narrative**

| Module | Purpose |
|---|---|
| `rule-synthesis.ts` | Cross-view rule aggregation |
| `noael-narrative.ts` | Automated NOAEL rationale generation |
| `derive-summaries.ts` | Endpoint summaries, organ coherence, lab-clinical matches |
| `cross-study-engine.ts` | Safety margin calc, NOAEL reconciliation, 11 cross-study patterns *(dormant)* |

**Subject analysis**

| Module | Purpose |
|---|---|
| `cohort-engine.ts` | Subject similarity rendering, influence heatmap |
| `subject-concordance.ts` | Per-subject cross-domain concordance |
| `subject-profile-logic.ts` | Subject profile data assembly |
| `outlier-merge.ts` | Multi-source outlier flag merging |

## Validation

Dual-engine architecture:

- **CDISC CORE** — 400+ standard conformance rules, version-aware (SENDIG 3.0 / 3.1)
- **Custom rules** — 12 check modules in `backend/validation/checks/`:
  completeness, controlled terminology, data integrity, data types, domain
  completeness, FDA data quality (FDA-001 to FDA-007), referential integrity,
  required variables, study design (SD-001 to SD-007), timing, variable format

Both engines feed a unified triage UI. Each flagged record renders with inline
evidence showing the source data, rule logic, and suggested resolution.

14 validation studies (4 real-world, 10 synthetic) ship with the repo. Current
scores: 47/49 signals detected, 83/84 design checks matched.
