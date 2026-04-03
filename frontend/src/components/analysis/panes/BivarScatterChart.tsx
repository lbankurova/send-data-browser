/**
 * Bivariate scatter chart — organ weight vs body weight.
 * X axis: terminal body weight (continuous), Y axis: organ weight (continuous).
 * Dots colored by dose group. Per-group OLS regression lines.
 *
 * Sex-stratified: F panel left, M panel right (shared Y-axis, independent X-axis).
 * Single panel for single-sex studies.
 *
 * Based on Kluxen (2019) — bivariate scatter makes organ-BW relationship
 * self-evident: joint effect, organ-only, BW-only, or no relationship.
 */
import { useMemo, useState, useRef, useCallback } from "react";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { computeNiceTicks, shortId } from "@/lib/chart-utils";

// ── Types ─────────────────────────────────────────────────

export interface BivarSubjectValue {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  organ_weight: number;
  body_weight: number;
}

export interface BivarScatterChartProps {
  subjects: BivarSubjectValue[];
  organUnit: string;
  bwUnit: string;
  sexes: string[];
  doseGroups: { doseLevel: number; doseLabel: string }[];
  onSubjectClick?: (usubjid: string) => void;
  influentialSubject?: string;
}

// ── Layout constants ──────────────────────────────────────

const PLOT_TOP = 8;
const PLOT_BOTTOM = 32;      // X-axis label + tick labels
const LEFT_MARGIN = 36;      // Y-axis tick labels (first panel)
const INNER_LEFT_MARGIN = 8; // second panel left gap (no Y labels)
const PLOT_RIGHT = 8;
const DOT_RADIUS = 2.5;
const DOT_RADIUS_HOVER = 3.5;
const LOO_COLOR = "#92400e";
const SEX_LABEL_HEIGHT = 14;
const MIN_REGRESSION_N = 4;

// ── OLS regression ────────────────────────────────────────

function olsRegression(
  points: { x: number; y: number }[],
): { slope: number; intercept: number } | null {
  if (points.length < MIN_REGRESSION_N) return null;
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ── Component ─────────────────────────────────────────────

export function BivarScatterChart({
  subjects,
  organUnit,
  bwUnit,
  sexes,
  doseGroups,
  onSubjectClick,
  influentialSubject,
}: BivarScatterChartProps) {
  const [hoveredDot, setHoveredDot] = useState<BivarSubjectValue | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Group by sex
  const bySex = useMemo(() => {
    const map: Record<string, BivarSubjectValue[]> = {};
    for (const sex of sexes) map[sex] = [];
    for (const s of subjects) map[s.sex]?.push(s);
    return map;
  }, [subjects, sexes]);

  // Global Y domain (organ weight) — shared across sex panels
  const [yMin, yMax] = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of subjects) {
      if (s.organ_weight < lo) lo = s.organ_weight;
      if (s.organ_weight > hi) hi = s.organ_weight;
    }
    if (!isFinite(lo)) return [0, 1];
    const pad = (hi - lo) * 0.08 || 0.5;
    return [lo - pad, hi + pad];
  }, [subjects]);

  // Per-sex X domain (body weight) — independent
  const xDomains = useMemo(() => {
    const result: Record<string, [number, number]> = {};
    for (const sex of sexes) {
      const vals = bySex[sex];
      let lo = Infinity, hi = -Infinity;
      for (const s of vals) {
        if (s.body_weight < lo) lo = s.body_weight;
        if (s.body_weight > hi) hi = s.body_weight;
      }
      if (!isFinite(lo)) { result[sex] = [0, 1]; continue; }
      const pad = (hi - lo) * 0.08 || 0.5;
      result[sex] = [lo - pad, hi + pad];
    }
    return result;
  }, [bySex, sexes]);

  const yTicks = useMemo(() => computeNiceTicks(yMin, yMax), [yMin, yMax]);
  const xTicksBySex = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const sex of sexes) {
      const [lo, hi] = xDomains[sex];
      result[sex] = computeNiceTicks(lo, hi);
    }
    return result;
  }, [xDomains, sexes]);

  // Per-sex, per-dose regression lines
  const regressions = useMemo(() => {
    const result: Record<string, Record<number, { slope: number; intercept: number } | null>> = {};
    for (const sex of sexes) {
      result[sex] = {};
      for (const dg of doseGroups) {
        const pts = bySex[sex]
          .filter((s) => s.dose_level === dg.doseLevel)
          .map((s) => ({ x: s.body_weight, y: s.organ_weight }));
        result[sex][dg.doseLevel] = olsRegression(pts);
      }
    }
    return result;
  }, [bySex, sexes, doseGroups]);

  // Tooltip handlers
  const handleDotEnter = useCallback((sv: BivarSubjectValue, e: React.MouseEvent) => {
    setHoveredDot(sv);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const suffix = influentialSubject === sv.usubjid ? " -- LOO" : "";
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
        text: `${shortId(sv.usubjid)} (${sv.sex}) BW: ${sv.body_weight.toFixed(1)} ${bwUnit}, OW: ${sv.organ_weight.toFixed(3)} ${organUnit}${suffix}`,
      });
    }
  }, [bwUnit, organUnit, influentialSubject]);

  const handleDotLeave = useCallback(() => {
    setHoveredDot(null);
    setTooltip(null);
  }, []);

  const handleDotClick = useCallback((usubjid: string) => {
    onSubjectClick?.(usubjid);
  }, [onSubjectClick]);

  // ResizeObserver
  const [dims, setDims] = useState({ width: 500, height: 250 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const measuredRef = useCallback((node: HTMLDivElement | null) => {
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
  const isSingleSex = sexes.length === 1;
  const panelGap = isSingleSex ? 0 : 6;

  // Panel layout: first panel gets LEFT_MARGIN (for Y labels), second gets INNER_LEFT_MARGIN
  const firstPanelLeft = LEFT_MARGIN;
  const secondPanelLeft = INNER_LEFT_MARGIN;
  const totalLeftMargins = firstPanelLeft + (isSingleSex ? 0 : secondPanelLeft);
  const totalRight = PLOT_RIGHT * (isSingleSex ? 1 : 2);
  const availableWidth = width - totalLeftMargins - totalRight - panelGap;
  const panelWidth = isSingleSex ? availableWidth : availableWidth / 2;

  const plotHeight = Math.max(60, height - PLOT_TOP - PLOT_BOTTOM - SEX_LABEL_HEIGHT);
  const plotBottom = PLOT_TOP + SEX_LABEL_HEIGHT + plotHeight;

  // Scale helpers per panel
  const yScale = (v: number) =>
    PLOT_TOP + SEX_LABEL_HEIGHT + plotHeight * (1 - (v - yMin) / (yMax - yMin));

  const xScale = (sex: string, v: number) => {
    const [lo, hi] = xDomains[sex];
    const range = hi - lo;
    if (range === 0) return panelWidth / 2;
    return (v - lo) / range * panelWidth;
  };

  // Panel X offset
  const panelXOffset = (panelIdx: number) => {
    if (panelIdx === 0) return firstPanelLeft;
    return firstPanelLeft + panelWidth + PLOT_RIGHT + panelGap + secondPanelLeft;
  };

  const renderPanel = (sex: string, panelIdx: number) => {
    const offsetX = panelXOffset(panelIdx);
    const sexSubjects = bySex[sex];
    const xTicks = xTicksBySex[sex];
    const [xLo, xHi] = xDomains[sex];
    const showYLabels = panelIdx === 0;

    return (
      <g key={sex} transform={`translate(${offsetX}, 0)`}>
        {/* Sex label */}
        <text
          x={panelWidth / 2}
          y={PLOT_TOP + SEX_LABEL_HEIGHT - 3}
          textAnchor="middle"
          className="text-[10px] font-medium"
          fill="var(--muted-foreground)"
        >
          {sex === "F" ? "Female" : "Male"}
        </text>

        {/* Horizontal grid lines */}
        {yTicks.map((t) => (
          <line
            key={t}
            x1={0} y1={yScale(t)}
            x2={panelWidth} y2={yScale(t)}
            stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2"
          />
        ))}

        {/* Vertical grid lines */}
        {xTicks.map((t) => (
          <line
            key={t}
            x1={xScale(sex, t)} y1={PLOT_TOP + SEX_LABEL_HEIGHT}
            x2={xScale(sex, t)} y2={plotBottom}
            stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2"
          />
        ))}

        {/* Y-axis tick labels (first panel only) */}
        {showYLabels && yTicks.map((t) => (
          <text
            key={t}
            x={-3} y={yScale(t)}
            textAnchor="end" dominantBaseline="central"
            className="text-[8px]" fill="var(--muted-foreground)"
          >
            {t % 1 === 0 ? t : t.toFixed(2)}
          </text>
        ))}

        {/* X-axis tick labels */}
        {xTicks.map((t) => (
          <text
            key={t}
            x={xScale(sex, t)} y={plotBottom + 10}
            textAnchor="middle"
            className="text-[8px]" fill="var(--muted-foreground)"
          >
            {t % 1 === 0 ? t : t.toFixed(1)}
          </text>
        ))}

        {/* X-axis label */}
        <text
          x={panelWidth / 2}
          y={plotBottom + 24}
          textAnchor="middle"
          className="text-[9px]" fill="var(--muted-foreground)"
        >
          Terminal BW{bwUnit ? ` (${bwUnit})` : ""}
        </text>

        {/* Regression lines (behind dots) */}
        {doseGroups.map((dg) => {
          const reg = regressions[sex]?.[dg.doseLevel];
          if (!reg) return null;
          const xLineStart = Math.max(xLo, xDomains[sex][0]);
          const xLineEnd = Math.min(xHi, xDomains[sex][1]);
          // Clip to the per-group BW range
          const groupPts = sexSubjects.filter((s) => s.dose_level === dg.doseLevel);
          if (groupPts.length === 0) return null;
          const gXMin = Math.min(...groupPts.map((s) => s.body_weight));
          const gXMax = Math.max(...groupPts.map((s) => s.body_weight));
          const x1 = Math.max(xLineStart, gXMin);
          const x2 = Math.min(xLineEnd, gXMax);
          return (
            <line
              key={dg.doseLevel}
              x1={xScale(sex, x1)}
              y1={yScale(reg.slope * x1 + reg.intercept)}
              x2={xScale(sex, x2)}
              y2={yScale(reg.slope * x2 + reg.intercept)}
              stroke={getDoseGroupColor(dg.doseLevel)}
              strokeWidth={1.5}
              opacity={0.6}
            />
          );
        })}

        {/* Dots */}
        {sexSubjects.map((s) => {
          const cx = xScale(sex, s.body_weight);
          const cy = yScale(s.organ_weight);
          const isHovered = hoveredDot === s;
          const isInfluential = influentialSubject === s.usubjid;
          const r = isHovered ? DOT_RADIUS_HOVER : DOT_RADIUS;
          return (
            <g key={s.usubjid}>
              {isInfluential && (
                <circle
                  cx={cx} cy={cy} r={r + 2}
                  fill="none" stroke={LOO_COLOR} strokeWidth={1.5}
                />
              )}
              <circle
                cx={cx} cy={cy} r={r}
                fill={getDoseGroupColor(s.dose_level)}
                opacity={isHovered ? 1 : 0.75}
                className="cursor-pointer"
                onMouseEnter={(e) => handleDotEnter(s, e)}
                onMouseLeave={handleDotLeave}
                onClick={() => handleDotClick(s.usubjid)}
              />
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div ref={containerRef} className="relative h-full">
      <div ref={measuredRef} className="w-full h-full">
        <svg
          className="w-full h-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* Y-axis label (rotated, left edge) */}
          <text
            x={10}
            y={PLOT_TOP + SEX_LABEL_HEIGHT + plotHeight / 2}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-90, 10, ${PLOT_TOP + SEX_LABEL_HEIGHT + plotHeight / 2})`}
            className="text-[9px]" fill="var(--muted-foreground)"
          >
            {organUnit}
          </text>

          {sexes.map((sex, i) => renderPanel(sex, i))}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 rounded border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-sm whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
