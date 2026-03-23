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
  buildDoseResponseBarOption,
  buildIncidenceBarOption,
  buildEffectSizeBarOption,
  buildStackedSeverityBarOption,
} from "@/components/analysis/charts/dose-response-charts";
import type { MergedPoint } from "@/components/analysis/charts/dose-response-charts";
import { flattenFindingsToDRRows } from "@/lib/derive-summaries";
import { getSexColor, getDoseGroupColor, formatDoseNumericLabel, getNeutralHeatColor } from "@/lib/severity-colors";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { PAIRWISE_TEST_LABELS, MULTIPLICITY_LABELS } from "@/lib/build-settings-params";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { checkNonMonotonic } from "@/lib/endpoint-confidence";
import { useStatMethods } from "@/hooks/useStatMethods";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import { ChartModeToggle } from "@/components/ui/ChartModeToggle";
import type { ChartDisplayMode } from "@/components/ui/ChartModeToggle";
import { useSessionState, isOneOf } from "@/hooks/useSessionState";
import type { UnifiedFinding, DoseGroup, GroupStat, PairwiseResult } from "@/types/analysis";
import type { DoseResponseRow } from "@/types/analysis-views";

interface Props {
  endpointLabel: string;
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  /** Study day to display. Managed by parent via DayStepper. */
  selectedDay: number | null;
}

const sexColors: Record<string, string> = { M: getSexColor("M"), F: getSexColor("F") };
const sexLabels: Record<string, string> = { M: "Males", F: "Females" };

// Compact grid + font sizes for findings panel context
const COMPACT_GRID = { left: 44, right: 8, top: 12, bottom: 52 };
const COMPACT_AXIS_FONT = 8;

/** Build rich x-axis labels with dose-group colors. */
function coloredAxisLabels(points: MergedPoint[]) {
  return {
    fontSize: COMPACT_AXIS_FONT,
    rotate: 45,
    align: "right" as const,
    margin: 2,
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

  // Detect horizontal bar chart (y=category array with 2 axes — e.g., D-R bar chart)
  const isHorizontalBar = Array.isArray(o.yAxis) && o.yAxis.length === 2;

  if (isHorizontalBar) {
    // Horizontal bar: compact grid preserving room for pipe labels + value labels
    o.grid = { left: 56, right: 60, top: (o.graphic ? 20 : 8), bottom: 12 };
    // Shrink fonts on both y-axes but preserve rich formatting
    o.yAxis = (o.yAxis as Record<string, unknown>[]).map((ax) => {
      const existing = ax.axisLabel as Record<string, unknown> | undefined;
      if (existing?.rich) return { ...ax, axisLabel: { ...existing, fontSize: COMPACT_AXIS_FONT } };
      return ax;
    });
    // X-axis: shrink labels
    if (o.xAxis && !Array.isArray(o.xAxis)) {
      o.xAxis = { ...o.xAxis, axisLabel: { fontSize: COMPACT_AXIS_FONT, color: "#6B7280" } };
    }
  } else {
    // Vertical charts: compact grid, color-code x-axis labels, shrink y-axis
    o.grid = COMPACT_GRID;
    const yStyle = { fontSize: COMPACT_AXIS_FONT, color: "#6B7280" };
    if (o.xAxis && !Array.isArray(o.xAxis)) {
      o.xAxis = { ...o.xAxis, axisLabel: coloredAxisLabels(points) as never };
    }
    if (o.yAxis && !Array.isArray(o.yAxis)) {
      o.yAxis = { ...o.yAxis, axisLabel: yStyle, splitLine: { show: false } };
    }
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
  selectedDay,
}: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const { effectSize: esMethod } = useStatMethods(studyId);
  const esSymbol = getEffectSizeSymbol(esMethod);
  const esLabel = getEffectSizeLabel(esMethod);
  const normalization = useOrganWeightNormalization(studyId);
  const { settings: { pairwiseTest, multiplicity } } = useStudySettings();
  const [incidenceScale, setIncidenceScale] = useState<ChartDisplayMode>("scaled");
  const DR_MODES = ["line", "bar"] as const;
  type DRChartMode = typeof DR_MODES[number];
  const [drChartMode, setDrChartMode] = useSessionState<DRChartMode>(
    "pcc.findings.drChartMode", "line", isOneOf(DR_MODES),
  );
  const [splitPct, setSplitPct] = useState(50);
  const chartRowRef = useRef<HTMLDivElement>(null);

  // ── Flatten findings → DoseResponseRow[] ──────────────────
  // Pre-filter to selected endpoint BEFORE flattening — avoids O(N*D) work
  // for all findings when only one endpoint's rows are needed.
  const drRows = useMemo(
    () => {
      const epFindings = findings.filter(
        (f) => (f.endpoint_label ?? f.finding) === endpointLabel,
      );
      return flattenFindingsToDRRows(epFindings, doseGroups);
    },
    [findings, doseGroups, endpointLabel],
  );

  // ── Filter to selected endpoint + day, build MergedPoint[] ─
  const chartData = useMemo(() => {
    let rows = drRows.filter((r) => r.endpoint_label === endpointLabel);
    if (rows.length === 0) return null;

    if (selectedDay == null) return null;
    rows = rows.filter((r) => r.day === selectedDay);
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
        dose_label: anyRow ? formatDoseNumericLabel(anyRow.dose_label) : `Dose ${dl}`,
      };
      for (const sex of sexes) {
        const r = lookup.get(`${sex}_${dl}`);
        point[`mean_${sex}`] = r?.mean ?? null;
        point[`sd_${sex}`] = r?.sd ?? null;
        point[`p_${sex}`] = r?.p_value ?? null;
        point[`incidence_${sex}`] = r?.incidence ?? null;
        point[`effect_${sex}`] = r?.effect_size ?? null;
        // Severity grade counts for MI stacked severity chart
        const epFinding = findings.find(
          (f) => (f.endpoint_label ?? f.finding) === endpointLabel && f.sex === sex,
        );
        const gs = epFinding?.group_stats.find((g) => g.dose_level === dl);
        point[`sev_counts_${sex}`] = gs?.severity_grade_counts ?? null;
      }
      return point;
    });

    return { dataType, domain, testCode, pattern, studyDay, sexes, doseLevels, mergedPoints, rows };
  }, [drRows, findings, endpointLabel, selectedDay]);

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
          statistic: null, effect_size: r.effect_size,
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

  // ── Has severity grade data? (for stacked severity chart) ─
  const hasSeverityData = useMemo(() => {
    if (!chartData || chartData.dataType === "continuous") return false;
    return chartData.sexes.some((s) =>
      chartData.mergedPoints.some((p) => p[`sev_counts_${s}`] != null),
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

  // ── Method test label (matches DoseDetailPane) ─────────────
  const methodLabel = useMemo(() => {
    const testName = PAIRWISE_TEST_LABELS[pairwiseTest] ?? pairwiseTest;
    const multName = MULTIPLICITY_LABELS[multiplicity] ?? multiplicity;
    return `Pairwise: ${testName} (${multName})`;
  }, [pairwiseTest, multiplicity]);

  // ── Build compact chart options ───────────────────────────
  const drOption = useMemo(() => {
    if (!chartData) return null;
    let raw: EChartsOption;
    if (chartData.dataType === "continuous") {
      raw = drChartMode === "bar"
        ? buildDoseResponseBarOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, undefined, nonMonoFlag, methodLabel)
        : buildDoseResponseLineOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, undefined, nonMonoFlag);
    } else {
      raw = buildIncidenceBarOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, undefined, effectiveCompact);
    }
    return compactify(raw, chartData.mergedPoints);
  }, [chartData, drChartMode, nonMonoFlag, effectiveCompact, methodLabel]);

  const esOption = useMemo(() => {
    if (!chartData || !hasEffect) return null;
    const raw = buildEffectSizeBarOption(
      chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, esSymbol,
      omSubtitle ? `Computed from ${omSubtitle.toLowerCase().replace(/-/g, " ")}` : undefined,
    );
    return compactifyEffectSize(raw, chartData.mergedPoints);
  }, [chartData, hasEffect, esSymbol, omSubtitle]);

  const sevOption = useMemo(() => {
    if (!chartData || !hasSeverityData) return null;
    const raw = buildStackedSeverityBarOption(
      chartData.mergedPoints, chartData.sexes, sexColors, sexLabels,
    );
    return compactify(raw, chartData.mergedPoints);
  }, [chartData, hasSeverityData]);

  // Whether the right panel should show anything
  const hasRightPanel = hasEffect || hasSeverityData;

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
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No dose-response data for this endpoint.
      </div>
    );
  }

  const isContinuous = chartData.dataType === "continuous";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Charts row — resizable split */}
      <div ref={chartRowRef} className="flex flex-1 min-h-0">
        {/* Left: D-R chart */}
        <div
          className="flex shrink-0 flex-col overflow-hidden px-1"
          style={{ width: hasRightPanel ? `${splitPct}%` : "100%" }}
        >
          {/* Title + legend */}
          <div className="flex shrink-0 items-center justify-between py-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {isContinuous ? "Mean \u00b1 SD" : "Incidence"}
              </span>
              {isContinuous && (
                <PanePillToggle
                  value={drChartMode}
                  options={[
                    { value: "line" as const, label: "Line" },
                    { value: "bar" as const, label: "Bar" },
                  ]}
                  onChange={setDrChartMode}
                />
              )}
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
        {hasRightPanel && <PanelResizeHandle onPointerDown={onChartResize} />}

        {/* Right panel: effect size (continuous) or stacked severity (incidence MI) */}
        {hasSeverityData && sevOption ? (
          <div className="flex min-w-0 flex-1 flex-col px-1">
            <div className="flex shrink-0 items-center justify-between py-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Severity distribution
              </span>
              <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground">
                {["Minimal", "Mild", "Moderate", "Marked", "Severe"].map((label, i) => (
                  <span key={label} className="flex items-center gap-0.5">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: getNeutralHeatColor([0.1, 0.3, 0.5, 0.7, 0.9][i]).bg }}
                    />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <EChartsWrapper option={sevOption} style={{ width: "100%", height: "100%" }} />
            </div>
          </div>
        ) : hasEffect && esOption ? (
          <div className="flex min-w-0 flex-1 flex-col px-1">
            <div className="flex shrink-0 items-center justify-between py-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Effect size ({esLabel})
                {omSubtitle && <span className="normal-case"> &mdash; {omSubtitle}</span>}
              </span>
              <span className="text-[8px] text-muted-foreground/60">{esSymbol}=0.8 threshold</span>
            </div>
            <div className="flex-1 min-h-0">
              <EChartsWrapper option={esOption} style={{ width: "100%", height: "100%" }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
