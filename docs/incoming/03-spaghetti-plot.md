# Subject-Level Spaghetti Plot

## What this does

Adds a "Show subjects" toggle to the Time-course tab (spec 02) that overlays individual animal trajectories on the group mean chart. Answers: "Is this group effect driven by one outlier animal, or is it consistent across subjects?"

This distinction changes regulatory interpretation. A significant p-value could mean 10/10 animals shifted modestly (consistent treatment effect — strong evidence) or 1/10 animals has an extreme value (possible outlier — weak evidence). The spaghetti plot makes this visible instantly.

## User workflow

1. User is on the Time-course tab with an endpoint selected (spec 02 baseline)
2. User clicks the **"Show subjects"** toggle (pill button, right side of chart area, next to Y-axis toggle)
3. System fetches subject-level data from `GET /api/studies/{id}/timecourse/{domain}/{test_code}?mode=subject`
4. Individual subject lines overlay the group mean chart:
   - Group mean lines become thicker (strokeWidth 3) with full opacity
   - Subject lines render as thin lines (strokeWidth 1, opacity 0.4) in the same dose-group color
5. Hovering a subject line highlights it (opacity 1.0, strokeWidth 2) and shows a tooltip with USUBJID, sex, dose
6. Clicking a subject line **selects that subject** — the line is highlighted (opacity 1.0, blue outline), and the context panel switches to Subject Profile mode (spec 04)
7. Clicking the same subject line again deselects it (returns to group view)
8. The Y-axis toggle (Absolute / % change / % vs control) applies to subject lines too

## Data model

### Input

Consumed from `GET /api/studies/{study_id}/timecourse/{domain}/{test_code}?mode=subject` (defined in spec 01).

### Frontend hook

Same `useTimecourse` hook from spec 02, called with `mode: "subject"`.

```typescript
// Additional type for subject mode
interface SubjectTimecourse {
  test_code: string;
  test_name: string;
  domain: string;
  unit: string;
  subjects: SubjectTrace[];
}

interface SubjectTrace {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  arm_code: string;
  values: Array<{ day: number; value: number }>;
}
```

## UI specification

### Toggle control

Position: right side of chart header area, inline with Y-axis toggle.

```
[ Absolute | % change | % vs control ]  ·····  [ ] Show subjects
```

Toggle: `rounded-full border px-2.5 py-1 text-[11px] font-medium` — toggled on: `bg-foreground text-background`, off: `text-muted-foreground border-border`.

### Chart overlay rendering

When toggle is ON:

**Group mean lines:** Stay visible but become the visual "spine":
- `strokeWidth: 3`, `opacity: 1.0`, dose-group colored
- Error bars hidden (too cluttered with subject lines visible)

**Subject lines:** One `<Line>` per subject, grouped by dose level:
- `strokeWidth: 1`, `opacity: 0.35`, dose-group colored, `type="monotone"`
- No dots by default (too cluttered) — dots appear only on hover/selection
- Hover: `opacity: 1.0`, `strokeWidth: 2`, show dots at r=3
- Selected: `opacity: 1.0`, `strokeWidth: 2`, `stroke: #3b82f6` (blue-500), dots at r=4

**Performance note:** With 120 subjects × 18 timepoints for BW, this is ~2,160 data points rendered as ~120 lines. Recharts handles this, but:
- Render subject lines as a single `<svg>` group, not 120 separate `<Line>` components
- Consider canvas rendering if performance is poor (Recharts supports `isAnimationActive={false}` to skip animation)

### Tooltip (subject hover)

Custom tooltip on subject line hover:

```
┌─────────────────────────┐
│ PC201708-1001            │
│ Male · 0 mg/kg/day      │
│ Day 29: 38.0 U/L        │
└─────────────────────────┘
```

Styling: `rounded border bg-popover px-2 py-1.5 text-[11px] shadow-sm`

### Subject selection interaction

- Click subject line → sets `selectedSubject` state (USUBJID string)
- Selected subject line: highlighted in blue (`#3b82f6`), full opacity, dots visible
- All other subject lines from same dose group: slightly brighter (opacity 0.5) for context
- Context panel switches to Subject Profile mode (spec 04)
- Click same line again → deselects, context panel returns to endpoint mode
- Escape key → clears subject selection

### Subject count indicator

When toggle is ON, show below the chart legend:

`text-[10px] text-muted-foreground` — "Showing {N} subjects · Click a line to view subject profile"

### Empty / edge states

| State | Display |
|-------|---------|
| Toggle ON, loading subject data | Thin loading bar at top of chart area + existing group chart stays visible |
| Toggle ON, subject data error | Toast or inline message: "Subject-level data not available." Toggle automatically resets to OFF |
| Toggle ON, > 200 subjects | Performance warning below chart: "Showing {N} subjects. Chart may be slow." |
| Categorical endpoint | Toggle disabled (grayed out) with tooltip: "Subject lines available for continuous endpoints only" |

## Integration points

- **Spec 01**: `GET /api/studies/{id}/timecourse/{domain}/{test_code}?mode=subject` — data source
- **Spec 02**: Time-course tab — this feature extends it with the subject overlay
- **Spec 04**: Subject context panel mode — selection target when a subject line is clicked
- **`docs/views/dose-response.md`**: State management update for `selectedSubject`
- **`frontend/src/contexts/ViewSelectionContext.tsx`**: May need a `subject` field in the DoseResponse selection shape

## Acceptance criteria

- When "Show subjects" is toggled ON, individual subject lines appear overlaying the group mean lines for the selected endpoint
- Subject lines are colored by dose group (same palette as group means)
- Subject lines are thin (strokeWidth 1) and semi-transparent (opacity 0.35) at rest
- Hovering a subject line highlights it and shows a tooltip with USUBJID, sex, dose, and current value
- Clicking a subject line selects it (blue highlight) and triggers the context panel subject profile (spec 04)
- The Y-axis toggle (Absolute / % change / % vs control) applies to both group and subject lines
- Group mean error bars are hidden when subjects are visible (declutter)
- Toggle OFF removes subject lines and restores error bars
- Performance is acceptable with 120 subjects × 18 timepoints for BW domain

## Datagrok notes

In production, subject lines can use Datagrok's native Line Chart viewer with `rowSource: "FilteredSelected"` to show subject-level traces. The hover/selection interaction maps to Datagrok's `onCurrentRowChanged` event (Pattern #20). Individual subject highlighting uses the grid's selection model. The context panel subject profile is a Custom Info Panel (Pattern #7) that reacts to the selected row's USUBJID.

## Open questions

1. Should subject lines be visible for ALL dose groups simultaneously, or only for the selected dose group? Recommend: all groups (the color coding distinguishes them), but consider adding a dose group filter if the chart is too busy.
2. How to handle subjects with incomplete data (e.g., early sacrifice at Day 30 in a 90-day study)? Recommend: draw the line to the last available timepoint — the abrupt stop is itself informative (early death/sacrifice).
3. Should we compute and show the group mean line including or excluding the selected subject? Recommend: include (standard presentation). A "leave-one-out" mode is an advanced feature for later.
