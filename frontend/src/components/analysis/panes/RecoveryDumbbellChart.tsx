/**
 * Recovery Dumbbell Chart — side-by-side F/M panels showing
 * terminal → recovery effect size trajectories per dose group.
 *
 * Renders as inline SVG within the RecoveryPane context panel.
 * Toolbar: show peak, show CI, sync axes, sort.
 * Footer: J-T trend, power note.
 */
import { useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import type { DoseGroup } from "@/types/analysis";
import {
  classifyContinuousRecovery,
  CONT_VERDICT_LABEL,
  formatGAbs,
  formatPctRecovered,
} from "@/lib/recovery-verdict";
import type { ContinuousVerdictType } from "@/lib/recovery-verdict";
import { getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { useStatMethods } from "@/hooks/useStatMethods";
import { DoseLabel } from "@/components/ui/DoseLabel";
import { getDoseGroupColor } from "@/lib/severity-colors";

// ── Types ────────────────────────────────────────────────

type RecoveryRow = RecoveryComparisonResponse["rows"][number];



interface RecoveryDumbbellChartProps {
  rows: RecoveryRow[];
  doseGroups?: DoseGroup[];
  terminalDay?: number | null;
  recoveryDay?: number | null;
  /** When a dose row is clicked, emit the dose_level for scroll-to-text. */
  onDoseClick?: (doseLevel: number) => void;
}

const CONT_VERDICT_CLASS: Record<ContinuousVerdictType, string> = {
  resolved: "text-foreground",
  reversed: "text-foreground",
  overcorrected: "text-foreground italic",
  reversing: "text-foreground",
  partial: "text-muted-foreground",
  persistent: "text-foreground font-semibold",
  worsening: "text-foreground font-semibold",
  not_assessed: "text-muted-foreground",
};

function formatPCompact(p: number): string {
  if (p < 0.001) return "<0.001";
  return p.toFixed(3);
}

export function formatVerdictDesc(
  terminalG: number | null,
  recoveryG: number | null,
  pctRecovered: number | null,
  pValue: number | null,
  effectSymbol: string,
): string {
  // Null recovery with non-null terminal — recovery data not available
  if (recoveryG == null && terminalG != null && Math.abs(terminalG) >= 0.01) {
    return `recovery data not available (terminal |${effectSymbol}|\u2009=\u2009${formatGAbs(terminalG)})`;
  }

  const pStr = pValue != null ? `, p\u2009=\u2009${formatPCompact(pValue)}` : "";

  if (terminalG == null || Math.abs(terminalG) < 0.01) {
    if (recoveryG != null && Math.abs(recoveryG) >= 0.5) {
      return `delayed onset (|${effectSymbol}|\u2009=\u2009${formatGAbs(recoveryG)}${pStr})`;
    }
    return `no meaningful effect at either timepoint`;
  }

  const gTrajectory = `${formatGAbs(terminalG)}${effectSymbol} \u2192 ${formatGAbs(recoveryG ?? 0)}${effectSymbol}`;
  const rG = Math.abs(recoveryG ?? 0);
  const tG = Math.abs(terminalG);
  const dir = rG <= tG ? "\u2193" : "\u2191";

  if (pctRecovered != null) {
    if (Math.abs(pctRecovered) > 999) {
      return `${dir}\u2009>10\u00d7 (${gTrajectory}${pStr})`;
    }
    return `${dir}\u2009${formatPctRecovered(pctRecovered)} (${gTrajectory}${pStr})`;
  }

  // Worsening without pctRecovered
  const ratio = tG > 0.01 ? (rG / tG).toFixed(1) : null;
  return ratio ? `${dir}\u2009${ratio}\u00d7 (${gTrajectory}${pStr})` : `${dir} (${gTrajectory}${pStr})`;
}

// ── Constants ────────────────────────────────────────────

const ROW_HEIGHT = 22;
const DOT_R = 2.5;
const ARROW_SIZE = 5;
const CONNECTOR_COLOR = "#94A3B8"; // slate-400
const ZERO_LINE_COLOR = "#CBD5E1"; // slate-300


// ── Helpers ──────────────────────────────────────────────

/** Connector visual tier by p-value. Weight encodes significance — no dashes. */
export function connectorStyle(p: number | null): {
  opacity: number;
  width: number;
} {
  if (p == null) return { opacity: 0.7, width: 0.5 };
  if (p < 0.05) return { opacity: 1.0, width: 1.5 };
  if (p < 0.10) return { opacity: 0.8, width: 1 };
  return { opacity: 0.7, width: 0.5 };
}

/** Check if a row qualifies for peak marker. */
export function hasPeakQualifier(row: RecoveryRow): boolean {
  return (
    row.peak_effect != null &&
    row.terminal_effect != null &&
    Math.abs(row.peak_effect) > Math.abs(row.terminal_effect) * 1.5 &&
    Math.abs(row.peak_effect) > 1.0 &&
    Math.abs(row.terminal_effect) >= 0.5
  );
}

// ── Processed row for rendering ──────────────────────────

export interface ChartRow {
  row: RecoveryRow;
  doseLabel: string;
  verdict: ContinuousVerdictType;
  confidence?: "adequate" | "low";
  terminalVal: number | null; // |g| at terminal (always ≥ 0)
  recoveryVal: number | null; // |g| at recovery; negative when overcorrected (crossed control)
  peakVal: number | null;     // |g| at peak (always ≥ 0)
  isEdge: "insufficient_n" | "no_concurrent_control" | null;
}

export function buildChartRows(
  rows: RecoveryRow[],
  doseGroups: DoseGroup[] | undefined,
): ChartRow[] {
  const result: ChartRow[] = rows.map((row) => {
    const dg = doseGroups?.find((g) => g.dose_level === row.dose_level);
    const doseLabel =
      dg && dg.dose_value != null && dg.dose_value > 0
        ? `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim()
        : `Dose ${row.dose_level}`;

    // Edge cases
    if (row.insufficient_n) {
      return {
        row,
        doseLabel,
        verdict: "not_assessed" as ContinuousVerdictType,
        terminalVal: null,
        recoveryVal: null,
        peakVal: null,
        isEdge: "insufficient_n",
      };
    }
    if (row.no_concurrent_control) {
      return {
        row,
        doseLabel,
        verdict: "not_assessed" as ContinuousVerdictType,
        terminalVal: null,
        recoveryVal: null,
        peakVal: null,
        isEdge: "no_concurrent_control",
      };
    }

    const v = classifyContinuousRecovery(row.terminal_effect, row.effect_size, row.treated_n, row.control_n);

    // Chart plots |g|. Overcorrected recovery crosses zero (negative) to show
    // the effect reversed past control. All other values are absolute.
    const isOvercorrected = v.verdict === "overcorrected";

    return {
      row,
      doseLabel,
      verdict: v.verdict,
      confidence: v.confidence,
      terminalVal: row.terminal_effect != null ? Math.abs(row.terminal_effect) : null,
      recoveryVal: row.effect_size != null
        ? (isOvercorrected ? -Math.abs(row.effect_size) : Math.abs(row.effect_size))
        : null,
      peakVal: row.peak_effect != null ? Math.abs(row.peak_effect) : null,
      isEdge: null,
    };
  });

  result.sort((a, b) => a.row.dose_level - b.row.dose_level);

  return result;
}

// ── SVG Panel ────────────────────────────────────────────

interface PanelProps {
  chartRows: ChartRow[];
  xMax: number;
  xMin: number;
  sex: string;
  effectSymbol: string;
  terminalDay: number | null;
  hoveredDose: number | null;
  onHoverDose: (dose: number | null) => void;
  onClickDose: (dose: number) => void;
}

const LARGE_EFFECT_THRESHOLD = 0.8;
const LARGE_EFFECT_COLOR = "#7C3AED"; // violet-600

function DumbbellPanel({
  chartRows,
  xMax,
  xMin,
  sex,
  effectSymbol,
  terminalDay,
  hoveredDose,
  onHoverDose,
  onClickDose,
}: PanelProps) {
  const [containerRef, chartWidth] = useContainerWidth();
  const marginLeft = 2;
  const marginRight = 6;
  const plotWidth = chartWidth - marginLeft - marginRight;
  const chartHeight = chartRows.length * ROW_HEIGHT + 4;

  // Scale: value → x position
  const range = xMax - xMin;
  const scale = (val: number) => {
    if (range === 0) return marginLeft + plotWidth / 2;
    return marginLeft + ((val - xMin) / range) * plotWidth;
  };

  const zeroX = scale(0);

  // +0.8 threshold (always shown when in range)
  const thresholdX = scale(LARGE_EFFECT_THRESHOLD);
  const showThresholdLine = LARGE_EFFECT_THRESHOLD >= xMin && LARGE_EFFECT_THRESHOLD <= xMax;

  // -0.8 mirror threshold — only when overcorrection is present in this panel
  const hasOvercorrection = chartRows.some(cr => !cr.isEdge && cr.recoveryVal != null && cr.recoveryVal < 0);
  const negThresholdX = scale(-LARGE_EFFECT_THRESHOLD);
  const showNegThresholdLine = hasOvercorrection && -LARGE_EFFECT_THRESHOLD >= xMin && -LARGE_EFFECT_THRESHOLD <= xMax;

  const MIN_LINE_DIST = 8; // px in viewBox units — suppress marker lines too close to references

  return (
    <div ref={containerRef} className="flex-1 min-w-0 flex flex-col">
      {/* Sex header */}
      <div className="text-center text-[9px] font-medium text-muted-foreground mb-0.5">
        {sex}
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="block w-full"
        style={{ height: chartHeight, overflow: "visible" }}
      >
        {/* Zero reference line (control) */}
        <line
          x1={zeroX}
          y1={0}
          x2={zeroX}
          y2={chartHeight}
          stroke={ZERO_LINE_COLOR}
          strokeWidth={1.5}
        />

        {/* Large effect threshold line (+0.8) */}
        {showThresholdLine && (
          <line
            x1={thresholdX}
            y1={0}
            x2={thresholdX}
            y2={chartHeight}
            stroke={LARGE_EFFECT_COLOR}
            strokeWidth={0.75}
            strokeDasharray="3,3"
            opacity={0.4}
          />
        )}

        {/* Mirror threshold line (-0.8) — only when overcorrection present */}
        {showNegThresholdLine && (
          <line
            x1={negThresholdX}
            y1={0}
            x2={negThresholdX}
            y2={chartHeight}
            stroke={LARGE_EFFECT_COLOR}
            strokeWidth={0.75}
            strokeDasharray="3,3"
            opacity={0.4}
          />
        )}

        {/* Rows */}
        {chartRows.map((cr, i) => {
          const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2;
          const isHovered = hoveredDose === cr.row.dose_level;

          // Edge case: insufficient_n
          if (cr.isEdge === "insufficient_n") {
            return (
              <g key={cr.row.dose_level}>
                {isHovered && (
                  <rect
                    x={0}
                    y={cy - ROW_HEIGHT / 2}
                    width={chartWidth}
                    height={ROW_HEIGHT}
                    fill="currentColor"
                    opacity={0.03}
                  />
                )}
                <circle
                  cx={zeroX}
                  cy={cy - 4}
                  r={3}
                  fill="#D1D5DB"
                  opacity={0.5}
                >
                  <title>n={cr.row.treated_n ?? 1} — insufficient for classification</title>
                </circle>
              </g>
            );
          }

          // Edge case: no_concurrent_control
          if (cr.isEdge === "no_concurrent_control") {
            return (
              <g key={cr.row.dose_level}>
                {isHovered && (
                  <rect
                    x={0}
                    y={cy - ROW_HEIGHT / 2}
                    width={chartWidth}
                    height={ROW_HEIGHT}
                    fill="currentColor"
                    opacity={0.03}
                  />
                )}
                <text
                  x={zeroX}
                  y={cy - 4}
                  fontSize={8}
                  fill="#D97706"
                  dominantBaseline="middle"
                  textAnchor="middle"
                >
                  ⚠
                </text>
              </g>
            );
          }

          // Normal row
          const tVal = cr.terminalVal ?? 0;
          const rVal = cr.recoveryVal ?? 0;
          const tx = scale(tVal);
          const rx = scale(rVal);
          const cs = connectorStyle(cr.row.p_value);
          const isLowConf = cr.confidence === "low";
          const recovering = Math.abs(rVal) < Math.abs(tVal); // effect magnitude shrinking = recovering
          const arrowDir = rx < tx ? -1 : 1; // arrow points in direction of recovery position

          // Terminal → recovery tooltip
          const verdictStr = CONT_VERDICT_LABEL[cr.verdict];
          const deltaDir = recovering ? "dropped" : "grew";
          const v = classifyContinuousRecovery(cr.row.terminal_effect, cr.row.effect_size);
          const pctStr = v.pctRecovered != null ? formatPctRecovered(v.pctRecovered) : "";
          const recoveryTooltip = `${verdictStr} · Δ ${deltaDir} ${pctStr} (${effectSymbol}: ${formatGAbs(cr.row.terminal_effect ?? 0)} → ${formatGAbs(cr.row.effect_size ?? 0)})`;

          // Peak trajectory tooltip
          const showPeak = cr.peakVal != null && hasPeakQualifier(cr.row);
          let peakTooltip = "";
          if (showPeak) {
            const peakG = Math.abs(cr.row.peak_effect!);
            const termG = Math.abs(cr.row.terminal_effect ?? 0);
            const recG = Math.abs(cr.row.effect_size ?? 0);
            const pDay = cr.row.peak_day ?? "?";
            const tDay = cr.row.terminal_day ?? "?";
            const rDay = cr.row.recovery_day ?? "?";
            const pctDosing = peakG > 0.01 ? Math.round(((peakG - termG) / peakG) * 100) : 0;
            const pctRecovery = peakG > 0.01 ? Math.round(((termG - recG) / peakG) * 100) : 0;
            const recDir = recG <= termG ? "resolved" : "worsened";
            peakTooltip =
              `Peak (D${pDay}): ${formatGAbs(peakG)}${effectSymbol} → ` +
              `Terminal (D${tDay}): ${formatGAbs(termG)}${effectSymbol} → ` +
              `Recovery (D${rDay}): ${formatGAbs(recG)}${effectSymbol}\n` +
              `╰── ${pctDosing}% resolved during dosing ─╯ ╰── ${Math.abs(pctRecovery)}% ${recDir} during recovery ─╯`;
          }

          // Marker lines: thin verticals at terminal, recovery, peak positions
          // Suppressed when too close to zero or |g|=0.8 reference lines
          const isTooClose = (px: number) =>
            Math.abs(px - zeroX) < MIN_LINE_DIST ||
            (showThresholdLine && Math.abs(px - thresholdX) < MIN_LINE_DIST) ||
            (showNegThresholdLine && Math.abs(px - negThresholdX) < MIN_LINE_DIST);
          const markerLines: { x: number; color: string }[] = [];
          if (!isTooClose(tx)) markerLines.push({ x: tx, color: CONNECTOR_COLOR });
          if (!isTooClose(rx)) markerLines.push({ x: rx, color: CONNECTOR_COLOR });
          if (showPeak) {
            const px = scale(cr.peakVal!);
            if (!isTooClose(px)) markerLines.push({ x: px, color: "#D97706" });
          }

          return (
            <g
              key={cr.row.dose_level}
              onMouseEnter={() => onHoverDose(cr.row.dose_level)}
              onMouseLeave={() => onHoverDose(null)}
              onClick={() => onClickDose(cr.row.dose_level)}
              className="cursor-pointer"
            >
              {/* Row hover highlight */}
              {isHovered && (
                <rect
                  x={0}
                  y={cy - ROW_HEIGHT / 2}
                  width={chartWidth}
                  height={ROW_HEIGHT}
                  fill="currentColor"
                  opacity={0.03}
                />
              )}

              {/* Per-row marker lines at terminal/recovery/peak positions */}
              {markerLines.map((ml, mi) => (
                <line
                  key={mi}
                  x1={ml.x}
                  y1={cy - ROW_HEIGHT / 2}
                  x2={ml.x}
                  y2={cy + ROW_HEIGHT / 2}
                  stroke={ml.color}
                  strokeWidth={0.5}
                  opacity={0.15}
                />
              ))}

              {/* Peak group — separate tooltip */}
              {showPeak && (
                <g>
                  <title>{peakTooltip}</title>
                  {/* Invisible wider hit area for dotted line */}
                  <line
                    x1={scale(cr.peakVal!)}
                    y1={cy - 4}
                    x2={tx}
                    y2={cy - 4}
                    stroke="transparent"
                    strokeWidth={8}
                  />
                  {/* Dotted connector from peak to terminal */}
                  <line
                    x1={scale(cr.peakVal!)}
                    y1={cy - 4}
                    x2={tx}
                    y2={cy - 4}
                    stroke="#D97706"
                    strokeWidth={0.5}
                    strokeDasharray="2,3"
                    opacity={0.4}
                  />
                  {/* Triangle marker — amber outline, no fill */}
                  <polygon
                    points={`${scale(cr.peakVal!)},${cy - 4 - 3.5} ${scale(cr.peakVal!) - 3},${cy - 4 + 2} ${scale(cr.peakVal!) + 3},${cy - 4 + 2}`}
                    fill="none"
                    stroke="#D97706"
                    strokeWidth={1}
                    opacity={0.6}
                  />
                </g>
              )}

              {/* Terminal → Recovery group — separate tooltip */}
              <g>
                <title>{recoveryTooltip}</title>
                {/* Invisible wider hit area for connector line */}
                <line
                  x1={tx}
                  y1={cy - 4}
                  x2={rx}
                  y2={cy - 4}
                  stroke="transparent"
                  strokeWidth={8}
                />
                {/* Connector line: terminal → recovery */}
                <line
                  x1={tx}
                  y1={cy - 4}
                  x2={rx}
                  y2={cy - 4}
                  stroke={CONNECTOR_COLOR}
                  strokeWidth={cs.width}
                  opacity={cs.opacity}
                  {...(isLowConf ? { strokeDasharray: "3,2" } : {})}
                />

                {/* Terminal dot (filled) */}
                <circle
                  cx={tx}
                  cy={cy - 4}
                  r={DOT_R}
                  fill={CONNECTOR_COLOR}
                />

                {/* Vertical pipe at recovery g value */}
                <line
                  x1={rx}
                  y1={cy - 4 - DOT_R}
                  x2={rx}
                  y2={cy - 4 + DOT_R}
                  stroke={CONNECTOR_COLOR}
                  strokeWidth={1.5}
                  opacity={cs.opacity}
                />

                {/* Arrow tip at recovery end */}
                <polygon
                  points={
                    arrowDir > 0
                      ? `${rx - ARROW_SIZE},${cy - 4 - ARROW_SIZE / 2} ${rx},${cy - 4} ${rx - ARROW_SIZE},${cy - 4 + ARROW_SIZE / 2}`
                      : `${rx + ARROW_SIZE},${cy - 4 - ARROW_SIZE / 2} ${rx},${cy - 4} ${rx + ARROW_SIZE},${cy - 4 + ARROW_SIZE / 2}`
                  }
                  fill={CONNECTOR_COLOR}
                  opacity={cs.opacity}
                />
              </g>

            </g>
          );
        })}

      </svg>

      {/* HTML labels below chart — CSS pixels, not SVG viewBox units */}
      <div className="relative h-3">
        {showNegThresholdLine && (
          <span
            className="absolute text-[9px] leading-none whitespace-nowrap"
            style={{
              left: `${(negThresholdX / chartWidth) * 100}%`,
              transform: "translateX(-100%)",
              color: LARGE_EFFECT_COLOR,
              opacity: 0.6,
            }}
          >
            −0.8
          </span>
        )}
        <span
          className="absolute text-[9px] text-muted-foreground/50 leading-none whitespace-nowrap"
          style={{
            left: `${(zeroX / chartWidth) * 100}%`,
            transform: "translateX(-100%)",
          }}
          title={terminalDay != null ? `Control at terminal D${terminalDay}` : "Control"}
        >
          C{terminalDay != null ? `: D${terminalDay}` : ""}
        </span>
        {showThresholdLine && (
          <span
            className="absolute text-[9px] leading-none whitespace-nowrap"
            style={{
              left: `${(thresholdX / chartWidth) * 100}%`,
              color: LARGE_EFFECT_COLOR,
              opacity: 0.6,
            }}
          >
            0.8
          </span>
        )}
      </div>

      {/* Verdict notes per dose row */}
      <div className="space-y-0 mt-2">
        {chartRows.map((cr) => {
          if (cr.isEdge === "insufficient_n") {
            return (
              <div key={cr.row.dose_level} className="text-[9px] leading-relaxed">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-[4px] h-[4px] rounded-full shrink-0"
                    style={{ backgroundColor: getDoseGroupColor(cr.row.dose_level) }}
                    title={cr.doseLabel}
                  />
                  <span className="text-muted-foreground/60">
                    n={cr.row.treated_n ?? 1} — insufficient
                  </span>
                </span>
              </div>
            );
          }
          if (cr.isEdge === "no_concurrent_control") {
            return (
              <div key={cr.row.dose_level} className="text-[9px] leading-relaxed">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-[4px] h-[4px] rounded-full shrink-0"
                    style={{ backgroundColor: getDoseGroupColor(cr.row.dose_level) }}
                    title={cr.doseLabel}
                  />
                  <span className="text-muted-foreground">no concurrent control</span>
                </span>
              </div>
            );
          }
          const v = classifyContinuousRecovery(cr.row.terminal_effect, cr.row.effect_size, cr.row.treated_n, cr.row.control_n);

          // Both below trivial threshold — no meaningful effect
          const tAbs = cr.row.terminal_effect != null ? Math.abs(cr.row.terminal_effect) : 0;
          const rAbs = cr.row.effect_size != null ? Math.abs(cr.row.effect_size) : 0;
          if (tAbs < 0.5 && rAbs < 0.5) {
            return (
              <div key={cr.row.dose_level} className="text-[9px] leading-relaxed">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-[4px] h-[4px] rounded-full shrink-0"
                    style={{ backgroundColor: getDoseGroupColor(cr.row.dose_level) }}
                    title={cr.doseLabel}
                  />
                  <span className="text-muted-foreground/60">
                    No meaningful effect at either timepoint (|{effectSymbol}|&lt;0.5)
                  </span>
                </span>
              </div>
            );
          }

          const desc = formatVerdictDesc(cr.row.terminal_effect, cr.row.effect_size, v.pctRecovered, cr.row.p_value, effectSymbol);
          return (
            <div key={cr.row.dose_level} className="text-[9px] leading-relaxed">
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-[4px] h-[4px] rounded-full shrink-0"
                  style={{ backgroundColor: getDoseGroupColor(cr.row.dose_level) }}
                  title={cr.doseLabel}
                />
                <span className={`inline-block w-[70px] shrink-0 ${CONT_VERDICT_CLASS[cr.verdict]}`}>
                  {CONT_VERDICT_LABEL[cr.verdict]}{cr.confidence === "low" ? " *" : ""}:
                </span>
                <span className="text-muted-foreground">{desc}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* §4.3: Control group drift warning — text note when control shifted >15% */}
      {(() => {
        const withCtrl = chartRows.filter(
          (cr) =>
            !cr.isEdge &&
            cr.row.control_mean_terminal != null &&
            cr.row.control_mean != null &&
            Math.abs(cr.row.control_mean_terminal!) > 0.001,
        );
        if (withCtrl.length === 0) return null;
        const row0 = withCtrl[0].row;
        const ctrlTerminal = row0.control_mean_terminal!;
        const ctrlRecovery = row0.control_mean!;
        const driftPct = Math.abs(ctrlRecovery - ctrlTerminal) / Math.abs(ctrlTerminal) * 100;
        if (driftPct <= 15) return null;
        return (
          <div className="text-[9px] text-muted-foreground/70 mt-1">
            Control group shifted {Math.round(driftPct)}% between terminal and recovery
            ({ctrlTerminal.toFixed(2)} {"\u2192"} {ctrlRecovery.toFixed(2)}).
            Interpretation may be affected.
          </div>
        );
      })()}

    </div>
  );
}

// ── Axis scaling ─────────────────────────────────────────

/** Compute global xMax and per-sex xMin for the dumbbell chart axis. */
export function computeAxisBounds(
  chartRowsBySex: Record<string, ChartRow[]>,
  sexes: string[],
): { globalXMax: number; xMinBySex: Record<string, number> } {
  let mx = 0;
  const mins: Record<string, number> = {};
  for (const s of sexes) {
    let mn = 0;
    for (const cr of chartRowsBySex[s] ?? []) {
      if (cr.isEdge) continue;
      const vals = [cr.terminalVal, cr.recoveryVal];
      if (cr.peakVal != null && hasPeakQualifier(cr.row)) {
        vals.push(cr.peakVal);
      }
      for (const v of vals) {
        if (v != null) {
          mn = Math.min(mn, v);
          mx = Math.max(mx, v);
        }
      }
    }
    mins[s] = mn;
  }
  const pad = mx * 0.1 || 0.5;
  return {
    globalXMax: mx + pad,
    xMinBySex: Object.fromEntries(
      Object.entries(mins).map(([s, mn]) => {
        const negPad = mn < 0 ? Math.abs(mn) * 0.1 || 0.1 : 0;
        return [s, mn - negPad];
      }),
    ),
  };
}

// ── Main component ───────────────────────────────────────

export function RecoveryDumbbellChart({
  rows,
  doseGroups,
  terminalDay,
  recoveryDay,
  onDoseClick,
}: RecoveryDumbbellChartProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { effectSize } = useStatMethods(studyId);
  const effectSymbol = getEffectSizeSymbol(effectSize);

  const [hoveredDose, setHoveredDose] = useState<number | null>(null);

  // Split rows by sex (F before M)
  const sexes = useMemo(() => [...new Set(rows.map((r) => r.sex))].sort(), [rows]);

  const rowsBySex = useMemo(() => {
    const map: Record<string, RecoveryRow[]> = {};
    for (const s of sexes) {
      map[s] = rows.filter((r) => r.sex === s);
    }
    return map;
  }, [rows, sexes]);

  const chartRowsBySex = useMemo(() => {
    const map: Record<string, ChartRow[]> = {};
    for (const s of sexes) {
      map[s] = buildChartRows(rowsBySex[s], doseGroups);
    }
    return map;
  }, [rowsBySex, sexes, doseGroups]);

  // Global xMax (shared scale for F vs M comparison on the positive/effect side).
  // Per-sex xMin: only extend left of zero when that panel has overcorrection.
  const { globalXMax, xMinBySex } = useMemo(
    () => computeAxisBounds(chartRowsBySex, sexes),
    [chartRowsBySex, sexes],
  );

  // Dose labels (shared column from F or first sex)
  const primarySex = sexes[0] ?? "F";
  const primaryRows = chartRowsBySex[primarySex] ?? [];

  const handleDoseClick = useCallback(
    (dose: number) => {
      onDoseClick?.(dose);
    },
    [onDoseClick],
  );

  if (sexes.length === 0 || primaryRows.length === 0) return null;

  const tDay = terminalDay ?? rows[0]?.terminal_day;
  const rDay = recoveryDay ?? rows[0]?.recovery_day;

  return (
    <div className="space-y-1">
      {/* Legend */}
      <div className="text-[9px] text-muted-foreground/60 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <svg width="8" height="8" viewBox="0 0 8 8">
            <circle cx="4" cy="4" r="2.5" fill="#94A3B8" />
          </svg>
          Terminal{tDay != null ? ` (D${tDay})` : ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="4" height="8" viewBox="0 0 4 8">
            <line x1="2" y1="1" x2="2" y2="7" stroke="#94A3B8" strokeWidth="1.5" />
          </svg>
          Recovery{rDay != null ? ` (D${rDay})` : ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="8" height="8" viewBox="0 0 8 8">
            <polygon points="4,1 1,7 7,7" fill="none" stroke="#D97706" strokeWidth="1" />
          </svg>
          Peak
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="16" height="4" viewBox="0 0 16 4"><line x1="0" y1="2" x2="16" y2="2" stroke="#94A3B8" strokeWidth="1.5" /></svg>
          p&lt;0.05
        </span>
        <span className="inline-flex items-center gap-1" title="Recovery cohorts typically have smaller group sizes (n=5–10). Non-significant p-values do not rule out biologically meaningful effects.">
          <svg width="16" height="4" viewBox="0 0 16 4"><line x1="0" y1="2" x2="16" y2="2" stroke="#94A3B8" strokeWidth="0.5" opacity="0.7" /></svg>
          p≥0.05 <span className="text-muted-foreground">*</span>
        </span>
      </div>

      {/* Chart area: dose labels + panels */}
      <div className="flex gap-1.5">
        {/* Shared dose labels column */}
        <div className="w-[60px] shrink-0 flex flex-col pt-[14px]">
          {primaryRows.map((cr) => {
            // Check for control drift warning
            const row = cr.row;
            let driftWarning = false;
            if (
              row.control_mean_terminal != null &&
              row.control_mean != null &&
              Math.abs(row.control_mean_terminal) > 0.001
            ) {
              const drift =
                Math.abs(row.control_mean! - row.control_mean_terminal) /
                Math.abs(row.control_mean_terminal) *
                100;
              if (drift > 15) driftWarning = true;
            }

            return (
              <div
                key={cr.row.dose_level}
                className="flex items-center justify-end"
                style={{ height: ROW_HEIGHT }}
              >
                {driftWarning && (
                  <span className="text-[8px] text-amber-600 mr-0.5" title="Control group shifted >15% between terminal and recovery">
                    ⚠
                  </span>
                )}
                <DoseLabel
                  level={cr.row.dose_level}
                  label={cr.doseLabel}
                  align="right"
                  className="text-[9px]"
                />
              </div>
            );
          })}
        </div>

        {/* Panels */}
        {sexes.map((sex, idx) => {
          const sRows = chartRowsBySex[sex] ?? [];
          return (
            <div key={sex} className="contents">
              {idx > 0 && <div className="w-px bg-border/30" />}
              <DumbbellPanel
                chartRows={sRows}
                xMin={xMinBySex[sex] ?? 0}
                xMax={globalXMax}
                effectSymbol={effectSymbol}
                terminalDay={tDay ?? null}
                sex={sex}
                hoveredDose={hoveredDose}
                onHoverDose={setHoveredDose}
                onClickDose={handleDoseClick}
              />
            </div>
          );
        })}
        {/* Keep single-sex panels at half-width to match two-panel scale */}
        {sexes.length === 1 && <div className="flex-1 min-w-0" />}
      </div>

    </div>
  );
}
