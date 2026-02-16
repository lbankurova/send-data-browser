# Findings Rail — Implementation Plan

**Spec:** `findings-rail.md` (same directory)
**Created:** 2026-02-16

## Current State

| Asset | Location | Status |
|-------|----------|--------|
| `useAdverseEffectSummary` hook | `hooks/useAdverseEffectSummary.ts` | Exists, returns `AdverseEffectSummaryRow[]` |
| `deriveOrganSummaries()` / `deriveEndpointSummaries()` | `NoaelDecisionView.tsx:85-210` | Embedded in NOAEL view — extract to shared module |
| `SparklineGlyph` | `components/ui/SparklineGlyph.tsx` | Exists but takes `values: number[]` (incidence bars). Rail needs a schematic pattern glyph instead. |
| `FindingSelectionContext` | `contexts/FindingSelectionContext.tsx` | Exists — `selectedFindingId`, `selectedFinding`, `selectFinding()` |
| `StudySelectionContext` | `contexts/StudySelectionContext.tsx` | Exists — `organSystem`, `specimen`, `endpoint`, cascading clears |
| `specimenToOrganSystem()` | `HistopathologyContextPanel.tsx:437` | Exists |
| `formatPValue()` | `lib/severity-colors.ts:87-93` | Exists |
| `getDomainBadgeColor()` | Does not exist | Create domain color mapping |
| AE view left rail | `PolymorphicRail` (global organ rail) | Generic — spec replaces this |
| D-R view left rail | None — `DoseResponseEndpointPicker` dropdown | Spec adds rail, deprecates picker |
| AE backend API filters | `organ_system` / `endpoint_label` not supported | API takes `domain`, `sex`, `severity`, `search` only |

## Decisions

1. **SparklineGlyph vs PatternGlyph**: Create a new `PatternGlyph` component that renders a schematic SVG shape from `dose_response_pattern` string alone (monotonic up = ascending line, etc.). At 24×12px, schematic shapes are more readable than actual data bars. The existing `SparklineGlyph` (which needs per-dose-group incidence values) remains for histopathology.

2. **Backend API for Stage 3**: Add `organ_system` and `endpoint_label` filter params to the paginated AE endpoint. Proper server-side filtering is consistent with existing `domain`/`sex`/`severity` params.

3. **Derive function extraction**: Move `deriveOrganSummaries()` and `deriveEndpointSummaries()` from `NoaelDecisionView.tsx` into `lib/derive-summaries.ts`. Both FindingsRail and NOAEL view import from there.

## Stages

### Stage 1: Static Organ Rail (AE View)

**Goal:** Signal-score-sorted organ cards + endpoint rows in the AE left panel. No interaction with the table.

**Create:**
- `lib/derive-summaries.ts` — extracted derive functions + new `computeEndpointSignals()`, `computeGroupSignals()`
- `lib/findings-rail-engine.ts` — grouping, filtering, sorting logic
- `components/ui/PatternGlyph.tsx` — schematic SVG for dose-response pattern
- `components/analysis/findings/FindingsRail.tsx` — main rail component

**Modify:**
- `NoaelDecisionView.tsx` — update imports to use extracted derive functions
- `lib/severity-colors.ts` — add `getDomainBadgeColor()`
- AE view wrapper / layout — mount FindingsRail in left panel instead of PolymorphicRail

**Ships:** Signal summary (adverse/warning counts + TR ratio bar), organ-grouped cards sorted by group signal score, endpoint rows with direction arrow, pattern glyph, severity pip, TR tag, metrics line. Expand/collapse only.

### Stage 2: Rail Filters + Sort

**Goal:** Rail-internal filtering and sort modes.

**Modify:**
- `FindingsRail.tsx` — search input, TR/Sig toggles, sort dropdown
- `findings-rail-engine.ts` — filter/sort application

**Ships:** Search, TR-only, Sig-only toggles, 4 sort modes, filtered card counts (`12/18 · 4`).

### Stage 3: Rail → Table Filtering (AE)

**Goal:** Click card or endpoint to filter center table.

**Backend:**
- `routers/analyses.py` — add `organ_system`, `endpoint_label` query params
- Filtering logic in the route handler

**Frontend:**
- `types/analysis.ts` — extend `AdverseEffectsFilters`
- `hooks/useAdverseEffects.ts` — pass new filter params
- `FindingsRail.tsx` — click handlers dispatch via callbacks
- `AdverseEffectsView.tsx` — consume rail selections, update API query, page reset

**Ships:** Card click → table filters to organ. Endpoint click → table filters to endpoint + populates context panel.

### Stage 4: Bidirectional Sync

**Modify:**
- `FindingsRail.tsx` — accept selection prop, auto-expand parent, `scrollIntoView`
- `AdverseEffectsView.tsx` / `FindingsTable.tsx` — propagate table clicks to rail
- `findings-rail-engine.ts` — reverse lookup index

### Stage 5: D-R Integration + Global Presets

**Modify:**
- `DoseResponseView.tsx` — add FindingsRail, remove picker as primary
- `FindingsRail.tsx` — `activeView` prop, view dispatch, preset resolution

**Risk:** D-R center panel loses 260px width. May need collapsible rail.

### Stage 6: Domain + Pattern Groupings

**Modify:**
- `FindingsRail.tsx` — segmented control, 3 grouping modes
- `findings-rail-engine.ts` — domain/pattern grouping
- Card header variants (domain colors, pattern icons)

### Stage 7: Filter Bar Coordination

**Modify:**
- `AdverseEffectsView.tsx` — hide domain dropdown when Domain grouping active
- Visual chip for active rail scope
