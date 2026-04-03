/**
 * Strip/dot plot — vertical orientation.
 * X axis: dose groups (color-coded), Y axis: values.
 *
 * Two render modes:
 * - **Separate** (default): One SVG panel per sex, side by side. Dose-colored dots.
 *   Used in the old context-panel DistributionPane.
 * - **Interleaved** (`interleaved` prop): Single SVG, F/M sub-lanes within
 *   each dose column, sex-colored dots (cyan M / pink F), shared Y-axis.
 *   Fills available vertical space. Used in center-panel CenterDistribution.
 *
 * Interaction:
 * - Hover dot → show individual tooltip (USUBJID, value)
 * - Click dot → open subject profile panel
 */
import { useMemo, useState, useRef, useCallback } from "react";
import { getDoseGroupColor, getSexColor, formatDoseShortLabel } from "@/lib/severity-colors";
import { computeNiceTicks, shortId } from "@/lib/chart-utils";

// ── Types ─────────────────────────────────────────────────

interface SubjectValue {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  value: number;
}

export interface StripPlotChartProps {
  subjects: SubjectValue[];
  unit: string;
  sexes: string[];
  /** Dose groups sorted by level, including control (level 0). */
  doseGroups: { doseLevel: number; doseLabel: string }[];
  /** Called when a dot is clicked — opens subject profile panel. */
  onSubjectClick?: (usubjid: string) => void;
  /** Distribution mode — controls stat labels in the legend. */
  mode?: "terminal" | "peak" | "recovery";
  /** Interleaved sex layout: single SVG with F|M sub-lanes per dose column.
   *  Sex-colored dots, shared Y-axis, fills container height. */
  interleaved?: boolean;
  /** USUBJIDs of LOO-influential animals — render in amber-brown (#92400e). */
  influentialSubjects?: ReadonlySet<string>;
}

// ── Layout constants ──────────────────────────────────────

const PLOT_HEIGHT = 165;
const PLOT_TOP = 4;
const PLOT_BOTTOM = 26; // dose labels + unit
const LEFT_MARGIN = 30; // Y-axis tick labels (first panel only uses it)
const PLOT_RIGHT = 6;
const DOT_RADIUS = 2.5;
const DOT_RADIUS_HOVER = 3.5;
const MEAN_TICK_HALF = 5;
const BOX_THRESHOLD = 5;
export const LOO_INFLUENTIAL_COLOR = "#92400e"; // amber-800 — amber-brown for LOO influential marker

// ── Stats helpers ─────────────────────────────────────────

function computeStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1
    ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
    : 0;

  const q1 = percentile(sorted, 25);
  const median = percentile(sorted, 50);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const whiskerLo = Math.max(sorted[0], q1 - 1.5 * iqr);
  const whiskerHi = Math.min(sorted[n - 1], q3 + 1.5 * iqr);

  return { mean, sd, n, q1, median, q3, whiskerLo, whiskerHi, min: sorted[0], max: sorted[n - 1] };
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Jitter (horizontal, deterministic by index) ──────────

function jitterX(index: number, count: number, colWidth: number): number {
  if (count <= 1) return 0;
  const span = Math.min(colWidth * 0.3, count * 1.8);
  return ((index / (count - 1)) - 0.5) * span;
}

// computeNiceTicks and shortId imported from @/lib/chart-utils

// ── Component ────────────────────────────────────────────

export function StripPlotChart({ subjects, unit, sexes, doseGroups, onSubjectClick, mode = "terminal", interleaved = false, influentialSubjects }: StripPlotChartProps) {
  const [hoveredDot, setHoveredDot] = useState<SubjectValue | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Per-sex stats per dose group (for the stats beneath each panel)
  const sexGroupStats = useMemo(() => {
    const result: Record<string, Map<number, { n: number; mean: number; sd: number }>> = {};
    for (const sex of sexes) {
      const map = new Map<number, number[]>();
      for (const dg of doseGroups) map.set(dg.doseLevel, []);
      for (const s of subjects) {
        if (s.sex === sex) map.get(s.dose_level)?.push(s.value);
      }
      const stats = new Map<number, { n: number; mean: number; sd: number }>();
      for (const [level, vals] of map) {
        if (vals.length === 0) continue;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sd = vals.length > 1
          ? Math.sqrt(vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (vals.length - 1))
          : 0;
        stats.set(level, { n: vals.length, mean, sd });
      }
      result[sex] = stats;
    }
    return result;
  }, [subjects, sexes, doseGroups]);

  // Group subjects by sex → doseLevel
  const grouped = useMemo(() => {
    const map: Record<string, Record<number, SubjectValue[]>> = {};
    for (const sex of sexes) map[sex] = {};
    for (const dg of doseGroups) {
      for (const sex of sexes) map[sex][dg.doseLevel] = [];
    }
    for (const s of subjects) {
      map[s.sex]?.[s.dose_level]?.push(s);
    }
    return map;
  }, [subjects, sexes, doseGroups]);

  // Global value domain across all sexes
  const [vMin, vMax] = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of subjects) {
      if (s.value < lo) lo = s.value;
      if (s.value > hi) hi = s.value;
    }
    if (!isFinite(lo)) return [0, 1];
    const pad = (hi - lo) * 0.08 || 0.5;
    return [lo - pad, hi + pad];
  }, [subjects]);

  const yTicks = useMemo(() => computeNiceTicks(vMin, vMax), [vMin, vMax]);

  const svgHeight = PLOT_TOP + PLOT_HEIGHT + PLOT_BOTTOM;
  const isSingleSex = sexes.length === 1;

  // Dot-level hover
  const handleDotEnter = useCallback((sv: SubjectValue, e: React.MouseEvent) => {
    setHoveredDot(sv);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const suffix = influentialSubjects?.has(sv.usubjid) ? " -- LOO influential" : "";
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
        text: `${shortId(sv.usubjid)}  ${sv.value.toFixed(2)} ${unit}${suffix}`,
      });
    }
  }, [unit, influentialSubjects]);

  const handleDotLeave = useCallback(() => {
    setHoveredDot(null);
    setTooltip(null);
  }, []);

  // Dot click → subject profile
  const handleDotClick = useCallback((usubjid: string) => {
    onSubjectClick?.(usubjid);
  }, [onSubjectClick]);

  // No legend here — rendered by parent component in toolbar area

  // ── Interleaved mode ─────────────────────────────────────
  if (interleaved) {
    return (
      <div ref={containerRef} className="relative h-full flex flex-col">
        <div className="flex-1 min-h-0">
          <InterleavedPanel
            grouped={grouped}
            sexes={sexes}
            doseGroups={doseGroups}
            vMin={vMin}
            vMax={vMax}
            yTicks={yTicks}
            hoveredDot={hoveredDot}
            onDotEnter={handleDotEnter}
            onDotLeave={handleDotLeave}
            onDotClick={handleDotClick}
            influentialSubjects={influentialSubjects}
          />
        </div>
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-popover text-popover-foreground border border-border rounded px-1.5 py-0.5 text-[10px] shadow-sm whitespace-nowrap z-10"
            style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    );
  }

  // ── Separate mode (original) ─────────────────────────────

  return (
    <div ref={containerRef} className="relative">
      {/* Sex headers */}
      {!isSingleSex && (
        <div className="flex" style={{ paddingLeft: LEFT_MARGIN }}>
          {sexes.map((sex) => (
            <div key={sex} className="flex-1 text-center text-[10px] font-medium text-muted-foreground mb-0.5">
              {sex}
            </div>
          ))}
        </div>
      )}

      {/* SVG panels + per-sex stats */}
      <div className="flex">
        {sexes.map((sex, idx) => (
          <div key={sex} className="flex-1 min-w-0">
            {isSingleSex && (
              <div className="text-center text-[10px] font-medium text-muted-foreground mb-0.5">
                {sex}
              </div>
            )}
            <SexPanel
              showYAxis={idx === 0}
              grouped={grouped[sex] ?? {}}
              doseGroups={doseGroups}
              vMin={vMin}
              vMax={vMax}
              yTicks={yTicks}
              svgHeight={svgHeight}
              hoveredDot={hoveredDot}
              onDotEnter={handleDotEnter}
              onDotLeave={handleDotLeave}
              onDotClick={handleDotClick}
              influentialSubjects={influentialSubjects}
            />
            {/* Per-sex dose legend — aligned with SVG columns */}
            <div
              className="mt-1 text-[10px] leading-[14px]"
              style={{ paddingLeft: idx === 0 ? LEFT_MARGIN : 6, paddingRight: PLOT_RIGHT }}
            >
              {doseGroups
                .filter((dg) => dg.doseLevel > 0)
                .map((dg) => {
                  const stats = sexGroupStats[sex]?.get(dg.doseLevel);
                  if (!stats) return null;
                  const color = getDoseGroupColor(dg.doseLevel);
                  const label = formatDoseShortLabel(dg.doseLabel);
                  const isPeak = mode === "peak";
                  return (
                    <div key={dg.doseLevel} className="flex items-center gap-1">
                      <span
                        className="inline-block shrink-0 rounded-full"
                        style={{ width: 6, height: 6, backgroundColor: color }}
                      />
                      <span className="shrink-0 text-muted-foreground truncate" style={{ width: 52 }}>
                        {label}
                      </span>
                      <span className="tabular-nums">
                        <span className="font-semibold text-foreground/70">
                          {isPeak ? "Δ" : "x̄"}&nbsp;=&nbsp;{isPeak && stats.mean > 0 ? "+" : ""}{stats.mean.toFixed(1)}
                        </span>
                        <span className="text-muted-foreground/40">±{stats.sd.toFixed(1)}</span>
                      </span>
                      <span className="text-muted-foreground/40">n={stats.n}</span>
                    </div>
                  );
                })}
              {(() => {
                const ctrl = sexGroupStats[sex]?.get(0);
                if (!ctrl) return null;
                const isPeak = mode === "peak";
                return (
                  <div className="text-muted-foreground/60 pl-[7px] tabular-nums">
                    Control n={ctrl.n}{!isPeak && <span> x̄={ctrl.mean.toFixed(1)}±{ctrl.sd.toFixed(1)}</span>}
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      {/* Unit label removed — shown in DistributionPane subtitle instead */}

      {tooltip && (
        <div
          className="absolute pointer-events-none bg-popover text-popover-foreground border border-border rounded px-1.5 py-0.5 text-[10px] shadow-sm whitespace-nowrap z-10"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

// ── Interleaved SVG panel ─────────────────────────────────
// Single SVG with F/M sub-lanes within each dose column.
// Sex-colored dots, shared Y-axis, fills container height.

function InterleavedPanel({
  grouped,
  sexes,
  doseGroups,
  vMin,
  vMax,
  yTicks,
  hoveredDot,
  onDotEnter,
  onDotLeave,
  onDotClick,
  influentialSubjects,
}: {
  grouped: Record<string, Record<number, SubjectValue[]>>;
  sexes: string[];
  doseGroups: { doseLevel: number; doseLabel: string }[];
  vMin: number;
  vMax: number;
  yTicks: number[];
  hoveredDot: SubjectValue | null;
  onDotEnter: (sv: SubjectValue, e: React.MouseEvent) => void;
  onDotLeave: () => void;
  onDotClick: (usubjid: string) => void;
  influentialSubjects?: ReadonlySet<string>;
}) {
  const [dims, setDims] = useState({ width: 400, height: 250 });
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

  const { width, height } = dims;
  const bottomMargin = PLOT_BOTTOM;
  const plotHeight = Math.max(60, height - PLOT_TOP - bottomMargin);
  const plotWidth = width - LEFT_MARGIN - PLOT_RIGHT;
  const numCols = doseGroups.length;
  const nominalColWidth = numCols > 0 ? plotWidth / numCols : plotWidth;
  const interGroupGap = numCols > 1 ? nominalColWidth * 0.2 : 0;
  const colWidth = numCols > 1
    ? (plotWidth - (numCols - 1) * interGroupGap) / numCols
    : nominalColWidth;
  const plotBottom = PLOT_TOP + plotHeight;

  const colCenter = (colIdx: number) =>
    LEFT_MARGIN + colIdx * (colWidth + interGroupGap) + colWidth / 2;
  const yScale = (v: number) => PLOT_TOP + plotHeight * (1 - (v - vMin) / (vMax - vMin));

  // Sub-column offset: F on left, M on right within each dose column
  const subColOffset = (sex: string) => {
    if (sexes.length === 1) return 0;
    const sexIdx = sexes.indexOf(sex);
    return (sexIdx - (sexes.length - 1) / 2) * (colWidth * 0.35);
  };

  const subColWidth = sexes.length > 1 ? colWidth * 0.35 : colWidth;

  return (
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

      {/* Y-axis tick labels — shared, always shown */}
      {yTicks.map((t) => (
        <text
          key={t}
          x={LEFT_MARGIN - 3} y={yScale(t)}
          textAnchor="end" dominantBaseline="central"
          className="text-[8px]" fill="var(--muted-foreground)"
        >
          {t % 1 === 0 ? t : t.toFixed(1)}
        </text>
      ))}

      {/* Per-dose-group columns with interleaved sex sub-lanes */}
      {doseGroups.map((dg, colIdx) => {
        const cx = colCenter(colIdx);

        return (
          <g key={dg.doseLevel}>
            {/* Thin separator between F/M sub-lanes */}
            {sexes.length > 1 && (
              <line
                x1={cx} y1={PLOT_TOP}
                x2={cx} y2={plotBottom}
                stroke="var(--border)" strokeWidth={0.3} opacity={0.25}
              />
            )}

            {/* Per-sex sub-columns */}
            {sexes.map((sex) => {
              const values = grouped[sex]?.[dg.doseLevel] ?? [];
              const sexCx = cx + subColOffset(sex);
              const sexColor = getSexColor(sex);
              const nums = values.map((v) => v.value);

              if (nums.length === 0) {
                return (
                  <text
                    key={sex}
                    x={sexCx} y={PLOT_TOP + plotHeight / 2}
                    textAnchor="middle" dominantBaseline="central"
                    className="text-[10px]" fill="var(--muted-foreground)" opacity={0.4}
                  >
                    —
                  </text>
                );
              }

              const stats = computeStats(nums);
              const showBox = nums.length > BOX_THRESHOLD;

              return (
                <g key={sex}>
                  {/* Box/whisker (vertical, conditional on n > 15) */}
                  {showBox && (
                    <>
                      <line
                        x1={sexCx} y1={yScale(stats.whiskerHi)}
                        x2={sexCx} y2={yScale(stats.whiskerLo)}
                        stroke={sexColor} strokeWidth={1} opacity={0.4}
                      />
                      <line
                        x1={sexCx - 3} y1={yScale(stats.whiskerHi)}
                        x2={sexCx + 3} y2={yScale(stats.whiskerHi)}
                        stroke={sexColor} strokeWidth={1} opacity={0.4}
                      />
                      <line
                        x1={sexCx - 3} y1={yScale(stats.whiskerLo)}
                        x2={sexCx + 3} y2={yScale(stats.whiskerLo)}
                        stroke={sexColor} strokeWidth={1} opacity={0.4}
                      />
                      <rect
                        x={sexCx - 5} y={yScale(stats.q3)}
                        width={10} height={yScale(stats.q1) - yScale(stats.q3)}
                        fill={sexColor} fillOpacity={0.06}
                        stroke={sexColor} strokeWidth={1} opacity={0.4}
                      />
                      <line
                        x1={sexCx - 5} y1={yScale(stats.median)}
                        x2={sexCx + 5} y2={yScale(stats.median)}
                        stroke={sexColor} strokeWidth={1.5} opacity={0.6}
                      />
                    </>
                  )}

                  {/* Individual dots (jittered horizontally, sex-colored) */}
                  {values.map((sv, i) => {
                    const isDotHovered = hoveredDot?.usubjid === sv.usubjid;
                    const isInfluential = !!influentialSubjects?.has(sv.usubjid);
                    const dotX = sexCx + jitterX(i, values.length, subColWidth);
                    const dotY = yScale(sv.value);
                    const handlers = {
                      onMouseEnter: (e: React.MouseEvent) => { e.stopPropagation(); onDotEnter(sv, e); },
                      onMouseLeave: (e: React.MouseEvent) => { e.stopPropagation(); onDotLeave(); },
                      onClick: (e: React.MouseEvent) => { e.stopPropagation(); onDotClick(sv.usubjid); },
                    };
                    if (isInfluential) {
                      return (
                        <circle
                          key={sv.usubjid}
                          cx={dotX} cy={dotY}
                          r={DOT_RADIUS_HOVER}
                          fill={LOO_INFLUENTIAL_COLOR}
                          opacity={1}
                          style={{ cursor: "pointer" }}
                          {...handlers}
                        />
                      );
                    }
                    return (
                      <circle
                        key={sv.usubjid}
                        cx={dotX} cy={dotY}
                        r={isDotHovered ? DOT_RADIUS_HOVER : DOT_RADIUS}
                        fill={sexColor}
                        opacity={isDotHovered ? 1 : 0.7}
                        stroke={isDotHovered ? "var(--foreground)" : "none"}
                        strokeWidth={isDotHovered ? 1 : 0}
                        style={{ transition: "opacity 0.15s, r 0.1s", cursor: "pointer" }}
                        {...handlers}
                      />
                    );
                  })}

                  {/* Mean tick (horizontal line) */}
                  <line
                    x1={sexCx - MEAN_TICK_HALF} y1={yScale(stats.mean)}
                    x2={sexCx + MEAN_TICK_HALF} y2={yScale(stats.mean)}
                    stroke={sexColor} strokeWidth={2} opacity={0.8}
                  />
                </g>
              );
            })}

            {/* Dose label centered on full column — color-coded by group */}
            <text
              x={cx} y={plotBottom + 10}
              textAnchor="middle" dominantBaseline="central"
              className="text-[10px] font-medium" fill={getDoseGroupColor(dg.doseLevel)}
            >
              {formatDoseShortLabel(dg.doseLabel)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Per-sex SVG panel (separate mode) ─────────────────────

function SexPanel({
  showYAxis,
  grouped,
  doseGroups,
  vMin,
  vMax,
  yTicks,
  svgHeight,
  hoveredDot,
  onDotEnter,
  onDotLeave,
  onDotClick,
  influentialSubjects,
}: {
  showYAxis: boolean;
  grouped: Record<number, SubjectValue[]>;
  doseGroups: { doseLevel: number; doseLabel: string }[];
  vMin: number;
  vMax: number;
  yTicks: number[];
  svgHeight: number;
  hoveredDot: SubjectValue | null;
  onDotEnter: (sv: SubjectValue, e: React.MouseEvent) => void;
  onDotLeave: () => void;
  onDotClick: (usubjid: string) => void;
  influentialSubjects?: ReadonlySet<string>;
}) {
  const [width, setWidth] = useState(200);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measuredRef = useCallback((node: SVGSVGElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (node) {
      const observer = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w && w > 0) setWidth(Math.round(w));
      });
      observer.observe(node);
      observerRef.current = observer;
      const rect = node.getBoundingClientRect();
      if (rect.width > 0) setWidth(Math.round(rect.width));
    }
  }, []);

  const leftMargin = showYAxis ? LEFT_MARGIN : 6;
  const plotWidth = width - leftMargin - PLOT_RIGHT;
  const numCols = doseGroups.length;
  const colWidth = numCols > 0 ? plotWidth / numCols : plotWidth;
  const plotBottom = PLOT_TOP + PLOT_HEIGHT;

  const colCenter = (colIdx: number) => leftMargin + (colIdx + 0.5) * colWidth;
  const yScale = (v: number) => PLOT_TOP + PLOT_HEIGHT * (1 - (v - vMin) / (vMax - vMin));

  return (
    <svg
      ref={measuredRef}
      className="w-full"
      viewBox={`0 0 ${width} ${svgHeight}`}
      preserveAspectRatio="xMinYMin meet"
      style={{ height: svgHeight }}
    >
      {/* Horizontal grid lines */}
      {yTicks.map((t) => (
        <line
          key={t}
          x1={leftMargin} y1={yScale(t)}
          x2={width - PLOT_RIGHT} y2={yScale(t)}
          stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2"
        />
      ))}

      {/* Y-axis tick labels (first panel only) */}
      {showYAxis && yTicks.map((t) => (
        <text
          key={t}
          x={leftMargin - 3} y={yScale(t)}
          textAnchor="end" dominantBaseline="central"
          className="text-[8px]" fill="var(--muted-foreground)"
        >
          {t % 1 === 0 ? t : t.toFixed(1)}
        </text>
      ))}

      {/* Per-dose-group columns */}
      {doseGroups.map((dg, colIdx) => {
        const values = grouped[dg.doseLevel] ?? [];
        const cx = colCenter(colIdx);
        const nums = values.map((v) => v.value);
        const color = getDoseGroupColor(dg.doseLevel);

        if (nums.length === 0) {
          return (
            <g key={dg.doseLevel}>
              <text
                x={cx} y={PLOT_TOP + PLOT_HEIGHT / 2}
                textAnchor="middle" dominantBaseline="central"
                className="text-[10px]" fill="var(--muted-foreground)" opacity={0.4}
              >
                —
              </text>
            </g>
          );
        }

        const stats = computeStats(nums);
        const showBox = nums.length > BOX_THRESHOLD;

        return (
          <g key={dg.doseLevel}>
            {/* Box/whisker (vertical, conditional on n > 15) */}
            {showBox && (
              <>
                <line
                  x1={cx} y1={yScale(stats.whiskerHi)}
                  x2={cx} y2={yScale(stats.whiskerLo)}
                  stroke={color} strokeWidth={1} opacity={0.5}
                />
                <line
                  x1={cx - 3} y1={yScale(stats.whiskerHi)}
                  x2={cx + 3} y2={yScale(stats.whiskerHi)}
                  stroke={color} strokeWidth={1} opacity={0.5}
                />
                <line
                  x1={cx - 3} y1={yScale(stats.whiskerLo)}
                  x2={cx + 3} y2={yScale(stats.whiskerLo)}
                  stroke={color} strokeWidth={1} opacity={0.5}
                />
                <rect
                  x={cx - 5} y={yScale(stats.q3)}
                  width={10} height={yScale(stats.q1) - yScale(stats.q3)}
                  fill={color} fillOpacity={0.08}
                  stroke={color} strokeWidth={1} opacity={0.5}
                />
                <line
                  x1={cx - 5} y1={yScale(stats.median)}
                  x2={cx + 5} y2={yScale(stats.median)}
                  stroke={color} strokeWidth={1.5} opacity={0.7}
                />
              </>
            )}

            {/* Individual dots (jittered horizontally) */}
            {values.map((sv, i) => {
              const isDotHovered = hoveredDot?.usubjid === sv.usubjid;
              const isInfluential = !!influentialSubjects?.has(sv.usubjid);
              const dotX = cx + jitterX(i, values.length, colWidth);
              const dotY = yScale(sv.value);
              const handlers = {
                onMouseEnter: (e: React.MouseEvent) => { e.stopPropagation(); onDotEnter(sv, e); },
                onMouseLeave: (e: React.MouseEvent) => { e.stopPropagation(); onDotLeave(); },
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); onDotClick(sv.usubjid); },
              };
              if (isInfluential) {
                return (
                  <circle
                    key={sv.usubjid}
                    cx={dotX} cy={dotY}
                    r={DOT_RADIUS_HOVER}
                    fill={LOO_INFLUENTIAL_COLOR}
                    opacity={1}
                    style={{ cursor: "pointer" }}
                    {...handlers}
                  />
                );
              }
              return (
                <circle
                  key={sv.usubjid}
                  cx={dotX} cy={dotY}
                  r={isDotHovered ? DOT_RADIUS_HOVER : DOT_RADIUS}
                  fill={color}
                  opacity={isDotHovered ? 1 : 0.7}
                  stroke={isDotHovered ? "var(--foreground)" : "none"}
                  strokeWidth={isDotHovered ? 1 : 0}
                  style={{ transition: "opacity 0.15s, r 0.1s", cursor: "pointer" }}
                  {...handlers}
                />
              );
            })}

            {/* Mean tick (horizontal line) */}
            <line
              x1={cx - MEAN_TICK_HALF} y1={yScale(stats.mean)}
              x2={cx + MEAN_TICK_HALF} y2={yScale(stats.mean)}
              stroke={color} strokeWidth={2} opacity={0.8}
            />
          </g>
        );
      })}

      {/* Dose labels at bottom */}
      {doseGroups.map((dg, colIdx) => {
        const cx = colCenter(colIdx);
        const label = formatDoseShortLabel(dg.doseLabel);

        return (
          <text
            key={dg.doseLevel}
            x={cx} y={plotBottom + 10}
            textAnchor="middle" dominantBaseline="central"
            className="text-[10px]" fill="var(--muted-foreground)"
          >
            {label}
          </text>
        );
      })}

    </svg>
  );
}
