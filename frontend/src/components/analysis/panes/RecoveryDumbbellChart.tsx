/**
 * Recovery Dumbbell Chart — vertical orientation.
 *
 * Y-axis: signed Hedges' g (vs control).  X-axis: dose groups.
 * F/M dots interleaved side-by-side within each dose column.
 * Filled dot = terminal, open dot = recovery, connected by a
 * verdict-colored segment (solid = p<0.05, dashed = p≥0.05).
 *
 * Below the chart: compact data table (one row per dose, F/M columns).
 */
import { useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import type { DoseGroup } from "@/types/analysis";
import {
  classifyContinuousRecovery,
  CONT_VERDICT_LABEL,
  formatGAbs,
  formatGSigned,
  formatPctRecovered,
} from "@/lib/recovery-verdict";
import type { ContinuousVerdictType } from "@/lib/recovery-verdict";
import { getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { useStatMethods } from "@/hooks/useStatMethods";
import { getDoseGroupColor, getSexColor } from "@/lib/severity-colors";

// ── Types ────────────────────────────────────────────────

type RecoveryRow = RecoveryComparisonResponse["rows"][number];

interface RecoveryDumbbellChartProps {
  rows: RecoveryRow[];
  doseGroups?: DoseGroup[];
  terminalDay?: number | null;
  recoveryDay?: number | null;
  onDoseClick?: (doseLevel: number) => void;
}

// ── Processed row ────────────────────────────────────────

export interface ChartRow {
  row: RecoveryRow;
  doseLabel: string;
  verdict: ContinuousVerdictType;
  confidence?: "adequate" | "low";
  terminalVal: number | null; // signed g at terminal
  recoveryVal: number | null; // signed g at recovery
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

    if (row.insufficient_n) {
      return {
        row, doseLabel,
        verdict: "not_assessed" as ContinuousVerdictType,
        terminalVal: null, recoveryVal: null,
        isEdge: "insufficient_n",
      };
    }
    if (row.no_concurrent_control) {
      return {
        row, doseLabel,
        verdict: "not_assessed" as ContinuousVerdictType,
        terminalVal: null, recoveryVal: null,
        isEdge: "no_concurrent_control",
      };
    }

    // Prefer same-arm terminal (Option D, BUG-21) — eliminates cross-arm
    // control baseline shift.  Falls back to cross-arm when unavailable.
    const terminalG = row.terminal_effect_same_arm ?? row.terminal_effect;
    const v = classifyContinuousRecovery(terminalG, row.effect_size, row.treated_n, row.control_n);

    return {
      row, doseLabel,
      verdict: v.verdict,
      confidence: v.confidence,
      terminalVal: terminalG ?? null,
      recoveryVal: row.effect_size ?? null,
      isEdge: null,
    };
  });

  result.sort((a, b) => a.row.dose_level - b.row.dose_level);
  return result;
}

// ── Dose-response consistency check (Option C, BUG-21) ──

/**
 * Detect when all evaluated dose groups for a sex show the same directional
 * recovery effect (all positive or all negative g), indicating a dose-consistent
 * pattern that per-dose verdicts alone may not communicate.
 *
 * Returns a human-readable note per sex, or null if no pattern detected.
 */
function checkDoseConsistency(
  chartRowsBySex: Record<string, ChartRow[]>,
  sexes: string[],
): Map<string, string> {
  const notes = new Map<string, string>();
  for (const sex of sexes) {
    const rows = (chartRowsBySex[sex] ?? []).filter(
      (cr) => !cr.isEdge && cr.recoveryVal != null,
    );
    if (rows.length < 2) continue;

    const signs = rows.map((cr) => Math.sign(cr.recoveryVal!));
    const allPositive = signs.every((s) => s > 0);
    const allNegative = signs.every((s) => s < 0);
    if (!allPositive && !allNegative) continue;

    // Check if any verdict contradicts the consistent direction
    // (e.g., "resolved"/"reversed" when all doses show same-direction effect)
    const positiveVerdicts = new Set<ContinuousVerdictType>(["reversed", "partially_reversed"]);
    const negativeVerdicts = new Set<ContinuousVerdictType>(["progressing", "persistent"]);
    const hasPositive = rows.some((cr) => positiveVerdicts.has(cr.verdict));
    const hasNegative = rows.some((cr) => negativeVerdicts.has(cr.verdict));

    if (hasPositive && hasNegative) {
      const dir = allNegative ? "below" : "above";
      notes.set(sex, `All dose groups ${dir} control at recovery (dose-consistent pattern)`);
    }
  }
  return notes;
}

// ── Helpers ──────────────────────────────────────────────

function computeNiceTicks(min: number, max: number, maxTicks = 6): number[] {
  const range = max - min;
  if (range === 0) return [min];
  const rawStep = range / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 5, 10];
  const step = mag * (candidates.find((c) => c * mag >= rawStep) ?? 10);
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + step * 0.001; v += step) {
    ticks.push(Math.round(v * 1e10) / 1e10);
  }
  return ticks;
}

function formatPCompact(p: number): string {
  if (p < 0.001) return "<0.001";
  return p.toFixed(3);
}

/** Exported for RecoveryPane verdict descriptions. */
export function formatVerdictDesc(
  terminalG: number | null,
  recoveryG: number | null,
  pctRecovered: number | null,
  pValue: number | null,
  effectSymbol: string,
): string {
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
    if (Math.abs(pctRecovered) > 999) return `${dir}\u2009>10\u00d7 (${gTrajectory}${pStr})`;
    return `${dir}\u2009${formatPctRecovered(pctRecovered)} (${gTrajectory}${pStr})`;
  }
  const ratio = tG > 0.01 ? (rG / tG).toFixed(1) : null;
  return ratio ? `${dir}\u2009${ratio}\u00d7 (${gTrajectory}${pStr})` : `${dir} (${gTrajectory}${pStr})`;
}

export function connectorStyle(p: number | null): { opacity: number; width: number } {
  if (p == null) return { opacity: 0.7, width: 0.5 };
  if (p < 0.05) return { opacity: 1.0, width: 1.5 };
  if (p < 0.10) return { opacity: 0.8, width: 1 };
  return { opacity: 0.7, width: 0.5 };
}

/** Re-exported for tests. */
export function hasPeakQualifier(row: RecoveryRow): boolean {
  return (
    row.peak_effect != null &&
    row.terminal_effect != null &&
    Math.abs(row.peak_effect) > Math.abs(row.terminal_effect) * 1.5 &&
    Math.abs(row.peak_effect) > 1.0 &&
    Math.abs(row.terminal_effect) >= 0.5
  );
}

// ── Layout constants ─────────────────────────────────────

const PLOT_TOP = 8;
const PLOT_BOTTOM = 28;
const LEFT_MARGIN = 40;
const PLOT_RIGHT = 8;
const DOT_R = 3;
const ZERO_LINE_COLOR = "var(--border)";

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

  // Resize observer for the SVG
  const [dims, setDims] = useState({ width: 400, height: 220 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const measuredRef = useCallback((node: SVGSVGElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (node) {
      const observer = new ResizeObserver((entries) => {
        const r = entries[0]?.contentRect;
        if (r && r.width > 0 && r.height > 0) {
          setDims({ width: Math.round(r.width), height: Math.round(r.height) });
        }
      });
      observer.observe(node);
      observerRef.current = observer;
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDims({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    }
  }, []);

  // Split rows by sex (F before M)
  const sexes = useMemo(() => [...new Set(rows.map((r) => r.sex))].sort(), [rows]);
  const multiSex = sexes.length > 1;

  const rowsBySex = useMemo(() => {
    const map: Record<string, RecoveryRow[]> = {};
    for (const s of sexes) map[s] = rows.filter((r) => r.sex === s);
    return map;
  }, [rows, sexes]);

  const chartRowsBySex = useMemo(() => {
    const map: Record<string, ChartRow[]> = {};
    for (const s of sexes) map[s] = buildChartRows(rowsBySex[s], doseGroups);
    return map;
  }, [rowsBySex, sexes, doseGroups]);

  // Lookup: sex_doseLevel → ChartRow
  const chartRowLookup = useMemo(() => {
    const map = new Map<string, ChartRow>();
    for (const s of sexes) {
      for (const cr of chartRowsBySex[s] ?? []) map.set(`${s}_${cr.row.dose_level}`, cr);
    }
    return map;
  }, [chartRowsBySex, sexes]);

  // Union of dose levels
  const allDoseLevels = useMemo(() => {
    const levels = new Set<number>();
    for (const s of sexes) {
      for (const cr of chartRowsBySex[s] ?? []) levels.add(cr.row.dose_level);
    }
    return [...levels].sort((a, b) => a - b);
  }, [chartRowsBySex, sexes]);

  // Dose labels lookup
  const doseLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of sexes) {
      for (const cr of chartRowsBySex[s] ?? []) {
        if (!map.has(cr.row.dose_level)) map.set(cr.row.dose_level, cr.doseLabel);
      }
    }
    return map;
  }, [chartRowsBySex, sexes]);

  // Y-axis bounds — signed, always include 0
  const [yMin, yMax] = useMemo(() => {
    let lo = 0, hi = 0;
    for (const s of sexes) {
      for (const cr of chartRowsBySex[s] ?? []) {
        if (cr.isEdge) continue;
        for (const v of [cr.terminalVal, cr.recoveryVal]) {
          if (v != null) {
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
        }
        if (hasPeakQualifier(cr.row)) {
          const pv = cr.row.peak_effect!;
          lo = Math.min(lo, pv);
          hi = Math.max(hi, pv);
        }
      }
    }
    const pad = Math.max((hi - lo) * 0.1, 0.3);
    return [lo - pad, hi + pad];
  }, [chartRowsBySex, sexes]);

  const yTicks = useMemo(() => computeNiceTicks(yMin, yMax), [yMin, yMax]);

  // Dose-response consistency notes (Option C, BUG-21)
  const doseConsistencyNotes = useMemo(
    () => checkDoseConsistency(chartRowsBySex, sexes),
    [chartRowsBySex, sexes],
  );

  const handleDoseClick = useCallback(
    (dose: number) => onDoseClick?.(dose),
    [onDoseClick],
  );

  if (sexes.length === 0 || allDoseLevels.length === 0) return null;

  const tDay = terminalDay ?? rows[0]?.terminal_day;
  const rDay = recoveryDay ?? rows[0]?.recovery_day;

  // ── SVG layout ────────────────────────────────────────
  const { width, height } = dims;
  const plotHeight = Math.max(60, height - PLOT_TOP - PLOT_BOTTOM);
  const plotWidth = width - LEFT_MARGIN - PLOT_RIGHT;
  const numCols = allDoseLevels.length;
  const colWidth = numCols > 0 ? plotWidth / numCols : plotWidth;
  const plotBottom = PLOT_TOP + plotHeight;

  const colCenter = (colIdx: number) => LEFT_MARGIN + (colIdx + 0.5) * colWidth;
  const yScale = (v: number) => PLOT_TOP + plotHeight * (1 - (v - yMin) / (yMax - yMin));

  // Sub-column offset for F/M within dose column
  const subColOffset = (sex: string) => {
    if (!multiSex) return 0;
    const sexIdx = sexes.indexOf(sex);
    return (sexIdx - (sexes.length - 1) / 2) * (colWidth * 0.25);
  };

  const allChartRows = sexes.flatMap(s => chartRowsBySex[s] ?? []);

  const hasPeak = useMemo(
    () => allChartRows.some((cr) => !cr.isEdge && hasPeakQualifier(cr.row)),
    [allChartRows],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Legend */}
      <div className="text-[10px] text-muted-foreground/60 flex items-center gap-3 flex-wrap">
        {/* Sex swatches */}
        {sexes.map((sex) => (
          <span key={sex} className="inline-flex items-center gap-1">
            <svg width="8" height="8" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="2.5" fill={getSexColor(sex)} />
            </svg>
            {sex}
          </span>
        ))}
        <span className="text-border">|</span>
        {/* Glyph encoding */}
        <span className="inline-flex items-center gap-1">
          <svg width="8" height="8" viewBox="0 0 8 8">
            <circle cx="4" cy="4" r="2.5" fill="#6b7280" />
          </svg>
          Terminal{tDay != null ? ` (D${tDay})` : ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="8" height="8" viewBox="0 0 8 8">
            <polygon points="4,1 1,7 7,7" fill="#6b7280" />
          </svg>
          Recovery{rDay != null ? ` (D${rDay})` : ""}
        </span>
        {hasPeak && (
          <span className="inline-flex items-center gap-1">
            <svg width="8" height="8" viewBox="0 0 8 8">
              <polygon points="4,1 1,7 7,7" fill="none" stroke="#6b7280" strokeWidth={1} />
            </svg>
            Peak
          </span>
        )}
        <span className="text-border">|</span>
        {/* Line style */}
        <span className="inline-flex items-center gap-1">
          <svg width="16" height="4" viewBox="0 0 16 4">
            <line x1="0" y1="2" x2="16" y2="2" stroke="#6b7280" strokeWidth="1.5" />
          </svg>
          p&lt;0.05
        </span>
        <span className="inline-flex items-center gap-1" title="Recovery cohorts typically have smaller group sizes (n=5-10). Non-significant p-values do not rule out biologically meaningful effects.">
          <svg width="16" height="4" viewBox="0 0 16 4">
            <line x1="0" y1="2" x2="16" y2="2" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4,3" />
          </svg>
          p&ge;0.05
        </span>
      </div>

      {/* Chart */}
      <div style={{ height: 220 }}>
        <svg
          ref={measuredRef}
          className="w-full h-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* Horizontal grid lines */}
          {yTicks.map((t) => (
            <line
              key={t}
              x1={LEFT_MARGIN} y1={yScale(t)}
              x2={width - PLOT_RIGHT} y2={yScale(t)}
              stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2"
            />
          ))}

          {/* Zero baseline */}
          {yMin <= 0 && yMax >= 0 && (
            <line
              x1={LEFT_MARGIN} y1={yScale(0)}
              x2={width - PLOT_RIGHT} y2={yScale(0)}
              stroke={ZERO_LINE_COLOR} strokeWidth={1.5}
            />
          )}

          {/* Y-axis tick labels */}
          {yTicks.map((t) => (
            <text
              key={t}
              x={LEFT_MARGIN - 3} y={yScale(t)}
              textAnchor="end" dominantBaseline="central"
              className="text-[9px]" fill="var(--muted-foreground)"
            >
              {t === 0 ? "Control" : t.toFixed(1)}
            </text>
          ))}

          {/* Y-axis label */}
          <text
            x={6} y={PLOT_TOP + plotHeight / 2}
            textAnchor="middle" dominantBaseline="central"
            transform={`rotate(-90, 6, ${PLOT_TOP + plotHeight / 2})`}
            className="text-[9px]" fill="var(--muted-foreground)" opacity={0.6}
          >
            {effectSymbol} (vs control)
          </text>

          {/* Per-dose-group columns */}
          {allDoseLevels.map((dl, colIdx) => {
            const cx = colCenter(colIdx);
            const isHovered = hoveredDose === dl;

            return (
              <g
                key={dl}
                onMouseEnter={() => setHoveredDose(dl)}
                onMouseLeave={() => setHoveredDose(null)}
                onClick={() => handleDoseClick(dl)}
                className="cursor-pointer"
              >
                {/* Column hover highlight */}
                {isHovered && (
                  <rect
                    x={cx - colWidth / 2} y={PLOT_TOP}
                    width={colWidth} height={plotHeight}
                    fill="currentColor" opacity={0.03}
                    rx={2}
                  />
                )}

                {/* Thin separator between F/M sub-lanes */}
                {multiSex && (
                  <line
                    x1={cx} y1={PLOT_TOP}
                    x2={cx} y2={plotBottom}
                    stroke="var(--border)" strokeWidth={0.3} opacity={0.25}
                  />
                )}

                {/* Per-sex glyphs */}
                {sexes.map((sex) => {
                  const cr = chartRowLookup.get(`${sex}_${dl}`);
                  if (!cr) return null;

                  const sexCx = cx + subColOffset(sex);
                  const sexColor = getSexColor(sex);

                  // Edge: insufficient_n
                  if (cr.isEdge === "insufficient_n") {
                    return (
                      <circle
                        key={sex}
                        cx={sexCx} cy={yScale(0)} r={3}
                        fill="#D1D5DB" opacity={0.5}
                      >
                        <title>{sex}: n={cr.row.treated_n ?? 1} — insufficient for classification</title>
                      </circle>
                    );
                  }

                  // Edge: no_concurrent_control
                  if (cr.isEdge === "no_concurrent_control") {
                    return (
                      <text
                        key={sex}
                        x={sexCx} y={yScale(0)}
                        fontSize={8} fill="#D97706"
                        dominantBaseline="middle" textAnchor="middle"
                      >
                        <title>{sex}: no concurrent control</title>
                        &#x26A0;
                      </text>
                    );
                  }

                  // Normal glyph
                  const tVal = cr.terminalVal ?? 0;
                  const rVal = cr.recoveryVal ?? 0;
                  const ty = yScale(tVal);
                  const ry = yScale(rVal);
                  const cs = connectorStyle(cr.row.p_value);
                  const isLowConf = cr.confidence === "low";

                  // Arrow direction: points from terminal toward recovery
                  const ARROW_HALF = 3.5;
                  const TICK_HALF = 4;
                  const arrowDir = ry > ty ? 1 : -1; // +1 = arrow points down, -1 = up
                  const arrowTip = ry - arrowDir * 1; // arrow tip sits just before the tick
                  const arrowBase = arrowTip - arrowDir * ARROW_HALF * 2;

                  // Peak qualifier check
                  const showPeak = hasPeakQualifier(cr.row);
                  const peakY = showPeak ? yScale(cr.row.peak_effect!) : 0;

                  // Tooltip — use same-arm terminal (cr.terminalVal) for consistency
                  const verdictStr = CONT_VERDICT_LABEL[cr.verdict];
                  const v = classifyContinuousRecovery(cr.terminalVal, cr.recoveryVal, cr.row.treated_n, cr.row.control_n);
                  const pctStr = v.pctRecovered != null ? ` (${formatPctRecovered(v.pctRecovered)})` : "";
                  const pStr = cr.row.p_value != null ? ` p=${formatPCompact(cr.row.p_value)}` : "";
                  const lowNStr = isLowConf ? ` · low N (n=${cr.row.treated_n ?? "?"})` : "";
                  const peakStr = showPeak
                    ? ` · peak: ${formatGAbs(cr.row.peak_effect!)}${effectSymbol} (D${cr.row.peak_day ?? "?"})`
                    : "";
                  const tooltip = `${sex}: ${verdictStr}${pctStr} · ${effectSymbol}: ${formatGAbs(tVal)} → ${formatGAbs(rVal)}${pStr}${lowNStr}${peakStr}`;

                  return (
                    <g key={sex}>
                      <title>{tooltip}</title>
                      {/* Invisible wider hit area */}
                      <line
                        x1={sexCx} y1={ty} x2={sexCx} y2={ry}
                        stroke="transparent" strokeWidth={10}
                      />
                      {/* Peak dashed connector (renders behind terminal dot) */}
                      {showPeak && (
                        <line
                          x1={sexCx} y1={ty}
                          x2={sexCx} y2={peakY + 2.5}
                          stroke="#9CA3AF"
                          strokeWidth={0.5}
                          strokeDasharray="2,2"
                          opacity={0.5}
                        />
                      )}
                      {/* Peak triangle (open, sex-colored) */}
                      {showPeak && (
                        <polygon
                          points={`${sexCx},${peakY - 4} ${sexCx - 3.5},${peakY + 2.5} ${sexCx + 3.5},${peakY + 2.5}`}
                          fill="none"
                          stroke={sexColor}
                          strokeWidth={1}
                          opacity={0.7}
                        />
                      )}
                      {/* Gray connector — width/dash encodes p-value */}
                      <line
                        x1={sexCx} y1={ty} x2={sexCx} y2={arrowBase}
                        stroke="#9CA3AF" strokeWidth={cs.width}
                        opacity={cs.opacity}
                        {...(isLowConf ? { strokeDasharray: "3,2" } : {})}
                      />
                      {/* Terminal dot (filled, sex-colored) */}
                      <circle
                        cx={sexCx} cy={ty} r={DOT_R}
                        fill={sexColor}
                      />
                      {/* Recovery tick mark (horizontal line at exact recovery value) */}
                      <line
                        x1={sexCx - TICK_HALF} y1={ry}
                        x2={sexCx + TICK_HALF} y2={ry}
                        stroke={sexColor} strokeWidth={1.5} opacity={cs.opacity}
                      />
                      {/* Recovery arrow (sex-colored, points in direction of change) */}
                      <polygon
                        points={`${sexCx},${arrowTip} ${sexCx - ARROW_HALF},${arrowBase} ${sexCx + ARROW_HALF},${arrowBase}`}
                        fill={sexColor} opacity={cs.opacity}
                      />
                    </g>
                  );
                })}

                {/* Dose label — color-coded by group */}
                <text
                  x={cx} y={plotBottom + 12}
                  textAnchor="middle" dominantBaseline="central"
                  className="text-[10px] font-medium" fill={getDoseGroupColor(dl)}
                >
                  {doseLabelMap.get(dl) ?? `Dose ${dl}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Data table — visually separated from chart */}
      <div className="border-t border-border/30 pt-3 mt-1" />
      <RecoveryDataTable
        allDoseLevels={allDoseLevels}
        doseLabelMap={doseLabelMap}
        sexes={sexes}
        chartRowLookup={chartRowLookup}
        effectSymbol={effectSymbol}
        doseConsistencyNotes={doseConsistencyNotes}
      />

      {/* Control group drift warning */}
      {(() => {
        const withCtrl = allChartRows.filter(
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
          <div className="text-[10px] text-muted-foreground/70">
            Control group shifted {Math.round(driftPct)}% between terminal and recovery
            ({ctrlTerminal.toFixed(2)} {"\u2192"} {ctrlRecovery.toFixed(2)}).
            Interpretation may be affected.
          </div>
        );
      })()}
    </div>
  );
}

// ── Data table ──────────────────────────────────────────

function RecoveryDataTable({
  allDoseLevels,
  doseLabelMap,
  sexes,
  chartRowLookup,
  effectSymbol,
  doseConsistencyNotes,
}: {
  allDoseLevels: number[];
  doseLabelMap: Map<number, string>;
  sexes: string[];
  chartRowLookup: Map<string, ChartRow>;
  effectSymbol: string;
  doseConsistencyNotes: Map<string, string>;
}) {
  const multiSex = sexes.length > 1;

  return (
    <table className="w-full text-[10px] border-collapse">
      <thead>
        {/* Group header row — Dose + per-sex groups (each with Classification) */}
        <tr className="border-b border-border/30">
          <th className="text-left text-muted-foreground/60 font-medium py-0.5 pr-2 whitespace-nowrap" style={{ width: 1 }}>
            Dose
          </th>
          {sexes.map((sex) => (
            <th
              key={sex}
              colSpan={4}
              className="text-center font-medium py-0.5 px-1"
              style={{ color: multiSex ? getSexColor(sex) : "var(--muted-foreground)" }}
            >
              {multiSex ? sex : ""}
            </th>
          ))}
        </tr>
        {/* Sub-header row — Terminal / Recovery / Change / Classification per sex */}
        <tr className="border-b border-border/20">
          <th />
          {sexes.map((sex) => (
            <SexSubHeaders key={sex} />
          ))}
        </tr>
      </thead>
      <tbody>
        {allDoseLevels.map((dl) => (
          <tr key={dl} className="border-b border-border/10 hover:bg-muted/20">
            {/* Dose label */}
            <td className="py-1 pr-2 whitespace-nowrap" style={{ width: 1 }}>
              <span
                className="font-mono text-[10px] border-l-2 pl-1.5"
                style={{ borderLeftColor: getDoseGroupColor(dl) }}
              >
                {doseLabelMap.get(dl) ?? `Dose ${dl}`}
              </span>
            </td>

            {/* Per-sex cells (Terminal / Recovery / Change / Classification) */}
            {sexes.map((sex) => {
              const cr = chartRowLookup.get(`${sex}_${dl}`);
              if (!cr || cr.isEdge) {
                const edgeClassification = cr?.isEdge === "insufficient_n"
                  ? "Insufficient N"
                  : cr?.isEdge === "no_concurrent_control"
                  ? "No control"
                  : "—";
                const edgeNote = cr?.isEdge === "insufficient_n"
                  ? `n=${cr.row.treated_n ?? "?"}`
                  : cr?.isEdge === "no_concurrent_control"
                  ? "no ctrl"
                  : "";
                return (
                  <SexDataCells
                    key={sex}
                    terminal="—"
                    recovery="—"
                    change={edgeNote || "—"}
                    classification={edgeClassification}
                  />
                );
              }

              // Use same-arm terminal (cr.terminalVal) for consistency with chart
              const tG = cr.terminalVal;
              const rG = cr.recoveryVal;
              const v = classifyContinuousRecovery(tG, rG, cr.row.treated_n, cr.row.control_n);
              const label = CONT_VERDICT_LABEL[cr.verdict];
              const classLabel = cr.confidence === "low" ? `${label} *` : label;

              let changeStr = "—";
              if (tG != null && rG != null && Math.abs(tG) >= 0.01) {
                if (v.pctRecovered != null) {
                  const dir = Math.abs(rG) <= Math.abs(tG) ? "\u2193" : "\u2191";
                  changeStr = `${dir}${formatPctRecovered(v.pctRecovered)}`;
                }
              }

              return (
                <SexDataCells
                  key={sex}
                  terminal={tG != null ? `${formatGSigned(tG)}${effectSymbol}` : "—"}
                  recovery={rG != null ? `${formatGSigned(rG)}${effectSymbol}` : "—"}
                  change={changeStr}
                  classification={classLabel}
                  lowConfidence={cr.confidence === "low"}
                />
              );
            })}
          </tr>
        ))}
      </tbody>
      {/* Dose-consistency notes (Option C, BUG-21) */}
      {doseConsistencyNotes.size > 0 && (
        <tfoot>
          <tr>
            <td colSpan={1 + sexes.length * 4} className="pt-1.5">
              {[...doseConsistencyNotes.entries()].map(([sex, note]) => (
                <div key={sex} className="text-[10px] text-muted-foreground/70">
                  {sexes.length > 1 && <span style={{ color: getSexColor(sex) }}>{sex}: </span>}
                  {note}
                </div>
              ))}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function SexSubHeaders() {
  return (
    <>
      <th className="text-right text-muted-foreground/60 font-medium px-1 whitespace-nowrap" style={{ width: 1 }}>
        Terminal
      </th>
      <th className="text-right text-muted-foreground/60 font-medium px-1 whitespace-nowrap" style={{ width: 1 }}>
        Recovery
      </th>
      <th className="text-right text-muted-foreground/60 font-medium px-1 whitespace-nowrap" style={{ width: 1 }}>
        Change
      </th>
      <th className="text-left text-muted-foreground/60 font-medium pl-2 pr-1 whitespace-nowrap" style={{ width: 1 }}>
        Classification
      </th>
    </>
  );
}

function SexDataCells({ terminal, recovery, change, classification, lowConfidence }: {
  terminal: string; recovery: string; change: string; classification: string; lowConfidence?: boolean;
}) {
  return (
    <>
      <td className="text-right tabular-nums font-mono py-1 px-1 text-muted-foreground" style={{ width: 1 }}>
        {terminal}
      </td>
      <td className="text-right tabular-nums font-mono py-1 px-1 text-muted-foreground" style={{ width: 1 }}>
        {recovery}
      </td>
      <td className="text-right tabular-nums font-mono py-1 px-1 text-muted-foreground" style={{ width: 1 }}>
        {change}
      </td>
      <td
        className="text-left py-1 pl-2 pr-1 whitespace-nowrap text-muted-foreground"
        style={{ width: 1 }}
        title={lowConfidence ? "Low confidence: n < 5 in recovery group" : undefined}
      >
        {classification}
      </td>
    </>
  );
}
