# Correlation Context Strategy

## Status: Analysis / Pre-spec

> This document captures the design analysis for how cross-endpoint correlations should surface across different context panel levels. It is not an implementation spec — detailed specs will be created for approved items.

## Problem statement

The endpoint-level context panel has a Correlations pane that shows within-organ Spearman correlations for a selected finding. The question: should we expand correlations to other context panel levels (organ system, syndrome, domain, pattern), and if so, what format and what non-duplicative signal does each provide?

## Current implementation

**Endpoint-level correlations pane** (`CorrelationsPane.tsx`)

- Shows top 10 cross-endpoint Spearman correlations within the same organ system
- Residualized (dose-effect removed via group-mean subtraction) to reflect biological co-variation
- Individual animal-level data, n >= 10 filter
- Autocorrelation filtered (same endpoint across timepoints removed)
- Table format: endpoint, rho (color-coded by strength), n, p-value
- Collapsed by default; hidden when no valid correlations exist
- Insights generated for strong correlations (shared mechanism warning)

**Key files:**
- Backend computation: `backend/services/analysis/correlations.py`
- Pane assembly: `backend/services/analysis/context_panes.py:_build_correlations()`
- Insight generation: `backend/services/analysis/insights.py:416-445`
- Frontend: `frontend/src/components/analysis/panes/CorrelationsPane.tsx`
- Parent: `frontend/src/components/analysis/panes/FindingsContextPanel.tsx:1566-1576`

## Analysis by context level

### Endpoint level — KEEP AS-IS

**Format:** Table (current)
**Scope:** Within-organ, single finding focus
**Question answered:** "What else co-varies with *this* measurement in this study?"

This is the right format and scope. The table is more information-dense than a matrix for a single-finding drill-down. Within-organ scope is correct — cross-organ relationships are the syndrome pane's responsibility.

**Not recommended:**
- Correlation matrix: wrong abstraction level (matrix is an overview tool, endpoint context is a drill-down)
- Scatter plot: n is too small in typical SEND studies (40-80 animals) for scatter to be visually informative; the rho statistic is more honest than a noisy scatter at n=15

### Organ system level — ADD (correlation matrix)

**Format:** Small correlation matrix (heatmap triangle)
**Scope:** All continuous endpoints within the organ system
**Question answered:** "Is this organ's response coherent or fragmented?"

This is the highest-value addition. Rationale:
- An organ system typically has 3-8 continuous endpoints — the matrix is compact and readable
- Shows internal structure: are all liver endpoints moving together (coherent hepatotoxic response) or is only ALT elevated while everything else is normal (isolated signal)?
- Non-duplicative: no other pane answers this question. Syndromes tell you about cross-organ patterns. The endpoint-level table shows one row's perspective. The matrix shows the organ as a whole.
- Natural drill-down: user sees matrix at organ level → clicks a cell → navigates to endpoint-level detail

**Design considerations:**
- Use neutral grayscale heat (per CLAUDE.md: heatmap matrices use neutral grayscale, `getNeutralHeatColor()`)
- Diagonal is trivially 1.0 — show only lower triangle
- Color-code by |rho|, not signed rho (direction shown via ↑↑ or ↑↓ glyph)
- Only include endpoints with individual subject data (n >= 10)
- Interaction: hover shows rho, n, p-value tooltip; click navigates to endpoint pair

### Syndrome level — ADD (validation summary)

**Format:** Summary statistic + optional mini-matrix
**Scope:** Correlations among syndrome member endpoints
**Question answered:** "Is this syndrome statistically supported in this study, or just rule-matched?"

This is a novel signal that no other pane provides. Rationale:
- Syndromes are detected by rule-matching (presence/direction of member endpoints). But rule-matched ≠ biologically correlated in this study.
- A syndrome whose members have high pairwise rho is strongly supported. One whose members are statistically independent may be coincidental co-occurrence.
- Summary stat: median pairwise |rho| among syndrome members, with interpretive label (e.g., "Strong co-variation: median |ρ| = 0.74" vs "Weak co-variation: median |ρ| = 0.18 — pattern may be coincidental")
- Mini-matrix: optional expandable view for syndromes with 4+ members

**Design considerations:**
- Syndrome members may span domains/organs — this is an intentional cross-organ correlation, distinct from the endpoint-level within-organ scope
- Some members are incidence endpoints (histopath) — these can't participate in Spearman correlation. Show which members are included/excluded.
- This requires the correlation engine to compute cross-organ pairs for syndrome members specifically (currently only computes within-organ)

### Domain level — SKIP

**Rationale:** Domain is an administrative grouping (LB, BW, OM, CL, MI, MA), not a biological one. A "Clinical Chemistry" correlation matrix mixes liver enzymes, kidney markers, and metabolic parameters into one noisy view. The organ-system matrix captures the biological clustering more naturally.

If domain-level context panels are added for other purposes, correlations should not be one of the panes.

### Pattern level — SKIP

**Rationale:** Patterns (overrides) are user-curated groupings — the user already decided these endpoints belong together. Correlating them is circular: high rho confirms the user's judgement but doesn't add information; low rho might confuse without adding actionable signal.

## Implementation priority

1. **Organ system correlation matrix** — highest value, clearest non-duplication. Spec: `docs/incoming/organ-correlation-matrix.md`
2. **Syndrome validation summary** — novel signal, but **blocked on resolving the cross-organ correlation computation question** (see below)

## Backend implications

- Current `correlations.py` groups by organ system and computes within-organ pairs only
- Organ-system matrix: no new computation needed — just reshape existing pairwise data into matrix form during pane assembly
- Syndrome validation: requires new computation path — collect syndrome member endpoint keys, compute pairwise correlations across organ boundaries

### Syndrome validation — computation strategy (must resolve before implementing)

The current `correlations.py` is within-organ only. Syndrome validation requires cross-organ pairs (e.g., ALT in hepatic ↔ liver weight in hepatic is within-organ, but ALT ↔ BW is cross-organ). Two options:

**Option A: Lazy (on-request).** Compute cross-organ correlations only when a syndrome context panel is opened. Pros: no upfront cost, only computed when needed. Cons: latency on panel open (residualized Spearman across all syndrome member pairs), cold-start visible to user.

**Option B: Precomputed.** Expand `compute_correlations()` to also compute syndrome-member pairs cross-organ during the pipeline run. Pros: instant panel load. Cons: increases precomputation time, syndrome member list must be available at pipeline time (currently detected in frontend via `cross-domain-syndromes.ts`).

**Recommendation:** Resolve this before writing the syndrome validation spec. The answer affects whether syndrome detection needs to move (partially) to the backend, which is a larger architectural decision.

## Resolved questions

1. ~~Organ system matrix — threshold for display?~~ → Show matrix for >= 3 continuous endpoints. For exactly 2, show text summary ("A ↔ B: ρ = X"). For < 2, show "insufficient" message.
2. ~~Clickable navigation from matrix cells~~ → Navigate to the row endpoint (left axis). Simple, no signal-score dependency.
3. ~~Organ system context panel — does it exist?~~ → Yes. `OrganContextPanel.tsx` with Convergence, Normalization, NOAEL, Related Syndromes, Member Endpoints panes.

## Open questions

1. **Syndrome validation — how to handle mixed data types?** Syndromes often include both continuous (LB, BW) and incidence (MI, MA) endpoints. Only continuous pairs can be correlated. Is a partial validation (continuous members only) still useful?
2. **Syndrome validation — lazy vs precomputed?** See "computation strategy" section above.

## Architectural invariant: organ system assignment

The `organ_system` field is stamped at precomputation time, not derived at query time. The canonical mapping pipeline (verified in codebase):

- **`ORGAN_SYSTEM_MAP`** (56 entries) in `backend/services/analysis/send_knowledge.py` — specimen → organ system
- **`BIOMARKER_MAP`** in the same file — LB test code → organ system
- **`get_organ_system()`** in `backend/generator/organ_map.py` — single orchestrator (priority: specimen > test_code > domain > "general")
- **`findings_pipeline.py:_enrich_finding()`** — single enrichment point

**Rule:** One endpoint = one organ system. No multi-membership. If a cross-organ view is needed (e.g., organ weight overview), that's a separate dedicated pane, not a property of the correlation matrix.

**Known tech debt:** `ORGAN_SYSTEM_TO_SPECIMENS` in `OrganContextPanel.tsx:426-435` is a manually-maintained reverse map (8 organ systems, ~20 specimens) used for normalization lookup. Should eventually be derived from backend canonical map, but doesn't affect correlation matrix (which uses the backend `organ_system` field directly).

## References

- Syndromes: `cross-domain-syndromes.ts` (cross-domain detection), `syndrome-rules.ts` (histopath-specific)
- Correlations computation: `backend/services/analysis/correlations.py`
- Context pane assembly: `backend/services/analysis/context_panes.py`
- Design constraint: CLAUDE.md "Heatmap matrices use neutral grayscale heat"
