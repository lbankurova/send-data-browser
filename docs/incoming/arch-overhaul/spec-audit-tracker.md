# Arch-Overhaul Spec Audit Tracker

> **Living document** — updated on each audit pass. Last updated: 2026-02-15.

## Audit baseline

**Last audited commit:** `17bd9ca` — `fix: show all dose levels in recovery tooltip per spec §4.3`

Working tree was clean at audit time (no uncommitted changes to tracked files).

**To find what changed since this audit:**
```bash
git log --oneline 17bd9ca..HEAD
git diff 17bd9ca..HEAD --stat
```

### Uncommitted work at audit time

These files were modified or untracked but not yet committed. They reflect in-progress work that may affect audit accuracy:

| File | State | Notes |
|------|-------|-------|
| `CLAUDE.md` | Modified | Project instructions updates |
| `backend/routers/temporal.py` | Modified | Backend route changes |
| `frontend/src/components/analysis/HistopathologyView.tsx` | Modified | Histopath view changes |
| `frontend/src/components/analysis/NoaelDecisionView.tsx` | Modified | NOAEL view changes |
| `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx` | Modified | Context panel changes |
| `frontend/src/lib/recovery-assessment.ts` | Modified | Recovery logic changes |
| `frontend/src/types/timecourse.ts` | Modified | Type definitions |
| `frontend/src/hooks/useOrganRecovery.ts` | Untracked | New hook for NOAEL recovery |
| `docs/incoming/arch-overhaul/recovery-dose-charts-spec.md` | Untracked | Spec (not yet committed) |
| `docs/incoming/arch-overhaul/recovery-reversibility-spec.md` | Untracked | Spec (not yet committed) |
| `docs/incoming/arch-overhaul/subject-comparison-spec.md` | Untracked | Spec (not yet committed) |

### Key commits per feature

| Feature | Implementing commits | Files touched |
|---------|---------------------|---------------|
| Architecture redesign | Pre-`560eb88` (multiple earlier commits) | contexts/, shell/, Layout.tsx, all views |
| Subject comparison | `e799a65` | CompareTab.tsx, comparison-charts.ts, useSubjectComparison.ts, temporal.py |
| Recovery reversibility | `bcb3f32`, `489e611`, `0d1e411`, `17bd9ca` | recovery-assessment.ts, HistopathologyView.tsx, NoaelDecisionView.tsx, useOrganRecovery.ts |
| Subject matrix redesign | Pre-`560eb88` | HistopathologyView.tsx (matrix sections) |
| Adaptive sections | `842416f` | useSectionLayout.ts, SectionHeader.tsx, *SelectionZone.tsx |
| Recovery dose charts | — (not started) | — |

---

## Summary

| Spec | Completion | Open gaps | Status |
|------|-----------|-----------|--------|
| arch-redesign-final.md | 95% | 2 | NEAR-COMPLETE |
| subject-comparison-spec.md | 100% | 0 | DONE |
| recovery-reversibility-spec.md | 99.5% | 1 | NEAR-COMPLETE |
| subject-matrix-redesign-spec.md | 98% | 1 | NEAR-COMPLETE |
| adaptive-sections-spec.md | 96% | 1 | NEAR-COMPLETE |
| recovery-dose-charts-spec.md | 6% | ~94 | NOT STARTED |

**Reference-only documents (not audited as features):**
- `collapsible-sections-spec.md` — Superseded by adaptive-sections-spec.md
- `design-system-as-built.md` — Code-derived design system reference
- `design-system-redline.md` — Design system redline reference

---

## 1. Architecture Redesign (`arch-redesign-final.md`)

**Status: NEAR-COMPLETE — all 5 phases implemented, 2 gaps remaining.**

All phases verified:
- Phase 1: StudySelectionContext with cascading clears, navigateTo()
- Phase 2: GlobalFilterContext with bidirectional sex sync
- Phase 3: RailModeContext, PolymorphicRail at shell level
- Phase 4: View migration (all 5 analysis views)
- Phase 5: Cleanup — old contexts removed, no dead code

Known deviations D1–D4 from spec appendix are all accounted for in the implementation.

### Open gaps

| # | Spec ref | Gap | File | Priority |
|---|----------|-----|------|----------|
| AR-1 | §5.2 | HistopathologyView missing organ-level aggregation. When `organSystem` is selected but `specimen` is NOT set, the view should show an organ-level aggregate summary (findings, incidence, severity across all specimens). Currently shows "Select a specimen from the rail" placeholder. | `HistopathologyView.tsx:~2589` | Medium |
| AR-2 | §6.2 | Cross-view links use `navigate(route, { state: {...} })` instead of calling `navigateTo()` first to populate shared context atomically before routing. Functionally works via `location.state` consumption in target views, but doesn't match the spec pattern. | `StudySummaryContextPanel.tsx` and similar panes | Low |

---

## 2. Subject Comparison (`subject-comparison-spec.md`)

**Status: DONE — 92+ requirements fully implemented.**

All 4 comparison sections verified:
- Finding concordance table with severity heatmap
- Lab values sparkline charts (6 analytes)
- Body weight trajectory chart with control bands + terminal markers
- Clinical observations timeline

Backend endpoint `/api/study/{id}/histopath/subjects/compare` returns complete data. CompareTab.tsx (~707 lines) implements the full UI. No action items.

---

## 3. Recovery Reversibility (`recovery-reversibility-spec.md`)

**Status: NEAR-COMPLETE — 209/211 requirements implemented.**

### Open gaps

| # | Spec ref | Gap | File | Priority |
|---|----------|-----|------|----------|
| RR-1 | §4.1 | Recovery column is positioned BEFORE "Also in" column; spec says it should come AFTER "Also in" | `HistopathologyView.tsx:1003-1037` | Low |

### Verified complete

- `recovery-assessment.ts`: deriveRecoveryAssessments(), computeVerdict(), worstVerdict(), verdictArrow(), buildRecoveryTooltip(), specimenRecoveryLabel() — all thresholds correct (≥50% partial, 100% full, etc.)
- Recovery column in findings table with colored verdict arrows (green ↓, amber →, red ↑)
- Recovery tooltip with main-arm vs recovery-arm comparison, specimen-level verdicts
- Context panel Recovery pane between "Sex comparison" and "Correlating evidence" (correct per spec)
- NOAEL view Recovery column with organ-level worst-verdict rollup
- `useOrganRecovery.ts` hook for NOAEL view data
- Backend: MI+MA domain joining for recovery subjects, recovery group detection

---

## 4. Subject Matrix Redesign (`subject-matrix-redesign-spec.md`)

**Status: NEAR-COMPLETE — 48/49 requirements implemented.**

### Open gaps

| # | Spec ref | Gap | File | Priority |
|---|----------|-----|------|----------|
| SM-1 | §3.2 | Group mode missing FilterShowingLine summary strip when "Severity graded only" filter is active. The filter works but no visual indicator shows what's being filtered. | `HistopathologyView.tsx:~1427` | Low |

### Verified complete

- All-findings matrix (not just severity-graded) with incidence dots
- Subject mode: individual animal cells with severity color
- Group mode: incidence fraction cells with neutral heat coloring
- "Severity graded only" toggle filter (functional, just missing FilterShowingLine)
- Correct neutral gray heat ramp per design system
- Matrix legend below matrix

---

## 5. Adaptive Sections (`adaptive-sections-spec.md`)

**Status: NEAR-COMPLETE — 49/51 requirements implemented.**

### Open gaps

| # | Spec ref | Gap | File | Priority |
|---|----------|-----|------|----------|
| AS-1 | §6.2 | Finding names in FindingsSelectionZone and MatrixSelectionZone are not clickable for scroll-to-section behavior. The spec says clicking a finding name in a selection zone should scroll the parent section to that finding. | `FindingsSelectionZone.tsx:21`, `MatrixSelectionZone.tsx:24` | Medium |

### Verified complete

- `useSectionLayout.ts` (~291 lines): three-state model (Full/Compressed/Strip), height allocation, focus transitions
- `SectionHeader.tsx`: unified header with chrome zone (title + controls) and selection zone
- Selection zones: FindingsSelectionZone, DoseChartsSelectionZone, MatrixSelectionZone — all render correctly
- Collapsed strip states with content summary
- Focus on click: clicking a compressed/strip section expands it and compresses others
- Natural height computation and proportional allocation

### Dead code note

`CollapsedStrip.tsx` exists as dead code — artifact from the older collapsible-sections refactor that was superseded by adaptive-sections. Can be safely deleted.

---

## 6. Recovery Dose Charts (`recovery-dose-charts-spec.md`)

**Status: NOT STARTED — only ~6% implemented (existing main-arm chart infrastructure).**

This is the largest remaining feature. The spec defines how recovery-arm data should appear in the existing dose incidence and dose severity bar charts within the histopathology Evidence tab.

### What exists today

- `histopathology-charts.ts`: buildDoseIncidenceBarOption() and buildDoseSeverityBarOption() render main-arm-only charts using ECharts
- DoseChartsSelectionZone renders chart type selector and finding navigator
- Charts display correctly for main-arm findings

### What's missing (grouped by spec section)

#### §2 Data layer
| # | Gap | Details |
|---|-----|---------|
| DC-1 | `isRecovery` field missing from chart data interfaces | `timecourse.ts` types need `isRecovery: boolean` on chart data rows |
| DC-2 | No recovery data flow from backend to charts | Backend `/histopath/subjects` returns recovery data but chart builders don't consume it |
| DC-3 | Recovery category generation missing | No logic to create recovery-arm Y-axis categories from recovery group data |

#### §3 Y-axis layout
| # | Gap | Details |
|---|-----|---------|
| DC-4 | No visual separator between main and recovery groups | Spec requires a gray dashed line or gap between main-arm and recovery-arm categories |
| DC-5 | No recovery category labels | Recovery categories should show "(R)" suffix or distinct labeling |
| DC-6 | No stable Y-axis frame extension | Spec requires Y-axis to always reserve space for recovery categories even when no recovery data, to prevent layout jumps |

#### §4 Bar styling
| # | Gap | Details |
|---|-----|---------|
| DC-7 | No recovery bar opacity treatment | Recovery bars should render at 60% opacity to visually distinguish from main-arm bars |
| DC-8 | No recovery bar color matching | Recovery bars should use same dose-group colors as main arm but with opacity applied |
| DC-9 | No recovery-specific border/outline | Spec may require dashed borders on recovery bars (verify against spec) |

#### §5 Tooltips
| # | Gap | Details |
|---|-----|---------|
| DC-10 | No recovery tooltip content | Recovery bar tooltips should show main-arm vs recovery-arm comparison |
| DC-11 | No delta/change indicators in tooltips | Tooltips should indicate direction of change (improved/worsened/unchanged) |

#### §6 Chart height
| # | Gap | Details |
|---|-----|---------|
| DC-12 | No dynamic chart height for recovery | Chart height should grow to accommodate recovery categories without compressing main-arm bars |
| DC-13 | No minimum bar height guarantee | Spec requires minimum bar height even when many categories present |

#### §7 Selection zone integration
| # | Gap | Details |
|---|-----|---------|
| DC-14 | No recovery sequence in DoseChartsSelectionZone | Finding navigator should indicate which findings have recovery data |
| DC-15 | No recovery toggle/filter in chart controls | May need a toggle to show/hide recovery bars |

#### §8 Edge cases
| # | Gap | Details |
|---|-----|---------|
| DC-16 | No handling for findings with recovery data but no main-arm data | Edge case where only recovery subjects have a finding |
| DC-17 | No handling for partial recovery groups | Some dose groups may lack recovery animals |

**Implementation approach:** The recovery dose charts feature requires changes to:
1. `frontend/src/types/timecourse.ts` — Add isRecovery to chart data types
2. `frontend/src/components/analysis/charts/histopathology-charts.ts` — Major changes to both chart builders
3. `frontend/src/components/analysis/DoseChartsSelectionZone.tsx` — Recovery indicators
4. `frontend/src/components/analysis/HistopathologyView.tsx` — Pass recovery data to chart builders
5. Possibly `backend/routers/temporal.py` — Ensure recovery chart data is served

---

## Task overview

### Ready to implement (no blockers)

| Task ID | From | Description | Effort |
|---------|------|-------------|--------|
| RR-1 | Recovery reversibility | Move Recovery column after "Also in" column | Trivial |
| SM-1 | Subject matrix | Add FilterShowingLine to group mode | Small |
| AS-1 | Adaptive sections | Add click-to-scroll on finding names in selection zones | Small |
| AR-2 | Architecture redesign | Refactor cross-view links to call `navigateTo()` before `navigate()` | Small |
| — | Cleanup | Delete dead `CollapsedStrip.tsx` | Trivial |

### Requires design/scope decision

| Task ID | From | Description | Effort |
|---------|------|-------------|--------|
| AR-1 | Architecture redesign | Build organ-level aggregation view for histopathology (when organ selected but no specimen) | Medium |

### Requires full feature build

| Task ID | From | Description | Effort |
|---------|------|-------------|--------|
| DC-1 to DC-17 | Recovery dose charts | Implement entire recovery dose charts feature | Large |

---

## Audit log

| Date | Auditor | Notes |
|------|---------|-------|
| 2026-02-15 | Claude | Initial comprehensive audit of all 9 spec files. 6 feature specs audited against codebase with file:line references. |
| 2026-02-15 | Claude | Updated arch-redesign from DONE → NEAR-COMPLETE after deeper agent audit found 2 gaps (AR-1: organ-level aggregation, AR-2: cross-view link pattern). |
