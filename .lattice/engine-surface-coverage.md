# Engine Surface Coverage Matrix — Phase 2

> **Source plan:** `docs/_internal/incoming/scientific-defensibility-audit-plan.md` §2
> **Companion:** `.lattice/scientific-defensibility-findings.md` (Phase 1 SCIENCE-FLAGs)
> **Lives in parent** for the same reason as the findings file (submodule WIP). Migrate to `docs/_internal/research/distillations/engine-surface-coverage-2026-04-30.md` when the submodule clears.

This is a tier-by-tier inventory of the algorithmic outputs SENDEX produces, mapped to which validation-harness assertion type covers each surface. Cells:

- **GROUND_TRUTH** — covered by an equality matcher; engine call MUST equal the authored expectation
- **REGRESSION_PIN** — covered by description-only assertion (always-pass) OR by `zero_adverse`-style aggregate; surface drift not detected
- **UNCOVERED** — no validation-harness assertion checks this surface; engine output is asserted only by unit/integration tests in `backend/tests/`

Rows = surfaces (algorithmic decisions). Phase-3 candidates are the UNCOVERED rows where the surface meaningfully drives downstream consumption.

---

## Tier 1 — Regulatory-driving (NOAEL / LOAEL / mortality / adverse classification)

| Surface | Source JSON | Matcher | Coverage | Studies exercising | Notes |
|---|---|---|---|---|---|
| Combined NOAEL | `noael_summary.json` (sex=Combined) | `noael_combined` | **GROUND_TRUTH** | 16/16 | All studies authored |
| Combined LOAEL | `noael_summary.json` (sex=Combined) | `loael_combined` | **GROUND_TRUTH** | 15/16 | FFU omitted (multi-compound) |
| Sex-specific NOAEL (M / F) | `noael_summary.json` (sex=M, F) | — | **UNCOVERED** | TOXSCI-43066 needs | sex-divergent F-NOAEL=1, M-NOAEL=0 |
| Sex-specific LOAEL | `noael_summary.json` | — | **UNCOVERED** | All sex-stratified | |
| Per-endpoint NOAEL | `noael_summary.json` per-endpoint rows | — | **UNCOVERED** | All studies | underlies overall NOAEL |
| Mortality LOAEL | `study_mortality.json` | `mortality_loael` | **GROUND_TRUTH** | 16/16 | |
| Mortality cause classification | `study_mortality.json` deaths[] | `mortality_cause_concordance` | **GROUND_TRUTH** | PointCross only | other studies don't have mortality cause patterns to assert |
| Mortality NOAEL cap | `study_mortality.json` mortality_noael_cap | — | **UNCOVERED** | mortality-bearing studies | |
| Cause categorization (intercurrent/strain-pathology/undetermined) | `study_mortality.json` deaths[].cause_category | — | **UNCOVERED** | PDS (1 control death classified undetermined) | |
| Adverse classification per finding (`tr_adverse / tr_non_adverse / tr_adaptive / equivocal / not_treatment_related`) | `unified_findings.json` finding_class | `zero_adverse` (count=0 only) | **REGRESSION_PIN** | Study1, Study3 (zero) | UNCOVERED for non-zero distributions |
| Class distribution per study | `unified_findings.json` aggregated | — | **UNCOVERED** | All studies | Phase 3 candidate: `class_distribution` matcher |

## Tier 2 — Narrative-shaping (target organs / syndromes / severity / recovery)

| Surface | Source JSON | Matcher | Coverage | Studies exercising | Notes |
|---|---|---|---|---|---|
| Target organ flagging (subset semantics) | `target_organ_summary.json` target_organ_flag | `target_organs_flagged` | **GROUND_TRUTH** | PointCross | "all expected flagged, extras allowed" |
| Target organ flagging (exact set semantics) | `target_organ_summary.json` | `target_organs_flagged` w/ `expect_only` | **GROUND_TRUTH** | Study1, Study3, Study5 | exact match required |
| Cross-domain concordance per organ | `target_organ_summary.json` n_domains, evidence_quality.convergence | `cross_domain_concordance` | **GROUND_TRUTH** | PointCross hepatic | UNCOVERED for other organs |
| Cross-organ syndrome detection | `syndrome_rollup.json` cross_organ_syndromes | `cross_organ_syndrome` | **GROUND_TRUTH** | PointCross + instem + TOXSCI-96298 | Phase 3 matcher #7 (AUDIT-10) shipped 2026-04-30. PointCross emits []; instem + 96298 emit phospholipidosis (only multi-organ-defined syndrome). Surfaced Stream 5 NEW: engine's `len(organs) > 1` gate misses co-firing patterns. |
| Per-organ syndrome rollup | `syndrome_rollup.json` by_organ | — | **UNCOVERED** | most studies | |
| Histopath-specific syndrome detection | `subject_syndromes.json` | — | **UNCOVERED** | studies with MI findings | distinct from cross-domain (per CLAUDE.md "dual syndrome engines") |
| Severity assignment per finding | `unified_findings.json` severity_grade, `lesion_severity_summary.json` | — | **UNCOVERED** | all histopath-bearing studies | Phase 3 candidate: `severity_distribution` matcher |
| Recovery verdict per organ | `recovery_verdicts.json` per_finding | — | **UNCOVERED** | recovery-bearing (PointCross, instem, PDS, etc.) | Phase 3 candidate: `recovery_verdict` matcher |
| Recovery verdict per subject | `recovery_verdicts.json` per_subject | — | **UNCOVERED** | recovery-bearing | |
| Adverse-effect summary per group | `adverse_effect_summary.json` | — | **UNCOVERED** | all studies | aggregates upstream of NOAEL |
| Tumor flagging | `tumor_summary.json` has_tumors, summaries | — | **UNCOVERED** | PointCross has hepatic tumors | Phase 3 candidate: `tumor_detected` matcher |
| Tumor progression sequences | `tumor_summary.json` progression_sequences | — | **UNCOVERED** | PointCross HCC | |
| Protective syndromes detection | `protective_syndromes.json` | — | **UNCOVERED** | unknown which studies fire | |

## Tier 3 — Input layer (HCD / outliers / onset / patterns / TK / compound class)

| Surface | Source JSON | Matcher | Coverage | Studies exercising | Notes |
|---|---|---|---|---|---|
| HCD scoring (within-HCD verdict) | `unified_findings.json` per-finding hcd_evidence | — | **UNCOVERED** | studies with cyno + rat HCD coverage | Phase 3 candidate: `hcd_score` matcher |
| HCD A-3 factor | `unified_findings.json` hcd_a3_factor | — | **UNCOVERED** | HCD-eligible studies | |
| Fold-change thresholds | `dose_response_metrics.json` | — | **UNCOVERED** | all studies | |
| Subject-level outliers (LOO influence) | `animal_influence.json` | — | **UNCOVERED** | small-N studies | |
| Subject sentinel detection | `subject_sentinel.json` | — | **UNCOVERED** | studies with sentinel triggers | |
| Onset-day determination | `subject_onset_days.json` | `onset_concordance` | **GROUND_TRUTH** | PointCross (LB AST + CL ALOPECIA) | Phase 3 matcher #8 (AUDIT-8) shipped 2026-04-30. Domain-specific semantics: CL is data preservation (raw_subject_onset_days), LB is per-subject 2x control-mean threshold, MI/MA is sacrifice-day proxy (uninformative). Surfaced Stream 6 NEW: LB threshold rule misses cohort-level adversity at <2x per-subject. |
| Pattern monotonicity | `finding_dose_trends.json` | `non_monotonic_detected` (descr-only) | **REGRESSION_PIN** | CJ16050 (biphasic), Study5 (HR non-dose-dependent) | UNCOVERED mechanically |
| Compound-class flags | unknown — no dedicated JSON file | — | **UNCOVERED** | Study2/Study4 vaccines, FFU multi-compound | direct cause of 6 SCIENCE-FLAGs (D9 stream) |
| TK satellite handling | `pk_integration.json` tk_design + `study_metadata_enriched.json` | — | **UNCOVERED** | TOXSCI-87497, instem | covered via description-only `tk_excluded` |
| Multi-compound detection | `study_metadata_enriched.json` | `multi_compound_detected` (TODO) | **REGRESSION_PIN** | FFU | matcher always-passes; needs implementation |
| Trend suppression | `rule_results.json` MULTI_COMPOUND_DETECTED → suppress JT | `trend_suppressed` (TODO) | **REGRESSION_PIN** | FFU | matcher always-passes; needs implementation |
| Cross-animal flags (tissue battery, tumor linkage) | `cross_animal_flags.json` | — | **UNCOVERED** | studies with histopath | |
| Subject correlations | `subject_correlations.json` pairs | — | **UNCOVERED** | all studies | |
| Subject similarity (linkage matrix) | `subject_similarity.json` | — | **UNCOVERED** | all studies | |

## Design layer (handled by `checkDesign`, not assertions)

| Surface | Mechanism | Coverage | Studies |
|---|---|---|---|
| Species detection | `study_metadata_enriched.json` species | `checkDesign` (Species row) | 16/16 |
| Group count | `dose_groups[]` length | `checkDesign` (Groups main) | 16/16 |
| Dose values | `dose_groups[].dose_value` | `checkDesign` (Doses) | 16/16 |
| Recovery presence | `dose_groups[].is_recovery` + `recovery_n` | `checkDesign` (Recovery) | 16/16 |
| Concurrent control flag | `dose_groups[].is_control` | `checkDesign` (Concurrent control) | 16/16 |
| Combined NOAEL label | `noael_summary.json` Combined.label | `checkDesign` (NOAEL Combined) | 16/16 |

## Provenance / rule-firing layer

| Surface | Source JSON | Coverage | Notes |
|---|---|---|---|
| Rule firing log | `rule_results.json` | **UNCOVERED** | 611 rule fires on PointCross — could anchor to specific rules per study |
| Provenance messages | `provenance_messages.json` | **UNCOVERED** | engine reasoning trail |
| Validation rule conformance | `validation_results.json` | **UNCOVERED** | CDISC SEND validation, distinct from algorithmic correctness |
| Unrecognized terms | `unrecognized_terms.json` | **UNCOVERED** | dictionary version tracking |

---

## Coverage summary (16 reference YAMLs, this audit)

| Tier | Surfaces in tier | GROUND_TRUTH | REGRESSION_PIN | UNCOVERED | Coverage % |
|---|---|---|---|---|---|
| Tier 1 (regulatory) | 11 | 5 | 1 | 5 | 45% |
| Tier 2 (narrative) | 13 | 3 | 0 | 10 | 23% |
| Tier 3 (input) | 13 | 0 | 3 | 10 | 0% (GT only) |
| Design | 6 | 6 | 0 | 0 | 100% |
| Provenance | 4 | 0 | 0 | 4 | 0% |
| **Total** | **47** | **14** | **4** | **29** | **30%** GROUND_TRUTH |

Phase 1 closes the 16-study × ~5-surface authoring grid for Tier 1. Phase 2 confirms the long tail: **29 of 47 algorithmic surfaces have no harness coverage**, most concentrated in Tier 2 (severity, syndromes, recovery) and Tier 3 (HCD, outliers, onset, monotonicity).

## Phase 3 priority candidates (per audit plan §3)

Ordered by regulatory-leverage × Phase-1-flag-relevance:

1. **`class_distribution` matcher** — encodes per-study finding-class breakdowns (`>=N tr_adverse, >=M equivocal, etc.`). Direct measurement of the over-classification gap surfaced as Study2/4 + TOXSCI-87497 SCIENCE-FLAGs. Highest value.
2. **`severity_distribution` matcher** — encodes max severity grade per organ system. Tier 2 anchor; complements target_organs_flagged.
3. ~~**`recovery_verdict` matcher**~~ — DONE 2026-04-30 (AUDIT-5). Reads `recovery_verdicts.json:per_subject` joined with `subject_context.json:DOSE_GROUP_ORDER`. PointCross authored: MED hepatic hypertrophy MATCH (anomaly>=10, regression guard for engine's correct emergence detection) + HIGH hepatic hypertrophy SCIENCE-FLAG (persistent>=10 expected, engine reports anomaly=10 — Stream 4 NEW: per-subject `main_severity=null` schema mismatch with cohort aggregate at HIGH which shows 9/10 affected at sev 2.56). 4 other recovery-bearing studies (TOXSCI-35449, instem, PDS, Study4) per-study authoring deferred (AUDIT-17).
4. **`tumor_detected` matcher** — PointCross hepatic adenoma + carcinoma, plus any tumor-bearing TOXSCI study. Tier 2.
5. **`hcd_score` matcher** — within-HCD verdict; only fires on cyno + rat HCD-eligible tests. Tier 3 input layer; complements knowledge-graph parity tests.
6. ~~**`compound_class_flag` matcher**~~ — DONE 2026-04-30 (AUDIT-7). Reads `pk_integration.json:compound_class`. PointCross MATCH (small_molecule baseline) + Study1/2/3/4 SCIENCE-FLAG (engine has no vaccine/gene_therapy classifier in `services/analysis/compound_class.py:484-543`). 4 new flags reinforce Stream 1 at the source rather than via downstream class_distribution proxy.
7. ~~**`onset_concordance` matcher**~~ — DONE 2026-04-30 (AUDIT-8). Reads `subject_onset_days.json:subjects`. Per-domain semantics: CL is data preservation, LB is per-subject 2x control-mean threshold, MI/MA is sacrifice-day proxy. PointCross HIGH AST regression pin (>=1 by day 92) + HIGH AST SCIENCE-FLAG (>=5 expected by day 92, engine emits 1/29 -- Stream 6 NEW: per-subject 2x threshold misses cohort-level adversity at 1.41x M / 1.56x F cohort means) + HIGH CL:ALOPECIA preservation pin. MI/MA assertions intentionally omitted (tautological). Frontend consumer: filter-engine.ts:323 `evalOnsetDay` (Cohort view onset_day filter). Per-study expansion deferred to AUDIT-22.
8. **Sex-specific NOAEL/LOAEL extension** — `expected_value_male`, `expected_value_female`. Lightweight extension of existing matchers; addresses TOXSCI-43066 sex-divergent NOAEL.
9. ~~**`cross_organ_syndrome` matcher**~~ — DONE 2026-04-30 (AUDIT-10). Reads `syndrome_rollup.json:cross_organ_syndromes`. PointCross SCIENCE-FLAG (7-organ co-firing pattern invisible to engine's `len(organs) > 1` definition-spanning gate -- Stream 5 NEW: cross-organ co-firing not captured) + instem MATCH (`phospholipidosis` n=7) + TOXSCI-96298 MATCH (`phospholipidosis` n=32). Matcher supports 3 modes: equality (id+organs+min_count), count-floor (min_count alone), absence (max_count: 0). The original "Hy's-Law-style" framing was misleading -- the engine surface is "syndromes whose definition spans multiple organs" (currently only phospholipidosis qualifies), not "study-level multi-organ co-firing." Per-study expansion (other 12 zero-emit studies + corpus-wide co-firing assessment) deferred to AUDIT-20.

Each is a Phase-1-style author-and-encode pass plus a matcher implementation. Per the audit plan: ~1-2 hours per matcher + ~30 min per study × ~16 = ~10-20 hours total for Tier 2/3.

## Anti-goals (explicitly out of Phase 2 scope)

- **Validation-conformance surfaces** (`validation_results.json` core CDISC checks) are NOT algorithmic outputs in the SENDEX sense; they're SEND-format conformance. Out of scope.
- **`unrecognized_terms.json`** is dictionary-versioning telemetry, not algorithmic output. Out of scope.
- **Subject-similarity linkage matrices** are visualization-time computations; not regulatory-driving.

These are excluded from the Phase 3 candidate list because they don't support an authored GROUND_TRUTH ("what would a toxicologist conclude?") — they're either format checks or rendering helpers.
