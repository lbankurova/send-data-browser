# DG Platform Knowledge Gaps

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
