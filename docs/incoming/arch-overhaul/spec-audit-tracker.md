# Arch-Overhaul Spec Audit Tracker

> **Living document** — updated on each audit pass. Last updated: 2026-02-15.

## Audit baseline

**Last audited commit:** `ba2eea1` — `docs: add Step 0 — run spec's own verification checklist first`

Working tree was clean at audit time (no uncommitted changes to tracked files).

**To find what changed since this audit:**
```bash
git log --oneline ba2eea1..HEAD
git diff ba2eea1..HEAD --stat
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

| Spec | Pass 1 | Pass 2 | Pass 2b | Total gaps | Status |
|------|--------|--------|---------|------------|--------|
| arch-redesign-final.md | 2 | 11 | 5 | 18 | GAPS IN CORE MECHANICS |
| subject-comparison-spec.md | 0 | 6 | 5 | 11 | BEHAVIORAL + FORMAT GAPS |
| recovery-reversibility-spec.md | 2 | 3 | 0 | 5 | NEAR-COMPLETE |
| subject-matrix-redesign-spec.md | 1 | 3 | 3 | 7 | FORMAT GAPS |
| adaptive-sections-spec.md | 1 | 8 | 6 | 15 | BEHAVIORAL + FORMAT GAPS |
| recovery-dose-charts-spec.md | ~94 | — | — | ~94 | NOT STARTED |

**Total tracked gaps:** 56 (excl. recovery dose charts)

**Reference-only documents (not audited as features):**
- `collapsible-sections-spec.md` — Superseded by adaptive-sections-spec.md
- `design-system-as-built.md` — Code-derived design system reference
- `design-system-redline.md` — Design system redline reference

---

## 1. Architecture Redesign (`arch-redesign-final.md`)

**Status: 18 gaps (2 critical, 3 high, 5 medium, 8 low)**

All 5 phases structurally implemented. Behavioral audit revealed core mechanics issues — `navigateTo({})` is a no-op (breaking Escape and breadcrumb dismiss), sex filter declared "universal" but only consumed by one view, and several filter/sync gaps. Pass 2b found additional rail header layout and labeling mismatches.

### Open gaps

| # | Spec ref | Gap | File | Severity |
|---|----------|-----|------|----------|
| AR-1 | §5.2 | HistopathologyView missing organ-level aggregation. When `organSystem` is selected but `specimen` is NOT set, should show organ-level aggregate summary. Currently shows placeholder. | `HistopathologyView.tsx:~2589` | Medium |
| AR-2 | §6.2 | Cross-view links use `navigate(route, { state })` instead of calling `navigateTo()` first. Functionally works via `location.state` but doesn't match spec pattern. | `StudySummaryContextPanel.tsx` and similar | Low |
| AR-3 | §3.2 | `minSeverity` filter not applied in organ mode. `OrganRailMode.tsx` never references `filters.minSeverity`. | `OrganRailMode.tsx:237-253` | Medium |
| AR-4 | §3.2 | Sex filter declared "universal" but only consumed by HistopathologyView. OrganRailMode, StudySummaryView, DoseResponseView, NoaelDecisionView all ignore it. NoaelDecisionView has its own local `sexFilter` state. | `OrganRailMode.tsx`, `NoaelDecisionView.tsx:857`, `DoseResponseView.tsx`, `StudySummaryView.tsx` | High |
| AR-5 | §3.3 | `userHasToggled` never cleared on browsing tree navigation. Once user manually toggles rail mode, view preferences stop working until study switch. Only cleared on study switch. | `BrowsingTree.tsx:133`, `RailModeContext.tsx:41-48` | Medium |
| AR-6 | §4.1 | Filtered count missing from mode toggle. Spec shows `[Organs] [Specimens] (40)` but no count rendered next to toggle. | `PolymorphicRail.tsx:24-41` | Low |
| AR-7 | §4.1 | FilterShowingLine missing from PolymorphicRail and OrganRailMode entirely. SpecimenRailMode has one (`SpecimenRailMode.tsx:291-309`) but its `parts` computation omits `filters.sex` and `filters.significantOnly` — those filters stay invisible. Visibility gate also omits them, so the line stays hidden when sex or significantOnly are the only active filters. | `PolymorphicRail.tsx:43-85`, `OrganRailMode.tsx` (absent), `SpecimenRailMode.tsx:293-309` | Medium |
| AR-8 | §4.5 | Breadcrumb dismiss button calls `navigateTo({})` which is a no-op — `applyCascade` with empty update preserves all fields. Organ filter is NOT cleared. | `SpecimenRailMode.tsx:348`, `StudySelectionContext.tsx:57-95` | **Critical** |
| AR-9 | §4.6 | Escape key calls `navigateTo({})` — same no-op bug as AR-8. Selection is not cleared. | `OrganRailMode.tsx:234`, `SpecimenRailMode.tsx:157` | **Critical** |
| AR-10 | §5.1 | StudySummaryView does not auto-select top organ on load. | `StudySummaryView.tsx:28-67` | Medium |
| AR-11 | §3.2 | `significantOnly` in specimen rail checks adversity (`adverseCount > 0 \|\| warningCount > 0`) instead of statistical significance. OrganRailMode correctly uses `n_significant > 0`. | `SpecimenRailMode.tsx:210-211` | High |
| AR-12 | §3.2 | `resetFilters()` sets `DEFAULT_FILTERS` directly without calling `navigateTo({ sex: undefined })`. After reset, `StudySelection.sex` retains stale value — contexts desync. | `GlobalFilterContext.tsx:82-84` | High |
| AR-13 | §3.1 | `canGoBack` derived from `historyRef.current.length` (a ref, not state). Technically correct but fragile — future memoization of context value would break reactivity. | `StudySelectionContext.tsx:151` | Low |
| AR-14 | §4.1 | Organ header shows filtered count as if it were total. `sortedOrgans.length` already has filters applied, so `Organs (8)` gives no indication items are hidden. Should show `filtered/total`. | `OrganRailMode.tsx:344` | Low |
| AR-15 | §4.1 | Checkbox labels use full words ("Adverse", "Significant") instead of spec's abbreviated "Adv", "Sig". Longer labels consume more horizontal space in the narrow rail. | `PolymorphicRail.tsx:61,72` | Low |
| AR-16 | §4.1 | Sex filter missing "Sex:" label prefix before dropdown. Default text is "All sexes" instead of spec's "Combined". (Note: "Combined" vs "All sexes" is documented as known deviation D1 in spec appendix; the missing label prefix is not.) | `PolymorphicRail.tsx:46-53` | Low |
| AR-17 | §4.1 | Search field placed inside each mode component instead of as a shared full-width row in the PolymorphicRail header. Position shifts when switching modes. | `OrganRailMode.tsx:346-349`, `SpecimenRailMode.tsx:284-288` (absent from `PolymorphicRail.tsx`) | Low |
| AR-18 | §4.1 | Sort control inside mode components instead of fixed position in shared rail header. When switching modes, sort dropdown changes vertical position. | `OrganRailMode.tsx:352-361`, `SpecimenRailMode.tsx:313-324` | Low |

---

## 2. Subject Comparison (`subject-comparison-spec.md`)

**Status: 11 gaps (1 medium, 10 low/minor)**

All 4 sections structurally complete. Behavioral audit found marker symbols swapped, missing sex-specific controls, and missing scroll behavior. Pass 2b found chart dimension mismatches, missing column subtitles, and unspecified color additions.

### Open gaps

| # | Spec ref | Gap | File | Severity |
|---|----------|-----|------|----------|
| SC-1 | §7.5 | Terminal event markers swapped: found dead uses triangle (should be `✕`), moribund uses X (should be `▼`). SVG paths reversed. | `comparison-charts.ts:144` | Minor |
| SC-2 | §6.3 | Mixed-sex comparisons pool control stats into single mean±SD instead of showing sex-specific `M: mean±SD / F: mean±SD`. Backend combines both sexes when `len(selected_sexes) > 1`. | `temporal.py:770-775`, `CompareTab.tsx:455-458` | Medium |
| SC-3 | §4.2 | Edit button switches to Evidence tab but does not scroll to severity matrix. Spec says "switches back...and scrolls to the severity matrix." | `HistopathologyView.tsx:2802` | Minor |
| SC-4 | §7.3 | Control band missing dashed stroke line on mean. Both upper/lower line series have `lineStyle: { opacity: 0 }`. | `comparison-charts.ts:87-88, 103-104` | Minor |
| SC-5 | §5.5 | "Not examined" cells render dash (`—`) instead of empty. Code cannot distinguish not-examined from no-finding. | `CompareTab.tsx:317-318` | Low |
| SC-6 | §7.4 | Body weight chart mode doesn't re-initialize when subject sex composition changes. `useState` initial value set at mount — adding opposite-sex subject doesn't switch to baseline mode. | `CompareTab.tsx:534` | Low |
| SC-7 | §6.2 | Control column header missing `(mean±SD)` subtitle. Code renders only "Control" with no subtitle indicating the statistic type. | `CompareTab.tsx:455-457` | Low |
| SC-8 | §7.3 | Body weight chart height 200px vs spec's 180px. | `CompareTab.tsx:562` | Low |
| SC-9 | §7.3 | Control band fill opacity 0.4 vs spec's 0.3. Band is slightly more opaque than designed. | `comparison-charts.ts:108-109` | Low |
| SC-10 | §7.3 | Body weight chart data points hidden at rest (`showSymbol: false`). Spec requires `dot={{ r: 3 }}` — visible dots at every data point. Users can't see individual measurements without hovering. | `comparison-charts.ts:136-137` | Medium |
| SC-11 | §5.3 | Subject ID headers colored with comparison palette — not in spec. Spec shows plain `text-[10px] font-medium` with no color. Code applies `style={{ color: COMPARISON_COLORS[i] }}` across concordance matrix, lab values, and clinical observations. | `CompareTab.tsx:267,460,647` | Low |

---

## 3. Recovery Reversibility (`recovery-reversibility-spec.md`)

**Status: 5 gaps (all minor/low)**

Core logic (thresholds, verdicts, derivation) is behaviorally correct. Gaps are formatting and sort semantics. Pass 2b found no net new gaps (RR-7 was duplicate of RR-3).

### Open gaps

| # | Spec ref | Gap | File | Severity |
|---|----------|-----|------|----------|
| RR-1 | §4.1 | Recovery column positioned BEFORE "Also in" column; spec says AFTER. | `HistopathologyView.tsx:1003-1037` | Low |
| RR-2 | §7.2 | Specimen strip shows "Recovery: reversed" when all findings reversed. Spec says only show when at least one non-reversed. | `HistopathologyView.tsx:2751`, `recovery-assessment.ts:304` | Low |
| RR-3 | §4.3 | Tooltip "Overall:" line missing "(worst case)" suffix and 2-space indent. "Recovery period:" also missing indent. | `recovery-assessment.ts:167, 172` | Minor |
| RR-5 | §4.4 | Sort direction semantics: progressing is at top on ascending (first click) but spec says "at the top when sorted descending." | `HistopathologyView.tsx:1033-1035` | Minor |
| RR-6 | §4.3 | Tooltip dose label uses bare `doseGroupLabel` instead of spec format "Group N (dose mg/kg)". | `recovery-assessment.ts:163, 224` | Minor |

---

## 4. Subject Matrix Redesign (`subject-matrix-redesign-spec.md`)

**Status: 7 gaps (1 medium, 6 low)**

Core data pipeline and cell rendering correct. Behavioral audit found cell content mismatch in group mode. Pass 2b found width, text, and legend number gaps.

### Open gaps

| # | Spec ref | Gap | File | Severity |
|---|----------|-----|------|----------|
| SM-1 | §3.2 | Group mode missing FilterShowingLine for "Severity graded only" filter. | `HistopathologyView.tsx:~1427` | Low |
| SM-2 | §4.2 | Group mode severity cells show `affected/n` (e.g., "3/5") instead of severity number (e.g., "2.5"). Subtitle says "show average severity grade" but cells show counts. | `HistopathologyView.tsx:1569-1571` | Medium |
| SM-3 | §7.3 | Group mode legend shows `●` marker that never appears in group mode cells (only used in subject mode). Spec says "no additional legend item needed." | `HistopathologyView.tsx:1485-1490` | Low |
| SM-4 | §8.2 | Section header finding count always uses group-mode `heatmapData`, even in subject mode. Counts may diverge after filtering. | `HistopathologyView.tsx:1362-1366` | Low |
| SM-5 | §4.2 | Group mode non-graded cell block width `w-16` (64px) instead of spec's `w-12` (48px). Same issue in recovery heatmap. Non-graded blocks should be visually narrower than graded severity cells. | `HistopathologyView.tsx:1558, 1608` | Low |
| SM-6 | §8.2 | Section header count missing "findings" label. Renders `(11)` instead of spec's `(11 findings)`. When filtered: `(4 of 11)` instead of `(4 of 11 findings)`. | `HistopathologyView.tsx:1362-1365` | Low |
| SM-7 | §7.2 | Group mode severity legend missing severity numbers. Labels are "Minimal", "Mild", etc. instead of spec's "1 Minimal", "2 Mild", etc. Subject mode legend correctly includes numbers. | `HistopathologyView.tsx:1473-1478` | Low |

---

## 5. Adaptive Sections (`adaptive-sections-spec.md`)

**Status: 15 gaps (2 high, 4 medium, 9 low)**

Layout engine (useSectionLayout) is behaviorally correct. Gaps are in selection zone content format, header interaction, and typography. Pass 2b found font-mono misuse, arrow formatting, label color mismatches, and border issues.

### Open gaps

| # | Spec ref | Gap | File | Severity |
|---|----------|-----|------|----------|
| AS-1 | §6.2 | Finding names in selection zones not clickable for scroll-to-section behavior. | `FindingsSelectionZone.tsx:21`, `MatrixSelectionZone.tsx:24` | Medium |
| AS-2 | §4.2 | Separator spacing `mx-0.5` instead of spec's `mx-1.5` between chrome zone and selection zone. | `SectionHeader.tsx:56` | Low |
| AS-3 | §4.4 | Zero severity in dose charts header shows "0" instead of em dash (`—`). | `DoseChartsSelectionZone.tsx:53` | Medium |
| AS-4 | §4.4 | Missing "(specimen aggregate)" subtitle when no finding selected. Title is just "Dose charts". | `HistopathologyView.tsx:1296` | Medium |
| AS-5 | §4.5 | Matrix selection zone uses flat list instead of primary/others split with sex breakdown. Spec requires `{F}F + {M}M in {primary}` then `also {others}`. | `MatrixSelectionZone.tsx:17-35` | High |
| AS-6 | §4.5 | Matrix no-selection digest missing sex breakdown. Shows `"6 affected"` instead of `"6 affected (3M, 3F)"`. | `MatrixSelectionZone.tsx:49-58` | High |
| AS-7 | §5 | Chevron has no click handler in non-strip mode. Spec defines `onClick` on chevron for toggling. | `SectionHeader.tsx:43` | Medium |
| AS-8 | §11 | StripSep uses `mx-1` instead of spec's `mx-1.5`. | `CollapsedStrip.tsx:44` | Low |
| AS-9 | §4.2 | Count text uses `text-muted-foreground/60` instead of `text-muted-foreground`. | `SectionHeader.tsx:52` | Low |
| AS-10 | §4.3 | Signal classification word (e.g., "adverse") rendered in `font-mono`. Spec puts only the numeric incidence in `font-mono`; signal word should be proportional font. | `FindingsSelectionZone.tsx:22` | Low |
| AS-11 | §4.3 | Dose-dep indicator "✓dose-dep" rendered in `font-mono`. Spec uses proportional font for this text. | `FindingsSelectionZone.tsx:23` | Low |
| AS-12 | §4.4 | "Incid:" and "Sev:" labels use `text-muted-foreground` instead of spec's `text-foreground/70`. Creates unintended two-tone effect within what spec intended as uniform-contrast zone. | `DoseChartsSelectionZone.tsx:34,46` | Low |
| AS-13 | §4.4 | Arrow separator `→` has `mx-1` spacing + `text-muted-foreground/30` color. Spec uses tight `.join('→')` with no spacing and inherits `text-foreground/70`. Arrows are nearly invisible and spaced out instead of compact trend. | `DoseChartsSelectionZone.tsx:40,52` | Medium |
| AS-14 | §10 | Toast hint disappears abruptly after 3s. Spec says "fade out". Missing `transition-opacity` or animation. | `useSectionLayout.ts:217`, `HistopathologyView.tsx:1108` | Low |
| AS-15 | §5 | Normal (non-strip) header has `border-b border-border/50` not in spec. Spec reserves `border-b` for strip state only. | `SectionHeader.tsx:34` | Low |

### Dead code note

`CollapsedStrip.tsx` exists as dead code — artifact from the older collapsible-sections refactor. Can be safely deleted.

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

### Critical (broken functionality)

| Task ID | From | Description | Effort |
|---------|------|-------------|--------|
| AR-8 | Architecture | Fix `navigateTo({})` no-op — breadcrumb dismiss is broken | Trivial (change to `navigateTo({ organSystem: undefined })`) |
| AR-9 | Architecture | Fix Escape key — same `navigateTo({})` no-op bug | Trivial (explicit clear all hierarchy fields) |

### High priority

| Task ID | From | Description | Effort |
|---------|------|-------------|--------|
| AR-4 | Architecture | Make sex filter universal — consumed by all views and rail modes | Medium |
| AR-11 | Architecture | Fix `significantOnly` in specimen rail — check significance, not adversity | Small |
| AR-12 | Architecture | Fix `resetFilters()` sex desync — sync sex back to StudySelectionContext | Trivial |
| AS-5 | Adaptive sections | Matrix selection zone: primary/others split with sex breakdown | Small |
| AS-6 | Adaptive sections | Matrix no-selection: add sex breakdown to affected counts | Small |

### Medium priority

| Task ID | From | Description | Effort |
|---------|------|-------------|--------|
| AR-1 | Architecture | Build organ-level aggregation view for histopathology | Medium |
| AR-3 | Architecture | Apply `minSeverity` filter in organ rail mode | Small |
| AR-5 | Architecture | Clear `userHasToggled` on browsing tree navigation | Trivial |
| AR-7 | Architecture | FilterShowingLine: add to OrganRailMode, add sex/significantOnly to SpecimenRailMode parts | Small |
| AR-10 | Architecture | Auto-select top organ in StudySummaryView | Trivial |
| SC-2 | Subject comparison | Sex-specific control stats for mixed-sex comparisons | Medium |
| SC-10 | Subject comparison | Show data point dots on body weight chart at rest (`dot={{ r: 3 }}`) | Trivial |
| SM-2 | Subject matrix | Group mode severity cells: show severity number instead of affected/n | Small |
| AS-1 | Adaptive sections | Click-to-scroll on finding names in selection zones | Small |
| AS-3 | Adaptive sections | Zero severity in dose charts header: show `—` not "0" | Trivial |
| AS-4 | Adaptive sections | Add "(specimen aggregate)" subtitle to dose charts header | Trivial |
| AS-7 | Adaptive sections | Add click handler to chevron in non-strip mode | Small |
| AS-13 | Adaptive sections | Arrow separator: remove spacing, change color to `text-foreground/70` | Trivial |

### Low priority (formatting/cosmetic)

| Task ID | From | Description | Effort |
|---------|------|-------------|--------|
| RR-1 | Recovery reversibility | Move Recovery column after "Also in" | Trivial |
| RR-2 | Recovery reversibility | Suppress "Recovery: reversed" from specimen strip | Trivial |
| RR-3 | Recovery reversibility | Tooltip indent and "(worst case)" suffix | Trivial |
| RR-5 | Recovery reversibility | Sort direction semantics (ascending vs descending) | Trivial |
| RR-6 | Recovery reversibility | Tooltip dose label format | Trivial |
| SC-1 | Subject comparison | Swap terminal event marker symbols | Trivial |
| SC-3 | Subject comparison | Edit button scroll to severity matrix | Small |
| SC-4 | Subject comparison | Control band dashed stroke line | Small |
| SC-5 | Subject comparison | "Not examined" cell: empty instead of dash | Small |
| SC-6 | Subject comparison | BW chart mode re-init on sex composition change | Small |
| SC-7 | Subject comparison | Control column header: add `(mean±SD)` subtitle | Trivial |
| SC-8 | Subject comparison | Body weight chart height: 200px → 180px | Trivial |
| SC-9 | Subject comparison | Control band fill opacity: 0.4 → 0.3 | Trivial |
| SC-11 | Subject comparison | Subject ID colored headers — unspecified addition (review: keep or remove) | Trivial |
| SM-1 | Subject matrix | FilterShowingLine for "Severity graded only" | Small |
| SM-3 | Subject matrix | Remove `●` from group mode legend | Trivial |
| SM-4 | Subject matrix | Header count: use mode-appropriate data source | Small |
| SM-5 | Subject matrix | Non-graded cell block width: `w-16` → `w-12` | Trivial |
| SM-6 | Subject matrix | Section header count: append "findings" label | Trivial |
| SM-7 | Subject matrix | Group mode legend: add severity numbers ("1 Minimal", "2 Mild", etc.) | Trivial |
| AR-2 | Architecture | Cross-view links: navigateTo() before navigate() | Small |
| AR-6 | Architecture | Filtered count in mode toggle | Small |
| AR-13 | Architecture | `canGoBack` reactivity (ref vs state) | Trivial |
| AR-14 | Architecture | Organ header: show `filtered/total` count, not just filtered | Small |
| AR-15 | Architecture | Checkbox labels: "Adverse" → "Adv", "Significant" → "Sig" | Trivial |
| AR-16 | Architecture | Sex filter: add "Sex:" label prefix | Trivial |
| AR-17 | Architecture | Search field: move to shared PolymorphicRail header row | Small |
| AR-18 | Architecture | Sort control: move to shared PolymorphicRail header row | Small |
| AS-2 | Adaptive sections | Separator spacing `mx-0.5` → `mx-1.5` | Trivial |
| AS-8 | Adaptive sections | StripSep spacing `mx-1` → `mx-1.5` | Trivial |
| AS-9 | Adaptive sections | Count text opacity: remove `/60` | Trivial |
| AS-10 | Adaptive sections | Signal word: remove `font-mono`, keep only on numeric incidence | Trivial |
| AS-11 | Adaptive sections | Dose-dep indicator: remove `font-mono` | Trivial |
| AS-12 | Adaptive sections | "Incid:"/"Sev:" labels: `text-muted-foreground` → `text-foreground/70` | Trivial |
| AS-14 | Adaptive sections | Toast hint: add fade-out transition | Trivial |
| AS-15 | Adaptive sections | Normal header: remove `border-b` (only strip gets border) | Trivial |
| — | Cleanup | Delete dead `CollapsedStrip.tsx` | Trivial |

### Requires full feature build

| Task ID | From | Description | Effort |
|---------|------|-------------|--------|
| DC-1 to DC-17 | Recovery dose charts | Implement entire recovery dose charts feature | Large |

---

## Audit methodology

### Pass 1: Structural completeness (done)

Checks whether each spec requirement has a corresponding implementation: function exists, UI element renders, type is defined, endpoint returns data. This is a presence/absence check — "does feature X exist?"

**Limitation:** Pass 1 treats requirements as binary (implemented/not). It misses cases where a feature exists but activates under wrong conditions, uses wrong thresholds, or lacks suppression guards.

### Pass 2: Behavioral correctness (done)

Every spec requirement is decomposed into four dimensions:

| Dimension | Question | Example |
|-----------|----------|---------|
| **WHAT** | What should happen? | Show "Recovery: partial" in specimen strip |
| **WHEN** | Under which conditions? | When `studyHasRecovery` AND specimen has recovery data |
| **UNLESS** | When should it NOT appear? | Suppress when all findings are "reversed" |
| **HOW** | Exact format, text, styling? | `text-[10px] text-muted-foreground`, no special emphasis |

For each requirement the agent:
1. Extracts every conditional clause from the spec text ("when X", "if Y", "only when Z", "at least one", "with non-...")
2. Finds the corresponding code branch and verifies the condition expression matches
3. Flags mismatches: missing negation guards, unconditional code where spec is conditional, wrong thresholds, off-by-one errors

A feature that exists but activates under wrong conditions is a **behavioral gap**.

### Pass 2b: HOW sub-checks (done)

Targeted at formatting details that Pass 2's HOW dimension didn't catch exhaustively. Six sub-check categories:

| Category | What to compare | Example failure |
|----------|----------------|-----------------|
| **Text content** | Every literal string, label, suffix, subtitle | Missing `(mean±SD)` subtitle on column header |
| **Text layout** | Line breaks, indentation, grouping | Tooltip lines not indented 2 spaces |
| **Typography** | font-family, weight, size, case, mono vs proportional | Signal word in `font-mono` when spec says proportional |
| **Spacing** | margins, padding, gaps between elements | Arrow separator `mx-1` instead of tight join |
| **Visual elements** | colors, borders, opacity, icons, animations | `border-b` on non-strip headers; missing fade-out |
| **Sort/order** | column order, list ordering, default sort | Recovery column before "Also in" instead of after |

Also runs spec-provided verification checklists (Step 0) when available.

**Pass 2b deduplication:** 3 architecture items (AR-14/15/16 as originally numbered by agents) were duplicates of existing AR-6 and AR-7. AR-7 was updated with more specific file/line details from Pass 2b; AR-6 confirmed unchanged. Net new from Pass 2b: 19 gaps.

---

## Audit log

| Date | Auditor | Pass | Notes |
|------|---------|------|-------|
| 2026-02-15 | Claude | 1 | Initial structural audit of all 9 spec files. 6 feature specs audited. Found 5 gaps total. |
| 2026-02-15 | Claude | 1 | Updated arch-redesign: found 2 gaps (AR-1, AR-2). |
| 2026-02-15 | Claude | 1 | Added RR-2 after manual completeness check of §7.2. |
| 2026-02-15 | Claude | 2 | Behavioral audit of all 5 implemented specs. Found 31 new gaps: AR +11, SC +6, RR +3, SM +3, AS +8. Total gaps 37 (excl. dose charts). |
| 2026-02-15 | Claude | 2b | HOW-focused audit of all 5 implemented specs. Found 19 net new gaps: AR +5, SC +5, RR +0, SM +3, AS +6. AR-7 refined with line-level detail. Total gaps 56 (excl. dose charts). |
