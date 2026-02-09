# Annotations

## Purpose

Expert judgments that travel with the data: treatment-relatedness determinations, adversity assessments, pathology peer reviews, validation issue tracking, and per-record review status. These cannot be automated -- they capture the toxicologist's or pathologist's professional opinion on findings identified by the statistical pipeline. The annotation system provides persistent storage, a REST API, and React Query-powered forms that save immediately and invalidate caches on success.

## Architecture

### Data Flow

```
Form Input (React component)
    |
    v
useSaveAnnotation() mutation
    |  PUT /api/studies/{studyId}/annotations/{schemaType}/{entityKey}
    v
annotations.py router
    |  Merges payload, adds reviewedBy="User" + timestamp
    v
JSON file on disk: backend/annotations/{studyId}/{schema_type}.json
    |  dict keyed by entityKey, values are annotation objects
    v
On mutation success: React Query invalidates ["annotations", studyId, schemaType]
    |
    v
useAnnotations() refetches -> form re-renders with saved values
```

### Storage Model

- **Location**: `backend/annotations/{study_id}/` directory, one JSON file per schema type
- **File format**: JSON object where keys are entity keys (e.g., endpoint label, rule ID, finding term, issue ID) and values are annotation objects
- **No concurrency control**: plain file read/write, last-write-wins
- **Server-injected fields**: `pathologist` (hardcoded `"User"`) and `reviewDate` (UTC ISO timestamp) are added on every PUT (BUG-01 resolved: field names now align with frontend TypeScript types)

### Schema Types

Four annotation schemas, stored as four files per study:

| Schema Type (URL slug) | File Name | Entity Key | Primary View | Purpose |
|------------------------|-----------|------------|--------------|---------|
| `tox-findings` | `tox_findings.json` | Endpoint label string | View 2 (Dose-Response) | Treatment-relatedness and adversity determination |
| `pathology-reviews` | `pathology_reviews.json` | Finding term string (MITERM) | View 4 (Histopathology) | Pathology peer review of microscopic findings |
| `validation-issues` | `validation_issues.json` | Rule ID string | Validation view | Validation rule disposition and tracking |
| `validation-records` | `validation_records.json` | Issue ID string | Validation view (Mode 2) | Per-record review status for affected records |
| `endpoint-bookmarks` | `endpoint_bookmarks.json` | Endpoint label string | View 2 (Dose-Response) | Star-toggle bookmarks for endpoints of interest |
| `causal-assessment` | `causal_assessment.json` | Endpoint label string | View 2 (Dose-Response) Hypotheses tab | Bradford Hill causality worksheet: overrides, expert criteria, overall assessment |

## Contracts

### API Endpoints

| Method | Path | Request | Response | Description |
|--------|------|---------|----------|-------------|
| GET | `/api/studies/{study_id}/annotations/{schema_type}` | -- | `Record<string, Annotation>` (JSON object keyed by entity) | Returns all annotations for a schema type. Returns `{}` if file does not exist. |
| PUT | `/api/studies/{study_id}/annotations/{schema_type}/{entity_key}` | `AnnotationPayload` (arbitrary JSON body, `extra="allow"`) | `Annotation` (the saved object with server-injected fields) | Creates or updates a single annotation. Server adds `pathologist` and `reviewDate`. Creates directory if needed. |

**Validation**:
- `schema_type` must be one of: `validation-issues`, `tox-findings`, `pathology-reviews`, `validation-records`, `endpoint-bookmarks`, `causal-assessment`. Returns 400 otherwise.
- `study_id` must not contain `/`, `\`, or `..`. Returns 400 otherwise.
- No auth checks on any endpoint.

**URL slug to file mapping**: slugs use hyphens (`tox-findings`), files use underscores (`tox_findings.json`). Mapping is computed at module load: `{slug: slug.replace("-", "_") + ".json" for slug in VALID_SCHEMA_TYPES}`.

### Schema Types

#### 1. ToxFinding (`tox-findings`)

Expert determination of treatment-relatedness and adversity for a toxicological finding.

| Field | Type | Allowed Values | Default | Source |
|-------|------|----------------|---------|--------|
| `treatmentRelated` | string | `"Yes"`, `"No"`, `"Equivocal"`, `"Not Evaluated"` | `"Not Evaluated"` | User input |
| `adversity` | string | `"Adverse"`, `"Non-Adverse/Adaptive"`, `"Not Determined"` | `"Not Determined"` | User input |
| `comment` | string | free text | `""` | User input |
| `reviewedBy` | string | -- | `"User"` | Server-injected |
| `reviewedDate` | string (ISO datetime) | -- | current UTC time | Server-injected |

**Entity key**: Endpoint label string (e.g., `"Hepatocellular hypertrophy"`). Applies across all dose groups and sexes for that finding.

**Form component**: `ToxFindingForm` (`panes/ToxFindingForm.tsx`)
- Props: `studyId`, `endpointLabel`, `defaultOpen?`
- Behavior: `adversity` field is visually dimmed (`opacity-40`) when `treatmentRelated === "No"` but remains editable
- Pane title: "Tox assessment"
- Dirty tracking: compares local state against loaded annotation, SAVE button disabled when clean
- Success flash: button shows "SAVED" (green) for 2 seconds after mutation completes
- Footer: shows "Reviewed by {name} on {date}" when prior annotation exists

**Used in views**: Dose-Response context panel (expanded by default), other views (collapsed)

#### 2. PathologyReview (`pathology-reviews`)

Pathology peer review of microscopic findings.

| Field | Type | Allowed Values | Default | Source |
|-------|------|----------------|---------|--------|
| `peerReviewStatus` | string | `"Not Reviewed"`, `"Agreed"`, `"Disagreed"`, `"Deferred"` | `"Not Reviewed"` | User input |
| `revisedSeverity` | string | `"Minimal"`, `"Mild"`, `"Moderate"`, `"Marked"`, `"Severe"`, `"N/A"` | `"N/A"` | User input |
| `revisedDiagnosis` | string | free text | `""` | User input |
| `comment` | string | free text | `""` | User input |
| `pathologist` | string | -- | `"User"` | Server-injected |
| `reviewDate` | string (ISO datetime) | -- | current UTC time | Server-injected |

**Note on field naming**: The backend always injects `reviewedBy` and `reviewedDate`. The TypeScript `PathologyReview` interface uses `pathologist` and `reviewDate` instead. The form reads `existing.pathologist` and `existing.reviewDate`, which means the backend JSON field `reviewedBy` must be mapped to `pathologist` somewhere in the flow. In practice, the backend stores `reviewedBy`/`reviewedDate` in the JSON file, but the TypeScript type expects `pathologist`/`reviewDate`. This is a naming mismatch -- the form works because the save payload sends fields under the names the form uses, and the server re-injects `reviewedBy`/`reviewedDate` on top.

**Entity key**: Finding term string (e.g., `"Hepatocellular hypertrophy"`).

**Form component**: `PathologyReviewForm` (`panes/PathologyReviewForm.tsx`)
- Props: `studyId`, `finding`, `defaultOpen?`
- Behavior: `revisedSeverity` and `revisedDiagnosis` are disabled unless `peerReviewStatus === "Disagreed"`. On save, non-disagreed submissions clear revised fields to defaults (`"N/A"` and `""`).
- Pane title: "Pathology review"

**Used in views**: Histopathology context panel (expanded by default, first pane), other views (collapsed)

#### 3. ValidationIssue (`validation-issues`)

Tracking of validation rule review and resolution status.

| Field | Type | Allowed Values | Default | Source |
|-------|------|----------------|---------|--------|
| `status` | string | `"Not Reviewed"`, `"In Progress"`, `"Resolved"`, `"Exception"`, `"Won't Fix"` | `"Not Reviewed"` | User input |
| `assignedTo` | string | free text | `""` | User input |
| `resolution` | string | `""`, `"Fixed in Source"`, `"Auto-Fixed"`, `"Documented Exception"`, `"Not Applicable"` | `""` | User input |
| `disposition` | string | `""`, `"Accept All"`, `"Needs Fix"`, `"Partial Fix"`, `"Not Applicable"` | `""` | User input |
| `comment` | string | free text | `""` | User input |
| `reviewedBy` | string | -- | `"User"` | Server-injected |
| `reviewedDate` | string (ISO datetime) | -- | current UTC time | Server-injected |

**Entity key**: Rule ID string (e.g., `"DL001"`, `"CT003"`).

**Form component**: `ValidationIssueForm` (`panes/ValidationIssueForm.tsx`)
- Props: `studyId`, `ruleId`
- Behavior: `resolution` dropdown is disabled unless `status === "Resolved"` or `status === "Exception"`. On save, `resolution` is cleared to `""` when status does not enable it.
- Pane title: "Rule disposition" (always expanded by default)

**Note**: The `disposition` field is present in the code but not in the original spec (spec 13.3). This is a code-level addition for per-rule triage workflow.

**Used in**: Validation context panel (Mode 1 -- rule detail)

#### 4. ValidationRecordReview (`validation-records`)

Per-record review status for individual affected records within a validation rule.

| Field | Type | Allowed Values | Default | Source |
|-------|------|----------------|---------|--------|
| `fixStatus` | string | `"Not fixed"`, `"Auto-fixed"`, `"Manually fixed"`, `"Accepted as-is"`, `"Flagged"` | `"Not fixed"` | User input (dropdown) |
| `reviewStatus` | string | `"Not reviewed"`, `"Reviewed"`, `"Approved"` | `"Not reviewed"` | User input (dropdown) |
| `assignedTo` | string | free text | `""` | User input |
| `justification` | string | free text | `""` | User input (textarea, placeholder: "Reason for accepting / flagging...") |
| `comment` | string | free text | `""` | User input |
| `pathologist` | string | -- | `"User"` | Server-injected |
| `reviewDate` | string (ISO datetime) | -- | current UTC time | Server-injected |

**Entity key**: Issue ID string (compound key identifying a specific affected record).

**Form component**: `ValidationRecordForm` (`panes/ValidationRecordForm.tsx`)
- Props: `studyId`, `issueId`, `defaultOpen?` (default `true`)
- Behavior: Five-field form (fix status, review status, justification, assigned to, comment). All fields are persisted via the annotation API. The form tracks dirty state across all five fields and shows "Reviewed by ... on ..." when existing annotations have a `pathologist` (with backward compatibility for legacy `reviewedBy` field).
- Pane title: "Review"

**Used in**: Validation context panel (Mode 2 -- issue detail)

### Frontend Hooks

#### `useAnnotations<T>(studyId, schemaType)`

**File**: `hooks/useAnnotations.ts`

- **Returns**: `UseQueryResult<Record<string, T>>` -- object keyed by entity key, values are annotation objects of type `T`
- **Query key**: `["annotations", studyId, schemaType]`
- **Stale time**: 5 minutes
- **Enabled**: only when `studyId` is truthy
- **Fetches**: `GET /api/studies/{studyId}/annotations/{schemaType}`

#### `useSaveAnnotation<T>(studyId, schemaType)`

**File**: `hooks/useAnnotations.ts`

- **Returns**: `UseMutationResult` with `mutate({ entityKey, data })`
- **Mutation**: `PUT /api/studies/{studyId}/annotations/{schemaType}/{entityKey}` with `data` as JSON body
- **On success**: Invalidates query key `["annotations", studyId, schemaType]` -- triggers automatic refetch of all annotations for that schema type
- **Enabled**: caller must ensure `studyId` is defined before calling `mutate`

### Frontend API Layer

**File**: `lib/annotations-api.ts`

Two plain `fetch()` wrapper functions:

- `fetchAnnotations<T>(studyId, schemaType)`: GET request, returns `Record<string, T>`
- `saveAnnotation<T>(studyId, schemaType, entityKey, data)`: PUT request with JSON body, returns `T`

Both use `/api` base path (proxied by Vite dev server to backend). Both throw on non-OK responses.

## Current State

**Real (functional)**:
- All four annotation forms render, accept input, persist via API, and refetch on save
- React Query cache invalidation ensures forms always show latest saved state
- Dirty tracking prevents unnecessary saves
- Success flash (2s green "SAVED" button) provides user feedback
- Conditional field enabling (resolution only when resolved/exception, revised fields only when disagreed)
- Footer shows reviewer name and date for existing annotations

**Stub/Demo**:
- **File-based storage**: Annotations stored as JSON files in `backend/annotations/{study_id}/`. No database, no transactions, no backup.
- **No authentication**: All endpoints are unprotected. Any client can read/write any study's annotations.
- **Hardcoded reviewer**: `reviewedBy` is always `"User"` (line 56 in `annotations.py`). There is no way to identify the actual user.
- **No concurrency control**: Simultaneous writes to the same file produce last-write-wins behavior. No optimistic locking, no ETags.
- **No audit trail**: Only the most recent `pathologist`/`reviewDate` is stored per annotation. Previous values are overwritten.

**Production needs**:
- Database storage with proper transactions and concurrency (replace file I/O in `annotations.py`)
- Authenticated user identity from Datagrok auth context (replace hardcoded `"User"`)
- Audit trail with full history (not just latest reviewer)
- Conflict resolution for concurrent edits (optimistic locking or merge strategy)

## Code Map

| File | Description |
|------|-------------|
| `backend/routers/annotations.py` | API router: GET/PUT endpoints, file I/O, input validation |
| `backend/annotations/` | Directory where per-study annotation JSON files are stored |
| `frontend/src/lib/annotations-api.ts` | Fetch wrappers: `fetchAnnotations()`, `saveAnnotation()` |
| `frontend/src/hooks/useAnnotations.ts` | React Query hooks: `useAnnotations()`, `useSaveAnnotation()` |
| `frontend/src/types/annotations.ts` | TypeScript interfaces: `ValidationIssue`, `ValidationRecordReview`, `ToxFinding`, `PathologyReview` |
| `frontend/src/components/analysis/panes/ToxFindingForm.tsx` | ToxFinding annotation form (treatment-related, adversity, comment) |
| `frontend/src/components/analysis/panes/PathologyReviewForm.tsx` | PathologyReview annotation form (peer review status, revised severity/diagnosis) |
| `frontend/src/components/analysis/panes/ValidationIssueForm.tsx` | ValidationIssue annotation form (status, assigned to, resolution, disposition) |
| `frontend/src/components/analysis/panes/ValidationRecordForm.tsx` | ValidationRecordReview annotation form (fix status, review status, justification, assigned to, comment) |
| `frontend/src/components/analysis/panes/CollapsiblePane.tsx` | Shared collapsible pane wrapper used by all annotation forms |

## Datagrok Notes

| Prototype Pattern | Datagrok Equivalent |
|-------------------|---------------------|
| JSON file storage (`backend/annotations/`) | Datagrok entity storage, database tables, or `DG.StickyMeta` for annotations that should travel with data. StickyMeta binds annotations to entity values (string matches) rather than row indices, making them portable across DataFrames. |
| Hardcoded `"User"` identity | `grok.shell.user.name` or `grok.shell.user.login` from Datagrok auth context. All annotation saves should capture the authenticated user automatically. |
| `pathologist` / `reviewDate` server injection | Datagrok StickyMeta provides audit fields natively. If using custom storage, inject from `grok.shell.user` on the client side or from auth middleware on the server side. |
| React Query cache (`["annotations", studyId, schemaType]`) | Datagrok reactive bindings. Subscribe to StickyMeta change events or DataFrame column change events. When an annotation changes, affected columns and downstream computations update automatically. |
| `PUT` per entity key | StickyMeta API: `DG.Meta.set(entity, schemaName, fieldName, value)`. Or batch save via custom API if using database storage. |
| Conditional field enabling (resolution when resolved) | Same UX pattern in Datagrok forms. Use `ui.input.choice()` with `onChanged` handlers to enable/disable related inputs. |
| API contract (`GET`/`PUT` with JSON payloads) | The API contract survives migration. Only the storage backend changes (file I/O to database or StickyMeta). Frontend hooks (`useAnnotations`, `useSaveAnnotation`) require zero changes if the REST API shape is preserved. |
| Per-finding annotation keying (endpoint label string) | StickyMeta's `semType` matching. Annotate by semantic type (e.g., `SendFindingTerm` for ToxFinding, `HistopathFinding` for PathologyReview, `ValidationRuleId` for ValidationIssue). Annotations then appear wherever that value shows up across views. |

## Changelog

- 2026-02-08: Created from spec p4 section 13, CLAUDE.md P1.2, backend/routers/annotations.py, frontend hooks and form components
