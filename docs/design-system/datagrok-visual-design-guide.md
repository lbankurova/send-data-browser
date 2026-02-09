# Datagrok Visual Design Guide

Comprehensive visual design system for Datagrok applications. Structural tokens (buttons, badges, typography, spacing, surfaces) are codified in `frontend/src/lib/design-tokens.ts`. Color-scale functions are in `frontend/src/lib/severity-colors.ts`. This document is the hex-value and rule reference.

> **Condensed 2026-02-09.** Full original: `datagrok-visual-design-guide-original.md`. Restore by copying it over this file if agent performance degrades.

---

## 1. Color System

### 1.1 Semantic Colors

| Semantic | Hex | Usage |
|----------|-----|-------|
| Error / Critical | `#dc2626` | Validation errors, critical findings, destructive actions |
| Warning / Notable | `#d97706` | Warnings, review-recommended items |
| Info / Observed | `#2563eb` | Informational messages, best-practice suggestions |
| Success / Pass | `#16a34a` | Passed validation, completed status |

Badge rendering: `status.error` / `.warning` / `.info` / `.success` from `design-tokens.ts`.

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

**Domain labels** are always plain colored text: `getDomainBadgeColor(d).text` + `text-[9px] font-semibold`. Never dot badges, outline pills, or bordered treatments. (Hard rule — see CLAUDE.md.)

### 1.8 Effect Size Scale

Function: `getEffectSizeColor()`.

| |d| threshold | Class |
|----------------|-------|
| >= 1.2 | `text-red-600 font-semibold` |
| >= 0.8 | `text-red-500 font-medium` |
| >= 0.5 | `text-amber-600` |
| >= 0.2 | `text-amber-500` |
| < 0.2 | `text-muted-foreground` |

Always `font-mono`, 2dp.

### 1.9 Color Philosophy — Signal-First Rendering

> **"Color is punctuation, not prose. Conclusions speak in color; evidence whispers in text."**

1. **Conclusions in color, evidence in text.** NOAEL banners, target organ badges, tier dots use color at rest. Heatmap cells, p-values, effect sizes use color only on hover/selection.
2. **Neutral at rest.** Heatmap cells, evidence bars, domain badges are neutral gray at rest.
3. **Interaction-only evidence colors.** Signal score colors fill cells only on hover.
4. **Tier dots for severity.** Critical = red `#DC2626`, Notable = amber `#D97706`, Observed = no dot.
5. **Domain identity dots, not filled badges.** 1.5px colored dot + outline border in rails. See `badge.domainDot`.
6. **Decision Bar is the visual anchor.** `border-l-2 border-l-blue-500 bg-blue-50/30` — only element with persistent accent at rest in Signals tab.

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

---

## 3. Spacing

All class strings: `sp.*` from `design-tokens.ts`. See token file for full list.

Key conventions: filter bar `px-4 py-2 gap-2`, context panel panes `px-4 py-2`, compact table cells `px-2 py-1`, spacious cells `px-3 py-2`, badges `px-1.5 py-0.5`, tier pills `px-2 py-0.5`.

**Gap standards:** filter controls `gap-2`/`gap-3`, charts `gap-4`, vertical sections `space-y-4`, inline icon+text `gap-1`/`gap-1.5`, button groups `gap-2`.

**Border conventions:** section divider `border-b`, table rows `border-b` (dashed for pairwise detail), cards `rounded-md border`, badges `rounded-sm border`, drop zones `border-2 border-dashed border-muted-foreground/25`, selected card `border-blue-500`, active tab `h-0.5 bg-primary` underline.

---

## 4. Components

Class strings: `btn.*`, `badge.*`, `tbl.*`, `pane.*`, `menu.*`, `surface.*`, `emptyState.*`, `link.*` from `design-tokens.ts`. See token file for exact values.

### 4.1 Cell Alignment Rules

- Icons before text: position absolutely (`absolute left-1 top-1/2 -translate-y-1/2`) so text aligns with header.
- Centered icons: wrap in `flex items-center justify-center`.

### 4.2 Tooltip Behavior

Always add tooltips for: truncated text (25-char cap), icon-only buttons, heatmap cells, abbreviated headers, disabled buttons (explain why). Content: `text-xs`, max 2-3 lines.

### 4.3 Below-List Links

When a link follows a `list-disc pl-4` bullet list, indent `pl-4` so link text aligns with bullet text.

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
