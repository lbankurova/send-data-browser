# Dose-Response View

**Route:** `/studies/:studyId/dose-response`
**Component:** `DoseResponseView.tsx` (wrapped by `DoseResponseViewWrapper.tsx`)
**Scientific question:** "How does the finding change across dose levels?"
**Role:** Quantitative dose-response analysis. Shows trends, statistical comparisons, and pattern characterization for each endpoint, organized by organ system.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  Dose-Response View        | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself is a two-panel layout with a resizable rail:

```
+--[300px*]-+-+--------[flex-1]--------+
|            |R|                        |
| Endpoint   |e| Evidence Panel         |
| Rail       |s| (summary header +     |
| (organ-    |i|  tabs: evidence /      |
| grouped)   |z|  metrics / hypotheses)    |
+------------+-+------------------------+
             ^ PanelResizeHandle (4px)
* default 300px, resizable 180-500px via useResizePanel
```

The rail width is controlled by `useResizePanel(300, 180, 500)` -- default 300px, draggable between 180px and 500px. A `PanelResizeHandle` (4px vertical drag strip) sits between the rail and evidence panel.

Responsive: `max-[1200px]:flex-col` -- rail collapses to a 180px horizontal strip with `max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b`. The resize handle is hidden at narrow widths (`max-[1200px]:hidden`).

---

## Endpoint Rail (Left, resizable 300px default)

Container: `shrink-0 flex-col` with `style={{ width: railWidth }}` where `railWidth` comes from `useResizePanel(300, 180, 500)`. Border-right via parent. On narrow viewports: `max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b`.

### Rail Header

`shrink-0 border-b px-2 py-1.5`

**Top row:** `mb-0.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Left: "Endpoints ({N})" where N is the total number of unique endpoints.
- Right: `CollapseAllButtons` component with expand-all / collapse-all buttons for organ groups.

**Subtitle:** `mb-1.5 text-[10px] text-muted-foreground/60` -- "by signal strength"

**Search input:** Inline flex layout with Search icon (consistent with all view rails).
- Container: `flex items-center gap-1.5`
- Icon: `Search h-3 w-3 shrink-0 text-muted-foreground`
- Input: `w-full bg-transparent py-1 text-xs focus:outline-none`, placeholder "Search endpoints..."
- Filters by `endpoint_label` or `organ_system` (case-insensitive substring match)

**Bookmark filter toggle:** Conditionally rendered when `bookmarkCount > 0`. A pill button:
- `mt-1.5 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors`
- Active: `border-amber-300 bg-amber-100 text-amber-800`
- Inactive: `border-border text-muted-foreground hover:bg-accent/50`
- Content: `Star` icon (h-2.5 w-2.5, filled when active), bookmark count in `font-mono`, "bookmarked"
- Click toggles `bookmarkFilter` state, which filters rail to only bookmarked endpoints

### Rail Body

`flex-1 overflow-y-auto`

Organ groups sorted by `max_signal_score` descending. When `bookmarkFilter` is active, groups are filtered to only contain bookmarked endpoints.

**Empty state:** "No endpoints match your search." -- `p-3 text-center text-xs text-muted-foreground`

### Organ Group Header

`button w-full` -- full-width clickable header for expand/collapse.

`flex w-full items-center gap-1.5 border-b px-3 py-1.5 text-left text-[11px] font-semibold hover:bg-accent/50`

| Element | Rendering |
|---------|-----------|
| Chevron | `ChevronDown` (expanded) or `ChevronRight` (collapsed), `h-3 w-3 shrink-0 text-muted-foreground` |
| Organ name + count | Wrapped in `min-w-0 flex-1` div. Top line: `flex items-center gap-1` with organ name via `titleCase()` in a `truncate` span, and endpoint count in `text-[10px] font-normal text-muted-foreground` |
| Domain labels | Below organ name, `flex gap-1.5`. Each domain rendered as `text-[9px] font-semibold` with color from `getDomainBadgeColor(d).text`. Only shown when `group.domains.length > 0`. |

**Collapsed-with-selection highlight:** If the group contains the selected endpoint but is collapsed, applies `bg-accent/30`.

Click toggles expand/collapse.

### Endpoint Item (within expanded group)

`button w-full border-b border-dashed px-3 py-1.5 text-left transition-colors hover:bg-accent/50`

Selected: `bg-accent`

Carries `data-rail-item=""` and `data-selected` attributes.

**Row 1:** `flex items-center gap-1`
- Endpoint name: `flex-1 truncate text-xs`, `font-semibold` when selected, `font-medium` otherwise. Full name shown as `title` tooltip.
- Bookmark star: `BookmarkStar` component. Toggles bookmark on click via `useToggleBookmark`.
- Direction arrow (right-aligned): `text-xs text-[#9CA3AF]`. Color encodes signal strength, not direction meaning -- arrows are categorical identity, so they stay neutral.

| Direction | Arrow |
|-----------|-------|
| up | `\u2191` |
| down | `\u2193` |
| mixed | `\u2195` |
| null | (none) |

- Sex divergence indicator: Shown when `ep.sex_divergence != null && ep.sex_divergence > 0.5`. Renders the divergent sex letter ("M" or "F") in `text-[10px] font-semibold`, colored `text-[#3B82F6]` for M or `text-[#EC4899]` for F. Title tooltip shows `Sex divergence: |d_M - d_F| = {value} ({sex} has larger effect)`.

**Row 2:** `mt-0.5 flex items-center gap-1.5`
- Pattern badge: first word of the pattern label, `rounded px-1 py-0.5 text-[9px] font-medium leading-tight`. **Neutral gray for all patterns** (`bg-gray-100 text-gray-600`, `text-gray-500` for flat, `text-gray-400` for insufficient). Pattern-specific colors were removed: the pattern text communicates the category; signal strength is encoded by p-value and effect size in the same row.
- Trend p-value: `ev text-[10px] font-mono`, `font-semibold` when `min_trend_p < 0.01` -- "p={value}"
- Max effect size: `ev text-[10px] font-mono`, `font-semibold` when `max_effect_size >= 0.8` -- "|d|={value}" (1 decimal place), shown only when non-null
- Min N: `text-[10px] font-mono text-muted-foreground/60` -- "n={min_n}", shown only when non-null
- Timecourse indicator: `text-[10px] text-muted-foreground/40` -- unicode clock symbol, shown when `ep.has_timecourse` is true, with title "Temporal data available"
- Assessment checkmark: `text-[10px] text-muted-foreground/40` -- checkmark, shown when a ToxFinding annotation exists for the endpoint with `treatmentRelated !== "Not Evaluated"`, with title "Assessment complete"

### Endpoint Item Interaction

- Click: selects the endpoint, switches to "Evidence" tab, updates selection context.
- No toggle-off on re-click from the rail (only metrics table rows toggle).

---

## Evidence Panel (Right, flex-1)

Container: `flex min-w-0 flex-1 flex-col overflow-hidden`

### Endpoint Summary Header

**Sticky:** `sticky top-0 z-10 bg-background`

#### With Endpoint Selected

`shrink-0 border-b px-3 py-1.5`

**Title row:** `flex items-start justify-between gap-2`
- Left: `min-w-0` div with endpoint label (`text-sm font-semibold`) + subtitle on next line
- Right: full pattern badge (`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium` with neutral gray -- same `bg-gray-100 text-gray-600` as rail badges, or pattern-specific gray variant from `PATTERN_BG`)

**Subtitle:** `text-[11px] text-muted-foreground`
- Format: "{domain} &middot; {titleCase(organ_system)}"
- Appends " &middot; Categorical" if `data_type === "categorical"`

**Conclusion text:** `mt-1 text-xs text-foreground/80`
- Generated English sentence from pattern, trend p, effect size, sex info.
- Example: "Monotonic increase across doses, trend p=0.0031, max effect size 2.23. Both sexes affected."

**Compact metrics row:** `mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]`
- Trend p: label in `text-muted-foreground` + value in `font-mono` with conditional coloring (`font-semibold text-[#DC2626]` when p < 0.01, `font-medium` when p < 0.05)
- Min p: label in `text-muted-foreground` + value in `font-mono` with conditional coloring (same thresholds)
- Max |d|: label in `text-muted-foreground` + value in `font-mono` (2 decimal places) with conditional coloring (`font-semibold text-[#DC2626]` when |d| >= 0.8, `font-medium` when |d| >= 0.5), shown only when non-null
- Data: label in `text-muted-foreground` + value (continuous or categorical)
- NOAEL: label in `text-muted-foreground` + NOAEL dose value/unit in `font-mono` plus dose level in `text-muted-foreground/60`. Shown when `noaelSummary` data is available (prefers "Combined" sex, falls back to first entry).
- Assessed: label in `text-muted-foreground` + treatment-relatedness and adversity labels in lowercase. Shown only when ToxFinding annotation exists and `treatmentRelated !== "Not Evaluated"`.

#### No Endpoint Selected State

`shrink-0 border-b px-3 py-1.5`
- Message: "Select an endpoint from the list to view dose-response details." -- `text-xs text-muted-foreground`

### Tab Bar

Uses the shared `ViewTabBar` component.

Three tabs (left to right):
- "Evidence" (default)
- "Hypotheses"
- "Metrics"

**Row count (metrics tab only):** rendered via the `right` prop -- `mr-3 text-[10px] text-muted-foreground` -- "{filtered} of {total} rows"

---

## Evidence Tab

### No Data State

When no endpoint is selected: "Select an endpoint to view chart and overview." -- centered, `flex items-center justify-center p-12 text-xs text-muted-foreground`

### Chart Area

Container: `flex border-b` -- two charts side-by-side with a `PanelResizeHandle` between them.

**Layout:** Combined dose-response chart (left, resizable) + effect size bar chart (right, flex-1). Both sexes overlaid on each chart (not per-sex split). Overlaying sexes makes comparison immediate -- divergence/convergence is visible at a glance. The effect size chart provides magnitude context alongside the main dose-response curve.

**Chart split:** Default 50/50, resizable via pointer drag (20%-80% range). The resize handle uses the shared `PanelResizeHandle` component. Effect size chart only appears when effect data exists.

**Charting library:** All charts use ECharts via the `EChartsWrapper` component. Option objects are built by pure functions from `dose-response-charts.ts`:
- `buildDoseResponseLineOption()` -- continuous data line chart
- `buildIncidenceBarOption()` -- categorical data bar chart
- `buildEffectSizeBarOption()` -- effect size bar chart

#### Continuous Data: Line Chart (ECharts via `buildDoseResponseLineOption`)

- Header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` -- "Mean +/- SD by dose"
- Container: `<EChartsWrapper style={{ width: "100%", height: 220 }}>`
- Grid: `{ left: 44, right: 12, top: 16, bottom: 28 }`
- X-axis: dose labels (first part before comma), category axis, tick fontSize 10
- Y-axis: auto-scaled value axis, tick fontSize 10, dashed grid lines in `#e5e7eb`
- Tooltip: custom HTML formatter, fontSize 11, shows series name and mean value (2 decimal places). Error bar series (ending in " SD") are filtered out.
- Line: `type: "line"`, one series per sex, sex-colored stroke, `width: 2`, `connectNulls: true`, not smoothed
- Error bars: custom series `renderItem` drawing vertical line + top/bottom caps (capW = 4), sex-colored stroke, strokeWidth 1
- Dots: per-point symbol styling via data item `itemStyle`:
  - p < 0.05: symbolSize 10, sex-colored fill, dark border `#374151` (gray-700), borderWidth 2
  - p >= 0.05 or null: symbolSize 6, sex-colored fill, sex-colored border, borderWidth 1
- NOAEL reference line: dashed vertical markLine at the NOAEL dose label position, `#6B7280` color, width 1.5, label "NOAEL" at start position in fontSize 9 fontWeight 600. Only shown when `noaelLabel` is provided.

#### Categorical Data: Bar Chart (ECharts via `buildIncidenceBarOption`)

- Container: `<EChartsWrapper style={{ width: "100%", height: 220 }}>`
- Grid: same `{ left: 44, right: 12, top: 16, bottom: 28 }`
- X-axis: dose labels, category axis, tick fontSize 10
- Y-axis: domain `[0, 1]`, tick fontSize 10, label formatter shows percentage
- Tooltip: custom HTML formatter showing incidence as percentage `{(value * 100).toFixed(0)}%`
- Bar: one series per sex, `barMaxWidth: 30`, `borderRadius: [2, 2, 0, 0]`
  - Fill: sex-colored (`#3b82f6` M, `#ec4899` F). Significant bars (p < 0.05) get a dark border (`borderColor: "#1F2937"`, `borderWidth: 1.5`) rather than red fill -- this preserves sex identity encoding while marking significance via a non-color channel.
- NOAEL reference line: same markLine pattern as the continuous chart.

#### Effect Size Bar Chart (right panel, ECharts via `buildEffectSizeBarOption`)

- Header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` -- "Effect size (Cohen's d)"
- Container: `<EChartsWrapper style={{ width: "100%", height: 220 }}>`
- Reference lines: markLine on first series -- dashed lines at d=0.5 (`#d1d5db`), d=0.8 (`#9ca3af`, labeled "d=0.8"), d=-0.5, d=-0.8 (labeled "d=-0.8")
- Bar: one series per sex, `barMaxWidth: 30`, sex-colored fill, `opacity: 0.8`

#### Chart Legend

Below each chart, centered: `mt-1 flex items-center justify-center gap-3 text-[10px] text-muted-foreground`
- Sex legend: colored squares (`h-2.5 w-2.5 rounded-sm`) per sex
- Significance legend (continuous chart only):
  - Significant dot: `h-2.5 w-2.5 rounded-full border-2 border-gray-700 bg-gray-400` -- labeled "p<0.05"
  - Non-significant dot: `h-2 w-2 rounded-full bg-gray-400` -- labeled "NS"
- Effect size legend (effect chart only): `text-muted-foreground/60` -- "d=0.5, 0.8"

### Sex Colors

| Sex | Color |
|-----|-------|
| M | `#3b82f6` (blue-500) |
| F | `#ec4899` (pink-500) |

### Time-course Toggle Section

**Position:** Below the chart area, ABOVE the pairwise comparison table. Rendered when `selectedEndpoint && selectedSummary` is truthy. Enclosed in a `border-t` div.

**Default state:** **expanded** (`useState(true)`).

**Toggle button:** `flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground`
- Chevron: `ChevronRight` (collapsed) or `ChevronDown` (expanded), `h-3 w-3 shrink-0`
- Label: "Time-course"

**Section header:** `flex items-center justify-between px-3 py-1`
- Left: the toggle button
- Right (when expanded): Y-axis mode pills + "Show subjects" toggle (continuous only)

**Behavior:**
- `expanded` state persists within session (local `useState`, default `true`)
- Data is fetched **only when expanded** (lazy loading via conditional hook arguments)
- Returns null (renders nothing) for non-CL categorical endpoints (`!isContinuous && !isCL`)

| Condition | Rendering |
|-----------|-----------|
| `data_type === "continuous"` | Continuous time-course charts (`TimecourseCharts` component) with Y-axis mode pills and "Show subjects" toggle |
| `domain === "CL"` | CL temporal bar charts via `CLTimecourseCharts` component (see below) |
| Other categorical | Returns null (component not rendered) |

#### Y-Axis Mode Pills (continuous only)

Segmented pill buttons for modes: "Absolute", "% change", "% vs control".

```
rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors
```

| State | Classes |
|-------|---------|
| Active | `bg-foreground text-background` |
| Inactive | `text-muted-foreground hover:bg-accent/50` |

#### Show Subjects Toggle (continuous only)

```
rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors
```

| State | Classes |
|-------|---------|
| Active | `border-foreground bg-foreground text-background` |
| Inactive | `border-border text-muted-foreground hover:bg-accent/50` |

Shows a loading spinner when subject data is being fetched (`subjLoading`).

#### Continuous Time-course Charts (`TimecourseCharts`)

**Layout:** Sex-faceted, side-by-side (`flex gap-2 border-b px-2 py-1.5`), one chart per sex. Each chart in a `flex-1` div.

**Per-sex chart:**
- Header: `mb-0.5 text-center text-[10px] font-medium`, colored by sex (`#3b82f6` M, `#ec4899` F)
- Container: `<EChartsWrapper style={{ width: "100%", height: 240 }}>` using `buildTimecourseLineOption()`
- X-axis: study day (category), with "Study day" axis name
- Y-axis: depends on mode ("Value" or unit for absolute, "% change from baseline" for pct_change, "% vs control" for pct_vs_control)
- Group mean lines: one series per dose level, colored via `getDoseGroupColor()`, `width: 2` (or `width: 3` when subjects shown)
- Error bars: custom renderItem series (same cap pattern as dose-response chart), hidden when subjects are shown
- Subject traces: when "Show subjects" is active, low-opacity (0.3) thin lines per subject, colored by dose group, clickable -- clicking triggers `onSubjectClick(params.seriesName)` via chart onClick handler
- Reference line: baseline (absolute mode) or 0% (pct modes) dashed markLine

**Timecourse legend:** `flex items-center justify-center gap-3 border-b px-2 py-1 text-[10px] text-muted-foreground`
- Dose level lines: `h-0.5 w-3 rounded` colored by dose group color
- Baseline (absolute mode): dashed border swatch

**Subject count indicator:** when subjects are shown, centered text: "Showing {count} subjects -- Click a line to view subject profile"

#### TimecourseTable Component

Below the time-course chart. A compact day-by-dose comparison table.

**Header:** `mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground` -- "Day-by-dose detail"

**Table:** `w-full text-xs`, wrapped in `overflow-x-auto`

**Header row:** `sticky top-0 z-10 bg-background` wrapping `tr` with `border-b bg-muted/50`
- Column headers: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`
- Dose columns: colored by `getDoseGroupColor(dl)`

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| Day | Day | Right | `font-mono`, rowSpan covers all sexes for the same day |
| Sex | Sex | Left | `text-[10px]` |
| {dose levels} | dose label | Right | `font-mono text-[11px]` -- "{value.toFixed(1)} +/-{sd.toFixed(1)} n={n}" |

Values respect the selected Y-axis mode (absolute, % change, % vs control).

#### CL Temporal Bar Charts (`CLTimecourseCharts`)

For CL (Clinical observations) endpoints, time-course data comes from the CL temporal API (`useClinicalObservations` hook).

**Layout:** Side-by-side (`flex gap-2 border-b px-2 py-1.5`), one chart per sex. Each chart in a `flex-1 min-w-[300px]` div.

**Per-sex chart:**
- Header: `mb-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` -- sex label
- Container: `<EChartsWrapper style={{ width: "100%", height: 180 }}>` using `buildCLTimecourseBarOption()`
- X-axis: "Day {n}" labels, category axis
- Y-axis: count (integer), minInterval 1
- Grid: `{ left: 44, right: 12, top: 8, bottom: 40 }`
- Bars: one series per dose level, `barMaxWidth: 16`, colored via `getDoseGroupColor()`, `borderRadius: [2, 2, 0, 0]`
- Tooltip: shows count/total (incidence%), USUBJID list on hover (via custom formatter)

**Dose legend:** Below charts, centered. `flex items-center justify-center gap-3 px-2 py-1 text-[10px] text-muted-foreground`. Colored squares (`h-2.5 w-2.5 rounded-sm`) per dose level with dose label text.

**Data source:** `CLTimecourseResponse` from `/api/studies/{studyId}/timecourse/cl?finding={finding}`. Each timepoint has day, counts array with dose_level, sex, findings Record, subjects Record.

### Pairwise Comparison Table

Below the time-course section, `p-4`.

**Header:** `mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground` -- "Pairwise comparison"

**Table:** `w-full text-xs`, wrapped in `overflow-x-auto`

**Header row:** `sticky top-0 z-10 bg-background` wrapping `tr` with `border-b bg-muted/50`. Header cells: `px-2 py-1.5 font-medium text-muted-foreground`.

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| Dose | Dose | Left | `font-mono text-[11px]` -- plain text, `dose_label.split(",")[0]`. No colored badge. |
| Sex | Sex | Left | Plain text |
| Mean | Mean | Right | `font-mono`, 2 decimal places, em dash if null |
| SD | SD | Right | `font-mono text-muted-foreground`, 2 decimal places, em dash if null |
| N | N | Right | Plain text, em dash if null |
| p-value | p-value | Right | `ev font-mono` -- neutral at rest, `#DC2626` on row hover (interaction-driven evidence). `td` has `data-evidence=""`. Formatted via `formatPValue`. |
| Effect | Effect | Right | `ev font-mono` -- same interaction-driven evidence pattern. Formatted via `formatEffectSize`. |
| Pattern | Pattern | Left | `text-muted-foreground`, underscores replaced with spaces |

**Data rows:** `border-b border-dashed`, cells `px-2 py-1`

Shows all rows for the selected endpoint sorted by `dose_level` ascending, then `sex` ascending.

Hidden when no endpoint is selected (table only renders when `pairwiseRows.length > 0`).

---

## Metrics Table Tab

### Filter Bar

Uses the shared `FilterBar` component. `flex-wrap px-3 py-1`.

Five filter controls:

| Filter | Type | Options | Default |
|--------|------|---------|---------|
| Sex | `FilterSelect` dropdown | All sexes / Male / Female | All sexes |
| Data type | `FilterSelect` dropdown | All data types / Continuous / Categorical | All data types |
| Organ system | `FilterSelect` dropdown | All organs / {unique organ systems, displayed via `titleCase()`} | All organs |
| Significant only | Checkbox | `p < 0.05` label | Unchecked (`sigOnly = false`) |
| Color | Checkbox | "Color" label | Unchecked (`evidenceColor = false`) |

Each checkbox: `flex cursor-pointer items-center gap-1 text-xs text-muted-foreground`, input `h-3 w-3 rounded border-gray-300`.

**Row count:** via `FilterBarCount` component -- "{N} rows"

### Metrics Grid

TanStack React Table, `text-xs`, client-side sorting with column resizing.

Table width is set to `table.getCenterTotalSize()` with `tableLayout: "fixed"` for resize support.

**Column resizing:** Enabled via `enableColumnResizing: true` and `columnResizeMode: "onChange"`. Each header cell has a resize handle `<div>` positioned at `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none`. Active resize: `bg-primary`; hover: `hover:bg-primary/30`.

**Header row:** `sticky top-0 z-10 bg-background` wrapping `tr` with `border-b bg-muted/50`
- Headers: `relative cursor-pointer px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50` with `style={{ width: header.getSize() }}`
- Clickable for sorting (shows triangle arrow: `\u25b2` asc / `\u25bc` desc)
- No default sort applied

**Columns (in order):**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| endpoint_label | Endpoint | Truncated at 25 chars with ellipsis, `title` tooltip for full name |
| domain | Domain | Colored text only: `text-[9px] font-semibold` with `getDomainBadgeColor(domain).text`. No background badge. |
| dose_level | Dose | `font-mono text-[11px]` -- plain text, `dose_label.split(",")[0]`. No colored badge. |
| n | N | Plain text, em dash if null |
| sex | Sex | Plain text |
| mean | Mean | `font-mono`, 2 decimal places, em dash if null |
| sd | SD | `font-mono text-muted-foreground`, 2 decimal places, em dash if null |
| incidence | Incid. | `font-mono`, displayed as percentage `{(value * 100).toFixed(0)}%`, em dash if null |
| p_value | P-value | `ev font-mono` -- when `evidenceColor` is enabled and p < 0.05, applies `text-[#DC2626]`. Formatted via `formatPValue`. `<td>` carries `data-evidence=""`. |
| effect_size | Effect | `ev font-mono` -- when `evidenceColor` is enabled and |d| > 0.8, applies `text-[#DC2626]`. Formatted via `formatEffectSize`. `<td>` carries `data-evidence=""`. |
| trend_p | Trend p | `ev font-mono` -- when `evidenceColor` is enabled and p < 0.05, applies `text-[#DC2626]`. Formatted via `formatPValue`. `<td>` carries `data-evidence=""`. |
| dose_response_pattern | Pattern | `text-muted-foreground`, underscores replaced with spaces |
| data_type | Method | `text-muted-foreground` -- displays "Dunnett" for continuous, "Fisher" for categorical |

**Row interactions:**
- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on `endpoint_label` + `sex`)
- Click: sets selection (`endpoint_label`, `sex`, `domain`, `organ_system`). Click again to deselect (toggle).
- Selection syncs `selectedEndpoint` state so chart/header update.
- Row cells: `px-2 py-1` with `data-evidence=""`

**Row cap:** None -- all rows rendered regardless of count.

**Empty state:** "No rows match the current filters." -- `p-4 text-center text-xs text-muted-foreground`

### Domain Rendering

Domain codes use colored-text-only rendering per the project-wide design rule. Colors come from `getDomainBadgeColor()` in `severity-colors.ts`. No background badges.

### Dose Group Rendering

Dose groups use plain `font-mono` text (dose label). No colored badges -- color in tables encodes signal strength, not categorical identity. Dose group colors are reserved for chart series only.

### P-value Color Scale (text classes)

| Threshold | Class |
|-----------|-------|
| p < 0.001 | `text-red-600 font-semibold` |
| p < 0.01 | `text-red-500 font-medium` |
| p < 0.05 | `text-amber-600 font-medium` |
| p < 0.1 | `text-amber-500` |
| p >= 0.1 | `text-muted-foreground` |

### P-value Formatting

| Range | Format |
|-------|--------|
| p < 0.0001 | "<0.0001" |
| p < 0.001 | 4 decimal places |
| p < 0.01 | 3 decimal places |
| p >= 0.01 | 2 decimal places |
| null | em dash |

### Effect Size Color Scale

| Threshold | Class |
|-----------|-------|
| |d| >= 1.2 | `text-red-600 font-semibold` |
| |d| >= 0.8 | `text-red-500 font-medium` |
| |d| >= 0.5 | `text-amber-600` |
| |d| >= 0.2 | `text-amber-500` |
| |d| < 0.2 | `text-muted-foreground` |

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches `/studies/{studyId}/dose-response`, shows `DoseResponseContextPanel`.

### No Selection State

- Message: "Select an endpoint from the list or chart to view insights and assessment."
- `p-4 text-xs text-muted-foreground`

### With Selection

#### Header

- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Top row: `flex items-center justify-between` with:
  - Endpoint label: `text-sm font-semibold`
  - `CollapseAllButtons` component for expand/collapse all panes
- Subtitle: `mt-1 text-xs text-muted-foreground` -- "{domain} &middot; {titleCase(organ_system)}", optionally " &middot; {sex}" if sex is set in the selection
- `TierCountBadges`: `mt-1.5 text-xs` -- shows tier count badges from `computeTierCounts(endpointRules)`, with clickable tier filtering

#### Pane 1: Insights (default open)

`CollapsiblePane` with `InsightsList` component.

Rules filtered by: `organ_system` match (rules where `r.organ_system === selection.organ_system`) OR endpoint-scope rules where `r.context_key` starts with `{domain}_` prefix. Supports `tierFilter` from TierCountBadges.

Same InsightsList rendering as described in study-summary.md (tier pills, organ groups, synthesized signals, correlation chips, expandable raw rules).

#### Pane 2: Statistics (default open)

`CollapsiblePane` showing a dose-level breakdown TABLE for the selected endpoint.

**Test method label:** `flex items-center justify-between text-[10px]` -- "Test method:" (muted) + "Dunnett" or "Fisher" (depending on `data_type`).

**Dose-level breakdown table:** `w-full text-[10px]` in `overflow-x-auto`

Table header: `border-b text-muted-foreground`, column headers `py-1 font-medium`.

For **continuous** endpoints:

| Column | Header | Cell |
|--------|--------|------|
| Dose | Dose | `font-mono text-[10px]` -- dose label |
| N | N | `font-mono font-semibold` (right-aligned) -- aggregated N across sexes |
| Mean | Mean | `font-mono` (right-aligned) -- 2 decimal places |
| SD | SD | `font-mono text-muted-foreground` (right-aligned) -- 2 decimal places |
| p-value | p-value | `font-mono` (right-aligned) -- via `formatPValue()` |

For **categorical** endpoints:

| Column | Header | Cell |
|--------|--------|------|
| Dose | Dose | `font-mono text-[10px]` -- dose label |
| N | N | `font-mono font-semibold` (right-aligned) -- aggregated N |
| Aff | Aff | `font-mono` (right-aligned) -- affected count |
| Inc% | Inc% | `font-mono` (right-aligned) -- percentage |
| p-value | p-value | `font-mono` (right-aligned) -- via `formatPValue()` |

Data is aggregated by dose level across sexes: N is summed, mean/SD/incidence are averaged, p-value is the minimum across sexes.

Empty state: "No dose-level data for selected endpoint."

Note: The `selectedSignalRow` computation (for key-value signal statistics) is fully commented out in the code. The Statistics pane uses the dose-level breakdown table exclusively.

#### Pane 3: Correlations (default open)

`CollapsiblePane` showing other endpoints in the same organ system, sorted by signal score descending (top 10).

Header text: "Other findings in {titleCase(organ_system)}" in `text-[10px] text-muted-foreground`.

Mini table in `text-[10px] tabular-nums`:
- Endpoint: truncated at 22 chars with tooltip
- Dom: `DomainLabel` component (colored text via `getDomainBadgeColor().text`, `text-[9px] font-semibold`)
- Signal: `font-mono`, 2 decimal places
- p: `font-mono`, formatted via `formatPValue`

Rows are clickable (`cursor-pointer hover:bg-accent/30`) -- navigate to this view with `state: { endpoint_label, organ_system }`.

Empty state: "No other endpoints in this organ system."

#### Pane 4: Tox Assessment

`ToxFindingForm` component keyed by `endpointLabel` (the selected endpoint).
- Treatment related dropdown, adversity dropdown, comment textarea, SAVE button.
- Only rendered when `studyId` is available.

#### Pane 5: Related views (default closed)

Cross-view navigation links in `text-[11px]`:
- "View target organ: {titleCase(organ_system)}" (only if `organ_system` present in selection) -- navigates to `/studies/{studyId}/target-organs` with `state: { organ_system }`
- "View histopathology" -- navigates to `/studies/{studyId}/histopathology` with `state: { organ_system }`
- "View NOAEL decision" -- navigates to `/studies/{studyId}/noael-decision` with `state: { organ_system }`

All links: `block text-primary hover:underline`, arrow suffix (`&#x2192;`).

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected endpoint | Local | `useState<string \| null>` -- tracks which endpoint is active in the rail and evidence panel |
| Active tab | Local | `useState<"evidence" \| "hypotheses" \| "metrics">` -- switches between evidence, metrics, and hypotheses views |
| Rail search | Local | `useState<string>` -- text input for filtering endpoints in the rail |
| Expanded organs | Local | `useState<Set<string>>` -- tracks which organ groups are expanded in the rail |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "dose-response"` tag, propagated via `onSelectionChange` callback |
| Metrics filters | Local | `useState` -- `{ sex, data_type, organ_system }`, each nullable string |
| sigOnly | Local | `useState<boolean>(false)` -- checkbox filter for p < 0.05 rows |
| evidenceColor | Local | `useState<boolean>(false)` -- checkbox to enable always-on color for p-value/effect columns |
| Sorting | Local | `useState<SortingState>` -- TanStack sorting state for metrics table |
| Column sizing | Local | `useState<ColumnSizingState>` -- TanStack column resize state for metrics table |
| Rail width | Local | `useResizePanel(300, 180, 500)` -- resizable rail width (default 300px, range 180-500px) |
| Bookmark filter | Local | `useState<boolean>(false)` -- toggles rail to show only bookmarked endpoints |
| Bookmarks | Server | `useEndpointBookmarks(studyId)` hook |
| Dose-response data | Server | `useDoseResponseMetrics(studyId)` hook (React Query) |
| Rule results | Server | `useRuleResults(studyId)` hook (consumed by Hypotheses tab and context panel) |
| Signal summary | Server | `useStudySignalSummary(studyId)` hook (consumed by Hypotheses tab) |
| NOAEL summary | Server | `useNoaelSummary(studyId)` hook (consumed by summary header and chart NOAEL reference line) |
| ToxFinding annotations | Server | `useAnnotations<ToxFinding>(studyId, "tox-finding")` (consumed by rail checkmarks and header "Assessed" field) |

---

## Derived Data

### EndpointSummary

Computed by `deriveEndpointSummaries()` from raw `DoseResponseRow[]`:

Groups all rows by `endpoint_label`, then for each endpoint extracts:
- `endpoint_label` -- the endpoint name
- `organ_system`, `domain`, `data_type` -- taken from the first row in the group
- `test_code` -- taken from the first row in the group
- `min_p_value` -- minimum `p_value` across all doses and sexes
- `min_trend_p` -- minimum `trend_p` across all doses and sexes
- `max_effect_size` -- maximum absolute `effect_size` across all doses and sexes
- `dose_response_pattern` -- dominant pattern, preferring non-flat/insufficient patterns. If only flat or insufficient data patterns exist, uses the most common.
- `direction` -- `up` (all positive effects), `down` (all negative), `mixed` (both), or `null` (no effect data)
- `sexes` -- sorted list of distinct sexes
- `signal_score` -- computed as `-log10(min_trend_p) + |max_effect_size|`. Used for ranking.
- `min_n` -- minimum `n` across all rows for the endpoint
- `has_timecourse` -- `true` when `data_type === "continuous"` or `domain === "CL"`
- `sex_divergence` -- `|maxEffect_M - maxEffect_F|` when both sexes present, otherwise null
- `divergent_sex` -- `"M"` or `"F"` indicating which sex has the larger max absolute effect size, null when not applicable

Returned sorted by `signal_score` descending.

### OrganGroup

Computed by `deriveOrganGroups()` from `EndpointSummary[]`:

Groups summaries by `organ_system`. Each group has:
- `organ_system` -- the organ system name
- `endpoints` -- the endpoint summaries in that group (already sorted by signal score)
- `max_signal_score` -- the highest signal score among its endpoints
- `domains` -- sorted array of unique domain codes across the group's endpoints

Returned sorted by `max_signal_score` descending.

---

## Data Flow

```
useDoseResponseMetrics(studyId)  --> drData (rows)
         |
    deriveEndpointSummaries()
         |
    endpointSummaries (ranked by signal_score)
         |
    deriveOrganGroups()
         |
    organGroups (for rail)
         |
    [user selects endpoint in rail or metrics table]
         |
    chartData + pairwiseRows (filtered by selectedEndpoint)
         |
    DoseResponseSelection (shared via ViewSelectionContext)
         |
    DoseResponseContextPanel
         /        |        \
    Insights  Statistics  ToxAssessment
                 (dose-level breakdown table)
```

Additional data flows:
- `useEndpointBookmarks(studyId)` --> bookmark state for rail filtering and BookmarkStar rendering
- `useNoaelSummary(studyId)` --> NOAEL reference line on charts + NOAEL info in summary header
- `useAnnotations<ToxFinding>(studyId, "tox-finding")` --> assessment checkmarks in rail + "Assessed" field in header
- `useRuleResults(studyId)` + `useStudySignalSummary(studyId)` --> passed to HypothesesTabContent for Causality tool

---

## Cross-View Navigation

### Incoming

Accepts `location.state` with `{ organ_system?, endpoint_label? }`:
- If `endpoint_label` present: selects that endpoint, expands its organ group
- If `organ_system` only: expands that organ group, selects the first (highest-scoring) endpoint in it
- State is cleared after processing: `window.history.replaceState({}, "")`

### Outgoing

| From | Action | Navigates To |
|------|--------|-------------|
| Context panel > Related views | Click "View target organ" | `/studies/{studyId}/target-organs` with `state: { organ_system }` |
| Context panel > Related views | Click "View histopathology" | `/studies/{studyId}/histopathology` with `state: { organ_system }` |
| Context panel > Related views | Click "View NOAEL decision" | `/studies/{studyId}/noael-decision` with `state: { organ_system }` |

---

## Auto-Selection Behavior

- **On data load** (if no endpoint selected): auto-selects the highest-signal endpoint, expands its organ group, sets selection for context panel.
- **On rail endpoint click:** selects endpoint, switches to "Evidence" tab, updates selection.
- **On metrics table row click:** sets selection with `endpoint_label` + `sex` + `domain` + `organ_system`, syncs `selectedEndpoint`. Click again to deselect (toggle).

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading dose-response data..." |
| Error (no generated data) | Red box with instructions to run generator command: `cd backend && python -m generator.generate {studyId}` |
| No endpoint selected | "Select an endpoint from the list to view dose-response details." in evidence panel header area |
| Rail search no matches | "No endpoints match your search." in rail body |
| Metrics no matches | "No rows match the current filters." below table |

---

## Cognitive Modes: Evidence vs. Hypotheses

The Dose-Response view supports two cognitive modes, reflected in the tab structure:

| Mode | Tab | Purpose | Behavior |
|------|-----|---------|----------|
| **Confirmation** | "Evidence" | Prove the already-computed signal | Constrained, read-only ECharts charts, minimal controls |
| **Hypothesis** | "Hypotheses" | Hypothesize and play with models | Interactive sandbox, no effect on conclusions (exception: Causality) |
| **Audit** | "Metrics" | Verify raw numbers | Sortable/filterable grid of all metrics |

### Hard rule

> The Evidence tab (Evidence) is authoritative and constrained.
> The Hypotheses tab is optional, transient, and cannot change conclusions (exception: Causality persists assessment).
> The Metrics is an audit tool -- it shows raw data, not interpretations.

This separation ensures that toxicologists can trust what they see on Evidence as a faithful representation of precomputed analysis, while having freedom to investigate further on Hypotheses without risk of contaminating the record.

---

## Hypotheses Tab

### Purpose

An opt-in sandbox for hypothesis generation. The toxicologist has already seen the signal on the Evidence tab; now they can investigate dose-response shape, model fits, endpoint trade-offs, correlations, and outliers -- without affecting any conclusions or stored assessments.

### Layout

The tab uses a fixed toolbar bar + scrollable content area:

```
+-----------------------------------------------+
| [Shape] [Pareto] [+]          italic disclaimer|  <-- favorites bar + dropdown (border-b)
+-----------------------------------------------+
|                                                |
|  Scrollable intent content                     |  <-- flex-1 overflow-auto p-4
|  (viewer placeholder / live chart / form)      |
|                                                |
+-----------------------------------------------+
```

### Intent selector (favorites bar + dropdown)

`flex items-center gap-1 border-b bg-muted/20 px-4 py-1.5`

**Favorites bar:** Only pinned/favorite tools are shown as pill buttons. Default favorites: `["shape", "pareto"]`.

Each favorite pill:
```
flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors
```

| State | Classes |
|-------|---------|
| Active | `bg-foreground text-background` |
| Inactive | `text-muted-foreground hover:bg-accent hover:text-foreground` |

Icon: `h-3 w-3` inline before label text.

**Right-click context menu:** Right-clicking a favorite pill opens a context menu (`fixed z-50 min-w-[160px] rounded-md border bg-popover py-1 shadow-lg`) with "Add to favorites" / "Remove from favorites" option using a `Pin` icon.

**"+" dropdown button:** `flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground`, with `Plus` icon (h-3 w-3), title "Browse tools".

**Dropdown panel:** `absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg`
- Search: `border-b px-2 py-1.5`, input with Search icon, placeholder "Search tools..."
- Tool list: `max-h-48 overflow-y-auto py-1`, each tool button shows icon + label + description + pin indicator
- Clicking a tool selects it AND adds it to favorites if not already pinned
- Right-clicking a tool opens the same context menu

**Disclaimer text:** `ml-auto text-[10px] italic text-muted-foreground`
- "Persists assessment" when `intent === "causality"`
- "Does not affect conclusions" for all other intents

### Intents

| Intent | Label | Icon | Available | Description |
|--------|-------|------|-----------|-------------|
| `shape` | Shape | `TrendingUp` | Yes | Interactive dose-response curve |
| `model` | Model fit | `GitBranch` | No | Fit models to dose-response data |
| `pareto` | Pareto front | `ScatterChart` | Yes | Effect size vs. significance trade-offs |
| `correlation` | Correlation | `Link2` | No | Co-movement between endpoints |
| `outliers` | Outliers | `BoxSelect` | No | Distribution and outlier detection |
| `causality` | Causality | `Scale` | Yes | Bradford Hill causal assessment |

Default: `shape` (the most common first question after seeing a signal).

### Viewer placeholder pattern

Each placeholder intent renders a `ViewerPlaceholder` -- a compact container representing where a Datagrok viewer will render in production:

```
h-28 rounded-md border bg-muted/30 flex items-center justify-center
```

Content: icon (`mx-auto mb-1.5 h-6 w-6 text-muted-foreground/25`) + viewer type label (`text-[11px] text-muted-foreground/50`) + optional context line (`font-mono text-[10px] text-muted-foreground/35`).

### Configuration summary pattern

Below the viewer placeholder, a single `rounded-md border bg-card px-2 py-1.5` card shows:

- **Section header:** `text-[10px] font-medium text-muted-foreground` (one per card)
- **ConfigLine entries:** `flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]` with inline key-value pairs. Key: `text-muted-foreground`. Value: `font-mono text-foreground/70`.
- **ProductionNote** (where applicable): `text-[11px] italic text-muted-foreground/60` -- explains what requires the Datagrok backend.

### Intent: Shape

- **Viewer:** ViewerPlaceholder with "DG Line Chart" label and endpoint context
- **Config:** X = dose_group, Y = mean, Split = sex, Error bars = +/-SD, Interpolation = linear, Zoom/Pan = enabled, Brush = enabled
- **Endpoint-aware:** Shows selected endpoint name + organ system in viewer subtitle
- **Description text:** "Same dose-response chart as Evidence, with full interactivity: zoom, pan, brush selection, and per-sex series toggling. No static annotations or significance encoding."

### Intent: Model fit

- **Available:** No (requires Datagrok compute backend)
- **Viewer:** ViewerPlaceholder with "DG Line Chart + fit overlay" label
- **Config:** Available models displayed as bordered pills: Linear, 4PL sigmoid, Emax, Polynomial (2-3). Metrics = R-squared, AIC, residual plot. Backend = scipy.optimize.curve_fit(). State = session-scoped.
- **ProductionNote:** "Requires Datagrok compute backend for scipy curve fitting. Available in production."

### Intent: Pareto (Volcano Scatter)

- **Implementation:** Fully functional interactive ECharts scatter chart via `VolcanoScatter` component
- **Chart:** `<EChartsWrapper style={{ width: "100%", height: 260 }}>` using `buildVolcanoScatterOption()`
- **Axes:** X = |effect size| (Cohen's d), Y = -log10(trend p)
- **Colors:** Organ system colors via deterministic `getOrganColor()` function -- `hsl(hash(organ) % 360, 55%, 50%)` with a golden-angle hash. Cached in `ORGAN_COLORS` object for stability.
- **Reference lines:** markLine on first series -- vertical dashed lines at d=0.5 (`#D1D5DB`) and d=0.8 (`#9CA3AF`); horizontal dashed lines at p=0.05 (`#D1D5DB`) and p=0.01 (`#9CA3AF`). Labels in fontSize 9.
- **Selected endpoint:** symbolSize 14 (vs 8 normal), opacity 1 (vs 0.65), dark border `#1F2937` borderWidth 2
- **Click interaction:** clicking a point calls `onSelectEndpoint(params.name)` to navigate to that endpoint
- **Header:** `text-[10px] text-muted-foreground` -- "{count} endpoints -- click to select" (left) + selected endpoint label in `font-mono font-medium text-foreground` (right)
- **Legend:** `flex flex-wrap gap-x-3 gap-y-1 px-1` with colored dots (`h-2 w-2 rounded-full`) per organ system, label via `titleCase()`
- **Tooltip:** item trigger, shows endpoint name (bold), organ system (muted), |d| and p values in monospace
- **Empty state:** "No endpoints with both effect size and trend p-value." -- `flex h-48 items-center justify-center text-xs text-muted-foreground`
- **Data filter:** only endpoints where `max_effect_size != null && min_trend_p != null && min_trend_p > 0`

### Intent: Correlation

- **Available:** No (requires subject-level cross-endpoint data)
- **Viewer:** ViewerPlaceholder with "DG Scatter Plot" label
- **Config:** X = endpoint A (per subject), Y = endpoint B (per subject), Color = dose_group, Shape = sex, Statistics = Pearson r, Spearman rho, regression line. Data = subject-level.
- **ProductionNote:** "Requires subject-level cross-endpoint data. Available in production via DG DataFrame joining."

### Intent: Outliers

- **Viewer:** ViewerPlaceholder with "DG Box Plot" label and endpoint context
- **Config:** X = dose_group, Y = endpoint value (per subject), Category = sex, Jitter = semi-transparent points, Outlier rule = >1.5 IQR, Tooltip = USUBJID, value, dose, sex. Data = subject-level.
- **Endpoint-aware:** Shows selected endpoint name + sexes in viewer subtitle
- **ProductionNote:** "Requires subject-level values. Available in production via raw domain endpoint."

### Intent: Causality

- **Available:** Yes
- **Icon:** `Scale` (lucide-react) -- the balance/scales icon represents weighing evidence, which is exactly what Bradford Hill criteria do
- **Description:** "Bradford Hill causal assessment"
- **Viewer:** None -- this intent uses a structured form, not a chart placeholder
- **Requires endpoint selection:** Yes -- empty state when no endpoint selected

**Purpose:** Structured causality worksheet using Bradford Hill criteria. Unlike other Hypotheses tools that are ephemeral explorations, the Causality tool captures expert reasoning that supports regulatory conclusions. See "Design decision: Causality persistence exception" below.

#### Layout

When an endpoint is selected, the content area renders as a scrollable form:

```
+--------------------------------------------------+
| Causality: {endpoint_label}                      |  <-- header (text-sm font-semibold)
| {domain colored text} . {organ_system}           |  <-- subtitle (text-xs text-muted-foreground, domain via getDomainBadgeColor().text)
+--------------------------------------------------+
|                                                  |
| COMPUTED EVIDENCE              (section hdr)     |
| +----------------------------------------------+ |
| | Biological gradient  ..... Strong            | |
| | monotonic_increase . trend p < 0.001    [e]  | |
| +----------------------------------------------+ |
| | Strength             ..... Strong            | |
| | |d| = 2.23 . p < 0.001                 [e]  | |
| +----------------------------------------------+ |
| | Consistency          ....  Strong            | |
| | Both sexes affected (M, F)              [e]  | |
| +----------------------------------------------+ |
| | Specificity          .    Weak               | |
| | Signals in 4 organ systems              [e]  | |
| +----------------------------------------------+ |
| | Coherence            ...  Moderate           | |
| | 2 correlated endpoints in organ         [e]  | |
| +----------------------------------------------+ |
|                                                  |
| EXPERT ASSESSMENT              (section hdr)     |
| +----------------------------------------------+ |
| | Temporality                             [?]  | |
| | ..... [select dropdown]  Not assessed        | |
| | "Is the timing of onset..."  (guidance)      | |
| | [  rationale text area                     ] | |
| +----------------------------------------------+ |
| | Biological plausibility                 [?]  | |
| | ..... [select dropdown]  Not assessed        | |
| | "Is there a known biological..."             | |
| | [  rationale text area                     ] | |
| +----------------------------------------------+ |
| | Experiment                              [?]  | |
| | ..... [select dropdown]  Not assessed        | |
| | "Do the controlled study..."                 | |
| | [  rationale text area                     ] | |
| +----------------------------------------------+ |
| | Analogy                                 [?]  | |
| | ..... [select dropdown]  Not assessed        | |
| | "Do similar compounds..."                    | |
| | [  rationale text area                     ] | |
| +----------------------------------------------+ |
|                                                  |
| OVERALL ASSESSMENT                               |
| +----------------------------------------------+ |
| | ( ) Likely causal                            | |
| | ( ) Possibly causal                          | |
| | ( ) Unlikely causal                          | |
| | (*) Not assessed                             | |
| |                                              | |
| | Comment: [______________________________]    | |
| |                                              | |
| | [SAVE]                 User . 2026-02-09     | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

When no endpoint is selected:
```
p-4 text-xs text-muted-foreground: "Select an endpoint to assess causality."
```

#### Criteria cards

Each criterion renders in a card-row inside a bordered container. Shared structure:

**Card row:** `px-3 py-2.5`, `border-b` except for the last item

**Label + dot gauge row:** `flex items-center justify-between`
- Label: `text-xs font-medium` (sentence case -- "Biological gradient", not "Biological Gradient")
- Right side: `flex items-center gap-2` with optional `(overridden)` badge, dot gauge, strength label, and override toggle
- Strength label: `w-20 text-right text-[10px] font-medium text-muted-foreground`

**Evidence line (computed criteria only):** `mt-0.5 text-[10px] text-muted-foreground`
- Shows the data values that produced the score
- All text is neutral `text-muted-foreground` -- no color on p-values or effect sizes

#### Dot gauge

5-dot scale using filled/empty circles. All dots are **neutral gray** -- no color coding.

```tsx
// Filled: bg-foreground/70   Empty: bg-foreground/15
function DotGauge({ level }: { level: 0 | 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          i <= level ? "bg-foreground/70" : "bg-foreground/15"
        )} />
      ))}
    </span>
  );
}
```

**Mapping to strength labels:**
| Level | Dots | Label |
|-------|------|-------|
| 0 | ..... | Not assessed |
| 1 | X.... | Weak |
| 2 | XX... | Weak-moderate |
| 3 | XXX.. | Moderate |
| 4 | XXXX. | Strong |
| 5 | XXXXX | Very strong |

#### Auto-population logic (computed evidence section)

These criteria are scored automatically from existing data. No user input needed. The computed score is shown as the dot gauge. If the user disagrees, they can override (see "Override" below).

| Criterion | Data source | Score mapping |
|-----------|-------------|--------------|
| **Biological gradient** | `endpointSummary.dose_response_pattern` + `endpointSummary.min_trend_p` | `monotonic_increase`/`monotonic_decrease` -> 4 (Strong); `threshold` -> 3 (Moderate); `non_monotonic` -> 2 (Weak-moderate); `flat`/`no_pattern` -> 1 (Weak). Bonus +1 if `min_trend_p < 0.01`. |
| **Strength of association** | `endpointSummary.max_effect_size` | `|d| >= 1.2` -> 5 (Very strong); `|d| >= 0.8` -> 4 (Strong); `|d| >= 0.5` -> 3 (Moderate); `|d| >= 0.2` -> 2 (Weak-moderate); `|d| < 0.2` -> 1 (Weak) |
| **Consistency** | `endpointSummary.sexes` | Both M and F -> 4 (Strong); one sex only -> 2 (Weak-moderate) |
| **Specificity** | Count distinct `organ_system` values in `signalSummary` matching this `endpoint_label` where `signal_score > 0` | 1 organ -> 4 (Strong); 2 organs -> 3 (Moderate); 3 organs -> 2 (Weak-moderate); 4+ -> 1 (Weak) |
| **Coherence** | Count R16 rules from `ruleResults` where `organ_system` matches | 3+ correlations -> 4 (Strong); 1-2 -> 3 (Moderate); 0 -> 1 (Weak) |

**Evidence line text examples:**
- Biological gradient: `"monotonic increase . trend p < 0.001"`
- Strength: `"|d| = 2.23 . p < 0.001"`
- Consistency: `"Both sexes affected (M, F)"`
- Specificity: `"Signals in 1 organ system (Hepatic)"`
- Coherence: `"3 correlated endpoints in Hepatic (R16 rules)"`

#### Override mechanism

Each auto-populated criterion has a small override toggle. When clicked:
- An inline editor appears in a `mt-2 space-y-1.5 rounded border bg-muted/20 p-2` container
- A dropdown select with strength options + a "Clear" button
- A justification text area (`w-full rounded border px-2 py-1.5 text-xs`, 2 rows, placeholder "Reason for override...")
- The card shows a subtle `(overridden)` badge in `text-[9px] text-amber-600`
- Override values persist via annotations alongside expert-input values

Toggle: `Edit2` (pencil) icon, `h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground`, positioned in the right side of the label row.

#### Expert assessment section

Four criteria that require toxicologist judgment. Each card has:

1. **Label + help toggle**: `flex items-center gap-1` -- label in `text-xs font-medium` + `HelpCircle` icon (`h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground`) for guidance toggle
2. **Dot gauge + dropdown**: `mt-1 flex items-center gap-2` -- DotGauge + `<select>` dropdown (rounded border bg-background px-1.5 py-0.5 text-xs) + strength label (`text-[10px] font-medium text-muted-foreground`)
3. **Guidance text** (collapsible, toggled via HelpCircle): `mt-0.5 text-[10px] italic text-muted-foreground`
4. **Rationale text area**: `mt-1 w-full rounded border px-2 py-1.5 text-xs`, 2 rows, placeholder "Notes..."

Guidance text (collapsible via HelpCircle icon next to label):
| Criterion | Guidance |
|-----------|----------|
| Temporality | "Is the timing of onset consistent with treatment exposure? Consider recovery group data if available." |
| Biological plausibility | "Is there a known biological mechanism? Reference published literature or compound class effects." |
| Experiment | "Do the controlled study conditions support a causal interpretation? Consider study design adequacy." |
| Analogy | "Do similar compounds in the same class produce similar effects?" |

#### Overall assessment section

Bordered container (`rounded-md border px-3 py-2.5`) with radio buttons and comment field.

**Radio group:**
- `flex flex-col gap-1.5`
- Each option: `flex cursor-pointer items-center gap-2 text-xs`
- Radio input: standard HTML radio, `accent-primary`
- Options: "Likely causal", "Possibly causal", "Unlikely causal", "Not assessed"
- Default: "Not assessed"
- No color on the radio labels -- plain text

**Comment field:**
- `mt-2 w-full rounded border px-2 py-1.5 text-xs`, 2 rows
- Placeholder: "Overall assessment notes..."

**Save button + footer:**
- SAVE button: `rounded bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase text-primary-foreground hover:bg-primary/90`, disabled when no changes (`!dirty || saveMutation.isPending`), shows "Saving..." when pending
- Footer: `text-[10px] text-muted-foreground` -- last saved status text
- Layout: `mt-3 flex items-center justify-between`

#### Persistence

- **Schema type:** `causal-assessment`
- **Key format:** `{endpoint_label}` -- one assessment per endpoint per study
- **Stored fields:** `{ overrides: Record<string, { level: number, justification: string }>, expert: Record<string, { level: number, rationale: string }>, overall: string, comment: string }`
- **Hooks:** `useAnnotations<CausalAssessment>(studyId, "causal-assessment")` + `useSaveAnnotation<CausalAssessment>(studyId, "causal-assessment")`
- Auto-populated scores are NOT stored -- they are computed on the fly from endpoint summary and rule results. Only overrides, expert input, and overall assessment are persisted.

#### Data dependencies

The Causality tool uses two data sources fetched at the view level and passed as props:

1. **`useStudySignalSummary(studyId)`** -- needed for specificity calculation (counting organ systems where an endpoint signals).
2. **`useRuleResults(studyId)`** -- needed for coherence calculation (counting R16 rules).

Both are fetched at the view level and passed to `HypothesesTabContent` as props.

#### Design decision: Causality persistence exception

**The problem:** The Hypotheses tab rule says "No model parameters or hypothesis results are persisted."

**The resolution:** The Causality tool is an exception because Bradford Hill assessment is a **regulatory documentation requirement**, not an analytical exploration.

- Shape, Model, Pareto, Correlation, Outliers are **analytical sandboxes** -- the toxicologist explores data patterns. These are ephemeral.
- Causality is a **structured reasoning worksheet** -- it documents WHY the toxicologist concluded something was treatment-related. This has regulatory value (ICH M3(R2), FDA reviewer expects this rationale).

**Updated rule:** "Hypotheses tools must not persist results that change conclusions. The Causality tool persists expert reasoning (Bradford Hill assessment) as an annotation -- it documents the rationale behind conclusions made elsewhere (ToxFinding annotations, NOAEL determination), but does not itself modify those conclusions."

#### Design decision: icon choice (Scale)

**Choice:** `Scale` from lucide-react (balance/scales icon).

**Rationale:**
1. The Bradford Hill framework is literally about *weighing evidence* -- the scales metaphor is exact.
2. It visually distinguishes from the other analytical tools (charts, scatter, link).
3. At 14x14 it reads clearly as a balance/scales.

#### Design decision: organ system colors in Pareto scatter

**Choice:** Deterministic hue-from-hash mapping via `getOrganColor()`.

**Implementation (in code):**
```ts
function getOrganColor(organ: string): string {
  let h = 0;
  for (let i = 0; i < organ.length; i++) h = (h * 31 + organ.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}
```

Results are cached in a module-level `ORGAN_COLORS` Record for performance.

**Rationale:**
1. Organ systems are not fixed -- different studies surface different organ systems. A hash function produces the same hue for the same organ name across sessions and studies.
2. Position is primary in the scatter. Color is a secondary grouping aid.
3. Existing domain badge colors map to domains (LB, BW, MI), not organ systems -- reusing them for organs would be misleading.

### State management

All Hypotheses tab state is session-scoped:
- Selected intent defaults to `shape`, persists during the session
- Favorites list defaults to `["shape", "pareto"]`, persists during the session
- No model parameters or hypothesis results are persisted (exception: Causality tool, see above)
- Hypotheses tab state does not affect context panel content

**Causality tool persistence exception:** The Causality tool persists expert reasoning (Bradford Hill assessment) as an annotation via the `causal-assessment` schema type. The persisted data captures *reasoning rationale*, not *conclusions* -- the actual conclusions (treatment-relatedness, adversity, NOAEL) are stored in ToxFinding annotations and the NOAEL determination.

### What Hypotheses must never do

- Update NOAEL or target organ decisions
- Rewrite text on the Evidence tab
- Store model parameters as authoritative results
- Modify the `DoseResponseSelection` shared via `ViewSelectionContext`
- Override conclusions from the Evidence tab or any other view
- (Causality exception: may persist Bradford Hill reasoning via annotations API, but this documents rationale -- it does not change computed results)

---

## Wrapper Component

`DoseResponseViewWrapper.tsx` wraps `DoseResponseView` and connects it to `ViewSelectionContext`:

- `handleSelectionChange`: forwards selections with `_view: "dose-response"` tag via `setSelection`
- `handleSubjectClick`: forwards subject clicks via `setSelectedSubject` (from time-course subject trace interactions)

---

## Current Issues / Improvement Opportunities

### Rail
- No keyboard navigation between endpoints or organ groups
- Signal score is computed locally (not from generated data) -- may diverge from `study_signal_summary.json` scores
- Organ group headers don't show aggregate statistics (unlike Target Organs rail items which show evidence scores)

### Charts
- Error bars use raw SD, not SEM
- No dose-response curve fitting or trend line overlay
- Categorical bar chart Y-axis always 0-1 even if incidence is low

### Metrics Table
- No row cap -- all rows rendered, could cause performance issues with larger datasets
- No column visibility toggle
- No export option

### Context Panel
- Rule filtering uses `organ_system` match + `domain_` prefix on `context_key` -- may miss some cross-organ rules
- Related views pane is default-closed -- users may not discover navigation links
- No back-link to Study Summary from this view

### General
- No keyboard navigation (arrow keys in grid or between rail items)
- No export option for chart or grid data

---

## Changelog

### 2026-02-11 -- Code-accuracy rewrite

- **Charting library:** Replaced all Recharts references with ECharts/EChartsWrapper pattern. All charts use pure option builders from `dose-response-charts.ts`.
- **Chart heights:** Corrected to 220px for dose-response/effect-size, 240px for timecourse, 180px for CL timecourse (was 260/260/220).
- **Statistics pane:** Replaced key-value signal data description with dose-level breakdown TABLE (Dose, N, Mean/SD or Affected/Incidence%, p-value) plus test method label. Documented `selectedSignalRow` as commented out.
- **Hypotheses tool selector:** Replaced flat segmented pill bar with favorites bar (default: shape + pareto pinned), "+" dropdown with search, right-click context menus for pin/unpin. Documented conditional disclaimer text.
- **Time-course section:** Corrected default to expanded (`useState(true)`), position to ABOVE pairwise table, toggle button styling to `text-[10px] font-semibold uppercase tracking-wider`.
- **CL timecourse:** Corrected layout to side-by-side (`flex gap-2`), chart height to 180px.
- **Significance legend:** Corrected to gray dot with dark border (`border-2 border-gray-700 bg-gray-400`), not red dot.
- **Endpoint bookmarks:** Added documentation for `useEndpointBookmarks`, `useToggleBookmark`, `BookmarkStar`, bookmark filter toggle.
- **NOAEL reference line:** Documented `noaelLabel` param in chart builders and NOAEL markLine rendering.
- **NOAEL summary:** Documented `useNoaelSummary` integration in header.
- **ToxFinding annotations:** Documented assessment checkmarks in rail and "Assessed" field in header.
- **`onSubjectClick` callback:** Documented for time-course chart subject lines and wrapper connection.
- **`TimecourseTable` component:** Documented day-by-dose comparison table below time-course chart.
- **Sex divergence indicator:** Documented on endpoint items (when `sex_divergence > 0.5`).
- **`CollapseAllButtons`:** Documented in both rail header and context panel header.
- **`TierCountBadges`:** Documented in context panel header.
- **Context panel header:** Documented as sticky with `sticky top-0 z-10 bg-background`.
- **Summary header:** Corrected padding to `px-3 py-1.5`, documented sticky positioning, added NOAEL and Assessed fields, removed "Sexes" field.
- **Rail header:** Corrected padding to `px-2 py-1.5`, added CollapseAllButtons, bookmark filter toggle, "by signal strength" subtitle, domain labels.
- **EndpointSummary type:** Added `test_code`, `min_n`, `has_timecourse`, `sex_divergence`, `divergent_sex`.
- **OrganGroup type:** Added `domains: string[]`.
- **Metrics tab filters:** Expanded to 5 filters (added sigOnly checkbox and evidenceColor checkbox). Corrected default data type label to "All data types". Added "Method" column.
- **Metrics header styling:** Corrected to `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`.
- **Metrics column order:** Corrected to: Endpoint, Domain, Dose, N, Sex, Mean, SD, Incid., P-value, Effect, Trend p, Pattern, Method.
- **Volcano/Pareto scatter:** Documented as fully functional interactive ECharts chart. Documented `getOrganColor()` implementation (`hsl(hue, 55%, 50%)`).
- **Related views link color:** Corrected to `text-primary`.

### 2026-02-09 -- Design audit alignment

- **View name:** Renamed from "Dose-response & causality" to "Dose-Response" in browsing tree
- **Chart layout:** Updated spec to document actual combined layout (dose-response + effect size charts with resize handle, both sexes overlaid) instead of per-sex split
- **Pattern badges:** Documented neutral gray as intentional (signal-not-meaning principle)
- **Direction arrows:** Documented neutral gray as intentional (categorical identity, not signal)
- **Dose columns:** Removed colored badge specs from pairwise and metrics tables. Plain `font-mono` text.
- **Domain column:** Updated to colored-text-only (matches project-wide rule)
- **Chart dots:** Significant dots use size + dark stroke ring (`#374151`) to preserve sex color identity.
- **Categorical bars:** Updated to document stroke-for-significance (preserves sex color identity in combined chart)
- **P-value/effect columns:** Both pairwise and metrics tables now use interaction-driven `ev` class.
- **Rail search:** Updated to inline flex pattern (consistent with all view rails)
- **Context panel subtitle:** Updated to `titleCase(organ_system)` (matches code and project convention)
- **Hypotheses tools:** All tools fully interactive regardless of `available` flag.

### 2026-02-09 -- CL consolidation into Dose-Response

- **Tab bar:** Reduced from 4 tabs to 3 tabs. Time-course content moved to collapsible toggle section in Evidence tab.
- **Time-course toggle:** Added above pairwise comparison table. Supports continuous (line chart with spaghetti overlay), CL temporal (bar charts), and returns null for other categorical.
- **CL endpoints:** Clinical observation endpoints now appear in the D-R endpoint rail under "General" organ group. CL-specific time-course uses `CLTimecourseCharts` component with sex-faceted bar charts.
- **Standalone CL view deleted.**
