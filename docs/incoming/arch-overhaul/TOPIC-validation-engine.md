# Topic Hub: Validation Engine

**Last updated:** 2026-02-27
**Overall status:** Fully shipped. Dual-engine architecture: CDISC CORE (400+ conformance rules via Python 3.12 subprocess) + 14 custom rules (7 SD study design + 7 FDA data quality). Triage-and-dispatch frontend with rail, records table, 2-mode context panel (rule review + issue review), 6 evidence renderers, 3 annotation schemas, 4 fix scripts. 2 backend test suites (40 assertions). 8 legacy check modules on disk (superseded by CORE).

---

## What Shipped

### Two-Engine Validation Architecture

| Engine | Rules | Source | Purpose |
|--------|-------|--------|---------|
| CDISC CORE | 400+ | `.pkl` cache (208 files) | Regulatory conformance: required variables, controlled terminology, referential integrity, metadata completeness |
| Custom (SD-*) | 7 | `study_design.yaml` | Study design enrichment: orphaned subjects, ambiguous controls, dose inconsistencies, missing TS parameters |
| Custom (FDA-*) | 7 | `fda_data_quality.yaml` | FDA reviewer concerns: categorical-as-numeric, timing alignment, BQL imputation, early-death contamination |

**Precedence:** CORE rules added first → custom rules checked for (domain, category) overlap → overlapping custom rules removed (CORE is authoritative) → non-overlapping custom rules retained (enrichment).

**Runtime:** `ValidationEngine.validate(study)` loads all XPT domains, runs both engines, merges results. CORE runs as subprocess (`core.py validate -s send -v {version}`, 120s timeout). Graceful degradation: if CORE unavailable, custom rules run alone.

### CDISC CORE Integration (`core_runner.py`, 328 lines)

- **Isolation:** Separate Python 3.12 venv (`.venv-core/`) from main Python 3.13 backend
- **Version detection:** `get_sendig_version_from_ts()` reads TS.SNDIGVER to derive `-v` argument
- **Result normalization:** CORE JSON → `ValidationRuleResult` schema with `source="core"`, rule IDs as `CORE-{core_id}-{domain}`
- **Conformance metadata:** `ConformanceDetails` object (engine_version, standard, ct_version) surfaced to frontend

### Study Design Rules (`study_design.py`, 417 lines)

7 rules interpreting trial design domains (DM, TA, TE, TX, EX):

| Rule | Name | Severity | What it checks |
|------|------|----------|----------------|
| SD-001 | Orphaned subjects | Warning | DM.ARMCD values missing from TA |
| SD-002 | Ambiguous control assignments | Info | Control groups with missing vehicle info |
| SD-003 | Unmatched dose level | Warning | EX doses not matching any TX dose level |
| SD-004 | Missing trial summary parameters | Info | TS missing SPECIES, STRAIN, ROUTE, SSTDTC, SSTYP |
| SD-005 | Dose inconsistency | Warning | EX dose values ≠ assigned TX arm dose |
| SD-006 | Subject without exposure | Warning | DM subjects with ARM but no EX records |
| SD-007 | Incomplete trial design elements | Info | Incomplete TA/TE or missing TX parameters |

### FDA Data Quality Rules (`fda_data_quality.py`, 888 lines)

7 rules targeting common FDA reviewer data quality concerns:

| Rule | Name | Severity | What it checks |
|------|------|----------|----------------|
| FDA-001 | Categorical data in numeric result | Warning | LBSTRESN with ≤6 distinct integer values (ordinal misclassification) |
| FDA-002 | Timing variable alignment | Warning | NOMDY vs VISITDY alignment across LB, CL, EG, BW |
| FDA-003 | Below-LLOQ without imputation | Warning | PC BQL rows missing SUPPPC CALCN documentation |
| FDA-004 | Undefined CT codes | Info | DSDECOD, EGTESTCD vs CDISC SEND controlled terminology |
| FDA-005 | Early-death data in terminal stats | Error | Moribund/found-dead subjects dying >7 days before terminal sacrifice |
| FDA-006 | Cross-domain EPOCH linking | Info | SE.ETCD mapping to TA, all DM subjects having SE records |
| FDA-007 | QTc correction documentation | Info | EG EGMETHOD empty or single correction for non-rodent species |

### Fix Tier System (3 tiers)

| Tier | Name | UX | Example |
|------|------|----|---------|
| 1 | Accept as-is | ACCEPT button → justification prompt | Unusual species, missing non-critical variable |
| 2 | Simple correction | Fix dropdown with "Apply suggestion" | Wrong case, CT mapping, date format |
| 3 | Script fix | Fix dropdown with "Run script..." → modal dialog | Batch whitespace stripping, date conversion |

**Fix scripts** (`registry.py`, 280L): `strip-whitespace`, `uppercase-ct`, `fix-domain-value`, `fix-date-format`. All annotation-only — no XPT data is modified. Preview computation runs against live data.

**Two independent status tracks:** Fix status (Not fixed / Auto-fixed / Manually fixed / Accepted as-is / Flagged) and Review status (Not reviewed / Reviewed / Approved). Independent — auto-fixed items still need review.

### Frontend — Triage & Dispatch UX

**ValidationRuleRail** (367L) — left panel rail with search, 4 sort modes (evidence/domain/category/severity/source), 4 filters (show/severity/source), RUN button, CSV export dropdown, `ValidationRuleCard` rendering.

**ValidationView** (602L) — center panel: CatalogStatsBar (rule counts + last run time), RuleHeader (conditional), FilterBar (fix/review/subject), Records table (TanStack React Table, 8 columns, client-side sorting, column resizing).

**ValidationContextPanel** (1,789L) — two-mode context panel:
- **Mode 1 (Rule Review):** 5 panes — rule detail, rule metadata, rule configuration (enable/disable toggle), review progress (tri-color bar + clickable status counts), rule disposition form
- **Mode 2 (Issue Review):** 3 panes — record context (key-value), FindingSection (evidence rendering + adaptive fix actions), InlineReviewSection (review form)

**6 evidence renderers:** `value-correction` (char-level diff), `value-correction-multi` (radio candidates), `code-mapping`, `range-check`, `missing-value`, `metadata`/`cross-domain` (key-value + domain linkification).

**Bidirectional communication:** Center→Context (rule/issue selection), Context→Center (filter push via `recordFixStatusFilter`/`recordReviewStatusFilter` through `ViewSelectionContext`).

### Annotation Integration (3 schemas)

| Schema | Store | Entity Key | Form Component |
|--------|-------|------------|----------------|
| `validation-issues` | `validation_issues.json` | Rule ID | `ValidationIssueForm` (166L) |
| `validation-records` | `validation_records.json` | Issue ID | `ValidationRecordForm` (142L) |
| `validation-rule-config` | `validation_rule_config.json` | Rule ID | Toggle switch in context panel |

### Custom Rule Builder (`CustomValidationRuleBuilder.tsx`, 375L)

TRUST-05p3: Form-based UI for authoring custom validation rules. Rules persisted via annotations and displayed alongside SD/FDA rules. **Backend execution not yet wired** — custom rules are annotation-only metadata.

### Key Commits

| Commit | Description |
|--------|-------------|
| `b4cb260` | Real SEND validation engine replacing hardcoded rules |
| `5f9e24f` | Auto-fix pipeline + GAP-14 |
| `06ea4e8` | CDISC CORE integration |
| `f6fae40` | Subject context enrichment + study design validation (SD-001 through SD-007) |
| `1b391a7` | 7 FDA data quality rules (FDA-001 through FDA-007) |
| `580f4b9` | Unified validation view Phase 1: rail layout, full catalog API, FDA-003 dedup |
| `d06ae34` | TRUST Phase 1: validation rule inspector |
| `be2d8cf` | TRUST Phase 3: audit trail, custom rule builders |
| `1023ae0` | Deduplicate validation fetch, CSV export dropdown |
| `033efc8` | 35 assertions for SD validation rules |

---

## What's NOT Shipped

### Deferred by Design

| Item | Rationale |
|------|-----------|
| XPT write-back | Fix scripts are annotation-only; actual data modification deferred to production (MF-05) |
| CORE auto-installation | Requires manual setup (Python 3.12, clone repo, install deps, cache rules) |
| Custom rule execution | `CustomValidationRuleBuilder` saves metadata but backend doesn't evaluate custom rules |
| Bulk record actions | No "mark all as reviewed" or "accept all" in records table |
| Record pagination controls | Page size hardcoded to 500 in hook, no UI controls |
| Cross-view navigation from issues | Clicking a MI validation issue does not navigate to histopathology view |
| Keyboard navigation | No Escape handler, no keyboard record navigation |

### Known Gaps (from spec-cleanup tracker)

| ID | Gap | Severity |
|----|-----|----------|
| V-2 | Rule ID in Mode 2 (issue pane): spec says clickable link to Mode 1 — only has hover popover, no click handler | Medium |
| V-3 | Review/fix status count buttons: no toggle-off — clicking same status again doesn't clear filter | Low |
| V-4 | Issue ID link in table: blue + underline suggests different action but does same as row click | Low |
| V-5 | Fix Script Dialog backdrop: clicking backdrop doesn't close modal (non-standard) | Low |
| V-6 | Domain links in evidence: `<button>` not `<a>` — no "Open in new tab" | Low |

### Known Bugs

| Location | Issue |
|----------|-------|
| `registry.py` `get_script()` | Logic error — returns first script if matches, `None` for all others (early return in loop). Not called by router, so no runtime impact. |
| Rule/record status rollup | All records can be individually marked "Reviewed"+"Fixed" while rule-level disposition stays "Not reviewed", and vice versa. No propagation between levels. |

---

## Roadmap

**Near-term:** Resolve V-2 (clickable rule link in Mode 2), fix `get_script()` logic error.

**Medium-term:** CORE auto-installation script, custom rule backend execution, bulk record actions, cross-view navigation from validation issues.

**Production:** XPT write-back capability for fix scripts, multi-study testing (10-20 SEND submissions), CORE version update process.

---

## File Map

### System Specs

| File | Lines | Status |
|------|-------|--------|
| `docs/systems/validation-engine.md` | 568 | Current — authoritative system spec, two-engine architecture, all contracts |
| `docs/views/validation.md` | 501 | Current — view spec, rail + records table + context panel layout |

### Deep Research

| File | Lines | Relevance |
|------|-------|-----------|
| `docs/deep-research/how-FDA-reviews-SEND-submissions.md` | 119 | FDA SEND review process — informs FDA-* rule design |

### Implementation

#### Backend — validation engine (6 files, 2,462 lines)

| File | Lines | Role |
|------|-------|------|
| `validation/engine.py` | 429 | `ValidationEngine` class, `CHECK_DISPATCH`, two-engine orchestration, cache management |
| `validation/models.py` | 120 | 11 Pydantic models: `RuleDefinition`, `ValidationRuleResult`, `AffectedRecordResult`, `ConformanceDetails`, etc. |
| `validation/core_runner.py` | 328 | CDISC CORE subprocess wrapper: `is_core_available()`, `run_core_validation()`, `normalize_core_report()` |
| `validation/checks/study_design.py` | 417 | SD-001 through SD-007: `check_study_design()`, `build_subject_context()` |
| `validation/checks/fda_data_quality.py` | 888 | FDA-001 through FDA-007: `check_fda_data_quality()` with internal dispatch |
| `validation/scripts/registry.py` | 280 | 4 fix scripts: strip-whitespace, uppercase-ct, fix-domain-value, fix-date-format + preview handlers |

#### Backend — rule definitions (2 files, 221 lines)

| File | Lines | Role |
|------|-------|------|
| `validation/rules/study_design.yaml` | 116 | 7 SD-* rule definitions |
| `validation/rules/fda_data_quality.yaml` | 105 | 7 FDA-* rule definitions |

#### Backend — router (1 file, 326 lines)

| File | Lines | Role |
|------|-------|------|
| `routers/validation.py` | 326 | 4 API endpoints: POST validate, GET results, GET records (paginated), POST script preview + `init_validation()` |

#### Backend — legacy metadata (2 files, 687 lines, not loaded)

| File | Lines | Status |
|------|-------|--------|
| `validation/metadata/sendig_31_variables.yaml` | 327 | LEGACY — 17 domains, superseded by CORE's pre-cached rules |
| `validation/metadata/controlled_terms.yaml` | 360 | LEGACY — 14 codelists, superseded by CORE's CT |

#### Backend — legacy check modules (8 files, 1,481 lines, not loaded)

| File | Lines | Status |
|------|-------|--------|
| `validation/checks/completeness.py` | 220 | Superseded by CORE |
| `validation/checks/controlled_terminology.py` | 258 | Superseded by CORE |
| `validation/checks/data_integrity.py` | 243 | Superseded by CORE |
| `validation/checks/data_type_check.py` | 78 | Superseded by CORE |
| `validation/checks/referential_integrity.py` | 275 | Superseded by CORE |
| `validation/checks/required_variables.py` | 67 | Superseded by CORE |
| `validation/checks/timing.py` | 218 | Superseded by CORE |
| `validation/checks/variable_format.py` | 122 | Superseded by CORE |

#### Backend — CDISC CORE engine (external, not counted)

| Path | Contents |
|------|----------|
| `_core_engine/core.py` | CORE CLI entry point (Python 3.12) |
| `_core_engine/resources/cache/` | 208 `.pkl` files (SENDIG 3.0, 3.1 pre-cached rules) |
| `.venv-core/` | Separate Python 3.12 venv for CORE dependencies |

#### Frontend — components (8 files, 3,576 lines)

| File | Lines | Role |
|------|-------|------|
| `ValidationView.tsx` | 602 | Master-detail: CatalogStatsBar, RuleHeader, FilterBar, Records table (TanStack) |
| `panes/ValidationContextPanel.tsx` | 1,789 | Two-mode panel: rule review (5 panes) + issue review (3 panes), 6 evidence renderers |
| `ValidationViewWrapper.tsx` | 27 | Code-split wrapper via `React.lazy()` |
| `CustomValidationRuleBuilder.tsx` | 375 | TRUST-05p3: custom rule authoring form (annotation-only) |
| `validation/ValidationRuleRail.tsx` | 367 | Left panel rail: search, sort, filter, RUN button, CSV export |
| `validation/ValidationRuleCard.tsx` | 108 | Individual rule card rendering |
| `panes/ValidationRecordForm.tsx` | 142 | Per-record annotation form (5 fields) |
| `panes/ValidationIssueForm.tsx` | 166 | Per-rule disposition form (status, resolution, disposition, comment) |

#### Frontend — hooks (4 files, 154 lines)

| File | Lines | Role |
|------|-------|------|
| `hooks/useValidationResults.ts` | 59 | React Query: `["validation-results", studyId]` → GET results (null on 404) |
| `hooks/useValidationCatalog.ts` | 23 | React Query: `["validation-catalog", studyId]` → GET results with `?include_catalog=true` |
| `hooks/useRunValidation.ts` | 28 | React Query mutation: POST validate → invalidates both results + records caches |
| `hooks/useAffectedRecords.ts` | 44 | React Query: `["affected-records", studyId, ruleId]` → GET records (page_size=500) |

#### Frontend — library (1 file, 354 lines)

| File | Lines | Role |
|------|-------|------|
| `lib/validation-rule-catalog.ts` | 354 | Static catalog of 14 custom rules (SD + FDA): `VALIDATION_RULE_CATALOG`, `getValidationRuleDef()` |

#### Backend — tests (2 files, 822 lines)

| File | Lines | Assertions | Coverage |
|------|-------|------------|----------|
| `tests/test_sd_validation.py` | 541 | 20 | SD-001 through SD-007: structural invariants, output format, cross-check vs raw data |
| `tests/test_fda_validation.py` | 281 | 20 | FDA-001 through FDA-007: ground truth against PointCross XPT, dedup invariants |

### Cross-TOPIC Boundaries

| File | Lines | Owner | Relationship |
|------|-------|-------|-------------|
| `routers/annotations.py` | — | Annotations system | Serves `validation-issues`, `validation-records`, `validation-rule-config` schemas |
| `hooks/useAnnotations.ts` | — | Annotations system | Generic annotation CRUD used by all 3 validation annotation schemas |
| `types/annotations.ts` | 151 | Annotations system | `ValidationIssue`, `ValidationRecordReview`, `ValidationRuleOverride`, `CustomValidationRule` types |
| `ViewSelectionContext.tsx` | 104 | Shared | `_view: "validation"` selection tag, bidirectional filter communication |
| `ContextPanel.tsx` | 449 | Shared | Route detection → `ValidationContextPanelWrapper` |

### Totals

| Scope | Files | Lines |
|-------|-------|-------|
| Backend active (engine + rules + router) | 9 | 3,009 |
| Backend legacy (on disk, not loaded) | 10 | 2,168 |
| Backend tests | 2 | 822 |
| Frontend (components + hooks + library) | 13 | 4,084 |
| **Active total** | **24** | **7,915** |
| **Including legacy** | **34** | **10,083** |
