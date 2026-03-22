# System Architecture

## Overall Pattern

Full-stack MVC with analytical pipeline:

```
XPT Files → Backend Processing → REST API → React Frontend → Three-panel UI
```

Two execution paths:
1. **Pre-generated**: `generator/generate.py` → JSON files → served statically via `analysis_views.py`
2. **On-demand**: Frontend request → router → service → analysis modules → JSON response

## Backend Architecture (`backend/`)

### Layer 1: Routers (thin — dispatch only)
9 API routers under `/api`:

| Router | File | Purpose |
|--------|------|---------|
| Studies | `routers/studies.py` | Domain browsing, metadata |
| Analyses | `routers/analyses.py` | Dynamic adverse effects |
| Analysis Views | `routers/analysis_views.py` | Pre-generated JSON serving |
| Annotations | `routers/annotations.py` | ToxFinding, PathologyReview CRUD |
| Validation | `routers/validation.py` | Validation engine |
| Temporal | `routers/temporal.py` | Time-course data |
| Import | `routers/import_study.py` | Study import |
| Scenarios | `routers/scenarios.py` | Test scenarios |
| Portfolio | `routers/study_portfolio.py` | Multi-study views |

### Layer 2: Services (business logic)
Core data services:
- `services/study_discovery.py` — Study scanning and registration
- `services/xpt_processor.py` — XPT I/O with CSV caching
- `services/study_metadata_service.py` — TS domain parsing → StudyMetadata
- `services/insights_engine.py` — R01-R17 cross-domain rules

### Layer 3: Analysis Modules (45 files in `services/analysis/`)
- **Pipeline**: `parameterized_pipeline.py` (orchestrator), `findings_pipeline.py` (shared enrichment)
- **Domain-specific**: `findings_lb.py`, `findings_bw.py`, `findings_mi.py`, `findings_om.py`, etc. (12 modules)
- **Statistical**: `statistics.py`, `williams.py`, `ancova.py`
- **Classification**: `classification.py`, `adaptive_trees.py`, `progression_chains.py`
- **Specialized**: syndrome detection, confidence scoring, organ normalization, recovery, HCD

### Layer 4: Validation (`validation/`)
- `engine.py` — Main ValidationEngine (CDISC CORE + custom rules)
- `core_runner.py` — CDISC CORE integration (400+ rules)
- `checks/study_design.py` — 7 SD rules
- `checks/fda_data_quality.py` — 7 FDA rules
- `rules/*.yaml` — Rule definitions
- `metadata/` — SENDIG variable metadata, controlled terms

### Entry Point: `main.py`
- FastAPI app with lifespan startup (discovers studies)
- CORS middleware (allows *)
- Mounts all routers under `/api`
- Serves React SPA from `static/` on catch-all route

## Frontend Architecture (`frontend/src/`)

### Entry Points
- `main.tsx` — React init with QueryClient (5 min stale time)
- `App.tsx` — React Router 7 with lazy-loaded routes

### Routes (8)
```
/                                    → Landing page
/studies/:studyId                    → Study summary
/studies/:studyId/domains/:name      → Domain browser
/studies/:studyId/findings           → Adverse effects
/studies/:studyId/dose-response      → Dose-response analysis
/studies/:studyId/histopathology     → Histopathology review
/studies/:studyId/noael-determination → NOAEL determination
/studies/:studyId/validation         → Validation triage
```

### Layout: Three-Panel Datagrok-Style (`components/layout/Layout.tsx`)
- **Left** (260px): `BrowsingTree` — study/domain navigation
- **Center** (flexible): Route-dependent view content
- **Right** (380px): `ContextPanel` — selection-aware detail panel

### State Management
- **Server state**: TanStack React Query (5 min stale, automatic cache invalidation)
- **UI state**: 10 React Contexts:
  - `SelectionContext`, `FindingSelectionContext`, `ViewSelectionContext`
  - `TreeControlContext`, `DesignModeContext`, `StudySelectionContext`
  - `GlobalFilterContext`, `RailModeContext`, `ScheduledOnlyContext`, `StudySettingsContext`

### Component Organization (`components/`)
- `layout/` — Layout, Header
- `tree/` — BrowsingTree navigation
- `panels/` — AppLandingPage, CenterPanel, ContextPanel
- `analysis/` — 6 view wrappers + 25+ supporting components
- `data-table/` — TanStack React Table implementations
- `ui/` — shadcn/ui primitives (Radix + CVA)
- `shell/` — Rail management
- `portfolio/` — Multi-study views

### Hooks (75+ in `hooks/`)
Organized by function: study-level, domain-level, analysis views, annotations, validation, filters

### Lib Utilities (70+ in `lib/`)
Stateless, pure functions: API clients, data transformation, syndrome detection, statistics, scoring, visualization helpers

### Types (`types/`)
6 type definition files: `index.ts`, `study-context.ts`, `analysis.ts`, `analysis-views.ts`, `annotations.ts`, `mortality.ts`, `timecourse.ts`

## Key Design Patterns

1. **Thin routers, rich services** — All business logic in services/analysis, routers only dispatch
2. **Parameterized pipeline** — 8 analysis settings toggles via `apply_settings_transforms()`
3. **Dual syndrome engines** — Histopath-specific (14 rules) and cross-domain (9 rules XS01–XS09), intentionally separate
4. **Client-side synthesis** — API returns raw data, frontend computes derived views
5. **Context-based selection** — React Context for non-fetched state, TanStack Query for server state
6. **Validation as service** — Generic YAML rules + dispatcher pattern
7. **Annotation overlay** — Stored separately in JSON, merged at render time
