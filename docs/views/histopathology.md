# Histopathology View

**Route:** `/studies/:studyId/histopathology`
**Component:** `HistopathologyView.tsx` (wrapped by `HistopathologyViewWrapper.tsx`)
**Scientific question:** "What are the microscopic findings and how severe are they across dose groups?"
**Role:** Histopathology-specific analysis. Two-panel master-detail layout with specimen rail and evidence panel (Evidence + Hypotheses tabs).

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
|            |R| Summary strip                                       |
| Specimen   |e|  specimen name, domains, sex, adverse badge         |
| Rail       |s|  incidence, max sev, dose trend, findings count     |
|            |i+----------------------------------------------------+
| search     |z| [Evidence] [Hypotheses]              <── tab bar    |
| specimen 1 |e+----------------------------------------------------+
| specimen 2 | | Tab content:                                       |
| specimen 3 | |  Evidence: findings table ─ resize ─               |
| ...        | |    dose-incidence chart ─ resize ─                  |
|            | |    severity matrix (group/subject toggle)            |
|            | |  Hypotheses: exploratory tools                      |
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

Each `SpecimenRailItem` is a `<button>` using design tokens from `rail` (`rail.itemBase`, `rail.itemSelected`, `rail.itemIdle`) with `px-2.5 py-2`.

**Row 1 (name + quantitative indicators):** Specimen name (`text-xs font-semibold`, underscores replaced with spaces) + review status glyph (Confirmed: `✓`, Revised: `~`, Preliminary/In review: no glyph — `text-[9px] text-muted-foreground`) + dose-trend glyphs (Strong: `▲▲▲`, Moderate: `▲▲`, Weak: `▲` — opacity fading: Strong full, Moderate 60%, Weak 30%) + max severity badge (`font-mono text-[9px]`, `getNeutralHeatColor(maxSeverity)` background) + max incidence badge (`font-mono text-[9px]`, `getNeutralHeatColor01(maxIncidence)` background) + finding count (`font-mono text-[9px]`) + adverse count with "A" suffix (`font-mono text-[9px]`).

**Row 2 (organ system + domains):** `mt-0.5` — organ system label (`text-[10px] text-muted-foreground/60`, `titleCase(specimenToOrganSystem())`) + domain labels (`<DomainLabel>` for each domain).

### Sorting

Default sort by signal score descending, then `findingCount` desc as tiebreaker. Signal score formula: `(adverseCount × 3) + maxSeverity + (maxIncidence × 5) + doseConsistencyWeight` where doseConsistencyWeight is Strong=2, Moderate=1, Weak=0.

Five sort modes available via `FilterSelect` dropdown:
- **Signal** (default): signal score descending
- **Organ**: groups by organ system alphabetically (with sticky group headers showing system name + specimen count + adverse count), max severity descending within groups
- **Severity**: max severity descending
- **Incidence**: max incidence descending
- **A–Z**: alphabetical by specimen name

### Filters

The rail header includes a filter bar with:
- **Sort select**: 5 sort modes (see above)
- **Min severity**: "Sev: all", "Sev 2+", "Sev 3+", "Sev 4+"
- **Dose trend**: "Trend: all", "Moderate+", "Strong only"
- **Adverse only**: checkbox labeled "Adv" — shows only specimens with `adverseCount > 0`
- **Search** (`FilterSearch`): case-insensitive substring match on specimen name

A `FilterShowingLine` displays active filter summary when any filter is active (e.g., `Showing: "liver" · Severity 2+ · Adverse only · 5/42`).

Empty state when no specimens match: "No specimens match current filters".

### Auto-Select

On data load, auto-selects the top specimen (highest signal score).

---

## Specimen Summary Strip

`shrink-0 border-b bg-background px-3 py-1.5` — sticky above the tab bar.

### Title row (flex, items-center, gap-2)

- Specimen name: `text-sm font-semibold` (underscores replaced with spaces)
- Domain labels: `<DomainLabel>` for each domain
- Sex scope: `text-[10px] text-muted-foreground` — from `deriveSexLabel(specimenData)`
- Adverse badge (if adverseCount > 0): `rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground` — "{N} adverse"

### Metrics row (mt-1, flex, gap-4, text-[10px])

| Metric | Format |
|--------|--------|
| Incidence | `{affected}/{N} ({pct}%)` — font-mono font-medium |
| Max sev | `{n.n}` — font-mono font-medium |
| Dose trend | `{Weak|Moderate|Strong}` — styled via `getDoseConsistencyWeight()` |
| Findings | `{findingCount}` — font-mono font-medium |

---

## Tab Bar

`flex shrink-0 items-center border-b bg-muted/30` (canonical tab bar pattern, uses `ViewTabBar` component with nested flex container)

Two tabs: **Evidence**, **Hypotheses**

Active tab: `text-foreground` + `absolute inset-x-0 bottom-0 h-0.5 bg-primary` underline
Inactive tab: `text-muted-foreground hover:text-foreground`
All tabs: `relative px-4 py-1.5 text-xs font-medium transition-colors`

---

## Evidence Tab (internal component: `OverviewTab`)

`flex flex-1 flex-col overflow-hidden` — vertically split into three sections via `useAutoFitSections`. Contains the observed findings table (top, resizable), dose-incidence chart (middle, resizable), and severity matrix (bottom, flex). This keeps the core pathologist triage workflow — findings + dose chart + heatmap — on a single tab without switching.

### Resizable Split Layout

The Evidence tab uses `useAutoFitSections(containerRef, "histopathology", [...])` to create three sections:
- **Top section** (findings table): `ViewSection mode="fixed"`, default 200px height, resizable 80-500px.
- **Middle section** (dual dose charts): `ViewSection mode="fixed"`, default 170px height, resizable 80-400px.
- **Bottom section** (severity matrix): `ViewSection mode="flex"` — fills remaining space. Filter controls render inside each heatmap mode (below the header, above the matrix).

### Observed Findings (top section)

TanStack React Table with sortable, resizable columns. Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Observed findings"

**Header right:** "Hide zero severity" checkbox — filters out findings with `maxSeverity === 0`. Title shows count: "Observed findings ({filtered} of {total})" when active.

**Columns:**

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| finding | Finding | 120px (60-260) | Severity micro-cell (`h-2.5 w-2.5 rounded-sm`, `getNeutralHeatColor(maxSev).bg`) + truncated name (weight escalates: `font-medium` → `font-semibold` at sev 2+ → `font-bold` at sev 4+) |
| maxSeverity | Peak sev | 50px (40-80) | `font-mono text-[10px]`, weight/opacity escalates with value. Em dash for zero. Tooltip "Max severity: {n.n} (scale 1–5)" |
| incidence | Incid. | 50px (42-80) | `font-mono text-[10px]`, percentage format. Weight/opacity escalates at 10%/30% thresholds. Em dash for zero. |
| severity | Signal | 60px (48-100) | **Clinical-aware severity cell.** When statistical severity is "normal" but a clinical catalog match exists, replaces "normal" with clinical class label (Sentinel / High concern / Moderate / Flag) in `text-[9px] font-medium text-gray-500` with `border-l-2 border-l-gray-300`. Tooltip shows both clinical and statistical classification. For adverse/warning/normal without clinical override: left-border color (`#dc2626` adverse, `#d97706` warning, `#16a34a` normal) + severity text. |
| isDoseDriven | Dose-dep. ▾ | 80px (55-120) | **Switchable dose-dependence method.** Clicking the column header opens a context menu with 4 methods grouped as Heuristic (Moderate+, Strong only) and Statistical (CA trend, Severity trend). Header label changes to reflect active method. Cell shows `✓` when criterion met; for statistical methods, shows p-value in tooltip or "–" with reason when not significant/no data. |
| relatedOrgans | Also in | 120px (40-300) | Absorber column. `text-muted-foreground`, comma-joined organ names from R16 cross-organ coherence. |

**Content-hugging layout:** All columns except "Also in" (absorber) use `width: 1px; white-space: nowrap` so they shrink to content. The absorber column absorbs remaining space. Manual column resize overrides with explicit width.

Sorted by max avg_severity descending. Click sets finding-level selection (updates context panel). Click again to deselect. Column resizing enabled via drag handles.

### Dual Dose Charts (middle section)

Side-by-side ECharts bar charts — **Incidence** (left, `border-r`) and **Severity** (right). Built by `buildDoseIncidenceBarOption()` and `buildDoseSeverityBarOption()` from `charts/histopathology-charts.ts`.

Each chart has a **Compact/Scaled mode toggle** (`ChartModeToggle`) — "C" (compact: auto-scale to data range) and "S" (scaled: fixed axis range 0–100% / 0–5). Toggle pills: `rounded-sm px-1 py-px text-[9px] font-semibold`, active: `bg-foreground text-background`, inactive: `text-muted-foreground/50`.

**Section title:** Dynamic — "Dose charts: {finding}" when finding selected, "Dose charts (specimen aggregate)" otherwise. Default 170px height, resizable 80-400px.

**Incidence chart:**
- X-axis: Dose groups. Y-axis: Incidence percentage.
- When both sexes present and no sex filter: groups bars by sex.
- Empty state: "No incidence data."

**Severity chart:**
- X-axis: Dose groups. Y-axis: Average severity (0–5).
- Only includes rows with avg_severity > 0.
- When both sexes present and no sex filter: groups bars by sex.
- Empty state: "No severity data."

**Shared behavior:**
- When no finding selected: specimen-level aggregate per dose group.
- When a finding selected: that finding's data per dose group.
- Both charts use a stable frame (all dose levels + sexes from the full specimen, not filtered by finding) so axes don't shift when selecting different findings.

### Severity Matrix (bottom section)

Contains both group-level and subject-level heatmaps, toggled via a Group/Subject segmented control. Shares sex/severity filters with the Metrics tab (lifted to parent state).

#### Group/Subject Mode Toggle

The mode toggle is inline in the `ViewSection` title: `SEVERITY MATRIX: GROUP | SUBJECTS` — clickable text links (active: `text-foreground`, inactive: `text-muted-foreground/40 hover:text-muted-foreground/60`, separated by `|`). Finding count appended when heatmap data exists.

#### Filter Controls

Filter controls render below the section header. Each mode includes common controls plus mode-specific ones.

**Common controls (both modes):**
- Sex filter: `<FilterSelect>` — "All sexes" / Male / Female
- Min severity filter: `<FilterSelect>` — "All severities" / "Severity 1+" / "2+" / "3+"

**Group mode adds:**
- Severity/Incidence toggle: segmented control (`rounded-full` pills, active: `bg-foreground text-background`)

**Subject mode adds:**
- Dose group filter: `<FilterMultiSelect>` dropdown with checkboxes — "All dose groups" when all selected, single label when one selected, "{N} groups" when multiple. Dropdown panel has "Select all" / "Clear all" link buttons at top, then main arm checkboxes + "Recovery" group header with recovery arm checkboxes. Minimum 1 must remain selected (clear all keeps first option). Short labels strip "Group N," prefix and drug name (e.g., "Group 2, 2 mg/kg PCDRUG" → "2 mg/kg"; "Group 1, Control" → "Control"). State: `ReadonlySet<string> | null` (null = all selected). Composite keys: `"0"`, `"1"` etc. for main arms, `"R0"`, `"R1"` etc. for recovery arms. Computed from `subjData.subjects`, separated by `is_recovery` flag, each sorted by dose_level ascending.
- Subject sort: `<FilterSelect>` — "Sort: dose group" / "Sort: max severity". Severity sort sorts within each dose group (dose groups always ascending, severity descending within group).
- Affected only: checkbox + "Affected only" label (default: checked)

**Filter ordering:** Dose group filter applies first, then sex, then affected-only. This ensures control group subjects (who typically have no findings) survive the dose group filter even when "Affected only" is checked — the user can uncheck it to see the full baseline roster.

**Filter summary strip:** A "Showing:" line always appears below the filter bar as plain `·`-separated text (e.g., "Showing: All groups · Both sexes · Affected only"). Uses stable-height plain text (no chips) to prevent layout jumps when filters change. Recovery groups show `(R)` suffix. Always visible — no conditional hiding.

**Implementation:** Subject mode passes all controls as a `controls` ReactNode prop to `SubjectHeatmap`, which renders them between its header and the matrix. `doseGroupOptions` prop provides label lookup for the filter summary. Group mode renders the `FilterBar` inline between the header and the description text.

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

**Neutral heat color scale:** `getNeutralHeatColor()` — 5 distinct grades: transparent (minimal, grade 1), `#D1D5DB` (mild), `#9CA3AF` (moderate), `#6B7280` (marked), `#4B5563` (severe). Minimal gets no color to reinforce low clinical significance; thresholds are integer-aligned (`>= 2`, `>= 3`, etc.). Incidence mode uses `getNeutralHeatColor01()` (0–1 scale).

**Legend:** 5 color swatches with labels, rendered using `getNeutralHeatColor()` calls (not hardcoded hex). Severity: Minimal–Severe. Incidence: 1–19% through 80–100%. Transparent swatches get `border border-border` so the shape remains visible.

#### Subject-Level Heatmap (matrixMode === "subject")

Fetches individual subject data via `useHistopathSubjects(studyId, specimen)` on demand (only when `matrixMode === "subject"`). API response includes recovery arm subjects with `is_recovery: boolean` field. Container: `border-b p-3`. Accepts `affectedOnly` (default true), `doseGroupFilter` (`ReadonlySet<string> | null`, default null = show all), `sortMode`, and `controls` (ReactNode rendered between header and matrix) props. Filters: dose group (Set.has() with composite key), sex, affected-only (`Object.keys(findings).length > 0`). Sort: main arms before recovery, dose_level ascending within each category, then within-group by severity (if sortMode=severity) or sex+ID (if sortMode=dose). Dose groups grouped by composite key (dose_level + is_recovery); recovery group labels appended with "(Recovery)".

**Structure:** Four-tier header:
1. **Dose group headers** — horizontal bar above each dose group with colored indicator stripe (`getDoseGroupColor(doseLevel)`), label "({N})" subjects.
2. **Subject IDs** — one column per subject (`w-8`), showing abbreviated ID via `shortId()` (splits on dashes, returns last segment; falls back to `slice(-4)`). Clickable — highlights column and fires `onSubjectClick`.
3. **Sex indicator row** (hidden when sex filter active) — "M"/"F" per subject, colored `text-blue-600`/`text-red-600`.
4. **Examined row** — "E" if subject has any findings, empty otherwise. `bg-muted/20`.

**Data rows:** One per finding (sorted by max severity desc, filtered by `minSeverity`). Each cell (`w-8 h-6`):
- Severity > 0: block (`h-5 w-6 rounded-sm`) with severity number, color from `getNeutralHeatColor(sevNum)` — minimal (grade 1) renders transparent, grades 2-5 get progressively darker gray
- Entry with severity 0: em dash
- No entry: empty cell

Selected subject column highlighted with `bg-blue-50/50`.

**Legend:** Positioned between filter summary strip and matrix. 5 severity labels with numeric prefixes: "1 Minimal", "2 Mild", "3 Moderate", "4 Marked", "5 Severe" + "— = examined, no finding" + "blank = not examined". Swatches use `getNeutralHeatColor()` calls; transparent swatch (minimal) gets `border border-border`.

**Loading/empty states:**
- Loading: spinner + "Loading subject data..."
- No subjects: "Subject-level data not available for this specimen."
- No findings after filter: "No findings match the current filters."

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

### `deriveSpecimenInsights(rules, specimen): InsightBlock[]`
Context panel insight synthesis. Groups rules by finding (collapsed across sexes) into sections:
1. **Adverse (treatment-related):** Per-finding with evidence qualifiers (p-value, effect size, incidence/severity increase) and inline clinical catalog annotations
2. **Clinical significance:** Non-adverse findings matched by clinical catalog (C01–C15)
3. **Protective (decreased with treatment):** Per-finding with control→high dose percentages; protective-excluded findings shown as info kind
4. **Info (notes):** Suppressed protective findings with exclusion IDs

### `deriveSpecimenReviewStatus(findingNames, reviews): SpecimenReviewStatus`
Aggregates peer review annotations across all findings in a specimen. Returns one of:
- **Preliminary**: no reviews record or all "Not Reviewed"
- **Revised**: any finding has "Disagreed"
- **Confirmed**: all findings have "Agreed"
- **In review**: mix of reviewed + unreviewed (no "Disagreed")

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/histopathology`, shows `HistopathologyContextPanel`.

The `HistopathologyContextPanelWrapper` in `ContextPanel.tsx` fetches `lesionData`, `ruleResults`, and `pathReviews` via hooks and passes as props. Selection flows from `ViewSelectionContext`.

### No Selection State
- Message: "Select a specimen or finding to view details."

### Specimen-Level View (selection has specimen, no finding)

Header: sticky, specimen name (`text-sm font-semibold`) + review status badge + adverse count badge + `CollapseAllButtons`, domain labels below.

Panes:
1. **Insights** (default open) — `SpecimenInsights` component rendering `InsightBlock[]` via `deriveSpecimenInsights()`. Blocks grouped into labeled sections:
   - **Treatment-related** (adverse blocks): per-finding, collapsed across sexes with evidence qualifiers (p-value, effect size, incidence/severity increase) and inline clinical annotations
   - **Clinical significance** (clinical blocks): findings matched by clinical catalog but not already in adverse section — shows class + catalog ID + confidence
   - **Decreased with treatment** (protective blocks): per-finding with control→high dose percentages; excluded findings show info kind with exclusion ID
   - **Notes** (info blocks): suppressed protective findings, etc.
2. **Overview** (default open) — conclusion chips (incidence, severity, sex, dose-relation, findings count)
3. **Pathology Review** — `PathologyReviewForm` (specimen-level, keyed by `specimen:{name}`)
4. **Related views** (default closed) — "View target organs", "View dose-response", "View NOAEL decision" links

Review status is derived via `deriveSpecimenReviewStatus(findingNames, pathReviews)` where `pathReviews` is fetched by the wrapper and passed through.

### Finding-Level View (selection has specimen + finding)

Header: sticky, finding name (`text-sm font-semibold`) + `CollapseAllButtons`, specimen name below (`text-xs text-muted-foreground`).

**Header metrics line** (`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground`): Four inline metrics computed from finding rows — Incidence (`{affected}/{N} ({pct}%)`), Max sev (`{n.n}`), Dose trend (`{Weak|Moderate|Strong}`), Sex (`{M|F|M/F}`). Makes the panel presentation-ready without scrolling.

Panes in order (follows design system priority: insights > stats > related > annotation > navigation):
1. **Insights** (default open) — `InsightsList` with finding-scoped rules. Includes clinical catalog annotations when present.
2. **Dose detail** (default open) — all dose-level rows for finding + specimen, sorted by dose_level then sex. Table columns: Dose, Sex, Incid., mini dose ramp bar, Avg Sev, Sev. The mini dose ramp is a `h-1.5 rounded-full` horizontal bar (neutral gray: track `bg-gray-100`, fill `bg-gray-400`) showing relative incidence percentage per row. Makes dose relationship pre-attentive without reading numbers.
3. **Sex comparison** (conditional, default open) — only shown when finding has data from both sexes. Per-sex row: affected/total + max severity badge with `getNeutralHeatColor()`.
4. **Correlating evidence** (default open) — up to 10 other findings in same specimen, sorted by max severity desc, with severity badge colored by `getNeutralHeatColor()`
5. **Pathology review** — `PathologyReviewForm` (not wrapped in CollapsiblePane, uses own form state)
6. **Tox Assessment** — `ToxFindingForm` keyed by finding (not wrapped in CollapsiblePane)
7. **Related views** (default closed) — "View target organs", "View dose-response", "View NOAEL decision" links

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected specimen | Local | `useState<string \| null>` — which specimen is active in the rail |
| Active tab | Local | `useState<EvidenceTab>` — "overview" or "hypotheses" |
| Selection (finding) | Shared via context | `ViewSelectionContext` with `_view: "histopathology"` tag |
| Sex filter | Local (parent) | `useState<string \| null>` — shared with Evidence tab filters |
| Min severity | Local (parent) | `useState<number>` — shared with Evidence tab filters |
| Heatmap view | Local (OverviewTab) | `useState<"severity" \| "incidence">` — group heatmap coloring mode (default "severity") |
| Matrix mode | Local (OverviewTab) | `useState<"group" \| "subject">` — toggles between group and subject heatmaps (default "group") |
| Affected only | Local (OverviewTab) | `useState<boolean>` — filter subjects to affected only in subject mode (default true, resets to true on specimen change) |
| Subject sort | Local (OverviewTab) | `useState<"dose" \| "severity">` — subject heatmap sort mode (default "dose", resets on specimen change). Severity sort orders within dose groups, not across them. |
| Dose group filter | Local (OverviewTab) | `useState<ReadonlySet<string> \| null>` — multi-select dropdown with checkboxes via FilterMultiSelect (null = all shown, Set of composite keys when filtered, resets on specimen change) |
| Dose-dep threshold | Local (OverviewTab) | `useState<"moderate" \| "strong" \| "ca_trend" \| "severity_trend">` — dose-dependence method (default "moderate") |
| Hide zero severity | Local (OverviewTab) | `useState<boolean>` — filter findings table (default false) |
| Chart display modes | Local (OverviewTab) | `useState<ChartDisplayMode>` × 2 — "compact" or "scaled" for incidence and severity charts (default "scaled") |
| Section heights | Local (OverviewTab) | `useAutoFitSections` — findings table (200px default, 80-500px) + dose chart (170px default, 80-400px) |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state (in OverviewTab) |
| Column sizing | Local | `useState<ColumnSizingState>` — TanStack column resize state (in OverviewTab) |
| Selected subject | Local | `useState<string \| null>` — column highlight in SubjectHeatmap |
| Rail width | Local | `MasterDetailLayout` — default 300px, resizable 180-500px |
| Rail sort | Local (SpecimenRail) | `useState<"signal" \| "organ" \| "severity" \| "incidence" \| "alpha">` (default "signal") |
| Rail min sev filter | Local (SpecimenRail) | `useState<number>` (default 0) |
| Rail adverse only | Local (SpecimenRail) | `useState<boolean>` (default false) |
| Rail dose trend filter | Local (SpecimenRail) | `useState<"any" \| "moderate" \| "strong">` (default "any") |
| Specimen rules | Derived | `useMemo` — rules filtered to selected specimen, shared between SpecimenHeader and OverviewTab |
| Finding clinical | Derived | `useMemo` — Map<finding, {clinicalClass, catalogId}> from ruleResults for clinical catalog lookup |
| Lesion data | Server | `useLesionSeveritySummary` hook (React Query, 5min stale) |
| Finding dose trends | Server | `useFindingDoseTrends` hook (statistical trend data) |
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
useFindingDoseTrends(studyId, specimen) ──> trendsByFinding (statistical trend data)
useAnnotations<PathologyReview> ──> pathReviews (shared cache with context panel)
                                |
                    deriveSpecimenSummaries() → SpecimenSummary[]
                    findingNamesBySpecimen → Map<specimen, finding[]>
                    (skips rows with null specimen)
                                |
                        SpecimenRail (sorted by signal score desc)
                        + filters (sort, min sev, adverse only, dose trend)
                        + organ system grouping when sort=organ
                        + deriveSpecimenReviewStatus() per rail item
                                |
                    [selectedSpecimen] → filter lesionData
                                |
                    specimenData ──> specimenRules (filtered at parent)
                                |
                        deriveFindingSummaries()
                        deriveSexLabel() / getDoseConsistency()
                        deriveSpecimenConclusion()
                        findingClinical (clinical catalog lookup)
                           /                  \
                  OverviewTab            HypothesesTab
                  (findings table +       (selectedFinding
                   dual dose charts +     auto-focus)
                   severity matrix)
                        \                 /
                    HistopathSelection (shared)
                                |
                  HistopathologyContextPanel
                    /  |    |     |     \    \     \
                 Ins  Dose  Sex  Corr  Path  Nav  Tox
                (+ clinical catalog annotations)
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

## Clinical Catalog Integration

The view integrates with the clinical insight layer (`backend/services/analysis/clinical_catalog.py`). Clinical annotations flow through rule results as params:

- `clinical_class`: "Sentinel" | "HighConcern" | "ModerateConcern" | "ContextDependent"
- `catalog_id`: "C01" through "C15"
- `clinical_confidence`: "Low" | "Medium" | "High"
- `protective_excluded`: boolean (when a protective label is suppressed by PEX01–PEX07)
- `exclusion_id`: "PEX01" through "PEX07"

**Findings table:** The Signal column replaces misleading "normal" statistical severity with the clinical class label when a catalog match exists. This surfaces clinically significant findings (e.g., HEPATOCELLULAR CARCINOMA is "normal" statistically but "Sentinel" clinically).

**Context panel:** Clinical annotations appear inline on adverse insight blocks and as a separate "Clinical significance" section for non-adverse matched findings.

**Per-finding lookup:** `findingClinical` useMemo scans all rule results for matching specimen+finding with `clinical_class` params, producing a Map for O(1) lookup per finding row.

---

## Backlog

| Item | What's needed | Priority |
|------|--------------|----------|
| Cross-domain correlating evidence (D-2) | Backend/generator changes to link clinical pathology (CL, LB) findings to histopathology specimens | P3 |
