# TODO — Archived (Resolved Items)

> **Purpose:** Resolved backlog items moved from `docs/TODO.md` to reduce always-loaded context. Kept for audit trail.
> **Extracted:** 2026-02-09

---

## Bugs (5 resolved)

### BUG-01: PathologyReview field naming mismatch
- **System:** `systems/annotations.md`
- **Files:** `backend/routers/annotations.py`, `frontend/src/types/annotations.ts`
- **Issue:** Backend injects `reviewedBy`/`reviewedDate` but TypeScript type expects `pathologist`/`reviewDate`. The form sends TypeScript field names; backend overwrites with its own. Creates ambiguous data.
- **Status:** RESOLVED — Backend now uses `pathologist`/`reviewDate` field names, aligned with frontend TypeScript types.

### BUG-02: code-mapping evidence type never produced
- **System:** `systems/validation-engine.md`
- **Files:** `frontend/src/types/analysis-views.ts`, `backend/validation/checks/*.py`
- **Issue:** `code-mapping` is defined in the TypeScript `RecordEvidence` discriminated union but no backend check handler ever produces it. Dead code or missing implementation.
- **Status:** RESOLVED — `_classify_match()` in `controlled_terminology.py` now distinguishes case/whitespace-only mismatches (emits `code-mapping`) from real value errors (`value-correction`).

### BUG-03: Fix script registry get_script() logic error
- **System:** `systems/validation-engine.md`
- **Files:** `backend/validation/scripts/registry.py`
- **Issue:** `get_script()` returns the first script if it matches, otherwise `None` for all (early return in loop body). Not currently called by the router, so no runtime impact yet.
- **Status:** RESOLVED — `get_script()` loop logic is correct (return inside `if` block, `None` after loop).

### BUG-04: ANOVA/Dunnett functions defined but unused
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/generator/domain_stats.py`
- **Issue:** `_anova_p()` and `_dunnett_p()` are defined but the enrichment loop approximates `anova_p` from `min_p_adj` and `jt_p` from `trend_p` instead. The approximation loses information — raw per-subject values are not retained.
- **Status:** RESOLVED — All continuous domain findings modules (LB, BW, OM, FW) now pass `raw_values` through the pipeline. Enrichment loop computes ANOVA, Dunnett's, and JT from raw per-subject data via `_anova_p()`, `_dunnett_p()`, `_jonckheere_terpstra_p()`.

### BUG-05: ViewSelectionContext uses Record<string, any>
- **System:** `systems/navigation-and-layout.md`
- **Files:** `frontend/src/contexts/ViewSelectionContext.tsx`
- **Issue:** Selection state typed as `Record<string, any>` with a runtime `_view` tag. No compile-time enforcement of selection shape per view.
- **Status:** RESOLVED — `ViewSelection` discriminated union type defined with 6 per-view interfaces. All consumers updated. Navigation-and-layout system spec updated.

---

## Hardcoded Values (1 resolved)

### HC-08: Domain-specific rounding inconsistency
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/services/analysis/findings_lb.py`, `findings_bw.py`, `findings_om.py`
- **Issue:** LB/OM round mean/sd to 4 decimals; BW/FW round to 2 decimals. No documented rationale.
- **Status:** RESOLVED — Rationale documented in `docs/systems/data-pipeline.md` Bonferroni section and per-domain findings sections.

---

## Spec Divergences (9 resolved)

### SD-01: Signal score weights
- **Status:** RESOLVED — Spec updated to accept code weights (0.35/0.20/0.25/0.20). Rationale documented in insights-engine.md.

### SD-02: Convergence multiplier formula
- **Status:** RESOLVED — Spec updated to accept continuous `1 + 0.2 * (n_domains - 1)`. Rationale documented in insights-engine.md.

### SD-03: Template registry not implemented
- **Status:** RESOLVED — Spec updated. Direct string construction accepted at current rule count (17 rules).

### SD-04: Banner cap not implemented
- **Status:** RESOLVED — Banner cap dropped from spec. All statements shown without cap.

### SD-05: Endpoint-scope rules not in Signals Panel
- **Status:** RESOLVED — Spec updated. Signals Panel / InsightsList separation accepted as correct architecture.

### SD-06: Convergence detail rendering
- **Status:** RESOLVED — Spec updated. Domain chips on organ cards accepted over inline text merge.

### SD-07: Endpoint-to-banner promotion
- **Status:** RESOLVED — Spec updated. Inline promotion in `deriveSynthesisPromotions()` accepted.

### SD-09: ANOVA/Dunnett approximation
- **Status:** RESOLVED — See BUG-04. Raw per-subject values now retained and proper statistics computed.

### SD-11: Bonferroni scope
- **Status:** RESOLVED — Rationale documented in data-pipeline.md. Current behavior (Bonferroni for continuous, not incidence) is statistically correct per FDA/EMA guidance.

---

## Missing Features (4 resolved)

### MF-01: NOAEL confidence score
- **Status:** RESOLVED — `_compute_noael_confidence()` in `view_dataframes.py` computes confidence per sex using the spec formula. Penalties: single endpoint (0.2), sex inconsistency (0.2), large effect non-significant (0.2). Pathology disagreement reserved (0.0 — needs annotation data). Frontend displays in NOAEL Decision banner (green/yellow/red). `signals-panel-engine.ts` emits `noael.low.confidence` (priority 930) when < 0.6.

### MF-02: Mortality signal (DS domain)
- **Status:** RESOLVED — `findings_ds.py` reads DS domain, detects deaths via `DEATH_TERMS` set matching on `DSDECOD`. Produces incidence findings (Fisher's exact + Cochran-Armitage). R17 rule in `scores_and_rules.py` emits "critical" study-scope mortality signal. Integrated into generator pipeline via `domain_stats.py`.

### MF-07: ValidationRecordReview form incomplete
- **Status:** RESOLVED — `ValidationRecordForm.tsx` now exposes all 5 fields: `fixStatus` (dropdown), `reviewStatus` (dropdown), `justification` (textarea), `assignedTo` (text), `comment` (text). All persisted via annotation API.

---

## Gaps (4 resolved)

### GAP-03: Cross-view links don't carry filter context
- **Status:** RESOLVED — Cross-view navigation now carries `location.state` with `organ_system` and/or `endpoint_label`. Receiving views (DoseResponse, TargetOrgans, Histopathology, NOAEL) apply state in `useEffect` on mount, then clear via `replaceState`. Context panel links in StudySummaryContextPanel pass relevant context.

### GAP-06: STRAIN per-species validation not wired
- **Status:** RESOLVED — CT check handler now reads SPECIES from DM domain and builds valid_terms from species-specific `per_species` sublists in YAML. Skips check gracefully when no species match and codelist is extensible.

### GAP-10: Template resolution error handling
- **Status:** RESOLVED — `_emit()`, `_emit_organ()`, and `_emit_study()` in `scores_and_rules.py` now log `logger.warning("Template error in rule %s: %s", rule["id"], e)` on KeyError/ValueError.

---

## Stubs (1 resolved)

### STUB-01: Findings domain prefix check
- **Status:** RESOLVED — `variable_format.py` now validates findings domain variable prefixes. Uses `_get_domain_variables()` to check against SENDIG metadata and only flags variables that are both non-prefixed and not standard SENDIG variables.

---

## UI Redundancy (4 resolved)

### RED-01: InsightsList duplicated in Target Organs center + context panel
- **Status:** RESOLVED — Convergence pane now shows compact tier count summary + "See Hypotheses tab for full insights." pointer. `InsightsList` import removed from context panel.

### RED-02: NOAEL banner data duplicated in context panel no-selection state
- **Status:** RESOLVED — Removed NOAEL summary table and Confidence factors pane. Kept NOAEL narrative (InsightsList). Cleaned up dead code.

### RED-03: Cross-view links in center Overview tabs
- **Status:** RESOLVED (2026-02-09) — Removed cross-view links from center Overview tabs. Context panel is the canonical location for navigation links.

### RED-04: Target Organs context panel Endpoints list duplicates Evidence tab
- **Status:** RESOLVED — Pane renamed "Domain coverage". Shows per-domain endpoint counts with colored domain text + "See Evidence tab for full endpoint list." pointer.

---

## Incoming Features (9 resolved)

### FEAT-01: Temporal Evidence API — DONE
- **Spec:** `docs/incoming/01-temporal-evidence-api.md`
- **Status:** DONE — committed as `daec3e8`

### FEAT-02: Time-Course Tab in Dose-Response — DONE (then consolidated)
- **Spec:** `docs/incoming/02-timecourse-tab.md`
- **Status:** DONE — originally a separate tab, then consolidated into Evidence tab as a collapsible toggle section per `docs/incoming/09-dr-cl-consolidation.md`. Tab bar reduced from 4→3 tabs.

### FEAT-03: Subject-Level Spaghetti Plot — DONE
- **Spec:** `docs/incoming/03-spaghetti-plot.md`
- **Status:** DONE — subject lines render over group means, click triggers subject profile

### FEAT-04: Subject Profile Context Panel — DONE
- **Spec:** `docs/incoming/04-subject-profile-panel.md`
- **Status:** DONE — full cross-domain profile with collapsible panes, auto-expand on notable findings

### FEAT-05: Endpoint Bookmarks — DONE
- **Spec:** `docs/incoming/05-endpoint-bookmarks.md`
- **Status:** DONE — star toggle in rail, filter pill, annotations backend schema type added

### FEAT-06: Subject-Level Histopathology Matrix — DONE
- **Spec:** `docs/incoming/06-subject-level-histopath.md`
- **Status:** DONE — by-subject toggle, per-animal severity cells, dose group separators

### FEAT-07/09: Clinical Observations → D-R Consolidation — DONE
- **Spec:** `docs/incoming/09-dr-cl-consolidation.md` (supersedes `07-clinical-observations-view.md`)
- **Status:** DONE — standalone CL view built (FEAT-07), then consolidated into D-R per spec 09. Build passes (1,261 KB), lint clean.

### FEAT-08: Causal Inference Tool — Bradford Hill Worksheet — DONE
- **Spec:** `docs/incoming/08-causal-inference-tool.md`
- **Status:** DONE — CausalityWorksheet in DoseResponseView: 5 auto-populated + 4 expert Bradford Hill criteria, dot gauge, override mechanism, overall assessment, causal-assessment annotations persistence

### FEAT-09: CL consolidation into Dose-Response — DONE
- Merged with FEAT-07 above.
