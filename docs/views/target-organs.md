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
+--[300px*]-+-+---------------------------------------[flex-1]-+
|            |R| OrganSummaryHeader                              |
| Organ      |e|  organ name, TARGET + sex badges, conclusion,  |
| Rail       |s|  compact metrics (max signal, evidence, endpts)|
|            |i+------------------------------------------------+
| search     |z| [Overview] [Evidence table]  <-- tab bar        |
| organ 1    |e+------------------------------------------------+
| organ 2    | | Tab content:                                    |
| organ 3    | |  Overview: domain breakdown, coherence, insights|
| ...        | |  Evidence table: filters, sortable grid         |
|            | |                                                  |
+------------+-+------------------------------------------------+
             ^ PanelResizeHandle (4px)
* default 300px, resizable 180-500px via useResizePanel
```

The evidence panel has a subtle muted background (`bg-muted/5`) to visually distinguish it from the crisp-white context panel where conclusions live.

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

**Row 2:** Evidence bar -- neutral gray alignment matching Signals and Histopathology rails. Track: `h-1.5 flex-1 rounded-full bg-[#E5E7EB]`, fill: `bg-[#D1D5DB]`. Width proportional to `evidence_score / maxEvidenceScore` (minimum 4%). Numeric value: `shrink-0 font-mono text-[10px] tabular-nums`, font-semibold for >= 0.5, font-medium for >= 0.3.

**Row 3:** Stats line -- `{N} sig · {M} TR · {D} domains` + domain chips (plain colored text: `text-[9px] font-semibold` with domain-specific color class via `getDomainBadgeColor().text`).

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

### Title row (flex, gap-2)

- Organ name: `text-sm font-semibold` (uses `titleCase()`)
- TARGET ORGAN badge (if `target_organ_flag`): `text-[10px] font-semibold uppercase text-[#DC2626]`
- Sex specificity badge: `rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground` -- "Male only" | "Female only" | "Both sexes". Derived from unique `sex` values in `organEvidenceRows` via `deriveSexLabel()`.

### 1-line conclusion

`mt-1 text-[11px] italic leading-relaxed text-muted-foreground`

Deterministic sentence built by `deriveOrganConclusion()` from:
- **Convergence**: "convergent evidence" (if target_organ_flag) or "evidence"
- **Domains**: "across {N} domain(s)"
- **Significance**: "{sig}/{total} significant ({pct}%)"
- **Sex**: from `deriveSexLabel()` (lowercase)
- **Dose relationship**: "dose-dependent" if R01/R04 rules present, else from `getDoseConsistency()` -- "dose-trending" (Strong), "some dose pattern" (Moderate), "no clear dose pattern" (Weak)

Example: *"Convergent evidence across 3 domains, 8/15 significant (53%), both sexes, dose-dependent."*

### Compact metrics

`mt-2 flex flex-wrap gap-3 text-[11px]` -- max signal score (font-mono), evidence score (font-mono, font-semibold if >= 0.5), endpoint count.

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

Section header: flex row with title + dose consistency badge.
- Title: `text-xs font-medium uppercase tracking-wide text-muted-foreground` -- "Domain breakdown"
- Dose consistency badge: `text-[10px] text-muted-foreground` -- "Dose consistency: {Weak|Moderate|Strong}". Computed by `getDoseConsistency()` which checks significance-rate monotonicity across dose levels per endpoint.

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

### Cross-Organ Coherence Hint

Rendered between "Top findings" and "Insights" when R16 rules are relevant. Two possible lines, both `text-[11px] text-muted-foreground`:

1. **Convergent endpoints** (if R16 rules match this organ's `organ_system`): "Convergent findings: {endpoint1}, {endpoint2}, ..."
   - Extracts endpoint names from R16 `output_text` matching pattern `"{endpoints} show convergent pattern"`.
2. **Related organs** (if other organs share endpoint labels with this organ's evidence): "Related findings also observed in {other_organ}."
   - Scans all R16 rules for other organs whose output_text mentions any of this organ's endpoint labels.
   - Organ names displayed via `titleCase()`.

If no R16 match found, nothing is rendered (no empty state).

### Insights

Only shown when organ-scoped rule results exist. Section header: "Insights". Uses `InsightsList` component with `organRules` (pre-filtered at parent level -- matches on `context_key === "organ_{organ_system}"` or `organ_system === selectedOrgan`).

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
| domain | Domain | Plain colored text: `text-[10px] font-semibold` with `getDomainBadgeColor().text` color class |
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

## Helper Functions

### `deriveSexLabel(rows: OrganEvidenceRow[]): string`
Returns "Male only", "Female only", or "Both sexes" based on unique `sex` values in the organ's evidence rows.

### `getDoseConsistency(rows: OrganEvidenceRow[]): "Weak" | "Moderate" | "Strong"`
Groups rows by endpoint, computes significance-rate-per-dose-level, checks monotonicity.
- **Strong**: >50% of endpoints monotonic AND >=3 dose groups with significant findings
- **Moderate**: some monotonic OR >=2 dose groups with significant findings
- **Weak**: everything else

### `deriveOrganConclusion(organ, evidenceRows, organRules): string`
Builds a deterministic 1-line conclusion from convergence status, domain spread, significance, sex, and dose relationship.

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
- Domain chip: plain colored text (`text-[9px] font-semibold` with `getDomainBadgeColor().text` color class)
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
| Organ rules | Derived | `useMemo` -- rules filtered to selected organ, shared between header and overview tab |
| Tier filter | Local (context panel) | `useState<Tier \| null>` -- filters InsightsList tiers |
| Collapse all | Local (context panel) | `useCollapseAll()` -- generation counters for expand/collapse |
| Organ summary data | Server | `useTargetOrganSummary` hook (React Query, 5min stale) |
| Evidence detail data | Server | `useOrganEvidenceDetail` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel and center view) |

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
                              organEvidenceRows --> organRules (filtered at parent)
                                        |
                              deriveSexLabel() / getDoseConsistency()
                              deriveOrganConclusion()
                                   /              \
                          OverviewTab          EvidenceTableTab
                          (domain breakdown,   (domain/sex filter,
                           dose consistency,    sortable grid,
                           top findings,        column resize)
                           coherence hints,
                           insights)
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
