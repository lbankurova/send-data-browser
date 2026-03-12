# Findings Invariant Audit — Spec

**Date:** 2026-03-12
**Status:** Ready to implement
**Priority:** Critical — three silent-corruption bugs found in one week

---

## Problem

Despite 1,430+ autotests, critical bugs keep reaching the generated output undetected:

1. **Brain self-normalization** (commit 5837405): Brain weight / brain weight = 1.0 for all subjects. Entire organ's data destroyed. Tests never exercised the brain + ratio_to_brain combination.
2. **D2 confidence pattern mismatch** (commit dda9629): `classification.py` produces `monotonic_increase`, `confidence.py` expects `monotonic_up`. Every confidence grade silently degraded. Each module tested in isolation with its own string literals.
3. **Control-only finding leakage** (commit 35c92aa): Findings with no treated-group data passed through all pipelines. Unit tests always include treated groups.

**Root cause pattern:** Cross-boundary contract violations. Each module works in isolation. The *assembled output* is silently wrong. The 1,430 tests validate components; nothing validates the product.

---

## Solution: Invariant-based validation on generated data

### Phase 1: One-time audit script

Python script that loads `unified_findings.json`, iterates over every finding, runs ~20 domain invariant checks. Output is a violation report. Run once, triage results (known limitations vs new bugs).

### Phase 2: Permanent test

Codify Phase 1 checks as a pytest/vitest test that runs on regenerated data. No future commit can silently degrade the output.

---

## Invariant Checklist

### A. Data integrity (catches brain-type bugs)

- [ ] **A1: Continuous group means vary.** For any continuous finding with ≥2 dose groups, `group_stats` means must not be identical across all groups (within floating-point tolerance). Identical means = destroyed data.
- [ ] **A2: Continuous group SDs are non-zero.** At least one dose group must have sd > 0. All-zero SDs = single-subject groups or collapsed data.
- [ ] **A3: Sample sizes are positive.** Every `group_stats[].n` must be ≥ 1.
- [ ] **A4: Control group exists.** At least one group with `dose_level == 0`.
- [ ] **A5: Pairwise entries only reference non-control dose levels.** No pairwise entry for dose_level 0.
- [ ] **A6: No control-only findings.** Must have ≥1 treated dose group with n > 0.

### B. Normalization contract (catches metric-swap bugs)

- [ ] **B1: active_metric is set.** Every OM finding must have `normalization.active_metric`.
- [ ] **B2: Alternatives complement.** `set(alternatives.keys()) == set(computable_metrics) - {active_metric}`. (Already asserted at generation time — this validates the output.)
- [ ] **B3: Brain never has ratio_to_brain.** If `organ_category == "brain"`, neither `active_metric` nor any alternative key should be `ratio_to_brain`.
- [ ] **B4: Alternative stats differ from primary.** For each alternative, at least one group mean must differ from the primary `group_stats` mean. Identical = the "swap" is a no-op copy, indicating a generation bug.

### C. Statistical consistency (catches computation bugs)

- [ ] **C1: Direction matches data.** If `direction == "up"`, highest-dose mean > control mean (and vice versa for "down"). Allow tolerance for borderline cases.
- [ ] **C2: P-values in [0, 1].** All `p_value`, `p_value_adj`, `trend_p` must be in valid range.
- [ ] **C3: Effect sizes have correct sign convention.** `cohens_d > 0` ↔ treatment mean > control mean (for the standard convention used in the codebase — verify which convention is used).
- [ ] **C4: min_p_adj matches pairwise.** `min_p_adj` must equal the minimum `p_value_adj` across all pairwise entries.
- [ ] **C5: max_effect_size matches pairwise.** `max_effect_size` must equal the max `|cohens_d|` across pairwise entries.
- [ ] **C6: Trend p and trend stat are both present or both absent.** No partial computation.

### D. Classification pipeline (catches D2-type bugs)

- [ ] **D1: Confidence dimensions are non-trivial.** For findings with `confidence_grade`, at least one dimension (D1-D5) must have a non-neutral score. All-neutral = the scoring function failed silently.
- [ ] **D2: Pattern names are canonical.** `dose_response_pattern` must be one of the known set: `{monotonic_increase, monotonic_decrease, threshold_increase, threshold_decrease, non_monotonic, flat, u_shaped, inverted_u, no_pattern}`. Unknown patterns = producer/consumer mismatch.
- [ ] **D3: Severity classification is consistent with statistics.** If `min_p_adj < 0.05` and `|max_effect_size| >= 0.8`, severity should be at least "warning". If `min_p_adj >= 0.2` and `|max_effect_size| < 0.5`, severity should not be "adverse".
- [ ] **D4: Signal score is non-negative.** Enrichment-derived `signal_score` must be ≥ 0.

### E. Cross-domain consistency

- [ ] **E1: OM findings have specimens.** Every OM finding must have a non-null `specimen`.
- [ ] **E2: LB findings have test_code.** Every LB finding must have a non-null `test_code` that isn't just the domain name.
- [ ] **E3: Incidence findings have incidence in [0, 1].** For `data_type == "incidence"`, all `group_stats[].incidence` values must be in [0, 1].
- [ ] **E4: Sex is valid.** `sex` must be one of `{"M", "F", "Combined"}`.
- [ ] **E5: No duplicate findings.** No two findings should share the same `(domain, test_code, specimen, sex, day)` tuple.

### F. Recovery data (catches verdict bugs)

- [ ] **F1: Recovery verdicts are canonical.** Must be one of known set (check recovery engine).
- [ ] **F2: Recovery confidence matches sample size.** If `confidence == "low"`, the recovery group n should be < 5.
- [ ] **F3: Worsening/improving verdicts have directional consistency.** A "worsening" verdict should show the recovery mean moving further from control than the terminal mean.

### G. Enrichment pipeline

- [ ] **G1: Every finding has severity.** Non-null `severity` in `{normal, warning, adverse}`.
- [ ] **G2: Every finding has signal_contributions.** The signal/insight pipeline must have touched each finding.
- [ ] **G3: Insight text references real data.** Insights that cite specific values (e.g., "p = 0.03") should match the finding's actual statistics.

---

## Implementation notes

- **Script location:** `backend/tests/test_findings_invariants.py`
- **Data source:** Load from `generated/{study}/unified_findings.json`
- **Parameterize by study** so it works for any future study, not just PointCross
- **Report format:** Print violations as structured report. Each violation = finding identifier + check ID + expected vs actual. Exit code 0 if clean, 1 if violations.
- **Triage output:** Some checks may surface known limitations (not bugs). Those get documented as `# KNOWN: ...` exclusions with explanations.
- **The test should run in the existing pytest suite** so it's part of CI.

---

## Files to read before implementing

| File | Why |
|---|---|
| `backend/generated/PointCross/unified_findings.json` | The data under test |
| `backend/services/analysis/findings_om.py` | OM generation (normalization, alternatives) |
| `backend/services/analysis/confidence.py` | Confidence grading (D1-D5 dimensions) |
| `backend/services/analysis/classification.py` | Pattern classification + severity |
| `backend/services/analysis/enrichment.py` | Signal scoring, insights |
| `backend/services/analysis/parameterized_pipeline.py` | Post-generation transforms |
| `backend/services/analysis/recovery_analysis.py` | Recovery verdicts |
| `backend/tests/test_phase3_transforms.py` | Existing transform tests (for conventions) |

---

## Success criteria

1. Every finding in PointCross passes all applicable invariant checks, OR violations are triaged as known limitations with documented explanations.
2. The test runs as part of `pytest` and fails if a future code change introduces a new violation.
3. The invariant list is extensible — new checks can be added as new bug patterns are discovered.

---

## Context from prior bugs

### Brain self-normalization (5837405)
- `findings_om.py` didn't guard brain from ratio_to_brain metric
- `parameterized_pipeline.py` didn't guard the swap path
- Fix: 3-layer defense (generation guard, pipeline guard, frontend fallback)
- Now has generation-time assertion: `alternatives = computable_metrics - {active_metric}`

### D2 confidence pattern mismatch (dda9629)
- `classification.py` produces `monotonic_increase`/`threshold_increase`
- `confidence.py` D2 scoring expected `monotonic_up`/`threshold_up`
- Mismatch caused D2 to silently fall through to "unknown pattern → neutral"
- Fix: added canonical names to pattern sets

### Control-only leakage (35c92aa)
- Findings with only control data passed through sentinel/insight/recovery/lab/signal pipelines
- Fix: gate at pipeline entry

### Organ weight method naming lie (5837405)
- "absolute" default was actually "no override" (no-op)
- Auto-set effect in StudySummaryView papered over the confusion
- Fix: renamed to "recommended" default, "absolute" = true override
