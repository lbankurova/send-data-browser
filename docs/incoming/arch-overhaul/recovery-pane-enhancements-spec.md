# Recovery Pane Enhancements

**Spec type:** Implementation — LLM-agent-ready
**Status:** ✅ Fully implemented (2026-02-15)
**Target component:** `HistopathologyContextPanel` → Recovery pane (`RecoveryPaneContent`, `RecoveryDoseBlock`)
**Depends on:** `recovery-reversibility-spec.md` (implemented), `recovery-guards-v3-spec.md` (implemented — examination-aware verdicts)
**Modifies:** `HistopathologyContextPanel.tsx` (inline components), `recovery-assessment.ts`, `CompareTab.tsx` (minor), `ViewSelectionContext.tsx` (pendingCompare), `HistopathologyView.tsx` (compare wiring)

---

## Problem

The Recovery pane in the context panel lists recovery subjects and per-dose-group stats correctly, but falls short of supporting the pathologist's actual assessment workflow in six ways:

1. **No path to comparison.** Subject IDs are listed but the pathologist cannot act on them — comparing recovery subjects against their main-arm counterparts requires manually selecting them one-by-one in the subject heatmap.
2. **Deltas are hidden behind tooltips.** Main and recovery arm incidences are shown as separate mini-bars. The pathologist mentally computes the difference. The computed delta exists in tooltip text (`buildRecoveryTooltip`) but isn't surfaced directly.
3. **No per-subject severity trajectory.** Recovery subject links show current severity only (e.g., `3111 (sev 1.0)`). Whether that animal went from grade 3 → grade 1 (genuine reversal) or was always grade 1 (incidental) is invisible.
4. **Dose blocks visually merge.** When multiple dose groups have recovery data, blocks stack with only a text label break. Subject lists and stat lines blend together at scan speed.
5. **Guard verdict blocks are under-weighted.** The `⚠` marker for anomaly conditions and guard verdicts (`not_examined`, `low_power`, `insufficient_n` from `recovery-guards-v3-spec.md`) sit inline with normal text. Surprising or incomplete data patterns get the same visual treatment as clean data.
6. **Long subject lists dominate.** Dose groups with 8+ recovery subjects create pane-dominating lists that push other dose blocks offscreen.

---

## Solution Overview

Six targeted enhancements to the existing `RecoveryPaneContent` and `RecoveryDoseBlock` components. No new panes, no new API calls. All data already available from `deriveRecoveryAssessments()` and `useHistopathSubjects`.

| Enhancement | Component | New props/state |
|---|---|---|
| E-1: Compare action links | `RecoveryDoseBlock` | `onCompareSubjects(subjectIds: string[])` callback |
| E-2: Inline deltas | `RecoveryDoseBlock` | None (derive from existing `RecoveryDoseAssessment`) |
| E-3: Severity trajectories | `RecoveryDoseBlock` | Extended `RecoverySubjectDetail` type |
| E-4: Dose block separators | `RecoveryPaneContent` | None (CSS only) |
| E-5: Guard verdict containers | `RecoveryDoseBlock` | None (conditional styling from verdict, three-tier system per `recovery-guards-v3-spec.md`) |
| E-6: Collapsible subject lists | `RecoveryDoseBlock` | `useState<boolean>` for expanded state |

---

## E-1: Compare Action Links

> **Status:** ✅ Implemented. Cross-component wiring uses `pendingCompare` in `ViewSelectionContext` rather than direct callback threading. Compare links hidden for all guard verdicts via short-circuit (guard verdicts render explanation text and return early, so subject list and compare links never mount). No MAX_COMPARISON_SUBJECTS cap applied — the backend subject-comparison endpoint has no limit.

### Behavior

Each `RecoveryDoseBlock` renders two clickable text links below its subject list:

1. **"Compare recovery subjects"** — Pre-selects all recovery subjects at that dose level into the comparison set, then switches to the Compare tab.
2. **"Compare with main arm"** — Pre-selects the recovery subjects AND the matched main-arm subjects at the same dose level, then switches to the Compare tab.

### Cross-component communication

Compare links live in the context panel; `comparisonSubjects` + `setActiveTab` live in `HistopathologyView`. They're in separate component subtrees. Communication uses `pendingCompare` / `setPendingCompare` in `ViewSelectionContext`. `HistopathologyView` watches `pendingCompare` in a `useEffect` and applies the selection.

### Subject ID resolution

`RecoveryDoseAssessment` already contains `recoverySubjects` with subject IDs. For "Compare with main arm", the block interleaves recovery and main-arm subject IDs (alternating for balanced comparison) via:

```typescript
const mainIds = allSubjects
  .filter(s => s.dose_level === a.doseLevel && !s.is_recovery)
  .map(s => s.usubjid);
// Interleave recovery/main, then deduplicate
```

### Rendering

```
[subject list]

Compare recovery subjects · Compare with main arm  (N)
```

- Container: `mt-1.5 flex items-center gap-1.5 text-[10px]`
- Links: `text-primary hover:underline cursor-pointer`
- Separator: `text-muted-foreground/30` literal `·`
- Total count shown in parentheses: `text-muted-foreground/50`
- Hidden when verdict is `anomaly`, `insufficient_n`, `not_examined`, or `low_power` (no valid comparison possible — guard verdicts short-circuit before the subject list renders)

### Interaction with existing comparison state

These links **replace** the current comparison selection — they don't merge with an existing set. This is intentional: the pathologist is asking a specific question ("show me these recovery subjects") and existing comparison context from a different dose group or earlier investigation is stale.

---

## E-2: Inline Deltas

> **Status:** ✅ Implemented. Uses examination-aware fractions via `formatRecoveryFraction()`. Inline mini bars render after each fraction value. Deltas suppressed for all four guard verdicts (`anomaly`, `insufficient_n`, `not_examined`, `low_power`).

### New rendering

Replace the two separate lines with a single comparison line that includes the delta:

```
Incidence   7/10 (70%) ██▌ → 4/10 (40%) ██   ↘ −43%
Severity    avg 3.0 → avg 2.0                 ↘ −33%
```

When `examined < n` (per `recovery-guards-v3-spec.md`), fractions use the examination-aware format from `formatRecoveryFraction()`:

```
Incidence   2/25 (8%) [of 30] ▌ → 1/8 (13%) [of 10] ▌   ↘ +63%
```

- Left side (main arm): `font-mono text-[10px] text-muted-foreground`
- Arrow `→`: `text-muted-foreground/40`
- Right side (recovery arm): `font-mono text-[10px] text-foreground`
- Delta: `ml-1 font-mono text-[10px]`
  - Decrease (negative): `text-muted-foreground` (no color — decrease is expected, not alarming)
  - Increase (positive): `font-medium text-foreground/70` (typographic weight, not color, per H-004)
  - Zero change: `text-muted-foreground/50` `"0%"`
- Verdict arrow: from existing `verdictArrow()`, positioned before the delta percentage

### Computation

```typescript
const incDelta = showDeltas && a.main.incidence > 0
  ? Math.round(((a.recovery.incidence - a.main.incidence) / a.main.incidence) * 100)
  : null;
const sevDelta = showDeltas && a.main.avgSeverity > 0
  ? Math.round(((a.recovery.avgSeverity - a.main.avgSeverity) / a.main.avgSeverity) * 100)
  : null;
```

### Mini bars

Inline mini bars after each fraction value. Max width 48px, scaled to incidence proportion.

- Main bar: `inline-block h-1.5 rounded-full bg-gray-400`
- Recovery bar: `inline-block h-1.5 rounded-full bg-gray-400/50`

### Suppression

When verdict is `anomaly`, `insufficient_n`, `not_examined`, or `low_power`, deltas are not rendered. Guard-specific explanation text displays instead (E-5).

---

## E-3: Severity Trajectories per Subject

> **Status:** ✅ Implemented. `RecoverySubjectDetail` extended with `mainArmSeverity` and `mainArmAvgSeverity`. Populated in `deriveRecoveryAssessments()` for both shared and recovery-only dose levels.

### Solution

Show the main-arm severity alongside the recovery severity for each subject link.

**Format:** `3111 (3 → 1)` where the first number is the main-arm severity and the second is the recovery severity.

When no main-arm match exists for that subject (different animals in main vs. recovery arms), show the dose-level main-arm average instead: `3111 (avg 3.0 → 1)`.

When the subject had no finding in the main arm: `3111 (— → 1)` (em dash for absent).

### Data extension

`RecoverySubjectDetail` in `recovery-assessment.ts` (inline type in `subjectDetails` array):

```typescript
{
  id: string;                          // USUBJID
  severity: number;                    // recovery arm severity
  mainArmSeverity: number | null;      // matched main-arm severity for same subject
  mainArmAvgSeverity: number;          // dose-level main-arm average (fallback)
}
```

### Rendering

- Trajectory numbers: `font-mono`
- Arrow `→`: `text-muted-foreground/40`
- When main > recovery: normal muted text (expected reversal)
- When main ≤ recovery: `font-medium` (unexpected — draws attention via weight, not color)

### Subject link click behavior

Clicking a subject ID in the recovery pane highlights that subject in the subject heatmap. **No change** — the trajectory display is additive.

---

## E-4: Dose Block Separators

> **Status:** ✅ Implemented.

### Solution

`border-t border-border/40` with `my-2` vertical spacing between sibling `RecoveryDoseBlock` elements. No separator above first block.

### Dose label enhancement

```
Group 4 (200 mg/kg) · 2 weeks recovery
```

- Dose group: `text-[11px] font-medium text-foreground`
- Separator dot: `mx-1 text-muted-foreground/30`
- Recovery period: `text-[10px] text-muted-foreground`

Recovery period derived from `recoveryDays` prop (weeks when ≥ 7 days).

---

## E-5: Guard Verdict Container Treatment

> **Status:** ✅ Implemented. Three-tier system with all four guard verdicts. Each guard verdict has visible explanation text with dynamic values. Dark mode classes included.

### Three tiers (per `recovery-guards-v3-spec.md`)

| Tier | Verdicts | Container | Dark mode |
|------|----------|-----------|-----------|
| **Data integrity** | `not_examined` | `rounded border border-red-300/20 bg-red-50/10 px-2 py-1.5` | `dark:border-red-500/15 dark:bg-red-900/5` |
| **Analytical** | `anomaly` | `rounded border border-amber-300/30 bg-amber-50/20 px-2 py-1.5` | `dark:border-amber-500/20 dark:bg-amber-900/10` |
| **Informational** | `insufficient_n`, `low_power` | `rounded border border-border/30 bg-muted/10 px-2 py-1.5` | Uses `border` and `muted` tokens (auto-adapt) |
| **Normal** | all others | No container wrapper | — |

### Explanation text per guard verdict

Each guard verdict surfaces visible explanation text inside the dose block (not tooltip-only). Two-line format:

- Line 1 (marker + summary): `text-[10px] font-medium text-foreground/70`
- Line 2 (detail + action prompt): `text-[10px] text-muted-foreground italic`

**`not_examined`:**
```
∅ Tissue not examined in recovery arm.
None of the {N} recovery subjects had this tissue evaluated. No reversibility assessment is possible.
```

**`insufficient_n`:**
```
† Insufficient sample: only {examined} recovery subject(s) examined.
Ratios with fewer than {MIN_RECOVERY_N} examined subjects are unreliable.
```

**`low_power`:**
```
~ Low statistical power.
Main-arm incidence ({X}%) too low to assess reversibility with {examined} examined recovery subjects.
Expected ≈{expected} affected; {observed} observed is not informative.
```

**`anomaly`:**
```
⚠ Anomaly: recovery incidence {X}% at a dose level where main arm had 0%.
This may indicate delayed onset or a data quality issue. Requires pathologist assessment.
```

Guard verdicts short-circuit before the subject list and compare links render — the explanation text is the only content shown for these dose blocks (below the dose label).

---

## E-6: Collapsible Subject Lists

> **Status:** ✅ Implemented.

### Solution

Collapse subject lists that exceed a threshold, with an expand toggle.

**Threshold:** Show first 4 subjects inline. If total > 4, show 4 + `"+{N} more"` expand link.

**State:** Local `useState<boolean>(false)` per `RecoveryDoseBlock`. Resets to collapsed on finding change (subject set identity change via `useEffect`).

### Interaction with E-1 (Compare actions)

The "Compare recovery subjects" and "Compare with main arm" links always operate on the **full** subject set, regardless of collapsed state. The links sit below the subject list (or below the "+N more" toggle when collapsed).

---

## Implementation Notes

### Implementation decisions (divergences from original spec)

1. **No MAX_COMPARISON_SUBJECTS cap.** The original spec called for an 8-subject cap on compare link actions. The backend comparison endpoint was updated to support unlimited subjects, so no cap is enforced. The total combined subject count is shown in parentheses after the links.

2. **Cross-component wiring via ViewSelectionContext.** Instead of direct callback threading from `RecoveryDoseBlock` → `HistopathologyView`, the compare action uses `setPendingCompare(ids)` in `ViewSelectionContext`. `HistopathologyView` watches `pendingCompare` in a `useEffect` and applies the selection. This avoids deep prop drilling across the context panel boundary.

3. **Guard verdict short-circuit.** Rather than checking `verdict !== 'anomaly'` etc. at each UI element (compare links, deltas, subject list), the `RecoveryDoseBlock` renders guard verdicts as a separate early-return branch. This is cleaner and prevents any guard-verdict content from accidentally rendering.

4. **Mini bars retained on incidence line only.** Severity line does not have mini bars (insufficient width in the 280px pane alongside examination-aware fraction text).

5. **`RecoverySubjectDetail` uses `id` not `subjectId`.** The actual field name in the implemented type is `id` (matching the pattern used elsewhere in the codebase).

### Key file locations

| Component | File | Lines (approx) |
|-----------|------|----------------|
| `RecoveryPaneContent` | `HistopathologyContextPanel.tsx` | 584–651 |
| `RecoveryDoseBlock` | `HistopathologyContextPanel.tsx` | 656–931 |
| `RecoverySubjectDetail` type | `recovery-assessment.ts` | ~51 (inline) |
| `deriveRecoveryAssessments` | `recovery-assessment.ts` | ~230–380 |
| `formatRecoveryFraction` | `recovery-assessment.ts` | ~211–216 |
| `pendingCompare` state | `ViewSelectionContext.tsx` | ~66 |
| Compare wiring | `HistopathologyView.tsx` | useEffect watching `pendingCompare` |

---

## Design System Compliance

| Rule | How this spec complies |
|---|---|
| H-004 (no color on categorical identity) | Verdict arrows and labels remain neutral typography. Guard containers use tint on the container border/background — not on the verdict text itself. Three tiers (red tint for data integrity, amber for analytical, muted for informational) encode severity of the guard condition, not the verdict category. Increase deltas use font-weight, not color. |
| H-015 (information category separation) | Recovery stats (Evidence/Context) stay in the recovery pane. Verdicts (Finding/Qualifier) stay as inline annotations. No merger of categories. |
| P-2 (reduce hypothesis cost) | Compare action links eliminate 4–8 manual clicks to set up a comparison. Inline deltas eliminate mental arithmetic. |
| P-4 (signal without noise) | Guard containers draw attention proportional to diagnostic importance. Collapsed subject lists reduce visual noise for standard cases. |

---

## Verification Checklist

### E-1: Compare Action Links
- [x] "Compare recovery subjects" link visible below subject list for non-guard dose blocks
- [x] "Compare with main arm" link visible alongside recovery link
- [x] Clicking "Compare recovery subjects" sets comparison to recovery subject IDs only
- [x] Clicking "Compare with main arm" sets comparison to recovery + main-arm subjects at matched dose level
- [x] Compare tab activates after either link click
- [x] Links hidden when verdict is `anomaly`, `insufficient_n`, `not_examined`, or `low_power`
- [x] Links operate on full subject set even when list is collapsed (E-6)

### E-2: Inline Deltas
- [x] Incidence line shows `main → recovery` with percentage change
- [x] Severity line shows `main → recovery` with percentage change
- [x] Verdict arrow appears before delta percentage
- [x] Decrease deltas use muted text (no color)
- [x] Increase deltas use `font-medium` weight
- [x] Mini bars render inline after incidence values
- [x] Recovery mini bar at 50% opacity
- [x] Delta suppressed for `anomaly`, `insufficient_n`, `not_examined`, and `low_power` verdicts
- [x] Division-by-zero guarded (main incidence = 0)
- [x] Examination-aware fractions via `formatRecoveryFraction()` when `examined < n`

### E-3: Severity Trajectories
- [x] Subject links show `shortId (main → recovery)` format
- [x] Same-subject match: shows individual main-arm severity
- [x] Different-animal design: shows `avg {n.n}` main-arm average
- [x] No main-arm finding: shows `—` em dash
- [x] `mainArmSeverity` and `mainArmAvgSeverity` populated in `deriveRecoveryAssessments`
- [x] Recovery severity ≥ main severity gets `font-medium`
- [x] Click behavior unchanged (highlights subject in heatmap)

### E-4: Dose Block Separators
- [x] `border-t border-border/40` between sibling dose blocks
- [x] No separator above first block
- [x] `my-2` vertical spacing on separator
- [x] Dose label shows group name + recovery period with dot separator
- [x] Dose label uses two-tone typography (medium for group, muted for period)

### E-5: Guard Verdict Containers
- [x] `not_examined` blocks wrapped in data-integrity container (`border-red-300/20 bg-red-50/10`)
- [x] `anomaly` blocks wrapped in analytical container (`border-amber-300/30 bg-amber-50/20`)
- [x] `insufficient_n` and `low_power` blocks wrapped in informational container (`border-border/30 bg-muted/10`)
- [x] Normal verdict blocks have no container wrapper
- [x] Explanation text visible for all four guard verdicts (not tooltip-only)
- [x] Explanation text includes dynamic values (N, incidence %, expected count)
- [x] Explanation text italic second line for detail/action prompt
- [x] Dark mode variants for data-integrity and analytical tiers

### E-6: Collapsible Subject Lists
- [x] Lists with ≤4 subjects render fully (no toggle)
- [x] Lists with >4 subjects show first 4 + "+{N} more" link
- [x] Clicking "+N more" expands to show all subjects
- [x] Clicking "Show fewer" collapses back to 4
- [x] Toggle resets to collapsed on finding change
- [x] Compare action links (E-1) always use full subject set regardless of collapsed state
