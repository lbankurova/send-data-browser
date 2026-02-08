# Insights & Synthesis Engine

## Purpose

The Insights & Synthesis Engine converts raw statistical rule results (R01-R17) and derived analytical data into structured, organ-grouped signals for scientist consumption. It enables toxicologists to read deterministic conclusions rather than derive them manually from raw numbers. The system has two major subsystems: a backend **rule engine** that evaluates 16 canonical rules against computed statistics, and a frontend **signals/synthesis engine** that groups, merges, and prioritizes those rules into UI-ready structures for the Signals Panel and InsightsList context panel.

## Architecture

### Data Flow

```
XPT study files
    |
    v
backend/generator/view_dataframes.py
    |-- build_study_signal_summary()   --> study_signal_summary.json
    |-- build_target_organ_summary()   --> target_organ_summary.json
    |-- build_noael_summary()          --> noael_summary.json
    |
    v
backend/generator/scores_and_rules.py
    |-- evaluate_rules()               --> rule_results.json
    |
    v
  (JSON shipped to frontend via API)
    |
    +--> lib/signals-panel-engine.ts   (Signals Panel: Decision Bar + Findings + Modifiers + Caveats)
    |       |
    |       +--> SignalsPanel.tsx (FindingsView component)
    |
    +--> lib/rule-synthesis.ts         (InsightsList context panel: organ-grouped synth lines)
            |
            +--> panes/InsightsList.tsx (context panel component)
```

### Component Relationship

| Layer | File | Consumes | Produces |
|-------|------|----------|----------|
| Backend rule engine | `scores_and_rules.py` | `findings`, `target_organs`, `noael_summary`, `dose_groups` | `rule_results[]` (R01-R17) |
| Backend scoring | `view_dataframes.py` | `findings` (derived from XPT) | `study_signal_summary`, `target_organ_summary`, `noael_summary` |
| Frontend signals engine | `signals-panel-engine.ts` | `NoaelSummaryRow[]`, `TargetOrganRow[]`, `SignalSummaryRow[]` | `SignalsPanelData` (Decision Bar, organ blocks, modifiers, caveats, metrics) |
| Frontend rule synthesis | `rule-synthesis.ts` | `RuleResult[]` | `OrganGroup[]` with tier, synthLines, endpoint signals |
| UI: Signals Panel | `SignalsPanel.tsx` | `SignalsPanelData` | FindingsView (organ cards, modifiers, caveats) |
| UI: InsightsList | `InsightsList.tsx` | `RuleResult[]` (for selected organ/endpoint) | Tiered organ groups with collapsible rule detail |

### Two Parallel Synthesis Paths

The codebase has **two independent synthesis engines** serving different UI surfaces:

1. **`signals-panel-engine.ts`** -- serves the Signals tab center panel (Decision Bar + FindingsView). Derives rules directly from summary data (NOAEL rows, target organ rows, signal rows). Does NOT consume backend `rule_results.json` directly; it re-derives semantic rules from the summary JSON.

2. **`rule-synthesis.ts`** -- serves the InsightsList context panel (right sidebar). Consumes backend `rule_results[]` directly, groups by organ, computes tiers, and synthesizes compact insight lines from R01-R17 output_text parsing.

## Contracts

### Input: rule_results.json schema

Each rule result emitted by `evaluate_rules()` in `scores_and_rules.py`:

```typescript
interface RuleResult {
  rule_id: string;          // "R01" through "R16"
  scope: "endpoint" | "organ" | "study";
  severity: "info" | "warning" | "critical";
  context_key: string;      // "DOMAIN_TESTCODE_SEX" for endpoint scope,
                            // "organ_ORGANSYSTEM" for organ scope,
                            // "study_SEX" for study scope
  organ_system: string;     // e.g., "hepatic", "renal", "" for study-scope
  output_text: string;      // Rendered template string
  evidence_refs: string[];  // e.g., ["LB: ALT (M)"]
}
```

**context_key format examples:**
- Endpoint: `"LB_ALT_M"`, `"MI_HEPATOCELLULAR_HYPERTROPHY_F"`
- Organ: `"organ_hepatic"`, `"organ_renal"`
- Study: `"study_M"`, `"study_Combined"`

### Input: Summary data types (consumed by signals-panel-engine.ts)

```typescript
interface SignalSummaryRow {
  endpoint_label: string;
  endpoint_type: string;
  domain: string;
  test_code: string;
  organ_system: string;
  organ_name: string;
  dose_level: number;
  dose_label: string;
  dose_value: number | null;
  sex: string;
  signal_score: number;        // 0-1 composite
  direction: "up" | "down" | "none" | null;
  p_value: number | null;
  trend_p: number | null;
  effect_size: number | null;  // Cohen's d
  severity: "adverse" | "warning" | "normal";
  treatment_related: boolean;
  dose_response_pattern: string;
  statistical_flag: boolean;
  dose_response_flag: boolean;
  mean: number | null;
  n: number;
}

interface TargetOrganRow {
  organ_system: string;
  evidence_score: number;
  n_endpoints: number;
  n_domains: number;
  domains: string[];
  max_signal_score: number;
  n_significant: number;
  n_treatment_related: number;
  target_organ_flag: boolean;
}

interface NoaelSummaryRow {
  sex: string;
  noael_dose_level: number;
  noael_label: string;
  noael_dose_value: number;
  noael_dose_unit: string;
  loael_dose_level: number;
  loael_label: string;
  n_adverse_at_loael: number;
  adverse_domains_at_loael: string[];
  noael_confidence: number;       // 0.0-1.0 confidence score
}
```

### Output: SignalsPanelData structure

Produced by `buildSignalsPanelData()` in `signals-panel-engine.ts`:

```typescript
type UISection =
  | "DecisionBar"
  | "TargetOrgansHeadline"
  | "TargetOrgansEvidence"
  | "Modifiers"
  | "Caveats"
  | null;

type StatementIcon = "fact" | "warning" | "review-flag";

interface PanelStatement {
  id: string;
  priority: number;
  icon: StatementIcon;
  text: string;
  section: UISection;
  organSystem: string | null;
  clickEndpoint: string | null;
  clickOrgan: string | null;
}

interface OrganBlock {
  organ: string;              // Display name (title-cased)
  organKey: string;           // Raw key (e.g., "hepatic")
  domains: string[];          // e.g., ["LB", "MI", "OM"]
  evidenceScore: number;      // From target_organ_summary
  headline: PanelStatement;   // The "organ.target.identification" statement
  evidenceLines: PanelStatement[];  // Sub-lines (currently unused in code)
  doseResponse: {
    nEndpoints: number;
    topEndpoint: string;
  } | null;
}

interface MetricsLine {
  noael: string;              // e.g., "10 mg/kg" or "Control" or "Not established"
  noaelSex: string;           // e.g., "M+F"
  targets: number;
  significantRatio: string;   // e.g., "107/989"
  doseResponse: number;       // Count of dose-response endpoints
  domains: number;            // Count of distinct domains
}

interface SignalsPanelData {
  decisionBar: PanelStatement[];     // NOAEL-scope rules (priority >= 900)
  studyStatements: PanelStatement[]; // Study-scope facts (priority 650-750)
  organBlocks: OrganBlock[];         // Target organs sorted by evidenceScore desc
  modifiers: PanelStatement[];       // Sex-specific patterns (priority 400-599)
  caveats: PanelStatement[];         // Review flags (priority 200-399)
  metrics: MetricsLine;
}
```

### Output: OrganGroup structure (InsightsList)

Produced by `buildOrganGroups()` in `rule-synthesis.ts`:

```typescript
type Tier = "Critical" | "Notable" | "Observed";

interface SynthLine {
  text: string;
  isWarning: boolean;
  chips?: string[];   // For R16 correlation findings
}

interface OrganGroup {
  organ: string;
  displayName: string;
  tier: Tier;
  rules: RuleResult[];
  synthLines: SynthLine[];
  endpointCount: number;
  domainCount: number;
}
```

### Priority Band to UI Zone Mapping

```typescript
function assignSection(priority: number): UISection {
  if (priority >= 900) return "DecisionBar";
  if (priority >= 800) return "TargetOrgansHeadline";
  if (priority >= 600) return "TargetOrgansEvidence";
  if (priority >= 400) return "Modifiers";
  if (priority >= 200) return "Caveats";
  return null;  // suppressed
}
```

| Priority Range | UI Section | Description |
|----------------|------------|-------------|
| 900-1000 | Decision Bar | NOAEL determination, persistent across modes |
| 800-899 | Target Organs (headline) | Organ identification cards |
| 600-799 | Target Organs (evidence/sub-lines) | Dose-response detail, study-scope statements |
| 400-599 | Modifiers | Sex-specific patterns, always visible |
| 200-399 | Caveats / Review Flags | Low-power warnings, single-domain organs, amber cards |
| < 200 | suppressed | Not rendered |

## Rules

### R01-R17 Reference Table (17 rules)

| ID | Name | Scope | Severity | Condition | Template (abbreviated) | Output |
|----|------|-------|----------|-----------|----------------------|--------|
| R01 | Treatment-related | endpoint | info | `treatment_related == true` | "Treatment-related: {endpoint_label} shows statistically significant dose-dependent change ({direction}) in {sex} ({pattern})." | Per endpoint x sex |
| R02 | Significant pairwise | endpoint | info | `p_value_adj < 0.05` | "Significant pairwise difference at {dose_label} (p={p_value}, d={effect_size})." | Per endpoint x dose |
| R03 | Significant trend | endpoint | info | `trend_p < 0.05` | "Significant dose-response trend (p={trend_p})." | Per endpoint |
| R04 | Adverse severity | endpoint | warning | `severity == "adverse"` | "Adverse finding: {endpoint_label} classified as adverse in {sex} (p={p_value})." | Per endpoint x sex |
| R05 | Monotonic pattern | endpoint | info | `pattern in ("monotonic_increase", "monotonic_decrease")` | "Monotonic dose-response: {endpoint_label} shows {pattern} across dose groups in {sex}." | Per endpoint x sex |
| R06 | Threshold pattern | endpoint | info | `pattern == "threshold"` | "Threshold effect: {endpoint_label} shows threshold pattern in {sex}." | Per endpoint x sex |
| R07 | Non-monotonic | endpoint | info | `pattern == "non_monotonic"` | "Non-monotonic: {endpoint_label} shows inconsistent dose-response in {sex}." | Per endpoint x sex |
| R08 | Target organ | organ | warning | `target_organ_flag == true` | "Target organ: {organ_system} identified with convergent evidence from {n_domains} domains ({domains})." | Per organ |
| R09 | Multi-domain evidence | organ | info | `n_domains >= 2` | "Multi-domain evidence for {organ_system}: {n_endpoints} endpoints across {domains}." | Per organ |
| R10 | Large effect | endpoint | warning | `abs(max_effect_size) >= 1.0` | "Large effect: {endpoint_label} shows Cohen's d = {effect_size} at high dose in {sex}." | Per endpoint x sex |
| R11 | Moderate effect | endpoint | info | `0.5 <= abs(max_effect_size) < 1.0` | "Moderate effect: {endpoint_label} shows Cohen's d = {effect_size} at high dose." | Per endpoint |
| R12 | Histo incidence increase | endpoint | warning | `domain in ("MI","MA","CL") AND direction=="up" AND severity!="normal"` | "Histopathology: increased incidence of {finding} in {specimen} at high dose ({sex})." | Per finding x sex |
| R13 | Severity grade increase | endpoint | info | `domain in ("MI","MA","CL") AND pattern in ("monotonic_increase","threshold") AND avg_severity is not null` | "Severity grade increase: {finding} in {specimen} shows dose-dependent severity increase." | Per finding |
| R14 | NOAEL established | study | info | `noael_dose_level is not null` | "NOAEL established at {noael_label} ({noael_dose_value} {noael_dose_unit}) for {sex}." | Per sex |
| R15 | NOAEL not established | study | warning | `noael_dose_level is null` | "NOAEL not established for {sex}: adverse effects observed at lowest dose tested." | Per sex |
| R16 | Correlated findings | organ | info | `len(organ_findings) >= 2` | "Correlated findings in {organ_system}: {endpoint_labels} suggest convergent toxicity." | Per organ (top 5 labels) |
| R17 | Mortality signal | study | critical | `domain=="DS" AND test_code=="MORTALITY" AND mortality_count > 0` | "Mortality observed: {count} deaths in {sex} with dose-dependent pattern." | Per sex with deaths |

### Rule Evaluation Logic (from scores_and_rules.py)

The `evaluate_rules()` function iterates over three input collections:

**Per-finding loop** (endpoint-scope rules R01-R07, R10-R13):
```python
for finding in findings:
    ctx = _build_finding_context(finding, dose_label_map)

    # R01: Treatment-related
    if finding.get("treatment_related"):
        emit(R01, ctx)

    # R02: Significant pairwise (loops over all pairwise comparisons)
    for pw in finding.get("pairwise", []):
        p = pw.get("p_value_adj", pw.get("p_value"))
        if p is not None and p < 0.05:
            emit(R02, ctx + {dose_label, p_value, effect_size})

    # R03: Significant trend
    if finding.get("trend_p") is not None and finding["trend_p"] < 0.05:
        emit(R03, ctx)

    # R04: Adverse severity
    if finding.get("severity") == "adverse":
        emit(R04, ctx)

    # R05-R07: Pattern-based
    if pattern in ("monotonic_increase", "monotonic_decrease"):
        emit(R05, ctx)
    elif pattern == "threshold":
        emit(R06, ctx)
    elif pattern == "non_monotonic":
        emit(R07, ctx)

    # R10: Large effect (|d| >= 1.0)
    if abs(max_effect_size) >= 1.0:
        emit(R10, ctx)
    # R11: Moderate effect (0.5 <= |d| < 1.0)
    elif abs(max_effect_size) >= 0.5:
        emit(R11, ctx)

    # R12: Histo incidence increase
    if domain in ("MI","MA","CL") and direction == "up" and severity != "normal":
        emit(R12, ctx)

    # R13: Severity grade increase
    if domain in ("MI","MA","CL") and pattern in ("monotonic_increase","threshold") and avg_severity is not None:
        emit(R13, ctx)
```

**Per-target-organ loop** (organ-scope rules R08, R09, R16):
```python
for organ in target_organs:
    # R08: Target organ
    if organ.get("target_organ_flag"):
        emit(R08, organ_ctx)

    # R09: Multi-domain evidence
    if organ["n_domains"] >= 2:
        emit(R09, organ_ctx)

    # R16: Correlated findings (>= 2 findings in same organ)
    organ_findings = [f for f in findings if f.organ_system == organ.organ_system]
    if len(organ_findings) >= 2:
        labels = sorted(set(f.endpoint_label for f in organ_findings))[:5]
        emit(R16, organ_ctx + {endpoint_labels})
```

**Per-NOAEL loop** (study-scope rules R14, R15):
```python
for noael_row in noael_summary:
    # R14: NOAEL established
    if noael_row["noael_dose_level"] is not None:
        emit(R14, noael_ctx)
    # R15: NOAEL not established
    else:
        emit(R15, noael_ctx)
```

### Rule Output Structure

Each `_emit()` call produces:
```python
{
    "rule_id": rule["id"],        # e.g., "R01"
    "scope": rule["scope"],       # "endpoint" | "organ" | "study"
    "severity": rule["severity"], # "info" | "warning" | "critical"
    "context_key": f"{domain}_{test_code}_{sex}",  # or "organ_{organ}" or "study_{sex}"
    "organ_system": finding.get("organ_system", ""),
    "output_text": template.format(**ctx),
    "evidence_refs": [f"{domain}: {endpoint_label} ({sex})"],
}
```

## Synthesis Logic

### Path 1: Signals Panel Engine (signals-panel-engine.ts)

The signals panel engine does NOT consume `rule_results` directly. Instead, it re-derives semantic rules from the summary data (NOAEL, target organ, signal rows). This is by design: the Signals Panel needs structured data (blocks, metrics, sections) that the flat rule_results format cannot provide.

#### Step 1: Derive NOAEL rules (priority 940-1000)

`deriveNoaelRules(noael, signals)` produces:

| Rule ID | Priority | Condition | Text pattern |
|---------|----------|-----------|-------------|
| `noael.assignment` | 1000 | `noael_dose_value > 0 AND has adverse effects` | "NOAEL is {dose} {unit} ({sex}), driven by {endpoint}. LOAEL is {loael}." |
| `noael.no.adverse.effects` | 990 | `no signals with severity=="adverse" AND treatment_related` | "No adverse effects identified. NOAEL is the highest dose tested ({maxDose} {unit})." |
| `noael.all.doses.adverse` | 990 | `noael_dose_value == 0 AND has adverse effects` | "NOAEL is Control ({sex}), driven by {endpoint}. LOAEL is {loael}." |
| `noael.sex.difference` | 940 | `male NOAEL != female NOAEL` | "NOAEL differs by sex: {maleDose} (M) vs. {femaleDose} (F). Combined NOAEL uses the lower value." |

**Driving endpoint selection**: Filters signals at the LOAEL dose level for adverse + treatment-related, sorts by absolute effect size descending, takes the first.

#### Step 2: Derive organ rules (priority 350-850)

`deriveOrganRules(targetOrgans, signals)` produces:

| Rule ID | Priority | Condition | Section |
|---------|----------|-----------|---------|
| `organ.target.identification` | 850 | `target_organ_flag == true` | TargetOrgansHeadline |
| `synthesis.organ.dose.response` | 750 | Same organ has >= 3 unique endpoints with monotonic pattern | TargetOrgansEvidence |
| `organ.single.domain.only` | 350 | `target_organ_flag == false AND n_domains == 1 AND evidence_score >= 0.3` | Caveats |

**Dose-response sub-line logic**: For each target organ, filters signals to that organ, finds endpoints with monotonic increase/decrease patterns. Tracks unique endpoint labels with their max absolute effect size. If 3+ unique monotonic endpoints found, the top endpoint (by effect size) is named.

#### Step 3: Derive study rules (priority 650-750)

`deriveStudyRules(signals, nTargetOrgans)` produces:

| Rule ID | Base Priority | Boost | Condition |
|---------|--------------|-------|-----------|
| `study.treatment.related.signal` | 750 | -100 when >= 2 target organs exist | `any signal has treatment_related AND any signal has dose_response_flag` |
| `study.no.treatment.effect` | 740 | none | `no signals have treatment_related` |

The -100 boost demotes "treatment-related effects present" from priority 750 to 650 when organ-level facts already convey this information implicitly.

#### Step 4: Derive synthesis promotions (priority 300-450)

`deriveSynthesisPromotions(signals)` scans endpoint-level data for cross-endpoint patterns:

**Sex-specific organ pattern** (priority 450, Modifiers section):
- For each endpoint x organ, checks if M and F have different significance (p < 0.05 in one sex but not the other)
- Groups by organ x affected sex
- If >= 3 endpoints in the same organ have the same sex-only pattern, emits `synthesis.organ.sex.specific`
- Text: "{Organ} changes in {sex} only."

**Widespread low power** (priority 300, Caveats section):
- Filters signals where `|effect_size| >= 0.8 AND (p_value is null OR p_value >= 0.05)`
- If >= 3 unique endpoints across >= 2 organs match, emits `synthesis.study.low.power`
- Text: "Large effects without statistical significance in {n} endpoints across {n} organs. Study may be underpowered."

#### Step 5: Build organ blocks (compound merging)

`buildOrganBlocks(allRules, targetOrgans)`:

1. Groups rules by `organSystem` where `id == "organ.target.identification"` (headline) or `id == "synthesis.organ.dose.response"` (dose-response detail)
2. For each organ, creates an `OrganBlock` with:
   - `headline`: The target identification PanelStatement
   - `evidenceLines`: (currently empty in production; reserved for convergence detail)
   - `doseResponse`: The dose-response sub-line data (nEndpoints, topEndpoint), or null
   - `domains`: Copied from the headline rule's domain list
   - `evidenceScore`: Looked up from `targetOrgans` data
3. Sorts blocks by `evidenceScore` descending

#### Step 6: Build metrics

`buildMetrics(noael, targetOrgans, signals)` computes:

- `noael`: "Control" if dose_value == 0, "Not established" if no combined row, else "{value} {unit}"
- `noaelSex`: from sexLabel() formatter
- `targets`: count of `target_organ_flag == true` organs
- `significantRatio`: count of `p_value < 0.05` / total signals
- `doseResponse`: count of `dose_response_flag == true`
- `domains`: count of distinct domain values

**Filter-responsive metrics**: `buildFilteredMetrics()` recalculates significantRatio, doseResponse, and domains from filtered signals. NOAEL/targets remain constant (study-level conclusions don't change with filters).

### Path 2: InsightsList Synthesis (rule-synthesis.ts)

This path consumes raw `RuleResult[]` from the backend and produces organ-grouped insight lines for the context panel.

#### Step 1: Build organ groups

`buildOrganGroups(rules)` groups rules by `organ_system` field:
- Extracts endpoint/domain counts from R09 output_text (regex: `/(\d+) endpoints across (.+?)\.?$/`)
- Falls back to counting unique test codes and domains from context_key parsing
- Computes tier per group
- Synthesizes compact display lines per group
- Sorts by tier order (Critical > Notable > Observed), then alphabetically

#### Step 2: Compute tier

`computeTier(rules)` classifies each organ group:

```typescript
function computeTier(rules: RuleResult[]): Tier {
  const ids = new Set(rules.map(r => r.rule_id));
  const warningEps = new Set<string>();  // unique endpoints with warnings
  const r01Eps = new Set<string>();      // unique endpoints with R01

  // Count per endpoint
  for (const r of rules) {
    const ctx = parseContextKey(r.context_key);
    if (!ctx) continue;
    if (r.severity === "warning") warningEps.add(ctx.testCode);
    if (r.rule_id === "R01") r01Eps.add(ctx.testCode);
  }

  if (ids.has("R08")) return "Critical";                              // Target organ identified
  if (ids.has("R04") && ids.has("R10") && warningEps.size >= 2)
    return "Critical";                                                 // Adverse + large effect in 2+ endpoints
  if (ids.has("R04") || ids.has("R10")) return "Notable";            // Adverse OR large effect
  if (ids.has("R01") && r01Eps.size >= 2) return "Notable";          // Treatment-related in 2+ endpoints
  return "Observed";
}
```

| Tier | Condition |
|------|-----------|
| Critical | R08 (target organ) fires for this organ, OR R04 + R10 + >= 2 warning endpoints |
| Notable | R04 (adverse) or R10 (large effect) fires, OR R01 in >= 2 endpoints |
| Observed | Everything else |

#### Step 3: Synthesize lines

`synthesize(rules)` collapses per-rule output_text into compact display lines:

1. **Signal summary** (from R10/R11 + R04 + R01): Extracts per-endpoint signals with direction arrows, Cohen's d by sex, adverse flags, dose-dependency flags. Shows top 5 endpoints, remaining as "+N more". Appends qualifiers: "adverse", "dose-dependent", sex specificity.
   - Example: `"ALT up (d=2.2 F, 1.1 M), AST up -- adverse, dose-dependent, both sexes"`

2. **R08 target organ**: Cleans prefix, shows "Target organ: {text}"

3. **R12/R13 histopath**: Collapses multiple findings into semicolon-separated line with sex annotations.
   - Example: `"Histopath: hepatocellular hypertrophy in liver (F, M); bile duct hyperplasia in liver (M)"`

4. **R16 correlation**: Parses endpoint names into chips array for wrapped chip rendering.
   - Example: chips = `["ALT", "AST", "Liver weight"]`

5. **R14 NOAEL**: Consolidates when same dose across sexes.
   - Example: `"NOAEL: Control for both sexes"` or `"NOAEL: 10 mg/kg for M"`

6. **Fallback**: If no synthesis lines produced, shows top 2 raw rules sorted by severity.

### Endpoint Signal Extraction

`extractEndpointSignals(rules)` builds a per-test-code signal profile:

```typescript
interface EndpointSignal {
  testCode: string;
  name: string;
  direction: "up" | "down" | "";
  effectSizes: Map<string, number>;  // sex -> max |d|
  maxAbsD: number;
  isAdverse: boolean;                // R04 fired
  hasR01: boolean;                   // R01 fired (dose-dependent)
}
```

- R10/R11: Parses Cohen's d from output_text (`/Cohen's d = (-?[\d.]+)/`), tracks max per sex
- R04: Sets `isAdverse = true`
- R01: Sets `hasR01 = true`, parses direction from `/(up|down)/`
- Sorted by `maxAbsD` descending (strongest effects first)

## Signal Score Formula

### Endpoint Signal Score (actual implementation in view_dataframes.py)

**Range: 0.0 - 1.0**

```
signal_score =
    0.35 * p_value_component +
    0.20 * trend_component +
    0.25 * effect_size_component +
    0.20 * dose_response_pattern_component
```

| Component | Weight | Formula | Cap |
|-----------|--------|---------|-----|
| p_value | 0.35 | `min(-log10(p_value) / 4.0, 1.0)` | 1.0 at p = 0.0001 |
| trend | 0.20 | `min(-log10(trend_p) / 4.0, 1.0)` | 1.0 at p = 0.0001 |
| effect_size | 0.25 | `min(abs(effect_size) / 2.0, 1.0)` | 1.0 at |d| = 2.0 |
| dose_response_pattern | 0.20 | Lookup table (see below) | 1.0 |

**Dose-response pattern scores:**

| Pattern | Score |
|---------|-------|
| `monotonic_increase` | 1.0 |
| `monotonic_decrease` | 1.0 |
| `threshold` | 0.7 |
| `non_monotonic` | 0.3 |
| `flat` | 0.0 |
| `insufficient_data` | 0.0 |

**Design rationale (SD-01 resolved)**: Weights are `0.35 * p_value + 0.20 * trend + 0.25 * effect_size + 0.20 * pattern` using continuous -log10 scaling. The higher statistical weight (0.35) reflects that a significant pairwise comparison (Dunnett's) is more definitive than a trend test (JT). The higher pattern weight (0.20 vs. original spec's 0.15 bio) aligns with ICH regulatory practice where biological plausibility is a key criterion for causality assessment.

### Organ Evidence Score (actual implementation)

```python
evidence_score = (total_signal / n_unique_endpoints) * (1 + 0.2 * (n_domains - 1))
```

Where:
- `total_signal` = sum of signal scores for all findings in this organ
- `n_unique_endpoints` = count of unique `{domain}_{test_code}_{sex}` keys
- `n_domains` = count of distinct domains

**Convergence multiplier**: `1 + 0.2 * (n_domains - 1)`, which gives:
- 1 domain: 1.0x
- 2 domains: 1.2x
- 3 domains: 1.4x
- 4 domains: 1.6x

**Design rationale (SD-02 resolved)**: Continuous formula is preferred over the stepped spec (1.0/1.2/1.5). Each additional domain providing convergent evidence IS incrementally informative — five-domain convergence is meaningfully stronger than three-domain convergence.

### Target Organ Flag

```python
target_organ_flag = (evidence_score >= 0.3) and (n_significant >= 1)
```

An organ is flagged as a target organ when its evidence score reaches 0.3 AND it has at least one statistically significant finding (p < 0.05).

### NOAEL Confidence Score (MF-01)

Computed per sex in `_compute_noael_confidence()` in `view_dataframes.py`.

```
NOAEL_Confidence = 1.0
  - 0.2 * (single_endpoint)          # NOAEL based on ≤1 adverse endpoint
  - 0.2 * (sex_inconsistency)        # M and F NOAEL at different dose levels
  - 0.2 * (pathology_disagreement)   # Reserved — needs annotation data
  - 0.2 * (large_effect_non_sig)     # |d| ≥ 1.0 but p ≥ 0.05
```

**Range**: 0.0 to 1.0 (clamped). Stored as `noael_confidence` in `noael_summary.json`.

**Frontend display**: NOAEL Decision View banner shows confidence as percentage with color coding (green ≥ 80%, yellow ≥ 60%, red < 60%). The signals-panel-engine emits a `noael.low.confidence` rule (priority 930) when confidence < 0.6.

**Note**: The `pathology_disagreement` penalty is reserved (always 0) because PathologyReview annotation data is not available at generation time. Production should compute this from annotation records.

## Current State

### What is real (full pipeline operational)

- **XPT to rule evaluation**: Complete pipeline from SEND XPT files through statistical computation to R01-R17 rule emission. All 16 rules fire against real study data.
- **Signal score computation**: Fully implemented with continuous scoring functions.
- **Target organ identification**: Automated from evidence scores and domain convergence.
- **NOAEL determination**: Derived from adverse effect analysis with per-sex computation.
- **Signals Panel engine**: Complete synthesis from summary data to structured UI output (DecisionBar, OrganBlocks, Modifiers, Caveats, Metrics).
- **InsightsList synthesis**: Complete organ-grouped tier classification with endpoint signal extraction.
- **UI rendering**: Both FindingsView (Signals Panel center) and InsightsList (context panel) fully operational.
- **Filter-responsive metrics**: Metrics line updates with heatmap filters; Decision Bar values remain constant.

### What is hardcoded / configurable

| Item | Current Value | Location | Notes |
|------|--------------|----------|-------|
| Signal score weights | 0.35 / 0.20 / 0.25 / 0.20 | `view_dataframes.py:_compute_signal_score()` | Hardcoded in function body |
| Target organ threshold | evidence_score >= 0.3 AND n_significant >= 1 | `view_dataframes.py` line 124 | Hardcoded |
| Large effect threshold | |d| >= 1.0 (R10) | `scores_and_rules.py` line 120 | Hardcoded |
| Moderate effect threshold | |d| >= 0.5 (R11) | `scores_and_rules.py` line 122 | Hardcoded |
| Treatment-related boost | -100 when >= 2 target organs | `signals-panel-engine.ts:deriveStudyRules()` | Hardcoded |
| Sex-specific threshold | >= 3 endpoints in same organ + sex pattern | `signals-panel-engine.ts:deriveSynthesisPromotions()` | Hardcoded |
| Low power threshold | |d| >= 0.8 AND p >= 0.05, >= 3 endpoints, >= 2 organs | `signals-panel-engine.ts:deriveSynthesisPromotions()` | Hardcoded |
| Single-domain caveat threshold | evidence_score >= 0.3 | `signals-panel-engine.ts:deriveOrganRules()` | Hardcoded |
| Priority bands | 900/800/600/400/200 boundaries | `signals-panel-engine.ts:assignSection()` | Hardcoded |
| Monotonic DR threshold | >= 3 unique endpoints with monotonic pattern | `signals-panel-engine.ts:deriveOrganRules()` | Hardcoded |
| p-value cap | 0.0001 (via -log10/4.0) | `view_dataframes.py:_compute_signal_score()` | Hardcoded |
| Effect size cap | |d| = 2.0 | `view_dataframes.py:_compute_signal_score()` | Hardcoded |
| R16 endpoint label limit | Top 5 | `scores_and_rules.py` line 149 | Hardcoded |
| Tier: Critical | R08, or R04+R10+2 warnings | `rule-synthesis.ts:computeTier()` | Hardcoded |
| Tier: Notable | R04 or R10, or R01 in 2+ endpoints | `rule-synthesis.ts:computeTier()` | Hardcoded |
| Max banner findings | None (all shown) | Spec dropped (SD-04) | Typical studies have 3-5 study-scope statements; hiding findings risks oversight |

### Known limitations and TBD

- **Pathology disagreement penalty not wired**: The NOAEL confidence score reserves a 0.2 penalty for pathology disagreement but cannot compute it at generation time (requires annotation data from PathologyReview records). Currently defaults to 0.
- **No mortality priority override**: R17 mortality signals are emitted as study-scope rules but do not yet automatically force NOAEL downward. A death at any dose level should make that dose the LOAEL or higher — this requires pipeline-level integration, not just a rule emission.

### Resolved spec divergences

The following items were previously listed as spec divergences. All have been resolved — the code behavior is accepted as correct.

- **(SD-01) Signal score weights**: Accepted as 0.35/0.20/0.25/0.20. See "Design rationale" note above.
- **(SD-02) Convergence multiplier**: Accepted as continuous `1 + 0.2 * (n_domains - 1)`. Each additional domain providing convergent evidence is incrementally informative; the stepped formula arbitrarily capped the benefit.
- **(SD-03) Template registry**: Direct string construction is accepted. At 17 rules, the template registry adds complexity without benefit. Revisit if rule count exceeds ~30.
- **(SD-04) Banner cap**: Dropped. Typical studies generate 3-5 study-scope statements. Hiding findings behind a toggle risks oversight in regulatory review.
- **(SD-05) Endpoint-scope rules not in Signals Panel**: Accepted architecture. The Signals Panel provides study-level synthesis (target organs, NOAEL, modifiers). The InsightsList provides endpoint-level detail on selection. This mirrors how toxicologists work: scan organs first, then drill into endpoints.
- **(SD-06) Convergence detail as chips**: Accepted. Domain chips (`[LB] [OM] [MI]`) are instantly scannable and visually encode convergence strength by count. Inline text requires reading.
- **(SD-07) Inline promotion**: Accepted. Promotion logic is implemented inline in `deriveSynthesisPromotions()` and `deriveOrganRules()` rather than via a formal promotion pipeline. Functionally equivalent at current complexity.

## Code Map

| File | What it does | Key functions/exports |
|------|-------------|----------------------|
| `backend/generator/scores_and_rules.py` | Evaluates 17 canonical rules (R01-R17) against computed findings, target organs, and NOAEL data. R17 is the mortality signal from DS domain. Emits structured rule results with context keys and rendered template text. | `RULES` (rule definitions), `evaluate_rules()`, `_emit()`, `_emit_organ()`, `_emit_study()`, `_build_finding_context()` |
| `backend/generator/view_dataframes.py` | Computes signal scores, builds summary dataframes (study_signal_summary, target_organ_summary, noael_summary). Contains the signal score formula, target organ threshold logic, and NOAEL confidence score. | `build_study_signal_summary()`, `build_target_organ_summary()`, `_compute_signal_score()`, `_compute_noael_confidence()` |
| `frontend/src/lib/signals-panel-engine.ts` | Derives semantic rules from NOAEL/organ/signal summary data, assigns priority bands, builds organ blocks with compound merging, and produces the full SignalsPanelData structure for the Signals tab center panel. | `buildSignalsPanelData()`, `buildFilteredMetrics()`, `sexLabel()`, `organName()`, `assignSection()` + types: `SignalsPanelData`, `OrganBlock`, `PanelStatement`, `MetricsLine`, `UISection` |
| `frontend/src/lib/rule-synthesis.ts` | Groups backend rule_results by organ, computes per-organ tiers (Critical/Notable/Observed), extracts per-endpoint signals from R10/R04/R01, and synthesizes compact display lines. Serves the InsightsList context panel. | `buildOrganGroups()`, `computeTier()`, `synthesize()`, `extractEndpointSignals()`, `parseContextKey()`, `cleanText()` + types: `OrganGroup`, `SynthLine`, `EndpointSignal`, `Tier` |
| `frontend/src/components/analysis/panes/InsightsList.tsx` | React component that renders organ-grouped insights in the context panel. Shows tier filter bar (Critical/Notable/Observed pills), organ groups with synth lines, expandable raw rule detail. | `InsightsList` (component), `SynthLineItem`, `TierBadge` |
| `frontend/src/components/analysis/SignalsPanel.tsx` | React component that renders the Findings mode of the Signals tab center panel. Contains organ cards grid, modifiers section, review flags section, clickable organ/endpoint navigation. | `FindingsView` (main export), `OrganCard`, `TargetOrgansSection`, `ModifiersSection`, `CaveatsSection`, `StudyStatementsSection` |
| `frontend/src/types/analysis-views.ts` | TypeScript interfaces for all analysis view data types consumed by both synthesis engines. | `SignalSummaryRow`, `TargetOrganRow`, `NoaelSummaryRow`, `RuleResult`, `SignalSelection` |

## Datagrok Notes

### What ports directly

- **All Python rule logic** (`scores_and_rules.py`): Rule definitions, evaluation logic, and template rendering are self-contained and have no framework dependencies. Can be extracted as-is.
- **Signal score computation** (`view_dataframes.py:_compute_signal_score()`): Pure function with no external dependencies beyond `math.log10`.
- **All TypeScript synthesis logic** (`signals-panel-engine.ts`, `rule-synthesis.ts`): Both engines are pure functions with no React dependencies. They consume plain data objects and return plain data objects. Can be used in any JS/TS runtime.
- **Type definitions** (`analysis-views.ts`): All interfaces are portable.

### What changes for production

- **Weight configurability**: Signal score weights (0.35/0.20/0.25/0.20) and all thresholds (target organ 0.3, large effect 1.0, etc.) should move to a configuration layer. These are currently hardcoded and will need tuning per study type / regulatory context.
- **Priority band tuning**: The 900/800/600/400/200 boundaries may need adjustment based on real-world usage patterns. Should be configurable.
- **Multi-study support**: Current system processes one study at a time. Datagrok may need cross-study comparison of signal scores and rule results.
- **Mortality NOAEL override**: R17 emits mortality signals but doesn't yet force NOAEL adjustment. Production should auto-set LOAEL at any dose with deaths.
- **Audit trail**: The spec defines rule lifecycle states (inactive -> triggered -> emitted -> suppressed). Current implementation only has "emitted" (all results are emitted, no suppression tracking). Production should log all state transitions for regulatory audit.

## Changelog

- 2026-02-08: Consolidated from insight-synthesis-engine.md, send-browser- rule-based-insight-system.md, signals-panel-implementation-spec.md, CLAUDE.md, and five source code files (scores_and_rules.py, view_dataframes.py, signals-panel-engine.ts, rule-synthesis.ts, InsightsList.tsx, SignalsPanel.tsx)
