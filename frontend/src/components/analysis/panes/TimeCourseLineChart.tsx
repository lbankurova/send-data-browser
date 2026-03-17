/**
 * Custom SVG line chart for one sex panel in the Time Course pane.
 * Renders gridlines, zero line, terminal marker, dose-group polylines,
 * and synced hover crosshair + dots. Y-axis value is determined by
 * the parent's Y-axis mode (g, absolute, %change, %vs control).
 */
import { useCallback } from "react";
import type { DeathRecord } from "@/types/mortality";
import { getDoseGroupColor } from "@/lib/severity-colors";

// ── Types ─────────────────────────────────────────────────

export interface ChartPoint {
  day: number;
  y: number;
  n: number;
  nControl: number;
}

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

export interface SubjectTrace {
  usubjid: string;
  doseLevel: number;
  points: { day: number; y: number }[];
  /** Day where treatment ends and recovery begins (for dashed segment). */
  terminalDay?: number | null;
}

export interface TimeCourseLineChartProps {
  series: Record<number, ChartPoint[]>; // doseLevel → points
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
  yTickFormatter?: (v: number) => string;
  subjectTraces?: SubjectTrace[];
  /** Callback when a subject trace is clicked. */
  onSubjectClick?: (usubjid: string) => void;
  /** Currently hovered subject USUBJID — highlighted, others muted. */
  hoveredSubject?: string | null;
  /** Callback when mouse enters/leaves a subject trace. */
  onHoverSubject?: (usubjid: string | null) => void;
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
  return [...new Set(result)];
}

/** Default Y-axis formatter (g mode: "C" at zero, "+/-N" elsewhere). */
function defaultYTickFormatter(v: number): string {
  if (v === 0) return "C";
  return `${v > 0 ? "+" : ""}${v}`;
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
  yTickFormatter: formatTick = defaultYTickFormatter,
  subjectTraces,
  onSubjectClick,
  hoveredSubject,
  onHoverSubject,
}: TimeCourseLineChartProps) {
  const hasSubjects = subjectTraces && subjectTraces.length > 0;

  // Voronoi snap: convert mouse X → nearest day via midpoint boundaries
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      if (allDays.length === 0) return;
      const el = e.currentTarget;
      const svg = el instanceof SVGSVGElement ? el : el.ownerSVGElement;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      const mouseX = svgPt.x;

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
      style={{ overflow: "visible", cursor: hasSubjects ? "pointer" : undefined }}
      onMouseMove={hasSubjects ? handleMouseMove : undefined}
      onMouseLeave={hasSubjects ? handleMouseLeave : undefined}
    >

      {/* Baseline (0) line */}
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

      {/* Subject traces — thin per-animal polylines when subjects mode is ON */}
      {hasSubjects && subjectTraces.map((trace) => {
        if (trace.points.length < 2) return null;
        const color = getDoseGroupColor(trace.doseLevel);
        const tDay = trace.terminalDay;
        const clickable = !!onSubjectClick;
        const isHovered = hoveredSubject === trace.usubjid;
        const anyHovered = hoveredSubject != null;
        const traceOpacity = isHovered ? 0.9 : anyHovered ? 0.08 : 0.35;
        const traceWidth = isHovered ? 1.5 : 0.5;

        // Split into treatment and recovery segments
        const treatmentPts = tDay != null
          ? trace.points.filter((p) => p.day <= tDay)
          : trace.points;
        const recoveryPts = tDay != null
          ? trace.points.filter((p) => p.day >= tDay)
          : [];

        return (
          <g
            key={trace.usubjid}
            style={{ cursor: clickable ? "pointer" : undefined }}
            onClick={clickable ? (e) => { e.stopPropagation(); onSubjectClick(trace.usubjid); } : undefined}
            onMouseEnter={() => onHoverSubject?.(trace.usubjid)}
            onMouseLeave={() => onHoverSubject?.(null)}
          >
            <title>{`${trace.usubjid} (${trace.doseLevel === 0 ? "Control" : `Dose ${trace.doseLevel}`})`}</title>
            {treatmentPts.length >= 2 && (
              <polyline
                points={treatmentPts.map((p) => `${xScale(p.day)},${yScale(p.y)}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={traceWidth}
                strokeLinejoin="round"
                opacity={traceOpacity}
              />
            )}
            {recoveryPts.length >= 2 && (
              <polyline
                points={recoveryPts.map((p) => `${xScale(p.day)},${yScale(p.y)}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={traceWidth}
                strokeLinejoin="round"
                strokeDasharray="2,1.5"
                opacity={traceOpacity}
              />
            )}
            {/* Wider invisible hit area for easier clicking/hovering */}
            <polyline
              points={(treatmentPts.length >= 2 ? treatmentPts : trace.points).map((p) => `${xScale(p.day)},${yScale(p.y)}`).join(" ")}
              fill="none"
              stroke="transparent"
              strokeWidth={6}
            />
          </g>
        );
      })}

      {/* Data lines — one polyline per dose group (hidden when subjects mode is ON) */}
      {!hasSubjects && doseGroups.map(({ doseLevel }) => {
        const pts = series[doseLevel];
        if (!pts || pts.length < 2) return null;
        const points = pts
          .map((p) => `${xScale(p.day)},${yScale(p.y)}`)
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

      {/* Death markers — concentric circles at death day */}
      {deaths.map((d) => {
        if (d.study_day == null) return null;
        const cx = xScale(d.study_day);
        const color = getDoseGroupColor(d.dose_level);
        let cy: number | null = null;

        // When subjects are shown, place marker on the actual subject's trace
        if (hasSubjects && subjectTraces) {
          const trace = subjectTraces.find((t) => t.usubjid === d.USUBJID);
          if (trace) {
            const exact = trace.points.find((p) => p.day === d.study_day);
            if (exact) {
              cy = yScale(exact.y);
            } else {
              // Interpolate on subject trace
              let before: { day: number; y: number } | null = null;
              for (const p of trace.points) {
                if (p.day <= d.study_day) before = p;
                else break;
              }
              if (before) cy = yScale(before.y);
            }
          }
        }

        // Fallback to group mean interpolation (when subjects OFF or subject not found)
        if (cy == null) {
          const pts = series[d.dose_level];
          if (!pts || pts.length === 0) return null;
          let before: ChartPoint | null = null;
          let after: ChartPoint | null = null;
          for (const pt of pts) {
            if (pt.day <= d.study_day) before = pt;
            else { after = pt; break; }
          }
          if (!before && !after) return null;
          if (!before) {
            cy = yScale(after!.y);
          } else if (!after || before.day === d.study_day) {
            cy = yScale(before.y);
          } else {
            const t = (d.study_day - before.day) / (after.day - before.day);
            cy = yScale(before.y + t * (after.y - before.y));
          }
        }

        if (cy == null) return null;
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
              cy={yScale(pt.y)}
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
          {yTicks.map((tick) => (
            <text
              key={tick}
              x={plotArea.left - 2}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="central"
              fill="#94a3b8"
              fontSize={6}
              fontWeight={tick === 0 ? 600 : 400}
            >
              {formatTick(tick)}
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

      {/* Invisible hit area for hover — pointer-events: all but rendered behind subject traces */}
      {!hasSubjects && (
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
      )}
    </svg>
  );
}
