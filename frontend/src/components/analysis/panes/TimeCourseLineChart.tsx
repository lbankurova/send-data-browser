/**
 * Custom SVG line chart for one sex panel in the Time Course pane.
 * Renders gridlines, zero line, terminal marker, dose-group polylines,
 * and synced hover crosshair + dots. Y-axis = effect size (Hedges' g)
 * vs concurrent control.
 */
import { useCallback } from "react";
import type { TimeCoursePoint } from "@/hooks/useTimeCourseData";
import type { DeathRecord } from "@/types/mortality";
import { getDoseGroupColor } from "@/lib/severity-colors";

// ── Types ─────────────────────────────────────────────────

interface DoseGroupInfo {
  doseLevel: number;
  doseLabel: string;
}

interface PlotArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TimeCourseLineChartProps {
  series: Record<number, TimeCoursePoint[]>; // doseLevel → points
  doseGroups: DoseGroupInfo[];
  xScale: (v: number) => number;
  yScale: (v: number) => number;
  xDomain: [number, number];
  yTicks: number[];
  terminalDay: number | null;
  showYAxis: boolean;
  hoveredDay: number | null;
  onHoverDay: (day: number | null) => void;
  plotArea: PlotArea;
  allDays: number[]; // sorted unique days across all doses
  deaths: DeathRecord[];
}

// ── Constants ─────────────────────────────────────────────

const CHART_W = 200;
const CHART_H = 150;
const TERMINAL_COLOR = "#94a3b8";

// ── Helpers ───────────────────────────────────────────────

/** Select ~5-6 tick labels from a sorted day array. */
function pickXTicks(days: number[]): number[] {
  if (days.length <= 6) return days;
  const result: number[] = [days[0]];
  const step = (days.length - 1) / 5;
  for (let i = 1; i < 5; i++) {
    result.push(days[Math.round(i * step)]);
  }
  result.push(days[days.length - 1]);
  // deduplicate
  return [...new Set(result)];
}

// ── Component ─────────────────────────────────────────────

export function TimeCourseLineChart({
  series,
  doseGroups,
  xScale,
  yScale,
  yTicks,
  terminalDay,
  showYAxis,
  hoveredDay,
  onHoverDay,
  plotArea,
  allDays,
  deaths,
}: TimeCourseLineChartProps) {

  // Voronoi snap: convert mouse X → nearest day via midpoint boundaries
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (allDays.length === 0) return;
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      const mouseX = svgPt.x;

      // Find day via midpoint Voronoi
      let best = allDays[0];
      for (let i = 0; i < allDays.length - 1; i++) {
        const mid = (xScale(allDays[i]) + xScale(allDays[i + 1])) / 2;
        if (mouseX > mid) best = allDays[i + 1];
        else break;
      }
      onHoverDay(best);
    },
    [allDays, xScale, onHoverDay],
  );

  const handleMouseLeave = useCallback(() => onHoverDay(null), [onHoverDay]);

  const xTicks = pickXTicks(allDays);
  const isHovering = hoveredDay !== null;
  const displayDay = hoveredDay ?? terminalDay;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="block w-full h-auto"
      preserveAspectRatio="xMinYMin meet"
      style={{ overflow: "visible" }}
    >

      {/* Baseline (0%) line */}
      <line
        x1={plotArea.left}
        x2={plotArea.left + plotArea.width}
        y1={yScale(0)}
        y2={yScale(0)}
        stroke="#cbd5e1"
        strokeWidth={0.5}
      />

      {/* Terminal vertical line */}
      {terminalDay != null && (
        <line
          x1={xScale(terminalDay)}
          x2={xScale(terminalDay)}
          y1={plotArea.top}
          y2={plotArea.top + plotArea.height}
          stroke={TERMINAL_COLOR}
          strokeWidth={0.75}
          strokeDasharray="3,2"
        />
      )}

      {/* Data lines — one polyline per dose group */}
      {doseGroups.map(({ doseLevel }) => {
        const pts = series[doseLevel];
        if (!pts || pts.length < 2) return null;
        const points = pts
          .map((p) => `${xScale(p.day)},${yScale(p.g)}`)
          .join(" ");
        return (
          <polyline
            key={doseLevel}
            points={points}
            fill="none"
            stroke={getDoseGroupColor(doseLevel)}
            strokeWidth={0.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
        );
      })}

      {/* Death markers — concentric circles on the line at death day */}
      {deaths.map((d) => {
        const pts = series[d.dose_level];
        if (!pts || d.study_day == null) return null;
        // Find the closest timepoint at or before the death day
        let closest: TimeCoursePoint | null = null;
        for (const pt of pts) {
          if (pt.day <= d.study_day) closest = pt;
          else break;
        }
        if (!closest) return null;
        const cx = xScale(closest.day);
        const cy = yScale(closest.g);
        const color = getDoseGroupColor(d.dose_level);
        return (
          <g key={d.USUBJID}>
            <title>{`${d.disposition} — ${d.USUBJID} D${d.study_day}`}</title>
            <circle cx={cx} cy={cy} r={3.5} fill="white" stroke={color} strokeWidth={0.75} />
            <circle cx={cx} cy={cy} r={1.5} fill={color} />
          </g>
        );
      })}

      {/* Hover crosshair */}
      {displayDay != null && (
        <line
          x1={xScale(displayDay)}
          x2={xScale(displayDay)}
          y1={plotArea.top}
          y2={plotArea.top + plotArea.height}
          stroke="#64748b"
          strokeWidth={0.5}
          opacity={isHovering ? 0.6 : 0.3}
        />
      )}

      {/* Hover dots at intersection with each dose line */}
      {displayDay != null &&
        doseGroups.map(({ doseLevel }) => {
          const pts = series[doseLevel];
          if (!pts) return null;
          const pt = pts.find((p) => p.day === displayDay);
          if (!pt) return null;
          return (
            <circle
              key={doseLevel}
              cx={xScale(pt.day)}
              cy={yScale(pt.g)}
              r={2.5}
              fill={getDoseGroupColor(doseLevel)}
              stroke="white"
              strokeWidth={1}
              opacity={isHovering ? 1 : 0.6}
            />
          );
        })}

      {/* Y-axis labels (left panel only) */}
      {showYAxis && (
        <>
          {/* "C" label at zero line */}
          <text
            x={plotArea.left - 2}
            y={yScale(0)}
            textAnchor="end"
            dominantBaseline="central"
            fill="#94a3b8"
            fontSize={6}
            fontWeight={600}
          >
            C
          </text>
          {yTicks
            .filter((tick) => tick !== 0)
            .map((tick) => (
              <text
                key={tick}
                x={plotArea.left - 2}
                y={yScale(tick)}
                textAnchor="end"
                dominantBaseline="central"
                fill="#94a3b8"
                fontSize={6}
              >
                {tick > 0 ? "+" : ""}
                {tick}
              </text>
            ))}
        </>
      )}

      {/* X-axis labels */}
      {xTicks.map((day) => {
        const isTerminal = day === terminalDay;
        return (
          <text
            key={day}
            x={xScale(day)}
            y={plotArea.top + plotArea.height + 8}
            textAnchor="middle"
            fill={isTerminal ? "#475569" : "#94a3b8"}
            fontSize={6}
            fontWeight={isTerminal ? 600 : 400}
          >
            D{day}
            {isTerminal ? "(T)" : ""}
          </text>
        );
      })}

      {/* Invisible hit area for hover — must be last for z-order */}
      <rect
        x={plotArea.left}
        y={plotArea.top}
        width={plotArea.width}
        height={plotArea.height}
        fill="transparent"
        style={{ cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </svg>
  );
}
