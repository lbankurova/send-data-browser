# External Integrations & Data Flow

## CDISC SEND Data Processing

### Input Format
- SAS Transport (.xpt) files in `send/{study_id}/`
- 16 study folders, ~437 .xpt files total
- Study ID = folder name

### Processing Pipeline (`backend/services/xpt_processor.py`)
1. `discover_studies()` — scans `/send` folder → StudyInfo dict with domain→path mapping
2. `read_xpt()` — parses binary XPT via `pyreadstat.read_xport()`, returns pandas DataFrame
3. `ensure_cached()` — XPT → CSV conversion cached in `backend/cache/{study_id}/{domain}.csv`
4. Encoding fallback: UTF-8 → cp1252 → iso-8859-1
5. `extract_full_ts_metadata()` — builds StudyMetadata from TS domain TSPARMCD/TSVAL pairs

### Domains Processed
Full SEND domain set: DM, EX, LB, MI, OM, BW, MA, CL, FW, VS, TF, BG + SUPP* qualifiers

## SQLite Historical Control Database

- **Path**: `backend/data/hcd.db` (9.7 MB)
- **Source**: NTP Integrated Animal Data (IAD) organ weight records
- **ETL**: `backend/etl/hcd_etl.py`
- **Access**: `backend/services/analysis/hcd_database.py`
- **Purpose**: Contextualize findings against historical ranges
- **Query**: Lookup by species, strain, organ, sex, control group

## CDISC CORE Validation

- **Runner**: `backend/validation/core_runner.py`
- **Scope**: 400+ conformance rules (CDISC standard checks)
- **Output**: ValidationResults with affected records + evidence
- **Integration**: `backend/validation/engine.py` — runs both CDISC CORE + 14 custom rules

### Custom Validation Rules (14 YAML-based)
- **Study Design** (SD-001 to SD-007): Orphans, empty arms, control status, epochs, subjects, dose-response, TK
- **FDA Data Quality** (FDA-001 to FDA-007): Missing fields, cross-domain consistency, value ranges, derived fields
- **Format**: YAML in `backend/validation/rules/`, handlers in `backend/validation/checks/`
- **Evidence**: Per-record source data + suggested fixes, 3 fix tiers (critical, major, minor)

## Statistical Analysis Pipeline (`backend/services/analysis/`)

| Method | Purpose |
|--------|---------|
| Dunnett's test | Pairwise group vs. control (FWER-controlled) |
| Williams' test | Monotone dose-response via isotonic regression |
| Fisher's exact | Incidence data (histopath, clinical signs) |
| Jonckheere-Terpstra | Continuous trend test |
| Cochran-Armitage | Binary trend test |
| ANCOVA | Organ weight normalization by body weight |

### Classification (`backend/services/analysis/classification.py`)
- Effect size grading (low, medium, high)
- Fold change categorization (>1.5x, >2x, >3x)
- Dose-response characterization (monotone, biphasic, plateau)

## Data Generation Pipeline (`backend/generator/generate.py`)

1. Load all domains via XPT processor
2. Run 12 domain-specific findings modules (BG, BW, LB, MI, etc.)
3. Unify findings via `findings_pipeline.py`
4. Apply 8 analysis settings transforms via `parameterized_pipeline.py`:
   - scheduled_only, recovery_pooling, effect_size, multiplicity
   - pairwise_test, trend_test, organ_weight_method, adversity_threshold
5. Output 8 JSON files + 1 HTML chart to `backend/generated/{study_id}/`

### Output Views
- study-signal-summary, target-organ-summary, dose-response-metrics
- organ-evidence-detail, lesion-severity-summary, adverse-effect-summary
- noael-summary, rule-results

## Frontend ↔ Backend Data Flow

### API Layer
- 23 REST endpoints under `/api`
- Frontend hooks in `frontend/src/hooks/` fetch via TanStack React Query
- Query keys enable caching and automatic invalidation
- Proxy: Vite dev server forwards `/api` → FastAPI on port 8000

### Type Safety
- **Backend**: Pydantic models in `backend/models/schemas.py`
- **Frontend**: TypeScript types in `frontend/src/types/*.ts`
- **OpenAPI**: Auto-generated schema at `/docs`

## Frontend Analysis Engines

### Syndrome Detection (2 engines, ~1,500 lines)
- `frontend/src/lib/cross-domain-syndromes.ts` — 9 rules (XS01–XS09), inputs from LB/BW/MI/MA/OM/CL
- `frontend/src/lib/syndrome-rules.ts` — 14 histopath-specific rules, input: organ → LesionSeverityRow[]

### Signal & Confidence Scoring
- `frontend/src/lib/signals-panel-engine.ts` — panel-level aggregation
- `frontend/src/lib/endpoint-confidence.ts` — per-endpoint confidence scoring
- `frontend/src/lib/recovery-classification.ts` — 6 recovery categories

## Authentication & Security

- **CORS**: Allow all origins/methods/headers (internal development tool)
- **Authentication**: None implemented
- **SSL/TLS**: Not configured (HTTP only)
