# `hcd_evidence` Schema-Consumer Audit (Phase-1)

**Cycle:** `hcd-mi-ma-s08-wiring`  **Date:** 2026-04-22

AC-F1-5 mandates that every field in the `hcd_evidence` record has either
(a) a named AC that populates a non-null value from a specific input, or
(b) an AC that tests the field is None in a specified scenario. Fields
lacking any consumer AC are blockers on the cycle landing. This audit
verifies the mapping.

## Field → producer → consumer

| Field | Producer (AC + code site) | Consumer (AC + test/code) |
|---|---|---|
| `background_rate` | AC-F1-1 / `build_hcd_evidence` @ `hcd_evidence.py:290` (reads `mean_incidence_pct / 100.0`) | AC-F9-2 `test_hcd_s08_wiring_end_to_end.py::test_every_hcd_evidence_has_required_keys`; AC-F10-3 MissState trigger |
| `background_n_animals` | AC-F1-1 / `build_hcd_evidence` @ `hcd_evidence.py:299` | AC-F4-4 reliability-gate thresholds (100, 500); `test_hcd_evidence.py::test_beta_adjunct_withheld_below_reliability_threshold` |
| `background_n_studies` | AC-F1-1 / `build_hcd_evidence` @ `hcd_evidence.py:300` | AC-F1-5 audit presence only; surfaced in F10 pane as "N=Z" source citation |
| `source` | AC-F1-1 / `build_hcd_evidence` @ `hcd_evidence.py:301` | AC-F10-1 chip tooltip; AC-F1-6 appended `[drift_unknown]` suffix when drift_flag is None |
| `year_range` | AC-F1-1 / `build_hcd_evidence` @ `hcd_evidence.py:307` | AC-F10-1 pane footer "source, N, years" |
| `match_tier` | AC-F1-2 / `query_mi_incidence` returns 1/2/3; tier-4 disabled | `test_hcd_s08_wiring_end_to_end.py`; AC-F2-4 tier cap depends on `match_tier == 3` |
| `match_confidence` | AC-F1-2 / `query_mi_incidence` returns high/medium/low | F10 pane row "match tier (confidence)" |
| `percentile_of_observed` | AC-F1-3 / `_percentile_of_observed` @ `hcd_evidence.py:213` | AC-F2-4/2-8 below-5th / above-95th rule branches in `_compute_contribution_components`; AC-F1-3 withheld when cell-N < 100 |
| `fisher_p_vs_hcd` | AC-F4-1 / `compute_fisher_p` binomial or Fisher | AC-F4-2/4-4 F10 pane "vs HCD" row + withheld string |
| `drift_flag` | AC-F1-6 / `compute_drift_flag` w/ None-path | `test_hcd_evidence.py::test_drift_flag_null_when_study_year_missing`; F10 pane "reference predates study by >10y" row |
| `confidence_contribution` | AC-F2-3 / `_apply_tier_cap` sum | AC-F2-1 / `compute_clinical_confidence` adds to score when hcd_evidence is supplied |
| `contribution_components` | AC-F2-3 always-complete dict @ `_empty_components` | AC-F2-10 INV-1 validator; F10 pane "γ contribution breakdown (audit)" |
| `alpha_applies` | AC-F5-2 / `_apply_alpha_cell_scaling` sets True on α gate pass | `test_alpha_cell_scaling.py::test_alpha_fires_on_c14_high_background` |
| `reason` | AC-F5-2 populated when alpha_applies | `test_alpha_cell_scaling.py::test_alpha_fires_on_c14_high_background` asserts exact format |
| `alpha_scaled_threshold` | AC-F5-2 populated when alpha_applies | `test_alpha_cell_scaling.py`; F10 pane |
| `noael_floor_applied` | F3 AC-F3-1 set by `apply_clinical_layer` when clinical_class in {Sentinel, HighConcern} | `test_hcd_s08_wiring_end_to_end.py::test_noael_floor_applied_agrees_with_clinical_class` |
| `cell_n_below_reliability_threshold` | AC-F1-3 set True when `n_animals < 100` | AC-F1-3 withholds percentile; AC-F4-4 withholds β-adjunct |

## Schema invariants

| Invariant | Enforced by | Test |
|---|---|---|
| INV-1 gt_95th ≠ 0 AND gt_99th ≠ 0 forbidden | `validate_hcd_evidence` @ `hcd_evidence.py:421` | `test_hcd_evidence.py::test_inv1_validator_rejects_gt95_and_gt99_cofire` |
| INV-2 tier_cap_applied iff raw∉[-1,+1] AND tier==3 | `validate_hcd_evidence` @ `hcd_evidence.py:434` | `test_hcd_evidence.py::test_combined_negative_capped_on_tier_3`, `test_two_sided_tier_cap_positive_max` |
| INV-3 raw_total excludes tier_cap_applied bool | `_apply_tier_cap` + validator | `test_hcd_evidence.py::test_inv3_arithmetic_excludes_tier_cap_bool` |
| INV-4 below_5th + hcd_discordant may co-fire | `_compute_contribution_components` + validator | `test_hcd_evidence.py::test_combined_negative_uncapped_on_tier_1_or_2` |

## Fields with no consumer

**None.** Every field in the schema has at least one named consumer AC.
