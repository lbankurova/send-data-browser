/**
 * CohortInfluenceMap — scatter plot of per-animal influence metrics.
 *
 * X axis: mean instability (LOO) — 0-1 continuous scale.
 * Y axis: mean within-group |z| (biological extremity).
 * Dots: circles for treated, diamonds for control. Size encodes max
 *   single-endpoint instability (concentrated vs broad influence).
 * Color: dose group via buildDoseColorMap().
 * Quadrant lines at adaptive thresholds; top-right = alarm zone.
 */
import { useMemo, useState, useRef, useCallback } from "react";
import type { AnimalInfluenceSummary, AnimalInfluenceData, SubjectSentinelData, SentinelAnimal } from "@/types/analysis-views";
import type { DoseGroup } from "@/types/analysis";
import { buildDoseColorMap, getDoseLabel } from "@/lib/dose-label-utils";
import { computeNiceTicks, shortId } from "@/lib/chart-utils";

// ── Layout constants ──────────────────────────────────────────

const MARGIN = { top: 28, right: 12, bottom: 36, left: 40 };
const DOT_R_BASE = 4;           // base dot radius
const DOT_R_MAX = 9;            // max dot radius (max_endpoint_instability = 1.0)
const BELOW_OPACITY = 0.40;
const NORMAL_OPACITY = 0.73;
const ALARM_LABEL_SIZE = 11;
const QUADRANT_LABEL_OPACITY = 0.32;
const ALARM_LABEL_OPACITY = 0.45;
const SENTINEL_COC_COLOR = "#f97316";  // orange-500
const SENTINEL_DISP_COLOR = "#dc2626"; // red-600

export interface CohortInfluenceMapProps {
  data: AnimalInfluenceData;
  doseGroups: DoseGroup[];
  selectedAnimal: string | null;
  onAnimalSelect: (subjectId: string | null) => void;
  sentinelData?: SubjectSentinelData;
}

export function CohortInfluenceMap({
  data,
  doseGroups,
  selectedAnimal,
  onAnimalSelect,
  sentinelData,
}: CohortInfluenceMapProps) {
  const { animals, thresholds, loo_confidence } = data;
  const [hoveredAnimal, setHoveredAnimal] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const colorFn = useMemo(() => buildDoseColorMap(doseGroups), [doseGroups]);

  // Dose groups present in scatter data
  const presentGroups = useMemo(() => {
    const levels = new Set(animals.map((a) => a.dose_level));
    return doseGroups.filter((dg) => levels.has(dg.dose_level));
  }, [animals, doseGroups]);

  // Visible animals (filtered by legend toggles)
  const visibleAnimals = useMemo(
    () => animals.filter((a) => !hiddenGroups.has(a.dose_level)),
    [animals, hiddenGroups],
  );

  const isInsufficient = loo_confidence === "insufficient";

  // Sentinel annotation lookup by subject_id
  const sentinelMap = useMemo(() => {
    if (!sentinelData) return new Map<string, SentinelAnimal>();
    const m = new Map<string, SentinelAnimal>();
    for (const sa of sentinelData.animals) {
      m.set(sa.subject_id, sa);
    }
    return m;
  }, [sentinelData]);

  /** Compute dot radius from max_endpoint_instability (0-1). */
  const dotRadius = useCallback((a: AnimalInfluenceSummary) => {
    const mei = a.max_endpoint_instability;
    if (mei == null) return DOT_R_BASE;
    return DOT_R_BASE + (DOT_R_MAX - DOT_R_BASE) * Math.min(1, Math.max(0, mei));
  }, []);

  // ── Domains ────────────────────────────────────────────────
  const xMax = useMemo(() => {
    if (isInsufficient) return 0.1;
    const mx = Math.max(...visibleAnimals.map((a) => a.mean_instability ?? 0), 0);
    // Pad 5% and round up to nearest 0.05
    return Math.min(1.0, Math.ceil((mx + 0.02) * 20) / 20);
  }, [visibleAnimals, isInsufficient]);

  const yMax = useMemo(() => {
    const my = Math.max(...visibleAnimals.map((a) => a.mean_bio_z), 0);
    return my + 0.3;
  }, [visibleAnimals]);

  const xTicks = useMemo(() => computeNiceTicks(0, xMax), [xMax]);
  const yTicks = useMemo(() => computeNiceTicks(0, yMax), [yMax]);

  // ─��� ResizeObserver ─────────────────────────────────────────
  const [dims, setDims] = useState({ width: 400, height: 280 });
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
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const xScale = (v: number) => MARGIN.left + (v / xMax) * plotW;
  const yScale = (v: number) => MARGIN.top + plotH * (1 - v / yMax);

  // ── Interactions ───────────────────────────────────────────
  const handleDotEnter = useCallback(
    (a: AnimalInfluenceSummary, e: React.MouseEvent) => {
      setHoveredAnimal(a.subject_id);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const instStr = a.mean_instability != null ? `instability ${a.mean_instability.toFixed(3)}` : "N/A";
        const meiStr = a.max_endpoint_instability != null
          ? `max endpoint ${a.max_endpoint_instability.toFixed(3)}`
          : "";
        const kStr = a.n_pairwise_k > 0 ? `K=${a.n_pairwise_k}` : "";
        const hint = a.max_endpoint_instability != null && a.mean_instability != null
          && a.max_endpoint_instability > a.mean_instability * 1.5
          ? "\nConcentrated influence -- check dumbbell"
          : "";
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top - 10,
          text: `${shortId(a.subject_id)} - ${a.group_id} - ${a.sex}\n${instStr} - mean |z| ${a.mean_bio_z.toFixed(2)}${meiStr ? `\n${meiStr}` : ""}${kStr ? ` (${kStr})` : ""}${hint}`,
        });
      }
    },
    [],
  );

  const handleDotLeave = useCallback(() => {
    setHoveredAnimal(null);
    setTooltip(null);
  }, []);

  const handleDotClick = useCallback(
    (subjectId: string) => {
      onAnimalSelect(selectedAnimal === subjectId ? null : subjectId);
    },
    [onAnimalSelect, selectedAnimal],
  );

  const handleLegendClick = useCallback((doseLevel: number) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(doseLevel)) next.delete(doseLevel);
      else next.add(doseLevel);
      return next;
    });
  }, []);

  // ── Threshold positions ────────────────────────────────────
  const threshX = xScale(thresholds.instability);
  const threshY = yScale(thresholds.bio_extremity_z);

  const isBelowBoth = (a: AnimalInfluenceSummary) =>
    (a.mean_instability ?? 0) <= thresholds.instability &&
    a.mean_bio_z <= thresholds.bio_extremity_z;

  return (
    <div ref={containerRef} className="relative flex h-full flex-col">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 pb-1">
        {presentGroups.map((dg) => {
          const hidden = hiddenGroups.has(dg.dose_level);
          return (
            <button
              key={dg.dose_level}
              className="flex items-center gap-1 text-[10px] cursor-pointer"
              style={{ opacity: hidden ? 0.35 : 1 }}
              onClick={() => handleLegendClick(dg.dose_level)}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colorFn(dg.dose_level) }}
              />
              <span className={hidden ? "text-muted-foreground line-through" : "text-foreground"}>
                {getDoseLabel(dg.dose_level, doseGroups)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div ref={measuredRef} className="flex-1 min-h-0">
        <svg
          className="w-full h-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* Alarm zone background */}
          {!isInsufficient && (
            <rect
              x={threshX}
              y={MARGIN.top}
              width={xScale(xMax) - threshX}
              height={threshY - MARGIN.top}
              fill="var(--destructive)"
              opacity={0.04}
            />
          )}

          {/* Grid lines */}
          {yTicks.map((t) => (
            <line
              key={`y${t}`}
              x1={MARGIN.left} y1={yScale(t)}
              x2={MARGIN.left + plotW} y2={yScale(t)}
              stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2"
            />
          ))}
          {xTicks.map((t) => (
            <line
              key={`x${t}`}
              x1={xScale(t)} y1={MARGIN.top}
              x2={xScale(t)} y2={MARGIN.top + plotH}
              stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2"
            />
          ))}

          {/* Threshold lines */}
          {!isInsufficient && (
            <>
              <line
                x1={threshX} y1={MARGIN.top}
                x2={threshX} y2={MARGIN.top + plotH}
                stroke="var(--muted-foreground)" strokeWidth={0.75} strokeDasharray="4,3"
              />
              <line
                x1={MARGIN.left} y1={threshY}
                x2={MARGIN.left + plotW} y2={threshY}
                stroke="var(--muted-foreground)" strokeWidth={0.75} strokeDasharray="4,3"
              />
            </>
          )}

          {/* Quadrant labels */}
          {!isInsufficient && (
            <>
              <text
                x={threshX + 4} y={MARGIN.top + 12}
                className="text-[9px] font-medium"
                fill="var(--destructive)" opacity={ALARM_LABEL_OPACITY}
              >
                alarm zone
              </text>
              <text
                x={threshX + 4} y={MARGIN.top + plotH - 4}
                className="text-[9px]"
                fill="var(--muted-foreground)" opacity={QUADRANT_LABEL_OPACITY}
              >
                leverage artifact
              </text>
              <text
                x={MARGIN.left + 4} y={MARGIN.top + 12}
                className="text-[9px]"
                fill="var(--muted-foreground)" opacity={QUADRANT_LABEL_OPACITY}
              >
                robust outlier
              </text>
              <text
                x={MARGIN.left + 4} y={MARGIN.top + plotH - 4}
                className="text-[9px]"
                fill="var(--muted-foreground)" opacity={QUADRANT_LABEL_OPACITY}
              >
                noise
              </text>
            </>
          )}

          {/* Y-axis ticks */}
          {yTicks.map((t) => (
            <text
              key={`yt${t}`}
              x={MARGIN.left - 4} y={yScale(t)}
              textAnchor="end" dominantBaseline="central"
              className="text-[8px]" fill="var(--muted-foreground)"
            >
              {t % 1 === 0 ? t : t.toFixed(1)}
            </text>
          ))}

          {/* X-axis ticks */}
          {xTicks.map((t) => (
            <text
              key={`xt${t}`}
              x={xScale(t)} y={MARGIN.top + plotH + 12}
              textAnchor="middle"
              className="text-[8px]" fill="var(--muted-foreground)"
            >
              {t <= 1 ? t.toFixed(2) : t}
            </text>
          ))}

          {/* Axis labels */}
          <text
            x={MARGIN.left + plotW / 2}
            y={MARGIN.top + plotH + 28}
            textAnchor="middle"
            className="text-[9px]" fill="var(--muted-foreground)"
          >
            Mean instability (LOO)
          </text>
          <text
            x={10}
            y={MARGIN.top + plotH / 2}
            textAnchor="middle" dominantBaseline="central"
            transform={`rotate(-90, 10, ${MARGIN.top + plotH / 2})`}
            className="text-[9px]" fill="var(--muted-foreground)"
          >
            Mean within-group |z|
          </text>

          {/* Dots */}
          {visibleAnimals.map((a) => {
            const cx = isInsufficient ? MARGIN.left + 4 : xScale(a.mean_instability ?? 0);
            const cy = yScale(a.mean_bio_z);
            const isHovered = hoveredAnimal === a.subject_id;
            const isSelected = selectedAnimal === a.subject_id;
            const opacity = isBelowBoth(a) ? BELOW_OPACITY : NORMAL_OPACITY;
            const color = colorFn(a.dose_level);
            const baseR = dotRadius(a);

            if (a.is_control) {
              // Diamond (rotated rect)
              const r = isHovered ? baseR + 1 : baseR;
              return (
                <g key={a.subject_id}>
                  {isSelected && (
                    <rect
                      x={cx - r - 2} y={cy - r - 2}
                      width={(r + 2) * 2} height={(r + 2) * 2}
                      transform={`rotate(45, ${cx}, ${cy})`}
                      fill="none" stroke="var(--foreground)" strokeWidth={1.5}
                    />
                  )}
                  <rect
                    x={cx - r} y={cy - r}
                    width={r * 2} height={r * 2}
                    transform={`rotate(45, ${cx}, ${cy})`}
                    fill={color}
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth={1}
                    opacity={isHovered || isSelected ? 1 : opacity}
                    className="cursor-pointer"
                    onMouseEnter={(e) => handleDotEnter(a, e)}
                    onMouseLeave={handleDotLeave}
                    onClick={() => handleDotClick(a.subject_id)}
                  />
                </g>
              );
            }
            // Circle (treated)
            const r = isHovered ? baseR + 1 : baseR;
            return (
              <g key={a.subject_id}>
                {isSelected && (
                  <circle
                    cx={cx} cy={cy} r={r + 2}
                    fill="none" stroke="var(--foreground)" strokeWidth={1.5}
                  />
                )}
                <circle
                  cx={cx} cy={cy} r={r}
                  fill={color}
                  opacity={isHovered || isSelected ? 1 : opacity}
                  className="cursor-pointer"
                  onMouseEnter={(e) => handleDotEnter(a, e)}
                  onMouseLeave={handleDotLeave}
                  onClick={() => handleDotClick(a.subject_id)}
                />
              </g>
            );
          })}

          {/* Sentinel overlays — rendered on top of dots */}
          {sentinelData && visibleAnimals.map((a) => {
            const sa = sentinelMap.get(a.subject_id);
            if (!sa) return null;
            const hasCoc = sa.coc >= 2;
            const hasSole = sa.n_sole_findings > 0;
            const hasDisp = !!sa.disposition;
            if (!hasCoc && !hasSole && !hasDisp) return null;

            const cx = isInsufficient ? MARGIN.left + 4 : xScale(a.mean_instability ?? 0);
            const cy = yScale(a.mean_bio_z);
            const r = dotRadius(a);

            return (
              <g key={`sentinel-${a.subject_id}`} className="pointer-events-none">
                {/* COC ring — orange border behind other overlays */}
                {hasCoc && (
                  <circle
                    cx={cx} cy={cy} r={r + 3}
                    fill="none" stroke={SENTINEL_COC_COLOR}
                    strokeWidth={1.5} opacity={0.85}
                  />
                )}
                {/* Sole-finding triangle — top-right corner */}
                {hasSole && (
                  <polygon
                    points={`${cx + r - 1},${cy - r - 1} ${cx + r + 4},${cy - r - 1} ${cx + r + 4},${cy - r + 4}`}
                    fill={SENTINEL_COC_COLOR} opacity={0.9}
                  />
                )}
                {/* Disposition cross — center, highest z-order */}
                {hasDisp && (
                  <>
                    <line
                      x1={cx - 3} y1={cy - 3} x2={cx + 3} y2={cy + 3}
                      stroke={SENTINEL_DISP_COLOR} strokeWidth={1.5}
                    />
                    <line
                      x1={cx + 3} y1={cy - 3} x2={cx - 3} y2={cy + 3}
                      stroke={SENTINEL_DISP_COLOR} strokeWidth={1.5}
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* Alarm animal labels */}
          {visibleAnimals
            .filter((a) => a.is_alarm)
            .map((a) => {
              const cx = xScale(a.mean_instability ?? 0);
              const cy = yScale(a.mean_bio_z);
              return (
                <text
                  key={`label-${a.subject_id}`}
                  x={cx + 8} y={cy - 3}
                  className="font-medium"
                  fontSize={ALARM_LABEL_SIZE}
                  fill="var(--destructive)"
                >
                  {shortId(a.subject_id)}
                </text>
              );
            })}

          {/* Small-N overlay */}
          {loo_confidence === "low" && (
            <g>
              <rect
                x={MARGIN.left}
                y={MARGIN.top + plotH - 18}
                width={plotW}
                height={18}
                fill="var(--muted)" opacity={0.6}
              />
              <text
                x={MARGIN.left + plotW / 2}
                y={MARGIN.top + plotH - 6}
                textAnchor="middle"
                className="text-[9px] font-medium"
                fill="var(--muted-foreground)"
              >
                LOO instability unreliable at N &lt; 5 -- interpret with caution
              </text>
            </g>
          )}
          {isInsufficient && (
            <g>
              <rect
                x={MARGIN.left}
                y={MARGIN.top}
                width={plotW}
                height={plotH}
                fill="var(--muted)" opacity={0.3}
              />
              <text
                x={MARGIN.left + plotW / 2}
                y={MARGIN.top + plotH / 2}
                textAnchor="middle"
                className="text-[10px] font-medium"
                fill="var(--muted-foreground)"
              >
                Insufficient N for LOO analysis -- showing biological extremity only
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 rounded border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-sm whitespace-pre-line"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
