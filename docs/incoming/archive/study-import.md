# Study Import & Delete

## What this does

Lets users upload new SEND studies (`.xpt` files) directly through the browser and delete studies they no longer need. Currently the app only serves studies that are pre-placed in the `send/` directory at startup — there is no way to add or remove studies at runtime.

## User workflow

### Import

1. User opens the app landing page (`/`)
2. User expands the "Import new study" section
3. User drags `.xpt` files (or a folder) onto the drop zone — or clicks "Browse" to select files
4. Selected files appear in a list with remove buttons; user can optionally set a Study ID
5. User clicks "Import"
6. System uploads the files, saves them to `SEND_DATA_DIR/{study_id}/`, discovers domains, extracts TS metadata, and runs the generator pipeline
7. The studies list refreshes and the user is navigated to the new study's summary page
8. If import fails (bad files, duplicate study ID), user sees an error message; no partial state is left behind

### Delete

1. User right-clicks (or clicks the three-dot menu) on a study row in the landing page table
2. User selects "Delete study"
3. A confirmation dialog appears: "Delete study {id}? This will remove all data, cache, and generated analysis files."
4. On confirm, system deletes the study directories and unregisters from all in-memory caches
5. The studies list refreshes; if the deleted study was currently open, user is navigated to `/`

## Data model

### Input data

- **Source:** User-uploaded `.xpt` files or `.zip` archives containing `.xpt` files via multipart form POST
- **Validation:** Only files with `.xpt` or `.zip` extension are accepted; at least one `.xpt` file must be present (either uploaded directly or extracted from a `.zip`)

### API endpoints

**`POST /api/import`** — Import a new study

Request: `multipart/form-data`
- `files` (required): One or more `.xpt` or `.zip` file uploads. `.zip` files are extracted server-side; `.xpt` files at any nesting depth within the archive are saved flat into the study directory. Zip entries with path traversal (`..`) are rejected.
- `study_id` (optional, string, **form field**): Identifier for the study. If omitted, derived from the first file's directory path component or falls back to `study-{timestamp}`. **Important:** This must be declared as `Form(None)` in FastAPI, not a bare parameter — bare parameters on multipart endpoints are parsed as query params, not form fields, so the value sent via `FormData.append()` would be silently ignored.

Response `201`:
```json
{
  "study_id": "MyStudy",
  "name": "MyStudy",
  "domain_count": 18,
  "species": "RAT",
  "study_type": "REPEAT DOSE TOXICITY"
}
```

Error responses:
- `400` — No `.xpt` or `.zip` files in upload, or `.zip` contained no `.xpt` files
- `409` — Study ID already exists

Behavior:
1. Separate uploads into `.xpt` and `.zip` files; reject if neither type found. Extract `.xpt` files from any `.zip` archives into the study directory.
2. Check for duplicate `study_id` in in-memory cache (409)
3. Create `SEND_DATA_DIR / study_id`, save files flat (strip leading path components)
4. Build `StudyInfo` from `_find_xpt_files()`, register with all router caches (`studies`, `analyses`, `validation`)
5. Run `generator.generate(study_id)` — non-fatal if it fails (study is still browsable without pre-generated analysis)
6. Run validation engine — non-fatal if it fails
7. On unexpected failure, clean up the created directory (no partial state)
8. Return study summary

**`DELETE /api/studies/{study_id}`** — Delete a study

Response `200`:
```json
{
  "study_id": "MyStudy",
  "deleted": true
}
```

Error responses:
- `404` — Study not found

Behavior:
1. Remove directories: `SEND_DATA_DIR/{study_id}`, `CACHE_DIR/{study_id}`, `generated/{study_id}`, `annotations/{study_id}`
2. Unregister from all in-memory caches (studies, analyses, validation)
3. Return confirmation

### Backend changes required

**New file: `backend/routers/import_study.py`**
- Houses both endpoints
- Imports helper functions from existing routers
- **Gotcha:** Any non-file parameters on the `POST /import` endpoint (e.g. `study_id`) must use `fastapi.Form()` as default, not a plain default value. FastAPI treats bare parameters on multipart endpoints as query params, so `study_id: str | None = None` silently ignores form-submitted values. Correct: `study_id: str | None = Form(None)`.

**Modified: `backend/services/xpt_processor.py`**
- The `read_xpt()` function must handle non-UTF-8 byte sequences in `.xpt` files (e.g., Windows-1252 `0x92` smart quotes from some Instem studies). `pyreadstat.read_xport()` fails or silently returns nulls on these files.
- **Fix:** Replace the simple `pyreadstat.read_xport()` call with an encoding fallback chain:
  1. Try default encoding first
  2. On `UnicodeDecodeError` or "unsupported character set" error, retry with `encoding="cp1252"`
  3. If that fails, retry with `encoding="iso-8859-1"`
  4. If all encodings fail, raise `RuntimeError`
- This is critical for import because user-uploaded studies are more likely to contain non-standard encodings than curated data.

**Modified: `backend/routers/studies.py`**
- Export `register_study(study_id, study_info)` and `unregister_study(study_id)` — add/remove from `_studies`, `_study_metadata`, `_full_metadata` dicts

**Modified: `backend/routers/analyses.py`**
- Export `register_analysis_study(study_id, study_info)` and `unregister_analysis_study(study_id)` — add/remove from analysis cache

**Modified: `backend/routers/validation.py`**
- Export `register_validation_study(study_id, study_info)` and `unregister_validation_study(study_id)` — add/remove from validation cache; register should auto-run validation (non-fatal)

**Modified: `backend/main.py`**
- `app.include_router(import_router)` — wire import router

**Dependency: `python-multipart`**
- Required by FastAPI for `UploadFile` handling
- Add to `backend/requirements.txt`

### Frontend changes required

**Modified: `frontend/src/lib/api.ts`**
```typescript
export async function importStudy(files: File[], studyId?: string): Promise<ImportStudyResult>
// POST /api/import with FormData (files + optional study_id)

export async function deleteStudy(studyId: string): Promise<void>
// DELETE /api/studies/{studyId}

export interface ImportStudyResult {
  study_id: string;
  name: string;
  domain_count: number;
  species: string | null;
  study_type: string | null;
}
```

Both functions must invalidate the `["studies"]` TanStack Query key on success.

## UI specification

### Where it appears

- **Landing page** (`AppLandingPage.tsx`) — center panel at `/`
- Affects the three-dot context menu on study rows and the import section

### Import section (collapsible)

Position: Between hero section and studies table. Collapsed by default.

Toggle: "IMPORT NEW STUDY" with chevron icon (rotates on expand/collapse).

Expanded state:
- **Drop zone**: Dashed border area, accepts `.xpt` files, `.zip` archives, and folders (via `webkitdirectory`). Text: "Drag .xpt files, a .zip archive, or a study folder here". Icon: `Upload`.
- **File list**: Below drop zone when files are selected. Each file shows name + size + remove button (X icon).
- **Study ID field**: Optional text input. Placeholder: "Auto-derived from files if empty".
- **Import button**: Primary button, disabled when no files selected. Shows spinner during upload.
- **Error state**: Red text below the import button with error message from API.

### Delete in context menu

The existing three-dot context menu on each study row adds a "Delete study" item:
- Red text color to indicate destructive action
- Disabled for demo studies
- On click: shows a confirmation dialog (modal with backdrop) with study name
- On confirm: calls `deleteStudy()`, invalidates studies cache, navigates to `/` if the deleted study was active

### States

| State | Behavior |
|-------|----------|
| No files selected | Import button disabled, drop zone shows instruction text |
| Files selected | File list visible, import button enabled |
| Uploading | Import button shows spinner, all inputs disabled |
| Success | Import section collapses, studies list refreshes, navigate to new study |
| Error (400) | "No valid .xpt files found" below import button |
| Error (409) | "Study '{id}' already exists" below import button |
| Error (500) | "Import failed: {message}" below import button |
| Delete pending | Confirmation dialog open |
| Delete success | Studies list refreshes, navigate to `/` if deleted study was active |

## Integration points

### Systems touched

- **`docs/systems/data-pipeline.md`** — Import triggers the generator pipeline (`python -m generator.generate {study_id}`) for the new study. The import endpoint must handle generator failure gracefully (study is still browsable without pre-generated views).
- **`docs/systems/validation-engine.md`** — Import should trigger validation for the new study. The validation router needs a `register_validation_study()` function. Validation failure is non-fatal.
- **`docs/systems/navigation-and-layout.md`** — After import, the browsing tree (left panel) must update to show the new study. After delete, it must remove the study. Both are handled by TanStack Query cache invalidation of `["studies"]`.
- **`docs/systems/annotations.md`** — Delete should also remove any annotation files for the study (`backend/annotations/{study_id}/`).

### Views touched

- **`docs/views/app-landing.md`** — Import section and delete context menu live here. The current import section is a non-functional stub with disabled controls — this feature replaces it with a working implementation.

### New dependencies

- `python-multipart` (PyPI) — required for FastAPI `UploadFile` multipart parsing

## Acceptance criteria

- When I drag `.xpt` files onto the drop zone and click Import, a new study appears in the studies list within 5 seconds
- When I import a study, I am automatically navigated to its study summary page
- When I import a study, the browsing tree in the left panel shows the new study
- When I import a study with the same ID as an existing study, I see a "Study already exists" error (409)
- When I import files that are not `.xpt` or `.zip`, I see a "No .xpt or .zip files found" error (400)
- When I upload a `.zip` containing `.xpt` files, the study imports successfully with all domains discovered
- When I upload a `.zip` with nested folders containing `.xpt` files, all `.xpt` files are extracted and discovered
- When I upload a `.zip` with no `.xpt` files inside, I see a "No valid .xpt files" error (400)
- When I upload a mix of `.xpt` files and a `.zip`, all files are combined correctly into one study
- When I click "Delete study" on a study and confirm, the study is removed from the list and all its data directories are deleted
- When I delete the currently-viewed study, I am navigated to the landing page
- When I delete a study, its cache, generated analysis, and annotation files are also removed
- When I import a study with `.xpt` files containing non-UTF-8 characters (e.g., Windows-1252 encoded), the study imports successfully using encoding fallback (`cp1252` → `iso-8859-1`) instead of failing or silently returning nulls
- When the generator fails during import (e.g., missing domains for statistical analysis), the study is still created and browsable in the domain viewer
- When I cancel a delete confirmation dialog, nothing happens
- Demo studies cannot be deleted (menu item disabled)
- `npm run build` passes after all changes
- Backend starts without error after all changes

## Datagrok notes

In the production Datagrok plugin:
- File upload would use Datagrok's file browser / drag-and-drop infrastructure rather than a custom drop zone
- Study registration would integrate with Datagrok's data connection and project management system
- Delete would go through Datagrok's project/connection deletion workflow with proper permissions
- The `python-multipart` dependency would not be needed — Datagrok handles file ingestion at the platform level
- No specific Datagrok API patterns from `docs/platform/datagrok-patterns.ts` are directly applicable — this is infrastructure that Datagrok provides natively

## Open questions

1. **File size limits** — Should there be a max upload size? Large SEND studies can be hundreds of MB. The prototype has no limit; production should consider streaming uploads or chunked upload for large studies.
2. **Folder upload** — ~~The `webkitdirectory` attribute allows folder selection in Chrome/Edge but is not standard. Should we also support `.zip` upload as an alternative?~~ **Resolved:** `.zip` upload is now supported. The backend extracts `.xpt` files from zip archives at any nesting depth. The frontend accepts both `.xpt` and `.zip` files.
3. **Concurrent imports** — What happens if two users import at the same time? The prototype uses no locking. Production needs concurrency control.
4. **Study ID derivation** — When no study ID is provided, the spec suggests deriving from the first file's directory component. What if files have no directory component (flat selection)? Current fallback: `study-{timestamp}`.
