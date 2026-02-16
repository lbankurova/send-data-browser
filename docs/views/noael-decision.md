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
- Status area: `flex items-center gap-1.5`
  - If override exists: `text-[10px] font-medium text-blue-600` — "Overridden"
  - If no override: `text-[10px] font-medium` — "Established" (green `#15803d`) or "Not established" (red `#dc2626`)
  - Pencil edit button: `text-muted-foreground/40 hover:text-muted-foreground`, Lucide `Pencil` icon (h-3 w-3). Toggles inline override form.

**Row 2+:** `space-y-0.5 text-[11px]`
- NOAEL: `flex justify-between` — label `text-muted-foreground`, value `font-medium`. If override: shows override value + original value in `text-[10px] text-muted-foreground line-through` strikethrough.
- LOAEL: label `text-muted-foreground`, value `font-medium` — `formatDoseShortLabel(loael_label)`
- Adverse at LOAEL: label `text-muted-foreground`, value `font-medium` — count
- Override rationale (if override exists and not editing): `mt-0.5 text-[10px] italic text-muted-foreground line-clamp-2` with `title` tooltip for full text
- LOAEL dose-limiting findings (if present): `mt-0.5 text-[10px] text-muted-foreground` — up to 3 finding buttons (`hover:text-foreground hover:underline`) with DomainLabel chips, separated by `·`. Each clicks `onFindingClick`. "+N more" overflow if > 3.
- Confidence (if `noael_confidence != null` and no override): label `text-muted-foreground`, value wrapped in `ConfidencePopover` — clickable `font-medium` with color (`text-green-700` >= 80%, `text-amber-700` >= 60%, `text-red-700` < 60%) showing percentage. Popover shows confidence breakdown and comparison across sexes.
- Domain badges (if `adverse_domains_at_loael` not empty and no override): `mt-1 flex flex-wrap gap-1` — `DomainLabel` components (plain colored text, no background)

**Inline override form (conditional, when editing):**
- Container: `mt-2 rounded-md border border-dashed border-primary/30 bg-muted/10 p-2`
- Title: `mb-1.5 text-[10px] font-semibold` — "Override NOAEL determination"
- Dose select: `w-full rounded border bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary` — options from unique dose labels in aeData + "Not established"
- Rationale textarea: same styling, `rows={2}`, placeholder "Required — explain why..."
- Buttons: Cancel (`text-muted-foreground hover:bg-muted/40`), Save (`bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50`). Save disabled if no rationale or no change.

**Narrative summary (below cards):**
- Container: `mt-2 line-clamp-3 text-xs leading-relaxed text-foreground/80`
- Generated via `generateNoaelNarrative()` from `lib/noael-narrative.ts`
- If sexes have different NOAEL levels (divergent): shows "Males: {narrative}" + "Females: {narrative}" with `font-medium` labels
- Otherwise: shows single combined narrative

---

## Organ Selection (shell-level rail)

The NOAEL view does **not** embed its own organ rail. Instead, it declares a preference for the shell-level organ rail via `useRailModePreference("organ")` in `NoaelDecisionViewWrapper`. The organ rail (`OrganRailMode` in `components/shell/`) provides organ selection, search, and sorting — shared with the study summary and target organs contexts.

The selected organ flows from `StudySelectionContext` (`studySelection.organSystem`). Organ items, sorting, and search are managed by `OrganRailMode` (see `docs/systems/navigation-and-layout.md`).

When the user clicks an organ in the shell rail, the view reads the selection and filters adverse effect data accordingly. Clicking an organ resets the TR filter to null and clears any endpoint selection. The sex filter is **not** reset because it is managed globally via `GlobalFilterContext`.

---

## Organ Header

`shrink-0 border-b px-4 py-3`

- Organ name: `text-sm font-semibold` (displayed via `titleCase()` from `severity-colors.ts`)
- Adverse badge (if adverseCount > 0): `rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground` — "{N} adverse" (neutral bordered pill, matching S-05 badge padding)
- Recovery badge (if recovery data present and organ has an overall verdict): `rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground` — shows verdict arrow + verdict text (e.g., "reversed", "persistent"). Uses `verdictArrow()` from `recovery-assessment.ts`.
- Summary text: `mt-1 text-xs leading-relaxed text-muted-foreground` — "{N} endpoints across {D} domains, {M} adverse, {T} treatment-related."
- Compact metrics: `mt-2 flex flex-wrap gap-3 text-[11px]` — max |d| (font-mono, font-semibold if >= 0.8), min p (font-mono, font-semibold if < 0.01). Typography-only, no color.

---

## Tab Bar

Uses `ViewTabBar` component with `flex shrink-0 items-center border-b bg-muted/30`.

Two tabs: **Evidence** and **Adversity matrix**

Active tab: `text-foreground` + `h-0.5 bg-primary` underline.
Inactive tab: `text-muted-foreground hover:text-foreground`.

When the Adversity matrix tab is active, `CollapseAllButtons` are rendered in the right slot of the tab bar via `ViewTabBar`'s `right` prop.

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
- Recovery verdict (if recovery data present, MI/MA domain endpoints only): `shrink-0 text-[9px] text-muted-foreground` — shows verdict arrow + verdict text via `verdictArrow()`. Only shown for endpoints with meaningful recovery verdicts (not "not_observed" or "no_data").

All evidence columns use neutral muted text except domain codes, which use colored text via `<DomainLabel>` per the domain label hard rule.

Sorted by: severity (adverse first) → treatment-related → max effect size desc. Click sets endpoint-level selection (finds representative row, updates context panel). Click again to deselect.

### Insights

Only shown when organ-scoped rule results exist. Section header: "Insights". Uses `InsightsList` component with rules filtered to the selected organ (matches on `organ_system`, `output_text` containing organ name, or `context_key` containing organ key). `onEndpointClick` callback navigates to dose-response view with the clicked organ system.

---

## Adversity Matrix Tab

Two zones: filter bar + scrollable content (adversity matrix in `ViewSection mode="fixed"` + adverse effect grid in `ViewSection mode="flex"`), scoped to the selected organ. Uses `useAutoFitSections` with matrix section default 250px (80-500px).

### Filter Bar

Uses `FilterBar` component (standard `border-b bg-muted/30 px-4 py-2` layout).

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Sex | Dropdown | `FilterSelect` with "All sexes" / Male / Female | Global (`GlobalFilterContext`) |
| Treatment related | Dropdown | `FilterSelect` with "All TR status" / "Treatment-related" / "Not treatment-related" | All (local) |

No organ dropdown (organ already selected via rail). Row count indicator: `FilterBarCount` component, "{filtered} of {total} findings".

### Adversity Matrix

Only shown when `matrixData.endpoints.length > 0`. Container: `border-b p-4`.

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Adversity matrix ({N} endpoints)"

**Structure:** `overflow-x-auto` > `inline-block` — horizontal scrollable flex layout.

**Header row:** Endpoint label column `w-48 shrink-0` + dose columns each `w-16 shrink-0 text-center text-[10px] font-medium text-muted-foreground`. Dose headers use `DoseHeader` component, showing actual dose labels (from allAeData), falling back to "Dose {level}".

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

Rendered inside `ViewSection mode="flex"` with title "Adverse effect summary ({N})" where N is the filtered count.

TanStack React Table, `w-full text-[10px]`, client-side sorting with column resizing and content-hugging + absorber pattern. Scoped to selected organ.

**Table styling:** Header: `sticky top-0 z-10 bg-background`, `<tr>` with `border-b bg-muted/30`. Header cells: `relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50`. Body cells: `px-1.5 py-px`. Sort on double-click, sort indicators `↑`/`↓`. Resize handles: `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none` with `bg-primary` when resizing, `hover:bg-primary/30` otherwise.

**Content-hugging + absorber:** All columns except `endpoint_label` (the absorber) use `width: 1px; white-space: nowrap`. The absorber uses `width: 100%`. Manual resize overrides with explicit width + maxWidth.

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| endpoint_label | Endpoint | Truncated at 30 chars with ellipsis, `title` tooltip |
| domain | Domain | Plain colored text: `text-[9px] font-semibold` with `getDomainBadgeColor().text` |
| dose_level | Dose | Shows `DoseLabel` component with dose level + first segment of `dose_label` |
| sex | Sex | Plain text |
| p_value | P-value | `ev font-mono` — interaction-driven evidence color (neutral at rest, `#DC2626` on row hover/selection via `ev` CSS class) |
| effect_size | Effect | `ev font-mono` — interaction-driven evidence color |
| direction | Dir | `text-sm text-muted-foreground` via `getDirectionSymbol()` |
| severity | Severity | `text-muted-foreground` (plain text) |
| treatment_related | TR | `text-muted-foreground` — "Yes" or "No" |
| dose_response_pattern | Pattern | `text-muted-foreground`, underscores replaced with spaces |
| recovery | Recovery | **Conditional column** — only present when `recovery.hasRecovery` is true. For MI/MA domain rows: shows verdict arrow + verdict text (`text-[9px]`, `font-medium text-foreground/70` for persistent/progressing, else `text-muted-foreground`). Tooltip shows full recovery assessment details via `buildRecoveryTooltip()`. For non-MI/MA rows: em dash. |

Row cap: 200 rows with truncation message ("Showing first 200 of {N} rows. Use filters to narrow results."). Row interactions: `cursor-pointer border-b transition-colors hover:bg-accent/50`, `bg-accent font-medium` on selection. Click to select/deselect. Empty state: "No rows match the current filters."

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/noael-decision`, shows `NoaelContextPanel`.

The `NoaelContextPanelWrapper` in `ContextPanel.tsx` fetches `aeData` and `ruleResults` via hooks and passes as props. Selection flows from `ViewSelectionContext`. (`noaelData` is not passed — the banner already shows all NOAEL numerics, so the context panel focuses on narrative interpretation.)

### No Selection State

Header: `flex items-center justify-end border-b px-4 py-1.5` with `CollapseAllButtons` (right-aligned, no title).

Panes:
1. **NOAEL rationale** (CollapsiblePane, default open) — narrative text from `generateNoaelNarrative()` in `text-[11px] leading-relaxed text-foreground/80`. Below: "Dose-limiting findings at LOAEL" section (if present) with clickable finding buttons: `flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[10px] hover:bg-muted/40` — finding name (`font-medium`) + `DomainLabel` + right-aligned stats (`ml-auto text-muted-foreground` — "|d|={ES}, p={P}").
2. **Insights** (CollapsiblePane, default open) — `InsightsList` with rules where `scope === "study"`. `onEndpointClick` navigates to dose-response view.
3. Footer: `px-4 py-3 text-xs text-muted-foreground` — "Select an endpoint to view adversity rationale."

Note: NOAEL summary table and confidence factors were removed (RED-02) — the persistent banner already shows sex × NOAEL × LOAEL × confidence numerics. Duplicating them in the context panel added no interpretive value.

### With Selection

Header: sticky, endpoint name (`text-sm font-semibold`) + `CollapseAllButtons`. Below: sex + dose level info. `TierCountBadges` for tier filtering.

Panes (ordered per design system priority — insights → stats → annotation → navigation):
1. **Insights** (default open) — `InsightsList` with endpoint-scoped rules + `tierFilter` from header badges
2. **Adversity rationale** (default open) — dose-level rows for selected endpoint + sex, with p-value, effect size, severity text colored via `getSeverityDotColor()`. Empty state: "No data for selected endpoint."
3. **Tox Assessment** — `ToxFindingForm` keyed by endpoint_label, with `systemSuggestion` derived from the best row (preferring adverse) via `deriveToxSuggestion()`
4. **Related views** (default closed) — "View dose-response" (passes endpoint_label + organ_system), "View study summary" (passes organ_system), "View histopathology" (passes organ_system)

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected organ | Shared via context | `StudySelectionContext` (`studySelection.organSystem`) — set by shell-level organ rail |
| Active tab | Session-persisted | `useSessionState<EvidenceTab>("pcc.noael.tab", "overview")` — "overview" (Evidence tab) or "matrix" (Adversity matrix tab) |
| Selection (endpoint) | Local | `useState<NoaelSelection \| null>` — endpoint + dose + sex selection, bridged to `ViewSelectionContext` with `_view: "noael"` tag |
| Sex filter | Global | `GlobalFilterContext` (`globalFilters.sex`) — shared across views, persists when switching organs |
| TR filter | Local | `useState<string \| null>` — for Adversity matrix tab, reset to null on organ change |
| Sorting | Session-persisted | `useSessionState<SortingState>("pcc.noael.sorting", [])` — TanStack sorting state (in AdversityMatrixTab) |
| Column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.noael.columnSizing", {})` — TanStack column resize state (in AdversityMatrixTab) |
| Section heights | Local (AdversityMatrixTab) | `useAutoFitSections` — matrix section (250px default, 80-500px) |
| Expand/collapse all | Local | `useCollapseAll` — `expandGen`/`collapseGen` counters for ViewSection and CollapseAllButtons |
| Rail width | Shell | Managed by shell-level `OrganRailMode` (not embedded in this view) |
| NOAEL summary data | Server | `useEffectiveNoael` hook — merges `useNoaelSummary` (React Query, 5min stale) with `useAnnotations<NoaelOverride>` override annotations |
| NOAEL override annotations | Server | `useAnnotations<NoaelOverride>(studyId, "noael-override")` — override edits saved via `useSaveAnnotation` |
| Adverse effect data | Server | `useAdverseEffectSummary` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |
| Recovery data | Server | `useOrganRecovery` hook — fetches histopath subject data per MI/MA specimen, derives recovery assessments via `deriveRecoveryAssessments()` |

---

## Data Flow

```
useEffectiveNoael(studyId)        ──> noaelData (3 rows: M/F/Combined, merged with overrides)
useAdverseEffectSummary(studyId)  ──> aeData (357 rows)
useRuleResults(studyId)           ──> ruleResults (shared React Query cache)
                                          |
                              deriveOrganSummaries() → OrganSummary[]
                                          |
                              [selectedOrgan] → filter aeData
                                          |
                                  organData → deriveEndpointSummaries()
                                          |
                              extract MI/MA specimens from organData
                                          |
                              useOrganRecovery(studyId, specimens)
                                          |
                                  organRecovery → { bySpecimen, byEndpointLabel,
                                                    assessmentByLabel, overall, hasRecovery }
                                     /              \
                            OverviewTab          AdversityMatrixTab
                            (endpoints,          (matrix + grid,
                             insights,            sex/TR filter,
                             recovery)            recovery column)
                                  \              /
                              NoaelSelection (shared via ViewSelectionContext)
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
| "View study summary" | `/studies/{studyId}` | `{ organ_system }` (if available) |
| "View histopathology" | `/studies/{studyId}/histopathology` | `{ organ_system }` (if available) |

### Outbound (Overview tab — Insights `onEndpointClick`)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| Click organ name in insight | `/studies/{studyId}/dose-response` | `{ organ_system }` |

---

## Keyboard

- **Escape**: clears endpoint-level selection and `ViewSelectionContext` (via `keydown` listener on `window`)

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
