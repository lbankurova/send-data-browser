# Portable Paths

## What this does

Removes all hardcoded Windows paths (`C:\pg\pcc\...`, `C:\pg\pcc-design\...`) from code and documentation so the app works on any OS without manual path editing.

## Problem

The codebase was originally developed on a Windows machine at `C:\pg\pcc\`. Absolute Windows paths appear in:

1. **`backend/config.py`** — `SEND_DATA_DIR` defaults to `r"C:\pg\pcc\send"`, causing `FileNotFoundError` on macOS/Linux
2. **`CLAUDE.md`** — Development commands reference `C:/pg/pcc/backend/...` and `C:/pg/pcc/frontend/...`
3. **`docs/portability/porting-guide.md`** — References `C:\pg\pcc-design\` and `C:\pg\pcc\`
4. **`docs/portability/datagrok-implementation-plan.md`** — ~20 references to `C:/pg/pcc/` file paths
5. **`docs/portability/prototype-decisions-log.md`** — References `C:\pg\pcc\send`

## Changes required

### `backend/config.py` (code fix)

Replace:
```python
SEND_DATA_DIR = Path(os.environ.get("SEND_DATA_DIR", r"C:\pg\pcc\send"))
```
With:
```python
SEND_DATA_DIR = Path(os.environ.get("SEND_DATA_DIR", Path(__file__).parent.parent / "send"))
```

This resolves to `<repo_root>/send/` — the directory already in the repo with study data. The env var override still works.

### `CLAUDE.md` (documentation fix)

Replace all Windows-specific dev commands with portable equivalents:
- `C:/pg/pcc/backend` → `backend/` (relative paths)
- `C:/pg/pcc/backend/venv/Scripts/uvicorn.exe` → `backend/.venv/bin/uvicorn` or just document `uvicorn`
- `C:/pg/pcc/frontend` → `frontend/` (relative paths)
- Remove the "Windows Shell Notes" section (or generalize it)
- Update the "External specs" reference from `C:\pg\pcc-design\` to `pcc-design/` (the directory exists in the repo root)
- Update the P5.3 entry in Demo/Stub section

### `docs/portability/porting-guide.md` (documentation fix)

Replace absolute paths with repo-relative paths:
- `C:\pg\pcc-design\datagrok-patterns.ts` → `pcc-design/datagrok-patterns.ts`
- `C:\pg\pcc\CLAUDE.md` → `CLAUDE.md`
- `C:\pg\pcc-design\views\*.md` → `docs/views/*.md` (these were moved into the repo)

### `docs/portability/datagrok-implementation-plan.md` (documentation fix)

Replace all `C:/pg/pcc/` prefixes with repo-relative paths:
- `C:/pg/pcc/backend/generator/` → `backend/generator/`
- `C:/pg/pcc/frontend/src/lib/...` → `frontend/src/lib/...`
- `C:/pg/pcc/CLAUDE.md` → `CLAUDE.md`
- `C:/pg/pcc-design/...` → `pcc-design/...`
- `C:/pg/pcc/send/` → `send/`

### `docs/portability/prototype-decisions-log.md` (documentation fix)

Replace `C:\pg\pcc\send` with repo-relative `send/` path.

## Acceptance criteria

- When I clone the repo on macOS and start the backend without setting any env vars, it starts without `FileNotFoundError`
- `grep -r 'C:\\\\pg\\|C:/pg' .` returns zero matches (excluding `.git/` and `node_modules/`)
- All documentation paths reference repo-relative locations, not absolute Windows paths
- `SEND_DATA_DIR` env var override still works when set

## Open questions

None.
