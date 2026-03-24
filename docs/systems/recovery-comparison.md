# Recovery Comparison System

Last validated: 2026-03-24

## Overview

The recovery comparison system compares terminal (main-arm) sacrifice data with recovery-arm sacrifice data to assess whether treatment-related effects reverse, persist, or progress during the recovery period.

## Backend: `GET /api/studies/{study_id}/recovery-comparison`

**Source:** `backend/routers/temporal.py` — `get_recovery_comparison()`

### Response shape

```json
{
  "available": true,
  "recovery_day": 106,
  "last_dosing_day": 28,
  "recovery_days_available": { "Body Weight": { "F": [35, 42, 49, 57], "M": [35, 42, 49, 57] } },
  "rows": [ /* continuous domain rows — one per endpoint/sex/dose/day */ ],
  "incidence_rows": [ /* incidence domain rows */ ]
}
```

- `last_dosing_day`: Last day of dosing (treatment/recovery boundary). Override via `pattern_overrides.json`.
- `recovery_days_available`: Available recovery-period days per endpoint per sex, for day stepper population. Days filtered to those with concurrent controls and n >= 2 treated subjects.

### Continuous domains (`rows[]`)

Domains processed: all entries in `_DOMAIN_COLS` (BW, LB, OM, FW, BG, EG, VS).

Each row = one (endpoint, sex, dose_level, day) tuple. Multi-day: one row per unique recovery-period day (not just final sacrifice).

| Field | Type | Description |
|-------|------|-------------|
| endpoint_label | string | Human-readable test name |
| test_code | string | SEND test code (e.g., ALB, HR, BW) |
| sex | "F" \| "M" | |
| day | int | Study day this row's stats were computed at |
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
| verdict | string? | Server-computed: "resolved", "improving", "persistent", "worsening", "new_in_recovery", "insufficient_n" |

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
| Insufficient N | recovery_n < MIN_RECOVERY_N (3) | — (guard, no verdict) |
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

### Histopath examination counting

`computeGroupStats()` determines how many subjects were "examined" for a finding using per-subject MI findings presence: a subject with ANY entry in their `findings` dict (including NORMAL) counts as examined. In SEND, NORMAL is recorded for every microscopically examined tissue, so non-empty findings ≡ examined. Subjects with an empty `findings` dict (e.g., satellite/TK animals) are excluded from the denominator.

The backend `get_histopath_subjects` endpoint also sets `ma_examined` per subject (true when the MA domain has a record for that specimen+subject), but this field is not used for the examined count — MI findings are the ground truth for microscopic examination status.

## Frontend rendering

### Center panel (DoseResponseChartPanel)

- **Continuous/MI endpoints:** Left sub-panel has D-R | Recovery tabs (bottom bar). Recovery tab shows `RecoveryDumbbellChart`. Right sub-panel has Effect | Distribution tabs.
- **CL/MA endpoints:** Left sub-panel shows treatment incidence bar chart. Right sub-panel always shows recovery incidence comparison (side-by-side, no tab switching). Empty state "Tissue not examined in recovery arm." when no data. Recovery sacrifice day shown in header.
- Tab bars use canonical pattern: `h-0.5 bg-primary` underline, `text-xs font-medium`, `bg-muted/30` container.

### Distribution (CenterDistribution)

Distribution strip plots moved from context panel to center panel Distribution tab. Uses interleaved sex layout: single SVG with F/M sub-lanes per dose column, sex-colored dots (cyan M / pink F), shared Y-axis. Dynamic height fills container.

### Context panel (RecoveryPane)

Routes by domain: MI/MA → `HistopathRecoveryAllSexes` (useOrganRecovery), continuous → `ContinuousRecoverySection` (useRecoveryComparison → RecoveryDumbbellChart), CL → `IncidenceRecoverySection` (useRecoveryComparison → table).

## Data flow

```
XPT files → temporal.py get_recovery_comparison()
  → _compute_domain_recovery() for each continuous domain (multi-day iteration)
  → compute_incidence_recovery() for CL (incidence_recovery.py)
  → JSON response { rows, incidence_rows, recovery_days_available, last_dosing_day }

Frontend:
  useRecoveryComparison(studyId) → React Query cache
  DoseResponseChartPanel — CL/MA: side-by-side incidence + recovery
  DoseResponseChartPanel — Continuous: D-R/Recovery tabs + Effect/Distribution tabs
  CenterDistribution — interleaved StripPlotChart
  RecoveryPane — context panel evidence + override surface
```
