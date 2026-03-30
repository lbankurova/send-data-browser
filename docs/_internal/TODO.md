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
| Bug | 16 | 10 | Incorrect behavior that should be fixed |
| Hardcoded | 8 | 1 | Values that should be configurable or derived |
| Spec divergence | 2 | 9 | Code differs from spec — decide which is right |
| Missing feature | 4 | 5 | Spec'd but not implemented |
| Gap | 72 | 47 | Missing capability, no spec exists |
| Stub | 0 | 1 | Partial implementation |
| UI redundancy | 0 | 4 | Center view / context panel data overlap |
| Incoming feature | 0 | 9 | All 9 done (FEAT-01–09) |
| DG knowledge gaps | 15 | 0 | Moved to `docs/portability/dg-knowledge-gaps.md` |
| **Total open** | **96** | **83** | |

## Defer to Production (Infrastructure Chain)

HC-01–07 (dose mapping, recovery arms, single-study, file annotations, reviewer identity, auth, PointCross guard), MF-03–06/08 (validation rules 016/018, CDISC Library, write-back, recovery arms, auth), GAP-01/02/04/05/07–09 (URL state, deep linking, concurrency, audit trail, SENDIG metadata, incremental recompute, SPECIMEN CT), GAP-30/34/35 (BMD, INHAND vocab, PWG workflow), SD-08/10 (FW domain, TypeScript cleanup). See individual entries below for details.

---

## Bugs (12 open)

### ~~BUG-15: Stale sessionStorage values cause 422 on all analysis views~~ ✅
- **Files:** `frontend/src/hooks/useSessionState.ts`, `frontend/src/contexts/StudySettingsContext.tsx`, `frontend/src/lib/build-settings-params.ts`, `frontend/src/hooks/useRecoveryPooling.ts`, `frontend/src/components/analysis/StudySummaryView.tsx`
- **Issue:** `useSessionState` read values from sessionStorage with `as T` cast — no runtime validation. When allowed values changed across code versions (e.g., `"pooled"` → `"pool"`), stale stored values bypassed TypeScript and were sent as query params to the backend, causing 422 validation errors. Also: DEFAULTS were duplicated in `StudySettingsContext` and `build-settings-params`.
- **Fix:** (1) Added optional `validate` param to `useSessionState` for boundary validation. (2) Defined allowed-value `const` arrays as single source of truth (runtime validator + TS type). (3) Consolidated DEFAULTS to one export (`SETTINGS_DEFAULTS`). (4) Added `isOneOf()` helper for string-literal union validation. (5) Wired validation into all constrained `useSessionState` calls.
- **Status:** ~~Open~~ Fixed
- **Priority:** P1 (blocks all analysis views when sessionStorage has stale values)
- **Owner hint:** frontend-dev

### ~~BUG-06: Histopath findings table column resize not working~~ ✅
- **Files:** `frontend/src/components/analysis/HistopathologyView.tsx` (`OverviewTab` component)
- **Issue:** Table was missing `table-layout: fixed` — browser auto-layout ignored TanStack resize widths. Also column styles used `width: 1` / `width: 100%` hacks instead of `header.getSize()`.
- **Status:** ~~Open~~ Fixed

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

### ~~BUG-09: Findings table — Group 2 dose header shows units~~ ✅
- **Files:** `frontend/src/components/analysis/FindingsTable.tsx:143-148`
- **Issue:** Group 2 dose column header showed "mg/kg" unit annotation below the number via `unitLabel` prop on `DoseHeader`. Root cause: `unitLabel` was injected on `idx === 1` (first non-control column). Units belong in tooltip only.
- **Status:** ~~Open~~ Fixed
- **Priority:** P3 (cosmetic)
- **Dependencies:** None
- **Owner hint:** frontend-dev

### BUG-13: CL recovery table — Terminal/Recovery column alignment
- **Files:** `frontend/src/components/analysis/panes/RecoveryPane.tsx` (`IncidenceRecoverySection`)
- **Issue:** The count values (e.g., "3/15") and percentage annotations (e.g., "(20%)") in the Terminal and Recovery columns are not aligned across rows. Counts and percentages should each form visually aligned columns — use fixed-width sub-columns or monospace tabular alignment so digits line up vertically.
- **Status:** Open
- **Priority:** P3 (cosmetic)
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

### ~~BUG-14: Syndrome info pane — duplicate endpoint entries~~ ✅
- **Files:** `frontend/src/lib/cross-domain-syndromes.ts` (`mergeEndpoints`)
- **Issue:** `mergeEndpoints()` used `endpoint_label::role::sex` as the dedup key. When any endpoint has sex-divergent directions, syndrome detection runs per-sex, producing duplicate `EndpointMatch` entries for every non-divergent endpoint (identical data, different sex tag). Three downstream bugs: (1) EndpointSyndromePane shows duplicate rows; (2) `syndrome-cross-reference.ts` recovery assessment inflates `recovered.length` / `partial.length` / `notRecovered.length` — misrepresents recovery narrative in regulatory context; (3) `SyndromeContextPanel` endpoint count header is 2× reality.
- **Fix:** Changed dedup key to `endpoint_label::role` (sex-specificity lives on syndrome-level `sexes` array). Null out `sex` on merged entries to make aggregate semantics explicit and prevent future consumers from silently reading a stale sex tag.
- **Status:** ~~Open~~ Fixed
- **Priority:** P2 → P1 (recovery count inflation is data correctness, not cosmetic)
- **Dependencies:** None
- **Owner hint:** frontend-dev

### ~~BUG-18: `direction: "any"` syndrome terms on sex-divergent endpoints~~ ✅
- **Files:** `frontend/src/lib/cross-domain-syndromes.ts` (`mergeEndpoints`)
- **Issue:** When a syndrome term uses `direction: "any"` and matches a sex-divergent endpoint (↑ in F, ↓ in M), per-sex detection produces two `EndpointMatch` entries with genuinely different directions. After the BUG-14 merge fix, only the first (alphabetically F) was kept — the M direction silently dropped. `direction: "any"` terms are common (60+ uses in syndrome definitions), not rare.
- **Fix:** `mergeEndpoints` now detects direction conflicts during merge: keeps the higher-severity entry's fields but sets `direction: "divergent"`. The UI arrow column renders "—" for divergent (falls through existing ternary). One entry per endpoint, no misleading single-sex arrow.
- **Status:** ~~Open~~ Fixed
- **Priority:** P3
- **Dependencies:** BUG-14 (fixed)
- **Owner hint:** frontend-dev

### BUG-16: Pattern → onset dose dependency invalidation logic is buggy
- **Files:** `frontend/src/lib/onset-dose.ts` (`onsetNeedsAttention`), `frontend/src/components/analysis/panes/OnsetDoseDropdown.tsx`
- **Issue:** The `onsetNeedsAttention` function has incorrect logic: (1) flags monotonic with onset not at lowest dose as needing attention, but that's a valid user choice (user may have statistical reason to set onset at dose 2); (2) doesn't account for switching from a directional pattern to `no_change` — onset should be cleared/hidden, not flagged; (3) the red border style is `border-b-2 border-red-500` (thick) instead of the canonical thin `border-b border-red-500`. The invalidation should only fire when a directional pattern override has no onset set (null) and the user must pick one.
- **Status:** Open
- **Priority:** P2 (incorrect UX signal — false red borders)
- **Dependencies:** Unified override pattern spec (`docs/incoming/unified-override-pattern.md`)
- **Owner hint:** frontend-dev

### ~~BUG-17: Incidence `max_effect_size` is avg severity but labeled as `|g|` across UI~~ (mostly resolved)
- **Files:** `backend/services/analysis/findings_mi.py:195`, `frontend/src/components/analysis/charts/findings-charts.ts` (scatter X-axis), `frontend/src/components/analysis/FindingsTable.tsx` (Effect column), `frontend/src/lib/derive-summaries.ts` (EndpointSummary)
- **Issue:** MI findings store `avg_severity` (1–4 ordinal scale) in the `max_effect_size` field with a comment `# use avg severity as "effect size" for incidence`. This value is then displayed as `|g|` on the scatter plot X-axis, the findings table Effect column, and the endpoint rail — all surfaces that label it as Hedges' g. MA/CL/TF/DS set `max_effect_size = None` so they show "—". The mislabeling means a severity score of 2.18 appears as `g = 2.18`, which a reviewer would interpret as a very large standardized effect when it's actually a moderate severity grade.
- **Status:** ~~Mostly resolved~~ All 19/19 SLA findings resolved. SLA-09/18/01-organ/02/07 fixed in final sweep.
- **Priority:** ~~P2 → P3~~ Resolved
- **Owner hint:** ~~frontend-dev (remaining label gaps in GAP-72)~~

### ~~BUG-18: RECOVERY_NOT_EXAMINED alert fires incorrectly for specimens WITH recovery data~~ ✅
- **Files:** `backend/services/analysis/findings_mi.py`, `findings_ma.py`, `findings_cl.py`, `findings_tf.py`, `backend/generator/view_dataframes.py`, `frontend/src/types/analysis-views.ts`, `frontend/src/lib/histopathology-helpers.ts`, `frontend/src/lib/pattern-classification.ts`
- **Issue:** `pattern-classification.ts:computeAlerts()` and `histopathology-helpers.ts` checked for recovery by looking for "recovery" in `dose_label` of `LesionSeverityRow`. But MI/MA/CL/TF findings exclude recovery subjects before computing group_stats, so `dose_label` never contains "recovery". The alert fired for every specimen with a concerning pattern, regardless of whether recovery subjects actually existed.
- **Fix:** Added backend-computed `has_recovery_subjects` boolean on each finding dict (computed from unfiltered subject list before main_subs filter). Propagated through `view_dataframes.py` → `LesionSeverityRow` TypeScript type → both frontend consumers. All 4 domains (MI, MA, CL, TF) now emit the field.
- **Status:** ~~Open~~ Fixed
- **Priority:** P1 (actively misleading — alert told pathologists recovery wasn't examined when it was)
- **Owner hint:** backend-dev + frontend-dev

### ~~BUG-19: Control-only findings leak into downstream pipelines (sentinel/insight/recovery/lab correlates)~~ ✅
- **Spec:** `docs/incoming/sla-fix-investigation-esophagus.md` (5 bugs)
- **Files:** `backend/services/analysis/clinical_catalog.py`, `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx`, `frontend/src/hooks/useSpecimenLabCorrelation.ts`, `frontend/src/lib/pattern-classification.ts`, `frontend/src/lib/histopathology-helpers.ts`
- **Issue:** ESOPHAGUS (CONTROL_ONLY pattern: INFLAMMATION grade 4.0 + PERFORATION 10% incidence, both control-only) was displayed through the full Evidence/Insights/Recovery/Lab Correlates pipeline as treatment-related. Sentinel classification set correctly upstream but not checked by downstream consumers. Signal score inflated by clinical floor (20) + sentinel boost (15) → ranked first in specimen rail.
- **Fix:** (1) Backend: `clinical_catalog.py` gates on `treatment_related` — no clinical annotation for non-treatment-related findings. (2) Frontend: `deriveSpecimenInsights()` and recovery assessment filter out `CONTROL_ONLY` findings via `controlOnlyFindings` set. (3) Lab correlates: return empty when no organ-specific mapping exists; suppress signal for degenerate controls (n<3 or SD=0). (4) Pattern confidence: no modifier boosts for CONTROL_ONLY/NO_PATTERN. (5) Signal score: 0 for CONTROL_ONLY/NO_PATTERN specimens; clinical data suppressed.
- **Status:** Fixed
- **Priority:** P1 (5 user-visible correctness bugs — misleading clinical annotations, false signal, wrong organ biomarkers)

### ~~BUG-08: Validation registry.py get_script() logic error~~ ✅
- **Files:** `backend/validation/scripts/registry.py`
- **Issue:** `get_script()` returns first match then None for all subsequent calls due to early return in loop. Not called by router currently, so no runtime impact.
- **Status:** Not a bug — code is correct (loop re-enters from top on each call; `return s` inside `if` is standard find-first pattern)

### BUG-21: Continuous recovery verdict misclassifies sign-flip cases as "reversed"
- **Files:** `frontend/src/lib/recovery-verdict.ts` (`classifyContinuousRecovery`)
- **Issue:** When terminal Hedges' g is small-positive (e.g., +0.78 — treated slightly above control) and recovery g flips sign to small-negative (e.g., -0.19), the sub-threshold branch (|recoveryG| < 0.5) ignores the sign flip and classifies as "reversed" based on magnitude reduction. In the PointCross BW Males case, all three dose groups show body weight below control at recovery (monotonic dose-response), but the low dose gets "reversed" because its terminal g happened to be positive due to cross-arm control baseline shift.
- **Root causes:** (1) Sub-threshold branch has no sign-flip awareness. (2) `pct` computed via `Math.abs()` — direction invisible. (3) `terminal_effect` and `effect_size` compare different control populations (main-arm vs recovery-arm), creating baseline shift artifacts. (4) No dose-response context — each dose classified independently.
- **Audit:** Full analysis in `docs/knowledge/continuous-recovery-verdict-audit.md`.
- **Fix options:** (A) Sign-flip awareness in sub-threshold branch — narrowest. (B) Lower overcorrection magnitude threshold. (C) Dose-response-aware post-processing. (D) Within-subject change instead of between-group g. See audit doc for details.
- **Display gap:** Even after algorithm fixes, the recovery data table presents per-dose verdicts in isolation. A toxicologist seeing low=Reversed, mid=Reversing, high=Persistent has no signal that this is a dose-consistent suppressive pattern. Needs a cross-dose consistency annotation in the UI (Finding 5 in audit doc).
- **Owner:** frontend-dev + domain expert review
- **Status:** Options A + C implemented (ac97efe). Option D spec'd (`docs/incoming/option-d-same-arm-recovery-baseline.md`) — ready to implement.
- **Priority:** P2 (incorrect verdict displayed, but data table shows the actual values for manual review)

### BUG-20: D-R line chart error bars disappear on hover (ECharts blur)
- **Files:** `frontend/src/components/analysis/charts/dose-response-charts.ts`
- **Issue:** Line series use `emphasis: { focus: "series" }` which causes ECharts to blur all other series on hover. Error bars are a separate custom series, so they get blurred (faded to near-invisible). Attempted fixes (`emphasis.disabled`, `blur.itemStyle.opacity`, explicit `opacity:1` on renderItem children) all failed — ECharts applies blur at a level above individual element styles for custom series.
- **Fix:** Likely needs one of: (a) render error bars via ECharts `graphic` component (outside series system entirely), (b) use `zlevel` separation if blur doesn't cross canvas layers, (c) abandon `focus: "series"` and implement manual dimming via ECharts event API (`highlight`/`downplay` actions targeting specific series indices).
- **Owner:** frontend-dev
- **Status:** Open

### BUG-22: NOAEL decomposition D-R quality shows wrong onset dose
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx` (DoseResponseQualityContent)
- **Issue:** For Aspartate Aminotransferase (Males), the NOAEL decomposition's dose-response quality dimension shows "Effect onset at 200 mg/kg" while the findings table shows onset at 20 mg/kg. The pairwise significance filter in `DoseResponseQualityContent` may be using different p-value thresholds or different statistics (scheduled-only vs all) than the findings table.
- **Owner:** frontend-dev
- **Status:** Open

### BUG-23: Pattern/onset dose overrides do not flow through NOAEL decomposition
- **Files:** `frontend/src/lib/endpoint-confidence.ts`, `frontend/src/hooks/useFindingsAnalyticsLocal.ts`
- **Issue:** When a user overrides pattern classification or onset dose via the context panel dropdowns, it's unclear whether these overrides propagate to the ECI computation (which feeds NOAEL weight). The ECI reads `finding.dose_response_pattern` and pairwise data directly — overrides stored in annotations may not be reflected. Needs audit of the full override → ECI → NOAEL weight pipeline.
- **Owner:** frontend-dev
- **Status:** Open

### BUG-24: Basophils pattern/onset classification needs review
- **Files:** Generator pipeline + findings rail engine
- **Issue:** Basophils pattern and onset dose classification may be incorrect. Needs manual inspection of the dose-response data vs the auto-classified pattern and onset dose to determine if the engine is handling this endpoint correctly.
- **Owner:** frontend-dev
- **Status:** Open

### ~~BUG-25: Sex-stratified arms treated as separate dose groups (PDS study)~~
- **Status:** Fixed — `_detect_sex_stratified_arms()` + `_merge_sex_stratified_arms()` in dose_groups.py. PDS: 8 groups → 4, single control, both sexes pooled. Spec: `docs/_internal/incoming/sex-stratified-arm-merging.md`.
- **Open items:** Provenance message computed but not wired to UI (spec contradiction — "no changes to subject_context.py" vs "include in _provenance_hints"). Wire when provenance system is next touched.

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

### ~~MF-09: Syndrome membership indicator on rail & context panel~~ ✅
- **Spec:** `docs/incoming/arch-overhaul/syndrome-membership-indicator-spec.md`
- **Files:** `FindingsRail.tsx`, `FindingsContextPanel.tsx`, `EndpointSyndromePane.tsx`, `docs/views/findings.md`
- **Issue:** Endpoints that belong to a fired syndrome (e.g., Body Weight → XS08, XS09) show no indicator in the rail (except in syndrome grouping mode) or context panel header. Users can't tell an endpoint is part of a syndrome, so they miss syndrome-specific context (e.g., food consumption pane in XS09). Fix: always show syndrome IDs on rail endpoint rows and add clickable syndrome links to the context panel sticky header.
- **Status:** ~~Partial~~ Done — context panel Syndromes pane (27e97ce), rail syndrome IDs in all grouping modes, "both sexes" text already present.
- **Owner hint:** frontend-dev

### MF-08: No authentication system
- **Issue:** No auth anywhere. Required for production.
- **Status:** Infrastructure dependency

---

## Gaps (23 open)

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

### ~~GAP-16: Compound-class contextual warnings (REM-20 deferred)~~
- **Files:** `frontend/src/lib/syndrome-translational.ts`, `frontend/src/lib/syndrome-interpretation-types.ts`, `frontend/src/components/analysis/panes/SyndromeContextPanel.tsx`
- **Issue:** ~~REM-20 originally called for explicit missing-domain warnings and compound-class context.~~ Implemented: `assessCompoundProfileOverlap()` matches syndrome endpoints against expected pharmacological effects from the active compound profile. Renders violet-bordered pharmacological context card in SyndromeContextPanel. Narrative segment appended to interpretation.
- **Status:** ~~Open~~ Resolved

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

### ~~GAP-32: Signal score configurable weights~~
- **Files:** `backend/services/analysis/analysis_settings.py`, `backend/generator/view_dataframes.py`, `frontend/src/components/analysis/ThresholdEditor.tsx`
- **Issue:** ~~Signal score formula uses fixed weights. User-adjustable weight profiles deferred.~~
- **Status:** Resolved — ScoringParams dataclass with cont/incidence weight splits, pattern scores, key thresholds, NOAEL penalties. Saved per-study via annotations, read at pipeline time. UI: "Signal scoring parameters" pane in study-level settings.
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
- **Status:** Stub — future implementation, not a gap in existing functionality
- **Owner hint:** frontend-dev

### GAP-54: NOAEL view interaction gaps
- **Issue:** Override form "Save" has no success/error feedback (N-2, Medium). ~~adversity matrix cells not clickable despite tooltip (N-3, Low)~~ — removed in overhaul. ~~dose-limiting finding buttons produce no visible result (N-4, Low)~~ — finding buttons now navigate to Findings view.
- **Status:** Open (N-2 remains)
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

### GAP-58: Remove hard width limits on resizable panels
- **Files:** `frontend/src/components/layout/` (or wherever panel resize constraints are defined — likely `ResizablePanelGroup` / CSS min/max-width)
- **Issue:** The rail, context panel, and navigation tree panels have hard min/max width limits that prevent users from resizing them freely. Remove these constraints so panels can be dragged to any width the user wants. Panels should still have sensible default widths but no artificial caps.
- **Status:** Open
- **Priority:** P3 (usability — user preference)
- **Dependencies:** BUG-07 and BUG-11 (SVG chart rendering at narrow widths) are related — fixing those first means narrow panels won't break charts
- **Owner hint:** frontend-dev

### GAP-59: Recovery verdict override (annotation)
- **Files:** `frontend/src/lib/recovery-verdict.ts`, `frontend/src/components/analysis/panes/RecoveryDumbbellChart.tsx`, `backend/routers/annotations.py`
- **Issue:** The automated continuous recovery verdict (CLASS-10b) can misclassify when the data is noisy or the cross-arm baseline shift is large. Since the verdict feeds CLASS-20 (Recovery Classification interpretive layer) and potentially NOAEL reasoning, a pathologist needs to be able to override it. Should follow the existing `pattern_overrides` annotation pattern: stored verdict + rationale, persisted per endpoint/sex/dose. The data table Classification column should show the override when present, with a visual indicator distinguishing automated vs manual verdicts.
- **Status:** Open
- **Priority:** P2 (correctness — feeds downstream classification)
- **Owner hint:** frontend-dev + backend-dev

### GAP-60: Peak effect marker on recovery dumbbell chart
- **Files:** `frontend/src/components/analysis/panes/RecoveryDumbbellChart.tsx`
- **Issue:** The old horizontal dumbbell chart showed peak effect as an amber triangle when `hasPeakQualifier` was met (peak |g| > terminal |g| × 1.5, peak > 1.0, terminal >= 0.5). The vertical chart rewrite dropped this rendering. `hasPeakQualifier` is still exported and the data (`peak_effect`, `peak_day`) is in the API response. Add back as a small marker on the vertical chart — triangle at the peak g value with a dashed connector to the terminal dot, providing "the effect was even larger at Day X" context.
- **Status:** Open
- **Priority:** P3 (informational — useful context but not blocking)
- **Owner hint:** frontend-dev

### ~~GAP-57: Extract PanePillToggle component as canonical chart/table mode toggle~~ ✅
- **Files:** `frontend/src/components/ui/PanePillToggle.tsx` (extracted component), `frontend/src/components/analysis/panes/DistributionPane.tsx` (first adopter)
- **Issue:** The pill-style mode toggle in `DistributionPane` (Terminal / Peak / Recovery) is the intended pattern for all chart and table mode toggles in panes. Extracted as a generic `PanePillToggle<T>` in `components/ui/`. Pattern: container `flex gap-0.5 bg-muted/30 rounded p-0.5`, active button `bg-background text-foreground shadow-sm font-medium`, inactive `text-muted-foreground hover:text-foreground`, size `text-[10px] px-1.5 py-0.5`. Excludes section/pane headers (which use the canonical tab bar pattern per CLAUDE.md).
- **Status:** ~~Open~~ Done
- **Priority:** P3 (design system consistency)
- **Dependencies:** Related to GAP-56 (PaneTable) — both standardize pane internals
- **Owner hint:** frontend-dev

### GAP-60: DoseResponseView causal assessment OverridePill missing user/timestamp
- **Files:** `frontend/src/components/analysis/DoseResponseView.tsx` (CausalityWorksheet, ~line 2632)
- **Issue:** Causal assessment criterion override pills pass no `user` or `timestamp` props. Phase 4 spec ("ensure all overrides show user/timestamp in tooltip") is not met for this location. The assessment saves via annotation API so the data is available from the backend, but the component doesn't read or display it. Waiting for user feedback before fixing — causal overrides are form-level state (no per-criterion auth), so user/timestamp may not be meaningful here.
- **Status:** Open — waiting for user feedback
- **Priority:** P3 (consistency)
- **Owner hint:** frontend-dev

### ~~GAP-59: Recovery sex-stratification — verify grouping is sex-aware~~
- **Status:** Fixed — backend already sex-stratified (continuous: `groupby("SEX")`, incidence: `for sex_val in ["F", "M"]`). Frontend histopath `deriveRecoveryAssessments` was NOT — pooled sexes from HistopathologyView and HistopathologyContextPanel. Added `deriveRecoveryAssessmentsSexAware()` wrapper that stratifies by sex, computes per-sex, merges worst verdict per dose level. `RecoveryPane` was already correct (`useOrganRecovery` per sex).
- **Priority:** ~~P1~~ Resolved
- **Source:** Recovery assessment audit spec, "Additional findings" section

### ~~GAP-62: Audit volcano plot percentile ranking for derived-endpoint contamination~~
- **Files:** `frontend/src/components/analysis/charts/findings-charts.ts`, `frontend/src/lib/derive-summaries.ts`, `frontend/src/types/analysis-views.ts`
- **Issue:** Derived endpoints (ALBGLOB, MCH, MCHC, MCV) distorted percentile distributions used for volcano plot positioning.
- **Fix:** Added `is_derived` to `AdverseEffectSummaryRow` (backend emits), propagated to `EndpointSummary.isDerived`, filtered in `prepareQuadrantPoints()` before ranking. Backend `build_adverse_effect_summary()` now includes `is_derived` field.
- **Status:** ~~Open~~ Resolved
- **Priority:** ~~P3~~ Resolved

### ~~GAP-63: Audit NOAEL weight logic for derived-endpoint influence~~
- **Files:** `backend/generator/view_dataframes.py` (`build_noael_summary`)
- **Issue:** Derived endpoints could drive organ-level NOAEL to artifactually low values (ratio math can produce spurious significance at lower doses than source components).
- **Fix:** Added `is_derived` filter in both the adverse-dose-level collection loop and the LOAEL evidence collection loop in `build_noael_summary()`. Derived findings no longer participate in NOAEL/LOAEL determination.
- **Status:** ~~Open~~ Resolved
- **Priority:** ~~P3~~ Resolved

### GAP-64: Extend `is_derived` flag to BW gain and organ-to-BW ratios
- **Files:** `backend/services/analysis/send_knowledge.py`, `findings_pipeline.py`
- **Issue:** BW gain (if generated as separate finding) and organ-to-body-weight ratios share the same tautological correlation problem as ALBGLOB/MCH/MCHC/MCV. When these enter the findings pipeline, they need the `derived` flag in BIOMARKER_MAP. Currently not an issue for PointCross (no BW gain findings, OM ratios computed client-side) but will matter for studies that report them.
- **Status:** Open — deferred until relevant study data arrives
- **Priority:** P4
- **Owner hint:** backend-dev

### ~~GAP-66: Syndrome validation label in FindingsRail syndrome cards~~
- **Status:** Resolved. Co-variation label (Strong/Moderate/Weak) shown as neutral gray badge on syndrome cards in FindingsRail. Uses batch endpoint data from GAP-68.
- **Priority:** ~~P3~~ Resolved

### ~~GAP-67: Syndrome confidence adjustment based on co-variation strength~~
- **Status:** Resolved. `adjustSyndromeConfidence()` in FindingsRail: Strong co-variation upgrades MODERATE→HIGH and LOW→MODERATE. Weak co-variation adds caveat tooltip but doesn't downgrade. Confidence shown on syndrome card headers with dashed RAG underline (same pattern as organ confidence).
- **Priority:** ~~P3~~ Resolved

### ~~GAP-68: Precomputed syndrome correlations fallback~~
- **Status:** Resolved. Batch POST endpoint (`/syndrome-correlation-summaries`) accepts all syndromes in one request, returns summaries per syndrome. Frontend `useSyndromeCorrelationSummaries` hook eagerly fetches on syndrome detection. Eliminates N per-syndrome requests.
- **Priority:** ~~P4~~ Resolved

### ~~GAP-61: FindingsRail prefetch on hover~~
- **Status:** Resolved. Rail now has `bestFindingIdByLabel` map (useMemo) that resolves `endpoint_label → finding.id` using the `activeFindings` array from `useFindingsAnalyticsLocal`. `handleEndpointHover` callback passed to `EndpointRow` via `onHover` prop. Both AllEndpointsCard and CardSection paths covered.
- **Priority:** ~~P3~~ Resolved

### ~~GAP-62: Progressive rendering for FindingsContextPanel~~
- **Status:** Resolved. Header + independent panes (TimeCourse, Distribution, Recovery) render immediately from cached finding data. Context-dependent panes (Verdict, DoseDetail, Evidence, Correlations, Context) show skeleton until `useFindingContext()` resolves. `contextReady` flag gates the split.
- **Priority:** ~~P3~~ Resolved

### ~~GAP-63: CollapsiblePane mount-when-collapsed — hybrid approach~~
- **Status:** Resolved. Added `keepMounted` prop to CollapsiblePane — uses CSS `hidden` instead of conditional unmount. Applied to 5 safe panes (DoseDetail, Evidence, Correlations, Context, Related views). 4 panes with independent FETCH hooks (TimeCourse, Distribution, Recovery, Syndromes) remain conditionally rendered.
- **Priority:** ~~P3~~ Resolved

### ~~GAP-64: `analysis_views.py` `_load_from_disk` not cached for unified_findings~~
- **Status:** Resolved. `pattern_override_preview` now calls `_load_unified_findings` from `analyses.py` (in-memory LRU cached) instead of `_load_from_disk`.
- **Priority:** ~~P4~~ Resolved

### ~~GAP-65: Document in-memory findings cache strategy~~
- **Status:** Resolved. Added "Caching Strategy" section to `docs/systems/data-pipeline.md` documenting all 3 layers (in-memory LRU, file-based settings cache, frontend React Query), invalidation flow, thread safety, and mutation safety contract.
- **Priority:** ~~P4~~ Resolved

### GAP-69: Promote StudyDetailsContextPanel header to ContextPanelHeader pattern
- **Files:** `frontend/src/components/analysis/panes/StudyDetailsContextPanel.tsx`
- **Issue:** The Study-level settings panel still uses a custom sticky header (`bg-muted/30`, `text-xs font-semibold uppercase`) rather than the shared `ContextPanelHeader` component used by all other context panels. CollapseAll was added (D2) but the header itself was not promoted (D5 deferred). Decide whether to adopt ContextPanelHeader here or keep the distinct "settings" header style as intentional differentiation.
- **Status:** Open — deferred, waiting for user decision
- **Priority:** P3 (design consistency)
- **Owner hint:** ux-designer

### GAP-70: Add header to PortfolioContextPanel
- **Files:** `frontend/src/components/analysis/panes/PortfolioContextPanel.tsx` (or equivalent landing page panel)
- **Issue:** The Portfolio / landing page context panel has no sticky header at all. All other context panels now use `ContextPanelHeader` with title, optional subtitle, and CollapseAll. Decide whether to add a header here and what title/subtitle to use.
- **Status:** Open — deferred, waiting for user decision
- **Priority:** P3 (design consistency)
- **Owner hint:** ux-designer

### GAP-71: Decide TierCountBadges placement in context panel headers
- **Files:** `frontend/src/components/analysis/panes/DoseResponseContextPanel.tsx`, `frontend/src/components/analysis/panes/NoaelContextPanel.tsx`
- **Issue:** TierCountBadges (colored tier-severity counts) currently render in the `children` slot of ContextPanelHeader on the DoseResponse panel. Other panels with tier data (NOAEL, Findings) don't show them in headers. Need user decision on whether TierCountBadges belong in the header, in a subtitle, or only in pane content. D8 deferred from context panel consistency audit.
- **Status:** Open — deferred, waiting for user decision
- **Priority:** P4 (design polish)
- **Owner hint:** ux-designer

### GAP-72: SLA fix remaining items (2 unimplemented + partial gaps)
- **Spec:** `docs/incoming/archive/sla-fix-spec.md` (archived)
- **Issue:** Post-implementation review of SLA fix spec identified unimplemented items and several partial gaps from the implemented items.
- ~~**Unimplemented:**~~
  - ~~**SLA-09:** Incidence quality checks — `checkNonMonotonic()` and `checkTrendTestValidity()` now handle incidence data via `isIncidence` flag. Incidence-specific checks: proportion-based non-monotonic detection, small-sample/floor-ceiling/extreme-range trend validity~~
  - ~~**SLA-18:** Recovery vocabulary harmonization — canonical `recovery-labels.ts` with shared `RECOVERY_VERDICT_LABEL/CLASS/COLOR` maps. Backend `improving`→"Reversing", `resolved`→"Reversed"; histopath `progressing`→"Worsening", `anomaly`→"New in recovery"~~
- **Resolved:**
  - ~~**SLA-15:** CL recovery `MIN_RECOVERY_N` guard~~ — implemented, `insufficient_n` verdict for rec_n<3
  - ~~**SLA-16:** Corroboration direction coherence~~ — implemented, `partially_corroborated` status for directional incoherence
- ~~**Partial gaps — "accessor migration sweep" (batch as single task):**~~
  - ~~**SLA-01:** `NoaelDecisionView.tsx` domain-aware "Max |d|/avg sev" label + endpoint tooltips~~
  - ~~**SLA-01:** `NoaelDeterminationView.tsx` endpoint tooltips with `effectSizeLabel(domain)`~~
  - ~~**SLA-06:** `DoseResponseView.tsx` `computeSignalScore()` zeros effect part for non-continuous; `computeStrength()` uses p-value-driven levels for categorical~~
  - ~~**SLA-06:** `DoseResponseView.tsx` volcano scatter imports `INCIDENCE_DOMAINS` from domain-types~~
  - ~~**SLA-12:** `OrganRailMode.tsx` severity filter uses `CONTINUOUS_DOMAINS` instead of local `HISTO_DOMAINS`~~
  - ~~**SLA-13:** DR view + FindingsTable effect cells have domain-aware tooltips via `effectSizeLabel(domain)`; DoseResponseEndpointPicker guards `|d|` display with `CONTINUOUS_DOMAINS`~~
  - ~~**Phase 0 migration:** Key display callsites migrated (DoseResponseEndpointPicker, FindingsTable, NoaelDecision/Determination, OrganRailMode)~~
- ~~**Medium priority — next sprint:**~~
  - ~~**SLA-01 organ-level aggregate:** `deriveOrganSummaries()` now tracks separate `maxCohensD` (continuous) and `maxSeverity` (MI) instead of mixed `maxEffectSize`. Organ headers show metric-appropriate labels. Local duplicate in NoaelDecisionView removed (imports shared version).~~
- ~~**Other partial gaps (lower priority):**~~
  - ~~**SLA-02 frontend:** `computeEndpointSignal()` now boosts pValueWeight (×1.25) and patternWeight (×1.15) for incidence domains, compensating for missing effectWeight~~
  - ~~**SLA-07:** `deriveMagnitudeLevel()` uses `Math.floor(maxGrade)` (conservative) instead of `Math.round()`. `formatMagnitudeLevel()` exported for fractional display (e.g., "minimal–mild" for 1.7)~~
- **Status:** ~~Open~~ All 19/19 SLA findings resolved
- **Priority:** ~~P2~~ Resolved
- **Owner hint:** ~~backend-dev (SLA-18), frontend-dev (SLA-09, organ aggregate, SLA-02/07)~~

### ~~GAP-73: Rename `cohens_d` / `maxCohensD` field names to reflect Hedges' g~~ ✅ c352242
- **Files:** `backend/` (pairwise entries use `cohens_d` field), `frontend/src/types/analysis.ts`, `frontend/src/lib/derive-summaries.ts` (`maxCohensD`), `frontend/src/lib/domain-types.ts`, and ~50+ consumers
- **Issue:** The `cohens_d` field name is a legacy misnomer — values are Hedges' g by default (the small-sample-corrected variant). Labels and comments were fixed (commit TBD), but the structural field names remain `cohens_d` / `maxCohensD` throughout backend JSON output and frontend types. Renaming requires coordinated backend JSON + frontend type + all consumer changes.
- **Status:** ~~Open~~ Fixed — `cohens_d` → `effect_size` across 44 files (backend schema, all domain finders, generators, tests, frontend types, test fixtures, generated JSON). Function `cohens_d()` → `compute_effect_size()`. `fe_cohens_d` → `fe_effect_size`. Knowledge docs, system specs, portability spec updated.
- **Priority:** P3 — cosmetic correctness, no runtime impact
- **Owner hint:** backend-dev + frontend-dev (coordinated rename)

### ~~GAP-74: ToxFindingForm missing from FindingsContextPanel (Phase A-3)~~ ✅
- **Spec:** `docs/incoming/view-merge-spec.md` section 5, item 4 (line 218)
- **Fix:** ToxFindingForm imported (line 29) and rendered (lines 2295-2299) in FindingsContextPanel.tsx with `systemSuggestion` wired via `deriveToxSuggestion()`.
- **Status:** ~~Open~~ Fixed

### GAP-75: Context panel header missing incremental info (Phase A-4)
- **Spec:** `docs/incoming/view-merge-spec.md` section 5, item 1 (lines 205-209)
- **Dimension:** WHAT — 0 of 4 items implemented
- **Spec quote:** "Add incremental info from D-R header: Pattern badge (PATTERN_LABELS/PATTERN_BG). Compact metrics (trend p, min p, max |d|, data type) if not redundant with VerdictPane. Assessment status badge. NOAEL indicator."
- **Actual:** ContextPanelHeader renders only title (finding name) and subtitle (domain | day). No pattern badge, no metrics, no assessment status, no NOAEL. Data is available in scope (`selectedFinding.dose_response_pattern`, `noael` from useEffectiveNoael).
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx:1300-1310`
- **Status:** Open
- **Priority:** P2 — informational, doesn't block functionality
- **Owner hint:** frontend-dev + ux-designer (decide which items to show)

### GAP-76: InsightsList filters organ only, not domain prefix (Phase A-2)
- **Spec:** `docs/incoming/view-merge-spec.md` section 5, item 6 (lines 220-223)
- **Dimension:** WHAT — partial filtering
- **Spec quote:** "Rule-based insights filtered by organ system + domain prefix."
- **Actual:** FindingsContextPanel.tsx line 1661 filters `ruleResults.filter(r => r.organ_system === selectedFinding.organ_system)` — organ only, no domain prefix. Reference: DoseResponseContextPanel.tsx lines 64-72 shows correct dual filter (organ_system OR domain prefix match).
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx:1661`
- **Status:** Open
- **Priority:** P2 — may show extra rules but not incorrect
- **Owner hint:** frontend-dev

### GAP-77: FindingsContextPanel pane ordering deviates from spec
- **Spec:** `docs/incoming/view-merge-spec.md` section 5, lines 203-235
- **Dimension:** WHEN — pane ordering mismatch
- **Spec target order:** Header → Verdict → CausalityWorksheet → ToxFindingForm → EvidencePane → InsightsList → DoseDetailPane → ...
- **Actual order:** Header → Verdict → CausalityWorksheet → DoseDetailPane → TimeCourse → Distribution → Recovery → EvidencePane → InsightsList → ...
- **Issue:** DoseDetailPane comes before EvidencePane+InsightsList instead of after. ToxFindingForm missing entirely (see GAP-74). Requires user decision on whether spec ordering or current ordering is preferred.
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx:1355-1666`
- **Status:** Open — needs user decision
- **Priority:** P3 — UX preference, not a bug
- **Owner hint:** ux-designer

### GAP-78: Timepoint toggle (Terminal/Peak/Recovery) not in context panel
- **Spec:** `docs/incoming/view-merge-spec.md` section 6, line 265
- **Dimension:** WHAT — feature not implemented
- **Spec quote:** "Timepoint toggle: Terminal / Peak / Recovery — consistent with central panel D-R charts."
- **Actual:** TimeCoursePane uses `hoveredDay ?? terminalDay` with no toggle. Not included in Phase B spec — may be Phase C scope.
- **Files:** `frontend/src/components/analysis/panes/TimeCoursePane.tsx`
- **Status:** Open — confirm if deferred to Phase C
- **Priority:** P3 — enhancement, hover already serves as ad-hoc toggle
- **Owner hint:** frontend-dev

### GAP-79: Duplicate `shortDoseLabel()` function
- **Source:** Data reuse audit, Phase B
- **Issue:** Identical `shortDoseLabel()` function defined in both `TimeCoursePane.tsx` (lines 288-298) and `TimeCourseBarChart.tsx` (lines 79-87). Should be extracted to a shared utility (e.g., `src/lib/dose-formatting.ts`) or consolidated with existing `formatDoseShortLabel()` in severity-colors.ts.
- **Files:** `frontend/src/components/analysis/panes/TimeCoursePane.tsx`, `frontend/src/components/analysis/panes/TimeCourseBarChart.tsx`
- **Status:** Open
- **Priority:** P3 — code quality
- **Owner hint:** review

### ~~GAP-80: Causality criteria — per-sex decomposition for gradient and strength~~
- **Status:** Resolved
- **Fix:** Per-sex gradient + strength annotations in DoseDetailPane (inline after conclusions per sex). CausalityWorksheet shows F/M breakdown under gradient and strength rows. Effect size label fixed from "d" to "g" (Hedges' g). `computeBiologicalGradient` and `computeStrength` exported from CausalityWorksheet for reuse.

### GAP-81: Time-course SVG chart — add zoom and pan interactivity
- **Files:** `frontend/src/components/analysis/panes/TimeCourseLineChart.tsx`
- **Issue:** SVG chart has no zoom or pan. The previous ECharts implementation (D-R view) had built-in zoom/pan/tooltips. The custom SVG chart only has hover crosshair. Options: (a) Add SVG-native drag-to-zoom + pan via mouse events and viewBox manipulation. (b) Switch to ECharts for the context panel chart (would need resize handling for narrow pane). (c) Use a lightweight library (d3-zoom, visx).
- **Status:** Open
- **Priority:** P3 (interactivity enhancement — hover crosshair works for basic use)
- **Owner hint:** frontend-dev

### GAP-82: Time-course timepoint toggle — should filter chart data, not just default cursor
- **Files:** `frontend/src/components/analysis/panes/TimeCoursePane.tsx`
- **Issue:** The Terminal/Peak/Recovery toggle currently only changes which day the detail row defaults to when not hovering. It does NOT filter the chart to show only that timepoint's data. The spec intended it to also re-scope the chart (e.g., Recovery mode should show only recovery-period data, Peak mode should highlight/center on peak day). Current behavior is a "default cursor position" selector, not a data scope filter.
- **Status:** Open
- **Priority:** P2 (interaction model mismatch with user expectations)
- **Owner hint:** frontend-dev

### GAP-83: Recovery pooling should come from study-level settings, not chart toggle
- **Files:** `frontend/src/hooks/useRecoveryPooling.ts`, `frontend/src/components/analysis/panes/TimeCoursePane.tsx`
- **Issue:** Recovery pooling is currently a global toggle (`useRecoveryPooling` hook). Should be driven by study-level user settings on the Study Details page, not a per-chart toggle. The time-course chart should read the study-level setting rather than having its own state.
- **Status:** Open
- **Priority:** P3 (architectural — current toggle works, just wrong location)
- **Owner hint:** frontend-dev

### GAP-84: Component test harness for FindingsContextPanel
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx`, `frontend/tests/`
- **Issue:** FindingsContextPanel has 14 panes with complex cross-sex logic (header badges, verdict synthesis, recovery summary, opposite-direction callouts). Five of the six bugs found in the 2026-03-16 audit were wiring/rendering issues that only a component-level test could catch — e.g., header showing sex-specific NOAEL instead of combined, RecoveryVerdictLine only rendering one sex. Currently no way to mount the panel with mock data and assert what renders. Need a test harness that provides mock `FindingSelectionContext`, `FindingsAnalyticsContext`, `useAnnotations`, and `useFindingContext` responses, then asserts on rendered output for specific scenarios (opposite-direction endpoints, single-sex endpoints, OM normalization, recovery).
- **Status:** Open
- **Priority:** P3 (testing infrastructure — unit tests cover pure logic, this covers integration)
- **Owner hint:** frontend-dev

### ~~GAP-85: Show fold change for continuous endpoints in merged Findings view~~ ✅
- **Source:** `dose-response-view-audit.md` D-07 (archived 2026-03-17)
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx`, `frontend/src/components/analysis/FindingsTable.tsx`
- **Issue:** Fold change (treatment mean / control mean) is the most intuitive dose-response metric for toxicologists — it's how findings are discussed in study reports ("ALT elevated 3.2-fold at high dose"). The backend computes `max_fold_change` (FIELD-15) but it's never shown anywhere in the UI. Cohen's d / Hedges' g is rigorous but unfamiliar to most toxicologists.
- **Fix:** Add fold change to the dose detail pane or findings table. Can be derived: `mean / controlMean` for dose_level > 0.
- **Status:** ~~Open~~ Fixed — "Fold" column added to FindingsTable (standard + pivoted) and DoseDetailPane per-dose rows
- **Priority:** P3 (domain UX improvement)
- **Owner hint:** frontend-dev

### ~~GAP-86: Display sex divergence when significant in merged Findings view~~ ✅
- **Source:** `dose-response-view-audit.md` D-08 (archived 2026-03-17)
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx`
- **Issue:** Sex divergence (`|d_M - d_F|`) is computed in `DoseResponseView.tsx:182-206` (local `deriveEndpointSummaries`) but never displayed. Sex-specific sensitivity is critical for NOAEL determination — if a liver enzyme shows d=1.5 in females but d=0.2 in males, the NOAEL may be sex-specific. After the D-R merge, this computation and display should live in the merged context panel.
- **Fix:** Show sex divergence in the context panel header or verdict pane when |d_M - d_F| > 0.5, e.g., "Sex divergence: F >> M (|d| diff: 1.3)".
- **Status:** ~~Open~~ Fixed — callout in VerdictPane shows per-sex effect sizes when divergence > 0.5
- **Priority:** P3 (domain UX improvement)
- **Owner hint:** frontend-dev

### ~~GAP-87: Visual distinction for control group row in dose tables~~ ✅
- **Source:** `dose-response-view-audit.md` D-09 (archived 2026-03-17)
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx` (DoseDetailPane), `frontend/src/components/analysis/FindingsTable.tsx`
- **Issue:** Dose level 0 (vehicle control) is rendered identically to treatment groups in all dose tables. The control group is the reference for all comparisons — it should be visually distinct. A toxicologist scanning a dose table should immediately identify the control row.
- **Fix:** Add subtle background styling (`bg-muted/20`) or a "Vehicle" label for the control group row.
- **Status:** ~~Open~~ Fixed — `bg-muted/15` on control rows in pivoted FindingsTable and DoseDetailPane (standard mode unchanged per user decision)
- **Priority:** P3 (UX polish)
- **Owner hint:** frontend-dev

### GAP-88: Syndrome validation via cross-organ member correlations
- **Source:** `correlation-context-strategy.md` (archived 2026-03-17)
- **Files:** `backend/services/analysis/correlations.py`, `frontend/src/components/analysis/panes/SyndromeContextPanel.tsx`
- **Issue:** Syndromes are detected by rule-matching (presence/direction of member endpoints), but rule-matched ≠ biologically correlated. A syndrome whose members have high pairwise rho is strongly supported; one whose members are statistically independent may be coincidental. Summary stat: median pairwise |rho| among syndrome members. The organ-level correlation matrix (Priority 1) was implemented, but syndrome-level validation (Priority 2) is blocked on cross-organ correlation computation — current `correlations.py` only computes within-organ pairs.
- **Blocked on:** Architectural decision — lazy (on-request) vs. precomputed cross-organ correlations. Syndrome member list currently detected in frontend (`cross-domain-syndromes.ts`); precomputed approach requires partial backend detection.
- **Status:** Open (blocked on architecture decision)
- **Priority:** P3 (novel signal, non-trivial architecture)
- **Owner hint:** backend-dev

### ~~GAP-89: Peak detection for incidence endpoints should use argmin Fisher's p~~ ✅
- **Source:** `view-merge-spec.md` §4 lines 162-165 vs `view-merge-post-implementation-review.md` SD-1
- **Files:** `frontend/src/components/analysis/findings/DoseResponseChartPanel.tsx:217-220`
- **Issue:** Spec says continuous domains use `argmax |Hedges' g|` and incidence domains use `argmin Fisher's exact p-value` for peak day detection. Implementation uses `Math.abs(r.effect_size ?? 0)` for ALL data types. Low practical impact since incidence endpoints (MI, MA, CL) are almost always terminal-only — the peak toggle rarely surfaces.
- **Status:** ~~Open~~ Fixed — branch on data_type: continuous uses argmax |effect_size|, incidence uses argmin p_value
- **Priority:** P3
- **Owner hint:** frontend-dev

### ~~GAP-90: Day stepper label format reversed from spec~~ ✅
- **Source:** `view-merge-spec.md` §4 line 152 vs `view-merge-post-implementation-review.md` SD-2
- **Files:** `frontend/src/components/analysis/findings/DayStepper.tsx`
- **Issue:** ~~Spec says "Terminal (Day 92)". Implementation shows "D92 (terminal)".~~ Now matches spec: "D92 (terminal)", "D15 (peak)", "D29". Filled triangles for arrows, chevron for dropdown.
- **Status:** ~~Open~~ Resolved — DayStepper extracted to own component, format matches spec (merge-findings-dr)
- **Priority:** P3
- **Owner hint:** frontend-dev

### ~~GAP-91: Central panel tab naming and MetricsTable migration decision~~ ✅
- **Source:** `view-merge-spec.md` §3 lines 70-71, §9 vs `view-merge-post-implementation-review.md` SD-3
- **Files:** `frontend/src/components/analysis/findings/FindingsView.tsx:60-65`
- **Issue:** Spec calls for "Evidence" and "Metrics" tabs; implementation has "Chart" and "Table". The full D-R MetricsTable (TanStack, 13 columns, sex/organ/type filter bar, sig-only toggle) has NOT been migrated. FindingsTable Pivoted mode partially covers this. User decision needed: is Pivoted FindingsTable sufficient or does the full MetricsTable need migrating?
- **Status:** ~~Open~~ Fixed — tabs renamed to "Findings" / "Findings table". FilterBar removed from central panel. Death/mortality toggle moved to rail header. Pivoted FindingsTable covers metrics use case.
- **Priority:** P2
- **Owner hint:** frontend-dev / ux-designer

### ~~GAP-92: Recovery day visual distinction on D-R charts
- **Source:** `view-merge-spec.md` §4 line 160, `view-redesign-ideas.md` "Recovery visual distinction"
- **Files:** `frontend/src/components/analysis/findings/DoseResponseChartPanel.tsx:229`
- **Issue:** Spec says "different color treatment or clear header label so user can't mistake recovery D-R for main study (N is smaller, interpretation is different)." Only the dropdown label "(recovery)" distinguishes it. No color treatment, no N-warning, no visual distinction on the chart itself.
- **Status:** ~~Open~~ Fixed — recovery days removed from D-R chart stepper entirely. Recovery is told in context panel RecoveryPane + time-course subject mode (group-level recovery D-R is misleading — different cohort, different N)
- **Priority:** P3
- **Owner hint:** frontend-dev

### ~~GAP-93: Migrate D-R organ correlations to OrganContextPanel~~ ✅
- **Source:** `view-merge-spec.md` §5 item 9, `dr-findings-merge-analysis.md` G6
- **Files:** `frontend/src/components/analysis/panes/OrganContextPanel.tsx`
- **Issue:** D-R context panel showed "other endpoints in same organ system sorted by signal score" — a signal-score-ranked organ-neighbor view. Spec says migrate to OrganContextPanel. Not implemented. FindingsContextPanel CorrelationsPane shows subject-level statistical correlations (different data).
- **Status:** ~~Open~~ Closed (won't-fix — redundant with FindingsRail organ grouping; CorrelationsPane provides statistically rigorous subject-level co-variance which is more informative)
- **Priority:** P3
- **Owner hint:** frontend-dev

### ~~GAP-94: CausalityWorksheet collapsed summary badge~~ ✅
- **Source:** `dose-response-view-audit.md` UX-05
- **Files:** `frontend/src/components/analysis/panes/FindingsContextPanel.tsx:1890`
- **Issue:** When CausalityWorksheet pane is collapsed, it shows only the title "Causality assessment" — no summary of the saved determination. A toxicologist who previously assessed an endpoint can't see the result at a glance. Should show a badge like "Likely causal" or "Not assessed" in the collapsed header.
- **Status:** ~~Open~~ Fixed — `summary` prop on CollapsiblePane shows saved overall determination ("Likely causal" etc) when pane is collapsed. Reads from causal-assessment annotations.
- **Priority:** P3
- **Owner hint:** frontend-dev

### ~~GAP-95: NOAEL reference line on compact D-R charts~~ ✅
- **Source:** `dr-findings-merge-analysis.md` G11, `dose-response-view-audit.md` item 6
- **Files:** `frontend/src/components/analysis/findings/DoseResponseChartPanel.tsx:108-123`
- **Issue:** `compactify()` strips all NOAEL markLines from the central panel D-R charts. The NOAEL reference line shows WHERE the threshold sits relative to the dose-response curve — valuable for regulatory review. NOAEL text IS shown in context panel header and VerdictPane. Consider making the line optional or showing it only when chart height exceeds a threshold.
- **Status:** ~~Open~~ Closed (won't-fix — NOAEL info accessible in context panel header + VerdictPane; chart space is at a premium)
- **Priority:** P3
- **Owner hint:** frontend-dev

### GAP-96: FindingsNavGrid — flat rail table replacing nested FindingsRail (Phase D)
- **Source:** `view-merge-spec.md` §2 (archived), `view-redesign-ideas.md` (archived)
- **Files:** `frontend/src/components/analysis/findings/FindingsRail.tsx` (1400+ lines)
- **Issue:** Spec calls for a flat table/grid rail with group-by toggle (Findings/Organ/Specimen/Syndrome), replacing the current nested grouped-card layout. Columns replace badges/icons. Primary "what" is clickable blue text. Severity color-coding as cell background. Endpoint bookmarks migrated from deleted D-R EndpointPicker. Current FindingsRail works but uses collapsible nested sections instead of flat rows.
- **Status:** Open
- **Priority:** P2 (significant UX improvement, large refactor)
- **Owner hint:** frontend-dev / ux-designer

### GAP-97: Merge Pareto/volcano features into FindingsQuadrantScatter at group scope (Phase E)
- **Source:** `view-merge-spec.md` §10 (archived), `dr-findings-merge-analysis.md` G3 (archived)
- **Files:** `frontend/src/components/analysis/findings/FindingsQuadrantScatter.tsx`, `frontend/src/components/analysis/charts/dose-response-charts.ts` (buildVolcanoScatterOption)
- **Issue:** D-R view had a volcano scatter (|effect size| vs -log10(trend p), colored by organ) in the Hypotheses tab. After merge, FindingsQuadrantScatter (effect size percentile vs p-value percentile) is the sole scatter. At group scope (organ/specimen/syndrome), any unique Pareto/volcano features (organ coloring, specific axis choices) should be merged into FindingsQuadrantScatter. The D-R volcano and Findings scatter use different axes — reconcile to the most informative scheme.
- **Status:** Open
- **Priority:** P3 (enhancement, not blocking)
- **Owner hint:** frontend-dev

### GAP-98: Histopath pattern-classification.ts PATTERN_LABELS still embed direction
- **Source:** `findings-table-parity.md` post-implementation review
- **Files:** `frontend/src/lib/pattern-classification.ts` (PATTERN_LABELS, L471-479)
- **Issue:** `findings-rail-engine.ts` PATTERN_LABELS are now direction-independent (DOM-20), but `pattern-classification.ts` still uses `"Dose-dep ↑"` / `"Dose-dep ↓"`. These are separate systems (CLAUDE.md: "dual syndrome engines — do not merge"), and histopath views don't have a separate Dir column, so direction in the label is currently the only way it's shown. If histopath views later gain a Dir column, these labels should be aligned.
- **Status:** Open
- **Priority:** P4 (future alignment)
- **Owner hint:** frontend-dev

### ~~GAP-99: Stand up vitest infrastructure with seed tests for critical derive modules~~ ✅
- **Source:** Checklist audit (2026-03-21)
- **Issue:** Already existed — vitest config at `frontend/vitest.config.ts`, 54 test files in `frontend/tests/` with 1487 tests including `derive-summaries.test.ts` and `syndrome-interpretation.test.ts`. Initial audit missed them (tests live in `tests/` not `src/`).
- **Status:** ~~Open~~ Already existed

### ~~GAP-100: Contract conformance tests — validate generated JSON against BFIELD invariants~~ ✅
- **Source:** Checklist audit (2026-03-21)
- **Files:** `backend/tests/test_bfield_contracts.py`, `docs/knowledge/api-field-contracts.md`
- **Issue:** Created `test_bfield_contracts.py` — 62 tests across 11 JSON files covering all documented BFIELD invariants (types, nullability, enum values, numeric ranges, cross-field consistency). Auto-discovers studies. Found and fixed one contract drift: BFIELD-17 `scheduled_direction` includes `"none"` (undocumented).
- **Status:** ~~Open~~ Done

### ~~GAP-101: Frontend contract conformance — validate TS types match field-contracts.md~~ ✅
- **Source:** Checklist audit (2026-03-21)
- **Issue:** Already existed — `frontend/tests/field-contract-sync.test.ts` validates bidirectional coverage between `// @field FIELD-XX` annotations in source and `### FIELD-XX` headings in `field-contracts.md`. Catches undocumented fields, orphaned doc entries, and duplicates.
- **Status:** ~~Open~~ Already existed

### ~~GAP-102: React error boundaries around major view panels~~ ✅
- **Source:** Checklist audit (2026-03-21)
- **Issue:** Already covered — `RouteErrorBoundary` (App.tsx:27) wraps every lazy-loaded route via `<LazyRoute>`, and `PaneErrorBoundary` (ContextPanel.tsx:45) wraps every context panel pane via `<LazyPane>`. Both catch runtime errors (not just chunk-load failures). Sub-view granularity (table vs scatter within a view) would be over-engineering.
- **Status:** ~~Open~~ Already existed

### ~~GAP-103: Add explicit checklist items for frontend build and nullable field guards~~ ✅
- **Source:** Checklist audit (2026-03-21)
- **Files:** `docs/checklists/COMMIT-CHECKLIST.md`, `docs/checklists/POST-IMPLEMENTATION-REVIEW.md`
- **Issue:** Added: commit checklist item 9 (`npm run build`), item 10 (nullable contract field null-guard check), post-impl review Step 2a (contract field entry audit).
- **Status:** ~~Open~~ Done

### ~~GAP-104: FindingsRail specimen grouping mode (stub)~~ ✅
- **Source:** ARCH-01 discussion (2026-03-21)
- **Files:** `frontend/src/components/analysis/findings/FindingsRail.tsx`, `frontend/src/lib/findings-rail-engine.ts`
- **Issue:** "Specimen" toggle exists in rail header but is disabled (stub). Requires histopathology merge to implement properly — specimen grouping needs MI/MA specimen data propagated to endpoint summaries. Currently falls back to organ grouping in `groupKey()`.
- **Status:** ~~Open~~ Implemented as part of histopath→findings merge (Phase 1). Specimen cards show pipe (severity), domain badges, syndrome name, max incidence.
- **Priority:** P2 (required for histopath merge)
- **Owner hint:** frontend-dev

### GAP-105: FindingsRail count badges for non-endpoint grouping modes
- **Source:** ARCH-01 discussion (2026-03-21)
- **Files:** `frontend/src/components/analysis/findings/FindingsRail.tsx` (SignalSummarySection)
- **Issue:** Adverse/warning endpoint counts are shown for Endpoint grouping only. For Organ System, Specimen, and Syndrome modes, only total endpoints are shown. Need to decide what summary to display — e.g., "N organs affected", "N syndromes detected", severity breakdown per group.
- **Status:** Open — needs UX decision
- **Priority:** P3 (UX polish)
- **Owner hint:** ux-designer + frontend-dev

### GAP-106: Multi-subject comparison tab for mortality "View all"
- **Source:** ARCH-01 discussion (2026-03-21)
- **Files:** `frontend/src/components/analysis/findings/FindingsRail.tsx` (death dropdown "View all" stub)
- **Issue:** The mortality dropdown has a "View all in tab" link that is currently disabled. Should open a tab (like findings-table tab) showing SubjectProfilePanel content for all dead subjects side-by-side or stacked. Effectively a filtered multi-subject view.
- **Status:** Open
- **Priority:** P3 (enhanced mortality review)
- **Owner hint:** frontend-dev

### GAP-109: Expert override cascade — pathology review + tox assessment must feed downstream
- **Source:** Findings ↔ Histopath merge audit discussion (2026-03-24)
- **Files:** `frontend/src/components/analysis/panes/PathologyReviewForm.tsx`, `frontend/src/components/analysis/panes/ToxFindingForm.tsx`, `backend/routers/annotations.py`, `backend/routers/analysis_views.py`
- **Issue:** PathologyReviewForm and ToxFindingForm are currently decoupled annotation stores — saved data is never consumed by the analysis pipeline. This defeats their purpose: expert judgment should override algorithmic determination.
- **Required override cascade (precedence, lowest→highest):**
  1. **Algorithm** — pattern detection, statistics → initial TR, finding_class, confidence
  2. **Pattern override** — user changes dose-response pattern → re-derives TR + finding_class (already implemented)
  3. **Pathology review resolution** — changes finding data (name, severity, presence) → should update unified_findings, may change incidence/pattern/confidence
  4. **Tox assessment** — final expert call on treatment-related + adversity → overrides everything below, directly impacts NOAEL
- **Specific downstream effects:**
  - Pathology terminology resolution → updates finding record, may change finding grouping/incidence
  - Pathology severity resolution → updates severity in unified findings → affects severity matrix, adverse classification
  - Pathology presence denial → excludes finding from analysis → incidence drops, pattern may change
  - Tox TR override → finding is TR/not-TR regardless of statistical evidence → affects finding_class, confidence
  - Tox adversity override → Adverse/Non-Adverse/Adaptive → directly shifts NOAEL determination
- **Architecture:** When override saves, `analysis_views.py` should apply the full cascade (same pattern as existing `_apply_overrides()` for pattern overrides) with the precedence chain respected.
- **Status:** Open
- **Priority:** P1 (without this, the review forms are theater — the whole regulatory workflow depends on expert overrides feeding determination)
- **Owner hint:** backend-dev + frontend-dev
- **Blocked by:** None. Separate from histopath merge but should be addressed sooner rather than later.

### GAP-110: ~~Unify MI/MA recovery data source~~ → Migrate useOrganRecovery to consume backend verdicts
- **Source:** Findings ↔ Histopath merge audit discussion (2026-03-24), recovery unification proposal §7.4 (2026-03-25)
- **Files:** `frontend/src/hooks/useOrganRecovery.ts`, `frontend/src/lib/recovery-assessment.ts`, `backend/services/analysis/incidence_recovery.py`
- **Status:** PARTIALLY RESOLVED by commit `9da855e`. The backend `incidence_recovery.py` now has the full 7-guard chain (examination-aware, severity tiebreaker, all guards) matching the frontend `recovery-assessment.ts` logic. All surfaces consuming the backend endpoint (`/recovery-comparison`) get correct verdicts. However:
  - **Remaining:** `useOrganRecovery.ts` still calls `deriveRecoveryAssessments()` in the frontend (client-side computation). This creates a "dual verdict" scenario — MI/MA findings may get different verdicts in HistopathologyView (frontend) vs FindingsView (backend).
  - **Required:** Migrate `useOrganRecovery.ts` from compute-and-cache to fetch-and-cache (consume backend verdicts). Then simplify `recovery-assessment.ts` to type-exports + utilities only.
  - **Risk:** Dual verdict problem persists until this migration is complete. Both engines use the same guard chain now, so verdicts should agree for most cases, but data granularity differences (per-subject vs per-group counting) could still cause divergences.
- **Priority:** P1 (correctness — dual verdict)
- **Continuous domains** (BW/LB/OM/FW) keep the endpoint-level recovery API — it's the right computation for magnitude-based recovery.

### GAP-111: Incidence recovery confidence badge not displayed
- **Source:** Recovery unification post-implementation review (2026-03-25)
- **Files:** `frontend/src/components/analysis/panes/RecoveryPane.tsx`, `frontend/src/components/analysis/panes/IncidenceRecoveryChart.tsx`
- **Issue:** Backend `incidence_rows` include `confidence: "low" | "adequate"` field, but RecoveryPane's `IncidenceRecoverySection` does not display it. The continuous pipeline shows confidence as `*` suffix + tooltip (RecoveryDumbbellChart). Incidence pipeline should match.
- **Priority:** P3 (cosmetic — data is available, just not rendered)

### GAP-112: Anomaly discrimination uses simplified inline logic
- **Source:** Recovery unification post-implementation review (2026-03-25)
- **Files:** `frontend/src/components/analysis/panes/RecoveryPane.tsx`, `frontend/src/lib/anomaly-discrimination.ts`
- **Issue:** RecoveryPane anomaly annotation uses inline dose-dependency check + finding nature instead of calling the full `discriminateAnomaly()` function. The full function considers precursor presence, historical controls, single-animal filtering, and more. The simplified version is adequate for the context panel but does not surface the full evidence-factor analysis.
- **Priority:** P3 (enhancement — current annotation provides useful context)
- **Status:** Open
- **Priority:** P2 (data consistency — same finding shows different recovery status on different surfaces)
- **Owner hint:** backend-dev (may need to move specimen-level logic server-side) + frontend-dev
- **Blocked by:** None. Prerequisite for histopath merge but can be done independently.

### GAP-113: Support single-arm and non-standard study designs
- **Source:** Diagnosed 2026-03-25 from CBER-POC-Pilot-Study1-Vaccine_xpt_only import (4 female cynomolgus monkeys, single "Dose" arm at 20 ug/dose Hepatitis B Vaccine, no control group).
- **Files:** `backend/generator/` (pipeline assumes multi-arm + control), `backend/services/` (API assumes comparative data), frontend views (all assume ≥2 dose groups)
- **Issue:** The entire analysis pipeline requires a multi-arm dose-response design with a control group. Single-arm studies produce empty outputs across the board:
  - `study_signal_summary.json` = `[]` (signal scoring needs control comparison)
  - `adverse_effect_summary.json` = `[]` (adverse classification uses Dunnett's vs control)
  - `organ_evidence_detail.json` = `[]` (aggregates from adverse findings)
  - All 133 findings: `treatment_related: false`, `min_p_adj: null`, `direction: "none"`
  - NOAEL: "Not established" (no dose-response curve)
  - The single arm gets assigned `dose_level: 0` (control slot) since the heuristic falls back to the only group available.
  - Frontend views render empty because every view filters/sorts by signal strength, adverse flags, or statistical significance — all of which require multi-group comparison.
- **Scope of work (roadmap):**
  1. **Study design classifier** — detect single-arm, vaccine, challenge, PK-only, and other non-standard designs at import time. Store in `study_metadata_enriched.json`.
  2. **Descriptive-only analysis mode** — for single-arm studies, generate summary statistics (means, ranges, distributions, time-course profiles) without comparative tests. Skip dose-response, NOAEL, adverse classification.
  3. **Frontend descriptive views** — new view mode that shows per-endpoint summaries, time-course charts, individual animal profiles, and incidence tables without dose-group comparison columns.
  4. **Graceful degradation in existing views** — when loaded study has 1 arm, show an informational banner ("Single-arm study — comparative analysis not available") instead of empty panels.
  5. **Historical control comparison (stretch)** — allow users to supply historical control data for single-arm studies to enable limited comparative analysis.
- **Priority:** ~~P2~~ Substantially resolved
- **Status:** ~~Open~~ Addressed — adapter architecture (`93c14d3`), vaccine pipeline with SPGRPCD arm pairing + IS domain (`d9c8b95`), crossover adapter (`93c14d3`), control model normalization (`dd1f345`), study type registry (`6dfd702`), root cause audit (`6e8e399`). Non-standard designs (crossover, escalation, vaccine factorial, sex-stratified) now route through design-specific adapters. Single-arm descriptive-only mode (roadmap item 2-3) still open as stretch.
- **Owner hint:** backend-dev (remaining: single-arm descriptive mode)

### GAP-114: FindingsView view spec needs full rewrite after histopath merge
- **Source:** Post-implementation review 2026-03-25
- **Files:** `docs/views/findings.md`
- **Issue:** Views spec is STALE. Histopath merge Phases 1-5 added: specimen rail grouping, severity matrix, heat-colored MI/MA dose cells, Distribution/Temporality columns, QualifierDetailPane, LabCorrelatesPane, PeerComparisonPane, CorrelatingEvidencePane, PathologyReviewForm, specimen-level context panel. Spec doesn't describe any of these.
- **Priority:** P2 (documentation)
- **Status:** Open
- **Owner hint:** docs-agent

### GAP-115: Cohort View coverage audit for histopath merge Stage 2
- **Source:** Spec section G4/D4 GAP CHECK — must verify before deleting HistopathologyView
- **Files:** `frontend/src/components/analysis/CohortView.tsx`, `frontend/src/components/analysis/cohort/`
- **Issue:** Before Stage 2 (deleting HistopathologyView), audit Cohort View covers: (1) per-subject severity grading per finding, (2) affected-only filtering, (3) severity-graded-only filtering, (4) dose group filtering, (5) side-by-side subject comparison with finding-level detail. Log any gaps as Cohort View requirements.
- **Priority:** P2 (blocks Stage 2 of histopath merge)
- **Status:** Open
- **Owner hint:** ux-designer + frontend-dev

### GAP-116: TU (Tumor Results) supplementary domain support
- **Source:** External review audit (2026-03-25)
- **Files:** `backend/services/analysis/findings_tf.py`, `backend/generator/tumor_summary.py`
- **Issue:** TF (Tumor Findings) domain is fully implemented for tumor incidence, morphology, behavior classification, and proliferative progression detection. However, TU (Tumor Results) — a separate supplementary SEND domain containing additional tumor metadata (size, multiplicity, laterality, onset timing) — is not processed. For repeat-dose tox studies TF is sufficient, but carcinogenicity studies (≥26-week) would benefit from TU data for: (a) tumor multiplicity analysis, (b) time-to-tumor onset, (c) tumor size progression, (d) laterality tracking.
- **Status:** Open (deferred — low priority until carcinogenicity study data arrives)
- **Priority:** P3
- **Owner hint:** backend-dev

### GAP-118: IS immunogenicity panel — visual polish and feature review
- **Source:** Initial IS domain implementation (2026-03-25)
- **Files:** `frontend/src/components/analysis/findings/IsImmunogenicityPanel.tsx`, `backend/services/analysis/findings_is.py`
- **Issue:** First pass of IS immunogenicity visualization is functional but needs review for: (1) GMT kinetics chart axis scaling and label density at different timepoint counts; (2) seroconversion table color thresholds (currently hardcoded 50/90%) — may need study-specific or user-configurable thresholds; (3) CI band rendering at small N; (4) BLQ substitution strategy (currently LLOQ/2 — consider Kaplan-Meier or maximum likelihood for studies with heavy censoring); (5) LLOQ derivation when ISLLOQ is absent (currently min non-BLQ value — may underestimate); (6) epoch shading when study has many timepoints (current SVG handles 3; mockup shows 10); (7) recovery arm time-course rendering (recovery data overlays main data but is not visually distinguished); (8) context panel integration (IS findings currently show standard context pane — may need IS-specific detail pane); (9) geometric SD display (currently stored but not rendered).
- **Priority:** P3 (functional, needs polish)
- **Status:** Open
- **Owner hint:** frontend-dev + ux-designer

### ~~GAP-117: Wire `direction_of_concern` metadata into classification logic~~ ✅
- **Source:** External review audit (2026-03-25)
- **Files:** `backend/services/analysis/send_knowledge.py`, `backend/services/analysis/findings_pipeline.py`, `backend/services/analysis/confidence.py`
- **Fix:** (1) Added `get_direction_of_concern()` accessor to send_knowledge.py. (2) `_enrich_finding()` annotates each finding with `direction_of_concern` and `direction_aligns_with_concern` fields. (3) Added D7 confidence dimension: upgrades (+1) when direction aligns with concern AND treatment-related; skips when no concern direction available; never downgrades (opposite direction can still be significant). GRADE scoring now 7-dimension.
- **Status:** ~~Open~~ Fixed
- **Priority:** P3 (enrichment, not correctness)
- **Owner hint:** backend-dev

### ~~GAP-119: NOAEL view — full-study adversity heatmap~~ ✅
- **Source:** `noael-view-overhaul-audit.md` §8.2 Zone 2, §8.6
- **Files:** `frontend/src/components/analysis/noael/EvidenceChain.tsx`
- **Fix:** Added compact all-organs × doses adversity heatmap at top of Zone 2 using `getNeutralHeatColor()` severity scoring. Not interactive — visual summary only.
- **Status:** ~~Open~~ Fixed

### ~~GAP-120: NOAEL EvidenceChain — recovery badge on organ header~~ ✅
- **Source:** `noael-view-overhaul-audit.md` §8.2 Zone 2
- **Files:** `frontend/src/components/analysis/noael/EvidenceChain.tsx`, `frontend/src/components/analysis/NoaelDeterminationView.tsx`
- **Fix:** Added `recoveryByOrgan` prop derived from `useRecoveryVerdicts` hook (recovery-verdicts JSON). Shows verdict arrow + label badge on organ headers.
- **Status:** ~~Open~~ Fixed

### ~~GAP-121: NOAEL context panel — Related views links incomplete~~ ✅
- **Source:** `noael-view-overhaul-audit.md` §8.5 "Keep — cross-view navigation"
- **Files:** `frontend/src/components/analysis/panes/NoaelContextPanel.tsx`
- **Fix:** Added Related views pane (CollapsiblePane, default closed) with links to Findings, Histopathology, Study Summary in organ mode; Findings + Study Summary in study-level mode.
- **Status:** ~~Open~~ Fixed

---

## Resolved This Session (2026-03-25)

- ~~**GAP-104: FindingsRail specimen grouping mode**~~ — Implemented as histopath merge Phase 1. Specimen cards with pipe, domain text, syndrome, max incidence.
- Histopath merge Phases 1-5: rail specimen mode, table MI/MA awareness, severity matrix, polymorphic context panel panes, specimen-level context panel.

## Resolved Prior Session (2026-03-20)

- ~~**PERF-01: DoseResponseChartPanel O(N*D) flatten**~~ — Pre-filter to selected endpoint before flattening. `fbae9ed`
- ~~**PERF-02: FindingsTable unconditional pivotedRows + hasCl dep**~~ — Skip pivotedRows in standard mode; extract hasCl boolean from columns useMemo. `fbae9ed`
- ~~**PERF-03: FindingsView data→callback→event-bus cascade**~~ — Use ref for data in handleEndpointSelect. `fbae9ed`
- ~~**PERF-04: FindingsContextPanel unmemoized NOAEL derivation**~~ — Wrap in useMemo. `fbae9ed`
- ~~**PERF-05: Triple-redundant analytics derivation (3-5x)**~~ — FindingsAnalyticsLayer in Layout provides single derivation via context. `591855e`
- ~~**PERF-06: Unmemoized sparkline SVG cells**~~ — Extract SparklineCell as React.memo component. `591855e`
- ~~**PERF-07: No table virtualization (418 std / 1672 pivoted rows)**~~ — @tanstack/react-virtual with spacer-row pattern. `b11c108`, `569f630`, `2823f24`

### ~~GAP-107: CL onset day derivation + body-system grouping (backend pipeline)~~ ✅

Implemented: `raw_subject_onset_days` per CL finding in `findings_cl.py`, `cl_body_system` classification (CNS/GI/integument/general), `organ_name` override in `domain_stats.py`. Frontend uses onset days in cohort evidence table CL cells.

### ~~GAP-108: SubjectProfilePanel "View dose group cohort" entry point~~ ✅

Implemented: "View dose group cohort" text link in SubjectProfilePanel subtitle, navigates to `/studies/:studyId/cohort?preset=all&dose=N`. User approved frozen design change.

### GAP-121: Tooltip pattern decision — CSS hover popover vs native title
- **Source:** HCD info tooltip implementation (2026-03-26)
- **Issue:** CSS hover popovers enable structured content (headings, lists, controlled width) but lack keyboard/screen-reader access and don't work on touch. Native `title` is accessible but single-line only. Need to decide: (a) CSS hover for all structured tooltips, native for single-line hints, or (b) a proper accessible tooltip component (Radix/Floating UI). Desktop-only app reduces touch concern.
- **Priority:** P3 (UX pattern decision)
- **Status:** Open — user deciding
- **Owner hint:** ux-designer

### GAP-122: Exact permutation-based JT test for small samples
- **What:** `trend_test()` in `backend/services/analysis/statistics.py` always uses the normal approximation for the Jonckheere-Terpstra p-value. For small sample sizes (e.g., n_i < 5 or total N < ~20), the approximation may be inaccurate. Add an exact permutation-based JT test and a sample-size threshold that switches between the two methods.
- **Files:** `backend/services/analysis/statistics.py`, `backend/generator/domain_stats.py`
- **Owner:** backend-dev
- **Priority:** Low — typical SEND group sizes (5–15/group) are adequate for the approximation; matters for unusually small studies.

### GAP-123: Signal scoring blind spots — clinical significance and sex concordance/divergence
- **What:** Two features the UI prominently displays (S2/S3/S4 clinical badges, F≠M sex divergence) contribute zero points to the signal score when the endpoint already has moderate-to-strong statistical evidence. The clinical floor (`Math.max`) is invisible above the floor value; sex divergence has no additive scoring weight. Regulatory science says clinical significance takes precedence over statistical significance, and cross-sex concordance is an explicit WoE factor — current system inverts both hierarchies.
- **Research:** `docs/deep-research/signal-scoring-sex-divergence-clinical-significance.md` (preliminary + routing spec), `docs/deep-research/Organ-specific sex concordance scoring for rat toxicology signals.md` (deep research — 16 organ bands with literature-backed boost values)
- **Scope:** Two independent changes:
  1. **Clinical significance additive boost.** Convert floor-only to hybrid floor + additive: S2 +2, S3 +3, S4 +5 added to base score. Floor remains as safety net.
  2. **Organ-specific sex concordance/divergence scoring.** 16 organ bands with calibrated boosts (concordance 1.0–2.0, divergence 0.3–1.8). Routing priority: specimen → domain+testcd → organ_system fallback. Key split: LB hematologic → HEMATOPOIETIC (conc 1.8, div 0.5) vs MI bone marrow → BONE_MARROW (conc 1.2, div 1.5). Static data in `shared/organ-sex-concordance-bands.json`.
- **Files:** `frontend/src/lib/findings-rail-engine.ts` (scoring formula), `frontend/src/hooks/useFindingsAnalyticsLocal.ts` (boost pipeline + routing), `frontend/src/lib/lab-clinical-catalog.ts` (additive export), `frontend/src/lib/derive-summaries.ts` (propagate specimen/testCode), `shared/organ-sex-concordance-bands.json` (new — static organ band data), `frontend/src/lib/organ-sex-concordance.ts` (new — routing logic)
- **Owner:** frontend-dev + ux-designer (scoring design review)
- **Priority:** ~~P2~~ Resolved
- **Status:** ~~In progress~~ Done — clinical additive (`getClinicalAdditive` in lab-clinical-catalog.ts), organ-specific sex concordance (`getSexConcordanceBoost` in organ-sex-concordance.ts), 14 organ bands in `shared/organ-sex-concordance-bands.json`, boost pipeline wired in `useFindingsAnalyticsLocal.ts`, 500 lines of tests. Other species (mouse, dog, NHP) deferred to follow-up.

### GAP-124: Automated vs expert assessment comparison report [Area: Validation]
- **Source:** User requirement, customer feedback
- **What:** Generate a structured side-by-side report comparing SENDEX automated analysis against expert manual analysis. Per-organ table: automated column (LB, OM, MI findings with severity) vs expert manual column. Concordance summary. Stage 1: single study. Stage 2: cross-study (blocked on HC-03).
- **Why:** Builds regulatory confidence in tool output. Customers and reviewers need to see where the tool agrees/disagrees with expert judgment before trusting it.
- **Depends on:** Findings export by organ system API (new endpoint needed)
- **Status:** Open
- **Priority:** P2 (confidence-building, customer-requested)
- **Owner hint:** backend-dev (export API) + frontend-dev (comparison UI)

### GAP-125: Per-dose aggregated data export for manual report comparison [Area: Validation]
- **Source:** Customer request
- **What:** Export per-dose-group aggregated data (group means, SDs, N, incidence rates, p-values) in a format matching manual regulatory report tables. CSV/Excel output: one sheet per domain, rows = endpoints, columns = dose groups, cells = mean +/- SD (n) or incidence % with p-value.
- **Why:** Customers want to verify tool numbers match their manual calculations before trusting it for submissions. Also useful as draft data source for report writing.
- **Depends on:** None (data is already computed, needs export formatting)
- **Status:** Open
- **Priority:** P2 (customer-requested)
- **Owner hint:** backend-dev

### GAP-126: User-configurable severity/adversity thresholds [Area: Engine]
- **Source:** Customer demo feedback (2026-03-27)
- **What:** Customers define severity thresholds based on their clinical experience and historical data — these vary by compound class, organ, and lab. SENDEX needs a user-driven settings UI where toxicologists can configure: (a) continuous endpoint thresholds (p-value cutoff, effect size cutoff for adverse vs warning vs normal — currently hardcoded in `classification.py` as 3 modes), (b) per-TESTCD or per-organ threshold overrides (e.g., "for ALT, adverse at |d| >= 0.3 not 0.5"), (c) incidence thresholds (what % incidence is meaningful), (d) historical-data-informed defaults (if HCD says control ALT range is X-Y, derive threshold from that). Current state: `classify_severity()` has 3 threshold modes (`grade-ge-2-or-dose-dep`, `grade-ge-1`, `grade-ge-2`) selected in study settings. `ScoringParams` dataclass has some configurable weights. But no per-endpoint or per-organ threshold customization, and no way to import customer's historical thresholds.
- **Files:** `backend/services/analysis/classification.py:23-88`, `backend/services/analysis/analysis_settings.py`, `frontend/src/components/analysis/ThresholdEditor.tsx`
- **Status:** Open
- **Priority:** P2 (customer-requested, core workflow)
- **Owner hint:** backend-dev (settings schema, per-endpoint thresholds) + frontend-dev (settings UI)

### GAP-127: CDISC controlled terminology versioning and quarterly updates [Area: Data Quality]
- **Source:** Customer demo feedback (2026-03-27)
- **What:** CDISC publishes CT updates quarterly. SENDEX needs: (a) awareness of which CT version a study was built against (from TS domain TSPARMCD="SENDCTVER"), (b) ability to load and switch between CT versions, (c) backward compatibility — a study submitted with CT 2023-06-30 should validate against that version not the latest, (d) update mechanism to pull new CT packages from CDISC website. Related to MF-04 (CDISC Library integration), GAP-07 (SENDIG metadata verification), GAP-34 (INHAND harmonization), and sendigR's `xptcleaner` CT standardization.
- **Status:** Open
- **Priority:** P3 (infrastructure — important for production, not blocking prototype)
- **Owner hint:** backend-dev

### GAP-128: Chart and findings export to PPT/PDF [Area: Reporting]
- **Source:** Customer demo feedback (2026-03-27), nice-to-have
- **What:** Export charts (dose-response, time-course, volcano/quadrant, incidence, recovery) and findings tables to PowerPoint and PDF. Datagrok has native chart export; SENDEX does not. Needs: (a) SVG/PNG capture of ECharts and custom SVG charts, (b) table-to-slide formatting (findings table, NOAEL summary, organ overview), (c) PPT template with branded slides, (d) PDF generation (likely server-side via headless browser or wkhtmltopdf). Consider: batch export (all charts for an organ/study) vs individual chart export.
- **Status:** Open
- **Priority:** P3 (nice-to-have, customer-requested)
- **Owner hint:** frontend-dev (chart capture) + backend-dev (PPT/PDF generation)

### GAP-129: Cross-study threshold settings — user-defined, shared across studies [Area: Cross-Study]
- **Source:** Customer demo feedback (2026-03-27)
- **What:** When running cross-study analysis, customers want to define a single set of severity/adversity thresholds that applies consistently across all studies in the program. This means: (a) "threshold profile" concept — a named, reusable configuration (e.g., "Compound B — Rat thresholds"), (b) profile contains per-endpoint and per-organ threshold overrides, (c) profile can be applied to any study loaded in the system, (d) comparison view shows whether findings change when switching profiles. Stage 1: threshold profiles (storable, selectable per study). Stage 2: cross-study application (requires HC-03 multi-study support).
- **Depends on:** GAP-126 (per-endpoint thresholds — the building block), HC-03 (multi-study support for Stage 2)
- **Status:** ~~Stage 1 addressed~~ — `shared/profiles/` (3 named profiles), `profile-loader.ts` (deep merge + provenance), `shared/config/` (all thresholds externalized). Commits `98058a8`–`8877d52`. Stage 2 (UI for profile selection, comparison view) remains open.
- **Priority:** P3 (Stage 1 infrastructure done; Stage 2 UI + cross-study application remains)
- **Owner hint:** backend-dev (profile storage/API) + frontend-dev (profile management UI)

### ~~GAP-131: Crossover adapter — repeated-measures ANOVA omnibus test [Area: Statistics]~~ ✅
- **Resolved:** 2026-03-28. Added `repeated_measures_omnibus()` (Friedman chi-square) to `within_subject_stats.py`, wired into `anova_p` and `_design_meta.omnibus_p` for crossover findings.

### ~~GAP-132: Crossover adapter — period/carryover statistical test [Area: Statistics]~~ ✅
- **Resolved:** 2026-03-28. Added `carryover_test()` to `within_subject_stats.py` — compares vehicle-period baselines across periods via Kruskal-Wallis. Wired into `_design_meta.carryover_p`. Skipped for escalation designs (no period variation).

### ~~GAP-133: Crossover adapter — CL domain McNemar's test for paired incidence [Area: Statistics]~~ ✅
- **Resolved:** 2026-03-28. Added `mcnemar_paired_incidence()` (exact binomial) to `within_subject_stats.py`. CL crossover findings now have pairwise McNemar's tests with Holm adjustment.

### ~~GAP-134: Per-occasion baseline — EGBLFL fallback for predose detection [Area: Data Processing]~~ ✅
- **Resolved:** 2026-03-28. `_is_predose_timepoint()` now checks EGBLFL="Y" (SEND baseline flag) as Priority 1, before text matching. Auto-detects EGBLFL/VSBLFL columns.

### ~~GAP-135: Crossover adapter — study_type_config routing [Area: Architecture]~~ ✅
- **Resolved:** 2026-03-28. `select_adapter()` now reads `shared/study-types/*.json`, matches TS.STYPE against `ts_stype_values`, and uses `statistical_mode` as Priority 2 (after semicolon TRTDOS heuristic).

### GAP-130: Custom endpoint groups / "Favorites" view [Area: UX]
- **Source:** User ideation (2026-03-28)
- **What:** Let users create named groups of endpoints (any combination, across domains/organs). Existing rail grouping modes (organ, syndrome, specimen, etc.) are all computed — this would be user-curated. Open design question: what should the context panel show? The organ/syndrome panels are rich because the system knows the group's semantic meaning; a custom group has none. Ideas floated: radar chart with HCD values, dose concordance matrix, user annotation field. Needs UX exploration before committing to implementation.
- **Depends on:** Existing `endpoint-bookmarks` annotation could be extended, or new annotation schema
- **Status:** Idea — needs design exploration
- **Priority:** P4 (low value, low importance — revisit when core views are stable)
- **Owner hint:** ux-designer → frontend-dev

---

## Archived Documentation

> **D-R → Findings merge** (2026-03-18): Merge complete. 5 specs archived: dose-response-view-audit.md, view-redesign-ideas.md, dr-findings-merge-analysis.md, view-merge-spec.md, view-merge-post-implementation-review.md. D-R view deleted (DoseResponseView.tsx, DoseResponseViewWrapper.tsx, DoseResponseEndpointPicker.tsx, DoseResponseContextPanel.tsx, useDoseResponseMetrics.ts). 11 cross-view links updated. Phase D (rail flat-table) and Phase E (scatter merge) deferred as GAP-96/97.
>
> **Incoming spec audit** (2026-03-17): MANIFEST updated (8 stale entries removed, 13 active specs listed with status). Knowledge extracted to GAP-85 through GAP-88 from D-R audit and correlation strategy analysis. No specs archived — all are active reference for ongoing merge work.
>
> **TOPIC hubs** (10 files) archived to `C:/pg/archive/pcc/docs/incoming/arch-overhaul/` on 2026-03-05. Gaps extracted to GAP-28 through GAP-45. TOPIC hubs are frozen historical references per CLAUDE.md rule 7.
>
> **Spec-cleanup tracker** (`spec-cleanup-b66dfd0.md`) archived same date. 92 open items migrated to GAP-46 through GAP-55 (themed batches). Many items may be resolved in commits after 2026-02-23 — verify against code before starting work. Full detail in archived file.
>
> **All specs in `docs/incoming/`** archived same date. System specs (`docs/systems/`) are the durable layer — create when touching a subsystem (commit checklist item 8).
