# Correlation Pane — Phased Fix

**Date:** 2026-02-17
**Affects:** CorrelationsPane, correlations.py, context_panes.py
**Status:** Phase 1 + Phase 2 complete

---

## Root cause

Correlations are computed on dose-group means (n=4). With 4 data points, any two monotonically-trending endpoints produce |rho|=1.0. All 50 stored correlations have |rho|=1.0. The pane adds zero information — it's effectively just checking "do both endpoints trend with dose?" which the scatter already shows.

Three stacked bugs compound the problem:

1. **All rho=1.0** — useless signal from n=4 group means
2. **Sex mismatch** — correlations are M-only (top-50 cutoff fills with M pairs first), but `pickBestFinding` often selects F (better p-value). The pane shows "No correlated findings" for most selections even when M correlations exist for that endpoint.
3. **LB grouping** — LB findings have `specimen: null`, so grouping falls back to `domain: "LB"`. ALL LB endpoints (liver enzymes, hematology, renal, electrolytes) get correlated against each other — ALT vs Calcium, Neutrophils vs Glucose, etc.

---

## Phase 1 (now): Hide the pane when correlations are based on group means

```typescript
// In context panel rendering:
const showCorrelations = correlationBasis === "individual" && correlationN >= 10;
// If false, don't render CorrelationsPane at all — no empty state, just gone
```

No warning message, no "insufficient data" placeholder. The pane disappears. The panel gets shorter, the remaining panes get more breathing room. The pane reappears automatically when real data exists.

A warning label on useless data is the worst option — it still occupies space, and users either trust the rho=1.0 values (drawing false biological conclusions) or learn to skip the pane entirely (ignoring it when real correlations eventually appear).

---

## Phase 2 (done): Individual animal residualized correlations

Implemented 2026-02-17. All three bugs fixed:

1. **Individual animal data** — `raw_subject_values` (USUBJID → value dicts) added to LB/BW/OM findings builders. Correlations use Option A residualization: subtract (dose_level, sex) group mean per animal, then Spearman on residuals. Removes dose trend while preserving biological co-variation. n≈78 (both sexes pooled), real rho range 0.13–0.92.
2. **Sex mismatch fixed** — Endpoints keyed by (domain, test_code, day) regardless of sex. M and F findings pooled. Context pane matches by endpoint key, not finding_id. Both sexes see the same correlations.
3. **LB grouping fixed** — Endpoints grouped by `organ_system` instead of `specimen or domain`. ALT correlates with AST/ALB/ALP (hepatic), not with Neutrophils/Calcium.

Additional fix: **Per-organ-system cutoff** (top 15 per organ) replaces global top-50 to prevent hematologic (153 pairs) from crowding out other systems.
