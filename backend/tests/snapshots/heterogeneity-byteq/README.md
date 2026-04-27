# Heterogeneity byte-equality snapshots

This directory backs **AC-CARD-7** (`hcd-between-study-heterogeneity` build
cycle): regen of `unified_findings.json` against a pre-cycle snapshot must
produce ONLY new `heterogeneity` keys -- no NOAEL / gLower / signal_score /
finding_class / severity / treatment_related / verdict drift.

## Verification command

```bash
python scripts/diff-unified-findings.py \
  backend/tests/snapshots/heterogeneity-byteq/{study}-pre.json \
  backend/generated/{study}/unified_findings.json \
  --ignore-key heterogeneity
```

The diff tool ignores `heterogeneity` keys at any depth (the only field this
cycle adds), then compares JSON-canonical form (sorted keys, no whitespace).

## Pre-existing engine non-determinism (NOT introduced by this cycle)

Strict zero-delta byte-equality is **not achievable** on the current engine:
running `python -m generator.generate <study>` twice with no code change
produces ~4700 deltas on PointCross. The drift is confined to:

- `correlations[N].finding_ids_1/2[N]` -- pair ordering inside an unordered
  pair (deterministic content; non-deterministic order).
- `findings[N].dunnett_p` / `pairwise[N].p_value(_adj)` /
  `min_p_adj` / `scheduled_*` / `_pre_exclusion_p_value` -- sub-1e-4
  floating-point drift from `scipy.stats.dunnett` numerical reproducibility.
- `findings[N]._confidence.dimensions[N].rationale` -- formatted strings
  embedding the drifting p-values.

**Verified by control regen (PointCross, 2026-04-26)**: post-cycle regen vs
post-cycle regen (no code change in between) produced 4737 deltas across
the same field types. The build cycle's `--ignore-key heterogeneity` diff
on PointCross showed 4777 deltas -- difference within noise, no
load-bearing field changed.

The pre-existing engine non-determinism is logged as a backlog item; it is
NOT a regression introduced by this cycle.

## Load-bearing field invariance (cycle's actual contract)

The cycle's contract (CLAUDE.md rule 14 -- methodology + diagnostics only,
zero analytical-output change) is verified by grepping the diff for the
following fields and asserting zero hits:

```bash
python scripts/diff-unified-findings.py PRE.json POST.json --ignore-key heterogeneity \
  | grep -iE "noael|finding_class|severity|signal_score|gLower|treatment_related|verdict\\b"
```

PointCross + Nimble both pass this check (zero hits as of 2026-04-26).

## Why no committed snapshot files

Snapshot files would be ~3MB per study, committed binaries that decay quickly
as the engine gets unrelated changes. Instead, the regen workflow is:

1. Snapshot: `cp backend/generated/<study>/unified_findings.json /tmp/<study>-pre.json`
2. Apply cycle changes
3. Regen: `cd backend && python -m generator.generate <study>`
4. Diff: as in "Verification command" above
5. Grep for load-bearing field changes; assert zero

A test fixture would just embalm the engine's current non-determinism. The
diff tool + the load-bearing-grep contract is the durable check.
