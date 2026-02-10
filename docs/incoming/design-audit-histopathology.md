# Design Audit: Histopathology

## What this does

Comprehensive design audit of the Histopathology view to bring it into full compliance with the design system. This view has the most cross-view inconsistencies (tab bar, rail header, no Hypotheses tab, 7 context panel panes).

## Scope

- **View:** Histopathology (`/studies/:studyId/histopathology`)
- **Components:** `HistopathologyView.tsx`, `HistopathologyViewWrapper.tsx`, `HistopathologyContextPanel.tsx`, related hooks
- **View spec:** `docs/views/histopathology.md`
- **Primary personas:** P2 (Pathologist — specimen-centric analysis), P1 (Study Director — correlating with clinical findings)

## Phase 1: Compliance Audit

### Tab bar consistency (CRITICAL — cross-view issue)

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Active tab text | `text-primary` | XD-01 — D-R/Target Organs use `text-foreground` | FIX — align with canonical pattern |
| Active indicator | `border-b-2 border-primary` | XD-01 — pending canonical decision | DEFER to Phase 3 |
| Tab padding | `px-3 py-2` | XD-02 — D-R/Target Organs use `px-4 py-1.5` | FIX — align with canonical pattern |
| Tab bar bg | No explicit bg | XD-03 — D-R/Target Organs use `bg-muted/30` | FIX — add `bg-muted/30` |

### Typography gaps (CRITICAL)

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Rail header | `text-xs font-medium uppercase tracking-wider text-muted-foreground` | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | FIX — `font-medium` → `font-semibold` (matches D-R, Target Organs, Signals) |
| Observed findings section header | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | FIX — `font-medium` → `font-semibold`, `tracking-wide` → `tracking-wider` |
| Severity matrix section header | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Correct | OK |
| Lesion severity grid headers | Check against `ty.tableHeader` | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | CHECK in code |

### Spacing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Tab bar | `flex shrink-0 items-center gap-0 border-b px-4` | Missing `bg-muted/30` | FIX — add bg |
| Filter bar | `flex items-center gap-2 border-b bg-muted/30 px-4 py-2` | Matches standard | OK |
| Rail item padding | `px-3 py-2.5` | OK — matches Target Organs | OK |

### Color gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Evidence/severity bars | `bg-[#E5E7EB]` track, `bg-[#D1D5DB]` fill | Neutral gray — matches other views | OK |
| Domain labels in rail | `getDomainBadgeColor().text` + `text-[9px] font-semibold` | Colored-text-only | OK |
| Neutral heat colors (group heatmap) | `getNeutralHeatColor()` — grayscale | Unique to Histopath — no design system conflict | OK |
| Subject heatmap severity | `getNeutralHeatColor(sevNum)` | Grayscale for severity | OK |
| Evidence panel bg | `bg-muted/5` | XD-03 | OK (matches Target Organs) |

### Context panel pane ordering (CRITICAL — 7 panes)

| Current order | Design system priority | Action |
|--------------|----------------------|--------|
| 1. Dose detail | Stats | OK |
| 2. Sex comparison | Stats | OK |
| 3. Insights | Insights (should be #1) | FIX — move Insights to position 1 |
| 4. Correlating evidence | Related items | OK |
| 5. Pathology review | Annotation | OK |
| 6. Related views | Navigation | OK |
| 7. Tox Assessment | Annotation | ISSUE — two annotation forms |

**Problems:**
1. Insights is at position 3 — should be position 1 per design system priority (insights first)
2. Two annotation forms (Pathology review + Tox Assessment) — P2 primarily uses Pathology review. ToxFinding is for P1.
3. 7 panes is a lot of scrolling

**Recommended reordering:**
1. Insights (domain-specific)
2. Dose detail
3. Sex comparison
4. Correlating evidence
5. Pathology review (annotation — primary for P2)
6. Tox Assessment (annotation — secondary, for P1)
7. Related views (navigation — last)

### Empty state audit

| Area | Has empty state? | Action |
|------|-----------------|--------|
| No specimen selected | Yes — "Select a specimen..." | OK |
| No findings for specimen | Yes — "No findings for this specimen." | OK |
| Rail search empty | Yes — "No matches for '{search}'" | OK |
| No rows after filter | Yes — "No rows match the current filters." | OK |
| Subject data not available | Yes — "Subject-level data not available..." | OK |
| >200 rows | Yes — truncation message | OK |
| Context panel no selection | Yes — "Select a finding..." | OK |

### Casing gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Tab labels "Overview" / "Severity matrix" | "Overview" OK, "Severity matrix" sentence case | Both sentence case | OK |
| Section headers | Sentence case rendered via CSS uppercase | OK | OK |
| "Preliminary" badge | Sentence case | OK | OK |

## Phase 2: Optimization Opportunities

1. **Hypotheses tab** — D-R and Target Organs both have Hypotheses tabs. Histopath doesn't. For tab-structure consistency, consider adding organ-level Hypotheses tools (specimen-level analysis, severity trend explorer, pathologist workflow tools). See XD-07.
2. **Context panel consolidation** — 7 panes is heavy. Consider: (a) merge Dose detail + Sex comparison into one "Statistics" pane, (b) collapse Correlating evidence by default, (c) collapse Related views by default (already is).
3. **Review status badge** — currently hardcoded "Preliminary". The spec notes a P3 backlog item to derive from `useAnnotations<PathologyReview>`.
4. **Group/Subject toggle** — segmented control is good. Verify pill styling matches Hypotheses tab intent pills elsewhere.

## Decision points for user review

| ID | Decision | Recommendation | Rationale |
|----|----------|----------------|-----------|
| H-01 | Fix tab bar to match canonical pattern (XD-01, XD-02) | Yes — highest priority FIX | Most visible inconsistency |
| H-02 | Fix rail header to `font-semibold` (XD-04) | Yes | Matches all other rails |
| H-03 | Reorder context panel panes — Insights to position 1? | Yes | Design system priority: insights first |
| H-04 | Add Hypotheses tab for tab-structure consistency (XD-07)? | Defer to Phase 2 | Two tabs works for P2 (pathologist); adding a third is lower priority than fixing existing inconsistencies |
| H-05 | Merge Dose detail + Sex comparison into one "Statistics" pane? | Consider during Phase 2 | Reduces pane count from 7 to 6, and puts stats in one collapsible unit |
| H-06 | Fix observed findings section header (`font-medium` → `font-semibold`, `tracking-wide` → `tracking-wider`) | Yes | Matches `ty.sectionHeaderUpper` |

## Integration points

- `docs/views/histopathology.md` — view spec (update after audit)
- `frontend/src/components/analysis/HistopathologyView.tsx`
- `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx`
- `frontend/src/lib/design-tokens.ts` — token adoption target

## Acceptance criteria

- Tab bar matches canonical pattern (XD-01, XD-02 resolved)
- Rail header uses `font-semibold` (XD-04)
- Section headers use `font-semibold` + `tracking-wider`
- Tab bar has `bg-muted/30`
- Context panel pane ordering follows design system priority (insights first)
- All empty states verified
- View spec updated
