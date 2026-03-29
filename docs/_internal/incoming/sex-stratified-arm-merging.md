# Sex-Stratified Arm Merging

**Status:** Spec draft
**Priority:** P2 (BUG-25 in TODO.md)
**Affected studies:** PDS (confirmed). Any study using SENDIG per-sex arm encoding.

---

## Problem

Some SEND studies encode sex as part of the arm structure rather than having combined-sex arms. PDS is the canonical example:

| ARMCD | GRPLBL | SEXPOP | TRTDOS | SPGRPCD | TCNTRL |
|-------|--------|--------|--------|---------|--------|
| 01 | M-Vehicle | M | 0.0 | M-V | Vehicle Control |
| 09 | F-Vehicle | F | 0.0 | F-V | Vehicle Control |
| 03 | M-Low | M | 20.0 | M-L | — |
| 11 | F-Low | F | 20.0 | F-L | — |
| 04 | M-Medium | M | 200.0 | M-M | — |
| 12 | F-Medium | F | 200.0 | F-M | — |
| 05 | M-High | M | 400.0 | M-H | — |
| 13 | F-High | F | 400.0 | F-H | — |

The engine currently produces **8 dose levels** (M-Vehicle, F-Vehicle, M-Low, F-Low, ...) instead of **4** (Vehicle, Low, Medium, High). This breaks:

1. **Control selection** — multi-control Path C designates M-Vehicle as primary (dose_level=0) and F-Vehicle as secondary (dose_level=-3). Males compare against M-Vehicle correctly, but the UI shows "F-Vehicle" as a comparator option, and female treatment groups compare against the wrong control.
2. **Dose-response analysis** — fragmented across sex-specific groups. Trend tests see 4 male groups and 4 female groups instead of 4 combined groups with per-sex stratification.
3. **Per-sex analysis** — meaningless since each dose group already contains only one sex. The engine's per-sex breakdown within dose groups (e.g., "Vehicle F vs Vehicle M") produces single-sex-vs-nothing.
4. **NOAEL determination** — computed across 8 groups instead of 4, doubling the comparison space.

### Expected behavior

The engine should produce 4 dose groups:

| dose_level | Label | Dose | M subjects | F subjects | Total |
|---|---|---|---|---|---|
| 0 | Vehicle | 0 mg/kg | 18 | 18 | 36 |
| 1 | Low | 20 mg/kg | 13 | 13 | 26 |
| 2 | Medium | 200 mg/kg | 13 | 13 | 26 |
| 3 | High | 400 mg/kg | 18 | 18 | 36 |

Per-sex statistical comparisons (Vehicle-M vs Low-M, Vehicle-F vs Low-F) still happen inside each merged dose group, exactly as they do for studies with combined-sex arms.

---

## Detection

A study has sex-stratified arms when ALL of these are true:

1. **TX.SEXPOP exists** and contains single-sex values (`M`, `F`, `MALE`, `FEMALE`) — not `BOTH`
2. **Both sexes are represented** across different arms (not a single-sex study like Study3)
3. **Matching TRTDOS values** exist across sexes — for each dose value D, there is at least one M arm and one F arm with TRTDOS=D

If only condition 1 is true but not 2 (e.g., Study3 where all arms are `SEXPOP=M`), the study is single-sex, not sex-stratified — no merging needed.

### Implementation

Add detection function in `dose_groups.py`:

```python
def _detect_sex_stratified_arms(tx_map: dict) -> bool:
    """Detect whether arms are sex-stratified (separate M/F arms with matching doses)."""
    sexpop_by_arm = {}
    dose_by_arm = {}
    for armcd, info in tx_map.items():
        sexpop = (info.get("sexpop") or "").strip().upper()
        dose = info.get("dose_value")
        if sexpop in ("M", "F", "MALE", "FEMALE"):
            sexpop_by_arm[armcd] = "M" if sexpop in ("M", "MALE") else "F"
            dose_by_arm[armcd] = dose

    if not sexpop_by_arm:
        return False

    sexes_present = set(sexpop_by_arm.values())
    if sexes_present != {"M", "F"}:
        return False  # Single-sex study

    # Check for matching doses across sexes
    m_doses = {dose_by_arm[a] for a, s in sexpop_by_arm.items() if s == "M"}
    f_doses = {dose_by_arm[a] for a, s in sexpop_by_arm.items() if s == "F"}
    return bool(m_doses & f_doses)  # At least one shared dose value
```

This requires extracting `SEXPOP` from the TX domain into `tx_map`. Currently `_parse_tx()` does not read `SEXPOP`.

---

## Merging strategy

### Step 1: Extract SEXPOP into tx_map

In `_parse_tx()`, add `SEXPOP` to the set of extracted TX parameters. Store as `tx_map[armcd]["sexpop"]`.

### Step 2: Detect and merge in build_dose_groups()

After building the initial `tx_map` and before assigning dose levels:

1. Call `_detect_sex_stratified_arms(tx_map)`
2. If True, build a **dose-value merge map**: group arms by `(TRTDOS, is_control)` and assign each group a single canonical dose level
3. Merge `tx_map` entries: for each dose-value group, pick a canonical ARMCD (prefer the arm that appears first, or the one with more subjects) and a **merged label** (strip the sex prefix from GRPLBL)

### Step 3: Label derivation for merged groups

Current labels from GRPLBL are sex-prefixed: `"M-Vehicle"`, `"F-Low"`. After merging:

- Strip the sex prefix pattern: `M-`, `F-`, `Male `, `Female ` (case-insensitive)
- Fallback: use TRTDOS + TRTDOSU to construct label (e.g., `"20 mg/kg"`)
- Control groups: use TCNTRL value (e.g., `"Vehicle"`) if available
- If GRPLBL doesn't have a sex prefix (edge case), use as-is

```python
def _strip_sex_prefix(label: str) -> str:
    """Remove sex prefix from sex-stratified arm labels."""
    import re
    # Match patterns: "M-Vehicle", "F - Low", "Male Vehicle", "Female-Low"
    cleaned = re.sub(r'^(?:M|F|Male|Female)\s*[-–]\s*', '', label, flags=re.IGNORECASE).strip()
    return cleaned if cleaned else label
```

### Step 4: Subject dose_level reassignment

After merging, subjects from both M and F arms at the same dose value get the same `dose_level` and `DOSE_LEVEL` label. The subject's `SEX` column remains unchanged (still `M` or `F`), which is what the downstream per-sex analysis uses.

Concretely for PDS:
- Subjects in ARMCD=01 (M-Vehicle) and ARMCD=09 (F-Vehicle) both get `dose_level=0`, `DOSE_LEVEL="Vehicle"`
- Subjects in ARMCD=03 (M-Low) and ARMCD=11 (F-Low) both get `dose_level=1`, `DOSE_LEVEL="Low"`
- etc.

### Step 5: Control resolution adjustment

With merging, there is now ONE control group (Vehicle, dose_level=0) containing both M and F subjects, instead of two separate controls triggering multi-control Path C. This simplifies control resolution — the multi-control detection should run AFTER merging so it doesn't see M-Vehicle and F-Vehicle as separate controls.

### Step 6: Recovery arm pairing

Recovery arms follow the same sex-stratified pattern:
- ARMCD=02 (M-Vehicle Recovery) and ARMCD=10 (F-Vehicle Recovery) should both pair with the merged Vehicle group
- SPGRPCD-based pairing still works within each sex (M-V pairs main+recovery for males), but the merged dose_level must be consistent

After merging main arms by dose, recovery arms must be merged the same way — by dose value, ignoring sex prefix.

---

## Downstream impact

### Findings pipeline (no changes needed)

The findings pipeline (`unified_findings.py`, `domain_stats.py`, etc.) groups by `dose_level` from `subject_context.json`. After merging, each dose_level contains both sexes, so per-sex statistics (groupby SEX within dose_level) work correctly — they already expect mixed-sex groups.

### Frontend (no changes needed)

The frontend consumes `DOSE_LEVEL` (label) and `DOSE_GROUP_ORDER` (sort key) from the API. After merging, these contain 4 groups instead of 8, with neutral labels ("Vehicle", "Low", "Medium", "High"). The DoseLabel and DoseHeader components render whatever labels arrive. Per-sex breakdowns use the `SEX` field on each subject/finding row.

### Provenance

Add a provenance message when sex-stratified merging is applied:

```
"Sex-stratified arms detected: {n_male_arms} male + {n_female_arms} female arms merged into {n_merged} dose groups by dose value. Per-sex statistical comparisons preserved within each merged group."
```

Include in `_provenance_hints` so the UI can surface it in the study summary.

---

## Files to modify

| File | Change |
|---|---|
| `backend/services/analysis/dose_groups.py` | Extract SEXPOP in `_parse_tx()`, add `_detect_sex_stratified_arms()`, add merge logic in `build_dose_groups()`, adjust control resolution order |
| `backend/services/analysis/subject_context.py` | No changes needed — consumes dose_level from `build_dose_groups()` output |
| `backend/generator/generate.py` | No changes needed — serializes subject_context as-is |

### Estimated scope

~100-150 lines in `dose_groups.py`:
- SEXPOP extraction in `_parse_tx()`: ~10 lines
- `_detect_sex_stratified_arms()`: ~20 lines
- `_strip_sex_prefix()`: ~5 lines
- Merge logic in `build_dose_groups()`: ~50-80 lines (grouping, label derivation, armcd remapping, recovery handling)
- Provenance message: ~5 lines

---

## Test plan

### Unit verification

1. **PDS produces 4 dose groups** (not 8) with labels Vehicle, Low, Medium, High
2. **Subject counts per merged group** match expected: Vehicle=36 (18M+18F), Low=26, Medium=26, High=36
3. **Single control group** — no multi-control Path C triggered
4. **Per-sex subject identity preserved** — subjects retain correct SEX, ARMCD, dose values
5. **Recovery arm pairing** — recovery subjects correctly assigned to merged dose groups
6. **TK satellite exclusion** — TK subjects still excluded from dose_groups

### Regression

7. **PointCross** (combined-sex arms) — dose groups unchanged (detection returns False)
8. **Study3** (single-sex, all males) — dose groups unchanged (only one sex present)
9. **Study4** (SEXPOP=BOTH) — dose groups unchanged (no single-sex SEXPOP)
10. **All other studies** — regenerate and diff; no changes expected

### Downstream

11. **PDS findings count** — should change (currently 689 findings across 8 groups, expect fewer/different with 4 groups since control comparison changes)
12. **PDS adverse count** — verify reasonable (currently 77 tr_adverse)
13. **Frontend renders 4 dose columns** for PDS (visual verification)

---

## Edge cases

1. **Unequal dose sets across sexes** — if males have doses [0, 20, 200, 400] but females have [0, 20, 400] (missing medium), merge only the shared doses. Sex-specific doses that don't have a match remain as single-sex groups. This should be flagged in provenance.

2. **Different control types across sexes** — if M-Vehicle has TCNTRL="Vehicle Control" but F-Vehicle has TCNTRL="Negative Control", do NOT merge. Only merge when both control classification and dose value match.

3. **Sex prefix stripping produces empty label** — if GRPLBL is just "M" or "F", fall back to TRTDOS+TRTDOSU construction.

4. **SEXPOP values vary within an arm** — if an arm has multiple TX records with different SEXPOP values (shouldn't happen per SENDIG, but data quality varies), use the majority value or skip merging for that arm.
