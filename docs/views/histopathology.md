# Histopathology View

**Route:** `/studies/:studyId/histopathology`
**Component:** `HistopathologyView.tsx` (wrapped by `HistopathologyViewWrapper.tsx`)
**Scientific question:** "What are the microscopic findings and how severe are they across dose groups?"
**Role:** Histopathology-specific analysis. Severity heatmap + lesion detail grid for microscopic findings.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  Histopathology View       | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself is a single scrollable column with three sections:

```
+-----------------------------------------------------------+
| [Specimen v] [Sex v] [Min severity v]    {N of M rows}   |  <-- filter bar, border-b, bg-muted/30
+-----------------------------------------------------------+
|                                                           |
|  Severity Heatmap ({N} findings)                          |
|  Finding labels (w-52) x dose columns (w-20 each)        |
|  [Legend: Minimal > Mild > Moderate > Marked > Severe]    |
|                                                           |
+-----------------------------------------------------------+  <-- border-b
|                                                           |
|  Lesion Severity Summary ({N} rows)                       |
|  TanStack table, 10 columns, first 200 rows              |
|                                                           |
+-----------------------------------------------------------+
```

---

## Filter Bar

`flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2`

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Specimen | Dropdown | `<select>` with "All specimens" + unique specimen values | All |
| Sex | Dropdown | `<select>` with "All sexes" / Male / Female | All |
| Min severity | Dropdown | `<select>` with "Min severity: any" / "1+" / "2+" / "3+" | Any (0) |

**Row count indicator:** Right-aligned `ml-auto`, `text-[10px] text-muted-foreground`, shows "{filtered} of {total} rows".

### All controls styling
- All controls: `rounded border bg-background px-2 py-1 text-xs`

---

## Severity Heatmap

Only shown when `heatmapData` exists and findings.length > 0.

Container: `border-b p-4`

### Section Header
`text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2` — shows "Severity heatmap ({N} findings)"

### Heatmap Structure

`overflow-x-auto` > `inline-block` — horizontal scrollable flex layout.

**Header row:** `flex`
- Finding label column: `w-52 shrink-0` (empty header cell)
- Dose columns: each `w-20 shrink-0 text-center text-[10px] font-medium text-muted-foreground`, shows dose label (first part before comma)
- Dose levels sorted ascending

**Data rows:** Each finding is a `flex` row
- `cursor-pointer border-t hover:bg-accent/20`
- Selected finding: `ring-1 ring-primary`
- Finding label: `w-52 shrink-0 truncate py-1 pr-2 text-[10px]`, `title` tooltip, truncated at 40 characters with ellipsis

**Data cells:** Each cell `flex h-6 w-20 shrink-0 items-center justify-center`
- If cell exists: colored box `flex h-5 w-16 items-center justify-center rounded-sm text-[9px] font-medium` with severity heat color background, text shows "{affected}/{n}"
- If no cell: empty gray placeholder `h-5 w-16 rounded-sm bg-gray-100`

**Tooltip:** `title` attribute on each cell: "Severity: {avg_severity.toFixed(1)}, Incidence: {affected}/{n}"

### Severity Heat Color Scale

| Avg Severity | Color | Label |
|-------------|-------|-------|
| >= 4 | `#E57373` | Severe |
| >= 3 | `#FF8A65` | Marked |
| >= 2 | `#FFB74D` | Moderate |
| >= 1 | `#FFE0B2` | Mild |
| < 1 | `#FFF9C4` | Minimal |

### Aggregation Behavior

Cells aggregate across sexes:
- Affected counts summed across sexes
- N summed across sexes
- Incidence recalculated as affected / n
- avg_severity takes max across sexes

### Finding Cap

First 40 findings shown, sorted by max avg_severity descending. If more findings exist, shows "+{remaining} more findings..." below the heatmap in `py-1 text-[10px] text-muted-foreground`.

### Row Interactions

- Clicking a finding row selects it (finds first matching data row for that finding to get specimen)
- Click same row again to deselect
- Selection syncs with grid and context panel

### Legend

`mt-2 flex items-center gap-1 text-[10px] text-muted-foreground`

- "Severity:" label
- Five color swatches, each: `flex items-center gap-0.5` with `inline-block h-3 w-3 rounded-sm` colored box + label text

| Swatch | Color | Label |
|--------|-------|-------|
| 1 | `#FFF9C4` | Minimal |
| 2 | `#FFE0B2` | Mild |
| 3 | `#FFB74D` | Moderate |
| 4 | `#FF8A65` | Marked |
| 5 | `#E57373` | Severe |

---

## Lesion Severity Grid

### Section Header
`flex items-center justify-between px-4 pt-3 pb-1`
- Title: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Shows: "Lesion severity summary ({N} rows)"

### Table
TanStack React Table, `w-full text-xs`, client-side sorting.

**Header row:** `border-b bg-muted/50`
- Headers: `cursor-pointer px-2 py-1.5 text-left font-medium hover:bg-accent/50`
- Clickable for sorting (shows triangle arrow: `▲` asc / `▼` desc)

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| finding | Finding | Truncated at 25 chars with ellipsis, `title` tooltip for full name |
| specimen | Specimen | `text-muted-foreground`, truncated at 20 chars with ellipsis, `title` tooltip for full name |
| domain | Domain | Plain text |
| dose_level | Dose | `text-muted-foreground`, shows `dose_label.split(",")[0]` |
| sex | Sex | Plain text |
| n | N | Plain number |
| affected | Affected | Plain number |
| incidence | Incidence | `font-mono`, `rounded px-1` with incidence background color, shows percentage `{(v*100).toFixed(0)}%`, em dash if null |
| avg_severity | Avg sev | `font-mono text-[10px]`, `rounded px-1.5 py-0.5` with severity heat color background, shows `v.toFixed(1)`, em dash if null |
| severity | Severity | `rounded-sm px-1.5 py-0.5 text-[10px] font-medium` badge with severity classes |

**Severity badge classes:**

| Class | Meaning |
|-------|---------|
| adverse (red) | Adverse severity |
| warning (amber) | Warning-level severity |
| normal (green) | Normal / minimal severity |

**Incidence background color:**

| Threshold | Color |
|-----------|-------|
| >= 0.8 | `rgba(239,68,68,0.15)` |
| >= 0.5 | `rgba(249,115,22,0.1)` |
| >= 0.2 | `rgba(234,179,8,0.08)` |
| < 0.2 | `transparent` |

**Row interactions:**
- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on finding + specimen)
- Click: sets selection (finding, specimen, sex). Click again to deselect.
- Selection syncs with heatmap and context panel.
- Row cells: `px-2 py-1`

**Row cap:** First 200 rows rendered. If more, shows: "Showing first 200 of {N} rows. Use filters to narrow results." — `p-2 text-center text-[10px] text-muted-foreground`

**Empty state:** No explicit empty state — grid shows zero rows with just headers.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/histopathology`, shows `HistopathologyContextPanel`.

### No Selection State
- Message: "Select a finding from the heatmap or grid to view details."
- `p-4 text-xs text-muted-foreground`

### With Selection

#### Header
- `border-b px-4 py-3`
- Finding name: `text-sm font-semibold`
- Specimen: `text-xs text-muted-foreground`

#### Pane 1: Pathology review (default open)
`PathologyReviewForm` component. Only shown when studyId is available.

**Fields:**

| Field | Control | Details |
|-------|---------|---------|
| Peer review status | Dropdown | Options: Not Reviewed / Agreed / Disagreed / Deferred |
| Revised severity | Dropdown | Options: Minimal / Mild / Moderate / Marked / Severe / N/A. Disabled (`opacity-40`) unless peer review status is "Disagreed" |
| Revised diagnosis | Text input | Placeholder "Revised diagnosis...". Disabled unless peer review status is "Disagreed" |
| Comment | Textarea (2 rows) | Placeholder "Notes..." |
| SAVE button | Button | `bg-primary text-primary-foreground`, disabled when no changes or saving |

- Footer: pathologist name + date if previously saved
- All fields: `text-[11px]`, labels `mb-0.5 block font-medium text-muted-foreground`
- All controls: `w-full rounded border bg-background px-2 py-1 text-[11px]`

#### Pane 2: Dose detail (default open)
Shows all dose-level rows for the selected finding + specimen, sorted by dose_level ascending then sex.

**Table:** `w-full text-[10px]`

| Column | Header | Alignment | Rendering |
|--------|--------|-----------|-----------|
| Dose | dose_label (first part) | Left | Plain text |
| Sex | sex | Left | Plain text |
| Incid. | affected/n | Right | `font-mono` |
| Avg Sev | avg_severity | Right | `rounded px-1 font-mono text-[9px]` with severity heat color background, `.toFixed(1)`, em dash if null |
| Sev | severity | Center | `rounded-sm px-1 py-0.5 text-[9px] font-medium` badge with severity classes |

- Header row: `border-b text-muted-foreground`, `pb-0.5 font-medium`
- Data rows: `border-b border-dashed`, cells `py-0.5`
- Empty state: "No data." in `text-[11px] text-muted-foreground`

#### Pane 3: Insights (default open)
`CollapsiblePane` with `InsightsList` component.
- Rules filtered by: finding name match in `output_text`, specimen name match in `output_text`, or specimen match in `context_key` (with spaces/commas replaced by underscores)

#### Pane 4: Correlating evidence (default closed)
Shows other findings in the same specimen (up to 10), sorted by max avg_severity descending.

Each item: `flex items-center justify-between text-[11px]`
- Finding label: truncated at 25 chars with `title` tooltip for full name
- Severity badge: `rounded px-1 font-mono text-[9px]` with severity heat color background, shows `maxSev.toFixed(1)`

Empty state: "No other findings in this specimen." in `text-[11px] text-muted-foreground`

#### Pane 5: Related views (default closed)
Cross-view navigation links in `text-[11px]`:
- "View target organs" — navigates to `/studies/{studyId}/target-organs`
- "View dose-response" — navigates to `/studies/{studyId}/dose-response`
- "View NOAEL decision" — navigates to `/studies/{studyId}/noael-decision`
- All links: `block hover:underline`, color `#3a7bd5`, arrow suffix

#### Pane 6: Tox Assessment (default closed)
`ToxFindingForm` component — standard treatment-related / adversity / comment form.
- Keyed by `selection.finding` (the selected finding)

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Filters | Local | `useState<Filters>` — specimen, sex, min_severity |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "histopathology"` tag |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state |
| Lesion data | Server | `useLesionSeveritySummary` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (consumed by context panel) |

---

## Data Flow

```
useLesionSeveritySummary(studyId)  ──> lesionData (728 rows)
                                            |
                                       [client-side filter by specimen, sex, min_severity]
                                            |
                                       filteredData
                                        /        \
                                Severity heatmap  Lesion grid
                                        \        /
                                    HistopathSelection (shared)
                                            |
                              HistopathologyContextPanel
                                /    |     |      \     \
                       PathReview  Dose  Insights  Corr  Tox
```

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Context panel > Related views | Click "View target organs" | `/studies/{studyId}/target-organs` |
| Context panel > Related views | Click "View dose-response" | `/studies/{studyId}/dose-response` |
| Context panel > Related views | Click "View NOAEL decision" | `/studies/{studyId}/noael-decision` |

**Missing cross-view links (potential improvement):**
- No link back to Study Summary from this view
- Related views pane is default-closed, easy to miss
- No finding or specimen filter is passed when navigating to other views
- No navigation from correlating evidence items to their detail

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading histopathology data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No heatmap data | Heatmap section simply not rendered |
| >200 filtered rows | Truncation message below grid |

---

## Current Issues / Improvement Opportunities

### Severity Heatmap
- Capped at 40 findings — no way to see or navigate to the rest
- Aggregates across sexes by default — no sex facet or toggle
- No column headers showing dose values (only labels)
- Cell text "{affected}/{n}" may be hard to read on colored background
- No tooltip with additional context (severity name, specimen)
- Finding labels truncated at 40 chars — could still overflow

### Lesion Grid
- No pagination — first 200 rows hardcoded cap
- No column visibility toggle
- No grouping by specimen or finding
- Domain column is plain text (no colored badge like in other views)
- avg_severity is null for 550/728 rows — shows em dash for most rows

### Context Panel
- PathologyReviewForm is prominently placed (first pane) which is good for pathologist workflow
- InsightsList rule matching is loose (text search in output_text) — could produce false matches
- Correlating evidence capped at 10
- Related views default-closed — users may not discover navigation links
- No navigation from correlating evidence items to their detail

### General
- No keyboard navigation (arrow keys in grid or heatmap)
- No export option for heatmap or grid data
- Severity color scale duplicated between view and context panel (local function, not shared)
- No responsive behavior for the heatmap layout on narrow screens
