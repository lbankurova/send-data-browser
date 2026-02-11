# CDISC CORE Engine Integration

## What this does

Adds the official CDISC CORE conformance engine (400+ rules) as a complementary validation source alongside the existing custom engine (16 YAML rules). This provides comprehensive, regulatory-credible SEND conformance checking while preserving the existing triage UX (fix tiers, evidence types, fix scripts). Addresses TODO items MF-03, MF-04, GAP-07, and GAP-09.

## User workflow

1. User imports a study or clicks "RUN VALIDATION" on an existing study
2. The custom engine runs first (~1.2s) — produces rich results with fix tiers and evidence
3. If CDISC CORE is installed, it runs second (10-60s) via subprocess — produces comprehensive conformance results
4. Both result sets are merged and deduplicated, then cached
5. User sees a unified rules table in the Validation view — CORE-sourced findings appear alongside custom findings with no UX distinction
6. User triages findings using the same fix-tier system (CORE findings default to Tier 1 — Accept as-is)
7. If CDISC CORE is not installed, validation works exactly as it does today (custom engine only)

## Data model

### Input data

CORE reads XPT files directly from the study directory on disk. No preprocessing needed — it uses the same files the custom engine reads via `xpt_processor.read_xpt()`.

**Per-study standard version:** Each study declares its SENDIG version in the TS domain (`TSPARMCD = "SNDIGVER"`). The runner must read this value and pass the correct `-s` / `-v` arguments to CORE. Example studies:

| Study | SNDIGVER | SNDCTVER | CORE `-v` arg |
|-------|----------|----------|---------------|
| Nimble | SENDIG 3.0 | 2016-03-25 | `3-0` |
| PDS | SENDIG 3.0 | 2013-12-20 | `3-0` |
| PointCross | SENDIG 3.0 | 2017-03-31 | `3-0` |
| instem | SENDIG 3.0 | 2011-06-10 | `3-0` |
| pc2 | SENDIG 3.0 | 2017-03-31 | `3-0` |
| rabbitv1 | SENDIG 3.1 | 2018-12-21 | `3-1` |

The runner parses `SNDIGVER` from the study's TS domain (already available via `xpt_processor.extract_full_ts_metadata()`) and maps the version string to a CORE `-v` argument. If the TS domain is missing or `SNDIGVER` is not present, fall back to `3-1` (latest).

CORE requires:
- A dedicated Python 3.12 venv at `backend/.venv-core/` (our backend runs Python 3.13; CORE requires `>=3.12, <3.13`)
- The CORE repo cloned at `backend/_core_engine/` (provides the `core.py` CLI entry point)
- A populated rules cache at `backend/_core_engine/resources/cache/` (~208 pickle files)
- The rules cache must include rules for all SENDIG versions present in the study collection (currently 3.0 and 3.1)

### Installation

Run from `backend/`:

```bash
# 1. Clone the CORE engine repo
git clone https://github.com/cdisc-org/cdisc-rules-engine.git _core_engine

# 2. Create a dedicated Python 3.12 venv
python3.12 -m venv .venv-core

# 3. Install CORE dependencies
.venv-core/bin/pip install -r _core_engine/requirements.txt
```

The repo ships with ~208 pre-populated cache files in `_core_engine/resources/cache/` (SEND CT, ADAM CT, etc.), so **no CDISC Library API key is needed** for the initial setup. The cache includes all SENDIG 3.0 and 3.1 rules out of the box.

To verify the installation succeeded:

```bash
.venv-core/bin/python _core_engine/core.py validate --help
```

To refresh the cache with the latest rules from the CDISC Library (optional, quarterly updates):

```bash
CDISC_LIBRARY_API_KEY=your_key .venv-core/bin/python _core_engine/core.py update-cache
```

**Important:** The subprocess must run with `cwd` set to the `_core_engine/` directory — CORE uses relative paths to find `resources/templates/report-template.xlsx`.

The integration code detects CORE at runtime via `is_core_available()` (checks that `.venv-core/bin/python`, `_core_engine/core.py`, and `_core_engine/resources/cache/*.pkl` all exist). If any are missing, validation runs the custom engine only — no errors.

### Output data

CORE produces a JSON report with 4 sections: `Conformance_Details`, `Dataset_Details`, `Issue_Summary`, `Issue_Details`, `Rules_Report`. The normalizer maps this into the existing schema from `backend/validation/models.py`:

- Each `(core_id, dataset)` group → one `ValidationRuleResult` (domain-qualified rule ID: `CORE-000252-BW`)
- Each `Issue_Detail` → one `AffectedRecordResult` with:
  - `evidence`: `{"type": "metadata", "lines": [...]}` (subject, row, variables, values)
  - `fix_tier`: 1 (Accept as-is — CORE doesn't classify fix complexity)
  - `diagnosis`: the CORE rule message
  - `suggestions`: None
  - `script_key`: None

A new `source` field on `ValidationRuleResult` distinguishes origin: `"custom"` or `"core"`.

A new optional `core_conformance` field on `ValidationResults` captures CORE engine version, SENDIG standard version, and CT version when CORE was used.

### API endpoints

No new endpoints. CORE results are served through the existing 4 endpoints:

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/studies/{study_id}/validate` | Runs both engines when CORE available |
| GET | `/api/studies/{study_id}/validation/results` | Returns merged results; adds optional `core_conformance` |
| GET | `/api/studies/{study_id}/validation/results/{rule_id}/records` | Works for CORE rule IDs (`CORE-000252-BW`) |
| POST | `/api/studies/{study_id}/validation/scripts/{key}/preview` | Unchanged — scripts only apply to custom-engine findings |

## UI specification

### No mandatory UI changes

The existing Validation view renders CORE findings identically to custom findings:
- Rules table shows CORE rules in the same table (rule_id, severity, domain, category, description, records_affected)
- Context panel Mode 1 (rule review) shows `how_to_fix` ("See CDISC rules catalog for guidance") and `cdisc_reference`
- Context panel Mode 2 (issue review) renders `metadata` evidence type as key-value table (Subject, Row, Variables, Values)
- Fix tier defaults to 1 (Accept as-is) with the standard ACCEPT button

### Optional enhancement

Display CORE conformance metadata in the Validation view header when `core_conformance` is present:

```
CDISC CORE v0.14.2 · SENDIG V3.1 · CT sendct-2023-12-15
```

This appears as a small muted-text line below the existing header. Shows which version of the CDISC standard and controlled terminology the study was validated against — meaningful for regulatory submissions.

### States

- **CORE not installed**: Validation works as today. No visual change. No error.
- **CORE installed, running**: POST `/validate` takes longer (10-60s). The existing loading spinner in the frontend handles this. Consider adding a progress hint if the run exceeds 5s.
- **CORE failed**: Warning logged server-side. Custom results still returned. No user-facing error (graceful degradation).
- **CORE installed, results cached**: GET `/results` returns merged results instantly (same as today).

## Integration points

### Systems touched

- **`docs/systems/validation-engine.md`** — Add CORE integration section: subprocess runner, normalizer, deduplication, `source` field, `core_conformance` model
- **`docs/systems/data-pipeline.md`** — No changes (CORE reads XPT files directly)

### Views touched

- **`docs/views/validation.md`** — Optional: document conformance details display in header

### Files modified

- `backend/validation/engine.py` — Add CORE call after custom rules in `validate()`, merge results, handle CORE failure gracefully
- `backend/validation/models.py` — Add `source` field to `ValidationRuleResult`, add `ConformanceDetails` model, add `core_conformance` to `ValidationResults`

### New files

- `backend/validation/core_runner.py` — CORE subprocess wrapper (`is_core_available()`, `run_core_validation()`), output normalizer (`normalize_core_report()`), severity/category mapping helpers

### New dependencies

- `cdisc-rules-engine` (v0.14.2 as of writing) — installed in separate `.venv-core` (Python 3.12), NOT in the main backend venv. See [Installation](#installation) section above for setup steps.
- CDISC Library API access — **not required** for initial setup (repo ships with pre-populated cache). Only needed for `core.py update-cache` to refresh rules quarterly.

### TODO items addressed

- **MF-03** (Validation rules SEND-VAL-016, SEND-VAL-018): CORE covers visit day alignment, domain-specific findings checks, and hundreds more rules beyond these two. The custom rules remain for their richer evidence types, but CORE fills the coverage gaps.
- **MF-04** (CDISC Library integration): CORE's `update-cache` command pulls the latest rules and controlled terminology directly from the CDISC Library API. This replaces the need to manually maintain `controlled_terms.yaml` and `sendig_31_variables.yaml` for the checks that CORE handles.
- **GAP-07** (SENDIG metadata not verified): CORE uses authoritative CDISC-published metadata internally. For the 400+ rules it covers, there is no risk of hand-compiled metadata inaccuracy. The custom engine's metadata files remain for the 16 custom rules.
- **GAP-09** (SPECIMEN CT check commented out): CORE validates SPECIMEN controlled terminology natively, including compound TYPE/SITE formats. The custom engine's commented-out check can remain disabled.

## Acceptance criteria

- When CORE is not installed, validation produces the same results as today (custom engine only, no errors)
- When CORE is installed, POST `/validate` runs both engines and returns merged results
- When CORE is installed, the results include `core_conformance` with engine version, standard, and CT version
- When a CORE rule overlaps with a custom rule for the same domain, the custom rule's result is kept (richer evidence)
- When CORE fails mid-run (subprocess error, timeout), custom results are still returned and a warning is logged
- CORE-sourced `ValidationRuleResult` entries have `source: "core"` and custom entries have `source: "custom"`
- CORE-sourced `AffectedRecordResult` entries use `evidence.type: "metadata"` with Subject/Row/Variables/Values lines
- CORE-sourced findings render correctly in the context panel (Mode 1 rule review and Mode 2 issue review)
- Existing fix scripts are unaffected (only apply to custom-engine findings)
- `npm run build` passes
- Backend starts without error (with and without CORE installed)

## Datagrok notes

In the production Datagrok plugin:
- CORE could run as a Datagrok script (Python 3.12 environment managed by Datagrok's compute infrastructure)
- The subprocess pattern maps to Datagrok's `DG.Func` system for calling Python scripts
- CORE's JSON output would be parsed by the same normalizer, producing the same schema for the Datagrok validation UI
- The rules cache would be managed as a Datagrok package resource or shared file connection
- If Datagrok's compute environment supports Python 3.12 natively, the subprocess can be replaced with a direct in-process import of `cdisc-rules-engine`

## Open questions

1. ~~**Deduplication mapping**~~: **Resolved** — hardcode the mapping after inspecting the CORE rules cache during implementation. The implementer inspects the cache, identifies which CORE rule IDs overlap with each custom rule (SEND-VAL-001 through SEND-VAL-017), and commits the mapping as a static dict.

2. ~~**CORE timeout**~~: **Resolved** — configurable via `CORE_TIMEOUT_SECONDS` in `config.py`, defaulting to 120s.

3. ~~**Startup behavior**~~: **Resolved** — CORE runs at startup only if no cached results exist for a study (i.e., `validation_results.json` is absent or missing CORE findings). If CORE has already run and results are cached, skip it. This avoids adding 10-60s per study on every restart.

4. ~~**SNDIGVER parsing**~~: **Resolved** — the runner parses the version number from freetext `SNDIGVER` values (regex for `\d+\.\d+`). If unrecognized or missing, default to the latest supported version.

5. ~~**Rules cache refresh**~~: **Resolved** — The CORE repo ships with ~208 pre-populated cache files. No API key or `update-cache` step is needed for initial setup. To refresh with latest CDISC Library rules (quarterly), run `CDISC_LIBRARY_API_KEY=your_key .venv-core/bin/python _core_engine/core.py update-cache`.
