# Recovery Comparison System

Last validated: 2026-03-10

## Overview

The recovery comparison system compares terminal (main-arm) sacrifice data with recovery-arm sacrifice data to assess whether treatment-related effects reverse, persist, or progress during the recovery period.

## Backend: `GET /api/studies/{study_id}/recovery-comparison`

**Source:** `backend/routers/temporal.py` — `get_recovery_comparison()`

### Response shape

```json
{
  "available": true,
  "recovery_day": 106,
  "rows": [ /* continuous domain rows */ ],
  "incidence_rows": [ /* incidence domain rows */ ]
}
```

### Continuous domains (`rows[]`)

Domains processed: all entries in `_DOMAIN_COLS` (BW, LB, OM, FW, BG, EG, VS).

Each row = one (endpoint, sex, dose_level) tuple. Fields:

| Field | Type | Description |
|-------|------|-------------|
| endpoint_label | string | Human-readable test name |
| test_code | string | SEND test code (e.g., ALB, HR, BW) |
| sex | "F" \| "M" | |
| dose_level | int | 1-based dose group index |
| recovery_day | int | Study day of recovery sacrifice |
| mean | float | Recovery-arm treated group mean |
| sd | float | Recovery-arm treated group SD |
| p_value | float? | Welch t-test: recovery treated vs recovery control |
| effect_size | float? | Hedges' g at recovery |
| terminal_effect | float? | Hedges' g at terminal sacrifice (main arm) |
| terminal_day | int? | Study day of terminal sacrifice |
| peak_effect | float? | Max \|g\| across all main-arm timepoints |
| peak_day | int? | Study day when peak effect occurred |
| control_mean | float? | Recovery-arm control mean |
| control_n | int? | Recovery-arm control sample size |
| treated_n | int? | Recovery-arm treated sample size |
| treated_mean_terminal | float? | Main-arm treated mean at terminal |
| control_mean_terminal | float? | Main-arm control mean at terminal |
| insufficient_n | bool? | True when treated n < 2 |
| no_concurrent_control | bool? | True when no concurrent recovery control |
| pct_diff_terminal | float? | % diff from control at terminal |
| pct_diff_recovery | float? | % diff from control at recovery |
| ci_lower, ci_upper | float? | 95% CI of mean difference at recovery |
| ci_lower_terminal, ci_upper_terminal | float? | 95% CI at terminal |

### Incidence domains (`incidence_rows[]`)

Domains processed: CL (clinical observations). Uses `CLSTRESC` (standardized finding) to match `unified_findings` grouping.

Each row = one (finding, sex, dose_level) tuple. Control (dose_level=0) excluded.

| Field | Type | Description |
|-------|------|-------------|
| domain | string | Domain code (e.g., "CL") |
| finding | string | Uppercased finding name from CLSTRESC |
| sex | "F" \| "M" | |
| dose_level | int | 1-based dose group index |
| dose_label | string | Raw dose group label |
| main_affected | int | Subjects with finding in main arm |
| main_n | int | Total subjects in main arm at this dose/sex |
| recovery_affected | int | Subjects with finding in recovery arm |
| recovery_n | int | Total subjects in recovery arm at this dose/sex |
| recovery_day | int? | Study day of recovery sacrifice |
| verdict | string? | Server-computed: "resolved", "improving", "persistent", "worsening", "new_in_recovery" |

## Frontend: RecoveryPane

**Source:** `frontend/src/components/analysis/panes/RecoveryPane.tsx`

Routing logic in `RecoveryPane` component:

1. **MI/MA domains** (histopath) → `HistopathRecoveryAllSexes` using `useOrganRecovery` hook (per-subject organ-level data)
2. **Continuous domains** (LB, BW, OM, VS, FW, EG, BG) → `ContinuousRecoverySection` using `useRecoveryComparison` hook → `RecoveryDumbbellChart`
3. **Incidence domains** (CL, etc.) → `IncidenceRecoverySection` using `useRecoveryComparison` → table with Terminal/Recovery incidence + verdict

### Incidence verdicts (server-side)

Computed in `_compute_incidence_recovery()` from incidence ratios:

| Verdict | Condition | Color |
|---------|-----------|-------|
| Resolved | recovery incidence = 0 | emerald-700 |
| Improving | recovery < terminal | emerald-600 |
| Persistent | recovery == terminal (both > 0) | amber-700 |
| Worsening | recovery > terminal (both > 0) | red-700 |
| New in recovery | recovery > 0, terminal = 0 | red-700 |

### Continuous verdict confidence (Fix 5, M-1)

`classifyContinuousRecovery()` returns a `confidence` field when n values are provided:

| confidence | Condition | Visual |
|------------|-----------|--------|
| adequate | treated_n >= 5 AND control_n >= 5 | Normal connector line |
| low | either arm n < 5 | Dashed connector line, "* " suffix on verdict label, tooltip shows "(low N, n=X)" |

With n=2, Hedges' g has a 95% CI of roughly g +/- 2.0. The verdict label makes this uncertainty visible without requiring reviewers to interpret CIs.

### Histopath examination heuristic (Fix 4, M-3)

`computeGroupStats()` determines how many subjects were "examined" for a finding:

| Data available | Method | Source |
|----------------|--------|--------|
| MA domain present | Count subjects with MA records for specimen | `ma_examined` field from backend |
| MA domain absent | If any subject in group has any finding → all examined | Original heuristic (fallback) |

The backend `get_histopath_subjects` endpoint sets `ma_examined: true` per subject when the MA domain contains a record for that specimen+subject. This handles the case where all animals were examined but none had findings (all normal) — previously misclassified as `not_examined`.

## Data flow

```
XPT files → temporal.py get_recovery_comparison()
  → _compute_domain_recovery() for each continuous domain
  → _compute_incidence_recovery() for CL
  → JSON response { rows, incidence_rows }

Frontend:
  useRecoveryComparison(studyId) → React Query cache
  RecoveryPane routes by domain/data_type → appropriate section component
```
