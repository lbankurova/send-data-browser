/**
 * Incidence Dumbbell Chart — side-by-side F/M panels showing
 * terminal → recovery incidence trajectories for histopath findings.
 *
 * Parallel to RecoveryDumbbellChart (continuous endpoints) but uses
 * incidence % on the x-axis instead of |g| effect size.
 */
import { useMemo, useState, useCallback } from "react";
import type { RecoveryDoseAssessment, RecoveryVerdict } from "@/lib/recovery-assessment";
import { DoseLabel } from "@/components/ui/DoseLabel";
import { getDoseGroupColor } from "@/lib/severity-colors";

// ── Types ────────────────────────────────────────────────

export interface IncidenceChartRow {
  assessment: RecoveryDoseAssessment;
  doseLabel: string;
  terminalPct: number | null;   // main incidence × 100 (0–100)
  recoveryPct: number | null;   // recovery incidence × 100 (0–100)
  verdict: RecoveryVerdict;
  isEdge: "not_examined" | "insufficient_n" | "low_power" | "anomaly" | null;
}

interface IncidenceDumbbellChartProps {
  assessmentsBySex: Record<string, RecoveryDoseAssessment[]>;
  recoveryDays?: number | null;
  onDoseClick?: (doseLevel: number) => void;
}

// ── Verdict display ──────────────────────────────────────

export const INCIDENCE_VERDICT_CLASS: Record<RecoveryVerdict, string> = {
  reversed: "text-foreground",
  reversing: "text-foreground",
  persistent: "text-foreground font-semibold",
  progressing: "text-foreground font-semibold",
  anomaly: "text-foreground font-semibold",
  not_examined: "text-muted-foreground",
  insufficient_n: "text-muted-foreground",
  low_power: "text-muted-foreground",
  not_observed: "text-muted-foreground",
  no_data: "text-muted-foreground",
};

export const INCIDENCE_VERDICT_LABEL: Record<RecoveryVerdict, string> = {
  reversed: "Reversed",
  reversing: "Reversing",
  persistent: "Persistent",
  progressing: "Progressing",
  anomaly: "Anomaly",
  not_examined: "Not examined",
  insufficient_n: "Insufficient N",
  low_power: "Low power",
  not_observed: "Not observed",
  no_data: "No data",
};

// ── Constants ────────────────────────────────────────────

const ROW_HEIGHT = 22;
const DOT_R = 2.5;
const ARROW_SIZE = 5;
const CONNECTOR_COLOR = "#94A3B8"; // slate-400
const ZERO_LINE_COLOR = "#CBD5E1"; // slate-300

// ── Helpers ──────────────────────────────────────────────

/**
 * Extract compact dose from doseGroupLabel.
 * Input formats: "3 (200 mg/kg)" → "200 mg/kg", "Control" → "Control",
 * "3, 200 mg/kg PCDRUG" → "200 mg/kg", plain "Dose 1" → "Dose 1".
 */
function extractCompactDose(label: string): string {
  // "N (dose)" format from formatDoseGroupLabel
  const parenMatch = label.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].trim();
  // Comma-separated fallback: "N, dose DRUG"
  const commaIdx = label.indexOf(",");
  if (commaIdx >= 0) {
    const dosePart = label.slice(commaIdx + 1).trim();
    const doseMatch = dosePart.match(/^([\d.]+\s*\S+\/\S+)/);
    return doseMatch ? doseMatch[1] : dosePart;
  }
  if (/control/i.test(label)) return "Control";
  return label;
}

// ── Pure functions ───────────────────────────────────────

/**
 * Compute severity shift annotation for a dose assessment.
 * Returns a descriptive string or null.
 */
export function computeSeverityShift(da: RecoveryDoseAssessment): string | null {
  if (da.main.avgSeverity <= 0) return null;

  const incDelta =
    da.recovery.affected / Math.max(da.recovery.examined, 1) -
    da.main.affected / Math.max(da.main.examined, 1);
  const incUnchanged = Math.abs(incDelta) < 0.01;
  const incDecreased = incDelta < -0.01;
  const sevDelta = da.recovery.avgSeverity - da.main.avgSeverity;

  if (incUnchanged && sevDelta < -0.5) return "Severity improving";
  if (incUnchanged && sevDelta > 0.5) return "Severity progressing";
  if (incDecreased && sevDelta < 0) return "Reducing (incidence + severity)";
  if (incDecreased && sevDelta > 0.5) return "Mixed — incidence decreased but severity increased";

  return null;
}

/**
 * Map RecoveryDoseAssessments to chart rows.
 * Filters out not_observed / no_data. Sorts by doseLevel ascending.
 */
export function buildIncidenceChartRows(
  assessments: RecoveryDoseAssessment[],
): IncidenceChartRow[] {
  const rows: IncidenceChartRow[] = [];

  for (const da of assessments) {
    const doseLabel = extractCompactDose(da.doseGroupLabel);

    // Filter out non-chartable verdicts
    if (da.verdict === "not_observed" || da.verdict === "no_data") continue;

    // Edge verdicts
    if (da.verdict === "not_examined") {
      rows.push({
        assessment: da,
        doseLabel,
        terminalPct: null,
        recoveryPct: null,
        verdict: da.verdict,
        isEdge: "not_examined",
      });
      continue;
    }
    if (da.verdict === "insufficient_n") {
      rows.push({
        assessment: da,
        doseLabel,
        terminalPct: null,
        recoveryPct: null,
        verdict: da.verdict,
        isEdge: "insufficient_n",
      });
      continue;
    }
    if (da.verdict === "low_power") {
      rows.push({
        assessment: da,
        doseLabel,
        terminalPct: null,
        recoveryPct: null,
        verdict: da.verdict,
        isEdge: "low_power",
      });
      continue;
    }

    // Anomaly: values populated (0% terminal, recovery% shown)
    if (da.verdict === "anomaly") {
      rows.push({
        assessment: da,
        doseLabel,
        terminalPct: da.main.incidence * 100,
        recoveryPct: da.recovery.incidence * 100,
        verdict: da.verdict,
        isEdge: "anomaly",
      });
      continue;
    }

    // Normal verdicts
    rows.push({
      assessment: da,
      doseLabel,
      terminalPct: da.main.incidence * 100,
      recoveryPct: da.recovery.incidence * 100,
      verdict: da.verdict,
      isEdge: null,
    });
  }

  rows.sort((a, b) => a.assessment.doseLevel - b.assessment.doseLevel);
  return rows;
}

/**
 * Compute global axis bounds for incidence chart.
 * Always starts at 0. Max has 10% padding, floor 10%, cap 105%.
 */
export function computeIncidenceAxisBounds(
  chartRowsBySex: Record<string, IncidenceChartRow[]>,
  sexes: string[],
): { globalXMax: number } {
  let maxVal = 0;

  for (const s of sexes) {
    for (const cr of chartRowsBySex[s] ?? []) {
      // Edge rows excluded (not_examined, insufficient_n, low_power)
      // But anomaly rows ARE included (they have values)
      if (cr.isEdge && cr.isEdge !== "anomaly") continue;
      if (cr.terminalPct != null) maxVal = Math.max(maxVal, cr.terminalPct);
      if (cr.recoveryPct != null) maxVal = Math.max(maxVal, cr.recoveryPct);
    }
  }

  const padded = maxVal * 1.1;
  const globalXMax = Math.min(105, Math.max(10, padded));
  return { globalXMax };
}

/**
 * Format a verdict note description for a dose assessment.
 */
export function formatIncidenceNoteDesc(da: RecoveryDoseAssessment): string {
  const v = da.verdict;

  if (v === "not_examined") return "tissue not examined in recovery arm";
  if (v === "insufficient_n") return `n=${da.recovery.examined} — insufficient for comparison`;
  if (v === "low_power") return "main incidence too low for recovery N";

  const mainPct = Math.round(da.main.incidence * 100);
  const recPct = Math.round(da.recovery.incidence * 100);
  const fraction = `(${da.main.affected}/${da.main.examined} \u2192 ${da.recovery.affected}/${da.recovery.examined})`;

  if (v === "anomaly") {
    return `${mainPct}% \u2192 ${recPct}% \u2014 finding appeared in recovery ${fraction}`;
  }

  const sevShift = computeSeverityShift(da);
  const base = `${mainPct}% \u2192 ${recPct}% ${fraction}`;
  return sevShift ? `${base} \u00b7 ${sevShift}` : base;
}

// ── SVG Panel ────────────────────────────────────────────

interface IncidencePanelProps {
  chartRows: IncidenceChartRow[];
  xMax: number;
  sex: string;
  hoveredDose: number | null;
  onHoverDose: (dose: number | null) => void;
  onClickDose: (dose: number) => void;
}

function IncidenceDumbbellPanel({
  chartRows,
  xMax,
  sex,
  hoveredDose,
  onHoverDose,
  onClickDose,
}: IncidencePanelProps) {
  const chartWidth = 200;
  const marginLeft = 2;
  const marginRight = 6;
  const plotWidth = chartWidth - marginLeft - marginRight;
  const chartHeight = chartRows.length * ROW_HEIGHT + 4;

  const scale = (val: number) => {
    if (xMax === 0) return marginLeft + plotWidth / 2;
    return marginLeft + (val / xMax) * plotWidth;
  };

  const zeroX = scale(0);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Sex header */}
      <div className="text-center text-[9px] font-medium text-muted-foreground mb-0.5">
        {sex}
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="block w-full h-auto"
        preserveAspectRatio="xMinYMin meet"
        style={{ overflow: "visible" }}
      >
        {/* Zero reference line (0%) */}
        <line
          x1={zeroX}
          y1={0}
          x2={zeroX}
          y2={chartHeight}
          stroke={ZERO_LINE_COLOR}
          strokeWidth={1.5}
        />

        {/* Rows */}
        {chartRows.map((cr, i) => {
          const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2;
          const isHovered = hoveredDose === cr.assessment.doseLevel;

          // Edge: not_examined
          if (cr.isEdge === "not_examined") {
            return (
              <g key={cr.assessment.doseLevel}>
                {isHovered && (
                  <rect x={0} y={cy - ROW_HEIGHT / 2} width={chartWidth} height={ROW_HEIGHT} fill="currentColor" opacity={0.03} />
                )}
                <circle cx={zeroX} cy={cy - 4} r={3} fill="#D1D5DB" opacity={0.5} />
                <text x={zeroX + 6} y={cy - 4} fontSize={7} fill="#9CA3AF" dominantBaseline="middle">∅</text>
                <title>Not examined in recovery arm</title>
              </g>
            );
          }

          // Edge: insufficient_n
          if (cr.isEdge === "insufficient_n") {
            return (
              <g key={cr.assessment.doseLevel}>
                {isHovered && (
                  <rect x={0} y={cy - ROW_HEIGHT / 2} width={chartWidth} height={ROW_HEIGHT} fill="currentColor" opacity={0.03} />
                )}
                <circle cx={zeroX} cy={cy - 4} r={3} fill="#D1D5DB" opacity={0.5} />
                <text x={zeroX + 6} y={cy - 4} fontSize={7} fill="#9CA3AF" dominantBaseline="middle">†</text>
                <title>n={cr.assessment.recovery.examined} — insufficient for comparison</title>
              </g>
            );
          }

          // Edge: low_power
          if (cr.isEdge === "low_power") {
            return (
              <g key={cr.assessment.doseLevel}>
                {isHovered && (
                  <rect x={0} y={cy - ROW_HEIGHT / 2} width={chartWidth} height={ROW_HEIGHT} fill="currentColor" opacity={0.03} />
                )}
                <circle cx={zeroX} cy={cy - 4} r={3} fill="#D1D5DB" opacity={0.5} />
                <text x={zeroX + 6} y={cy - 4} fontSize={7} fill="#9CA3AF" dominantBaseline="middle">~</text>
                <title>Main incidence too low for recovery N</title>
              </g>
            );
          }

          // Anomaly: amber connector
          if (cr.isEdge === "anomaly") {
            const tx = scale(cr.terminalPct ?? 0);
            const rx = scale(cr.recoveryPct ?? 0);
            const arrowDir = rx > tx ? 1 : -1;

            return (
              <g
                key={cr.assessment.doseLevel}
                onMouseEnter={() => onHoverDose(cr.assessment.doseLevel)}
                onMouseLeave={() => onHoverDose(null)}
                onClick={() => onClickDose(cr.assessment.doseLevel)}
                className="cursor-pointer"
              >
                {isHovered && (
                  <rect x={0} y={cy - ROW_HEIGHT / 2} width={chartWidth} height={ROW_HEIGHT} fill="currentColor" opacity={0.03} />
                )}
                {/* Amber connector */}
                <line x1={tx} y1={cy - 4} x2={rx} y2={cy - 4} stroke="#D97706" strokeWidth={0.75} opacity={0.8} />
                {/* Warning glyph at terminal */}
                <text x={tx} y={cy - 4} fontSize={7} fill="#D97706" dominantBaseline="middle" textAnchor="middle">⚠</text>
                {/* Recovery dot */}
                <circle cx={rx} cy={cy - 4} r={DOT_R} fill="#D97706" opacity={0.8} />
                {/* Arrow */}
                <polygon
                  points={
                    arrowDir > 0
                      ? `${rx - ARROW_SIZE},${cy - 4 - ARROW_SIZE / 2} ${rx},${cy - 4} ${rx - ARROW_SIZE},${cy - 4 + ARROW_SIZE / 2}`
                      : `${rx + ARROW_SIZE},${cy - 4 - ARROW_SIZE / 2} ${rx},${cy - 4} ${rx + ARROW_SIZE},${cy - 4 + ARROW_SIZE / 2}`
                  }
                  fill="#D97706"
                  opacity={0.8}
                />
                <title>Anomaly — finding appeared in recovery</title>
              </g>
            );
          }

          // Normal row
          const tx = scale(cr.terminalPct ?? 0);
          const rx = scale(cr.recoveryPct ?? 0);
          const arrowDir = rx < tx ? -1 : 1;

          const tooltipText = `${INCIDENCE_VERDICT_LABEL[cr.verdict]}: ${formatIncidenceNoteDesc(cr.assessment)}`;

          return (
            <g
              key={cr.assessment.doseLevel}
              onMouseEnter={() => onHoverDose(cr.assessment.doseLevel)}
              onMouseLeave={() => onHoverDose(null)}
              onClick={() => onClickDose(cr.assessment.doseLevel)}
              className="cursor-pointer"
            >
              {/* Row hover highlight */}
              {isHovered && (
                <rect x={0} y={cy - ROW_HEIGHT / 2} width={chartWidth} height={ROW_HEIGHT} fill="currentColor" opacity={0.03} />
              )}

              {/* Invisible wider hit area */}
              <line x1={tx} y1={cy - 4} x2={rx} y2={cy - 4} stroke="transparent" strokeWidth={8} />

              {/* Connector line: terminal → recovery */}
              <line x1={tx} y1={cy - 4} x2={rx} y2={cy - 4} stroke={CONNECTOR_COLOR} strokeWidth={0.75} opacity={0.8} />

              {/* Terminal dot (filled) */}
              <circle cx={tx} cy={cy - 4} r={DOT_R} fill={CONNECTOR_COLOR} />

              {/* Vertical pipe at recovery */}
              <line x1={rx} y1={cy - 4 - DOT_R} x2={rx} y2={cy - 4 + DOT_R} stroke={CONNECTOR_COLOR} strokeWidth={1.5} opacity={0.8} />

              {/* Arrow tip at recovery end */}
              <polygon
                points={
                  arrowDir > 0
                    ? `${rx - ARROW_SIZE},${cy - 4 - ARROW_SIZE / 2} ${rx},${cy - 4} ${rx - ARROW_SIZE},${cy - 4 + ARROW_SIZE / 2}`
                    : `${rx + ARROW_SIZE},${cy - 4 - ARROW_SIZE / 2} ${rx},${cy - 4} ${rx + ARROW_SIZE},${cy - 4 + ARROW_SIZE / 2}`
                }
                fill={CONNECTOR_COLOR}
                opacity={0.8}
              />

              <title>{tooltipText}</title>
            </g>
          );
        })}
      </svg>

      {/* Axis labels below panel */}
      <div className="relative h-3">
        <span
          className="absolute text-[9px] text-muted-foreground/50 leading-none whitespace-nowrap"
          style={{ left: `${(zeroX / chartWidth) * 100}%`, transform: "translateX(-50%)" }}
        >
          0%
        </span>
        <span
          className="absolute text-[9px] text-muted-foreground/50 leading-none whitespace-nowrap"
          style={{ left: `${(scale(xMax) / chartWidth) * 100}%`, transform: "translateX(-50%)" }}
        >
          {Math.round(xMax)}%
        </span>
      </div>

      {/* Verdict notes per dose row */}
      <div className="space-y-0 mt-2">
        {chartRows.map((cr) => {
          // Edge cases
          if (cr.isEdge === "not_examined" || cr.isEdge === "insufficient_n" || cr.isEdge === "low_power") {
            return (
              <div key={cr.assessment.doseLevel} className="text-[9px] leading-relaxed">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-[4px] h-[4px] rounded-full shrink-0"
                    style={{ backgroundColor: getDoseGroupColor(cr.assessment.doseLevel) }}
                    title={cr.doseLabel}
                  />
                  <span className="text-muted-foreground/60">
                    {formatIncidenceNoteDesc(cr.assessment)}
                  </span>
                </span>
              </div>
            );
          }

          const desc = formatIncidenceNoteDesc(cr.assessment);
          return (
            <div key={cr.assessment.doseLevel} className="text-[9px] leading-relaxed">
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-[4px] h-[4px] rounded-full shrink-0"
                  style={{ backgroundColor: getDoseGroupColor(cr.assessment.doseLevel) }}
                  title={cr.doseLabel}
                />
                <span className={`inline-block w-[70px] shrink-0 ${INCIDENCE_VERDICT_CLASS[cr.verdict]}`}>
                  {INCIDENCE_VERDICT_LABEL[cr.verdict]}:
                </span>
                <span className="text-muted-foreground">{desc}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────

export function IncidenceDumbbellChart({
  assessmentsBySex,
  recoveryDays,
  onDoseClick,
}: IncidenceDumbbellChartProps) {
  const [hoveredDose, setHoveredDose] = useState<number | null>(null);

  // F before M
  const sexes = useMemo(
    () => Object.keys(assessmentsBySex).sort(),
    [assessmentsBySex],
  );

  const chartRowsBySex = useMemo(() => {
    const map: Record<string, IncidenceChartRow[]> = {};
    for (const s of sexes) {
      map[s] = buildIncidenceChartRows(assessmentsBySex[s] ?? []);
    }
    return map;
  }, [assessmentsBySex, sexes]);

  // Filter out sexes with no chartable rows
  const activeSexes = useMemo(
    () => sexes.filter((s) => (chartRowsBySex[s] ?? []).length > 0),
    [sexes, chartRowsBySex],
  );

  const { globalXMax } = useMemo(
    () => computeIncidenceAxisBounds(chartRowsBySex, activeSexes),
    [chartRowsBySex, activeSexes],
  );

  const handleDoseClick = useCallback(
    (dose: number) => { onDoseClick?.(dose); },
    [onDoseClick],
  );

  // Early return if no data
  if (activeSexes.length === 0) return null;

  // Dose labels from first active sex
  const primaryRows = chartRowsBySex[activeSexes[0]] ?? [];

  return (
    <div className="space-y-1">
      {/* Legend */}
      <div className="text-[9px] text-muted-foreground/60 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <svg width="8" height="8" viewBox="0 0 8 8">
            <circle cx="4" cy="4" r="2.5" fill="#94A3B8" />
          </svg>
          Terminal (main arm)
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="4" height="8" viewBox="0 0 4 8">
            <line x1="2" y1="1" x2="2" y2="7" stroke="#94A3B8" strokeWidth="1.5" />
          </svg>
          Recovery arm
          {recoveryDays != null && ` (${recoveryDays}d)`}
        </span>
      </div>

      {/* Chart area: dose labels + panels */}
      <div className="flex gap-1.5">
        {/* Shared dose labels column */}
        <div className="w-[60px] shrink-0 flex flex-col pt-[14px]">
          {primaryRows.map((cr) => (
            <div
              key={cr.assessment.doseLevel}
              className="flex items-center justify-end"
              style={{ height: ROW_HEIGHT }}
            >
              <DoseLabel
                level={cr.assessment.doseLevel}
                label={cr.doseLabel}
                tooltip={cr.assessment.doseGroupLabel}
                align="right"
                className="text-[9px]"
              />
            </div>
          ))}
        </div>

        {/* Panels */}
        {activeSexes.map((sex, idx) => {
          const sRows = chartRowsBySex[sex] ?? [];
          return (
            <div key={sex} className="contents">
              {idx > 0 && <div className="w-px bg-border/30" />}
              <IncidenceDumbbellPanel
                chartRows={sRows}
                xMax={globalXMax}
                sex={sex}
                hoveredDose={hoveredDose}
                onHoverDose={setHoveredDose}
                onClickDose={handleDoseClick}
              />
            </div>
          );
        })}
        {/* Half-width spacer for single-sex */}
        {activeSexes.length === 1 && <div className="flex-1 min-w-0" />}
      </div>
    </div>
  );
}
