# Histopathology View

**Route:** `/studies/:studyId/histopathology`
**Component:** `HistopathologyView.tsx`
**Scientific question:** "What are the microscopic findings and how severe are they across dose groups?"
**Role:** Histopathology-specific analysis. Two-panel master-detail layout with specimen rail and evidence panel (Evidence + Hypotheses + Compare tabs).

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
| Rail       |s|  incidence, max sev, pattern, findings count        |
|            |i|  lab correlation, syndrome, alerts                   |
| search     |z+----------------------------------------------------+
| specimen 1 |e| [Evidence] [Hypotheses] [Compare]     <── tab bar   |
| specimen 2 | +----------------------------------------------------+
| specimen 3 | | Tab content:                                       |
| ...        | |  Evidence: findings table ─ resize ─               |
|            | |    dose-incidence chart ─ resize ─                  |
|            | |    severity matrix (group/subject toggle)            |
|            | |  Hypotheses: exploratory tools                      |
|            | |  Compare: multi-subject comparison (2+ selected)    |
+------------+-+----------------------------------------------------+
             ^ PanelResizeHandle (4px)
* default 300px, resizable 180-500px via useResizePanel
```

The evidence panel has a subtle muted background (`bg-muted/5`) to visually distinguish it from the crisp-white context panel where conclusions live.

The rail width is controlled by `useResizePanel(300, 180, 500)` — default 300px, draggable between 180px and 500px. A `HorizontalResizeHandle` (4px vertical drag strip) sits between the rail and evidence panel, hidden at narrow widths (`max-[1200px]:hidden`).

Responsive: stacks vertically below 1200px (`max-[1200px]:flex-col`). Rail becomes horizontal 180px tall strip with `max-[1200px]:!w-full`.

---

## Specimen Rail (left panel, resizable 300px default)

Container: `shrink-0 border-r` with `style={{ width: railWidth }}` where `railWidth` comes from `useResizePanel(300, 180, 500)`. On narrow viewports: `max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b max-[1200px]:overflow-x-auto`.

### Header
- Label: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Specimens ({N})"
- Search input: `mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs` with placeholder "Search specimens..."

### Rail Items

Each `SpecimenRailItem` is a `<button>` using design tokens from `rail` (`rail.itemBase`, `rail.itemSelected`, `rail.itemIdle`) with `px-2.5 py-2`.

**Row 1 (name + quantitative indicators):** Specimen name (`text-xs font-semibold`, underscores replaced with spaces) + review status glyph (Confirmed: `✓`, Revised: `~`, Preliminary/In review: no glyph — `text-[9px] text-muted-foreground`) + `SparklineGlyph` (mini pattern visualization from `pattern.sparkline`) + max severity badge (`font-mono text-[9px]`, `getNeutralHeatColor(maxSeverity)` background) + max incidence badge (`font-mono text-[9px]`, `getNeutralHeatColor01(maxIncidence)` background) + finding count (`font-mono text-[9px]`) + adverse count with "A" suffix (`font-mono text-[9px]`).

**Row 2 (organ system + domains):** `mt-0.5` — organ system label (`text-[10px] text-muted-foreground/60`, `titleCase(specimenToOrganSystem())`) + domain labels (`<DomainLabel>` for each domain).

### Sorting

Default sort by signal score descending, then `findingCount` desc as tiebreaker.

**Signal score formula (pattern-classification aware):**

For standard specimens:
```
signalScore = (adverseCount × 3) + maxSeverity + (maxIncidence × 5) + patternWeight + syndromeBoost + clinicalFloor + sentinelBoost
```

For `MONOTONIC_DOWN` specimens (findings that decrease with dose):
```
signalScore = (maxSeverity × 0.5) + (decreaseMagnitude × 3) + patternWeight + syndromeBoost
```

Where:
- `patternWeight` comes from `patternWeight(pattern, confidence, syndrome)` in `pattern-classification.ts`
- `syndromeBoost` adds score for syndrome detection matches
- `clinicalFloor` is a minimum score based on highest clinical class (Sentinel: 20, HighConcern: 12, ModerateConcern: 6, ContextDependent: 2)
- `sentinelBoost` adds 15 when `hasSentinel` is true
- `decreaseMagnitude` is `max(0, controlIncidence - highDoseIncidence)` across all findings

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

On data load, auto-selects the top specimen (highest signal score) via `StudySelectionContext.navigateTo()`.

---

## Specimen Summary Strip

`shrink-0 border-b bg-background px-3 py-1.5` — sticky above the tab bar.

### Title row (flex, items-center, gap-2)

- Specimen name: `text-sm font-semibold` (underscores replaced with spaces)
- Domain labels: `<DomainLabel>` for each domain
- Sex scope: `text-[10px] text-muted-foreground` — from `deriveSexLabel(specimenData)`
- Adverse badge (if adverseCount > 0): `rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground` — "{N} adverse"

### Metrics row (mt-1, flex, items-center, gap-4, text-[10px], text-muted-foreground)

| Metric | Format |
|--------|--------|
| Peak incidence | `{pct}%` — font-mono font-medium |
| Max sev | `{n.n}` — font-mono font-medium |
| Pattern | `SparklineGlyph` (mini sparkline) + `formatPatternLabel(pattern)` — font-medium |
| Findings | `{findingCount}` — font-mono font-medium, with `({adverseCount}adv/{warningCount}warn)` suffix when warningCount > 0 |
| Sex skew | (conditional) `{males higher|females higher|balanced}` — shown when `sexSkew` is not null |
| Recovery | (conditional) shown when `specimenRecoveryOverall` is non-null and not "reversed" — `{specimenRecoveryOverall}` |
| Lab | (conditional) shown when `labCorrelation.hasData && topSignal && signal >= 2` — clickable, shows `●●●` or `●●` signal dots + test name + `±X%` change. Tooltip: "Top lab signal: {test} ±X% vs control — click to view lab correlates". Click scrolls to `[data-pane="lab-correlates"]` in context panel. |

### Syndrome line (conditional)

Shown when `selectedSummary.pattern.syndrome` exists. `mt-0.5 truncate text-[10px] text-muted-foreground/70` — displays syndrome name + required finding + supporting findings (e.g., "🔗 Hepatotoxicity syndrome: HEPATOCELLULAR NECROSIS + BILE DUCT HYPERPLASIA"). Full details in tooltip.

### Pattern alerts (conditional)

Shown when `pattern.alerts.length > 0`. `mt-0.5 text-[10px] text-muted-foreground/70` — dot-separated list of alert messages with priority icons (⚠ for HIGH/MEDIUM, ⓘ for LOW).

---

## Tab Bar

`flex shrink-0 items-center border-b bg-muted/30` (canonical tab bar pattern, uses `ViewTabBar` component with nested flex container)

Three tabs: **Evidence**, **Hypotheses**, **Compare** (conditional)

The **Compare** tab only appears when 2+ subjects are selected for comparison. It displays a count badge showing the number of selected subjects.

Active tab: `text-foreground` + `absolute inset-x-0 bottom-0 h-0.5 bg-primary` underline
Inactive tab: `text-muted-foreground hover:text-foreground`
All tabs: `relative px-4 py-1.5 text-xs font-medium transition-colors`

---

## Evidence Tab (internal component: `OverviewTab`)

`flex flex-1 flex-col overflow-hidden` — vertically split into three sections via `useSectionLayout`. Contains the observed findings table (top, resizable), dose-incidence chart (middle, resizable), and severity matrix (bottom, resizable). This keeps the core pathologist triage workflow — findings + dose chart + heatmap — on a single tab without switching.

### Adaptive Section Layout

The Evidence tab uses `useSectionLayout(containerRef, naturalHeights)` from `hooks/useSectionLayout.ts` to manage three sections with adaptive sizing. Each section has default proportional heights that redistribute based on the container's actual height via `ResizeObserver`. Natural heights are computed from content:
- **Findings**: `filteredTableData.length * 28 + 40` (row count + overhead)
- **Dose charts**: `170` normally, or taller when recovery bars + spacer are present
- **Matrix**: `(findings.length * 24) + matrixOverhead` where overhead is 200px for subject mode, 130px for group mode

Section config constants: `findings` (default 200, min useful 80), `doseCharts` (default 220, min useful 140), `matrix` (default 210, min useful 120).

### Collapsible Sections

Each section uses a `SectionHeader` component (`components/ui/SectionHeader.tsx`) with a 28px strip height. The header renders a chevron (right when collapsed, down when expanded), a chrome zone (title + count), a `StripSep` dot separator (`mx-1.5`), a selection zone, and optional header-right content (hidden when collapsed).

When collapsed (height <= 28px), the header gets `cursor-pointer border-b bg-muted/20`. The chevron is always clickable — clicking it toggles strip/expanded via `onStripClick` (which calls `restoreDefaults()`).

- **Single-click** on a collapsed strip or its chevron restores all sections to default proportional heights.
- **Double-click** on any section header (collapsed or expanded) focuses that section — gives it `min(naturalHeight, total - 2*STRIP)` while others get proportional leftovers. Non-focused sections that fall below their `minUseful` threshold auto-collapse to strip height. Double-click again restores all to defaults.
- **Specimen change** resets all sections to defaults (new diagnostic context -> full layout).

**Resize handles:** `HorizontalResizeHandle` appears between adjacent non-stripped sections. Pointer-drag adjusts the pair of sections; manual resize clears any focused section.

**One-time focus hint:** On first double-click, a toast appears: "Tip: double-click any section header to maximize it. Double-click again to restore." The hint fades out after 2.5s (`opacity-0` transition at 2500ms, removed at 3500ms). Persisted via `localStorage` key `dg-section-focus-hint-shown`.

### Selection Zones

Each section header includes a **selection zone** — an adaptive content area between the title and header-right that summarizes the section's current state and/or selected finding. Selection zones are extracted into dedicated components.

#### `FindingsSelectionZone` (`FindingsSelectionZone.tsx`)

- **Finding selected:** `▸ {finding}` (clickable, scrolls to finding row via `data-finding` + `scrollIntoView`) + incidence% + severity label + `✓dose-dep` (if dose-driven) + `also in: {organs}` (if relatedOrgans) + recovery verdict arrow + verdict label (if meaningful recovery).
- **No selection:** Top 3 flagged findings (severity !== "normal" or clinicalClass) with signal label + incidence%, plus `+{N} flagged` overflow and `+{N} normal` count. Items separated by `StripSep` dots.

#### `DoseChartsSelectionZone` (`DoseChartsSelectionZone.tsx`)

- **Finding selected:** `font-mono` inline sequence: `Incid:` followed by per-dose-group incidence arrows (e.g., `0%→25%→50%`) with typography weight escalating by value. When recovery data exists, appends `| R:` separator and recovery dose sequence at 60% opacity. Then `StripSep`, then `Sev:` with similar per-dose severity arrows. Typography helpers `incTypo(pct)` and `sevTypo(v)` apply escalating font-weight/color classes.
- **No selection:** `Peak incidence: {pct}% ({group})` + recovery peak arrow if applicable. Then `StripSep` + `Peak severity: {n.n} ({group})` + recovery peak. Recovery peaks shown at 60% opacity with `(R)` suffix.

#### `MatrixSelectionZone` (`MatrixSelectionZone.tsx`)

Uses subject-level data for sex breakdown when `subjects` prop is available.

- **Finding selected (with subjects):** `▸ {finding}: {F}F + {M}M in {highestDoseLabel}` (primary = highest affected dose group) + `also {otherLabels}` for other affected groups. Falls back to affected count (no sex breakdown) when subject data unavailable.
- **No selection (with subjects):** Top 2 dose groups by total affected: `{label}: {N} affected ({M}M, {F}F)` separated by `StripSep`. Falls back to simple affected count without sex breakdown.
- **Click-to-scroll:** Finding name in selected mode is clickable, scrolls to matching row in matrix and restores section if stripped.

### Observed Findings (top section)

TanStack React Table with sortable, resizable columns. Section header uses `SectionHeader` with title "Observed findings" and `FindingsSelectionZone`.

**Header right:** "Hide zero severity" checkbox — filters out findings with `maxSeverity === 0`. Count shows: `({filtered} of {total})` when active, `({count})` otherwise.

**Columns:**

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| finding | Finding | 120px (60-260) | Severity micro-cell (`h-2.5 w-2.5 rounded-sm`, `getNeutralHeatColor(maxSev).bg`) + truncated name (weight escalates: `font-medium` -> `font-semibold` at sev 2+ -> `font-bold` at sev 4+) |
| maxSeverity | Peak sev | 50px (40-80) | `font-mono text-[10px]`, weight/opacity escalates with value. En dash for zero. Tooltip "Max severity: {n.n} (scale 1-5)" |
| incidence | Incid. | 50px (42-80) | `font-mono text-[10px]`, percentage format. Weight/opacity escalates at 10%/30% thresholds. En dash for zero. |
| severity | Signal | 60px (48-100) | **Clinical-aware severity cell** using `signal.*` design tokens. When statistical severity is "normal" but a clinical catalog match exists, replaces "normal" with clinical class label (Sentinel / High concern / Moderate / Flag) via `signal.clinicalOverride` (`border-l-2 border-l-gray-400`, `text-[9px] font-medium text-foreground`). Tooltip shows both clinical and statistical classification. For adverse/warning/normal without clinical override: `signal.adverse` (`border-l-red-600`), `signal.warning` (`border-l-amber-600`), `signal.normal` (`border-l-emerald-400/40`, `text-muted-foreground`). **Decreased** severity (dose direction = decreasing, severity = warning): renders "decreased" with `signal.decreased` tokens + tooltip showing control% → high dose% incidence drop. |
| isDoseDriven | Dose-dep. `▾` | 80-100px (55-140) | **Switchable dose-dependence method.** Clicking the column header opens a context menu with 5 methods grouped as Heuristic (Moderate+, Strong only) and Statistical (CA trend, J-T trend, Fisher vs ctrl). Header label changes to reflect active method. Cell shows `✓` when criterion met; for statistical methods, shows p-value in tooltip or "–" with reason when not significant/no data. **Fisher's pairwise** shows per-group compact display: `G1:✓✓ G2:✓ G3:–` (double checkmark for p < 0.01, single for p < 0.05, dash for not significant). Tooltip lists all pairwise p-values. **Non-monotonic** findings show `⚡` glyph instead of ✓/–. When mortality masking is detected (high-dose mortality correlates with lower incidence), tooltip adds "⚠ High-dose mortality may mask findings at top dose." |
| recoveryVerdict | Recovery | 70px (55-120) | **Conditional column** — only present when `specimenHasRecovery` is true. Cell: verdict arrow (`verdictArrow()`) + verdict label (`text-[9px]`). Special verdicts: `not_examined` → "∅ not examined" (`font-medium text-foreground/70`); `low_power` → "~ low power" (`text-muted-foreground/50`); `insufficient_n` → "† (N<3)" (`text-muted-foreground/50`). `persistent`, `progressing`, `anomaly` get `font-medium text-foreground/70`; others get `text-muted-foreground`. Em dash for `not_observed`/`no_data`/null. Tooltip from `buildRecoveryTooltip()`. Sortable via custom `verdictPriority()` comparator. |
| laterality | Lat. | 60px (40-90) | **Conditional column** — only present when specimen is a paired organ (`isPairedOrgan()`) AND has laterality data in subject records (`specimenHasLaterality()`). Shows aggregated laterality across subjects: `B` (bilateral, `text-foreground`), `L` (left only, `text-muted-foreground`), `R` (right only, `text-muted-foreground`), `mixed` (both unilateral and bilateral, `text-amber-600/70`). Count in parens when > 1 subject. Tooltip: "Bilateral: N, Left only: N, Right only: N". |
| relatedOrgans | Also in `ⓘ` | 140px (50-300) | Absorber column. Clickable organ links (`text-primary/70 hover:underline`) with incidence % in parens from R16 cross-organ coherence + lesion data join. Click navigates to the related specimen via `onSpecimenNavigate()`. Tooltip on header explains R16 matching. |

**Content-hugging layout:** All columns except "Also in" (absorber) use `width: 1px; white-space: nowrap` so they shrink to content. The absorber column absorbs remaining space. Manual column resize overrides with explicit width.

Sorted by max avg_severity descending. Click sets finding-level selection (updates context panel). Click again to deselect. Column resizing enabled via drag handles.

**Mortality masking:** For non-monotonic findings, the view checks if high-dose mortality may mask findings. If the highest dose group has lower incidence than a mid-dose group AND has moribund/dead subjects, the finding is flagged in `mortalityMaskFindings`. The `⚡` glyph tooltip includes a mortality masking warning.

### Dual Dose Charts (middle section)

Side-by-side ECharts bar charts — **Incidence** (left, `border-r border-border/30`) and **Severity** (right). Built by `buildDoseIncidenceBarOption()` and `buildDoseSeverityBarOption()` from `charts/histopathology-charts.ts`.

Each chart has a **Compact/Scaled mode toggle** (`ChartModeToggle`) — "C" (compact: auto-scale to data range) and "S" (scaled: fixed axis range 0-100% / 0-5). Toggle pills: `rounded-sm px-1 py-px text-[9px] font-semibold`, active: `bg-foreground text-background`, inactive: `text-muted-foreground/50`.

**Section title:** Dynamic — "Dose charts: {finding}" when finding selected, "Dose charts (specimen aggregate)" otherwise. Uses `SectionHeader` with `DoseChartsSelectionZone`.

**Incidence chart:**
- Horizontal bars (Y-axis: dose groups, X-axis: incidence percentage).
- When both sexes present and no sex filter: groups bars by sex.
- Bar fill color: white-to-dark linear interpolation (`#ffffff` at 0% -> `#4B5563` at 100%).
- Empty state: "No incidence data."

**Severity chart:**
- Horizontal bars (Y-axis: dose groups, X-axis: average severity 0-5).
- Only includes rows with avg_severity > 0.
- When both sexes present and no sex filter: groups bars by sex.
- Bar fill color: same white-to-dark gradient mapped from severity scale.
- Empty state: "No severity data."

**Recovery arm support:** When `specimenHasRecovery` is true and recovery dose groups exist, both charts render recovery bars **below** main bars (recovery categories come first in the ECharts data array since category axes render bottom-to-top):
- A spacer category between recovery and main sections.
- Recovery bars render with 50% opacity fills.
- A dashed `markLine` separator labeled "Recovery" (`insideEndBottom` position) at the spacer.
- Y-axis labels for recovery groups use gray text (`#9CA3AF`) with "(R)" suffix.
- Tooltips for recovery bars show current value, main arm value for comparison, and change with directional arrows and percentage (green for decrease, red for increase).
- Bar end labels for recovery bars use muted text (`rgba(107,114,128,0.5)`).

**Shared behavior:**
- When no finding selected: specimen-level aggregate per dose group.
- When a finding selected: that finding's data per dose group.
- Both charts use a stable frame (all dose levels + sexes from the full specimen, not filtered by finding) so axes don't shift when selecting different findings.

### Severity Matrix (bottom section)

Contains both group-level and subject-level heatmaps, toggled via a Group/Subject segmented control. Sex/severity filters come from `GlobalFilterContext`.

#### Group/Subject Mode Toggle

The mode toggle is inline in the `SectionHeader` `titleContent`: `SEVERITY MATRIX: GROUP | SUBJECTS` — clickable text links (active: `text-foreground`, inactive: `text-muted-foreground/40 hover:text-muted-foreground/60`, separated by `|` with `mx-0.5 text-muted-foreground/30`). Finding count appended as `SectionHeader` `count` prop when heatmap data exists. Count format: `{filtered} of {total} findings` when filtered, `{N} findings` otherwise. Subject mode computes its own finding counts from `subjData`.

#### Filter Controls

Filter controls render below the section header via `FilterBar`. Each mode includes common and mode-specific controls.

**Common controls (both modes):**
- Severity graded only: checkbox — filters findings to those with `hasSeverityData === true`

**Group mode adds:**
- Severity/Incidence toggle: segmented control (`rounded-full` pills `text-[11px]`, active: `bg-foreground text-background`)
- `FilterShowingLine` shown when `severityGradedOnly` is active (includes parts for sex filter, min severity)

**Subject mode adds:**
- Dose group filter: `<FilterMultiSelect>` dropdown with checkboxes — "All dose groups" when all selected, single label when one selected, "{N} groups" when multiple. Dropdown panel has "Select all" / "Clear all" link buttons at top, then main arm checkboxes + "Recovery" group header with recovery arm checkboxes. Minimum 1 must remain selected (clear all keeps first option). Short labels strip "Group N," prefix and drug name (e.g., "Group 2, 2 mg/kg PCDRUG" -> "2 mg/kg"; "Group 1, Control" -> "Control"). State: `ReadonlySet<string> | null` (null = all selected). Composite keys: `"0"`, `"1"` etc. for main arms, `"R0"`, `"R1"` etc. for recovery arms. Computed from `subjData.subjects`, separated by `is_recovery` flag, each sorted by dose_level ascending.
- Subject sort: `<FilterSelect>` — "Sort: dose group" / "Sort: max severity". Severity sort sorts within each dose group (dose groups always ascending, severity descending within group).
- Affected only: checkbox + "Affected only" label (default: checked)

**Filter ordering:** Dose group filter applies first, then sex, then affected-only. This ensures control group subjects (who typically have no findings) survive the dose group filter even when "Affected only" is checked — the user can uncheck it to see the full baseline roster.

**Filter summary strip:** A `FilterShowingLine` always appears above the controls in subject mode as plain `·`-separated text (e.g., "Showing: All groups · Both sexes · Affected only"). Uses stable-height plain text (no chips) to prevent layout jumps when filters change. Recovery groups show `(R)` suffix. Always visible — no conditional hiding. Also includes "Severity graded only" and "Severity N+" when active.

**Implementation:** Subject mode passes all controls as a `controls` ReactNode prop to `SubjectHeatmap`, which renders them between the filter summary and the matrix. `doseGroupOptions` prop provides label lookup for the filter summary. Group mode renders the `FilterBar` inline between the header and the description text.

Matrix mode, affected only, subject sort, dose group filter, and severity graded only reset on specimen change via `useEffect`. Affected only resets to `true`; others reset to defaults.

#### Group-Level Heatmap (matrixMode === "group")

Rendered when `heatmapData` exists and has findings.

**Description text:** `mb-0.5 text-[10px] text-muted-foreground` — "Cells show average severity grade per dose group. Non-graded findings show incidence." (severity mode) or "Cells show % animals affected per dose group." (incidence mode).

**Legend:** 5 color swatches with labeled numeric prefixes. Severity mode: "1 Minimal", "2 Mild", "3 Moderate", "4 Marked", "5 Severe". Incidence mode: "1-19%", "20-39%", "40-59%", "60-79%", "80-100%". Swatches use `getNeutralHeatColor()` / hardcoded hex for incidence; transparent swatches get `border border-border`.

**Structure:** `overflow-x-auto` > `inline-block` — horizontal scrollable flex layout.

**Header row:** Finding label column `w-52 shrink-0` + dose columns each `w-20 shrink-0 text-center text-[10px] font-medium text-muted-foreground` using `<DoseHeader>` component. When `recoveryHeatmapData` exists, a `w-px bg-border mx-0.5` vertical separator followed by a "Recovery" group header (`text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50`) and recovery dose columns each `w-20` with `text-muted-foreground/60` and "(R)" suffix.

**Data rows:** No finding cap (specimens typically have 1-11 findings each).
- Each `flex cursor-pointer border-t hover:bg-accent/20`, selected: `ring-1 ring-primary`
- Finding label: `w-52 shrink-0 truncate py-0.5 pr-2 text-[10px]`, truncated at 40 chars
- **Graded cells (severity mode):** `flex h-6 w-20 shrink-0 items-center justify-center` with `h-5 w-16 rounded-sm` inner block colored by `getNeutralHeatColor(avg_severity)`. Cell label: severity value (n.n) when > 0, or `{affected}/{n}` fraction when severity is 0. Gray placeholder (`h-5 w-16 bg-gray-100`) when no data. **Outlier detection**: max_severity ≥ 3 AND (max - avg) ≥ 2 → white `▴` triangle marker at top-right of cell.
- **Non-graded cells (severity mode):** `h-5 w-12 rounded-sm bg-gray-100 font-mono text-[10px] text-muted-foreground` showing `{pct}%` incidence. Narrower (`w-12`) than graded cells to visually distinguish.
- **Incidence cells:** Percentage format colored by `getNeutralHeatColor01(incidence)`.
- **Recovery cells:** Separated by `w-px bg-border mx-0.5` vertical line. Five special cases checked in order:
  1. **Not examined** (`recovery.examined === 0`): renders `∅` with `text-muted-foreground/30`, tooltip "Not examined in recovery arm".
  2. **Insufficient N** (`recovery.n < MIN_RECOVERY_N`): renders `†` with `text-muted-foreground/30`, tooltip "Recovery N={n}, too few subjects for comparison".
  3. **Anomaly** (main incidence = 0 AND recovery incidence > 0): renders `⚠` with `text-muted-foreground/50`, tooltip "Anomaly: finding present in recovery but not in main arm".
  4. **Low power** (main incidence × recovery examined < 2): renders `~` with `text-muted-foreground/30`, tooltip "Low power: expected affected < 2 at this dose level".
  5. **Not observed** (main incidence = 0 AND recovery incidence = 0): empty cell with `bg-gray-50`.
  Otherwise, same rendering as main cells (heat-colored by incidence/severity). Empty recovery cells (no data at all) use `bg-gray-50` instead of `bg-gray-100`.

**Neutral heat color scale:** `getNeutralHeatColor()` — 5 distinct grades: transparent (minimal, grade 1), `#D1D5DB` (mild), `#9CA3AF` (moderate), `#6B7280` (marked), `#4B5563` (severe). Minimal gets no color to reinforce low clinical significance; thresholds are integer-aligned (`>= 2`, `>= 3`, etc.). Incidence mode uses `getNeutralHeatColor01()` (0-1 scale).

#### Subject-Level Heatmap (matrixMode === "subject")

Subject data always fetched via `useHistopathSubjects(studyId, specimen)` (not lazy — needed for recovery assessment and group heatmap recovery columns too). API response includes recovery arm subjects with `is_recovery: boolean` field and `recovery_days: number | null`. Container: `relative border-b p-3`. Accepts `affectedOnly` (default true), `doseGroupFilter` (`ReadonlySet<string> | null`, default null = show all), `sortMode`, `severityGradedOnly`, `findingSeverityMap`, `controls` (ReactNode rendered between filter summary and matrix), `comparisonSubjects`, `onComparisonChange`, `onCompareClick`, and `showLaterality` props. Filters: dose group (Set.has() with composite key), sex, affected-only (`Object.keys(findings).length > 0`). Sort: main arms before recovery, dose_level ascending within each category, then within-group by severity (if sortMode=severity) or sex+ID (if sortMode=dose). Dose groups grouped by composite key (dose_level + is_recovery); recovery group labels appended with "(Recovery)".

**Finding label column:** Resizable via `useResizePanel(124, 100, 400)`. A 1px cursor-col-resize handle sits at the right edge. Finding labels are `sticky left-0 z-10` with `bg-background` to stay visible during horizontal scroll.

**Structure:** Five-tier header (plus optional comparison checkbox and laterality rows):
1. **Dose group headers** — horizontal bar above each dose group with colored indicator stripe (`getDoseGroupColor(doseLevel)`), label with `({N})` subject count. When comparison is active, includes a tri-state checkbox per dose group (checked/indeterminate/unchecked) to toggle all subjects in the group.
2. **Subject IDs** — one column per subject (`w-8`), showing abbreviated ID via `shortId()` (splits on dashes, returns last segment; falls back to `slice(-4)`). Clickable — highlights column and fires `onSubjectClick`.
3. **Comparison checkboxes** (conditional, when `comparisonSubjects` + `onComparisonChange` are provided) — `h-5 w-8` per subject with a checkbox. Supports shift+click for range-select across visible subjects. Max 8 subjects (`MAX_COMPARISON_SUBJECTS`). Exceeding max shows a toast: "Maximum 8 subjects for comparison. Deselect one to add another." (3s auto-dismiss).
4. **Laterality header row** (conditional, when `showLaterality` is true) — per-subject laterality indicator (`B`/`L`/`R`/`mixed`, `text-[8px] font-semibold text-muted-foreground`). Only shown for paired organs with laterality data.
5. **Sex indicator row** (hidden when sex filter active) — "M"/"F" per subject, `text-[8px] font-semibold text-muted-foreground` (no sex-specific coloring).
6. **Examined row** — "E" if subject has any findings, empty otherwise. `border-b`.

**Data rows:** One per finding (sorted: graded findings first by max severity desc, then non-graded alphabetical; filtered by `minSeverity` and `severityGradedOnly`). Each cell (`w-8 h-6`):
- Severity > 0: block (`h-5 w-6 rounded-sm font-mono text-[9px]`) with severity number, color from `getNeutralHeatColor(sevNum)` — minimal (grade 1) renders transparent, grades 2-5 get progressively darker gray. **Laterality dots** (when `showLaterality` and entry has laterality): small dot at left edge for "LEFT" (`left-0`), right edge for "RIGHT" (`right-0`), no dot for "BILATERAL".
- Entry with severity 0 but finding is graded (has grades in other subjects): em dash (`text-[9px] text-muted-foreground`)
- Entry present but finding is non-graded: gray dot (`text-[10px] text-gray-400` `●`). **Laterality dots** applied same as severity cells.
- No entry: empty cell

**Column highlighting:**
- Single-selected subject: `bg-blue-50/50`
- Comparison-selected subjects: `bg-amber-50/40`

**Comparison selection bar:** Appears at the bottom of the heatmap when `comparisonSubjects.size > 0`. Shows `{N} subjects selected:` (font-medium) + comma-separated subject descriptions (short ID, sex, dose label). Includes:
- **Compare** button: `rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground`, disabled when < 2 selected. Clicking switches to the Compare tab.
- **Clear** button: `rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent`.

**Legend:** Positioned between filter summary and matrix. 5 severity labels with numeric prefixes: "1 Minimal", "2 Mild", "3 Moderate", "4 Marked", "5 Severe" + `● = present (no grade)` + "-- = examined, no finding" + "blank = not examined". Swatches use `getNeutralHeatColor()` calls; transparent swatch (minimal) gets `border border-border`.

**Loading/empty states:**
- Loading: spinner + "Loading subject data..."
- No subjects: "Subject-level data not available for this specimen."
- No findings after filter: "No findings match the current filters."

---

## Hypotheses Tab

Pathologist-oriented exploratory tools, matching the Hypotheses tab pattern from Target Organs and Dose-Response views. Provides structural consistency across analysis views.

### Finding-aware context (D-3)

The tab accepts `selectedFinding` from the parent's `selection?.finding`. When a finding is selected:
- **Auto-switch intent:** `useEffect` switches intent with priority logic: if the finding has a non-UNCLASSIFIABLE recovery classification, switches to "recovery"; otherwise falls back to "treatment".
- **Contextual placeholders:** Each tool placeholder enriches its display text:
  - `SeverityDistributionPlaceholder`: context line appends `"· Focus: {finding}"`
  - `TreatmentRelatedPlaceholder`: description changes to `"Assess whether "{finding}" is treatment-related..."`
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
| Recovery assessment | `Undo2` | Conditional | Classify recovery patterns across all findings in specimen |

The **Recovery assessment** tool is available only when the specimen has recovery data (`specimenHasRecovery`). It is not a default favorite — accessible via the "+" dropdown.

Default favorites: Severity distribution, Treatment-related assessment.

Each tool renders a `HypViewerPlaceholder` (DG viewer type label), descriptive text, and a `HypConfigLine` settings block in a `rounded-md border bg-card p-3` card. Unavailable tools show a `HypProductionNote` explaining the dependency.

### Recovery Assessment Tool Content

Rendered when `intent === "recovery"`. Shows specimen-level and per-finding recovery classifications from the interpretive layer (`lib/recovery-classification.ts`).

**Specimen-level summary:** Left-bordered block (color from `CLASSIFICATION_BORDER[type]`) with classification label + confidence. Below: summary sentence "N of M findings show incomplete or delayed recovery."

**Findings table:** Sorted by `CLASSIFICATION_PRIORITY` (most concerning first). Columns: Finding, Classification, Confidence. Rows are clickable — fire `onFindingClick` to select the finding.

**Missing inputs:** Deduplicated list of `inputsMissing` across all classifications, shown at bottom when present.

**Footer:** `HypConfigLine`: "Classification method: Rule-based (5 categories)". `HypProductionNote`: disabled toggle for "Include historical controls".

---

## Compare Tab (`CompareTab.tsx`)

Multi-subject comparison surface. Appears only when 2+ subjects are selected in the subject heatmap. Auto-switches back to Evidence tab if selection drops below 2.

### Header

Sticky (`sticky top-0 z-10 border-b bg-background px-4 py-2`):
- Title: `text-xs font-semibold text-foreground` — "Comparing {N} subjects in {specimen}"
- Edit button: `text-xs text-primary hover:underline` — switches back to Evidence tab and scrolls to the severity matrix section.
- Subject summary line: `text-[10px] text-muted-foreground` — `{shortId} ({sex}, {doseLabel})` for each subject, joined by ` · `.

### Four Collapsible Sections

Each uses a local `CollapsiblePane` component (ChevronDown + `text-xs font-semibold uppercase tracking-wider text-muted-foreground`), all defaulting to open.

#### 1. Finding Concordance

Matrix of subjects (columns) vs. findings (rows), derived from `useHistopathSubjects` data (no additional API call). Sorted: severity-graded findings first by max severity desc, then non-graded alphabetical.

- Header row: "Finding" + per-subject columns (short ID + `sex / dose_label`) + "Concordance" column.
- Severity > 0: `h-5 w-6 rounded-sm` color block from `getNeutralHeatColor(sevNum)`.
- Entry with severity 0 (graded finding): em dash.
- Entry present (non-graded): gray dot `●`.
- Concordance: `all ({N}/{N})` in `font-medium text-foreground/70` when all subjects have the finding; otherwise `{count}/{N}` in `text-muted-foreground`.
- Rows are clickable — fire `onFindingClick`.

#### 2. Lab Values

Fetched via `useSubjectComparison(studyId, subjectIds)`. Organ-relevant tests mapped via `ORGAN_RELEVANT_TESTS` (e.g., LIVER -> ALT, AST, ALP, ...). Shows relevant + abnormal tests by default, with "Show all {N} tests" toggle.

- Timepoint selector (when multiple available): `FilterSelect` with "Day {N}" options, default to terminal (max day).
- Control column: sex-specific `mean±SD` when available, or combined stats.
- Subject values: `font-mono text-[11px]`. Abnormal values (>2 SD from sex-specific control mean): high values in `text-red-600/70` with `↑` prefix, low values in `text-blue-600/70` with `↓` prefix.
- Sort: relevant tests first (in ORGAN_RELEVANT_TESTS order), then abnormal, then alphabetical.

#### 3. Body Weight

ECharts line chart via `buildBWComparisonOption()` from `charts/comparison-charts.ts`. Subject lines colored from fixed `COMPARISON_COLORS` palette (8 colors). Control group mean±SD rendered as dashed line + shaded band.

- Mode toggle: `% Baseline` / `Absolute` rounded-full pills. Default: "baseline" for mixed-sex comparisons, "absolute" for same-sex.
- Terminal event markers: X (found dead, red) or triangle (moribund, orange) on last data point.
- Height: 180px.

#### 4. Clinical Observations

Day x subject matrix showing observations. Default: show only days with non-NORMAL observations.

- Normal observations: `text-muted-foreground/40`.
- Found dead: `font-medium text-red-600/70`.
- Moribund: `font-medium text-orange-500/70`.
- Other abnormal: `font-medium text-foreground`.
- Disposition rows merged into the day matrix at `disposition_day`.
- Toggle: "Show all {N} days" / "Show abnormal only".

### Data Source

`useSubjectComparison(studyId, subjectIds)` — React Query hook (5min stale). Calls `fetchSubjectComparison()` from `temporal-api.ts`. Returns `SubjectComparisonResponse` with: `subjects` (profiles), `lab_values`, `body_weights`, `clinical_obs`, `control_stats` (lab + bw), `available_timepoints`.

Enabled only when `studyId` exists and `subjectIds.length >= 2`.

---

## Recovery Assessment

Recovery reversibility assessment logic lives in `lib/recovery-assessment.ts`. When a specimen has recovery arm subjects (`is_recovery: true`), the system compares main-arm vs recovery-arm data per finding per dose level.

### Types

- `RecoveryVerdict`: `"reversed" | "reversing" | "persistent" | "progressing" | "anomaly" | "insufficient_n" | "not_examined" | "low_power" | "not_observed" | "no_data"`
- `RecoveryAssessment`: per-finding with array of `RecoveryDoseAssessment` (one per shared dose level, plus `no_data` entries for recovery-only dose levels) + `overall` (worst verdict across dose levels)
- `RecoveryDoseAssessment`: per-dose-level with main/recovery stats (incidence, n, examined, affected, avgSeverity, maxSeverity) + verdict + recovery subject details
- `MIN_RECOVERY_N = 3`: minimum recovery-arm subjects for meaningful comparison

### Verdict Computation

`deriveRecoveryAssessments()` applies guards before calling `computeVerdict()`:

**Guard 0 — `not_examined`:** If recovery `examined === 0`, verdict is `not_examined`. Tissue was not examined in the recovery arm — no comparison possible.

**Guard 1 — `insufficient_n`:** If recovery N < `MIN_RECOVERY_N` (3), verdict is `insufficient_n`. Runs next — small N makes ratios meaningless.

**Guard 2 — `anomaly`/`not_observed`:** If main incidence === 0 and affected === 0:
- Recovery incidence > 0 → `anomaly` (finding present in recovery but not main arm — delayed onset or data issue)
- Recovery incidence === 0 → `not_observed`

**Guard 3 — `low_power`:** If main incidence × recovery examined < 2, verdict is `low_power`. Expected affected count is too low for meaningful comparison.

**Recovery-only dose levels:** Dose levels with recovery subjects but no matching main arm → `no_data`.

**Standard verdict** via `computeVerdict(main, recovery, thresholds)` (only reached when guards pass):
1. Recovery incidence === 0 → `reversed`
2. Compute incidence ratio (recovery/main) and severity ratio
3. Progressing: incidence ratio > 1.1 with more affected, OR severity ratio > 1.2
4. Reversed: incidence ratio <= 0.2 AND severity ratio <= 0.3
5. Reversing: incidence ratio <= 0.5 OR severity ratio <= 0.5
6. Otherwise: `persistent`

### Verdict Display

- `verdictArrow()`: `↓` reversed, `↘` reversing, `→` persistent, `↑` progressing, `?` anomaly, `—` insufficient_n/not_observed/no_data, `∅` not_examined, `~` low_power
- `verdictPriority()`: anomaly (0) > not_examined (1) > progressing (2) > persistent (3) > low_power (4) > reversing (5) > reversed (6) > insufficient_n (7) > not_observed (8) > no_data (9)
- `specimenRecoveryLabel()`: filters out `insufficient_n`/`not_observed`/`no_data`/`not_examined`/`low_power`; "reversed" if all reversed; "partial" if mixed or sole "reversing"; otherwise worst verdict (maps "reversing" → "partial" per §7.2)

**Findings table cell rendering** (`text-[9px]`):

| Verdict | Display | Style |
|---|---|---|
| `reversed` | `↓ reversed` | `text-muted-foreground` |
| `reversing` | `↘ reversing` | `text-muted-foreground` |
| `persistent` | `→ persistent` | `font-medium text-foreground/70` |
| `progressing` | `↑ progressing` | `font-medium text-foreground/70` |
| `anomaly` | `? anomaly` | `font-medium text-foreground/70` |
| `not_examined` | `∅ not examined` | `font-medium text-foreground/70` |
| `low_power` | `~ low power` | `text-muted-foreground/50` |
| `insufficient_n` | `† (N<3)` | `text-muted-foreground/50` |
| `not_observed`/`no_data` | `—` | `text-muted-foreground/40` |

Arrow icon rendered in a fixed-width `w-[10px] text-center` container for alignment across rows.

### Tooltip Format

`buildRecoveryTooltip()` produces multi-line text:
```
Recovery assessment:
  Group N (dose): {mainPct}% → {recPct}%, sev {mainSev} → {recSev} — {verdict}
  Overall: {overall} (worst case)
  Recovery period: {N weeks|N days}
```
For `anomaly` verdicts: `Group N (dose): 0% → {recPct}% — ⚠ anomaly` followed by two indented explanation lines ("Finding present in recovery but not in main arm." / "May indicate delayed onset or data quality issue.").

For `insufficient_n` verdicts: `Group N (dose): N={n}, too few subjects for comparison`.

For `not_examined` verdicts: explanation that tissue was not examined in recovery arm.

Lines are indented with 2 spaces. `formatDoseGroupLabel()` converts "Group 2,2 mg/kg PCDRUG" -> "Group 2 (2 mg/kg)".

### Integration Points

- **Findings table:** `recoveryVerdict` column (conditional, only when specimen has recovery data)
- **Selection zone:** Recovery verdict shown in `FindingsSelectionZone` for selected finding
- **Dose charts:** Recovery bars in both incidence and severity charts
- **Group heatmap:** Recovery columns next to main columns
- **Specimen summary strip:** `specimenRecoveryOverall` metric (hidden when "reversed")
- **Context panel (finding-level):** Recovery pane with per-dose-group comparison details
- **Context panel (Insights pane):** Recovery classification block via interpretive layer
- **Hypotheses tab:** Recovery assessment tool with specimen-wide classification summary

### Recovery Classification (Interpretive Layer)

Pure logic in `lib/recovery-classification.ts`. Consumes mechanical verdicts from `recovery-assessment.ts` and produces pathologist-meaningful categories. Surfaces ONLY on interpretive surfaces (Insights pane, Hypotheses tab) — never on Evidence surfaces (findings table, dose charts, heatmaps).

**Architecture:** DATA LAYER (`recovery-assessment.ts` — mechanical verdicts like "reversed", "persistent") → INTERPRETIVE LAYER (`recovery-classification.ts` — classifications like "Expected reversibility"). The data layer has ZERO modifications; the interpretive layer is purely additive.

#### Classification Types

| Type | Meaning |
|------|---------|
| `EXPECTED_REVERSIBILITY` | Finding reversed/reversing, adverse or dose-consistent — expected toxicology pattern |
| `INCOMPLETE_RECOVERY` | Main effect >10% and persistent/progressing, or marginal reversing (ratio >0.60) |
| `DELAYED_ONSET_POSSIBLE` | Main ≤10%, recovery ≥20%, ≥2 affected — finding emerged in recovery period |
| `INCIDENTAL_RECOVERY_SIGNAL` | Not adverse, weak dose-response, reversed/reversing/not_observed — background noise |
| `PATTERN_ANOMALY` | Recovery > main×1.5 at any dose, weak dose-response, not adverse — unusual pattern |
| `UNCLASSIFIABLE` | Guard short-circuit (not_examined, insufficient_n, low_power, anomaly, no_data) or no match |

#### Precedence Chain (safety-conservative)

0. Guard short-circuit → `UNCLASSIFIABLE`
1. `PATTERN_ANOMALY`
2. `DELAYED_ONSET_POSSIBLE`
3. `INCOMPLETE_RECOVERY`
4. `EXPECTED_REVERSIBILITY`
5. `INCIDENTAL_RECOVERY_SIGNAL`
6. Fallback → `UNCLASSIFIABLE`

#### Confidence Model

Gated tiers with caps evaluated first:
- Weak dose-response (non-incidental) → Moderate max
- Examined < 5 subjects → Low max
- Normal signal, no clinical class → Moderate max
- `inputsMissing.length > 0` → Moderate max

Base score (0–7): sample size (+0/+1/+2), effect size (+0/+1/+2), severity change (+0/+1), dose-response (+0/+1), p-value (+0/+1). Score ≥5 → High, ≥3 → Moderate, else Low. Cap always wins.

#### Context Panel — RecoveryInsightBlock

Rendered inside the Insights CollapsiblePane in `FindingDetailPane`, after `<SpecimenInsights>`. Visibility gate (`showRecoveryInsight`): shown when classification exists AND (not UNCLASSIFIABLE, OR UNCLASSIFIABLE with `not_examined`/`low_power` verdict).

- Section header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` — "Recovery assessment"
- Left-bordered block: `border-l-2 pl-2 py-1` with color from `CLASSIFICATION_BORDER[type]`
- Line 1: classification label + confidence badge (`text-[11px] font-medium`)
- Line 2: rationale (`text-[10px] text-muted-foreground`)
- Evidence summary: `inputsUsed` joined by ` · ` with `border-l` treatment
- Qualifiers: italic, each on own line
- Recommended action: `font-medium text-foreground/70`

#### Specimen-Level Summary

`classifySpecimenRecovery(classifications[])` — worst classification by `CLASSIFICATION_PRIORITY`, minimum confidence across all findings. Used in the Hypotheses tab Recovery Assessment tool.

#### Display Constants

- `CLASSIFICATION_LABELS`: human-readable labels for each type
- `CLASSIFICATION_BORDER`: left-border colors for each type (amber for anomaly/delayed, rose for incomplete, emerald for expected, slate for incidental, gray for unclassifiable)
- `CLASSIFICATION_PRIORITY`: sort order (PATTERN_ANOMALY=0 most concerning → UNCLASSIFIABLE=5 least)

---

## Helper Functions

### `deriveSexLabel(rows: LesionSeverityRow[]): string`
Returns "Male only", "Female only", or "Both sexes" based on unique `sex` values in the specimen data.

### `deriveSpecimenSummaries(data, ruleResults?, trendData?, syndromeMatches?, signalData?): SpecimenSummary[]`
Main aggregation function. Builds per-specimen summaries with signal score, pattern classification, clinical class, sex skew, and recovery status. See §Sorting for the signal score formula. Uses `classifySpecimenPattern()` for pattern detection, `patternWeight()` for score contribution, and integrates R01/R04 rule signals and clinical catalog data for score boosting.

### `deriveFindingSummaries(rows: LesionSeverityRow[]): FindingSummary[]`
Per-finding aggregation: max severity, max incidence, total affected/N, worst severity classification. Severity escalation: "adverse" > "warning" > "normal".

### `classifySpecimenPattern(rows, trendData, syndromeMatches, signalData): PatternClassification`
From `lib/pattern-classification.ts`. Detects dose-response patterns: `MONOTONIC_UP`, `MONOTONIC_DOWN`, `THRESHOLD`, `NON_MONOTONIC`, `CONTROL_ONLY`, `NO_PATTERN`. Returns pattern, confidence (`LOW`/`MODERATE`/`HIGH`), confidence factors, sparkline data, syndrome match, and alerts.

### `classifyFindingPattern(rows, finding, caP, jtP, hasMortality): PatternClassification`
Per-finding version of pattern classification. Filters rows to one finding, groups by dose_level, checks incidence monotonicity and statistical tests.

### `detectSyndromes(organMap, signalData): SyndromeMatch[]`
From `lib/syndrome-rules.ts`. Detects multi-organ toxicology syndromes (e.g., hepatotoxicity: necrosis + bile duct hyperplasia). Runs once per study. Returns array of matches with required finding and supporting findings.

### `deriveSpecimenConclusion(summary, specimenData, specimenRules): string`
Builds a deterministic 1-line conclusion from incidence range, severity, sex, and dose relationship.

### `deriveSpecimenInsights(rules, specimen): InsightBlock[]`
Context panel insight synthesis. Groups rules by finding (collapsed across sexes) into sections:
1. **Adverse (treatment-related):** Per-finding with evidence qualifiers (p-value, effect size, incidence/severity increase) and inline clinical catalog annotations
2. **Clinical significance:** Non-adverse findings matched by clinical catalog (C01-C15)
3. **Protective (decreased with treatment):** Per-finding with control->high dose percentages; protective-excluded findings shown as info kind
4. **Info (notes):** Suppressed protective findings with exclusion IDs

### `deriveSpecimenReviewStatus(findingNames, reviews): SpecimenReviewStatus`
Aggregates peer review annotations across all findings in a specimen. Returns one of:
- **Preliminary**: no reviews record or all "Not Reviewed"
- **Revised**: any finding has "Disagreed"
- **Confirmed**: all findings have "Agreed"
- **In review**: mix of reviewed + unreviewed (no "Disagreed")

### `deriveRecoveryAssessments(findingNames, subjects, thresholds?): RecoveryAssessment[]`
Splits subjects into main and recovery arms, identifies shared dose levels, computes per-finding per-dose verdict via `computeVerdict()`, derives overall worst verdict per finding.

### `specimenRecoveryLabel(assessments): string | null`
Returns specimen-level recovery summary: "reversed" if all reversed, "partial" if mixed, otherwise worst verdict. Returns null if no meaningful verdicts.

### `classifyRecovery(assessment, context): RecoveryClassification`
From `lib/recovery-classification.ts`. Applies 6-step precedence chain to produce a pathologist-meaningful classification from a mechanical `RecoveryAssessment` and `RecoveryContext`. Returns classification type, confidence, rationale, qualifiers, recommended action, inputs used, and inputs missing.

### `computeConfidence(classification, assessment, context, inputsMissing): ConfidenceLevel`
From `lib/recovery-classification.ts`. Gated tier model — evaluates caps first (weak dose-response, small N, normal signal, missing inputs), then base score from 5 factors. Cap always overrides base score.

### `classifySpecimenRecovery(classifications): RecoveryClassification | undefined`
From `lib/recovery-classification.ts`. Aggregates per-finding classifications to specimen level: worst by `CLASSIFICATION_PRIORITY`, minimum confidence.

### `isPairedOrgan(specimen): boolean`
From `lib/laterality.ts`. Returns true for paired organs (kidneys, eyes, ovaries, testes, adrenal glands, etc.) that can have laterality data.

### `specimenHasLaterality(subjects): boolean`
From `lib/laterality.ts`. Returns true if any subject in the specimen has laterality data in their findings.

### `aggregateFindingLaterality(subjects, finding): { left: number; right: number; bilateral: number }`
From `lib/laterality.ts`. Counts subjects with left-only, right-only, and bilateral findings for a specific finding.

### `classifyFindingNature(finding): FindingNatureInfo`
From `lib/finding-nature.ts`. Classifies a finding by its biological nature (e.g., proliferative, inflammatory, degenerative). Used for recovery classification context.

### `fishersExact2x2(a, b, c, d): number`
From `lib/statistics.ts`. Computes Fisher's exact test p-value for a 2×2 contingency table. Used for pairwise dose-vs-control comparisons.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/histopathology`, shows `HistopathologyContextPanel`.

The `HistopathologyContextPanelWrapper` in `ContextPanel.tsx` fetches `lesionData`, `ruleResults`, and `pathReviews` via hooks and passes as props. Selection flows from `ViewSelectionContext`.

### No Selection State
- Message: "Select a specimen or finding to view details."

### Specimen-Level View (selection has specimen, no finding)

Header: sticky, specimen name (`text-sm font-semibold`) + review status label (Revised: `text-purple-600`, others: `text-muted-foreground`, with tooltip) + adverse count badge + `CollapseAllButtons`, domain labels below.

Panes:
1. **Overview** (default open) — conclusion chips (incidence, severity, sex, sex skew when present, dose-relation, findings count, "recovery data available" when hasRecovery)
2. **Insights** (default open, conditional on `specimenRules.length > 0`) — `SpecimenInsights` component rendering `InsightBlock[]` via `deriveSpecimenInsights()`. Blocks grouped into labeled sections:
   - **Treatment-related** (adverse blocks): per-finding, collapsed across sexes with evidence qualifiers (p-value, effect size, incidence/severity increase) and inline clinical annotations
   - **Clinical significance** (clinical blocks): findings matched by clinical catalog but not already in adverse section — shows class + catalog ID + confidence
   - **Decreased with treatment** (protective blocks): per-finding with control->high dose percentages; excluded findings show info kind with exclusion ID
   - **Notes** (info blocks): suppressed protective findings, etc.
3. **Pathology Review** — `PathologyReviewForm` (specimen-level, keyed by `specimen:{name}`)
4. **Related views** (default closed) — "View study summary", "View dose-response", "View NOAEL decision" links

Review status is derived via `deriveSpecimenReviewStatus(findingNames, pathReviews)` where `pathReviews` is fetched by the wrapper and passed through.

### Finding-Level View (selection has specimen + finding)

Header: sticky, finding name (`text-sm font-semibold`) + `CollapseAllButtons`, specimen name below (`text-xs text-muted-foreground`).

**Header metrics line** (`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground`): Four inline metrics computed from finding rows — Peak incidence (`{pct}%`), Max sev (`{n.n}`), Dose (`{Weak|Moderate|Strong}`), Sex (`{M|F|M/F}`). Makes the panel presentation-ready without scrolling.

Panes in order (follows design system priority: insights > stats > related > annotation > navigation):
1. **Insights** (default open) — `SpecimenInsights` with finding-scoped rules. Includes clinical catalog annotations when present. When recovery data exists, a **Recovery assessment** block (`RecoveryInsightBlock`) appears after `SpecimenInsights` — see §Recovery Classification below.
2. **Dose detail** (default open) — all dose-level rows for finding + specimen, sorted by dose_level then sex. Table columns: Dose (`<DoseLabel>`), Sex, Incid. (right-aligned font-mono), mini dose ramp bar (color from `getDoseGroupColor(dose_level)`), Avg sev (right-aligned font-mono), Sev (colored text: adverse red, warning amber, normal green). The mini dose ramp is a `h-1.5 rounded-full` horizontal bar (track `bg-gray-100`, fill colored by dose group) showing relative incidence percentage per row.
3. **Sex comparison** (conditional, default open) — only shown when finding has data from both sexes. Per-sex row: affected/total + max severity badge with `getNeutralHeatColor()`.
4. **Recovery** (conditional, default open) — only shown when `specimenHasRecovery` and finding has non-trivial recovery verdicts. Uses `RecoveryPaneContent` rendering per-dose `RecoveryDoseBlock` components. Each block shows: dose group label + recovery period, main arm incidence (with mini bar), recovery arm incidence (with mini bar), avg severity for both, verdict assessment, and clickable recovery subject links with severity values. Special cases: `insufficient_n` verdict skips the comparison and shows "Recovery arm has only N subject(s). Minimum 3 required for meaningful comparison." `anomaly` verdict adds a bordered warning block (`border-border/50 bg-muted/20`) with explanation text about delayed onset or data quality issues.
5. **Correlating evidence** (default open) — up to 10 other findings in same specimen, sorted by max severity desc, with severity badge colored by `getNeutralHeatColor()`
6. **Pathology review** — `PathologyReviewForm` (not wrapped in CollapsiblePane, uses own form state)
7. **Tox Assessment** — `ToxFindingForm` keyed by finding (not wrapped in CollapsiblePane)
8. **Related views** (default closed) — "View study summary", "View dose-response", "View NOAEL decision" links

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected specimen | Shell context | `StudySelectionContext` — `studySelection.specimen` |
| Active tab | Local (parent) | `useState<EvidenceTab>` — `"overview"`, `"hypotheses"`, or `"compare"` |
| Selection (finding) | Shared via context | `ViewSelectionContext` with `_view: "histopathology"` tag |
| Sex filter | Global | `GlobalFilterContext` — `filters.sex` |
| Min severity | Global | `GlobalFilterContext` — `filters.minSeverity` |
| Comparison subjects | Local (parent) | `useState<Set<string>>` — subject IDs for Compare tab. Resets on specimen change. |
| Pending compare | Shared via context | `ViewSelectionContext.pendingCompare` — consumed from context panel recovery pane to trigger compare tab |
| Heatmap view | Local (OverviewTab) | `useState<"severity" \| "incidence">` — group heatmap coloring mode (default "severity") |
| Matrix mode | Local (OverviewTab) | `useState<"group" \| "subject">` — toggles between group and subject heatmaps (default "group") |
| Affected only | Local (OverviewTab) | `useState<boolean>` — filter subjects to affected only in subject mode (default true, resets to true on specimen change) |
| Subject sort | Local (OverviewTab) | `useState<"dose" \| "severity">` — subject heatmap sort mode (default "dose", resets on specimen change). Severity sort orders within dose groups, not across them. |
| Dose group filter | Local (OverviewTab) | `useState<ReadonlySet<string> \| null>` — multi-select dropdown with checkboxes via FilterMultiSelect (null = all shown, Set of composite keys when filtered, resets on specimen change) |
| Dose-dep threshold | Local (OverviewTab) | `useState<"moderate" \| "strong" \| "ca_trend" \| "severity_trend" \| "fisher_pairwise">` — dose-dependence method (default "moderate") |
| Hide zero severity | Local (OverviewTab) | `useState<boolean>` — filter findings table (default false) |
| Severity graded only | Local (OverviewTab) | `useState<boolean>` — filter heatmap findings (default false, resets on specimen change) |
| Chart display modes | Local (OverviewTab) | `useState<ChartDisplayMode>` x 2 — "compact" or "scaled" for incidence and severity charts (default "scaled") |
| Section heights | Local (OverviewTab) | `useSectionLayout` — adaptive heights from naturalHeights + container ResizeObserver |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state (in OverviewTab) |
| Column sizing | Local | `useState<ColumnSizingState>` — TanStack column resize state (in OverviewTab) |
| Show laterality | Derived (OverviewTab) | `useMemo` — true when specimen is paired organ AND has laterality data in subject records |
| Selected subject | Local (SubjectHeatmap) | `useState<string \| null>` — column highlight in SubjectHeatmap |
| Label column width | Local (SubjectHeatmap) | `useResizePanel(124, 100, 400)` — finding label column width |
| Rail width | Local | `MasterDetailLayout` — default 300px, resizable 180-500px |
| Rail sort | Local (SpecimenRail) | `useState<"signal" \| "organ" \| "severity" \| "incidence" \| "alpha">` (default "signal") |
| Rail min sev filter | Local (SpecimenRail) | `useState<number>` (default 0) |
| Rail adverse only | Local (SpecimenRail) | `useState<boolean>` (default false) |
| Rail dose trend filter | Local (SpecimenRail) | `useState<"any" \| "moderate" \| "strong">` (default "any") |
| Specimen rules | Derived | `useMemo` — rules filtered to selected specimen, shared between SpecimenHeader and OverviewTab |
| Finding clinical | Derived | `useMemo` — Map<finding, {clinicalClass, catalogId}> from ruleResults for clinical catalog lookup |
| Finding consistency | Derived | `useMemo` — Map<finding, PatternClassification> from `classifyFindingPattern()` per finding |
| Recovery assessments | Derived | `useMemo` — from `deriveRecoveryAssessments()` using subject data |
| Recovery heatmap data | Derived | `useMemo` — group heatmap cells for recovery dose levels |
| Specimen recovery overall | Derived | `useMemo` — `specimenRecoveryLabel()` for summary strip |
| All recovery classifications | Derived | `useMemo` — `classifyRecovery()` per finding, builds `RecoveryContext` from rules, dose trends, dose consistency. Array of `{ finding, classification }` |
| Specimen recovery classification | Derived | `useMemo` — `classifySpecimenRecovery()` aggregating all per-finding classifications to specimen level |
| Syndrome matches | Derived | `useMemo` — `detectSyndromes()` from organ map + signal data, cached per study |
| Pairwise Fisher results | Derived | `useMemo` — Map<finding, PairwiseFisherResult[]> for Fisher's pairwise dose-dependence method |
| Dose group labels | Derived | `useMemo` — Map<doseLevel, "G1"/"G2"/etc.> for Fisher's compact display |
| Mortality mask findings | Derived | `useMemo` — Set<finding> flagging non-monotonic findings with high-dose mortality masking |
| Lesion data | Server | `useLesionSeveritySummary` hook (React Query, 5min stale) |
| Finding dose trends | Server | `useFindingDoseTrends` hook (statistical trend data) |
| Subject data | Server | `useHistopathSubjects` hook (always fetched — shared cache across parent + OverviewTab + context panel) |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |
| Path reviews | Server | `useAnnotations<PathologyReview>(studyId, "pathology-reviews")` — shared cache with context panel PathologyReviewForm |
| Signal summary | Server | `useStudySignalSummary` hook — organ-level signal context for syndrome detection + confidence boosting |
| Lab correlation | Derived (composite) | `useSpecimenLabCorrelation` hook — aggregates clinical pathology (LB) data for high-dose subjects, computes signal strength per test |

---

## Data Flow

**Data filtering:** `deriveSpecimenSummaries()` skips rows where `specimen` is null (e.g., CL domain findings that lack a specimen value). This prevents crashes when the CL domain contributes rows without a valid specimen. Each `SpecimenSummary` includes `pattern` (PatternClassification), `signalScore`, `sexSkew`, `hasRecovery`, `hasSentinel`, `highestClinicalClass`, and `signalScoreBreakdown`. Recovery detection: `dose_label.toLowerCase().includes("recovery")`.

```
useLesionSeveritySummary(studyId) ──> lesionData (728 rows)
useRuleResults(studyId) ──> ruleResults (shared React Query cache)
useFindingDoseTrends(studyId) ──> trendData (statistical trend data, filtered per specimen)
useStudySignalSummary(studyId) ──> signalData (organ-level signal context)
useHistopathSubjects(studyId, specimen) ──> subjData (subject-level, always fetched)
useSpecimenLabCorrelation(studyId, specimen) ──> labCorrelation (composite hook)
                                |
                    detectSyndromes(organMap, signalData) -> syndromeMatches
                                |
                    deriveSpecimenSummaries() -> SpecimenSummary[]
                    (uses classifySpecimenPattern, patternWeight,
                     clinicalFloor, sentinelBoost, syndrome scoring)
                    (skips rows with null specimen)
                                |
                        SpecimenRail (sorted by signal score desc)
                        + filters (sort, min sev, adverse only, dose trend)
                        + organ system grouping when sort=organ
                        + deriveSpecimenReviewStatus() per rail item
                                |
                    [selectedSpecimen] -> filter lesionData
                                |
                    specimenData ──> specimenRules (filtered at parent)
                                |
                        deriveFindingSummaries()
                        deriveSexLabel()
                        classifyFindingPattern() per finding
                        findingClinical (clinical catalog lookup)
                        deriveRecoveryAssessments() (from subjData)
                        specimenRecoveryLabel() (for summary strip)
                        classifyRecovery() per finding (interpretive layer)
                        classifySpecimenRecovery() (specimen summary)
                        fishersExact2x2() per finding (pairwise)
                        mortalityMaskFindings (non-monotonic + high-dose death)
                        aggregateFindingLaterality() per finding (paired organs)
                           /          |           \
                  OverviewTab    HypothesesTab   CompareTab
                  (findings +    (selectedFinding (useSubjectComparison
                   dose charts + auto-focus,       from temporal API)
                   severity matrix + recovery
                   recovery         classifications
                   integration +    per finding)
                   laterality +
                   Fisher's pairwise)
                        \         |          /
                    HistopathSelection (shared)
                                |
                  HistopathologyContextPanel
                    /  |    |    |    |     \    \     \
                 Ins  Dose  Sex  Rec  Corr  Path  Nav  Tox
                (+ clinical catalog annotations)
                (+ recovery assessment per finding)
                (+ recovery classification in Insights pane
                   via classifyRecovery() + useFindingDoseTrends())
```

---

## Cross-View Navigation

### Inbound
- From other views with `location.state`: `{ organ_system: string }` or `{ specimen: string }` — auto-selects matching specimen in rail (case-insensitive).
- Cross-organ navigation via `studySelection.endpoint` — auto-selects finding after specimen change.

### Outbound (Context panel — "Related views" pane)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| "View study summary" | `/studies/{studyId}` | `{ organ_system: specimen }` |
| "View dose-response" | `/studies/{studyId}/dose-response` | `{ organ_system: specimen }` |
| "View NOAEL decision" | `/studies/{studyId}/noael-decision` | `{ organ_system: specimen }` |

### Internal (within the view)
| Action | Effect |
|--------|--------|
| Click organ link in "Also in" column | Navigate to related specimen via `onSpecimenNavigate()` — updates rail selection + auto-selects finding |

---

## Keyboard

- **Escape**: clears finding-level selection (sets selection to null, via `keydown` listener on `window`)

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading histopathology data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No specimen selected (but data exists) | "Select a specimen from the rail to view histopathology details." |
| No data at all | "No histopathology data available." |
| Empty search results (rail) | "No matches for '{search}'" |
| No findings for specimen (overview) | "No findings for this specimen." |
| No rows after filter (matrix) | "No findings match the current filters." |

---

## Clinical Catalog Integration

The view integrates with the clinical insight layer (`backend/services/analysis/clinical_catalog.py`). Clinical annotations flow through rule results as params:

- `clinical_class`: "Sentinel" | "HighConcern" | "ModerateConcern" | "ContextDependent"
- `catalog_id`: "C01" through "C15"
- `clinical_confidence`: "Low" | "Medium" | "High"
- `protective_excluded`: boolean (when a protective label is suppressed by PEX01-PEX07)
- `exclusion_id`: "PEX01" through "PEX07"

**Findings table:** The Signal column replaces misleading "normal" statistical severity with the clinical class label when a catalog match exists. This surfaces clinically significant findings (e.g., HEPATOCELLULAR CARCINOMA is "normal" statistically but "Sentinel" clinically).

**Context panel:** Clinical annotations appear inline on adverse insight blocks and as a separate "Clinical significance" section for non-adverse matched findings.

**Per-finding lookup:** `findingClinical` useMemo scans all rule results for matching specimen+finding with `clinical_class` params, producing a Map for O(1) lookup per finding row.

**Signal score integration:** Clinical class boosts specimen signal score via `clinicalFloor` (minimum score based on highest clinical class) and `sentinelBoost` (+15 for specimens with sentinel findings).

---

## Pattern Classification & Syndrome Detection

### Pattern Classification

Specimen-level and per-finding dose-response pattern detection via `lib/pattern-classification.ts`. Replaces the simple dose consistency heuristic with a confidence-weighted classification system.

**Patterns:** `MONOTONIC_UP`, `MONOTONIC_DOWN`, `THRESHOLD`, `NON_MONOTONIC`, `CONTROL_ONLY`, `NO_PATTERN`

**Confidence levels:** `LOW`, `MODERATE`, `HIGH` — derived from convergence of evidence (rule engine R01/R04 signals, statistical tests, incidence trends, syndrome matches).

**Output:** `PatternClassification` includes pattern type, confidence, confidence factors (array of strings explaining the evidence), sparkline data (for `SparklineGlyph` visualization), syndrome match (if any), and alerts (caution/warning messages).

**Display:** `SparklineGlyph` component renders a mini inline visualization of the dose-response pattern. `formatPatternLabel()` produces a human-readable label (e.g., "Monotonic increase (HIGH)").

### Syndrome Detection

Cross-organ syndrome detection via `lib/syndrome-rules.ts`. Runs once per study (memoized). Input: organ map (specimens → lesion rows) + signal data (organ-level context). Output: array of `SyndromeMatch` objects identifying multi-organ toxicology patterns (e.g., hepatotoxicity syndrome requiring necrosis + bile duct hyperplasia).

Syndromes boost specimen signal scores via `syndromeBoost` in the signal score formula and are displayed in the specimen summary strip when detected.

---

## Laterality Support

For paired organs (kidneys, eyes, ovaries, testes, etc.), the view supports laterality tracking:

- **Detection:** `isPairedOrgan(specimen)` checks if the specimen is a paired organ. `specimenHasLaterality(subjects)` checks if any subject in the specimen data has laterality annotations.
- **Findings table:** Conditional "Lat." column shows aggregated laterality per finding (B/L/R/mixed with subject counts).
- **Subject heatmap:** Conditional laterality header row shows per-subject laterality. Data cells include laterality dot markers (small dot at left edge for "LEFT", right edge for "RIGHT", no dot for "BILATERAL").
- **Source data:** Laterality comes from `SubjectHistopathEntry.findings[finding].laterality` field (values: "LEFT", "RIGHT", "BILATERAL", or null).

---

## Lab Correlation

Specimen-level clinical pathology correlation via `useSpecimenLabCorrelation(studyId, specimen)`. This composite hook aggregates LB (lab) domain data for high-dose main-arm subjects, compares against control group statistics, and calculates signal strength per test.

- **Signal strength:** 0–3 dots based on percent change magnitude (>100%: 3 dots, >50%: 2 dots, >25%: 1 dot)
- **Relevance mapping:** Tests are marked as "relevant" if they appear in organ-test-mapping for the specimen
- **Summary strip display:** Only shown when `hasData && topSignal && signal >= 2` — clickable to scroll to lab correlates pane in context panel
- **Context panel:** Lab correlates pane (conditional) shows full test table with control stats, high-dose values, and signal indicators

---

## Backlog

| Item | What's needed | Priority |
|------|--------------|----------|
| Cross-domain correlating evidence (D-2) | Backend/generator changes to link clinical pathology (CL, LB) findings to histopathology specimens | P3 |
