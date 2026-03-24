# Findings View (formerly Adverse Effects)

**Route:** `/studies/:studyId/findings` (primary). Legacy redirects: `/studies/:studyId/adverse-effects` and `/studies/:studyId/analyses/adverse-effects` both redirect to `/findings`.
**Wrapper:** `FindingsViewWrapper.tsx` (in `components/analysis/findings/`) — sets `useRailModePreference("organ")`, renders `FindingsView`
**Component:** `FindingsView.tsx` (in `components/analysis/findings/`)
**Scientific question:** "What are all the findings and how do they compare across dose groups?"
**Role:** Dynamic server-side adverse effects analysis. Two-tab layout with a quadrant scatter or dose-response chart panel, sortable findings table, FindingsRail in the left panel, and detailed context panel.

**Key difference from other views:** This view uses **server-side filtering** (not pre-generated JSON). Data is fetched from `/api/studies/{studyId}/analyses/adverse-effects` with all results loaded at once (page=1, pageSize=10000, empty filters). Sorting is client-side via TanStack React Table. The view derives `EndpointSummary[]`, cross-domain syndromes, lab rule matches, and signal scores from the raw findings data for the scatter plot and analytics context.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Findings   |  Findings View             | Context    |
| Rail       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself uses a flex column layout (`flex h-full flex-col overflow-hidden`) with no page-level padding. A `ViewTabBar` at the top provides two tabs:

| Tab Key | Label | Content |
|---------|-------|---------|
| `findings` | Dynamic (active endpoint label, scope label, or "Findings") | Chart panel (scatter or D-R) + table below |
| `findings-table` | Dynamic (scope label or "Findings table") | Full-height table only, closable |

The `findings-table` tab is closable (X button) and appears only after the user clicks "Open in tab" from the table toolbar. When closed, the view returns to the `findings` tab.

### Tab "findings" — Split Layout

```
+-----------------------------------------------------------+
| [Endpoint ▾]  [Findings table ×]                          |  <-- ViewTabBar
+-----------------------------------------------------------+
|  Section title · (count) · filters  | DayStepper chips ℹ |  <-- ViewSection header
|                                                           |
|  WHEN endpoint selected:                                  |
|  ┌──────────────────────┬────────────────────────┐        |
|  │ DoseResponseChartPanel (resizable split)      │        |
|  │ Left sub-panel       │ Right sub-panel        │        |
|  │ (D-R line/bar or     │ (Effect size bar or    │        |
|  │  Recovery dumbbell)  │  Distribution or       │        |
|  │                      │  Recovery incidence)   │        |
|  │ [D-R] [Recovery]     │ [Effect] [Distribution]│        |
|  └──────────────────────┴────────────────────────┘        |
|                                                           |
|  WHEN no endpoint selected:                               |
|  ┌───────────────────────────────────────────────┐        |
|  │ FindingsQuadrantScatter                       │        |
|  │ (one dot per finding, effect size × p-value)  │        |
|  └───────────────────────────────────────────────┘        |
+-----------------------------------------------------------+
|  FindingsTable (TanStack React Table)                     |
|  (flex-1 overflow-hidden, fills remaining space)          |
+-----------------------------------------------------------+
```

The chart section height is managed by `useAutoFitSections` with "findings" section key (default ~40% viewport height, 80–2000px range). The chart panel is rendered inside a `ViewSection mode="fixed"` with a resize handle.

### Tab "findings-table" — Full Table

When this tab is active, only the `FindingsTable` is shown at full height (no chart section above it). The table receives the same data/filters as in the `findings` tab.

---

## Filter Bar

Uses the shared `FilterBar` container component: `flex items-center gap-2 border-b bg-muted/30 px-4 py-2`.

The FilterBar contains (left to right):
- "Findings" label: `text-xs font-semibold`
- **Summary counts:** `flex items-center gap-2 text-[11px] text-muted-foreground` — adverse count is `font-semibold` with red dashed underline (`underline decoration-dashed decoration-2 underline-offset-2`, `textDecorationColor: #dc2626`); warning and normal counts are plain text.
- **Mortality toggle** (conditional — when `mortalityData.has_mortality && early_death_details.length > 0`): clickable button (`ml-3 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground`). Label: `"{N}TR death{s} at {formatDoseShortLabel(mortality_loael_label)}"` (e.g., "1TR death at 200 mg/kg") — `font-semibold` with red dashed underline (same styling as adverse count). Status suffix in `text-muted-foreground/60`: `"(excl. from term.stats)"` when excluded, `"(in term.stats)"` when included. Click toggles `setUseScheduledOnly(!isScheduledOnly)`.

**Note:** The `FindingsFilterBar` component exists separately but is **not** used in the main FindingsView. Filtering is handled through the FindingsRail (left panel) which manages finding grouping, scoping, and exclusion. The center panel FilterBar displays summary counts and the mortality exclusion toggle.

**FindingsRail filters:** The rail has three filter rows:
- **Row 1:** Search text input
- **Row 2:** Group-by selector (Organ, Finding, Syndrome, Specimen) + group multi-select filter + sort selector (Signal, P-value, Effect, A–Z)
- **Row 3:** Domain multi-select ("All domains"), Pattern multi-select ("All patterns"), Severity multi-select ("All classes"), TR checkbox, Sig checkbox, S2+ checkbox (conditional)

**FindingsRail signal summary:** Three inline badges: `{N} adverse`, `{N} warning`, `{N} TR`.

**FindingsRail organ card indicators:** In organ grouping mode, organ group cards display up to two indicators:
- **Organ confidence** — "Conf: High/Med/Low" with RAG-colored dashed underline (best integrated confidence across treatment-related endpoints).
- **Normalization indicator** — "Norm: [mode]" (ABS/BW/Brain/ANCOVA) with tier-colored dashed underline (green T1, amber T2, orange T3, red T4). Only shown for OM organs at normalization tier >= 2. Computed as highest tier across dose groups for the organ.

---

## Chart Section — Scope-Dependent Content

The chart section displays different content depending on the current selection scope:

### When No Endpoint Selected: Quadrant Scatter

Rendered inside `ViewSection mode="fixed"` when endpoint summaries are available and no specific endpoint is selected.

#### Section Title Bar

The `ViewSection` header displays a dynamic title (left) and action area (right):

**Title (left):** Composed in a `flex items-baseline gap-1.5` span:
- **Scope label** — "All findings" (no scope), "{organName} findings" (organ scope), syndrome name (syndrome scope), or endpoint label (endpoint scope).
- **Count** — `(plottable/total)` when they differ, `(plottable)` when equal. Styled `text-muted-foreground/50`.
- **Filter labels** — active filter descriptions separated by ` · ` dividers. Styled `text-muted-foreground`.
- **Selected point stats** (when a scatter dot is selected) — `★ {label} · {symbol}={effectSize} · p={pValue} ({testName})`. Label in `font-medium`, stats in `font-mono`, test name (Dunnett's for LB/BW/OM/FW, Fisher's otherwise) in `text-muted-foreground/60`.

Metadata text uses `text-[11px] normal-case tracking-normal font-normal text-foreground`.

**Action area (right):** Contains excluded endpoint chips and info tooltip (see below).

#### Excluded Endpoint Chips

When endpoints are excluded via Ctrl+click on scatter dots, chips appear in the ViewSection `headerRight`:
- Each chip: `inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0 text-[10px] text-muted-foreground/70` with truncated label (`max-w-[80px]`) and `EyeOff` restore icon (`h-2.5 w-2.5 cursor-pointer hover:text-foreground`).
- **Overflow:** When > 3 excluded, show first 2 labels + a "+{N} more" chip. The overflow chip's EyeOff clears all exclusions; individual chip EyeOff restores that single endpoint.

#### Info Tooltip

An `Info` icon (`h-3 w-3 cursor-help text-muted-foreground/50 hover:text-muted-foreground`) in the headerRight. Hover-with-delay (150ms hide delay) shows a tooltip (`absolute right-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover px-3 py-2 shadow-md`) explaining:
- Dot semantics ("One dot per finding, showing the strongest signal across timepoints and sexes.")
- Axes (-> "Effect size percentile" with note "continuous and incidence ranked separately"; up-arrow "Lower p-value (pairwise vs. control)")
- Guidance ("Investigate the upper-right quadrant first.")

#### Scatter Chart

**Component:** `FindingsQuadrantScatter` — interactive scatter plot of endpoints by statistical significance (p-value) vs effect size. Props include: endpoints, selectedEndpoint, organCoherence, syndromes, labMatches, scopeFilter, effectSizeSymbol (default `"g"`, dynamically set from active effect size method).

**Legend** (conditional — entries only appear when corresponding data exists in the current point set):

Legend entries reflect three independent encoding channels:

| Channel | Symbol | Label | Visual | Condition |
|---------|--------|-------|--------|-----------|
| Stroke | filled circle (no fill, stroked) | adverse | transparent fill, `WebkitTextStroke: 1px #374151` | `worstSeverity === "adverse"` |
| Shape | outline diamond | clinical S2+ | outline only, default `#9CA3AF` | `clinicalSeverity` truthy (S2/S3/S4) |
| Overflow | clipped circle SVG | p < 10^-20 | half-circle shape indicating clamped value | `y > Y_CEILING` |
| Color | filled circle | NOAEL determining | `rgba(248,113,113,0.7)` (warm rose) | `noaelWeight === 1.0` |
| Color | filled circle | NOAEL contributing | `#9CA3AF` (gray) | `noaelWeight === 0.7` |
| Color | outline circle | NOAEL supporting | gray outline, no fill | `noaelWeight === 0.3` |

Legend rendered as `flex items-center gap-2` inside `px-2 pt-1 pb-3` header. Each entry: `flex items-center gap-0.5 text-[8px] text-muted-foreground`, symbol span colored via inline `style={{ color }}` (fallback `#9CA3AF`). Adverse entry uses `color: transparent` + `WebkitTextStroke: 1px #374151` (no fill, stroke only). Clinical entry uses outline diamond (U+25C7) without color.

**Dot rendering** (`buildFindingsQuadrantOption` in `findings-charts.ts`):

*Size:* default r=5; adverse r=6; worst combination (adverse + clinical S2+ + NOAEL determining) r=7; selected r=10. Emphasis (hover): 7.

*Shape:* diamond for clinical S2+, circle for everything else.

*Stroke* (severity channel): adverse -> `#374151` w1.5 (dark border). Non-adverse -> no stroke (except NOAEL/clinical/exclusion borders below).

*Color — NOAEL weight encoding* (ECI contribution, highest priority first):
- **Determining** (`noaelWeight=1.0`): `rgba(248,113,113,0.7)` (warm rose)
- **Contributing** (`noaelWeight=0.7`): `#9CA3AF` (gray)
- **Supporting** (`noaelWeight=0.3`): `transparent` (outline only, `#9CA3AF` w1 border)
- **Clinical** (no NOAEL override): `#6B7280`
- **Default**: `#9CA3AF`

*Opacity:* uniform 0.7 at rest, selected 1.0, out-of-scope 0.15.

*Border* (non-adverse dots): selected -> `#1F2937` w2, supporting -> `#9CA3AF` w1, contributing (non-clinical) -> `#9CA3AF` w1, clinical -> `#6B7280` w1, early-death exclusion -> `#9CA3AF` w1 dashed, default -> transparent.

**Tooltip** (on hover): endpoint label (bold 11px), domain (colored by `getDomainHexColor`) + organ system, monospace `|symbol|=effectSize` + `p=value`, severity + TR label. Conditional lines: clinical severity + rule ID + fold change, syndrome name (link icon), early-death exclusion note, NOAEL tier + dose, NOAEL contribution label.

**Axes:**
- **x-axis:** `"Effect, |g|"` (dynamic symbol from active effect size method). Tick labels: `v.toFixed(2)`. Range: 0 to max x 1.1.
- **y-axis:** `"p-value"`. Scale is -log10(p) but tick labels show actual p-values (`10^(-v)`, formatted via `toPrecision(1)`). Range: 0 to max x 1.1. Mark line at p=0.05.
- **Mark lines:** horizontal dashed at p=0.05 (`-log10(0.05) ~ 1.3`), vertical dashed at |g|=0.8.

**Interactions:**
- Click dot: selects endpoint (fires `onSelect`); ignored for out-of-scope dots
- Ctrl+click dot: excludes endpoint from rail (fires `onExclude`)
- Hover syndrome member: highlights all dots in same syndrome (dispatchAction highlight/downplay)
- Selected point details passed via `onSelectedPointChange`

---

### When Endpoint Selected: DoseResponseChartPanel

When an endpoint is selected (via rail click, scatter click, or cross-view navigation), the scatter is replaced by `DoseResponseChartPanel` — a resizable split-panel showing dose-response charts and companion visualizations.

**Component:** `DoseResponseChartPanel.tsx`

#### Section Title Bar (Endpoint Mode)

**Title (left):** Same composite span as scatter mode, but scope label shows the active endpoint label.

**Action area (right):** Contains `DayStepper` (day navigation), excluded endpoint chips. The DayStepper drives which study day's data is displayed in the charts.

#### DayStepper

**Component:** `DayStepper.tsx` — section-level day navigation control. Format: `< D15 (peak) v >`

Props: `availableDays`, `selectedDay`, `onDayChange`, `dayLabels` (Map of day -> label key), `peakDay`.

- Left/right arrow buttons: `text-[8px] text-muted-foreground`, disabled at boundaries
- Center: `<select>` dropdown with `text-[10px] font-semibold tabular-nums`, shows `D{day}` with optional label suffix: `(terminal)`, `(peak)`, or `(terminal recovery)` for recovery mode
- Drop-down indicator: `v` glyph when multiple days available
- Hidden (returns null) when `availableDays.length === 0`

**Day metadata computation:**
- **Main study days** (`dayMeta`): Collected from `tableFindings` for the active endpoint. Only days with both control and at least one treated dose group are included. Peak day = day with largest |effect size| (continuous) or lowest p-value (incidence). Terminal day = last available day.
- **Recovery days** (`recoveryDayMeta`): From `recoveryData.recovery_days_available[endpoint]`. Only days after the main terminal/last dosing day. Terminal recovery = last recovery day.
- **Active day metadata** (`activeDayMeta`): Switches based on `leftChartTab` — recovery mode uses recovery days, DR mode uses main study days.

**Day auto-initialization:** `selectedDay` auto-initializes to `activeDay` (from rail) -> `peakDay` -> `terminalDay`. Resets when endpoint changes. User can manually navigate via stepper. Recovery day auto-initializes to terminal recovery day.

#### Resizable Split Layout

The chart panel uses a horizontal split with a `PanelResizeHandle` between left and right sub-panels. Default split: 50/50 (`splitPct` state). Resize range: 20%–80%.

**Left sub-panel** — takes `splitPct%` width (or 100% when no right panel content):

**Left tab bar** (at bottom, conditional — shown when study has recovery arm AND endpoint is NOT CL/MA domain):
- Two tabs: "Dose-response" | "Recovery"
- Canonical tab pattern: active tab has `h-0.5 bg-primary` underline at top, `text-foreground`. Inactive: `text-muted-foreground hover:text-foreground/70`.
- Container: `bg-muted/30`

**Left panel content — Dose-Response tab (default):**
- **Title row:** `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` — "Mean +/- SD" (continuous) or "Incidence" (incidence)
- **Chart mode toggle** (continuous only): `PanePillToggle` with "Line" | "Bar" options. Session-persisted (`pcc.findings.drChartMode`).
- **Sex legend:** Color swatches per sex (cyan M / pink F) + "p<0.05" indicator (continuous only)
- **Chart:** ECharts line chart (dose-response curve, mean +/- SD error bars) or bar chart (grouped bars). Built via `buildDoseResponseLineOption`/`buildDoseResponseBarOption` (continuous) or `buildIncidenceBarOption` (incidence). Post-processed via `compactify()` for tight layout: compact grid margins, color-coded x-axis labels by dose group, thin lines (0.75px), shrunk symbols, stripped NOAEL markLines.
- **Method label + verdict notes** (bar mode, continuous only): Italic method name below chart. Per-sex verdict: significant doses + trend test result with p-value.

**Left panel content — Recovery tab:**
- **Title:** "Recovery -- terminal -> recovery"
- **Continuous endpoints:** `RecoveryDumbbellChart` showing terminal vs recovery effect sizes per dose group, filtered to selected day
- **Incidence endpoints (CL in left tab):** Inline per-dose comparison bars: terminal bar (dark) + recovery bar (blue), percentage change, verdict badge. Legend at bottom.
- **Empty state:** "No recovery data for this endpoint"

**Right sub-panel** — takes remaining width (`flex-1`):

**Right tab bar** (at bottom, conditional — shown when multiple right tabs available):
- Same canonical tab pattern as left tab bar
- Tab options vary by endpoint type:
  - **Continuous endpoints:** "Effect size" (or "Severity" for MI with severity grade data) | "Distribution"
  - **CL/MA endpoints:** "Recovery" (always shown, no other tabs)

**Right panel content — Effect size tab:**
- **Title:** "Effect size ({label})" with optional OM subtitle ("-- Ratio-to-BW" etc.)
- **Threshold note:** `text-[8px] text-muted-foreground/60` — "{symbol}=0.8 threshold"
- **Chart:** ECharts bar chart of effect size per treated dose group (control excluded). Built via `buildEffectSizeBarOption`, post-processed via `compactifyEffectSize()`: strips +/-0.5 mark lines, hides +/-0.8 labels, drops control.

**Right panel content — Severity distribution tab (MI incidence):**
- **Title:** "Severity distribution"
- **Legend:** 5-step severity grades (Minimal, Mild, Moderate, Marked, Severe) with `getNeutralHeatColor()` swatches
- **Chart:** Stacked bar chart via `buildStackedSeverityBarOption`

**Right panel content — Distribution tab:**
- **Title:** "Individual values"
- **Component:** `CenterDistribution` — strip/dot plot showing individual subject values at the selected day. See CenterDistribution section below.

**Right panel content — Recovery incidence tab (CL/MA):**
- **Title:** "Recovery -- incidence" with recovery day label
- Always shown side-by-side with the treatment incidence chart (left panel). No left tab toggle for CL/MA domains.
- Per-sex, per-dose comparison bars (terminal vs recovery) with percentage and verdict badges
- Empty state: "Tissue not examined in recovery arm."

#### CenterDistribution

**Component:** `CenterDistribution.tsx` — strip/dot plot for the center panel Distribution tab. Shows individual subject values at the global day stepper's selected day. Replaces the former context-panel DistributionPane for the findings view.

**Visibility:** Only shown for continuous-domain endpoints in allowed domains: BW, LB, OM, FW, BG, EG, VS.

**Data source:** `useTimecourseSubject` hook — fetches individual subject values. Always includes recovery subjects in fetch for checkbox toggle.

**Features:**
- **Recovery checkbox** (conditional — when study has recovery arm): Toggles between main-study subjects and recovery-arm subjects. Auto-checked when parent `DoseResponseChartPanel` enters recovery mode (`leftTab === "recovery"`).
- **Subject filtering:** Excludes subjects in `excludedSubjects` (scheduled-only context). Recovery mode shows only recovery-arm subjects; default mode excludes recovery-arm unless pooled via `useRecoveryPooling`.

**Rendering:** Uses `StripPlotChart` in **interleaved** mode with F/M sub-lanes. See StripPlotChart section below.

#### StripPlotChart

**Component:** `StripPlotChart.tsx` — vertical strip/dot plot. Two render modes:

**Separate mode** (default): One SVG panel per sex, side by side. Dose-colored dots. Used in the context-panel DistributionPane.

**Interleaved mode** (`interleaved` prop): Single SVG, F/M sub-lanes within each dose column, sex-colored dots (cyan M / pink F), shared Y-axis. Fills available vertical space via `ResizeObserver`. Used in center-panel `CenterDistribution`.

**Visual elements per dose column:**
- Horizontal jittered dots (deterministic jitter by index)
- Mean tick (horizontal line, 2px, 0.8 opacity)
- Box/whisker overlay when n > 15 (BOX_THRESHOLD): IQR box, whiskers at 1.5x IQR, median line
- Dose labels at bottom; sex sub-labels below dose labels (interleaved mode)

**Color encoding:**
- Separate mode: dose-group colors via `getDoseGroupColor()`
- Interleaved mode: sex colors via `getSexColor()` (cyan M, pink F)

**Interactions:**
- Hover dot: tooltip with short subject ID + value + unit
- Click dot: fires `onSubjectClick` -> opens subject profile panel

**Stats legend** (separate mode only, below SVG): Per-treated-dose-group: color swatch, dose label, mean/SD/n. Control: n + mean/SD. Peak mode shows delta instead of mean.

---

## Findings Table

### Structure

TanStack React Table (`useReactTable`) with client-side sorting, column resizing, and virtualized scrolling (`useVirtualizer`). Table element: `<table>` with `w-full text-[11px]`. Wrapped in `flex-1 overflow-hidden` (fills remaining vertical space below chart section, or full height in the `findings-table` tab).

### Table Toolbar

A toolbar row above the table header provides:
- **Follow rail checkbox** (`followRail` state): When checked, table scopes to the active endpoint and syncs with rail selection. When unchecked, table shows all findings independently.
- **Day combo-box** (`manualDay` state): Dropdown to filter table rows to a specific study day. Options: "All days" + available days (formatted as "D{day}" with optional "(terminal)"/"(peak)" labels from `globalDayLabels`). Resets to "all" when active endpoint changes.
- **Layout toggle** (`layoutMode`): "Standard" (dose groups as columns) vs "Pivoted" (dose groups as rows). Session-persisted (`pcc.findings.layoutMode.v2`).
- **Sparkline scale toggle** (`sparkScale`): Right-click on sparkline header opens menu to switch between "Row" (per-row normalization) and "Global" (cross-row normalization).
- **Filter button** with active filter count badge: Opens `FindingsTableFilterPanel` as a side panel.
- **Search input** (pivoted mode): Inline text search for finding names.
- **Open in tab button** (`onOpenInTab`): Shown only in the `findings` tab — opens the `findings-table` tab with full-height table.

### FindingsTableFilterPanel

**Component:** `FindingsTableFilterPanel.tsx` — slide-in side panel for table-level filters.

**Categorical filters:** Domain, Sex, Severity (adverse/warning/normal), Direction (up/down), Pattern (from data), Type (continuous/incidence). Each uses checkbox-based multi-select with include semantics.

**Numerical range filters** (toggle-enabled with smart defaults):
- Pairwise p: default max 0.05
- Trend p: default max 0.05
- |{symbol}| effect size: default min 0.8
- Fold change: default min 1.5

**Controls:** "Clear all" button + close button. Active day filter shown as clearable chip.

**Resize:** Panel width is resizable via `useResizePanel` (100–320px range, session-persisted at `pcc.findings.filterPanelWidth`).

### TanStack Table Features

- **Sorting:** Double-click a column header to toggle sort. Sort indicators `^` (asc) / `v` (desc) appended to header text. Session-persisted via `useSessionState("pcc.findings.sorting", [])`.
- **Column resizing:** Drag resize handle on column borders. Resize handle: `absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none`. Shows `bg-primary` when actively resizing, `hover:bg-primary/30` otherwise. Session-persisted via `useSessionState("pcc.findings.columnSizing", {})`.
- **Content-hugging + absorber:** All columns except the "finding" column (the absorber) use `width: 1px; white-space: nowrap` so the browser shrinks them to fit content. The finding column uses `width: 100%` to absorb remaining space. Manual resize overrides with an explicit `width` + `maxWidth`.
- **Virtualization:** Rows are virtualized via `useVirtualizer` from `@tanstack/react-virtual` for performance with large finding sets.

### Header Row

- Wrapper `<thead>`: `sticky top-0 z-10 bg-background` (sticky header on vertical scroll)
- Row `<tr>`: `border-b bg-muted/30`
- Header cells `<th>`: `relative cursor-pointer px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50`
- Sort trigger: `onDoubleClick` calls `header.column.getToggleSortingHandler()`

### Standard Layout Columns

#### Fixed Columns (Left)

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| domain | Domain | Left | `DomainLabel` component: neutral monospace text, `font-mono text-[10px] font-semibold text-muted-foreground`. No color coding, no background, no border. Per CLAUDE.md hard rule: "Domain labels -- neutral text only." |
| finding | Finding | Left (absorber) | `overflow-hidden text-ellipsis whitespace-nowrap` div with `title` tooltip for full name. If specimen exists: "{specimen}: {finding}" with specimen in `text-muted-foreground`. Excluded endpoints show `EyeOff` restore button. |
| sex | Sex | Left | Sex-colored text via `getSexColor()` |
| day | Day | Left | `text-muted-foreground`, em dash if null. **CL day mode toggle:** when CL findings exist, right-click header opens a dropdown to switch between "Most frequent" (peak prevalence mode, default) and "First observed" (onset day). Header text changes to "Day (onset)" in onset mode. Dropdown: `fixed z-50 min-w-[190px] rounded border bg-popover py-0.5 shadow-md` with checkmark on active item and "Applies to CL rows only" footer. Cell value: CL rows use `day_first` in onset mode, `day` otherwise. |

#### Dynamic Dose-Group Columns (Center)

One column per dose group (from `data.dose_groups` array), rendered dynamically. Column IDs: `dose_{dose_level}`.

- **Header:** `DoseHeader` component — dose value + unit (e.g., "0 mg/kg/day"), or `formatDoseShortLabel(label)` if no value. Rendered via `DoseHeader` which shows the label text with a colored underline indicator (`h-0.5 w-full rounded-full` with color from `getDoseGroupColor(level)`).
- **Cell:** `font-mono`
  - Continuous: mean value `.toFixed(2)`, em dash if null
  - Incidence: "{affected}/{n}", em dash if null

#### Sparkline Column

- **Header:** Sparkline icon with right-click menu to toggle scale mode (Row vs Global)
- **Cell:** Inline SVG mini bar chart showing dose-group values relative to control. Width 28px, height 14px. Bars above/below midline for positive/negative deltas. Control bar in `#9ca3af`, treated in `#6b7280`.

#### Fixed Columns (Right)

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| max_effect_size | Max \|{sym}\| | Left | `ev font-mono text-muted-foreground` -- formatted via `formatEffectSize()`. Header symbol is dynamic via `getEffectSizeSymbol(effectSizeMethod)` (e.g. \|g\|, \|d\|, \|delta\|). Continuous endpoints only. Interaction-driven color via `ev` CSS class. |
| max_fold_change | Magnitude | Left | `font-mono text-muted-foreground`. Fold change for continuous (xN.N), odds ratio for MA/CL/TF, avg severity for MI. Em dash if null. |
| min_p_adj | Pairwise p | Left | `ev font-mono text-muted-foreground` -- formatted via `formatPValue()`. Interaction-driven color via `ev` CSS class. |
| trend_p | Trend p | Left | `ev font-mono text-muted-foreground` -- formatted via `formatPValue()`. Interaction-driven color via `ev` CSS class. |
| direction | Dir | Left | Direction-specific color via `getDirectionColor()` + symbol via `getDirectionSymbol()` (see below) |
| pattern | Pattern | Left | `text-muted-foreground` -- direction-independent label via `getPatternLabel()`. Em dash if null. Right-click opens pattern override menu. |
| onset | Onset | Left | Onset dose formatted via `formatOnsetDose()`. Right-click opens onset dose override menu. |
| severity | Severity | Left | Left-border badge: `inline-block pl-1.5 py-0.5` with colored left border from `getSeverityDotColor()` via inline `style`. Border width and font weight vary by signal tier (see below). |

**Note on p-value and effect-size columns:** Both p-value, trend, and effect-size cells use the `ev` CSS class for interaction-driven color: neutral `text-muted-foreground` at rest, `#DC2626` on row hover/selection. The `data-evidence=""` attribute is set on every `<td>`.

**Note on severity badges:** The severity column uses a left-border badge with `getSeverityDotColor()` providing the `borderLeftColor` via inline style: adverse = `#dc2626`, warning = `#d97706`, normal = `#16a34a`. Border width and font weight scale with signal tier (`getSignalTier(signal)` from `findings-rail-engine.ts`):

| Condition | Signal | Border | Font |
|-----------|--------|--------|------|
| normal severity | any | `border-l` (1px) | `text-muted-foreground` |
| tier 1 | < 4 | `border-l` (1px) | `text-gray-600` |
| tier 2 | 4-7 | `border-l-2` (2px) | `font-medium text-gray-600` |
| tier 3 | >= 8 | `border-l-4` (4px) | `font-semibold text-gray-600` |

**Pattern and onset override menus:** Right-click on pattern or onset cells opens context menus with override options. Pattern menu shows available dose-response pattern classifications with live preview on hover. Onset menu shows available onset dose levels. Both use `usePatternOverrideActions` hook with server-side preview fetching and `OverridePill` indicator when overridden. Menus close on outside click, scroll, or Escape.

### Pivoted Layout

Alternative table layout where dose groups become rows instead of columns. Activated via the layout toggle in the toolbar. Each `UnifiedFinding x DoseGroup` becomes a `PivotedRow`.

Columns: domain, finding (absorber), sex, day, dose_level, dose_label, n, mean/SD (continuous), affected/incidence (incidence), p_value, effect_size, fold_change, direction. SD outlier flag shown when treated SD > 2x control SD.

Separate sorting and column sizing state: `pcc.findings.pivotedSorting`, `pcc.findings.pivotedColumnSizing`.

### Direction Symbols and Colors

| Direction | Symbol | Color Class |
|-----------|--------|------------|
| up | up-arrow | `text-red-500` |
| down | down-arrow | `text-blue-500` |
| null/other | em-dash | `text-muted-foreground` |

### P-value Formatting (`formatPValue`)

| Threshold | Format |
|-----------|--------|
| p < 0.0001 | "<0.0001" |
| p < 0.001 | `.toFixed(4)` |
| p < 0.01 | `.toFixed(3)` |
| p >= 0.01 | `.toFixed(2)` |
| null | em-dash |

### Effect Size Formatting (`formatEffectSize`)

| Value | Format |
|-------|--------|
| non-null | `.toFixed(2)` |
| null | em-dash |

### Row Interactions

- Hover: `hover:bg-accent/50`
- Selected: `bg-accent font-medium` (matched on finding ID), also sets `data-selected` attribute
- **Active endpoint highlight:** All rows matching `activeEndpoint` get a subtle highlight (`bg-accent/20`)
- Click: selects finding via `FindingSelectionContext`. Click again to deselect (toggles to `null`).
- Hover: prefetches finding context via `usePrefetchFindingContext`
- Row cells: `px-1.5 py-px`
- Row base: `cursor-pointer border-b transition-colors`

### Empty State

When `findings.length === 0`, a message is shown below the table: `p-4 text-center text-xs text-muted-foreground` — "No findings match the current filters."

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches regex `/\/studies\/[^/]+\/(findings|(analyses\/)?adverse-effects)/`, shows `FindingsContextPanel` (uses `FindingSelectionContext`). This regex matches both the primary `/findings` path and the legacy adverse-effects paths.

### No Selection State

Three selection priorities:
1. **Endpoint selected** -> endpoint-level panel (see "With Selection" below)
2. **Group selected** (`selectedGroupType === "organ"`) -> `OrganContextPanel` for the organ key. Panes include: Convergence, Organ weight normalization (tier >= 2 only, with override form -- see below), Normalization overview heatmap (collapsed by default, tier >= 2), Organ NOAEL, Related syndromes, Member endpoints
3. **Syndrome selected** (`selectedGroupType === "syndrome"`) -> `SyndromeContextPanel` for the syndrome ID
4. **Nothing selected** -> empty state:
   - Header: `text-sm font-semibold` -- "Findings" (`<h3>` with `mb-2`)
   - Message: "Select a finding row to view detailed analysis."
   - `p-4 text-xs text-muted-foreground`
   - **Normalization overview heatmap** (when OM normalization tier >= 2 contexts exist): `NormalizationHeatmap` in CollapsiblePane, open by default. Compact organ x dose-group matrix showing metric mode (ABS/BW/Brain/ANCOVA) with tier-colored badges. Click organ row -> selects organ group.

### Loading State
- `Skeleton` components: h-4 w-2/3, then h-20 w-full x3
- `space-y-3 p-4`

### With Selection

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Row: `flex items-center justify-between`
- Finding name: `text-sm font-semibold` (`<h3>`)
- Expand/collapse all buttons: `CollapseAllButtons` component in the header row (right side)
- Subtitle: "{domain} | Day {day}" (or "Terminal" if day is null) in `text-[11px] text-muted-foreground`

#### Verdict pane (always visible, not in CollapsiblePane)
`VerdictPane` component — treatment-relatedness assessment with analytics, NOAEL context, dose-response data, and statistics. Rendered in a `border-b px-4 py-3` container outside of CollapsiblePane.

#### Pane 1: Dose detail (default open)
`DoseDetailPane` component — dose-level detail table with statistics and dose-response data. Header right shows unit when available.

#### Pane 2: Time Course (conditional, default open)
`TimeCoursePane` component — shown only for continuous-domain findings (`data_type === "continuous"`). Renders a time-series chart showing the endpoint's trajectory across study days by dose group. Manages its own `CollapsiblePane` internally.

#### Pane 3: Recovery (conditional, default open)
`RecoveryPane` component — shown only when study has recovery arm (`dose_groups` has a `recovery_armcd` entry). `defaultOpen` is `true` unless recovery is "Not examined" (`recoveryNotExamined`). Renders three domain-specific sections:
- **Histopath (MI/MA):** Per-dose recovery verdicts (reversed/persistent/progressing), classification with confidence, finding nature assessment. Uses `useOrganRecovery` hook. Both sexes shown side-by-side (F before M). Includes: `IncidenceDumbbellChart` (shared across sexes), per-sex `HistopathMetaSection` with verdict badge, classification section (border-left accent), finding nature, concordance note.
- **Continuous (BW, LB, OM, VS, FW, EG, BG):** Recovery vs terminal dumbbell chart (`RecoveryDumbbellChart`) with effect size comparison. Uses `useRecoveryComparison` -> `rows[]`. Multi-day rows filtered to max recovery day per dose_level x sex.
- **Incidence (CL):** Terminal vs recovery incidence table per dose group with verdicts (Resolved/Improving/Persistent/New in recovery). Uses `useRecoveryComparison` -> `incidence_rows[]`. Per-sex tables with `PaneTable` component.

**Note:** The Distribution pane (formerly Pane 3) has been moved from the context panel to the center panel as `CenterDistribution` inside `DoseResponseChartPanel`. It is no longer rendered in the context panel.

#### Pane 4: Statistical Evidence (default open)
`EvidencePane` component — statistical evidence summary with finding data, analytics, statistics, and effect size context. When sibling sex data exists, the pane header includes sex toggle tabs (`F | M`) to switch the active sex.

**OM domain sub-sections (rendered inside the Statistical Evidence CollapsiblePane, after EvidencePane):**
- **Normalization annotation** — category-specific messaging (GONADAL: absolute weight primary; ANDROGEN_DEPENDENT: androgen status correlation; FEMALE_REPRODUCTIVE: estrous cycle variability; non-reproductive organs at tier >= 2: BW confounding tier + active mode).
- **Normalization alternatives table** — high-dose vs control comparison across absolute, ratio-to-BW, and ratio-to-brain metrics with delta% column. Shown for GONADAL (ratios grayed), FEMALE_REPRODUCTIVE (always), or when normalization engine recommends showing alternatives (tier >= 2).
- **Williams' trend test comparison** (`WilliamsComparisonPane`) — side-by-side JT vs Williams' results with concordance verdict (concordant/discordant). Expandable step-down detail table showing per-dose test statistic, critical value, p-value, and significance. Only shown when `finding.williams` is present (OM domain).

**ANCOVA effect decomposition** (`ANCOVADecompositionPane`) — rendered inside the Statistical Evidence pane after the OM normalization sections. Shown when `finding.ancova` is present (OM domain, tier >= 3 or brain affected). Displays: model R-squared, slope homogeneity warning (amber when non-parallel), BW slope + p-value, per-dose-group decomposition table (total/direct/indirect effect, % direct, direct p-value with red highlight when p < 0.05), adjusted least-squares means at overall mean BW with raw comparison. Punchline: plain-English ANCOVA vs raw comparison (confirms / reveals / reduces significance).

**Decomposed confidence / ECI** (`DecomposedConfidencePane`) — rendered inside the Statistical Evidence pane after ANCOVA. Shown when the endpoint has an `endpointConfidence` result. 5-dimension ECI breakdown: statistical evidence, biological plausibility, dose-response quality, trend test validity, trend concordance. Integrated confidence level with limiting factor. NOAEL contribution weight. Each dimension expandable with detailed content: `StatisticalEvidenceContent`, `BiologicalPlausibilityContent`, `DoseResponseQualityContent`, `TrendTestValidityContent`.

**OrganContextPanel — Normalization override form (OWN section 8):**

The "Organ weight normalization" pane in `OrganContextPanel` (tier >= 2 only) includes a user override mechanism. Components: `NormalizationModeDisplay` (read-only summary: active mode, tier, BW/brain g, category, rationale) + `NormalizationOverrideForm` (edit form). Storage: `normalization-overrides` annotation schema keyed by organ name (uppercase).

- **Collapsed state:** Two links — "Override mode" (opens edit form) and "Clear override" (removes override, only shown when active). "Saved" flash (green-600, 2s) after mutation.
- **Expanded state:** Mode selector buttons (pill-shaped, `bg-primary` when active), filtered by data availability (brain-ratio hidden when no brain data, ANCOVA hidden when tier < 3). Required reason textarea (`text-[11px]`, 2 rows). Save button (`bg-primary`, disabled when reason empty or saving). Cancel link.
- **Override indicator:** When `userOverridden === true`, label shows "(user override)" in amber-600 instead of "(auto-selected)".
- **Data flow:** `useNormalizationOverrides(studyId)` hook wraps `useAnnotations` + `useSaveAnnotation` for the `normalization-overrides` schema. `useOrganWeightNormalization` fetches overrides via `useAnnotations` and applies them in `useMemo` via `applyOverrides()` — sets mode + `userOverridden: true` on all dose-group decisions/contexts for the organ. All 7 callers of the hook automatically see overrides.
- **Audit trail:** Server-side via `_append_audit_entry()` in `annotations.py` — logs field-level diffs on every save.

#### Pane 5: Patterns (conditional, default open)
`EndpointSyndromePane` + `ConvergenceNote` — shown when the endpoint belongs to cross-domain syndromes or has organ convergence. Title is dynamic: "Patterns" when both syndromes and convergence exist, "Syndromes" when only syndromes, "Patterns" when only convergence. Header right shows syndrome count or "convergence" label. Rendered as a separate `CollapsiblePane`, not merged with Statistical Evidence.

#### Pane 6: Correlations (conditional, default closed)
`CorrelationsPane` component — shown only when correlations have related items that are not purely group-mean based (`basis !== "group_means"`) and have sufficient sample size (`n >= 10`). Explicitly passed `defaultOpen={false}`.

#### Pane 7: Effect Ranking (default closed)
`ContextPane` component — effect size interpretation and contextual ranking among all findings. Explicitly passed `defaultOpen={false}`.

#### Pane 8: Causality Worksheet (conditional)
`CausalityWorksheet` component — structured causality assessment form. Shown when finding context data is available.

#### Pane 9: Related views (default closed)
Navigation links to other views. Explicitly passed `defaultOpen={false}`. Contains 4 links:

| Link Text | Target Route |
|-----------|-------------|
| View histopathology -> | `/studies/{studyId}/histopathology` |
| View dose-response -> | `/studies/{studyId}/dose-response` |
| View NOAEL determination -> | `/studies/{studyId}/noael-determination` |
| View study summary -> | `/studies/{studyId}` |

Links: `block text-primary hover:underline`, use `<a href="#">` with `onClick` handler calling `navigate()`. Wrapped in `space-y-1 text-xs`.

#### Pane 10: Annotation (conditional)
`ToxFindingForm` component — toxicological finding annotation form. Suggestion derived via `deriveToxSuggestion()`.

#### Pane Rendering
All panes (except Verdict) use the `CollapsiblePane` component:
- Toggle button: `flex w-full items-center gap-1 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50`
- Chevron icons: `h-3 w-3` (`ChevronDown` when open, `ChevronRight` when closed)
- Content area: `px-4 pb-3`
- Panes are separated by `border-b` (last pane has `last:border-b-0`)
- Panes respond to expand-all / collapse-all via generation counter (`expandAll` / `collapseAll` props)
- Pane history navigation via `usePaneHistory` hook

### Syndrome Selected (`SyndromeContextPanel`)

Shown when `selectedGroupType === "syndrome"`. Displays cross-domain syndrome interpretation.

**Component:** `SyndromeContextPanel` (`panes/SyndromeContextPanel.tsx`)

#### Header (sticky, with verdict)
- `sticky top-0 z-10 border-b bg-background px-4 py-3` with severity-dependent left border accent
- Syndrome name: `text-sm font-semibold` + `CollapseAllButtons` (right side)
- Subtitle: `{syndromeId} . {N} endpoints . {N} domains . Detected in: {sexes}`
- **Verdict lines** (conditional, when `syndromeInterp` available — replaces the separate verdict card):
  - Line 1: Severity label (`SEVERITY_LABELS[overallSeverity]`) with severity accent class
  - Line 2: Mechanism certainty text (with tooltip) . Recovery status text
  - Line 3: Treatment-related . Adverse classification . optional "NOAEL capped by mortality"
  - Line 4 (XS09 only): Organ proportionality narrative
- Loading state: "Loading interpretation..." when `syndromeInterp` not yet available

#### Pane order (top to bottom)

| # | Pane | Default | Condition |
|---|------|---------|-----------|
| 1 | Evidence | open | `syndromeInterp` available |
| 2 | Dose-response & recovery | open | `syndromeInterp && detected` |
| 3 | Histopathology | open | `syndromeInterp && hasHistopath` (includes XS01 tumor progression cross-ref and tumor confounder checks) |
| 4 | Food consumption | open when applicable | `syndromeInterp && showFoodConsumption` (open when `available && bwFwAssessment !== "not_applicable"`) |
| 5 | Organ proportionality | open | `syndromeInterp && xs09Active && organProportionality?.available` |
| 6 | Clinical observations | closed | `syndromeInterp && hasClinicalFindings` (headerRight: "{N} correlating") |
| 7 | Mortality | closed | `syndromeInterp && hasMortality` (headerRight: red border-l death count + NOAEL cap note) |
| 8 | Translational confidence | closed | `syndromeInterp && hasTranslational` (headerRight: tier label, capitalize) |
| 9 | Reference | closed | always (contains description, regulatory significance, key discriminator, separator, then 4 navigation links) |

**Food consumption pane:** Narrative replaces generic "at high dose" with actual dose label from `dose_groups` (e.g., "at 200 mg/kg"). Food efficiency entries show actual dose labels.

**Reference pane:** Contains syndrome interpretation text (description, regulatory significance, key discriminator) + 4 navigation links (dose-response, histopathology, NOAEL determination, study summary).

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| View tab | Session-persisted | `useSessionState<FindingsTab>("pcc.findings.viewTab", "findings")` — "findings" or "findings-table" |
| Table tab open | Local | `tableTabOpen` — whether the findings-table tab is available |
| Left chart tab | Session-persisted | `useSessionState<LeftChartTab>("pcc.findings.leftTab", "dr")` — "dr" or "recovery" |
| Right chart tab | Session-persisted | `useSessionState<RightTab>("pcc.findings.rightTab", "effect")` — "effect", "distribution", or "recovery" |
| D-R chart mode | Session-persisted | `useSessionState<DRChartMode>("pcc.findings.drChartMode", "line")` — "line" or "bar" |
| Selected day | Local | `selectedDay` — user-driven via DayStepper, auto-initialized from rail or peak/terminal |
| Selected recovery day | Local | `selectedRecoveryDay` — auto-initialized to terminal recovery day |
| Active endpoint | Local | `activeEndpoint` — current endpoint label from rail or scatter |
| Active domain | Local | `activeDomain` — domain for multi-domain endpoints |
| Active grouping | Local | `activeGrouping` — current rail grouping mode |
| Visible labels | Local (from rail) | `visibleLabels` — Set of endpoint labels visible after rail filtering |
| Scope label/type | Local (from rail) | `scopeLabel`, `scopeType` — rail scope metadata for section titles |
| Finding selection | Shared via context | `FindingSelectionContext` — syncs table and context panel. Includes `selectedFindingId`, `selectedFinding`, `endpointSexes`, `selectedGroupType`, `selectedGroupKey` |
| Study selection | Shared via context | `SelectionContext` — synced on mount |
| Table sorting | Session-persisted | `useSessionState<SortingState>("pcc.findings.sorting", [])` |
| Column sizing | Session-persisted | `useSessionState<ColumnSizingState>("pcc.findings.columnSizing", {})` |
| Table layout mode | Session-persisted | `useSessionState<LayoutMode>("pcc.findings.layoutMode.v2", "standard")` — "standard" or "pivoted" |
| Table filter state | Session-persisted | `useSessionState<TableFilterState>("pcc.findings.tableFilters.v2", DEFAULT_FILTER_STATE)` |
| Follow rail | Local | `followRail` — whether table scopes to active endpoint |
| Findings + analytics | Server + derived | `useFindingsAnalyticsResult()` — reads from `FindingsAnalyticsProvider`. Returns `{ analytics, data, isLoading, isFetching, isPlaceholderData, error }`. |
| Recovery data | Server | `useRecoveryComparison(studyId)` — multi-day recovery comparison stats |
| Finding context | Server | `useFindingContext(studyId, findingId)` hook — loaded on selection |
| Mortality data | Server | `useStudyMortality(studyId)` — early death subject data, feeds FilterBar mortality toggle |
| Scheduled-only mode | Shared | `useScheduledOnly()` — toggle in FilterBar excludes early-death treatment-group subjects from statistics |
| Recovery pooling | Session-persisted | `useSessionState("pcc.{studyId}.recoveryPooling", "pool")` — "pool" (include recovery arms in treatment-period stats, default) or "separate" (exclude). Toggle in `StudyDetailsContextPanel` settings pane. |
| Scatter section height | Local | `useAutoFitSections(containerRef, "findings", ...)` — resizable scatter panel |
| Excluded endpoints | Local | `excludedEndpoints` Set — Ctrl+click exclusion from scatter, synced to rail via `findings-bridge` callback |
| Rail grouping | Session-persisted | `useSessionState("pcc.findings.rail.grouping", "finding")` — values: `organ`, `finding`, `syndrome`, `specimen` |
| Rail sort | Session-persisted | `useSessionState("pcc.findings.rail.sort", "signal")` — values: `signal`, `pvalue`, `effect`, `az` |
| Rail filters | Local (study-scoped) | `RailFilters` — reset on study change. Fields: `search`, `domains` (multi-select), `pattern` (multi-select), `severity` (multi-select), `trOnly`, `sigOnly`, `clinicalS2Plus`, `groupFilter`, `noaelRole` |
| Active finding | Local (via event bus) | `_findingsRailCallback` via `findings-bridge.ts` — finding selection from rail |
| Excluded findings | Local (via event bus) | `_findingsExcludedCallback` via `findings-bridge.ts` — Ctrl+click exclusion |
| Collapse all | Local (context panel) | `useCollapseAll()` hook — provides expandGen/collapseGen counters |
| Rail mode | Shared | `useRailModePreference("organ")` — set by wrapper |
| Analytics context | Derived (composite) | `FindingsAnalyticsProvider` — wraps entire view, makes analytics available via `useFindingsAnalyticsResult()` context hook to all child components (scatter, table, rail, context panels) |

---

## Data Flow

```
FindingsAnalyticsProvider (wraps entire view layout)
    |
    +-- useFindingsAnalyticsLocal(studyId)
    |       |
    |       +-- useFindings(studyId, 1, 10000, ALL_FILTERS) -> raw findings
    |       +-- useScheduledOnly() -> filter early deaths
    |       +-- useSessionState(recoveryPooling) -> filter recovery arms
    |       +-- useStatMethods() -> effect size + multiplicity overrides
    |       +-- useOrganWeightNormalization() -> OWN mode overrides
    |                   |
    |         Processing pipeline (in useMemo):
    |         1. applyScheduledFilter()
    |         2. applyRecoveryPoolingFilter()
    |         3. applyEffectSizeMethod() + applyMultiplicityMethod()
    |         4. mapFindingsToRows() + deriveEndpointSummaries()
    |         5. computeEndpointNoaelMap()
    |         6. attachEndpointConfidence()
    |         7. deriveOrganCoherence()
    |         8. detectCrossDomainSyndromes() (XS01-XS10)
    |         9. evaluateLabRules()
    |        10. withSignalScores()
    |                   |
    |         Returns: { analytics, data, isLoading, error }
    |
    +-- useFindingsAnalyticsResult() (context hook)
    |       |
    |       +-- FindingsView
    |       |   +-- ViewTabBar (two-tab navigation)
    |       |   +-- FindingsQuadrantScatter (no endpoint) OR DoseResponseChartPanel (endpoint)
    |       |   |   +-- DayStepper (day navigation)
    |       |   |   +-- D-R line/bar chart (left)
    |       |   |   +-- RecoveryDumbbellChart (left, recovery tab)
    |       |   |   +-- Effect size / Severity chart (right)
    |       |   |   +-- CenterDistribution -> StripPlotChart (right, distribution tab)
    |       |   |   +-- Incidence recovery bars (right, CL/MA)
    |       |   +-- FindingsTable (TanStack + virtual scroll)
    |       |       +-- FindingsTableFilterPanel (side panel)
    |       |
    |       +-- FindingsRail (left panel)
    |       |   +-- findings-bridge.ts (event bus callbacks)
    |       |
    |       +-- FindingsContextPanel (right panel)
    |           +-- VerdictPane, EvidencePane, RecoveryPane, TimeCoursePane
    |           +-- EndpointSyndromePane, CorrelationsPane, ContextPane
    |           +-- CausalityWorksheet, ToxFindingForm
    |           +-- (DistributionPane removed -- now CenterDistribution in chart panel)
    |
    +-- FindingSelectionContext (syncs table <-> context panel)
    +-- useRecoveryComparison(studyId) (multi-day recovery stats)
```

All child components access analytics (endpoints, syndromes, organ coherence, lab matches, signal scores, normalization contexts, endpoint sexes) via the `useFindingsAnalyticsResult()` context hook rather than prop drilling.

**RecalculatingBanner:** A `RecalculatingBanner` component is shown at the top of the view when `isFetching && isPlaceholderData` — indicates that the view is recalculating (e.g., after stat method change) while showing stale data.

---

## Cross-View Navigation

The view supports incoming navigation state via `react-router-dom` `location.state`:
- `{ endpoint_label }` — auto-selects the specified endpoint on mount
- `{ organ_system }` — navigates to the organ scope

The "Related views" pane in the context panel provides navigation links to:
- Histopathology view
- Dose-response view
- NOAEL determination view
- Study summary view

All links use `react-router-dom` `navigate()` for client-side navigation.

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Skeleton rows: 1 `h-10 w-full` header + 10 `h-8 w-full` body rows, in `space-y-2 p-4` |
| Error | `p-6 text-destructive` -- "Failed to load analysis: {message}" |
| Empty | "No findings match the current filters." (`p-4 text-center text-xs text-muted-foreground`) |

---

## TODOs

- [ ] **Scatter dot selection color is unintuitive.** On click, the selected dot changes from gray to `getOrganColor(organ_system)` — a hash-based HSL hue. Since all dots are gray at rest, you only ever see one colored dot at a time, so the organ-system encoding provides no visual grouping benefit. Consider: (a) using a fixed accent color (e.g., `primary`) for the selected dot, since the organ is already shown in the context panel header; (b) lighting up all dots of the same organ system on selection so the color grouping is visible; or (c) keeping organ color but making it always-on at rest (conflicts with current "gray at rest" design). Filed from: Alkaline Phosphatase selection shows blue (`hsl(232,55%,50%)` = hepatic) with no context for why blue. See `findings-charts.ts:143` and `severity-colors.ts:234`.
