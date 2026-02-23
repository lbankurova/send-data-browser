# Findings View (formerly Adverse Effects)

**Route:** `/studies/:studyId/findings` (primary). Legacy redirects: `/studies/:studyId/adverse-effects` and `/studies/:studyId/analyses/adverse-effects` both redirect to `/findings`.
**Wrapper:** `FindingsViewWrapper.tsx` (in `components/analysis/findings/`) — sets `useRailModePreference("findings")`, renders `FindingsView`
**Component:** `FindingsView.tsx` (in `components/analysis/findings/`)
**Scientific question:** "What are all the findings and how do they compare across dose groups?"
**Role:** Dynamic server-side adverse effects analysis. Two-zone layout (quadrant scatter + sortable findings table), with FindingsRail in the left panel and detailed context panel.

**Key difference from other views:** This view uses **server-side filtering** (not pre-generated JSON). Data is fetched from `/api/studies/{studyId}/analyses/adverse-effects` with all results loaded at once (page=1, pageSize=10000, empty filters). Sorting is client-side via TanStack React Table. The view derives `EndpointSummary[]`, cross-domain syndromes, lab rule matches, and signal scores from the raw findings data for the scatter plot and analytics context.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Findings   |  Findings View             | Context    |
| Rail       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself uses a flex column layout (`flex h-full flex-col overflow-hidden`) with no page-level padding:

```
+-----------------------------------------------------------+
|  StudyBanner (conditional — study context info)            |  border-b
+-----------------------------------------------------------+
|  MortalityBanner (conditional — early death summary)       |  border-b
+-----------------------------------------------------------+
|  [Findings]                        N adverse N warning N normal |  <-- FilterBar
+-----------------------------------------------------------+
|  Quadrant scatter (ViewSection, resizable)                 |
|  (FindingsQuadrantScatter)                                 |
+-----------------------------------------------------------+
|  FindingsTable (TanStack React Table)                      |
|  (flex-1 overflow-hidden, fills remaining space)           |
+-----------------------------------------------------------+
```

---

## Study Banner (conditional)

`StudyBanner` component renders when `studyContext` is available. Shows study-level context: species, strain, study type, dose group count, tumor animal count if available.

## Mortality Banner (conditional)

`MortalityBanner` component renders when `mortalityData` is available. Shows early death summary information.

---

## Filter Bar

Uses the shared `FilterBar` container component: `flex items-center gap-2 border-b bg-muted/30 px-4 py-2`.

The FilterBar contains:
- "Findings" label: `text-xs font-semibold`
- Summary badges (right-aligned via `ml-auto`): `flex items-center gap-2 text-[10px] text-muted-foreground` — "{N} adverse", "{N} warning", "{N} normal"

**Note:** The `FindingsFilterBar` component exists separately but is **not** used in the main FindingsView. Filtering is handled through the FindingsRail (left panel) which manages endpoint grouping, scoping, and exclusion. The center panel FilterBar only displays summary counts.

---

## Quadrant Scatter

Rendered inside `ViewSection mode="fixed"` when endpoint summaries are available. Height managed by `useAutoFitSections` with "findings" section key (default ~40% viewport height, 80-2000px).

**Component:** `FindingsQuadrantScatter` — interactive scatter plot of endpoints by statistical significance (p-value) vs effect size. Props include: endpoints, selectedEndpoint, organCoherence, syndromes, labMatches.

**Interactions:**
- Click dot: selects endpoint (fires `onSelect`)
- Ctrl+click dot: excludes endpoint from rail (fires `onExclude`)
- Selected point details passed via `onSelectedPointChange`

---

## Findings Table

### Structure

TanStack React Table (`useReactTable`) with client-side sorting and column resizing. Table element: `<table>` with `w-full text-[10px]`. Wrapped in `flex-1 overflow-hidden` (fills remaining vertical space below scatter).

### TanStack Table Features

- **Sorting:** Double-click a column header to toggle sort. Sort indicators `↑` (asc) / `↓` (desc) appended to header text. Session-persisted via `useSessionState("pcc.findings.sorting", [])`.
- **Column resizing:** Drag resize handle on column borders. Resize handle: `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none`. Shows `bg-primary` when actively resizing, `hover:bg-primary/30` otherwise. Session-persisted via `useSessionState("pcc.findings.columnSizing", {})`.
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

Route-detected: when pathname matches regex `/\/studies\/[^/]+\/(findings|(analyses\/)?adverse-effects)/`, shows `FindingsContextPanel` (uses `FindingSelectionContext`). This regex matches both the primary `/findings` path and the legacy adverse-effects paths.

### No Selection State

Three selection priorities:
1. **Endpoint selected** → endpoint-level panel (see "With Selection" below)
2. **Group selected** (`selectedGroupType === "organ"`) → `OrganContextPanel` for the organ key
3. **Syndrome selected** (`selectedGroupType === "syndrome"`) → `SyndromeContextPanel` for the syndrome ID
4. **Nothing selected** → empty state:
   - Header: `text-sm font-semibold` -- "Findings" (`<h3>` with `mb-2`)
   - Message: "Select a finding row to view detailed analysis."
   - `p-4 text-xs text-muted-foreground`

### Loading State
- `Skeleton` components: h-4 w-2/3, then h-20 w-full x3
- `space-y-3 p-4`

### With Selection

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Row: `flex items-center justify-between`
- Finding name: `text-sm font-semibold` (`<h3>`)
- Expand/collapse all buttons: `CollapseAllButtons` component in the header row (right side)
- Subtitle: "{domain} | {sex} | Day {day}" (or "Terminal" if day is null) in `text-[10px] text-muted-foreground`

#### Verdict pane (always visible, not in CollapsiblePane)
`VerdictPane` component — treatment-relatedness assessment with analytics, NOAEL context, dose-response data, and statistics. Rendered in a `border-b px-4 py-3` container outside of CollapsiblePane.

#### Pane 1: Evidence (default open)
`EvidencePane` component — statistical evidence summary with finding data, analytics, statistics, and effect size context.

#### Pane 2: Dose detail (default open)
`DoseDetailPane` component — dose-level detail table with statistics and dose-response data. Header right shows unit when available.

#### Pane 3: Correlations (conditional, default closed)
`CorrelationsPane` component — shown only when correlations have related items that are not purely group-mean based (`basis !== "group_means"`) and have sufficient sample size (`n >= 10`). Explicitly passed `defaultOpen={false}`.

#### Pane 4: Context (default open)
`ContextPane` component — effect size interpretation and contextual information.

#### Pane 5: Recovery (conditional, default open)
`RecoveryPane` component — shown only when study has recovery arm (`dose_groups` has a `recovery_armcd` entry). Renders two domain-specific sections:
- **Histopath (MI/MA):** Per-dose recovery verdicts (reversed/persistent/progressing), classification with confidence, finding nature assessment.
- **Continuous (LB/BW etc.):** Recovery vs terminal comparison table (dose, recovery effect size, terminal effect size, p-value). Interpretation text (trending reversal / persistent / partial recovery).

#### Pane 6: Related views (default closed)
Navigation links to other views. Explicitly passed `defaultOpen={false}`. Contains 4 links:

| Link Text | Target Route |
|-----------|-------------|
| View histopathology → | `/studies/{studyId}/histopathology` |
| View dose-response → | `/studies/{studyId}/dose-response` |
| View NOAEL decision → | `/studies/{studyId}/noael-decision` |
| View study summary → | `/studies/{studyId}` |

Links: `block text-primary hover:underline`, use `<a href="#">` with `onClick` handler calling `navigate()`. Wrapped in `space-y-1 text-[11px]`.

#### Pane Rendering
All panes (except Verdict) use the `CollapsiblePane` component:
- Toggle button: `flex w-full items-center gap-1 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50`
- Chevron icons: `h-3 w-3` (`ChevronDown` when open, `ChevronRight` when closed)
- Content area: `px-4 pb-3`
- Panes are separated by `border-b` (last pane has `last:border-b-0`)
- Panes respond to expand-all / collapse-all via generation counter (`expandAll` / `collapseAll` props)

### Syndrome Selected (`SyndromeContextPanel`)

Shown when `selectedGroupType === "syndrome"`. Displays cross-domain syndrome interpretation.

**Component:** `SyndromeContextPanel` (`panes/SyndromeContextPanel.tsx`)

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Syndrome name: `text-sm font-semibold`
- CollapseAllButtons (right side, no close button)
- Subtitle: `{syndromeId} · {N} endpoints · {N} domains · Detected in: {sexes}`
- Dual badges: Pattern confidence + Mechanism certainty (neutral gray badges per design system)
- `CertaintyBadge` has tooltip explaining what CONFIRMED/UNCERTAIN/PATTERN ONLY means

#### Verdict card (always visible, not in CollapsiblePane)
`border-b px-4 py-3` container with 2×2 grid:

| Cell | Content |
|------|---------|
| Confidence | Neutral gray badge with detection confidence (HIGH/MODERATE/LOW) |
| Recovery | Text: recovery status (recovered, partial, not recovered, not examined, mixed) |
| NOAEL impact | Text: "Capped at dose level N" or "No mortality impact" |
| Mechanism | `CertaintyBadge` with tooltip |

- When mechanism is UNCERTAIN: key discriminator text from `SYNDROME_INTERPRETATIONS` is surfaced as a paragraph below the grid (`text-[10px] text-foreground/70`)
- Conditional mortality callout: shown when `treatmentRelatedDeaths > 0`, `bg-muted/30` with warning icon and death count

#### Pane order (top to bottom)

| # | Pane | Default | Condition |
|---|------|---------|-----------|
| 1 | Certainty assessment | open | `discriminatingEvidence.length > 0` |
| 2 | Evidence summary | open | always |
| 3 | Differential | open | syndrome has a differential pair (XS01↔XS02, XS04↔XS05, XS07↔XS08, XS08↔XS09) |
| 4 | Histopathology context | closed | `histopathContext.length > 0` |
| 5 | Clinical observations | closed | `clinicalObservationSupport.assessment !== "no_cl_data"` |
| 6 | Recovery | closed | `syndromeInterp` available |
| 7 | Mortality context | closed | `treatmentRelatedDeaths > 0` |
| 8 | Food consumption | closed | `available && bwFwAssessment !== "not_applicable"` |
| 9 | Organ proportionality | open | `xs09Active && organProportionality?.available` |
| 10 | ECETOC assessment | closed | `syndromeInterp && detected` |
| 11 | Translational confidence | closed | `tier !== "insufficient_data"` |
| 12 | Interpretation | closed | syndrome has authored interpretation text |
| 13 | Related views | closed | always |

**Food consumption pane:** Narrative replaces generic "at high dose" with actual dose label from `dose_groups` (e.g., "at 200 mg/kg"). Food efficiency entries show actual dose labels.

**Related views pane:** 5 navigation links (dose-response, histopathology, NOAEL decision, validation, study summary). Same pattern as endpoint context panel Related Views.

**Removed panes:** Member Endpoints (redundant with rail), Study Design (generic species/strain/route caveats).

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Finding selection | Shared via context | `FindingSelectionContext` — syncs table and context panel. Includes `selectedFindingId`, `selectedFinding`, `endpointSexes`, `selectedGroupType`, `selectedGroupKey` |
| Study selection | Shared via context | `SelectionContext` — synced on mount |
| Table sorting | Session-persisted | `useSessionState<SortingState>("pcc.findings.sorting", [])` |
| Column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.findings.columnSizing", {})` |
| Findings data | Server | `useFindings(studyId, 1, 10000, ALL_FILTERS)` hook (React Query, 5 min stale) — fetches all findings with empty filters |
| Finding context | Server | `useFindingContext(studyId, findingId)` hook — loaded on selection |
| Mortality data | Server | `useStudyMortality(studyId)` — early death subject data |
| Tumor summary | Server | `useTumorSummary(studyId)` — tumor animal count |
| Study context | Server | `useStudyContext(studyId)` — study metadata for banner |
| Endpoint summaries | Derived | `deriveEndpointSummaries(findings)` — computed from raw findings data |
| Cross-domain syndromes | Derived | `detectCrossDomainSyndromes(endpoints)` — XS01-XS09 |
| Lab rule matches | Derived | `evaluateLabRules(endpoints)` — clinical catalog matches |
| Signal scores | Derived | `withSignalScores(endpoints, ...)` — signal score computation |
| Organ coherence | Derived | `deriveOrganCoherence(endpoints)` — for scatter coloring |
| Scatter section height | Local | `useAutoFitSections(containerRef, "findings", ...)` — resizable scatter panel |
| Active endpoint | Local (via event bus) | `_findingsRailCallback` — endpoint selection from rail |
| Excluded endpoints | Local (via event bus) | `_findingsExcludedCallback` — Ctrl+click exclusion |
| Scheduled-only mode | Shared | `useScheduledOnly()` — toggles statistics to scheduled variants when early deaths present |
| Collapse all | Local (context panel) | `useCollapseAll()` hook — provides expandGen/collapseGen counters |
| Rail mode | Shared | `useRailModePreference("findings")` — set by wrapper |
| Analytics | Derived (composite) | `FindingsAnalyticsProvider` — bundles endpoint summaries, syndromes, lab matches, signal scores for child components |

---

## Data Flow

```
useFindings(studyId, 1, 10000, ALL_FILTERS)
    --> { findings, dose_groups, summary, ... }
                                  |
                  deriveEndpointSummaries() → EndpointSummary[]
                  detectCrossDomainSyndromes() → syndromes
                  evaluateLabRules() → labMatches
                  withSignalScores() → signal scores
                                  |
                    ┌──────────────┼──────────────┐
                    │              │              │
           FindingsQuadrant   FindingsTable   FindingsRail
           Scatter (scatter)   (TanStack)     (left panel)
                    │              │              │
                    └──────┬───────┘              │
                           │                      │
                  FindingSelectionContext          │
                    (endpoint or group)            │
                           │                      │
                  FindingsContextPanel             │
                    /    |    |    \    \          │
                Verdict Evid Dose Corr Related    │
                           │                      │
                  FindingsAnalyticsContext ────────┘
                    (shared analytics data)
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

---

## TODOs

- [ ] **Scatter dot selection color is unintuitive.** On click, the selected dot changes from gray to `getOrganColor(organ_system)` — a hash-based HSL hue. Since all dots are gray at rest, you only ever see one colored dot at a time, so the organ-system encoding provides no visual grouping benefit. Consider: (a) using a fixed accent color (e.g., `primary`) for the selected dot, since the organ is already shown in the context panel header; (b) lighting up all dots of the same organ system on selection so the color grouping is visible; or (c) keeping organ color but making it always-on at rest (conflicts with current "gray at rest" design). Filed from: Alkaline Phosphatase selection shows blue (`hsl(232,55%,50%)` = hepatic) with no context for why blue. See `findings-charts.ts:143` and `severity-colors.ts:234`.
