# Dose-Response & Clinical Observations Consolidation

## What this does

Absorbs the standalone Clinical Observations view (View 6) into the Dose-Response view (View 2) and merges the time-course tab into the Evidence tab as a toggleable section. This reduces navigation count by one, eliminates a thin single-domain view that doesn't earn its own nav item, and strengthens the Evidence tab's cognitive role as the confirmation/verification mode.

**Three changes in one spec:**
1. Kill the Clinical Observations nav item — CL endpoints already appear in the D-R endpoint rail under the "General" organ group via `dose_response_metrics.json`.
2. Merge the time-course tab into the Evidence tab as a collapsible section below the dose-response chart.
3. Extend the time-course section to support CL temporal data (incidence-over-time), replacing the current "not available for categorical endpoints" message.

**Tabs go from 4 to 3:** Evidence (absorbs time-course) · Hypotheses · Metrics.

---

## User workflow

### Continuous endpoint (e.g., ALT from LB)

1. User selects ALT in the endpoint rail (under "Hepatic" organ group).
2. Evidence tab shows: dose-response line chart + Cohen's d effect size chart + pairwise comparison table.
3. User clicks "Show time-course" toggle below the pairwise table.
4. Time-course section expands inline: sex-faceted line charts showing mean ± SD across study days, with Y-axis mode pills (Absolute / % change / % vs control) and a "Show subjects" toggle for spaghetti overlay.
5. Context panel shows Insights, Tox Assessment, Related views.

### CL endpoint (e.g., ALOPECIA from CL)

1. User selects ALOPECIA in the endpoint rail (under "General" organ group).
2. Evidence tab shows: incidence bar chart (dose groups, sex overlay, stroke-for-significance) + pairwise comparison table.
3. User clicks "Show time-course" toggle.
4. Time-course section expands: sex-faceted bar charts showing finding counts by study day, with "Show subjects" toggle that adds USUBJID tooltips on bar hover.
5. Context panel shows Insights, Tox Assessment, Related views — same panes as any other endpoint.

### Subject drill-down (assessment)

**Subject-level detail is adequately addressed by the consolidated design.** No separate "subject detail" link is needed because:
- Continuous endpoints: spaghetti overlay surfaces individual trajectories; clicking a spaghetti line triggers `onSubjectClick` which can populate context panel with subject profile data.
- CL endpoints: CL temporal API already provides USUBJID arrays per finding per day/dose/sex; these are surfaced as tooltips on bar hover and (optionally) as a subject list in the context panel.
- The Subject Profile panel (FEAT-04) provides full drill-down for any subject ID.

**Open item for production:** A "View subject profile" context-panel link (triggered by spaghetti click or CL subject hover) that opens the Subject Profile panel is a natural extension but not required for the prototype. Mark as P3 enhancement.

---

## Data model

### Existing data sources (no backend changes)

| Source | Endpoint | Grain | Used for |
|--------|----------|-------|----------|
| `dose_response_metrics.json` | `/api/studies/{id}/analysis/dose-response-metrics` | endpoint × dose × sex | Rail population, Evidence chart, pairwise table, Metrics grid. CL already present: 36 rows, 9 endpoints, `data_type: "incidence"`. |
| Temporal group API | `/api/studies/{id}/timecourse/{domain}/{testCode}` | day × dose × sex (mean ± SD) | Time-course charts for continuous endpoints. |
| Temporal subject API | `/api/studies/{id}/timecourse/{domain}/{testCode}/subjects` | day × subject | Spaghetti overlay for continuous endpoints. |
| CL temporal API | `/api/studies/{id}/timecourse/cl?finding={finding}` | day × dose × sex (count + USUBJIDs) | Time-course charts for CL endpoints. |

**Key:** No generator pipeline changes, no new API endpoints. All data already flows. The CL domain produces 36 rows in `dose_response_metrics.json` with `data_type: "incidence"`, `domain: "CL"`, `organ_system: "general"`.

### CL temporal response shape

```typescript
interface CLTimecourseResponse {
  findings: string[];
  categories: string[];
  timecourse: CLTimepoint[];
}
interface CLTimepoint {
  day: number;
  counts: CLGroupCount[];
}
interface CLGroupCount {
  dose_level: number;
  dose_label: string;
  sex: string;
  total_subjects: number;
  findings: Record<string, number>;     // finding → count
  subjects: Record<string, string[]>;   // finding → USUBJIDs
}
```

### Continuous temporal response shape

```typescript
interface TimecourseResponse {
  domain: string;
  test_code: string;
  unit: string;
  timepoints: Array<{
    day: number;
    groups: Array<{
      dose_level: number;
      dose_label: string;
      sex: string;
      n: number;
      mean: number;
      sd: number;
    }>;
  }>;
}
```

---

## UI specification

### Change 1: Tab bar reduction (4 → 3)

**Before:** `["evidence", "timecourse", "hypotheses", "metrics"]`
**After:** `["evidence", "hypotheses", "metrics"]`

Tab bar styling unchanged: `flex shrink-0 items-center gap-0 border-b bg-muted/30`. Active: `border-b-2 border-primary text-foreground`. Inactive: `text-muted-foreground hover:text-foreground`.

### Change 2: Evidence tab — time-course toggle section

The Evidence tab gains a collapsible "Time-course" section below the pairwise comparison table. Both the dose-response chart and time-course charts are visible simultaneously when expanded (Option A — no separate tab, no mode toggle, just vertical stacking).

#### Evidence tab layout (with toggle expanded)

```
+------------------------------------------+
| Endpoint summary header                  |
+--[Evidence tab]--+--[Hypotheses]--+--[Metrics]--+
|                                          |
| ┌─ Dose-response chart ─────────────┐   |
| │  LineChart (continuous)            │   |
| │  BarChart (categorical/CL)        │   |
| └────────────────────────────────────┘   |
|                                          |
| ┌─ Pairwise comparison ─────────────┐   |
| │  Table rows                        │   |
| └────────────────────────────────────┘   |
|                                          |
| ▸ Time-course (toggle)                   |  ← collapsed by default
| ┌─ Time-course charts ──────────────┐   |
| │  (expanded when toggled)           │   |
| └────────────────────────────────────┘   |
+------------------------------------------+
```

#### Time-course toggle control

Position: below the pairwise comparison table (or below the chart area if pairwise is empty), above any other content.

```
+---[flex items-center gap-2 border-t px-4 py-2]---+
| ▸ Time-course                                      |
|   [Absolute] [% change] [% vs ctrl]  [Show subjects] |
+---------------------------------------------------+
```

- Toggle button: `flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer`
  - Chevron: `ChevronRight` (collapsed) / `ChevronDown` (expanded), `h-3 w-3 shrink-0`
  - Label: "Time-course"
  - Collapsed: section below is hidden
  - Expanded: section below renders
- Y-axis mode pills (visible only when expanded): same styling as current time-course tab — `rounded-full px-2.5 py-1 text-[11px] font-medium`, active: `bg-foreground text-background`, inactive: `text-muted-foreground hover:bg-accent/50`
  - Modes: "Absolute", "% change", "% vs control"
  - Only visible for continuous endpoints
- "Show subjects" button (visible only when expanded, continuous only): same toggle button styling as current
- Layout: `flex items-center justify-between` — toggle + mode pills on left, Show subjects on right

**Default state:** Collapsed. Persists within session (expanding stays expanded when switching endpoints).

#### Time-course section — continuous endpoints

When expanded for a continuous endpoint (`data_type === "continuous"`):

Sex-faceted line charts, one per sex present in the data. Each chart:

- Container: `flex-1 min-w-[300px]` inside a `flex gap-4 p-4` wrapper
- Header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` — "{Sex label}" (e.g., "Males", "Females")
- Chart: Recharts `<LineChart>` via `<ResponsiveContainer width="100%" height={220}>`
  - X-axis: study day, tick fontSize 10
  - Y-axis: auto-scaled, label from Y-axis mode, tick fontSize 10
  - Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
  - One `<Line>` per dose level: `type="monotone"`, stroke from dose color palette, `strokeWidth={2}`, `connectNulls`
  - Error bars: `<ErrorBar>` for SD, width 4, strokeWidth 1
  - Baseline reference line (absolute mode only): dashed line at Day 1 control mean, `stroke="#9CA3AF"`, `strokeDasharray="4 4"`
  - Spaghetti overlay (when "Show subjects" active): thin lines (`strokeWidth={0.5}`, `opacity={0.3}`) per subject, dose-colored. Clickable via `onSubjectClick(usubjid)`.

**Dose colors (from §12.3 in CLAUDE.md):**

| Dose | Color | Usage |
|------|-------|-------|
| Control (0) | `#1976D2` | Line stroke, dot fill, spaghetti trace |
| Low (1) | `#66BB6A` | Line stroke, dot fill, spaghetti trace |
| Mid (2) | `#FFA726` | Line stroke, dot fill, spaghetti trace |
| High (3) | `#EF5350` | Line stroke, dot fill, spaghetti trace |

Chart legend: below chart, centered. `mt-1 flex items-center justify-center gap-3 text-[10px] text-muted-foreground`. Dose-colored squares (`h-2.5 w-2.5 rounded-sm`) per dose group.

#### Time-course section — CL / categorical endpoints

When expanded for a CL endpoint (`domain === "CL"`):

Data source: `useClinicalObservations(studyId, finding)` where `finding` is the selected `endpoint_label`.

Sex-faceted bar charts, one per sex. Each chart shows finding count by study day, grouped by dose.

- Container: `flex-1 min-w-[300px]` inside a `flex gap-4 p-4` wrapper
- Header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` — "{Sex label}"
- Chart: Recharts `<BarChart>` via `<ResponsiveContainer width="100%" height={220}>`
  - X-axis: study day (from CL temporal `timecourse[].day`), tick fontSize 10
  - Y-axis: count (subjects with finding), tick fontSize 10
  - Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
  - One `<Bar>` per dose level: dose-colored fill, `radius={[2, 2, 0, 0]}`
  - Tooltip: shows count + total subjects + incidence percentage per dose group
  - Bar hover: reveals USUBJID list from `subjects[finding]` array in tooltip

**No Y-axis mode pills** for CL endpoints (counts are absolute — % change is not meaningful for incidence).

**"Show subjects" toggle for CL:** When active, bar tooltip expands to show full USUBJID list. Alternative: append a compact subject table below the charts listing (day, dose, sex, USUBJIDs). Implementation note: start with tooltip approach; if data density warrants it, add the table in a follow-up.

#### Time-course section — other categorical (non-CL) endpoints

For categorical endpoints from non-CL domains (e.g., MI findings), time-course is not available (no temporal API for these). Show:

```
text-xs text-muted-foreground text-center py-6
"Time-course data is not available for {domain} categorical endpoints."
```

### Change 3: Kill Clinical Observations nav item

Remove:
- Route `/studies/:studyId/clinical-observations` from `App.tsx`
- Browsing tree entry "Clinical observations" from `BrowsingTree.tsx`
- Component files: `ClinicalObservationsView.tsx`, `ClinicalObservationsViewWrapper` (if separate)
- Hook file: `useClinicalObservations.ts` — **KEEP** (reused by D-R time-course for CL endpoints)
- Context panel CL section in `ContextPanel.tsx` — remove the inline `ClinicalObsContextPanelWrapper`
- Analysis definitions entry in `analysis-definitions.ts`

CL endpoints are already in the D-R endpoint rail under the "General" organ group. The context panel for CL endpoints uses the same `DoseResponseContextPanel` — no special CL pane needed.

### Change 4: Endpoint rail — CL presentation

CL endpoints already appear in the "General" organ group from `dose_response_metrics.json`. No rail changes needed. The `data_type: "incidence"` flag in the data drives the Evidence tab to render a bar chart instead of a line chart. The `domain: "CL"` flag drives the time-course section to use the CL temporal API instead of the continuous temporal API.

**Rail item rendering for CL:** Same as any incidence endpoint:
- Row 1: endpoint name + direction arrow (if trend is monotonic)
- Row 2: pattern badge (neutral gray) + trend p + no effect size (null for incidence)

### Change 5: Context panel for CL endpoints

CL endpoints selected in the D-R rail use `DoseResponseContextPanel` like any other endpoint. The existing context panel panes apply:

| Pane | CL behavior |
|------|-------------|
| Insights | Rules filtered by `organ_system === "general"` + `context_key` starting with `CL_`. Shows R01/R04/R10 findings for the CL domain. |
| Tox Assessment | ToxFindingForm keyed by endpoint label — works identically. |
| Related views | Links to Target Organs (general), Histopathology, NOAEL. |

No new context panel panes, no inline CL-specific panel.

---

## Datagrok viewer mapping

For production migration to the Datagrok platform, each chart type in this view maps to a specific DG viewer. This section provides full design specs for each.

### DG.LineChart — continuous dose-response + time-course

**Used for:**
- Evidence tab: dose-response curve (mean ± SD by dose level)
- Time-course section: mean ± SD by study day

**Viewer properties:**
```javascript
const chart = DG.Viewer.fromType('Line chart', df, {
  xColumnName: 'dose_label',      // or 'day' for time-course
  yColumnNames: ['mean_M', 'mean_F'],
  // Multi-series grouping via split column
  splitColumnName: 'sex',          // produces one line per sex
  innerChartMarginTop: 10,
  innerChartMarginBottom: 30,
  showErrorBars: true,
  errorColumnName: 'sd',
  markerType: 'circle',
});
```

**Color mapping:**
- Sex-colored series: M → `#3b82f6` (blue-500), F → `#ec4899` (pink-500)
- For time-course: dose-colored series → Control `#1976D2`, Low `#66BB6A`, Mid `#FFA726`, High `#EF5350`
- Apply via `chart.setOptions({ colorColumnName: 'dose_level' })` with custom color coding

**Significance encoding:**
- Significant dots (p < 0.05): larger marker size + dark stroke ring `#374151`
- Non-significant: smaller marker, sex/dose-colored fill
- Achieved via `chart.onEvent('d4-before-draw-scene')` callback to modify marker properties

**Axes:**
- X-axis labels: fontSize 10, dose label (first part before comma) or day number
- Y-axis: auto-scaled, unit label, fontSize 10
- Grid: light gray dashed lines `#e5e7eb`

**Interaction:**
- Hover: tooltip with (dose/day, mean, SD, n, p-value)
- Click: selects data point, updates ViewSelectionContext
- Linked selection: row selection in DG.Grid highlights corresponding point

### DG.BarChart — categorical evidence + CL time-course

**Used for:**
- Evidence tab: incidence bar chart (dose × sex for categorical endpoints)
- CL time-course: finding counts by study day

**Viewer properties:**
```javascript
const chart = DG.Viewer.fromType('Bar chart', df, {
  splitColumnName: 'sex',
  valueColumnName: 'incidence',     // or 'count' for CL
  categoryColumnName: 'dose_label', // or 'day' for CL time-course
  valueAggrType: 'avg',
  barSortType: 'by category',
  barSortOrder: 'asc',
});
```

**Color mapping:**
- Sex-faceted bars: M → `#3b82f6`, F → `#ec4899`
- Dose-grouped CL bars: dose palette (Control, Low, Mid, High)
- Significance stroke: p < 0.05 bars get `stroke: "#1F2937"`, `strokeWidth: 1.5` — preserves sex/dose color identity

**Axes:**
- X-axis: dose labels or study days
- Y-axis: 0–1 for incidence, 0–max for counts
- Grid: dashed lines `#e5e7eb`

**Interaction:**
- Hover tooltip: incidence %, count/total, p-value; for CL adds USUBJID list
- Click: selects dose group, updates selection

### DG.BarChart (horizontal) — effect size

**Used for:** Cohen's d effect size chart in Evidence tab (right panel).

**Viewer properties:**
```javascript
const chart = DG.Viewer.fromType('Bar chart', df, {
  valueColumnName: 'effect_size',
  categoryColumnName: 'dose_label',
  splitColumnName: 'sex',
  orientation: 'horizontal',
});
```

**Reference lines:** Dashed lines at d = ±0.5, ±0.8 (Cohen's thresholds), `stroke: "#9CA3AF"`, `strokeDasharray: "4 4"`.

**Color mapping:** Sex-colored bars, opacity 0.8.

### DG.Grid — pairwise table + metrics table

**Used for:**
- Pairwise comparison table (below chart in Evidence tab)
- Metrics table (Metrics tab, full dataset with filters)

**Grid properties:**
```javascript
const grid = DG.Viewer.fromType('Grid', df, {
  showRowHeader: false,
  showColumnGridlines: false,
  allowEdit: false,
  allowRowSelection: true,
});
```

**Column formatting (via `grid.onCellPrepare`):**
- P-value columns: interaction-driven evidence color in pairwise table (neutral at rest, `#DC2626` on row hover). Always-on color in metrics table via `getPValueColor()`.
- Effect size columns: same pattern — `getEffectSizeColor()` in metrics table.
- Domain column: colored text via `getDomainBadgeColor(domain).text`, `fontSize: 9`, `fontWeight: 600`.
- Dose column: plain `font-mono`, no color (signal-not-meaning rule).
- Mean/SD/N: `font-mono`, right-aligned, 2 decimal places.

**Interaction:**
- Row click: selects endpoint, syncs with rail and charts
- Row hover: interaction-driven evidence color on `ev`-class cells
- Column resize: enabled via `grid.columns[col].width = newWidth`
- Column sort: click header to cycle (none → asc → desc)

### DG.TrellisPlot — faceted views (open item)

**Status: open item for production.** Users may prefer trellis plots for comparing multiple endpoints or dose groups simultaneously.

**Potential uses:**
- Small-multiple dose-response curves (one panel per endpoint within an organ group)
- Small-multiple time-course charts (one panel per sex or per dose)
- Small-multiple CL finding timelines (one panel per finding)

**Viewer properties (reference):**
```javascript
const trellis = DG.Viewer.fromType('Trellis plot', df, {
  xColumnNames: ['dose_label'],
  yColumnNames: ['mean'],
  splitByColumnName: 'endpoint_label',
  innerViewerType: 'Line chart',
  innerViewerLookAndFeel: { showXAxis: true, showYAxis: true },
});
```

**Decision:** Use line charts for this prototype version. Mark trellis as an open item — determine in production user testing whether faceted views add value for the typical 5-15 endpoints per organ group.

### DG.ScatterPlot — Pareto front (Hypotheses tab)

**Used for:** Pareto front viewer in Hypotheses tab (biological magnitude × statistical significance).

**Color mapping:** Organ system via deterministic hue-from-hash: `hsl(hash(organ) % 360, 55%, 55%)`. Override table for common organs (hepatic, renal, cardiovascular, hematologic) for aesthetic defaults. See design decision in `dose-response.md` § "organ system colors in Pareto scatter".

---

## Integration points

### Systems touched

| System doc | What changes |
|------------|--------------|
| `docs/systems/navigation-and-layout.md` | Remove CL route, update route table, update browsing tree entry list |
| `docs/systems/data-pipeline.md` | No changes — CL already flows through generator |

### Views touched

| View doc | What changes |
|----------|--------------|
| `docs/views/dose-response.md` | Major update: add time-course toggle section to Evidence tab spec, remove time-course tab from tab bar, add CL endpoint rendering, add DG viewer mapping section |
| `docs/views/clinical-observations.md` | This file does not exist (CL was built without a spec). No deletion needed. |

### Frontend files

| File | Action | What changes |
|------|--------|--------------|
| `components/analysis/DoseResponseView.tsx` | **Modify** | Remove `TimecourseTabContent` as a separate tab. Inline time-course charts into Evidence tab as toggleable section below pairwise table. Add CL temporal data rendering branch (bar charts for `domain === "CL"`). Update tab bar from 4→3 tabs. |
| `components/analysis/ClinicalObservationsView.tsx` | **Delete** | Full file removal — 622 lines. |
| `components/analysis/ClinicalObservationsViewWrapper.tsx` | **Delete** (if exists separately) | Check if wrapper exists as standalone file. |
| `components/panels/ContextPanel.tsx` | **Modify** | Remove `ClinicalObsContextPanelWrapper` inline component (~85 lines). Remove route detection for `/clinical-observations`. |
| `components/tree/BrowsingTree.tsx` | **Modify** | Remove "clinical-observations" entry from analysis views and icon map. |
| `App.tsx` | **Modify** | Remove `/studies/:studyId/clinical-observations` route. |
| `hooks/useClinicalObservations.ts` | **Keep** | Reused by D-R time-course section for CL endpoints. |
| `hooks/useTimecourse.ts` | **Keep** | Already used by D-R for continuous time-course. |
| `types/timecourse.ts` | **Keep** | Types for both temporal APIs. |
| `lib/analysis-definitions.ts` | **Modify** | Remove `clinical-observations` entry from `ANALYSIS_VIEWS`. |

### Backend files

No backend changes required. All data is already in place.

---

## Acceptance criteria

**Tab consolidation:**
- [ ] Tab bar shows exactly 3 tabs: Evidence, Hypotheses, Metrics
- [ ] No "Time-course" tab exists

**Time-course toggle (continuous):**
- [ ] When a continuous endpoint is selected, a "Time-course" toggle appears below the pairwise table in the Evidence tab
- [ ] Toggle is collapsed by default
- [ ] When expanded, sex-faceted line charts appear showing mean ± SD across study days
- [ ] Y-axis mode pills (Absolute / % change / % vs control) are visible and functional
- [ ] "Show subjects" toggle enables spaghetti overlay with individual subject trajectories
- [ ] Clicking a spaghetti line triggers `onSubjectClick` callback

**Time-course toggle (CL):**
- [ ] When a CL domain endpoint is selected (e.g., ALOPECIA), the Evidence tab shows an incidence bar chart
- [ ] "Time-course" toggle appears and when expanded shows sex-faceted bar charts with finding counts by study day
- [ ] Bar hover tooltip shows count, total subjects, incidence %, and USUBJID list
- [ ] Y-axis mode pills are hidden for CL endpoints (counts are absolute)

**CL in endpoint rail:**
- [ ] CL endpoints appear in the "General" organ group in the endpoint rail
- [ ] CL endpoints show pattern badge, trend p-value (no effect size — null for incidence)
- [ ] Selecting a CL endpoint updates the Evidence tab with categorical rendering

**Clinical Observations view removal:**
- [ ] Route `/studies/:studyId/clinical-observations` no longer exists
- [ ] Browsing tree does not show "Clinical observations" entry
- [ ] `ClinicalObservationsView.tsx` is deleted
- [ ] Context panel does not contain `ClinicalObsContextPanelWrapper`

**Context panel for CL:**
- [ ] CL endpoints use `DoseResponseContextPanel` (same as any other endpoint)
- [ ] Insights pane filters rules by `organ_system === "general"` and `CL_` context_key prefix
- [ ] Tox Assessment pane renders ToxFindingForm for CL endpoints

---

## Datagrok notes

See "Datagrok viewer mapping" section above for full DG viewer specs with properties, color mappings, and interaction patterns.

**Key DG patterns referenced:**
- Pattern #23: `grid.onCellPrepare()` for conditional cell formatting (p-value colors, evidence encoding)
- Pattern #12: `Viewer.fromType()` for chart instantiation with property bags
- Pattern #15: Linked selection between Grid and chart viewers via `dataFrame.selection`
- Trellis support: native `DG.TrellisPlot` with `innerViewerType` — deferred to production user testing

**Line charts for prototype, trellis as open item.** The current Recharts implementation uses line charts for continuous dose-response and time-course. In Datagrok, these map to `DG.LineChart`. Trellis plots (`DG.TrellisPlot`) are an alternative that may be preferred by users for comparing multiple endpoints simultaneously — determine in production whether to expose as a viewer-type switcher or default.

---

## Open questions

1. **CL endpoint ordering in rail.** Currently all CL endpoints land in the "General" organ group alongside BW (body weight) endpoints. Should CL endpoints sort to the bottom of the group (lower signal scores typical for sparse clinical observations), or should they be distinguished with a subtle `CL` domain indicator? Current behavior: sorted by `max_signal_score` descending like all other endpoints — this is probably correct since high-signal CL findings should surface.

2. **CL time-course day granularity.** The CL temporal API returns data per study day. For studies with very frequent observations (daily CL for 90+ days), this could produce dense charts. Should the time-course section support binning (weekly summary)? **Recommendation:** Defer — PointCross has sparse CL data. Address if real-world studies surface the issue.

3. **Trellis vs line charts.** Deferred to production user testing. Mark as open item in the DG viewer mapping section. Users may prefer small-multiple panels for comparing 5+ endpoints within an organ group. The data shape supports either — the choice is purely a viewer presentation decision.
