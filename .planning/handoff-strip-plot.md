# Handoff: Strip Plot for Single-Timepoint Endpoints

## Goal
Replace the time course line chart with a strip/dot plot for endpoints that have too few timepoints (e.g., basophils measured only at terminal sacrifice). The strip plot shows individual animal values by dose group — information not available in any other pane.

## Current State
- `TimeCoursePane.tsx:169` already hides the chart when `data.totalTimepoints < 3`
- The time course API (`useTimeCourseData`) returns group-level aggregates only: `{ day, g, n, nControl }` per dose per sex
- No backend endpoint currently serves per-subject values for a domain+test_code

## What to Build

### 1. Backend: Individual subject values endpoint
- **New route** in `routers/analysis_views.py` or a new router
- **Endpoint:** `GET /api/studies/{study_id}/domain-values/{domain}/{test_code}`
- **Response shape:**
  ```json
  {
    "test_code": "BASO",
    "domain": "LB",
    "unit": "10^9/L",
    "subjects": [
      { "USUBJID": "ABC-001", "sex": "F", "dose_level": 0, "value": 1.2, "day": 29 },
      { "USUBJID": "ABC-002", "sex": "F", "dose_level": 1, "value": 1.5, "day": 29 },
      ...
    ]
  }
  ```
- **Data source:** Read from cached CSV in `backend/cache/{study_id}/` (XPT→CSV cache already exists via `xpt_processor.py`). Filter by LBTESTCD/BWTESTCD/etc. = test_code. Join with DM for sex + dose_level (ARMCD → dose mapping from study metadata).
- **Key files to read:**
  - `backend/services/xpt_processor.py` — `ensure_cached()`, CSV cache pattern
  - `backend/routers/analysis_views.py` — existing route patterns
  - `backend/services/study_discovery.py` — StudyInfo model (has `xpt_dir`, `study_id`)
  - `backend/generator/domain_stats.py` — shows how domain data is read and dose groups are mapped

### 2. Frontend: Hook
- **New file:** `hooks/useSubjectValues.ts`
- Calls the new endpoint, returns typed response
- Use same React Query pattern as other hooks (`staleTime: 5 * 60 * 1000`)

### 3. Frontend: StripPlotChart component
- **New file:** `components/analysis/panes/StripPlotChart.tsx`
- **Layout:** Same as dumbbell charts — F left, M right, shared dose label column
- **Per panel:** SVG with one row per dose group. Each row has individual dots (jittered vertically to avoid overlap). Control group (dose 0) included.
- **Use `useContainerWidth`** hook (just created) for dynamic viewBox width
- **Design rules to follow:**
  - Dose labels: use `DoseLabel` component, `w-[48px]` column
  - Dose group colors: `getDoseGroupColor(doseLevel)` from `severity-colors.ts`
  - Dot size: ~2-3px radius
  - Reference line at control mean (like zero line in dumbbell charts)
  - Sex headers: match `text-center text-[9px] font-medium text-muted-foreground mb-0.5`
  - No always-on color in the dots — use dose group color at rest, interaction-driven highlighting
  - Hover: highlight all dots for a dose group, show tooltip with n, mean, SD
  - X-axis: raw values (not effect size) with unit label

### 4. Frontend: Integration into TimeCoursePane
- **File:** `components/analysis/panes/TimeCoursePane.tsx`
- **Logic:** If `data.totalTimepoints < STRIP_PLOT_THRESHOLD` (suggest 3-4), render `StripPlotChart` instead of `TimeCourseContent`
- Pass `domain`, `test_code`, `doseGroups`, `finding` props
- The CollapsiblePane title could change to "Distribution" or stay "Time course" (ask user)

## Design Decisions to Confirm with User
1. Threshold: at how many timepoints to switch? Current guard is `< 3`. Suggest keeping 3 or raising to 4.
2. Pane title: "Distribution" vs "Time course" when showing strip plot
3. Whether to show group mean marker (horizontal tick) alongside individual dots
4. Whether to overlay box/whisker or just dots

## Files Modified (Summary)
| File | Change |
|------|--------|
| `backend/routers/analysis_views.py` | New endpoint for individual values |
| `frontend/src/hooks/useSubjectValues.ts` | New hook (create) |
| `frontend/src/components/analysis/panes/StripPlotChart.tsx` | New component (create) |
| `frontend/src/components/analysis/panes/TimeCoursePane.tsx` | Conditional render: line chart vs strip plot |

## Session Context
- Commit `508fc69` has the lazy validation + chart resize fixes
- `useContainerWidth` hook is ready at `hooks/useContainerWidth.ts`
- Recovery dumbbell charts now use ResizeObserver pattern — strip plot should follow same pattern
- BUG-11 logged for label overlap (separate issue)
