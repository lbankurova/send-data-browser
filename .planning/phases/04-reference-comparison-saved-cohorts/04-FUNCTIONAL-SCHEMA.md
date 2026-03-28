# Phase 4: Reference Comparison & Saved Cohorts — Functional Schema

**Purpose:** Complete input for layout research / mockup. Maps every requirement to a concrete UI surface within the existing three-panel skeleton.

---

## 1. Current Layout Skeleton

```
+-------------------+-----------------------------+-------------------+
|     RAIL          |      CENTER PANEL           |  CONTEXT PANEL    |
| (CohortRail.tsx)  |  (CohortView.tsx)           | (CohortContext    |
|                   |                             |  Panel.tsx)       |
| Zone 1: Presets   |  CohortEvidenceTable        |  Cohort Summary   |
| [x] All           |  (organ tabs -> finding     |  - N subjects     |
| [ ] TRS           |   rows -> subject columns)  |  - dose breakdown |
| [ ] Histo         |                             |  - sex breakdown  |
| [ ] Recovery      |  CohortCharts               |                   |
|                   |  (charts below table)       |  Affected Organs  |
| Zone 2: Summary   |                             |  Shared Findings  |
| 42 subjects ...   |                             |  Tissue Battery   |
|                   |                             |  Tumor Linkage    |
| Filter pills zone |                             |  Composition      |
| [Organ:LIVER] AND |                             |  BW Overview      |
|                   |                             |                   |
| Zone 3: Quick     |                             |                   |
| [Dose][Sex][Srch] |                             |                   |
| [Filter Panel btn]|                             |                   |
|                   |                             |                   |
| [ ] Include TK    |                             |                   |
|                   |                             |                   |
| Zone 4: Subject   |                             |                   |
| rows (scrollable) |                             |                   |
| |-- PC-1001 M ADV |                             |                   |
| |-- PC-1002 F     |                             |                   |
| |-- PC-1003 M REC |                             |                   |
+-------------------+-----------------------------+-------------------+
```

### Current data flow

```
CohortContext (Layout level)
  |
  |-- activePresets: Set<CohortPreset>     (combinable checkboxes)
  |-- filterGroup: FilterGroup             (AND/OR predicates)
  |-- convenience: doseFilter, sexFilter, searchQuery
  |
  v
evaluateFilter(subject, filterGroup, filterCtx)
  |
  v
filteredSubjects --> selectedSubjects --> displaySubjects
                                              |
                                    +--------+--------+
                                    |                 |
                                Rail rows      Evidence table columns
```

---

## 2. Requirements Map

### REF: Reference Cohort Comparison

| Req | What it says | Functional implication |
|-----|-------------|----------------------|
| **REF-01** | User can designate a reference group (default: concurrent controls at matching sex) | Need: reference group state, default = control subjects. UI: some way to set/change reference. |
| **REF-02** | User can select any subset of subjects as custom reference | Need: arbitrary subject selection mode for reference. Could be: "use current filter as reference" or manual multi-select. |
| **REF-03** | Differential view: study group vs reference group values | Need: a comparison surface. Evidence table already has per-subject columns — could add reference aggregate column, or a separate comparison table/section. |
| **REF-04** | Discriminating findings highlighted (present in study, absent/reduced in reference) | Need: a "discriminating" flag per finding row. Logic: finding has signal in study group but not in reference. Visual: highlight or badge on row. |
| **REF-05** | Statistical context: Fisher's exact for incidence, fold-change delta for continuous | Need: compute stats between two groups. Display inline in comparison surface. |

### SAVE: Saved Cohorts

| Req | What it says | Functional implication |
|-----|-------------|----------------------|
| **SAVE-01** | Save current filter combination as named cohort | Need: save action (button), naming dialog, serialize FilterGroup + activePresets + convenience filters. |
| **SAVE-02** | Persist to study-level annotation file (`saved_cohorts.json`) | Need: new annotation schema type in backend. CRUD via existing `/api/annotations/` system. |
| **SAVE-03** | Saved cohorts appear as checkboxes alongside presets in rail | Need: saved cohorts render in Zone 1 (or adjacent zone) as checkboxes like presets. Loading a saved cohort restores its FilterGroup. |
| **SAVE-04** | Pinned saved cohorts shown by default, others via expansion | Need: pin/unpin state per saved cohort. Pinned = always visible, unpinned = collapsed section. |
| **SAVE-05** | URL integration: `?cohort=cohort-id` | Need: cohort ID scheme, URL param read/write. Loading URL with cohort param restores that saved cohort's filters. |

---

## 3. Functional Components Needed

### 3A. Reference Group State

```
referenceGroup: {
  type: "controls"        // default: concurrent controls
      | "custom"          // arbitrary subject set
      | "saved-cohort"    // a previously saved cohort
  subjectIds: Set<string> // resolved subject IDs
  label: string           // display name ("Controls (F)" or "My cohort")
}
```

**Default behavior:** When user opens cohort view, reference = concurrent control subjects matching the sex distribution of the current filter. No user action needed — it's the implicit comparator.

**Custom reference:** User can "lock" the current filtered set as reference, then change filters to define the study group. Two-step: (1) filter to desired reference, (2) "Set as reference", (3) filter changes now define study group compared against locked reference.

### 3B. Comparison Engine

```
Input:
  studyGroup: CohortSubject[]      (current filtered subjects)
  referenceGroup: CohortSubject[]  (locked reference subjects)
  findingRows: CohortFindingRow[]

Output per finding row:
  studyGroupStats: { n, mean/incidence, affected }
  referenceStats:  { n, mean/incidence, affected }
  delta:           { foldChangeDelta | fisherP | oddsRatio }
  isDiscriminating: boolean         (present/elevated in study, absent/low in reference)
```

This is a **frontend-only computation** — no new backend endpoint. The data is already loaded in CohortContext (findingRows have groupStats and subjectValues).

### 3C. Differential Display

The comparison results need to surface somewhere visible. Options per requirement:

- **REF-03** (study vs reference values): Additional columns or an overlay in the evidence table
- **REF-04** (discriminating findings): Row-level indicator (badge/icon/sort-to-top)
- **REF-05** (statistical context): Inline in the comparison columns (p-value, fold-change delta)

### 3D. Save/Load System

```
SavedCohort {
  id: string              // UUID or slug
  name: string            // user-provided
  pinned: boolean         // shown in Zone 1 vs collapsed
  created: string         // ISO date
  filters: {
    presets: CohortPreset[]
    filterGroup: FilterGroup
    convenience: { doseFilter, sexFilter, searchQuery }
  }
}

Storage: backend/annotations/{studyId}/saved_cohorts.json
Schema type: "saved-cohorts" (add to VALID_SCHEMA_TYPES)
```

### 3E. URL Serialization

```
?cohort=my-cohort-id          // restores saved cohort by ID
?preset=trs,histo             // existing (currently single-value)
?dose=1,2,3                   // existing
?subjects=PC-1001,PC-1002     // existing
```

---

## 4. UI Surfaces That Need to Exist

### Surface 1: Reference Group Controls

**What:** Set/clear/change the reference group.
**Where:** ?
**States:**
- Default (no explicit reference): comparison is implicit vs controls
- Active reference: locked subject set, label shown, "clear reference" action
- Custom reference: user filtered + locked

### Surface 2: Comparison Overlay in Evidence Table

**What:** Study vs reference values per finding row.
**Where:** Additional columns in CohortEvidenceTable, or a mode toggle that replaces subject columns with comparison columns.
**Content per row:**
- Reference aggregate (mean or incidence)
- Study group aggregate
- Delta (fold-change diff or Fisher's p)
- Discriminating badge

### Surface 3: Comparison Summary in Context Panel

**What:** High-level differential summary.
**Where:** CohortContextPanel — new section or replacement section when reference is active.
**Content:**
- N discriminating findings
- Top discriminating findings list
- Study vs reference composition comparison

### Surface 4: Save Cohort Action

**What:** Button to save current filters as named cohort.
**Where:** ?
**Trigger:** User has filters active, wants to persist them.
**Flow:** Click -> name input -> save -> appears in rail.

### Surface 5: Saved Cohort Checkboxes in Rail

**What:** Saved cohorts as toggleable checkboxes.
**Where:** Rail Zone 1 area (alongside or below presets).
**Behavior:**
- Pinned cohorts always visible
- Unpinned cohorts in expandable section
- Checking a saved cohort restores its FilterGroup
- Multiple saved cohorts: union? or exclusive switch?

### Surface 6: Cohort Management

**What:** Rename, delete, pin/unpin saved cohorts.
**Where:** ? (right-click menu on saved cohort checkbox? Separate management pane?)

---

## 5. Open Design Questions

These are the decisions needed before planning. They're about **arrangement within the skeleton**, not implementation.

### Q1: How does the user establish a reference group?

The "set as reference" action needs a home. Options:
- (a) Button in the rail summary zone ("Set as reference")
- (b) Right-click on a saved cohort ("Use as reference")
- (c) A dedicated reference toggle/mode in the rail header
- (d) Context panel action

### Q2: How does the evidence table show the comparison?

The evidence table currently has: organ tabs, finding rows, per-subject value columns. When a reference is active:
- (a) **Add columns:** Reference aggregate + delta columns appended to the right of subject columns
- (b) **Mode switch:** Toggle between "Subject view" and "Comparison view" where subject columns are replaced by group aggregates
- (c) **Split table:** Top = study group rows, bottom = reference rows (spatial anchoring)

### Q3: Where does "Save cohort" live?

- (a) Button in the rail near presets (Zone 1)
- (b) Button in the filter pills zone
- (c) Context menu on filter state
- (d) Context panel action

### Q4: How do saved cohorts coexist with presets?

Presets are combinable (OR union). Saved cohorts contain full FilterGroup state. Loading a saved cohort could:
- (a) **Replace** current filters entirely (exclusive with manual filters)
- (b) **Add as preset** (combinable with other presets, but FilterGroup content from saved cohort merges with current)
- (c) **Separate section** below presets, exclusive within saved cohorts but combinable with presets above

### Q5: What's the reference indicator when active?

When a reference group is locked, the user needs to know:
- What the reference is (label, subject count)
- That they're now in "comparison mode"
- How to clear it

Options:
- (a) Banner/bar at top of rail
- (b) Badge next to preset zone
- (c) Colored border or background tint on the rail
- (d) Context panel prominent section

---

## 6. Existing Assets (Reusable)

| Asset | Location | Relevance |
|-------|----------|-----------|
| FilterGroup/FilterPredicate types | `types/cohort.ts` | Saved cohort serializes these |
| evaluateFilter engine | `lib/filter-engine.ts` | Core filter evaluation |
| CohortContext state | `contexts/CohortContext.tsx` | All filter state lives here |
| Annotations CRUD | `backend/routers/annotations.py` | Persistence backbone for saved cohorts |
| usePatternOverrideActions pattern | `hooks/usePatternOverrideActions.ts` | Model for annotation CRUD hook |
| useRecoveryOverrideActions pattern | `hooks/useRecoveryOverrideActions.ts` | Model for annotation CRUD hook |
| CohortEvidenceTable | `cohort/CohortEvidenceTable.tsx` | Comparison columns go here |
| CohortContextPanel | `panes/CohortContextPanel.tsx` | Comparison summary goes here |
| URL params (useSearchParams) | `CohortContext.tsx` | Extend for ?cohort= param |
| OverridePill / right-click pattern | `ui/OverridePill.tsx` | Potential UX for cohort management |

---

*Generated: 2026-03-26 for external mockup/research input*
