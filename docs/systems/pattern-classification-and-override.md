# Pattern Classification & Override System

> **Scope:** Dose-response pattern classification, user pattern overrides, and the downstream re-derivation chain.

## Pattern Classification

**File:** `backend/services/analysis/classification.py`

The generator classifies each finding's dose-response pattern using pooled SD equivalence bands. Patterns: `flat`, `monotonic_increase`, `monotonic_decrease`, `threshold_increase`, `threshold_decrease`, `non_monotonic`, `u_shaped`.

Key design choice: `_pooled_sd()` includes the control group (all-groups RMS). This stabilizes the estimate when treatment compresses or inflates variability at high doses. Matches EFSA pooled-all approach (fixed in commit `4a5b91c`).

No authoritative equivalence band threshold exists in the regulatory literature (confirmed across PHUSE, OECD, FDA, EMA, PMDA, ICH). The algorithm's pattern is always a proposal — hence the override system.

## Pattern Override Pipeline

**Files:**
- `backend/services/analysis/override_reader.py` — core logic
- `backend/routers/analysis_views.py` — serving layer (`_apply_overrides()`) + preview endpoint
- `backend/annotations/{study_id}/pattern_overrides.json` — persisted overrides
- `frontend/src/components/analysis/panes/PatternOverrideDropdown.tsx` — UI

### Override Flow

1. User selects a new pattern in `PatternOverrideDropdown` (direction-independent labels: `no_change`, `monotonic`, `threshold`, `non_monotonic`, `u_shaped`)
2. Frontend PUTs to `/api/annotations/{study_id}/pattern-override/{finding_id}`
3. Backend persists to `pattern_overrides.json`
4. On next data serve, `_apply_overrides()` calls `apply_pattern_overrides()` which:

### Re-derivation Chain (critical ordering)

When a pattern override is applied, **all downstream fields must re-derive**:

```
dose_response_pattern (overridden)
  → treatment_related (reads pattern)
    → finding_class (ECETOC A-1 factor reads pattern)
      → _confidence (D2 reads pattern, D5 reads cross-sex sibling's finding_class)
```

`apply_pattern_overrides()` handles this: it updates the pattern, calls `determine_treatment_related()`, calls `assess_finding()`, then calls `compute_all_confidence()` on ALL findings (because D5 cross-sex linkage means changing one finding's class can affect its sibling's confidence).

### Direction Resolution

Override labels are direction-independent. `_resolve_override()` maps them using the finding's existing `direction` field:
- `monotonic` → `monotonic_increase` or `monotonic_decrease`
- `threshold` → `threshold_increase` or `threshold_decrease`
- `u_shaped`, `non_monotonic`, `flat` → direction-independent

The finding's original `direction` field is preserved unchanged.

### Override Metadata

Each overridden finding gets `_pattern_override` with: `pattern` (label), `original_pattern`, `original_direction`, `timestamp`.

### Preview Endpoint

`GET /api/analysis/{study_id}/pattern-override-preview/{finding_id}/{pattern}` returns the re-derived finding without persisting — used for inline preview in the dropdown.
