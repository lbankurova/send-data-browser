# Findings View (formerly Adverse Effects)

**Route:** `/studies/:studyId/findings` (primary). Legacy redirects: `/studies/:studyId/adverse-effects` and `/studies/:studyId/analyses/adverse-effects` both redirect to `/findings`.
**Wrapper:** `FindingsViewWrapper.tsx` (in `components/analysis/findings/`) — sets `useRailModePreference("organ")`, renders `FindingsView`
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
|  Section title · (count) · filters · ★ selected  | chips ℹ |  <-- ViewSection header
|  Quadrant scatter (resizable)                              |
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

**FindingsRail organ card indicators:** In organ grouping mode, organ group cards display up to two indicators:
- **Organ confidence** — "Conf: High/Med/Low" with RAG-colored dashed underline (best integrated confidence across treatment-related endpoints).
- **Normalization indicator** — "Norm: [mode]" (ABS/BW/Brain/ANCOVA) with tier-colored dashed underline (green T1, amber T2, orange T3, red T4). Only shown for OM organs at normalization tier ≥ 2. Computed as highest tier across dose groups for the organ.

---

## Quadrant Scatter

Rendered inside `ViewSection mode="fixed"` when endpoint summaries are available. Height managed by `useAutoFitSections` with "findings" section key (default ~40% viewport height, 80-2000px).

### Section Title Bar

The `ViewSection` header displays a dynamic title (left) and action area (right):

**Title (left):** Composed in a `flex items-baseline gap-1.5` span:
- **Scope label** — "All endpoints" (no scope), "{organName} endpoints" (organ scope), syndrome name (syndrome scope), or endpoint label (endpoint scope).
- **Count** — `(plottable/total)` when they differ, `(plottable)` when equal. Styled `text-muted-foreground/50`.
- **Filter labels** — active filter descriptions separated by ` · ` dividers. Styled `text-muted-foreground`.
- **Selected point stats** (when a scatter dot is selected) — `★ {label} · {symbol}={effectSize} · p={pValue} ({testName})`. Label in `font-medium`, stats in `font-mono`, test name (Dunnett's for LB/BW/OM/FW, Fisher's otherwise) in `text-muted-foreground/60`.

Metadata text uses `text-[10px] normal-case tracking-normal font-normal text-foreground`.

**Action area (right):** Contains excluded endpoint chips and info tooltip (see below).

### Excluded Endpoint Chips

When endpoints are excluded via Ctrl+click on scatter dots, chips appear in the ViewSection `headerRight`:
- Each chip: `inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0 text-[9px] text-muted-foreground/70` with truncated label (`max-w-[80px]`) and `EyeOff` restore icon (`h-2.5 w-2.5 cursor-pointer hover:text-foreground`).
- **Overflow:** When > 3 excluded, show first 2 labels + a "+{N} more" chip. The overflow chip's EyeOff clears all exclusions; individual chip EyeOff restores that single endpoint.

### Info Tooltip

An `Info` icon (`h-3 w-3 cursor-help text-muted-foreground/50 hover:text-muted-foreground`) in the headerRight. Hover-with-delay (150ms hide delay) shows a tooltip (`absolute right-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover px-3 py-2 shadow-md`) explaining:
- Dot semantics ("Each dot is one endpoint")
- Axes (right = larger effect, up = more significant)
- Reference lines (vertical at |effect| = 0.8, horizontal at p = 0.05)
- Dot color (gray = higher doses only, warm rose = NOAEL below lowest tested dose)
- Guidance ("Upper-right quadrant = investigate first")

### Scatter Chart

**Component:** `FindingsQuadrantScatter` — interactive scatter plot of endpoints by statistical significance (p-value) vs effect size. Props include: endpoints, selectedEndpoint, organCoherence, syndromes, labMatches, scopeFilter, effectSizeSymbol (default `"g"`, dynamically set from active effect size method).

**Legend** (conditional — entries only appear when corresponding data exists):

| Symbol | Label | Color | Condition |
|--------|-------|-------|-----------|
| `•` (bullet) | warning/normal | `#9CA3AF` (gray) | any non-adverse, non-clinical endpoint |
| `●` (circle) | adverse | `#9CA3AF` (gray) | any adverse-severity endpoint |
| `◆` (diamond) | clinical S2+ | `#6B7280` (darker gray) | clinicalSeverity truthy |
| `●` (circle) | low NOAEL | `rgba(248,113,113,0.7)` (warm rose) | noaelTier = "below-lowest" or "at-lowest" |

Legend rendered as `flex items-center gap-2` with `text-[8px] text-muted-foreground` entries.

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
| domain | Domain | Left | `DomainLabel` component: neutral monospace text, `font-mono text-[9px] font-semibold text-muted-foreground`. No color coding, no background, no border. Per CLAUDE.md hard rule: "Domain labels — neutral text only." |
| finding | Finding | Left (absorber) | `overflow-hidden text-ellipsis whitespace-nowrap` div with `title` tooltip for full name. If specimen exists: "{specimen}: {finding}" with specimen in `text-muted-foreground` |
| sex | Sex | Left | Plain text |
| day | Day | Left | `text-muted-foreground`, em dash if null. **CL day mode toggle:** when CL findings exist, header shows a `▾` indicator and clicking it opens a dropdown to switch between "Most frequent" (peak prevalence mode, default) and "First observed" (onset day). Header text changes to "Day (onset)" in onset mode. Dropdown: `fixed z-50 min-w-[190px] rounded border bg-popover py-0.5 shadow-md` with checkmark on active item and "Applies to CL rows only" footer. Cell value: CL rows use `day_first` in onset mode, `day` otherwise. |

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
| severity | Severity | Left | Left-border badge: `inline-block pl-1.5 py-0.5` with colored left border from `getSeverityDotColor()` via inline `style`. Border width and font weight vary by signal tier (see below). |

**Note on p-value and effect-size columns:** Both p-value, trend, and effect-size cells use the `ev` CSS class for interaction-driven color: neutral `text-muted-foreground` at rest, `#DC2626` on row hover/selection. The `data-evidence=""` attribute is set on every `<td>`.

**Note on severity badges:** The severity column uses a left-border badge with `getSeverityDotColor()` providing the `borderLeftColor` via inline style: adverse = `#dc2626`, warning = `#d97706`, normal = `#16a34a`. Border width and font weight scale with signal tier (`getSignalTier(signal)` from `findings-rail-engine.ts`):

| Condition | Signal | Border | Font |
|-----------|--------|--------|------|
| normal severity | any | `border-l` (1px) | `text-muted-foreground` |
| tier 1 | < 4 | `border-l` (1px) | `text-gray-600` |
| tier 2 | 4–7 | `border-l-2` (2px) | `font-medium text-gray-600` |
| tier 3 | ≥ 8 | `border-l-4` (4px) | `font-semibold text-gray-600` |

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
2. **Group selected** (`selectedGroupType === "organ"`) → `OrganContextPanel` for the organ key. Panes include: Convergence, Organ weight normalization (tier >= 2 only, with override form — see below), Normalization overview heatmap (collapsed by default, tier >= 2), Organ NOAEL, Related syndromes, Member endpoints
3. **Syndrome selected** (`selectedGroupType === "syndrome"`) → `SyndromeContextPanel` for the syndrome ID
4. **Nothing selected** → empty state:
   - Header: `text-sm font-semibold` -- "Findings" (`<h3>` with `mb-2`)
   - Message: "Select a finding row to view detailed analysis."
   - `p-4 text-xs text-muted-foreground`
   - **Normalization overview heatmap** (when OM normalization tier >= 2 contexts exist): `NormalizationHeatmap` in CollapsiblePane, open by default. Compact organ × dose-group matrix showing metric mode (ABS/BW/Brain/ANCOVA) with tier-colored badges. Click organ row → selects organ group.

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

**OM domain sub-sections (conditionally rendered after EvidencePane):**
- **Normalization annotation** — category-specific messaging (GONADAL: absolute weight primary; ANDROGEN_DEPENDENT: androgen status correlation; FEMALE_REPRODUCTIVE: estrous cycle variability; non-reproductive organs at tier ≥ 2: BW confounding tier + active mode).
- **Normalization alternatives table** — high-dose vs control comparison across absolute, ratio-to-BW, and ratio-to-brain metrics with Δ% column. Shown for GONADAL (ratios grayed), FEMALE_REPRODUCTIVE (always), or when normalization engine recommends showing alternatives (tier ≥ 2).
- **Williams' trend test comparison** (`WilliamsComparisonPane`) — side-by-side JT vs Williams' results with concordance verdict (concordant/discordant). Expandable step-down detail table showing per-dose test statistic (t̃), critical value, p-value, and significance. Only shown when `finding.williams` is present (OM domain).
- **ANCOVA effect decomposition** (`ANCOVADecompositionPane`) — shown when `finding.ancova` is present (OM domain, tier >= 3 or brain affected). Displays: model R², slope homogeneity warning (amber when non-parallel), BW slope + p-value, per-dose-group decomposition table (total/direct/indirect effect, % direct, direct p-value with red highlight when p < 0.05), adjusted least-squares means at overall mean BW with raw comparison.

**OrganContextPanel — Normalization override form (OWN §8):**

The "Organ weight normalization" pane in `OrganContextPanel` (tier >= 2 only) includes a user override mechanism. Components: `NormalizationModeDisplay` (read-only summary: active mode, tier, BW/brain g, category, rationale) + `NormalizationOverrideForm` (edit form). Storage: `normalization-overrides` annotation schema keyed by organ name (uppercase).

- **Collapsed state:** Two links — "Override mode" (opens edit form) and "Clear override" (removes override, only shown when active). "Saved" flash (green-600, 2s) after mutation.
- **Expanded state:** Mode selector buttons (pill-shaped, `bg-primary` when active), filtered by data availability (brain-ratio hidden when no brain data, ANCOVA hidden when tier < 3). Required reason textarea (`text-[10px]`, 2 rows). Save button (`bg-primary`, disabled when reason empty or saving). Cancel link.
- **Override indicator:** When `userOverridden === true`, label shows "(user override)" in amber-600 instead of "(auto-selected)".
- **Data flow:** `useNormalizationOverrides(studyId)` hook wraps `useAnnotations` + `useSaveAnnotation` for the `normalization-overrides` schema. `useOrganWeightNormalization` fetches overrides via `useAnnotations` and applies them in `useMemo` via `applyOverrides()` — sets mode + `userOverridden: true` on all dose-group decisions/contexts for the organ. All 7 callers of the hook automatically see overrides.
- **Audit trail:** Server-side via `_append_audit_entry()` in `annotations.py` — logs field-level diffs on every save.
- **Decomposed confidence display** (`DecomposedConfidencePane`) — 5-dimension ECI breakdown: statistical evidence, biological plausibility, dose-response quality, trend test validity, trend concordance. Integrated confidence level with limiting factor. NOAEL contribution weight.

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
| View NOAEL determination → | `/studies/{studyId}/noael-determination` |
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

#### Header (sticky, with verdict)
- `sticky top-0 z-10 border-b bg-background px-4 py-3` with severity-dependent left border accent
- Syndrome name: `text-sm font-semibold` + `CollapseAllButtons` (right side)
- Subtitle: `{syndromeId} · {N} endpoints · {N} domains · Detected in: {sexes}`
- **Verdict lines** (conditional, when `syndromeInterp` available — replaces the separate verdict card):
  - Line 1: Severity label (`SEVERITY_LABELS[overallSeverity]`) with severity accent class
  - Line 2: Mechanism certainty text (with tooltip) · Recovery status text
  - Line 3: Treatment-related · Adverse classification · optional "NOAEL capped by mortality"
  - Line 4 (XS09 only): Organ proportionality narrative
- Loading state: "Loading interpretation…" when `syndromeInterp` not yet available

#### Pane order (top to bottom)

| # | Pane | Default | Condition |
|---|------|---------|-----------|
| 1 | Evidence | open | `syndromeInterp` available |
| 2 | Dose-response & recovery | open | `syndromeInterp && detected` |
| 3 | Histopathology | open | `syndromeInterp && hasHistopath` (includes XS01 tumor progression cross-ref and tumor confounder checks) |
| 4 | Food consumption | open when applicable | `syndromeInterp && showFoodConsumption` (open when `available && bwFwAssessment !== "not_applicable"`) |
| 5 | Organ proportionality | open | `syndromeInterp && xs09Active && organProportionality?.available` |
| 6 | Clinical observations | closed | `syndromeInterp && hasClinicalFindings` (headerRight: "{N} correlating") |
| 7 | Mortality | closed | `syndromeInterp && hasMortality` (headerRight: red border-l death count + NOAEL cap note) |
| 8 | Translational confidence | closed | `syndromeInterp && hasTranslational` (headerRight: tier label, capitalize) |
| 9 | Reference | closed | always (contains description, regulatory significance, key discriminator, separator, then 4 navigation links) |

**Food consumption pane:** Narrative replaces generic "at high dose" with actual dose label from `dose_groups` (e.g., "at 200 mg/kg"). Food efficiency entries show actual dose labels.

**Reference pane:** Contains syndrome interpretation text (description, regulatory significance, key discriminator) + 4 navigation links (dose-response, histopathology, NOAEL determination, study summary).

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Finding selection | Shared via context | `FindingSelectionContext` — syncs table and context panel. Includes `selectedFindingId`, `selectedFinding`, `endpointSexes`, `selectedGroupType`, `selectedGroupKey` |
| Study selection | Shared via context | `SelectionContext` — synced on mount |
| Table sorting | Session-persisted | `useSessionState<SortingState>("pcc.findings.sorting", [])` |
| Column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.findings.columnSizing", {})` |
| Findings + analytics | Server + derived | `useFindingsAnalyticsLocal(studyId)` — primary data hook. Wraps `useFindings(studyId, 1, 10000, ALL_FILTERS)` internally, then applies scheduled-only filter, recovery pooling filter, stat method overrides, and derives all analytics (see pipeline below). Returns `{ analytics, data, isLoading, error }`. |
| Finding context | Server | `useFindingContext(studyId, findingId)` hook — loaded on selection |
| Mortality data | Server | `useStudyMortality(studyId)` — early death subject data |
| Tumor summary | Server | `useTumorSummary(studyId)` — tumor animal count |
| Study context | Server | `useStudyContext(studyId)` — study metadata for banner |
| Scheduled-only mode | Shared | `useScheduledOnly()` — toggle in `MortalityBanner` excludes early-death treatment-group subjects from statistics. `useFindingsAnalyticsLocal` applies `applyScheduledFilter()` when active. |
| Recovery pooling | Session-persisted | `useSessionState("pcc.{studyId}.recoveryPooling", "pool")` — "pool" (include recovery arms in treatment-period stats, default) or "separate" (exclude). Toggle in `StudyDetailsContextPanel` settings pane. `useFindingsAnalyticsLocal` applies `applyRecoveryPoolingFilter()` when "separate". |
| Scatter section height | Local | `useAutoFitSections(containerRef, "findings", ...)` — resizable scatter panel |
| Active endpoint | Local (via event bus) | `_findingsRailCallback` — endpoint selection from rail |
| Excluded endpoints | Local (via event bus) | `_findingsExcludedCallback` — Ctrl+click exclusion |
| Collapse all | Local (context panel) | `useCollapseAll()` hook — provides expandGen/collapseGen counters |
| Rail mode | Shared | `useRailModePreference("organ")` — set by wrapper |
| Analytics context | Derived (composite) | `FindingsAnalyticsProvider` — wraps entire view, makes analytics available via `useFindingsAnalytics()` context hook to all child components (scatter, table, rail, context panels) |

---

## Data Flow

```
useFindingsAnalyticsLocal(studyId)
    │
    ├── useFindings(studyId, 1, 10000, ALL_FILTERS) → raw findings
    ├── useScheduledOnly() → filter early deaths
    ├── useSessionState(recoveryPooling) → filter recovery arms
    ├── useStatMethods() → effect size + multiplicity overrides
    └── useOrganWeightNormalization() → OWN mode overrides
                    │
          Processing pipeline (in useMemo):
          1. applyScheduledFilter()
          2. applyRecoveryPoolingFilter()
          3. applyEffectSizeMethod() + applyMultiplicityMethod()
          4. mapFindingsToRows() + deriveEndpointSummaries()
          5. computeEndpointNoaelMap()
          6. attachEndpointConfidence()
          7. deriveOrganCoherence()
          8. detectCrossDomainSyndromes() (XS01-XS10)
          9. evaluateLabRules()
         10. withSignalScores()
                    │
          Returns: { analytics, data, isLoading, error }
                    │
    ┌── FindingsAnalyticsProvider (wraps entire view) ──┐
    │                                                    │
    │   ┌──────────────┼──────────────┐                  │
    │   │              │              │                  │
    │  FindingsQuadrant FindingsTable FindingsRail       │
    │  Scatter          (TanStack)    (left panel)       │
    │   │              │              │                  │
    │   └──────┬───────┘              │                  │
    │          │                      │                  │
    │ FindingSelectionContext          │                  │
    │   (endpoint or group)           │                  │
    │          │                      │                  │
    │ FindingsContextPanel            │                  │
    │   /    |    |    \    \         │                  │
    │ Verdict Evid Dose Corr Related  │                  │
    │          │                      │                  │
    │ useFindingsAnalytics() ─────────┘                  │
    │   (context hook — reads from provider)             │
    └────────────────────────────────────────────────────┘
```

All child components access analytics (endpoints, syndromes, organ coherence, lab matches, signal scores, normalization contexts) via the `useFindingsAnalytics()` context hook rather than prop drilling.

---

## Cross-View Navigation

The "Related views" pane in the context panel provides navigation links to:
- Histopathology view
- Dose-response view
- NOAEL determination view
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
