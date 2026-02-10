# Design Audit: Study Summary

## What this does

Comprehensive design audit of the Study Summary view (both Details and Signals tabs) to bring it into full compliance with the design system and verify cross-view pattern consistency.

## Scope

- **View:** Study Summary (`/studies/:studyId`)
- **Components:** `StudySummaryView.tsx`, `SignalsPanel.tsx`, `StudySummaryFilters.tsx`, `OrganGroupedHeatmap.tsx`, `StudySummaryContextPanel.tsx`, `InsightsList.tsx`
- **View spec:** `docs/views/study-summary.md`
- **Primary personas:** P1 (Study Director — signal detection), P3 (Reg Toxicologist — triage), P7 (Reg Reviewer — verification)

## Phase 1: Compliance Audit

### Typography gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Study Details page title | `text-2xl font-bold` | Matches `ty.pageTitle` | OK |
| Details section headers | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b pb-1 mb-3` | Matches `ty.sectionHeaderUpper` | OK |
| Details key-value labels | `w-36 text-muted-foreground text-sm` | Labels should be `text-sm` (body) | OK |
| Signals organ rail header | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Matches `ty.sectionHeaderUpper` | OK — note this is `font-semibold` (D-R and Target Organs match, but Histopath and NOAEL use `font-medium`) |
| Tab bar labels | `text-xs font-medium` | Consistent with tab pattern | OK |
| Metrics table headers | Check against `ty.tableHeader` | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | CHECK in code |

### Tab bar consistency

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Main tab bar (Details/Signals) | `h-0.5 bg-primary` underline, `text-xs font-medium` | This is the Study Summary's unique pattern | XD-01 — cross-view decision needed |
| Evidence panel tab bar (Overview/Signal matrix/Metrics) | Same `h-0.5 bg-primary` | Matches main tab bar | OK internally |

**Key finding:** The Study Summary tab bar uses `h-0.5 bg-primary` underline, while D-R/Target Organs use `border-b-2 border-primary`, and Histopath/NOAEL use `border-b-2 border-primary text-primary`. This is the core tab bar inconsistency (XD-01, XD-02).

### Color gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Heatmap cells | Neutral-at-rest (`rgba(0,0,0,0.04)`) | Matches design system §1.11 | OK |
| Evidence bars | `bg-[#E5E7EB]` track, `bg-[#D1D5DB]` fill | Neutral gray | OK |
| Domain labels | `getDomainBadgeColor().text` | Colored-text-only | OK |
| Tier dots | `#DC2626` (red), `#D97706` (amber) | Matches semantic colors | OK |
| Top findings hover | Effect size and p-value turn `#DC2626` | Interaction-driven evidence color | OK |

### Spacing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Metrics tab filter bar | `border-b bg-muted/30 px-4 py-2` | Matches standard filter bar | OK |
| Domain chips (Details tab) | `rounded-md bg-muted px-2 py-0.5 font-mono text-xs` | Not a standard badge — unique interactive chip | OK for chips |
| Decision Bar | `px-4 py-2` | OK | OK |

### Context panel pane ordering

| Mode | Current order | Design system priority | Action |
|------|--------------|----------------------|--------|
| Organ selected | Insights → Contributing endpoints → Evidence breakdown → Related views | Insights → Stats → Related → Navigation | OK — "contributing endpoints" is stats, "evidence breakdown" is stats. Related views last = correct |
| Endpoint selected | Insights → Statistics → Correlations → Tox Assessment → Related views | Insights → Stats → Related → Annotation → Navigation | MINOR — Tox Assessment (annotation) is before Related views, which reverses the design system order. But annotation before navigation is acceptable per §5.1 |

### Empty state audit

| Area | Has empty state? | Action |
|------|-----------------|--------|
| No selection (context panel) | Yes — "Select a signal..." with tip text | OK |
| Empty organ search | Yes — "No matches for '{search}'" | OK |
| No signal data for organ | Yes — "No signal data for this organ." | OK |
| No metadata (Details tab) | Yes — spinner | OK |
| Heatmap no data | CHECK | CHECK in code |

## Phase 2: Optimization Opportunities

1. **Metrics tab default sort** — currently `signal_score` desc. Confirm this matches user expectations.
2. **Cross-view links in evidence panel** — pinned footer strip is good but links may not be discoverable without scrolling.
3. **Decision Bar** — compact but very information-dense. Could benefit from tooltip explanations on metrics.
4. **Study Statements Bar** — only renders when non-empty, but no empty state. Consider adding a positive-signal empty state like "No study-level modifiers or caveats."

## Decision points for user review

| ID | Decision | Recommendation | Rationale |
|----|----------|----------------|-----------|
| SS-01 | Tab bar pattern — should Study Summary adopt the same active indicator as other views, or should others adopt Study Summary's `h-0.5 bg-primary` underline? | Use `h-0.5 bg-primary` everywhere | Thinner underline is more refined and consistent with Datagrok's native tab styling |
| SS-02 | Evidence panel tab naming — "Overview" vs "Evidence" (D-R uses "Evidence", Target Organs uses "Evidence") | Rename to "Evidence" for cross-view consistency | Same cognitive function across views |
| SS-03 | Context panel endpoint pane order — Tox Assessment before Related Views? | Keep current (annotation before navigation) | Annotation is higher priority than navigation per design system |

## Integration points

- `docs/systems/insights-engine.md` — signal scoring, synthesis
- `docs/systems/navigation-and-layout.md` — three-panel layout
- `docs/views/study-summary.md` — view spec (update after audit)
- `frontend/src/components/analysis/StudySummaryView.tsx`
- `frontend/src/components/analysis/SignalsPanel.tsx`
- `frontend/src/components/analysis/panes/StudySummaryContextPanel.tsx`
- `frontend/src/lib/design-tokens.ts` — token adoption target

## Acceptance criteria

- Tab bar styling documented as canonical pattern (XD-01 resolved)
- All typography matches design system tokens
- Metrics table headers use `ty.tableHeader`
- Context panel pane ordering follows design system priority
- Empty states present for all interactive areas
- View spec updated
