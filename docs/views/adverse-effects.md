# Adverse Effects View

**Route:** `/studies/:studyId/adverse-effects` (primary), `/studies/:studyId/analyses/adverse-effects` (legacy redirect)
**Wrapper:** `AdverseEffectsViewWrapper.tsx` (in `components/analysis/findings/`) — sets `useRailModePreference("organ")`, renders `AdverseEffectsView`
**Component:** `AdverseEffectsView.tsx` (in `components/analysis/findings/`)
**Scientific question:** "What are all the findings and how do they compare across dose groups?"
**Role:** Dynamic server-side adverse effects analysis. Sortable, resizable findings table with per-dose-group values, client-side sorting, and detailed finding context panel.

**Key difference from other views:** This view uses **server-side filtering** (not pre-generated JSON). Data is fetched from `/api/studies/{studyId}/analyses/adverse-effects` with all results loaded at once (page=1, pageSize=10000). Sorting is client-side via TanStack React Table.

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

The view itself uses a flex column layout (`flex h-full flex-col overflow-hidden`) with no page-level padding:

```
+-----------------------------------------------------------+
|  Domain [v] Sex [v] Class [v] [Search…]  N adv N wrn N nrm  {total} total |  <-- FilterBar with inline badges
+-----------------------------------------------------------+
|                                                           |
|  Findings table (TanStack React Table)                     |
|  (flex-1 overflow-auto, fills remaining space)             |
|                                                           |
+-----------------------------------------------------------+
```

No header (title/subtitle) section. No pagination.

---

## Filter Bar

Uses the shared `FilterBar` container component: `flex items-center gap-2 border-b bg-muted/30 px-4 py-2`.

Inside the FilterBar, `FindingsFilterBar` renders the filter controls, followed by inline summary badges and a total count (only shown when data is loaded).

### Filter Controls

`FindingsFilterBar` component (`components/analysis/FindingsFilterBar.tsx`): renders native `<select>` elements via `FilterSelect` (from `@/components/ui/FilterBar`). `FilterSelect` applies the design-token class `filter.select` = `h-5 rounded border bg-background px-1 text-[10px] text-muted-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary`. Filters are rendered as bare `FilterSelect` components without label wrappers -- the default option text serves as the label.

The filter controls are wrapped in `flex flex-wrap items-center gap-3`.

| Filter | Control | Options | Default |
|--------|---------|---------|---------|
| Domain | `FilterSelect` (native `<select>`) | "All domains" + LB / BW / OM / MI / MA / CL | All domains |
| Sex | `FilterSelect` (native `<select>`) | "All sexes" / Male / Female | All sexes |
| Classification | `FilterSelect` (native `<select>`) | "All classifications" / Adverse / Warning / Normal | All classifications |
| Search | Native `<input>` with placeholder "Search findings..." | Free text | Empty |

The search input uses classes: `rounded border bg-background px-2 py-0.5 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary`.

### Inline Summary Badges

Three classification count badges rendered after the filter controls inside the same FilterBar. All use uniform neutral styling (categorical identity, not signal color):

| Badge | Classes |
|-------|---------|
| adverse | `rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground` |
| warning | `rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground` |
| normal | `rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground` |

**Total count:** `FilterBarCount` component — `ml-auto text-[10px] text-muted-foreground` — "{total_findings} total". Pushed to the right edge of the FilterBar via `ml-auto`.

**Filter change behavior:** Changing any filter clears the finding selection (via `useEffect` on `filters`).

---

## Findings Table

### Structure

TanStack React Table (`useReactTable`) with client-side sorting and column resizing. Table element: `<table>` with `w-full text-[10px]`. Wrapped in `h-full overflow-auto` (a flex child of the view that fills remaining vertical space).

### TanStack Table Features

- **Sorting:** Double-click a column header to toggle sort. Sort indicators `↑` (asc) / `↓` (desc) appended to header text. Session-persisted via `useSessionState("pcc.adverseEffects.sorting", [])`.
- **Column resizing:** Drag resize handle on column borders. Resize handle: `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none`. Shows `bg-primary` when actively resizing, `hover:bg-primary/30` otherwise. Session-persisted via `useSessionState("pcc.adverseEffects.columnSizing", {})`.
- **Content-hugging + absorber:** All columns except the "finding" column (the absorber) use `width: 1px; white-space: nowrap` so the browser shrinks them to fit content. The finding column uses `width: 100%` to absorb remaining space. Manual resize overrides with an explicit `width` + `maxWidth`.

### Header Row

- Wrapper `<thead>`: `sticky top-0 z-10 bg-background` (sticky header on vertical scroll)
- Row `<tr>`: `border-b bg-muted/30`
- Header cells `<th>`: `relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50`
- Sort trigger: `onDoubleClick` calls `header.column.getToggleSortingHandler()`

### Fixed Columns (Left)

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| domain | Domain | Left | `DomainLabel` component: colored text only, `text-[9px] font-semibold` with domain-specific text color from `getDomainBadgeColor().text`. No background, no border. |
| finding | Finding | Left (absorber) | `overflow-hidden text-ellipsis whitespace-nowrap` div with `title` tooltip for full name. If specimen exists: "{specimen}: {finding}" with specimen in `text-muted-foreground` |
| sex | Sex | Left | Plain text |
| day | Day | Left | `text-muted-foreground`, em dash if null |

### Dynamic Dose-Group Columns (Center)

One column per dose group (from `data.dose_groups` array), rendered dynamically. Column IDs: `dose_{dose_level}`.

- **Header:** `DoseHeader` component -- dose value + unit (e.g., "0 mg/kg/day"), or `formatDoseShortLabel(label)` if no value. Rendered via `DoseHeader` which shows the label text with a colored underline indicator (`h-0.5 w-full rounded-full` with color from `getDoseGroupColor(level)`).
- **Cell:** `font-mono`
  - Continuous: mean value `.toFixed(2)`, em dash if null
  - Incidence: "{affected}/{n}", em dash if null

### Fixed Columns (Right)

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| min_p_adj | P-value | Left | `ev font-mono text-muted-foreground` -- formatted via `formatPValue()`. Interaction-driven color via `ev` CSS class. |
| trend_p | Trend | Left | `ev font-mono text-muted-foreground` -- formatted via `formatPValue()`. Interaction-driven color via `ev` CSS class. |
| direction | Dir | Left | Direction-specific color via `getDirectionColor()` + symbol via `getDirectionSymbol()` (see below) |
| max_effect_size | Effect | Left | `ev font-mono text-muted-foreground` -- formatted via `formatEffectSize()`. Interaction-driven color via `ev` CSS class. |
| severity | Severity | Left | Left-border badge: `inline-block border-l-2 pl-1.5 py-0.5 font-semibold text-gray-600` with colored left border from `getSeverityDotColor()` via inline `style` |

**Note on p-value and effect-size columns:** Both p-value, trend, and effect-size cells use the `ev` CSS class for interaction-driven color: neutral `text-muted-foreground` at rest, `#DC2626` on row hover/selection. The `data-evidence=""` attribute is set on every `<td>`.

**Note on severity badges:** The severity column uses a left-border badge with `getSeverityDotColor()` providing the `borderLeftColor` via inline style: adverse = `#dc2626`, warning = `#d97706`, normal = `#16a34a`. The text label is always gray (`text-gray-600`).

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
- Selected: `bg-accent font-medium` (matched on finding ID), also sets `data-selected` attribute
- Click: selects finding via `FindingSelectionContext`. Click again to deselect (toggles to `null`).
- Row cells: `px-1.5 py-px`
- Row base: `cursor-pointer border-b transition-colors`

### Empty State

When `findings.length === 0`, a message is shown below the table: `p-4 text-center text-xs text-muted-foreground` — "No findings match the current filters."

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches regex `/\/studies\/[^/]+\/(analyses\/)?adverse-effects/`, shows `AdverseEffectsContextPanel` (uses `FindingSelectionContext`). This regex matches both the primary `/adverse-effects` path and the legacy `/analyses/adverse-effects` path.

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

#### Pane 6: Related views (default closed)
Navigation links to other views. Explicitly passed `defaultOpen={false}`. Contains 4 links:

| Link Text | Target Route |
|-----------|-------------|
| View histopathology → | `/studies/{studyId}/histopathology` |
| View dose-response → | `/studies/{studyId}/dose-response` |
| View NOAEL decision → | `/studies/{studyId}/noael-decision` |
| View study summary → | `/studies/{studyId}` |

Links: `block text-[11px] text-primary hover:underline`, use `<a href="#">` with `onClick` handler calling `navigate()`. Wrapped in `space-y-1`.

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
| Filters | Local | `useState<AdverseEffectsFilters>` -- domain, sex, severity, search |
| Finding selection | Shared via context | `FindingSelectionContext` -- syncs table and context panel |
| Study selection | Shared via context | `SelectionContext` -- synced on mount |
| Table sorting | Session-persisted | `useSessionState<SortingState>("pcc.adverseEffects.sorting", [])` |
| Column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.adverseEffects.columnSizing", {})` |
| Findings data | Server | `useAdverseEffects(studyId, 1, 10000, filters)` hook (React Query, 5 min stale) |
| Finding context | Server | `useFindingContext(studyId, findingId)` hook -- loaded on selection |
| Collapse all | Local (context panel) | `useCollapseAll()` hook -- provides expandGen/collapseGen counters |
| Rail mode | Shared | `useRailModePreference("organ")` -- set by wrapper |

---

## Data Flow

```
useAdverseEffects(studyId, 1, 10000, filters)
    --> { findings, dose_groups, summary, ... }
                                  |
                            FindingsTable (TanStack)
                                  |
                          FindingSelectionContext
                                  |
                    useFindingContext(studyId, findingId)
                          --> context data
                                  |
                     AdverseEffectsContextPanel
                      /     |      |      \      \       \
                    TR   Stats   D-R   Corr   Effect   Related
```

---

## Cross-View Navigation

The "Related views" pane in the context panel provides navigation links to:
- Histopathology view
- Dose-response view
- NOAEL decision view
- Study summary view

All links use `react-router-dom` `navigate()` for client-side navigation.

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Skeleton rows: 1 `h-10 w-full` header + 10 `h-8 w-full` body rows, in `space-y-2 p-4` |
| Error | `p-6 text-destructive` -- "Failed to load analysis: {message}" |
| Empty | "No findings match the current filters." (`p-4 text-center text-xs text-muted-foreground`) |
