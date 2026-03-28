# Generator Pipeline Performance Optimization

> Generated from implementation — not a design spec. Created for review gate.

## Overview

Three optimizations to the study analysis generator pipeline that reduce instem (worst-case: 9 dose groups, 471 findings, 25 XPT files) from 280s to 124s (56% faster). No changes to generated output — purely internal execution strategy.

## Behavior

### B1: Parallel domain computations via ProcessPoolExecutor

- **What:** All domain findings modules (LB, BW, OM, MI, MA, TF, CL, DS, EG, VS, BG, FW, IS) across all 3 passes are submitted concurrently to a `ProcessPoolExecutor(max_workers=4)`. Passes 1 (all animals), 2 (scheduled-only), and 3 (main-only) run concurrently since they are independent — each produces a separate findings list collected afterward.
- **When:** Every `compute_all_findings()` call during Phase 1b of the generator pipeline.
- **Unless:** If a domain function raises an exception, it propagates via `fut.result()` and halts generation (no silent fallback).
- **How:** `concurrent.futures.ProcessPoolExecutor` with `max_workers=4`. Each domain function receives read-only copies of `study` (StudyInfo), `subjects` (DataFrame), and optional `excluded_set`/`last_dosing_day`. Worker processes bypass GIL, enabling true CPU parallelism for scipy-heavy computations (Dunnett's, Williams', ANCOVA). Results are collected via `fut.result()` in submission order per pass.
- **Code:** `backend/generator/domain_stats.py:135-209`
- **Impact:** OM (104s x 2 passes = 209s sequential) and LB (37s x 2 passes = 75s sequential) now overlap. Wall time limited by slowest single domain (~107s).

### B2: Dunnett/JT reuse in stats enrichment loop

- **What:** The final stats enrichment loop (ANOVA/Dunnett/JT per continuous finding) reuses already-computed values from domain modules instead of re-calling `scipy.stats.dunnett` and `trend_test`.
- **When:** A continuous finding has a non-empty `pairwise` field (domain module already computed Dunnett) AND `domain != "OM"`.
- **Unless:** OM findings always recompute Dunnett fresh because OM's `pairwise` is computed on the recommended metric (ratio_to_bw, ratio_to_brain, or absolute) which may differ from `raw_values` (always absolute). Findings without `pairwise` also compute fresh.
- **How:**
  - `dunnett_p`: extracted as `[pw.get("p_value_adj") for pw in pairwise]` for non-OM domains. OM and findings without pairwise call `_dunnett_p()`.
  - `jt_p`: reuses `finding["trend_p"]` when present (same JT computation). Falls back to `_jonckheere_terpstra_p()` otherwise.
  - `anova_p`: always computed fresh (only 0.43s total — not worth caching).
- **Code:** `backend/generator/domain_stats.py:263-317`
- **Impact:** 44s -> 7s (214 reused, 122 computed for instem).

### B3: Groupby-based incidence recovery iteration

- **What:** `compute_incidence_recovery()` replaces a 4-deep nested loop (specimens x findings x sexes x dose_levels) with a single `groupby` + union-of-keys iteration.
- **When:** Every `build_recovery_verdicts()` call during Phase 1h of the generator pipeline.
- **Unless:** N/A — always active.
- **How:**
  - Old: Iterated over the Cartesian product of all unique specimens, findings, sexes, and dose levels. For MI with instem: ~30 specimens x ~20 findings x 2 sexes x 9 dose levels = ~10,800 iterations, each applying 4 boolean mask operations on a 7065-row DataFrame.
  - New: Groups `main_df` and `rec_df` by `[specimen_col, obs_col, "SEX", "dose_level"]` once, builds dict-of-groups, iterates over the union of existing group keys (~85 groups for MI). Roster lookups use a pre-indexed dict `(sex, dose_level, is_recovery) -> (n, dose_label)` instead of repeated DataFrame filtering.
- **Code:** `backend/services/analysis/incidence_recovery.py:255-361`
- **Impact:** MI: 31.0s -> 0.22s (141x). MA: 4.4s -> 0.02s (220x). CL: 1.8s -> 0.10s (18x). Total Phase 1h: 36s -> 0.9s.

## Data Dependencies

No new data dependencies. All inputs and outputs are unchanged:

- **Inputs:** `StudyInfo`, `subjects` DataFrame, XPT files (read-only)
- **Outputs:** `unified_findings.json` (471 findings with `dunnett_p`, `jt_p`, `anova_p`), `recovery_verdicts.json` (91 findings, 0 subjects for instem)

Verified: LB `dunnett_p` values match `pairwise.p_value_adj` exactly. Recovery row counts unchanged (MI: 85, MA: 14, CL: 186).

## Reused Patterns

- `concurrent.futures.ProcessPoolExecutor` — same pattern as `ThreadPoolExecutor` already used in Phases 1c-e and 2b-5 of `generate.py`
- `pandas.DataFrame.groupby()` — standard pattern used throughout the codebase

## Constraints and Tradeoffs

- **Memory:** 4 worker processes each import scipy/numpy/pandas (~200-300 MB). With 4 workers: ~1 GB extra peak memory. Acceptable for desktop deployment.
- **OM exclusion from Dunnett reuse (B2):** OM's `pairwise` field contains Dunnett results from the *recommended* normalization metric (ratio_to_bw, ratio_to_brain, or ancova), while `raw_values` always contains absolute arrays. Reusing would silently produce wrong `dunnett_p` values for OM.
- **ProcessPoolExecutor on Windows:** Uses `spawn` (not `fork`), which pickles all arguments. `StudyInfo` (paths + strings) and `subjects` (DataFrame, ~241 rows) are small — serialization overhead is negligible.
- **Timing diagnostics retained:** `domain_stats.py` prints `domain computations: Xs (parallel)` and `stats enrichment: Xs (Dunnett: N reused, M computed)` during generation. These are informational, not debug prints.

## Verification Checklist

- [ ] B1: instem generates 471 findings across 10 domains (same as before optimization)
- [ ] B1: FFU-Contribution-to-FDA generates 295 findings across 7 domains (no regression)
- [ ] B1: PointCross generates successfully (no regression)
- [ ] B2: For non-OM continuous findings, `dunnett_p[i]` == `pairwise[i].p_value_adj` for all i
- [ ] B2: OM findings still have fresh-computed `dunnett_p` (not reused from pairwise)
- [ ] B2: `jt_p` matches `trend_p` for findings that have both
- [ ] B3: MI recovery row count unchanged (85 rows for instem)
- [ ] B3: MA recovery row count unchanged (14 rows for instem)
- [ ] B3: CL recovery row count unchanged (186 rows for instem)
- [ ] B3: Recovery verdicts unchanged (91 per_finding entries for instem)
- [ ] Overall: instem total generation time < 150s (was 280s)
- [ ] Overall: FFU total generation time < 30s (was 25s, should not regress significantly)
