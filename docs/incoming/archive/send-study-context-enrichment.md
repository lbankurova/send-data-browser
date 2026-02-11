# SEND Study Context Enrichment Layer — Implementation Instruction

## Context

You are implementing a computation layer for the **SEND Data Browser**, a Datagrok plugin (TypeScript) for reviewing preclinical toxicology studies. This layer runs at import time and produces a **denormalized study context** that gets attached to every findings record, so that all data tables are immediately analysis-ready without requiring users to understand SEND's relational model.

The SEND standard stores study design information across multiple **Trial Design domains** (DM, TA, TE, TX, TS, EX). These domains use sponsor-defined coded values (ARMCD, SETCD, SPGRPCD, ETCD) whose internal structure is **not standardized** — different sponsors encode differently. The relationships between codes are defined explicitly in the domain metadata, not in the codes themselves. Therefore: **never parse or regex coded values. Always resolve them through joins.**

---

## 1. Input: Trial Design Domains

On study import, these .XPT files are loaded as separate Datagrok DataFrames:

| Domain | Key columns | What it tells you |
|--------|------------|-------------------|
| **DM** (Demographics) | USUBJID, ARM, ARMCD, SETCD, SEX, SPECIES, STRAIN, RFSTDTC, RFENDTC | Which subject is in which arm/set |
| **TA** (Trial Arms) | ARMCD, ARM, TAETORD, ETCD, EPOCH | What elements occur in what order within each arm |
| **TE** (Trial Elements) | ETCD, ELEMENT, TESTRL, TEDUR | What each element actually is (acclimation, treatment, recovery) |
| **TX** (Trial Sets) | SETCD, SET, TXPARMCD, TXVAL | Set-level parameters: dose, route, species, etc. |
| **TS** (Trial Summary) | TSPARMCD, TSVAL | Study-level parameters: species, route, study type, duration, etc. |
| **EX** (Exposure) | USUBJID, EXTRT, EXDOSE, EXDOSU, EXROUTE, EXFREQ, EXSTDTC, EXENDTC | What each subject actually received |

---

## 2. Output: Enriched Subject Context Table

Produce a single DataFrame called `subject_context` with **one row per USUBJID**. This table becomes the universal join key for all downstream analysis.

### Schema

| Column | Type | Source | Description |
|--------|------|--------|-------------|
| USUBJID | string | DM | Subject identifier (primary key) |
| STUDYID | string | DM | Study identifier |
| ARM | string | DM | Arm label (human-readable) |
| ARMCD | string | DM | Arm code (for joining) |
| SETCD | string | DM | Set code |
| SET | string | TX → join on SETCD | Set label (human-readable) |
| SPGRPCD | string | DM or derived | Study group code |
| SEX | string | DM | M or F |
| SPECIES | string | DM.SPECIES or TS (TSPARMCD = "SPECIES") | Species |
| STRAIN | string | DM.STRAIN or TS (TSPARMCD = "STRAIN") | Strain |
| DOSE | number | See §3 (dose resolution) | Numeric dose value |
| DOSE_UNIT | string | See §3 | Dose unit (e.g., "mg/kg/day") |
| DOSE_LEVEL | string | Derived | Human-readable dose label: "Vehicle Control", "2 mg/kg", "20 mg/kg" |
| DOSE_GROUP_ORDER | int | Derived | Ordinal: 0 = control, 1 = low, 2 = mid, 3 = high, etc. |
| IS_CONTROL | bool | Derived | True if this subject is in a control group |
| ROUTE | string | EX.EXROUTE or TS (TSPARMCD = "ROUTE") | Route of administration |
| FREQUENCY | string | EX.EXFREQ or derived from TA/TE | Dosing frequency (QD, BID, etc.) |
| STUDY_PHASE | string | Derived from TA/TE | "Main Study" or "Recovery" |
| HAS_RECOVERY | bool | Derived from TA | Whether this arm includes a recovery epoch |
| IS_TK | bool | Derived from TX or ARM | Whether this subject is designated for toxicokinetic sampling |
| TREATMENT_START_DY | int | Derived from TE | Study day treatment begins |
| TREATMENT_END_DY | int | Derived from TE | Study day treatment ends |
| RECOVERY_START_DY | int or null | Derived from TE | Study day recovery begins (null if no recovery) |
| SACRIFICE_DY | int or null | DS or derived | Scheduled sacrifice day |

---

## 3. Dose Resolution Logic

Dose extraction is the most critical and error-prone step. Use this cascade — stop at the first method that succeeds:

### Method 1: EX domain (preferred)
```
For each USUBJID:
  1. Filter EX where USUBJID matches
  2. Take EXDOSE (numeric), EXDOSU (unit), EXROUTE, EXFREQ
  3. If multiple EX records exist (dose changes over time), take the MOST COMMON dose
     (mode). Flag if dose varies — this may indicate dose escalation studies.
  4. If EXDOSE = 0 and EXTRT contains "vehicle" or "control" → IS_CONTROL = true, DOSE = 0
```

### Method 2: TX domain (fallback)
```
If EX is absent or incomplete:
  1. Join DM.SETCD → TX.SETCD
  2. Look for TX rows where TXPARMCD = "TRTDOS" → DOSE
  3. TXPARMCD = "TRTDOSU" → DOSE_UNIT
  4. TXPARMCD = "PCNTRL" or TRTDOS = 0 → IS_CONTROL = true
```

### Method 3: ARM label parsing (last resort)
```
If neither EX nor TX provides dose:
  1. Parse DM.ARM for numeric dose: regex /(\d+(?:\.\d+)?)\s*(mg|µg|g|mL)\/?(kg)?/i
  2. Detect control: ARM contains "control" or "vehicle" (case-insensitive)
  3. FLAG this study for user confirmation — ARM parsing is unreliable
```

### Dose ordering
```
After dose extraction:
  1. Sort unique DOSE values ascending
  2. Assign DOSE_GROUP_ORDER: 0 for control (DOSE = 0 or IS_CONTROL), then 1, 2, 3... for
     increasing dose levels
  3. If multiple control types exist (vehicle, sham, untreated), assign all DOSE_GROUP_ORDER = 0
     but differentiate via DOSE_LEVEL label
```

---

## 4. Study Phase Resolution

Determine whether each subject is in the main study or recovery, and whether they are designated for TK.

### Recovery detection
```
For each ARMCD in DM:
  1. Look up TA rows where TA.ARMCD matches
  2. Scan TA.EPOCH values for the arm
  3. If any EPOCH contains "RECOVERY" (case-insensitive) → HAS_RECOVERY = true
  4. Cross-reference with TE: find ETCD for recovery elements →
     get TEDUR to compute RECOVERY_START_DY and duration
```

### TK detection
```
Subject is TK if ANY of:
  - TX contains TXPARMCD = "TKGRP" for this SETCD
  - DM.ARMCD or DM.SETCD contains "TK" (case-insensitive) — use as hint, confirm via TX/TA
  - ARM label contains "toxicokinetic" or "TK" (case-insensitive)
```

### Study phase assignment
```
For each USUBJID:
  If subject's ARM includes recovery epoch AND subject was sacrificed after treatment end:
    STUDY_PHASE = "Recovery"
  Else:
    STUDY_PHASE = "Main Study"
  
  Alternative: If DM.SETCD or DM.ARMCD maps to a set/arm explicitly labeled recovery in TX/TA:
    STUDY_PHASE = "Recovery"
```

---

## 5. Study-Level Metadata

Extract from TS domain into a `study_metadata` dictionary (not a DataFrame — this is a key-value lookup):

| TSPARMCD | Output key | Description |
|----------|-----------|-------------|
| SPECIES | species | Test species |
| STRAIN | strain | Test strain |
| ROUTE | route | Route of administration |
| SSTDTC | study_start | Study start date |
| SENDTC | study_end | Study end date |
| SSTYP | study_type | Study type (e.g., "CHRONIC", "SUBCHRONIC") |
| SDESIGN | study_design | Study design description |
| TRTV | vehicle | Vehicle description |
| SPONSOR | sponsor | Sponsor name |
| TESTCD | test_article | Test article name |

Use this metadata to fill gaps in `subject_context` (e.g., if DM.SPECIES is missing, use TS).

---

## 6. Joining Subject Context to Findings Domains

Once `subject_context` is built, enrich every findings domain by left-joining on USUBJID:

```
For each findings domain (BW, LB, MI, MA, OM, CL, FW, EG, VS, etc.):
  1. Left join: domain_df.join(subject_context, on="USUBJID", how="left")
  2. This adds: DOSE, DOSE_GROUP_ORDER, IS_CONTROL, SEX, STUDY_PHASE, IS_TK,
     HAS_RECOVERY, DOSE_LEVEL, ROUTE, FREQUENCY — to every observation row
  3. After join, every row in every domain carries its full group context
```

### Important: Do NOT physically duplicate columns into domain DataFrames

In Datagrok, use **link columns** or **derived columns** that reference `subject_context` rather than materializing copies. This ensures:
- Single source of truth (edit subject_context → all views update)
- Memory efficiency (no redundant strings across 50,000 BW rows)
- The Datagrok `join → derive → TableView` pipeline (see datagrok-patterns.ts §25)

If Datagrok's link column mechanism is insufficient for the viewers, materialize a lightweight subset: USUBJID, DOSE, DOSE_GROUP_ORDER, IS_CONTROL, SEX, STUDY_PHASE only.

---

## 7. Issue Detection & Resolution Workflow

### Core principle: never block, always compute, recompute on resolution

The enrichment pipeline runs to completion on every import. It computes everything it can with the data available, flags what it couldn't resolve, and proceeds. There is no confirmation dialog, no gate, no blocking step.

Issues are surfaced in two places with different purposes:

1. **Study Summary view** — the first thing the user sees after import. Displays the study design table with provenance messages (ℹ/⚠) explaining how data was interpreted. Warning messages link directly to the Validation view for resolution. This is the natural checkpoint — not a gate, just the obvious first look.
2. **Validation view (Study Design mode)** — where issues are actually resolved. The validation view has two modes, toggled by tab or filter:
   - **Data Quality** — existing CDISC-style checks for data managers
   - **Study Design** — enrichment issues (SD-xxx rules) for toxicologists or study directors, with inline resolution controls

### What "compute what you can" means in practice

| Issue | Pipeline behavior | Impact on analysis views |
|-------|-------------------|-------------------------|
| No control group detected | IS_CONTROL = false for all subjects. DOSE_GROUP_ORDER assigned by dose only. | Data displays normally. Comparative stats (Dunnett's, % vs control, effect size) are null/blank. Provenance message explains why. |
| Orphaned subjects (ARMCD not in TA) | Subjects included using DM.ARM label. Epoch info (treatment duration, recovery) unavailable. | Subject data appears in analysis. Epoch-dependent computations skip these subjects. |
| Ambiguous control | Pipeline makes best guess based on DOSE = 0 or ARM label. Flags for confirmation. | Stats compute with best-guess control. User can correct → recompute. |
| Dose escalation | DOSE = max dose for subject. DOSE_ESCALATION = true. | Group assignment uses max dose. Per-timepoint dose available via EX join. |
| Missing TS params | Metadata gaps filled from fallback domains where possible. | Study summary display incomplete. Stats unaffected. |

### Resolution → recomputation flow

```
User sees provenance message on Summary → clicks link → 
  Validation view opens in Study Design mode, filtered to relevant rule →
    User resolves (e.g., assigns control group via dropdown) →
      subject_context DataFrame updates →
        All downstream stats recompute automatically →
          Analysis views reflect corrected data
```

### Auto-detectable issues

All issues are logged as rows in `validation_results` (category = `STUDY_DESIGN`). None block the pipeline.

- **SD-001:** Orphaned subjects — ARMCD in DM not found in TA
- **SD-002:** Empty arms — ARMCD in TA with no subjects in DM
- **SD-003:** Ambiguous control status — dose/label mismatch, or no control detected
- **SD-004:** Missing TS parameters — incomplete study metadata
- **SD-005:** Dose inconsistency within subject — possible dose escalation
- **SD-006:** Orphaned sets — SETCD in TX with no subjects in DM
- **SD-007:** ARM/ARMCD label mismatch across DM and TA

Full rule specifications are in `send-enrichment-validation-provenance.md`.

---

## 8. Implementation Sequence

```
Step 1:  Load all .XPT → DataFrames (existing import pipeline)
Step 2:  Parse TS → study_metadata dictionary
Step 3:  Parse TA + TE → arm_structure (arm → epochs → elements → durations)
Step 4:  Parse TX → set_parameters (set → dose, route, species, TK designation)
Step 5:  Parse EX → subject_doses (per-USUBJID dose, unit, route, frequency)
Step 6:  Build subject_context DataFrame
         - Start with DM columns
         - Resolve dose (§3 cascade)
         - Resolve study phase / recovery / TK (§4)
         - Fill gaps from study_metadata (§5)
         - Compute DOSE_GROUP_ORDER
Step 7:  Detect issues → emit to validation_results (category = STUDY_DESIGN)
         Pipeline continues regardless of issue count or severity.
Step 8:  Generate provenance messages → emit to provenance_messages array
Step 9:  Left-join subject_context to all findings domains (§6)
Step 10: Proceed to per-domain derived columns (BW stats, LB stats, etc.)
         - Stats that require IS_CONTROL (Dunnett's, % vs control) compute if
           control is detected; columns remain null if not.
         - Stats that don't require control (group means, SDs, trend tests)
           always compute.
Step 11: Open Study Summary view (default on study open)
         - User sees study design table + provenance messages
         - Warning messages link to Validation view (Study Design mode)
         - User can resolve issues there → triggers recomputation from Step 6
```

---

## 9. Edge Cases & Design Decisions

### Multiple control groups
Some studies have vehicle control + sham control + untreated control. All get DOSE_GROUP_ORDER = 0. Differentiate via DOSE_LEVEL label. For statistical comparisons, the **vehicle control** is the default comparator. If ambiguous, provenance message flags it on the summary page; user can reassign via Validation view (Study Design mode).

### Satellite / TK-only groups
TK subjects are excluded from main statistical analysis by default (they are sacrificed at interim timepoints for blood sampling). IS_TK = true flags them. Analysis views should filter `IS_TK = false` unless the user explicitly includes TK subjects.

### Recovery groups
Recovery subjects participated in treatment but were kept alive after dosing ended. They appear in BOTH treatment-period analyses (for their dosing-phase data) and recovery analyses. STUDY_PHASE indicates which epoch a given observation falls in, not which group the subject belongs to.

### Dose escalation studies
If a subject's dose changes over time (detected in EX), store the **maximum dose** in DOSE and add a boolean column `DOSE_ESCALATION = true`. The per-timepoint dose is already in EX and can be joined when needed.

### Missing domains
- No EX → fall back to TX → fall back to ARM parsing
- No TA → cannot determine arm structure; derive from DM.ARMCD + DM.ARM labels, flag via SD-001
- No TX → cannot determine set parameters; derive from DM.SETCD, flag via SD-006
- No TS → study metadata incomplete; populate what you can from DM and EX, flag via SD-004

### Non-standard designs
If the auto-detected structure doesn't fit (e.g., crossover designs, combination dosing), the user corrects via Validation view (Study Design mode). Store user overrides in the Datagrok project metadata so they persist on save/reload.

---

## 10. Study Summary View Integration

The `subject_context` DataFrame directly powers the Study Summary view's study design section. Display a condensed table:

| Group | Dose | Route | Freq | Arms | N (M/F) |
|-------|------|-------|------|------|---------|
| 1 | Vehicle Control | Oral | QD | Main, Recovery | 20 (10/10) |
| 2 | 2 mg/kg | Oral | QD | Main, Recovery, TK | 30 (15/15) |
| 3 | 20 mg/kg | Oral | QD | Main, Recovery, TK | 30 (15/15) |

Below the table, display **provenance messages** (Prov-001 through Prov-007, defined in `send-enrichment-validation-provenance.md`). These are compact ℹ/⚠ annotations explaining how the enrichment layer interpreted the data.

Warning-level provenance messages include a **link to the Validation view**, pre-filtered to Study Design mode and the relevant rule. This is the natural bridge: user sees an issue on the summary page → clicks → lands in validation with the fix controls ready.

This replaces the raw SEND Trial Design table (which is too detailed for a summary). The full TA/TE/TX domain data remains accessible via the Domain Views tree.

---

## 11. Relationship to Existing Spec Sections

This enrichment layer corresponds to:
- **§9.2 computation pipeline, Phase 1** — specifically the DM-derived columns (Dose_Group_Order, Study_Phase)
- **§9.3 common derived column conventions** — the identification & grouping columns that appear in every derived DataFrame
- **§7.4 Study Summary view** — the study design display

It runs **before** any per-domain statistics (BW means, LB fold changes, MI incidences) because those computations require DOSE_GROUP_ORDER and IS_CONTROL to define groups.
