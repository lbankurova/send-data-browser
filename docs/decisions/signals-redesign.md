**STATUS: SUPERSEDED** by `signals-v2-rationale.md`. The Signals tab was further redesigned from dual-mode (Findings/Heatmap toggle) to a two-panel master-detail layout (organ rail + evidence panel with Overview/Signal Matrix tabs). See `signals-v2-rationale.md` for rationale.

**Previous status: COMPLETED** — all streams below were implemented but then replaced.

| Stream | Commit | Description |
|--------|--------|-------------|
| A — App-Wide Compliance Fixes | `6b59366` | Fix hedging language and pre-existing build errors |
| B — Template & Synthesis Fixes | `e634b4e` | Revise R01-R17 templates: remove self-labeling prefixes, update synthesis regexes |
| C — Signals Page Redesign | `7488fac` | Redesign Signals tab: two-column layout, tabular rows, enhanced Decision Bar |

---

# Signals View Redesign — Implementation Plan

## Source Specs (in `C:/pg/pcc-design/`)

| File | Scope | Status |
|------|-------|--------|
| `datagrok-design-system.md` | App-wide design principles | Read, analyzed — app is already compliant |
| `llm-implementation-guide.md` | Agent rules for Conclusion/Hybrid views | Read, analyzed — existing components match contracts |
| `signals-view-spec.md` | Signals tab Findings mode redesign | Read, analyzed — **major gap vs current code** |
| `r01-r17-template-revisions.md` | Template text + synthesis regex fixes | Read — **another agent is working on this** |

## Gap Analysis Summary

### Already Compliant (No Work Needed)
- Color system: fully centralized in `severity-colors.ts`, all colors encode meaning
- Context panels: explain "why" not "what", reactive to selection
- Hover patterns: secondary actions on hover, not cluttering default state
- Information hierarchy: findings/qualifiers/caveats visually separated
- Cognitive modes: current views match their intended modes

### Stream A — App-Wide Compliance Fixes (Small, Independent)
**Status: COMPLETED (this session)**

| Item | File | Change |
|------|------|--------|
| Hedging language fix | `signals-panel-engine.ts:233` | "Review may be warranted" → "review for limited endpoints, sex inconsistency, or borderline significance" |
| Widespread low-power line | `signals-panel-engine.ts:429` | Already correct — "review for adequate power" (no change needed) |
| Pre-existing build fix | `StudySummaryContextPanel.tsx:482-504` | `organSelection` → `organSystem` (undefined variable from previous agent) |
| Pre-existing build fix | `ValidationContextPanel.tsx:1307` | Added null guard on `existing.reviewedDate` for Date constructor |

### Stream B — Template & Synthesis Fixes (Another Agent)
**Status: COMPLETED** (commit `e634b4e`)

These fixes are in `r01-r17-template-revisions.md`. The backend templates in `scores_and_rules.py` are **already revised** — prefixes were removed in a previous sprint. The remaining work is frontend:

| Item | File:Line | Current | Needed |
|------|-----------|---------|--------|
| Dead STRIP_PREFIXES array | `rule-synthesis.ts:57-73` | 9 prefix entries that never match | Delete the array and `cleanText()` calls |
| R08 synthesis regex | `rule-synthesis.ts:207` | Strips `"Target organ: "` prefix | Remove — R08 no longer has this prefix |
| R16 synthesis regex | `rule-synthesis.ts:252` | Matches `"suggest"` | Update to match `"show"` (new R16 template says "show convergent pattern") |
| R16 fallback regex | `rule-synthesis.ts:262` | Matches `"Correlated findings in"` | Remove — R16 no longer has this prefix |
| Synthesis "Target organ:" output | `rule-synthesis.ts:~210` | Prepends `"Target organ: "` to R08 output | Remove prepend — tier header communicates this |
| Widespread low-power synthesis | `rule-synthesis.ts` or `signals-panel-engine.ts` | "may be underpowered" | "review for adequate power" |

**Important:** If this agent starts before Stream B's agent finishes, coordinate via git — the same files are touched.

### Stream C — Signals Page Redesign (Major Effort)
**Status: COMPLETED (this session)**

This is the primary work from `signals-view-spec.md`. Eight implementation priorities:

#### C1: Two-Column Layout Shell
**File:** `SignalsPanel.tsx`
**Current:** Single-column full-width with sections stacked vertically
**Target:** Two-column signal landscape (left: organ rows, right: conditions rail)
**CSS:** `grid-template-columns: 1fr 320px` at ≥1440px, single column below
**Key detail:** The right column (conditions rail) scrolls independently from the left

#### C2: Replace OrganCard Grid with Tabular Organ Rows
**File:** `SignalsPanel.tsx` (replace `OrganCard` component and `TargetOrgansSection`)
**Current:** Card grid with `repeat(auto-fill, minmax(280px, 1fr))`
**Target:** Tabular rows with aligned columns:
```
| Organ System | Domains | Signals | Top Endpoint | Score Bar |
```
- Rows sorted by `evidenceScore` desc
- No card borders — rows are separated by subtle dividers
- Row click → same behavior as current card click (navigate to Heatmap + expand)
- Ctrl+click → select organ in-place (context panel updates)
- Target organ star (★) replaces current card-level treatment

#### C3: Move Modifiers + Review Flags to Right Column Rail
**File:** `SignalsPanel.tsx` (move `ModifiersSection` and `CaveatsSection`)
**Current:** Full-width sections below organ grid
**Target:** Right column rail with:
- MODIFIERS header (amber accent)
- Review flags below modifiers (orange accent)
- Independent scroll from left column
- Same content and interaction behavior, just repositioned

#### C4: Enhanced Decision Bar
**File:** `StudySummaryView.tsx` (rewrite `DecisionBar` component)
**Current:** ~60px with NOAEL statement + flat metrics line
**Target:** ~100-140px with scenario-based rendering:

| Scenario | Display |
|----------|---------|
| NOAEL established, same for both sexes | `NOAEL: {dose}` large, confidence bar, driving endpoint clickable |
| NOAEL established, different by sex | Split display: `M: {dose}` / `F: {dose}` with per-sex confidence |
| NOAEL not established | Amber alert: `NOAEL not established — adverse effects at lowest dose` |
| No adverse effects | Green: `No adverse effects identified` |
| Mixed (established + not) | Split: one sex established, other not |

Additional elements:
- Confidence indicator (progress bar, 0-100%)
- Driving endpoint (clickable → endpoint selection)
- Metrics line (targets, significant ratio, domains) — keep current format

#### C5: Responsive Breakpoint
**File:** `SignalsPanel.tsx` + CSS
**Current:** No responsive behavior (single-column always)
**Target:**
- ≥1440px: two-column layout (C1)
- <1440px: single column, conditions rail stacks below organ rows

Implementation: CSS media query or container query on the center panel width

#### C6: Selection State Refactor
**File:** `SignalSelectionContext.tsx`
**Current:** Two separate properties (`selection`, `organSelection`) with manual mutual exclusion
**Target:** Typed union:
```typescript
type SignalSelection =
  | { type: 'none' }
  | { type: 'organ'; organSystem: string }
  | { type: 'endpoint'; endpointKey: string; doseLevel?: number; sex?: string }
```
This simplifies consumers — one `selection` with discriminated union instead of checking two nullable fields.

#### C7: Context Panel 3-Level Support
**File:** `StudySummaryContextPanel.tsx`
**Current:** Two modes: endpoint or organ (falls back to empty state)
**Target:** Three explicit levels:
1. **None selected**: Empty state with usage hints
2. **Organ selected**: OrganPanel (current behavior)
3. **Endpoint selected**: EndpointPanel (current behavior)

Minimal change — the current code already handles this. Just formalize the `SignalSelection` union from C6.

#### C8: Heatmap Sparklines
**File:** `OrganGroupedHeatmap.tsx`
**Current:** Organ groups with dose-level heatmap cells (color blocks + stars)
**Target:** Add optional sparkline in each organ header row showing the dose-response curve of the top endpoint. Small inline SVG, ~60px wide.

### Agent Distribution (Recommended)

```
Agent 1 (Layout — Critical Path)    Agent 2 (Decision Bar)     Agent 3 (Types + Context)
────────────────────────────────    ──────────────────────     ─────────────────────────
C1: Two-column layout shell         C4: Decision Bar           C6: Selection state types
C2: Tabular organ rows              C8: Heatmap sparklines     C7: Context panel 3-level
C3: Conditions rail
C5: Responsive breakpoint
```

- Agent 1 is the critical path — C2 depends on C1, C3 depends on C1, C5 depends on C1
- Agent 2 is fully independent — Decision Bar is in `StudySummaryView.tsx`, not `SignalsPanel.tsx`
- Agent 3 is small and could be absorbed into Agent 1 after C1-C3 are done

### Execution Order

1. C4 + C6 can start immediately (no dependencies)
2. C1 must come before C2, C3, C5
3. C7 depends on C6
4. C8 is independent (nice-to-have, lowest priority)

### Key Files Reference

| File | Path | What It Contains |
|------|------|-----------------|
| SignalsPanel.tsx | `frontend/src/components/analysis/SignalsPanel.tsx` | FindingsView, OrganCard, TargetOrgansSection, ModifiersSection, CaveatsSection |
| StudySummaryView.tsx | `frontend/src/components/analysis/StudySummaryView.tsx` | Main container, DecisionBar, mode toggle, tab routing |
| OrganGroupedHeatmap.tsx | `frontend/src/components/analysis/charts/OrganGroupedHeatmap.tsx` | Heatmap mode center panel |
| SignalSelectionContext.tsx | `frontend/src/contexts/SignalSelectionContext.tsx` | Selection state (endpoint vs organ, mutual exclusion) |
| StudySummaryContextPanel.tsx | `frontend/src/components/analysis/panes/StudySummaryContextPanel.tsx` | Context panel for Signals tab (endpoint + organ modes) |
| signals-panel-engine.ts | `frontend/src/lib/signals-panel-engine.ts` | Derives semantic rules → DecisionBar + OrganBlocks + Modifiers + Caveats |
| rule-synthesis.ts | `frontend/src/lib/rule-synthesis.ts` | Parses R01-R17 output_text, synthesizes organ-grouped insights |
| severity-colors.ts | `frontend/src/lib/severity-colors.ts` | All color utility functions |

### Design Notes

- The spec says Decision Bar should be ~140px. Current is ~60px. Prototype at 100px first — 140px is aggressive for a persistent non-scrolling element. If the information fits at 100px, keep it there.
- The spec's two-column layout matches Datagrok's native pattern well. The right rail (320px) mirrors the context panel width convention.
- Tabular rows instead of cards is the right call for a Conclusion-mode view. Cards add visual weight that competes with the data. Rows let the eye scan vertically.
- The responsive breakpoint at 1440px is sensible — below that, the three-panel layout (sidebar + center + context) already compresses the center panel to <800px, making two columns inside it cramped.

### What NOT to Change

- Heatmap mode layout — spec describes minor enhancements (sparklines), not a restructure
- Context panel architecture — CollapsiblePane pattern is correct, just needs type union from C6
- Color semantics — already compliant with design system
- Cross-mode navigation — card click → heatmap + expand is confirmed by spec
- Filter behavior — filters dimmed in Findings mode is confirmed by spec
