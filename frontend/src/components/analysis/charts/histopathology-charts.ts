/**
 * Pure ECharts option builders for Histopathology charts.
 *
 * Two chart types:
 *   1. Dose-Incidence — horizontal bars showing incidence % per dose group
 *   2. Dose-Severity  — horizontal bars showing average severity per dose group
 *
 * Both share identical Y-axis rendering (dose-colored rich text labels + sex column)
 * and support compact/scaled display modes.
 *
 * Recovery arm support: when recoveryGroups are provided, recovery bars render
 * below main bars with a spacer category, 50% opacity fills, and comparison tooltips.
 */
import type { EChartsOption } from "echarts";

// ─── Shared constants (match dose-response-charts.ts) ────────────────
const GRID_LINE_COLOR = "#e5e7eb";
const AXIS_LABEL_SIZE = 9;
const TOOLTIP_TEXT_SIZE = 11;
const RECOVERY_LABEL_COLOR = "#9CA3AF";

// Linear interpolation: white (#ffffff) at 0% → severity-matrix dark (#4B5563) at 100%
const BAR_WHITE = [255, 255, 255];
const BAR_DARK = [75, 85, 99]; // #4B5563

function getIncidenceBarColorRGB(pct: number): [number, number, number] {
  const t = Math.max(0, Math.min(pct, 100)) / 100;
  const r = Math.round(BAR_WHITE[0] + (BAR_DARK[0] - BAR_WHITE[0]) * t);
  const g = Math.round(BAR_WHITE[1] + (BAR_DARK[1] - BAR_WHITE[1]) * t);
  const b = Math.round(BAR_WHITE[2] + (BAR_DARK[2] - BAR_WHITE[2]) * t);
  return [r, g, b];
}

function getIncidenceBarColor(pct: number): string {
  const [r, g, b] = getIncidenceBarColorRGB(pct);
  return `rgb(${r},${g},${b})`;
}

function applyOpacity(rgbColor: string, opacity: number): string {
  const m = rgbColor.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return rgbColor;
  return `rgba(${m[1]},${m[2]},${m[3]},${opacity})`;
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
  /** Index of first recovery category (undefined if no recovery) */
  recoveryStartIndex?: number;
}

function buildDoseYAxis<G extends { doseLevel: number; doseLabel: string }>(
  ordered: G[],
  sexKeys: string[],
  getSexKeys: (g: G) => string[],
  recoveryOrdered?: G[],
): DoseYAxisResult {
  const showSexLabel = sexKeys.some((k) => k !== "Combined");
  const multiSex = sexKeys.length > 1;

  const categories: string[] = [];
  const doseLabels: string[] = [];
  const sexLabels: string[] = [];
  const categoryColors: string[] = [];
  const isRecoveryFlag: boolean[] = [];

  let recoveryStartIndex: number | undefined;

  // ECharts renders category axes bottom-to-top, so recovery (which should
  // appear below main) must come first in the array.
  if (recoveryOrdered && recoveryOrdered.length > 0) {
    recoveryStartIndex = 0;

    // Recovery categories with (R) suffix
    for (const g of recoveryOrdered) {
      const keys = getSexKeys(g);
      if (multiSex) {
        for (const sex of keys) {
          categories.push(`${g.doseLabel} ${sex} (R)`);
          doseLabels.push(`${g.doseLabel} (R)`);
          sexLabels.push(sex);
          categoryColors.push(RECOVERY_LABEL_COLOR);
          isRecoveryFlag.push(true);
        }
      } else {
        const key = keys[0];
        const label = `${g.doseLabel} (R)`;
        categories.push(showSexLabel ? `${label} ${key}` : label);
        doseLabels.push(label);
        sexLabels.push(showSexLabel ? key : "");
        categoryColors.push(RECOVERY_LABEL_COLOR);
        isRecoveryFlag.push(true);
      }
    }

    // Spacer category between recovery and main
    categories.push("");
    doseLabels.push("");
    sexLabels.push("");
    categoryColors.push("transparent");
    isRecoveryFlag.push(false);
  }

  for (const g of ordered) {
    const labelColor = getDoseGroupLabelColor(g.doseLevel);
    const keys = getSexKeys(g);
    if (multiSex) {
      for (const sex of keys) {
        categories.push(`${g.doseLabel} ${sex}`);
        doseLabels.push(g.doseLabel);
        sexLabels.push(sex);
        categoryColors.push(labelColor);
        isRecoveryFlag.push(false);
      }
    } else {
      const key = keys[0];
      categories.push(showSexLabel ? `${g.doseLabel} ${key}` : g.doseLabel);
      doseLabels.push(g.doseLabel);
      sexLabels.push(showSexLabel ? key : "");
      categoryColors.push(labelColor);
      isRecoveryFlag.push(false);
    }
  }

  const richStyles: Record<string, Record<string, unknown>> = {
    sex: { color: "#6B7280", fontSize: AXIS_LABEL_SIZE, width: 10, align: "left" },
  };
  categoryColors.forEach((c, i) => {
    richStyles[`d${i}`] = { color: c, fontSize: AXIS_LABEL_SIZE, align: "right" };
  });

  return { categories, doseLabels, sexLabels, richStyles, showSexLabel, recoveryStartIndex };
}

// ─── Recovery tooltip helpers ───────────────────────────────────────

function formatChange(current: number, main: number, unit: string): string {
  if (main === 0 && current === 0) return `<span style="color:#6B7280">\u2192 no change</span>`;
  const diff = current - main;
  const arrow = diff < 0 ? "\u2193" : diff > 0 ? "\u2191" : "\u2192";
  const color = diff < 0 ? "#16a34a" : diff > 0 ? "#dc2626" : "#6B7280";
  const absDiff = Math.abs(diff);
  const pctChange = main !== 0 ? Math.round((absDiff / main) * 100) : 0;
  const pctStr = main !== 0 ? ` (${arrow} ${pctChange}%)` : "";
  const sign = diff > 0 ? "+" : diff < 0 ? "\u2212" : "";
  return `<span style="color:${color}">${sign}${absDiff.toFixed(unit === "%" ? 0 : 1)}${unit}${pctStr}</span>`;
}

// ─── Incidence chart builder ────────────────────────────────────────

export function buildDoseIncidenceBarOption(
  groups: DoseIncidenceGroup[],
  sexKeys: string[],
  mode: ChartDisplayMode = "scaled",
  recoveryGroups?: DoseIncidenceGroup[],
  direction?: "increasing" | "decreasing" | "mixed" | "flat",
): EChartsOption {
  const ordered = [...groups].reverse();
  const recoveryOrdered = recoveryGroups ? [...recoveryGroups].reverse() : undefined;
  const multiSex = sexKeys.length > 1;

  const yAxisInfo = buildDoseYAxis(ordered, sexKeys, () => sexKeys, recoveryOrdered);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barData: any[] = [];

  const barStyle = (pct: number, isRecovery: boolean) => {
    const fill = getIncidenceBarColor(pct);
    const needsBorder = pct < 40;
    return {
      color: isRecovery ? applyOpacity(fill, 0.5) : fill,
      borderColor: needsBorder ? (isRecovery ? "rgba(209,213,219,0.5)" : "#d1d5db") : (isRecovery ? applyOpacity(fill, 0.5) : fill),
      borderWidth: needsBorder ? 1 : 0,
      borderRadius: [0, 2, 2, 0],
    };
  };

  // Build a lookup of main bar data per dose level + sex for recovery tooltips
  const mainIncidenceMap = new Map<string, { pct: number; affected: number; n: number }>();
  for (const g of ordered) {
    if (multiSex) {
      for (const sex of sexKeys) {
        const entry = g.bySex[sex];
        const pct = entry && entry.n > 0 ? (entry.affected / entry.n) * 100 : 0;
        mainIncidenceMap.set(`${g.doseLevel}|${sex}`, { pct, affected: entry?.affected ?? 0, n: entry?.n ?? 0 });
      }
    } else {
      const key = sexKeys[0];
      const entry = g.bySex[key];
      const pct = entry && entry.n > 0 ? (entry.affected / entry.n) * 100 : 0;
      mainIncidenceMap.set(`${g.doseLevel}|${key}`, { pct, affected: entry?.affected ?? 0, n: entry?.n ?? 0 });
    }
  }

  // Bar data order must match Y-axis categories (bottom-to-top):
  // recovery bars first, then spacer, then main bars.

  // Recovery bars
  if (recoveryOrdered && recoveryOrdered.length > 0) {
    for (const g of recoveryOrdered) {
      if (multiSex) {
        for (const sex of sexKeys) {
          const entry = g.bySex[sex];
          const mainData = mainIncidenceMap.get(`${g.doseLevel}|${sex}`);
          if (!entry || entry.n === 0) {
            barData.push({
              value: 0, _affected: 0, _n: 0, _isRecovery: true,
              _mainValue: mainData?.pct ?? 0, _mainAffected: mainData?.affected ?? 0, _mainN: mainData?.n ?? 0,
              itemStyle: barStyle(0, true),
            });
          } else {
            const pct = (entry.affected / entry.n) * 100;
            barData.push({
              value: pct, _affected: entry.affected, _n: entry.n, _isRecovery: true,
              _mainValue: mainData?.pct ?? 0, _mainAffected: mainData?.affected ?? 0, _mainN: mainData?.n ?? 0,
              itemStyle: barStyle(pct, true),
            });
          }
        }
      } else {
        const key = sexKeys[0];
        const entry = g.bySex[key];
        const mainData = mainIncidenceMap.get(`${g.doseLevel}|${key}`);
        if (!entry || entry.n === 0) {
          barData.push({
            value: 0, _affected: 0, _n: 0, _isRecovery: true,
            _mainValue: mainData?.pct ?? 0, _mainAffected: mainData?.affected ?? 0, _mainN: mainData?.n ?? 0,
            itemStyle: barStyle(0, true),
          });
        } else {
          const pct = (entry.affected / entry.n) * 100;
          barData.push({
            value: pct, _affected: entry.affected, _n: entry.n, _isRecovery: true,
            _mainValue: mainData?.pct ?? 0, _mainAffected: mainData?.affected ?? 0, _mainN: mainData?.n ?? 0,
            itemStyle: barStyle(pct, true),
          });
        }
      }
    }

    // Spacer bar (hidden)
    barData.push({ value: 0, _affected: 0, _n: 0, _isSpacer: true, itemStyle: { color: "transparent", borderWidth: 0 } });
  }

  // Main bars
  for (const g of ordered) {
    if (multiSex) {
      for (const sex of sexKeys) {
        const entry = g.bySex[sex];
        if (!entry || entry.n === 0) {
          barData.push({ value: 0, _affected: 0, _n: 0, itemStyle: barStyle(0, false) });
        } else {
          const pct = (entry.affected / entry.n) * 100;
          barData.push({ value: pct, _affected: entry.affected, _n: entry.n, itemStyle: barStyle(pct, false) });
        }
      }
    } else {
      const key = sexKeys[0];
      const entry = g.bySex[key];
      if (!entry || entry.n === 0) {
        barData.push({ value: 0, _affected: 0, _n: 0, itemStyle: barStyle(0, false) });
      } else {
        const pct = (entry.affected / entry.n) * 100;
        barData.push({ value: pct, _affected: entry.affected, _n: entry.n, itemStyle: barStyle(pct, false) });
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
        formatter: (_value: string, index: number) => {
          // Hide spacer label
          if (yAxisInfo.doseLabels[index] === "") return "";
          return yAxisInfo.showSexLabel
            ? `{d${index}|${yAxisInfo.doseLabels[index]}} {sex|${yAxisInfo.sexLabels[index]}}`
            : `{d${index}|${yAxisInfo.doseLabels[index]}}`;
        },
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
        const d = items[0]?.data;
        if (d?._isSpacer) return "";
        const label = items[0].axisValueLabel ?? items[0].name ?? "";
        if (d?._isRecovery) {
          const pct = d?.value ?? 0;
          const affected = d?._affected ?? 0;
          const n = d?._n ?? 0;
          const mainPct = d?._mainValue ?? 0;
          const mainAffected = d?._mainAffected ?? 0;
          const mainN = d?._mainN ?? 0;
          let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
          html += `<div style="font-size:11px;font-family:monospace">Incidence: ${Math.round(pct)}% (${affected}/${n})</div>`;
          html += `<div style="font-size:11px;font-family:monospace;color:#6B7280">Main arm: ${Math.round(mainPct)}% (${mainAffected}/${mainN})</div>`;
          html += `<div style="font-size:11px;font-family:monospace">Change: ${formatChange(pct, mainPct, "pp")}</div>`;
          return html;
        }
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
        for (const item of items) {
          const id = item.data;
          const pct = id?.value ?? 0;
          const affected = id?._affected ?? 0;
          const n = id?._n ?? 0;
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
            if (!d || d._isSpacer) return "";
            if (d.value === 0) return "";
            const pctStr = `${Math.round(d.value)}%`;
            const countStr = `${d._affected}/${d._n}`;
            if (d._isRecovery) {
              return `{muted|${pctStr} ${countStr}}`;
            }
            return `${pctStr} ${countStr}`;
          },
          rich: {
            muted: { fontSize: 9, color: "rgba(107,114,128,0.5)" },
          },
        },
        ...(yAxisInfo.recoveryStartIndex != null ? {
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { type: "dashed" as const, color: "#D1D5DB", width: 1 },
            data: [{
              yAxis: "",
              label: {
                show: true,
                formatter: "Recovery",
                position: "insideEndBottom" as const,
                fontSize: 9,
                fontWeight: 600,
                color: "#9CA3AF",
                padding: [0, 4, 0, 0],
              },
            }],
          },
        } : {}),
      },
    ],
    legend: { show: false },
    animation: true,
    animationDuration: 300,
    ...(direction === "decreasing" ? {
      graphic: [{
        type: "text",
        right: 10,
        top: 4,
        style: {
          text: "\u2193 decreasing with dose",
          fontSize: 9,
          fontStyle: "italic",
          fill: "rgba(37, 99, 235, 0.6)",
        },
      }],
    } : {}),
  };
}

// ─── Severity chart builder ─────────────────────────────────────────

export function buildDoseSeverityBarOption(
  groups: DoseSeverityGroup[],
  sexKeys: string[],
  mode: ChartDisplayMode = "scaled",
  recoveryGroups?: DoseSeverityGroup[],
): EChartsOption {
  const ordered = [...groups].reverse();
  const recoveryOrdered = recoveryGroups ? [...recoveryGroups].reverse() : undefined;
  const multiSex = sexKeys.length > 1;

  const yAxisInfo = buildDoseYAxis(ordered, sexKeys, () => sexKeys, recoveryOrdered);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barData: any[] = [];

  const barStyle = (avgSev: number, isRecovery: boolean) => {
    // Map severity 0-5 to the same white→dark gradient used for incidence
    const pctEquiv = (avgSev / 5) * 100;
    const fill = getIncidenceBarColor(pctEquiv);
    const needsBorder = avgSev < 2.0;
    return {
      color: isRecovery ? applyOpacity(fill, 0.5) : fill,
      borderColor: needsBorder ? (isRecovery ? "rgba(209,213,219,0.5)" : "#d1d5db") : (isRecovery ? applyOpacity(fill, 0.5) : fill),
      borderWidth: needsBorder ? 1 : 0,
      borderRadius: [0, 2, 2, 0],
    };
  };

  // Build lookup of main severity values for recovery tooltips
  const mainSeverityMap = new Map<string, { avg: number; count: number }>();
  for (const g of ordered) {
    if (multiSex) {
      for (const sex of sexKeys) {
        const entry = g.bySex[sex];
        const avg = entry && entry.count > 0 ? entry.totalSeverity / entry.count : 0;
        mainSeverityMap.set(`${g.doseLevel}|${sex}`, { avg, count: entry?.count ?? 0 });
      }
    } else {
      const key = sexKeys[0];
      const entry = g.bySex[key];
      const avg = entry && entry.count > 0 ? entry.totalSeverity / entry.count : 0;
      mainSeverityMap.set(`${g.doseLevel}|${key}`, { avg, count: entry?.count ?? 0 });
    }
  }

  // Bar data order must match Y-axis categories (bottom-to-top):
  // recovery bars first, then spacer, then main bars.

  // Recovery bars
  if (recoveryOrdered && recoveryOrdered.length > 0) {
    for (const g of recoveryOrdered) {
      if (multiSex) {
        for (const sex of sexKeys) {
          const entry = g.bySex[sex];
          const mainData = mainSeverityMap.get(`${g.doseLevel}|${sex}`);
          if (!entry || entry.count === 0) {
            barData.push({
              value: 0, _avg: 0, _count: 0, _isRecovery: true,
              _mainAvg: mainData?.avg ?? 0, _mainCount: mainData?.count ?? 0,
              itemStyle: barStyle(0, true),
            });
          } else {
            const avg = entry.totalSeverity / entry.count;
            barData.push({
              value: avg, _avg: avg, _count: entry.count, _isRecovery: true,
              _mainAvg: mainData?.avg ?? 0, _mainCount: mainData?.count ?? 0,
              itemStyle: barStyle(avg, true),
            });
          }
        }
      } else {
        const key = sexKeys[0];
        const entry = g.bySex[key];
        const mainData = mainSeverityMap.get(`${g.doseLevel}|${key}`);
        if (!entry || entry.count === 0) {
          barData.push({
            value: 0, _avg: 0, _count: 0, _isRecovery: true,
            _mainAvg: mainData?.avg ?? 0, _mainCount: mainData?.count ?? 0,
            itemStyle: barStyle(0, true),
          });
        } else {
          const avg = entry.totalSeverity / entry.count;
          barData.push({
            value: avg, _avg: avg, _count: entry.count, _isRecovery: true,
            _mainAvg: mainData?.avg ?? 0, _mainCount: mainData?.count ?? 0,
            itemStyle: barStyle(avg, true),
          });
        }
      }
    }

    // Spacer bar (hidden)
    barData.push({ value: 0, _avg: 0, _count: 0, _isSpacer: true, itemStyle: { color: "transparent", borderWidth: 0 } });
  }

  // Main bars
  for (const g of ordered) {
    if (multiSex) {
      for (const sex of sexKeys) {
        const entry = g.bySex[sex];
        if (!entry || entry.count === 0) {
          barData.push({ value: 0, _avg: 0, _count: 0, itemStyle: barStyle(0, false) });
        } else {
          const avg = entry.totalSeverity / entry.count;
          barData.push({ value: avg, _avg: avg, _count: entry.count, itemStyle: barStyle(avg, false) });
        }
      }
    } else {
      const key = sexKeys[0];
      const entry = g.bySex[key];
      if (!entry || entry.count === 0) {
        barData.push({ value: 0, _avg: 0, _count: 0, itemStyle: barStyle(0, false) });
      } else {
        const avg = entry.totalSeverity / entry.count;
        barData.push({ value: avg, _avg: avg, _count: entry.count, itemStyle: barStyle(avg, false) });
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
        formatter: (_value: string, index: number) => {
          if (yAxisInfo.doseLabels[index] === "") return "";
          return yAxisInfo.showSexLabel
            ? `{d${index}|${yAxisInfo.doseLabels[index]}} {sex|${yAxisInfo.sexLabels[index]}}`
            : `{d${index}|${yAxisInfo.doseLabels[index]}}`;
        },
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
        const d = items[0]?.data;
        if (d?._isSpacer) return "";
        const label = items[0].axisValueLabel ?? items[0].name ?? "";
        if (d?._isRecovery) {
          const avg = d?._avg ?? 0;
          const count = d?._count ?? 0;
          const mainAvg = d?._mainAvg ?? 0;
          let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
          html += `<div style="font-size:11px;font-family:monospace">Avg severity: ${avg.toFixed(1)} (n=${count})</div>`;
          html += `<div style="font-size:11px;font-family:monospace;color:#6B7280">Main arm: ${mainAvg.toFixed(1)}</div>`;
          html += `<div style="font-size:11px;font-family:monospace">Change: ${formatChange(avg, mainAvg, "")}</div>`;
          return html;
        }
        let html = `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${label}</div>`;
        for (const item of items) {
          const id = item.data;
          const avg = id?._avg ?? 0;
          const count = id?._count ?? 0;
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
            if (!d || d._isSpacer) return "";
            if (d.value === 0) return "";
            if (d._isRecovery) {
              return `{muted|${d._avg.toFixed(1)}}`;
            }
            return d._avg.toFixed(1);
          },
          rich: {
            muted: { fontSize: 9, color: "rgba(107,114,128,0.5)" },
          },
        },
        ...(yAxisInfo.recoveryStartIndex != null ? {
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { type: "dashed" as const, color: "#D1D5DB", width: 1 },
            data: [{
              yAxis: "",
              label: {
                show: true,
                formatter: "Recovery",
                position: "insideEndBottom" as const,
                fontSize: 9,
                fontWeight: 600,
                color: "#9CA3AF",
                padding: [0, 4, 0, 0],
              },
            }],
          },
        } : {}),
      },
    ],
    legend: { show: false },
    animation: true,
    animationDuration: 300,
  };
}
