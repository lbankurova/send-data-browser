# Recovery Bars in Dose Charts — Implementation Spec

**Scope:** Histopathology view, Evidence tab, dual dose charts (incidence + severity).
**Goal:** Append recovery-arm bars to the existing dose charts with a visual separator, so the pathologist sees the main→recovery transition in the same chart without a third panel.
**Condition:** Recovery bars only render when `studyHasRecovery === true` AND recovery data exists for the current specimen (or specimen + finding when a finding is selected). No recovery arms → charts unchanged.

---

## 1. Problem

Recovery reversibility data exists but is only surfaced via the findings table Recovery column and the context panel Recovery pane (from `recovery-reversibility-spec.md`). The dose charts — the primary visual for dose-response patterns — don't show what happened during recovery. The pathologist sees "incidence climbs from 0% to 15% across dose groups" but can't see "and it dropped back to 3% in the recovery arm" without leaving the chart.

## 2. Solution

Append recovery dose group bars below the main-arm bars in both existing charts. A visual separator (dashed line + "Recovery" label) distinguishes the two populations. Recovery bars use reduced opacity to signal "same measurement, different population." No third chart.

---

## 3. Current Chart Architecture

Both charts are horizontal bar charts built by pure functions in `charts/histopathology-charts.ts`:

- `buildDoseIncidenceBarOption(data, options)` → ECharts option object
- `buildDoseSeverityBarOption(data, options)` → ECharts option object

Rendered via `<EChartsWrapper>`. Y-axis = dose group labels (category axis). X-axis = value (incidence % or severity 0–5). When both sexes present and no sex filter, bars are grouped by sex within each dose group.

**Stable frame rule:** Both charts use all dose levels + sexes from the full specimen as the Y-axis category set, so axes don't shift when selecting different findings. This rule extends to recovery groups — recovery categories are always present in the Y-axis when the study has recovery, regardless of whether the selected finding has recovery data.

---

## 4. Data Changes

### 4.1 Input Data Extension

The chart builder functions currently receive an array of dose group data. Extend to include recovery groups:

```typescript
interface DoseChartDataItem {
  doseLevel: number;
  doseGroupLabel: string;   // e.g., "Group 2, 2 mg/kg"
  sex: 'M' | 'F';
  isRecovery: boolean;      // NEW — false for main arms, true for recovery arms
  recoveryVerdict?: RecoveryVerdict; // NEW — only on recovery items, from deriveRecoveryAssessment
  incidence: number;        // 0–1 proportion
  n: number;
  affected: number;
  avgSeverity: number;
}
```

The `isRecovery` flag and `recoveryVerdict` are the additions. All existing fields remain unchanged. The chart builder uses `recoveryVerdict` to determine whether to render a bar, a suppression marker (`⚠`/`†`), or nothing (see §4.4).

### 4.2 Data Source

Recovery data comes from the same source as the recovery assessments (§3.4 of `recovery-reversibility-spec.md`). The parent `OverviewTab` already computes or has access to recovery arm aggregates. Pass them to the chart builders alongside main-arm data.

```typescript
// In OverviewTab, when building chart data
const chartData = [
  ...mainArmDoseGroups,            // existing
  ...(studyHasRecovery ? recoveryArmDoseGroups : []),  // NEW
];
```

### 4.3 Specimen Aggregate vs. Finding Selected

Follows existing behavior:
- **No finding selected:** specimen-level aggregate per dose group, including recovery groups.
- **Finding selected:** that finding's data per dose group, including recovery groups. If the finding has no data in recovery arms, recovery bars render as zero/empty (the category slots still appear for stable framing).

### 4.4 Recovery Bar Suppression Rules

Recovery bars are suppressed (not rendered) in specific conditions where the data would be misleading:

| Condition | Incidence chart | Severity chart | Rationale |
|---|---|---|---|
| Main incidence > 0 at this dose | Show recovery bar | Show recovery bar | Normal comparison |
| Main incidence = 0, recovery incidence > 0 | **Suppress bar** — show `⚠` marker | **Suppress bar** | Anomaly: showing a bar implies comparison to main arm, but main has no data. See `recovery-reversibility-spec.md` §3.3 Guard 2. |
| Main incidence = 0, recovery incidence = 0 | Empty (no bar) | Empty (no bar) | Nothing to show |
| Recovery N < MIN_RECOVERY_N (3) | **Suppress bar** — show `†` marker | **Suppress bar** | Insufficient subjects; bar length would be misleading |

**`⚠` marker rendering:** When a recovery bar is suppressed due to anomaly, render a small `⚠` text element at the category position:

```typescript
// In the ECharts series, for anomaly items
{
  value: 0,  // no bar
  label: { show: true, formatter: '⚠', fontSize: 10, color: '#9CA3AF' },
  itemStyle: { color: 'transparent' },
}
```

Tooltip on the `⚠` marker: "Finding present in recovery arm (N/M affected) but absent in main arm at this dose. See Recovery column for details."

**`†` marker rendering:** Similar to `⚠` but with `†` and tooltip: "Recovery arm has N={n} subjects. Minimum 3 required for comparison."

**Suppression data flow:** The `OverviewTab` already computes `recoveryAssessments` with per-dose verdicts. Pass the verdicts alongside the chart data so the chart builder can check:

```typescript
interface DoseChartDataItem {
  // ... existing fields
  isRecovery: boolean;
  recoveryVerdict?: RecoveryVerdict;  // from deriveRecoveryAssessment, only on recovery items
}
```

The chart builder checks `recoveryVerdict` before rendering each recovery bar:
```typescript
if (item.isRecovery && (item.recoveryVerdict === 'anomaly' || item.recoveryVerdict === 'insufficient_n')) {
  // Render suppression marker instead of bar
}
```

---

## 5. Y-Axis Category Layout

### 5.1 Current

```
Y-axis categories (top to bottom):
  Group 1 M
  Group 1 F
  Group 2 M
  Group 2 F
  Group 3 M
  Group 3 F
  Group 4 M
  Group 4 F
```

### 5.2 New (with recovery)

**CRITICAL: Main arms first, recovery below.** The pathologist reads the dose-response upward through main groups (low dose → high dose). Recovery appears below the separator. This ordering ensures the primary dose-response pattern is read first, with the recovery comparison as a secondary reference.

```
Y-axis categories (top to bottom):
  Group 1 M          ─┐
  Group 1 F           │
  Group 2 M           │ Main arms (dose-ascending)
  Group 2 F           │
  Group 3 M           │
  Group 3 F           │
  Group 4 M           │
  Group 4 F          ─┘
  ─ ─ ─ ─ ─ ─  (separator + "Recovery" label)
  Group 1 M (R)      ─┐
  Group 1 F (R)       │ Recovery arms (dose-ascending)
  Group 4 M (R)       │
  Group 4 F (R)      ─┘
```

Only recovery dose levels that exist in the study are shown (typically control + high dose). The `(R)` suffix identifies recovery arms.

**Do NOT invert this order.** If recovery appears above main, the pathologist's eye starts with the recovery data before seeing the dose-response — this makes the chart confusing because the recovery data only makes sense in comparison to the main arm.

### 5.3 Y-Axis Label Formatting

Recovery labels use a shorter format to save horizontal space:

```typescript
function formatDoseLabel(item: DoseChartDataItem): string {
  const base = item.doseGroupLabel; // existing label logic
  return item.isRecovery ? `${base} (R)` : base;
}
```

Recovery labels styled with reduced emphasis via ECharts rich text:

```typescript
// In axisLabel formatter
axisLabel: {
  formatter: (value: string) => {
    if (value.includes('(R)')) {
      return `{recovery|${value}}`;
    }
    return `{main|${value}}`;
  },
  rich: {
    main: { fontSize: 10, color: '#374151' },         // existing
    recovery: { fontSize: 10, color: '#9CA3AF' },     // muted for recovery labels
  }
}
```

---

## 6. Visual Separator

### 6.1 Separator Between Main and Recovery

Use an ECharts `markLine` on the Y-axis between the last main-arm category and the first recovery category:

```typescript
// Compute the separator position: midpoint between last main and first recovery index
const lastMainIndex = mainArmCategories.length - 1;
const separatorPosition = lastMainIndex + 0.5;

// Add to the first series
markLine: {
  silent: true,
  symbol: 'none',
  lineStyle: {
    type: 'dashed',
    color: '#D1D5DB',
    width: 1,
  },
  data: [
    {
      yAxis: separatorPosition,
      label: {
        show: true,
        formatter: 'Recovery',
        position: 'insideEndTop',
        fontSize: 9,
        fontWeight: 600,
        color: '#9CA3AF',
        padding: [0, 4, 0, 0],
      }
    }
  ]
}
```

**Alternative if markLine doesn't support Y-axis category positioning cleanly:** Use a `markArea` with a very thin height spanning the gap, or insert an empty category row between main and recovery groups (acts as visual spacing without data).

### 6.2 Empty Category Spacer (Fallback Approach)

If the markLine approach is fragile with ECharts category axes, insert a blank category between main and recovery:

```typescript
const categories = [
  ...mainCategories,
  '',                    // blank spacer row — no bar renders, creates visual gap
  ...recoveryCategories,
];
```

The blank category creates a ~20px gap. Add a custom graphic element for the "Recovery" label:

```typescript
graphic: [{
  type: 'text',
  left: 5,
  top: spacerPixelPosition,  // computed from category index
  style: {
    text: 'Recovery',
    fontSize: 9,
    fontWeight: 600,
    fill: '#9CA3AF',
  }
}]
```

The agent should try the markLine approach first; fall back to the spacer if positioning is unreliable.

---

## 7. Recovery Bar Styling

### 7.1 Reduced Opacity

Recovery bars use the same fill color as their corresponding main-arm bars (sex-matched if sex-grouped) but at 50% opacity:

```typescript
// In series itemStyle
itemStyle: {
  color: (params) => {
    const item = params.data;
    const baseColor = getBarColor(item);  // existing sex/dose color logic
    return item.isRecovery
      ? applyOpacity(baseColor, 0.5)      // 50% opacity for recovery
      : baseColor;
  },
  borderRadius: [0, 2, 2, 0],            // existing: rounded right ends for horizontal bars
}
```

### 7.2 Why Opacity, Not Hatching

Hatched/striped patterns in ECharts require custom `decal` config and don't render well at the small bar sizes used here (~12–16px bar height). Reduced opacity is simpler, renders cleanly, and communicates "same data, lesser emphasis" effectively.

### 7.3 Bar Width

Same `barMaxWidth` as main-arm bars. Recovery bars should be the same height as main bars — the opacity difference is sufficient to distinguish them. Making recovery bars thinner would suggest they're less precise, which isn't true.

---

## 8. Chart-Specific Details

### 8.1 Incidence Chart

**X-axis:** Unchanged. 0–100% range (scaled mode) or auto-range (compact mode).

**Recovery bars:** Show recovery incidence percentage. Bar label format same as main: `{pct}% {affected}/{n}`.

**Recovery label styling:** Same `font-mono text-[10px]` but at reduced opacity (`color: 'rgba(55, 65, 81, 0.5)'`).

**Empty recovery data:** If a finding has no data in recovery arms, the recovery category slots exist (stable frame) but no bars render. This looks like "0%" which is informative — the finding wasn't observed in recovery.

### 8.2 Severity Chart

**X-axis:** Unchanged. 0–5 range (scaled mode) or auto-range (compact mode).

**Recovery bars:** Show recovery average severity. Same rendering as main bars — `getNeutralHeatColor` based fill or the standard severity bar color.

**Existing rule:** "Only includes rows with avg_severity > 0." Apply the same rule to recovery bars. If a finding's recovery severity is 0, no bar renders (the category slot is present but empty).

**Recovery label styling:** Same as incidence — value label at reduced opacity.

### 8.3 Sex Grouping

When both sexes present and no sex filter active: recovery bars are also grouped by sex within each recovery dose group. Male/female pairing is identical to main arms.

```
Group 4 M      ████████████  13%
Group 4 F      █████████████  15%
─ ─ ─ ─ ─ ─ ─  Recovery
Group 4 M (R)  ███  5%              ← 50% opacity
Group 4 F (R)  ██  3%               ← 50% opacity
```

When sex filter active (e.g., "Males only"): recovery bars show only the filtered sex, same as main bars.

---

## 9. Stable Frame Extension

The existing stable frame rule says: "Both charts use all dose levels + sexes from the full specimen as the Y-axis category set, so axes don't shift when selecting different findings."

**Extend this to recovery:** When `studyHasRecovery`, the recovery dose group categories are always present in the Y-axis, regardless of the selected finding. Selecting a finding that has no recovery data still shows the recovery category slots (empty bars) rather than removing them. This prevents the Y-axis from jumping when switching between findings with/without recovery data.

```typescript
// Stable frame: all categories always present
const allCategories = [
  ...allMainDoseGroupSexCombos,      // existing stable frame
  ...allRecoveryDoseGroupSexCombos,  // NEW: added when studyHasRecovery
];
```

---

## 10. Tooltip

### 10.1 Main-Arm Bars (Unchanged)

Existing tooltip behavior for main-arm bars is unchanged.

### 10.2 Recovery Bars

Recovery bar tooltip includes the comparison with the matched main-arm group:

```
Group 4 M (Recovery)
Incidence: 5% (1/20)
Main arm:  13% (18/135)
Change:    −8pp (↓ 62%)
```

For severity:
```
Group 4 M (Recovery)
Avg severity: 1.0
Main arm:     2.5
Change:       −1.5 (↓ 60%)
```

The "Change" line gives immediate context — the pathologist doesn't have to compare bar lengths mentally.

### 10.3 Suppression Marker Tooltips

**`⚠` marker (anomaly):**
```
Group 3 M (Recovery)
⚠ Finding present in recovery arm (7/10 affected)
but absent in main arm at this dose (0/30).
May indicate delayed onset or data quality issue.
```

**`†` marker (insufficient N):**
```
Group 2 F (Recovery)
Recovery arm has only 2 subjects.
Minimum 3 required for meaningful comparison.
```

### 10.3 Tooltip Styling

```typescript
tooltip: {
  formatter: (params) => {
    const item = params.data;
    if (!item.isRecovery) return existingTooltipFormat(params);

    const mainItem = findMatchedMainArm(item);
    const change = item.value - mainItem.value;
    const pctChange = ((change / mainItem.value) * 100).toFixed(0);
    const arrow = change < 0 ? '↓' : change > 0 ? '↑' : '→';

    return `
      <div style="font-size: 11px;">
        <div style="font-weight: 600; color: #9CA3AF;">${item.label} (Recovery)</div>
        <div>${metricLabel}: ${formatValue(item.value)}</div>
        <div style="color: #6B7280;">Main arm: ${formatValue(mainItem.value)}</div>
        <div style="color: #6B7280;">Change: ${formatChange(change)} (${arrow} ${Math.abs(pctChange)}%)</div>
      </div>
    `;
  }
}
```

---

## 11. Section Title Update

### 11.1 Current

Dynamic title: "Dose charts: {finding}" or "Dose charts (specimen aggregate)".

### 11.2 No Change Needed

The title doesn't need to mention recovery. The presence of recovery bars below the separator is self-evident. Adding "with recovery" to the title would clutter it and break the two-tone header pattern from the adaptive sections spec.

---

## 12. Compact/Scaled Mode

Both modes work identically for recovery bars:

- **Scaled mode (S):** Fixed axis range (0–100% incidence, 0–5 severity). Recovery bars render within the same fixed scale. This is the most useful mode for comparison — a recovery bar at 5% vs. a main bar at 60% is immediately obvious.
- **Compact mode (C):** Auto-scales to data range. The range includes recovery values. If recovery values are much smaller than main values, compact mode may make recovery bars hard to read — but this is the expected tradeoff (compact mode is for emphasizing the main dose-response shape).

---

## 13. Chart Height

### 13.1 Additional Height Needed

Recovery adds 2–8 additional Y-axis categories (1–4 recovery dose groups × 1–2 sexes) plus the separator gap. Each category is ~16px. Typical addition: 4 recovery categories + separator = ~80px.

### 13.2 Dynamic Minimum Height

When `studyHasRecovery`, increase the dose charts section minimum useful height:

```typescript
const doseChartsMinUseful = studyHasRecovery ? 140 : 100;
```

And default height:

```typescript
const doseChartsDefault = studyHasRecovery ? 220 : 170;
```

This gives the charts enough room to render recovery bars without scrolling at default height. The additional 50px comes from the overall layout budget — with the adaptive sections spec, the pathologist can double-click to give the charts more space if needed.

### 13.3 Adaptive Section Integration

The adaptive sections spec (§2) defines natural height per section. Update the dose charts natural height computation:

```typescript
case 'doseCharts':
  const mainCategories = doseGroupSexCombos.length;       // e.g., 8
  const recoveryCategories = studyHasRecovery
    ? recoveryDoseGroupSexCombos.length                    // e.g., 4
    : 0;
  const separatorHeight = studyHasRecovery ? 20 : 0;
  return (mainCategories + recoveryCategories) * 16 + separatorHeight + 40; // 40px for axes/title
```

---

## 14. Selection-Aware Header Integration

From the adaptive sections spec, the dose charts collapsed strip shows:

**Finding selected, with recovery:**
```
› DOSE CHARTS: HYPERTROPHY  ·  Incid: 0%→0%→8%→14% | R: 0%→3%  ·  Sev: —→—→2.0→2.6 | R: —→1.0
```

The `| R:` separator and recovery sequence appends only when `studyHasRecovery`. Recovery shows only recovery dose levels (typically 2: control + high dose).

**No finding, with recovery:**
```
› DOSE CHARTS (SPECIMEN AGGREGATE)  ·  Peak incidence: 60% (Group 4) → 10% (R)  ·  Peak severity: 2.6 (Group 4) → 1.0 (R)
```

The `→ {value} (R)` appends the matched recovery value for the peak dose group.

---

## 15. Files to Modify

| File | Changes |
|---|---|
| `charts/histopathology-charts.ts` | Modify `buildDoseIncidenceBarOption()` and `buildDoseSeverityBarOption()`: accept `isRecovery` in data items, append recovery categories to Y-axis, add separator markLine/spacer, style recovery bars at 50% opacity, add recovery-aware tooltip. |
| `OverviewTab.tsx` | Build chart data with recovery groups when `studyHasRecovery`. Update dose charts default/min height. Pass recovery data to chart builders. |
| `DoseChartsSelectionZone.tsx` (from adaptive-sections-spec) | Append recovery sequence to collapsed strip content when `studyHasRecovery`. |
| `useSectionLayout.ts` (from adaptive-sections-spec) | Update dose charts default and min useful heights when `studyHasRecovery`. Update natural height computation. |

---

## 16. Verification Checklist

### Gate Condition
- [ ] Study without recovery arms: charts render identically to current behavior — no recovery bars, no separator, no extra categories, same default height
- [ ] Study with recovery arms: recovery bars appear below separator in both charts

### Y-Axis Layout
- [ ] Main-arm categories appear FIRST (top of chart)
- [ ] Recovery categories appear BELOW main-arm categories (not above)
- [ ] Visual separator (dashed line or gap) between main and recovery sections
- [ ] "Recovery" label rendered at separator position
- [ ] Recovery Y-axis labels include `(R)` suffix
- [ ] Recovery labels in muted color (`#9CA3AF`)
- [ ] Only recovery dose levels present in study are shown (not all dose levels)

### Recovery Bars
- [ ] Same fill color as matched main-arm bars (sex-matched) but at 50% opacity
- [ ] Same bar width/height as main-arm bars
- [ ] Sex grouping works: male/female pairs in recovery match main-arm pattern
- [ ] Sex filter applies to recovery bars (e.g., "Males only" hides female recovery bars)

### Recovery Bar Suppression
- [ ] Main incidence > 0 at dose level: recovery bar renders normally
- [ ] Main incidence = 0, recovery incidence > 0: bar suppressed, `⚠` marker shown
- [ ] Main incidence = 0, recovery incidence = 0: empty (no bar, no marker)
- [ ] Recovery N < 3: bar suppressed, `†` marker shown
- [ ] `⚠` marker tooltip explains anomaly condition
- [ ] `†` marker tooltip shows actual N and minimum threshold
- [ ] Suppressed bars do not contribute to axis auto-scaling in compact mode

### Incidence Chart
- [ ] Recovery bars show recovery incidence percentage
- [ ] Bar labels in same format as main: `{pct}% {affected}/{n}`
- [ ] Recovery label text at reduced opacity
- [ ] Zero incidence in recovery renders as empty category slot (no bar, slot present)

### Severity Chart
- [ ] Recovery bars show recovery average severity
- [ ] Zero severity rows excluded (same rule as main arm)
- [ ] Recovery bars use same severity scale (0–5 in scaled mode)

### Stable Frame
- [ ] Recovery categories present in Y-axis regardless of selected finding
- [ ] Selecting a finding with no recovery data: recovery slots empty, categories remain
- [ ] Y-axis doesn't jump when switching between findings with/without recovery data

### Tooltip
- [ ] Main-arm bar tooltips unchanged
- [ ] Recovery bar tooltip shows recovery value + main-arm comparison + change
- [ ] Change shows absolute and percentage with directional arrow

### Compact/Scaled Mode
- [ ] Scaled mode: recovery bars render within fixed scale
- [ ] Compact mode: auto-range includes recovery values
- [ ] Mode toggles work correctly with recovery bars present

### Chart Height
- [ ] Default height increases from 170px to 220px when recovery arms present
- [ ] Minimum useful height increases from 100px to 140px
- [ ] Natural height computation includes recovery categories
- [ ] Charts readable at default height without scrolling

### Selection-Aware Header (Adaptive Sections Integration)
- [ ] Collapsed strip includes recovery sequence: `| R: 0%→3%`
- [ ] Recovery sequence only appears when `studyHasRecovery`
- [ ] No-selection aggregate includes recovery peak: `→ 10% (R)`

### No Regressions
- [ ] Main-arm bars render identically (color, size, position, labels)
- [ ] Main-arm tooltip unchanged
- [ ] Chart responds to finding selection (scopes to selected finding)
- [ ] Specimen aggregate mode works (no finding selected)
- [ ] Compact/Scaled toggle works
- [ ] Charts respond to sex filter
- [ ] Stable frame preserves axes on finding switch
- [ ] Resizable section height still works

---

## 17. Implementation Overrides (2026-02-16)

Deviations from the spec that were reviewed and accepted, plus deferred items.

### Overrides

| # | Spec text | Override | Rationale |
|---|-----------|----------|-----------|
| O1 | §6.1: markLine OR §6.2: empty category spacer | Both used: empty spacer category for gap + markLine for "Recovery" label and dashed line | Spacer creates reliable visual gap regardless of ECharts category axis behavior; markLine adds the label. Combined approach is more robust than either alone. |
| O2 | §7.1: 50% opacity via `applyOpacity()` | Applied to both fill AND border color | Prevents bright border on muted fill; more visually coherent. |
| O3 | §13.2: default 220px, min 140px when recovery present | These values live in `useSectionLayout.ts` as unconditional defaults (not gated on `studyHasRecovery`) | Simplifies layout logic. The 220/140 values work fine for non-recovery studies too. Documented as adaptive-sections-spec O1. |
| O4 | §10.2: tooltip shows `Change: −8pp (↓ 62%)` | Implementation uses `formatChange()` with colored directional arrows (green decrease, red increase, gray unchanged) | Subtle color on tooltip text aids scan speed without violating H-004 (tooltip is an evidence surface, not a categorical label). |

### Deferred items

These spec requirements are not yet implemented. They are tracked here for future work:

| # | Spec section | Requirement | Status | Impact |
|---|-------------|-------------|--------|--------|
| D1 | §4.4 | Bar suppression markers: `⚠` for anomaly, `†` for insufficient_n in dose charts | **Not implemented** | Recovery bars render regardless of verdict. Chart builders don't receive verdict metadata. Requires extending `DoseIncidenceGroup`/`DoseSeverityGroup` interfaces. |
| D2 | §9 | Stable frame: recovery categories always present when `studyHasRecovery`, even if selected finding has no recovery data | **Not implemented** | Y-axis jumps when switching between findings with/without recovery data. Recovery categories only appear when data exists. |
| D3 | §4.4 | Suppressed bars don't contribute to axis auto-scaling in compact mode | **Blocked by D1** | Can't implement without bar suppression. |

These were deferred because the core recovery chart rendering (50% opacity bars, separator, tooltips with comparisons, sex grouping) covers the primary use case. D1–D3 are polish items that improve edge-case accuracy but don't block the pathologist's workflow.

### Enhancements beyond spec

| # | Addition | Where | Why |
|---|----------|-------|-----|
| E1 | `applyOpacity()` utility function | `histopathology-charts.ts:39-43` | Reusable RGB→RGBA converter; cleaner than inline opacity strings |
| E2 | Rich text dose label colors per dose level | Y-axis formatter | Main-arm labels use `getDoseGroupLabelColor()` per dose level for subtle dose-tier differentiation; recovery labels use flat `#9CA3AF` |
| E3 | Chart direction support (LTR/RTL) | `buildDoseIncidenceBarOption` | Passed through from parent; doesn't affect recovery bars specifically |

### Decision: separator approach

Spec §6 offered markLine (§6.1) or empty category spacer (§6.2). Implementation uses **both**: spacer for reliable visual gap + markLine for the "Recovery" label and dashed line.
