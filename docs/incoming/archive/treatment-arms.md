# Treatment Arms / Dose Groups

## What this does

Surfaces dose group information (arm codes, labels, dose values, subject counts per sex) in the Study Summary Details tab and the HTML report. Currently `build_dose_groups()` exists in the backend but its output is not exposed through the metadata API or rendered in the UI. This feature wires the existing extraction through to the frontend.

## User workflow

1. User navigates to a study's summary page and selects the Details tab
2. Below "Study overview", a "Treatment arms" section shows a table with one row per dose group: arm code, label, dose (value + unit), male count, female count, total
3. If the study has no DM domain (so dose groups cannot be derived), the section is omitted
4. When the user generates an HTML report, the "Dose Groups" table shows arm codes, labels, dose values, and subject counts instead of just dose level numbers

## Data model

### Current state

- `build_dose_groups()` in `backend/services/analysis/dose_groups.py` reads DM + TX domains and returns `{ dose_groups, subjects, tx_map }`. It is called by the analysis pipeline but NOT by the metadata extraction.
- `StudyMetadata` (backend Pydantic model in `models/schemas.py`) has no `dose_groups` field.
- `StudyMetadata` (frontend TypeScript interface in `types/index.ts`) has no `dose_groups` field.
- `DoseGroup` interface already exists in `frontend/src/types/analysis.ts` with the correct shape.
- The HTML report generator derives dose groups from signal summary data (`dose_level` / `dose_label`), which only has level numbers and labels — no arm codes, dose values, or subject counts.

### Dynamic ARMCD mapping (resolves HC-01)

The current `build_dose_groups()` uses `ARMCD_TO_DOSE_LEVEL = {"1": 0, "2": 1, "3": 2, "4": 3}`, which only works for PointCross. In SEND, ARMCD values are sponsor-defined and vary widely: `"C"/"L"/"M"/"H"`, `"CTRL"/"LOW"/"MID"/"HIGH"`, `"1"/"2"/"3"/"4"`, etc. This spec replaces the hardcoded map with dynamic derivation.

**Algorithm — derive dose levels from DM + TX:**

1. **Discover all ARMCDs** from `DM.ARMCD` (the actual subject assignments)
2. **Identify recovery arms** (see HC-02 below) and exclude them from the main dose group list
3. **Identify satellite/TK arms** — arms where TX contains `TXPARMCD = "TKGRP"` or the ARM label contains "satellite" or "toxicokinetic" (case-insensitive). Exclude from the main dose group list.
4. **For remaining (main study) arms**, determine dose values:
   - If TX provides `TRTDOS` for the arm, use that numeric value
   - If no TX domain exists, dose values are unknown (show "—")
5. **Assign `dose_level`** by sorting main arms by `dose_value` ascending. Arms with `dose_value = 0` or `None` and a label matching control patterns (`"control"`, `"vehicle"`, case-insensitive) get `dose_level = 0`. Remaining arms get `dose_level = 1, 2, 3, ...` in dose order. If dose values are unavailable, assign levels in the order arms appear in DM.
6. **Remove `ARMCD_TO_DOSE_LEVEL` constant** — it is no longer needed.

### Dynamic recovery arm detection (resolves HC-02)

The current `RECOVERY_ARMCDS = {"1R", "2R", "3R", "4R"}` relies on naming convention, which varies across sponsors (`"REC1"/"REC2"`, `"R1"/"R2"`, `"1R"/"2R"`, explicit names).

**Algorithm — derive recovery arms from TX:**

1. If TX domain exists and has `TXPARMCD` column, find all `SETCD` values where `TXPARMCD = "RECOVDUR"` (recovery duration parameter). The corresponding `ARMCD` values (from TX params or DM matching) are recovery arms.
2. **Fallback**: if TX has no `RECOVDUR` entries, fall back to pattern matching on `DM.ARM` label — arms containing `"recovery"` (case-insensitive) are treated as recovery arms.
3. **Remove `RECOVERY_ARMCDS` constant** — it is no longer needed.

Recovery arms are excluded from the main dose groups list but are still tracked in the subject roster (`is_recovery = True`) for use by other analysis modules.

### API endpoint

**`GET /api/studies/{study_id}/metadata`** — already exists, returns `StudyMetadata`. After this change, the response includes a new `dose_groups` array.

Response (new field):
```json
{
  "...existing fields...",
  "dose_groups": [
    {
      "dose_level": 0,
      "armcd": "1",
      "label": "Vehicle Control",
      "dose_value": 0.0,
      "dose_unit": "mg/kg/day",
      "n_male": 15,
      "n_female": 15,
      "n_total": 30
    }
  ]
}
```

When dose groups cannot be derived (no DM domain, or extraction fails), `dose_groups` is `null`.

### Changes required

**`backend/models/schemas.py`** — Add `DoseGroupSchema` model and `dose_groups` field to `StudyMetadata`:

```python
class DoseGroupSchema(BaseModel):
    dose_level: int
    armcd: str
    label: str
    dose_value: float | None = None
    dose_unit: str | None = None
    n_male: int
    n_female: int
    n_total: int

class StudyMetadata(BaseModel):
    # ...existing fields...
    dose_groups: list[DoseGroupSchema] | None = None
```

**`backend/services/analysis/dose_groups.py`** — Replace hardcoded constants with dynamic derivation:

1. Remove `ARMCD_TO_DOSE_LEVEL` and `RECOVERY_ARMCDS` constants
2. Add `_find_recovery_armcds(tx_df)` helper: scans TX for `TXPARMCD = "RECOVDUR"`, returns set of recovery ARMCDs. Falls back to pattern matching on ARM labels if TX has no RECOVDUR.
3. Add `_find_satellite_armcds(tx_df)` helper: scans TX for `TXPARMCD = "TKGRP"` or ARM labels containing "satellite"/"toxicokinetic".
4. In `build_dose_groups()`:
   - Discover all ARMCDs from `DM.ARMCD.unique()`
   - Call `_find_recovery_armcds()` and `_find_satellite_armcds()` to identify non-main arms
   - Filter to main study arms (exclude recovery + satellite)
   - Sort main arms by `dose_value` (from tx_map) ascending; assign `dose_level` starting at 0 for control
   - Iterate over sorted main arms instead of `ARMCD_TO_DOSE_LEVEL.keys()`
   - Update `map_dose_level()` to use the dynamically-built mapping instead of the hardcoded dict
   - Tag `is_recovery` using the dynamically-derived set instead of `RECOVERY_ARMCDS`

```python
def _find_recovery_armcds(tx_df: pd.DataFrame | None, dm_df: pd.DataFrame) -> set[str]:
    """Identify recovery arm codes from TX RECOVDUR or ARM label fallback."""
    recovery = set()
    if tx_df is not None and "TXPARMCD" in tx_df.columns:
        recovdur_sets = tx_df.loc[tx_df["TXPARMCD"] == "RECOVDUR", "SETCD"].unique()
        for setcd in recovdur_sets:
            set_rows = tx_df[tx_df["SETCD"] == setcd]
            for _, row in set_rows.iterrows():
                if str(row.get("TXPARMCD", "")).strip() == "ARMCD":
                    recovery.add(str(row["TXVAL"]).strip())
    if not recovery and "ARM" in dm_df.columns:
        for armcd in dm_df["ARMCD"].unique():
            arm_label = str(dm_df.loc[dm_df["ARMCD"] == armcd, "ARM"].iloc[0])
            if "recovery" in arm_label.lower():
                recovery.add(str(armcd).strip())
    return recovery
```

**`backend/services/xpt_processor.py`** — In `extract_full_ts_metadata()`, after building TS metadata, call `build_dose_groups()` if the study has a DM domain. Use a local import to avoid circular dependency (dose_groups.py imports `read_xpt` from xpt_processor.py).

```python
dose_groups = None
if "dm" in study.xpt_files:
    try:
        from services.analysis.dose_groups import build_dose_groups
        result = build_dose_groups(study)
        dose_groups = result["dose_groups"]
    except Exception:
        pass
```

Pass `dose_groups=dose_groups` to the `StudyMetadata` constructor.

**`frontend/src/types/index.ts`** — Add `dose_groups` to `StudyMetadata` interface. Import or re-declare `DoseGroup` (the interface already exists in `types/analysis.ts`):

```typescript
import type { DoseGroup } from "./analysis";

export interface StudyMetadata {
  // ...existing fields...
  dose_groups: DoseGroup[] | null;
}
```

**`frontend/src/components/analysis/StudySummaryView.tsx`** — In `DetailsTab`, add a "Treatment arms" section between "Study overview" and "Treatment". Only render when `meta.dose_groups` is non-empty.

Table columns: Arm (monospace ARMCD), Label, Dose (value + unit or "—"), M, F, Total. Use the same styling as other metadata sections.

Also add an amber warning banner at the top of `DetailsTab` when no TS metadata could be extracted (all of `species`, `study_type`, `title`, `start_date` are null), explaining that the study may have encoding issues or missing TS parameters.

**`frontend/src/lib/report-generator.ts`** — In the Study Design section, replace the signal-derived dose map with `metadata.dose_groups` when available. Show columns: Arm, Label, Dose, M, F, Total. Fall back to the existing signal-derived approach when `dose_groups` is null (for studies where extraction failed).

## UI specification

### Treatment arms table (DetailsTab)

Position: Between "Study overview" section and "Treatment" section.

```
TREATMENT ARMS
─────────────────────────────────────────────────────
Arm    Label              Dose           M    F   Total
1      Vehicle Control    0 mg/kg/day    15   15   30
2      Low Dose           5 mg/kg/day    15   15   30
3      Mid Dose           20 mg/kg/day   15   15   30
4      High Dose          80 mg/kg/day   15   15   30
```

- Section header: same style as "Study overview" (`text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b`)
- Table: `w-full text-sm` with standard row styling
- Arm column: `font-mono` for ARMCD
- Dose column: `tabular-nums` — show `"{dose_value} {dose_unit}"` or "—" if null
- Count columns (M, F, Total): `text-right tabular-nums`
- Omit entire section when `dose_groups` is null or empty

### Warning banner

When `species`, `study_type`, `title`, and `start_date` are all null:

```
⚠ Limited metadata — TS domain parameters could not be extracted.
  This study may have encoding issues or a missing/incomplete TS domain.
```

Style: `rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800` with `TriangleAlert` icon.

Position: Top of DetailsTab, before the study title.

## Integration points

### Systems touched

- **`docs/systems/data-pipeline.md`** — `extract_full_ts_metadata()` gains a new dependency on `build_dose_groups()`. The metadata extraction pipeline now reads DM+TX in addition to TS.

### Views touched

- **`docs/views/study-summary.md`** — Treatment arms table is a new section in the Details tab.

### Dependencies

- `build_dose_groups()` in `dose_groups.py` imports `read_xpt` from `xpt_processor.py`. Calling `build_dose_groups()` from `extract_full_ts_metadata()` (also in `xpt_processor.py`) would create a circular import. **Use a local import inside the function** to avoid this — this pattern is already documented in MEMORY.md.

## Acceptance criteria

### Wiring (metadata → UI)
- When a study has DM and TX domains, the Treatment arms table appears in the Details tab with arm codes, labels, dose values, and subject counts
- When a study has DM but no TX domain, arm labels are derived from DM.ARM and dose values show "—"
- When a study has no DM domain, the Treatment arms section is omitted (no error)
- When `build_dose_groups()` fails (e.g., unexpected column structure), the failure is caught silently and the section is omitted
- The HTML report shows arm codes, labels, dose values, and subject counts when `dose_groups` is available
- The HTML report falls back to signal-derived dose labels when `dose_groups` is null
- When all key TS metadata fields are null, an amber warning banner appears at the top of the Details tab

### Dynamic ARMCD mapping (HC-01)
- Studies with numeric ARMCDs ("1"/"2"/"3"/"4") continue to produce correct dose groups
- Studies with alphabetic ARMCDs (e.g., "C"/"L"/"M"/"H") produce dose groups with correct labels and dose values from TX
- `dose_level` is assigned by ascending dose value order (control = 0), not by ARMCD string
- Studies with no TX domain still produce dose groups (with dose values as "—") by reading DM.ARM for labels
- `ARMCD_TO_DOSE_LEVEL` constant is removed from `dose_groups.py`

### Dynamic recovery arm detection (HC-02)
- Recovery arms are identified by `TXPARMCD = "RECOVDUR"` in TX domain, not by hardcoded set
- When TX has no RECOVDUR entries, recovery arms are identified by "recovery" in DM.ARM label
- Recovery arms are excluded from the main dose groups list
- `RECOVERY_ARMCDS` constant is removed from `dose_groups.py`
- Satellite/TK arms (identified by TXPARMCD="TKGRP" or ARM label) are also excluded from main dose groups

### Build
- `npm run build` passes
- Backend starts without error

## Datagrok notes

In the production Datagrok plugin:
- Dose group metadata would likely come from Datagrok's study registration or a database, not parsed from XPT at runtime
- The dynamic ARMCD mapping and recovery arm detection in this spec handle the sponsor variation problem; Datagrok may still want a manual override UI for edge cases
- The Treatment Arms table would use Datagrok's native grid component

## Open questions

None. HC-01 (dynamic ARMCD mapping) and HC-02 (dynamic recovery arm detection) are addressed in this spec.
