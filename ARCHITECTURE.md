# Architecture

## Pipeline

The generator entry point (`backend/generator/generate.py`) orchestrates the full pipeline, producing 19 JSON files + 1 HTML chart per study to `backend/generated/{study_id}/`. Three stages:

1. **Domain extraction** — 12 domain-specific findings modules in `backend/services/analysis/` (`findings_bg.py` through `findings_vs.py`) parse raw SEND domains and compute per-endpoint statistics
2. **Orchestration** — `findings_pipeline.py` merges domains, computes fold change, applies classification labels
3. **View assembly** — `generator/` modules (11 files) reshape findings into view-specific JSON; `ParameterizedAnalysisPipeline` produces the final outputs

## Statistical methods

| Method | Module | Purpose |
|---|---|---|
| Dunnett's test | `statistics.py` | Pairwise group comparisons vs. control (FWER-controlled) |
| Williams' test | `williams.py` | Monotone dose-response detection via isotonic regression |
| Fisher's exact | `statistics.py` | Incidence data (histopath, clinical signs) |
| Trend tests | `statistics.py` | Jonckheere-Terpstra (continuous) and Cochran-Armitage (binary) |
| ANCOVA | `ancova.py` | Organ weight normalization by body weight |

## Classification engine

`classification.py` (733 lines) — effect size grading, fold change categorization, dose-response characterization.

`adaptive_trees.py` (740 lines) — decision trees implementing ECETOC assessment tiers for adversity determination.

`progression_chains.py` (370 lines) — cross-organ progression chain detection (e.g., hepatocellular hypertrophy → necrosis → enzyme elevation).

## Historical control database

SQLite database built from NTP Integrated Animal Data (IAD) organ weight records via `etl/hcd_etl.py`. Queried at analysis time by `hcd_database.py` to contextualize findings against historical ranges.

## Frontend intelligence engines

~5,700 lines in `frontend/src/lib/`:

**Syndrome detection**

| Module | Scope |
|---|---|
| `cross-domain-syndromes.ts` | 33 syndromes (XS01–XS10 organ-focused + XC01a–XC12c extended) spanning clinical path, histopath, organ weights |
| `syndrome-rules.ts` | 14 histopathology-specific syndrome rules |

**Scoring and characterization**

| Module | Purpose |
|---|---|
| `signals-panel-engine.ts` | Signal scoring, panel-level aggregation |
| `endpoint-confidence.ts` | Per-endpoint confidence scoring |
| `organ-weight-normalization.ts` | ANCOVA-based organ weight adjustment |

**Recovery and reversibility**

| Module | Purpose |
|---|---|
| `recovery-classification.ts` | 6 recovery categories + confidence model |
| `protective-signal.ts` | Beneficial/protective effect detection |

**Synthesis and narrative**

| Module | Purpose |
|---|---|
| `rule-synthesis.ts` | Cross-view rule aggregation |
| `noael-narrative.ts` | Automated NOAEL rationale generation |

## Validation

Dual-engine architecture:

- **CDISC CORE** — 400+ standard conformance rules
- **Custom rules** — 14 YAML-defined rules: 7 study design checks (SD-001 through SD-007), 7 FDA data quality checks (FDA-001 through FDA-007)

Both engines feed a unified triage UI. Each flagged record renders with inline evidence showing the source data, rule logic, and suggested resolution.
