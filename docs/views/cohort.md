# Cohort View

**Route:** `/studies/:studyId/cohort`
**Component:** `CohortView.tsx` (wrapped by `CohortViewWrapper.tsx`, which re-exports `CohortView`)
**Scientific question:** "What toxicological signals emerge when comparing a specific subgroup of subjects across organs and endpoints?"
**Role:** Multi-subject analysis surface. Subjects are browsed and multi-selected in the rail (`CohortRail`). The center panel shows organ-centric evidence tables (group summary + per-subject detail side by side). Charts below show body weight trajectories and organ-contextual metrics. The context panel provides cohort composition, shared findings, tissue battery status, and tumor linkage.

**Data source:** Unified findings (`useFindings`), subject context (`useSubjectContext`), mortality (`useStudyMortality`), cross-animal flags (`useCrossAnimalFlags`), and subject comparison (`useSubjectComparison`). All fetched via React Query hooks and processed client-side by the cohort engine (`cohort-engine.ts`).

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Cohort     |  Cohort View              | Context    |
| Rail       |  (this document)          | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The center panel is a flex column with two zones:

```
+-----------------------------------------------------------+
|  CohortEvidenceTable                                       |
|  ┌─────────────────┬──────────────────────────────────┐    |
|  │ Organ toggles + shared findings bar                │    |  border-b header
|  ├─────────────────┼──────────────────────────────────┤    |
|  │ Truncation warning (conditional, amber)            │    |  conditional
|  ├──────[280px]────┼──────────[flex-1]────────────────┤    |
|  │ Group summary   │ Subject detail table             │    |
|  │ table           │ (per-subject columns)            │    |
|  │ (per-dose-group)│                                  │    |
|  │                 │                                  │    |  flex-1 overflow
|  └─────────────────┴──────────────────────────────────┘    |
+-----------------------------------------------------------+
|  CohortCharts (h-[180px] shrink-0 border-t)                |
|  ┌──────────────────┬──────────────────┐                    |
|  │ BW trajectory    │ Organ metrics    │                    |
|  │ (ECharts)        │ (ECharts)        │                    |
|  └──────────────────┴──────────────────┘                    |
+-----------------------------------------------------------+
```

---

## State Provider

**Component:** `CohortProvider` in `contexts/CohortContext.tsx`

The `CohortProvider` wraps the layout level so both the rail and center panel can consume shared state via `useCohort()`. A lightweight `useCohortMaybe()` returns `null` when not on the cohort route.

### Data Fetching

| Hook | Data | Notes |
|------|------|-------|
| `useFindings(studyId, 1, 10000, EMPTY_FILTERS)` | All unified findings | Full study fetch, 10k page |
| `useSubjectContext(studyId)` | Subject roster with dose/arm/sex/schedule | Backend `/api/studies/{id}/subject-context` |
| `useStudyMortality(studyId)` | Deaths, accidentals, early deaths | For TRS qualification |
| `useCrossAnimalFlags(studyId)` | Tissue battery gaps, tumor linkage | For NE/NC labels and context panel |

### Cohort Engine (`lib/cohort-engine.ts`)

Pure functions that derive all cohort data from the raw hooks:

| Function | Input | Output |
|----------|-------|--------|
| `buildCohortSubjects()` | SubjectContext + mortality + crossAnimalFlags + findings | `CohortSubject[]` with badges, histopath reasons, sacrifice days |
| `computePresetSubjects()` | allSubjects + preset + includeTK | `Set<string>` of qualifying USUBJIDs |
| `computeOrganSignals()` | findings + activeSubjects | `OrganSignal[]` — organs with findings relevant to the cohort |
| `buildCohortFindingRows()` | findings + organName + activeSubjects | `CohortFindingRow[]` — rows for the evidence table |
| `computeSharedFindings()` | findings + activeSubjects (>=2) | `SharedFinding[]` — findings common to all active subjects |

### Subject Pipeline

```
allSubjects (buildCohortSubjects)
  │
  ├─ preset filter (computePresetSubjects) ──> presetSubjectIds
  │
  ├─ dose/sex/search filters ──> filteredSubjects
  │
  ├─ selection intersection ──> activeSubjects
  │
  └─ display cap (MAX_SUBJECT_COLUMNS = 20) ──> displaySubjects
```

When preset or filters change, all filtered subjects are auto-selected (unless URL `?subjects=` was provided on entry). If `activeSubjects.length > 20`, `displaySubjects` takes the top 20 sorted by descending dose group order.

---

## Cohort Rail (Left Panel -- `CohortRail.tsx`)

**Component:** `CohortRail` in `components/analysis/cohort/CohortRail.tsx`

The rail is the subject roster with preset toggles, filters, and multi-select rows.

### Zone 1: Preset Toggle

`PanePillToggle` with four options:

| Preset | Value | Subjects Included |
|--------|-------|-------------------|
| TRS | `"trs"` | Subjects with `badge === "trs"` (treatment-related sacrifice) |
| Histo | `"histo"` | Subjects with any `histoReason` (adverse, cod, or pattern) |
| Recovery | `"recovery"` | Subjects with `isRecovery === true` |
| All | `"all"` | All subjects (TK excluded unless toggled) |

### Zone 2: Summary Line

`text-[10px] text-muted-foreground` showing: `{N} subjects . {N} dose grps . M {N} / F {N}`. Sex counts are colored with reserved sex colors (`#0891b2` cyan-M, `#ec4899` pink-F).

### Zone 3: Filters

Three filter controls in a flex-wrap row:

| Filter | Component | Options |
|--------|-----------|---------|
| Dose group | `FilterMultiSelect` | Dynamic from filtered subjects |
| Sex | `FilterMultiSelect` | M / F |
| USUBJID search | `FilterSearch` | Free-text, placeholder "USUBJID" |

`FilterClearButton` shown when any filter is active.

### TK Toggle

Checkbox "Include TK satellites" — shown only in the `all` preset. Controls `includeTK` state.

### Zone 4: Subject Rows

Scrollable container of `SubjectRow` buttons. Each row:

- Left border: `3px solid` dose group color (`getDoseGroupColor`)
- USUBJID: `font-mono text-xs font-semibold`, truncated
- Sex: `text-xs font-semibold`, sex-colored
- Badge (conditional): `rounded border px-1 text-[10px] font-semibold uppercase`
  - TRS: `bg-red-50 text-red-600 border-red-200`
  - Adverse: `bg-red-50 text-red-600 border-red-200`
  - Rec: `bg-green-50 text-green-600 border-green-200`
  - Pattern: `bg-violet-50 text-violet-600 border-violet-200`
  - TK: `bg-gray-50 text-gray-500 border-gray-200`
- Disposition day: `font-mono text-[10px] text-muted-foreground`
  - Recovery subjects: `Rec d{actual}/{planned}` (relative to recovery start)
  - Main study: `d{sacrifice}/{planned}` (early sacrifice highlighted with `text-foreground font-medium`)

### Row Interactions

- Click: toggle subject selection (`toggleSubject`)
- Shift+click: range select from last-clicked index to current
- Selected: `bg-accent`
- Unselected hover: `hover:bg-accent/30`
- Minimum selection: 1 (cannot deselect the last remaining subject)

### Empty State

"No subjects match the current preset and filters. Try a different preset or clear filters." -- `px-3 py-6 text-center text-xs text-muted-foreground`

---

## Evidence Table (Center Panel -- `CohortEvidenceTable.tsx`)

**Component:** `CohortEvidenceTable` in `components/analysis/cohort/CohortEvidenceTable.tsx`

### Header Bar

`flex items-center gap-3 border-b px-3 py-1.5`

#### Organ Toggle Pills (<=6 organs)

Rendered as pill toggle group (`rounded bg-muted/30 p-0.5`). Each pill:
- Active: `bg-background shadow-sm`
- Inactive: `text-muted-foreground hover:text-foreground`
- Text: `text-[10px] font-medium`
- Organ name colored by worst severity: adverse=`text-red-600`, warning=`text-amber-600`, normal=`text-muted-foreground`

#### Organ Dropdown (>6 organs)

When more than 6 organs have signals, falls back to `FilterSelect` dropdown.

#### Auto-Selection

On first render (or when organ signals change), the organ with the highest signal is auto-selected. Priority: adverse severity first, then highest finding count.

#### Shared Findings Bar

Shown when `selectedSubjectCount >= 2`. Displays up to 8 shared findings:

```
All {N} share . [DOM Finding ↑] . [DOM Finding ↓] . ...
```

- Label: `shrink-0 font-semibold text-muted-foreground`
- Domain: `font-semibold text-muted-foreground`
- Finding: `text-foreground`
- Direction arrow: up=`text-red-500`, down=`text-blue-500`
- Wraps in `overflow-x-auto`

When `selectedSubjectCount >= 2` and no shared findings exist: "No findings common to all {N} subjects"

### Truncation Warning

Shown when `activeSubjects.length > 20`:

```
Showing first 20 subjects. Narrow your selection for detailed comparison.
```

`border-b bg-amber-50 px-3 py-1 text-[10px] text-amber-700`

### Side-by-Side Tables

The two tables scroll independently but share row identity and hover state.

#### Group Summary Table (Left -- 280px)

`w-[280px] shrink-0 overflow-y-auto border-r`

| Column | Header | Width | Cell Rendering |
|--------|--------|-------|----------------|
| Dom | DOM | nowrap | `text-[10px] font-semibold uppercase text-muted-foreground` |
| Finding | FINDING | absorber (max-w-[140px] truncate) | `text-xs` finding label |
| Per dose group | Ctrl / dose labels | nowrap each | `GroupCell` renderer |

**Header row:** `sticky top-0 z-10 bg-background`. Headers use `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`. Control column header styled italic with `bg-muted/10`.

**Dose group columns:** One per represented dose group (groups present in `displaySubjects`, plus control). Sorted by dose level ascending. Control column shows "Ctrl" (italic, muted). Treated columns show short dose labels (`formatDoseShortLabel`).

**GroupCell rendering by domain:**

| Domain | Format | Example |
|--------|--------|---------|
| MI, MA, CL | Incidence: `affected/n` or `{pct}%` | `3/10`, `30%` |
| OM, BW | % change (signed): `+{pct}%` / `{pct}%` | `+15%`, `-8%` |
| LB | Fold-change with arrow: `{fc}x↑` / `{fc}x↓` | `1.8x↑`, `0.7x↓` |

Control column values shown without direction coloring. Treated column values colored: positive/up=`text-red-500`, negative/down=`text-blue-500`.

#### Subject Detail Table (Right -- flex-1)

`min-w-0 flex-1 overflow-auto`

**Subject column headers** (one per `displaySubject`):

- USUBJID suffix: `font-mono text-[10px] font-semibold` (last segment after `-`)
- Sub-line: dose group color dot (`h-1.5 w-1.5 rounded-full`) + sex letter (sex-colored) + short dose label
- Clickable: `cursor-pointer hover:bg-accent/30`, click fires `onSubjectClick`

**SubjectCell rendering by domain:**

| Domain | Format | Notes |
|--------|--------|-------|
| MI | Severity heatmap chip: `h-5 w-6 rounded` with `getNeutralHeatColor(sev/5)` | 5-step neutral grayscale |
| MA | Checkmark or em dash | `✓` if present |
| LB | Fold-change with direction coloring | Same as GroupCell but per-subject |
| OM, BW | % change with direction coloring | Same as GroupCell but per-subject |
| CL | Onset day: `d{value}→` | Clinical observation onset |

**Absence labels** (incidence domains without per-subject data):

| Label | Meaning | Style |
|-------|---------|-------|
| NC | Not collected (TK satellite) | `text-[10px] italic text-muted-foreground` |
| NE | Not examined (tissue battery gap) | `text-[10px] italic text-amber-500` |

When a subject has no value and is not NC/NE: middot (`·`) in `text-muted-foreground`.

### Row Interactions

- Row hover: synchronized between group summary and subject detail via `hoveredRow` state
  - Hovered: `bg-accent/40`
  - Default: `hover:bg-accent/20`
- Row click: fires `onFindingClick(findingId)` -- opens finding in context panel

### CL Body-System Classification

CL findings are classified into body-system categories by the backend (`findings_cl.py:classify_cl_body_system()`): CNS, GI, integument, or general. The `organ_name` field is overridden with this classification, so CL findings appear under the appropriate organ in the organ toggle (e.g., ALOPECIA under "Integument"). Per-subject onset days are provided via `raw_subject_onset_days` — an array of `{USUBJID: min_CLDY}` maps, rendered as `d{day}→` in subject cells.

### Finding Row Sort Order

Rows sorted by domain priority (MI=0, MA=1, LB=2, OM=3, CL=4, BW=5), then by signal strength descending (`maxIncidence` or `maxFoldChange`).

### Empty States

| State | Display |
|-------|---------|
| Organ selected, no findings | `No findings recorded for {organ} in the selected subjects.` |
| No organ selected | `Select an organ to view findings` |

---

## Charts Panel (`CohortCharts.tsx`)

**Component:** `CohortCharts` in `components/analysis/cohort/CohortCharts.tsx`

Fixed height `h-[180px] shrink-0 border-t`, always visible below the evidence table.

### Body Weight Trajectory (Left)

- Header: "BODY WEIGHT TRAJECTORY" in `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`
- Chart: `EChartsWrapper` with `buildBWComparisonOption()`, height 150px
- Data: `useSubjectComparison(studyId, subjectIds)` → `body_weights` + `control_stats.bw`
- Mode: `"baseline"` (% change from baseline)
- Empty: "No body weight data"

### Organ Metrics (Right)

- Header: `{organName} METRICS` or "ORGAN METRICS" in `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`
- Chart: `EChartsWrapper`, height 150px
- Logic:
  1. Look up relevant lab tests via `getOrganRelevantTests(selectedOrgan)` (top 4)
  2. If tests found: `buildLabBarChart()` — horizontal bar chart with per-subject bars + group mean reference line
  3. If no tests: `buildOrganWeightChart()` — organ weight % change bars
  4. Bars capped at 10 subjects (lab) or 15 subjects (organ weight)
- Subject colors: 20 distinct colors cycled
- Empty: "No organ-specific metrics"

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches `/studies/{studyId}/cohort`, the `ContextPanel` renders one of three panes based on state:

1. **Subject selected** (`selectedSubject` set via `setSelectedSubject`): `SubjectProfilePanel` — full subject profile with findings, BW sparkline, and navigation
2. **Finding clicked** (`selection._view === "cohort" && selection.mode === "finding"`): `FindingsContextPanel` — standard finding evidence pane
3. **Default**: `CohortContextPanel` — cohort summary

### CohortContextPanel (`panes/CohortContextPanel.tsx`)

Displays cohort-level summary in a vertical stack of sections (`flex flex-col gap-4 p-4`).

#### Header

- Title: "COHORT SUMMARY" in `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Subtitle: `{N} subjects selected` in `text-sm font-medium`

#### Section 1: Composition

- Title: "COMPOSITION"
- Dose group breakdown: color dot + label + count (sorted by dose level ascending)
- Sex breakdown: `M {N} / F {N}` with sex colors

#### Section 2: Shared Findings

Shown when `sharedFindings.length > 0`. Title: "SHARED FINDINGS ({N})". Each finding:
- Domain label: `text-[10px] font-semibold text-muted-foreground`
- Finding name (truncated)
- Direction arrow: up=`text-red-500`, down=`text-blue-500`
- Severity label: adverse=`text-red-600`, warning=`text-amber-600`, normal=`text-muted-foreground`

#### Section 3: Tissue Battery

- Title: "TISSUE BATTERY"
- Complete: `✓ Complete` in `text-green-600`
- Gaps: `⚠ {N} subject(s) missing {organ} examination` per organ in `text-amber-600`
- Generic gaps: `⚠ {N} subject(s) with examination gaps` in `text-amber-600`

#### Section 4: Tumor Linkage

Shown when tumor dose-response patterns exist. Title: "TUMOR LINKAGE". Text: `{N} tumor dose-response pattern(s) found` in `text-xs text-muted-foreground`.

#### Section 5: Affected Organs

Shown when `organSignals.length > 0`. Title: "AFFECTED ORGANS ({N})". Each organ:
- Severity dot: adverse=`text-red-600`, warning=`text-amber-600`, normal=`text-muted-foreground`
- Organ name
- Finding count in `font-mono text-muted-foreground`

#### Section 6: Body Weight Overview

Shown when body weight data available. Title: "BODY WEIGHT OVERVIEW". Inline SVG sparkline (`BWSparkline`) — 180x50px, % change from baseline for up to 10 subjects. Zero line dashed, subject lines in gray at 50% opacity.

### SubjectProfilePanel Integration

When a subject column header is clicked in the evidence table or a subject is clicked in another component, `setSelectedSubject(usubjid)` is called. This triggers `ContextPanel` to render `SubjectProfilePanel` with the full subject profile. The panel's back button calls `setSelectedSubject(null)` to return to the cohort summary.

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Preset | Provider + URL | `useState<CohortPreset>`, initialized from `?preset=` |
| Selected subjects | Provider | `useState<Set<string>>`, auto-populated on filter change |
| Selected organ | Provider + URL | `useState<string \| null>`, initialized from `?organ=`, auto-selects highest signal |
| Include TK | Provider | `useState(false)` |
| Dose filter | Provider + URL | `useState<Set<number> \| null>`, initialized from `?dose=` |
| Sex filter | Provider | `useState<Set<string> \| null>` |
| Search query | Provider | `useState("")` |
| Hovered row | Provider | `useState<string \| null>`, syncs hover between tables |
| Selected subject (profile) | ViewSelectionContext | `selectedSubject` / `setSelectedSubject` |
| Finding selection | ViewSelectionContext | `selection._view === "cohort"`, `mode: "finding"` |
| Unified findings | Server | `useFindings(studyId, 1, 10000, EMPTY_FILTERS)` |
| Subject context | Server | `useSubjectContext(studyId)` |
| Mortality | Server | `useStudyMortality(studyId)` |
| Cross-animal flags | Server | `useCrossAnimalFlags(studyId)` |
| Subject comparison | Server | `useSubjectComparison(studyId, subjectIds)` |

### URL Parameters

| Param | Purpose | Example |
|-------|---------|---------|
| `?preset=` | Initial preset selection | `?preset=trs` |
| `?subjects=` | Comma-separated initial subject selection | `?subjects=SUBJ-001,SUBJ-002` |
| `?dose=` | Initial dose group filter (single dose level) | `?dose=3` |
| `?organ=` | Initial organ selection | `?organ=Liver` |

URL params are read on mount for initialization. They are not updated as the user interacts (one-way read).

---

## Data Flow

```
useFindings ─────────────────> findings, doseGroups
useSubjectContext ───────────> subjectContext
useStudyMortality ───────────> mortality
useCrossAnimalFlags ─────────> crossAnimalFlags
                                  |
              buildCohortSubjects(subjectContext, mortality, crossAnimalFlags, findings)
                                  |
                            allSubjects: CohortSubject[]
                                  |
              computePresetSubjects(allSubjects, preset, includeTK)
                                  |
                         presetSubjectIds: Set<string>
                                  |
              dose/sex/search filters applied client-side
                                  |
                         filteredSubjects: CohortSubject[]
                                  |
              selection intersection (selectedSubjects ∩ filteredSubjects)
                                  |
                         activeSubjects: CohortSubject[]
                                  |
              ┌──────────────────┼──────────────────┐
              |                  |                  |
   displaySubjects        organSignals         sharedFindings
   (cap 20, sorted       (computeOrganSignals) (computeSharedFindings)
    by dose desc)              |
                         selectedOrgan
                               |
                         findingRows
                        (buildCohortFindingRows)
                               |
              ┌────────────────┼────────────────┐
              |                                 |
  CohortEvidenceTable                    CohortCharts
  (group summary +                       (BW trajectory +
   subject detail)                        organ metrics)
              |
  ┌───────────┴───────────┐
  |                       |
  onSubjectClick     onFindingClick
  → setSelectedSubject   → setSelection({ _view: "cohort", mode: "finding" })
  → SubjectProfilePanel  → FindingsContextPanel
```

---

## Interactivity Patterns

| Interaction | Target | Result |
|-------------|--------|--------|
| Click preset pill | Rail | Switch preset, auto-select all matching subjects |
| Toggle dose/sex filter | Rail | Filter subjects, auto-select all remaining |
| Click subject row | Rail | Toggle subject selection |
| Shift+click subject row | Rail | Range-select subjects from last click |
| Click organ pill/dropdown | Evidence table header | Switch organ, rebuild finding rows |
| Hover finding row | Group or subject table | Synced highlight across both tables |
| Click finding row | Group or subject table | Open finding in context panel (FindingsContextPanel) |
| Click subject column header | Subject detail table | Open SubjectProfilePanel in context panel |
| Click back in SubjectProfilePanel | Context panel | Return to CohortContextPanel |

---

## Cross-View Navigation

### Inbound

The cohort view accepts URL parameters for deep linking from other views:

- `?preset=trs` — open with TRS subjects pre-selected
- `?dose=3&organ=Liver` — open filtered to dose group 3, Liver selected
- `?subjects=SUBJ-001,SUBJ-002` — open with specific subjects selected

### Outbound

- Subject column header click → `SubjectProfilePanel` (context panel pane, not a route change)
- Finding row click → `FindingsContextPanel` (context panel pane, not a route change)

No direct route-level navigation to other views from this view.

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading (findings or subject context) | `Loader2` spinner centered in flex-1 area |
| No comparison data (charts) | Charts panel hidden entirely |
| No BW data | Left chart: "No body weight data" centered |
| No organ metrics | Right chart: "No organ-specific metrics" centered |
| No subjects match preset + filters | Rail: "No subjects match the current preset and filters. Try a different preset or clear filters." |
| No organ selected | Center: "Select an organ to view findings" |
| Organ selected, no findings | Center: "No findings recorded for {organ} in the selected subjects." |
| Cohort context not available | Context panel: "Cohort context not available" |

---

## Key Types

### CohortSubject

```typescript
interface CohortSubject {
  usubjid: string;
  sex: string;
  dose: number;
  doseLabel: string;
  doseGroupOrder: number;
  isControl: boolean;
  isRecovery: boolean;
  isTK: boolean;
  sacrificeDay: number | null;
  plannedDay: number | null;
  recoveryStartDay: number | null;
  arm: string;
  badge: "trs" | "adverse" | "rec" | "pattern" | "tk" | null;
  histoReason: "adverse" | "cod" | "pattern" | null;
}
```

### CohortPreset

```typescript
type CohortPreset = "trs" | "histo" | "recovery" | "all";
```

### OrganSignal

```typescript
interface OrganSignal {
  organName: string;
  worstSeverity: "adverse" | "warning" | "normal";
  findingCount: number;
}
```

### CohortFindingRow

```typescript
interface CohortFindingRow {
  key: string;               // domain + finding + day + sex
  domain: string;
  finding: string;
  testCode: string;
  organName: string;
  sex: string;
  day: number | null;
  severity: "adverse" | "warning" | "normal";
  direction: "up" | "down" | "none" | null;
  findingId: string;
  groupStats: GroupStatEntry[];
  subjectValues: Record<string, number | string | null>;
  dataType: "continuous" | "incidence";
  maxFoldChange: number | null;
  maxIncidence: number | null;
}
```

### SharedFinding

```typescript
interface SharedFinding {
  domain: string;
  finding: string;
  direction: "up" | "down" | "none" | null;
  severity: "adverse" | "warning" | "normal";
}
```

---

## Domain Data Model

The cohort engine handles two data paradigms from unified findings:

| Category | Domains | Per-Subject Data | Group Data |
|----------|---------|------------------|------------|
| Continuous | LB, OM, BW | `raw_subject_values` (USUBJID→value maps) | `group_stats` (mean, SD per dose) |
| Incidence | MI, MA, CL | Not available (except CL via `raw_subject_onset_days`) | `group_stats` (affected/n, incidence per dose) |

For **continuous** domains, per-subject values are shown in the subject detail table. For **incidence** domains, the subject detail table shows absence labels (NC/NE) or middots, and the group summary table shows incidence rates.

CL (clinical observations) is a special case: `raw_subject_onset_days` provides per-subject onset day data, displayed as `d{day}→`.

---

## Subject Badge Logic

Badges indicate why a subject is notable. Assigned in `buildCohortSubjects()` with priority order:

| Priority | Badge | Condition |
|----------|-------|-----------|
| 1 | TRS | Subject in mortality deaths (treatment-related sacrifice) |
| 2 | Adverse | `histoReason` is "adverse" or "cod" |
| 3 | Pattern | `histoReason` is "pattern" (MI findings in >=2 organs at dose level) |
| 4 | Rec | Recovery subject (non-control) |
| 5 | TK | TK satellite |

### Histopath Qualification Criteria

| Criterion | Logic |
|-----------|-------|
| Adverse | MI adverse finding at subject's non-control dose level |
| COD | Subject flagged in cross-animal tissue battery |
| Pattern | MI findings in >=2 distinct organs at subject's non-control dose level |

---

## Current Improvement Opportunities

### Evidence Table
- No column sorting
- No export capability
- Subject detail table has no column resizing

### Charts
- Lab bar chart capped at 10 subjects, organ weight at 15
- No interactive tooltip linking charts to table rows
- No recovery period annotation on BW trajectory

### General
- No keyboard navigation
- URL params are read-only (not synced back on interaction)
- No direct cross-view navigation to histopathology or findings views
