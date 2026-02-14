# NOAEL Decision View

**Route:** `/studies/:studyId/noael-decision`
**Component:** `NoaelDecisionView.tsx` (wrapped by `NoaelDecisionViewWrapper.tsx`)
**Scientific question:** "What is the NOAEL and what are the dose-limiting adverse findings?"
**Role:** Decision-level summary. Two-panel master-detail layout with persistent NOAEL banner, organ rail, and evidence panel (Evidence + Adversity matrix tabs).

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

The view itself is a flex column: persistent NOAEL Banner at top, then the evidence panel below. Organ selection is provided by the shell-level organ rail (not embedded in the view):

```
+-----------------------------------------------------------+
|  NOAEL Determination (persistent, non-scrolling)           |
|  [Combined card] [Males card] [Females card]               |
+-----------------------------------------------------------+
| OrganHeader                                                |
|  organ name, adverse count, summary text,                  |
|  compact metrics (max |d|, min p, endpoints)               |
+-----------------------------------------------------------+
| [Evidence] [Adversity matrix]  <── tab bar                 |
+-----------------------------------------------------------+
| Tab content:                                               |
|  Evidence: endpoint summary, insights                      |
|  Adversity matrix: filters, matrix, grid                   |
+-----------------------------------------------------------+
```

The shell organ rail (`OrganRailMode`) lives in the left rail panel of the three-panel layout and provides organ selection, search, and sorting.

---

## NOAEL Banner (persistent, non-scrolling)

Container: `shrink-0 border-b bg-muted/20 px-4 py-3`

**Section header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2` — "NOAEL determination"

### Card Layout

`flex flex-wrap gap-3` — up to 3 cards (Combined, Males, Females), each `flex-1`.

### Per-Card Structure

Outer: `rounded-lg border p-3` — neutral background, no colored fill.

**Status indicator color logic (text-only, no background):**
- Established (`noael_dose_value != null`, including Control at dose 0): `text-[10px] font-medium` with `color: #15803d`
- Not established (`noael_dose_value` is null): `text-[10px] font-medium` with `color: #dc2626`

Card surface is always neutral (plain `border`). Color is confined to the status text.

**Row 1:** `mb-1 flex items-center justify-between`
- Sex label: `text-xs font-semibold` — "Combined" / "Males" / "Females"
- Status text: `text-[10px] font-medium` — "Established" (green) or "Not established" (red)

**Row 2+:** `space-y-0.5 text-[11px]`
- NOAEL: label `text-muted-foreground`, value `font-medium` — "{dose_value} {dose_unit}"
- LOAEL: label `text-muted-foreground`, value `font-medium` — loael_label (first part before comma)
- Adverse at LOAEL: label `text-muted-foreground`, value `font-medium` — count
- Confidence (if `noael_confidence != null`): label `text-muted-foreground`, value wrapped in `ConfidencePopover` — clickable `font-medium` with color (`text-green-700` >= 80%, `text-amber-700` >= 60%, `text-red-700` < 60%) showing percentage. Popover shows confidence breakdown and comparison across sexes.

**Row 3 (conditional):** Only rendered if `adverse_domains_at_loael` is not empty. `mt-1 flex flex-wrap gap-1`
- Domain labels: plain colored text `text-[9px] font-semibold` with `getDomainBadgeColor().text` (no background — consistent with domain label rule)

---

## Organ Selection (shell-level rail)

The NOAEL view does **not** embed its own organ rail. Instead, it declares a preference for the shell-level organ rail via `useRailModePreference("organ")` in `NoaelDecisionViewWrapper`. The organ rail (`OrganRailMode` in `components/shell/`) provides organ selection, search, and sorting — shared with the study summary and target organs contexts.

The selected organ flows from `StudySelectionContext` (`studySelection.organSystem`). Organ items, sorting, and search are managed by `OrganRailMode` (see `docs/systems/navigation-and-layout.md`).

When the user clicks an organ in the shell rail, the view reads the selection and filters adverse effect data accordingly. Clicking an organ resets both sex and TR filters to null and clears any endpoint selection.

---

## Organ Header

`shrink-0 border-b px-4 py-3`

- Organ name: `text-sm font-semibold` (displayed via `titleCase()` from `severity-colors.ts`)
- Adverse badge (if adverseCount > 0): `rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground` — "{N} adverse" (neutral bordered pill, matching S-05 badge padding)
- Summary text: `mt-1 text-xs leading-relaxed text-muted-foreground` — "{N} endpoints across {D} domains, {M} adverse, {T} treatment-related."
- Compact metrics: `mt-2 flex flex-wrap gap-3 text-[11px]` — max |d| (font-mono, font-semibold if >= 0.8), min p (font-mono, font-semibold if < 0.01). Typography-only, no color.

---

## Tab Bar

Uses `ViewTabBar` component with `flex shrink-0 items-center border-b bg-muted/30`.

Two tabs: **Evidence** and **Adversity matrix**

Active tab: `text-foreground` + `h-0.5 bg-primary` underline.
Inactive tab: `text-muted-foreground hover:text-foreground`.

This matches the canonical tab bar pattern (CLAUDE.md hard rule).

---

## Evidence Tab (formerly "Overview")

`flex-1 overflow-y-auto px-4 py-3` — scrollable content.

### Endpoint Summary

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Endpoint summary"

Each endpoint is a clickable `<button>` row:
- Container: `group/ep flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-accent/30`
- Selected: `bg-accent`
- Domain code: `<DomainLabel>` component — plain colored text `text-[9px] font-semibold` with `getDomainBadgeColor().text`
- Endpoint name: `min-w-0 flex-1 truncate`
- Direction symbol: `shrink-0 text-[10px] text-muted-foreground` — via `getDirectionSymbol()`
- Max effect size: `shrink-0 font-mono text-[10px] text-muted-foreground`
- Severity label: `shrink-0 text-[9px] text-muted-foreground` — plain text (adverse/warning/normal)
- TR badge (if treatment-related): `shrink-0 text-[9px] font-medium text-muted-foreground` — "TR"

All evidence columns use neutral muted text except domain codes, which use colored text via `<DomainLabel>` per the domain label hard rule.

Sorted by: severity (adverse first) → treatment-related → max effect size desc. Click sets endpoint-level selection (finds representative row, updates context panel). Click again to deselect.

### Insights

Only shown when organ-scoped rule results exist. Section header: "Insights". Uses `InsightsList` component with rules filtered to the selected organ (matches on `organ_system`, `output_text` containing organ name, or `context_key` containing organ key). `onEndpointClick` callback navigates to dose-response view with the clicked organ system.

---

## Adversity Matrix Tab

Two zones: filter bar + scrollable content (adversity matrix in `ViewSection mode="fixed"` + adverse effect grid in `ViewSection mode="flex"`), scoped to the selected organ. Uses `useAutoFitSections` with matrix section default 250px (80-500px).

### Filter Bar

`flex items-center gap-2 border-b bg-muted/30 px-4 py-2`

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Sex | Dropdown | `<select>` with "All sexes" / Male / Female | All |
| Treatment related | Dropdown | `<select>` with "All TR status" / "Treatment-related" / "Not treatment-related" | All |

No organ dropdown (organ already selected via rail). Row count indicator: right-aligned `ml-auto text-[10px] text-muted-foreground`, "{filtered} of {total} findings".

### Adversity Matrix

Only shown when `matrixData.endpoints.length > 0`. Container: `border-b p-4`.

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Adversity matrix ({N} endpoints)"

**Structure:** `overflow-x-auto` > `inline-block` — horizontal scrollable flex layout.

**Header row:** Endpoint label column `w-48 shrink-0` + dose columns each `w-16 shrink-0 text-center text-[10px] font-medium text-muted-foreground`. Dose headers show actual dose labels (from allAeData), falling back to "Dose {level}".

**Data rows:** Only endpoints with at least one adverse + treatment_related finding. Sort: first adverse dose level ascending, then alphabetically by endpoint label.
- Each `flex border-t` row
- Endpoint label: `w-48 shrink-0 truncate py-0.5 pr-2 text-[10px]`, truncated at 35 chars
- Cells: `flex h-5 w-16 shrink-0 items-center justify-center` with severity-colored inner box (`h-4 w-12 rounded-sm`)

**Aggregation:** Takes worst severity per endpoint × dose across sexes.

**Severity cell colors — neutral grayscale ramp:**

Uses `getNeutralHeatColor()` from `severity-colors.ts` with severity mapped to a 0-1 score:

| Condition | Score | Color |
|-----------|-------|-------|
| Adverse + treatment-related | 0.9 | `#4B5563` (darkest gray) |
| Warning | 0.5 | `#9CA3AF` (medium gray) |
| Normal / other | 0.2 | `#D1D5DB` (light gray) |
| No data | 0 | `rgba(0,0,0,0.02)` (near-transparent) |

Each cell has a tooltip: `"{endpoint} at {dose}: {severity} [(TR)]"`.

**Legend:** 4 grayscale swatches with labels (Adverse (TR), Warning, Normal, N/A).

### Adverse Effect Grid

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Adverse effect summary ({N} rows)"

TanStack React Table, `text-xs`, client-side sorting with column resizing. Scoped to selected organ.

Table width is set to `table.getCenterTotalSize()` with `tableLayout: "fixed"` for resize support. Column resizing enabled via `enableColumnResizing: true` and `columnResizeMode: "onChange"`. Each header has a resize handle (`absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize`). Cell widths use `header.getSize()` / `cell.column.getSize()`.

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| endpoint_label | Endpoint | Truncated at 30 chars with ellipsis, `title` tooltip |
| domain | Domain | Plain colored text: `text-[9px] font-semibold` with `getDomainBadgeColor().text` |
| dose_level | Dose | `text-muted-foreground`, shows `dose_label.split(",")[0]` |
| sex | Sex | Plain text |
| p_value | P-value | `ev font-mono` — interaction-driven evidence color (neutral at rest, `#DC2626` on row hover/selection via `ev` CSS class) |
| effect_size | Effect | `ev font-mono` — interaction-driven evidence color |
| direction | Dir | `text-sm text-muted-foreground` via `getDirectionSymbol()` |
| severity | Severity | `text-muted-foreground` (plain text) |
| treatment_related | TR | `text-muted-foreground` — "Yes" or "No" |
| dose_response_pattern | Pattern | `text-muted-foreground`, underscores replaced with spaces |

Row cap: 200 rows with message. Row interactions: click to select/deselect, hover highlight.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/noael-decision`, shows `NoaelContextPanel`.

The `NoaelContextPanelWrapper` in `ContextPanel.tsx` fetches `aeData` and `ruleResults` via hooks and passes as props. Selection flows from `ViewSelectionContext`. (`noaelData` is not passed — the banner already shows all NOAEL numerics, so the context panel focuses on narrative interpretation.)

### No Selection State

Header: `CollapseAllButtons` (right-aligned, no title).

Panes:
1. **NOAEL narrative** (default open) — `InsightsList` with rules where `scope === "study"`. Provides interpretive value the banner doesn't (study-level rule insights, contextual reasoning).
2. Footer: "Select an endpoint to view adversity rationale."

Note: NOAEL summary table and confidence factors were removed (RED-02) — the persistent banner already shows sex × NOAEL × LOAEL × confidence numerics. Duplicating them in the context panel added no interpretive value.

### With Selection

Header: sticky, endpoint name (`text-sm font-semibold`) + `CollapseAllButtons`. Below: sex + dose level info. `TierCountBadges` for tier filtering.

Panes (ordered per design system priority — insights → stats → annotation → navigation):
1. **Insights** (default open) — `InsightsList` with endpoint-scoped rules + `tierFilter` from header badges
2. **Adversity rationale** (default open) — dose-level rows for selected endpoint + sex, with p-value, effect size, severity badge (`getSeverityBadgeClasses`)
3. **Tox Assessment** — `ToxFindingForm` keyed by endpoint_label (annotation before navigation)
4. **Related views** (default closed) — "View dose-response" (passes endpoint_label + organ_system), "View target organs", "View histopathology" (pass organ_system)

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected organ | Shared via context | `StudySelectionContext` (`studySelection.organSystem`) — set by shell-level organ rail |
| Active tab | Local | `useState<EvidenceTab>` — "overview" (Evidence tab) or "matrix" (Adversity matrix tab) |
| Selection (endpoint) | Local | `useState<NoaelSelection \| null>` — endpoint + dose + sex selection |
| Sex filter | Local | `useState<string \| null>` — for Adversity matrix tab |
| TR filter | Local | `useState<string \| null>` — for Adversity matrix tab |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state (in AdversityMatrixTab) |
| Column sizing | Local | `useState<ColumnSizingState>` — TanStack column resize state (in AdversityMatrixTab) |
| Section heights | Local (AdversityMatrixTab) | `useAutoFitSections` — matrix section (250px default, 80-500px) |
| Rail width | Shell | Managed by shell-level `OrganRailMode` (not embedded in this view) |
| NOAEL summary data | Server | `useNoaelSummary` hook (React Query, 5min stale) |
| Adverse effect data | Server | `useAdverseEffectSummary` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |

---

## Data Flow

```
useNoaelSummary(studyId)          ──> noaelData (3 rows: M/F/Combined)
useAdverseEffectSummary(studyId)  ──> aeData (357 rows)
useRuleResults(studyId)           ──> ruleResults (shared React Query cache)
                                          |
                              deriveOrganSummaries() → OrganSummary[]
                                          |
                                  OrganRail (sorted by adverseCount desc)
                                          |
                              [selectedOrgan] → filter aeData
                                          |
                                  organData → deriveEndpointSummaries()
                                     /              \
                            OverviewTab          AdversityMatrixTab
                            (endpoints,          (matrix + grid,
                             insights,            sex/TR filter)
                             cross-view)               |
                                  \              /
                              NoaelSelection (shared)
                                          |
                                NoaelContextPanel
                                  /    |     |      \
                           Narrative  Adversity Insights  Tox
                           (no-sel)   rationale  (sel)   (sel)
```

---

## Cross-View Navigation

### Inbound
- From other views with `location.state`: `{ organ_system: string }` — auto-selects matching organ in rail (case-insensitive).

### Outbound (Context panel — "Related views" pane, with selection)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| "View dose-response" | `/studies/{studyId}/dose-response` | `{ endpoint_label, organ_system }` |
| "View target organs" | `/studies/{studyId}/target-organs` | `{ organ_system }` |
| "View histopathology" | `/studies/{studyId}/histopathology` | `{ organ_system }` |

---

## Keyboard

- **Escape**: clears endpoint-level selection (via `keydown` listener on `window`)

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading NOAEL data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No organ selected (but data exists) | "Select an organ system to view adverse effect details." AND "Select an organ system from the shell rail." (known bug: duplicate empty states rendered simultaneously) |
| No data at all | "No adverse effect data available." |
| Empty search results (rail) | "No matches for '{search}'" |
| No data for organ (both tabs empty) | "No data for this organ." |
| No endpoints for organ (overview) | "No endpoints for this organ." |
| No rows after filter (matrix) | "No rows match the current filters." |
| >200 filtered rows (grid) | Truncation message below grid |
