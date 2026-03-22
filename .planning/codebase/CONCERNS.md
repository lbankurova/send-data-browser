# Technical Concerns & Debt

## Critical Issues

### 1. Overly Permissive CORS
- **File**: `backend/main.py` (CORS middleware)
- `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`
- Acceptable for internal dev tool; requires whitelist for production/FDA deployment

### 2. No Authentication or Authorization
- All annotations hardcoded to reviewer `"User"`
- Zero auth middleware
- Blocks FDA submission requirements
- Tracked as HC-05, HC-06, MF-08

### 3. File-Based Annotation Storage
- `backend/routers/annotations.py` uses flat JSON files
- Race conditions on concurrent writes
- No ACID guarantees — problematic for regulated data
- Tracked as HC-04, GAP-05

## High-Priority Issues

### 4. Hardcoded Dose Mappings
- **File**: `backend/services/analysis/dose_groups.py`
- Only works for PointCross study
- Blocks multi-study deployment (HC-01, HC-02)

### 5. Single-Study Allowlist
- **File**: `backend/config.py`
- `ALLOWED_STUDIES = {"PointCross"}` hard-limits the application
- Blocks multi-study use (HC-03, HC-07)

### 6. No Backend Unit Tests
- 15,000+ LOC Python with minimal pytest coverage
- High-risk refactoring without regression safety net
- Tracked as GAP-22

### 7. Unpinned Backend Dependencies
- `backend/requirements.txt` has no version pins (fastapi, uvicorn, pandas, pyreadstat)
- `backend/_core_engine/requirements.txt` has aging packages (pandas 2.1.4, numpy 1.26)
- Reproducibility and security risk

## Medium-Priority Issues

### 8. Large Monolithic Components
- `DoseResponseView.tsx` — ~2,850 lines
- `HistopathologyView.tsx` — ~2,564 lines
- `NoaelDeterminationView.tsx` — ~2,010 lines
- 5 context panel components >1,500 lines each
- Hard to test, maintain, and extend

### 9. Column Resize Bug
- **File**: `frontend/src/components/analysis/HistopathologyView.tsx`
- TanStack React Table drag-to-resize not working in OverviewTab
- Severity matrix table works; likely sort handler conflict (BUG-06)

### 10. Recovery Dumbbell Chart Responsive Failure
- **File**: `frontend/src/components/analysis/panes/RecoveryDumbbellChart.tsx`
- Fixed viewBox doesn't adapt to panel resize
- Labels clip, columns misalign (BUG-07)

### 11. No XPT Cache Invalidation
- **File**: `backend/services/xpt_processor.py`
- CSV caches created without TTL
- Stale data served if study files are updated

### 12. No Incremental Recomputation
- **File**: `backend/generator/generate.py`
- Full pipeline runs on every settings change
- No memoization of XPT parsing or statistics
- ~2s per study; degrades at scale (GAP-08)

### 13. Loose Exception Handling
- **File**: `backend/services/xpt_processor.py`
- Bare `except Exception` blocks hide real errors
- Encoding fallback logic hard to debug

### 14. Incomplete Syndrome Rail Indicator
- **File**: `frontend/src/components/analysis/FindingsRail.tsx`
- Rail rows missing syndrome IDs in non-grouping mode (MF-09 partial)

## Low-Priority Issues

### 15. TODO/FIXME Comments
- 13 TODO comments in `backend/_core_engine/` — architectural improvements
- SelectionContext duplication (SD-10)
- Client-side derivation pipeline not fully server-side (GAP-26)

### 16. Missing Domain Parsers
- No estrous cycle data parser (GAP-21, blocked on test data)
- FW domain missing from on-demand adverse effects (SD-08)

### 17. Large Test Files
- 2,725+ line test files (conftest sprawl)

## Deferred Infrastructure

### 18. No Multi-Study Support
- HC-01, HC-02, HC-03, HC-07 all blocked on single-study architecture
- Requires dose group generalization + config changes

### 19. No Database Infrastructure
- HC-04, GAP-05 blocked — annotations need proper DB
- Auth system requires user/session storage

### 20. No CI/CD Pipeline
- Tests run locally only
- No automated build/deploy process

## Tracked Issue References
- 34 open issues in `docs/TODO.md`
- 40 resolved issues archived
- 10 TOPIC hub docs completed
- All FEAT-01 through FEAT-09 implemented
