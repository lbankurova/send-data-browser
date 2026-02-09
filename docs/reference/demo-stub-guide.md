# Demo/Stub/Prototype Code — Production Migration Guide

> **Extracted from CLAUDE.md on 2026-02-09.** This is a reference snapshot for the Datagrok porting effort. It is NOT maintained per-commit — refresh line numbers on demand when porting begins.

This document catalogs all code that exists purely for demonstration, stubbing, or prototype purposes. When building the production app on Datagrok, each item must be addressed. Items are grouped by migration priority.

## Priority 1 — Infrastructure Dependencies

These are foundational changes that most other items depend on.

### P1.1 — Authentication & Authorization
- **`backend/main.py:36-41`** — CORS middleware uses `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`. No authentication middleware exists anywhere.
- **`backend/routers/annotations.py:33-66`** — All annotation endpoints (GET/PUT) have no auth checks. Any client can read/write any study's annotations.
- **`backend/routers/annotations.py:56`** — Reviewer identity is hardcoded: `annotation["pathologist"] = "User"`. Must be replaced with authenticated user identity.
- **Production change:** Add Datagrok auth middleware. All API endpoints must validate user tokens. Reviewer identity must come from auth context.

### P1.2 — Database for Annotations
- **`backend/routers/annotations.py:10`** — Annotations stored as JSON files on disk: `ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations"`. Storage path: `backend/annotations/{study_id}/{schema_type}.json`.
- **`backend/routers/annotations.py:62-64`** — Writes via `json.dump()` to flat files. No concurrency control, no transactions, no backup.
- **4 schema types stored:** `tox-findings.json`, `pathology-reviews.json`, `validation-issues.json`, `validation-records.json`
- **Frontend hooks are migration-safe:** `useAnnotations()` and `useSaveAnnotation()` use React Query + REST API. Swapping the backend storage from files to database requires **zero frontend changes** — the API contract (GET/PUT with JSON payloads) stays the same.
- **Production change:** Replace file I/O in `annotations.py` with database operations. Schema types map to database tables. Add proper error handling, concurrency, audit trail.

### P1.3 — Multi-Study Support
- **`backend/config.py:15`** — `ALLOWED_STUDIES = {"PointCross"}` restricts the entire app to one study.
- **`backend/services/study_discovery.py:37-38`** — Filter applied at startup: `if ALLOWED_STUDIES: studies = {k: v for k, v in studies.items() if k in ALLOWED_STUDIES}`.
- **`frontend/src/components/panels/ContextPanel.tsx:399`** — Hardcoded check: `if (selectedStudyId !== "PointCross")` shows "This is a demo entry" message for any non-PointCross study.
- **Production change:** Remove ALLOWED_STUDIES filter entirely. Remove PointCross guard in ContextPanel. Studies should come from Datagrok's study management system.

## Priority 2 — Hardcoded Demo Data (Remove)

These are fake data entries that must be removed entirely.

### P2.1 — Demo Studies on Landing Page
- **`frontend/src/components/panels/AppLandingPage.tsx:27-88`** — `DEMO_STUDIES` array contains 4 hardcoded fake studies: DART-2024-0091, CARDIO-TX-1147, ONCO-MTD-3382, NEURO-PK-0256. Each has fabricated metadata (protocol, standard, subjects, dates, validation status).
- **`AppLandingPage.tsx:103`** — `const isDemo = !!study.demo` guard used at lines 105, 112, 120, 129, 143 to disable context menu actions for demo entries.
- **`AppLandingPage.tsx:278`** — All real studies get hardcoded `validation: "Pass"` regardless of actual validation state.
- **Production change:** Delete DEMO_STUDIES array and all `isDemo` logic. Validation status should come from actual validation results via API.

## Priority 3 — Stub Features (Implement or Remove)

These are UI elements that show but don't function.

### P3.1 — Import Section
- **`AppLandingPage.tsx:172-266`** — Entire `ImportSection` component is a non-functional stub:
  - Drop zone doesn't accept drops
  - Browse button shows `alert()` at line 198
  - All metadata inputs (Study ID, Protocol, Description) are `disabled`
  - Checkboxes ("Validate SEND compliance", "Attempt automatic fixes") are `disabled` with hardcoded states
  - Import button (line 257-261) is `disabled` with `cursor-not-allowed` and tooltip "Import not available in prototype"
- **Production change:** Replace with Datagrok's study import workflow, or implement real file upload → XPT parsing → study registration pipeline.

### P3.2 — Export Functionality
- **`AppLandingPage.tsx:127`** — `alert("CSV/Excel export coming soon.")` in context menu Export action.
- **`ContextPanel.tsx:224`** — `alert("CSV/Excel export coming soon.")` in StudyInspector Export link.
- **Production change:** Implement actual CSV/Excel export for study data, analysis results, and reports.

### P3.3 — Disabled Context Menu Actions
- **`AppLandingPage.tsx:122`** — "Share..." is always disabled (no implementation planned in prototype).
- **`AppLandingPage.tsx:145`** — "Delete" is always disabled (no confirmation UX or delete logic).
- Note: "Re-validate SEND..." is functional for real studies (navigates to validation + fires POST /validate).
- **Production change:** Implement sharing and study deletion with proper confirmation dialogs and backend support.

### P3.4 — Documentation Link
- **`AppLandingPage.tsx:363`** — "Learn more" link calls `alert("Documentation is not available in this prototype.")`.
- **Production change:** Link to actual product documentation.

### P3.5 — Feature Flags
- **`frontend/src/lib/analysis-definitions.ts:8-15`** — `ANALYSIS_TYPES` array has `implemented` boolean flags. Only `adverse-effects` is `true`; `noael`, `target-organs`, `validation`, `sex-differences`, `reversibility` are `false`.
- **`analysis-definitions.ts:23-31`** — `ANALYSIS_VIEWS` array also has `implemented` flags (most are `true` now).
- **`frontend/src/components/analysis/PlaceholderAnalysisView.tsx:1-39`** — Catch-all placeholder for unimplemented analysis types, shows "This analysis type is not yet implemented."
- **Production change:** Remove `implemented` flags (all views should be implemented). Remove PlaceholderAnalysisView. Or keep as a gating mechanism if Datagrok has staged rollout.

## Priority 4 — Pre-Generated Static Data (Architecture Decision)

- **P4.1 — Generator Pipeline**: `generator/generate.py` pre-computes 8 JSON files + 1 HTML chart; `analysis_views.py` serves them via `json.load()`. Production: keep pattern (run on import) or compute on-demand. Frontend API unchanged either way.
- **P4.2 — File-Based Caching**: XPT→CSV cache in `backend/cache/`, adverse effects JSON cache with mtime freshness. Production: replace with Datagrok infrastructure or Redis.

## Priority 5 — Hardcoded Configuration (Parameterize)

- **P5.1 — Dose Group Mapping**: `dose_groups.py` — `ARMCD_TO_DOSE_LEVEL` and `RECOVERY_ARMCDS` hardcoded for PointCross. Production: derive from TX/DM domains.
- **P5.2 — Skip Folders**: `config.py` — 2 folder names excluded from study scan. Not needed with Datagrok study management.
- **P5.3 — Data Directory**: `config.py` — defaults to `C:\pg\pcc\send` (env-overridable). Production: use Datagrok file storage.
- **P5.4 — Domain Defaults**: `organ_map.py` hardcodes domain→organ mappings; `unified_findings.py` hardcodes relevant XPT domain list. Production: make configurable.

## Resolved Items

| Item | Resolved In | What Changed |
|------|-------------|--------------|
| P2.2 — Hardcoded Validation Rules & Records | Validation engine build | Removed `HARDCODED_RULES`, `RULE_DETAILS`, `AFFECTED_RECORDS`, `FIX_SCRIPTS` from frontend. Replaced with `useValidationResults`, `useAffectedRecords`, `useRunValidation` hooks calling real backend engine (18 YAML rules, 15 check types, reads actual XPT data). |
