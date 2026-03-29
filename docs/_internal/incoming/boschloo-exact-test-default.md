# Boschloo's Exact Test as Default for Incidence Domains

> Generated from implementation — not a design spec. Created for review gate.

## Overview

Replaces Fisher's exact test with Boschloo's unconditional exact test as the default pairwise comparison for all incidence domains (MI, MA, CL, TF, DS). Boschloo's is uniformly more powerful than Fisher's, with the power difference most pronounced at the small sample sizes typical in preclinical studies (n=3–10 per group). Fisher's exact test is retained as a user override for comparability with legacy analyses.

## Scientific Rationale

### Why Boschloo's is more appropriate than Fisher's for preclinical trial data

1. **Uniformly more powerful.** Boschloo's test uses Fisher's p-value as its test statistic but computes the overall p-value by maximizing over the nuisance parameter (the unknown marginal probability). This unconditional approach yields a test that is never less powerful and typically more powerful than Fisher's. The power gap is largest at small sample sizes — exactly the regime of preclinical tox (n=3–10 per sex per group).

2. **One-margin-fixed design match.** In a preclinical toxicology study, group sizes (treated vs. control) are fixed by the protocol, but the number of affected vs. unaffected animals is a random outcome. Fisher's test conditions on **both** margins being fixed (both row and column totals), which over-constrains the problem and makes the test unnecessarily conservative. Boschloo's conditions only on the margin that is actually fixed — a proper match for the experimental design.

3. **No distributional assumptions.** Like Fisher's, Boschloo's is an exact test — no large-sample chi-square approximation needed.

### Power demonstration (from implementation testing)

| Table (treated vs control) | Boschloo p | Fisher p | Outcome at α=0.05 |
|---|---|---|---|
| 4/10 affected vs 0/10 | 0.033 | 0.087 | Boschloo significant, Fisher not |
| 5/10 affected vs 1/10 | 0.062 | 0.141 | Neither (but Boschloo closer) |

## Behavior

### Behavior 1: Default method is Boschloo's

- **What:** `incidence_exact_test()` uses `scipy.stats.boschloo_exact(table, alternative="two-sided")` by default.
- **When:** All calls to the incidence exact test function with `method` omitted or `method="boschloo"`.
- **Code:** `backend/services/analysis/statistics.py:34-78`

### Behavior 2: Fisher's available as override

- **What:** Passing `method="fisher"` routes to `scipy.stats.fisher_exact(table)` instead.
- **When:** Caller explicitly requests `method="fisher"`.
- **Code:** `backend/services/analysis/statistics.py:64-65`

### Behavior 3: Odds ratio computed from table, independent of test

- **What:** Odds ratio is `(a*d)/(b*c)`, computed directly from the 2x2 table. Not derived from the test output.
- **When:** Always. Odds ratio is a property of the data, not the test method.
- **Unless:** `b*c == 0` — returns `None` to avoid inf/NaN (not JSON-serializable). Callers check incidence rates directly for these edge cases.
- **Code:** `backend/services/analysis/statistics.py:53-61`

### Behavior 4: NaN guard on degenerate tables

- **What:** If Boschloo's returns NaN (e.g., `[[0,10],[0,10]]` — zero incidence in both groups), the function returns `p_value=1.0`.
- **When:** `np.isnan(p_val)` after the scipy call.
- **Code:** `backend/services/analysis/statistics.py:69-71`

### Behavior 5: test_method included in return dict

- **What:** The return dict includes `"test_method": method` so downstream consumers can identify which test produced the p-value.
- **When:** Always — both success and error paths.
- **Code:** `backend/services/analysis/statistics.py:72-78`

### Behavior 6: Backwards-compatible alias

- **What:** `fisher_exact_2x2 = incidence_exact_test` — existing imports from all 5 pipeline modules continue to work without changes.
- **When:** Always. The alias points to the same function.
- **Code:** `backend/services/analysis/statistics.py:82`

### Behavior 7: MethodologyPanel documents Boschloo's

- **What:** The frontend MethodologyPanel (TRUST-03) describes Boschloo's as the default incidence test, with Fisher's as override. References section includes Boschloo (1970).
- **Code:** `frontend/src/components/analysis/MethodologyPanel.tsx:71-76, 225`

## Data Dependencies

- **Input:** 2x2 contingency table `[[affected_treated, unaffected_treated], [affected_control, unaffected_control]]` — same format as before.
- **Output:** `{"odds_ratio": float|None, "p_value": float, "test_method": str}` — new `test_method` field added. Callers that destructure only `p_value` and `odds_ratio` are unaffected.
- **Library:** `scipy.stats.boschloo_exact` (available since scipy 1.7.0; already in venv).

## Consumers (unchanged — all use `fisher_exact_2x2` alias)

| Module | File | Line |
|---|---|---|
| MI (histopath) | `backend/services/analysis/findings_mi.py` | 172 |
| MA (macroscopic) | `backend/services/analysis/findings_ma.py` | 119 |
| CL (clinical signs) | `backend/services/analysis/findings_cl.py` | 156 |
| TF (tumor) | `backend/services/analysis/findings_tf.py` | 166 |
| DS (death/sacrifice) | `backend/services/analysis/findings_ds.py` | 112 |

## Scope Boundary — Not Changed

- **Frontend `statistics.ts:fishersExact2x2`** — Pure JS Fisher's implementation used in `comparison-engine.ts` for client-side cohort comparison (cross-study, not within-study treatment-vs-control). Different use case with different design constraints. Could be upgraded separately.
- **Pipeline module files** — Zero changes. All 5 modules call through the `fisher_exact_2x2` alias which now routes to Boschloo's by default.
- **User-switchable method UI** — The `method` parameter exists in the function but is not yet wired to the Study Details settings panel. Fisher's override requires a code-level argument change or future UI wiring.

## Performance

Boschloo's is ~10-100x slower than Fisher's per table (numerical optimization over nuisance parameter). At our scale (~hundreds of 2x2 tables per study generation), this adds negligible time. Verified: PointCross full generation completed in 23.0s (no measurable regression).

## Documentation Updated

- `docs/methods.md` STAT-03 — Rewritten: Boschloo's as default, Fisher's as override, scientific rationale, performance note. All domain rows in STAT-SUMMARY table updated.
- `frontend/src/components/analysis/MethodologyPanel.tsx` — Incidence test description and references section updated.

## Verification Checklist

- [ ] `incidence_exact_test(table)` calls `boschloo_exact` by default and returns `test_method: "boschloo"`
- [ ] `incidence_exact_test(table, method="fisher")` calls `fisher_exact` and returns `test_method: "fisher"`
- [ ] Odds ratio computed directly from table cells, not from test output
- [ ] Degenerate table `[[0,10],[0,10]]` returns `p_value=1.0`, not NaN
- [ ] Table with `b*c==0` returns `odds_ratio=None`, not infinity
- [ ] `fisher_exact_2x2` alias imports and works identically to `incidence_exact_test`
- [ ] All 5 pipeline modules (MI, MA, CL, TF, DS) import and call without error
- [ ] Full study generation completes without error (PointCross)
- [ ] Frontend builds clean (`npm run build`)
- [ ] MethodologyPanel shows "Boschloo's unconditional exact test" for incidence endpoints
- [ ] MethodologyPanel references section includes Boschloo (1970)
- [ ] `methods.md` STAT-03 documents both Boschloo (default) and Fisher (override)
- [ ] `methods.md` STAT-SUMMARY table shows "Boschloo's exact" for MI, MA, CL, TF, DS
