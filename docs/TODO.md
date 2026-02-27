# Technical Debt & Open Issues

> **Source:** Extracted from `docs/systems/*.md` during consolidation audit (2026-02-08).
> **Purpose:** Shared backlog across all agent roles. This is the single source of truth for what needs doing.
> **Process:** Pick an item → implement or write a spec in `docs/incoming/` → mark done here → update the relevant `docs/systems/*.md`.
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
| Bug | 1 | 5 | Incorrect behavior that should be fixed |
| Hardcoded | 8 | 1 | Values that should be configurable or derived |
| Spec divergence | 2 | 9 | Code differs from spec — decide which is right |
| Missing feature | 4 | 5 | Spec'd but not implemented |
| Gap | 15 | 4 | Missing capability, no spec exists |
| Stub | 0 | 1 | Partial implementation |
| UI redundancy | 0 | 4 | Center view / context panel data overlap |
| Incoming feature | 0 | 9 | All 9 done (FEAT-01–09) |
| DG knowledge gaps | 15 | 0 | Moved to `docs/portability/dg-knowledge-gaps.md` |
| **Total open** | **30** | **38** | |

## Defer to Production (Infrastructure Chain)

HC-01–07 (dose mapping, recovery arms, single-study, file annotations, reviewer identity, auth, PointCross guard), MF-03–06/08 (validation rules 016/018, CDISC Library, write-back, recovery arms, auth), GAP-01/02/04/05/07–09 (URL state, deep linking, concurrency, audit trail, SENDIG metadata, incremental recompute, SPECIMEN CT), SD-08/10 (FW domain, TypeScript cleanup). See individual entries below for details.

---

## Bugs (1 open)

### BUG-06: Histopath findings table column resize not working
- **Files:** `frontend/src/components/analysis/HistopathologyView.tsx` (`OverviewTab` component)
- **Issue:** The observed findings table uses TanStack React Table with `enableColumnResizing: true` and `tableLayout: "fixed"`, but drag-to-resize on column headers does not work. The resize handle div (`.cursor-col-resize`) is present and highlights on hover, but dragging produces no visible column width change. Likely a conflict between `tableLayout: "fixed"` with percentage-free `width` styles and the TanStack resize state, or the `onClick` sort handler on `<th>` interfering with `onMouseDown` on the resize child. The severity matrix table in the same view uses the identical pattern and works — compare the two to find the difference.
- **Status:** Open
- **Owner hint:** frontend-dev

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
- **Files:** `FindingsRail.tsx`, `FindingsContextPanel.tsx`, `docs/views/adverse-effects.md`
- **Issue:** Endpoints that belong to a fired syndrome (e.g., Body Weight → XS08, XS09) show no indicator in the rail (except in syndrome grouping mode) or context panel header. Users can't tell an endpoint is part of a syndrome, so they miss syndrome-specific context (e.g., food consumption pane in XS09). Fix: always show syndrome IDs on rail endpoint rows and add clickable syndrome links to the context panel sticky header.
- **Status:** Open (spec ready)
- **Owner hint:** frontend-dev

### MF-08: No authentication system
- **Issue:** No auth anywhere. Required for production.
- **Status:** Infrastructure dependency

---

## Gaps (11 open)

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

---

## TOPIC Hub Documentation (6 open)

> Subsystems that need retrospective TOPIC hub docs (`docs/incoming/arch-overhaul/TOPIC-*.md`). Existing hubs: data-pipeline, organ-measurements, syndrome-engine. CLAUDE.md rule 7 requires agents to consult hubs before touching covered subsystems.

### DOC-01: TOPIC hub — Validation Engine
- **Subsystem:** `backend/validation/` package, `ValidationView.tsx`, `ValidationContextPanel.tsx`, 14 YAML rules, CDISC CORE integration
- **Why:** Dual-engine architecture (custom + CORE) with precedence logic is a footgun. Rule cache invalidation subtle. Spec (`validation-unified-spec.md`) diverged from implementation on UI layout (three-tab → domain-rail). ~7,700 LOC across 29 files.
- **Status:** Open
- **Owner hint:** docs-agent

### DOC-02: TOPIC hub — Recovery & Phase Detection
- **Subsystem:** `dose_groups.py` (detection), `phase_filter.py`, `recovery-assessment.ts`, `recovery-classification.ts`, `RecoveryPane.tsx`, 12 domain modules (pooling integration)
- **Why:** Pooling asymmetry (in-life domains only, terminal domains skip). TK satellite detection coupled in `dose_groups.py`. Detection waterfall (TA→TE→SE→SETCD/ARMCD) is fragile across studies. 3 specs drove implementation. ~1,800 LOC core + integration across all domain modules.
- **Status:** Open
- **Owner hint:** docs-agent

### DOC-03: TOPIC hub — Subject Profile & Cross-Animal Flags
- **Subsystem:** `SubjectProfilePanel.tsx` (920L, design frozen), `cross_animal_flags.py` (852L), `subject-profile-logic.ts`, tissue battery, tumor linkage, recovery narratives
- **Why:** Design frozen per CLAUDE.md hard rule — agents need clear boundary between "functional bug fix" and "visual change." Tissue battery integration and cross-animal flag display partially wired. `individual-animal-view-spec.md` has unclear compliance status.
- **Status:** Open
- **Owner hint:** docs-agent

### DOC-04: TOPIC hub — NOAEL Determination
- **Subsystem:** `NoaelDeterminationView.tsx` (2,003L), `NoaelContextPanel.tsx`, `noael-narrative.ts`, `protective-signal.ts`, signal matrix, adversity matrix
- **Why:** ECI (5 mechanisms) entangled with TOPIC-organ-measurements. B-7 secondary-to-BW assessment conditional on organ type. Weighted NOAEL derivation couples normalization confidence to study-level NOAEL. Narrative is deliberately simple — agent might try to "improve" it.
- **Status:** Open
- **Owner hint:** docs-agent

### DOC-05: TOPIC hub — Study Intelligence & Metadata
- **Subsystem:** `StudySummaryView.tsx` (1,205L), `AppLandingPage.tsx`, `study_discovery.py`, species/vehicle profiles, subject context, provenance messages
- **Why:** Species/vehicle profiles are stubs (mock data). Study timeline swimlane spec alignment unclear. 5 specs drove implementation. Treatment arms display is complex (multiple arm types, recovery vs. main). ~2,700 LOC.
- **Status:** Open
- **Owner hint:** docs-agent

### DOC-06: TOPIC hub — Dose-Response View
- **Subsystem:** `DoseResponseView.tsx` (2,843L), `DoseResponseContextPanel.tsx`, endpoint picker removal, stat method coupling, timecourse
- **Why:** Largest single view component. Endpoint picker was replaced by rail integration (major UX change, not documented). Stat method selection now coupled to normalization decisions for OM endpoints. Chart display metric auto-selected per normalization tier. ~2,800 LOC.
- **Status:** Open
- **Owner hint:** docs-agent
