# Datagrok Application Design Patterns

A generalized pattern library for building Datagrok applications. Every pattern described here was extracted from the SEND Data Browser prototype and applies to any domain-specific Datagrok app (clinical, genomics, chemistry, engineering). Patterns reference the canonical API file (`datagrok-patterns.ts`) by number.

---

## 1. Navigation Patterns

### 1.1 Toolbox Tree as Primary Navigation

**Pattern:** Use an accordion-based tree in the left toolbox as the sole navigation mechanism. Do not use tab bars, URL routes, or sidebar icons for primary view switching.

**When to use:** Any application with more than two views or data categories.

**When NOT to use:** Single-view applications or embedded viewers that occupy a table view with no custom navigation.

**API reference:** Pattern #9 (Toolbox), Pattern #16 (Tree View)

**Implementation:**
```typescript
const acc = ui.accordion('App Name');
acc.addPane('Analysis Views', () => {
  const tree = ui.tree();
  tree.group('Summary').item('Study Summary');
  tree.group('Drill-Down').item('Dose-Response');
  tree.group('Drill-Down').item('Target Organs');
  return tree.root;
});
acc.addPane('Raw Data', () => {
  const tree = ui.tree();
  tree.group('Domains').item('Demographics');
  tree.group('Domains').item('Laboratory');
  return tree.root;
});
view.toolbox = acc.root;
```

**Tree structure conventions:**
- Group by function, not by data source. In SEND Data Browser, the tree groups are "Analysis Views" (study summary, dose-response, target organs, histopathology, NOAEL) and "Domains" (DM, LB, BW, MI, etc.). The user thinks "I want to analyze dose-response," not "I want the dose_response_metrics DataFrame."
- Place analysis/insight views above raw data views. This reinforces the "insights first" principle (see Section 2.1).
- Use descriptive labels, not codes. "Laboratory (LB)" not just "LB." Include the code in parentheses for domain experts who think in codes.
- Indent sub-items under groups. Do not flatten the tree.

**SEND Data Browser example:** The browsing tree has two top-level groups. "Analysis Views" contains Study Summary, Dose-Response, Target Organs, Histopathology, NOAEL & Decision, and Validation. "Domains" contains all SEND domain tables (DM, LB, BW, MI, MA, CL, OM). Clicking any item swaps the center panel content.

---

### 1.2 View Switching with State Preservation

**Pattern:** When the user navigates from View A to View B and back to View A, restore View A's filter state, scroll position, selection, and sort order. The user should never lose context by switching views.

**When to use:** Always. Every multi-view application.

**When NOT to use:** Never. Losing state on navigation is always a defect.

**API reference:** Pattern #20 (Events), Pattern #2 (DataFrame filter/selection)

**Implementation approach:**
- Store filter state, sort state, and selection in a shared context (React Context, Datagrok property bag, or a state management object).
- Tag each state object with a `_view` discriminator so views do not collide.
- On view mount, read the persisted state. On view unmount (or navigation away), persist the current state.

**SEND Data Browser example:** The `ViewSelectionContext` carries `_view` tags (`"dose-response"`, `"validation"`, etc.) so each view's selection survives navigation. Filters are held in local state keyed by view, and React Query caches server data for 5 minutes, so returning to a view does not trigger a reload.

---

### 1.3 No Route-Based Navigation for Internal Views

**Pattern:** Treat the Datagrok shell as a single-page container. Internal view switching happens by swapping content in the center panel, not by changing browser URLs.

**When to use:** Datagrok plugin development where the shell provides the chrome (toolbox, context panel, ribbon).

**When NOT to use:** Standalone web applications that need bookmarkable URLs or browser back-button navigation. The SEND Data Browser prototype used React Router because it was a standalone app, but in a true Datagrok plugin, the shell manages view lifecycle.

**API reference:** Pattern #3 (TableView), Pattern #1 (Package boilerplate)

**Rationale:** Datagrok's `grok.shell` manages view lifecycle. Adding URL routing creates a parallel navigation system that fights the shell. Use the toolbox tree click handler to call `grok.shell.addTableView()` or swap a custom view's content.

---

## 2. Information Architecture

### 2.1 Insights First, Data Second

**Pattern:** Default the user into an analysis/insight view, not a raw data table. Raw data is available one click away but is not the starting point.

**When to use:** Any application where users make decisions from computed results rather than raw records.

**When NOT to use:** Data entry or data cleaning tools where the raw records ARE the primary work surface.

**API reference:** Pattern #25 (Complete pattern: Building a Study Analysis View)

**SEND Data Browser example:** When a user opens a study, they land on the Study Summary view showing a signal heatmap, synthesized insights, and target organ identification. The raw domain tables (DM, LB, BW) are available in the tree under "Domains" but are not the default. The scientific question "What happened in this study?" is answered immediately without requiring the user to navigate to individual data tables and mentally synthesize the results.

**Anti-pattern:** Landing on a list of domain tables with row counts and forcing the user to open each one to find patterns. This is the "spreadsheet dump" anti-pattern.

---

### 2.2 Context Panel as the Primary Detail Surface

**Pattern:** Use the right-side context panel (Datagrok's property/info panel area) as the primary surface for showing details about the currently selected item. Do not use modals, dedicated detail pages, or inline expansion rows.

**When to use:** Any time the user needs to see details about a selected row, cell, or visual element while keeping the overview visible.

**When NOT to use:** Configuration dialogs that require focused user input (use `ui.dialog()` for those). Bulk data display that exceeds 280px of width.

**API reference:** Pattern #6 (Info Panels), Pattern #7 (Custom Info Panels), Pattern #8 (Accordion)

**Context panel structure (accordion panes, ordered by priority):**
1. **Domain-specific insights** (expanded by default) -- synthesized rules, narrative text, key findings
2. **Statistics / metrics** (expanded by default) -- quantitative details about the selection
3. **Related items** (expanded by default) -- cross-references, correlations, linked entities
4. **Annotation / review form** (collapsed by default, or expanded in review-focused views) -- human judgment capture
5. **Navigation links** (collapsed by default) -- cross-view links to drill deeper

**SEND Data Browser example:** Every analysis view has a context panel with this structure. The Study Summary context panel shows InsightsList (synthesized rules), Statistics (signal score, p-value, effect size), Correlations (other findings in the same organ), and Tox Assessment (annotation form). Selection in the heatmap, grid, or Findings cards all update the same context panel.

---

### 2.3 Cross-View Linking via Identifiers

**Pattern:** Include clickable links in context panel panes that navigate to a related view with a filter pre-applied. The link text names the destination and the filter: "View in dose-response" or "View target organ: Liver."

**When to use:** Any time two views share a common identifier (endpoint, organ, subject, compound).

**When NOT to use:** Do not link between views that share no common filter key. A link that navigates but cannot apply a filter is disorienting.

**API reference:** Pattern #16 (Tree View for navigation), Pattern #20 (Events for cross-view communication)

**Implementation:**
- The link handler sets a filter value in the shared selection context, then triggers a view switch.
- The target view reads the shared context on mount and applies the filter.
- Use a `pendingNavigation` state pattern: set the target (view + filter), trigger navigation, let the target view consume and clear the pending state.

**SEND Data Browser example:** In the Study Summary context panel, correlation rows are clickable. Clicking "AST" in the correlations table navigates to the Dose-Response view. In every context panel, a "Related views" pane offers links: "View target organ: Liver" navigates to Target Organs, "View histopathology" navigates to Histopathology, "View NOAEL decision" navigates to NOAEL & Decision.

---

## 3. Data Display Patterns

### 3.1 The Universal View Layout: Grid + Chart + Context Panel

**Pattern:** Every analysis view follows the same three-zone layout:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            | Filters (top bar)          |            |
| Toolbox    | Chart(s)                   | Context    |
| Tree       | Grid (table)               | Panel      |
|            |                            | (accordion)|
+------------+----------------------------+------------+
```

Filters at the top of the center panel. Chart(s) above the grid. Grid below. Context panel on the right updating on selection.

**When to use:** Every analysis view. This is the Datagrok interaction model.

**When NOT to use:** Landing pages (no grid, no chart -- just a list/table and hero). Configuration screens.

**API reference:** Pattern #3 (TableView), Pattern #4 (Viewers), Pattern #5 (Filters), Pattern #9 (Toolbox)

**The filter-chart-grid stack:**
- Filters live in a horizontal bar at the top of the center panel (within the view, not in the toolbox). Dropdowns, search inputs, range sliders, checkboxes. All `text-xs`, compact.
- Charts occupy a collapsible area below the filters. When no item is selected (for charts that require selection), show a prompt: "Select an endpoint to view the chart."
- The grid occupies the remaining height, scrollable. TanStack Table or Datagrok Grid.
- Filters apply client-side to both the chart and the grid simultaneously. Changing a filter updates the grid row count and the chart data.

**SEND Data Browser example:** The Dose-Response view has a filter bar (endpoint search, sex, data type, organ system), a Recharts chart area (line/bar chart per sex), and a metrics grid (1342 rows, 12 columns). Selecting a row in the grid updates the chart and the context panel. Applying a filter narrows both the grid and the chart.

---

### 3.2 Color Coding Conventions

**Pattern:** Use consistent, application-wide color scales for recurring data categories. Define them once, use them everywhere.

**Color scale categories:**

| Category | Use case | Scale type |
|----------|----------|------------|
| Statistical significance | p-values across any statistical test | Diverging: red (significant) to green (not significant) |
| Severity / risk gradient | Severity scores, signal scores, risk levels | Sequential: light warm (low) to dark warm (high) |
| Categorical groups | Dose groups, treatment arms, domains | Qualitative: distinct hues per category |
| Binary sex differentiation | Male vs. female | Two-color: blue (M), red (F) |

**Rules for color-coded cells:**
- Use background color for the cell, not just text color. Background is visible at a glance in dense grids.
- When background is dark (score >= 0.5 on a 0-1 scale), use white text. When background is light, use dark gray text.
- Null/missing values get no color (default background) and display an em dash.
- Always provide a text value alongside the color. Color alone is not accessible.

**API reference:** Pattern #23 (Grid Customization -- Cell Rendering, Color Coding)

**SEND Data Browser example:** The signal heatmap uses the signal score palette (green to red). The grid uses p-value colors for the p-value column, domain-specific colors for domain badges (LB=blue, BW=emerald, MI=rose, etc.), and dose-level colors for dose badges (control=gray, low=blue, mid=amber, high=red). These same palettes appear in every view.

See Document 2 (`datagrok-visual-design-guide.md`) for the exact hex values.

---

### 3.3 Sentence Case Throughout

**Pattern:** Use sentence case for all UI text. Column headers, section headers, button labels, dropdown options, descriptions, tooltips.

**Exceptions:**
- Dialog titles and L1 page headers: Title Case ("SEND Validation", "Study: PointCross")
- Context menu action labels: Title Case ("Export to CSV", "Copy Issue ID")
- Domain codes and abbreviations: UPPERCASE ("DM", "LB", "USUBJID")
- Specific button exceptions: OK, SAVE, RUN

**When to use:** Always. This is a firm convention, not a guideline.

**SEND Data Browser example:**
- Button: "Apply fix", "Flag for review", "Generate report"
- Column header: "Signal score", "Review status", "Assigned to"
- Section header: "Rule detail", "Review progress", "Suggested fix"
- Dropdown: "Not reviewed", "Accept all"

---

## 4. Interaction Patterns

### 4.1 The Selection Cascade

**Pattern:** Every interactive view follows this interaction flow:

```
User clicks item (grid row, heatmap cell, chart element, card)
    |
    v
Selection state updates (shared context)
    |
    v
Context panel re-renders with details for the selected item
    |
    v
Context panel shows insights, statistics, related items, and cross-view links
    |
    v
User clicks cross-view link in context panel
    |
    v
Target view opens with filter pre-applied to the linked identifier
```

**When to use:** Every analysis view. This is the core interaction loop.

**When NOT to use:** Landing pages where selection means "choose which study to open" (use double-click or context menu to open, not the selection cascade).

**API reference:** Pattern #20 (Events -- onCurrentRowChanged, onSelectionChanged), Pattern #7 (Custom Info Panels)

**Implementation details:**
- Debounce selection updates at 50-200ms to avoid rapid context panel re-renders during keyboard navigation.
- Click on the same item again deselects (toggle behavior).
- Selection is mutually exclusive within a view: selecting an organ clears any endpoint selection, and vice versa.
- Context panel shows a prompt when nothing is selected: "Select a signal from the heatmap or grid to view details."

**SEND Data Browser example:** In Study Summary, clicking a heatmap cell sets the selection (endpoint + dose + sex). The context panel updates to show insights for that endpoint, statistics for that specific signal, correlations within the organ system, and a Tox Assessment annotation form. The user can then click "View in dose-response" in the correlations pane to navigate to the Dose-Response view filtered to that endpoint.

---

### 4.2 Filters in the View, Not in the Toolbox

**Pattern:** Place per-view filters in a compact horizontal bar at the top of the center panel content area. Do not put them in the left toolbox.

**When to use:** When filters are view-specific (endpoint, sex, severity) and change frequently during analysis.

**When NOT to use:** Global filters that affect multiple views (e.g., study selection) belong in the toolbox. Datagrok's built-in filter viewer (`tv.filters()`) docks in the left panel -- this is fine for exploration of a single table view. But for custom analysis views, inline filters are better.

**API reference:** Pattern #5 (Filters), Pattern #14 (Input Controls)

**Filter bar conventions:**
- Compact: `text-xs` labels, `rounded border bg-background px-2 py-1 text-xs` controls.
- Horizontal flex-wrap: `flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2`.
- Row count indicator right-aligned: "{filtered} of {total} rows".
- Apply client-side to both grid and charts simultaneously.
- Default to "All" for every filter (no pre-filtering on load).

**SEND Data Browser example:** Every analysis view has a filter bar. The Study Summary Signals tab filters by endpoint type, organ, sex, min score, and significance. The Dose-Response view filters by endpoint search (with autocomplete), sex, data type, and organ system. The Validation view has status and subject filters in its divider bar.

---

### 4.3 Ribbon for Actions, Not Navigation

**Pattern:** Use the ribbon (top action bar) for view-specific actions: export, refresh, generate report, settings. Do not use the ribbon for navigation between views.

**When to use:** When a view has actionable operations (export, compute, annotate).

**When NOT to use:** Do not add view-switching buttons to the ribbon. Navigation belongs in the toolbox tree.

**API reference:** Pattern #10 (Ribbon)

**Implementation:**
```typescript
view.setRibbonPanels([[
  ui.iconFA('download', () => exportData(), 'Export data'),
  ui.iconFA('sync', () => refreshAnalysis(), 'Refresh analysis'),
  ui.iconFA('file-alt', () => generateReport(), 'Generate report'),
]]);
```

**SEND Data Browser example:** The Study Summary view has a "Generate Report" button in the tab bar (acting as a ribbon-level action). The landing page has context menu actions (Open Study, Open Validation, Generate Report, Export) rather than ribbon buttons, because the landing page is a list, not an analysis view.

---

## 5. Annotation Patterns

### 5.1 Expert Judgment Capture (Sticky Meta)

**Pattern:** Provide annotation forms in the context panel for capturing expert judgment. Forms appear as the last accordion pane in the context panel and are keyed to the currently selected item.

**When to use:** Any domain where human judgment must be recorded alongside computed data (toxicology assessments, pathology reviews, data quality decisions, compliance dispositions).

**When NOT to use:** Fully automated views with no human decision step.

**API reference:** Pattern #7 (Custom Info Panels), Pattern #8 (Accordion), Pattern #14 (Input Controls)

**Form conventions:**
- Dropdowns for categorical judgments: "Treatment related: Yes / No / Equivocal / Not Evaluated"
- Textarea for free-text comments: 2 rows, placeholder text.
- SAVE button: `bg-primary text-primary-foreground`, disabled when no changes or while saving.
- Footer: reviewer name + date of last save.
- Form is keyed by the selection identifier (endpoint label, issue ID, subject ID). Changing selection loads the saved annotation for the new item.

**SEND Data Browser example:** The `ToxFindingForm` captures treatment-relatedness, adversity, and comments for each toxicology finding. The `ValidationRecordForm` captures review status, assigned reviewer, and disposition for each validation issue. Both persist via a REST API with React Query managing cache invalidation.

---

### 5.2 Two-Track Status Workflows

**Pattern:** Separate "what happened to the data" (fix status) from "what a human decided" (review status). These are independent tracks.

**When to use:** Compliance, validation, and quality review workflows where automated and human actions coexist.

**When NOT to use:** Simple annotation workflows with a single status (e.g., "reviewed / not reviewed").

**Fix status track:** Not fixed -> Auto-fixed / Manually fixed / Accepted as-is / Flagged

**Review status track:** Not reviewed -> Reviewed -> Approved

**SEND Data Browser example:** The Validation view uses two independent status tracks. Fix status tracks what happened to the underlying data issue (auto-fixed by script, manually corrected, accepted as intentional). Review status tracks human sign-off (not reviewed, reviewed, approved). An item can be "Auto-fixed" (fix status) but "Not reviewed" (review status) -- the automation ran but no human has confirmed it.

---

### 5.3 Annotations Visible Across Views

**Pattern:** Annotations saved in one view must be visible when the same entity appears in another view. If a user marks a finding as "Treatment-related" in the Dose-Response context panel, that annotation must appear when the same finding is viewed in the Study Summary context panel.

**When to use:** Multi-view applications where the same entity (finding, subject, organ) appears in multiple views.

**When NOT to use:** Single-view applications where this is not applicable.

**Implementation:** Key annotations by a stable identifier (endpoint label, subject ID, issue ID), not by view or route. Store once, read everywhere.

**SEND Data Browser example:** The `ToxFindingForm` is keyed by `endpointLabel`. Whether the user opens it from Study Summary, Dose-Response, or Target Organs, the same annotation data loads because the key is the same. React Query caching ensures the most recent save is reflected across all views without explicit synchronization.

---

## 6. Master-Detail Patterns

### 6.1 Dual-Pane Master-Detail (Validation Pattern)

**Pattern:** Split the center panel into two vertical panes: a master table (top, 40% height) and a detail table (bottom, 60% height). Selecting a row in the master table populates the detail table with related records.

**When to use:** Compliance/validation views, grouped issue triage, any workflow where items group under categories.

**When NOT to use:** Analysis views where the grid + chart + context panel layout is more appropriate.

**SEND Data Browser example:** The Validation view splits into a rules table (top, 8 rules) and an affected records table (bottom, records for the selected rule). A divider bar between them shows the record count and inline filters. Selecting a rule populates the bottom table. Clicking an issue ID in the bottom table switches the context panel from "rule" mode to "issue" mode.

---

### 6.2 Context Panel Mode Switching

**Pattern:** When a context panel must show fundamentally different content for different entity types (rule vs. record, organ vs. endpoint), implement mode switching with back/forward navigation.

**When to use:** Views where the user drills from a summary entity to a child entity within the same view (e.g., rule -> affected record).

**When NOT to use:** Views where the context panel always shows the same type of content (just with different data for different selections).

**Implementation:**
- Maintain a navigation history stack: `[{mode: "rule", id: "SD1002"}, {mode: "issue", id: "SD1002-003"}]`
- Show `<` and `>` navigation buttons at the top of the context panel.
- Mode 1 (summary): shows category-level detail, aggregate progress, disposition form.
- Mode 2 (detail): shows record-level detail, evidence rendering, per-record action buttons.

**SEND Data Browser example:** The Validation context panel has two modes. Mode 1 (Rule Review Summary) shows rule detail, review progress bar, and rule-level disposition. Mode 2 (Issue Review) shows record context, finding evidence, suggested fix, and per-record review form. The user navigates between modes via issue ID clicks (forward) and the back button (backward). The rule ID in Mode 2 is a clickable link back to Mode 1.

---

## 7. Dual-Mode Center Panel (Advanced)

### 7.1 Findings + Heatmap Toggle

**Pattern:** Provide two complementary representations of the same data in the center panel, toggled by a segmented control. One mode is narrative/synthesized (Findings), the other is spatial/quantitative (Heatmap/Grid). Both share the same selection state and context panel.

**When to use:** When the user needs both a high-level narrative summary and a detailed spatial/quantitative view of the same dataset.

**When NOT to use:** When one representation is sufficient. Do not add modes for the sake of adding modes.

**Implementation:**
- Segmented control: `[Findings] [Heatmap]` at the top of the center content, below any persistent elements.
- Persistent elements (Decision Bar, filter bar) remain visible across both modes.
- Selection state is shared: selecting an organ in Findings mode and switching to Heatmap mode preserves the selection.
- Cross-mode navigation: clicking an organ card in Findings mode can switch to Heatmap mode and scroll to that organ.

**SEND Data Browser example:** The Signals tab in Study Summary has a dual-mode center panel. Findings mode shows a structured synthesis: study-scope statements, target organ cards, modifiers, and review flags. Heatmap mode shows the organ-grouped signal matrix. A Decision Bar (NOAEL statement + metrics) persists across both modes. Clicking an organ card in Findings mode switches to Heatmap mode and expands/scrolls to that organ. Ctrl+click stays in Findings mode but selects the organ for the context panel. Escape returns from Heatmap to Findings.

---

## 8. Anti-Patterns

### 8.1 Do Not Use Modals for Detail Views

Modals break the context panel pattern. The user loses sight of the grid/chart while reading details. Use the context panel instead.

**Exception:** Configuration dialogs (settings, export options, NOAEL override) that require focused input.

### 8.2 Do Not Put Navigation in the Ribbon

The ribbon is for actions (export, refresh, compute). Navigation belongs in the toolbox tree. Mixing them confuses users about where to look for view switching.

### 8.3 Do Not Use Tabs for Primary View Navigation

Tabs suggest the content is related and switchable. Views in a Datagrok app are independent analyses. Use the tree, not tabs.

**Exception:** Tabs within a single view for sub-modes (Details tab + Signals tab within Study Summary).

### 8.4 Do Not Show Raw Data First

If the user opens the app and sees "DM: 48 rows, 15 columns | LB: 2,400 rows, 22 columns," they have to do mental work to find insights. Show the analysis first.

### 8.5 Do Not Use Inline Row Expansion for Details

Expanding a row inline pushes other rows down, destroying spatial context. Use the fixed-position context panel instead.

---

## Quick Reference: Pattern-to-API Mapping

| Pattern | datagrok-patterns.ts # | Key API |
|---------|------------------------|---------|
| Package boilerplate | #1 | `DG.Package`, `grok.shell.newView()` |
| DataFrame operations | #2 | `DG.DataFrame.fromCsv()`, `.filter`, `.selection` |
| Table view | #3 | `grok.shell.addTableView()` |
| Viewers (charts) | #4 | `tv.addViewer()`, `DG.Viewer.scatterPlot()` |
| Filters | #5 | `tv.filters()` |
| Info panels (annotated) | #6 | `//tags: panel, widgets` |
| Custom info panels | #7 | `df.onCurrentRowChanged.subscribe()` |
| Accordion | #8 | `ui.accordion()` |
| Toolbox | #9 | `view.toolbox = element` |
| Ribbon | #10 | `view.setRibbonPanels()`, `view.ribbonMenu` |
| Sidebar | #11 | `grok.shell.sidebar.addPane()` |
| Docking | #12 | `grok.shell.dockElement()` |
| UI primitives | #13 | `ui.divV()`, `ui.divH()`, `ui.panel()` |
| Input controls | #14 | `ui.input.choice()`, `ui.input.string()` |
| Dialogs | #15 | `ui.dialog()` |
| Tree view | #16 | `ui.tree()` |
| Notifications | #17 | `grok.shell.info()`, `.warning()`, `.error()` |
| Tooltips | #18 | `ui.tooltip.bind()` |
| Context menus | #19 | `DG.Menu.popup()` |
| Events | #20 | `df.onCurrentRowChanged`, `DG.debounce()` |
| Custom viewer | #21 | `DG.JsViewer` subclass |
| Semantic type detector | #22 | `//tags: semTypeDetector` |
| Grid customization | #23 | `grid.onCellPrepare()` |
| Progress indicator | #24 | `DG.TaskBarProgressIndicator.create()` |
| Complete study view | #25 | Composite pattern |
| File I/O | #26 | `_package.files.readAsText()` |
| Column manager | #27 | `grid.col().visible`, `grid.columns.setOrder()` |
