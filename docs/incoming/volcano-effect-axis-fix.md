# Fix: Volcano Plot Mixed-Scale Effect Axis

## Problem

The volcano scatter plot displays all endpoints on a single x-axis labeled "Effect |g|". This is
incorrect: the axis currently renders two categorically different measures as if they were
comparable:

| Domain | Effect measure | What it actually is |
|--------|---------------|---------------------|
| LB, BW, OM | Hedges' g (continuous) | Statistical distance — magnitude of group difference relative to pooled SD |
| MI, MA | Severity score (0–4) | Mean pathologist grade across affected animals (INHAND ordinal: minimal=1, mild=2, moderate=3, marked=4), optionally weighted by incidence |
| CL | Severity score or incidence rate | Binary or ordinal, not a statistical effect size |

These are not the same quantity. A severity score of 2.56 (LIVER: HYPERTROPHY) and a Hedges' g of
3.82 (AST) appearing on the same numeric axis implies a comparability that does not exist
biologically or statistically.

## Proposed Fix: Within-Type Percentile Rank

Replace the raw effect value on the x-axis with a **percentile rank computed separately within
each data type**, then displayed on a shared 0–1 axis.

### Algorithm

```
For each finding f in the volcano dataset:
  1. Determine data_type: "continuous" (LB, BW, OM) or "incidence" (MI, MA, CL)
  2. Collect all effect values for findings of the same data_type in this study
  3. Compute percentile rank of f's effect value within that type-specific distribution:
       effect_rank = rank(|effect_value|) / count(findings of same data_type)
     where rank is 1-based and ties use average rank (standard scipy/numpy behavior)
  4. Store effect_rank (0–1) alongside the raw effect value
```

The result: AST's |g| = 3.82 becomes, say, 0.94 (94th percentile among continuous endpoints).
LIVER: HYPERTROPHY's severity 2.56 becomes, say, 0.81 (81st percentile among incidence
endpoints). Both are now on the same 0–1 axis with honest semantics.

### Why within-type, not global rank

A global rank across both types would impose an implicit cross-type ordering that has no biological
basis. Within-type ranking preserves the correct interpretation: "how extreme is this finding
relative to others of the same measurement class in this study?"

### Axis label

Change x-axis label from:
```
Effect |g|
```
to:
```
Effect magnitude (percentile within type)
```

Or more compact: `Effect rank (0–1)`.

Remove the `|g|=0.8` threshold dashed line — it is meaningless on the percentile axis. Instead
threshold line should be configurable as a percentile cutoff (e.g., 0.75 = top
quartile) rather than a fixed |g| value.

## Implementation

### Backend

**File:** `backend/services/analysis/volcano.py` (or wherever volcano data is assembled)

Add a `compute_effect_rank()` function:

```python
import numpy as np
from scipy.stats import rankdata

def compute_effect_rank(findings: list[dict]) -> list[dict]:
    """
    Adds effect_rank (0-1 percentile within data_type) to each finding.
    Ranking is done separately for 'continuous' and 'incidence' data types.
    Raw effect value is preserved as effect_raw.
    """
    from collections import defaultdict

    # Group by data_type
    groups = defaultdict(list)
    for f in findings:
        groups[f["data_type"]].append(f)

    result = []
    for data_type, group in groups.items():
        abs_effects = np.array([abs(f["effect_size"]) for f in group])
        ranks = rankdata(abs_effects, method="average")  # ties get average rank
        percentiles = ranks / len(ranks)  # normalize to 0-1
        for f, pct in zip(group, percentiles):
            result.append({
                **f,
                "effect_raw": f["effect_size"],      # preserve original
                "effect_rank": round(float(pct), 4), # new axis value
            })

    return result
```

Apply this in the endpoint that returns volcano data, after findings are assembled and before
serialization.

**Schema change** (`backend/models/analysis_schemas.py`):

Add to the finding/volcano response model:
```python
effect_raw: float          # original effect value (|g| or severity score)
effect_rank: float         # 0-1 percentile rank within data_type
```

### Frontend

**File:** `frontend/src/components/analysis/VolcanoPlot.tsx` (or equivalent)

1. **Switch x-axis data binding** from `effect_size` (or `|g|`) to `effect_rank`
2. **Update axis domain** from `[0, maxEffect]` to `[0, 1]`
3. **Update axis label** to `"Effect rank (0–1)"`
4. **Remove the `|g|=0.8` threshold line** — replace with an optional configurable percentile
   line (e.g., `x=0.75`) if a threshold is needed at all
5. **Update tooltip** to show both values:
   ```
   Effect: 3.82 |g|          ← effect_raw with correct unit label per data_type
   Rank: 94th percentile (continuous endpoints)
   ```
   The tooltip should use `data_type` to determine the unit label:
   - `"continuous"` → show `|g|`
   - `"incidence"` → show `severity score`

6. **Data type unit labels** — add a helper:
   ```ts
   function effectUnit(dataType: "continuous" | "incidence"): string {
     return dataType === "continuous" ? "|g|" : "severity";
   }
   ```

### Tooltip format

```
LIVER: HYPERTROPHY
Severity: 2.56 (Mild to Medium)  (81st percentile, incidence endpoints)
p = 0.0001

AST
|g|: 3.82  (94th percentile, continuous endpoints)
p < 0.0001
```

## Acceptance Criteria

- [ ] Volcano x-axis renders `effect_rank` (0–1) for all findings regardless of domain
- [ ] Axis domain is fixed `[0, 1]`, not derived from max effect value
- [ ] Axis label reads "Effect rank (0–1)" or equivalent
- [ ] The `|g|=0.8` dashed threshold line is removed or replaced with a percentile-based line
- [ ] Tooltip shows both the raw effect value (with correct unit per data_type) and the percentile
- [ ] Rankings are computed separately for continuous vs incidence findings
- [ ] `effect_raw` is preserved in the response and used only for tooltip display
- [ ] Visual ordering of points on the x-axis is consistent with "more extreme = further right"
  within each data type
- [ ] Existing point color, shape, and p-value (y-axis) encoding is unchanged
- [ ] No ESLint errors, frontend build passes

## Do Not

- Do not compute a global rank across both data types — this implies false cross-type comparability
- Do not remove the raw effect value — it must be shown in the tooltip for interpretability
- Do not add a threshold line at a fixed percentile without making it configurable — thresholds are
  study-dependent
- Do not change the y-axis (p-value, log scale) — it is correct as-is
