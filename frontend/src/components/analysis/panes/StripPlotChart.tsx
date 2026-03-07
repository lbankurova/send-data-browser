/**
 * Strip/dot plot — vertical orientation.
 * X axis: dose groups (color-coded), Y axis: values.
 * One SVG panel per sex, side by side for easy F/M comparison.
 *
 * Interaction:
 * - Hover dose column → highlight group, show group tooltip (n, mean, SD)
 * - Click dose label → select dose, highlight on both panels, enable per-dot hover
 * - Hover dot (when dose selected) → show individual tooltip (USUBJID, value)
 * - Click dot → open subject profile panel
 */
import { useMemo, useState, useRef, useCallback } from "react";
import { getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";
import { Checkbox } from "@/components/ui/checkbox";

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
const BOX_THRESHOLD = 15;

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

// ── Y-axis tick computation ──────────────────────────────

function computeNiceTicks(min: number, max: number, maxTicks = 5): number[] {
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

// ── Short subject ID ─────────────────────────────────────

function shortId(usubjid: string): string {
  const parts = usubjid.split("-");
  return parts[parts.length - 1];
}

// ── Component ────────────────────────────────────────────

export function StripPlotChart({ subjects, unit, sexes, doseGroups, onSubjectClick, mode = "terminal" }: StripPlotChartProps) {
  const [hoveredGroup, setHoveredGroup] = useState<{ sex: string; doseLevel: number } | null>(null);
  const [hoveredDot, setHoveredDot] = useState<SubjectValue | null>(null);
  const [selectedDoses, setSelectedDoses] = useState<Set<number>>(new Set());
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

  // Group-level hover
  const handleGroupEnter = useCallback((sex: string, doseLevel: number, stats: ReturnType<typeof computeStats>, e: React.MouseEvent) => {
    setHoveredGroup({ sex, doseLevel });
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
        text: `n=${stats.n}  mean=${stats.mean.toFixed(2)}  SD=${stats.sd.toFixed(2)}`,
      });
    }
  }, []);

  const handleGroupLeave = useCallback(() => {
    setHoveredGroup(null);
    setTooltip(null);
  }, []);

  // Dot-level hover (dose selected)
  const handleDotEnter = useCallback((sv: SubjectValue, e: React.MouseEvent) => {
    setHoveredDot(sv);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
        text: `${shortId(sv.usubjid)}  ${sv.value.toFixed(2)} ${unit}`,
      });
    }
  }, [unit]);

  const handleDotLeave = useCallback(() => {
    setHoveredDot(null);
    setTooltip(null);
  }, []);

  // Dose label click → single select; Ctrl/Cmd+click → multi-select toggle
  const handleDoseClick = useCallback((doseLevel: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedDoses(prev => {
        const next = new Set(prev);
        if (next.has(doseLevel)) next.delete(doseLevel);
        else next.add(doseLevel);
        return next;
      });
    } else {
      setSelectedDoses(prev =>
        prev.size === 1 && prev.has(doseLevel) ? new Set() : new Set([doseLevel]),
      );
    }
    setHoveredGroup(null);
    setHoveredDot(null);
    setTooltip(null);
  }, []);

  // Select all / none toggle
  const handleSelectAll = useCallback(() => {
    setSelectedDoses(prev =>
      prev.size === doseGroups.length
        ? new Set()
        : new Set(doseGroups.map(dg => dg.doseLevel)),
    );
  }, [doseGroups]);

  // Dot click → subject profile
  const handleDotClick = useCallback((usubjid: string) => {
    onSubjectClick?.(usubjid);
  }, [onSubjectClick]);

  const allSelected = selectedDoses.size === doseGroups.length;
  const someSelected = selectedDoses.size > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* "All" checkbox */}
      <div
        className="flex items-center gap-1 mb-1 cursor-pointer select-none"
        title="Enable clicking individual dots to open subject profile"
        onClick={handleSelectAll}
      >
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          className="size-3 rounded-[2px]"
          tabIndex={-1}
        />
        <span className="text-[9px] text-muted-foreground">Explore subjects</span>
      </div>

      {/* Sex headers */}
      {!isSingleSex && (
        <div className="flex" style={{ paddingLeft: LEFT_MARGIN }}>
          {sexes.map((sex) => (
            <div key={sex} className="flex-1 text-center text-[9px] font-medium text-muted-foreground mb-0.5">
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
              <div className="text-center text-[9px] font-medium text-muted-foreground mb-0.5">
                {sex}
              </div>
            )}
            <SexPanel
              sex={sex}
              showYAxis={idx === 0}
              grouped={grouped[sex] ?? {}}
              doseGroups={doseGroups}
              vMin={vMin}
              vMax={vMax}
              yTicks={yTicks}
              unit={unit}
              svgHeight={svgHeight}
              hoveredGroup={hoveredGroup}
              hoveredDot={hoveredDot}
              selectedDoses={selectedDoses}
              onGroupEnter={handleGroupEnter}
              onGroupLeave={handleGroupLeave}
              onDotEnter={handleDotEnter}
              onDotLeave={handleDotLeave}
              onDotClick={handleDotClick}
              onDoseClick={handleDoseClick}
            />
            {/* Per-sex dose legend — aligned with SVG columns */}
            <div
              className="mt-0.5 text-[9px] leading-[14px]"
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
          className="absolute pointer-events-none bg-popover text-popover-foreground border border-border rounded px-1.5 py-0.5 text-[9px] shadow-sm whitespace-nowrap z-10"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

// ── Per-sex SVG panel ─────────────────────────────────────

function SexPanel({
  sex,
  showYAxis,
  grouped,
  doseGroups,
  vMin,
  vMax,
  yTicks,
  unit: _unit,
  svgHeight,
  hoveredGroup,
  hoveredDot,
  selectedDoses,
  onGroupEnter,
  onGroupLeave,
  onDotEnter,
  onDotLeave,
  onDotClick,
  onDoseClick,
}: {
  sex: string;
  showYAxis: boolean;
  grouped: Record<number, SubjectValue[]>;
  doseGroups: { doseLevel: number; doseLabel: string }[];
  vMin: number;
  vMax: number;
  yTicks: number[];
  unit: string;
  svgHeight: number;
  hoveredGroup: { sex: string; doseLevel: number } | null;
  hoveredDot: SubjectValue | null;
  selectedDoses: Set<number>;
  onGroupEnter: (sex: string, doseLevel: number, stats: ReturnType<typeof computeStats>, e: React.MouseEvent) => void;
  onGroupLeave: () => void;
  onDotEnter: (sv: SubjectValue, e: React.MouseEvent) => void;
  onDotLeave: () => void;
  onDotClick: (usubjid: string) => void;
  onDoseClick: (doseLevel: number, e: React.MouseEvent) => void;
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

        // Highlight logic
        const isSelected = selectedDoses.has(dg.doseLevel);
        const isGroupHovered = hoveredGroup?.sex === sex && hoveredGroup?.doseLevel === dg.doseLevel;
        const isActive = isSelected || isGroupHovered;
        const isDimmed = !isActive && (selectedDoses.size > 0 || hoveredGroup != null);

        if (nums.length === 0) {
          return (
            <g key={dg.doseLevel}>
              <text
                x={cx} y={PLOT_TOP + PLOT_HEIGHT / 2}
                textAnchor="middle" dominantBaseline="central"
                className="text-[9px]" fill="var(--muted-foreground)" opacity={0.4}
              >
                —
              </text>
            </g>
          );
        }

        const stats = computeStats(nums);
        const showBox = nums.length > BOX_THRESHOLD;

        return (
          <g
            key={dg.doseLevel}
            onMouseEnter={(e) => onGroupEnter(sex, dg.doseLevel, stats, e)}
            onMouseLeave={onGroupLeave}
            style={{ cursor: "default" }}
          >
            {/* Invisible hit area */}
            <rect
              x={cx - colWidth / 2} y={PLOT_TOP}
              width={colWidth} height={PLOT_HEIGHT}
              fill="transparent"
            />

            {/* Box/whisker (vertical, conditional on n > 15) */}
            {showBox && (
              <>
                {/* Whisker line (vertical) */}
                <line
                  x1={cx} y1={yScale(stats.whiskerHi)}
                  x2={cx} y2={yScale(stats.whiskerLo)}
                  stroke={color} strokeWidth={1}
                  opacity={isDimmed ? 0.2 : 0.5}
                />
                {/* Whisker caps (horizontal) */}
                <line
                  x1={cx - 3} y1={yScale(stats.whiskerHi)}
                  x2={cx + 3} y2={yScale(stats.whiskerHi)}
                  stroke={color} strokeWidth={1}
                  opacity={isDimmed ? 0.2 : 0.5}
                />
                <line
                  x1={cx - 3} y1={yScale(stats.whiskerLo)}
                  x2={cx + 3} y2={yScale(stats.whiskerLo)}
                  stroke={color} strokeWidth={1}
                  opacity={isDimmed ? 0.2 : 0.5}
                />
                {/* Box (Q1 to Q3) */}
                <rect
                  x={cx - 5} y={yScale(stats.q3)}
                  width={10} height={yScale(stats.q1) - yScale(stats.q3)}
                  fill={color} fillOpacity={isDimmed ? 0.03 : 0.08}
                  stroke={color} strokeWidth={1}
                  opacity={isDimmed ? 0.2 : 0.5}
                />
                {/* Median line (horizontal) */}
                <line
                  x1={cx - 5} y1={yScale(stats.median)}
                  x2={cx + 5} y2={yScale(stats.median)}
                  stroke={color} strokeWidth={1.5}
                  opacity={isDimmed ? 0.2 : 0.7}
                />
              </>
            )}

            {/* Individual dots (jittered horizontally) */}
            {values.map((sv, i) => {
              const isDotHovered = hoveredDot?.usubjid === sv.usubjid;
              const dotInteractive = isSelected;
              return (
                <circle
                  key={sv.usubjid}
                  cx={cx + jitterX(i, values.length, colWidth)}
                  cy={yScale(sv.value)}
                  r={isDotHovered ? DOT_RADIUS_HOVER : DOT_RADIUS}
                  fill={isActive ? color : "var(--muted-foreground)"}
                  opacity={isDimmed ? 0.15 : isDotHovered ? 1 : isActive ? 0.9 : 0.45}
                  stroke={isDotHovered ? "var(--foreground)" : "none"}
                  strokeWidth={isDotHovered ? 1 : 0}
                  style={{
                    transition: "fill 0.15s, opacity 0.15s, r 0.1s",
                    cursor: dotInteractive ? "pointer" : "default",
                  }}
                  onMouseEnter={dotInteractive ? (e) => { e.stopPropagation(); onDotEnter(sv, e); } : undefined}
                  onMouseLeave={dotInteractive ? (e) => { e.stopPropagation(); onDotLeave(); } : undefined}
                  onClick={dotInteractive ? (e) => { e.stopPropagation(); onDotClick(sv.usubjid); } : undefined}
                />
              );
            })}

            {/* Mean tick (horizontal line) */}
            <line
              x1={cx - MEAN_TICK_HALF} y1={yScale(stats.mean)}
              x2={cx + MEAN_TICK_HALF} y2={yScale(stats.mean)}
              stroke={isActive ? color : "var(--muted-foreground)"}
              strokeWidth={2}
              opacity={isDimmed ? 0.2 : isActive ? 1 : 0.6}
              style={{ transition: "stroke 0.15s, opacity 0.15s" }}
            />
          </g>
        );
      })}

      {/* Dose labels at bottom */}
      {doseGroups.map((dg, colIdx) => {
        const cx = colCenter(colIdx);
        const color = getDoseGroupColor(dg.doseLevel);
        const label = formatDoseShortLabel(dg.doseLabel);
        const isSelected = selectedDoses.has(dg.doseLevel);

        return (
          <g
            key={dg.doseLevel}
            onClick={(e) => onDoseClick(dg.doseLevel, e)}
            style={{ cursor: "pointer" }}
          >
            {/* Colored underline */}
            <line
              x1={cx - colWidth * 0.3} y1={plotBottom + 2}
              x2={cx + colWidth * 0.3} y2={plotBottom + 2}
              stroke={color} strokeWidth={2} strokeLinecap="round"
            />
            {/* Label text */}
            <text
              x={cx} y={plotBottom + 13}
              textAnchor="middle" dominantBaseline="central"
              className="text-[8px]" fill="var(--muted-foreground)"
              fontWeight={isSelected ? 600 : 400}
            >
              {label}
            </text>
          </g>
        );
      })}

    </svg>
  );
}
