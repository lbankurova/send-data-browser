# Organ System Correlation Matrix

## What this does

Adds a correlation matrix pane to the OrganContextPanel, showing pairwise Spearman correlations between all continuous endpoints within the selected organ system. Answers: "Is this organ's response coherent or fragmented?"

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
    coherence_label: str                    # "Highly coherent", "Moderately coherent", "Fragmented", "Insufficient data"
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
- **Badge:** summary coherence label (e.g., "Highly coherent") as `headerRight`

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

### Phase 1: Backend (new endpoint + matrix assembly)

**Step 1.1: Schema** (`backend/models/analysis_schemas.py`)
- Add `OrganCorrelationSummary` and `OrganCorrelationMatrix` Pydantic models

**Step 1.2: Matrix builder** (`backend/services/analysis/context_panes.py`)
- Add `build_organ_correlation_matrix(organ_key, correlations)` function
- Filter correlations by organ_system
- Collect unique endpoint labels, sort by domain then alphabetically within domain
- Build lower-triangle matrices (rho, p_value, n)
- Compute summary: median |rho|, strong pair count, coherence label
- Collect finding_ids per endpoint for navigation

**Step 1.3: API endpoint** (`backend/routers/analyses.py`)
- Add `GET /api/studies/{study_id}/analyses/adverse-effects/organ/{organ_key}/correlations`
- Load unified_findings via `_load_findings_for_settings()`
- Extract `correlations` array, pass to `build_organ_correlation_matrix()`
- Return `OrganCorrelationMatrix`

### Phase 2: Frontend hook

**Step 2.1: Hook** (`frontend/src/hooks/useOrganCorrelations.ts`)
- React Query hook: `useOrganCorrelations(studyId, organKey)`
- Query key: `["organ-correlations", studyId, organKey, ...settingsKey]`
- Fetch from new endpoint
- Type the response matching the backend schema

### Phase 3: Frontend component

**Step 3.1: CorrelationMatrixPane** (`frontend/src/components/analysis/panes/CorrelationMatrixPane.tsx`)
- Props: `{ data: OrganCorrelationMatrix; onCellClick: (endpointLabel: string) => void }`
- Render lower-triangle matrix table
- Cell backgrounds via `getNeutralHeatColor(Math.abs(rho))`
- Tooltips via native `title` attribute
- Click handler on cells
- Summary text below matrix
- Color scale legend
- Fallback for < 3 endpoints (text summary)
- Fallback for no data

**Step 3.2: Integrate into OrganContextPanel** (`OrganContextPanel.tsx`)
- Import `useOrganCorrelations` hook
- Import `CorrelationMatrixPane` component
- Add `CollapsiblePane` with title "Endpoint correlations" after Convergence
- Pass `handleEndpointClick` as click handler
- Show coherence label as `headerRight` badge

### Phase 4: Polish

**Step 4.1: Vertical column headers**
- CSS `writing-mode: vertical-rl` + `transform: rotate(180deg)` for 90° vertical text
- Truncate with `max-height` + `overflow: hidden` on header cells
- Tooltip on truncated labels via native `title` attribute

**Step 4.2: Loading state**
- Skeleton shimmer while hook fetches

**Step 4.3: Edge cases**
- Handle organs with 0-2 continuous endpoints gracefully
- Handle missing correlation data (no raw_subject_values)

## Acceptance criteria

- When clicking an organ group header, the OrganContextPanel shows an "Endpoint correlations" pane
- The matrix displays all within-organ continuous endpoint pairs as a lower-triangle heatmap
- Cell colors use neutral grayscale heat (`getNeutralHeatColor`)
- Hovering a cell shows tooltip with ρ, n, p-value, and direction
- Clicking a cell navigates to the row endpoint (left axis) in the findings rail
- Summary text shows strong pair count and median |ρ|
- Coherence label appears in the pane header
- Organs with < 3 continuous endpoints show a text summary instead of matrix
- Organs with < 2 continuous endpoints show "insufficient" message
- Matrix axes are ordered by domain then alphabetically within domain
- Pane is collapsed when loading and expands once data arrives
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

## Open questions

1. **Should the coherence label influence the Convergence pane?** Not in this implementation — keep them independent. Could be a future enhancement.
