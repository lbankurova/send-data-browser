# Subject-Level Histopathology Matrix

## What this does

Adds a "By subject" toggle to the Histopathology severity matrix that replaces dose-group summary columns with individual animal columns. Answers: "Which specific animals have this finding, and how severe is it for each?"

The current severity matrix shows group-level incidence (e.g., "3/10 affected at high dose, avg severity 2.1"). The subject-level matrix shows the individual animals behind that aggregate: Subject 1001 has MARKED severity, 1002 has MILD, 1003 has MINIMAL. This variability is critical information — a pathologist reviewing slides needs to know which animals to prioritize, and a study director assessing adversity needs to know if severity is consistent or if one animal is driving the group average.

Inspired by Certara sendexplorer's Microscopic Findings Heatmap, which shows subject-level columns grouped by dose group with color-coded severity cells.

## User workflow

1. User is on the Histopathology view with a specimen selected
2. User clicks the "Severity matrix" tab (existing)
3. Current view shows dose-group summary heatmap (unchanged)
4. User clicks the **"By subject"** toggle (new, in the filter bar area)
5. Heatmap columns change from dose groups to individual subjects, grouped under dose-group headers
6. Each cell shows the severity grade for that subject × finding combination
7. Cells are color-coded using the existing neutral heat color scale
8. Empty cells (subject examined, no finding) show a muted dash
9. "Not examined" cells (subject not in the examined set) are blank/gray
10. Clicking a subject column header selects that subject → context panel shows subject profile (spec 04)
11. Toggle back to "By group" to return to the summary view

## Data model

### Input

Consumed from `GET /api/studies/{study_id}/histopath/subjects?specimen={specimen}` (defined in spec 01).

### Frontend hook

```typescript
// hooks/useSubjectHistopath.ts
function useSubjectHistopath(studyId: string, specimen: string | null) => UseQueryResult<SubjectHistopathResponse>
```

React Query key: `["subject-histopath", studyId, specimen]`. Enabled only when specimen is non-null.

### TypeScript types

```typescript
interface SubjectHistopathResponse {
  specimen: string;
  findings: string[];
  subjects: SubjectHistopathEntry[];
}

interface SubjectHistopathEntry {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  findings: Record<string, {
    severity: string | null;
    severity_num: number;
  }>;
}
```

## UI specification

### Toggle control

Position: in the Severity Matrix filter bar, after existing sex and min-severity filters.

```
[ All sexes ▾ ] [ Min severity: any ▾ ]  ·····  [Group] [Subject]
```

Segmented control: two pills — "Group" (current default) and "Subject" (new).

Pill styling: `rounded-full px-2.5 py-1 text-[11px] font-medium` — active: `bg-foreground text-background`, inactive: `text-muted-foreground hover:bg-accent/50`.

### Subject-level heatmap

Replaces the group-summary heatmap when "Subject" mode is active.

**Structure:** `overflow-x-auto` > `inline-block` (horizontally scrollable — many subjects = wide matrix).

**Column headers (two-tier):**

Tier 1 (dose group headers): span across all subjects in that dose group.
- `text-[10px] font-semibold text-center border-b` + dose-colored left border (`border-l-2`)
- Label: dose label (e.g., "0 mg/kg/day") + subject count in parens
- Dose group color: thin top bar or left border using `getDoseGroupColor()`

Tier 2 (subject IDs): one column per subject.
- `text-[9px] font-mono text-center text-muted-foreground w-8`
- Show last 3-4 digits of USUBJID (e.g., "1001") with full ID as tooltip
- Clickable: selects subject → context panel shows subject profile
- Sorted within dose group: by USUBJID ascending

**Row headers (findings):** Same as current heatmap — finding labels at left, `w-52`.

**Cells:**
- Size: `w-8 h-6` (narrow — need to fit many subjects)
- Content: severity number (1-5) or em dash (examined, no finding) or blank (not examined)
- Color: neutral heat scale (`getNeutralHeatColor()`) — same as current heatmap
- Text: `text-[9px] font-mono text-center`
- Hover: shows tooltip "{USUBJID}: {finding} — {severity_label}" (e.g., "PC201708-1001: FAT VACUOLES — MILD")
- Selected column: `bg-blue-50/50` highlight on entire column

**Dose group separators:** `border-l-2 border-border` between dose groups for visual grouping. This is the key structural element that makes the matrix readable — without separators, 120 subject columns are an undifferentiated wall.

**Sex indicator row:** Optional row above findings showing M/F for each subject.
- `h-4` cell height, `text-[8px] font-semibold`
- M: `text-blue-600`, F: `text-red-600`
- Or: sex filter already applied (only show one sex when sex filter is active)

### "Examined" header row

Below subject IDs, a special row: `text-[9px] text-muted-foreground bg-muted/20`
- Shows "E" (examined) or blank for each subject × specimen combination
- Based on whether the subject has ANY record for this specimen in MI (including NORMAL/UNREMARKABLE)
- This matters because not all subjects are examined for all tissues (satellite groups, early deaths)

### Subject count and scroll indicator

Below the filter bar, when in Subject mode:

`text-[10px] text-muted-foreground` — "Showing {N} subjects across {M} dose groups · Scroll horizontally →"

### Edge states

| State | Display |
|-------|---------|
| Loading subject data | Spinner inline in heatmap area + existing group heatmap stays visible behind a slight opacity overlay |
| Subject data error | "Subject-level data not available for this specimen." Falls back to group mode. |
| Many subjects (> 60) | Horizontal scroll with the finding labels column sticky at left (`sticky left-0 z-10 bg-background`) |
| Sparse matrix (most cells empty) | Expected and correct — many tissue findings only affect a subset of animals. The sparse pattern is itself informative. |
| No findings for specimen | Same as current empty state: "No findings for this specimen." |

## Integration points

- **Spec 01**: `GET /api/studies/{id}/histopath/subjects?specimen={specimen}` — data source
- **Spec 04**: Subject profile context panel — triggered by clicking a subject column header
- **`docs/views/histopathology.md`**: New toggle in Severity Matrix tab, new heatmap rendering mode
- **`frontend/src/components/analysis/HistopathologyView.tsx`**: New component within SeverityMatrixTab
- **`frontend/src/lib/severity-colors.ts`**: Reuse `getNeutralHeatColor()` for cell coloring

## Acceptance criteria

- "Subject" toggle in the severity matrix switches from dose-group columns to individual subject columns
- Subjects are grouped under dose-group headers with visual separators between groups
- Each cell shows the severity grade (1-5) or dash (examined, no finding) for that subject × finding
- Cells use the existing neutral heat color scale
- Subject column headers show abbreviated USUBJID with full ID on hover
- Clicking a subject column header triggers the subject profile context panel (spec 04)
- Horizontal scrolling works smoothly with sticky finding label column
- Sex filter (existing) applies to subject mode (only show M or F subjects)
- Min severity filter (existing) applies to subject mode (hide findings below threshold)
- Toggle back to "Group" returns to the existing dose-group summary heatmap

## Datagrok notes

In production, the subject-level heatmap is a Datagrok Grid viewer (Pattern #3) with custom cell rendering (Pattern #23). The grid's native column grouping supports the dose-group tier headers. Cell colors use `grid.onCellPrepare()` with the severity gradient. Subject selection fires `df.onCurrentRowChanged` which triggers the Custom Info Panel (Pattern #7) for the subject profile.

## Open questions

1. Should the matrix include "UNREMARKABLE" / "NORMAL" findings as rows, or only abnormal findings? Recommend: show only abnormal findings by default (cleaner), with a "Show all examined" checkbox to reveal normal rows. Certara has "Exclude Unremarkable Tissues" checkbox for this.
2. How to sort subjects within a dose group — by USUBJID (default), by total finding severity (worst-first), or by sex then USUBJID? Recommend: sex then USUBJID ascending (matches Certara convention and groups sexes visually).
3. Should the "Examined" row be always visible or toggleable? Recommend: always visible in subject mode — it's critical context for interpreting empty cells. Can be collapsed to a 2px color indicator if space is tight.
