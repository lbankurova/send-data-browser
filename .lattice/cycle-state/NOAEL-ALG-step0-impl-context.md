# NOAEL-ALG — Step 0 Implementation Context

**Date:** 2026-04-27
**Cycle phase:** blueprint.0 → blueprint.1
**Sources scanned:** `.lattice/decisions.log` (~570 entries), `docs/_internal/knowledge/code-quality-guardrails.md`, `backend/generator/view_dataframes.py` (NOAEL functions), `.lattice/cycle-state/` (related cycles), no `.lattice/bug-patterns.md` (file does not exist; consistent with all prior blueprint Step 0 logs).

## CRITICAL: backend already implements H1; frontend is divergent

The most consequential Step 0 finding — the research treated **frontend** behavior as "the algorithm" and proposed adding C1-C7 + multi-timepoint aggregation. The backend has been different all along.

**`backend/generator/view_dataframes.py::_is_loael_driving_woe` (lines 80-129)** ALREADY IMPLEMENTS C1-C5 with the cited mitigations:

| Criterion | Backend impl | Frontend impl |
|---|---|---|
| **C1 effect-size + tr_adverse** | `_dose_exceeds_effect_threshold(pw, 0.30) AND fc == "tr_adverse"` | `g_lower > 0.30` (no fc gate) |
| **C2a trend** | `trend_p < 0.05 AND fc == "tr_adverse"` | `trend_p < 0.05` (no fc gate, only fires when no other path fires) |
| **C2b large effect + trend (with N-adaptive `\|d\|`)** | `\|d\| >= 1.5 at N<=5` else `\|d\| >= 1.0` AND `trend_p < 0.10` AND **`_effect_matches_trend_direction`** | NOT IMPLEMENTED |
| **C3 corroborated adverse** | `fc == "tr_adverse" AND corroboration_status == "corroborated"` | NOT IMPLEMENTED |
| **C4 intrinsically adverse** | `fc == "tr_adverse" AND finding in INTRINSICALLY_ADVERSE` set | NOT IMPLEMENTED |
| **C5 high-incidence histopath** | `incidence >= 0.5 AND control_incidence == 0` | NOT IMPLEMENTED |

**The frontend `derive-summaries.ts::computeNoaelForFindings` (lines 836-902)** is the simpler, divergent path: effect-size-first OR p-value with NO direction check, NO trend gate, NO corroboration, NO intrinsic-adverse, NO incidence-50% gate, AND aggregates pairwise across all timepoints under one `endpoint_label` flat-OR.

**The backend's `_effect_matches_trend_direction`** (called from C2b) is a partial direction-check that the research's C6 would generalize across all timepoints. The function is published infrastructure — reuse target.

**`_is_loael_driving` (legacy simpler version, line 132)** still exists alongside `_is_loael_driving_woe` — used in `_propagate_scheduled_fields` and likely elsewhere. The blueprint must inventory which call-sites use which gate before changing.

## What this means for the synthesis

**Reframe F1 — primarily a parity fix, not a new construct stack.**

| Original research framing | Refined synthesis framing |
|---|---|
| "Add multi-criteria gate C1-C5 + NEW C6 + NEW C7 to NOAEL pipeline" | "Backend already has C1-C5. **Add C6 + C7 to the backend gate (`_is_loael_driving_woe`)**. **Frontend `computeNoaelForFindings` consumes backend's pre-computed decision** rather than re-deriving — this collapses the BUG-031 silent-divergence and adopts H1 implicitly (since H1 is what backend already does)." |
| "F0 = test H1 minimal baseline before committing to F1+F2+F3+F4" | "F0 mostly redundant — H1 is already shipped at the backend. Reframe F0 as: validate that frontend-consumes-backend produces the toxicologist-signed-off NOAEL across the regression corpus, demonstrating that the parity fix alone resolves BUG-031." |
| "C6 + C7 land in BOTH backend and frontend gates with parity test" | "C6 + C7 land in **backend only** (in `_is_loael_driving_woe`). Frontend consumption is automatic via the parity-fix architecture. Single-site change → single-site test." |

**This is the central architectural pivot the synthesis must make.** F2 (multi-timepoint aggregation) and F3 (onset-NOAEL coherence) and F4 (display) are unchanged — but F1 becomes drastically simpler.

## Domain-critical modules touched (per code-quality-guardrails.md)

| Module | Function | Risk | Action this cycle |
|---|---|---|---|
| `view_dataframes.py` | `_build_noael_for_groups`, `_is_loael_driving_woe` | "Wrong NOAEL = wrong regulatory conclusion" | **Primary build target** — extend with C6 + C7 + multi-timepoint aggregation |
| `classification.py` | `assess_finding`, `_is_equivocal_safety_pharm` | "Wrong adversity → wrong NOAEL" | Read-only (consumer of finding_class — already produces tr_adverse) |
| `confidence.py` | `compute_confidence`, `_compute_noael_confidence` | "Confidence grades lose calibration" | Light touch — F4's honest-uncertainty annotation extends this |
| `endpoint-confidence.ts` | `computeEndpointConfidence` | "Simplifying thresholds changes NOAEL" | Read-only (already computes endpoint confidence — Q4 fragility annotation reads this) |
| `derive-summaries.ts` | `computeNoaelForFindings` | (not in guardrails as critical because it's a re-derivation; but it IS the BUG-031 site) | **Primary frontend target** — refactor to consume backend pre-computed decision |
| `lab-clinical-catalog.ts` | direction-adversity registry | None today; extends to BW/FW/OM/CL for C7 | F1 (C7) data layer |

## LOC budgets

| Directory | Budget | Current state of touched files |
|---|---|---|
| backend/generator/ | 500 lines/file | `view_dataframes.py` already over 500 (multi-section file). Adding C6 + C7 + per-domain dispatch likely adds ~150 LOC; should extract to a new helper module if exceeds. |
| frontend/src/lib/ | 800 lines/file | `derive-summaries.ts` ~961 lines. Refactoring `computeNoaelForFindings` to consume backend (instead of re-derive) likely **reduces** LOC. |

## Cross-topic constraints (from prior cycles)

| Cycle | Status | Interaction with NOAEL-ALG |
|---|---|---|
| **hcd-mi-ma-s08-wiring** (3633fa93, 2026-04-22) | Shipped | Includes **NOAEL floor defensive invariant + AST lint guard** (`scripts/lint-noael-floor-coread.sh`). New NOAEL gate logic MUST NOT break this lint guard. The lint guard scans `view_dataframes.py` NOAEL gates for `f.get()` patterns; C6+C7 additions must use the same idiom. |
| **fct-lb-bw-band-values** (d9c22a92 / 2eecfc92, 2026-04-24) | Shipped | Includes **NOAEL dose-level byte-parity gate** across 16 studies. F1+F2 changes WILL shift NOAEL on some studies (intentional — BUG-031 fix). Coordinate with the byte-parity gate: F2 may require the gate to track a v2 baseline post-F1+F2 deployment. |
| **species-magnitude-thresholds-dog-nhp** | Phase A shipped, Phase B blueprint-complete (not built) | Phase B touches `classify_severity`, D6/D4, R10/R11, `_TIER_FRACTIONS` — feeds finding_class which C1-C7 consume. **Sequencing question for blueprint:** does NOAEL-ALG ship before Phase B (under current finding_class output) or after Phase B (under new severity output)? |
| **brain-concordance-bw-mediation** (Phase B) | Blueprint-complete, not built | Adds `bwMediationFactor` to `SignalBoosts`; touches S10/S15/S16/S17/S23. **S10 contention** flagged in ESCALATION.md. NOAEL-ALG also touches S10/S15/S16. |
| **brain-concordance-guard / -species-bands / -compound-class** | Blueprint-complete | Same S10 contention family. |
| **reference-change-values-rcv** | Research-complete | Touches S01/S07/S10/S16/S21/S40 broadly. **S10 contention.** |
| **mabel-framework** | Blueprint-complete, not built | Adds MABEL-MRSD as primary safety margin under `mabel_analysis_required`. F4's `intended_indication` flag (RG-NOAEL-ALG-11) overlaps this — coordinate. |
| **BUG-031 framework hardening** (lattice 487797e + 9d4182b2 + b0a38b5a) | Shipped | NEW lattice rules apply: SCIENCE-FLAG rebuttal protocol (3 acceptable rebuttals, plumbing-only forbidden), ALGORITHM CHECK in /lattice:review Step 6 (mandatory when algorithmic-code paths staged), CLAUDE.md rule 18 (algorithm defensibility on real data), `LATTICE_ALGORITHM_CHECK` env required, pre-commit Step -1 commit-lock + Bug-Retro check + staging-drift check. **The synthesis must explicitly plan for the algorithm-defensibility check.** |

## S10 contention — sequencing call

ESCALATION.md (2026-04-26) entry "[subsystem-overlap] S10 contention (3 topics)" lists `brain-concordance-bw-mediation`, `brain-concordance-compound-class`, `reference-change-values-rcv` and asks for "distill across the 4 brain-concordance + RCV topics, OR sequence builds." NOAEL-ALG is the 6th cycle in this contention family.

**Synthesis recommendation:** sequence NOAEL-ALG **first** in the build queue. Rationale:
- BUG-031 is a regression on master — fixing it has higher urgency than the calibration improvements.
- NOAEL-ALG's S10 touch is read-only on the formula (it consumes signal scores; it doesn't modify them). The contention with brain-concordance/RCV is asymmetric — brain-concordance modifies the formula; NOAEL-ALG just reads the output of finding_class which is upstream of the formula change.
- F0 (now reframed as "validate parity fix") doesn't depend on Phase B severity changes; the C2b path uses `g_lower` and `|d|` independently of the upcoming severity vocabulary expansion.

This recommendation needs validation in Step 2 architect gate.

## No FAILED entries relevant

Decisions log scan: 0 FAILED entries on this code path. The closest precedent is the BUG-031 retrospective itself, which is the trigger for this cycle.

## Bug-patterns.md does not exist

Consistent with all prior blueprint Step 0 logs. No bug-patterns input.

## Failed-approaches summary

None for NOAEL-ALG specifically. The BUG-031 retrospective IS the failed approach (the display-consistency fix that locked in the buggy analytics-path output). The framework hardening is in place; this synthesis must produce the algorithm fix.

## Step 0 disposition

- 0 FAILED entries relevant
- 1 critical architectural reframe surfaced (frontend consumes backend, not parallel re-derivation)
- 1 sequencing recommendation surfaced (NOAEL-ALG first in S10 contention queue) — needs Step 2 architect adjudication
- All BLOCKING gates from research phase carry forward to synthesis
- All cross-topic constraints documented and feeding into synthesize input

Synthesize agent should be told: **"The backend already implements C1-C5 with H1's `|d| >= 1.5 at N<=5` mitigation. F1 is primarily a frontend-backend parity fix; C6 + C7 + multi-timepoint aggregation land at the backend gate only. F0 is reframed as validating the parity fix on the regression corpus."**
