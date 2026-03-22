# Technology Stack

## Languages & Versions

| Language | Version | Usage |
|----------|---------|-------|
| **Python** | 3.10+ | Backend API, analysis pipeline, data processing |
| **TypeScript** | ~5.9.3 | Frontend application (strict mode, `verbatimModuleSyntax`) |
| **ES2022** | Target | JavaScript compilation target |

## Runtimes

- **Backend**: Uvicorn ASGI server with FastAPI on port 8000
- **Frontend**: Vite dev server on port 5173 with proxy to `/api`
- **Python venv**: `backend/venv/` — isolated Python environment

## Frameworks

| Framework | Version | Role |
|-----------|---------|------|
| **FastAPI** | unpinned | Backend REST API (`backend/main.py`) |
| **React** | 19.2.0 | Frontend UI framework |
| **Vite** | 5.4.21 | Build tool and dev server |
| **React Router** | 7.13.0 | Client-side routing (8 routes) |
| **TailwindCSS** | 4.0 | Utility-first CSS via `@tailwindcss/vite` plugin |

## Key Backend Dependencies (`backend/requirements.txt`)

- `fastapi`, `uvicorn[standard]` — API server
- `pyreadstat` — SAS Transport (.xpt) file parsing
- `pandas` — Data manipulation
- `scipy>=1.11` — Statistical tests (Dunnett, Williams, Fisher)
- `scikit-posthocs` — Post-hoc pairwise comparisons
- `openpyxl` — Excel file support
- `python-multipart` — File upload handling

## Key Frontend Dependencies (`frontend/package.json`)

- `@tanstack/react-query` (^5.90.20) — Server state management (5 min stale)
- `@tanstack/react-table` (^8.21.3) — Data tables with sorting/filtering
- `@radix-ui/*` (^1.4.3) — Accessible UI primitives (via shadcn/ui)
- `echarts` (^6.0.0) — Charts and visualizations
- `lucide-react` (^0.563.0) — Icons
- `class-variance-authority` — Component variant styling

## Dev Tooling

- `vitest` (^4.0.18) — Frontend unit tests
- `eslint` — Linting with React Hooks plugin
- `typescript` (~5.9.3) — Type checking
- `@tailwindcss/vite` — TailwindCSS integration

## Configuration Files

| File | Purpose |
|------|---------|
| `backend/config.py` | SEND_DATA_DIR, CACHE_DIR, HCD_DB_PATH, ALLOWED_STUDIES filter |
| `frontend/vite.config.ts` | Port 5173, proxy `/api` → port 8000 |
| `frontend/tsconfig.app.json` | Strict mode, path alias `@/*` → `src/*` |
| `frontend/.eslintrc.js` | ESLint rules, React Hooks plugin |
| `frontend/tailwind.config.js` | Design tokens, custom Datagrok theme |

## Build & Dev Commands

```bash
# Backend
cd backend && venv/Scripts/uvicorn.exe main:app --reload --port 8000
python -m generator.generate {study_id}    # Pre-generate analysis JSON

# Frontend
cd frontend && npm run dev      # Dev server :5173
cd frontend && npm run build    # tsc + vite production build
cd frontend && npm run lint     # ESLint
cd frontend && npm test         # Vitest (48 assertions)
```

## Environment Notes

- **Windows**: Set `OPENBLAS_NUM_THREADS=1` before starting backend (prevents pandas hang)
- **Never pip install while dev server is running** — reload watcher corrupts venv DLLs
- API docs available at `http://localhost:8000/docs` (OpenAPI/Swagger)

## Database

- **SQLite**: `backend/data/hcd.db` (9.7 MB) — NTP historical control organ weight data
- **Annotations**: Flat JSON files in `backend/annotations/{study_id}/`
