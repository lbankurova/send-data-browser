# Topic Hub: Dose-Response View

**Last updated:** 2026-02-27
**Overall status:** Fully shipped. 3-tab evidence view (2,843L), 6 ECharts builders (1,065L), endpoint picker (385L), time-course with recovery boundary + CL temporal charts, Hypotheses tab (6 intents, 3 live: Shape, Pareto, Causality), Bradford Hill causality worksheet with auto-populated + expert criteria, pairwise comparison table, stat method switching, organ weight normalization-aware labels. 3 annotation schemas (tox-finding, endpoint-bookmarks, causal-assessment).

---

## What Shipped

### View Architecture (`DoseResponseView.tsx`, 2,843 lines)

The largest single view component. Layout: sticky endpoint summary header → `ViewTabBar` → tab content (Evidence / Hypotheses / Metrics).

| Tab | Cognitive mode | Content |
|-----|---------------|---------|
| **Evidence** | Confirmation | Dose-response chart + effect size chart (resizable split), time-course section, pairwise comparison table |
| **Hypotheses** | Hypothesis generation | Intent selector (favorites bar + dropdown), Shape/Pareto/Causality live, 3 placeholders |
| **Metrics** | Audit | FilterBar (sex, data type, organ, significance), sortable/resizable 13-column grid |

Hard rule: Evidence is authoritative and constrained. Hypotheses are ephemeral and cannot change conclusions (exception: Causality persists Bradford Hill assessment as annotation). Metrics shows raw data.

Endpoint selection: (1) Metrics table row click, (2) Pareto scatter chart click, (3) cross-view navigation via `location.state`. `DoseResponseEndpointPicker.tsx` (385L) exists but is **not wired** into the view — documented in view spec as intentional.

### Charts Library (`dose-response-charts.ts`, 1,065 lines)

Six pure ECharts option builders — no React, no hooks, no side-effects:

| Builder | Lines | Purpose |
|---------|-------|---------|
| `buildDoseResponseLineOption` | ~208 | Continuous data: mean ± SD line chart, per-sex series, significant-dot encoding (p<0.05 → larger dot with dark border), NOAEL reference line |
| `buildIncidenceBarOption` | ~139 | Categorical data: incidence bars by dose, sex-colored, significant bars get dark border (not red fill — preserves sex identity). Compact/scaled Y-axis toggle via `ChartModeToggle` |
| `buildEffectSizeBarOption` | ~121 | Effect size bars with d=0.5/0.8 reference lines. Y-axis metric subtitle for OM endpoints with normalization tier ≥ 2 |
| `buildCLTimecourseBarOption` | ~87 | Clinical observations temporal: day × dose stacked bars with USUBJID tooltip |
| `buildTimecourseLineOption` | ~287 | Continuous time-course: 3 Y-axis modes (absolute, % change, % vs control), dose-group-colored lines, optional subject traces (spaghetti plot), recovery boundary marker (amber dashed) |
| `buildVolcanoScatterOption` | ~153 | Pareto/volcano scatter: |effect size| vs -log10(trend p), organ-color dots via deterministic `getOrganColor()`, click to select endpoint |

### Time-Course Section

Two sub-components embedded in the Evidence tab:

**`TimecourseCharts`** (continuous endpoints) — Sex-faceted side-by-side ECharts, group mean lines per dose level, error bars (SD), optional spaghetti plot (subject traces at opacity 0.3, clickable to subject profile). Y-axis mode pills (Absolute / % change / % vs control). Recovery boundary (amber dashed) when recovery arms detected and `include_recovery` active. Data from `useTimecourseGroup` + `useTimecourseSubject` hooks.

**`CLTimecourseCharts`** (CL domain only) — Side-by-side stacked bar charts per sex, showing clinical observation counts by day × dose. Data from `useClinicalObservations` hook → `/api/studies/{studyId}/timecourse/cl`.

### Hypotheses Tab (6 intents, 3 live)

| Intent | Status | Implementation |
|--------|--------|----------------|
| Shape | Live | `ViewerPlaceholder` with config — DG line chart stand-in |
| Pareto | Live | Fully functional `VolcanoScatter` component via `buildVolcanoScatterOption()` |
| Causality | Live | Full Bradford Hill worksheet (see below) |
| Model fit | Placeholder | Requires Datagrok compute backend (scipy) |
| Correlation | Placeholder | Requires subject-level cross-endpoint data |
| Outliers | Placeholder | Requires subject-level values |

Favorites bar (pill buttons, default `["shape", "pareto"]`), right-click context menu for pin/unpin, "+" dropdown to browse tools. Session-scoped state for all Hypotheses tools except Causality.

### Bradford Hill Causality Tool

Structured worksheet for causal reasoning, the only Hypotheses tool that persists data. Two sections:

**Computed evidence** (auto-populated from existing data):

| Criterion | Data source | Score mapping |
|-----------|-------------|--------------|
| Biological gradient | Pattern + trend p | Monotonic → 4, threshold → 3, non-monotonic → 2, flat → 1, bonus +1 if p<0.01 |
| Strength | max effect size | |d|≥1.2 → 5, ≥0.8 → 4, ≥0.5 → 3, ≥0.2 → 2, <0.2 → 1 |
| Consistency | Sexes affected | Both → 4, one → 2 |
| Specificity | Distinct organ systems in signal data | 1 → 4, 2 → 3, 3 → 2, 4+ → 1 |
| Coherence | R16 rule count in organ | 3+ → 4, 1-2 → 3, 0 → 1 |

Each computed criterion has an override toggle (pencil icon → inline dropdown + justification textarea).

**Expert assessment** (toxicologist input): Temporality, Biological plausibility, Experiment, Analogy — each with dropdown, dot gauge, collapsible guidance text, and rationale textarea.

**Overall assessment**: Radio group (Likely/Possibly/Unlikely causal, Not assessed) + comment + Save button. Persisted via `causal-assessment` annotation schema.

5-dot neutral gray gauge (`DotGauge`) — no color coding. Maps to Weak/Weak-moderate/Moderate/Strong/Very strong.

### Statistical Method Switching (`stat-method-transforms.ts`, 226 lines)

Frontend-side statistical method transforms consumed by the DR view:

- `computeEffectSize()` — Cohen's d, Hedges' g (bias-corrected), Glass' delta (reference SD from control)
- `applyEffectSizeMethod()` — recompute effect sizes across all findings for selected method
- `applyMultiplicityMethod()` — Dunnett FWER or Bonferroni p-value adjustment
- `getEffectSizeLabel()` / `getEffectSizeSymbol()` — dynamic labels for chart axes
- `hasWelchPValues()` — detect Welch-corrected p-values in data

Method selection from `useStatMethods` hook. Effect size method flows through to chart headers, volcano scatter X-axis, and effect size bar chart header.

### Non-Monotonic Detection Integration

`checkNonMonotonic()` from `endpoint-confidence.ts` is imported by the view for chart annotation when a dose-response pattern shows non-monotonic behavior (DP-4). The flag renders as a visual annotation on the dose-response chart.

### Context Panel (`DoseResponseContextPanel.tsx`, 369 lines)

5-pane layout following priority: insights → stats → correlations → annotation → navigation.

| Pane | Content |
|------|---------|
| **Insights** | `InsightsList` filtered by organ_system + domain prefix, with tier count badges and tier filtering |
| **Statistics** | Dose-level breakdown table (continuous: mean/SD/N/p; categorical: N/affected/incidence/p), aggregated across sexes |
| **Correlations** | Top 10 other endpoints in same organ system by signal score, clickable for in-view navigation |
| **Tox Assessment** | `ToxFindingForm` — treatment-relatedness + adversity annotation (persisted via `tox-findings` schema) |
| **Related Views** | Cross-view links to Study Summary, Histopathology, NOAEL (all with organ_system state) |

### Endpoint Summary Derivation

`deriveEndpointSummaries()` in `derive-summaries.ts` (632L, shared with TOPIC-data-pipeline) groups `DoseResponseRow[]` by `endpoint_label` and computes: min p-value, min trend p, max effect size, dominant pattern, direction, signal score (`-log10(min_trend_p) + |max_effect_size|`), sex divergence. Results sorted by signal_score descending.

### Backend Data Pipeline

Dose-response metrics are pre-generated:

- `build_dose_response_metrics()` in `view_dataframes.py` (587L) assembles `dose_response_metrics.json` (~1,342 rows) — endpoint × dose × sex grain with mean, SD, n, incidence, p-value, effect size, pattern
- `classify_dose_response()` in `classification.py` (295L) — pattern classification (monotonic, threshold, non-monotonic, flat)
- `statistics.py` (283L) — Dunnett's test, Fisher's exact, Cochran-Armitage, Jonckheere-Terpstra
- `williams.py` (439L) — Williams' trend test implementation

Time-course endpoints in `temporal.py` (1,185L, shared):
- `GET /studies/{studyId}/timecourse/{domain}/{test_code}` — continuous time-course data (group means + optional subject-level)
- `GET /studies/{studyId}/timecourse/cl` — CL temporal bar chart data

### Annotation Schemas (3 types)

| Schema | File | Key | Persisted by |
|--------|------|-----|-------------|
| `tox-findings` | `tox_findings.json` | endpoint_label | `ToxFindingForm` in context panel |
| `endpoint-bookmarks` | `endpoint_bookmarks.json` | endpoint_label | `BookmarkStar` in endpoint picker |
| `causal-assessment` | `causal_assessment.json` | endpoint_label | Causality tool (Bradford Hill) |

### Key Commits

| Commit | Description |
|--------|-------------|
| `21789cf` | Redesign Dose-Response view: organ-grouped endpoint rail, simplified context panel |
| `93e8a57` | Polish Dose-Response and Target Organs views, enhance shared components |
| `4181435` | Recovery phases 3-5, stat method transforms, recovery endpoint fix |
| `a595c59` | Unify effect size method across normalization engine and all views |
| `7f050ef` | DP-4 non-monotonic D-R chart annotation, organ confidence on rail cards |
| `c310979` | Phase D UI — Williams' comparison panel, normalization rail indicator, metric-aware chart label |
| `e31351d` | Fix hardcoded effect size label in dose-response spec |
| `c09d95f` | Fix dose-response label shows A-1 strength not shape |

---

## What's NOT Shipped (spec vs. reality)

### Deferred by design

| ID | Item | Spec | Reason |
|----|------|------|--------|
| DR-1 | Endpoint picker not wired into view | `docs/views/dose-response.md` §Endpoint Picker | Component exists (385L) and is fully functional. Endpoint selection currently via Metrics table click, Pareto scatter click, or cross-view nav. Deliberate — not a gap. |
| DR-2 | Model fit intent | Decision 08 | Requires Datagrok compute backend for scipy curve fitting. Placeholder rendered. |
| DR-3 | Correlation intent | Decision 08 | Requires subject-level cross-endpoint data (DG DataFrame joining). Placeholder rendered. |
| DR-4 | Outliers intent | Decision 08 | Requires subject-level values. Placeholder rendered. |
| DR-5 | Scatter NOAEL color dimension | `scatter-noael-dimension-spec.md` (131L) | Warm color tint on scatter dots — also in TOPIC-noael-determination N-1. Deferred. |
| DR-6 | Keyboard navigation | View spec §Issues | No arrow-key navigation in grid or between rail items. |
| DR-7 | Export options | View spec §Issues | No chart/grid data export capability. |

### Minor gaps

| Gap | Status |
|-----|--------|
| Error bars use raw SD, not SEM | Documented in view spec §Issues. Deliberate simplification — SD is more common in tox reporting. |
| Signal score computed locally, may diverge from `study_signal_summary.json` | Documented in view spec. Local derivation via `deriveEndpointSummaries()` uses different formula than backend `_compute_signal_score()`. |
| No row cap in Metrics table — performance risk with large datasets | Not yet a problem with PointCross study size (~1,342 rows). |
| Related views pane default-closed | Users may not discover cross-view navigation links. |

---

## Roadmap

### Near-term
- Wire endpoint picker into view (DR-1) or confirm deliberate omission
- Signal score reconciliation between frontend derivation and backend `_compute_signal_score()`

### Medium-term
- Subject-level outlier detection (DR-4) — prerequisite for Correlation (DR-3)
- Scatter NOAEL color dimension (DR-5)

### Long-term
- Model fit intent (DR-2) — blocked on Datagrok compute backend
- Keyboard navigation (DR-6) — applies to all views

---

## File Map

### Specifications

| File | Role | Status |
|------|------|--------|
| `docs/views/dose-response.md` | Full view spec: 3 tabs, charts, picker, context panel, hypotheses, state management (1,228L) | CURRENT |
| `docs/incoming/arch-overhaul/pattern-classification-prototype-spec.md` | Dose-response pattern classification (950L) | IMPLEMENTED — `classification.py` |
| `docs/incoming/arch-overhaul/spec_normalization_aware_statistical_testing.md` | Normalization-aware stat testing for OM endpoints (536L) | IMPLEMENTED — metric-aware chart labels |
| `docs/incoming/arch-overhaul/spec_williams_trend_concordance.md` | Williams' trend test concordance (1,101L) | IMPLEMENTED — `williams.py` + `checkTrendConcordance()` |
| `docs/incoming/arch-overhaul/archive/scatter-noael-dimension-spec.md` | Scatter NOAEL color tint (131L) | NOT IMPLEMENTED (DR-5) |

### Decision docs

| File | Lines | Role |
|------|-------|------|
| `docs/decisions/dose-response-redesign.md` | 285 | Major redesign: organ-grouped rail → tabbed evidence |
| `docs/decisions/01-temporal-evidence-api.md` | 231 | Temporal API design (timecourse endpoints) |
| `docs/decisions/02-timecourse-tab.md` | 157 | Time-course integration into Evidence tab |
| `docs/decisions/03-spaghetti-plot.md` | 148 | Subject trace overlay design (opacity, click-to-profile) |
| `docs/decisions/05-endpoint-bookmarks.md` | 187 | Star-toggle bookmark annotation schema |
| `docs/decisions/07-clinical-observations-view.md` | 244 | CL temporal bar charts design |
| `docs/decisions/08-causal-inference-tool.md` | 146 | Bradford Hill causality worksheet design |

### Archived specs

| File | Lines | Role | Status |
|------|-------|------|--------|
| `docs/incoming/archive/dose-response-redesign.md` | 195 | Original redesign proposal | IMPLEMENTED |
| `docs/incoming/archive/design-audit-dose-response.md` | 98 | Design audit findings | ADDRESSED |
| `docs/incoming/archive/09-dr-cl-consolidation.md` | 505 | DR + CL view consolidation | IMPLEMENTED — CL integrated into time-course |

### Knowledge docs

| File | Entries | Current? |
|------|---------|----------|
| `docs/knowledge/methods-index.md` | STAT-04 (Jonckheere-Terpstra), STAT-05 (Cochran-Armitage), STAT-07 (Dunnett), STAT-12 (Hedges' g), CLASS-02 (DR Pattern Continuous), CLASS-03 (DR Pattern Incidence), CLASS-04 (Pattern Confidence), CLASS-22 (Non-Monotonic Detection), CLASS-23 (Trend Test Validity) | Yes |
| `docs/knowledge/field-contracts-index.md` | FIELD-03 (pattern confidence), FIELD-17 (pattern label), FIELD-49 (transformed effect size), FIELD-54 (non-monotonic flag), FIELD-55 (trend caveat), FIELD-60 (trend concordance) | Yes |

### System specs

| File | Dose-response sections | Current? |
|------|----------------------|----------|
| `docs/systems/data-pipeline.md` | `dose_response_metrics.json` assembly, `classify_dose_response()`, `_compute_signal_score()`, rule R03/R05/R06/R07 | Yes |
| `docs/systems/annotations.md` | `tox-findings`, `endpoint-bookmarks`, `causal-assessment` schemas | Yes |
| `docs/systems/insights-engine.md` | R03 (significant trend), R05 (monotonic), R06 (threshold), R07 (non-monotonic), R13 (severity grade increase) | Yes |

### Implementation (code)

#### Frontend — view & context panel (4 files, 3,603 lines)

| File | Lines | Role |
|------|-------|------|
| `components/analysis/DoseResponseView.tsx` | 2,843 | 3-tab evidence view, endpoint summary header, pairwise table, hypotheses tab, metrics grid, causality tool |
| `components/analysis/DoseResponseViewWrapper.tsx` | 6 | Minimal wrapper |
| `components/analysis/DoseResponseEndpointPicker.tsx` | 385 | Organ-grouped endpoint picker — **exists but not wired into view** |
| `panes/DoseResponseContextPanel.tsx` | 369 | 5-pane context panel (insights, stats, correlations, tox assessment, related views) |

#### Frontend — charts (1 file, 1,065 lines)

| File | Lines | Role |
|------|-------|------|
| `charts/dose-response-charts.ts` | 1,065 | 6 pure ECharts option builders (line, incidence bar, effect bar, CL temporal, timecourse, volcano scatter) |

#### Frontend — library (2 files, 858 lines)

| File | Lines | Role |
|------|-------|------|
| `lib/stat-method-transforms.ts` | 226 | Effect size computation (3 methods), multiplicity adjustment (2 methods), dynamic labels |
| `lib/derive-summaries.ts` | 632 | `deriveEndpointSummaries()`, `deriveOrganSummaries()`, `computeEndpointNoaelMap()` — *shared, also in TOPIC-data-pipeline* |

#### Frontend — hooks (4 files, 89 lines)

| File | Lines | Role |
|------|-------|------|
| `hooks/useDoseResponseMetrics.ts` | 11 | DR metrics fetch (React Query, 5min stale) |
| `hooks/useTimecourse.ts` | 32 | Group + subject timecourse fetches |
| `hooks/useClinicalObservations.ts` | 15 | CL temporal data fetch |
| `hooks/useEndpointBookmarks.ts` | 31 | Bookmark CRUD + toggle mutation |

#### Frontend — hooks (cross-referenced, 4 files, 437 lines)

| File | Lines | Owner |
|------|-------|-------|
| `hooks/useEffectiveNoael.ts` | 49 | TOPIC-noael-determination |
| `hooks/useStatMethods.ts` | 31 | General — stat method selection state |
| `hooks/useStudyMetadata.ts` | 10 | General — study metadata fetch (recovery arm detection) |
| `hooks/useOrganWeightNormalization.ts` | 347 | TOPIC-organ-measurements |

*Note: `useSessionState` (71L), `useAutoFitSections` (234L), `useCollapseAll` (12L) are shared utilities used by the view but owned by the shell infrastructure.*

#### Frontend — shared UI components (cross-referenced)

| File | Lines | Owner |
|------|-------|-------|
| `ui/ViewTabBar.tsx` | 52 | Shell infrastructure |
| `ui/FilterBar.tsx` | 274 | Shell infrastructure |
| `ui/ChartModeToggle.tsx` | 24 | Shell infrastructure |
| `ui/PanelResizeHandle.tsx` | 27 | Shell infrastructure |
| `ui/ViewSection.tsx` | 94 | Shell infrastructure |
| `charts/EChartsWrapper.tsx` | 118 | Shell infrastructure |
| `ui/DoseLabel.tsx` | 57 | Shell infrastructure |
| `panes/ToxFindingForm.tsx` | 182 | Annotations subsystem |
| `panes/CollapseAllButtons.tsx` | 30 | Shell infrastructure |

#### Backend — dose-response pipeline (4 files, 1,604 lines)

| File | Lines | Role |
|------|-------|------|
| `generator/view_dataframes.py` | 587 | `build_dose_response_metrics()` — pre-generates `dose_response_metrics.json` — *shared, also in TOPIC-data-pipeline* |
| `services/analysis/classification.py` | 295 | `classify_dose_response()` — pattern classification — *shared, also in TOPIC-data-pipeline* |
| `services/analysis/statistics.py` | 283 | Dunnett, Fisher, Cochran-Armitage, JT trend — *shared, also in TOPIC-data-pipeline* |
| `services/analysis/williams.py` | 439 | Williams' trend test — *shared, also in TOPIC-data-pipeline* |

#### Backend — temporal API (1 file, 1,185 lines, shared)

| File | Lines | Role |
|------|-------|------|
| `routers/temporal.py` | 1,185 | Timecourse group/subject + CL temporal endpoints (also serves histopathology subject profiles) |

#### Backend — API routing (1 file, shared)

| File | Lines | Role |
|------|-------|------|
| `routers/analysis_views.py` | 121 | Serves `dose-response-metrics` + 17 other view endpoints — *shared, also in TOPIC-data-pipeline* |

#### Tests (3 files, 752 lines)

| File | Lines | Test cases | Assertions | Coverage |
|------|-------|------------|------------|----------|
| `frontend/tests/stat-method-transforms.test.ts` | 348 | 25 | 44 | Effect size computation (3 methods), multiplicity adjustment, label generation, Welch detection |
| `frontend/tests/derive-summaries.test.ts` | 206 | 14 | 16 | Endpoint/organ summary derivation — *shared, also in TOPIC-data-pipeline* |
| `backend/tests/test_williams.py` | 198 | 17 | 30 | Williams' trend test: monotonic, non-monotonic, ties, edge cases |

### Totals

| Scope | Files | Lines |
|-------|-------|-------|
| Frontend view + context panel | 4 | 3,603 |
| Frontend charts | 1 | 1,065 |
| Frontend library (owned) | 1 | 226 |
| Frontend library (shared) | 1 | 632 |
| Frontend hooks (owned) | 4 | 89 |
| Frontend hooks (cross-referenced) | 4 | 437 |
| Backend pipeline (shared) | 4 | 1,604 |
| Backend temporal (shared) | 1 | 1,185 |
| Backend API (shared) | 1 | 121 |
| Tests | 3 | 752 |
| **Grand total (owned + shared)** | **24** | **9,714** |

*Many backend files are shared with TOPIC-data-pipeline (which owns the enrichment pipeline). `derive-summaries.ts` is shared with TOPIC-data-pipeline and TOPIC-noael-determination. `useEffectiveNoael.ts` and `useOrganWeightNormalization.ts` are shared with their respective owning TOPICs. This hub documents the view-level integration and chart/hypotheses subsystems that are unique to Dose-Response.*

### Cross-TOPIC Boundaries

| Concern | This hub | Other hubs |
|---------|----------|------------|
| View architecture (3 tabs, header, charts) | **Owns** | — |
| ECharts builders (6 functions) | **Owns** | — |
| Hypotheses tab + intents | **Owns** | — |
| Bradford Hill causality tool | **Owns** | — |
| Stat method transforms | **Owns** | — |
| Time-course section + CL temporal | **Owns** (view integration) | temporal.py shared with histopathology |
| Endpoint picker | **Owns** (unwired) | — |
| Endpoint summary derivation | Consumer | **TOPIC-data-pipeline owns** `derive-summaries.ts` |
| Dose-response pattern classification | Consumer | **TOPIC-data-pipeline owns** `classification.py` |
| Statistical tests (Dunnett, Fisher, JT) | Consumer | **TOPIC-data-pipeline owns** `statistics.py` |
| Williams' trend test | Consumer | **TOPIC-data-pipeline owns** `williams.py` |
| Non-monotonic detection | Consumer | **TOPIC-organ-measurements owns** `endpoint-confidence.ts` |
| NOAEL reference line | Consumer | **TOPIC-noael-determination owns** `useEffectiveNoael.ts` |
| OM metric-aware labels | Consumer | **TOPIC-organ-measurements owns** `useOrganWeightNormalization.ts` |
| ToxFinding annotation form | Consumer | Annotations subsystem |
| Insights/rule results | Consumer | **TOPIC-data-pipeline owns** `scores_and_rules.py` |
