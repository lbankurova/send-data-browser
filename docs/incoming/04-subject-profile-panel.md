# Subject Profile Context Panel

## What this does

Adds a "Subject Profile" mode to the context panel that shows a cross-domain summary for a single animal. Triggered when a subject line is clicked in the spaghetti plot (spec 03) or from any future subject-selection interaction. Answers: "What happened to THIS animal across all domains over time?"

When a toxicologist sees an outlier on the spaghetti plot, the immediate question is: did this animal also have abnormal clinical signs? What did its histopath show? Was it sacrificed early? The subject profile answers all of this without leaving the current view.

## User workflow

1. User clicks a subject line in the spaghetti plot (spec 03) or selects a subject from any future subject-selection UI
2. Context panel transitions to **Subject Profile** mode
3. Header shows: USUBJID, sex, dose group, disposition
4. Panes show cross-domain data for that single animal:
   - **Demographics** (always expanded): key metadata
   - **Measurements** (expanded): BW trajectory sparkline + LB values at each timepoint
   - **Clinical observations** (expanded if non-NORMAL findings exist, otherwise collapsed): CL findings timeline
   - **Histopathology** (expanded if findings exist): MI findings with severity
   - **Macroscopic** (collapsed): MA findings
5. Back button (`<`) returns to the endpoint-mode context panel

## Data model

### Input

Consumed from `GET /api/studies/{study_id}/subjects/{usubjid}/profile` (defined in spec 01).

### Frontend hook

```typescript
// hooks/useSubjectProfile.ts
function useSubjectProfile(studyId: string, usubjid: string | null) => UseQueryResult<SubjectProfile>
```

React Query key: `["subject-profile", studyId, usubjid]`. Enabled only when `usubjid` is non-null.

### TypeScript types

```typescript
// types/subject-profile.ts
interface SubjectProfile {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  arm_code: string;
  disposition: string;
  disposition_day: number | null;
  domains: {
    BW?: { measurements: SubjectMeasurement[] };
    LB?: { measurements: SubjectMeasurement[] };
    OM?: { measurements: SubjectMeasurement[] };
    CL?: { observations: SubjectObservation[] };
    MI?: { findings: SubjectFinding[] };
    MA?: { findings: SubjectFinding[] };
  };
}

interface SubjectMeasurement {
  day: number;
  test_code: string;
  value: number;
  unit: string;
}

interface SubjectObservation {
  day: number;
  finding: string;
  category: string;
}

interface SubjectFinding {
  specimen: string;
  finding: string;
  severity?: string;
}
```

## UI specification

### Location

Right-side context panel (280px), replacing the current endpoint-mode content when a subject is selected. Uses the existing context panel mode-switching pattern from the Validation view (back/forward navigation with `<` / `>` buttons).

### Header

`border-b px-4 py-3`

**Navigation row:** `flex items-center gap-2`
- Back button: `<` icon button, returns to endpoint-mode context panel
- USUBJID: `text-sm font-semibold font-mono`

**Metadata row:** `mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]`
- Sex: `text-muted-foreground` label + value (colored: `#1565C0` M, `#C62828` F)
- Dose: `text-muted-foreground` label + dose label in `font-mono`
- Disposition: `text-muted-foreground` label + value
- Disposition day: `text-muted-foreground` label + value in `font-mono` (if available)

### Pane 1: Measurements (CollapsiblePane, default open)

**BW sparkline** (if BW data exists):
- Label: "Body weight" — `text-[11px] font-medium`
- Sparkline: 60px tall inline SVG, x = day, y = value. Line in dose-group color, strokeWidth 1.5. No axes, no grid — just the shape.
- Value annotation: start and end values shown as `font-mono text-[10px]` at left and right edges. Unit shown once.

**LB table** (if LB data exists):
- Compact table: 3 columns (Test, Day, Value)
- Header: `text-[10px] font-medium uppercase tracking-wider text-muted-foreground`
- Rows: `text-[11px]`, test code in plain text, day in `font-mono`, value in `font-mono` with unit
- Grouped by test code, sorted by day within each test
- If many tests: show first 10, then "{N} more..." expandable link
- Highlight abnormal values: values that fall outside the control group mean ± 2 SD for that test are shown in `text-red-600 font-medium` (requires group statistics from the timecourse endpoint)

### Pane 2: Clinical observations (CollapsiblePane, auto-expand if non-NORMAL findings)

- Timeline: vertical list sorted by day
- Each entry: `flex gap-2 text-[11px] border-b border-dashed py-1`
  - Day: `shrink-0 w-10 font-mono text-muted-foreground` — "Day {N}"
  - Finding: plain text. "NORMAL" in `text-muted-foreground`. Non-normal findings in `font-medium`
- If all NORMAL: collapsed with summary "All observations normal ({N} days)"
- Non-NORMAL entries highlighted: `bg-amber-50 rounded px-1` (subtle)

### Pane 3: Histopathology (CollapsiblePane, auto-expand if findings exist)

- Compact table of MI findings for this subject
- Columns: Specimen, Finding, Severity
- Header: `text-[10px] font-medium uppercase tracking-wider text-muted-foreground`
- Rows: `text-[11px]`
  - Specimen: plain text, truncated at 25 chars with tooltip
  - Finding: plain text. "NORMAL"/"UNREMARKABLE" in `text-muted-foreground`, others in `font-medium`
  - Severity: severity-colored text (from `getNeutralHeatColor` or just semantic badge) if present, em dash if absent
- Sort: severity desc (show worst findings first)

### Pane 4: Macroscopic (CollapsiblePane, default collapsed)

Same pattern as Histopathology pane but for MA domain findings.

### Empty states

| State | Display |
|-------|---------|
| Loading | Centered spinner with "Loading subject profile..." |
| No subject selected | This mode is never shown without a subject — back button returns to endpoint mode |
| Domain has no data | Pane not rendered (silently omitted, not shown as empty) |
| All CL NORMAL | Pane collapsed with summary line |
| All MI UNREMARKABLE | Pane collapsed with summary: "No notable microscopic findings" |

## Integration points

- **Spec 01**: `GET /api/studies/{id}/subjects/{usubjid}/profile` — data source
- **Spec 03**: Spaghetti plot subject click — trigger for this panel
- **`docs/systems/navigation-and-layout.md`**: New context panel mode for subject profile
- **`frontend/src/components/panels/ContextPanel.tsx`**: Route-independent mode — activated by subject selection regardless of which view is active
- **`frontend/src/contexts/ViewSelectionContext.tsx`**: Needs `selectedSubject?: string` field

## Acceptance criteria

- When a subject line is clicked in the spaghetti plot, the context panel shows the Subject Profile for that USUBJID
- The header shows USUBJID (mono), sex (colored), dose group, disposition
- BW sparkline renders the animal's weight trajectory
- LB values table shows all measurements for that subject, grouped by test code
- Clinical observations timeline shows non-NORMAL findings prominently
- Histopathology pane lists MI findings sorted by severity
- Back button returns to the endpoint-mode context panel
- Data loads via React Query with caching (subsequent views of the same subject are instant)
- Panes auto-expand/collapse based on whether non-normal data exists

## Datagrok notes

In production, the subject profile is a Custom Info Panel (Pattern #7) that reacts to the currently selected row in any DataFrame containing a USUBJID column. The panel reads from multiple DataFrames (BW, LB, CL, MI, MA) using `grok.data.query()` or direct DataFrame filtering. The Datagrok property panel's accordion (Pattern #8) handles the pane structure natively. The BW sparkline uses a Sparkline viewer (`DG.Viewer.sparklines()`).

## Open questions

1. Should the subject profile be accessible from ALL views (not just Dose-Response spaghetti plot)? Recommend: yes, eventually. Start with Dose-Response only, then extend. The context panel component should be view-agnostic — keyed by `selectedSubject` in ViewSelectionContext.
2. Should we show the subject's position relative to the group in the measurements pane (e.g., "ALT: 38 U/L — 1.2 SD above group mean")? Recommend: yes, this is highly informative but requires the group statistics. Defer to second iteration.
3. How to handle recovery arm subjects who have additional post-recovery measurements? Recommend: show all measurements with a visual divider at the recovery start point. The disposition field already indicates recovery.
