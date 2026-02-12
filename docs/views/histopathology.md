# Histopathology View

**Route:** `/studies/:studyId/histopathology`
**Component:** `HistopathologyView.tsx` (wrapped by `HistopathologyViewWrapper.tsx`)
**Scientific question:** "What are the microscopic findings and how severe are they across dose groups?"
**Role:** Histopathology-specific analysis. Two-panel master-detail layout with specimen rail and evidence panel (Overview + Severity Matrix tabs).

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
| search     |z| [Overview] [Severity matrix]  <── tab bar          |
| specimen 1 |e+----------------------------------------------------+
| specimen 2 | | Tab content:                                       |
| specimen 3 | |  Overview: observed findings, coherence, insights   |
| ...        | |  Severity matrix: filters, heatmap, collapsible grid|
|            | |                                                     |
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
- Container: `w-full text-left border-b border-border/40 px-3 py-2.5 transition-colors`
- Selected: `bg-blue-50/60 dark:bg-blue-950/20`
- Not selected: `hover:bg-accent/30`
- Left border: `border-l-2 border-l-transparent` always (neutral-at-rest design; no severity coloring on rail borders)

**Row 1:** Specimen name (`text-xs font-semibold`) + finding count badge (`text-[10px] text-muted-foreground`)

**Row 2:** Severity bar — neutral gray alignment matching Signals rail. Track: `h-1.5 flex-1 rounded-full bg-[#E5E7EB]`, fill color encodes max severity via `getNeutralHeatColor(maxSeverity).bg` (passed as `fillColor` prop to `EvidenceBar`). Numeric value: `shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground`.

**Row 3:** Stats line — `{N} findings · {M} adverse ({pct}%)` + domain chips (plain colored text: `text-[9px] font-semibold` with `getDomainBadgeColor().text` color class). Adverse percentage is `adverseCount / findingCount * 100`, guarded when `findingCount === 0`.

### Sorting

Specimens sorted by: `maxSeverity` desc → `adverseCount` desc → `findingCount` desc.

### Auto-Select

On data load, auto-selects the top specimen (highest max severity).

### Search

Filters specimens by name (case-insensitive substring match). Empty state: "No matches for '{search}'".

---

## Specimen Header

`shrink-0 border-b px-4 py-3`

### Title row (flex, gap-2)

- Specimen name: `text-sm font-semibold`
- Adverse badge (if adverseCount > 0): `text-[10px] font-semibold uppercase text-[#DC2626]` — "{N} adverse" (bold red text, matching TARGET badge pattern)
- Sex specificity badge: `rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground` — "Male only" | "Female only" | "Both sexes". Derived from unique `sex` values in `specimenData`.
- Review-status badge (stub): `rounded border border-border/50 px-1 text-[10px] text-muted-foreground/60` — always shows "Preliminary". TODO: derive from `useAnnotations<PathologyReview>` aggregate `peerReviewStatus` (Preliminary/Confirmed/Adjusted).

### 1-line conclusion

`mt-1 text-xs leading-relaxed text-muted-foreground`

Deterministic sentence built by `deriveSpecimenConclusion()` from:
- **Incidence**: "low-incidence" (≤20%), "moderate-incidence" (21-50%), "high-incidence" (>50%)
- **Severity**: "max severity {n}" or "non-adverse" if adverseCount === 0
- **Sex**: from `deriveSexLabel()` (lowercase)
- **Dose relationship**: "with dose-related increase" if R01/R04 rules present, else from `getDoseConsistency()` — "with dose-related trend" (Strong) or "without dose-related increase"

Example: *"Low-incidence, non-adverse, male only, without dose-related increase."*

### Compact metrics

`mt-2 flex flex-wrap gap-3 text-[11px]` — max severity (font-mono), total affected, finding count.

---

## Tab Bar

`flex shrink-0 items-center gap-0 border-b bg-muted/30` (canonical tab bar pattern)

Three tabs: **Evidence**, **Severity matrix**, **Hypotheses**

Active tab: `text-foreground` + `absolute inset-x-0 bottom-0 h-0.5 bg-primary` underline
Inactive tab: `text-muted-foreground hover:text-foreground`
All tabs: `relative px-4 py-1.5 text-xs font-medium transition-colors`

---

## Overview Tab

`flex-1 overflow-y-auto px-4 py-3` — scrollable content.

### Observed Findings

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Observed findings"

Each finding is a clickable `<button>` row:
- Container: `flex w-full items-center gap-2 rounded border border-border/30 px-2 py-1.5 text-left text-[11px] hover:bg-accent/30`
- Selected: `bg-accent ring-1 ring-primary`
- Finding name: truncated at 40 chars, `min-w-0 flex-1 truncate font-medium`
- Max severity: `shrink-0 font-mono text-[10px] text-muted-foreground`
- Incidence summary: `{totalAffected}/{totalN}`, `shrink-0 font-mono text-[10px] text-muted-foreground`
- Severity category badge: `shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground`
- "Dose-driven" badge (conditional): shown only when `getFindingDoseConsistency()` returns "Strong" for that finding. Neutral gray: `rounded-sm border border-border px-1 py-0.5 text-[9px] text-muted-foreground`. Per-finding consistency is precomputed in a `useMemo` keyed to `findingSummaries` and `specimenData`.

Sorted by max avg_severity descending. Click sets finding-level selection (updates context panel). Click again to deselect.

### Cross-Organ Coherence Hint

Rendered between "Observed findings" and "Insights" when R16 rules are relevant. Two possible lines, both `text-[11px] text-muted-foreground`:

1. **Convergent endpoints** (if R16 rules match this specimen's organ_system): "Convergent findings: {endpoint1}, {endpoint2}, ..."
   - Extracts endpoint names from R16 `output_text` matching pattern `"{endpoints} show convergent pattern"`.
2. **Related organs** (if other organs share endpoint labels with this specimen's findings): "Related findings also observed in {other_organ}."
   - Scans all R16 rules for other organs whose output_text mentions any of this specimen's finding names.

If no R16 match found, nothing is rendered (no empty state).

### Insights

Only shown when specimen-scoped rule results exist. Section header: "Insights". Uses `InsightsList` component with `specimenRules` (pre-filtered at parent level — matches on output_text, context_key, or organ_system).

---

## Severity Matrix Tab

Preserves the existing heatmap + collapsible grid, scoped to the selected specimen.

### Filter Bar

`flex items-center gap-2 border-b bg-muted/30 px-4 py-2`

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Sex | Dropdown | `<select>` with "All sexes" / Male / Female | All |
| Min severity | Dropdown | `<select>` with "Min severity: any" / "1+" / "2+" / "3+" | Any (0) |

No specimen dropdown (specimen already selected via rail).

**Affected only checkbox** (subject mode only) — `<label>` with checkbox + "Affected only" text. Filters subjects to those with at least one finding. Resets to unchecked on specimen change via `useEffect` keyed to `specimen`.

**Severity / Incidence segmented control** (group mode only) — two `rounded-full` pills matching the Group/Subject pattern. Default: "Severity". In incidence mode: cell values show `{pct}%`, cell colors use `getNeutralHeatColor01(incidence)` from `severity-colors.ts` (0-1 scale), header reads "Incidence heatmap", legend shows incidence ranges (1-19%, 20-39%, 40-59%, 60-79%, 80-100%).

**Group / Subject segmented control** — right-aligned `ml-auto`, two `rounded-full` pills:
- Active: `bg-foreground text-background`
- Inactive: `text-muted-foreground hover:bg-accent/50`
- Default: "Group" mode. "Subject" mode fetches per-subject data on demand via `useHistopathSubjects`.

The filter bar applies to both modes (sex filter + min severity both affect subject and group heatmaps).

### Subject-Level Heatmap (subject mode)

Shown when `matrixMode === "subject"`. Fetches individual subject data via `useHistopathSubjects(studyId, specimen)`. Container: `border-b p-4`. Accepts `affectedOnly` prop — when true, filters subjects to those with `Object.keys(findings).length > 0`.

**Structure:** Three-tier header:
1. **Dose group headers** — horizontal bar above each dose group with colored indicator stripe (`getDoseGroupColor(doseLevel)`), label "({N})" subjects.
2. **Subject IDs** — one column per subject (`w-8`), showing last 4 chars of `usubjid` via `shortId()`. Clickable — highlights column and fires `onSubjectClick`.
3. **Sex indicator row** (hidden when sex filter active) — "M"/"F" per subject, colored `text-blue-600`/`text-red-600`.
4. **Examined row** — "E" if subject has any findings, empty otherwise. `bg-muted/20`.

**Data rows:** One per finding (sorted by max severity desc, filtered by `minSeverity`). Each cell (`w-8 h-6`):
- Severity > 0: colored block (`h-5 w-6 rounded-sm`) with severity number, color from `getNeutralHeatColor(sevNum)`
- Entry with severity 0: em dash
- No entry: empty cell

Selected subject column highlighted with `bg-blue-50/50`.

**Legend:** 5 severity labels with numeric prefixes: "1 Minimal", "2 Mild", "3 Moderate", "4 Marked", "5 Severe" + "— = examined, no finding".

**Loading/empty states:**
- Loading: spinner + "Loading subject data..."
- No subjects: "Subject-level data not available for this specimen."
- No findings after filter: "No findings match the current severity filter."

### Group-Level Heatmap (group mode)

Only shown when `matrixMode === "group"` and `heatmapData` exists and findings.length > 0. Container: `border-b p-4`.

Section header: flex row with heatmap title + dose consistency badge.
- Title: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Severity heatmap ({N} findings)"
- Dose consistency badge: `text-[10px] text-muted-foreground` — "Dose consistency: {Weak|Moderate|Strong}". Computed by `getDoseConsistency()` which checks incidence monotonicity across dose levels.

**Structure:** `overflow-x-auto` > `inline-block` — horizontal scrollable flex layout.

**Header row:** Finding label column `w-52 shrink-0` + dose columns each `w-20 shrink-0 text-center text-[10px] font-medium text-muted-foreground`.

**Data rows:** No finding cap (specimens typically have 1-11 findings each).
- Each `flex cursor-pointer border-t hover:bg-accent/20`, selected: `ring-1 ring-primary`
- Finding label: `w-52 shrink-0 truncate py-1 pr-2 text-[10px]`, truncated at 40 chars
- Cells: `flex h-6 w-20 shrink-0 items-center justify-center` with neutral heat color or gray placeholder

**Neutral heat color scale:** `getNeutralHeatColor()` — grayscale from `#E5E7EB` (minimal) through `#4B5563` (severe).

**Legend:** 5 color swatches with labels (Minimal, Mild, Moderate, Marked, Severe).

### Lesion Severity Grid (collapsible)

Wrapped in a `<details>` element, **collapsed by default**. Summary label: "Details ({N} rows)" with a rotate-on-open chevron indicator.

TanStack React Table, `text-xs`, client-side sorting with column resizing. Scoped to selected specimen (no specimen column needed).

Table width is set to `table.getCenterTotalSize()` with `tableLayout: "fixed"` for resize support. Column resizing enabled via `enableColumnResizing: true` and `columnResizeMode: "onChange"`. Each header has a resize handle (`absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize`). Cell widths use `header.getSize()` / `cell.column.getSize()`.

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| finding | Finding | Truncated at 25 chars with ellipsis, `title` tooltip |
| domain | Domain | Plain text |
| dose_level | Dose | `text-muted-foreground`, shows `dose_label.split(",")[0]` |
| sex | Sex | Plain text |
| n | N | Plain number |
| affected | Affected | Plain number |
| incidence | Incidence | `font-mono`, percentage |
| avg_severity | Avg sev | `font-mono text-[10px]`, fixed to 1 decimal |
| severity | Severity | Badge: `rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground` |

Row cap: 200 rows. Row interactions: click to select/deselect, hover highlight.

---

## Hypotheses Tab

Pathologist-oriented exploratory tools, matching the Hypotheses tab pattern from Target Organs and Dose-Response views. Provides structural consistency across analysis views.

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

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/histopathology`, shows `HistopathologyContextPanel`.

**No changes to context panel.** The `HistopathologyContextPanelWrapper` in `ContextPanel.tsx` already fetches `lesionData` and `ruleResults` via hooks and passes as props. Selection flows from `ViewSelectionContext`.

### No Selection State
- Message: "Select a finding from the heatmap or grid to view details."

### With Selection

Header: sticky, finding name (`text-sm font-semibold`) + `CollapseAllButtons`, specimen name below (`text-xs text-muted-foreground`).

Panes in order (follows design system priority: insights > stats > related > annotation > navigation):
1. **Insights** (default open) — `InsightsList` with finding-scoped rules
2. **Dose detail** (default open) — all dose-level rows for finding + specimen, sorted by dose_level then sex. Table columns: Dose, Sex, Incid., Avg Sev, Sev.
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
| Active tab | Local | `useState<EvidenceTab>` — "overview", "matrix", or "hypotheses" |
| Selection (finding) | Shared via context | `ViewSelectionContext` with `_view: "histopathology"` tag |
| Sex filter | Local | `useState<string \| null>` — for Severity Matrix tab |
| Min severity | Local | `useState<number>` — for Severity Matrix tab |
| Matrix mode | Local | `useState<"group" \| "subject">` — heatmap mode in SeverityMatrixTab (default "group") |
| Heatmap view | Local | `useState<"severity" \| "incidence">` — group heatmap coloring mode (default "severity") |
| Affected only | Local | `useState<boolean>` — filter subjects to affected only in subject mode (default false, resets on specimen change) |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state (in SeverityMatrixTab) |
| Column sizing | Local | `useState<ColumnSizingState>` — TanStack column resize state (in SeverityMatrixTab) |
| Selected subject | Local | `useState<string \| null>` — column highlight in SubjectHeatmap |
| Rail width | Local | `useResizePanel(300, 180, 500)` — resizable rail width (default 300px, range 180-500px) |
| Specimen rules | Derived | `useMemo` — rules filtered to selected specimen, shared between SpecimenHeader and OverviewTab |
| Lesion data | Server | `useLesionSeveritySummary` hook (React Query, 5min stale) |
| Subject data | Server | `useHistopathSubjects` hook (fetched on demand in subject mode only) |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |

---

## Data Flow

**Data filtering:** `deriveSpecimenSummaries()` skips rows where `specimen` is null (e.g., CL domain findings that lack a specimen value). This prevents crashes when the CL domain contributes rows without a valid specimen.

```
useLesionSeveritySummary(studyId) ──> lesionData (728 rows)
useRuleResults(studyId) ──> ruleResults (shared React Query cache)
                                |
                    deriveSpecimenSummaries() → SpecimenSummary[]
                    (skips rows with null specimen)
                                |
                        SpecimenRail (sorted by maxSeverity desc)
                                |
                    [selectedSpecimen] → filter lesionData
                                |
                    specimenData ──> specimenRules (filtered at parent)
                                |
                        deriveFindingSummaries()
                        deriveSexLabel() / getDoseConsistency()
                        deriveSpecimenConclusion()
                           /              \
                  OverviewTab          SeverityMatrixTab
                  (observed findings,  (Group / Subject toggle)
                   coherence hint,      /                    \
                   insights)      Group mode             Subject mode
                        |        (group heatmap +       (SubjectHeatmap
                        |         collapsible grid,      from useHistopath-
                        |         sex/severity filter)   Subjects on demand)
                        \              /
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
| Review-status confidence cue (full) | `useAnnotations<PathologyReview>` call, aggregate `peerReviewStatus` across specimen findings, replace static "Preliminary" with derived Preliminary/Confirmed/Adjusted | P3 |
