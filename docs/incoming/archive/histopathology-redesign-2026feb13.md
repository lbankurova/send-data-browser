# Histopathology View Redesign — UX Evaluation & Implementation Plan

**Date:** 2026-02-13
**Author:** UX Designer agent (session 8)
**Status:** Approved for implementation

## What this does

Eliminates redundancy, adds missing dose-response visualization, and consolidates the three-tab Evidence layout into a leaner single-Evidence-tab design (keeping Hypotheses). The pathologist's central question — "Is this treatment-related and dose-driven?" — becomes visually answerable in <3 seconds without tab-switching or center↔right eye ping-pong.

---

## Evaluation Findings

### Redundancies Identified

| ID | What | Where (×N) | Impact |
|----|------|-----------|--------|
| R1 | Findings list | Evidence tab findings table, Context panel SpecimenOverviewPane "Findings" pane, Context panel FindingDetailPane "Correlating evidence" | CP findings list adds zero information over the table visible 400px to the left |
| R2 | Dose-response data | Rail ▲ glyphs, Evidence tab "Dose-dep." column, CP SpecimenOverview "Dose-response" section, CP FindingDetail "Dose detail" table | CP specimen-level dose table is redundant with the group heatmap |
| R3 | Severity value | Rail heat chip, Evidence findings table "Sev" column, Severity matrix cells, CP overview chips | 4 repetitions at same detail level |
| R4 | `getNeutralHeatColor()` | HistopathologyView.tsx:34 (`getNeutralHeatColor`), HistopathologyContextPanel.tsx:23 (`sevHeatColor`) | Same logic, different names, different grade-1 value (transparent vs #E5E7EB) |

### Missing Elements

| ID | What | Why it matters | Persona |
|----|------|---------------|---------|
| M1 | Dose-response chart | THE central question ("dose-related?") requires mentally scanning heatmap columns. A bar chart makes the trend visible in <3s | P2, P1, P7 |
| M2 | Recovery arm narrative | "Reversible?" is a critical regulatory question (ICH S3A). Recovery subjects exist in data but lack narrative interpretation | P2, P3 |
| M3 | Treatment-related field | Central question P2 must answer; no place to record or compute this | P2 |
| M4 | Specimen summary on Evidence panel | Key metrics (incidence, severity, dose trend) appear ONLY in context panel. Forces eye ping-pong | P2 |
| M5 | Cross-domain correlates (D-2) | ALT + liver histopath convergence. Backlog item, acknowledged | P1, P2 |
| M6 | Keyboard navigation | 40+ specimens/study, mouse-only is slow | P2 |

### Metrics Tab Assessment

The Metrics tab (220 lines) is a flat data grid showing every dose × sex × finding row. It duplicates:
- The Evidence tab findings table (aggregate level)
- The context panel FindingDetailPane "Dose detail" table (finding level)
- The subject matrix (individual level)

No persona has a primary use case for this tab that isn't already covered elsewhere. **Verdict: Remove.**

### Context Panel Redundancies

**SpecimenOverviewPane** (rendered when no finding selected):
- "Dose-response" section: aggregated incidence-per-dose table with bar fills. Redundant with the group heatmap on the Evidence tab.
- "Findings" list: clickable finding names with severity badges. Strictly less informative than the Evidence tab findings table.
- Together these consume ~200px of context panel height that should be used for annotation forms.

### Bug Found

Context panel `SpecimenOverviewPane` line 210: `deriveSpecimenReviewStatus(findingNames, undefined)` — always passes `undefined` for reviews, so review status is always "Preliminary" regardless of actual annotations. The rail correctly passes `pathReviews`.

---

## Approved Changes

### REMOVE: Metrics tab
- Delete `MetricsTab` component (~220 lines) from HistopathologyView.tsx
- Remove "metrics" from tab bar
- Tab bar becomes: Evidence, Hypotheses (2 tabs)

### REMOVE: Context panel redundant panes
- Delete "Dose-response" collapsible pane from `SpecimenOverviewPane`
- Delete "Findings" list from `SpecimenOverviewPane`
- Keep: Overview chips, Pathology Review form, Related views

### ADD: Specimen summary strip on Evidence panel
- Persistent strip below tab bar / above findings table
- Content: specimen name, findings count, adverse count, max severity, overall incidence, dose trend (with ▲ glyphs), sex scope
- Compact single-line or wrapped chips layout
- This replaces the need to look at context panel for basic specimen metrics

### ADD: Dose-incidence chart on Evidence tab
- Position: between findings table and severity matrix (third section in the resizable layout)
- Implementation: Recharts BarChart (already in project dependencies)
- X-axis: dose group labels
- Y-axis: incidence % (0–100)
- When no finding selected: specimen-level aggregate incidence per dose group
- When finding selected: that finding's incidence per dose group
- Sex faceting: if both sexes present, show side-by-side or grouped bars
- Height: ~120px, compact
- Color: neutral gray bars (following design system — evidence whispers), dose-group-colored on hover

### FIX: Review status bug
- CP SpecimenOverviewPane: pass actual `pathReviews` data instead of `undefined`

### FIX: Deduplicate `getNeutralHeatColor`
- Remove local `sevHeatColor` from ContextPanel
- Import the canonical function from `severity-colors.ts` (or from HistopathologyView if not yet in severity-colors)

### KEEP: Hypotheses tab
- Retained per user decision
- No changes in this iteration

---

## Acceptance Criteria

- [ ] Metrics tab fully removed; tab bar shows Evidence + Hypotheses only
- [ ] Context panel SpecimenOverviewPane has no "Dose-response" or "Findings" panes
- [ ] Specimen summary strip visible above findings table when specimen is selected
- [ ] Dose-incidence bar chart renders between findings table and severity matrix
- [ ] Chart updates when finding selection changes (specimen aggregate → finding-specific)
- [ ] Chart shows sex-faceted bars when both sexes present in data
- [ ] Review status in context panel reflects actual PathologyReview annotations
- [ ] `sevHeatColor` duplication eliminated
- [ ] Build passes with zero TS errors
- [ ] All empty states still present and correct
- [ ] No design system violations introduced

---

## Files Affected

| File | Changes |
|------|---------|
| `HistopathologyView.tsx` | Remove MetricsTab (~220 lines), remove "metrics" tab, add specimen summary strip, add dose-incidence chart section |
| `HistopathologyContextPanel.tsx` | Remove "Dose-response" pane, remove "Findings" pane from SpecimenOverviewPane, fix review status bug, deduplicate sevHeatColor |
| `docs/views/histopathology.md` | Update to reflect new layout (remove Metrics tab section, update Evidence tab section, add chart section, update CP section) |
| `docs/MANIFEST.md` | Update validation date |

## Open Questions

None — all decisions approved.
