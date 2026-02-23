# Computed Field Contracts

Every derived field at the engine→UI boundary: what it means, what it guarantees, and where it comes from. Spec-unaware — this file describes field semantics, not which specs reference them. UI specs reference fields via their stable IDs (e.g., `FIELD-01`, `FIELD-15`).

Companion to `methods.md` (how we compute things) and `dependencies.md` (what we depend on). This file documents **what the computation produces** — types, invariants, null semantics, and gotchas. For backend API fields (the upstream contract), see `api-field-contracts.md`.

---

## How to Read an Entry

```
## FIELD-XX — `object.fieldName`
Type:        TypeScript type (including null)
Unit:        (if numeric — otherwise omitted)
Scope:       syndrome-level | endpoint-level | organ-level | study-level
Source:      file.ts:functionName()
Consumers:   [views/components that directly render or use this field]
Methods:     @method IDs from methods.md
Invariants:  [testable guarantees — never/always/exactly constraints]
Null means:  [what null/undefined communicates]
Sex:         [sex-stratification behavior]
Not:         [common misreadings that lead to bugs]
```

---

## Priority Fields (Syndrome Interpretation)

### FIELD-01 — `interpretation.overallSeverity`

**Type:** `"S0_Death" | "carcinogenic" | "proliferative" | "S4_Critical" | "S3_Adverse" | "S2_Concern" | "S1_Monitor"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:deriveOverallSeverity()`
**Consumers:** AdverseEffectsView, SyndromeContextPanel, NoaelDecisionView
**Methods:** @method CLASS-14

**Invariants:**
- Never null. Every interpreted syndrome gets exactly one severity.
- Cascade is priority-ordered. Earlier stages always win:
  `S0_Death > carcinogenic > proliferative > S4_Critical > S3_Adverse > S2_Concern > S1_Monitor`
- `S0_Death` requires `mortalityContext.deathsInSyndromeOrgans > 0` (deaths matched to this syndrome's target organs, not just any deaths).
- `S4_Critical` requires `treatmentRelatedDeaths > 0` AND no syndrome-organ deaths (otherwise S0 fires first).
- `S3_Adverse` requires `certainty ∈ {mechanism_confirmed, mechanism_uncertain}` AND `adversity.overall === "adverse"`.
- `S2_Concern` is the default when adversity is adverse but certainty is only `pattern_only`, or when adversity is `equivocal`.
- `S1_Monitor` requires `adversity.overall === "non_adverse"`.

**Null means:** N/A — never null.

**Sex:** Not sex-stratified. One severity per syndrome (uses rolled-up adversity/certainty).

**Not:**
- Not histopathologic severity (1–5 scale from pathologist grading — that's `FIELD-11`).
- Not statistical magnitude (Cohen's d thresholds — that's `adversity.magnitudeLevel`).
- Does not encode dose — use `FIELD-06` for NOAEL-level information.

---

### FIELD-02 — `interpretation.certainty`

**Type:** `"mechanism_confirmed" | "mechanism_uncertain" | "pattern_only"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:assessCertainty()`, caps at `applyCertaintyCaps()`
**Consumers:** SyndromeContextPanel, NoaelDecisionView
**Methods:** @method CLASS-12, @method METH-22, @method METH-29, @method METH-31

**Invariants:**
- Never null. Every interpreted syndrome gets exactly one certainty.
- Order: `pattern_only < mechanism_uncertain < mechanism_confirmed`.
- Base assessment uses discriminating evidence (supports vs argues_against, strong vs moderate weight).
- Four caps can only **reduce** certainty, never raise it:
  1. **Directional gate** (REM-09): if `syndrome.directionalGate.gateFired`, certainty ≤ cap from gate config.
  2. **Single-domain** (REM-12): XS04/XS05 with only one domain → forced to `pattern_only`.
  3. **Data sufficiency** (REM-15): missing confirmatory domain (MI for XS01/XS03/XS04/XS07) → `pattern_only`. Missing supporting domain (LB for XS10) → `mechanism_uncertain`.
  4. **Liver enzyme tier** (PATCH-04): XS01 upgrade evidence scoring can lift certainty back up (only mechanism that raises it).
- **Stress confound** (REM-10): if XS08 co-detected AND syndrome's evidence is all stress endpoints → downgrade by one level.
- **Adaptive pattern** (REM-16): if XS01 enzyme induction pattern detected → rationale amended (certainty not directly reduced, but adversity becomes equivocal).

**Null means:** N/A — never null.

**Sex:** Not sex-stratified directly. But matched endpoints used for evaluation may be sex-specific.

**Not:**
- Not the same as `patternConfidence` (FIELD-03). Certainty is about mechanism specificity; confidence is about detection reliability.
- Caps are **one-directional** (down only, except liver enzyme upgrade). A `mechanism_confirmed` assessment can be capped to `pattern_only` but never the reverse (except via upgrade evidence).

---

### FIELD-03 — `interpretation.patternConfidence` / `syndrome.confidence`

**Type:** `"HIGH" | "MODERATE" | "LOW"`
**Scope:** syndrome-level
**Source:** `cross-domain-syndromes.ts:detectCrossDomainSyndromes()` — confidence assigned during detection
**Consumers:** FindingsRail, SyndromeContextPanel
**Methods:** @method CLASS-09

**Invariants:**
- Never null. Set during detection, before interpretation.
- `HIGH`: requiredMet=true AND domainsCovered ≥ minDomains AND supportScore ≥ threshold.
- `MODERATE`: requiredMet=true but domain/support below HIGH threshold.
- `LOW`: requiredMet=false (detected via supporting evidence only).
- Read-only in interpretation — `interpretSyndrome()` copies it to `patternConfidence` but never modifies it.

**Null means:** N/A — never null.

**Sex:** Detection can be sex-specific (`syndrome.sexes` lists which sexes triggered it).

**Not:**
- Not `certainty` (FIELD-02). Confidence = "did we find the expected pattern?" Certainty = "is this actually the mechanism?"
- Not modified by interpretation caps. A HIGH confidence syndrome can still be `pattern_only` certainty if data sufficiency gate fires.

---

### FIELD-04 — `interpretation.treatmentRelatedness.overall`

**Type:** `"treatment_related" | "possibly_related" | "not_related"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:computeTreatmentRelatedness()`
**Consumers:** SyndromeContextPanel, NoaelDecisionView
**Methods:** @method METRIC-08

**Invariants:**
- Never null. Every interpreted syndrome gets a TR verdict.
- Derived from weighted A-factor scoring:
  - A-1 Dose-response: strong=2, weak=1, absent=0
  - A-2 Cross-endpoint concordance: concordant=1, isolated=0
  - A-3 HCD comparison: **always 0** (no historical control database — stubbed)
  - A-6 Statistical significance: significant=1, borderline=0.5, not_significant=0
  - A-7 Clinical observation support: strengthens=1, else=0
- Thresholds: `≥3 → treatment_related`, `≥1.5 → possibly_related`, `<1.5 → not_related`.
- A-1 "strong" requires: (strong DR pattern + trend p < 0.1) OR (pairwise p < 0.01 + |effect| ≥ 0.8).
- Maximum possible score = 5 (strong DR + concordant + significant + CL support).

**Null means:** N/A — never null.

**Sex:** Not sex-stratified. Uses aggregated endpoint statistics.

**Not:**
- Not a binary flag. Three-level ordinal. UI must handle `possibly_related` distinctly from both extremes.
- HCD factor is always 0 — do not display "within historical range" or "outside range." The system has no HCD data. Display as "not available."

---

### FIELD-05 — `interpretation.adversity.overall`

**Type:** `"adverse" | "non_adverse" | "equivocal"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:computeAdversity()`
**Consumers:** SyndromeContextPanel, NoaelDecisionView
**Methods:** @method CLASS-13, @method METH-24, @method METH-25

**Invariants:**
- Never null. Every interpreted syndrome gets an adversity verdict.
- Decision tree is **priority-ordered** (first match wins):
  1. `precursorToWorse` (tumor progression) → `adverse`
  2. `adaptive` (XS01 enzyme induction: liver weight↑ + hypertrophy, no necrosis, ALT/AST < 5×) → `equivocal`
  3. `stressConfound` (XS08 co-detected, all evidence overlaps stress endpoints) → `equivocal`
  4. `mechanism_confirmed` + cross-domain → `adverse`
  5. `magnitudeLevel ∈ {severe, marked}` → `adverse`
  6. `reversible=true` + `magnitudeLevel ∈ {minimal, mild}` + no precursor → `non_adverse`
  7. Default → `equivocal`

**Null means:** N/A — never null.

**Sex:** Not sex-stratified. Uses rolled-up recovery, certainty, and magnitude.

**Not:**
- `equivocal` is not "unknown." It means the evidence is genuinely ambiguous — expert review required.
- `non_adverse` requires **both** reversibility AND low magnitude. Missing recovery data (null reversible) prevents non_adverse.
- `adaptive` only applies to XS01. Other syndromes cannot be classified as adaptive.

---

### FIELD-06 — `interpretation.recovery.status`

**Type:** `"recovered" | "partial" | "not_recovered" | "not_examined" | "mixed"`
**Scope:** syndrome-level (rolled up from per-endpoint)
**Source:** `syndrome-interpretation.ts:assessSyndromeRecovery()`
**Consumers:** SyndromeContextPanel, RecoveryPane
**Methods:** @method CLASS-10, @method CLASS-20

**Invariants:**
- Never null. Defaults to `"not_examined"` when no recovery data.
- Per-endpoint logic (each matched endpoint assessed independently):
  - `recovered`: recovery p ≥ 0.05 AND recovery effect < 33% of terminal effect.
  - `partial`: recovery p ≥ 0.05 but effect > 33% of terminal, OR recovery p < 0.05 but effect < 50% of terminal.
  - `not_recovered`: recovery p < 0.05 AND effect ≥ 50% of terminal.
  - `not_examined`: no recovery p-value available.
- Roll-up: if all examined endpoints agree → that status. If >1 unique status → `"mixed"`.
- **BW-relevant fallback** (BW syndromes only): when no recovery rows but food consumption recovery data exists, uses `fw_recovered` + `bw_recovered` as proxy.

**Null means:** N/A — never null (uses `"not_examined"` sentinel).

**Sex:** Per-endpoint assessment is sex-stratified (separate rows per sex). Roll-up is across all sexes.

**Not:**
- `"mixed"` is not an error state. It means some endpoints recovered and others didn't — common in multi-organ syndromes.
- The 33%/50% thresholds compare **absolute** effect sizes (recovery vs terminal), not raw values.
- `"not_examined"` means the study design didn't include a recovery arm, not that the analysis failed.

---

### FIELD-07 — `mortalityContext.mortalityNoaelCap`

**Type:** `number | null`
**Unit:** dose level (integer ordinal, not absolute dose in mg/kg)
**Scope:** syndrome-level (passed in from study-level computation)
**Source:** `syndrome-interpretation.ts:assessMortalityContext()`
**Consumers:** NoaelDecisionView, SyndromeContextPanel
**Methods:** @method CLASS-14 (consumed by severity cascade)

**Invariants:**
- Null when no treatment-related deaths in the study (no cap to apply).
- When non-null, it's a **dose level integer** (e.g., 1, 2, 3), not an absolute dose value. Map to actual dose via dose group lookup.
- `mortalityNoaelCapRelevant` is a **tri-state**: `true` = deaths match syndrome organs, `false` = unrelated deaths, `null` = organ-less syndrome (cannot determine automatically).
- Only treatment-related, non-recovery-arm deaths count.

**Null means:** No mortality-based NOAEL cap exists for this study.

**Sex:** Not sex-stratified. Study-level cap.

**Not:**
- Not an absolute dose (mg/kg). It's a dose level ordinal. Display requires mapping through dose groups.
- Not specific to any one syndrome unless `mortalityNoaelCapRelevant === true`. A study-level cap may be irrelevant to a specific syndrome if deaths aren't in that syndrome's target organs.

---

## Priority Fields (Endpoint Summary)

### FIELD-08 — `endpoint.worstSeverity`

**Type:** `"adverse" | "warning" | "normal"`
**Scope:** endpoint-level
**Source:** `derive-summaries.ts:deriveEndpointSummaries()`
**Consumers:** FindingsRail, AdverseEffectsView, DoseResponseView
**Methods:** @method CLASS-01, @method CLASS-05

**Invariants:**
- Never null. Every endpoint gets exactly one severity.
- Worst-case aggregation across all rows for this endpoint: `adverse > warning > normal`.
- Classification comes from the **backend** statistical pipeline (severity assigned per dose-group row in `adverse_effect_summary.json`). Frontend aggregates across rows.
- `adverse` = treatment-related + significant (p < 0.05 pairwise or trend).
- `warning` = borderline significant or non-treatment-related signal.
- `normal` = no significant signal.

**Null means:** N/A — never null.

**Sex:** Worst-case across both sexes. Per-sex breakdown available in `endpoint.bySex[sex].worstSeverity`.

**Not:**
- Not the histopathologic severity grade (1–5 pathologist scale — that's `FIELD-11`).
- Not the syndrome-level `overallSeverity` (S0–S4 cascade — that's `FIELD-01`).
- The backend classification thresholds are in `classification.py`, not the frontend.

---

### FIELD-09 — `endpoint.direction`

**Type:** `"up" | "down" | "none" | null`
**Scope:** endpoint-level
**Source:** `derive-summaries.ts:deriveEndpointSummaries()`
**Consumers:** FindingsRail, DoseResponseView, AdverseEffectsView
**Methods:** @method METH-13

**Invariants:**
- Can be null (no effect size data available).
- Driven by the row with the **largest absolute Cohen's d** (not the most significant p-value).
- When the strongest-signal row sets direction, pattern and fold change follow the same row — prevents cross-sex mixing.
- `"none"` = effect size exists but is near zero or no directional signal.
- `null` = no effect size data at all.

**Null means:** No effect size data available for any row of this endpoint.

**Sex:** Follows the sex that produced the max |Cohen's d|. Per-sex breakdown in `endpoint.bySex[sex].direction`.

**Not:**
- Not determined by p-value. A highly significant p=0.001 with small d=0.2 does not set direction over a p=0.05 with large d=1.5.
- When sexes diverge (e.g., male ↑, female ↓), the endpoint-level direction follows the sex with the larger |d|. This is intentional — the "worst case" drives the summary. Check `bySex` for the full picture.
- `"none"` ≠ null. `"none"` means data exists but shows no directional change. `null` means no data.

---

### FIELD-10 — `endpoint.noaelTier` / `endpoint.noaelDoseValue`

**Type:** `noaelTier: NoaelTier | undefined`, `noaelDoseValue: number | null | undefined`
**NoaelTier:** `"below-lowest" | "at-lowest" | "mid" | "high" | "none"`
**Unit:** noaelDoseValue is in the study's dose unit (mg/kg, mg/m², etc.)
**Scope:** endpoint-level
**Source:** `derive-summaries.ts:computeEndpointNoaelMap()`
**Consumers:** NoaelDecisionView, FindingsRail
**Methods:** @method CLASS-07

**Invariants:**
- Optional fields (may be undefined on EndpointSummary if NOAEL computation hasn't run).
- When computed:
  - `"none"` = no significant pairwise comparison AND no significant trend → no LOAEL → no NOAEL needed.
  - `"below-lowest"` = LOAEL at lowest treated dose OR significant trend but no pairwise significance → NOAEL below tested range.
  - `"at-lowest"` = LOAEL at second dose level → NOAEL at lowest treated dose.
  - `"mid"` = LOAEL at third dose → NOAEL at second.
  - `"high"` = LOAEL at fourth+ dose.
- LOAEL identification: lowest dose level with `p_value_adj < 0.05` in any pairwise comparison.
- NOAEL = one dose level below LOAEL. If LOAEL is at the lowest dose, tier is `"below-lowest"`.
- `noaelDoseValue` is null when tier is `"below-lowest"` (no testable NOAEL) or `"none"` (no LOAEL found).

**Null means:** `undefined` = computation not yet run. `noaelDoseValue: null` = tier is "below-lowest" or "none" (no concrete dose value).

**Sex:** Combined (worst-case across sexes) is the regulatory NOAEL. Per-sex breakdown in `endpoint.noaelBySex`.

**Not:**
- Not the backend-computed NOAEL (CLASS-06, from `noael_summary.json`). This is the frontend re-derivation from pairwise data.
- `"below-lowest"` does not mean "safe at the lowest dose." It means the lowest tested dose already shows a signal — the true NOAEL is unknown and below the tested range.
- The dose value is in the study's unit, not standardized mg/kg/day.

---

### FIELD-11 — `interpretation.histopathSeverityGrade`

**Type:** `"none" | "minimal" | "mild" | "moderate" | "marked" | "severe" | null`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:deriveHistopathSeverityGrade()`
**Consumers:** SyndromeContextPanel, HistopathologyView
**Methods:** @method METH-28

**Invariants:**
- Null when no histopath data available for this syndrome's organs.
- Maps from `avg_severity` (continuous 0–5 scale) to categorical grade:
  - `> 0 and < 1.5` → `"minimal"`
  - `≥ 1.5 and < 2.5` → `"mild"`
  - `≥ 2.5 and < 3.5` → `"moderate"`
  - `≥ 3.5 and < 4.5` → `"marked"`
  - `≥ 4.5` → `"severe"`
  - `0` → `"none"`
- Uses max `avg_severity` across all relevant MI rows.

**Null means:** No histopathology data available for this syndrome's target organs. Display as "not examined" or similar — not as "none."

**Sex:** Not sex-stratified. Max across all histopath rows.

**Not:**
- Not the regulatory severity tier (S0–S4 — that's `FIELD-01`).
- Not the statistical magnitude level (Cohen's d — that's `adversity.magnitudeLevel`).
- This is the **pathologist's tissue grading** — a separate assessment from statistical effect size. A syndrome can have `magnitudeLevel: "severe"` (large Cohen's d) but `histopathSeverityGrade: "minimal"` (pathologist saw only minimal tissue changes).

---

## Priority Fields (Other Engines)

### FIELD-12 — `opiResult.classification`

**Type:** `"proportionate" | "disproportionate" | "partially_proportionate" | "inverse" | "not_applicable"`
**Scope:** organ × dose level
**Source:** `organ-proportionality.ts:classifyOpi()`
**Consumers:** AdverseEffectsView (OPI context section)
**Methods:** @method CLASS-21

**Invariants:**
- Never null (returns `"not_applicable"` when BW delta below threshold).
- `"not_applicable"`: `|bwDelta| < 5%` (the `BW_DELTA_THRESHOLD` constant). Body weight change too small for OPI to be meaningful.
- `"inverse"`: OPI < 0 or OPI < 0.3 (organ and body weight moved in opposite directions).
- `"partially_proportionate"`: 0.3 ≤ OPI < 0.7.
- `"proportionate"`: 0.7 ≤ OPI ≤ 1.3 (organ weight change tracks body weight change).
- `"disproportionate"`: OPI > 1.3 (organ weight changed more than body weight).
- OPI = organDelta / bwDelta (both as percent change from control).

**Null means:** N/A — never null (sentinel `"not_applicable"`).

**Sex:** Computed per sex (organ weight data is sex-stratified).

**Not:**
- Not a p-value or statistical test. It's a ratio of percent changes.
- `"proportionate"` does not mean "safe." It means organ weight change is explained by body weight change. The body weight change itself may be adverse.
- BW delta threshold of 5% is a fixed constant, not configurable.

---

## Endpoint Summary Fields

### FIELD-13 — `endpoint.maxEffectSize`

**Type:** `number | null`
**Unit:** Cohen's d (Hedges' g variant, standardized mean difference)
**Scope:** endpoint-level
**Source:** `derive-summaries.ts:deriveEndpointSummaries()`
**Consumers:** FindingsRail, DoseResponseView, signal scoring (FIELD-34)
**Methods:** @method METRIC-10

**Invariants:**
- Can be null (no effect size data from backend).
- Signed: positive = increase vs control, negative = decrease. The sign aligns with `direction`.
- Represents the pairwise comparison with the largest absolute value across all dose groups and sexes.
- When this field updates, `direction`, `pattern`, and `maxFoldChange` are also updated from the same row — they form a coherent unit.

**Null means:** Backend did not compute effect size for this endpoint (insufficient data, wrong endpoint type, etc.).

**Sex:** Max |d| across both sexes. Per-sex in `endpoint.bySex[sex].maxEffectSize`.

**Not:**
- Not unsigned. Sign matters — it tells you the direction.
- Not the adversity magnitude level (that's a categorical binning of this value — see `FIELD-05` sub-field `magnitudeLevel`).

---

### FIELD-14 — `endpoint.minPValue`

**Type:** `number | null`
**Unit:** p-value (0–1)
**Scope:** endpoint-level
**Source:** `derive-summaries.ts:deriveEndpointSummaries()`
**Consumers:** FindingsRail, DoseResponseView
**Methods:** @method STAT-01 (continuous), @method STAT-03 (incidence)

**Invariants:**
- Can be null (no statistical test run for this endpoint).
- Minimum across all dose groups and sexes (most significant result).
- From pairwise tests (Welch's t for continuous, Fisher's exact for incidence).
- Not Bonferroni-corrected for continuous domains. Incidence domains are also uncorrected (Fisher's is inherently conservative).

**Null means:** No statistical comparison was possible (insufficient data, e.g., n < 2 per group).

**Sex:** Min across both sexes. Per-sex in `endpoint.bySex[sex].minPValue`.

**Not:**
- Not the trend p-value. Trend is not exposed on EndpointSummary (lives in UnifiedFinding).
- Not adjusted/corrected. Raw pairwise p-values.

---

### FIELD-15 — `endpoint.maxFoldChange`

**Type:** `number | null`
**Unit:** ratio (treated mean / control mean)
**Scope:** endpoint-level
**Source:** `derive-summaries.ts:deriveEndpointSummaries()`
**Consumers:** FindingsRail, DoseResponseView
**Methods:** @method METRIC-11

**Invariants:**
- Can be null (no group stats available, or control mean is zero).
- **Direction-aligned** (REM-01): computed from the same dose group that set `direction`, not the dose with the largest absolute deviation.
- Ratio: `worstTreatedMean / controlMean`. Values > 1 = increase, < 1 = decrease, = 1 = no change.
- When `controlStats` exist, fold change is **re-computed** on the frontend from group stats (overrides backend `max_fold_change` which may be direction-misaligned).

**Null means:** No group statistics available or control mean is zero (division undefined).

**Sex:** Follows the direction-setting sex. Per-sex fold change available in `endpoint.bySex[sex].maxFoldChange`.

**Not:**
- Not always ≥ 1. A ↓ endpoint will have fold change < 1 (e.g., 0.6 = 40% decrease).
- Not the same as the backend's `max_fold_change` field. Frontend overrides it with direction-aligned computation (REM-01).

---

### FIELD-16 — `endpoint.treatmentRelated`

**Type:** `boolean`
**Scope:** endpoint-level
**Source:** `derive-summaries.ts:deriveEndpointSummaries()`
**Consumers:** FindingsRail, filter bar
**Methods:** @method CLASS-05

**Invariants:**
- Never null. Defaults to false.
- True if ANY row for this endpoint has `treatment_related: true` (worst-case aggregation).
- Backend classification based on: pairwise p < 0.05 AND trend p < 0.05, OR adverse severity + monotonic pattern, OR p < 0.01.

**Null means:** N/A — never null (boolean).

**Sex:** OR across both sexes. Per-sex in `endpoint.bySex[sex].treatmentRelated`.

**Not:**
- Not the syndrome-level treatment-relatedness (FIELD-04). This is per-endpoint binary; that's per-syndrome three-level ECETOC scoring.

---

### FIELD-17 — `endpoint.pattern`

**Type:** `string` (backend-defined dose-response pattern labels)
**Common values:** `"linear" | "monotonic" | "threshold" | "threshold_increase" | "threshold_decrease" | "u_shaped" | "inverted_u" | "flat" | "insufficient_data"`
**Scope:** endpoint-level
**Source:** `derive-summaries.ts:deriveEndpointSummaries()`
**Consumers:** FindingsRail, DoseResponseView
**Methods:** @method CLASS-02 (continuous), @method CLASS-03 (incidence)

**Invariants:**
- Never null. Defaults to the first row's pattern.
- Follows the row with the **largest absolute effect size** (same row that sets direction). If that row has `flat` or `insufficient_data`, falls back to any non-flat pattern from other rows.
- Backend classification uses trend test + pairwise comparison patterns.

**Null means:** N/A — never null (string, always has a value from backend).

**Sex:** Follows the direction-setting sex's pattern. Per-sex in `endpoint.bySex[sex].pattern`.

**Not:**
- Not a statistical test result. It's a categorical classification derived from statistical test results.
- Pattern labels come from the backend (`classification.py`). The frontend does not reclassify — only selects which row's pattern to surface.

---

## Syndrome Detection Fields

### FIELD-18 — `syndrome.requiredMet`

**Type:** `boolean`
**Scope:** syndrome-level
**Source:** `cross-domain-syndromes.ts:detectCrossDomainSyndromes()` — during detection
**Consumers:** internal (gates FIELD-02 certainty)
**Methods:** @method METH-14, @method METH-15

**Invariants:**
- Never null.
- True when the syndrome's `requiredLogic` is satisfied:
  - `type: "any"` — at least one required-role term matched.
  - `type: "all"` — ALL required-role terms matched.
  - `type: "compound"` — the boolean expression (e.g., `"ALT AND (GGT OR 5NT)"`) evaluates to true, using compound expression evaluator.
- Directly gates certainty: `requiredMet: false` → certainty starts at `pattern_only`.

**Null means:** N/A — never null.

**Not:**
- Not the same as "syndrome detected." A syndrome can fire with `requiredMet: false` if enough supporting evidence accumulates.
- Does not mean all terms matched — only the required-role terms per the logic expression.

---

### FIELD-19 — `syndrome.domainsCovered`

**Type:** `string[]`
**Scope:** syndrome-level
**Source:** `cross-domain-syndromes.ts:detectCrossDomainSyndromes()` — during detection
**Consumers:** SyndromeContextPanel, TR scoring (FIELD-04)
**Methods:** @method METH-14

**Invariants:**
- Never null. Always at least one domain (the detection wouldn't fire otherwise).
- Unique domain codes (e.g., `["LB", "MI", "OM"]`).
- Count is compared against `SyndromeDefinition.minDomains` for confidence scoring.
- Used by treatment-relatedness (A-2 concordance: `≥ 2` = concordant) and adversity (cross-domain support).

**Null means:** N/A — never null (always ≥1 entry).

**Not:**
- Not the same as the number of matched endpoints. Multiple endpoints from the same domain count as one domain.

---

### FIELD-20 — `syndrome.supportScore`

**Type:** `number`
**Scope:** syndrome-level
**Source:** `cross-domain-syndromes.ts:detectCrossDomainSyndromes()` — during detection
**Consumers:** internal (confidence scoring)
**Methods:** @method CLASS-09

**Invariants:**
- Never null. Always ≥ 0.
- Sum of matched supporting-role terms' contribution scores.
- Used for confidence classification alongside `requiredMet` and `domainsCovered.length`.

**Null means:** N/A — never null.

**Not:**
- Not the treatment-relatedness score (that's FIELD-04 / METRIC-08).
- Not directly displayed to users — it's an internal detection metric.

---

## Treatment-Relatedness Sub-Fields

### FIELD-21 — `treatmentRelatedness.doseResponse`

**Type:** `"strong" | "weak" | "absent"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:computeTreatmentRelatedness()`
**Consumers:** SyndromeContextPanel
**Methods:** @method METRIC-08

**Invariants:**
- Never null.
- `"strong"`: (strong DR pattern + trend p < 0.1) OR (pairwise p < 0.01 + |effect| ≥ 0.8). Strong patterns: linear, monotonic, threshold, threshold_increase, threshold_decrease.
- `"weak"`: non-flat, non-insufficient pattern but doesn't meet "strong" criteria.
- `"absent"`: all matched endpoints have flat or insufficient_data patterns.
- Scoring: strong=2, weak=1, absent=0.

---

### FIELD-22 — `treatmentRelatedness.statisticalSignificance`

**Type:** `"significant" | "borderline" | "not_significant"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:computeTreatmentRelatedness()`
**Consumers:** SyndromeContextPanel
**Methods:** @method METRIC-08

**Invariants:**
- Never null.
- Based on minimum p-value across all matched endpoints.
- `"significant"`: min p < 0.05. `"borderline"`: min p < 0.10. `"not_significant"`: min p ≥ 0.10 or no p-values.
- Scoring: significant=1, borderline=0.5, not_significant=0.

---

### FIELD-23 — `treatmentRelatedness.hcdComparison`

**Type:** `"outside_range" | "within_range" | "no_hcd"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:computeTreatmentRelatedness()`
**Consumers:** SyndromeContextPanel (stub)
**Methods:** @method METRIC-08

**Invariants:**
- **Always `"no_hcd"`.** Historical control database is not implemented. Score contribution is always 0.
- Type union retained for future implementation.

**Not:**
- Never display "within historical range" or "outside range" in the UI. The system cannot make this determination.

---

## Adversity Sub-Fields

### FIELD-24 — `adversity.magnitudeLevel`

**Type:** `"minimal" | "mild" | "moderate" | "marked" | "severe"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:deriveMagnitudeLevel()`
**Consumers:** SyndromeContextPanel, adversity logic (FIELD-05)
**Methods:** @method METRIC-10

**Invariants:**
- Never null.
- Based on max |Cohen's d| across matched endpoints:
  - `< 0.5` → `"minimal"`
  - `< 1.0` → `"mild"`
  - `< 1.5` → `"moderate"`
  - `< 2.0` → `"marked"`
  - `≥ 2.0` → `"severe"`
- Feeds adversity decision tree: `severe`/`marked` → adverse regardless of other factors.

**Not:**
- Not the histopathologic severity grade (FIELD-11). This is statistical magnitude, that is pathologist grading.
- Thresholds are adapted from Cohen's standard (0.2/0.5/0.8) for preclinical context with small n.

---

### FIELD-25 — `adversity.adaptive`

**Type:** `boolean`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:checkAdaptivePattern()`
**Consumers:** SyndromeContextPanel
**Methods:** @method METH-25

**Invariants:**
- Only true for XS01 (hepatocellular injury).
- Requires ALL: liver weight increase (OM), hypertrophy (MI or histopath), NO necrosis/degeneration, AND ALT/AST fold change < 5×.
- When true, adversity.overall is forced to `"equivocal"` (not adverse).
- Always false for non-XS01 syndromes.

---

### FIELD-26 — `adversity.stressConfound`

**Type:** `boolean`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:computeAdversity()`
**Consumers:** SyndromeContextPanel
**Methods:** @method METH-24

**Invariants:**
- Only true when XS08 (stress response syndrome) is co-detected AND the current syndrome's matched endpoints are ALL stress-related endpoints.
- Only evaluated for XS07 (immune) and XS04 (myelosuppression).
- When true: adversity → `"equivocal"`, certainty downgraded by one level.
- Stress endpoints: lymphocytes, leukocytes, body weight, thymus/spleen/adrenal organ weights.

---

## Translational Confidence Fields

### FIELD-27 — `interpretation.translationalConfidence.tier`

**Type:** `"high" | "moderate" | "low" | "insufficient_data"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:computeTranslationalConfidence()`
**Consumers:** SyndromeContextPanel
**Methods:** @method METRIC-09

**Invariants:**
- Never null.
- Based on SOC-level and endpoint-level LR+ (likelihood ratio positive) from concordance data.
- `"high"`: endpoint LR+ ≥ 10 or SOC LR+ ≥ 5.
- `"moderate"`: endpoint LR+ ≥ 3 or SOC LR+ ≥ 2.
- `"low"`: data available but below moderate threshold.
- `"insufficient_data"`: species not in concordance database or no SOC mapping.
- Data version tracked in `dataVersion` field (currently `"concordance-v0"`).

**Not:**
- Not a measure of certainty or adversity. It's about cross-species predictivity (will this finding translate to humans?).
- SOC LR+ data is hand-seeded from Liu & Fan 2026. Limited coverage. Absence ≠ low concordance.

---

## Recovery Sub-Fields

### FIELD-28 — `recovery.endpoints[]`

**Type:** `EndpointRecovery[]`
**Scope:** syndrome-level (contains per-endpoint, per-sex entries)
**Source:** `syndrome-interpretation.ts:assessSyndromeRecovery()`
**Consumers:** SyndromeContextPanel, RecoveryPane
**Methods:** @method CLASS-10

**Invariants:**
- Array can be empty (no matched endpoints found in recovery data, or food consumption fallback used).
- Each entry has: `label`, `canonical`, `sex`, `terminalEffect`, `recoveryEffect`, `recoveryPValue`, `status`, `recoveryDay`.
- `terminalEffect` is from the terminal sacrifice EndpointSummary's maxEffectSize.
- `recoveryEffect` and `recoveryPValue` are from the highest dose level's recovery arm data.
- `status` per endpoint uses the 33%/50% thresholds (see FIELD-06).

---

## Food Consumption Fields

### FIELD-29 — `foodConsumptionContext.bwFwAssessment`

**Type:** `"primary_weight_loss" | "secondary_to_food" | "malabsorption" | "not_applicable"`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:assessFoodConsumptionContext()`
**Consumers:** SyndromeContextPanel
**Methods:** (no dedicated method ID — inline assessment)

**Invariants:**
- Never null.
- `"not_applicable"`: food consumption data not available or syndrome not BW-relevant.
- `"secondary_to_food"`: food consumption decreased, body weight loss explained by reduced intake.
- `"primary_weight_loss"`: body weight decreased but food consumption normal — direct toxicity.
- `"malabsorption"`: food efficiency reduced without food consumption decrease.
- When `"secondary_to_food"`: adversity sub-field `secondaryToOther` is set to true.

---

## Mortality Sub-Fields

### FIELD-30 — `mortalityContext.mortalityNoaelCapRelevant`

**Type:** `boolean | null`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:assessMortalityContext()`
**Consumers:** SyndromeContextPanel
**Methods:** @method CLASS-14

**Invariants:**
- Tri-state: `true` = deaths in syndrome organs (cap is relevant), `false` = no organ match (cap exists but irrelevant to this syndrome), `null` = syndrome has no defined organs (cannot determine).
- Only meaningful when `mortalityNoaelCap` is non-null.

---

## Endpoint Group Stats

### FIELD-31 — `endpoint.controlStats` / `endpoint.worstTreatedStats`

**Type:** `{ n: number; mean: number; sd: number } | null` and `{ n: number; mean: number; sd: number; doseLevel: number } | null`
**Scope:** endpoint-level
**Source:** `derive-summaries.ts:deriveEndpointSummaries()`
**Consumers:** DoseResponseView, fold change recomputation (FIELD-15)
**Methods:** (REM-05 derivation, no dedicated method ID)

**Invariants:**
- Both null when no `scheduled_group_stats` from backend.
- `controlStats` is for dose_level 0 only.
- `worstTreatedStats` selects the dose group with the most extreme deviation from control **in the direction of the endpoint's direction** (↑ = highest mean, ↓ = lowest mean, ambiguous = largest |deviation|).
- When these exist, `maxFoldChange` (FIELD-15) is **recomputed** from them, overriding the backend value.

**Null means:** Backend didn't provide group statistics for this endpoint.

---

## Species/Study Context Fields

### FIELD-32 — `interpretation.speciesMarkers`

**Type:** `{ present: string[]; absent: string[]; narrative: string | null; certaintyBoost: boolean }`
**Scope:** syndrome-level
**Source:** `syndrome-interpretation.ts:checkSpeciesPreferredMarkers()`
**Consumers:** SyndromeContextPanel
**Methods:** @method METH-26

**Invariants:**
- Always present in interpretation output.
- `present`: species-preferred biomarkers that were detected (e.g., ALT for rat).
- `absent`: species-preferred biomarkers expected but not found.
- `certaintyBoost`: true when a species-preferred marker is both present AND significant.
- `narrative`: null when no species-specific markers defined for this syndrome/species.

---

### FIELD-33 — `doseGroup.pooled_n_*`

**Type:** `{ pooled_n_male: number; pooled_n_female: number; pooled_n_total: number }`
**Scope:** study-level (per dose group)
**Source:** `backend/services/analysis/dose_groups.py:build_dose_groups()`
**Consumers:** DoseResponseView, dose group headers
**Methods:** @method DATA-01

**Invariants:**
- `pooled_n_total >= n_total` — always, since pooled includes main + recovery.
- When no recovery animals exist, `pooled_n_total === n_total`.
- `pooled_n_total = n_total + recovery_n` for groups with paired recovery arms.
- Only reflects subject counts, not record counts. Record filtering (treatment-period only) is handled separately by `filter_treatment_period_records()`.

**Null means:** Field absent → no recovery pooling data available. Frontend falls back to `n_total`.

**Not:** These are not the N values in per-finding `group_stats`. Finding-level N reflects actual data availability at each timepoint (subjects may have missing records). `pooled_n_*` is the maximum possible N when pooling.

---

## Signal Scoring Fields

### FIELD-34 — `EndpointWithSignal.signal`

**Type:** `number`
**Scope:** endpoint-level
**Source:** `findings-rail-engine.ts:computeEndpointSignal()`
**Consumers:** FindingsRail sorting/filtering

**Invariants:**
- Never null. Always ≥ 0.
- Composite score combining: severity weight (adverse=3, warning=1), p-value weight (-log10), effect size magnitude (capped at ±5), treatment-related boost (+2), pattern weight (per PATTERN_WEIGHTS), syndrome boost (+3 if in syndrome), coherence boost (+2 for 3+ domains), clinical floor (S4=15, S3=8, S2=4, S1=0), and confidence multiplier (HIGH=1.0, MODERATE=0.7, LOW=0.4).
- Result is `max(base + synBoost + cohBoost, clinicalFloor)`.
- Per-sex pattern divergence uses worst (highest-weight) pattern.

**Null means:** N/A — never null (defaults to floor).

**Not:**
- Not the backend `signal_score` (that's study-signal-summary level). This is the frontend per-endpoint composite for rail ordering.

---

### FIELD-35 — `EndpointConfidence`

**Type:** `"HIGH" | "MODERATE" | "LOW"`
**Scope:** endpoint-level
**Source:** `findings-rail-engine.ts:classifyEndpointConfidence()`
**Consumers:** signal scoring (FIELD-34 confidence multiplier)

**Invariants:**
- Never null. Defaults to `"LOW"`.
- `"HIGH"`: p < 0.01 + |effect| ≥ 0.8 + clear monotonic/threshold pattern.
- `"MODERATE"`: moderate p or effect or treatment-related pattern.
- `"LOW"`: default when criteria not met.
- Modifiers: treatment-related (+1 tier max), multiple sexes (+1 tier max).

**Null means:** N/A — never null.

**Not:**
- Not syndrome-level `patternConfidence` (FIELD-03). This is per-endpoint, not per-syndrome.

---

### FIELD-36 — `GroupCard.groupSignal`

**Type:** `number`
**Scope:** group-level (organ/domain/pattern/syndrome group of endpoints)
**Source:** `findings-rail-engine.ts:groupEndpoints()`, `groupEndpointsBySyndrome()`
**Consumers:** FindingsRail group sorting

**Invariants:**
- Never null. Always ≥ 0.
- Sum of `endpoint.signal` (FIELD-34) for all endpoints in the group.
- Used for stable card ordering: highest signal first, ties by adverse count, then alphabetically.

**Null means:** N/A — never null.

---

## Recovery & Finding Nature Fields

### FIELD-37 — `RecoveryClassification.classification`

**Type:** `"EXPECTED_REVERSIBILITY" | "INCOMPLETE_RECOVERY" | "ASSESSMENT_LIMITED_BY_DURATION" | "DELAYED_ONSET_POSSIBLE" | "INCIDENTAL_RECOVERY_SIGNAL" | "PATTERN_ANOMALY" | "UNCLASSIFIABLE"`
**Scope:** finding-level (histopathology)
**Source:** `recovery-classification.ts:classifyRecovery()`
**Consumers:** HistopathologyContextPanel, RecoveryInsightBlock
**Methods:** @method CLASS-20

**Invariants:**
- Never null. Defaults to `"UNCLASSIFIABLE"`.
- Priority is safety-conservative (first match wins): PATTERN_ANOMALY → DELAYED_ONSET_POSSIBLE → INCOMPLETE_RECOVERY → ASSESSMENT_LIMITED_BY_DURATION → EXPECTED_REVERSIBILITY → INCIDENTAL_RECOVERY_SIGNAL → UNCLASSIFIABLE.
- Guard verdicts (not_examined, insufficient_n, low_power, anomaly, no_data) short-circuit to UNCLASSIFIABLE.
- Neoplastic findings (proliferative nature from FIELD-39) always UNCLASSIFIABLE.
- Combines mechanical recovery assessment with finding nature, dose consistency, and clinical classification.

**Null means:** N/A — never null.

---

### FIELD-38 — `RecoveryClassification.confidence`

**Type:** `"High" | "Moderate" | "Low"`
**Scope:** finding-level (histopathology)
**Source:** `recovery-classification.ts:classifyRecovery()`, `computeConfidence()`
**Consumers:** HistopathologyContextPanel (confidence badges)

**Invariants:**
- Never null.
- Score-based: sample size (≥10=+2, ≥5=+1), incidence delta (≥30%=+2, ≥15%=+1), severity delta (≥1.0=+1), dose-response p<0.05 (+1), cross-domain corroboration (+1).
- Caps (one-directional down only): weak dose-consistency → MODERATE cap, examined<5 → LOW cap, normal signal + no clinical match → MODERATE cap.
- Mapping: score ≥5=High, ≥3=Moderate, <3=Low.

**Null means:** N/A — never null.

---

### FIELD-39 — `FindingNatureInfo.nature`

**Type:** `"adaptive" | "degenerative" | "proliferative" | "inflammatory" | "depositional" | "vascular" | "unknown"`
**Scope:** finding-level (histopathology)
**Source:** `finding-nature.ts:classifyFindingNature()`
**Consumers:** recovery classification (FIELD-37), protective signal (FIELD-42), histopath insights

**Invariants:**
- Never null. Defaults to `"unknown"`.
- CT-normalized lookup (via `finding-term-map.ts`) takes precedence over substring matching fallback.
- Proliferative = neoplastic (irreversible). Adaptive = hypertrophy, hyperplasia, vacuolation (reversible). Degenerative = fibrosis, sclerosis, necrosis (moderate to irreversible).

**Null means:** N/A — never null.

---

### FIELD-40 — `FindingNatureInfo.expected_reversibility`

**Type:** `"high" | "moderate" | "low" | "none"`
**Scope:** finding-level (histopathology)
**Source:** `finding-nature.ts:classifyFindingNature()`, `modulateBySeverity()`
**Consumers:** recovery classification (FIELD-37), clinical decision support

**Invariants:**
- Never null. Defaults to `"moderate"` for unknown nature.
- Base from keyword table or CT mapping. Severity modulation can only **reduce** expectations, never raise.
- `"high"` = adaptive in low severity. `"moderate"` = inflammatory/degenerative mild. `"low"` = depositional, highly severe adaptive. `"none"` = proliferative, fibrotic, sclerotic.

**Null means:** N/A — never null.

---

### FIELD-41 — `FindingNatureInfo.typical_recovery_weeks`

**Type:** `number | null`
**Unit:** weeks
**Scope:** finding-level (histopathology)
**Source:** `finding-nature.ts:classifyFindingNature()`, severity modulation
**Consumers:** recovery context, duration assessment

**Invariants:**
- Always null for findings with `expected_reversibility: "none"` (irreversible).
- Severity modulation scales base weeks by multiplier (adaptive low=1.0, mid=1.5, high=2.0; degenerative high=2.5).
- Result is rounded.

**Null means:** No typical recovery timeline exists — cannot predict reversibility duration.

---

## Protective Signal Fields

### FIELD-42 — `ProtectiveSignalResult.classification`

**Type:** `"pharmacological" | "treatment-decrease" | "background" | null`
**Scope:** finding-level (histopathology, decreased incidence)
**Source:** `protective-signal.ts:classifyProtectiveSignal()`
**Consumers:** FindingsRail, rule synthesis

**Invariants:**
- Null if direction != "decreasing" (not a protective signal candidate).
- When non-null, never null within the three tiers (defaults to `"background"`).
- `"pharmacological"`: strong dose-response + ≥2 cross-domain correlates + not a consequence finding.
- `"treatment-decrease"`: strong DR OR (moderate + ≥1 correlate) OR consequence finding.
- `"background"`: all others, or decrease magnitude <15pp, or control <10%.
- Magnitude check: controlIncidence - highDoseIncidence ≥ 0.15.

**Null means:** Not a protective signal (increasing or flat pattern).

---

## Clinical Significance Fields

### FIELD-43 — `LabClinicalMatch`

**Type:** composite `{ ruleId, ruleName, severity, category, matchedEndpoints, foldChanges, confidenceScore, confidence, source, sex }`
**Scope:** endpoint-level (rule match)
**Source:** `lab-clinical-catalog.ts:evaluateLabRules()`
**Consumers:** AdverseEffectsView clinical annotations, context panels

**Invariants:**
- `evaluateLabRules()` returns an array; empty array if no matches.
- 31 rules (L01-L31) grouped as liver/graded/governance.
- Severity order: S4 > S3 > S2 > S1. Deduplication keeps highest severity per endpoint+sex combo.
- Confidence scale: score ≥4=HIGH, 1-3=MODERATE, ≤0=LOW.
- Governance rules (L26-L27) contribute to confidence modifiers but not severity triggers.

**Null means:** N/A — returns empty array when no rules match.

---

## NOAEL & Narrative Fields

### FIELD-44 — `NoaelNarrative`

**Type:** composite `{ summary, loael_findings, loael_details, noael_basis, mortality_context }`
**Scope:** study-level (per sex)
**Source:** `noael-narrative.ts:generateNoaelNarrative()`
**Consumers:** NoaelDecisionView banner, context panel

**Invariants:**
- `loael_findings` capped to top 3 adverse, treatment-related endpoints by |effect size| at LOAEL dose.
- `noael_basis` is one of: `"adverse_findings"`, `"control_noael"`, `"not_established"`.
- `dose_dependent` = pattern is monotonic_* or threshold* (not flat/no_pattern).
- `mortality_context` only populated if `mortality.has_mortality === true`.

**Null means:** `mortality_context` is null if no deaths; `loael_findings` empty if no adverse findings at LOAEL.

---

## Rule Synthesis Fields

### FIELD-45 — `SynthLine`

**Type:** composite `{ text, isWarning, chips?, endpoints?, qualifiers?, listItems? }`
**Scope:** study-level (organ-scoped or study-scoped)
**Source:** `rule-synthesis.ts:synthesize()`
**Consumers:** InsightsList, signals panel

**Invariants:**
- Returns array; empty when no rules match.
- One line per synthesis pattern (signal, clinical, histopath, protective, correlation, NOAEL).
- Collapses R10/R11 (effects) + R04 (adverse) into endpoints with qualifiers (adverse, dose-dependent, both sexes, M/F only).
- R12/R13 (histopath) deduplicated by finding+specimen. R16 (correlation) renders as chips.
- Findings deduplicated by key (finding+specimen) with sex aggregation. List items sorted alphabetically.

**Null means:** N/A — empty array means no synthesis lines.

---

### FIELD-46 — `OrganGroup.tier`

**Type:** `"Critical" | "Notable" | "Observed"`
**Scope:** organ-level
**Source:** `rule-synthesis.ts:computeTier()`
**Consumers:** signals panel organ grouping, priority sort

**Invariants:**
- Never null. Defaults to `"Observed"`.
- `"Critical"`: has R08 (target organ marker).
- `"Notable"`: has R04 (adverse) + real R10 (warning severity, not dampened) + ≥2 warning endpoints, OR only R04/R10.
- `"Observed"`: has R01 (dose-dependent, ≥2 endpoints) or lower.
- R10 only counts as adverse when `severity="warning"` (dampened R10 with `severity="info"` doesn't raise tier).

**Null means:** N/A — never null.

---

### FIELD-47 — `AggregatedFinding.category`

**Type:** `"adverse" | "protective" | "trend" | "info"`
**Scope:** finding-level
**Source:** `finding-aggregation.ts:aggregateByFinding()`
**Consumers:** FindingsRail grouping/filtering, evidence panel

**Invariants:**
- Never null.
- Determined by highest-priority rule in group: R04/R12/R13=adverse, R10 warning=adverse, R10 info=info, R18/R19 unexcluded=protective, R01/R03/R05=trend, others=info.
- Priority order: adverse > protective > trend > info.
- R18/R19 excluded by backend (`protective_excluded` flag) downgrade to info.

**Null means:** N/A — never null.

---

### FIELD-48 — `PanelStatement`

**Type:** composite `{ id, priority, icon, text, section, organSystem, clickEndpoint, clickOrgan }`
**Scope:** study-level (per section)
**Source:** `signals-panel-engine.ts:deriveNoaelRules()`, `deriveOrganRules()`, `deriveStudyRules()`, `deriveSynthesisPromotions()`
**Consumers:** NoaelDecisionView signals panel

**Invariants:**
- Priority bands: 900–1000=DecisionBar (NOAEL), 800–899=TargetOrgansHeadline, 600–799=TargetOrgansEvidence, 400–599=Modifiers, 200–399=Caveats.
- Icons: fact (blue), warning (orange), review-flag (red).
- Section assigned by priority band via `assignSection()`.
- Statements within section sorted by priority descending.

**Null means:** `organSystem`/`clickEndpoint`/`clickOrgan` null for study-level statements.

---

## Statistical Method Fields

### FIELD-49 — `effectSize` (transformed)

**Type:** `number | null`
**Unit:** standardized mean difference (method-dependent)
**Scope:** pairwise comparison (endpoint × dose level)
**Source:** `stat-method-transforms.ts:computeEffectSize()`, `applyEffectSizeMethod()`
**Consumers:** DoseResponseView, FindingsRail, signal scoring

**Invariants:**
- Null if insufficient data (n<2, sd=0, missing values).
- Hedges' g (backend default) passes through unchanged (fast path).
- Cohen's d and Glass's delta recompute from `group_stats`.
- Glass's delta uses control SD; Hedges' g and Cohen's d use pooled SD with bias correction (Hedges only).
- Magnitude preserved; sign indicates direction.

**Null means:** Insufficient statistical data to compute.

**Not:**
- Not the raw backend `cohens_d` field — this is the frontend-transformed value that respects the user's selected method.

---

### FIELD-50 — `pValue` (multiplicity-corrected)

**Type:** `number | null`
**Unit:** p-value (0–1)
**Scope:** pairwise comparison (endpoint × dose level)
**Source:** `stat-method-transforms.ts:applyMultiplicityMethod()`
**Consumers:** DoseResponseView, significance thresholds

**Invariants:**
- Dunnett-FWER (backend default) returns p unchanged (fast path).
- Bonferroni: `min(p_value_welch × k, 1.0)` where k = number of treated groups. Falls back gracefully if Welch p absent.
- Always ≤ 1.0.

**Null means:** Welch p-value not present or data insufficient for Welch test.

**Not:**
- Not the raw backend `p_value_adj` — this is the frontend-transformed value that respects the user's selected multiplicity correction method.

---

### FIELD-51 — `NormalizationDecision` (organ weight normalization)

**Type:** `{ mode, tier, confidence, rationale[], warnings[], brainAffected, userOverridden }`
**Scope:** per-organ × per-dose-group
**Source:** `organ-weight-normalization.ts:decideNormalization()`, hook `useOrganWeightNormalization(studyId)`
**Consumers:** StudySummaryView (auto-set), StudyDetailsContextPanel (summary), OrganContextPanel (pane), FindingsContextPanel (OM annotation), SyndromeContextPanel (term annotation, B-7), syndrome-interpretation.ts (B-7 adversity factor)

**Invariants:**
- `tier` is 1–4, monotonically increasing with |BW Hedges' g|.
- `mode` is one of `"absolute"`, `"body_weight"`, `"brain_weight"`, `"ancova"`.
- `rationale` is non-empty for tier >= 2.
- `effectDecomposition` is always null in Phase 1.
- Session state `organWeightMethod` auto-set only when tier >= 3 and current value is `"absolute"`.

**Null means:** Insufficient BW or OM data (< 2 dose groups, no OM domain findings).

**Not:**
- Not a backend field — computed entirely in frontend from existing group_stats.
- Not persisted — recomputed from cached findings on each mount.

---

### FIELD-52 — `adversity.secondaryToBW`

**Type:** `{ isSecondary: boolean; confidence: string; bwG: number } | null`
**Scope:** per-syndrome adversity assessment
**Source:** `syndrome-interpretation.ts:computeAdversity()` via `assessSecondaryToBodyWeight()`
**Consumers:** SyndromeContextPanel (B-7 factor display), narrative generation

**Invariants:**
- Non-null only when normalization tier >= 3 in Phase 1 (heuristic).
- Phase 2+: uses `proportionDirect` threshold from ANCOVA effect decomposition.
- `confidence` is `"low"` in Phase 1 (no ANCOVA), `"medium"` or `"high"` in Phase 2+.

**Null means:** No normalization context provided, or BW effect too small (tier < 3).

---

## ID Allocation

| Range | Category | Count |
|-------|----------|-------|
| FIELD-01 – FIELD-07 | Syndrome interpretation (priority) | 7 |
| FIELD-08 – FIELD-17 | Endpoint summary | 10 |
| FIELD-18 – FIELD-20 | Syndrome detection | 3 |
| FIELD-21 – FIELD-23 | Treatment-relatedness sub-fields | 3 |
| FIELD-24 – FIELD-26 | Adversity sub-fields | 3 |
| FIELD-27 | Translational confidence | 1 |
| FIELD-28 | Recovery sub-fields | 1 |
| FIELD-29 | Food consumption | 1 |
| FIELD-30 | Mortality sub-fields | 1 |
| FIELD-31 | Endpoint group stats | 1 |
| FIELD-32 | Species context | 1 |
| FIELD-33 | Pooled N (recovery treatment-period) | 1 |
| FIELD-34 – FIELD-36 | Signal scoring | 3 |
| FIELD-37 – FIELD-41 | Recovery & finding nature | 5 |
| FIELD-42 | Protective signal | 1 |
| FIELD-43 | Clinical significance | 1 |
| FIELD-44 | NOAEL narrative | 1 |
| FIELD-45 – FIELD-48 | Rule synthesis & aggregation | 4 |
| FIELD-49 – FIELD-50 | Statistical method transforms | 2 |
| FIELD-51 – FIELD-52 | Organ weight normalization | 2 |
| FIELD-53+ | Reserved for future fields | — |

Total: 52 fields documented.
