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
