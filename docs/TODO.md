# Technical Debt & Open Issues

> **Source:** Extracted from `docs/systems/*.md` during consolidation audit (2026-02-08).
> **Purpose:** Shared backlog. Either contributor can pick up items and push fixes or incoming specs.
> **Process:** Pick an item → implement or write a spec in `docs/incoming/` → mark done here → update the relevant `docs/systems/*.md`.

---

## Summary

| Category | Count | Description |
|----------|-------|-------------|
| Bug | 5 | Incorrect behavior that should be fixed |
| Hardcoded | 8 | Values that should be configurable or derived |
| Spec divergence | 11 | Code differs from spec — decide which is right |
| Missing feature | 8 | Spec'd but not implemented |
| Gap | 10 | Missing capability, no spec exists |
| Stub | 1 | Partial implementation |
| **Total** | **43** | |

---

## Bugs

### BUG-01: PathologyReview field naming mismatch
- **System:** `systems/annotations.md`
- **Files:** `backend/routers/annotations.py`, `frontend/src/types/annotations.ts`
- **Issue:** Backend injects `reviewedBy`/`reviewedDate` but TypeScript type expects `pathologist`/`reviewDate`. The form sends TypeScript field names; backend overwrites with its own. Creates ambiguous data.
- **Fix:** Align field names in one direction (rename backend or frontend).
- **Status:** Open

### BUG-02: code-mapping evidence type never produced
- **System:** `systems/validation-engine.md`
- **Files:** `frontend/src/types/analysis-views.ts`, `backend/validation/checks/*.py`
- **Issue:** `code-mapping` is defined in the TypeScript `RecordEvidence` discriminated union but no backend check handler ever produces it. Dead code or missing implementation.
- **Fix:** Either implement a check that produces it, or remove from the union type.
- **Status:** Open

### BUG-03: Fix script registry get_script() logic error
- **System:** `systems/validation-engine.md`
- **Files:** `backend/validation/scripts/registry.py`
- **Issue:** `get_script()` returns the first script if it matches, otherwise `None` for all (early return in loop body). Not currently called by the router, so no runtime impact yet.
- **Fix:** Fix the loop logic before this function gets wired up.
- **Status:** Open

### BUG-04: ANOVA/Dunnett functions defined but unused
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/generator/domain_stats.py`
- **Issue:** `_anova_p()` and `_dunnett_p()` are defined but the enrichment loop approximates `anova_p` from `min_p_adj` and `jt_p` from `trend_p` instead. The approximation loses information — raw per-subject values are not retained.
- **Fix:** Retain raw values through the pipeline and compute properly, or document the approximation as intentional and remove the dead functions.
- **Status:** Open

### BUG-05: ViewSelectionContext uses Record<string, any>
- **System:** `systems/navigation-and-layout.md`
- **Files:** `frontend/src/contexts/ViewSelectionContext.tsx`
- **Issue:** Selection state typed as `Record<string, any>` with a runtime `_view` tag. No compile-time enforcement of selection shape per view.
- **Fix:** Define discriminated union type per view (DoseResponseSelection | TargetOrgansSelection | ...).
- **Status:** Open

---

## Hardcoded Values

### HC-01: Dose group mapping
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/services/analysis/dose_groups.py:10`
- **Issue:** `ARMCD_TO_DOSE_LEVEL = {"1": 0, "2": 1, "3": 2, "4": 3}`. Only works for PointCross.
- **Fix:** Derive dynamically from TX/DM domains.
- **Status:** Open

### HC-02: Recovery arm codes
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/services/analysis/dose_groups.py:13`
- **Issue:** `RECOVERY_ARMCDS = {"1R", "2R", "3R", "4R"}` hardcoded.
- **Fix:** Derive from study data or make configurable.
- **Status:** Open

### HC-03: Single-study restriction
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/config.py:15`
- **Issue:** `ALLOWED_STUDIES = {"PointCross"}` restricts entire app.
- **Fix:** Remove filter. Depends on multi-study infrastructure.
- **Status:** Open (blocked on multi-study support)

### HC-04: File-based annotation storage
- **System:** `systems/annotations.md`
- **Files:** `backend/routers/annotations.py`
- **Issue:** JSON files on disk, no transactions, no backup, no concurrency.
- **Fix:** Replace with database. API contract is storage-agnostic — zero frontend changes.
- **Status:** Open (blocked on database infrastructure)

### HC-05: Hardcoded reviewer identity
- **System:** `systems/annotations.md`
- **Files:** `backend/routers/annotations.py:56`
- **Issue:** `reviewedBy` always set to `"User"`.
- **Fix:** Derive from auth context. Blocked on auth implementation.
- **Status:** Open (blocked on auth)

### HC-06: No authentication
- **System:** `systems/annotations.md`
- **Files:** `backend/main.py:32-37`
- **Issue:** CORS `allow_origins=["*"]`, no auth middleware.
- **Fix:** Add Datagrok auth integration.
- **Status:** Open (infrastructure dependency)

### HC-07: Non-PointCross demo guard
- **System:** `systems/navigation-and-layout.md`
- **Files:** `frontend/src/components/panels/ContextPanel.tsx:436`
- **Issue:** Shows "demo entry" message for any non-PointCross study.
- **Fix:** Remove guard when multi-study support lands.
- **Status:** Open (blocked on HC-03)

### HC-08: Domain-specific rounding inconsistency
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/services/analysis/findings_lb.py`, `findings_bw.py`, `findings_om.py`
- **Issue:** LB/OM round mean/sd to 4 decimals; BW/FW round to 2 decimals. No documented rationale.
- **Fix:** Decide on consistent policy or document the domain-specific rationale.
- **Status:** Open

---

## Spec Divergences

> Code and spec disagree. Neither is presumed correct. A human must decide which to align to, then update the other.

### SD-01: Signal score weights
- **System:** `systems/insights-engine.md`
- **Code:** `0.35 * stat + 0.20 * trend + 0.25 * effect + 0.20 * bio`
- **Spec:** `0.30 * stat + 0.30 * trend + 0.25 * effect + 0.15 * bio`
- **Decision needed:** Which weights are intended? Update whichever is wrong.

### SD-02: Convergence multiplier formula
- **System:** `systems/insights-engine.md`
- **Code:** `1 + 0.2 * (n_domains - 1)` → continuous (1.0, 1.2, 1.4, 1.6...)
- **Spec:** Stepped (1.0, 1.2, 1.5)
- **Decision needed:** Which formula is intended?

### SD-03: Template registry not implemented
- **System:** `systems/insights-engine.md`
- **Issue:** Spec defines full template/merge/slot/compound_key registry. Code uses direct string construction.
- **Decision needed:** Should the registry be built, or should the spec be updated to match the simpler code approach?

### SD-04: Banner cap not implemented
- **System:** `systems/insights-engine.md`
- **Issue:** Spec defines 6-statement cap with "Show N more" toggle. Code shows all statements.
- **Decision needed:** Should the cap be implemented, or should the spec drop it?

### SD-05: Endpoint-scope rules not in Signals Panel
- **System:** `systems/insights-engine.md`
- **Issue:** `signals-panel-engine.ts` doesn't consume `rule_results` at all. Endpoint-scope rules (R01-R07, R10-R13) only in InsightsList context panel.
- **Decision needed:** Should Signals Panel consume rule_results, or should the spec reflect the current separation?

### SD-06: Convergence detail rendering
- **System:** `systems/insights-engine.md`
- **Issue:** Spec says merge convergence into `organ.target.identification` text. Code shows domains as chips on organ cards.
- **Decision needed:** Which rendering approach is intended?

### SD-07: Endpoint-to-banner promotion
- **System:** `systems/insights-engine.md`
- **Issue:** Spec defines 3 formal promotion rules. Code implements equivalent logic inline in `deriveSynthesisPromotions()`.
- **Decision needed:** Should the promotion pipeline be formalized, or should the spec reflect the inline approach?

### SD-08: FW domain asymmetry
- **System:** `systems/data-pipeline.md`
- **Issue:** FW (Food/Water) only in generator pipeline, not in on-demand adverse effects pipeline.
- **Decision needed:** Should FW be added to on-demand pipeline, or is the asymmetry intentional?

### SD-09: ANOVA/Dunnett approximation
- **System:** `systems/data-pipeline.md`
- **Issue:** Enrichment approximates from existing p-values instead of recomputing from raw data.
- **Decision needed:** Should raw data be retained and stats computed properly, or is the approximation acceptable?

### SD-10: SelectionContext duplication
- **System:** `systems/navigation-and-layout.md`
- **Issue:** `SelectionContext` tracks landing page study selection but is unused once inside a study route (route params take over).
- **Decision needed:** Should the redundant context be removed, or kept for future use?

### SD-11: Bonferroni scope
- **System:** `systems/data-pipeline.md`
- **Issue:** Bonferroni correction applied to continuous domains only. Incidence domains set `p_value_adj = p_value`.
- **Decision needed:** Should incidence domains also get Bonferroni correction, or is this statistically correct as-is?

---

## Missing Features

### MF-01: NOAEL confidence score
- **System:** `systems/insights-engine.md`
- **Spec formula:** `1.0 - 0.2*(single endpoint) - 0.2*(sex inconsistency) - 0.2*(pathology disagreement) - 0.2*(large effect non-significant)`
- **Status:** Not implemented anywhere in codebase.

### MF-02: Mortality signal (DS domain)
- **System:** `systems/insights-engine.md`
- **Issue:** `study.mortality.signal` (priority 800) spec'd but no DS domain analysis exists.
- **Status:** Not implemented.

### MF-03: Validation rules SEND-VAL-016, SEND-VAL-018
- **System:** `systems/validation-engine.md`
- **Issue:** Visit day alignment (016) and domain-specific findings checks (018) not defined in YAML.
- **Status:** Not implemented.

### MF-04: CDISC Library integration
- **System:** `systems/validation-engine.md`
- **Issue:** CT metadata compiled from public docs, not from official CDISC Library API.
- **Status:** Needs API access and data refresh.

### MF-05: Write-back capability for fix scripts
- **System:** `systems/validation-engine.md`
- **Issue:** Fix scripts only annotate; production needs actual data modification.
- **Status:** Not implemented (annotation-only by design for prototype).

### MF-06: Recovery arm analysis
- **System:** `systems/data-pipeline.md`
- **Issue:** Recovery subjects excluded from all computations. No separate recovery arm analysis.
- **Status:** Not implemented.

### MF-07: ValidationRecordReview form incomplete
- **System:** `systems/annotations.md`
- **Issue:** TypeScript interface defines `fixStatus` and `justification` but form doesn't expose them.
- **Status:** Partial implementation.

### MF-08: No authentication system
- **System:** `systems/annotations.md`
- **Issue:** No auth anywhere. Required for production.
- **Status:** Infrastructure dependency.

---

## Gaps

### GAP-01: No URL persistence of filter state
- **System:** `systems/navigation-and-layout.md`
- **Issue:** Navigating to a view always starts with default filters.

### GAP-02: No deep linking
- **System:** `systems/navigation-and-layout.md`
- **Issue:** Cannot share a URL that pre-selects a specific endpoint or organ.

### GAP-03: Cross-view links don't carry filter context
- **System:** `systems/navigation-and-layout.md`
- **Issue:** Navigating from Dose-Response to Target Organs doesn't pre-select the organ.

### GAP-04: No concurrency control on annotations
- **System:** `systems/annotations.md`
- **Issue:** Simultaneous writes produce last-write-wins. No optimistic locking.

### GAP-05: No audit trail for annotations
- **System:** `systems/annotations.md`
- **Issue:** Only most recent reviewer/date stored. Previous values overwritten.

### GAP-06: STRAIN per-species validation not wired
- **System:** `systems/validation-engine.md`
- **Issue:** Per-species sublists exist in YAML but check handler doesn't use them.

### GAP-07: SENDIG metadata not verified
- **System:** `systems/validation-engine.md`
- **Issue:** Variable core designations need line-by-line verification against published standard.

### GAP-08: No incremental recomputation
- **System:** `systems/data-pipeline.md`
- **Issue:** Full pipeline reruns every time. No caching or delta computation.

### GAP-09: SPECIMEN CT check commented out
- **System:** `systems/validation-engine.md`
- **Files:** `backend/validation/checks/controlled_terminology.py`
- **Issue:** Commented out with note about compound TYPE/SITE format needing CDISC Library.

### GAP-10: Template resolution error handling
- **System:** `systems/data-pipeline.md`
- **Issue:** `str.format(**context)` silently falls back to raw template on error. No logging.

---

## Stubs

### STUB-01: Findings domain prefix check
- **System:** `systems/validation-engine.md`
- **Files:** `backend/validation/checks/` (variable format check)
- **Issue:** Findings domain prefix logic present but body is `pass` (skipped).
- **Fix:** Implement or remove.
