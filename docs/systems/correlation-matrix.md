# Correlation Matrix System

## Purpose

Within-organ endpoint correlation analysis. Shows pairwise Spearman correlations between continuous endpoints in the same organ system, answering: "Is this organ's response tightly coupled (single mechanism) or multi-pathway (several independent mechanisms)?"

## Architecture

### Computation pipeline

```
unified_findings (precomputed)
  → correlations.py::compute_correlations()     # Spearman on residualized individual animal values
  → unified_findings.json → correlations[]       # Stored at generation time
  → context_panes.py::build_organ_correlation_matrix()  # Reshape into NxN lower-triangle matrix
  → API response → CorrelationMatrixPane         # Frontend renders heatmap
```

### Residualization

Correlations are computed on **residualized** values: each animal's measurement minus its (dose_level, sex) group mean. This removes dose-driven trends so the correlation reflects biological co-variation, not shared dose response. Two endpoints can both be treatment-related (convergent) while having low within-group correlation (multi-pathway).

### Derived endpoint exclusion

Calculated endpoints (ratios, indices) are excluded from correlation computation because they create tautological correlations with their source components:

| Test code | Derived from | Organ system |
|-----------|-------------|--------------|
| ALBGLOB | ALB, GLOB | hepatic |
| MCH | HGB, RBC | hematologic |
| MCHC | HGB, HCT | hematologic |
| MCV | HCT, RBC | hematologic |

The `derived` flag lives in `BIOMARKER_MAP` (`send_knowledge.py`). The `is_derived` field is stamped on findings during enrichment (`findings_pipeline.py::_enrich_finding()`). Consumers filter on it:
- `correlations.py` — excludes from pairing
- `view_dataframes.py::build_noael_summary()` — excludes from NOAEL/LOAEL determination
- `findings-charts.ts::prepareQuadrantPoints()` — excludes from volcano percentile ranking

## Key files

| File | Role |
|------|------|
| `backend/services/analysis/correlations.py` | Computes Spearman correlations on residualized individual animal data |
| `backend/services/analysis/context_panes.py` | `build_organ_correlation_matrix()` reshapes flat list into NxN matrix; `_correlation_gloss()` produces 2x2 interpretive text |
| `backend/routers/analyses.py` | API endpoint: `GET /api/studies/{id}/analyses/adverse-effects/organ/{key}/correlations` |
| `backend/models/analysis_schemas.py` | `OrganCorrelationMatrix`, `OrganCorrelationSummary` Pydantic models |
| `frontend/src/hooks/useOrganCorrelations.ts` | React Query hook (5-min stale cache) |
| `frontend/src/components/analysis/panes/CorrelationMatrixPane.tsx` | Lower-triangle heatmap, summary, legend, gloss |
| `frontend/src/components/analysis/panes/OrganContextPanel.tsx` | Integration point — CollapsiblePane after Convergence |
| `frontend/src/lib/analysis-api.ts` | `fetchOrganCorrelations()` |

## Coherence labels

Based on median |rho| across all within-organ pairs:

| Threshold | Label | Interpretation |
|-----------|-------|----------------|
| med >= 0.7 | Tightly coupled | Endpoints move together — single-mechanism injury |
| med >= 0.4 | Partially coupled | Moderate co-variation |
| med < 0.4 | Multi-pathway | Endpoints respond independently — several injury mechanisms |
| < 2 pairs | Insufficient data | Not enough endpoints for analysis |

## Convergence-aware gloss (2x2)

When convergence strength and correlation coupling diverge, an interpretive sentence is shown below the matrix:

| | Tightly coupled | Multi-pathway |
|---|---|---|
| **>=3 domains** | "Tightly coupled response across N domains — consistent with single-mechanism organ injury." | "Multiple domains confirm organ effects. Multi-pathway response pattern — several injury mechanisms acting simultaneously." |
| **<=1 domain** | "Endpoints co-vary strongly despite limited domain coverage — possible subclinical coordinated response." | *(no gloss)* |

Middle band (Partially coupled) and 2-domain convergence produce no gloss.

## Constraints

- Max 30 correlation pairs per organ system (prevents hematologic from crowding others)
- Minimum 10 common animals across both endpoints for a valid correlation
- Individual-basis correlations only (not group-level)
- One endpoint = one organ system (no multi-membership)
- Organ system assignment comes from backend `ORGAN_SYSTEM_MAP` / `BIOMARKER_MAP` — the matrix builder does not re-derive it
