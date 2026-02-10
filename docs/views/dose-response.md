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

The rail width is controlled by `useResizePanel(300, 180, 500)` — default 300px, draggable between 180px and 500px. A `PanelResizeHandle` (4px vertical drag strip) sits between the rail and evidence panel.

Responsive: `max-[1200px]:flex-col` — rail collapses to a 180px horizontal strip with `max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b`. The resize handle is hidden at narrow widths (`max-[1200px]:hidden`).

---

## Endpoint Rail (Left, resizable 300px default)

Container: `shrink-0 flex-col` with `style={{ width: railWidth }}` where `railWidth` comes from `useResizePanel(300, 180, 500)`. Border-right via parent. On narrow viewports: `max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b`.

### Rail Header

`shrink-0 border-b px-3 py-2`

**Label:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Endpoints ({N})" where N is the total number of unique endpoints.

**Search input:** Inline flex layout with Search icon (consistent with all view rails).
- Icon: `Search h-3 w-3 shrink-0 text-muted-foreground`
- Input: `w-full bg-transparent py-1 text-xs focus:outline-none`, placeholder "Search endpoints..."
- Filters by `endpoint_label` or `organ_system` (case-insensitive substring match)

### Rail Body

`flex-1 overflow-y-auto`

Organ groups sorted by `max_signal_score` descending.

**Empty state:** "No endpoints match your search." — `p-3 text-center text-xs text-muted-foreground`

### Organ Group Header

`button w-full` — full-width clickable header for expand/collapse.

`flex w-full items-center gap-1.5 border-b px-3 py-1.5 text-left text-[11px] font-semibold hover:bg-accent/50`

| Element | Rendering |
|---------|-----------|
| Chevron | `ChevronDown` (expanded) or `ChevronRight` (collapsed), `h-3 w-3 shrink-0 text-muted-foreground` |
| Organ name | `flex-1 truncate`, displayed via `titleCase()` from `severity-colors.ts` |
| Endpoint count | `text-[10px] font-normal text-muted-foreground` — shows the number of endpoints in the group |

**Collapsed-with-selection highlight:** If the group contains the selected endpoint but is collapsed, applies `bg-accent/30`.

Click toggles expand/collapse.

### Endpoint Item (within expanded group)

`button w-full border-b border-dashed px-3 py-1.5 text-left transition-colors hover:bg-accent/50`

Selected: `bg-accent`

**Row 1:** `flex items-center gap-1`
- Endpoint name: `flex-1 truncate text-xs`, `font-semibold` when selected, `font-medium` otherwise. Full name shown as `title` tooltip.
- Direction arrow (right-aligned): `text-xs`, neutral gray (`text-[#9CA3AF]`). Color encodes signal strength, not direction meaning — arrows are categorical identity, so they stay neutral.

| Direction | Arrow |
|-----------|-------|
| up | `↑` |
| down | `↓` |
| mixed | `↕` |
| null | (none) |

**Row 2:** `mt-0.5 flex items-center gap-1.5`
- Pattern badge: first word of the pattern label, `rounded px-1 py-0.5 text-[9px] font-medium leading-tight`. **Neutral gray for all patterns** (`bg-gray-100 text-gray-600`, `text-gray-500` for flat, `text-gray-400` for insufficient). Pattern-specific colors were removed: the pattern text communicates the category; signal strength is encoded by p-value and effect size in the same row. Color for categorical identity (which pattern?) violates the signal-not-meaning principle.
- Trend p-value: `text-[10px] font-mono` with interaction-driven color (neutral at rest, `#DC2626` on hover/selection via `.ev` CSS class) — "p={value}"
- Max effect size: `text-[10px] font-mono` with interaction-driven color — "|d|={value}" (1 decimal place), shown only when non-null

### Endpoint Item Interaction

- Click: selects the endpoint, switches to "Evidence" tab, updates selection context.
- No toggle-off on re-click from the rail (only metrics table rows toggle).

---

## Evidence Panel (Right, flex-1)

Container: `flex min-w-0 flex-1 flex-col overflow-hidden`

### Endpoint Summary Header

`shrink-0 border-b px-4 py-3`

#### With Endpoint Selected

**Title row:** `flex items-start justify-between gap-2`
- Left: endpoint label (`text-sm font-semibold`) + subtitle on next line
- Right: full pattern badge (`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium` with neutral gray — same `bg-gray-100 text-gray-600` as rail badges)

**Subtitle:** `text-[11px] text-muted-foreground`
- Format: "{domain} &middot; {titleCase(organ_system)}"
- Appends " &middot; Categorical" if `data_type === "categorical"`

**Conclusion text:** `mt-1 text-xs text-foreground/80`
- Generated English sentence from pattern, trend p, effect size, sex info.
- Example: "Monotonic increase across doses, trend p=0.0031, max effect size 2.23. Males only."

**Compact metrics row:** `mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]`
- Trend p: label in `text-muted-foreground` + value in `font-mono` with p-value color
- Min p: label in `text-muted-foreground` + value in `font-mono` with p-value color
- Max |d|: label in `text-muted-foreground` + value in `font-mono` with effect size color (2 decimal places), shown only when non-null
- Sexes: label in `text-muted-foreground` + value in `font-mono` (comma-separated)
- Data: label in `text-muted-foreground` + value (continuous or categorical)

#### No Endpoint Selected State

`shrink-0 border-b px-4 py-3`
- Message: "Select an endpoint from the list to view dose-response details." — `text-xs text-muted-foreground`

### Tab Bar

`flex shrink-0 items-center gap-0 border-b bg-muted/30`

Three tabs (left to right):
- "Evidence" (default)
- "Hypotheses"
- "Metrics"

Active tab: `text-foreground` with `<span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />` underline (canonical pattern)
Inactive tab: `text-muted-foreground hover:text-foreground`
Both: `relative px-4 py-1.5 text-xs font-medium transition-colors`

**Row count (metrics tab only):** `ml-auto mr-3 text-[10px] text-muted-foreground` — "{filtered} of {total} rows"

---

## Evidence Tab

### No Data State

When no endpoint is selected: "Select an endpoint to view chart and overview." — centered, `p-12 text-xs text-muted-foreground`

### Chart Area

Container: `flex border-b` — two charts side-by-side with a `PanelResizeHandle` between them.

**Layout:** Combined dose-response chart (left, resizable) + effect size bar chart (right, flex-1). Both sexes overlaid on each chart (not per-sex split). Overlaying sexes makes comparison immediate — divergence/convergence is visible at a glance. The effect size chart provides magnitude context alongside the main dose-response curve.

**Design decision:** Per-sex split charts were considered but rejected. With overlaid sex lines, the user sees sex differences without eye movement. The effect size chart (Cohen's d by dose) adds a dimension that per-sex splitting would not provide.

**Chart split:** Default 50/50, resizable via pointer drag (20%-80% range). The resize handle uses the shared `PanelResizeHandle` component. Effect size chart only appears when effect data exists.

#### Continuous Data: Line Chart (Recharts `<LineChart>`)

- Header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` — "Mean ± SD by dose"
- Container: `<ResponsiveContainer width="100%" height={260}>`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- X-axis: dose labels (first part before comma), tick fontSize 10
- Y-axis: auto-scaled, tick fontSize 10
- Tooltip: `contentStyle={{ fontSize: 11 }}`, shows "Mean ({sex}): {value.toFixed(2)}"
- Line: `type="monotone"`, dataKey="mean_{sex}", sex-colored stroke, `strokeWidth={2}`, `connectNulls`
- Error bars: `<ErrorBar dataKey="sd_{sex}">`, width 4, strokeWidth 1, sex-colored stroke
- Dots: significance-aware custom rendering:
  - p < 0.05: r=5, sex-colored fill, dark stroke ring `#374151` (gray-700), strokeWidth 2
  - p >= 0.05 or null: r=3, sex-colored fill, sex-colored stroke, strokeWidth 1
  - Rationale: size + stroke differentiates significance while preserving sex color identity. Same principle as stroke-for-significance on categorical bars.

#### Categorical Data: Bar Chart (Recharts `<BarChart>`)

- Container: `<ResponsiveContainer width="100%" height={260}>`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- X-axis: dose labels, tick fontSize 10
- Y-axis: domain `[0, 1]`, tick fontSize 10
- Tooltip: shows incidence as percentage `{(value * 100).toFixed(0)}%`
- Bar: dataKey="incidence_{sex}", custom shape with `rx={2}` rounded corners
  - Fill: sex-colored (`#3b82f6` M, `#ec4899` F). Significant bars (p < 0.05) get a dark stroke outline (`stroke="#1F2937"`, `strokeWidth=1.5`) rather than red fill — this preserves sex identity encoding while marking significance via a non-color channel.

#### Effect Size Bar Chart (right panel)

- Header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` — "Effect size (Cohen's d)"
- Container: `<ResponsiveContainer width="100%" height={260}>`
- Reference lines: dashed lines at d=0.5, d=0.8, d=-0.5, d=-0.8 (Cohen's thresholds)
- Bar: dataKey="effect_{sex}", sex-colored fill, opacity 0.8

#### Chart Legend

Below each chart, centered: `mt-1 flex items-center justify-center gap-3 text-[10px] text-muted-foreground`
- Sex legend: colored squares (`h-2.5 w-2.5 rounded-sm`) per sex
- Significance legend (continuous chart only): red dot (`h-2.5 w-2.5 rounded-full bg-red-600`) for p<0.05, gray dot (`h-2 w-2 rounded-full bg-gray-400`) for NS

### Sex Colors

| Sex | Color |
|-----|-------|
| M | `#3b82f6` (blue-500) |
| F | `#ec4899` (pink-500) |

### Pairwise Comparison Table

Below chart area, `p-4`.

**Header:** `mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Pairwise comparison"

**Table:** `w-full text-xs`, wrapped in `overflow-x-auto`

**Header row:** `border-b bg-muted/50`

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| Dose | Dose | Left | `font-mono text-[11px]` — plain text, `dose_label.split(",")[0]`. No colored badge (color encodes signal, not categorical identity). |
| Sex | Sex | Left | Plain text |
| Mean | Mean | Right | `font-mono`, 2 decimal places, em dash if null |
| SD | SD | Right | `font-mono text-muted-foreground`, 2 decimal places, em dash if null |
| N | N | Right | Plain text, em dash if null |
| p-value | p-value | Right | `ev font-mono` — neutral at rest, `#DC2626` on row hover (interaction-driven evidence). `td` has `data-evidence=""`. Formatted via `formatPValue`. |
| Effect | Effect | Right | `ev font-mono` — same interaction-driven evidence pattern. Formatted via `formatEffectSize`. |
| Pattern | Pattern | Left | `text-muted-foreground`, underscores replaced with spaces |

**Data rows:** `border-b border-dashed`, cells `px-2 py-1`

Shows all rows for the selected endpoint sorted by `dose_level` ascending, then `sex` ascending.

Hidden when no endpoint is selected (table only renders when `pairwiseRows.length > 0`).

> **Stub: user-togglable color coding.** In production, Datagrok grids expose color coding via the grid hamburger menu (☰ > Color coding). The prototype pairwise table uses interaction-driven evidence color (neutral at rest, color on hover). A future production feature should add a hamburger icon (☰) at the table header that opens a context menu with a "Color code" toggle. When enabled, cells switch from `ev` class to always-on `getPValueColor()`/`getEffectSizeColor()`. See Datagrok Pattern #23 (`grid.onCellPrepare()`) in `docs/platform/datagrok-patterns.ts:690`. Same applies to the Metrics Table below.

### Time-course Toggle Section

Below the pairwise comparison table, a collapsible toggle section shows time-course data for the selected endpoint. Default state: **collapsed**. This replaces the former standalone Time-course tab (consolidated from 4→3 tabs).

**Toggle button:** `flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer`
- Chevron: `ChevronRight` (collapsed) or `ChevronDown` (expanded), `h-3 w-3`
- Label: "Time-course"

**Behavior:**
- `expanded` state persists within session (local `useState`, default `false`)
- Data is fetched **only when expanded** (lazy loading)
- Renders conditionally based on endpoint `data_type` and `domain`:

| Condition | Rendering |
|-----------|-----------|
| `data_type === "continuous"` | Continuous time-course charts (group mean ± SD over study days, sex-faceted Recharts `LineChart`) with Y-axis mode pills and "Show subjects" toggle |
| `domain === "CL"` | CL temporal bar charts via `CLTimecourseCharts` component (see below) |
| Other categorical | Disabled toggle with explanatory text: "Time-course visualization is not available for this endpoint type." |

#### CL Temporal Bar Charts (`CLTimecourseCharts`)

For CL (Clinical observations) endpoints, time-course data comes from the CL temporal API (`useClinicalObservations` hook).

**Layout:** One Recharts `BarChart` per sex, vertically stacked.

**Per-sex chart:**
- Header: `text-[11px] font-semibold text-muted-foreground` — sex label
- Container: `<ResponsiveContainer width="100%" height={220}>`
- X-axis: study day, tick fontSize 10
- Y-axis: count (integer), tick fontSize 10
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- Bars: one `<Bar>` per dose level, fill from dose group colors (`#1976D2` control, `#66BB6A` low, `#FFA726` mid, `#EF5350` high)
- Tooltip: shows count/total (incidence%), USUBJID list on hover

**Dose legend:** Below charts, centered. Colored squares (`h-2.5 w-2.5 rounded-sm`) per dose level with dose label text.

**Data source:** `CLTimecourseResponse` from `/api/studies/{studyId}/timecourse/cl?finding={finding}`. Each timepoint has day, counts array with dose_level, sex, findings Record, subjects Record.

---

## Metrics Table Tab

### Filter Bar

`flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2`

Three dropdowns, all `rounded border bg-background px-2 py-1 text-xs`:

| Filter | Options | Default |
|--------|---------|---------|
| Sex | All sexes / Male / Female | All sexes |
| Data type | All types / Continuous / Categorical | All types |
| Organ system | All organs / {unique organ systems, displayed via `titleCase()`} | All organs |

**Row count:** `ml-auto text-[10px] text-muted-foreground` — "{N} rows"

### Metrics Grid

TanStack React Table, `text-xs`, client-side sorting with column resizing.

Table width is set to `table.getCenterTotalSize()` with `tableLayout: "fixed"` for resize support.

**Column resizing:** Enabled via `enableColumnResizing: true` and `columnResizeMode: "onChange"`. Each header cell has a resize handle `<div>` positioned at `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize`. Active resize: `bg-primary`; hover: `hover:bg-primary/30`. Cell widths use `header.getSize()` / `cell.column.getSize()`.

**Header row:** `border-b bg-muted/50`
- Headers: `relative cursor-pointer px-2 py-1.5 text-left font-medium hover:bg-accent/50` with `style={{ width: header.getSize() }}`
- Clickable for sorting (shows triangle arrow: `▲` asc / `▼` desc)
- No default sort applied

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| endpoint_label | Endpoint | Truncated at 25 chars with ellipsis, `title` tooltip for full name |
| domain | Domain | Colored text only: `text-[9px] font-semibold` with `getDomainBadgeColor(domain).text`. No background badge. |
| dose_level | Dose | `font-mono text-[11px]` — plain text, `dose_label.split(",")[0]`. No colored badge (color encodes signal, not categorical identity). |
| sex | Sex | Plain text |
| mean | Mean | `font-mono`, 2 decimal places, em dash if null |
| sd | SD | `font-mono text-muted-foreground`, 2 decimal places, em dash if null |
| n | N | Plain text, em dash if null |
| incidence | Incid. | `font-mono`, displayed as percentage `{(value * 100).toFixed(0)}%`, em dash if null |
| p_value | P-value | `ev font-mono` — interaction-driven evidence color (neutral `text-muted-foreground` at rest, `#DC2626` on row hover/selection). Formatted via `formatPValue`. `<td>` carries `data-evidence=""`. |
| effect_size | Effect | `ev font-mono` — interaction-driven evidence color. Formatted via `formatEffectSize`. `<td>` carries `data-evidence=""`. |
| trend_p | Trend p | `ev font-mono` — interaction-driven evidence color. Formatted via `formatPValue`. `<td>` carries `data-evidence=""`. |
| dose_response_pattern | Pattern | `text-muted-foreground`, underscores replaced with spaces |

**Row interactions:**
- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on `endpoint_label` + `sex`)
- Click: sets selection (`endpoint_label`, `sex`, `domain`, `organ_system`). Click again to deselect (toggle).
- Selection syncs `selectedEndpoint` state so chart/header update.
- Row cells: `px-2 py-1`

**Row cap:** None — all rows rendered regardless of count (1342 rows for PointCross).

**Empty state:** "No rows match the current filters." — `p-4 text-center text-xs text-muted-foreground`

### Domain Rendering

Domain codes use colored-text-only rendering per the project-wide design rule (see CLAUDE.md "Domain labels — colored text only"). Colors come from `getDomainBadgeColor()` in `severity-colors.ts`. No background badges.

### Dose Group Rendering

Dose groups use plain `font-mono` text (dose label). No colored badges — color in tables encodes signal strength, not categorical identity. Dose group colors are reserved for chart series only.

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

- `border-b px-4 py-3`
- Endpoint label: `text-sm font-semibold`
- Subtitle: `text-xs text-muted-foreground` — "{domain} &middot; {titleCase(organ_system)}", optionally " &middot; {sex}" if sex is set in the selection

#### Pane 1: Insights (default open)

`CollapsiblePane` with `InsightsList` component.

Rules filtered by: `organ_system` match (rules where `r.organ_system === selection.organ_system`) OR `context_key` starts with `{domain}_` prefix (endpoint-scope rules in the same domain).

Same InsightsList rendering as described in study-summary.md (tier pills, organ groups, synthesized signals, correlation chips, expandable raw rules).

#### Pane 2: Statistics (default open)

`CollapsiblePane` showing signal-level statistics for the selected endpoint. Key-value pairs in `text-[11px] tabular-nums`:
- Signal score: `font-mono`, 3 decimal places
- Direction: plain text or em dash if null
- Severity: plain text
- Treatment-related: "yes" or "no"

Data source: best signal row from `signalData` (highest `signal_score` for the selected endpoint, optionally filtered by sex).

Empty state: "No signal data for selected endpoint."

#### Pane 3: Correlations (default open)

`CollapsiblePane` showing other endpoints in the same organ system, sorted by signal score descending (top 10).

Header text: "Other findings in {titleCase(organ_system)}" in `text-[10px] text-muted-foreground`.

Mini table in `text-[10px] tabular-nums`:
- Endpoint: truncated at 22 chars with tooltip
- Dom: domain colored text via `getDomainBadgeColor().text`, `text-[9px] font-semibold`
- Signal: `font-mono`, 2 decimal places
- p: `font-mono`, formatted via `formatPValue`

Rows are clickable — navigate back to this view with `state: { endpoint_label, organ_system }`.

Empty state: "No other endpoints in this organ system."

#### Pane 4: Tox Assessment (default open)

`ToxFindingForm` component keyed by `endpointLabel` (the selected endpoint).
- Treatment related dropdown, adversity dropdown (grayed when treatment="No"), comment textarea, SAVE button.
- Only rendered when `studyId` is available.

#### Pane 5: Related views (default closed)

Cross-view navigation links in `text-[11px]`:
- "View target organ: {organ_system}" (only if `organ_system` present in selection) — navigates to `/studies/{studyId}/target-organs` with `state: { organ_system }`
- "View histopathology" — navigates to `/studies/{studyId}/histopathology` with `state: { organ_system }`
- "View NOAEL decision" — navigates to `/studies/{studyId}/noael-decision` with `state: { organ_system }`

All links: `block hover:underline`, color `#3a7bd5`, arrow suffix (`&#x2192;`).

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected endpoint | Local | `useState<string \| null>` — tracks which endpoint is active in the rail and evidence panel |
| Active tab | Local | `useState<"evidence" \| "metrics" \| "hypotheses">` — switches between evidence, metrics, and hypotheses views |
| Rail search | Local | `useState<string>` — text input for filtering endpoints in the rail |
| Expanded organs | Local | `useState<Set<string>>` — tracks which organ groups are expanded in the rail |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "dose-response"` tag, propagated via `onSelectionChange` callback |
| Metrics filters | Local | `useState` — `{ sex, data_type, organ_system }`, each nullable string |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state for metrics table |
| Column sizing | Local | `useState<ColumnSizingState>` — TanStack column resize state for metrics table |
| Rail width | Local | `useResizePanel(300, 180, 500)` — resizable rail width (default 300px, range 180-500px) |
| Dose-response data | Server | `useDoseResponseMetrics` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (consumed by context panel) |

---

## Derived Data

### EndpointSummary

Computed by `deriveEndpointSummaries()` from raw `DoseResponseRow[]`:

Groups all rows by `endpoint_label`, then for each endpoint extracts:
- `min_p_value` — minimum `p_value` across all doses and sexes
- `min_trend_p` — minimum `trend_p` across all doses and sexes
- `max_effect_size` — maximum absolute `effect_size` across all doses and sexes
- `dose_response_pattern` — dominant pattern, preferring non-flat/insufficient patterns. If only flat or insufficient data patterns exist, uses the most common.
- `direction` — `up` (all positive effects), `down` (all negative), `mixed` (both), or `null` (no effect data)
- `sexes` — sorted list of distinct sexes
- `signal_score` — computed as `-log10(min_trend_p) + |max_effect_size|`. Used for ranking.
- `organ_system`, `domain`, `data_type` — taken from the first row in the group

Returned sorted by `signal_score` descending.

### OrganGroup

Computed by `deriveOrganGroups()` from `EndpointSummary[]`:

Groups summaries by `organ_system`. Each group has:
- `organ_system` — the organ system name
- `endpoints` — the endpoint summaries in that group (already sorted by signal score)
- `max_signal_score` — the highest signal score among its endpoints

Returned sorted by `max_signal_score` descending.

---

## Data Flow

```
useDoseResponseMetrics(studyId)  ──> drData (1342 rows)
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
         /        \
    Insights   ToxAssessment
```

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
| **Confirmation** | "Evidence" | Prove the already-computed signal | Constrained, read-only charts, minimal controls |
| **Hypothesis** | "Hypotheses" | Hypothesize and play with models | Interactive sandbox, no effect on conclusions |
| **Audit** | "Metrics" | Verify raw numbers | Sortable/filterable grid of all metrics |

### Hard rule

> The Evidence tab (Evidence) is authoritative and constrained.
> The Hypotheses tab is optional, transient, and cannot change conclusions.
> The Metrics is an audit tool — it shows raw data, not interpretations.

This separation ensures that toxicologists can trust what they see on Evidence as a faithful representation of precomputed analysis, while having freedom to investigate further on Hypotheses without risk of contaminating the record.

### Datagrok migration note

When migrating from Recharts to native Datagrok viewers, the Evidence tab viewers must be locked (no zoom, no pan, no model fitting, no axis scaling). The Hypotheses tab viewers may use Datagrok's full interactivity. See `docs/portability/datagrok-viewer-config.md` for exact `setOptions()` configurations.

---

## Hypotheses Tab

**Status:** Implemented as descriptive placeholders. Each intent renders a compact viewer placeholder with configuration summary and purpose text. Actual chart rendering will use native Datagrok viewers in production.

### Purpose

An opt-in sandbox for hypothesis generation. The toxicologist has already seen the signal on the Evidence tab; now they can investigate dose-response shape, model fits, endpoint trade-offs, correlations, and outliers — without affecting any conclusions or stored assessments.

### Layout

The tab uses a fixed header bar + scrollable content area:

```
+──────────────────────────────────────────+
│ [Shape] [Model fit] [Pareto] ...  italic │  ← intent pill bar (border-b)
+──────────────────────────────────────────+
│                                          │
│  Scrollable intent content               │  ← flex-1 overflow-y-auto
│  (viewer placeholder + config card)      │
│                                          │
+──────────────────────────────────────────+
```

### Intent selector (pill bar)

`flex items-center gap-1 border-b px-4 py-2`

Segmented pill buttons, not a dropdown. Each pill:

```
rounded-full px-2.5 py-1 text-[11px] font-medium flex items-center gap-1
```

| State | Classes |
|-------|---------|
| Active | `bg-foreground text-background` |
| Inactive | `text-muted-foreground hover:bg-accent hover:text-foreground` |

All tools are fully clickable regardless of implementation status. The `available` flag on tool definitions is metadata for future use — it does not affect interactivity. Tools that are currently stub/placeholder implementations render their ViewerPlaceholder + configuration card like any other tool. The placeholders ARE the feature for the prototype.

Icon: `h-3.5 w-3.5` inline before label text.

**Disclaimer text:** `ml-auto text-[10px] italic text-muted-foreground` — "Does not affect conclusions" (right-aligned in the pill bar).

### Intents

| Intent | Label | Icon | Available | Description |
|--------|-------|------|-----------|-------------|
| `shape` | Shape | `TrendingUp` | Yes | Interactive dose-response curve with zoom, pan, overlays |
| `model` | Model fit | `GitBranch` | No | Fit dose-response models (linear, sigmoid, polynomial) |
| `pareto` | Pareto front | `ScatterChart` | Yes | Scatter plot of endpoints by effect size vs. p-value |
| `correlation` | Correlation | `Link2` | No | Correlation matrix or scatter of related endpoints |
| `outliers` | Outliers | `BoxSelect` | No | Box plots, distribution views, outlier detection |
| `causality` | Causality | `Scale` | Yes | Bradford Hill causal assessment worksheet |

Default: `shape` (the most common first question after seeing a signal).

**Note:** Icon choices for Shape, Correlation, and Outliers are placeholders. See GAP-11 in TODO.md.

### Viewer placeholder pattern

Each intent renders a `ViewerPlaceholder` — a compact container representing where a Datagrok viewer will render in production:

```
h-28 rounded-md border bg-muted/30 flex items-center justify-center
```

Content: viewer type label (`text-sm font-medium text-muted-foreground`) + optional context line (`text-xs text-muted-foreground/70`).

### Configuration summary pattern

Below the viewer placeholder, a single `rounded-md border bg-card p-3` card shows:

- **Section header:** `text-[11px] font-semibold text-muted-foreground` (one per card)
- **ConfigLine entries:** `flex flex-wrap gap-x-4` with inline key-value pairs. Key: `text-muted-foreground`. Value: `font-mono` or plain text depending on content type.
- **ProductionNote** (where applicable): `text-[10px] italic text-muted-foreground` — explains what requires the Datagrok backend.

### Intent: Shape

- **Viewer:** Line chart (same as Evidence tab but with full interactivity: zoom, pan, tooltips)
- **Config:** Interaction = zoom + pan + tooltip; overlay = both sexes; model fitting = none
- **Endpoint-aware:** Shows selected endpoint name in viewer subtitle

### Intent: Model fit

- **Available:** No (requires Datagrok compute backend)
- **Viewer:** Line chart with model overlay
- **Config:** Model type = 4PL sigmoid (selectable); metrics = R², AIC; prediction = dashed interpolation
- **ProductionNote:** "Requires Datagrok compute backend"

### Intent: Pareto

- **Viewer:** Scatter plot of all endpoints (volcano-style)
- **Config:** X = max |d|; Y = -log10(trend p); color = organ system; reference lines at d=0.5, d=0.8, p=0.05, p=0.01
- **Endpoint-aware:** Shows total endpoint count in viewer subtitle; selected endpoint highlighted with ring
- **Design decision on organ colors:** See "Design decision: organ system colors in Pareto scatter" subsection below.

### Intent: Correlation

- **Available:** No (requires multi-endpoint data alignment)
- **Viewer:** Scatter plot of subject-level values
- **Config:** Endpoints = select 2 from same organ; statistic = Pearson + Spearman; grouping = by dose
- **ProductionNote:** "Requires aligned subject-level data"

### Intent: Outliers

- **Viewer:** Box plot with jitter overlay
- **Config:** Grouping = dose; split = sex; threshold = 1.5 IQR; overlay = individual points
- **Endpoint-aware:** Shows selected endpoint name in viewer subtitle

### Intent: Causality

- **Available:** Yes
- **Icon:** `Scale` (lucide-react) — the balance/scales icon represents weighing evidence, which is exactly what Bradford Hill criteria do
- **Description:** "Bradford Hill causal assessment"
- **Viewer:** None — this intent uses a structured form, not a chart placeholder
- **Requires endpoint selection:** Yes — empty state when no endpoint selected

**Purpose:** Structured causality worksheet using Bradford Hill criteria. Unlike other Hypotheses tools that are ephemeral explorations, the Causality tool captures expert reasoning that supports regulatory conclusions. See "Design decision: Causality persistence exception" below.

#### Layout

When an endpoint is selected, the content area renders as a scrollable form:

```
+──────────────────────────────────────────+
│ Causality: {endpoint_label}              │  ← header (text-sm font-semibold)
│ {domain colored text} · {organ_system}   │  ← subtitle (text-xs text-muted-foreground, domain via getDomainBadgeColor().text)
+──────────────────────────────────────────+
│                                          │
│ COMPUTED EVIDENCE          (section hdr) │
│ ┌──────────────────────────────────────┐ │
│ │ Biological gradient  ●●●○○  Strong   │ │
│ │ monotonic_increase · p_trend < 0.001 │ │
│ ├──────────────────────────────────────┤ │
│ │ Strength             ●●●●○  Strong   │ │
│ │ max |d| = 2.23 · p < 0.001          │ │
│ ├──────────────────────────────────────┤ │
│ │ Consistency          ●●○○○  Moderate │ │
│ │ Both sexes affected                  │ │
│ ├──────────────────────────────────────┤ │
│ │ Specificity          ●○○○○  Weak     │ │
│ │ Endpoint signals in 4 organ systems  │ │
│ ├──────────────────────────────────────┤ │
│ │ Coherence            ●●●○○  Moderate │ │
│ │ 2 correlated findings in organ       │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ EXPERT ASSESSMENT          (section hdr) │
│ ┌──────────────────────────────────────┐ │
│ │ Temporality                          │ │
│ │ ○○○○○ [▾ select]                     │ │
│ │ "Is the timing of onset..."  (hint)  │ │
│ │ [  rationale text area             ] │ │
│ ├──────────────────────────────────────┤ │
│ │ Biological plausibility              │ │
│ │ ○○○○○ [▾ select]                     │ │
│ │ "Is there a known biological..."     │ │
│ │ [  rationale text area             ] │ │
│ ├──────────────────────────────────────┤ │
│ │ Experiment                           │ │
│ │ ○○○○○ [▾ select]                     │ │
│ │ "Do the controlled study..."         │ │
│ │ [  rationale text area             ] │ │
│ ├──────────────────────────────────────┤ │
│ │ Analogy                              │ │
│ │ ○○○○○ [▾ select]                     │ │
│ │ "Do similar compounds..."            │ │
│ │ [  rationale text area             ] │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ OVERALL ASSESSMENT                       │
│ ┌──────────────────────────────────────┐ │
│ │ ○ Likely causal                      │ │
│ │ ○ Possibly causal                    │ │
│ │ ○ Unlikely causal                    │ │
│ │ ○ Not assessed                       │ │
│ │                                      │ │
│ │ Comment: [________________________]  │ │
│ │                                      │ │
│ │ [SAVE]          User · 2026-02-09    │ │
│ └──────────────────────────────────────┘ │
+──────────────────────────────────────────+
```

When no endpoint is selected:
```
p-4 text-xs text-muted-foreground: "Select an endpoint to assess causality."
```

#### Criteria cards

Each criterion renders in a card-row inside a bordered container. Shared structure:

**Card row:** `border-b last:border-b-0 px-3 py-2.5`

**Label + dot gauge row:** `flex items-center justify-between`
- Label: `text-xs font-medium` (sentence case — "Biological gradient", not "Biological Gradient")
- Dot gauge: 5 dots, inline with strength label
- Strength label: `text-[10px] font-medium text-muted-foreground`

**Evidence line (computed criteria only):** `text-[10px] text-muted-foreground mt-0.5`
- Shows the data values that produced the score
- All text is neutral `text-muted-foreground` — no color on p-values or effect sizes (this is a form, not a heatmap; follows neutral-at-rest principle §1.11)

#### Dot gauge

5-dot scale using filled/empty circles. All dots are **neutral gray** — no color coding (signal-not-meaning principle).

```tsx
// Filled: text-foreground/70   Empty: text-foreground/15
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
| 0 | ○○○○○ | Not assessed |
| 1 | ●○○○○ | Weak |
| 2 | ●●○○○ | Weak-moderate |
| 3 | ●●●○○ | Moderate |
| 4 | ●●●●○ | Strong |
| 5 | ●●●●● | Very strong |

#### Auto-population logic (computed evidence section)

These criteria are scored automatically from existing data. No user input needed. The computed score is shown as the dot gauge. If the user disagrees, they can override (see "Override" below).

| Criterion | Data source | Score mapping |
|-----------|-------------|--------------|
| **Biological gradient** | `endpointSummary.dose_response_pattern` + `endpointSummary.min_trend_p` | `monotonic_increase`/`monotonic_decrease` → 4 (Strong); `threshold` → 3 (Moderate); `non_monotonic` → 2 (Weak-moderate); `flat`/`no_pattern` → 1 (Weak). Bonus +1 if `min_trend_p < 0.01`. |
| **Strength of association** | `endpointSummary.max_effect_size` | `|d| >= 1.2` → 5 (Very strong); `|d| >= 0.8` → 4 (Strong); `|d| >= 0.5` → 3 (Moderate); `|d| >= 0.2` → 2 (Weak-moderate); `|d| < 0.2` → 1 (Weak) |
| **Consistency** | `endpointSummary.sexes` | Both M and F → 4 (Strong); one sex only → 2 (Weak-moderate) |
| **Specificity** | Count distinct `organ_system` values in `endpointSummaries` matching this `endpoint_label` | 1 organ → 4 (Strong); 2 organs → 3 (Moderate); 3 organs → 2 (Weak-moderate); 4+ → 1 (Weak) |
| **Coherence** | Count R16 rules from `ruleResults` where `organ_system` matches | 3+ correlations → 4 (Strong); 1-2 → 3 (Moderate); 0 → 1 (Weak) |

**Evidence line text examples:**
- Biological gradient: `"monotonic_increase · trend p < 0.001"`
- Strength: `"|d| = 2.23 (F, high dose) · p < 0.001"`
- Consistency: `"Both sexes affected (M, F)"`
- Specificity: `"Signals in 1 organ system (hepatic)"`
- Coherence: `"3 correlated endpoints in hepatic (R16 rules)"`

#### Override mechanism

Each auto-populated criterion has a small override toggle. When clicked:
- The dot gauge becomes editable (a 5-level stepper or dropdown)
- A justification text area appears (`text-xs`, 2 rows, placeholder "Reason for override...")
- The card shows a subtle `(overridden)` badge in `text-[9px] text-amber-600`
- Override values persist via annotations alongside expert-input values

Toggle: small `Edit2` (pencil) icon, `h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground`, positioned right of the strength label.

#### Expert assessment section

Four criteria that require toxicologist judgment. Each card has:

1. **Label**: `text-xs font-medium`
2. **Strength selector**: dropdown `<select>` with options: Not assessed, Weak, Weak-moderate, Moderate, Strong, Very strong. Default: "Not assessed" (0 dots).
3. **Guidance text**: `text-[10px] italic text-muted-foreground mt-0.5` — shown collapsed by default, toggle via `(?)` icon
4. **Rationale text area**: `text-xs rounded border px-2 py-1.5 mt-1`, 2 rows, placeholder "Notes..."
5. **Dot gauge**: updates to reflect dropdown selection

Guidance text (collapsible via `(?)` icon next to label):
| Criterion | Guidance |
|-----------|----------|
| Temporality | "Is the timing of onset consistent with treatment exposure? Consider recovery group data if available." |
| Biological plausibility | "Is there a known biological mechanism? Reference published literature or compound class effects." |
| Experiment | "Do the controlled study conditions support a causal interpretation? Consider study design adequacy." |
| Analogy | "Do similar compounds in the same class produce similar effects?" |

#### Overall assessment section

Bordered container with radio buttons and comment field.

**Radio group:**
- `flex flex-col gap-1.5`
- Each option: `flex items-center gap-2 text-xs cursor-pointer`
- Radio input: standard HTML radio, `accent-primary`
- Options: "Likely causal", "Possibly causal", "Unlikely causal", "Not assessed"
- Default: "Not assessed"
- No color on the radio labels — plain text

**Comment field:**
- `text-xs rounded border px-2 py-1.5 mt-2 w-full`, 2 rows
- Placeholder: "Overall assessment notes..."

**Save button + footer:**
- SAVE button: `rounded bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase text-primary-foreground hover:bg-primary/90`, disabled when no changes
- Footer: `text-[10px] text-muted-foreground` — reviewer name + last save date (from annotation metadata)
- Layout: `flex items-center justify-between mt-3`

#### Persistence

- **Schema type:** `causal-assessment` (new annotation schema)
- **Key format:** `{endpoint_label}` — one assessment per endpoint per study
- **Stored fields:** `{ overrides: Record<string, { level: number, justification: string }>, expert: Record<string, { level: number, rationale: string }>, overall: string, comment: string }`
- **Hooks:** `useAnnotations<CausalAssessment>(studyId, "causal-assessment")` + `useSaveAnnotation<CausalAssessment>(studyId, "causal-assessment")`
- Auto-populated scores are NOT stored — they are computed on the fly from endpoint summary and rule results. Only overrides, expert input, and overall assessment are persisted.

#### Data dependencies

The Causality tool needs two data sources not currently available in the Hypotheses tab:

1. **`useStudySignalSummary(studyId)`** — needed for specificity calculation (counting organ systems where an endpoint signals). Already available via hook.
2. **`useRuleResults(studyId)`** — needed for coherence calculation (counting R16 rules). Not currently imported in DoseResponseView.

Both should be fetched at the view level and passed to the Hypotheses tab as props. These are read-only data sources — the Causality tool never writes to them.

#### Design decision: Causality persistence exception

**The problem:** The Hypotheses tab rule says "No model parameters or hypothesis results are persisted" and "Affect any annotation or assessment" is in the "must never do" list.

**The resolution:** The Causality tool is an exception because Bradford Hill assessment is a **regulatory documentation requirement**, not an analytical exploration.

- Shape, Model, Pareto, Correlation, Outliers are **analytical sandboxes** — the toxicologist explores data patterns. These are ephemeral.
- Causality is a **structured reasoning worksheet** — it documents WHY the toxicologist concluded something was treatment-related. This has regulatory value (ICH M3(R2), FDA reviewer expects this rationale).

**Updated rule:** "Hypotheses tools must not persist results that change conclusions. The Causality tool persists expert reasoning (Bradford Hill assessment) as an annotation — it documents the rationale behind conclusions made elsewhere (ToxFinding annotations, NOAEL determination), but does not itself modify those conclusions."

**Spec update needed:** Lines 656 and 665 of dose-response.md should add the Causality caveat.

#### Design decision: icon choice (Scale)

**Choice:** `Scale` from lucide-react (balance/scales icon).

**Rationale:**
1. The Bradford Hill framework is literally about *weighing evidence* — the scales metaphor is exact.
2. It visually distinguishes from the other analytical tools (charts, scatter, link).
3. At 14x14 it reads clearly as a balance/scales.
4. Alternative considered: `ClipboardCheck` (too generic, implies a checklist not reasoning), `Brain` (too abstract), `FileCheck` (too administrative).

#### Design decision: auto-populated score overridability

**The Open Question #3 in the spec** asks whether auto-populated scores should be overridable.

**Decision: Yes, with justification.** A toxicologist may have domain knowledge that changes the assessment — e.g., the dose-response pattern is classified as "non-monotonic" by the algorithm but the toxicologist recognizes it as a hormesis curve (U-shaped, biologically meaningful). The override mechanism captures both the original computed value and the expert's adjusted value with justification, preserving the audit trail.

#### Design decision: study-level causality summary

**The Open Question #2** asks about aggregating endpoint-level assessments.

**Decision: Defer.** This is a separate feature. The worksheet is per-endpoint. A study-level summary that aggregates across endpoints would be a new component (perhaps in the Study Summary view). Not in scope for FEAT-08.

#### Design decision: HTML report export

**The Open Question #1** asks about including causality assessments in the HTML report.

**Decision: Yes, as an appendix table.** When a report is generated, include a "Causality Assessments" section listing each assessed endpoint with its criterion scores and overall conclusion. This is a report-generator change, not a FEAT-08 scope item — deferred to a follow-up.

#### Design decision: organ system colors in Pareto scatter

**Choice:** Deterministic hue-from-hash mapping (e.g., `hsl(hash(organ) % 360, 55%, 55%)`), not a fixed palette.

**Rationale:**
1. **Data-driven variability.** Organ systems are not fixed — different studies surface different organ systems. A hand-curated palette of 8-10 colors would need a fallback for unseen systems anyway, which defeats the purpose of curating.
2. **Position is primary.** The scatter's core message is encoded in position (x=biological magnitude, y=statistical significance). Color is a secondary grouping aid that helps visually cluster related endpoints. Exact color aesthetics matter less than consistency (same organ → same color every time).
3. **Existing palettes don't transfer.** The domain badge colors (`getDomainBadgeColor` in `severity-colors.ts`) map to domains (LB, BW, MI), not organ systems. Multiple domains can map to the same organ (e.g., both LB and OM contribute to hepatic), so reusing domain colors for organs would be misleading.
4. **Hash stability.** A hash function produces the same hue for the same organ name across sessions and studies, without maintaining a lookup table.

**Implementation (deferred to Datagrok migration):** Add `getOrganSystemColor(organSystem: string): string` to `severity-colors.ts`. Use a simple string hash → hue mapping with fixed saturation (55%) and lightness (55%) for visual consistency. The function should also have a small override table for the most common organs (hepatic, renal, cardiovascular, hematologic) to ensure aesthetically pleasant defaults.

### State management

All Hypotheses tab state is session-scoped:
- Selected intent resets to `shape` when switching away and back
- No model parameters or hypothesis results are persisted (exception: Causality tool, see below)
- Hypotheses tab state does not affect context panel content (context panel continues to show Evidence-based insights for the selected endpoint)

**Causality tool persistence exception:** The Causality tool persists expert reasoning (Bradford Hill assessment) as an annotation via the `causal-assessment` schema type. This is a regulatory documentation requirement, not an analytical exploration. The persisted data captures *reasoning rationale*, not *conclusions* — the actual conclusions (treatment-relatedness, adversity, NOAEL) are stored in ToxFinding annotations and the NOAEL determination. See "Design decision: Causality persistence exception" in the Intent: Causality section above.

### What Hypotheses must never do

- Update NOAEL or target organ decisions
- Rewrite text on the Evidence tab
- Store model parameters as authoritative results
- Modify the `DoseResponseSelection` shared via `ViewSelectionContext`
- Override conclusions from the Evidence tab or any other view
- (Causality exception: may persist Bradford Hill reasoning via annotations API, but this documents rationale — it does not change computed results)

---

## Current Issues / Improvement Opportunities

### Rail
- No keyboard navigation between endpoints or organ groups
- Signal score is computed locally (not from generated data) — may diverge from `study_signal_summary.json` scores
- Organ group headers don't show aggregate statistics (unlike Target Organs rail items which show evidence scores)

### Charts
- No visual indicator of significance thresholds (horizontal reference lines)
- Error bars use raw SD, not SEM
- No dose-response curve fitting or trend line overlay
- Categorical bar chart Y-axis always 0-1 even if incidence is low

### Metrics Table
- No row cap — all rows rendered (1342 for PointCross), could cause performance issues with larger datasets
- No column visibility toggle
- No export option

### Context Panel
- Rule filtering uses `organ_system` match + `domain_` prefix on `context_key` — may miss some cross-organ rules
- Related views pane is default-closed — users may not discover navigation links
- No back-link to Study Summary from this view

### General
- No keyboard navigation (arrow keys in grid or between rail items)
- No export option for chart or grid data

---

## Changelog

### 2026-02-09 — Design audit alignment

- **View name:** Renamed from "Dose-response & causality" to "Dose-Response" in browsing tree
- **Chart layout:** Updated spec to document actual combined layout (dose-response + effect size charts with resize handle, both sexes overlaid) instead of per-sex split
- **Pattern badges:** Documented neutral gray as intentional (signal-not-meaning principle)
- **Direction arrows:** Documented neutral gray as intentional (categorical identity, not signal)
- **Dose columns:** Removed colored badge specs from pairwise and metrics tables. Plain `font-mono` text — color encodes signal, not categorical identity. Added standing rule to CLAUDE.md.
- **Domain column:** Updated to colored-text-only (matches project-wide rule)
- **Chart dots:** Significant dots use size + dark stroke ring (`#374151`) to preserve sex color identity. Same approach as stroke-for-significance on categorical bars.
- **Categorical bars:** Updated to document stroke-for-significance (preserves sex color identity in combined chart)
- **P-value/effect columns:** Both pairwise and metrics tables now use interaction-driven `ev` class (neutral at rest, `#DC2626` on row hover) — follows evidence-whispers-in-text philosophy and CLAUDE.md hard rule. Documented stub for user-togglable color coding via hamburger menu (Datagrok Pattern #23).
- **Rail search:** Updated to inline flex pattern (consistent with all view rails)
- **Context panel subtitle:** Updated to `titleCase(organ_system)` (matches code and project convention)
- **Hypotheses tools:** All tools fully interactive regardless of `available` flag; removed unavailable/not-clickable distinction. Updated Pareto label to "Pareto front".

### 2026-02-09 — CL consolidation into Dose-Response

- **Tab bar:** Reduced from 4 tabs (Evidence, Time-course, Hypotheses, Metrics) to 3 tabs (Evidence, Hypotheses, Metrics). Time-course content moved to collapsible toggle section in Evidence tab.
- **Time-course toggle:** Added below pairwise comparison table. Default collapsed. Lazy-loads data on expand. Supports continuous (line chart with spaghetti overlay), CL temporal (bar charts), and shows disabled message for other categorical.
- **CL endpoints:** Clinical observation endpoints now appear in the D-R endpoint rail under "General" organ group (already in `dose_response_metrics.json`). CL-specific time-course uses `CLTimecourseCharts` component with sex-faceted bar charts showing incidence counts over study days.
- **Standalone CL view deleted:** `ClinicalObservationsView.tsx` and `ClinicalObservationsViewWrapper.tsx` removed. Route, browsing tree entry, context panel mode, and `analysis-definitions.ts` entry all removed.
- **State management:** Tab state type reduced to `"evidence" | "hypotheses" | "metrics"`. Time-course expanded state is local `useState<boolean>(false)`.
- **Spec:** Implemented per `docs/incoming/09-dr-cl-consolidation.md`.
