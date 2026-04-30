# GAP-304 Mortality Cause Classification — Step 0 Implementation Context

**Date:** 2026-04-29
**Cycle phase:** blueprint.0 → blueprint.1
**Sources scanned:** `.lattice/decisions.log` (711 entries), `docs/_internal/knowledge/code-quality-guardrails.md`, `docs/_internal/knowledge/system-manifest.md`, `docs/_internal/knowledge/knowledge-graph.md` (NOAEL-FACT-006/007 as `gate_criterion` precedent), `backend/services/analysis/mortality.py` (549 LOC), `backend/routers/annotations.py`, `frontend/src/components/analysis/MortalityDataSettings.tsx` (380 LOC), `frontend/src/components/analysis/noael/ModifierStrip.tsx::computeMortalityCell`, `.lattice/cycle-state/NOAEL-ALG-step0-impl-context.md` (most analogous prior cycle), no `.lattice/bug-patterns.md` (does not exist; consistent with all prior blueprint Step 0 logs).

## Implementation reality check (research → code)

The research doc (Phase 2, Gap A-L) names the engine surface as `mortality.py` and is **correct** about call sites. Concrete confirmation:

| Research claim | Code verification (file:line) | Status |
|---|---|---|
| `_classify_cause_category` returns `strain_pathology / intercurrent / undetermined` (3 buckets) | `mortality.py:58-82` — exactly that signature | CONFIRMED |
| `_STRAIN_PATHOLOGY` is rat-mouse only (F344, SD, Wistar, Long-Evans, B6C3F1, CD-1, ICR) | `mortality.py:19-48` — 8 strain keys | CONFIRMED |
| `mortality_loael = lowest dose > 0 with deaths_undetermined > 0` | `mortality.py:271-279` — bare `for bd in by_dose: if bd["dose_level"] > 0 and bd["deaths_undetermined"] > 0: mortality_loael = bd["dose_level"]; break` | CONFIRMED — this IS the "undetermined→drives-LOAEL" defect |
| Control-mortality thresholds: 10% subchronic / 20% chronic / 25% survival carcinogenicity / 5% subchronic warning / 13w 2% alert | `mortality.py:411-488` — exact thresholds, hard-coded as Python literals | CONFIRMED — these are the values that need typed-fact promotion (DATA-GAP-MORTALITY-05, F5) |
| `suppress_noael=true` is set when CTRL_MORT_CRITICAL fires; `mortality_loael` is computed independently | `mortality.py:404-477, 275-285` — yes, two independent computations | CONFIRMED — Gap G (Nimble contradiction) is real and reproducible |
| Annotation route `mortality-overrides` exists with shape `{comment, pathologist, reviewDate}` | `routers/annotations.py:22, 38` (slug list); `backend/annotations/PointCross/mortality_overrides.json` (`PC201708-4003: {comment:"", pathologist:"User", reviewDate:...}`) | CONFIRMED — exactly the 3-field schema F4 extends |
| `MortalityInfoPane` mounted at `StudyDetailsContextPanel.tsx:519` (renamed from MortalityDataSettings) | File still named `MortalityDataSettings.tsx` (380 LOC); the rename in research doc is wrong but file content matches research's description | CONFIRMED in substance — research doc's filename is stale |
| `ScheduledOnlyContext` is React state (session-only); `excludedSubjects` doesn't trigger backend | `MortalityDataSettings.tsx:7` imports from `@/contexts/ScheduledOnlyContext`; the toggle never hits an API route | CONFIRMED — Gap K's "decorative not load-bearing" claim is correct |
| `ModifierStrip.computeMortalityCell` infers null=TR | `ModifierStrip.tsx:122-146` — `treatmentRelated = m.deaths.filter((d) => !d.is_recovery && d.relatedness !== "accidental")` — yes, anything not explicitly "accidental" counts as TR (including null) | CONFIRMED — GAP-361 surface is real |

**No surprises in the research-vs-code mapping.** F1+F2+F4 land at the call sites the research names; F5 (knowledge-graph promotion) targets the literals in `mortality.py:411-488`.

## Most consequential prior cycle: NOAEL-ALG (build-cycle COMPLETED 2026-04-27)

`.lattice/cycle-state/NOAEL-ALG-step0-impl-context.md` is the closest precedent. NOAEL-ALG and GAP-304 share four structural features: (a) algorithmic-defensibility code path under rule 19, (b) backend-frontend split where the frontend re-derives differently from the backend, (c) cross-subsystem cascade (S01/S03/S07/S15/S16), (d) override-schema extension. Lessons that carry forward:

| NOAEL-ALG lesson | GAP-304 application |
|---|---|
| Backend already implements C1-C5; frontend `computeNoaelForFindings` is the divergent path. **Make backend authoritative; frontend consumes pre-computed decision.** | Backend `_classify_cause_category` and `mortality_loael` already exist. Frontend `ModifierStrip.computeMortalityCell` re-derives "TR" from `relatedness !== "accidental"`. **Make backend's per-death `cause_category` + per-study `mortality_loael_provisional / mortality_loael_confirmed` authoritative; frontend consumes — no inference of TR from null.** |
| Single-site change at backend gate is preferable to dual-layer C6/C7 implementation with maintenance contract triangle. | F2's WoE integration (WC-1..8) lands ONCE at the backend (extending `mortality.py` or a new `mortality_woe.py` helper). Frontend reads engine's per-death `system_suggested_cause` + per-study `mortality_loael_*` outputs. |
| BUG-031 framework hardening shipped: SCIENCE-FLAG rebuttal protocol (3 acceptable rebuttals: fix / data-grounded counter-evidence / explicit user defer with named dependency); ALGORITHM CHECK in `/lattice:review` Step 6 (now per-revision per E3); pre-commit Step -1 commit-lock + Step -0.5 commit-intent + Step 5 retro check | **Synthesis must explicitly plan for the algorithm-defensibility check at deploy** — F2's WoE integration touches `mortality.py` which is mortality-LOAEL-deciding (rule 19 algorithmic path by default). The blueprint must name PointCross + Nimble + (NHP / dog) + 1 large-N study in the post-impl review's data-grounded check. |
| NOAEL-ALG explicitly used the typed knowledge graph for `gate_criterion` facts (NOAEL-FACT-006 P3, NOAEL-FACT-007 P2). The pattern: `fact_kind: gate_criterion` with `policy_id`, `consumed_by` paths to actual code, `derivation_status: provisional_pending_calibration`. | F5 + DATA-GAP-MORTALITY-05 land identically: control-mortality thresholds become 4 typed `fact_kind: threshold` or `fact_kind: gate_criterion` facts (10% subchronic CRITICAL, 5% subchronic WARNING, 20% chronic CRITICAL, 25% survival carcinogenicity CRITICAL) with `consumed_by` paths to `mortality.py:411-488`. |
| `commit-intent` protocol (rule 23, `.githooks/pre-commit` Step -0.5) is now strict — every commit must declare intent BEFORE staging. The autopilot conflation precedent (commits 1370c103, 521f1d16, a47ee865, abdb31c9, 45f29b53) is the reason. | Build phase commits (F4+F1 atomic, F2+F7 atomic, F5 typed-fact, F3 UI) each declare intent. **MEMORY: pause autopilot before manual staging on this topic.** |

**Asymmetric S10 contention:** NOAEL-ALG's blueprint sequencing call put it first because S10 was read-only on the formula. GAP-304 is similarly asymmetric to brain-concordance / RCV: GAP-304 changes `mortality.py` outputs (cause_category enum + LOAEL emission), which feeds `view_dataframes.py::_build_noael_for_groups` (mortality cap is one input to NOAEL MIN) — but does NOT modify the signal-score formula or finding_class semantics. **GAP-304 can sequence before brain-concordance Phase B without scientific contention.** Architect gate confirms in Step 2.

## Domain-critical modules touched (per code-quality-guardrails.md)

| Module | Function | Risk | Action this cycle |
|---|---|---|---|
| `mortality.py` (549 LOC, under 500-line budget but at the limit) | `_classify_cause_category`, `aggregate_mortality`, `qualify_control_mortality` | "Wrong NOAEL = wrong regulatory conclusion" via mortality cap | **Primary build target** — extend with WoE integration (`_compute_woe_components`, `_compute_provisional_loael`); threshold literals migrate to query-knowledge.py reads (F5). May need split into `mortality.py` (entry) + `mortality_woe.py` (WC-1..8 helpers) to stay under 500-line budget. |
| `view_dataframes.py::_build_noael_for_groups` | Reads `mortality_noael_cap` as one input to NOAEL MIN | "Wrong NOAEL" | Read-only consumer of `mortality_loael_confirmed` (provisional does NOT participate in NOAEL cap — provisional is advisory per rule 21) |
| `cross-domain-syndromes.ts` | XS01-XS10 syndrome detection | Read-only by WC-4 (queries syndrome detection at the death's dose) | Read-only consumer |
| `classification.py` (`assess_finding`) | finding-level `treatment_related` + `severity` classification | Read-only by WC-2 / WC-3 / WC-8 (queries existing per-finding TR/severity at the death's dose) | Read-only consumer |
| `clinical_catalog.py` (S09 Hy's Law detection) | Hy's Law trio (ALT/AST + ALP + BILI elevation, treatment-related) | Read by WC-2 clinical-floor sub-tier | Read-only consumer; per R6-1 finding, the canonical Hy's Law definition (BILI required) is preserved — no change to `clinical_catalog.py` |
| `routers/annotations.py` | `mortality-overrides` slug + JSON CRUD + audit log | Schema extension (F4) | **Primary backend target for F4** — schema is permissive (`AnnotationPayload(BaseModel, extra="allow")`), so adding `cause_category`, `included_in_terminal`, `rationale`, `system_suggested_cause`, `system_suggested_basis` is non-breaking; the change is at the consumer side (engine reads these on regen) and frontend (writes them on save) |
| `MortalityDataSettings.tsx` (380 LOC, well under 800-line budget) | Per-subject inclusion checkbox + comment OverridePill | Schema consumer (F3 surface for cause-category dropdown) | **Primary frontend target for F3** — gain a per-row dropdown of 6-bucket taxonomy with system-suggested-cause advisory (rule 21); `included_in_terminal` migrates from `ScheduledOnlyContext` to annotation persistence (F4 / Gap K) |
| `ModifierStrip.tsx::computeMortalityCell` | Null-as-TR inference at the noael-mortality cell | "Wrong mortality-cell display" | **Primary frontend target for F1's null-as-TR fix** — replace `relatedness !== "accidental"` filter with engine-asserted `cause_category === "treatment_related" || === "treatment_related_possible"` filter (consumes engine, no inference) |
| `useStudyMortality.ts` | React hook fetching `study_mortality.json` | Field-contract consumer | Read-only — gains new fields automatically via TanStack-Query JSON deserialization |
| `types/mortality.ts` | TS types for mortality JSON | Contract triangle declaration | **MUST update in same commit as F4** per rule 18 (declaration / enforcement / consumption sync) |
| `knowledge-graph.md` | Atomic fact registry | Threshold declarations (F5) | **Primary domain-truth target for F5** — add 4-6 typed facts (subchronic/chronic/carc thresholds + WC truth-table) following NOAEL-FACT-006/007 pattern |

## LOC budgets

| Directory | Budget | Current state of touched files |
|---|---|---|
| `backend/services/analysis/` | 500 lines/file | `mortality.py` 549 LOC (over budget; existing). Adding 8 WC components + provisional/confirmed LOAEL emission would push to ~750+. **Plan: split `mortality.py` into entry-point (`mortality.py`, ~250 LOC) + helper module `mortality_woe.py` (~250 LOC for WC-1..8 + decision logic + organ-of-death canonicalization). Threshold literals are removed (migrate to query-knowledge.py reads via F5).** Net: both files under budget post-refactor. |
| `backend/generator/` | 500 lines/file | `view_dataframes.py` already over 500. Mortality LOAEL participates in NOAEL MIN — no LOC change expected (existing `mortality_noael_cap` field continues to be read; provisional does NOT participate in MIN, only confirmed). |
| `frontend/src/components/` | 800 lines/file | `MortalityDataSettings.tsx` 380 LOC. F3 dropdown + advisory adds ~100 LOC. Within budget. |
| `frontend/src/components/analysis/noael/` | 800 lines/file | `ModifierStrip.tsx` ~400 LOC (estimate). F1 cell-fix is ~5 LOC swap. Within budget. |

## Cross-topic constraints (from prior cycles)

| Cycle | Status | Interaction with GAP-304 |
|---|---|---|
| **NOAEL-ALG** (commits adefdb86, c9db754c, 661537a4, 2026-04-27) | Build complete | NOAEL-ALG ships `endpoint_loael_summary` (top-level key in `unified_findings.json`) + per-finding `loael_driving` payload. **GAP-304 does NOT touch these — mortality LOAEL is a separate cap field (`mortality_noael_cap` → `study_mortality.json::mortality_loael_*`).** No contention; the two cap systems compose at S16 NOAEL-MIN. |
| **NOAEL-ALG hygiene** (BUG-032 terminal-day fallback, BUG-033 WoE C1/C3/C4 per-dose tightening, commit 3ba49caa, 2026-04-28) | Shipped | Establishes the pattern for "WoE per-pairwise tightening at small N + clinical-floor preservation". WC-2 clinical-floor sub-tier (per R6-1 fix) preserves the canonical Hy's Law (BILI required); WoE integration handles the multi-domain case. **The pattern is consistent — both NOAEL-ALG and GAP-304 use Rule (A) clinical-floor + Rule (B) multi-component integration.** |
| **GAP-361** (mortality-cell null-as-TR defect, ModifierStrip) | Filed 2026-04-27 (commit 06341b5a, GAP-362 advisory popover companion) | **Subsumed by GAP-304 F1 + F3.** Blueprint must explicitly close GAP-361 by adopting `cause_category === "treatment_related" || === "treatment_related_possible"` as the cell-firing predicate. |
| **GAP-362** (override-popover advisory pattern, rule 21) | Filed 2026-04-27 | F3's per-row classification dropdown implements the rule-21 advisory pattern named in GAP-362. The Save button stays enabled regardless of engine caveats; the confirmation prompt is the advisory. |
| **GAP-305** (mortality_overrides schema extension) | Open in TODO | Subsumed by F4 — same JSON schema, same audit-trail fields. |
| **GAP-306** (provisional/confirmed LOAEL display) | Open in TODO | Subsumed by F2.5 + F7 — UI surface for the provisional/confirmed pair. |
| **GAP-363** (knowledge-graph mortality threshold typing) | Implicitly DATA-GAP-MORTALITY-05 | Subsumed by F5. |
| **NOAEL-FACT-006/007** typed-knowledge-graph precedent | Live as of 2026-04-27 | F5 pattern: write `MORTALITY-THRESHOLD-FACT-001..004` (subchronic-critical, subchronic-warning, chronic-critical, carcinogenicity-survival) as `fact_kind: threshold` with `policy_id`, `consumed_by` paths to `mortality.py`, `derivation_status: stable` (these are regulatory conventions, not provisional). Plus `MORTALITY-WOE-FACT-001` capturing the WC-1..8 truth-table as `fact_kind: gate_criterion`. |
| **brain-concordance-bw-mediation / -guard / -species-bands / -compound-class** (S10 contention family) | Blueprint-complete or build | Asymmetric — GAP-304 reads finding-level `treatment_related` + `severity` (S05 / S03 outputs) but does NOT modify the signal-score formula. **No contention.** |
| **fct-lb-bw-band-values** (NOAEL byte-parity gate, commit d9c22a92) | Shipped | F2 may shift `mortality_loael` on PointCross (provisional 200) and other studies. Coordinate with the v2 byte-parity baseline (already established for NOAEL-ALG) — extend to track `mortality_loael_provisional` per study, OR document that mortality cap was not previously gated and starts fresh at F2 deploy. |
| **GAP-271 Phase 2 BFIELD-21** (severity enum widened to `not_assessed`) | Shipped | Established the contract-triangle exemplar. F1's 6-bucket `cause_category` enum is exactly the BFIELD-21 pattern: declaration (knowledge-graph fact + TS union + Pydantic + JSON schema + contract-doc row) + enforcement (pytest invariant + commit-intent) + consumption (frontend renderers + backend pipeline + generated docs). **All sites must be updated in the F4+F1 atomic PR.** |

## S10 contention — sequencing call

ESCALATION.md S10-contention family does NOT include GAP-304 because mortality is a separate cap path. GAP-304's S10 touch is read-only on the signal-score formula (it consumes finding-level `treatment_related` + `severity` only). **Sequencing recommendation: GAP-304 can build in parallel with brain-concordance Phase B and RCV — no contention.** Architect gate validates in Step 2.

## No FAILED entries directly relevant

Decisions log scan:
- 0 FAILED entries on `mortality.py` or `MortalityDataSettings.tsx` code paths.
- 0 reverted commits on mortality classification logic.
- The closest precedent is the BUG-031 retrospective — the structural failure mode (frontend re-derives differently from backend) is the SAME defect class as GAP-361 and is architecturally addressed by F1's "frontend consumes engine" rule.

## bug-patterns.md does not exist

Consistent with all 12+ prior blueprint Step 0 logs in `.lattice/cycle-state/`. No bug-patterns input.

## R6 process retrospective lattice changes (already incorporated)

The R6 cycle (revision 6, 2026-04-29) embedded three lattice changes that govern this build phase:

| Change | Status | Build-phase implication |
|---|---|---|
| **E1: rule 24 working draft** — algorithmic specs that classify findings as TR / adverse / LOAEL-driving must integrate evidence across multiple domains | Working draft, not yet codified in CLAUDE.md | Synthesis must explicitly cite multi-domain integration as the design principle for F2 |
| **E2: peer-review skill + review skill require real-study walk** | Already updated (R6 was the first to use it) | Step 4 R1 + Step 6 R2 plan reviews of the synthesis must walk PointCross + Nimble + 1 NHP study end-to-end through the synthesis's WC framework, citing actual `unified_findings.json` data |
| **E3: rule 19 is per-revision, not per-spec** | Already in `/lattice:review` skill | Every iteration of the synthesis through R1→R5 cycle gets its own data-grounded interpretation paragraph; plan reviews check that the paragraph reflects the *current* spec, not a prior version |

**Synthesis-phase implication:** Build Plan acceptance criteria for F2 must include a per-criterion "this fires on PointCross 200 mg/kg" or "does NOT fire on Nimble due to study-validity gate" data-grounded check, not just unit-test scaffolding.

## Pre-blueprint gates from research (carry forward to synthesis)

The research validated three pre-blueprint gates (per Feature dependency graph rules 7, 8 + research §F2.2):

1. **MCC-RG-10** — 5-pathologist inter-rater exercise on `treatment_related_possible`. **Blueprint must include this as a gating data-gap before F1 design freezes** (Cohen's kappa ≥ 0.6 across PointCross + Nimble + 1 NHP + 1 dog study). Failure consequence: drop to 4-bucket taxonomy.
2. **DATA-GAP-MORTALITY-05** — control-mortality thresholds typed in `knowledge-graph.md`. **Blueprint must sequence F5 (typed promotion) BEFORE or ATOMIC WITH F4+F1** per rule 22.
3. **DATA-GAP-MORTALITY-07** — non-rodent study census. **Blueprint must include this as a scoping signal for F5 (knowledge-graph promotion priority order — non-rodent populated facts are higher value if non-rodent census shows >25% of corpus).**
4. **MCC-RG-19** — canonical organ-of-death mapping table (≥20 most common cause-of-death terms). **Blueprint must sequence MCC-RG-19 BEFORE WC-1 implementation** per Feature dependency graph rule 8.

## Failed-approaches summary

None for GAP-304 specifically. The R0+R1+R2 PEG-1..5 single-signal architecture (now replaced by WoE WC-1..8) is the closest "abandoned approach" — but that abandonment happened in the research phase before blueprint, so there's no FAILED entry in decisions.log against the build path. The user retrospective trigger and structural correction (R6) are documented in the research doc Peer Review Notes section.

## Step 0 disposition

- 0 FAILED entries relevant
- 1 architectural pivot reused (frontend consumes engine; no re-derivation) — same shape as NOAEL-ALG
- 4 pre-blueprint gates carried forward (MCC-RG-10, DATA-GAP-MORTALITY-05, DATA-GAP-MORTALITY-07, MCC-RG-19)
- 1 LOC-budget adjustment surfaced (`mortality.py` split into entry + `mortality_woe.py` helper module)
- 1 sequencing recommendation surfaced (GAP-304 builds in parallel with brain-concordance Phase B / RCV — no contention) — needs Step 2 architect adjudication
- All cross-topic constraints documented (NOAEL-ALG, GAP-361/362/305/306, fct-lb-bw, BFIELD-21 contract-triangle pattern)
- All E1-E3 lattice changes are active (real-study walk requirement, per-revision rule 19, multi-domain integration principle)

**Synthesize agent should be told:**

> "The backend already implements 3-bucket cause classification + bare-undetermined-drives-LOAEL semantics. F1 reframes the user-axis as 6-bucket taxonomy with `treatment_related_possible` engine-asserted via WoE integration; the engine's per-death `cause_category` becomes authoritative and the frontend stops inferring TR from null. F2 lands the WoE Integration Framework (WC-1..8 with Rule A clinical-floor / Rule B ≥2-component integration) ONCE at the backend, in a new `mortality_woe.py` helper module (preserves `mortality.py` < 500 LOC budget). Frontend `ModifierStrip` and `MortalityDataSettings` consume engine outputs (cause_category, mortality_loael_provisional, mortality_loael_confirmed) — no re-derivation. F4+F1 ship atomically (rule 18 contract triangle). F5 lands BEFORE or ATOMIC WITH F4+F1 (rule 22). MCC-RG-19 lands BEFORE WC-1 implementation. Algorithm-defensibility check (rule 19) is per-revision: PointCross + Nimble + 1 NHP study walked end-to-end against `unified_findings.json` data."
