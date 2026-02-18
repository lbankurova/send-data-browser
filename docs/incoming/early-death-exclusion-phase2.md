# Early Death Exclusion — Phase 2 Deferred Items

**Parent feature:** Early death exclusion (dual-pass terminal stats)
**Phase 1 commit:** `feat: early death exclusion — dual-pass terminal stats with frontend toggle`
**Status:** Deferred — implement when the relevant view is next touched

---

## 1. Scatter Plot Early-Death Markers

**View:** FindingsQuadrantScatter (FindingsView)
**Priority:** Low — visual enhancement only

Mark early-death-affected endpoints in the scatter plot with a distinct symbol (e.g., hollow circle or cross overlay) so users can see at a glance which data points have exclusions applied. When the toggle is off (all animals), the markers disappear.

**Files:** `FindingsQuadrantScatter.tsx`
**Depends on:** `ScheduledOnlyContext` (already available)

---

## 2. Context Panel Scheduled Stats Display

**View:** FindingsContextPanel → FindingDetailPane
**Priority:** Medium — the context panel currently shows base stats in the statistics table

When scheduled-only mode is active, the context panel's statistics tab should display the scheduled stats (or both side-by-side). Currently `build_finding_context` in `context_panes.py` only uses base stats.

**Files:** `backend/services/analysis/context_panes.py`, `frontend/src/components/analysis/panes/FindingDetailPane.tsx`
**Depends on:** `scheduled_*` fields on findings (already in data)

---

## 3. Dose-Response View Integration

**View:** DoseResponseView
**Priority:** Low — DoseResponseView reads from `dose_response_metrics.json` which doesn't carry scheduled fields yet

Propagate `scheduled_*` into `build_dose_response_metrics()` in `view_dataframes.py` and wire the toggle into DoseResponseView. Currently only FindingsView has the toggle.

**Files:** `backend/generator/view_dataframes.py` (build_dose_response_metrics), DoseResponseView frontend
**Depends on:** `ScheduledOnlyProvider` (need to add to DoseResponseView)

---

## 4. Histopathology View Integration

**View:** HistopathologyView
**Priority:** Medium — histopath is MI domain (terminal), directly affected by exclusions

The lesion severity summary and histopath-specific views should respect the scheduled-only toggle. This requires propagating `scheduled_*` into `build_lesion_severity_summary()` and wiring the toggle into HistopathologyView.

**Files:** `backend/generator/view_dataframes.py` (build_lesion_severity_summary), HistopathologyView frontend
**Depends on:** `ScheduledOnlyProvider`

---

## 5. NOAEL View — Explicit Scheduled-Only Derivation

**View:** NoaelDecisionView
**Priority:** Medium — NOAEL is the key decision; showing the scheduled-only derivation adds transparency

Currently `build_noael_summary()` uses base findings for NOAEL derivation. Add a parallel `scheduled_noael_*` derivation that uses only `scheduled_pairwise` for the adverse-at-dose calculation. Show both NOAEL values (all-animals vs scheduled-only) in the NOAEL view when they differ.

**Files:** `backend/generator/view_dataframes.py` (build_noael_summary), NoaelDecisionView frontend

---

## 6. Backend Python Tests

**Priority:** Medium — current coverage is frontend-only

Add pytest tests for:
- `get_early_death_subjects()` returns correct subjects for PointCross
- Terminal domain findings change N counts when subjects excluded
- Longitudinal domain findings (BW) unchanged when excluded_subjects passed
- LB terminal-timepoint-only exclusion logic
- `scheduled_*` fields present in generated JSON

**Files:** `backend/tests/test_early_death.py` (new)

---

## 7. Per-Sex Exclusion Counts

**Priority:** Low — refinement

Currently `n_excluded` is the total count of early-death subjects across both sexes. A future refinement could show per-sex exclusion counts (e.g., "1 male excluded from dose 3") since the exclusion impact varies by dose group and sex.

**Depends on:** Per-dose-group exclusion tracking in the backend
