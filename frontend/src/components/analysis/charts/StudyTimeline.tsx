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
  tk_count?: number | null;
  tk_n_male?: number;
  tk_n_female?: number;
  recovery_armcd?: string | null;
  recovery_n?: number | null;
  recovery_n_male?: number;
  recovery_n_female?: number;
  is_recovery?: boolean;
}

interface StudyTimelineProps {
  doseGroups: DoseGroup[];
  dosingDurationWeeks?: number;
  recoveryPeriodDays?: number;
  /** Deaths the backend classified as treatment-related (non-accidental). */
  treatmentRelatedDeaths?: DeathRecord[];
  /** Deaths the backend classified as accidental. */
  accidentalDeaths?: DeathRecord[];
  /** Subject IDs excluded from terminal statistics. */
  excludedSubjects?: ReadonlySet<string>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SVG_WIDTH = 1050;
const LEFT_MARGIN = 90;
const RIGHT_MARGIN = 467;
const ANNOT_GAP = 20;
const TOP_MARGIN = 4;
const BOTTOM_AXIS_HEIGHT = 36;
const ROW_PITCH = 34;
const DEATH_R = 3.5;
const DEATH_R_TR = 4.2; // 20% larger — solid fill looks visually smaller
const INDICATOR_H = 6;
const LINE_W = 2.25;
const RECOVERY_LINE_W = 1.5;

// SVG text is ~10% smaller than HTML due to viewBox scaling (900 → ~820px),
// so use 10px in SVG to visually match 9px in the HTML legend.
const TEXT_SIZE = "10px";

// Colors
const LINE_COLOR = "#94A3B8";
const RECOVERY_COLOR = "#CBD5E1";
const DEATH_GRAY = "#6B7280";

// ── Helpers ──────────────────────────────────────────────────────────────────

function dayTicks(
  totalDays: number,
  dosingDays: number,
  hasRecovery: boolean,
): number[] {
  const ticks: number[] = [1];
  if (dosingDays > 1 && !ticks.includes(dosingDays)) ticks.push(dosingDays);
  if (hasRecovery && totalDays > dosingDays && !ticks.includes(totalDays))
    ticks.push(totalDays);
  return ticks.sort((a, b) => a - b);
}

// ── Processed death event for timeline rendering ─────────────────────────────

interface TimelineDeath {
  id: string;
  day: number;
  sex: string;
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
    tkMaleTotal,
    tkFemaleTotal,
    tkByGroup,
    dosingDays,
    totalDays,
    hasRecovery,
  } = useMemo(() => {
    const main = doseGroups
      .filter((g) => !g.is_recovery)
      .sort((a, b) => a.dose_level - b.dose_level);

    let tkTot = 0;
    let tkMale = 0;
    let tkFemale = 0;
    const tkMap = new Map<string, number>();
    for (const g of main) {
      const tk = g.tk_count ?? 0;
      tkTot += tk;
      tkMale += g.tk_n_male ?? 0;
      tkFemale += g.tk_n_female ?? 0;
      if (tk > 0) tkMap.set(g.armcd, tk);
    }

    const dosDays = dosingDurationWeeks * 7;
    const totDays = dosDays + (recoveryPeriodDays > 0 ? recoveryPeriodDays : 0);
    const hasRec =
      recoveryPeriodDays > 0 &&
      main.some((g) => g.recovery_armcd && (g.recovery_n ?? 0) > 0);

    return {
      mainGroups: main,
      tkTotal: tkTot,
      tkMaleTotal: tkMale,
      tkFemaleTotal: tkFemale,
      tkByGroup: tkMap,
      dosingDays: dosDays,
      totalDays: totDays,
      hasRecovery: hasRec,
    };
  }, [doseGroups, dosingDurationWeeks, recoveryPeriodDays]);

  const doseToLane = useMemo(() => {
    const map = new Map<number, number>();
    mainGroups.forEach((g, i) => map.set(g.dose_level, i));
    return map;
  }, [mainGroups]);

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
  const totalLanes = laneCount + (hasTkLane ? 1 : 0);
  const allLanesHeight =
    totalLanes > 0 ? (totalLanes - 1) * ROW_PITCH + 8 : 0;
  const svgHeight =
    TOP_MARGIN + allLanesHeight + BOTTOM_AXIS_HEIGHT;
  const chartWidth = SVG_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;

  const dayToX = (day: number): number => {
    const clamped = Math.max(1, Math.min(day, totalDays));
    return (
      LEFT_MARGIN +
      ((clamped - 1) / Math.max(totalDays - 1, 1)) * chartWidth
    );
  };

  const ticks = dayTicks(totalDays, dosingDays, hasRecovery);

  const d1X = dayToX(1);
  const termX = dayToX(dosingDays);
  const endX = hasRecovery ? dayToX(totalDays) : null;
  const lanesBottom = TOP_MARGIN + allLanesHeight;
  const annotX = SVG_WIDTH - RIGHT_MARGIN + ANNOT_GAP;
  const annotW = RIGHT_MARGIN - ANNOT_GAP;

  // Legend flags
  const hasTrDeaths = treatmentRelatedDeaths.some(
    (d) => d.study_day != null,
  );
  const hasAccDeaths = accidentalDeaths.some((d) => d.study_day != null);
  const hasAnyDeaths = hasTrDeaths || hasAccDeaths;
  const showLegend = hasRecovery || hasTkLane || hasAnyDeaths;

  return (
    <section>
      {/* ── Legend (above chart) ─────────────────────────────── */}
      {showLegend && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground" style={{ maxWidth: "960px" }}>
          <span className="inline-flex items-center gap-1">
            <svg width="18" height="8" className="shrink-0">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                stroke={LINE_COLOR}
                strokeWidth="2"
              />
            </svg>
            Treatment
          </span>
          {hasRecovery && (
            <span className="inline-flex items-center gap-1">
              <svg width="18" height="8" className="shrink-0">
                <line
                  x1="0"
                  y1="4"
                  x2="18"
                  y2="4"
                  stroke={RECOVERY_COLOR}
                  strokeWidth="1.5"
                />
              </svg>
              Recovery
            </span>
          )}
          {hasTkLane && (
            <span className="inline-flex items-center gap-1">
              <svg width="18" height="8" className="shrink-0">
                <line
                  x1="0"
                  y1="4"
                  x2="18"
                  y2="4"
                  stroke="#9CA3AF"
                  strokeWidth="1"
                  strokeDasharray="3,2"
                />
              </svg>
              TK satellites
            </span>
          )}
          {hasTrDeaths && (
            <span className="inline-flex items-center gap-1">
              <svg width="9" height="9" className="shrink-0">
                <circle
                  cx="4.5"
                  cy="4.5"
                  r="3.5"
                  fill={DEATH_GRAY}
                  stroke="white"
                  strokeWidth="1.5"
                />
              </svg>
              TR death
            </span>
          )}
          {hasAccDeaths && (
            <span className="inline-flex items-center gap-1">
              <svg width="8" height="8" className="shrink-0">
                <circle
                  cx="4"
                  cy="4"
                  r="3"
                  fill="white"
                  stroke={DEATH_GRAY}
                  strokeWidth="1.5"
                />
              </svg>
              Accidental death
            </span>
          )}
        </div>
      )}

      {/* ── Chart ───────────────────────────────────────────── */}
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
        className="overflow-visible"
        style={{ maxWidth: "960px" }}
      >
        {/* ── Vertical reference lines ─────────────────────────── */}
        <line
          x1={termX}
          y1={TOP_MARGIN - 4}
          x2={termX}
          y2={lanesBottom + 4}
          stroke="#D1D5DB"
          strokeWidth={0.75}
          strokeDasharray="2,2"
        >
          <title>{`Terminal sacrifice · D${dosingDays}`}</title>
        </line>

        {hasRecovery && endX != null && (
          <line
            x1={endX}
            y1={TOP_MARGIN - 4}
            x2={endX}
            y2={lanesBottom + 4}
            stroke="#D1D5DB"
            strokeWidth={0.75}
            strokeDasharray="2,2"
          >
            <title>{`End of recovery · D${totalDays}`}</title>
          </line>
        )}

        {/* ── Dose group lanes ──────────────────────────────────── */}
        {mainGroups.map((group, i) => {
          const lineY = TOP_MARGIN + i * ROW_PITCH;
          const color = getDoseGroupColor(group.dose_level);
          const doseLabel = formatDoseShortLabel(group.label);
          const laneDeaths = deathsByLane.get(i) ?? [];
          const trCount = laneDeaths.filter((d) => d.isTR).length;
          const accCount = laneDeaths.length - trCount;
          const recoveryN = group.recovery_n ?? 0;
          const hasGroupRecovery =
            hasRecovery &&
            !!group.recovery_armcd &&
            recoveryN > 0;

          // Annotation parts
          const armParts: string[] = [];
          if (hasGroupRecovery) {
            armParts.push(`Main arm: n\u00a0=\u00a0${group.n_total} (${group.n_male}M,\u00a0${group.n_female}F)`);
            armParts.push(`Recovery: n\u00a0=\u00a0${recoveryN} (${group.recovery_n_male ?? 0}M,\u00a0${group.recovery_n_female ?? 0}F)`);
          } else {
            armParts.push(`n\u00a0=\u00a0${group.n_total} (${group.n_male}M,\u00a0${group.n_female}F)`);
          }
          if (trCount > 0)
            armParts.push(`${trCount} TR death${trCount !== 1 ? "s" : ""}`);
          if (accCount > 0)
            armParts.push(`${accCount} accidental death${accCount !== 1 ? "s" : ""}`);
          const annotText = armParts.join("\u2003\u2003");

          const barTooltip = [
            `${doseLabel} · ${group.n_male}M / ${group.n_female}F (n=${group.n_total})`,
            hasGroupRecovery ? `Recovery: ${recoveryN} subjects` : null,
            trCount > 0
              ? `${trCount} TR death${trCount !== 1 ? "s" : ""}`
              : null,
            accCount > 0
              ? `${accCount} accidental death${accCount !== 1 ? "s" : ""}`
              : null,
          ]
            .filter(Boolean)
            .join("\n");

          const deathDays = [...new Set(laneDeaths.map((d) => d.day))];

          return (
            <g key={group.armcd}>
              {/* Left label: dose name only */}
              <text
                x={0}
                y={lineY}
                textAnchor="start"
                dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: TEXT_SIZE, fontWeight: 600 }}
              >
                {doseLabel}
              </text>

              {/* Colored indicator tick */}
              <line
                x1={d1X}
                y1={lineY - INDICATOR_H}
                x2={d1X}
                y2={lineY + INDICATOR_H}
                stroke={color}
                strokeWidth={2}
              />

              {/* Treatment line */}
              <line
                x1={d1X}
                y1={lineY}
                x2={termX}
                y2={lineY}
                stroke={LINE_COLOR}
                strokeWidth={LINE_W}
              >
                <title>{barTooltip}</title>
              </line>

              {/* Recovery extension line */}
              {hasGroupRecovery && (
                <line
                  x1={termX}
                  y1={lineY}
                  x2={endX ?? termX}
                  y2={lineY}
                  stroke={RECOVERY_COLOR}
                  strokeWidth={RECOVERY_LINE_W}
                >
                  <title>{`Recovery · ${recoveryN} subjects · D${dosingDays + 1}–D${totalDays}`}</title>
                </line>
              )}

              {/* Death markers (same size for TR and accidental) */}
              {laneDeaths.map((death, di) => {
                const cx = dayToX(death.day);
                const sameDay = laneDeaths.filter(
                  (d, j) => j < di && d.day === death.day,
                ).length;
                const r = death.isTR ? DEATH_R_TR : DEATH_R;
                const cy = lineY - sameDay * (DEATH_R_TR * 2 + 2);

                return (
                  <circle
                    key={`death-${death.id}`}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={death.isTR ? DEATH_GRAY : "white"}
                    stroke={death.isTR ? "white" : DEATH_GRAY}
                    strokeWidth={1.5}
                    style={{ cursor: "default" }}
                  >
                    <title>
                      {[
                        `Subject: ${death.id.slice(-4)} · ${death.sex}`,
                        death.isTR ? "Treatment-related" : "Accidental",
                        death.cause ?? undefined,
                        death.isExcluded
                          ? "Excluded from terminal stats"
                          : "Included in terminal stats",
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    </title>
                  </circle>
                );
              })}

              {/* Death day labels */}
              {deathDays.map((day) => (
                <text
                  key={`dlabel-${group.armcd}-${day}`}
                  x={dayToX(day)}
                  y={lineY + 12}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: TEXT_SIZE }}
                >
                  D{day}
                </text>
              ))}

              {/* Right annotation: wrapping HTML via foreignObject */}
              <foreignObject
                x={annotX}
                y={lineY - ROW_PITCH / 2}
                width={annotW}
                height={ROW_PITCH}
              >
                <div
                  style={{ fontSize: TEXT_SIZE, lineHeight: "1.3", display: "flex", alignItems: "center", height: "100%" }}
                  className="text-muted-foreground"
                >
                  {annotText}
                </div>
              </foreignObject>
            </g>
          );
        })}

        {/* ── TK satellite lane ───────────────────────────────── */}
        {hasTkLane &&
          (() => {
            const tkY = TOP_MARGIN + laneCount * ROW_PITCH;
            const tkGroups = mainGroups.filter(
              (g) => (tkByGroup.get(g.armcd) ?? 0) > 0,
            );

            return (
              <g>
                {/* Left label */}
                <text
                  x={0}
                  y={tkY}
                  textAnchor="start"
                  dominantBaseline="central"
                  className="fill-muted-foreground"
                  style={{ fontSize: TEXT_SIZE }}
                >
                  TK satellites
                </text>

                {/* Dashed horizontal line */}
                <line
                  x1={d1X}
                  y1={tkY}
                  x2={termX}
                  y2={tkY}
                  stroke="#9CA3AF"
                  strokeWidth={1}
                  strokeDasharray="4,3"
                >
                  <title>{`TK satellites · ${tkTotal} subjects · Excluded from toxicology analyses`}</title>
                </line>

                {/* Colored indicator pipes at line start */}
                {tkGroups.map((g, si) => {
                  const color = getDoseGroupColor(g.dose_level);
                  const pipeX = d1X + si * 5;
                  return (
                    <line
                      key={`tk-tick-${g.armcd}`}
                      x1={pipeX}
                      y1={tkY - INDICATOR_H}
                      x2={pipeX}
                      y2={tkY + INDICATOR_H}
                      stroke={color}
                      strokeWidth={2}
                    />
                  );
                })}

                {/* Right annotation: wrapping HTML via foreignObject */}
                <foreignObject
                  x={annotX}
                  y={tkY - ROW_PITCH / 2}
                  width={annotW}
                  height={ROW_PITCH}
                >
                  <div
                    style={{ fontSize: TEXT_SIZE, lineHeight: "1.3", display: "flex", alignItems: "center", height: "100%" }}
                    className="text-muted-foreground"
                  >
                    N&nbsp;=&nbsp;{tkTotal} ({tkMaleTotal}M,&nbsp;{tkFemaleTotal}F)
                  </div>
                </foreignObject>
              </g>
            );
          })()}

        {/* ── Day axis ────────────────────────────────────────── */}
        {ticks.map((day) => {
          const x = dayToX(day);
          const axisY = lanesBottom + 6;
          const isTerminal = day === dosingDays;
          const isEndRecovery = hasRecovery && day === totalDays;

          const anchor = day === 1 ? "start" : isEndRecovery ? "start" : isTerminal ? "end" : "middle";
          // Nudge text so the "D" glyph visually aligns with the tick mark
          const textX = anchor === "start" ? x - 1 : anchor === "end" ? x + 1 : x;

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
                x={textX}
                y={axisY + 13}
                textAnchor={anchor}
                className="fill-muted-foreground"
                style={{ fontSize: TEXT_SIZE }}
              >
                D{day}
              </text>
              {day === 1 && (
                <text
                  x={textX}
                  y={axisY + 23}
                  textAnchor="start"
                  className="fill-muted-foreground"
                  style={{ fontSize: TEXT_SIZE, letterSpacing: "0.03em" }}
                >
                  TREATMENT
                </text>
              )}
              {isTerminal && (
                <text
                  x={textX}
                  y={axisY + 23}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  style={{
                    fontSize: TEXT_SIZE,
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                  }}
                >
                  TERMINAL SAC.
                </text>
              )}
              {isEndRecovery && (
                <text
                  x={textX}
                  y={axisY + 23}
                  textAnchor="start"
                  className="fill-muted-foreground"
                  style={{ fontSize: TEXT_SIZE, letterSpacing: "0.03em" }}
                >
                  END RECOVERY
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
