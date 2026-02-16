# Recovery Classification — Interpretive Layer

**Spec type:** Implementation — LLM-agent-ready
**Target:** New `lib/recovery-classification.ts`, modifications to `HistopathologyContextPanel`, `HypothesesTab`
**Depends on:** `recovery-reversibility-spec.md` (mechanical verdicts), `recovery-guards-v3-spec.md` (examination-aware guards)
**Does NOT replace:** `recovery-assessment.ts` — that remains the data description layer for all Evidence surfaces
**Upstream of:** Future NOAEL view reversibility column

---

## Motivation

The mechanical verdict system (`reversed`, `persistent`, `low_power`, etc.) answers "what do the numbers show?" — it's the right language for Evidence surfaces like the findings table, dose charts, and heatmaps. But the pathologist's interpretive question is richer: "what does this *mean* for the safety assessment?"

Five categories map to how tox pathologists actually reason about recovery:

1. Was it there during dosing and did it go away? → **Expected reversibility**
2. Was it there and it stayed? → **Incomplete recovery**
3. Was it absent during dosing but appeared during recovery? → **Delayed onset**
4. Did it appear in recovery with no supporting evidence from the treatment phase? → **Incidental recovery signal**
5. Is the pattern contradictory or biologically implausible? → **Pattern anomaly**

These categories belong on *interpretive* surfaces (Insights pane, Hypotheses tab) — not on data surfaces. This separation is architecturally critical and non-negotiable.

---

## Architecture: Two Layers

```
                    DATA LAYER                          INTERPRETIVE LAYER
                    (recovery-assessment.ts)            (recovery-classification.ts)
                    ─────────────────────               ──────────────────────────────
Input:              subject-level data                  verdict + finding context
Output:             RecoveryVerdict                     RecoveryClassification
Surfaces:           findings table, dose charts,        Insights pane, Hypotheses tab,
                    heatmap, recovery pane stats         NOAEL reversibility column
Language:           "reversed", "persistent"             "Expected reversibility",
                                                        "Delayed onset possible"
Tone:               neutral, mechanical                 interpretive, regulatory
Changes with:       data only                           data + upstream context
Design system:      Evidence/Context (H-015)            Finding/Qualifier (H-015)
```

The interpretive layer **consumes** the data layer's output — it never replaces it. Both layers are visible to the pathologist simultaneously: the Recovery pane (data layer) shows what the numbers are; the Insights pane (interpretive layer) shows what they suggest.

---

## Input Inventory

The classification function needs context beyond the mechanical verdict. Some inputs are available today; others require features that don't exist yet. The system must degrade gracefully when inputs are missing.

### Available Now

| Input | Source | Field |
|-------|--------|-------|
| Mechanical verdict | `deriveRecoveryAssessments()` | `RecoveryAssessment.overall`, per-dose `verdict` |
| Main-arm incidence | `RecoveryDoseAssessment.main.incidence` | Per dose level |
| Recovery-arm incidence | `RecoveryDoseAssessment.recovery.incidence` | Per dose level |
| Main-arm severity | `RecoveryDoseAssessment.main.avgSeverity` | Per dose level |
| Recovery-arm severity | `RecoveryDoseAssessment.recovery.avgSeverity` | Per dose level |
| Sample sizes | `RecoveryArmStats.n`, `.examined` | Per arm per dose |
| Adverse flag | `ruleResults` | Whether finding was classified as adverse (treatment-related) |
| Dose-response trend | `useFindingDoseTrends` | Statistical trend data per finding |
| Dose consistency | `getFindingDoseConsistency()` | `Weak` / `Moderate` / `Strong` |
| Clinical catalog class | `findingClinical` Map | `Sentinel` / `HighConcern` / `ModerateConcern` / `ContextDependent` / `null` |
| Finding signal class | Findings table Signal column | `adverse` / `warning` / `normal` + clinical override |
| Severity grade change | Computed from assessment | `main.avgSeverity - recovery.avgSeverity` |
| Examination status | `RecoveryArmStats.examined` (v3) | Whether tissue was evaluated |

### Future (Not Yet Available)

| Input | Blocked on | Impact when missing |
|-------|-----------|-------------------|
| Historical control incidence | Peer comparison tool (production dependency) | Cannot assess whether recovery-arm incidence is within background range |
| Cross-domain corroboration | D-2 backlog item | Cannot check if clinical pathology (ALT, AST) supports histopath finding |
| Recovery period (days/weeks) | DM/TA domain derivation (flagged for future) | Cannot weight classifications by recovery duration |

### Graceful Degradation Rules

1. **Missing input → omit from confidence, don't block classification.** The classification still runs; confidence is reduced.
2. **Missing input → explicit note in rationale.** E.g., "Historical control data not available — background rate unknown."
3. **Never invent data.** If dose-response is `null` (no statistical test ran), treat as "unknown", not "absent."

---

## Classification Types

```typescript
type RecoveryClassificationType =
  | 'EXPECTED_REVERSIBILITY'
  | 'INCOMPLETE_RECOVERY'
  | 'DELAYED_ONSET_POSSIBLE'
  | 'INCIDENTAL_RECOVERY_SIGNAL'
  | 'PATTERN_ANOMALY'
  | 'UNCLASSIFIABLE';              // guard verdicts prevent classification

interface RecoveryClassification {
  classification: RecoveryClassificationType;
  confidence: 'High' | 'Moderate' | 'Low';
  rationale: string;               // 1–2 sentence deterministic explanation
  qualifiers: string[];            // caveats: missing inputs, small N, etc.
  recommendedAction?: string;      // when classification demands pathologist action
  inputsUsed: string[];            // transparency: which inputs contributed
  inputsMissing: string[];         // transparency: which inputs were unavailable
}
```

`UNCLASSIFIABLE` covers all guard verdicts (`not_examined`, `insufficient_n`, `low_power`, `anomaly` from the mechanical layer). These verdicts mean the data is too incomplete or contradictory for any interpretive classification — the system should say so honestly rather than force a label.

Note: the original proposal's `RECOVERY_ONLY_SIGNAL` is renamed `INCIDENTAL_RECOVERY_SIGNAL` to avoid implying the finding is significant. "Recovery-only" sounds alarming; "incidental" matches the pathologist's likely conclusion when there's no corroborating evidence.

---

## Classification Precedence

**Safety-conservative order: check concerning patterns first.** The system must never preferentially assign the most reassuring label. The pathologist can downgrade; the system should not.

```
1. Guard verdicts → UNCLASSIFIABLE (short-circuit)
2. PATTERN_ANOMALY (most concerning — biologically implausible)
3. DELAYED_ONSET_POSSIBLE (concerning — finding appeared post-treatment)
4. INCOMPLETE_RECOVERY (moderate concern — finding persisted)
5. EXPECTED_REVERSIBILITY (least concerning — finding resolved)
6. INCIDENTAL_RECOVERY_SIGNAL (no main-arm context — likely background)
```

This is the **inverse** of the original proposal's order, and intentionally so. Rationale: if a finding *could* be delayed onset but also *could* be expected reversibility (ambiguous data), the system surfaces the concerning interpretation. The pathologist resolves ambiguity; the system errs on the side of caution.

---

## Classification Logic

### `classifyRecovery(assessment, context): RecoveryClassification`

```typescript
interface RecoveryContext {
  // Available now
  isAdverse: boolean;                        // from ruleResults
  doseConsistency: 'Weak' | 'Moderate' | 'Strong'; // from getFindingDoseConsistency
  doseResponsePValue: number | null;         // from useFindingDoseTrends
  clinicalClass: string | null;              // from findingClinical Map
  signalClass: 'adverse' | 'warning' | 'normal';

  // Future (nullable)
  historicalControlIncidence: number | null;  // peer comparison — not yet available
  crossDomainCorroboration: boolean | null;   // D-2 — not yet available
  recoveryPeriodDays: number | null;          // DM/TA derivation — not yet available
}
```

### Step 0: Guard Short-Circuit

```typescript
const GUARD_VERDICTS = new Set([
  'not_examined', 'insufficient_n', 'low_power', 'anomaly', 'no_data'
]);

if (GUARD_VERDICTS.has(assessment.overall)) {
  return {
    classification: 'UNCLASSIFIABLE',
    confidence: 'Low',
    rationale: buildGuardRationale(assessment.overall, assessment),
    qualifiers: [],
    recommendedAction: guardAction(assessment.overall),
    inputsUsed: ['mechanical_verdict'],
    inputsMissing: [],
  };
}
```

Guard-specific rationale examples:
- `not_examined`: "Recovery tissue not examined — no reversibility assessment possible."
- `low_power`: "Main-arm incidence too low for recovery sample size — comparison is not statistically informative."
- `anomaly`: "Recovery incidence exceeds main-arm incidence — pattern is biologically implausible and requires pathologist review."

### Step 1: PATTERN_ANOMALY

Fires when the mechanical verdict passed all guards but the *pattern* is still unusual. Distinct from the `anomaly` *guard* (which catches main=0, recovery>0) — this catches subtler contradictions.

```typescript
const isPatternAnomaly =
  // Recovery incidence materially exceeds main at any dose level
  assessment.doseAssessments.some(d =>
    d.verdict !== 'not_observed' &&
    d.recovery.incidence > d.main.incidence * 1.5 &&
    d.recovery.affected > d.main.affected
  )
  // AND no dose-response in main arm (rules out treatment-related progression)
  && context.doseConsistency === 'Weak'
  && !context.isAdverse;
```

**Output:**
- Classification: `PATTERN_ANOMALY`
- Rationale: "Recovery incidence exceeds treatment-phase incidence without dose-response support. Pattern inconsistent with typical toxicologic progression."
- Recommended action: "Histopath re-review and data QC recommended."

### Step 2: DELAYED_ONSET_POSSIBLE

```typescript
const isDelayedOnset =
  // Main arm had low/no signal
  assessment.doseAssessments.some(d =>
    d.main.incidence <= 0.10 &&     // ≤10% in main
    d.recovery.incidence >= 0.20 && // ≥20% in recovery
    d.recovery.affected >= 2        // at least 2 animals (not a singleton)
  )
  // AND the finding is not already classified as adverse
  // (adverse + increasing in recovery = INCOMPLETE_RECOVERY or PATTERN_ANOMALY,
  //  not delayed onset)
  && !context.isAdverse;
```

**Additional guard:** If `context.historicalControlIncidence` is available and recovery incidence is within 1.5× historical control range, downgrade to `INCIDENTAL_RECOVERY_SIGNAL` — the finding is likely background.

**Output:**
- Classification: `DELAYED_ONSET_POSSIBLE`
- Rationale: "Finding absent or minimal during treatment phase ({main}%) but present during recovery ({recovery}%). May indicate delayed onset of treatment-related effect."
- Recommended action: "Pathologist assessment required — evaluate whether finding is treatment-related with delayed manifestation."
- Qualifier (when no historical controls): "Historical control data not available — cannot assess whether recovery incidence is within background range."

### Step 3: INCOMPLETE_RECOVERY

```typescript
const isIncomplete =
  // Main arm had signal
  assessment.doseAssessments.some(d =>
    d.main.incidence > 0.10 &&
    d.main.affected >= 2
  )
  // AND recovery still shows substantial presence
  && (
    assessment.overall === 'persistent' ||
    assessment.overall === 'progressing' ||
    // "reversing" but only marginally — incidence dropped <40%
    (assessment.overall === 'reversing' &&
      assessment.doseAssessments.some(d =>
        d.main.incidence > 0 &&
        d.recovery.incidence / d.main.incidence > 0.60
      ))
  );
```

**Output:**
- Classification: `INCOMPLETE_RECOVERY`
- Rationale: "Treatment-related finding persists during recovery phase. {verdict_detail}."
  - Where `verdict_detail` is:
    - `persistent`: "Incidence and severity remained at treatment-phase levels."
    - `progressing`: "Incidence or severity increased during recovery, suggesting ongoing progression."
    - `reversing` (marginal): "Partial reduction observed but finding remains in ≥60% of affected dose levels."
- Qualifier (when isAdverse): "Finding was classified as treatment-related (adverse)."
- Qualifier (when progressing): "Finding shows progression — regulatory significance may be elevated."

### Step 4: EXPECTED_REVERSIBILITY

```typescript
const isExpectedReversibility =
  (assessment.overall === 'reversed' || assessment.overall === 'reversing')
  // AND the main-arm finding was treatment-related or dose-dependent
  && (context.isAdverse || context.doseConsistency !== 'Weak');
```

**Output:**
- Classification: `EXPECTED_REVERSIBILITY`
- Rationale: "Treatment-related finding shows {resolution} during recovery phase."
  - Where `resolution` is:
    - `reversed`: "complete resolution — no affected recovery subjects."
    - `reversing`: "partial resolution — incidence and/or severity reduced."
- Qualifier (when doseConsistency Moderate): "Dose-response in treatment phase was moderate — treatment-relatedness should be confirmed."

### Step 5: INCIDENTAL_RECOVERY_SIGNAL

Fallback for findings that reversed/reversed-partially but have no treatment-phase context to interpret against.

```typescript
// If nothing above matched, and the finding was not treatment-related
const isIncidentalRecoverySignal =
  !context.isAdverse &&
  context.doseConsistency === 'Weak' &&
  (assessment.overall === 'reversed' || assessment.overall === 'reversing' || assessment.overall === 'not_observed');
```

**Output:**
- Classification: `INCIDENTAL_RECOVERY_SIGNAL`
- Rationale: "Finding observed during recovery without supporting treatment-phase evidence. Likely incidental or background fluctuation."
- Qualifier (when no historical controls): "Historical control data not available — cannot confirm background rate."

### Step 6: Fallback

If nothing matched (shouldn't happen with well-formed data, but defensive):

```typescript
return {
  classification: 'UNCLASSIFIABLE',
  confidence: 'Low',
  rationale: 'Recovery pattern does not match any expected classification. Manual review recommended.',
  qualifiers: [],
  inputsUsed: [...],
  inputsMissing: [...],
};
```

---

## Confidence Model

The original proposal used an additive score (+1/−1 per factor). This is fragile — a large N with a tiny effect and no dose-response could score "High." The revised model uses **gated tiers**: certain conditions *cap* confidence regardless of other factors.

### Confidence Caps (Evaluated First)

| Condition | Cap | Reason |
|-----------|-----|--------|
| Any `inputsMissing` that would change classification | Moderate | Incomplete picture |
| `doseConsistency === 'Weak'` AND classification is not `INCIDENTAL_RECOVERY_SIGNAL` | Moderate | No dose-response undermines treatment-relatedness |
| `recovery.examined < 5` at any dose level used for classification | Low | Tiny sample |
| Finding signal is `normal` (not adverse/warning) AND no clinical catalog match | Moderate | Weak upstream signal |

### Base Confidence (After Caps)

```typescript
function computeConfidence(
  classification: RecoveryClassificationType,
  assessment: RecoveryAssessment,
  context: RecoveryContext,
  caps: ConfidenceCap[]
): 'High' | 'Moderate' | 'Low' {

  // Apply caps first
  const maxAllowed = caps.length > 0
    ? Math.min(...caps.map(c => CONFIDENCE_RANK[c.cap]))
    : CONFIDENCE_RANK['High'];

  // Compute base from evidence strength
  let score = 0;

  // Sample size
  const minExamined = Math.min(
    ...assessment.doseAssessments.map(d => d.recovery.examined)
  );
  if (minExamined >= 10) score += 2;
  else if (minExamined >= 5) score += 1;

  // Effect size (incidence change)
  const maxIncidenceDelta = Math.max(
    ...assessment.doseAssessments.map(d =>
      Math.abs(d.recovery.incidence - d.main.incidence)
    )
  );
  if (maxIncidenceDelta >= 0.30) score += 2;      // ≥30pp change
  else if (maxIncidenceDelta >= 0.15) score += 1;  // ≥15pp change

  // Severity change
  const maxSevDelta = Math.max(
    ...assessment.doseAssessments.map(d =>
      Math.abs(d.recovery.avgSeverity - d.main.avgSeverity)
    )
  );
  if (maxSevDelta >= 1.0) score += 1;  // ≥1 full grade change

  // Dose-response support
  if (context.doseConsistency === 'Strong') score += 1;
  if (context.doseResponsePValue !== null && context.doseResponsePValue < 0.05) score += 1;

  // Cross-domain corroboration (future)
  if (context.crossDomainCorroboration === true) score += 1;

  // Map score to tier
  const base = score >= 5 ? 'High' : score >= 3 ? 'Moderate' : 'Low';

  // Apply cap
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_RANK[base], maxAllowed)];
}

const CONFIDENCE_RANK = { 'High': 2, 'Moderate': 1, 'Low': 0 } as const;
const CONFIDENCE_ORDER = ['Low', 'Moderate', 'High'] as const;
```

**Key property:** A finding with N ≥ 10 (+2), large effect size (+2), severity change (+1), strong dose-response (+1), and statistical significance (+1) scores 7 → High. But if dose-response is Weak, the cap forces Moderate regardless. This prevents the additive problem where unrelated positives accumulate past safety-relevant negatives.

---

## Integration: Insights Pane (Finding-Level Context Panel)

### Placement

New section in the finding-level Insights pane, rendered as an `InsightBlock` with kind `recovery`:

**Current Insights pane sections:**
1. Treatment-related (adverse blocks)
2. Clinical significance (clinical blocks)
3. Decreased with treatment (protective blocks)
4. Notes (info blocks)

**Add:**
5. **Recovery assessment** (recovery block) — after Notes, before the Recovery data pane

This places the interpretation *above* the raw Recovery data pane (pane 4 in finding-level view), so the pathologist reads the conclusion first and can inspect the supporting data immediately below.

### Rendering

```
┌─ Recovery assessment ──────────────────────────────┐
│                                                     │
│  Expected reversibility · High confidence           │
│                                                     │
│  Treatment-related finding shows complete            │
│  resolution during recovery phase.                   │
│                                                     │
│  ┊ Strong dose-response · 10+ examined ·            │
│  ┊ Severity decreased ≥1 grade                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Components:**

- Section label: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` — "Recovery assessment"
- Classification + confidence: `text-[11px] font-medium text-foreground` — "{classification label} · {confidence} confidence"
- Rationale: `text-[10px] text-muted-foreground mt-0.5` — 1–2 sentences
- Evidence summary: `text-[10px] text-muted-foreground/60 mt-1 border-l border-border/40 pl-2` — `·`-separated list of contributing factors (from `inputsUsed`)
- Qualifiers (if any): `text-[10px] text-muted-foreground/50 italic mt-0.5` — each qualifier on its own line
- Recommended action (if present): `text-[10px] font-medium text-foreground/70 mt-1` — action text

### Classification Display Labels

| Type | Display label | Tone |
|------|--------------|------|
| `EXPECTED_REVERSIBILITY` | Expected reversibility | Neutral |
| `INCOMPLETE_RECOVERY` | Incomplete recovery | Moderate concern |
| `DELAYED_ONSET_POSSIBLE` | Delayed onset possible | Flagged |
| `INCIDENTAL_RECOVERY_SIGNAL` | Incidental recovery signal | Low concern |
| `PATTERN_ANOMALY` | Pattern anomaly | Investigation required |
| `UNCLASSIFIABLE` | Recovery data inconclusive | Informational |

### Visual Treatment per Classification

No color on the classification label (H-004). Differentiation is through the `InsightBlock` kind and left-border treatment, matching existing insight patterns:

| Classification | Left border | Matches existing pattern |
|---------------|-------------|------------------------|
| `EXPECTED_REVERSIBILITY` | `border-l-2 border-l-emerald-400/40` | Same as `signal.normal` |
| `INCOMPLETE_RECOVERY` | `border-l-2 border-l-amber-400/60` | Same as `signal.warning` |
| `DELAYED_ONSET_POSSIBLE` | `border-l-2 border-l-amber-400/60` | Same as `signal.warning` |
| `INCIDENTAL_RECOVERY_SIGNAL` | `border-l-2 border-l-gray-300/40` | Muted — low concern |
| `PATTERN_ANOMALY` | `border-l-2 border-l-red-400/40` | Same as `signal.adverse` |
| `UNCLASSIFIABLE` | `border-l-2 border-l-gray-300/40` | Muted — informational |

### Conditional Rendering

The recovery insight block only renders when:
- `specimenHasRecovery === true`
- The finding has a non-null `RecoveryAssessment`
- The classification is not `UNCLASSIFIABLE` with verdict `not_observed` or `no_data` (nothing to say)

Exception: `UNCLASSIFIABLE` with verdict `not_examined` or `low_power` DOES render, because the pathologist needs to know why no classification was possible.

---

## Integration: Hypotheses Tab (Recovery Assessment Tool)

### New Tool

Add a fifth tool to the Hypotheses tab specimen tools:

| Tool | Icon | Available | Description |
|------|------|-----------|-------------|
| Recovery assessment | `Undo2` | Yes (when `specimenHasRecovery`) | Classify recovery patterns across all findings in specimen |

**Not a default favorite** — available via the "+" dropdown. Auto-switches to this tool when finding is selected and finding has recovery data (same pattern as treatment-related auto-switch, but lower priority — treatment-related wins if both apply).

### Tool Content

Unlike the Insights pane (which shows one finding's classification), the Hypotheses tab tool shows **all findings** in the specimen with their recovery classifications in a summary table:

```
┌─ Recovery assessment ──────────────────────────────────────────┐
│                                                                │
│  Specimen-level: Incomplete recovery (Moderate confidence)     │
│  2 of 5 findings show incomplete or delayed recovery.          │
│                                                                │
│  Finding              Classification                Confidence │
│  ─────────────────────────────────────────────────────────────  │
│  VACUOLIZATION        Expected reversibility        High       │
│  HYPERTROPHY          Incomplete recovery           Moderate   │
│  INFLAMMATION         Recovery data inconclusive    Low        │
│  NECROSIS             Incomplete recovery           Moderate   │
│  ADENOMA, HEPATO...   Delayed onset possible        Low        │
│                                                                │
│  ┊ Historical control data not available                       │
│  ┊ Cross-domain corroboration not available                    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Specimen-level summary:** Worst classification across all findings (using precedence order). This gives the pathologist a single answer to "what's the recovery story for this organ?"

**Clicking a finding row:** Sets the finding-level selection (same as clicking in the findings table), which updates the context panel to show that finding's detailed classification in the Insights pane.

### Tool Rendering

- Uses the `HypViewerPlaceholder` pattern (DG viewer type label + description + config line)
- Config line: "Classification method: Rule-based (5 categories)" — transparency about what this is
- Future config option: "Include historical controls" toggle (disabled until peer comparison available, with `HypProductionNote`)

---

## Specimen-Level Summary

For the Hypotheses tab tool and potential future use in the NOAEL view, compute a specimen-level recovery classification:

```typescript
function classifySpecimenRecovery(
  classifications: RecoveryClassification[]
): RecoveryClassification {
  // Filter out UNCLASSIFIABLE with non-informative verdicts
  const meaningful = classifications.filter(c =>
    c.classification !== 'UNCLASSIFIABLE' ||
    c.qualifiers.length > 0  // keep UNCLASSIFIABLE that has important qualifiers
  );

  if (meaningful.length === 0) {
    return { classification: 'UNCLASSIFIABLE', confidence: 'Low', ... };
  }

  // Worst classification by precedence
  const worst = meaningful.reduce((a, b) =>
    CLASSIFICATION_PRIORITY[a.classification] < CLASSIFICATION_PRIORITY[b.classification]
      ? a : b
  );

  // Confidence = minimum across all meaningful classifications
  // (one weak link undermines the overall story)
  const minConfidence = meaningful.reduce((a, b) =>
    CONFIDENCE_RANK[a.confidence] < CONFIDENCE_RANK[b.confidence] ? a : b
  ).confidence;

  return {
    classification: worst.classification,
    confidence: minConfidence,
    rationale: buildSpecimenRationale(meaningful, worst),
    qualifiers: deduplicateQualifiers(meaningful.flatMap(c => c.qualifiers)),
    inputsUsed: [...new Set(meaningful.flatMap(c => c.inputsUsed))],
    inputsMissing: [...new Set(meaningful.flatMap(c => c.inputsMissing))],
  };
}

const CLASSIFICATION_PRIORITY: Record<RecoveryClassificationType, number> = {
  'PATTERN_ANOMALY': 0,
  'DELAYED_ONSET_POSSIBLE': 1,
  'INCOMPLETE_RECOVERY': 2,
  'EXPECTED_REVERSIBILITY': 3,
  'INCIDENTAL_RECOVERY_SIGNAL': 4,
  'UNCLASSIFIABLE': 5,
};
```

---

## What This Does NOT Do

Explicit boundaries to prevent scope creep:

1. **Does not replace mechanical verdicts.** The findings table Recovery column, dose chart bars, heatmap cells, and recovery pane stats all continue to use the data layer (`reversed`, `persistent`, etc.).
2. **Does not use ML or LLM.** Fully rule-based, deterministic, reproducible. Same inputs always produce same output.
3. **Does not render on Evidence surfaces.** Classifications appear only on Insights and Hypotheses — interpretive surfaces.
4. **Does not auto-populate annotations.** The classification is a suggestion, not a conclusion. The pathologist uses it as input to the Tox Assessment form and Pathology Review, but the system never pre-fills those forms.
5. **Does not block on future inputs.** Historical controls, cross-domain corroboration, and recovery period are all nullable. The system works today with what's available; classifications improve as inputs come online.

---

## Data Flow

```
useHistopathSubjects ──> deriveRecoveryAssessments()
                              │
                    RecoveryAssessment (per finding)
                              │
                    ┌─────────┴──────────┐
                    │                    │
              DATA LAYER            INTERPRETIVE LAYER
              (unchanged)           (new)
                    │                    │
                    │          classifyRecovery(
                    │            assessment,
                    │            { isAdverse, doseConsistency,
                    │              doseResponsePValue, clinicalClass,
                    │              signalClass, ... }
                    │          )
                    │                    │
                    │          RecoveryClassification
                    │                    │
            ┌───────┴──────┐    ┌───────┴──────────┐
            │              │    │                   │
      Recovery pane   Evidence  Insights pane  Hypotheses tab
      (pane E-1–E-6)  surfaces  (InsightBlock)  (Recovery tool)
```

### Derivation Point

`classifyRecovery` is called in the `HistopathologyContextPanel` wrapper (or a parent `useMemo`), alongside the existing `deriveRecoveryAssessments`. It consumes:

```typescript
const recoveryClassifications = useMemo(() => {
  if (!recoveryAssessments || !specimenHasRecovery) return null;

  return recoveryAssessments.map(assessment => {
    const finding = assessment.finding;
    const clinical = findingClinical.get(finding);
    const rules = specimenRules.filter(r => r.finding === finding);
    const isAdverse = rules.some(r => r.severity === 'adverse');
    const doseConsistency = getFindingDoseConsistency(specimenData, finding);
    const trend = trendData?.find(t => t.finding === finding);

    return classifyRecovery(assessment, {
      isAdverse,
      doseConsistency,
      doseResponsePValue: trend?.pValue ?? null,
      clinicalClass: clinical?.clinicalClass ?? null,
      signalClass: isAdverse ? 'adverse' : clinical ? 'warning' : 'normal',
      historicalControlIncidence: null,   // future
      crossDomainCorroboration: null,     // future
      recoveryPeriodDays: null,           // future
    });
  });
}, [recoveryAssessments, specimenRules, findingClinical, specimenData, trendData]);
```

---

## Implementation Order

```
1. Types + classifyRecovery function     ← pure logic, testable in isolation
2. computeConfidence function            ← pure logic, testable in isolation
3. classifySpecimenRecovery function     ← aggregation logic
4. Insights pane InsightBlock            ← rendering, uses output from #1
5. Hypotheses tab Recovery tool          ← rendering, uses output from #1 + #3
6. Wire derivation into context panel    ← useMemo + props threading
```

Steps 1–3 are pure functions with no UI dependencies — write comprehensive unit tests. Steps 4–5 are rendering. Step 6 is integration.

---

## Verification Checklist

### Classification Logic
- [ ] Guard verdicts (`not_examined`, `insufficient_n`, `low_power`, `anomaly`) → `UNCLASSIFIABLE`
- [ ] Precedence: PATTERN_ANOMALY checked before DELAYED_ONSET before INCOMPLETE before EXPECTED before INCIDENTAL
- [ ] PATTERN_ANOMALY: fires when recovery > main × 1.5 AND weak dose-response AND not adverse
- [ ] DELAYED_ONSET: fires when main ≤ 10% AND recovery ≥ 20% AND not adverse
- [ ] DELAYED_ONSET: downgrades to INCIDENTAL when historical control available and recovery within range
- [ ] INCOMPLETE_RECOVERY: fires for persistent/progressing verdicts AND main > 10%
- [ ] INCOMPLETE_RECOVERY: fires for marginal reversing (ratio > 0.60)
- [ ] EXPECTED_REVERSIBILITY: fires for reversed/reversing AND (adverse OR dose-consistent)
- [ ] INCIDENTAL_RECOVERY_SIGNAL: fallback for non-adverse, weak dose-response, reversed/not_observed
- [ ] Fallback to UNCLASSIFIABLE when nothing matches

### Confidence Model
- [ ] Cap: any missing input that would change classification → Moderate max
- [ ] Cap: weak dose-response on non-incidental classification → Moderate max
- [ ] Cap: examined < 5 → Low max
- [ ] Cap: normal signal with no clinical match → Moderate max
- [ ] Base score: N ≥ 10 → +2, N 5–9 → +1
- [ ] Base score: effect ≥ 30pp → +2, ≥ 15pp → +1
- [ ] Base score: severity change ≥ 1 grade → +1
- [ ] Base score: strong dose-response → +1, significant p-value → +1
- [ ] Cap applied after base score (cap always wins)
- [ ] High confidence impossible with weak dose-response (except INCIDENTAL)

### Insights Pane
- [ ] Recovery insight block renders below Notes section, above Recovery data pane
- [ ] Classification label + confidence on first line
- [ ] Rationale text below
- [ ] Evidence summary with contributing factors
- [ ] Qualifiers in italic when present
- [ ] Recommended action in medium weight when present
- [ ] Left-border color matches classification tier
- [ ] Block hidden when no recovery data or verdict is not_observed/no_data
- [ ] Block shown for not_examined/low_power UNCLASSIFIABLE (informative)

### Hypotheses Tab
- [ ] Recovery assessment tool appears in "+" dropdown when specimen has recovery
- [ ] Tool hidden when specimen has no recovery data
- [ ] Summary table shows all findings with classifications
- [ ] Specimen-level worst classification shown at top
- [ ] Clicking finding row sets finding-level selection
- [ ] Missing-input notes shown at bottom
- [ ] "Include historical controls" toggle disabled with production note

### Architecture
- [ ] Data layer (recovery-assessment.ts) unchanged — no modifications
- [ ] All Evidence surfaces continue using mechanical verdicts
- [ ] Interpretive layer only surfaces on Insights pane and Hypotheses tab
- [ ] `classifyRecovery` is a pure function (no side effects, no API calls)
- [ ] All inputs documented in `inputsUsed` / `inputsMissing`
- [ ] Null inputs degrade gracefully (reduce confidence, add qualifier)

### Regression
- [ ] Existing Insights pane sections (adverse, clinical, protective, notes) unaffected
- [ ] Existing Hypotheses tab tools unaffected
- [ ] Recovery pane data (E-1 through E-6) unaffected — uses data layer only
- [ ] Studies without recovery arms: no new UI elements appear

---

## Implementation Overrides (2026-02-16)

Deviations from the spec that were reviewed and accepted.

### Overrides

| # | Spec text | Override | Rationale |
|---|-----------|----------|-----------|
| O1 | §Classification Logic: no proliferative handling | Added Step 0b: proliferative (neoplastic) findings → UNCLASSIFIABLE with **High** confidence | Neoplastic findings are biologically irreversible — running the classification logic produces misleading results (e.g., "incomplete recovery" for a tumor). High confidence because the classification is certain, not uncertain. |
| O2 | §RecoveryContext: `doseConsistency: 'Weak' \| 'Moderate' \| 'Strong'` | Adds `'NonMonotonic'` as a fourth value | Codebase's `getFindingDoseConsistency()` returns "NonMonotonic" for non-monotonic dose patterns. Treated as equivalent to "Weak" for confidence caps. |
| O3 | §Confidence Model: no finding-nature influence | EXPECTED_REVERSIBILITY gets confidence boost (+1 tier) for adaptive findings | Adaptive findings (hypertrophy, hyperplasia) are biologically expected to reverse; the additional evidence from finding nature increases confidence that the pattern is genuine. |
| O4 | §INCOMPLETE_RECOVERY: no finding-nature qualifiers | Adds nature-specific qualifiers: "Adaptive finding unexpectedly persistent" and "Fibrotic changes are generally considered irreversible" | Finding nature provides important context for interpreting persistence. An adaptive finding that doesn't reverse is more surprising than a degenerative one. |
| O5 | §Hypotheses Tab: tool shows finding table with 3 columns | Table has 4 columns: Finding, Nature, Classification, Confidence | Finding nature column helps pathologist interpret classifications without clicking into each finding. |

### Enhancements beyond spec

| # | Addition | Where | Why |
|---|----------|-------|-----|
| E1 | `findingNature` field in `RecoveryContext` | `recovery-classification.ts:46` | Keyword-based finding nature classification (proliferative/adaptive/degenerative) from `finding-nature.ts`; used for Step 0b and confidence modifiers |
| E2 | Proliferative findings displayed as "not applicable" in Hypotheses table | `HistopathologyView.tsx` (Recovery tool) | Proliferative rows render with muted styling instead of being hidden, so pathologist sees they were considered but excluded |
| E3 | Specimen rationale counts findings by classification type | `classifySpecimenRecovery()` | Builds: "Specimen-level assessment based on N findings: X expected reversibility, Y incomplete recovery..." |

### Decision: proliferative handling

The spec does not address neoplastic/proliferative findings. Tumors cannot reverse — they are permanent structural changes. Without Step 0b, the classification engine would produce clinically incorrect results (e.g., classifying a hepatocellular carcinoma that persists through recovery as "incomplete recovery," implying it should have reversed). The proliferative short-circuit returns UNCLASSIFIABLE with High confidence and the rationale "Neoplastic findings are not expected to reverse." This is the biologically correct assessment.
