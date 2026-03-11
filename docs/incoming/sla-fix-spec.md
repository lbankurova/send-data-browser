# SLA Fix-All Spec — Implementation Order

## Guiding principle

All 19 findings trace back to one root cause: `max_effect_size` is a polymorphic field whose
semantics are only knowable from domain context, but every downstream consumer treats it as Cohen's d.
The fix order therefore starts with establishing a **typed data contract** (Phase 0), which makes
every subsequent fix a simple substitution rather than a logic redesign.

---

## Phase 0 — Foundational: Domain-type registry & typed accessors (SLA-19, SLA-17)

**Do this first. Everything in Phase 1 depends on it.**

### Backend (send_knowledge.py)

Create a centralized registry that declares the effect-size semantics for each domain:

```python
DOMAIN_EFFECT_TYPE = {
    "LB": "cohens_d",       # continuous lab measurement
    "BW": "cohens_d",
    "OM": "cohens_d",
    "EG": "cohens_d",
    "VS": "cohens_d",
    "BG": "cohens_d",
    "FW": "cohens_d",
    "MI": "severity_grade", # INHAND ordinal 1–5
    "MA": "incidence",      # binary/proportion — no magnitude scalar
    "CL": "incidence",
    "TF": "incidence",
    "DS": "incidence",
}

# Canonical single definition — resolves SLA-17 (duplicate INCIDENCE_DOMAINS)
INCIDENCE_DOMAINS = frozenset(
    d for d, t in DOMAIN_EFFECT_TYPE.items() if t == "incidence"
)  # {"MA", "CL", "TF", "DS"}

CONTINUOUS_DOMAINS = frozenset(
    d for d, t in DOMAIN_EFFECT_TYPE.items() if t == "cohens_d"
)  # {"LB", "BW", "OM", "EG", "VS", "BG", "FW"}
```

Add typed accessors:

```python
def get_effect_size(finding: dict) -> float | None:
    """Returns Cohen's d for continuous domains, None for all others."""
    if DOMAIN_EFFECT_TYPE.get(finding.get("domain")) == "cohens_d":
        return finding.get("max_effect_size")
    return None

def get_severity_grade(finding: dict) -> float | None:
    """Returns INHAND avg severity grade (1–5) for MI only, None for all others."""
    if finding.get("domain") == "MI":
        return finding.get("max_effect_size")
    return None
```

### Frontend (derive-summaries.ts or new shared constants file)

Leverage the existing `data_type` field already present on every `UnifiedFinding` in the JSON
contract. No schema migration needed — `data_type` is set by each domain module and flows
through `findings_pipeline.py` unchanged into `unified_findings.json`.

```typescript
// Canonical single definition — replace ALL other copies
// (useSyndromeCorrelations.ts:8, useSyndromeCorrelationSummaries.ts:8 have 2-member versions)
export const INCIDENCE_DOMAINS = new Set(["MI", "MA", "CL", "TF", "DS"]);

// Typed accessors — check existing data_type field on findings
export function getEffectSize(f: { data_type?: string; max_effect_size?: number | null }): number | null {
  return f.data_type === "continuous" ? (f.max_effect_size ?? null) : null;
}

export function getSeverityGrade(f: { domain?: string; max_effect_size?: number | null }): number | null {
  return f.domain === "MI" ? (f.max_effect_size ?? null) : null;
}

export function effectSizeLabel(domain: string): string {
  if (domain === "MI") return "avg severity";
  if (INCIDENCE_DOMAINS.has(domain)) return "odds ratio";
  return "|g|";  // or "|d|" depending on stat method setting
}
```

### Migration step

After Phase 0, grep the codebase for direct `max_effect_size` / `maxEffectSize` access and
replace every occurrence with the appropriate typed accessor before proceeding. ~30+ callsites
across backend (Python) and frontend (TypeScript).

---

## Phase 1 — Critical: Wrong output / adversity errors (SLA-01, 03, 05, 06, 07)

These produce incorrect scientific conclusions. Fix before any user testing.

### SLA-05 — ECETOC B-factor adversity classification ⚠️ highest priority

**Problem:** `null → 0.0 < 0.5` classifies tumors and mortality as non-adverse.
`severity=1.0 > 0.5` classifies MINIMAL histopath as adverse.

**Actual code path:** `assess_finding()` is only the fallback. MI/MA/TF dispatch to
`_classify_histopath()` first (adaptive trees + intrinsic adversity dictionary). OM dispatches
to `_assess_om_two_gate()`. Only **LB, BW, CL, DS, FW, BG, EG, VS** hit the B-factor gates
directly.

**Fix:** Branch the B-factor gates in `assess_finding()` on `data_type`, not raw `max_effect_size`:

```python
# In assess_finding(), add data_type branch BEFORE B-factor gates:
data_type = finding.get("data_type", "continuous")

if data_type == "incidence":
    # CL/DS: no magnitude scalar exists. Adversity from statistical
    # significance + dose-response pattern, matching the existing
    # classify_severity() incidence branch logic.
    if tr_score >= 1.0 and min_p_adj is not None and min_p_adj < 0.05:
        pattern = finding.get("dose_response_pattern", "")
        if pattern in ("monotonic_increase", "monotonic_decrease", "threshold"):
            return "tr_adverse"
        return "equivocal"
    elif tr_score >= 1.0:
        return "equivocal"
    return "tr_non_adverse"

# For MI fallback (when adaptive trees don't match):
# The B-factors should use severity-grade-appropriate thresholds.
# This path is rare — trees handle most MI terms.
if finding.get("domain") == "MI":
    grade = get_severity_grade(finding)
    if grade is not None:
        # Use adaptive trees' own grade awareness. B-factor gates
        # on raw grade are too coarse — adversity depends on finding
        # type (necrosis vs hypertrophy), not just grade.
        # Default to equivocal and let the tree system decide.
        return "equivocal"

# Continuous domains (LB, BW, FW, BG, EG, VS): existing B-factor gates
# using Cohen's d thresholds — correct as-is
d = get_effect_size(finding)
abs_d = abs(d) if d is not None else 0.0
# ... existing B-1 through B-4 logic unchanged ...
```

**Why not "any incidence > 0 = adverse":** That's scientifically wrong. CL observation "soft stool"
in 2/10 animals is not adverse. Background histopath findings at spontaneous rates are not adverse.
The entire existing system (adaptive trees, intrinsic adversity dictionary) exists because adversity
is context-dependent. The fix should use statistical significance + dose-response pattern as the
incidence adversity gate, matching how `classify_severity()` already handles incidence correctly.

**Why not "MI grade ≥ 2 = adverse":** Adversity depends on finding TYPE, not just grade.
Mild hepatocellular hypertrophy is adaptive (non-adverse). Mild hepatocellular necrosis IS adverse.
The adaptive trees handle this distinction. A blanket grade threshold would override them.

### SLA-07 — Syndrome magnitude labels

**Problem:** `severity=2.0` (Mild) maps to "severe" via Cohen's d thresholds.

**Fix:** Syndrome magnitude for MI must use INHAND grade→label mapping, not Cohen's d bins.
Use standard INHAND nomenclature (Minimal/Mild/Moderate/Marked/Severe, not "Slight"):

```typescript
// In syndrome-ecetoc.ts, deriveMagnitudeLevel():
const INHAND_MAGNITUDE: Record<number, string> = {
  1: "Minimal", 2: "Mild", 3: "Moderate", 4: "Marked", 5: "Severe"
};

function deriveMagnitudeLevel(ep: EndpointSummary): string {
  if (ep.domain === "MI") {
    const grade = getSeverityGrade(ep);
    if (grade == null) return "Present";
    // Display fractional grades honestly (avg across affected animals)
    const lower = INHAND_MAGNITUDE[Math.floor(grade)] ?? "Minimal";
    const upper = INHAND_MAGNITUDE[Math.ceil(grade)] ?? lower;
    if (lower === upper) return lower;
    return `${lower}–${upper}`;  // e.g., "Minimal–Mild" for avg_severity=1.7
  }
  if (INCIDENCE_DOMAINS.has(ep.domain)) {
    return "Present";  // incidence domains: presence/absence, no magnitude scalar
  }
  // Continuous: existing Cohen's d thresholds — correct
  const d = getEffectSize(ep);
  if (d == null) return "Unknown";
  if (d < 0.2) return "Negligible";
  if (d < 0.5) return "Small";
  if (d < 0.8) return "Moderate";
  return "Large";
}
```

### SLA-06 — DoseResponse volcano chart X-axis

**Problem:** Raw `avg_severity` and `Cohen's d` plotted on same X axis. Unlike the Findings
quadrant scatter (already fixed with `computeWithinTypeRank()`), this chart was never updated.

**Fix — use the proven approach already in the codebase:**

Apply `computeWithinTypeRank()` (from `findings-charts.ts:85-110`) to normalize both data types
to 0–1 percentile within their own population. This is already working and tested in the Findings
scatter. Minimal code — the function exists, just wire it into the volcano chart's data prep.

Alternatively, if the volcano is meant to be a continuous-domain tool: **filter incidence endpoints
out entirely**. They already have the incidence bar chart in the dose-response view. This is a
one-line filter and avoids the mixing problem completely.

Do **not** use facets or sub-axes — over-engineered for a companion chart.

Also fix the table sort in DoseResponseView (`computeSignalScore`, line 119-123) — it additively
mixes `|maxEffectSize|` across types. Use `normalized_magnitude()` (Phase 2) instead, or sort
by backend signal_score which is already 0–1 normalized.

### SLA-01, SLA-03 — Label and rule template text

**Fix:** Replace all hard-coded `"Cohen's d"` / `"|d|"` labels with domain-aware labels using
the `effectSizeLabel()` accessor from Phase 0.

**Affected locations:**
- `NoaelDecisionView.tsx:316` — always shows `Max |d|:` → use `effectSizeLabel(domain)`
- `OrganRailMode.tsx:154-165` — shows `|d|=X.XX` with bold thresholds at 0.5/0.8 → use
  domain-aware label, apply thresholds only for continuous
- `scores_and_rules.py:50-54` — R10/R11 templates say `"Cohen's d = {effect_size:.2f}"` →
  use `effect_size_label(finding)` from backend registry
- `NoaelDeterminationView.tsx:605` — partial fix exists (correct when ALL domains are incidence),
  but wrong for mixed-domain organs → use per-finding label, show dominant metric

---

## Phase 2 — High: Signal score and confidence recalibration (SLA-02, 04, 10, 11)

These produce inflated/deflated confidence values. Fix before any regulatory use.

### SLA-10 — MI+MA independence assumption

**Problem:** MI and MA are treated as independent convergence evidence in the domain-count
multiplier, but they measure the same biological event (tissue lesion + macroscopic correlate).

**Fix:** Collapse MI+MA into a single convergence group. Also collapse TF with MI/MA since
tumors are confirmed microscopically:

```python
def convergence_group(domain: str) -> str:
    """Maps domains to convergence groups for diversity scoring."""
    if domain in ("MI", "MA", "TF"):
        return "PATHOLOGY"  # same measurement modality
    return domain

def count_converging_domains(findings_for_organ):
    return len({convergence_group(f["domain"]) for f in findings_for_organ})
```

**Edge case:** MA findings without corresponding MI (tissue not examined microscopically)
genuinely provide independent information. But the convergence multiplier is organ-level,
not finding-level — and at the organ level, MA and MI are the same modality.

### SLA-11 — Evidence score numerator/denominator mismatch

**Problem:** `total_signal` sums per-finding signal scores (including duplicates from
multiple timepoints), but the denominator `len(endpoints)` deduplicates by `(domain, test_code, sex)`.
This inflates evidence scores for organs with longitudinal data.

**Fix — deduplicate the numerator, keep the signal-weighted formula:**

```python
# In build_target_organ_summary():
# Take max signal per endpoint key (instead of summing duplicates)
ep_signals: dict[str, float] = {}
for finding in findings:
    key = f"{finding['domain']}_{finding['test_code']}_{finding['sex']}"
    sig = _compute_signal_score(
        p_value=finding.get("min_p_adj"),
        trend_p=finding.get("trend_p"),
        effect_size=get_effect_size(finding),  # Phase 0 accessor — None for incidence
        dose_response_pattern=finding.get("dose_response_pattern"),
    )
    if key not in ep_signals or sig > ep_signals[key]:
        ep_signals[key] = sig  # keep best signal per endpoint

n_endpoints = len(ep_signals)
avg_signal = sum(ep_signals.values()) / max(n_endpoints, 1)
evidence_score = avg_signal * (1 + 0.2 * (count_converging_domains(findings) - 1))
```

**Why not replace with `domains_present / domains_possible`:** That formula loses signal
magnitude entirely. An organ where every endpoint has p=0.04 and tiny effects would score
identically to one where every endpoint has p=0.001 and huge effects. The current formula
(average signal strength × diversity) is conceptually correct — the bug is only the
numerator/denominator mismatch.

### SLA-02 — Signal score: MI inflated, incidence penalized

**Problem:** MI severity (1–5) substitutes directly as effect size, inflating MI signal.
Incidence domains get `null → 0`, structurally capping them at 75% of max signal score.

**Fix — redistribute component weights by data type rather than manufacturing a fake
"effect size" from incidence rate:**

Raw incidence rate is NOT an effect-size analog (10% incidence of liver necrosis vs 10%
incidence of soft stool have wildly different significance). Instead, give incidence domains
a different weight profile that reaches 1.0 through strong statistical evidence alone:

```python
def _compute_signal_score(p_value, trend_p, effect_size, dose_response_pattern, data_type="continuous"):
    score = 0.0

    if data_type == "continuous":
        # Existing weights: p=0.35, trend=0.20, effect=0.25, pattern=0.20
        if p_value is not None and p_value > 0:
            score += 0.35 * min(-math.log10(p_value) / 4.0, 1.0)
        if trend_p is not None and trend_p > 0:
            score += 0.20 * min(-math.log10(trend_p) / 4.0, 1.0)
        if effect_size is not None:
            score += 0.25 * min(abs(effect_size) / 2.0, 1.0)
        score += 0.20 * pattern_score(dose_response_pattern)

    elif data_type == "incidence":
        # No effect-size analog — redistribute weight to statistical components
        # MI severity grade handled as an optional modifier, not as an effect size
        if p_value is not None and p_value > 0:
            score += 0.45 * min(-math.log10(p_value) / 4.0, 1.0)
        if trend_p is not None and trend_p > 0:
            score += 0.30 * min(-math.log10(trend_p) / 4.0, 1.0)
        score += 0.25 * pattern_score(dose_response_pattern)
        # Optional: MI severity grade as a secondary modifier (0–0.10 bonus)
        if effect_size is not None and data_type == "incidence":
            sev_grade = effect_size  # MI avg_severity, None for MA/CL/TF/DS
            if sev_grade is not None:
                score += 0.10 * min((sev_grade - 1) / 4.0, 1.0)  # INHAND 1–5 → 0–0.10
                # Note: total incidence weights become 0.45+0.30+0.25+0.10 = 1.10
                # Cap at 1.0 via the final min()

    return min(score, 1.0)
```

**Frontend `computeEndpointSignal()` — parallel fix required.** The frontend formula is
completely different from the backend (unbounded additive vs 0–1 normalized). Both need
the same data-type branching:

```typescript
// In findings-rail-engine.ts, computeEndpointSignal():
const isIncidence = INCIDENCE_DOMAINS.has(ep.domain);
const effectWeight = isIncidence
  ? 0  // no effect-size analog — weight redistributed to p-value/pattern
  : (ep.maxEffectSize !== null ? Math.min(Math.abs(ep.maxEffectSize), 3) : 0);
// For incidence, boost pValueWeight and patternWeight to compensate:
const pValueBoost = isIncidence ? 1.5 : 1.0;
const patternBoost = isIncidence ? 1.3 : 1.0;
```

### SLA-04 — Confidence thresholds: MI always HIGH, incidence always LOW

**Problem:** `deriveStatisticalConfidence()` uses `maxEffectSize` with Cohen's d thresholds
(0.5, 0.8). MI always passes (severity ≥ 1.0 > 0.8). MA always fails (null → 0.0).

**Fix — target just the broken component.** The ECI system has 4 independent components
(statistical, biological, dose-response, trend). Only the statistical component uses
`maxEffectSize`. Fix only `deriveStatisticalConfidence()`:

```typescript
// In endpoint-confidence.ts, deriveStatisticalConfidence():
function deriveStatisticalConfidence(ep: EndpointSummary): ConfidenceLevel {
  const p = ep.minPValue;
  const informativePattern = ["monotonic_increase", "monotonic_decrease", "threshold"]
    .includes(ep.pattern);

  if (INCIDENCE_DOMAINS.has(ep.domain)) {
    // Incidence: confidence from statistical significance + pattern only.
    // No magnitude scalar exists for MA/CL/TF/DS; MI severity grade is
    // not comparable to Cohen's d for confidence gating.
    if (p != null && p < 0.01 && informativePattern) return "high";
    if (p != null && p < 0.05) return "moderate";
    return "low";
  }

  // Continuous: existing Cohen's d thresholds — correct
  const g = ep.maxEffectSize != null ? Math.abs(ep.maxEffectSize) : 0;
  if (p != null && p < 0.01 && g >= 0.8 && informativePattern) return "high";
  if (p != null && p < 0.05 && g >= 0.5) return "moderate";
  return "low";
}
```

**Also fix `classifyEndpointConfidence()` in `findings-rail-engine.ts:96-107` — same pattern.**

---

## Phase 3 — Medium: Display and filter correctness (SLA-08, 12, 15, 13)

### SLA-08 — Endpoint/organ sort order

**Fix:** For cross-domain sorting (endpoint lists, organ rankings), use the backend signal_score
(already 0–1 normalized and data-type-aware after Phase 2 fixes). Never sort across raw
`maxEffectSize` values from different data types.

For `deriveEndpointSummaries()` sorting: primary key = `worstSeverity` (adverse > warning > normal),
secondary key = backend `signal_score` or `minPValue`, NOT `maxEffectSize`.

For `deriveOrganSummaries()` tiebreaker: replace `Math.abs(maxEffectSize)` with `maxSignalScore`
(already tracked on organ summaries).

### SLA-12 — Severity filter excludes continuous-only organs

**Problem:** Severity filter (MINIMAL/MILD/etc.) in `OrganRailMode.tsx:254-257` checks
`o.max_severity !== null`. Continuous-only organs (hematologic, body weight) have `null`
and are excluded by any non-zero filter.

**Fix:** The severity filter is a histopathological concept — it should not gate non-histopath
organs. An organ passes the filter if it has ANY reason to be shown:

```typescript
// In OrganRailMode.tsx, replace severity filter:
if (filters.minSeverity > 0) {
  list = list.filter((o) =>
    // Histopath organs: require severity grade at threshold
    (o.max_severity !== null && o.max_severity >= filters.minSeverity) ||
    // Non-histopath organs: always pass (filter is not applicable)
    !o.domains.every(d => ["MI", "MA", "CL", "TF", "DS"].includes(d))
  );
}
```

### SLA-15 — CL recovery: missing minimum-N guard

**Fix:** Mirror the MI recovery `insufficient_n` guard. The CL incidence recovery path in
`incidence_recovery.py` should check recovery arm sample size before assigning a verdict:

```python
MIN_RECOVERY_N = 3  # match MI threshold

def compute_cl_recovery_verdict(main_incidence, recovery_incidence, recovery_n):
    if recovery_n < MIN_RECOVERY_N:
        return "insufficient_n"
    # ... existing verdict logic
```

### SLA-13 — Odds ratios dropped for incidence endpoints

**Problem:** `flattenFindingsToDRRows()` reads `pw?.cohens_d` which is null for incidence.
Odds ratio and risk ratio are computed by all incidence domain modules but never surfaced.

**Fix:** Populate the effect-size column with the domain-appropriate metric:

```typescript
// In derive-summaries.ts, flattenFindingsToDRRows():
effect_size: f.data_type === "continuous"
  ? (pw?.cohens_d ?? null)
  : (pw?.odds_ratio ?? null),
```

Show OR/RR for **all incidence endpoints**, not just low-incidence ones. The column header and
tooltip should use `effectSizeLabel(domain)` from Phase 0.

---

## Phase 4 — Polish / precision (SLA-09, 14, 16, 17, 18)

These are correctness improvements that don't alter primary outputs.

### SLA-09 — Incidence endpoint quality checks

**Problem:** `checkNonMonotonic()` and `checkTrendTestValidity()` in `endpoint-confidence.ts`
silently skip incidence data (require `mean` and `sd` which are null).

**Fix:** Add incidence-appropriate quality checks:
- Non-monotonic incidence: check if incidence rate peaks at a mid dose and declines at high dose
  (requires `group_stats[].incidence` instead of `group_stats[].mean`)
- Trend validity: for Cochran-Armitage trend test, check sparse-data concerns (any cell < 5)
  instead of variance homogeneity (which is for continuous JT)

### SLA-14 — NOAEL confidence penalty scope

**Problem:** "Large effect but not significant" penalty fires when `abs(max_effect_size) >= 1.0`.
For MI, avg_severity ≥ 1.0 for all graded findings, so the penalty fires on every MI finding
with borderline p-values.

**Fix:** Skip the penalty entirely for non-continuous data types. For continuous endpoints,
the existing threshold (Cohen's d ≥ 1.0) is correct:

```python
# In build_noael_summary(), NOAEL confidence penalties:
es = f.get("max_effect_size")
if f.get("data_type") == "continuous" and es is not None and abs(es) >= 1.0 and (p is None or p >= 0.05):
    score -= 0.2  # large continuous effect but not significant — possible power issue
# Incidence findings: penalty not applicable (no magnitude scalar for MA/CL/TF/DS;
# MI severity grade is not an effect-size analog)
```

### SLA-16 — Corroboration direction coherence

**Problem:** `direction: "any"` terms in corroboration allow contradictory directions to match.

**Fix:** After individual term matching, add a cross-term coherence check: if two matched
findings have opposite directions (one "up", one "down"), downgrade from "corroborated"
to "partially_corroborated" unless the syndrome definition explicitly expects mixed directions.

### SLA-17 — Deduplicate INCIDENCE_DOMAINS constant

**Resolved by Phase 0.** Remove the 2-member definitions in `useSyndromeCorrelations.ts:8` and
`useSyndromeCorrelationSummaries.ts:8`. Import from the canonical location.

### SLA-18 — Harmonize recovery verdict vocabulary

**Problem:** Three different vocabularies for the same concepts: continuous uses "resolved",
histopath uses "reversed", CL uses "resolved."

**Fix — harmonize names but preserve granularity.** Do NOT collapse to 4 terms — "progressing"
(getting worse in recovery) vs "persistent" (staying same) are clinically very different outcomes
with different regulatory implications.

Canonical vocabulary (applied across all data types):

| Verdict | Meaning | Maps from |
|---------|---------|-----------|
| `reversed` | Finding fully resolved in recovery | continuous "resolved", histopath "reversed" |
| `reversing` | Trending toward resolution but not complete | continuous "reversing"/"partial", histopath "reversing", CL "improving" |
| `persistent` | No change in recovery | all "persistent" |
| `progressing` | Getting worse in recovery | continuous "worsening", histopath "progressing", CL "worsening" |
| `anomaly` | Present in recovery but not main study | continuous "overcorrected", histopath "anomaly", CL "new_in_recovery" |
| `insufficient_data` | Not enough recovery animals to assess | histopath "insufficient_n"/"low_power", CL (add per SLA-15) |
| `not_assessed` | Recovery data not available | histopath "not_examined"/"not_observed"/"no_data", continuous "not_assessed" |

---

## Implementation checklist

```
Phase 0  [ ] Create DOMAIN_EFFECT_TYPE registry in send_knowledge.py
         [ ] Create INCIDENCE_DOMAINS / CONTINUOUS_DOMAINS derived sets
         [ ] Implement get_effect_size(), get_severity_grade() (Python)
         [ ] Implement getEffectSize(), getSeverityGrade(), effectSizeLabel() (TypeScript)
         [ ] Remove duplicate INCIDENCE_DOMAINS in useSyndromeCorrelations.ts
         [ ] Remove duplicate INCIDENCE_DOMAINS in useSyndromeCorrelationSummaries.ts
         [ ] Replace all direct max_effect_size references (~30+ callsites, both languages)

Phase 1  [ ] SLA-05  ECETOC B-factor: branch on data_type in assess_finding()
         [ ] SLA-07  INHAND grade→label in syndrome-ecetoc.ts deriveMagnitudeLevel()
         [ ] SLA-06  DoseResponse volcano: computeWithinTypeRank() or filter incidence out
         [ ] SLA-01  UI labels: NoaelDecisionView, OrganRailMode, NoaelDeterminationView
         [ ] SLA-03  R10/R11 rule templates: domain-aware label via effect_size_label()

Phase 2  [ ] SLA-10  Convergence group collapse: MI+MA+TF → PATHOLOGY
         [ ] SLA-11  Evidence score: deduplicate numerator (max signal per endpoint key)
         [ ] SLA-02  Signal score: data-type-aware weight profiles (backend + frontend)
         [ ] SLA-04  deriveStatisticalConfidence: branch on INCIDENCE_DOMAINS

Phase 3  [ ] SLA-08  Sorting: use signal_score or minPValue, not raw maxEffectSize
         [ ] SLA-12  Severity filter: pass non-histopath organs unconditionally
         [ ] SLA-15  CL recovery: add MIN_RECOVERY_N guard
         [ ] SLA-13  Odds ratio: populate effect_size column with domain-appropriate metric

Phase 4  [ ] SLA-09  Incidence quality checks (non-monotonic incidence, sparse-data)
         [ ] SLA-14  NOAEL penalty: skip for non-continuous data_type
         [ ] SLA-16  Corroboration: cross-term direction coherence check
         [ ] SLA-17  (resolved by Phase 0)
         [ ] SLA-18  Recovery vocabulary harmonization (7 canonical verdicts)
```

---

## Regression test anchors

After Phase 1, verify these cases explicitly:

- Tumor finding (TF domain, treatment-related, p<0.05, monotonic) → must be `tr_adverse`
- Mortality finding (DS domain, treatment-related, p<0.05) → must be `tr_adverse` or `equivocal`
- CL finding "soft stool" (low incidence, p>0.1) → must NOT be `tr_adverse`
- MI grade=1 (Minimal) via adaptive tree → adversity depends on finding type, not just grade
  (necrosis=adverse, vacuolation=may be adaptive)
- MI via B-factor fallback (no tree match) → must be `equivocal`, not `tr_adverse` from
  severity-as-Cohen's-d leakage
- LB-only organ (no MI finding) → must not be excluded by severity filter
- MI+MA same organ → convergence count = 1, not 2
- DoseResponse volcano → incidence endpoints must NOT appear on raw Cohen's d X-axis
- R10 rule message for MI finding → label must say "avg severity", not "Cohen's d"
- Signal score for MA finding with p=0.001, monotonic → must be able to reach ≥0.75
  (not structurally capped at 0.55)

---

## Key implementation risks

1. **~30+ callsites to migrate.** The `max_effect_size` → typed accessor migration in Phase 0
   is the highest-risk step. Missing one callsite silently preserves the bug. Grep thoroughly
   for: `max_effect_size`, `maxEffectSize`, `maxEffect`, `effect_size` (in signal score contexts).

2. **Frontend/backend signal score formulas are completely different.** Backend is 0–1 normalized
   (weights sum to 1.0, effect cap at |d|=2). Frontend is unbounded additive (severity 1–3 +
   pValue -log10 + effect cap 5 + trBoost 2 + pattern 0–2). Both need the data-type branching,
   but the implementation is different in each.

3. **Evidence score deduplication changes organ rankings.** The fix is correct but will change
   existing rankings. Studies with many longitudinal timepoints per endpoint will see the largest
   score reductions.

4. **MI fallback path is rare but not zero.** When adaptive trees don't match an MI finding
   (term not in dictionary, no tree for that organ), it falls through to `assess_finding()`.
   The Phase 1 fix must handle this gracefully — defaulting to `equivocal` is conservative
   and safe.
