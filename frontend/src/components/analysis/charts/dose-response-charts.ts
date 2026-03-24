/**
 * Pure ECharts option builders for the DoseResponseView charts.
 *
 * Each function takes pre-processed data and returns an EChartsOption object.
 * No React, no hooks, no side-effects — just data in, options out.
 */
import type { EChartsOption } from "echarts";
import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from "echarts";
import type { NonMonotonicFlag } from "@/lib/endpoint-confidence";
import { CONTINUOUS_DOMAINS } from "@/lib/derive-summaries";
import { formatDoseShortLabel, getDoseGroupColor, getNeutralHeatColor } from "@/lib/severity-colors";

// ─── Shared constants ────────────────────────────────────────

/** Y-axis ceiling for -log₁₀(p). Points beyond are visually clamped. */
const Y_CEILING = 20;

/** Flat-top circle SVG — circle with top ~30% sliced off (overflow indicator). */
const FLAT_TOP_CIRCLE = "path://M-0.917,-0.4 A1,1,0,1,1,0.917,-0.4 Z";

const GRID_LINE_COLOR = "#e5e7eb";
const AXIS_LABEL_SIZE = 10;
const TOOLTIP_TEXT_SIZE = 11;
const REF_LINE_LABEL_SIZE = 9;



function axisLabel(fontSize = AXIS_LABEL_SIZE) {
  return { fontSize, color: "#6B7280" };
}

/**
 * Adaptive decimal precision based on value magnitudes.
 * Hematology params (basophils ~0.03) need 3 decimals; body weights (~400) need 1.
 */
export function adaptivePrecision(values: (number | null | undefined)[]): number {
  const abs = values.filter((v): v is number => v != null).map(Math.abs);
  if (abs.length === 0) return 2;
  const maxAbs = Math.max(...abs);
  if (maxAbs < 0.1) return 3;
  if (maxAbs < 1) return 2;
  if (maxAbs < 100) return 1;
  return 0;
}

function formatVal(v: number | null | undefined, prec: number): string {
  return v != null ? Number(v).toFixed(prec) : "\u2014";
}

function splitLineStyle() {
  return { lineStyle: { color: GRID_LINE_COLOR, type: "dashed" as const } };
}

function baseTooltip(): EChartsOption["tooltip"] {
  return {
    trigger: "axis",
    textStyle: { fontSize: TOOLTIP_TEXT_SIZE },
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "#e5e7eb",
    borderWidth: 1,
    appendToBody: true,
  };
}

// ─── Types ───────────────────────────────────────────────────

/** A merged dose-level point with per-sex keyed metrics. */
export interface MergedPoint {
  dose_label: string;
  dose_level: number;
  [key: string]: unknown;
}

export interface SubjectTrace {
  usubjid: string;
  dose_level: number;
  dose_label: string;
  values: { day: number; value: number }[];
}

export interface VolcanoPoint {
  endpoint_label: string;
  organ_system: string;
  domain: string;
  x: number;
  y: number;
  color: string;
}

// ─── 1. Dose-Response Line Chart (Mean +/- SD) ──────────────

/**
 * Line chart showing mean +/- SD by dose for each sex.
 * Error bars are drawn via a custom series renderItem.
 * Significant points (p < 0.05) get larger dots with a dark border.
 */
export function buildDoseResponseLineOption(
  mergedPoints: MergedPoint[],
  sexes: string[],
  sexColors: Record<string, string>,
  sexLabels: Record<string, string>,
  noaelLabel?: string | null,
  nonMonoFlag?: NonMonotonicFlag | null,
): EChartsOption {
  const categories = mergedPoints.map((p) => String(p.dose_label));

  // Build line series + custom error bar series for each sex
  const series: EChartsOption["series"] = [];
  const legendData: string[] = [];

  for (const sex of sexes) {
    const seriesName = sexLabels[sex] ?? sex;
    const color = sexColors[sex] ?? "#666";
    legendData.push(seriesName);

    // Mean line series with per-point symbol styling
    const lineData = mergedPoints.map((pt) => {
      const mean = pt[`mean_${sex}`] as number | null;
      const pVal = pt[`p_${sex}`] as number | null;
      const sig = pVal != null && pVal < 0.05;
      return {
        value: mean,
        symbol: "circle",
        symbolSize: sig ? 10 : 6,
        itemStyle: {
          color,
          borderColor: sig ? "#374151" : color,
          borderWidth: sig ? 2 : 1,
        },
      };
    });

    series.push({
      type: "line",
      name: seriesName,
      data: lineData,
      smooth: false,
      lineStyle: { color, width: 2 },
      connectNulls: true,
      emphasis: { focus: "series" },
    });

    // Custom error bar series (mean-sd to mean+sd).
    // Clamp lower bound at 0 when mean >= 0 (lab values, weights can't be negative).
    const errorBarData = mergedPoints.map((pt, idx) => {
      const mean = pt[`mean_${sex}`] as number | null;
      const sd = pt[`sd_${sex}`] as number | null;
      if (mean == null || sd == null) return [idx, null, null, null];
      const lo = mean >= 0 ? Math.max(0, mean - sd) : mean - sd;
      return [idx, mean, lo, mean + sd];
    });

    series.push({
      type: "custom",
      name: `${seriesName} SD`,
      data: errorBarData,
      z: 1,
      clip: false,
      silent: true,
      renderItem(_params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) {
        const catIdx = api.value(0) as number;
        const lo = api.value(2) as number | null;
        const hi = api.value(3) as number | null;
        if (lo == null || hi == null) return;

        const hiPt = api.coord([catIdx, hi]);
        const loPt = api.coord([catIdx, lo]);
        const capW = 3;

        return {
          type: "group",
          children: [
            // Vertical bar
            {
              type: "line",
              shape: { x1: hiPt[0], y1: hiPt[1], x2: loPt[0], y2: loPt[1] },
              style: { stroke: color, lineWidth: 1 },
            },
            // Top cap
            {
              type: "line",
              shape: { x1: hiPt[0] - capW, y1: hiPt[1], x2: hiPt[0] + capW, y2: hiPt[1] },
              style: { stroke: color, lineWidth: 1 },
            },
            // Bottom cap
            {
              type: "line",
              shape: { x1: loPt[0] - capW, y1: loPt[1], x2: loPt[0] + capW, y2: loPt[1] },
              style: { stroke: color, lineWidth: 1 },
            },
          ],
        };
      },
    });
  }

  // NOAEL reference line via markLine on the first line series
  if (noaelLabel && series.length > 0) {
    const firstLine = series[0] as Record<string, unknown>;
    firstLine.markLine = {
      silent: true,
      symbol: "none",
      lineStyle: { color: "#6B7280", type: "dashed", width: 1.5 },
      label: {
        formatter: "NOAEL",
        position: "start",
        fontSize: REF_LINE_LABEL_SIZE,
        color: "#6B7280",
        fontWeight: 600,
      },
      data: [{ xAxis: noaelLabel }],
    };
  }

  // Non-monotonic flag: highlight peak dose with amber markArea + annotation
  if (nonMonoFlag?.triggered && nonMonoFlag.peakDoseLevel != null && series.length > 0) {
    const peakPt = mergedPoints.find((p) => p.dose_level === nonMonoFlag.peakDoseLevel);
    if (peakPt) {
      const peakLabel = String(peakPt.dose_label);
      const firstLine = series[0] as Record<string, unknown>;
      firstLine.markArea = {
        silent: true,
        data: [[
          { xAxis: peakLabel, itemStyle: { color: "rgba(217, 119, 6, 0.08)" } },
          { xAxis: peakLabel },
        ]],
      };

      // Add a small annotation at the top
      const reversalPct = nonMonoFlag.reversalRatio != null
        ? `${(nonMonoFlag.reversalRatio * 100).toFixed(0)}%`
        : "";
      const firstLineMarkLine = firstLine.markLine as Record<string, unknown> | undefined;
      const existingData = (firstLineMarkLine?.data as unknown[] | undefined) ?? [];
      firstLine.markLine = {
        ...firstLineMarkLine,
        silent: true,
        symbol: "none",
        data: [
          ...existingData,
          {
            xAxis: peakLabel,
            lineStyle: { color: "#D97706", type: "dotted", width: 1.5 },
            label: {
              formatter: `Peak (reversal ${reversalPct})`,
              position: "insideEndTop",
              fontSize: REF_LINE_LABEL_SIZE,
              color: "#D97706",
              fontWeight: 500,
            },
          },
        ],
      };
    }
  }

  // Compute y-axis range from mean ± SD so error bars stay within the plot area.
  // Round to nice boundaries so tick labels stay clean (no excess decimals).
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const pt of mergedPoints) {
    for (const sex of sexes) {
      const mean = pt[`mean_${sex}`] as number | null;
      const sd = pt[`sd_${sex}`] as number | null;
      if (mean == null) continue;
      const lo = sd != null ? (mean >= 0 ? Math.max(0, mean - sd) : mean - sd) : mean;
      const hi = sd != null ? mean + sd : mean;
      if (lo < yMin) yMin = lo;
      if (hi > yMax) yMax = hi;
    }
  }
  let niceYMin: number | undefined;
  let niceYMax: number | undefined;
  if (isFinite(yMin) && isFinite(yMax)) {
    const range = yMax - yMin;
    const rawStep = (range > 0 ? range : 1) / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const r = rawStep / mag;
    const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
    niceYMin = Math.floor(yMin / step) * step;
    niceYMax = Math.ceil(yMax / step) * step;
  }

  // Adaptive precision from all mean values in this endpoint
  const allMeans = mergedPoints.flatMap((pt) =>
    sexes.map((s) => pt[`mean_${s}`] as number | null),
  );
  const prec = adaptivePrecision(allMeans);

  // Build SD lookup for tooltip (keyed by seriesName + categoryIndex)
  const sdLookup = new Map<string, number | null>();
  for (const sex of sexes) {
    const name = sexLabels[sex] ?? sex;
    mergedPoints.forEach((pt, i) => {
      sdLookup.set(`${name}_${i}`, pt[`sd_${sex}`] as number | null);
    });
  }

  return {
    grid: { left: 48, right: 24, top: 20, bottom: 32 },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { ...axisLabel(), margin: 6 },
      axisTick: { alignWithLabel: true },
      boundaryGap: true,
    },
    yAxis: {
      type: "value",
      axisLabel: { ...axisLabel(), formatter: (v: number) => formatVal(v, prec) },
      splitLine: splitLineStyle(),
      min: niceYMin,
      max: niceYMax,
    },
    tooltip: {
      ...baseTooltip(),
      formatter(params: unknown) {
        const arr = Array.isArray(params) ? params : [params];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = arr as any[];
        if (items.length === 0) return "";
        const label = items[0].axisValueLabel ?? items[0].name ?? "";
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
        for (const item of items) {
          if (String(item.seriesName ?? "").endsWith(" SD")) continue;
          const val = item.value;
          const displayed = val != null && typeof val === "object" ? val.value : val;
          const sd = sdLookup.get(`${item.seriesName}_${item.dataIndex}`) ?? null;
          const meanStr = formatVal(displayed != null ? Number(displayed) : null, prec);
          const sdStr = sd != null ? ` \u00b1 ${formatVal(sd, prec)}` : "";
          html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px">`;
          html += `${item.marker ?? ""}`;
          html += `<span>${item.seriesName}</span>`;
          html += `<span style="font-family:monospace;margin-left:auto">${meanStr}${sdStr}</span>`;
          html += `</div>`;
        }
        return html;
      },
    },
    series,
    legend: {
      show: false,
    },
    animation: true,
    animationDuration: 300,
  };
}

// ─── 2. Incidence Bar Chart ─────────────────────────────────

/**
 * Bar chart of incidence (0-1) by dose for each sex.
 * Significant bars (p < 0.05) get a dark border.
 */
export function buildIncidenceBarOption(
  mergedPoints: MergedPoint[],
  sexes: string[],
  sexColors: Record<string, string>,
  sexLabels: Record<string, string>,
  noaelLabel?: string | null,
): EChartsOption {
  const categories = mergedPoints.map((p) => String(p.dose_label));

  const series: EChartsOption["series"] = [];

  for (const sex of sexes) {
    const seriesName = sexLabels[sex] ?? sex;
    const color = sexColors[sex] ?? "#666";

    const barData = mergedPoints.map((pt) => {
      const inc = pt[`incidence_${sex}`] as number | null;
      const pVal = pt[`p_${sex}`] as number | null;
      const sig = pVal != null && pVal < 0.05;
      return {
        value: inc,
        itemStyle: {
          color,
          borderColor: sig ? "#1F2937" : "transparent",
          borderWidth: sig ? 1.5 : 0,
          borderRadius: [2, 2, 0, 0],
        },
      };
    });

    series.push({
      type: "bar",
      name: seriesName,
      data: barData,
      barMaxWidth: 30,
    });
  }

  // NOAEL reference line
  if (noaelLabel && series.length > 0) {
    const firstBar = series[0] as Record<string, unknown>;
    firstBar.markLine = {
      silent: true,
      symbol: "none",
      lineStyle: { color: "#6B7280", type: "dashed", width: 1.5 },
      label: {
        formatter: "NOAEL",
        position: "start",
        fontSize: REF_LINE_LABEL_SIZE,
        color: "#6B7280",
        fontWeight: 600,
      },
      data: [{ xAxis: noaelLabel }],
    };
  }

  return {
    grid: { left: 48, right: 24, top: 20, bottom: 32 },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { ...axisLabel(), margin: 6 },
      axisTick: { alignWithLabel: true },
      boundaryGap: true,
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      axisLabel: {
        ...axisLabel(),
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      splitLine: splitLineStyle(),
    },
    tooltip: {
      ...baseTooltip(),
      formatter(params: unknown) {
        const arr = Array.isArray(params) ? params : [params];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = arr as any[];
        if (items.length === 0) return "";
        const label = items[0].axisValueLabel ?? items[0].name ?? "";
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
        for (const item of items) {
          const val = item.value;
          const raw = val != null && typeof val === "object" ? val.value : val;
          const pct = raw != null ? `${(Number(raw) * 100).toFixed(0)}%` : "\u2014";
          html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px">`;
          html += `${item.marker ?? ""}`;
          html += `<span>${item.seriesName}</span>`;
          html += `<span style="font-family:monospace;margin-left:auto">${pct}</span>`;
          html += `</div>`;
        }
        return html;
      },
    },
    series,
    legend: { show: false },
    animation: true,
    animationDuration: 300,
  };
}

// ─── 3. Effect Size Bar Chart ───────────────────────────────

/**
 * Bar chart of effect size (Hedges' g) by dose for each sex.
 * Reference lines at y = +/-0.5 (medium) and y = +/-0.8 (large).
 */
export function buildEffectSizeBarOption(
  mergedPoints: MergedPoint[],
  sexes: string[],
  sexColors: Record<string, string>,
  sexLabels: Record<string, string>,
  effectSizeSymbol = "g",
  metricSubtitle?: string,
): EChartsOption {
  // Use "Contr." for control dose label on x-axis
  const categories = mergedPoints.map((p) =>
    (p.dose_level as number) === 0 ? "Contr." : String(p.dose_label),
  );

  const series: EChartsOption["series"] = [];

  for (const sex of sexes) {
    const seriesName = sexLabels[sex] ?? sex;
    const color = sexColors[sex] ?? "#666";

    series.push({
      type: "bar",
      name: seriesName,
      data: mergedPoints.map((pt) => pt[`effect_${sex}`] as number | null),
      itemStyle: { color, opacity: 0.8 },
      barMaxWidth: 30,
    });
  }

  // Add reference lines to the first series via markLine
  if (series.length > 0) {
    const firstBar = series[0] as Record<string, unknown>;
    firstBar.markLine = {
      silent: true,
      symbol: "none",
      data: [
        {
          yAxis: 0.5,
          lineStyle: { color: "#d1d5db", type: "dashed", width: 1 },
          label: { show: false },
        },
        {
          yAxis: 0.8,
          lineStyle: { color: "#9ca3af", type: "dashed", width: 1 },
          label: {
            formatter: `${effectSizeSymbol}=0.8`,
            position: "insideEndTop",
            fontSize: REF_LINE_LABEL_SIZE,
            color: "#6B7280",
          },
        },
        {
          yAxis: -0.5,
          lineStyle: { color: "#d1d5db", type: "dashed", width: 1 },
          label: { show: false },
        },
        {
          yAxis: -0.8,
          lineStyle: { color: "#9ca3af", type: "dashed", width: 1 },
          label: {
            formatter: `${effectSizeSymbol}=\u22120.8`,
            position: "insideEndBottom",
            fontSize: REF_LINE_LABEL_SIZE,
            color: "#6B7280",
          },
        },
      ],
    };
  }

  return {
    grid: { left: 48, right: 24, top: 20, bottom: 32 },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { ...axisLabel(), margin: 6 },
      axisTick: { alignWithLabel: true },
      boundaryGap: true,
    },
    yAxis: {
      type: "value",
      axisLabel: axisLabel(),
      splitLine: splitLineStyle(),
      scale: true,
      ...(metricSubtitle ? {
        name: metricSubtitle,
        nameLocation: "middle" as const,
        nameGap: 35,
        nameTextStyle: { fontSize: 9, color: "#9CA3AF" },
      } : {}),
    },
    tooltip: {
      ...baseTooltip(),
      formatter(params: unknown) {
        const arr = Array.isArray(params) ? params : [params];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = arr as any[];
        if (items.length === 0) return "";
        const label = items[0].axisValueLabel ?? items[0].name ?? "";
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
        for (const item of items) {
          const val = item.value;
          html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px">`;
          html += `${item.marker ?? ""}`;
          html += `<span>${item.seriesName}</span>`;
          html += `<span style="font-family:monospace;margin-left:auto">${val != null ? Number(val).toFixed(2) : "\u2014"}</span>`;
          html += `</div>`;
        }
        return html;
      },
    },
    series,
    legend: { show: false },
    animation: true,
    animationDuration: 300,
  };
}

// ─── 4. CL Timecourse Bar Chart ─────────────────────────────

/**
 * Grouped bar chart for CL (clinical observation) temporal data.
 * X = study day, grouped by dose level. Colors from doseGroupColorFn.
 *
 * Points is an array of records with keys like `dose_0`, `dose_1`, etc.
 * doseLevels is an array of [dose_level, dose_label] tuples.
 */
export function buildCLTimecourseBarOption(
  points: Record<string, unknown>[],
  doseLevels: [number, string][],
  doseGroupColorFn: (level: number) => string,
): EChartsOption {
  const days = points.map((p) => `Day ${p.day as number}`);

  const series: EChartsOption["series"] = doseLevels.map(([dl, doseLabel]) => ({
    type: "bar" as const,
    name: formatDoseShortLabel(doseLabel),
    data: points.map((pt) => {
      const count = pt[`dose_${dl}`] as number | null;
      return count ?? 0;
    }),
    itemStyle: {
      color: doseGroupColorFn(dl),
      borderRadius: [2, 2, 0, 0],
    },
    barMaxWidth: 16,
  }));

  return {
    grid: { left: 44, right: 12, top: 8, bottom: 40 },
    xAxis: {
      type: "category",
      data: days,
      axisLabel: axisLabel(),
    },
    yAxis: {
      type: "value",
      axisLabel: axisLabel(),
      splitLine: splitLineStyle(),
      minInterval: 1,
    },
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter(params: unknown) {
        const arr = Array.isArray(params) ? params : [params];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = arr as any[];
        if (items.length === 0) return "";
        const dayLabel = items[0].axisValueLabel ?? items[0].name ?? "";
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${dayLabel}</div>`;
        for (const item of items) {
          const idx = item.dataIndex as number;
          const pt = points[idx];
          if (!pt) continue;

          // Find the matching dose level for this series
          const dlEntry = doseLevels.find(([, label]) => formatDoseShortLabel(label) === item.seriesName);
          const dl = dlEntry?.[0];
          const count = item.value ?? 0;
          const total = dl != null ? (pt[`dose_${dl}_total`] as number | undefined) : undefined;
          const subjects = dl != null ? (pt[`dose_${dl}_subjects`] as string | undefined) : undefined;
          const incPct = total && total > 0 ? ((Number(count) / Number(total)) * 100).toFixed(0) : "0";

          html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px">`;
          html += `${item.marker ?? ""}`;
          html += `<span>${item.seriesName}</span>`;
          html += `<span style="font-family:monospace;margin-left:auto">`;
          html += total != null ? `${count}/${total} (${incPct}%)` : String(count);
          html += `</span>`;
          html += `</div>`;
          if (subjects) {
            html += `<div style="font-size:10px;color:#9CA3AF;padding-left:18px;max-width:250px;word-break:break-all">${subjects}</div>`;
          }
        }
        return html;
      },
    },
    series,
    legend: { show: false },
    animation: true,
    animationDuration: 300,
  };
}

// ─── 5. Timecourse Line Chart ────────────────────────────────

/**
 * Line chart for continuous temporal data.
 * X = study day, one series per dose level with error bars (custom series).
 * Optional subject traces as low-opacity line series.
 * Reference line at y=0 for pct modes, or at y=baselineRefValue for absolute.
 */
export function buildTimecourseLineOption(
  points: Record<string, unknown>[],
  doseLevels: number[],
  doseGroupColorFn: (level: number) => string,
  yLabel: string,
  baselineRefValue: number | null,
  yAxisMode: "absolute" | "pct_change" | "pct_vs_control",
  showSubjects: boolean,
  subjectTraces: SubjectTrace[],
  lastDosingDay?: number,
): EChartsOption {
  const days = points.map((p) => p.day as number);

  const series: EChartsOption["series"] = [];

  // Subject traces first (behind group lines)
  if (showSubjects && subjectTraces.length > 0) {
    for (const trace of subjectTraces) {
      const sorted = [...trace.values].sort((a, b) => a.day - b.day);
      if (sorted.length < 2) continue;

      // Build sparse data aligned to the days axis
      const data: (number | null)[] = days.map((d) => {
        const match = sorted.find((v) => v.day === d);
        return match ? match.value : null;
      });

      series.push({
        type: "line",
        name: trace.usubjid,
        data,
        lineStyle: {
          color: doseGroupColorFn(trace.dose_level),
          width: 1,
          opacity: 0.3,
        },
        symbol: "none",
        connectNulls: true,
        silent: false,
        emphasis: {
          lineStyle: { opacity: 0.8, width: 2 },
        },
        tooltip: {
          show: false,
        },
        // Do not show in legend
        legendHoverLink: false,
      });
    }
  }

  // Group mean lines + error bars for each dose level
  for (const dl of doseLevels) {
    const color = doseGroupColorFn(dl);
    const firstPt = points.find((p) => p[`dose_${dl}_label`] != null);
    const doseLabel = firstPt
      ? formatDoseShortLabel(String(firstPt[`dose_${dl}_label`] ?? `Dose ${dl}`))
      : `Dose ${dl}`;

    // Mean line
    series.push({
      type: "line",
      name: doseLabel,
      data: points.map((pt) => pt[`dose_${dl}`] as number | null ?? null),
      lineStyle: { color, width: showSubjects ? 3 : 2 },
      symbol: "circle",
      symbolSize: showSubjects ? 4 : 6,
      itemStyle: { color },
      connectNulls: true,
      z: 10,
      emphasis: { focus: "series" },
    });

    // Error bars (only when subjects are not shown)
    if (!showSubjects) {
      const errorBarData = points.map((pt, idx) => {
        const mean = pt[`dose_${dl}`] as number | null;
        const sd = pt[`dose_${dl}_sd`] as number | null;
        if (mean == null || sd == null) return [idx, null, null, null];
        return [idx, mean, mean - sd, mean + sd];
      });

      series.push({
        type: "custom",
        name: `${doseLabel} SD`,
        data: errorBarData,
        z: 5,
        silent: true,
        renderItem(_params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) {
          const catIdx = api.value(0) as number;
          const lo = api.value(2) as number | null;
          const hi = api.value(3) as number | null;
          if (lo == null || hi == null) return;

          const hiPt = api.coord([catIdx, hi]);
          const loPt = api.coord([catIdx, lo]);
          const capW = 4;

          return {
            type: "group",
            children: [
              {
                type: "line",
                shape: { x1: hiPt[0], y1: hiPt[1], x2: loPt[0], y2: loPt[1] },
                style: { stroke: color, lineWidth: 1 },
              },
              {
                type: "line",
                shape: { x1: hiPt[0] - capW, y1: hiPt[1], x2: hiPt[0] + capW, y2: hiPt[1] },
                style: { stroke: color, lineWidth: 1 },
              },
              {
                type: "line",
                shape: { x1: loPt[0] - capW, y1: loPt[1], x2: loPt[0] + capW, y2: loPt[1] },
                style: { stroke: color, lineWidth: 1 },
              },
            ],
          };
        },
      });
    }
  }

  // Reference line via markLine on first group series
  const refLineValue = yAxisMode === "absolute" ? baselineRefValue : 0;
  const showRefLine = yAxisMode !== "absolute" || baselineRefValue != null;

  // Find the first group mean series (skip subject traces)
  const firstGroupIdx = series.findIndex(
    (s) => (s as Record<string, unknown>).type === "line" && (s as Record<string, unknown>).z === 10,
  );

  if (firstGroupIdx >= 0) {
    const markLineData: unknown[] = [];

    // Horizontal reference line (baseline or 0%)
    if (showRefLine && refLineValue != null) {
      markLineData.push({
        yAxis: refLineValue,
        lineStyle: { color: "#9CA3AF", type: "dashed", width: 1 },
        label: {
          formatter: yAxisMode === "absolute" ? "Baseline" : "0%",
          position: "insideEndTop",
          fontSize: REF_LINE_LABEL_SIZE,
          color: "#9CA3AF",
        },
      });
    }

    // Recovery boundary vertical line
    if (lastDosingDay != null) {
      // Find the category index closest to lastDosingDay
      const boundaryIdx = days.findIndex((d) => d >= lastDosingDay);
      if (boundaryIdx >= 0) {
        markLineData.push({
          xAxis: String(days[boundaryIdx]),
          lineStyle: { color: "#D97706", type: "dashed", width: 1.5 },
          label: {
            formatter: "Recovery",
            position: "insideEndTop",
            fontSize: REF_LINE_LABEL_SIZE,
            color: "#D97706",
          },
        });
      }

      // Add a shaded recovery region background
      const recoveryStart = days.find((d) => d > lastDosingDay);
      const recoveryEnd = days[days.length - 1];
      if (recoveryStart != null && recoveryEnd > lastDosingDay) {
        const firstGroup = series[firstGroupIdx] as Record<string, unknown>;
        firstGroup.markArea = {
          silent: true,
          data: [[
            { xAxis: String(recoveryStart), itemStyle: { color: "rgba(217, 119, 6, 0.06)" } },
            { xAxis: String(recoveryEnd) },
          ]],
        };
      }
    }

    if (markLineData.length > 0) {
      const firstGroup = series[firstGroupIdx] as Record<string, unknown>;
      firstGroup.markLine = {
        silent: true,
        symbol: "none",
        data: markLineData,
      };
    }
  }

  return {
    grid: { left: 52, right: 12, top: 8, bottom: 40 },
    xAxis: {
      type: "category",
      data: days.map(String),
      axisLabel: axisLabel(),
      name: "Study day",
      nameLocation: "center",
      nameGap: 24,
      nameTextStyle: { fontSize: 10, color: "#9CA3AF" },
    },
    yAxis: {
      type: "value",
      axisLabel: axisLabel(),
      splitLine: splitLineStyle(),
      name: yLabel,
      nameLocation: "center",
      nameGap: 34,
      nameTextStyle: { fontSize: 10, color: "#9CA3AF" },
    },
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      formatter(params: unknown) {
        const arr = Array.isArray(params) ? params : [params];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = arr as any[];
        if (items.length === 0) return "";

        // Separate group means from subject traces
        const groupItems = items.filter(
          (item) => !String(item.seriesName ?? "").endsWith(" SD"),
        );
        if (groupItems.length === 0) return "";

        const dayNum = Number(groupItems[0].axisValueLabel ?? groupItems[0].name ?? "0");
        const isRecoveryPhase = lastDosingDay != null && dayNum > lastDosingDay;
        const dayLabel = `Day ${dayNum}${isRecoveryPhase ? " (recovery period)" : ""}`;
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${dayLabel}</div>`;

        for (const item of groupItems) {
          // Skip subject-level traces in tooltip — only show group means
          const idx = item.dataIndex as number;
          const isGroupSeries = (item.componentSubType === "line") &&
            doseLevels.some((dl) => {
              const pt = points[idx];
              return pt && pt[`dose_${dl}_label`] != null && item.seriesName === String(pt[`dose_${dl}_label`]);
            });

          if (!isGroupSeries && showSubjects) continue;

          const val = item.value;
          // Find sd and n from the point data
          const pt = points[idx];
          let sdStr = "";
          let nStr = "";
          if (pt) {
            for (const dl of doseLevels) {
              const dlLabel = pt[`dose_${dl}_label`] as string | undefined;
              if (dlLabel === item.seriesName || `Dose ${dl}` === item.seriesName) {
                const sd = pt[`dose_${dl}_sd`] as number | undefined;
                const n = pt[`dose_${dl}_n`] as number | undefined;
                if (sd != null) sdStr = ` \u00b1 ${sd.toFixed(2)}`;
                if (n != null) nStr = ` n=${n}`;
                break;
              }
            }
          }

          html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px">`;
          html += `${item.marker ?? ""}`;
          html += `<span>${item.seriesName}</span>`;
          html += `<span style="font-family:monospace;margin-left:auto">`;
          html += val != null ? `${Number(val).toFixed(2)}${sdStr}${nStr}` : "\u2014";
          html += `</span></div>`;
        }
        return html;
      },
    },
    series,
    legend: { show: false },
    animation: !showSubjects,
    animationDuration: 300,
  };
}

// ─── 6. Volcano Scatter Chart ────────────────────────────────

/**
 * Scatter chart: x = |effect size|, y = -log10(trend_p).
 * Reference lines at x = 0.5, 0.8 and y = -log10(0.05), -log10(0.01).
 * Points colored by organ system, selected point highlighted.
 *
 * Each data point is [x, y, endpointLabel, organSystem, color].
 * organSystems is an array of [organ_system, color] tuples for the legend.
 */
export function buildVolcanoScatterOption(
  points: VolcanoPoint[],
  selectedEndpoint: string | null,
  organSystems: [string, string][],
  _effectSizeLabel = "Hedges' g",
  effectSizeSymbol = "g",
): EChartsOption {
  // Group points by organ system for colored series
  const seriesByOrgan = new Map<string, VolcanoPoint[]>();
  for (const pt of points) {
    let arr = seriesByOrgan.get(pt.organ_system);
    if (!arr) {
      arr = [];
      seriesByOrgan.set(pt.organ_system, arr);
    }
    arr.push(pt);
  }

  const hasClamped = points.some((p) => p.y > Y_CEILING);
  const scatterSeries: EChartsOption["series"] = [];

  for (const [organ, organPoints] of seriesByOrgan) {
    const color = organPoints[0]?.color ?? "#666";

    scatterSeries.push({
      type: "scatter",
      name: organ,
      data: organPoints.map((pt) => {
        const isSelected = pt.endpoint_label === selectedEndpoint;
        const isClamped = pt.y > Y_CEILING;
        return {
          value: [pt.x, Math.min(pt.y, Y_CEILING)],
          name: pt.endpoint_label,
          _domain: pt.domain,
          _rawY: pt.y,
          symbol: isClamped ? FLAT_TOP_CIRCLE : "circle",
          symbolSize: isSelected ? 14 : 8,
          itemStyle: {
            color,
            opacity: isSelected ? 1 : 0.65,
            borderColor: isSelected ? "#1F2937" : color,
            borderWidth: isSelected ? 2 : 0.5,
          },
        };
      }),
    });
  }

  // Reference line data via markLine on the first series
  if (scatterSeries.length > 0) {
    const first = scatterSeries[0] as Record<string, unknown>;
    first.markLine = {
      silent: true,
      symbol: "none",
      data: [
        // Vertical: effect size thresholds
        {
          xAxis: 0.5,
          lineStyle: { color: "#D1D5DB", type: "dashed", width: 1 },
          label: {
            formatter: `${effectSizeSymbol}=0.5`,
            position: "end",
            fontSize: REF_LINE_LABEL_SIZE,
            color: "#9CA3AF",
          },
        },
        {
          xAxis: 0.8,
          lineStyle: { color: "#9CA3AF", type: "dashed", width: 1 },
          label: {
            formatter: `${effectSizeSymbol}=0.8`,
            position: "end",
            fontSize: REF_LINE_LABEL_SIZE,
            color: "#6B7280",
          },
        },
        // Horizontal: significance thresholds
        {
          yAxis: -Math.log10(0.05),
          lineStyle: { color: "#D1D5DB", type: "dashed", width: 1 },
          label: {
            formatter: "p=0.05",
            position: "insideEndTop",
            fontSize: REF_LINE_LABEL_SIZE,
            color: "#9CA3AF",
          },
        },
        {
          yAxis: -Math.log10(0.01),
          lineStyle: { color: "#9CA3AF", type: "dashed", width: 1 },
          label: {
            formatter: "p=0.01",
            position: "insideEndTop",
            fontSize: REF_LINE_LABEL_SIZE,
            color: "#6B7280",
          },
        },
        ...(hasClamped
          ? [
              {
                yAxis: Y_CEILING,
                lineStyle: { color: "#9CA3AF", type: "dotted" as const, width: 1 },
                label: {
                  formatter: "p < 10⁻²⁰",
                  position: "insideEndTop" as const,
                  fontSize: REF_LINE_LABEL_SIZE,
                  color: "#9CA3AF",
                },
              },
            ]
          : []),
      ],
    };
  }

  // Build legend items matching organ system order
  const legendData = organSystems.map(([organ]) => organ);

  return {
    grid: { left: 44, right: 12, top: 8, bottom: 40 },
    xAxis: {
      type: "value",
      min: 0,
      axisLabel: axisLabel(),
      splitLine: splitLineStyle(),
      name: "Effect",
      nameLocation: "center",
      nameGap: 24,
      nameTextStyle: { fontSize: 10, color: "#9CA3AF" },
    },
    yAxis: {
      type: "value",
      min: 0,
      ...(hasClamped ? { max: Y_CEILING } : {}),
      axisLabel: axisLabel(),
      splitLine: splitLineStyle(),
      name: "-log\u2081\u2080(trend p)",
      nameLocation: "center",
      nameGap: 28,
      nameTextStyle: { fontSize: 10, color: "#9CA3AF" },
    },
    tooltip: {
      trigger: "item",
      textStyle: { fontSize: TOOLTIP_TEXT_SIZE },
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: "#e5e7eb",
      borderWidth: 1,
      formatter(params: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = params as any;
        if (!item || !item.value) return "";
        const [x] = item.value as [number, number];
        const rawY = (item.data?._rawY as number | undefined) ?? item.value[1];
        const name = item.name ?? "";
        const organ = item.seriesName ?? "";
        const domain = item.data?._domain as string | undefined;
        const isContinuous = domain ? CONTINUOUS_DOMAINS.has(domain) : true;
        const effectLabel = !isContinuous ? `avg sev=${x.toFixed(2)}` : `|${effectSizeSymbol}|=${x.toFixed(2)}`;
        const pRaw = Math.pow(10, -rawY);
        const pLabel = pRaw < 0.0001 ? "p<0.0001" : `p=${pRaw.toFixed(4)}`;
        return [
          `<div style="font-size:11px;font-weight:600">${name}</div>`,
          `<div style="font-size:10px;color:#9CA3AF">${organ}</div>`,
          `<div style="display:flex;gap:12px;font-family:monospace;font-size:10px;margin-top:4px">`,
          `<span>${effectLabel}</span>`,
          `<span>${pLabel}</span>`,
          `</div>`,
        ].join("");
      },
    },
    series: scatterSeries,
    legend: {
      show: false,
      data: legendData,
    },
    animation: true,
    animationDuration: 300,
  };
}

// ─── 7. Dose-Response Bar Chart (Mean ± SD) ─────────────────

/** Per-sex verdict info for bar chart footer notes. */
export interface BarVerdictInfo {
  sex: string;
  sigDoseLabels: string[];
  trendP: number | null;
  trendTestName: string;
}

/**
 * Horizontal grouped bar chart:
 * - Y-axis: dose label + colored pipe (right of label)
 * - No error bars, no x-axis labels
 * - Sex-colored bars, thick border for p<0.05
 * - Method label top-left, verdict notes bottom-left
 * - Right-aligned value column via secondary y-axis
 */
export function buildDoseResponseBarOption(
  mergedPoints: MergedPoint[],
  sexes: string[],
  sexColors: Record<string, string>,
  sexLabels: Record<string, string>,
  _noaelLabel?: string | null,
  _nonMonoFlag?: NonMonotonicFlag | null,
  _testLabel?: string | null,
  _verdicts?: BarVerdictInfo[],
): EChartsOption {
  // Reverse so control is at bottom
  const ordered = [...mergedPoints].reverse();
  const categories = ordered.map((p) => String(p.dose_label));

  // ── Y-axis rich text: label + colored pipe (pipe to the RIGHT of label) ──
  const pipeRich: Record<string, object> = {};
  for (const pt of ordered) {
    const c = getDoseGroupColor(pt.dose_level as number);
    pipeRich[`p${c.replace("#", "")}`] = { color: c, fontSize: 22, lineHeight: 22, fontWeight: "normal", fontFamily: "monospace", verticalAlign: "middle" };
  }
  pipeRich.t = { color: "#374151", fontSize: 10, padding: [0, 8, 0, 0] };

  const series: EChartsOption["series"] = [];

  for (const sex of sexes) {
    const seriesName = sexLabels[sex] ?? sex;
    const color = sexColors[sex] ?? "#666";

    // Horizontal bar series — no error bars, clean style
    const barData = ordered.map((pt) => {
      const mean = pt[`mean_${sex}`] as number | null;
      const pVal = pt[`p_${sex}`] as number | null;
      const sig = pVal != null && pVal < 0.05;
      return {
        value: mean,
        itemStyle: {
          color,
          borderColor: sig ? "#1F2937" : "transparent",
          borderWidth: sig ? 1.5 : 0,
          borderRadius: [0, 2, 2, 0],
        },
      };
    });

    series.push({
      type: "bar",
      name: seriesName,
      data: barData,
      barMaxWidth: 12,
    });
  }

  // ── Right-side value labels (secondary y-axis) — right-aligned scannable column ──
  const valueRich: Record<string, object> = {};
  for (const sex of sexes) {
    valueRich[`v${sex}`] = { fontFamily: "monospace", fontSize: 9, color: sexColors[sex] ?? "#6B7280" };
  }
  valueRich.sp = { fontSize: 9, color: "#D1D5DB" };
  const rightLabels = ordered.map((pt) =>
    sexes.map((sex) => {
      const mean = pt[`mean_${sex}`] as number | null;
      const val = mean != null ? Number(mean).toFixed(2) : "\u2014";
      return `{v${sex}|${val}}`;
    }).join("{sp| }"),
  );

  return {
    grid: { left: 68, right: 70, top: 8, bottom: 8 },
    yAxis: [
      {
        type: "category",
        data: categories,
        axisLabel: {
          fontSize: 10,
          formatter(value: string) {
            const pt = ordered.find((p) => String(p.dose_label) === value);
            const c = getDoseGroupColor((pt?.dose_level as number) ?? 0);
            // Pipe to the RIGHT of the dose label
            return `{t|${value}}{p${c.replace("#", "")}|\u258F}`;
          },
          rich: pipeRich,
        },
        axisTick: { show: false },
        axisLine: { show: false },
        inverse: false,
      },
      {
        type: "category",
        data: rightLabels,
        position: "right",
        axisLabel: { rich: valueRich },
        axisTick: { show: false },
        axisLine: { show: false },
      },
    ],
    xAxis: {
      type: "value",
      axisLabel: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter(params: unknown) {
        const arr = Array.isArray(params) ? params : [params];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = arr as any[];
        if (items.length === 0) return "";
        const label = items[0].axisValueLabel ?? items[0].name ?? "";
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
        for (const item of items) {
          if (String(item.seriesName ?? "").endsWith(" SD")) continue;
          const val = item.value;
          const displayed = val != null && typeof val === "object" ? val.value : val;
          html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px">`;
          html += `${item.marker ?? ""}`;
          html += `<span>${item.seriesName}</span>`;
          html += `<span style="font-family:monospace;margin-left:auto">${displayed != null ? Number(displayed).toFixed(2) : "\u2014"}</span>`;
          html += `</div>`;
        }
        return html;
      },
    },
    series,
    legend: { show: false },
    animation: true,
    animationDuration: 300,
  };
}

// ─── 8. Stacked Severity Bar Chart ──────────────────────────

const GRADE_LABELS = ["Minimal", "Mild", "Moderate", "Marked", "Severe"];
// 5-step neutral grayscale ramp via shared getNeutralHeatColor()
const GRADE_SCORES = [0.1, 0.3, 0.5, 0.7, 0.9];
const GRADE_COLORS = GRADE_SCORES.map((s) => getNeutralHeatColor(s).bg);

/**
 * Vertical stacked bar chart showing severity grade distribution
 * per dose group per sex. Grades 1-5 are stacked, with separate
 * stacks for each sex (side-by-side).
 */
export function buildStackedSeverityBarOption(
  mergedPoints: MergedPoint[],
  sexes: string[],
  sexColors: Record<string, string>,
  sexLabels: Record<string, string>,
): EChartsOption {
  const categories = mergedPoints.map((p) => String(p.dose_label));

  // Compute total affected per dose × sex for percentage conversion
  const totals = new Map<string, number>();
  for (const pt of mergedPoints) {
    for (const sex of sexes) {
      const counts = pt[`sev_counts_${sex}`] as Record<string, number> | null;
      if (!counts) continue;
      let total = 0;
      for (const v of Object.values(counts)) total += v;
      totals.set(`${pt.dose_level}_${sex}`, total);
    }
  }

  const series: EChartsOption["series"] = [];

  for (const sex of sexes) {
    const sexColor = sexColors[sex] ?? "#666";

    for (let g = 0; g < 5; g++) {
      const grade = g + 1;
      const gradeLabel = GRADE_LABELS[g];
      const gradeColor = GRADE_COLORS[g];

      const data = mergedPoints.map((pt) => {
        const counts = pt[`sev_counts_${sex}`] as Record<string, number> | null;
        const n = counts?.[String(grade)] ?? 0;
        const total = totals.get(`${pt.dose_level}_${sex}`) ?? 0;
        return total > 0 ? n / total : 0;
      });

      // Side-border gradient: F = left edge, M = right edge (outer edges).
      // ~12% of bar width gives a visible 2px stripe on 16px compactified bars.
      const isF = sex === "F";
      const stripe = {
        type: "linear" as const, x: 0, y: 0, x2: 1, y2: 0,
        colorStops: isF
          ? [
              { offset: 0, color: sexColor },
              { offset: 0.12, color: sexColor },
              { offset: 0.12, color: gradeColor },
              { offset: 1, color: gradeColor },
            ]
          : [
              { offset: 0, color: gradeColor },
              { offset: 0.88, color: gradeColor },
              { offset: 0.88, color: sexColor },
              { offset: 1, color: sexColor },
            ],
      };

      series.push({
        type: "bar",
        name: gradeLabel,
        stack: sex,
        data,
        barMaxWidth: 30,
        itemStyle: { color: stripe },
      });
    }
  }

  return {
    grid: { left: 48, right: 24, top: 20, bottom: 32 },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { ...axisLabel(), margin: 6 },
      axisTick: { alignWithLabel: true },
      boundaryGap: true,
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      axisLabel: {
        ...axisLabel(),
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      splitLine: splitLineStyle(),
    },
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      formatter(params: unknown) {
        const arr = Array.isArray(params) ? params : [params];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = arr as any[];
        if (items.length === 0) return "";
        const label = items[0].axisValueLabel ?? items[0].name ?? "";
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;

        for (const sex of sexes) {
          const sexLabel = sexLabels[sex] ?? sex;
          const sexColor = sexColors[sex] ?? "#666";
          html += `<div style="font-size:10px;font-weight:600;color:${sexColor};margin-top:4px">${sexLabel}</div>`;

          const sexIdx = sexes.indexOf(sex);
          // Compute total n for this dose × sex from the raw counts
          let totalN = 0;
          for (let g = 0; g < 5; g++) {
            const item = items[sexIdx * 5 + g];
            const pct = item?.value ?? 0;
            // Reverse the percentage to get count (pct = count/total)
            // We'll show the percentage and the raw fraction
            if (pct > 0) totalN += 1; // approximate — real count shown below
          }

          for (let g = 0; g < 5; g++) {
            const gradeLabel = GRADE_LABELS[g];
            const gradeColor = GRADE_COLORS[g];
            const item = items[sexIdx * 5 + g];
            const pct = item?.value ?? 0;
            if (pct === 0) continue;
            html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px">`;
            html += `<span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:${gradeColor}"></span>`;
            html += `<span>${gradeLabel}</span>`;
            html += `<span style="font-family:monospace;margin-left:auto">${(pct * 100).toFixed(0)}%</span>`;
            html += `</div>`;
          }
        }
        return html;
      },
    },
    series,
    legend: { show: false },
    animation: true,
    animationDuration: 300,
  };
}
