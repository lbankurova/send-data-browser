import { useMemo } from "react";
import { getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";

// ── Types ────────────────────────────────────────────────────────────────────

interface DoseGroup {
  armcd: string;
  label: string;
  dose_level: number;
  dose_value?: number | null;
  dose_unit?: string | null;
  n_male: number;
  n_female: number;
  n_total: number;
  tk_count?: number | null;
  recovery_armcd?: string | null;
  recovery_n?: number | null;
  is_recovery?: boolean;
}

interface StudyTimelineProps {
  doseGroups: DoseGroup[];
  dosingDurationWeeks?: number;
  recoveryPeriodDays?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const LANE_HEIGHT = 14;
const LANE_GAP = 3;
const LEFT_MARGIN = 90;
const RIGHT_MARGIN = 40;
const TOP_MARGIN = 4;
const BOTTOM_AXIS_HEIGHT = 16;
const TK_LANE_GAP = 6;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Lighten a hex color by mixing with white. factor 0 = original, 1 = white. */
function lighten(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

/** Generate sensible day tick marks for the axis. */
function dayTicks(totalDays: number, dosingDays: number, hasRecovery: boolean): number[] {
  const ticks: number[] = [1];
  if (dosingDays > 1 && !ticks.includes(dosingDays)) ticks.push(dosingDays);
  if (hasRecovery && totalDays > dosingDays && !ticks.includes(totalDays)) ticks.push(totalDays);
  // Add intermediate ticks for longer studies
  const step = totalDays <= 30 ? 7 : totalDays <= 90 ? 14 : 28;
  for (let d = step; d < totalDays; d += step) {
    if (!ticks.includes(d) && Math.abs(d - dosingDays) > step * 0.3) {
      ticks.push(d);
    }
  }
  return ticks.sort((a, b) => a - b);
}

// ── Component ────────────────────────────────────────────────────────────────

export function StudyTimeline({
  doseGroups,
  dosingDurationWeeks = 4,
  recoveryPeriodDays = 0,
}: StudyTimelineProps) {
  const {
    mainGroups,
    recoveryMap,
    tkTotal,
    tkByGroup,
    dosingDays,
    totalDays,
    hasRecovery,
  } = useMemo(() => {
    // Filter out recovery groups and sort main groups by dose_level ascending
    const main = doseGroups
      .filter((g) => !g.is_recovery)
      .sort((a, b) => a.dose_level - b.dose_level);

    // Build recovery map: parent armcd → recovery group
    const recMap = new Map<string, DoseGroup>();
    const recoveryGroups = doseGroups.filter((g) => g.is_recovery);
    for (const rg of recoveryGroups) {
      // Try to match recovery groups to their parent by recovery_armcd on the parent
      const parent = main.find((m) => m.recovery_armcd === rg.armcd);
      if (parent) recMap.set(parent.armcd, rg);
    }
    // Also check if any main group references a recovery armcd that exists
    for (const mg of main) {
      if (mg.recovery_armcd && !recMap.has(mg.armcd)) {
        const rg = recoveryGroups.find((r) => r.armcd === mg.recovery_armcd);
        if (rg) recMap.set(mg.armcd, rg);
      }
    }

    // TK satellite data
    let tkTot = 0;
    const tkMap = new Map<string, number>();
    for (const g of main) {
      const tk = g.tk_count ?? 0;
      tkTot += tk;
      if (tk > 0) tkMap.set(g.armcd, tk);
    }

    const dosDays = dosingDurationWeeks * 7;
    const totDays = dosDays + (recoveryPeriodDays > 0 ? recoveryPeriodDays : 0);
    const hasRec = recoveryPeriodDays > 0 && recMap.size > 0;

    return {
      mainGroups: main,
      recoveryMap: recMap,
      tkTotal: tkTot,
      tkByGroup: tkMap,
      dosingDays: dosDays,
      totalDays: totDays,
      hasRecovery: hasRec,
    };
  }, [doseGroups, dosingDurationWeeks, recoveryPeriodDays]);

  // Dimensions
  const laneCount = mainGroups.length;
  const hasTkLane = tkTotal > 0;
  const lanesHeight =
    laneCount * LANE_HEIGHT +
    (laneCount > 1 ? (laneCount - 1) * LANE_GAP : 0) +
    (hasTkLane ? TK_LANE_GAP + LANE_HEIGHT : 0);
  const svgHeight = TOP_MARGIN + lanesHeight + BOTTOM_AXIS_HEIGHT + 2;
  const svgWidth = 520;

  const chartWidth = svgWidth - LEFT_MARGIN - RIGHT_MARGIN;

  /** Map a day (1-based) to x coordinate. */
  const dayToX = (day: number): number => {
    return LEFT_MARGIN + ((day - 1) / Math.max(totalDays - 1, 1)) * chartWidth;
  };

  const ticks = dayTicks(totalDays, dosingDays, hasRecovery);

  // Terminal sacrifice x position
  const termX = dayToX(dosingDays);

  return (
    <div className="w-full">
      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="overflow-visible"
        style={{ maxHeight: `${Math.max(svgHeight, 80)}px` }}
      >
        {/* Terminal sacrifice line */}
        <line
          x1={termX}
          y1={TOP_MARGIN - 2}
          x2={termX}
          y2={TOP_MARGIN + lanesHeight + 2}
          stroke="#9CA3AF"
          strokeWidth={1}
          strokeDasharray="3,2"
        />
        <text
          x={termX}
          y={TOP_MARGIN - 2}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: "8px" }}
        >
          terminal sac
        </text>

        {/* Dose group lanes */}
        {mainGroups.map((group, i) => {
          const y = TOP_MARGIN + i * (LANE_HEIGHT + LANE_GAP);
          const color = getDoseGroupColor(group.dose_level);
          const barX = dayToX(1);
          const barWidth = termX - barX;
          const recGroup = recoveryMap.get(group.armcd);
          const doseLabel = formatDoseShortLabel(group.label);
          const sizeLabel = `${group.n_male}M ${group.n_female}F`;

          return (
            <g key={group.armcd}>
              {/* Group label */}
              <text
                x={LEFT_MARGIN - 4}
                y={y + LANE_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: "10px" }}
              >
                {doseLabel}
              </text>

              {/* Dosing period bar */}
              <rect
                x={barX}
                y={y}
                width={Math.max(barWidth, 1)}
                height={LANE_HEIGHT}
                rx={2}
                fill={color}
                opacity={0.85}
              />

              {/* Group size annotation */}
              <text
                x={barX + 3}
                y={y + LANE_HEIGHT / 2}
                dominantBaseline="central"
                fill="white"
                style={{ fontSize: "9px", fontWeight: 500 }}
              >
                {sizeLabel}
              </text>

              {/* Recovery extension */}
              {hasRecovery && recGroup && (
                <rect
                  x={termX}
                  y={y}
                  width={Math.max(dayToX(totalDays) - termX, 1)}
                  height={LANE_HEIGHT}
                  rx={2}
                  fill={lighten(color, 0.5)}
                  opacity={0.7}
                  stroke={color}
                  strokeWidth={0.5}
                  strokeDasharray="2,1"
                />
              )}
              {hasRecovery && recGroup && (
                <text
                  x={termX + 3}
                  y={y + LANE_HEIGHT / 2}
                  dominantBaseline="central"
                  fill={color}
                  style={{ fontSize: "8px", fontWeight: 500 }}
                >
                  R:{recGroup.recovery_n ?? recGroup.n_total}
                </text>
              )}
            </g>
          );
        })}

        {/* TK satellite lane */}
        {hasTkLane && (() => {
          const tkY =
            TOP_MARGIN +
            laneCount * (LANE_HEIGHT + LANE_GAP) -
            LANE_GAP +
            TK_LANE_GAP;
          const barX = dayToX(1);
          const barWidth = termX - barX;

          // Compute per-group TK segments
          const tkGroups = mainGroups.filter(
            (g) => (tkByGroup.get(g.armcd) ?? 0) > 0,
          );

          return (
            <g>
              {/* TK label */}
              <text
                x={LEFT_MARGIN - 4}
                y={tkY + LANE_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-muted-foreground"
                style={{ fontSize: "9px", fontStyle: "italic" }}
              >
                TK satellite
              </text>

              {/* TK lane background */}
              <rect
                x={barX}
                y={tkY}
                width={Math.max(barWidth, 1)}
                height={LANE_HEIGHT}
                rx={2}
                fill="#F3F4F6"
                stroke="#9CA3AF"
                strokeWidth={0.75}
                strokeDasharray="3,2"
              />

              {/* TK per-group segments */}
              {tkGroups.length > 0 && (() => {
                const segWidth = barWidth / tkGroups.length;
                return tkGroups.map((g, si) => {
                  const tkCount = tkByGroup.get(g.armcd) ?? 0;
                  const color = getDoseGroupColor(g.dose_level);
                  const sx = barX + si * segWidth;
                  return (
                    <g key={`tk-${g.armcd}`}>
                      <rect
                        x={sx + 1}
                        y={tkY + 1}
                        width={Math.max(segWidth - 2, 1)}
                        height={LANE_HEIGHT - 2}
                        rx={1}
                        fill={lighten(color, 0.65)}
                        opacity={0.8}
                      />
                      <text
                        x={sx + segWidth / 2}
                        y={tkY + LANE_HEIGHT / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={color}
                        style={{ fontSize: "8px", fontWeight: 600 }}
                      >
                        {tkCount}
                      </text>
                    </g>
                  );
                });
              })()}

              {/* TK annotation */}
              <text
                x={termX + 3}
                y={tkY + LANE_HEIGHT / 2}
                dominantBaseline="central"
                className="fill-muted-foreground"
                style={{ fontSize: "8px", fontStyle: "italic" }}
              >
                Excluded from toxicology analyses
              </text>
            </g>
          );
        })()}

        {/* Day axis */}
        {ticks.map((day) => {
          const x = dayToX(day);
          const axisY = TOP_MARGIN + lanesHeight + 4;
          return (
            <g key={`tick-${day}`}>
              <line
                x1={x}
                y1={axisY}
                x2={x}
                y2={axisY + 4}
                stroke="#9CA3AF"
                strokeWidth={0.75}
              />
              <text
                x={x}
                y={axisY + 13}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: "9px" }}
              >
                D{day}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
