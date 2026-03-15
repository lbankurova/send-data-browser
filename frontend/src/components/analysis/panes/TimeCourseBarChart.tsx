/**
 * Compact SVG bar chart for CL (Clinical Observations) domain time-course.
 * Shows grouped bars per dose level at each study day.
 */
import { useCallback, useMemo, useState } from "react";
import type { CLTimecourseResponse } from "@/types/timecourse";
import type { DoseGroup } from "@/types/analysis";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { shortDoseLabel } from "@/lib/dose-label-utils";

// ── Types ─────────────────────────────────────────────────

interface CLBarPoint {
  day: number;
  doseLevel: number;
  doseLabel: string;
  count: number;
  total: number;
  sex: string;
}

interface TimeCourseBarChartProps {
  clData: CLTimecourseResponse;
  finding: string;
  hoveredDay: number | null;
  onHoverDay: (day: number | null) => void;
  doseGroupsMeta?: DoseGroup[];
}

// ── Constants ─────────────────────────────────────────────

const CHART_W = 200;
const CHART_H = 150;
const PLOT = { left: 22, top: 4, width: 168, height: 122 } as const;

// ── Helpers ───────────────────────────────────────────────

function deriveCLBarData(
  clData: CLTimecourseResponse,
  finding: string,
): { points: CLBarPoint[]; days: number[]; doseLevels: number[]; maxCount: number } {
  const points: CLBarPoint[] = [];
  const daySet = new Set<number>();
  const dlSet = new Set<number>();
  let maxCount = 0;

  for (const tp of clData.timecourse) {
    daySet.add(tp.day);
    // Aggregate across sexes per dose level at each day
    const doseAgg = new Map<number, { label: string; count: number; total: number }>();
    for (const gc of tp.counts) {
      dlSet.add(gc.dose_level);
      const existing = doseAgg.get(gc.dose_level);
      const count = gc.findings[finding] ?? 0;
      if (existing) {
        existing.count += count;
        existing.total += gc.total_subjects;
      } else {
        doseAgg.set(gc.dose_level, { label: gc.dose_label, count, total: gc.total_subjects });
      }
    }
    for (const [dl, agg] of doseAgg) {
      if (agg.count > maxCount) maxCount = agg.count;
      points.push({
        day: tp.day,
        doseLevel: dl,
        doseLabel: agg.label,
        count: agg.count,
        total: agg.total,
        sex: "Both",
      });
    }
  }

  const days = [...daySet].sort((a, b) => a - b);
  const doseLevels = [...dlSet].sort((a, b) => a - b);
  return { points, days, doseLevels, maxCount };
}

/** Pick ~5-6 X-axis labels. */
function pickXTicks(days: number[]): number[] {
  if (days.length <= 6) return days;
  const result: number[] = [days[0]];
  const step = (days.length - 1) / 5;
  for (let i = 1; i < 5; i++) result.push(days[Math.round(i * step)]);
  result.push(days[days.length - 1]);
  return [...new Set(result)];
}

// ── Component ─────────────────────────────────────────────

export function TimeCourseBarChart({
  clData,
  finding,
  hoveredDay,
  onHoverDay,
  doseGroupsMeta,
}: TimeCourseBarChartProps) {
  const { points, days, doseLevels, maxCount } = useMemo(
    () => deriveCLBarData(clData, finding),
    [clData, finding],
  );

  const [localHover, setLocalHover] = useState<number | null>(null);

  // Scales
  const xScale = useCallback(
    (day: number) => {
      if (days.length <= 1) return PLOT.left + PLOT.width / 2;
      const idx = days.indexOf(day);
      return PLOT.left + (idx / (days.length - 1)) * PLOT.width;
    },
    [days],
  );

  const yMax = Math.max(maxCount + 1, 2);
  const yScale = useCallback(
    (v: number) => PLOT.top + PLOT.height - (v / yMax) * PLOT.height,
    [yMax],
  );

  // Y ticks
  const yTicks = useMemo(() => {
    const step = yMax <= 5 ? 1 : yMax <= 15 ? 2 : 5;
    const ticks: number[] = [0];
    for (let v = step; v <= yMax; v += step) ticks.push(v);
    return ticks;
  }, [yMax]);

  // Bar layout
  const barGroupWidth = days.length > 1
    ? (PLOT.width / (days.length - 1)) * 0.7
    : PLOT.width * 0.3;
  const barWidth = Math.max(1, barGroupWidth / doseLevels.length - 0.5);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (days.length === 0) return;
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      const mouseX = svgPt.x;

      let best = days[0];
      for (let i = 0; i < days.length - 1; i++) {
        const mid = (xScale(days[i]) + xScale(days[i + 1])) / 2;
        if (mouseX > mid) best = days[i + 1];
        else break;
      }
      setLocalHover(best);
      onHoverDay(best);
    },
    [days, xScale, onHoverDay],
  );

  const handleMouseLeave = useCallback(() => {
    setLocalHover(null);
    onHoverDay(null);
  }, [onHoverDay]);

  const displayDay = hoveredDay ?? localHover;
  const xTicks = pickXTicks(days);

  return (
    <div className="space-y-1.5">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="block w-full h-auto"
        preserveAspectRatio="xMinYMin meet"
        style={{ overflow: "visible" }}
      >
        {/* Baseline */}
        <line
          x1={PLOT.left}
          x2={PLOT.left + PLOT.width}
          y1={yScale(0)}
          y2={yScale(0)}
          stroke="#cbd5e1"
          strokeWidth={0.5}
        />

        {/* Bars */}
        {days.map((day) => {
          const dayPts = points.filter((p) => p.day === day);
          const groupX = xScale(day) - barGroupWidth / 2;

          return dayPts.map((pt) => {
            const idx = doseLevels.indexOf(pt.doseLevel);
            const x = groupX + idx * (barWidth + 0.5);
            const barH = (pt.count / yMax) * PLOT.height;
            return (
              <rect
                key={`${day}-${pt.doseLevel}`}
                x={x}
                y={yScale(pt.count)}
                width={barWidth}
                height={Math.max(0, barH)}
                fill={getDoseGroupColor(pt.doseLevel)}
                opacity={displayDay === day ? 1 : 0.7}
                rx={0.5}
              />
            );
          });
        })}

        {/* Hover crosshair */}
        {displayDay != null && (
          <line
            x1={xScale(displayDay)}
            x2={xScale(displayDay)}
            y1={PLOT.top}
            y2={PLOT.top + PLOT.height}
            stroke="#64748b"
            strokeWidth={0.5}
            opacity={0.4}
          />
        )}

        {/* Y-axis labels */}
        {yTicks.map((tick) => (
          <text
            key={tick}
            x={PLOT.left - 2}
            y={yScale(tick)}
            textAnchor="end"
            dominantBaseline="central"
            fill="#94a3b8"
            fontSize={6}
          >
            {tick}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((day) => (
          <text
            key={day}
            x={xScale(day)}
            y={PLOT.top + PLOT.height + 8}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize={6}
          >
            D{day}
          </text>
        ))}

        {/* Invisible hit area */}
        <rect
          x={PLOT.left}
          y={PLOT.top}
          width={PLOT.width}
          height={PLOT.height}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </svg>

      {/* CL Detail row */}
      {displayDay != null && (
        <CLDetailRow
          points={points.filter((p) => p.day === displayDay)}
          day={displayDay}
          doseGroupsMeta={doseGroupsMeta}
        />
      )}
    </div>
  );
}

// ── CL Detail Row ────────────────────────────────────────

function CLDetailRow({
  points,
  day,
  doseGroupsMeta,
}: {
  points: CLBarPoint[];
  day: number;
  doseGroupsMeta?: DoseGroup[];
}) {
  return (
    <div className="flex gap-2 text-[9px] leading-[14px]">
      <div className="shrink-0 font-medium tabular-nums pt-0.5" style={{ width: 40, color: "#334155" }}>
        D{day}
      </div>
      <div className="flex-1 min-w-0 space-y-0">
        {points
          .sort((a, b) => a.doseLevel - b.doseLevel)
          .map((pt) => (
            <div key={pt.doseLevel} className="flex items-center gap-1">
              <span
                className="inline-block shrink-0 rounded-full"
                style={{ width: 6, height: 6, backgroundColor: getDoseGroupColor(pt.doseLevel) }}
              />
              <span className="shrink-0 text-muted-foreground truncate" style={{ width: 52 }}>
                {shortDoseLabel(pt.doseLabel, doseGroupsMeta)}
              </span>
              <span className="font-semibold tabular-nums" style={{ color: "#334155" }}>
                {pt.count}/{pt.total}
              </span>
              <span className="text-muted-foreground/40">
                ({pt.total > 0 ? Math.round((pt.count / pt.total) * 100) : 0}%)
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
