# [App Name] -- Prototype

> **Purpose:** UX prototype demonstrating the [App Name] interaction model for Datagrok developers.
> **Stack:** React + TypeScript + FastAPI + TailwindCSS
> **Methodology:** See `../../prototype-methodology-guide.md`
> **Spec:** See `docs/spec/`

---

## Directory Structure

```
[app-name]-prototype/
|-- README.md                              # This file
|-- CLAUDE.md                              # Agent instructions (read first, update every session)
|-- docs/
|   |-- spec/                              # Multi-part application spec
|   |   |-- [app]-spec-p1.md               # Part 1: Foundations (sections 1-4)
|   |   |-- [app]-spec-p2.md               # Part 2: User workflow (sections 5-7)
|   |   |-- [app]-spec-p3.md               # Part 3: Analysis & exploration (sections 8-11)
|   |   |-- [app]-spec-p4.md               # Part 4: Decisions & collaboration (sections 12-14)
|   |   |-- [app]-spec-p5.md               # Part 5: Implementation (sections 15-17)
|   |   +-- SPEC-TEMPLATE.md               # Blank spec skeleton (copy from scaffold)
|   |-- handoffs/                          # Session handoff documents
|   |   +-- YYYY-MM-DD-description.md      # One per agent session
|   |-- design/
|   |   |-- visual-design-guide.md         # Color schemes, typography, spacing
|   |   |-- [app]-prototype-prompt.md      # Build prompt with REAL/STUB/SKIP matrix
|   |   |-- [platform]-patterns.ts         # Platform API patterns reference
|   |   +-- views/                         # Per-view audit/description documents
|   |       |-- view-1-name.md             # Written after each view is built
|   |       |-- view-2-name.md
|   |       +-- ...
|   +-- portability/                       # Portability package (assembled at end)
|       |-- porting-guide.md               # Prototype-to-Datagrok component mapping
|       |-- pipeline-spec.md               # Computation pipeline annotated for production
|       |-- decisions-log.md               # Design decisions with rationale
|       +-- implementation-plan.md         # Phased build plan for Datagrok developer
|-- backend/
|   |-- main.py                            # FastAPI entry point
|   |-- config.py                          # Paths, settings
|   |-- requirements.txt                   # Python dependencies
|   |-- app/
|   |   |-- routers/                       # API route handlers
|   |   |-- services/                      # Business logic
|   |   +-- models/                        # Pydantic schemas
|   |-- computation/                       # Domain-specific computation (portable)
|   |   |-- generate.py                    # Generator script entry point
|   |   |-- pipeline.py                    # Computation pipeline
|   |   |-- stats.py                       # Statistical methods
|   |   +-- rules.py                       # Rule engine (if applicable)
|   |-- data/                              # Source data files
|   |   +-- [study or dataset files]
|   +-- generated/                         # Output from generator (git-ignored)
|       +-- [dataset_id]/
|           |-- view_1_data.json
|           |-- view_2_data.json
|           +-- static/                    # Pre-rendered charts (HTML/SVG)
|-- frontend/
|   |-- package.json
|   |-- vite.config.ts
|   |-- tsconfig.json
|   |-- tailwind.config.ts                 # (or TailwindCSS v4 via index.css)
|   |-- index.html
|   |-- public/
|   +-- src/
|       |-- App.tsx                        # Routes, layout shell
|       |-- index.css                      # Global styles, Tailwind imports
|       |-- components/
|       |   |-- ui/                        # shadcn/ui base components
|       |   |-- layout/                    # Shell: BrowsingTree, ContextPanel, Ribbon
|       |   |-- analysis/                  # View components (one per view)
|       |   |   |-- View1Name.tsx
|       |   |   |-- View2Name.tsx
|       |   |   |-- charts/               # Chart components
|       |   |   +-- panes/                 # Context panel panes per view
|       |   +-- shared/                    # Shared components (forms, badges, cards)
|       |-- hooks/
|       |   |-- useView1Data.ts            # React Query hook per view
|       |   |-- useView2Data.ts
|       |   +-- useAnnotations.ts          # Annotation persistence hook
|       |-- lib/
|       |   |-- api.ts                     # Fetch wrapper for API calls
|       |   |-- colors.ts                  # Color scale functions (from spec 11.1)
|       |   |-- analysis-definitions.ts    # View inventory, feature flags
|       |   +-- report-generator.ts        # HTML report builder (if applicable)
|       |-- types/
|       |   |-- views.ts                   # TypeScript interfaces for view data
|       |   +-- annotations.ts             # TypeScript interfaces for annotations
|       +-- contexts/
|           |-- SelectionContext.tsx        # Primary selection state
|           +-- ViewSelectionContext.tsx    # Per-view selection state
+-- scripts/
    |-- generate_data.py                   # Runs computation pipeline, writes JSON
    +-- setup.sh                           # (optional) One-command dev setup
```

---

## Quick Start

### Prerequisites

- Python 3.10+ with pip
- Node.js 18+ with npm
- Source data files in `backend/data/`

### Setup

```bash
# 1. Backend
cd backend
python -m venv venv
venv/Scripts/pip install -r requirements.txt    # Windows
# venv/bin/pip install -r requirements.txt      # macOS/Linux

# 2. Generate analysis data from source files
cd backend
venv/Scripts/python -m computation.generate [DATASET_ID]

# 3. Frontend
cd frontend
npm install
```

### Run

```bash
# Terminal 1: Backend (port 8000)
cd backend
venv/Scripts/uvicorn main:app --reload --port 8000

# Terminal 2: Frontend (port 5173, proxied to backend)
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

### Windows-Specific Notes

- Use forward slashes in all bash commands: `C:/pg/app/backend/...`
- Run Python/pip via full venv path: `backend/venv/Scripts/python.exe`
- If pandas import hangs, set `$env:OPENBLAS_NUM_THREADS = 1` in PowerShell before starting backend

---

## Conventions

### Code Style

- **TypeScript strict mode** with `noUnusedLocals` and `noUnusedParameters`
- **`verbatimModuleSyntax: true`** -- always use `import type { Foo }` for type-only imports
- **TailwindCSS** for all styling. No custom CSS files except `index.css` globals.
- **shadcn/ui** for base components (buttons, dropdowns, dialogs, collapsible, accordion)
- **Sentence case** for all UI text by default. Title Case only for L1 page headers and dialog titles.

### Architecture

- **Frontend does not compute.** All derived data comes from the backend (pre-generated JSON or API responses). Frontend only filters, sorts, and renders.
- **One React Query hook per data source.** Each view's data has its own hook in `hooks/`. Hooks are the API boundary.
- **Context for shared selection.** Selection state that spans components (grid + chart + context panel) lives in React Context, not prop drilling.
- **Pre-rendered static charts.** Charts that don't need user interaction are generated as HTML/SVG by the computation pipeline and embedded directly. Only charts that respond to selection/filters are built with a charting library.

### Agent Commit Protocol

Every commit must:

1. **If you resolved a demo/stub item:** Update its entry in the CLAUDE.md migration guide.
2. **If you introduced new demo/stub code:** Add a new entry with file path, line number, description, and production replacement instruction.
3. **If your changes shifted line numbers** in files referenced by the migration guide: Update the line numbers.
4. **Update the summary table** at the bottom of the migration guide.

### File Naming

- **Views:** `View1Name.tsx`, `View2Name.tsx` -- PascalCase matching the view inventory in the spec
- **Hooks:** `useView1Data.ts` -- camelCase `use` prefix
- **Context panels:** `View1ContextPanel.tsx` -- view name + `ContextPanel`
- **Types:** Interfaces in `types/views.ts` matching the spec DataFrame schemas
- **Generated data:** `snake_case.json` matching the spec DataFrame names

---

## Key References

| Document | Location | Purpose |
|----------|----------|---------|
| Methodology guide | `../../prototype-methodology-guide.md` | How this prototype was built |
| Spec template | `../../spec-template.md` | Blank spec skeleton (for new specs) |
| View audit template | `../../view-audit-template.md` | Template for per-view description documents |
| Application spec | `docs/spec/` | The design spec for this specific app |
| Build prompt | `docs/design/[app]-prototype-prompt.md` | REAL/STUB/SKIP matrix and build order |
| CLAUDE.md | `./CLAUDE.md` | Agent instructions, architecture, migration guide |

---

## What is Real vs. Stub

GUIDANCE: Fill this in as you build. Move items to the appropriate column. This is the quick-reference version of the migration guide in CLAUDE.md.

| Component | Status | Notes |
|-----------|--------|-------|
| [Computation pipeline] | **Real** | [Description] |
| [View 1 UI] | **Real** | [Description] |
| [View 2 UI] | **Real** | [Description] |
| [Landing page entries] | **Demo** | [What's fake] |
| [Import workflow] | **Stub** | [What doesn't work] |
| [Authentication] | **Missing** | [Not built] |
| [Database storage] | **Missing** | [Not built] |

---

## Creating a New Project from This Template

1. Copy this entire `prototype-project-template/` directory
2. Rename to `[app-name]-prototype/`
3. Copy `../../spec-template.md` to `docs/spec/` and fill in your app's spec
4. Write a build prompt in `docs/design/[app]-prototype-prompt.md` with:
   - REAL / STUB / SKIP classification for every feature
   - Step-by-step build order (generator script first, then shell, then view-by-view)
   - Reading order for spec sections
5. Create a platform patterns file in `docs/design/` if needed
6. Initialize CLAUDE.md from the template below
7. Follow the methodology guide phases: spec, architecture, iterative build, portability prep

---

## CLAUDE.md Initialization Template

Copy the following into `CLAUDE.md` and fill in the bracketed sections:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

[One paragraph: what the app does, who it's for, what the prototype demonstrates]

**Design spec:** `docs/spec/[app]-spec-p1.md` through `p5.md`
**Build prompt:** `docs/design/[app]-prototype-prompt.md`

## Development Commands

### Backend
\`\`\`bash
cd [path]/backend && [path]/backend/venv/Scripts/uvicorn.exe main:app --reload --port 8000
[path]/backend/venv/Scripts/pip.exe install -r requirements.txt
cd [path]/backend && [path]/backend/venv/Scripts/python.exe -m computation.generate [DATASET_ID]
\`\`\`

### Frontend
\`\`\`bash
cd [path]/frontend && npm run dev
cd [path]/frontend && npm run build
cd [path]/frontend && npm run lint
\`\`\`

## Architecture

### Backend
- [Describe routers, services, models]
- [List API endpoints]

### Frontend
- [Describe component structure, routes, state management]

## Design Decisions
- [Document each explicit design choice]

## Implementation Status

### Completed
- [List completed items]

### In Progress
- [List current work]

### Not Started
- [List remaining work]

## Demo/Stub/Prototype Code -- Production Migration Guide

[Fill in as you build -- see methodology guide section 3.4]

### Summary
| Component | Status | Notes |
|-----------|--------|-------|
```
