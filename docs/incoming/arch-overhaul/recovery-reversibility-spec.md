# Recovery Reversibility Assessment — Implementation Spec

**Scope:** Histopathology view — findings table (new column), context panel finding-level view (new pane), group heatmap (recovery columns), derivation logic.
**Goal:** Surface a per-finding reversibility assessment by comparing main-arm and recovery-arm data at matched dose levels. Answer the pathologist's question: "Did this finding resolve after the treatment-free recovery period?"
**Condition:** All recovery-related UI elements render only when the study has recovery arms. No recovery arms → no column, no pane, no recovery heatmap columns. The feature is invisible for studies without recovery data.

---

## 1. Problem

Recovery subjects exist in the severity matrix (`is_recovery: true`) and are systematically excluded from all incidence/severity calculations (correct — standard SEND practice). But the app never answers the question this data exists to answer: **did the finding reverse?**

The pathologist currently has to:
1. Mentally note the main-arm incidence and severity for a finding
2. Scroll the severity matrix to find the recovery group
3. Manually count recovery subjects with/without the finding
4. Compare in their head

This is exactly the kind of derivation the system should compute (P1: "System computes what it can").

## 2. Solution Summary

1. **Findings table:** Add a "Recovery" column showing a one-word reversibility assessment per finding.
2. **Context panel:** Add a "Recovery" collapsible pane in the finding-level view showing the main vs. recovery comparison with subject-level detail.
3. **Group heatmap:** Add recovery dose group columns (visually separated) so the main→recovery comparison is visible in the heatmap.
4. **Derivation:** New `deriveRecoveryAssessment()` function computes reversibility per finding per dose level.

---

## 3. Data Model

### 3.1 Study-Level Recovery Detection

```typescript
// Derived from dose group data or subject data
const studyHasRecovery: boolean = doseGroups.some(g => g.isRecovery);
```

All recovery UI is gated on this flag. When `false`, no recovery column, no recovery pane, no recovery heatmap columns render.

### 3.2 Recovery Assessment Per Finding

```typescript
interface RecoveryAssessment {
  finding: string;
  assessments: RecoveryDoseAssessment[];  // one per dose level that has both main + recovery
  overall: RecoveryVerdict;                // worst-case across dose levels
}

interface RecoveryDoseAssessment {
  doseLevel: number;
  doseGroupLabel: string;          // e.g., "200 mg/kg"
  recoveryPeriod?: string;         // e.g., "4 weeks" — derived from study design or DM domain
  main: {
    incidence: number;             // proportion 0–1
    n: number;                     // subjects examined
    affected: number;
    avgSeverity: number;
    maxSeverity: number;
  } | null;                        // null when no matched main arm
  recovery: {
    incidence: number;
    n: number;
    affected: number;
    avgSeverity: number;
    maxSeverity: number;
    subjectIds: string[];          // recovery subjects with this finding (for detail pane)
  };
  verdict: RecoveryVerdict;
}

type RecoveryVerdict =
  | 'reversed'       // finding resolved — incidence and severity both substantially decreased
  | 'reversing'      // partial resolution — clear decrease but not fully resolved
  | 'persistent'     // no meaningful change
  | 'progressing'    // worsened during recovery period
  | 'anomaly'        // finding present in recovery but NOT in main arm — delayed onset or data issue
  | 'insufficient_n' // recovery arm N too small for meaningful comparison (< 3 subjects)
  | 'not_observed'   // finding not present in main arm AND not in recovery arm (nothing to assess)
  | 'no_data';       // no recovery arm at this dose level
```

### 3.3 Derivation Logic

```typescript
const MIN_RECOVERY_N = 3; // minimum subjects for meaningful comparison

function deriveRecoveryAssessment(
  finding: string,
  mainArmData: DoseGroupFindingData[],   // from lesionData, filtered to main arms
  recoveryArmData: DoseGroupFindingData[], // from lesionData or subject data, recovery arms
): RecoveryAssessment {
  const assessments: RecoveryDoseAssessment[] = [];

  // Match main and recovery arms by dose level
  for (const main of mainArmData) {
    const recovery = recoveryArmData.find(r => r.doseLevel === main.doseLevel);
    if (!recovery) continue; // no recovery arm at this dose

    // Guard 1: recovery N too small for meaningful comparison
    if (recovery.n < MIN_RECOVERY_N) {
      assessments.push({
        doseLevel: main.doseLevel, doseGroupLabel: main.doseGroupLabel,
        main, recovery, verdict: 'insufficient_n',
      });
      continue;
    }

    // Guard 2: main arm has zero incidence
    if (main.incidence === 0) {
      if (recovery.incidence > 0) {
        // Recovery has findings where main doesn't — anomaly (delayed onset or data issue)
        assessments.push({
          doseLevel: main.doseLevel, doseGroupLabel: main.doseGroupLabel,
          main, recovery, verdict: 'anomaly',
        });
      } else {
        assessments.push({
          doseLevel: main.doseLevel, doseGroupLabel: main.doseGroupLabel,
          main, recovery, verdict: 'not_observed',
        });
      }
      continue;
    }

    // Normal comparison — both arms have data, main incidence > 0, recovery N sufficient
    const verdict = computeVerdict(main, recovery);
    assessments.push({ doseLevel: main.doseLevel, doseGroupLabel: main.doseGroupLabel, main, recovery, verdict });
  }

  // Also check for recovery dose levels with no matched main arm
  for (const recovery of recoveryArmData) {
    const hasMatch = mainArmData.some(m => m.doseLevel === recovery.doseLevel);
    if (!hasMatch) {
      assessments.push({
        doseLevel: recovery.doseLevel, doseGroupLabel: recovery.doseGroupLabel,
        main: null, recovery, verdict: 'no_data',
      });
    }
  }

  // Overall = worst verdict across dose levels (most conservative)
  const overall = worstVerdict(assessments.map(a => a.verdict));

  return { finding, assessments, overall };
}

function computeVerdict(main: ArmStats, recovery: ArmStats): RecoveryVerdict {
  // Thresholds for verdict determination
  const incidenceRatio = recovery.incidence / Math.max(main.incidence, 0.01);
  const severityRatio = recovery.avgSeverity / Math.max(main.avgSeverity, 0.01);

  // Progressing: incidence or severity increased
  if (incidenceRatio > 1.1 && recovery.affected > main.affected) return 'progressing';
  if (severityRatio > 1.2) return 'progressing';

  // Reversed: both incidence and severity substantially decreased
  if (incidenceRatio <= 0.2 && severityRatio <= 0.3) return 'reversed';
  // Also reversed if recovery incidence is 0
  if (recovery.incidence === 0) return 'reversed';

  // Reversing: clear decrease in at least one metric
  if (incidenceRatio <= 0.5 || severityRatio <= 0.5) return 'reversing';

  // Otherwise persistent
  return 'persistent';
}

// Worst = most conservative for reporting purposes
function worstVerdict(verdicts: RecoveryVerdict[]): RecoveryVerdict {
  const priority: RecoveryVerdict[] = [
    'anomaly', 'progressing', 'persistent', 'reversing', 'reversed',
    'insufficient_n', 'not_observed', 'no_data'
  ];
  for (const v of priority) {
    if (verdicts.includes(v)) return v;
  }
  return 'no_data';
}
```

**Guard rationale:**

- **Guard 1 — `insufficient_n`:** Recovery arms often have 5–10 subjects. With N=3, one subject with a finding = 33% incidence. Below N=3, ratios are meaningless. The threshold is conservative; studies with N=1 or N=2 recovery groups would produce misleading verdicts. `MIN_RECOVERY_N = 3` is the default; can be configured per study.

- **Guard 2 — `anomaly`:** If the main arm at a dose level has zero incidence for a finding but the recovery arm has non-zero incidence, this is biologically anomalous for most findings. Possible explanations: delayed-onset neoplasm (biologically real for tumors like hepatocellular carcinoma), data quality issue, or specimen mismatch. The system flags it without interpreting it — the pathologist must assess.

- **`anomaly` ranks highest in `worstVerdict`:** An anomalous finding at any dose level makes the overall verdict `anomaly`, forcing the pathologist to investigate. This is the correct conservative behavior — the system should never produce a clean `reversed` or `persistent` verdict if there's an unexplained anomaly at another dose level.

### 3.4 Data Source

**Recovery arm finding data** is already available in the subject-level heatmap data (`useHistopathSubjects` returns subjects with `is_recovery: true`). The derivation filters these by `is_recovery`, groups by dose level, and computes incidence/severity per finding.

For the findings table column, the derivation runs once per specimen when data loads. Memoize with:

```typescript
const recoveryAssessments = useMemo(() => {
  if (!studyHasRecovery || !subjectData) return null;
  return findingSummaries.map(f => deriveRecoveryAssessment(f.finding, mainData, recoveryData));
}, [subjectData, findingSummaries, studyHasRecovery]);
```

**Dependency:** This requires `useHistopathSubjects` data, which currently only loads when `matrixMode === "subject"`. For the findings table Recovery column to work without requiring the user to switch to subject mode, either:

**Option A (preferred):** Compute recovery assessments from `lesionData` (the main `useLesionSeveritySummary` hook) by adding recovery arm rows. Check if the backend already includes recovery rows in `lesionData` with an `is_recovery` flag. If not, extend the endpoint.

**Option B:** Eagerly load `useHistopathSubjects` when `studyHasRecovery` is true, regardless of matrix mode. The data is needed for the Recovery column anyway.

The agent should check which data source already contains per-dose-group per-finding aggregates for recovery arms.

---

## 4. Findings Table — Recovery Column

### 4.1 Column Definition

Add before the "Also in" column. Only rendered when `studyHasRecovery === true`.

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| recovery | Recovery | 70px (55–120) | Verdict label with directional arrow |

### 4.2 Cell Rendering

Each cell shows the **overall** verdict (worst across dose levels) for that finding:

| Verdict | Display | Style |
|---|---|---|
| `reversed` | `↓ reversed` | `text-[9px] text-muted-foreground` |
| `reversing` | `↘ reversing` | `text-[9px] text-muted-foreground` |
| `persistent` | `→ persistent` | `text-[9px] font-medium text-foreground/70` |
| `progressing` | `↑ progressing` | `text-[9px] font-medium text-foreground/70` |
| `anomaly` | `? anomaly` | `text-[9px] font-medium text-foreground/70` |
| `insufficient_n` | `— (N<3)` | `text-[9px] text-muted-foreground/50` |
| `not_observed` | `—` | `text-muted-foreground/40` |
| `no_data` | `—` | `text-muted-foreground/40` |

**Design rationale — no color:** The verdict is a derived categorical classification. Per H-004, categorical identity uses neutral gray. The directional arrow is the pre-attentive signal: `↓` = good news, `→` = neutral, `↑` = bad news, `?` = investigate. Typography (font-medium for persistent/progressing/anomaly) provides the secondary emphasis tier.

"Persistent", "progressing", and "anomaly" get `font-medium text-foreground/70` because they're the actionable findings — the pathologist needs to investigate or note these in their report. "Reversed" and "reversing" are the expected/good outcome and stay muted.

"Anomaly" uses `?` as its arrow — it's neither good nor bad, it's unexplained. The pathologist must assess whether it's a delayed-onset neoplasm (biologically real) or a data issue.

### 4.3 Tooltip

On hover, show the per-dose-level breakdown:

```
Recovery assessment:
  Group 2 (2 mg/kg): 60% → 10%, sev 2.6 → 1.0 — reversing
  Group 4 (200 mg/kg): 80% → 70%, sev 3.0 → 2.8 — persistent
  Overall: persistent (worst case)
  Recovery period: 4 weeks
```

For `anomaly` verdict at a dose level:
```
  Group 3 (20 mg/kg): 0% → 70% — ⚠ anomaly
    Finding present in recovery but not in main arm.
    May indicate delayed onset or data quality issue.
```

For `insufficient_n` verdict at a dose level:
```
  Group 2 (2 mg/kg): N=2, too few subjects for comparison
```

Tooltip format: `text-xs`, one line per dose level, overall on last line. Anomaly explanation on a second indented line.

### 4.4 Column Sorting

Sortable by verdict priority: anomaly > progressing > persistent > reversing > reversed > insufficient_n > not_observed > no_data. This puts the clinically concerning findings (anomaly, progressing, persistent) at the top when sorted descending.

---

## 5. Context Panel — Recovery Pane

### 5.1 Position

Insert after "Sex comparison" (pane 3) and before "Correlating evidence" (pane 4) in the finding-level pane order:

1. Insights
2. Dose detail
3. Sex comparison
4. **Recovery** ← new
5. Correlating evidence
6. Pathology review
7. Tox Assessment
8. Related views

### 5.2 Visibility

Only renders when:
- `studyHasRecovery === true`
- The finding has at least one dose level with both main and recovery data
- The finding is observed in the main arm (`verdict !== 'not_observed'` for at least one dose)

When hidden (no recovery data for this finding), the pane doesn't render at all — no empty state, no "no recovery data" message. The absence is invisible.

### 5.3 Pane Header

Standard `CollapsiblePane`:
```
▾ RECOVERY
```

Default: **open** (this is high-value information the pathologist needs for their report).

### 5.4 Content — One Block Per Dose Level

For each dose level with both main and recovery arms, render a comparison block. The block layout adapts based on verdict:

**Normal verdicts (reversed, reversing, persistent, progressing):**

```
Group 4, 200 mg/kg · 4 weeks recovery
┌───────────────────────────────────────────┐
│  Main arm      9/15 affected (60%)  ██▓   │  ← mini bar
│                avg sev 2.6                │
│                                           │
│  Recovery arm  1/10 affected (10%)  █     │  ← mini bar
│                avg sev 1.0                │
│                                           │
│  Assessment: Reversing                    │
│  Recovery subjects: R4101 (sev 1.0)       │
└───────────────────────────────────────────┘
```

**Anomaly verdict (recovery has findings, main doesn't):**

```
Group 3, 20 mg/kg · 4 weeks recovery
┌───────────────────────────────────────────┐
│  Main arm      0/30 affected (0%)         │
│                                           │
│  Recovery arm  7/10 affected (70%)  █████ │
│                avg sev 2.1                │
│                                           │
│  ⚠ Anomaly: finding present in recovery   │
│  but not in main arm at this dose level.  │
│  This may indicate delayed onset          │
│  (e.g., neoplasm) or a data quality       │
│  issue. Requires pathologist assessment.  │
│                                           │
│  Recovery subjects: R3001 (sev 2.0),      │
│  R3005 (sev 2.0), ...                     │
└───────────────────────────────────────────┘
```

**Insufficient N verdict:**

```
Group 2, 2 mg/kg · 4 weeks recovery
┌───────────────────────────────────────────┐
│  Recovery arm has only 2 subjects.        │
│  Minimum 3 required for meaningful        │
│  comparison. No assessment computed.      │
└───────────────────────────────────────────┘
```

### 5.5 Styling

**Dose level header:**
```tsx
<div className="mb-1 text-[10px] text-muted-foreground">
  {groupLabel} · {recoveryPeriod} recovery
</div>
```

**Arm comparison rows:**
```tsx
<div className="space-y-1.5 text-xs">
  {/* Main arm */}
  <div className="flex items-center gap-2">
    <span className="w-20 shrink-0 text-[10px] text-muted-foreground">Main arm</span>
    <span className="font-mono text-[10px]">
      {affected}/{n} ({formatPercent(incidence)})
    </span>
    <MiniBar value={incidence} className="h-1.5 w-16" />
  </div>
  <div className="pl-[88px] text-[10px] text-muted-foreground">
    avg sev {avgSeverity.toFixed(1)}
  </div>

  {/* Recovery arm */}
  <div className="flex items-center gap-2">
    <span className="w-20 shrink-0 text-[10px] text-muted-foreground">Recovery arm</span>
    <span className="font-mono text-[10px]">
      {affected}/{n} ({formatPercent(incidence)})
    </span>
    <MiniBar value={incidence} className="h-1.5 w-16" />
  </div>
  <div className="pl-[88px] text-[10px] text-muted-foreground">
    avg sev {avgSeverity.toFixed(1)}
  </div>
</div>
```

**Mini incidence bar:** Same pattern as dose detail pane — `h-1.5 rounded-full` horizontal bar, neutral gray (`bg-gray-100` track, `bg-gray-400` fill), width proportional to incidence. Both bars share the same scale (0–100%) so visual comparison is instant.

**Assessment line:**
```tsx
<div className="mt-1.5 text-[10px]">
  <span className="text-muted-foreground">Assessment: </span>
  <span className="font-medium">{verdict}</span>
</div>
```

No color on the verdict text — `font-medium text-foreground` is sufficient. Consistent with the findings table column treatment.

**Anomaly assessment block:**
```tsx
{verdict === 'anomaly' && (
  <div className="mt-1.5 rounded border border-border/50 bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
    <span className="font-medium text-foreground/70">⚠ Anomaly:</span> finding present in recovery
    arm but not in main arm at this dose level. This may indicate delayed onset
    (e.g., neoplasm) or a data quality issue. Requires pathologist assessment.
  </div>
)}
```

The anomaly block uses a subtle bordered container (`bg-muted/20`) to draw attention without color. The `⚠` symbol is the only non-text element — it's universally understood and doesn't introduce a color dependency.

**Insufficient N block:**
```tsx
{verdict === 'insufficient_n' && (
  <div className="mt-1.5 text-[10px] text-muted-foreground/70">
    Recovery arm has only {recovery.n} subject{recovery.n !== 1 ? 's' : ''}.
    Minimum {MIN_RECOVERY_N} required for meaningful comparison. No assessment computed.
  </div>
)}
```

**Recovery subjects list:**
```tsx
<div className="mt-1 text-[10px] text-muted-foreground">
  Recovery subjects: {subjects.map(s => (
    <button
      key={s.id}
      className="text-primary hover:underline"
      onClick={() => onSubjectClick(s.id)}
    >
      {shortId(s.id)}
    </button>
  )).reduce((acc, el, i) => [...acc, i > 0 ? ', ' : '', el], [])}
  {affected > 0 && subjects.map(s => (
    <span key={s.id} className="text-muted-foreground"> (sev {s.severity.toFixed(1)})</span>
  ))}
</div>
```

Subject IDs are clickable — clicking sets `selectedSubject` and opens the subject narrative in the context panel (same as clicking a subject column in the severity matrix). The pathologist can inspect recovery subjects from here without scrolling the matrix.

When zero recovery subjects have the finding (fully reversed), show:
```
Recovery subjects: none affected (0/10 examined)
```

### 5.6 Multiple Dose Levels

When multiple dose levels have recovery data, show one block per dose level separated by a `border-b` divider. Sort by dose level ascending (low → high dose).

Typical studies have recovery arms at the high dose and control only (2 blocks max), but the layout handles any number.

---

## 6. Group Heatmap — Recovery Columns

### 6.1 Current State

The group heatmap shows one column per main-arm dose group. Recovery groups are not shown.

### 6.2 Change

When `studyHasRecovery`, add recovery dose group columns to the right of the main-arm columns, visually separated.

```
Finding        | Control | 2 mg/kg | 20 mg/kg | 200 mg/kg ║ Control(R) | 200 mg/kg(R) |
HYPERTROPHY    |         |   2.0   |   2.0    |    2.5    ║            |     1.0      |
VACUOLIZATION  |         |         |          |    2.0    ║            |              |
NECROSIS       |         |         |   2.0    |    2.0    ║            |     2.0      |
```

### 6.3 Visual Separator

Between the last main-arm column and the first recovery column, render a heavier divider:

```tsx
{/* After last main-arm column, before first recovery column */}
<div className="mx-0.5 w-px self-stretch bg-border" />  {/* thin vertical line */}
```

Add a spanning header above the recovery columns:

```tsx
<div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
  Recovery
</div>
```

### 6.4 Recovery Column Headers

Same format as main columns but with `(R)` suffix: `"200 mg/kg (R)"`. Header text in `text-muted-foreground/60` (slightly more muted than main columns) to visually de-emphasize while keeping readable.

### 6.5 Cell Rendering

Recovery cells adapt based on the relationship between main and recovery data at each dose level:

| Condition | Cell content | Style |
|---|---|---|
| Main incidence > 0, recovery has data | Normal heat-colored cell | `getNeutralHeatColor()` / `getNeutralHeatColor01()` — same as main-arm cells |
| Main incidence = 0, recovery incidence > 0 | `⚠` | `text-[10px] text-muted-foreground/50`, centered. Tooltip: "Finding present in recovery but not in main arm — anomaly" |
| Main incidence = 0, recovery incidence = 0 | Empty | No cell content (nothing to compare) |
| Recovery N < MIN_RECOVERY_N | `—` | `text-[10px] text-muted-foreground/30`. Tooltip: "Recovery N={n}, too few for comparison" |
| No main arm match (recovery dose level has no corresponding main arm) | `—` | `text-[10px] text-muted-foreground/30` |

**Suppression rationale:** Showing a heat-colored recovery cell when the main-arm cell is empty (0% incidence) creates a misleading visual — the pathologist sees color in recovery but not in main and reads it as "the finding appeared after treatment stopped," which may be a data generator artifact or a real delayed-onset effect. The `⚠` marker flags this for investigation without asserting a comparison that doesn't exist.

### 6.6 Data Source

Recovery group aggregate data for the group heatmap. Derive from the same data used for recovery assessments (§3.4). Each recovery dose group contributes one column with per-finding average severity and incidence.

---

## 7. Specimen Rail — Recovery Indicator

### 7.1 No Recovery Indicators on Rail Items

The rail items show main-arm stats (signal score, incidence, severity, dose trend). These are intentionally main-arm-only and should not be diluted by recovery data.

### 7.2 Specimen Summary Strip

When `studyHasRecovery` and the specimen has recovery data with at least one non-"reversed" finding, add a subtle indicator to the specimen summary strip:

```
LIVER  MA MI  Both sexes  1 adverse
Peak incidence: 60%  Max sev: 3.0  Dose trend: Strong  Findings: 11  Recovery: partial
                                                                       ^^^^^^^^^^^^^^^^^^^
```

The "Recovery: {overall}" metric uses the specimen-level worst verdict across all findings. Values: `reversed`, `partial`, `persistent`, `progressing`. "Partial" covers the case where some findings reversed and others didn't (most common).

Styling: `text-[10px] text-muted-foreground` — same as other metrics. No special emphasis.

---

## 8. Recovery Period Derivation

The recovery period label (e.g., "4 weeks") should be derived from study design data. Options:

**Option A (preferred):** Compute from the DM (Demographics) or TA (Trial Arms) domain:
```typescript
const recoveryPeriod = maxRecoveryDay - maxMainArmDay;
// Format as weeks if ≥7 days, otherwise days
const label = recoveryDays >= 7
  ? `${Math.round(recoveryDays / 7)} weeks`
  : `${recoveryDays} days`;
```

**Option B:** If trial arm data isn't structured enough, compute from actual body weight or clinical observation dates — find the latest observation day in recovery subjects minus the latest in main-arm subjects.

**Option C (fallback):** If neither is feasible, omit the period label and just say "Recovery arm" without specifying duration.

---

## 9. Integration with Other Specs

### 9.1 Subject Matrix Redesign Spec

The subject matrix already shows recovery subjects with `(Recovery)` labels. No changes needed from that spec. Recovery subjects participate in the multi-select comparison checkboxes (subject-comparison-spec) and can be compared against main-arm subjects.

### 9.2 Adaptive Sections Spec

The findings table Recovery column is included in the selection-aware header summary. When a finding is selected and the findings section is collapsed:

```
› OBSERVED FINDINGS (11)  ·  ▸ HYPERTROPHY 60% adverse ✓dose-dep  → persistent
                                                                    ^^^^^^^^^^^^
```

The recovery verdict appends to the finding summary with a directional arrow. Only when `studyHasRecovery`.

### 9.3 Subject Comparison Spec

Recovery subjects can be selected for comparison. The finding concordance matrix in the Compare tab naturally includes recovery subjects — the pathologist can select a main-arm subject and its matched recovery-arm subject to see the within-animal trajectory (if longitudinal biopsies exist) or the population comparison.

### 9.4 NOAEL Decision View

Reversibility is a key input to NOAEL determination but is currently absent from the NOAEL view. This spec doesn't modify the NOAEL view, but the `RecoveryAssessment` data structure is available for future integration. Flag for backlog: "Add reversibility column to NOAEL organ evidence table."

---

## 10. Files to Create / Modify

| File | Changes |
|---|---|
| New: `deriveRecoveryAssessment.ts` | Pure function: `deriveRecoveryAssessment()`, `computeVerdict()`, `worstVerdict()`. Includes `MIN_RECOVERY_N` constant, `anomaly` and `insufficient_n` guards. Unit-testable — write tests for all guard conditions. |
| New: `RecoveryPane.tsx` | Context panel collapsible pane: main vs. recovery comparison blocks, anomaly warning block, insufficient N message, clickable subject IDs. |
| `OverviewTab.tsx` | Compute `studyHasRecovery` flag. Derive `recoveryAssessments` via `useMemo`. Pass to findings table, context panel, and chart builders. |
| Findings table component | Add Recovery column definition (conditional on `studyHasRecovery`). Cell renderer with verdict arrow + label, including `? anomaly` and `— (N<3)`. Tooltip with per-dose breakdown and anomaly/insufficient explanation text. |
| `HistopathologyContextPanel.tsx` | Insert `RecoveryPane` between Sex comparison and Correlating evidence in finding-level view (conditional on `studyHasRecovery` and finding having recovery data). |
| Group heatmap component | Add recovery dose group columns with visual separator and spanning header. Cell rendering: normal heat color when valid, `⚠` for anomaly, `—` for insufficient N. |
| Specimen summary strip | Add "Recovery: {overall}" metric (conditional on `studyHasRecovery`). |
| Selection-aware header (from adaptive-sections-spec) | Append recovery verdict to finding summary in collapsed strip. |
| Backend (if needed) | Verify that `lesionData` or `useHistopathSubjects` provides sufficient data for recovery arm aggregation. If recovery arm finding aggregates aren't available, extend the data endpoint. |

---

## 11. Verification Checklist

### Gate Condition
- [ ] Study without recovery arms: no Recovery column in findings table, no Recovery pane in context panel, no recovery columns in group heatmap, no "Recovery:" in specimen summary
- [ ] Study with recovery arms: all recovery UI elements render

### Findings Table Column
- [ ] Recovery column appears after "Also in" column
- [ ] `reversed` shows `↓ reversed` in muted text
- [ ] `reversing` shows `↘ reversing` in muted text
- [ ] `persistent` shows `→ persistent` in `font-medium`
- [ ] `progressing` shows `↑ progressing` in `font-medium`
- [ ] `anomaly` shows `? anomaly` in `font-medium`
- [ ] `insufficient_n` shows `— (N<3)` in muted text
- [ ] `not_observed` and `no_data` show `—`
- [ ] No color on any verdict (neutral typography only)
- [ ] Tooltip shows per-dose-level breakdown
- [ ] Tooltip for anomaly shows explanation text
- [ ] Tooltip for insufficient_n shows N count
- [ ] Column sortable by verdict priority (anomaly > progressing > persistent > ...)

### Context Panel Recovery Pane
- [ ] Appears in finding-level view between Sex comparison and Correlating evidence
- [ ] Only renders when finding has main + recovery data at ≥1 dose level
- [ ] Shows main arm stats: affected/N (%), avg severity, mini bar
- [ ] Shows recovery arm stats: affected/N (%), avg severity, mini bar
- [ ] Mini bars share same scale for visual comparison
- [ ] Assessment verdict shown in `font-medium`
- [ ] Recovery subject IDs are clickable (open subject narrative in context panel)
- [ ] "none affected" message when finding fully reversed
- [ ] Anomaly verdict: shows bordered warning block with explanation text
- [ ] Insufficient N verdict: shows "N too small" message, no comparison rendered
- [ ] Multiple dose levels shown with `border-b` separator
- [ ] Default open

### Derivation Logic — Standard Verdicts
- [ ] Recovery incidence 0 → `reversed`
- [ ] 80%+ incidence reduction AND 70%+ severity reduction → `reversed`
- [ ] 50%+ reduction in either metric → `reversing`
- [ ] <50% reduction in both metrics → `persistent`
- [ ] Incidence or severity increased → `progressing`
- [ ] Finding not in main arm AND not in recovery → `not_observed`
- [ ] No recovery arm at dose level → `no_data`
- [ ] Overall verdict = worst across dose levels

### Derivation Logic — Guards
- [ ] Main incidence = 0, recovery incidence > 0 → `anomaly` (NOT `not_observed`)
- [ ] Main incidence = 0, recovery incidence = 0 → `not_observed`
- [ ] Recovery N < 3 → `insufficient_n` regardless of incidence values
- [ ] `insufficient_n` check runs BEFORE main incidence check (guard order matters)
- [ ] `anomaly` ranks highest in `worstVerdict` priority (above `progressing`)
- [ ] `insufficient_n` ranks below `reversed` but above `not_observed` in priority

### Group Heatmap
- [ ] Recovery columns appear to the right of main columns
- [ ] Visual separator (vertical line) between main and recovery sections
- [ ] "Recovery" spanning header above recovery columns
- [ ] Recovery column headers show dose label + `(R)` suffix
- [ ] Normal recovery cells: heat-colored, same scale as main
- [ ] Anomaly cells (main=0, recovery>0): show `⚠` marker, NOT heat-colored
- [ ] Insufficient N cells: show `—`
- [ ] Recovery columns appear in both severity and incidence modes

### Specimen Summary Strip
- [ ] "Recovery: {verdict}" metric appears when study has recovery arms
- [ ] Uses specimen-level worst verdict across all findings
- [ ] Styling matches other metrics (`text-[10px] text-muted-foreground`)

### Integration
- [ ] Collapsed findings header includes recovery verdict after other metrics
- [ ] Recovery subjects selectable for multi-subject comparison (from subject-comparison-spec)
- [ ] Recovery column doesn't break findings table layout or column resizing
- [ ] Recovery pane doesn't break context panel pane order or collapse behavior

### No Regressions
- [ ] Main-arm incidence calculations unchanged (recovery still excluded)
- [ ] Severity matrix still shows recovery subjects with `(Recovery)` labels
- [ ] Subject click in severity matrix still works for recovery subjects
- [ ] Dose charts show recovery bars per `recovery-dose-charts-spec.md` (main first, then recovery below separator)
- [ ] Rail items still show main-arm-only stats
- [ ] Findings table existing columns unchanged
