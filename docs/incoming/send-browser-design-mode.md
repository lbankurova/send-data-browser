# SEND Data Browser — Design Mode Specification

## Overview

Design Mode is an internal tool for reviewing UI states that are difficult or impossible to trigger with real study data. When activated, pre-built scenario studies appear in the studies table alongside real studies. Each scenario is crafted to trigger specific UI states: empty views, error conditions, edge case flows, enrichment warnings, etc.

Design Mode complements Guided Mode (demo enablement). Together they form the app's internal tooling:

| Mode | Audience | Purpose |
|------|----------|---------|
| **Guided Mode** | Sales, new hires | Learn what each view does, terminology, demo tips |
| **Design Mode** | Product owner, designers, QA | Verify all UI states render correctly, nothing is missed |

---

## 1. Activation

### Landing page toggle

Same location as Guided Mode — in the footer or bottom-right corner of the landing page. Both toggles can be independently on or off.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                     SEND Data Browser                        │
│                        Landing Page                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Studies table                                          │ │
│  │                                                         │ │
│  │  STUDY-001    Acme Pharma    28-day rat oral    ✓  ●    │ │
│  │  STUDY-002    BioGen Corp    13-week dog IV     ✓  ●    │ │
│  │                                                         │ │
│  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │ │
│  │  (Design Mode scenarios appear here when active)        │ │
│  │                                                         │ │
│  │  🔧 SCENARIO: Empty Study         No domains loaded     │ │
│  │  🔧 SCENARIO: No Control Group    Missing control        │ │
│  │  🔧 SCENARIO: Perfect Study       All clean, no issues  │ │
│  │  🔧 SCENARIO: Broken Metadata     Multiple SD warnings  │ │
│  │  🔧 SCENARIO: Recovery + TK       Complex arm structure  │ │
│  │  🔧 SCENARIO: Dose Escalation     Variable dosing        │ │
│  │  ...                                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│                                                              │
│                     Guided Mode ○    Design Mode ○           │
└──────────────────────────────────────────────────────────────┘
```

**Toggle behavior:**
- Default: OFF
- When ON: Scenario studies appear in the studies table, visually distinguished (see §2)
- Persistence: Session-level. Optionally persist via user preferences.
- Both Guided Mode and Design Mode can be active simultaneously — useful for reviewing the guide content against a specific scenario.

### Visual distinction for scenarios

Scenario entries in the studies table should be subtly but clearly different from real studies:

- **Prefix icon:** 🔧 or a wrench/flask icon in the first column
- **Row styling:** Slightly different background (e.g., faint dashed border or light tint) — enough to tell apart at a glance, not so much that it's distracting
- **Study ID format:** `SCENARIO:` prefix (e.g., "SCENARIO: Empty Study")
- **Grouped:** Scenarios appear below real studies, separated by a thin divider. Real studies always come first.

Once you click into a scenario study, it behaves exactly like a real study. No special banners or indicators inside the study views — the whole point is to see the real UI in that state.

---

## 2. Scenario Studies

Each scenario is a bundled dataset (minimal .XPT files or JSON fixtures) designed to trigger specific UI states. Scenarios are organized by what they test.

### Scenario inventory

---

#### SCN-001: Empty Study

**What it tests:** First-run / empty state across all views.

**Data:**
- TS domain only, with minimal study-level metadata (STUDYID, SPECIES, ROUTE)
- DM with 0 subjects
- No findings domains

**Expected UI states:**
- Study Summary: Study design table is empty. Provenance messages: "No subjects found in DM."
- All analysis views: Empty state messaging — "No data available for this view."
- Validation: SD-xxx rules fire for missing required domains
- Navigation tree: Domain nodes present but grayed out or marked empty

**What to check:**
- [ ] Does every view have a proper empty state? No blank screens, no crashes.
- [ ] Is the empty state message helpful? Does it suggest what to do?
- [ ] Does the navigation tree handle empty domains gracefully?

---

#### SCN-002: Perfect Study

**What it tests:** The "golden path" — a clean, well-formed study with no issues.

**Data:**
- Complete trial design: DM, TA, TE, TX, TS, EX — all consistent
- 3 dose groups + vehicle control, both sexes, 10/sex/group
- Recovery arms for all groups
- TK satellite groups for dose groups 2 and 3
- Full findings: BW, LB, MI, MA, OM, CL, FW
- Some dose-dependent signals in BW (decreased gain at high dose), LB (elevated ALT at mid and high), MI (hepatocellular hypertrophy at high)

**Expected UI states:**
- Study Summary: Clean table, all ℹ provenance messages, no warnings
- Validation: Zero issues (or only INFO-level)
- All analysis views: Fully populated, all stats computed, clear dose-response visible
- Target organ view: Liver flagged as target organ with cross-domain evidence

**What to check:**
- [ ] Does the happy path look polished? No visual glitches.
- [ ] Are the dose-response signals obvious in the charts?
- [ ] Does cross-domain correlation work (lab + organ weight + histopath → target organ)?
- [ ] Is this a good demo dataset? If yes, this scenario doubles as the demo study.

---

#### SCN-003: No Control Group

**What it tests:** The enrichment pipeline's graceful degradation when no control is detected.

**Data:**
- DM with 3 dose groups, none labeled "control" or "vehicle"
- EX with all non-zero doses
- ARM labels: "Group A - 5 mg/kg", "Group B - 15 mg/kg", "Group C - 50 mg/kg"
- Full findings data

**Expected UI states:**
- Study Summary: ⚠ "No control group detected. Comparative statistics unavailable." with [Review →] link
- Validation (Study Design mode): SD-003 with dropdown to assign control
- Analysis views: Group means and SDs computed. Dunnett's p-values, % vs control, Cohen's d all null/blank. Trend tests still computed.
- After resolution: User assigns Group A as control → all comparative stats populate

**What to check:**
- [ ] Are comparative stat columns clearly blank (not zero, not "N/A")?
- [ ] Does the provenance message explain the gap clearly?
- [ ] Does the [Review →] link navigate correctly to Validation (Study Design mode)?
- [ ] After assigning control in Validation, does everything recompute?
- [ ] Is the recomputation fast enough to feel instant?

---

#### SCN-004: Broken Metadata

**What it tests:** Multiple enrichment issues simultaneously.

**Data:**
- DM has 5 ARMCDs; TA only defines 3 (orphaned subjects)
- TA defines 2 extra arms with no subjects in DM (empty arms)
- ARMCD "2" maps to "Low Dose" in DM but "2 mg/kg PCDRUG" in TA (label mismatch)
- TS is missing SPECIES, STRAIN, and ROUTE
- EX has one subject with 3 different dose values (dose escalation)
- One group has DOSE = 0 but ARM = "Sham Group" (ambiguous control)

**Expected UI states:**
- Study Summary: Multiple ⚠ provenance messages, several [Review →] links
- Validation (Study Design mode): SD-001, SD-002, SD-003, SD-004, SD-005, SD-007 all fire. Multiple inline resolution controls visible.
- Validation (Data Quality mode): SD-007 (ERROR severity) appears prominently
- Analysis views: Partial stats. Some groups fully computed, orphaned subjects excluded.

**What to check:**
- [ ] Can the user work through multiple issues sequentially without confusion?
- [ ] Does resolving one issue update the provenance messages on the Summary?
- [ ] Is the ERROR (SD-007) visually distinct from WARNINGs?
- [ ] After resolving all issues, does the study look like SCN-002 (perfect)?

---

#### SCN-005: Recovery + TK Groups

**What it tests:** Complex arm structure with recovery and toxicokinetic satellites.

**Data:**
- Vehicle control + 3 dose groups
- Each dose group has: main, recovery, and TK arms (like the Trial Design table from the original discussion)
- Control has main + recovery (no TK)
- TK animals have interim sacrifice timepoints (Day 1, Day 14)
- Recovery animals have extended observation (28 days post-dose)

**Expected UI states:**
- Study Summary: Table shows Main/Rec/TK columns with checkmarks. Prov-003 ("6 TK subjects excluded") and Prov-004 ("Recovery groups detected")
- BW view: TK animals excluded from curves. Recovery data shown as separate phase.
- Study phase filter: Switching between "Main Study" and "Recovery" changes the data displayed

**What to check:**
- [ ] Is the arm structure clear in the study design table?
- [ ] Are TK subjects actually excluded from analysis views?
- [ ] Does the study phase filter work correctly?
- [ ] Can the user opt TK subjects back in if needed?
- [ ] Are recovery-phase data points visually distinguishable?

---

#### SCN-006: Dose Escalation

**What it tests:** Subjects with multiple dose levels over time.

**Data:**
- 3 dose groups where dose increases at Week 4:
  - Group A: 5 mg/kg → 10 mg/kg
  - Group B: 15 mg/kg → 30 mg/kg
  - Group C: 50 mg/kg → 100 mg/kg
- Vehicle control (constant dose = 0)
- EX records show dose changes per subject

**Expected UI states:**
- Study Summary: Prov-005 ("N subjects have variable dosing — max dose used") with [Review →]
- Validation: SD-005 lists affected subjects with dose history
- Analysis views: Subjects grouped by max dose. BW curves may show inflection at dose-change timepoint.

**What to check:**
- [ ] Is the dose escalation clearly communicated in provenance?
- [ ] Does "max dose used" make sense for the charts?
- [ ] Can the user access per-timepoint dose from EX if needed?

---

#### SCN-007: Minimal Study (Acute Toxicity)

**What it tests:** A very small, simple study — acute single-dose design.

**Data:**
- Single dose per group (not daily dosing)
- 3 animals per sex per group (small N)
- Only BW, CL, and MA/MI domains (no lab results, no organ weights)
- 14-day observation period

**Expected UI states:**
- Analysis views for missing domains (LB, OM, FW): Empty state
- Stats with small N: Many non-significant results, wide confidence intervals
- Navigation tree: Some domain nodes absent or grayed out

**What to check:**
- [ ] Do views with no data show appropriate empty states?
- [ ] Does the app handle small sample sizes gracefully (no divide-by-zero, no misleading stats)?
- [ ] Is the navigation tree accurate — no links to views that have no data?

---

#### SCN-008: Large Study (Carcinogenicity)

**What it tests:** Performance and UI scalability with a large dataset.

**Data:**
- 50+ animals per sex per group (typical carcinogenicity study)
- 104-week duration (2 years)
- Extensive histopathology (every tissue examined in every animal)
- Large tumor findings dataset (TF domain)
- Thousands of clinical observation records

**Expected UI states:**
- All views: Functional with large row counts
- Histopathology: Many findings, many tissues — table and charts handle volume
- BW curves: 104 weeks of data points — line chart remains readable

**What to check:**
- [ ] Does the app remain responsive with large datasets?
- [ ] Are charts still readable with many timepoints?
- [ ] Does the table handle thousands of rows without lag?
- [ ] Is memory usage acceptable?

---

#### SCN-009: Single Sex Study

**What it tests:** Study with only one sex (common for some study types).

**Data:**
- Males only (or females only)
- Otherwise clean, similar to SCN-002

**Expected UI states:**
- Sex filter: Only one option. No "Combined" confusion.
- Charts: No male/female split needed
- Stats: No sex-based stratification

**What to check:**
- [ ] Does the app handle single-sex studies without showing empty female (or male) panels?
- [ ] Are filters and grouping options appropriate?

---

#### SCN-010: First Import Experience

**What it tests:** What the app looks like before any study has ever been imported.

**Data:** None. No studies at all.

**Expected UI states:**
- Studies table: Empty. Helpful message: "No studies imported yet. Drag and drop a SEND package or browse to import."
- Import section: Prominent, inviting
- All other navigation: Inaccessible or gracefully disabled

**What to check:**
- [ ] Is the empty landing page inviting, not broken-looking?
- [ ] Is it obvious how to import a study?
- [ ] Are navigation elements that require a study properly disabled?

---

## 3. Scenario Data Format

### Storage
Scenarios are bundled with the application as static fixtures. They don't need to be full .XPT packages — they can be:

- **Minimal .XPT files** — real SEND format, but with synthetic data. Most authentic; scenarios behave exactly like real imports.
- **JSON fixtures** — pre-built DataFrames serialized as JSON. Faster to load, easier to create and edit. Skip the .XPT parsing step.
- **Hybrid** — .XPT for domains that need to test the import pipeline, JSON for pre-computed states.

Recommended: Start with **JSON fixtures** for speed. Switch to .XPT when you need to test the actual import/enrichment pipeline end-to-end.

### Scenario metadata

Each scenario includes a metadata block:

```json
{
  "id": "SCN-003",
  "name": "No Control Group",
  "description": "3 dose groups with no vehicle control. Tests graceful degradation of comparative statistics.",
  "tags": ["enrichment", "study-design", "validation"],
  "tests_states": [
    "summary:provenance-warning",
    "validation:sd-003",
    "analysis:blank-comparative-stats",
    "validation:inline-resolution"
  ],
  "expected_issues": {
    "SD-003": { "severity": "WARNING", "count": 1 },
    "CORE-SEND0073-EX": { "severity": "WARNING", "count": 1 },
    "CORE-SEND0035-TS": { "severity": "INFO", "count": 1 }
  }
}
```

This metadata powers:
- The description shown in the studies table
- Filtering/searching scenarios by what they test
- Automated QA: run all scenarios and verify expected issues fire

---

## 4. Design Mode Checklists

When Design Mode is active, an optional **checklist overlay** can appear in each view. This is a floating panel (similar to the Guided Mode panel but smaller) that shows the relevant "What to check" items from the scenario spec.

```
┌─────────────────────────────────┐
│ 🔧 SCN-003: No Control Group   │
├─────────────────────────────────┤
│                                 │
│ ☐ Comparative stat columns are  │
│   clearly blank (not zero)      │
│ ☐ Provenance message explains   │
│   the gap                       │
│ ☐ [Review →] link navigates     │
│   correctly                     │
│ ☐ Recomputation after fix is    │
│   fast                          │
│                                 │
│              [Mark Complete ✓]  │
└─────────────────────────────────┘
```

This is a stretch feature — nice to have but not essential for v1. The checklists in this document serve the same purpose if reviewed manually.

---

## 5. State Simulator (Future Enhancement)

For UI states that can't be triggered by data alone (e.g., loading spinners, network errors, permission denied, slow computations), add a **state override panel** accessible within Design Mode:

```
┌─────────────────────────────────┐
│ 🔧 State Overrides              │
├─────────────────────────────────┤
│ Force loading state      ○      │
│ Force error state        ○      │
│ Force empty state        ○      │
│ Simulate slow import     ○      │
│ Simulate 50 validation   ○      │
│   warnings                      │
│ Force no-control mode    ○      │
└─────────────────────────────────┘
```

This is a separate dev effort and is not needed for v1. The scenario studies cover the data-driven states; the state simulator covers transient/UI-only states.

---

## 6. Implementation Notes

### Effort estimate

| Component | Effort | Priority |
|-----------|--------|----------|
| Design Mode toggle on landing page | 0.5 day | v1 |
| Scenario studies appearing in studies table | 1 day | v1 |
| SCN-010 (first import / empty landing page) | Built into the app naturally | v1 |
| SCN-001 (empty study) fixture | 0.5 day | v1 |
| SCN-002 (perfect study) fixture | 1-2 days (most effort — needs realistic synthetic data) | v1 |
| SCN-003 (no control) fixture | 0.5 day | v1 |
| SCN-004 (broken metadata) fixture | 0.5 day | v1 |
| SCN-005 through SCN-009 | 0.5 day each | v2 |
| Checklist overlay | 1 day | v2 |
| State simulator panel | 2-3 days | v3 |

**v1 total: ~4-5 days** for toggle + 4 core scenarios.

### Scenario creation workflow

Creating a new scenario:
1. Define what UI state(s) you want to trigger
2. Determine minimum data needed to trigger them
3. Create fixture (JSON or .XPT)
4. Add metadata block
5. Add entry to this document with "What to check" items
6. Test: toggle Design Mode → open scenario → verify states

---

## 7. Relationship to Other Specs

- **Guided Mode** (`send-browser-guided-mode.md`) — Explains what views do. Design Mode shows you how they look in specific states. Both toggles can be active simultaneously for the most thorough review.
- **Enrichment pipeline** (`send-study-context-enrichment.md`) — Scenarios SCN-003, SCN-004, SCN-005, SCN-006 specifically test enrichment edge cases.
- **Validation rules** (`send-enrichment-validation-provenance.md`) — SCN-003 and SCN-004 test the full Summary → Validation → resolution → recomputation flow.
- **ADR tracker** — Logged as ADR-004.

---

## 8. v1 Implementation Status

**Implemented (2026-02-11):** Toggle + 4 core scenarios (SCN-001 through SCN-004).

| Component | Status |
|-----------|--------|
| Design Mode toggle on landing page | Done |
| Backend scenario registry (`backend/scenarios/registry.py`) | Done |
| 4 fixture directories with 12 JSON files each | Done |
| Scenarios API (`GET /api/scenarios`, `GET /api/scenarios/{id}/expected-issues`) | Done |
| Router fallbacks (`analysis_views.py`, `validation.py`, `studies.py`) | Done |
| `DesignModeContext` with localStorage persistence | Done |
| Scenario rows in studies table (wrench icon, dashed divider) | Done |
| Context panel scenario inspector (expected issues, what to check) | Done |
| Browsing tree includes scenarios when design mode ON | Done |
| Checklist overlay | Not implemented (v2) |
| State simulator | Not implemented (v3) |
| SCN-005 through SCN-009 | Not implemented (v2) |

**Expected CORE rule IDs per scenario (synthetic placeholders):**

| Scenario | Expected SD rules | Expected CORE rules |
|----------|------------------|---------------------|
| SCN-001 (Empty) | SD-004 | CORE-SEND0035-TS, CORE-SEND0036-DM |
| SCN-002 (Perfect) | *(none)* | *(none)* |
| SCN-003 (No Control) | SD-003 | CORE-SEND0073-EX, CORE-SEND0035-TS |
| SCN-004 (Broken Metadata) | SD-001, SD-004, SD-007 | CORE-SEND0035-TS, CORE-SEND0074-DM, CORE-SEND0075-DM |
