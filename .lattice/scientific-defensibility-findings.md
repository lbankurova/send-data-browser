# Scientific Defensibility Audit — Findings

> **Source plan:** `docs/_internal/incoming/scientific-defensibility-audit-plan.md` (Phase 1 §1 step 6 disposition)
> **Companion:** `.lattice/engine-surface-coverage.md` (Phase 2 surface inventory)
> **Lives in parent** because `docs/_internal/research/distillations/` (the plan's preferred home) is a submodule that has heavy in-flight WIP. Migrate when submodule clears. See memory entry `project_submodule_dispatcher_deployment_pending.md` for the same wait-for-submodule pattern.

This file catalogs Phase 1 disagreements between authored GROUND_TRUTH (the credentialed reviewer's call) and current engine output. Each entry is a SCIENCE-FLAG: the engine is wrong per CLAUDE.md rule 21 (algorithm-as-advisor; toxicologist's call is final). Per audit plan §1 step 6, these are filed for prioritization, not blocked-on for Phase 1 progress.

## Phase 1 result summary (2026-04-30)

| Metric | Value |
|---|---|
| Reference YAMLs authored | 16 / 16 |
| GROUND_TRUTH equality assertions | 50 |
| MATCH | 42 |
| SCIENCE-FLAG | 8 |
| Match rate | 84% |

8 SCIENCE-FLAGs cluster into **2 root-cause families** — both trace to the same engine gap: missing severity / compound-class / dose-response gating that toxicologists apply when interpreting statistical signals.

## Phase 3 first matcher result (2026-04-30, `class_distribution`)

| Metric | Value |
|---|---|
| Studies with class_distribution authored | 14 / 16 |
| Skipped (no doc authority / multi-compound) | 2 (CJUGSEND00, FFU) |
| MATCH | 12 (was 11; +1 after Stream 3 retraction) |
| SCIENCE-FLAG | 2 (was 3; -1 after Stream 3 retraction) |

3 flags initially surfaced; 1 retracted as MEASUREMENT_ARTIFACT (Stream 3 -- see falsification below). Final flags from this matcher: 2 reinforce the existing D9 stream (Study2 + Study4 tr_adverse > 0 at the source level — was previously visible only at the noael/loael/target_organs level). Cumulative SCIENCE-FLAGs: **10** (was 11 pre-retraction); root-cause families: **2** (was 3 pre-retraction).

---

## Research stream 1: D9 — compound-class profile scoring

**Hypothesis:** Engine treats statistical signals from immunological pharmacology (vaccine response: CRP / fibrinogen / globulin elevation, spleen + LN hyperplasia, injection-site inflammation) as toxicity because compound-class context is not applied. A toxicologist looking at a vaccine study correctly classifies these findings as expected pharmacology, not adverse effects.

**Affected studies** (6 SCIENCE-FLAGs):

| Study | Surface | Engine | GROUND_TRUTH | Source |
|---|---|---|---|---|
| Study2 (CBER 456a vaccine) | noael_combined | null | 1 (treatment dose tolerated) | CBER-POC.pdf pp.9-12 |
| Study2 | loael_combined | 1 | null (no findings deemed adverse) | CBER-POC.pdf pp.9-12 |
| Study2 | target_organs_flagged | 5 organs | [] (pharmacology, not toxicity) | CBER-POC.pdf pp.9-12 |
| Study4 (CBER influenza vaccines) | noael_combined | null | 2 (highest vaccine dose tolerated) | rabbivi.pdf pp.10-12 |
| Study4 | loael_combined | 1 | null | rabbivi.pdf pp.10-12 |
| Study4 | target_organs_flagged | 5 organs | [] | rabbivi.pdf pp.10-12 |

**Resolution path:**
- Author compound-class profiles (vaccine, biologic, etc.) that adjust adversity classification
- Pharmacology-class findings (CRP elevation in vaccine studies) suppressed from adversity stats
- Engine queries `compound_profile` (per the existing reference YAML notes calling for "D9 compound profile scoring")
- Re-run validation: Study2/Study4 GROUND_TRUTH should MATCH after this fix

**Priority signal:** affects 2 of 16 reference studies (12%) but generates 6 of 8 SCIENCE-FLAGs (75%) — high leverage per fix.

---

## Research stream 2: Low-dose severity gating

**Hypothesis:** Engine puts LOAEL at the lowest active dose without applying severity gating that toxicologists apply at low statistical signals. When all doses produce statistically detectable signals (a common occurrence at high statistical power), engine collapses the NOAEL to "below tested range" rather than recognizing that low-magnitude findings at low doses are not regulatorily adverse.

**Affected studies** (2 SCIENCE-FLAGs):

| Study | Surface | Engine | GROUND_TRUTH | Source |
|---|---|---|---|---|
| TOXSCI-87497 (rat Compound B, IDO1) | noael_combined | null | 1 (Low 25 mg/kg tolerated) | TOXSCI-24-0062 publication |
| TOXSCI-87497 | loael_combined | 1 | 2 (Mid 125 mg/kg) | TOXSCI-24-0062 publication |
| TOXSCI-43066 (dog Compound A) | noael_combined sex=F | null | 1 (F tolerates Low 25 mg/kg) | TOXSCI-24-0062 publication; surfaced 2026-04-30 by AUDIT-9 sex-stratification extension |

**Why this is the canonical case:** TOXSCI-87497 is the only RDT (regulatory-grade dose-tox) study in the validation suite with a non-trivial published NOAEL. The published authors explicitly conclude that the Low dose is tolerated. Engine's "NOAEL below tested range" output for this study is structurally indefensible against the published expert call (confidence 0.8 in the existing reference YAML).

**Resolution path:**
- Add severity-magnitude floor to LOAEL determination: a statistically significant finding at Cohen-d below some threshold (likely g_lower < 0.4 or similar magnitude check) does NOT establish a LOAEL
- Same code path that the GAP-22 phase-3 magnitude-escape work touches (per recent decisions.log entry `2026-04-29T01:30:00Z` peer-review COMPLETED data-gap-noael-alg-22-phase-3 verdict:SOUND)
- Re-run validation: TOXSCI-87497 GROUND_TRUTH should MATCH

**Priority signal:** affects 1 of 16 studies (6%) but is the suite's only RDT NOAEL — highest regulatory-relevance test case.

**Cross-stream relationship:** stream 1 (compound-class) and stream 2 (low-dose severity) are likely related at the algorithmic layer — both are about adding domain context (compound class, magnitude) to the engine's bare statistical adversity classification. They can probably share infrastructure (the `_is_loael_driving_woe` layered-gate refactor in GAP-22 phase 3 may already address stream 2).

---

## Research stream 3: ~~Safety-pharm small-N under-classification~~ — RETRACTED 2026-04-30

**Status:** RETRACTED. Background-agent investigation (`research-stream-3-safety-pharm-investigation.md`) falsified the hypothesis. Verdict: MEASUREMENT_ARTIFACT.

**What happened:** The `class_distribution` matcher reported Study5 `tr_adverse=0` against `expected: { tr_adverse: { min: 1 } }`. Filed as a third root-cause family. Investigation found that ICH S7B safety-pharm CV studies (Study5, CJUGSEND00) route through a different classification framework (NOEL: `treatment_related_concerning`) than ECETOC (`tr_adverse`), per `shared/study-types/safety-pharm-cardiovascular.json:18` and `backend/services/analysis/classification.py:1126-1162`. The engine correctly classifies Study5's QTCSAG aggregate as `treatment_related_concerning` (`min_p_adj=0.0074`, `max_effect=1.93`, `+32 ms mean shift` exceeding the ICH-S7B 10 ms QTc concern threshold). The matcher's YAML expectation was authored against the wrong vocabulary; the engine had the right answer all along.

**What it teaches us about the audit process:**

1. **String-match matchers must be framework-aware.** Future Phase-3 matchers that read `finding_class` must either union both vocabularies or scope by domain/study-type. Logged for the matcher-hardening backlog (see "Recommended next action 5" in the investigation note).
2. **Self-documentation is load-bearing.** `docs/validation/signal-detection.md:158` already noted "(treatment_related, treatment_related_concerning, expected tr_adverse)" — the encoding gap was visible in the regenerated harness output before the false flag was filed. Future authoring should grep the existing harness output before encoding a new SCIENCE-FLAG.
3. **Per CLAUDE.md rule 21**, the credentialed reviewer's call IS the GROUND_TRUTH — but rule 21 cuts both ways: when the engine and reviewer agree (as here, modulo vocabulary), the matcher is what's wrong, not the engine. The audit plan's clearance protocol option 3 ("genuinely ambiguous re-classification") covers this case.

**What WAS preserved:** Study5 `class_distribution` re-authored to assert `treatment_related_concerning >= 1` and `treatment_related >= 1` — a regression guard for the engine's correct behavior under the NOEL framework.

**Genuine adjacent gap (separate from Stream 3, NOT a SCIENCE-FLAG):** the NOEL `treatment_related_concerning` value does not propagate downstream to `target_organ_summary.json` or `noael_summary.json` with the same prominence as ECETOC `tr_adverse`. Per CLAUDE.md rule 18 (contract triangle hygiene), this is a declaration-vs-consumption mismatch that warrants its own audit pass. Filed as a TODO candidate; not part of the scientific-defensibility audit findings.

---

## Research stream 4: Recovery verdict — per-subject vs cohort-aggregate semantics

**Hypothesis:** The engine's recovery-verdict logic appears to read `main_severity` from each individual recovery animal's main-arm record (which doesn't exist — recovery animals are kept alive past the main-arm sacrifice, so they have no main-arm severity), rather than the cohort aggregate at the same dose group. This causes findings that genuinely persist from main-arm to recovery to be mislabeled as `anomaly` (verdict semantics: "appeared in recovery only") instead of `persistent` or `partially_reversed`.

**Affected studies** (1 SCIENCE-FLAG so far; matcher only authored on PointCross):

| Study | Surface | Engine | GROUND_TRUTH | Source |
|---|---|---|---|---|
| PointCross | recovery_verdict (HIGH dose hepatic hypertrophy) | 10 anomaly | 10 persistent | `unified_findings.json` group_stats[3]: 9/10 affected at avg_severity=2.56; recovery cohort still shows finding at sev 2.0 |

**Smoking gun:** `recovery_verdicts.json:per_subject:{HIGH-recovery subject}.findings[].main_severity = null` even when the cohort aggregate at the same dose group shows 9/10 affected. The per-subject schema field appears semantically misaligned: it's named `main_severity` but is computed from this-subject's main-arm record (always null for recovery-arm subjects) rather than the cohort aggregate. The verdict logic then concludes `null vs 2.0 = anomaly`.

**Distinct from streams 1+2:**
- Stream 1 (compound class): false-positive adversity calls due to missing pharmacology context
- Stream 2 (low-dose severity): false-positive LOAEL anchoring at low-magnitude doses
- Stream 4 (recovery verdict): false-anomaly verdicts on persistent findings, due to per-subject vs cohort-aggregate schema mismatch in recovery_verdicts.json

**Resolution path:**
- Trace `backend/services/analysis/recovery_verdicts.py` (or wherever the verdict logic lives — needs grep) to determine where main_severity is sourced
- If it reads the individual's main-arm record, change to read cohort-aggregate from `unified_findings.json:group_stats[dose_level].avg_severity`
- Re-run harness; verify HIGH hepatic hypertrophy verdict flips from anomaly to persistent
- Consider whether MED-dose `anomaly` verdict (engine correct) survives the schema change — it should, because MED main-arm aggregate is null for hypertrophy

**MED case is engine-correct:** PointCross MED-dose hepatic hypertrophy genuinely emerges only in recovery (main arm group_stats shows 0/10 affected at MED). The matcher's MED `anomaly>=10` assertion is a MATCH and serves as a regression guard for the correctly-fired engine path.

**Priority signal:** matcher only authored on PointCross so far — broader leverage check requires authoring across the other 4 recovery-bearing studies (TOXSCI-35449, instem, PDS, Study4). Suspected affects all studies with persistent histopath findings at top dose. Wide blast radius across recovery-bearing tox studies.

**Surfaced by:** `recovery_verdict` matcher (Phase 3 matcher #6, AUDIT-5, this commit).

---

## Research stream 5: Cross-organ co-firing not captured by `cross_organ_syndromes`

**Hypothesis:** The engine's `syndrome_rollup.json:cross_organ_syndromes` array exists to surface multi-organ injury patterns to the synthesis page (a Hy's-Law-style pattern is the canonical clinical use case). The current implementation only fires on syndromes whose **definition** spans multiple `organ_system` values per `shared/syndrome-definitions.json` (gate at `generator/syndrome_rollup.py:488` -- `if len(organs) > 1`). But of the 33 cross-domain syndromes in the catalog (XS01-XS10, XC*), **zero are multi-organ-defined**; only the histopath rule `phospholipidosis` qualifies. So studies with multiple single-organ syndromes co-firing -- the actual multi-organ injury signal a toxicologist would name -- are invisible to this surface.

**Affected studies** (1 SCIENCE-FLAG so far; matcher only authored on PointCross + 2 phospholipidosis MATCH pins):

| Study | Surface | Engine | GROUND_TRUTH | Source |
|---|---|---|---|---|
| PointCross | cross_organ_syndromes length | 0 | >=1 | `syndrome_rollup.json:by_organ` shows 16 syndromes co-firing across 7 organs (hepatic XS01 + hematologic XS04 + renal XS03 + ocular XC12c + endocrine XC04a + immuno XS07 + reproductive XC06). A credentialed toxicologist would absolutely flag this as a multi-organ syndrome of concern. |

**Smoking gun:** PointCross has unambiguous multi-organ injury -- hepatocellular toxicity (XS01 with 7 subjects, MODERATE/HIGH confidence), bone-marrow + lymphoid + erythroid suppression (XS04 with 31 subjects), nephrotoxicity, corneal effects (24 subjects), adrenal stress hypertrophy, immunotoxicity, all firing concurrently at HIGH dose. The engine emits `cross_organ_syndromes: []` because each individual syndrome's definition is single-organ. The architecture conflates "syndrome that spans organs in its definition" (which is rare and currently means only phospholipidosis) with "study where multiple syndromes co-fire across organs" (which is the actually-clinical question).

**Distinct from streams 1, 2, 4:**
- Stream 1 (compound class): false-positive adversity calls due to missing pharmacology context
- Stream 2 (low-dose severity): false-positive LOAEL anchoring at low-magnitude doses
- Stream 4 (recovery verdict): false-anomaly verdicts due to per-subject vs cohort-aggregate schema mismatch
- Stream 5 (cross-organ co-firing): the engine's design is missing the surface, not its detection -- the per-organ `by_organ` rollup correctly captures all 16 syndromes; the cross-organ summary mechanism is just blind to co-firing patterns

**Resolution path:**
- Extend `generator/syndrome_rollup.py` to compute a second-tier "co-firing" view: for each (dose, phase) cell, group all firing syndromes by `organ_system` and surface a cross-organ entry when >=N organs have at least one firing syndrome at that cell
- Threshold N=3 is a starting heuristic; calibration TBD against the corpus
- Alternatively: enrich the cross_organ_syndromes array with a second entry-shape ("co-firing pattern") distinct from the existing definition-spanning shape; consumer (synthesis page) renders both
- Either path is generative work, not a one-line fix; trace the synthesis-page consumer first to ensure the rendering layer can absorb a new entry-shape

**Phospholipidosis MATCH pins (instem n=7, TOXSCI-96298 n=32):** the engine's existing definition-spanning mechanism fires correctly for the one multi-organ-defined syndrome. These MATCHes lock in that emission as a regression pin per CLAUDE.md rule 18 (contract-triangle hygiene: declaration site = `shared/syndrome-definitions.json` organ field; enforcement site = these assertions; consumption site = synthesis page rendering). Any future change to phospholipidosis's organ_system list, or to the `len(organs) > 1` gate, will trip these assertions.

**Priority signal:** matcher only authored on PointCross + 2 MATCH studies so far. PointCross's pattern is unambiguous; broader corpus authoring (other studies with co-firing patterns) deferred. Suspected affects most studies with target organ count >=3 -- needs corpus-wide assessment in expansion.

**Surfaced by:** `cross_organ_syndrome` matcher (Phase 3 matcher #7, AUDIT-10, this commit).

---

## Research stream 6: LB onset detection threshold (2x control mean) misses cohort-level adversity

**Hypothesis:** The engine's `subject_onset_days.json` LB rule -- "first measurement day where this subject's value > 2x control mean" -- is a per-subject extreme-elevation threshold. When cohort-level adversity is established (statistically significant elevation, target organ flagged) but per-subject ratios fall in the 1.2x-1.8x range (typical small-N noise distribution around a 1.4x cohort mean), most affected subjects don't individually cross 2x and so have no recorded onset for that test. The Cohort view's onset_day filter then surfaces only the threshold-crossing outliers, giving the toxicologist an incomplete picture of cohort-level emergence.

**Affected studies** (1 SCIENCE-FLAG so far; matcher only authored on PointCross):

| Study | Surface | Engine | GROUND_TRUTH | Source |
|---|---|---|---|---|
| PointCross | LB:AST onset, HIGH dose, by day 92 | 1/29 subjects | >=5/10 main-cohort | `unified_findings.json` group_stats[3] for AST shows HIGH/control ratio = 1.41 M / 1.56 F at terminal day, statistically adverse, hepatic flagged. Per-subject 2x threshold catches only PC201708-4009. |

**Smoking gun:** PointCross HIGH-dose AST cohort means show 1.41-1.56x control at terminal day -- a statistically meaningful, target-organ-flagged elevation. The engine's per-subject onset rule (`onset_recovery.py:_extract_lb_onset`) requires `value > 2.0 * abs(control_mean)`; with cohort mean 1.41x and typical CV, only 1 subject in 29 (3.4%) crosses 2x. A toxicologist filtering "HIGH-dose subjects with AST onset by week 13" would expect to see 8-10 of 10 affected subjects (the cohort signal); the engine returns 1 subject.

**Distinct from streams 1, 2, 4, 5:**
- Stream 1 (compound class): false-positive adversity calls due to missing pharmacology context
- Stream 2 (low-dose severity): false-positive LOAEL anchoring at low-magnitude doses
- Stream 4 (recovery verdict): false-anomaly verdicts due to per-subject vs cohort-aggregate schema mismatch in `recovery_verdicts.py`
- Stream 5 (cross-organ co-firing): engine's `cross_organ_syndromes` array misses multi-organ patterns because the gate is "syndrome whose definition spans organs" not "study where multiple syndromes co-fire across organs"
- Stream 6 (LB onset threshold): engine's per-subject 2x rule under-detects emergence when cohort-level adversity is at <2x per-subject. Different code path (`onset_recovery.py` vs `recovery_verdicts.py`), different mechanism (threshold vs schema), different consequence (under-detection vs verdict mislabeling). Closest sibling to Stream 4 in the "per-subject computation diverges from cohort-level adversity" meta-pattern.

**Resolution path:**
- Replace the absolute 2x threshold with a relative-to-cohort-mean trigger: a subject's onset day is the first measurement day where their value diverges from the per-subject baseline OR exceeds an HCD-aware threshold (within-species reference range), whichever applies
- Alternative: fall back to "first measurement day where the cohort mean shows statistical significance vs control" for subjects whose value tracks the cohort mean within typical variance -- this gives every subject in the affected cohort an onset registered at the cohort-significance day, matching the toxicologist's mental model
- Either path is generative work; trace the Cohort view's onset_day filter consumer first to confirm it can absorb the new semantics
- Direction-aware threshold: current rule uses `abs(val) > threshold` which is broken for decreases (negative direction findings like RBC↓ would never fire because `abs(decreased value)` is still less than `2 * abs(control)`). May explain why the only PointCross HIGH-dose subjects with LB onset entries are AST/ALT/BASO -- direction-positive findings only.

**Priority signal:** matcher only authored on PointCross AST so far; corpus-wide assessment pending. Suspected affects every multi-timepoint study with cohort-level LB elevation < 2x control. Wide blast radius across the validation suite, plus all repeat-dose tox studies generally that drive onset-of-effect calls from per-subject longitudinal LB.

**Surfaced by:** `onset_concordance` matcher (Phase 3 matcher #8, AUDIT-8, this commit). Two PointCross MATCH pins also authored: HIGH AST onset >=1 (regression pin for engine's correct catch of PC201708-4009) and HIGH CL:ALOPECIA onset >=1 (data-preservation pin for raw_subject_onset_days). MI/MA assertions intentionally omitted because engine's MI/MA semantics are sacrifice-day proxy (always = SACRIFICE_DY for affected subjects) -- tautologically passes any assertion, no information value.

---

## ~~Original Stream 3 hypothesis (preserved for retrospective)~~

The text below is the original Stream 3 framing, kept here for the audit record. All numeric claims are superseded by the falsification above.

**Hypothesis:** Engine's statistical adversity classification is conservative at small-N (telemetry safety-pharm studies typically run N=4-6). When statistical significance can't be established due to power limitations, findings get classified as `equivocal` or `not_treatment_related` even when a credentialed reviewer's interpretation is `tr_adverse`.

**Affected studies** (1 SCIENCE-FLAG, surfaced 2026-04-30 by `class_distribution` matcher):

| Study | Surface | Engine | GROUND_TRUTH | Source |
|---|---|---|---|---|
| Study5 (CV crossover, 6 dogs, Latin square) | tr_adverse count | 0 | ≥1 | 3-1-PILOT_CV_Redacted.pdf Tables 10-11 |

The report explicitly identifies QTc prolongation at 150 mg/kg as significant (p<0.05 at 2h+3h, +18.3% / +43.4 msec peak). A toxicologist reviewing this would call it adverse; the engine produces zero `tr_adverse` findings (13 equivocal, 26 not_treatment_related, 13 not_assessed instead).

**Why this is distinct from streams 1 & 2:**
- Stream 1 (compound class): the engine OVER-classifies vaccine pharmacology as toxicity. Direction: false positive.
- Stream 2 (low-dose severity): the engine OVER-classifies low-dose statistical signals. Direction: false positive at low doses.
- Stream 3 (small-N safety-pharm): the engine UNDER-classifies findings when N is too small for traditional statistical adversity. Direction: false negative. Opposite direction from streams 1+2.

**Resolution path:**
- Apply credentialed-reviewer override semantics from CLAUDE.md rule 21 at the per-finding level
- When a finding's effect-size is regulatorily meaningful (e.g., QTc Δ > 30 msec for an ICH S7B endpoint) but small-N statistics don't reach significance, surface as `tr_adverse` with reduced confidence rather than demoting to `equivocal`
- Likely shares structure with stream 2 — both need an effect-size floor, but stream 2 RAISES the threshold (low-dose findings need bigger effect to count) and stream 3 LOWERS it (small-N + clinically-meaningful effect size should count as adverse)
- Domain-specific thresholds (CV / EG / RE for safety pharm) likely live in `knowledge-graph.md` once authored

**Priority signal:** affects 1 of 16 studies in this audit (6%); but applies to ALL safety-pharm studies (CJ16050, CJUGSEND00, Study5 in this corpus, plus most ICH S7A/B studies generally). Wide blast radius outside the validation suite.

**Surfaced by:** `class_distribution` matcher (Phase 3, this commit). Without per-class encoding, this flag was invisible — Phase 1's NOAEL/LOAEL/target_organs assertions all matched for Study5 because the engine's per-NOAEL surface returns `null/1/[cardiovascular]`, which matches the report at the macro level. The class-level disagreement (where the engine's 0 tr_adverse contradicts the toxicologist's call) only surfaces when class_distribution is asserted.

---

## Out-of-scope omissions (2026-04-30 audit)

Per audit plan §1 step 6 ("if genuinely ambiguous, omit"):

| Study | Surface | Why omitted |
|---|---|---|
| FFU | loael_combined | Multi-compound design; "combined LOAEL" semantics ill-defined when groups represent different test articles |
| All TOXSCI + most others | target_organs_flagged | Documentation silent on target organs; engine flags 3-7 organs but no authoritative call to compare against |
| TOXSCI-43066 | female-NOAEL (sex-divergent) | No female-specific matcher in current harness; Phase 3 candidate |

These are documentation gaps, not engine gaps. Filing them as omissions (not SCIENCE-FLAGs) preserves the distinction between "engine wrong" and "no documented authority to compare against."

---

## How to clear a flag

Per audit plan §1 step 6:

1. **Engine fix:** implement the resolution path; re-run harness; verify GROUND_TRUTH MATCH; remove the entry from `.assertion-baseline.json` (the `UPDATE_BASELINE=1` env var refreshes automatically).
2. **Author error correction:** rare but possible; correct the YAML AND fix the upstream cause (e.g., a knowledge-graph fact) AND remove the baseline entry.
3. **Genuinely ambiguous re-classification:** demote to omission (delete the assertion from the YAML, remove from baseline).

Each clearance MUST update `.assertion-baseline.json`. The baseline file is a load-bearing audit artifact per audit plan §4: "the baseline file becomes a load-bearing artifact in git history. Every entry added or removed is auditable."

---

## History

| Date | Event | Result |
|---|---|---|
| 2026-04-29 | Phase 1 first checkpoint (Study3) | 0 flags |
| 2026-04-29 | Phase 1 second checkpoint (Study1/2/3/4 + matcher extension) | 6 flags filed (vaccine over-classification) |
| 2026-04-29 | TOXSCI cluster (4 studies) | 2 flags filed (TOXSCI-87497 NOAEL/LOAEL) |
| 2026-04-30 | Phase 1 completion (final 6: CJ16050, CJUGSEND00, FFU, instem, PDS, Study5) | 0 new flags |
| 2026-04-30 | Phase 1 disposition (this file authored) | 8 flags grouped into 2 research streams |
| 2026-04-30 | Phase 3 first matcher (`class_distribution`) authored across 14/16 studies | +3 flags (Study2/4 reinforcement; Study5 NEW family); cumulative 11 flags / 3 streams |
| 2026-04-30 | Stream 3 falsified by background-agent investigation (vocabulary mismatch, not algorithmic gap) | -1 flag (Study5 retracted); cumulative 10 flags / 2 streams |
| 2026-04-30 | Phase 3 matcher #2 (`severity_distribution`) shipped + PointCross hepatic min:3 authored | 0 new flags; cumulative remains 10 / 2 |
| 2026-04-30 | Phase 3 matcher #3 (`tumor_detected`) shipped + PointCross + Nimble authored | 0 new flags; cumulative remains 10 / 2 |
| 2026-04-30 | Phase 3 sex extension (AUDIT-9): noael_combined gains optional `sex` field; TOXSCI-43066 M+F authored | +1 flag (F-NOAEL — Stream 2 evidence); cumulative 11 flags / 2 streams |
| 2026-04-30 | Phase 3 matcher #5 (`compound_class_flag`, AUDIT-7) shipped; PointCross + 4 CBER studies authored | +4 flags (Study1/2/3/4 — D9 Stream 1 root cause captured at source); cumulative 15 flags / 2 streams |
| 2026-04-30 | Phase 3 matcher #6 (`recovery_verdict`, AUDIT-5) shipped; PointCross hepatic hypertrophy MED + HIGH authored | +1 flag (HIGH dose persistent mislabeled as anomaly — Stream 4 NEW: recovery verdict per-subject vs cohort-aggregate schema); MED match is regression guard for correct engine path; cumulative 16 flags / 3 streams |
| 2026-04-30 | Phase 3 matcher #7 (`cross_organ_syndrome`, AUDIT-10) shipped; PointCross SCIENCE-FLAG + instem + TOXSCI-96298 phospholipidosis MATCH pins authored | +1 flag (PointCross 7-organ co-firing invisible to engine's definition-spanning gate — Stream 5 NEW: cross-organ co-firing not captured); 2 MATCHes lock in phospholipidosis as the only multi-organ-defined syndrome currently emitting; cumulative 17 flags / 4 streams |
| 2026-04-30 | Phase 3 matcher #8 (`onset_concordance`, AUDIT-8) shipped; PointCross AST regression pin + SCIENCE-FLAG + CL:ALOPECIA preservation pin authored | +1 flag (HIGH AST onset 1/29 vs >=5 expected; cohort 1.41x M / 1.56x F means cohort-level adversity but per-subject 2x rule under-detects — Stream 6 NEW: LB onset detection threshold misses cohort-level adversity); 2 MATCHes pin engine's correct threshold catch + CL data preservation; cumulative 18 flags / 5 streams |

---

## Open TODOs (logged 2026-04-30)

Single source of truth for audit-related work outstanding. Action items separated by class. IDs are local to this audit (`AUDIT-N`); they're not in the cross-project TODO.md (which is in the submodule).

### Engine work — resolution paths for filed SCIENCE-FLAGs

| ID | Title | Streams it clears | Est. effort |
|---|---|---|---|
| **AUDIT-1** | D9 compound-class profile scoring | Stream 1 (10 flags: Study2/4 noael+loael+target_organs+class_distribution; Study1/2/3/4 compound_class_flag — AUDIT-7 captures the gap at source) | engine work, multi-day |
| **AUDIT-2** | Low-dose severity gating | Stream 2 (2 flags: TOXSCI-87497) | likely shares with GAP-22 phase-3 magnitude-escape, already research-validated; may already be in flight |
| **AUDIT-18** | Recovery-verdict per-subject vs cohort-aggregate schema | Stream 4 (1 flag: PointCross HIGH hepatic hypertrophy; suspected wider blast radius pending matcher expansion) | Trace `recovery_verdicts.py` main_severity sourcing; change to read cohort-aggregate from `unified_findings.json:group_stats[dose_level].avg_severity` rather than this-subject's main-arm record; ~1-2 days. |
| **AUDIT-19** | Cross-organ co-firing surface in `cross_organ_syndromes` | Stream 5 (1 flag: PointCross 7-organ co-firing; suspected wide blast radius across all studies with target_organs >= 3) | Extend `generator/syndrome_rollup.py:488` from "definition-spanning" gate (`len(organs) > 1`) to a second-tier "co-firing" computation: for each (dose, phase) cell, group all firing syndromes by `organ_system`, surface a co-firing entry when >=N organs have at least one fire (N=3 starting heuristic, calibrate against corpus). Trace synthesis-page consumer first to confirm rendering layer can absorb new entry-shape. ~1-2 days. |
| **AUDIT-21** | LB onset threshold rule too strict (2x control mean per-subject) | Stream 6 (1 flag: PointCross AST 1/29 vs >=5 expected; suspected wide blast radius across all multi-timepoint LB-bearing studies) | Replace `onset_recovery.py:_extract_lb_onset` absolute 2x threshold with cohort-aware semantics: (a) subject-baseline-relative trigger (first day where value diverges from this subject's baseline by >X SD), or (b) cohort-significance fallback (assign onset = first cohort-significant day for any subject in an affected dose group). Also fix direction-handling -- `abs(val) > threshold` ignores decreases (RBC↓, HGB↓ would never trigger). Trace Cohort view's onset_day filter consumer first. ~1-2 days. |

### Engine work — adjacent issues surfaced by audit (NOT SCIENCE-FLAGs)

| ID | Title | Origin | Est. effort |
|---|---|---|---|
| **AUDIT-3** | NOEL `treatment_related_concerning` doesn't propagate downstream | Stream 3 retraction note (`research-stream-3-safety-pharm-investigation.md`) | Contract-triangle hygiene per CLAUDE.md rule 18: declaration says 8 finding_class values, consumption sites assume 5. Affects `target_organ_summary.json`, `noael_summary.json`, `adverse_effect_summary.json`. ~1-2 days |
| ~~**AUDIT-4**~~ | ~~QTc 10ms concern threshold not in typed knowledge graph~~ | DONE 2026-04-30 -- 5 typed `threshold` facts (CV-FACT-001 QTc family / CV-FACT-002 MAP / CV-FACT-003 SYSBP / CV-FACT-004 DIABP / CV-FACT-005 HR) added to `knowledge-graph.md`; `classification.py:_CONCERN_THRESHOLDS` now cites the fact IDs as authoritative home. KG audit: 33 -> 38 facts, PASS. Query: `python scripts/query-knowledge.py --kind threshold` surfaces all 5. Scope expanded beyond AUDIT-4's QTc-only spec because the same un-typed registry pattern affected MAP/SYSBP/DIABP/HR (rule 22 violation class, not just instance); per memory `feedback_split_dont_pool_with_caveat` decomposed per-endpoint rather than pooled. |

### Audit infrastructure — Phase 3 remaining matchers

| ID | Title | Notes |
|---|---|---|
| ~~**AUDIT-5**~~ | ~~`recovery_verdict` matcher~~ | DONE 2026-04-30 — matcher shipped; PointCross MED hepatic hypertrophy MATCH (anomaly>=10, regression guard for correctly-fired engine emergence path) + HIGH hepatic hypertrophy SCIENCE-FLAG (persistent>=10 expected, engine reports anomaly=10 — Stream 4 NEW root cause: per-subject vs cohort-aggregate schema in recovery_verdicts.json). 4 other recovery-bearing studies (TOXSCI-35449, instem, PDS, Study4) still uncovered — captured as AUDIT-17 expansion. |
| **AUDIT-6** | `hcd_score` matcher | Tier 3, knowledge-graph-backed; complements the existing parity tests |
| ~~**AUDIT-7**~~ | ~~`compound_class_flag` matcher~~ | DONE 2026-04-30 — `pk_integration.json:compound_class` matcher shipped; PointCross MATCH (small_molecule baseline) + Study1/2/3/4 SCIENCE-FLAG (engine has no vaccine/gene_therapy classifier in pk_integration.py modality-detection path). 4 new flags reinforce Stream 1 at the source rather than via downstream class_distribution proxy. AUDIT-15-style per-study expansion (other 11 studies) deferred. |
| ~~**AUDIT-8**~~ | ~~`onset_concordance` matcher~~ | DONE 2026-04-30 — `subject_onset_days.json` matcher shipped; PointCross HIGH AST regression pin (>=1 by day 92) MATCH + HIGH AST SCIENCE-FLAG (>=5 expected by day 92, engine emits 1/29 -- Stream 6 NEW: per-subject 2x control-mean threshold misses cohort-level adversity) + HIGH CL:ALOPECIA preservation pin (>=1 by day 90) MATCH. Schema reuses dose_level/domain/finding_pattern/min_count; adds max_onset_day. MI/MA assertions intentionally skipped (engine's sacrifice-day proxy is tautological). Per-study expansion (LB onset for other adversity-flagged tests in PC + corpus-wide) deferred to AUDIT-22. |
| ~~**AUDIT-9**~~ | ~~Sex-specific NOAEL/LOAEL extension~~ | DONE 2026-04-30 — `sex` field added to noael_combined/loael_combined matchers; TOXSCI-43066 M=null MATCH + F=1 SCIENCE-FLAG (Stream 2 evidence) |
| ~~**AUDIT-10**~~ | ~~`cross_organ_syndrome` matcher~~ | DONE 2026-04-30 — `syndrome_rollup.json:cross_organ_syndromes` matcher shipped; PointCross SCIENCE-FLAG (7-organ co-firing pattern invisible to engine's definition-spanning gate -- Stream 5 NEW: cross-organ co-firing not captured) + instem MATCH (`phospholipidosis` n=7) + TOXSCI-96298 MATCH (`phospholipidosis` n=32). Matcher supports 3 modes: equality (id+organs+min_count), count-floor (min_count alone, used for SCIENCE-FLAG), absence (max_count: 0). 3 phospholipidosis-bearing studies still uncovered (TOXSCI-87497 n=1, gene-therapy Study3 n=3, TOXSCI-96298 covered) -- captured as AUDIT-20 expansion. |
| **AUDIT-11** | Framework-aware `class_distribution` extension | Stream 3 lesson: matcher should accept union of NOEL+ECETOC vocabularies via `also_count: ["treatment_related_concerning"]` field. Lower priority. |

### Audit infrastructure — Phase 4/5 of audit plan

| ID | Title | Plan ref |
|---|---|---|
| **AUDIT-12** | Phase 4: harness as blocking CI gate | `docs/_internal/incoming/scientific-defensibility-audit-plan.md` §4. Adds `audit-knowledge-load-bearing.py --strict` + `npm test -- generate-validation-docs` as PR-blocking checks. ~1 hour. |
| **AUDIT-13** | Phase 5: pull oracle authoring into research/peer-review skills | Plan §5. Updates `/lattice:research-cycle` + `/lattice:peer-review` to require an oracle-walk during research. ~1 hour. |

### Framework infrastructure

| ID | Title | Notes |
|---|---|---|
| **AUDIT-14** | Submodule-side rule-attestations dispatcher deployment | Parent's Path B mechanical-rules dispatcher (commit `65182f02`) is parent-only. Rules 3, 6, 11, 17 + submodule paths of rules 1/8 still honor-system. Memory entry `project_submodule_dispatcher_deployment_pending.md` has full context. ~30-45 min when submodule WIP clears. |

### Authoring expansion (lower priority)

| ID | Title | Notes |
|---|---|---|
| **AUDIT-15** | Expand `severity_distribution` per-study | Currently only PointCross. Other studies need per-study doc re-read to author defensible severity claims. |
| **AUDIT-16** | Expand `tumor_detected` per-study | Currently PointCross + Nimble. 14 other studies have tumor_summary.json data with documented expectations (mostly `expected_has_tumors: false` for short-duration studies, plus TOXSCI-87497 with background incidence). |
| **AUDIT-17** | Expand `recovery_verdict` per-study | Currently PointCross only. 4 other recovery-bearing studies (TOXSCI-35449, instem, PDS, Study4) have recovery_verdicts.json data; per-study authoring will reveal whether the Stream 4 schema mismatch reproduces beyond PointCross hepatic. |
| **AUDIT-20** | Expand `cross_organ_syndrome` per-study | Currently PointCross (SCIENCE-FLAG) + instem + TOXSCI-96298 (MATCHes). 2 phospholipidosis-bearing studies still uncovered (TOXSCI-87497 n=1, gene-therapy Study3 n=3). Plus absence-pin authoring on the 12 studies that emit `cross_organ_syndromes: []` -- regression pin via `max_count: 0`. Plus corpus-wide assessment of which other studies have multi-organ co-firing patterns (suspected: any study with target_organs >= 3, e.g., Nimble, PDS) -- those would be Stream 5 SCIENCE-FLAGs. |
| **AUDIT-22** | Expand `onset_concordance` per-study | Currently PointCross only (3 assertions: AST regression pin + AST SCIENCE-FLAG + CL:ALOPECIA preservation pin). Other PC adversity-flagged LB tests (ALT, ALP) likely show same Stream 6 under-detection -- adding 2-3 more assertions on PC would broaden the SCIENCE-FLAG anchor. Multi-timepoint dog studies (TOXSCI-43066, TOXSCI-35449) and rat (TOXSCI-87497, TOXSCI-96298) have LB onset data with documented findings; per-study authoring will reveal whether Stream 6 reproduces. |
