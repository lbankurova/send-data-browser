# Scientific Logic Audit

## What this is

Systematic code-level audit of every seam where domain-specific metrics (continuous, incidence, ordinal) merge, aggregate, or visualize together. Goal: find structural inconsistencies that a SEND toxicology SME would flag — places where a metric is misapplied, combined with incompatible metrics, or displayed without regard to what it represents.

**Not in scope:** UI polish, validation rules, data-dependent bugs (require running with specific study data), or debatable scientific threshold choices.

## Methodology

**Seam-based audit.** Each seam is a code boundary where different endpoint types (continuous LB/BW/OM, incidence MI/MA/TF/CL/DS, ordinal severity grades) converge. For each seam:

1. Read the code that merges/aggregates across endpoint types
2. Trace what each metric means for each data type at that point
3. Flag any place where the code treats them identically when it shouldn't
4. Record finding with file:line, description, and severity

**Severity levels:**
- **S1 (Wrong):** Produces scientifically incorrect output (e.g., Cohen's d shown for incidence endpoint)
- **S2 (Misleading):** Technically computable but misleading to a toxicologist (e.g., ranking odds ratios alongside Cohen's d)
- **S3 (Imprecise):** Not wrong but could confuse an expert (e.g., labeling "effect size" without specifying the metric)

## Root Cause

**`max_effect_size` semantic overloading.** The backend stores three incompatible metrics in the same field:

| Domain type | `max_effect_size` value | Scale | Meaning |
|-------------|------------------------|-------|---------|
| Continuous (LB, BW, OM, EG, VS, BG, FW) | Cohen's d / Hedges' g | ~0-3+ | Standardized mean difference |
| MI (histopathology) | avg_severity | 1-5 ordinal | INHAND pathologist grading |
| MA, CL, TF, DS | `null` | N/A | Not computed |

Every downstream consumer that applies numeric thresholds (0.5, 0.8, 1.0, 1.5, 2.0) is implicitly assuming Cohen's d semantics. This produces three failure modes:
1. **MI findings inflated** — avg_severity routinely 1-5, always exceeding Cohen's d "large effect" thresholds
2. **MA/CL/TF/DS findings penalized** — null → 0.0, structurally missing 25% of signal score and always classified as "non-adverse" by B-factor logic
3. **Mixed rankings distorted** — sorting, scoring, and confidence that aggregate across types produce meaningless orderings

## Seams

### SEAM-1: Endpoint summary derivation
- **Code:** `frontend/src/lib/derive-summaries.ts` → `deriveEndpointSummaries()`
- **Status:** Done
- **Findings:** SLA-01, SLA-08

### SEAM-2: Signal score composition
- **Code (backend):** `backend/generator/view_dataframes.py` → `_compute_signal_score()`
- **Code (frontend):** `frontend/src/lib/findings-rail-engine.ts` → `computeEndpointSignal()`
- **Status:** Done
- **Findings:** SLA-02, SLA-03

### SEAM-3: Scatter / volcano plot axis mapping
- **Code:** `frontend/src/components/analysis/charts/findings-charts.ts`
- **Code:** `frontend/src/components/analysis/DoseResponseView.tsx`
- **Status:** Done
- **Findings:** SLA-06 (Findings scatter fixed; DoseResponse volcano NOT fixed)

### SEAM-4: Weighted NOAEL derivation
- **Code (frontend):** `frontend/src/lib/endpoint-confidence.ts`
- **Code (backend):** `backend/generator/view_dataframes.py` → `build_noael_summary()`
- **Status:** Done
- **Findings:** SLA-04, SLA-09, SLA-14

### SEAM-5: Target organ summary — evidence scoring
- **Code:** `backend/generator/view_dataframes.py` → `build_target_organ_summary()`
- **Status:** Done
- **Findings:** SLA-02 (overlap), SLA-10, SLA-11, SLA-12

### SEAM-6: Recovery assessment — continuous vs incidence
- **Code:** `frontend/src/lib/recovery-assessment.ts`
- **Status:** Done
- **Findings:** SLA-15, SLA-16 (architecture sound, minor gaps)

### SEAM-7: Pattern classification across data types
- **Code:** `backend/services/analysis/classification.py` → `classify_dose_response()`
- **Status:** Done
- **Findings:** SLA-05 overlap, SLA-09 overlap (classify_severity and classify_dose_response are clean)

### SEAM-8: Severity classification thresholds
- **Code:** `backend/services/analysis/classification.py` → `classify_severity()`
- **Status:** Done
- **Findings:** SLA-05 (classify_severity itself is clean; assess_finding is not)

## Findings Log

### SLA-01: Display labels show avg_severity as "Cohen's d" or "|d|"
- **Severity:** S1 (wrong output)
- **Locations:**
  - `frontend/src/components/analysis/NoaelDecisionView.tsx:316` — always shows `Max |d|:` regardless of domain
  - `frontend/src/components/shell/OrganRailMode.tsx:154-165` — shows `|d|=X.XX` with bold thresholds at 0.5/0.8
  - `backend/generator/scores_and_rules.py:50-54` — R10/R11 templates: `"Cohen's d = {effect_size:.2f}"` for all domains
  - `frontend/src/components/analysis/NoaelDeterminationView.tsx:605` — partial fix: correct only when ALL domains are incidence
- **Issue:** When `max_effect_size` is avg_severity (MI domain), the value is displayed with continuous-domain labels. A severity grade of 2.5 is shown as "Cohen's d = 2.50" or "Max |d|: 2.50".
- **Impact:** A toxicologist reads "|d| = 2.50" and thinks there's a massive statistical effect (2.5 pooled SDs). Actually, this is a MILD-to-MODERATE histopathological grade. Directly undermines credibility.

### SLA-02: Signal score effect-size component — triple asymmetry
- **Severity:** S2 (misleading)
- **Locations:**
  - Backend: `backend/generator/view_dataframes.py:570-571` — `min(abs(effect_size) / 2.0, 1.0)` calibrated for Cohen's d
  - Frontend: `frontend/src/lib/findings-rail-engine.ts:59` — `Math.min(Math.abs(ep.maxEffectSize), 5)` uncapped additive
- **Issue:** Three data types get three different treatments in the same formula:
  - MI: avg_severity (1-5) → inflated (severity 2.0 saturates the backend component; severity 3.0 is a large additive term in frontend)
  - MA/CL/TF/DS: null → effect component is 0.0 → structurally capped at 75% of max signal score
  - Continuous: Cohen's d → correctly scaled
- **Impact:** Histopath findings (MI) dominate the Findings Rail ranking. Macroscopic findings (MA) are systematically underranked. A liver with gross enlargement (MA, p=0.001) ranks below a mildly elevated lab parameter (LB, d=0.5).

### SLA-03: R10/R11 rules fire on avg_severity with misleading template text
- **Severity:** S1 (wrong output)
- **File:** `backend/generator/scores_and_rules.py:49-54, 149-169`
- **Issue:** R10 ("Large effect") fires when `|max_effect_size| >= 1.0`, R11 ("Moderate effect") when `>= 0.5`. No `data_type` check. For MI, any graded finding (severity ≥ 1.0) triggers R10. Template says "Cohen's d = {effect_size:.2f}".
- **Impact:** Rule results panel shows "Cohen's d = 2.50 at high dose" for a finding whose actual meaning is "average histopathologic severity grade = 2.5 (Mild-Moderate)".

### SLA-04: Confidence/ECI thresholds assume Cohen's d scale
- **Severity:** S2 (misleading)
- **Locations:**
  - `frontend/src/lib/endpoint-confidence.ts:549-562` — `g >= 0.8` → HIGH, `g >= 0.5` → MODERATE
  - `frontend/src/lib/findings-rail-engine.ts:96-107` — same thresholds
- **Issue:** Cohen's d conventions (small=0.2, medium=0.5, large=0.8) applied to avg_severity. Since MI severity grades are always ≥ 1.0, ALL MI findings with p < 0.01 get HIGH confidence. MA findings (null → 0.0) always get LOW confidence regardless of p-value.
- **Impact:** Endpoint confidence is meaninglessly inflated for MI and deflated for MA. Since confidence drives NOAEL weighting (via `computeNOAELContribution`), MI findings are over-trusted and MA findings under-trusted as NOAEL drivers.

### SLA-05: ECETOC `assess_finding()` B-factors — no data_type check
- **Severity:** S1 (wrong output)
- **File:** `backend/services/analysis/classification.py:486-542`
- **Issue:** B-factor thresholds apply to `max_effect_size` without checking data type:
  - B-1: `abs_d >= 1.5` → `tr_adverse` — fires for MI when avg_severity ≥ 1.5 (i.e., any finding above MINIMAL)
  - B-3: `abs_d < 0.5` → `tr_non_adverse` — fires for MA/CL/TF/DS (null → 0.0 < 0.5)
  - Consequence: **Mortality (DS) and tumor (TF) findings are classified `tr_non_adverse`** by B-factor logic
- **Impact:** A toxicologist would see tumor findings marked as non-adverse. Mortality signals classified as non-adverse. Meanwhile, MINIMAL-severity MI findings are marked adverse. This inverts the regulatory hierarchy.
- **Mitigation:** `assess_finding_with_context()` dispatches MI/MA/TF to `_classify_histopath()` first, so `assess_finding()` is a fallback. But CL/DS findings always reach the fallback path.

### SLA-06: Volcano scatter (DoseResponseView) mixes raw metrics on X axis
- **Severity:** S1 (wrong output)
- **Locations:**
  - `frontend/src/components/analysis/DoseResponseView.tsx:2248-2259` — X = `Math.abs(ep.max_effect_size!)`
  - `frontend/src/components/analysis/charts/dose-response-charts.ts:975-995` — reference lines at g=0.5, g=0.8
  - `frontend/src/components/analysis/DoseResponseView.tsx:119-123` — `computeSignalScore` adds mixed metrics
- **Issue:** Unlike the Findings scatter (fixed with `computeWithinTypeRank()`), the DoseResponse volcano chart puts raw `max_effect_size` on the X axis with no data-type separation. Cohen's d reference lines (0.5, 0.8) are meaningless for incidence (avg_severity always ≥ 1.0).
- **Impact:** All incidence findings appear to "exceed the large effect threshold." A MINIMAL histopath finding (avg_severity=1.0) appears farther right than an LB endpoint with Cohen's d=0.8 (genuinely large).

### SLA-07: Syndrome ECETOC magnitude maps Mild severity to "severe"
- **Severity:** S1 (wrong output)
- **File:** `frontend/src/lib/syndrome-ecetoc.ts:660-677`
- **Issue:** `deriveMagnitudeLevel()` applies Cohen's d thresholds (0.5/1.0/1.5/2.0) to `maxEffectSize`. For MI endpoints: avg_severity 2.0 ("Mild" INHAND grade) → "severe" magnitude label.
- **Impact:** Syndrome adversity assessments are grossly inflated when histopath findings are involved.

### SLA-08: Endpoint/organ summary sorting mixes incompatible scales
- **Severity:** S2 (misleading)
- **Locations:**
  - `frontend/src/lib/derive-summaries.ts:396-398` — `deriveEndpointSummaries` ranks by `Math.abs(maxEffectSize)` across types
  - `frontend/src/lib/derive-summaries.ts:163-164, 199-203` — `deriveOrganSummaries` same issue in tiebreaker
- **Issue:** Sorting treats Cohen's d and avg_severity as comparable. Histopath findings (avg_severity 1-5) can rank above continuous findings (Cohen's d 0-3) regardless of actual scientific significance.
- **Impact:** Endpoint priority lists and organ rankings are distorted.

### SLA-09: Incidence endpoints silently skip quality checks
- **Severity:** S3 (imprecise)
- **Locations:**
  - `frontend/src/lib/endpoint-confidence.ts:202-259` — `checkNonMonotonic()` requires `mean` → no-op for incidence
  - `frontend/src/lib/endpoint-confidence.ts:273-362` — `checkTrendTestValidity()` requires `sd` → no-op for incidence
  - `backend/services/analysis/classification.py:365` — `pattern_confidence` always `None` for incidence
- **Issue:** Non-monotonic dose-response detection and trend test variance homogeneity checks silently skip incidence data. All incidence endpoints get default "high" dose-response confidence by not being checked.
- **Impact:** A non-monotonic incidence pattern (e.g., peak tumor incidence at mid dose) would not be flagged by the quality check system.

### SLA-10: Target organ diversity multiplier treats MI+MA as independent evidence
- **Severity:** S2 (misleading)
- **File:** `backend/generator/view_dataframes.py:147-148`
- **Issue:** Convergence multiplier `(1 + 0.2 * (n_domains - 1))` gives MI+MA the same 1.2x as LB+MI. But MI and MA observe the same pathological change at different magnifications — they're not independent lines of evidence.
- **Impact:** Organs with both gross and microscopic pathology get an unearned convergence bonus compared to organs where genuinely independent measurements (lab chemistry + histopath) agree.

### SLA-11: Evidence score numerator/denominator mismatch
- **Severity:** S2 (misleading)
- **File:** `backend/generator/view_dataframes.py:117-120, 145`
- **Issue:** `endpoints` set deduplicates by `domain_test_code_sex`, but `total_signal` sums `_compute_signal_score()` for every finding including duplicates. The ratio `total_signal / len(endpoints)` inflates when the same endpoint has multiple timepoint measurements.
- **Impact:** Organs with longitudinal endpoints (BW, LB with multiple study days) get inflated evidence scores.

### SLA-12: Severity filter excludes continuous-only organs
- **Severity:** S2 (misleading)
- **File:** `frontend/src/components/shell/OrganRailMode.tsx:254-257`
- **Issue:** `minSeverity` filter checks `o.max_severity !== null`. `max_severity` comes from histopath grading — continuous-only organs (hematologic, body weight) have `null`. Any non-zero severity filter hides them entirely.
- **Impact:** Setting severity filter to "2+" removes all clinical chemistry, hematology, organ weight, and body weight findings from the organ rail — even if ALT is 10x elevated with p < 0.001.

### SLA-13: Odds ratio / risk ratio silently dropped for incidence endpoints
- **Severity:** S3 (imprecise)
- **File:** `frontend/src/lib/derive-summaries.ts:262`
- **Issue:** `flattenFindingsToDRRows` reads `pw?.cohens_d` (null for incidence), doesn't read `odds_ratio` or `risk_ratio`. Effect size columns are blank for all incidence endpoints in dose-response tables.
- **Impact:** Dose-response view shows no effect magnitude for histopath findings even though odds ratios are computed by the backend.

### SLA-14: NOAEL confidence penalty fires for nearly all MI findings
- **Severity:** S3 (imprecise)
- **File:** `backend/generator/view_dataframes.py:518-523`
- **Issue:** "Large effect size but not significant" penalty: `abs(max_effect_size) >= 1.0`. Since MI avg_severity ≥ 1.0 for all graded findings, this penalty fires for every MI finding with borderline p-values.
- **Impact:** NOAEL confidence is artificially reduced for studies with any equivocal histopathology.

### SLA-15: CL recovery path lacks minimum-N guard
- **Severity:** S2 (misleading)
- **File:** `backend/services/analysis/incidence_recovery.py` (CL path)
- **Issue:** MI recovery has `insufficient_n` check (MIN_RECOVERY_N=3). CL incidence recovery does not apply a minimum-N guard. A CL finding with N=1 in recovery gets a definitive verdict.
- **Impact:** A toxicologist sees "resolved" for a clinical observation based on a single recovery animal, which provides no statistical power.

### SLA-16: Corroboration direction coherence not validated
- **Severity:** S3 (imprecise)
- **File:** `backend/services/analysis/corroboration.py:84-153`
- **Issue:** Direction matching is per-term only (`direction: "any"` terms accept either direction). Cross-term directional coherence is not checked. A decrease in organ weight could be "corroborated" by an increase in a lab parameter through an "any"-direction term.
- **Impact:** Biologically implausible combinations could be labeled "corroborated."

### SLA-17: Duplicate INCIDENCE_DOMAINS with 2 of 5 members
- **Severity:** S3 (imprecise)
- **Locations:**
  - `frontend/src/hooks/useSyndromeCorrelations.ts:8` — `["MI", "MA"]`
  - `frontend/src/hooks/useSyndromeCorrelationSummaries.ts:8` — `["MI", "MA"]`
  - Canonical: `frontend/src/lib/derive-summaries.ts:12` — `["MI", "MA", "CL", "TF", "DS"]`
- **Issue:** CL, TF, DS are not recognized as incidence in the correlation hooks. Backend filters as safety net, but the inconsistency risks regression.

### SLA-18: Recovery verdict vocabulary not harmonized across data types
- **Severity:** S3 (imprecise)
- **Locations:**
  - Continuous: `resolved`, `reversed`, `overcorrected`, `reversing`, `partial`, `persistent`, `worsening`
  - Histopath: `reversed`, `reversing`, `persistent`, `progressing`, `anomaly`, `insufficient_n`
  - CL: `resolved`, `improving`, `worsening`, `persistent`, `new_in_recovery`
- **Issue:** Same concept (e.g., "finding went away") has different labels across data types: "resolved" (continuous), "reversed" (histopath). Cross-view summaries that aggregate recovery status across endpoints may confuse users.

### SLA-19: No centralized domain-to-data_type mapping
- **Severity:** S3 (imprecise)
- **File:** `backend/services/analysis/send_knowledge.py`
- **Issue:** Each domain module independently sets `data_type`. No centralized registry (e.g., `{"MI": "incidence", "LB": "continuous"}`). Future domain additions could omit `data_type` without immediate failure.

## Positive Findings (things done right)

- **`classify_severity()`** — clean `data_type` branching, no leakage (SEAM-8)
- **`classify_dose_response()`** — proper continuous/incidence branching, different equivalence bands (SEAM-7)
- **Findings quadrant scatter** — `computeWithinTypeRank()` correctly separates continuous and incidence into independent percentile ranks (SEAM-3)
- **`max_fold_change`** — correctly guarded to continuous-only in findings_pipeline.py (SEAM-7)
- **Recovery assessment architecture** — sound routing: MI/MA → incidence verdicts, LB/BW/OM → Hedges' g comparison, CL → separate path (SEAM-6)
- **ANOVA/Dunnett** — correctly skipped for incidence in domain_stats.py (SEAM-7)
- **GRADE D6** — correctly skips non-continuous data (SEAM-7)

## Progress

| Seam | Status | Findings |
|------|--------|----------|
| SEAM-1: Endpoint summary derivation | Done | SLA-01, SLA-08 |
| SEAM-2: Signal score composition | Done | SLA-02, SLA-03 |
| SEAM-3: Scatter/volcano plots | Done | SLA-06 |
| SEAM-4: Weighted NOAEL | Done | SLA-04, SLA-09, SLA-14 |
| SEAM-5: Target organ evidence | Done | SLA-02, SLA-10, SLA-11, SLA-12 |
| SEAM-6: Recovery assessment | Done | SLA-15, SLA-18 |
| SEAM-7: Pattern classification | Done | SLA-05 (overlap), SLA-09 (overlap) |
| SEAM-8: Severity classification | Done | SLA-05, SLA-17 |

## Summary by Severity

| Severity | Count | IDs |
|----------|-------|-----|
| S1 (Wrong) | 5 | SLA-01, SLA-03, SLA-05, SLA-06, SLA-07 |
| S2 (Misleading) | 7 | SLA-02, SLA-04, SLA-08, SLA-10, SLA-11, SLA-12, SLA-15 |
| S3 (Imprecise) | 7 | SLA-09, SLA-13, SLA-14, SLA-16, SLA-17, SLA-18, SLA-19 |
| **Total** | **19** | |

## Triage protocol

1. Each finding logged here with SLA-{N} ID
2. After review with user, triaged to `docs/TODO.md` as BUG- or GAP- (existing conventions)
3. When all issues triaged: archive this spec per CLAUDE.md rule 7

---
*Created: 2026-03-11*
*Last updated: 2026-03-11 — All 8 seams audited, 19 findings logged*
