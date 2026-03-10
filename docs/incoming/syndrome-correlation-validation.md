# Syndrome Correlation Validation

## What this does

Adds an "Endpoint co-variation" pane to the SyndromeContextPanel, showing pairwise Spearman correlations among the syndrome's continuous member endpoints. Answers: "Is this syndrome statistically supported in this study, or just rule-matched?"

Syndromes are detected by rule-matching (presence + direction of member endpoints). But rule-matched ≠ biologically correlated — a syndrome whose members have high pairwise rho is strongly supported, while one whose members are statistically independent may be coincidental co-occurrence.

## User workflow

1. User clicks a syndrome card in the Findings Rail (e.g., "XS01 Hepatocellular injury")
2. SyndromeContextPanel opens in the context panel
3. Evidence pane shows what matched (required/supporting endpoints, term report)
4. New "Endpoint co-variation" pane appears below Evidence (collapsed by default)
5. Pane badge shows validation label (e.g., "Weak co-variation")
6. Expanding shows: summary stat, mini-matrix (if 4+ continuous members), interpretive gloss, excluded members
7. Click a matrix cell → navigates to the row endpoint in the findings rail
8. If syndrome has < 2 continuous members with correlations, pane is hidden

## Data model

### Input data

**Not precomputed.** Unlike the organ correlation matrix (which reshapes precomputed data), syndrome correlations require a new computation path because:
- Syndrome members may span organ systems (XS08: adrenal ↔ BW; XS09: BW ↔ organ weights)
- Precomputed correlations are within-organ only
- Syndrome detection runs on the frontend — the backend doesn't know which endpoints matched

The computation is lazy (on-request) and small (~3–28 pairs per syndrome).

### New API endpoint

```
POST /api/studies/{study_id}/analyses/adverse-effects/syndrome-correlations
```

Query params: same `settings` params as other endpoints (stat_method, alpha, effect_size_method, last_dosing_day).

Request body:

```python
class SyndromeCorrelationRequest(BaseModel):
    endpoint_labels: list[str]
    syndrome_id: str  # Cache key / label only. Not resolved by backend.
                      # Retained for future backend syndrome detection.
```

Response schema:

```python
class SyndromeCorrelationResult(BaseModel):
    syndrome_id: str
    endpoints: list[str]                    # correlatable endpoint labels (axis labels)
    endpoint_domains: list[str]             # domain code per endpoint (for DomainLabel)
    matrix: list[list[float | None]]        # lower triangle: matrix[i][j] = rho for i > j
    p_values: list[list[float | None]]      # same shape
    n_values: list[list[int | None]]        # same shape
    endpoint_finding_ids: list[list[str]]   # finding_ids per endpoint (for navigation)
    total_pairs: int
    excluded_members: list[ExcludedMember]
    summary: SyndromeCorrelationSummary

class ExcludedMember(BaseModel):
    endpoint_label: str
    domain: str
    reason: str  # "incidence_data" | "insufficient_subjects" | "no_individual_data"

class SyndromeCorrelationSummary(BaseModel):
    median_abs_rho: float
    strong_pairs: int       # |rho| >= 0.7 (aligned with organ matrix thresholds)
    total_pairs: int
    validation_label: str   # "Strong co-variation", "Moderate co-variation", "Weak co-variation", "Insufficient data"
    gloss: str | None       # interpretive sentence at extremes only
```

### Backend computation function

New function in `correlations.py`:

```python
def compute_syndrome_correlations(
    findings: list[dict],
    endpoint_labels: list[str],
) -> tuple[list[dict], list[dict]]:
    """Compute pairwise correlations among specified endpoints, ignoring organ boundaries.

    Returns (correlations, excluded_endpoints) where excluded_endpoints are
    endpoint_labels that couldn't participate (no individual data, < 10 subjects).
    """
```

Steps:
1. Filter `findings` to those with `endpoint_label` in the provided list
2. Further filter: `data_type == "continuous"`, `raw_subject_values` present, `is_derived == False`
3. Group by `_endpoint_key()` — reuses existing key construction (handles specimens, timepoints)
4. **No organ_system grouping** — all pairs computed regardless of organ boundaries
5. For each pair, call `_residualized_correlation()` — reuses existing residualization
6. Track which endpoint_labels produced no valid endpoint_key (excluded as `"no_individual_data"`) or had < 10 common subjects with all partners (excluded as `"insufficient_subjects"`)
7. Return all pairwise correlations sorted by |rho|, plus excluded list

No `max_per_organ` cap — syndrome member sets are small (typically 3–8 continuous endpoints → 3–28 pairs).

### Backend assembly function

New function in `context_panes.py`:

```python
def build_syndrome_correlation_summary(
    correlations: list[dict],
    excluded: list[dict],
    syndrome_id: str,
) -> dict:
    """Build correlation summary for a syndrome from computed correlations."""
```

Steps:
1. Collect unique endpoint labels, sort by domain then alphabetical (same as organ matrix)
2. Build NxN lower-triangle matrices for rho, p_value, n
3. Compute summary stats (median |rho|, strong pair count, validation label)
4. Generate gloss at extremes
5. Return serialized result with excluded members

### Frontend data flow

```
SyndromeContextPanel
  → identifies continuous matched members (domain-based filter)
  → useSyndromeCorrelations(studyId, syndromeId, continuousMembers)
    → POST /api/.../syndrome-correlations
    → adapter maps response → { matrix: OrganCorrelationMatrix, excludedMembers }
  → <SyndromeCorrelationPane matrix={...} excludedMembers={...} onCellClick={...} />
    → <CorrelationMatrixPane data={matrix} onCellClick={onCellClick} />
```

The adapter lives in the hook (not the component). It maps:
- `validation_label` → `coherence_label`
- `strong_pairs` → `strong_pairs` (same field, same threshold)
- All matrix fields pass through unchanged

This keeps `CorrelationMatrixPane` unmodified and unaware of the data source.

## Continuous member identification

The frontend determines which syndrome members can participate in correlation. Domain is the primary discriminator:

| Domain | Data type | Correlatable |
|--------|-----------|-------------|
| LB     | Continuous | Yes |
| BW, BG | Continuous | Yes |
| OM     | Continuous | Yes |
| VS, EG | Continuous | Yes |
| MI     | Incidence  | No — excluded as "incidence_data" |
| MA     | Incidence  | No — excluded as "incidence_data" |
| CL     | Mixed      | Check `data_type` on finding |

Members in MI/MA are excluded client-side before the POST request. The backend may add further exclusions (insufficient subjects, no individual data).

## UI specification

### Placement

In `SyndromeContextPanel.tsx`, as a new CollapsiblePane:
- **Position:** After Evidence pane, before Dose-response & recovery
- **Title:** "Endpoint co-variation"
- **defaultOpen:** `false` (secondary validation signal)
- **Badge:** validation label (e.g., "Weak co-variation") as `headerRight`, neutral gray style

### Pane visibility

Hidden when < 2 continuous members with valid correlations exist. Check: `matrix && matrix.endpoints.length >= 2`.

### Content structure

1. **Matrix / text summary** — delegates to `CorrelationMatrixPane`:
   - 4+ continuous members → lower-triangle matrix heatmap (grayscale heat)
   - 2–3 continuous members → text summary ("EP1 ↔ EP2: ρ = X")
   - Includes summary line, legend, gloss (all rendered by CorrelationMatrixPane)

2. **Excluded members** — below the matrix, rendered by `SyndromeCorrelationPane`:
   ```
   2 members excluded (incidence data): MI Liver — Necrosis, MA Liver — Discoloration
   ```
   Style: `text-[10px] text-muted-foreground`

### Click interaction

Click a matrix cell → navigate to the row endpoint (left axis):
- Calls `selectFinding(best)` — global finding selection, same as organ matrix
- Works for both within-organ and cross-organ members because finding selection is not organ-scoped
- Syndrome grouping: rail shows all members, navigation works directly
- Organ grouping: selection triggers rail to navigate to the finding's organ group

### SyndromeCorrelationPane component

New file: `frontend/src/components/analysis/panes/SyndromeCorrelationPane.tsx`

```typescript
interface Props {
  matrix: OrganCorrelationMatrix;           // adapted from SyndromeCorrelationResult
  excludedMembers: ExcludedMember[];
  onCellClick: (endpointLabel: string) => void;
}
```

Renders:
1. `<CorrelationMatrixPane data={matrix} onCellClick={onCellClick} />` (reuse)
2. Excluded members list (if any)

The summary text, legend, and gloss are rendered by CorrelationMatrixPane. The organ pane's phrasing ("X of Y pairs strongly correlated (|ρ| ≥ 0.7)") is accurate with aligned thresholds — no override needed.

## Validation labels

Aligned with organ correlation matrix thresholds (0.7/0.4) to prevent contradictory labels when both panes show overlapping endpoint pairs.

| Threshold | Label | Gloss |
|-----------|-------|-------|
| median \|ρ\| ≥ 0.7 | "Strong co-variation" | "Pattern members co-vary biologically — syndrome is statistically supported beyond rule-matching." |
| median \|ρ\| ≥ 0.4 | "Moderate co-variation" | *(no gloss)* |
| median \|ρ\| < 0.4 | "Weak co-variation" | "Low pairwise correlation among members — pattern may reflect coincidental co-occurrence rather than shared mechanism." |
| < 2 pairs | "Insufficient data" | *(no gloss)* |

## Syndrome member correlation patterns

Reference: which syndromes have cross-organ members.

| Syndrome | Continuous members | Cross-organ? | Notes |
|----------|--------------------|--------------|-------|
| XS01 Hepatocellular | ALT, AST, ALP, GGT, TBIL, Liver wt — all hepatic | No | Many pairs already in precomputed organ data |
| XS02 Hepatobiliary | ALP, GGT, 5NT, TBIL, Liver wt — all hepatic | No | |
| XS03 Nephrotoxicity | BUN, CREAT, Kidney wt — all renal | No | |
| XS04 Myelosuppression | NEUT, PLAT, RBC, HGB — all hematologic | No | |
| XS05 Hemolytic anemia | RBC, RETIC, HGB, Bilirubin — hematologic + hepatic | Yes | Bilirubin (hepatic) ↔ RBC (hematologic) |
| XS07 Immunotoxicity | WBC, LYMPH, Thymus wt — hematologic + immune | Yes | |
| XS08 Stress | Adrenal wt (adrenal) + BW (general) | Yes | |
| XS09 Target organ wasting | BW (general) + organ weights (various) | Yes | Most cross-organ of all |
| XS06, XS10 | Few continuous members | — | Likely insufficient data |

## Integration points

- **`backend/services/analysis/correlations.py`** — new `compute_syndrome_correlations()` function
- **`backend/services/analysis/context_panes.py`** — new `build_syndrome_correlation_summary()` function
- **`backend/routers/analyses.py`** — new POST endpoint
- **`backend/models/analysis_schemas.py`** — new `SyndromeCorrelationRequest`, `SyndromeCorrelationResult`, `ExcludedMember`, `SyndromeCorrelationSummary` schemas
- **`frontend/src/components/analysis/panes/SyndromeCorrelationPane.tsx`** — new wrapper component
- **`frontend/src/components/analysis/panes/SyndromeContextPanel.tsx`** — add pane
- **`frontend/src/hooks/useSyndromeCorrelations.ts`** — new React Query hook (adapter included)
- **`frontend/src/lib/analysis-api.ts`** — new `fetchSyndromeCorrelations()` function
- **`frontend/src/types/analysis.ts`** — new TypeScript interfaces
- **`frontend/src/components/analysis/panes/CorrelationMatrixPane.tsx`** — reused, no changes
- **`frontend/src/lib/severity-colors.ts`** — reused `getNeutralHeatColor()`, no changes
- **`docs/systems/correlation-matrix.md`** — update with syndrome section

## Implementation plan

### Phase 1: Backend computation

**Step 1.1: Add `compute_syndrome_correlations()`** (`correlations.py`)
- New function, reuses `_endpoint_key()`, `_subject_residuals()`, `_residualized_correlation()`
- Differs from `compute_correlations()` in: scoped to named endpoints, no organ grouping, no `max_per_organ`
- Returns `(correlations, excluded)` tuple

**Step 1.2: Add `build_syndrome_correlation_summary()`** (`context_panes.py`)
- Same reshape pattern as `build_organ_correlation_matrix()`
- Validation labels at 0.7/0.4 thresholds (aligned with organ matrix)
- Gloss at extremes only

**Step 1.3: Add schemas** (`analysis_schemas.py`)
- `SyndromeCorrelationRequest`, `SyndromeCorrelationResult`, `ExcludedMember`, `SyndromeCorrelationSummary`

**Step 1.4: Add POST endpoint** (`analyses.py`)
- Accepts `SyndromeCorrelationRequest` body + settings query params
- Loads findings for settings, calls `compute_syndrome_correlations()`, calls `build_syndrome_correlation_summary()`
- Returns `SyndromeCorrelationResult`

### Phase 2: Frontend hook + API

**Step 2.1: Add `fetchSyndromeCorrelations()`** (`analysis-api.ts`)
- POST to `/api/.../syndrome-correlations` with JSON body + settings query string

**Step 2.2: Add `useSyndromeCorrelations()`** (`useSyndromeCorrelations.ts`)
- Accepts `studyId`, `syndromeId`, `continuousMembers` (array of `{ endpoint_label, domain }`)
- Filters to correlatable domains client-side, builds MI/MA exclusion list
- Query key: `["syndrome-correlations", studyId, syndromeId, sortedLabels, params]`
- Settings propagation: `params` from `useStudySettings()` in both queryKey and fetch call
- `enabled` when studyId present + ≥ 2 continuous members
- Stale time: 5 minutes
- **Adapter**: maps `SyndromeCorrelationResult` → `{ matrix: OrganCorrelationMatrix, excludedMembers: ExcludedMember[] }` (maps `validation_label` → `coherence_label`)

**Step 2.3: Add TypeScript types** (`types/analysis.ts`)
- `SyndromeCorrelationResult`, `SyndromeCorrelationSummary`, `ExcludedMember`

### Phase 3: Frontend pane

**Step 3.1: Create `SyndromeCorrelationPane.tsx`**
- Wrapper: renders `CorrelationMatrixPane` + excluded members list
- Excluded members: `text-[10px] text-muted-foreground`, grouped by reason

**Step 3.2: Integrate into `SyndromeContextPanel.tsx`**
- Add `useSyndromeCorrelations()` hook call
- Extract continuous members from syndrome's `matchedEndpoints` (filter by domain)
- Add CollapsiblePane after Evidence, before Dose-response
- Title "Endpoint co-variation", badge = validation_label, `defaultOpen={false}`
- Click handler: reuse existing `selectFinding()` pattern from panel (find best finding by endpoint_label, select it)

### Phase 4: Polish + docs

**Step 4.1: Edge cases**
- Syndromes with 0–1 continuous members: pane hidden
- Syndromes with no individual-level data: pane hidden
- Loading state: pane hidden until data arrives (same pattern as organ matrix)

**Step 4.2: Update system doc** (`docs/systems/correlation-matrix.md`)
- Add "Syndrome validation" section covering endpoint, computation path, thresholds, architecture

### Follow-on items (not this scope — log to TODO.md)

- Syndrome validation label in FindingsRail syndrome cards (show inline without opening panel)
- Syndrome confidence adjustment based on co-variation strength
- Consider precomputed syndrome correlations if lazy latency becomes noticeable
- Explore partial correlation for confound control (dose-effect removal is currently via residualization only)

## Acceptance criteria

- Syndrome context panel shows "Endpoint co-variation" pane after Evidence
- Pane badge shows validation label ("Strong co-variation" / "Moderate co-variation" / "Weak co-variation" / "Insufficient data")
- Thresholds aligned with organ matrix (0.7/0.4) — no contradictory labels for overlapping pairs
- Summary line shows strong pair count and median |ρ|
- Mini-matrix renders for syndromes with 4+ continuous members (lower-triangle, grayscale heat)
- Text summary renders for syndromes with 2–3 continuous members
- Excluded members listed with reason (incidence data, insufficient subjects, no individual data)
- Cross-organ pairs computed correctly (XS09: BW ↔ organ weights span organ boundaries)
- Within-organ pairs computed correctly (XS01: ALT ↔ AST ↔ ALP ↔ Liver weight)
- Interpretive gloss appears for strong co-variation and weak co-variation
- Click on matrix cell navigates to row endpoint via `selectFinding()` (works cross-organ)
- Pane hidden when < 2 continuous members with valid correlations exist
- Pane defaults to collapsed (`defaultOpen={false}`)
- Settings changes (stat_method, alpha, etc.) trigger re-fetch (params in queryKey)
- No derived endpoints in correlation computation
- Frontend build passes (`npm run build`)
- No ESLint errors (`npm run lint`)
- System doc `docs/systems/correlation-matrix.md` updated with syndrome section

## Resolved decisions

1. ~~Lazy vs precomputed computation~~ → **Lazy (on-request).** Syndrome detection is frontend-only; moving it to backend for precomputation has no other payoff. Computation is small (3–28 pairs). Most syndrome panels never opened.
2. ~~Mixed data types (continuous + incidence)~~ → **Continuous-only correlation, with transparency.** Show which members are excluded and why. Partial validation is useful — "do the measurable members co-vary?"
3. ~~Threshold calibration~~ → **Aligned with organ matrix (0.7/0.4).** Prevents contradictory labels when both panes show overlapping endpoint pairs (XS01, XS03, XS04). The vocabulary difference ("co-variation" vs "coupled") signals different perspectives. For cross-organ syndromes (XS08, XS09), stricter thresholds are honest — if members don't co-vary at 0.4, that IS weak.
4. ~~POST vs GET endpoint~~ → **POST.** Variable-length endpoint_labels list doesn't fit cleanly in query params. `syndrome_id` in body is a cache key, not used for backend resolution (comment in schema).
5. ~~Adapter location~~ → **In the hook.** Maps `SyndromeCorrelationResult` → `OrganCorrelationMatrix` format so `CorrelationMatrixPane` is reused without modification.
6. ~~Cross-organ click navigation~~ → **`selectFinding()` is global.** Works for both within-organ (XS01) and cross-organ (XS09) members without special handling.
7. ~~Pane open/closed default~~ → **Collapsed.** Secondary validation signal — supports the Evidence pane's conclusions but doesn't lead.

## Architectural context

### Why lazy, not precomputed

The correlation-context-strategy.md identified two options for cross-organ syndrome correlations:

- **Option A (Lazy):** Compute on-request when syndrome panel opens
- **Option B (Precomputed):** Expand pipeline to compute syndrome-member pairs at generation time

Option A wins because:
- Frontend owns syndrome detection (10 rules, directional gates, compound logic, sex-specific matching). Replicating this on backend is a large, error-prone architectural change.
- Most syndromes (6 of 10) have all continuous members within one organ system — precomputed within-organ correlations already cover them. The lazy endpoint handles the remaining 4 uniformly.
- Syndrome panels are opened infrequently (user drills into specific syndromes). Precomputing all 10 syndromes × all settings permutations wastes cycles.
- The computation is small: typically 3–8 continuous endpoints → 3–28 residualized Spearman pairs. Sub-second even without caching.

### Relationship to existing correlation system

```
                    ┌─────────────────────────────────────────┐
                    │         correlations.py                  │
                    │                                         │
                    │  compute_correlations()                 │  ← precomputed, within-organ
                    │    → unified_findings.json              │
                    │    → organ matrix (reshape only)        │
                    │                                         │
                    │  compute_syndrome_correlations()  [NEW] │  ← lazy, cross-organ
                    │    → POST endpoint                      │
                    │    → syndrome validation pane            │
                    │                                         │
                    │  Shared: _endpoint_key()                │
                    │          _subject_residuals()            │
                    │          _residualized_correlation()     │
                    └─────────────────────────────────────────┘
```

Both paths use the same residualization math and endpoint key construction. The difference is scope (all within-organ vs named cross-organ) and timing (generation vs request).

## Open questions

*(None — all resolved above.)*
