# Implementation Context: fct-lb-bw-band-values Blueprint Phase

**Date:** 2026-04-23 | **Phase:** Blueprint Step 0 | **Topic:** fct-lb-bw-band-values
**Parent:** species-magnitude-thresholds-dog-nhp (Phase A shipped 2026-04-23, commit 6ba12966)

## 1. Failed approaches
0 FAILED / REJECT entries relevant to FCT registry / threshold migration in 510 lines of decisions.log. Instructive patterns:

- **cynomolgus-organ-weight-hcd Phase 3 probe:** Tier C null thresholds crashed `_assess_om_two_gate()` — required defensive null-guard. **Implication:** NHP extrapolated bands with numeric values avoid this; pure null-band species need explicit routing.
- **SCIENCE-FLAG-STOP** pattern on study-design-override: provenance/coverage must be explicit per-species — never silently downgrade.
- **BLOCKER pattern** (unrecognized-term-flagging): don't ship registry additions without schema validation at load time (`FctRegistryIntegrityError`). Phase A already enforces bidirectional integrity via AC-F2-1.

## 2. Parent-cycle carry-forward (species-magnitude-thresholds-dog-nhp)

### Phase A shipped (commit 6ba12966, 2026-04-23)
- ✅ F1/F2: FCT registry shell + OM entries (14 keys, species-specific bands, full coverage)
- ✅ `backend/services/analysis/fct_registry.py` loader (ALLOWED_PROVENANCE, ALLOWED_COVERAGE, ALLOWED_UNITS, ALLOWED_RELIABILITY, ALLOWED_DIRECTIONS; `FctRegistryIntegrityError` load-time halt)
- ✅ F3b: `_VERDICT_TO_SEVERITY` compatibility mapping (5→3) via `shared/rules/verdict-severity-mapping.json` — provisional→not_assessed, variation→normal, concern→warning, adverse→adverse, strong_adverse→adverse
- ✅ F11: OM Hy's Law joint_rule (L03 syndrome-rule-ref integrity)
- ✅ Uncertainty-first payload convention: `coverage` + `fallback_used` + `provenance` REQUIRED fields on all classification outputs

### Phase B deferred (valid blockers, not defects)
- F3 `classify_severity()` call-site rewire
- F4 D6/D4 confidence rewire
- F5 R10/R11 signal-scoring rewire
- F6 NOAEL cascade M2-folded (in main pipeline, not parallel)
- F7 X7 override-cascade guard (settings_hash fingerprinting of FCT registry content)
- F9 UI FCT pane + provisional verdict badge
- F10 methodology parallel track (off critical path per M3)

### M1–M5 modifiers user-locked
- M1: no legacy-severity versioning (|g| ladder dies outright on Phase B)
- M2: SF-4 NOAEL in main cascade (not parallel)
- M3: F10 co-authorship parallel — off critical path
- M4: public-dataset fixtures for regression (no toy data)
- M5: honest-coverage / uncertainty-first (NHP extrapolated → provisional, not silent dog-fallback)

### Infrastructure SHIPPED & ready to consume
- `shared/rules/field-consensus-thresholds.json` (14 OM entries, 24 KB, 2026-04-21)
- `shared/schemas/field-consensus-thresholds.schema.json` (202 lines, full surface)
- `shared/rules/verdict-severity-mapping.json` (24 lines, 5→3 contract, 2026-04-22)
- `backend/services/analysis/fct_registry.py` (loader + integrity + get_fct)
- `classification.py` imports fct_registry (line 19) — wiring point present, not yet consumed

### NOT yet shipped (this cycle's scope or downstream)
- `validate-fct-signoff.sh`, `validate-thresholds-json.sh` (pre-commit fixtures for ship gate)
- `approved-toxicology-reviewers.yml` (allowlist for signed-off trailer)
- `test_level_d_registry_contract.py` (SODS registry coordination)
- Frontend `fct-registry.md` doc + provisional badge UI

### Open SCIENCE-FLAGs / GAPs routed to this cycle
- **SF-1..4** (Phase A combined sign-off gate) — this cycle produces the numeric bands the scientist signs off on
- **GAP-SMT-02** (SCIENCE-FLAG, Per-endpoint FCT values before S03 severity migration) — directly resolved by this cycle's §7 JSON
- **GAP-SMT-BP-04..07** (fixture/governance items) — build cycle ships

## 3. Cross-cycle coordination

| Topic | Phase | Coupling | Action |
|-------|-------|----------|--------|
| hcd-mi-ma-s08-wiring | COMPLETED | Established uncertainty-first payload convention; honest test-level coupling rule | Inherit convention; no new work. Verify S08 payload shape mirrored in LB/BW verdict emission (AC). |
| study-design-override-surfaces | Blueprint in progress | X7 override cascade; GAP-SMT-06: settings_hash fingerprints FCT content | Note in architect gate — do not regress. Build-cycle coordinates. |
| brain-concordance-species-bands | VALIDATED, unshipped | BRAIN_WEIGHT entry shape; nhp_tier qualitative coverage | Forward-compatibility note — nonblocking. |
| cv-tier-adaptive-thresholds | COMPLETED (2828e0eb) | P4 Track 2 gLower annotations (136 entries) | Reference as species-threading proof-of-concept. |
| cynomolgus-organ-weight-hcd | COMPLETED | NHP species resolution + Tier C null-guard pattern | Pattern available; classify_severity routes Tier C to ECETOC path. |
| etransafe-send-snomed-integration | COMPLETED | Coverage-as-payload-field template; dispatcher tuple-widening | Reference for coverage propagation serialization. |

**No blocking gates across cycles.** Architectural consistency checks belong to Step 2 architect review.

## 4. Infrastructure state verification (files actually present)

| File | Status | Size | Content |
|------|--------|------|---------|
| `shared/rules/field-consensus-thresholds.json` | ✅ | 24 KB | 14 OM entries, 1 joint_rule (Hy's Law), full coverage for rat/mouse/dog/nhp/other |
| `shared/schemas/field-consensus-thresholds.schema.json` | ✅ | 202 lines | required: species_specific, bands, coverage, provenance; coverage enum: full/partial/none/catalog_driven/n-*/stat-unavailable; provenance enum: 7 levels (regulatory → catalog_rule); reliability enum: high/moderate/low/speculative; units enum: pct_change/fold/absolute/sd |
| `shared/rules/verdict-severity-mapping.json` | ✅ | 652 B | 5→3 mapping, explicit migration-lock comment |
| `backend/services/analysis/fct_registry.py` | ✅ | — | ALLOWED_* constants + integrity error + get_fct loader |
| `backend/services/analysis/classification.py` | ⚠ | 1615 LOC | imports fct_registry (line 19); `_VERDICT_TO_SEVERITY` at lines 39-45; `classify_severity()` at line 332 NOT yet rewired |
| Frontend `fct-*` | ❌ | — | None. Phase B ships UI wiring. |

## 5. Code quality hotspots (domain-critical modules this cycle touches)

| Module | LOC | Budget | Over | Status |
|--------|-----|--------|------|--------|
| classification.py | 1615 | 500 | +1115 | ⚠ monitored — Phase B adds ~50–100 net lines (get_fct calls + null guards) |
| confidence.py | 1210 | 500 | +710 | ⚠ monitored — D6/D4 rewire is confidence.py concern, deferred to Phase B |
| subject_sentinel.py | ~650 | 500 | +150 | monitored — no changes this cycle |
| view_dataframes.py | unknown | 500 | ? | NOAEL cascade per M2 (main pipeline); this cycle ships bands, doesn't rewire |

**Hardcoded thresholds needing Phase B rewire (out of scope for this cycle — just consumed):**
- `classification.py:35` — default g-fallback (|g| ≥ 1.0) for `classify_severity()`
- `confidence.py` — D6/D4 (0.75/1.0 hardcodes)

## 6. Gate checklist for Step 1 Synthesize

- ✅ Schema & loader infrastructure shipped (Phase A)
- ✅ OM registry entries live (14 keys, full coverage, byte-parity preserved by Phase B plan)
- ✅ Uncertainty-first payload convention established + cross-topic proven (S08, eTRANSAFE)
- ✅ Research corpus ready (LB/BW band values documented, 29 KB, §7 fragments concrete)
- ✅ 0 FAILED precedents in decisions.log for this work pattern
- ✅ Cross-topic blockers resolved (S08 shipped, study-design-override proceeding)
- ✅ classification.py P1 rewire is Phase B (out of scope for this cycle)

## 7. Advisories for Step 2 architect review (pre-flag)

1. **Scope boundary — registry content only, NOT call-site rewire.** This cycle appends data to the FCT registry JSON. Call-site rewiring (classify_severity, D6/D4, R10/R11, NOAEL cascade) is Phase B proper — deferred with valid blocker (requires signed-off bands from this cycle). The architect should confirm this boundary and reject any feature that crosses it.
2. **Science-preservation gate is the whole point.** Rule 14 applies — appending bands CHANGES severity / NOAEL for every study once Phase B call-sites wire. The cycle output must produce a validation diff that the scientist signs off on BEFORE Phase B unlocks. M4 (public-dataset fixtures) is non-negotiable.
3. **classification.py LOC is monitored.** This cycle adds 0 LOC to classification.py — build merely appends JSON entries + regenerates corpus + produces diff doc. No new LOC budget pressure.
4. **NHP coverage honesty.** Per M5, NHP extrapolated bands must emit `coverage: partial`, `provenance: extrapolated`, `threshold_reliability: low` → Phase B classifier emits `verdict: provisional`. This is the intended output, not a defect. Test strategy must assert on the provisional-verdict presence, not its absence.
5. **Integration scope is 4 features max:** F-LB-1 append LB chemistry entries (11), F-LB-2 append LB hematology entries (10), F-BW-1 expand BW.BODYWEIGHT.down per-species bands, F-VAL-1 produce validation diff doc + sign-off packet. No new code modules, no schema changes, no UI wiring, no test infrastructure beyond fixture regen.

**Gate:** PROCEED to Blueprint Step 1 Synthesize.
