# Research Stream 3 — Safety-Pharm Small-N Under-Classification — Investigation

> **Trigger:** `class_distribution` matcher reports `tr_adverse=0` for CBER-POC-Pilot-Study5 with `expected_classes: { tr_adverse: { min: 1 } }` (`docs/validation/references/study5.yaml:127-130`). Filed as new SCIENCE-FLAG family in `.lattice/scientific-defensibility-findings.md:83-108`.
> **Output:** verdict on whether Stream 3 is a real algorithmic family vs. measurement artifact vs. fold-in to Stream 1/2.

---

## 1. Question

Stream 3 hypothesis (`scientific-defensibility-findings.md:83-87`): "Engine's statistical adversity classification is conservative at small-N (telemetry safety-pharm studies typically run N=4-6). When statistical significance can't be established due to power limitations, findings get classified as `equivocal` or `not_treatment_related` even when a credentialed reviewer's interpretation is `tr_adverse`."

The evidence: Study5 (Latin-square crossover, 6 dogs, ICH S7B QTc) shows `tr_adverse=0` at the matcher level, vs. report's explicit "QTc prolongation at 150 mg/kg, p<0.05 at 2h+3h, +18.3% / +43.4 msec peak."

---

## 2. Evidence collected

**2.1 Study5 engine output — engine DOES detect QTc adversity, just not under the string `tr_adverse`.**

Inspection of `backend/generated/CBER-POC-Pilot-Study5/unified_findings.json` (52 findings):
- Aggregate `QTCSAG` (QTc Modified Spence) finding: `finding_class="treatment_related_concerning"`, `min_p_adj=0.0074`, `max_effect_size=1.93`, `dose_response_pattern="threshold_increase"`, `onset_dose_level=3` (the 150 mg/kg group).
- Group means at QTCSAG: dose_level 0 → 0.68 ms; dose_level 3 → 32.0 ms. That is a **+32 ms shift** at 150 mg/kg, which exceeds the engine's QTc concern threshold of 10 ms (`backend/services/analysis/classification.py:1237-1243`, dict `_CONCERN_THRESHOLDS`: `QTCSAG: 10.0`).
- Per-window QTc findings: QTCSAG_0-6h, _6-14h, _14-24h all classified `treatment_related` with `min_p_adj` between 0.0015 and 0.016, `max_effect_size` 1.6-2.7.
- Class breakdown: `treatment_related: 12, treatment_related_concerning: 1, equivocal: 13, not_treatment_related: 26`. Zero `tr_adverse`, zero `tr_non_adverse`, zero `tr_adaptive`.

**2.2 The string mismatch is a design choice, not a bug.** Two classification frameworks coexist in the engine:
- ECETOC (default RDT): emits `not_treatment_related, tr_non_adverse, tr_adaptive, tr_adverse, equivocal` (`backend/services/analysis/classification.py:1023-1116`, `assess_finding_with_context`).
- NOEL (safety pharmacology): emits `not_treatment_related, equivocal, treatment_related, treatment_related_concerning` (`backend/services/analysis/classification.py:1126-1162`, `assess_finding_safety_pharm`).

Documented in `docs/_internal/knowledge/field-contracts.md:1355`:
> `finding_class` | `assess_finding()` (ECETOC: 5 categories — not_treatment_related, tr_non_adverse, tr_adaptive, tr_adverse, equivocal) or `assess_finding_safety_pharm()` (NOEL: 4 categories — not_treatment_related, equivocal, treatment_related, treatment_related_concerning). Framework selected via `classification_framework` param.

Framework selection lives in `backend/generator/adapters/__init__.py:98-126` — reads `TS.STYPE` and looks up the study-type config in `shared/study-types/*.json`. `shared/study-types/safety-pharm-cardiovascular.json:18` declares `"classification_framework": "noel"`; the respiratory equivalent omits it (defaults to ECETOC).

Pipeline branch: `backend/services/analysis/findings_pipeline.py:899-918` — `if classification_framework == "noel": for f in findings: f["finding_class"] = assess_finding_safety_pharm(f)`.

**2.3 This explains the cross-corpus pattern in the original framing.**

| Study | study_type | classification_framework | finding_class encoding |
|---|---|---|---|
| CJ16050-xptonly | RESPIRATORY PHARMACOLOGY | None (ECETOC default) | `tr_adverse=5/5` ✅ |
| Study5 | CARDIOVASCULAR PHARMACOLOGY | `noel` | `treatment_related_concerning=1, treatment_related=12` (no `tr_adverse`) |
| CJUGSEND00 | CARDIOVASCULAR PHARMACOLOGY | `noel` | `treatment_related=2` (no `tr_adverse`) |
| PointCross / Nimble | RDT | None (ECETOC default) | `tr_adverse=77/6` ✅ |

So the asymmetry the original Stream 3 framing called out ("CJ16050 has 5 tr_adverse, CJUGSEND00 has 0") is not a small-N issue — it's a **framework-routing issue** decided by `study-types/safety-pharm-cardiovascular.json` electing NOEL while the respiratory profile did not. There is no power-related conservatism in the NOEL pathway: a finding fires `treatment_related_concerning` whenever `min_p_adj < 0.05` (or trend_p, or Bayesian posterior >= 0.9) AND mean diff >= QTc 10 ms threshold (`classification.py:1144-1156`). Study5's QTCSAG aggregate hits all three signals.

**2.4 Pre-existing self-documentation already calls out the artifact.**
- `docs/validation/signal-detection.md:158`: per-signal table for Study5 QTc records `(treatment_related, treatment_related_concerning, expected tr_adverse)` — i.e. the validation harness already noted the encoding gap.
- `docs/validation/summary.md:44`: same caveat at study summary level.
- `docs/_internal/incoming/archive/validation-gap-implementation-spec.md:272`: an archived spec explicitly named this case — "Study5 findings classified `treatment_related` / `treatment_related_concerning` (not `tr_adverse`)".

So the engine team has been aware of the dual encoding; the new `class_distribution` matcher in `frontend/tests/generate-validation-docs.test.ts:706-754` does an exact-string match on `finding_class` without translating between frameworks, surfacing it as a fresh-looking flag.

**2.5 Knowledge graph: no QTc-specific typed fact, but threshold is encoded in code.** Grep over `docs/_internal/knowledge/knowledge-graph.md` for `QTc|S7B|qt.*threshold` returns zero matches. Per CLAUDE.md rule 22, the QTc 10 ms cutoff is an atomic regulatory threshold and should be promoted to the typed graph; right now it lives only in `_CONCERN_THRESHOLDS` (`classification.py:1237-1243`). That is a separate knowledge-graph hygiene gap, not a Stream-3 algorithmic gap.

---

## 3. Verdict

**MEASUREMENT_ARTIFACT.**

The engine **already** classifies Study5's QTc prolongation correctly (`treatment_related_concerning` on the aggregate QTCSAG with `min_p_adj=0.007`, `max_effect=1.93`, `+32 ms` mean diff exceeding the 10 ms ICH-S7B concern threshold). The class_distribution matcher in `study5.yaml:127-130` asserts `tr_adverse: { min: 1 }` against a finding stream whose framework emits `treatment_related_concerning`, not `tr_adverse`. The two strings are the same regulatorily-meaningful concept under two coexisting classification frameworks — explicitly documented in `field-contracts.md:1355`. There is no false-negative, no small-N conservatism, and no algorithmic gap. The hypothesis described in `scientific-defensibility-findings.md:83-108` is empirically falsified by the QTCSAG row.

**What should change (matcher / encoding side, no engine change):**

1. **Demote the Study5 class_distribution assertion** as currently authored. Replace with a framework-aware predicate: assert that QTc-domain findings carry `finding_class ∈ {tr_adverse, treatment_related_concerning}` (i.e. union across both frameworks), OR scope by `domain=EG` and assert `treatment_related_concerning >= 1`. The matcher itself in `frontend/tests/generate-validation-docs.test.ts:706-754` is fine — it's the YAML expectation that's wrong.
2. **Apply the same fix to CJUGSEND00** if/when a class_distribution assertion is authored there (currently skipped per `scientific-defensibility-findings.md:25` "Skipped (no doc authority / multi-compound) | 2 (CJUGSEND00, FFU)").
3. **Update `scientific-defensibility-findings.md` Stream 3 section** to retract the family. Keep the entry as a worked retrospective: "Stream 3 surfaced 2026-04-30, retracted by code-investigation 2026-04-29 — the matcher was reading one framework's vocabulary while the engine emitted the other." Rule-21 governance: the engine had the right answer all along.
4. **Promote QTc concern threshold (10 ms) into the typed knowledge graph** as a clinical_threshold fact with `derives_from: ICH E14/S7B Q&A`. Cite from `_CONCERN_THRESHOLDS`. This satisfies rule 22 and gives the matcher a documented authority for its `min: 1` assertion. (Separate cleanup, not Stream 3.)

---

## 4. Risk to broader corpus

**Blast radius of the matcher's encoding bug, not of any algorithmic gap:**
- Two studies in the validation suite hit the NOEL framework: Study5 and CJUGSEND00. Only Study5 has a `class_distribution` assertion with `tr_adverse: {min: 1}` authored against it; that one row is the only false flag.
- Future safety-pharm CV studies (any with `TS.STYPE` matching `CARDIOVASCULAR PHARMACOLOGY` or `SAFETY PHARMACOLOGY` per `safety-pharm-cardiovascular.json:9-12`) will inherit the same NOEL routing. Authoring `tr_adverse` assertions against them would replicate the artifact.
- Respiratory safety-pharm (CJ16050) and all RDT studies are unaffected — they emit ECETOC labels.

**Genuine adjacent gap that may be confused with Stream 3:** the NOEL framework's `treatment_related_concerning` exists as a hint for downstream NOEL/LOEL determination (`view_dataframes.py:935-991`) but does not propagate into `target_organ_summary.json`, `noael_summary.json`, or `adverse_effect_summary.json` with the same prominence as `tr_adverse` in the ECETOC pipeline. Consumers (and matchers) that expect `tr_adverse` to be load-bearing across all study types will under-detect adverse safety-pharm findings even when the engine classified them correctly. That is a **contract-triangle hygiene issue** (CLAUDE.md rule 18: declaration says 8 values, consumption sites assume 5), not a small-N algorithmic gap. Worth filing separately.

**Studies to investigate next (only for the contract-hygiene issue, not Stream 3):**
- CJUGSEND00 — see whether downstream `target_organ_summary.json` / `noael_summary.json` reflect the `treatment_related` findings or whether they get filtered out.
- Any future safety-pharm intake — confirm the NOEL→ECETOC vocabulary equivalence is honored by all consumers (e.g. `view_dataframes.py:129` `if fc == "not_treatment_related"`; `view_dataframes.py:347/479/490/665/682/797` checks).

---

## 5. Recommended next action

1. **Retract the Stream 3 SCIENCE-FLAG.** Update `scientific-defensibility-findings.md` Phase 3 result table: cumulative SCIENCE-FLAGs returns to 10 / 2 root-cause families. Keep the Stream 3 section as a documented retrospective (matcher-encoding artifact retracted by code-investigation). Per `scientific-defensibility-findings.md:128-134` clearance protocol option 3 ("genuinely ambiguous re-classification: demote to omission") — except here the right framing is "matcher false positive due to dual-encoding mismatch", not ambiguity.
2. **Reauthor `study5.yaml:127-130`** to assert `treatment_related_concerning >= 1` (or a framework-agnostic `tr_adverse|treatment_related_concerning >= 1` if the matcher is extended). Do not delete the assertion — the engine's correct call deserves a regression guard.
3. **File a new TODO** (separate item, NOT Stream 3): "NOEL-framework `treatment_related_concerning` should propagate to downstream consumers (`target_organ_summary.json`, `noael_summary.json`) with adversity weight equal to ECETOC `tr_adverse`." This is the real systemic gap and warrants a contract-triangle audit pass per CLAUDE.md rule 18.
4. **Promote QTc 10-ms concern threshold to `knowledge-graph.md`** as a typed `clinical_threshold` fact with `derives_from: ICH E14/S7B`, `scope: endpoint:QTC; species:any; design:safety_pharm_cv`. Cite from `_CONCERN_THRESHOLDS`. Independent of Stream 3, satisfies rule 22.
5. **Optional matcher hardening:** extend the `class_distribution` matcher in `generate-validation-docs.test.ts:706` to accept a framework-aware union (e.g. `{ tr_adverse: { min: 1, also_count: ["treatment_related_concerning"] } }`) so future safety-pharm studies don't replay this artifact. Lower priority than 1-3 above.

---

## Appendix — file:line citations used

- `backend/generated/CBER-POC-Pilot-Study5/unified_findings.json` (52 findings; QTCSAG = `treatment_related_concerning` with effect 1.93, p_adj 0.0074, +32 ms mean diff)
- `backend/services/analysis/classification.py:1126-1162` (`assess_finding_safety_pharm` returns NOEL vocabulary)
- `backend/services/analysis/classification.py:1237-1243` (`_CONCERN_THRESHOLDS`, QTCSAG = 10.0 ms)
- `backend/services/analysis/findings_pipeline.py:899-918` (NOEL framework branch in pipeline)
- `backend/generator/adapters/__init__.py:98-126` (`get_classification_framework` reads study-type config)
- `backend/generator/view_dataframes.py:935-991` (NOEL summary uses `treatment_related` / `treatment_related_concerning`)
- `shared/study-types/safety-pharm-cardiovascular.json:18` (`"classification_framework": "noel"`)
- `shared/study-types/safety-pharm-respiratory.json` (no classification_framework field — defaults to ECETOC, explains CJ16050)
- `docs/_internal/knowledge/field-contracts.md:1355` (documents the dual encoding as the contract)
- `frontend/src/types/analysis.ts:149` (TS union type holds all 8 values)
- `frontend/tests/generate-validation-docs.test.ts:706-754` (`class_distribution` matcher does exact-string match on `finding_class`)
- `docs/validation/references/study5.yaml:127-130` (the asserting YAML row)
- `docs/validation/signal-detection.md:158` (already self-documents the encoding gap as `(treatment_related, treatment_related_concerning, expected tr_adverse)`)
- `docs/_internal/incoming/archive/validation-gap-implementation-spec.md:272` (archived spec previously identified this exact case)
- `.lattice/scientific-defensibility-findings.md:83-108` (Stream 3 hypothesis being investigated)
