# SENDex Backend Performance Diagnostic

Generated: 2026-03-11 | Study: PointCross | Platform: Windows (MSYS)

---

## 1. Entry Points & Startup

### Dockerfile / Start Command

```dockerfile
# Production (Dockerfile, line 47)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2
```

```bash
# Development
cd C:/pg/pcc/backend && uvicorn main:app --reload --port 8000 \
  --reload-exclude ".venv-core" --reload-exclude "_core_engine"
```

### Middleware Stack (order of registration in `main.py`)

| Order | Middleware | Config |
|-------|-----------|--------|
| 1 | `CORSMiddleware` | `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]` |
| 2 | `GZipMiddleware` | `minimum_size=1000` bytes |

Note: FastAPI processes middleware in reverse registration order for responses. GZip wraps the response last (outermost), CORS adds headers first.

### Lifespan Tasks (`main.py:25–99`)

Executed sequentially at startup:

1. **Diagnostic logging** — enumerate `SEND_DATA_DIR` and `generated/` contents
2. **Shared file verification** — check 5 required shared JSON/YAML files exist; `SystemExit(1)` if missing
3. **Eager import** — `ParameterizedAnalysisPipeline` imported to surface errors early
4. **Study discovery** — `discover_studies()` scans `SEND_DATA_DIR` for XPT directories
5. **Auto-generation** — for each discovered study, if `unified_findings.json` is missing, runs `generator.generate(study_id)` synchronously (blocks startup)
6. **Router initialization** — calls `init_studies()`, `init_analysis_studies()`, `init_analysis_views()`, `init_validation()`, `init_temporal()` — each copies the studies dict into module-level state

---

## 2. Request Routing Inventory

### Router: `studies.py` (prefix: `/api`)

| Method | Path | Handler | Sync/Async | Response Size | LRU Cache |
|--------|------|---------|------------|---------------|-----------|
| GET | `/api/studies` | `list_studies` | sync | Small (list of summaries) | No (reads from startup-populated `_study_metadata` dict) |
| GET | `/api/studies/{study_id}/metadata` | `get_study_metadata` | sync | ~0.4 KB | No (reads from `_full_metadata` dict) |
| GET | `/api/studies/{study_id}/domains` | `list_domains` | sync | Small | No |
| GET | `/api/studies/{study_id}/domains/{domain_name}` | `get_domain` | sync | Variable (paginated XPT data) | No (reads CSV from disk each time) |

### Router: `analysis_views.py` (prefix: `/api`)

| Method | Path | Handler | Sync/Async | Served File | Size on Disk | LRU Cache |
|--------|------|---------|------------|-------------|-------------|-----------|
| GET | `/api/studies/{id}/analysis/{view_name}` | `get_analysis_view` | **sync** | See §4 table | 0.4 KB – 2.6 MB | Yes (`_load_from_disk_cached`, maxsize=64) |
| POST | `/api/studies/{id}/regenerate` | `regenerate_study` | **sync** | N/A (runs generator) | N/A | Clears all caches |
| GET | `/api/studies/{id}/analysis/static/{chart}` | `get_static_chart` | async | `target_organ_bar.html` | 11 KB | No |
| POST | `/api/studies/{id}/analyses/pattern-override-preview` | `pattern_override_preview` | async | N/A (computed) | N/A | No (uses `_load_unified_findings` from analyses.py) |

### Router: `analyses.py` (prefix: `/api`)

| Method | Path | Handler | Sync/Async | LRU Cache |
|--------|------|---------|------------|-----------|
| GET | `/api/studies/{id}/analyses/adverse-effects` | `get_adverse_effects` | **sync** | Yes (`_load_unified_findings_cached`, maxsize=8) |
| GET | `/api/studies/{id}/analyses/adverse-effects/finding/{fid}` | `get_finding_context` | **sync** | Yes (same LRU) |
| GET | `/api/studies/{id}/analyses/adverse-effects/organ/{key}/correlations` | `get_organ_correlations` | **sync** | Yes (same LRU) |
| GET | `/api/studies/{id}/analyses/adverse-effects/summary` | `get_adverse_effects_summary` | **sync** | Yes (same LRU) |
| POST | `/api/studies/{id}/analyses/adverse-effects/syndrome-correlations` | `post_syndrome_correlations` | **sync** | Yes (same LRU) |
| POST | `/api/studies/{id}/analyses/adverse-effects/syndrome-correlation-summaries` | `post_syndrome_correlation_summaries` | **sync** | Yes (same LRU) |

### Router: `annotations.py` (prefix: `/api`)

| Method | Path | Handler | Sync/Async | Cache |
|--------|------|---------|------------|-------|
| GET | `/api/studies/{id}/annotations/{schema_type}` | `get_annotations` | async | No (disk read each time) |
| PUT | `/api/studies/{id}/annotations/{schema_type}/{entity_key}` | `save_annotation` | async | No |
| DELETE | `/api/studies/{id}/annotations/{schema_type}/{entity_key}` | `delete_annotation` | async | No |
| GET | `/api/studies/{id}/audit-log` | `get_audit_log` | async | No |

### Router: `validation.py` (prefix: `/api`)

| Method | Path | Handler | Sync/Async | Cache |
|--------|------|---------|------------|-------|
| POST | `/api/studies/{id}/validate` | `run_validation` | async | No (writes results to disk) |
| GET | `/api/studies/{id}/validation/results` | `get_validation_results` | async | Lazy-validates on first request; reads from disk |
| GET | `/api/studies/{id}/validation/results/{rule_id}/records` | `get_affected_records` | async | No |
| POST | `/api/studies/{id}/validation/scripts/{key}/preview` | `get_script_preview` | async | No |

### Router: `temporal.py` (prefix: `/api`)

| Method | Path | Handler | Sync/Async | Cache |
|--------|------|---------|------------|-------|
| GET | `/api/studies/{id}/timecourse/{domain}/{test_code}` | `get_timecourse` | async | No (reads CSV + pandas computation per request) |
| GET | `/api/studies/{id}/timecourse/cl` | `get_cl_timecourse` | async | No |
| GET | `/api/studies/{id}/subjects/{usubjid}/profile` | `get_subject_profile` | async | No |
| GET | `/api/studies/{id}/histopath/subjects` | `get_histopath_subjects` | async | No |
| GET | `/api/studies/{id}/subjects/compare` | `compare_subjects` | async | No |
| GET | `/api/studies/{id}/recovery-comparison` | `get_recovery_comparison` | async | No |

**Note:** All temporal endpoints are `async def` but perform blocking I/O (`pd.read_csv`, `ensure_cached`) inside the event loop — no threadpool offload.

### Router: `import_study.py` (prefix: `/api`)

| Method | Path | Handler | Sync/Async | Cache |
|--------|------|---------|------------|-------|
| POST | `/api/import` | `import_study` | async | No |
| DELETE | `/api/studies/{id}` | `delete_study` | async | No |

### Router: `scenarios.py` (prefix: `/api`)

| Method | Path | Handler | Sync/Async | Cache |
|--------|------|---------|------------|-------|
| GET | `/api/scenarios` | `get_scenarios` | sync | No (reads from in-memory registry) |
| GET | `/api/scenarios/{id}/expected-issues` | `get_expected_issues` | sync | No |

### Router: `study_portfolio.py` (prefix: `/api/portfolio`)

| Method | Path | Handler | Sync/Async | Cache |
|--------|------|---------|------------|-------|
| GET | `/api/portfolio/studies` | `list_studies` | async | No (instantiates `StudyMetadataService` per call via `get_study_metadata_service()`) |
| GET | `/api/portfolio/studies/{id}` | `get_study` | async | No |
| GET | `/api/portfolio/projects` | `list_projects` | async | No |
| GET | `/api/portfolio/projects/{id}/studies` | `get_project_studies` | async | No |
| GET | `/api/portfolio/insights/{id}` | `get_insights` | async | No |

### Catch-all SPA route (`main.py:155`)

| Method | Path | Handler | Sync/Async |
|--------|------|---------|------------|
| GET | `/{full_path:path}` | `serve_spa` | async |

### Debug route (`main.py:122`)

| Method | Path | Handler | Sync/Async |
|--------|------|---------|------------|
| GET | `/api/debug/health` | `debug_health` | async |

---

## 3. Caching Audit

### In-Memory LRU Caches

| Location | Function | maxsize | Key | Invalidation |
|----------|----------|---------|-----|-------------|
| `analysis_views.py:90` | `_load_from_disk_cached` | 64 | `(file_path: str, mtime_ns: int)` | Auto (mtime change) + manual `cache_clear()` on regenerate |
| `analyses.py:63` | `_load_unified_findings_cached` | 8 | `(study_id: str, mtime_ns: int)` | Auto (mtime change) + manual `cache_clear()` on regenerate |

### File-Based Cache (Parameterized Pipeline)

| Location | Directory | Key | Policy |
|----------|-----------|-----|--------|
| `analysis_cache.py` | `generated/{study_id}/.settings_cache/{hash}/` | SHA256 of settings JSON | No eviction. Entire `.settings_cache/` dir deleted on regenerate. |

### XPT → CSV Cache

| Location | Directory | Key | Policy |
|----------|-----------|-----|--------|
| `xpt_processor.py` | `cache/{study_id}/` | `{domain}.csv` | Fresh if CSV mtime > XPT mtime |

### Functions That Read from Disk WITHOUT Caching

| Router | Function | What it reads |
|--------|----------|--------------|
| `annotations.py` | `get_annotations` | `annotations/{study_id}/{schema_type}.json` — every GET reads from disk |
| `annotations.py` | `save_annotation` | Read + write `annotations/{study_id}/{schema_type}.json` |
| `annotations.py` | `get_audit_log` | `annotations/{study_id}/audit_log.json` |
| `validation.py` | `get_validation_results` | `generated/{study_id}/validation_results.json` via engine |
| `validation.py` | `_load_rule_config` | `annotations/{study_id}/validation_rule_config.json` |
| `temporal.py` | `_read_domain_df` | CSV via `ensure_cached` + `pd.read_csv` — every request re-reads |
| `temporal.py` | `get_subject_profile` | Reads multiple domain CSVs + JSON files per call |
| `temporal.py` | `get_histopath_subjects` | Reads MI/MA domain CSVs + `unified_findings.json` from disk |
| `studies.py` | `get_domain` | CSV via `ensure_cached` + `pd.read_csv` |
| `analysis_views.py` | `_load_mortality` | `study_mortality.json` — uncached, called on pipeline miss |
| `study_portfolio.py` | all | `StudyMetadataService._load_data()` reads `data/study_metadata.json` |

---

## 4. Generated File Inventory (PointCross)

| File | Size on Disk | Served By Endpoint |
|------|-------------|-------------------|
| `adverse_effect_summary.json` | 557.9 KB | `GET /api/studies/{id}/analysis/adverse-effect-summary` |
| `cross_animal_flags.json` | 10.8 KB | `GET /api/studies/{id}/analysis/cross-animal-flags` |
| `dose_response_metrics.json` | 2,009.6 KB | `GET /api/studies/{id}/analysis/dose-response-metrics` |
| `finding_dose_trends.json` | 20.8 KB | `GET /api/studies/{id}/analysis/finding-dose-trends` |
| `food_consumption_summary.json` | 8.4 KB | `GET /api/studies/{id}/analysis/food-consumption-summary` |
| `lesion_severity_summary.json` | 1,172.1 KB | `GET /api/studies/{id}/analysis/lesion-severity-summary` |
| `noael_summary.json` | 5.8 KB | `GET /api/studies/{id}/analysis/noael-summary` |
| `organ_evidence_detail.json` | 142.7 KB | `GET /api/studies/{id}/analysis/organ-evidence-detail` |
| `pk_integration.json` | 12.1 KB | `GET /api/studies/{id}/analysis/pk-integration` |
| `provenance_messages.json` | 0.6 KB | `GET /api/studies/{id}/analysis/provenance-messages` |
| `rule_results.json` | 507.1 KB | `GET /api/studies/{id}/analysis/rule-results` |
| `study_metadata_enriched.json` | 0.4 KB | `GET /api/studies/{id}/analysis/study-metadata-enriched` |
| `study_mortality.json` | 2.7 KB | `GET /api/studies/{id}/analysis/study-mortality` |
| `study_signal_summary.json` | 701.7 KB | `GET /api/studies/{id}/analysis/study-signal-summary` |
| `subject_context.json` | 91.8 KB | `GET /api/studies/{id}/analysis/subject-context` |
| `target_organ_summary.json` | 4.5 KB | `GET /api/studies/{id}/analysis/target-organ-summary` |
| `tumor_summary.json` | 5.0 KB | `GET /api/studies/{id}/analysis/tumor-summary` |
| `unified_findings.json` | 2,626.5 KB | `GET /api/studies/{id}/analysis/unified-findings` + `analyses/adverse-effects` |
| `validation_results.json` | 15.4 KB | `GET /api/studies/{id}/validation/results` |
| `static/target_organ_bar.html` | 11.1 KB | `GET /api/studies/{id}/analysis/static/target_organ_bar` |
| **TOTAL** | **~7.9 MB** (excl. `unified_findings_BEFORE.json`) | |

Note: `unified_findings_BEFORE.json` (2,506 KB) is not served by any endpoint — appears to be a debug artifact.

---

## 5. Concurrency Model

| Property | Value |
|----------|-------|
| **Worker count** | 2 (production), 1 (development with `--reload`) |
| **Worker class** | Default uvicorn (`uvloop` on Linux, `asyncio` on Windows) |
| **ASGI server** | Uvicorn |
| **Process model** | Multi-process (production: `--workers 2` spawns 2 OS processes) |
| **Thread pool** | FastAPI's default `anyio` threadpool for `def` (non-async) handlers |

### Sync vs Async Handler Distribution

| Handler Type | Count | Behavior |
|-------------|-------|----------|
| `def` (sync) | 14 | Runs in threadpool — event loop stays free |
| `async def` | 22 | Runs directly on event loop |

**Critical observation:** All 6 `temporal.py` endpoints are `async def` but perform **blocking I/O** inside the handler:
- `pd.read_csv()` — synchronous file read
- `ensure_cached()` — synchronous XPT-to-CSV conversion
- `json.load()` — synchronous file read
- NumPy/Pandas computation — CPU-bound

This blocks the event loop for the duration of each temporal request. With 1 worker (dev mode), a slow temporal request blocks ALL concurrent requests.

Similarly, `validation.py` endpoints are `async def` but call `engine.validate()` which is CPU-bound (loads XPTs, runs rules).

The `analyses.py` and `analysis_views.py` routes that do heavy computation (pipeline runs, JSON loading) correctly use `def` (sync) to run in the threadpool.

---

## 6. Actual Timing Measurements

Benchmark run on PointCross study data. Measured: `json.load()`, `json.dumps()`, `gzip.compress()` (default level 9).

| File | Size KB | Load ms | Dumps ms | GZip ms | GZ KB | Ratio% |
|------|---------|---------|----------|---------|-------|--------|
| adverse_effect_summary.json | 557.9 | 5.3 | 3.6 | 9.0 | 17.4 | 3.1% |
| cross_animal_flags.json | 10.8 | 0.7 | 0.1 | 0.2 | 1.5 | 14.3% |
| dose_response_metrics.json | 2,009.6 | 18.4 | 12.4 | 24.4 | 44.2 | 2.2% |
| finding_dose_trends.json | 20.8 | 2.0 | 0.2 | 0.3 | 1.9 | 9.1% |
| food_consumption_summary.json | 8.4 | 0.2 | 0.1 | 0.2 | 1.2 | 14.0% |
| lesion_severity_summary.json | 1,172.1 | 10.2 | 5.9 | 9.4 | 15.7 | 1.3% |
| noael_summary.json | 5.8 | 0.9 | 0.1 | 0.1 | 0.6 | 9.5% |
| organ_evidence_detail.json | 142.7 | 1.3 | 0.7 | 2.6 | 5.8 | 4.1% |
| pk_integration.json | 12.1 | 0.3 | 0.1 | 0.2 | 1.9 | 16.1% |
| provenance_messages.json | 0.6 | 0.1 | 0.0 | 0.1 | 0.2 | 38.5% |
| rule_results.json | 507.1 | 3.8 | 2.3 | 7.2 | 19.9 | 3.9% |
| study_metadata_enriched.json | 0.4 | 0.3 | 0.1 | 0.1 | 0.2 | 57.0% |
| study_mortality.json | 2.7 | 0.2 | 0.0 | 0.1 | 0.5 | 19.0% |
| study_signal_summary.json | 701.7 | 6.0 | 4.2 | 12.4 | 29.9 | 4.3% |
| subject_context.json | 91.8 | 1.3 | 0.4 | 0.7 | 1.3 | 1.4% |
| target_organ_summary.json | 4.5 | 0.3 | 0.1 | 0.1 | 0.6 | 13.0% |
| tumor_summary.json | 5.0 | 0.2 | 0.0 | 0.1 | 0.7 | 15.0% |
| unified_findings.json | 2,626.5 | 22.7 | 15.2 | 56.4 | 138.8 | 5.3% |
| validation_results.json | 15.4 | 2.1 | 0.1 | 0.3 | 2.4 | 15.6% |
| **TOTAL** | **7,896** | **76.3** | **45.5** | **123.9** | **284.7** | |

Note: `unified_findings_BEFORE.json` excluded from totals (not served).

### Key Observations

- **`unified_findings.json`** dominates: 2.6 MB raw, 22.7 ms to parse, 56.4 ms to gzip — served by both `analysis_views.py` and `analyses.py`
- **`dose_response_metrics.json`** is the second largest: 2.0 MB, 18.4 ms parse, 24.4 ms gzip
- **`lesion_severity_summary.json`** is 1.2 MB but compresses to 15.7 KB (1.3% ratio — extremely repetitive data)
- GZip compression is effective: total 7.9 MB → 285 KB (3.6% average ratio)
- **Total cold-read cost** (all files): ~76 ms parse + ~124 ms gzip = ~200 ms
- After LRU cache is warm, parse cost drops to zero for `analysis_views` and `analyses` endpoints. The `json.dumps()` + gzip cost (~170 ms total) remains per response since `GZipMiddleware` compresses each response.

---

## 7. Request Fan-Out Per Frontend View

### Landing Page (`/`)

| # | Endpoint | Parallel? |
|---|----------|-----------|
| 1 | `GET /api/studies` | Yes |
| 2 | `GET /api/portfolio/studies` | Yes |
| 3 | `GET /api/portfolio/projects` | Yes |
| 4 | `GET /api/scenarios` | Yes (if design mode) |

All 4 fire in parallel on mount.

---

### Study Summary (`/studies/:studyId`)

| # | Endpoint | Parallel? | Approx Response |
|---|----------|-----------|-----------------|
| 1 | `GET /api/studies/{id}/analysis/study-signal-summary` | Yes | 702 KB |
| 2 | `GET /api/studies/{id}/metadata` | Yes | 0.4 KB |
| 3 | `GET /api/studies/{id}/analysis/provenance-messages` | Yes | 0.6 KB |
| 4 | `GET /api/studies/{id}/analysis/study-mortality` | Yes | 2.7 KB |

4 parallel requests on mount. ~706 KB total.

**Lazy (Insights tab):**
- `GET .../analysis/noael-summary` (5.8 KB)
- `GET .../analysis/target-organ-summary` (4.5 KB)

---

### Findings View (`/studies/:studyId/findings`)

| # | Endpoint | Parallel? | Approx Response |
|---|----------|-----------|-----------------|
| 1 | `GET /api/studies/{id}/analysis/unified-findings` | Yes | 2,627 KB |
| 2 | `GET /api/studies/{id}/analysis/study-mortality` | Yes | 2.7 KB |
| 3 | `GET /api/studies/{id}/annotations/normalization-overrides` | Yes | Small |

3 parallel on mount. **~2.6 MB dominated by unified-findings.**

**Lazy (on finding selection):**
- `GET .../analyses/adverse-effects/finding/{findingId}` (computed)
- `GET .../analyses/adverse-effects/organ/{key}/correlations` (computed)
- `POST .../analyses/adverse-effects/syndrome-correlations` (computed)

---

### Dose-Response View (`/studies/:studyId/dose-response`)

| # | Endpoint | Parallel? | Approx Response |
|---|----------|-----------|-----------------|
| 1 | `GET /api/studies/{id}/analysis/unified-findings` | Yes (shared cache) | 2,627 KB |
| 2 | `GET /api/studies/{id}/analysis/dose-response-metrics` | Yes | 2,010 KB |
| 3 | `GET /api/studies/{id}/analysis/study-signal-summary` | Yes | 702 KB |
| 4 | `GET /api/studies/{id}/analysis/rule-results` | Yes | 507 KB |
| 5 | `GET /api/studies/{id}/analysis/noael-summary` | Yes | 5.8 KB |
| 6 | `GET /api/studies/{id}/annotations/noael-overrides` | Yes | Small |
| 7 | `GET /api/studies/{id}/annotations/normalization-overrides` | Yes | Small |

7 parallel on mount. **~5.9 MB total** (heaviest view).

**Lazy (on chart render):**
- `GET .../timecourse/{domain}/{testCode}?mode=group&sex=...` (per endpoint, per sex)

---

### Histopathology View (`/studies/:studyId/histopathology`)

| # | Endpoint | Parallel? | Approx Response |
|---|----------|-----------|-----------------|
| 1 | `GET /api/studies/{id}/analysis/unified-findings` | Yes (shared cache) | 2,627 KB |
| 2 | `GET /api/studies/{id}/analysis/lesion-severity-summary` | Yes | 1,172 KB |
| 3 | `GET /api/studies/{id}/analysis/rule-results` | Yes | 507 KB |
| 4 | `GET /api/studies/{id}/analysis/finding-dose-trends` | Yes | 20.8 KB |
| 5 | `GET /api/studies/{id}/analysis/study-signal-summary` | Yes | 702 KB |

5 parallel on mount. **~5.0 MB total.**

**Lazy (on specimen selection):**
- `GET .../histopath/subjects?specimen=...` (per specimen)

---

### NOAEL Determination View (`/studies/:studyId/noael-determination`)

| # | Endpoint | Parallel? | Approx Response |
|---|----------|-----------|-----------------|
| 1 | `GET /api/studies/{id}/analysis/noael-summary` | Yes | 5.8 KB |
| 2 | `GET /api/studies/{id}/annotations/noael-overrides` | Yes | Small |
| 3 | `GET /api/studies/{id}/analysis/rule-results` | Yes | 507 KB |
| 4 | `GET /api/studies/{id}/analysis/study-signal-summary` | Yes | 702 KB |
| 5 | `GET /api/studies/{id}/analysis/target-organ-summary` | Yes | 4.5 KB |
| 6 | `GET /api/studies/{id}/analysis/unified-findings` | Yes (shared cache) | 2,627 KB |
| 7 | `GET /api/studies/{id}/analysis/pk-integration` | Yes | 12.1 KB |

7 parallel on mount. **~3.9 MB total.**

---

### Validation View (`/studies/:studyId/validation`)

| # | Endpoint | Parallel? | Approx Response |
|---|----------|-----------|-----------------|
| 1 | `GET /api/studies/{id}/validation/results?include_catalog=true` | Yes | ~15 KB + catalog |
| 2 | `GET /api/studies/{id}/annotations/validation-record-reviews` | Yes | Small |

2 parallel on mount. Small total.

**Lazy (on rule selection):**
- `GET .../validation/results/{ruleId}/records?page_size=500`

---

### Domain Data View (`/studies/:studyId/domains/:domain`)

| # | Endpoint | Parallel? | Approx Response |
|---|----------|-----------|-----------------|
| 1 | `GET /api/studies/{id}/domains/{domain}?page_size=10000` | Single | Variable |

---

### Cross-View React Query Deduplication

The `unified-findings` query key is shared across Findings, Dose-Response, Histopathology, and NOAEL views. React Query's 5-minute stale cache means navigating between these views within 5 minutes does NOT re-fetch.

Similarly `study-signal-summary`, `rule-results`, `noael-summary` are shared across multiple views and deduplicated.

---

### Mount Payload Summary

| View | # Requests on Mount | Total Payload (raw) |
|------|--------------------:|--------------------:|
| Landing Page | 3–4 | < 10 KB |
| Study Summary | 4 | ~706 KB |
| Findings | 3 | ~2,630 KB |
| Dose-Response | 7 | ~5,852 KB |
| Histopathology | 5 | ~5,029 KB |
| NOAEL Determination | 7 | ~3,859 KB |
| Validation | 2 | ~20 KB |
| Domain Data | 1 | Variable |

After GZip (based on measured compression ratios), wire sizes are roughly 3–5% of raw.
