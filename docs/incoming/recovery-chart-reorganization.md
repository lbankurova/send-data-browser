# Recovery & Distribution Chart Reorganization

**Date:** 2026-03-24
**Branch:** `merge-findings-dr`
**Status:** Design approved, implementation planned

---

## Summary

Move distribution strip plots from the context panel to the center panel as a tab alongside the effect size chart. Add a Recovery tab to the left sub-panel alongside the D-R chart. Extend the backend to compute multi-day recovery statistics (interim measurements). Restructure the context panel recovery pane as an evidence + override surface.

## Design Decisions

### D1: Distribution moves to center panel
- **Rationale:** 280px context panel too narrow for 8 strips (4 dose × 2 sex = ~31px/strip). Center panel gives ~500px (~60px/strip). Distribution is raw data exploration, not insight — belongs with other dose-response visualizations, not between VerdictPane and EvidencePane.
- **Layout:** Interleaved sex within dose group (F/M side-by-side per dose lane, sex-colored dots) rather than two separate panels.

### D2: Center panel dual-tab layout
```
┌─── [ D-R | Recovery ] ─────┬─── [ Effect | Distribution ] ───┐
│                              │                                  │
│  Left sub-panel              │  Right sub-panel                 │
│  (resizable split)           │  (resizable split)               │
│                              │                                  │
└──────────────────────────────┴──────────────────────────────────┘
```
- Default state: D-R + Effect (current behavior, unchanged)
- User can view Recovery + Distribution simultaneously (left=dumbbell, right=strips)

### D3: Recovery is a population swap, not an overlay
- Recovery animals are a separate satellite group — different subjects than main study.
- **Continuous:** Recovery checkbox hides main study dots, shows recovery animal values.
- **Incidence:** Switches to recovery specimens (different animals, different slides).
- No overlay — would falsely imply paired before/after comparison.

### D4: Recovery tab drives all charts
- Clicking Recovery tab on left auto-updates:
  - Day stepper → repopulates with recovery-period days
  - Effect size chart → shows residual effect sizes (recovery animals vs recovery controls)
  - Distribution (when active) → shows recovery animals
- Findings table stays unchanged (always shows main study findings).

### D5: Day stepper is active during recovery
- Recovery animals have interim measurements (BW weekly, LB at draws).
- Stepper shows all available recovery-period days, not just final sacrifice.
- For endpoints with single recovery timepoint (MI/MA/OM): stepper shows one option.

### D6: Recovery verdict column in findings table
- Auto-generated verdict badge (Reversed / Partial / Persistent / —).
- Neutral gray per categorical identity rule. `bg-violet-50/40` tint for overridable.
- Override stored via annotations system (same pattern as ToxFindingForm).
- Underlying evidence shown in context panel recovery pane.

### D7: Context panel recovery pane becomes evidence + override surface
- Dumbbell chart moves to center panel Recovery tab.
- Context panel pane retains: verdict with override, terminal vs recovery stats comparison, residual %, control drift, classification (histopath 7-tier), confidence, qualifiers, recommended actions.

---

## Phase 1: Center Panel Tab Infrastructure

**Goal:** Establish the dual-tab layout and move distribution to center panel. No recovery functionality — just layout reorganization.

**Depends on:** Nothing (can start immediately)

### Tasks

#### 1.1 Add tab bar to right sub-panel
- File: `DoseResponseChartPanel.tsx`
- Add tab bar above the right sub-panel content: `Effect | Distribution`
- Tab bar uses canonical pattern: `h-0.5 bg-primary` underline, `text-xs font-medium`, `bg-muted/30` container
- Default active tab: Effect (preserves current behavior exactly)
- When Distribution tab not active: render Effect size chart (current behavior)

#### 1.2 Move DistributionPane to center panel
- Current location: `FindingsContextPanel.tsx` pane 7 (CollapsiblePane)
- New location: `DoseResponseChartPanel.tsx` right sub-panel, Distribution tab content
- Remove DistributionPane from context panel pane list
- Adapt DistributionPane for wider container:
  - Current: 2 panels (F/M) side-by-side, each showing 4 dose group strips
  - New: Single unified plot with interleaved sex per dose group (8 strips total)
  - Sex-colored dots: cyan M (`#0891b2`) / pink F (`#ec4899`)
  - Shared Y-axis, dose group labels on X-axis with F|M sub-labels
  - Increase `PLOT_HEIGHT` from 165 to fill available vertical space (flex-1)

#### 1.3 Wire distribution to global day stepper
- Currently DistributionPane has its own mode system (Terminal/Peak/Recovery)
- Replace with: distribution always shows data at the global day stepper's selected day
- Peak is already the stepper's default selection — no special mode needed
- Recovery mode removed from DistributionPane (handled by Phase 3 checkbox instead)

#### 1.4 Add tab bar placeholder to left sub-panel
- Add tab bar: `D-R | Recovery`
- Recovery tab renders empty state: `"No recovery data"` or `"Recovery data loading..."`
- D-R tab renders current chart (no change)
- Tab bar hidden when endpoint has no recovery data (single tab = no bar needed)

#### 1.5 Update context panel pane ordering
- Remove DistributionPane from FindingsContextPanel
- Renumber remaining panes; verify scroll depth improvement

### Verification
- [ ] Default view (D-R + Effect) renders identically to current
- [ ] Distribution tab shows strip plots at global stepper day
- [ ] Changing day in stepper updates distribution
- [ ] 8-strip layout readable at typical center panel width (~500px)
- [ ] Context panel no longer shows DistributionPane
- [ ] Build passes, no TS errors

---

## Phase 2: Backend Multi-Day Recovery Statistics

**Goal:** Extend recovery-comparison endpoint to compute stats at every available recovery-period day, not just final sacrifice.

**Depends on:** Nothing (can develop in parallel with Phase 1)

### Current state
- `temporal.py:1180-1186`: `dose_day = dose_group[day_col].max()` — single timepoint
- Recovery controls: `rec_ctrl_day = rec_control[day_col].max()` — single timepoint
- Output: one row per endpoint/sex/dose

### Tasks

#### 2.1 Compute per-day recovery stats
- File: `backend/routers/temporal.py`, function `_compute_domain_recovery`
- Instead of `dose_day = dose_group[day_col].max()`, iterate over all unique days in `dose_group[day_col].unique()`
- For each day:
  - Recovery treated: filter to that day, compute mean/SD
  - Recovery control: filter to same day (controls measured at same timepoints)
  - Stats: Welch t-test, Hedges' g, 95% CI, % diff (same computations as current)
  - Terminal comparison: unchanged (always uses main-arm max day)
- Add `day` field to each output row
- Output: multiple rows per endpoint/sex/dose (one per day)

#### 2.2 Add available_days to response
- Add `recovery_days_available` to the API response: sorted list of unique study days with recovery data, per endpoint
- Structure: `{ [endpoint_label]: { [sex]: number[] } }`
- This populates the day stepper in recovery mode

#### 2.3 Add last_dosing_day to response
- Already computed internally (`compute_last_dosing_day`), just not returned
- Include in response for frontend display: "Recovery period: Day 30–57"

#### 2.4 Handle domain-specific day density
- BW/FW: weekly measurements → many days (4-8 typically)
- LB: 1-2 interim draws → sparse days
- OM/VS/EG: sacrifice day only → single day (current behavior preserved)
- MI/MA: not in this endpoint (histopath recovery uses separate system)

### Verification
- [ ] BW endpoint returns rows at multiple recovery days (not just max)
- [ ] LB endpoint returns rows at available blood draw days
- [ ] OM endpoint returns single-day rows (unchanged behavior)
- [ ] `recovery_days_available` correctly lists available days per endpoint/sex
- [ ] `last_dosing_day` included in response
- [ ] Existing dumbbell chart still works (uses max-day rows)
- [ ] API response size reasonable (typically 4 dose × 2 sex × 4-8 days = 32-64 rows per endpoint)

---

## Phase 3: Recovery Tab + Day Stepper Integration

**Goal:** Wire up the Recovery tab with live data, day stepper recovery mode, and distribution recovery checkbox.

**Depends on:** Phase 1 (tab infrastructure) + Phase 2 (multi-day data)

### Tasks

#### 3.1 Extract dumbbell chart to Recovery tab
- Move `RecoveryDumbbellChart` (continuous) and `IncidenceDumbbellChart` (histopath) rendering from `RecoveryPane` into center panel Recovery tab
- Recovery tab content is domain-aware:
  - Continuous endpoints → `RecoveryDumbbellChart`
  - Histopath endpoints → `IncidenceDumbbellChart`
  - CL (incidence) endpoints → Simple incidence comparison (or small table)
- Dumbbell charts show data at the stepper's selected recovery day
- These components already exist — just new render location

#### 3.2 Day stepper recovery mode
- File: `FindingsView.tsx` (stepper state), `DayStepper.tsx` (component)
- When left tab = Recovery:
  - Populate stepper with `recovery_days_available[endpoint][sex]` from Phase 2 API
  - Default to max recovery day (final sacrifice — matches current behavior)
  - Day labels: `"Day 50 (recovery)"`, final day gets `"Day 57 (terminal recovery)"`
  - Show recovery period context: small label `"Recovery period"` above stepper
- When left tab = D-R:
  - Stepper behavior unchanged (main study days)

#### 3.3 Effect size chart recovery mode
- When left tab = Recovery:
  - `buildEffectSizeBarOption()` receives recovery-arm effect sizes at selected recovery day
  - Filter Phase 2 rows to `day === selectedRecoveryDay`
  - Bar chart shows residual effect per dose group
  - Subtitle: `"Residual effect size (Hedges' g) at Day {day}"`
- When left tab = D-R:
  - Unchanged behavior

#### 3.4 Distribution recovery checkbox
- Add checkbox to Distribution tab header: `☐ Recovery`
- When checked:
  - Continuous domains: show recovery animal individual values at selected recovery day
  - Incidence domains: switch to recovery specimens
  - Data source: raw subject-level data filtered to `is_recovery=True`, at selected day
  - Uses existing subject data queries (filtered by recovery flag)
- When unchecked:
  - Show main study animals at global stepper day (default)
- Auto-check behavior: when user clicks Recovery tab on left, auto-check this box if Distribution tab is active

#### 3.5 Coupling logic
- Clicking Recovery tab on left:
  - Day stepper → switches to recovery days
  - Effect size chart → shows recovery data (if Effect tab active)
  - Distribution → auto-checks Recovery checkbox (if Distribution tab active)
- Clicking D-R tab on left:
  - Day stepper → switches back to main study days
  - Effect size chart → reverts to main study data
  - Distribution → unchecks Recovery checkbox
- The distribution Recovery checkbox can also be toggled independently (user may want recovery distribution while viewing D-R chart on left)

### Verification
- [ ] Recovery tab shows dumbbell chart for continuous endpoints
- [ ] Recovery tab shows incidence dumbbell for histopath endpoints
- [ ] Day stepper shows recovery-period days when Recovery tab active
- [ ] Stepping through recovery days updates dumbbell, effect size, distribution
- [ ] Effect size chart shows residual effects at selected recovery day
- [ ] Distribution recovery checkbox swaps population correctly
- [ ] Auto-check/uncheck coupling works when switching left tabs
- [ ] Manual checkbox toggle works independently of left tab
- [ ] Endpoints without recovery data: Recovery tab shows appropriate empty state
- [ ] Single-day recovery endpoints: stepper shows one option, not disabled

---

## Phase 4: Context Panel Recovery Evidence Pane

**Goal:** Restructure RecoveryPane as an evidence + override surface. Chart removed (now in center). Evidence retained and enhanced.

**Depends on:** Phase 3 (chart extraction)

### Current RecoveryPane content to redistribute

| Content | Destination |
|---------|-------------|
| `RecoveryDumbbellChart` | → Center panel Recovery tab (Phase 3) |
| `IncidenceDumbbellChart` | → Center panel Recovery tab (Phase 3) |
| Verdict badges per dose | **Keep** in context panel |
| Classification (7-tier, histopath) | **Keep** in context panel |
| Confidence badges | **Keep** in context panel |
| Finding nature + reversibility | **Keep** in context panel |
| Qualifiers + recommended actions | **Keep** in context panel |
| Recovery duration adequacy | **Keep** in context panel |
| CL incidence table | → Center panel Recovery tab (Phase 3) |

### Tasks

#### 4.1 Restructure RecoveryPane
- Remove chart rendering (moved to center panel Phase 3)
- Retain all interpretive content: verdicts, classification, confidence, qualifiers, actions
- New pane title: `"Recovery assessment"` (was implicitly "Recovery")

#### 4.2 Add terminal vs recovery comparison summary
- New section at top of pane (below verdict):
  ```
  Terminal (Day 29)    Recovery (Day 57)
  |g| vs ctrl: 1.25   |g| vs ctrl: 1.08
  p: 0.001             p: 0.003
  ```
- Data source: current recovery-comparison API rows (already loaded)
- Shows stats at the selected recovery day (linked to center panel stepper)

#### 4.3 Expose residual effect % and control drift
- **Residual %**: `classifyContinuousRecovery()` already computes `pct_recovered` internally. Modify to return it in the result object. Display: `"Residual effect: 86% of terminal"`
- **Control drift**: compute `|recovery_ctrl_mean - terminal_ctrl_mean| / terminal_ctrl_mean × 100`. Fields `control_mean` and `control_mean_terminal` already in API response. Display: `"Control drift: 3.2% (normal)"` or `"Control drift: 18% ⚠"` when >15%

#### 4.4 Add override dropdown
- Follow existing `ToxFindingForm` pattern for override UX
- Dropdown options: Reversed / Reversing / Partial / Persistent / Worsening / Not assessed
- When overridden: show both auto-verdict and user override
- Persist via annotations system (`pattern_overrides.json` or new `recovery_overrides.json`)
- Display: `"Auto: Persistent → Override: Partial"` with `bg-violet-50/40` tint

#### 4.5 Verdict transparency line
- Below the override, show why the auto-verdict was chosen:
  - Continuous: `"Residual effect 86% of terminal (threshold: ≥50% → Persistent)"`
  - Histopath: Classification rationale (already generated by `recovery-classification.ts`)
- Helps toxicologist evaluate whether override is warranted

#### 4.6 Update pane position in context panel ordering
- Place after VerdictPane/SexComparisonPane, before statistical evidence
- Reversibility is a key regulatory conclusion — belongs early in the panel
- Remove `RecoveryVerdictLine` one-liner from VerdictPane area (now redundant with full pane)

### Verification
- [ ] RecoveryPane renders without chart (chart is in center panel)
- [ ] Terminal vs recovery comparison shows correct stats at selected day
- [ ] Residual % displayed and updates when day changes
- [ ] Control drift computed and displayed with warning threshold
- [ ] Override dropdown saves/loads correctly
- [ ] Verdict transparency shows correct thresholds and logic
- [ ] Histopath 7-tier classification still renders correctly
- [ ] RecoveryVerdictLine removed from VerdictPane area
- [ ] Pane ordering correct in context panel

---

## Phase 5: Findings Table Recovery Column

**Goal:** Add static recovery verdict column with override indicator to findings table.

**Depends on:** Phase 4 (override mechanism)

### Tasks

#### 5.1 Add Recovery column to FindingsTable
- New column after existing columns: `"Recovery"`
- Content: verdict badge from `RECOVERY_VERDICT_LABEL` mapping
- Badge styling: `bg-gray-100 text-gray-600 border-gray-200` (neutral categorical)
- When overridden: `bg-violet-50/40` tint to signal user override
- Endpoints without recovery data: em dash `"—"`
- Column width: ~90px (`width: 1px; white-space: nowrap` per table convention)

#### 5.2 Verdict data source
- For continuous endpoints: `classifyContinuousRecovery()` using terminal vs max-recovery-day effect sizes from `useRecoveryComparison` data
- For histopath endpoints: `useOrganRecovery` overall verdict
- For CL endpoints: incidence recovery verdict from API
- Compute once, memoize per endpoint

#### 5.3 Click interaction
- Clicking recovery badge → switches center panel left tab to Recovery
- This lets the user quickly investigate any endpoint's recovery data
- If Recovery tab not available (no recovery data), badge is not clickable

#### 5.4 Rail recovery indicator (optional)
- Small recovery status indicator in the rail endpoint rows
- Compact: single-character or small icon next to existing metrics
- Lower priority than table column — implement if space permits

### Verification
- [ ] Recovery column shows correct verdict for all endpoints with recovery data
- [ ] Em dash for endpoints without recovery data
- [ ] Override tint (`bg-violet-50/40`) appears when user has overridden
- [ ] Click → switches to Recovery tab in center panel
- [ ] Column doesn't break table layout (stays compact)
- [ ] Build passes

---

## Phase 6: Polish & Edge Cases

**Goal:** Handle edge cases, coupling refinements, and visual polish.

**Depends on:** Phases 1-5

### Tasks

#### 6.1 Empty states
- Recovery tab with no recovery data: `"No recovery arm in this study"`
- Recovery tab for endpoint without recovery measurements: `"No recovery data for {endpoint}"`
- Distribution with Recovery checked, no data: `"No recovery animals for this endpoint"`
- Day stepper with zero recovery days: don't render stepper, show fixed day label

#### 6.2 Incidence domain handling
- MI/MA: single recovery timepoint (sacrifice), stepper shows one day
- CL: may have multiple observation days during recovery — stepper shows available days
- Distribution for incidence: severity distribution view (not strip plots)

#### 6.3 Transition animations
- Tab switching: no animation (instant swap, matching existing tab bars)
- Day stepper change: charts update immediately (no transition)
- Recovery checkbox: immediate population swap

#### 6.4 Responsive behavior
- Below 1200px: consider stacking tabs vertically or hiding Distribution tab
- Narrow center panel: distribution falls back to separate F/M panels (current layout)
- Very few dose groups (1-2): distribution adjusts strip width

#### 6.5 Keyboard shortcuts
- Consider: `R` to toggle Recovery tab (matches existing keyboard patterns if any)
- Arrow keys in day stepper already work

#### 6.6 State persistence
- Remember which tabs were active per endpoint (React state, not persisted)
- Recovery checkbox state resets when endpoint changes (sensible default)
- Day stepper recovery day selection resets to max when endpoint changes

### Verification
- [ ] All empty states render with appropriate messages
- [ ] MI/MA endpoints work correctly in Recovery tab
- [ ] CL endpoints work correctly with multi-day stepper
- [ ] Layout doesn't break at narrow widths
- [ ] Tab state doesn't leak between endpoints

---

## File Impact Summary

### Backend
| File | Change |
|------|--------|
| `backend/routers/temporal.py` | Multi-day recovery stats, `recovery_days_available`, `last_dosing_day` in response |

### Frontend — Modified
| File | Change |
|------|--------|
| `DoseResponseChartPanel.tsx` | Dual-tab layout (left + right), Recovery tab content |
| `FindingsView.tsx` | Day stepper recovery mode, tab state management |
| `DayStepper.tsx` | Recovery day population, labels |
| `FindingsContextPanel.tsx` | Remove DistributionPane, reorder panes |
| `RecoveryPane.tsx` | Remove charts, add comparison summary, residual %, drift, override |
| `RecoveryVerdictLine.tsx` | Remove (replaced by full recovery pane) |
| `DistributionPane.tsx` | Interleaved sex layout, recovery checkbox, remove mode system |
| `FindingsTable.tsx` | Recovery verdict column |
| `recovery-verdict.ts` | Expose `pct_recovered` in return type |

### Frontend — New (if needed)
| File | Purpose |
|------|---------|
| `recovery-overrides.json` (annotations) | Persist recovery verdict overrides |

### Frontend — Types
| File | Change |
|------|--------|
| `temporal-api.ts` | Add `day` field, `recovery_days_available`, `last_dosing_day` to response types |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Backend multi-day computation too slow | BW has ~8 recovery days × 4 doses × 2 sexes = 64 stat computations per endpoint. Current single-day takes <50ms. Should be <400ms total. |
| Distribution strip plot unreadable at 8 strips | Center panel is ~500px, giving ~60px per strip. If tight, fall back to separate F/M panels. |
| Recovery checkbox coupling confuses users | Clear visual indicator: checkbox label changes to `"☑ Recovery animals"` when checked. Tab highlights coordinate. |
| Existing RecoveryPane consumers break | RecoveryPane is only used in FindingsContextPanel. Single consumer, safe to restructure. |
| Recovery override persistence | Follow exact ToxFindingForm pattern — proven system. |
