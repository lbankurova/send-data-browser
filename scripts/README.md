# SENDEX Scripts

Utility scripts that run outside the backend dev loop. All scripts use the
backend venv's Python interpreter:

```bash
C:/pg/pcc/backend/venv/Scripts/python.exe scripts/<script>.py [args]
```

## Build scripts

### `build_synonym_dictionary.py`

Builds `shared/config/finding-synonyms.json` from three upstream sources:

1. **CDISC SEND Controlled Terminology TSVs** (`scripts/data/source/cdisc-send-ct/`)
   - Downloaded from [NCI-EVS FTP](https://evs.nci.nih.gov/ftp1/CDISC/SEND/)
   - Required codelists: `NONNEO.tsv`, `NEOPLASM.tsv`, `MARES.tsv`, `CLOBS.tsv`, `SPEC.tsv`
     (SPEC is maintained in the source workspace per AC-1.2; currently only NONNEO/NEOPLASM/MARES/CLOBS are consumed by the build script, SPEC is reserved for a future organ-side dictionary cycle.)
   - License: NCI Thesaurus is public domain
   - Refresh cadence: **quarterly** (CDISC CT releases each quarter)
   - Tracking: after each refresh, append a line to the "Refresh log" table at the bottom of this README with the release date, git SHA of the refresh commit, and operator initials.

2. **sendigR xptcleaner JSON vocabularies** (`scripts/data/source/sendigr-xptcleaner/`)
   - Downloaded from [github.com/phuse-org/sendigR](https://github.com/phuse-org/sendigR)
   - Files: `nonneo_vocab.json`, `mares_vocab.json`, `clobs_vocab.json`
   - License: MIT
   - Refresh cadence: as upstream releases happen (~1-2x per year)

3. **eTRANSAFE SEND-SNOMED mappings** (`scripts/data/source/etransafe-send-snomed/`)
   - Downloaded from [github.com/mi-erasmusmc/send-snomed-mappings](https://github.com/mi-erasmusmc/send-snomed-mappings)
   - SSSOM-style CSV files
   - License: CC BY 4.0
   - Refresh cadence: as upstream releases happen
   - **NOTE**: SNOMED CT identifiers are parsed for internal validation but
     **stripped from the committed output** per research R1 F4 (SNOMED CT IP).
     NCIt codes (public domain) are the stable cross-reference identifier.

### Conflict resolution

When the same canonical term appears in multiple sources, CDISC wins over
sendigR wins over eTRANSAFE. The `source[]` array on each entry records every
layer that contributed.

### Idempotency

The script is idempotent: same sources + same version inputs → byte-identical
output. Tests assert this against a fixture source workspace.

### Quarterly refresh procedure

1. **Stop the backend dev server** (`--reload` corrupts venv DLLs mid-install).
2. Download the new CDISC SEND CT TSVs from NCI-EVS to `scripts/data/source/cdisc-send-ct/`.
3. Run the build script with the previous version as the monotonic-growth check:
   ```bash
   python scripts/build_synonym_dictionary.py \
       --previous shared/config/finding-synonyms.json \
       --corpus-snapshot scripts/data/sendex_corpus_terms_snapshot.json \
       --strict-snapshot \
       --cdisc-version 2026-06-27 \
       --sendigr-commit <git sha> \
       --etransafe-commit <git sha>
   ```
4. The script will FAIL if:
   - Any prior canonical or alias is missing without a per-term allowlist entry
     (AC-1.7 monotonic growth)
   - Per-domain entry count drops below 95% of the previous version (AC-1.9)
   - Resolved-fraction in the corpus snapshot drops below the previous run
     (AC-1.10)
   - The corpus snapshot is stale relative to the studies on disk
5. Refresh the corpus snapshot **before** rerunning, after any new study
   regeneration:
   ```bash
   python scripts/build_corpus_terms_snapshot.py
   ```
6. Review any monotonic-growth failures: if a term was deliberately removed
   (e.g., CDISC split `HYPERTROPHY` into `HYPERTROPHY_CENTRILOBULAR` and
   `HYPERTROPHY_DIFFUSE` in a CT release), add a per-term allowlist entry
   with a non-empty `reason` field and rerun:
   ```json
   [
     {"term": "HYPERTROPHY", "reason": "CDISC split into HYPERTROPHY_CENTRILOBULAR and HYPERTROPHY_DIFFUSE in CT 2026-06-27"}
   ]
   ```
   Then:
   ```bash
   python scripts/build_synonym_dictionary.py \
       --previous shared/config/finding-synonyms.json \
       --allow-removal removals_2026-06-27.json
   ```

### Fall-forward procedure on schema changes

If a source's schema changes (e.g., NCI-EVS adds a column to the CDISC TSV
header), the build script fails fast with an actionable error naming the
source file AND the missing field. To recover:

1. Read the error message to identify which source and which field.
2. Inspect the upstream changelog (CDISC, sendigR releases, eTRANSAFE).
3. If the change is additive (new column we don't need): no action — the
   parser only requires `CDISC_REQUIRED_COLUMNS` from the build script.
4. If the change is breaking (a required column was renamed or removed):
   update the parser in `scripts/build_synonym_dictionary.py`. Bump the
   parser version comment and re-run.
5. If you cannot diagnose the change quickly, **roll back the source files**
   to the previous quarterly snapshot and file an issue. Do not commit a
   degraded dictionary.

**Escalation contact** (AC-1.6): the toxicology-engine lead owns dictionary
health. If a refresh surfaces a regression that cannot be resolved within
the refresh window, stop the refresh, roll back to the last known-good
sources, and open an issue tagged `dictionary-refresh`. Do not force through
a regressed dictionary — every quarterly refresh MUST leave the resolved
fraction monotonic (AC-1.7) and per-domain coverage at or above the prior
run (AC-1.10).

### Refresh log

Append one row per refresh. Format:

| Refresh date | CDISC CT version | sendigR commit | eTRANSAFE commit | Commit SHA | Operator | Notes |
|--------------|------------------|----------------|------------------|------------|----------|-------|
| 2026-04-07   | bootstrap        | bootstrap      | bootstrap        | (initial)  | impl     | Initial ship — Phase B/C (etransafe-send-snomed-integration cycle). 41 MI + 16 MA + 17 CL canonicals. |

### `build_corpus_terms_snapshot.py`

Walks every `backend/generated/<study>/unified_findings.json` file present on
disk, extracts MI/MA/CL `test_name` values, computes per-study sha256 hashes,
and writes `scripts/data/sendex_corpus_terms_snapshot.json`. The dictionary
build script reads this snapshot to compute resolved/unresolved breakdowns
and fail-fast on coverage regressions.

**Run after every full regeneration of the generator**, before running the
dictionary build. The dictionary build's `--strict-snapshot` flag enforces
freshness in CI.

```bash
python scripts/build_corpus_terms_snapshot.py
```

## Other scripts

| Script | Purpose |
|--------|---------|
| `validation-ratchet.sh` | Run the validation suite and check for regressions vs the baseline |
| `regenerate-validation.sh` | Regenerate ground-truth + cross-study benchmark |
| `generate-coverage-facts.py` | Refresh `coverage-facts.json` from manifest + commit log |
| `complexity-check.sh` | Run radon CC + cloc on tracked hotspots |
