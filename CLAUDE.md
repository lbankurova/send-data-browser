# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SEND Data Browser — a web app for exploring pre-clinical regulatory study data (SEND format). Studies are stored as SAS Transport (.xpt) files in `send/` and served through a REST API to a React frontend.

## Development Commands

### Backend (FastAPI + Python)
```bash
# Start dev server (from project root)
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/uvicorn.exe main:app --reload --port 8000

# Install dependencies
C:/pg/pcc/backend/venv/Scripts/pip.exe install -r C:/pg/pcc/backend/requirements.txt

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

## Architecture

### Backend (`backend/`)
- **Framework**: FastAPI with uvicorn
- **Entry**: `main.py` — app setup, CORS (allows localhost:5173), lifespan startup discovers studies
- **Routers**: `routers/studies.py` — all API endpoints under `/api`
- **Services**: `services/study_discovery.py` (scan `send/` for studies), `services/xpt_processor.py` (read XPT files, CSV caching, metadata extraction)
- **Models**: `models/schemas.py` — Pydantic response models
- **Config**: `config.py` — paths, skip list, allowed studies filter, pagination defaults

**API Endpoints:**
| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/studies` | All studies with summary metadata |
| GET | `/api/studies/{study_id}/metadata` | Full study metadata from TS domain |
| GET | `/api/studies/{study_id}/domains` | List of domains with row/col counts |
| GET | `/api/studies/{study_id}/domains/{domain_name}?page=&page_size=` | Paginated domain data (all values as strings) |

**Data flow**: XPT files → `pyreadstat` → pandas DataFrame → CSV cache (`backend/cache/{study_id}/{domain}.csv`) → paginated JSON responses. Cache is lazy-loaded and validated by file mtime.

**Study discovery**: Flat folders with .xpt files become studies. Nested folders use `parent--child--leaf` naming convention. `config.ALLOWED_STUDIES` filters which studies are served (currently `{"PointCross"}`).

### Frontend (`frontend/src/`)
- **Framework**: React 19 + TypeScript (strict mode) + Vite
- **Styling**: TailwindCSS v4 with custom Datagrok UI color theme in `index.css`
- **UI Components**: shadcn/ui (Radix UI + CVA) in `components/ui/`
- **State**: TanStack React Query for server state (5 min stale time), React Context for study selection (`contexts/SelectionContext.tsx`)
- **Tables**: TanStack React Table with server-side pagination

**Layout**: Three-panel design:
- **Left**: `BrowsingTree` — study/domain navigation tree with categorized domains
- **Center**: Route-dependent content (`AppLandingPage`, `StudyLandingPage`, `CenterPanel`)
- **Right**: `ContextPanel` — metadata inspector for selected study

**Routes** (React Router 7):
- `/` — studies list table
- `/studies/:studyId` — study metadata view
- `/studies/:studyId/domains/:domainName` — paginated domain data table

**Key modules:**
- `lib/api.ts` — fetch wrapper hitting `http://localhost:8000/api`
- `lib/send-categories.ts` — maps SEND domain codes to categories and descriptions
- `hooks/` — React Query wrappers: `useStudies`, `useStudyMetadata`, `useDomains`, `useDomainData`, `useDomainsByStudy` (memoized categorization)
- `types/index.ts` — shared TypeScript interfaces matching backend schemas

## TypeScript Conventions

- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
- Path alias: `@/*` maps to `src/*`

## Data

- 16 study folders in `send/` containing ~437 .xpt files
- Study ID = folder name (or `parent--child--leaf` for nested TOXSCI studies)
- TS (Trial Summary) domain contains study metadata as TSPARMCD → TSVAL key-value pairs
- SUPP* domains are supplemental qualifiers for their parent domain
