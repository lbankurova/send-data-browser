/**
 * Pure ECharts option builders for Histopathology charts.
 *
 * Two chart types:
 *   1. Dose-Incidence — horizontal bars showing incidence % per dose group
 *   2. Dose-Severity  — horizontal bars showing average severity per dose group
 *
 * Both share identical Y-axis rendering (dose-colored rich text labels + sex column)
 * and support compact/scaled display modes.
 */
import type { EChartsOption } from "echarts";

// ─── Shared constants (match dose-response-charts.ts) ────────────────
const GRID_LINE_COLOR = "#e5e7eb";
const AXIS_LABEL_SIZE = 9;
const TOOLTIP_TEXT_SIZE = 11;

// Linear interpolation: white (#ffffff) at 0% → severity-matrix dark (#4B5563) at 100%
const BAR_WHITE = [255, 255, 255];
const BAR_DARK = [75, 85, 99]; // #4B5563
function getIncidenceBarColor(pct: number): string {
  const t = Math.max(0, Math.min(pct, 100)) / 100;
  const r = Math.round(BAR_WHITE[0] + (BAR_DARK[0] - BAR_WHITE[0]) * t);
  const g = Math.round(BAR_WHITE[1] + (BAR_DARK[1] - BAR_WHITE[1]) * t);
  const b = Math.round(BAR_WHITE[2] + (BAR_DARK[2] - BAR_WHITE[2]) * t);
  return `rgb(${r},${g},${b})`;
}

// ─── Types ───────────────────────────────────────────────────────────

export type ChartDisplayMode = "compact" | "scaled";

export interface DoseIncidenceGroup {
  doseLevel: number;
  doseLabel: string;
  /** Per-sex breakdown. Key = sex code ("M" | "F" | "Combined"). */
  bySex: Record<string, { affected: number; n: number }>;
}

export interface DoseSeverityGroup {
  doseLevel: number;
  doseLabel: string;
  /** Per-sex breakdown. Key = sex code ("M" | "F" | "Combined"). */
  bySex: Record<string, { totalSeverity: number; count: number }>;
}

// ─── Dose group colors (for Y-axis labels only) ─────────────────────

function getDoseGroupLabelColor(level: number): string {
  const colors = ["#6b7280", "#3b82f6", "#f59e0b", "#ef4444"];
  return colors[level] ?? "#6b7280";
}

// ─── Shared Y-axis builder ──────────────────────────────────────────

interface DoseYAxisResult {
  categories: string[];
  doseLabels: string[];
  sexLabels: string[];
  richStyles: Record<string, Record<string, unknown>>;
  showSexLabel: boolean;
}

function buildDoseYAxis<G extends { doseLevel: number; doseLabel: string }>(
  ordered: G[],
  sexKeys: string[],
  getSexKeys: (g: G) => string[],
): DoseYAxisResult {
  const showSexLabel = sexKeys.some((k) => k !== "Combined");
  const multiSex = sexKeys.length > 1;

  const categories: string[] = [];
  const doseLabels: string[] = [];
  const sexLabels: string[] = [];
  const categoryColors: string[] = [];

  for (const g of ordered) {
    const labelColor = getDoseGroupLabelColor(g.doseLevel);
    const keys = getSexKeys(g);
    if (multiSex) {
      for (const sex of keys) {
        categories.push(`${g.doseLabel} ${sex}`);
        doseLabels.push(g.doseLabel);
        sexLabels.push(sex);
        categoryColors.push(labelColor);
      }
    } else {
      const key = keys[0];
      categories.push(showSexLabel ? `${g.doseLabel} ${key}` : g.doseLabel);
      doseLabels.push(g.doseLabel);
      sexLabels.push(showSexLabel ? key : "");
      categoryColors.push(labelColor);
    }
  }

  const richStyles: Record<string, Record<string, unknown>> = {
    sex: { color: "#6B7280", fontSize: AXIS_LABEL_SIZE, width: 10, align: "left" },
  };
  categoryColors.forEach((c, i) => {
    richStyles[`d${i}`] = { color: c, fontSize: AXIS_LABEL_SIZE, align: "right" };
  });

  return { categories, doseLabels, sexLabels, richStyles, showSexLabel };
}

// ─── Incidence chart builder ────────────────────────────────────────

export function buildDoseIncidenceBarOption(
  groups: DoseIncidenceGroup[],
  sexKeys: string[],
  mode: ChartDisplayMode = "scaled",
): EChartsOption {
  const ordered = [...groups].reverse();
  const multiSex = sexKeys.length > 1;

  const yAxisInfo = buildDoseYAxis(ordered, sexKeys, () => sexKeys);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barData: any[] = [];

  const barStyle = (pct: number) => {
    const fill = getIncidenceBarColor(pct);
    const needsBorder = pct < 40;
    return {
      color: fill,
      borderColor: needsBorder ? "#d1d5db" : fill,
      borderWidth: needsBorder ? 1 : 0,
      borderRadius: [0, 2, 2, 0],
    };
  };

  for (const g of ordered) {
    if (multiSex) {
      for (const sex of sexKeys) {
        const entry = g.bySex[sex];
        if (!entry || entry.n === 0) {
          barData.push({ value: 0, _affected: 0, _n: 0, itemStyle: barStyle(0) });
        } else {
          const pct = (entry.affected / entry.n) * 100;
          barData.push({ value: pct, _affected: entry.affected, _n: entry.n, itemStyle: barStyle(pct) });
        }
      }
    } else {
      const key = sexKeys[0];
      const entry = g.bySex[key];
      if (!entry || entry.n === 0) {
        barData.push({ value: 0, _affected: 0, _n: 0, itemStyle: barStyle(0) });
      } else {
        const pct = (entry.affected / entry.n) * 100;
        barData.push({ value: pct, _affected: entry.affected, _n: entry.n, itemStyle: barStyle(pct) });
      }
    }
  }

  const isCompact = mode === "compact";

  return {
    grid: {
      left: yAxisInfo.showSexLabel ? 80 : 60,
      right: 65,
      top: 20,
      bottom: isCompact ? 4 : 18,
    },
    yAxis: {
      type: "category",
      data: yAxisInfo.categories,
      axisLabel: {
        fontSize: AXIS_LABEL_SIZE,
        formatter: (_value: string, index: number) =>
          yAxisInfo.showSexLabel
            ? `{d${index}|${yAxisInfo.doseLabels[index]}} {sex|${yAxisInfo.sexLabels[index]}}`
            : `{d${index}|${yAxisInfo.doseLabels[index]}}`,
        rich: yAxisInfo.richStyles,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      inverse: false,
    },
    xAxis: {
      type: "value",
      min: 0,
      max: isCompact ? undefined : 100,
      show: !isCompact,
      axisLabel: {
        fontSize: AXIS_LABEL_SIZE,
        color: "#6B7280",
        formatter: (v: number) => `${v}%`,
      },
      splitLine: isCompact
        ? { show: false }
        : { lineStyle: { color: GRID_LINE_COLOR, type: "dashed" } },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      textStyle: { fontSize: TOOLTIP_TEXT_SIZE },
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: "#e5e7eb",
      borderWidth: 1,
      formatter(params: unknown) {
        const arr = Array.isArray(params) ? params : [params];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = arr as any[];
        if (items.length === 0) return "";
        const label = items[0].axisValueLabel ?? items[0].name ?? "";
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
        for (const item of items) {
          const d = item.data;
          const pct = d?.value ?? 0;
          const affected = d?._affected ?? 0;
          const n = d?._n ?? 0;
          html += `<div style="font-size:11px;font-family:monospace">${Math.round(pct)}% (${affected}/${n})</div>`;
        }
        return html;
      },
    },
    series: [
      {
        type: "bar",
        data: barData,
        barMaxWidth: 16,
        label: {
          show: true,
          position: "right",
          fontSize: 9,
          color: "#6B7280",
          formatter(params: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = params as any;
            const d = p.data;
            if (!d || d.value === 0) return "";
            return `${Math.round(d.value)}% ${d._affected}/${d._n}`;
          },
        },
      },
    ],
    legend: { show: false },
    animation: true,
    animationDuration: 300,
  };
}

// ─── Severity chart builder ─────────────────────────────────────────

export function buildDoseSeverityBarOption(
  groups: DoseSeverityGroup[],
  sexKeys: string[],
  mode: ChartDisplayMode = "scaled",
): EChartsOption {
  const ordered = [...groups].reverse();
  const multiSex = sexKeys.length > 1;

  const yAxisInfo = buildDoseYAxis(ordered, sexKeys, () => sexKeys);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barData: any[] = [];

  const barStyle = (avgSev: number) => {
    // Map severity 0-5 to the same white→dark gradient used for incidence
    const pctEquiv = (avgSev / 5) * 100;
    const fill = getIncidenceBarColor(pctEquiv);
    const needsBorder = avgSev < 2.0;
    return {
      color: fill,
      borderColor: needsBorder ? "#d1d5db" : fill,
      borderWidth: needsBorder ? 1 : 0,
      borderRadius: [0, 2, 2, 0],
    };
  };

  for (const g of ordered) {
    if (multiSex) {
      for (const sex of sexKeys) {
        const entry = g.bySex[sex];
        if (!entry || entry.count === 0) {
          barData.push({ value: 0, _avg: 0, _count: 0, itemStyle: barStyle(0) });
        } else {
          const avg = entry.totalSeverity / entry.count;
          barData.push({ value: avg, _avg: avg, _count: entry.count, itemStyle: barStyle(avg) });
        }
      }
    } else {
      const key = sexKeys[0];
      const entry = g.bySex[key];
      if (!entry || entry.count === 0) {
        barData.push({ value: 0, _avg: 0, _count: 0, itemStyle: barStyle(0) });
      } else {
        const avg = entry.totalSeverity / entry.count;
        barData.push({ value: avg, _avg: avg, _count: entry.count, itemStyle: barStyle(avg) });
      }
    }
  }

  const isCompact = mode === "compact";

  return {
    grid: {
      left: yAxisInfo.showSexLabel ? 80 : 60,
      right: 35,
      top: 20,
      bottom: isCompact ? 4 : 18,
    },
    yAxis: {
      type: "category",
      data: yAxisInfo.categories,
      axisLabel: {
        fontSize: AXIS_LABEL_SIZE,
        formatter: (_value: string, index: number) =>
          yAxisInfo.showSexLabel
            ? `{d${index}|${yAxisInfo.doseLabels[index]}} {sex|${yAxisInfo.sexLabels[index]}}`
            : `{d${index}|${yAxisInfo.doseLabels[index]}}`,
        rich: yAxisInfo.richStyles,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      inverse: false,
    },
    xAxis: {
      type: "value",
      min: 0,
      max: isCompact ? undefined : 5,
      show: !isCompact,
      axisLabel: {
        fontSize: AXIS_LABEL_SIZE,
        color: "#6B7280",
      },
      splitLine: isCompact
        ? { show: false }
        : { lineStyle: { color: GRID_LINE_COLOR, type: "dashed" } },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      textStyle: { fontSize: TOOLTIP_TEXT_SIZE },
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: "#e5e7eb",
      borderWidth: 1,
      formatter(params: unknown) {
        const arr = Array.isArray(params) ? params : [params];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = arr as any[];
        if (items.length === 0) return "";
        const label = items[0].axisValueLabel ?? items[0].name ?? "";
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
        for (const item of items) {
          const d = item.data;
          const avg = d?._avg ?? 0;
          const count = d?._count ?? 0;
          html += `<div style="font-size:11px;font-family:monospace">Avg: ${avg.toFixed(1)} (n=${count})</div>`;
        }
        return html;
      },
    },
    series: [
      {
        type: "bar",
        data: barData,
        barMaxWidth: 16,
        label: {
          show: true,
          position: "right",
          fontSize: 9,
          color: "#6B7280",
          formatter(params: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = params as any;
            const d = p.data;
            if (!d || d.value === 0) return "";
            return d._avg.toFixed(1);
          },
        },
      },
    ],
    legend: { show: false },
    animation: true,
    animationDuration: 300,
  };
}
