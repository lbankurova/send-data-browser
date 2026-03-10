# Organ System Correlation Matrix

## What this does

Adds a correlation matrix pane to the OrganContextPanel, showing pairwise Spearman correlations between all continuous endpoints within the selected organ system. Answers: "Is this organ's response coherent or multi-pathway?"

## User workflow

1. User clicks an organ group header in the Findings Rail (e.g., "Hepatic")
2. OrganContextPanel opens in the context panel
3. New "Endpoint correlations" collapsible pane appears (between "Convergence" and "Organ NOAEL")
4. Shows a lower-triangle matrix heatmap: rows and columns are the organ's continuous endpoints
5. Cell color = neutral grayscale heat mapped to |rho|
6. Hover on cell → tooltip with rho, n, p-value, direction glyph
7. Click a cell → selects the row endpoint (left axis) in the rail (navigates to endpoint context)
8. If organ has < 3 continuous endpoints with correlations, show a simple text summary instead of matrix

## Data model

### Input data

**Already precomputed** in `unified_findings.json` → `correlations[]` array. Each entry:

```json
{
  "endpoint_key_1": "LB_MCH_92",
  "endpoint_key_2": "LB_MCV_92",
  "endpoint_label_1": "Ery. Mean Corpuscular Hemoglobin",
  "endpoint_label_2": "Ery. Mean Corpuscular Volume",
  "finding_ids_1": ["1434917ca2bd", "121a7c2717b2"],
  "finding_ids_2": ["dc30da4d635a", "43a5600244cd"],
  "domain_1": "LB",
  "domain_2": "LB",
  "organ_system": "hematologic",
  "rho": 0.9151,
  "p_value": 0.0,
  "n": 77,
  "basis": "individual"
}
```

No new backend computation needed — reshape existing data.

### New API endpoint

```
GET /api/studies/{study_id}/analyses/adverse-effects/organ/{organ_key}/correlations
```

Query params: same `settings` params as other endpoints (stat_method, alpha, effect_size_method, last_dosing_day).

Response schema:

```python
class OrganCorrelationMatrix(BaseModel):
    organ_system: str
    endpoints: list[str]                    # ordered endpoint labels (axis labels)
    endpoint_domains: list[str]             # domain code per endpoint (for DomainLabel)
    matrix: list[list[float | None]]        # lower triangle: matrix[i][j] = rho for i > j, None for i <= j
    p_values: list[list[float | None]]      # same shape, p-values
    n_values: list[list[int | None]]        # same shape, n counts
    endpoint_finding_ids: list[list[str]]   # finding_ids per endpoint (for navigation)
    total_pairs: int                        # how many pairs were computed
    summary: OrganCorrelationSummary

class OrganCorrelationSummary(BaseModel):
    median_abs_rho: float                   # median |rho| across all pairs
    strong_pairs: int                       # count of |rho| >= 0.7
    total_pairs: int
    coherence_label: str                    # "Tightly coupled", "Partially coupled", "Multi-pathway", "Insufficient data"
    gloss: str | None = None                # interpretive sentence when convergence and correlation diverge (2×2 logic)
```

### Backend assembly function

New function in `context_panes.py`:

```python
def build_organ_correlation_matrix(organ_key: str, correlations: list[dict]) -> dict:
    """Build correlation matrix for an organ system from precomputed correlations."""
```

Steps:
1. Filter `correlations` by `organ_system == organ_key`
2. Collect unique endpoint labels from `endpoint_label_1` and `endpoint_label_2`
3. Sort endpoints by domain (alphabetical), then alphabetically within domain — so LB hematology endpoints group together rather than scattering across the axis by name. This makes the matrix's cluster structure visually readable.
4. Build NxN lower-triangle matrices for rho, p_value, n
5. Compute summary stats (median |rho|, strong pair count, coherence label)
6. Return serialized matrix

### Frontend data flow

```
OrganContextPanel
  → useOrganCorrelations(studyId, organKey)  // new hook
    → GET /api/.../organ/{organKey}/correlations
    → returns { endpoints, matrix, p_values, n_values, summary, ... }
  → <CorrelationMatrixPane data={...} onCellClick={handleCellClick} />
```

## UI specification

### Placement

In `OrganContextPanel.tsx`, as a new CollapsiblePane:
- **Position:** After Convergence pane, before Organ Weight Normalization
- **Title:** "Endpoint correlations"
- **defaultOpen:** `true` (this is high-value information)
- **Badge:** summary coherence label (e.g., "Tightly coupled") as `headerRight`

### Matrix layout

Use `<table>` (not CSS Grid — matrix is small, typically 3-8 endpoints):

```
        EP1   EP2   EP3   EP4   EP5
EP1      ·
EP2    [rho]   ·
EP3    [rho] [rho]   ·
EP4    [rho] [rho] [rho]   ·
EP5    [rho] [rho] [rho] [rho]   ·
```

- **Lower triangle only** — upper triangle and diagonal are empty (show `·` or leave blank)
- **Row/column headers:** Endpoint label, truncated with tooltip. Prefix with `DomainLabel` component (2-letter domain code)
- **Cell size:** Fixed ~36×28px cells to keep matrix compact
- **Column headers:** 90° vertical text. At 45° with 6-8 endpoints the headers overflow into each other at 36px cell width. Vertical text is more compact and works better with truncation.

### Cell rendering

- **Background:** `getNeutralHeatColor(absRho)` — maps |rho| (0-1) to 5-step grayscale ramp
- **Text:** Show rho value (`±0.XX`) in cell, using `text` color from `getNeutralHeatColor()`
- **Font:** `text-[9px] font-mono` (must fit in small cells)
- **Border:** `1px solid rgba(0,0,0,0.05)` (subtle grid lines)
- **Direction glyph:** None in cell (too small) — shown in tooltip

### Hover / tooltip

Native `title` attribute (intercepted by GlobalTooltip):
```
ALT ↔ AST
ρ = 0.82 (↑↑)
n = 77 animals
p < 0.001
```

### Click interaction

Click a matrix cell → navigate to the row endpoint (left axis):
- Calls `handleEndpointClick(rowEndpointLabel)` (already exists in OrganContextPanel)
- Always navigates to the row endpoint — avoids needing signal scores in the matrix response

### Summary text

Below the matrix, show:
```
{strong_pairs} of {total_pairs} pairs strongly correlated (|ρ| ≥ 0.7). Median |ρ| = {median_abs_rho}.
```

### Fallback states

- **< 3 continuous endpoints with correlations:** Show text summary instead of matrix: "2 continuous endpoints — {endpointA} ↔ {endpointB}: ρ = {rho}" (single-line)
- **< 2 continuous endpoints:** "Insufficient continuous endpoints for correlation analysis"
- **No individual-level data:** "Correlations require individual animal data (not available)"
- **Loading:** Skeleton shimmer matching matrix dimensions

### Color scale legend

Small inline legend below matrix (only if matrix has 3+ endpoints):
```
|ρ|:  [  ] 0   [  ] 0.2   [  ] 0.4   [  ] 0.6   [  ] 0.8+
```
Using `getNeutralHeatColor()` for each swatch.

## Integration points

- **`backend/services/analysis/context_panes.py`** — new `build_organ_correlation_matrix()` function
- **`backend/routers/analyses.py`** — new API endpoint
- **`backend/models/analysis_schemas.py`** — new `OrganCorrelationMatrix` and `OrganCorrelationSummary` schemas
- **`frontend/src/components/analysis/panes/OrganContextPanel.tsx`** — add pane
- **`frontend/src/components/analysis/panes/CorrelationMatrixPane.tsx`** — new component
- **`frontend/src/hooks/useOrganCorrelations.ts`** — new React Query hook
- **`frontend/src/lib/severity-colors.ts`** — reuse `getNeutralHeatColor()` (no changes)
- **`docs/systems/`** — create or update correlation system doc

## Implementation plan

### Phase 1: Derived endpoint flag (data quality foundation)

**Step 1.1: Add `derived` field to BIOMARKER_MAP** (`backend/services/analysis/send_knowledge.py`)
- Add `"derived": True, "source_tests": [...]` to calculated endpoints:
  - `ALBGLOB` → derived from ALB, GLOB
  - `MCH` → derived from HGB, RBC
  - `MCHC` → derived from HGB, HCT
  - `MCV` → derived from HCT, RBC
- Non-derived entries get no `derived` key (falsy default)
- Future: BW gain and organ-to-BW ratios would use the same pattern

**Step 1.2: Stamp `is_derived` in enrichment** (`backend/services/analysis/findings_pipeline.py`)
- In `_enrich_finding()`, after organ system assignment, look up test_code in BIOMARKER_MAP
- Stamp `f["is_derived"] = True` when the map entry has `derived: True`
- Default to `False` when not in map or no `derived` key

**Step 1.3: Filter derived endpoints in correlation engine** (`backend/services/analysis/correlations.py`)
- In `compute_correlations()`, skip findings where `is_derived` is True
- This removes tautological pairs (ALBGLOB↔GLOB, MCH↔HGB, etc.) from all organs systematically

### Phase 2: Coherence label vocabulary + 2×2 gloss

**Step 2.1: Update coherence labels** (`backend/services/analysis/context_panes.py`)
- Replace label vocabulary in `build_organ_correlation_matrix()`:
  - `med >= 0.7` → "Tightly coupled" (was "Highly coherent")
  - `med >= 0.4` → "Partially coupled" (was "Moderately coherent")
  - `med < 0.4` → "Multi-pathway" (was "Fragmented")
  - `total < 2` → "Insufficient data" (unchanged)

**Step 2.2: Add convergence-aware interpretive gloss** (`backend/services/analysis/context_panes.py`)
- Add `gloss: str | None` to the summary output
- The gloss is a 2×2 matrix keyed on (convergence_domain_count, coherence_label):

| | Tightly coupled (med |ρ| ≥ 0.7) | Multi-pathway (med |ρ| < 0.4) |
|---|---|---|
| **≥3 domains** | Tightly coupled response across N domains — consistent with single-mechanism organ injury. | Multiple domains confirm organ effects. Multi-pathway response pattern — several injury mechanisms acting simultaneously. |
| **≤1 domain** | Endpoints co-vary strongly despite limited domain coverage — possible subclinical coordinated response. | *(null — nothing notable)* |

- Middle band (0.4–0.7) and 2-domain convergence: no gloss (unremarkable)
- The matrix builder needs the domain count as a new parameter (passed from the API endpoint)

**Step 2.3: Pass convergence domain count to matrix builder**
- API endpoint extracts domain count from findings (count unique domains with adverse/warning findings for this organ)
- Pass to `build_organ_correlation_matrix()` as `convergence_domain_count`

### Phase 3: Frontend label + gloss updates

**Step 3.1: Update coherence label display** (`OrganContextPanel.tsx`)
- No code change needed if label comes from backend (already renders `corrMatrix.summary.coherence_label`)

**Step 3.2: Render gloss text** (`CorrelationMatrixPane.tsx`)
- If `summary.gloss` is non-null, render it below the summary stats line
- Style: `text-xs leading-relaxed text-foreground/80` (matches convergence interpretation text)

**Step 3.3: Update TypeScript types** (`frontend/src/types/analysis.ts`)
- Add `gloss: string | null` to `OrganCorrelationSummary`

### Phase 4: Polish (unchanged from original)

**Step 4.1: Vertical column headers**
- CSS `writing-mode: vertical-rl` + `transform: rotate(180deg)` for 90° vertical text
- Truncate with `max-height` + `overflow: hidden` on header cells
- Tooltip on truncated labels via native `title` attribute

**Step 4.2: Loading state**
- Skeleton shimmer while hook fetches

**Step 4.3: Edge cases**
- Handle organs with 0-2 continuous endpoints gracefully
- Handle missing correlation data (no raw_subject_values)

### Follow-on items (not this feature scope — log to TODO.md)

- Audit volcano plot percentile ranking for derived-endpoint contamination
- Audit NOAEL weight logic for derived-endpoint influence
- Add `derived` flag for BW gain endpoints when BW gain is generated as a separate finding
- Add `derived` flag for organ-to-body-weight ratios if/when they enter the findings pipeline

## Acceptance criteria

- When clicking an organ group header, the OrganContextPanel shows an "Endpoint correlations" pane
- The matrix displays all within-organ continuous endpoint pairs as a lower-triangle heatmap
- Cell colors use neutral grayscale heat (`getNeutralHeatColor`)
- Hovering a cell shows tooltip with ρ, n, p-value, and direction
- Clicking a cell navigates to the row endpoint (left axis) in the findings rail
- Summary text shows strong pair count and median |ρ|
- Coherence label ("Tightly coupled" / "Partially coupled" / "Multi-pathway") appears in the pane header
- Derived endpoints (ALBGLOB, MCH, MCHC, MCV) are excluded from correlation computation
- Interpretive gloss appears below matrix when convergence and correlation diverge (2×2 logic)
- Organs with < 3 continuous endpoints show a text summary instead of matrix
- Organs with < 2 continuous endpoints show "insufficient" message
- Matrix axes are ordered by domain then alphabetically within domain
- Pane is hidden until data arrives, then renders open (`defaultOpen`)
- No new computation in the backend — reshapes precomputed correlations
- Frontend build passes (`npm run build`)
- No ESLint errors (`npm run lint`)

## Organ system assignment invariant

The `organ_system` field on each correlation entry is the authoritative assignment, stamped at precomputation time using the canonical `ORGAN_SYSTEM_MAP` in `send_knowledge.py` via `get_organ_system()` in `organ_map.py`. The matrix builder does not re-derive organ system from specimen name.

**Current state (verified):** The codebase already has a single canonical mapping pipeline:
- `ORGAN_SYSTEM_MAP` (56 entries) in `backend/services/analysis/send_knowledge.py`
- `BIOMARKER_MAP` (LB test codes) in the same file
- `get_organ_system()` in `backend/generator/organ_map.py` — single orchestrator
- `findings_pipeline.py:_enrich_finding()` — single enrichment point

One endpoint = one organ system. No multi-membership. OM findings get organ_system from specimen name (OMSPEC → `ORGAN_SYSTEM_MAP`), LB findings from test code (LBTESTCD → `BIOMARKER_MAP`), histopath/macropath from specimen.

**Known inconsistency:** `ORGAN_SYSTEM_TO_SPECIMENS` in `OrganContextPanel.tsx` (line 426-435) is a manually-maintained reverse map used for normalization lookup. It covers only 8 organ systems with ~20 specimens — much smaller than the canonical 56-entry backend map. This doesn't affect the correlation matrix (which uses the backend `organ_system` field directly) but should be noted as tech debt for a future cleanup where the frontend derives this map from backend data.

## Resolved decisions

1. ~~Column header rotation angle~~ → **90° vertical.** At 45° with 6-8 endpoints the headers overflow at 36px cell width.
2. ~~Cell click — which endpoint~~ → **Row endpoint (left axis).** Avoids needing signal scores in matrix response. Simple.
3. ~~Axis ordering~~ → **Domain then alphabetical within domain.** Alphabetical is stable but biologically meaningless. Domain grouping makes cluster structure visible (e.g., LB hematology endpoints adjacent).
4. ~~Coherence label vocabulary~~ → **"Tightly coupled" / "Partially coupled" / "Multi-pathway".** Original labels ("Highly coherent", "Moderately coherent", "Fragmented") carry misleading connotations for toxicologists. "Fragmented" implies weak evidence when it actually means independent biological pathways. "Multi-pathway" is mechanistically descriptive and carries positive connotation — multiple injury mechanisms simultaneously is actually a stronger finding than single-mechanism.
5. ~~Derived endpoint exclusion approach~~ → **Flag on the endpoint (`is_derived` in BIOMARKER_MAP), not hardcoded exclusion list.** The A/G ratio tautology (ALBGLOB↔GLOB at ρ=-0.68 is mechanical, not biological) is the visible case, but the same problem applies to MCH/MCHC/MCV and any calculated endpoint. Systematic flag enables filtering in correlation, volcano percentile, and NOAEL consumers without per-organ special-casing.
6. ~~Should coherence label influence convergence pane~~ → **Yes, via interpretive gloss.** A 2×2 matrix of (convergence strength × correlation coupling) produces conditional gloss text below the matrix. High convergence + multi-pathway = "several injury mechanisms acting simultaneously." Low convergence + tightly coupled = "possible subclinical coordinated response." This resolves the apparent contradiction in-place.

## Analysis: Hepatic correlation structure (PointCross)

**Findings from implementation review (2026-03-09):**

The hepatic organ system has 9 continuous endpoints (ALT, AST, ALP, Albumin, A/G ratio, Bilirubin, Globulin, Protein, Liver weight) producing 30 correlation pairs. Key metrics:

- **Strong pairs (|ρ| ≥ 0.7): 0** — closest is ALBGLOB↔Globulin at -0.678
- **Median |ρ|: 0.137** — well below the 0.4 "Partially coupled" threshold
- **ALT↔AST: ρ = 0.095** — the classic paired hepatic injury markers barely correlate after dose removal

**Why this is expected:** Correlations are computed on residualized values (individual value minus dose×sex group mean). This removes the treatment effect and measures within-group biological co-variation. Hepatic endpoints reflect independent pathways (hepatocellular injury, cholestasis, synthetic function, conjugation, organ mass) — a toxicant pushes all of them (convergence) but individual animals vary independently on each axis.

**Data quality issues identified:**
- ALBGLOB (Albumin/Globulin ratio) creates two tautological pairs: ALBGLOB↔Globulin (-0.678) and Albumin↔ALBGLOB (+0.552). These are mathematical, not biological. The `derived` flag fix (Phase 1) removes these from all organs systematically.
- Similarly, hematologic indices (MCH, MCHC, MCV) derived from RBC/HGB/HCT create tautological correlations in the hematologic organ system.

## Open questions

*(None remaining — all resolved above.)*
