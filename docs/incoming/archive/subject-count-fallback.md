# Subject Count Fallback from DM Domain

## What this does

When a study's TS (Trial Summary) domain does not contain the `SPLANSUB` parameter (planned number of subjects), the subject count shows as "—" in the landing page studies table and in metadata views. This change falls back to counting unique `USUBJID` values in the DM (Demographics) domain, so studies missing `SPLANSUB` still display a subject count.

## User workflow

1. User opens the landing page
2. User sees the studies table with a "Subjects" column
3. **Before fix:** Studies without `SPLANSUB` in TS show "—" for subjects
4. **After fix:** Those studies show the actual subject count derived from DM

No user action required — the fallback is automatic and transparent.

## Data model

### How subject count is currently derived

`extract_full_ts_metadata()` in `backend/services/xpt_processor.py` reads the TS domain and maps `TSPARMCD = "SPLANSUB"` to `StudyMetadata.subjects` (a string). The `GET /api/studies` endpoint in `routers/studies.py` converts this to an integer for `StudySummary.subjects`.

When `SPLANSUB` is absent from TS (common in older or non-standard studies), `subjects` is `None` and the UI shows "—".

### The fallback

In `extract_full_ts_metadata()`, after building the TS map, if `SPLANSUB` is not present:

1. Check if the study has a `dm` domain (`"dm" in study.xpt_files`)
2. Read the DM domain via `read_xpt()`
3. Normalize column names to uppercase (`df.columns = [c.upper() for c in df.columns]`)
4. Count unique `USUBJID` values: `str(df["USUBJID"].nunique())`
5. Use this as the `subjects` value

The fallback count represents actual subjects enrolled (from DM) rather than planned subjects (from TS). This is a reasonable approximation — in completed studies, actual enrollment typically matches the plan.

### Changes required

**`backend/services/xpt_processor.py`** — `extract_full_ts_metadata()`:

After building `ts_map` and before constructing the `StudyMetadata` return value, add the fallback:

```python
# Subject count fallback: if SPLANSUB missing, count unique USUBJID in DM
subjects = g("SPLANSUB")
if not subjects and "dm" in study.xpt_files:
    try:
        dm_df, _ = read_xpt(study.xpt_files["dm"])
        dm_df.columns = [c.upper() for c in dm_df.columns]
        if "USUBJID" in dm_df.columns:
            subjects = str(dm_df["USUBJID"].nunique())
    except Exception:
        pass
```

Then use `subjects` instead of `g("SPLANSUB")` in the `StudyMetadata` constructor.

The same fallback pattern should also apply to `males` and `females` — if `PLANMSUB`/`PLANFSUB` are missing but DM has `SEX`, count `USUBJID` where `SEX == "M"` and `SEX == "F"` respectively. This is optional but complements the subject count fallback.

## UI specification

No UI changes. The studies table and metadata views already display `subjects` when present. The fallback populates the same field.

## Integration points

### Systems touched

- **`docs/systems/data-pipeline.md`** — `extract_full_ts_metadata()` is part of the metadata extraction pipeline. The fallback adds a secondary data source (DM domain) when TS is incomplete.

### Files modified

- `backend/services/xpt_processor.py` — `extract_full_ts_metadata()` only

### No downstream impact

- `StudyMetadata.subjects` type remains `str | None` — no schema change
- `StudySummary.subjects` conversion (`int(float(...))`) already handles string-to-int
- Frontend types unchanged
- No cache invalidation needed — metadata is computed fresh on startup and import

## Acceptance criteria

- When a study has `SPLANSUB` in TS, subject count comes from TS (existing behavior unchanged)
- When a study lacks `SPLANSUB` but has a DM domain, subject count shows the number of unique `USUBJID` values
- When a study lacks both `SPLANSUB` and DM, subject count shows "—"
- When the DM domain cannot be read (e.g., encoding error), the fallback fails silently and subject count shows "—"
- Column names in DM are matched case-insensitively (uppercase normalization)
- `npm run build` passes
- Backend starts without error

## Datagrok notes

In the production Datagrok plugin, study metadata would likely come from a database or Datagrok's data connection metadata rather than from parsing XPT files at startup. The fallback logic would not be needed if metadata is pre-populated during study registration.

## Open questions

None.
