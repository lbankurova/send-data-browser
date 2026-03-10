# Fix: Volcano Plot Mixed-Scale Effect Axis

## Problem

The volcano scatter plot displays all endpoints on a single x-axis labeled "Effect". The axis
currently renders two categorically different measures as if they were comparable:

| Domain | Effect measure | What it actually is |
|--------|---------------|---------------------|
| LB, BW, OM | Hedges' g (continuous) | Statistical distance — magnitude of group difference relative to pooled SD |
| MI, MA | Severity score (0–4) | Mean pathologist grade across affected animals (INHAND ordinal: minimal=1, mild=2, moderate=3, marked=4), optionally weighted by incidence |
| CL | Severity score or incidence rate | Binary or ordinal, not a statistical effect size |

These are not the same quantity. A severity score of 2.56 (LIVER: HYPERTROPHY) and a Hedges' g of
3.82 (AST) appearing on the same numeric axis implies a comparability that does not exist
biologically or statistically. The current axis maximum of ~4.20 is a direct artifact of the
severity scale (0–4) leaking into the axis range.

Regulatory reviewers (FDA, EMA) reason about histopathology findings and clinical chemistry
findings on separate mental scales. The CDISC SEND model does not provide a unified cross-type
effect measure — and neither should we.

## Proposed Fix: Within-Type Percentile Rank

Replace the raw effect value on the x-axis with a **percentile rank computed separately within
each data type**, then displayed on a shared 0–1 axis.

### Algorithm

Use the **Hazen plotting position** formula: `rank / (count + 1)`.

```
For each finding f in the volcano dataset:
  1. Determine data_type via INCIDENCE_DOMAINS.has(f.domain):
       - "continuous" → LB, BW, OM
       - "incidence"  → MI, MA, CL, TF, DS
  2. Collect all |maxEffectSize| values for findings of the same data_type
  3. Compute percentile rank of f's |maxEffectSize| within that type-specific distribution:
       effect_pctl = rank(|maxEffectSize|) / (count(findings of same data_type) + 1)
     where rank is 1-based and ties use average rank
  4. Store effect_pctl (0–1) alongside the raw effect value (effectRaw)
```

The `/ (count + 1)` denominator (Hazen formula) avoids the boundary artifact where a single
endpoint of its type would land at x=1.0 (far right). With Hazen, a singleton lands at 0.5
(center), which honestly communicates "one data point, no relative ranking possible."

The result: AST's |g| = 3.82 becomes, say, 0.94 (94th percentile among continuous endpoints).
LIVER: HYPERTROPHY's severity 2.56 becomes, say, 0.81 (81st percentile among incidence
endpoints). Both are now on the same 0–1 axis with honest semantics.

### Why within-type, not global rank

A global rank across both types would impose an implicit cross-type ordering that has no biological
basis. Within-type ranking preserves the correct interpretation: "how extreme is this finding
relative to others of the same measurement class in this study?"

### Filter sensitivity

Rankings are computed on the **currently visible** set of endpoints (after rail filtering and
endpoint exclusions are applied). This means ranks may shift as the user toggles filters. This is
correct behavior — "how extreme relative to what's currently being compared" is a valid and useful
question. The tooltip always shows the raw effect value for absolute context.

### Axis label

Change x-axis label from `"Effect"` to `"Effect percentile"`.

Axis tick formatter: `(v: number) => Math.round(v * 100) + "%"` — shows 0%, 25%, 50%, 75%, 100%.

Remove the `|symbol|=0.8` threshold dashed line — it is meaningless on the percentile axis. If a
threshold line is desired, it should be configurable as a percentile cutoff (e.g., 0.75 = top
quartile) rather than a fixed effect-size value.

> **Note:** The current threshold line label already uses the dynamic `effectSizeSymbol` prop
> (`|${effectSizeSymbol}|=0.8`), so it respects method selection. On a percentile axis, the line
> itself (not just the label) loses meaning and must be removed.

## Implementation

### Computation Location: Frontend Only

The volcano scatter is purely a frontend visualization. There is no backend volcano endpoint —
the chart is built from `UnifiedFinding[]` → `EndpointSummary[]` → `QuadrantPoint[]` in
`findings-charts.ts`. No backend or schema changes are needed.

**Why frontend, not backend:**
1. **Filter-sensitive.** The scatter receives `scatterEndpoints` — already filtered by rail
   visibility + user exclusions (`FindingsView.tsx:201-204`). Rankings must recompute as the
   user filters. The backend can't know the current filter state.
2. **Visualization transform.** Exactly parallel to `-Math.log10(p)` on the y-axis, which is
   already computed at the chart boundary (`findings-charts.ts:122`).
3. **No cross-consumer impact.** The backend returns `UnifiedFinding[]` — a domain-level data
   structure consumed by multiple views. Adding a chart-specific rank field would couple a
   visualization concern to all API consumers.
4. **"System computes what it can" (H-019).** This CLAUDE.md rule is a UX principle about
   *what* to show (computed results, not raw data for users to derive), not *where* to compute.
   Frontend computation satisfies it: the user sees percentile rank (computed), not raw
   mixed-scale values.

### Frontend

**Files:**
- `frontend/src/components/analysis/charts/findings-charts.ts` — chart builder + data prep
- `frontend/src/components/analysis/findings/FindingsQuadrantScatter.tsx` — React wrapper

#### 1. Extend `QuadrantPoint` with rank fields

```ts
export interface QuadrantPoint {
  // ... existing fields ...
  x: number;           // was |maxEffectSize|, now effect percentile (0–1)
  effectRaw: number;   // original |maxEffectSize| (for tooltip)
  isIncidence: boolean; // derived from INCIDENCE_DOMAINS.has(domain)
  isSingleton: boolean; // true if only endpoint of this data_type (tooltip note)
  maxIncidence?: number; // 0–1 fraction for incidence endpoints (for tooltip)
  // ...
}
```

#### 2. Compute within-type percentile rank in `prepareQuadrantPoints()`

After the existing `.filter().map()`, add a ranking pass using Hazen formula:

```ts
function computeWithinTypeRank(points: QuadrantPoint[]): QuadrantPoint[] {
  const continuous = points.filter(p => !p.isIncidence);
  const incidence = points.filter(p => p.isIncidence);

  function assignRanks(group: QuadrantPoint[]): QuadrantPoint[] {
    if (group.length === 0) return [];
    const isSingleton = group.length === 1;
    // Sort indices by effectRaw (ascending)
    const indexed = group.map((p, i) => ({ i, val: p.effectRaw }));
    indexed.sort((a, b) => a.val - b.val);
    // Assign average rank for ties
    const ranks = new Array<number>(group.length);
    let pos = 0;
    while (pos < indexed.length) {
      let end = pos + 1;
      while (end < indexed.length && indexed[end].val === indexed[pos].val) end++;
      const avgRank = (pos + 1 + end) / 2; // 1-based average
      for (let k = pos; k < end; k++) ranks[indexed[k].i] = avgRank;
      pos = end;
    }
    // Hazen plotting position: rank / (n + 1)
    return group.map((p, i) => ({
      ...p,
      x: ranks[i] / (group.length + 1),
      isSingleton,
    }));
  }

  return [...assignRanks(continuous), ...assignRanks(incidence)];
}
```

#### 3. Update `buildFindingsQuadrantOption()`

- **x-axis domain:** Change from `[0, maxX]` (derived from max effect) to `[0, 1]` (fixed)
- **x-axis label:** Change from `"Effect"` to `"Effect percentile"`
- **x-axis formatter:** `(v: number) => Math.round(v * 100) + "%"`
- **Remove the effect-size threshold line** (`xAxis: 0.8` markLine entry). Keep the `p=0.05` line.

#### 4. Update tooltip — respect dynamic labels

**Critical: preserve dynamic method labels.** The system supports user-selectable effect size
methods (Hedges' g, Cohen's d, Glass's Δ) via `getEffectSizeSymbol()` from
`stat-method-transforms.ts`. The `effectSizeSymbol` prop is already threaded through to
`buildFindingsQuadrantOption()`. Tooltip labels for continuous endpoints MUST use this prop,
never hardcode `"|g|"`.

Current tooltip logic (line 285 of `findings-charts.ts`):
```ts
const effectLabel = isIncidence
  ? `avg sev=${meta.x.toFixed(2)}`
  : `|${effectSizeSymbol}|=${meta.x.toFixed(2)}`;
```

Updated — use `effectRaw` (since `x` is now the percentile):
```ts
const effectLabel = meta.isIncidence
  ? `avg sev=${meta.effectRaw.toFixed(2)}`
  : `|${effectSizeSymbol}|=${meta.effectRaw.toFixed(2)}`;
```

Add percentile and incidence context lines:
```ts
// Percentile line (with singleton caveat)
const pctLine = meta.isSingleton
  ? `<div style="font-size:9px;color:#9CA3AF">Only endpoint of this type — rank not meaningful</div>`
  : `<div style="font-size:9px;color:#9CA3AF">${Math.round(meta.x * 100)}th pctl among ${meta.isIncidence ? "incidence" : "continuous"}</div>`;

// Incidence fraction for MI/MA/CL (if available)
const incidenceLine = meta.isIncidence && meta.maxIncidence != null
  ? `<div style="font-size:9px;color:#9CA3AF">${Math.round(meta.maxIncidence * 100)}% incidence</div>`
  : "";
```

#### 5. `severityLabel()` helper — new function

No existing INHAND severity label mapping exists in the codebase (confirmed search). Add as a
pure helper in `findings-charts.ts` (or a shared utility if it will be reused):

```ts
function severityLabel(meanGrade: number): string {
  if (meanGrade < 1.5) return "Minimal";
  if (meanGrade < 2.0) return "Minimal\u2013Mild";
  if (meanGrade < 2.5) return "Mild";
  if (meanGrade < 3.0) return "Mild\u2013Moderate";
  if (meanGrade < 3.5) return "Moderate";
  if (meanGrade < 4.0) return "Moderate\u2013Marked";
  return "Marked";
}
```

Use en-dash (\u2013), not hyphen. Apply to incidence tooltip: `avg sev=2.56 (Mild–Moderate)`.

### Tooltip format

**Continuous endpoints:**
```
AST
|g|: 3.82                              ← uses dynamic effectSizeSymbol (g / d / Δ)
94th pctl among continuous
p < 0.0001
```

**Incidence endpoints:**
```
LIVER: HYPERTROPHY
avg sev=2.56  (Mild–Moderate)
81% incidence
81st pctl among incidence
p = 0.0001
```

**Singleton (only endpoint of its data type):**
```
AST
|g|: 3.82
Only endpoint of this type — rank not meaningful
p < 0.0001
```

### Severity label interpolation

The INHAND ordinal scale is: **Minimal (1) / Mild (2) / Moderate (3) / Marked (4)**.

Mean severity (averaged across affected animals) should be mapped to a bracketed label:

```
1.0 – 1.49  →  Minimal
1.5 – 1.99  →  Minimal–Mild
2.0 – 2.49  →  Mild
2.5 – 2.99  →  Mild–Moderate
3.0 – 3.49  →  Moderate
3.5 – 3.99  →  Moderate–Marked
4.0          →  Marked
```

The hyphenated form (e.g., Mild–Moderate) correctly communicates that the value is a mean across
individually graded animals, not a single judgment. Use an en-dash (–), not a hyphen (-).

## Acceptance Criteria

- [ ] Volcano x-axis renders effect percentile (0–1) for all findings regardless of domain
- [ ] Percentile computed using Hazen formula: `rank / (count + 1)`
- [ ] Axis domain is fixed `[0, 1]`, tick labels show 0%–100%
- [ ] Axis label reads "Effect percentile"
- [ ] The `|symbol|=0.8` dashed threshold line is removed
- [ ] Tooltip for continuous endpoints shows raw effect value using the **dynamic**
  `effectSizeSymbol` (g / d / Δ) — never hardcoded
- [ ] Tooltip for incidence endpoints shows mean severity with INHAND bracketed label
  (e.g., "Mild–Moderate") and incidence percentage
- [ ] Singleton tooltip shows "Only endpoint of this type — rank not meaningful"
- [ ] Severity label uses en-dash (–) not hyphen (-) for bracketed terms
- [ ] Rankings are computed separately for continuous vs incidence findings (using
  `INCIDENCE_DOMAINS`)
- [ ] `effectRaw` is preserved on `QuadrantPoint` and used for tooltip display
- [ ] Visual ordering of points on the x-axis is consistent with "more extreme = further right"
  within each data type
- [ ] Rankings recompute correctly when filters change (filter-sensitive by design)
- [ ] Existing point color, shape, and p-value (y-axis) encoding is unchanged
- [ ] No backend changes — ranking is computed in `prepareQuadrantPoints()`
- [ ] No ESLint errors, frontend build passes

## Do Not

- Do not compute a global rank across both data types — this implies false cross-type comparability
- Do not use `rank / count` — use Hazen `rank / (count + 1)` to avoid boundary artifacts
- Do not remove the raw effect value — it must be shown in the tooltip for interpretability
- Do not add a threshold line at a fixed percentile without making it configurable — thresholds are
  study-dependent
- Do not change the y-axis (p-value, log scale) — it is correct as-is
- Do not hardcode `"|g|"` in tooltip labels — use the dynamic `effectSizeSymbol` prop which
  reflects the user's selected statistical method (Hedges' g / Cohen's d / Glass's Δ)
- Do not add backend fields or schema changes — this is a frontend-only visualization concern
