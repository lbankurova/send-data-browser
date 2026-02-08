# Datagrok Plugin Implementation Plan

A phased plan for building the SEND Data Browser as a native Datagrok plugin. Derived from the design spec (send-browser-spec-p5.md, section 17), the prototype codebase (C:/pg/pcc), and the Datagrok API patterns reference (datagrok-patterns.ts).

Pattern references in this document (e.g., "Pattern #2") refer to the 27 canonical patterns defined in `C:/pg/pcc-design/datagrok-patterns.ts`.

---

## 1. Prerequisites

### What the developer needs to know

- **Datagrok plugin development.** You must be comfortable with the `DG.Package` lifecycle, `DG.TableView`, `DG.JsViewer`, info panel annotations, semantic type detectors, grid cell rendering, and the docking/layout system. The 27 patterns in `datagrok-patterns.ts` cover the complete API surface this plugin uses. Read that file end-to-end before starting.

- **SEND format basics.** SEND (Standard for Exchange of Nonclinical Data) organizes preclinical toxicology data into domains: DM (demographics), BW (body weights), LB (lab results), MI (microscopic findings), MA (macroscopic findings), OM (organ measurements), CL (clinical observations), FW (food/water consumption). Data ships as SAS Transport (.XPT) files. The spec's section 2 has the full domain inventory.

- **Statistics used in toxicology.** The pipeline computes Dunnett's test (pairwise vs. control), Jonckheere-Terpstra (dose-response trend), Fisher's exact test (incidence), Cochran-Armitage (trend for categorical), Cohen's d (effect size), and odds ratios. You do not need to implement these from scratch -- the prototype's Python scripts in `backend/generator/` and `backend/services/analysis/` have working implementations using scipy, pandas, and scikit-posthocs.

### What already exists

| Asset | Location | What it provides |
|-------|----------|-----------------|
| Design specification | `C:/pg/pcc-design/send-browser-spec-p*.md` (5 parts) | Complete spec: views, schemas, rules, info panes, viewers, annotations, phasing |
| Datagrok API patterns | `C:/pg/pcc-design/datagrok-patterns.ts` | 27 canonical patterns covering every Datagrok API surface this plugin needs |
| Working prototype | `C:/pg/pcc/` | React+FastAPI app with all 5 analysis views, context panels, rule engine, reports |
| Statistical pipeline (Python) | `C:/pg/pcc/backend/generator/` | `domain_stats.py`, `view_dataframes.py`, `scores_and_rules.py` -- real statistical computations |
| Analysis services (Python) | `C:/pg/pcc/backend/services/analysis/` | Per-domain finding extractors: `findings_lb.py`, `findings_bw.py`, `findings_mi.py`, `findings_ma.py`, `findings_om.py`, `findings_cl.py` |
| Rule engine | `C:/pg/pcc/backend/generator/scores_and_rules.py` | 16 canonical rules (R01-R16), signal scoring, adversity determination, NOAEL computation |
| Organ system mapping | `C:/pg/pcc/backend/generator/organ_map.py` | Tissue-to-system and lab-test-to-system mapping tables |
| Color schemes | `C:/pg/pcc/frontend/src/lib/severity-colors.ts` | P-value, signal score, severity, dose group, sex color functions (spec section 12.3) |
| View data schemas | `C:/pg/pcc/frontend/src/types/analysis-views.ts` | TypeScript interfaces for all 7 generated view DataFrames |
| Context panel logic | `C:/pg/pcc/frontend/src/lib/signals-panel-engine.ts`, `rule-synthesis.ts` | Rule synthesis, organ grouping, tier classification logic |
| Demo/stub inventory | `C:/pg/pcc/CLAUDE.md` (Demo/Stub section) | Complete catalog of what is real vs. demo/stub in the prototype |

### Platform validation questions (must answer first)

These 10 questions from spec section 17.2 are blockers. Answering them incorrectly leads to rework. See Phase 0 below for full treatment.

1. Can multiple TableViews be swapped while preserving state?
2. Does setting a filter on a non-active DataFrame trigger UI updates immediately?
3. Can Sticky Meta values be read into DataFrame columns reactively?
4. Does project save/restore preserve all DataFrames, viewer layouts, and metadata?
5. Does project sharing work without source file access?
6. Can Datagrok detect source file changes for re-import?
7. What is the correct pattern for cross-view navigation?
8. Can R scripts be called from TypeScript? What is the latency?
9. How does the subject view work best (expanded panel, docked panel, modal)?
10. Which built-in viewers support the heatmap configurations needed?

---

## 2. Phase 0: Platform Validation (2-3 days)

**Goal:** Confirm that the spec's architectural assumptions hold in Datagrok. Write a small test plugin that exercises each question. Document answers. Adjust the spec where answers diverge from assumptions.

**Deliverable:** A validation report with answers and spec adjustments.

### Question 1: TableView state preservation during view switching

- **The question:** Can multiple TableViews be swapped in/out of `grok.shell` while preserving state (filters, scroll position, selection)?
- **What the prototype does instead:** React Router with independent component state. Each view is a React component that mounts/unmounts. State is preserved in React Context (`SignalSelectionContext`, `ViewSelectionContext`, `FindingSelectionContext`) so it survives navigation. The prototype never has to swap views in a shared shell.
- **Why the answer matters:** The spec's navigation model (section 7.7) assumes 6+ views (5 analysis + validation + domain views) can be switched via the toolbox tree. If TableViews lose state on swap, the user loses their filter/selection context when drilling between views -- destroying the core workflow of "scan summary, drill into dose-response, check target organs."
- **What changes if "no":** Use a single-view architecture with a tab control (Pattern #13, `ui.tabControl`) to switch content within one persistent TableView. Alternatively, use `grok.shell.dockElement` (Pattern #12) to show/hide panels instead of swapping entire views. This is a significant layout redesign.

### Question 2: Filter behavior on non-active DataFrames

- **The question:** Does setting a filter on a non-active DataFrame trigger UI updates immediately, or only when the view becomes active?
- **What the prototype does instead:** Each view component fetches and filters its own data independently. Cross-view navigation passes filter parameters via URL query strings (e.g., `/dose-response?endpoint=ALT&sex=F`). The target view applies the filter on mount.
- **Why the answer matters:** Cross-view links are a core interaction (section 11.10). When a user clicks "View in dose-response" in View 1's context panel, the spec requires: (1) switch to View 2, (2) apply filter for that endpoint. If filters set before switching are lost or deferred, the user sees unfiltered data momentarily.
- **What changes if "no":** Apply filters after view switch completes, with a loading state. Alternatively, use `DG.debounce` (Pattern #20) on the filter application and subscribe to `grok.events.onCurrentViewChanged` to trigger filter application when the target view becomes active.

### Question 3: Sticky Meta reactive binding

- **The question:** Can Sticky Meta values be read into DataFrame columns reactively (event-driven)? Or only at construction time?
- **What the prototype does instead:** Annotations are stored via a REST API (`backend/routers/annotations.py`) as JSON files. The frontend reads them with React Query hooks (`useAnnotations()`, `useSaveAnnotation()`) and renders them in context panel forms. When a user changes a ToxFinding annotation, the React state updates immediately; grid cells re-render via React's normal update cycle.
- **Why the answer matters:** Section 13.6 specifies that annotation changes must propagate to derived DataFrames and rules. If a toxicologist marks a finding as "not treatment-related," the signal scores, NOAEL confidence, and rule outputs should update. If Sticky Meta is construction-time only, annotation changes require rebuilding DataFrames.
- **What changes if "no":** Implement a manual refresh mechanism: after annotation changes, show a "Recalculate" button that triggers recomputation of derived columns and rule evaluation. This is acceptable but less fluid. The prototype's signals-panel-engine.ts and rule-synthesis.ts logic would need to be callable on demand.

### Question 4: Project save/restore completeness

- **The question:** Does project save/restore preserve all DataFrames, viewer layouts, grid configurations, and project metadata?
- **What the prototype does instead:** No project save. All state is ephemeral (lost on page reload) except annotations, which persist via the REST API to JSON files. The prototype relies on the generator having already pre-computed all analysis data.
- **Why the answer matters:** Section 16 specifies full project persistence: raw domain data, derived DataFrames, viewer layouts, grid column order/width/visibility, annotations, NOAEL overrides. If Datagrok does not preserve some of these automatically, the plugin must implement custom serialization.
- **What changes if "no" (partial save):** Identify what IS preserved automatically. Implement custom serialization (JSON in project metadata) for anything that is not. Priority: (1) DataFrames and their columns, (2) viewer configurations, (3) annotations. If viewer layouts are not preserved, store layout descriptions as JSON and rebuild on restore.

### Question 5: Project sharing without source file access

- **The question:** Does project sharing preserve data and layouts for recipients? What happens when the recipient cannot access the source .XPT path?
- **What the prototype does instead:** No sharing capability. The prototype is single-user, single-machine.
- **Why the answer matters:** Section 16.6. Toxicology studies involve cross-functional review (study director, pathologist, statistician). If sharing requires the recipient to have the same file system paths, the feature is nearly useless in practice.
- **What changes if "no":** Sharing becomes "export project file" rather than live collaboration. Alternatively, store all data within the project (not as file references) so the project is self-contained. This increases project file size but eliminates path dependency.

### Question 6: Source file change detection

- **The question:** Can Datagrok detect source file changes and trigger re-import?
- **What the prototype does instead:** The backend has file-based caching in `backend/services/xpt_processor.py` that checks XPT file mtimes. If files change, the cache is invalidated and data is reloaded. But this is a backend mechanism, not a Datagrok platform feature.
- **Why the answer matters:** Section 3.3, section 16.5. Studies may be updated (corrections, new data). If the platform cannot detect changes, the user must manually trigger re-import.
- **What changes if "no":** Add a manual "Re-import" button (ribbon or toolbox). Remove any auto-sync language from the UX. This is the simpler path and is recommended even if detection is possible, since automatic re-import could disrupt an in-progress analysis.

### Question 7: Cross-view navigation pattern

- **The question:** What is the correct implementation pattern for cross-view navigation (info pane link switches view AND applies filter)?
- **What the prototype does instead:** React Router `navigate()` with query parameters. The browsing tree component (`BrowsingTree`) handles URL-based navigation. Cross-view links in context panels call `navigate(`/studies/${studyId}/dose-response?endpoint=${endpointId}`)`. The target view reads query params on mount and applies them.
- **Why the answer matters:** This is the most frequently used interaction in the prototype. Every context panel in every view has "View in..." links. Getting this pattern wrong affects every info pane (section 11.10).
- **What changes if "no" (no clean pattern exists):** Build a custom navigation service: a singleton that manages (1) target view name, (2) pending filter state, (3) callback after view switch. Each view subscribes to this service and applies pending filters on activation. This is more code but very reliable.

### Question 8: R script availability and latency

- **The question:** Can R scripts be called from the TypeScript layer? What is the latency?
- **What the prototype does instead:** All statistics are computed in Python (scipy, pandas, scikit-posthocs) during the generation step. The frontend receives pre-computed results. No runtime statistical computation occurs.
- **Why the answer matters:** Section 9.8. Some statistical tests (Dunnett's, Jonckheere-Terpstra) are natively available in R packages (multcomp, DescTools) but may not have JavaScript equivalents. If R is available with acceptable latency (<2 seconds for a typical study), statistics can run server-side in R. If not, a Python microservice or JavaScript statistics library is needed.
- **What changes if "no":** Keep the Python statistical pipeline. Deploy it as a Datagrok script or external microservice. The prototype's `backend/generator/domain_stats.py` and `backend/services/analysis/statistics.py` contain all the statistical logic and can be reused directly. Alternatively, port critical tests to JavaScript using jStat or simple-statistics.

### Question 9: Subject view implementation

- **The question:** How does the subject view work best -- expanded context panel, docked side panel, or modal overlay?
- **What the prototype does instead:** No dedicated subject view. Subject details appear in context panel panes when a USUBJID cell is clicked. The prototype does not have the timeline/profile visualization described in section 7.5.
- **Why the answer matters:** The subject view shows all findings for one animal across all domains and timepoints -- a "patient chart" equivalent. It needs enough space for a timeline chart + BW curve + findings table. This does not fit in a standard context panel width.
- **What changes based on answer:** If expanded context panel works, use it (simplest). If not, a docked panel (Pattern #12, `grok.shell.dockElement` with 'right', 0.5) gives more space. Modal overlay is the fallback but breaks the "everything visible" Datagrok philosophy. Recommend testing docked panel first.

### Question 10: Built-in viewer support for heatmaps

- **The question:** What built-in viewer types support the heatmap configurations needed (pivot grid, custom cell text, row grouping)?
- **What the prototype does instead:** The signal heatmap (`OrganGroupedHeatmap.tsx`) is a fully custom React component: organ-grouped collapsible rows, endpoint x dose cells colored by signal score, significance stars overlaid. The severity heatmap is also custom. Neither uses a standard charting library.
- **Why the answer matters:** Section 12.4 (signal heatmap), 12.6 (organ evidence matrix), 12.7 (severity heatmap), 12.8 (adversity matrix) all require pivot-style heatmaps. If Datagrok's built-in Grid or HeatMap viewer can handle these with cell color coding and grouping, that saves building 3-4 custom JsViewers.
- **What changes if "no" (built-in insufficient):** Build custom JsViewers (Pattern #21) for: (1) SignalHeatmapViewer, (2) SeverityHeatmapViewer, (3) DoseResponseViewer, (4) DoseLadderViewer. Each follows the `DG.JsViewer` subclass pattern with `onTableAttached`, `render`, selection/filter subscriptions. The prototype's React components provide the exact rendering logic to port. Estimate: 1-2 days per custom viewer.

---

## 3. Phase 1A: Import + Validate + Browse (Foundation)

**Goal:** A user can import a SEND study, see validation results, browse raw domain tables, and save/reopen the project. No analysis views yet.

**Spec reference:** Section 17.3.

**Estimated total effort:** Medium (1-2 weeks for experienced Datagrok developer).

### Datagrok APIs required

| API Surface | Pattern # | Usage |
|-------------|-----------|-------|
| Package boilerplate | #1 | Plugin entry point, `_package` resource access |
| DataFrame creation | #2 | Loading .XPT data into DG.DataFrames, creating validation_results DataFrame |
| TableView | #3 | Domain table browsing views |
| Filters | #5 | Domain filters (column-based), validation filters (severity, domain) |
| Info panels (annotation) | #6 | Semantic-type-triggered panels for USUBJID, domain columns |
| Accordion | #8 | Context panel sections, toolbox navigation |
| Toolbox | #9 | Study tree: domains list, actions |
| Ribbon | #10 | Study name display, import/export actions |
| Tree view | #16 | Domain navigation tree |
| Notifications | #17 | Import progress, validation results summary |
| Semantic type detectors | #22 | 8 detectors: SubjectId, DomainCode, TestCode, SiteCode, FindingTerm, SeverityGrade, DoseGroup, VisitDay |
| Grid customization | #23 | Color-coded cells for validation severity, domain semantic types |
| Progress indicator | #24 | Import progress, validation progress |
| File I/O | #26 | Loading .XPT files from Datagrok file system |
| Column manager | #27 | Hide internal columns, set display order per domain |

### Python scripts to port or invoke

| Script | Location | What it does | Action |
|--------|----------|-------------|--------|
| `xpt_processor.py` | `backend/services/xpt_processor.py` | Reads .XPT files into pandas DataFrames | Port to Datagrok script (Python) or use Datagrok's built-in SAS reader if available |
| `study_discovery.py` | `backend/services/study_discovery.py` | Discovers study folders, lists .XPT files | Replace with Datagrok file browser; keep domain detection logic |
| Validation engine | `C:/pg/pcc-design/validation-engine-build-prompt.md` | SEND compliance rules (18 rules, YAML-defined) | Build per the validation engine prompt; deploy as Datagrok Python script |

### TypeScript files to create

| File | Purpose | Complexity |
|------|---------|-----------|
| `src/package.ts` | Package entry point, app registration (Pattern #1) | Small |
| `src/detectors.ts` | 8 semantic type detectors (Pattern #22) | Small |
| `src/import/import-workflow.ts` | Folder selection, .XPT loading, domain detection, standard layout | Medium |
| `src/import/domain-detector.ts` | Identify SEND domain from column names and file names | Small |
| `src/views/domain-view.ts` | Raw domain table display with standard layout, column ordering | Small |
| `src/views/validation-view.ts` | Validation results grid, filters, context panel | Medium |
| `src/panels/validation-issue-panel.ts` | Context panel for validation issue detail, fix tiers, auto-fix | Medium |
| `src/navigation/study-tree.ts` | Toolbox tree: domains, analysis views (Pattern #16) | Small |
| `src/navigation/view-manager.ts` | View switching, state preservation (depends on Phase 0 Q1 answer) | Medium |
| `src/sticky-meta/validation-issue.ts` | ValidationIssue annotation schema, status tracking | Small |
| `src/project/save-restore.ts` | Project save/restore (depends on Phase 0 Q4 answer) | Medium |
| `src/colors.ts` | Color scheme constants from spec section 12.3 | Small |

### Components table

| Component | Spec Ref | Datagrok Pattern | Est. Complexity |
|-----------|----------|-----------------|-----------------|
| Landing page (studies table + inspector) | section 5 | #3 TableView, #6 Info panels, #8 Accordion | Medium |
| Import workflow (folder select, XPT load) | section 6 | #1 Package, #24 Progress, #26 File I/O | Medium |
| Domain views (raw tables, standard layout) | section 7.6 | #3 TableView, #5 Filters, #23 Grid, #27 Columns | Small |
| Semantic type detectors (8 types) | section 4 | #22 Detectors | Small |
| Validation engine (rule evaluation) | section 8.2 | Python script (Datagrok scripting) | Large |
| Validation view (grid + filters + panel) | section 8 | #3 TableView, #5 Filters, #6/#7 Info panels | Medium |
| ValidationIssue Sticky Meta | section 13.3 | Sticky Meta API | Small |
| Project save/restore (basic) | section 16.2-16.4 | Platform API (Phase 0 Q4 dependent) | Medium |

---

## 4. Phase 1B: First Analysis View -- Study Summary (Foundation)

**Goal:** The study summary view works end-to-end: derived columns computed, signal scores calculated, rules evaluated, insights displayed, heatmap rendered.

**Spec reference:** Section 17.4.

**Estimated total effort:** Large (2-3 weeks). This phase builds the statistical pipeline, rule engine, and first complete view. Everything downstream depends on it.

### Why this phase is the hardest

Phase 1B establishes three foundational systems that every subsequent phase reuses:

1. **Statistical pipeline** -- per-domain derived columns (section 9.5) feed all view DataFrames.
2. **Rule engine** -- evaluates 16+ rules (section 10.8) that produce the insights displayed in every context panel.
3. **View rendering pattern** -- the first complete view (grid + viewers + info panes + toolbox) becomes the template for Views 2-5.

### Datagrok APIs required

| API Surface | Pattern # | Usage |
|-------------|-----------|-------|
| DataFrame manipulation | #2 | Derived columns, computed columns, DataFrame joins, filtering, selection events |
| TableView | #3 | Study summary view container |
| Viewers | #4 | Bar chart, scatter plot (supplementary charts) |
| Filters | #5 | ENDPOINT_TYPE, ORGAN_SYSTEM, SIGNAL_SCORE range, SEX |
| Info panels (annotation) | #6 | Semantic-type-triggered panels for endpoints, findings |
| Custom info panels | #7 | Rule-based insights, finding statistics, cross-domain correlations |
| Accordion | #8 | Context panel accordion with multiple panes |
| Toolbox | #9 | Analysis views navigation, quick filters |
| Ribbon | #10 | View-specific actions (export, refresh) |
| Events | #20 | `onCurrentRowChanged`, `onSelectionChanged`, `onFilterChanged` for linked updates |
| Custom JsViewer | #21 | Signal heatmap (if built-in is insufficient -- Phase 0 Q10) |
| Grid customization | #23 | P-value color coding, signal score color coding, severity colors |
| Complete view pattern | #25 | Integration pattern: join + view + ribbon + toolbox + viewers + grid events |

### Python scripts to port or invoke

| Script | Location | What it does | Action |
|--------|----------|-------------|--------|
| `domain_stats.py` | `backend/generator/domain_stats.py` | Computes all per-domain findings with statistics | Deploy as Datagrok Python script; invoke on study import |
| `findings_lb.py` | `backend/services/analysis/findings_lb.py` | Lab results: group means, Dunnett's, J-T trend, Cohen's d | Include in statistical pipeline |
| `findings_bw.py` | `backend/services/analysis/findings_bw.py` | Body weights: percent change, pairwise tests | Include in statistical pipeline |
| `findings_mi.py` | `backend/services/analysis/findings_mi.py` | Microscopic: incidence, Fisher's exact, severity scoring | Include in statistical pipeline |
| `findings_ma.py` | `backend/services/analysis/findings_ma.py` | Macroscopic: incidence, Fisher's exact | Include in statistical pipeline |
| `findings_om.py` | `backend/services/analysis/findings_om.py` | Organ measurements: group means, pairwise tests | Include in statistical pipeline |
| `findings_cl.py` | `backend/services/analysis/findings_cl.py` | Clinical observations: incidence, Fisher's exact | Include in statistical pipeline |
| `view_dataframes.py` | `backend/generator/view_dataframes.py` | Assembles 7 view DataFrames from findings | Deploy as Datagrok Python script |
| `scores_and_rules.py` | `backend/generator/scores_and_rules.py` | Rule engine (R01-R16), signal scores, adversity, NOAEL | Deploy as Datagrok Python script |
| `organ_map.py` | `backend/generator/organ_map.py` | Tissue-to-organ-system mapping | Include as data file in package |
| `dose_groups.py` | `backend/services/analysis/dose_groups.py` | Dose group mapping from DM/TX domains | Make configurable per study |
| `statistics.py` | `backend/services/analysis/statistics.py` | Statistical test implementations | Include in statistical pipeline |

### TypeScript files to create

| File | Purpose | Complexity |
|------|---------|-----------|
| `src/pipeline/pipeline-runner.ts` | Orchestrates Python script execution, manages DataFrames | Medium |
| `src/pipeline/derived-columns.ts` | Manages DM-derived columns (Dose_Group_Order, Study_Phase) | Small |
| `src/views/study-summary-view.ts` | View 1: grid + signal heatmap + target organ chart + filters | Large |
| `src/viewers/signal-heatmap.ts` | Custom JsViewer: endpoint x dose heatmap (Pattern #21) | Large |
| `src/panels/rule-insights-panel.ts` | Context panel: rule-based insights for selected endpoint | Medium |
| `src/panels/finding-statistics-panel.ts` | Context panel: signal score breakdown, p-value, effect size | Medium |
| `src/panels/cross-domain-panel.ts` | Context panel: other findings in same organ system | Medium |
| `src/panels/subject-profile-panel.ts` | Shared panel: subject details on USUBJID click | Medium |
| `src/panels/endpoint-statistics-panel.ts` | Shared panel: endpoint statistics on test code click | Small |
| `src/engine/rule-synthesis.ts` | Port of `rule-synthesis.ts` -- organ-grouped rule synthesis | Medium |
| `src/engine/signals-panel-engine.ts` | Port of `signals-panel-engine.ts` -- decision bar, organ blocks | Medium |
| `src/colors.ts` | Color scheme functions (port of `severity-colors.ts`) | Small |

### Components table

| Component | Spec Ref | Datagrok Pattern | Est. Complexity |
|-----------|----------|-----------------|-----------------|
| DM-derived columns (Dose_Group_Order, Study_Phase) | section 9.5 (DM) | Python script | Small |
| Per-domain derived columns (all domains) | section 9.5 (BW, LB, MI, MA, OM, CL, FW) | Python script | Large |
| study_signal_summary DataFrame | section 9.6 | #2 DataFrame | Medium |
| target_organ_summary DataFrame | section 9.6 | #2 DataFrame | Small |
| Organ system mapping | section 9.7 | Data file in package | Small |
| Signal score computation | section 10.7 | Python script | Medium |
| Rule engine core (evaluation, priority, conflict) | section 10.3-10.6 | Python script | Large |
| Canonical rules (study + organ scope, 5 rules) | section 10.8 | Python script | Medium |
| Study summary view (grid + viewers) | section 7.4 (View 1) | #3, #4, #5, #21, #23, #25 | Large |
| View 1 info panes | section 11.4 | #6, #7, #8 | Medium |
| View 1 viewers (heatmap, target organ) | section 12.4 | #4, #21 | Large |
| Shared info panes (subject, endpoint, finding) | section 11.3 | #6, #7 | Medium |
| Global color schemes | section 12.3 | #23 Grid customization | Small |

---

## 5. Phase 1C: Remaining Views + Annotations

**Goal:** All five analysis views operational. ToxFinding and PathologyReview annotations available. Full analysis workflow functional.

**Spec reference:** Section 17.5.

**Estimated total effort:** Large (2-3 weeks). Four views to build, but each follows the pattern established in Phase 1B. Sticky Meta integration adds complexity.

### Approach

Build views in this order: View 2 (dose-response) first because it shares the most data with View 1, then View 5 (NOAEL) because it is the workflow endpoint, then View 3 (target organs) and View 4 (histopathology) which are more independent.

---

### View 2: Dose-Response & Causality (section 7.4, 11.5, 12.5)

**What to build:** Dose-response charts that update per endpoint selection. Concordance panel. Metrics grid. ToxFinding annotation integration.

| Component | Spec Ref | Datagrok Pattern | Est. Complexity |
|-----------|----------|-----------------|-----------------|
| dose_response_metrics DataFrame | section 9.6 | #2 DataFrame | Small (already computed) |
| Dose-response view (grid + charts) | section 7.4 | #3 TableView, #4 Viewers, #5 Filters | Medium |
| Interactive dose-response chart | section 12.5 | #21 Custom JsViewer (DoseResponseViewer) | Large |
| Concordance panel | section 12.5 | #7 Custom info panel | Medium |
| View 2 info panes | section 11.5 | #6, #7, #8 Accordion | Medium |
| ToxFinding annotation form | section 13.4 | #14 Input controls, #15 Dialog, Sticky Meta | Medium |

**Python scripts:** `view_dataframes.py` (`build_dose_response_metrics`) -- already computed in Phase 1B pipeline.

**Key Datagrok patterns:** #21 (DoseResponseViewer is explicitly modeled in `datagrok-patterns.ts`), #4 (line chart, scatter plot), #20 (events for endpoint selection updates).

---

### View 5: NOAEL & Decision (section 7.4, 11.8, 12.8)

**What to build:** NOAEL banner, adversity matrix, dose ladder visualization, confidence breakdown. NOAEL override dialog.

| Component | Spec Ref | Datagrok Pattern | Est. Complexity |
|-----------|----------|-----------------|-----------------|
| adverse_effect_summary DataFrame | section 9.6 | #2 DataFrame | Small (already computed) |
| noael_summary DataFrame | section 9.6 | #2 DataFrame | Small (already computed) |
| Adversity determination logic | section 10.9 | Python script | Medium |
| NOAEL confidence score | section 10.7.4 | Python script | Small |
| Canonical rules (endpoint + NOAEL scope) | section 10.8 | Python script | Medium |
| NOAEL view (grid + dose ladder + adversity matrix) | section 7.4 | #3, #12 Docking | Medium |
| DoseLadderViewer (custom) | section 12.8 | #21 Custom JsViewer | Large |
| Adversity matrix viewer | section 12.8 | #23 Grid customization or #21 | Medium |
| NOAEL configuration dialog | section 14 | #14 Inputs, #15 Dialog | Medium |
| View 5 info panes | section 11.8 | #6, #7, #8 | Medium |

**Python scripts:** `scores_and_rules.py` (adversity logic, NOAEL confidence), `view_dataframes.py` (`build_noael_summary`, `build_adverse_effect_summary`).

---

### View 3: Target Organs & Systems (section 7.4, 11.6, 12.6)

**What to build:** Organ evidence matrix, sex comparison, convergence narrative. Multi-domain evidence aggregation.

| Component | Spec Ref | Datagrok Pattern | Est. Complexity |
|-----------|----------|-----------------|-----------------|
| organ_evidence_detail DataFrame | section 9.6 | #2 DataFrame | Small (already computed) |
| Target organs view (grid + organ matrix) | section 7.4 | #3 TableView, #5 Filters, #23 Grid | Medium |
| Organ evidence matrix viewer | section 12.6 | #21 Custom JsViewer or #23 Grid | Medium |
| Sex comparison panel | section 12.6 | #4 Viewers (bar chart) or #7 Custom panel | Small |
| View 3 info panes | section 11.6 | #6, #7, #8 | Medium |

**Python scripts:** `view_dataframes.py` (`build_organ_evidence_detail`), `organ_map.py` (system mapping).

---

### View 4: Histopathology Review (section 7.4, 11.7, 12.7)

**What to build:** Severity heatmap, grade distribution, individual animal listing. PathologyReview annotation with peer review workflow.

| Component | Spec Ref | Datagrok Pattern | Est. Complexity |
|-----------|----------|-----------------|-----------------|
| lesion_severity_summary DataFrame | section 9.6 | #2 DataFrame | Small (already computed) |
| Histopathology view (grid + severity heatmap) | section 7.4 | #3 TableView, #5 Filters | Medium |
| Interactive severity heatmap | section 12.7 | #21 Custom JsViewer (SeverityHeatmapViewer) | Large |
| Grade distribution viewer | section 12.7 | #4 Viewers (stacked bar) | Small |
| PathologyReview annotation form | section 13.5 | #14 Inputs, #15 Dialog, Sticky Meta | Medium |
| View 4 info panes | section 11.7 | #6, #7, #8 | Medium |

**Python scripts:** `view_dataframes.py` (`build_lesion_severity_summary`), `findings_mi.py` (microscopic findings extraction).

---

### Cross-cutting: Sticky Meta Integration

| Component | Spec Ref | Datagrok Pattern | Est. Complexity |
|-----------|----------|-----------------|-----------------|
| ToxFinding Sticky Meta schema | section 13.4 | Sticky Meta API | Medium |
| PathologyReview Sticky Meta schema | section 13.5 | Sticky Meta API | Medium |
| Sticky Meta to derived data propagation | section 13.6 | #20 Events (reactive binding, Phase 0 Q3 dependent) | Large |
| Annotation change triggers rule re-evaluation | section 13.6 | Python script re-invocation | Medium |

---

### Cross-cutting: Subject View

| Component | Spec Ref | Datagrok Pattern | Est. Complexity |
|-----------|----------|-----------------|-----------------|
| Subject view (animal profile/timeline) | section 7.5 | Phase 0 Q9 dependent: #12 Docking or #15 Dialog | Large |

---

### Cross-cutting: Custom JsViewers

Three custom viewers are specified in section 12.11. All follow Pattern #21.

| Viewer | Used in | Est. Complexity |
|--------|---------|-----------------|
| DoseResponseViewer | View 2 | Large |
| DoseLadderViewer | View 5 | Large |
| ConcordancePanel | View 2 | Medium |

The prototype has working rendering logic for all of these in the React components. Port the rendering (data extraction, layout, color mapping) into `DG.JsViewer.render()` implementations.

---

## 6. Phase 1D: Reports + Polish

**Goal:** Phase 1 complete. Reports exportable. UX polished. Performance validated.

**Spec reference:** Section 17.6.

**Estimated total effort:** Medium (1-2 weeks).

### Datagrok APIs required

| API Surface | Pattern # | Usage |
|-------------|-----------|-------|
| Ribbon | #10 | Export/report buttons |
| Dialogs | #15 | Export format selection, report options |
| Notifications | #17 | Report generation status |
| Progress indicator | #24 | Report generation progress |
| File I/O | #26 | Reading report templates |

### Components table

| Component | Spec Ref | Datagrok Pattern | Est. Complexity |
|-----------|----------|-----------------|-----------------|
| Study summary report (PDF + HTML) | section 15.3 | #15 Dialog, #24 Progress | Large |
| NOAEL justification memo (PDF) | section 15.6 | Report template + PDF generation | Medium |
| Validation report export (PDF, Excel, CSV, HTML) | section 8.8 | Export utilities | Medium |
| Finding-level export (Excel, CSV) | section 15.2 | DataFrame export (built-in) | Small |
| Report generation mechanism (HTML template to PDF) | section 15.4 | Datagrok scripting or external renderer (Phase 0 Q8/Q12 dependent) | Large |
| Landing page refinements (key findings, NOAEL display) | section 5 | #6 Info panels, #8 Accordion | Small |
| Performance optimization | section 9.8 | Profiling, caching, batch processing | Medium |
| Edge case handling (empty domains, single-dose, missing data) | Throughout | Defensive coding | Medium |

### Python scripts

| Script | Purpose | Action |
|--------|---------|--------|
| Report template engine | HTML generation with study data | New: build as Datagrok Python script or use TypeScript template |
| PDF renderer | HTML to PDF conversion | Evaluate: Datagrok built-in, headless Chromium, wkhtmltopdf |

### TypeScript files to create

| File | Purpose | Complexity |
|------|---------|-----------|
| `src/reports/report-generator.ts` | Orchestrates report generation (port of `report-generator.ts`) | Large |
| `src/reports/study-summary-report.ts` | Study summary report template (9 sections per spec 15.3) | Medium |
| `src/reports/noael-memo.ts` | NOAEL justification memo template | Small |
| `src/reports/validation-report.ts` | Validation report template | Small |
| `src/export/data-export.ts` | DataFrame to CSV/Excel export utilities | Small |

### What to port from the prototype

The prototype's `C:/pg/pcc/frontend/src/lib/report-generator.ts` generates standalone HTML reports by fetching all data and building a complete document. The same approach works in Datagrok: read DataFrames, build HTML, render to PDF. The template structure and section content translate directly.

---

## 7. Phase Summary

| Phase | Scope | Depends On | Key Datagrok APIs | Est. Complexity |
|-------|-------|-----------|-------------------|-----------------|
| 0 | Platform validation (10 questions) | Nothing | Shell, TableView, Sticky Meta, project save, viewers | Small (2-3 days) |
| 1A | Import + validate + browse source data | Phase 0 answers | Package (#1), DataFrame (#2), TableView (#3), Filters (#5), Info panels (#6), Detectors (#22), Grid (#23), File I/O (#26) | Medium (1-2 weeks) |
| 1B | Study summary view end-to-end (statistical pipeline + rule engine + first view) | Phase 1A | DataFrame (#2), Viewers (#4), Custom panels (#7), Events (#20), JsViewer (#21), Complete pattern (#25) | Large (2-3 weeks) |
| 1C | Remaining 4 views + ToxFinding + PathologyReview + NOAEL + subject view | Phase 1B | JsViewer (#21, x3 custom), Inputs (#14), Dialogs (#15), Docking (#12), Events (#20) | Large (2-3 weeks) |
| 1D | Reports + export + polish + performance | Phase 1C | Dialogs (#15), Progress (#24), File I/O (#26) | Medium (1-2 weeks) |

**Total estimated timeline:** 8-12 weeks for an experienced Datagrok developer working full-time.

---

## 8. Phase 2+ Roadmap

From spec section 17.8. Ordered by priority (how many users would benefit, how much it enhances the core workflow).

### High priority (build next)

| Feature | Spec Ref | Description | Rationale |
|---------|----------|-------------|-----------|
| Historical control data | section 9 (noted as excluded) | Upload reference ranges from historical controls; compare to concurrent controls | Toxicologists frequently compare findings against historical data. Currently the tool only evaluates concurrent controls, which limits interpretation for studies with small group sizes. |
| Configurable adversity thresholds | section 10.9 TBD | User-adjustable thresholds for ADVERSE_FLAG determination | Different study types (carcinogenicity, reproductive) have different thresholds. Hard-coded defaults from Phase 1 will not suit all studies. |
| Configurable signal score weights | section 10.7 TBD | Per-study-type adjustment of signal score formula weights | A 28-day general tox study weights evidence differently than a 2-year carcinogenicity study. |

### Medium priority (enhances workflow)

| Feature | Spec Ref | Description | Rationale |
|---------|----------|-------------|-----------|
| Per-dose treatment-relatedness annotation | section 13.4 TBD | Annotate treatment-relatedness at ENDPOINT_ID x DOSE granularity | Some findings are treatment-related only at high dose. Per-finding annotation (all doses) is too coarse. |
| Report customization | section 15.5 TBD | Section selection, custom narrative, company branding | Every company has its own report format. Phase 1 fixed structure will need customization. |
| Controlled terminology for pathology | section 13.5 | INHAND/SEND vocabulary lookup for revised diagnosis | Pathologists need standardized terminology. Free text is error-prone and non-searchable. |
| Named layouts per view | section 12.11 TBD | Multiple layout presets (Standard, Pathologist focus, Statistician) | Different users focus on different data. A pathologist needs MI/MA prominence; a statistician needs p-values and effect sizes. |
| Validation summary chart | section 8, 12.9 TBD | Bar chart of issues by severity x domain | Quick visual triage of validation issues before diving into the table. |

### Lower priority (future vision)

| Feature | Spec Ref | Description | Rationale |
|---------|----------|-------------|-----------|
| In-app data fixing | section 8.7 | Edit source data within the app | Requires careful data integrity controls. Most organizations prefer fixing data upstream. |
| Orphaned annotation detector | section 13.7 TBD | Warn when annotations reference values no longer in data | Edge case for studies with data corrections after initial review. |
| Pivot viewer for domain tables | section 7.6 TBD | Better exploration of raw domain data | Useful but not critical -- analysts already have tools for tabular exploration. |
| Multi-study comparison | Not specified | Compare findings across studies for the same compound | High value but significant scope -- requires a study-level data model. |
| Automated report narrative | Not specified | AI-generated narrative text for report sections | Experimental. Dependent on LLM integration with appropriate domain context. |

---

## 9. Risk Register

Risks identified from prototype development, spec analysis, and platform assumptions.

### R1: View switching architecture mismatch (Critical)

- **Risk:** Datagrok's view switching does not preserve filter/selection/scroll state, requiring a fundamental architecture change.
- **Likelihood:** Medium. Datagrok is designed for single-table analysis; multi-view switching for the same study may not be a natural pattern.
- **Impact:** High. Affects every view transition. The cross-view navigation pattern is the application's distinguishing feature.
- **Mitigation:** Phase 0 Question 1 resolves this. If the answer is unfavorable, switch to a tab-based architecture with a single persistent view. The prototype's URL-based routing can inform the tab switching logic.

### R2: Statistical computation latency (High)

- **Risk:** Running the full statistical pipeline (Dunnett's, J-T, Fisher's, etc.) for a large study takes too long for interactive use.
- **Likelihood:** Medium. The prototype pre-computes everything. A 50-animal study with 7 domains may take 10-30 seconds for full computation.
- **Impact:** Medium. Users must wait during import. Annotation-triggered recomputation could be slow.
- **Mitigation:** Compute on import, cache results. For annotation changes, use incremental recomputation (only recompute affected endpoints/rules, not the entire pipeline). The prototype's `domain_stats.py` is domain-independent -- individual domains can be recomputed in isolation.

### R3: Custom JsViewer effort underestimated (High)

- **Risk:** The signal heatmap, dose ladder, and dose-response viewers require more effort than estimated because of Datagrok rendering constraints.
- **Likelihood:** Medium-High. The prototype's React components have complex interactions (collapsible organ groups, cross-mode navigation, selection highlighting) that may be harder to implement in canvas/D3 within JsViewer.
- **Impact:** Medium. 3-4 viewers at 1-2 days each could become 2-3 weeks total if issues arise.
- **Mitigation:** Phase 0 Question 10 evaluates built-in viewer capabilities. Start with the simplest viewer (target organ bar chart) to validate the pattern before building the complex heatmap. Consider using Datagrok's HTML cell rendering for simple matrix displays.

### R4: Sticky Meta reactive binding not available (Medium)

- **Risk:** Sticky Meta cannot propagate changes to DataFrame columns reactively, requiring manual refresh after every annotation.
- **Likelihood:** Medium. Platform may support construction-time queries but not event-driven updates.
- **Impact:** Medium. The annotation-to-analysis feedback loop is a key scientific workflow. Manual refresh is acceptable but degrades UX.
- **Mitigation:** Phase 0 Question 3 resolves this. If reactive binding is not available, add a prominent "Recalculate" button after annotation changes. Batch multiple annotation changes before recomputation.

### R5: R/Python script integration latency (Medium)

- **Risk:** Calling Python scripts from TypeScript has high latency (>5 seconds), making the statistical pipeline feel sluggish.
- **Likelihood:** Low-Medium. Datagrok's scripting infrastructure is designed for this, but network round-trips add up for 7 domain computations.
- **Impact:** Medium. Affects import time and recomputation time.
- **Mitigation:** Bundle all statistical computation into a single script call (the prototype's `generate.py` is already structured this way). Process all domains in one invocation rather than 7 separate calls. Cache aggressively.

### R6: Project save does not preserve all state (Medium)

- **Risk:** Datagrok project save/restore loses some DataFrames, viewer layouts, or annotations, requiring custom persistence code.
- **Likelihood:** Medium. Complex plugin state (7+ DataFrames, custom viewer configurations, 3 Sticky Meta schemas) may exceed what the platform auto-persists.
- **Impact:** Medium-High. Users losing their analysis state on project reopen is a trust-destroying experience.
- **Mitigation:** Phase 0 Question 4 maps exactly what is preserved. For anything not auto-preserved, implement JSON serialization to project metadata. Test save/restore early and often during development, not just at the end.

### R7: Heatmap performance with large studies (Low-Medium)

- **Risk:** The signal heatmap (endpoint x dose x sex) has 1000+ cells for a large study. Custom JsViewer rendering may lag.
- **Likelihood:** Low. Canvas/D3 rendering is fast for this scale. HTML-based rendering is the risk.
- **Impact:** Low-Medium. Lag on filter changes would degrade the scanning workflow.
- **Mitigation:** Use canvas rendering (not DOM elements) for the heatmap. Implement virtual scrolling for the grid. The prototype's `study_signal_summary.json` has 989 rows for a single study -- this is representative.

### R8: Validation engine complexity (Medium)

- **Risk:** Building a real SEND validation engine (18 rules, YAML-defined, annotation-only fixes) is larger than estimated.
- **Likelihood:** Medium. The prototype uses 8 hardcoded rules. A production engine needs SENDIG metadata lookups, controlled terminology, and proper rule evaluation infrastructure.
- **Impact:** Low-Medium. Validation is important but not blocking for the analysis workflow. A simpler validation engine (fewer rules, no auto-fix) is an acceptable Phase 1A deliverable.
- **Mitigation:** Start with the 5 highest-value rules. Use the validation engine build prompt (`C:/pg/pcc-design/validation-engine-build-prompt.md`) which has full implementation instructions. Defer complex rules (cross-domain consistency, temporal sequence validation) to Phase 2.

### R9: Domain data variability across real studies (Medium)

- **Risk:** The statistical pipeline was tested against one study (PointCross). Other studies may have missing domains, non-standard ARM codes, unusual dose group structures, or unexpected data quality issues.
- **Likelihood:** High. Every study is different. The prototype's `dose_groups.py` has hardcoded ARM code mappings ("1"-"4") that will not work for other studies.
- **Impact:** Medium. Pipeline failures on import for unsupported study structures.
- **Mitigation:** Make dose group mapping dynamic (derive from DM/TX domains). Add defensive handling for missing domains (the spec explicitly calls for this). Test with at least 3 diverse studies before considering Phase 1B complete. The `C:/pg/pcc/send/` directory has 16 study folders available for testing.

### R10: Context panel real estate (Low)

- **Risk:** Datagrok's context panel may not have enough width or flexibility for the complex info pane content specified (rule insights with evidence, multi-section accordions, annotation forms).
- **Likelihood:** Low. Datagrok's context panel is designed for rich content.
- **Impact:** Low. Content can be reformatted to fit. Annotation forms could use dialogs instead of inline panels.
- **Mitigation:** Test with realistic content in Phase 0. If width is insufficient, use `grok.shell.dockElement` (Pattern #12) to create a wider right panel.
