/**
 * Strip/dot plot for endpoints with too few timepoints for a line chart.
 * Shows individual subject values by dose group, split by sex (F left, M right).
 * Conditionally adds box/whisker overlay when group n > 15.
 *
 * Interaction:
 * - Hover dose row → highlight group on that panel, show group tooltip (n, mean, SD)
 * - Click dose label → select dose, highlight on both panels, enable per-dot hover
 * - Hover dot (when dose selected) → show individual tooltip (USUBJID, value)
 * - Click dot → open subject profile panel
 *
 * Layout matches RecoveryDumbbellChart: HTML dose labels (with colored pipe)
 * + inline SVG panels per sex.
 */
import { useMemo, useState, useRef, useCallback } from "react";
import { getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";
import { DoseLabel } from "@/components/ui/DoseLabel";

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
}

// ── Layout constants ──────────────────────────────────────

const ROW_HEIGHT = 32;
const PLOT_LEFT = 4;
const PLOT_RIGHT = 8;
const PLOT_TOP = 4;
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

// ── Jitter (deterministic by index) ───────────────────────

function jitterY(index: number, count: number): number {
  if (count <= 1) return 0;
  const span = Math.min(ROW_HEIGHT * 0.35, count * 1.5);
  return ((index / (count - 1)) - 0.5) * span;
}

// ── X-axis tick computation ───────────────────────────────

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

// ── Short subject ID ──────────────────────────────────────

function shortId(usubjid: string): string {
  // "STUDY-001" → "001", "PCDR-0034-1001" → "1001"
  const parts = usubjid.split("-");
  return parts[parts.length - 1];
}

// ── Component ─────────────────────────────────────────────

export function StripPlotChart({ subjects, unit, sexes, doseGroups, onSubjectClick }: StripPlotChartProps) {
  const [hoveredGroup, setHoveredGroup] = useState<{ sex: string; doseLevel: number } | null>(null);
  const [hoveredDot, setHoveredDot] = useState<SubjectValue | null>(null);
  const [selectedDose, setSelectedDose] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const xTicks = useMemo(() => computeNiceTicks(vMin, vMax), [vMin, vMax]);

  const svgHeight = PLOT_TOP + doseGroups.length * ROW_HEIGHT + 18;
  const isSingleSex = sexes.length === 1;

  // Group-level hover (no dose selected)
  const handleGroupEnter = useCallback((sex: string, doseLevel: number, stats: ReturnType<typeof computeStats>, e: React.MouseEvent) => {
    if (selectedDose != null) return; // group hover disabled when dose is selected
    setHoveredGroup({ sex, doseLevel });
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
        text: `n=${stats.n}  mean=${stats.mean.toFixed(2)}  SD=${stats.sd.toFixed(2)}`,
      });
    }
  }, [selectedDose]);

  const handleGroupLeave = useCallback(() => {
    if (selectedDose != null) return;
    setHoveredGroup(null);
    setTooltip(null);
  }, [selectedDose]);

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

  // Dose label click → toggle selection
  const handleDoseClick = useCallback((doseLevel: number) => {
    setSelectedDose((prev) => prev === doseLevel ? null : doseLevel);
    setHoveredGroup(null);
    setHoveredDot(null);
    setTooltip(null);
  }, []);

  // Dot click → subject profile
  const handleDotClick = useCallback((usubjid: string) => {
    onSubjectClick?.(usubjid);
  }, [onSubjectClick]);

  return (
    <div ref={containerRef} className="relative">
      {/* Sex headers */}
      {!isSingleSex && (
        <div className="flex gap-1.5" style={{ paddingLeft: 60 }}>
          {sexes.map((sex) => (
            <div key={sex} className="flex-1 text-center text-[9px] font-medium text-muted-foreground mb-0.5">
              {sex}
            </div>
          ))}
        </div>
      )}

      {/* Chart area: dose labels + SVG panels */}
      <div className="flex gap-1.5">
        {/* Shared dose labels column */}
        <div className="w-[56px] shrink-0 flex flex-col">
          {doseGroups.map((dg) => (
            <div
              key={dg.doseLevel}
              className="flex items-center justify-end cursor-pointer"
              style={{ height: ROW_HEIGHT }}
              onClick={() => handleDoseClick(dg.doseLevel)}
            >
              <DoseLabel
                level={dg.doseLevel}
                label={formatDoseShortLabel(dg.doseLabel)}
                align="right"
                className={`text-[9px] ${selectedDose === dg.doseLevel ? "font-semibold" : ""}`}
              />
            </div>
          ))}
        </div>

        {/* SVG panels per sex */}
        {sexes.map((sex, idx) => (
          <div key={sex} className="flex-1 min-w-0 flex">
            {idx > 0 && <div className="w-px bg-border/30 mr-1.5" />}
            <div className="flex-1 min-w-0">
              {isSingleSex && (
                <div className="text-center text-[9px] font-medium text-muted-foreground mb-0.5">
                  {sex}
                </div>
              )}
              <SexPanel
                sex={sex}
                grouped={grouped[sex] ?? {}}
                doseGroups={doseGroups}
                vMin={vMin}
                vMax={vMax}
                xTicks={xTicks}
                unit={unit}
                svgHeight={svgHeight}
                hoveredGroup={hoveredGroup}
                hoveredDot={hoveredDot}
                selectedDose={selectedDose}
                onGroupEnter={handleGroupEnter}
                onGroupLeave={handleGroupLeave}
                onDotEnter={handleDotEnter}
                onDotLeave={handleDotLeave}
                onDotClick={handleDotClick}
              />
            </div>
          </div>
        ))}
      </div>

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
  grouped,
  doseGroups,
  vMin,
  vMax,
  xTicks,
  unit,
  svgHeight,
  hoveredGroup,
  hoveredDot,
  selectedDose,
  onGroupEnter,
  onGroupLeave,
  onDotEnter,
  onDotLeave,
  onDotClick,
}: {
  sex: string;
  grouped: Record<number, SubjectValue[]>;
  doseGroups: { doseLevel: number; doseLabel: string }[];
  vMin: number;
  vMax: number;
  xTicks: number[];
  unit: string;
  svgHeight: number;
  hoveredGroup: { sex: string; doseLevel: number } | null;
  hoveredDot: SubjectValue | null;
  selectedDose: number | null;
  onGroupEnter: (sex: string, doseLevel: number, stats: ReturnType<typeof computeStats>, e: React.MouseEvent) => void;
  onGroupLeave: () => void;
  onDotEnter: (sv: SubjectValue, e: React.MouseEvent) => void;
  onDotLeave: () => void;
  onDotClick: (usubjid: string) => void;
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

  const plotWidth = width - PLOT_LEFT - PLOT_RIGHT;
  const xScale = (v: number) => PLOT_LEFT + ((v - vMin) / (vMax - vMin)) * plotWidth;
  const plotBottom = PLOT_TOP + doseGroups.length * ROW_HEIGHT;

  return (
    <svg
      ref={measuredRef}
      className="w-full"
      viewBox={`0 0 ${width} ${svgHeight}`}
      preserveAspectRatio="xMinYMin meet"
      style={{ height: svgHeight }}
    >
      {/* Grid lines */}
      {xTicks.map((t) => (
        <line
          key={t}
          x1={xScale(t)} y1={PLOT_TOP}
          x2={xScale(t)} y2={plotBottom}
          stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2"
        />
      ))}

      {/* Per-dose-group rows */}
      {doseGroups.map((dg, rowIdx) => {
        const values = grouped[dg.doseLevel] ?? [];
        const cy = PLOT_TOP + rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const nums = values.map((v) => v.value);
        const color = getDoseGroupColor(dg.doseLevel);

        // Highlight logic
        const isSelected = selectedDose === dg.doseLevel;
        const isGroupHovered = hoveredGroup?.sex === sex && hoveredGroup?.doseLevel === dg.doseLevel;
        const isActive = isSelected || isGroupHovered;
        const isDimmed = (selectedDose != null && !isSelected) ||
          (hoveredGroup != null && selectedDose == null && !isGroupHovered);

        if (nums.length === 0) {
          return (
            <g key={dg.doseLevel}>
              <text
                x={xScale((vMin + vMax) / 2)} y={cy}
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
              x={PLOT_LEFT} y={cy - ROW_HEIGHT / 2}
              width={plotWidth} height={ROW_HEIGHT}
              fill="transparent"
            />

            {/* Box/whisker (conditional on n > 15) */}
            {showBox && (
              <>
                <line
                  x1={xScale(stats.whiskerLo)} y1={cy}
                  x2={xScale(stats.whiskerHi)} y2={cy}
                  stroke={color} strokeWidth={1}
                  opacity={isDimmed ? 0.2 : 0.5}
                />
                <line
                  x1={xScale(stats.whiskerLo)} y1={cy - 3}
                  x2={xScale(stats.whiskerLo)} y2={cy + 3}
                  stroke={color} strokeWidth={1}
                  opacity={isDimmed ? 0.2 : 0.5}
                />
                <line
                  x1={xScale(stats.whiskerHi)} y1={cy - 3}
                  x2={xScale(stats.whiskerHi)} y2={cy + 3}
                  stroke={color} strokeWidth={1}
                  opacity={isDimmed ? 0.2 : 0.5}
                />
                <rect
                  x={xScale(stats.q1)} y={cy - 5}
                  width={xScale(stats.q3) - xScale(stats.q1)} height={10}
                  fill={color} fillOpacity={isDimmed ? 0.03 : 0.08}
                  stroke={color} strokeWidth={1}
                  opacity={isDimmed ? 0.2 : 0.5}
                />
                <line
                  x1={xScale(stats.median)} y1={cy - 5}
                  x2={xScale(stats.median)} y2={cy + 5}
                  stroke={color} strokeWidth={1.5}
                  opacity={isDimmed ? 0.2 : 0.7}
                />
              </>
            )}

            {/* Individual dots */}
            {values.map((sv, i) => {
              const isDotHovered = hoveredDot?.usubjid === sv.usubjid;
              const dotInteractive = isSelected;
              return (
                <circle
                  key={sv.usubjid}
                  cx={xScale(sv.value)}
                  cy={cy + jitterY(i, values.length)}
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

            {/* Mean tick */}
            <line
              x1={xScale(stats.mean)} y1={cy - MEAN_TICK_HALF}
              x2={xScale(stats.mean)} y2={cy + MEAN_TICK_HALF}
              stroke={isActive ? color : "var(--muted-foreground)"}
              strokeWidth={2}
              opacity={isDimmed ? 0.2 : isActive ? 1 : 0.6}
              style={{ transition: "stroke 0.15s, opacity 0.15s" }}
            />
          </g>
        );
      })}

      {/* X-axis tick labels */}
      {xTicks.map((t) => (
        <text
          key={t}
          x={xScale(t)} y={plotBottom + 10}
          textAnchor="middle" className="text-[8px]" fill="var(--muted-foreground)"
        >
          {t % 1 === 0 ? t : t.toFixed(1)}
        </text>
      ))}

      {/* Unit label */}
      {unit && (
        <text
          x={xScale((vMin + vMax) / 2)} y={plotBottom + 17}
          textAnchor="middle" className="text-[7px]" fill="var(--muted-foreground)" opacity={0.6}
        >
          {unit}
        </text>
      )}
    </svg>
  );
}
