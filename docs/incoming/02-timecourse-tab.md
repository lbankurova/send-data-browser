# Time-Course Tab in Dose-Response View

## What this does

Adds a "Time-course" tab to the Dose-Response evidence panel that shows group mean ± SD over study days for the selected endpoint. Answers the question every toxicologist asks after seeing a signal: "When does the effect appear, and is it progressive or transient?"

Currently the Dose-Response view collapses all timepoints into a single aggregate per dose group. This tab preserves the temporal dimension.

## User workflow

1. User navigates to Dose-Response view (or arrives via cross-view link)
2. User selects an endpoint from the rail (e.g., "ALT" under Hepatic)
3. Evidence tab shows the existing dose-level chart (unchanged)
4. User clicks the **"Time-course"** tab (new, positioned between "Evidence" and "Hypotheses")
5. System fetches per-timepoint group data from `GET /api/studies/{id}/timecourse/{domain}/{test_code}?mode=group`
6. Chart renders: X = study day, Y = value (unit), one line per dose group, faceted by sex (side-by-side M / F panels, same pattern as existing Evidence tab)
7. Error bars show ± 1 SD at each timepoint
8. Significant timepoints (p < 0.05 vs. control at that day) are marked with filled red dots
9. User can read: "ALT was normal at Day 1, elevated at Day 15, still rising at Day 29"
10. Clicking a timepoint dot updates the context panel with that timepoint's statistics (optional — see open questions)

## Data model

### Input

Consumed from `GET /api/studies/{study_id}/timecourse/{domain}/{test_code}?mode=group` (defined in spec 01).

### Frontend hook

```typescript
// hooks/useTimecourse.ts
function useTimecourse(studyId: string, domain: string, testCode: string, options?: {
  sex?: "M" | "F";
  mode?: "group" | "subject";
}) => UseQueryResult<TimecourseResponse>
```

React Query key: `["timecourse", studyId, domain, testCode, sex, mode]`

### TypeScript types

```typescript
// types/timecourse.ts
interface TimecourseResponse {
  test_code: string;
  test_name: string;
  domain: string;
  unit: string;
  timepoints: TimecourseTimepoint[];
}

interface TimecourseTimepoint {
  day: number;
  groups: TimecourseGroup[];
}

interface TimecourseGroup {
  dose_level: number;
  dose_label: string;
  sex: string;
  n: number;
  mean: number;
  sd: number;
  baseline_mean?: number;
  pct_change?: number;
}
```

## UI specification

### Location

New tab in the Dose-Response evidence panel tab bar. Tab order becomes:
1. Evidence (existing — dose-level charts)
2. **Time-course** (new)
3. Hypotheses (existing)
4. Metrics (existing)

### Tab label

"Time-course" — sentence case per design system §5.1. All four labels are nouns per §5.5 (Evidence, Time-course, Hypotheses, Metrics).

### Chart area

Container: `flex-1 overflow-y-auto p-4`

**Y-axis toggle** (top-right of chart area): segmented pill control with 2-3 options:
- "Absolute" (default) — raw values in original units
- "% change" — percent change from baseline
- "% vs control" — percent difference vs concurrent control mean

Pill styling: `rounded-full px-2.5 py-1 text-[11px] font-medium` with active = `bg-foreground text-background`, inactive = `text-muted-foreground hover:bg-accent/50`.

**Chart layout:** `flex gap-4` — one chart per sex, each `flex-1`. Same sex-faceted pattern as existing Evidence tab.

**Per-sex label:** `mb-1 text-center text-[10px] font-medium`, colored by sex (`#3b82f6` M, `#ec4899` F).

**Chart (Recharts `<LineChart>`):**
- Container: `<ResponsiveContainer width="100%" height={300}>`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- X-axis: study day values, tick fontSize 10, label "Study day"
- Y-axis: auto-scaled, tick fontSize 10, label = unit string (e.g., "U/L", "g", "%")
- One `<Line>` per dose group: `type="monotone"`, `strokeWidth={2}`, `connectNulls`, colored by dose group (`getDoseGroupColor(dose_level)`)
- Error bars: `<ErrorBar dataKey="sd">`, width 4, strokeWidth 1, same dose color at reduced opacity
- Dots: default r=4 in dose color. If a timepoint p < 0.05 (vs. control): r=6, fill `#dc2626`
- Tooltip: custom, shows "Day {day} · {dose_label}" + "Mean: {mean} ± {sd}" + "n={n}" + p-value if available

**Chart legend:** Below charts, same position as Evidence tab legend.
- One entry per dose group: colored line swatch + dose label
- Plus: "● Significant (p<0.05)" red dot indicator

**Reference line:** Horizontal dashed line at baseline mean (Day 1 or first timepoint control group mean), `stroke="#9CA3AF" strokeDasharray="8 4"`, label "Baseline" at right edge.

### Empty / loading / error states

| State | Display |
|-------|---------|
| No endpoint selected | "Select an endpoint to view the time-course." centered, `text-xs text-muted-foreground` |
| Loading | Centered `Loader2` animate-spin + "Loading time-course..." |
| Error | Red box: "Time-course data not available for this endpoint." |
| No timepoints (categorical data) | "Time-course is available for continuous endpoints only. This endpoint uses categorical (incidence) data." centered |
| Single timepoint | Show the chart with one point per line (degenerate but not hidden) + note: "Only one timepoint available." |

### Categorical endpoints

Time-course is primarily useful for continuous data (BW, LB). For categorical/incidence data (MI, MA findings), the tab shows an informative message instead of a chart. The "% change" and "% vs control" toggles are hidden for categorical endpoints.

**Exception — CL domain incidence over time:** If the endpoint is from the CL domain and has multiple timepoints with incidence data, render a grouped bar chart instead (counts per day per dose group). This bridges to spec 07 (CL Timecourse View) but at the single-endpoint level.

## Integration points

- **`docs/views/dose-response.md`**: New tab added to evidence panel tab bar. Tab order and state management updates.
- **`docs/systems/data-pipeline.md`**: New on-demand endpoint (spec 01) consumed by this tab.
- **`frontend/src/components/analysis/DoseResponseView.tsx`**: New tab component rendered when `activeTab === "timecourse"`.
- **`frontend/src/lib/severity-colors.ts`**: Reuse `getDoseGroupColor()` for line colors.

## Acceptance criteria

- When user selects ALT in the Dose-Response rail and clicks the Time-course tab, a line chart appears with one line per dose group showing ALT values over study days
- Lines are colored by dose group using the existing dose palette (Control=gray, Low=blue, Mid=amber, High=red)
- Error bars (±1 SD) are visible at each timepoint
- Faceted by sex (M and F side-by-side) using the existing sex color pattern
- Y-axis toggle switches between Absolute / % change / % vs control, and the chart re-renders with appropriate values and Y-axis label
- Categorical endpoints (MI, MA domain) show an informative message instead of a chart
- The tab does not fetch data until clicked (lazy load)
- Switching back to Evidence tab preserves the endpoint selection
- Loading spinner shows while data is fetched; error state shows if endpoint unavailable

## Datagrok notes

In production, the Recharts line chart will be replaced by a native Datagrok Line Chart viewer (`DG.Viewer.lineChart()`). The viewer should be configured per Pattern #4 with the appropriate column mappings. The Y-axis toggle can use Datagrok's column selector or a custom property panel input (Pattern #14).

## Open questions

1. Should clicking a timepoint dot in the chart update the context panel with that timepoint's group statistics? This would add a third selection dimension (endpoint + sex + day). Suggest: defer — the chart tooltip provides sufficient detail for now.
2. Should the Y-axis toggle include "vs. historical control" for studies with historical control data? Suggest: defer to production — requires historical control database.
3. How to handle endpoints measured at different timepoints across sexes (e.g., males sacrificed at Day 29, females at Day 30)? Suggest: plot at actual LBDY values — don't force alignment.
