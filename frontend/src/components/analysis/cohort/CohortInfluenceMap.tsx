/**
 * CohortInfluenceMap — scatter plot of per-animal influence metrics.
 *
 * X axis: % endpoints destabilising (LOO ratio < 80%).
 * Y axis: mean within-group |z| (biological extremity).
 * Dots: circles for treated, diamonds for control.
 * Color: dose group via buildDoseColorMap().
 * Quadrant lines at configurable thresholds; top-right = alarm zone.
 */
import { useMemo, useState, useRef, useCallback } from "react";
import type { AnimalInfluenceSummary, AnimalInfluenceData } from "@/types/analysis-views";
import type { DoseGroup } from "@/types/analysis";
import { buildDoseColorMap, getDoseLabel } from "@/lib/dose-label-utils";
import { computeNiceTicks, shortId } from "@/lib/chart-utils";

// ── Layout constants ──────────────────────────────────────────

const MARGIN = { top: 28, right: 12, bottom: 36, left: 40 };
const DOT_R = 5;
const DOT_R_SMALL = 4;        // > 60 animals
const CTRL_DOT_R = 6;
const CTRL_DOT_R_SMALL = 5;
const BELOW_OPACITY = 0.40;
const NORMAL_OPACITY = 0.73;
const ALARM_LABEL_SIZE = 11;
const QUADRANT_LABEL_OPACITY = 0.32;
const ALARM_LABEL_OPACITY = 0.45;

export interface CohortInfluenceMapProps {
  data: AnimalInfluenceData;
  doseGroups: DoseGroup[];
  selectedAnimal: string | null;
  onAnimalSelect: (subjectId: string | null) => void;
}

export function CohortInfluenceMap({
  data,
  doseGroups,
  selectedAnimal,
  onAnimalSelect,
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
  const isSmall = animals.length > 60;
  const dotR = isSmall ? DOT_R_SMALL : DOT_R;
  const ctrlR = isSmall ? CTRL_DOT_R_SMALL : CTRL_DOT_R;

  // ── Domains ────────────────────────────────────────────────
  const xMax = useMemo(() => {
    if (isInsufficient) return 10;
    const mx = Math.max(...visibleAnimals.map((a) => a.pct_destabilising ?? 0), 0);
    return Math.min(100, mx + 5);
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
        const pctStr = a.pct_destabilising != null ? `${a.pct_destabilising}% destabilising` : "N/A";
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top - 10,
          text: `${shortId(a.subject_id)} - ${a.group_id} - ${a.sex}\n${pctStr} - mean |z| ${a.mean_bio_z.toFixed(2)}`,
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
  const threshX = xScale(thresholds.destabilising_pct);
  const threshY = yScale(thresholds.bio_extremity_z);

  const isBelowBoth = (a: AnimalInfluenceSummary) =>
    (a.pct_destabilising ?? 0) <= thresholds.destabilising_pct &&
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
              {t}
            </text>
          ))}

          {/* Axis labels */}
          <text
            x={MARGIN.left + plotW / 2}
            y={MARGIN.top + plotH + 28}
            textAnchor="middle"
            className="text-[9px]" fill="var(--muted-foreground)"
          >
            % endpoints destabilising (LOO &lt; 80%)
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
            const cx = isInsufficient ? MARGIN.left + 4 : xScale(a.pct_destabilising ?? 0);
            const cy = yScale(a.mean_bio_z);
            const isHovered = hoveredAnimal === a.subject_id;
            const isSelected = selectedAnimal === a.subject_id;
            const opacity = isBelowBoth(a) ? BELOW_OPACITY : NORMAL_OPACITY;
            const color = colorFn(a.dose_level);

            if (a.is_control) {
              // Diamond (rotated rect)
              const r = isHovered ? ctrlR + 1 : ctrlR;
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
            const r = isHovered ? dotR + 1 : dotR;
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

          {/* Alarm animal labels */}
          {visibleAnimals
            .filter((a) => a.is_alarm)
            .map((a) => {
              const cx = xScale(a.pct_destabilising ?? 0);
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
