# Step 0 — Implementation Context (syndrome-stage-taxonomy)

Date: 2026-04-29
Cycle: blueprint

## Decisions log scan (relevant entries)

- 2026-04-29 syndrome-stage-taxonomy research-cycle COMPLETE. R0 16 + R1 3 + R2 10 = 29 RG; 9 DATA-GAP. Probe ALL_SAFE/PROPAGATES — no BREAKS, no SCIENCE-FLAG; rule 18 + rule 22 deferred to build-cycle as expected. Three RECONSIDER-SURFACE candidates flagged for design audit at phase-3a (member-roles table re-grouping, recovery-pane advisory chip, auto-narrative export). No FAILED entries on this topic.
- Closely-related upstream: `radar-forest-cleanup` is `build-partial` (phase 1+2 shipped, phase 3 = this topic). Phase 3 swaps outer grouping axis from `role` to `projection`.
- Cross-topic constraints touching same code paths: none active. `cross-domain-syndromes.ts` is on the canonical-pattern list (code-quality-guardrails.md) — cannot simplify without scientist review (10-syndrome pattern matching, compound boolean parser).

## Bug-patterns

`.lattice/bug-patterns.md` does not exist. No project-wide failure-family memory to consult.

## Code-quality guardrails (code-quality-guardrails.md)

Domain-critical modules touched by this build:
- `cross-domain-syndromes.ts` — 10-syndrome pattern matching with compound boolean logic. Removing or restructuring any arm breaks syndrome detection. **Adding** an orthogonal `stage` field to `EndpointMatch` does NOT touch the matching arms; it is additive. Safe.
- `endpoint-confidence.ts` — 5-dim integrated confidence scoring. Unaffected (stage is mechanism-position, not confidence).
- `findings-rail-engine.ts` — Tier dispatch. Unaffected.
- `progression-chains.md` — 14 organ chains, prose form. Branch 4 verdict: strict orthogonality. Auto-narrative-time enrichment is post-process join, NOT a stage taxonomy concern. Promotion to typed graph deferred (RG-STAGE-04-1).

Per-file complexity budget: `cross-domain-syndromes.ts` already large (canonical-pattern). Adding stage default-derivation function + topology field will extend it. Phase 3a schema landing should NOT add new fall-throughs; it adds a typed object to the existing types module + a new `defaultStageForMember(member): SyndromeStage` pure function. Phase 3b-3d data is in `cross-domain-syndrome-data.ts` (the catalog), not the engine.

## Prior cycle states cross-impact (cycle-state YAML scan)

Topics that touch the same files/subsystems and may interact:

| Topic | Phase | Files touched | Interaction with stage taxonomy |
|---|---|---|---|
| `radar-forest-cleanup` | build-partial (phase 1+2 shipped) | `cross-domain-syndromes.ts`, `SyndromesPane.tsx`, `findings-bridge.ts` | **Direct prerequisite.** Phase 3 of radar-forest is this stage swap. The `member-roles × dose` table outer-axis becomes `projection` once stage lands. UI fallback to `role` for unstaged syndromes is the explicit acceptance criterion. |
| `protective-syndrome-engine` | build-complete | `cross-domain-syndromes.ts:detectProtective*` | `ProtectiveEndpointMatch` parallel structure. Stage applies to protective members too — schema must mirror across both EndpointMatch types or share via composition. |
| `cohort-view-redesign` | research/blueprint | Cohort filters touch `EndpointMatch.role`, `severity` | Cohort filters may want to filter by `projection`. Not blocking; schema extension is additive. |
| `findings-stacked-severity-chart` | unknown | `SyndromesPane.tsx` neighbour | None expected; chart is severity-axis. |
| `agent-driven-frontend-ux` | research-only | None code path | None. |

No cross-cycle conflict. Stage schema landing is additive; downstream consumers (radar-forest Phase 3 grouping, auto-narrative) gate on its arrival.

## Failed approaches in decisions log

No FAILED entries relevant to this topic. The 5 R1 + 10 R2 CONDITIONAL findings (auto-accepted during research-cycle) are already incorporated into the research doc's "Peer Review Notes" + "Aggregate research gaps" sections. Synthesize must reference them rather than re-litigate.

## Constraints inherited from prior topics' decisions

1. **Rule 18 contract triangle is mandatory.** Stage adds a NEW contract triangle: declaration (`SyndromeStage` TS union + `knowledge-graph.md` fact_kind=`syndrome_member_stage`), enforcement (`audit-knowledge-graph.py` + pytest invariant), consumption (frontend renderers + auto-narrative + query-knowledge.py). All three MUST land in Phase 3a synchronously. Topic `fct-lb-bw-band-values` is the cautionary tale — phase 0-7 complete on disk but build.2 stalled on triangle drift; reuse the lesson (don't ship partial alignment).

2. **Rule 22 atomic-fact discipline.** Per-member stage assignments are atomic, contradictable claims → typed knowledge-graph entries (fact_kind=`syndrome_member_stage`). Default derivation (e.g., LB→biomarker) lives in code as a derivation rule (not a fact). Topology is per-syndrome, also a fact (fact_kind=`syndrome_topology`). BC-1 ↔ HCD-FACT-008/010 precedent: typed graph caught contradictions only because both lived in the typed graph.

3. **Rule 21 (algorithm-as-advisor).** Stage labels are engine-asserted advisory. UI must surface stage with override path; auto-narrative cites stage but does not gate the user's reading. Recovery-class prediction must defer to recovery-cohort observation when present (P7.2 override rule). Forbidden patterns: "refused / suppressed" framing on stage chips; gates that override toxicologist override.

4. **Rule 19 (algorithm defensibility on real data).** Stage assignments enter the algorithm-paths set. Review at phase boundaries must run against PointCross + at least one other study (CBER-POC-Pilot-Study5 for pattern smoke test) and answer "would a regulatory toxicologist agree the stage labels reflect the data?" with paragraph + values.

5. **R2 5 BLOCKING items** (RG-STAGE-R2-1..5) must be incorporated as build conditions, NOT deferred:
   - R2-1: Phase-3a level-annotation style guide (was deferred follow-on, must promote to phase-3a prerequisite)
   - R2-2: Phase-3d topology-selection decision procedure (convergent → divergent → network → multisystem residual)
   - R2-3: Phase-3a `aop_review_tier` OR fifth `inference_basis` value (`published_peer_review`) for non-AOP-Wiki peer-reviewed citations
   - R2-4: Phase-3 P7.1 study-duration moderator (≥13 weeks → tissue-first; <13 weeks with biomarker-only → biomarker-first)
   - R2-5: ICH M4S(R2) added to source map before P7.1 finalization

6. **Validation-corpus reuse (rule 5).** PointCross + CBER-POC-Pilot-Study5 are the smoke-test fixtures. Olson 2000 re-tabulation gates P7.3 (translational confidence) — P7.3 is DEFERRED at phase 3 build; Olson is a follow-on data-gap (DATA-GAP-STAGE-7-1).

## Known hotspots in code-quality-guardrails (lines 119-127)

- `SyndromeContextPanel.tsx:2656` — large but pane-extracted; status: monitor only. Stage chip + topology badge would render inside MemberRolesByDoseTable / similar pane; should NOT extend the parent file beyond budget.
- `cross-domain-syndromes.ts` — not on hotspot list explicitly; `cross-domain-syndromes` is a canonical-pattern entry. The `.ts` file weighs ~1300 lines (per recent grep). Engine and data already split (`cross-domain-syndrome-data.ts`, `cross-domain-syndrome-types.ts`). Add stage types to `cross-domain-syndrome-types.ts`; default-stage derivation function may go in a new file `syndrome-stage.ts` to keep the engine focused on matching.

## Synthesize input checklist

- Research doc: `docs/_internal/research/syndrome-stage-taxonomy.md` (1466 lines, 7 deep-dives + final integration)
- R1 review: `docs/_internal/research/peer-reviews/syndrome-stage-taxonomy-review.md` (7 CONDITIONAL findings, all incorporated)
- R2 review: `docs/_internal/research/peer-reviews/syndrome-stage-taxonomy-review-r2.md` (10 CONDITIONAL findings; 5 BLOCKING for build, persisted as RG-STAGE-R2-1..5)
- Distill audit: AUDIT-CLEAN per decisions.log (no contradictions with corpus)
- Probe results: ALL_SAFE/PROPAGATES per decisions.log (no BREAKS, no SCIENCE-FLAG)
- Failed approaches: NONE on this topic
- Cross-topic constraints: radar-forest-cleanup phase 3 grouping swap, protective-syndrome-engine `ProtectiveEndpointMatch` parallel structure
- Hotspots to respect: `cross-domain-syndromes.ts` canonical-pattern; budget engine vs data vs types split

## Surface area for synthesis

The synthesis must define:

1. **Build phases** — Phase 3a (schema landing — types, knowledge-graph fact_kind, audit, contract-triangle, default-derivation, level-annotation style guide) → Phase 3b (XS01-XS06 mechanistic + auto-narrative smoke test on PointCross XS01) → Phase 3c (remaining mechanistic XS07-XS25, default-derivation reuse) → Phase 3d (~8-12 pattern syndromes with topology assignments + CBER-POC-Pilot-Study5 XS04 smoke test).
2. **Reuse inventory** — knowledge-graph fact_kind extension (Extension 8 already exists for `relevance_exclusion`; new Extension 10 for `syndrome_member_stage`, Extension 11 for `syndrome_topology`); `audit-knowledge-graph.py` add-check pattern (precedent: HCD-FACT-008/010); contract-triangle row pattern (precedent: BFIELD-21 severity widening); auto-narrative library (new but reuses ICH/Boone 2005 ordering rules).
3. **Simplicity rationale** — additive schema fields; no removal of existing role enum (UI fallback per acceptance criteria); default-derivation keeps catalog data minimal at first (only overrides go to knowledge-graph); P7.3 deferred (no premature concordance chip).
4. **Test strategy** — pytest for fact_kind validator + audit-knowledge-graph.py extension; vitest for default-stage function + topology classification + auto-narrative templates; integration smoke tests against PointCross + CBER-POC-Pilot-Study5; UI fallback test for unstaged syndromes (no regression).
5. **Research gaps** — 19 RG entries already in REGISTRY.md (16 R0 + 3 R1 + 10 R2 = 29 total; some folded). Synthesis cites the 5 BLOCKING (RG-STAGE-R2-1..5) as inline build conditions; deferred RGs stay in REGISTRY.
6. **Data gaps** — 9 DATA-GAP-STAGE-* entries already in TODO.md. Synthesis stages: 12-1 (AOP-Wiki coverage matrix) before 3b; 5-1 (pattern topology classification) before 3d; 7-1 (Olson re-tabulation) gates P7.3 (deferred); 7-3 (recovery cohort flag per fixture) gates P7.2 narrative-time conditional.

## Gate-out

NO failed approaches re-proposed. NO blocking entries from prior cycles to surface. Synthesize input is fully gated.
