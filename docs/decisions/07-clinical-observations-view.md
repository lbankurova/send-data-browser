# Clinical Observations Timecourse View

## What this does

New analysis view for the CL (Clinical Observations) domain. Shows when clinical signs emerge, whether they're dose-related, and how their frequency changes over time. Answers: "When did clinical signs appear, and are they treatment-related?"

Clinical observations are the first visible indicator of toxicity — study technicians record them daily or weekly. They're qualitative (not numeric), so they can't go on the dose-response line charts. The Certara sendexplorer handles this with grouped bar charts showing observation counts per study day, faceted by sex, colored by dose group.

Currently our app has CL data in the browsing tree (raw domain table) but no analysis visualization. The CL domain for PointCross has ~1,200+ records across 120 subjects with weekly observations. One subject (PC201708-1001) shows progression from "NORMAL" to "MOURIBUND" — exactly the kind of temporal onset pattern this view would surface.

## User workflow

1. User clicks "Clinical Observations" in the browsing tree (new tree item under Analysis Views)
2. View loads: two-panel layout (observation rail + evidence panel), same pattern as Histopathology
3. **Left rail:** Observation types sorted by total count descending. Top items are the most frequent non-NORMAL observations.
4. **Evidence panel (no selection):** Shows the **timecourse chart** — grouped bar chart of ALL observations per study day, faceted by sex (M / F side-by-side), with stacked/grouped bars colored by dose group.
5. User selects an observation type in the rail (e.g., "SALIVATION")
6. Evidence panel filters to that observation only — chart shows count of subjects with that specific finding per day per dose group
7. Context panel shows: incidence statistics, first occurrence day, dose-relationship assessment, cross-view links
8. User can compare dose groups: if salivation appears in high-dose from Day 15 onward but not in control, it's likely treatment-related

## Data model

### Input

Consumed from `GET /api/studies/{study_id}/timecourse/cl` (defined in spec 01).

### Frontend hook

```typescript
// hooks/useClinicalObservations.ts
function useClinicalObservations(studyId: string, finding?: string) => UseQueryResult<CLTimecourseResponse>
```

React Query key: `["cl-timecourse", studyId, finding]`.

### TypeScript types

```typescript
interface CLTimecourseResponse {
  findings: string[];          // unique finding values sorted by frequency
  categories: string[];         // unique CLCAT values
  timecourse: CLTimepoint[];
}

interface CLTimepoint {
  day: number;
  counts: CLGroupCount[];
}

interface CLGroupCount {
  dose_level: number;
  dose_label: string;
  sex: string;
  total_subjects: number;
  findings: Record<string, number>;  // finding → count of subjects with that finding
}

// Derived for the rail
interface ObservationSummary {
  finding: string;
  total_count: number;          // total observations across all days
  subjects_affected: number;    // unique subjects with this finding
  first_day: number;            // earliest study day observed
  last_day: number;             // latest study day observed
  dose_groups_affected: number; // number of dose groups with ≥1 occurrence
  category: string;             // CLCAT value
}
```

## UI specification

### Route

`/studies/:studyId/clinical-observations`

New route in App.tsx. New tree item in BrowsingTree: "Clinical Observations" under Analysis Views group.

### Layout

Same two-panel master-detail as Histopathology and NOAEL views:

```
+--[300px*]-+-+--------[flex-1]--------+
|            |R|                        |
| Observation|e| Evidence Panel         |
| Rail       |s| (header + chart +     |
| (sorted by |i|  timeline table)      |
| frequency) |z|                       |
+------------+-+------------------------+
```

### Observation Rail (left panel)

Container: `shrink-0 border-r` with `useResizePanel(300, 180, 500)`.

**Header:** `shrink-0 border-b px-3 py-2`
- Label: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Observations ({N})"
- Search: same pattern as Histopathology rail
- Filter checkboxes: `[ ] Exclude NORMAL` (default checked — hide NORMAL entries which dominate the list)

**Rail items:** Each observation type is a button:
- Container: `w-full text-left border-b border-border/40 px-3 py-2 transition-colors`
- Selected: `bg-blue-50/60`
- Not selected: `hover:bg-accent/30`

**Row 1:** Finding name (`text-xs font-medium`, truncated) + total count badge (`text-[10px] font-mono text-muted-foreground`)

**Row 2:** `mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground`
- Subjects affected: "{N} subjects"
- Day range: "Days {first}-{last}"
- Dose groups: "{N} groups" (dose groups with ≥1 occurrence)

**Sorting:** By `total_count` descending (most frequent observations first). NORMAL excluded by default (filter).

**Auto-select:** On load, auto-selects the top non-NORMAL observation (highest frequency).

### Evidence Panel Header

`shrink-0 border-b px-4 py-3`

**With observation selected:**
- Finding name: `text-sm font-semibold`
- Category: `text-[11px] text-muted-foreground` — e.g., "CLINICAL SIGNS"
- Summary line: `mt-1 text-xs text-foreground/80` — "{N} occurrences across {M} subjects, first observed Day {D}. {dose_text}."
  - dose_text: "Observed in all dose groups" or "Observed in high-dose only" or "Dose-related increase" (computed from count patterns)

**No selection:**
- "Select an observation to view temporal pattern." — `text-xs text-muted-foreground`

### Timecourse Chart

Container: `border-b p-4`

**Chart layout:** `flex gap-4` — one chart per sex (M / F), each `flex-1`. Same sex-faceted pattern as all other views.

**Per-sex label:** `mb-1 text-center text-[10px] font-medium`, colored by sex.

**Chart (Recharts `<BarChart>`):**
- Container: `<ResponsiveContainer width="100%" height={250}>`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- X-axis: study day values, tick fontSize 10, label "Study day"
- Y-axis: count of subjects, integer ticks, label "#Subjects"
- Bars: one `<Bar>` per dose group, grouped (not stacked). `barSize` auto-computed.
  - Fill: `getDoseGroupColor(dose_level)`
  - Corner radius: `rx={2}`
- Tooltip: custom — "Day {day} · {dose_label}: {count}/{total} subjects ({pct}%)"

**When no observation selected (all observations mode):**
- Chart shows total non-NORMAL observation count per day per dose group (aggregated across all finding types)
- Y-axis label: "Total observations"
- Subtitle above chart: `text-[11px] text-muted-foreground` — "All observations (excluding NORMAL)"

**When observation selected:**
- Chart shows count of subjects with THAT specific finding per day per dose group
- Y-axis label: "Subjects with {finding}"

### Observation Timeline Table (below chart)

`p-4`, compact table showing day-by-day detail.

**Columns:**

| Column | Header | Rendering |
|--------|--------|-----------|
| day | Day | `font-mono`, right-aligned |
| control_count | Control | "{n}/{total}" subjects, `font-mono` |
| low_count | Low | "{n}/{total}" subjects, `font-mono` |
| mid_count | Mid | "{n}/{total}" subjects, `font-mono` |
| high_count | High | "{n}/{total}" subjects, `font-mono` |
| total | Total | "{n}" total across all groups, `font-semibold` |

**Row styling:** `border-b border-dashed text-xs`. Days with zero total observations across all groups are rendered with `text-muted-foreground/50` (dim but visible).

**Column headers:** `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`. Dose group headers colored with dose-group colors (plain colored text per design system, not colored badges).

### Context Panel

Route-detected: when pathname matches `/studies/{studyId}/clinical-observations`.

**No selection:** Prompt message.

**With observation selected:**

Pane 1: **Statistics** (default open)
- Total occurrences: count across all days/groups
- Subjects affected: unique subject count
- First observed: Day N
- Last observed: Day N
- Peak day: Day N (highest count)
- Sex distribution: "M: {n}, F: {m}" or "Both sexes equally"

Pane 2: **Dose relationship** (default open)
- Dose group counts: mini table (dose group → total occurrences)
- Dose-response pattern: "Increasing with dose" / "Present in high dose only" / "No dose relationship" / "Present across all groups"
- Statistical test: Cochran-Armitage trend test p-value (if computable from the data, otherwise "—")

Pane 3: **Related views** (default closed)
- "View dose-response" → `/studies/{studyId}/dose-response`
- "View NOAEL decision" → `/studies/{studyId}/noael-decision`
- "View histopathology" → `/studies/{studyId}/histopathology`

### Empty / loading / error states

| State | Display |
|-------|---------|
| Loading | Centered spinner + "Loading clinical observations..." |
| No CL data | "No clinical observation data available for this study." |
| No non-NORMAL observations | "All clinical observations are normal. No treatment-related signs detected." (positive result — informative!) |
| Search no matches | "No observations match '{search}'." |

## Integration points

- **Spec 01**: `GET /api/studies/{id}/timecourse/cl` — data source
- **`docs/systems/navigation-and-layout.md`**: New route, new tree item, new context panel variant
- **`docs/systems/data-pipeline.md`**: CL domain already loaded; may need new generator output for pre-computed observation summaries (or compute on-demand)
- **`frontend/src/App.tsx`**: New route `/studies/:studyId/clinical-observations`
- **`frontend/src/components/panels/BrowsingTree.tsx`**: New tree item under Analysis Views
- **`frontend/src/lib/analysis-definitions.ts`**: Add to `ANALYSIS_VIEWS` array
- **`frontend/src/components/panels/ContextPanel.tsx`**: New context panel variant for CL view

## Acceptance criteria

- New "Clinical Observations" entry appears in the browsing tree under Analysis Views
- View loads with two-panel layout (observation rail + evidence panel)
- Rail shows non-NORMAL observations sorted by frequency, with subject count and day range
- Selecting an observation shows a grouped bar chart of subjects with that finding per study day, faceted by sex
- Bars are colored by dose group using the existing dose palette
- Context panel shows incidence statistics, first/last observation day, and dose relationship assessment
- "Exclude NORMAL" filter is checked by default (NORMAL entries hidden from rail)
- All-observations mode (no selection) shows aggregate non-NORMAL counts
- Timeline table below chart shows day-by-day breakdown
- Cross-view navigation links work from context panel

## Datagrok notes

In production, the bar chart is a native Datagrok Bar Chart viewer (Pattern #4) with the Trellis plot layout for sex faceting. The observation rail is the toolbox tree (Pattern #9) dynamically populated from CL domain data. The context panel is a Custom Info Panel (Pattern #7) reacting to the selected observation type. Filtering uses Datagrok's filter viewer (Pattern #5) for the "Exclude NORMAL" behavior.

## Open questions

1. Should the view include ophthalmology observations (CLCAT = "OPHTHALMOLOGY") or only clinical signs (CLCAT = "CLINICAL SIGNS")? Recommend: include both, with a category filter dropdown in the rail header. Ophthalmology findings are typically one-time (pre-dose baseline), while clinical signs are longitudinal.
2. Should we pre-compute observation summaries in the generator, or compute on-demand? Recommend: on-demand (same pattern as the temporal API). CL data is not large enough to warrant pre-computation. The on-demand endpoint from spec 01 handles this.
3. Should the view link to individual subject profiles (spec 04) from the bar chart? E.g., clicking a bar segment drills to the subjects contributing to that count. Recommend: yes in production; defer for prototype. The chart tooltip can show the USUBJIDs as text.
4. How to handle studies with no CL domain data? Recommend: tree item still visible but marked as "(no data)". View shows empty state on load. Don't hide the tree item — consistent navigation is more important than conditional visibility.
