# App Landing Page

**Route:** `/`
**Component:** `AppLandingPage.tsx` (in `components/panels/`)
**Role:** Application entry point. Study listing with portfolio integration, functional import, program filtering, design-mode scenarios, and study selection with context menu and delete confirmation.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  App Landing Page          | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

Internal layout: single full-height scrollable column (`h-full overflow-y-auto`):

```
+-----------------------------------------------------------+
|  [Flask icon]  Preclinical Case              * Bullet list |
|                Analyze and validate...       * of features |
|                                              Learn more -> |
+-----------------------------------------------------------+  <-- hero, border-b, bg-card
|  > IMPORT NEW STUDY (collapsible)                          |
+-----------------------------------------------------------+  <-- border-b
|  Studies ({N})                        [Program: dropdown]  |
|  +-------------------------------------------------------+|
|  | : | Study | Protocol | Species | Stage | Subj | ...   ||
|  |---|-------|----------|---------|-------|------|-----   ||
|  |   | ABC-001 | ...   | Rat     | ...   | 120  | ...   ||
|  |   | DEF-002 | ...   | Dog     | ...   | 40   | ...   ||
|  +-------------------------------------------------------+|
|  [x] Design mode                                          |
+-----------------------------------------------------------+
```

---

## Hero Section

Container: `border-b bg-card px-8 py-8`

**Layout:** `flex items-start gap-10`

### Left block
`flex shrink-0 items-start gap-4`
- Flask icon: `FlaskConical`, `h-11 w-11 text-primary`
- Title: `text-xl font-semibold tracking-tight` -- "Preclinical Case"
- Subtitle: `mt-0.5 text-xs text-muted-foreground` -- "Analyze and validate your SEND data"

### Right block
- Feature list: `text-xs text-muted-foreground`, `list-disc space-y-0.5 pl-4`
  - "Visualize and explore SEND data"
  - "Identify patterns and trends"
  - "Navigate study and subject level views"
  - "Browse adverse events"
  - "Validate SEND compliance"
- "Learn more" link: `mt-2 inline-block pl-4 text-xs text-primary hover:underline`, opens alert in prototype

---

## Import Section

Container: `border-b px-8 py-4`

### Toggle Button
`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground hover:text-foreground`
- Chevron: `ChevronRight h-3 w-3`, rotates 90deg when open
- Label: "Import new study" (rendered uppercase via CSS `uppercase` class)
- Default: closed (opens by default when not loading and no studies loaded: `!isLoading && (studies ?? []).length === 0`)

### Expanded Content (when open)
`mt-4 space-y-4`

#### Drop Zone
`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-5 transition-colors`

Three visual states controlled by `cn()`:
- **Default:** `border-muted-foreground/25 bg-muted/30`
- **Dragging:** `border-primary bg-primary/5`
- **File selected:** `border-primary/50 bg-primary/5`

Three content states:

**Importing state:**
- Spinner: `Loader2 h-5 w-5 animate-spin text-primary`
- Text: `text-xs text-muted-foreground` -- "Importing study..."

**File selected state:**
- Upload icon: `Upload h-5 w-5 text-primary/60`
- File name: `text-xs font-medium`
- File size and "ready to import" label with a "Remove" button (`text-muted-foreground underline hover:text-foreground`)

**Empty state (default):**
- Upload icon: `Upload h-5 w-5 text-muted-foreground/50`
- Text: `text-xs font-medium text-muted-foreground` -- "drop SEND study folder"
- Hidden file input: accepts `.zip` files
- Browse button: `rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent` -- "Browse..."

Drag-and-drop is fully functional: `onDragOver`, `onDragLeave`, `onDrop` handlers set `isDragging` state and capture the dropped file.

#### Description Field
`flex items-start gap-3`
- Label: `shrink-0 pt-1.5 text-xs text-muted-foreground` -- "Description"
- Textarea: `w-[260px] max-w-full resize rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs`, placeholder "Optional study notes..."

#### Validation Options
`space-y-1.5`
- "Validate SEND compliance" -- checkbox, **interactive**, checked by default (`useState(true)`)
- "Attempt automatic fixes" -- checkbox, **interactive**, unchecked by default (`useState(false)`)

Both checkboxes use `h-3 w-3` styling and are wired to local state via `onChange`.

#### Import Button
Conditionally styled based on whether a file is selected:
- **Enabled** (file selected, not importing): `rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-xs font-medium`
- **Disabled** (no file or importing): `rounded-md bg-primary/50 text-primary-foreground/70 cursor-not-allowed px-4 py-2 text-xs font-medium`

Label: "Import study" (or "Importing..." during import)

#### Import Feedback
- Error: `text-xs text-red-600` -- displays `err.message` or "Import failed"
- Success: `text-xs` with inline color `#16a34a` -- displays "Imported {study_id} ({domain_count} domains)"

#### Import Flow
When triggered, `handleFile` calls `importStudy(file, { validate, autoFix })` from `@/lib/api`. On success it invalidates the `["studies"]` React Query cache to refresh the table. The file, validate, and autoFix values are all captured from local state.

---

## Studies Table

Container: `px-8 py-6`

### Section Header
`mb-4 flex items-center justify-between` wrapper containing:
- Left: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` -- "Studies ({N})" where N = `allStudies.length + scenarioStudies.length`
- Right: Program filter dropdown (visible when `projects` array has entries)

### Program Filter
`flex items-center gap-2`
- Label: `text-xs text-muted-foreground` -- "Program:"
- Select: `rounded border border-border bg-background px-2 py-1 text-xs`
  - Default option: "All programs"
  - Options from `useProjects()`: `{name} ({compound})`
- Filters `allStudiesUnfiltered` by `portfolio_metadata?.project`

### Loading State
`space-y-2` with 2 `Skeleton h-10 w-full`

### Empty State
`rounded-md border bg-card py-12 text-center`
- Flask icon: `mx-auto mb-3 h-8 w-8 text-muted-foreground`
- "No studies imported yet." -- `font-medium`
- "Import your first study to get started." -- `mt-1 text-sm text-muted-foreground`

### Table
`max-h-[60vh] overflow-auto rounded-md border bg-card`

Plain HTML table, `w-full text-xs`

**Header:** `<thead>` with `sticky top-0 z-10 bg-background`

**Header row:** `border-b bg-muted/30`

| Column | Header | Alignment | Width |
|--------|--------|-----------|-------|
| (actions) | (empty) | Center | w-8 |
| study_id | Study | Left | auto |
| protocol | Protocol | Left | auto |
| species | Species | Left | auto |
| pipeline_stage | Stage | Left | auto |
| subjects | Subj | Right | auto |
| duration_weeks | Dur | Left | auto |
| study_type | Type | Left | auto |
| start_date | Start | Left | auto |
| end_date | End | Left | auto |
| noael_value | NOAEL | Right | auto |
| status | Status | Left | auto |

Header cells: `px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`
(Actions column header: `w-8 px-1.5 py-1`, no text)

### Cell Rendering

| Column | Rendering |
|--------|-----------|
| Actions | `MoreVertical` icon button (`h-3.5 w-3.5 text-muted-foreground`), opens context menu |
| Study | `px-2 py-0.5 font-medium text-primary` -- study_id |
| Protocol | `px-2 py-0.5 text-muted-foreground text-[11px]`, em dash if "NOT AVAILABLE" or null |
| Species | `px-2 py-0.5 text-muted-foreground text-[11px]`, em dash if null |
| Stage | `px-2 py-0.5 text-[11px]`, colored via `getPipelineStageColor()` with first letter capitalized and underscores replaced with spaces; em dash if no pipeline_stage |
| Subj | `px-2 py-0.5 text-right tabular-nums text-muted-foreground text-[11px]`, em dash if null |
| Dur | `px-2 py-0.5 text-muted-foreground text-[11px]`, formatted as `{N}w` (e.g. "4w"); em dash if null |
| Type | `px-2 py-0.5 text-muted-foreground text-[11px]`, em dash if null |
| Start | `px-2 py-0.5 tabular-nums text-muted-foreground text-[11px]`, em dash if null |
| End | `px-2 py-0.5 tabular-nums text-muted-foreground text-[11px]`, em dash if null |
| NOAEL | `px-2 py-0.5 text-right tabular-nums text-[11px]`, shows `noael_value` (e.g. "10 mg/kg" or "10 mg/kg (d)" for derived); em dash if null |
| Status | `relative pl-4 pr-2 py-0.5 text-[11px] text-muted-foreground`, with green dot only for "Complete" status (see below) |

### Status Dot
- **"Complete":** `absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full` with `background: #16a34a`
- **All other statuses:** no dot rendered (nothing, not a transparent dot)

### Row Interactions
- Hover: `hover:bg-accent/50`
- Selected: `bg-accent`
- Single click: selects study (250ms delayed to differentiate from double-click)
- Double-click: navigates to `/studies/{studyId}` for all studies
- Right-click: opens context menu at cursor position
- Actions button click: opens context menu below the button

### Data Sources

| Source | Type | Purpose |
|--------|------|---------|
| `useStudies()` | Server (React Query) | Real/imported studies from `/api/studies` |
| `useStudyPortfolio()` | Server (React Query) | Portfolio studies with metadata (species, stage, NOAEL, duration, etc.) |
| `useProjects()` | Server (React Query) | Program list for filter dropdown |
| `useScenarios(designMode)` | Server (React Query) | Scenario studies (only when design mode enabled) |

**Study merging:** Real studies from `useStudies()` are mapped to `DisplayStudy` with portfolio-specific fields (`pipeline_stage`, `noael_value`) set to undefined. The `duration_weeks` is calculated from `start_date`/`end_date` if both are available. Portfolio studies from `useStudyPortfolio()` are mapped with full metadata including `pipeline_stage`, `duration_weeks`, `noael_value` (resolved via `noael()` accessor with derived "(d)" suffix), and `validation` status computed from error/warning counts. Both arrays are concatenated into `allStudiesUnfiltered`, then filtered by `projectFilter` to produce `allStudies`.

### Scenario Studies Section
When design mode is active, scenario studies appear below a dashed separator (`border-t border-dashed`). Separator row uses `colSpan={9}`. Each scenario row renders 9 `<td>` elements (fewer than the 12-column header):
1. `Wrench` icon (`mx-auto h-3.5 w-3.5 text-muted-foreground/60`)
2. Study name in `font-medium text-muted-foreground`
3. study_type in `text-muted-foreground/60`, em dash if null
4. em dash in `text-muted-foreground/60`
5. Subjects in `text-right tabular-nums text-muted-foreground/60`, em dash if null
6. em dash in `text-muted-foreground/60`
7. em dash in `text-muted-foreground/60`
8. "Scenario" label in `text-xs text-muted-foreground/60`
9. Validation icon from `VAL_DISPLAY` lookup

### Design Mode Toggle
Below the table: `mt-3 flex items-center gap-2`
- `Wrench h-3 w-3 text-muted-foreground/50` icon
- Checkbox label: `text-[10px] text-muted-foreground` -- "Design mode"
- Wired to `useDesignMode()` context (`designMode`, `toggleDesignMode`)

---

## Context Menu

Custom dropdown positioned at click coordinates.

Container: `fixed z-50 min-w-[200px] rounded-md border bg-popover py-1 shadow-lg`
Overlay: `fixed inset-0 z-40` click-to-close

### Menu Items
| Label | Action | Disabled? | Danger? |
|-------|--------|-----------|---------|
| Open Study | Navigate to study | No | No |
| Open Validation Report | Navigate to validation | No | No |
| Generate Report | Call `generateStudyReport` | No | No |
| Share... | Close menu (stub) | Always | No |
| Export... | Alert "CSV/Excel export coming soon." | No | No |
| Re-validate SEND... | Navigate to validation + POST `/api/studies/{id}/validate` + invalidate queries | No | No |
| --- separator --- | | | |
| Delete | Opens delete confirmation dialog | No | Yes |

Item styling: `flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent`
Danger item additional styling: `text-red-600 hover:bg-red-50`

---

## Delete Confirmation Dialog

Triggered when "Delete" is selected from the context menu. A full modal dialog with backdrop.

**Backdrop:** `fixed inset-0 z-50 bg-black/30` (click to cancel)

**Dialog:** `fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover p-6 shadow-xl`

### Content
- Title: `text-sm font-semibold` -- "Confirm Deletion"
- Body: `mt-2 text-sm text-muted-foreground` -- "Delete study **{studyId}** and all associated data? This cannot be undone." (study ID in `font-medium text-foreground`)

### Actions
`mt-4 flex justify-end gap-2`
- Cancel button: `rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent`
- Delete button: `rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700`

### Behavior
On confirm, calls `deleteStudy(studyId)` from `@/lib/api`, then invalidates `["studies"]` query. On failure, shows `alert("Failed to delete study.")`.

---

## Context Panel -- StudyPortfolioContextPanel

When on the landing page with a study selected, the `ContextPanel` routing component checks if the selected study exists in the portfolio data (`useStudyPortfolio()`). If found, it renders `StudyPortfolioContextPanel` as the primary context panel.

### StudyPortfolioContextPanel

**Component:** `StudyPortfolioContextPanel.tsx` (in `components/portfolio/`)
**Props:** `selectedStudy: StudyMetadata | null`, `allStudies: StudyMetadata[]`

**Empty state:** "Select a study from the list to view cross-study orientation and details." (`p-4 text-xs text-muted-foreground`)

**Container:** `h-full overflow-y-auto`

### Pane structure (conditional by pipeline_stage)

**Always shown:**
- `StageStatusPane` -- study stage and status display
- `RelatedStudiesPane` -- related studies from the same program
- `StudyDetailsLinkPane` -- navigation link to study detail view

**Submitted / Pre-submission stage:**
- `ToxSummaryPane` (if study has target organs or NOAEL data)
- `ReportedVsDerivedDeltaPane` (if discrepancies detected via `hasTargetOrganDiscrepancy`, `hasNoaelDiscrepancy`, or `hasLoaelDiscrepancy`)
- `ProgramNoaelsPane`
- `PackageCompletenessPane`

**Ongoing stage:**
- `ToxSummaryPane` with `showDerivedOnly` prop (if study has target organs or NOAEL data)
- `ProgramNoaelsPane`
- `CollectionProgressPane`

**Planned stage:**
- `ProgramNoaelsPane`
- `DesignRationalePane` (if `design_rationale` field exists)

---

## Context Panel -- StudyInspector (fallback)

When a selected study is not found in the portfolio data, the context panel falls back to `StudyInspector` (defined in `ContextPanel.tsx`). This shows triage-grade info for study selection mode. For no selection: "Select a study to view details."

### Pane structure

| Section | Default | Content |
|---------|---------|---------|
| Study details | Open | Metadata rows: Species, Strain, Type, Design, Subjects (with M/F breakdown), Duration (formatted from ISO), Start, End, Test article, Vehicle, Route, Sponsor, Facility, Director, GLP |
| Study health | Open | One-line plain text: `"{N} adverse . NOAEL {dose} {unit}"` or `"... . NOAEL not established"`. No colored counts. |
| Review progress | Open | Tox findings: `{reviewed} / {total} reviewed` . Pathology: `{reviewed} annotated` . Validation: `{reviewed} / {total} reviewed` . Validated-at timestamp (10px muted) |
| Actions | **Closed** | Links: Open study, Validation report, Generate report, Export... |

### Data sources

| Hook | Purpose |
|------|---------|
| `useStudyMetadata(studyId)` | Study details section |
| `useAESummary(studyId)` | Health line (total_adverse, suggested_noael), tox total |
| `useValidationResults(studyId)` | Validation total + validated_at timestamp |
| `useAnnotations<ToxFinding>("tox-findings")` | Tox reviewed count |
| `useAnnotations<PathologyReview>("pathology-reviews")` | Pathology reviewed count |
| `useAnnotations<ValidationRecordReview>("validation-records")` | Validation reviewed count |

---

## Context Panel -- ScenarioInspector

When the selected study ID starts with `"SCENARIO-"`, the context panel renders `ScenarioInspector` instead. It fetches expected issues from `/api/scenarios/{id}/expected-issues` and displays:

| Section | Default | Content |
|---------|---------|---------|
| (header) | -- | Wrench icon + scenario name, description text |
| Expected issues | Open | List of rule IDs with severity and count, or "No issues expected (clean study)." |
| What to check | Open | Bulleted checklist items |
| Actions | Closed | "Open scenario" and "Validation report" links |

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Studies | Server | `useStudies()` hook (React Query) |
| Portfolio studies | Server | `useStudyPortfolio()` hook (React Query) |
| Projects | Server | `useProjects()` hook (React Query) |
| Scenarios | Server | `useScenarios(designMode)` hook (React Query, conditional) |
| Selected study | Shared via context | `SelectionContext` |
| Design mode | Shared via context | `DesignModeContext` (`useDesignMode`) |
| Project filter | Local | `useState<string>("")` |
| Context menu | Local | `useState<{ study, x, y } | null>` |
| Delete target | Local | `useState<string | null>` |
| Import section open | Local | `useState<boolean>` -- default closed (open if no studies loaded) |
| Click timer | Local | `useRef<Timeout>` -- 250ms delay for single vs double click |

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Study row | Double-click | `/studies/{studyId}` |
| Context menu | Open Study | `/studies/{studyId}` |
| Context menu | Open Validation Report | `/studies/{studyId}/validation` |
| Context menu | Generate Report | Opens HTML report in new tab |
| Context menu | Re-validate SEND... | `/studies/{studyId}/validation` + POST validate |
| Context panel | Actions links | Various study routes |
| StudyDetailsLinkPane | Link | Study detail route |
