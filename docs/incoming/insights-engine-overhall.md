# **Insights engine overhall**

# **Issue 1 — Dedup Failure (Adverse \+ Trend)**

### **Nature**

Pure **classification-layer bug**.

The problem is that classification is direction-based, not identity-based.

Your current logic:

`if (dir === "up" && adverseEvidenceMap.has(finding)) continue;`  
`if (dir === "down" && protectiveMap.has(finding)) continue;`

This assumes:

* Up \= adverse

* Down \= protective

But biological meaning ≠ direction.

Testis weight ↓ is clearly adverse.

---

## **✅ Correct Model**

You need **priority-based finding ownership**, not direction filters.

### **Canonical rule:**

`One finding → One category`  
`Priority: Adverse > Protective > Trend`

### **Suggested architecture**

Instead of filtering trends during render, build a **finding index first**:

`type FindingCategory = "adverse" | "protective" | "trend";`

`interface FindingState {`  
  `id: string;`  
  `category: FindingCategory;`  
  `sourceRules: string[];`  
`}`

Algorithm:

1. Collect all rule hits

2. Group by finding

3. Assign highest priority category

Pseudo:

`if (adverse.has(f)) {`  
  `category = "adverse";`  
`} else if (protective.has(f)) {`  
  `category = "protective";`  
`} else if (trend.has(f)) {`  
  `category = "trend";`  
`}`

Render only that.

---

### **Why this is important long-term**

If you don’t fix this structurally, you’ll keep getting edge cases like:

* Trend \+ clinical signal

* Protective \+ conflicting severity rule

* Multi-sex divergence

This should be solved at the **classification aggregation layer**, not patched in UI logic.

---

# **🟠 Issue 2 — R01 vs R07 Logical Contradiction**

### **Nature**

Not a bug. It’s a **hierarchical rule collision**.

* R01 \= statistical significance

* R07 \= pattern diagnostic

They operate at different analytical layers.

The real issue:  
 You don’t have rule precedence defined.

---

## **✅ Correct Model: Rule Taxonomy**

You need rule tiers:

| Tier | Type | Examples |
| ----- | ----- | ----- |
| Tier 1 | Statistical signal | R01 |
| Tier 2 | Pattern diagnostics | R07 |
| Tier 3 | Context modifiers | Sex-specific |
| Tier 4 | Narrative amplifiers | Domain flags |

Then define suppression:

`If Tier 1 fires → suppress Tier 2 for same finding`

This prevents contradictory narratives.

---

### **Deeper Insight**

R07 is not contradictory — it's diagnostic metadata.  
 It should enrich R01, not compete with it.

Better output:

Significant dose-dependent decrease (p=0.0105), non-monotonic pattern.

That’s coherent.

So long-term:  
 **Convert R07 from insight to modifier.**

---

# **🟡 Issue 3 — R10 Over-Sensitivity (Cohen’s d with n=1)**

This is not just a statistical issue.

It’s a credibility issue.

Cohen’s d assumes distribution variance.  
 With n=1, variance collapses → effect explodes.

This is mathematically correct but epistemically wrong.

---

## **✅ Correct Fix**

Never gate by effect size alone.

Add minimum support criteria:

`n_affected >= 2`  
`AND`  
`group_size >= threshold`

Or:

Use:

* Fisher’s exact test for incidence

* Not Cohen’s d

---

### **Better R10 Condition**

Instead of:

`abs(d) >= 2`

Use:

`abs(d) >= 2`  
`AND n_affected >= 2`  
`AND incidence >= 10%`

Or downgrade:

Large effect (d=4.0, single animal)

The key principle:

Effect size without replication \= anecdote.

---

# **🟣 Issue 4 — ATROPHY Domain Gap**

This is where your system becomes next-level.

Your engine is purely statistical.

Regulatory tox is not.

Certain findings are:

* Sentinel findings

* Mechanistically critical

* Regulatory red flags

Even at 1/15.

---

## **✅ This Requires a Clinical Weighting Layer**

Add a domain rule tier:

`interface ClinicalPriority {`  
  `finding: string;`  
  `organ: string;`  
  `severity: number;`  
  `weight: number;`  
`}`

Examples:

* Testicular atrophy → High weight

* Neoplasia → High weight

* Neurodegeneration → High weight

Then classification becomes:

`if clinical_weight >= threshold:`  
    `elevate to adverse regardless of p-value`

This is not statistical inference.  
 It is regulatory knowledge encoding.

And this is where you beat competitors.

---

# **🟢 Issue 5 — Protective Rules Lack Context**

This is subtle and important.

R18/R19 are naive:

“Control 10% → Treated 0% \= protective.”

But:

* Control noise exists

* Organ context matters

* Some organs shouldn't be interpreted “protectively”

---

## **✅ Fix Strategy**

Protective confidence \= function of:

`baseline incidence`  
`organ`  
`finding type`  
`dose-dependence`  
`biological plausibility`

Example weighting:

`confidence =`  
  `(control_incidence >= 20%)`  
  `AND (dose-dependent decrease)`  
  `AND (organ not reproductive)`

Testis small → low confidence  
 Bone marrow vacuoles → moderate confidence

Add a confidence badge:

* High

* Moderate

* Low

That preserves signal without misleading users.

---

# **🔵 Issue 6 — Regex-Based Parsing**

This is the most serious architectural risk.

Right now your frontend depends on text formatting staying stable.

That is fragile by design.

---

## **✅ Proper Fix**

Backend `_emit()` should return:

`{`  
  `"rule_id": "R01",`  
  `"finding": "TESTIS (WEIGHT)",`  
  `"direction": "down",`  
  `"p_value": 0.0105,`  
  `"effect_size": -1.2,`  
  `"organ_system": "Reproductive",`  
  `"severity": 3,`  
  `"output_text": "Significant dose-dependent decrease..."`  
`}`

Frontend should use:

* Structured fields for logic

* output\_text only for display

Never parse narrative text.

---

# **🎯 If I Were Architecting SEND v2 Insights**

I would separate:

### **1️⃣ Detection Layer (pure rules engine)**

Produces structured signals.

### **2️⃣ Aggregation Layer**

Resolves:

* Dedup

* Priority

* Suppression

### **3️⃣ Clinical Weighting Layer**

Encodes regulatory domain logic.

### **4️⃣ Narrative Layer**

Generates user-readable summaries.

---

# **🧠 The Meta-Observation**

You are at the transition point from:

“Statistical rule engine”

to

“Clinical decision-support engine”

That’s a big evolution.

Most competitors (including legacy tox tools) never formalize this properly.

If you implement:

* Structured rule outputs

* Priority taxonomy

* Clinical weighting

* Support-aware effect thresholds

You’ll have one of the most robust SEND insight engines in the industry.

## **1\) Formal rule hierarchy spec**

### **1.1 Core concepts**

**FindingKey (canonical identity)**  
 A finding must have a stable identity across rules, text templates, and views.

Minimum:

* `domain` (e.g., BW, CL, MI, TF)

* `specimen` (e.g., TESTIS, LIVER)

* `finding` (e.g., WEIGHT, ATROPHY)

* `sex` (M/F/Combined/Unknown)

* `timepoint` (optional; e.g., terminal, day X)

Example:

`type Sex = "M" | "F" | "Both" | "Unknown";`  
`type Direction = "up" | "down" | "none";`

`interface FindingKey {`  
  `domain: string;`  
  `specimen: string;`  
  `finding: string;`  
  `sex: Sex;`  
  `timepoint?: string;`  
`}`

**Signal (raw rule output)**  
 Every rule emits a structured signal with confidence \+ evidence.

`type SignalTier =`  
  `| "Tier1_Significance"     // p-values, formal tests`  
  `| "Tier2_Effect"           // effect size, magnitude thresholds`  
  `| "Tier3_Pattern"          // monotonicity, U-shape, step inconsistency`  
  `| "Tier4_Context"          // baseline incidence, historical control, plausibility`  
  `| "Tier5_Clinical"         // sentinel finding policies, organ-specific rules`  
  `| "Tier6_Narrative";       // text-only, explanation, labeling`

`type SignalPolarity = "adverse" | "protective" | "trend" | "neutral";`

`interface Evidence {`  
  `metric: string;                 // "p_value", "cohens_d", "incidence_delta"`  
  `value: number | string;`  
  `n_control?: number;`  
  `n_treated?: number;`  
  `n_affected?: number;`  
  `direction?: Direction;`  
  `notes?: string[];`  
`}`

`interface Signal {`  
  `ruleId: string;                 // "R01"`  
  `tier: SignalTier;`  
  `polarity: SignalPolarity;`  
  `findingKey: FindingKey;`  
  `direction: Direction;`  
  `strength: number;               // 0..1 (rule-level confidence)`  
  `evidence: Evidence[];`  
  `tags?: string[];                // ["non_monotonic", "n_small", "single_animal"]`  
`}`

**Insight (final surfaced item)**  
 An insight is the resolved output after dedup \+ suppression \+ clinical weighting.

`type InsightCategory = "Adverse" | "Protective" | "Trend" | "Informational";`

`interface Insight {`  
  `findingKey: FindingKey;`  
  `category: InsightCategory;`  
  `headline: string;`  
  `detail: string[];`  
  `supportingSignals: Signal[];`  
  `confidence: "High" | "Medium" | "Low";`  
  `flags?: string[]; // ["Sentinel", "SparseData", "TemplateRisk", ...]`  
`}`

---

### **1.2 Priority & ownership (solves Issue \#1)**

**One finding → one surfaced category** (ownership):  
 `Adverse > Protective > Trend > Informational`

Ownership is determined *after* suppression and clinical weighting.

Algorithm (high level):

1. Group signals by `FindingKey`

2. Apply **suppression rules** (below)

3. Apply **clinical weighting overrides** (Tier5)

4. Assign final category by highest-priority remaining polarity

5. Compose narrative

---

### **1.3 Suppression rules (solves Issue \#2)**

Suppression is a rule graph that prevents contradictory or redundant messaging.

**Suppression rule format**

`interface SuppressionRule {`  
  `when: {`  
    `present: { ruleIds?: string[]; tiers?: SignalTier[]; polarity?: SignalPolarity[] };`  
    `sameFinding: boolean;`  
  `};`  
  `suppress: { ruleIds?: string[]; tiers?: SignalTier[] };`  
  `reason: string;`  
`}`

**Baseline suppression set (recommended)**

1. **Significance subsumes pattern**

* If Tier1 significance exists for a finding (e.g., R01), suppress Tier3 pattern-only signals (e.g., R07) *as standalone insights*.

* Pattern can remain as a **modifier tag** on the Tier1 insight.

2. **Adverse trumps trend**

* If any adverse signal survives for a finding, suppress trend signals for that finding (but allow trend facts in the detail section).

3. **Clinical override trumps “normal”**

* If Tier5 clinical-sentinel triggers, suppress “normal/no-signal” narratives.

4. **Sparse-data dampener**

* If any signal’s evidence indicates `n_affected < min` or `group_n < min`, suppress “strong alarm” phrasing and force confidence down.

Practical example for your R01/R07 case:

* Keep R01 surfaced.

* Convert R07 into tag: `["non_monotonic_pattern"]`

* Add to detail: “Pattern non-monotonic across doses.”

---

### **1.4 Confidence model (internal, used by hierarchy)**

Each signal gets a `strength` (0..1). Then insight confidence is aggregated.

Suggested components:

* **Data support**: sample sizes, n\_affected

* **Statistical robustness**: p-value, multiple testing considerations (if any)

* **Replication across sex/timepoint**

* **Cross-domain corroboration** (e.g., weight decrease \+ atrophy)

Rule authors set a base strength; engine adjusts via modifiers:

* `n_affected==1` → cap strength at 0.35

* `p<0.01` with adequate n → bump \+0.1 (cap 1.0)

* corroboration across domains → bump \+0.15

---

### **1.5 Output contract (solves Issue \#6)**

Backend `_emit()` must return `Signal` with structured params.  
 Frontend must never parse template strings. `output_text` becomes display-only.

---

## **2\) Automatic scoring model for insight quality**

This is for *programmatically ranking how well the implementation answers the questions*, across your whole SEND app, not just histopath.

### **2.1 What you score**

You score **each surfaced Insight**, then aggregate to:

* per FindingKey

* per domain/specimen

* per study page (Summary, By Endpoint, By Domain)

* app-wide score

### **2.2 Scoring axes**

Each axis returns 0..1.

1. **Non-duplication (ND)**

* 1.0 if finding appears in exactly one category

* 0.0 if duplicated across categories (your Issue \#1)

* Partial penalties if duplicated but one is suppressed/not surfaced

2. **Logical coherence (LC)**

* Penalize contradictory surfaced statements for same finding.

* Example: “significant dose-dependent” *and* “inconsistent dose-response” as separate insights → strong penalty.

* If pattern is downgraded to modifier → no penalty.

3. **Statistical validity (SV)**

* Penalize signals that violate minimum-support policies.

* Example: Cohen’s d with `n_affected=1` flagged but still surfaced as strong → penalty.

* If surfaced with explicit qualifier \+ low confidence → smaller penalty.

4. **Clinical relevance (CR)**

* Reward sentinel findings being elevated appropriately.

* Penalize sentinel findings labeled “normal” when incidence is low but clinically meaningful (Issue \#4).

* Reward corroboration: weight change \+ lesion.

5. **Context adequacy (CA)**

* Does the insight provide the minimum context?

  * direction, dose group, effect size or incidence delta

  * sample sizes (`n_control`, `n_treated`, `n_affected`)

  * p-value where applicable

* Missing key context reduces score.

6. **Actionability (AC)**

* Does it answer “so what / what to check next?”

* Reward: links to supporting tables, recommended drill-down view, cross-domain references.

7. **Stability / template risk (TR)**

* Penalize if the insight is derived from regex-parsed text fields.

* This is a system health score: if parsing fragile, overall score decreases.

### **2.3 Scoring formulas (concrete)**

Per insight:

`interface InsightScore {`  
  `ND: number; LC: number; SV: number; CR: number; CA: number; AC: number; TR: number;`  
  `total: number;`  
`}`

Recommended weights (tunable):

* ND 0.15

* LC 0.15

* SV 0.20

* CR 0.20

* CA 0.15

* AC 0.10

* TR 0.05

Total:

`total = 0.15*ND + 0.15*LC + 0.20*SV + 0.20*CR + 0.15*CA + 0.10*AC + 0.05*TR`

#### **Concrete checks**

**ND**

* If `FindingKey` has \>1 surfaced InsightCategory → ND=0

* Else ND=1

**LC**

* If (Tier1 significance surfaced) and (Tier3 pattern surfaced as separate insight) → LC=0.4

* If pattern is modifier only → LC=1

* If adverse \+ protective both surfaced → LC=0

**SV**

* If effect-size rule surfaced AND `n_affected < 2` → SV=0.2 (or 0.0 if unqualified)

* If p-value surfaced but no `n` context → SV=0.6

* If multiple metrics agree and support adequate → SV=1.0

**CR**

* If sentinel in clinical catalog (see section 3\) AND category is Adverse → CR=1

* If sentinel AND category Trend/Normal → CR=0.2

* If non-sentinel but high incidence/severity and flagged → CR high

**CA**

* Required fields checklist:

  * direction ✔

  * dose group(s) ✔

  * effect metric (p or delta or d) ✔

  * n context ✔

* CA \= (\#present / \#required)

**AC**

* If insight references at least one “next view” target (e.g., “Open TF Histopath grid filtered to Testis”) → \+0.3

* If lists corroborating domains/findings → \+0.3

* If suggests confirmatory check (e.g., “review individual animal data”) → \+0.4

**TR**

* If insight derived from structured params → 1

* If derived from regex text parsing → 0.2

### **2.4 Aggregation**

Per finding:

* Use max of totals (or average) depending on whether you want “best representation” or “overall quality”.

Per study page:

* Average weighted by severity/relevance (e.g., Adverse insights weight higher).

System health dashboard:

* Show distribution: % of insights with SV \< 0.5, ND violations count, TR score.

This is the scoring model you can use to regression-test engine changes.

---

## **3\) Regulatory-aware classification schema (clinically weighted tier)**

This addresses Issues \#4 and \#5 and makes “clinical significance” first-class.

### **3.1 Schema goals**

1. Encode **sentinel findings** and organ-system rules (reg tox reality)

2. Provide **incidence/severity thresholds** that are lower for high-risk findings

3. Produce **confidence \+ rationale**, not just a label

4. Remain explainable and configurable (no black box)

### **3.2 Clinical catalog (knowledge base)**

Represent a curated catalog (versioned).

`type ClinicalClass =`  
  `| "Sentinel"        // raise even at low incidence`  
  `| "HighConcern"`  
  `| "ModerateConcern"`  
  `| "BackgroundNoiseSensitive" // needs high baseline to call protective`  
  `| "OrganSpecific";`

`interface ClinicalRule {`  
  `id: string; // "C_TESTIS_ATROPHY_01"`  
  `appliesTo: {`  
    `organSystems?: string[];   // ["Reproductive"]`  
    `specimens?: string[];      // ["TESTIS", "EPIDIDYMIS"]`  
    `findings?: string[];       // ["ATROPHY", "DEGENERATION"]`  
    `domains?: string[];        // optional`  
    `sex?: Sex | "Any";`  
  `};`  
  `clinicalClass: ClinicalClass;`  
  `elevateTo?: "Adverse" | "Protective";`  
  `minIncidenceTreated?: number;    // e.g., 0.05 (5%)`  
  `minNaffected?: number;           // e.g., 1 for sentinel, 2 otherwise`  
  `minSeverity?: number;            // e.g., >= 2`  
  `requireCorroboration?: {`  
    `anyOf: Array<{ specimens?: string[]; findings?: string[]; domains?: string[] }>;`  
  `};`  
  `notes: string[];`  
`}`

**Examples you’d likely want immediately**

* **Reproductive atrophy** (testis/epididymis) → Sentinel

  * `minNaffected=1`, `minSeverity>=2` (or even \>=1 depending), optional corroboration with weight decrease / related lesions

* **Neoplasia** → Sentinel

* **Neurotox** degenerative lesions → HighConcern

* **Bone marrow hypocellularity/fibrosis** → HighConcern

* **Liver necrosis** → HighConcern

This catalog becomes your “clinical tier.”

### **3.3 Classification pipeline (combined statistical \+ clinical)**

For each `FindingKey`, compute:

**A) Statistical signals** (Tier1-3)

* significance, effect, pattern

**B) Clinical signals** (Tier5)

* run clinical rules on incidence/severity/corroboration

* output a Tier5 Signal if triggered

**C) Fusion logic**

1. If Tier5 says `elevateTo: Adverse` → final category Adverse (unless there is a stronger contraindication rule, rare)

2. Else if strong statistical adverse → Adverse

3. Else if protective and context says plausible → Protective

4. Else trend/informational

### **3.4 Protective plausibility (fixes Issue \#5)**

Add a “protective plausibility” gate.

Protective should require:

* baseline incidence above threshold (e.g., control incidence ≥ 20% OR historical-control support)

* biologically plausible organ/finding class (bone marrow vacuoles maybe; “small testis” no)

* not explained by adverse morphology artifact (e.g., atrophy making “small” disappear)

Represent as:

`interface ProtectiveGate {`  
  `minControlIncidence: number;     // default 0.2`  
  `excludedOrganSystems: string[];  // e.g., ["Reproductive"] for some classes`  
  `excludedFindings: string[];      // e.g., ["SMALL"] in testis`  
  `requireDoseResponse?: boolean;`  
`}`

Then protective rules emit:

* either `Protective` with confidence

* or `Trend/Informational` with note: “decrease observed but protective interpretation low-confidence”

### **3.5 Output requirements (explainability)**

When clinical tier triggers, the surfaced insight should explicitly say *why*:

Example:

* Headline: “Testis atrophy observed (sentinel finding)”

* Detail:

  * “Incidence: 1/15 at low dose (severity 4)”

  * “Classified as adverse due to sentinel rule for reproductive atrophy”

  * “Corroboration: dose-dependent testis weight decrease”

This is what regulators and tox folks trust: explicit rationale.

### **3.6 Versioning and governance**

You’ll want:

* `clinical_catalog_version`

* `study_profile` (species/strain optional) for tuning thresholds

* changelog to support auditability

---

## **Practical next steps (implementation order)**

1. **Refactor emit contract**: structured `Signal.params` everywhere (unblocks everything else).

2. Implement **FindingKey grouping \+ ownership** (fix Issue \#1).

3. Add **suppression graph** (Issue \#2 stays safe even if surfaced later).

4. Add **SV gates** (Issue \#3) \+ confidence dampeners.

5. Introduce **clinical catalog** (Issue \#4/5) with a tiny v1 set (repro \+ neoplasia \+ neuro \+ marrow).

6. Build the **scoring dashboard** and make it part of CI/regression testing.

