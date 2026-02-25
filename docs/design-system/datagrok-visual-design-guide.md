# Datagrok Visual Design Guide

Comprehensive visual design system for Datagrok applications. Structural tokens (buttons, badges, typography, spacing, surfaces) are codified in `frontend/src/lib/design-tokens.ts`. Color-scale functions are in `frontend/src/lib/severity-colors.ts`. This document is the hex-value and rule reference.

> **Condensed 2026-02-09.** Full original: `datagrok-visual-design-guide-original.md`. Restore by copying it over this file if agent performance degrades.
> **Palette updated 2026-02-09.** Tokens aligned with `datagrok-ui-kit-figma-community` (white bg, Datagrok blue, steel borders).

---

## 0. Datagrok Platform Palette

Source: `pcc-design/datagrok-ui-kit-figma-community.pdf`. These are the raw Datagrok platform swatches. Not all are used in this app — included here as the reference palette for future decisions.

### 0.1 Steel

| Swatch | Hex | RGB |
|--------|-----|-----|
| steel-1 | `#ECEFF2` | 236, 239, 242 |
| steel-2 | `#D7DFE7` | 215, 223, 231 |
| steel-3 | `#B3BFCC` | 179, 191, 204 |
| steel-4 | `#7990A5` | 121, 144, 165 |
| steel-5 | `#4D607F` | 77, 96, 127 |

**App usage:** steel-1 → `--border-subtle`, steel-2 → `--border` / `--input`.

### 0.2 Grey

| Swatch | Hex | RGB |
|--------|-----|-----|
| grey-1 | `#F2F2F5` | 242, 242, 245 |
| grey-2 | `#DBDCDF` | 219, 220, 223 |
| grey-3 | `#B8BAC0` | 184, 186, 192 |
| grey-4 | `#9497A0` | 148, 151, 160 |
| grey-5 | `#717081` | 113, 112, 129 |
| grey-6 | `#4D5261` | 77, 82, 97 |

**App usage:** grey-1 → `--muted` / `--secondary`.

### 0.3 Warm Grey

| Swatch | Hex |
|--------|-----|
| warm-grey-1 | `#F7F6F4` |
| warm-grey-2 | `#DEDDDC` |
| warm-grey-3 | `#949492` |
| warm-grey-4 | `#4A4A49` |

### 0.4 Red

| Swatch | Hex |
|--------|-----|
| red-1 | `#FBE1E1` |
| red-3 | `#EB6767` |
| red-4 | `#763434` |

### 0.5 Green

| Swatch | Hex |
|--------|-----|
| green-1 | `#DCF3E7` |
| green-2 | `#3CB173` |
| green-3 | `#2B6344` |

**App usage:** green-2 → `--success`.

### 0.6 Orange

| Swatch | Hex |
|--------|-----|
| orange-1 | `#FFECDB` |
| orange-2 | `#F7A36A` |
| orange-3 | `#BB5125` |

**App usage:** orange-2 → `--warning`.

### 0.7 Blue (Primary)

| Swatch | Hex | Notes |
|--------|-----|-------|
| blue-1 | `#2083D5` | Datagrok primary action blue |
| blue-2 | `#3049C5` | Deeper accent (unused) |

**App usage:** blue-1 → `--primary`, `--ring`, `--info`, `--chart-1`, all link colors.

### 0.8 Beige

| Swatch | Hex |
|--------|-----|
| beige-1 | `#FDF1E5` |
| beige-2 | `#E4BACE` |

### 0.9 Status

| Swatch | Hex | Usage |
|--------|-----|-------|
| success-1 | `#0D6400` | Deep success (not used — too dark for UI text) |
| failure-2 | `#BB0000` | Failure / destructive |

**App usage:** failure-2 → `--destructive`.

### 0.10 Standard Chart Palette

Datagrok's default 20-color Tableau-derived chart palette:

| Name | Hex | Name | Hex |
|------|-----|------|-----|
| Blue | `#1F77B4` | Light-blue | (paired) |
| Orange | `#FFBB78` | Green | `#2CA02C` |
| Light-green | `#98DF8A` | Red | `#D62728` |
| Light-red | `#FF9896` | Purple | `#9467BD` |
| Light-purple | `#C5B0D5` | Brown | `#8C564B` |
| Light-brown | `#C49C94` | Pink | `#E377C2` |
| Light-pink | `#F7B6D2` | Gray | `#7F7F7F` |
| Light-gray | `#C7C7C7` | Yellow | `#BCBD22` |
| Light-yellow | `#DBDB8D` | Cyan | `#17BECF` |
| Light-cyan | `#9EDAE5` | | |

### 0.11 Traffic Light Palette

| Name | Hex |
|------|-----|
| Blue | `#73AFF5` |
| Orange | `#FFA500` |
| Red | `#FF5140` |
| Green | `#4FAF27` |
| Gray | `#D9D9D9` |

---

## 1. Color System — App Tokens

### 1.0 CSS Custom Properties

All defined in `frontend/src/index.css` `:root`. Consumed via Tailwind utilities (`bg-background`, `text-primary`, etc.) and `@theme inline` mapping.

**Core surfaces:**

| Token | Value | Notes |
|-------|-------|-------|
| `--background` | `#ffffff` | White — Datagrok native |
| `--foreground` | `#374151` | Tailwind gray-700 — balanced contrast (9.6:1) on white |
| `--card` | `#ffffff` | Card surfaces |
| `--card-foreground` | `#374151` | |
| `--popover` | `#ffffff` | Dropdown/tooltip surfaces |
| `--popover-foreground` | `#374151` | |

**Brand / interactive:**

| Token | Value | Notes |
|-------|-------|-------|
| `--primary` | `#2083d5` | Datagrok blue (kit blue-1) |
| `--primary-foreground` | `#ffffff` | White on primary |
| `--ring` | `#2083d5` | Focus ring = primary |
| `--accent` | `rgba(32,131,213,0.10)` | Selection highlight |
| `--accent-foreground` | `#374151` | |
| `--destructive` | `#bb0000` | Kit failure-2 |
| `--destructive-foreground` | `#bb0000` | |

**Neutral chrome:**

| Token | Value | Source |
|-------|-------|--------|
| `--secondary` | `#f2f2f5` | Kit grey-1 |
| `--secondary-foreground` | `#374151` | |
| `--muted` | `#f2f2f5` | Kit grey-1 |
| `--muted-foreground` | `#6b7280` | Cool steel grey |
| `--border` | `#d7dfe7` | Kit steel-2 |
| `--input` | `#d7dfe7` | Kit steel-2 |
| `--border-subtle` | `#eceff2` | Kit steel-1 |

**Selection / hover:**

| Token | Value |
|-------|-------|
| `--selection-bg` | `rgba(32,131,213,0.10)` |
| `--selection-border` | `#2083d5` |
| `--hover-bg` | `#f0f5fa` |

**Semantic status (kit palette):**

| Token | Value | Source |
|-------|-------|--------|
| `--success` | `#3cb173` | Kit green-2 |
| `--warning` | `#f7a36a` | Kit orange-2 |
| `--info` | `#2083d5` | = primary |

**Severity (app-specific, analysis views):**

| Token | Value |
|-------|-------|
| `--adverse-bg` | `rgba(239,68,68,0.08)` |
| `--adverse-text` | `#dc2626` |
| `--warning-bg` | `rgba(245,158,11,0.08)` |
| `--warning-text` | `#d97706` |
| `--normal-bg` | `rgba(34,197,94,0.08)` |
| `--normal-text` | `#16a34a` |

**Sidebar:**

| Token | Value |
|-------|-------|
| `--sidebar-background` | `#ffffff` |
| `--sidebar-foreground` | `#374151` |
| `--sidebar-primary` | `#2083d5` |
| `--sidebar-border` | `#eceff2` |
| `--sidebar-accent` | `rgba(32,131,213,0.10)` |

**Chart palette:**

| Token | Value |
|-------|-------|
| `--chart-1` | `#2083d5` |
| `--chart-2` | `#f28e2b` |
| `--chart-3` | `#59a14f` |
| `--chart-4` | `#e15759` |
| `--chart-5` | `#b07aa1` |

### 1.1 Conclusion-Tier Colors (analysis views only)

These hex values are used ONLY for **conclusion-level elements** — tier dots, NOAEL/LOAEL banners, target organ indicators. They are NOT used for categorical severity badges (Error/Warning/Info), which always use neutral gray (see §1.9).

| Tier | Hex | Usage |
|------|-----|-------|
| Critical | `#dc2626` | Tier dot, TARGET ORGAN badge, Critical flag |
| Notable | `#d97706` | Tier dot, qualifier/caveat accent |
| Observed | — | No dot, no color |
| Pass/Normal | `#16a34a` | Validation pass icon only |

**Categorical badges** (severity level, fix status, review status, workflow state): always `bg-gray-100 text-gray-600 border-gray-200`. See §1.9. The `status.*` tokens in `design-tokens.ts` enforce this.

### 1.2 P-Value Palette

Four-stop diverging scale. Functions: `getPValueColor()`, `formatPValue()` in `severity-colors.ts`.

| Threshold | Hex | Tailwind class |
|-----------|-----|----------------|
| p < 0.001 | `#D32F2F` | `text-red-600 font-semibold` |
| p < 0.01 | `#F57C00` | `text-red-500 font-medium` |
| p < 0.05 | `#FBC02D` | `text-amber-600 font-medium` |
| p < 0.1 | — | `text-amber-500` |
| p >= 0.1 | `#388E3C` | `text-muted-foreground` |

**Formatting:** p < 0.0001 → "<0.0001", p < 0.001 → 4dp, p < 0.01 → 3dp, else 2dp. Null → em dash. Always `font-mono`.

### 1.3 Signal Score Palette

Five-stop 0.0–1.0 scale. Function: `getSignalScoreColor()`, `getSignalScoreHeatmapColor()`.

| Range | Hex |
|-------|-----|
| 0.8–1.0 | `#D32F2F` |
| 0.6–0.8 | `#F57C00` |
| 0.4–0.6 | `#FBC02D` |
| 0.2–0.4 | `#81C784` |
| 0.0–0.2 | `#388E3C` |

**Grid cells:** bg = hex, white text if score >= 0.5, dark gray (`#374151`) if < 0.5. Format: `score.toFixed(2)` + stars (`***`/`**`/`*`, omit "ns").

**Neutral-at-rest:** cells neutral gray (`rgba(0,0,0,0.04)`) at rest, text `#1F2937`, `tabular-nums`. On hover: fill with score color. Cell outline: default `1px solid rgba(0,0,0,0.05)`, selected `2px solid #3b82f6`.

### 1.4 Severity Gradient

Sequential warm scale. Function: `getSeverityHeatColor()`.

| Grade | Hex | Label |
|-------|-----|-------|
| 1 | `#FFF9C4` | Minimal |
| 2 | `#FFE0B2` | Slight |
| 3 | `#FFB74D` | Moderate |
| 4 | `#FF8A65` | Marked |
| 5 | `#E57373` | Severe |

### 1.5 Dose Group Palette

Function: `getDoseGroupColor()`.

| Group | Hex (badge) | Hex (chart) |
|-------|-------------|-------------|
| Control (0) | `#6b7280` | `#1976D2` |
| Low (1) | `#3b82f6` | `#66BB6A` |
| Mid (2) | `#f59e0b` | `#FFA726` |
| High (3) | `#ef4444` | `#EF5350` |

Badge class: `badge.dose` from `design-tokens.ts`.

### 1.6 Sex Colors

Function: `getSexColor()`.

| Sex | Primary | Chart |
|-----|---------|-------|
| Male | `#1565C0` | `#3b82f6` |
| Female | `#C62828` | `#ec4899` |

Grids: `text-xs font-semibold` with primary hex. Charts: chart hex for stroke/fill.

### 1.7 Domain Colors

Functions: `getDomainBadgeColor()`, `getDomainDotColor()`.

| Domain | Badge bg/text | Dot hex |
|--------|--------------|---------|
| LB | `bg-blue-100` / `text-blue-700` | `#3B82F6` |
| BW | `bg-emerald-100` / `text-emerald-700` | `#10B981` |
| OM | `bg-purple-100` / `text-purple-700` | `#8B5CF6` |
| MI | `bg-rose-100` / `text-rose-700` | `#EC4899` |
| MA | `bg-orange-100` / `text-orange-700` | `#F59E0B` |
| CL | `bg-cyan-100` / `text-cyan-700` | `#22C55E` |
| DS | `bg-indigo-100` / `text-indigo-700` | `#6366F1` |
| FW | `bg-teal-100` / `text-teal-700` | `#14B8A6` |
| fallback | `bg-gray-100` / `text-gray-700` | `#9CA3AF` |

**Domain labels** are categorical identity and must never be color-coded. Render as neutral text: `text-[9px] font-semibold text-muted-foreground`. Never use colored text, dot badges, outline pills, or bordered treatments. (Hard rule — see CLAUDE.md.) The color table above is retained as reference for chart series only; domain text labels use neutral gray. Existing code using `getDomainBadgeColor()` for text should be migrated incrementally.

### 1.8 Categorical Chart Palettes

Two categorical palettes for different contexts. Functions in `severity-colors.ts`.

#### 1.8a In-App Categorical (Tableau 10 + 3 light pairs)

For scatter "color by" overlays in the app (organ system, domain, syndrome). Same color family as `--chart-1`…`--chart-5` and Datagrok default palette (§0.10) — coordinates with dose group, sex, and other app chart colors.

Functions: `getCategoricalChartColor()`, `getCategoricalChartColorMap()`, `getOrganColor()`.

| Index | Hex | Name | Organ system assignment |
|-------|-----|------|------------------------|
| 0 | `#1F77B4` | Blue | renal |
| 1 | `#FF7F0E` | Orange | reproductive |
| 2 | `#2CA02C` | Green | gastrointestinal |
| 3 | `#D62728` | Red | hematologic |
| 4 | `#9467BD` | Purple | endocrine |
| 5 | `#8C564B` | Brown | hepatic |
| 6 | `#E377C2` | Pink | cardiovascular |
| 7 | `#7F7F7F` | Gray | musculoskeletal |
| 8 | `#BCBD22` | Yellow-green | neurological |
| 9 | `#17BECF` | Cyan | respiratory |
| 10 | `#AEC7E8` | Light blue | ocular |
| 11 | `#FFBB78` | Light orange | integumentary |
| 12 | `#98DF8A` | Light green | general (systemic) |

**Usage rules:**
- `getCategoricalChartColorMap(categories)` for stable string → color assignment
- `getOrganColor(organSystem)` for the fixed organ system mapping above
- Wraps at 13 — sufficient for all organ systems; overflow uses hash-based fallback
- Never use this palette for dose groups, sex, severity, or p-value scales

#### 1.8b MS Office Median (reports, exports)

Warm, muted, earthy palette for non-app contexts: printed reports, standalone charts, exported figures. Does **not** coordinate with the Tableau-derived app chart colors — use only where the app palette is not present.

Constant: `MEDIAN_PALETTE` (16 colors).

| Index | Hex | Name |
|-------|-----|------|
| 0 | `#775F55` | Warm brown |
| 1 | `#94B6D2` | Steel blue |
| 2 | `#DD8047` | Burnt orange |
| 3 | `#A5AB81` | Sage green |
| 4 | `#D8B25C` | Gold |
| 5 | `#7BA79D` | Teal |
| 6 | `#968C8C` | Warm gray |
| 7 | `#F7B615` | Bright amber |
| 8 | `#704404` | Dark brown |
| 9 | `#EBDDC3` | Cream (dark stroke on white bg) |
| 10 | `#A2554A` | Brick red |
| 11 | `#8E6C8A` | Dusty mauve |
| 12 | `#545E8B` | Muted indigo |
| 13 | `#6B8C5E` | Moss green |
| 14 | `#C4786B` | Clay rose |
| 15 | `#486B5F` | Forest teal |

### 1.9 Validation Status Badges

Two independent status tracks for validation records. Badge base: `inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold`.

**ALL categorical badges use neutral gray:** `bg-gray-100 text-gray-600 border-gray-200`. This includes severity level (Error/Warning/Info), fix status, review status, and any other fixed classification. Severity is categorical — each rule has a fixed severity that does not vary with data. The text label alone communicates the category. Per §1.11 and CLAUDE.md hard rule, categorical identity NEVER gets per-category color.

### 1.10 Effect Size Scale

Function: `getEffectSizeColor()`.

| |d| threshold | Class |
|----------------|-------|
| >= 1.2 | `text-red-600 font-semibold` |
| >= 0.8 | `text-red-500 font-medium` |
| >= 0.5 | `text-amber-600` |
| >= 0.2 | `text-amber-500` |
| < 0.2 | `text-muted-foreground` |

Always `font-mono`, 2dp.

### 1.11 Color Philosophy — Signal-First Rendering

> **"Color is punctuation, not prose. Conclusions speak in color; evidence whispers in text."**
> **"If everything looks important, nothing is."**

#### Core hierarchy
**Visual hierarchy order: Position > Grouping > Typography > Color.** Position and grouping do the heavy lifting; color is a supporting tool.

#### Emphasis tiers
| Tier | Visibility | What belongs here |
|------|-----------|-------------------|
| Tier 1 (always colored) | Persistent at rest | TARGET ORGAN badge, Critical flag, tier dots, NOAEL banner |
| Tier 2 (visible, muted) | Visible but low-salience | "adverse" outline badge, direction arrows (gray), domain labels (neutral text) |
| Tier 3 (on interaction) | Hover/selection only | p-values, effect sizes, signal score cell fills |

#### Rules
1. **Conclusions in color, evidence in text.** NOAEL banners, target organ badges, tier dots use color at rest. Heatmap cells, p-values, effect sizes use color only on hover/selection.
2. **Neutral at rest.** Heatmap cells, evidence bars, domain badges are neutral gray at rest.
3. **Interaction-only evidence colors.** Signal score colors fill cells only on hover.
4. **Tier dots for severity.** Critical = red `#DC2626`, Notable = amber `#D97706`, Observed = no dot.
5. **Domain labels: neutral text only** (this app). `text-[9px] font-semibold text-muted-foreground`. Domain codes are categorical identity — never color-coded. Domain colors (§1.7) are retained for chart series only.
6. **Decision Bar is the visual anchor.** `border-l-2 border-l-blue-500 bg-blue-50/30` — only element with persistent accent at rest in Signals tab.
7. **One saturated color family per column at rest.** Everything else must be neutral, outlined, muted, or interaction-only.
8. **Color budget test.** Grayscale must still make sense. ≤10% saturated pixels at rest. Only conclusions visually "shout."
9. **Per-screen color budget.** 1 dominant color (status), 1 secondary accent (interaction/selection), unlimited neutrals.
10. **No repetition of decision red per row.** Status color does not appear more than once per row.
11. **Table density lint.** If >30% of rows contain red at rest → redesign needed.

#### Information hierarchy
Every derived information element belongs to exactly one category. Mixing categories in one visual unit is forbidden.

| Category | What it is | Example |
|----------|-----------|---------|
| Decision | Final, reportable conclusion | NOAEL, target organ status, pass/fail |
| Finding | Evidence-backed conclusion | "Compound is hepatotoxic at high dose" |
| Qualifier | Condition on a finding | "In females only", "At doses above LOAEL" |
| Caveat | Uncertainty or limitation | "Small sample size", "Single domain" |
| Evidence | Data supporting the above | p-values, effect sizes, signal scores |
| Context | Raw or exploratory data | Source tables, domain drill-downs |

#### Cognitive mode constraints
- **Exploration views:** No asserted conclusions by default. Charts and data are primary.
- **Conclusion/Hybrid views:** Conclusions explicitly stated; evidence supports but doesn't lead.
- **The system computes what it can** — don't make users derive conclusions from raw data.

---

## 2. Typography

All class strings: `ty.*` from `design-tokens.ts`.

| Role | Token | Class |
|------|-------|-------|
| Page title (L1) | `ty.pageTitle` | `text-2xl font-bold` |
| App title | `ty.appTitle` | `text-xl font-semibold tracking-tight` |
| Section header | `ty.sectionHeader` | `text-sm font-semibold` |
| Section header (upper) | `ty.sectionHeaderUpper` | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` |
| Table header | `ty.tableHeader` | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Table header (spacious) | `ty.tableHeaderSpacious` | `text-xs font-medium text-muted-foreground` |
| Body | `ty.body` | `text-sm` |
| Table cell | `ty.cell` | `text-xs` |
| Caption | `ty.caption` | `text-xs text-muted-foreground` |
| Mono data | `ty.mono` | `font-mono text-[11px]` |
| Mono small | `ty.monoSm` | `font-mono text-xs` |
| Micro | `ty.micro` | `text-[9px] font-medium` |

**Weight rules:** `font-bold` = page titles only. `font-semibold` = section headers, badge text, highlighted values. `font-medium` = table headers, filter labels, buttons. `font-normal` = default.

**Monospace (`font-mono`):** p-values, effect sizes, rule/issue/subject IDs, domain codes, any formatted number with `tabular-nums`. NOT for labels, descriptions, headers, buttons.

### 2.1 Context Panel Typography Hierarchy

Font sizes in context panel panes encode **information hierarchy**, not just visual preference. Each tier is deliberately sized relative to its neighbors. Changing a size without understanding the tier relationship destroys the hierarchy.

| Tier | Size | Ratio | Role | Examples |
|------|------|-------|------|----------|
| Control | `text-xs` (12px) | 1.0× | Interactive elements the user acts on | SettingsRow label, FilterSelect dropdown, setting names |
| Supporting | `text-[10px]` (10px) | 0.83× | Values, explanatory text, secondary controls | Auto-detected values, method descriptions, override checkbox/input, explanatory notes below settings |
| Micro | `text-[9px]` (9px) | 0.75× | Categorical identity, tertiary metadata | Domain labels, tier pills, badge text |

**Spacing proportionality rules:**
- Vertical padding should be proportional to the text size it surrounds. `py-1` (8px) is balanced for `text-xs` (12px) but generous for `text-[10px]` (10px). Use `py-0.5` (4px) for supporting-tier text.
- Explanatory text below a setting uses `mb-0.5` (2px) — just enough to separate from the next setting without creating a visual gap equal to the setting row itself.
- Indented sub-controls (e.g., override inputs) use `ml-5` (20px) — approximately 2× the supporting-tier line height, signaling visual subordination.

---

## 3. Spacing

All class strings: `sp.*` from `design-tokens.ts`. See token file for full list.

Key conventions: filter bar `px-4 py-2 gap-2`, context panel panes `px-4 py-2`, compact table cells `px-2 py-1`, spacious cells `px-3 py-2`, badges `px-1.5 py-0.5`, tier pills `px-2 py-0.5`.

**Gap standards:** filter controls `gap-2`/`gap-3`, charts `gap-4`, vertical sections `space-y-4`, inline icon+text `gap-1`/`gap-1.5`, button groups `gap-2`.

**Border conventions:** section divider `border-b`, table rows `border-b` (dashed for pairwise detail), cards `rounded-md border`, badges `rounded-sm border`, drop zones `border-2 border-dashed border-muted-foreground/25`, selected card `border-blue-500`, active tab `h-0.5 bg-primary` underline.

---

## 4. Components

Class strings: `btn.*`, `badge.*`, `tbl.*`, `pane.*`, `menu.*`, `surface.*`, `emptyState.*`, `link.*` from `design-tokens.ts`. See token file for exact values.

### 4.1 Filter Controls

**Component:** `<FilterSelect>` from `@/components/ui/FilterBar`. Token: `filter.select`.

**Style:** Muted pill — `rounded-full bg-muted/50 px-2 py-0.5 text-xs cursor-pointer focus:outline-none`. Native `<select>` with browser chevron. No custom icons, no borders.

**When to use:** All filter bar dropdowns in analysis views. Form selects (annotation forms, override editors) keep their bordered style (`rounded border bg-background`).

**Naming rules — two patterns:**

1. **Labeled filters** — wrapped in `<label>` with external text (e.g., `Sex [All▾]`). The label names the dimension; the default option can be just `"All"`.

2. **Self-labeling filters** — no external label; the default option IS the label. Default must name the dimension: `"All {dimension}"` — specific enough that a user understands what's being filtered without any surrounding context.

| Pattern | Default option | Example options |
|---------|---------------|-----------------|
| Labeled | `All` | `Male`, `Female` |
| Self-labeling | `All sexes` | `Male`, `Female` |
| Self-labeling | `All data types` | `Continuous`, `Categorical` |
| Self-labeling | `All domains` | `LB`, `BW`, `MI` |
| Self-labeling | `All subjects` | `SUB001`, `SUB002` |
| Self-labeling | `All fix status` | `Not fixed`, `Auto-fixed` |

**Naming principles:**
- Default option always starts with `"All"` — never a bare category name as the unfiltered state (e.g., `"Subject"` alone is ambiguous — is it a label or a selected value?)
- Dimension noun must match the data concept, not a generic term (`"All data types"` not `"All types"`)
- Non-default options use sentence case
- Abbreviations acceptable only when universally understood in context (`TR` for treatment-related in a tox app)

**Companion components:** `<FilterBar>` (container: `border-b bg-muted/30 px-4 py-2 gap-2`), `<FilterBarCount>` (right-aligned record count: `text-[10px] text-muted-foreground`).

### 4.2 Cell Alignment Rules

- Icons before text: position absolutely (`absolute left-1 top-1/2 -translate-y-1/2`) so text aligns with header.
- Centered icons: wrap in `flex items-center justify-center`.

### 4.3 Tooltip Behavior

Always add tooltips for: truncated text (25-char cap), icon-only buttons, heatmap cells, abbreviated headers, disabled buttons (explain why). Content: `text-xs`, max 2-3 lines.

### 4.4 Below-List Links

When a link follows a `list-disc pl-4` bullet list, indent `pl-4` so link text aligns with bullet text.

### 4.5 Compact Table Text Overflow

In dense/compact tables (cell text `text-[11px]` or smaller), **never wrap text**. Instead: truncate with CSS ellipsis (`truncate` class = `overflow-hidden text-overflow-ellipsis whitespace-nowrap`) and expose the full value via a `title` attribute tooltip on hover. This keeps row height uniform at a single line and eliminates ragged multi-line cells that break scan rhythm.

- The table container or `<td>` must constrain width (use `tableLayout: "fixed"` with percentage `w-[…%]` on `<th>` columns).
- The truncating element needs `overflow-hidden` on itself or its parent `<td>` (use `block truncate` on `<span>`, or `overflow-hidden` on `<td>`).
- Always provide `title={fullText}` so the untruncated value is accessible.

### 4.6 Boolean Columns

Boolean columns use a **centered glyph** (`✓` for true, empty for false) instead of repeating a text label in every cell. The column header names the attribute; the cell shows only presence or absence. This saves horizontal space and reduces visual noise.

- Header: descriptive name in standard table-header casing (e.g., "Dose-driven").
- True cell: `✓` centered, `text-muted-foreground`, `cursor-pointer` + tooltip if clickable.
- False cell: empty (no glyph, no dash, no "—").

---

## 5. Casing Rules

### Sentence case (default)
Buttons, column headers, section headers (L2+), dropdowns, descriptions, tooltips, placeholders, errors, status text, filter labels.

### Title Case (exceptions only)
L1 page/view headers, dialog titles, context menu action labels, product names.

### UPPERCASE (narrow)
Domain codes (LB, BW), SEND variables (USUBJID), buttons OK/SAVE/RUN. Section headers render uppercase via `uppercase tracking-wider` CSS — source text is sentence case.

### Never Title Case
Section headers within panes, table column headers, filter labels, form field labels, dropdown options, descriptions.

### Part-of-Speech Consistency
Labels in visible sets (tab bars, segmented controls, pill groups) must use the same part of speech. If one is a noun, all must be nouns. "Evidence / Metrics / Hypotheses" (correct) not "Evidence / Metrics / Explore" (verb in noun set).

---

## 6. Charts

### Recharts (interactive)
Container: `<ResponsiveContainer width="100%" height={200}>`. Grid: `strokeDasharray="3 3" stroke="#e5e7eb"`. Axes: tick fontSize 10. Lines: `type="monotone" strokeWidth={2}` dots `r={4}` `connectNulls`. Error bars: `width={4} strokeWidth={1}`, sex-colored. Tooltip: `fontSize: 11`.

**Bar charts:** Y-axis `[0, 1]` for incidence. Tooltip as percentage.

**Sex faceting:** `flex gap-4`, one chart per sex `flex-1`, sub-header `text-center text-[10px] font-medium` colored by sex.

### Heatmap (custom CSS grid)
Grid: `grid-template-columns: 180px repeat({cols}, 70px)`. Row headers: sticky left `z-10 bg-background`, `text-[11px]`, 180px, truncated + tooltip.

---

## 7. Layout Dimensions

See `layout.*` from `design-tokens.ts`: toolbox 260px, context panel 280px, center `flex-1`. Master-detail split: `flex-[4]` / `flex-[6]` with `border-b bg-muted/30 px-4 py-2` divider.

**Grid column widths:** endpoint 200-400px, identifiers 80-110px, short codes 40-70px, numbers 60-70px, score badges 70px, status 90-110px, booleans 30px, actions 8px.
