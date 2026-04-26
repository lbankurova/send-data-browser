<!-- Derived from audit-checklist.md -- regenerate after checklist changes -->

# Design Decision Tables

> Path-scoped to `.tsx` files. These tables give concrete class lists for common UI decisions.
> Every "Use" value traces to `audit-checklist.md` or CLAUDE.md Design Decisions.
> When in doubt, choose the most conservative option (neutral gray, smallest spacing, no color).

---

## 1. Color Decisions

| Situation | Use | Don't Use (Common Mistakes) | Checklist ID |
|-----------|-----|----------------------------|--------------|
| Severity badge (Error/Warning/Info) in tables or badges | `bg-gray-100 text-gray-600 border-gray-200` (neutral) | Per-category colored badges (red/amber/blue) | C-05, C-27 |
| Domain label (MI, LB, BW, etc.) | `getDomainBadgeColor(d).text` + `text-[10px] font-semibold` (text only) | Dot badges, outline pills, bordered treatments | C-25 |
| Dose group in tables | `font-mono` plain text, use `getDoseLabel()` | Colored badge pills | C-23 |
| Dose group in charts | `buildDoseColorMap()` for series colors | Hardcoded hex values | C-23 |
| Dose label — default (axes, legends) | `getDoseLabel()` — full format with `mg/kg` | `doseAbbrev()`, raw numbers | — |
| Dose label — tight space (>6 groups, compact) | `shortDoseLabel()` — strips units | Full `mg/kg` that overflows | — |
| Dose label — matrix headers, grids | `doseAbbrev()` — single number/letter | Full labels in narrow columns | — |
| Dose label consistency | One format per chart — never mix within same axis/legend | Different formats on X axis vs legend | — |
| Sex in charts | `getSexColor()` for chart series only | `getSexColor()` in tables or context panel | C-24 |
| Evidence values (p-value, effect size) in grids | `text-muted-foreground` at rest; `ev` CSS class + `data-evidence` for hover color | `getPValueColor()` / `getEffectSizeColor()` in cell render | C-02, C-03 |
| Conclusion elements (NOAEL, target organ, tier dot) | Color at rest is correct (Tier 1 emphasis) | Suppressing color on conclusions | C-07, C-34 |
| Tier dot — Critical | `#DC2626` (red) | Any other red shade | C-26 |
| Tier dot — Notable | `#D97706` (amber) | Any other amber shade | C-26 |
| Tier dot — Observed | No dot | Any color | C-26 |
| Any categorical badge (fix status, review status, workflow state) | `bg-gray-100 text-gray-600 border-gray-200` | Per-category color mapping | C-05, C-27 |
| New hex color value | Must come from CSS vars, `severity-colors.ts`, `design-tokens.ts`, or Tailwind palette | Invented `#rrggbb` literals | C-10 |
| Color application method | Tailwind classes or CSS variables | `style={{ color: "..." }}` (exception: dynamic chart values) | C-11 |
| Links | `text-primary hover:underline` | Hardcoded `text-[#2083d5]` | C-12 |
| Severity grade in charts/matrix | `getSeverityGradeColor(grade)` cool-earth palette (always-on) | `getNeutralHeatColor()` (that's for signal scores) | — |
| Severity grade in ECharts series | `getSeverityHeatColor(avgSev)` for hex-only | Old palette (`#FFF9C4`-`#E57373`) | — |
| Heatmap cells (signal score) | Neutral `rgba(0,0,0,0.04)` at rest, color on hover only | Always-on color fill. Never severity palette. | C-22 |
| Histopath block | No `#DC2626`, no bg fills except neutral card, no TARGET badges | Red severity, inline conclusions, status colors | C-33 |
| Decision red per row | `#DC2626` at most once per table row | Multiple red elements in same row | C-31 |
| Context panel text emphasis | `font-semibold`, `font-medium`, `font-mono` | Colored text (`text-red-*`, `text-green-*`, etc.) Exception: tier dots, warning icons | C-04 |

---

## 2. Typography Decisions

| Situation | Use | Don't Use (Common Mistakes) | Checklist ID |
|-----------|-----|----------------------------|--------------|
| View header (tab-bar view) | `text-base font-semibold` | `text-2xl font-bold` (that's standalone only) | T-01a |
| View header (standalone page) | `text-2xl font-bold` (one per view max) | `text-base font-semibold` | T-01b |
| Section header (pane) | `text-sm font-semibold` | `text-base`, `font-bold` | T-02 |
| Section header (uppercase) | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Manual ALL CAPS or Title Case in source string | T-03 |
| Table header (compact grid) | `ty.tableHeader` (`text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`) | `text-xs`, `font-medium` | T-04 |
| Table header (spacious) | `text-xs font-medium text-muted-foreground` | `font-semibold`, `uppercase` | T-05 |
| Table cell text | `text-xs` | `text-sm`, `text-[13px]` in grids | T-06 |
| Rail header | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | `font-medium` (hard rule) | T-09 |
| `font-bold` usage | Standalone view page titles only (T-01b) | Section headers, badges, buttons, tab headers | T-07 |
| `font-mono` usage | Data values: p-values, effect sizes, IDs, domain codes, formatted numbers | Labels, descriptions, headers, buttons | T-08 |

---

## 3. Spacing Decisions

| Situation | Use | Don't Use (Common Mistakes) | Checklist ID |
|-----------|-----|----------------------------|--------------|
| Filter bar container | `px-4 py-2 gap-2` + `border-b bg-muted/30` | Custom padding, missing border | S-01 |
| Context panel pane content | `px-4 py-2` | `p-4`, `px-6`, `py-4` | S-02 |
| Compact table cells (analysis grids) | `px-2 py-1` | `px-3 py-2` (that's spacious) | S-03 |
| Spacious table cells (validation/landing) | `px-3 py-2` | `px-2 py-1` | S-04 |
| Badge padding | `px-1.5 py-0.5` | `px-2 py-1`, `p-1` | S-05 |
| Evidence panel background | `bg-muted/5` (hard rule) | `bg-muted/10`, `bg-white`, `bg-card` | S-06 |

---

## 4. Component Selection

| Situation | Use | Don't Use (Common Mistakes) | Checklist ID |
|-----------|-----|----------------------------|--------------|
| Tab bar (any view) | `h-0.5 bg-primary` underline active, `text-xs font-medium`, container `bg-muted/30` | Custom tab styling, different underline color | K-05 |
| Evidence/overview tab naming | "Evidence" | "Overview" (hard rule) | K-06 |
| Filter dropdowns (filter bar) | `<FilterSelect>` / `<FilterMultiSelect>` from `components/ui/` | Raw `<select>` elements | K-07 |
| Dose label display | `getDoseLabel()` / `<DoseLabel>` / `<DoseHeader>` from `dose-label-utils.ts` | Manual dose string formatting | — |
| P-value formatting | `formatPValue()` from `severity-colors.ts` | `toFixed()`, manual formatting | — |
| Effect size formatting | `formatEffectSize()` from `severity-colors.ts` | Manual `toFixed(2)` | — |
| Collapsible sections | `<CollapsiblePane>` from `components/analysis/panes/` | Custom accordion / disclosure | — |
| Charts with time series / dose-response | ECharts via `<EChartsWrapper>` | Raw SVG for standard charts | — |
| Charts needing custom layout (scatter, forest, heatmap) | Direct SVG (`BivarScatterChart`, `GroupForestPlot`, `OrganGroupedHeatmap`) | ECharts for highly custom layouts | — |
| Context panel back/forward | `< >` icon buttons | Breadcrumb navigation (hard rule) | A-09 |
| Self-labeling filter default | `"All {dimension}"` (e.g., "All domains") | Generic `"All types"` or bare noun | K-08 |
| Truncated text (>25 chars) | Add `title` tooltip | No tooltip | K-01 |
| Icon-only buttons | Add tooltip explaining action | No tooltip | K-02 |

---

## 5. Casing Decisions

| Situation | Use | Don't Use (Common Mistakes) | Checklist ID |
|-----------|-----|----------------------------|--------------|
| Default for all UI text | Sentence case | Title Case | X-01 |
| L1 headers, dialog titles, context menu actions | Title Case | Sentence case | X-02 |
| Section headers within panes, column headers, filter labels | Sentence case | Title Case | X-03 |
| Uppercase section headers | Source string in sentence case + CSS `uppercase tracking-wider` | Manual ALL CAPS or Title Case in source | X-04 |
| Organ system names | `titleCase()` from `severity-colors.ts` | Raw lowercase from data | X-06 |
| Clinical labels (ALT, AST, WBC, endpoint_label, severity) | Raw from data (preserves abbreviations) | `titleCase()` (would mangle ALT -> Alt) | X-07 |
| Tab bar labels | Same part of speech for all tabs in a bar | Mixed nouns and verbs | X-05 |

---

---

## 6. Split-Panel Layout

| Situation | Use | Don't Use (Common Mistakes) | Checklist ID |
|-----------|-----|----------------------------|--------------|
| Shared legend (applies to both panels) | Full-width header row above the split | Legend inside one panel only | A-11 |
| Per-panel title + legend | Title LEFT, panel-specific legend RIGHT, same line | Legend inline with title text (loses styling) | — |
| Panel without a title (but sibling has one) | Empty spacer div matching title row height | No spacer (content misaligns between panels) | A-11 |
| In-bar labels on patterned fills (ungraded, hatched) | White text + `paintOrder: stroke` with dark stroke for contrast | Dark text directly on pattern (illegible) | — |

## Fallback Protocol

When building a UI element that doesn't match any table row above:

1. **State which rows were considered** and why they don't apply
2. **Default to the most conservative option:** neutral gray (`bg-gray-100 text-gray-600 border-gray-200`), smallest standard spacing (`px-2 py-1`), no color, `text-xs`
3. **Flag with comment:** `// DESIGN-REVIEW: no table match for [element description]`
