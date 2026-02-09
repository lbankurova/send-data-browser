# Technical Debt & Open Issues

> **Source:** Extracted from `docs/systems/*.md` during consolidation audit (2026-02-08).
> **Purpose:** Shared backlog across all agent roles. This is the single source of truth for what needs doing.
> **Process:** Pick an item → implement or write a spec in `docs/incoming/` → mark done here → update the relevant `docs/systems/*.md`.
> **Recommendations added:** 2026-02-08. Domain-informed suggestions for each item. These are advisory — human decides.

## Agent Protocol

**Every agent reads this file at session start.** When you finish a task:
1. Check this file for the next open item relevant to your role
2. Suggest it to the user as the next action
3. If you discover new issues during your work, add them here with: category, ID (next in sequence), description, affected files, and suggested owner role

**Role ownership hints:**
- `BUG`, `SD`, `RED` items touching frontend → **frontend-dev** or **ux-designer**
- `BUG`, `HC`, `MF`, `GAP` items touching backend → **backend-dev**
- `GAP-11`, `GAP-12`, `RED` items (design) → **ux-designer**
- `FEAT` items (backend plumbing) → **backend-dev**; (UI components) → **frontend-dev**; (workflow design) → **ux-designer**
- Spec divergences needing doc updates → **docs-agent**
- Code quality (dead code, bundle, duplication) → **review**

---

## Summary

| Category | Open | Resolved | Description |
|----------|------|----------|-------------|
| Bug | 0 | 5 | Incorrect behavior that should be fixed |
| Hardcoded | 7 | 1 | Values that should be configurable or derived |
| Spec divergence | 2 | 9 | Code differs from spec — decide which is right |
| Missing feature | 4 | 4 | Spec'd but not implemented |
| Gap | 8 | 4 | Missing capability, no spec exists |
| Stub | 0 | 1 | Partial implementation |
| UI redundancy | 3 | 1 | Center view / context panel data overlap |
| **Incoming feature** | **1** | **7** | **7 done (FEAT-01–07), 1 remaining (FEAT-08)** |
| **Total** | **31** | **26** | |

## Remaining Open Items

**Incoming features (prototype-scope, ready to build):**
- FEAT-01: Temporal Evidence API — **DONE** (committed `daec3e8`)
- FEAT-02 + FEAT-03: Time-course tab + spaghetti plot — **DONE** (implemented + UX audit)
- FEAT-04: Subject profile context panel — **DONE** (cross-domain profile with BW/LB/CL/MI/MA)
- FEAT-05: Endpoint bookmarks — **DONE** (star toggle, filter pill, annotations backend)
- FEAT-06: Subject-level histopath matrix — **DONE** (by-subject severity toggle)
- FEAT-07: Clinical observations view — **DONE** (two-panel layout, observation rail, bar chart, timeline table, context panel with statistics + dose relationship)
- FEAT-08: Causal inference tool (UX design done — ready for frontend-dev implementation + backend schema type)

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
- SD-10: TypeScript cleanup (nice-to-have)
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
- **Status:** RESOLVED — `ViewSelection` discriminated union type defined with 6 per-view interfaces (`DoseResponseViewSelection`, `TargetOrgansViewSelection`, `HistopathologyViewSelection`, `NoaelViewSelection`, `ClinicalObsViewSelection`, `ValidationViewSelection`). All consumers updated: `ValidationView`, `ValidationViewWrapper`, `ValidationContextPanel`, `ContextPanel` wrapper functions. Removed inline type casts and local `ValidationSelection` interface (now imported from context). Navigation-and-layout system spec updated.

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
- **Files:** `frontend/src/components/panels/ContextPanel.tsx:592`
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

## UI Redundancy

> Center view vs. context panel data overlap identified during redundancy audit (2026-02-09).
> Fix #3 (cross-view links in center Overview tabs) resolved same session.

### RED-01: InsightsList duplicated in Target Organs center + context panel
- **View:** Target Organs
- **Files:** `frontend/src/components/analysis/TargetOrgansView.tsx` (Hypotheses tab → `InsightsList`), `frontend/src/components/analysis/panes/TargetOrgansContextPanel.tsx` (Convergence pane → `InsightsList`)
- **Issue:** Both render `InsightsList` with the identical organ-scoped `ruleResults`. Fully redundant when Hypotheses tab is active.
- **Fix:** Remove `InsightsList` from the context panel's Convergence pane. Replace with a brief organ-level summary (e.g., tier count + 1-line conclusion) that doesn't duplicate the center content.
- **Status:** Open

### RED-02: NOAEL banner data duplicated in context panel no-selection state
- **View:** NOAEL Decision
- **Files:** `frontend/src/components/analysis/NoaelDecisionView.tsx` (NoaelBanner), `frontend/src/components/analysis/panes/NoaelContextPanel.tsx` (NOAEL summary + Confidence factors panes)
- **Issue:** The persistent NoaelBanner shows sex × NOAEL × LOAEL × confidence × adverse-at-LOAEL × domains. The context panel's no-selection state repeats all of this in "NOAEL summary" table + "Confidence factors" pane. Both visible simultaneously.
- **Fix:** Remove "NOAEL summary" and "Confidence factors" from context panel no-selection state. Keep only "NOAEL narrative" (InsightsList of study-scope rules) — that adds interpretive value the banner doesn't. Replace the rest with a prompt: "Select an endpoint to view adversity rationale."
- **Status:** Open

### RED-03: Cross-view links in center Overview tabs (RESOLVED)
- **Views:** Histopathology, NOAEL Decision
- **Issue:** Center Overview tabs had "Related views" link sections duplicating the context panel's Related views pane.
- **Fix:** Removed cross-view links from center Overview tabs. Context panel is the canonical location for navigation links.
- **Status:** RESOLVED (2026-02-09)

### RED-04: Target Organs context panel Endpoints list duplicates Evidence tab
- **View:** Target Organs
- **Files:** `frontend/src/components/analysis/panes/TargetOrgansContextPanel.tsx` (Endpoints pane)
- **Issue:** Context panel lists contributing endpoints (endpoint, domain, count) which is a simplified duplicate of the Evidence tab grid.
- **Fix:** Replace with a domain-count summary (e.g., "LB: 8 endpoints, MI: 3 endpoints") instead of listing individual endpoints.
- **Status:** Open

---

## Incoming Features

> **Source:** Specs in `docs/incoming/` — proposed features with full UI/API specifications.
> **Dependency chain:** FEAT-01 is the data foundation; FEAT-02/03/04/06 build on it. FEAT-05/08 are independent.
> **Role hints:** FEAT-01 → backend-dev. FEAT-02–08 → frontend-dev (with ux-designer review). FEAT-08 also needs ux-designer for workflow design.

### FEAT-01: Temporal Evidence API (spec 01) — DONE
- **Spec:** `docs/incoming/01-temporal-evidence-api.md`
- **Files:** `backend/routers/temporal.py`, `backend/main.py`, `frontend/src/types/timecourse.ts`, `frontend/src/lib/temporal-api.ts`, `frontend/src/hooks/useTimecourse.ts`
- **Scope:** 4 backend endpoints (continuous timecourse, CL timecourse, subject profile, subject histopath matrix) + frontend types/hooks/fetch functions
- **Status:** DONE — committed as `daec3e8`
- **Owner:** backend-dev
- **Blocks:** FEAT-02, FEAT-03, FEAT-04, FEAT-06, FEAT-07

### FEAT-02: Time-Course Tab in Dose-Response (spec 02) — DONE
- **Spec:** `docs/incoming/02-timecourse-tab.md`
- **Files:** `frontend/src/components/analysis/DoseResponseView.tsx`
- **Scope:** New "Time-course" tab in evidence panel — Recharts line chart of group mean ± SD over study days, sex-faceted, with Y-axis toggle (Absolute / % change / % vs control). Significant timepoints marked with red dots.
- **Status:** DONE — implemented + UX design audit (tooltip enrichment, overflow fix, unicode fix)
- **Owner:** frontend-dev + ux-designer (audit)
- **Blocked by:** FEAT-01
- **Blocks:** FEAT-03

### FEAT-03: Subject-Level Spaghetti Plot (spec 03) — DONE
- **Spec:** `docs/incoming/03-spaghetti-plot.md`
- **Files:** `frontend/src/components/analysis/DoseResponseView.tsx`
- **Scope:** "Show subjects" toggle on Time-course tab — overlays individual animal trajectories on group mean chart. Hover shows USUBJID tooltip, click selects subject → triggers subject profile panel.
- **Status:** DONE — subject lines render over group means, click triggers subject profile
- **Owner:** frontend-dev
- **Blocked by:** FEAT-02, FEAT-04

### FEAT-04: Subject Profile Context Panel (spec 04) — DONE
- **Spec:** `docs/incoming/04-subject-profile-panel.md`
- **Files:** `frontend/src/components/analysis/panes/SubjectProfilePanel.tsx` (new), `frontend/src/hooks/useSubjectProfile.ts` (new), `frontend/src/components/panels/ContextPanel.tsx`, `frontend/src/contexts/ViewSelectionContext.tsx`
- **Scope:** New context panel mode showing cross-domain summary for one animal: demographics, BW sparkline, LB values, CL timeline, MI/MA findings. Triggered by subject selection from spaghetti plot or future subject-selection UI.
- **Status:** DONE — full cross-domain profile with collapsible panes, auto-expand on notable findings
- **Owner:** frontend-dev
- **Blocked by:** FEAT-01

### FEAT-05: Endpoint Bookmarks (spec 05) — DONE
- **Spec:** `docs/incoming/05-endpoint-bookmarks.md`
- **Files:** `backend/routers/annotations.py` (add schema type), `frontend/src/components/ui/BookmarkStar.tsx` (new), `frontend/src/hooks/useEndpointBookmarks.ts` (new), `frontend/src/components/analysis/DoseResponseView.tsx` (star + filter integration)
- **Scope:** Lightweight star-toggle bookmarking for endpoints. Visible cross-view. "Bookmarked only" filter toggle in rails. Persists via annotations API.
- **Status:** DONE — star toggle in rail, filter pill, annotations backend schema type added
- **Owner:** frontend-dev + backend-dev
- **Blocked by:** None (independent)

### FEAT-06: Subject-Level Histopathology Matrix (spec 06) — DONE
- **Spec:** `docs/incoming/06-subject-level-histopath.md`
- **Files:** `frontend/src/components/analysis/HistopathologyView.tsx`, `frontend/src/components/analysis/HistopathologyViewWrapper.tsx`, `frontend/src/hooks/useHistopathSubjects.ts` (new)
- **Scope:** "By subject" toggle on severity matrix — replaces dose-group columns with individual animal columns. Cells show per-subject severity grades. Click subject column → subject profile.
- **Status:** DONE — by-subject toggle, per-animal severity cells, dose group separators
- **Owner:** frontend-dev
- **Blocked by:** FEAT-01, FEAT-04

### FEAT-07: Clinical Observations Timecourse View (spec 07)
- **Spec:** `docs/incoming/07-clinical-observations-view.md`
- **Files:** New route + component + tree item + context panel variant
- **Scope:** New analysis view for CL domain. Two-panel layout: observation rail + evidence panel (grouped bar chart by study day, faceted by sex). Context panel shows incidence statistics and dose-relationship assessment.
- **Status:** Not started
- **Owner:** frontend-dev
- **Blocked by:** FEAT-01

### FEAT-08: Causal Inference Tool — Bradford Hill Worksheet (spec 08)
- **Spec:** `docs/incoming/08-causal-inference-tool.md` + full UX spec in `docs/views/dose-response.md` (Intent: Causality section)
- **Files:** `frontend/src/components/analysis/DoseResponseView.tsx` (Hypotheses tab), `backend/routers/annotations.py` (add `causal-assessment` to `VALID_SCHEMA_TYPES`), `docs/systems/annotations.md`
- **Scope:** New "Causality" tool in Hypotheses tab. Structured worksheet with 5 auto-populated Bradford Hill criteria (neutral dot gauge, override mechanism) + 4 expert-input criteria (strength selector + rationale textarea) + overall assessment radio buttons + SAVE. Persists via annotations API as `causal-assessment` schema type.
- **Status:** UX design done. Ready for implementation (frontend-dev + backend-dev for schema type).
- **Owner:** frontend-dev (implementation) + backend-dev (add schema type to whitelist)
- **Blocked by:** None (uses existing rule_results and signal data)
- **Design decisions:** Scale icon, neutral dot gauge, persistence exception for regulatory documentation, auto-populated score overrides with justification. See `docs/views/dose-response.md` Intent: Causality section.

---

## Stubs

### STUB-01: Findings domain prefix check
- **Status:** RESOLVED — `variable_format.py` now validates findings domain variable prefixes. Uses `_get_domain_variables()` to check against SENDIG metadata and only flags variables that are both non-prefixed and not standard SENDIG variables.

---

## DG Platform Knowledge Gaps

> **Source:** Analysis of dg-developer role spec constraints and open questions, plus handoff notes (2026-02-09).
> **Purpose:** Catalog areas where the DG expert must research platform capabilities before final implementation decisions.
> **Suggested owner:** dg-developer (research + documentation)
> **Status legend:** OPEN (needs research), VALIDATED (confirmed via DG instance), DOCUMENTED (research complete, added to porting guide).

These are not bugs or missing features in the prototype — they are gaps in our **knowledge of Datagrok platform capabilities** that affect the porting guide and implementation plan. Each item represents a constraint or capability that must be validated before finalizing viewer selection or interaction patterns.

### DG-01: DG Functions system — server-side Python execution
- **Category:** Backend integration
- **Question:** How do `grok.functions.call()` and server-side script execution work? What are the parameter passing semantics, return types, error handling, and constraints on DataFrame/array return values?
- **Why it matters:** The porting plan assumes heavy statistical analysis (ANOVA, Dunnett's, trend tests) should run server-side via Python scripts, not in the browser. We need to confirm: (a) Can Python scripts return DataFrames or must they return JSON? (b) What's the performance overhead for cross-language calls? (c) How do we handle timeouts for long-running analyses? (d) Can we pass large arrays (10k+ subjects) efficiently?
- **Affected components:** Dose-Response viewer (trend p-values, dose-response curve fitting), Signal scoring engine (multi-stat aggregation), organ evidence aggregation.
- **Status:** OPEN
- **Suggested research:** Check `datagrok-patterns.ts` for Function examples; search Datagrok docs for "grok.functions.call" and "server-side scripts"; test with sample Python script returning DataFrame vs JSON.
- **Owner:** dg-developer

### DG-02: DG Grid `onCellPrepare()` API and `GridCell` properties
- **Category:** Grid rendering
- **Question:** What is the exact signature of `onCellPrepare()`? What properties exist on `GridCell` and `GridCellStyle` (background color, text color, border, font, icons)? What are the performance implications for grids with 10k+ rows or 100+ columns?
- **Why it matters:** The porting plan relies heavily on `onCellPrepare()` callbacks to color-code cells (p-value severity, signal score, domain classification). Prototype uses TailwindCSS + CSS-in-JS; DG Grid requires Canvas rendering. Need to confirm: (a) Can we set arbitrary RGBA colors? (b) Can we render text overlays / badges? (c) What's the pixel cost of complex styling on scroll performance? (d) Are there built-in cell styles (gradient, threshold, categorical) that reduce custom code?
- **Affected components:** Study Summary grid (signal score heatmap), Evidence grids (p-value coloring), Domain browsing tables (all 6 "Configure Grid" components).
- **Status:** OPEN
- **Suggested research:** Read `datagrok-patterns.ts` patterns 5-8 (Grid styling); test `onCellPrepare()` with 1000+ rows and measure frame rate on scroll; check `GridCellStyle` API docs for available properties.
- **Owner:** dg-developer

### DG-03: Custom cell renderers — Canvas rendering vs HTML
- **Category:** Grid rendering
- **Question:** How do `DG.GridCellRenderer` extensions work? What is the exact canvas rendering API (`render(g, x, y, w, h, gridCell, cellStyle)`)? Can we render HTML/DOM elements inside cells, or must everything be canvas-based?
- **Why it matters:** Several components need rich cell content (inline sparklines, domain chips, confidence badges). The prototype uses React + SVG inline; DG likely requires Canvas 2D API. Need to confirm: (a) Canvas rendering constraints (no async, pixel-based coordinates, manual text measurement)? (b) Are there built-in renderers for sparklines, tags, images that we can reuse? (c) Can a custom renderer delegate to HTML rendering, or is canvas the only path? (d) Performance at 100+ cells per row?
- **Affected components:** OrganRailViewer (domain chips, SVG sparklines), Signal heatmap matrix (cell backgrounds + effect size badges), Study Summary grid (convergence domains as mini-chips).
- **Status:** OPEN
- **Suggested research:** Check `datagrok-patterns.ts` patterns 9-10 (custom renderers); read DG GridCellRenderer extension docs; examine built-in renderers (sparklines, tags, molecule structures) to see if HTML or canvas.
- **Owner:** dg-developer

### DG-04: JsViewer HTML vs Canvas rendering capabilities
- **Category:** Custom viewers
- **Question:** Can `JsViewer` subclasses use HTML/DOM elements (e.g., `<div>`, `<svg>`, React-like component model), or must everything be canvas-based? How does the Contents info pane from PowerGrid render complex HTML — is it a special case or a general pattern?
- **Why it matters:** The porting plan includes 6 custom JsViewers (OrganRailViewer, SpecimenRailViewer, EndpointRailViewer, OrganGroupedHeatmapViewer, ClinicalObservationRail, and one more). The prototype renders these as React components with div/SVG. In DG, we need to know: (a) Can JsViewer.root be an HTML element with nested DOM, or only canvas? (b) How does event handling work (click, hover, scroll)? (c) What's the interaction between DG layout system and custom DOM? (d) Are there sizing/scrolling primitives we need to implement?
- **Affected components:** All 6 custom JsViewers (high migration risk).
- **Status:** OPEN
- **Suggested research:** Inspect PowerGrid's Contents info pane (is it a JsViewer subclass?); test JsViewer.root with `document.createElement()` vs canvas; check datagrok-patterns.ts for custom viewer examples.
- **Owner:** dg-developer

### DG-05: DG Filter Panel customization and programmatic filtering
- **Category:** Filter system
- **Question:** How does the `tv.filters()` panel API work? Can we add custom filter types beyond the built-in (Categorical, Numerical, String, DateTime)? How do we programmatically set/clear filters and subscribe to filter changes?
- **Why it matters:** The porting plan includes complex filters: organ system multi-select (rail → filter auto-apply), severity threshold, dose group grouping. Need to confirm: (a) Can we customize the filter UI without rebuilding the entire panel? (b) Can filters be triggered programmatically (e.g., rail click → set organ_system filter)? (c) Does the filter BitSet propagate to all viewers automatically? (d) Can we add transient filters (UI-only, not saved to project)?
- **Affected components:** Signals panel organ filter, Target Organs evidence filter, Dose-Response endpoint filter.
- **Status:** OPEN
- **Suggested research:** Search DG docs for "tv.filters()" and "Filter Panel API"; test programmatic filter setting; check if filter changes trigger DataFrame.onFilterChanged events.
- **Owner:** dg-developer

### DG-06: Layout serialization — `getOptions()` / `setOptions()` contract
- **Category:** State management
- **Question:** What exactly gets serialized when a project is saved? For custom viewers, what must `getOptions()` return and what will `setOptions()` receive? Are there size limits on serialized state? Can we store analysis-specific selections (e.g., "organ_system: 'Hepatic'") in viewer options?
- **Why it matters:** The prototype stores view-specific state in React Context (View Selection Context, Organ Selection Context). In DG, this becomes viewer options. Need to confirm: (a) Can we store structured objects (nested dicts, arrays) or only primitives? (b) Are there size limits that prevent us from storing filtering state for 1000+ endpoints? (c) What happens to custom viewer state if the viewer is uninstalled or upgraded?
- **Affected components:** All analysis views (state persistence across sessions), custom JsViewers.
- **Status:** OPEN
- **Suggested research:** Check DG docs for "project save/restore"; test `getOptions()` / `setOptions()` with complex nested objects; verify state persistence across app reload.
- **Owner:** dg-developer

### DG-07: Sticky Meta and column tags — persistence and API
- **Category:** Annotation infrastructure
- **Question:** What is the `col.setTag()` API? Are tags persistent across sessions and projects? Can we store multi-line text or only simple strings? Are there size limits? Is there server-side storage or local-only?
- **Why it matters:** The production system must migrate annotations from the current file-based storage to Datagrok's infrastructure. Sticky Meta (column-level tags) might handle lightweight metadata (e.g., "endpoint: bookmarked", "NOAEL notes"). Need to confirm: (a) Can tags store the full annotation schema (justification, assignedTo, comment, reviewDate)? (b) If tags are limited to simple strings, can we use Sticky Meta for keys and store JSON values? (c) What's the sync/replication model for multi-user access? (d) Can tags be queried/indexed by the annotation API?
- **Affected components:** Annotations system (migration to production), NOAEL/organ/endpoint metadata storage.
- **Status:** OPEN
- **Suggested research:** Check DG docs for "Sticky Meta" and "col.setTag()"; test tag persistence across project save/reload; verify tag size limits and query capabilities.
- **Owner:** dg-developer

### DG-08: Multi Curve Viewer availability and configuration
- **Category:** Specialized viewers
- **Question:** Is the Multi Curve Viewer (dose-response curve fitting) available in all DG versions? What curve models are supported? Can we customize the plot (overlays, legends, error bars, bootstrap confidence intervals)?
- **Why it matters:** The Dose-Response view currently uses Recharts (React library) for dose-response curves. The DG solution should use the native Multi Curve Viewer if available. Need to confirm: (a) What's the minimum DG version that includes Multi Curve Viewer? (b) Does it support user-provided data (unlike many built-in viewers that rely on pre-computed slopes/R²)? (c) Can we show multiple curves per dose group (e.g., control overlay)? (d) What's the API for adding error bars and significance annotations?
- **Affected components:** Dose-Response view (main chart), endpoint curve explorer.
- **Status:** OPEN
- **Suggested research:** Check datagrok.ai viewer gallery for Multi Curve Viewer docs; test with sample dose-response data; verify model support (linear, logistic, Hill, exponential).
- **Owner:** dg-developer

### DG-09: Event system details — debounce, cleanup, memory leaks
- **Category:** Reactivity
- **Question:** How does DG's RxJS integration work? What is `DG.debounce()` and how does it compare to standard RxJS operators? How do we unsubscribe from events to prevent memory leaks? What's the lifecycle of Observable subscriptions when viewers are removed?
- **Why it matters:** The prototype uses React hooks with dependencies; DG uses Observable subscriptions. Need to confirm: (a) What's the syntax for `df.onSelectionChanged.subscribe()` and when do we `.unsubscribe()`? (b) Does DG provide helper utilities for automatic cleanup? (c) What happens if a viewer updates the DataFrame (circular dependency risk)? (d) Can we use async/await with Observable chains?
- **Affected components:** All interactive components (selection handlers, filter responses, custom viewers).
- **Status:** OPEN
- **Suggested research:** Check datagrok-patterns.ts patterns 1-3 (event handling); test Observable subscription lifecycle; verify memory leak prevention patterns.
- **Owner:** dg-developer

### DG-10: Package deployment and app entry points
- **Category:** Build & distribution
- **Question:** What does the `package.json` / `package.ts` / `webpack.config.js` triple need to look like? How do we define an app entry point with the `@grok.decorators.app()` decorator? What's the difference between `grok publish --debug` and `grok publish --release`?
- **Why it matters:** The Datagrok port will be distributed as a package. We need a working build pipeline. Need to confirm: (a) Can we use TypeScript + Vite, or must we stick with webpack? (b) What's the tree-shaking strategy for unused DG API? (c) Can we have multiple apps per package (e.g., "SEND Browser" + "Validation Inspector" as separate entry points)? (d) How are dependencies (lodash, date-fns, Recharts) handled — bundled or CDN?
- **Affected components:** Build pipeline, package structure.
- **Status:** OPEN
- **Suggested research:** Check Datagrok sample packages on GitHub; read `package.json` schema docs; test build with `grok publish --debug`.
- **Owner:** dg-developer

### DG-11: Heatmap viewer color scheme options
- **Category:** Specialized viewers
- **Question:** Does the DG Heatmap viewer support threshold-based coloring (e.g., "red if p < 0.001, orange if p < 0.01, yellow if p < 0.05, green otherwise")? Or only gradient schemes? Can we customize the color map?
- **Why it matters:** The Study Summary Signals view renders a signal score heatmap with 5 discrete color bands (red, orange, yellow, light green, dark green). If the DG Heatmap viewer only supports continuous gradients, we may need a custom JsViewer. Need to confirm: (a) Is there a "Conditional" or "Threshold" color scheme? (b) Can we pass a custom color function to the viewer? (c) What's the performance for 1000+ cells?
- **Affected components:** Study Summary Signals heatmap, organ-grouped matrices.
- **Status:** OPEN
- **Suggested research:** Test DG Heatmap viewer with sample signal data; check `setOptions()` for color configuration; compare performance with custom canvas heatmap.
- **Owner:** dg-developer

### DG-12: DataFrame currentRowIdx and Property Panel info panes
- **Category:** Context panel integration
- **Question:** How does setting `df.currentRowIdx` trigger the right side Property Panel to update? How are custom info panes registered (the `//tags: panel, widgets` decorators)? Can we have view-specific panels?
- **Why it matters:** In DG, the context panel on the right updates based on the current row and semantic types. We need to map the prototype's explicit context pane modes (Overview, Findings, Related Views) to DG's panel system. Need to confirm: (a) Can one info pane show multiple facets (organ header + InsightsList + cross-view links) or do we need separate panels? (b) How do conditions in panel decorators work (e.g., "show this panel only if cell is of type 'signal'")? (c) Can we suppress default panels and show only custom ones?
- **Affected components:** All context panel implementations, Property Panel integration strategy.
- **Status:** OPEN
- **Suggested research:** Check datagrok-patterns.ts pattern 15+ (info panes); test custom panel with decorators; verify currentRowIdx semantics.
- **Owner:** dg-developer

### DG-13: Semantic types and type-specific renderers
- **Category:** Data model
- **Question:** How do we register custom semantic types? What's the contract between a semantic type and its associated renderer, filter, and info pane? Can we have domain-specific semantic types (e.g., "SEND_endpoint" with special filtering)?
- **Why it matters:** In the prototype, endpoints are generic strings. In DG, we could tag an "endpoint" column with a semantic type that auto-selects the right renderer and filter. Need to confirm: (a) Can we register a custom semantic type that applies across all studies? (b) Does the semantic type system work at the column level or cell level? (c) Can a semantic type condition the visibility of Property Panel panes?
- **Affected components:** Endpoint rail (custom viewer vs semantic type + custom renderer), organ rail (same choice).
- **Status:** OPEN
- **Suggested research:** Check DG docs for "semantic types" and custom type registration; verify type scoping (global vs column-level).
- **Owner:** dg-developer

### DG-14: Keyboard shortcuts and accessibility in custom viewers
- **Category:** UX
- **Question:** How do we register keyboard shortcuts in a DG app (e.g., Escape to clear selection, arrow keys to navigate rail)? What accessibility features does DG provide (screen reader support, keyboard navigation, ARIA labels)? Can custom viewers participate?
- **Why it matters:** The prototype uses standard browser keyboard events. DG may have a centralized shortcut registry. Need to confirm: (a) Can we hook into DG's shortcut system or use standard addEventListener? (b) Does DG's selection model propagate keyboard events to custom viewers? (c) What's the precedent for accessible custom viewers?
- **Affected components:** Rail navigation (arrow keys), Selection clearing (Escape), context panel navigation (< > buttons).
- **Status:** OPEN
- **Suggested research:** Test keyboard event handling in custom JsViewers; check DG docs for built-in shortcuts; verify ARIA support in custom components.
- **Owner:** dg-developer

### DG-15: Large data performance — grid rendering, filtering, sorting
- **Category:** Performance
- **Question:** What's the practical row limit for a DG Grid before scrolling/sorting/filtering becomes sluggish? Does DG use virtual scrolling? How does selection performance scale with large BitSets?
- **Why it matters:** The validation view needs to render 100+ affected records per rule. Domain browsing tables can have 10k+ rows (e.g., LB domain with lab values for all timepoints × subjects × measurements). Need to confirm: (a) Is virtual scrolling enabled by default? (b) What's the overhead of multi-column sorts on 10k rows? (c) Can we pre-filter large result sets server-side to reduce browser load?
- **Affected components:** Domain browsing grids, Validation affected records table, Histopathology matrix (1000+ subject cells).
- **Status:** OPEN
- **Suggested research:** Test Grid with 10k rows, measure scroll framerate; test sort/filter on 10k rows; profile memory usage with large BitSet selections.
- **Owner:** dg-developer
