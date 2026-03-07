# Distribution Pane — Implementation Plan

Remaining fixes for the Distribution pane mode selector and data pipeline.
Address all items in one pass.

## 1. Fix Peak day algorithm

**Current (wrong):** `min(absolute BW)` for highest-dose group — confounded by age.
Returns early timepoints by accident when animals lose weight acutely, fails
entirely for slower-onset effects (reduced gain without absolute loss).

**Correct formula:**

```
t* = argmin_t [ BWmean_high(t) - BWmean_control(t) ]
```

The day where the gap between high-dose group mean and concurrent control mean
is most negative. This is the true "peak effect" — works for both acute weight
loss AND growth suppression without loss.

**File:** `DistributionPane.tsx` — `findPeakEffectDay()`

## 2. Peak mode: show delta from control, not raw BW

For the strip plot in Peak mode, each dot should show the individual animal's
deviation from concurrent control at the peak day:

```
delta_i = BW_i(t*) - BWmean_control(t*)
```

Individual value minus concurrent control mean at that same day. This makes
the distribution meaningful — it shows how far each animal is from the control
group average, not raw body weight (which is dominated by baseline weight and
age).

**Files:** `DistributionPane.tsx` (data transform in `subjects` memo),
`StripPlotChart.tsx` (unit/axis label may need adjustment for delta display)

## 3. Fix module comment

Line 6 says "last value per subject in the main arm" for Terminal — now uses
`terminal_sacrifice_day` value and includes recovery when pooled.

**File:** `DistributionPane.tsx:6`

## 4. Migrate DoseResponseView to useRecoveryPooling

`DoseResponseView.tsx:1139-1140` duplicates recovery pooling logic with inline
`useSessionState` + extra `isInLifeDomain` guard. Should use `useRecoveryPooling`
hook. The `isInLifeDomain` guard may need to become a hook parameter or stay
as a local condition on top of the hook result.

**File:** `DoseResponseView.tsx`

## 5. Add vitest test for findPeakEffectDay

Unit test with mock `TimecourseSubject[]` data covering:
- Acute weight loss + recovery (should find nadir day)
- Growth suppression without loss (should find max gap day)
- Single timepoint / insufficient data (should return null)
- No control group (should return null)

**File:** new test file alongside DistributionPane

## 6. Create system spec for Distribution pane

Document the pane's three modes, data pipeline, filtering logic, and
interaction with `useRecoveryPooling` / `useScheduledOnly`.

**File:** `docs/systems/distribution-pane.md`
