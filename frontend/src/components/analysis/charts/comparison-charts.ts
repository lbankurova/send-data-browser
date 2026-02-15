/**
 * ECharts option builder for the body weight comparison chart.
 *
 * Renders overlaid subject lines with a control group mean ± SD band.
 * Supports absolute weight and % baseline normalization modes.
 * Color encodes dose group; solid/dashed encodes main/recovery arm.
 */
import type { EChartsOption } from "echarts";
import type { ComparisonBodyWeight, ComparisonSubjectProfile, ControlStats } from "@/types/timecourse";
import { getDoseGroupColor } from "@/lib/severity-colors";

export type BWChartMode = "absolute" | "baseline";

export interface BWChartInput {
  subjects: (ComparisonSubjectProfile & { isRecovery: boolean })[];
  bodyWeights: ComparisonBodyWeight[];
  controlBW: ControlStats["bw"];
  mode: BWChartMode;
}

export function buildBWComparisonOption(input: BWChartInput): EChartsOption {
  const { subjects, bodyWeights, controlBW, mode } = input;

  // Group weights by subject
  const bySubject = new Map<string, { day: number; weight: number }[]>();
  for (const bw of bodyWeights) {
    if (!bySubject.has(bw.usubjid)) bySubject.set(bw.usubjid, []);
    bySubject.get(bw.usubjid)!.push({ day: bw.day, weight: bw.weight });
  }
  // Sort each subject's data by day
  for (const values of bySubject.values()) {
    values.sort((a, b) => a.day - b.day);
  }

  // Compute baseline (Day 1) for each subject
  const baselines = new Map<string, number>();
  for (const [id, values] of bySubject) {
    const first = values[0];
    if (first) baselines.set(id, first.weight);
  }

  // Normalize function
  const normalize = (value: number, baseline: number): number => {
    if (mode === "baseline" && baseline > 0) return (value / baseline) * 100;
    return value;
  };

  // All unique days (sorted)
  const allDays = new Set<number>();
  for (const values of bySubject.values()) {
    for (const v of values) allDays.add(v.day);
  }
  for (const dayStr of Object.keys(controlBW)) {
    allDays.add(Number(dayStr));
  }
  const days = [...allDays].sort((a, b) => a - b);

  // Control band series (area between mean-SD and mean+SD)
  const controlLower: (number | null)[] = [];
  const controlUpper: (number | null)[] = [];
  const controlMean: (number | null)[] = [];
  // For baseline normalization, use Day 1 control mean as baseline
  const ctrlDay1 = controlBW[String(days[0])]?.mean ?? 0;
  for (const day of days) {
    const stat = controlBW[String(day)];
    if (stat) {
      const mean = normalize(stat.mean, ctrlDay1);
      const sd = mode === "baseline" && ctrlDay1 > 0
        ? (stat.sd / ctrlDay1) * 100
        : stat.sd;
      controlLower.push(Math.max(0, mean - sd));
      controlUpper.push(mean + sd);
      controlMean.push(mean);
    } else {
      controlLower.push(null);
      controlUpper.push(null);
      controlMean.push(null);
    }
  }

  // Dose-group colors from design system

  // Build series
  const series: EChartsOption["series"] = [];

  // Control lower (invisible line)
  series.push({
    name: "_ctrl_lower",
    type: "line",
    data: days.map((d, i) => [d, controlLower[i]]),
    lineStyle: { opacity: 0 },
    symbol: "none",
    stack: "control",
    silent: true,
    z: 0,
  });

  // Control upper (shaded band)
  series.push({
    name: "Control (mean\u00B1SD)",
    type: "line",
    data: days.map((d, i) => {
      const lo = controlLower[i];
      const hi = controlUpper[i];
      return [d, lo != null && hi != null ? hi - lo : null];
    }),
    lineStyle: { opacity: 0 },
    symbol: "none",
    stack: "control",
    areaStyle: {
      color: "#e5e7eb",
      opacity: 0.3,
    },
    silent: true,
    z: 0,
  });

  // Control mean dashed line
  series.push({
    name: "_ctrl_mean",
    type: "line",
    data: days.map((d, i) => [d, controlMean[i]]),
    lineStyle: { color: "#9CA3AF", width: 1, type: "dashed" },
    symbol: "none",
    silent: true,
    z: 1,
  });

  // Subject lines — color by dose group, solid/dashed by arm
  const manySubjects = subjects.length > 8;
  for (let si = 0; si < subjects.length; si++) {
    const subj = subjects[si];
    const values = bySubject.get(subj.usubjid) ?? [];
    const baseline = baselines.get(subj.usubjid) ?? 0;
    const color = getDoseGroupColor(subj.dose_level);

    const data = values.map((v) => [v.day, normalize(v.weight, baseline)]);

    // Terminal event marker
    const lastPoint = values[values.length - 1];
    const disp = subj.disposition?.toUpperCase() ?? "";
    const isFoundDead = disp.includes("FOUND DEAD");
    const isMoribund = disp.includes("MORIBUND");

    series.push({
      name: `${subj.short_id} (${subj.sex}, ${subj.dose_label})`,
      type: "line",
      data,
      lineStyle: {
        width: manySubjects ? 1 : 2,
        color,
        type: subj.isRecovery ? "dashed" : "solid",
      },
      itemStyle: { color },
      symbol: "circle",
      symbolSize: manySubjects ? 3 : 6,
      showSymbol: !manySubjects,
      emphasis: { focus: "series" },
      z: 2,
      markPoint: (isFoundDead || isMoribund) && lastPoint ? {
        data: [{
          name: isFoundDead ? "Found dead" : "Moribund",
          coord: [lastPoint.day, normalize(lastPoint.weight, baseline)],
          symbol: isFoundDead ? "path://M-6,-6L6,6M-6,6L6,-6" : "path://M0,-8L6,8L-6,8Z",
          symbolSize: 10,
          itemStyle: {
            color: isFoundDead ? "#DC2626" : "#F97316",
          },
          label: { show: false },
        }],
      } : undefined,
    });
  }

  return {
    animation: false,
    series,
    grid: {
      left: 50,
      right: 20,
      top: 10,
      bottom: subjects.length <= 8 ? 40 : 25,
    },
    tooltip: {
      trigger: "axis",
      textStyle: { fontSize: 11 },
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = params as any[];
        const day = items[0]?.value?.[0] ?? "";
        let html = `<div style="font-size:11px"><strong>Day ${day}</strong>`;
        for (const item of items) {
          if (item.seriesName?.startsWith("_")) continue;
          const val = item.value?.[1];
          if (val == null) continue;
          const formatted = mode === "baseline" ? `${val.toFixed(1)}%` : `${val.toFixed(1)}g`;
          html += `<br/>${item.marker} ${item.seriesName}: <strong>${formatted}</strong>`;
        }
        html += "</div>";
        return html;
      },
    },
    xAxis: {
      type: "value",
      name: "Study day",
      nameLocation: "center",
      nameGap: 25,
      nameTextStyle: { fontSize: 10, color: "#6B7280" },
      axisLabel: { fontSize: 10 },
      splitLine: { lineStyle: { color: "#f3f4f6" } },
    },
    yAxis: {
      type: "value",
      name: mode === "baseline" ? "% Day 1 weight" : "Weight (g)",
      nameTextStyle: { fontSize: 10, color: "#6B7280" },
      axisLabel: { fontSize: 10 },
      splitLine: { lineStyle: { color: "#f3f4f6" } },
    },
    ...(subjects.length <= 8
      ? {
          legend: {
            bottom: 0,
            textStyle: { fontSize: 10 },
            data: subjects.map((s) => ({
              name: `${s.short_id} (${s.sex}, ${s.dose_label})`,
              itemStyle: { color: getDoseGroupColor(s.dose_level) },
            })),
          },
        }
      : {}),
  };
}
