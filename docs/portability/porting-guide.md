# Prototype-to-Datagrok Porting Guide

This document maps every concept, file, view, and data flow in the SEND Data Browser prototype (React + FastAPI) to its Datagrok plugin equivalent (TypeScript frontend + Python scripting backend). It is structured for consumption by an LLM agent or developer performing the port.

**Source of truth for Datagrok patterns:** `C:\pg\pcc-design\datagrok-patterns.ts` (27 canonical patterns).
**Source of truth for prototype architecture:** `C:\pg\pcc\CLAUDE.md`.
**View specifications:** `C:\pg\pcc-design\views\*.md` (8 view documents).

---

## 1. Concept Mapping Table

| Prototype Concept | React Implementation | Datagrok Equivalent | Pattern # | Notes |
|---|---|---|---|---|
| **View container** | React Router route renders a component into the center panel of the 3-panel `Layout.tsx` shell | `DG.ViewBase` or `DG.TableView` created via `grok.shell.newView()` or `grok.shell.addTableView(df)`. Each analysis view = one ViewBase. | #1, #3 | Use `grok.shell.newView('SEND Browser')` for the app entry point. Use `grok.shell.addTableView(df)` when the view is fundamentally grid-based. Use `grok.shell.newView()` + manual layout for composite views (cards + heatmap + grid). |
| **Left sidebar / browsing tree** | `BrowsingTree.tsx` -- custom React tree with study > domain/analysis navigation (260px left panel) | `view.toolbox` set to an `ui.accordion()` containing `ui.tree()`. Tree groups for "Core Domains", "Findings", "Analysis Views". Item clicks load the corresponding view. | #9, #16 | Use `ui.tree()` for the hierarchical study/domain/analysis tree. Put it inside an accordion pane in the toolbox. Handle `tree.onSelectedChanged` to switch views or navigate. |
| **Context panel (right sidebar)** | `ContextPanel.tsx` -- 280px right panel, route-detected, shows view-specific pane components (`StudySummaryContextPanel`, `DoseResponseContextPanel`, etc.) | Info Panels registered via `//tags: panel, widgets` annotations. For dynamic content, subscribe to `df.onCurrentRowChanged` and update an accordion in the context panel area. | #6, #7, #8 | Datagrok's context panel updates automatically based on the current cell's semantic type. Register info panels for `SubjectId`, `OrganSystem`, `EndpointLabel` semantic types. For complex multi-pane panels (Insights + Statistics + Correlations + ToxAssessment), build a single `DG.Widget` containing a `ui.accordion()` with one pane per section. |
| **Grid / data table** | TanStack React Table with client-side sorting, manual column rendering, color-coded cells | `DG.TableView.grid` -- built-in grid with `grid.onCellPrepare()` for cell color coding, `grid.col(name).width` for sizing, `grid.columns.setOrder()` for column order, `grid.col(name).visible` for hiding columns. | #3, #23, #27 | The grid is the centerpiece of Datagrok. Most of what the prototype builds manually (column rendering, sorting, hover, selection highlighting) comes free with `DG.TableView`. Use `grid.onCellPrepare()` for the p-value, effect-size, severity, and signal-score color coding. |
| **Charts (Recharts line/bar)** | Recharts `<LineChart>`, `<BarChart>`, `<ResponsiveContainer>` in DoseResponseView and SignalHeatmap | Built-in viewers: `tv.lineChart()`, `tv.barChart()`, `tv.boxPlot()`, `tv.scatterPlot()`. For custom heatmaps, use `DG.JsViewer` subclass. | #4, #21 | Use `tv.lineChart({ x: 'dose_level', y: 'mean', split: 'sex' })` to replace the Recharts dose-response chart. For the signal heatmap and adversity matrix, create a `DG.JsViewer` subclass that renders via canvas or HTML. |
| **Ribbon actions** | "Generate Report" button in StudySummaryView tab bar; no other ribbon | `view.setRibbonPanels()` for icon buttons (Export, Refresh, Generate Report), `view.ribbonMenu` for dropdown menus (Analysis, Export). | #10 | Put the "Generate Report" action in the ribbon: `ui.iconFA('file-export', () => generateReport(), 'Generate Report')`. Add export and refresh icons too. |
| **Filters** | Prototype uses local `useState<Filters>` with `<select>` dropdowns and a search input. Filters apply client-side via `.filter()` on arrays. | `tv.filters()` for standard filter panel. For custom filter UI, use `ui.input.choice()` / `ui.input.multiChoice()` in the toolbox accordion, wired to `df.filter.init()`. | #5, #14 | Use Datagrok's built-in filter viewer for categorical filters (Sex, Domain, Organ System). For the endpoint search autocomplete, use `ui.input.string()` with custom logic to call `df.filter.init()`. Filters automatically propagate to all viewers sharing the DataFrame. |
| **State management** | React Context (`SelectionContext`, `SignalSelectionContext`, `ViewSelectionContext`, `FindingSelectionContext`) + React Query for server state + local `useState` for filters/sorting | DataFrame `selection` BitSet for multi-row selection, `currentRow` for single-row focus, `filter` BitSet for visible rows. `df.onCurrentRowChanged` / `df.onSelectionChanged` / `df.onFilterChanged` for reactivity. | #2 (filter/selection), #20 (events) | This is the biggest conceptual shift. Replace all React Context with DataFrame selection/filter state. When user clicks a row, that sets `df.currentRow`. Info panels react via `df.onCurrentRowChanged`. Filters set `df.filter`. All viewers linked to the same DataFrame auto-sync. |
| **Backend API calls** | `lib/api.ts` (fetch wrapper), `lib/analysis-api.ts`, `lib/analysis-view-api.ts` -- HTTP GET to FastAPI endpoints. React Query hooks cache responses. | Datagrok Python scripts called via `grok.functions.call('PackageName:ScriptName', params)`. Scripts return `DG.DataFrame`. Alternatively, use `_package.files.readAsText()` for pre-generated data. | #26 | Replace all `fetch('/api/...')` calls with Datagrok script calls. The Python scripts live in the package's `scripts/` folder. They read XPT files, compute statistics, and return DataFrames. The TypeScript frontend calls them and receives `DG.DataFrame` objects. |
| **Annotations / Sticky Meta** | `useAnnotations()` hook + `lib/annotations-api.ts` -- GET/PUT to `routers/annotations.py`. Stores ToxFinding, PathologyReview, ValidationIssue, ValidationRecord as JSON files. | Use `df.setTag()` / `df.getTag()` for row-level or column-level metadata. For complex annotation objects, serialize to JSON in tags or use Datagrok's built-in entity storage. | N/A | Datagrok DataFrames support `.tags` (string key-value). For the ToxFinding form (treatment-related, adversity, comment), store as a JSON string in a tag keyed by endpoint label. For persistence across sessions, use Datagrok's server-side storage or a database connection. |
| **Routing / navigation** | React Router 7 with routes defined in `App.tsx`. URL-based navigation: `/studies/:studyId/dose-response`, etc. | No URL routing. Navigation is view-based: create/activate views via `grok.shell.addTableView()` or `grok.shell.newView()`. Use `grok.shell.v` to get current view. Switch views programmatically. Tree item clicks create or focus the target view. | #1, #9, #11 | Replace React Router with a view manager. Each "route" becomes a function that creates a Datagrok view. The browsing tree's item click handler calls the appropriate view-creation function. Store created views in a `Map<string, DG.ViewBase>` to reuse them. |
| **Selection state (current row)** | `SignalSelectionContext` tracks `{ endpoint_label, sex, domain, organ_system, dose_level }`. Components check this to highlight rows and update context panel. | `df.currentRow` -- single integer row index. Access fields via `df.currentRow.get('endpoint_label')`. Subscribe via `df.onCurrentRowChanged`. | #2, #20 | The prototype's multi-field selection object maps directly to a DataFrame row. When user clicks a grid row, `df.currentRow` changes, and all subscribers (info panels, charts) react. No need for a custom context object. |
| **Color coding** | `lib/severity-colors.ts` -- functions for p-value, signal score, severity, domain, sex, dose group colors. Applied as inline styles or Tailwind classes. | `grid.onCellPrepare()` callback. Use `DG.Color.fromHtml('#D32F2F')` for colors. Apply via `gc.style.backColor`. | #23 | Port the color functions from `severity-colors.ts` directly to TypeScript (they are already TypeScript). Call them inside `grid.onCellPrepare()`. The color hex values transfer 1:1. |
| **Forms / inputs** | Custom React form components: `ToxFindingForm`, `PathologyReviewForm`, `ValidationIssueForm`, `ValidationRecordForm`. Use `<select>`, `<textarea>`, `<input>` with `useState`. | `ui.input.choice()`, `ui.input.string()`, `ui.input.bool()`, `ui.inputs()` for forms. `ui.dialog()` for modal forms. Place non-modal forms inside accordion panes in the context panel widget. | #14, #15 | Use `ui.input.choice('Treatment related', { value: 'Not Evaluated', items: ['Yes', 'No', 'Equivocal', 'Not Evaluated'] })` to replace the ToxFinding dropdown. Wire `input.onChanged` to save annotation. |
| **Dialogs** | No modal dialogs in the prototype (import section is inline, fix script dialog is a pane) | `ui.dialog('title').add(...).onOK(() => {}).show()` | #15 | Use Datagrok dialogs for: export settings, fix script preview/confirmation, import configuration. |
| **Tooltips** | HTML `title` attribute on cells, Recharts built-in tooltip on charts | `ui.tooltip.bind(element, content)` for static, `ui.tooltip.bind(element, () => richContent)` for dynamic HTML tooltips. | #18 | Use rich tooltips for grid cells that show p-value, effect size, or signal score. Build tooltip content with `ui.tableFromMap()` for key-value pairs. |
| **Notifications / toasts** | No toast system in prototype (uses `alert()` for stubs) | `grok.shell.info()`, `grok.shell.warning()`, `grok.shell.error()` | #17 | Replace all `alert()` calls with `grok.shell.info/warning/error`. |
| **Progress indicators** | `Loader2` spinner component (Lucide icon with animate-spin) | `DG.TaskBarProgressIndicator.create('message')` with `.update(pct, msg)` and `.close()` | #24 | Use the taskbar progress indicator when loading study data, running the generator, or computing statistics. |
| **Tabs** | Custom tab bar in StudySummaryView (Details / Signals) using `useState` and conditional rendering | `ui.tabControl({ 'Details': () => detailsPanel, 'Signals': () => signalsPanel })` | #13 | Use `ui.tabControl()` for the Study Summary's Details/Signals split. Each tab returns its content lazily. |
| **Split layouts** | CSS flexbox with fixed widths (260px left, flex-1 center, 280px right) | `ui.splitH([left, right])`, `ui.splitV([top, bottom])` for splitter-based layouts. | #13 | Use `ui.splitH()` for the main 3-panel layout only if building outside of TableView. TableView already provides toolbox (left), grid (center), and context panel (right). |
| **Context menus (right-click)** | Custom `<div>` positioned at click coordinates in AppLandingPage | `DG.Menu.popup()` with `.item()`, `.separator()`, `.show()` | #19 | Replace the custom context menu component with `DG.Menu.popup()`. |
| **Semantic type detection** | Not in prototype (no semType tagging) | `detectors.ts` with `//tags: semTypeDetector` annotations. Detect `USUBJID` as `SubjectId`, etc. | #22 | Create detectors for SEND-specific semantic types: `SubjectId` (USUBJID), `DoseLevel`, `OrganSystem`, `EndpointLabel`. These trigger the correct info panels. |

---

## 2. Per-View Mapping

### 2.1 Landing Page (App Entry Point)

**Route:** `/` | **Component:** `AppLandingPage.tsx`

**What the prototype does:** Displays a hero section, an import stub, and a studies table. Users double-click a study to open it, or right-click for a context menu with actions (Open, Validate, Generate Report, Export).

**Main components:**
- `AppLandingPage.tsx` -- hero, import section, studies table, context menu
- `useStudies()` hook -- fetches study list from `/api/studies`
- `SelectionContext` -- tracks selected study
- `ContextPanel.tsx` -- shows `StudyInspector` for selected study

**Datagrok implementation:**
- Use `grok.shell.newView('SEND Browser')` as the app entry point (Pattern #1).
- Build the study list as a `DG.DataFrame` with columns: study_id, protocol, standard, subjects, start_date, end_date, status, validation.
- Display it in a `DG.TableView` with `grid.columns.setOrder()` and `grid.col().visible = false` for internal columns.
- Set up the toolbox with an accordion containing a tree of available studies (Pattern #9).
- Use `df.onCurrentRowChanged` to update the context panel with study metadata.
- Use the ribbon for global actions: Import Study, Generate Report, Export (Pattern #10).
- Handle double-click on study row to create/navigate to the study analysis view.

**What transfers directly:**
- Study metadata schema (study_id, protocol, standard, subjects, dates)
- Color coding for validation status (green check, amber triangle, red X)
- Context menu actions list (Open, Validate, Report, Export)

**What changes structurally:**
- No hero section -- Datagrok apps open directly to a view with data. Put the app description in a sidebar pane or a welcome dialog.
- No import section stub -- use Datagrok's file upload/connection system.
- No URL routing -- study selection triggers view creation via `grok.shell.addTableView()`.
- Demo studies are deleted entirely; study list comes from Datagrok's data source.
- The custom context menu (`<div>` overlay) becomes `DG.Menu.popup()`.

---

### 2.2 Study Summary (View 1)

**Route:** `/studies/:studyId` | **Component:** `StudySummaryView.tsx`

**What the prototype does:** Two-tab view (Details + Signals). Details shows metadata key-value pairs. Signals has a filter bar, signal heatmap (CSS grid), signal summary grid (TanStack table), and target organ bar chart (pre-rendered Plotly HTML). Selecting a signal updates the context panel with Insights, Statistics, Correlations, and ToxAssessment panes.

**Main components:**
- `StudySummaryView.tsx` / `StudySummaryViewWrapper.tsx` -- tab bar, conditional rendering
- `StudySummaryFilters.tsx` -- filter controls
- `SignalHeatmap.tsx` -- CSS grid heatmap with color-coded cells
- `StudySummaryGrid.tsx` -- TanStack table with 12 columns
- `OrganGroupedHeatmap.tsx` -- organ-grouped collapsible signal matrix
- `SignalsPanel.tsx` (FindingsView) -- structured synthesis (Target Organs, Modifiers, Caveats)
- `StudySummaryContextPanel.tsx` -- InsightsList, Statistics, Correlations, ToxFindingForm
- `SignalSelectionContext` -- manages endpoint and organ selection
- `useStudySignalSummary`, `useTargetOrganSummary`, `useRuleResults` hooks
- `lib/signals-panel-engine.ts` -- derives semantic rules for Decision Bar and Findings view
- `lib/rule-synthesis.ts` -- organ-grouped rule synthesis for InsightsList

**Datagrok implementation:**
- Create a `DG.TableView` from the signal summary DataFrame (989 rows, columns: endpoint_label, endpoint_type, organ_system, dose_label, sex, signal_score, direction, p_value, trend_p, effect_size, statistical_flag, dose_response_flag, domain).
- Use `tv.filters()` for Sex, Organ System, Endpoint Type categorical filters (Pattern #5).
- Use `grid.onCellPrepare()` for signal_score color coding (Pattern #23).
- Build the signal heatmap as a `DG.JsViewer` subclass (Pattern #21). It aggregates endpoint x dose, renders a colored grid, and responds to `df.selection`/`df.filter` changes.
- Use `ui.tabControl()` for the Details/Signals tab split (Pattern #13).
- For the Details tab, use `ui.tableFromMap()` with study metadata (Pattern #13).
- Register an info panel for the signal context panel (Pattern #6) or build it dynamically via `df.onCurrentRowChanged` (Pattern #7).
- Port `signals-panel-engine.ts` and `rule-synthesis.ts` logic as-is (pure TypeScript, no React dependencies).
- For the target organ bar chart, use `tv.barChart({ split: 'organ_system', value: 'evidence_score' })`.

**What transfers directly:**
- All color functions from `severity-colors.ts` (p-value, signal score, severity, domain, sex colors)
- Signal heatmap aggregation logic (max score across sexes per endpoint x dose)
- Rule synthesis engine (`signals-panel-engine.ts`, `rule-synthesis.ts`) -- pure functions, no framework dependency
- All TypeScript type definitions from `types/analysis-views.ts`
- Filter logic (client-side array filtering)

**What changes structurally:**
- The 3-panel layout (browsing tree / center / context panel) is native in Datagrok -- no custom Layout.tsx needed.
- Selection state moves from `SignalSelectionContext` to `df.currentRow` + `df.onCurrentRowChanged`.
- The signal heatmap is a JsViewer, not a React component with `useState`.
- The Plotly HTML bar chart is replaced by a native Datagrok bar chart viewer.
- Tab switching is `ui.tabControl`, not `useState<"details" | "signals">`.

---

### 2.3 Dose-Response (View 2)

**Route:** `/studies/:studyId/dose-response` | **Component:** `DoseResponseView.tsx`

**What the prototype does:** Filter bar with endpoint search autocomplete + Sex/DataType/Organ dropdowns. When an endpoint is selected, shows side-by-side Recharts line charts (continuous) or bar charts (categorical) per sex. Below: a metrics grid (TanStack table, 1342 rows, 12 columns) with color-coded p-values and effect sizes.

**Main components:**
- `DoseResponseView.tsx` / `DoseResponseViewWrapper.tsx`
- `DoseResponseContextPanel.tsx` -- InsightsList, Pairwise detail, ToxFindingForm, Related Views
- `ViewSelectionContext` with `_view: "dose-response"` tag
- `useDoseResponseMetrics` hook

**Datagrok implementation:**
- Create a `DG.TableView` from the dose-response metrics DataFrame (1342 rows).
- Use built-in `tv.lineChart({ x: 'dose_level', y: 'mean', split: 'sex' })` for continuous data (Pattern #4). Dock it above the grid via `ui.splitV()` or `grok.shell.dockElement()` (Pattern #12).
- Use `tv.barChart({ split: 'dose_level', value: 'incidence' })` for categorical data.
- Use `tv.filters()` for Sex, Organ System, Data Type filters (Pattern #5).
- For endpoint search: use `ui.input.string()` in the toolbox, filter the DataFrame on change.
- Use `grid.onCellPrepare()` for p-value and effect-size color coding (Pattern #23).
- Register an info panel that shows pairwise dose detail + insights for the selected endpoint (Pattern #6/#7).

**What transfers directly:**
- Dose-response metrics data schema and column definitions
- P-value formatting logic (`formatPValue`), effect-size formatting (`formatEffectSize`)
- Color scale thresholds (p < 0.001 = red, p < 0.05 = amber, etc.)
- InsightsList rule filtering logic
- Pairwise detail table data extraction

**What changes structurally:**
- Recharts charts become native Datagrok viewers (line chart, bar chart). Configuration is declarative, not JSX.
- The endpoint search autocomplete is replaced by `ui.input.string()` + custom DataFrame filter logic, or a Datagrok built-in column filter.
- Side-by-side charts per sex: use `DG.Viewer.lineChart(df)` with a filter for sex, positioned with `ui.splitH()`.
- Selection moves from `ViewSelectionContext` to `df.currentRow`.

---

### 2.4 Target Organs (View 3)

**Route:** `/studies/:studyId/target-organs` | **Component:** `TargetOrgansView.tsx`

**What the prototype does:** Displays organ summary cards (sorted by evidence_score) at the top. Clicking a card shows a filtered evidence detail grid below (9 columns: endpoint, domain, dose, sex, p-value, effect, direction, severity, treatment_related). Context panel shows Convergence insights, contributing Endpoints list, Related Views, and ToxAssessment.

**Main components:**
- `TargetOrgansView.tsx` / `TargetOrgansViewWrapper.tsx`
- `TargetOrgansContextPanel.tsx`
- `ViewSelectionContext` with `_view: "target-organs"` tag
- `useTargetOrganSummary`, `useOrganEvidenceDetail` hooks

**Datagrok implementation:**
- Use `grok.shell.newView('Target Organs')` for a composite layout (cards are not a grid).
- Build organ cards as `ui.card()` elements inside a `ui.divV()`, wrapped in a scrollable container.
- Below the cards, embed a grid viewer from the evidence detail DataFrame via `DG.Viewer.grid(evidenceDf)`.
- Wire card clicks to set `evidenceDf.filter.init((i) => evidenceDf.get('organ_system', i) === selectedOrgan)`.
- Use `grid.onCellPrepare()` for severity, p-value, and effect-size coloring.
- Register an info panel for organ-level context (Pattern #6) showing convergence insights and endpoint list.

**What transfers directly:**
- Organ summary data schema (organ_system, evidence_score, n_endpoints, n_domains, target_organ_flag, domains)
- Evidence detail column definitions and color coding
- Domain badge color map (LB=blue, BW=emerald, OM=purple, MI=rose, MA=orange, CL=cyan)
- Card layout logic (sort by evidence_score desc, show TARGET badge if flagged)

**What changes structurally:**
- The two-level selection (organ card then evidence row) maps to: card click sets DataFrame filter, row click sets `df.currentRow`.
- Organ cards are `ui.card()` with `ui.divV()` content, not React JSX.
- The evidence grid is a Datagrok grid viewer, not a TanStack table.

---

### 2.5 Histopathology (View 4)

**Route:** `/studies/:studyId/histopathology` | **Component:** `HistopathologyView.tsx`

**What the prototype does:** Filter bar (Specimen, Sex, Min Severity). Severity heatmap (finding x dose, colored by avg_severity, text shows affected/n). Below: lesion severity grid (10 columns, 728 rows). Context panel: PathologyReviewForm, Dose detail, Insights, Correlating evidence, Related Views, ToxAssessment.

**Main components:**
- `HistopathologyView.tsx` / `HistopathologyViewWrapper.tsx`
- `HistopathologyContextPanel.tsx`
- `ViewSelectionContext` with `_view: "histopathology"` tag
- `useLesionSeveritySummary`, `useRuleResults` hooks
- `PathologyReviewForm.tsx`

**Datagrok implementation:**
- Use `grok.shell.newView('Histopathology')` for the composite layout (heatmap + grid).
- Build the severity heatmap as a `DG.JsViewer` subclass (Pattern #21). Render finding x dose cells colored by avg_severity using the severity heat scale (#FFF9C4 to #E57373). Subscribe to `df.filter.onChanged` to re-render on filter changes.
- Embed the lesion grid as a `DG.Viewer.grid(lesionDf)` below the heatmap via `ui.splitV()`.
- Use `grid.onCellPrepare()` for incidence background colors and avg_severity heat coloring.
- For the PathologyReviewForm, build a `ui.accordion()` pane with `ui.input.choice()` dropdowns (Peer review status, Revised severity) and `ui.input.string()` for comment. Place in info panel widget.

**What transfers directly:**
- Severity heat color scale (#FFF9C4, #FFE0B2, #FFB74D, #FF8A65, #E57373)
- Heatmap aggregation logic (sum affected/n across sexes, max avg_severity)
- Lesion grid column definitions and color thresholds
- Incidence background color thresholds (>=0.8 red, >=0.5 orange, >=0.2 yellow)
- PathologyReviewForm field definitions and validation logic

**What changes structurally:**
- The severity heatmap is a JsViewer, not a React CSS grid component.
- PathologyReviewForm fields become `ui.input.*` controls, not JSX `<select>` elements.
- Heatmap row click sets `df.currentRow`; context panel reacts via `df.onCurrentRowChanged`.
- Filter bar moves to the toolbox accordion with `ui.input.choice()` controls.

---

### 2.6 NOAEL Decision (View 5)

**Route:** `/studies/:studyId/noael-decision` | **Component:** `NoaelDecisionView.tsx`

**What the prototype does:** NOAEL determination banner (3 cards: Combined/Males/Females with green/red status). Filter bar (Severity, Organ, Sex, Treatment Related). Adversity matrix (endpoint x dose, color-only blocks). Adverse effect grid (11 columns, all rows rendered). Context panel: NOAEL narrative (InsightsList with study-scope rules), Confidence, Adversity Rationale, Insights, Related Views, ToxAssessment.

**Main components:**
- `NoaelDecisionView.tsx` / `NoaelDecisionViewWrapper.tsx`
- `NoaelContextPanel.tsx`
- `ViewSelectionContext` with `_view: "noael"` tag
- `useNoaelSummary`, `useAdverseEffectSummary`, `useRuleResults` hooks

**Datagrok implementation:**
- Use `grok.shell.newView('NOAEL Decision')` for the composite layout.
- Build the NOAEL banner as `ui.divH()` with 3 `ui.card()` elements (Combined, Males, Females). Color borders based on `noael_dose_value > 0`.
- Build the adversity matrix as a `DG.JsViewer` subclass (Pattern #21). Render endpoint x dose cells colored by severity (red=adverse+TR, amber=warning, green=normal, gray=N/A).
- Embed the adverse effect grid as `DG.Viewer.grid(aeDf)` below the matrix.
- Use `grid.onCellPrepare()` for severity badges, p-value colors, effect-size colors, direction arrows, and dose-group colors.
- Build the NOAEL narrative as an info panel that shows study-scope rules from rule_results via InsightsList logic.

**What transfers directly:**
- NOAEL summary data schema (sex, noael_dose_level/label/value/unit, loael, n_adverse_at_loael)
- Adversity matrix construction logic (filter to adverse+TR, sort by first adverse dose level, take worst severity per endpoint x dose across sexes)
- All color scales (severity, p-value, effect size, dose group, direction)
- NOAEL card green/red conditional styling

**What changes structurally:**
- The NOAEL banner is `ui.divH()` with `ui.card()`, not JSX flex containers.
- The adversity matrix is a JsViewer, not a flex-based React component.
- Filter controls move to the toolbox.
- Context panel's default "no selection" state (showing NOAEL narrative) becomes the info panel's default content.

---

### 2.7 Adverse Effects

**Route:** `/studies/:studyId/analyses/adverse-effects` | **Component:** `AdverseEffectsView.tsx`

**What the prototype does:** Dynamic server-side paginated findings table with per-dose-group columns. Filter bar (Domain, Sex, Severity, Search) using shadcn/ui Select. Summary badges (N adverse, N warning, N normal). Context panel: Treatment Summary, Statistics, Dose Response, Correlations, Effect Size -- all loaded from a separate API call per finding.

**Main components:**
- `AdverseEffectsView.tsx`, `FindingsTable.tsx`, `FindingsFilterBar.tsx`
- `AdverseEffectsContextPanel.tsx`, `StatisticsPane.tsx`, `CorrelationsPane.tsx`, etc.
- `FindingSelectionContext`
- `useAdverseEffects`, `useAESummary`, `useFindingContext` hooks

**Datagrok implementation:**
- Compute the adverse effects DataFrame in a Python script (port `services/analysis/unified_findings.py`). Return a flat DataFrame with one row per finding x dose combination and extra columns for dose-group values.
- Create a `DG.TableView` from this DataFrame.
- Use `tv.filters()` for Domain, Sex, Severity categorical filters.
- Use `grid.onCellPrepare()` for p-value, effect-size, severity, domain, direction coloring.
- For the dynamic dose-group columns: compute them in Python and include as regular DataFrame columns (dose_0_value, dose_1_value, etc.). Rename column headers to show dose labels.
- Build a finding-detail info panel (Pattern #6/#7) that shows treatment summary, statistics, correlations.
- The separate finding-context API call becomes a Python script call, or pre-compute finding context into the DataFrame as additional columns.

**What transfers directly:**
- Adverse effects analysis pipeline (Python: `unified_findings.py`, `classification.py`, `statistics.py`, `correlations.py`, `context_panes.py`)
- Domain badge colors, severity badge styles, p-value/effect-size color scales
- Finding context pane data structure (treatment summary, stats, dose-response, correlations)
- Summary badge counts logic

**What changes structurally:**
- Server-side pagination (React Query + page/pageSize params) is replaced by Datagrok's built-in grid virtualization. Load the full DataFrame and let Datagrok handle rendering.
- The shadcn/ui Select components become `ui.input.choice()` in the toolbox or as filter viewers.
- Finding selection via `FindingSelectionContext` becomes `df.currentRow`.
- The separate API call for finding context (`useFindingContext`) is eliminated -- pre-compute all context fields into the DataFrame, or call a Python script on `df.onCurrentRowChanged`.

---

### 2.8 Validation

**Route:** `/studies/:studyId/validation` | **Component:** `ValidationView.tsx`

**What the prototype does:** Master-detail layout: top pane = rules table (8 hardcoded rules, TanStack table), bottom pane = affected records for selected rule (filterable by review status and subject). Context panel has two modes: Mode 1 (Rule Review Summary with rule detail, review progress, disposition) and Mode 2 (Issue Review with record context, finding detail, suggested fix, review form). Uses hardcoded data -- no API calls.

**Main components:**
- `ValidationView.tsx` -- HARDCODED_RULES, RULE_DETAILS, AFFECTED_RECORDS, FIX_SCRIPTS
- `ValidationContextPanel.tsx` -- two-mode context panel with navigation history
- `ValidationIssueForm.tsx`, `ValidationRecordForm.tsx`
- `useAnnotations` hook for review status persistence

**Datagrok implementation:**
- Replace hardcoded data with calls to the validation engine (Python: `backend/validation/engine.py`, `backend/validation/checks/*.py`). The engine returns two DataFrames: rules summary and affected records.
- Use `ui.splitV()` for the master-detail layout: top grid = rules DataFrame, bottom grid = records DataFrame.
- Wire `rulesDf.onCurrentRowChanged` to filter `recordsDf`: `recordsDf.filter.init((i) => recordsDf.get('rule_id', i) === selectedRuleId)`.
- Use `grid.onCellPrepare()` for severity badges (Error=red, Warning=amber, Info=blue) and review status badges.
- Build the context panel as a `DG.Widget` with an `ui.accordion()`. Mode 1 shows rule detail + review progress + disposition form. Mode 2 shows record context + finding detail + suggested fix + review form.
- Use `ui.input.choice()` for review status dropdowns, `ui.input.string()` for comment fields.
- For the "APPLY FIX" action, call a Python script that applies the correction and returns updated data.

**What transfers directly:**
- Validation engine (Python: `engine.py`, all check modules in `checks/`)
- Validation data models (`validation/models.py`)
- Fix tier system logic (Tier 1: Accept, Tier 2: Simple correction, Tier 3: Script fix)
- Review status badge color map (Not Reviewed=gray, Accepted=green, Flagged=red, Resolved=blue)
- Review progress calculation (N of M reviewed, percentage)
- Rule detail field definitions (standard, section, description, rationale, howToFix)

**What changes structurally:**
- Hardcoded arrays are replaced by real validation engine output (DataFrames).
- Master-detail is two linked Datagrok grids, not two TanStack tables with manual wiring.
- Context panel mode switching (Rule vs Issue) is handled by checking which grid's current row changed.
- Navigation history (back/forward in context panel) is unnecessary -- Datagrok's context panel naturally reflects the current selection.
- The SuggestedFixSection's "APPLY FIX" button calls a Datagrok Python script instead of updating local state.

---

## 3. Data Flow Mapping

### Prototype Data Flow

```
[.XPT files on disk]
    |
    v
[generator/generate.py]  -- offline CLI, reads XPT, computes stats
    |
    v
[8 JSON files in generated/{study_id}/]
    |
    v
[FastAPI routers serve JSON]  -- analysis_views.py, analyses.py, studies.py
    |
    v
[React hooks fetch via HTTP]  -- useStudySignalSummary, useDoseResponseMetrics, etc.
    |
    v
[React state: useState, useContext]  -- filters, selection, sorting
    |
    v
[React components render]  -- TanStack tables, Recharts charts, CSS grids
```

### Datagrok Data Flow

```
[.XPT files in Datagrok file storage]
    |
    v
[Python scripts in package scripts/ folder]
    -- Port generator logic: domain_stats.py, scores_and_rules.py, view_dataframes.py
    -- Port analysis pipeline: unified_findings.py, classification.py, statistics.py
    -- Return DG.DataFrame objects, not JSON
    |
    v
[TypeScript calls grok.functions.call()]
    -- or: _package.files.readAsText() for pre-generated CSV
    |
    v
[DG.DataFrame]
    -- filter: df.filter BitSet (replaces useState<Filters>)
    -- selection: df.selection BitSet (replaces useContext selection)
    -- currentRow: df.currentRow (replaces selection context)
    -- events: df.onCurrentRowChanged, df.onFilterChanged, df.onSelectionChanged
    |
    v
[Datagrok viewers render automatically]
    -- Grid: grid.onCellPrepare() for color coding
    -- Charts: tv.lineChart(), tv.barChart() auto-linked to df
    -- Filters: tv.filters() auto-linked to df
    -- Info panels: triggered by df.onCurrentRowChanged
```

### What Stays the Same

1. **Statistical computation pipeline** -- All Python code in `generator/` and `services/analysis/` transfers as-is to Datagrok Python scripts. The statistical algorithms (scipy.stats, Fisher's exact, Mann-Whitney, trend tests) are identical.
2. **Data schemas** -- The 8 generated JSON structures map 1:1 to DataFrame column schemas. Column names, data types, and semantics are preserved.
3. **Color functions** -- `severity-colors.ts` is pure TypeScript with no React dependency. Port the functions directly.
4. **Rule synthesis logic** -- `signals-panel-engine.ts` and `rule-synthesis.ts` are pure TypeScript. No changes needed.
5. **Validation engine** -- `validation/engine.py` and `validation/checks/*.py` transfer directly as Datagrok Python scripts.

### What Changes

1. **Data transport** -- JSON over HTTP becomes DataFrame objects returned from Python scripts. No serialization/deserialization step.
2. **State management** -- React Context + React Query becomes DataFrame BitSets + events. No cache layer needed; DataFrames persist in the Datagrok workspace.
3. **Reactivity model** -- React's declarative re-render on state change becomes Datagrok's event subscription model (`df.onXChanged.subscribe()`). Use `DG.debounce()` for expensive operations.
4. **Filter propagation** -- In the prototype, each view manages its own filter state via `useState`. In Datagrok, setting `df.filter` propagates to all viewers attached to that DataFrame automatically.
5. **Server-side pagination** -- The adverse effects view uses server-side pagination. In Datagrok, load the full DataFrame and use the grid's built-in virtual scrolling. No pagination API needed.

---

## 4. File-by-File Mapping

### Backend Files

| Prototype File | Maps To | Notes |
|---|---|---|
| `backend/config.py` | `package.json` `properties` section + Datagrok connections | SEND_DATA_DIR, ALLOWED_STUDIES, SKIP_FOLDERS become Datagrok package properties or connection settings. |
| `backend/main.py` | `src/package.ts` app entry point | The `//tags: app` function replaces the FastAPI app setup. CORS config is irrelevant (no separate server). |
| `backend/routers/studies.py` | Datagrok Python script `scripts/load_studies.py` | Returns a DataFrame of available studies instead of JSON. |
| `backend/routers/analyses.py` | Datagrok Python script `scripts/adverse_effects.py` | Returns a DataFrame of findings instead of paginated JSON. No pagination needed. |
| `backend/routers/analysis_views.py` | Eliminated. TypeScript calls Python scripts directly. | The router that served pre-generated JSON is unnecessary; scripts return DataFrames. |
| `backend/routers/annotations.py` | Datagrok entity tags or server-side storage | Replace file-based annotation storage with `df.setTag()` for session state and Datagrok server storage for persistence. |
| `backend/routers/validation.py` | Datagrok Python script `scripts/run_validation.py` | Returns rules DataFrame + records DataFrame. |
| `backend/models/schemas.py` | TypeScript interfaces in `src/types/` | Pydantic models become TypeScript interfaces. Some become DataFrame column schemas. |
| `backend/models/analysis_schemas.py` | TypeScript interfaces in `src/types/` | Same as above. |
| `backend/generator/generate.py` | Datagrok Python script `scripts/generate_analysis.py` | Port the orchestration logic. Call from TypeScript via `grok.functions.call()`. Returns DataFrames instead of writing JSON files. |
| `backend/generator/domain_stats.py` | Datagrok Python script (inline in `generate_analysis.py` or separate) | Statistical computation per domain. Returns DataFrames. |
| `backend/generator/organ_map.py` | Datagrok Python script (shared module) | Organ system mapping config. Port as-is. |
| `backend/generator/scores_and_rules.py` | Datagrok Python script (shared module) | Signal scoring and rule engine. Port as-is. |
| `backend/generator/static_charts.py` | Eliminated. Use native Datagrok bar chart viewer. | No need for pre-rendered Plotly HTML. |
| `backend/generator/view_dataframes.py` | Datagrok Python script (shared module) | DataFrame construction for each view. Port as-is; output is already DataFrame-shaped. |
| `backend/services/study_discovery.py` | Datagrok connection or file browser | Study discovery from filesystem is replaced by Datagrok's file storage/connection system. |
| `backend/services/xpt_processor.py` | Datagrok Python script `scripts/load_xpt.py` | XPT reading via `xport` library. Returns DataFrame. Remove CSV caching (Datagrok handles caching). |
| `backend/services/analysis/unified_findings.py` | Datagrok Python script `scripts/adverse_effects.py` | Core adverse effects pipeline. Port as-is; remove file-based caching. |
| `backend/services/analysis/classification.py` | Python script module | Severity classification logic. Port as-is. |
| `backend/services/analysis/correlations.py` | Python script module | Correlation analysis. Port as-is. |
| `backend/services/analysis/context_panes.py` | Python script module | Finding context computation. Port as-is. |
| `backend/services/analysis/dose_groups.py` | Python script module | Dose group mapping. Remove hardcoded ARMCD mapping; derive dynamically. |
| `backend/services/analysis/findings_*.py` (6 files) | Python script modules | Domain-specific finding extraction (BW, CL, LB, MA, MI, OM). Port as-is. |
| `backend/services/analysis/insights.py` | Python script module | Insights generation. Port as-is. |
| `backend/services/analysis/send_knowledge.py` | Python script module | SEND domain knowledge base. Port as-is. |
| `backend/services/analysis/statistics.py` | Python script module | Statistical tests (scipy). Port as-is. |
| `backend/validation/engine.py` | Datagrok Python script `scripts/run_validation.py` | Validation engine orchestrator. Port as-is. |
| `backend/validation/models.py` | Python script module | Validation data models. Port as-is. |
| `backend/validation/checks/*.py` (8 files) | Python script modules | Individual validation checks. Port as-is. |
| `backend/validation/scripts/registry.py` | Python script module | Fix script registry. Port as-is. |

### Frontend Files

| Prototype File | Maps To | Notes |
|---|---|---|
| `frontend/src/App.tsx` | `src/package.ts` (app entry function) | React Router routes become view-creation functions called from the browsing tree. |
| `frontend/src/main.tsx` | Eliminated. Datagrok loads the package. | No React DOM mount point. |
| `frontend/src/components/layout/Layout.tsx` | Eliminated. Datagrok provides the shell. | The 3-panel layout (left toolbox + center view + right context panel) is built-in. |
| `frontend/src/components/layout/Header.tsx` | Eliminated. Datagrok provides the header/ribbon. | Use `view.setRibbonPanels()` instead. |
| `frontend/src/components/tree/BrowsingTree.tsx` | `ui.tree()` inside `view.toolbox` accordion | Port the tree structure (study > domains > analysis views). Handle `tree.onSelectedChanged` for navigation. |
| `frontend/src/components/tree/TreeNode.tsx` | Eliminated. `ui.tree()` handles nodes natively. | |
| `frontend/src/components/panels/ContextPanel.tsx` | Info panel registrations (`//tags: panel, widgets`) | Route-based context panel dispatch becomes semantic-type-based info panels. |
| `frontend/src/components/panels/AppLandingPage.tsx` | View-creation function in `src/package.ts` | Hero section eliminated. Study list is a TableView. Import section replaced by Datagrok file upload. |
| `frontend/src/components/panels/StudyLandingPage.tsx` | Study metadata info panel | Shown when study is selected but no analysis view is active. |
| `frontend/src/components/panels/CenterPanel.tsx` | Eliminated. Each view is its own Datagrok view. | |
| `frontend/src/components/analysis/StudySummaryView.tsx` | View-creation function `createStudySummaryView()` | Builds a view with `ui.tabControl()`, grid, heatmap JsViewer, and chart viewers. |
| `frontend/src/components/analysis/StudySummaryViewWrapper.tsx` | Eliminated. Wrapper only provides context providers. | |
| `frontend/src/components/analysis/StudySummaryGrid.tsx` | `DG.TableView.grid` with `onCellPrepare()` | Column rendering logic moves to `grid.onCellPrepare()`. |
| `frontend/src/components/analysis/StudySummaryFilters.tsx` | `tv.filters()` + `ui.input.*` in toolbox | |
| `frontend/src/components/analysis/charts/SignalHeatmap.tsx` | `DG.JsViewer` subclass `SignalHeatmapViewer` | Port the CSS grid rendering to canvas or HTML inside `render()`. |
| `frontend/src/components/analysis/charts/OrganGroupedHeatmap.tsx` | `DG.JsViewer` subclass `OrganHeatmapViewer` | Port the collapsible organ-grouped layout to `render()`. |
| `frontend/src/components/analysis/SignalsPanel.tsx` | Custom HTML panel built with `ui.divV()`, `ui.card()`, `ui.h3()` | Port the FindingsView layout using Datagrok UI primitives. |
| `frontend/src/components/analysis/DoseResponseView.tsx` | View-creation function `createDoseResponseView()` | Uses `tv.lineChart()`, `tv.barChart()`, `DG.Viewer.grid()`. |
| `frontend/src/components/analysis/DoseResponseViewWrapper.tsx` | Eliminated. | |
| `frontend/src/components/analysis/TargetOrgansView.tsx` | View-creation function `createTargetOrgansView()` | Uses `ui.card()` for organ cards, `DG.Viewer.grid()` for evidence. |
| `frontend/src/components/analysis/TargetOrgansViewWrapper.tsx` | Eliminated. | |
| `frontend/src/components/analysis/HistopathologyView.tsx` | View-creation function `createHistopathologyView()` | Uses `DG.JsViewer` for heatmap, `DG.Viewer.grid()` for lesion grid. |
| `frontend/src/components/analysis/HistopathologyViewWrapper.tsx` | Eliminated. | |
| `frontend/src/components/analysis/NoaelDecisionView.tsx` | View-creation function `createNoaelDecisionView()` | Uses `ui.card()` for NOAEL banner, `DG.JsViewer` for adversity matrix, grid for adverse effects. |
| `frontend/src/components/analysis/NoaelDecisionViewWrapper.tsx` | Eliminated. | |
| `frontend/src/components/analysis/AdverseEffectsView.tsx` | View-creation function `createAdverseEffectsView()` | `DG.TableView` with native grid. No pagination needed. |
| `frontend/src/components/analysis/FindingsTable.tsx` | Eliminated. Replaced by `DG.TableView.grid`. | |
| `frontend/src/components/analysis/FindingsFilterBar.tsx` | `tv.filters()` + `ui.input.*` in toolbox | |
| `frontend/src/components/analysis/ValidationView.tsx` | View-creation function `createValidationView()` | Uses `ui.splitV()` with two grids. Replaces hardcoded data with engine output. |
| `frontend/src/components/analysis/ValidationViewWrapper.tsx` | Eliminated. | |
| `frontend/src/components/analysis/PlaceholderAnalysisView.tsx` | Eliminated. All views are implemented. | |
| `frontend/src/components/analysis/panes/CollapsiblePane.tsx` | `ui.accordion()` panes | Each CollapsiblePane maps to an `acc.addPane()` call. |
| `frontend/src/components/analysis/panes/StudySummaryContextPanel.tsx` | Info panel function returning `DG.Widget` | Build with `ui.accordion()` containing Insights, Statistics, Correlations, ToxAssessment panes. |
| `frontend/src/components/analysis/panes/DoseResponseContextPanel.tsx` | Info panel function returning `DG.Widget` | Same pattern. |
| `frontend/src/components/analysis/panes/TargetOrgansContextPanel.tsx` | Info panel function returning `DG.Widget` | Same pattern. |
| `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx` | Info panel function returning `DG.Widget` | Same pattern. |
| `frontend/src/components/analysis/panes/NoaelContextPanel.tsx` | Info panel function returning `DG.Widget` | Same pattern. |
| `frontend/src/components/analysis/panes/AdverseEffectsContextPanel.tsx` | Info panel function returning `DG.Widget` | Same pattern. |
| `frontend/src/components/analysis/panes/ValidationContextPanel.tsx` | Info panel function returning `DG.Widget` | Two-mode panel (Rule Review / Issue Review) built dynamically. |
| `frontend/src/components/analysis/panes/InsightsList.tsx` | Utility function `buildInsightsWidget()` returning HTMLElement | Port the tier pills, organ groups, synthesized signals rendering using `ui.divV()`, `ui.divH()`, `ui.label()`. |
| `frontend/src/components/analysis/panes/InsightBlock.tsx` | Utility function used by `buildInsightsWidget()` | |
| `frontend/src/components/analysis/panes/ToxFindingForm.tsx` | Utility function `buildToxFindingForm()` returning HTMLElement | Use `ui.input.choice()` + `ui.input.string()` + `ui.bigButton()`. |
| `frontend/src/components/analysis/panes/PathologyReviewForm.tsx` | Utility function `buildPathologyReviewForm()` returning HTMLElement | Same pattern as ToxFindingForm. |
| `frontend/src/components/analysis/panes/ValidationIssueForm.tsx` | Utility function `buildValidationIssueForm()` returning HTMLElement | |
| `frontend/src/components/analysis/panes/ValidationRecordForm.tsx` | Utility function `buildValidationRecordForm()` returning HTMLElement | |
| `frontend/src/components/analysis/panes/StatisticsPane.tsx` | `ui.tableFromMap()` inside accordion pane | |
| `frontend/src/components/analysis/panes/CorrelationsPane.tsx` | `ui.divV()` with mini-grid inside accordion pane | |
| `frontend/src/components/analysis/panes/EffectSizePane.tsx` | `ui.tableFromMap()` inside accordion pane | |
| `frontend/src/components/analysis/panes/TreatmentRelatedSummaryPane.tsx` | `ui.divV()` with text inside accordion pane | |
| `frontend/src/components/analysis/panes/DoseResponsePane.tsx` | `ui.divV()` with mini-table inside accordion pane | |
| `frontend/src/components/data-table/DataTable.tsx` | Eliminated. Use Datagrok grid. | |
| `frontend/src/components/data-table/DataTablePagination.tsx` | Eliminated. Datagrok grid has virtual scrolling. | |
| `frontend/src/components/ui/*.tsx` (shadcn) | Eliminated. Use `ui.*` Datagrok primitives. | |
| `frontend/src/contexts/SelectionContext.tsx` | `df.currentRow` + `df.onCurrentRowChanged` | |
| `frontend/src/contexts/FindingSelectionContext.tsx` | `df.currentRow` on findings DataFrame | |
| `frontend/src/contexts/SignalSelectionContext.tsx` | `df.currentRow` + `df.selection` on signals DataFrame | |
| `frontend/src/contexts/ViewSelectionContext.tsx` | `df.currentRow` on view-specific DataFrame | |
| `frontend/src/hooks/useStudies.ts` | `grok.functions.call('SendBrowser:LoadStudies')` | |
| `frontend/src/hooks/useStudyMetadata.ts` | `grok.functions.call('SendBrowser:LoadStudyMetadata', {studyId})` | |
| `frontend/src/hooks/useDomains.ts` | `grok.functions.call('SendBrowser:LoadDomains', {studyId})` | |
| `frontend/src/hooks/useDomainData.ts` | `grok.functions.call('SendBrowser:LoadDomainData', {studyId, domain})` | |
| `frontend/src/hooks/useDomainsByStudy.ts` | Combined into LoadDomains script | |
| `frontend/src/hooks/useStudySignalSummary.ts` | `grok.functions.call('SendBrowser:LoadSignalSummary', {studyId})` | Returns DG.DataFrame |
| `frontend/src/hooks/useTargetOrganSummary.ts` | `grok.functions.call('SendBrowser:LoadTargetOrganSummary', {studyId})` | |
| `frontend/src/hooks/useDoseResponseMetrics.ts` | `grok.functions.call('SendBrowser:LoadDoseResponseMetrics', {studyId})` | |
| `frontend/src/hooks/useOrganEvidenceDetail.ts` | `grok.functions.call('SendBrowser:LoadOrganEvidence', {studyId})` | |
| `frontend/src/hooks/useLesionSeveritySummary.ts` | `grok.functions.call('SendBrowser:LoadLesionSeverity', {studyId})` | |
| `frontend/src/hooks/useNoaelSummary.ts` | `grok.functions.call('SendBrowser:LoadNoaelSummary', {studyId})` | |
| `frontend/src/hooks/useAdverseEffectSummary.ts` | `grok.functions.call('SendBrowser:LoadAdverseEffectSummary', {studyId})` | |
| `frontend/src/hooks/useRuleResults.ts` | `grok.functions.call('SendBrowser:LoadRuleResults', {studyId})` | |
| `frontend/src/hooks/useAdverseEffects.ts` | `grok.functions.call('SendBrowser:LoadAdverseEffects', {studyId})` | No pagination params; returns full DataFrame. |
| `frontend/src/hooks/useAESummary.ts` | Combined into LoadAdverseEffects (summary is a tag on the DataFrame) | |
| `frontend/src/hooks/useFindingContext.ts` | Pre-computed columns in the adverse effects DataFrame, or a separate script call | |
| `frontend/src/hooks/useAnnotations.ts` | Datagrok entity storage or `df.setTag()` | |
| `frontend/src/hooks/useValidationResults.ts` | `grok.functions.call('SendBrowser:RunValidation', {studyId})` | |
| `frontend/src/hooks/useAffectedRecords.ts` | Combined into RunValidation (second output DataFrame) | |
| `frontend/src/hooks/useRunValidation.ts` | Combined into RunValidation | |
| `frontend/src/lib/api.ts` | Eliminated. No HTTP fetch needed. | |
| `frontend/src/lib/analysis-api.ts` | Eliminated. Use `grok.functions.call()`. | |
| `frontend/src/lib/analysis-view-api.ts` | Eliminated. Use `grok.functions.call()`. | |
| `frontend/src/lib/annotations-api.ts` | Eliminated. Use Datagrok storage API. | |
| `frontend/src/lib/analysis-definitions.ts` | Constant array in `src/constants.ts` | Remove `implemented` flags. Keep view keys and labels. |
| `frontend/src/lib/severity-colors.ts` | `src/utils/colors.ts` | Port as-is. Pure TypeScript. |
| `frontend/src/lib/signals-panel-engine.ts` | `src/utils/signals-engine.ts` | Port as-is. Pure TypeScript. |
| `frontend/src/lib/rule-synthesis.ts` | `src/utils/rule-synthesis.ts` | Port as-is. Pure TypeScript. |
| `frontend/src/lib/report-generator.ts` | `src/utils/report-generator.ts` | Port as-is. Generates standalone HTML from data. Replace `fetch()` calls with `grok.functions.call()`. |
| `frontend/src/lib/send-categories.ts` | `src/constants.ts` | SEND domain categorization. Port as-is. |
| `frontend/src/lib/utils.ts` | `src/utils/utils.ts` | Utility functions. Port as-is. |
| `frontend/src/types/index.ts` | `src/types/index.ts` | Port as-is. |
| `frontend/src/types/analysis.ts` | `src/types/analysis.ts` | Port as-is. Some types become DataFrame column schemas. |
| `frontend/src/types/analysis-views.ts` | `src/types/analysis-views.ts` | Port as-is. |
| `frontend/src/types/annotations.ts` | `src/types/annotations.ts` | Port as-is. |

---

## 5. Migration Sequence

Port in this order. Each phase builds on the previous one and produces a working (if incomplete) Datagrok plugin.

### Phase 1: Package Skeleton + Data Loading (Days 1-2)

**Goal:** A Datagrok package that loads XPT data and displays it in a grid.

1. **Create the Datagrok package** with `package.json`, `src/package.ts`, `detectors.ts`.
2. **Port `xpt_processor.py`** as `scripts/load_xpt.py`. Takes study_id and domain_name, reads XPT, returns DataFrame.
3. **Port `study_discovery.py`** as `scripts/load_studies.py`. Returns a DataFrame of available studies.
4. **Register the app entry point** (`//tags: app`). Create a view, load the studies DataFrame, display in a TableView.
5. **Add a browsing tree** (`ui.tree()` in toolbox) with study > domain hierarchy.
6. **Wire tree navigation**: clicking a domain item loads the domain DataFrame and creates a TableView.
7. **Add semantic type detectors** for USUBJID, ARMCD, etc.

**Dependencies:** None. This is the foundation.

### Phase 2: Generator Pipeline + Signal Summary View (Days 3-5)

**Goal:** The Study Summary view (View 1) with signal heatmap and grid.

1. **Port the generator pipeline** (`generate.py`, `domain_stats.py`, `scores_and_rules.py`, `organ_map.py`, `view_dataframes.py`) as Python scripts. Main script: `scripts/generate_analysis.py` takes study_id, returns multiple DataFrames (signal_summary, target_organ_summary, etc.).
2. **Build the Study Summary view**: create a TableView from signal_summary DataFrame.
3. **Add grid color coding** via `grid.onCellPrepare()` for signal_score, p_value, direction, severity, domain.
4. **Port `severity-colors.ts`** as `src/utils/colors.ts`.
5. **Build the signal heatmap** as a `DG.JsViewer` subclass.
6. **Add filters** via `tv.filters()` for Sex, Organ System, Endpoint Type.
7. **Add the Study Details tab** with `ui.tabControl()` and `ui.tableFromMap()` for metadata.
8. **Build the context panel**: register an info panel that shows statistics and correlations for the selected signal.
9. **Port `signals-panel-engine.ts`** and `rule-synthesis.ts`** for insights.

**Dependencies:** Phase 1 (package skeleton, XPT loading).

### Phase 3: Views 2-5 (Days 6-9)

**Goal:** All four analysis views fully functional.

1. **Dose-Response View (View 2)**: Create TableView from dose_response_metrics DataFrame. Add `tv.lineChart()` and `tv.barChart()`. Add endpoint search in toolbox. Port DoseResponseContextPanel.
2. **Target Organs View (View 3)**: Create composite view with `ui.card()` organ cards + evidence grid. Wire card click to filter evidence DataFrame. Port TargetOrgansContextPanel.
3. **Histopathology View (View 4)**: Create composite view with severity heatmap JsViewer + lesion grid. Port PathologyReviewForm. Port HistopathologyContextPanel.
4. **NOAEL Decision View (View 5)**: Create composite view with NOAEL banner cards + adversity matrix JsViewer + adverse effects grid. Port NoaelContextPanel.
5. **Wire cross-view navigation**: tree item clicks, context panel "Related Views" links.

**Dependencies:** Phase 2 (generator output provides DataFrames for all views).

### Phase 4: Adverse Effects + Validation (Days 10-12)

**Goal:** The two remaining views with their unique data flows.

1. **Port the adverse effects pipeline** (`unified_findings.py`, `classification.py`, `statistics.py`, `correlations.py`, `context_panes.py`, `findings_*.py`) as Python scripts.
2. **Build the Adverse Effects view**: TableView from unified findings DataFrame. Grid with dynamic dose-group columns. Port all 5 context panes.
3. **Port the validation engine** (`engine.py`, all `checks/*.py`, `models.py`) as Python scripts.
4. **Build the Validation view**: `ui.splitV()` with rules grid + records grid. Wire selection linking. Port the two-mode context panel. Port fix application scripts.

**Dependencies:** Phase 1 (XPT loading), Phase 2 (generator for some shared utilities).

### Phase 5: Polish + Forms + Annotations (Days 13-15)

**Goal:** Complete the annotation system and refine the UI.

1. **Implement annotation persistence**: use Datagrok entity storage or database connection. Port ToxFindingForm, PathologyReviewForm, ValidationIssueForm, ValidationRecordForm using `ui.input.*` controls.
2. **Add ribbon actions** for all views: Export, Refresh, Generate Report.
3. **Port the report generator** (`report-generator.ts`): replace `fetch()` with `grok.functions.call()`.
4. **Add rich tooltips** via `ui.tooltip.bind()` for grid cells with complex data.
5. **Add progress indicators** via `DG.TaskBarProgressIndicator` for data loading.
6. **Polish grid column visibility**: hide internal columns, set display order, set column widths.
7. **Test cross-view navigation**: verify tree, context panel links, and selection propagation.

**Dependencies:** All previous phases.

---

## Appendix A: Key Datagrok API Quick Reference

For the porting agent's convenience, here are the most frequently needed calls:

```typescript
// Create app view
const view = grok.shell.newView('SEND Browser');

// Create table view from DataFrame
const tv = grok.shell.addTableView(df);

// Call Python script
const df = await grok.functions.call('SendBrowser:LoadSignalSummary', { studyId: 'PointCross' });

// Set up toolbox with tree
const acc = ui.accordion('SEND Browser');
acc.addPane('Studies', () => { const tree = ui.tree(); /* ... */ return tree.root; });
view.toolbox = acc.root;

// Add filters
tv.filters({ filters: [
  { column: 'sex', type: DG.FILTER_TYPE.CATEGORICAL },
  { column: 'organ_system', type: DG.FILTER_TYPE.CATEGORICAL },
]});

// Color-code grid cells
tv.grid.onCellPrepare((gc) => {
  if (gc.isTableCell && gc.tableColumn!.name === 'p_value') {
    const p = gc.cell.value;
    if (p < 0.001) gc.style.backColor = DG.Color.fromHtml('#D32F2F');
    else if (p < 0.01) gc.style.backColor = DG.Color.fromHtml('#F57C00');
    else if (p < 0.05) gc.style.backColor = DG.Color.fromHtml('#FBC02D');
    else gc.style.backColor = DG.Color.fromHtml('#388E3C');
  }
});

// React to selection
df.onCurrentRowChanged.subscribe(() => {
  const row = df.currentRow;
  const endpoint = row.get('endpoint_label');
  // Update context panel...
});

// Ribbon
view.setRibbonPanels([[
  ui.iconFA('file-export', () => generateReport(), 'Generate Report'),
  ui.iconFA('sync', () => refreshData(), 'Refresh'),
]]);

// Info panel (in package.ts, with annotations)
//name: Signal Details
//tags: panel, widgets
//input: string endpointLabel {semType: EndpointLabel}
//output: widget result
export function signalDetailsPanel(endpointLabel: string): DG.Widget {
  const acc = ui.accordion('Details');
  acc.addPane('Statistics', () => ui.tableFromMap({ /* ... */ }));
  acc.addPane('Insights', () => buildInsightsWidget(endpointLabel));
  return new DG.Widget(acc.root);
}
```

## Appendix B: Color Constants (Port Directly)

These hex values transfer 1:1 from `severity-colors.ts`:

```typescript
// P-value color scale
const P_VALUE_COLORS = {
  HIGHLY_SIGNIFICANT: '#D32F2F',  // p < 0.001
  SIGNIFICANT: '#F57C00',          // p < 0.01
  MARGINALLY_SIGNIFICANT: '#FBC02D', // p < 0.05
  NOT_SIGNIFICANT: '#388E3C',      // p >= 0.05
};

// Signal score color scale
const SIGNAL_SCORE_COLORS = {
  VERY_HIGH: '#D32F2F',  // 0.8-1.0
  HIGH: '#F57C00',        // 0.6-0.8
  MODERATE: '#FBC02D',    // 0.4-0.6
  LOW: '#81C784',          // 0.2-0.4
  MINIMAL: '#388E3C',     // 0.0-0.2
};

// Severity heat scale
const SEVERITY_HEAT = {
  MINIMAL: '#FFF9C4',
  MILD: '#FFE0B2',
  MODERATE: '#FFB74D',
  MARKED: '#FF8A65',
  SEVERE: '#E57373',
};

// Dose group colors
const DOSE_COLORS = {
  CONTROL: '#1976D2',
  LOW: '#66BB6A',
  MID: '#FFA726',
  HIGH: '#EF5350',
};

// Sex colors
const SEX_COLORS = {
  MALE: '#1565C0',
  FEMALE: '#C62828',
};

// Domain badge colors
const DOMAIN_COLORS: Record<string, { bg: string; text: string }> = {
  LB: { bg: '#DBEAFE', text: '#1D4ED8' },    // blue-100, blue-700
  BW: { bg: '#D1FAE5', text: '#047857' },    // emerald-100, emerald-700
  OM: { bg: '#EDE9FE', text: '#7C3AED' },    // purple-100, purple-700
  MI: { bg: '#FFE4E6', text: '#BE123C' },    // rose-100, rose-700
  MA: { bg: '#FFEDD5', text: '#C2410C' },    // orange-100, orange-700
  CL: { bg: '#CFFAFE', text: '#0E7490' },    // cyan-100, cyan-700
};
```
