# Histopathology View

**Route:** `/studies/:studyId/histopathology`
**Component:** `HistopathologyView.tsx` (wrapped by `HistopathologyViewWrapper.tsx`)
**Scientific question:** "What are the microscopic findings and how severe are they across dose groups?"
**Role:** Histopathology-specific analysis. Two-panel master-detail layout with specimen rail and evidence panel (Overview + Severity Matrix tabs).

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

The view itself is a two-panel master-detail layout (matching Target Organs, Dose-Response, and Signals views):

```
+--[300px]--+----------------------------------[flex-1]-----------+
|            | SpecimenHeader                                      |
| Specimen   |  specimen name, adverse count, conclusion text,    |
| Rail       |  compact metrics (max severity, affected, findings)|
|            +----------------------------------------------------+
| search     | [Overview] [Severity matrix]  <── tab bar          |
| specimen 1 +----------------------------------------------------+
| specimen 2 | Tab content:                                       |
| specimen 3 |  Overview: finding summary, insights, cross-view   |
| ...        |  Severity matrix: filters, heatmap, lesion grid    |
|            |                                                     |
+------------+----------------------------------------------------+
```

Responsive: stacks vertically below 1200px (`max-[1200px]:flex-col`). Rail becomes horizontal 180px tall strip.

---

## Specimen Rail (left panel, 300px)

`flex w-[300px] shrink-0 flex-col overflow-hidden border-r`

### Header
- Label: `text-xs font-medium uppercase tracking-wider text-muted-foreground` — "Specimens ({N})"
- Search input: `mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs` with placeholder "Search specimens..."

### Rail Items

Each `SpecimenRailItem` is a `<button>` with:
- Container: `w-full text-left border-b border-border/40 px-3 py-2.5 transition-colors`
- Selected: `bg-blue-50/60 dark:bg-blue-950/20`
- Not selected: `hover:bg-accent/30`
- Left border: severity-colored (`border-l-2`) for specimens with adverse findings, transparent otherwise

**Row 1:** Specimen name (`text-xs font-semibold`) + finding count badge (`text-[10px] text-muted-foreground`)

**Row 2:** Severity bar — max avg_severity normalized to global max, colored with `getSeverityHeatColor(maxSev)` (not neutral gray). Bar: `h-1.5 flex-1 rounded-full bg-muted/50` with inner colored fill. Numeric value: `shrink-0 text-[10px]`, font-semibold for >=3, font-medium for >=2.

**Row 3:** Stats line — `{N} findings · {M} adverse` + domain chips (outline+dot style matching other views: `rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70` with colored dot via `getDomainBadgeColor`).

### Sorting

Specimens sorted by: `maxSeverity` desc → `adverseCount` desc → `findingCount` desc.

### Auto-Select

On data load, auto-selects the top specimen (highest max severity).

### Search

Filters specimens by name (case-insensitive substring match). Empty state: "No matches for '{search}'".

---

## Specimen Header

`shrink-0 border-b px-4 py-3`

- Specimen name: `text-sm font-semibold`
- Adverse badge (if adverseCount > 0): `text-[10px] font-semibold uppercase text-[#DC2626]` — "{N} ADVERSE"
- Conclusion text: `mt-1 text-xs leading-relaxed text-muted-foreground` — "{N} findings across {D} domains, {M} with adverse severity, incidence up to {X}%."
- Compact metrics: `mt-2 flex flex-wrap gap-3 text-[11px]` — max severity (colored badge), total affected, finding count

---

## Tab Bar

`flex shrink-0 items-center gap-0 border-b px-4`

Two tabs: **Overview** and **Severity matrix**

Active tab: `border-b-2 border-primary text-primary`
Inactive tab: `border-transparent text-muted-foreground hover:text-foreground`
All tabs: `px-3 py-2 text-xs font-medium transition-colors`

---

## Overview Tab

`flex-1 overflow-y-auto px-4 py-3` — scrollable content.

### Finding Summary

Section header: `text-xs font-medium uppercase tracking-wide text-muted-foreground` — "Finding summary"

Each finding is a clickable `<button>` row:
- Container: `flex w-full items-center gap-2 rounded border border-border/30 px-2 py-1.5 text-left text-[11px] hover:bg-accent/30`
- Selected: `bg-accent ring-1 ring-primary`
- Finding name: truncated at 40 chars, `min-w-0 flex-1 truncate font-medium`
- Max severity badge: colored with `getSeverityHeatColor`, `shrink-0 rounded px-1 font-mono text-[9px]`
- Incidence summary: `{totalAffected}/{totalN}`, `shrink-0 font-mono text-[10px] text-muted-foreground`
- Severity category badge: `shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-medium` with `getSeverityBadgeClasses`

Sorted by max avg_severity descending. Click sets finding-level selection (updates context panel). Click again to deselect.

### Insights

Only shown when specimen-scoped rule results exist. Section header: "Insights". Uses `InsightsList` component with rules filtered to the selected specimen (matches on output_text containing specimen name, context_key containing specimen key, or organ_system matching specimen).

### Cross-View Links

Section header: "Related views". Three navigation links:
- "View in Target Organs" → `/studies/{studyId}/target-organs` with `{ state: { organ_system: specimen } }`
- "View dose-response" → `/studies/{studyId}/dose-response` with `{ state: { organ_system: specimen } }`
- "View NOAEL decision" → `/studies/{studyId}/noael-decision` with `{ state: { organ_system: specimen } }`
- All links: `block hover:underline`, color `#3a7bd5`, arrow suffix

---

## Severity Matrix Tab

Preserves the existing heatmap + grid, scoped to the selected specimen.

### Filter Bar

`flex items-center gap-2 border-b bg-muted/30 px-4 py-2`

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Sex | Dropdown | `<select>` with "All sexes" / Male / Female | All |
| Min severity | Dropdown | `<select>` with "Min severity: any" / "1+" / "2+" / "3+" | Any (0) |

No specimen dropdown (specimen already selected via rail). Row count indicator: right-aligned `ml-auto text-[10px] text-muted-foreground`, "{filtered} of {total} rows".

### Severity Heatmap

Only shown when `heatmapData` exists and findings.length > 0. Container: `border-b p-4`.

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Severity heatmap ({N} findings)"

**Structure:** `overflow-x-auto` > `inline-block` — horizontal scrollable flex layout.

**Header row:** Finding label column `w-52 shrink-0` + dose columns each `w-20 shrink-0 text-center text-[10px] font-medium text-muted-foreground`.

**Data rows:** No finding cap (specimens typically have 1-11 findings each).
- Each `flex cursor-pointer border-t hover:bg-accent/20`, selected: `ring-1 ring-primary`
- Finding label: `w-52 shrink-0 truncate py-1 pr-2 text-[10px]`, truncated at 40 chars
- Cells: `flex h-6 w-20 shrink-0 items-center justify-center` with severity-colored inner box or gray placeholder

**Severity heat color scale:** Same as global — `#FFF9C4` (minimal) through `#E57373` (severe).

**Legend:** 5 color swatches with labels (Minimal, Mild, Moderate, Marked, Severe).

### Lesion Severity Grid

TanStack React Table, `w-full text-xs`, client-side sorting. Scoped to selected specimen (no specimen column needed).

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| finding | Finding | Truncated at 25 chars with ellipsis, `title` tooltip |
| domain | Domain | Colored badge via `getDomainBadgeColor` (`rounded px-1 py-0.5 text-[10px] font-semibold`) |
| dose_level | Dose | `text-muted-foreground`, shows `dose_label.split(",")[0]` |
| sex | Sex | Plain text |
| n | N | Plain number |
| affected | Affected | Plain number |
| incidence | Incidence | `font-mono`, `rounded px-1` with incidence background color, percentage |
| avg_severity | Avg sev | `font-mono text-[10px]`, `rounded px-1.5 py-0.5` with severity heat color |
| severity | Severity | Badge with severity classes |

Row cap: 200 rows. Row interactions: click to select/deselect, hover highlight.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/histopathology`, shows `HistopathologyContextPanel`.

**No changes to context panel.** The `HistopathologyContextPanelWrapper` in `ContextPanel.tsx` already fetches `lesionData` and `ruleResults` via hooks and passes as props. Selection flows from `ViewSelectionContext`.

### No Selection State
- Message: "Select a finding from the heatmap or grid to view details."

### With Selection

Panes (unchanged from previous implementation):
1. **Pathology review** (default open) — `PathologyReviewForm`
2. **Dose detail** (default open) — all dose-level rows for finding + specimen
3. **Insights** (default open) — `InsightsList` with finding-scoped rules
4. **Correlating evidence** (default closed) — other findings in same specimen
5. **Related views** (default closed) — cross-view navigation links
6. **Tox Assessment** (default closed) — `ToxFindingForm`

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected specimen | Local | `useState<string \| null>` — which specimen is active in the rail |
| Active tab | Local | `useState<EvidenceTab>` — "overview" or "matrix" |
| Selection (finding) | Shared via context | `ViewSelectionContext` with `_view: "histopathology"` tag |
| Sex filter | Local | `useState<string \| null>` — for Severity Matrix tab |
| Min severity | Local | `useState<number>` — for Severity Matrix tab |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state (in SeverityMatrixTab) |
| Lesion data | Server | `useLesionSeveritySummary` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |

---

## Data Flow

```
useLesionSeveritySummary(studyId) ──> lesionData (728 rows)
useRuleResults(studyId) ──> ruleResults (shared React Query cache)
                                |
                    deriveSpecimenSummaries() → SpecimenSummary[]
                                |
                        SpecimenRail (sorted by maxSeverity desc)
                                |
                    [selectedSpecimen] → filter lesionData
                                |
                        specimenData → deriveFindingSummaries()
                           /              \
                  OverviewTab          SeverityMatrixTab
                  (summaries,          (heatmap + grid,
                   insights,            sex/severity filter)
                   cross-view)               |
                        \              /
                    HistopathSelection (shared)
                                |
                  HistopathologyContextPanel
                    /    |     |      \     \
             PathReview  Dose  Insights  Corr  Tox
```

---

## Cross-View Navigation

### Inbound
- From other views with `location.state`: `{ organ_system: string }` or `{ specimen: string }` — auto-selects matching specimen in rail (case-insensitive).

### Outbound (Overview tab)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| "View in Target Organs" | `/studies/{studyId}/target-organs` | `{ organ_system: specimen }` |
| "View dose-response" | `/studies/{studyId}/dose-response` | `{ organ_system: specimen }` |
| "View NOAEL decision" | `/studies/{studyId}/noael-decision` | `{ organ_system: specimen }` |

### Outbound (Context panel — unchanged)
Same three links in the "Related views" pane.

---

## Keyboard

- **Escape**: clears finding-level selection (via `keydown` listener on `window`)

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading histopathology data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No specimen selected (but data exists) | "Select a specimen to view histopathology details." |
| No data at all | "No histopathology data available." |
| Empty search results (rail) | "No matches for '{search}'" |
| No findings for specimen (overview) | "No findings for this specimen." |
| No rows after filter (matrix) | "No rows match the current filters." |
| >200 filtered rows (grid) | Truncation message below grid |
