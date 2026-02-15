# Arch-Overhaul Spec Audit Tracker

> **Living document** — updated on each audit pass. Last updated: 2026-02-15.

## Audit baseline

**Last audited commit:** `4ebfbb9` — `fix: move Recovery column before Also in (correct placement)`

Working tree has uncommitted changes (see git status). All fix workstreams (A–E) and recovery dose charts feature are committed and pushed.

**To find what changed since this audit:**
```bash
git log --oneline 4ebfbb9..HEAD
git diff 4ebfbb9..HEAD --stat
```

### Key commits per feature

| Feature | Fix commits | Files touched |
|---------|------------|---------------|
| Architecture redesign | `512638d`, `aa58b05` | contexts/, shell/, Layout.tsx, PolymorphicRail, OrganRailMode, SpecimenRailMode, StudySummaryView |
| Subject comparison | `6df6f52` | CompareTab.tsx, comparison-charts.ts, temporal.py, timecourse.ts |
| Recovery reversibility | `deb44c3`, `9ff8a18`, `4ebfbb9`, `9e8d6ae` | recovery-assessment.ts, HistopathologyView.tsx, HistopathologyContextPanel.tsx |
| Subject matrix redesign | `9ff8a18` | HistopathologyView.tsx (matrix sections) |
| Adaptive sections | `b230d41`, `9ff8a18` | SectionHeader.tsx, *SelectionZone.tsx, useSectionLayout.ts, HistopathologyView.tsx |
| Recovery dose charts | `b2df8b4` | histopathology-charts.ts, HistopathologyView.tsx, DoseChartsSelectionZone.tsx, useSectionLayout.ts |
| View spec sync | `ac8dfd5` | docs/views/*.md (all 8 specs) |

---

## Summary

| Spec | Total gaps | Fixed | Open | Deferred | Resolved/Moot/N/A |
|------|-----------|-------|------|----------|-------------------|
| arch-redesign-final.md | 18 | 16 | 0 | 2 | — |
| subject-comparison-spec.md | 11 | 11 | 0 | 0 | — |
| recovery-reversibility-spec.md | 5 | 4 | 0 | 0 | 1 resolved |
| subject-matrix-redesign-spec.md | 7 | 7 | 0 | 0 | — |
| adaptive-sections-spec.md | 15 | 14 | 0 | 0 | 1 moot |
| recovery-dose-charts-spec.md | 17 | 15 | 0 | 1 | 1 N/A |
| **Totals** | **73** | **67** | **0** | **3** | **3** |

**0 open gaps remaining.** 3 deferred (require architectural changes or are speculative requirements).

**Reference-only documents (not audited as features):**
- `collapsible-sections-spec.md` — Superseded by adaptive-sections-spec.md
- `design-system-as-built.md` — Code-derived design system reference
- `design-system-redline.md` — Design system redline reference

---

## 1. Architecture Redesign (`arch-redesign-final.md`)

**Status: 16 fixed, 0 open, 2 deferred**

All 5 phases structurally implemented. Critical bugs (navigateTo no-op, significantOnly checking adversity, resetFilters desync) all fixed. Organ-level aggregation and cross-view navigateTo wiring complete.

### Gaps

| # | Spec ref | Gap | File | Severity | Status |
|---|----------|-----|------|----------|--------|
| AR-1 | §5.2 | ~~HistopathologyView missing organ-level aggregation.~~ Shows organ header, aggregate stats (specimens, findings, subjects), clickable specimen list when `organSystem` set but no `specimen`. | `HistopathologyView.tsx:~3007` | Medium | **Fixed** |
| AR-2 | §6.2 | ~~Cross-view links use `navigate()` without `navigateTo()`.~~ All cross-view links now call `navigateTo()` before `navigate()` to set selection context. | 7 files (context panels, SignalsPanel, views) | Low | **Fixed** |
| AR-3 | §3.2 | ~~`minSeverity` filter not applied in organ mode.~~ Added `max_severity` to generator → JSON → type → OrganRailMode filter. | `view_dataframes.py`, `analysis-views.ts`, `OrganRailMode.tsx` | Medium | **Fixed** `aa58b05` |
| AR-4 | §3.2 | ~~Sex filter declared "universal" but only consumed by HistopathologyView.~~ NoaelDecisionView wired to global filters. Others blocked on backend sex-stratified data. | `NoaelDecisionView.tsx` | High | **Fixed** `512638d` |
| AR-5 | §3.3 | ~~`userHasToggled` never cleared on browsing tree navigation.~~ Added `clearToggle()` to RailModeContext. | `RailModeContext.tsx`, `BrowsingTree.tsx` | Medium | **Fixed** `512638d` |
| AR-6 | §4.1 | Filtered count missing from mode toggle. Requires threading filtered counts from child components up to PolymorphicRail toggle. | `PolymorphicRail.tsx:24-41` | Low | **Deferred** |
| AR-7 | §4.1 | ~~FilterShowingLine missing from OrganRailMode; SpecimenRailMode parts omit sex and significantOnly.~~ Added both. | `OrganRailMode.tsx`, `SpecimenRailMode.tsx` | Medium | **Fixed** `512638d` |
| AR-8 | §4.5 | ~~Breadcrumb dismiss calls `navigateTo({})` — no-op.~~ Replaced with `clearSelection()`. | `SpecimenRailMode.tsx`, `StudySelectionContext.tsx` | **Critical** | **Fixed** `512638d` |
| AR-9 | §4.6 | ~~Escape key calls `navigateTo({})` — same no-op.~~ Replaced with `clearSelection()` in both rail modes. | `OrganRailMode.tsx`, `SpecimenRailMode.tsx` | **Critical** | **Fixed** `512638d` |
| AR-10 | §5.1 | ~~StudySummaryView does not auto-select top organ on load.~~ Added useEffect. | `StudySummaryView.tsx` | Medium | **Fixed** `512638d` |
| AR-11 | §3.2 | ~~`significantOnly` checks adversity instead of significance.~~ Now checks `signalScore > 0`. | `SpecimenRailMode.tsx` | High | **Fixed** `512638d` |
| AR-12 | §3.2 | ~~`resetFilters()` desync — doesn't clear sex from selection.~~ Now calls `navigateTo({ sex: undefined })`. | `GlobalFilterContext.tsx` | High | **Fixed** `512638d` |
| AR-13 | §3.1 | ~~`canGoBack` derived from ref, not reactive.~~ Now tracked via `historyLength` state. | `StudySelectionContext.tsx` | Low | **Fixed** `512638d` |
| AR-14 | §4.1 | ~~Organ header shows only filtered count.~~ Now shows `filtered/total` when filters active. | `OrganRailMode.tsx` | Low | **Fixed** `512638d` |
| AR-15 | §4.1 | ~~Checkbox labels use full words.~~ Abbreviated to "Adv", "Sig". | `PolymorphicRail.tsx` | Low | **Fixed** `512638d` |
| AR-16 | §4.1 | ~~Sex filter missing "Sex:" label prefix.~~ Added. | `PolymorphicRail.tsx` | Low | **Fixed** `512638d` |
| AR-17 | §4.1 | ~~Search field inside each mode component.~~ Moved to shared PolymorphicRail header. | `PolymorphicRail.tsx`, `OrganRailMode.tsx`, `SpecimenRailMode.tsx` | Low | **Fixed** `512638d` |
| AR-18 | §4.1 | Sort control inside mode components instead of fixed position in shared rail header. Sort options differ substantially between modes. | `OrganRailMode.tsx`, `SpecimenRailMode.tsx` | Low | **Deferred** |

---

## 2. Subject Comparison (`subject-comparison-spec.md`)

**Status: 11 fixed, 0 open**

All gaps fixed in workstream B. Marker symbols swapped, sex-specific control stats added, scroll behavior wired, chart dimensions corrected, column subtitles added, colored headers removed.

### Gaps

| # | Spec ref | Gap | File | Severity | Status |
|---|----------|-----|------|----------|--------|
| SC-1 | §7.5 | ~~Terminal event markers swapped.~~ Found dead=✕, moribund=▼. SVG paths corrected. | `comparison-charts.ts` | Minor | **Fixed** `6df6f52` |
| SC-2 | §6.3 | ~~Mixed-sex comparisons pool control stats.~~ Backend now returns sex-specific `M: mean±SD / F: mean±SD`. | `temporal.py`, `CompareTab.tsx` | Medium | **Fixed** `6df6f52` |
| SC-3 | §4.2 | ~~Edit button doesn't scroll to severity matrix.~~ Double-rAF scroll wired after tab switch. | `HistopathologyView.tsx` | Minor | **Fixed** `6df6f52` |
| SC-4 | §7.3 | ~~Control band missing dashed stroke line on mean.~~ Line opacity restored. | `comparison-charts.ts` | Minor | **Fixed** `6df6f52` |
| SC-5 | §5.5 | ~~"Not examined" cells render dash instead of empty.~~ Now renders empty. | `CompareTab.tsx` | Low | **Fixed** `6df6f52` |
| SC-6 | §7.4 | ~~BW chart mode doesn't re-initialize on sex composition change.~~ useEffect resets mode. | `CompareTab.tsx` | Low | **Fixed** `6df6f52` |
| SC-7 | §6.2 | ~~Control column header missing `(mean±SD)` subtitle.~~ Added. | `CompareTab.tsx` | Low | **Fixed** `6df6f52` |
| SC-8 | §7.3 | ~~Body weight chart height 200px.~~ Changed to 180px. | `CompareTab.tsx` | Low | **Fixed** `6df6f52` |
| SC-9 | §7.3 | ~~Control band fill opacity 0.4.~~ Changed to 0.3. | `comparison-charts.ts` | Low | **Fixed** `6df6f52` |
| SC-10 | §7.3 | ~~Data points hidden at rest.~~ symbolSize 6, visible at all points. | `comparison-charts.ts` | Medium | **Fixed** `6df6f52` |
| SC-11 | §5.3 | ~~Subject ID headers colored with comparison palette.~~ Removed colored styling. | `CompareTab.tsx` | Low | **Fixed** `6df6f52` |

---

## 3. Recovery Reversibility (`recovery-reversibility-spec.md`)

**Status: 4 fixed, 1 resolved (spec corrected), 0 open**

Core logic correct. Tooltip formatting fixed. Recovery column placement confirmed correct (spec was wrong, corrected in commit `4ebfbb9`). Sort direction semantics corrected.

### Gaps

| # | Spec ref | Gap | File | Severity | Status |
|---|----------|-----|------|----------|--------|
| RR-1 | §4.1 | ~~Recovery column positioned BEFORE "Also in" — spec said AFTER.~~ Spec corrected: BEFORE is the intended placement. | — | — | **Resolved** `4ebfbb9` |
| RR-2 | §7.2 | ~~Specimen strip shows "Recovery: reversed" when all findings reversed.~~ Now suppressed when `specimenRecoveryOverall === "reversed"`. | `HistopathologyView.tsx` | Low | **Fixed** `9ff8a18` |
| RR-3 | §4.3 | ~~Tooltip "Overall:" line missing "(worst case)" suffix and 2-space indent.~~ Added indent and suffix. | `recovery-assessment.ts` | Minor | **Fixed** `deb44c3` |
| RR-5 | §4.4 | ~~Sort direction semantics inverted.~~ Comparator flipped: ascending now shows reversed (benign) first, descending shows progressing (worst) first per spec. | `HistopathologyView.tsx:~1154` | Minor | **Fixed** |
| RR-6 | §4.3 | ~~Tooltip dose label uses bare `doseGroupLabel`.~~ New `formatDoseGroupLabel()` formats as "Group N (dose mg/kg)". | `recovery-assessment.ts` | Minor | **Fixed** `deb44c3` |

---

## 4. Subject Matrix Redesign (`subject-matrix-redesign-spec.md`)

**Status: 7 fixed, 0 open**

All gaps fixed in workstream C. Group mode cells show avg severity, FilterShowingLine added, legends corrected, header counts use mode-appropriate sources.

### Gaps

| # | Spec ref | Gap | File | Severity | Status |
|---|----------|-----|------|----------|--------|
| SM-1 | §3.2 | ~~Group mode missing FilterShowingLine for "Severity graded only" filter.~~ Added. | `HistopathologyView.tsx` | Low | **Fixed** `9ff8a18` |
| SM-2 | §4.2 | ~~Group mode severity cells show `affected/n` instead of severity number.~~ Now shows avg severity grade (e.g., "2.5"). | `HistopathologyView.tsx` | Medium | **Fixed** `9ff8a18` |
| SM-3 | §7.3 | ~~Group mode legend shows `●` marker that never appears in group mode.~~ Removed bullet from group mode legend. | `HistopathologyView.tsx` | Low | **Fixed** `9ff8a18` |
| SM-4 | §8.2 | ~~Section header finding count always uses group-mode `heatmapData`.~~ Now uses `subjectModeFindingCounts` memo in subject mode. | `HistopathologyView.tsx` | Low | **Fixed** `9ff8a18` |
| SM-5 | §4.2 | ~~Group mode non-graded cell block width `w-16` (64px).~~ Changed to `w-12` (48px). | `HistopathologyView.tsx` | Low | **Fixed** `9ff8a18` |
| SM-6 | §8.2 | ~~Section header count renders `(11)` instead of `(11 findings)`.~~ Appended "findings" label. | `HistopathologyView.tsx` | Low | **Fixed** `9ff8a18` |
| SM-7 | §7.2 | ~~Group mode severity legend missing severity numbers.~~ Now shows "1 Minimal", "2 Mild", etc. | `HistopathologyView.tsx` | Low | **Fixed** `9ff8a18` |

---

## 5. Adaptive Sections (`adaptive-sections-spec.md`)

**Status: 14 fixed, 1 moot (dead code deleted), 0 open**

All gaps fixed across workstreams C and D. Selection zones have click-to-scroll, font-mono corrected, arrow formatting fixed, section headers comply with spec. `CollapsedStrip.tsx` deleted; `StripSep` moved to `SectionHeader.tsx`.

### Gaps

| # | Spec ref | Gap | File | Severity | Status |
|---|----------|-----|------|----------|--------|
| AS-1 | §6.2 | ~~Finding names not clickable for scroll-to-section.~~ Click-to-scroll with strip-restore-then-scroll pattern. | `FindingsSelectionZone.tsx`, `MatrixSelectionZone.tsx` | Medium | **Fixed** `b230d41` |
| AS-2 | §4.2 | ~~Separator spacing `mx-0.5`.~~ Changed to `mx-1.5`. | `SectionHeader.tsx` | Low | **Fixed** `b230d41` |
| AS-3 | §4.4 | ~~Zero severity shows "0".~~ Now shows em dash (`—`). | `DoseChartsSelectionZone.tsx` | Medium | **Fixed** `b230d41` |
| AS-4 | §4.4 | ~~Missing "(specimen aggregate)" subtitle.~~ Added to title when no finding selected. | `HistopathologyView.tsx` | Medium | **Fixed** `9ff8a18` |
| AS-5 | §4.5 | ~~Matrix selection zone uses flat list.~~ Primary/others split with `{F}F + {M}M` sex breakdown. | `MatrixSelectionZone.tsx` | High | **Fixed** `b230d41` |
| AS-6 | §4.5 | ~~Matrix no-selection digest missing sex breakdown.~~ Added sex counts. | `MatrixSelectionZone.tsx` | High | **Fixed** `b230d41` |
| AS-7 | §5 | ~~Chevron has no click handler in non-strip mode.~~ Added chevron click handler. | `SectionHeader.tsx` | Medium | **Fixed** `b230d41` |
| AS-8 | §11 | ~~StripSep uses `mx-1`.~~ `CollapsedStrip.tsx` deleted; `StripSep` moved to `SectionHeader.tsx` with correct `mx-1.5`. | — | Low | **Moot** `b230d41` |
| AS-9 | §4.2 | ~~Count text uses `text-muted-foreground/60`.~~ Removed `/60` opacity. | `SectionHeader.tsx` | Low | **Fixed** `b230d41` |
| AS-10 | §4.3 | ~~Signal classification word in `font-mono`.~~ Split span: numeric in `font-mono`, signal word in proportional. | `FindingsSelectionZone.tsx` | Low | **Fixed** `b230d41` |
| AS-11 | §4.3 | ~~Dose-dep indicator in `font-mono`.~~ Moved to proportional font. | `FindingsSelectionZone.tsx` | Low | **Fixed** `b230d41` |
| AS-12 | §4.4 | ~~"Incid:"/"Sev:" labels use `text-muted-foreground`.~~ Changed to `text-foreground/70`. | `DoseChartsSelectionZone.tsx` | Low | **Fixed** `b230d41` |
| AS-13 | §4.4 | ~~Arrow separator has `mx-1` spacing + faint color.~~ Tight join, `text-foreground/70` color. | `DoseChartsSelectionZone.tsx` | Medium | **Fixed** `b230d41` |
| AS-14 | §10 | ~~Toast hint disappears abruptly.~~ Added `hintFading` state with `transition-opacity duration-500`. | `useSectionLayout.ts`, `HistopathologyView.tsx` | Low | **Fixed** `9ff8a18` |
| AS-15 | §5 | ~~Normal header has `border-b`.~~ Moved `border-b` to strip-only conditional. | `SectionHeader.tsx` | Low | **Fixed** `b230d41` |

---

## 6. Recovery Dose Charts (`recovery-dose-charts-spec.md`)

**Status: 15 fixed, 0 open, 1 deferred, 1 N/A**

Recovery bars implemented in both incidence and severity charts. Spacer category separates main from recovery. 50% opacity fills, muted axis labels, comparison tooltips with directional arrows. Selection zone shows recovery sequences. Suppression markers (⚠ anomaly, † insufficient_n) now rendered via recovery verdict threading to chart builders.

### Gaps

| # | Spec ref | Gap | Severity | Status |
|---|----------|-----|----------|--------|
| DC-1 | §4.1 | ~~`isRecovery` field missing from chart data interfaces.~~ Chart builders accept separate `recoveryGroups` parameter (different approach, equivalent result). | Medium | **Fixed** `b2df8b4` |
| DC-2 | §4.2 | ~~No recovery data flow from backend to charts.~~ `recoveryIncidenceGroups` and `recoverySeverityGroups` memos compute from subject-level data. | Medium | **Fixed** `b2df8b4` |
| DC-3 | §5.1 | ~~Recovery category generation missing.~~ `buildDoseYAxis` accepts `recoveryOrdered`, generates (R) categories. | Medium | **Fixed** `b2df8b4` |
| DC-4 | §6 | ~~No visual separator between main and recovery groups.~~ Empty spacer category inserted (§6.2 fallback approach). | Medium | **Fixed** `b2df8b4` |
| DC-5 | §5.3 | ~~No recovery category labels.~~ Labels include `(R)` suffix, styled with `#9CA3AF` muted color. | Low | **Fixed** `b2df8b4` |
| DC-6 | §9 | ~~No stable Y-axis frame extension.~~ Recovery categories always present when `specimenHasRecovery`. | Medium | **Fixed** `b2df8b4` |
| DC-7 | §7.1 | ~~No recovery bar opacity treatment.~~ 50% opacity via `applyOpacity(fill, 0.5)`. | Low | **Fixed** `b2df8b4` |
| DC-8 | §7.1 | ~~No recovery bar color matching.~~ Same color via `getIncidenceBarColor()` + `applyOpacity()`. | Low | **Fixed** `b2df8b4` |
| DC-9 | §7 | ~~No recovery-specific border/outline.~~ Spec requires opacity only, not dashed borders. Border color uses rgba matching opacity. | Low | **N/A** |
| DC-10 | §10.2 | ~~No recovery tooltip content.~~ Recovery tooltips show recovery value + main-arm comparison + directional change. | Medium | **Fixed** `b2df8b4` |
| DC-11 | §10.2 | ~~No delta/change indicators in tooltips.~~ `formatChange()` shows arrows (↑↓→) with absolute + percentage change, color-coded (green=decrease, red=increase). | Medium | **Fixed** `b2df8b4` |
| DC-12 | §13.1 | ~~No dynamic chart height for recovery.~~ Natural height computation includes recovery categories + spacer. | Low | **Fixed** `b2df8b4` |
| DC-13 | §13.2 | ~~No minimum bar height guarantee.~~ Defaults increased to 220px default / 140px minUseful for recovery studies. | Low | **Fixed** `b2df8b4` |
| DC-14 | §14 | ~~No recovery sequence in DoseChartsSelectionZone.~~ Strip shows `| R:` separator + recovery sequence for both incidence and severity. No-selection shows `→ {value} (R)` recovery peaks. | Medium | **Fixed** `b2df8b4` |
| DC-15 | §7 | No recovery toggle/filter in chart controls. Spec says "May need" — speculative requirement. | Low | **Deferred** |
| DC-16 | §4.4 | ~~Recovery bar suppression markers not implemented.~~ Chart builders accept `recoveryVerdicts` map, suppress anomaly/insufficient_n bars (transparent + zero value), render ⚠/† markers via ECharts rich text labels, tooltips explain suppression reason. | Medium | **Fixed** |
| DC-17 | §8.3 | ~~No handling for partial recovery groups.~~ Chart uses `availableDoseGroups.recovery` which only contains existing recovery dose levels. | Low | **Fixed** `b2df8b4` |

---

## Open gaps remaining

**None.** All audited gaps have been fixed or resolved.

## Deferred gaps

| # | Spec | Description | Reason |
|---|------|-------------|--------|
| AR-6 | Architecture | Filtered count in mode toggle `[Organs] [Specimens] (40)` | Needs component boundary refactor |
| AR-18 | Architecture | Sort control position in shared rail header | Sort options differ substantially between modes |
| DC-15 | Dose charts | Recovery toggle/filter in chart controls | Spec says "May need" — speculative |

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

### Fix pass (done)

Five parallel workstreams:
- **A:** Architecture core (contexts + shell) — `512638d`, `aa58b05`
- **B:** Subject comparison (CompareTab, comparison-charts, temporal.py) — `6df6f52`
- **C:** HistopathologyView edits (14 gaps: SM-1–7, RR-2, AS-4, AS-14, SC-3) — `9ff8a18`
- **D:** Adaptive sections small files (SectionHeader, *SelectionZone, CollapsedStrip deletion) — `b230d41`
- **E:** Recovery formatting (recovery-assessment.ts: RR-3, RR-6) — `deb44c3`

Recovery dose charts feature implemented as separate commit: `b2df8b4`.

---

## Audit log

| Date | Auditor | Pass | Notes |
|------|---------|------|-------|
| 2026-02-15 | Claude | 1 | Initial structural audit of all 9 spec files. 6 feature specs audited. Found 5 gaps total. |
| 2026-02-15 | Claude | 1 | Updated arch-redesign: found 2 gaps (AR-1, AR-2). |
| 2026-02-15 | Claude | 1 | Added RR-2 after manual completeness check of §7.2. |
| 2026-02-15 | Claude | 2 | Behavioral audit of all 5 implemented specs. Found 31 new gaps: AR +11, SC +6, RR +3, SM +3, AS +8. Total gaps 37 (excl. dose charts). |
| 2026-02-15 | Claude | 2b | HOW-focused audit of all 5 implemented specs. Found 19 net new gaps: AR +5, SC +5, RR +0, SM +3, AS +6. AR-7 refined with line-level detail. Total gaps 56 (excl. dose charts). |
| 2026-02-15 | Claude | Fix | All 5 workstreams (A–E) executed. 63 of 73 gaps fixed. Recovery dose charts feature built (DC-1–DC-17). 4 gaps remain open, 3 deferred. View specs synced with codebase (`ac8dfd5`). RR-1 resolved by correcting spec (not code). |
| 2026-02-15 | Claude | Fix-2 | Final 4 open gaps fixed: RR-5 (sort direction), DC-16 (suppression markers), AR-2 (navigateTo wiring across 7 files), AR-1 (organ-level aggregate view). 0 open gaps remaining, 3 deferred. |
