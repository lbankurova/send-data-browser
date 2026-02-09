# Technical Debt & Open Issues

> **Source:** Extracted from `docs/systems/*.md` during consolidation audit (2026-02-08).
> **Purpose:** Shared backlog. Either contributor can pick up items and push fixes or incoming specs.
> **Process:** Pick an item → implement or write a spec in `docs/incoming/` → mark done here → update the relevant `docs/systems/*.md`.
> **Recommendations added:** 2026-02-08. Domain-informed suggestions for each item. These are advisory — human decides.

---

## Summary

| Category | Open | Resolved | Description |
|----------|------|----------|-------------|
| Bug | 1 | 4 | Incorrect behavior that should be fixed |
| Hardcoded | 7 | 1 | Values that should be configurable or derived |
| Spec divergence | 2 | 9 | Code differs from spec — decide which is right |
| Missing feature | 4 | 4 | Spec'd but not implemented |
| Gap | 8 | 4 | Missing capability, no spec exists |
| Stub | 0 | 1 | Partial implementation |
| **Total** | **22** | **23** | |

## Remaining Open Items

**Defer to production/Datagrok:**
- HC-01, HC-02: Dynamic dose group mapping (essential for multi-study)
- HC-03 → HC-07: Single-study, auth, database (infrastructure chain)
- MF-03: Validation rules SEND-VAL-016, SEND-VAL-018
- MF-04: CDISC Library integration
- MF-05: Write-back (design as correction overlay, not XPT modification)
- MF-06: Recovery arm analysis (separate analysis mode, Phase 2)
- MF-08: Authentication
- GAP-01, GAP-02: URL state persistence (Datagrok handles differently)
- GAP-04, GAP-05: Concurrency + audit trail (production database)
- GAP-07: SENDIG metadata verification (needs CDISC Library)
- GAP-08: Incremental recomputation (performance, not needed for prototype)
- GAP-09: SPECIMEN CT check (needs CDISC Library)
- BUG-05, SD-10: TypeScript cleanup (nice-to-have)
- SD-08: FW domain asymmetry (on-demand pipeline missing FW)

---

## Bugs

### BUG-01: PathologyReview field naming mismatch
- **System:** `systems/annotations.md`
- **Files:** `backend/routers/annotations.py`, `frontend/src/types/annotations.ts`
- **Issue:** Backend injects `reviewedBy`/`reviewedDate` but TypeScript type expects `pathologist`/`reviewDate`. The form sends TypeScript field names; backend overwrites with its own. Creates ambiguous data.
- **Fix:** Align field names in one direction (rename backend or frontend).
- **Recommendation:** Align to frontend names (`pathologist`/`reviewDate`). In SEND toxicology, pathology peer review is a formal GLP process — "pathologist" is the standard term for the reviewer role and is more semantically clear than the generic "reviewedBy." Quick fix.
- **Status:** RESOLVED — Backend now uses `pathologist`/`reviewDate` field names, aligned with frontend TypeScript types.

### BUG-02: code-mapping evidence type never produced
- **System:** `systems/validation-engine.md`
- **Files:** `frontend/src/types/analysis-views.ts`, `backend/validation/checks/*.py`
- **Issue:** `code-mapping` is defined in the TypeScript `RecordEvidence` discriminated union but no backend check handler ever produces it. Dead code or missing implementation.
- **Fix:** Either implement a check that produces it, or remove from the union type.
- **Recommendation:** Keep the type and implement. Code mapping is a real SEND concern — when a study uses a non-standard but recognizable term (e.g., "MALE" instead of "M" for SEX, or "Sprague Dawley" instead of "SPRAGUE-DAWLEY"), the validation engine should produce `code-mapping` evidence with the suggested CDISC CT term. The CT check handler should emit this type when there's a close match to a standard term rather than a blanket "unknown value" error.
- **Status:** RESOLVED — `_classify_match()` in `controlled_terminology.py` now distinguishes case/whitespace-only mismatches (emits `code-mapping`) from real value errors (`value-correction`).

### BUG-03: Fix script registry get_script() logic error
- **System:** `systems/validation-engine.md`
- **Files:** `backend/validation/scripts/registry.py`
- **Issue:** `get_script()` returns the first script if it matches, otherwise `None` for all (early return in loop body). Not currently called by the router, so no runtime impact yet.
- **Fix:** Fix the loop logic before this function gets wired up.
- **Recommendation:** Quick fix. Trivial bug — fix the loop before wiring up the function.
- **Status:** RESOLVED — `get_script()` loop logic is correct (return inside `if` block, `None` after loop).

### BUG-04: ANOVA/Dunnett functions defined but unused
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/generator/domain_stats.py`
- **Issue:** `_anova_p()` and `_dunnett_p()` are defined but the enrichment loop approximates `anova_p` from `min_p_adj` and `jt_p` from `trend_p` instead. The approximation loses information — raw per-subject values are not retained.
- **Fix:** Retain raw values through the pipeline and compute properly, or document the approximation as intentional and remove the dead functions.
- **Recommendation:** Fix properly. This is statistically incorrect. `min_p_adj` (minimum Dunnett's pairwise p-value) is NOT equivalent to the ANOVA F-test p-value. ANOVA asks "is there ANY treatment effect across all groups?" while Dunnett's asks "which specific groups differ from control?" A study can have significant ANOVA but no significant pairwise comparison (diffuse small effects), or vice versa. For regulatory submissions (ICH S3A), ANOVA is the gatekeeper test — Dunnett's is only interpreted when ANOVA is significant. Retain per-subject raw values through the pipeline and compute both properly.
- **Status:** RESOLVED — All continuous domain findings modules (LB, BW, OM, FW) now pass `raw_values` through the pipeline. Enrichment loop computes ANOVA, Dunnett's, and JT from raw per-subject data via `_anova_p()`, `_dunnett_p()`, `_jonckheere_terpstra_p()`.

### BUG-05: ViewSelectionContext uses Record<string, any>
- **System:** `systems/navigation-and-layout.md`
- **Files:** `frontend/src/contexts/ViewSelectionContext.tsx`
- **Issue:** Selection state typed as `Record<string, any>` with a runtime `_view` tag. No compile-time enforcement of selection shape per view.
- **Fix:** Define discriminated union type per view (DoseResponseSelection | TargetOrgansSelection | ...).
- **Recommendation:** Quick win. Define proper discriminated union types. Prevents runtime errors and makes the code self-documenting. Not domain-specific, just good engineering.
- **Status:** Open

---

## Hardcoded Values

### HC-01: Dose group mapping
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/services/analysis/dose_groups.py:10`
- **Issue:** `ARMCD_TO_DOSE_LEVEL = {"1": 0, "2": 1, "3": 2, "4": 3}`. Only works for PointCross.
- **Fix:** Derive dynamically from TX/DM domains.
- **Recommendation:** Essential for multi-study support. In SEND, ARMCD values are sponsor-defined and vary wildly ("C"/"L"/"M"/"H", "CTRL"/"LOW"/"MID"/"HIGH", numeric, etc.). Read TX domain to get SETCD → dose mapping, match against DM.ARMCD for subject assignments, and use EX (Exposure) domain for actual mg/kg dose values. Some studies have satellite groups, TK groups — the mapping must handle these gracefully (exclude or flag).
- **Status:** Open

### HC-02: Recovery arm codes
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/services/analysis/dose_groups.py:13`
- **Issue:** `RECOVERY_ARMCDS = {"1R", "2R", "3R", "4R"}` hardcoded.
- **Fix:** Derive from study data or make configurable.
- **Recommendation:** Derive from TX domain. Recovery arms are identified by TXPARMCD = "RECOVDUR" (recovery duration parameter) in the Trial Sets domain, not by naming convention. "1R"/"2R" is common but not guaranteed — some studies use "REC1"/"REC2", "R1"/"R2", or explicit naming. Don't rely on string patterns.
- **Status:** Open

### HC-03: Single-study restriction
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/config.py:15`
- **Issue:** `ALLOWED_STUDIES = {"PointCross"}` restricts entire app.
- **Fix:** Remove filter. Depends on multi-study infrastructure.
- **Recommendation:** Remove when ready. Acceptable for prototype. Blocks HC-07.
- **Status:** Open (blocked on multi-study support)

### HC-04: File-based annotation storage
- **System:** `systems/annotations.md`
- **Files:** `backend/routers/annotations.py`
- **Issue:** JSON files on disk, no transactions, no backup, no concurrency.
- **Fix:** Replace with database. API contract is storage-agnostic — zero frontend changes.
- **Recommendation:** Defer to production. Acceptable for single-user prototype. The API contract was designed to be storage-agnostic — swapping the backend is a clean operation.
- **Status:** Open (blocked on database infrastructure)

### HC-05: Hardcoded reviewer identity
- **System:** `systems/annotations.md`
- **Files:** `backend/routers/annotations.py:56`
- **Issue:** `reviewedBy` always set to `"User"`.
- **Fix:** Derive from auth context. Blocked on auth implementation.
- **Recommendation:** Defer to production. In GLP studies, reviewer identity is legally required for pathology peer review. The pathologist's name must be recorded accurately for regulatory inspection. Not needed for prototype but P1 for production.
- **Status:** Open (blocked on auth)

### HC-06: No authentication
- **System:** `systems/annotations.md`
- **Files:** `backend/main.py:32-37`
- **Issue:** CORS `allow_origins=["*"]`, no auth middleware.
- **Fix:** Add Datagrok auth integration.
- **Recommendation:** Defer to production. Datagrok provides SSO integration — use that rather than building custom auth.
- **Status:** Open (infrastructure dependency)

### HC-07: Non-PointCross demo guard
- **System:** `systems/navigation-and-layout.md`
- **Files:** `frontend/src/components/panels/ContextPanel.tsx:436`
- **Issue:** Shows "demo entry" message for any non-PointCross study.
- **Fix:** Remove guard when multi-study support lands.
- **Recommendation:** Remove when HC-03 is resolved. Trivial change.
- **Status:** Open (blocked on HC-03)

### HC-08: Domain-specific rounding inconsistency
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/services/analysis/findings_lb.py`, `findings_bw.py`, `findings_om.py`
- **Issue:** LB/OM round mean/sd to 4 decimals; BW/FW round to 2 decimals. No documented rationale.
- **Fix:** Decide on consistent policy or document the domain-specific rationale.
- **Recommendation:** Keep domain-specific rounding — it is scientifically correct. Body weights (BW) and food/water (FW) are measured to the nearest gram (whole number or 1 decimal), so 2 decimal places for summary stats is appropriate precision. Laboratory results (LB) and organ measurements (OM) use analytical instruments with higher precision (4+ significant figures). Rounding should reflect source data measurement precision. Just document the rationale in a code comment.
- **Status:** RESOLVED — Rationale documented in `docs/systems/data-pipeline.md` Bonferroni section and per-domain findings sections.

---

## Spec Divergences

> Code and spec disagree. Neither is presumed correct. A human must decide which to align to, then update the other.

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

### SD-08: FW domain asymmetry
- **System:** `systems/data-pipeline.md`
- **Issue:** FW (Food/Water) only in generator pipeline, not in on-demand adverse effects pipeline.
- **Decision needed:** Should FW be added to on-demand pipeline, or is the asymmetry intentional?
- **Domain context:** Add FW to the on-demand pipeline, but low priority. Decreased food consumption correlates with body weight effects and can indicate palatability issues or systemic toxicity. FW findings alone rarely drive adversity determinations, but they provide valuable context. A toxicologist reviewing adverse effects for a body weight finding would want to see concurrent food consumption data. The absence makes the adverse effects view incomplete.

### SD-09: ANOVA/Dunnett approximation
- **Status:** RESOLVED — See BUG-04. Raw per-subject values now retained and proper statistics computed.

### SD-10: SelectionContext duplication
- **System:** `systems/navigation-and-layout.md`
- **Issue:** `SelectionContext` tracks landing page study selection but is unused once inside a study route (route params take over).
- **Decision needed:** Should the redundant context be removed, or kept for future use?
- **Domain context:** Not domain-specific. Remove the redundancy — route params are the right approach. Keeping dead state creates confusion.

### SD-11: Bonferroni scope
- **Status:** RESOLVED — Rationale documented in data-pipeline.md. Current behavior (Bonferroni for continuous, not incidence) is statistically correct per FDA/EMA guidance.

---

## Missing Features

### MF-01: NOAEL confidence score
- **Status:** RESOLVED — `_compute_noael_confidence()` in `view_dataframes.py` computes confidence per sex using the spec formula. Penalties: single endpoint (0.2), sex inconsistency (0.2), large effect non-significant (0.2). Pathology disagreement reserved (0.0 — needs annotation data). Frontend displays in NOAEL Decision banner (green/yellow/red). `signals-panel-engine.ts` emits `noael.low.confidence` (priority 930) when < 0.6.

### MF-02: Mortality signal (DS domain)
- **Status:** RESOLVED — `findings_ds.py` reads DS domain, detects deaths via `DEATH_TERMS` set matching on `DSDECOD`. Produces incidence findings (Fisher's exact + Cochran-Armitage). R17 rule in `scores_and_rules.py` emits "critical" study-scope mortality signal. Integrated into generator pipeline via `domain_stats.py`.

### MF-03: Validation rules SEND-VAL-016, SEND-VAL-018
- **System:** `systems/validation-engine.md`
- **Issue:** Visit day alignment (016) and domain-specific findings checks (018) not defined in YAML.
- **Status:** Not implemented.
- **Recommendation:** Implement 016 — straightforward and valuable. SEND requires that --DY (study day) = --DTC minus RFSTDTC + 1. Misalignment is a common data quality issue (timezone errors, off-by-one, missing RFSTDTC). Simple date arithmetic check. For 018, define specific sub-checks rather than one vague rule: MI findings should have a corresponding MA finding for the same organ, severity grades should be in range 0-5, incidence findings need MIRESCAT populated, etc. Scope 018 before implementing.

### MF-04: CDISC Library integration
- **System:** `systems/validation-engine.md`
- **Issue:** CT metadata compiled from public docs, not from official CDISC Library API.
- **Status:** Needs API access and data refresh.
- **Recommendation:** Defer to production. The embedded YAML metadata is sufficient for the prototype. When CDISC Library access is available, regenerate the metadata YAML files from the official API. The engine structure doesn't change — only the data files. This is a data task, not an engineering task.

### MF-05: Write-back capability for fix scripts
- **System:** `systems/validation-engine.md`
- **Issue:** Fix scripts only annotate; production needs actual data modification.
- **Status:** Not implemented (annotation-only by design for prototype).
- **Recommendation:** Keep annotation-only for prototype. In production, corrections should write to a correction overlay, NOT modify original XPT files. The original data must always be preservable for regulatory inspection — GLP requires an unbroken audit trail from raw data to final report. Design the write-back as a separate corrections layer with before/after snapshots and reviewer sign-off.

### MF-06: Recovery arm analysis
- **System:** `systems/data-pipeline.md`
- **Issue:** Recovery subjects excluded from all computations. No separate recovery arm analysis.
- **Status:** Not implemented.
- **Recommendation:** Implement but as a separate analysis mode — defer to Phase 2. Recovery analysis is methodologically different: you compare recovery groups to their corresponding treatment groups (not to control), and you look for REVERSAL of effects rather than EMERGENCE. The statistical comparisons are different (paired recovery-vs-treatment, not treatment-vs-control). Key question: did the effect observed at the end of treatment resolve during the recovery period? This is significant scope and needs its own view or view mode. Important for chronic and carcinogenicity studies.

### MF-07: ValidationRecordReview form incomplete
- **Status:** RESOLVED — `ValidationRecordForm.tsx` now exposes all 5 fields: `fixStatus` (dropdown), `reviewStatus` (dropdown), `justification` (textarea), `assignedTo` (text), `comment` (text). All persisted via annotation API.

### MF-08: No authentication system
- **System:** `systems/annotations.md`
- **Issue:** No auth anywhere. Required for production.
- **Status:** Infrastructure dependency.
- **Recommendation:** Defer to production. Use Datagrok's SSO integration.

---

## Gaps

### GAP-01: No URL persistence of filter state
- **System:** `systems/navigation-and-layout.md`
- **Issue:** Navigating to a view always starts with default filters.
- **Recommendation:** Skip for prototype. In Datagrok, this is handled by project save/restore, not URL params. Not worth building in the React prototype.

### GAP-02: No deep linking
- **System:** `systems/navigation-and-layout.md`
- **Issue:** Cannot share a URL that pre-selects a specific endpoint or organ.
- **Recommendation:** Skip for prototype. Same rationale as GAP-01. Datagrok's project sharing handles this differently.

### GAP-03: Cross-view links don't carry filter context
- **Status:** RESOLVED — Cross-view navigation now carries `location.state` with `organ_system` and/or `endpoint_label`. Receiving views (DoseResponse, TargetOrgans, Histopathology, NOAEL) apply state in `useEffect` on mount, then clear via `replaceState`. Context panel links in StudySummaryContextPanel pass relevant context.

### GAP-04: No concurrency control on annotations
- **System:** `systems/annotations.md`
- **Issue:** Simultaneous writes produce last-write-wins. No optimistic locking.
- **Recommendation:** Skip for prototype. Single-user demo doesn't need it. In production, pathologist and study director may annotate simultaneously — add optimistic locking (ETags or version counters) on the database layer.

### GAP-05: No audit trail for annotations
- **System:** `systems/annotations.md`
- **Issue:** Only most recent reviewer/date stored. Previous values overwritten.
- **Recommendation:** Skip for prototype. P1 for production — GLP requires that every change to a study assessment is traceable. The FDA can request a complete history of who changed what and when. In production, store annotation history (append-only log or versioned records), not just current state.

### GAP-06: STRAIN per-species validation not wired
- **Status:** RESOLVED — CT check handler now reads SPECIES from DM domain and builds valid_terms from species-specific `per_species` sublists in YAML. Skips check gracefully when no species match and codelist is extensible.

### GAP-07: SENDIG metadata not verified
- **System:** `systems/validation-engine.md`
- **Issue:** Variable core designations need line-by-line verification against published standard.
- **Recommendation:** Defer until CDISC Library integration (MF-04). The current metadata is compiled from public SENDIG 3.1 documentation and is approximately correct. Official verification requires the published standard document or CDISC Library API access.

### GAP-08: No incremental recomputation
- **System:** `systems/data-pipeline.md`
- **Issue:** Full pipeline reruns every time. No caching or delta computation.
- **Recommendation:** Skip for prototype. The full pipeline runs in ~2 seconds for PointCross — performance is not a concern. In Datagrok production, compute on study import and cache results. Recompute only when source data changes. The generator architecture already supports this pattern.

### GAP-09: SPECIMEN CT check commented out
- **System:** `systems/validation-engine.md`
- **Files:** `backend/validation/checks/controlled_terminology.py`
- **Issue:** Commented out with note about compound TYPE/SITE format needing CDISC Library.
- **Recommendation:** Defer until CDISC Library integration (MF-04). SPECIMEN in SEND uses compound values (e.g., "BLOOD, WHOLE" not just "BLOOD"). Proper validation requires the full CDISC controlled terminology for SPECIMEN, which includes the compound format. Without the official codelist, validation would produce false positives.

### GAP-10: Template resolution error handling
- **Status:** RESOLVED — `_emit()`, `_emit_organ()`, and `_emit_study()` in `scores_and_rules.py` now log `logger.warning("Template error in rule %s: %s", rule["id"], e)` on KeyError/ValueError.

### GAP-11: Hypotheses tab intent icons are placeholder choices
- **Superseded by GAP-12.** Icon choices are a symptom of the deeper design issue below. Resolve GAP-12 first; icon selection follows from the redesigned workflows.

### GAP-12: Hypotheses tab — intents are workflows, not viewer types
- **System:** `views/dose-response.md`
- **Files:** `frontend/src/components/analysis/DoseResponseView.tsx:1333-1339`
- **Issue:** The Hypotheses tab (Dose-Response view) uses five intent icons from lucide-react. Most are poor semantic fits for the underlying analytical concepts. Only Pareto (`ScatterChart`) and Model fit (`GitBranch`) are acceptable. Shape (`TrendingUp`), Correlation (`Link2`), and Outliers (`BoxSelect`) need replacement with icons that better convey their analytical meaning.
- **Current mapping:** Shape → `TrendingUp`, Model fit → `GitBranch`, Pareto → `ScatterChart`, Correlation → `Link2`, Outliers → `BoxSelect`
- **Recommendation:** Replace during Datagrok migration when the full Datagrok icon set is available. If staying on lucide-react, consider: Shape → a dose-response curve icon (custom SVG if needed), Correlation → a scatter/regression icon, Outliers → a box-plot or distribution icon. The icons appear at 14×14 in segmented pill buttons and must be legible at that size.
- **Status:** Open

### GAP-12: Hypotheses tab — intents are workflows, not viewer types
- **System:** `views/dose-response.md`
- **Files:** `frontend/src/components/analysis/DoseResponseView.tsx` (Hypotheses tab section)
- **Issue:** The current Hypotheses tab maps each intent 1:1 to a single viewer placeholder (e.g., Shape → line chart, Pareto → scatter plot). This is wrong on two levels:
  1. **Viewer type mismatch.** "Shape" should be an interactive curve viewer (with zoom/pan/overlay), not a static line chart. "Pareto" is intended as Pareto front analysis (multi-objective trade-off between effect size and statistical significance), not just "show me a scatter plot." "Outliers" implies box plots + jitter + IQR thresholds, not just a chart.
  2. **Intents are analytical workflows, not viewer selections.** Each intent represents a multi-step analytical process (select parameters → configure analysis → view results → iterate) that happens to produce one or more visualizations. The current design treats them as viewer launchers from a menu. The controls, layout, and output for each workflow need to be designed from the user's analytical goal backward, not from a viewer type forward.
- **What needs to happen:**
  1. Revisit each intent against the toxicologist's actual analytical goals (what question are they answering? what decisions does the output inform?).
  2. For each intent, define the workflow steps, required user inputs, and expected outputs.
  3. Design controls and view layouts from scratch based on the workflows — not by picking a Datagrok viewer and wrapping it.
  4. Icon and label choices (GAP-11) follow naturally from the redesigned workflows.
- **Recommendation:** Treat as a design task, not a code task. Produce an incoming spec (`docs/incoming/hypotheses-tab-redesign.md`) before writing code. The current placeholder implementation is sufficient for the prototype — this is a production design concern.
- **Status:** Open

---

## Stubs

### STUB-01: Findings domain prefix check
- **Status:** RESOLVED — `variable_format.py` now validates findings domain variable prefixes. Uses `_get_domain_variables()` to check against SENDIG metadata and only flags variables that are both non-prefixed and not standard SENDIG variables.
