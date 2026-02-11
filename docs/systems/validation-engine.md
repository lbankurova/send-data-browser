# Validation Engine

## Purpose

The validation engine provides comprehensive SEND (Standard for Exchange of Nonclinical Data) validation through a two-engine architecture:

1. **CDISC CORE Engine** (400+ rules) — Official CDISC conformance validation (required variables, controlled terminology, referential integrity, metadata completeness). This is the regulatory gold standard.

2. **Custom Study Design Rules** (7 rules) — Domain-specific enrichment rules that interpret trial design domains (DM, TA, TE, TX, EX) to build subject context and flag study design interpretation issues (orphaned subjects, ambiguous controls, dose inconsistencies).

Results are merged (CORE takes precedence on overlaps), cached as JSON, and consumed by a React frontend with a triage-and-dispatch UX.

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
    |
    |-- Custom Engine (Study Design Rules)
    |   |-- _load_rules()  --> reads rules/study_design.yaml (7 SD-* rules)
    |   |-- load_study_domains(study) --> dict[str, DataFrame]
    |   |-- For each rule:
    |   |     CHECK_DISPATCH["study_design"](**kwargs) --> list[AffectedRecordResult]
    |   |     Mark with source="custom"
    |   |
    |   v
    |   Custom ValidationRuleResults (SD-001 through SD-007)
    |
    |-- CDISC CORE Engine (if available)
    |   |-- is_core_available() --> check for .venv-core/, core.py, cache/*.pkl
    |   |-- get_sendig_version_from_ts() --> derive -v argument from TS.SNDIGVER
    |   |-- run_core_validation() --> subprocess call to CORE CLI
    |   |     python core.py validate -s send -v 3-1 -d /path/to/study
    |   |-- normalize_core_report() --> convert CORE JSON to our schema
    |   |     Mark with source="core"
    |   |
    |   v
    |   CORE ValidationRuleResults (CORE-{rule_id}-{domain})
    |
    |-- Merge Results (CORE takes precedence)
    |   |-- Add all CORE rules
    |   |-- Remove custom rules that overlap (same domain + category)
    |   |-- Log deduplication stats
    |   |
    |   v
    |
ValidationResults (rules + records + scripts + summary + core_conformance)
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
+-- engine.py              # ValidationEngine class, CHECK_DISPATCH, two-engine orchestration
+-- models.py              # Pydantic models (rule definitions, results, ConformanceDetails)
+-- core_runner.py         # CDISC CORE subprocess wrapper + result normalizer
+-- checks/
|   +-- __init__.py
|   +-- study_design.py    # check_study_design (SD-001 through SD-007)
|   +-- [legacy check modules removed - CORE handles conformance]
+-- rules/
|   +-- study_design.yaml  # SD-001 through SD-007 (study design enrichment)
|   +-- [domain_level.yaml, cross_domain.yaml, completeness.yaml REMOVED]
+-- metadata/
|   +-- sendig_31_variables.yaml   # [No longer used - CORE has authoritative metadata]
|   +-- controlled_terms.yaml      # [No longer used - CORE has CT]
+-- scripts/
    +-- registry.py        # 4 fix script definitions + preview computation

backend/_core_engine/      # CDISC CORE rules engine (git submodule)
+-- core.py               # CORE CLI entry point
+-- resources/
    +-- cache/            # 208 .pkl files (SENDIG 3.0, 3.1, CT versions)
    +-- templates/        # report-template.xlsx

backend/.venv-core/       # Python 3.12 venv for CORE (separate from main backend venv)
```

### Key Initialization

The validation router (`routers/validation.py`) exposes `init_validation(studies)`, called during FastAPI lifespan startup. This creates a singleton `ValidationEngine`, then auto-runs validation for every study so results are cached on startup. Subsequent GET requests serve cached JSON; POST `/validate` triggers a fresh run.

### CDISC CORE Integration

**Installation:**
- CORE requires Python 3.12 (our main backend uses Python 3.13)
- Separate venv at `backend/.venv-core/` with CORE dependencies
- CORE repo cloned to `backend/_core_engine/`
- Pre-populated rules cache (208 .pkl files) for SENDIG 3.0, 3.1

**Runtime Behavior:**
1. `is_core_available()` checks for venv, script, and cache
2. If available: runs `core.py validate -s send -v {version} -d {study_dir}`
3. Subprocess runs in `_core_engine/` directory (required for resource paths)
4. Timeout: 120 seconds (typical runtime: 10-60s depending on study size)
5. If CORE fails: logs warning, continues with custom rules only (graceful degradation)

**Result Normalization:**
- CORE JSON → our `ValidationRuleResult` schema
- Rule IDs: `CORE-{core_id}-{domain}` (e.g., "CORE-000252-BW")
- All CORE rules marked with `source="core"`
- Evidence type: `{"type": "metadata", "lines": [...]}`
- Fix tier: defaults to 1 (Accept as-is)

**Precedence & Deduplication:**
- CORE rules added first
- Custom rules checked for overlap (domain + category match)
- Overlapping custom rules removed (CORE is authoritative)
- Non-overlapping custom rules retained (enrichment)

**Conformance Metadata:**
- If CORE runs: `core_conformance` object added to results
- Contains: `engine_version`, `standard` (e.g., "SEND V3.1"), `ct_version`
- Displayed in frontend for regulatory context

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
    rule_id: str                           # e.g. "SD-004" or "CORE-000252-BW"
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
    source: Literal["custom", "core"] = "custom"  # Rule origin (CORE vs custom)
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

class ConformanceDetails(BaseModel):
    """CDISC CORE engine conformance metadata."""
    engine_version: str       # e.g., "0.14.2"
    standard: str             # e.g., "SEND V3.1"
    ct_version: str           # e.g., "sendct-2023-12-15"

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
    core_conformance: ConformanceDetails | None = None  # CORE engine metadata

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

### study_design.yaml (7 rules)

**Note**: All CDISC conformance rules (required variables, controlled terminology, referential integrity, etc.) are now handled by CDISC CORE. Only study design enrichment rules remain as custom rules.

| Rule ID | Name | Check Type | Applicable Domains | Severity | Default Fix Tier | Evidence Type |
|---------|------|------------|-------------------|----------|-----------------|---------------|
| SD-001 | Orphaned subjects | `study_design` | STUDY | Warning | 1 | metadata |
| SD-002 | Ambiguous control assignments | `study_design` | STUDY | Info | 1 | metadata |
| SD-003 | Unmatched dose level | `study_design` | STUDY | Warning | 1 | metadata |
| SD-004 | Missing trial summary parameters | `study_design` | TS | Info | 1 | missing-value |
| SD-005 | Dose inconsistency | `study_design` | STUDY | Warning | 1 | metadata |
| SD-006 | Subject without exposure | `study_design` | STUDY | Warning | 1 | metadata |
| SD-007 | Incomplete trial design elements | `study_design` | STUDY | Info | 1 | metadata |

### What Each Rule Checks

These rules interpret trial design domains (DM, TA, TE, TX, EX) to build subject context and flag study design interpretation issues:

1. **SD-001** -- Subjects in DM without corresponding ARM assignments in TA or TX
2. **SD-002** -- Subjects assigned to control groups with ambiguous or missing vehicle information
3. **SD-003** -- Subjects with exposure records (EX) that don't match any defined dose level in TX
4. **SD-004** -- TS domain missing required parameters (SPECIES, STRAIN, ROUTE, SSTDTC, SSTYP) that reduce study metadata completeness
5. **SD-005** -- Subjects with exposure dose values that differ from their assigned treatment arm dose in TX
6. **SD-006** -- Subjects in DM with ARM assignments but no corresponding exposure records (EX)
7. **SD-007** -- Trial design with incomplete element definitions in TA/TE or missing SET-level parameters in TX

---

## Check Types

The `CHECK_DISPATCH` dict in `engine.py` maps check type strings to handler functions. Since CDISC CORE now handles all conformance validation, only custom study design enrichment checks remain:

| Check Type Key | Handler Function | File | What It Does | Parameters |
|---------------|-----------------|------|-------------|------------|
| `study_design` | `check_study_design` | `study_design.py` | Interprets trial design domains (DM, TA, TE, TX, EX) to build subject context and flag study design interpretation issues (orphaned subjects, ambiguous controls, dose inconsistencies, missing trial parameters) | Receives extra `study` kwarg (StudyInfo) for provenance metadata |

**Note**: All CDISC conformance checks (required variables, controlled terminology, referential integrity, data types, date formats, etc.) are now handled by CDISC CORE (400+ rules). Legacy check handlers for these have been removed.

### Handler Function Signature

```python
def check_study_design(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
    study: StudyInfo | None = None,
) -> list[AffectedRecordResult]:
```

The handler constructs `AffectedRecordResult` objects with `issue_id=""` (assigned later by engine), a domain-qualified `rule_id` (e.g., `f"{rule_id_prefix}"`), and properly typed `evidence` dicts. Results are capped to prevent flooding (typically 20-200 per check).

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
| `code-mapping` | Case/whitespace-only CT mismatch (e.g., "Male" vs "M", "Sprague Dawley" vs "SPRAGUE-DAWLEY") | `from`: actual value, `to`: corrected value | Shows `from -> to` with monospace. Produced by `_classify_match()` when the difference is only case or whitespace. |
| `range-check` | Study day mismatch, BW/OM value range, EXDOSE range | `lines`: array of `{label, value}` pairs | Key-value table display, typically Tier 1 or 2 |
| `missing-value` | Required variable missing/null, TS parameter missing | `variable`: variable name, `derivation?`: source context, `suggested?`: suggested value | Shows variable name with context, Tier 3 "Script fix" or Tier 1 "Accept" |
| `metadata` | USUBJID integrity, SUPP integrity, duplicate detection, required domains, subject count, baseline multi-record | `lines`: array of `{label, value}` pairs | Key-value table display, typically Tier 1 or 3 |

### Evidence Production by Check Type

| Check Type | Evidence Type(s) Produced |
|-----------|--------------------------|
| `study_design` | `metadata` (orphaned subjects, ambiguous controls, dose inconsistencies, subject without exposure, incomplete trial elements), `missing-value` (missing TS parameters) |

**Note**: CDISC CORE rules produce evidence of type `metadata` with a `lines` array containing structured key-value pairs. Evidence types like `value-correction`, `range-check`, and other specialized types are no longer used in custom rules.

---

## SENDIG Metadata

**Note**: The `sendig_31_variables.yaml` and `controlled_terms.yaml` files in `validation/metadata/` are legacy files no longer used by the validation engine. CDISC CORE now provides authoritative metadata from its pre-cached rules (208 .pkl files in `_core_engine/resources/cache/`). These YAML files are preserved for reference but are not loaded by the engine.

### sendig_31_variables.yaml (Legacy)

Previously defined required, expected, and permissible variables for **17 domains**:

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

### controlled_terms.yaml (Legacy)

Previously defined **14 codelists**:

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

**Note**: The STRAIN codelist has `terms: []` at the top level with species-specific sublists under `per_species`. The CT check handler builds `valid_terms` by reading SPECIES from the DM domain and collecting strains for those species. If no species match is found and the codelist is extensible, the check is skipped to avoid false positives.

---

## Current State

### What is Real (Working)

- **Two-engine validation architecture**: CDISC CORE (400+ conformance rules) + 7 custom study design enrichment rules
- **CDISC CORE integration**: Python 3.12 subprocess with 208 pre-cached rules (.pkl files), automatic version detection from TS.SNDIGVER, result normalization, graceful degradation if unavailable
- **Study design enrichment**: 7 SD-* rules that interpret trial design domains (DM, TA, TE, TX, EX) to flag orphaned subjects, ambiguous controls, dose inconsistencies
- **Reads actual XPT data**: Uses existing `xpt_processor.read_xpt()`, loads all domains into DataFrames
- **Structured results**: Domain-qualified rule IDs, deterministic issue IDs, typed evidence objects, source tracking ("core" vs "custom")
- **Result caching**: JSON cache in `generated/{study_id}/validation_results.json` with core_conformance metadata
- **Auto-validation on startup**: `init_validation()` runs validation for all studies at server start
- **4 API endpoints**: Run validation, get results, get affected records (paginated), get fix script preview
- **3 frontend hooks**: `useValidationResults`, `useAffectedRecords`, `useRunValidation` (React Query)
- **Fix scripts**: 4 generic scripts with live preview computation from actual data (annotation-only, no data modification)
- **Precedence & deduplication**: CORE takes precedence over custom rules when (domain, category) overlap, with logging of removed duplicates
- **PointCross results**: 1 custom rule fires (SD-004 - missing TS parameters), 0 CORE rules (study is conformant), ~0.5s execution time

### What is Stub or Missing

- **Fix scripts do not write back**: Applying a "fix" only updates annotation status, no XPT modification
- **CORE not installed by default**: Requires manual setup (Python 3.12, clone cdisc-rules-engine, install dependencies, cache rules)
- **No comprehensive test suite**: `backend/tests/test_validation.py` may not cover all check types or CORE integration scenarios
- **CORE timeout**: Hardcoded to 120s, may need tuning for very large studies

### Production Needs

1. **CORE installation automation**: Add setup script to automate Python 3.12 installation, repo cloning, venv creation, dependency installation, and cache population
2. **CORE version updates**: Establish process for updating CORE engine and rule cache when new SENDIG/SEND versions are published
3. **Study design rule refinement**: Domain expert review of SD-* rules to ensure they accurately detect real study design issues without false positives
4. **Write-back capability**: Fix scripts currently only annotate; production needs actual data modification (requires XPT write support)
5. **Multi-study testing**: Validate against 10-20 real SEND submissions to verify CORE integration and custom rule quality
6. **Performance profiling**: Test with large studies (millions of records) to identify bottlenecks in CORE subprocess and result normalization
7. **Error handling**: Add retry logic, better timeout handling, and fallback strategies for CORE failures
8. **Conformance metadata display**: Frontend UI to show CORE engine version, SENDIG version, CT version from core_conformance object

---

## Code Map

| File | What It Does | Key Classes/Functions |
|------|-------------|----------------------|
| `validation/engine.py` | Main engine: loads custom rules, orchestrates two-engine validation (CORE + custom), dispatches checks, merges results with precedence, builds results, manages cache | `ValidationEngine`, `CHECK_DISPATCH` (dict with 1 handler), `validate()`, `_run_rule()`, `_build_description()`, `_build_scripts()`, `get_affected_records()`, `save_results()`, `load_cached_results()`, `load_study_domains()` |
| `validation/core_runner.py` | CDISC CORE subprocess wrapper and result normalizer | `is_core_available()`, `run_core_validation()`, `normalize_core_report()`, `get_sendig_version_from_ts()`, `_map_severity()`, `_map_category()` |
| `validation/models.py` | All Pydantic models for rules, results, and API responses | `RuleDefinition`, `ValidationRuleResult`, `AffectedRecordResult`, `FixScriptDefinition`, `FixScriptPreviewRow`, `ValidationResults`, `ConformanceDetails`, `ValidationResultsResponse`, `AffectedRecordsResponse`, `FixScriptPreviewResponse`, `ValidationSummaryResponse` |
| `validation/checks/study_design.py` | Study design enrichment checks: orphaned subjects, ambiguous controls, dose inconsistencies, missing TS parameters | `check_study_design()`, `build_subject_context()`, helper functions (cached) |
| `validation/rules/study_design.yaml` | 7 SD-* rules for study design interpretation issues | -- |
| `validation/metadata/sendig_31_variables.yaml` | **LEGACY** — No longer used (CORE has authoritative metadata) | -- |
| `validation/metadata/controlled_terms.yaml` | **LEGACY** — No longer used (CORE has authoritative CT) | -- |
| `validation/scripts/registry.py` | Fix script definitions and preview computation | `SCRIPTS` (list), `get_scripts()`, `get_script()`, `compute_preview()`, `PREVIEW_HANDLERS` (dict), `_preview_strip_whitespace()`, `_preview_uppercase_ct()`, `_preview_fix_domain()`, `_preview_fix_dates()`, `apply_all_fixes()` |
| `_core_engine/core.py` | CDISC CORE CLI entry point (separate Python 3.12 venv) | CORE commands (validate, etc.) |
| `_core_engine/resources/cache/` | Pre-cached CORE rules (208 .pkl files for SENDIG 3.0, 3.1) | -- |
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

- 2026-02-11: CDISC CORE integration — Removed 16 redundant SEND-VAL-* conformance rules (completeness.yaml, cross_domain.yaml, domain_level.yaml), integrated CDISC CORE engine (400+ rules via Python 3.12 subprocess), implemented two-engine architecture with CORE precedence, updated all documentation sections to reflect custom rules now only handle study design enrichment (SD-*)
- 2026-02-08: Consolidated from `validation-engine-build-prompt.md`, `validation-redesign-prompt.md`, `validation-engine-audit-prompt.md`, `views/validation.md`, CLAUDE.md (validation sections), and all backend/frontend code
