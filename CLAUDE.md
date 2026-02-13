# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SEND Data Browser — a web app for exploring pre-clinical regulatory study data (SEND format). Studies are stored as SAS Transport (.xpt) files in `send/` and served through a REST API to a React frontend.

**Documentation assets:** `docs/` — all system specs, view specs, portability guides, and design system docs live here. See `docs/MANIFEST.md` for a full inventory with code dependencies and staleness tracking.

**System specs (authoritative — one doc per subsystem):**
- `docs/systems/insights-engine.md` — rule engine (R01-R17), signal scoring, synthesis, Signals Panel
- `docs/systems/validation-engine.md` — YAML rules, check functions, fix tiers, evidence rendering
- `docs/systems/data-pipeline.md` — XPT loading, per-domain stats, classification, view assembly
- `docs/systems/navigation-and-layout.md` — three-panel layout, routing, selection contexts, cross-view links
- `docs/systems/annotations.md` — ToxFinding, PathologyReview, validation annotations, storage

**View specs:** `docs/views/*.md` — one per view (8 files: landing, study summary, dose-response, target organs, histopathology, NOAEL, adverse effects, validation)

**Portability:** `docs/portability/` — frozen reference for Datagrok migration. Not maintained per-commit; refresh on demand when porting begins.

**Colleague handoff:** Drop feature specs in `docs/incoming/` following the template in `docs/incoming/README.md`.

## Development Commands

### Backend (FastAPI + Python)
```bash
# Start dev server (set OPENBLAS_NUM_THREADS=1 to avoid pandas import hang)
# Use PowerShell: $env:OPENBLAS_NUM_THREADS=1
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/uvicorn.exe main:app --reload --port 8000

# Install dependencies
C:/pg/pcc/backend/venv/Scripts/pip.exe install -r C:/pg/pcc/backend/requirements.txt

# Run analysis generator for a study
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe -m generator.generate PointCross

# API docs: http://localhost:8000/docs
```

### Frontend (React + Vite)
```bash
cd C:/pg/pcc/frontend && npm run dev      # Dev server at http://localhost:5173
cd C:/pg/pcc/frontend && npm run build    # TypeScript check + production build
cd C:/pg/pcc/frontend && npm run lint     # ESLint
```

### Windows Shell Notes
- Always use forward slashes in bash commands (`C:/pg/pcc/...` not `C:\pg\pcc\...`)
- Run Python/pip via full venv path: `C:/pg/pcc/backend/venv/Scripts/python.exe`
- When starting backend in PowerShell, set `$env:OPENBLAS_NUM_THREADS = 1` first

## Hard Process Rules

These rules are non-negotiable. No agent may override, reinterpret, or skip them.

1. **Design system changes require explicit user approval.** No agent may modify design system documents (`docs/design-system/*.md`), design tokens (`design-tokens.ts`), CSS custom properties (`index.css`), CLAUDE.md design decisions, or the audit checklist under any circumstances without the user's prior explicit approval. Agents must propose changes, then stop and wait for the user to approve before writing. Self-approving ("this seems fine, I'll just do it") is never permitted. This includes adding, removing, or rewording rules, exceptions, or classifications. Agents may READ design system docs freely but must NEVER write to them autonomously.

2. **Audit checklist is mandatory and cannot be skipped.** Every design audit must run the full checklist at `docs/design-system/audit-checklist.md`. Partial checks, spot-checks, or "it looks compliant" without running the checklist are not acceptable. Every rule must be evaluated and recorded as PASS, FAIL, or N/A. The reviewer must verify the checklist was run.

3. **CLAUDE.md hard rules must be checked directly.** The reviewer must re-read the Design Decisions section of this file and verify each hard rule is satisfied. Checking against view specs or design guides is NOT sufficient — those documents may have been incorrectly modified. CLAUDE.md is the source of truth for hard rules.

4. **View spec changes that affect UI/UX require explicit user approval.** No agent may modify view specs (`docs/views/*.md`) in ways that affect the UI or UX without the user's prior explicit approval. Agents must propose changes, then stop and wait for approval before writing. Self-approving is never permitted. Agents may NOT infer, add implicit meaning, or "improve" the design on their own — vague instructions like "improve the design" require the user to approve every individual change. **Exceptions:** (a) Changes explicitly requested or directly required to implement a user-requested feature do not need separate approval. "Change the color to X", "remove element Y", "add a filter for Z" are explicit enough to proceed. "Make it look better" or "clean up the view" are not. (b) Designing from scratch (new view, new spec) is not subject to this rule — there's nothing to protect yet. (c) The user can grant blanket approval for a scope of work (e.g., "redesign this UX, come up with a version you think is better"). Blanket approval covers the stated scope; it does not extend beyond it.

## Agent Commit Protocol

Before committing changes that alter system or view behavior:
1. **Update the affected spec.** If you changed how a system or view works, update the corresponding `docs/systems/*.md` or `docs/views/*.md` to match. Specs must reflect code, not the other way around.
2. **Mark MANIFEST.md.** Set "Last validated" to today for any spec you updated. If you can't update the spec, mark it `STALE — <reason>` in MANIFEST.
3. **Check `docs/incoming/`** for feature specs that conflict with your changes. If a conflict exists, ask the user before committing.

## Architecture

### Backend (`backend/`)
- **Framework**: FastAPI with uvicorn
- **Entry**: `main.py` — app setup, CORS (allows *), lifespan startup discovers studies
- **Routers**: `studies.py` (domain browsing), `analyses.py` (dynamic adverse effects), `analysis_views.py` (pre-generated JSON), `validation.py` (validation engine), `annotations.py` (annotations CRUD) — all under `/api`
- **Validation Engine**: `validation/` package — 18 YAML rules, 15 check types, SENDIG metadata. See `docs/systems/validation-engine.md`.
- **Services**: `services/study_discovery.py`, `services/xpt_processor.py`, `services/analysis/` (statistical pipeline)
- **Generator**: `generator/generate.py` — reads .XPT, writes 8 JSON files + static charts to `generated/{study_id}/`
- **Config**: `config.py` — paths, skip list, allowed studies filter

**Valid view names for `/analysis/{view_name}`:** study-signal-summary, target-organ-summary, dose-response-metrics, organ-evidence-detail, lesion-severity-summary, adverse-effect-summary, noael-summary, rule-results

**Important:** The `analysis_views.py` router must use `APIRouter(prefix="/api")` with full paths in decorators (not path params in the router prefix — FastAPI/Starlette doesn't route those correctly).

> Full API endpoint table and module inventory: `docs/reference/claude-md-archive.md`

### Frontend (`frontend/src/`)
- **Framework**: React 19 + TypeScript (strict mode) + Vite
- **Styling**: TailwindCSS v4 with custom Datagrok UI color theme in `index.css`
- **UI Components**: shadcn/ui (Radix UI + CVA) in `components/ui/`
- **State**: TanStack React Query (5 min stale), React Context for selections
- **Tables**: TanStack React Table (client-side sorting in analysis views, server-side pagination in domain views)
- **Layout**: Three-panel Datagrok-style (Left: `BrowsingTree`, Center: route-dependent, Right: `ContextPanel`)
- **Routes**: React Router 7 in `App.tsx` — 9 routes (landing, study summary, domain browser, adverse effects, dose-response, target organs, histopathology, NOAEL decision, validation). All done.
- **Views**: 5 analysis views use two-panel master-detail layout (rail + evidence panel with tabs). See `docs/views/*.md` for each.

> Full routes table and module inventory: `docs/reference/claude-md-archive.md`

## Design Decisions

- **No breadcrumb navigation in context panel panes.** Use `< >` icon buttons at the top of the context panel for back/forward navigation between pane modes. This mirrors Datagrok's native context panel behavior. If breadcrumbs are added later, update this section and the implementation accordingly.
- **Mode 2 (issue pane) never recreates rule context.** No rationale, no "how to fix" guidance, no standard references. Those belong in Mode 1. The issue pane shows only: record identity, finding evidence, action buttons, and review form. The rule ID is a clickable link back to Mode 1, with a one-line summary from "how to fix" for quick reference.
- **Domain labels — colored text only.** Domain codes (LB, BW, MI, MA, OM, CL, etc.) are always rendered as plain colored text using `getDomainBadgeColor(domain).text` from `severity-colors.ts` with `text-[9px] font-semibold`. Never use dot badges, outline pills, bordered badges, or any other treatment for domain labels. This is a hard rule — do not change it.
- **No colored badges for categorical identity.** Color encodes signal strength (p-value, effect size, signal score) — measured values that vary with data. Categorical identity NEVER gets color. Categorical identity includes: dose group, domain, sex, severity level (Error/Warning/Info), fix status, review status, workflow state, and any other fixed label or classification. All categorical badges use neutral gray (`bg-gray-100 text-gray-600 border-gray-200`). The text label alone communicates the category. This applies everywhere — tables, context panels, headers, legends. This is a hard rule — can only be overridden after explicit user confirmation.
- **Canonical tab bar pattern.** All views use: active indicator `h-0.5 bg-primary` underline, active text `text-foreground`, inactive text `text-muted-foreground`, padding `px-4 py-1.5`, tab text `text-xs font-medium`. Tab bar container includes `bg-muted/30`. This is a hard rule — all views must use this exact pattern.
- **Evidence panel background.** All evidence panels (right of rail, left of context panel) use `bg-muted/5` for subtle visual distinction from the crisp-white context panel.
- **Rail header font-weight.** All rail headers use `font-semibold` (not `font-medium`). Full class: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.
- **Grid evidence color strategy — interaction-driven.** P-value and effect size columns in data grids use interaction-driven color: neutral `text-muted-foreground` at rest, `#DC2626` on row hover/selection via the `ev` CSS class. Never always-on color in grids. This follows §1.11 "evidence whispers in text."
- **Context panel pane ordering.** Annotation forms (Tox Assessment, Pathology Review) come before navigation links (Related Views). Full priority: insights → stats/details → related items → annotation → navigation.
- **Evidence tab naming.** All views with an evidence/overview tab in the evidence panel use the label "Evidence" (not "Overview") for cross-view consistency.
- **Data label casing — two-tier strategy.** Organ system names (stored as `organ_system` in data, e.g., `"hepatic"`, `"general"`, `"musculoskeletal"`) are always plain English words, so they get `titleCase()` from `severity-colors.ts` everywhere they are displayed. All other data-sourced labels — endpoint_label, finding, specimen, severity, dose_response_pattern — are displayed as raw values from the data, because they may contain clinical abbreviations (ALT, AST, WBC, SGOT) that `titleCase()` would mangle (e.g., ALT → Alt). The `organName()` function in `signals-panel-engine.ts` does the same transformation with a special case for "general" → "General (systemic)" and is used in the signals engine text generation.
- **Visual hierarchy: Position > Grouping > Typography > Color.** Position and grouping do the heavy lifting; color is a supporting tool. This is the priority order for communicating structure. Color is always the *last* resort, not the first.
- **One saturated color family per column at rest.** At rest, any given column/zone may contain at most one saturated color family. Everything else must be neutral, outlined, muted, or interaction-only. This single rule eliminates most visual noise.
- **Color budget: ≤10% saturated pixels at rest.** A grayscale screenshot of any view must still communicate the essential hierarchy. Only conclusions visually "shout." Per-screen budget: 1 dominant color (status), 1 secondary accent (interaction/selection), unlimited neutrals.
- **Information hierarchy — six categories.** Every derived information element belongs to exactly one: Decision, Finding, Qualifier, Caveat, Evidence, or Context. Mixing categories in one visual unit (e.g., a finding + caveat in the same sentence) is forbidden. Present them separately with distinct visual treatment.
- **Emphasis tier system.** Tier 1 (always colored at rest) = conclusions: TARGET ORGAN, Critical flags, tier dots. Tier 2 (visible, muted) = labels: "adverse" outline badge, direction arrows. Tier 3 (on interaction only) = evidence: p-values, effect sizes, signal score fills. Lower tiers never compete with higher tiers.
- **No decision red repetition per row.** `#DC2626` (status/conclusion color) must not appear more than once in any single table row. Table density lint: if >30% of rows contain red at rest, the view has alarm fatigue.
- **Heatmap matrices use neutral grayscale heat by default.** All heatmap/matrix views use a 5-step neutral gray ramp (`#E5E7EB` → `#D1D5DB` → `#9CA3AF` → `#6B7280` → `#4B5563`) as the default color scheme. Color is always-on at rest (not hover-only). Shared function `getNeutralHeatColor()` in `severity-colors.ts`. Legend goes below the matrix.
- **The system computes what it can.** Don't make users derive conclusions from raw data. If a statistical comparison, count, or summary can be computed, show the result directly.
- **Table column layout — content-hugging with absorber.** Data tables must read like prose, not disconnected columns separated by whitespace. The primary label ("what") and its metrics ("so what") form a tight reading unit. Implementation: all columns except one designated **absorber** column use `width: 1px; white-space: nowrap` so the browser shrinks them to fit content (the wider of header or cell values). The absorber column (typically the last, lowest-priority column like "Also in" or a notes field) has no width constraint and absorbs remaining space. The Finding + metrics cluster reads left-to-right as a single line of meaning. Manual column resize overrides this with an explicit width. `max-width` caps prevent any column from growing beyond its role.

## UI Casing Conventions

- **Sentence case** for all UI text by default: labels, descriptions, tooltips, column headers, section headers (L2+), status text, placeholder text, dropdown options, error messages, notifications
- **Sentence case** for all buttons. Exceptions: OK, SAVE, RUN
- **Title Case** for L1 page/view headers, dialog headers/titles, and context action labels in right-click context menus
- **Never use Title Case** for section headers within panes, table column headers, filter labels, or form field labels

**Examples:**
```
Button:             Revert, Apply fix, Accept, Fix ▾, Apply suggestion, Flag
Button (exception): OK, SAVE, RUN
Button (long):      Flag for review, Generate report, Generate validation report
L1 header:          SEND Validation, Study: PointCross
Dialog header:      Export Settings, Confirm Deletion
Section header:     Rule detail, Review progress, Suggested fix
Column header:      Issue ID, Review status, Assigned to
Dropdown option:    Not reviewed, Accept all, Mapping applied
Context menu:       Export to CSV, Copy Issue ID, Open in Domain Viewer
```

## TypeScript Conventions

- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
- Path alias: `@/*` maps to `src/*`

## Data

- 16 study folders in `send/` containing ~437 .xpt files
- Study ID = folder name (or `parent--child--leaf` for nested TOXSCI studies)
- TS (Trial Summary) domain contains study metadata as TSPARMCD → TSVAL key-value pairs
- SUPP* domains are supplemental qualifiers for their parent domain
- Currently only `PointCross` study is served (config.ALLOWED_STUDIES)

## Generated Analysis Data

Pre-generated by `python -m generator.generate PointCross`. Outputs 8 JSON files + 1 HTML chart to `backend/generated/PointCross/`. See `docs/systems/data-pipeline.md` for pipeline details or `docs/reference/claude-md-archive.md` for the full data table.

## Color Schemes

All color functions implemented in `lib/severity-colors.ts` (p-value, signal score, severity, dose groups, sex). Hex values in `docs/reference/claude-md-archive.md` and `docs/design-system/datagrok-visual-design-guide.md`.

---

## Implementation Status

**All 5 build steps complete.** 8 analysis views (Study Summary, Adverse Effects, Dose-Response, Target Organs, Histopathology, NOAEL Decision, Validation, plus HTML Report). Real validation engine (18 YAML rules, 15 check types). All FEAT-01 through FEAT-09 incoming features implemented. See system specs (`docs/systems/*.md`) and view specs (`docs/views/*.md`) for current architecture. Detailed implementation notes archived in `docs/reference/claude-md-archive.md`.

**Data nullability note:** `lesion_severity_summary.json`: `avg_severity` is null for 550/728 rows — always null-guard with `?? 0`.

---

## What's Real vs. Demo

Full migration guide with file paths and line numbers: `docs/reference/demo-stub-guide.md`

| Component | Status | Notes |
|-----------|--------|-------|
| Statistical analysis pipeline (generator/) | **Real** | Computes actual statistics from XPT data |
| Signal scoring & rule engine | **Real** | Rules R01-R17 derive from actual data patterns |
| HTML report generator (frontend) | **Real** | Fetches live data, builds complete standalone report |
| All 8 analysis views (UI) | **Real** | Fully interactive, data-driven UI components |
| Context panels & insights synthesis | **Real** | Rule synthesis, organ grouping, tier classification |
| ToxFinding / PathologyReview forms | **Real** | Functional forms, persist via API (storage is file-based) |
| Annotation API contract | **Real** | GET/PUT endpoints, 4 schema types — only storage backend needs changing |
| React Query data hooks | **Real** | All hooks are production-ready, no mocking |
| Landing page | **Real** | Shows all discovered studies, no demo entries |
| Validation engine & rules | **Real** | 18 YAML rules, Python engine reads XPT data, API serves results via hooks |
| Import section | **Real** | Drag-and-drop .zip upload, backend extraction, auto-registration |
| Delete study | **Real** | Context menu delete with confirmation, removes all dirs |
| Treatment arms | **Real** | Dynamic ARMCD detection from TX/DM, treatment arms table in details |
| Multi-study support | **Real** | ALLOWED_STUDIES empty, all studies in send/ served |
| Export (CSV/Excel) | **Stub** | alert() placeholder |
| Share | **Stub** | Disabled menu item, no implementation |
| Authentication | **Missing** | No auth anywhere, hardcoded "User" identity |
| Database storage | **Missing** | Annotations use JSON files on disk |

---

## Interactivity Rule

**Every UI element must be interactive and produce a visible result.** Users click through this prototype to evaluate the design. If something looks clickable, it must do something.

- **Dropdowns**: Every option must be selectable and produce a visible state change. Selecting "Accepted" in a status dropdown must update the status badge in the table with the correct color. Selecting a resolution must persist and display.
- **Buttons**: Clicking SAVE must show visual feedback (brief success flash or state change). Clicking APPLY FIX must update the relevant fields (status, resolution, comment) as specified.
- **Filters**: Selecting a filter value must actually filter the table rows.
- **Tables**: Row clicks must trigger the correct pane mode switch and highlight the row.
- **Text inputs**: Values entered in Assigned To, Comment, Value fields must persist within the session.
- **Empty states**: When no data matches (e.g., filter returns zero results, no rule selected), show meaningful placeholder text — never a blank area.

**Exception**: Features requiring backend architecture we are not reimplementing (e.g., writing corrected values back to SEND datasets). For these, **simulate the result**: update UI state as if the fix was applied (change status, populate fields, show confirmation), but don't build real data transformation logic.

**Rule of thumb**: If a user can interact with it, it must respond. If it can't respond meaningfully, show an appropriate empty state or confirmation message. No dead clicks, no unresponsive controls, no orphaned UI elements.
