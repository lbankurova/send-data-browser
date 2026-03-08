# Pattern Classification Fix + Override Dropdown

**Status:** In progress (Phase 1)
**Source:** `docs/deep-research/engine/brief 9/`
**Date:** 2026-03-08

---

## Context

No authoritative equivalence band threshold exists for preclinical dose-response trend classification (confirmed across PHUSE, OECD, FDA, EMA, PMDA, ICH). The algorithm's pattern is always a proposal, never a ruling.

Active regression (commit 7e70de9): `_pooled_sd()` excludes control group, causing false `non_monotonic` classifications when treatment compresses high-dose variability.

---

## Phase 1: Backend Pattern Fix (A1-A5)

### A1: Fix `_pooled_sd()` to include control

**File:** `backend/services/analysis/classification.py:95-109`

Switch from treated-only to all-groups RMS pooled SD. Matches EFSA pooled-all approach.

```python
def _pooled_sd(group_stats: list[dict]) -> float:
    """Compute pooled SD across all dose groups (RMS of per-group SDs).

    Including control stabilises the estimate when treatment compresses
    or inflates variability at high doses.  Matches EFSA pooled-all approach.
    """
    sds = [g["sd"] for g in group_stats if g.get("sd") is not None and g["sd"] > 0]
    if sds:
        return math.sqrt(sum(s ** 2 for s in sds) / len(sds))
    means = [g["mean"] for g in group_stats if g.get("mean") is not None]
    if len(means) >= 2:
        avg = sum(means) / len(means)
        return math.sqrt(sum((m - avg) ** 2 for m in means) / (len(means) - 1))
    return 0.0
```

### A2: Tiered CV%-based equivalence fractions

**File:** `backend/services/analysis/classification.py`

Three-tier system from brief:

| Tier | CV%   | Fraction | Endpoints |
|------|-------|----------|-----------|
| 1    | < 10% | 0.5 SD   | BW, brain, heart, RBC, total protein, albumin |
| 2    | 10-20%| 0.5 SD   | Liver, kidney, ALT, AST, glucose, platelets |
| 3    | > 20% | 0.75 SD  | Spleen, thymus, adrenals (mouse), WBC, triglycerides, bilirubin, reproductive organs |

Tier 2 "equivocal at 0.75-1.0 SD" flagging deferred to confidence annotation pass.

Unknown test codes default to Tier 1 (conservative — tighter band = more sensitive) and log at INFO for lookup growth.

```python
_TIER_FRACTIONS = {1: 0.5, 2: 0.5, 3: 0.75}

_HIGH_CV_TESTS = {
    "SPLWT", "THYWT", "ADWT", "UTWT", "OVWT",
    "WBC", "EOS", "BASO",
    "TRIG", "BILI", "TBILI", "GGT",
}

_MODERATE_CV_TESTS = {
    "LIVWT", "KIDWT", "LNWT",
    "ALT", "AST", "GLUC", "PLAT",
}

_KNOWN_TIER1_TESTS = {
    "BWSTRESN", "BRWT", "HTWT",
    "RBC", "HGB", "HCT", "MCV", "MCH", "MCHC",
    "TP", "ALB",
}

def _equivalence_tier(test_code: str) -> int:
    tc = (test_code or "").upper()
    if tc in _HIGH_CV_TESTS:
        return 3
    if tc in _MODERATE_CV_TESTS:
        return 2
    if tc and tc not in _KNOWN_TIER1_TESTS:
        log.info("Unknown test_code '%s' defaulting to Tier 1 (0.5 SD)", tc)
    return 1

def _equivalence_fraction(test_code: str) -> float:
    return _TIER_FRACTIONS[_equivalence_tier(test_code)]
```

### A3: Thread `test_code` through pipeline

**File:** `backend/services/analysis/findings_pipeline.py`

In `_enrich_finding()`, pass `test_code` to `classify_dose_response()`:

```python
dr_result = classify_dose_response(
    f.get("group_stats", []),
    f.get("data_type", "continuous"),
    test_code=f.get("test_code"),
)
```

### A4: Regenerate PointCross

```bash
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe -m generator.generate PointCross
```

### A5: Diff validation

Compare unified_findings.json before/after. Verify:
- BW M/F: non_monotonic -> threshold_decrease (known regression fix)
- No new regressions in LB/OM endpoints
- Document all classification changes

---

## Phase 2: Backend Override Infrastructure (B1-B3)

### B1: Add `pattern-overrides` annotation schema

**File:** `backend/routers/annotations.py:13-20`

Add `"pattern-overrides"` to `VALID_SCHEMA_TYPES`.

Data shape (stored in `annotations/{study_id}/pattern_overrides.json`):

```json
{
  "BW_M_BWSTRESN_terminal": {
    "pattern": "threshold",
    "original_pattern": "non_monotonic",
    "original_direction": "down",
    "timestamp": "2026-03-07T12:00:00Z"
  }
}
```

### B2: Apply overrides in pipeline — after enrichment, before ECETOC

**File:** `backend/services/analysis/findings_pipeline.py`

Insert `apply_pattern_overrides()` between `enrich_findings()` and `compute_corroboration()` in `process_findings()`:

```python
def process_findings(..., study_id: str | None = None):
    ...
    enriched = enrich_findings(base_findings)
    if study_id:
        enriched = apply_pattern_overrides(enriched, study_id)
    enriched = compute_corroboration(enriched)
    enriched = _assess_all_findings(enriched, ...)
    enriched = compute_all_confidence(enriched)
    return enriched
```

`apply_pattern_overrides()` replaces pattern AND re-derives TR:

```python
def apply_pattern_overrides(findings: list[dict], study_id: str) -> list[dict]:
    overrides = load_all_pattern_overrides(study_id)
    if not overrides:
        return findings
    for f in findings:
        ov = overrides.get(f.get("id"))
        if not ov:
            continue
        f["_pattern_override"] = {
            "pattern": ov["pattern"],
            "original_pattern": f["dose_response_pattern"],
            "original_direction": f.get("direction"),
            "timestamp": ov.get("timestamp"),
        }
        f["dose_response_pattern"] = _resolve_override(ov["pattern"], f.get("direction", "down"))
        f["treatment_related"] = determine_treatment_related(f)
    return findings
```

**`_resolve_override()` — u_shaped is direction-independent by design:**

```python
def _resolve_override(override_pattern: str, direction: str) -> str:
    """Map direction-independent override label to backend pattern string.

    u_shaped is direction-independent by design -- it captures both
    downturn-at-high-dose and inverted-U shapes. Downstream consumers
    that switch on pattern must handle u_shaped without assuming a
    single direction. The finding's original direction field is preserved
    unchanged; it reflects the algorithmic assessment, not the override.
    """
    _MAP = {
        "no_change": "flat",
        "monotonic": {"up": "monotonic_increase", "down": "monotonic_decrease"},
        "threshold": {"up": "threshold_increase", "down": "threshold_decrease"},
        "non_monotonic": "non_monotonic",
        "u_shaped": "u_shaped",
    }
    mapped = _MAP.get(override_pattern, override_pattern)
    if isinstance(mapped, dict):
        return mapped.get(direction, mapped.get("down", override_pattern))
    return mapped
```

### B3: Add `u_shaped` pattern handling

- `classification.py` `_score_treatment_relatedness()`: u_shaped -> 0.5 pts (same as non_monotonic)
- `confidence.py:86`: already has u_shaped in _DOWNGRADE_PATTERNS
- `determine_treatment_related()`: no change needed (doesn't check specific patterns)

---

## Phase 3: Frontend Override UI (B4-B8)

### B4: Add `_pattern_override` to `UnifiedFinding` type

**File:** `frontend/src/types/analysis.ts`

```typescript
_pattern_override?: {
  pattern: string;
  original_pattern: string;
  original_direction: string | null;
  timestamp: string;
};
```

### B5: PatternOverrideDropdown component

**File:** `frontend/src/components/analysis/panes/PatternOverrideDropdown.tsx` (new)

- Renders in endpoint verdict section, per-sex level
- Plain text (algorithmic) vs override indicator (pencil icon + tooltip showing original)
- 5 options: No change, Monotonic, Threshold, Non-monotonic, U-shaped
- Saves via `PUT /api/studies/{studyId}/annotations/pattern-overrides/{findingId}`
- **Inline preview deferred** to fast-follow (FF-01)

Design rules:
- Neutral gray styling (no colored badges for categorical identity)
- Override indicator: subtle pencil icon + tooltip, not colored badge

### B6: Wire `u_shaped` to signal scoring

**File:** `frontend/src/lib/findings-rail-engine.ts`

```typescript
const PATTERN_WEIGHTS: Record<string, number> = {
  ...existing,
  u_shaped: 0.5,
};
```

### B7: `u_shaped` PatternGlyph

**File:** `frontend/src/components/ui/PatternGlyph.tsx`

Add inverted parabola SVG glyph.

### B8: Cache invalidation on override save

Optimistically update `dose_response_pattern` in React Query cache, invalidate `unified-findings` query.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Tiered CV% test_code mapping incomplete | Unknown codes default to Tier 1 (conservative 0.5 SD) + log at INFO for growth |
| Including control in pooled SD over-widens band | Control has natural variability; EFSA and PHUSE both use it |
| u_shaped breaks existing filters | Add to all enums, weights, glyphs; existing non_monotonic filter catches as fallback |
| Override propagation to NOAEL | Pattern override re-derives TR. ECETOC and confidence run after override in pipeline |
| Side effects on LB/OM endpoints from pooled SD fix | Validate against known cases from commit 05fd855 |
| Regeneration clears overrides | **Confirmed safe.** generate.py writes to generated/ only. annotations/ untouched |

## Deferred

- **FF-01:** Pattern override downstream preview — lightweight backend simulation endpoint
- **Tier 2 equivocal flagging:** confidence annotation when step is 0.75-1.0 SD for Tier 2 endpoints
