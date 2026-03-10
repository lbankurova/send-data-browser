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

## Syndrome validation

### Purpose

Cross-organ endpoint correlation for syndrome validation. Shows pairwise Spearman correlations among a syndrome's continuous member endpoints (regardless of organ boundaries), answering: "Is this syndrome statistically supported in this study, or just rule-matched?"

### Architecture

```
SyndromeContextPanel (frontend detects syndrome, knows matched endpoints)
  → useSyndromeCorrelations() filters MI/MA as incidence_data
  → POST /api/.../syndrome-correlations { endpoint_labels, syndrome_id }
  → correlations.py::compute_syndrome_correlations()    # Same residualization math
  → context_panes.py::build_syndrome_correlation_summary()  # NxN matrix + validation labels
  → adapter in hook maps response → OrganCorrelationMatrix format
  → CorrelationMatrixPane (reused, unmodified)
```

### Differences from organ matrix

| Aspect | Organ matrix | Syndrome validation |
|--------|-------------|-------------------|
| Scope | Within one organ system | Across organ boundaries |
| Timing | Precomputed at generation | Lazy (on-request via POST) |
| Endpoint selection | All continuous in organ | Named syndrome members only |
| Max pairs cap | 30 per organ | None (syndrome sets are small) |
| Vocabulary | "Tightly coupled" / "Multi-pathway" | "Strong co-variation" / "Weak co-variation" |
| Thresholds | 0.7 / 0.4 | 0.7 / 0.4 (aligned to prevent contradictory labels) |
| Gloss trigger | Convergence × coupling divergence | Extremes only (strong / weak) |

### Validation labels

| Threshold | Label | Gloss |
|-----------|-------|-------|
| median \|rho\| >= 0.7 | Strong co-variation | "Pattern members co-vary biologically — syndrome is statistically supported beyond rule-matching." |
| median \|rho\| >= 0.4 | Moderate co-variation | *(none)* |
| median \|rho\| < 0.4 | Weak co-variation | "Low pairwise correlation among members — pattern may reflect coincidental co-occurrence rather than shared mechanism." |
| < 2 pairs | Insufficient data | *(none)* |

### Key files

| File | Role |
|------|------|
| `backend/services/analysis/correlations.py` | `compute_syndrome_correlations()` — cross-organ pairwise Spearman on named endpoints |
| `backend/services/analysis/context_panes.py` | `build_syndrome_correlation_summary()` — NxN matrix reshape + validation labels |
| `backend/routers/analyses.py` | `POST /api/studies/{id}/analyses/adverse-effects/syndrome-correlations` |
| `backend/models/analysis_schemas.py` | `SyndromeCorrelationRequest`, `SyndromeCorrelationResult`, `ExcludedMember`, `SyndromeCorrelationSummary` |
| `frontend/src/hooks/useSyndromeCorrelations.ts` | React Query hook with MI/MA filtering + adapter to OrganCorrelationMatrix |
| `frontend/src/components/analysis/panes/SyndromeCorrelationPane.tsx` | Wrapper: CorrelationMatrixPane + excluded members list |
| `frontend/src/components/analysis/panes/SyndromeContextPanel.tsx` | Integration — CollapsiblePane after Evidence, before Dose-response |

### Shared internals

Both organ matrix and syndrome validation reuse `_endpoint_key()`, `_subject_residuals()`, `_residualized_correlation()` from `correlations.py` and `CorrelationMatrixPane.tsx` on the frontend. The adapter in `useSyndromeCorrelations` maps `validation_label` → `coherence_label` so the pane renders without modification.

## Constraints

- Max 30 correlation pairs per organ system (prevents hematologic from crowding others)
- Minimum 10 common animals across both endpoints for a valid correlation
- Individual-basis correlations only (not group-level)
- One endpoint = one organ system (no multi-membership)
- Organ system assignment comes from backend `ORGAN_SYSTEM_MAP` / `BIOMARKER_MAP` — the matrix builder does not re-derive it
