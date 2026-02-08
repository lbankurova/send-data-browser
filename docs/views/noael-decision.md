# NOAEL Decision View

**Route:** `/studies/:studyId/noael-decision`
**Component:** `NoaelDecisionView.tsx` (wrapped by `NoaelDecisionViewWrapper.tsx`)
**Scientific question:** "What is the NOAEL and what are the dose-limiting adverse findings?"
**Role:** Decision-level summary. NOAEL determination banner, adversity matrix of endpoints x doses, and adverse effect detail grid.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  NOAEL Decision View       | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself is a single scrollable column with four sections:

```
+-----------------------------------------------------------+
|  NOAEL Determination                                       |
|  [Combined card] [Males card] [Females card]               |
+-----------------------------------------------------------+  <-- border-b, bg-muted/20
|  [Severity v] [Organ v] [Sex v] [TR v]   {N of M}        |  <-- filter bar
+-----------------------------------------------------------+
|                                                           |
|  Adversity Matrix ({N} endpoints)                         |
|  Endpoint labels (w-48) x dose columns (w-16 each)       |
|  [Legend: Adverse | Warning | Normal | N/A]               |
|                                                           |
+-----------------------------------------------------------+  <-- border-b
|                                                           |
|  Adverse Effect Summary ({N} rows)                        |
|  TanStack table, 11 columns, all rows rendered            |
|                                                           |
+-----------------------------------------------------------+
```

---

## NOAEL Banner

Container: `border-b bg-muted/20 px-4 py-3`

**Section header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2` — "NOAEL determination"

### Card Layout

`flex flex-wrap gap-3` — up to 3 cards (Combined, Males, Females), each `flex-1`.

### Per-Card Structure

Outer: `rounded-lg border p-3`

**Border/background color logic:**
- Established (`noael_dose_value > 0`): `border-green-200 bg-green-50`
- Not established: `border-red-200 bg-red-50`

**Row 1:** `mb-1 flex items-center justify-between`
- Sex label: `text-xs font-semibold` — "Combined" / "Males" / "Females"
- Status badge: `rounded px-1.5 py-0.5 text-[10px] font-medium`
  - Established: `bg-green-100 text-green-700` — "Established"
  - Not established: `bg-red-100 text-red-700` — "Not established"

**Row 2+:** `space-y-0.5 text-[11px]`
- NOAEL: label `text-muted-foreground`, value `font-medium` — "{dose_value} {dose_unit}"
- LOAEL: label `text-muted-foreground`, value `font-medium` — loael_label (first part before comma)
- Adverse at LOAEL: label `text-muted-foreground`, value `font-medium` — count

**Row 3 (conditional):** Only rendered if `adverse_domains_at_loael` is not empty. `mt-1 flex flex-wrap gap-1`
- Domain badges: `rounded px-1 py-0.5 text-[9px] font-medium` with domain-specific colors

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

---

## Filter Bar

`flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2`

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Severity | Dropdown | `<select>` with "All severities" / Adverse / Warning / Normal | All |
| Organ system | Dropdown | `<select>` with "All organs" + unique organ_system values (underscores replaced with spaces) | All |
| Sex | Dropdown | `<select>` with "All sexes" / Male / Female | All |
| Treatment related | Dropdown | `<select>` with "TR: Any" / "Treatment-related" / "Not treatment-related" | Any |

**Row count indicator:** Right-aligned `ml-auto`, `text-[10px] text-muted-foreground`, shows "{filtered} of {total} findings".

### All Controls Styling

All controls: `rounded border bg-background px-2 py-1 text-xs`

---

## Adversity Matrix

Only shown when `matrixData.endpoints.length > 0`.

Container: `border-b p-4`

### Section Header

`text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2` — "Adversity matrix ({N} endpoints)"

### Matrix Structure

`overflow-x-auto` > `inline-block` — flex-based grid.

**Header row:** `flex`
- Endpoint label column: `w-48 shrink-0` (empty placeholder)
- Dose columns: each `w-16 shrink-0 text-center text-[10px] font-medium text-muted-foreground`, shows "Dose {level}"

**Data rows:** Each endpoint is a `flex border-t` row.
- Endpoint label: `w-48 shrink-0 truncate py-0.5 pr-2 text-[10px]`, `title` tooltip for full name, truncated at 35 characters
- Data cells: each `flex h-5 w-16 shrink-0 items-center justify-center`
  - Inner block: `h-4 w-12 rounded-sm` with severity color fill
  - No text inside cells — color-only blocks

### Severity Cell Colors

| Condition | Color |
|-----------|-------|
| Adverse + treatment-related | `#ef4444` (red) |
| Warning | `#fbbf24` (amber) |
| Normal / other | `#4ade80` (green) |
| No data | `#e5e7eb` (gray) |

### Endpoint Selection Logic

- Only shows endpoints that have at least one adverse + treatment_related finding
- Sort order: first adverse dose level ascending, then alphabetically by endpoint label

### Aggregation

Takes worst severity per endpoint x dose across sexes.

### Endpoint Cap

First 30 endpoints shown. If more exist, shows: "+{remaining} more endpoints..." in `py-1 text-[10px] text-muted-foreground`.

### Legend

`mt-2 flex gap-3 text-[10px] text-muted-foreground`

Four items, each: `flex items-center gap-1` with `inline-block h-3 w-3 rounded-sm` color swatch + label text.

| Label | Swatch Color |
|-------|-------------|
| Adverse | `#ef4444` |
| Warning | `#fbbf24` |
| Normal | `#4ade80` |
| N/A | `#e5e7eb` |

---

## Adverse Effect Grid

### Section Header

`flex items-center justify-between px-4 pt-3 pb-1`
- Title: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Adverse effect summary ({N} rows)"

### Table

TanStack React Table, `w-full text-xs`, client-side sorting.

**Header row:** `border-b bg-muted/50`
- Headers: `cursor-pointer px-2 py-1.5 text-left font-medium hover:bg-accent/50`
- Clickable for sorting (shows triangle arrow: `▲` asc / `▼` desc)

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| endpoint_label | Endpoint | Truncated at 30 chars with ellipsis, `title` tooltip for full name |
| endpoint_type | Type | `text-muted-foreground`, underscores replaced with spaces |
| organ_system | Organ | Underscores replaced with spaces |
| dose_level | Dose | Colored badge: `rounded px-1.5 py-0.5 text-[10px] font-medium text-white` with dose group color |
| sex | Sex | Plain text |
| p_value | P-value | `font-mono`, p-value color coded (red/amber/muted), formatted via `formatPValue` |
| effect_size | Effect | `font-mono`, effect size color coded, formatted via `formatEffectSize` (2 decimals) |
| direction | Dir | `text-sm`, direction symbol with color |
| severity | Severity | `rounded-sm px-1.5 py-0.5 text-[10px] font-medium` badge with severity classes |
| treatment_related | TR | "Yes" in `font-medium text-red-600` or "No" in `text-muted-foreground` |
| dose_response_pattern | Pattern | `text-muted-foreground`, underscores replaced with spaces |

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

### Direction Symbols and Colors

| Direction | Symbol | Color |
|-----------|--------|-------|
| up | `↑` | `text-red-500` |
| down | `↓` | `text-blue-500` |
| none / null | `—` | `text-muted-foreground` |

### Row Interactions

- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on `endpoint_label` + `dose_level` + `sex`)
- Click: sets selection. Click again to deselect.
- Row cells: `px-2 py-1`

**No row cap** — all filtered rows are rendered.

**Empty state:** No explicit empty state — grid shows zero rows with just headers.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/noael-decision`, shows `NoaelContextPanel`.

### No Selection State (default view)

Shows study-level NOAEL information even without a row selected.

**Pane 1: NOAEL narrative (default open)**
`CollapsiblePane` with `InsightsList` showing rules where `scope === "study"`.

**Pane 2: Confidence (default closed)**
For each NOAEL row (Combined, M, F): shows "{sex}: {n_adverse_at_loael} adverse at LOAEL ({domains})" in `text-[11px]`.

**Footer message:** "Select a row to view adversity rationale." in `px-4 py-2 text-xs text-muted-foreground`.

### With Selection

#### Header
- `border-b px-4 py-3`
- Endpoint label: `text-sm font-semibold`
- Subtitle: "{sex} . Dose {dose_level}" in `text-xs text-muted-foreground`

#### Pane 1: Adversity Rationale (default open)
Shows all rows for the selected endpoint + sex across dose levels.

Each row: `flex items-center justify-between text-[11px]`
- Left: "Dose {dose_level} ({sex})" in `text-muted-foreground`
- Right: `flex items-center gap-2`
  - P-value: `font-mono`, formatted
  - Effect size: `font-mono`, formatted
  - Severity badge: `rounded-sm px-1 py-0.5 text-[10px] font-medium` with severity classes

Empty state: "No data for selected endpoint." in `text-[11px] text-muted-foreground`

#### Pane 2: Insights (default open)
`InsightsList` component.

Rules filtered to those where:
- `context_key` includes the endpoint label, OR
- `scope === "endpoint"` AND `output_text` includes the endpoint label

#### Pane 3: Related Views (default closed)
Cross-view navigation links in `text-[11px]`:
- "View dose-response" — navigates to `/studies/{studyId}/dose-response`
- "View target organs" — navigates to `/studies/{studyId}/target-organs`
- "View histopathology" — navigates to `/studies/{studyId}/histopathology`

All links: `block hover:underline`, color `#3a7bd5`, arrow suffix.

#### Pane 4: Tox Assessment (default closed)
Standard `ToxFindingForm` component, keyed by `selection.endpoint_label`.

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Filters | Local | `useState<Filters>` — severity, organ_system, sex, treatment_related |
| Selection | Shared via context | `ViewSelectionContext` with `_view: "noael"` tag |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state |
| NOAEL summary data | Server | `useNoaelSummary` hook (React Query, 5min stale) |
| Adverse effect data | Server | `useAdverseEffectSummary` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (consumed by context panel) |

---

## Data Flow

```
useNoaelSummary(studyId)          ──> noaelData (3 rows: M/F/Combined)
useAdverseEffectSummary(studyId)  ──> aeData (357 rows)
                                          |
                                     [client-side filter]
                                          |
                                     filteredData
                                      /    |      \
                               Banner  Matrix   Grid
                                      \    |      /
                                   NoaelSelection (shared)
                                          |
                                  NoaelContextPanel
                                   /     |      \
                          Narrative  Rationale  Insights
```

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Context > Related views | Click "View dose-response" | `/studies/{studyId}/dose-response` |
| Context > Related views | Click "View target organs" | `/studies/{studyId}/target-organs` |
| Context > Related views | Click "View histopathology" | `/studies/{studyId}/histopathology` |

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading NOAEL data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No adverse endpoints | Adversity matrix section not rendered |

---

## Current Issues / Improvement Opportunities

### NOAEL Banner
- Cards are `flex-1` — if only 1 or 2 NOAEL rows exist, cards stretch too wide
- No visual prominence difference between established/not-established beyond color — consider larger text or icon
- LOAEL label truncated at first comma — may lose route/dose info

### Adversity Matrix
- Only shows endpoints with adverse + treatment_related findings — excludes "warning" level
- Matrix cells are just colored blocks with no text — hard to assess at a glance without tooltips
- No tooltip on matrix cells
- Capped at 30 endpoints — no way to see the rest
- Column headers show "Dose {level}" instead of actual dose labels
- No click interaction on matrix cells — can't select from matrix

### Adverse Effect Grid
- No row cap — could be slow with many rows
- No pagination
- No column visibility toggle
- No grouping by organ or endpoint
- Filters don't affect the adversity matrix (matrix always shows all data)
- Treatment related filter uses "yes"/"no" strings compared with boolean — works but fragile

### Context Panel
- No-selection state shows NOAEL narrative and confidence — good default
- Adversity rationale shows rows filtered by endpoint + sex but not by dose_level — could show all doses
- InsightsList rule matching is loose (text search)
- Related views default-closed
- No link to study summary from NOAEL view

### General
- No keyboard navigation
- No export option
- No comparison between sexes in the adversity rationale
- Filter state not synced between matrix and grid
