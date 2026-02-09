# Target Organs View

**Route:** `/studies/:studyId/target-organs`
**Component:** `TargetOrgansView.tsx` (wrapped by `TargetOrgansViewWrapper.tsx`)
**Scientific question:** "Which organ systems show converging evidence of toxicity?"
**Role:** Organ-level convergence assessment. Two-panel master-detail layout with organ rail and evidence panel (Overview + Evidence table tabs). Identifies target organs by aggregating evidence across endpoints and domains.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  Target Organs View        | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself is a two-panel master-detail layout (matching Dose-Response, Histopathology, NOAEL, and Signals views):

```
+--[300px]--+---------------------------------------[flex-1]-+
|            | OrganSummaryHeader                              |
| Organ      |  organ name, TARGET badge, conclusion text,    |
| Rail       |  compact metrics (max signal, evidence, endpts)|
|            +------------------------------------------------+
| search     | [Overview] [Evidence table]  <-- tab bar        |
| organ 1    +------------------------------------------------+
| organ 2    | Tab content:                                    |
| organ 3    |  Overview: domain breakdown, top findings       |
| ...        |  Evidence table: filters, sortable grid         |
|            |                                                  |
+------------+------------------------------------------------+
```

Responsive: stacks vertically below 1200px (`max-[1200px]:flex-col`). Rail becomes horizontal 180px tall strip.

Rail is resizable via `useResizePanel(300, 180, 500)` with a `PanelResizeHandle` between panels (hidden on narrow viewports).

---

## Organ Rail (left panel, 300px default)

`flex shrink-0 flex-col overflow-hidden border-r`, width set via `useResizePanel`.

### Header

- Label: `text-xs font-medium uppercase tracking-wider text-muted-foreground` -- "Organ systems ({N})"
- Search input: `mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs` with placeholder "Search organs..."

### Rail Items

Each `OrganListItem` is a `<button>` with:
- Container: `w-full text-left border-b border-border/40 px-3 py-2.5 transition-colors`
- Selected: `bg-blue-50/60 dark:bg-blue-950/20`
- Not selected: `hover:bg-accent/30`
- Left border: `border-l-2 border-l-[#DC2626]` for organs with `target_organ_flag`, `border-l-transparent` otherwise

**Row 1:** Organ name (`text-xs font-semibold`, uses `titleCase()`) + TARGET badge (`text-[9px] font-semibold uppercase text-[#DC2626]` -- only shown if `target_organ_flag` is true)

**Row 2:** Evidence bar -- neutral gray fill (`bg-foreground/25`) on `bg-muted/50` track, width proportional to `evidence_score / maxEvidenceScore` (minimum 4%). Numeric value: `shrink-0 text-[10px]`, font-semibold for >= 0.5, font-medium for >= 0.3.

**Row 3:** Stats line -- `{N} sig · {M} TR · {D} domains` + domain chips (outline+dot style: `rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70` with colored dot via `getDomainBadgeColor()`).

### Sorting

Organs sorted by `evidence_score` descending.

### Auto-Select

On data load, auto-selects the top organ (highest evidence score). Also notifies the wrapper via `onSelectionChange`.

### Search

Filters organs by name (case-insensitive substring match, underscores replaced with spaces). Empty state: "No matches for '{search}'".

### Cross-View Inbound

If `location.state` contains `{ organ_system: string }`, auto-selects matching organ in rail and clears the history state via `window.history.replaceState({}, "")`.

---

## Organ Summary Header

`shrink-0 border-b px-4 py-3`

- Organ name: `text-sm font-semibold` (uses `titleCase()`)
- TARGET ORGAN badge (if `target_organ_flag`): `text-[10px] font-semibold uppercase text-[#DC2626]`
- Conclusion text: `mt-1 text-xs leading-relaxed text-muted-foreground` -- "{Convergent|Evidence from} {N} domain(s): {sig}/{total} endpoints significant ({pct}%), {N} treatment-related."
- Compact metrics: `mt-2 flex flex-wrap gap-3 text-[11px]` -- max signal score, evidence score (font-semibold if >= 0.5), endpoint count

---

## Tab Bar

`flex shrink-0 items-center gap-0 border-b px-4`

Two tabs: **Overview** and **Evidence table**

Active tab: `border-b-2 border-primary text-primary`
Inactive tab: `border-transparent text-muted-foreground hover:text-foreground`
All tabs: `px-3 py-2 text-xs font-medium transition-colors`

---

## Overview Tab

`flex-1 overflow-y-auto px-4 py-3` -- scrollable content.

### Domain Breakdown

Section header: `text-xs font-medium uppercase tracking-wide text-muted-foreground` -- "Domain breakdown"

Static HTML table (`w-full text-xs`) with columns:

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| Domain | Domain | Outline+dot chip: `rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground/70` with colored dot |
| Endpoints | Endpoints | Unique endpoint count per domain |
| Significant | Significant | Count of rows with p_value < 0.05, font-semibold if > 0 |
| TR | TR | Treatment-related count, font-semibold if > 0 |

Rows sorted by significant count descending. Computed by grouping `organEvidenceRows` by domain.

### Top Findings by Effect Size

Section header: `text-xs font-medium uppercase tracking-wide text-muted-foreground` -- "Top findings by effect size"

Shows up to 10 evidence rows with the largest absolute effect size (filtered to effect_size > 0, sorted desc).

Each finding is a row:
- Container: `flex items-center gap-2 rounded border border-border/30 px-2 py-1.5 text-[11px] hover:bg-accent/30`
- Endpoint name: `min-w-[140px] truncate font-medium`
- Direction symbol: `shrink-0 text-sm text-[#9CA3AF]`
- Effect size: `shrink-0 font-mono`, font-semibold if |d| >= 0.8; hover turns `text-[#DC2626]`
- P-value: `shrink-0 font-mono`, font-semibold if < 0.001, font-medium if < 0.01; hover turns `text-[#DC2626]`
- Severity badge: `shrink-0 rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium text-muted-foreground`
- TR label (if treatment_related): `shrink-0 text-[9px] font-medium text-muted-foreground`
- Sex and dose: `ml-auto shrink-0 text-muted-foreground` -- "{sex} · {dose}"

### Empty State

"No evidence rows for this organ." (`py-8 text-center text-xs text-muted-foreground`)

---

## Evidence Table Tab

Two zones: filter bar + scrollable TanStack table, scoped to the selected organ.

### Filter Bar

`flex items-center gap-2 border-b bg-muted/30 px-4 py-2`

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Domain | Dropdown | `<select>` with "All domains" + domains in selected organ | All |
| Sex | Dropdown | `<select>` with "All sexes" / Male / Female | All |

No organ dropdown (organ already selected via rail). Row count indicator: right-aligned `ml-auto text-[10px] text-muted-foreground`, "{N} findings".

### Evidence Grid

TanStack React Table with `enableColumnResizing: true`, `columnResizeMode: "onChange"`, `ColumnSizingState`. Table uses `tableLayout: "fixed"` with width from `table.getCenterTotalSize()`.

**Header row:** `sticky top-0 z-10 bg-background`, border-b bg-muted/50.
- Headers: `relative cursor-pointer px-2 py-1.5 text-left font-medium hover:bg-accent/50`
- Clickable for sorting (shows triangle arrow: `▲` asc / `▼` desc)
- Column resize handle: `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize`, blue when actively resizing

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| endpoint_label | Endpoint | Truncated at 30 chars with ellipsis, `title` tooltip |
| domain | Domain | Outline+dot chip: `rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground/70` with colored dot |
| dose_level | Dose | `text-muted-foreground`, shows `dose_label.split(",")[0]` |
| sex | Sex | Plain text |
| p_value | P-value | `font-mono`, font-semibold if < 0.001, font-medium if < 0.01; red text when column is sorted and p < 0.05 |
| effect_size | Effect | `font-mono`, font-semibold if |d| >= 0.8, font-medium if |d| >= 0.5; red text when column is sorted and |d| >= 0.5 |
| direction | Dir | Direction symbol (`getDirectionSymbol()`), `text-sm text-muted-foreground` |
| severity | Severity | `inline-block rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground` |
| treatment_related | TR | "Yes" in `font-medium` or "No" in `text-muted-foreground` |

### Row Interactions

- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on `endpoint_label` + `sex` + `organ_system`)
- Click: sets endpoint-level selection (with `endpoint_label` and `sex`). Click again to deselect back to organ-level selection.
- Row cells: `px-2 py-1`

**Row cap:** None -- all rows rendered.

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches `/studies/{studyId}/target-organs`, shows `TargetOrgansContextPanel` via `TargetOrgansContextPanelWrapper` in `ContextPanel.tsx`.

The wrapper fetches `organData` (via `useTargetOrganSummary`), `evidenceData` (via `useOrganEvidenceDetail`), and `ruleResults` (via `useRuleResults`) from shared React Query cache. Selection flows from `ViewSelectionContext` (filtered to `_view: "target-organs"`).

### No Selection State

- Message: "Select an organ system to view convergence details."
- `p-4 text-xs text-muted-foreground`

### With Selection

#### Header

- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Row 1: organ name (`text-sm font-semibold`, `titleCase()`) + `CollapseAllButtons` (expand/collapse all panes)
- Row 2 (left): evidence score (`font-semibold` if >= 0.5, `font-medium` otherwise) + TARGET ORGAN badge (if flagged, `text-[10px] font-semibold uppercase text-[#DC2626]`)
- Row 2 (right): `TierCountBadges` showing Critical/Notable/Observed counts with clickable tier filter via `tierFilter` state

Collapse/expand all functionality is powered by `useCollapseAll()` hook, which provides generation counters (`expandGen`, `collapseGen`) passed to each `CollapsiblePane`.

#### Pane 1: Convergence (default open)

`CollapsiblePane` with `InsightsList` component.
- Rules filtered to those matching `context_key === "organ_{organ_system}"` or `organ_system === selection.organ_system`.
- `tierFilter` state from header's `TierCountBadges` is passed through to `InsightsList` to filter displayed insights by tier.
- Same InsightsList rendering as described in study-summary.md (tier pills, organ groups, synthesized signals, correlation chips, expandable raw rules).

#### Pane 2: Endpoints (default open)

Shows up to 15 contributing endpoints sorted by occurrence count descending.

Each item: `flex items-center gap-1 text-[11px]`
- Domain chip: outline+dot style (`rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70` with colored dot)
- Endpoint label: truncated at 28 chars with `title` tooltip
- Count: `ml-auto text-muted-foreground` -- "(N)"

#### Pane 3: Related Views (default closed)

Cross-view navigation links in `text-[11px]`:
- "View dose-response" -- navigates to `/studies/{studyId}/dose-response` with `{ state: { organ_system } }`
- "View histopathology" -- navigates to `/studies/{studyId}/histopathology` with `{ state: { organ_system } }`
- "View NOAEL decision" -- navigates to `/studies/{studyId}/noael-decision` with `{ state: { organ_system } }`

All links: `block hover:underline`, color `#3a7bd5`, arrow suffix.

#### Pane 4: Tox Assessment (conditionally shown)

Only shown when `selection.endpoint_label` exists (i.e., a specific endpoint row is selected in the evidence table, not just an organ).

Standard `ToxFindingForm` component -- keyed by `endpointLabel` (the selected endpoint). Not wrapped in a `CollapsiblePane`.

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected organ | Local | `useState<string \| null>` -- which organ is active in the rail |
| Active tab | Local | `useState<EvidenceTab>` -- "overview" or "table" |
| Selection (organ/endpoint) | Shared via context | `ViewSelectionContext` with `_view: "target-organs"` tag, bridged via `TargetOrgansViewWrapper` |
| Domain filter | Local | `useState<string \| null>` -- for Evidence table tab, clears on organ change |
| Sex filter | Local | `useState<string \| null>` -- for Evidence table tab, clears on organ change |
| Sorting | Local | `useState<SortingState>` -- TanStack sorting state (in EvidenceTableTab) |
| Column sizing | Local | `useState<ColumnSizingState>` -- TanStack column resize state (in EvidenceTableTab) |
| Rail width | Local | `useResizePanel(300, 180, 500)` |
| Rail search | Local | `useState<string>` inside OrganRail |
| Tier filter | Local (context panel) | `useState<Tier \| null>` -- filters InsightsList tiers |
| Collapse all | Local (context panel) | `useCollapseAll()` -- generation counters for expand/collapse |
| Organ summary data | Server | `useTargetOrganSummary` hook (React Query, 5min stale) |
| Evidence detail data | Server | `useOrganEvidenceDetail` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |

---

## Data Flow

```
useTargetOrganSummary(studyId)  --> organData (14 organs, TargetOrganRow[])
useOrganEvidenceDetail(studyId) --> evidenceData (357 rows, OrganEvidenceRow[])
useRuleResults(studyId)         --> ruleResults (shared React Query cache)
                                        |
                              sortedOrgans (evidence_score desc)
                                        |
                                OrganRail (search filter, auto-select top)
                                        |
                              [selectedOrgan] --> filter evidenceData
                                        |
                                organEvidenceRows
                                   /              \
                          OverviewTab          EvidenceTableTab
                          (domain breakdown,   (domain/sex filter,
                           top findings)        sortable grid,
                                                column resize)
                                \              /
                            OrganSelection (shared via ViewSelectionContext)
                                        |
                          TargetOrgansContextPanel
                             /     |       \       \
                      Convergence  Endpoints  Related  ToxAssessment
                      (InsightsList           Views    (conditional)
                       + tierFilter)
```

---

## Cross-View Navigation

### Inbound
- From other views with `location.state`: `{ organ_system: string }` -- auto-selects matching organ in rail, then clears history state.

### Outbound (Context panel -- Related views pane)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| "View dose-response" | `/studies/{studyId}/dose-response` | `{ organ_system }` |
| "View histopathology" | `/studies/{studyId}/histopathology` | `{ organ_system }` |
| "View NOAEL decision" | `/studies/{studyId}/noael-decision` | `{ organ_system }` |

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading target organ data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No organ selected (but data exists) | "Select an organ system to view evidence details." |
| No data at all | "No target organ data available." |
| Empty search results (rail) | "No matches for '{search}'" |
| No evidence rows (overview) | "No evidence rows for this organ." |
