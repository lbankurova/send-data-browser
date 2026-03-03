# Plan: Recovery Anomaly Discrimination Framework

## Context

When a histopathology finding is absent in the main (terminal sacrifice) arm but present in recovery, the system assigns a blanket "anomaly" verdict — the highest-priority verdict, dominating all others. This conflates three distinct scenarios:

1. **Delayed onset** — Drug-initiated damage manifesting after a lag (e.g., fibrosis following necrosis, spermatogenic cycle effects). Treatment-related; potentially adverse.
2. **Spontaneous/incidental** — Background finding appearing by chance in recovery animals. Not treatment-related.
3. **True anomaly** — Cannot be classified; needs pathologist review.

The discrimination happens at the **classification level** (`recovery-classification.ts`), not the verdict level. The verdict stays "anomaly" (per-dose-group, simple check), but the classification system — which already has access to all dose groups, finding nature, HCD, and context — gets a new multi-factor discrimination step. This avoids disrupting the verdict type system (used in badges, aggregation, charts).

Brief 8 deep research will later provide a literature-backed precursor map and delayed-onset propensity table. This implementation uses first-principles logic that Brief 8 results can refine.

## Architecture decision: classification-level, not verdict-level

**Why not split the "anomaly" verdict into sub-verdicts?**
- Verdict types are consumed everywhere: badges, `worstVerdict()` aggregation, dumbbell chart, tooltip text, arrow symbols, color maps
- Adding new verdict types would require updating ~15 call sites across 8 files
- The classification system already exists for interpretive output — it's the right layer

**What changes instead:**
- Guard 2 still produces "anomaly" verdict
- The anomaly short-circuit in `classifyRecovery()` (Step 0, line 165) gets replaced with a new discrimination step that produces one of 4 sub-classifications
- The PATTERN_ANOMALY and DELAYED_ONSET_POSSIBLE steps (Steps 1-2) get consolidated into this new logic since they overlap with anomaly discrimination

## New file

### `frontend/src/lib/anomaly-discrimination.ts`

Core discrimination module. ~200 lines.

**Types:**
```typescript
type AnomalySubtype = "delayed_onset" | "delayed_onset_possible" | "possible_spontaneous" | "anomaly_unresolved";

interface AnomalyDiscrimination {
  subtype: AnomalySubtype;
  confidence: "High" | "Moderate" | "Low";
  rationale: string;
  qualifiers: string[];
  recommendedAction: string;
  evidence: {  // track what drove the decision
    doseResponseInRecovery: boolean | null;
    precursorInMain: string[] | null;
    withinHistoricalControl: boolean | null;
    singleAnimalOnly: boolean;
    findingDelayedOnsetPropensity: "high" | "moderate" | "low" | "none";
    recoverySeverity: "minimal" | "higher";
  };
}
```

**Precursor map** (first-principles, ~20 key relationships):
```typescript
const PRECURSOR_MAP: Record<string, string[]> = {
  // Degenerative sequelae
  "necrosis": ["fibrosis", "scarring", "cirrhosis"],
  "degeneration": ["necrosis", "atrophy", "fibrosis"],
  // Inflammatory -> chronic
  "inflammation": ["fibrosis", "granuloma"],
  // Proliferative cascade
  "hyperplasia": ["adenoma"],
  "hypertrophy": ["hyperplasia"],
  // Endocrine feedback
  "follicular cell hypertrophy": ["follicular cell hyperplasia", "colloid alteration"],
  // Immune reconstitution
  "lymphoid depletion": ["lymphoid hyperplasia", "extramedullary hematopoiesis"],
  "cortical atrophy": ["cortical hyperplasia"],
  // Spermatogenic cycle
  "germ cell degeneration": ["decreased spermatogenesis", "tubular atrophy"],
  // Bone marrow
  "myeloid depletion": ["extramedullary hematopoiesis", "increased cellularity"],
  "erythroid depletion": ["reticulocytosis", "extramedullary hematopoiesis"],
};
```
Matching is substring-based (lowercased), same as finding-nature keyword matching.

**Delayed-onset propensity** by finding nature:
```typescript
const DELAYED_ONSET_PROPENSITY: Record<FindingNature, "high" | "moderate" | "low" | "none"> = {
  degenerative: "high",    // fibrosis, atrophy follow initial injury
  inflammatory: "moderate", // chronic inflammation can develop post-exposure
  adaptive: "low",          // adaptive changes typically present during exposure
  vascular: "low",
  depositional: "low",
  proliferative: "none",    // neoplasia handled separately
  unknown: "low",
};
```

**Main function: `discriminateAnomaly()`**

```typescript
function discriminateAnomaly(
  assessment: RecoveryAssessment,
  allAssessments: RecoveryAssessment[],  // all findings for this specimen — for precursor check
  context: RecoveryContext,
): AnomalyDiscrimination
```

Decision logic (ordered by specificity):

1. **Precursor check** — For this finding, does ANY other finding in `allAssessments` have main-arm incidence > 0 where the other finding is a known precursor? If yes -> `delayed_onset` (High confidence if precursor is dose-related, Moderate otherwise)

2. **Dose-response in recovery arm** — Among dose groups with anomaly verdict, does recovery incidence increase with dose level? (simple: highest dose has highest recovery incidence, or Spearman rank > 0). If yes -> `delayed_onset_possible` (finding biology supports delayed onset) or `delayed_onset` (if finding nature has high delayed-onset propensity)

3. **Historical control check** — Is the maximum recovery incidence <= 1.5x HCD background rate? If yes -> `possible_spontaneous`

4. **Single-animal check** — Is total recovery affected across all anomaly doses <= 1, AND finding nature has low/none delayed-onset propensity? -> `possible_spontaneous` (Low confidence)

5. **Fallback** -> `anomaly_unresolved`

## Modified files

### `frontend/src/lib/recovery-classification.ts`

**New classification types** (add to `RecoveryClassificationType`):
- `"DELAYED_ONSET"` — strong evidence for treatment-related delayed effect
- `"POSSIBLE_SPONTANEOUS"` — pattern consistent with background variation

**Remove:** `"PATTERN_ANOMALY"` — consolidated into the new discrimination

**Keep:** `"DELAYED_ONSET_POSSIBLE"` — already exists, semantics unchanged

**Changes to `classifyRecovery()`:**
- Remove "anomaly" from `GUARD_VERDICTS` set — it no longer short-circuits to UNCLASSIFIABLE
- Add new Step 0c after proliferative check: when `assessment.overall === "anomaly"`, call `discriminateAnomaly()` and map the subtype to a classification
- Remove old Step 1 (PATTERN_ANOMALY) and Step 2 (DELAYED_ONSET_POSSIBLE) — replaced by the discrimination step
- Step 2b (ASSESSMENT_LIMITED_BY_DURATION) and beyond stay unchanged

**Mapping from subtype -> classification:**
| Subtype | Classification | Border color |
|---------|---------------|-------------|
| `delayed_onset` | `DELAYED_ONSET` | amber (same severity as INCOMPLETE_RECOVERY) |
| `delayed_onset_possible` | `DELAYED_ONSET_POSSIBLE` | amber/60 (existing) |
| `possible_spontaneous` | `POSSIBLE_SPONTANEOUS` | gray (low concern) |
| `anomaly_unresolved` | `UNCLASSIFIABLE` | gray (existing, but with updated rationale) |

**Updated display constants:**
```typescript
CLASSIFICATION_LABELS: {
  DELAYED_ONSET: "Delayed onset",
  POSSIBLE_SPONTANEOUS: "Likely spontaneous",
  // ... existing entries
}
CLASSIFICATION_BORDER: {
  DELAYED_ONSET: "border-l-2 border-l-amber-400/60",
  POSSIBLE_SPONTANEOUS: "border-l-2 border-l-gray-300/40",
}
CLASSIFICATION_PRIORITY: {
  DELAYED_ONSET: 1,           // was DELAYED_ONSET_POSSIBLE
  POSSIBLE_SPONTANEOUS: 5,    // same as INCIDENTAL
}
```

### `frontend/src/lib/recovery-assessment.ts`

**Extend `RecoveryAssessment` interface:**
```typescript
export interface RecoveryAssessment {
  finding: string;
  assessments: RecoveryDoseAssessment[];
  overall: RecoveryVerdict;
  /** Other findings with main-arm presence that are known precursors of this finding */
  mainArmPrecursors?: string[];
}
```

**In `deriveRecoveryAssessments()`:** After computing all per-finding assessments, do a cross-finding precursor scan:
- For each finding with `overall === "anomaly"`, check if any other finding has main incidence > 0 at any dose AND is in the precursor map for the anomaly finding
- Populate `mainArmPrecursors` field

### `frontend/src/components/analysis/panes/RecoveryPane.tsx`

**In `HistopathMetaSection`:**
- Pass `allAssessments` (all findings for this specimen) to `classifyRecovery()` via the context, so the discrimination step can access cross-finding data

**In `buildClassificationContext()`:**
- Add `allAssessments?: RecoveryAssessment[]` to `RecoveryContext` interface
- Pass it through from the hook data

### `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx`

- Same pattern: pass all specimen assessments into classification context

### `frontend/tests/recovery.test.ts`

New test block: "anomaly discrimination"
- Test precursor detection: necrosis in main -> fibrosis in recovery -> `delayed_onset`
- Test dose-response: recovery incidence rises with dose -> `delayed_onset_possible`
- Test HCD dismissal: recovery incidence within background -> `possible_spontaneous`
- Test single-animal: 1/5 affected, adaptive finding -> `possible_spontaneous`
- Test fallback: no discriminating evidence -> `anomaly_unresolved`
- Test that non-anomaly assessments still go through normal classification ladder

Update existing tests:
- PATTERN_ANOMALY test -> update to new classification type (DELAYED_ONSET_POSSIBLE or POSSIBLE_SPONTANEOUS depending on scenario)
- DELAYED_ONSET_POSSIBLE test -> verify it still fires for the same pattern

### `frontend/src/components/analysis/panes/IncidenceDumbbellChart.tsx`

- Update anomaly edge case label: when classification context is available, show "Delayed onset" or "Spontaneous?" instead of generic "Anomaly"
- This is a minor display change — the edge case rendering already has special handling for anomaly

## Steps

1. Create `anomaly-discrimination.ts` — types, precursor map, propensity table, `discriminateAnomaly()` function
2. Update `recovery-classification.ts` — add new types, remove anomaly from guard set, replace Steps 0/1/2 with discrimination call, update display constants
3. Update `recovery-assessment.ts` — add `mainArmPrecursors` field, cross-finding scan in `deriveRecoveryAssessments()`
4. Update `RecoveryContext` — add `allAssessments` field for cross-finding access
5. Wire through UI call sites — RecoveryPane.tsx, HistopathologyContextPanel.tsx
6. Update IncidenceDumbbellChart.tsx — anomaly label refinement
7. Add tests + update existing anomaly/PATTERN_ANOMALY tests
8. Build + full test suite

## Verification

```bash
cd C:/pg/pcc/frontend && npm run build    # TypeScript compiles
cd C:/pg/pcc/frontend && npm test         # All tests pass
```

Manual: Open PointCross histopathology view, navigate to a specimen with recovery data. If any finding triggers anomaly verdict, the recovery pane should now show a nuanced classification instead of "biologically implausible."
