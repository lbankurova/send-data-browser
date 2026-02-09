# Datagrok Visual Design Guide

A comprehensive visual design system for Datagrok applications. All values are extracted from the SEND Data Browser prototype and generalized for reuse across any domain. Use this as a reference when building new views or auditing existing ones.

---

## 1. Color System

### 1.1 Semantic Colors (Status Indicators)

Use these for validation severity, system status, and feedback messages.

| Semantic | Hex | Usage |
|----------|-----|-------|
| Error / Critical | `#dc2626` | Validation errors, critical findings, destructive actions |
| Warning / Notable | `#d97706` | Warnings, review-recommended items, cautionary flags |
| Info / Observed | `#2563eb` | Informational messages, best-practice suggestions |
| Success / Pass | `#16a34a` | Passed validation, completed status, approved items |

**Badge rendering pattern:**

| Severity | Background | Text | Border |
|----------|-----------|------|--------|
| Error | `bg-red-100` | `text-red-800` | `border-red-200` |
| Warning | `bg-amber-100` | `text-amber-800` | `border-amber-200` |
| Info | `bg-blue-100` | `text-blue-800` | `border-blue-200` |
| Success | `bg-green-100` | `text-green-800` | `border-green-200` |

Badge base class: `inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold`

---

### 1.2 Statistical Significance Palette (P-Values)

A four-stop diverging scale from highly significant (red) to not significant (green). Use for any p-value display: grid cells, chart annotations, context panel metrics.

| Threshold | Hex | Tailwind text class | Label |
|-----------|-----|---------------------|-------|
| p < 0.001 | `#D32F2F` | `text-red-600 font-semibold` | Highly significant |
| p < 0.01 | `#F57C00` | `text-red-500 font-medium` | Very significant |
| p < 0.05 | `#FBC02D` | `text-amber-600 font-medium` | Significant |
| p >= 0.05 | `#388E3C` | `text-muted-foreground` | Not significant |

**Extended p-value text classes (for finer granularity):**

| Threshold | Class |
|-----------|-------|
| p < 0.001 | `text-red-600 font-semibold` |
| p < 0.01 | `text-red-500 font-medium` |
| p < 0.05 | `text-amber-600 font-medium` |
| p < 0.1 | `text-amber-500` |
| p >= 0.1 | `text-muted-foreground` |

**P-value formatting rules:**

| Range | Format |
|-------|--------|
| p < 0.0001 | "<0.0001" |
| p < 0.001 | 4 decimal places |
| p < 0.01 | 3 decimal places |
| p >= 0.01 | 2 decimal places |
| null / missing | em dash (--) |

Always render p-values in `font-mono`.

---

### 1.3 Signal Score Palette

A five-stop scale for composite scores on a 0.0-1.0 range. Use for signal scores, evidence scores, confidence scores, or any normalized 0-1 metric.

| Range | Hex | Description |
|-------|-----|-------------|
| 0.8 -- 1.0 | `#D32F2F` | Strong signal / high confidence |
| 0.6 -- 0.8 | `#F57C00` | Moderate-high signal |
| 0.4 -- 0.6 | `#FBC02D` | Moderate signal |
| 0.2 -- 0.4 | `#81C784` | Weak signal |
| 0.0 -- 0.2 | `#388E3C` | No/minimal signal |

**Usage in grid cells:**
- Background: the hex color from the scale above.
- Text: white (`#FFFFFF`) when score >= 0.5, dark gray (`#374151`) when score < 0.5.
- Format: `{score.toFixed(2)}` plus significance stars if applicable (`***` / `**` / `*`, omit "ns").

**Neutral-at-rest rendering:**
- Heatmap cells render with neutral gray backgrounds at rest (`rgba(0,0,0,0.04)` for data, `rgba(0,0,0,0.02)` for empty)
- Text color at rest: `#1F2937` (gray-800). Number alignment: `tabular-nums`
- On hover: cell fills with the signal score color from the table above
- On hover with score >= 0.5: text flips to white (`#FFFFFF`)
- Cell outline default: `1px solid rgba(0,0,0,0.05)`
- Cell outline selected: `2px solid #3b82f6` (blue-500)
- This follows the color philosophy: "Conclusions speak in color; evidence whispers in text." Evidence-strength colors appear only on interaction.

---

### 1.4 Severity Gradient

A five-stop sequential warm scale from minimal (light yellow) to severe (red). Use for pathology severity, toxicity grades, or any ordinal severity measure.

| Grade | Hex | Label |
|-------|-----|-------|
| 1 (minimal) | `#FFF9C4` | Minimal |
| 2 (slight) | `#FFE0B2` | Slight |
| 3 (moderate) | `#FFB74D` | Moderate |
| 4 (marked) | `#FF8A65` | Marked |
| 5 (severe) | `#E57373` | Severe |

---

### 1.5 Dose Group Palette

A four-color qualitative scale for dose levels. Use for dose-level badges, chart series colors, and group comparisons.

| Group | Hex | Tailwind class |
|-------|-----|----------------|
| Control (dose 0) | `#1976D2` | (custom) |
| Low (dose 1) | `#66BB6A` | (custom) |
| Mid (dose 2) | `#FFA726` | (custom) |
| High (dose 3) | `#EF5350` | (custom) |

**Alternate dose badge colors (used in grid badges):**

| Level | Hex | Usage |
|-------|-----|-------|
| 0 (control) | `#6b7280` (gray-500) | Gray badge, white text |
| 1 (low) | `#3b82f6` (blue-500) | Blue badge, white text |
| 2 (mid) | `#f59e0b` (amber-500) | Amber badge, white text |
| 3 (high) | `#ef4444` (red-500) | Red badge, white text |

Badge class: `rounded px-1.5 py-0.5 text-[10px] font-medium text-white`

---

### 1.6 Sex Differentiation Colors

| Sex | Hex (primary) | Hex (chart) | Usage |
|-----|---------------|-------------|-------|
| Male (M) | `#1565C0` | `#3b82f6` (blue-500) | Grid text, badge text, chart lines |
| Female (F) | `#C62828` | `#ec4899` (pink-500) | Grid text, badge text, chart lines |

In grids: `text-xs font-semibold` with the primary hex as text color.
In charts (Recharts): use the chart hex for stroke/fill. Chart sub-headers use the chart hex for `text-center text-[10px] font-medium`.

---

### 1.7 Domain Category Colors

Use for domain badges in grids. Each scientific domain gets a distinct hue.

| Domain | Background | Text |
|--------|-----------|------|
| LB (Laboratory) | `bg-blue-100` | `text-blue-700` |
| BW (Body Weight) | `bg-emerald-100` | `text-emerald-700` |
| OM (Organ Measurements) | `bg-purple-100` | `text-purple-700` |
| MI (Microscopic) | `bg-rose-100` | `text-rose-700` |
| MA (Macroscopic) | `bg-orange-100` | `text-orange-700` |
| CL (Clinical Observations) | `bg-cyan-100` | `text-cyan-700` |
| DS (Disposition) | `bg-indigo-100` | `text-indigo-700` |
| FW (Food/Water) | `bg-teal-100` | `text-teal-700` |
| Other / fallback | `bg-gray-100` | `text-gray-700` |

Badge class: `rounded px-1.5 py-0.5 text-[10px] font-medium`

**Dot-only rendering (preferred in rails and compact layouts):**

Use `getDomainDotColor()` from `severity-colors.ts` for a small colored identity dot.

| Domain | Dot hex |
|--------|---------|
| BW | `#10B981` |
| LB | `#3B82F6` |
| MA | `#F59E0B` |
| MI | `#EC4899` |
| OM | `#8B5CF6` |
| CL | `#22C55E` |
| DS | `#6366F1` |
| FW | `#14B8A6` |
| fallback | `#9CA3AF` |

Dot+outline badge class: `inline-flex items-center gap-1 rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70` with `<span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getDomainDotColor(d) }} />`

---

### 1.8 Effect Size Color Scale

For Cohen's d or similar effect size metrics.

| Threshold | Class |
|-----------|-------|
| |d| >= 1.2 | `text-red-600 font-semibold` |
| |d| >= 0.8 | `text-red-500 font-medium` |
| |d| >= 0.5 | `text-amber-600` |
| |d| >= 0.2 | `text-amber-500` |
| |d| < 0.2 | `text-muted-foreground` |

Always render effect sizes in `font-mono` with 2 decimal places.

---

### 1.9 Background / Surface Hierarchy

| Surface | Class / Value | Usage |
|---------|--------------|-------|
| Page background | `bg-background` | App shell, main content area |
| Card / elevated surface | `bg-card` | Hero sections, study cards, elevated panels |
| Muted surface | `bg-muted/30` or `bg-muted/50` | Filter bars, table headers, divider bars |
| Header row background | `#f8f8f8` | Table header rows (hardcoded for consistency) |
| Hover state | `bg-accent/30` or `bg-accent/50` | Row hover, button hover |
| Selected state | `bg-accent` | Selected rows, active items |
| Selected emphasis | `bg-blue-50/50` + `border-blue-500` | Selected cards (Findings mode) |

---

### 1.10 Review Status Colors

| Status | Background | Text | Border |
|--------|-----------|------|--------|
| Not reviewed | `bg-gray-100` | `text-gray-600` | `border-gray-200` |
| Accepted | `bg-green-100` | `text-green-800` | `border-green-200` |
| Flagged | `bg-red-100` | `text-red-800` | `border-red-200` |
| Resolved | `bg-blue-100` | `text-blue-800` | `border-blue-200` |

Status count text colors (in progress bars):
- Not reviewed: `text-gray-500`
- Accepted: `text-green-700`
- Flagged: `text-red-700`
- Resolved: `text-blue-700`

---

### 1.11 Color Philosophy — Signal-First Rendering

> **"Color is punctuation, not prose. Conclusions speak in color; evidence whispers in text."**

Six rules govern color usage in the SEND Data Browser:

1. **Conclusions in color, evidence in text.** NOAEL banners, target organ badges, and tier dots use color at rest. Heatmap cells, p-values, and effect sizes use color only on hover or selection.
2. **Neutral at rest.** Heatmap cells, evidence bars, and domain badges are neutral gray at rest. Color appears on interaction (hover, click) to avoid visual overload.
3. **Interaction-only evidence colors.** Signal score colors (§1.3) fill cells only on hover. Stars and numbers stay visible in neutral text. Selected cells get a blue outline, not a color fill.
4. **Tier dots for severity.** Organ rail items show a small dot for Critical (red `#DC2626`) or Notable (amber `#D97706`). Observed tier gets no dot — absence of color is signal.
5. **Domain identity dots, not filled badges.** In rails and compact layouts, domains use a 1.5px colored dot + outline border, not a filled background badge. See §1.7 "Dot-only rendering".
6. **Decision Bar is the visual anchor.** The NOAEL Decision Bar uses `border-l-2 border-l-blue-500 bg-blue-50/30` to draw the eye. It is the only element with a persistent color accent at rest in the Signals tab.

---

## 2. Typography

### 2.1 Size Scale

| Role | Size | Weight | Class |
|------|------|--------|-------|
| Page title (L1) | `text-2xl` | `font-bold` | `text-2xl font-bold` |
| App title | `text-xl` | `font-semibold tracking-tight` | `text-xl font-semibold tracking-tight` |
| Section header (primary) | `text-sm` | `font-semibold` | `text-sm font-semibold` |
| Section header (uppercase) | `text-xs` | `font-semibold uppercase tracking-wider` | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` |
| Table header | `text-xs` or `text-[10px]` | `font-medium` or `font-semibold` | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Body text | `text-sm` | `font-normal` | `text-sm` |
| Table cell text | `text-xs` | `font-normal` | `text-xs` |
| Caption / label | `text-xs` | `font-normal` | `text-xs text-muted-foreground` |
| Tiny text | `text-[10px]` or `text-[11px]` | varies | `text-[10px]` or `text-[11px]` |
| Micro text (tier pills) | `text-[9px]` | `font-medium` | `text-[9px] font-medium` |

### 2.2 Weight Conventions

| Weight | Usage |
|--------|-------|
| `font-bold` | Page titles only |
| `font-semibold` | Section headers, context panel endpoint labels, badge text, highlighted values |
| `font-medium` | Table headers, filter labels, moderately significant values, button text |
| `font-normal` (default) | Body text, table cells, descriptions |

### 2.3 Monospace for Data Values

Use `font-mono` for:
- P-values: `font-mono text-[11px]`
- Effect sizes: `font-mono text-[11px]`
- Rule IDs: `font-mono text-xs`
- Issue IDs: `font-mono text-xs`
- Subject IDs: `font-mono text-xs`
- Domain codes: `font-mono text-xs`
- Any numeric data value displayed as a formatted string
- Tabular numbers: add `tabular-nums` for columns of aligned numbers (subjects, dates)

Do NOT use `font-mono` for: labels, descriptions, section headers, button text, or dropdown options.

---

## 3. Spacing

### 3.1 Padding Conventions

| Element | Padding |
|---------|---------|
| Main content area | `p-6` (Details tab), `px-4 py-2` (filter bars) |
| Landing page sections | `px-8 py-6` (studies), `px-8 py-8` (hero), `px-8 py-4` (import) |
| Context panel header | `px-4 py-3` |
| Context panel pane content | `px-4 py-2` (typical, via CollapsiblePane) |
| Table cells (grids) | `px-2 py-1` (compact grids), `px-3 py-2` (spacious grids like validation) |
| Table header cells | `px-2 py-1.5` (compact), `px-3 py-2.5` (spacious) |
| Filter bar | `px-4 py-2` |
| Cards | `p-3` (compact cards like review flag cards) |
| Divider bar | `px-4 py-2` |
| Badges / pills | `px-1.5 py-0.5` (standard), `px-2 py-0.5` (domain chips), `px-2.5 py-0.5` (filter pills) |

### 3.2 Gap Standards

| Context | Gap |
|---------|-----|
| Filter bar controls | `gap-2` or `gap-3` |
| Side-by-side charts | `gap-4` |
| Vertical section spacing | `space-y-4` |
| Inline items (icon + text) | `gap-1` or `gap-1.5` |
| Button groups | `gap-2` |
| Feature list items | `space-y-0.5` |

### 3.3 Border Conventions

| Element | Border |
|---------|--------|
| Section divider | `border-b` |
| Table row divider | `border-b` (solid for primary rows), `border-b border-dashed` (for pairwise detail rows) |
| Cards and tables | `rounded-md border` |
| Badges | `rounded-sm border` (severity badges), `rounded` (score badges), `rounded-full` (tier pills) |
| Drop zones | `border-2 border-dashed border-muted-foreground/25` |
| Selected card | `border-blue-500` |
| Hovered card | `border-blue-300 shadow-sm` |
| Active tab indicator | `h-0.5 bg-primary` underline |

---

## 4. Component Conventions

### 4.1 Button Hierarchy

| Level | Class | Usage |
|-------|-------|-------|
| Primary (big) | `bg-primary text-primary-foreground` via `ui.bigButton()` | Primary page action, single per view |
| Primary (small) | `rounded bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase text-primary-foreground hover:bg-primary/90` | Context panel actions (APPLY FIX, SAVE) |
| Secondary / outlined | `rounded border px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground hover:bg-muted/50` | Secondary actions (DISMISS) |
| Ghost / text | `rounded border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50` | Tertiary actions (Flag for review) |
| Danger | `rounded bg-red-600 px-2.5 py-1 text-[10px] font-semibold uppercase text-white hover:bg-red-700` | Destructive actions (Delete) |
| Disabled | Add `opacity-50 cursor-not-allowed` | Any button in disabled state |

### 4.2 Badge / Pill Styling

**Score badge (colored background + white text):**
`rounded px-1.5 py-0.5 text-xs font-semibold text-white` with background from the relevant color scale.

**Category badge (light background + dark text):**
`rounded px-1.5 py-0.5 text-[10px] font-medium` with bg/text from the domain color table.

**Severity badge:**
`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold` with colors from the severity badge table.

**Tier filter pills:**
`rounded-full px-2 py-0.5 text-[9px] font-medium` -- full opacity when active, `opacity-30` when inactive. Clickable to toggle.

**Domain chips (on study details):**
`rounded-md bg-muted px-2 py-0.5 font-mono text-xs` with `hover:bg-primary/20 transition-colors`.

### 4.3 Table Header Styling

Two patterns depending on context:

**Compact analysis grids:**
- Header row: `bg-muted/50 border-b`
- Header cells: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`
- Sortable headers: `cursor-pointer hover:bg-accent/50` with sort indicators (`▲` / `▼` or ` ↑` / ` ↓`)

**Spacious tables (validation, landing page):**
- Header row: `border-b`, background `#f8f8f8`
- Header cells: `px-3 py-2.5 text-xs font-medium text-muted-foreground`
- Sortable headers: same hover pattern

### 4.4 Collapsible Pane Pattern

Used for context panel sections and import sections.

**Context panel pane (CollapsiblePane):**
- Header: clickable, `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Chevron: rotates 90 degrees when expanded
- Content: lazy-rendered on first expand
- Default state: specified per pane (insights=open, statistics=open, annotations=closed or open depending on view, navigation=closed)

**Standalone collapsible (import section):**
- Toggle: `flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground`
- Chevron: `ChevronRight h-3 w-3`, rotates when open
- Content: `mt-4 space-y-4`

### 4.5 Status Indicators

**Dot indicators (inline with text):**
`inline-block h-2 w-2 rounded-full` with the semantic color as background.

**Validation icons:**
| Status | Icon | Color |
|--------|------|-------|
| Pass | Checkmark | `#16a34a` |
| Warnings | Triangle alert | `#d97706` |
| Fail | X | `#dc2626` |
| Not run | em dash | `text-muted-foreground` |

**Direction arrows (for trend indicators):**
- Up: arrow up symbol, colored (typically red for adverse direction)
- Down: arrow down symbol, colored
- No change: em dash, muted

### 4.6 Tooltip Behavior

- Bind via `ui.tooltip.bind(element, content)` in Datagrok.
- In HTML/React: use `title` attribute for simple text, custom tooltip component for rich content.
- Always add tooltips for:
  - Truncated text (endpoint labels capped at 25 chars)
  - Icon-only buttons (the icon is not self-explanatory)
  - Heatmap cells ("endpoint @ dose: score=0.85 (***)")
  - Abbreviated column headers
  - Disabled buttons (explain why: "Import not available in prototype")
- Tooltip content: `text-xs`, max 2-3 lines.

### 4.7 Empty States

Every interactive area must have an explicit empty state. Never show a blank area.

| Context | Message | Styling |
|---------|---------|---------|
| No selection | "Select a [item type] to view details." | `p-4 text-xs text-muted-foreground` |
| No filter matches | "No [items] match current filters" | `text-sm text-muted-foreground`, centered |
| No data loaded | Loading spinner + "Loading [description]..." | Centered `Loader2` animate-spin |
| Error state | Red box with error message and remediation instructions | `rounded border border-red-200 bg-red-50 p-4` |
| Truncated list | "Showing first N of M rows. Use filters to narrow results." | `p-2 text-center text-[10px] text-muted-foreground` |

### 4.8 Progress Bar

- Track: `h-1 w-full rounded-full bg-gray-200`
- Fill: `bg-green-500` with width as percentage
- Label above: "N of M reviewed" + "N%" in `text-[10px] text-muted-foreground`
- Counts below: status counts with colored text (see review status colors)

### 4.9 Context Menu (Right-Click Popup)

- Container: `fixed z-50 min-w-[200px] rounded-md border bg-popover py-1 shadow-lg`
- Overlay: `fixed inset-0 z-40` click-to-close
- Item: `flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-[var(--hover-bg)]`
- Disabled item: `disabled:opacity-40`
- Separator: `<hr>` or `border-b` between groups
- Item labels: Title Case ("Export to CSV", "Open in Domain Viewer")

### 4.10 Link Styling

- Inline navigation links: color `#3a7bd5`, `hover:underline`
- Cross-view links in context panel: `block text-[11px] hover:underline`, color `#3a7bd5`, arrow suffix
- Issue ID links: `font-mono text-xs`, color `#3a7bd5`, `hover:underline`

---

## 5. Casing Rules

### 5.1 Sentence Case (Default)

Use sentence case for all UI text unless a specific exception applies below.

**Applies to:**
- Button labels: "Apply fix", "Flag for review", "Generate report"
- Column headers: "Signal score", "Review status", "Assigned to"
- Section headers (L2+): "Rule detail", "Review progress", "Suggested fix"
- Dropdown options: "Not reviewed", "Accept all", "Mapping applied"
- Descriptions and tooltips
- Placeholder text: "Search endpoints...", "Notes..."
- Error messages and notifications
- Status text: "Loading study summary..."
- Filter labels

### 5.2 Title Case (Exceptions)

**Applies to:**
- L1 page/view headers: "SEND Validation", "Study: PointCross"
- Dialog titles: "Export Settings", "Confirm Deletion", "Configure Analysis"
- Context menu action labels: "Export to CSV", "Copy Issue ID", "Open in Domain Viewer"
- Product names: "Preclinical Case", "SEND Data Browser"

### 5.3 UPPERCASE (Narrow Use)

**Applies to:**
- Domain codes: DM, LB, BW, MI, MA, CL, OM, TS, TA
- SEND variable names: USUBJID, LBTESTCD, LBORRES, ARMCD
- Specific button exceptions: OK, SAVE, RUN
- Section header decorative treatment: `uppercase tracking-wider` class (the text itself is sentence case, but rendered uppercase via CSS -- e.g., "Rule detail" renders as "RULE DETAIL" on screen)

### 5.4 Never Title Case

**Never use Title Case for:**
- Section headers within panes
- Table column headers
- Filter labels
- Form field labels
- Dropdown options
- Descriptions

### 5.5 Part-of-Speech Consistency in Grouped Labels

**Rule:** Labels that form a visible set — tab bars, segmented controls, pill groups, toggle sets — must use the same part of speech. If one label is a noun, all labels must be nouns. Do not mix verbs, adjectives, or verb phrases into a noun set.

**Why:** A set of labels is read as a parallel list. Mixing parts of speech creates a cognitive stutter — the reader switches from scanning a category to parsing an instruction mid-list. For example, "Evidence / Metrics / Explore" reads as two things and one action, breaking the pattern.

**Applies to:**
- Tab bar labels (e.g., "Evidence", "Metrics", "Hypotheses" — all nouns)
- Segmented pill selectors (e.g., "Shape", "Model fit", "Pareto" — all nouns)
- Toggle button groups
- Navigation rail section headers

**Does not apply to:**
- Standalone buttons (casing rules from §5.1 apply)
- Dropdown option lists (these are full phrases, not parallel labels)
- Column headers (governed by sentence case rule in §5.1)

**Examples:**

| Correct | Incorrect | Why |
|---------|-----------|-----|
| Evidence / Metrics / Hypotheses | Evidence / Metrics / Explore | "Explore" is a verb in a noun set |
| Shape / Model fit / Pareto | Shape / Fit model / Pareto | "Fit model" is verb-first in a noun set |
| Overview / Signal matrix | Overview / View signals | "View signals" is a verb phrase |

---

## 6. Chart Conventions

### 6.1 Recharts (Interactive Charts)

**Line chart (dose-response continuous data):**
- Container: `<ResponsiveContainer width="100%" height={200}>`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb">`
- Axes: tick fontSize 10, auto-scaled Y-axis
- Line: `type="monotone"`, `strokeWidth={2}`, dots `r={4}`, `connectNulls`
- Error bars: `width={4}`, `strokeWidth={1}`, sex-colored
- Tooltip: `contentStyle={{ fontSize: 11 }}`

**Bar chart (categorical/incidence data):**
- Same container and grid as line chart
- Y-axis domain: `[0, 1]` for incidence data
- Tooltip: show as percentage `{(value * 100).toFixed(0)}%`

**Chart layout for sex faceting:**
- `flex gap-4` container
- One chart per sex, each `flex-1`
- Sub-header: `text-center text-[10px] font-medium`, colored by sex

### 6.2 Heatmap (Custom HTML/CSS Grid)

**Grid template:** `grid-template-columns: 180px repeat({colCount}, 70px)`

**Endpoint labels (row headers):**
- Sticky left, `z-10 bg-background`
- `text-[11px]`, truncated with title tooltip
- 180px wide

**Cell rendering:**
- Background from the relevant color scale (signal score or severity)
- Text: value formatted to 2 decimal places + significance stars
- White text if score >= 0.5, dark gray if below
- Outline: `1px solid rgba(0,0,0,0.05)` default
- Selected outline: `2px solid #3b82f6`
- Hover: `opacity-80`

**Static charts (pre-rendered HTML):**
- Embedded via `dangerouslySetInnerHTML` or as standalone HTML files served from the backend
- Self-contained with inline CSS
- Used for supplementary visualizations that do not require interaction (target organ bar charts, grade distributions)

---

## 7. Layout Dimensions

### 7.1 Three-Panel Shell

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
| Toolbox    | Center content              | Context   |
| (fixed)    | (fills remaining width)     | Panel     |
|            |                             | (fixed)   |
+------------+-----------------------------+-----------+
```

- Toolbox width: 260px (Datagrok default ~200px, SEND Browser uses 260px)
- Context panel width: 280px
- Center panel: `flex-1` (fills remaining space)
- Heights: all panels fill full viewport height

### 7.2 Grid Column Widths

| Content type | Width |
|-------------|-------|
| Endpoint/description | 200px - 400px |
| Identifiers (rule ID, issue ID) | 80px - 110px |
| Short codes (domain, sex) | 40px - 70px |
| Numeric values (p-value, effect size) | 60px - 70px |
| Score badges | 70px |
| Status badges | 90px - 110px |
| Boolean flags | 30px |
| Actions column | 8px (icon width) |

### 7.3 Master-Detail Split

For dual-pane views (validation pattern):
- Master (top): `flex-[4]` (40% of available height)
- Detail (bottom): `flex-[6]` (60% of available height)
- Divider bar: `border-b bg-muted/30 px-4 py-2` between panes
