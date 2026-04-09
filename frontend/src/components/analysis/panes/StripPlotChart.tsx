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
import type { HcdReference } from "@/types/analysis-views";

// ── Types ─────────────────────────────────────────────────

interface SubjectValue {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  value: number;
}

/** Detection window bounds for a single dose group + sex combination. */
export interface DetectionWindow {
  doseLevel: number;
  sex: string;
  windowLo: number;
  windowHi: number;
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
  /** LOO-influential animals: USUBJID -> dose_level + control-side flag.
   *  Control-side: gray fill + dose-colored stroke. Treated-side: amber fill. */
  influentialSubjects?: ReadonlyMap<string, { doseLevel: number; isControlSide: boolean }>;
  /** When true, only LOO-influential subjects are rendered (legend filter active). */
  isolateInfluential?: boolean;
  /** Endpoint label for scoping animal exclusions. */
  endpointLabel?: string;
  /** USUBJIDs currently excluded (pending or committed). Rendered as cross marks. */
  excludedSubjects?: ReadonlySet<string>;
  /** Callback when user right-clicks a dot to toggle exclusion. */
  onToggleExclusion?: (usubjid: string) => void;
  /** Detection window bands per dose group + sex — rendered as faint background rects. */
  detectionWindows?: DetectionWindow[];
  /** HCD references keyed by sex — rendered as dashed mean line + faint band + marginal density. */
  hcdBySex?: Partial<Record<string, HcdReference>>;
}

// ── Layout constants ──────────────────────────────────────

const PLOT_HEIGHT = 165;
const PLOT_TOP = 4;
const PLOT_BOTTOM = 26; // dose labels + unit
const LEFT_MARGIN = 30; // Y-axis tick labels (first panel only uses it)
const HCD_DENSITY_WIDTH = 18; // extra left margin for HCD marginal density
const PLOT_RIGHT = 6;
const DOT_RADIUS = 2.5;
const DOT_RADIUS_HOVER = 3.5;
const MEAN_TICK_HALF = 5;
const BOX_THRESHOLD = 5;
export const LOO_INFLUENTIAL_COLOR = "#92400e"; // amber-800 — amber-brown for LOO influential marker

// ── HCD density helpers ──────────────────────────────────

interface DensityPoint { y: number; density: number }

interface DensityResult { points: DensityPoint[]; zerosExcluded: number }

function computeHcdDensity(ref: HcdReference): DensityResult {
  if (ref.values && ref.values.length >= 2) {
    // Empirical histogram from individual-animal data
    let vals = ref.values;
    let zerosExcluded = 0;
    if (ref.isLognormal) {
      zerosExcluded = vals.filter((v) => v <= 0).length;
      vals = vals.filter((v) => v > 0);
    }
    if (vals.length < 2) return { points: [], zerosExcluded };
    const sorted = [...vals].sort((a, b) => a - b);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    if (hi - lo < 1e-12) return { points: [{ y: lo, density: 1 }], zerosExcluded };
    const nBins = Math.min(15, Math.max(5, Math.ceil(Math.sqrt(vals.length))));

    if (ref.isLognormal && lo > 0) {
      // Log-space binning for lognormal endpoints (right-skewed)
      const logLo = Math.log(lo), logHi = Math.log(hi);
      const logBinWidth = (logHi - logLo) / nBins;
      const bins: number[] = new Array(nBins).fill(0);
      for (const v of vals) {
        const idx = Math.min(Math.floor((Math.log(v) - logLo) / logBinWidth), nBins - 1);
        bins[idx]++;
      }
      const maxCount = Math.max(...bins);
      if (maxCount === 0) return { points: [], zerosExcluded };
      const points: DensityPoint[] = [];
      for (let i = 0; i < nBins; i++) {
        points.push({ y: Math.exp(logLo + (i + 0.5) * logBinWidth), density: bins[i] / maxCount });
      }
      return { points, zerosExcluded };
    }

    // Linear-space binning for normal endpoints
    const binWidth = (hi - lo) / nBins;
    const bins: number[] = new Array(nBins).fill(0);
    for (const v of vals) {
      const idx = Math.min(Math.floor((v - lo) / binWidth), nBins - 1);
      bins[idx]++;
    }
    const maxCount = Math.max(...bins);
    if (maxCount === 0) return { points: [], zerosExcluded };
    const points: DensityPoint[] = [];
    for (let i = 0; i < nBins; i++) {
      points.push({ y: lo + (i + 0.5) * binWidth, density: bins[i] / maxCount });
    }
    return { points, zerosExcluded };
  }

  // Parametric density
  const nPts = 25;
  const lower = ref.lower;
  const upper = ref.upper;
  if (upper - lower < 1e-12) return { points: [], zerosExcluded: 0 };

  if (ref.isLognormal) {
    // Lognormal PDF
    const gm = ref.geom_mean;
    let muLog: number, sigmaLog: number;
    if (gm != null && gm > 0) {
      muLog = Math.log(gm);
      sigmaLog = (Math.log(upper) - Math.log(lower)) / (2 * 1.96);
    } else if (ref.mean != null && ref.sd != null && ref.mean > 0 && ref.sd > 0) {
      const cv = ref.sd / ref.mean;
      if (cv > 1.5) {
        // High CV — fall back to normal
        return { points: normalDensity(ref.mean, ref.sd, lower, upper, nPts), zerosExcluded: 0 };
      }
      const sls = Math.log(1 + cv * cv);
      muLog = Math.log(ref.mean) - sls / 2;
      sigmaLog = Math.sqrt(sls);
    } else {
      return { points: [], zerosExcluded: 0 };
    }
    if (sigmaLog <= 0) return { points: [], zerosExcluded: 0 };
    const step = (upper - lower) / (nPts - 1);
    const points: DensityPoint[] = [];
    let maxD = 0;
    for (let i = 0; i < nPts; i++) {
      const x = lower + i * step;
      if (x <= 0) continue;
      const lx = Math.log(x);
      const d = Math.exp(-0.5 * ((lx - muLog) / sigmaLog) ** 2) / (x * sigmaLog);
      points.push({ y: x, density: d });
      if (d > maxD) maxD = d;
    }
    if (maxD > 0) for (const p of points) p.density /= maxD;
    return { points, zerosExcluded: 0 };
  }

  // Normal PDF
  const m = ref.mean ?? (lower + upper) / 2;
  const s = ref.sd ?? (upper - lower) / 4;
  return { points: normalDensity(m, s, lower, upper, nPts), zerosExcluded: 0 };
}

function normalDensity(mean: number, sd: number, lower: number, upper: number, nPts: number): DensityPoint[] {
  if (sd <= 0) return [];
  const step = (upper - lower) / (nPts - 1);
  const points: DensityPoint[] = [];
  let maxD = 0;
  for (let i = 0; i < nPts; i++) {
    const x = lower + i * step;
    const d = Math.exp(-0.5 * ((x - mean) / sd) ** 2);
    points.push({ y: x, density: d });
    if (d > maxD) maxD = d;
  }
  if (maxD > 0) for (const p of points) p.density /= maxD;
  return points;
}

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

export function StripPlotChart({ subjects, unit, sexes, doseGroups, onSubjectClick, mode = "terminal", interleaved = false, influentialSubjects, isolateInfluential, excludedSubjects, onToggleExclusion, detectionWindows, hcdBySex }: StripPlotChartProps) {
  const [hoveredDot, setHoveredDot] = useState<SubjectValue | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; sv: SubjectValue } | null>(null);
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

  // Global value domain across all sexes (includes HCD bounds when present)
  const [vMin, vMax] = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of subjects) {
      if (s.value < lo) lo = s.value;
      if (s.value > hi) hi = s.value;
    }
    // Extend domain to include HCD reference bounds
    if (hcdBySex) {
      for (const ref of Object.values(hcdBySex)) {
        if (ref) {
          if (ref.lower < lo) lo = ref.lower;
          if (ref.upper > hi) hi = ref.upper;
        }
      }
    }
    if (!isFinite(lo)) return [0, 1];
    const pad = (hi - lo) * 0.08 || 0.5;
    return [lo - pad, hi + pad];
  }, [subjects, hcdBySex]);

  const yTicks = useMemo(() => computeNiceTicks(vMin, vMax), [vMin, vMax]);

  const svgHeight = PLOT_TOP + PLOT_HEIGHT + PLOT_BOTTOM;
  const isSingleSex = sexes.length === 1;

  // Dot-level hover
  const handleDotEnter = useCallback((sv: SubjectValue, e: React.MouseEvent) => {
    setHoveredDot(sv);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const isExcl = excludedSubjects?.has(sv.usubjid);
      const isInfl = influentialSubjects?.has(sv.usubjid);
      const suffix = isExcl ? " -- excluded" : isInfl ? " -- LOO influential" : "";
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
        text: `${shortId(sv.usubjid)}  ${sv.value.toFixed(2)} ${unit}${suffix}`,
      });
    }
  }, [unit, influentialSubjects, excludedSubjects]);

  const handleDotLeave = useCallback(() => {
    setHoveredDot(null);
    setTooltip(null);
  }, []);

  // Right-click context menu for animal exclusion
  const handleDotContextMenu = useCallback((sv: SubjectValue, e: React.MouseEvent) => {
    if (!onToggleExclusion) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, sv });
    }
  }, [onToggleExclusion]);

  const handleCtxMenuAction = useCallback(() => {
    if (ctxMenu && onToggleExclusion) {
      onToggleExclusion(ctxMenu.sv.usubjid);
    }
    setCtxMenu(null);
  }, [ctxMenu, onToggleExclusion]);

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
            isolateInfluential={isolateInfluential}
            excludedSubjects={excludedSubjects}
            onToggleExclusion={onToggleExclusion}
            handleDotContextMenu={handleDotContextMenu}
            detectionWindows={detectionWindows}
            hcdBySex={hcdBySex}
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
        {ctxMenu && (
          <div
            className="absolute bg-popover text-popover-foreground border border-border rounded shadow-md z-20 text-[11px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <button
              className="px-3 py-1.5 hover:bg-muted w-full text-left whitespace-nowrap"
              onClick={handleCtxMenuAction}
              onBlur={() => setCtxMenu(null)}
              autoFocus
            >
              {excludedSubjects?.has(ctxMenu.sv.usubjid) ? "Include in stats" : "Exclude from stats"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Separate mode (original) ─────────────────────────────

  const hasHcd = !!hcdBySex && Object.values(hcdBySex).some(Boolean);
  const sepLeftMargin = LEFT_MARGIN + (hasHcd ? HCD_DENSITY_WIDTH : 0);

  return (
    <div ref={containerRef} className="relative">
      {/* Sex headers */}
      {!isSingleSex && (
        <div className="flex" style={{ paddingLeft: sepLeftMargin }}>
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
              sex={sex}
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
              isolateInfluential={isolateInfluential}
              excludedSubjects={excludedSubjects}
              onToggleExclusion={onToggleExclusion}
              handleDotContextMenu={handleDotContextMenu}
              detectionWindows={detectionWindows}
              hcdRef={hcdBySex?.[sex]}
            />
            {/* Per-sex dose legend — aligned with SVG columns */}
            <div
              className="mt-1 text-[10px] leading-[14px]"
              style={{ paddingLeft: idx === 0 ? sepLeftMargin : 6, paddingRight: PLOT_RIGHT }}
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
      {ctxMenu && (
        <div
          className="absolute bg-popover text-popover-foreground border border-border rounded shadow-md z-20 text-[11px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            className="px-3 py-1.5 hover:bg-muted w-full text-left whitespace-nowrap"
            onClick={handleCtxMenuAction}
            onBlur={() => setCtxMenu(null)}
            autoFocus
          >
            {excludedSubjects?.has(ctxMenu.sv.usubjid) ? "Include in stats" : "Exclude from stats"}
          </button>
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
  isolateInfluential,
  excludedSubjects,
  onToggleExclusion,
  handleDotContextMenu,
  detectionWindows,
  hcdBySex,
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
  influentialSubjects?: ReadonlyMap<string, { doseLevel: number; isControlSide: boolean }>;
  isolateInfluential?: boolean;
  excludedSubjects?: ReadonlySet<string>;
  onToggleExclusion?: (usubjid: string) => void;
  handleDotContextMenu: (sv: SubjectValue, e: React.MouseEvent) => void;
  detectionWindows?: DetectionWindow[];
  hcdBySex?: Partial<Record<string, HcdReference>>;
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

  const hasHcd = !!hcdBySex && Object.values(hcdBySex).some(Boolean);
  const effectiveLeftMargin = LEFT_MARGIN + (hasHcd ? HCD_DENSITY_WIDTH : 0);
  const { width, height } = dims;
  const bottomMargin = PLOT_BOTTOM;
  const plotHeight = Math.max(60, height - PLOT_TOP - bottomMargin);
  const plotWidth = width - effectiveLeftMargin - PLOT_RIGHT;
  const numCols = doseGroups.length;
  const nominalColWidth = numCols > 0 ? plotWidth / numCols : plotWidth;
  const interGroupGap = numCols > 1 ? nominalColWidth * 0.2 : 0;
  const colWidth = numCols > 1
    ? (plotWidth - (numCols - 1) * interGroupGap) / numCols
    : nominalColWidth;
  const plotBottom = PLOT_TOP + plotHeight;

  const colCenter = (colIdx: number) =>
    effectiveLeftMargin + colIdx * (colWidth + interGroupGap) + colWidth / 2;
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
      {/* HCD marginal density — in left margin area */}
      {hasHcd && (() => {
        // Interleaved mode density: combined if F/M similar (<20% mean diff), side-by-side if different
        const refs = hcdBySex ? Object.values(hcdBySex).filter(Boolean) as HcdReference[] : [];
        if (refs.length === 0) return null;
        const densityX = LEFT_MARGIN;
        const maxW = HCD_DENSITY_WIDTH - 2;

        // Check if F and M differ substantially (>20% mean difference)
        const meanF = refs.find((r) => r.sex === "F")?.mean ?? refs.find((r) => r.sex === "F")?.geom_mean;
        const meanM = refs.find((r) => r.sex === "M")?.mean ?? refs.find((r) => r.sex === "M")?.geom_mean;
        const useSideBySide = refs.length === 2 && meanF != null && meanM != null && meanF > 0 && meanM > 0
          && Math.abs(meanF - meanM) / Math.max(meanF, meanM) > 0.2;

        if (useSideBySide) {
          // Two half-width densities side by side
          const halfW = maxW / 2;
          return (
            <g>
              {refs.map((ref, ri) => {
                const { points: density, zerosExcluded } = computeHcdDensity(ref);
                if (density.length === 0) return null;
                const offsetX = densityX + ri * halfW;
                return (
                  <g key={ref.sex}>
                    <path
                      d={density.map((p, i) => `${i === 0 ? "M" : "L"}${offsetX + p.density * halfW},${yScale(p.y)}`).join(" ")
                        + density.map((_, i) => `L${offsetX},${yScale(density[density.length - 1 - i].y)}`).join(" ") + "Z"}
                      fill={getSexColor(ref.sex)} fillOpacity={0.08} stroke="none"
                    />
                    {zerosExcluded > 0 && (
                      <text x={offsetX + 1} y={PLOT_TOP + 6 + ri * 8} className="text-[6px]" fill="var(--muted-foreground)" opacity={0.4}>
                        ({zerosExcluded} zeros excl.)
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        }

        // Combined single density from first available ref
        const ref = refs[0];
        const { points: density, zerosExcluded } = computeHcdDensity(ref);
        if (density.length === 0) return null;
        return (
          <g>
            <path
              d={density.map((p, i) => `${i === 0 ? "M" : "L"}${densityX + p.density * maxW},${yScale(p.y)}`).join(" ")
                + density.map((_, i) => `L${densityX},${yScale(density[density.length - 1 - i].y)}`).join(" ") + "Z"}
              fill="rgba(0,0,0,0.06)" stroke="none"
            />
            {zerosExcluded > 0 && (
              <text x={densityX + 2} y={PLOT_TOP + 6} className="text-[7px]" fill="var(--muted-foreground)" opacity={0.5}>
                ({zerosExcluded} zeros excl.)
              </text>
            )}
          </g>
        );
      })()}

      {/* Horizontal grid lines */}
      {yTicks.map((t) => (
        <line
          key={t}
          x1={effectiveLeftMargin} y1={yScale(t)}
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

      {/* HCD reference band + mean line — behind detection windows and dots */}
      {hasHcd && (() => {
        const ref = hcdBySex && (Object.values(hcdBySex).find(Boolean) as HcdReference | undefined);
        if (!ref) return null;
        const bandY1 = yScale(ref.upper);
        const bandY2 = yScale(ref.lower);
        const centerVal = ref.isLognormal && ref.geom_mean != null ? ref.geom_mean : ref.mean;
        return (
          <g>
            <rect
              x={effectiveLeftMargin} y={Math.min(bandY1, bandY2)}
              width={plotWidth} height={Math.abs(bandY2 - bandY1)}
              fill="rgba(0,0,0,0.03)"
            />
            {centerVal != null && (
              <line
                x1={effectiveLeftMargin} y1={yScale(centerVal)}
                x2={width - PLOT_RIGHT} y2={yScale(centerVal)}
                stroke="rgba(0,0,0,0.15)" strokeWidth={1} strokeDasharray="4,3"
              />
            )}
            <text
              x={width - PLOT_RIGHT - 1} y={Math.min(bandY1, bandY2) + 8}
              textAnchor="end" className="text-[8px]" fill="var(--muted-foreground)" opacity={0.5}
            >
              HCD
            </text>
          </g>
        );
      })()}

      {/* Clip path for detection window bands */}
      <defs>
        <clipPath id="interleaved-plot-clip">
          <rect x={effectiveLeftMargin} y={PLOT_TOP} width={plotWidth} height={plotHeight} />
        </clipPath>
      </defs>

      {/* Detection window bands — behind dots, clipped to plot area */}
      {detectionWindows && (
        <g clipPath="url(#interleaved-plot-clip)">
          {doseGroups.map((dg, colIdx) => {
            const cx = colCenter(colIdx);
            return sexes.map((sex) => {
              const win = detectionWindows.find((w) => w.doseLevel === dg.doseLevel && w.sex === sex);
              if (!win) return null;
              const y1 = yScale(win.windowHi);
              const y2 = yScale(win.windowLo);
              const sexCx = cx + subColOffset(sex);
              const bandColor = getSexColor(sex);
              return (
                <rect
                  key={`band-${dg.doseLevel}-${sex}`}
                  x={sexCx - subColWidth / 2}
                  y={Math.min(y1, y2)}
                  width={subColWidth}
                  height={Math.abs(y2 - y1)}
                  fill={bandColor}
                  fillOpacity={0.06}
                >
                  <title>{`Detection window (|z| < 3.5): ${win.windowLo.toFixed(1)} - ${win.windowHi.toFixed(1)}`}</title>
                </rect>
              );
            });
          })}
        </g>
      )}

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
                    const isExcluded = !!excludedSubjects?.has(sv.usubjid);
                    if (isolateInfluential && !isInfluential) return null;
                    const dotX = sexCx + jitterX(i, values.length, subColWidth);
                    const dotY = yScale(sv.value);
                    const handlers = {
                      onMouseEnter: (e: React.MouseEvent) => { e.stopPropagation(); onDotEnter(sv, e); },
                      onMouseLeave: (e: React.MouseEvent) => { e.stopPropagation(); onDotLeave(); },
                      onClick: (e: React.MouseEvent) => { e.stopPropagation(); onDotClick(sv.usubjid); },
                      onContextMenu: (e: React.MouseEvent) => handleDotContextMenu(sv, e),
                    };
                    if (isExcluded) {
                      const s = DOT_RADIUS;
                      return (
                        <g key={sv.usubjid} style={{ cursor: onToggleExclusion ? "context-menu" : "pointer" }} {...handlers}>
                          <line x1={dotX - s} y1={dotY - s} x2={dotX + s} y2={dotY + s} stroke="#9ca3af" strokeWidth={1.5} />
                          <line x1={dotX - s} y1={dotY + s} x2={dotX + s} y2={dotY - s} stroke="#9ca3af" strokeWidth={1.5} />
                        </g>
                      );
                    }
                    if (isInfluential) {
                      const inflInfo = influentialSubjects?.get(sv.usubjid);
                      const isCtrl = inflInfo?.isControlSide;
                      return (
                        <circle
                          key={sv.usubjid}
                          cx={dotX} cy={dotY}
                          r={DOT_RADIUS}
                          fill={isCtrl ? "#6b7280" : LOO_INFLUENTIAL_COLOR}
                          stroke={isCtrl ? getDoseGroupColor(inflInfo!.doseLevel) : "none"}
                          strokeWidth={isCtrl ? 1.5 : 0}
                          opacity={1}
                          style={{ cursor: onToggleExclusion ? "context-menu" : "pointer" }}
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
                        style={{ transition: "opacity 0.15s, r 0.1s", cursor: onToggleExclusion ? "context-menu" : "pointer" }}
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
  sex,
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
  isolateInfluential,
  excludedSubjects,
  onToggleExclusion,
  handleDotContextMenu,
  detectionWindows,
  hcdRef,
}: {
  sex: string;
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
  influentialSubjects?: ReadonlyMap<string, { doseLevel: number; isControlSide: boolean }>;
  isolateInfluential?: boolean;
  excludedSubjects?: ReadonlySet<string>;
  onToggleExclusion?: (usubjid: string) => void;
  handleDotContextMenu: (sv: SubjectValue, e: React.MouseEvent) => void;
  detectionWindows?: DetectionWindow[];
  hcdRef?: HcdReference;
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

  const hasHcd = !!hcdRef;
  const baseLeft = showYAxis ? LEFT_MARGIN : 6;
  const leftMargin = baseLeft + (hasHcd && showYAxis ? HCD_DENSITY_WIDTH : 0);
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
          x={baseLeft - 3} y={yScale(t)}
          textAnchor="end" dominantBaseline="central"
          className="text-[8px]" fill="var(--muted-foreground)"
        >
          {t % 1 === 0 ? t : t.toFixed(1)}
        </text>
      ))}

      {/* HCD marginal density — in left margin area (first panel only) */}
      {hasHcd && showYAxis && (() => {
        const { points: density, zerosExcluded } = computeHcdDensity(hcdRef);
        if (density.length === 0) return null;
        const densityX = baseLeft;
        const maxW = HCD_DENSITY_WIDTH - 2;
        return (
          <g>
            <path
              d={density.map((p, i) => {
                const x = densityX + p.density * maxW;
                const y = yScale(p.y);
                return `${i === 0 ? "M" : "L"}${x},${y}`;
              }).join(" ") + density.map((_, i) => {
                const p = density[density.length - 1 - i];
                return `L${densityX},${yScale(p.y)}`;
              }).join(" ") + "Z"}
              fill="rgba(0,0,0,0.06)"
              stroke="none"
            />
            {zerosExcluded > 0 && (
              <text x={densityX + 2} y={PLOT_TOP + 6} className="text-[7px]" fill="var(--muted-foreground)" opacity={0.5}>
                ({zerosExcluded} zeros excl.)
              </text>
            )}
          </g>
        );
      })()}

      {/* HCD reference band + mean line */}
      {hasHcd && (() => {
        const bandY1 = yScale(hcdRef.upper);
        const bandY2 = yScale(hcdRef.lower);
        const centerVal = hcdRef.isLognormal && hcdRef.geom_mean != null ? hcdRef.geom_mean : hcdRef.mean;
        return (
          <g>
            <rect
              x={leftMargin} y={Math.min(bandY1, bandY2)}
              width={plotWidth} height={Math.abs(bandY2 - bandY1)}
              fill="rgba(0,0,0,0.03)"
            />
            {centerVal != null && (
              <line
                x1={leftMargin} y1={yScale(centerVal)}
                x2={width - PLOT_RIGHT} y2={yScale(centerVal)}
                stroke="rgba(0,0,0,0.15)" strokeWidth={1} strokeDasharray="4,3"
              />
            )}
            <text
              x={width - PLOT_RIGHT - 1} y={Math.min(bandY1, bandY2) + 8}
              textAnchor="end" className="text-[8px]" fill="var(--muted-foreground)" opacity={0.5}
            >
              HCD
            </text>
          </g>
        );
      })()}

      {/* Detection window bands — behind dots, clipped to plot area */}
      {detectionWindows && (
        <g>
          <defs>
            <clipPath id={`sex-clip-${sex}`}>
              <rect x={leftMargin} y={PLOT_TOP} width={plotWidth} height={PLOT_HEIGHT} />
            </clipPath>
          </defs>
          <g clipPath={`url(#sex-clip-${sex})`}>
            {doseGroups.map((dg, colIdx) => {
              const win = detectionWindows.find((w) => w.doseLevel === dg.doseLevel && w.sex === sex);
              if (!win) return null;
              const cx = colCenter(colIdx);
              const y1 = yScale(win.windowHi);
              const y2 = yScale(win.windowLo);
              const bandColor = getSexColor(sex);
              return (
                <rect
                  key={`band-${dg.doseLevel}`}
                  x={cx - colWidth / 2}
                  y={Math.min(y1, y2)}
                  width={colWidth}
                  height={Math.abs(y2 - y1)}
                  fill={bandColor}
                  fillOpacity={0.06}
                >
                  <title>{`Detection window (|z| < 3.5): ${win.windowLo.toFixed(1)} - ${win.windowHi.toFixed(1)}`}</title>
                </rect>
              );
            })}
          </g>
        </g>
      )}

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
              const isExcluded = !!excludedSubjects?.has(sv.usubjid);
              if (isolateInfluential && !isInfluential) return null;
              const dotX = cx + jitterX(i, values.length, colWidth);
              const dotY = yScale(sv.value);
              const handlers = {
                onMouseEnter: (e: React.MouseEvent) => { e.stopPropagation(); onDotEnter(sv, e); },
                onMouseLeave: (e: React.MouseEvent) => { e.stopPropagation(); onDotLeave(); },
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); onDotClick(sv.usubjid); },
                onContextMenu: (e: React.MouseEvent) => handleDotContextMenu(sv, e),
              };
              if (isExcluded) {
                const s = DOT_RADIUS;
                return (
                  <g key={sv.usubjid} style={{ cursor: onToggleExclusion ? "context-menu" : "pointer" }} {...handlers}>
                    <line x1={dotX - s} y1={dotY - s} x2={dotX + s} y2={dotY + s} stroke="#9ca3af" strokeWidth={1.5} />
                    <line x1={dotX - s} y1={dotY + s} x2={dotX + s} y2={dotY - s} stroke="#9ca3af" strokeWidth={1.5} />
                  </g>
                );
              }
              if (isInfluential) {
                const inflInfo = influentialSubjects?.get(sv.usubjid);
                const isCtrl = inflInfo?.isControlSide;
                return (
                  <circle
                    key={sv.usubjid}
                    cx={dotX} cy={dotY}
                    r={DOT_RADIUS}
                    fill={isCtrl ? "#6b7280" : LOO_INFLUENTIAL_COLOR}
                    stroke={isCtrl ? getDoseGroupColor(inflInfo!.doseLevel) : "none"}
                    strokeWidth={isCtrl ? 1.5 : 0}
                    opacity={1}
                    style={{ cursor: onToggleExclusion ? "context-menu" : "pointer" }}
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
                  style={{ transition: "opacity 0.15s, r 0.1s", cursor: onToggleExclusion ? "context-menu" : "pointer" }}
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
