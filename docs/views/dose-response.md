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

The view itself is a two-panel layout:

```
+--[300px]--+--------[flex-1]--------+
|            |                        |
| Endpoint   | Evidence Panel         |
| Rail       | (summary header +     |
| (organ-    |  tabs: chart/metrics)  |
| grouped)   |                        |
+------------+------------------------+
```

Responsive: `max-[1200px]:flex-col` — rail collapses to a 180px horizontal strip with `max-[1200px]:h-[180px] max-[1200px]:w-full max-[1200px]:border-b`.

---

## Endpoint Rail (Left, 300px)

Container: `w-[300px] shrink-0 flex-col border-r`

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
| Organ name | `flex-1 truncate`, underscores replaced with spaces |
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

- Click: selects the endpoint, switches to "Chart & overview" tab, updates selection context.
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
- Format: "{domain} &middot; {organ_system}" (underscores replaced with spaces)
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

Two tabs:
- "Chart & overview"
- "Metrics table"

Active tab: `border-b-2 border-primary text-foreground`
Inactive tab: `text-muted-foreground hover:text-foreground`
Both: `px-4 py-1.5 text-xs font-medium transition-colors`

**Row count (metrics tab only):** `ml-auto mr-3 text-[10px] text-muted-foreground` — "{filtered} of {total} rows"

---

## Chart & Overview Tab

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
| Organ system | All organs / {unique organ systems, underscores replaced with spaces} | All organs |

**Row count:** `ml-auto text-[10px] text-muted-foreground` — "{N} rows"

### Metrics Grid

TanStack React Table, `w-full text-xs`, client-side sorting.

**Header row:** `border-b bg-muted/50`
- Headers: `cursor-pointer px-2 py-1.5 text-left font-medium hover:bg-accent/50`
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
| Active tab | Local | `useState<"chart" \| "metrics">` — switches between chart and metrics views |
| Rail search | Local | `useState<string>` — text input for filtering endpoints in the rail |
| Expanded organs | Local | `useState<Set<string>>` — tracks which organ groups are expanded in the rail |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "dose-response"` tag, propagated via `onSelectionChange` callback |
| Metrics filters | Local | `useState` — `{ sex, data_type, organ_system }`, each nullable string |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state for metrics table |
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
- **On rail endpoint click:** selects endpoint, switches to "Chart & overview" tab, updates selection.
- **On metrics table row click:** sets selection with `endpoint_label` + `sex` + `domain` + `organ_system`, syncs `selectedEndpoint`. Click again to deselect (toggle).

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading dose-response data..." |
| Error (no generated data) | Red box with instructions to run generator command: `cd backend && python -m generator.generate {studyId}` |
| No endpoint selected | "Select an endpoint from the list to view dose-response details." in evidence panel header area |
| Rail search no matches | "No endpoints match your search." in rail body |
| Metrics table no matches | "No rows match the current filters." below table |

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
