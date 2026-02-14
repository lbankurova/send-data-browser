# Preclinical Case — Architecture Redesign (Final)

**Version:** 4.0 (consolidated)
**Supersedes:** `arch-refactor.md`, `arch-redesign-implementation-plan.md`, `arch-redesign-v2.md`, `arch-redesign-v3-decisions.md`
**Scope:** Structural refactor only — no engine, rule, or API changes

---

## 1. Diagnosis

The app has five analytical views (Study Summary, Target Organs, Histopathology, Dose-Response, NOAEL Decision) plus two auxiliary views (Adverse Effects, Validation). Each analytical view maintains its own selection state, its own navigation rail, and its own filter controls.

**Duplication inventory:**

| Concern | Duplicated In |
|---|---|
| Organ rail with search, sorting, auto-select | Study Summary (SignalsOrganRail), Target Organs (OrganRail), NOAEL (OrganRail), Histopath (SpecimenRail grouped by organ) |
| Endpoint selection state | Dose-Response (local + organ groups), Study Summary (SignalSelectionContext), Histopath (local specimen/finding) |
| Organ convergence scoring | Target Organs, Study Summary (buildSignalsPanelData), NOAEL (adverse count aggregation) |
| Filter sets (sex, severity, domain) | Independent per-view, not synchronized |

**Resulting problems:**

1. **Selection doesn't travel.** Selecting liver in Study Summary doesn't carry to Histopath. Every view switch forces re-orientation.
2. **Filters don't travel.** Changing sex to Female in Dose-Response resets when switching to Histopath. Every view switch wipes investigative state.
3. **View switching interrupts flow.** "What does the kidney look like?" requires: leave current view → navigate → re-find organ → re-apply filters → re-orient. A 2-second thought becomes a 15-second detour.

---

## 2. Target Architecture

### Core Principle

The rail, filters, and selection state live in the shell. Views are interchangeable analytical lenses on the same selection. Switching views swaps the center panel — nothing else.

```
ThreePanelShell (persistent)
├── PolymorphicRail (left, persistent)
│   ├── Mode toggle: [Organs] / [Specimens]
│   ├── Global filters (sex, adverse, significant, severity, search)
│   ├── Organ mode items (14 organs, convergence metrics)
│   └── Specimen mode items (40 specimens, heatmap-like badges)
│
├── CenterPanel (route-driven, swaps on navigation)
│   ├── /studies/:id                         → Study Summary
│   ├── /studies/:id/histopathology          → Histopathology
│   ├── /studies/:id/dose-response           → Dose-Response
│   ├── /studies/:id/noael-decision          → NOAEL Decision
│   ├── /studies/:id/analyses/adverse-effects → Adverse Effects (orthogonal)
│   └── /studies/:id/validation              → Validation (orthogonal)
│
├── ContextPanel (right, persistent, content adapts to route + selection)
│   ├── Organ-level panes (insights, endpoints, evidence, links)
│   ├── Endpoint-level panes (insights, stats, correlations, tox assessment)
│   └── Subject-level panes (measurements, clin obs, histopath across organs)
│
└── SharedContexts
    ├── StudySelectionContext
    ├── GlobalFilterContext
    └── RailModeContext
```

### View Ownership (What Each View Is Allowed To Do)

| View | Role | Allowed | Not Allowed |
|---|---|---|---|
| **Study Summary** | Orientation + convergence + triage | Decision bar, study statements, organ convergence, signal heatmap, metrics grid, cross-study insights | Deep drill into findings, rule stack, endpoint quantitative plots |
| **Histopathology** | Primary biological working view | Findings table, dose-incidence charts, severity matrix, subject drill (via matrix → context panel), rule stack, confidence | Computing convergence, re-evaluating NOAEL, re-running engine logic |
| **Dose-Response** | Quantitative analytical lens | Dose charts, statistical tables, pattern analysis, endpoint picker | Endpoint rail, organ grouping, independent search, setting organSystem |
| **NOAEL Decision** | Regulatory decision surface | NOAEL banner, adversity matrix, endpoint evidence, organ-level adverse summary | Independent selection tree, duplicating aggregation logic |
| **Adverse Effects** | Flat search/browse (orthogonal) | Server-side paginated findings, own FindingSelectionContext | N/A — independent |
| **Validation** | Compliance (orthogonal) | Own rule table, own record detail | N/A — independent |

---

## 3. Shared Contexts

### 3.1 StudySelectionContext

```typescript
interface StudySelection {
  studyId: string;
  sex: "Combined" | "M" | "F";
  organSystem?: string;
  specimen?: string;
  endpoint?: string;
  subjectId?: string;
}

interface StudySelectionActions {
  setSex: (sex: StudySelection["sex"]) => void;
  setOrganSystem: (organ: string | undefined) => void;
  setSpecimen: (specimen: string | undefined) => void;
  setEndpoint: (endpoint: string | undefined) => void;
  setSubjectId: (subjectId: string | undefined) => void;
  navigateTo: (partial: Partial<StudySelection>) => void;
  back: () => void;
  canGoBack: boolean;
}
```

**Cascading clear rules:**

| Change | Clears |
|---|---|
| `organSystem` | `specimen`, `endpoint`, `subjectId` |
| `specimen` | `endpoint`, `subjectId` |
| `endpoint` | `subjectId` |
| `sex` | Nothing (sex is a filter, not a hierarchy level) |

**`navigateTo()` is atomic.** Sets all fields in a single state update. Required for cross-view links where organ + endpoint must be set together (otherwise cascade would clear endpoint when organ is set first). Pushes to history stack.

**Selection history.** Shallow stack (last 5 selections). Only `navigateTo()` pushes; individual setters do not. `back()` restores previous selection without triggering cascade clears.

### 3.2 GlobalFilterContext

```typescript
interface GlobalFilters {
  sex: "Combined" | "M" | "F";    // bidirectionally synced with StudySelection.sex
  adverseOnly: boolean;
  significantOnly: boolean;
  minSeverity: number | null;      // null = all, 2 = 2+, 3 = 3+, 4 = 4+
  search: string;
}

interface GlobalFilterActions {
  setFilter: <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => void;
  resetFilters: () => void;
}
```

**What is global:**
- **Sex** — the most common mid-investigation toggle, must be instant and universal
- **Adverse only** — "show me only what matters" is universal
- **Significant only** — "statistically significant findings only" is a study-wide lens
- **Min severity** — applies to both organ items (organs with findings at threshold) and specimen items (specimens with max severity at threshold)
- **Search** — searches organ names in organ mode, specimen names in specimen mode

**What is NOT global:**
- **Domain** — Histopath is MI-specific; setting domain=BW globally would blank out Histopath or force it to ignore the filter (inconsistent either way). Domain stays view-specific.
- **Dose trend** — only meaningful for specimen mode. Rail-mode-specific filter, not global.
- **Sort order** — mode-specific, persists per mode.

**Filter lifecycle:**
- Persist across view switches (the whole point)
- Persist across rail mode switches
- Reset on study switch (new study = clean slate)
- Changing sex filter updates `studySelection.sex` bidirectionally

### 3.3 RailModeContext

```typescript
type RailMode = "organ" | "specimen";

interface RailModeState {
  mode: RailMode;
  setMode: (mode: RailMode) => void;
  userHasToggled: boolean;
}
```

Each view declares a preferred mode on mount. The preference is applied only if `userHasToggled` is false. The flag is cleared when navigating via the browsing tree (explicit view choice), but preserved during cross-view link navigation and browser back/forward.

### 3.4 Provider Nesting

```
<StudySelectionProvider studyId={studyId}>
  <GlobalFilterProvider>
    <RailModeProvider>
      <ThreePanelShell>
        <PolymorphicRail />
        <Outlet />
        <ContextPanel />
      </ThreePanelShell>
    </RailModeProvider>
  </GlobalFilterProvider>
</StudySelectionProvider>
```

---

## 4. Polymorphic Rail

### 4.1 Structure

One rail component, rendered in the shell, outside any view route. Persistent across view switches — no remount, no state loss, same scroll position.

**Header layout:**
```
┌──────────────────────────────┐
│  [Organs]  [Specimens]  (40) │  ← mode toggle + filtered count
│  🔍 Search...                │
│  Sort: [Signal ▾]            │  ← mode-specific sort
│  Sex: [Combined ▾]           │  ← global filter
│  Sev: [all ▾]  ☐ Adv  ☐ Sig │  ← global filters
│  Trend: [all ▾]              │  ← specimen mode only
│  Showing: Female · Adv · 8/40│  ← FilterShowingLine (when non-default)
└──────────────────────────────┘
```

### 4.2 Organ Mode

One item per organ system (~14 typical). Designed for triage — which systems are affected, how strong is the evidence.

**Item layout (4-5 rows of condensed convergence data):**
- Row 1: Organ name + TARGET badge + dominant direction arrow (↑/↓/↕)
- Row 2: Evidence score bar (EvidenceBar, gray track, normalized to max) + numeric score
- Row 3: `{N} sig · {N} TR · {N} domains` + domain chips (colored text)
- Row 4: `|d|={max}` + `trend p={min}` (weight-emphasized when strong)
- Row 5 (optional): `D-R: {N} endpoints ({topEndpoint})`

**Sort options:** Evidence (default, targets first), Adverse count, Effect size, A–Z

**Click:** Sets `studySelection.organSystem`. All views respond.

**Data source:** `useTargetOrganSummary` + `computeOrganRailStats()` (same data as current Study Summary rail).

### 4.3 Specimen Mode

One item per specimen (~40 typical). The heatmap-like scannable surface from the current Histopath rail. This is the highest-information-density element in the app. Every pixel earns its space.

**Item layout (pixel-identical to current SpecimenRailItem):**
- Row 1: Specimen name + review glyph (✓/~) + dose-trend glyphs (▲▲▲/▲▲/▲ with opacity fading) + severity badge (heat-colored) + incidence badge (heat-colored) + finding count + adverse count
- Row 2: Organ system label + domain chips

**Sort options:** Signal (default, composite score), Organ (grouped with sticky headers), Severity, Incidence, A–Z

**Click:** Sets `studySelection.specimen` (which also derives and sets `organSystem`).

**Data source:** Same as current `useHistopathData` specimen aggregation.

### 4.4 Mode-Specific Filters

| Filter | Organ Mode | Specimen Mode |
|---|---|---|
| Sort | Evidence / Adverse / Effect / A-Z | Signal / Organ / Severity / Incidence / A-Z |
| Dose trend | Hidden | All / Moderate+ / Strong |
| All other filters | Global, shared | Global, shared |

### 4.5 Rail Behavior on Selection

When in specimen mode and an organ is selected (e.g., from a cross-view link), the rail stays in specimen mode but filters/scrolls to specimens in that organ. A breadcrumb chip shows "Filtered to: Hepatic ×" with dismiss to clear. This respects the user's mode choice.

### 4.6 Keyboard

| Key | Action |
|---|---|
| ↑ / ↓ | Navigate items in current mode |
| Escape | Clear selection |

---

## 5. How Each View Responds to Selections

### 5.1 Study Summary

| Selection | Center Panel Response |
|---|---|
| Organ (organ mode) | Evidence panel: organ overview (insights, domain breakdown, top findings, signal matrix) |
| Specimen (specimen mode) | Evidence panel: organ-level content for specimen's organ system. Study Summary is always organ-level — the specimen selection carries forward if user navigates to Histopath. |
| None | Decision bar + study statements visible. Auto-selects top organ on load. |

**Rail mode preference:** Organ

### 5.2 Histopathology

| Selection | Center Panel Response |
|---|---|
| Organ (organ mode) | Organ-level Histopath summary: aggregate findings across all specimens in this organ, aggregate incidence, severity overview. Lightweight view migrated from Target Organs evidence tab. |
| Specimen (specimen mode) | Full specimen view: findings table, dose-incidence charts, severity matrix (group/subject toggle). This is the primary Histopath workflow. |
| None | Auto-selects top specimen on load. |

**Rail mode preference:** Specimen

**Subject drill path (preserved):** Severity matrix → Subjects toggle → click subject ID → context panel shows subject narrative (measurements, clinical observations, histopath across all organs). This cross-domain subject view is triggered by `studySelection.subjectId` and renders in the shared context panel. It works from any view where subject IDs are clickable.

### 5.3 Dose-Response

| Selection | Center Panel Response |
|---|---|
| Organ or Specimen selected | D-R analysis for the top endpoint (auto-selected by signal score). Endpoint picker in header allows switching. |
| None | Empty state: "Select an organ or specimen to view dose-response analysis." with navigation buttons. |

**Rail mode preference:** None (respects whatever the user has set)

**Endpoint picker:** Compact dropdown in the D-R header, scoped to the current organ/specimen. Shows finding name + dose-trend glyphs + peak severity + incidence + adverse count per row. Sorted by signal score. Keyboard-navigable. Selection writes to `studySelection.endpoint`. Bookmarks live here (star icon per row, filter toggle at top of dropdown).

```
┌─────────────────────────────────────────────────────────────────┐
│  LIVER › VACUOLIZATION                        [▾ 11 findings]  │
│  MA · MI · Both sexes · Dose trend: Strong                     │
│  Monotonic increase, trend p=0.0031, |d|=2.23                  │
├─────────────────────────────────────────────────────────────────┤
│  [Evidence]  [Hypotheses]  [Metrics]                            │
│  ...                                                            │
```

Picker expanded:
```
┌──────────────────────────────────────────────────┐
│  VACUOLIZATION        ▲▲▲  3.0  60%   1A  ← sel │
│  HYPERTROPHY          ▲▲▲  2.6  60%   1A       │
│  NECROSIS             ▲▲   2.0  27%   0A       │
│  INFLAMMATION         ▲▲   2.0  13%   0A       │
│  ENLARGED             ▲    —    33%   0A       │
│  ...                                            │
└──────────────────────────────────────────────────┘
```

D-R always auto-selects the top endpoint when organ/specimen changes. The user is never staring at a blank panel after clicking something in the rail.

The Metrics tab within D-R retains clickable rows. Clicking a row calls `studySelection.setEndpoint()` — not local state. This preserves the power-user scan-across-endpoints workflow.

### 5.4 NOAEL Decision

| Selection | Center Panel Response |
|---|---|
| Organ (organ mode) | Organ adversity evidence: endpoint summary, adversity matrix, insights |
| Specimen (specimen mode) | Organ-level evidence for specimen's organ. NOAEL is always organ-level. |
| None | NOAEL banner (always visible) + auto-selects organ with most adverse findings. |

**Rail mode preference:** Organ

NOAEL writes to `studySelection.organSystem` when the user clicks an organ. If they then switch to Histopath, they see that organ's specimens. This is correct — shared state means shared state.

---

## 6. Context Panel

The context panel is a shell-level component. Its content adapts to the current route and selection level.

### 6.1 Selection Levels

| Level | Trigger | Content |
|---|---|---|
| No selection | Default | Prompt: "Select an organ or specimen to see details." |
| Organ | `organSystem` set, no `endpoint` or `subjectId` | Organ insights, contributing endpoints, evidence breakdown, cross-view links |
| Endpoint | `endpoint` set, no `subjectId` | Insights, statistics, correlations, tox assessment form, cross-view links |
| Subject | `subjectId` set (from severity matrix click) | Subject header (sex, dose, disposition), measurements (body weight sparkline + lab table), clinical observations summary, histopathology table (all specimens × findings × severity) |

### 6.2 Cross-View Links

Cross-view links are center panel swaps — they change the route but don't touch the rail, filters, or selection. The shell stays stable.

| Link | Action |
|---|---|
| "View in Histopathology →" | Route to `/histopathology`. Rail/selection unchanged. |
| "View in Dose-Response →" | `navigateTo({ organSystem, endpoint })` + route to `/dose-response`. Atomic so endpoint isn't cleared. |
| "View in NOAEL →" | Route to `/noael-decision`. Rail/selection unchanged. |
| Correlation row click (in D-R context) | `setEndpoint(clicked)`. Stays in D-R. |
| Contributing endpoint click (in organ context) | `navigateTo({ organSystem, endpoint })` + route to `/dose-response`. |

All "View in Target Organs →" links are removed (Target Organs is folded into Study Summary).

---

## 7. Orthogonal Views

### 7.1 Adverse Effects

Stays fully independent. Server-side paginated findings table with own `FindingSelectionContext` and own filter bar. Reads `studySelection.studyId` for scoping, nothing else.

Future enhancement: row action "View in context →" that calls `studySelection.navigateTo({ organSystem, specimen, endpoint })` and routes to the appropriate view. Not in scope for this refactor.

### 7.2 Validation

Stays fully independent. Own rule table, own record detail.

Enhancement for Study Summary: promote worst validation failures to the Study Summary decision bar as a warning. "⚠ 3 data fitness issues affect analysis reliability — Review →" linking to the Validation view. This surfaces data fitness in the investigative flow without coupling the architectures. Not blocking for this refactor but high-value addition.

---

## 8. What Gets Eliminated

| Before | After |
|---|---|
| 5 independent rails | 1 polymorphic rail (shell-level) |
| 5 independent filter sets | 1 global filter set (shell-level) |
| 5 independent selection states | 1 shared StudySelectionContext |
| Target Organs route + components | Folded into Study Summary + organ mode rail |
| Dose-Response endpoint rail (300px) | Inline endpoint picker in D-R header |
| View switches that destroy context | Center panel swaps, shell stays stable |

## 9. What Gets Preserved

| Feature | How |
|---|---|
| Specimen rail scannability (heatmap-like badges) | Specimen mode = current Histopath rail, pixel-identical |
| Histopath sort modes (Signal, Organ, Severity, Incidence, A-Z) | All five modes preserved in specimen mode |
| Organ triage rail (convergence metrics) | Organ mode = current Study Summary rail, enriched with Target Organs data |
| Dose-Response endpoint scanning | Endpoint picker with same data density (badges, scores, trends) |
| NOAEL multi-organ decision workflow | Organ mode rail + NOAEL center panel |
| Subject narrative via severity matrix | Subject drill path preserved: matrix → click subject → context panel |
| Adverse Effects independence | Unchanged |
| Validation independence | Unchanged |
| All statistical engines, rules, clinical logic | Unchanged |

---

## 10. Implementation Phases

### Phase 1: Shared Contexts

Create `StudySelectionContext`, `GlobalFilterContext`, `RailModeContext`. Wire at shell level. Implement `navigateTo()` with atomic updates and shallow history stack. Implement bidirectional sex sync between GlobalFilters and StudySelection.

**Deliverable:** Contexts exist and are provided. No views consume them yet. Existing views still work with their local state.

**Verify:**
- [ ] All three contexts provided at shell level
- [ ] `navigateTo()` sets multiple fields atomically (unit test)
- [ ] Cascade clears work (unit test)
- [ ] `back()` restores previous selection (unit test)
- [ ] Sex sync works bidirectionally (unit test)

### Phase 2: Polymorphic Rail

Build the shared rail component at the shell level. Implement organ mode (porting from `SignalsOrganRail`) and specimen mode (porting from `SpecimenRailItem`). Wire to contexts. Render in the shell alongside — but not yet replacing — existing view-internal rails.

**Deliverable:** Shared rail renders in the shell. Both modes work. Filters work. Selection writes to `StudySelectionContext`. Existing view-internal rails still exist (temporarily redundant).

**Verify:**
- [ ] Organ mode renders all organs with evidence scores, TARGET badges, stats
- [ ] Specimen mode renders all specimens with full badge layout (pixel-match against current Histopath rail)
- [ ] Mode toggle works, persists across mock view switches
- [ ] All five specimen sort modes work (Signal, Organ, Severity, Incidence, A-Z)
- [ ] Global filters work (sex, adverse, significant, severity, search)
- [ ] FilterShowingLine appears when non-default filters active
- [ ] Organ click sets `studySelection.organSystem`
- [ ] Specimen click sets `studySelection.specimen` (and derives organSystem)
- [ ] Keyboard navigation works (↑/↓)

### Phase 3: View Migration (incremental)

Migrate views one at a time. Each migration: remove view-internal rail, wire center panel to read from shared contexts.

**3a — Study Summary:**
- Remove `SignalsOrganRail` from inside the view
- Evidence panel reads `studySelection.organSystem` for organ selection
- Heatmap cell click and metrics table row click write to `studySelection.endpoint`
- Remove `SignalSelectionContext` (or keep as thin facade during migration, remove in Phase 5)

**3b — Histopathology:**
- Remove internal `SpecimenRail`
- Center panel reads `studySelection.specimen` for specimen view and `studySelection.organSystem` for organ-level view
- Build lightweight organ-level Histopath summary (aggregate findings, incidence, severity across specimens in organ) — for when organ is selected but no specimen
- Subject drill path: severity matrix subject click writes `studySelection.subjectId`, context panel renders subject narrative (existing behavior, just wired through shared context)

**3c — Dose-Response:**
- Remove internal `EndpointRail`, `PanelResizeHandle`, bookmark rail logic, local selection state
- Build endpoint picker in center panel header
- Center panel reads `studySelection.endpoint` (auto-selects top endpoint when organ/specimen changes)
- Migrate bookmarks to endpoint picker
- Metrics tab row click writes to `studySelection.endpoint`
- Evidence panel fills full center panel width (no rail width allocation)

**3d — NOAEL:**
- Remove internal `OrganRail`
- Center panel reads `studySelection.organSystem`
- NOAEL banner stays persistent
- Organ click writes to `studySelection.organSystem` (shared)

**Each sub-phase is a separate commit with verification.**

**Verify per sub-phase:**
- [ ] View has no internal rail
- [ ] View reads from shared contexts
- [ ] Center panel fills `flex-1`
- [ ] Selection from shared rail updates center panel correctly
- [ ] Context panel updates correctly for this view's route
- [ ] No regressions in view-specific content (charts, tables, matrices)

### Phase 4: Fold Target Organs

Delete Target Organs route, components, and browsing tree entry. Migrate convergence-specific content into organ mode rail items and Study Summary evidence panel. Add redirect from `/target-organs` to `/?tab=signals`.

Remove all "View in Target Organs →" links. Update contributing endpoint clicks to navigate to Histopath or Dose-Response.

**Verify:**
- [ ] No `/target-organs` route exists
- [ ] No Target Organs in browsing tree
- [ ] Organ convergence information visible in Study Summary
- [ ] All former Target Organs links redirected or removed
- [ ] `useTargetOrganSummary` still called (no data loss)

### Phase 5: Cleanup

- Delete `SignalSelectionContext` (if not already removed)
- Delete all removed rail components (`SignalsOrganRail`, `SpecimenRail`, `EndpointRail`, `OrganRail` in NOAEL)
- Delete Target Organs components
- Update all cross-view links to use `navigateTo()` + route change pattern
- Final navigation audit
- Final duplication audit

**Verify (final invariants):**
- [ ] One rail component exists in the shell (no view-internal rails)
- [ ] One filter set exists (no view-internal filter state for global filters)
- [ ] One selection context exists (no view-internal selection state, except Adverse Effects and Validation)
- [ ] Target Organs route and components fully deleted
- [ ] All cross-view links use `navigateTo()` before routing
- [ ] No duplicate aggregation logic (convergence computed once via `useTargetOrganSummary`)

---

## 11. Phase Dependencies

```
Phase 1 (Contexts)
    │
    ├──→ Phase 2 (Polymorphic Rail) ─── requires Phase 1
    │         │
    │         └──→ Phase 3a-3d (View Migration) ─── requires Phase 2
    │                   │
    │                   └──→ Phase 5 (Cleanup) ─── requires all of Phase 3
    │
    └──→ Phase 4 (Fold Target Organs) ─── requires Phase 1, can parallel Phase 2-3
```

Phase 4 is independent of Phases 2-3 and can happen in parallel, but is easier after Phase 3a (Study Summary migration) since that's where Target Organs content lands.

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Polymorphic rail becomes a god component | Strict composition: `PolymorphicRail` → `<OrganRailMode>` or `<SpecimenRailMode>`. Each self-contained. Shared filter bar is a separate component. Mode toggle is a separate component. Shell component is a thin orchestrator. |
| Specimen mode with ~40 items impacts performance | Virtualize if >50 items (react-window). Only the active mode renders. |
| `userHasToggled` flag causes confusion ("why won't it switch to specimen mode when I open Histopath?") | Clear the flag on explicit browsing-tree navigation. Preserve only during cross-view links and back/forward. |
| Endpoint picker in D-R is less scannable than current full endpoint rail | Design picker wide enough (match center panel width). Dense badge layout (same info as current rail item Row 2). If insufficient after testing, escalate to a slide-out panel. |
| Global sex filter creates confusion (user forgets it's set) | `FilterShowingLine` always visible when non-default filters active. Every view shows "Showing: Female" in the rail. Hard to miss. |
| `SignalSelectionContext` removal breaks context panel during migration | Keep as thin facade delegating to `StudySelectionContext` during Phase 3. Remove in Phase 5 only after all consumers migrated. |
| Cross-view links break during partial migration | Run navigation audit after each Phase 3 sub-phase. Keep redirect from deleted routes. |

---

## 13. Future Compatibility

The architecture accommodates these future additions without structural changes:

| Addition | How It Fits |
|---|---|
| **PK/TK view** (concentration-time, exposure-response) | Another center panel route. Reads `studySelection.organSystem` or `subjectId`. Exposure metrics in context panel alongside D-R stats. |
| **Subject narrative full-width view** | Another center panel route for complex animals with many timepoints. The 280px context panel subject view covers most cases; full-width is a power-user option. |
| **Data fitness promotion** | Worst validation failures promoted to Study Summary decision bar as warnings. Architecturally trivial (read from validation results, render in decision bar). |
| **Historical control context** | Reference ranges in context panel (e.g., "Historical: 0-5% incidence in SD rats"). Reference bands on D-R charts. Data availability issue, not architecture issue. |
| **Cross-study database** | Requires study-level selector, not organ/specimen rail. `StudySelectionContext` extends to hold multiple study IDs. The polymorphic rail could add a study-comparison mode. Separate scope. |
| **Study-type-specific behavior** | Additional center panel view modes or conditional sections (e.g., survival curves for carc studies, litter-level stats for repro). No architecture changes needed. |
| **Rename Histopath → OrganExplorer** | Only after cross-domain evidence block is added to justify the broader name. Cosmetic change at that point. |
| **Cross-domain evidence block in Histopath** | List non-MI endpoints for selected organ with signal strength/direction. Fits in center panel as a new section. No architecture changes. |
| **Rail mode extensibility** | `RailMode` is a union type, not a boolean. Adding `"subject"` or `"endpoint"` modes later is a type extension, not a redesign. |

---

## 14. Non-Goals (Do Not Modify)

- Statistical engine (rules R01–R19)
- Clinical catalog
- Rule suppression logic
- Backend APIs
- Rule emission format
- Design system specs (colors, typography, spacing)
- Adverse Effects view (orthogonal)
- Validation view (orthogonal)

---

## Appendix: Known Spec Deviations (as-built)

### D1: Sex filter type
- **Spec:** `"Combined" | "M" | "F"` (§3.1, §3.2)
- **As-built:** `string | null` (null = all sexes)
- **Rationale:** `null` is more idiomatic for "no filter". "Combined" is a display label, not a data value.

### D2: minSeverity type
- **Spec:** `number | null` (null = all, §3.2)
- **As-built:** `number` (0 = no filter)
- **Rationale:** `severity >= 0` is always true, so 0 naturally means "no filter" without null-guarding.

### D3: Individual selection setters
- **Spec:** `setSex()`, `setOrganSystem()`, `setSpecimen()`, `setEndpoint()`, `setSubjectId()` (§3.1)
- **As-built:** Only `navigateTo(partial)` exposed.
- **Rationale:** Individual setters would be thin wrappers around `navigateTo` with the same cascade logic. `navigateTo({ endpoint })` serves the same purpose. Atomicity prevents partial-update bugs.

### D4: setFilter API shape
- **Spec:** `setFilter<K>(key, value)` generic single-key setter (§3.2)
- **As-built:** `setFilters(partial: Partial<GlobalFilters>)` bulk updater
- **Rationale:** Strictly more capable — supports both single-key and multi-key atomic updates.
