# Probe — brain-concordance-species-bands build plan

**Date:** 2026-04-26
**Synthesis:** `docs/_internal/incoming/brain-concordance-species-bands-synthesis.md`
**Scope:** Frontend only. ~10 LOC code + 4 JSON keys + 12 tests + 1 doc subsection + 1 contract-triangle row.

## Subsystems touched

| ID | Subsystem | How this build touches it | Outcome |
|---|---|---|---|
| S10 | Signal Scoring | `lookupBand` returns species-calibrated values for non-rat brain weight; rat-baseline for non-rat non-brain organs (was: defaultBoosts). Boost map carries the new sexConcordanceBoost values. | **PROPAGATES** — intended. Non-rat species' signal scores adjust toward more accurate calibration. |
| S15 | Organ Analytics | Read-only here; target organ ranking is downstream and uses signal scores | **PROPAGATES** — second-order; rank changes possible for non-rat studies. |
| S16 | NOAEL Determination | Consumes per-endpoint signal scores | **PROPAGATES** — second-order. NOAEL flips investigated by build agent per validation gate. |
| S23 | Signals Panel | UI consumes signal field; species-bands cap does not zero anything | **SAFE**. |
| S20 | Compound Profiling | Independent of species-bands path | **SAFE**. |
| OV | Override System | Species-bands is automatic; no override surface, no settings_hash change | **SAFE**. |

## Cross-topic contention

Same as guard cycle:
- **bw-mediation** (blueprint-complete): plans `AnalyticsWorkerInput.strain` (additive) + `computeBwMediationFactor` adjacent function. No overlap with species-bands' `lookupBand` modification. **No conflict.**
- **guard** (blueprint-complete): modifies `getSexConcordanceBoost` signature with `nEndpointsForBand?` 3rd arg. Species-bands modifies `lookupBand` internals only. Different surfaces. **No conflict.**
- **compound-class** (research-complete): out of scope.

## Invariants

- **X1 (Boost-map population):** Species-bands does not affect when entries are added to the boost map; `sexConc !== 0` check still fires for nonzero values. ✅
- **X2 (REPRODUCTIVE always returns null/0):** PRE-cycle behavior for non-rat species was `defaultBoosts` (incorrect — REPRODUCTIVE should be sex-exclusive). POST-cycle: `null` via rat-fallback. **This invariant is now CORRECTLY enforced for all species** (was only enforced for rat before). ✅
- **X3 (Three-tier fallback determinism):** `lookupBand` is pure; same inputs always produce same outputs. Tests 1-12 enforce. ✅
- **X6 (Backward compatibility):** Rat species path is unchanged (tier 1 hits for rat). Existing PointCross tests at `organ-sex-concordance.test.ts:546-580` continue to pass. ✅
- **X7 (Worker/sync parity):** No code change to either path; both call `lookupBand` through `getSexConcordanceBoost`. Existing parity is preserved. ✅
- **X9 (Validation regression budget):** `<= 2 studies` sign change accepted (broader than narrow cycles because rat-fallback affects all non-rat species' non-brain organs). Build agent records baseline. ✅

## SCIENCE-FLAG

The behavioral change (defaultBoosts → rat-fallback for non-rat species' non-brain organs, AND defaultBoosts → null for non-rat REPRODUCTIVE) is documented in synthesis §SCIENCE-FLAG check. Citations:

1. Bailey 2004 — rat as reference for organ-BW allometry
2. Nirogi 2014 — rat brain weight literature corpus
3. sex-concordance-scoring.md (internal) — rat-baseline calibration of all 14 organ bands
4. SPECIES_STRAIN_PROFILES — rat as reference species for tier thresholds

≥3 citation threshold met (4 cited). Per autopilot protocol: **PROCEED.** Decision to be logged at build-cycle commit.

## Probe verdict

**0 BREAKS. 0 NEW SCIENCE-FLAGs (1 RESOLVED with 4 citations). 3 PROPAGATES (S10, S15, S16 — all intended).** All invariants pass.

**Decision: PROCEED** to Plan Review R1.
