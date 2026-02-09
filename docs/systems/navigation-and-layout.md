# Navigation & Layout

## Purpose

Three-panel Datagrok-style layout with tree navigation, React Router-based view switching, and context-sensitive inspector. The layout gives toxicologists a workbench feel: navigate studies and domains on the left, work in the center, inspect details on the right. All panels are always visible; the center and right panels react to route changes and selection state.

## Architecture

### Layout Zones

```
+-------------------------------------------------------------+
| Header (h-14, border-b, bg-card)                            |
|  [Database icon]  SEND Data Browser                         |
+----------+-----------------------------+--------------------+
| Left     | Center                      | Right              |
| 260px    | flex-1 (min-w-0)            | 280px              |
| shrink-0 | overflow-y-auto             | shrink-0           |
| border-r |                             | border-l           |
| overflow  |  <Outlet /> (route content) | overflow-y-auto    |
| -y-auto  |                             |                    |
|          |                             |                    |
| Browsing |  (varies by route)          | ContextPanel       |
| Tree     |                             |                    |
+----------+-----------------------------+--------------------+
```

The outer shell is `flex h-screen flex-col`. The header is fixed height. Below it, `flex min-h-0 flex-1` arranges the three columns. Left and right panels have fixed widths and are scroll-independent from the center.

### Resizable Panels

Views 2-5 (Dose-Response, Target Organs, Histopathology, NOAEL Decision) use a two-panel master-detail layout where the left rail (organ/specimen/endpoint list) is resizable by dragging. This is implemented with two primitives:

**`useResizePanel(initial, min, max, direction?)` hook** (`frontend/src/hooks/useResizePanel.ts`):
- Parameters: `initial` (default width in px), `min` (minimum width), `max` (maximum width), `direction` (`"left"` or `"right"`, defaults to `"left"` -- `"left"` means dragging right increases width)
- Returns: `{ width: number, onPointerDown: (e: React.PointerEvent) => void }`
- Implementation: Uses pointer events with `setPointerCapture` for smooth dragging. Tracks drag state via refs (`dragging`, `startX`, `startW`). Clamps width to `[min, max]` on every pointer move. Cleans up listeners on pointer up or cancel.

**`PanelResizeHandle` component** (`frontend/src/components/ui/PanelResizeHandle.tsx`):
- Props: `onPointerDown: (e: React.PointerEvent) => void` (from `useResizePanel`)
- Renders a 4px-wide vertical drag handle between panels with `cursor-col-resize`. Shows `bg-primary/10` on hover and `bg-primary/20` when active.
- Placed between the left rail `<div>` (with `style={{ width }}`) and the right evidence panel.

**Usage pattern** in Views 2-5:
```tsx
const { width, onPointerDown } = useResizePanel(280, 180, 500);

<div className="flex flex-1 overflow-hidden">
  <div style={{ width }} className="shrink-0 overflow-y-auto border-r">
    {/* Left rail content */}
  </div>
  <PanelResizeHandle onPointerDown={onPointerDown} />
  <div className="flex-1 overflow-y-auto">
    {/* Right evidence panel */}
  </div>
</div>
```

Typical defaults: 280px initial width, 180px minimum, 500px maximum. Each view may adjust these values.

### Routing

React Router 7 (`createBrowserRouter`) defines a single layout route with `<Layout />` as the element and all view routes as children rendered via `<Outlet />`. There is no nested routing -- all routes are flat children of the layout.

Route resolution determines which component renders in the center panel. The `ContextPanel` component independently reads `useLocation()` and `useParams()` to decide which context panel variant to show.

### Selection State Flow

Four React Contexts wrap the entire app inside `<Layout />`, nested in this order (outer to inner):

1. `SelectionProvider` -- study-level selection (landing page hover/click)
2. `FindingSelectionProvider` -- adverse effects finding selection
3. `SignalSelectionProvider` -- Study Summary signal/organ selection
4. `ViewSelectionProvider` -- shared selection for Views 2-5 and Validation

Center panel components write to the appropriate context on user interaction (row click, cell click, card click). The `ContextPanel` reads from these contexts to show relevant detail.

## Contracts

### Routes

| Path | Component | Description | Primary Context |
|------|-----------|-------------|-----------------|
| `/` | `AppLandingPage` | Study list with import stub | `SelectionContext` (hover/select study) |
| `/studies/:studyId` | `StudySummaryViewWrapper` | View 1: signals, heatmap, findings | `SignalSelectionContext` |
| `/studies/:studyId/domains/:domainName` | `CenterPanel` | Raw domain data grid (paginated) | `SelectionContext` |
| `/studies/:studyId/analyses/adverse-effects` | `AdverseEffectsView` | Adverse effects table (server-paginated) | `FindingSelectionContext` |
| `/studies/:studyId/dose-response` | `DoseResponseViewWrapper` | View 2: dose-response charts + grid | `ViewSelectionContext` (`_view: "dose-response"`) |
| `/studies/:studyId/target-organs` | `TargetOrgansViewWrapper` | View 3: organ cards + evidence grid | `ViewSelectionContext` (`_view: "target-organs"`) |
| `/studies/:studyId/histopathology` | `HistopathologyViewWrapper` | View 4: severity heatmap + lesion grid | `ViewSelectionContext` (`_view: "histopathology"`) |
| `/studies/:studyId/noael-decision` | `NoaelDecisionViewWrapper` | View 5: NOAEL banner + adversity matrix | `ViewSelectionContext` (`_view: "noael"`) |
| `/studies/:studyId/clinical-observations` | `ClinicalObservationsViewWrapper` | View 6: CL domain timecourse bar charts | `ViewSelectionContext` (`_view: "clinical-observations"`) |
| `/studies/:studyId/validation` | `ValidationViewWrapper` | Validation rules + affected records | `ViewSelectionContext` (`_view: "validation"`) |
| `/studies/:studyId/analyses/:analysisType` | `PlaceholderAnalysisView` | Catch-all for unimplemented analysis types | None |

### Selection Contexts

#### SelectionContext

- **File**: `contexts/SelectionContext.tsx`
- **State**: `{ selectedStudyId: string | null }`
- **Actions**: `selectStudy(studyId: string | null)`
- **Used by**: `ContextPanel` (fallback study inspector), `BrowsingTree` (for URL-independent study tracking)
- **Behavior**: Set when user hovers/clicks a study on the landing page. Not cleared on route navigation.

#### SignalSelectionContext

- **File**: `contexts/SignalSelectionContext.tsx`
- **State**:
  - `selection: SignalSelection | null` -- endpoint-level selection with fields: `{ endpoint_label, dose_level, sex, domain, test_code, organ_system }`
  - `organSelection: string | null` -- organ-level selection (organ system name string)
- **Actions**: `setSelection(sel)`, `setOrganSelection(organ)`
- **Mutual exclusion**: Setting `selection` clears `organSelection` and vice versa.
- **Used by**: `StudySummaryView` (View 1), `StudySummaryContextPanel`
- **Events**: Endpoint cell click in heatmap/grid sets `selection`. Organ card click or organ header click sets `organSelection`.

#### ViewSelectionContext

- **File**: `contexts/ViewSelectionContext.tsx`
- **State**: `{ selection: Record<string, any> | null }`
- **Actions**: `setSelection(sel)`
- **Used by**: Views 2-5 and Validation. Each view tags its selection with `_view` to prevent cross-view interference.
- **Selection shapes by view**:
  - `_view: "dose-response"` -- `{ endpoint_label, sex?, domain?, organ_system? }`
  - `_view: "target-organs"` -- `{ organ_system, endpoint_label?, sex? }`
  - `_view: "histopathology"` -- `{ finding, specimen, sex? }`
  - `_view: "noael"` -- `{ endpoint_label, dose_level, sex }`
  - `_view: "validation"` -- `{ mode: "rule" | "issue", rule_id, severity, domain, category, description, records_affected, issue_id?, subject_id?, visit?, variable?, actual_value?, expected_value? }`
- **Key pattern**: `ContextPanel` wrapper functions cast `selection` back to the typed shape only when `selection?._view` matches the expected view tag. This prevents stale selections from a previous view leaking into the current context panel.

#### FindingSelectionContext

- **File**: `contexts/FindingSelectionContext.tsx`
- **State**:
  - `selectedFindingId: string | null` -- derived from `selectedFinding?.id`
  - `selectedFinding: UnifiedFinding | null` -- the full `UnifiedFinding` object
- **Actions**: `selectFinding(finding: UnifiedFinding | null)`
- **Used by**: `AdverseEffectsView`, `AdverseEffectsContextPanel`

### Context Panel Modes

The `ContextPanel` component (`components/panels/ContextPanel.tsx`) uses route-based pattern matching to decide what to render. It checks `location.pathname` against regex patterns in priority order:

1. `/studies/:id/analyses/adverse-effects` -- renders `AdverseEffectsContextPanel` (reads `FindingSelectionContext`)
2. `/studies/:id/noael-decision` -- renders `NoaelContextPanelWrapper` (reads `ViewSelectionContext`, filters for `_view === "noael"`)
3. `/studies/:id/target-organs` -- renders `TargetOrgansContextPanelWrapper`
4. `/studies/:id/dose-response` -- renders `DoseResponseContextPanelWrapper`
5. `/studies/:id/histopathology` -- renders `HistopathologyContextPanelWrapper`
6. `/studies/:id/clinical-observations` -- renders `ClinicalObsContextPanelWrapper` (reads `ViewSelectionContext`, filters for `_view === "clinical-observations"`, fetches CL timecourse data for statistics + dose relationship)
7. `/studies/:id/validation` -- renders `ValidationContextPanelWrapper`
8. `/studies/:id` (exact) -- renders `StudySummaryContextPanelWrapper` (reads `SignalSelectionContext`)
9. No study selected -- renders "Select a study to view details."
10. Non-PointCross study selected -- renders demo guard message
11. PointCross selected (fallback) -- renders `StudyInspector` (study metadata, study health one-liner, review progress, action links)

Each wrapper function reads the shared `ViewSelectionContext`, casts the selection to the view-specific shape (guarded by `_view` tag), fetches the required data via hooks, and passes both to the view-specific context panel component.

### Cross-View Navigation (GAP-03 resolved)

Each analysis view's context panel includes "Related views" links that use `navigate()` with `location.state` to carry selection context across view boundaries. The receiving view reads `location.state` in a `useEffect` hook, applies the relevant filter/selection, then clears the state via `window.history.replaceState({}, "")` to prevent re-application on refresh.

**State payloads passed via `navigate()`**:
- `{ organ_system }` — received by Target Organs (sets selected organ), Histopathology (sets specimen filter), NOAEL & Decision (sets organ_system filter)
- `{ endpoint_label, organ_system }` — received by Dose-Response (sets organ_system filter + endpoint search)

**Cross-view link patterns (from context panel panes)**:

- Dose-Response context panel links to: Target Organs, Histopathology, NOAEL & Decision
- Target Organs context panel links to: Dose-Response, Histopathology, NOAEL & Decision
- Histopathology context panel links to: Target Organs, Dose-Response, NOAEL & Decision
- NOAEL context panel links to: Dose-Response, Target Organs, Histopathology

**Findings-to-Heatmap navigation (within View 1)**:

The Study Summary view has a dual-mode center panel (Findings mode vs. Heatmap mode). Cross-mode navigation uses a `pendingNavigation` state pattern:

1. `PendingNavigation` type: `{ targetOrgan: string; targetEndpoint?: string }` (defined in `charts/OrganGroupedHeatmap.tsx`)
2. Organ card click in Findings mode calls `handleOrganNavigate(organKey)`:
   - Sets `organSelection` in `SignalSelectionContext`
   - Switches `centerMode` to `"heatmap"`
   - Sets `pendingNavigation = { targetOrgan: organKey }`
3. `OrganGroupedHeatmap` receives `pendingNavigation` as a prop, expands the target organ group, scrolls to it, and calls `onNavigationConsumed()` to clear the pending state.
4. Ctrl+click on organ card stays in Findings mode, sets organ selection only (context panel updates).
5. Escape in Heatmap mode returns to Findings mode. Escape in Findings mode clears selection.

## Components

### Header (`components/layout/Header.tsx`)

Fixed-height bar (`h-14`) with the app title "SEND Data Browser" and a `Database` lucide icon. Links to `/` (home). No dynamic state.

### Layout (`components/layout/Layout.tsx`)

The three-panel shell. Wraps children in four nested context providers: `SelectionProvider` > `FindingSelectionProvider` > `SignalSelectionProvider` > `ViewSelectionProvider`. Uses `<Outlet />` for center content. Imports `BrowsingTree` (left) and `ContextPanel` (right) directly.

### BrowsingTree (`components/tree/BrowsingTree.tsx`)

Left sidebar navigation tree. Structure:

- **Home** node (depth 0) -- navigates to `/`
- **Studies** section header (uppercase label)
  - **Study: {studyId}** node (depth 1) -- click navigates to `/studies/:studyId` and expands subtree
    - Analysis view nodes (depth 2): Dose-response, Target organs, Histopathology, NOAEL & decision, Clinical observations, Validation (from `ANALYSIS_VIEWS` array, excluding `study-summary`)
    - Separator
    - **Domains** folder node (depth 2) -- toggle expands domain categories
      - Category nodes (depth 3): e.g., "Clinical observations (3)" -- toggle expands individual domains
        - Domain nodes (depth 4): e.g., "LB -- Laboratory Test Results" -- click navigates to `/studies/:studyId/domains/:domainName`
    - Separator
    - **Adverse effects** node (depth 2) -- navigates to `/studies/:studyId/analyses/adverse-effects`

**Key behaviors**:
- Auto-expands the study from the URL (`activeStudyId` from `useParams`)
- Auto-expands the domain category containing the active domain
- Highlights the active node based on current route
- Uses `ANALYSIS_VIEWS` from `lib/analysis-definitions.ts` for view labels and keys
- Uses `VIEW_ICONS` map for lucide icon per view
- `viewRoute()` helper maps view key to route path: `study-summary` maps to `/studies/:id`, others map to `/studies/:id/:viewKey`

### ContextPanel (`components/panels/ContextPanel.tsx`)

Right sidebar inspector. Route-aware component that renders different content based on pathname. Contains:

- **StudyInspector** (default for selected study): collapsible sections for Study Details (metadata from `useStudyMetadata`), Study Health (one-liner from `useAESummary`), Review Progress (annotation counts from `useAnnotations` + validation counts from `useValidationResults`), and Actions (links: Open study, Validation report, Generate report, Export).
- **View-specific context panel wrappers**: Each fetches data via hooks, casts shared selection to typed shape, and delegates to the view's context panel component.
- **Empty states**: "Select a study to view details" when no study is selected. Demo guard message for non-PointCross studies.

### TreeNode (`components/tree/TreeNode.tsx`)

Reusable tree node component used by BrowsingTree. Accepts `label`, `depth`, `icon`, `isExpanded`, `isActive`, `onClick`. Renders with indentation based on depth.

## Current State

**Real (fully functional)**:
- Three-panel layout with fixed left/right widths and fluid center
- All 9 routes working with correct component rendering
- Context panel dynamically switches based on route
- Cross-view navigation links in all analysis context panels
- Dual-mode (Findings/Heatmap) center panel with `pendingNavigation` pattern
- BrowsingTree with study expansion, domain categories, view navigation
- Four selection contexts with proper isolation via `_view` tags
- Resizable left rails in Views 2-5 via `useResizePanel` hook and `PanelResizeHandle` component

**Limitations**:
- No URL persistence of filter state -- navigating to a view always starts with default filters
- No deep linking -- cannot share a URL that pre-selects a specific endpoint or organ
- `ViewSelectionContext` uses `Record<string, any>` type -- no compile-time enforcement of selection shape per view (runtime `_view` tag check only)
- Non-PointCross studies show a demo guard message instead of real data (P1.3)
- `SelectionContext` tracks landing page study selection, but this state is not used once you navigate into a study route (route params take precedence)

## Code Map

| File | Description |
|------|-------------|
| `frontend/src/App.tsx` | Route definitions (`createBrowserRouter`) |
| `frontend/src/components/layout/Layout.tsx` | Three-panel shell, context provider nesting |
| `frontend/src/components/layout/Header.tsx` | App header bar |
| `frontend/src/components/tree/BrowsingTree.tsx` | Left sidebar navigation tree |
| `frontend/src/components/tree/TreeNode.tsx` | Reusable tree node component |
| `frontend/src/components/panels/ContextPanel.tsx` | Right sidebar context-sensitive inspector |
| `frontend/src/contexts/SelectionContext.tsx` | Study-level selection state |
| `frontend/src/contexts/SignalSelectionContext.tsx` | View 1 signal/organ selection (mutually exclusive) |
| `frontend/src/contexts/ViewSelectionContext.tsx` | Shared selection for Views 2-5 + Validation (`_view` tagged) |
| `frontend/src/contexts/FindingSelectionContext.tsx` | Adverse effects finding selection |
| `frontend/src/lib/analysis-definitions.ts` | `ANALYSIS_VIEWS` array (key, label, implemented flag) |
| `frontend/src/components/analysis/StudySummaryView.tsx` | Dual-mode center panel, `pendingNavigation` state |
| `frontend/src/components/analysis/charts/OrganGroupedHeatmap.tsx` | `PendingNavigation` type, scroll-to-organ logic |
| `frontend/src/components/analysis/panes/*ContextPanel.tsx` | View-specific context panels with cross-view links |
| `frontend/src/types/analysis-views.ts` | `SignalSelection` interface |
| `frontend/src/types/analysis.ts` | `UnifiedFinding` interface (used by FindingSelectionContext) |
| `frontend/src/hooks/useResizePanel.ts` | Hook for resizable panels — returns `{ width, onPointerDown }` |
| `frontend/src/components/ui/PanelResizeHandle.tsx` | Visual drag handle (4px) placed between resizable panels |

## Datagrok Notes

| Prototype Pattern | Datagrok Equivalent |
|-------------------|---------------------|
| React Router (`createBrowserRouter`) | `grok.shell.addView()` / `grok.shell.v` for view switching. Datagrok uses a single-page model where views are registered and switched via the shell API, not URL routes. |
| React Context (4 providers) | DataFrame selection and filter state. `DG.DataFrame.currentRow` for row-level selection. `DG.DataFrame.filter` for filter state. View-specific state via `DG.ViewBase` properties. |
| `BrowsingTree` (left panel) | Toolbox accordion (`grok.shell.sidebar`) with `ui.tree()` for hierarchical navigation. Studies and domains would be tree nodes. Analysis views would be accordion sections or toolbar buttons. |
| `ContextPanel` (right panel) | Info panels registered by semantic type. Datagrok natively shows info panels for selected cells/rows. Custom panels via `DG.JsViewer` or `@grok/InfoPanel` decorators. The route-based dispatch pattern maps to semantic-type-based panel registration. |
| `Header` (top bar) | Datagrok ribbon. App name in the ribbon title area. Action buttons in ribbon groups. |
| Cross-view links (`navigate()` with `location.state`) | `grok.shell.v = targetView` then set DataFrame filters before switching. The React Router `location.state` pattern maps to setting filter state on the target view's DataFrame. |
| `pendingNavigation` pattern | Not needed -- Datagrok views can directly manipulate each other's state through shared DataFrame objects and events. |
| Fixed panel widths (260px / 280px) | Datagrok panels are resizable by default. Similar fixed widths can be set via `DG.DockManager`. |

## Changelog

- 2026-02-09: Added resizable panel system documentation (useResizePanel hook, PanelResizeHandle component, usage in Views 2-5). Added to code map and current state.
- 2026-02-08: Created from CLAUDE.md architecture section and frontend source code
