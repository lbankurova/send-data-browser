# Dose-Response View

**Route:** `/studies/:studyId/dose-response`
**Component:** `DoseResponseView.tsx` (wrapped by `DoseResponseViewWrapper.tsx`)
**Scientific question:** "How does the finding change across dose levels?"
**Role:** Quantitative dose-response analysis. Shows trends, statistical comparisons, and pattern characterization for each endpoint.

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

The view itself is a single scrollable column with two main sections:

```
+-----------------------------------------------------------+
| [Search endpoints...] [Sex] [Type] [Organ]   {N of M rows}|  <-- filter bar, border-b, bg-muted/30
+-----------------------------------------------------------+
|                                                           |
|  Chart area (shown when endpoint selected)                |
|  - One Recharts panel per sex, side-by-side               |
|                                                           |
+-----------------------------------------------------------+  <-- border-b
|                                                           |
|  Dose-Response Metrics grid (TanStack table)              |
|  - 12 columns, first 200 rows rendered                    |
|                                                           |
+-----------------------------------------------------------+
```

---

## Filter Bar

`flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2`

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Endpoint search | Text input with autocomplete dropdown | `<input type="text">` w-48 + dropdown overlay | Empty (no endpoint selected) |
| Sex | Dropdown | `<select>` with All / Male / Female | All |
| Data type | Dropdown | `<select>` with All / Continuous / Categorical | All |
| Organ system | Dropdown | `<select>` with All + unique `organ_system` values (underscores replaced with spaces) | All |

**Row count indicator:** Right-aligned `ml-auto`, `text-[10px] text-muted-foreground`, shows "{filtered} of {total} rows".

### Endpoint Search Behavior
- Text input: `w-48 rounded border bg-background px-2 py-1 text-xs`, placeholder "Search endpoints..."
- As user types, a dropdown appears below (`absolute left-0 top-full z-10 mt-1 max-h-48 w-64 overflow-auto rounded border bg-background shadow-lg`)
- Dropdown shows up to 50 matching endpoints, each as a `block w-full truncate px-2 py-1 text-left text-xs hover:bg-accent/50` button
- Clicking an endpoint sets the filter and clears the search text
- When an endpoint is selected, it appears as a chip: `flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs` with an `x` dismiss button
- Endpoint label in chip truncated at 25 characters with ellipsis

### All controls styling
- All controls: `rounded border bg-background px-2 py-1 text-xs`

---

## Chart Area

Shown when an endpoint is selected (via filter or grid row click). The chart endpoint is determined by `selection?.endpoint_label ?? filters.endpoint`.

### No Endpoint Selected State
- `border-b p-4 text-center text-xs text-muted-foreground`
- Message: "Select an endpoint from the grid or filter to view the dose-response chart."

### With Endpoint Selected

Section container: `border-b p-4`

**Header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2` — shows endpoint label

**Chart layout:** `flex gap-4` — one chart per sex, side-by-side with `flex-1` each

**Per-sex sub-header:** `text-center text-[10px] font-medium mb-1`, colored by sex:
- Males: `#3b82f6` (blue-500)
- Females: `#ec4899` (pink-500)

### Continuous Data: Line Chart (Recharts `<LineChart>`)
- Container: `<ResponsiveContainer width="100%" height={200}>`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- X-axis: dose labels (first part before comma), tick fontSize 10
- Y-axis: auto-scaled, tick fontSize 10
- Tooltip: `contentStyle={{ fontSize: 11 }}`, shows "Mean: {value.toFixed(2)}"
- Line: `type="monotone"`, dataKey="mean", sex-colored stroke, `strokeWidth={2}`, dots `r={4}`, `connectNulls`
- Error bars: `<ErrorBar dataKey="sd">`, width 4, strokeWidth 1, sex-colored

### Categorical Data: Bar Chart (Recharts `<BarChart>`)
- Container: `<ResponsiveContainer width="100%" height={200}>`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- X-axis: dose labels, tick fontSize 10
- Y-axis: domain `[0, 1]`, tick fontSize 10
- Tooltip: shows incidence as percentage `{(value * 100).toFixed(0)}%`
- Bar: dataKey="incidence", sex-colored fill

### Sex Colors (in chart)
| Sex | Color |
|-----|-------|
| M | `#3b82f6` (blue-500) |
| F | `#ec4899` (pink-500) |

---

## Dose-Response Metrics Grid

### Section Header
`flex items-center justify-between px-4 pt-3 pb-1`
- Title: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Shows: "Dose-response metrics ({N} rows)"

### Table
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
| dose_level | Dose | Colored badge: `rounded px-1.5 py-0.5 text-[10px] font-medium text-white` with dose-level color (gray/blue/amber/red) |
| sex | Sex | Plain text |
| mean | Mean | `font-mono`, 2 decimal places, em dash if null |
| sd | SD | `font-mono text-muted-foreground`, 2 decimal places, em dash if null |
| n | N | Plain text, em dash if null |
| incidence | Incid. | `font-mono`, displayed as percentage `{(value * 100).toFixed(0)}%`, em dash if null |
| p_value | P-value | `font-mono`, p-value color coded (red/amber/muted), formatted via `formatPValue` |
| effect_size | Effect | `font-mono`, effect size color coded, formatted via `formatEffectSize` (2 decimals) |
| trend_p | Trend p | `font-mono`, p-value color coded, formatted via `formatPValue` |
| dose_response_pattern | Pattern | `text-muted-foreground`, underscores replaced with spaces |

**Domain badge colors:**
| Domain | Background | Text |
|--------|-----------|------|
| LB | `bg-blue-100` | `text-blue-700` |
| BW | `bg-emerald-100` | `text-emerald-700` |
| OM | `bg-purple-100` | `text-purple-700` |
| MI | `bg-rose-100` | `text-rose-700` |
| MA | `bg-orange-100` | `text-orange-700` |
| CL | `bg-cyan-100` | `text-cyan-700` |
| Other | `bg-gray-100` | `text-gray-700` |

**Dose group colors:**
| Level | Color | Meaning |
|-------|-------|---------|
| 0 | `#6b7280` (gray) | Control |
| 1 | `#3b82f6` (blue) | Low |
| 2 | `#f59e0b` (amber) | Mid |
| 3 | `#ef4444` (red) | High |

**P-value color scale (text classes):**
| Threshold | Class |
|-----------|-------|
| p < 0.001 | `text-red-600 font-semibold` |
| p < 0.01 | `text-red-500 font-medium` |
| p < 0.05 | `text-amber-600 font-medium` |
| p < 0.1 | `text-amber-500` |
| p >= 0.1 | `text-muted-foreground` |

**P-value formatting:**
| Range | Format |
|-------|--------|
| p < 0.0001 | "<0.0001" |
| p < 0.001 | 4 decimal places |
| p < 0.01 | 3 decimal places |
| p >= 0.01 | 2 decimal places |
| null | em dash |

**Effect size color scale:**
| Threshold | Class |
|-----------|-------|
| |d| >= 1.2 | `text-red-600 font-semibold` |
| |d| >= 0.8 | `text-red-500 font-medium` |
| |d| >= 0.5 | `text-amber-600` |
| |d| >= 0.2 | `text-amber-500` |
| |d| < 0.2 | `text-muted-foreground` |

**Row interactions:**
- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on endpoint_label + sex)
- Click: sets selection (`endpoint_label`, `sex`, `domain`, `organ_system`). Click again to deselect.
- Selection syncs with chart and context panel.
- Row cells: `px-2 py-1`

**Row cap:** First 200 rows rendered. If more, shows: "Showing first 200 of {N} rows. Use filters to narrow results." — `p-2 text-center text-[10px] text-muted-foreground`

**Empty state:** No explicit empty state — grid shows zero rows with just headers.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/dose-response`, shows `DoseResponseContextPanel`.

### No Selection State
- Message: "Select an endpoint from the grid or chart to view dose-response details."
- `p-4 text-xs text-muted-foreground`

### With Selection

#### Header
- `border-b px-4 py-3`
- Endpoint label: `text-sm font-semibold`
- Subtitle: "{domain} . {organ_system}" (underscores replaced with spaces), optionally " . {sex}" if sex is set
- `text-xs text-muted-foreground`

#### Pane 1: Insights (default open)
`CollapsiblePane` with `InsightsList` component.
- Rules filtered to those matching the selected domain/endpoint
- Same InsightsList rendering as described in study-summary.md (tier pills, organ groups, synthesized signals, correlation chips, expandable raw rules)

#### Pane 2: Pairwise detail (default open)
Shows all dose-level rows for the selected endpoint, sorted by dose_level ascending.

**Table:** `w-full text-[10px]`

| Column | Header | Alignment | Rendering |
|--------|--------|-----------|-----------|
| Dose | dose_label (first part before comma) | Left | Plain text |
| Sex | sex | Left | Plain text |
| Mean | mean | Right | `font-mono`, 2 decimals, em dash if null |
| p | p_value | Right | `font-mono`, p-value color coded |
| Effect | effect_size | Right | `font-mono`, 2 decimals, em dash if null |

- Header row: `border-b text-muted-foreground`, `pb-0.5 font-medium`
- Data rows: `border-b border-dashed`, cells `py-0.5`
- Empty state: "No pairwise data." in `text-[11px] text-muted-foreground`
- If sex filter is active, only that sex's rows shown

#### Pane 3: Tox Assessment (default open)
`ToxFindingForm` component — same as study-summary.md:
- Treatment related dropdown, adversity dropdown (grayed when treatment="No"), comment textarea, SAVE button
- Keyed by `endpointLabel` (the selected endpoint)

#### Pane 4: Related views (default closed)
Cross-view navigation links in `text-[11px]`:
- "View target organ: {organ_system}" (only if organ_system present) — navigates to `/studies/{studyId}/target-organs`
- "View histopathology" — navigates to `/studies/{studyId}/histopathology`
- "View NOAEL decision" — navigates to `/studies/{studyId}/noael-decision`
- All links: `block hover:underline`, color `#3a7bd5`, arrow suffix

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Filters | Local | `useState<Filters>` — endpoint, sex, data_type, organ_system |
| Endpoint search | Local | `useState<string>` — search input text |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "dose-response"` tag |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state |
| Dose-response data | Server | `useDoseResponseMetrics` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (consumed by context panel) |

---

## Data Flow

```
useDoseResponseMetrics(studyId)  ──> drData (1342 rows)
                                          |
                                     [client-side filter]
                                          |
                                     filteredData
                                      /        \
                               Recharts chart   Metrics grid
                                      \        /
                                   DoseResponseSelection (shared)
                                          |
                               DoseResponseContextPanel
                                    /     |      \
                              Insights  Pairwise  ToxAssessment
```

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Context panel > Related views | Click "View target organ" | `/studies/{studyId}/target-organs` |
| Context panel > Related views | Click "View histopathology" | `/studies/{studyId}/histopathology` |
| Context panel > Related views | Click "View NOAEL decision" | `/studies/{studyId}/noael-decision` |

**Missing cross-view links (potential improvement):**
- No link back to Study Summary from this view
- Related views pane is default-closed, easy to miss
- No endpoint filter is passed when navigating to other views

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading dose-response data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No endpoint selected | "Select an endpoint from the grid or filter to view the dose-response chart." in chart area |
| >200 filtered rows | Truncation message below grid |

---

## Current Issues / Improvement Opportunities

### Charts
- Chart height fixed at 200px — may be too short for detailed analysis
- No visual indicator of significance thresholds on the chart (e.g., horizontal reference lines)
- Error bars use raw SD, not SEM — could mislead statistical interpretation
- No dose-response curve fitting or trend line overlay
- No control group highlighting or baseline reference line
- Categorical bar chart Y-axis always 0-1 even if incidence is low

### Filter Bar
- Endpoint search dropdown capped at 50 results — no scroll indicator if there are more matches
- No "clear all filters" button
- No filter state persistence across navigation

### Grid
- No pagination — first 200 rows hardcoded cap
- Dose label shows only first part before comma — may lose information
- No column visibility toggle
- No "group by endpoint" or "group by organ" option
- Sex column has no color coding (unlike Study Summary grid)

### Context Panel
- Pairwise detail table is minimal — no incidence column, no N column, no pattern column
- InsightsList rule filtering uses loose text matching (`output_text.toLowerCase().includes(...)`) — could produce false matches
- Related views pane is default-closed — users may not discover navigation links
- No back-link to Study Summary
- Tox Assessment is default-open here (unlike Study Summary where it's default-closed) — inconsistent

### General
- No keyboard navigation (arrow keys in grid)
- No export option for chart or grid data
- No responsive behavior for the side-by-side chart layout on narrow screens
