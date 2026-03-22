# Testing Infrastructure

## Frontend Testing

### Framework
- **Vitest** (^4.0.18) — test runner
- **Test location**: `frontend/tests/` (40+ test files)
- **Pipeline**: 48 assertions across test suite
- **Command**: `cd frontend && npm test`

### Test Patterns
- Test files named `*.test.ts` or `*.test.tsx`
- Tests organized by feature/module
- Import from `@/lib/*` and `@/types/*` using path aliases
- Assertions using Vitest `expect()` API

### What's Tested
- Lib utility functions (syndrome detection, classification, scoring)
- Data transformation logic
- Statistical computations
- Type validation

### What's NOT Tested
- React component rendering (no component tests)
- Hook behavior (no hook testing utilities)
- Integration tests (frontend ↔ backend)
- E2E tests (no Playwright/Cypress)

## Backend Testing

### Framework
- **pytest** with `pytest.ini` configuration
- **Test location**: `backend/tests/`
- **Command**: `cd backend && venv/Scripts/python.exe -m pytest`

### Current State
- Test files exist but coverage is minimal
- 15,000+ LOC Python with limited automated testing
- Analysis pipeline primarily validated through generated output inspection
- CDISC CORE engine has its own test suite in `_core_engine/`

### Test Gaps
- No unit tests for analysis modules (`services/analysis/`)
- No integration tests for API endpoints
- No validation engine tests
- Regression risks on refactoring

## Test Commands

```bash
# Frontend
cd frontend && npm test              # Run Vitest suite
cd frontend && npm test -- --watch   # Watch mode

# Backend
cd backend && venv/Scripts/python.exe -m pytest        # Run pytest
cd backend && venv/Scripts/python.exe -m pytest -v      # Verbose output
```

## Coverage

- **Frontend**: Moderate — lib utilities well-tested, components untested
- **Backend**: Minimal — manual testing via generated output + API docs
- **No CI/CD pipeline** — tests run locally only
