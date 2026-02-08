# Target Organs View Redesign — Design Reasoning & Implementation Plan

## Design Analysis

### Current State
The Target Organs view has three stacked zones: flex-wrap organ cards at top, a filter bar, and a flat evidence table (9 columns, TanStack React Table). The table only appears after clicking a card, leaving the center panel empty by default. Cards show evidence score + endpoint/domain counts but not three valuable fields: `n_significant`, `n_treatment_related`, `max_signal_score`.

### Problem Statement
**Cognitive mode mismatch.** This should be a **Hybrid** view — convergence assessment (conclusions about which organs are targets) backed by auditable evidence. Currently it reads as **Exploration** — a flat data browser with no stated conclusions. The scientist must mentally synthesize "is this a target organ?" from raw table rows.

### Design System Violations
1. **No conclusions stated.** The view shows data but never says "Liver is a target organ with convergent evidence from 4 domains." The TARGET badge is tiny and inline — position doesn't imply status.
2. **Empty state wastes space.** Before selecting an organ, the entire center panel shows "Select an organ system above." On a 24" monitor, this is ~1200x600px of nothing.
3. **Unused data.** `n_significant`, `n_treatment_related`, `max_signal_score` are computed and served but never displayed. The scientist can't see "46 of 104 endpoints are significant" without opening the context panel.
4. **Evidence score color is muted.** The code divides `evidence_score` by 2 before mapping to the color scale, producing misleadingly green colors for organs with strong evidence.
5. **No visual hierarchy.** All organ cards are the same size regardless of evidence strength. The eye can't distinguish "definitely a target" from "borderline" at a glance.

### Design Decisions

**D1: Two-panel layout.** Left rail (~300px) with organ list, right panel with evidence. Eliminates empty state — the top organ auto-selects on load. Mirrors the Signals tab pattern (familiar to the scientist). The organ list is always visible for comparison while examining evidence.

**D2: Enriched organ list items.** Each item shows:
- Organ name + TARGET accent (left border, not inline text)
- Evidence score as a horizontal bar (visual weight encodes strength)
- `n_significant` / `n_treatment_related` as compact stat line
- Domain chips (already present, keep)

**D3: Summary header (conclusion first).** Above the evidence area, a 2-3 line summary states the conclusion: "Convergent evidence from N domains: X/Y endpoints significant, Z treatment-related." This follows the design system principle: conclusions are explicitly stated, not implied by charts.

**D4: Dual-tab evidence.** Two tabs in the right panel below the summary header:
- **Overview** — domain breakdown, top findings by effect size, key statistics. The "quick audit" surface.
- **Evidence table** — the existing flat table (preserved exactly as-is). The "deep dive" surface.

**D5: Fix evidence_score color.** Map the actual data range (0–1.3) directly to the color scale without the /2 division.

**D6: Auto-select top organ on load.** Pre-select the highest-evidence organ so the user immediately sees data.

---

## Implementation Plan

### Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/analysis/TargetOrgansView.tsx` | Major rewrite: two-panel layout, enriched organ rail, summary header, tab toggle |
| `frontend/src/components/analysis/panes/TargetOrgansContextPanel.tsx` | Fix evidence_score/2 color mapping |

### Component Architecture (New)

```
TargetOrgansView (flex h-full)
├── OrganRail (left, w-[300px], overflow-y-auto, border-r)
│   ├── Section header "Organ systems (N)"
│   └── OrganListItem × N (sorted by evidence_score desc)
│       ├── Left border accent (blue if target, transparent if not)
│       ├── Organ name (bold) + TARGET badge
│       ├── Evidence bar (horizontal, colored by score)
│       └── Stats line: "N sig · M TR · K domains"
│
├── EvidencePanel (right, flex-1, overflow-hidden)
│   ├── OrganSummaryHeader (shrink-0, border-b, py-3 px-4)
│   │   ├── Organ name + TARGET ORGAN badge
│   │   ├── Conclusion text: "Convergent evidence from N domains..."
│   │   └── Compact metrics: max signal, significant ratio, TR ratio
│   │
│   ├── Tab bar: [Overview] [Evidence table]
│   │
│   ├── OverviewTab (when active)
│   │   ├── Domain breakdown: mini table (domain, endpoints, significant, TR)
│   │   └── Top findings: up to 10 highest-effect endpoints with p-value, effect, severity
│   │
│   └── EvidenceTableTab (when active)
│       ├── Filter bar: [Domain ▼] [Sex ▼] N findings
│       └── Existing TanStack table (unchanged)
```

### Implementation Steps

1. **Add OrganListItem component** — replaces organ cards with rail items. Evidence bar, stats, TARGET accent.
2. **Add OrganRail component** — scrollable left column with header + list items. Auto-selects top organ.
3. **Add OrganSummaryHeader component** — conclusion text + compact metrics above tabs.
4. **Add OverviewTab component** — domain breakdown table + top findings list.
5. **Add tab toggle** — [Overview] [Evidence table] segmented control.
6. **Wrap existing table as EvidenceTableTab** — preserve current filter bar + TanStack table exactly.
7. **Restructure TargetOrgansView** — two-panel flex layout, wire components.
8. **Fix evidence_score/2** — remove /2 division in color mapping (both view and context panel).
9. **Responsive** — stack vertically below 1200px (organ rail becomes horizontal strip).

### Data Requirements
No new API endpoints needed. All data comes from existing `target_organ_summary` and `organ_evidence_detail` hooks.

### Key Decisions
- Overview tab shows domain breakdown + top findings — provides quick audit without raw table
- Evidence table tab preserved exactly (filter bar, columns, sorting, row selection)
- Auto-select fires on data load, not on mount (avoids flash of empty state)
- Cross-view navigation from location.state still works (selects passed organ_system)
- Context panel behavior unchanged (organ-level → convergence panes, row-level → tox form)

### What NOT to Change
- Context panel structure (4 panes: convergence, endpoints, related views, tox form)
- ViewSelectionContext integration
- Cross-view navigation links
- TanStack table column definitions
- Row selection → context panel behavior
