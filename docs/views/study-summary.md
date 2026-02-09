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
- **Tabs:** "Study Details" (first) and "Signals" (second, default active)
- **Active indicator:** `h-0.5 bg-primary` underline at bottom of active tab
- **Tab text:** `text-xs font-medium`. Active = `text-foreground`. Inactive = `text-muted-foreground`. Title Case for all tab labels.
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

## Tab 2: Signals — Two-Panel Master-Detail

Vertical stack, fills remaining height. Contains Decision Bar, Study Statements Bar, and a two-panel master-detail layout.

```
+-----------------------------------------------------------+
| Decision Bar (NOAEL statement + metrics)                  |  border-b
+-----------------------------------------------------------+
| Study Statements Bar (study-level facts/modifiers/caveats)|  border-b (if content)
+-----------------------------------------------------------+
| Organ Rail (300px)  |  Evidence Panel (flex-1)            |
| ┌─────────────────┐ | ┌──────────────────────────────────┐|
| │ Search input    │ | │ Organ Header (name, stats)       │|
| │ ─ ─ ─ ─ ─ ─ ─  │ | │ [Overview] [Signal matrix]  tabs │|
| │ Organ items     │ | │ ┌────────────────────────────────┐│|
| │  (scrollable)   │ | │ │ Tab content (scrollable)      ││|
| │                 │ | │ │                                ││|
| └─────────────────┘ | │ └────────────────────────────────┘│|
|                     | └──────────────────────────────────┘|
+-----------------------------------------------------------+
```

Responsive: `max-[1200px]:flex-col` — stacks vertically on narrow screens.

### Decision Bar

Persistent across the Signals tab. Neutral muted background: `shrink-0 border-b bg-muted/20 px-4 py-2`.

**Structured layout (compact, single-row NOAEL/LOAEL/Driver):**

1. **NOAEL / LOAEL / Driver row** — inline, wrapped (`flex flex-wrap items-baseline gap-x-5 gap-y-1`):
   - Each: label (`text-[10px] font-medium uppercase tracking-wider text-muted-foreground`) + value (`text-xs font-semibold text-foreground`)
   - NOAEL value: amber-600 only if "Not established"; all other values (including "Control") use `text-foreground`
   - NOAEL sex qualifier: `text-[10px] text-muted-foreground` inline after value
   - NOAEL confidence badge (if present): colored pill (`text-[10px] font-medium`) — green ≥80% (`bg-green-100 text-green-700`), amber ≥60% (`bg-amber-100 text-amber-700`), red <60% (`bg-red-100 text-red-700`)
   - Driver (if exists): `text-xs font-medium text-foreground`

2. **Alert/warning statements** (if any from `panelData.decisionBar` with warning/review-flag icons): `text-xs leading-snug text-amber-700` with triangle/warning icon

3. **Metrics line:** `mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground` — N targets · sig ratio · D-R count · N domains

**Data source:** NOAEL, LOAEL, and driver values come from `MetricsLine` (computed in `signals-panel-engine.ts` from NOAEL summary + signal data). Alert statements from `panelData.decisionBar` (priority 900+ rules, filtered to warning/review-flag icons).

### Study Statements Bar

Shows study-level statements, modifiers, and caveats from `panelData`. Only renders if non-empty.

- **Study statements:** `text-sm leading-relaxed` with StatementIcon
- **Study modifiers:** `text-xs text-amber-800` with amber triangle icon. Only includes modifiers where `organSystem` is falsy.
- **Study caveats:** `text-xs text-orange-700` with warning icon. Only includes caveats where `organSystem` is falsy.

### Organ Rail (left panel, resizable 180-500px, default 300px)

**Component:** `SignalsOrganRail` (from `SignalsPanel.tsx`)
**Resizable:** Uses `useResizePanel(300, 180, 500)` with `PanelResizeHandle` between rail and evidence panel. Handle hidden at `max-[1200px]` (stacked layout).

Header: "ORGAN SYSTEMS ({count})" + search input (`text-xs`).

Each rail item (`SignalsOrganRailItem`):
- **Row 1: Name line** — `flex items-center gap-2`:
  - Tier indication dot (leftmost): Critical = red `#DC2626`, Notable = amber `#D97706`, Observed = no dot. Computed via `computeTier()` from `rule-synthesis.ts`.
  - Organ name: `text-xs font-semibold` + `titleCase()`
  - Dominant direction arrow (if available): `text-[10px] text-muted-foreground/60` — ↑ (mostly up), ↓ (mostly down), ↕ (mixed). Computed from significant signals (p < 0.05) in `computeOrganRailStats()`.
  - "TARGET" badge (if target organ): `text-[9px] font-semibold uppercase text-red-600`
- Target organs: red left border (`border-l-2 border-l-red-600`)
- Non-targets: transparent left border
- Selected: `bg-blue-50/60 dark:bg-blue-950/20`
- Not selected: `hover:bg-accent/30`
- **Row 2: Evidence score bar** — `mt-1.5 flex items-center gap-2`: track `h-1.5 rounded-full bg-gray-200`, fill `bg-gray-300` (width normalized to max across all organs). Score number: `font-mono text-[10px] tabular-nums`, font-semibold if ≥0.5, font-medium if ≥0.3.
- **Row 3: Stats line** — `text-[10px] text-muted-foreground`: `{n_significant} sig · {n_treatment_related} TR · {n_domains} domains` + domain chips (plain colored text `text-[9px] font-semibold` with `getDomainBadgeColor().text`)
- **Row 4: Effect metrics** (if available from computed stats) — `text-[10px] text-muted-foreground tabular-nums`: `|d|={maxAbsEffectSize}` (font-semibold if ≥0.8) + `trend p={minTrendP}` (font-semibold if <0.01)
- **Row 5: D-R summary** (if available from OrganBlock): `text-[10px] text-muted-foreground` — `D-R: {nEndpoints} ({topEndpoint})`

**Target/non-target separator:** A subtle divider label ("Other organs") appears between the last target organ and the first non-target organ. Style: `text-[9px] uppercase tracking-wider text-muted-foreground/50 px-3 py-1.5 border-b`.

**Sorted by:** Targets first, then by `evidence_score` descending within each group.
**Auto-select:** Highest-evidence organ is auto-selected when data loads and no organ is selected.

### Evidence Panel (right panel, flex-1)

**Component:** `SignalsEvidencePanel` (from `SignalsPanel.tsx`)

#### Organ Header (compact, 2-line format)
- Line 1: Organ name `text-sm font-semibold` + "TARGET" badge (if applicable)
- Line 2: Metrics in `text-[11px] text-muted-foreground tabular-nums`: `{n_domains} domains · {n_significant}/{n_endpoints} sig ({pct}%) · {n_treatment_related} TR · Max {max_signal} · Evidence {evidence_score} · |d| {maxAbsEffectSize} · trend p {minTrendP}`
- No conclusion sentence — all relevant information is conveyed by the metrics line

#### Tab Bar
Three tabs: "Overview", "Signal matrix", "Metrics"
- Same styling as main tab bar (`text-xs font-medium`, `h-0.5 bg-primary` underline)

#### Overview Tab (`SignalsOverviewTab`)

Scrollable content (`overflow-y-auto px-4 py-3`):

1. **Insights** — `InsightsList` component filtered to organ-specific rules (`r.organ_system === key` or `r.context_key.startsWith("organ_{key}")`)
2. **Modifiers** — Amber-styled items filtered to this organ (`s.organSystem === key || s.clickOrgan === key`). Organ names are clickable links via `ClickableOrganText`.
3. **Review flags** — Items with warning icon in `flex items-start gap-2 text-xs leading-relaxed text-foreground/80`, amber warning icon left-aligned. Organ names are clickable links.
4. **Domain breakdown** — Table with columns: Domain (colored text `text-[9px] font-semibold` with `getDomainBadgeColor`), Endpoints, Significant (font-semibold if >0), TR (font-semibold if >0). Sorted by significant count desc.
5. **Top findings** — Up to 8 findings sorted by `|effect_size|` desc. Each row (`hover:bg-accent/30`, clickable → navigates to dose-response view) shows:
   - Endpoint name (`min-w-[120px] truncate font-medium`)
   - Direction arrow (`text-muted-foreground/50`)
   - Effect size (font-mono, font-semibold if |d| ≥ 0.8)
   - P-value (font-mono, font-semibold if < 0.001, font-medium if < 0.01)
   - Trend p-value (font-mono text-muted-foreground, font-semibold if < 0.01, prefixed with "t:")
   - D-R pattern badge (if not none/flat): `rounded-full bg-muted px-1.5 py-0.5 text-[9px]`
   - Severity badge (`rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium`)
   - TR flag (if treatment-related)
   - Sex + dose label (right-aligned, muted)

**Cross-view links (pinned footer):** Pinned below the scrollable content area as a persistent footer strip (`shrink-0 border-t px-4 py-2 flex flex-wrap gap-3`). Links: "Target Organs: {organ} →", "Dose-response: {organ} →", "Histopathology: {organ} →", "NOAEL Decision →". Navigate with `{ state: { organ_system } }`.

#### Signal Matrix Tab (`SignalsMatrixTab`)

1. **Inline filters** — `StudySummaryFilters` without organ dropdown (organ already selected). Filters: endpoint type, sex, min score, significant only.
2. **Organ-scoped heatmap** — `OrganGroupedHeatmap` with `singleOrganMode` prop. Shows only the selected organ's signals. No organ header row, always expanded.

#### Metrics Tab (`SignalsMetricsTab`)

Full sortable data table of all signals for the selected organ. TanStack React Table with client-side sorting and column resizing.

**Filter bar** (`border-b bg-muted/30 px-4 py-2`):
- Sex dropdown: All sexes / Male / Female
- Severity dropdown: All severities / Adverse / Warning / Normal
- Significant only checkbox
- Row count: `ml-auto text-[10px] text-muted-foreground`

**Columns** (12 total):

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| endpoint_label | Endpoint | 160px | `truncate font-medium` |
| domain | Domain | 55px | `text-[9px] font-semibold` with `getDomainBadgeColor().text` |
| dose_label | Dose | 90px | First segment before comma, truncated |
| sex | Sex | 40px | Plain text |
| signal_score | Score | 60px | `font-mono` 2 decimals |
| direction | Dir | 35px | `text-muted-foreground` direction symbol |
| p_value | p-value | 65px | `font-mono`, font-semibold if < 0.01 |
| trend_p | Trend p | 65px | `font-mono`, font-semibold if < 0.01 |
| effect_size | \|d\| | 55px | `font-mono`, font-semibold if \|d\| ≥ 0.8 |
| severity | Severity | 70px | `rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium` |
| treatment_related | TR | 35px | Y (font-semibold) / N (muted) |
| dose_response_pattern | Pattern | 90px | Underscores replaced with spaces, em dash if none/flat |

**Default sort:** signal_score descending.
**Row interactions:** Same as other tables — `hover:bg-accent/50`, `bg-accent` on selection. Click toggles selection and updates context panel.

### OrganGroupedHeatmap (shared component)

**Component:** `charts/OrganGroupedHeatmap.tsx`

**Props include `singleOrganMode?: boolean`** — when true:
- Organ header row is suppressed (no chevron, organ name, sparkline, etc.)
- The single organ group is always expanded
- Only endpoint rows and dose column headers render

**Normal mode (multi-organ):** Used by other views. Organs grouped and sorted by evidence_score desc, target organs first. Collapsible with chevron. Organ header shows: name, evidence score badge, domain chips, target star, sparkline, endpoint count.

**Neutral-at-rest rendering:** Heatmap cells use neutral gray backgrounds at rest (`rgba(0,0,0,0.04)` for data cells, `rgba(0,0,0,0.02)` for empty). On hover, the cell fills with the signal score color. Text uses `tabular-nums` for number alignment. See design guide §1.3 and §1.11 for details.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}`, shows `StudySummaryContextPanel`.

### No Selection State
- Primary message: "Select a signal from the heatmap or grid to view details."
- Tip text: "Tip: Click an organ in the rail for organ-level insights, or select a heatmap cell for endpoint statistics."
- `p-4 text-xs text-muted-foreground`, tip in `text-muted-foreground/60`

### Organ Selected (`OrganPanel`)

Triggered when an organ is selected in the rail (and no endpoint selection is active).

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Organ name: `text-sm font-semibold` + `titleCase()`
- CollapseAllButtons (right-aligned)
- Subtitle: "{totalSignals} signals · {N} domain(s)" in `mt-1 text-xs text-muted-foreground`
- TierCountBadges: `mt-1.5 text-xs` — clickable tier pills (Critical/Notable/Observed) with counts

#### Pane 1: Organ insights (default open)
`InsightsList` with organ-filtered rules (`context_key === organKey || organ_system === organSystem || scope === "study"`) and `tierFilter` from TierCountBadges.

#### Pane 2: Contributing endpoints (default open)
Table showing up to 15 endpoints in this organ, grouped by max signal score per endpoint.

| Column | Rendering |
|--------|-----------|
| Endpoint | `truncate` (22 char max, ellipsis) |
| Dom | `text-[9px] font-semibold` with `getDomainBadgeColor().text` |
| Signal | `font-mono` 2 decimals, right-aligned |
| p | `font-mono` formatted p-value, right-aligned |

Rows: `cursor-pointer border-b border-dashed hover:bg-accent/30`. Click navigates to Target Organs view with `{ state: { organ_system } }`.

#### Pane 3: Evidence breakdown (default open)
- Domains: colored text chips (`text-[9px] font-semibold`)
- Counts: Significant (N/total), Treatment-related (N), Adverse (N)
- Sex comparison (below separator): Males (sig/total), Females (sig/total)

#### Pane 4: Related views (default closed)
Links to Target Organs, Dose-Response, Histopathology, NOAEL Decision — all with `{ state: { organ_system } }`. Style: `text-[11px]`, color `#3a7bd5`, `hover:underline`.

### Endpoint Selected (`EndpointPanel`)

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Endpoint label: `text-sm font-semibold`
- CollapseAllButtons (right-aligned)
- Subtitle: "{domain} . {sex} . Dose {dose_level}" in `mt-1 text-xs text-muted-foreground`
- TierCountBadges: `mt-1.5 text-xs` — clickable tier pills with counts

Rules filtered to: matching context_key (`{domain}_{test_code}_{sex}`), matching organ key (`organ_{organ_system}`), or study scope.

#### Pane 1: Insights (default open)
`CollapsiblePane` with `InsightsList` component and `tierFilter` from TierCountBadges.

#### Pane 2: Statistics (default open)
Key-value pairs, `text-[11px] tabular-nums`:

| Metric | Display |
|--------|---------|
| Signal score | `font-mono` 3 decimals |
| Direction | Text value or em dash |
| Best p-value | `font-mono` formatted |
| Trend p-value | `font-mono` formatted |
| Effect size | `font-mono` formatted, or em dash |
| Dose-response | Pattern with underscores replaced |
| Severity | Raw value |
| Treatment-related | Yes/No |

#### Pane 3: Correlations (default open)
- Header text: "Other findings in {organ system}"
- Shows other findings in same `organ_system`, up to 10, sorted by signal_score desc
- Table: Endpoint (truncated 25 chars), Dom (colored text), Signal (font-mono), p (font-mono)
- Rows clickable — navigate to dose-response view with `{ state: { endpoint_label, organ_system } }`
- Empty state: "No correlations in this organ system."

#### Pane 4: Tox Assessment (no pane header — direct `ToxFindingForm`)
`ToxFindingForm` component with treatment-related dropdown, adversity dropdown, comment textarea, and SAVE button.

#### Pane 5: Related views (default closed)
Links to Target Organs (with organ_system), Dose-Response (with endpoint_label + organ_system), Histopathology (with organ_system), NOAEL Decision (with organ_system). Style: `text-[11px]`, color `text-[#3a7bd5]`, `hover:underline`.

---

## State Management

| State | Scope | Managed By |
|-------|-------|-----------|
| Active tab | Local | `useState<"details" \| "signals">` — defaults to "signals" |
| Selected organ | Local | `useState<string \| null>` — auto-selects top organ on load |
| Selection | Shared via context | `SignalSelectionContext` — syncs heatmap cells and context panel; mutually exclusive with organ selection |
| Evidence panel tab | Local (SignalsEvidencePanel) | `useState<"overview" \| "matrix" \| "metrics">` — defaults to "overview" |
| Rail width | Local | `useResizePanel(300, 180, 500)` |
| Rail search | Local (SignalsOrganRail) | `useState<string>` |
| Metrics tab filters | Local (SignalsMetricsTab) | `useState<{ sex, severity, significant_only }>` |
| Metrics tab sorting | Local (SignalsMetricsTab) | `useState<SortingState>` — default `signal_score` desc |
| Signal data | Server | `useStudySignalSummary` hook (React Query, 5min stale) |
| Target organs | Server | `useTargetOrganSummary` hook |
| NOAEL data | Server | `useNoaelSummary` hook |
| Rule results | Server | `useRuleResults` hook |
| Study metadata | Server | `useStudyMetadata` hook |
| Panel data | Derived | `buildSignalsPanelData(noaelData, targetOrgans, signalData)` |
| Sorted organs | Derived | Targets first, then by `evidence_score` desc |
| OrganBlocksMap | Derived | Map from `panelData.organBlocks` keyed by `organKey` |
| RailStatsMap | Derived | Per-organ `{ maxAbsEffectSize, minTrendP, dominantDirection }` from signal data |
| TierDotMap | Derived | Per-organ tier dot color from `computeTier()` on organ-filtered rules |

---

## Data Flow

```
useStudySignalSummary(studyId)  ──> signalData (989 rows)
useTargetOrganSummary(studyId)  ──> targetOrgans (14 organs)
useNoaelSummary(studyId)        ──> noaelData
useRuleResults(studyId)         ──> ruleResults
         |
    buildSignalsPanelData()
         |
    panelData ──> decisionBar, studyStatements, organBlocks,
                  modifiers, caveats, metrics
         |
    ┌────┴────────────────────────────────────┐
    │                                         │
SignalsOrganRail                    SignalsEvidencePanel
(sorted organs,                     (selected organ's data)
 organBlocksMap)                    ├── Overview (InsightsList, domain table,
    │                               │            top findings, cross-view links)
    └── selectedOrgan ──────────>  └── Signal matrix (filtered heatmap)
                                         │
                                    SignalSelection (shared)
                                         │
                                  StudySummaryContextPanel
                                    /     |      \
                              Insights  Stats  Correlations
```

---

## Keyboard

| Key | Action |
|-----|--------|
| Escape | Clears both organ selection and endpoint selection |
| ↑ / ↓ | Navigates between organs in the organ rail (wraps at boundaries). Only active when Signals tab is focused. |

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Overview tab cross-view links | Click | Target Organs / Dose-Response / Histopathology / NOAEL Decision (with `organ_system` state) |
| Overview tab top findings row | Click | Dose-Response (with `endpoint_label` + `organ_system` state) |
| Context panel: OrganPanel related views | Click | Target Organs / Dose-Response / Histopathology / NOAEL Decision (with `organ_system`) |
| Context panel: OrganPanel contributing endpoints | Click | Target Organs (with `organ_system`) |
| Context panel: EndpointPanel correlations | Click | Dose-Response (with `endpoint_label` + `organ_system`) |
| Context panel: EndpointPanel related views | Click | Target Organs / Dose-Response / Histopathology / NOAEL Decision |
| Domain chip (Details tab) | Click | `/studies/{studyId}/domains/{domain}` |
| Generate Report button | Click | Opens HTML report in new browser tab |

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading study summary..." |
| Error (no generated data) | Red box with instructions to run generator command |
| Empty organ search | "No matches for '{search}'" centered in rail |
| No signal data for organ | "No signal data for this organ." centered in overview tab |
| No metadata (Details tab) | Spinner + "Loading details..." |
