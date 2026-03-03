/**
 * Time Course collapsible pane — shows % change from baseline as
 * line charts (F left, M right) for continuous endpoints.
 * Positioned between Dose Detail and Recovery in FindingsContextPanel.
 */
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTimeCourseData } from "@/hooks/useTimeCourseData";
import type { TimeCourseSeriesData } from "@/hooks/useTimeCourseData";
import { useChartScales } from "@/hooks/useChartScales";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { TimeCourseLineChart } from "./TimeCourseLineChart";
import { CollapsiblePane } from "./CollapsiblePane";
import { Skeleton } from "@/components/ui/skeleton";
import { getDoseGroupColor } from "@/lib/severity-colors";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { DeathRecord } from "@/types/mortality";
import { Info } from "lucide-react";

// ── Visibility allowlist ──────────────────────────────────

const ALLOWED_DOMAINS = new Set(["BW", "LB", "FW", "BG", "EG", "VS"]);

// ── Plot layout constants ─────────────────────────────────

const PLOT_AREA = { left: 8, top: 4, width: 182, height: 122 } as const;

// ── Y-axis tick computation ───────────────────────────────

function computeYDomain(data: TimeCourseSeriesData): {
  yDomain: [number, number];
  yTicks: number[];
} {
  let min = 0;
  let max = 0;
  for (const sex of data.sexes) {
    const sexSeries = data.series[sex];
    if (!sexSeries) continue;
    for (const pts of Object.values(sexSeries)) {
      for (const pt of pts) {
        const lo = pt.pctChangeFromBaseline - pt.se;
        const hi = pt.pctChangeFromBaseline + pt.se;
        if (lo < min) min = lo;
        if (hi > max) max = hi;
      }
    }
  }

  // Round to nearest 5% with 2% padding
  min = Math.floor((min - 2) / 5) * 5;
  max = Math.ceil((max + 2) / 5) * 5;
  if (min === max) { min = -5; max = 5; }

  const range = max - min;
  const step = range <= 15 ? 5 : range <= 30 ? 10 : 15;

  // Generate ticks anchored at 0, stepping outward
  const ticks: number[] = [0];
  for (let v = step; v <= max; v += step) ticks.push(v);
  for (let v = -step; v >= min; v -= step) ticks.unshift(v);

  return { yDomain: [min, max], yTicks: ticks };
}

// ── Collect all unique days ───────────────────────────────

function collectAllDays(data: TimeCourseSeriesData): number[] {
  const daySet = new Set<number>();
  for (const sex of data.sexes) {
    const sexSeries = data.series[sex];
    if (!sexSeries) continue;
    for (const pts of Object.values(sexSeries)) {
      for (const pt of pts) daySet.add(pt.day);
    }
  }
  return [...daySet].sort((a, b) => a - b);
}

// ── Dose short label from DoseGroup metadata ──────────────

function shortDoseLabel(doseLabel: string, doseGroups?: DoseGroup[]): string {
  if (!doseGroups) return doseLabel;
  // Try to match by label text — extract dose_value + dose_unit
  const dg = doseGroups.find((d) => doseLabel.includes(d.label) || d.label.includes(doseLabel));
  if (dg && dg.dose_value != null && dg.dose_value > 0) {
    return `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim();
  }
  // Control group
  if (doseLabel.toLowerCase().includes("control") || doseLabel.includes("Vehicle")) {
    return "Ctrl";
  }
  // Truncate long labels
  return doseLabel.length > 12 ? doseLabel.slice(0, 10) + "…" : doseLabel;
}

// ── Detail row value color ────────────────────────────────

function getValueColor(
  pctChange: number,
  direction: "up" | "down" | "none" | null | undefined,
  isActive: boolean,
): string {
  if (!isActive) return "#94a3b8"; // muted default
  const abs = Math.abs(pctChange);
  const isAdverse =
    direction === "down"
      ? pctChange < 0
      : direction === "up"
        ? pctChange > 0
        : false;

  if (isAdverse && abs > 5) return "#dc2626"; // red
  if (isAdverse && abs > 2) return "#d97706"; // amber
  return "#334155"; // dark
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

  const isVisible =
    finding.data_type === "continuous" && ALLOWED_DOMAINS.has(finding.domain);

  // Always call hooks unconditionally (Rules of Hooks) — pass undefined to disable fetch
  const { data, isLoading, isError } = useTimeCourseData(
    isVisible ? finding.domain : undefined,
    isVisible ? finding.test_code : undefined,
    true, // includeRecovery
  );
  const { data: mortality } = useStudyMortality(studyId);

  // Visibility gate: continuous data in allowed domains only
  if (!isVisible) return null;

  // Bail early on loading / error / insufficient data
  if (isLoading) {
    return (
      <CollapsiblePane title="Time course" defaultOpen expandAll={expandAll} collapseAll={collapseAll}>
        <Skeleton className="h-40 w-full" />
      </CollapsiblePane>
    );
  }
  if (isError || !data || data.totalTimepoints < 3) return null;

  // Combine deaths + accidentals, both are real n-drops
  const deaths = useMemo(
    () => [...(mortality?.deaths ?? []), ...(mortality?.accidentals ?? [])],
    [mortality],
  );

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
}: {
  data: TimeCourseSeriesData;
  finding: UnifiedFinding;
  doseGroups?: DoseGroup[];
  hoveredDay: number | null;
  onHoverDay: (day: number | null) => void;
  expandAll?: number;
  collapseAll?: number;
  deaths: DeathRecord[];
}) {
  const { yDomain, yTicks } = useMemo(() => computeYDomain(data), [data]);
  const allDays = useMemo(() => collectAllDays(data), [data]);

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
  const displayDay = hoveredDay ?? data.terminalDay;
  const isHovering = hoveredDay !== null;

  return (
    <CollapsiblePane
      title="Time course"
      defaultOpen
      expandAll={expandAll}
      collapseAll={collapseAll}
    >
      <div className="space-y-1.5">
        {/* Subtitle + info icon (matches Recovery pane pattern) */}
        <div className="text-[10px] text-muted-foreground flex items-center justify-between">
          <span>% change from baseline · Group mean ± SE</span>
          <span title="Group mean % change from first measurement. Error bars = SE of the mean.">
            <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
          </span>
        </div>

        {/* Charts — F left (with Y axis), M right (without) */}
        <div className={`flex ${isSingleSex ? "" : "gap-1"}`}>
          {data.sexes.map((sex, i) => {
            const isFirst = i === 0;
            const showY = isFirst;
            const pArea = showY ? plotAreaLeft : plotAreaRight;
            const scales = showY ? scalesLeft : scalesRight;
            const sexSeries = data.series[sex] ?? {};
            const sexDeaths = deaths.filter((d) => d.sex === sex && d.study_day != null);

            return (
              <div key={sex} className={isSingleSex ? "w-full" : "flex-1 min-w-0"}>
                {/* Sex header — matches RecoveryDumbbellChart */}
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
                />
              </div>
            );
          })}
        </div>

        {/* Detail row — always visible, fixed height */}
        <DetailRow
          data={data}
          displayDay={displayDay}
          isHovering={isHovering}
          direction={finding.direction}
          doseGroupsMeta={doseGroups}
        />
      </div>
    </CollapsiblePane>
  );
}

// ── Detail row ────────────────────────────────────────────

function DetailRow({
  data,
  displayDay,
  isHovering,
  direction,
  doseGroupsMeta,
}: {
  data: TimeCourseSeriesData;
  displayDay: number | null;
  isHovering: boolean;
  direction: "up" | "down" | "none" | null | undefined;
  doseGroupsMeta?: DoseGroup[];
}) {
  if (displayDay == null) return null;

  const isTerminal = displayDay === data.terminalDay;
  const dayLabel = `D${displayDay}${isTerminal ? "(T)" : ""}`;

  return (
    <div
      className="flex gap-2 text-[9px] leading-[14px] transition-colors duration-150"
      style={{ minHeight: `${data.doseGroups.length * 14 + 4}px` }}
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
        const sexSeries = data.series[sex];
        return (
          <div key={sex} className="flex-1 min-w-0 space-y-0">
            {data.doseGroups.map(({ doseLevel, doseLabel }) => {
              const pts = sexSeries?.[doseLevel];
              const pt = pts?.find((p) => p.day === displayDay);

              return (
                <div key={doseLevel} className="flex items-center gap-1">
                  {/* Color dot */}
                  <span
                    className="inline-block shrink-0 rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: getDoseGroupColor(doseLevel),
                    }}
                  />
                  {/* Dose label */}
                  <span
                    className="shrink-0 text-muted-foreground truncate"
                    style={{ width: 52 }}
                  >
                    {shortDoseLabel(doseLabel, doseGroupsMeta)}
                  </span>

                  {pt ? (
                    <>
                      {/* % value */}
                      <span
                        className="font-semibold tabular-nums"
                        style={{
                          color: getValueColor(pt.pctChangeFromBaseline, direction, isHovering),
                          transition: "color 0.15s ease",
                        }}
                      >
                        {pt.pctChangeFromBaseline > 0 ? "+" : ""}
                        {pt.pctChangeFromBaseline.toFixed(1)}%
                      </span>
                      {/* SE */}
                      <span className="text-muted-foreground/60">
                        ±{pt.se.toFixed(1)}
                      </span>
                      {/* n */}
                      <span className="text-muted-foreground/40">
                        n={pt.n}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
