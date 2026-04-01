/**
 * DoseResponseChartPanel — compact D-R + effect size charts for FindingsView.
 * Post-processes ECharts options from shared builders for tighter layout.
 */
import { useCallback, useMemo, useRef, useState } from "react";
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
import type { MergedPoint, BarVerdictInfo } from "@/components/analysis/charts/dose-response-charts";
import { flattenFindingsToDRRows } from "@/lib/derive-summaries";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { getSexColor, getDoseGroupColor, formatDoseShortLabel, getNeutralHeatColor } from "@/lib/severity-colors";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { PAIRWISE_TEST_LABELS, MULTIPLICITY_LABELS, TREND_TEST_LABELS, INCIDENCE_TREND_LABELS } from "@/lib/build-settings-params";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { checkNonMonotonic } from "@/lib/endpoint-confidence";
import { useStatMethods } from "@/hooks/useStatMethods";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import { useSessionState, isOneOf } from "@/hooks/useSessionState";
import { CenterDistribution } from "./CenterDistribution";
import { RecoveryDumbbellChart } from "../panes/RecoveryDumbbellChart";
import { IncidenceRecoveryChart } from "../panes/IncidenceRecoveryChart";
import { IncidenceDoseCharts } from "./IncidenceDoseCharts";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import type { UnifiedFinding, DoseGroup, GroupStat, PairwiseResult } from "@/types/analysis";
import type { DoseResponseRow } from "@/types/analysis-views";

// Domain allowlist for distribution (continuous domains with individual subject data)
const DISTRIBUTION_DOMAINS = new Set(["BW", "LB", "OM", "FW", "BG", "EG", "VS"]);

interface Props {
  endpointLabel: string;
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  /** Study day to display. Managed by parent via DayStepper. */
  selectedDay: number | null;
  /** Left panel tab: dose-response or recovery dumbbell. */
  leftTab: "dr" | "recovery";
  onLeftTabChange: (tab: "dr" | "recovery") => void;
  /** Whether recovery data exists for this study. */
  hasRecovery: boolean;
  /** Recovery comparison data (multi-day). */
  recoveryData?: RecoveryComparisonResponse;
}

const sexColors: Record<string, string> = { M: getSexColor("M"), F: getSexColor("F") };
const sexLabels: Record<string, string> = { M: "Males", F: "Females" };

// Compact grid + font sizes for findings panel context
const COMPACT_GRID = { left: 4, right: 8, top: 12, bottom: 16, containLabel: true };
const COMPACT_AXIS_FONT = 8;

/** Severity grade labels — canonical across all severity displays. */
const SEV_GRADE_LABELS = ["Minimal", "Mild", "Moderate", "Marked", "Severe"] as const;
const SEV_GRADE_SCORES = [0.1, 0.3, 0.5, 0.7, 0.9] as const;

/** Shared severity legend for stacked severity charts. */
function SeverityLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
      {SEV_GRADE_LABELS.map((label, i) => (
        <span key={label} className="flex items-center gap-0.5">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: getNeutralHeatColor(SEV_GRADE_SCORES[i]).bg }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

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

  // Detect horizontal bar chart (y=category array with 2 axes — e.g., D-R bar chart)
  const isHorizontalBar = Array.isArray(o.yAxis) && o.yAxis.length === 2;

  if (isHorizontalBar) {
    // Horizontal bar: tight grid — method label + verdict notes rendered as React elements outside chart
    o.grid = { left: 54, right: 72, top: 4, bottom: 4, containLabel: true };
    // Shrink fonts on both y-axes but preserve rich formatting
    o.yAxis = (o.yAxis as Record<string, unknown>[]).map((ax) => {
      const existing = ax.axisLabel as Record<string, unknown> | undefined;
      if (existing?.rich) return { ...ax, axisLabel: { ...existing, fontSize: COMPACT_AXIS_FONT } };
      return ax;
    });
    // X-axis: preserve existing config (builder already set show:false), just shrink font
    if (o.xAxis && !Array.isArray(o.xAxis)) {
      const existingXLabel = (o.xAxis as Record<string, unknown>).axisLabel as Record<string, unknown> | undefined;
      o.xAxis = { ...o.xAxis, axisLabel: { ...existingXLabel, fontSize: COMPACT_AXIS_FONT } };
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
      // Bar widths: uniform across incidence + severity charts
      if (ns.type === "bar") {
        ns.barMaxWidth = 16;
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
      const newS: Record<string, unknown> = { ...s, barMaxWidth: 16 };
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
  leftTab,
  onLeftTabChange,
  hasRecovery,
  recoveryData,
}: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const { effectSize: esMethod } = useStatMethods(studyId);
  const esSymbol = getEffectSizeSymbol(esMethod);
  const esLabel = getEffectSizeLabel(esMethod);
  const normalization = useOrganWeightNormalization(studyId);
  const { settings: { pairwiseTest, multiplicity, trendTest, incidenceTrend } } = useStudySettings();
  const DR_MODES = ["line", "bar"] as const;
  type DRChartMode = typeof DR_MODES[number];
  const [drChartMode, setDrChartMode] = useSessionState<DRChartMode>(
    "pcc.findings.drChartMode", "line", isOneOf(DR_MODES),
  );
  const { selectedFinding } = useFindingSelection();
  const [splitPct, setSplitPct] = useState(50);
  const chartRowRef = useRef<HTMLDivElement>(null);

  // Right sub-panel tab: effect size chart, distribution, or recovery (CL/MA)
  const RIGHT_TABS = ["effect", "distribution", "recovery"] as const;
  type RightTab = typeof RIGHT_TABS[number];
  const [rightTab, setRightTab] = useSessionState<RightTab>(
    "pcc.findings.rightTab", "effect", isOneOf(RIGHT_TABS),
  );

  // Distribution available when endpoint is continuous with individual data
  const hasDistribution = !!(
    selectedFinding?.data_type === "continuous" &&
    DISTRIBUTION_DOMAINS.has(selectedFinding.domain)
  );

  // Incidence recovery in right panel — CL and MA only
  const INCIDENCE_RECOVERY_DOMAINS = new Set(["CL", "MA"]);
  const hasRightRecovery = !!(
    selectedFinding &&
    INCIDENCE_RECOVERY_DOMAINS.has(selectedFinding.domain) &&
    hasRecovery
  );

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

    // Crossover/safety-pharm findings have day=null (no single study day).
    // Skip day filtering when all rows for this endpoint lack a day.
    const hasDay = rows.some((r) => r.day != null);
    if (hasDay) {
      if (selectedDay == null) return null;
      rows = rows.filter((r) => r.day === selectedDay);
    }
    if (rows.length === 0) return null;

    // When endpoint spans multiple domains (e.g. MI + MA for KIDNEY — CYST),
    // scope to the selected finding's domain to avoid lookup-map collisions
    // where one domain's incidence silently overwrites another's.
    const activeDomain = selectedFinding?.domain;
    const domains = new Set(rows.map((r) => r.domain));
    if (domains.size > 1 && activeDomain && domains.has(activeDomain)) {
      rows = rows.filter((r) => r.domain === activeDomain);
    }

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
        // Severity grade counts for MI stacked severity chart
        const epFinding = findings.find(
          (f) => (f.endpoint_label ?? f.finding) === endpointLabel && f.sex === sex && f.domain === domain,
        );
        const gs = epFinding?.group_stats.find((g) => g.dose_level === dl);
        point[`sev_counts_${sex}`] = gs?.severity_grade_counts ?? null;
      }
      return point;
    });

    return { dataType, domain, testCode, pattern, studyDay, sexes, doseLevels, mergedPoints, rows };
  }, [drRows, findings, endpointLabel, selectedDay, selectedFinding?.domain]);


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

  // ── Method test label ──────────────────────────────────────
  const methodLabel = useMemo(() => {
    const testName = PAIRWISE_TEST_LABELS[pairwiseTest] ?? pairwiseTest;
    const multName = MULTIPLICITY_LABELS[multiplicity] ?? multiplicity;
    return `Pairwise: ${testName} (${multName})`;
  }, [pairwiseTest, multiplicity]);

  // ── Trend test name ───────────────────────────────────────
  const trendTestName = useMemo(() => {
    if (!chartData) return "";
    return chartData.dataType === "continuous"
      ? (TREND_TEST_LABELS[trendTest] ?? "Jonckheere-Terpstra")
      : (INCIDENCE_TREND_LABELS[incidenceTrend] ?? "Cochran-Armitage");
  }, [chartData, trendTest, incidenceTrend]);

  // ── Verdict info for bar chart footer notes ───────────────
  const barVerdicts = useMemo((): BarVerdictInfo[] | undefined => {
    if (!chartData) return undefined;
    return chartData.sexes.map((sex) => {
      // Find significant dose labels (p<0.05, dose_level > 0)
      const sigLabels: string[] = [];
      for (const pt of chartData.mergedPoints) {
        if ((pt.dose_level as number) === 0) continue;
        const p = pt[`p_${sex}`] as number | null;
        if (p != null && p < 0.05) sigLabels.push(String(pt.dose_label));
      }
      // Trend p from the finding for this sex at the selected day
      const dom = chartData.domain;
      const epFinding = findings.find(
        (f) => (f.endpoint_label ?? f.finding) === endpointLabel && f.sex === sex && f.day === selectedDay && f.domain === dom,
      );
      return {
        sex,
        sigDoseLabels: sigLabels,
        trendP: epFinding?.trend_p ?? null,
        trendTestName,
      };
    });
  }, [chartData, findings, endpointLabel, selectedDay, trendTestName]);

  // ── Crossover detection (within-subject design) ───────────
  const isCrossoverStudy = useMemo(() => {
    return findings.length > 0 && findings.every((f) => f.day == null);
  }, [findings]);

  // ── Concern threshold (safety pharmacology) ───────────────
  const concernThreshold = useMemo(() => {
    if (!chartData) return null;
    // Find the first matching finding with a concern threshold
    const f = findings.find(
      (f) => (f.endpoint_label ?? f.finding) === endpointLabel && f.domain === chartData.domain && f._concern_threshold != null,
    );
    return f?._concern_threshold ?? null;
  }, [chartData, findings, endpointLabel]);

  // ── Build compact chart options ───────────────────────────
  const drOption = useMemo(() => {
    if (!chartData) return null;
    let raw: EChartsOption;
    if (chartData.dataType === "continuous") {
      raw = drChartMode === "bar"
        ? buildDoseResponseBarOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, undefined, nonMonoFlag, methodLabel, barVerdicts)
        : buildDoseResponseLineOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, undefined, nonMonoFlag, concernThreshold);
    } else {
      raw = buildIncidenceBarOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels);
    }
    return compactify(raw, chartData.mergedPoints);
  }, [chartData, drChartMode, nonMonoFlag, methodLabel, barVerdicts, concernThreshold]);

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

  // ── Recovery dumbbell chart data ─────────────────────────
  // Filter recovery rows to the selected endpoint + day for the dumbbell chart.
  // The backend already excludes main-study-period days (≤ terminal sacrifice),
  // so all rows here are genuine recovery-period measurements.
  const recoveryDumbbellRows = useMemo(() => {
    if (!recoveryData?.available || leftTab !== "recovery") return [];
    // MI/MA findings use incidence_rows, not continuous rows — skip dumbbell.
    // Without this guard, MI specimen names (e.g. "LIVER") match OM continuous
    // rows (organ weight), showing a misleading Hedges' g chart for histopath.
    const dom = selectedFinding?.domain;
    if (dom === "MI" || dom === "MA") return [];
    const testCode = selectedFinding?.test_code ?? "";
    const specimen = selectedFinding?.specimen;
    const matched = recoveryData.rows.filter((r) => {
      if (specimen) return r.test_code.toUpperCase() === specimen.toUpperCase();
      return r.test_code.toUpperCase() === testCode.toUpperCase();
    });
    // When viewing at a specific day, filter to that day; otherwise show max day
    if (selectedDay != null) {
      const atDay = matched.filter((r) => r.day === selectedDay);
      if (atDay.length > 0) return atDay;
    }
    // Fallback: max day per dose_level × sex
    const best = new Map<string, typeof matched[number]>();
    for (const r of matched) {
      const key = `${r.sex}_${r.dose_level}`;
      const prev = best.get(key);
      if (!prev || (r.day ?? 0) > (prev.day ?? 0)) best.set(key, r);
    }
    return [...best.values()];
  }, [recoveryData, leftTab, selectedDay, selectedFinding?.test_code, selectedFinding?.specimen, selectedFinding?.domain]);

  // ── Recovery effect size bar chart (continuous endpoints) ──
  const recoveryEsOption = useMemo(() => {
    if (!recoveryDumbbellRows.length || leftTab !== "recovery") return null;
    const sexes = [...new Set(recoveryDumbbellRows.map((r) => r.sex))].sort();
    const doseLevels = [...new Set(recoveryDumbbellRows.map((r) => r.dose_level))].sort((a, b) => a - b);
    // Skip control group (dose_level 0) — effect size is always 0 for controls
    const treatmentDoses = doseLevels.filter((dl) => dl > 0);
    if (treatmentDoses.length === 0) return null;

    const doseGroupMap = new Map(doseGroups.map((dg) => [dg.dose_level, dg]));
    const lookup = new Map<string, typeof recoveryDumbbellRows[number]>();
    for (const r of recoveryDumbbellRows) lookup.set(`${r.sex}_${r.dose_level}`, r);

    const mergedPoints: MergedPoint[] = treatmentDoses.map((dl) => {
      const point: MergedPoint = {
        dose_level: dl,
        dose_label: formatDoseShortLabel(doseGroupMap.get(dl)?.label ?? `Dose ${dl}`),
      };
      for (const sex of sexes) {
        const r = lookup.get(`${sex}_${dl}`);
        point[`effect_${sex}`] = r?.effect_size ?? null;
      }
      return point;
    });

    const raw = buildEffectSizeBarOption(mergedPoints, sexes, sexColors, sexLabels, "g", "Residual effect at recovery");
    return compactifyEffectSize(raw, mergedPoints);
  }, [recoveryDumbbellRows, leftTab, doseGroups]);

  // Incidence recovery rows (CL/MI) filtered to this endpoint
  const incidenceRecoveryRows = useMemo(() => {
    if (!recoveryData?.incidence_rows?.length || !selectedFinding) return [];
    const finding = selectedFinding.finding;
    const testCode = selectedFinding.test_code;
    const specimen = selectedFinding.specimen?.toUpperCase();
    return recoveryData.incidence_rows.filter((r) => {
      if (!(r.finding === finding || r.finding === testCode)) return false;
      if (r.main_affected === 0 && r.recovery_affected === 0) return false;
      // MI rows carry specimen — match against selected finding's organ
      if (specimen && r.specimen && r.specimen.toUpperCase() !== specimen) return false;
      return true;
    });
  }, [recoveryData, selectedFinding]);

  // ── MI recovery severity data ──────────────────────────────
  // Extracts severity grade counts (main vs recovery arm) for MI findings
  // from incidence_rows, then builds MergedPoint[] for the severity chart.
  const miRecoveryRows = useMemo(() => {
    if (!recoveryData?.incidence_rows?.length || !selectedFinding) return [];
    if (selectedFinding.domain !== "MI") return [];
    const finding = selectedFinding.finding?.toUpperCase();
    const testCode = selectedFinding.test_code?.toUpperCase();
    const specimen = selectedFinding.specimen?.toUpperCase();
    return recoveryData.incidence_rows.filter((r) => {
      if (r.domain !== "MI") return false;
      const rFinding = r.finding?.toUpperCase();
      if (rFinding !== finding && rFinding !== testCode) return false;
      if (specimen && r.specimen && r.specimen.toUpperCase() !== specimen) return false;
      return true;
    });
  }, [recoveryData, selectedFinding]);

  const miRecoverySevData = useMemo(() => {
    if (miRecoveryRows.length === 0) return null;
    const sexes = [...new Set(miRecoveryRows.map((r) => r.sex))].sort();
    const doseLevels = [...new Set(miRecoveryRows.map((r) => r.dose_level))].sort((a, b) => a - b);

    const mainPoints: MergedPoint[] = doseLevels.map((dl) => {
      const point: MergedPoint = {
        dose_level: dl,
        dose_label: formatDoseShortLabel(miRecoveryRows.find((r) => r.dose_level === dl)?.dose_label ?? `Dose ${dl}`),
      };
      for (const sex of sexes) {
        const row = miRecoveryRows.find((r) => r.dose_level === dl && r.sex === sex);
        point[`sev_counts_${sex}`] = row?.main_severity_counts ?? null;
      }
      return point;
    });

    const recoveryPoints: MergedPoint[] = doseLevels.map((dl) => {
      const point: MergedPoint = {
        dose_level: dl,
        dose_label: formatDoseShortLabel(miRecoveryRows.find((r) => r.dose_level === dl)?.dose_label ?? `Dose ${dl}`),
      };
      for (const sex of sexes) {
        const row = miRecoveryRows.find((r) => r.dose_level === dl && r.sex === sex);
        point[`sev_counts_${sex}`] = row?.recovery_severity_counts ?? null;
      }
      return point;
    });

    const hasRecoverySev = recoveryPoints.some((pt) =>
      sexes.some((s) => pt[`sev_counts_${s}`] != null),
    );
    const hasMainSev = mainPoints.some((pt) =>
      sexes.some((s) => pt[`sev_counts_${s}`] != null),
    );

    if (!hasMainSev && !hasRecoverySev) return null;
    return { mainPoints, recoveryPoints, sexes, hasMainSev, hasRecoverySev };
  }, [miRecoveryRows]);

  const mainSevRecoveryOption = useMemo(() => {
    if (!miRecoverySevData?.hasMainSev) return null;
    const raw = buildStackedSeverityBarOption(
      miRecoverySevData.mainPoints, miRecoverySevData.sexes, sexColors, sexLabels,
    );
    return compactify(raw, miRecoverySevData.mainPoints);
  }, [miRecoverySevData]);

  const recSevRecoveryOption = useMemo(() => {
    if (!miRecoverySevData?.hasRecoverySev) return null;
    const raw = buildStackedSeverityBarOption(
      miRecoverySevData.recoveryPoints, miRecoverySevData.sexes, sexColors, sexLabels,
    );
    return compactify(raw, miRecoverySevData.recoveryPoints);
  }, [miRecoverySevData]);

  const hasMiRecoverySev = !!miRecoverySevData;

  // Available right-panel tabs for this endpoint.
  // CL/MA: only recovery (no effect/distribution — incidence endpoints).
  // MI in recovery mode: severity tab from recovery incidence data (not day-dependent).
  const availableRightTabs = useMemo(() => {
    const tabs: { key: RightTab; label: string }[] = [];
    if (!hasRightRecovery) {
      // MI in recovery mode: use recovery severity data (independent of chartDay)
      if (leftTab === "recovery" && hasMiRecoverySev) {
        tabs.push({ key: "effect", label: "Severity" });
      } else if (leftTab === "recovery" && recoveryEsOption) {
        // Continuous recovery: show recovery effect size chart
        tabs.push({ key: "effect", label: "Effect size" });
      } else if (hasEffect || hasSeverityData) {
        // Continuous / MI endpoints: effect + distribution tabs
        tabs.push({ key: "effect", label: hasSeverityData ? "Severity" : "Effect size" });
      }
      if (hasDistribution)
        tabs.push({ key: "distribution", label: "Distribution" });
    } else {
      // CL/MA: always show recovery side-by-side with treatment chart
      tabs.push({ key: "recovery", label: "Recovery" });
    }
    return tabs;
  }, [hasEffect, hasSeverityData, hasDistribution, hasRightRecovery, incidenceRecoveryRows.length, leftTab, hasMiRecoverySev, recoveryEsOption]);

  const showRightTabs = availableRightTabs.length > 1;
  // Resolve active tab: if current selection isn't available, fall back to first available
  const activeRightContent: RightTab = availableRightTabs.some((t) => t.key === rightTab)
    ? rightTab
    : (availableRightTabs[0]?.key ?? "effect");
  // Whether the right panel has actual renderable content
  const hasRightPanel = availableRightTabs.length > 0 && (
    (activeRightContent === "distribution" && !!selectedFinding) ||
    (activeRightContent === "effect" && (
      (leftTab === "recovery" && hasMiRecoverySev) ||
      (leftTab === "recovery" && !!recoveryEsOption) ||
      (hasSeverityData && !!sevOption) ||
      (hasEffect && !!esOption)
    )) ||
    (activeRightContent === "recovery" && hasRightRecovery)
  );

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

  // Incidence endpoints get a completely different layout — bypass the continuous framework
  if (selectedFinding?.data_type === "incidence") {
    return (
      <IncidenceDoseCharts
        findings={findings}
        endpointLabel={endpointLabel}
        doseGroups={doseGroups}
        selectedDay={selectedDay}
        hasRecovery={hasRecovery}
        recoveryData={recoveryData}
      />
    );
  }

  // No early return — the tab bar must always render so users can switch tabs.
  // "No data" states are shown inside each tab's content area instead.
  const isContinuous = chartData?.dataType === "continuous";
  const noDRData = !chartData || !drOption;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Charts row — resizable split */}
      <div ref={chartRowRef} className="flex flex-1 min-h-0">
        {/* Left sub-panel */}
        <div
          className="flex shrink-0 flex-col overflow-hidden px-1"
          style={{ width: hasRightPanel ? `${splitPct}%` : "100%" }}
        >
          {/* Left panel content: D-R chart or Recovery dumbbell.
              When hasRightRecovery (CL/MA), recovery lives in the right panel — left always shows D-R. */}
          {leftTab === "recovery" && hasRecovery && !hasRightRecovery ? (
            /* Recovery tab content */
            <div className="flex flex-1 min-h-0 flex-col">
              <div className="flex shrink-0 items-center justify-between py-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recovery — terminal → recovery
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {recoveryDumbbellRows.length > 0 ? (
                  /* Continuous: dumbbell chart */
                  <RecoveryDumbbellChart
                    rows={recoveryDumbbellRows}
                    doseGroups={doseGroups}
                    terminalDay={recoveryDumbbellRows[0]?.terminal_day}
                    recoveryDay={selectedDay}
                  />
                ) : incidenceRecoveryRows.length > 0 ? (
                  /* Incidence (CL/MI/MA): paired bar chart */
                  <div className="px-2 py-2 overflow-auto">
                    <IncidenceRecoveryChart
                      rows={incidenceRecoveryRows}
                      terminalDay={incidenceRecoveryRows[0]?.recovery_day != null
                        ? undefined  // terminal day not in incidence rows; header shows recovery day
                        : undefined}
                      recoveryDay={incidenceRecoveryRows[0]?.recovery_day}
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No recovery data for this endpoint.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* D-R chart (default) */
            noDRData ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                No dose-response data for this endpoint.
              </div>
            ) : (
            <>
              {/* Title + legend */}
              <div className="flex shrink-0 items-center justify-between py-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {isContinuous ? "Mean \u00b1 SD" : "Incidence"}
                  </span>
                  {isCrossoverStudy && (
                    <span className="text-[9px] text-muted-foreground/60" title="Within-subject design: same animals receive all treatments. Change from baseline (CFB).">
                      within-subject CFB
                    </span>
                  )}
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
                </div>
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                  {chartData?.sexes.map((sex) => (
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
                {drOption && <EChartsWrapper option={drOption} style={{ width: "100%", height: "100%" }} />}
              </div>

              {/* Method label + verdict notes below chart — bar mode only */}
              {isContinuous && drChartMode === "bar" && (
            <div className="shrink-0">
              <div className="text-[10px] italic text-muted-foreground">{methodLabel}</div>
              {barVerdicts && barVerdicts.map((v) => {
                const sigPart = v.sigDoseLabels.length > 0
                  ? `Sig. at ${v.sigDoseLabels.join(", ")}`
                  : "No sig. differences";
                const trendFmt = v.trendP != null
                  ? (v.trendP < 0.001 ? "p<0.001" : `p=${v.trendP.toFixed(3)}`)
                  : "p=\u2014";
                return (
                  <div key={v.sex} className="text-[9px] text-muted-foreground">
                    <span style={{ color: getSexColor(v.sex) }}>{v.sex}</span>
                    {": "}
                    <span className={v.sigDoseLabels.length > 0 ? "text-foreground/80" : ""}>{sigPart}</span>
                    {". Trend: "}
                    <span className="font-mono">{trendFmt}</span>
                    {` (${v.trendTestName})`}
                  </div>
                );
              })}
            </div>
          )}
            </>
            )
          )}

          {/* Left tab bar — D-R | Recovery.
              Hidden for CL/MA: recovery shown directly in right panel. */}
          {hasRecovery && !hasRightRecovery && (
            <div className="relative flex shrink-0 items-stretch border-t border-border bg-muted/40">
              {(["dr", "recovery"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onLeftTabChange(tab)}
                  className={`px-3 py-1 text-xs transition-colors ${
                    leftTab === tab
                      ? "-mt-px border-x border-b border-border bg-background font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:text-foreground/70"
                  }`}
                >
                  {tab === "dr" ? "Dose-response" : "Recovery"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Resize handle */}
        {hasRightPanel && <PanelResizeHandle onPointerDown={onChartResize} />}

        {/* Right sub-panel: tabbed between metric chart + distribution */}
        {hasRightPanel && (
          <div className="flex min-w-0 flex-1 flex-col px-1">
            {/* Right panel content — routed by activeRightContent */}
            {activeRightContent === "distribution" && selectedFinding ? (
              /* Distribution strip plots */
              <div className="flex flex-1 min-h-0 flex-col pt-0.5">
                <div className="flex shrink-0 items-center justify-between py-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Individual values
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <CenterDistribution
                    finding={selectedFinding}
                    selectedDay={selectedDay}
                    isRecoveryMode={leftTab === "recovery"}
                  />
                </div>
              </div>
            ) : activeRightContent === "recovery" && hasRightRecovery ? (
              /* Incidence recovery (CL/MI/MA) — unified paired bar chart */
              <div className="flex flex-1 min-h-0 flex-col pt-0.5">
                <div className="flex shrink-0 items-center justify-between py-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Recovery — incidence
                  </span>
                </div>
                {incidenceRecoveryRows.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-auto px-1 py-1">
                  <IncidenceRecoveryChart
                    rows={incidenceRecoveryRows}
                    recoveryDay={recoveryData?.recovery_day}
                  />
                </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
                    Tissue not examined in recovery arm.
                  </div>
                )}
              </div>
            ) : activeRightContent === "effect" && leftTab === "recovery" && hasMiRecoverySev ? (
              /* MI recovery severity comparison: terminal vs recovery */
              <>
                <div className="flex shrink-0 items-center justify-between py-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Severity distribution
                  </span>
                  <SeverityLegend />
                </div>
                <div className="flex flex-1 min-h-0 flex-col gap-0.5">
                  {mainSevRecoveryOption && (
                    <div className="flex flex-1 min-h-0 flex-col">
                      <span className="shrink-0 text-[9px] font-medium text-muted-foreground/70 px-1">Terminal</span>
                      <div className="flex-1 min-h-0">
                        <EChartsWrapper option={mainSevRecoveryOption} style={{ width: "100%", height: "100%" }} />
                      </div>
                    </div>
                  )}
                  {recSevRecoveryOption && (
                    <div className="flex flex-1 min-h-0 flex-col">
                      <span className="shrink-0 text-[9px] font-medium text-muted-foreground/70 px-1">Recovery</span>
                      <div className="flex-1 min-h-0">
                        <EChartsWrapper option={recSevRecoveryOption} style={{ width: "100%", height: "100%" }} />
                      </div>
                    </div>
                  )}
                  {!mainSevRecoveryOption && !recSevRecoveryOption && (
                    <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
                      No severity data for recovery arm
                    </div>
                  )}
                </div>
              </>
            ) : activeRightContent === "effect" && leftTab === "recovery" && recoveryEsOption ? (
              /* Recovery effect size bar chart (continuous) */
              <>
                <div className="flex shrink-0 items-center justify-between py-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Residual effect size (g)
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">g=0.8 threshold</span>
                </div>
                <div className="flex-1 min-h-0">
                  <EChartsWrapper option={recoveryEsOption} style={{ width: "100%", height: "100%" }} />
                </div>
              </>
            ) : activeRightContent === "effect" && hasSeverityData && sevOption ? (
              /* Stacked severity (incidence MI) */
              <>
                <div className="flex shrink-0 items-center justify-between py-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Severity distribution
                  </span>
                  <SeverityLegend />
                </div>
                <div className="flex-1 min-h-0">
                  <EChartsWrapper option={sevOption} style={{ width: "100%", height: "100%" }} />
                </div>
              </>
            ) : activeRightContent === "effect" && hasEffect && esOption ? (
              /* Effect size bar chart */
              <>
                <div className="flex shrink-0 items-center justify-between py-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Effect size ({esLabel})
                    {omSubtitle && <span className="normal-case"> &mdash; {omSubtitle}</span>}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">{esSymbol}=0.8 threshold</span>
                </div>
                <div className="flex-1 min-h-0">
                  <EChartsWrapper option={esOption} style={{ width: "100%", height: "100%" }} />
                </div>
              </>
            ) : null}

            {/* Right tab bar */}
            {showRightTabs && (
              <div className="relative flex shrink-0 items-stretch border-t border-border bg-muted/40">
                {availableRightTabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setRightTab(t.key)}
                    className={`px-3 py-1 text-xs transition-colors ${
                      activeRightContent === t.key
                        ? "-mt-px border-x border-b border-border bg-background font-semibold text-foreground"
                        : "font-medium text-muted-foreground hover:text-foreground/70"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
