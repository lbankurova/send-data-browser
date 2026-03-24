# Distribution Pane

> **Note:** Distribution has moved from the context panel to the center panel `Distribution` tab (see `CenterDistribution.tsx`). The old `DistributionPane.tsx` is dead code. `StripPlotChart` now supports an `interleaved` mode for the center panel layout.

Center panel tab showing individual subject values as vertical strip/dot plots for continuous endpoints.

## Visibility

Only renders when:
- `data_type === "continuous"`
- `domain` is in allowlist: BW, LB, FW, BG, EG, VS

## Modes

### Terminal (default)
Value at `terminal_sacrifice_day` for each subject. Includes recovery subjects when recovery pooling is set to "pool". Subjects without data at the terminal day are excluded (deaths, missing measurements).

### Peak (BW only)
Delta from concurrent control at the day of maximum treatment effect.

**Peak day algorithm:** `t* = argmin_t [ BWmean_high(t) − BWmean_control(t) ]` — the day where the gap between the highest-dose group mean and concurrent control mean is most negative. Works for both acute weight loss and growth suppression without absolute loss.

**Per-subject value:** `delta_i = BW_i(t*) − BWmean_control(t*)` — individual value minus control mean at peak day. Unit displayed as `Δ {unit}`.

Returns null (mode hidden) when fewer than 2 shared timepoints exist between control and high-dose groups.

### Recovery
Last recorded value for each subject in the recovery arm. Only available when study has recovery arms AND recovery subjects exist in data.

## Data Pipeline

1. `useTimecourseSubject` fetches per-subject timecourse data (includes recovery when `includeRecovery` is true)
2. `useRecoveryPooling` provides canonical pooling decision (shared with TimeCoursePane)
3. `useScheduledOnly` provides mortality exclusion set (shared with FindingsView, TimeCoursePane)
4. `shouldIncludeSubject` callback applies recovery-arm filtering + mortality exclusion
5. `subjects` memo transforms raw data into `{ usubjid, sex, dose_level, dose_label, value }[]` based on active mode

## Strip Plot (StripPlotChart)

Vertical dot plot with one SVG panel per sex (F left, M right per sex ordering rule). Layout uses `ResizeObserver` for responsive column widths.

**Visual elements:**
- Individual dots (jittered horizontally within dose column)
- Mean tick mark (horizontal line)
- Box/whisker overlay when group n > 15 (Q1/median/Q3 box, 1.5×IQR whiskers)

**Interaction:**
- Hover dose column → highlight group, tooltip (n, mean, SD)
- Click dose label → select dose, enable per-dot hover
- Hover dot (when dose selected) → tooltip (USUBJID, value)
- Click dot → open subject profile panel (with scroll-back on return)

## Key Files

- `frontend/src/components/analysis/panes/DistributionPane.tsx` — mode logic, data transform, `findPeakEffectDay`
- `frontend/src/components/analysis/panes/StripPlotChart.tsx` — SVG rendering, interaction
- `frontend/src/hooks/useRecoveryPooling.ts` — canonical recovery-pooling decision
- `frontend/tests/peak-effect-day.test.ts` — unit tests for peak algorithm
