# Magnitude Floors Gap Analysis — Current Implementation vs v0.2.0 Config

**Date:** 2026-02-19
**Input:** `magnitude-floors-research-summary.md` + `magnitude-floors-config.json`
**Baseline:** Current implementation in `cross-domain-syndromes.ts` (ENDPOINT_CLASS_FLOORS)

---

## Threshold Discrepancies

| Class | Current impl | v0.2.0 config | Delta |
|-------|-------------|---------------|-------|
| Leukocyte primary (WBC, NEUT, LYMPH) | g=0.8, FC=0.10 | g=0.8, FC=0.15 | FC too tight |
| Leukocyte rare (MONO, EOS, BASO) | g=0.8, FC=0.10 | g=0.8, FC=0.30 + concordance | FC way too tight, missing concordance |
| RBC indices (MCV, MCH, MCHC) | g=0.8, FC=0.10 | g=1.0, FC=0.05 | g too low, FC too high |
| Platelets (PLAT) | g=0.8, FC=0.10 | g=0.8, FC=0.15 | FC too tight |
| Coagulation (PT, APTT, FIB) | g=0.5, FC=0.25 | g=0.8, FC=0.15 | g too low, FC too high |
| Electrolytes | g=0.5, FC=0.10 | g=0.8, FC=0.10 | g too low |

## Missing Endpoints

- LDH not in liver_enzymes
- MG not in electrolytes
- FOOD consumption — entirely missing class (g=0.5, FC=0.10)

## Missing Organ Weight Granularity

Current: all OM at g=0.8, FC=0.10 (uniform).

v0.2.0 splits into 3 classes:
- General (liver, kidney, heart, spleen, lung, brain): g=0.8, FC=0.10 + ratio_policy
- Reproductive (testis, epididymis, ovary, uterus, prostate): g=0.8, FC=**0.05**
- Immune (thymus, adrenal): g=0.8, FC=0.10 + adrenal organ:brain ratio

The 5% reproductive floor is critical — testis changes of 5% can indicate toxicity.

## Missing Advanced Features

1. **RETIC conditional override** — Relax from 25% to 15% when concordant anemia (≥2 of RBC/HGB/HCT decreased and meeting floors)
2. **Rare leukocyte concordance** — MONO/EOS/BASO require ≥1 primary leukocyte (WBC/NEUT/LYMPH) changing same direction
3. **Organ weight ratio_policy** — organ:BW or organ:brain ratios when BW exceeds its floor
4. **Liver enzyme certainty_cap_policy** — Single enzyme at 1.5x → max pattern_only certainty

## What's Correct

- Erythroid (RBC, HGB, HCT): g=0.8, FC=0.10 ✓
- Liver enzymes: g=0.5, FC=0.50 ✓ (minus LDH and certainty cap)
- Renal: g=0.5, FC=0.20 ✓
- Body weight: g=0.5, FC=0.05 ✓
- Clinical chemistry: g=0.5, FC=0.25 ✓
- OR gate logic ✓
- "Opposite" exemption ✓
- General organ weight base floor (g=0.8, FC=0.10) ✓

## XS09 Split (separate scope)

v0.2.0 formalizes XS09a (systemic wasting) vs XS09b (organ atrophy) with exclusivity rules.
This is a syndrome definition change, not a magnitude floor change per se.

---

## Implementation Plan

### Phase 1: Threshold corrections + missing endpoints — DONE

Rewrote `ENDPOINT_CLASS_FLOORS` (9 → 13 entries). Split hematology into 5 subclasses. Fixed coagulation (g=0.8, FC=0.15), electrolytes (g=0.8, +MG). Added LDH, FOOD, TP, FIB. Split organ weights into 3 subclasses via `getOrganWeightFloor()`. Updated validator FLOOR_LOOKUP.

### Phase 2: RETIC conditional override — DONE

Added `hasConcordantAnemia()` + third `allEndpoints` parameter to `checkMagnitudeFloor()`. RETIC floor relaxes from 25% to 15% when ≥2 of RBC/HGB/HCT are ↓ AND each meets erythroid floor.

### Phase 3: Rare leukocyte concordance — DONE

Added `hasLeukocyteConcordance()`. MONO/EOS/BASO must have ≥1 primary leukocyte (WBC/NEUT/LYMPH) shifting same direction AND either significant (p≤0.05) or meaningful effect (|g|≥0.5 or |FC-1|≥0.05). Without concordance, the finding is blocked even if it passes the magnitude floor.

### Phase 4: Liver enzyme certainty cap — DONE

Added XS01-specific cap in `applyCertaintyCaps()`. Single liver enzyme → `pattern_only` max. Upgrade paths: MI hepatocellular injury, ≥2 coherent liver enzymes, liver weight increase. Per Ramaiah 2017.

### Phase 5: Organ weight ratio policy (DEFERRED)

Ratio policy requires organ:BW and organ:brain ratio data, which the current data pipeline doesn't compute/expose to the frontend. This needs backend changes first.

### Phase 6: XS09 split (DEFERRED)

Separate syndrome definition change — tracked separately.

---

### Gate per phase

- Build passes (`npm run build`)
- All tests pass (`npm test`)
- Review packet regenerated
- No unexpected syndrome changes in PointCross

### Expected test count

Starting: 478 tests. Phase 1: +0 (config only). Phases 2-4: +1-2 each for new invariants.
