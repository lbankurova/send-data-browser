# NOAEL Decision View

**Route:** `/studies/:studyId/noael-decision`
**Component:** `NoaelDecisionView.tsx` (wrapped by `NoaelDecisionViewWrapper.tsx`)
**Scientific question:** "What is the NOAEL and what are the dose-limiting adverse findings?"
**Role:** Definitive results and conclusions view. Absorbs signal content from the former Study Summary Signals tab to provide a complete picture: NOAEL determination, study-level statements, protective signals, adversity assessment, signal matrix, metrics, and rule inspection -- all scoped to the selected organ. Two-panel master-detail layout with persistent NOAEL banner, shell-level organ rail, and a 5-tab evidence panel.

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

The view itself is a flex column: persistent NOAEL Banner at top, then StudyStatementsBar, ProtectiveSignalsBar, optional PK warnings, then the evidence panel below. Organ selection is provided by the shell-level organ rail (not embedded in the view):

```
+-----------------------------------------------------------+
|  NOAEL Determination (persistent, non-scrolling)           |
|  [Combined card] [Males card] [Females card]               |
+-----------------------------------------------------------+
|  StudyStatementsBar (conditional — study-level statements,  |
|  modifiers, caveats from signals panel engine)              |
+-----------------------------------------------------------+
|  ProtectiveSignalsBar (conditional — R18/R19 protective     |
|  findings, three-tier classification)                       |
+-----------------------------------------------------------+
|  Dose proportionality warning (conditional — PK non-linear) |
+-----------------------------------------------------------+
|  Safety margin calculator (conditional — PK exposure data)  |
+-----------------------------------------------------------+
| OrganHeader                                                |
|  organ name, adverse count, recovery badge, summary text,  |
|  compact metrics (max |d|, min p)                          |
+-----------------------------------------------------------+
| [Evidence] [Adversity matrix] [Signal matrix] [Metrics]    |
| [Rules]  <── tab bar (5 tabs)                              |
+-----------------------------------------------------------+
| Tab content:                                               |
|  Evidence: endpoint summary, insights                      |
|  Adversity matrix: filters, matrix, grid                   |
|  Signal matrix: filters, organ-scoped heatmap              |
|  Metrics: sortable signal metrics table                    |
|  Rules: rule inspector with threshold editor               |
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

**PK Exposure integration (conditional):**
When `usePkIntegration(studyId)` returns `pkData?.available` and a "Combined" sex NOAEL row exists, the Combined card includes an `ExposureSection` component displaying:
- Cmax, AUC, HED (Human Equivalent Dose), MRSD (Maximum Recommended Starting Dose) from PK data
- Each metric as label + value in `text-[10px]`

**Safety Margin Calculator (conditional):**
Rendered below the banner cards when PK exposure data is available (`pkData.noael_exposure || pkData.loael_exposure`). Container: `shrink-0 border-b px-4 py-2`. `SafetyMarginCalculator` component provides:
- Interactive inputs for human Cmax and AUC values
- Computes NOAEL-based or LOAEL-based safety margins
- Displays calculated margins with interpretation

**Dose proportionality warning (conditional):**
Shown between the safety margin calculator and organ header when PK data indicates non-linear pharmacokinetics (supralinear, sublinear, or non-monotonic). Amber-colored warning bar: `shrink-0 border-b bg-amber-50 px-4 py-1.5`.

---

## Study Statements Bar (conditional)

**Component:** `StudyStatementsBar` (defined inline in `NoaelDecisionView.tsx`)

Rendered immediately after the NOAEL Banner. Only renders when at least one of `statements`, `studyModifiers`, or `studyCaveats` is non-empty.

**Data source:** `buildSignalsPanelData(noaelData, targetOrgans, signalData)` from `lib/signals-panel-engine.ts`, returning `SignalsPanelData`. The bar reads `panelData.studyStatements`, `panelData.modifiers`, and `panelData.caveats`.

Container: `shrink-0 border-b px-4 py-2`

### Study Statements

Each statement rendered as: `flex items-start gap-2 text-sm leading-relaxed`
- **StatementIcon** mapped by `icon` field:
  - `"fact"` — bullet `U+25CF` in `text-[10px] text-muted-foreground`
  - `"warning"` — triangle `U+25B2` in `text-[10px] text-amber-600`
  - `"review-flag"` — warning sign `U+26A0` in `text-[10px] text-amber-600`
- Text: `<span>{s.text}</span>`

### Study Modifiers

Filtered to items where `organSystem` is falsy (study-level only, not organ-scoped).

Container: `mt-1 space-y-0.5`

Each modifier: `flex items-start gap-2 text-xs leading-relaxed text-foreground/80`
- Icon: amber triangle `U+25B2` in `text-[10px] text-amber-600`
- Text span

### Study Caveats

Same filter as modifiers: only items where `organSystem` is falsy.

Container: `mt-1 space-y-0.5`

Each caveat: `flex items-start gap-2 text-xs leading-relaxed text-foreground/80`
- Icon: warning sign `U+26A0` in `text-[10px] text-amber-600`
- Text span

---

## Protective Signals Bar (conditional)

**Component:** `ProtectiveSignalsBar` (defined inline in `NoaelDecisionView.tsx`)

Rendered after the StudyStatementsBar. Only renders when `aggregateProtectiveFindings(rules)` produces at least one finding.

**Data source:** `ruleResults` filtered to R18/R19 rules, aggregated by `aggregateProtectiveFindings()`. Cross-domain correlates derived from `signalData` by matching the organ system of each protective finding's first specimen (via `specimenToOrganSystem()`).

Container: `shrink-0 border-b px-4 py-2`

### Header

`mb-1.5 flex items-center gap-2`
- Label: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` — "Protective signals"
- Count summary: `text-[10px] text-muted-foreground` — "{N} finding(s) with decreased incidence" + optional ` · {N} pharmacological · {N} treatment-related`

### Three-Tier Classification

Findings are classified via `classifyProtectiveSignal()` from `lib/protective-signal.ts` into three tiers, sorted: pharmacological first, then treatment-decrease, then background. Within each tier, sorted by control percentage descending.

**Pharmacological items** (prominent):
- Container: `border-l-2 border-l-blue-400 py-1 pl-2.5`
- Row 1: finding name (`text-[11px] font-semibold hover:underline`, clickable — navigates to histopathology view with specimen + finding) + sex (`text-[10px] font-medium text-muted-foreground`) + classification badge (`getProtectiveBadgeStyle("pharmacological")`)
- Row 2: incidence text `text-[10px] leading-snug text-muted-foreground` — "{ctrl}% control -> {high}% high dose in {specimens}"
- Row 3 (conditional): cross-domain correlates `text-[10px] text-muted-foreground/70` — "Correlated: {label} {dir}, ..." (up to 5)

**Treatment-decrease items** (medium prominence):
- Container: `border-l-2 border-l-slate-400 py-0.5 pl-2.5`
- Row 1: finding name (`text-[11px] font-medium hover:underline`, clickable) + sex + classification badge + right-aligned incidence `font-mono text-[10px] text-muted-foreground`
- Row 2 (conditional): specimens `text-[9px] text-muted-foreground/70`
- Row 3 (conditional): cross-domain correlates (same format as pharmacological)

**Background items** (compact):
- Sub-header: `text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50` — "Other decreased findings"
- Container: `border-l-2 border-l-gray-300 py-0.5 pl-2.5`
- Row: finding name (`text-[11px] font-medium hover:underline`, clickable) + sex + right-aligned incidence
- Capped at 5 items with overflow: `pl-2.5 text-[10px] text-muted-foreground/50` — "+{N} more"

---

## Organ Selection (shell-level rail)

The NOAEL view does **not** embed its own organ rail. Instead, it declares a preference for the shell-level organ rail via `useRailModePreference("organ")` in `NoaelDecisionViewWrapper`. The organ rail (`OrganRailMode` in `components/shell/`) provides organ selection, search, and sorting — shared with the study summary and target organs contexts.

The selected organ flows from `StudySelectionContext` (`studySelection.organSystem`). Organ items, sorting, and search are managed by `OrganRailMode` (see `docs/systems/navigation-and-layout.md`).

When the user clicks an organ in the shell rail, the view reads the selection and filters adverse effect data accordingly. Clicking an organ resets the TR filter to null and clears any endpoint selection. The sex filter is **not** reset because it is managed globally via `GlobalFilterContext`.

**Auto-select:** When data loads and no organ is selected, the first organ in `organSummaries` is auto-selected (via `useEffect` that sets `organSummaries[0].organ_system`).

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

Five tabs: **Evidence**, **Adversity matrix**, **Signal matrix**, **Metrics**, **Rules**

Active tab: `text-foreground` + `h-0.5 bg-primary` underline.
Inactive tab: `text-muted-foreground hover:text-foreground`.

When the Adversity matrix tab is active, `CollapseAllButtons` are rendered in the right slot of the tab bar via `ViewTabBar`'s `right` prop.

This matches the canonical tab bar pattern (CLAUDE.md hard rule).

---

## Evidence Tab

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

Sorted by: severity (adverse first) -> treatment-related -> max effect size desc. Click sets endpoint-level selection (finds representative row, updates context panel). Click again to deselect.

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

**Aggregation:** Takes worst severity per endpoint x dose across sexes.

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

**Table styling:** Header: `sticky top-0 z-10 bg-background`, `<tr>` with `border-b bg-muted/30`. Header cells: `relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50`. Body cells: `px-1.5 py-px`. Sort on double-click, sort indicators up/down arrows. Resize handles: `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none` with `bg-primary` when resizing, `hover:bg-primary/30` otherwise.

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

## Signal Matrix Tab

**Component:** `SignalMatrixTabInline` (defined inline in `NoaelDecisionView.tsx`)

Shows the `OrganGroupedHeatmap` (from `charts/OrganGroupedHeatmap.tsx`) in `singleOrganMode`, scoped to the selected organ. Only renders when `signalData` and `selectedOrgan` are present, and a matching `TargetOrganRow` exists.

### Filter Bar

Uses `StudySummaryFilters` component (imported from `StudySummaryFilters.tsx`). Container: `border-b bg-muted/30 px-4 py-2`.

Available filters: endpoint type, signal score minimum, sex, significant only. No organ dropdown — organ is already selected via the shell rail.

Local filter state: `useState<Filters>` with defaults `{ endpoint_type: null, organ_system: null, signal_score_min: 0, sex: null, significant_only: true }`.

### Heatmap

`OrganGroupedHeatmap` with `singleOrganMode` prop enabled. The `targetOrgans` array contains only the matching `TargetOrganRow` for the selected organ. Signal data is pre-filtered to `signalData.filter(r => r.organ_system === selectedOrgan)`.

Selection state: local `SignalSelection | null` (`localSignalSel`), shared with the Metrics tab.

---

## Metrics Tab

**Component:** `SignalMetricsTabInline` (defined inline in `NoaelDecisionView.tsx`)

Full sortable TanStack React Table showing signal metrics for the selected organ. Signal data is pre-filtered to `signalData.filter(r => r.organ_system === selectedOrgan)`.

### Filter Bar

Uses `FilterBar` component with `flex-wrap`.

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Sex | Dropdown | `FilterSelect` with "All sexes" / Male / Female | null (all) |
| Severity | Dropdown | `FilterSelect` with "All severities" / Adverse / Warning / Normal | null (all) |
| Significant only | Checkbox | `<input type="checkbox">` + label | false (unchecked) |

Row count indicator: `FilterBarCount` — "{N} rows".

### Table

TanStack React Table, `w-full text-[10px]`, client-side sorting with column resizing and content-hugging + absorber pattern.

**Content-hugging + absorber:** `endpoint_label` is the absorber column (`width: 100%`). All other columns use `width: 1px; white-space: nowrap`. Manual resize overrides with explicit width + maxWidth.

**12 Columns:**

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| endpoint_label | Endpoint | 160 (absorber) | `truncate font-medium` with `title` tooltip |
| domain | Domain | 55 | `<DomainLabel>` component |
| dose_label | Dose | 90 | `truncate` with `formatDoseShortLabel()` + `title` tooltip |
| sex | Sex | 40 | Plain text |
| signal_score | Score | 60 | `font-mono` wrapped in `SignalScorePopover` (clickable, shows score breakdown) |
| direction | Dir | 35 | `text-muted-foreground` via `getDirectionSymbol()` |
| p_value | p-value | 65 | `font-mono`, `font-semibold` if < 0.01 |
| trend_p | Trend p | 65 | `font-mono`, `font-semibold` if < 0.01 |
| effect_size | \|d\| | 55 | `font-mono`, `font-semibold` if abs >= 0.8 |
| severity | Severity | 70 | `rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-medium` |
| treatment_related | TR | 35 | `Y` (`font-semibold text-foreground`) or `N` (`text-muted-foreground/50`) |
| dose_response_pattern | Pattern | 90 | Underscores replaced with spaces; "none"/"flat" rendered as em dash in `text-muted-foreground/50` |

**Sorting:** Session-persisted via `useSessionState<SortingState>("pcc.noael.signals.sorting", [{ id: "signal_score", desc: true }])`. Default sort: signal_score descending. Sort on double-click.

**Column sizing:** Session-persisted via `useSessionState<ColumnSizingState>("pcc.noael.signals.columnSizing", {})`.

**Row interactions:** `cursor-pointer border-b transition-colors hover:bg-accent/50`, `bg-accent font-medium` on selection. Click to select/deselect (toggles `localSignalSel`). Empty state: "No rows match the current filters."

Selection state: shared `localSignalSel` (same as Signal Matrix tab).

---

## Rules Tab

**Component:** `RuleInspectorTab` (imported from `RuleInspectorTab.tsx`)

Provides rule browsing and inspection, filtered to the selected organ via the `organFilter` prop.

Props passed: `ruleResults={ruleResults ?? []}`, `organFilter={selectedOrgan}`, `studyId={studyId}`.

The `RuleInspectorTab` includes:
- Scope and severity filter dropdowns
- Rule catalog with fired counts per rule
- Threshold editor (`ThresholdEditor`)
- Custom insight rule builder (`CustomInsightRuleBuilder`)

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/noael-decision`, shows `NoaelContextPanel`.

The `NoaelContextPanelWrapper` in `ContextPanel.tsx` fetches `aeData` and `ruleResults` via hooks and passes as props. Selection flows from `ViewSelectionContext`. The context panel also fetches NOAEL data directly via `useNoaelSummary(studyId)` to generate narrative text (not passed as a prop from the wrapper).

### No Selection State

Header: `flex items-center justify-end border-b px-4 py-1.5` with `CollapseAllButtons` (right-aligned, no title).

Panes:
1. **NOAEL rationale** (CollapsiblePane, default open) — narrative text from `generateNoaelNarrative()` in `text-[11px] leading-relaxed text-foreground/80`. Below: "Dose-limiting findings at LOAEL" section (if present) with clickable finding buttons: `flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[10px] hover:bg-muted/40` — finding name (`font-medium`) + `DomainLabel` + right-aligned stats (`ml-auto text-muted-foreground` — "|d|={ES}, p={P}").
2. **Insights** (CollapsiblePane, default open) — `InsightsList` with rules where `scope === "study"`. `onEndpointClick` navigates to dose-response view.
3. Footer: `px-4 py-3 text-xs text-muted-foreground` — "Select an endpoint to view adversity rationale."

Note: NOAEL summary table and confidence factors were removed (RED-02) — the persistent banner already shows sex x NOAEL x LOAEL x confidence numerics. Duplicating them in the context panel added no interpretive value.

### With Selection

Header: sticky, endpoint name (`text-sm font-semibold`) + `CollapseAllButtons`. Below: sex + dose level info. `TierCountBadges` for tier filtering.

Panes (ordered per design system priority — insights -> stats -> annotation -> navigation):
1. **Insights** (default open) — `InsightsList` with endpoint-scoped rules + `tierFilter` from header badges
2. **Adversity rationale** (default open) — dose-level rows for selected endpoint + sex, with p-value, effect size, severity text colored via `getSeverityDotColor()`. Empty state: "No data for selected endpoint."
3. **Tox Assessment** — `ToxFindingForm` keyed by endpoint_label, with `systemSuggestion` derived from the best row (preferring adverse) via `deriveToxSuggestion()`
4. **Related views** (default closed) — "View dose-response" (passes endpoint_label + organ_system), "View study summary" (passes organ_system), "View histopathology" (passes organ_system)

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected organ | Shared via context | `StudySelectionContext` (`studySelection.organSystem`) — set by shell-level organ rail |
| Active tab | Session-persisted | `useSessionState<EvidenceTab>("pcc.noael.tab", "overview")` — `"overview"` \| `"matrix"` \| `"signal-matrix"` \| `"metrics"` \| `"rules"` |
| Selection (endpoint) | Local | `useState<NoaelSelection \| null>` — endpoint + dose + sex selection, bridged to `ViewSelectionContext` with `_view: "noael"` tag |
| Local signal selection | Local | `useState<SignalSelection \| null>` — shared between Signal matrix and Metrics tabs for signal-level row selection |
| Sex filter | Global | `GlobalFilterContext` (`globalFilters.sex`) — shared across views, persists when switching organs |
| TR filter | Local | `useState<string \| null>` — for Adversity matrix tab, reset to null on organ change |
| Adversity matrix sorting | Session-persisted | `useSessionState<SortingState>("pcc.noael.sorting", [])` — TanStack sorting state (in AdversityMatrixTab) |
| Adversity matrix column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.noael.columnSizing", {})` — TanStack column resize state (in AdversityMatrixTab) |
| Signal metrics sorting | Session-persisted | `useSessionState<SortingState>("pcc.noael.signals.sorting", [{ id: "signal_score", desc: true }])` — TanStack sorting state (in SignalMetricsTabInline) |
| Signal metrics column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.noael.signals.columnSizing", {})` — TanStack column resize state (in SignalMetricsTabInline) |
| Signal matrix filters | Local | `useState<Filters>` — endpoint_type, signal_score_min, sex, significant_only (in SignalMatrixTabInline) |
| Signal metrics filters | Local | `useState<MetricsFilters>` — sex, severity, significant_only (in SignalMetricsTabInline) |
| Section heights | Local (AdversityMatrixTab) | `useAutoFitSections` — matrix section (250px default, 80-500px) |
| Expand/collapse all | Local | `useCollapseAll` — `expandGen`/`collapseGen` counters for ViewSection and CollapseAllButtons |
| Rail width | Shell | Managed by shell-level `OrganRailMode` (not embedded in this view) |
| NOAEL summary data | Server | `useEffectiveNoael` hook — merges `useNoaelSummary` (React Query, 5min stale) with `useAnnotations<NoaelOverride>` override annotations |
| NOAEL override annotations | Server | `useAnnotations<NoaelOverride>(studyId, "noael-override")` — override edits saved via `useSaveAnnotation` |
| Adverse effect data | Server | `useAdverseEffectSummary` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |
| Signal summary data | Server | `useStudySignalSummary` hook (React Query, 5min stale) — `SignalSummaryRow[]` |
| Target organ data | Server | `useTargetOrganSummary` hook (React Query, 5min stale) — `TargetOrganRow[]` |
| Panel data (derived) | Local (memo) | `buildSignalsPanelData(noaelData, targetOrgans, signalData)` — returns `SignalsPanelData` with `studyStatements`, `modifiers`, `caveats`, `organBlocks`, `metrics` |
| Recovery data | Server | `useOrganRecovery` hook — fetches histopath subject data per MI/MA specimen, derives recovery assessments via `deriveRecoveryAssessments()`. Returns `{ bySpecimen, byEndpointLabel, assessmentByLabel, overall, hasRecovery, recoveryDaysBySpecimen }` |
| PK integration | Server | `usePkIntegration(studyId)` — returns `{ available, cmax, auc, hed, mrsd, doseProportionality }` |

---

## Data Flow

```
useEffectiveNoael(studyId)        --> noaelData (3 rows: M/F/Combined, merged with overrides)
useAdverseEffectSummary(studyId)  --> aeData (357 rows)
useRuleResults(studyId)           --> ruleResults (shared React Query cache)
useStudySignalSummary(studyId)    --> signalData (SignalSummaryRow[])
useTargetOrganSummary(studyId)    --> targetOrgans (TargetOrganRow[])
usePkIntegration(studyId)         --> pkData

                  buildSignalsPanelData(noaelData, targetOrgans, signalData)
                                        |
                                   panelData --> StudyStatementsBar
                                        |        (studyStatements, modifiers, caveats)
                                        |
                  aggregateProtectiveFindings(ruleResults)
                                        |
                                   findings --> ProtectiveSignalsBar
                                        |        (pharmacological, treatment-decrease, background)
                                        |
                            deriveOrganSummaries(aeData) --> OrganSummary[]
                                        |
                            [selectedOrgan] --> filter aeData + signalData
                                        |
                                organData --> deriveEndpointSummaries()
                                        |
                            extract MI/MA specimens from organData
                                        |
                            useOrganRecovery(studyId, specimens)
                                        |
                                organRecovery --> { bySpecimen, byEndpointLabel,
                                                    assessmentByLabel, overall, hasRecovery }
                                   /     |      |       |       \
                          OverviewTab  Adversity Signal  Metrics  Rules
                          (endpoints,  MatrixTab MatrixTab (sortable (rule
                           insights,   (matrix + (heatmap, table,   inspector,
                           recovery)    grid,     filters, filters) thresholds)
                                        sex/TR    single
                                        filter,   organ
                                        recovery  mode)
                                        column)
                                  \              /
                              NoaelSelection / SignalSelection
                              (shared via ViewSelectionContext)
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

### Outbound (NOAEL Banner — finding click)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| Click LOAEL finding in card | Selects organ in rail, switches to Evidence tab | `{ organSystem }` via `navigateTo()` |

### Outbound (ProtectiveSignalsBar — finding click)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| Click protective finding name | `/studies/{studyId}/histopathology` | `{ specimen, finding }` via `location.state` |

---

## Keyboard

- **Escape**: clears endpoint-level selection and `ViewSelectionContext` (via `keydown` listener on `window`)

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading NOAEL data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No organ selected (but data exists) | "Select an organ system from the shell rail to view adverse effect details." |
| No data at all | "No adverse effect data available." |
| Empty search results (rail) | "No matches for '{search}'" |
| No data for organ (both tabs empty) | "No data for this organ." |
| No endpoints for organ (overview) | "No endpoints for this organ." |
| No rows after filter (matrix or metrics) | "No rows match the current filters." |
| >200 filtered rows (adversity grid) | Truncation message below grid |
| Signal matrix: no matching target organ | Tab renders nothing (returns null) |
