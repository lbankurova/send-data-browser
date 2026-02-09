# Dose-Response View Redesign — Design Analysis & Implementation Plan

## Design Analysis

### Current State (Post-Rewrite)
The Dose-Response view has been rewritten from a flat filter+chart+grid layout into a two-panel organ-grouped endpoint explorer. The new layout:

- **Left panel**: Endpoint Rail (320px) — organ-grouped collapsible sections, each listing endpoints with signal score, pattern badge, direction arrow, trend p-value, and max effect size.
- **Right panel**: Evidence Panel — endpoint summary header with conclusion text, tabbed content (Chart & overview / Metrics table).

The context panel was simplified: pairwise detail removed (moved to center panel), keeping Insights, ToxFindingForm, and Related views.

### Problem Statement
**The old flat layout was a data browser, not an analysis tool.** The scientist's core question — "How does this endpoint change across dose levels?" — was answered by scrolling through 1342 rows in a flat grid, selecting one, and hoping the chart above updated. No grouping by body system, no prioritization by signal strength, no stated conclusions.

The organ-grouped endpoint explorer addresses this by organizing endpoints by organ system, ranking them by signal strength, and showing conclusions explicitly. This follows the same design philosophy as the Target Organs two-panel redesign (committed as `8b3e01d`).

### Design System Compliance

**What the redesign gets right:**

1. **Conclusions stated explicitly.** The summary header generates text like "Monotonic increase across doses, trend p=0.0031, max effect size 2.23. Males only." — follows the principle that conclusions should be stated, not implied.
2. **No empty states.** Auto-selects the highest-signal endpoint on load; organ groups expand to show it.
3. **Organ grouping as navigation.** Scientists think in organ systems. Grouping endpoints by organ mirrors their mental model while keeping the endpoint as the primary selection entity.
4. **Significance-aware charts.** Red dots/bars for p<0.05, standard dots for not significant — visual encoding of statistical meaning.
5. **Pairwise table preserved.** Moved from context panel to center panel with more columns (SD, N, Pattern) — more screen real estate, visible alongside the chart.

**What needs attention:**

1. **Rail width inconsistency.** 320px vs Target Organs' 300px. Should be 300px for visual consistency across views.
2. **No responsive behavior.** Target Organs has `max-[1200px]:flex-col` stacking; Dose-Response has none.
3. **Ad-hoc signal score.** `computeSignalScore = -log10(trendP) + |effectSize|` is invented locally. This may diverge from `study_signal_summary.json` scores. Need to decide: compute locally (current, allows D-R-specific weighting) or import from generated data (consistent across views).
4. **Chart height 280px vs spec's 200px.** 280px is better for readability, but the spec needs updating.
5. **Missing endpoint search autocomplete.** The spec describes a rich autocomplete dropdown with up to 50 matches and chip display. The new code uses a simple text filter in the rail header. The rail filter is arguably better (it shows endpoints in organ context), but the interaction pattern differs.
6. **No row cap in metrics table.** The spec had a 200-row cap with truncation message. The new code renders all rows. With 1342 rows and client-side rendering, this could cause performance issues.
7. **Loose rule filtering in context panel.** `DoseResponseContextPanel` still uses `r.context_key.includes(selection.domain)` and `r.output_text.toLowerCase().includes(...)` — this can produce false matches.

---

## Design Decisions

### D1: Two-panel layout with organ-grouped endpoint rail
**Keep.** Mirrors the Target Organs pattern. The organ grouping is a natural navigation axis for scientists. The endpoint rail provides at-a-glance signal strength ranking that the flat grid never could.

### D2: Pairwise detail moved from context panel to center panel
**Keep, but document the tradeoff.** In the center panel, the pairwise table has more columns and is visible alongside the chart. The tradeoff: it's only visible in the "Chart & overview" tab, not when viewing the metrics table. The context panel is freed up for insights and tox assessment, which is the higher-value use of that space.

**Rationale:** The pairwise table answers "what are the exact values at each dose level?" — a reference question. The chart answers the same question visually. Putting them together in one tab makes sense because they serve the same cognitive mode (detailed endpoint examination). The context panel's limited width (280px) was always cramped for a multi-column table.

### D3: Signal score computation
**Keep local computation, but document formula.** The local formula `signal_score = -log10(trendP) + |effectSize|` weights dose-response trend significance, which is appropriate for this view. The `study_signal_summary.json` signal scores weight differently (they include severity and treatment-relatedness). Using a D-R-specific score that emphasizes dose-trend is intentional, not a bug.

### D4: Endpoint summary header with conclusion text
**Keep.** `generateConclusion()` produces structured text from data. This is the design system's "conclusion first" principle in action. The compact metrics row below provides the supporting numbers.

### D5: Tab structure — Chart & overview / Metrics table
**Keep.** Separating the visual analysis (chart + pairwise) from the data browser (sortable/filterable grid) prevents the view from feeling overwhelming. Scientists can switch modes depending on their task.

### D6: Significance-aware chart rendering
**Keep.** Red/enlarged dots for p<0.05 provide immediate visual feedback about statistical significance at each dose level. The bar chart version uses red fills for significant bars. The shared legend at the bottom explains the encoding.

### D7: Auto-selection behavior
**Keep.** Auto-selects the highest-signal endpoint on data load, expanding its organ group. This eliminates the empty state and gives the scientist an immediate starting point. Cross-view navigation via `location.state` overrides the auto-selection.

---

## What Changed vs. the Spec

The view spec (`docs/views/dose-response.md`) describes the OLD flat layout. Here is a complete diff of what changed:

### Layout
| Aspect | Old Spec | New Implementation |
|--------|----------|-------------------|
| Structure | Single scrollable column: filter → chart → grid | Two-panel: endpoint rail (left) + evidence panel (right) with tabs |
| Filter bar | Single bar above everything with search + 3 dropdowns | Rail has search; metrics tab has its own filter bar |
| Chart visibility | Always visible area (empty or with chart) | Inside "Chart & overview" tab |
| Grid visibility | Always visible below chart | Inside "Metrics table" tab |
| Endpoint search | Autocomplete dropdown, chip display | Simple text filter in rail header |

### Chart
| Aspect | Old Spec | New Implementation |
|--------|----------|-------------------|
| Height | 200px | 280px |
| Significance | Not shown | Red/enlarged dots for p<0.05, red bars for significant incidence |
| Legend | None | Significance legend below charts |
| Section header | Endpoint label as uppercase header | Full summary header with conclusion text + metrics |

### Grid
| Aspect | Old Spec | New Implementation |
|--------|----------|-------------------|
| Row cap | First 200 rows with truncation message | No cap, all rows rendered |
| Section header | "Dose-response metrics (N rows)" | Tab title + filter row count |
| Columns | Same 12 columns | Same 12 columns (preserved exactly) |

### Context Panel
| Aspect | Old Spec | New Implementation |
|--------|----------|-------------------|
| Pane 1: Insights | Present | Present (unchanged) |
| Pane 2: Pairwise detail | 5-column table (Dose, Sex, Mean, p, Effect) | **Removed** — relocated to center panel with 8 columns |
| Pane 3: Tox Assessment | Present, default open | Present (unchanged) |
| Pane 4: Related views | Present, default closed | Present (unchanged) |

### New Features (not in spec)
| Feature | Description |
|---------|-------------|
| Organ grouping | Endpoints grouped by organ_system in the rail, collapsible sections |
| Signal score | `computeSignalScore()` — ranks endpoints by -log10(trendP) + \|effectSize\| |
| EndpointSummary | Aggregates across doses/sexes: min p, min trend p, max effect, dominant pattern, direction |
| Pattern badges | Color-coded badges in rail items (monotonic_increase → red, flat → green, etc.) |
| Direction arrows | ↑↓↕ in rail items showing effect direction |
| Conclusion text | `generateConclusion()` produces structured English text from endpoint statistics |
| Auto-selection | Highest-signal endpoint auto-selected on load with organ group expansion |
| Cross-view entry | Accepts `{ organ_system, endpoint_label }` in location.state |
| Pairwise in center | 8-column pairwise table (Dose, Sex, Mean, SD, N, p-value, Effect, Pattern) in chart tab |

---

## Component Architecture

```
DoseResponseView (flex h-full overflow-hidden)
├── EndpointRail (left, w-[320px], shrink-0, border-r, bg-muted/20)
│   ├── Rail header: "Endpoints (N)" + search input
│   └── OrganGroup × N (sorted by max_signal_score desc)
│       ├── Group header button: chevron + organ name + endpoint count
│       └── EndpointItem × M (when expanded, sorted by signal_score desc)
│           ├── Row 1: endpoint name + direction arrow
│           └── Row 2: pattern badge (first word) + trend p + max |d|
│
├── EvidencePanel (right, flex-1, overflow-hidden)
│   ├── EndpointSummaryHeader (shrink-0, border-b)
│   │   ├── Endpoint name + domain/organ/type info + pattern badge
│   │   ├── Conclusion text (generated)
│   │   └── Compact metrics: trend p, min p, max |d|, sexes, data type
│   │
│   ├── Tab bar: [Chart & overview] [Metrics table]
│   │
│   ├── ChartOverviewContent (when "Chart & overview" active)
│   │   ├── Chart area: side-by-side Recharts per sex
│   │   │   ├── Continuous: LineChart (mean ± SD, significance dots)
│   │   │   └── Categorical: BarChart (incidence, significance fill)
│   │   ├── Significance legend
│   │   └── Pairwise comparison table (8 columns)
│   │
│   └── MetricsTableContent (when "Metrics table" active)
│       ├── Filter bar: [Sex ▼] [Type ▼] [Organ ▼] + row count
│       └── TanStack table (12 columns, client-side sorting)

DoseResponseContextPanel (right sidebar, 280px)
├── Header: endpoint name, domain · organ · sex
├── CollapsiblePane "Insights": InsightsList (filtered rules)
├── ToxFindingForm: treatment-related + adversity + comment
└── CollapsiblePane "Related views": cross-view navigation links
```

### Derived Data Types

```typescript
interface EndpointSummary {
  endpoint_label: string;
  organ_system: string;
  domain: string;
  data_type: "continuous" | "categorical";
  dose_response_pattern: string;      // Dominant pattern (prefers non-flat)
  min_p_value: number | null;         // Min across all doses/sexes
  min_trend_p: number | null;         // Min trend p across sexes
  max_effect_size: number | null;     // Max |d| across all doses/sexes
  direction: "up" | "down" | "mixed" | null;
  sexes: string[];
  signal_score: number;               // -log10(trendP) + |effectSize|
}

interface OrganGroup {
  organ_system: string;
  endpoints: EndpointSummary[];       // Sorted by signal_score desc
  max_signal_score: number;           // For group sorting
}
```

---

## Remaining Issues to Address

### P1 — Consistency with Target Organs pattern

1. **Rail width**: Change from 320px to 300px to match Target Organs.
2. **Responsive stacking**: Add `max-[1200px]:flex-col` and equivalent narrow-viewport handling.
3. **Rail background**: Currently `bg-muted/20`; Target Organs has no bg class on the rail container. Standardize.

### P2 — Context panel rule filtering

The `DoseResponseContextPanel` filters rules with:
```typescript
r.context_key.includes(selection.domain ?? "") ||
r.output_text.toLowerCase().includes(selection.endpoint_label.toLowerCase().slice(0, 20))
```
This is fragile: it matches on partial domain codes (e.g., "LB" would match "LB" in any context_key) and truncates the endpoint label to 20 chars for text matching. Should use the same structured matching as other context panels.

### P3 — Metrics table row cap

The spec required a 200-row cap. With 1342 rows and no virtualization, rendering all rows may cause performance issues on slower machines. Options:
- Keep no cap (current) — simpler, works for this dataset size
- Add virtualization (e.g., TanStack Virtual) — better scaling
- Restore the 200-row cap with "use filters" message — simplest fix

Recommend: keep no cap for now. The dataset is small enough and the organ filter in the metrics tab effectively serves as a row limiter.

### P4 — ContextPanel.tsx integration

The `drData` prop was removed from `ContextPanel.tsx` (line 324 in current code confirms this). The `DoseResponseContextPanelWrapper` only passes `ruleResults` and `selection`. This is correct — the context panel no longer needs the raw data since pairwise detail moved to the center panel.

### P5 — View spec needs full rewrite

The current `docs/views/dose-response.md` describes the OLD flat layout and is now entirely stale. It must be rewritten from scratch to match the new two-panel implementation.

---

## Implementation Steps

The rewrite is already done. The remaining work is polish and cleanup:

### Step 1: Consistency fixes
- [ ] Change rail width from 320px to 300px (match Target Organs)
- [ ] Add `max-[1200px]:flex-col` responsive stacking
- [ ] Standardize rail background styling

### Step 2: Context panel improvement
- [ ] Replace loose rule filtering in `DoseResponseContextPanel` with structured `context_key` matching (parse `DOMAIN_TESTCODE_SEX` format, match on domain + endpoint label)
- [ ] Consider re-adding a compact pairwise summary in the context panel (e.g., just dose levels with trend arrows, not the full table) for when the metrics tab is active

### Step 3: Spec update
- [ ] Rewrite `docs/views/dose-response.md` from scratch describing the new two-panel layout
- [ ] Update `docs/MANIFEST.md` staleness tracking

### Step 4: CLAUDE.md updates
- [ ] Update the DoseResponseView description in the Architecture section
- [ ] Update the Data Flow section
- [ ] Remove uncommitted changes note (once committed)

---

## What NOT to Change

- **ViewSelectionContext integration** — the wrapper pattern works correctly
- **TanStack table column definitions** — all 12 columns preserved exactly
- **Cross-view navigation links** — same 3 links in context panel
- **React Query hooks** — `useDoseResponseMetrics` and `useRuleResults` unchanged
- **Color scales** — p-value, effect size, domain, dose group colors all from `severity-colors.ts`
- **ToxFindingForm** — standard assessment component, unchanged
- **InsightsList** — standard synthesis component, unchanged
- **DoseResponseViewWrapper** — thin wrapper with ViewSelectionContext wiring

---

## Assessment: Is Organ Grouping the Right Pattern?

**Yes, with a caveat.**

The Dose-Response view's core question is "How does the finding change across dose levels?" — it's fundamentally about **endpoints**, not organs. But scientists navigate to endpoints through organ systems. They think "what's happening in the liver?" before "what's happening with ALT?".

The current implementation handles this correctly: organs are a **grouping mechanism** in the rail, not the primary selection target. Clicking an organ header expands/collapses the group; clicking an endpoint within is the actual selection. The evidence panel focuses entirely on the selected endpoint, not the organ group.

The alternative — a flat rail sorted by signal score with no grouping — would be harder to navigate for a scientist who arrives thinking about a specific organ system. The organ grouping adds navigational structure without changing the analytical focus.

**Comparison with Target Organs:** In Target Organs, the organ is the primary entity (the rail selects organs, the evidence panel shows organ-level data). In Dose-Response, the endpoint is the primary entity (the rail selects endpoints, the evidence panel shows endpoint-level data). The organ grouping is purely navigational. This is the right distinction.

---

## Assessment: Was Removing Pairwise Detail from the Context Panel Correct?

**Yes.** The pairwise detail was a 5-column table showing dose-level breakdowns for the selected endpoint. It's now an 8-column table in the center panel's "Chart & overview" tab, directly below the visualization.

**Arguments for the change:**
- The context panel is 280px wide — cramped for a multi-column table
- Pairwise data is the detailed evidence for the chart above it — they belong together
- The context panel is better used for insights (rule synthesis) and assessment (tox form)
- The center panel version has 3 additional columns (SD, N, Pattern)

**Arguments against:**
- When viewing the metrics table tab, the pairwise data for the selected endpoint is not visible
- In the old layout, the pairwise table was always visible in the context panel regardless of center panel state

**Mitigation:** If the "always visible pairwise" property is valued, a compact 2-3 column pairwise summary could be added to the context panel header (below the endpoint info, above Insights). This would show just dose labels with trend direction, not the full table.

**Recommendation:** Accept the change as-is. The chart tab is the natural home for pairwise data. Scientists who want the full breakdown will be in the chart tab. Scientists in the metrics tab are browsing across endpoints, not examining one endpoint's dose levels.
