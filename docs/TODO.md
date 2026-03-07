# Technical Debt & Open Issues

> **Source:** Extracted from `docs/systems/*.md` during consolidation audit (2026-02-08).
> **Purpose:** Shared backlog across all agent roles. This is the single source of truth for what needs doing.
> **Process:** Pick an item → implement → mark done here → update `docs/systems/*.md` (create if missing).
> **Resolved items:** 31 items archived in `docs/TODO-archived.md`.
> **DG knowledge gaps:** DG-01 through DG-15 moved to `docs/portability/dg-knowledge-gaps.md`.

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
| Bug | 8 | 5 | Incorrect behavior that should be fixed |
| Hardcoded | 8 | 1 | Values that should be configurable or derived |
| Spec divergence | 2 | 9 | Code differs from spec — decide which is right |
| Missing feature | 4 | 5 | Spec'd but not implemented |
| Gap | 47 | 6 | Missing capability, no spec exists |
| Stub | 0 | 1 | Partial implementation |
| UI redundancy | 0 | 4 | Center view / context panel data overlap |
| Incoming feature | 0 | 9 | All 9 done (FEAT-01–09) |
| DG knowledge gaps | 15 | 0 | Moved to `docs/portability/dg-knowledge-gaps.md` |
| **Total open** | **69** | **40** | |

## Defer to Production (Infrastructure Chain)

HC-01–07 (dose mapping, recovery arms, single-study, file annotations, reviewer identity, auth, PointCross guard), MF-03–06/08 (validation rules 016/018, CDISC Library, write-back, recovery arms, auth), GAP-01/02/04/05/07–09 (URL state, deep linking, concurrency, audit trail, SENDIG metadata, incremental recompute, SPECIMEN CT), GAP-30/34/35 (BMD, INHAND vocab, PWG workflow), SD-08/10 (FW domain, TypeScript cleanup). See individual entries below for details.

---

## Bugs (7 open)

### BUG-06: Histopath findings table column resize not working
- **Files:** `frontend/src/components/analysis/HistopathologyView.tsx` (`OverviewTab` component)
- **Issue:** The observed findings table uses TanStack React Table with `enableColumnResizing: true` and `tableLayout: "fixed"`, but drag-to-resize on column headers does not work. The resize handle div (`.cursor-col-resize`) is present and highlights on hover, but dragging produces no visible column width change. Likely a conflict between `tableLayout: "fixed"` with percentage-free `width` styles and the TanStack resize state, or the `onClick` sort handler on `<th>` interfering with `onMouseDown` on the resize child. The severity matrix table in the same view uses the identical pattern and works — compare the two to find the difference.
- **Status:** Open
- **Owner hint:** frontend-dev

### BUG-07: Recovery dumbbell chart broken adaptive rendering on panel resize
- **Files:** `frontend/src/components/analysis/panes/RecoveryDumbbellChart.tsx`
- **Issue:** The dumbbell chart SVG does not adapt well when the context panel is resized. The viewBox uses a fixed `chartWidth = 200` with `width: 100%` and `overflow: visible`, but the dose label column, marker positions, bottom labels, and row alignment all break at narrow or wide widths. Specific problems: (1) bottom labels ("Control, D92" / "|g|=0.8") clip or overlap at narrow widths; (2) dose label column `pt-[14px]` static offset misaligns with SVG rows as aspect ratio changes; (3) marker line spacing (`MIN_LINE_DIST = 8` in viewBox units) doesn't account for rendered pixel size. Needs a `ResizeObserver`-based approach or CSS-only responsive layout instead of fixed viewBox scaling.
- **Status:** Open
- **Owner hint:** frontend-dev

### BUG-10: Findings table — autoscroll broken on rail selection
- **Files:** `frontend/src/components/analysis/FindingsTable.tsx`, `frontend/src/contexts/FindingSelectionContext.tsx`
- **Issue:** When clicking a rail card, the findings table should: (a) **Group card** — filter table to all findings in that group (syndrome, organ, etc.). (b) **Endpoint card** — select all findings for that endpoint, with the current finding (matching the volcano scatterplot marker and rail card) marked as current in the table. (c) **Autoscroll** — scroll the table so the current finding row is visible, positioning it to maximize the number of selected/sibling findings also visible (i.e., scroll to show the selection block, not just center the single row). Currently autoscroll does not work — the current finding row is not scrolled into view.
- **Status:** Open
- **Priority:** P2 (interaction/usability — breaks rail↔table coordination)
- **Dependencies:** None
- **Owner hint:** frontend-dev

### BUG-09: Findings table — Group 2 dose header shows units
- **Files:** `frontend/src/components/analysis/FindingsTable.tsx:143-148`
- **Issue:** In the findings table, the Group 2 column header displays units (e.g., "2 mg/kg") while other dose columns show only the numeric value. The `unitLabel` prop is passed only to `idx === 1` (first non-control column) which renders the unit annotation beneath the header — this is intentional. The bug is likely that when `dose_value` is null for Group 2, the fallback `formatDoseShortLabel()` returns a string with units embedded in the label text (e.g., "2 mg/kg" instead of "2"), doubling up the unit display. Fix: strip units from the `formatDoseShortLabel` fallback, or extract only the numeric portion.
- **Status:** Open
- **Priority:** P3 (cosmetic)
- **Dependencies:** None
- **Owner hint:** frontend-dev

### BUG-11: SVG chart reference line labels overlap at narrow widths
- **Files:** `frontend/src/components/analysis/panes/RecoveryDumbbellChart.tsx`, `frontend/src/components/analysis/panes/IncidenceDumbbellChart.tsx`, `frontend/src/components/analysis/panes/TimeCourseLineChart.tsx`
- **Issue:** Axis/reference labels below the SVG charts (e.g., "C: D29", "0.8", "−0.8") overlap when the context panel is narrow or on smaller screens. Labels are positioned with absolute percentages and don't account for collision. Fix: measure label positions after render and hide or truncate labels that would overlap their neighbors.
- **Status:** Open
- **Priority:** P3 (cosmetic, nice-to-have)
- **Owner hint:** frontend-dev

### BUG-12: Ctrl+click multi-select + right-click context menu for scatterplot and rail
- **Files:** `frontend/src/components/analysis/FindingsScatterplot.tsx`, `frontend/src/components/analysis/FindingsRail.tsx`, `frontend/src/contexts/FindingSelectionContext.tsx`
- **Issue:** Ctrl+click currently hides markers in the scatterplot. Ctrl+click should instead toggle discrete endpoint (de)selection — the universal multi-select convention — across both the scatterplot and rail cards. Hiding should move to a right-click context menu. New interaction model (applies to both scatterplot markers and rail cards): (a) **Click** — select single endpoint (replaces selection). (b) **Ctrl+click** — toggle endpoint in/out of current selection. (c) **Right-click** — context menu with "Hide endpoint" (and extensible for future actions: hide group, show hidden, navigate). Selection state is shared: Ctrl+clicking a rail card or a scatterplot marker both update the same selection set, and both surfaces reflect it.
- **Status:** Open
- **Priority:** P2 (interaction model — affects core selection workflow)
- **Dependencies:** None (but coordinate with BUG-10 autoscroll for consistent rail↔table↔scatterplot selection)
- **Owner hint:** frontend-dev

### BUG-13: Dose detail info pane — regression (units, alignment, sex labels)
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx` (or relevant dose detail pane component)
- **Issue:** The dose detail info pane (e.g., Basophils endpoint) has regressed from a previous working state. Three problems: (1) **Units in header** — remove units from the pane header; instead show units as the first row in the info pane, right-aligned. (2) **Column alignment broken** — columns are misaligned (investigate which commit broke it). (3) **Sex labels** — each dose group should show one label per sex; currently not rendering correctly. A later commit broke this pane — bisect to find the regression.
- **Status:** ~~Open~~ Fixed (pending commit)
- **Priority:** P2 (regression — was working, now broken)
- **Dependencies:** None
- **Owner hint:** frontend-dev

### BUG-08: Validation registry.py get_script() logic error
- **Files:** `backend/validation/scripts/registry.py`
- **Issue:** `get_script()` returns first match then None for all subsequent calls due to early return in loop. Not called by router currently, so no runtime impact.
- **Status:** Open (no runtime impact, fix for correctness)
- **Owner hint:** backend-dev

---

## Hardcoded Values (8 open)

### HC-01: Dose group mapping
- **Files:** `backend/services/analysis/dose_groups.py:10`
- **Issue:** `ARMCD_TO_DOSE_LEVEL = {"1": 0, "2": 1, "3": 2, "4": 3}`. Only works for PointCross.
- **Fix:** Derive dynamically from TX/DM domains.
- **Status:** Open

### HC-02: Recovery arm codes
- **Files:** `backend/services/analysis/dose_groups.py:13`
- **Issue:** `RECOVERY_ARMCDS = {"1R", "2R", "3R", "4R"}` hardcoded.
- **Fix:** Derive from TX domain (TXPARMCD = "RECOVDUR").
- **Status:** Open

### HC-03: Single-study restriction
- **Files:** `backend/config.py:15`
- **Issue:** `ALLOWED_STUDIES = {"PointCross"}` restricts entire app.
- **Status:** Open (blocked on multi-study support)

### HC-04: File-based annotation storage
- **Files:** `backend/routers/annotations.py`
- **Issue:** JSON files on disk, no transactions, no concurrency.
- **Fix:** Replace with database. API contract is storage-agnostic — zero frontend changes.
- **Status:** Open (blocked on database infrastructure)

### HC-05: Hardcoded reviewer identity
- **Files:** `backend/routers/annotations.py:56`
- **Issue:** `reviewedBy` always set to `"User"`. Blocked on auth.
- **Status:** Open (blocked on auth)

### HC-06: No authentication
- **Files:** `backend/main.py:36-41`
- **Issue:** CORS `allow_origins=["*"]`, no auth middleware.
- **Status:** Open (infrastructure dependency)

### HC-07: Non-PointCross demo guard
- **Files:** `frontend/src/components/panels/ContextPanel.tsx:399`
- **Issue:** Shows "demo entry" message for any non-PointCross study.
- **Status:** Open (blocked on HC-03)

### HC-09: Review Progress pane counts depend on file-based annotations
- **Files:** `frontend/src/components/panels/ContextPanel.tsx` (StudyInspector)
- **Issue:** Client-side `Object.keys()` counting on annotation objects. Won't scale to multi-user.
- **Fix:** Add dedicated API endpoint when HC-04 is implemented.
- **Status:** Open (blocked on HC-04)

---

## Spec Divergences (2 open)

### SD-08: FW domain asymmetry
- **Issue:** FW only in generator pipeline, not in on-demand adverse effects pipeline. Low priority — FW rarely drives adversity.
- **Status:** Open

### SD-10: SelectionContext duplication
- **Issue:** `SelectionContext` tracks landing page study selection but is unused once inside a study route (route params take over). Remove the redundancy.
- **Status:** Open

---

## Missing Features (5 open)

### MF-03: Validation rules SEND-VAL-016, SEND-VAL-018
- **Issue:** Visit day alignment (016) and domain-specific findings checks (018) not defined in YAML.
- **Status:** Not implemented

### MF-04: CDISC Library integration
- **Issue:** CT metadata compiled from public docs, not from official CDISC Library API.
- **Status:** Defer to production

### MF-05: Write-back capability for fix scripts
- **Issue:** Fix scripts only annotate; production needs correction overlay (not XPT modification).
- **Status:** Defer to production

### ~~MF-06: Recovery arm analysis~~ ✅
- **Issue:** Recovery subjects excluded from all computations. Separate analysis mode needed.
- **Status:** Resolved (commits 4f6138f, 4181435, e51c67f) — phase-aware pooling (DATA-01), recovery toggle, 62 tests

### MF-09: Syndrome membership indicator on rail & context panel
- **Spec:** `docs/incoming/arch-overhaul/syndrome-membership-indicator-spec.md`
- **Files:** `FindingsRail.tsx`, `FindingsContextPanel.tsx`, `EndpointSyndromePane.tsx`, `docs/views/adverse-effects.md`
- **Issue:** Endpoints that belong to a fired syndrome (e.g., Body Weight → XS08, XS09) show no indicator in the rail (except in syndrome grouping mode) or context panel header. Users can't tell an endpoint is part of a syndrome, so they miss syndrome-specific context (e.g., food consumption pane in XS09). Fix: always show syndrome IDs on rail endpoint rows and add clickable syndrome links to the context panel sticky header.
- **Status:** Partial — context panel Syndromes pane implemented (27e97ce). Rail indicator still open.
- **Owner hint:** frontend-dev
- **Remaining:** (1) Rail: show syndrome IDs on endpoint rows in non-syndrome grouping mode. (2) Sex display in EndpointSyndromePane: replace "F + M" with "both sexes".

### MF-08: No authentication system
- **Issue:** No auth anywhere. Required for production.
- **Status:** Infrastructure dependency

---

## Gaps (14 open)

### GAP-01: No URL persistence of filter state
- **Status:** Skip for prototype (Datagrok handles differently)

### GAP-02: No deep linking
- **Status:** Skip for prototype (same rationale as GAP-01)

### GAP-04: No concurrency control on annotations
- **Status:** Skip for prototype (single-user)

### GAP-05: No audit trail for annotations
- **Status:** Skip for prototype (P1 for production — GLP requires change traceability)

### GAP-07: SENDIG metadata not verified
- **Status:** Defer until CDISC Library integration (MF-04)

### GAP-08: No incremental recomputation
- **Status:** Skip for prototype (pipeline runs in ~2s)

### GAP-09: SPECIMEN CT check commented out
- **Status:** Defer until CDISC Library integration (MF-04)

### GAP-11/12: Hypotheses tab intent icons and workflow design
- **Files:** `frontend/src/components/analysis/DoseResponseView.tsx`
- **Issue:** Intent icons are placeholder choices (GAP-11). Intents are analytical workflows, not viewer types — need design task before code (GAP-12). Current placeholder implementation sufficient for prototype.
- **Status:** Open (design task, defer to production)

### GAP-14: Design tokens for icons
- **Files:** `frontend/src/lib/design-tokens.ts`, `frontend/src/index.css`, various components
- **Issue:** No centralized icon tokens (size, stroke width, color by context). Icon sizes and colors are ad-hoc across components. Need standardized tokens like `icon.sm` / `icon.md` / `icon.lg` with contextual color rules (muted in chrome, primary in actions, etc.) aligned with Datagrok UI Kit.
- **Status:** Open
- **Owner hint:** ux-designer → frontend-dev

### GAP-15: Organ rail click-to-deselect
- **Files:** `frontend/src/components/analysis/StudySummaryView.tsx`
- **Issue:** Clicking the already-selected organ in the Signals rail does not deselect it (I-02 checklist rule). Currently moot because auto-select would immediately re-select. If auto-select behavior changes, this should be revisited.
- **Status:** Open (deferred — no user impact with current auto-select)
- **Owner hint:** frontend-dev

### GAP-13: Generated HTML report needs redesign
- **Files:** `frontend/src/lib/report-generator.ts`
- **Issue:** Report built before views were fully designed. Needs redesign to reflect current view structure and user workflows.
- **Status:** Open (blocked on user flow document)

### GAP-16: Compound-class contextual warnings (REM-20 deferred)
- **Files:** `frontend/src/lib/syndrome-interpretation.ts`
- **Issue:** REM-20 originally called for explicit missing-domain warnings and compound-class context. The missing-domain warnings were implemented as part of REM-15 (data sufficiency gate, METH-29). The compound-class comparison aspect — warning when a syndrome is detected for a compound whose pharmacological class has known organ-specific effects — requires an external reference database mapping compound classes to expected finding profiles. This database does not currently exist in the system. When available, it would enable contextual warnings like "XS01 detected; compound class (NSAID) has known hepatotoxicity — consider class effect vs. novel finding."
- **Blocked on:** External compound-class-to-findings reference database
- **Status:** Open (deferred — no data source available)
- **Owner hint:** backend-dev (database), frontend-dev (integration into interpretation layer)

### ~~GAP-18: Auto-select organ weight method — full spec implementation~~
- **Files:** `frontend/src/lib/organ-weight-normalization.ts`, `frontend/src/hooks/useOrganWeightNormalization.ts`, `frontend/src/components/analysis/panes/OrganContextPanel.tsx`, `frontend/src/components/analysis/panes/FindingsContextPanel.tsx`, `frontend/src/lib/cross-domain-syndromes.ts`, `frontend/src/lib/syndrome-ecetoc.ts`, `backend/models/schemas.py`, `backend/services/xpt_processor.py`
- **Resolution:** Phase 1 + Phase 2 (reproductive normalization) complete. Phase 1: Hedges' g decision engine, 4-tier BW confounding, species/strain profiles, Bailey et al. organ categories, full UI integration, syndrome engine integration. Phase 2: 3 reproductive sub-categories (gonadal, androgen-dependent, female reproductive), per-organ magnitude floors (4 calibrated tiers), B-7 overrides with XS08 gate, estrous domain detection (backend), hasEstrousData confidence upgrade (frontend wiring), category-aware UI banners, normalization alternatives table. 852 tests total. Phase 3 (ANCOVA backend) and Phase 4 (Bayesian mediation) deferred.
- **Status:** ~~Resolved~~ (Phase 1 + Phase 2 complete)
- **Owner hint:** ux-designer → frontend-dev

### GAP-19: Recovery period validation — move override to validation view
- **Files:** `docs/incoming/arch-overhaul/recovery-validation-spec.md`, `backend/generator/generate.py`, `backend/services/analysis/override_reader.py`, `backend/services/analysis/phase_filter.py`
- **Issue:** The recovery period override UI (checkbox + number input in Recovery pane) was removed — it allowed arbitrary values without proper validation against actual XPT data bounds. Recovery detection failures and boundary corrections should be handled as part of the SEND data validation process, surfaced as blocking issues in the import confirmation dialog. See `recovery-validation-spec.md` for the full spec. Backend override infrastructure (`override_reader.py`, `useRegenerate` hook, regenerate endpoint, annotation schema field `last_dosing_day_override`) remains in place and can be reused.
- **Status:** Open (spec ready, not implemented)
- **Owner hint:** backend-dev (validation rules), frontend-dev (validation view integration)

### GAP-17: Chrome MCP server for E2E / integration testing
- **Files:** N/A (new infrastructure)
- **Issue:** Pure-function unit tests cannot catch UI wiring bugs (e.g., a dropdown writes to session state but a derived override prevents the displayed value from updating — see Bonferroni dropdown bug fixed 2026-02-23). An MCP server for Chrome would enable Claude Code to drive browser interactions and verify visual/interactive behavior as part of the development loop. This would cover the gap between vitest unit tests and full Playwright E2E suites.
- **Approach:** Implement an MCP server that exposes Chrome DevTools Protocol actions (navigate, click, read DOM, screenshot). Claude Code connects via MCP tool, enabling ad-hoc integration checks during development without heavyweight E2E infrastructure.
- **Status:** Open (not critical — unit tests cover math; this catches wiring/interaction bugs)
- **Owner hint:** infrastructure

### GAP-20: Validate Study Summary right column content by pipeline stage
- **Files:** `frontend/src/components/analysis/StudySummaryView.tsx` (Zone B — right column of header)
- **Issue:** The right column now shows Stage, NOAEL, LOAEL, target organs, exposure at NOAEL, HED/MRSD, and dose proportionality. Some of these values may not be available or meaningful at all pipeline stages (e.g., pre-submission studies may not have final NOAEL/LOAEL; ongoing studies have no derived endpoints). Need to audit which fields make sense at each stage and either hide unavailable fields or show placeholders (e.g., "Pending" or "Not yet determined"). Also check whether insights/commentary text in the context panel needs stage-aware phrasing (e.g., "Proposed NOAEL" vs "NOAEL" for pre-submission).
- **Status:** Open
- **Owner hint:** ux-designer + frontend-dev

### GAP-21: TS domain parser for estrous cycle stage distribution
- **Files:** `backend/services/xpt_processor.py` (new parser), `frontend/src/lib/organ-weight-normalization.ts` (consumer)
- **Issue:** Backend detects FE/EO/RE domain presence (boolean `has_estrous_data`) and frontend uses it to upgrade FEMALE_REPRODUCTIVE confidence from "low" to "medium". However, no parser exists to extract estrous cycle staging data from these domains (e.g., cycle stage distribution per animal, cycle regularity metrics). This data would enable: (a) cycle-stage-adjusted organ weight statistics, (b) individual animal cycle-phase assignment for context in organ weight interpretation, (c) further confidence upgrades when cycle data is high-quality. This is a major feature requiring a new findings module, not a simple wiring task.
- **Blocked on:** Study data with FE/EO/RE domains for development and testing (PointCross has none)
- **Status:** Open (deferred — requires reproductive study data)
- **Owner hint:** backend-dev (parser), frontend-dev (UI integration)

### GAP-22: Backend test framework (pytest)
- **Files:** N/A (new infrastructure)
- **Issue:** No backend tests exist. The TERMBW/BW unification bug (`83d813a`) — where BW terminal_day was D85 instead of D92 because BWTESTCD splits scheduled measurements from terminal sacrifice weight — would have been caught by a simple integration test. Key areas to cover: (1) recovery comparison API — TERMBW unification, OM OMSPEC groupby, terminal_day/peak_effect computation; (2) `dose_groups.py` — main vs recovery arm subject assignment, is_recovery flag, TK satellite detection; (3) `statistics.py` — cohens_d, welch_t_test edge cases (n<2, identical values, NaN); (4) generator pipeline — domain_stats output shape, findings_pipeline classification/fold-change; (5) validation engine — YAML rule loading, check function results, fix tier assignment.
- **Approach:** pytest with a session-scoped fixture that loads PointCross XPT data once. Mirror the frontend pattern where tests run against real study data.
- **Status:** Open
- **Owner hint:** backend-dev

### GAP-23: Recovery timeline numbers — cross-validated v3 lookup table
- **Files:** `frontend/src/lib/recovery-duration-table.ts` (v3: 14 organs × 56 findings, 20 continuous endpoints, 4 severity models, per-finding species modifiers, uncertainty model), `frontend/src/lib/finding-nature.ts` (organ/species params, null-safe range display), `frontend/src/lib/recovery-assessment.ts` (uses range high-end for adequacy), `frontend/src/lib/recovery-classification.ts` (range-based qualifier strings)
- **Issue:** v3 three-way merge of literature sources (Brief 7) replaces the preliminary v1 lookup. Key improvements: (a) 21 cross-validation decisions documented in `cross_validation_log.json`, (b) fixed biologically wrong NHP spermatogenesis modifier (1.4→0.8), (c) added `deposit_proportional` severity model for hemosiderosis/pigmentation, (d) nullable `base_weeks` for irreversible findings (kidney mineralization, heart necrosis/fibrosis), (e) nullable species modifiers for non-applicable species (forestomach dog/NHP), (f) 5 new findings (phospholipidosis, focal thyroid hyperplasia, hemorrhage, congestion, pigmentation), (g) `computeUncertaintyBands()` with confidence-based asymmetric bands. ~50 unique literature citations.
- **Remaining:** Values are **cross-validated but still literature-synthesized** — a domain expert should spot-check against primary sources. See `docs/deep-research/engine/brief 7/recovery_duration_lookup_v3_merged.json` for the authoritative data and `cross_validation_report.md` for merge decisions.
- **Status:** Substantially addressed (v3 cross-validated, domain-expert spot-check recommended)
- **Owner hint:** domain expert review (spot-check v3 values against primary literature)

### ~~GAP-25: Parameterize unified_findings / compute_adverse_effects (Settings Propagation Phase 2b)~~
- **Resolution:** Backend now builds unified_findings as 10th parameterized view in `ParameterizedAnalysisPipeline.run()`. Added `"unified-findings"` to `PARAMETERIZED_VIEWS`. All 3 `/analyses/adverse-effects` endpoints accept `AnalysisSettings`. Frontend: `useFindings`, `useAESummary`, `useFindingContext` are settings-aware; 4 client-side transforms removed from `useFindingsAnalyticsLocal`; derivation pipeline (endpoints, syndromes, coherence, signal scores) stays client-side. Fixed Phase 3 Literal type mismatches in `analysis_settings.py`.
- **Status:** ~~Resolved~~ (commit `305d413`)

### GAP-24: Recovery anomaly verdict is too blunt — no delayed-onset discrimination
- **Files:** `frontend/src/lib/recovery-assessment.ts` (Guard 2, line ~123), `frontend/src/lib/recovery-classification.ts` (PATTERN_ANOMALY + DELAYED_ONSET_POSSIBLE steps)
- **Issue:** When a finding is absent in the main arm but present in recovery (0% → >0%), the system assigns a blanket "anomaly" verdict. This conflates three distinct scenarios: (a) **delayed onset** — legitimate treatment-related damage that manifests after a lag (e.g., fibrosis following necrosis, spermatogenic cycle effects), (b) **spontaneous/incidental** — background finding appearing by chance in recovery animals, (c) **true anomaly** — unexplainable pattern requiring pathologist review. The current system treats all three identically with the highest-priority alarm. Key discriminators not used: dose-response within recovery arm, precursor findings in main arm, finding biology (known delayed-onset propensity), historical control incidence, recovery incidence magnitude.
- **Fix:** Replace binary anomaly guard with a multi-verdict discrimination system. First-principles implementation feasible; literature-backed precursor map and delayed-onset propensity table from Brief 8 deep research (`docs/deep-research/engine/brief 8/`) will make it robust. Sub-verdicts: `delayed_onset`, `delayed_onset_possible`, `possible_spontaneous`, `anomaly_unresolved`.
- **Status:** First-principles implementation shipped. Classification-level discrimination (not verdict-level) via new `anomaly-discrimination.ts` module. Precursor map (12 relationships), delayed-onset propensity table, 4-step decision tree. 12 new tests. Brief 8 deep research will refine precursor map and propensity data.
- **Owner hint:** Brief 8 research results → update PRECURSOR_MAP and DELAYED_ONSET_PROPENSITY in `anomaly-discrimination.ts`

### GAP-26: Client-side derivation pipeline — server-side migration trigger
- **Files:** `frontend/src/hooks/useFindingsAnalyticsLocal.ts` (149 lines), `frontend/src/contexts/FindingsAnalyticsContext.tsx` (55 lines)
- **Issue:** Phase 2b eliminated 4 client-side transforms but kept the derivation pipeline (endpoint summaries → syndromes → coherence → signal scores → NOAEL). This is presentation-layer logic today — it takes server-provided findings and computes UI-specific aggregations. Defensible as-is. But the spec's original intent was "frontend does zero computation." If a second consumer (API consumer, report generator, export pipeline) ever needs the same derived analytics, the derivation logic should move server-side to avoid re-implementation in a second language.
- **Trigger condition:** When a second consumer needs derived analytics (endpoint summaries, syndromes, signal scores) outside the React frontend.
- **Status:** Open (deliberate architectural debt, not a bug)
- **Owner hint:** backend-dev (move derivation to pipeline), frontend-dev (rewire consumers)

### ~~GAP-27: Settings recalculating indicator — post-Phase 3 UX debt~~ ✓
- **Status:** Resolved — `RecalculatingBanner` component added to all 5 analysis views. Shows floating "Recalculating…" pill when `isFetching && isPlaceholderData`. `useFindingsAnalyticsLocal` now exposes both flags.

### GAP-28: Production historical control database
- **Files:** `backend/services/analysis/classification.py`, `frontend/src/lib/syndrome-ecetoc.ts`
- **Issue:** HCD Phase 2 SQLite backend shipped (78K+ NTP records, 7 strains, 16 organs), but: (a) frontend ECETOC factor A-3 (HCD comparison) not wired to backend HCD data, (b) production needs laboratory-specific HCD API with species/strain/lab filtering, (c) BALB/C and LONG-EVANS strains have <50 records (insufficient).
- **Status:** Open (backend infrastructure exists, frontend integration + production data needed)
- **Owner hint:** backend-dev

### GAP-29: Reserved ECETOC factors (5 data-dependent)
- **Issue:** Five ECETOC factors reserved pending external data: (a) A-4 temporal onset — needs time-course infrastructure beyond FC ordering, (b) A-5 mechanism plausibility — needs MOA database (overlaps GAP-16), (c) B-2 general stress confound — XS08 overlap exists but general cross-syndrome interference not built, (d) B-6 general precursor-to-worse — tumor progression wired but non-tumor adaptive→adverse not built (backend has METH-36 YAML chains for 14 organs), (e) onset-timing modifiers for BW/CL — Brief 5 decided this merges into DR quality.
- **Status:** Open (deferred — each blocked on specific data/infrastructure)
- **Owner hint:** backend-dev

### GAP-30: BMD module (benchmark dose)
- **Issue:** No benchmark dose computation. Requires `pybmds` dependency (~300-500 LOC). Current dose-response characterization uses pattern classification + effect size.
- **Status:** Open (deferred)
- **Owner hint:** backend-dev

### GAP-31: Backend compound logic for syndrome corroboration
- **Files:** `backend/services/analysis/classification.py`
- **Issue:** Frontend evaluates compound required logic (e.g., "ALP AND (GGT OR 5NT)") for syndrome detection; backend does presence-only. Backend upgrade needed (~300-400 LOC) for parity.
- **Status:** Open
- **Owner hint:** backend-dev

### GAP-32: Signal score configurable weights
- **Files:** `frontend/src/lib/signals-panel-engine.ts`
- **Issue:** Signal score formula uses fixed weights (patternWeight + syndromeBoost + clinicalFloor + sentinelBoost). User-adjustable weight profiles deferred. Formula only documented in code, not in system spec.
- **Status:** Open (deferred)
- **Owner hint:** frontend-dev

### GAP-33: BG/EG/VS on-demand pipeline
- **Files:** `backend/services/analysis/unified_findings.py`
- **Issue:** Generator computes all 12 domains; `unified_findings.py` only serves 8 (missing BG, EG, VS). Affects Adverse Effects view completeness for studies with body/eye/vital sign findings.
- **Status:** Open
- **Owner hint:** backend-dev

### GAP-34: SEND vocabulary normalization / INHAND harmonization
- **Issue:** Histopathology terms not normalized to INHAND controlled vocabulary. Requires terminology service + controlled vocabulary database. XL effort.
- **Status:** Open (deferred — major infrastructure)
- **Owner hint:** backend-dev

### GAP-35: Full PWG (Peer Working Group) workflow
- **Issue:** Multi-step agree/disagree/defer review form shipped. Full panel invitation, slide distribution, concordance calculation, and consensus recording deferred. Blocked on multi-user auth (HC-05/06).
- **Status:** Open (deferred — blocked on auth)
- **Owner hint:** frontend-dev + backend-dev

### GAP-36: CDISC CORE auto-installation
- **Files:** `backend/validation/core_runner.py`
- **Issue:** Requires manual Python 3.12 venv setup, repo clone, dependency install, cache population. Production needs automated installer or Docker image.
- **Status:** Open (blocks non-PointCross validation)
- **Owner hint:** backend-dev

### GAP-37: Custom validation rule execution
- **Files:** `frontend/src/components/analysis/validation/CustomValidationRuleBuilder.tsx`
- **Issue:** Builder UI saves rule metadata as annotation but backend doesn't evaluate custom rules. Feature is inspection-only.
- **Status:** Open (feature incomplete)
- **Owner hint:** backend-dev

### GAP-38: Validation view UI polish (9 items)
- **Issue:** Batch of minor UX gaps: (a) Mode 2 rule link — hover popover only, spec says clickable to Mode 1, (b) status filter buttons don't toggle off, (c) issue ID link styling implies distinct action but same as row click, (d) fix script dialog doesn't close on backdrop click, (e) domain evidence links are `<button>` not `<a>`, (f) bulk mark-reviewed/accept missing, (g) page size hardcoded to 500, (h) keyboard navigation missing (Escape, arrow keys), (i) cross-view navigation — MI validation issue doesn't open histopathology view.
- **Status:** Open (low priority individually, moderate as batch)
- **Owner hint:** frontend-dev

### GAP-39: Dose-response placeholder intents + polish
- **Issue:** Three Hypotheses tab intents are placeholders: Model fit (needs scipy), Correlation (needs subject-level cross-endpoint data), Outliers (needs subject-level values). Also: no keyboard navigation in grid/rail, no data export, signal score local formula may diverge from backend.
- **Status:** Open (placeholders blocked on compute/data infrastructure)
- **Owner hint:** frontend-dev + backend-dev

### GAP-40: Study intelligence gaps
- **Issue:** (a) User-added timeline annotations — spec drafted, annotation infrastructure ready, view implementation pending. (b) Study design validation issue acknowledgment workflow — data quality shows problems but no confirmation dialog. Related to GAP-19.
- **Status:** Open
- **Owner hint:** frontend-dev

### GAP-41: Subject profile minor gaps
- **Issue:** (a) Non-COD tumor cross-references — spec only describes COD cross-refs; unclear if other tumors should show dose-response context. (b) Recovery narrative SE fallback — `cross_animal_flags.py` skips narrative when SE domain lacks recovery element; should fallback to TE/TX-derived start day.
- **Status:** Open (low priority)
- **Owner hint:** frontend-dev (a), backend-dev (b)

### GAP-42: OM pattern classifier metric verification
- **Issue:** Dose-response pattern classifier may still use absolute organ weight values instead of the recommended normalized metric per organ. Needs verification in generator classifier code.
- **Status:** Open (verification task)
- **Owner hint:** backend-dev

### GAP-43: MIMETHOD / special stain handling
- **Issue:** MIMETHOD field extraction from MI domain not implemented. Needed for special stain identification in histopathology.
- **Status:** Open (deferred)
- **Owner hint:** backend-dev

### GAP-44: Assessment engine minor gaps
- **Issue:** (a) Per-sex α2u-globulin mechanism flag for male rat kidney — documented in Brief 1, not implemented. (b) Non-liver adaptive decision trees need concurrent finding validation (`is_lb_marker_clean` counts any change, not just elevation). (c) Expert review package (PDF/HTML structured export) — missing.
- **Status:** Open (deferred)
- **Owner hint:** backend-dev

### GAP-45: TK satellite × recovery interaction
- **Issue:** Unclear if TK satellite recovery animals need special handling in PK integration. Not yet researched.
- **Status:** Open (research task, low priority)
- **Owner hint:** backend-dev

### GAP-46: Overview tab (Study Summary)
- **Issue:** Entire Overview tab NOT STARTED — no components, hooks, or API endpoints (0/8 files). Spec exists (`overview-tab-spec.md`, archived).
- **Status:** Open
- **Owner hint:** frontend-dev + backend-dev

### GAP-47: Early death exclusion Phase 2 — frontend integration
- **Issue:** Backend computes scheduled-only stats but frontend doesn't consume them in 3 views: (a) Dose-Response view has no `useScheduledOnly` integration, (b) Histopathology view has no scheduled-only integration, (c) NOAEL view doesn't consume `scheduled_noael_*` fields. Also: context panel scheduled stats side-by-side display not implemented, per-sex per-dose-group exclusion counts not shown.
- **Status:** Open (5 items from EDE-2/3/4/5/7)
- **Owner hint:** frontend-dev

### GAP-48: Insights engine structural gaps
- **Issue:** Five architectural gaps from the insights engine overhaul spec: (a) no formal rule hierarchy / suppression graph (R01 vs R07 contradiction), (b) Clinical Weighting Layer (`ClinicalRule`, `ClinicalCatalog`) not implemented, (c) Protective Plausibility Gate not implemented, (d) Structured Signal Output (`Signal` interface) not implemented, (e) Scoring Model / Insight Score dashboard not implemented.
- **Status:** Open (from IEO-1–5)
- **Owner hint:** backend-dev + frontend-dev

### GAP-49: Multi-domain integration remaining
- **Issue:** (a) MDI-6: OM-MI organ weight header strip in HistopathologyView (Low). (b) MDI-9: Kaplan-Meier survival curves, scatter death markers, frontend scheduled-only toggle in D-R/Histopath/NOAEL views (Medium). Cross-study analysis (MDI-7) covered by HC-03.
- **Status:** Open
- **Owner hint:** frontend-dev + backend-dev

### GAP-50: Findings view spec gaps (21 items)
- **Issue:** Batch from spec audit: specimen-to-organ mapping for filter presets (FR-3/AER-1, Medium), confidence factors not human-readable (AEI-1, Medium), severity cell clinical override text (AEI-2, Medium), filter bar clinical chip (FHG-1, Medium), correlation rho=-1.00 (FBR-1, Medium). Plus 16 Low items: grouping toggle segmented control, scope indicator source info, keyboard nav, direction colors, label text, filtered count format, foldChangeVsPretest field, dot colors. Detail in archived `spec-cleanup-b66dfd0.md` §1.
- **Status:** Open
- **Owner hint:** frontend-dev

### GAP-51: Histopathology view spec gaps (28 items)
- **Issue:** Batch from spec audit. Medium: dose-dep column header inconsistency (H-2), specimen review status verification (HEn-2), laterality indicators (HEn-3), noael_derivation object verification (HE-4), legacy getDoseConsistencyWeight still used (PCP-1/2), stable Y-axis frame on finding switch (RDC-1), scheduled-only integration (EDE-4). Low (21 items): subject heatmap cells, lab signal scroll, shift+click hint, pigmentation dual-category, SINGLE_GROUP weight, CT term map size, HCD library size, multiplicity footnote, glyph/badge formatting, sort dropdown, derivation icons. Detail in archived `spec-cleanup-b66dfd0.md` §3.
- **Status:** Open
- **Owner hint:** frontend-dev

### GAP-52: Cross-view & shared library gaps (15 items)
- **Issue:** Batch from spec audit. Medium: "View in context" row action (ARF-1), worst validation failures in Study Summary bar (ARF-2), HCD override simplified heuristic (PS-3), multi-persona disagreement workflow (TF-1). Low (11 items): right-click context menus (S2), filtered count in mode toggle (ARF-3), sort control position (ARF-4), clinical significance tooltips (CSI-1–5), protective signal rail glyphs (PS-1/2/4/5), early death scatter marker style (EDE-1). Detail in archived `spec-cleanup-b66dfd0.md` §8.
- **Status:** Open
- **Owner hint:** frontend-dev

### GAP-53: Landing page & study summary gaps (10 items)
- **Issue:** Medium: import textarea non-functional (L-3), portfolio view built but unreachable (SIP-1), worst validation failures bar (ARF-2). Low: study row click 250ms delay (L-1), dead "Learn more" link (L-2), re-validate no feedback (L-4), delete button not debounced (L-5), domain badges not clickable (L-6), InsightsList count text (SS-3), report button no feedback (SS-6), PortfolioSelection type missing (SIP-2). Detail in archived `spec-cleanup-b66dfd0.md` §4/§7.
- **Status:** Open
- **Owner hint:** frontend-dev

### GAP-54: NOAEL view interaction gaps
- **Issue:** Override form "Save" has no success/error feedback (N-2, Medium), adversity matrix cells not clickable despite tooltip (N-3, Low), dose-limiting finding buttons produce no visible result (N-4, Low).
- **Status:** Open
- **Owner hint:** frontend-dev

### GAP-55: Dose-response view interaction gaps
- **Issue:** Time-course "Click a line to view subject profile" is a no-op (DR-3, Medium), evidence chart data points not clickable (DR-4, Low), pairwise rows not clickable (DR-5, Low), InsightsList onEndpointClick not wired (DR-6, Low).
- **Status:** Open
- **Owner hint:** frontend-dev

### GAP-56: Migrate remaining pane tables to PaneTable component
- **Files:** ~23 tables across `frontend/src/components/analysis/panes/` (FindingsContextPanel, CorrelationsPane, NoaelContextPanel, HistopathologyContextPanel, NormalizationHeatmap, DoseResponseContextPanel, EndpointSyndromePane, SubjectProfilePanel, SyndromeContextPanel, ValidationContextPanel)
- **Issue:** `PaneTable` component created for consistent context-panel table styling (auto layout, `tabular-nums`, shared `Th`/`Td` primitives). Currently only used by `DoseDetailPane`. Other pane tables should be migrated incrementally when touched.
- **Status:** Open (low priority — migrate opportunistically)
- **Owner hint:** frontend-dev

---

## Archived Documentation

> **TOPIC hubs** (10 files) archived to `C:/pg/archive/pcc/docs/incoming/arch-overhaul/` on 2026-03-05. Gaps extracted to GAP-28 through GAP-45. TOPIC hubs are frozen historical references per CLAUDE.md rule 7.
>
> **Spec-cleanup tracker** (`spec-cleanup-b66dfd0.md`) archived same date. 92 open items migrated to GAP-46 through GAP-55 (themed batches). Many items may be resolved in commits after 2026-02-23 — verify against code before starting work. Full detail in archived file.
>
> **All specs in `docs/incoming/`** archived same date. System specs (`docs/systems/`) are the durable layer — create when touching a subsystem (commit checklist item 8).
