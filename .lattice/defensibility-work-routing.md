# Defensibility-Aware Work Routing

> **Date:** 2026-05-01
> **Source state:** `.lattice/scientific-defensibility-findings.md` (30 SFs / 5 streams as of AUDIT-22 corpus-wide close, commit 57b6ed8c)
> **Source coherence:** rebuilt parser + structured probe_outcome (lattice 920807d, pcc f86fdfe5) — 13 active topics, 0 blockers, 1 real warning (gap-288 zombie)
> **Question:** of all in-flight + planned work, what can advance now, what must pause until SFs clear, and in what order should the SF resolutions ship?

## The 5 broken engine code paths

| Stream | Engine path | Blast radius | Fix scope |
|---|---|---|---|
| 1 | `backend/services/analysis/pk_integration.py` (compound-class modality detection) + downstream adversity classification | 10 flags (Study1/2/3/4 vaccine + biologic over-classification) | AUDIT-1: compound profile system (vaccine, biologic). Multi-day. |
| 2 | NOAEL/LOAEL determination, esp. `_is_loael_driving_woe` magnitude gating | 2 flags (TOXSCI-87497 Low tolerated; 43066 F-NOAEL) | AUDIT-2 — **almost certainly the same work as `data-gap-noael-alg-22-phase-3`** (architect PASS 2026-04-29; spec implementation-ready) |
| 4 | `backend/services/analysis/recovery_verdicts.py` per-subject vs cohort-aggregate schema | 1 flag PC HIGH hepatic hypertrophy; **does NOT reproduce** on instem/PDS/Study4/35449 (AUDIT-17 negative-reproduction finding) | AUDIT-18: investigate PC-specific cause first (dual-recovery 3R+4R structure? sev 2.56 → 2.0 transition?), then narrow fix. ~0.5-1d re-scope, then 1-2d. |
| 5 | `backend/generator/syndrome_rollup.py:488` definition-spanning gate vs co-firing | 4 flags PC + Nimble + PDS + 43066; cross-species confirmed | AUDIT-19: extend gate with co-firing computation (>=N organs with at least one fire). 1-2d. Trace synthesis-page consumer first. |
| 6 | `backend/generator/onset_recovery.py:140` per-subject 2x threshold + direction-handling | **9 flags / 7 studies / 3 species / 4 organ systems** (rat hepatic + rat erythropoiesis + dog chemistry ↑/↓ + rabbit coagulation) | AUDIT-21: replace 2x with cohort-aware semantics + direction-handling fix. 1-2d. Trace Cohort onset_day filter consumer first. |

## Triage of all in-flight + planned work

### FIX-FIRST — engine work that clears SFs (sequence by leverage)

| Order | Item | Why first | Notes |
|---|---|---|---|
| 1 | **AUDIT-21** (Stream 6) | Broadest blast radius (9 flags, 4 organ systems, 3 species). Direction-handling blind spot is structural. Many downstream consumers wait on this. | Investigate Cohort view onset_day filter consumer first. |
| 2 | **AUDIT-19** (Stream 5) | Cross-species confirmed; gap-288 synthesis page is direct consumer. Same window as AUDIT-21 since they touch different generator files (`onset_recovery.py` vs `syndrome_rollup.py`); could parallelize on different days. | Trace synthesis-page rendering layer for new entry-shape. |
| 3 | **`data-gap-noael-alg-22-phase-3`** (== AUDIT-2 Stream 2 work, likely) | Already research-validated, architect PASS 2026-04-29, spec implementation-ready. Highest probability of being THE Stream 2 resolution rather than separate work. **Verify match before duplicating.** | If confirmed Stream 2 = this cycle, ship; do not open AUDIT-2 separately. |
| 4 | **AUDIT-1** (Stream 1) | 10 flags but tightly clustered on biologic/vaccine compounds (Study1-4 + downstream). Multi-day; larger scope than 6 / 5. | Will unblock both `brain-concordance-compound-class` and `mabel-framework`. |
| 5 | **AUDIT-18** (Stream 4) | Narrowed to PC-specific by AUDIT-17 negative-reproduction. Investigate-first; blast radius NOT confirmed beyond PC. | Lowest leverage; do last. |

### GO — advance now, no SF dependency

| Item | Why independent | Notes |
|---|---|---|
| **control-side-loo-calibration-simulation** | LOO calibration via simulation; doesn't touch any of the 5 broken paths. | Research-complete; ready for blueprint. |
| **hcd-mi-ma-s08-wiring** | HCD wiring at S08 (catalog tier elevation). MI/MA semantics in current SFs are tautological (sacrifice-day proxy) — none of the 30 flags involve MI/MA onset. | Already in build (build.3); finish it. |
| **nonlinear-pk-model-sufficiency** | PK model sufficiency check; orthogonal to engine surfaces in 5 streams. | Research-complete; ready for blueprint. |
| **reference-change-values-rcv** | Annotation-only invariant — RCV must NOT modify S10 scores per its own constraints. Cannot collide with any of the 5 streams by construction. | Research-complete; ready for blueprint. |
| **vehicle-pk-interaction-bcs** | Vehicle lookup table + caveat injection in `build_pk_integration` post-processing. Outside the 5 affected paths. | Blueprint-complete; ready for build. |
| **GAP-304-mortality-cause-classification** | Touches NOAEL cap input (different layer from `_is_loael_driving_woe`). Stream 2 is about WoE-driving threshold; mortality cap is upstream input. Adjacent but not overlapping. | Blueprint-complete; ready for build. |
| **AUDIT-13** Phase 5 skill wiring | Process work in `C:/pg/lattice/commands/`; cross-repo; independent of any engine work. | ~1 hour. Best at start of a fresh session for cross-repo discipline. |
| **AUDIT-15** severity_distribution per-study expand | Authoring only; matcher already shipped. | Mechanical. |
| **AUDIT-16** tumor_detected per-study expand | Authoring only; matcher already shipped. | Mechanical. |
| **AUDIT-3** NOEL `treatment_related_concerning` contract triangle | Adjacent issue from Stream 3 retraction; independent of all 5 active streams. | Engine work, contract-triangle hygiene. ~1-2d. |

### PAUSE — blocked on SF resolution

| Item | Stream(s) it builds on | When to resume |
|---|---|---|
| **bmd-modeling** | Stream 2. BMD's `RG-BMD-SYNTH-2 Task A + Task B` is "bidirectional SENDEX-NOAEL recalibration" — by name, this is the same NOAEL determination Stream 2 affects. Building BMD on top of an indefensible NOAEL leads to a recalibration that has to redo itself. | After `data-gap-noael-alg-22-phase-3` ships. |
| **brain-concordance-compound-class** | Stream 1. By name and scope this directly extends compound classification with brain endpoint specifics. Layering on top of a broken compound-class layer means the brain extension inherits the defect. | After AUDIT-1 (Stream 1 / D9 compound profile). |
| **gap-288-stage2-noael-synthesis** | Streams 4 + 5 + 6. The synthesis page is THE canonical consumer for `cross_organ_syndromes` (Stream 5), `recovery_verdict` (Stream 4), and `subject_onset_days` (Stream 6). Building it now means rebuilding when AUDIT-19 / 21 ship. | **Properly pause** (lifecycle_state: paused with reason "blocked on Streams 5+6") rather than letting it sit as a 109h zombie. Resume after AUDIT-19 + AUDIT-21 ship. |
| **cohort-view-redesign** | Stream 6. Cohort view's onset_day filter is named in AUDIT-21's "trace consumer first" requirement — it IS one of the consumer surfaces the fix has to absorb. | Phase 1b backend (`subject_correlations`) shipped is fine; pause **filter-and-onset-display work** until AUDIT-21. UI shell / similarity scatter / non-onset features can advance. |
| **mabel-framework** | Stream 1 (cautious). MABEL extends margin-config with biologic compound-class fields; if it changes how compound_class is assigned, it collides with AUDIT-1. If it only consumes existing compound_class, independent. | **Verify before resuming**: read `mabel-framework-synthesis.md` F1+F4 ontology refactor — does `mabel_analysis_required:bool` *write* to the compound-class layer or *read* from it? If write → pause. If read → GO. |

### AMBIGUOUS — settled 2026-05-01

| Item | Verdict | Evidence |
|---|---|---|
| **syndrome-stage-taxonomy** | **GO** (independent of Stream 5). | Grep of synthesis for `cross_organ_syndromes` / `syndrome_rollup` / `co.firing` / `definition.spanning` / `len(organs)` / `organ_system` returned **zero matches**. Synthesis is at a different layer entirely (single-syndrome STAGE classification — disease progression stage of a finding) and does not touch the `cross_organ_syndromes` array shape or `syndrome_rollup.py:488` definition-spanning gate. |
| **mabel-framework** | **GO with coordination note**. MABEL doesn't break Stream 1 and doesn't fix it. | Synthesis F1: `mabel_analysis_required: bool` is a USER-ENTERED annotation in `margin-config`, not engine-derived classification. F2: `_detect_mabel_annotation` is a READ helper (mirrors `_detect_oncology_flag`). Scope does extend `compound_class.py` keyword cascade — but for biologic/MABEL keywords, orthogonal to AUDIT-1's vaccine/gene_therapy keywords (different dict keys). MABEL and AUDIT-1 can ship in either order; coordinate the merge on `compound_class.py`. **Decision (R1 F4):** `regulatory_context` enum is NOT widened — MABEL stays orthogonal to ICH S9 / S11. No collision risk. |
| **`data-gap-noael-alg-22-phase-3`** == AUDIT-2 / Stream 2? | **PARTIALLY — DO NOT CONFLATE.** | Synthesis line 12: *"Test fixture answer is INVARIANT under fix -- DO NOT modify frontend/tests/ground-truth-validation.test.ts:166-179"*. Line 55: *"PointCross Combined LOAEL=dose 1, NOAEL=null is preserved"*. **The phase-3 patch is surface-preserving for the test corpus**; it refactors driver reasoning, not outcomes. **Stream 2 / TOXSCI-87497 demands a CHANGE in NOAEL output (null → 1).** Different fixture, different desired result. **Code path overlaps** (`_is_loael_driving_woe`, magnitude-escape gate at g_lower≥0.7, substantiveness floor at \|effect\|≥0.5) — but Stream 2 is NOT subsumed. Phase-3 lays the architectural foundation Stream 2 needs (layered gate); whether Stream 2 closes automatically when phase-3 ships, or needs a small extension, is a re-validation question. **Plan:** ship phase-3 first, then re-run validation harness against TOXSCI-87497. If NOAEL flips to 1 → Stream 2 closes automatically. If still null → file AUDIT-2 as a follow-on cycle to extend the gate (probably a low-dose magnitude floor sub-gate). |

## Strategic notes

1. **gap-288 zombie warning is misleading.** The coherence report flags it as stale-because-no-lock-no-checkpoint. The reality is it's blocked on AUDIT-19 + AUDIT-21 + (Stream 4 if it reproduces in synthesis-page recovery rendering). The right action is to set `lifecycle_state: paused` with reason "blocked on Stream 5+6 engine fixes", which removes the zombie warning AND records why for next-session readers. Resuming and shipping it now is technical debt: the synthesis page rebuilds when the engine outputs change.

2. **Verify Stream 2 = `data-gap-noael-alg-22-phase-3` before opening AUDIT-2.** The findings doc says "likely shares with GAP-22 phase-3 magnitude-escape, already research-validated; may already be in flight." If true, AUDIT-2 doesn't need a separate cycle — that cycle IS the Stream 2 resolution. If the cycle's `_is_loael_driving_woe` patch addresses the magnitude-escape behavior that lets TOXSCI-87497 NOAEL = 1, file no AUDIT-2.

3. **Parallel ship windows.** AUDIT-19 (`syndrome_rollup.py`) and AUDIT-21 (`onset_recovery.py`) touch different generator files and have non-overlapping consumers; can ship in either order or in parallel cycles. AUDIT-1 (Stream 1) is on a different code path again — `pk_integration.py` modality detection. Three SF-resolution streams could run as three parallel build cycles if you have the appetite.

4. **AUDIT-18 (Stream 4) deserves a re-scope step before engine work.** Per AUDIT-17 negative-reproduction across 3 species and 3 finding-shapes, Stream 4 is PC-specific. The original "read cohort-aggregate from `unified_findings.json:group_stats[dose_level].avg_severity`" fix scope was authored when blast radius was suspected wide; with the narrowed picture, the fix may be smaller (or different). Spend 0.5-1d investigating what's PC-specific (dual-recovery 3R+4R structure? specific sev 2.56→2.0 transition?) before writing the patch.

5. **Information cycle compounding.** AUDIT-13 (Phase 5 skill wiring) is the only meta-process item in the GO list; landing it pulls oracle authoring into research-cycle Step 1 + peer-review, which compounds across every future audit. Worth running soon — it makes future SF detection cheaper.

## Answers to the user's three questions

### "Is the engine TODAY scientifically defensible?"

**Partially.** Per the credentialed-reviewer audit:
- 84% match rate on Phase-1 NOAEL/LOAEL/target_organs assertions (42 of 50).
- 30 SCIENCE-FLAGs filed across 5 root-cause streams. Each represents a code path where the engine's output disagrees with a credentialed toxicologist's call on at least one study.
- The 5 streams are scoped, code-located, and have named fix paths. None are open-ended.
- 1 stream falsified (Stream 3 retraction); the 5 remaining are real.

Not defensibility-collapsed; defensibility-bounded. The bounded parts are named.

### "Will planned work improve or break the science?"

**Mixed by topic.** Routing above. 8 of 13 active topics + 4 of 5 audit infra items are GO and either improve or are orthogonal. 5 of 13 are PAUSE because they build on top of broken paths and would compound. None of the 13 actively *worsen* science (i.e., none introduce new defects); the failure mode for the PAUSE items is wasted rework when the engine fixes ship under them.

### "What can I work on, in what order?"

1. **Now (parallel-OK):**
   - Engine fixes: AUDIT-21 (Stream 6) → AUDIT-19 (Stream 5) sequencing OR concurrent
   - Verify `data-gap-noael-alg-22-phase-3` == AUDIT-2; if yes, ship it (it's already at architect-PASS).
   - Independent active topics: control-side-loo, hcd-mi-ma-s08-wiring, nonlinear-pk, RCV, vehicle-pk-bcs, GAP-304
   - Independent process: AUDIT-13, AUDIT-15, AUDIT-16, AUDIT-3
2. **After Streams 5+6 land:** resume gap-288, cohort-view-redesign onset/filter work
3. **After Stream 2 lands:** resume bmd-modeling
4. **After Stream 1 (AUDIT-1) lands:** resume brain-concordance-compound-class, mabel-framework (if it writes to compound-class layer)
5. **AUDIT-18 (Stream 4):** re-scope investigation first, then narrow fix; lowest leverage so do after the other 4 SF resolutions.
