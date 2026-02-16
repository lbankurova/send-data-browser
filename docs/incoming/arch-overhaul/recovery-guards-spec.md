# Recovery Guard Logic v3 — Examination-Aware Verdicts

**Spec type:** Implementation — LLM-agent-ready
**Target:** `lib/recovery-assessment.ts` (`computeVerdict`, `deriveRecoveryAssessments`, types)
**Depends on:** `recovery-reversibility-spec.md` (v2 guards must be implemented first; this spec amends them)
**Amends:** `recovery-reversibility-spec.md` §guard logic, `recovery-dose-charts-spec.md` §bar suppression, `histopathology.md` §Recovery Assessment
**Upstream of:** `recovery-pane-enhancements-spec.md` (E-1, E-2, E-5 reference verdict types)

---

## Problem

The current verdict logic conflates "tissue not examined" with "finding absent" — both produce `recovery.incidence === 0`, and the system reports `reversed`. This is a data integrity bug, not an edge case.

**Screenshot evidence:** VACUOLIZATION in LIVER, Group 2 recovery. Main arm: 2/30 (7%) affected. Recovery arm: 0/10 (0%) affected. Verdict: **reversed**. But the pane footer reads "none affected (0/10 examined)" — meaning zero of the 10 recovery subjects had this tissue examined. The 0% incidence is an absence of data, not an absence of finding.

A secondary issue compounds this: even when the tissue *is* examined, a low main-arm incidence (7%) against a recovery sample of 10 produces an expected count of 0.7 affected. Seeing 0/10 has a ~48% probability under the null hypothesis (finding did NOT reverse). The system cannot distinguish "reversed" from "never would have appeared in this sample."

### Why "examined" and "n" are different

In SEND histopathology (MI domain), a subject is present in the dose group (`n`) but the specific tissue may not have been evaluated. Reasons include: tissue not collected, slide preparation failure, tissue autolyzed, or the pathologist did not evaluate that specific section. The MI domain records examination status per subject per tissue. The correct denominator for incidence is "subjects where the tissue was examined," not "subjects in the dose group."

The current `RecoveryDoseAssessment` stores `n` (subjects in dose group) and `affected` (subjects with finding) but not `examined` (subjects where tissue was evaluated). Incidence is computed as `affected / n`, which is wrong when `examined < n`.

---

## Solution

Two new guards and an examination-aware data model.

### New `RecoveryVerdict` values

```typescript
// BEFORE
type RecoveryVerdict =
  | "reversed" | "reversing" | "persistent" | "progressing"
  | "not_observed" | "no_data"
  | "anomaly" | "insufficient_n";  // v2 guards

// AFTER
type RecoveryVerdict =
  | "reversed" | "reversing" | "persistent" | "progressing"
  | "not_observed" | "no_data"
  | "anomaly" | "insufficient_n"   // v2 guards (unchanged)
  | "not_examined"                  // v3: tissue not examined in recovery arm
  | "low_power";                   // v3: main incidence too low for recovery N
```

### New guard chain

`computeVerdict(main, recovery, thresholds)`:

```
 0. recovery.examined === 0                         → not_examined     ← NEW v3
 1. recovery.examined < 3                           → insufficient_n   ← CHANGED: was recovery.n
 2. main.incidence === 0 && recovery.incidence > 0  → anomaly
 3. main.incidence * recovery.examined < 2          → low_power        ← NEW v3
 4. main.incidence === 0 && main.affected === 0     → not_observed
 5. recovery.incidence === 0                        → reversed
 6. Compute incidence ratio (recovery/main) and severity ratio
 7. Progressing: incidence ratio > 1.1 with more affected, OR severity ratio > 1.2
 8. Reversed: incidence ratio <= 0.2 AND severity ratio <= 0.3
 9. Reversing: incidence ratio <= 0.5 OR severity ratio <= 0.5
10. Otherwise: persistent
```

**Changes from v2:**

| Step | v2 | v3 | Reason |
|------|----|----|--------|
| 0 | — | `not_examined` guard | Tissue not evaluated → no data exists → must short-circuit before everything |
| 1 | `recovery.n < 3` | `recovery.examined < 3` | The relevant count is examined subjects, not group membership. 10 subjects with 0 examined is not "N=10", it's "N=0". |
| 3 | — | `low_power` guard | Low main incidence × small recovery N → expected count too small for meaningful comparison |

**Guard 0 (`not_examined`) rationale:** This is not a statistical concern — it's a data completeness concern. No examination happened, so no comparison is possible. It must run first because every downstream guard assumes *some* examination data exists.

**Guard 3 (`low_power`) rationale:** When `main.incidence × recovery.examined < 2`, the expected number of affected subjects in recovery is less than 2. The probability of seeing 0 affected under the null hypothesis (no reversal) is:

| Main incidence | Recovery examined | Expected affected | P(0 affected \| no reversal) |
|---------------|-------------------|-------------------|------------------------------|
| 7% | 10 | 0.7 | 48% |
| 10% | 10 | 1.0 | 37% |
| 10% | 15 | 1.5 | 22% |
| 20% | 10 | 2.0 | 13% |
| 30% | 10 | 3.0 | 5% |

At threshold = 2, P(0) ≈ 13% — low enough that 0 affected is mildly informative. Below 2, absence is uninformative. The threshold is conservative (favors flagging over false confidence).

---

## Data Model Changes

### `RecoveryArmStats` (new type, extracted from inline stats)

Currently, main and recovery stats are inline fields on `RecoveryDoseAssessment`. Extract to a shared type for clarity:

```typescript
// BEFORE (implicit, fields scattered on RecoveryDoseAssessment)
// main_incidence, main_n, main_affected, main_avgSeverity, main_maxSeverity
// recovery_incidence, recovery_n, recovery_affected, recovery_avgSeverity, recovery_maxSeverity

// AFTER
interface RecoveryArmStats {
  n: number;              // subjects in dose group
  examined: number;       // subjects where tissue was examined  ← NEW
  affected: number;       // subjects with finding present
  incidence: number;      // affected / examined (NOT affected / n)  ← CHANGED denominator
  avgSeverity: number;
  maxSeverity: number;
}

interface RecoveryDoseAssessment {
  doseLevel: number;
  doseLabel: string;
  main: RecoveryArmStats;
  recovery: RecoveryArmStats;
  verdict: RecoveryVerdict;
  recoverySubjects: RecoverySubjectDetail[];
  recoveryPeriodDays: number | null;
}
```

### Incidence denominator change

**Critical:** Incidence is now `affected / examined` (not `affected / n`). This affects:

1. `deriveRecoveryAssessments` — computation of `incidence` field
2. All display surfaces that show incidence fractions — must show `affected/examined` not `affected/n`
3. Dose chart bar values — use examination-based incidence
4. Group heatmap recovery cells — use examination-based incidence
5. Tooltip text from `buildRecoveryTooltip` — fractions use `examined` denominator

When `examined === n` (typical case), behavior is identical to v2. The change only affects studies where some subjects were not examined for a given tissue.

### Where does `examined` come from?

**Source:** The SEND MI (Microscopic Findings) domain. Each row represents one finding for one subject for one tissue. A subject is "examined" for a tissue if they have *any* MI row for that tissue (including rows with result "NORMAL" or "NAD" — No Abnormalities Detected).

**In `useHistopathSubjects` response:** Each subject record needs an `examined_tissues` field (or the existing data already encodes this via the presence of any MI row for the specimen). The implementation agent must verify:

1. Does `useHistopathSubjects` return subjects who were examined but had no findings for a specimen? (These subjects have MI rows with "NORMAL" result but no finding-specific rows.)
2. If not, is the examination status available from another source (e.g., a separate examination status field on the subject record)?

**Agent verification task (pre-implementation):**

```
Check the useHistopathSubjects hook response:
1. For a specimen with recovery subjects, count subjects with is_recovery=true
2. Check if subjects with no findings for that specimen still appear in the response
3. If they do: examined = subjects with any data for this specimen (finding or NORMAL)
4. If they don't: examined count must come from a separate field or API
5. Check if the subject record has an `examined` or `result` field that indicates examination
```

If the API doesn't currently return examination status, a backend change is needed to include it. This is the critical path dependency for this spec.

### Fallback when examination data unavailable

If the backend cannot provide examination status, use a conservative heuristic:

```typescript
// Fallback: examined = n when tissue has ANY findings in the dose group
// examined = 0 when tissue has ZERO findings AND zero subjects with examination records
// This at least catches the screenshot case (0 affected, 0 examined)
const examined = recovery.affected > 0
  ? recovery.n  // at least some were examined (they have findings)
  : recovery.hasExaminationRecords
    ? recovery.examinedCount
    : null;  // unknown — cannot determine
```

When `examined` is `null` (indeterminate), treat as `not_examined` verdict and surface: `"Examination status unknown — cannot assess reversibility."` This is safer than the current behavior of assuming all subjects were examined.

---

## Updated `computeVerdict` Implementation

```typescript
function computeVerdict(
  main: RecoveryArmStats,
  recovery: RecoveryArmStats,
  thresholds: RecoveryThresholds = DEFAULT_THRESHOLDS
): RecoveryVerdict {
  // v3 Guard 0: tissue not examined in recovery arm
  if (recovery.examined === 0) {
    return 'not_examined';
  }

  // v2 Guard 1 (AMENDED): insufficient examined subjects (was: recovery.n < 3)
  if (recovery.examined < 3) {
    return 'insufficient_n';
  }

  // v2 Guard 2: anomaly — recovery has findings where main arm had none
  if (main.incidence === 0 && main.affected === 0 && recovery.affected > 0) {
    return 'anomaly';
  }

  // v3 Guard 3: low statistical power
  if (main.incidence * recovery.examined < 2) {
    return 'low_power';
  }

  // Step 4: main arm had no findings at this dose level
  if (main.incidence === 0 && main.affected === 0) {
    return 'not_observed';
  }

  // Step 5: recovery has zero affected (tissue was examined — guard 0 passed)
  if (recovery.incidence === 0) {
    return 'reversed';
  }

  // Steps 6-10: compute ratios
  const incidenceRatio = recovery.incidence / main.incidence;
  const sevRatio = main.avgSeverity > 0
    ? recovery.avgSeverity / main.avgSeverity
    : 1;

  if (incidenceRatio > 1.1 && recovery.affected > main.affected) return 'progressing';
  if (main.avgSeverity > 0 && sevRatio > 1.2) return 'progressing';
  if (incidenceRatio <= thresholds.reversedIncidence && sevRatio <= thresholds.reversedSeverity) return 'reversed';
  if (incidenceRatio <= thresholds.reversingIncidence || sevRatio <= thresholds.reversingSeverity) return 'reversing';
  return 'persistent';
}
```

---

## Updated `verdictPriority` (for `worstVerdict`)

```typescript
function verdictPriority(verdict: RecoveryVerdict): number {
  switch (verdict) {
    case 'anomaly':        return 0;  // highest — unexplained pattern
    case 'not_examined':   return 1;  // NEW — no data is worse than bad data
    case 'low_power':      return 2;  // NEW — inconclusive
    case 'progressing':    return 3;
    case 'persistent':     return 4;
    case 'reversing':      return 5;
    case 'reversed':       return 6;
    case 'insufficient_n': return 7;
    case 'not_observed':   return 8;
    case 'no_data':        return 9;
  }
}
```

**Rationale for `not_examined` ranking:** It ranks just below `anomaly` and above `progressing` because a missing examination at any dose level means the overall verdict is fundamentally incomplete. The pathologist must know that an entire dose group's worth of recovery data is missing before they can trust the specimen-level verdict. It should never be hidden behind a clean `reversed` or `reversing` from another dose level.

**Rationale for `low_power` ranking:** It ranks between `not_examined` and `progressing` because it's less severe than missing data (the tissue *was* examined) but means the verdict is statistically meaningless. A `reversed` verdict at another dose level with sufficient power may still be informative, but the pathologist should see that one dose level's result is unreliable.

---

## Updated `verdictArrow` and Display Labels

```typescript
function verdictArrow(verdict: RecoveryVerdict): string {
  switch (verdict) {
    case 'reversed':       return '↓';
    case 'reversing':      return '↘';
    case 'persistent':     return '→';
    case 'progressing':    return '↑';
    case 'anomaly':        return '⚠';
    case 'not_examined':   return '∅';   // NEW — empty set, nothing to evaluate
    case 'low_power':      return '~';   // NEW — approximate/uncertain
    case 'insufficient_n': return '—';
    case 'not_observed':   return '—';
    case 'no_data':        return '—';
  }
}
```

### Surface rendering per verdict

| Verdict | Findings table cell | Dose chart | Group heatmap | Context panel (E-5) |
|---------|-------------------|------------|---------------|-------------------|
| `not_examined` | `∅ not examined` | No bar, `∅` marker | Suppressed cell, `∅` marker | `border-red-300/20 bg-red-50/10` container (see §Container Treatment) |
| `low_power` | `~ low power` | No bar, `†` marker | Suppressed cell, `~` marker | `border-border/30 bg-muted/10` container (same as `insufficient_n`) |
| `anomaly` | `⚠ anomaly` | No bar, `⚠` marker | Suppressed cell, `⚠` marker | `border-amber-300/30 bg-amber-50/20` container (unchanged from pane spec E-5) |
| `insufficient_n` | `— (N<3)` | No bar, `†` marker | Suppressed cell, `†` marker | `border-border/30 bg-muted/10` container |

---

## Container Treatment in Context Panel (Amends Pane Spec E-5)

The pane enhancements spec (E-5) defined two container tiers. With the new verdicts, expand to three:

| Tier | Verdicts | Container | Rationale |
|------|----------|-----------|-----------|
| **Data integrity** | `not_examined` | `rounded border border-red-300/20 bg-red-50/10 px-2 py-1.5` | Missing data is a study execution concern. Red tint (very subtle) distinguishes from amber analytical concerns. |
| **Analytical** | `anomaly` | `rounded border border-amber-300/30 bg-amber-50/20 px-2 py-1.5` | Biologically implausible pattern. Unchanged from pane spec. |
| **Informational** | `insufficient_n`, `low_power` | `rounded border border-border/30 bg-muted/10 px-2 py-1.5` | Insufficient statistical basis. Not alarming, but result is unreliable. |
| **Normal** | all others | No container | Clean data, valid comparison. |

Dark mode variants:
- Data integrity: `dark:border-red-500/15 dark:bg-red-900/5`
- Analytical: `dark:border-amber-500/20 dark:bg-amber-900/10`
- Informational: uses `border` and `muted` tokens (auto-adapt)

---

## Explanation Text per Guard Verdict

Each guard verdict surfaces visible explanation text inside the dose block (not tooltip-only, per pane spec E-5):

### `not_examined`

```
∅  Tissue not examined in recovery arm.
   None of the 10 recovery subjects had this tissue evaluated. No reversibility
   assessment is possible.
```

- Line 1: `text-[10px] font-medium text-foreground/70`
- Line 2+: `text-[10px] text-muted-foreground italic`
- The subject count (10) is dynamic from `recovery.n`.

### `low_power`

```
~  Low statistical power.
   Main-arm incidence (7%) too low to assess reversibility with 10 examined
   recovery subjects. Expected ≈0.7 affected; 0 observed is not informative.
```

- Same typography as `not_examined`.
- Values are dynamic: main incidence %, examined count, expected count (`(main.incidence * recovery.examined).toFixed(1)`), observed affected count.

### `anomaly` (unchanged from pane spec)

```
⚠  Anomaly: recovery incidence 40% at a dose level where main arm had 0%.
   This may indicate delayed onset or a data quality issue. Requires pathologist
   assessment.
```

### `insufficient_n`

```
†  Insufficient sample: only 2 recovery subjects examined.
   Ratios with fewer than 3 examined subjects are unreliable.
```

- Note: label now says "examined" not just "subjects" (aligned with the denominator change).

---

## Impact on Incidence Display Across All Surfaces

The denominator change (`affected / examined` instead of `affected / n`) affects how fractions are displayed. This is a cross-cutting concern.

### Rules

1. **When `examined === n`:** Display as before: `2/30 (7%)`. No change.
2. **When `examined < n`:** Display as `2/25 (8%) [of 30]` — the fraction uses the examined denominator, with the group size shown in muted brackets for context.
3. **When `examined === 0`:** Display as `—/10 (not examined)` — em dash for numerator, group size in denominator position, parenthetical label.

### Affected surfaces

| Surface | Current format | New format (when examined ≠ n) |
|---------|---------------|-------------------------------|
| Recovery pane incidence line | `2/30 (7%)` | `2/25 (8%) [of 30]` |
| Recovery pane inline delta (E-2) | `2/30 (7%) → 0/10 (0%)` | `2/25 (8%) [of 30] → —/10 (not examined)` |
| Dose chart tooltip | `Incidence: 7%` | `Incidence: 8% (25 examined of 30)` |
| Group heatmap cell tooltip | `7% (2/30)` | `8% (2/25 examined)` |
| `buildRecoveryTooltip` | `7% → 0%` | `8% [25 examined] → not examined [0/10]` |
| Findings table recovery cell | `↓ reversed` | `∅ not examined` (verdict change handles this) |

**Implementation note:** Create a helper `formatRecoveryFraction(affected, examined, n)`:

```typescript
function formatRecoveryFraction(affected: number, examined: number, n: number): string {
  if (examined === 0) return `—/${n} (not examined)`;
  const pct = Math.round((affected / examined) * 100);
  const fraction = `${affected}/${examined} (${pct}%)`;
  return examined < n ? `${fraction} [of ${n}]` : fraction;
}
```

---

## `deriveRecoveryAssessments` Changes

The main derivation function needs two modifications:

### 1. Compute `examined` count per arm per dose level per finding

```typescript
// Inside the per-dose-level loop:
// For each finding at each dose level, count subjects who were examined

// A subject is "examined" for a finding's tissue if they have ANY MI record
// for that specimen (including NORMAL/NAD results)
const recoveryExamined = recoverySubjectsAtDose.filter(s =>
  s.examined_tissues?.includes(finding.specimen) ?? // preferred: explicit field
  s.findings !== undefined  // fallback: has any finding data for this specimen
).length;

const mainExamined = mainSubjectsAtDose.filter(s =>
  s.examined_tissues?.includes(finding.specimen) ??
  s.findings !== undefined
).length;
```

**Agent verification task:** The implementation depends on how examination status is encoded in the `useHistopathSubjects` response. The agent must check the actual API response shape and adapt the `examined` computation. See §"Where does examined come from" above.

### 2. Pass `examined` to `computeVerdict`

```typescript
const main: RecoveryArmStats = {
  n: mainSubjectsAtDose.length,
  examined: mainExamined,            // NEW
  affected: mainAffected,
  incidence: mainExamined > 0 ? mainAffected / mainExamined : 0,  // CHANGED denominator
  avgSeverity: ...,
  maxSeverity: ...,
};

const recovery: RecoveryArmStats = {
  n: recoverySubjectsAtDose.length,
  examined: recoveryExamined,        // NEW
  affected: recoveryAffected,
  incidence: recoveryExamined > 0 ? recoveryAffected / recoveryExamined : 0,  // CHANGED
  avgSeverity: ...,
  maxSeverity: ...,
};

const verdict = computeVerdict(main, recovery, thresholds);
```

---

## `specimenRecoveryLabel` Update

The specimen-level recovery summary in the summary strip must account for new verdicts:

```typescript
function specimenRecoveryLabel(assessments: RecoveryAssessment[]): string | null {
  // ... existing logic, with additions:
  // "not examined" if ALL dose levels are not_examined → "not examined"
  // "incomplete" if ANY dose level is not_examined but others have verdicts
  // "low power" if ALL dose levels are low_power
  // Otherwise: existing logic (worst verdict)

  const verdicts = assessments.map(a => a.overall);
  const allNotExamined = verdicts.every(v => v === 'not_examined');
  const anyNotExamined = verdicts.some(v => v === 'not_examined');
  const allLowPower = verdicts.every(v => v === 'low_power' || v === 'not_examined');

  if (allNotExamined) return 'not examined';
  if (allLowPower) return 'inconclusive';
  if (anyNotExamined) return 'incomplete';
  // ... existing worst-verdict logic for remaining cases
}
```

The summary strip already conditionally shows recovery status (hidden when "reversed"). New labels "not examined", "incomplete", and "inconclusive" should always be shown (they indicate data gaps the pathologist must know about).

---

## Implementation Order

```
1. Type changes                         ← RecoveryArmStats, RecoveryVerdict union, RecoveryDoseAssessment
2. Agent verification                   ← Check useHistopathSubjects for examination status data
3. Backend change (if needed)           ← Add examined_tissues or examination count to API response
4. deriveRecoveryAssessments update     ← Compute examined counts, change incidence denominator
5. computeVerdict update                ← Add not_examined (step 0) and low_power (step 3) guards
6. verdictPriority + verdictArrow       ← Add new verdict entries
7. formatRecoveryFraction helper        ← New helper for display
8. Surface updates                      ← All surfaces that show incidence fractions or verdicts
9. specimenRecoveryLabel update         ← Handle new verdicts in specimen summary
```

Step 2 is the critical path gate. If the backend doesn't provide examination data, step 3 becomes a blocking dependency.

---

## Verification Checklist

### Data Model
- [ ] `RecoveryArmStats` type has `examined` field separate from `n`
- [ ] `RecoveryVerdict` union includes `not_examined` and `low_power`
- [ ] `RecoveryDoseAssessment` uses `RecoveryArmStats` for `main` and `recovery`
- [ ] Incidence computed as `affected / examined` (not `affected / n`)
- [ ] `examined` count correctly derived from subject examination data

### Guard Logic
- [ ] Guard 0 (`not_examined`): fires when `recovery.examined === 0`
- [ ] Guard 0 runs before all other guards
- [ ] Guard 1 (`insufficient_n`): now checks `recovery.examined < 3` (not `recovery.n`)
- [ ] Guard 3 (`low_power`): fires when `main.incidence * recovery.examined < 2`
- [ ] Guard 3 runs after anomaly check and before `not_observed`
- [ ] Screenshot case (7% main, 0/10 examined recovery) → `not_examined` verdict
- [ ] 7% main, 10 examined, 0 affected recovery → `low_power` verdict (not `reversed`)
- [ ] 30% main, 10 examined, 0 affected recovery → `reversed` verdict (power sufficient)
- [ ] Existing v2 guards (`anomaly`, `insufficient_n`) still function correctly
- [ ] Steps 5-10 (ratio computation) unchanged

### Verdict Priority
- [ ] `not_examined` priority = 1 (between anomaly and low_power)
- [ ] `low_power` priority = 2 (between not_examined and progressing)
- [ ] `worstVerdict` correctly propagates new verdicts to specimen level
- [ ] `specimenRecoveryLabel` handles all-not-examined → "not examined"
- [ ] `specimenRecoveryLabel` handles mixed-not-examined → "incomplete"
- [ ] `specimenRecoveryLabel` handles all-low-power → "inconclusive"

### Display
- [ ] `verdictArrow('not_examined')` returns `∅`
- [ ] `verdictArrow('low_power')` returns `~`
- [ ] `formatRecoveryFraction` shows `—/N (not examined)` when examined = 0
- [ ] `formatRecoveryFraction` shows `x/examined (pct%) [of n]` when examined < n
- [ ] `formatRecoveryFraction` shows `x/n (pct%)` when examined = n (no change)

### Surface Suppression
- [ ] `not_examined`: no bar in dose chart, `∅` marker with tooltip
- [ ] `not_examined`: suppressed cell in group heatmap, `∅` marker
- [ ] `not_examined`: findings table shows `∅ not examined`
- [ ] `low_power`: no bar in dose chart, `†` marker with tooltip
- [ ] `low_power`: suppressed cell in group heatmap, `~` marker
- [ ] `low_power`: findings table shows `~ low power`

### Context Panel (E-5 integration)
- [ ] `not_examined` dose blocks get data-integrity container (subtle red tint)
- [ ] `low_power` dose blocks get informational container (muted)
- [ ] Explanation text visible (not tooltip-only) for both new verdicts
- [ ] Explanation text includes dynamic values (N, incidence, expected count)
- [ ] Dark mode containers render correctly

### Regression
- [ ] Studies without recovery arms: no behavior change (all recovery UI gated on `studyHasRecovery`)
- [ ] Specimens where all recovery subjects are examined: identical to v2 behavior
- [ ] `anomaly` guard still fires correctly (recovery.incidence > 0, main = 0)
- [ ] `insufficient_n` guard still fires but now uses `examined` count
- [ ] Ratio computation (steps 6-10) unchanged for cases that reach it

---

## Implementation Overrides (2026-02-16)

Deviations from the spec that were reviewed and accepted.

### Overrides

| # | Spec text | Override | Rationale |
|---|-----------|----------|-----------|
| O1 | §Data Model: separate `RecoveryArmStats` named type | Inline object type on `RecoveryDoseAssessment.main` and `.recovery` | Same fields (`n`, `examined`, `affected`, `incidence`, `avgSeverity`, `maxSeverity`). Named type unnecessary — the inline type is only used in two places. |
| O2 | §Updated verdictArrow: `insufficient_n` returns `—` (em dash) | Returns `†` (U+2020 dagger) | Em dash is also used for `not_observed` and `no_data`, creating ambiguity. `†` is the standard statistical footnote marker and differentiates from "no data" verdicts. Aligns with dose chart and heatmap suppression markers. |
| O3 | §Where does examined come from: explicit `examined_tissues` field from API | Uses heuristic: "if any subject in dose group has any finding → all subjects examined" | Backend doesn't provide explicit examination status per tissue. Heuristic follows standard tox protocol (all collected tissues examined per protocol). Catches the screenshot case (0 findings = 0 examined) correctly. This is the spec's own "fallback when examination data unavailable" approach. |
| O4 | §specimenRecoveryLabel: `allLowPower` includes only `low_power` and `not_examined` | Also includes `insufficient_n` in the "all inconclusive" check | All three guard verdicts indicate the specimen-level assessment is unreliable; treating `insufficient_n` as "conclusive" would be misleading. |

### Enhancements beyond spec

| # | Addition | Where | Why |
|---|----------|-------|-----|
| E1 | `buildRecoveryTooltip` handles all v3 verdicts with formatted explanations | `recovery-assessment.ts:222-278` | Per-verdict tooltip text includes dynamic values (N, incidence, expected count) matching the explanation text from §Explanation Text section |
| E2 | Finding nature label in tooltip | `buildRecoveryTooltip()` | When finding nature classification is available, appends "(proliferative/adaptive/degenerative)" to help pathologist interpret verdict in context |

### Decision: examination heuristic

Spec §"Where does examined come from" identified the critical path dependency: does the API provide examination status? The API does **not** provide explicit `examined_tissues`. The implementation uses the spec's own fallback heuristic (§"Fallback when examination data unavailable"): if any subject at a dose level has any finding for the specimen → assume all subjects examined. If zero subjects have findings → `examined = 0`. This catches the primary failure mode (0 affected, 0 examined → `not_examined` verdict).
