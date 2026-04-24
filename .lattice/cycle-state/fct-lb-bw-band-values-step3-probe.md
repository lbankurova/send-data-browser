# Probe: fct-lb-bw-band-values Blueprint

**Date:** 2026-04-23
**Mode:** targeted
**Input:** docs/_internal/incoming/fct-lb-bw-band-values-synthesis.md (369 lines, 5 features)
**Scope-locked to:** REGISTRY CONTENT append (13 LB chem + 12 LB hem + 1 BW per-species) + ONE PRECONDITION PATCH (F5 unit conversion, ≤10 LOC)

---

## Blast Radius

**Direct (modified in PR):**
- `shared/rules/field-consensus-thresholds.json` (JSON registry append, 26 new/expanded entries)
- `backend/services/analysis/classification.py:compute_fct_payload` (F5 unit-conversion branch, ≤7 LOC)
- `backend/services/analysis/fct_registry.py` (F5 down+fold band pre-transform at load, ≤3 LOC)
- `backend/tests/test_fct_unit_conversion.py` (new, ~100 LOC)
- `backend/generated/{16 studies}/**` (regen output — verdict/coverage/fct_reliance shift for LB + BW findings)
- `backend/generated/fct-coverage-report.json` + `fct-conflicts-report.json` (regen)
- `docs/validation/fct-migration-diff-lb-bw.md` (new), `fct-phase-b-fixture.md` (update), `fct-migration-signoff.md` (new)
- `scripts/verify-fct-lb-bw-numerics.sh` (new)

**1-hop (consume the changed payload shape — affected by content shift, not schema shift):**
- `backend/generator/scores_and_rules.py:_emit` (R10/R11 read `verdict` + `coverage`, classification.py:252-266) — verdict enum for LB findings shifts from `provisional`/`none` to band-derived `variation|concern|adverse|strong_adverse`
- `backend/services/analysis/confidence.py:_score_d6_tier2_equivocal` — D6 reads `fct_reliance.bands_used.concern_floor`/`adverse_floor` at confidence.py:289-304; LB findings previously bands_used=None, now populated
- `backend/generator/view_dataframes.py:_compute_noael_confidence` — reads `verdict` at view_dataframes.py:1198-1208 for the `penalty_large_effect_non_sig` gate (line 1200: `verdict in ("adverse", "strong_adverse")` replaces legacy `|g|>=1.0`)
- `backend/generator/view_dataframes.py:_build_noael_for_groups` `n_provisional_excluded` counter (lines 772, 837, 1103) — counts findings with `verdict=="provisional"`; LB will see fewer provisional verdicts → counter decreases
- `frontend/src/lib/endpoint-confidence.ts:deriveStatisticalConfidence` — reads `ep.fctReliance.bands_used` + `ep.verdict` at endpoint-confidence.ts:735-752; LB findings take FCT path instead of legacy `|g|` path
- `frontend/src/lib/derive-summaries.ts` — propagates `fct_reliance`/`verdict` from rows to `EndpointSummary.fctReliance` (lines 336-342, 527-541)
- `frontend/src/types/analysis-views.ts` — already declares `verdict` + `fct_reliance` (no schema change)

**2-hop:**
- `_is_loael_driving` at view_dataframes.py:132-142 does NOT read verdict (reads `finding_class`/`severity`) → NOAEL **dose level** is structurally byte-parity
- NOAEL **confidence score** (`noael_confidence`, penalty_large_effect_non_sig) MAY shift because its `is_large_effect` gate flipped from `|g|>=1.0` to verdict-driven (AC-F4-2 "NOAEL byte-parity" is ambiguous — see Blocking)
- `study_signal_summary.json`, `adverse_effect_summary.json` payloads carry verdict/fct_reliance through derive-summaries
- `test_bfield_contracts.py` (BFIELD-181..185) asserts on verdict membership + fct_reliance presence — unchanged assertions, but assertion domain now covers LB findings that previously exited the `r.get("verdict") is None` skip path at line 887, 903, 917, 927

---

## Implications Table

| Subsystem | Classification | Detail | Evidence (file:line) |
|---|---|---|---|
| **S03 Severity classification (`classify_severity`)** | SAFE | `classify_severity` at classification.py:332-406 is pure |g|-ladder logic, no read of verdict/coverage/fct_reliance/fallback_used. Phase B additive design comment at classification.py:344-350 confirms literals 0.5/0.8/1.0 stay wired. AC-F4-1 byte-parity is structural. | classification.py:332-406 |
| **S07 Confidence D6 (FCT-derived native-scale equivocal zone)** | PROPAGATES | D6 reads `fct_reliance.bands_used.concern_floor`/`adverse_floor`. For LB findings today `bands_used=None` → falls through to legacy SD proxy. Post-append, LB findings with populated bands take the FCT path: D6 score shifts from legacy-SD-derived value to FCT-band-derived value. NOT a break — designed consumer of FCT. Confidence grade output will differ for Tier-2 LB endpoints. | confidence.py:255-338, especially 289-304 |
| **S07 Confidence D4 (frontend clinical-boost)** | PROPAGATES | `endpoint-confidence.ts:deriveStatisticalConfidence` reads `ep.fctReliance.bands_used` + `ep.verdict`. Today LB has `coverage="none"`, falls through to legacy `|g|` path (lines 754-757). Post-append, LB takes FCT path (lines 738-752). Confidence level (`low`/`moderate`/`high`) may shift for LB findings. Designed behavior. | endpoint-confidence.ts:725-758 |
| **S10 Signal scoring R10/R11 (rule emission)** | PROPAGATES | R10 fires when `verdict in ("adverse","strong_adverse") and coverage != "none"` (scores_and_rules.py:252-266). Today LB verdict is legacy-|g|-derived with `coverage="none"`, so falls through to `abs(es) >= 1.0` fallback. Post-append, LB takes the FCT path: R10 fires on 3× fold (adverse_floor=3.0), not on |g|=1.0. Rule-emission set will shift. | scores_and_rules.py:235-286 |
| **NOAEL cascade — dose level (`_is_loael_driving`)** | SAFE | `_is_loael_driving` reads `finding_class` or `severity` only. Neither changes under this cycle (classify_severity unchanged, finding_class unchanged). AC-F4-2 byte-parity on NOAEL dose level is structural. | view_dataframes.py:132-142 |
| **NOAEL cascade — confidence score (`_compute_noael_confidence`)** | SCIENCE-FLAG | `penalty_large_effect_non_sig` gate at view_dataframes.py:1198-1208 reads `verdict` primary, legacy `|g|>=1.0` as fallback. Phase A (commit 6ba12966) wired this. Post-F1/F2: an LB finding with |g|=1.1 + native pct_change=50% (1.5× fold → `verdict="variation"`) flips `is_large_effect` from True (|g|>=1.0) to False (verdict not in adverse/strong_adverse). Penalty applies once (`break` in loop), so shifting any single finding can change the per-organ NOAEL confidence by `penalty_large_effect_non_sig` (~0.1-0.2). AC-F4-2 in the synthesis says "per-study per-organ NOAEL byte-parity" — ambiguous whether this includes `noael_confidence` field. NOAEL **dose level** is safe; NOAEL **confidence score** is likely to shift for studies with LB findings in the 1.0-3.0 fold band. | view_dataframes.py:1184-1210 |
| **NOAEL — `n_provisional_excluded` counter** | PROPAGATES | Counter at view_dataframes.py:772-777, 830-840, 1103-1108 tallies findings with `verdict=="provisional"`. Pre-append LB findings exit `compute_fct_payload` with `verdict="provisional"` or legacy-|g|-derived verdict paired with `coverage="none"` (classification.py:196-221 legacy-|g| fallback emits "provisional" only when `abs_d is None`). Post-append LB findings with populated bands emit band-derived verdict, so counter will DECREASE. Display-only field; does not change NOAEL dose level. | view_dataframes.py:772-777, 830-840, 1103-1108 |
| **X7 Override cascade (`settings_hash` fingerprint)** | STALE / KNOWN-GAP | `analysis_settings.py:settings_hash` (line 267-278) canonicalizes AnalysisSettings fields only. `fct_registry.content_fingerprint()` (fct_registry.py:532-542) exists but is NOT composed into `settings_hash`. GAP-SMT-06 + GAP-SDO-10 document this open gap. NOT a new breakage — pre-existing. Impact on this cycle: since the PR commits regen'd `backend/generated/{study}/**` artifacts, the committed outputs reflect the new bands; but any study running through the live cache path (`analysis_cache.py:30-47`) will NOT invalidate on JSON append. User must manually clear `.settings_cache/` or wait for cycle's Phase B rewire. | analysis_settings.py:267-278, fct_registry.py:532-542, TODO.md GAP-SMT-06/SDO-10 |
| **Frontend consumers of `finding.verdict` / `fct_reliance`** | PROPAGATES | `endpoint-confidence.ts`, `derive-summaries.ts`, `types/analysis-views.ts` already declare and consume these fields (shipped Phase A). `FindingsContextPanel.tsx` listed in grep hits but consumes recovery verdict (different field — cohort-engine.ts `RECOVERY_SEVERITY_RANK`), not FCT verdict. Real FCT verdict consumers already have a populated-bands path; they will now exercise it for LB. | endpoint-confidence.ts:735-752, derive-summaries.ts:336-342, types/analysis-views.ts:299-310 |
| **BFIELD contract tests (`test_bfield_contracts.py`)** | SAFE | Tests at test_bfield_contracts.py:869-944 assert verdict ∈ VERDICT_ENUM, fct_reliance presence, coverage/fallback_used/provenance enum membership, `verdict=="provisional"` must NOT pair with `coverage ∈ {"full","partial"}`. All assertions forward-compatible: LB findings moving from `verdict=None/provisional, coverage=none` to `verdict ∈ {variation,concern,adverse,strong_adverse}, coverage ∈ {full,partial}` still satisfies all constraints. | test_bfield_contracts.py:851-944 |
| **Payload consistency tests (`test_payload_consistency.py`)** | SAFE | SPEC_UNITS at line 47 includes `"fold"` — schema already allows fold units. No existing unit-conversion test. Synthesis F5 AC-F5-6 adds a NEW test file (`test_fct_unit_conversion.py`) — does not mutate this test. | test_payload_consistency.py:47 |
| **FCT registry integrity (`fct_registry._validate_entry`)** | SAFE | Enum vocabularies (ALLOWED_PROVENANCE, ALLOWED_UNITS, ALLOWED_COVERAGE, ALLOWED_RELIABILITY, ALLOWED_DIRECTIONS) all already include the values new entries need: `industry_survey`, `best_practice`, `extrapolated`, `stopping_criterion_used_as_proxy` provenance; `fold`, `pct_change` units; `full`, `partial` coverage; `high`, `moderate`, `low` reliability. Schema drift guard (`_validate_schema_enum_parity`) runs at load. | fct_registry.py:45-81, 219-286, 398-446 |
| **OM byte-parity under F5 patch (AC-F5-3)** | SAFE | F5 unit-conversion branch gated on `bands.units == "fold"` (synthesis line 203). OM entries ship `units: "pct_change"` (verdict path at classification.py:252-253 unchanged for pct_change). F5 is structurally a no-op for OM. | classification.py:249-253, synthesis §3 F5 |
| **Related cycle: `study-design-override-surfaces` (GAP-SDO-10)** | PROPAGATES (cross-cycle) | SDO-10 proposes settings_hash extension for Level-0 overrides. If SDO-10 ships with fct_registry content_fingerprint composition included (parent cycle Phase B), the X7 fingerprint gap closes. Coordination: do not duplicate work; flag to SDO cycle that fct_registry content changes the fingerprint input. | TODO.md GAP-SDO-10, fct_registry.py:532-542 |
| **Related cycle: `hcd-mi-ma-s08-wiring` (shipped)** | SAFE | S08 wiring is test-level coupled to `unified_findings.json` (REGISTRY.md lines 815-821). LB finding payload shape unchanged (verdict/coverage fields already present); only their values shift. S08 shipped tests don't assert on LB verdict values. | REGISTRY.md (hcd-mi-ma-s08-wiring) |
| **Related cycle: `brain-concordance-species-bands` (unshipped)** | SAFE | Brain concordance is OM species bands. No overlap with LB/BW registry rows. | REGISTRY.md (brain-concordance-species-bands) |
| **Research gap: NHP extrapolation provenance** | PROPAGATES | All 13 LB chem + 12 LB hem NHP bands ship `provenance: extrapolated, threshold_reliability: low`. M5 honest-uncertainty framing intact; reviewers see extrapolation flagged. RG-FCT-LB-BW-01..03 captures follow-up research needs (synthesis §7). | synthesis §7 |

---

## Blocking Issues (BREAKS + SCIENCE-FLAG only)

### SCIENCE-FLAG: NOAEL confidence score parity

**What changes:** `_compute_noael_confidence` at view_dataframes.py:1198-1208 applies `penalty_large_effect_non_sig` when ANY continuous finding in the sex_findings has (`is_large_effect` AND `p is None or p >= 0.05`). `is_large_effect` primary gate is `verdict ∈ ("adverse","strong_adverse")`, legacy fallback is `|g|>=1.0`.

Pre-append (today's behavior after Phase A): LB findings emit `verdict=None` or legacy-|g|-derived verdict with `coverage="none"` via classification.py:201-221 fallback. The `verdict in ("adverse", "strong_adverse")` check fires only when `abs(es) >= 1.0` mapped to `"adverse"` — i.e., behavior parallels legacy |g|>=1.0.

Post-F1/F2 append: LB findings with populated bands emit FCT-native-scale-derived verdict. An LB finding with |g|=1.1 (legacy: `is_large_effect=True`) and native pct_change=45% (1.45× fold → verdict="variation") now has `is_large_effect=False`. The penalty flip changes `noael_confidence` by `penalty_large_effect_non_sig` (default 0.15 per `ScoringParams`).

**Why it's SCIENCE-FLAG not BREAKS:**
1. The synthesis AC-F4-2 language is "per-study per-organ NOAEL byte-parity" — ambiguous whether this covers `noael_confidence` field (subfield of `noael_by_organ` row) or only `noael_dose_level`.
2. NOAEL **dose level** IS structurally safe (finding_class / severity unchanged) — the primary regulatory output.
3. NOAEL **confidence score** is a display field with documented cascade from verdict (view_dataframes.py:1189-1193 comment explicitly notes F1 rewire). This is the INTENDED downstream effect of populating LB bands; it's part of the Phase B unlock, not a regression.

**What the user must decide:** whether AC-F4-2 byte-parity gate covers `noael_confidence` or only `noael_dose_level` / `loael_dose_level`. If it covers confidence, the gate will trip for any study with LB findings in the 1.0-3.0 fold band (likely all 16 studies). If it covers dose level only, structural byte-parity holds.

**Evidence:** view_dataframes.py:1184-1210; classification.py:196-221; F6 AC-F6-5 comment block at view_dataframes.py:1093-1102 already acknowledges this cascade ("count is surfaced for UI transparency; do not assume the count drives a severity-based exclusion path") but `_compute_noael_confidence` is not in that caveat.

### STALE: X7 fingerprint does not include FCT registry content (pre-existing gap)

**What:** `analysis_settings.settings_hash()` canonicalizes AnalysisSettings fields only. `fct_registry.content_fingerprint()` exists as plumbing (Phase A) but is NOT composed into `settings_hash()`. Studies running through the live cache path after this cycle merges will serve STALE cached results from `.settings_cache/{hash}/` until manually invalidated.

**Not a blocker for this cycle** because the PR commits fresh `backend/generated/{study}/**` artifacts (the regen output becomes the base state, not a cache). But post-merge cache invalidation depends on GAP-SMT-06 Phase B landing.

**Evidence:** analysis_settings.py:267-278; fct_registry.py:532-542; TODO.md GAP-SMT-06, GAP-SDO-10.

---

## Research Conflicts

No active research streams invalidated. The cycle consumes research authored 2026-04-22 (`fct-lb-bw-band-values.md`) and inherits keystone decisions from parent `species-magnitude-thresholds-dog-nhp`. Research gaps RG-FCT-LB-BW-01..07 (synthesis §7) are documentation-only follow-up, not invalidation.

Brain concordance cycle (`brain-concordance-species-bands`) targets OM species calibration, disjoint from LB/BW. No conflict.

HCD MI/MA wiring cycle (shipped) is test-level coupled to unified findings; LB payload shape unchanged (only values shift). No conflict.

SDO cycle (`study-design-override-surfaces`) overlaps at `settings_hash` extension (GAP-SDO-10) — see STALE finding. Coordination note added below.

---

## Stale Manifest Connections

No stale A→B manifest connections detected. All claimed adjacencies verified:

- **FCT Registry → S03 / S07 / S10 / S17 / S16 cascade (manifest line 90):** VERIFIED. classify_severity does NOT consume verdict yet (S03 untouched this cycle), but S07 D6 (confidence.py:289-304), S10 R10/R11 (scores_and_rules.py:252-266), S16 NOAEL confidence (view_dataframes.py:1198-1208) DO consume verdict. Manifest entry for "FCT Registry" override cascade (line 90: "FCT edit invalidates `fct_registry._DATA` and triggers downstream cache rebuild") — verified structurally; `fct_registry.invalidate()` exists (line 507-523) but the downstream cache register step (`register_invalidation_hook`) has no active registrations in the codebase.
- **Override X7 invariant (manifest Invariant X7):** "Override cascade must re-derive" — pre-existing gap GAP-SMT-06 noted. Not stale; the manifest correctly describes the desired state; code lags.

---

## Persistence Actions

### Added to REGISTRY.md

Under the `species-magnitude-thresholds-dog-nhp` stream entry (parent cycle), I'll add a note that Phase B unblock gate = this cycle's sign-off and that the probe verified:
- classify_severity byte-parity is structural (not test-guarded)
- NOAEL dose-level byte-parity is structural
- NOAEL confidence-score shift is SCIENCE-FLAG requiring user decision on AC-F4-2 gate scope

### Added to TODO.md

- Note on GAP-SMT-06 — X7 override cascade fingerprint extension: promote priority from the parent cycle's Phase B to include fct_registry `content_fingerprint()` composition into `settings_hash()`. Without this, post-merge users on the live cache path serve stale severity classifications until cache clear. Flagged as STALE / known-gap, not this-cycle-blocker.
- Link between GAP-SDO-10 (Level-0 override settings_hash extension) and GAP-SMT-06 — the two should be resolved coherently. Flagged as coordination risk.

Persistence is a report-level note (this probe's `Persistence Actions` section). Per skill instruction "Persist non-SAFE findings before reporting," the SCIENCE-FLAG and STALE findings are documented here; the orchestrator will route sign-off-gate implications to the blueprint-cycle's decisions.log.

---

## Verdict

**SCIENCE-FLAG** — one non-blocking SCIENCE-FLAG requires user decision on AC-F4-2 byte-parity gate scope (NOAEL confidence vs NOAEL dose level). All other traces resolve to SAFE or PROPAGATES (designed downstream effects — R10/R11 rule emission shift, D6/D4 confidence shift, frontend endpoint-confidence shift, n_provisional_excluded counter shift). One pre-existing STALE gap (fct_registry fingerprint not composed into settings_hash — GAP-SMT-06) flagged but does not block this cycle because the PR commits regen'd artifacts as the base state.

**Classification counts:**
- SAFE: 8 (classify_severity, _is_loael_driving dose level, OM byte-parity under F5, BFIELD tests, test_payload_consistency, FCT registry integrity, hcd-mi-ma cycle compat, brain-concordance cycle compat)
- PROPAGATES: 7 (S07 D6, S07 D4 frontend, S10 R10/R11, n_provisional_excluded counter, frontend verdict/fct_reliance consumers, research/documentation gaps, SDO cross-cycle coordination)
- SCIENCE-FLAG: 1 (NOAEL confidence score under verdict rewire)
- STALE: 1 (settings_hash fingerprint — GAP-SMT-06, pre-existing)
- BREAKS: 0

**Recommended next step:** User confirms AC-F4-2 scope interpretation. If "NOAEL byte-parity" covers only dose level (most natural read, given the synthesis explicitly separates `noael_confidence` as a penalty cascade), proceed. If it covers the full `noael_by_organ` row including `noael_confidence`, the synthesis must carve out `noael_confidence` as an acceptable-shift field (with the diff doc `fct-migration-diff-lb-bw.md` enumerating the per-study confidence-score deltas and the scientist signing off).
