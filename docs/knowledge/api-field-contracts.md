# Backend API Field Contracts

Computed/derived fields in the backend generator JSON outputs that cross the API boundary to the frontend. The frontend depends on these fields' types, nullability, and semantics.

This documents **computed fields only** -- raw SEND data pass-throughs (endpoint_label, domain, test_code, sex, specimen, finding, dose_level, dose_label, mean, sd, n, incidence, affected) are not listed. For frontend-side computed fields, see `field-contracts.md`. For analytical methods, see `methods.md`.

**ID scheme:** `BFIELD-XX` (distinct from frontend `FIELD-XX` IDs).

**Source function format:** `file.py:function_name()` (module path relative to `backend/`).

---

## 1. `study_signal_summary.json`

One row per endpoint x dose x sex (control rows excluded). Sorted by signal_score descending.

**Source:** `generator/view_dataframes.py:build_study_signal_summary()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-01 | `signal_score` | number | No | `view_dataframes.py:_compute_signal_score()` | 0.0--1.0, rounded to 3 decimals. Weighted composite: p-value (0.35), trend (0.20), effect size (0.25), DR pattern (0.20). Capped at 1.0. |
| BFIELD-02 | `severity` | string | No | `classification.py:classify_severity()` | One of `"adverse"`, `"warning"`, `"normal"`. Defaults to `"normal"`. Continuous: p + effect size. Incidence: p + direction (decrease is never adverse, at most warning). |
| BFIELD-03 | `treatment_related` | boolean | No | `classification.py:determine_treatment_related()` | True when (pairwise p < 0.05 AND trend p < 0.05), OR (adverse + monotonic pattern), OR (pairwise p < 0.01). Defaults to false. |
| BFIELD-04 | `dose_response_pattern` | string | No | `classification.py:classify_dose_response()` | One of `"monotonic_increase"`, `"monotonic_decrease"`, `"threshold_increase"`, `"threshold_decrease"`, `"non_monotonic"`, `"flat"`, `"insufficient_data"`. Uses equivalence-band noise tolerance (0.5x pooled SD for continuous, binomial SE for incidence). Defaults to empty string. |
| BFIELD-05 | `statistical_flag` | boolean | No | inline in `build_study_signal_summary()` | True when `p_value` is not null AND p_value < 0.05. Purely derived from pairwise p. |
| BFIELD-06 | `dose_response_flag` | boolean | No | inline in `build_study_signal_summary()` | True when `dose_response_pattern` is one of `"monotonic_increase"`, `"monotonic_decrease"`, `"threshold"`. Note: does not match threshold_increase/threshold_decrease variants -- matches exact string `"threshold"`. |

---

## 2. `target_organ_summary.json`

One row per organ system. Sorted by evidence_score descending.

**Source:** `generator/view_dataframes.py:build_target_organ_summary()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-07 | `evidence_score` | number | No | `view_dataframes.py:build_target_organ_summary()` | Rounded to 3 decimals. Computed as (total_signal / n_unique_endpoints) * (1 + 0.2 * (n_domains - 1)). Always >= 0. Domain diversity amplifies the score. |
| BFIELD-08 | `max_signal_score` | number | No | `view_dataframes.py:build_target_organ_summary()` | Rounded to 3 decimals. Maximum signal_score across all findings for this organ. Uses same `_compute_signal_score()` as BFIELD-01. |
| BFIELD-09 | `n_significant` | integer | No | `view_dataframes.py:build_target_organ_summary()` | Count of findings where min_p_adj < 0.05. Always >= 0. |
| BFIELD-10 | `n_treatment_related` | integer | No | `view_dataframes.py:build_target_organ_summary()` | Count of findings where treatment_related is true. Always >= 0. |
| BFIELD-11 | `target_organ_flag` | boolean | No | `view_dataframes.py:build_target_organ_summary()` | True when evidence_score >= 0.3 AND n_significant >= 1. Both conditions required. |
| BFIELD-12 | `max_severity` | number | **Yes** | `view_dataframes.py:build_target_organ_summary()` | Rounded to 2 decimals. Maximum avg_severity from MI/MA/CL group_stats across all findings for this organ. Null when no histopath group_stats have avg_severity (550/728 lesion rows have null avg_severity). |

---

## 3. `dose_response_metrics.json`

One row per endpoint x dose x sex (includes control rows).

**Source:** `generator/view_dataframes.py:build_dose_response_metrics()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-13 | `dose_response_pattern` | string | No | `classification.py:classify_dose_response()` | Same enum as BFIELD-04. One pattern per finding (shared across all dose rows of that finding). |
| BFIELD-14 | `trend_p` | number | **Yes** | `generator/domain_stats.py:compute_all_findings()` | Jonckheere-Terpstra or Cochran-Armitage trend test p-value (0--1). Null when trend test not applicable or insufficient data (< 3 groups). |
| BFIELD-15 | `scheduled_group_stats` | array | **Yes** | `generator/domain_stats.py` (dual-pass) | Group stats recomputed after excluding early-death subjects. Only present when early_death_subjects exist AND domain is terminal (BW, LB, OM). Array of `{dose_level, mean, sd, n, ...}`. |
| BFIELD-16 | `scheduled_pairwise` | array | **Yes** | `generator/domain_stats.py` (dual-pass) | Pairwise comparisons recomputed after excluding early deaths. Same structure as base pairwise. Only present when scheduled_group_stats exists. |
| BFIELD-17 | `scheduled_direction` | string | **Yes** | `generator/domain_stats.py` (dual-pass) | Direction from scheduled-only analysis. One of `"up"`, `"down"`, null. Only present when scheduled data computed. |
| BFIELD-18 | `n_excluded` | integer | **Yes** | `generator/domain_stats.py` (dual-pass) | Number of subjects excluded from scheduled stats. Null when no early-death exclusion applies. |

---

## 4. `lesion_severity_summary.json`

One row per (endpoint, specimen, finding, dose_level, sex) for MI/MA/CL/TF domains.

**Source:** `generator/view_dataframes.py:build_lesion_severity_summary()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-19 | `avg_severity` | number | **Yes** | from finding `group_stats[].avg_severity` | Pathologist severity grade averaged across affected animals in this dose group. Null for 550/728 rows (ungraded or absent findings). **Always null-guard with `?? 0`.** |
| BFIELD-20 | `severity_status` | string | No | `view_dataframes.py:build_lesion_severity_summary()` | One of `"absent"` (affected=0), `"present_ungraded"` (affected>0, avg_severity null), `"graded"` (affected>0, avg_severity not null). Never null. |
| BFIELD-21 | `severity` | string | No | `classification.py:classify_severity()` | Finding-level classification: `"adverse"`, `"warning"`, `"normal"`. Same as BFIELD-02 but propagated from the parent finding. |
| BFIELD-22 | `dominant_distribution` | string | **Yes** | from finding `modifier_profile.dominant_distribution` | SUPP modifier: most common distribution pattern (e.g., `"DIFFUSE"`, `"FOCAL"`, `"MULTIFOCAL"`). Null when no SUPP modifiers exist for this finding. |
| BFIELD-23 | `dominant_temporality` | string | **Yes** | from finding `modifier_profile.dominant_temporality` | SUPP modifier: most common temporality (e.g., `"ACUTE"`, `"SUBACUTE"`, `"CHRONIC"`). Null when no SUPP modifiers. |
| BFIELD-24 | `modifier_raw` | array | **Yes** | from finding `modifier_profile.raw_values` | Array of raw SUPP modifier strings. Null/absent when no modifiers. |
| BFIELD-25 | `n_with_modifiers` | integer | **Yes** | from finding `modifier_profile.n_with_modifiers` | Count of subjects with SUPP modifiers for this finding. 0 or absent when none. |
| BFIELD-26 | `modifier_counts` | object | **Yes** | from `group_stats[].modifier_counts` | Per-dose modifier frequency counts. Structure: `{modifier_string: count}`. Null/absent when no per-dose modifiers. |
| BFIELD-15a | `scheduled_group_stats` | array | **Yes** | (same as BFIELD-15) | Propagated from finding. See BFIELD-15. |
| BFIELD-16a | `scheduled_pairwise` | array | **Yes** | (same as BFIELD-16) | Propagated from finding. See BFIELD-16. |
| BFIELD-18a | `n_excluded` | integer | **Yes** | (same as BFIELD-18) | Propagated from finding. See BFIELD-18. |

---

## 5. `adverse_effect_summary.json`

One row per endpoint x dose x sex, filtered to non-normal findings only (severity != "normal").

**Source:** `generator/view_dataframes.py:build_adverse_effect_summary()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-27 | `severity` | string | No | `classification.py:classify_severity()` | One of `"adverse"`, `"warning"`. Never `"normal"` (filtered out). |
| BFIELD-28 | `treatment_related` | boolean | No | `classification.py:determine_treatment_related()` | Same logic as BFIELD-03. |
| BFIELD-29 | `dose_response_pattern` | string | No | `classification.py:classify_dose_response()` | Same enum as BFIELD-04. |
| BFIELD-30 | `max_fold_change` | number | **Yes** | `classification.py:compute_max_fold_change()` | Ratio: treated_mean / control_mean for the dose with largest |deviation|. >1 = increase, <1 = decrease. Null when control mean is zero or insufficient data. Rounded to 2 decimals. |

---

## 6. `noael_summary.json`

Three rows: M, F, Combined. One NOAEL determination per sex.

**Source:** `generator/view_dataframes.py:build_noael_summary()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-31 | `noael_dose_level` | integer | **Yes** | `view_dataframes.py:build_noael_summary()` | Dose level ordinal (0 = control). Null when no NOAEL established (adverse effects at lowest dose). Computed as LOAEL - 1. May be capped down by mortality LOAEL. |
| BFIELD-32 | `loael_dose_level` | integer | **Yes** | `view_dataframes.py:build_noael_summary()` | Lowest dose level with adverse effect at p < 0.05. Null when no adverse effects found. |
| BFIELD-33 | `noael_confidence` | number | No | `view_dataframes.py:_compute_noael_confidence()` | 0.0--1.0, rounded to 2 decimals. Starts at 1.0 with penalties: single_endpoint (-0.2), sex_inconsistency (-0.2), large_effect_non_significant (-0.2). Floor at 0.0. |
| BFIELD-34 | `noael_derivation` | object | No | `view_dataframes.py:build_noael_summary()` | Derivation trace object: `{method, loael_dose_level, loael_label, adverse_findings_at_loael[], n_adverse_at_loael, confidence, confidence_penalties[]}`. Method is `"highest_dose_no_adverse"` or `"not_established"`. |
| BFIELD-35 | `mortality_cap_applied` | boolean | No | `view_dataframes.py:build_noael_summary()` | True when NOAEL was capped down because it was >= mortality LOAEL. |
| BFIELD-36 | `mortality_cap_dose_value` | number | **Yes** | `view_dataframes.py:build_noael_summary()` | Dose value (in study units, e.g., mg/kg) at the capped NOAEL level. Null when no mortality cap applied. |
| BFIELD-37 | `scheduled_noael_dose_level` | integer | **Yes** | `view_dataframes.py:build_noael_summary()` | NOAEL derived using scheduled_pairwise data only (early deaths excluded). Null when no scheduled data available. |
| BFIELD-38 | `scheduled_noael_differs` | boolean | No | `view_dataframes.py:build_noael_summary()` | True when scheduled NOAEL differs from base NOAEL AND scheduled data exists. False when no scheduled data or values match. |

---

## 7. `rule_results.json`

One row per rule emission. Array of rule result objects.

**Source:** `generator/scores_and_rules.py:evaluate_rules()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-39 | `output_text` | string | No | `scores_and_rules.py:_emit()`, `_emit_organ()`, `_emit_study()` | Rule template rendered with finding context. Falls back to raw template on format errors. Never null/empty. |
| BFIELD-40 | `severity` | string | No | from RULES definition + dampening | One of `"critical"`, `"warning"`, `"info"`. R17 = critical, R04/R08/R10/R12/R15 = warning (R10 may dampen to info), all others = info. |
| BFIELD-41 | `params` | object | No | `scores_and_rules.py:_emit()` | Merged dict of base finding fields + rule-specific params. Always contains at minimum: `endpoint_label`, `domain`, `test_code`, `sex`, `direction`, `severity_class`, `treatment_related`, `n_affected`, `max_n`. Organ/study rules have reduced base sets. |
| BFIELD-42 | `params.n_affected` | integer | No | `scores_and_rules.py:_emit()` | Sum of `affected` across treated dose groups (dose_level > 0) from group_stats. Always >= 0. Only present in endpoint-scoped rules. |
| BFIELD-43 | `params.max_n` | integer | No | `scores_and_rules.py:_emit()` | Maximum `n` across all dose groups from group_stats. Always >= 0. Only present in endpoint-scoped rules. |
| BFIELD-44 | `params.dampened` | boolean | **Yes** | `scores_and_rules.py:evaluate_rules()` | True only on R10 (large effect) when n_affected <= 1. Single-animal finding -- severity downgraded from warning to info. Absent when not dampened. |
| BFIELD-45 | `params.dampening_reason` | string | **Yes** | `scores_and_rules.py:evaluate_rules()` | `"single_affected"` when dampened. Absent when not dampened. |

---

## 8. `study_mortality.json`

Single object (not array). Study-level mortality summary.

**Source:** `services/analysis/mortality.py:compute_study_mortality()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-46 | `total_deaths` | integer | No | `mortality.py:compute_study_mortality()` | Count of non-accidental deaths in main study (excludes recovery + TK satellite). Always >= 0. Accidental deaths reclassified via DD DDRESCAT. |
| BFIELD-47 | `total_accidental` | integer | No | `mortality.py:compute_study_mortality()` | Count of accidental deaths (DS + DD reclassification). Always >= 0. |
| BFIELD-48 | `mortality_loael` | integer | **Yes** | `mortality.py:compute_study_mortality()` | Lowest treated dose_level (> 0) with >= 1 death. Null when no treated-group deaths. Control deaths (dose_level 0) do not trigger LOAEL. |
| BFIELD-49 | `mortality_noael_cap` | number | **Yes** | `mortality.py:compute_study_mortality()` | Dose value at the mortality LOAEL level (used to cap NOAEL). Null when no mortality LOAEL exists. In study dose units (mg/kg). |
| BFIELD-50 | `severity_tier` | string | No | `mortality.py:compute_study_mortality()` | `"S0_Death"` when total_deaths > 0, `"none"` otherwise. Two-value enum. |
| BFIELD-51 | `deaths` | array | No | `mortality.py:compute_study_mortality()` | Array of enriched death records. Each: `{USUBJID, sex, dose_level, is_recovery, is_satellite, disposition, cause, relatedness, study_day, dose_label}`. Includes all deaths (main + recovery + satellite). `cause`, `relatedness`, `study_day` null when no DD record. |
| BFIELD-52 | `early_death_subjects` | object | No | `mortality.py:get_early_death_subjects()` | Map of `{USUBJID: DSDECOD}` for main-study subjects NOT in scheduled dispositions. Used by dual-pass statistics to exclude early deaths from terminal endpoints. Empty object when all subjects are scheduled. |

---

## 9. `tumor_summary.json`

Single object. Cross-domain TF + MI tumor analysis.

**Source:** `generator/tumor_summary.py:build_tumor_summary()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-53 | `has_tumors` | boolean | No | `tumor_summary.py:build_tumor_summary()` | True when any TF findings exist. False = entire summary is empty/default. |
| BFIELD-54 | `total_tumor_animals` | integer | No | `tumor_summary.py:build_tumor_summary()` | Count of unique USUBJIDs in TF domain. 0 when has_tumors is false. |
| BFIELD-55 | `total_tumor_types` | integer | No | `tumor_summary.py:build_tumor_summary()` | Count of (organ, morphology, sex) summaries. 0 when has_tumors is false. |
| BFIELD-56 | `summaries` | array | No | `tumor_summary.py:build_tumor_summary()` | Per-tumor-type records. Each: `{organ, morphology, behavior, cell_type, sex, count, by_dose[], trend_p}`. `behavior` is `"BENIGN"`, `"MALIGNANT"`, or `"UNCERTAIN"`. `trend_p` nullable (Cochran-Armitage). Empty array when no tumors. |
| BFIELD-57 | `combined_analyses` | array | No | `tumor_summary.py:_compute_combined_analyses()` | Benign + malignant combined by (organ, cell_type, sex). Each: `{organ, cell_type, sex, adenoma_count, carcinoma_count, combined_by_dose[], combined_trend_p}`. Only populated when same cell_type has >= 2 TF findings in an organ. Empty array otherwise. |
| BFIELD-58 | `progression_sequences` | array | No | `tumor_summary.py:_detect_progressions()` | Cross-domain TF+MI progression detection. Each: `{organ, cell_type, stages[], stages_present[], complete, mi_precursors[], has_mi_precursor, has_tf_tumor}`. `complete` = all stages in the defined sequence are present. Empty array when no progressions. |

---

## 10. `food_consumption_summary.json`

Single object. Cross-domain FW + BW food efficiency analysis.

**Source:** `generator/food_consumption_summary.py:build_food_consumption_summary_with_subjects()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-59 | `available` | boolean | No | `food_consumption_summary.py` | False when no FW domain or no raw FW/BW data. When false, no other fields are present. |
| BFIELD-60 | `caloric_dilution_risk` | boolean | No (when available) | `food_consumption_summary.py:_assess_caloric_dilution()` | True when study route (from TS ROUTE) contains "DIETARY", "DIET", "FEED", or "ADMIXTURE". Absent when available=false. |
| BFIELD-61 | `periods` | array | No (when available) | `food_consumption_summary.py:_compute_periods()` | Per-measurement-period records. Each: `{start_day, end_day, days, epoch, label, by_dose_sex[]}`. `by_dose_sex` entries contain: `{dose_level, sex, n, mean_fw, mean_bw_gain, mean_food_efficiency, food_efficiency_sd, food_efficiency_control, food_efficiency_reduced, fe_p_value, fe_cohens_d, fw_pct_change, bw_pct_change}`. Empty array when no valid periods computed. |
| BFIELD-62 | `overall_assessment` | object | No (when available) | `food_consumption_summary.py:_compute_overall_assessment()` | 4-way BW/FW/FE classification. Fields: `{bw_decreased, fw_decreased, fe_reduced, assessment, temporal_onset, narrative}`. `assessment` is one of: `"secondary_to_food"`, `"primary_weight_loss"`, `"malabsorption"`, `"compensated"`, `"not_applicable"`, `"indeterminate"`. |
| BFIELD-63 | `recovery` | object | **Yes** | `food_consumption_summary.py:_compute_recovery()` | Null when no recovery subjects exist. When present: `{available: true, fw_recovered: bool, bw_recovered: bool, interpretation: string}`. Recovery = within 10% of control mean. |

---

## 11. `pk_integration.json`

Single object. Cross-domain PC + PP + DM pharmacokinetic integration.

**Source:** `generator/pk_integration.py:build_pk_integration()`

| ID | Field | JSON type | Nullable | Source | Invariant |
|----|-------|-----------|----------|--------|-----------|
| BFIELD-64 | `available` | boolean | No | `pk_integration.py:build_pk_integration()` | False when PC, PP, or DM domains missing. When false, no other fields present. |
| BFIELD-65 | `km_factor` | number | **Yes** | `pk_integration.py:KM_TABLE` | FDA body surface area Km factor for study species. Null when species not in KM_TABLE (mouse=3, rat=6, dog=20, etc.). |
| BFIELD-66 | `hed_conversion_factor` | number | **Yes** | `pk_integration.py:KM_TABLE` | FDA BSA scaling conversion factor (animal dose / factor = HED). Null when species not in KM_TABLE. |
| BFIELD-67 | `tk_design` | object | No (when available) | `pk_integration.py:_detect_tk_design()` | TK satellite design detection. Fields: `{has_satellite_groups, satellite_set_codes[], main_study_set_codes[], n_tk_subjects, individual_correlation_possible}`. `individual_correlation_possible` is false when satellites exist (can't correlate TK exposure to main study toxicity per-animal). |
| BFIELD-68 | `by_dose_group` | array | No (when available) | `pk_integration.py:_build_dose_group_stats()` | Per-dose-group PK stats. Each: `{dose_level, dose_value, dose_unit, dose_label, n_subjects, parameters: {PARAM: {mean, sd, median, n, unit, values[]}}, concentration_time[]}`. Parameters keyed by PPTESTCD (CMAX, AUCLST, etc.). |
| BFIELD-69 | `dose_proportionality` | object | No (when available) | `pk_integration.py:_compute_dose_proportionality()` | Log-log AUC vs dose regression. Fields: `{parameter, slope, r_squared, assessment, dose_levels_used[], non_monotonic, interpretation}`. `assessment` is one of: `"linear"` (slope 0.8--1.2), `"supralinear"` (>1.2), `"sublinear"` (<0.8), `"insufficient_data"`. `slope`/`r_squared` null when insufficient data. |
| BFIELD-70 | `accumulation` | object | No (when available) | `pk_integration.py:_compute_accumulation()` | Multi-visit accumulation detection. Fields: `{available, ratio, assessment, reason}`. Currently always `available: false` (multi-visit analysis not yet implemented). `assessment` is `"unknown"`. |
| BFIELD-71 | `noael_exposure` | object | **Yes** | `pk_integration.py:_extract_exposure_at_dose()` | Exposure metrics at NOAEL dose level. Fields: `{dose_level, dose_value, cmax: {mean, sd, unit}, auc: {mean, sd, unit}, tmax: {mean, unit}}`. Null when NOAEL not established or no PK data at that dose. Sub-fields (cmax, auc, tmax) individually nullable. |
| BFIELD-72 | `loael_exposure` | object | **Yes** | `pk_integration.py:_extract_exposure_at_dose()` | Same structure as BFIELD-71 but at LOAEL dose level. Null when no LOAEL. |
| BFIELD-73 | `hed` | object | **Yes** | `pk_integration.py:_compute_hed()` | HED/MRSD computation. Fields: `{noael_mg_kg, hed_mg_kg, mrsd_mg_kg, safety_factor, method, noael_status}`. `noael_status` is `"established"` (NOAEL > 0) or `"at_control"` (adverse at all doses, HED/MRSD are zero). Null when NOAEL dose value or Km info unavailable. |

---

## Cross-cutting fields

These fields are propagated identically across multiple JSON outputs via `_propagate_scheduled_fields()`:

| Fields | Present in | Mechanism |
|--------|-----------|-----------|
| `scheduled_group_stats`, `scheduled_pairwise`, `scheduled_direction`, `n_excluded` | dose_response_metrics, lesion_severity_summary, adverse_effect_summary | Copied from parent finding dict when dual-pass early-death exclusion applies. All four are absent (not null) when no early-death data exists. |

---

## ID Allocation

| Range | Category | Count |
|-------|----------|-------|
| BFIELD-01 -- BFIELD-06 | study_signal_summary.json | 6 |
| BFIELD-07 -- BFIELD-12 | target_organ_summary.json | 6 |
| BFIELD-13 -- BFIELD-18 | dose_response_metrics.json | 6 |
| BFIELD-19 -- BFIELD-26 | lesion_severity_summary.json | 8 |
| BFIELD-27 -- BFIELD-30 | adverse_effect_summary.json | 4 |
| BFIELD-31 -- BFIELD-38 | noael_summary.json | 8 |
| BFIELD-39 -- BFIELD-45 | rule_results.json | 7 |
| BFIELD-46 -- BFIELD-52 | study_mortality.json | 7 |
| BFIELD-53 -- BFIELD-58 | tumor_summary.json | 6 |
| BFIELD-59 -- BFIELD-63 | food_consumption_summary.json | 5 |
| BFIELD-64 -- BFIELD-73 | pk_integration.json | 10 |
| BFIELD-74+ | Reserved for future fields | -- |

Total: 73 fields documented across 11 JSON output files.
