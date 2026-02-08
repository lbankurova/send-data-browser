# Validation Engine

## Purpose

The validation engine checks SEND (Standard for Exchange of Nonclinical Data) study datasets for conformance issues -- missing required variables, controlled terminology violations, data type errors, timing inconsistencies, cross-domain referential integrity failures, and completeness gaps. It uses YAML-defined rules evaluated by Python check functions against in-memory pandas DataFrames loaded from XPT files, producing structured results consumed by a React frontend with a triage-and-dispatch UX.

## Architecture

### Data Flow

```
XPT files on disk
    |
    v
xpt_processor.read_xpt() --> pandas DataFrames (one per domain)
    |
    v
ValidationEngine.validate(study)
    |-- _load_rules()      --> reads rules/*.yaml into RuleDefinition models
    |-- _load_metadata()   --> reads metadata/sendig_31_variables.yaml
    |-- _load_ct()         --> reads metadata/controlled_terms.yaml
    |-- load_study_domains(study) --> dict[str, DataFrame]
    |
    |   For each rule:
    |     CHECK_DISPATCH[rule.check_type](**kwargs) --> list[AffectedRecordResult]
    |     Group by domain-qualified rule_id
    |     Assign sequential issue_ids
    |     Build ValidationRuleResult
    |
    v
ValidationResults (rules + records + scripts + summary)
    |
    v
save_results() --> generated/{study_id}/validation_results.json (cached)
    |
    v
FastAPI router serves cached results
    |
    v
Frontend React Query hooks --> TanStack tables + context panel
```

### Package Structure

```
backend/validation/
+-- __init__.py
+-- engine.py              # ValidationEngine class, CHECK_DISPATCH, orchestration
+-- models.py              # Pydantic models (rule definitions, results, API responses)
+-- checks/
|   +-- __init__.py
|   +-- required_variables.py      # check_required_variables
|   +-- variable_format.py         # check_variable_format
|   +-- data_type_check.py         # check_data_types
|   +-- controlled_terminology.py  # check_controlled_terminology
|   +-- timing.py                  # check_date_format, check_study_day
|   +-- referential_integrity.py   # check_usubjid_integrity, check_studyid_consistency,
|   |                              # check_baseline_consistency, check_supp_integrity
|   +-- completeness.py            # check_required_domains, check_ts_required_params,
|   |                              # check_subject_count
|   +-- data_integrity.py          # check_duplicates, check_value_ranges, check_exposure
+-- rules/
|   +-- domain_level.yaml          # SEND-VAL-001 through SEND-VAL-006
|   +-- cross_domain.yaml          # SEND-VAL-007 through SEND-VAL-010, plus Phase 2 (014, 015, 017)
|   +-- completeness.yaml          # SEND-VAL-011 through SEND-VAL-013
+-- metadata/
|   +-- sendig_31_variables.yaml   # Required/Expected/Permissible variables per domain
|   +-- controlled_terms.yaml      # 14 CT codelists
+-- scripts/
    +-- registry.py                # 4 fix script definitions + preview computation
```

### Key Initialization

The validation router (`routers/validation.py`) exposes `init_validation(studies)`, called during FastAPI lifespan startup. This creates a singleton `ValidationEngine`, then auto-runs validation for every study so results are cached on startup. Subsequent GET requests serve cached JSON; POST `/validate` triggers a fresh run.

---

## Contracts

### API Endpoints

| Method | Path | Request Body | Response Model |
|--------|------|-------------|----------------|
| `POST` | `/api/studies/{study_id}/validate` | None | `ValidationSummaryResponse` |
| `GET` | `/api/studies/{study_id}/validation/results` | None | `ValidationResultsResponse` |
| `GET` | `/api/studies/{study_id}/validation/results/{rule_id}/records?page=1&page_size=50` | None | `AffectedRecordsResponse` |
| `POST` | `/api/studies/{study_id}/validation/scripts/{script_key}/preview` | `{ "scope": "all", "rule_id": "..." }` | `FixScriptPreviewResponse` |

**POST /validate**: Loads all XPT domains, runs all rules, caches results, returns summary counts.

**GET /results**: Serves cached `validation_results.json`. Returns 404 if validation has not been run.

**GET /results/{rule_id}/records**: Reads the cached JSON, slices paginated records for the given rule_id. Parameters: `page` (default 1, >= 1), `page_size` (default 50, 1-500).

**POST /scripts/{script_key}/preview**: Loads all XPT domains live, computes before/after preview for the specified fix script. Does NOT modify data.

### Rule Definition Schema (YAML)

This is the exact schema used in the `rules/*.yaml` files, parsed into `RuleDefinition` Pydantic models:

```yaml
rules:
  - id: "SEND-VAL-001"               # Unique rule identifier
    core_ref: null                     # Optional CDISC CORE rule ID for cross-reference
    name: "Required variables present" # Human-readable name
    description: "..."                 # Full description of what the rule checks
    severity: "Error"                  # "Error" | "Warning" | "Info"
    category: "Required variables"     # Rule category (see categories below)
    applicable_domains: ["ALL"]        # ["ALL"] or list of domain codes, or ["STUDY"]
    check_type: "required_variables"   # Maps to CHECK_DISPATCH key in engine.py
    parameters: {}                     # Check-type-specific parameters (dict)
    fix_guidance: "..."                # Human-readable remediation instructions
    auto_fixable: false                # Whether the engine can auto-fix this issue
    default_fix_tier: 3                # 1 | 2 | 3 (see Fix Tier System)
    evidence_type: "missing-value"     # Maps to RecordEvidence type discriminator
    cdisc_reference: "SENDIG 3.1, ..."  # Standard reference string
```

**Rule categories**: Required variables, Variable format, Data integrity, Controlled terminology, Timing, Referential integrity, Completeness.

### ValidationRuleResult Schema

From `validation/models.py` -- one per fired rule (domain-qualified):

```python
class ValidationRuleResult(BaseModel):
    rule_id: str                           # e.g. "SEND-VAL-001-DM"
    severity: Literal["Error", "Warning", "Info"]
    domain: str
    category: str
    description: str                       # Human-readable, generated by engine._build_description()
    records_affected: int
    # Embedded detail (no separate endpoint needed)
    standard: str                          # e.g. "SENDIG v3.1"
    section: str                           # CDISC reference or fallback
    rationale: str                         # Rule's description field from YAML
    how_to_fix: str                        # Rule's fix_guidance field from YAML
    cdisc_reference: str | None = None
```

### AffectedRecordResult Schema

From `validation/models.py` -- one per individual finding:

```python
class AffectedRecordResult(BaseModel):
    issue_id: str              # "{rule_id}-{NNN}" e.g. "SEND-VAL-001-DM-001"
    rule_id: str               # Domain-qualified rule ID e.g. "SEND-VAL-001-DM"
    subject_id: str            # USUBJID or "--" for domain/study-level issues
    visit: str                 # Visit name/day or "--"
    domain: str                # Domain code
    variable: str              # Variable name or "(domain)" for domain-level
    actual_value: str          # What was found
    expected_value: str        # What was expected
    fix_tier: Literal[1, 2, 3]
    auto_fixed: bool
    suggestions: list[str] | None = None     # Suggested fix values
    script_key: str | None = None            # Fix script key if applicable
    evidence: dict[str, Any]                 # RecordEvidence discriminated union (see below)
    diagnosis: str                           # Human-readable explanation of the problem
```

**Issue ID format**: `{rule_id}-{NNN}` where NNN is a 3-digit zero-padded sequential number. Records are sorted deterministically by `(subject_id, variable, actual_value)` before numbering. Example: `SEND-VAL-004-DM-001`, `SEND-VAL-004-DM-002`. This format is used as the entity key for the annotation system.

### Additional Pydantic Models

```python
class RuleDefinition(BaseModel):
    """Loaded from YAML rule files."""
    id: str
    core_ref: str | None = None
    name: str
    description: str
    severity: Literal["Error", "Warning", "Info"]
    category: str
    applicable_domains: list[str]
    check_type: str
    parameters: dict[str, Any] = {}
    fix_guidance: str = ""
    auto_fixable: bool = False
    default_fix_tier: Literal[1, 2, 3] = 1
    evidence_type: str = "metadata"
    cdisc_reference: str = ""

class FixScriptDefinition(BaseModel):
    key: str
    name: str
    description: str
    applicable_rules: list[str]

class FixScriptPreviewRow(BaseModel):
    subject: str
    field: str
    from_val: str
    to_val: str

class ValidationResults(BaseModel):
    """Full validation run output -- cached as JSON."""
    rules: list[ValidationRuleResult]
    records: dict[str, list[AffectedRecordResult]]  # rule_id -> records
    scripts: list[FixScriptDefinition]
    summary: dict[str, Any]

class ValidationResultsResponse(BaseModel):
    rules: list[ValidationRuleResult]
    scripts: list[FixScriptDefinition]
    summary: dict[str, Any]

class AffectedRecordsResponse(BaseModel):
    records: list[AffectedRecordResult]
    total: int
    page: int
    page_size: int

class FixScriptPreviewResponse(BaseModel):
    preview: list[FixScriptPreviewRow]

class ValidationSummaryResponse(BaseModel):
    total_issues: int
    errors: int
    warnings: int
    info: int
    domains_affected: list[str]
```

### Frontend Hook Contracts

**`useValidationResults(studyId)`** -- `frontend/src/hooks/useValidationResults.ts`
- Query key: `["validation-results", studyId]`
- Endpoint: `GET /api/studies/{studyId}/validation/results`
- Returns: `ValidationResultsData` (`{ rules, scripts, summary }`)
- Enabled when `studyId` is truthy
- StaleTime: 5 minutes
- Returns `null` on 404 (validation not yet run)

**`useAffectedRecords(studyId, ruleId)`** -- `frontend/src/hooks/useAffectedRecords.ts`
- Query key: `["affected-records", studyId, ruleId]`
- Endpoint: `GET /api/studies/{studyId}/validation/results/{ruleId}/records?page_size=500`
- Returns: `AffectedRecordsResponse` (`{ records, total, page, page_size }`)
- Enabled when both `studyId` and `ruleId` are truthy
- StaleTime: 5 minutes

**`useRunValidation(studyId)`** -- `frontend/src/hooks/useRunValidation.ts`
- Mutation endpoint: `POST /api/studies/{studyId}/validate`
- Returns: `ValidationSummary` (`{ total_issues, errors, warnings, info, domains_affected }`)
- On success: invalidates both `["validation-results", studyId]` and `["affected-records", studyId]` query keys

---

## Rules

### domain_level.yaml (6 rules)

| Rule ID | Name | Check Type | Applicable Domains | Severity | Default Fix Tier | Evidence Type |
|---------|------|------------|-------------------|----------|-----------------|---------------|
| SEND-VAL-001 | Required variables present | `required_variables` | ALL | Error | 3 | missing-value |
| SEND-VAL-002 | Variable naming conventions | `variable_format` | ALL | Warning | 2 | value-correction |
| SEND-VAL-003 | Data type validation | `data_type_check` | ALL | Error | 2 | value-correction |
| SEND-VAL-004 | Controlled terminology validation | `controlled_terminology` | ALL | Warning | 2 | value-correction |
| SEND-VAL-005 | Date/time format validation | `date_format` | ALL | Error | 2 | value-correction |
| SEND-VAL-006 | Study day consistency | `study_day_check` | ALL | Warning | 2 | range-check |

### cross_domain.yaml (7 rules)

| Rule ID | Name | Check Type | Applicable Domains | Severity | Default Fix Tier | Evidence Type |
|---------|------|------------|-------------------|----------|-----------------|---------------|
| SEND-VAL-007 | USUBJID referential integrity | `usubjid_integrity` | ALL | Error | 3 | metadata |
| SEND-VAL-008 | STUDYID consistency across domains | `studyid_consistency` | ALL | Error | 2 | value-correction |
| SEND-VAL-009 | Baseline flag consistency | `baseline_consistency` | LB, BW, CL, EG, FW, OM, VS | Warning | 2 | metadata |
| SEND-VAL-010 | SUPP-- domain referential integrity | `supp_integrity` | ALL | Error | 3 | metadata |
| SEND-VAL-014 | Duplicate record detection | `duplicate_detection` | ALL | Error | 3 | metadata |
| SEND-VAL-015 | Value range checks | `value_ranges` | BW, OM | Warning | 1 | range-check |
| SEND-VAL-017 | Exposure domain validation | `exposure_validation` | EX | Warning | 1 | range-check |

### completeness.yaml (3 rules)

| Rule ID | Name | Check Type | Applicable Domains | Severity | Default Fix Tier | Evidence Type |
|---------|------|------------|-------------------|----------|-----------------|---------------|
| SEND-VAL-011 | Required domains present | `required_domains` | STUDY | Error | 3 | metadata |
| SEND-VAL-012 | TS required parameters | `ts_required_params` | TS | Error | 3 | missing-value |
| SEND-VAL-013 | Subject count consistency across domains | `subject_count` | ALL | Info | 1 | metadata |

**Note**: Rule IDs SEND-VAL-016 and SEND-VAL-018 are not defined (gaps in the numbering). The total is **16 rule definitions** in YAML, but the build prompt references 18 rules. The two planned-but-not-implemented rules were SEND-VAL-016 (visit day alignment) and SEND-VAL-018 (domain-specific findings checks).

### What Each Rule Checks

1. **SEND-VAL-001** -- For each loaded domain, checks that all variables marked `core: "Req"` in `sendig_31_variables.yaml` exist as columns and are not entirely null/empty.
2. **SEND-VAL-002** -- Checks variable name length <= 8 chars and uppercase alphanumeric only. Findings domain prefix check is defined but currently skipped (`pass`).
3. **SEND-VAL-003** -- Checks columns ending in STRESN, SEQ, DY, DOSE, VISITDY, VISITNUM contain numeric values. Reports each unique non-numeric value with its count.
4. **SEND-VAL-004** -- Validates 10 CT check mappings: SEX, SPECIES, STRAIN (in DM); DOMAIN (all); MIRESCAT/MARESCAT; --BLFL; EXROUTE, EXDOSFRM, EXDOSFRQ (in EX). Uses `_find_suggestions()` for fuzzy matching.
5. **SEND-VAL-005** -- Checks all `--DTC` columns match ISO 8601 regex. Detects MM/DD/YYYY, DD-Mon-YYYY, DD.MM.YYYY formats. Attempts conversion to suggest fix.
6. **SEND-VAL-006** -- Compares `--DY` values against calculated study day from `--DTC` and DM.RFSTDTC. Tolerance configurable (default +/-1 day).
7. **SEND-VAL-007** -- Every USUBJID in non-DM domains must exist in DM.USUBJID.
8. **SEND-VAL-008** -- STUDYID must be identical across all domains. Finds the most common value, flags deviations.
9. **SEND-VAL-009** -- Checks --BLFL is only "Y" or null (not "N"). Checks at most one baseline per subject/testcode combination.
10. **SEND-VAL-010** -- SUPP-- domains' USUBJIDs must exist in the parent domain (e.g., SUPPMI subjects must be in MI).
11. **SEND-VAL-011** -- Required domains: DM, TS, TA, TE, TX, EX. Recommended: SE, DS. Also checks at least one findings domain exists.
12. **SEND-VAL-012** -- TS must contain required TSPARMCD values: STUDYID, SSTDTC, SENDTC, SENDVER, SPECIES, STRAIN, ROUTE. Recommended: SSESSION, SDESIGN, TRT, TRTV, SPONSOR.
13. **SEND-VAL-013** -- Flags domains where unique USUBJID count exceeds DM's count (may indicate orphan subjects).
14. **SEND-VAL-014** -- Detects duplicate USUBJID + --SEQ combinations within a domain.
15. **SEND-VAL-015** -- Body weight (BW) and organ measurement (OM) --STRESN values must be positive (> 0).
16. **SEND-VAL-017** -- EX-specific: EXDOSE must be >= 0. EXDOSU must be consistent (single unit value across all records).

---

## Check Types

The `CHECK_DISPATCH` dict in `engine.py` maps 15 check type strings to handler functions:

| Check Type Key | Handler Function | File | What It Does | Parameters |
|---------------|-----------------|------|-------------|------------|
| `required_variables` | `check_required_variables` | `required_variables.py` | Checks all "Req" variables per domain from SENDIG metadata are present as columns and not entirely null | None |
| `variable_format` | `check_variable_format` | `variable_format.py` | Variable name length <= 8, uppercase alphanumeric | `max_length` (default 8) |
| `data_type_check` | `check_data_types` | `data_type_check.py` | Columns ending in STRESN/SEQ/DY/DOSE/VISITDY/VISITNUM must be numeric | None |
| `controlled_terminology` | `check_controlled_terminology` | `controlled_terminology.py` | Validates values against CT codelists. Fuzzy matching for suggestions. | Receives extra `ct_data` kwarg |
| `date_format` | `check_date_format` | `timing.py` | All --DTC columns must match ISO 8601 regex | None |
| `study_day_check` | `check_study_day` | `timing.py` | --DY = calculated from --DTC minus DM.RFSTDTC | `tolerance` (default 1) |
| `usubjid_integrity` | `check_usubjid_integrity` | `referential_integrity.py` | Every USUBJID in non-DM domains exists in DM.USUBJID | None |
| `studyid_consistency` | `check_studyid_consistency` | `referential_integrity.py` | STUDYID identical across all domains | None |
| `baseline_consistency` | `check_baseline_consistency` | `referential_integrity.py` | --BLFL only "Y" or null; at most one baseline per subject/testcode | None |
| `supp_integrity` | `check_supp_integrity` | `referential_integrity.py` | SUPP-- domain USUBJIDs exist in parent domain | None |
| `required_domains` | `check_required_domains` | `completeness.py` | Required domains (DM, TS, TA, TE, TX, EX) are present | `required`, `recommended`, `findings_required` |
| `ts_required_params` | `check_ts_required_params` | `completeness.py` | TS contains required TSPARMCD values | `required`, `recommended` |
| `subject_count` | `check_subject_count` | `completeness.py` | Domain USUBJID count not greater than DM | None |
| `duplicate_detection` | `check_duplicates` | `data_integrity.py` | Duplicate USUBJID + --SEQ within a domain | None |
| `value_ranges` | `check_value_ranges` | `data_integrity.py` | BW/OM --STRESN must be > 0 | None |
| `exposure_validation` | `check_exposure` | `data_integrity.py` | EXDOSE >= 0, EXDOSU consistent | None |

### Handler Function Signature

All check handlers share this signature:

```python
def check_xxx(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
    # optional: ct_data for controlled_terminology check
) -> list[AffectedRecordResult]:
```

Each handler constructs `AffectedRecordResult` objects with `issue_id=""` (assigned later by engine), a domain-qualified `rule_id` (e.g., `f"{rule_id_prefix}-{domain_code}"`), and properly typed `evidence` dicts. Results are capped to prevent flooding (typically 20-200 per check).

---

## Fix Tier System

The validation view is a **triage and dispatch tool**, not a data editor. Three tiers determine the fix UX:

| Tier | Name | When Used | Frontend Behavior |
|------|------|-----------|-------------------|
| 1 | Accept as-is | Value might be intentional (unusual species, missing non-critical variable, borderline range) | Shows "ACCEPT" button. User provides justification. Sets fix status to "Accepted as-is". |
| 2 | Simple correction | Clear fix available (wrong case, obvious CT mapping, date format) | Shows "APPLY FIX" or pick from candidates. Sets fix status to "Manually fixed". |
| 3 | Script fix | Needs batch logic or derived calculation | Shows "Fix" dropdown with "Run script..." Opens script dialog. |

**Two independent status tracks:**
- **Fix status**: Not fixed, Auto-fixed, Manually fixed, Accepted as-is, Flagged
- **Review status**: Not reviewed, Reviewed, Approved

Fix status tracks what happened to the data. Review status tracks whether a human has signed off. They are independent -- an auto-fixed item still needs review.

### Fix Scripts (4 from registry.py)

| Script Key | Name | Description | Preview Handler |
|-----------|------|-------------|----------------|
| `strip-whitespace` | Strip trailing whitespace | Removes leading and trailing whitespace from string values in the affected variable | Scans all string columns, finds values where `str != str.strip()`. Shows before/after pairs. Max 20 rows. |
| `uppercase-ct` | Uppercase controlled terminology | Converts controlled terminology values to uppercase to match CDISC CT case requirements | Checks CT columns (EXROUTE, EXDOSFRM, SEX, SPECIES, STRAIN) for non-uppercase values. Max 20 rows. |
| `fix-domain-value` | Populate DOMAIN column | Sets the DOMAIN column value to the expected domain code derived from the dataset name | Finds rows where `DOMAIN != expected_code`. Max 20 rows. |
| `fix-date-format` | Convert dates to ISO 8601 | Converts non-ISO date values to ISO 8601 format (YYYY-MM-DD) | Scans --DTC columns for non-ISO patterns (MM/DD/YYYY, DD-Mon-YYYY, DD.MM.YYYY), attempts conversion. Max 20 rows. |

All scripts are **annotation-only** -- applying a "fix" updates the annotation store's `fixStatus` field. No XPT data is modified. The `applicable_rules` lists are dynamically populated by `_build_scripts()` based on which rules actually fired.

**Known bug in registry.py**: The `get_script()` function has a logic error -- it returns the first script if it matches, otherwise `None` for all scripts (early return in loop body). This function is not currently called by the router, so it does not affect runtime behavior.

---

## Evidence Rendering

The frontend's `ValidationContextPanel.tsx` dispatches on the `evidence.type` field to render specialized UIs. The engine produces exactly one of 6 `RecordEvidence` discriminated union types per affected record.

### RecordEvidence Union (from ValidationView.tsx)

```typescript
export type RecordEvidence =
  | { type: "value-correction"; from: string; to: string }
  | { type: "value-correction-multi"; from: string; candidates: string[] }
  | { type: "code-mapping"; value: string; code: string }
  | { type: "range-check"; lines: { label: string; value: string }[] }
  | { type: "missing-value"; variable: string; derivation?: string; suggested?: string }
  | { type: "metadata"; lines: { label: string; value: string }[] };
```

### Evidence Types in Detail

| Type | When Used | Fields | Frontend Rendering |
|------|-----------|--------|-------------------|
| `value-correction` | CT single match, STUDYID mismatch, date format, variable format, data type, baseline flag | `from`: actual value, `to`: corrected value | Shows `from -> to` with monospace, Tier 2 "APPLY FIX" button |
| `value-correction-multi` | CT with multiple candidate matches | `from`: actual value, `candidates`: array of options | Radio buttons to pick from candidates, Tier 2 "APPLY FIX" |
| `code-mapping` | Code-to-term mapping | `value`: display value, `code`: code value | Shows value-code pairing. **Not currently produced by any check handler** (defined in TypeScript union but unused by backend). |
| `range-check` | Study day mismatch, BW/OM value range, EXDOSE range | `lines`: array of `{label, value}` pairs | Key-value table display, typically Tier 1 or 2 |
| `missing-value` | Required variable missing/null, TS parameter missing | `variable`: variable name, `derivation?`: source context, `suggested?`: suggested value | Shows variable name with context, Tier 3 "Script fix" or Tier 1 "Accept" |
| `metadata` | USUBJID integrity, SUPP integrity, duplicate detection, required domains, subject count, baseline multi-record | `lines`: array of `{label, value}` pairs | Key-value table display, typically Tier 1 or 3 |

### Evidence Production by Check Type

| Check Type | Evidence Type(s) Produced |
|-----------|--------------------------|
| `required_variables` | `missing-value` |
| `variable_format` | `value-correction` |
| `data_type_check` | `value-correction` |
| `controlled_terminology` | `value-correction` (single match), `value-correction-multi` (multiple candidates), `value-correction` with generic "to" (no match) |
| `date_format` | `value-correction` |
| `study_day_check` | `range-check` |
| `usubjid_integrity` | `metadata` |
| `studyid_consistency` | `value-correction` |
| `baseline_consistency` | `value-correction` (invalid flag value), `metadata` (multiple baselines) |
| `supp_integrity` | `metadata` |
| `required_domains` | `metadata` |
| `ts_required_params` | `missing-value` |
| `subject_count` | `metadata` |
| `duplicate_detection` | `metadata` |
| `value_ranges` | `range-check` |
| `exposure_validation` | `range-check` (EXDOSE), `metadata` (EXDOSU consistency) |

---

## SENDIG Metadata

### sendig_31_variables.yaml

Defines required, expected, and permissible variables for **17 domains**:

| Domain | Class | Required (Req) Variable Count | Expected (Exp) Variable Count |
|--------|-------|------|------|
| DM | Special Purpose | 14 (STUDYID, DOMAIN, USUBJID, SUBJID, RFSTDTC, RFENDTC, SITEID, SPECIES, STRAIN, SBSTRAIN, SEX, ARMCD, ARM, SETCD) | 6 (RFXSTDTC, RFXENDTC, BRTHDTC, AGE, AGSEX, DTHDT) |
| TS | Special Purpose | 7 (STUDYID, DOMAIN, TSSEQ, TSGRPID, TSPARMCD, TSPARM, TSVAL) | 0 |
| TA | Special Purpose | 7 (STUDYID, DOMAIN, ARMCD, ARM, TAETORD, ETCD, ELEMENT) | 0 |
| TE | Special Purpose | 5 (STUDYID, DOMAIN, ETCD, ELEMENT, TESTRL) | 0 |
| TX | Special Purpose | 8 (STUDYID, DOMAIN, SETCD, SET, TXSEQ, TXPARMCD, TXPARM, TXVAL) | 0 |
| SE | Special Purpose | 6 (STUDYID, DOMAIN, USUBJID, SESEQ, ETCD, SESTDTC) | 2 (SEENDTC, TAETORD) |
| EX | Interventions | 8 (STUDYID, DOMAIN, USUBJID, EXSEQ, EXTRT, EXDOSE, EXDOSU, EXSTDTC) | 5 (EXENDTC, EXROUTE, EXLOT, EXDOSFRM, EXDOSFRQ) |
| DS | Events | 6 (STUDYID, DOMAIN, USUBJID, DSSEQ, DSTERM, DSDECOD) | 2 (DSSTDTC, DSDY) |
| LB | Findings | 12 (STUDYID, DOMAIN, USUBJID, LBSEQ, LBTESTCD, LBTEST, LBORRES, LBORRESU, LBSTRESC, LBSTRESN, LBSTRESU, LBSPEC) | 5 (LBBLFL, LBNRIND, LBSTAT, LBREASND, VISITDY, LBDY) |
| BW | Findings | 11 (STUDYID, DOMAIN, USUBJID, BWSEQ, BWTESTCD, BWTEST, BWORRES, BWORRESU, BWSTRESC, BWSTRESN, BWSTRESU) | 3 (BWBLFL, VISITDY, BWDY) |
| MI | Findings | 8 (STUDYID, DOMAIN, USUBJID, MISEQ, MITERM, MISTRESC, MISPEC, MIRESCAT) | 4 (MIORRES, MISTAT, MIDY, MISEV) |
| MA | Findings | 7 (STUDYID, DOMAIN, USUBJID, MASEQ, MATERM, MASTRESC, MASPEC) | 4 (MAORRES, MASTAT, MADY, MARESCAT) |
| OM | Findings | 12 (STUDYID, DOMAIN, USUBJID, OMSEQ, OMTESTCD, OMTEST, OMORRES, OMORRESU, OMSTRESC, OMSTRESN, OMSTRESU, OMSPEC) | 2 (OMBLFL, OMDY) |
| CL | Findings | 12 (STUDYID, DOMAIN, USUBJID, CLSEQ, CLTESTCD, CLTEST, CLORRES, CLORRESU, CLSTRESC, CLSTRESN, CLSTRESU, CLSPEC) | 2 (CLBLFL, CLDY) |
| FW | Findings | 11 (STUDYID, DOMAIN, USUBJID, FWSEQ, FWTESTCD, FWTEST, FWORRES, FWORRESU, FWSTRESC, FWSTRESN, FWSTRESU) | 2 (FWBLFL, FWDY) |
| EG | Findings | 11 (STUDYID, DOMAIN, USUBJID, EGSEQ, EGTESTCD, EGTEST, EGORRES, EGORRESU, EGSTRESC, EGSTRESN, EGSTRESU) | 2 (EGBLFL, EGDY) |
| PC | Findings | 12 (STUDYID, DOMAIN, USUBJID, PCSEQ, PCTESTCD, PCTEST, PCORRES, PCORRESU, PCSTRESC, PCSTRESN, PCSTRESU, PCSPEC) | 2 (PCBLFL, PCDY) |
| PP | Findings | 11 (STUDYID, DOMAIN, USUBJID, PPSEQ, PPTESTCD, PPTEST, PPORRES, PPORRESU, PPSTRESC, PPSTRESN, PPSTRESU) | 0 |

### controlled_terms.yaml

Defines **14 codelists**:

| Codelist | Extensible | Term Count | Description |
|----------|-----------|------------|-------------|
| SEX | No | 3 | M, F, U |
| SPECIES | Yes | 17 | RAT, MOUSE, DOG, RABBIT, MONKEY, MINIPIG, HAMSTER, GUINEA PIG, PIG, FERRET, SHEEP, GOAT, CAT, HORSE, CATTLE, WOODCHUCK, MARMOSET, NONHUMAN PRIMATE |
| STRAIN | Yes | 0 (top-level) | Species-specific sublists under `per_species` key: RAT (7), MOUSE (8), DOG (2), RABBIT (2), MONKEY (2), MINIPIG (3) |
| ROUTE | Yes | 19 | ORAL, ORAL GAVAGE, INTRAVENOUS, ... TRANSDERMAL |
| DOSE_FORM | Yes | 12 | SOLUTION, SUSPENSION, CAPSULE, ... SPRAY |
| DOSE_FREQ | Yes | 14 | QD, BID, TID, ... CONTINUOUS |
| SPECIMEN | Yes | 47 | LIVER, KIDNEY, ... URINE |
| BASELINE_FLAG | No | 1 | Y only (null is acceptable, "N" is invalid) |
| RESULT_CATEGORY | Yes | 2 | ABNORMAL, NORMAL |
| DOMAIN_CODES | No | 26 | All SEND domain abbreviations |
| STUDY_DESIGN | Yes | 6 | PARALLEL, CROSSOVER, ... LATIN SQUARE |
| SEVERITY | Yes | 5 | MINIMAL, MILD, MODERATE, MARKED, SEVERE |
| NCOMPLT | Yes | 5 | FOUND DEAD, MORIBUND SACRIFICE, ... DOSING ERROR |
| EUTHANASIA_REASON | Yes | 4 | SCHEDULED SACRIFICE, MORIBUND SACRIFICE, FOUND DEAD, INTERIM SACRIFICE |

**Note**: The STRAIN codelist has `terms: []` at the top level. The controlled_terminology check compares against `valid_terms` built from `cl_info.get("terms", [])`, which is empty for STRAIN. This means STRAIN values will not be validated against the per-species sublists -- a known gap.

---

## Current State

### What is Real (Working)

- **Full validation engine**: 16 rule definitions across 3 YAML files, 15 check types with handler functions
- **Reads actual XPT data**: Uses existing `xpt_processor.read_xpt()`, loads all domains into DataFrames
- **Structured results**: Domain-qualified rule IDs, deterministic issue IDs, typed evidence objects
- **Result caching**: JSON cache in `generated/{study_id}/validation_results.json`
- **Auto-validation on startup**: `init_validation()` runs validation for all studies at server start
- **4 API endpoints**: Run validation, get results, get affected records (paginated), get fix script preview
- **3 frontend hooks**: `useValidationResults`, `useAffectedRecords`, `useRunValidation` (React Query)
- **Fix scripts**: 4 generic scripts with live preview computation from actual data
- **SENDIG metadata**: 17 domains defined with variable designations, 14 CT codelists
- **PointCross results**: ~7 rules fire, ~22 affected records, ~1.2s execution time

### What is Stub or Missing

- **STRAIN validation**: CT codelist for STRAIN has empty top-level `terms: []`; the per-species sublists exist in YAML but are not used by the check handler
- **SPECIMEN CT check**: Commented out in `controlled_terminology.py` CT_CHECKS list with note: "SEND uses compound TYPE, SITE format... requires the full CDISC Library codelist"
- **Findings domain prefix check**: Variable format check has the findings domain prefix logic but executes `pass` (skipped)
- **code-mapping evidence type**: Defined in the TypeScript union but never produced by any backend check handler
- **Visit day alignment (SEND-VAL-016)**: Not implemented
- **Domain-specific findings checks (SEND-VAL-018)**: Not implemented
- **Fix scripts do not write back**: Applying a "fix" only updates annotation status, no XPT modification
- **Official CDISC CT not embedded**: Metadata compiled from public SENDIG 3.1 documentation, not from CDISC Library API
- **No comprehensive test suite**: `backend/tests/test_validation.py` was specified but may not cover all check types

### Production Needs

1. **CDISC Library integration**: Replace hand-compiled CT lists with official CDISC Library API data
2. **SENDIG metadata verification**: Verify variable core designations line-by-line against published standard
3. **More rules**: Implement SEND-VAL-016, SEND-VAL-018, and additional domain-specific checks
4. **Write-back capability**: Fix scripts currently only annotate; production needs actual data modification
5. **STRAIN per-species validation**: Wire up the per_species sublists in the CT check
6. **Multi-study testing**: Validate against 5-10 real SEND submissions, compare with Pinnacle 21/CDISC CORE output
7. **Performance profiling**: Test with large studies (millions of records)
8. **Domain expert review**: Have SEND domain expert review every rule definition

---

## Code Map

| File | What It Does | Key Classes/Functions |
|------|-------------|----------------------|
| `validation/engine.py` | Main engine: loads rules/metadata/CT, orchestrates validation, dispatches checks, builds results, manages cache | `ValidationEngine`, `CHECK_DISPATCH` (dict), `validate()`, `_run_rule()`, `_build_description()`, `_build_scripts()`, `get_affected_records()`, `save_results()`, `load_cached_results()`, `load_study_domains()` |
| `validation/models.py` | All Pydantic models for rules, results, and API responses | `RuleDefinition`, `ValidationRuleResult`, `AffectedRecordResult`, `FixScriptDefinition`, `FixScriptPreviewRow`, `ValidationResults`, `ValidationResultsResponse`, `AffectedRecordsResponse`, `FixScriptPreviewResponse`, `ValidationSummaryResponse` |
| `validation/checks/required_variables.py` | Checks Required variables present and not entirely null per domain | `check_required_variables()` |
| `validation/checks/variable_format.py` | Variable naming conventions: length, case, alphanumeric | `check_variable_format()`, `STANDARD_VARS` (set), `FINDINGS_DOMAINS` (set) |
| `validation/checks/data_type_check.py` | Numeric columns contain numeric data | `check_data_types()`, `NUMERIC_SUFFIXES` (set) |
| `validation/checks/controlled_terminology.py` | CT field validation with fuzzy suggestion matching | `check_controlled_terminology()`, `CT_CHECKS` (list of tuples), `_find_suggestions()`, `_find_column()`, `_get_visit()` |
| `validation/checks/timing.py` | Date format (ISO 8601) and study day consistency | `check_date_format()`, `check_study_day()`, `ISO_DATE_RE` (regex), `_try_convert_to_iso()`, `_get_visit_for_row()` |
| `validation/checks/referential_integrity.py` | USUBJID integrity, STUDYID consistency, baseline flags, SUPP-- references | `check_usubjid_integrity()`, `check_studyid_consistency()`, `check_baseline_consistency()`, `check_supp_integrity()` |
| `validation/checks/completeness.py` | Required domains, TS parameters, subject counts | `check_required_domains()`, `check_ts_required_params()`, `check_subject_count()`, `FINDINGS_DOMAINS` (set) |
| `validation/checks/data_integrity.py` | Duplicate detection, value ranges, exposure validation | `check_duplicates()`, `check_value_ranges()`, `check_exposure()`, `_get_visit()` |
| `validation/rules/domain_level.yaml` | 6 rules: SEND-VAL-001 through SEND-VAL-006 | -- |
| `validation/rules/cross_domain.yaml` | 7 rules: SEND-VAL-007 through SEND-VAL-010, SEND-VAL-014, SEND-VAL-015, SEND-VAL-017 | -- |
| `validation/rules/completeness.yaml` | 3 rules: SEND-VAL-011 through SEND-VAL-013 | -- |
| `validation/metadata/sendig_31_variables.yaml` | Required/Expected variable definitions for 17 SEND domains | -- |
| `validation/metadata/controlled_terms.yaml` | 14 CT codelists (SEX, SPECIES, STRAIN, ROUTE, DOSE_FORM, etc.) | -- |
| `validation/scripts/registry.py` | Fix script definitions and preview computation | `SCRIPTS` (list), `get_scripts()`, `get_script()`, `compute_preview()`, `PREVIEW_HANDLERS` (dict), `_preview_strip_whitespace()`, `_preview_uppercase_ct()`, `_preview_fix_domain()`, `_preview_fix_dates()` |
| `routers/validation.py` | FastAPI router: 4 endpoints + initialization | `router`, `init_validation()`, `run_validation()`, `get_validation_results()`, `get_affected_records()`, `get_script_preview()` |
| `frontend/src/hooks/useValidationResults.ts` | React Query hook for cached validation results | `useValidationResults()`, `ValidationRuleResult` (interface), `FixScriptDef` (interface), `ValidationResultsData` (interface) |
| `frontend/src/hooks/useAffectedRecords.ts` | React Query hook for paginated affected records | `useAffectedRecords()`, `AffectedRecordData` (interface), `AffectedRecordsResponse` (interface) |
| `frontend/src/hooks/useRunValidation.ts` | React Query mutation to trigger validation run | `useRunValidation()`, `ValidationSummary` (interface) |
| `frontend/src/components/analysis/ValidationView.tsx` | Master-detail split view: rules table, records table, filters | `RecordEvidence` (type), `AffectedRecord` (interface) |
| `frontend/src/components/analysis/panes/ValidationContextPanel.tsx` | Two-mode context panel: Rule Review Summary + Issue Review with 6 evidence renderers | -- |

---

## Datagrok Notes

- **Engine ports directly**: Pure Python + pandas + pydantic. No FastAPI dependency in the engine itself (`engine.py`, `models.py`, `checks/*`, `scripts/registry.py`). Only `routers/validation.py` is FastAPI-specific.
- **YAML rules are configuration, not code**: Portable as-is. The `rules/*.yaml` and `metadata/*.yaml` files can be copied into a Datagrok plugin without changes.
- **xpt_processor dependency**: The engine calls `read_xpt()` from `services.xpt_processor`. In Datagrok, this would be replaced with Datagrok's built-in XPT/DataFrame loading.
- **Frontend hooks replaced by Datagrok script calls**: The 3 React Query hooks would be replaced by Datagrok's scripting/function call mechanism.
- **Fix scripts need Datagrok's data write capabilities**: The current annotation-only approach maps well to Datagrok's metadata/tagging system, but actual data modification would use Datagrok's DataFrame mutation API.
- **Result caching**: Currently uses filesystem JSON. In Datagrok, would use Datagrok's built-in caching or session storage.

---

## Changelog

- 2026-02-08: Consolidated from `validation-engine-build-prompt.md`, `validation-redesign-prompt.md`, `validation-engine-audit-prompt.md`, `views/validation.md`, CLAUDE.md (validation sections), and all backend/frontend code
