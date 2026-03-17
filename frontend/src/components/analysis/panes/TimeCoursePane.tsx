/**
 * Time Course collapsible pane — shows effect size (Hedges' g) vs concurrent
 * control as line charts (F left, M right) for continuous endpoints.
 * Supports multiple Y-axis modes: g, absolute, %change, %vs control.
 * Positioned between Dose Detail and Recovery in FindingsContextPanel.
 */
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTimeCourseData } from "@/hooks/useTimeCourseData";
import type { TimeCourseSeriesData, RawGroupPoint } from "@/hooks/useTimeCourseData";
import { useClinicalObservations } from "@/hooks/useClinicalObservations";
import { useTimecourseSubject } from "@/hooks/useTimecourse";
import { useChartScales } from "@/hooks/useChartScales";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useRecoveryPooling } from "@/hooks/useRecoveryPooling";
import { TimeCourseLineChart } from "./TimeCourseLineChart";
import { TimeCourseBarChart } from "./TimeCourseBarChart";
import type { ChartPoint, SubjectTrace } from "./TimeCourseLineChart";
import { CollapsiblePane } from "./CollapsiblePane";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { shortDoseLabel } from "@/lib/dose-label-utils";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { DeathRecord } from "@/types/mortality";
import type { TimecourseSubjectResponse } from "@/types/timecourse";
import { Info } from "lucide-react";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

// ── Y-axis mode types ────────────────────────────────────

export type YAxisMode = "g" | "absolute" | "pct_change" | "pct_vs_control";

const Y_AXIS_OPTIONS: { value: YAxisMode; label: string }[] = [
  { value: "g", label: "g" },
  { value: "absolute", label: "Abs" },
  { value: "pct_change", label: "%\u0394" },
  { value: "pct_vs_control", label: "%vsC" },
];

const Y_AXIS_INFO: Record<YAxisMode, string> = {
  g: "Hedges' g effect size: treated vs concurrent control at each timepoint. Pooled SD normalizes for within-group variability.",
  absolute: "Raw group mean values at each timepoint.",
  pct_change: "Percent change from baseline (first timepoint) for each dose group.",
  pct_vs_control: "Percent difference from concurrent control at each timepoint.",
};

// ── Timepoint mode types ─────────────────────────────────

type TimepointMode = "terminal" | "peak" | "recovery";

// ── Visibility allowlist ──────────────────────────────────

const ALLOWED_DOMAINS = new Set(["BW", "LB", "FW", "BG", "EG", "VS"]);

// ── Plot layout constants ─────────────────────────────────

const PLOT_AREA = { left: 8, top: 4, width: 182, height: 122 } as const;

// ── Transform series by Y-axis mode ──────────────────────

function transformSeries(
  raw: Record<string, Record<number, RawGroupPoint[]>>,
  controlByDay: Record<string, Map<number, { mean: number; sd: number; n: number }>>,
  gSeries: Record<string, Record<number, { day: number; g: number; n: number; nControl: number }[]>>,
  yAxisMode: YAxisMode,
): Record<string, Record<number, ChartPoint[]>> {
  if (yAxisMode === "g") {
    // Map g series directly: g → y
    const result: Record<string, Record<number, ChartPoint[]>> = {};
    for (const [sex, sexSeries] of Object.entries(gSeries)) {
      result[sex] = {};
      for (const [dlStr, pts] of Object.entries(sexSeries)) {
        result[sex][Number(dlStr)] = pts.map((p) => ({
          day: p.day,
          y: p.g,
          n: p.n,
          nControl: p.nControl,
        }));
      }
    }
    return result;
  }

  // For absolute / pct_change / pct_vs_control, use raw data (treated only, dl > 0)
  const result: Record<string, Record<number, ChartPoint[]>> = {};
  for (const [sex, sexRaw] of Object.entries(raw)) {
    result[sex] = {};
    const ctrl = controlByDay[sex];

    for (const [dlStr, pts] of Object.entries(sexRaw)) {
      const dl = Number(dlStr);
      if (dl === 0) continue; // skip control

      // Baseline for pct_change: first timepoint mean for this dose/sex
      const baseline = pts.length > 0 ? pts[0].mean : null;

      const chartPts: ChartPoint[] = [];
      for (const pt of pts) {
        const ctrlPt = ctrl?.get(pt.day);
        const nControl = ctrlPt?.n ?? 0;

        let y: number;
        if (yAxisMode === "absolute") {
          y = pt.mean;
        } else if (yAxisMode === "pct_change") {
          if (baseline != null && baseline !== 0) {
            y = ((pt.mean - baseline) / baseline) * 100;
          } else {
            y = 0;
          }
        } else {
          // pct_vs_control
          const ctrlMean = ctrlPt?.mean;
          if (ctrlMean != null && ctrlMean !== 0) {
            y = ((pt.mean - ctrlMean) / ctrlMean) * 100;
          } else {
            y = 0;
          }
        }

        chartPts.push({ day: pt.day, y, n: pt.n, nControl });
      }
      if (chartPts.length > 0) {
        result[sex][dl] = chartPts;
      }
    }
  }
  return result;
}

// ── Transform subject-level traces ───────────────────────

function transformSubjectTraces(
  subjData: TimecourseSubjectResponse,
  sex: string,
  selectedDoseGroups: number[],
  yAxisMode: YAxisMode,
  controlByDay: Record<string, Map<number, { mean: number; sd: number; n: number }>>,
  terminalDay: number | null,
): SubjectTrace[] {
  const ctrl = controlByDay[sex];
  const traces: SubjectTrace[] = [];

  // Group by USUBJID to merge treatment + recovery values
  const bySubject = new Map<string, { doseLevel: number; isRecovery: boolean; values: { day: number; value: number }[] }[]>();
  for (const s of subjData.subjects) {
    if (s.sex !== sex) continue;
    if (selectedDoseGroups.length > 0 && !selectedDoseGroups.includes(s.dose_level)) continue;
    if (s.dose_level === 0) continue; // skip control subjects

    const existing = bySubject.get(s.usubjid);
    if (existing) {
      existing.push({ doseLevel: s.dose_level, isRecovery: !!s.is_recovery, values: s.values });
    } else {
      bySubject.set(s.usubjid, [{ doseLevel: s.dose_level, isRecovery: !!s.is_recovery, values: s.values }]);
    }
  }

  for (const [usubjid, entries] of bySubject) {
    // Merge all value arrays and sort by day
    const allValues: { day: number; value: number }[] = [];
    let doseLevel = entries[0].doseLevel;
    for (const entry of entries) {
      allValues.push(...entry.values);
      doseLevel = entry.doseLevel;
    }
    allValues.sort((a, b) => a.day - b.day);
    if (allValues.length === 0) continue;

    // Subject baseline: first value
    const baseline = allValues[0].value;

    const points: { day: number; y: number }[] = [];
    for (const v of allValues) {
      let y: number;
      if (yAxisMode === "absolute") {
        y = v.value;
      } else if (yAxisMode === "pct_change") {
        y = baseline !== 0 ? ((v.value - baseline) / baseline) * 100 : 0;
      } else {
        // pct_vs_control
        const ctrlPt = ctrl?.get(v.day);
        const ctrlMean = ctrlPt?.mean;
        y = ctrlMean != null && ctrlMean !== 0
          ? ((v.value - ctrlMean) / ctrlMean) * 100
          : 0;
      }
      points.push({ day: v.day, y });
    }

    traces.push({ usubjid, doseLevel, points, terminalDay });
  }

  return traces;
}

// ── Y-axis domain computation (generic) ──────────────────

function computeYDomain(
  transformed: Record<string, Record<number, ChartPoint[]>>,
  sexes: string[],
  yAxisMode: YAxisMode,
): { yDomain: [number, number]; yTicks: number[] } {
  let min = 0;
  let max = 0;
  for (const sex of sexes) {
    const sexSeries = transformed[sex];
    if (!sexSeries) continue;
    for (const pts of Object.values(sexSeries)) {
      for (const pt of pts) {
        if (pt.y < min) min = pt.y;
        if (pt.y > max) max = pt.y;
      }
    }
  }

  if (yAxisMode === "g") {
    // Pad by 0.5, round to nearest integer
    min = Math.floor(min - 0.5);
    max = Math.ceil(max + 0.5);
    if (min === max) { min = -2; max = 2; }
  } else if (yAxisMode === "absolute") {
    // Pad by 10%
    const range = max - min || 1;
    min = min - range * 0.1;
    max = max + range * 0.1;
  } else {
    // Percentage modes: pad by 5 percentage points
    min = Math.floor(min - 5);
    max = Math.ceil(max + 5);
    if (min === max) { min = -10; max = 10; }
  }

  const range = max - min;
  let step: number;
  if (yAxisMode === "g") {
    step = range <= 6 ? 1 : range <= 15 ? 2 : 5;
  } else if (yAxisMode === "absolute") {
    // Nice step for absolute values
    const raw = range / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    step = Math.ceil(raw / mag) * mag;
    if (step === 0) step = 1;
  } else {
    // Percentage modes
    step = range <= 30 ? 5 : range <= 60 ? 10 : range <= 150 ? 25 : 50;
  }

  // Generate ticks anchored at 0, stepping outward
  const ticks: number[] = [0];
  for (let v = step; v <= max; v += step) ticks.push(v);
  for (let v = -step; v >= min; v -= step) ticks.unshift(v);

  return { yDomain: [min, max], yTicks: ticks };
}

// ── Collect all unique days ───────────────────────────────

function collectAllDays(
  transformed: Record<string, Record<number, ChartPoint[]>>,
  sexes: string[],
): number[] {
  const daySet = new Set<number>();
  for (const sex of sexes) {
    const sexSeries = transformed[sex];
    if (!sexSeries) continue;
    for (const pts of Object.values(sexSeries)) {
      for (const pt of pts) daySet.add(pt.day);
    }
  }
  return [...daySet].sort((a, b) => a - b);
}

// ── Y-axis tick formatter ────────────────────────────────

function yTickFormatter(mode: YAxisMode): (v: number) => string {
  if (mode === "g") {
    return (v) => v === 0 ? "C" : `${v > 0 ? "+" : ""}${v}`;
  }
  if (mode === "absolute") {
    return (v) => {
      if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
      if (Number.isInteger(v)) return String(v);
      return v.toFixed(1);
    };
  }
  // pct_change, pct_vs_control
  return (v) => `${v > 0 ? "+" : ""}${v}%`;
}

// ── Detail row value color ────────────────────────────────

function getValueColor(
  value: number,
  direction: "up" | "down" | "none" | null | undefined,
  isActive: boolean,
  mode: YAxisMode,
): string {
  if (!isActive) return "#94a3b8";
  if (mode === "g") {
    const abs = Math.abs(value);
    const isAdverse =
      direction === "down" ? value < 0 : direction === "up" ? value > 0 : false;
    if (isAdverse && abs > 2.0) return "#dc2626";
    if (isAdverse && abs > 0.8) return "#d97706";
  }
  return "#334155";
}

// ── Format detail value per mode ─────────────────────────

function formatDetailValue(value: number, mode: YAxisMode, unit: string): string {
  if (mode === "g") {
    return `g\u00A0=\u00A0${value > 0 ? "+" : ""}${value.toFixed(1)}`;
  }
  if (mode === "absolute") {
    const formatted = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
    return `${formatted} ${unit}`;
  }
  // pct_change, pct_vs_control
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

// ── Main component ────────────────────────────────────────

interface TimeCoursePaneProps {
  finding: UnifiedFinding;
  doseGroups?: DoseGroup[];
  expandAll?: number;
  collapseAll?: number;
}

export function TimeCoursePane({
  finding,
  doseGroups,
  expandAll,
  collapseAll,
}: TimeCoursePaneProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>("g");
  const [showSubjects, setShowSubjects] = useState(false);
  const [selectedDoseGroups, setSelectedDoseGroups] = useState<number[]>([]);

  const isCL = finding.domain === "CL";
  const isContinuous =
    finding.data_type === "continuous" && ALLOWED_DOMAINS.has(finding.domain);
  const isVisible = isContinuous || isCL;

  const { includeRecovery } = useRecoveryPooling();

  // Continuous time-course data (disabled for CL)
  const { data, isLoading, isError } = useTimeCourseData(
    isContinuous ? finding.domain : undefined,
    isContinuous ? finding.test_code : undefined,
    includeRecovery,
  );

  // Subject-level data (only fetched when subjects toggle is ON and not CL)
  const { data: subjData } = useTimecourseSubject(
    showSubjects && isContinuous ? studyId : undefined,
    showSubjects && isContinuous ? finding.domain : undefined,
    showSubjects && isContinuous ? finding.test_code : undefined,
    undefined,
    includeRecovery,
  );

  // CL clinical observations data (disabled for non-CL)
  const { data: clData, isLoading: clLoading, isError: clError } = useClinicalObservations(
    isCL ? studyId : undefined,
    isCL ? finding.finding : undefined,
  );

  const { data: mortality } = useStudyMortality(studyId);

  const deaths = useMemo(
    () => mortality?.deaths ?? [],
    [mortality],
  );

  // When subjects ON and mode is "g", auto-switch to "absolute"
  // (g is a group statistic, meaningless per subject)
  const effectiveYAxisMode = showSubjects && yAxisMode === "g" ? "absolute" : yAxisMode;

  if (!isVisible) return null;

  // Loading state
  if ((isContinuous && isLoading) || (isCL && clLoading)) {
    return (
      <CollapsiblePane title="Time course" defaultOpen expandAll={expandAll} collapseAll={collapseAll}>
        <Skeleton className="h-40 w-full" />
      </CollapsiblePane>
    );
  }

  // CL bar chart branch
  if (isCL) {
    if (clError || !clData || clData.timecourse.length < 2) return null;
    return (
      <CollapsiblePane title="Time course" defaultOpen expandAll={expandAll} collapseAll={collapseAll}>
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Observation count over time</span>
            <span title="Count of subjects with this clinical observation at each study day.">
              <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
            </span>
          </div>
          <TimeCourseBarChart
            clData={clData}
            finding={finding.finding}
            hoveredDay={hoveredDay}
            onHoverDay={setHoveredDay}
            doseGroupsMeta={doseGroups}
          />
        </div>
      </CollapsiblePane>
    );
  }

  // Continuous line chart branch
  if (isError || !data || data.totalTimepoints < 3) return null;
  if (data.doseGroups.length === 0) return null;

  return (
    <TimeCourseContent
      data={data}
      finding={finding}
      doseGroups={doseGroups}
      hoveredDay={hoveredDay}
      onHoverDay={setHoveredDay}
      expandAll={expandAll}
      collapseAll={collapseAll}
      deaths={deaths}
      yAxisMode={effectiveYAxisMode}
      onYAxisModeChange={setYAxisMode}
      showSubjects={showSubjects}
      onToggleSubjects={setShowSubjects}
      selectedDoseGroups={selectedDoseGroups}
      onToggleDoseGroup={(dl) => setSelectedDoseGroups((prev) =>
        prev.includes(dl) ? prev.filter((d) => d !== dl) : [...prev, dl],
      )}
      subjData={subjData ?? undefined}
    />
  );
}

// ── Inner content (after data is ready) ───────────────────

function TimeCourseContent({
  data,
  finding,
  doseGroups,
  hoveredDay,
  onHoverDay,
  expandAll,
  collapseAll,
  deaths,
  yAxisMode,
  onYAxisModeChange,
  showSubjects,
  onToggleSubjects,
  selectedDoseGroups,
  onToggleDoseGroup,
  subjData,
}: {
  data: TimeCourseSeriesData;
  finding: UnifiedFinding;
  doseGroups?: DoseGroup[];
  hoveredDay: number | null;
  onHoverDay: (day: number | null) => void;
  expandAll?: number;
  collapseAll?: number;
  deaths: DeathRecord[];
  yAxisMode: YAxisMode;
  onYAxisModeChange: (mode: YAxisMode) => void;
  showSubjects: boolean;
  onToggleSubjects: (v: boolean) => void;
  selectedDoseGroups: number[];
  onToggleDoseGroup: (dl: number) => void;
  subjData?: TimecourseSubjectResponse;
}) {
  const { setSelectedSubject } = useViewSelection();
  const [hoveredSubject, setHoveredSubject] = useState<string | null>(null);

  // Transform series based on Y-axis mode
  const transformed = useMemo(
    () => transformSeries(data.raw, data.controlByDay, data.series, yAxisMode),
    [data.raw, data.controlByDay, data.series, yAxisMode],
  );

  const { yDomain, yTicks } = useMemo(
    () => computeYDomain(transformed, data.sexes, yAxisMode),
    [transformed, data.sexes, yAxisMode],
  );

  const allDays = useMemo(() => {
    const days = collectAllDays(transformed, data.sexes);
    const daySet = new Set(days);
    for (const d of deaths) {
      if (d.study_day != null && !daySet.has(d.study_day)) {
        daySet.add(d.study_day);
        days.push(d.study_day);
      }
    }
    return days.sort((a, b) => a - b);
  }, [transformed, data.sexes, deaths]);

  const xDomain: [number, number] = useMemo(
    () => allDays.length > 0 ? [allDays[0], allDays[allDays.length - 1]] : [0, 1],
    [allDays],
  );

  // Y-axis label width: add left margin for left panel only
  const plotAreaLeft = { ...PLOT_AREA, left: 22, width: PLOT_AREA.width - 14 };
  const plotAreaRight = { ...PLOT_AREA };

  const scalesLeft = useChartScales(xDomain, yDomain, plotAreaLeft);
  const scalesRight = useChartScales(xDomain, yDomain, plotAreaRight);

  const isSingleSex = data.sexes.length === 1;

  // Timepoint mode state
  const [timepointMode, setTimepointMode] = useState<TimepointMode>("terminal");

  // Peak day: day with the maximum absolute effect size for highest dose group
  const peakDay = useMemo(() => {
    if (data.doseGroups.length === 0) return null;
    const highestDl = data.doseGroups[data.doseGroups.length - 1].doseLevel;
    let bestDay: number | null = null;
    let bestAbs = -1;
    for (const sex of data.sexes) {
      const pts = transformed[sex]?.[highestDl];
      if (!pts) continue;
      for (const pt of pts) {
        const absY = Math.abs(pt.y);
        if (absY > bestAbs) { bestAbs = absY; bestDay = pt.day; }
      }
    }
    return bestDay;
  }, [transformed, data.sexes, data.doseGroups]);

  // Recovery day: last day after terminal day
  const recoveryDay = useMemo(() => {
    if (data.terminalDay == null || allDays.length === 0) return null;
    const afterTerminal = allDays.filter((d) => d > data.terminalDay!);
    return afterTerminal.length > 0 ? afterTerminal[afterTerminal.length - 1] : null;
  }, [allDays, data.terminalDay]);

  // Resolve the default day based on timepoint mode
  const defaultDay = useMemo(() => {
    if (timepointMode === "peak" && peakDay != null) return peakDay;
    if (timepointMode === "recovery" && recoveryDay != null) return recoveryDay;
    return data.terminalDay;
  }, [timepointMode, peakDay, recoveryDay, data.terminalDay]);

  const displayDay = hoveredDay ?? defaultDay;
  const isHovering = hoveredDay !== null;

  const tickFmt = useMemo(() => yTickFormatter(yAxisMode), [yAxisMode]);

  // Subject traces per sex
  const subjectTracesBySex = useMemo(() => {
    if (!showSubjects || !subjData) return null;
    const result: Record<string, SubjectTrace[]> = {};
    for (const sex of data.sexes) {
      result[sex] = transformSubjectTraces(
        subjData, sex, selectedDoseGroups, yAxisMode, data.controlByDay, data.terminalDay,
      );
    }
    return result;
  }, [showSubjects, subjData, data.sexes, selectedDoseGroups, yAxisMode, data.controlByDay, data.terminalDay]);

  // Total subject count for summary
  const totalSubjectCount = useMemo(() => {
    if (!subjectTracesBySex) return 0;
    return Object.values(subjectTracesBySex).reduce((sum, traces) => sum + traces.length, 0);
  }, [subjectTracesBySex]);

  // Y-axis mode options with g disabled when subjects are shown
  const yAxisOptions = useMemo(() =>
    Y_AXIS_OPTIONS.map((opt) => ({
      ...opt,
      disabled: showSubjects && opt.value === "g",
    })),
    [showSubjects],
  );

  return (
    <CollapsiblePane
      title="Time course"
      defaultOpen
      expandAll={expandAll}
      collapseAll={collapseAll}
    >
      <div className="space-y-1.5">
        {/* Subtitle with Y-axis mode toggle + subjects toggle + info icon */}
        <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5">
            <PanePillToggle
              options={yAxisOptions}
              value={yAxisMode}
              onChange={onYAxisModeChange}
            />
            <button
              type="button"
              className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                showSubjects
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground bg-muted/30"
              }`}
              onClick={() => onToggleSubjects(!showSubjects)}
            >
              Subjects
            </button>
          </div>
          <span title={Y_AXIS_INFO[yAxisMode]}>
            <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
          </span>
        </div>

        {/* Timepoint toggle: Terminal / Peak / Recovery */}
        {(peakDay != null || recoveryDay != null) && (
          <div className="flex items-center gap-1">
            <PanePillToggle
              value={timepointMode}
              options={[
                { value: "terminal" as const, label: "Terminal" },
                ...(peakDay != null && peakDay !== data.terminalDay
                  ? [{ value: "peak" as const, label: "Peak" }] : []),
                ...(recoveryDay != null
                  ? [{ value: "recovery" as const, label: "Recovery" }] : []),
              ]}
              onChange={setTimepointMode}
            />
          </div>
        )}

        {/* Dose group filter chips when subjects ON */}
        {showSubjects && (
          <div className="flex flex-wrap gap-1">
            {data.doseGroups.map(({ doseLevel, doseLabel }) => {
              const isSelected = selectedDoseGroups.length === 0 || selectedDoseGroups.includes(doseLevel);
              return (
                <button
                  key={doseLevel}
                  type="button"
                  className={`flex items-center gap-0.5 px-1 py-0.5 text-[8px] rounded transition-opacity ${
                    isSelected ? "opacity-100" : "opacity-30"
                  }`}
                  onClick={() => onToggleDoseGroup(doseLevel)}
                >
                  <span
                    className="inline-block rounded-full"
                    style={{
                      width: 5,
                      height: 5,
                      backgroundColor: getDoseGroupColor(doseLevel),
                    }}
                  />
                  <span className="text-muted-foreground">
                    {shortDoseLabel(doseLabel, doseGroups)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Charts — F left (with Y axis), M right (without) */}
        <div className={`flex ${isSingleSex ? "" : "gap-1"}`}>
          {data.sexes.map((sex, i) => {
            const isFirst = i === 0;
            const showY = isFirst;
            const pArea = showY ? plotAreaLeft : plotAreaRight;
            const scales = showY ? scalesLeft : scalesRight;
            const sexSeries = transformed[sex] ?? {};
            const sexDeaths = deaths.filter((d) => d.sex === sex && d.study_day != null);
            const sexTraces = subjectTracesBySex?.[sex];

            return (
              <div key={sex} className={isSingleSex ? "w-full" : "flex-1 min-w-0"}>
                <div className="text-center text-[9px] font-medium text-muted-foreground mb-0.5">
                  {sex}
                </div>
                <TimeCourseLineChart
                  series={sexSeries}
                  doseGroups={data.doseGroups}
                  xScale={scales.xScale}
                  yScale={scales.yScale}
                  xDomain={xDomain}
                  yTicks={yTicks}
                  terminalDay={data.terminalDay}
                  showYAxis={showY}
                  hoveredDay={hoveredDay}
                  onHoverDay={onHoverDay}
                  plotArea={pArea}
                  allDays={allDays}
                  deaths={sexDeaths}
                  yTickFormatter={tickFmt}
                  subjectTraces={sexTraces}
                  onSubjectClick={showSubjects ? setSelectedSubject : undefined}
                  hoveredSubject={hoveredSubject}
                  onHoverSubject={showSubjects ? setHoveredSubject : undefined}
                />
              </div>
            );
          })}
        </div>

        {/* Detail row or subject summary */}
        {showSubjects ? (
          <div className="text-[9px] text-muted-foreground">
            Showing {totalSubjectCount} subject{totalSubjectCount !== 1 ? "s" : ""}
            {selectedDoseGroups.length > 0 ? ` (${selectedDoseGroups.length} dose group${selectedDoseGroups.length !== 1 ? "s" : ""})` : ""}
          </div>
        ) : (
          <DetailRow
            data={data}
            transformed={transformed}
            displayDay={displayDay}
            isHovering={isHovering}
            direction={finding.direction}
            doseGroupsMeta={doseGroups}
            deaths={deaths}
            yAxisMode={yAxisMode}
          />
        )}
      </div>
    </CollapsiblePane>
  );
}

// ── Detail row ────────────────────────────────────────────

function DetailRow({
  data,
  transformed,
  displayDay,
  isHovering,
  direction,
  doseGroupsMeta,
  deaths,
  yAxisMode,
}: {
  data: TimeCourseSeriesData;
  transformed: Record<string, Record<number, ChartPoint[]>>;
  displayDay: number | null;
  isHovering: boolean;
  direction: "up" | "down" | "none" | null | undefined;
  doseGroupsMeta?: DoseGroup[];
  deaths: DeathRecord[];
  yAxisMode: YAxisMode;
}) {
  if (displayDay == null) return null;

  const isTerminal = displayDay === data.terminalDay;
  const dayLabel = `D${displayDay}${isTerminal ? "(T)" : ""}`;

  return (
    <div
      className="flex gap-2 text-[9px] leading-[14px] transition-colors duration-150"
      style={{ minHeight: `${(data.doseGroups.length + 1) * 14 + 4}px` }}
    >
      {/* Day label */}
      <div
        className="shrink-0 font-medium tabular-nums pt-0.5"
        style={{
          width: 40,
          color: isHovering ? "#334155" : "#94a3b8",
        }}
      >
        {dayLabel}
      </div>

      {/* Per-sex value columns */}
      {data.sexes.map((sex) => {
        const sexSeries = transformed[sex];
        const sexDeaths = deaths.filter((d) => d.sex === sex && d.study_day != null);

        // Get nControl from first treated group's point at displayDay
        const firstTreatedPts = data.doseGroups.length > 0
          ? sexSeries?.[data.doseGroups[0].doseLevel]
          : undefined;
        const firstPt = firstTreatedPts?.find((p) => p.day === displayDay);
        const nControl = firstPt?.nControl;

        return (
          <div key={sex} className="flex-1 min-w-0 space-y-0">
            {data.doseGroups.map(({ doseLevel, doseLabel }) => {
              const pts = sexSeries?.[doseLevel];
              const pt = pts?.find((p) => p.day === displayDay);

              const deathCount = sexDeaths.filter(
                (d) => d.dose_level === doseLevel && d.study_day === displayDay,
              ).length;

              return (
                <div key={doseLevel} className="flex items-center gap-1">
                  <span
                    className="inline-block shrink-0 rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: getDoseGroupColor(doseLevel),
                    }}
                  />
                  <span
                    className="shrink-0 text-muted-foreground truncate"
                    style={{ width: 52 }}
                  >
                    {shortDoseLabel(doseLabel, doseGroupsMeta)}
                  </span>

                  {pt ? (
                    <>
                      <span
                        className="font-semibold tabular-nums"
                        style={{
                          color: getValueColor(pt.y, direction, isHovering, yAxisMode),
                          transition: "color 0.15s ease",
                        }}
                      >
                        {formatDetailValue(pt.y, yAxisMode, data.unit)}
                      </span>
                      <span className="text-muted-foreground/40">
                        n={pt.n}
                      </span>
                      {deathCount > 0 && (
                        <span
                          className="text-red-600"
                          title={`${deathCount} death(s) at this timepoint`}
                        >
                          {deathCount === 1 ? "death" : `${deathCount} deaths`}
                        </span>
                      )}
                    </>
                  ) : deathCount > 0 ? (
                    <span className="text-red-600">
                      {deathCount === 1 ? "death" : `${deathCount} deaths`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">&mdash;</span>
                  )}
                </div>
              );
            })}

            {/* Control n */}
            <div className="text-muted-foreground/60 pl-[7px]">
              Control n={nControl ?? "\u2014"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
