# Study Summary View

**Route:** `/studies/:studyId`
**Component:** `StudySummaryView.tsx` (wrapped by `StudySummaryViewWrapper.tsx`)
**Scientific question:** "What happened in this study?"
**Role:** Entry point after opening a study. Orientation, signal detection, triage.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  Study Summary View        | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The Study Summary View itself is split into two tabs with a shared tab bar:

```
+-----------------------------------------------------------+
| [Study Details]  [Signals]              [Generate Report]  |  <-- tab bar, border-b
+-----------------------------------------------------------+
|                                                           |
|  Tab content (fills remaining height, scrollable)         |
|                                                           |
+-----------------------------------------------------------+
```

---

## Tab Bar

- **Position:** Top of the view, full width, `border-b`
- **Tabs:** "Study Details" (default active) and "Signals"
- **Active indicator:** `h-0.5 bg-primary` underline at bottom of active tab
- **Tab text:** `text-xs font-medium`. Active = `text-foreground`. Inactive = `text-muted-foreground`
- **Generate Report button:** Right-aligned in tab bar. Border, `text-xs`, icon `FileText` (3.5x3.5) + "Generate Report" label. Opens HTML report in new tab.

---

## Tab 1: Study Details

Full-width scrollable metadata display. Padding `p-6`.

### Header
- `text-2xl font-bold`: "Study: {study_id}"
- Optional subtitle in `text-muted-foreground`: study title from TS domain

### Sections

Each section has:
- Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b pb-1 mb-3`
- Key-value rows: label (w-36, `text-muted-foreground`) + value (`select-all`), `text-sm`, `py-1`

#### Study overview
| Label | Source |
|-------|--------|
| Species | `meta.species` |
| Strain | `meta.strain` |
| Study type | `meta.study_type` |
| Design | `meta.design` |
| Subjects | `"{total} ({males}M, {females}F)"` |
| Start date | `meta.start_date` |
| End date | `meta.end_date` |
| Duration | ISO duration parsed to "{N} weeks" or "{N} days" |

#### Treatment
| Label | Source |
|-------|--------|
| Test article | `meta.treatment` |
| Vehicle | `meta.vehicle` |
| Route | `meta.route` |

#### Administration
| Label | Source |
|-------|--------|
| Sponsor | `meta.sponsor` |
| Test facility | `meta.test_facility` |
| Study director | `meta.study_director` |
| GLP | `meta.glp` |
| SEND version | `meta.send_version` |

#### Domains ({count})
- Flex-wrap row of domain chips
- Each chip: `<Link>` to `/studies/{studyId}/domains/{domain}`
- Styling: `rounded-md bg-muted px-2 py-0.5 font-mono text-xs`
- Hover: `hover:bg-primary/20 transition-colors` (blue tint)
- Navigates to domain table view on click

---

## Tab 2: Signals

Vertical stack, fills remaining height. Contains three sections separated by `border-b`.

### Filters Bar

`flex flex-wrap items-center gap-3 border-b px-4 py-2`

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Endpoint | Dropdown | `<select>` with All + unique `endpoint_type` values | All |
| Organ | Dropdown | `<select>` with All + unique `organ_system` values | All |
| Sex | Dropdown | `<select>` with All / Male / Female | All |
| Min score | Range slider | `<input type="range">` 0-1, step 0.05, `w-20` + mono display | 0.00 |
| Significant only | Checkbox | `<input type="checkbox">` + label | Unchecked |

- All labels: `text-xs text-muted-foreground`
- All controls: `rounded border bg-background px-2 py-1 text-xs`
- Filters apply client-side to `signalData` array (989 rows full, filtered subset shown)

### Signal Heatmap

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2`

**Structure:** CSS Grid heatmap
- `grid-template-columns: 180px repeat({doseCount}, 70px)`
- Rows = endpoint labels (sorted by max signal score descending)
- Columns = dose levels (sorted ascending)
- Capped at **30 endpoints** max. Shows "Showing top 30 of {N} endpoints" below if truncated.
- Aggregation: for each endpoint x dose, takes max signal score across sexes

**Header row:**
- Endpoint column: sticky left, `text-[10px] font-semibold text-muted-foreground`
- Dose columns: centered `text-[10px] font-semibold text-muted-foreground`

**Data cells:**
- Background: signal score color scale (green #388E3C to red #D32F2F)
- Text: score `{v.toFixed(2)}` + significance stars (*** / ** / * but not "ns")
- Text color: white if score >= 0.5, dark gray `#374151` if below
- Size: 70px wide, `py-1`
- Outline: `1px solid rgba(0,0,0,0.05)` default; `2px solid #3b82f6` when selected
- Hover: `opacity-80`
- Tooltip: `"{endpoint} @ {dose}: score={score} ({stars})"`

**Endpoint labels:**
- Sticky left, `z-10 bg-background`
- `text-[11px]`, truncated with title tooltip
- 180px wide

**Interactions:**
- Click cell: selects that endpoint x dose. Updates selection state, highlights cell with blue outline, updates context panel.
- Click same cell again: deselects.
- Selection syncs with grid below (same `SignalSelection` state).

### Signal Summary Grid

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with row count "({N} rows)"

**Table:** TanStack React Table, `w-full border-collapse text-xs`

**Header row:** `bg-muted/50 border-b`
- Headers: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`
- Clickable for sorting (shows triangle arrow)
- Default sort: `signal_score` descending

**Columns:**

| Column | Header | Width | Cell Rendering |
|--------|--------|-------|----------------|
| endpoint_label | Endpoint | 200px | Truncated `text-xs` with title tooltip |
| endpoint_type | Type | 100px | `bg-muted px-1.5 py-0.5 text-[10px]` badge, underscores replaced with spaces |
| organ_system | Organ | 100px | `text-xs`, underscores replaced |
| dose_label | Dose | 80px | `text-xs font-medium` |
| sex | Sex | 40px | `text-xs font-semibold` colored (M=#1565C0, F=#C62828) |
| signal_score | Signal | 70px | Colored badge: `rounded px-1.5 py-0.5 text-xs font-semibold text-white` with signal score bg color |
| direction | Dir | 40px | Arrow symbol: up/down/dash. `text-sm font-bold` colored |
| p_value | P-val | 70px | `font-mono text-[11px]` formatted (e.g., "<0.001", "0.023") |
| trend_p | Trend | 70px | Same as p_value |
| effect_size | d | 60px | `font-mono text-[11px]`, null shows em dash |
| statistical_flag | Stat | 30px | Checkmark or empty |
| dose_response_flag | DR | 30px | Checkmark or empty |
| domain | Dom | 50px | Domain badge with domain-specific bg/text colors |

**Row interactions:**
- Hover: `bg-accent/30`
- Selected: `bg-accent`
- Click: sets selection (same state as heatmap). Click again to deselect.
- Row cells: `px-2 py-1`

**Empty state:** "No signals match current filters" centered, `text-sm text-muted-foreground`

### Target Organ Bar Chart

Only shown if `staticHtml` loads successfully from `/api/studies/{studyId}/analysis/static/target_organ_bar`.

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2`
- Shows count: "({N} identified)" from `target_organ_summary` where `target_organ_flag = true`

**Chart:** Pre-rendered Plotly HTML, embedded via `dangerouslySetInnerHTML`.
- Horizontal bar chart of target organs by evidence score
- Padding: `p-4`

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}`, shows `StudySummaryContextPanel`.

### No Selection State
- Message: "Select a signal from the heatmap or grid to view details."
- `p-4 text-xs text-muted-foreground`

### With Selection

#### Header
- `border-b px-4 py-3`
- Endpoint label: `text-sm font-semibold`
- Subtitle: "{domain} . {sex} . Dose {dose_level}" in `text-xs text-muted-foreground`

#### Pane 1: Insights (default open)
`CollapsiblePane` with `InsightsList` component.

Rules filtered to: matching context_key (`{domain}_{test_code}_{sex}`), matching organ key (`organ_{organ_system}`), or study scope.

**InsightsList rendering:**
- Tier filter pills at top: Critical (red-100/red-700), Notable (amber-100/amber-700), Observed (gray-100/gray-500)
- Pills: `rounded-full px-2 py-0.5 text-[9px] font-medium`. Active=full opacity, inactive=30% opacity.
- Only shown when Critical or Notable counts > 0

- Organ groups: header with TierBadge + organ name (`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`)
- Endpoint/domain count subtitle: `text-[10px] text-muted-foreground/60`
- Synthesized signal lines: `text-[11px] leading-snug pl-2`. Warning lines get `border-l-2 border-l-amber-500`.
- Correlation chips: `rounded bg-muted px-1.5 py-0.5 text-[10px]` in flex-wrap
- "Show N rules" toggle: `text-[10px] text-blue-600`
- Expanded raw rules: `border-l border-border pl-2`, `text-[10px]` with mono rule_id

#### Pane 2: Statistics (default open)
Key-value pairs, `text-[11px]`:

| Metric | Display |
|--------|---------|
| Signal score | Colored badge with score to 3 decimals |
| Direction | Text value or em dash |
| Best p-value | Mono formatted |
| Trend p-value | Mono formatted |
| Effect size | Mono, 2 decimals, or em dash |
| Dose-response | Pattern with underscores replaced |
| Severity | Capitalized |
| Treatment-related | Yes/No |

#### Pane 3: Correlations (default open)
- Shows other findings in same `organ_system`, up to 10, sorted by signal_score desc
- Header text: "Other findings in {organ system}"

**Table:** `text-[10px]`
| Col | Align |
|-----|-------|
| Endpoint | Left, truncated at 25 chars |
| Dom | Left |
| Signal | Right, mono |
| p | Right, mono |

- Rows are clickable: navigate to `/studies/{studyId}/dose-response` (cross-view link)
- Hover: `bg-accent/30`, `cursor-pointer`, `border-b border-dashed`

#### Pane 4: Tox Assessment (default closed)
`ToxFindingForm` component with:

- **Treatment related** dropdown: Yes / No / Equivocal / Not Evaluated
- **Adversity** dropdown: Adverse / Non-Adverse/Adaptive / Not Determined. Grayed out (opacity-40) when treatment_related = "No"
- **Comment** textarea: 2 rows, placeholder "Notes..."
- **SAVE button:** `bg-primary text-primary-foreground`, disabled when no changes or saving
- **Footer:** reviewer name + date if previously saved

---

## State Management

| State | Scope | Managed By |
|-------|-------|-----------|
| Active tab | Local | `useState<"details" \| "signals">` — defaults to "details" |
| Filters | Local | `useState<Filters>` |
| Selection | Shared via context | `SignalSelectionContext` — syncs heatmap, grid, and context panel |
| Signal data | Server | `useStudySignalSummary` hook (React Query, 5min stale) |
| Target organs | Server | `useTargetOrganSummary` hook |
| Study metadata | Server | `useStudyMetadata` hook |
| Rule results | Server | `useRuleResults` hook (consumed by context panel) |
| Static chart HTML | Local | `useState` + `fetchStaticChart` on mount |

---

## Data Flow

```
useStudySignalSummary(studyId)  ──> signalData (989 rows)
                                         |
                                    [client-side filter]
                                         |
                                    filteredData
                                     /        \
                              SignalHeatmap   StudySummaryGrid
                                     \        /
                                   SignalSelection (shared)
                                         |
                              StudySummaryContextPanel
                                   /     |      \
                             Insights  Stats  Correlations
```

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Correlations table row | Click | `/studies/{studyId}/dose-response` |
| Domain chip (Details tab) | Click | `/studies/{studyId}/domains/{domain}` |
| Generate Report button | Click | Opens HTML report in new browser tab |

**Missing cross-view links (potential improvement):**
- No navigation from heatmap/grid selection to dose-response view
- Correlation rows navigate to dose-response but don't pass endpoint filter
- No link to target organs view from organ system display
- No link to histopathology from pathology-type findings

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading study summary..." |
| Error (no generated data) | Red box with instructions to run generator command |
| Empty filters | "No signals match current filters" in grid area |
| No heatmap data | "No signals to display" centered |
| No metadata (Details tab) | Spinner + "Loading details..." |

---

## Current Issues / Improvement Opportunities

### Layout & Information Architecture
- Default tab is "Details" but most users coming to Study Summary want signals — consider defaulting to Signals tab or a combined view
- Study Details tab duplicates metadata already shown in the context panel's StudyInspector (when on landing page)
- No visual summary/dashboard on the Details tab — just raw metadata fields
- The three sections in Signals tab (heatmap, grid, bar chart) are stacked vertically with no side-by-side option, making it hard to see all at once

### Signal Heatmap
- Capped at 30 endpoints — no way to see or navigate to the rest
- Aggregates across sexes (max score) — loses M/F split that the spec calls for
- No sex toggle/facet as specified in the design spec (SS12.4)
- No row grouping by organ system or endpoint type
- Fixed 70px column width — may be too narrow or too wide depending on dose count
- No legend for the color scale

### Signal Grid
- No pagination — all filtered rows rendered at once (could be hundreds)
- No column visibility toggle — all 12 columns always shown
- P-value and trend columns show formatted text but no color coding (spec calls for background colors from the p-value scale)
- Statistical flag and dose-response flag show only checkmarks — no color (spec: green check / gray X)
- No treatment-related column (the spec includes it in the grid)

### Context Panel
- Correlations row click navigates to dose-response but doesn't pass the endpoint as a filter parameter
- No "View in target organs" or "View in histopathology" links
- Statistics pane shows flat key-value list — could benefit from signal score component breakdown (stat/trend/effect/bio weights)
- Tox Assessment form is default-closed — easy to miss

### General
- No keyboard navigation (arrow keys in grid, tab between panes)
- No responsive behavior — fixed 260px + 280px sidebars with flex-1 center
- Generate Report button styling is subtle — could be more prominent for a primary action
