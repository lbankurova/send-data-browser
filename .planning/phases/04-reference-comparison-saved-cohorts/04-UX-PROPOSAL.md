# Phase 4: Reference Comparison & Saved Cohorts -- UX Proposal

**Purpose:** Answer the 5 open design questions from the functional schema, with specific recommendations grounded in the existing layout, design system rules, and Datagrok patterns.

---

## Q1: How does the user establish a reference group?

### Recommendation: (a) + (b) combined -- button in rail summary zone + right-click on saved cohorts

**Primary action:** A "Set as reference" text button in the rail summary zone (Zone 2). This is where the user already reads cohort composition ("42 subjects, 3 dose groups, M 21 / F 21"). Adding a reference action here ties the action to the group it describes.

**Secondary action:** Right-click on a saved cohort checkbox (Zone 1) offers "Use as reference" in the context menu. This follows the established right-click override pattern (CLAUDE.md: `onContextMenu` for inline overrides).

**Why not the other options:**
- (c) Dedicated toggle in rail header -- the rail header zone is occupied by preset checkboxes; adding a mode toggle creates ambiguity about whether the user is filtering or comparing.
- (d) Context panel action -- violates the panel role; the context panel shows detail about the current state, it doesn't drive state changes on the rail.

### ASCII mockup

```
+-------------------+
|     RAIL          |
+-------------------+
| Zone 1: Presets   |
| [x] All           |
| [ ] TRS           |
| [ ] Histo         |
| [ ] Recovery      |
+-------------------+
| Zone 2: Summary   |
| 42 subjects       |   <-- existing summary line
| 3 dose grps       |
| M 21 / F 21       |
|                   |
| [Set as reference]|   <-- new: text-xs text-primary link
|                   |
| -- WHEN ACTIVE: --|
| REF: 42 subjects  |   <-- replaces the button above
| Controls (F+M)    |
| [Clear] [Change]  |   <-- text-xs text-primary links
+-------------------+
| Filter pills zone |
| [Organ:LIVER] AND |
+-------------------+
```

When the user clicks "Set as reference":
1. The current `activeSubjects` are captured as the reference group.
2. The summary zone updates to show the reference label.
3. The user can now change filters freely -- the study group (current filtered subjects) is compared against the locked reference.

### Interaction flow

1. **Establish reference (default controls):** User opens Cohort View. Reference is implicitly concurrent controls (dose level 0) matching the sex distribution of the active preset. No action needed -- the comparison engine computes this automatically.

2. **Establish reference (custom):**
   a. User filters to the desired reference population (e.g., Recovery preset, Female only).
   b. User clicks "Set as reference" in Zone 2.
   c. Zone 2 updates: shows locked reference label + count, "Clear" and "Change" links.
   d. User changes filters to define the study group they want to compare.
   e. Evidence table switches to comparison mode (see Q2).

3. **Establish reference (from saved cohort):**
   a. User right-clicks a saved cohort checkbox in Zone 1.
   b. Context menu: "Load cohort", "Use as reference", "Rename...", "Delete".
   c. Selecting "Use as reference" resolves the saved cohort's filters, captures the resulting subject set as reference.

4. **Clear reference:**
   a. User clicks "Clear" in the reference indicator (Zone 2).
   b. Returns to implicit control comparison.

### Design system compliance

| Rule | How followed |
|------|-------------|
| Right-click for overrides (CLAUDE.md) | Saved cohort context menu uses `onContextMenu`, no ChevronDown icon |
| No colored badges for categorical identity (CLAUDE.md) | Reference indicator uses neutral gray badge styling: `bg-gray-100 text-gray-600 border-gray-200` |
| Context panel pane ordering (CLAUDE.md) | Reference action lives in the rail, not the context panel |
| Color discipline (CLAUDE.md) | "Set as reference" link uses `text-primary` (interactive blue), not a saturated badge |

---

## Q2: How does the evidence table show the comparison?

### Recommendation: (b) Mode switch -- toggle between "Subjects" and "Comparison" views

The evidence table has two halves: a fixed-width left group summary table (280px) and a scrollable right subject-detail table. When a reference is active, a segmented control toggles the right half between "Subjects" (current per-subject columns) and "Comparison" (group aggregate columns: study vs reference).

**Why not the other options:**
- (a) Add columns -- appending reference + delta columns to the right of 20 subject columns makes the table unreadably wide. Subject columns already push horizontal scroll; more columns worsen it.
- (c) Split table -- spatial anchoring requires identical axes, but stacking study/reference rows doubles vertical space and breaks the organ-tab + finding-row scan pattern.

**Why mode switch works:**
- The left group summary table (domain, finding, dose-level stats) stays visible in both modes -- it's the anchor.
- The right panel swaps between detailed (per-subject) and analytical (per-group) views. Users switch based on their current question: "Which subjects are affected?" vs. "Is this finding discriminating?"
- Follows the established Findings + Heatmap Toggle pattern (Datagrok patterns section 6.3): segmented control, persistent elements across modes, shared selection state.

### ASCII mockup

**Subjects mode (default, current behavior):**
```
+-----------------------------+-----------------------------------+
| CENTER PANEL                                                    |
+-----------------------------+-----------------------------------+
| [LIVER] [KIDNEY] [HEART]   | Shared: ALT elevated, AST elev.. |
+-----------------------------+-----------------------------------+
| Dom | Finding    | Ctrl| Hi | [Subjects | Comparison]           |
|-----|------------|-----|----|-----------+------------------------|
|     |            |     |    | 1001| 1002| 1003| 1004| 1005|... |
| MI  | Hypertro.. | 0/5 | 4/5| 3   | 2   | 4   | --  | 3   |   |
| LB  | ALT        | 1.0 | 2.8| 3.1x| 2.5x| --  | 2.9x| 3.0x|  |
| OM  | Liver wt   | 0   |+18%| +22%| +15%| +19%| --  | +16%|   |
+-----------------------------+-----------------------------------+
```

**Comparison mode (when reference is active):**
```
+-----------------------------+-----------------------------------+
| CENTER PANEL                                                    |
+-----------------------------+-----------------------------------+
| [LIVER] [KIDNEY] [HEART]   | REF: Controls (42) vs Study (12) |
+-----------------------------+-----------------------------------+
| Dom | Finding    | Ctrl| Hi | [Subjects | Comparison]           |
|-----|------------|-----|----|-----------+------------------------|
|     |            |     |    | Ref  | Study| Delta| Disc         |
| MI  | Hypertro.. | 0/5 | 4/5| 0/21 | 4/5  | p<.01|  *          |
| LB  | ALT        | 1.0 | 2.8| 1.0x | 2.7x | +170%|  *          |
| OM  | Liver wt   | 0   |+18%| +2%  | +18% | +16pp|  *          |
| LB  | Albumin    | 4.2 | 4.0| 4.1  | 4.0  | -2%  |             |
+-----------------------------+-----------------------------------+
```

**Comparison columns (right side in Comparison mode):**

| Column | Width | Content | Styling |
|--------|-------|---------|---------|
| Ref | ~60px | Reference group aggregate (mean or n/N incidence) | `text-muted-foreground font-mono` |
| Study | ~60px | Study group aggregate | `font-mono` |
| Delta | ~70px | Fold-change delta (continuous) or Fisher's p (incidence) | Neutral at rest; on hover, use p-value color scale per design guide section 1.2 |
| Disc | ~30px | Discriminating flag: `*` centered when `isDiscriminating === true` | `text-muted-foreground` centered glyph (follows Boolean column pattern, design guide section 4.6) |

### Interaction flow

1. When no explicit reference is set, comparison mode is still available -- it uses implicit controls as reference.
2. User clicks "Comparison" in the segmented control above the right table half.
3. Right columns switch from per-subject to group aggregates.
4. Discriminating findings (present in study, absent/low in reference) show `*` in the Disc column.
5. User can click a finding row to see full comparison detail in the context panel.
6. Switching back to "Subjects" restores per-subject columns. Selection state (hovered row) persists across modes.

### Design system compliance

| Rule | How followed |
|------|-------------|
| Grid evidence color strategy -- interaction-driven (CLAUDE.md) | Delta column neutral at rest, p-value colors appear only on hover via `ev` CSS class |
| Spatial anchoring (CLAUDE.md, patterns section 7) | Left group summary table stays identical in both modes; same finding rows, same dose columns, same order |
| Canonical tab bar pattern (CLAUDE.md) | Segmented control: active `h-0.5 bg-primary` underline, `text-foreground`; inactive `text-muted-foreground` |
| Table column layout -- content-hugging with absorber (CLAUDE.md) | Ref, Study, Delta columns use `width: 1px; white-space: nowrap`; Disc uses fixed 30px |
| No decision red repetition per row (CLAUDE.md) | Disc column uses neutral `*` glyph, not red; the left pipe already carries severity color |
| Boolean columns (design guide section 4.6) | Disc column uses centered `*` glyph for true, empty for false |
| Heatmap matrices use neutral grayscale heat (CLAUDE.md) | Not applicable here -- comparison cells use text, not heatmap fills |

---

## Q3: Where does "Save cohort" live?

### Recommendation: (a) Button in the rail near presets (Zone 1)

A small "Save..." link-style button after the preset checkboxes in Zone 1. When filters are active (any predicate beyond "All"), the button becomes visible. Clicking opens a compact inline naming input that replaces the button temporarily (no modal, no dialog).

**Why not the other options:**
- (b) Button in filter pills zone -- the filter pills zone is dynamic (appears/disappears based on predicate count); anchoring a persistent "Save" action in a transient zone is fragile.
- (c) Context menu on filter state -- undiscoverable; users won't think to right-click on the filter pills.
- (d) Context panel action -- the context panel summarizes the cohort, it doesn't manage cohort definitions. Save is a write action on the filter state, which lives in the rail.

### ASCII mockup

**Normal state (filters active):**
```
+-------------------+
| Zone 1: Presets   |
| [x] All           |
| [ ] TRS  [ ] Histo|
| [ ] Recovery      |
|           Save... |   <-- text-xs text-primary, right-aligned
+-------------------+
```

**Naming input (after clicking "Save..."):**
```
+-------------------+
| Zone 1: Presets   |
| [x] All           |
| [ ] TRS  [ ] Histo|
| [ ] Recovery      |
|                   |
| Name: [________] |   <-- text-xs input, auto-focused
| [Cancel] [SAVE]  |   <-- text-xs links; SAVE is btn.primary
+-------------------+
```

**After saving, the saved cohort appears in Zone 1 (see Q4):**
```
+-------------------+
| Zone 1: Presets   |
| [x] All           |
| [ ] TRS  [ ] Histo|
| [ ] Recovery      |
|           Save... |
| ---- Saved ----   |   <-- section divider
| [ ] High-dose F   |   <-- saved cohort checkbox
| [ ] Liver cohort  |
+-------------------+
```

### Interaction flow

1. User applies filters (presets, advanced predicates, dose/sex filters).
2. "Save..." link appears in Zone 1 (hidden when only "All" is selected and no predicates exist).
3. User clicks "Save...".
4. Inline naming input appears. Placeholder: "Cohort name".
5. User types a name and presses Enter or clicks SAVE.
6. System serializes: `{ presets, filterGroup, convenience: { doseFilter, sexFilter, searchQuery } }`.
7. Persisted via annotations CRUD: `PUT /api/studies/{studyId}/annotations/saved-cohorts/{cohortId}`.
8. New cohort appears as a checkbox in the saved cohorts section (Zone 1).
9. "Cancel" or Escape dismisses the naming input.

### Design system compliance

| Rule | How followed |
|------|-------------|
| Ribbon for actions, not navigation (patterns section 4.3) | Save is a data-write action, not navigation; placing it in the rail near the state it captures is appropriate |
| Interactivity rule (CLAUDE.md reference) | Every click produces a visible result: Save... opens input, SAVE persists and shows the new checkbox |
| No colored badges for categorical identity (CLAUDE.md) | Saved cohort names render as neutral text, same as preset labels |
| UI casing (reference) | Button text: "Save..." (sentence case); SAVE button (uppercase exception) |

---

## Q4: How do saved cohorts coexist with presets?

### Recommendation: (a) Replace -- loading a saved cohort replaces current filters entirely

When the user checks a saved cohort checkbox, it **replaces** the entire filter state: activePresets, filterGroup, and convenience filters are restored to their saved values. This is exclusive -- checking a saved cohort unchecks any other saved cohort and resets manual filter state.

Saved cohorts and presets are shown in **separate sections** within Zone 1, divided by a thin border. Presets remain above (combinable with each other as today). Saved cohorts appear below. The two sections interact as follows:

- **Checking a saved cohort:** Restores saved presets + filters. Unchecks any previously checked saved cohort. Preset checkboxes update to match the saved state.
- **Modifying filters after loading a saved cohort:** The saved cohort checkbox unchecks automatically (the user has diverged from the saved state). Presets and manual filters now reflect the user's manual state.
- **Checking a preset after a saved cohort is loaded:** Unchecks the saved cohort (the user is now in manual mode). The preset takes effect normally.

**Why not the other options:**
- (b) Add as preset (combinable) -- saved cohorts contain full FilterGroup state (AND/OR predicates for organ, syndrome, severity, etc.). Merging two FilterGroups creates ambiguous semantics: does the saved "Liver adverse females" cohort AND with the user's current "High dose + BW loss > 10%"? The combinatorial explosion makes the result unpredictable.
- (c) Separate section, exclusive within saved but combinable with presets -- saved cohorts already encode presets internally. If a saved cohort says "TRS preset + Organ:LIVER", combining it with the user's manual "Recovery preset" creates conflict: which preset wins?

**The replace model is simple:** a saved cohort is a snapshot. Loading it restores the exact filter state. The user sees exactly what they saved. If they want to modify, they can -- but they're now in manual mode.

### ASCII mockup

```
+-------------------+
| Zone 1: Presets   |
| [x] All           |  <-- preset checkboxes (combinable)
| [ ] TRS           |
| [ ] Histo         |
| [ ] Recovery      |
|           Save... |
|- - - - - - - - - -|  <-- thin border-b divider
| SAVED             |  <-- section header: text-[10px] font-semibold
|                   |      uppercase tracking-wider text-muted-foreground
| [x] Liver F hi-d  |  <-- pinned saved cohort (always visible)
| [ ] BW losers     |  <-- pinned saved cohort
|                   |
| + 3 more          |  <-- expandable: unpinned saved cohorts
|   [ ] Recovery M  |      (collapsed by default per SAVE-04)
|   [ ] Histo only  |
|   [ ] Full study  |
+-------------------+
```

**Right-click on a saved cohort checkbox:**
```
+--------------------+
| Load cohort        |   <-- same as checking the checkbox
| Use as reference   |   <-- locks as reference group (see Q1)
|- - - - - - - - - -|
| Pin to top         |   <-- toggles pinned state
| Rename...          |   <-- inline rename
| Delete             |   <-- confirmation needed
+--------------------+
```

### Interaction flow

1. **Load saved cohort:** User checks "Liver F hi-d" checkbox.
   - Presets update to match saved state (e.g., "All" becomes unchecked, "Histo" becomes checked).
   - FilterGroup restores saved predicates.
   - Convenience filters restore saved dose/sex/search state.
   - Other saved cohort checkboxes uncheck.

2. **Diverge from saved cohort:** User changes any filter (adds predicate, toggles preset, etc.).
   - "Liver F hi-d" checkbox auto-unchecks.
   - User is now in manual filter mode.

3. **Pin/unpin:** Right-click a saved cohort, select "Pin to top" or "Unpin".
   - Pinned cohorts always visible in the saved section.
   - Unpinned cohorts collapse into "+ N more" expander.

4. **Delete:** Right-click, select "Delete". Brief confirmation ("Delete 'Liver F hi-d'? This cannot be undone.") via inline prompt, not a modal.

### Design system compliance

| Rule | How followed |
|------|-------------|
| Right-click for overrides / management (CLAUDE.md) | All cohort management (rename, delete, pin, use-as-reference) via `onContextMenu`; no visible management buttons |
| No colored badges for categorical identity (CLAUDE.md) | Saved cohort labels are plain `text-xs font-medium text-foreground` when active, `text-muted-foreground` when inactive -- same as preset labels |
| Rail auto-select on load (patterns section 9) | Loading a saved cohort via URL param (`?cohort=id`) takes priority over default auto-select |
| Context panel pane ordering (CLAUDE.md) | Not affected -- saved cohort management is rail-only |
| Spatial anchoring (CLAUDE.md) | Saved cohort section has fixed position below presets; pin/unpin reorder within the section, never move items between sections |

---

## Q5: What's the reference indicator when active?

### Recommendation: (a) Banner/bar at top of rail -- but specifically, an inline indicator within the existing Zone 2 summary area

Not a separate banner (which adds vertical space and visual weight), but a **state change within Zone 2** that transforms the summary line to show the comparison context. When a reference is active, Zone 2 shows both the reference label and the study group composition, with clear "Clear" and "Change" actions.

**Why not the other options:**
- (b) Badge next to preset zone -- badges are small; the reference group has essential information (label, subject count) that doesn't fit in a badge.
- (c) Colored border or background tint -- violates color discipline (CLAUDE.md: color encodes signal strength only, not mode state). A purple/blue tint on the rail would add a persistent saturated surface, breaking the 10% color budget.
- (d) Context panel prominent section -- the context panel already shows a comparison summary when reference is active (Surface 3 in the functional schema). Duplicating the indicator in both places is redundant, and users scan the rail for filter state, not the context panel.

### ASCII mockup

**Default state (no explicit reference):**
```
+-------------------+
| Zone 2: Summary   |
| 42 subjects . 3 dose grps . M 21 / F 21
|            [Set as reference]
+-------------------+
```

**Reference active:**
```
+-------------------+
| Zone 2: Summary   |
| REF Controls (21)          [Clear]  |   <-- reference line
| vs 12 subjects . M 8 / F 4         |   <-- study group line
|                    [Change ref]     |
+-------------------+
```

The "REF" label uses the rail header typography: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`. The subject count and group label use regular `text-xs`. "Clear" and "Change ref" are `text-xs text-primary` interactive links.

**Center panel header also reflects reference state:**
```
+-----------------------------+
| [LIVER] [KIDNEY]   REF: Controls (21) vs Study (12)   |
+-----------------------------+
```

The center panel header bar (where organ tabs and shared findings live) shows a compact reference summary: `text-[10px] text-muted-foreground` right-aligned. This gives the user orientation without looking back at the rail.

**Context panel comparison section:**
```
+-------------------+
| CONTEXT PANEL     |
+-------------------+
| COMPARISON        |   <-- section header (appears when ref active)
| 8 discriminating  |   <-- insight summary
| findings          |
|                   |
| Top discriminating|   <-- list
| . MI Hypertrophy  |
| . LB ALT          |
| . OM Liver weight |
|                   |
| Ref: Controls (21)|
| Study: Hi-dose (12)|
| Overlap: 0 shared |
+-------------------+
| AFFECTED ORGANS   |   <-- existing sections continue below
| ...               |
+-------------------+
```

The comparison section appears **at the top** of the context panel (priority position: insights first, per patterns section 3.2) when a reference is active. It replaces none of the existing sections -- it inserts above them.

### Interaction flow

1. **Reference activated:** Zone 2 transforms from single summary line to two-line reference indicator. Center panel header gains right-aligned reference summary. Context panel gains new top section.

2. **User scans reference state:**
   - Quick glance at Zone 2 or center header: "REF: Controls (21) vs Study (12)".
   - Detailed comparison: context panel "Comparison" section shows discriminating findings count and list.

3. **Clear reference:** Click "Clear" in Zone 2.
   - Zone 2 reverts to default summary.
   - Center panel header removes reference label.
   - Context panel removes comparison section.
   - Evidence table reverts to Subjects mode (if in Comparison mode).

4. **Change reference:** Click "Change ref" in Zone 2.
   - Current filters become the new reference.
   - Equivalent to: Clear + re-apply current selection as reference.

### Design system compliance

| Rule | How followed |
|------|-------------|
| Color discipline (CLAUDE.md) | No colored border/tint. "REF" label uses neutral `text-muted-foreground` uppercase. No saturated pixels added at rest. |
| No colored badges for categorical identity (CLAUDE.md) | Reference state indicated by text label + layout change, not by a colored badge. |
| Context panel pane ordering (CLAUDE.md) | Comparison section appears first (insights priority) when reference is active, above existing Affected Organs / Shared Findings / etc. |
| Information hierarchy (design guide section 1.11) | Comparison section content is "Finding" tier (evidence-backed conclusions like "8 discriminating findings"). Not "Decision" tier -- no persistent red/amber. |
| Evidence panel background (CLAUDE.md) | Context panel continues to use `bg-muted/5` for evidence sections. |
| Spatial anchoring (CLAUDE.md) | Zone 2 reference indicator stays in the same spatial position as the summary line it replaces. No layout shift for the zones below. |
| Rail header font-weight (CLAUDE.md) | "REF" label: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |

---

## Summary of recommendations

| Question | Decision | Key principle |
|----------|----------|---------------|
| Q1: Establish reference | Button in Zone 2 + right-click on saved cohorts | Rail owns filter state; right-click for secondary actions |
| Q2: Evidence table comparison | Mode switch (Subjects / Comparison) | Follows Findings+Heatmap toggle pattern; spatial anchoring preserved |
| Q3: Save cohort location | Button in Zone 1 near presets | Save action near the state it captures; inline naming, no modal |
| Q4: Saved cohorts vs presets | Replace: loading a saved cohort restores full filter state exclusively | Saved cohort = snapshot; avoids FilterGroup merge ambiguity |
| Q5: Reference indicator | Zone 2 transformation + center header label + context panel top section | Three-tier awareness: rail (state), center (orientation), context (insight) |

---

## Complete layout with all Phase 4 additions

```
+-------------------+-----------------------------+-------------------+
|     RAIL          |      CENTER PANEL           |  CONTEXT PANEL    |
+-------------------+-----------------------------+-------------------+
| Zone 1: Presets   | [LIVER] [KIDNEY] [HEART]    | COMPARISON [NEW]  |
| [x] All           | REF: Controls vs Study (12) | 8 discriminating  |
| [ ] TRS           |                             | . MI Hypertrophy  |
| [ ] Histo         | [Subjects | Comparison]     | . LB ALT          |
| [ ] Recovery      |                             | . OM Liver weight  |
|          Save...  | Dom|Finding  |Ctrl|Hi|      |                   |
|- - - - - - - - - -| ---|---------|----|----|     | Affected Organs   |
| SAVED             | MI |Hyper..  |0/5 |4/5 |    | . Liver (adverse) |
| [x] Liver F hi-d  | LB |ALT     |1.0 |2.8 |    | . Kidney (warn)   |
| [ ] BW losers     | OM |Liver wt|0   |+18%|    |                   |
| + 3 more          |                    ...       | Shared Findings   |
|                   |    COMPARISON MODE:          | . ALT elevated    |
| Zone 2: Summary   |    Ref |Study|Delta|Disc    |                   |
| REF Controls (21) |    0/21|4/5  |p<.01| *      | Tissue Battery    |
| vs 12 subjects    |    1.0x|2.7x |+170%| *      | ok Complete       |
| M 8 / F 4         |    +2% |+18% |+16pp| *      |                   |
| [Clear][Change]   |    4.1 |4.0  |-2%  |        | Composition       |
|                   |                             | . Ctrl  21        |
| Filter pills zone | CohortCharts                | . High  12        |
| [Organ:LIVER] AND | (charts below table)        | M 8 / F 4         |
|                   |                             |                   |
| Zone 3: Quick     |                             | BW Overview       |
| [Dose][Sex][Srch] |                             | [sparkline]       |
| [Filter Panel btn]|                             |                   |
|                   |                             |                   |
| [ ] Include TK    |                             |                   |
|                   |                             |                   |
| Zone 4: Subject   |                             |                   |
| rows (scrollable) |                             |                   |
| |-- PC-1001 M ADV |                             |                   |
| |-- PC-1002 F     |                             |                   |
+-------------------+-----------------------------+-------------------+
```

---

## New state additions to CohortContext

```
referenceGroup: {
  type: "implicit" | "custom" | "saved-cohort"
  subjectIds: Set<string>
  label: string
  savedCohortId?: string       // if loaded from a saved cohort
} | null

comparisonMode: "subjects" | "comparison"   // evidence table mode

savedCohorts: SavedCohort[]                 // loaded from annotations
activeSavedCohortId: string | null          // which saved cohort is checked
```

**Actions to add:**
```
setReferenceFromCurrent: () => void         // lock current activeSubjects as ref
setReferenceFromSaved: (id: string) => void // resolve saved cohort as ref
clearReference: () => void
setComparisonMode: (mode) => void
loadSavedCohort: (id: string) => void       // restore filter state
saveCohort: (name: string) => Promise<void> // serialize + persist
deleteSavedCohort: (id: string) => void
renameSavedCohort: (id, name) => void
pinSavedCohort: (id, pinned) => void
```

---

*Generated: 2026-03-26 for Phase 4 implementation planning*
