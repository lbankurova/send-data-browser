# Adverse Effects View

**Route:** `/studies/:studyId/analyses/adverse-effects`
**Component:** `AdverseEffectsView.tsx` (in `components/analysis/findings/`)
**Scientific question:** "What are all the findings and how do they compare across dose groups?"
**Role:** Dynamic server-side adverse effects analysis. Paginated findings table with per-dose-group values, server-side filtering, and detailed finding context panel.

**Key difference from other views:** This view uses **server-side pagination and filtering** (not pre-generated JSON). Data is fetched on each page/filter change from `/api/studies/{studyId}/analyses/adverse-effects`.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  Adverse Effects View      | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself is a traditional page-style layout with padding `p-4`:

```
+-----------------------------------------------------------+
|  Adverse Effects                                           |
|  {studyId}                                                 |  <-- h1 + subtitle
+-----------------------------------------------------------+
|  [N adverse] [N warning] [N normal]  {total} total        |  <-- summary badges (uniform gray)
+-----------------------------------------------------------+
|  Domain [v] Sex [v] Classification [v] [Search findings…] |  <-- filter bar (native <select> via FilterSelect)
+-----------------------------------------------------------+
|                                                           |
|  Findings table (dynamic columns: fixed + per-dose-group)  |
|  (horizontally scrollable via overflow-x-auto)             |
|                                                           |
+-----------------------------------------------------------+
|  {total} rows | Rows per page [v] | Page X of Y |◀◀ ◀ ▶ ▶▶|
+-----------------------------------------------------------+
```

---

## Header

`mb-3`

- Title: `text-base font-semibold` -- "Adverse Effects"
- Subtitle: `mt-0.5 text-xs text-muted-foreground` -- study ID

---

## Summary Badges

`mb-4 flex items-center gap-2 text-xs`

Only shown when data is loaded. Three classification badges plus a total count. All badges use **uniform gray styling** (categorical identity, not signal color):

| Badge | Classes |
|-------|---------|
| adverse | `rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600` |
| warning | `rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600` |
| normal | `rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600` |

**Total count:** `ml-1 text-muted-foreground` -- "{total_findings} total"

---

## Filter Bar

`flex flex-wrap items-center gap-3`

Wrapped in a `mb-4` container div. Uses `FindingsFilterBar` component, which renders native `<select>` elements via the `FilterSelect` component (from `@/components/ui/FilterBar`). `FilterSelect` applies the design-token class `filter.select` = `h-5 rounded border bg-background px-1 text-[10px] text-muted-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary`. Each filter is wrapped in a `<label>` with classes `flex items-center gap-1.5 text-xs text-muted-foreground`.

| Filter | Label Text | Control | Options | Default |
|--------|-----------|---------|---------|---------|
| Domain | "Domain" | `FilterSelect` (native `<select>`) | "All" + LB / BW / OM / MI / MA / CL | All |
| Sex | "Sex" | `FilterSelect` (native `<select>`) | "All" / Male / Female | All |
| Classification | "Classification" | `FilterSelect` (native `<select>`) | "All" / Adverse / Warning / Normal | All |
| Search | -- | Native `<input>` with placeholder "Search findings..." | Free text | Empty |

The search input uses classes: `rounded border bg-background px-2 py-0.5 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary`.

**Filter change behavior:** Changing any filter resets to page 1 and clears the finding selection.

---

## Findings Table

### Structure
Plain HTML `<table>` with `w-full text-xs`, wrapped in `overflow-x-auto` for horizontal scrolling. No TanStack sorting (data comes server-sorted).

### Header Row
- Wrapper `<thead>`: `sticky top-0 z-10 bg-background` (sticky header on vertical scroll)
- Row `<tr>`: `border-b bg-muted/30`
- Header cells `<th>`: `px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` (or `text-right` / `text-center` for numeric/icon columns)

### Fixed Columns (Left)

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| domain | Domain | Left | `DomainLabel` component: colored text only, `text-[9px] font-semibold` with domain-specific text color from `getDomainBadgeColor().text`. No background, no border. |
| finding | Finding | Left | `max-w-[200px] truncate`, `title` tooltip for full name. If specimen exists: "{specimen}: {finding}" with specimen in `text-muted-foreground` |
| sex | Sex | Left | Plain text |
| day | Day | Left | `text-muted-foreground`, em dash if null |

### Dynamic Dose-Group Columns (Center)

One column per dose group (from `data.dose_groups` array), rendered dynamically.

- **Header:** dose value + unit (e.g., "0 mg/kg/day"), or dose label if no value. `text-right`, with `title` tooltip showing label.
- **Cell:** `text-right font-mono`
  - Continuous: mean value `.toFixed(2)`, em dash if null
  - Incidence: "{affected}/{n}", em dash if null

### Fixed Columns (Right)

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| min_p_adj | p-value | Right | `font-mono text-muted-foreground` -- formatted via `formatPValue()`. No color scale applied. |
| trend_p | Trend | Right | `font-mono text-muted-foreground` -- formatted via `formatPValue()`. No color scale applied. |
| direction | Dir | Center | `text-sm` with direction-specific color via `getDirectionColor()` (see below) |
| max_effect_size | Effect | Right | `font-mono text-muted-foreground` -- formatted via `formatEffectSize()`. No color scale applied. |
| severity | Severity | Center | `inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-semibold` with uniform gray classes from `getSeverityBadgeClasses()` |

**Note on p-value and effect-size columns:** Although `getPValueColor()` and `getEffectSizeColor()` functions exist in `severity-colors.ts`, they are **not called** in the `FindingsTable` rendering. Both p-value and effect-size cells use a hardcoded `text-muted-foreground` class. The `data-evidence=""` attribute is set on the outer `<td>`, and the inner `<span>` uses class `ev font-mono text-muted-foreground`.

**Note on severity badges:** `getSeverityBadgeClasses()` returns uniform gray for all severity values (`bg-gray-100 text-gray-600 border-gray-200 border`). There is no color differentiation between adverse, warning, and normal.

### Domain Label Colors

The `DomainLabel` component renders text-only colored labels (no background) using `getDomainBadgeColor(domain).text`:

| Domain | Text Color |
|--------|-----------|
| LB | `text-blue-700` |
| BW | `text-emerald-700` |
| OM | `text-purple-700` |
| MI | `text-rose-700` |
| MA | `text-orange-700` |
| CL | `text-cyan-700` |
| DS | `text-indigo-700` |
| FW | `text-teal-700` |
| Other | `text-gray-700` |

### Direction Symbols and Colors

| Direction | Symbol | Color Class |
|-----------|--------|------------|
| up | ↑ | `text-red-500` |
| down | ↓ | `text-blue-500` |
| null/other | — | `text-muted-foreground` |

### P-value Formatting (`formatPValue`)

| Threshold | Format |
|-----------|--------|
| p < 0.0001 | "<0.0001" |
| p < 0.001 | `.toFixed(4)` |
| p < 0.01 | `.toFixed(3)` |
| p >= 0.01 | `.toFixed(2)` |
| null | "—" |

### Effect Size Formatting (`formatEffectSize`)

| Value | Format |
|-------|--------|
| non-null | `.toFixed(2)` |
| null | "—" |

### Row Interactions

- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on finding ID), also sets `data-selected` attribute
- Click: selects finding via `FindingSelectionContext`. Click again to deselect.
- Row cells: `px-2 py-1`
- Row base: `cursor-pointer border-b transition-colors`

---

## Pagination

Uses `DataTablePagination` component below the table.

- Default page size: 50
- Page size options: 25, 50, 100, 250 (via shadcn `Select` dropdown)
- Shows: total row count (left), "Rows per page" selector, "Page X of Y" text, and 4 navigation buttons (right)
- **Navigation buttons** (all `variant="outline" size="icon"` with `h-8 w-8`):
  - First page (`ChevronsLeft` icon) -- disabled when on page 1
  - Previous page (`ChevronLeft` icon) -- disabled when on page 1
  - Next page (`ChevronRight` icon) -- disabled when on last page
  - Last page (`ChevronsRight` icon) -- disabled when on last page
- Layout: `flex items-center justify-between py-4`

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches `/studies/{studyId}/analyses/adverse-effects`, shows `AdverseEffectsContextPanel` (uses `FindingSelectionContext`).

### No Selection State
- Header: `text-sm font-semibold` -- "Adverse Effects" (`<h3>` with `mb-2`)
- Message: "Select a finding row to view detailed analysis."
- `p-4 text-xs text-muted-foreground`

### Loading State
- `Skeleton` components: h-4 w-2/3, then h-20 w-full x3
- `space-y-3 p-4`

### With Selection

#### Header
- `border-b px-4 py-3`
- Row: `flex items-center justify-between`
- Finding name: `text-sm font-semibold` (`<h3>`)
- Expand/collapse all buttons: `CollapseAllButtons` component in the header row (right side)
  - Expand all: `ChevronsUpDown` icon (h-3.5 w-3.5)
  - Collapse all: `ChevronsDownUp` icon (h-3.5 w-3.5)
  - Button classes: `rounded p-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground`
- Subtitle: "{domain} | {sex} | Day {day}" (or "Terminal" if day is null) in `text-[10px] text-muted-foreground`

#### Pane 1: Treatment summary (default open)
`TreatmentRelatedSummaryPane` component -- shows treatment-relatedness assessment.

#### Pane 2: Statistics (default open)
`StatisticsPane` component -- key statistical metrics.

#### Pane 3: Dose response (default open)
`DoseResponsePane` component -- dose-response relationship details. No `defaultOpen` prop passed, so it inherits the `CollapsiblePane` default of `true` (open).

#### Pane 4: Correlations (default closed)
`CorrelationsPane` component -- correlated findings. Explicitly passed `defaultOpen={false}`.

#### Pane 5: Effect size (default closed)
`EffectSizePane` component -- effect size analysis. Explicitly passed `defaultOpen={false}`.

#### Pane Rendering
All panes use the `CollapsiblePane` component:
- Toggle button: `flex w-full items-center gap-1 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50`
- Chevron icons: `h-3 w-3` (`ChevronDown` when open, `ChevronRight` when closed)
- Content area: `px-4 pb-3`
- Panes are separated by `border-b` (last pane has `last:border-b-0`)
- Panes respond to expand-all / collapse-all via generation counter (`expandAll` / `collapseAll` props)

**Note:** All context pane data comes from a separate API call: `/api/studies/{studyId}/analyses/adverse-effects/finding/{findingId}`.

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Page | Local | `useState<number>` -- resets to 1 on filter change |
| Page size | Local | `useState<number>` -- default 50 |
| Filters | Local | `useState<AdverseEffectsFilters>` -- domain, sex, severity, search |
| Finding selection | Shared via context | `FindingSelectionContext` -- syncs table and context panel |
| Study selection | Shared via context | `SelectionContext` -- synced on mount |
| Findings data | Server | `useAdverseEffects(studyId, page, pageSize, filters)` hook (React Query) |
| Finding context | Server | `useFindingContext(studyId, findingId)` hook -- loaded on selection |
| Collapse all | Local (context panel) | `useCollapseAll()` hook -- provides expandGen/collapseGen counters |

---

## Data Flow

```
useAdverseEffects(studyId, page, pageSize, filters)
    --> { findings, dose_groups, summary, page, page_size, total_pages, total_findings }
                                  |
                            FindingsTable + DataTablePagination
                                  |
                          FindingSelectionContext
                                  |
                    useFindingContext(studyId, findingId)
                          --> context data
                                  |
                     AdverseEffectsContextPanel
                      /     |      |      \      \
                    TR   Stats   D-R   Corr   Effect
```

---

## Cross-View Navigation

No direct cross-view links from this view's context panel (unlike the pre-generated analysis views).

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Skeleton rows: 1 `h-10 w-full` header + 10 `h-8 w-full` body rows, in `space-y-2` |
| Error | `p-6 text-destructive` -- "Failed to load analysis: {message}" |
| No data | Table renders but with no rows |
