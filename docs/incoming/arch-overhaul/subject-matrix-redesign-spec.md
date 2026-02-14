# Subject Matrix Redesign — Implementation Spec

**Scope:** Histopathology view, Evidence tab, severity matrix section (both group and subject modes).
**Goal:** Include all observed findings in the matrix — not just severity-graded ones — so that the matrix serves as a universal subject entry point for all findings including MA-domain (macroscopic) findings like ENLARGED, MASS, DISCOLORATION that have biological signal but no severity grade.

---

## 1. Problem

The severity matrix currently filters to findings with non-zero severity (`minSeverity` filter, and rows where no subject has severity data are omitted). Macroscopic and other non-graded findings (ENLARGED, MASS, DISCOLORATION, AREA(S) WHITE) never appear.

The subject-level matrix is the **only entry point** for drilling into individual animals. A finding like ENLARGED (33% incidence, dose-dependent, flagged "warning") is biologically meaningful but has no subject-level inspection path because the severity matrix excludes it.

## 2. Solution Summary

1. Show **all** observed findings in the matrix by default (not just severity-graded ones).
2. Render a **presence marker** (`●`) for findings where a subject has the finding but no severity grade.
3. Add a `☐ Severity graded only` filter (unchecked by default) for pathologists who want to focus on graded lesions.
4. Update the legend to explain the presence marker.
5. Apply to **both** group-level and subject-level heatmaps.

---

## 3. Data Changes

### 3.1 Finding Source

**Current:** Both heatmap modes derive their finding rows from the lesion data filtered to the selected specimen, then further filtered by `minSeverity`. Only findings where at least one dose group (group mode) or one subject (subject mode) has severity > 0 produce a row.

**New:** The finding list comes from the **observed findings table** — every finding in `deriveFindingSummaries()` for the selected specimen. This is the same list rendered in the "Observed findings" table at the top of the Evidence tab. It includes all findings regardless of whether they have severity data.

### 3.2 Finding Metadata

Each finding row needs a flag indicating whether it has any severity data at all. Derive this from existing data:

```typescript
interface MatrixFinding {
  finding: string;
  hasSeverityData: boolean; // true if ANY subject/group has severity > 0 for this finding
  maxSeverity: number;      // max across all subjects/groups (0 if no severity data)
}
```

`hasSeverityData` is used by the "Severity graded only" filter.

### 3.3 No API Changes

All needed data is already available:
- **Group mode:** `heatmapData` from `lesionData` already has all findings — just stop filtering out zero-severity rows.
- **Subject mode:** `useHistopathSubjects` returns per-subject findings. For findings without severity, subjects that have the finding will have an entry with `severity: 0` or the finding will appear in the subject's finding list. If the API doesn't currently return non-severity findings per subject, see §3.4.

### 3.4 API Check Required

**Verify:** Does `useHistopathSubjects(studyId, specimen)` return entries for findings that have zero severity (MA-domain findings like ENLARGED)?

- **If yes:** No API changes needed. The subject data already includes these findings; they were just being filtered out on the frontend.
- **If no:** The backend endpoint for subject-level histopath data needs to include all MI + MA domain findings for the specimen, not just severity-graded ones. The response shape stays the same — the `severity` field is `0` or `null` for non-graded findings.

Check the backend route that serves `useHistopathSubjects` and verify its SQL/query includes `WHERE domain IN ('MI', 'MA')` (or equivalent) rather than `WHERE severity > 0`.

---

## 4. Group-Level Heatmap Changes

### 4.1 Row List

**Current:** Findings filtered by `minSeverity`, sorted by max severity descending.

**New:** All observed findings for the specimen. Sorted by: severity-graded findings first (sorted by max severity desc), then non-graded findings (sorted alphabetically). This keeps the most informative findings at the top while adding non-graded findings at the bottom rather than interleaving.

```typescript
const sortedFindings = [...findings].sort((a, b) => {
  // Severity-graded first
  if (a.hasSeverityData && !b.hasSeverityData) return -1;
  if (!a.hasSeverityData && b.hasSeverityData) return 1;
  // Within severity-graded: by max severity desc
  if (a.hasSeverityData && b.hasSeverityData) return b.maxSeverity - a.maxSeverity;
  // Within non-graded: alphabetical
  return a.finding.localeCompare(b.finding);
});
```

### 4.2 Cell Rendering — Severity Mode

**Current:** Cells show average severity per dose group with `getNeutralHeatColor()`. Empty cell when no data.

**New:** Three cell states:

| Condition | Rendering | Style |
|---|---|---|
| Average severity > 0 | Severity number (e.g., "2.5") in heat-colored block | Existing: `getNeutralHeatColor(avgSev)` bg, `h-6 w-20` |
| Finding present in group, no severity (MA-domain) | Incidence as percentage (e.g., "27%") | `text-[10px] font-mono text-muted-foreground` in a neutral block: `bg-gray-100 rounded-sm h-5 w-12` centered in cell |
| Finding not present in group | Empty cell | Existing behavior |

Rationale: In group mode, showing incidence percentage for non-graded findings is more useful than a bare presence dot because the group-level view is about aggregate patterns. The percentage lets the pathologist see dose-response at a glance.

### 4.3 Cell Rendering — Incidence Mode

No changes needed. Incidence mode already shows percentage for all findings. Non-graded findings have incidence data (subjects examined / subjects affected). If they were previously excluded from the row list, including them now automatically makes them appear.

### 4.4 Subtitle Text

**Current:** "Cells show average severity grade per dose group." / "Cells show % animals affected per dose group."

**New (severity mode):** "Cells show average severity grade per dose group. Non-graded findings show incidence."

Incidence mode subtitle: unchanged.

---

## 5. Subject-Level Heatmap Changes

### 5.1 Row List

Same as group mode (§4.1): all observed findings, severity-graded first by max severity desc, then non-graded alphabetically.

### 5.2 Cell Rendering

**Current:** Three states — severity > 0 (colored block with number), severity 0 (em dash), no entry (empty).

**New:** Four states:

| Condition | Content | Style |
|---|---|---|
| Subject has finding, severity > 0 | Severity number | Existing: `getNeutralHeatColor(sevNum)` bg block, `h-5 w-6 rounded-sm` |
| Subject has finding, severity = 0 (graded domain, minimal) | em dash (`—`) | Existing behavior: `text-muted-foreground` |
| Subject has finding, no severity grade (non-graded domain) | `●` | `text-[10px] text-gray-400`, centered in cell. No background fill. |
| Subject examined, finding not present | empty cell | Existing behavior |
| Subject not examined | empty cell | Existing behavior (blank = not examined) |

**How to distinguish "severity 0" from "no severity grade":** This requires knowing whether the finding is from a domain that grades severity (MI) vs. one that doesn't (MA). The `hasSeverityData` flag on the `MatrixFinding` determines this:
- If `hasSeverityData === true` for the finding overall but this subject has severity 0 → em dash (examined, no finding or minimal)
- If `hasSeverityData === false` for the finding overall and subject has entry → `●` (present, not gradable)

### 5.3 Subject Click Behavior

**No changes.** Clicking a subject column header already sets `studySelection.subjectId` and opens the subject narrative in the context panel. This now works for non-graded findings too, since those findings appear as rows with `●` markers — the subject column is clickable regardless of which finding row the user is looking at.

### 5.4 Cell Click Behavior

**Current:** Clicking a cell in the subject matrix may set finding-level selection.

**New:** Same behavior. Clicking a `●` cell selects that finding, same as clicking a severity-numbered cell. The finding selection drives the dose charts above and the context panel finding-level view.

---

## 6. New Filter: "Severity Graded Only"

### 6.1 Placement

Add to the **common controls** section of the severity matrix filter bar (shared between group and subject modes), after the existing "All severities" filter:

```
Sex: [All sexes ▾]  Severities: [All ▾]  ☐ Severity graded only  ...mode-specific controls...
```

### 6.2 Control

Standard checkbox + label, matching the existing "Affected only" checkbox pattern:

```tsx
<label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
  <input
    type="checkbox"
    checked={severityGradedOnly}
    onChange={(e) => setSeverityGradedOnly(e.target.checked)}
    className="h-3 w-3 rounded border-gray-300"
  />
  Severity graded only
</label>
```

### 6.3 Default State

**Unchecked** (show all findings). This is the critical default — the matrix must surface non-graded findings by default so the pathologist sees the complete picture.

### 6.4 Behavior When Checked

Filters the matrix row list to `finding.hasSeverityData === true`. This restores the current behavior (only severity-graded findings shown).

### 6.5 Filter Summary

The `FilterShowingLine` below the filter bar includes the active state:

- Unchecked (default): no mention in summary (it's the default)
- Checked: add "Severity graded only" to the `·`-separated summary line

Example: `Showing: All groups · Both sexes · Severity graded only · Affected only`

### 6.6 State Management

```typescript
// In OverviewTab parent state, alongside existing matrix state
const [severityGradedOnly, setSeverityGradedOnly] = useState(false);
```

**Reset behavior:** Resets to `false` on specimen change (same pattern as other matrix filters).

Pass as prop to both `GroupHeatmap` and `SubjectHeatmap`.

---

## 7. Legend Update

### 7.1 Current Legend

```
Severity: □ 1 Minimal  ▪ 2 Mild  ▪ 3 Moderate  ▪ 4 Marked  ▪ 5 Severe  — = examined, no finding  blank = not examined
```

### 7.2 New Legend

```
Severity: □ 1 Minimal  ▪ 2 Mild  ▪ 3 Moderate  ▪ 4 Marked  ▪ 5 Severe  ● = present (no grade)  — = examined, no finding  blank = not examined
```

**Rendering the `●` legend item:**

```tsx
<span className="flex items-center gap-1">
  <span className="text-[10px] text-gray-400">●</span>
  <span>= present (no grade)</span>
</span>
```

Position: after the severity swatches, before the em dash item. Same `text-[10px] text-muted-foreground` styling as the other legend items.

### 7.3 Group Mode Incidence Note

In group mode (severity view), add a parenthetical to the legend or subtitle clarifying that non-graded findings show incidence percentage instead of `●`:

Subtitle: "Cells show average severity grade per dose group. Non-graded findings show incidence."

This is sufficient — no additional legend item needed for the percentage cells in group mode.

---

## 8. Section Header Update

### 8.1 Current

```
SEVERITY MATRIX: GROUP | SUBJECTS (4 findings)
```

### 8.2 New

No rename. Keep "SEVERITY MATRIX" as the section header. The severity matrix is the established term and pathologists know it. The presence of non-graded findings is explained by the legend and the "Severity graded only" filter — no need to rename the section.

Update the finding count to reflect the full list:

```
SEVERITY MATRIX: GROUP | SUBJECTS (11 findings)
```

When "Severity graded only" is checked, the count reflects the filtered list:

```
SEVERITY MATRIX: GROUP | SUBJECTS (4 of 11 findings)
```

Use the `"({filtered} of {total})"` pattern only when filtered, plain `"({total})"` when showing all. Same pattern as the observed findings table header.

---

## 9. Interaction with Existing Filters

### 9.1 Min Severity Filter

The existing "All severities" / "Severity 1+" / "2+" / "3+" filter applies to severity-graded findings only. Non-graded findings are **not affected** by min severity (they have no severity to filter by).

When both filters active:
- "Severity graded only" checked + "Severity 3+" → shows only findings with max severity ≥ 3
- "Severity graded only" unchecked + "Severity 3+" → shows findings with max severity ≥ 3 PLUS all non-graded findings

This behavior is correct: the pathologist checking "Severity 3+" is saying "show me serious graded lesions" — non-graded findings like ENLARGED are orthogonal to that filter and should remain visible unless explicitly excluded via "Severity graded only."

### 9.2 Affected Only (Subject Mode)

No changes. "Affected only" filters subjects (columns), not findings (rows). A subject is "affected" if they have any finding in the matrix — including non-graded findings. This means a subject with only ENLARGED (no graded findings) is now considered "affected" and will appear when "Affected only" is checked.

### 9.3 Finding Selection

Clicking a non-graded finding row in the matrix selects that finding, same as clicking a graded finding. The dose charts above update — the incidence chart will show data; the severity chart will show "No severity data." The context panel updates with the finding-level view.

### 9.4 Filter Summary Strip

Update the summary to include the new filter state:

```
Showing: All groups · Both sexes · Severity graded only · Affected only
```

The "Severity graded only" segment only appears when the checkbox is checked (non-default state).

---

## 10. Files to Modify

| File | Changes |
|---|---|
| `OverviewTab.tsx` (or equivalent Evidence tab container) | Add `severityGradedOnly` state. Pass full finding list (not just severity-graded) to heatmap components. Pass filter as prop. Update finding count in section header. |
| Group heatmap component | Accept all findings. Render incidence percentage for non-graded findings in severity mode. Update sort order. |
| `SubjectHeatmap.tsx` | Accept all findings. Render `●` for non-graded finding presence. Update sort order. Distinguish "severity 0" from "no grade" using `hasSeverityData`. |
| Legend component (if separate) or inline legend | Add `●` legend item. |
| Filter bar for matrix section | Add "Severity graded only" checkbox to common controls. |
| Filter summary strip | Include "Severity graded only" in summary when active. |
| Backend endpoint (if needed) | Verify `useHistopathSubjects` returns non-graded findings. If not, update query to include MA-domain findings. |

---

## 11. Verification Checklist

### Data
- [ ] All 11 observed findings for liver appear in the matrix (not just 4 severity-graded ones)
- [ ] ENLARGED, MASS, DISCOLORATION, AREA(S) WHITE, MISSHAPEN, HEPATOCELLULAR CARCINOMA, ADENOMA HEPATOCELLULAR appear as rows
- [ ] Non-graded findings appear below severity-graded findings in the matrix
- [ ] Finding count in section header shows 11 (or actual total), not 4

### Group Mode
- [ ] Severity mode: graded findings show severity numbers with heat color; non-graded findings show incidence percentages
- [ ] Incidence mode: all findings show incidence percentages (no change in behavior, just more rows)
- [ ] Subtitle updated for severity mode

### Subject Mode
- [ ] `●` marker appears for subjects who have a non-graded finding
- [ ] Severity numbers still appear correctly for graded findings
- [ ] Em dash still appears for graded findings with severity 0
- [ ] Empty cells for subjects without the finding
- [ ] Clicking a subject column on a `●` row opens the subject narrative in context panel

### New Filter
- [ ] "Severity graded only" checkbox appears in filter bar (both modes)
- [ ] Unchecked by default
- [ ] When checked: matrix shows only severity-graded findings (restores current behavior)
- [ ] When unchecked: matrix shows all findings
- [ ] Resets to unchecked on specimen change
- [ ] Filter summary shows "Severity graded only" when checked

### Legend
- [ ] `●` = present (no grade) appears in legend
- [ ] Legend renders correctly in both group and subject modes

### Interactions
- [ ] Clicking a non-graded finding row selects that finding
- [ ] Dose charts update: incidence chart shows data, severity chart shows "No severity data"
- [ ] Context panel updates with finding-level view for non-graded finding
- [ ] Min severity filter does NOT hide non-graded findings
- [ ] "Affected only" includes subjects with only non-graded findings

### No Regressions
- [ ] Severity-graded findings render identically to current behavior
- [ ] Subject click → context panel subject narrative still works
- [ ] Sex filter still works
- [ ] Dose group filter (subject mode) still works
- [ ] Sort modes still work
- [ ] Recovery arm display still works
