# Datagrok Viewer Configuration — Dose-Response View

> **Purpose:** Exact viewer configurations for when the Dose-Response view migrates from Recharts to native Datagrok viewers. These are implementation-ready `setOptions()` calls, not design aspirations.
>
> **Source:** `C:\pg\pcc-design\llm-spec-dr-explore-view.md`
>
> **Scope:** Dose-Response view only. Other views will get their own viewer config documents when migrated.

---

## Guiding principle

> On the Evidence tab, Datagrok viewers are locked displays of precomputed evidence.
> Configure them, do not empower the user to redesign them.

The Evidence tab proves a conclusion. The Hypotheses tab discovers new hypotheses. Every viewer constraint below exists to enforce this separation.

---

## 1. Evidence tab — general viewer constraints

All viewers on the Evidence tab must be configured as read-only displays bound to a precomputed derived DataFrame.

### Disallowed DG options (Evidence tab only)

- Zoom & pan
- Log scale toggles
- Smoothing / interpolation controls
- Changing chart type
- Changing aggregation (mean vs median)
- Per-series visibility toggles
- User-driven model selection or fitting

### Disallowed toolbar items

- "Open viewer properties" button
- "Transform data" / "Add filter" directly on the viewer
- "Export as script" (from the viewer; exporting the whole view via app controls is fine)

If Datagrok APIs require properties to be present, set them but do not expose UI controls for them.

---

## 2. Evidence viewer 1 — multi-curve dose-response (Line Chart)

### Purpose

Confirm monotonicity, sex concordance, and dose progression for a single endpoint. This is the main visual proof backing the signal.

### Dataframe specification

Each row = `(endpoint, dose_group, sex)`.

| Column | Type | Notes |
|--------|------|-------|
| `dose_group` | categorical (ordered) | Group 1 → Group N |
| `dose_value` | numeric (optional) | Tooltips only |
| `sex` | categorical | F / M |
| `mean` | numeric | Mean endpoint value |
| `sd` | numeric | Standard deviation |
| `n` | integer | Subject count |
| `endpoint_name` | string | Same value for all rows in this view |

### DG Line Chart mapping

- X: `dose_group`
- Y: `mean`
- Split-by (series): `sex`
- Error bars: `sd`
- Tooltip fields: `dose_group`, `dose_value`, `sex`, `mean`, `sd`, `n`

### Viewer options (must be set exactly)

```js
viewer.type = 'Line chart';

viewer.setOptions({
  chartType: 'line',
  showPoints: true,
  lineWidth: 2,
  pointSize: 6,
  showErrorBars: true,
  errorBarType: 'sd',
  smoothLines: false,
  interpolation: 'linear',
  connectNulls: false,
  stackSeries: false,
  logX: false,
  logY: false,
  allowZoom: false,
  allowPan: false,
  allowSelection: false,
  showLegend: true,       // static
  legendPosition: 'bottom'
});
```

### Color rules (strict)

| Sex | Color |
|-----|-------|
| Female | `#EC4899` |
| Male | `#3B82F6` |

No other colors. No gradients. No per-point coloring.

### Annotations (static overlays)

Render as text annotations inside plot area, top-left:

- `p(trend) < {value}`
- `Max d = {value} ({group})`
- `Pattern: {pattern_label}`
- `Sexes: {sexes}`

Style: text color `#4B5563`, small font, no arrows or callouts.

### Explicitly forbidden

- Model fitting controls
- Polynomial / sigmoid fits
- Smoothing toggles
- Axis scaling toggles
- Per-series visibility toggles
- Overlaying multiple endpoints

---

## 3. Evidence viewer 2 — effect size vs dose (Bar Chart)

### Purpose

Show biological magnitude per dose and contextualize significance. Answers: "Is the effect meaningful, or just statistically detectable?"

### DG Bar Chart mapping

- X: `dose_group`
- Y: `effect_size_d`
- Split-by: `sex`

### Viewer options

```js
viewer.type = 'Bar chart';

viewer.setOptions({
  grouped: true,
  stacked: false,
  showGrid: true,
  barWidth: 0.7,
  showZeroLine: true,
  zeroLineValue: 0,
  allowZoom: false,
  allowPan: false,
  allowSelection: false,
  showLegend: true,
  legendPosition: 'bottom',
  referenceLines: [
    { y: 0.5, style: 'dashed', color: '#9CA3AF' },
    { y: 0.8, style: 'dashed', color: '#9CA3AF' }
  ]
});
```

### Color rules

Same as line chart: Female `#EC4899`, Male `#3B82F6`. No red encoding of significance. Bars neutral at rest. Significance is textual, not chromatic.

### Tooltip (mandatory)

Shows: dose group, sex, effect size d, p-value.

### Forbidden

- Heatmap coloring
- Sorting by effect size
- Showing multiple endpoints

---

## 4. Evidence viewer 3 — pairwise comparison table (TableView)

### Purpose

Auditability, regulatory defensibility, and data completeness. Not optional, should not be visualized further.

### Required columns (exact order)

1. `dose_group`
2. `sex`
3. `mean`
4. `sd`
5. `n`
6. `p_value`
7. `effect_size_d`
8. `pattern`

### DG TableView options

```js
view = grok.shell.addTableView(df);

view.grid.props = {
  showRowHeader: false,
  showFilterRow: false,
  allowRowSelection: false,
  allowEdit: false,
  allowColRemove: false,
  allowColAdd: false,
  allowColMove: false,
  allowBlockSelection: false,
  rowResizeMode: 'none'
};
```

No inline charts, no histogram bars, no color heatmaps.

### Conditional formatting (minimal)

- `p_value` column: **bold** if < 0.05. Color (`#DC2626`) only when the row is selected in the main app context, not by user clicking the grid.
- No other conditional colors.

### Forbidden

- Sparkline columns
- Heatmap backgrounds
- Color gradients
- Auto-sorting

---

## 5. View composition (Evidence tab layout)

Recommended vertical layout:

```
[ Endpoint Summary Text   ]
[ Multi-curve Line Chart   ]
[ Effect Size Bar Chart    ]
[ Pairwise Comparison Table]
```

Rules:
- No side-by-side charts (avoids split attention)
- Scrolling allowed
- Charts come before the table

**Note:** The current prototype uses a side-by-side layout for the line chart and effect size chart (resizable split). During migration, evaluate whether the vertical stack is preferable for the Datagrok viewport or whether the horizontal split should be preserved. The spec recommends vertical; the prototype optimizes for wide monitors.

---

## 6. Hypotheses tab — DG viewer freedom

On the Hypotheses tab, Datagrok viewers may use more of their native interactivity (zoom, pan, model selection), subject to these hard rules:

- Must never update NOAEL / target organ decisions
- Must never rewrite text on the Evidence tab
- Must never store model parameters as authoritative results
- All Hypotheses-tab state is session-scoped, disposable

See `docs/views/dose-response.md` § Hypotheses tab for the full feature spec.

---

## 7. Color rules reminder (Evidence tab)

- Saturated red (`#DC2626`) is reserved for `TARGET ORGAN` labels (outside this view) and at most emphasis of selected values (not by default)
- No status colors in charts or tables
- No filled domain pills or rainbow legends
- If the screen is converted to grayscale, the hierarchy must remain clear

---

## Prototype-to-DG mapping

| Prototype (Recharts) | DG Viewer | Migration notes |
|----------------------|-----------|-----------------|
| `<LineChart>` with sex-split, error bars, custom dots | `tv.lineChart()` with `setOptions()` above | Custom significant-dot rendering (filled vs hollow) may need `onPointRender` callback |
| `<BarChart>` for effect size with `<ReferenceLine>` | `tv.barChart()` with `referenceLines` option | Verify DG supports reference lines natively; if not, overlay with `DG.JsViewer` |
| Hand-built `<table>` for pairwise comparison | `DG.TableView.grid` with locked props | Most formatting comes free from grid; use `onCellPrepare` for p-value bold |
| `<ResponsiveContainer>` auto-sizing | DG viewer auto-fills its container | No action needed |
| `<Tooltip>` with custom formatter | DG viewer tooltip or `ui.tooltip.bind()` | DG tooltips may need explicit column-to-label mapping |
