# Adverse Effects View

**Route:** `/studies/:studyId/analyses/adverse-effects`
**Component:** `AdverseEffectsView.tsx` (no wrapper -- uses its own contexts)
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

The view itself is a traditional page-style layout with padding `p-6`:

```
+-----------------------------------------------------------+
|  Adverse Effects                                           |
|  {studyId}                                                 |  <-- h1 + subtitle
+-----------------------------------------------------------+
|  [N adverse] [N warning] [N normal]  {total} total        |  <-- summary badges
+-----------------------------------------------------------+
|  [Domain v] [Sex v] [Severity v] [Search findings...]     |  <-- filter bar (shadcn components)
+-----------------------------------------------------------+
|                                                           |
|  Findings table (dynamic columns: fixed + per-dose-group)  |
|                                                           |
+-----------------------------------------------------------+
|  [Pagination: page X of Y, rows per page selector]        |
+-----------------------------------------------------------+
```

---

## Header

`mb-4`

- Title: `text-2xl font-bold` -- "Adverse Effects"
- Subtitle: `text-sm text-muted-foreground` -- study ID

---

## Summary Badges

`mb-4 flex items-center gap-2 text-xs`

Only shown when data is loaded. Three severity badges plus a total count:

| Badge | Classes |
|-------|---------|
| Adverse | `rounded-sm border border-red-200 bg-red-50 px-1.5 py-0.5 font-medium text-red-700` |
| Warning | `rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700` |
| Normal | `rounded-sm border border-green-200 bg-green-50 px-1.5 py-0.5 font-medium text-green-700` |

**Total count:** `ml-1 text-muted-foreground` -- "{total} total"

---

## Filter Bar

`mb-4 flex flex-wrap items-center gap-2`

Uses **shadcn/ui Select and Input** components (not native `<select>`).

| Filter | Type | Control | Width | Default |
|--------|------|---------|-------|---------|
| Domain | Dropdown | shadcn `<Select>` with "All domains" + LB/BW/OM/MI/MA/CL | `w-[100px]`, `h-8` | All |
| Sex | Dropdown | shadcn `<Select>` with "All" / Male / Female | `w-[80px]`, `h-8` | All |
| Severity | Dropdown | shadcn `<Select>` with "All severity" / Adverse / Warning / Normal | `w-[110px]`, `h-8` | All |
| Search | Text input | shadcn `<Input>` with "Search findings..." placeholder | `w-[200px]`, `h-8` | Empty |

**Filter change behavior:** Changing any filter resets to page 1 and clears the finding selection.

---

## Findings Table

### Structure
Plain HTML `<table>` with `w-full text-xs`, no TanStack sorting (data comes server-sorted).

### Header Row
`border-b bg-muted/50`
Headers: `px-2 py-1.5 text-left font-medium` (or `text-right` / `text-center` for numeric/icon columns)

### Fixed Columns (Left)

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| domain | Domain | Left | Colored badge: `rounded px-1.5 py-0.5 text-[10px] font-medium` with domain-specific bg/text colors |
| finding | Finding | Left | `max-w-[200px] truncate`, `title` tooltip for full name. If specimen exists: "{specimen}: {finding}" with specimen in `text-muted-foreground` |
| sex | Sex | Left | Plain text |
| day | Day | Left | `text-muted-foreground`, em dash if null |

### Dynamic Dose-Group Columns (Center)

One column per dose group (from `data.dose_groups` array), rendered dynamically.

- **Header:** dose value + unit (e.g., "0 mg/kg/day"), or dose label if no value. `text-right`, with `title` tooltip showing label.
- **Cell:** `text-right font-mono`
  - Continuous: mean value `.toFixed(2)`, em dash if null
  - Categorical: "{affected}/{n}", em dash if null

### Fixed Columns (Right)

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| min_p_adj | p-value | Right | `font-mono` with p-value color classes |
| trend_p | Trend | Right | `font-mono` with p-value color classes |
| direction | Dir | Center | `text-sm`, direction symbol with color (see below) |
| max_effect_size | Effect | Right | `font-mono` with effect size color classes |
| severity | Severity | Center | `rounded-sm px-1.5 py-0.5 text-[10px] font-medium` badge with severity classes |

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

### Direction Symbols

| Symbol | Meaning |
|--------|---------|
| up arrow | Increased |
| down arrow | Decreased |
| em dash | No change / not applicable |

### P-value Color Scale (text classes)

| Threshold | Class |
|-----------|-------|
| p < 0.001 | `text-red-600 font-semibold` |
| p < 0.01 | `text-red-500 font-medium` |
| p < 0.05 | `text-amber-600 font-medium` |
| p < 0.1 | `text-amber-500` |
| p >= 0.1 | `text-muted-foreground` |

### Effect Size Color Scale

| Threshold | Class |
|-----------|-------|
| |d| >= 1.2 | `text-red-600 font-semibold` |
| |d| >= 0.8 | `text-red-500 font-medium` |
| |d| >= 0.5 | `text-amber-600` |
| |d| >= 0.2 | `text-amber-500` |
| |d| < 0.2 | `text-muted-foreground` |

### Row Interactions

- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on finding ID)
- Click: selects finding via `FindingSelectionContext`. Click again to deselect.
- Row cells: `px-2 py-1`

---

## Pagination

Uses `DataTablePagination` component below the table.

- Default page size: 50
- Shows: page number, total pages, total rows
- Page navigation: previous/next
- Page size selector: dropdown

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches `/studies/{studyId}/analyses/adverse-effects`, shows `AdverseEffectsContextPanel` (uses `FindingSelectionContext`).

### No Selection State
- Header: `text-sm font-semibold` -- "Adverse Effects"
- Message: "Select a finding row to view detailed analysis."
- `p-4 text-xs text-muted-foreground`

### Loading State
- `Skeleton` components: h-4, h-20 x3
- `space-y-3 p-4`

### With Selection

#### Header
- `border-b px-4 py-2`
- Finding name: `text-sm font-semibold`
- Subtitle: "{domain} | {sex} | Day {day}" (or "Terminal") in `text-[10px] text-muted-foreground`

#### Pane 1: Treatment Summary (default open)
`TreatmentRelatedSummaryPane` component -- shows treatment-relatedness assessment.

#### Pane 2: Statistics (default open)
`StatisticsPane` component -- key statistical metrics.

#### Pane 3: Dose Response (default closed)
`DoseResponsePane` component -- dose-response relationship details.

#### Pane 4: Correlations (default closed)
`CorrelationsPane` component -- correlated findings.

#### Pane 5: Effect Size (default closed)
`EffectSizePane` component -- effect size analysis.

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

---

## Data Flow

```
useAdverseEffects(studyId, page, pageSize, filters)
    --> { findings, dose_groups, summary, page, total_pages, total_findings }
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
| Loading | Skeleton rows: 1 h-10 header + 10 h-8 body rows |
| Error | `p-6 text-destructive` -- "Failed to load analysis: {message}" |
| No data | Table renders but with no rows |

---

## Current Issues / Improvement Opportunities

### Table
- No client-side sorting (data comes pre-sorted from server)
- Dynamic dose-group columns make the table very wide -- no horizontal scroll indicator
- Finding name truncated at 200px max-width -- may be too aggressive
- No column visibility toggle
- No row grouping by domain or organ system

### Filter Bar
- Uses shadcn/ui Select (different from other views which use native `<select>`) -- inconsistent UI
- No "clear all" button
- Search is debounced server-side but no loading indicator during search

### Context Panel
- Context data loaded via separate API call -- adds latency when selecting a finding
- 5 panes may be overwhelming -- Treatment Summary and Statistics overlap
- No cross-view links to the pre-generated analysis views
- No ToxFindingForm for annotation

### Pagination
- Only previous/next navigation -- no jump to specific page
- Page size options not visible in the description

### General
- This is the only view that uses server-side filtering -- mental model differs from other views
- No keyboard navigation
- No export option
- Summary badges are static from the response -- don't update as filters change
