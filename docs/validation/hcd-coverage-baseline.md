# HCD Coverage Baseline (Phase-1)

**Cycle:** `hcd-mi-ma-s08-wiring` (F7 AC-F7-2, F9 AC-F9-1)
**Date:** 2026-04-22
**Generator run:** PointCross SD rat, subchronic (default settings)

This baseline records the fraction of MI/MA catalog-matched findings whose
`hcd_evidence.background_rate` is populated (non-null). Phase-1 is the first
end-to-end wiring — the numbers below are the denominator future cycles
calibrate against. No threshold is asserted.

## F9 AC-F9-1: populated-rate baseline (PointCross)

| Metric | Count |
|---|---|
| Total MI endpoint rule results | 91 |
| Catalog-matched (C01–C15) | 16 |
| `hcd_evidence` record attached | 16 / 16 |
| `background_rate` populated | 0 / 16 |

**Populated fraction:** 0 / 16 (0%).

**Why zero on PointCross:** The 84-row seed (Charles River Crl:CD(SD) + legacy
mock) indexes general rat findings (kidney basophilia, cardiomyopathy,
pituitary hypertrophy, etc.) rather than the catalog-matched findings on
PointCross (principally C04/C05 neoplasia and C13 lymphoid depletion, which
fire under SEND finding strings that do not overlap the seed's canonical
terms). This is the expected Phase-1 behavior under the narrow-crosswalk
discipline — tier-4 substring fallback is explicitly disabled (AC-F6-3), so
crosswalk misses return explicit empty records rather than false positives.

## F7 AC-F7-2: reliable-cell fraction baseline

The NTP IAD Histopathology ingest (F7) is **deferred** pending resolution of
DATA-GAP-MIMA-17 (direct CSV download URL, pinned release, SHA256 manifest).
The reliable-cell fraction will be recorded here after F7 lands.

Current seed-only baseline (for comparison):

| Metric | Count |
|---|---|
| Total rows in `hcd_mi_incidence` | 84 |
| Rows with `n_animals >= 100` | 0 |
| Reliable-cell fraction | 0% |

The seed does not populate `n_animals` (it tracks study-count only). F7
ingest introduces per-cell N and is the first pass at meeting the ≥10%
reliability target.

## How to regenerate this baseline

```bash
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe \
    -m generator.generate PointCross
# Then count populated hcd_evidence.background_rate on rule_results.json
```

## Related gaps

- DATA-GAP-MIMA-17 — NTP IAD provenance (blocks F7)
- DATA-GAP-MIMA-18 — Chamanza/Chandra sign-off (blocks F8)
- DATA-GAP-MIMA-19 — crosswalk sign-off (blocks F6 expansion)
- RG-MIMA-25 — crosswalk validation corpus
