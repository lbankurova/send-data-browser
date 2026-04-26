# Frontend UI Gate

**This rule applies to ALL frontend work — features, bug fixes, charts, panels, tables. No exceptions.**

## Rule 0: Copy before creating

Before writing ANY new UI element (chart, table, panel, pane, card, badge, legend, filter):

1. **Find the existing working instance.** Search the codebase for the closest equivalent that the user has already approved. Examples:
   - New chart → find an existing chart in the same view or a sibling view
   - New table → find an existing table with similar data shape
   - New context panel pane → find an existing pane in the same panel
   - New legend → find how legends are done in FindingsView charts

2. **Read it fully.** Note:
   - Container: width, height, resize behavior, flex/grid setup
   - Legend: position (above/below/inline), click behavior (filter toggle? highlight?)
   - Labels: what's labeled, what's not, format, casing
   - Interactions: hover, click, selection — what triggers what
   - Overflow: what happens with 2 dose groups vs 8? With short labels vs long?
   - Cross-study: does it work for PointCross AND smaller/larger studies?

3. **Copy the pattern.** Use the same container setup, legend component, interaction handlers, label formatting. Adapt only the data binding.

4. **If you can't find a reference:** State this explicitly: "No existing pattern found for [X]. Proposing new pattern: [description]." Wait for user approval before building from scratch.

## Rule 1: Viewport budget

The app runs on 15" laptops (1920x1080) as the minimum. The usable area for center content:

```
Total height: 1080px
- Browser chrome: ~80px
- App header + nav: ~48px  
- View tab bar: ~36px
- Filter bar: ~40px
- Bottom padding: ~16px
= Available: ~860px

Rail+center split:
- Rail: 260-300px
- Center: remaining (~900-1100px width)
- Context panel: 280-350px (when open)
```

**Before building:** Calculate whether your component fits. A 500px chart + 150px legend + 40px axis labels = 690px. That leaves 170px for everything else in the panel. Is that enough?

**Charts specifically:** Default chart height should be 250-350px unless the chart IS the entire center content. Never 500px+.

### Chart layout anatomy (mandatory)

Every chart follows this standard structure:

```
┌─ Container (flex-col, h-full or explicit height) ───────┐
│ Row 1: Title (left)                    [Toggle] (right) │  ← text-[10px] font-semibold uppercase, ~16px
│ Row 2: Legend pills (left-aligned, grouped by type)     │  ← text-[9px] or text-[10px], ~18px
├─────────────────────────────────────────────────────────┤
│ Chart SVG/Canvas (flex-1, min-h-0, overflow-hidden)     │  ← fills all remaining space
└─────────────────────────────────────────────────────────┘
```

**Rules:**
- Title + legend together: **max ~36px** total. Minimize chrome, maximize data.
- No large margins between legend and chart top edge — `pt-1 pb-0.5` max on header area.
- Chart body uses `flex-1 min-h-0` — fills remaining space. **No fixed px height** when chart is inside a flex parent (the parent controls the height).
- SVG should render at container height, not a hardcoded `height={300}`.
- Two-chart split: use a tab bar below each chart (like dose-response/recovery tabs), not side-by-side with separate titles.

### Dose label format

- **Default** (axes, legends, labels): `getDoseLabel()` — full `mg/kg` format.
- **Tight space** (>6 groups, compact panels): `shortDoseLabel()` — strips units.
- **Matrix/grid headers**: `doseAbbrev()` — single number or "C".
- **One format per chart.** Never mix formats within the same axis or legend.

### Split-panel header alignment

When two panels sit side by side (resizable split), their content must start at the same vertical level:

1. **Shared header** spans full width above the split — contains elements common to both panels (e.g., severity legend, mode toggle).
2. **Per-panel title row** — each panel gets its own title row. Title LEFT-aligned, panel-specific legend (e.g., F/M sex indicators) RIGHT-aligned on the same line.
3. **Spacer on panels without a title** — if one panel has no title but the other does, add an empty spacer div of the same height so content aligns. Use `py-0.5` + a fixed-height inner div matching the title row.
4. **Never mix shared and per-panel legends.** Shared legends (severity grades) go in the shared header. Per-panel legends (sex indicators) go in that panel's title row, right-aligned.

Reference implementation: `SpecimenIncidencePanel.tsx` — shared severity legend + per-panel finding title with F/M.

## Rule 2: Label audit

After building, run this checklist on every label/text element:

| Question | If yes → remove |
|----------|----------------|
| Is this label already visible in the parent context (rail header, pane title, tab name)? | Remove — it's redundant |
| Is this axis label obvious from the data format (e.g., "Dose (mg/kg)" when dose values already show "mg/kg")? | Remove or shorten |
| Is this legend entry the same as the axis category it represents? | Make the axis the legend (inline) |
| Is this tooltip showing the exact same values already visible in the chart? | Remove or add only non-visible values |
| Does this label repeat on every data point when one header would do? | Use a header |

**Dose group labels specifically:** Use `getDoseLabel()` from `dose-label-utils.ts` or `DoseLabel`/`DoseHeader` components. Never format dose strings manually. Check that labels don't duplicate between axis and legend.

## Rule 3: Interaction consistency

Every interactive element must match the established pattern:

| Element | Established pattern | Where to find it |
|---------|-------------------|------------------|
| Chart legend click | **Solo-filter:** click = show only clicked, hide rest. Click active = show all. Ctrl+click = additive toggle (multi-select). | CLAUDE.md: "Chart legends are interactive filters" |
| Chart legend position | Top left (default). Pill styling: `PanePillToggle` (`px-1.5 py-0.5 text-[10px] rounded`) | Same |
| Chart legend visual | Hidden items: `opacity-35`, muted text. Active: full opacity, colored swatch. | Same |
| Panel resize | `useResizePanel` hook with drag handle | FindingsView rail/center split |
| Chart hover | Tooltip with non-visible details only | DoseResponseChartPanel |
| Table row click | Select → context panel updates | FindingsTable, HistopathologyView |
| Empty state | `text-xs text-muted-foreground` centered prompt | Design system |

**Before adding any interaction:** Search for the same interaction in existing code and match it exactly. If your legend click does something different from every other legend click in the app, you have a bug.

## Rule 4: Cross-study stress test

After building, mentally test with:
- **Minimum data:** 2 dose groups, 1 sex, 3 endpoints. Does the chart look empty/broken?
- **Maximum data:** 8 dose groups, 2 sexes, 50 endpoints. Does it overflow? Do labels collide?
- **Missing data:** What if a dose group has no data? Show empty bar/"NE", never omit.
- **Long labels:** What if the endpoint label is "Alanine Aminotransferase (ALT) - Terminal Sacrifice"? Does it truncate gracefully?

## Rule 5: Strip pass (mandatory)

After the component works, do a deliberate removal pass:

1. Remove every label that's redundant (Rule 2)
2. Remove every margin/padding that exceeds the design system tokens
3. Remove every interaction that isn't answering an analytical question
4. Remove every config option that has only one value
5. Remove every wrapper div that isn't structurally necessary

**The goal is not "looks complete." The goal is "nothing left to remove."**

## Rule 6: Existing component reuse

Before creating new components, check these existing utilities:

| Need | Use this | Not this |
|------|----------|----------|
| Dose label | `getDoseLabel()` from `dose-label-utils.ts` | Manual string formatting |
| Dose color | `buildDoseColorMap()` from `dose-label-utils.ts` | `getDoseGroupColor()` with hardcoded level |
| Short dose label | `shortDoseLabel()` from `dose-label-utils.ts` | Manual truncation |
| Dose column header | `<DoseHeader>` from `components/ui/DoseLabel.tsx` | Raw dose strings |
| P-value format | `formatPValue()` from `severity-colors.ts` | `toFixed()` |
| Effect size format | `formatEffectSize()` from `severity-colors.ts` | Manual formatting |
| Signal tier | `getSignalTier()` from `findings-rail-engine.ts` | Threshold checks |
| Title casing | `titleCase()` from `severity-colors.ts` | Manual casing |
| Severity color | `getSeverityColor()` from `severity-colors.ts` | Hardcoded hex |
| Collapsible pane | `<CollapsiblePane>` | Custom accordion |
| Filter controls | `<FilterSearch>`, `<FilterSelect>`, `<FilterMultiSelect>` | Custom inputs |
| **Charts (ECharts)** | | |
| Dose-response curve | `DoseResponseChartPanel` (ECharts via `EChartsWrapper`) | Raw SVG for standard D-R |
| Stacked incidence | `StackedSeverityIncidenceChart` (ECharts via `EChartsWrapper`) | Manual bar chart |
| Incidence dose charts | `IncidenceDoseCharts` (ECharts via `EChartsWrapper`) | Custom incidence rendering |
| Time course line | `TimeCourseLineChart` (ECharts via `EChartsWrapper`) | Raw SVG for time series |
| Time course bar | `TimeCourseBarChart` (ECharts via `EChartsWrapper`) | Manual bar chart |
| Recovery dumbbell | `RecoveryDumbbellChart` (ECharts via `EChartsWrapper`) | Custom recovery viz |
| **Charts (SVG)** | | |
| Bivariate scatter | `BivarScatterChart` (raw SVG) | ECharts for custom scatter |
| Organ heatmap | `OrganGroupedHeatmap` (raw SVG) | ECharts for heatmaps |
| Forest plot | `GroupForestPlot` (raw SVG) | ECharts for forest plots |
| Strip/dot plot | `StripPlotChart` (raw SVG) | ECharts for strip plots |
| **Tables** | | |
| Analysis findings table | `FindingsTable` (content-hugging, absorber column) | Custom `<table>` |
| Context panel table | `PaneTable` (compact, context panel) | Full `FindingsTable` in pane |
| Multi-level grouped table | See `_archived/HistopathologyView.tsx` for the grouping pattern | Building multi-level grouping from scratch |
| **Panels** | | |
| Context panel pane | `CollapsiblePane` with `sp.ctxPane` padding | Custom disclosure/accordion |
| Subject profile | `SubjectProfilePanel` (frozen -- explicit approval needed) | New subject panel |
| Incidence recovery | `IncidenceRecoveryChart` (compact mode for panes) | Custom recovery display |
