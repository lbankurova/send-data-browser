# Topic Hub: Data Pipeline & Findings Engine

**Last updated:** 2026-02-26
**Overall status:** Fully shipped. 6-phase generator (68s baseline), 12 domain modules, shared enrichment (`findings_pipeline.py`), 8 JSON view outputs, frontend transform chain. 20 pipeline test suites across backend and frontend.

---

## What Shipped

### Generator Orchestration (`generate.py`, 320 lines)

6-phase pipeline with parallel execution. Runs via `python -m generator.generate <study_id>`.

| Phase | What | Strategy |
|-------|------|----------|
| 1a Mortality | DS+DD domains → `early_death_subjects` | Sequential (must precede 1b) |
| 1b Domain stats | 12 domain modules → enriched findings | Sequential (heaviest phase, ~38s) |
| 1c–e Parallel | Subject context, tumor summary, food consumption | `ThreadPoolExecutor(3)` |
| 1f Cross-animal | Tissue battery, tumor linkage, recovery narratives | Sequential (depends on 1d) |
| 2 View DataFrames | 8 JSON view outputs from enriched findings | Sequential |
| 2b–5 Parallel | PK integration, rule evaluation, charts, unified findings | `ThreadPoolExecutor(4)` |

Outputs: 8 JSON files + 1 HTML chart to `backend/generated/{study_id}/`.

### Shared Enrichment Pipeline (`findings_pipeline.py`, 267 lines)

Three-step `process_findings()` shared by both generator (`domain_stats.py`) and live API (`unified_findings.py`):

1. **Attach scheduled stats** — merge Pass 2 (scheduled-only, early-death-excluded) into terminal domain + LB findings
2. **Attach separate stats** — merge Pass 3 (main-only, recovery-excluded) into in-life domain findings
3. **Enrich** — per-finding classification (severity, dose-response pattern, treatment-related), fold change, max incidence, organ system mapping, endpoint labels

Safe defaults via `_with_defaults()` ensure structurally valid findings even if enrichment raises per-finding.

### Domain Modules (12 files, 2,211 lines)

| Domain | File | Lines | Type | Grain |
|--------|------|-------|------|-------|
| LB | `findings_lb.py` | 185 | Continuous | test_code × sex × day |
| BW | `findings_bw.py` | 168 | Continuous | sex × day |
| OM | `findings_om.py` | 423 | Continuous | specimen × sex |
| MI | `findings_mi.py` | 201 | Incidence | specimen × finding × sex |
| MA | `findings_ma.py` | 168 | Incidence | specimen × finding × sex |
| CL | `findings_cl.py` | 142 | Incidence | finding × sex |
| DS | `findings_ds.py` | 160 | Incidence | disposition × sex |
| BG | `findings_bg.py` | 165 | Continuous | sex × interval |
| EG | `findings_eg.py` | 165 | Continuous | test_code × sex |
| VS | `findings_vs.py` | 165 | Continuous | test_code × sex |
| TF | `findings_tf.py` | 208 | Incidence | specimen × finding × sex |
| DD | `findings_dd.py` | 61 | Incidence | cause × sex |

**Terminal vs. in-life:** MI, MA, OM, TF, DS are terminal domains (dual-pass with early-death exclusion). BW, LB, CL, BG, EG, VS are in-life (recovery pooling eligible).

### Frontend Transform Chain (`useFindingsAnalyticsLocal.ts`, 217 lines)

Orchestrates the frontend derivation pipeline:

1. **Scheduled filter** — select `group_stats` or `scheduled_group_stats` based on toggle
2. **Effect size method** — apply stat method transform (JT/Williams'/Dunnett's)
3. **Multiplicity adjustment** — Holm–Bonferroni p-value correction
4. **Endpoint summaries** — `deriveEndpointSummaries()` from `derive-summaries.ts`
5. **Syndrome detection** — cross-domain + histopathology engine (→ TOPIC-syndrome-engine)
6. **Signal scoring** — `computeSignalScores()` from `signals-panel-engine.ts`

**Backend-authoritative:** severity, dose-response pattern, fold change, incidence, organ system.
**Frontend-derived:** endpoint summaries, syndrome detection, signal scores, confidence indices.

### Tests (7 pipeline integrity suites, ~83 test cases, 1,771 lines)

| File | Lines | Tests | Coverage |
|------|-------|-------|----------|
| `pipeline-trace.test.ts` | 284 | 1 | End-to-end pipeline verification |
| `derive-summaries.test.ts` | 206 | 14 | Endpoint summary derivation |
| `stat-method-transforms.test.ts` | 348 | 25 | Statistical method selection |
| `recovery-pooling.test.ts` | 563 | 28 | Recovery animal pooling toggle |
| `field-contract-sync.test.ts` | 196 | 8 | Backend → frontend field contracts |
| `finding-key-collision.test.ts` | 104 | 3 | Deterministic key uniqueness |
| `no-redundant-derivation.test.ts` | 70 | 4 | No frontend re-derivation of backend fields |

Additional pipeline test coverage in early-death-exclusion (41 tests), per-sex-phases (31 tests), recovery (62 tests), and mortality (5 tests) — see File Map.

### Key Commits

| Commit | Description |
|--------|-------------|
| `54493dd` | Extract `findings_pipeline.py`, unify enrichment across generator and API |
| `cdbe4b9` | Serve from pre-generated `unified_findings`, parallel generator phases |
| `40e7742` | Wire recovery pooling toggle through full pipeline (Bug #30) |
| `1fe2f44` | Eliminate frontend re-derivation of backend-computed fields |
| `5e38b26` | Scheduled-only toggle propagates through entire analytics pipeline |
| `58dd8a2` | Populate DAY values for MI, MA, OM, CL, TF, DS domain findings |

---

## What's NOT Shipped (spec vs. reality)

### Deferred by design

| Item | Reason |
|------|--------|
| **Multi-study pipeline** | Single study only. Generator runs per study_id; no cross-study aggregation. |
| **Incremental recomputation** | Full re-runs on every generate. No content-hash caching. |
| **FW domain module** | No `findings_fw.py`. Food consumption uses raw XPT in `food_consumption_summary.py` instead of findings pipeline. |
| **BG/EG/VS not in on-demand pipeline** | Generator computes these 3 domains; `unified_findings.py` only serves LB/BW/OM/MI/MA/CL/DS/TF/DD. |
| **Datagrok DataFrame integration** | All outputs are JSON; no DataFrame wire format for Datagrok migration. |

### Minor gaps

| Item | Status |
|------|--------|
| Phase timing only in console output | Documented in this hub; no structured timing output file. |
| Signal scoring formula only in code | `signals-panel-engine.ts` — referenced but not reproduced in `data-pipeline.md`. |

---

## Roadmap

### Near-term
- Add BG/EG/VS to the on-demand pipeline (`unified_findings.py`) for Adverse Effects view coverage.

### Medium-term
- Multi-study support (cross-study dose normalization, shared control groups).
- Incremental recomputation with content-hash caching to avoid full re-runs.

### Long-term
- Datagrok DataFrame wire format (pending migration timeline).
- FW findings module to bring food consumption into the standard findings pipeline.

---

## File Map

### Specifications (historical)

| File | Role | Status |
|------|------|--------|
| `docs/systems/data-pipeline.md` | Authoritative system spec (1,243 lines) | IMPLEMENTED — architecture accurate, `findings_pipeline.py` and phase timing documented here |
| `docs/incoming/arch-overhaul/multi-domain-integration-spec.md` | Multi-domain data pipeline spec (1,553 lines) | IMPLEMENTED |
| `docs/incoming/arch-overhaul/recovery-validation-spec.md` | Recovery animal validation spec (239 lines) | IMPLEMENTED |
| `docs/incoming/arch-overhaul/arch-redesign-final.md` | Architecture redesign plan (587 lines) | IMPLEMENTED |

### Knowledge docs

| File | Entry | Current? |
|------|-------|----------|
| `docs/knowledge/methods-index.md` | Pipeline methods (stat tests, classification, fold change) | Yes |
| `docs/knowledge/methods.md` | Full method definitions | Yes |
| `docs/knowledge/field-contracts-index.md` | Backend → frontend field contract index | Yes |
| `docs/knowledge/field-contracts.md` | Full field contract definitions | Yes |

### System specs

| File | Pipeline sections | Current? |
|------|-------------------|----------|
| `docs/systems/data-pipeline.md` | All — authoritative pipeline architecture | Yes |
| `docs/systems/insights-engine.md` | Signal scoring formula, rule integration | Yes |

### Implementation (code)

#### Backend — pipeline orchestration (8 files, 1,952 lines)

| File | Lines | Role |
|------|-------|------|
| `backend/generator/generate.py` | 320 | CLI entry, 6-phase orchestration |
| `backend/generator/domain_stats.py` | 383 | Pass 1/2/3 domain finding collection |
| `backend/services/analysis/findings_pipeline.py` | 267 | Shared enrichment (3-step `process_findings`) |
| `backend/services/analysis/unified_findings.py` | 240 | On-demand adverse effects API pipeline |
| `backend/services/analysis/dose_groups.py` | 255 | Dose group mapping, subject classification |
| `backend/services/analysis/phase_filter.py` | 170 | Recovery/main phase detection, last dosing day |
| `backend/generator/organ_map.py` | 57 | Specimen → organ system mapping |
| `backend/services/xpt_processor.py` | 260 | XPT file loading and DataFrame construction |

#### Backend — domain modules (12 files, 2,211 lines)

| File | Lines | Domain |
|------|-------|--------|
| `findings_lb.py` | 185 | Laboratory |
| `findings_bw.py` | 168 | Body Weight |
| `findings_om.py` | 423 | Organ Measurements — *also in TOPIC-organ-measurements* |
| `findings_mi.py` | 201 | Microscopic |
| `findings_ma.py` | 168 | Macroscopic |
| `findings_cl.py` | 142 | Clinical Observations — *also in TOPIC-syndrome-engine* |
| `findings_ds.py` | 160 | Disposition |
| `findings_bg.py` | 165 | Body Weight Gain |
| `findings_eg.py` | 165 | ECG |
| `findings_vs.py` | 165 | Vital Signs |
| `findings_tf.py` | 208 | Tumor Findings |
| `findings_dd.py` | 61 | Death Diagnosis |

All files at `backend/services/analysis/`.

#### Backend — statistics & classification (9 files, 2,774 lines)

| File | Lines | Role |
|------|-------|------|
| `statistics.py` | 283 | Pairwise tests (Dunnett's, Fisher's, JT) |
| `classification.py` | 295 | Severity, dose-response pattern, treatment-related |
| `normalization.py` | 241 | OM normalization decisions — *also in TOPIC-organ-measurements* |
| `williams.py` | 439 | Williams' trend test — *also in TOPIC-organ-measurements* |
| `ancova.py` | 283 | ANCOVA decomposition — *also in TOPIC-organ-measurements* |
| `mortality.py` | 270 | Early death detection, mortality summary |
| `correlations.py` | 141 | Cross-finding correlation computation |
| `insights.py` | 523 | Signal scoring, insight rule evaluation |
| `context_panes.py` | 299 | Per-finding context pane data assembly |

All files at `backend/services/analysis/`.

#### Backend — view assembly & generators (7 files, 3,926 lines)

| File | Lines | Role |
|------|-------|------|
| `view_dataframes.py` | 587 | 8 view-specific JSON builders |
| `scores_and_rules.py` | 394 | Rule evaluation engine (R01–R17) |
| `cross_animal_flags.py` | 852 | Tissue battery, tumor linkage, recovery narratives |
| `tumor_summary.py` | 312 | Tumor type summary with progression detection |
| `food_consumption_summary.py` | 825 | Food/water consumption with efficiency ratios |
| `pk_integration.py` | 883 | TK/PK integration, HED computation |
| `static_charts.py` | 73 | HTML chart generation |

All files at `backend/generator/`.

#### Frontend — types & loading (3 files, 562 lines)

| File | Lines | Role |
|------|-------|------|
| `src/types/analysis.ts` | 328 | TypeScript types for all analysis data |
| `src/hooks/useFindings.ts` | 17 | React Query hook for findings fetch |
| `src/hooks/useFindingsAnalyticsLocal.ts` | 217 | Pipeline orchestration — *also in TOPIC-syndrome-engine* |

#### Frontend — derivation layer (6 files, 2,888 lines)

| File | Lines | Role |
|------|-------|------|
| `src/lib/derive-summaries.ts` | 632 | Endpoint summary derivation from raw findings |
| `src/lib/stat-method-transforms.ts` | 226 | Stat method selection (JT/Williams'/Dunnett's) |
| `src/lib/findings-rail-engine.ts` | 446 | Rail card computation from endpoint summaries |
| `src/lib/signals-panel-engine.ts` | 664 | Signal scoring, signals panel data assembly |
| `src/lib/endpoint-confidence.ts` | 902 | Endpoint Confidence Index — *also in TOPIC-organ-measurements* |
| `src/lib/send-constants.ts` | 18 | SEND domain constants |

#### Backend — tests (9 files, 1,838 lines)

| File | Lines | Coverage |
|------|-------|----------|
| `test_domain_findings.py` | 197 | Domain module output structure |
| `test_early_death_exclusion.py` | 373 | Dual-pass terminal stats with early death |
| `test_mortality.py` | 209 | DS/DD mortality pipeline |
| `test_supp_qualifiers.py` | 172 | SUPP* domain qualifier attachment |
| `test_tk_detection.py` | 118 | TK satellite subject detection |
| `test_cross_animal_flags.py` | 184 | Tissue battery, tumor linkage flags |
| `test_food_efficiency.py` | 137 | Food efficiency ratio computation |
| `test_pk_integration.py` | 239 | PK/TK integration, HED |
| `test_tumor_integration.py` | 209 | Tumor summary with progression |

All files at `backend/tests/`.

#### Frontend — tests (11 files, 3,747 lines)

| File | Lines | Tests | Coverage |
|------|-------|-------|----------|
| `pipeline-trace.test.ts` | 284 | 1 | End-to-end pipeline trace |
| `derive-summaries.test.ts` | 206 | 14 | Endpoint summary derivation |
| `stat-method-transforms.test.ts` | 348 | 25 | Stat method selection |
| `recovery-pooling.test.ts` | 563 | 28 | Recovery pooling toggle |
| `recovery.test.ts` | 764 | 62 | Recovery phase logic |
| `field-contract-sync.test.ts` | 196 | 8 | Field contract compliance |
| `finding-key-collision.test.ts` | 104 | 3 | Key uniqueness |
| `no-redundant-derivation.test.ts` | 70 | 4 | No re-derivation |
| `early-death-exclusion.test.ts` | 629 | 41 | Early death exclusion |
| `per-sex-phases.test.ts` | 462 | 31 | Per-sex phase detection |
| `mortality.test.ts` | 121 | 5 | Mortality logic |

All files at `frontend/tests/`.

### Totals

| Scope | Files | Lines |
|-------|-------|-------|
| Backend code | 36 | 10,863 |
| Frontend code | 9 | 3,450 |
| Backend tests | 9 | 1,838 |
| Frontend tests | 11 | 3,747 |
| **Grand total** | **65** | **19,898** |

*Includes 6 shared files also listed in TOPIC-organ-measurements or TOPIC-syndrome-engine (marked with italics above). Excluding shared files: ~59 pipeline-owned files, ~17,495 lines.*
