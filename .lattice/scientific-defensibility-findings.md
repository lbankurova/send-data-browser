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

---

## Open TODOs (logged 2026-04-30)

Single source of truth for audit-related work outstanding. Action items separated by class. IDs are local to this audit (`AUDIT-N`); they're not in the cross-project TODO.md (which is in the submodule).

### Engine work — resolution paths for filed SCIENCE-FLAGs

| ID | Title | Streams it clears | Est. effort |
|---|---|---|---|
| **AUDIT-1** | D9 compound-class profile scoring | Stream 1 (6 flags: Study2, Study4) | engine work, multi-day |
| **AUDIT-2** | Low-dose severity gating | Stream 2 (2 flags: TOXSCI-87497) | likely shares with GAP-22 phase-3 magnitude-escape, already research-validated; may already be in flight |

### Engine work — adjacent issues surfaced by audit (NOT SCIENCE-FLAGs)

| ID | Title | Origin | Est. effort |
|---|---|---|---|
| **AUDIT-3** | NOEL `treatment_related_concerning` doesn't propagate downstream | Stream 3 retraction note (`research-stream-3-safety-pharm-investigation.md`) | Contract-triangle hygiene per CLAUDE.md rule 18: declaration says 8 finding_class values, consumption sites assume 5. Affects `target_organ_summary.json`, `noael_summary.json`, `adverse_effect_summary.json`. ~1-2 days |
| **AUDIT-4** | QTc 10ms concern threshold not in typed knowledge graph | Stream 3 retraction note | `_CONCERN_THRESHOLDS` in `classification.py:1237-1243` should be promoted to `knowledge-graph.md` as a `clinical_threshold` fact with `derives_from: ICH E14/S7B` per CLAUDE.md rule 22. ~30 min |

### Audit infrastructure — Phase 3 remaining matchers

| ID | Title | Notes |
|---|---|---|
| **AUDIT-5** | `recovery_verdict` matcher | Tier 2, recovery-bearing studies (PointCross, TOXSCI-35449, instem, PDS, Study4) currently UNCOVERED |
| **AUDIT-6** | `hcd_score` matcher | Tier 3, knowledge-graph-backed; complements the existing parity tests |
| **AUDIT-7** | `compound_class_flag` matcher | **Mechanically captures D9 gap (Stream 1) at the source** -- highest-leverage candidate |
| **AUDIT-8** | `onset_concordance` matcher | Tier 3, multi-timepoint studies |
| **AUDIT-9** | Sex-specific NOAEL/LOAEL extension | Tier 1, addresses TOXSCI-43066 sex-divergent NOAEL (currently UNCOVERED -- only Combined matcher exists) |
| **AUDIT-10** | `cross_organ_syndrome` matcher | Tier 2, Hy's-Law-style cross-organ patterns |
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
