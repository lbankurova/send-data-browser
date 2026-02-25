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

**View specs:** `docs/views/*.md` — one per view (7 files: landing, study summary, dose-response, histopathology, NOAEL, adverse effects, validation)

**Portability:** `docs/portability/` — frozen reference for Datagrok migration. Not maintained per-commit; refresh on demand when porting begins.

**Colleague handoff:** Drop feature specs in `docs/incoming/` following the template in `docs/incoming/README.md`.

## Development Commands

### Backend (FastAPI + Python)
```bash
# Start dev server (set OPENBLAS_NUM_THREADS=1 to avoid pandas import hang)
# Use PowerShell: $env:OPENBLAS_NUM_THREADS=1
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/uvicorn.exe main:app --reload --port 8000 --reload-exclude ".venv-core" --reload-exclude "_core_engine"

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
cd C:/pg/pcc/frontend && npm test         # Vitest pipeline tests (48 assertions)
```

### Windows Shell Notes
- Always use forward slashes in bash commands (`C:/pg/pcc/...` not `C:\pg\pcc\...`)
- Run Python/pip via full venv path: `C:/pg/pcc/backend/venv/Scripts/python.exe`
- When starting backend in PowerShell, set `$env:OPENBLAS_NUM_THREADS = 1` first
- **Never `pip install` while the dev server is running.** The `--reload` watcher will restart mid-install and corrupt the venv's DLL state, hanging pandas on next import. Stop the server first, install, then restart.

## Hard Process Rules

These rules are non-negotiable. No agent may override, reinterpret, or skip them.

1. **Design system changes require explicit user approval.** No agent may modify design system documents (`docs/design-system/*.md`), design tokens (`design-tokens.ts`), CSS custom properties (`index.css`), CLAUDE.md design decisions, or the audit checklist under any circumstances without the user's prior explicit approval. Agents must propose changes, then stop and wait for the user to approve before writing. Self-approving ("this seems fine, I'll just do it") is never permitted. This includes adding, removing, or rewording rules, exceptions, or classifications. Agents may READ design system docs freely but must NEVER write to them autonomously.

2. **Audit checklist is mandatory and cannot be skipped.** Every design audit must run the full checklist at `docs/design-system/audit-checklist.md`. Partial checks, spot-checks, or "it looks compliant" without running the checklist are not acceptable. Every rule must be evaluated and recorded as PASS, FAIL, or N/A. The reviewer must verify the checklist was run.

3. **CLAUDE.md hard rules must be checked directly.** The reviewer must re-read the Design Decisions section of this file and verify each hard rule is satisfied. Checking against view specs or design guides is NOT sufficient — those documents may have been incorrectly modified. CLAUDE.md is the source of truth for hard rules.

4. **View spec changes that affect UI/UX require explicit user approval.** No agent may modify view specs (`docs/views/*.md`) in ways that affect the UI or UX without the user's prior explicit approval. Agents must propose changes, then stop and wait for approval before writing. Self-approving is never permitted. Agents may NOT infer, add implicit meaning, or "improve" the design on their own — vague instructions like "improve the design" require the user to approve every individual change. **Exceptions:** (a) Changes explicitly requested or directly required to implement a user-requested feature do not need separate approval. (b) Designing from scratch (new view, new spec) is not subject to this rule. (c) The user can grant blanket approval for a scope of work.

5. **Never add Claude as a co-author.** Do not include `Co-Authored-By` lines in commit messages. All commits are authored by the user.

6. **Reuse before reinventing.** Before writing new logic: (a) search the codebase for existing hooks, functions, derived data, and generated JSON that already compute the needed values; (b) read `docs/knowledge/methods-index.md` and `docs/knowledge/field-contracts-index.md` to check if the computation already exists — drill into the full `methods.md` / `field-contracts.md` only for relevant entries; (c) read `docs/knowledge/species-profiles.md` and `docs/knowledge/vehicle-profiles.md` for reference data. Only after confirming no existing source provides the data may the agent write new logic. Duplicating or re-deriving existing data is a defect.

## Agent Commit Protocol

Before committing, run every item in `docs/checklists/COMMIT-CHECKLIST.md`. Every item must pass.

## Post-Implementation Review Protocol

After implementing a feature from a spec in `docs/incoming/`, run the full review at `docs/checklists/POST-IMPLEMENTATION-REVIEW.md` before considering the work done. This is mandatory and must be run automatically — the user should not have to ask for it.

## Architecture

### Backend (`backend/`)
- **Framework**: FastAPI with uvicorn
- **Entry**: `main.py` — app setup, CORS (allows *), lifespan startup discovers studies
- **Routers**: `studies.py` (domain browsing), `analyses.py` (dynamic adverse effects), `analysis_views.py` (pre-generated JSON), `validation.py` (validation engine), `annotations.py` (annotations CRUD) — all under `/api`
- **Validation Engine**: `validation/` package — 14 YAML rules (7 SD + 7 FDA), 2 check types, optional CDISC CORE integration, SENDIG metadata. See `docs/systems/validation-engine.md`.
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
- **Routes**: React Router 7 in `App.tsx` — 8 routes (landing, study summary, domain browser, adverse effects, dose-response, histopathology, NOAEL decision, validation). Target organs route redirects to parent. All done.
- **Views**: 5 analysis views use two-panel master-detail layout (rail + evidence panel with tabs). See `docs/views/*.md` for each.

> Full routes table and module inventory: `docs/reference/claude-md-archive.md`

### Dual Syndrome Engines (not duplicated)
Two files both detect "syndromes" but at different abstraction levels — do not merge:
- **`syndrome-rules.ts`** (543 lines, 14 rules) — **Histopathology-specific.** Input: `Map<organ, LesionSeverityRow[]>`. Consumed by: HistopathologyView, HistopathologyContextPanel, SpecimenRailMode.
- **`cross-domain-syndromes.ts`** (972 lines, 9 rules XS01–XS09) — **Cross-domain.** Input: `EndpointSummary[]` spanning LB/BW/MI/MA/OM/CL. Consumed by: FindingsView, FindingsRail, scatter chart, context panels, lab-clinical-catalog, FindingsAnalyticsContext.

## Design Decisions

- **SubjectProfilePanel design is frozen.** The individual animal panel (`SubjectProfilePanel.tsx`) design requires explicit user approval before any changes. Functional bug fixes that don't affect the visual design are exempt. This is a hard rule.
- **No breadcrumb navigation in context panel panes.** Use `< >` icon buttons for back/forward navigation. Mirrors Datagrok's native context panel behavior.
- **Mode 2 (issue pane) never recreates rule context.** No rationale, no "how to fix" guidance, no standard references. Those belong in Mode 1. The issue pane shows only: record identity, finding evidence, action buttons, and review form.
- **Domain labels — neutral text only.** Domain codes are categorical identity and must never be color-coded. Render as: `text-[9px] font-semibold text-muted-foreground`. This is a hard rule.
- **No colored badges for categorical identity.** Color encodes signal strength (measured values). Categorical identity (dose group, domain, sex, severity level, fix status, review status, workflow state) NEVER gets color. All categorical badges use neutral gray (`bg-gray-100 text-gray-600 border-gray-200`). This is a hard rule.
- **Canonical tab bar pattern.** Active: `h-0.5 bg-primary` underline, `text-foreground`. Inactive: `text-muted-foreground`. Padding: `px-4 py-1.5`. Text: `text-xs font-medium`. Container: `bg-muted/30`. This is a hard rule.
- **Evidence panel background.** All evidence panels use `bg-muted/5`.
- **Rail header font-weight.** `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.
- **Grid evidence color strategy — interaction-driven.** P-value and effect size columns: neutral at rest, `#DC2626` on hover/selection via `ev` CSS class. Never always-on color in grids.
- **Context panel pane ordering.** Priority: insights → stats/details → related items → annotation → navigation.
- **Evidence tab naming.** Use "Evidence" (not "Overview") for cross-view consistency.
- **Data label casing — two-tier strategy.** Organ system names get `titleCase()`. All other data-sourced labels display as raw values (may contain clinical abbreviations like ALT, AST).
- **Visual hierarchy: Position > Grouping > Typography > Color.** Color is always the last resort.
- **One saturated color family per column at rest.** Everything else: neutral, outlined, muted, or interaction-only.
- **Color budget: ≤10% saturated pixels at rest.** Only conclusions visually "shout."
- **Information hierarchy — six categories.** Decision, Finding, Qualifier, Caveat, Evidence, Context. Never mix in one visual unit.
- **Emphasis tier system.** Tier 1 (colored at rest) = conclusions. Tier 2 (visible, muted) = labels. Tier 3 (on interaction) = evidence.
- **No decision red repetition per row.** `#DC2626` at most once per table row.
- **Heatmap matrices use neutral grayscale heat.** 5-step gray ramp, always-on. `getNeutralHeatColor()` in `severity-colors.ts`.
- **The system computes what it can.** Show computed results, not raw data for users to derive.
- **Dose group display — two components.** `DoseHeader` for column headers, `DoseLabel` for row/cell values. Both in `components/ui/DoseLabel.tsx`. Never render raw dose group strings. This is a hard rule.
- **Table column layout — content-hugging with absorber.** All columns except one absorber use `width: 1px; white-space: nowrap`. Absorber absorbs remaining space.
- **Pre-edit hierarchy analysis required for typography/spacing changes.** Before changing any font size, margin, or padding: (1) document the current hierarchy — what is primary (control-tier), supporting, and micro; (2) verify the proposed change preserves the tier relationships; (3) check that spacing is proportional to the text size it surrounds. Font sizes encode information hierarchy, not just visual style. Treating text as interchangeable "lorem ipsum" is a defect. See `docs/design-system/datagrok-visual-design-guide.md` §2.1 for the tier table.

## UI Casing Conventions

See `docs/reference/ui-casing-conventions.md` for the full casing guide with examples.

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

All color functions implemented in `lib/severity-colors.ts`. Hex values in `docs/reference/claude-md-archive.md` and `docs/design-system/datagrok-visual-design-guide.md`.

## Implementation Status

**All 5 build steps complete.** 7 analysis views + HTML Report. Real validation engine (14 YAML rules, 2 check types). All FEAT-01 through FEAT-09 implemented. See `docs/reference/implementation-status.md` for the full real/stub/missing breakdown.

**Data nullability note:** `lesion_severity_summary.json`: `avg_severity` is null for 550/728 rows — always null-guard with `?? 0`.

## Interactivity Rule

See `docs/reference/interactivity-rule.md` for the full interactivity requirements.
