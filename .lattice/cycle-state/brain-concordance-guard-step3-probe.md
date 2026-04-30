# Probe — brain-concordance-guard build plan

**Date:** 2026-04-26
**Synthesis:** `docs/_internal/incoming/brain-concordance-guard-synthesis.md`
**Scope:** Frontend only. ~30 LOC code add + 24 tests + 1 doc section.

## Subsystems touched (Layer 0 lookup)

| ID | Subsystem | How this build touches it | Outcome |
|---|---|---|---|
| S10 | Signal Scoring | `getSexConcordanceBoost` returns capped value when guard fires; boost map carries the capped `sexConcordanceBoost` field; `computeEndpointSignal` formula unchanged | **PROPAGATES** — intended. Score decreases for endpoints where guard fires. Validation expectation: ≤1 study sign change in signal totals across the corpus. |
| S15 | Organ Analytics | `derive-summaries.ts` is read-only here; the guard does not modify endpoint membership in organ groups | **SAFE** — no API change. |
| S16 | NOAEL Determination | NOAEL consumes per-endpoint/per-organ signal scores; lower scores can shift NOAEL upward (reduce flagged DOSEs at NOAEL) | **PROPAGATES** — second-order, intended. Same direction as parent topic shipped change (which already adjusted BRAIN_WEIGHT scores). |
| S23 | Signals Panel | UI consumes `signal` field from boost-map output; guard CAPS but doesn't zero | **SAFE** — boost map remains populated for guard-affected endpoints (because cap is 0.3, still nonzero). |
| S11/S12 | Syndromes | Guard runs after syndrome detection; the `synBoost` is computed independently of the cap | **SAFE** — no interaction. |
| S07 | Confidence Scoring | `confMult` is computed independently and multiplies the entire evidence sum (including capped sexConc); per R1 F13, worst-case 4.5-pt delta is acknowledged in research | **SAFE** — known interaction documented; no contract violation. |
| S20 | Compound Profiling | Sister cycle (`brain-concordance-compound-class`) modifies the same boost loop with compound-class boosts; this cycle does not touch S20 | **SAFE** — sister cycle is research-complete only, mechanically distinct. |
| OV | Override System | Guard is automatic; no override surface, no settings_hash change | **SAFE**. |

## Cross-topic contention

The coherence report (Step 1 of autopilot) listed S10 contention from `brain-concordance-bw-mediation`, `brain-concordance-compound-class`, and `reference-change-values-rcv`. Disposition for THIS topic:

- **bw-mediation** is blueprint-complete (build.0). Both cycles edit `useFindingsAnalyticsLocal.ts:262-285` and `findingsAnalytics.worker.ts:159-184`. Synthesis already documents merge strategy; ~10 LOC mechanical conflict either order. **No SCIENCE-FLAG** — different fields on the boost map.
- **compound-class** is research-complete only (no synthesis written). When that cycle eventually advances, it will rebase on whichever shipped first. **Out of scope** for guard cycle.
- **reference-change-values-rcv** is research-complete only and operates on RCV computation (S07/S10/S16/S21/S40 mostly) with no overlap on `getSexConcordanceBoost` or the sex-concordance boost map field. **No interaction.**

## Invariants checked

- **X1 (Boost-map population):** Guard caps to 0.3 (nonzero) — `boostMap.set` IF condition `sexConc !== 0` continues to fire. ✅
- **X2 (Boost monotonicity, capped values ≤ uncapped):** `Math.min(boost, 0.3)` ≤ `boost` always holds. ✅
- **X3 (Per-sex context delta consistency):** Guard cap is applied identically across both sex contexts when scoring system splits. R2 N5 documented behavior. ✅
- **X6 (Backward compatibility for existing callers):** `nEndpointsForBand?` is optional with no default → guard does not fire when arg is omitted. Existing call sites that don't pass it (none in this commit, but unit tests that bypass the caller pipeline) continue to compile and behave identically. ✅
- **X7 (Worker/sync parity):** Test 21 enforces. ✅
- **X9 (Validation suite no-regression):** Plan asserts ≤1 study sign change. Build agent will verify. ✅

## Probe verdict

**0 BREAKS.** **0 SCIENCE-FLAGs** (the analytical change is intended, scoped, literature-justified per research, and acknowledged in the architect review). **2 PROPAGATES** (S10, S16 — both intended). All invariants pass.

**Decision: PROCEED** to Plan Review R1 (Step 4).
