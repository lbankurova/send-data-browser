# Recovery Trajectory Dumbbell Chart — Viewer Specification

**Application:** SEND Data Browser
**View:** View 5 (Recovery & Reversibility Assessment) — also embeddable in View 2 (Dose–Response) as a secondary panel
**Status:** Draft v2 — aligned with shipped recovery assessment engine
**Dependencies:** `recovery-pane-spec.md` (verdict logic, classification thresholds, edge cases), `TOPIC-recovery-phase-detection.md` (phase detection waterfall, treatment-period pooling, override system), `temporal.py` recovery-comparison endpoint (backend API), `RecoveryPane.tsx` (existing pane — this viewer complements, not replaces)

**Relationship to existing recovery pane:** The dumbbell chart is a **multi-dose visual summary** that complements the existing `RecoveryPane.tsx` detail pane. The pane shows per-dose verdict detail (raw means, g values, peak context, severity shifts) for a single selected finding. The dumbbell chart shows all dose groups simultaneously on a spatial axis, making trajectory patterns and dose-response shapes visible at a glance. Both consume the same backend data (`/api/studies/{id}/recovery-comparison`).

---

## 1. Scientific Purpose

The dumbbell chart answers: **"Did treatment-related effects resolve, persist, or worsen during the recovery period?"**

This is the core visualization for reversibility assessment. A toxicologist reviewing recovery data needs to see, at a glance, three things per dose group:

1. How far the group was from control at end of treatment (terminal Δ)
2. How far the group is from control at end of recovery (recovery Δ)
3. Whether the trajectory moved toward control (recovering), away (worsening), or overshot (overcorrected)

The chart replaces the current approach of scanning a grid row-by-row and mentally comparing two columns. It makes trajectory direction, magnitude, and statistical confidence simultaneously visible across all dose groups and both sexes.

### When this chart appears

The visualization selection algorithm (§12.1) activates this viewer when:

- The study has a detected or overridden recovery period (§5.3 recovery period override)
- At least one recovery arm exists with ≥ 2 animals per group
- The selected endpoint has both terminal and recovery timepoint data
- RESPONSE_TYPE is continuous (BW, LB, OM, FW). For categorical endpoints (MI, CL), use the reversibility heatmap instead (§12.X).

---

## 2. Backing Data

### 2.1 Data Source: Existing Recovery-Comparison API

The dumbbell chart consumes the **same backend endpoint** as the existing RecoveryPane: `/api/studies/{id}/recovery-comparison`. No new backend computation is needed. The endpoint already returns per-row:

| Field group | Fields | Used by dumbbell |
|-------------|--------|-----------------|
| Core | `mean`, `sd`, `p_value`, `effect_size` (Hedges' g), `dose_level`, `sex` | g values for dot positioning, p for badge |
| Terminal reference | `terminal_effect` (g at terminal), `terminal_day` | Terminal dot position |
| Peak context | `peak_effect` (max \|g\| during dosing), `peak_day` | Tooltip annotation |
| Control stats | `control_mean`, `control_n`, `control_mean_terminal`, `treated_n`, `treated_mean_terminal` | Hover detail, drift detection |
| Edge case flags | `insufficient_n` (n<2), `no_concurrent_control` | Row rendering mode |

The chart reshapes the API response into one row per dose × sex, with terminal and recovery g values side by side. No derived DataFrame beyond what the API already provides.

### 2.2 X-Axis Metric: Hedges' g (Default)

**Primary axis: Hedges' g** — the control-normalized effect size already used throughout the app. This is a deliberate alignment with the existing RecoveryPane (recovery-pane-spec §15.4: "g is already the standard throughout the app; adding % diff would require API extension").

The x-axis plots `|g|` (absolute Hedges' g), where:
- `g_terminal` = `terminal_effect` from the API (Hedges' g at end of dosing)
- `g_recovery` = `effect_size` from the API (Hedges' g at recovery sacrifice)

Toolbar toggle (§6) allows switching to % difference from control if the API is extended to return it.

### 2.3 Verdict Classification: Shipped System

The dumbbell chart uses the **existing 8-verdict classification** from recovery-pane-spec §4.2. It does NOT implement its own thresholds. The classification is computed from recovery percentage:

```
recovery_pct = (|g_terminal| - |g_recovery|) / |g_terminal| × 100
```

| Verdict | Condition | Color family |
|---------|-----------|-------------|
| **Resolved** | `|g_recovery| < 0.5` AND `recovery_pct ≥ 80%` | Green |
| **Reversed** | `recovery_pct ≥ 80%` (or `|g_recovery| < 0.5` AND `recovery_pct < 80%`) | Green |
| **Reversing** | `recovery_pct 50–80%` | Green |
| **Partial** | `recovery_pct 20–50%` | Amber |
| **Persistent** | `recovery_pct < 20%` | Gray |
| **Worsening** | `recovery_pct < 0` (effect grew) | Red |
| **Overcorrected** | Sign change between terminal and recovery AND `|g_recovery| ≥ 0.5` | Purple |
| **Not assessed** | `|g_terminal| < 0.5` (prerequisite gate) | Light gray |

**Prerequisite gate:** If `|g_terminal| < 0.5`, the terminal effect is too small to meaningfully assess recovery. Row renders in light gray with dotted connector and "Not assessed" label.

### 2.4 Edge Case Flags from API

The backend emits flagged rows rather than omitting them. The chart renders these with degraded styling:

| Flag | API signal | Chart behavior |
|------|-----------|---------------|
| `insufficient_n` = true | n < 2 at recovery | Gray row, dotted line, label: "n={n} — insufficient" |
| `no_concurrent_control` = true | No control group at recovery sacrifice | Amber warning badge on row, fallback to raw delta comparison |
| `control_mean` shifts >15% from `control_mean_terminal` | Control drift | Drift warning icon (⚠) next to dose label |

### 2.5 Peak Context Integration

When the API returns `peak_effect` and `peak_day`, and the peak annotation condition is met (recovery-pane-spec §5.1):

```
show_peak = |peak_effect| > |terminal_effect| × 1.5  AND  |peak_effect| > 1.0  AND  |terminal_effect| >= 0.5
```

...the chart adds a third marker (triangle outline, amber stroke) at the peak g position, always shown when the peak annotation condition is met. No toggle — peak markers render automatically for qualifying rows. When shown, a dotted connector extends from peak → terminal, showing the dosing-phase trajectory alongside the terminal → recovery dumbbell.

### 2.6 Computation Sequence

1. Fetch `/api/studies/{id}/recovery-comparison` for the selected endpoint
2. Group response rows by dose_level × sex
3. For each row: extract `terminal_effect` (g_terminal), `effect_size` (g_recovery), `p_value`, edge case flags
4. Compute `recovery_pct` and map to verdict using §2.3 thresholds
5. Compute per-panel trend test (Jonckheere-Terpstra across dose groups within each sex) — this is the one new computation not in the existing API
6. Render dual-panel dumbbell chart

**Step 5 note:** The J-T trend test across recovery g values is new and not returned by the current API. Two implementation options: (a) compute client-side from the returned per-dose g values, or (b) add a `trend_p` field to the API response. Client-side is simpler for Phase 1.

---

## 3. Visual Encoding

### 3.1 Layout

**Side-by-side dual panel** — one panel per sex, mirroring the existing D-R chart layout (§12.5). Each panel is an independent dumbbell chart with its own x-axis, sharing a common y-axis (dose labels on the left edge, shared between panels). This layout enables direct visual comparison of sex differences in recovery trajectory at each dose level.

```
              F                                           M
              Effect Size (|Hedges' g|)                    Effect Size (|Hedges' g|)
              0    0.5   1.0   1.5   2.0                  0    0.5   1.0   1.5   2.0   2.5   3.0   3.5
              │     │     │     │     │                    │     │     │     │     │     │     │     │
 Control      │     │     │     │     │                    │     │     │     │     │     │     │     │
              │     │     │     │     │                    │     │     │     │     │     │     │     │
 2 mg/kg      │ ◄──●━━━○  │     │     │  p=0.178          │ ○◄━━━●    │     │     │     │     │     │  p=0.546
              │     │     │     │     │                    │     │     │     │     │     │     │     │
 20 mg/kg     │     │  ●━━━━━━━━━○►  │  p=0.041*          │   ○◄━●    │     │     │     │     │     │  p=0.333
              │     │     │     │     │                    │     │     │     │     │     │     │     │
 200 mg/kg    │     │     │●━━━○►    │  p=0.090†          │     │     │     │     │  ●━━━━━━━━━━━━○►│  p=0.002*
              │     │     │     │     │                    │     │     │     │     │     │     │     │

              Sig. at 20 mg/kg (ANCOVA)                   Sig. at 200 mg/kg (ANCOVA)
              Trend: p=0.003 (J-T)                        Trend: p<0.001 (J-T)

● = Terminal (D92)     ○ = Recovery (D106)     ► = Farther from control     ◄ = Closer to control
━ = p < 0.05           ╌ = p ≥ 0.05
```

#### Panel structure

| Element | Specification |
|---------|--------------|
| Panel arrangement | Two panels side by side, equal width, separated by 24px gutter |
| Panel header | Sex label ("F" / "M") centered above each panel, matching existing D-R chart style |
| Y-axis (dose labels) | Shared — dose labels appear once on the far left, aligned to both panels. Includes Control row (no dumbbell, just a reference point or omitted). |
| X-axis | Independent per panel — auto-scaled to the max value within that sex's data + 10% padding. This prevents a large male effect from compressing small female effects. |
| X-axis sync option | Toolbar toggle: "Sync axes" — when enabled, both panels share the same x-axis scale (max across both sexes). Default: off (independent scaling). Synced mode is useful when cross-sex magnitude comparison matters. |
| Panel footer | Per-panel summary: pairwise significance callout + Jonckheere-Terpstra trend test p-value (matching existing D-R chart footer format) |
| Zero reference line | Vertical line at x = 0 in each panel |
| Grid lines | Per-panel, same style as §3.7 |

#### Control row behavior

The control row appears at the top of each panel's y-axis for visual anchoring (dose = 0 always sits at the top). Since control Δ from control = 0 by definition, this row has no dumbbell. Options:

- **Option A (recommended):** Show a single gray dot at x = 0, labeled with the control group mean value (e.g., "0.89" for F control, "1.45" for M control). This mirrors the reference chart's pattern of showing the control value as a baseline.
- **Option B:** Omit the control row entirely. Dose labels start at low dose.

#### Panel footer: trend test and pairwise summary

Each panel includes a footer block below the chart area (inside the panel border), matching the format from the existing D-R chart:

```
Sig. at {dose_list} ({pairwise_method})
Trend: p={trend_p} (Jonckheere-Terpstra)
```

- `{dose_list}`: comma-separated doses where `P_VALUE_RECOVERY < 0.05`
- `{pairwise_method}`: from analysis settings (default "ANCOVA-adjusted" or "Dunnett's")
- `{trend_p}`: Jonckheere-Terpstra trend test across recovery deltas. Bolded + red if p < 0.05, red if p < 0.01, bold red if p < 0.001.

These trend statistics are computed on the `DELTA_RECOVERY` values across dose groups within each sex.

### 3.2 Dot Encoding

| Element | Terminal (D_terminal) | Recovery (D_recovery) |
|---------|----------------------|----------------------|
| Shape | Filled circle | Hollow circle (stroke only) |
| Size | 6px radius (default), 7px on hover | Same |
| Color | `#94A3B8` (slate-400), modulated by significance tier opacity (§3.3) | Same |
| Fill | Solid fill | Background color (transparent) |
| Stroke | None | 2.5px stroke |

### 3.3 Color Encoding — Significance Only

**No verdict-based color.** Direction (arrow left/right) and position relative to zero already communicate whether an effect is recovering or worsening. Adding red/green/amber on top is redundant. The only visual encoding beyond position is **statistical confidence**.

All connectors use a single neutral color, modulated by significance tier:

| Significance | Connector color | Opacity | Dash | Dot fill/stroke |
|-------------|----------------|---------|------|----------------|
| p < 0.05 | `#94A3B8` (slate-400) | 1.0 | Solid, 3px | Full |
| 0.05 ≤ p < 0.10 | `#94A3B8` | 0.6 | Solid, 2px | 60% |
| p ≥ 0.10 | `#94A3B8` | 0.35 | `6,4` dashed, 2px | 35% |

The terminal dot is always filled; the recovery dot is always hollow (stroke only). This filled/hollow distinction is the primary way the reader identifies which timepoint is which — it doesn't need color to help.

**Why this works:** In the existing D-R chart (Image: dose-response bars), dose-level color bars already communicate the dose identity. In the dumbbell, dose identity is on the y-axis. The reviewer's eyes go: (1) which dose? → y-axis label, (2) which direction? → arrow, (3) how far? → dot positions, (4) is it real? → solid/dashed. Color would be a fifth channel competing with four that already work.

**Verdict label:** Instead of encoding the verdict in color, show it as a **text label** to the right of the p-value badge — e.g., "Partial", "Worsening", "Reversed". Styled in the same neutral slate, matching the pane's verdict-first approach. The label is informational, not a visual encoding.

### 3.4 Connector Line

Single color (`#94A3B8` slate-400), modulated by significance only:

| Property | Significant (p < 0.05) | Trending (p < 0.10) | Not significant |
|----------|----------------------|-------------------|-----------------|
| Color | `#94A3B8` | `#94A3B8` | `#94A3B8` |
| Stroke width | 3px | 2px | 2px |
| Dash pattern | Solid | Solid | `6,4` dashed |
| Opacity | 1.0 | 0.6 | 0.35 |

### 3.5 Arrow Head

Triangular arrowhead (5px) at the recovery dot position, same color and opacity as the connector. Points in the direction of movement along the x-axis: right if `|g_recovery| > |g_terminal|` (effect grew — worsening), left if `|g_recovery| < |g_terminal|` (effect shrank — recovering). For OVERCORRECTED, arrow points left past the zero line.

### 3.6 P-Value Badge and Verdict Label

Right-aligned per row, outside the chart area. Two elements stacked:

**P-value badge:**

| Significance | Background | Border | Text Color | Font Weight |
|-------------|-----------|--------|-----------|-------------|
| p < 0.05 | `#1a2e1a` | `#2E7D32` | `#4ADE80` | 600 |
| p < 0.10 | `#2a2010` | `#B45309` | `#FBBF24` | 400 |
| p ≥ 0.10 | `#1a1a2e` | `#334155` | `#64748B` | 400 |

Format: `p=0.041` (3 decimal places). If p < 0.001: `<.001`.

**Verdict label** (below the p-value badge): Plain text in `#94A3B8`, 10px. Shows the classification word — "Partial", "Worsening", "Reversed", etc. For "Not assessed" rows: show `(|g| = {g_terminal})` after the label, matching the existing pane format (Image 1: `Not assessed (terminal |g| = 0.25 D92)`).

### 3.7 Axis and Grid

- X-axis: `|g|` values (absolute Hedges' g). Scale auto-ranges per panel to max |g| across all rows in that sex + 10% padding.
- Zero reference line: 1.5px solid, represents "no difference from control" (g = 0)
- Grid lines: every 0.5 g units, dashed `3,4`, color `#1E293B`
- X-axis label: "Effect Size (|Hedges' g|)"
- Left annotation: "← Closer to control" at zero; "Farther from control →" at right edge

### 3.8 Endpoint-Specific Rendering

Different endpoint types have different timecourse data availability, which affects what the dumbbell chart can show — particularly the peak-during-dosing context. The chart adapts per domain.

#### Body Weight (BW) — rich timecourse, peak often pre-terminal

BW is measured weekly throughout the study. The peak effect vs control often occurs mid-dosing (e.g., Day 15) and partially resolves before terminal sacrifice. This means the terminal dot underrepresents the actual severity experienced during dosing.

```
BW — 200 mg/kg Female
                 Peak context (toggle on)
                 ◇                                     
  |g|  0    1    2    3    4    5
        │    │    │    │    │    │
        │    │    ●━━━━━━━━○◄   │              p=0.023   Partial
        │    │    │    │    │    │
        │    ◇····│····│····│····│  ← peak g=4.51 at D15 (faded diamond)
        │    │    │    │    │    │

  Without peak toggle: just ●━━━○◄  (terminal → recovery, simple dumbbell)
  With peak toggle: ◇·····●━━━○◄   (peak → terminal → recovery, triple-dot)
```

The peak diamond is connected to the terminal dot with a dotted line (showing the partial resolution that occurred during dosing, before recovery even started). This addresses the problem from recovery-pane-spec §1: "Peak effects during dosing are invisible."

The companion **time-course chart** (Image 2) shows this same trajectory as a line plot with error bars over study days, with the recovery boundary marked. The dumbbell summarizes it spatially; the time-course shows it temporally. Both are needed — the dumbbell for cross-dose comparison at a glance, the time-course for detailed trajectory inspection.

#### Clinical Pathology (LB) — interim bleeds may exist

LB has terminal and recovery measurements. Some studies include interim bleeds (e.g., Day 30). When interim data exists, the peak-during-dosing computation uses it. When it doesn't, peak = terminal and no peak annotation appears.

```
LB (ALT) — 200 mg/kg Male
  |g|  0    1    2    3    4
        │    │    │    │    │
        │    │    │ ●━━━━━━━━━━○►    p<0.001   Worsening
        │    │    │    │    │

  No peak context (no interim bleeds) — simple two-dot dumbbell.
  If interim bleed existed and showed |g|=5.2 at D30:
        │    │    │ ●━━━━━━━━━━○►    p<0.001   Worsening
        │    │    │    │    ◇  ← peak g=5.2 at D30
```

#### Organ Measurements (OM) — terminal and recovery only

OM is collected only at necropsy. No timecourse data exists, so peak = terminal by definition. Peak annotation never triggers. The dumbbell is always a simple two-dot design.

```
OM (Liver — absolute) — 200 mg/kg Female
  |g|  0    1    2    3
        │    │    │    │
        │    │ ●━━━○◄  │              p=0.045   Reversing
        │    │    │    │

  Always simple two-dot. No peak toggle available for OM.
```

#### Food/Water Consumption (FW) — periodic measurements

FW is measured in intervals (typically weekly). Peak computation works the same as BW — scan all intervals during dosing for max |g|.

#### Summary: peak toggle availability by domain

| Domain | Timecourse data | Peak computation | Peak toggle available |
|--------|----------------|------------------|-----------------------|
| BW | Weekly weights | Yes — scan all treatment-period timepoints | Yes |
| LB | Terminal + interim bleeds (if any) | Yes — but only if interim bleeds exist | Conditional |
| OM | Terminal + recovery only | No — peak = terminal | No (grayed out) |
| FW | Periodic intervals | Yes — scan all treatment-period intervals | Yes |

When "Show peak" is toggled on but the selected endpoint has no peak data (OM, or LB without interim bleeds), the toggle has no effect and should show a tooltip: "No timecourse data available for this endpoint."

---

## 4. Statistical Significance Treatment

### 4.1 Design Rationale

Recovery cohorts are typically powered at n = 5–10 per group vs n = 10–20 for terminal sacrifice. This means many biologically real effects will fail to reach p < 0.05 in recovery comparisons. The visualization must communicate this without either dismissing non-significant results or overstating them.

Design principles:

1. **Show everything.** Never hide non-significant rows. A worsening effect at p = 0.09 in a group of 5 animals is clinically important.
2. **Encode confidence visually, not as a binary gate.** Use a three-tier system (significant / trending / not significant) mapped to opacity + line style, not a show/hide filter.
3. **Anchor the reader on biology first, statistics second.** The trajectory direction and magnitude are primary (position, color). Statistical confidence is secondary (opacity, dash pattern, badge).
4. **Include a power caveat.** Persistent footer note explains why non-significance ≠ no effect in recovery cohorts.

### 4.2 Three-Tier Significance System

| Tier | Threshold | Label in tooltips/exports | Visual treatment |
|------|-----------|--------------------------|------------------|
| Significant | p < 0.05 | "Statistically significant" | Full opacity, solid connector, green badge |
| Trending | 0.05 ≤ p < 0.10 | "Trending (approaching significance)" | 65% opacity, solid connector, amber badge |
| Not significant | p ≥ 0.10 | "Not statistically significant" | 40% opacity, dashed connector, gray badge |

### 4.3 Footer Power Note

Always visible below the chart:

> **⚠ Statistical power note:** Recovery cohorts typically have smaller group sizes (n = 5–10 vs n = 10–20 terminal). Non-significant p-values do not rule out biologically meaningful effects. Dashed connectors indicate p ≥ 0.05. Solid lines = p < 0.05. All comparisons vs. concurrent control by {stat_method}.

`{stat_method}` is populated from the analysis settings — defaults to "Dunnett's test" for multi-dose designs, "Dunn's test" for two-group designs.

### 4.4 Optional: Confidence Band Overlay

**Not implementing.** CI overlay requires toolbar toggle (§6) which is not being implemented for the context-panel chart.

Toggle in viewer toolbar: "Show 95% CI". When enabled, each dot gains a horizontal error bar showing the 95% confidence interval of the group mean difference from control. This lets the reviewer see whether the CI for a "not significant" result is wide (low power — can't conclude anything) vs narrow (genuinely close to zero — real absence of effect).

Columns required: `CI_LOWER_TERMINAL`, `CI_UPPER_TERMINAL`, `CI_LOWER_RECOVERY`, `CI_UPPER_RECOVERY` (add to schema if toggle is enabled).

---

## 5. Interaction Model

### 5.1 Hover

Hover detail follows the same data structure as recovery-pane-spec §6.4, adapted for the chart context.

| Target | Behavior |
|--------|----------|
| Row (anywhere) | Highlight row background. Show tooltip above connector with verdict + recovery %: `{Verdict} · Δ {narrowed/grew} {recovery_pct}% (g: {g_terminal} → {g_recovery})` |
| Terminal dot | Show tooltip matching pane hover detail: `D{terminal_day}: treated {treated_mean_terminal} vs control {control_mean_terminal} · Δ = {delta} · g = {g_terminal} · p = {p_terminal}` |
| Recovery dot | Same format: `D{recovery_day}: treated {mean} vs control {control_mean} · Δ = {delta} · g = {g_recovery} · p = {p_value}` |
| P-value badge | Show tooltip: `{stat_method}, n = {treated_n} (recovery) vs n = {control_n} (control)` |
| Peak marker (if shown) | `Peak during dosing: g = {peak_effect} at D{peak_day}` |

When the peak context annotation is triggered (§2.5), the row tooltip extends to include the full trajectory summary (recovery-pane-spec §5.4):

```
Peak (D{peak_day}): g = {peak_effect} → Terminal (D{terminal_day}): g = {g_terminal} → Recovery (D{recovery_day}): g = {g_recovery}
         ╰── {pct1}% resolved during dosing ──╯    ╰── {pct2}% {worsened/recovered} ──╯
```

Note: "Terminal and recovery groups are independent cohorts" — this clarification appears at the bottom of any hover tooltip, per recovery-pane-spec §10.6.

### 5.2 Click

| Target | Behavior |
|--------|----------|
| Row | Select the corresponding dose × sex for context panel. Triggers RecoveryPane update (§5.4) with the selected dose + sex filter. Propagates selection to linked viewers via Datagrok's standard selection sync. |
| Terminal dot | Navigate to the terminal timepoint data for this dose group in the domain view (e.g., BW domain filtered to DOSE_LEVEL + SEX + terminal sacrifice day) |
| Recovery dot | Same, filtered to recovery sacrifice day |

### 5.3 Filter Interaction

The chart responds to the view-level filter panel:

| Filter | Effect on chart |
|--------|----------------|
| ENDPOINT_ID | Changes which endpoint is displayed. Chart redraws with new data. One endpoint at a time (primary control). |
| SEX | Show/hide entire panel. Default: both panels visible. Selecting a single sex collapses to a single full-width panel. |
| DOSE_RANK | Show/hide dose rows. Default: all non-control doses visible. |
| TRAJECTORY | Filter to specific verdict types (e.g., show only Worsening). Options mirror §2.3 verdicts. |
| SIG_RECOVERY | Filter by significance tier (sig / trend / ns). |

### 5.4 Context Panel Integration

When a row is selected (clicked), the context panel shows the **existing Recovery Detail Pane** (`RecoveryPane.tsx`, 775L) — not a new pane. The pane already provides:

- Verdict badge with classification definition tooltip
- Δ narrowed/grew percentage with g trajectory (`g: terminal → recovery`)
- p-value (always shown, no threshold gate — users need it to assess verdict reliability)
- Peak context annotation when triggered (§5.1 conditions from recovery-pane-spec)
- Hover detail with full raw breakdown (treated/control means, delta, g, % diff at both timepoints)
- Severity grade shift annotations for histopath (Improving/Progressing/Reducing/Mixed)
- Finding nature + concordance check (expected reversibility vs observed)
- Control drift warning when control shifted >15%
- Edge case degraded states (n=1, no concurrent control, below threshold)

The dumbbell chart row click sets the endpoint + dose + sex filter that the RecoveryPane consumes. No new pane needed — the dumbbell and pane are complementary surfaces over the same data.

---

## 6. Toolbar Controls

> **Not implementing.** The inline context-panel dumbbell chart does not include toolbar controls. The compact visualization serves its purpose without configuration UI. The controls below are retained as reference only.

Viewer-level toolbar (above chart, right-aligned):

| Control | Type | Default | Effect |
|---------|------|---------|--------|
| Metric | Dropdown | "Hedges' g" | Switch x-axis between `|g|` (Hedges' g — default, unitless) and `% diff from control` (requires API extension). |
| Show peak | Toggle | Off | When on, adds a diamond marker at the peak-during-dosing g position for rows where the peak annotation condition is met (§2.5). Extends connector to show peak → terminal → recovery trajectory. |
| Show CI | Toggle | Off | Overlay 95% confidence interval error bars on dots (§4.4) |
| Sync axes | Toggle | Off | When on, both F/M panels share the same x-axis scale (max |g| across both sexes). Default: off (independent scaling per panel). |
| Sort by | Dropdown | "Dose (ascending)" | Options: "Dose (ascending)", "Effect size (terminal)", "Effect size (recovery)", "Verdict" |
| Export | Button | — | Export chart as SVG or PNG. Include title, legend, footer note, and data table. |

---

## 7. Edge Cases

All edge cases align with the shipped recovery pane behavior (recovery-pane-spec §10). The dumbbell chart surfaces the same flags and degraded states, adapted for the chart rendering context.

### 7.1 No Recovery Group (recovery-pane-spec §10.1)

Study design does not include a recovery sacrifice. Chart is not rendered. The visualization selection algorithm (§1) suppresses this viewer entirely.

### 7.2 No Concurrent Recovery Control (recovery-pane-spec §10.4)

Some 3Rs-optimized designs omit recovery controls. Backend emits `no_concurrent_control = true`.

- Add a warning badge to the chart title: **"⚠ No concurrent recovery control — compared to terminal control (D{terminal_day})"**
- Rows render with amber warning icon next to dose label
- Footer note adds: "Absence of concurrent recovery control limits interpretability. Differences may reflect time-dependent changes unrelated to treatment."
- Verdict classification falls back to raw delta comparison with caveat (per recovery-pane-spec §10.4)

### 7.3 Single Recovery Dose Group

When only the high dose has recovery animals (common design: control + high dose only in recovery):

- Chart shows a single row per panel
- Still renders — a one-row dumbbell is more informative than a table cell
- J-T trend test is suppressed (requires ≥ 3 dose levels). Panel footer shows only pairwise significance.
- Developer review: consider a paired horizontal bar layout for single-dose recovery designs

### 7.4 Recovery Period Override Applied

When the user has overridden the autodetected recovery period (`override_reader.py` → `analysis_settings.json`):

- Chart subtitle: "Recovery period: D{start}–D{end} (user override)"
- Pencil icon in header links to the recovery start day override UI (checkbox + number input, per TOPIC §Recovery Start Day Override)
- Override propagates through the standard invalidation chain — chart re-renders automatically

### 7.5 Overcorrection Past Zero (recovery-pane-spec §4.3)

When an effect changes sign during recovery (e.g., treated > control at terminal → treated < control at recovery) AND `|g_recovery| ≥ 0.5`:

- The recovery dot appears on the opposite side of zero from the terminal dot
- The connector line crosses the zero reference line
- Color = purple (Overcorrected)
- X-axis uses signed g values (not |g|) for both dots in this row, with the zero line as reference
- This is biologically unusual — the overcorrection flag in the tooltip directs the reviewer to investigate

### 7.6 Very Small Effects at Terminal — Not Assessed (recovery-pane-spec §4.1)

When `|g_terminal| < 0.5` (prerequisite gate):

- Row renders in light gray (`#BBBBBB`) with dotted connector
- Verdict label: "Not assessed"
- Tooltip: "Terminal effect below assessment threshold (|g| < 0.5) — recovery trajectory not assessable"
- The row is still visible (not hidden) to show the reviewer which dose groups had negligible terminal effects

### 7.7 Insufficient N (recovery-pane-spec §10.5)

When `insufficient_n = true` (n < 2 at recovery sacrifice, backend flag):

- Row renders in gray with dotted connector
- Label next to dose: "n={n} — insufficient for classification"
- No verdict assigned, no p-value badge
- Individual data point shown in tooltip for reference

### 7.8 Control Group Drift (recovery-pane-spec §4.3)

When control group mean shifted >15% between terminal and recovery (computed from `control_mean` vs `control_mean_terminal`):

- Drift warning icon (⚠) next to dose label
- Tooltip: "Control group shifted {drift_pct}% between terminal and recovery; classification may be affected by background drift"
- Verdict classification unchanged — drift is informational, not corrective

### 7.9 Unequal Group Sizes

Recovery groups sometimes lose animals to unscheduled deaths (early death exclusion — dual-pass per TOPIC §Early Death Exclusion). When `treated_n` < expected:

- Small `n={treated_n}` annotation next to dose label
- If `treated_n` < 3 (`MIN_RECOVERY_N` from recovery-assessment.ts): row classified per `insufficient_n` handling (§7.7)

---

## 8. Integration Points

### 8.1 Relationship to Time-Course Chart

The dumbbell chart and the time-course chart (Image 2) are **complementary viewers** answering different questions about the same data:

| | Dumbbell chart | Time-course chart |
|-|---------------|-------------------|
| **Question** | "Did the effect resolve?" | "How did values change over time?" |
| **Axis** | Effect size (g) — spatial | Study day — temporal |
| **Strength** | Compare all doses at once, see direction instantly | See full trajectory, error bars, individual variability |
| **Shows** | Summary: 2 (or 3) dots per dose | Detail: every timepoint, all dose lines overlaid |
| **Metric** | Control-normalized (g or Δ) | Raw values (with Absolute / % change / % vs control toggle) |

**Recommended layout in View 5:** Dumbbell chart in the upper panel (primary — answers "did it recover?"), time-course chart in the lower panel (detail — shows the how and when). Selecting an endpoint in the filter updates both simultaneously. Selecting a dose row in the dumbbell highlights the corresponding dose line in the time-course chart.

When the dumbbell's "Show peak" toggle is on, the peak diamond on the dumbbell corresponds to the highest point on the time-course line during the treatment period. The time-course chart already shows this — the dumbbell peak marker is a spatial summary of the same information.

### 8.2 View 5 Placement

Primary viewer in the Recovery & Reversibility view. Upper-center panel (~55% width). Time-course chart in the lower-center panel (~45%). Both linked to the endpoint filter (left panel) and the Recovery Detail Pane (context panel, right).

### 8.3 View 2 Embedding

Embeddable as a secondary panel in the Dose–Response & Causality view. When the reviewer selects an endpoint in View 2 that has recovery data, a "Recovery trajectory" tab appears in the lower panel. Clicking it renders the dumbbell chart for the selected endpoint only, filtered to the current sex selection.

### 8.4 Study Summary Cross-Link

View 1 (Study Summary) may surface a reversibility warning from the insight engine (e.g., "High-dose BW effect worsened during recovery"). Clicking this warning navigates to View 5 with the endpoint pre-filtered to BW and the corresponding dumbbell row highlighted.

### 8.5 Export / Report

When included in the generated report (§15), the chart renders as a static SVG with the footer note, legend, and a data table below. The data table reproduces the backing `recovery_trajectory_metrics` rows for the selected endpoint, formatted as:

| Sex | Dose | Verdict | g (terminal) | g (recovery) | Recovery % | p (recovery) | N (recovery) |
|-----|------|---------|-------------|-------------|-----------|-------------|-------------|

---

## 9. Open Questions

### Resolved by shipped system

1. ~~**TRAJECTORY thresholds.**~~ **Resolved.** The shipped 8-verdict system (recovery-pane-spec §4.2) uses recovery_pct boundaries: ≥80% = Reversed, 50–80% = Reversing, 20–50% = Partial, <20% = Persistent, <0% = Worsening. Plus the Resolved gate (`|g| < 0.5 AND pct ≥ 80%`) and Overcorrected (sign change + `|g| ≥ 0.5`). These are endpoint-agnostic.

2. ~~**Overcorrection significance.**~~ **Resolved.** The recovery comparison p-value (treated vs control at recovery) is used. No paired terminal-vs-recovery shift test.

### Remaining

3. **Multi-timepoint recovery.** Some studies have interim recovery sacrifices (e.g., D92 terminal, D106 interim, D120 final). The current API returns one recovery timepoint. Options: (a) triple-dot dumbbell (peak → terminal → recovery), (b) timepoint selector dropdown, (c) extend API to return multiple recovery timepoints. The "Show peak" toggle (§6) partially addresses this by showing the dosing-period peak. **Decision needed before multi-timepoint studies are encountered.**

4. **Historical control overlay.** Should the chart support overlaying HCD variability as a shaded band on the x-axis to contextualize effect magnitudes? The HCD system exists (TOPIC-hcd) but is not currently wired to recovery views.

5. ~~**Categorical endpoint equivalent.**~~ **Partially resolved.** Histopathology recovery uses incidence-based classification with severity grade shifts (recovery-pane-spec §9). The dumbbell chart is continuous-only (§1 activation conditions). Histopath recovery visualization is handled by the existing dose incidence/severity charts with recovery bars (recovery-dose-charts-spec.md, 619L — listed in TOPIC). **No gap, but confirm whether a separate histopath recovery summary chart is needed.**

6. **J-T trend test computation.** The per-panel Jonckheere-Terpstra trend test across recovery g values is the one new statistical computation not in the existing API (§2.6). Confirm whether client-side computation (from returned per-dose g values) is acceptable for Phase 1, or whether this should be a backend addition.

7. **Sparkline in pane vs chart.** Recovery-pane-spec §6.3 defined an optional sparkline (control-normalized g over time) that was deferred. If implemented, should it appear in the RecoveryPane (context panel) or as an overlay/tooltip in the dumbbell chart? The "Show peak" toggle may make the sparkline less necessary.
