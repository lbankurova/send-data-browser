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

**Search input:** Relative-positioned wrapper with Search icon overlay.
- Icon: `absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground`
- Input: `w-full rounded border bg-background py-1 pl-7 pr-2 text-xs`, placeholder "Search endpoints..."
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
- Direction arrow (right-aligned): `text-xs font-semibold`

| Direction | Arrow | Color |
|-----------|-------|-------|
| up | `↑` | `text-red-500` |
| down | `↓` | `text-blue-500` |
| mixed | `↕` | `text-muted-foreground` |
| null | (none) | — |

**Row 2:** `mt-0.5 flex items-center gap-1.5`
- Pattern badge: first word of the pattern label, `rounded px-1 py-0.5 text-[9px] font-medium leading-tight` with pattern-specific colors (see table below)
- Trend p-value: `text-[10px] font-mono` with p-value color — "p={value}"
- Max effect size: `text-[10px] font-mono` with effect size color — "|d|={value}" (1 decimal place), shown only when non-null

### Pattern Badge Colors

| Pattern | Classes |
|---------|---------|
| monotonic_increase | `bg-red-100 text-red-700` |
| monotonic_decrease | `bg-blue-100 text-blue-700` |
| threshold | `bg-amber-100 text-amber-700` |
| non_monotonic | `bg-purple-100 text-purple-700` |
| flat | `bg-green-100 text-green-700` |
| insufficient_data | `bg-gray-100 text-gray-500` |

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
- Right: full pattern badge (`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium` with pattern-specific colors)

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

Active tab: `border-b-2 border-primary text-foreground`
Inactive tab: `text-muted-foreground hover:text-foreground`
Both: `px-4 py-1.5 text-xs font-medium transition-colors`

**Row count (metrics tab only):** `ml-auto mr-3 text-[10px] text-muted-foreground` — "{filtered} of {total} rows"

---

## Evidence Tab

### No Data State

When no endpoint is selected: "Select an endpoint to view chart and overview." — centered, `p-12 text-xs text-muted-foreground`

### Chart Area

Container: `border-b p-4`

**Chart layout:** `flex gap-4` — one chart per sex, side-by-side with `flex-1` each.

**Per-sex label:** `mb-1 text-center text-[10px] font-medium`, colored by sex:
- Males: `#3b82f6` (blue-500)
- Females: `#ec4899` (pink-500)

#### Continuous Data: Line Chart (Recharts `<LineChart>`)

- Container: `<ResponsiveContainer width="100%" height={280}>`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- X-axis: dose labels (first part before comma), tick fontSize 10
- Y-axis: auto-scaled, tick fontSize 10
- Tooltip: `contentStyle={{ fontSize: 11 }}`, shows "Mean: {value.toFixed(2)}"
- Line: `type="monotone"`, dataKey="mean", sex-colored stroke, `strokeWidth={2}`, `connectNulls`
- Error bars: `<ErrorBar dataKey="sd">`, width 4, strokeWidth 1, sex-colored stroke
- Dots: significance-aware custom rendering:
  - p < 0.05: r=6, fill `#dc2626` (red-600), strokeWidth 2
  - p >= 0.05 or null: r=4, sex-colored fill, strokeWidth 1

#### Categorical Data: Bar Chart (Recharts `<BarChart>`)

- Container: `<ResponsiveContainer width="100%" height={280}>`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- X-axis: dose labels, tick fontSize 10
- Y-axis: domain `[0, 1]`, tick fontSize 10
- Tooltip: shows incidence as percentage `{(value * 100).toFixed(0)}%`
- Bar: dataKey="incidence", custom shape with `rx={2}` rounded corners
  - Significance-aware fill: p < 0.05 → `#dc2626` (red-600), otherwise sex-colored

#### Chart Legend

Below charts, centered: `mt-1 flex items-center justify-center gap-4 text-[10px] text-muted-foreground`
- Significant (p<0.05): red dot (`h-2.5 w-2.5 rounded-full bg-red-600`)
- Not significant: gray dot (`h-2 w-2 rounded-full bg-gray-400`)

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
| Dose | Dose | Left | Dose-level colored badge: `rounded px-1.5 py-0.5 text-[10px] font-medium text-white` with `backgroundColor: getDoseGroupColor(dose_level)`. Shows `dose_label.split(",")[0]`. |
| Sex | Sex | Left | Plain text |
| Mean | Mean | Right | `font-mono`, 2 decimal places, em dash if null |
| SD | SD | Right | `font-mono text-muted-foreground`, 2 decimal places, em dash if null |
| N | N | Right | Plain text, em dash if null |
| p-value | p-value | Right | `font-mono` with p-value color, formatted via `formatPValue` |
| Effect | Effect | Right | `font-mono` with effect size color, formatted via `formatEffectSize` |
| Pattern | Pattern | Left | `text-muted-foreground`, underscores replaced with spaces |

**Data rows:** `border-b border-dashed`, cells `px-2 py-1`

Shows all rows for the selected endpoint sorted by `dose_level` ascending, then `sex` ascending.

Hidden when no endpoint is selected (table only renders when `pairwiseRows.length > 0`).

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
| domain | Domain | Colored badge: `rounded px-1.5 py-0.5 text-[10px] font-medium` with domain-specific bg/text colors |
| dose_level | Dose | Colored badge: `rounded px-1.5 py-0.5 text-[10px] font-medium text-white` with dose-level color |
| sex | Sex | Plain text |
| mean | Mean | `font-mono`, 2 decimal places, em dash if null |
| sd | SD | `font-mono text-muted-foreground`, 2 decimal places, em dash if null |
| n | N | Plain text, em dash if null |
| incidence | Incid. | `font-mono`, displayed as percentage `{(value * 100).toFixed(0)}%`, em dash if null |
| p_value | P-value | `font-mono`, p-value color coded, formatted via `formatPValue` |
| effect_size | Effect | `font-mono`, effect size color coded, formatted via `formatEffectSize` |
| trend_p | Trend p | `font-mono`, p-value color coded, formatted via `formatPValue` |
| dose_response_pattern | Pattern | `text-muted-foreground`, underscores replaced with spaces |

**Row interactions:**
- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on `endpoint_label` + `sex`)
- Click: sets selection (`endpoint_label`, `sex`, `domain`, `organ_system`). Click again to deselect (toggle).
- Selection syncs `selectedEndpoint` state so chart/header update.
- Row cells: `px-2 py-1`

**Row cap:** None — all rows rendered regardless of count (1342 rows for PointCross).

**Empty state:** "No rows match the current filters." — `p-4 text-center text-xs text-muted-foreground`

### Domain Badge Colors

| Domain | Background | Text |
|--------|-----------|------|
| LB | `bg-blue-100` | `text-blue-700` |
| BW | `bg-emerald-100` | `text-emerald-700` |
| OM | `bg-purple-100` | `text-purple-700` |
| MI | `bg-rose-100` | `text-rose-700` |
| MA | `bg-orange-100` | `text-orange-700` |
| CL | `bg-cyan-100` | `text-cyan-700` |
| Other | `bg-gray-100` | `text-gray-700` |

### Dose Group Colors

| Level | Color | Meaning |
|-------|-------|---------|
| 0 | `#6b7280` (gray) | Control |
| 1 | `#3b82f6` (blue) | Low |
| 2 | `#f59e0b` (amber) | Mid |
| 3 | `#ef4444` (red) | High |

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
- Subtitle: `text-xs text-muted-foreground` — "{domain} &middot; {organ_system}" (underscores replaced with spaces), optionally " &middot; {sex}" if sex is set in the selection

#### Pane 1: Insights (default open)

`CollapsiblePane` with `InsightsList` component.

Rules filtered by: `organ_system` match (rules where `r.organ_system === selection.organ_system`) OR `context_key` starts with `{domain}_` prefix (endpoint-scope rules in the same domain).

Same InsightsList rendering as described in study-summary.md (tier pills, organ groups, synthesized signals, correlation chips, expandable raw rules).

#### Pane 2: Tox Assessment (default open)

`ToxFindingForm` component keyed by `endpointLabel` (the selected endpoint).
- Treatment related dropdown, adversity dropdown (grayed when treatment="No"), comment textarea, SAVE button.
- Only rendered when `studyId` is available.

#### Pane 3: Related views (default closed)

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
| Inactive + available | `text-muted-foreground hover:bg-accent/50` |
| Inactive + unavailable | `opacity-40 text-muted-foreground` (not clickable) |

Icon: `h-3.5 w-3.5` inline before label text.

**Disclaimer text:** `ml-auto text-[10px] italic text-muted-foreground` — "Does not affect conclusions" (right-aligned in the pill bar).

### Intents

| Intent | Label | Icon | Available | Description |
|--------|-------|------|-----------|-------------|
| `shape` | Shape | `TrendingUp` | Yes | Interactive dose-response curve with zoom, pan, overlays |
| `model` | Model fit | `GitBranch` | No | Fit dose-response models (linear, sigmoid, polynomial) |
| `pareto` | Pareto | `ScatterChart` | Yes | Scatter plot of endpoints by effect size vs. p-value |
| `correlation` | Correlation | `Link2` | No | Correlation matrix or scatter of related endpoints |
| `outliers` | Outliers | `BoxSelect` | No | Box plots, distribution views, outlier detection |

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
- No model parameters or hypothesis results are persisted
- Hypotheses tab state does not affect context panel content (context panel continues to show Evidence-based insights for the selected endpoint)

### What Hypotheses must never do

- Update NOAEL or target organ decisions
- Rewrite text on the Evidence tab
- Store model parameters as authoritative results
- Modify the `DoseResponseSelection` shared via `ViewSelectionContext`
- Affect any annotation or assessment

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
