# App Landing Page

**Route:** `/`
**Component:** `AppLandingPage.tsx` (in `components/panels/`)
**Role:** Application entry point. Study listing, import stub, and study selection with context menu.

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
|  [Flask icon]  Preclinical Case              • Bullet list |
|                Analyze and validate...       • of features |
|                                              Learn more →  |
+-----------------------------------------------------------+  <-- hero, border-b, bg-card
|  ▶ IMPORT NEW STUDY (collapsible)                          |
+-----------------------------------------------------------+  <-- border-b
|  Studies ({N})                                             |
|  +-------------------------------------------------------+|
|  | ⋮ | Study | Protocol | Standard | Subjects | ...     ||
|  |---|-------|----------|----------|----------|-----      ||
|  |   | PointCross | ... | ...     | ...      | ...      ||
|  |   | DART-... (demo) | ...                              ||
|  +-------------------------------------------------------+|
+-----------------------------------------------------------+
```

---

## Hero Section

Container: `border-b bg-card px-8 py-8`

**Layout:** `flex items-start gap-10`

### Left block
`flex shrink-0 items-start gap-4`
- Flask icon: `FlaskConical`, `mt-0.5 h-12 w-12`, color `#3a7bd5`
- Title: `text-xl font-semibold tracking-tight` — "Preclinical Case"
- Subtitle: `mt-0.5 text-sm text-muted-foreground` — "Analyze and validate your SEND data"

### Right block
- Feature list: `text-sm text-muted-foreground`, `list-disc space-y-0.5 pl-4`
  - "Visualize and explore SEND data"
  - "Identify patterns and trends"
  - "Navigate study and subject level views"
  - "Browse adverse events"
  - "Validate SEND compliance"
- "Learn more" link: `mt-2 inline-block text-sm hover:underline`, color `#3a7bd5`, opens alert in prototype

---

## Import Section

Container: `border-b px-8 py-4`

### Toggle Button
`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground`
- Chevron: `ChevronRight h-3 w-3`, rotates 90deg when open
- Label: "Import New Study"
- Default: closed (opens by default when no studies loaded)

### Expanded Content (when open)
`mt-4 space-y-4`

#### Drop Zone
`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 py-8`
- Upload icon: `Upload h-8 w-8 text-muted-foreground/50`
- Text: `text-sm text-muted-foreground` — "Drop SEND study folder here"
- Browse button: `rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent` — "BROWSE..." (alert in prototype)

#### Metadata Fields
`space-y-2`, three rows each with:
- Label: `w-20 shrink-0 text-xs text-muted-foreground`
- Auto-detect checkbox (disabled): `flex items-center gap-1.5 text-xs text-muted-foreground`
- Input: `h-7 flex-1 rounded-md border bg-muted/50 px-2 text-xs` (disabled)

Fields: Study ID, Protocol, Description (no auto-detect checkbox)

#### Validation Options
`space-y-1.5`
- "Validate SEND compliance" — checkbox checked, disabled
- "Attempt automatic fixes" — checkbox unchecked, disabled

#### Import Button
`rounded-md bg-primary/50 px-4 py-2 text-xs font-medium text-primary-foreground/70 cursor-not-allowed` — "IMPORT STUDY" (disabled)

---

## Studies Table

Container: `px-8 py-6`

### Section Header
`mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Studies ({N})"

### Loading State
`space-y-2` with 2 `Skeleton h-10 w-full`

### Empty State
`rounded-md border bg-card py-12 text-center`
- Flask icon: `mx-auto mb-3 h-8 w-8 text-muted-foreground`
- "No studies imported yet." — `font-medium`
- "Import your first study to get started." — `mt-1 text-sm text-muted-foreground`

### Table
`overflow-x-auto rounded-md border bg-card`

Plain HTML table, `w-full text-sm`

**Header row:** `border-b`, background `#f8f8f8`

| Column | Header | Alignment | Width |
|--------|--------|-----------|-------|
| (actions) | (empty) | Center | w-8 |
| study_id | Study | Left | auto |
| protocol | Protocol | Left | auto |
| standard | Standard | Left | auto |
| subjects | Subjects | Right | auto |
| start_date | Start | Left | auto |
| end_date | End | Left | auto |
| status | Status | Left | auto |
| validation | Val | Center | auto |

Header cells: `px-3 py-2.5 text-xs font-medium text-muted-foreground`

### Cell Rendering

| Column | Rendering |
|--------|-----------|
| Actions | `MoreVertical` icon button (`h-3.5 w-3.5 text-muted-foreground`), opens context menu |
| Study | `font-medium` — study_id |
| Protocol | `text-muted-foreground`, em dash if "NOT AVAILABLE" or null |
| Standard | `text-muted-foreground`, formatted as "SEND {version}" via regex |
| Subjects | `text-right tabular-nums text-muted-foreground`, em dash if null |
| Start | `tabular-nums text-muted-foreground`, em dash if null |
| End | `tabular-nums text-muted-foreground`, em dash if null |
| Status | `text-xs text-muted-foreground`, with colored dot: green `#16a34a` if "Complete", transparent otherwise |
| Validation | Icon with tooltip: Pass=green check, Warnings=amber triangle, Fail=red X, Not Run=em dash |

### Validation Icon Styles
| Status | Icon | Color |
|--------|------|-------|
| Pass | `Check h-3.5 w-3.5` | `#16a34a` (green) |
| Warnings | `TriangleAlert h-3.5 w-3.5` | `#d97706` (amber) |
| Fail | `X h-3.5 w-3.5` | `#dc2626` (red) |
| Not Run | em dash text | `text-muted-foreground` |

### Row Interactions
- Hover: CSS variable `var(--hover-bg)` via inline style
- Selected: CSS variable `var(--selection-bg)` via inline style
- Single click: selects study (250ms delayed to differentiate from double-click)
- Double-click: navigates to `/studies/{studyId}` (only for real studies, not demos)
- Right-click: opens context menu at cursor position
- Actions button click: opens context menu below the button

### Data Sources
- Real studies: fetched via `useStudies()` hook (from `/api/studies`)
- Demo studies: 4 hardcoded entries (DART-2024-0091, CARDIO-TX-1147, ONCO-MTD-3382, NEURO-PK-0256)
- All merged into `allStudies` array, demos tagged with `demo: true`
- Demo studies have context menu actions disabled

---

## Context Menu

Custom dropdown positioned at click coordinates.

Container: `fixed z-50 min-w-[200px] rounded-md border bg-popover py-1 shadow-lg`
Overlay: `fixed inset-0 z-40` click-to-close

### Menu Items
| Label | Action | Disabled? |
|-------|--------|-----------|
| Open Study | Navigate to study | Demo only |
| Open Validation Report | Navigate to validation | Demo only |
| Generate Report | Call `generateStudyReport` | Demo only |
| Share... | (stub) | Always |
| Export... | Alert "coming soon" | Demo only |
| Re-validate SEND... | Navigate to validation + fire POST /validate | Demo only |
| --- separator --- | | |
| Delete | (stub) | Always |

Item styling: `flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-[var(--hover-bg)] disabled:opacity-40`

---

## Context Panel — StudyInspector

When on the landing page with a study selected, the context panel shows `StudyInspector` (triage-grade info for study selection mode). For demo studies, shows name + "This is a demo entry." For no selection: "Select a study to view details."

### Pane structure

| Section | Default | Content |
|---------|---------|---------|
| Study details | Open | Metadata rows: Species, Strain, Type, Design, Subjects, Duration, Start, End, Test article, Vehicle, Route, Sponsor, Facility, Director, GLP |
| Study health | Open | One-line plain text: `"{N} adverse · NOAEL {dose} {unit}"` or `"… · NOAEL not established"`. No colored counts. |
| Review progress | Open | Tox findings: `{reviewed} / {total} reviewed` · Pathology: `{reviewed} annotated` · Validation: `{reviewed} / {total} reviewed` · Validated-at timestamp (10px muted) |
| Actions | Open | Links: Open study, Validation report, Generate report, Export... |

### Data sources

| Hook | Purpose |
|------|---------|
| `useStudyMetadata(studyId)` | Study details section |
| `useAESummary(studyId)` | Health line (total_adverse, suggested_noael), tox total |
| `useValidationResults(studyId)` | Validation total + validated_at timestamp |
| `useAnnotations<ToxFinding>("tox-findings")` | Tox reviewed count |
| `useAnnotations<PathologyReview>("pathology-reviews")` | Pathology reviewed count |
| `useAnnotations<ValidationRecordReview>("validation-records")` | Validation reviewed count |

### Design rationale

The landing page is a **study selection context** — the user is choosing which study to open. The context panel should only show triage-grade information: enough to identify, compare, and decide. Analytical content (target organ lists, signal heatmaps, evidence scores) belongs in the Study Summary view, not here. The previous Target Organs and Signal Overview sections were removed per this cognitive mode analysis.

### Validation tooltip

The validation icon in the studies table shows a tooltip with status text (e.g., "SEND validation passed"). For studies with cached results, the tooltip appends the last-run date: `"SEND validation passed · 2/9/2026"`. Currently PointCross only; multi-study requires per-study validation hooks.

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Studies | Server | `useStudies()` hook (React Query) |
| Selected study | Shared via context | `SelectionContext` |
| Context menu | Local | `useState<{ study, x, y } | null>` |
| Import section open | Local | `useState<boolean>` — default closed (open if no studies loaded) |
| Click timer | Local | `useRef<Timeout>` — 250ms delay for single vs double click |

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Study row | Double-click | `/studies/{studyId}` |
| Context menu | Open Study | `/studies/{studyId}` |
| Context menu | Open Validation Report | `/studies/{studyId}/validation` |
| Context menu | Generate Report | Opens HTML report in new tab |
| Context panel | Actions links | Various study routes |

---

## Current Issues / Improvement Opportunities

### Hero Section
- Feature bullet list is generic — could show actual study counts or recent activity
- "Learn more" link goes to alert — no documentation available
- Flask icon and text could be more prominent as a true landing page hero

### Import Section
- Entirely a stub — no actual import functionality
- All fields disabled, all checkboxes hardcoded
- Drop zone doesn't accept drops
- BROWSE button shows alert

### Studies Table
- No sorting — studies listed in server order then demos appended
- No search/filter for studies
- No column visibility toggle
- Click delay (250ms) for single vs double click is perceptible
- Validation column uses hardcoded "Pass" for all real studies — not actual validation results
- Demo studies mixed with real studies — no visual grouping

### Context Menu
- Uses CSS variable `var(--hover-bg)` — may not be defined in all themes
- Delete action is always disabled — no confirmation UX designed
- "Share..." is a stub with no plans

### General
- No pagination for studies table (not needed at current scale)
- No keyboard navigation
- No sorting or filtering capabilities
- Status dot is transparent for "Ongoing" — barely visible distinction
