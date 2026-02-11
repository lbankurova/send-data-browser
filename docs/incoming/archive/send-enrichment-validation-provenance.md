# Study Context Enrichment — Validation Rules & Provenance Messages

> Addendum to §10 (Rule-based insight engine), §8 (Validation view), and §7.4 (Study Summary view).
>
> **Core principle:** The enrichment pipeline never blocks. It computes everything it can, flags what it couldn't resolve, and proceeds. Issues are surfaced in two places:
> 1. **Study Summary view** — provenance messages (ℹ/⚠) below the study design table. Warning messages link to the Validation view for resolution.
> 2. **Validation view (Study Design mode)** — inline resolution controls for study design issues. The Validation view has two modes:
>    - **Data Quality** — existing CDISC-style checks (data manager audience)
>    - **Study Design** — enrichment interpretation issues with inline fix controls (toxicologist / study director audience)
>
> On resolution → `subject_context` updates → downstream stats recompute → analysis views reflect corrected data.

---

## Part 1: Validation Rules (add to §10)

These rules run during Step 7 of the enrichment pipeline (§7 of `send-study-context-enrichment.md`). They emit rows to the existing `validation_results` DataFrame.

All rules in this section use:
- **Category:** `STUDY_DESIGN`
- **Auto-fixable:** `false` (all require human judgment)
- **Blocks analysis:** `false` (pipeline always continues)
- **Validation view mode:** Study Design

---

### Rule SD-001: Orphaned Subjects

| Field | Value |
|-------|-------|
| **Rule ID** | SD-001 |
| **Severity** | WARNING |
| **Domain(s)** | DM, TA |
| **Condition** | Any USUBJID in DM has an ARMCD value that does not appear in TA.ARMCD |
| **Message template** | `{n} subject(s) in DM have ARMCD '{armcd}' which does not exist in TA. These subjects cannot be mapped to a trial arm structure.` |
| **Records affected** | List of USUBJID values |
| **Guidance** | Verify whether TA is incomplete or DM.ARMCD contains a typo. Subjects will still be included in analysis using DM.ARM label, but epoch-level information (treatment duration, recovery period) will be unavailable for these subjects. |

---

### Rule SD-002: Empty Arms

| Field | Value |
|-------|-------|
| **Rule ID** | SD-002 |
| **Severity** | INFO |
| **Domain(s)** | TA, DM |
| **Condition** | Any ARMCD in TA has no matching USUBJID in DM |
| **Message template** | `Arm '{armcd}' ({arm}) is defined in TA but has no subjects in DM. This may be a TK satellite group or an unused arm.` |
| **Records affected** | ARMCD values (not subject-level) |
| **Guidance** | Empty arms are common for TK satellite groups that were planned but not enrolled, or for study designs that include placeholder arms. No action needed unless subjects are expected. |

---

### Rule SD-003: Ambiguous Control Status

| Field | Value |
|-------|-------|
| **Rule ID** | SD-003 |
| **Severity** | WARNING |
| **Domain(s)** | DM, EX, TX |
| **Condition** | Any of: (a) DOSE = 0 but subject not flagged as control by ARM/EXTRT/TX; (b) ARM or EXTRT contains "control" or "vehicle" but DOSE ≠ 0; (c) No control group detected in entire study |
| **Message template (a)** | `{n} subject(s) have dose = 0 but arm '{arm}' does not indicate control status. Verify whether these are control subjects.` |
| **Message template (b)** | `{n} subject(s) in arm '{arm}' appear to be controls but have non-zero dose ({dose} {unit}). Verify control group assignment.` |
| **Message template (c)** | `No control group detected. Comparative statistics (Dunnett's test, % vs control, effect size) are unavailable until a control group is assigned.` |
| **Records affected** | USUBJID values (a, b) or study-level (c) |
| **Inline resolution** | Dropdown listing all arms/groups. User selects which arm is the control. On confirm → updates IS_CONTROL and DOSE_GROUP_ORDER in subject_context → triggers recomputation of all comparative stats. |
| **Guidance** | When no control is assigned, the pipeline still computes all non-comparative statistics (group means, SDs, dose-response trend tests). Only control-dependent stats are deferred. |

---

### Rule SD-004: Missing Trial Summary Parameters

| Field | Value |
|-------|-------|
| **Rule ID** | SD-004 |
| **Severity** | INFO |
| **Domain(s)** | TS |
| **Condition** | Any of the following TSPARMCD values are missing from TS: SPECIES, STRAIN, ROUTE, SSTDTC, SSTYP |
| **Message template** | `Trial Summary (TS) is missing parameter(s): {missing_list}. Study metadata will be incomplete.` |
| **Records affected** | N/A (study-level) |
| **Guidance** | Missing TS parameters reduce the completeness of the study summary display and may affect automatic route/species detection. Values may be inferred from other domains (DM.SPECIES, EX.EXROUTE) where available. |

---

### Rule SD-005: Dose Inconsistency Within Subject

| Field | Value |
|-------|-------|
| **Rule ID** | SD-005 |
| **Severity** | WARNING |
| **Domain(s)** | EX |
| **Condition** | A single USUBJID has multiple distinct EXDOSE values across EX records (excluding EXDOSE = 0 for washout/placebo periods) |
| **Message template** | `{n} subject(s) have multiple dose levels in EX, suggesting dose escalation or dose modification. Subject {example_usubjid}: doses = {dose_list} {unit}. Maximum dose was used for group assignment.` |
| **Records affected** | USUBJID values |
| **Guidance** | Dose escalation studies require special handling. The enrichment layer assigns DOSE = max dose for group ordering. Per-timepoint dose is preserved in EX and can be joined to findings domains for time-resolved analysis. Review whether max dose is the appropriate grouping strategy for this study. |

---

### Rule SD-006: Orphaned Sets

| Field | Value |
|-------|-------|
| **Rule ID** | SD-006 |
| **Severity** | INFO |
| **Domain(s)** | TX, DM |
| **Condition** | Any SETCD in TX has no matching USUBJID in DM.SETCD |
| **Message template** | `Trial set '{setcd}' ({set}) is defined in TX but has no subjects in DM.` |
| **Records affected** | SETCD values |
| **Guidance** | Similar to empty arms (SD-002). Common for planned-but-unused TK or satellite groups. |

---

### Rule SD-007: ARM/ARMCD Mismatch Across Domains

| Field | Value |
|-------|-------|
| **Rule ID** | SD-007 |
| **Severity** | ERROR |
| **Domain(s)** | DM, TA |
| **Condition** | The same ARMCD maps to different ARM labels in DM vs TA |
| **Message template** | `ARMCD '{armcd}' has different ARM labels: DM says '{dm_arm}', TA says '{ta_arm}'. This is a data integrity issue.` |
| **Records affected** | ARMCD values + affected USUBJID values |
| **Guidance** | This indicates a mapping error between domains. The DM value will be used for subject assignment, but the discrepancy should be investigated and corrected in the source data. |

---

### Validation rules summary table

| Rule ID | Severity | Short description |
|---------|----------|-------------------|
| SD-001 | WARNING | Orphaned subjects (DM ARMCD not in TA) |
| SD-002 | INFO | Empty arms (TA ARMCD with no subjects) |
| SD-003 | WARNING | Ambiguous control status |
| SD-004 | INFO | Missing TS parameters |
| SD-005 | WARNING | Dose inconsistency / escalation within subject |
| SD-006 | INFO | Orphaned sets (TX SETCD with no subjects) |
| SD-007 | ERROR | ARM/ARMCD label mismatch across domains |

---

## Part 2: Provenance Messages (add to §7.4 Study Summary view)

These are **not validation issues**. They are transparency annotations that tell the user how the enrichment layer interpreted the study data. They appear on the Study Summary view, adjacent to the study design table.

### Display location

Add a **provenance panel** directly below the study design summary table on the Study Summary view. This is a compact, non-intrusive block — not a dialog, not a separate pane. Think of it as footnotes to the study design table.

### Visual design

```
┌─────────────────────────────────────────────────────────┐
│  Study Design                                           │
├──────┬─────────────┬────────┬─────┬────┬────┬──────────┤
│ Grp  │ Dose        │ Route  │ Main│ Rec│ TK │ N (M/F)  │
├──────┼─────────────┼────────┼─────┼────┼────┼──────────┤
│ 1    │ 0 (Control) │ Oral   │  ✓  │ ✓  │ —  │ 20(10/10)│
│ 2    │ 2 mg/kg QD  │ Oral   │  ✓  │ ✓  │ ✓  │ 30(15/15)│
│ 3    │ 20 mg/kg QD │ Oral   │  ✓  │ ✓  │ ✓  │ 30(15/15)│
└──────┴─────────────┴────────┴─────┴────┴────┴──────────┘
  ℹ Dose values extracted from EX domain.
  ℹ Route of administration from TS (TSPARMCD = ROUTE).
  ℹ 6 TK subjects detected and excluded from statistical analysis.
  ⚠ 2 subjects have multiple dose levels in EX — max dose used. [Review →]
```

**Link behavior:** Warning-level (⚠) provenance messages include a `[Review →]` link that navigates to the Validation view, pre-filtered to:
- **Mode:** Study Design (not Data Quality)
- **Rule:** The specific SD-xxx rule corresponding to the provenance message

Mapping: Prov-005 → SD-005, Prov-006 → SD-003, Prov-001 (Method 3) → SD-003.

Info-level (ℹ) messages do not link — they're purely informational.

### Message generation rules

Each provenance message is generated by a rule. Rules are evaluated in order; all matching rules emit their message.

---

#### Prov-001: Dose Source

| Field | Value |
|-------|-------|
| **Rule ID** | Prov-001 |
| **Condition** | Always fires — reports which dose resolution method was used |
| **Icon** | ℹ (info) if Method 1 or 2; ⚠ (warning) if Method 3 |
| **Message templates** | |
| Method 1 (EX) | `Dose values extracted from EX domain.` |
| Method 2 (TX) | `Dose values derived from TX domain (EX not available).` |
| Method 3 (ARM) | `Dose values parsed from ARM labels (EX and TX not available). Verify accuracy.` |
| Mixed | `Dose values extracted from EX domain for {n1} subjects; derived from TX for {n2} subjects.` |

---

#### Prov-002: Route Source

| Field | Value |
|-------|-------|
| **Rule ID** | Prov-002 |
| **Condition** | Always fires |
| **Icon** | ℹ |
| **Message templates** | |
| From EX | `Route of administration from EX domain.` |
| From TS | `Route of administration from TS (TSPARMCD = ROUTE).` |
| Not found | `Route of administration not specified in data. Set manually if needed.` |

---

#### Prov-003: TK Subjects Detected

| Field | Value |
|-------|-------|
| **Rule ID** | Prov-003 |
| **Condition** | IS_TK = true for any subject |
| **Icon** | ℹ |
| **Message template** | `{n} TK subject(s) detected and excluded from statistical analysis by default.` |
| **Action** | Optionally link to a setting to include TK subjects |

---

#### Prov-004: Recovery Groups Detected

| Field | Value |
|-------|-------|
| **Rule ID** | Prov-004 |
| **Condition** | HAS_RECOVERY = true for any arm |
| **Icon** | ℹ |
| **Message template** | `Recovery groups detected in {n} arm(s). Recovery-phase data is analyzed separately.` |

---

#### Prov-005: Dose Escalation Detected

| Field | Value |
|-------|-------|
| **Rule ID** | Prov-005 |
| **Condition** | DOSE_ESCALATION = true for any subject (from SD-005) |
| **Icon** | ⚠ |
| **Message template** | `{n} subject(s) have variable dosing across study. Maximum dose used for group assignment. Review EX domain for per-timepoint doses.` |

---

#### Prov-006: Control Group Identification

| Field | Value |
|-------|-------|
| **Rule ID** | Prov-006 |
| **Condition** | Fires when multiple control groups detected, or when control identified by fallback method |
| **Icon** | ℹ (single control) or ⚠ (multiple or ambiguous) |
| **Message templates** | |
| Single, clear | _(no message — control identification is expected and doesn't need annotation)_ |
| Multiple controls | `{n} control groups detected: {labels}. '{primary}' used as primary comparator for statistical tests.` |
| Ambiguous | `Control group identified from ARM label (no explicit control flag in EX/TX). Verify assignment.` |

---

#### Prov-007: Incomplete Metadata Fallbacks

| Field | Value |
|-------|-------|
| **Rule ID** | Prov-007 |
| **Condition** | Any study_metadata field was populated from a fallback source (e.g., SPECIES from DM instead of TS) |
| **Icon** | ℹ |
| **Message template** | `{field} derived from {fallback_domain} (not present in TS).` |
| **Example** | `Species derived from DM (not present in TS).` |

---

### Provenance messages summary table

| Rule ID | Icon | Short description |
|---------|------|-------------------|
| Prov-001 | ℹ / ⚠ | Dose extraction method |
| Prov-002 | ℹ | Route source |
| Prov-003 | ℹ | TK subjects detected and excluded |
| Prov-004 | ℹ | Recovery groups detected |
| Prov-005 | ⚠ | Dose escalation — max dose used |
| Prov-006 | ℹ / ⚠ | Control group identification method |
| Prov-007 | ℹ | Metadata fallback sources |

---

## Part 3: Cross-References & Workflow

### The user journey

```
Import → Pipeline runs to completion (never blocks)
  ↓
Study Summary opens (first thing user sees)
  → Study design table + provenance messages
  → ℹ messages: informational, no action needed
  → ⚠ messages: include [Review →] link to Validation view
  ↓
Validation view (Study Design mode) — if user clicks a link or navigates
  → Sees SD-xxx issues with inline resolution controls
  → Resolves (e.g., assigns control group from dropdown)
  → subject_context updates → stats recompute → analysis views update
  ↓
Analysis views — always available, always show what can be computed
  → Comparative stats (Dunnett's, % vs control) blank if no control assigned
  → Non-comparative stats (means, SDs, trends) always present
  → Gaps fill in as issues get resolved in Validation view
```

### Validation rules → Provenance overlap

Some issues appear in both systems with different purposes:

| Issue | Provenance (Summary view) | Validation (Study Design mode) |
|-------|---------------------------|-------------------------------|
| Dose escalation | Prov-005: "Max dose used for grouping" | SD-005: Lists affected subjects, lets user review strategy |
| Ambiguous control | Prov-006: "Control identified from ARM label" | SD-003: Dropdown to assign/reassign control group |
| Missing TS params | Prov-007: "Species derived from DM" | SD-004: Lists missing parameters |
| No control detected | Prov-006: "Comparative stats unavailable" [Review →] | SD-003: Dropdown to assign control group |

This is intentional. Provenance tells the scientist "here's how we read your data." Validation provides the controls to change it.

### Integration with existing rule engine (§10)

- Validation rules SD-001 through SD-007 follow the existing rule schema: `{ rule_id, severity, domain, category, description, records_affected, auto_fixable, status }`
- Add `category = "STUDY_DESIGN"` to the category enum
- Add `validation_mode = "study_design"` to distinguish from data quality rules in the UI filter/toggle
- Provenance rules Prov-001 through Prov-007 are a **new rule type** that emits to a separate `provenance_messages` array, not to `validation_results`. Schema: `{ rule_id, icon: "info" | "warning", message: string, link_to_rule?: string }`
- Both rule sets evaluate during enrichment pipeline Step 7

### Recomputation scope

When a user resolves a study design issue in the Validation view:

| What changed | What recomputes |
|-------------|-----------------|
| Control group assignment | subject_context (IS_CONTROL, DOSE_GROUP_ORDER) → all comparative stats across all domains |
| Dose group ordering | subject_context (DOSE_GROUP_ORDER) → all per-group stats, trend tests |
| TK designation | subject_context (IS_TK) → subject counts, group stats (TK subjects included/excluded) |
| Study phase assignment | subject_context (STUDY_PHASE) → recovery-specific analyses |

Recomputation follows the same pipeline as import (Steps 6–10) but only re-runs affected steps.

### ADR tracker update

Add reference to **ADR-001** open question #3: "Dose resolution confidence — should the system expose which method was used?" → **Answer: Yes, via Prov-001.** This can be closed once this spec is accepted.

Add new decision to ADR tracker: **ADR-002: Non-blocking pipeline with deferred resolution** — the pipeline never blocks; comparative stats are deferred (not blocked) when control is unresolved; resolution happens in Validation view (Study Design mode) with inline controls; recomputation is scoped to affected stats only.
