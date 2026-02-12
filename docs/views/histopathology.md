# Histopathology View

**Route:** `/studies/:studyId/histopathology`
**Component:** `HistopathologyView.tsx` (wrapped by `HistopathologyViewWrapper.tsx`)
**Scientific question:** "What are the microscopic findings and how severe are they across dose groups?"
**Role:** Histopathology-specific analysis. Two-panel master-detail layout with specimen rail and evidence panel (Evidence + Hypotheses + Metrics tabs).

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

The view itself is a two-panel master-detail layout with a resizable rail (matching Target Organs, Dose-Response, and Signals views):

```
+--[300px*]-+-+----------------------------------[flex-1]-----------+
|            |R| SpecimenHeader                                      |
| Specimen   |e|  specimen name, badges (adverse, sex, preliminary),|
| Rail       |s|  1-line conclusion, compact metrics                 |
|            |i+----------------------------------------------------+
| search     |z| [Evidence] [Hypotheses] [Metrics]  <── tab bar      |
| specimen 1 |e+----------------------------------------------------+
| specimen 2 | | Tab content:                                       |
| specimen 3 | |  Evidence: findings table ─ resize ─ heatmap       |
| ...        | |    (group/subject toggle, resizable split)          |
|            | |  Hypotheses: exploratory tools                      |
|            | |  Metrics: filter bar + details grid                 |
+------------+-+----------------------------------------------------+
             ^ PanelResizeHandle (4px)
* default 300px, resizable 180-500px via useResizePanel
```

The evidence panel has a subtle muted background (`bg-muted/5`) to visually distinguish it from the crisp-white context panel where conclusions live.

The rail width is controlled by `useResizePanel(300, 180, 500)` — default 300px, draggable between 180px and 500px. A `PanelResizeHandle` (4px vertical drag strip) sits between the rail and evidence panel, hidden at narrow widths (`max-[1200px]:hidden`).

Responsive: stacks vertically below 1200px (`max-[1200px]:flex-col`). Rail becomes horizontal 180px tall strip with `max-[1200px]:!w-full`.

---

## Specimen Rail (left panel, resizable 300px default)

Container: `shrink-0 border-r` with `style={{ width: railWidth }}` where `railWidth` comes from `useResizePanel(300, 180, 500)`. On narrow viewports: `max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b max-[1200px]:overflow-x-auto`.

### Header
- Label: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Specimens ({N})"
- Search input: `mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs` with placeholder "Search specimens..."

### Rail Items

Each `SpecimenRailItem` is a `<button>` with:
- Container: `w-full text-left border-b border-border/40 px-3 py-2 transition-colors`
- Selected: `bg-blue-50/60 dark:bg-blue-950/20`
- Not selected: `hover:bg-accent/30`
- Left border: `border-l-2 border-l-transparent` always (neutral-at-rest design; no severity coloring on rail borders)

**Row 1:** Specimen name (`text-xs font-semibold`, underscores replaced with spaces for display) + dose-trend glyph (Strong: `▲`, Moderate: `▴`, Weak: no glyph — `text-[9px] text-muted-foreground`) + review status glyph (Confirmed: `✓`, Revised: `~`, Preliminary/In review: no glyph — `text-[9px] text-muted-foreground`) + finding count badge (`text-[10px] text-muted-foreground`). Glyphs support sub-3-second triage scanning; most specimens show no review glyph to keep the rail clean.

**Row 2:** Severity bar — neutral gray alignment matching Signals rail. Track: `h-1.5 flex-1 rounded-full bg-[#E5E7EB]`, fill color encodes max severity via `getNeutralHeatColor(maxSeverity).bg` (passed as `fillColor` prop to `EvidenceBar`). Numeric value: `shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground`.

**Row 3:** Stats line — `{N} findings · {M} adverse ({pct}%)` + domain chips (plain colored text: `text-[9px] font-semibold` with `getDomainBadgeColor().text` color class). Adverse percentage is `adverseCount / findingCount * 100`, guarded when `findingCount === 0`.

### Sorting

Specimens sorted by risk-density score descending, then `findingCount` desc as tiebreaker. Risk score formula: `(maxSeverity × 2) + (adverseCount × 1.5) + doseConsistencyWeight` where doseConsistencyWeight is Strong=2, Moderate=1, Weak=0.

### Auto-Select

On data load, auto-selects the top specimen (highest max severity).

### Search

Filters specimens by name (case-insensitive substring match). Empty state: "No matches for '{search}'".

---

## Specimen Header

`shrink-0 border-b px-4 py-3`

### Title row (flex, gap-2)

- Specimen name: `text-sm font-semibold`
- Adverse badge (if adverseCount > 0): `rounded-sm border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground` — "{N} adverse" (neutral bordered pill, matching other metadata badges)
- Sex specificity badge: `rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground` — "Male only" | "Female only" | "Both sexes". Derived from unique `sex` values in `specimenData`.
- Review-status badge: `rounded border px-1 py-0.5 text-[10px]` — derived from `useAnnotations<PathologyReview>` via `deriveSpecimenReviewStatus()`. Aggregates `peerReviewStatus` across all findings in the specimen:
  - **Preliminary** (`border-border/50 text-muted-foreground/60`): no annotations or all "Not Reviewed"
  - **In review** (`border-border text-muted-foreground/80`): mix of reviewed + unreviewed, no "Disagreed"
  - **Confirmed** (`border-border text-muted-foreground`): all findings "Agreed"
  - **Revised** (`border-border text-muted-foreground`): any finding "Disagreed"
  All badges neutral gray (design system: no colored categorical badges). Tooltip shows explanation.

### Domain subtitle

`text-[11px] text-muted-foreground` — domains joined by ` · ` (e.g., "MI · MA · OM"). Rendered between title row and conclusion line.

### 1-line conclusion

`mt-1 text-xs leading-relaxed text-muted-foreground`

Deterministic sentence built by `deriveSpecimenConclusion()` from:
- **Incidence**: "low-incidence" (≤20%), "moderate-incidence" (21-50%), "high-incidence" (>50%)
- **Severity**: "max severity {n}" or "non-adverse" if adverseCount === 0
- **Sex**: from `deriveSexLabel()` (lowercase)
- **Dose relationship**: "with dose-related increase" if R01/R04 rules present, else from `getDoseConsistency()` — "with dose-related trend" (Strong) or "without dose-related increase"

Example: *"Low-incidence, non-adverse, male only, without dose-related increase."*

### Structured metrics

`mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]` — six key:value pairs in a 2-column grid layout:

| Metric | Value format |
|--------|-------------|
| Incidence | `{affected}/{N} ({pct}%)` — font-mono |
| Max severity | `{n.n}` — font-mono, font-semibold when ≥3.0 |
| Dose trend | `{Weak|Moderate|Strong}` — from `doseConsistency` |
| Adverse | `{adverseCount}/{findingCount}` — font-mono |
| Sex scope | `{sexLabel}` — from `deriveSexLabel()` |
| Findings | `{findingCount}` — font-mono |

Each row: `flex items-baseline justify-between` — label left (text-muted-foreground), value right (font-medium).

---

## Tab Bar

`flex shrink-0 items-center border-b bg-muted/30` (canonical tab bar pattern, uses `ViewTabBar` component with nested flex container)

Three tabs: **Evidence**, **Hypotheses**, **Metrics**

Active tab: `text-foreground` + `absolute inset-x-0 bottom-0 h-0.5 bg-primary` underline
Inactive tab: `text-muted-foreground hover:text-foreground`
All tabs: `relative px-4 py-1.5 text-xs font-medium transition-colors`

---

## Evidence Tab (internal component: `OverviewTab`)

`flex flex-1 flex-col overflow-hidden` — vertically split into two resizable sections. Contains the observed findings table (top) and a heatmap container (bottom) with a `HorizontalResizeHandle` between them. This keeps the core pathologist triage workflow — findings + heatmap — on a single tab without switching.

### Resizable Split Layout

The Evidence tab uses `useResizePanelY(200, 80, 500)` to create a vertically resizable split:
- **Top section** (findings table): `shrink-0 overflow-y-auto px-4 py-2` with `style={{ height: findingsHeight }}`. Default 200px, resizable 80-500px.
- **HorizontalResizeHandle**: 4px tall drag strip (`cursor-row-resize`), `border-b border-border`.
- **Bottom section** (heatmap container): `flex min-h-0 flex-1 flex-col overflow-hidden`. Contains a `FilterBar` and the heatmap content area.

### Observed Findings (top section)

TanStack React Table with sortable, resizable columns. Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Observed findings"

**Columns:**

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| finding | Finding | 160px | Severity micro-cell (`h-2.5 w-2.5 rounded-sm`, `getNeutralHeatColor(maxSev).bg`) + truncated name (`font-medium`) |
| maxSeverity | Sev | 40px | `font-mono text-[10px] text-muted-foreground`, tooltip "Max severity: {n} (scale 1–5)" |
| incidence | Incid. | 48px | `font-mono text-[10px] text-muted-foreground`, "{affected}/{N}" |
| severity | Class | 60px | Neutral badge: `rounded-sm border border-border px-1 py-px text-[9px] font-medium text-muted-foreground` |
| isDoseDriven | Dose-driven | 78px | Boolean glyph: `✓` for Strong consistency, empty otherwise. Tooltip: "Incidence increases monotonically with dose across 3+ groups" |
| relatedOrgans | Also in | 160px | `text-[9px] italic text-muted-foreground/60`, comma-joined organ names from R16 cross-organ coherence |

Sorted by max avg_severity descending. Click sets finding-level selection (updates context panel). Click again to deselect. Column resizing enabled.

### Heatmap Container (bottom section)

Contains both group-level and subject-level heatmaps, toggled via a Group/Subject segmented control. Shares sex/severity filters with the Metrics tab (lifted to parent state).

#### Filter Bar

`FilterBar` with controls that adapt based on the active matrix mode:

**Always visible:**
- Group/Subject toggle: segmented control (`rounded-full` pills, active: `bg-foreground text-background`) — switches `matrixMode` between "group" and "subject"
- Sex filter: `<FilterSelect>` — "All sexes" / Male / Female
- Min severity filter: `<FilterSelect>` — "Min severity: any" / "1+" / "2+" / "3+"

**Group mode only:**
- Severity/Incidence toggle: segmented control (`rounded-full` pills)

**Subject mode only:**
- Dose group filter: `<FilterSelect>` — "All dose groups" / per-group options (computed from `subjData.subjects`, deduped by dose_level, sorted ascending)
- Subject sort: `<FilterSelect>` — "Sort: dose group" / "Sort: max severity". Severity sort sorts within each dose group (dose groups always ascending, severity descending within group).
- Affected only: checkbox + "Affected only" label (default: checked)

Matrix mode, affected only, subject sort, and dose group filter reset on specimen change via `useEffect`. Affected only resets to `true`; others reset to defaults.

#### Group-Level Heatmap (matrixMode === "group")

Rendered when `heatmapData` exists and has findings.

**Header:** flex row with heatmap title + dose consistency badge.
- Title: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "{Severity|Incidence} heatmap ({N} findings)"
- Dose consistency badge: `text-[10px] text-muted-foreground` — "Dose consistency: {label} {glyphs}". Glyphs: Strong → "Strong ▲▲▲", Moderate → "Moderate ▴▴", Weak → "Weak ·".
- Subtitle: `mb-1 text-[10px] text-muted-foreground` — "Cells show average severity grade per dose group." or "Cells show % animals affected per dose group."

**Structure:** `overflow-x-auto` > `inline-block` — horizontal scrollable flex layout.

**Header row:** Finding label column `w-52 shrink-0` + dose columns each `w-20 shrink-0 text-center text-[10px] font-medium text-muted-foreground`.

**Data rows:** No finding cap (specimens typically have 1-11 findings each).
- Each `flex cursor-pointer border-t hover:bg-accent/20`, selected: `ring-1 ring-primary`
- Finding label: `w-52 shrink-0 truncate py-0.5 pr-2 text-[10px]`, truncated at 40 chars
- Cells: `flex h-6 w-20 shrink-0 items-center justify-center` with neutral heat color or gray placeholder

**Neutral heat color scale:** `getNeutralHeatColor()` — grayscale from `#E5E7EB` (minimal) through `#4B5563` (severe). Incidence mode uses `getNeutralHeatColor01()` (0–1 scale).

**Legend:** 5 color swatches with labels. Severity: Minimal–Severe. Incidence: 1–19% through 80–100%.

#### Subject-Level Heatmap (matrixMode === "subject")

Fetches individual subject data via `useHistopathSubjects(studyId, specimen)` on demand (only when `matrixMode === "subject"`). Container: `border-b p-3`. Accepts `affectedOnly` (default true), `doseGroupFilter` (default null), and `sortMode` props. Filters: sex, affected-only (`Object.keys(findings).length > 0`), dose group. Sort: dose group ascending always, then within-group by severity (if sortMode=severity) or sex+ID (if sortMode=dose).

**Structure:** Four-tier header:
1. **Dose group headers** — horizontal bar above each dose group with colored indicator stripe (`getDoseGroupColor(doseLevel)`), label "({N})" subjects.
2. **Subject IDs** — one column per subject (`w-8`), showing abbreviated ID via `shortId()` (splits on dashes, returns last segment; falls back to `slice(-4)`). Clickable — highlights column and fires `onSubjectClick`.
3. **Sex indicator row** (hidden when sex filter active) — "M"/"F" per subject, colored `text-blue-600`/`text-red-600`.
4. **Examined row** — "E" if subject has any findings, empty otherwise. `bg-muted/20`.

**Data rows:** One per finding (sorted by max severity desc, filtered by `minSeverity`). Each cell (`w-8 h-6`):
- Severity > 0: colored block (`h-5 w-6 rounded-sm`) with severity number, color from `getNeutralHeatColor(sevNum)`
- Entry with severity 0: em dash
- No entry: empty cell

Selected subject column highlighted with `bg-blue-50/50`.

**Legend:** 5 severity labels with numeric prefixes: "1 Minimal", "2 Mild", "3 Moderate", "4 Marked", "5 Severe" + "— = examined, no finding" + "blank = not examined".

**Loading/empty states:**
- Loading: spinner + "Loading subject data..."
- No subjects: "Subject-level data not available for this specimen."
- No findings after filter: "No findings match the current severity filter."

---

## Metrics Tab (internal component: `MetricsTab`)

Full lesion severity details grid. Tab order: third (after Evidence and Hypotheses). A flat data table for detailed record-level inspection — the heatmaps live on the Evidence tab.

### Filter Bar

`FilterBar` component with shared sex/severity filters (parent state, synced with Evidence tab):

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Sex | Dropdown | `<FilterSelect>` — "All sexes" / Male / Female | All |
| Min severity | Dropdown | `<FilterSelect>` — "Min severity: any" / "1+" / "2+" / "3+" | Any (0) |

### Details Grid

TanStack React Table, `text-xs`, client-side sorting with column resizing. Always visible (not collapsed). Scoped to selected specimen.

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| finding | Finding | Truncated at 30 chars with ellipsis, `title` tooltip |
| domain | Domain | Plain text |
| dose_level | Dose | `text-muted-foreground`, shows `dose_label.split(",")[0]` |
| sex | Sex | Plain text |
| n | N | Plain number |
| affected | Aff. | Plain number |
| incidence | Incid. + Info icon | `font-mono`, percentage. Header includes `Info` icon with tooltip explaining derivation. |
| avg_severity | Avg sev | `font-mono text-[10px]`, fixed to 1 decimal |
| severity | Severity | Badge: `rounded-sm border border-border px-1 py-px text-[10px] font-medium text-muted-foreground` |

Row cap: 200 rows. Row interactions: click to select/deselect, hover highlight.

---

## Hypotheses Tab

Pathologist-oriented exploratory tools, matching the Hypotheses tab pattern from Target Organs and Dose-Response views. Provides structural consistency across analysis views.

### Finding-aware context (D-3)

The tab accepts `selectedFinding` from the parent's `selection?.finding`. When a finding is selected:
- **Auto-switch intent:** `useEffect` switches intent to "treatment" (most relevant tool for a specific finding).
- **Contextual placeholders:** Each tool placeholder enriches its display text:
  - `SeverityDistributionPlaceholder`: context line appends `"· Focus: {finding}"`
  - `TreatmentRelatedPlaceholder`: description changes to `"Assess whether "{finding}" is treatment-related…"`
  - `DoseSeverityTrendPlaceholder`: context line appends `"· Focus: {finding}"`
- Clearing selection (Escape) does **not** reset the intent — the user stays on whichever tool they were viewing.

### Toolbar

`flex items-center gap-1 border-b bg-muted/20 px-4 py-1.5`

Favorite tool pills (active: `bg-foreground text-background`, inactive: `text-muted-foreground hover:bg-accent hover:text-foreground`) + "+" dropdown button + right-aligned "Does not affect conclusions" note.

Right-click on pills opens context menu for pin/unpin from favorites.

### Specimen Tools

| Tool | Icon | Available | Description |
|------|------|-----------|-------------|
| Severity distribution | `BarChart3` | Yes | Severity grade distribution across dose groups |
| Treatment-related assessment | `Microscope` | Yes | Classify findings as treatment-related, incidental, or spontaneous |
| Peer comparison | `Users` | No (production) | Compare against historical control incidence data |
| Dose-severity trend | `TrendingUp` | Yes | Severity and incidence changes across dose groups |

Default favorites: Severity distribution, Treatment-related assessment.

Each tool renders a `ViewerPlaceholder` (DG viewer type label), descriptive text, and a `ConfigLine` settings block in a `rounded-md border bg-card p-3` card. Unavailable tools show a `ProductionNote` explaining the dependency.

---

## Helper Functions

### `deriveSexLabel(rows: LesionSeverityRow[]): string`
Returns "Male only", "Female only", or "Both sexes" based on unique `sex` values in the specimen data.

### `getDoseConsistency(rows: LesionSeverityRow[]): "Weak" | "Moderate" | "Strong"`
Groups rows by finding, computes incidence-per-dose-level, checks monotonicity.
- **Strong**: >50% of findings monotonic AND ≥3 dose groups affected
- **Moderate**: some monotonic OR ≥2 dose groups affected
- **Weak**: everything else

### `getFindingDoseConsistency(rows: LesionSeverityRow[], finding: string): "Weak" | "Moderate" | "Strong"`
Per-finding version of `getDoseConsistency`. Filters rows to one finding, groups by dose_level, checks incidence monotonicity.
- **Strong**: monotonic incidence AND ≥3 dose groups affected
- **Moderate**: monotonic OR ≥2 dose groups affected
- **Weak**: everything else

### `deriveSpecimenConclusion(summary, specimenData, specimenRules): string`
Builds a deterministic 1-line conclusion from incidence range, severity, sex, and dose relationship.

### `deriveSpecimenReviewStatus(findingNames, reviews): SpecimenReviewStatus`
Aggregates peer review annotations across all findings in a specimen. Returns one of:
- **Preliminary**: no reviews record or all "Not Reviewed"
- **Revised**: any finding has "Disagreed"
- **Confirmed**: all findings have "Agreed"
- **In review**: mix of reviewed + unreviewed (no "Disagreed")

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/histopathology`, shows `HistopathologyContextPanel`.

The `HistopathologyContextPanelWrapper` in `ContextPanel.tsx` fetches `lesionData` and `ruleResults` via hooks and passes as props. Selection flows from `ViewSelectionContext`.

### No Selection State
- Message: "Select a finding from the heatmap or grid to view details."

### With Selection

Header: sticky, finding name (`text-sm font-semibold`) + `CollapseAllButtons`, specimen name below (`text-xs text-muted-foreground`).

**Header metrics line** (`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground`): Four inline metrics computed from finding rows — Incidence (`{affected}/{N} ({pct}%)`), Max sev (`{n.n}`), Dose trend (`{Weak|Moderate|Strong}`), Sex (`{M|F|M/F}`). Makes the panel presentation-ready without scrolling.

Panes in order (follows design system priority: insights > stats > related > annotation > navigation):
1. **Insights** (default open) — `InsightsList` with finding-scoped rules
2. **Dose detail** (default open) — all dose-level rows for finding + specimen, sorted by dose_level then sex. Table columns: Dose, Sex, Incid., mini dose ramp bar, Avg Sev, Sev. The mini dose ramp is a `h-1.5 rounded-full` horizontal bar (neutral gray: track `bg-gray-100`, fill `bg-gray-400`) showing relative incidence percentage per row. Makes dose relationship pre-attentive without reading numbers.
3. **Sex comparison** (conditional, default open) — only shown when finding has data from both sexes. Per-sex row: affected/total + max severity badge with `getSeverityHeatColor()`.
4. **Correlating evidence** (default open) — up to 10 other findings in same specimen, sorted by max severity desc, with severity badge colored by `getSeverityHeatColor()`
5. **Pathology review** — `PathologyReviewForm` (not wrapped in CollapsiblePane, uses own form state)
6. **Tox Assessment** — `ToxFindingForm` keyed by finding (not wrapped in CollapsiblePane)
7. **Related views** (default closed) — "View target organs", "View dose-response", "View NOAEL decision" links

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected specimen | Local | `useState<string \| null>` — which specimen is active in the rail |
| Active tab | Local | `useState<EvidenceTab>` — "overview", "hypotheses", or "metrics" |
| Selection (finding) | Shared via context | `ViewSelectionContext` with `_view: "histopathology"` tag |
| Sex filter | Local (parent) | `useState<string \| null>` — shared between Evidence and Metrics tabs |
| Min severity | Local (parent) | `useState<number>` — shared between Evidence and Metrics tabs |
| Heatmap view | Local (OverviewTab) | `useState<"severity" \| "incidence">` — group heatmap coloring mode (default "severity") |
| Matrix mode | Local (OverviewTab) | `useState<"group" \| "subject">` — toggles between group and subject heatmaps (default "group", resets on specimen change) |
| Affected only | Local (OverviewTab) | `useState<boolean>` — filter subjects to affected only in subject mode (default true, resets to true on specimen change) |
| Subject sort | Local (OverviewTab) | `useState<"dose" \| "severity">` — subject heatmap sort mode (default "dose", resets on specimen change). Severity sort orders within dose groups, not across them. |
| Dose group filter | Local (OverviewTab) | `useState<number \| null>` — filter subjects to specific dose group (default null = all, resets on specimen change) |
| Findings height | Local (OverviewTab) | `useResizePanelY(200, 80, 500)` — resizable findings table height (default 200px, range 80-500px) |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state (in OverviewTab and MetricsTab) |
| Column sizing | Local | `useState<ColumnSizingState>` — TanStack column resize state (in OverviewTab and MetricsTab) |
| Selected subject | Local | `useState<string \| null>` — column highlight in SubjectHeatmap |
| Rail width | Local | `useResizePanel(300, 180, 500)` — resizable rail width (default 300px, range 180-500px) |
| Specimen rules | Derived | `useMemo` — rules filtered to selected specimen, shared between SpecimenHeader and OverviewTab |
| Lesion data | Server | `useLesionSeveritySummary` hook (React Query, 5min stale) |
| Subject data | Server | `useHistopathSubjects` hook (fetched on demand in OverviewTab when matrixMode === "subject") |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |
| Path reviews | Server | `useAnnotations<PathologyReview>(studyId, "pathology-reviews")` — shared cache with context panel PathologyReviewForm |
| Finding names by specimen | Derived | `useMemo` — Map<string, string[]> from lesionData, used for review status aggregation |

---

## Data Flow

**Data filtering:** `deriveSpecimenSummaries()` skips rows where `specimen` is null (e.g., CL domain findings that lack a specimen value). This prevents crashes when the CL domain contributes rows without a valid specimen. Each `SpecimenSummary` now includes `doseConsistency: "Weak" | "Moderate" | "Strong"`, computed per specimen via `getDoseConsistency(specimenRows)` during derivation.

```
useLesionSeveritySummary(studyId) ──> lesionData (728 rows)
useRuleResults(studyId) ──> ruleResults (shared React Query cache)
useAnnotations<PathologyReview> ──> pathReviews (shared cache with context panel)
                                |
                    deriveSpecimenSummaries() → SpecimenSummary[]
                    findingNamesBySpecimen → Map<specimen, finding[]>
                    (skips rows with null specimen)
                                |
                        SpecimenRail (sorted by risk-density desc)
                        + deriveSpecimenReviewStatus() per rail item
                                |
                    [selectedSpecimen] → filter lesionData
                                |
                    specimenData ──> specimenRules (filtered at parent)
                                |
                        deriveFindingSummaries()
                        deriveSexLabel() / getDoseConsistency()
                        deriveSpecimenConclusion()
                           /         |          \
                  OverviewTab   HypothesesTab  MetricsTab
                  (findings +    (selectedFinding  (details grid
                   group/subject  auto-focus)     only)
                   heatmap, resizable split)
                        \         |         /
                    HistopathSelection (shared)
                                |
                  HistopathologyContextPanel
                    /  |    |     |     \    \     \
                 Dose  Sex  Ins  Corr  Path  Nav  Tox
```

---

## Cross-View Navigation

### Inbound
- From other views with `location.state`: `{ organ_system: string }` or `{ specimen: string }` — auto-selects matching specimen in rail (case-insensitive).

### Outbound (Context panel — "Related views" pane)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| "View target organs" | `/studies/{studyId}/target-organs` | `{ organ_system: specimen }` |
| "View dose-response" | `/studies/{studyId}/dose-response` | `{ organ_system: specimen }` |
| "View NOAEL decision" | `/studies/{studyId}/noael-decision` | `{ organ_system: specimen }` |

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

---

## Backlog

| Item | What's needed | Priority |
|------|--------------|----------|
| Cross-domain correlating evidence (D-2) | Backend/generator changes to link clinical pathology (CL, LB) findings to histopathology specimens | P3 |
