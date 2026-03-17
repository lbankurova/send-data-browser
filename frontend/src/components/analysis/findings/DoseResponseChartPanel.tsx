/**
 * DoseResponseChartPanel — compact D-R + effect size charts for FindingsView.
 * Post-processes ECharts options from shared builders for tighter layout.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import {
  buildDoseResponseLineOption,
  buildIncidenceBarOption,
  buildEffectSizeBarOption,
} from "@/components/analysis/charts/dose-response-charts";
import type { MergedPoint } from "@/components/analysis/charts/dose-response-charts";
import { flattenFindingsToDRRows } from "@/lib/derive-summaries";
import { getSexColor, getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { checkNonMonotonic } from "@/lib/endpoint-confidence";
import { useStatMethods } from "@/hooks/useStatMethods";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { ChartModeToggle } from "@/components/ui/ChartModeToggle";
import type { ChartDisplayMode } from "@/components/ui/ChartModeToggle";
import type { UnifiedFinding, DoseGroup, GroupStat, PairwiseResult } from "@/types/analysis";
import type { DoseResponseRow } from "@/types/analysis-views";

interface Props {
  endpointLabel: string;
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  height: number;
  /** Study day to display. When null, uses the terminal/latest day. */
  day?: number | null;
  /** Context label for the day (e.g., "terminal", "peak", "worst"). */
  dayContext?: string;
}

const sexColors: Record<string, string> = { M: getSexColor("M"), F: getSexColor("F") };
const sexLabels: Record<string, string> = { M: "Males", F: "Females" };

// Compact grid + font sizes for findings panel context
const COMPACT_GRID = { left: 44, right: 8, top: 12, bottom: 28 };
const COMPACT_AXIS_FONT = 8;

/** Build rich x-axis labels with dose-group colors. */
function coloredAxisLabels(points: MergedPoint[]) {
  return {
    fontSize: COMPACT_AXIS_FONT,
    margin: 4,
    formatter(value: string) {
      const pt = points.find((p) => String(p.dose_label) === value);
      const color = pt ? getDoseGroupColor(pt.dose_level as number) : "#6B7280";
      return `{c|${value}}`.replace("c|", `c${color.replace("#", "")}|`);
    },
    rich: Object.fromEntries(
      points.map((p) => {
        const color = getDoseGroupColor(p.dose_level as number);
        const key = `c${color.replace("#", "")}`;
        return [key, { color, fontSize: COMPACT_AXIS_FONT, fontWeight: 500 }];
      }),
    ),
  };
}

/** Post-process an ECharts option for compact display. */
function compactify(opt: EChartsOption, points: MergedPoint[]): EChartsOption {
  const o = { ...opt };
  o.grid = COMPACT_GRID;

  // Shrink y-axis labels, color-code x-axis labels by dose group
  const yStyle = { fontSize: COMPACT_AXIS_FONT, color: "#6B7280" };
  if (o.xAxis && !Array.isArray(o.xAxis)) {
    o.xAxis = { ...o.xAxis, axisLabel: coloredAxisLabels(points) as never };
  }
  if (o.yAxis && !Array.isArray(o.yAxis)) {
    o.yAxis = { ...o.yAxis, axisLabel: yStyle, splitLine: { show: false } };
  }

  // Thin lines + symbols, strip NOAEL markLine
  if (Array.isArray(o.series)) {
    o.series = (o.series as Record<string, unknown>[]).map((s) => {
      const ns: Record<string, unknown> = { ...s };

      // Thin lines: 2 → 0.75 (matching context panel SVG charts)
      if (ns.type === "line" && ns.lineStyle) {
        ns.lineStyle = { ...(ns.lineStyle as object), width: 0.75 };
      }
      // Shrink symbols: 10/6 → 6/4
      if (ns.type === "line" && Array.isArray(ns.data)) {
        ns.data = (ns.data as Record<string, unknown>[]).map((d) => {
          if (typeof d !== "object" || d == null) return d;
          const size = d.symbolSize as number | undefined;
          if (size == null) return d;
          return { ...d, symbolSize: size >= 10 ? 6 : 4 };
        });
      }
      // Thin error bar caps
      if (ns.type === "custom" && typeof ns.renderItem === "function") {
        // Can't easily patch renderItem; leave as-is (error bars are already 1px)
      }
      // Thin bars: match DoseDetail bar height (~2.5px visual)
      if (ns.type === "bar") {
        ns.barMaxWidth = 8;
      }

      // Strip NOAEL markLine
      if (ns.markLine) {
        const ml = ns.markLine as { data?: unknown[] };
        if (ml.data) {
          const filtered = ml.data.filter((d: unknown) => {
            if (typeof d !== "object" || d == null) return true;
            const rec = d as Record<string, unknown>;
            if (rec.xAxis != null) {
              const lbl = rec.label as Record<string, unknown> | undefined;
              if (lbl?.formatter === "NOAEL") return false;
            }
            return true;
          });
          ns.markLine = filtered.length > 0 ? { ...ml, data: filtered } : undefined;
        }
      }

      return ns;
    });
  }

  return o;
}

/** Post-process effect size chart: strip 0.5 lines, thin bars, drop control. */
function compactifyEffectSize(opt: EChartsOption, points: MergedPoint[]): EChartsOption {
  let o = compactify(opt, points.filter((p) => (p.dose_level as number) > 0));

  // Drop control from x-axis data and series data
  const treatedLabels = points.filter((p) => (p.dose_level as number) > 0).map((p) => String(p.dose_label));
  if (o.xAxis && !Array.isArray(o.xAxis)) {
    o.xAxis = { ...o.xAxis, data: treatedLabels };
  }
  if (Array.isArray(o.series)) {
    o.series = (o.series as Record<string, unknown>[]).map((s) => {
      const newS: Record<string, unknown> = { ...s, barMaxWidth: 8 };
      // Trim data to skip control (first entry)
      if (Array.isArray(s.data) && s.data.length === points.length) {
        newS.data = s.data.slice(1); // control is always first (dose_level 0)
      }
      // Strip yAxis = ±0.5 from markLine, hide labels on ±0.8
      if (s.markLine) {
        const ml = s.markLine as { data?: unknown[]; [k: string]: unknown };
        if (ml.data) {
          const filtered = ml.data
            .filter((d: unknown) => {
              if (typeof d !== "object" || d == null) return true;
              const rec = d as Record<string, unknown>;
              if (rec.yAxis === 0.5 || rec.yAxis === -0.5) return false;
              return true;
            })
            .map((d: unknown) => {
              if (typeof d !== "object" || d == null) return d;
              const rec = d as Record<string, unknown>;
              // Suppress markLine labels to avoid collision with chart title
              if (rec.label) return { ...rec, label: { show: false } };
              return d;
            });
          newS.markLine = filtered.length > 0 ? { ...ml, data: filtered } : undefined;
        }
      }
      return newS;
    });
  }

  return o;
}

export function DoseResponseChartPanel({
  endpointLabel,
  findings,
  doseGroups,
  height,
  day,
}: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const { effectSize: esMethod } = useStatMethods(studyId);
  const esSymbol = getEffectSizeSymbol(esMethod);
  const esLabel = getEffectSizeLabel(esMethod);
  const normalization = useOrganWeightNormalization(studyId);
  const [incidenceScale, setIncidenceScale] = useState<ChartDisplayMode>("scaled");
  const [splitPct, setSplitPct] = useState(50);
  const chartRowRef = useRef<HTMLDivElement>(null);

  // ── Flatten findings → DoseResponseRow[] ──────────────────
  const drRows = useMemo(
    () => flattenFindingsToDRRows(findings, doseGroups),
    [findings, doseGroups],
  );

  // ── Available days + day classification for this endpoint ──
  const { availableDays, peakDay, terminalDay, dayLabels } = useMemo(() => {
    const epRows = drRows.filter((r) => r.endpoint_label === endpointLabel);
    // Only keep days with group data (control + at least one treated dose).
    // Death-day measurements have a single animal — no group comparison.
    const allDays = [...new Set(epRows.map((r) => r.day).filter((d): d is number => d != null))].sort((a, b) => a - b);
    const days = allDays.filter((d) => {
      const dayRows = epRows.filter((r) => r.day === d);
      const dls = new Set(dayRows.map((r) => r.dose_level));
      return dls.has(0) && dls.size >= 2; // control + at least one treated
    });
    if (days.length === 0) return { availableDays: days, peakDay: null, terminalDay: null, dayLabels: new Map<number, string>() };

    // Terminal = max day (last scheduled sacrifice in the dataset)
    const terminal = days[days.length - 1];

    // Peak = day with max |effect_size| across treated doses (dose_level > 0)
    let bestDay = terminal;
    let bestAbs = -1;
    for (const r of epRows) {
      if (r.dose_level === 0 || r.day == null) continue;
      const abs = Math.abs(r.effect_size ?? 0);
      if (abs > bestAbs) { bestAbs = abs; bestDay = r.day; }
    }
    const peak = bestDay !== terminal ? bestDay : null;

    // Build labels: terminal, peak (if different), recovery (if after terminal)
    const labels = new Map<number, string>();
    for (const d of days) {
      if (d === terminal) labels.set(d, "terminal");
      else if (d === peak) labels.set(d, "peak");
      else if (d > terminal) labels.set(d, "recovery");
    }

    return { availableDays: days, peakDay: peak, terminalDay: terminal, dayLabels: labels };
  }, [drRows, endpointLabel]);

  // Internal day state — initialized from prop or peak/terminal
  const defaultDay = day ?? peakDay ?? terminalDay;
  const [selectedDay, setSelectedDay] = useState<number | null>(defaultDay);
  useEffect(() => {
    setSelectedDay(day ?? peakDay ?? terminalDay);
  }, [day, peakDay, terminalDay]);

  const dayIdx = selectedDay != null ? availableDays.indexOf(selectedDay) : -1;
  const canPrev = dayIdx > 0;
  const canNext = dayIdx >= 0 && dayIdx < availableDays.length - 1;

  // ── Filter to selected endpoint + day, build MergedPoint[] ─
  const chartData = useMemo(() => {
    let rows = drRows.filter((r) => r.endpoint_label === endpointLabel);
    if (rows.length === 0) return null;

    const targetDay = selectedDay ?? availableDays[availableDays.length - 1] ?? null;
    if (targetDay == null) return null;
    rows = rows.filter((r) => r.day === targetDay);
    if (rows.length === 0) return null;

    const dataType = rows[0].data_type;
    const domain = rows[0].domain;
    const testCode = rows[0].test_code;
    const pattern = rows[0].dose_response_pattern;
    const studyDay = rows[0].day;
    const sexes = [...new Set(rows.map((r) => r.sex))].sort();
    const doseLevels = [...new Set(rows.map((r) => r.dose_level))].sort((a, b) => a - b);

    const lookup = new Map<string, DoseResponseRow>();
    for (const r of rows) lookup.set(`${r.sex}_${r.dose_level}`, r);

    const mergedPoints: MergedPoint[] = doseLevels.map((dl) => {
      const anyRow = rows.find((r) => r.dose_level === dl);
      const point: MergedPoint = {
        dose_level: dl,
        dose_label: anyRow ? formatDoseShortLabel(anyRow.dose_label) : `Dose ${dl}`,
      };
      for (const sex of sexes) {
        const r = lookup.get(`${sex}_${dl}`);
        point[`mean_${sex}`] = r?.mean ?? null;
        point[`sd_${sex}`] = r?.sd ?? null;
        point[`p_${sex}`] = r?.p_value ?? null;
        point[`incidence_${sex}`] = r?.incidence ?? null;
        point[`effect_${sex}`] = r?.effect_size ?? null;
      }
      return point;
    });

    return { dataType, domain, testCode, pattern, studyDay, sexes, doseLevels, mergedPoints, rows };
  }, [drRows, endpointLabel, selectedDay, availableDays]);

  // ── Auto-detect compact mode for low-incidence ────────────
  const maxIncidence = useMemo(() => {
    if (!chartData || chartData.dataType !== "categorical") return 1;
    let max = 0;
    for (const pt of chartData.mergedPoints) {
      for (const sex of chartData.sexes) {
        const v = pt[`incidence_${sex}`] as number | null;
        if (v != null && v > max) max = v;
      }
    }
    return max;
  }, [chartData]);

  useEffect(() => {
    setIncidenceScale(maxIncidence < 0.3 ? "compact" : "scaled");
  }, [maxIncidence]);

  const effectiveCompact = incidenceScale === "compact" || maxIncidence < 0.3;

  // ── Non-monotonic flag ────────────────────────────────────
  const nonMonoFlag = useMemo(() => {
    if (!chartData || !chartData.pattern) return null;
    for (const sex of chartData.sexes) {
      const sexRows = chartData.rows.filter((r) => r.sex === sex);
      if (sexRows.length === 0) continue;
      const groupStats: GroupStat[] = sexRows.map((r) => ({
        dose_level: r.dose_level, mean: r.mean, sd: r.sd, n: r.n ?? 0, median: null,
      }));
      const pairwise: PairwiseResult[] = sexRows
        .filter((r) => r.dose_level > 0)
        .map((r) => ({
          dose_level: r.dose_level, p_value: r.p_value, p_value_adj: null,
          statistic: null, cohens_d: r.effect_size,
        }));
      const flag = checkNonMonotonic(groupStats, pairwise, chartData.pattern);
      if (flag.triggered) return flag;
    }
    return null;
  }, [chartData]);

  // ── Has effect size data? ─────────────────────────────────
  const hasEffect = useMemo(() => {
    if (!chartData) return false;
    return chartData.sexes.some((s) =>
      chartData.mergedPoints.some((p) => p[`effect_${s}`] != null),
    );
  }, [chartData]);

  // ── OM normalization subtitle ─────────────────────────────
  const omSubtitle = useMemo(() => {
    if (!chartData || chartData.domain !== "OM") return undefined;
    const specimen = chartData.testCode?.toUpperCase() ?? "";
    if (!specimen) return undefined;
    const normCtx = normalization.getContext(specimen);
    if (!normCtx || normCtx.tier < 2) return undefined;
    return normCtx.activeMode === "body_weight" ? "Ratio-to-BW"
      : normCtx.activeMode === "brain_weight" ? "Ratio-to-brain"
      : normCtx.activeMode === "ancova" ? "ANCOVA-adjusted"
      : "Absolute weight";
  }, [chartData, normalization]);

  // ── Build compact chart options ───────────────────────────
  const drOption = useMemo(() => {
    if (!chartData) return null;
    const raw = chartData.dataType === "continuous"
      ? buildDoseResponseLineOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, undefined, nonMonoFlag)
      : buildIncidenceBarOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, undefined, effectiveCompact);
    return compactify(raw, chartData.mergedPoints);
  }, [chartData, nonMonoFlag, effectiveCompact]);

  const esOption = useMemo(() => {
    if (!chartData || !hasEffect) return null;
    const raw = buildEffectSizeBarOption(
      chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, esSymbol,
      omSubtitle ? `Computed from ${omSubtitle.toLowerCase().replace(/-/g, " ")}` : undefined,
    );
    return compactifyEffectSize(raw, chartData.mergedPoints);
  }, [chartData, hasEffect, esSymbol, omSubtitle]);

  // ── Resize handle ─────────────────────────────────────────
  const onChartResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const container = chartRowRef.current;
    if (!container) return;
    const startX = e.clientX;
    const startPct = splitPct;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      setSplitPct(Math.max(20, Math.min(80, startPct + (dx / rect.width) * 100)));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [splitPct]);

  if (!chartData || !drOption) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        No dose-response data for this endpoint.
      </div>
    );
  }

  const isContinuous = chartData.dataType === "continuous";

  return (
    <div style={{ height }} className="flex flex-col overflow-hidden">
      {/* Day stepper + dropdown — shared across both charts */}
      {availableDays.length > 1 && (
        <div className="flex items-center justify-center gap-0.5 py-0.5">
          <button
            type="button"
            disabled={!canPrev}
            className="px-1 text-[10px] text-muted-foreground disabled:opacity-20 hover:text-foreground"
            onClick={() => canPrev && setSelectedDay(availableDays[dayIdx - 1])}
          >
            &lsaquo;
          </button>
          <span className="relative inline-flex items-center">
            <select
              className="appearance-none border-none bg-transparent pr-3 text-center text-[9px] font-semibold tabular-nums text-foreground outline-none cursor-pointer"
              value={selectedDay ?? ""}
              onChange={(e) => setSelectedDay(Number(e.target.value))}
            >
              {availableDays.map((d) => {
                const label = dayLabels.get(d);
                return (
                  <option key={d} value={d}>
                    D{d}{label ? ` (${label})` : ""}
                  </option>
                );
              })}
            </select>
            <span className="pointer-events-none absolute right-0 text-[7px] text-muted-foreground">&#x25BE;</span>
          </span>
          <button
            type="button"
            disabled={!canNext}
            className="px-1 text-[10px] text-muted-foreground disabled:opacity-20 hover:text-foreground"
            onClick={() => canNext && setSelectedDay(availableDays[dayIdx + 1])}
          >
            &rsaquo;
          </button>
        </div>
      )}

      {/* Charts row — resizable split */}
      <div ref={chartRowRef} className="flex flex-1 min-h-0">
        {/* Left: D-R chart */}
        <div
          className="flex shrink-0 flex-col overflow-hidden px-1"
          style={{ width: hasEffect ? `${splitPct}%` : "100%" }}
        >
          {/* Title + legend */}
          <div className="flex shrink-0 items-center justify-between py-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {isContinuous ? "Mean \u00b1 SD" : "Incidence"}
              </span>
              {!isContinuous && (
                <ChartModeToggle mode={incidenceScale} onChange={setIncidenceScale} />
              )}
            </div>
            <div className="flex items-center gap-2 text-[8px] text-muted-foreground">
              {chartData.sexes.map((sex) => (
                <span key={sex} className="flex items-center gap-0.5">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: sexColors[sex] ?? "#666" }} />
                  {sexLabels[sex] ?? sex}
                </span>
              ))}
              {isContinuous && (
                <span className="flex items-center gap-0.5">
                  <span className="inline-block h-2 w-2 rounded-full border border-gray-700 bg-gray-400" />
                  p&lt;0.05
                </span>
              )}
            </div>
          </div>

          {/* Chart fills remaining space */}
          <div className="flex-1 min-h-0">
            <EChartsWrapper option={drOption} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>

        {/* Resize handle */}
        {hasEffect && <PanelResizeHandle onPointerDown={onChartResize} />}

        {/* Right: Effect size chart */}
        {hasEffect && esOption && (
          <div className="flex min-w-0 flex-1 flex-col px-1">
            {/* Title + legend */}
            <div className="flex shrink-0 items-center justify-between py-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Effect size ({esLabel})
                {omSubtitle && <span className="normal-case"> &mdash; {omSubtitle}</span>}
              </span>
              <span className="text-[8px] text-muted-foreground/60">{esSymbol}=0.8 threshold</span>
            </div>

            {/* Chart fills remaining space */}
            <div className="flex-1 min-h-0">
              <EChartsWrapper option={esOption} style={{ width: "100%", height: "100%" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
