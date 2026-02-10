# Bug: ndarray JSON Serialization Failure in Adverse Effects

## What this does

Fixes a crash where the adverse effects endpoint (`GET /api/studies/{id}/analyses/adverse-effects`) returns a 500 error for studies whose findings pipelines produce numpy `ndarray` objects in the `raw_values` field. The JSON encoder cannot serialize ndarrays, so the response fails with `TypeError: Object of type ndarray is not JSON serializable`.

## User workflow

1. User imports or opens a study (e.g., Nimble)
2. User navigates to the adverse effects view
3. **Before fix:** 500 error, blank page
4. **After fix:** Adverse effects table loads normally

## Data model

### Root cause

Three findings modules build per-dose-group value arrays using pandas `.values`, which returns `np.ndarray`:

| File | Line pattern | Field |
|------|-------------|-------|
| `services/analysis/findings_lb.py` | `grp[...]["value"].dropna().values` | `raw_values` |
| `services/analysis/findings_bw.py` | `grp[...]["value"].dropna().values` | `raw_values` |
| `services/analysis/findings_om.py` | `dose_grp["value"].dropna().values` | `raw_values` |

These ndarrays are stored in finding dicts as `"raw_values": [ndarray, ndarray, ...]`.

### Sanitization gap

`_sanitize_floats()` in `services/analysis/unified_findings.py` handles:
- `np.integer` -> `int`
- `float` / `np.floating` -> `float` (with NaN/Inf -> None)
- `dict` -> recurse
- `list` -> recurse

But it did **not** handle `np.ndarray`, which passed through unchanged to JSON serialization.

### Fix

Add one clause to `_sanitize_floats()`:

```python
if isinstance(obj, np.ndarray):
    return _sanitize_floats(obj.tolist())
```

This converts the ndarray to a Python list, then recurses to sanitize individual elements (converting numpy scalars and NaN/Inf values).

### Cached data

The adverse effects pipeline caches results at `cache/{study_id}/adverse_effects.json`. Studies that failed before the fix will have no cached file (since `json.dump()` failed). Studies that succeeded before may have cached files with no ndarrays (if their data happened not to trigger the code path). No cache invalidation is needed — failed studies simply never cached, and will compute correctly on next request.

## UI specification

No UI changes. The fix is entirely in the backend serialization layer.

## Integration points

### Systems touched

- **`docs/systems/data-pipeline.md`** — The adverse effects analysis pipeline (`unified_findings.py`) is part of the data pipeline. The `_sanitize_floats()` function is a shared sanitizer used by all findings before caching and response.

### Files modified

- `backend/services/analysis/unified_findings.py` — Added `np.ndarray` handling to `_sanitize_floats()`

## Acceptance criteria

- When I open the adverse effects view for a study with LB, BW, or OM domain findings, the table loads without error
- When the findings pipeline produces numpy arrays in `raw_values`, they are serialized as JSON arrays of numbers
- When `raw_values` arrays contain NaN or Inf, those values are serialized as `null`
- No existing studies that previously worked are broken by the change

## Datagrok notes

In the production Datagrok plugin, the findings pipeline may use Datagrok's data frames instead of pandas, which would avoid numpy types entirely. If pandas is retained, the same sanitization is needed.

## Open questions

None — this is a straightforward bug fix.
