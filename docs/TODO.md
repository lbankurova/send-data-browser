# Technical Debt & Open Issues

> **Source:** Extracted from `docs/systems/*.md` during consolidation audit (2026-02-08).
> **Purpose:** Shared backlog. Either contributor can pick up items and push fixes or incoming specs.
> **Process:** Pick an item → implement or write a spec in `docs/incoming/` → mark done here → update the relevant `docs/systems/*.md`.
> **Recommendations added:** 2026-02-08. Domain-informed suggestions for each item. These are advisory — human decides.

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

## Recommended Priorities

**Fix now (prototype quality):**
- BUG-04 / SD-09: ANOVA/Dunnett approximation — statistically incorrect, affects regulatory conclusions
- MF-02: Mortality signal (DS domain) — without this, NOAEL could be set at a dose where animals died
- BUG-01: PathologyReview naming mismatch — quick fix, prevents data ambiguity
- BUG-03: Fix script get_script() — trivial bug fix
- GAP-03: Cross-view context carry — needed to demonstrate convergent evidence workflow
- GAP-10: Template error logging — 5-minute fix

**Fix soon (prototype completeness):**
- MF-01: NOAEL confidence score — high value for demonstrating decision support
- GAP-06: STRAIN per-species validation — data exists, just needs wiring
- BUG-02: code-mapping evidence type — implement the CT close-match check
- MF-07: ValidationRecordReview form — straightforward, completes the triage workflow
- STUB-01: Findings domain prefix check — straightforward validation check
- HC-08: Document domain-specific rounding rationale — just add comments

**Update spec to match code (no code change needed):**
- SD-01: Accept code weights (0.35/0.20/0.25/0.20)
- SD-02: Accept continuous convergence formula
- SD-03: Accept direct string construction
- SD-04: Drop banner cap from spec
- SD-05: Accept Signals Panel / InsightsList separation
- SD-06: Accept domain chips rendering
- SD-07: Accept inline promotion
- SD-11: Bonferroni scope is correct — document rationale

**Defer to production/Datagrok:**
- HC-01, HC-02: Dynamic dose group mapping (essential for multi-study)
- HC-03 → HC-07: Single-study, auth, database (infrastructure chain)
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

---

## Bugs

### BUG-01: PathologyReview field naming mismatch
- **System:** `systems/annotations.md`
- **Files:** `backend/routers/annotations.py`, `frontend/src/types/annotations.ts`
- **Issue:** Backend injects `reviewedBy`/`reviewedDate` but TypeScript type expects `pathologist`/`reviewDate`. The form sends TypeScript field names; backend overwrites with its own. Creates ambiguous data.
- **Fix:** Align field names in one direction (rename backend or frontend).
- **Recommendation:** Align to frontend names (`pathologist`/`reviewDate`). In SEND toxicology, pathology peer review is a formal GLP process — "pathologist" is the standard term for the reviewer role and is more semantically clear than the generic "reviewedBy." Quick fix.
- **Status:** Open

### BUG-02: code-mapping evidence type never produced
- **System:** `systems/validation-engine.md`
- **Files:** `frontend/src/types/analysis-views.ts`, `backend/validation/checks/*.py`
- **Issue:** `code-mapping` is defined in the TypeScript `RecordEvidence` discriminated union but no backend check handler ever produces it. Dead code or missing implementation.
- **Fix:** Either implement a check that produces it, or remove from the union type.
- **Recommendation:** Keep the type and implement. Code mapping is a real SEND concern — when a study uses a non-standard but recognizable term (e.g., "MALE" instead of "M" for SEX, or "Sprague Dawley" instead of "SPRAGUE-DAWLEY"), the validation engine should produce `code-mapping` evidence with the suggested CDISC CT term. The CT check handler should emit this type when there's a close match to a standard term rather than a blanket "unknown value" error.
- **Status:** Open

### BUG-03: Fix script registry get_script() logic error
- **System:** `systems/validation-engine.md`
- **Files:** `backend/validation/scripts/registry.py`
- **Issue:** `get_script()` returns the first script if it matches, otherwise `None` for all (early return in loop body). Not currently called by the router, so no runtime impact yet.
- **Fix:** Fix the loop logic before this function gets wired up.
- **Recommendation:** Quick fix. Trivial bug — fix the loop before wiring up the function.
- **Status:** Open

### BUG-04: ANOVA/Dunnett functions defined but unused
- **System:** `systems/data-pipeline.md`
- **Files:** `backend/generator/domain_stats.py`
- **Issue:** `_anova_p()` and `_dunnett_p()` are defined but the enrichment loop approximates `anova_p` from `min_p_adj` and `jt_p` from `trend_p` instead. The approximation loses information — raw per-subject values are not retained.
- **Fix:** Retain raw values through the pipeline and compute properly, or document the approximation as intentional and remove the dead functions.
- **Recommendation:** Fix properly. This is statistically incorrect. `min_p_adj` (minimum Dunnett's pairwise p-value) is NOT equivalent to the ANOVA F-test p-value. ANOVA asks "is there ANY treatment effect across all groups?" while Dunnett's asks "which specific groups differ from control?" A study can have significant ANOVA but no significant pairwise comparison (diffuse small effects), or vice versa. For regulatory submissions (ICH S3A), ANOVA is the gatekeeper test — Dunnett's is only interpreted when ANOVA is significant. Retain per-subject raw values through the pipeline and compute both properly.
- **Status:** Open

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
- **Status:** Open → resolve by adding documentation

---

## Spec Divergences

> Code and spec disagree. Neither is presumed correct. A human must decide which to align to, then update the other.

### SD-01: Signal score weights
- **System:** `systems/insights-engine.md`
- **Code:** `0.35 * stat + 0.20 * trend + 0.25 * effect + 0.20 * bio`
- **Spec:** `0.30 * stat + 0.30 * trend + 0.25 * effect + 0.15 * bio`
- **Decision needed:** Which weights are intended? Update whichever is wrong.
- **Domain context:** The code weights are more defensible for general toxicology. A statistically significant pairwise comparison (Dunnett's, weight 0.35) is more definitive than a trend test (JT, weight 0.20) — a significant trend with no significant pairwise comparison suggests a diffuse effect that may not be toxicologically meaningful. The higher biological plausibility weight (0.20 vs 0.15) also aligns with regulatory practice — biological plausibility is a key ICH criterion for causality assessment. Both weight sets are reasonable; the code weights better reflect how toxicologists actually weigh evidence.

### SD-02: Convergence multiplier formula
- **System:** `systems/insights-engine.md`
- **Code:** `1 + 0.2 * (n_domains - 1)` → continuous (1.0, 1.2, 1.4, 1.6...)
- **Spec:** Stepped (1.0, 1.2, 1.5)
- **Decision needed:** Which formula is intended?
- **Domain context:** Continuous is more appropriate. In toxicology, each additional domain providing convergent evidence for a target organ IS incrementally informative. Five-domain convergence (e.g., LB↑ + OM↑ + MI lesions + MA gross changes + CL clinical signs all pointing at liver) is meaningfully stronger evidence than three-domain convergence. The stepped formula arbitrarily caps the benefit. Continuous `1 + 0.2*(n-1)` properly rewards each additional evidence stream.

### SD-03: Template registry not implemented
- **System:** `systems/insights-engine.md`
- **Issue:** Spec defines full template/merge/slot/compound_key registry. Code uses direct string construction.
- **Decision needed:** Should the registry be built, or should the spec be updated to match the simpler code approach?
- **Domain context:** Not domain-specific. At 16 rules, direct construction is manageable. A template registry adds value if rule count grows past ~30 or if non-developers need to edit rule text. For now, update spec to match code.

### SD-04: Banner cap not implemented
- **System:** `systems/insights-engine.md`
- **Issue:** Spec defines 6-statement cap with "Show N more" toggle. Code shows all statements.
- **Decision needed:** Should the cap be implemented, or should the spec drop it?
- **Domain context:** Drop the cap. A typical toxicology study generates 3-5 study-scope statements. If a study generates more, the toxicologist needs to see them all — hiding findings behind a toggle risks oversight. Regulatory reviewers expect completeness.

### SD-05: Endpoint-scope rules not in Signals Panel
- **System:** `systems/insights-engine.md`
- **Issue:** `signals-panel-engine.ts` doesn't consume `rule_results` at all. Endpoint-scope rules (R01-R07, R10-R13) only in InsightsList context panel.
- **Decision needed:** Should Signals Panel consume rule_results, or should the spec reflect the current separation?
- **Domain context:** The current separation is correct toxicological UX. The Signals Panel provides study-level synthesis (target organs, NOAEL, modifiers). The InsightsList provides endpoint-level detail on selection. This mirrors how toxicologists work: scan organs first, then drill into endpoints for a specific organ. Mixing endpoint-scope rules (potentially 50+ per study) into the Signals Panel would create information overload. Update spec to reflect the separation.

### SD-06: Convergence detail rendering
- **System:** `systems/insights-engine.md`
- **Issue:** Spec says merge convergence into `organ.target.identification` text. Code shows domains as chips on organ cards.
- **Decision needed:** Which rendering approach is intended?
- **Domain context:** Chips are better for scanability. A toxicologist looking at an organ card wants to immediately see which domains contribute evidence — [LB] [OM] [MI] is instantly scannable. Inline text ("supported by laboratory, organ weight, and microscopic findings") requires reading. Chips also visually encode domain count (convergence strength) by space occupied.

### SD-07: Endpoint-to-banner promotion
- **System:** `systems/insights-engine.md`
- **Issue:** Spec defines 3 formal promotion rules. Code implements equivalent logic inline in `deriveSynthesisPromotions()`.
- **Decision needed:** Should the promotion pipeline be formalized, or should the spec reflect the inline approach?
- **Domain context:** Not domain-specific. Inline is fine at current complexity. Update spec to match code. Revisit if promotion logic grows.

### SD-08: FW domain asymmetry
- **System:** `systems/data-pipeline.md`
- **Issue:** FW (Food/Water) only in generator pipeline, not in on-demand adverse effects pipeline.
- **Decision needed:** Should FW be added to on-demand pipeline, or is the asymmetry intentional?
- **Domain context:** Add FW to the on-demand pipeline, but low priority. Decreased food consumption correlates with body weight effects and can indicate palatability issues or systemic toxicity. FW findings alone rarely drive adversity determinations, but they provide valuable context. A toxicologist reviewing adverse effects for a body weight finding would want to see concurrent food consumption data. The absence makes the adverse effects view incomplete.

### SD-09: ANOVA/Dunnett approximation
- **System:** `systems/data-pipeline.md`
- **Issue:** Enrichment approximates from existing p-values instead of recomputing from raw data.
- **Decision needed:** Should raw data be retained and stats computed properly, or is the approximation acceptable?
- **Domain context:** Fix this — see BUG-04. The approximation is statistically incorrect and could lead to wrong conclusions in regulatory context. ANOVA is the gatekeeper test per ICH S3A guidance; Dunnett's pairwise comparisons are only interpreted when the overall ANOVA is significant. Approximating ANOVA from Dunnett's pairwise values conflates these two distinct questions.

### SD-10: SelectionContext duplication
- **System:** `systems/navigation-and-layout.md`
- **Issue:** `SelectionContext` tracks landing page study selection but is unused once inside a study route (route params take over).
- **Decision needed:** Should the redundant context be removed, or kept for future use?
- **Domain context:** Not domain-specific. Remove the redundancy — route params are the right approach. Keeping dead state creates confusion.

### SD-11: Bonferroni scope
- **System:** `systems/data-pipeline.md`
- **Issue:** Bonferroni correction applied to continuous domains only. Incidence domains set `p_value_adj = p_value`.
- **Decision needed:** Should incidence domains also get Bonferroni correction, or is this statistically correct as-is?
- **Domain context:** The current behavior is statistically correct for toxicology. For continuous endpoints (LB, BW, OM), Bonferroni corrects for testing multiple endpoints within a domain (e.g., 20 lab parameters tested simultaneously). For incidence endpoints (MI, MA, CL), each histopathological finding is a distinct biological observation, not a member of a statistical test battery. FDA/EMA regulatory guidance does NOT require multiplicity adjustment for histopathology. Over-correction would miss real effects because incidence rates are low and studies are not powered for individual histopath findings. Keep as-is, add a code comment documenting the rationale.

---

## Missing Features

### MF-01: NOAEL confidence score
- **System:** `systems/insights-engine.md`
- **Spec formula:** `1.0 - 0.2*(single endpoint) - 0.2*(sex inconsistency) - 0.2*(pathology disagreement) - 0.2*(large effect non-significant)`
- **Status:** Not implemented anywhere in codebase.
- **Recommendation:** Implement — high value. NOAEL is the most consequential scientific judgment in a toxicology study. It directly determines the human starting dose (NOAEL / safety factor = MRSD). A confidence score that flags uncertainty (single-endpoint NOAEL, sex disagreement, pathology peer review conflicts) helps regulatory reviewers assess the robustness of the determination. Use the spec formula as a starting point but make the penalty values configurable — they need calibration by a toxicologist with diverse study experience.

### MF-02: Mortality signal (DS domain)
- **System:** `systems/insights-engine.md`
- **Issue:** `study.mortality.signal` (priority 800) spec'd but no DS domain analysis exists.
- **Status:** Not implemented.
- **Recommendation:** Implement with high priority. Mortality is the most severe adverse outcome in a toxicology study. If animals died or were euthanized due to moribund condition, this dominates all other findings. Read DS domain, identify deaths (`DSDECOD = "FOUND DEAD"` or `"EUTHANIZED DUE TO MORIBUND CONDITION"`), flag at priority 900 (same level as NOAEL rules). A death at any dose level automatically makes that dose the LOAEL or higher. Without this, the system could set a NOAEL at a dose where animals died — a critical error.

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
- **System:** `systems/annotations.md`
- **Issue:** TypeScript interface defines `fixStatus` and `justification` but form doesn't expose them.
- **Status:** Partial implementation.
- **Recommendation:** Implement — straightforward form extension. `fixStatus` (applied fix / accepted as-is / flagged for SME review) and `justification` (free text explaining the decision) are needed for the validation triage workflow. Without them, the reviewer can't record what they did or why.

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
- **System:** `systems/navigation-and-layout.md`
- **Issue:** Navigating from Dose-Response to Target Organs doesn't pre-select the organ.
- **Recommendation:** Implement — this is important for the prototype UX. The core toxicologist workflow is convergent evidence review: see a signal for "Liver" in one view, click to see all liver evidence in another view. Without context carry-over, the user loses their place and must re-find the organ. Pass organ/endpoint as a route param or via ViewSelectionContext on navigation. This directly demonstrates the "insights first, drill down" interaction model.

### GAP-04: No concurrency control on annotations
- **System:** `systems/annotations.md`
- **Issue:** Simultaneous writes produce last-write-wins. No optimistic locking.
- **Recommendation:** Skip for prototype. Single-user demo doesn't need it. In production, pathologist and study director may annotate simultaneously — add optimistic locking (ETags or version counters) on the database layer.

### GAP-05: No audit trail for annotations
- **System:** `systems/annotations.md`
- **Issue:** Only most recent reviewer/date stored. Previous values overwritten.
- **Recommendation:** Skip for prototype. P1 for production — GLP requires that every change to a study assessment is traceable. The FDA can request a complete history of who changed what and when. In production, store annotation history (append-only log or versioned records), not just current state.

### GAP-06: STRAIN per-species validation not wired
- **System:** `systems/validation-engine.md`
- **Issue:** Per-species sublists exist in YAML but check handler doesn't use them.
- **Recommendation:** Implement — the data is already there, just needs wiring. STRAIN controlled terminology is species-specific in SEND. "Sprague-Dawley" is valid for rats but not mice. "CD-1" is valid for mice but not rats. Without this check, a study reporting "Sprague-Dawley" mice would pass validation — a real error that should be caught. Read SPECIES from DM domain, look up the species-specific strain list, validate.

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
- **System:** `systems/data-pipeline.md`
- **Issue:** `str.format(**context)` silently falls back to raw template on error. No logging.
- **Recommendation:** Quick fix. Add a `logger.warning()` when template resolution fails. Silent failures make debugging rule output text impossible. Five minutes of work.

---

## Stubs

### STUB-01: Findings domain prefix check
- **System:** `systems/validation-engine.md`
- **Files:** `backend/validation/checks/` (variable format check)
- **Issue:** Findings domain prefix logic present but body is `pass` (skipped).
- **Fix:** Implement or remove.
- **Recommendation:** Implement. In SEND findings domains (MI, MA, CL, LB, etc.), all variables must be prefixed with the 2-character domain code (MISTRESC, MISPEC, MISEV for Microscopic Findings; MASTRESC, MASPEC for Macroscopic). A copy-paste error creating MISTRESC in the MA domain is a real data quality issue that this check would catch. Straightforward string prefix validation against domain code.
