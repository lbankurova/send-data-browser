# Temporal Evidence API

## What this does

Exposes per-subject, per-timepoint data that already exists in the XPT/CSV cache but is currently aggregated away during view assembly. This is the backend foundation for all temporal and subject-level features.

## User workflow

No direct user interaction — this is a backend-only spec. Downstream specs (02 through 07) consume these endpoints.

## Data model

### Source data

The raw per-subject, per-timepoint data lives in the XPT files and is already cached as CSV in `backend/cache/{study_id}/`. Confirmed availability for PointCross:

| Domain | Records | Subjects | Parameters | Timepoints | Key columns |
|--------|---------|----------|------------|------------|-------------|
| BW | 1,751 | 120 | 1 (body weight) | 18 (weekly, Days 1-92) | USUBJID, BWDY, BWSTRESN, BWSTRESU |
| LB | 5,748 | 120 | 45 (chemistry + hematology + coagulation) | 5 | USUBJID, LBTESTCD, LBTEST, LBCAT, LBSTRESN, LBSTRESU, LBDY, LBSPEC |
| CL | ~1,200+ | 120 | varies (clinical signs, ophthalmology) | ~13 (weekly) | USUBJID, CLTESTCD, CLSTRESC, CLCAT, CLDY |
| MI | ~6,000+ | 120 | ~50 tissues | 1 (terminal) | USUBJID, MISPEC, MISTRESC, MISEV, MIDY |

### New API endpoints

#### 1. Per-subject time-course (continuous domains: BW, LB, OM, FW)

```
GET /api/studies/{study_id}/timecourse/{domain}/{test_code}
```

**Query params:**
- `sex` (optional): "M" or "F" — filter to one sex
- `mode` (optional, default "group"): "group" | "subject"
  - `group`: returns group means ± SD per dose per timepoint
  - `subject`: returns individual subject values per timepoint

**Response (mode=group):**
```json
{
  "test_code": "ALT",
  "test_name": "Alanine Aminotransferase",
  "domain": "LB",
  "unit": "U/L",
  "timepoints": [
    {
      "day": 1,
      "groups": [
        {
          "dose_level": 0,
          "dose_label": "0 mg/kg/day",
          "sex": "M",
          "n": 10,
          "mean": 35.2,
          "sd": 4.1,
          "values": [33, 36, 38, 31, ...]
        }
      ]
    }
  ]
}
```

**Response (mode=subject):**
```json
{
  "test_code": "ALT",
  "test_name": "Alanine Aminotransferase",
  "domain": "LB",
  "unit": "U/L",
  "subjects": [
    {
      "usubjid": "PC201708-1001",
      "sex": "M",
      "dose_level": 0,
      "dose_label": "0 mg/kg/day",
      "arm_code": "1",
      "values": [
        { "day": 1, "value": 33.0 },
        { "day": 29, "value": 38.0 }
      ]
    }
  ]
}
```

#### 2. Clinical observations timecourse

```
GET /api/studies/{study_id}/timecourse/cl
```

**Query params:**
- `finding` (optional): filter to specific finding (CLSTRESC value)
- `category` (optional): filter by CLCAT

**Response:**
```json
{
  "findings": ["NORMAL", "MOURIBUND", "SALIVATION", ...],
  "categories": ["CLINICAL SIGNS", "OPHTHALMOLOGY"],
  "timecourse": [
    {
      "day": 1,
      "counts": [
        {
          "dose_level": 0,
          "dose_label": "0 mg/kg/day",
          "sex": "M",
          "total_subjects": 10,
          "findings": {
            "NORMAL": 10,
            "SALIVATION": 0
          }
        }
      ]
    }
  ]
}
```

#### 3. Subject profile (cross-domain summary for one subject)

```
GET /api/studies/{study_id}/subjects/{usubjid}/profile
```

**Response:**
```json
{
  "usubjid": "PC201708-1001",
  "sex": "M",
  "dose_level": 0,
  "dose_label": "0 mg/kg/day",
  "arm_code": "1",
  "disposition": "TERMINAL SACRIFICE",
  "disposition_day": 30,
  "domains": {
    "BW": {
      "measurements": [
        { "day": 1, "test_code": "BW", "value": 349.0, "unit": "g" },
        { "day": 8, "test_code": "BW", "value": 361.0, "unit": "g" }
      ]
    },
    "LB": {
      "measurements": [
        { "day": 30, "test_code": "ALT", "value": 38.0, "unit": "U/L" },
        { "day": 30, "test_code": "AST", "value": 136.0, "unit": "U/L" }
      ]
    },
    "MI": {
      "findings": [
        { "specimen": "BONE MARROW, FEMUR", "finding": "FAT VACUOLES", "severity": "MILD" },
        { "specimen": "ESOPHAGUS", "finding": "INFLAMMATION", "severity": "MARKED" }
      ]
    },
    "CL": {
      "observations": [
        { "day": 1, "finding": "NORMAL", "category": "CLINICAL SIGNS" },
        { "day": 30, "finding": "MOURIBUND", "category": "CLINICAL SIGNS" }
      ]
    },
    "MA": {
      "findings": [
        { "specimen": "LIVER", "finding": "NORMAL" }
      ]
    }
  }
}
```

#### 4. Subject-level microscopic findings matrix

```
GET /api/studies/{study_id}/histopath/subjects?specimen={specimen}
```

**Response:**
```json
{
  "specimen": "BONE MARROW, FEMUR",
  "findings": ["FAT VACUOLES", "UNREMARKABLE"],
  "subjects": [
    {
      "usubjid": "PC201708-1001",
      "sex": "M",
      "dose_level": 0,
      "findings": {
        "FAT VACUOLES": { "severity": "MILD", "severity_num": 1 },
        "UNREMARKABLE": { "severity": null, "severity_num": 0 }
      }
    }
  ]
}
```

### Implementation approach

Create a new router: `backend/routers/temporal.py` with `APIRouter(prefix="/api")`.

**Data access:** Read from CSV cache (`backend/cache/{study_id}/{domain}.csv`) using the existing `xpt_processor.get_domain_data()` pattern. Join with DM domain for subject metadata (sex, arm code, dose level) via the existing `dose_groups.py` mapping.

**No generator step required.** These endpoints read raw cached data directly — they don't need pre-computation. This is intentional: temporal data is large and endpoint-specific, so it should be computed on demand, not pre-generated for all endpoints.

## Integration points

- **`docs/systems/data-pipeline.md`**: New on-demand router alongside existing `analyses.py` and `analysis_views.py`
- **`backend/services/xpt_processor.py`**: Reuse `get_domain_data()` for CSV cache reads
- **`backend/services/analysis/dose_groups.py`**: Reuse `get_dose_info()` for subject-to-dose mapping
- **`backend/config.py`**: No changes needed (endpoints use existing study discovery)

## Acceptance criteria

- When `GET /api/studies/PointCross/timecourse/bw/BW?mode=group` is called, returns 18 timepoints with 8 groups each (4 dose levels x 2 sexes)
- When `GET /api/studies/PointCross/timecourse/lb/ALT?mode=subject` is called, returns 120 subject records with up to 5 timepoints each
- When `GET /api/studies/PointCross/timecourse/cl` is called, returns observation counts per day/dose/sex
- When `GET /api/studies/PointCross/subjects/PC201708-1001/profile` is called, returns cross-domain summary for that subject
- When `GET /api/studies/PointCross/histopath/subjects?specimen=BONE+MARROW,+FEMUR` is called, returns per-subject findings for that specimen
- Response times < 500ms for all endpoints (data is cached as CSV)
- 404 for unknown study, unknown domain, or unknown subject
- Correctly handles the `RECOVERY_ARMCDS` exclusion (recovery animals filtered out by default)

## Datagrok notes

In production Datagrok, these endpoints may be replaced by direct DataFrame operations on in-memory data. The API contract should be preserved as the interface between viewers and data — whether the data comes from a REST call or a Datagrok DataFrame query. Pattern #2 (DataFrame operations) and Pattern #4 (Viewers) are the relevant Datagrok APIs.

## Open questions

1. Should recovery arm subjects be included (with a flag) or excluded entirely? Current pipeline excludes them. Suggest: exclude by default, add `?include_recovery=true` param for future use.
2. Should derived columns (change-from-baseline, %change, %vs-control) be computed server-side or client-side? Suggest: server-side for the group-mode endpoint (add `baseline`, `pct_change`, `delta_vs_control` fields to each group timepoint); client-side for subject-mode (raw values only, let the chart compute differences).
3. The LB domain has `LBBLFL` (baseline flag) but it's empty for PointCross. Should we use `VISITDY` or `LBDY` to identify baseline? Suggest: first measurement per subject per test (minimum LBDY) as baseline, consistent with how `findings_lb.py` already identifies it.
