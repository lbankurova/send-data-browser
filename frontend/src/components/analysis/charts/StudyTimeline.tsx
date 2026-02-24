import { useMemo } from "react";
import { getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";
import type { DeathRecord } from "@/types/mortality";

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
  pooled_n_male?: number;
  pooled_n_female?: number;
  pooled_n_total?: number;
  tk_count?: number | null;
  recovery_armcd?: string | null;
  recovery_n?: number | null;
  is_recovery?: boolean;
}

interface StudyTimelineProps {
  doseGroups: DoseGroup[];
  dosingDurationWeeks?: number;
  recoveryPeriodDays?: number;
  /** Deaths the backend classified as treatment-related (non-accidental). */
  treatmentRelatedDeaths?: DeathRecord[];
  /** Deaths the backend classified as accidental/incidental. */
  accidentalDeaths?: DeathRecord[];
  /** Subject IDs excluded from terminal statistics. */
  excludedSubjects?: ReadonlySet<string>;
}

// ── Constants (spec §2) ─────────────────────────────────────────────────────

const LANE_HEIGHT = 20; // spec: 18–20px
const ROW_PITCH = 38; // top-of-lane to top-of-next-lane (gap = 18px for sub-label)
const LEFT_MARGIN = 180; // spec: 140–180px (wider for enriched labels with n=XX)
const RIGHT_MARGIN = 20; // spec: 16–24px
const TOP_MARGIN = 24; // room for reference line labels above lanes
const BOTTOM_AXIS_HEIGHT = 30; // axis ticks + "Study day" label
const TK_LANE_HEIGHT = 10; // spec: 8–10px (thinner than main lanes)
const TK_LANE_GAP = 14;
const DEATH_R = 3.5;
const DEATH_OFFSET_ABOVE = 3; // spec §4.3: 2–4px above bar top
const SVG_WIDTH = 900;

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
function dayTicks(
  totalDays: number,
  dosingDays: number,
  hasRecovery: boolean,
): number[] {
  const ticks: number[] = [1];
  if (dosingDays > 1 && !ticks.includes(dosingDays)) ticks.push(dosingDays);
  if (hasRecovery && totalDays > dosingDays && !ticks.includes(totalDays))
    ticks.push(totalDays);
  const step = totalDays <= 30 ? 7 : totalDays <= 90 ? 14 : 28;
  for (let d = step; d < totalDays; d += step) {
    if (!ticks.includes(d) && Math.abs(d - dosingDays) > step * 0.3) {
      ticks.push(d);
    }
  }
  return ticks.sort((a, b) => a - b);
}

// ── Processed death event for timeline rendering ─────────────────────────────

interface TimelineDeath {
  id: string;
  day: number;
  sex: string;
  /** True = backend classified as treatment-related (in deaths[]).
   *  False = backend classified as accidental (in accidentals[]). */
  isTR: boolean;
  isExcluded: boolean;
  cause: string | null;
  doseLabel: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function StudyTimeline({
  doseGroups,
  dosingDurationWeeks = 4,
  recoveryPeriodDays = 0,
  treatmentRelatedDeaths = [],
  accidentalDeaths = [],
  excludedSubjects,
}: StudyTimelineProps) {
  const {
    mainGroups,
    tkTotal,
    tkByGroup,
    dosingDays,
    totalDays,
    hasRecovery,
  } = useMemo(() => {
    const main = doseGroups
      .filter((g) => !g.is_recovery)
      .sort((a, b) => a.dose_level - b.dose_level);

    let tkTot = 0;
    const tkMap = new Map<string, number>();
    for (const g of main) {
      const tk = g.tk_count ?? 0;
      tkTot += tk;
      if (tk > 0) tkMap.set(g.armcd, tk);
    }

    const dosDays = dosingDurationWeeks * 7;
    const totDays = dosDays + (recoveryPeriodDays > 0 ? recoveryPeriodDays : 0);
    // Recovery exists when recoveryPeriodDays > 0 AND at least one group has recovery subjects
    const hasRec =
      recoveryPeriodDays > 0 &&
      main.some((g) => g.recovery_armcd && (g.recovery_n ?? 0) > 0);

    return {
      mainGroups: main,
      tkTotal: tkTot,
      tkByGroup: tkMap,
      dosingDays: dosDays,
      totalDays: totDays,
      hasRecovery: hasRec,
    };
  }, [doseGroups, dosingDurationWeeks, recoveryPeriodDays]);

  // ── Map dose_level → lane index ──
  const doseToLane = useMemo(() => {
    const map = new Map<number, number>();
    mainGroups.forEach((g, i) => map.set(g.dose_level, i));
    return map;
  }, [mainGroups]);

  // ── Process death events per lane ──
  // Use the backend's classification: deaths[] = TR, accidentals[] = incidental
  const deathsByLane = useMemo(() => {
    const map = new Map<number, TimelineDeath[]>();

    const addDeath = (d: DeathRecord, isTR: boolean) => {
      if (d.study_day == null) return;
      const laneIdx = doseToLane.get(d.dose_level);
      if (laneIdx == null) return;
      const existing = map.get(laneIdx) ?? [];
      existing.push({
        id: d.USUBJID,
        day: d.study_day,
        sex: d.sex,
        isTR,
        isExcluded: excludedSubjects?.has(d.USUBJID) ?? false,
        cause: d.cause,
        doseLabel: d.dose_label,
      });
      map.set(laneIdx, existing);
    };

    for (const d of treatmentRelatedDeaths) addDeath(d, true);
    for (const d of accidentalDeaths) addDeath(d, false);

    for (const [, arr] of map) arr.sort((a, b) => a.day - b.day);
    return map;
  }, [treatmentRelatedDeaths, accidentalDeaths, doseToLane, excludedSubjects]);

  // ── Dimensions ──
  const laneCount = mainGroups.length;
  const hasTkLane = tkTotal > 0;
  const mainLanesHeight =
    laneCount > 0 ? (laneCount - 1) * ROW_PITCH + LANE_HEIGHT : 0;
  const tkAreaHeight = hasTkLane ? TK_LANE_GAP + TK_LANE_HEIGHT : 0;
  const svgHeight =
    TOP_MARGIN + mainLanesHeight + tkAreaHeight + BOTTOM_AXIS_HEIGHT;
  const chartWidth = SVG_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;

  /** Map a day (1-based) to x coordinate. Clamps to visible range. */
  const dayToX = (day: number): number => {
    const clamped = Math.max(1, Math.min(day, totalDays));
    return (
      LEFT_MARGIN +
      ((clamped - 1) / Math.max(totalDays - 1, 1)) * chartWidth
    );
  };

  const ticks = dayTicks(totalDays, dosingDays, hasRecovery);

  // Key x positions
  const d1X = dayToX(1);
  const termX = dayToX(dosingDays);
  const endX = hasRecovery ? dayToX(totalDays) : null;
  const lanesBottom = TOP_MARGIN + mainLanesHeight + tkAreaHeight;

  // Legend visibility flags
  const hasTrDeaths = treatmentRelatedDeaths.some(
    (d) => d.study_day != null,
  );
  const hasNonTrDeaths = accidentalDeaths.some((d) => d.study_day != null);
  const hasAnyDeaths = hasTrDeaths || hasNonTrDeaths;
  const showLegend = hasRecovery || hasTkLane || hasAnyDeaths;

  return (
    <div className="w-full rounded-md border p-3">
      <svg
        width="100%"
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
        className="overflow-visible"
      >
        {/* ── Reference lines (spec §3, §5) ─────────────────────── */}

        {/* D1 "First dose" */}
        <line
          x1={d1X}
          y1={TOP_MARGIN}
          x2={d1X}
          y2={lanesBottom + 2}
          stroke="#D1D5DB"
          strokeWidth={0.75}
          strokeDasharray="3,2"
        >
          <title>First dose · D1</title>
        </line>
        <text
          x={d1X}
          y={TOP_MARGIN - 4}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: "8px" }}
        >
          First dose
        </text>

        {/* Terminal sacrifice */}
        <line
          x1={termX}
          y1={TOP_MARGIN}
          x2={termX}
          y2={lanesBottom + 2}
          stroke="#9CA3AF"
          strokeWidth={1}
          strokeDasharray="3,2"
        >
          <title>{`Terminal sacrifice · D${dosingDays}`}</title>
        </line>
        <text
          x={termX}
          y={TOP_MARGIN - 4}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: "8px" }}
        >
          Terminal sac.
        </text>

        {/* End of recovery */}
        {hasRecovery && endX != null && (
          <>
            <line
              x1={endX}
              y1={TOP_MARGIN}
              x2={endX}
              y2={lanesBottom + 2}
              stroke="#D1D5DB"
              strokeWidth={0.75}
              strokeDasharray="3,2"
            >
              <title>{`End of recovery · D${totalDays}`}</title>
            </line>
            <text
              x={endX}
              y={TOP_MARGIN - 4}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: "8px" }}
            >
              End recovery
            </text>
          </>
        )}

        {/* ── Dose group lanes ──────────────────────────────────── */}
        {mainGroups.map((group, i) => {
          const y = TOP_MARGIN + i * ROW_PITCH;
          const color = getDoseGroupColor(group.dose_level);
          const barWidth = termX - d1X;
          const doseLabel = formatDoseShortLabel(group.label);
          const laneDeaths = deathsByLane.get(i) ?? [];
          const trDeathCount = laneDeaths.filter((d) => d.isTR).length;
          const nonTrDeathCount = laneDeaths.length - trDeathCount;
          const hasGroupRecovery =
            hasRecovery &&
            !!group.recovery_armcd &&
            (group.recovery_n ?? 0) > 0;
          const recoveryN = group.recovery_n ?? 0;

          // Sub-label: sex split + optional death count (spec §4.4)
          const subParts: string[] = [
            `${group.n_male}M / ${group.n_female}F`,
          ];
          if (trDeathCount > 0)
            subParts.push(
              `${trDeathCount} TR death${trDeathCount !== 1 ? "s" : ""}`,
            );
          if (nonTrDeathCount > 0) subParts.push(`${nonTrDeathCount} incidental`);
          const subLabel = subParts.join(" · ");

          // Tooltip for treatment bar
          const barTooltip = [
            `${doseLabel} · ${group.n_male}M / ${group.n_female}F (n=${group.n_total})`,
            trDeathCount > 0
              ? `${trDeathCount} TR death${trDeathCount !== 1 ? "s" : ""}`
              : null,
            nonTrDeathCount > 0
              ? `${nonTrDeathCount} incidental death${nonTrDeathCount !== 1 ? "s" : ""}`
              : null,
            hasGroupRecovery ? `Recovery: ${recoveryN} subjects` : null,
          ]
            .filter(Boolean)
            .join("\n");

          return (
            <g key={group.armcd}>
              {/* Lane label line 1: dose + N */}
              <text
                x={LEFT_MARGIN - 6}
                y={y + LANE_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: "11px", fontWeight: 600 }}
              >
                {doseLabel} (n={group.n_total})
              </text>

              {/* Lane label line 2: sub-label */}
              <text
                x={LEFT_MARGIN - 6}
                y={y + LANE_HEIGHT + 10}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-muted-foreground"
                style={{ fontSize: "9px" }}
              >
                {subLabel}
              </text>

              {/* Treatment bar (spec §4.1) */}
              <rect
                x={d1X}
                y={y}
                width={Math.max(barWidth, 1)}
                height={LANE_HEIGHT}
                rx={3}
                fill={color}
                opacity={0.85}
              >
                <title>{barTooltip}</title>
              </rect>

              {/* Recovery extension (spec §4.1) — uses main group's recovery_armcd/recovery_n */}
              {hasGroupRecovery && (
                <rect
                  x={termX}
                  y={y}
                  width={Math.max(dayToX(totalDays) - termX, 1)}
                  height={LANE_HEIGHT}
                  rx={3}
                  fill={lighten(color, 0.5)}
                  opacity={0.7}
                  stroke={color}
                  strokeWidth={0.5}
                  strokeDasharray="2,1"
                >
                  <title>{`Recovery · ${recoveryN} subjects · D${dosingDays + 1}–D${totalDays}`}</title>
                </rect>
              )}
              {hasGroupRecovery && (
                <text
                  x={termX + 4}
                  y={y + LANE_HEIGHT / 2}
                  dominantBaseline="central"
                  fill={color}
                  style={{
                    fontSize: "8px",
                    fontWeight: 500,
                    pointerEvents: "none",
                  }}
                >
                  R:{recoveryN}
                </text>
              )}

              {/* Death markers (spec §4.3) — offset above bar top */}
              {laneDeaths.map((death, di) => {
                const cx = dayToX(death.day);
                const sameDay = laneDeaths.filter(
                  (d, j) => j < di && d.day === death.day,
                ).length;
                const cy =
                  y - DEATH_OFFSET_ABOVE - sameDay * (DEATH_R * 2 + 1);

                return (
                  <circle
                    key={`death-${death.id}`}
                    cx={cx}
                    cy={cy}
                    r={DEATH_R}
                    fill={death.isTR ? "#DC2626" : "white"}
                    stroke={death.isTR ? "white" : "#6B7280"}
                    strokeWidth={1.5}
                    style={{ cursor: "default" }}
                  >
                    <title>
                      {[
                        `${death.id} · D${death.day} · ${death.doseLabel}`,
                        death.isTR ? "Treatment-related" : "Incidental",
                        death.cause ?? undefined,
                        death.isExcluded
                          ? "Excluded from analysis"
                          : "Included in analysis",
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}

        {/* ── TK satellite lane (spec §4.2 Variant A) ──────────── */}
        {hasTkLane &&
          (() => {
            const tkY = TOP_MARGIN + mainLanesHeight + TK_LANE_GAP;
            const barWidth = termX - d1X;
            const tkGroups = mainGroups.filter(
              (g) => (tkByGroup.get(g.armcd) ?? 0) > 0,
            );

            return (
              <g>
                <text
                  x={LEFT_MARGIN - 6}
                  y={tkY + TK_LANE_HEIGHT / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-muted-foreground"
                  style={{ fontSize: "9px", fontStyle: "italic" }}
                >
                  TK satellites (n={tkTotal})
                </text>

                <rect
                  x={d1X}
                  y={tkY}
                  width={Math.max(barWidth, 1)}
                  height={TK_LANE_HEIGHT}
                  rx={2}
                  fill="#F3F4F6"
                  stroke="#9CA3AF"
                  strokeWidth={0.75}
                  strokeDasharray="3,2"
                >
                  <title>{`TK satellites · ${tkTotal} subjects · Excluded from toxicology analyses`}</title>
                </rect>

                {tkGroups.length > 0 &&
                  (() => {
                    const segWidth = barWidth / tkGroups.length;
                    return tkGroups.map((g, si) => {
                      const tkCount = tkByGroup.get(g.armcd) ?? 0;
                      const color = getDoseGroupColor(g.dose_level);
                      const sx = d1X + si * segWidth;
                      return (
                        <g key={`tk-${g.armcd}`}>
                          <rect
                            x={sx + 1}
                            y={tkY + 1}
                            width={Math.max(segWidth - 2, 1)}
                            height={TK_LANE_HEIGHT - 2}
                            rx={1}
                            fill={lighten(color, 0.65)}
                            opacity={0.8}
                          />
                          <text
                            x={sx + segWidth / 2}
                            y={tkY + TK_LANE_HEIGHT / 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={color}
                            style={{ fontSize: "7px", fontWeight: 600 }}
                          >
                            {tkCount}
                          </text>
                        </g>
                      );
                    });
                  })()}

                <text
                  x={termX + 4}
                  y={tkY + TK_LANE_HEIGHT / 2}
                  dominantBaseline="central"
                  className="fill-muted-foreground"
                  style={{ fontSize: "8px", fontStyle: "italic" }}
                >
                  Excluded from tox analyses
                </text>
              </g>
            );
          })()}

        {/* ── Day axis (spec §3) ──────────────────────────────── */}
        <text
          x={LEFT_MARGIN - 6}
          y={lanesBottom + 16}
          textAnchor="end"
          className="fill-muted-foreground"
          style={{ fontSize: "9px", fontWeight: 500 }}
        >
          Study day
        </text>

        {ticks.map((day) => {
          const x = dayToX(day);
          const axisY = lanesBottom + 6;
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
                y={axisY + 14}
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

      {/* ── Legend (spec §5) ─────────────────────────────────── */}
      {showLegend && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-5 rounded-sm"
              style={{ background: getDoseGroupColor(1), opacity: 0.85 }}
            />
            Treatment
          </span>
          {hasRecovery && (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-5 rounded-sm border border-dashed"
                style={{
                  background: lighten(getDoseGroupColor(1), 0.5),
                  borderColor: getDoseGroupColor(1),
                  opacity: 0.7,
                }}
              />
              Recovery
            </span>
          )}
          {hasTkLane && (
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-5 rounded-sm border border-dashed"
                style={{ background: "#F3F4F6", borderColor: "#9CA3AF" }}
              />
              TK satellites
            </span>
          )}
          {hasTrDeaths && (
            <span className="inline-flex items-center gap-1">
              <svg width="8" height="8" className="shrink-0">
                <circle
                  cx="4"
                  cy="4"
                  r="3"
                  fill="#DC2626"
                  stroke="white"
                  strokeWidth="1"
                />
              </svg>
              TR death
            </span>
          )}
          {hasNonTrDeaths && (
            <span className="inline-flex items-center gap-1">
              <svg width="8" height="8" className="shrink-0">
                <circle
                  cx="4"
                  cy="4"
                  r="3"
                  fill="white"
                  stroke="#6B7280"
                  strokeWidth="1.5"
                />
              </svg>
              Incidental death
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <svg width="8" height="8" className="shrink-0">
              <line
                x1="4"
                y1="0"
                x2="4"
                y2="8"
                stroke="#9CA3AF"
                strokeWidth="1"
                strokeDasharray="2,1"
              />
            </svg>
            Terminal sacrifice
          </span>
        </div>
      )}
    </div>
  );
}
