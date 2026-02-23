# Recovery Start Day Override

## What this does

Lets a reviewer manually override the auto-detected last dosing day when the system gets it wrong (TE domain missing, ambiguous epochs, or non-standard study design). The override changes the treatment/recovery phase boundary, which reclassifies which records are pooled vs. separated across all in-life domains.

## Why it's needed

`compute_last_dosing_day()` in `phase_filter.py` uses two methods:
1. **TE/TA domains** — walk arm epochs, accumulate durations, find treatment epoch end
2. **TS.DOSDUR** — parse dosing duration from trial summary (assumes dosing starts Day 1)

Both methods fail when:
- TE domain is absent and DOSDUR is missing or wrong
- Epoch names don't contain "treatment" or "dosing" (non-standard naming)
- Multi-phase designs where dosing doesn't start on Day 1
- Amended protocols where the actual dosing period differs from what was planned

When detection fails (`None`), recovery animals are **excluded entirely** from treatment-period stats (safe but wasteful — discards valid data). When detection is wrong (returns an incorrect day), the phase boundary silently misclassifies records.

## User workflow

1. Reviewer opens Study Details view, sees "Auto-detected: Day 92–105 (14 days)" in the recovery period section
2. Reviewer notices the auto-detected boundary is wrong (e.g., protocol says dosing ended Day 85, not Day 91)
3. Reviewer checks "Override recovery start day" checkbox
4. A number input appears, pre-filled with the auto-detected value (or blank if auto-detection failed)
5. Reviewer enters the correct last dosing day (e.g., 85)
6. System shows a confirmation: "This will re-analyze all treatment-period statistics. N records will be reclassified. Continue?"
7. On confirm: backend re-runs the pipeline with the override, frontend refreshes all analysis data
8. Display updates to "Override: Day 86–99 (14 days)" with a "Reset to auto-detected" link
9. Override persists with the study (visible to all reviewers)

## Data model

### Storage

Use the existing annotations system. Add `"analysis-settings"` to `VALID_SCHEMA_TYPES` in `annotations.py`.

```json
// annotations/{study_id}/analysis_settings.json
{
  "last_dosing_day_override": 85,
  "modified_by": "User",
  "modified_at": "2026-02-23T17:00:00Z"
}
```

This is the single source of truth. The generator reads it; the frontend reads it via the annotations API; the UI writes it via the annotations API.

### Backend flow

```
UI → PUT /api/annotations/{study_id}/analysis-settings
   → POST /api/analysis/{study_id}/regenerate  (new endpoint)
   → generator reads override from analysis_settings.json
   → compute_last_dosing_day() returns override value instead of auto-detected
   → all downstream domain_stats, temporal, cross_animal_flags use the override
   → new JSON files written to generated/{study_id}/
   → frontend invalidates React Query cache, re-fetches
```

### API changes

**New endpoint — trigger re-generation:**
```
POST /api/analysis/{study_id}/regenerate
Response: { "status": "ok", "last_dosing_day": 85, "findings_count": 1247 }
```

Runs `generate(study_id)` with the current `analysis_settings.json` applied. Returns summary stats so the frontend knows re-generation succeeded.

**Modified function — `compute_last_dosing_day()`:**
```python
def compute_last_dosing_day(
    study: StudyInfo,
    override: int | None = None,  # ← new parameter
) -> int | None:
    if override is not None:
        return override
    # ... existing auto-detection logic unchanged ...
```

**Modified function — `compute_all_findings()`:**
```python
def compute_all_findings(
    study: StudyInfo,
    early_death_subjects: dict[str, str] | None = None,
    last_dosing_day_override: int | None = None,  # ← new parameter
) -> tuple[list[dict], dict]:
    last_dosing_day = compute_last_dosing_day(study, override=last_dosing_day_override)
    # ... rest unchanged ...
```

**Modified — `generate()` in `generate.py`:**
```python
def generate(study_id: str):
    # Read analysis settings override (if any)
    settings_path = ANNOTATIONS_DIR / study_id / "analysis_settings.json"
    last_dosing_day_override = None
    if settings_path.exists():
        settings = json.loads(settings_path.read_text())
        last_dosing_day_override = settings.get("last_dosing_day_override")

    # Pass through to compute_all_findings
    findings, dg_data = compute_all_findings(
        study, early_death_subjects=early_death_subjects,
        last_dosing_day_override=last_dosing_day_override,
    )
```

**Modified — `temporal.py` router:**
The `/api/temporal/{study_id}/bw` and `/api/temporal/{study_id}/lb` endpoints also call `compute_last_dosing_day()`. They need the same override path:
```python
# Read override from analysis_settings.json (same as generator)
override = _get_last_dosing_day_override(study_id)
last_dosing_day = compute_last_dosing_day(study, override=override)
```

## UI specification

### Location

Study Details context panel → Analysis settings → Subject population info pane → Recovery period section. Same location as the current disabled checkbox.

### Components

**Checkbox + input (override inactive):**
```
Recovery period
  Auto-detected: Day 92–105 (14 days)
  Arms: 1R, 4R
  [Treatment period pooling dropdown]
  ☐ Override last dosing day
```

**Checkbox + input (override active):**
```
Recovery period
  Override: Day 86–99 (14 days)    ← updated range
  Arms: 1R, 4R
  [Treatment period pooling dropdown]
  ☑ Override last dosing day
    Last dosing day: [85___]
    ⚠ 42 BW records reclassified (treatment → recovery)
    Re-analyze    Reset to auto-detected
```

**Reclassification summary:** After the user enters an override value (before confirming), show a preview of the impact:
- Count of records that move from treatment → recovery (override < auto-detected)
- Count of records that move from recovery → treatment (override > auto-detected)
- Per-domain breakdown if more than one domain is affected

This preview is computed client-side by comparing the override day against the auto-detected day and the known record day values. It does NOT require re-generation — it's an estimate based on `last_dosing_day` metadata already in the generated JSON.

**States:**
- Auto-detected OK → checkbox unchecked, shows auto-detected range, input hidden
- Auto-detected failed (null) → checkbox unchecked, shows "Auto-detection failed — override recommended", input hidden but checkbox highlighted
- Override active → checkbox checked, input visible with current value, shows overridden range + reclassification count
- Re-analyzing → spinner on "Re-analyze" button, all other controls disabled
- Re-analysis complete → flash confirmation, data refreshes

### Persistence

The override is per-study, not per-session. It persists via the annotations API (`analysis-settings` schema). All reviewers see the same override. This is an analytical decision that affects data interpretation — it must be shared.

Remove the current `useSessionState` for `recoveryOverride` — it serves no purpose if the real override is server-persisted.

## Integration points

| System | File | Change |
|--------|------|--------|
| Phase filter | `phase_filter.py` | `compute_last_dosing_day()` accepts override param |
| Domain stats | `domain_stats.py` | `compute_all_findings()` passes override through |
| Generator | `generate.py` | Reads `analysis_settings.json`, passes override |
| Temporal router | `temporal.py` | Reads override for live BW/LB endpoints |
| Cross-animal flags | `cross_animal_flags.py` | `_get_recovery_start_days()` — not affected (per-animal from SE domain, different from study-level last dosing day) |
| Food consumption | `food_consumption_summary.py` | Uses its own `_find_epoch_boundaries()` from SE domain — needs same override path |
| Annotations router | `annotations.py` | Add `"analysis-settings"` to `VALID_SCHEMA_TYPES` |
| Annotations router | `annotations.py` | New `POST /api/analysis/{study_id}/regenerate` endpoint (or separate router) |
| Frontend context panel | `StudyDetailsContextPanel.tsx` | Replace disabled checkbox with functional override UI |
| Frontend hooks | New `useAnalysisSettings` hook | Read/write `analysis-settings` via annotations API |
| Frontend cache | React Query | Invalidate all study queries on re-generation |
| Study metadata | `study_signal_summary.json` | Include `last_dosing_day` (auto-detected) and `last_dosing_day_override` (if set) so frontend knows both values |

## Acceptance criteria

- When TE/TA domains are present and unambiguous, auto-detection works as before (no regression)
- When the reviewer enters an override, re-generation uses the override value for all in-life domain statistics
- When the override is cleared (reset), the system reverts to auto-detection
- The override persists across sessions and is visible to all reviewers
- The reclassification preview shows the correct count of affected records before re-analysis
- After re-analysis, all views reflect the new phase boundary (treatment-period N changes, recovery-period ranges update)
- The `temporal.py` live endpoints (BW/LB trends) also respect the override
- When auto-detection returns `None`, the UI highlights the override option as recommended

## Datagrok notes

In the production Datagrok plugin, the re-generation step would be replaced by live query re-execution (Datagrok computes on the fly from the data connection). The override value would be stored in the project's settings or as a tag on the study data frame. The UI would use a standard Datagrok property panel input.

## Open questions

1. **Scope of re-generation.** Currently `generate()` rebuilds all 8+ JSON files. Should the regenerate endpoint rebuild everything, or only the affected outputs (in-life domain stats + food consumption + cross-animal flags)? Full rebuild is simpler and safer; partial is faster. Recommendation: full rebuild — it takes <10s for PointCross and correctness matters more than speed.

2. **Audit trail.** Should the override include a reason field (e.g., "Protocol amendment extended dosing by 7 days")? The spec stores `modified_by` and `modified_at`, but a free-text reason would help future reviewers understand why the override exists. Recommendation: add optional `reason` field.

3. **Food consumption boundaries.** `food_consumption_summary.py` uses `_find_epoch_boundaries()` which reads SE domain independently from `compute_last_dosing_day()`. Should it also accept the override? Recommendation: yes — add the same override parameter to maintain consistency.
