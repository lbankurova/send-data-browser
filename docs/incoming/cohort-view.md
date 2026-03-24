# Cohort View

## What this does

Provides a multi-subject analysis surface for reviewing a cohort of animals — treatment-related sacrifices, histopathology-of-interest animals, recovery animals, or arbitrary selections — with organ-centric cross-domain evidence, group-level context, and per-subject detail side by side.

Currently, subject comparison is buried inside the Histopathology view's Compare tab (limited to MI context, max 8 subjects). There is no way to ask "show me all TRS animals and their full cross-domain picture" from a single entry point. This view fills that gap.

## User workflow

### Entry points

| Source | Route | Preset | Pre-selected subjects |
|---|---|---|---|
| Study Summary mortality banner → "View TRS Animals" | `/studies/:studyId/cohort?preset=trs` | TRS | All deaths/moribund sacrifices from `study_mortality.json` |
| Histopathology View → "Compare in Cohort View" | `/studies/:studyId/cohort?preset=histo&subjects=X,Y,Z` | Histopath | Subjects from heatmap selection |
| Study nav tree → "Cohort" | `/studies/:studyId/cohort` | All | Full roster |
| Subject profile → "View dose group cohort" | `/studies/:studyId/cohort?preset=all&dose=3` | All, dose-filtered | All subjects at that dose level |

### Core workflow

1. User arrives via one of the entry points above. The rail shows the subject roster filtered by the active preset.
2. User toggles between presets (TRS / Histopath / Recovery / All) — the rail filters accordingly.
3. User selects/deselects individual subjects in the rail (multi-select with shift-click).
4. Center panel shows organ-grouped evidence in a side-by-side layout: group summary table (dose group columns) | subject detail table (individual subject columns).
5. User toggles between target organs via organ pill toggle in the center header.
6. Charts below the tables show BW trajectory and organ-contextual metrics.
7. Clicking a subject column header or rail card opens SubjectProfilePanel in context panel.
8. Clicking a finding row opens finding-level evidence in context panel.

## Data model

### Input data (already generated / served)

| Source | File / Endpoint | What it provides |
|---|---|---|
| `subject_context.json` | Generated per study | Full roster: USUBJID, ARM, DOSE, dose_group_order, IS_CONTROL, HAS_RECOVERY, IS_TK, SACRIFICE_DY, sex (from DM) |
| `study_mortality.json` | Generated per study | Deaths, moribund sacrifices, accidental deaths with USUBJID, cause, relatedness, study_day |
| `cross_animal_flags.json` | Generated per study | Tissue battery warnings, tumor cross-references, recovery narratives per subject |
| `unified_findings.json` | Generated per study | All dose-response findings with `raw_subject_values`, `group_stats`, `organ_system`, `organ_name`, `domain`, `severity`, `treatment_related` |
| `/api/studies/{id}/subjects/{usubjid}/profile` | REST endpoint | Single-subject cross-domain profile (BW, LB, OM, CL, MI, MA) |
| `/api/studies/{id}/subjects/compare?ids=` | REST endpoint | Multi-subject comparison (BW, LB, CL, control_stats) |
| `ORGAN_RELEVANT_TESTS` | `organ-test-mapping.ts` | Specimen → lab test codes, finding → lab test codes |

### Key observation: `raw_subject_values` in unified_findings

Each finding in `unified_findings.json` includes `raw_subject_values` — an array of `{USUBJID: value}` maps. This means individual subject values for every finding (LB, BW, OM, MI, etc.) are already available without per-subject API calls. The group table's `group_stats` (mean, SD, N per dose) sits alongside.

### Derived data (computed client-side)

**Shared findings intersection.** For subjects S1..SN, a finding is "shared" if every selected subject has a non-null value in `raw_subject_values`. Compute: intersect the USUBJID sets across all findings, then filter to findings where all selected USUBJIDs appear.

**Organ-grouped finding list.** Group findings by `organ_name` (from unified_findings), then within each organ group sort by domain priority: MI > MA > LB > OM > CL > BW > other. This surfaces the pathologist's natural reading order (morphology first, then correlating chemistry, then weights).

**Preset subject sets.** Computed client-side from generated JSON:
- **TRS**: `study_mortality.json` → `deaths[].USUBJID` ∪ `early_death_subjects` keys (exclude accidentals)
- **Histopath** (three criteria, any match qualifies):
  1. ≥1 MI finding at severity ≥ "adverse" in unified_findings
  2. Any subject flagged in `cross_animal_flags.json` (COD-related, tumor linkage)
  3. MI findings in ≥2 distinct organs (any severity) — captures systemic/multi-organ patterns that no single finding crosses the adverse threshold
  - Subjects qualifying via criterion 3 only (no adverse finding, no COD) are badged `PATTERN` instead of `ADVERSE` in the rail, so the pathologist knows to look for multi-organ patterns rather than a single severe finding
- **Recovery**: `subject_context.json` → entries where `HAS_RECOVERY === true`. Recovery-period subjects only — the view characterizes what's happening in these animals now, not the before/after arc (that's the group-level recovery comparison's job). Subject cards show recovery day context: `Recovery Day 14 / 28`
- **All**: full `subject_context.json` roster. IS_TK satellites excluded by default; a "Include TK satellites" checkbox in the rail header enables them. TK animals appear with a `TK` badge and domain rows without MI/MA data show `NC` (not collected) rather than `NE` — the absence is by design, not a data gap

### Backend pipeline task: CL onset day derivation

CL (clinical observation) findings in unified_findings do not carry per-subject onset day. This needs derivation as `min(CLSTDY)` per subject per observation type from raw CL domain data. This is a straightforward aggregation added to the generator pipeline — either as a new field in unified_findings CL entries (`raw_subject_onset_days: [{USUBJID: day}, ...]`) or as a separate lightweight generated file.

CL body-system grouping (CNS, GI, integument, general) should also be derived during generation to compress noisy CL coding variability across studies. Map CLCAT or free-text finding names to body-system categories.

### No other new backend endpoints required

All remaining data for the implementation is available from existing generated JSON files (loaded via existing hooks) and the existing comparison endpoint. The unified_findings `raw_subject_values` field is the key enabler — it provides per-subject values for every finding without needing per-subject API calls.

## UI specification

### Layout: standard three-panel

Uses the existing `Layout.tsx` shell. Rail + Center + Context panel, same as Findings view and Histopathology view.

### Rail: Subject Roster

Mirrors the FindingsRail structure (zones, filtering, scrollable list).

**Zone 1 — Preset toggle** (replaces the Endpoint | Organ | Syndrome toggle)
```
[ TRS ]  [ Histo ]  [ Recovery ]  [ All ]
```
`PanePillToggle<PresetMode>`. Each preset filters the subject list. Entry point query param `?preset=` determines initial active state.

**Zone 2 — Summary line**
```
4 subjects · 2 dose groups · M 2 / F 2
```
Counts reflect the filtered + selected set. Sex counts use color-coded text: M in `text-[#0891b2]` (cyan), F in `text-[#ec4899]` (pink).

**Zone 3 — Filters** (reuse FilterMultiSelect, FilterSearch)
- **Dose group**: multi-select with dose pipe colors
- **Sex**: multi-select (M / F)
- **Search**: FilterSearch for USUBJID substring match
- **Clear Filters** button (visible when dirty)

**Zone 4 — Subject rows** (scrollable, flex-1)

Each subject is a compact row following the EndpointRow pattern:

```
┌──────────────────────────────────────┐
│ ▎ PC201708-4003   M   TRS   d90/91  │
│ ▎ PC201708-4113   F   TRS  d100/91  │
│ ▎ PC201708-4006   M         d91/91  │
└──────────────────────────────────────┘
```

- **Left pipe** (2-4px border-left): dose group color from `getDoseGroupColor(dose_group_order)`. Same pattern as EndpointRow severity pipe.
- **USUBJID**: `font-mono text-xs font-semibold`. Truncate if needed.
- **Sex**: single character, color-coded text only (no badge container). M: `text-[#0891b2]`, F: `text-[#ec4899]`.
- **Reason badge** (conditional): TRS = `bg-red-50 text-red-600 border-red-200 text-[10px]`, REC = `bg-green-50 text-green-600 border-green-200 text-[10px]`, PATTERN = `bg-violet-50 text-violet-600 border-violet-200 text-[10px]` (Histopath preset criterion 3 — multi-organ, no single adverse finding), TK = `bg-gray-50 text-gray-500 border-gray-200 text-[10px]` (satellite animals, only visible when TK toggle enabled). Only shown for subjects with notable disposition or selection reason.
- **Disposition day**: `font-mono text-[10px] text-muted-foreground`. Format: `d{actual}/{planned}`. Early sacrifice (actual < planned): actual day in `text-foreground` emphasis. Recovery subjects show recovery-specific context: `Rec d14/28` (recovery day / planned recovery duration).
- **Selected state**: `bg-accent` (same as selected EndpointRow). Deselected: default background with `hover:bg-accent/30`.
- **Multi-select**: click toggles selection. Shift+click selects range (same as SubjectHeatmap).

### Center panel

#### Header bar

```
[ Liver ▾ ]  [ Kidney ]  [ Spleen ]  ...       All 4 share · MI Hepatocellular necrosis · LB ALT↑
```

**Left: Organ toggle.** `PanePillToggle` when ≤6 organs; `FilterSelect` dropdown when >6. Lists only organs with findings for selected subjects. Alphabetical order (stable — doesn't shift as selection changes). Each pill is color-coded by signal strength using the existing severity color scale (adverse-red / warning-amber / normal-neutral), so the pathologist sees which organs are hot without reordering. Default: highest-signal organ (most findings across domains for the cohort). When entry point specifies a specimen (from histopath), default to that organ.

**Right: Shared findings bar.** Single-line horizontal scroll. Appears when ≥2 subjects selected. Shows findings present in ALL selected subjects. Format: `domain-tag finding-name [direction]`. Domain tag: `text-[10px] font-semibold text-muted-foreground`. Findings sorted by severity (adverse first). If no shared findings: "No findings common to all N subjects" in muted text.

#### Main content: side-by-side tables

Two tables sharing synchronized rows, separated by a vertical divider.

**Left table: Group Summary** (~280px fixed width)

Columns: Domain tag | Finding name | Control (always present) | Dose group(s) represented in cohort

The Control column is always shown as a reference — it is not a cohort member. Visually distinguished: column header in `text-muted-foreground italic`, background `bg-muted/10`. Shows group mean only (individual control animals are not surfaced in this view).

Dose group columns show one column per dose group represented in the selected cohort. If the cohort spans mid + high dose, both columns appear alongside Control.

Cell rendering in group columns:
- MI/MA findings: show incidence as `n/N` (e.g., `4/10`)
- LB findings: show group mean as fold-change vs control (e.g., `4.3×↑`)
- OM findings: show group mean % change vs control (e.g., `+32%`)
- BW: show group mean % change
- CL: show group incidence

Data source: `group_stats` from unified_findings, filtered to the selected organ.

**Right table: Selected Subjects** (flex-1, horizontally scrollable)

Columns: one per selected subject

Column headers:
```
  M101        M102        M103
  ● M d3      ● M d3      ● M d3
```
First line: USUBJID (mono, clickable → opens SubjectProfilePanel). Second line: dose dot (colored), sex letter (colored), dose level (short label from `formatDoseShortLabel`). Clicking the header is the primary interaction for drilling into a subject.

Cell rendering by domain:
- **MI/MA**: severity grade number in grayscale heat cell (`getNeutralHeatColor(severity_num)`). Missing = dash `—`.
- **LB**: fold-change vs control with direction. `5.2×↑` in `text-red-500` (up/adverse) or `0.8×↓` in `text-blue-500` (down). Missing = `—`.
- **OM**: % change vs control. `+35%` in red / `-8%` in blue. Missing = `—`.
- **BW**: % change from baseline at terminal timepoint.
- **CL**: onset day (`d18→`) derived as `min(CLSTDY)` per subject per observation. Onset day only — duration and frequency are out of scope (answerable from BW trajectory and disposition timeline). Missing = `—`.
- **MA**: check `✓` (present) / dash `—` (absent/not examined).

Row ordering within selected organ: MI findings first (sorted by group incidence desc), then MA, then LB (sorted by fold-change desc), then OM, then CL (grouped by body system: CNS, GI, integument, general — compresses noisy CL coding variability across studies), then BW. Domain column on far left of group table as a `text-[10px] font-semibold text-muted-foreground uppercase` tag.

**Shared row identity.** Both tables render the same rows — the finding identity (domain + finding name) is the join key. Rows are visually linked: hovering a row in either table highlights the corresponding row in the other.

**Tissue battery warnings.** Two distinct absence labels:
- `NE` (not examined) — `text-[10px] italic text-amber-500` — subject was expected to have this examination but doesn't (data gap). Source: cross_animal_flags tissue battery.
- `NC` (not collected) — `text-[10px] italic text-muted-foreground` — domain was never part of this subject's protocol (e.g., TK satellite with no MI/MA). Source: subject_context IS_TK flag + domain coverage rules.

The distinction matters: `NE` is a red flag (something went wrong), `NC` is informational (by design).

#### Charts section

Fixed-height row (~180px) below the tables, always visible. Two charts side by side.

**Left chart: Body Weight Trajectory** (always shown regardless of organ)

Reuse `buildBWComparisonOption()` from CompareTab. Individual subject lines (each colored distinctly) + control group mean as dashed reference line. Shows % change from Day 0. Vertical markers for early sacrifice days.

Data source: `/api/studies/{id}/subjects/compare?ids=` → `body_weights[]`.

**Right chart: Organ-contextual metric** (changes with organ toggle)

Responds to the organ toggle selection:

| Selected Organ | Right Chart | Data |
|---|---|---|
| Liver | ALT/AST fold-change bars per subject + group mean marker | unified_findings for ALT, AST (raw_subject_values) |
| Kidney | BUN/CRE fold-change bars | unified_findings for BUN, CREA |
| Spleen | Hematology panel (WBC, RBC, PLT) bars | unified_findings |
| Heart | Organ weight % change bars | unified_findings for OM+Heart |
| (any organ) | Organ weight % change bars (fallback) | unified_findings for OM |

Chart type: horizontal grouped bar chart. One bar per subject, grouped by test/metric. Group mean shown as a vertical reference line. Reuse EChartsWrapper.

When no organ-specific lab tests exist (via `ORGAN_RELEVANT_TESTS`), fall back to organ weight comparison.

### Context panel

Three modes, driven by user interaction:

**Default: Cohort Summary pane** (new component: `CohortContextPanel`)
- Header: "Cohort Summary" + subject count
- Composition: dose group breakdown (count per group), sex breakdown
- Shared findings (expanded version of the header bar): listed with domain tags, severity indicators, group incidence
- Tissue battery status: ✓ complete / ⚠ N subjects missing [organ] examination
- Tumor linkage summary: N tumor cross-references found (from cross_animal_flags)
- BW sparkline (small, overview — complements the full chart in center)

**On subject click: SubjectProfilePanel** (existing, frozen design)
Triggered by clicking a subject column header or a rail row. Standard drill-down, no changes needed.

**On finding click: Finding evidence pane**
Triggered by clicking a row in the evidence table. Shows dose-response detail for that finding across the full study (not just the cohort). Reuse from `FindingsContextPanel` or `EvidencePane` — pass the finding's `id` from unified_findings.

### States

- **Loading**: Spinner in center panel while unified_findings / subject_context load
- **Empty cohort**: "No subjects match the current preset and filters. Try a different preset or clear filters."
- **No findings for organ**: "No findings recorded for [Organ] in the selected subjects."
- **Single subject selected**: Tables still work (group table provides context, subject table has one column). Shared findings bar hidden.
- **Large cohort (>20 subjects)**: Subject table columns become narrow. Show a warning: "Showing first 20 subjects. Narrow your selection for detailed comparison." Truncate to 20 columns, sorted by dose level desc (highest dose first — most likely to have findings).

## Integration points

### Existing systems touched

| System | Doc | What changes |
|---|---|---|
| App routing | `App.tsx` | New route: `/studies/:studyId/cohort` |
| Shell rail panel | `ShellRailPanel.tsx` | New rail type detection for `/cohort` route → renders `CohortRail` |
| Context panel routing | `ContextPanel.tsx` | New route detection for `/cohort` → renders `CohortContextPanel` (or SubjectProfilePanel on subject select) |
| Browsing tree | `BrowsingTree.tsx` | Add "Cohort" entry under study nav tree |
| Study Summary mortality banner | `StudySummaryView.tsx` | "View TRS Animals" link navigates to `/cohort?preset=trs` |
| Histopathology Compare tab | `CompareTab.tsx` | "Open in Cohort View" button navigates to `/cohort?preset=histo&subjects=X,Y,Z` |

### Existing code reused (not modified)

| Component / Module | What it provides |
|---|---|
| `PanePillToggle` | Preset toggle, organ toggle |
| `FilterMultiSelect`, `FilterSearch`, `FilterClearButton` | Rail filters |
| `getDoseGroupColor`, `formatDoseShortLabel` | Dose color + labels |
| `getNeutralHeatColor` | MI severity cell coloring |
| `ORGAN_RELEVANT_TESTS`, `getRelevantTests()` | Organ → lab test mapping |
| `buildBWComparisonOption` | BW trajectory chart config |
| `EChartsWrapper` | Chart rendering |
| `SubjectProfilePanel` | Context panel subject drill-down |
| `useSubjectContext` | Subject roster hook |
| `useStudyMortality` | Mortality data hook |
| `useCrossAnimalFlags` | Tissue battery / tumor linkage hook |
| `useSubjectComparison` | Multi-subject BW/LB/CL comparison |
| `DoseLabel` / `DoseHeader` | Dose display components |
| `Badge` | Categorical badges |

### New components

| Component | Location | Responsibility |
|---|---|---|
| `CohortView` | `components/analysis/CohortView.tsx` | Main view: orchestrates rail state, center content, context panel routing |
| `CohortRail` | `components/analysis/cohort/CohortRail.tsx` | Rail: preset toggle, filters, subject row list |
| `CohortEvidenceTable` | `components/analysis/cohort/CohortEvidenceTable.tsx` | Center: side-by-side group + subject tables |
| `CohortCharts` | `components/analysis/cohort/CohortCharts.tsx` | Center: BW trajectory + organ-contextual chart |
| `CohortContextPanel` | `components/analysis/panes/CohortContextPanel.tsx` | Context: cohort summary pane |
| `useCohortFindings` | `hooks/useCohortFindings.ts` | Derives organ-grouped, subject-filtered findings from unified_findings |

### New dependencies

None. All charting (ECharts), UI primitives (shadcn), and data fetching (React Query) are already in the project.

## Acceptance criteria

### Rail
- When navigating to `/cohort?preset=trs`, the TRS preset is active and only TRS subjects (from study_mortality deaths, excluding accidentals) appear in the rail
- When toggling to "Histo" preset, subjects matching any of the three criteria appear: severity ≥ adverse, COD-related, or MI findings in ≥2 distinct organs
- Subjects qualifying for Histopath preset via criterion 3 only show `PATTERN` badge (violet); others show `ADVERSE` or disposition-based badge
- When toggling to "Recovery" preset, only recovery-period subjects appear; subject cards show `Rec d{X}/{Y}` recovery day context
- When toggling to "All" preset, the full subject roster appears (IS_TK satellites excluded by default)
- When enabling "Include TK satellites" checkbox, TK animals appear with `TK` badge; their domain rows show `NC` (not collected) for MI/MA
- When filtering by dose group, only subjects at that dose level appear
- When shift-clicking subjects, range selection works (same behavior as SubjectHeatmap)
- Sex letters render in reserved colors: M cyan `#0891b2`, F pink `#ec4899`
- Left pipe on each subject row matches dose group color
- Subject count in summary line updates as filters/selections change

### Center — Evidence table
- When selecting organ "Liver", the table shows only findings where `organ_name === "Liver"` (across MI, MA, LB, OM, CL, BW domains)
- Organ toggle pills are alphabetically ordered and color-coded by signal strength (adverse-red / warning-amber / normal-neutral)
- Group table always shows a Control column (group mean, visually distinguished as reference) plus one column per dose group represented in the cohort
- Group table shows dose group statistics (incidence for MI/MA, fold-change for LB, % change for OM)
- Subject table shows individual values aligned to the same rows
- Hovering a row highlights it in both tables
- MI severity cells use `getNeutralHeatColor()` grayscale
- LB cells show fold-change with directional color (up = red, down = blue)
- CL rows are grouped by body system (CNS, GI, integument, general); cells show onset day (`d18→`)
- `NE` (not examined) appears for subjects missing examination (data gap); `NC` (not collected) for domains excluded by protocol (TK satellites)
- No collapsible sections anywhere — all content for the selected organ is flat and visible

### Center — Charts
- BW trajectory chart renders for all selected subjects with individual colored lines + control dashed reference
- Right chart updates when organ toggle changes (Liver → ALT/AST bars, Kidney → BUN/CRE bars, etc.)
- Charts remain visible (not collapsible) below the tables

### Center — Shared findings
- When ≥2 subjects selected, shared findings bar shows findings present in ALL selected subjects
- Each shared finding shows domain tag + name + direction indicator
- When only 1 subject selected, shared findings bar is hidden

### Context panel
- Default state (no interaction): CohortContextPanel shows cohort composition, shared findings detail, tissue battery status
- Clicking a subject column header or rail row: context panel switches to SubjectProfilePanel for that subject
- Clicking a finding row: context panel shows finding-level evidence (dose-response detail for full study)

### Navigation
- "Cohort" appears in the browsing tree under each study
- Study Summary mortality banner includes a link that navigates to the cohort view with TRS preset
- Back navigation from cohort view returns to previous view

### Performance
- Subject table caps at 20 visible columns; shows truncation message when cohort exceeds 20
- unified_findings data is fetched once and filtered client-side (no per-subject API calls for the table)
- BW/LB comparison data uses existing `/subjects/compare` endpoint (single call)

## Datagrok notes

In the production Datagrok plugin, this view would use:
- `DG.Viewer.fromType('grid')` for the evidence tables (with custom cell renderers for severity cells, fold-change cells)
- `DG.Viewer.fromType('line-chart')` for BW trajectory
- `DG.Viewer.fromType('bar-chart')` for organ-contextual metrics
- Subject selection would sync with Datagrok's native row selection on the DM dataframe
- Preset filtering would use Datagrok's `BitSet` filter on the DM dataframe's columns (DISPOSITION, DOSE_GROUP, etc.)

## Design decisions (resolved)

1. **Histopath preset: three-criteria definition.** Severity ≥ adverse OR COD-related OR MI findings in ≥2 distinct organs (any severity). The third criterion captures systemic multi-organ patterns that no single finding crosses the adverse threshold. Subjects qualifying via criterion 3 only are badged `PATTERN` to signal why they were surfaced.

2. **Recovery preset: recovery subjects only.** No main-study counterparts pulled in. The group-level recovery comparison view handles the before/after arc. Subject cards show recovery day context (`Rec d14/28`) for reversibility-window orientation.

3. **Organ toggle: alphabetical order, signal-coded color.** Stable ordering (doesn't shift with selection changes). Each pill color-coded by signal strength (adverse-red / warning-amber / normal-neutral) so the pathologist sees which organs are hot without reordering.

4. **CL representation: onset day only, body-system grouping.** Cell value is `min(CLSTDY)` per subject per observation. Duration and frequency are out of scope (answerable from BW trajectory + disposition timeline). CL rows grouped by body system (CNS, GI, integument, general) to compress noisy coding variability. Requires backend pipeline derivation task.

5. **Multi-dose cohort: control always present.** Control column always shown as reference (group mean only, not individual animals). Visually distinguished as a reference column, not a cohort member. One column per dose group represented in the cohort alongside control.

6. **TK satellites: toggle, not preset.** "Include TK satellites" checkbox in rail header, off by default. TK animals appear with `TK` badge. Domain rows without MI/MA data show `NC` (not collected) instead of `NE` (not examined) — the absence is by design, not a data gap.

## Open questions

None — all design decisions resolved. Implementation can proceed.
