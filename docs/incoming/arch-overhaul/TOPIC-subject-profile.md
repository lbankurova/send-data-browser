# Topic Hub: Subject Profile & Cross-Animal Flags

**Last updated:** 2026-02-27
**Overall status:** Fully shipped. Route-independent individual animal panel (877L, design frozen) with 6-domain cross-domain summary, 7-tier COD detection, lab flagging vs. sex-matched control, BW sparkline. Cross-animal flags generator (852L) produces tissue battery, tumor linkage, and recovery narratives consumed by the panel. 1 test suite (33 cases / 64 assertions). Design frozen per CLAUDE.md hard rule.

---

## What Shipped

### Subject Profile Panel (`SubjectProfilePanel.tsx`, 877 lines, design frozen)

Route-independent context panel pane activated by `selectedSubject` in `ViewSelectionContext`. When a subject is selected from any view (subject heatmap column header, spaghetti plot click, findings table row), `ContextPanel.tsx` renders `SubjectProfilePanel` regardless of active route.

**Header:** USUBJID (mono), sex (colored: `#1565C0` M, `#C62828` F), dose group via `DoseLabel`, disposition + day, death cause/relatedness (from pre-generated `study_mortality.json`).

**Panes (6 domains):**

| Pane | Domain | Behavior |
|------|--------|----------|
| BW sparkline | BW | Inline SVG (60px), neutral stroke, start/end value annotations |
| Lab values | LB | Grouped by test code, latest timepoint, flagged vs sex-matched control |
| Organ measurements | OM | Inline values with units |
| Clinical observations | CL | Timeline, non-NORMAL highlighted with `bg-amber-50`, auto-expand |
| Histopathology | MI | Severity-sorted, COD/presumptive COD highlighted, tumor cross-references |
| Macroscopic | MA | Default collapsed, same pattern as MI |

**Selection mutex:** Setting `selectedSubject` clears `selection` (view selection), and vice versa — prevents subject panel and endpoint panel from showing simultaneously. Implemented in `ViewSelectionContext.tsx`.

**Cross-animal flags integration:** Panel renders tissue battery warning (expandable per-specimen missing list), tumor cross-references for COD findings (dose-response linkage), and recovery narrative text for the selected animal.

### Cross-Domain Logic (`subject-profile-logic.ts`, 188 lines)

Pure functions extracted for testability. No UI imports, no hooks — logic only.

| Export | Purpose |
|--------|---------|
| `isNormalFinding(text)` | Detect NORMAL / UNREMARKABLE / WITHIN NORMAL LIMITS |
| `isUnscheduledDeath(disposition)` | MORIBUND SACRIFICE, FOUND DEAD, EUTHANIZED (not TERMINAL/SCHEDULED) |
| `severityNum(severity)` | MINIMAL→1, MILD→2, MODERATE→3, MARKED→4, SEVERE→5 (METH-04) |
| `classifyFindings(findings, disposition, accidental)` | 7-tier sort: COD → presumptiveCOD → malignant → benign → grade≥2 → grade1 → normal |
| `flagLabValues(measurements, controlStats)` | Flag increase analytes >2× (ALT, AST, ALP, BILI, BUN, CREA, GGT) and decrease <0.5× (ALB, RBC, HGB, HCT, PLT, WBC) vs sex-matched control |

**COD detection rules:**
- Non-accidental unscheduled death + malignant neoplasm (`result_category === "MALIGNANT"`) → COD (tier 0)
- Non-accidental unscheduled death, no malignancy → highest-severity finding = presumptive COD (tier 1)
- Accidental death or scheduled sacrifice → no COD attribution

### Cross-Animal Flags Generator (`cross_animal_flags.py`, 852 lines)

Pre-generates `cross_animal_flags.json` (11KB for PointCross). Three analyses:

| Analysis | Purpose | Key data |
|----------|---------|----------|
| Tissue battery | Expected vs. examined specimens per animal | Reference battery from species/strain (ICH S1B), flagged animals with missing tissues |
| Tumor linkage | Cross-animal tumor concordance by specimen × finding × dose group | Dose-response data for tumor types, wasting-related organ tagging |
| Recovery narratives | Per-subject recovery journey | Animal-level narrative text with phase timing, COD context, wasting flag |

**Inputs:** findings (from domain stats), `StudyInfo`, subjects DataFrame, dose_groups, mortality, tumor_summary.

**Consumer:** `useCrossAnimalFlags.ts` (EMPTY fallback on error) → `SubjectProfilePanel.tsx` renders all three flag types for the selected animal.

### Backend API Endpoint (`temporal.py`, lines 326–585)

`GET /api/studies/{study_id}/subjects/{usubjid}/profile` — reads 7 XPT domains (DM, DS, BW, LB, OM, CL, MI, MA), builds cross-domain summary. Also computes sex-matched terminal control lab stats for `flagLabValues()` and pulls death cause/relatedness from `study_mortality.json`.

**Response shape:** `SubjectProfile` type (in `types/timecourse.ts`, lines 72–93) — `usubjid`, `sex`, `dose_level`, `dose_label`, `arm_code`, `disposition`, `disposition_day`, `death_cause`, `death_relatedness`, `domains` (6 optional domain blocks), `control_stats` (lab mean/sd/n per test code).

### Key Commits

| Commit | Description |
|--------|-------------|
| `c64f9a3` | Original subject profile panel + temporal.py endpoint (FEAT-04) |
| `9beb9d0` | Cross-animal flags generator + useCrossAnimalFlags hook + backend tests |
| `c1e9751` | COD detection, lab flagging, BW sparkline |
| `278d5f8` | Reconnect click interaction, include recovery animals, color cues |
| `68f6682` | Fix hooks crash on subject switch + false COD for accidental deaths; extract subject-profile-logic.ts + tests |
| `c6715cd` | Neutral sparkline color in BW chart |

---

## What's NOT Shipped

### Deferred by Design

| Item | Rationale |
|------|-----------|
| Relative-to-group lab annotations ("ALT: 38 U/L — 1.2 SD above group mean") | Requires per-test group stats at each timepoint; deferred to future iteration (decision doc 04 open Q2) |
| Recovery arm visual divider in measurements timeline | Deferred (decision doc 04 open Q3) |
| Subject profile from spaghetti plot click | Decision doc 04 envisioned this as primary trigger; currently accessible from subject heatmap and findings tables instead |
| Subject comparison tab | Separate subsystem in TOPIC-histopathology (`CompareTab.tsx`, 962L) |

### Known Gaps (from spec-cleanup tracker)

| ID | Gap | File | Severity |
|----|-----|------|----------|
| CAF-1 | Non-COD tumor cross-references not shown — spec only describes COD case, ambiguous whether other tumors should show "Also in" | `SubjectProfilePanel.tsx` | Low |
| CAF-2 | Recovery narrative silently skipped when SE domain has no recovery element — no fallback to TE/TX-derived start day | `cross_animal_flags.py` | Low |

---

## Roadmap

**Near-term:** Resolve CAF-1 (non-COD tumor cross-references) and CAF-2 (SE fallback for recovery narrative start day).

**Medium-term:** Relative-to-group lab annotations (per-test group stats at each timepoint), spaghetti plot subject selection integration, recovery arm visual divider in measurements timeline.

---

## File Map

### Decision Docs

| File | Lines | Status |
|------|-------|--------|
| `docs/decisions/04-subject-profile-panel.md` | 176 | IMPLEMENTED — design frozen |
| `docs/decisions/06-subject-level-histopath.md` | 163 | IMPLEMENTED — subject heatmap owned by TOPIC-histopathology |

### Knowledge Docs (cross-references)

From `methods-index.md`:
- **METH-04:** MI Severity Score Mapping — `severityNum()` maps text severity to 1–5 scale
- **METH-07:** Tumor Morphology to Cell Type — tumor linkage in `cross_animal_flags.py` uses cell lineage detection

### Implementation

#### Frontend — component (1 file, 877 lines)

| File | Lines | Role |
|------|-------|------|
| `panes/SubjectProfilePanel.tsx` | 877 | Individual animal panel — BW sparkline, lab flagging, COD detection, histopath, macro, cross-animal flags display. **Design frozen per CLAUDE.md hard rule.** |

#### Frontend — logic (1 file, 188 lines)

| File | Lines | Role |
|------|-------|------|
| `lib/subject-profile-logic.ts` | 188 | Pure functions: isNormalFinding, isUnscheduledDeath, severityNum, classifyFindings, flagLabValues |

#### Frontend — hooks (2 files, 46 lines)

| File | Lines | Role |
|------|-------|------|
| `hooks/useSubjectProfile.ts` | 14 | React Query: `["subject-profile", studyId, usubjid]` → `temporal-api.ts` |
| `hooks/useCrossAnimalFlags.ts` | 32 | React Query: `["cross-animal-flags", studyId]` → `analysis-view-api.ts` (EMPTY fallback on error) |

#### Frontend — tests (1 file, 282 lines)

| File | Lines | Tests | Assertions | Coverage |
|------|-------|-------|------------|----------|
| `tests/subject-profile-logic.test.ts` | 282 | 33 | 64 | isNormalFinding (4), isUnscheduledDeath (7), severityNum (4), classifyFindings COD + sort (8), flagLabValues (10) |

#### Backend — generator (*owned by TOPIC-data-pipeline*)

| File | Lines | Role |
|------|-------|------|
| *`generator/cross_animal_flags.py`* | *852* | *Tissue battery, tumor linkage, recovery narratives → `cross_animal_flags.json`* |

#### Backend — API (*shared*)

| File | Lines | Role |
|------|-------|------|
| *`routers/temporal.py`* | *1,185* | *Endpoint 3 (lines 326–585): subject profile. Endpoint 4: histopath subjects (TOPIC-histopathology)* |

#### Backend — tests (*owned by TOPIC-data-pipeline*)

| File | Lines | Tests | Assertions | Coverage |
|------|-------|-------|------------|----------|
| *`tests/test_cross_animal_flags.py`* | *184* | *9* | *36* | *Tissue battery, tumor linkage flags* |

### Cross-TOPIC Boundaries

| File | Lines | Owner | Relationship |
|------|-------|-------|-------------|
| `SubjectHeatmap.tsx` | 611 | TOPIC-histopathology | Triggers `setSelectedSubject` → opens subject profile panel |
| `CompareTab.tsx` | 962 | TOPIC-histopathology | Multi-subject comparison, separate subsystem |
| `useSubjectComparison.ts` | 15 | TOPIC-histopathology | Hook for CompareTab, not subject profile |
| `ViewSelectionContext.tsx` | 104 | Shared | `selectedSubject` / `setSelectedSubject` state + mutual exclusion logic |
| `FindingSelectionContext.tsx` | 91 | Shared | Clears `selectedSubject` on finding/group selection |
| `ContextPanel.tsx` | 449 | Shared | Renders `SubjectProfilePanel` when `selectedSubject` is set (route-independent) |
| `temporal-api.ts` | 117 | Shared | `fetchSubjectProfile()` API wrapper |
| `analysis-view-api.ts` | 282 | Shared | `fetchCrossAnimalFlags()` + `CrossAnimalFlags` type definition (lines 176–246) |
| `types/timecourse.ts` | 195 | Shared | `SubjectProfile`, `SubjectMeasurement`, `SubjectObservation`, `SubjectFinding` types (lines 72–113) |

### Totals

| Scope | Files | Lines |
|-------|-------|-------|
| Frontend owned (component + logic + hooks) | 4 | 1,111 |
| Frontend tests | 1 | 282 |
| **Owned total** | **5** | **1,393** |
| Backend cross-referenced (generator + API + tests) | 3 | 2,221 |
| **Including cross-references** | **8** | **3,614** |
