# Multi-Study Discovery (HC-03)

## What this does

Removes the single-study restriction (`ALLOWED_STUDIES = {"PointCross"}`) so that all SEND studies found in `SEND_DATA_DIR` are discovered at startup. Currently only PointCross is served regardless of how many study folders exist. Also removes a frontend guard that blocks context panel functionality for non-PointCross studies.

## User workflow

1. User places one or more study folders (each containing `.xpt` files) in the `send/` directory
2. User starts the app
3. All studies appear in the landing page studies table — not just PointCross
4. User selects any study and gets full context panel functionality (metadata, actions, inspector)
5. Imported studies (via `POST /api/import`) continue to work as before — they bypass `ALLOWED_STUDIES` via direct cache registration

## Data model

### Input data

- **Source:** Study folders in `SEND_DATA_DIR` (default: `<repo_root>/send/`), each containing `.xpt` files
- **Discovery:** `discover_studies()` in `services/study_discovery.py` scans the directory, builds `StudyInfo` objects, and applies `ALLOWED_STUDIES` as a filter. When `ALLOWED_STUDIES` is empty, no filter is applied.

### Changes required

**`backend/config.py`** (line 15):
```python
# Before:
ALLOWED_STUDIES = {"PointCross"}

# After:
ALLOWED_STUDIES: set[str] = set()
```

When empty, the filter in `study_discovery.py:37-38` is skipped (`if ALLOWED_STUDIES:` is falsy for an empty set), so all discovered studies are served.

**`frontend/src/components/panels/ContextPanel.tsx`** (line 436):
```typescript
// Remove this guard:
if (selectedStudyId !== "PointCross") {
  // ... "This is a demo entry" message ...
}
```

This guard blocks the context panel for any non-PointCross study, showing "This is a demo entry. Select PointCross to explore full functionality." With multi-study support, all real studies should have full context panel functionality.

## UI specification

No new UI. The landing page studies table, import section, and context panel already support multiple studies. This change simply populates them with all available data.

### Behavioral change

| Before | After |
|--------|-------|
| Studies table shows only PointCross (plus demo entries) | Shows all studies in `send/` directory |
| Context panel shows "demo entry" for non-PointCross | Context panel works for all real studies |
| Startup logs show 1 study discovered | Startup logs show N studies discovered |

## Integration points

### Systems touched

- **`docs/systems/data-pipeline.md`** — Study discovery is the first stage of the data pipeline. Removing the filter changes which studies enter the pipeline at startup.
- **`docs/systems/navigation-and-layout.md`** — The browsing tree and context panel will show all discovered studies. The HC-07 PointCross guard in `ContextPanel.tsx` must be removed.

### Views touched

- **`docs/views/app-landing.md`** — Studies table will show more entries. No code change needed — the table already renders whatever `GET /api/studies` returns.

### Downstream items unblocked

- **HC-07** (non-PointCross demo guard) — Resolved by removing the `ContextPanel.tsx` guard in this change.

### Risk: studies with non-standard structure

Some study folders in `send/` may have unusual ARMCD mappings (HC-01), non-UTF-8 encoding (resolved by XPT encoding fix), or missing TS metadata. These are pre-existing issues — opening discovery does not create them, but it exposes them. The app should handle them gracefully:
- Missing TS metadata: species/study_type shown as "—" in the table (already handled)
- Generator failure: non-fatal, study is still browsable in domain viewer (already handled)
- Validation failure: non-fatal (already handled)

## Acceptance criteria

- When I start the app with multiple study folders in `send/`, all studies appear in the landing page table
- When I select any study (not just PointCross), the context panel shows study metadata and actions — not "This is a demo entry"
- When `ALLOWED_STUDIES` is empty, `discover_studies()` returns all valid study folders
- Imported studies (via the import endpoint) still appear correctly alongside discovered studies
- Studies with missing or incomplete TS metadata still appear in the table with "—" for missing fields
- `npm run build` passes
- Backend starts without error

## Datagrok notes

In the production Datagrok plugin:
- Study discovery would be replaced by Datagrok's project/data connection management
- The `ALLOWED_STUDIES` config would not exist — access control would be handled by Datagrok's permission system
- The PointCross guard in ContextPanel would not exist — Datagrok's native context panel handles all data sources equally

## Open questions

None — this is a straightforward config change with one frontend guard removal.
