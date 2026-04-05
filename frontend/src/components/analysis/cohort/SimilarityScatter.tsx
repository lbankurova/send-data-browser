/**
 * SimilarityScatter -- MDS 2D embedding of subject similarity.
 *
 * Dots colored by dose group. Boundary subjects get dashed ring.
 * Recovery subjects rendered as diamonds. Early deaths as squares.
 * Interactive legend toggles dose group visibility.
 * Click dot -> select subject. Follows CohortInfluenceMap SVG pattern.
 */
import { useMemo, useState, useRef, useCallback } from "react";
import type { SubjectSimilarityData } from "@/types/analysis-views";
import type { DoseGroup } from "@/types/analysis";
import { buildDoseColorMap, getDoseLabel } from "@/lib/dose-label-utils";
import { computeNiceTicks, shortId } from "@/lib/chart-utils";

const MARGIN = { top: 24, right: 12, bottom: 36, left: 40 };
const DOT_R = 5;
const DOT_R_SMALL = 4;
const BOUNDARY_RING_R = 8;
const BOUNDARY_RING_R_SMALL = 7;

interface SimilarityScatterProps {
  data: SubjectSimilarityData;
  doseGroups: DoseGroup[];
  selectedSubject: string | null;
  onSubjectSelect: (subjectId: string | null) => void;
}

interface DotData {
  uid: string;
  x: number;
  y: number;
  doseLevel: number;
  sex: string;
  isBoundary: boolean;
  isRecovery: boolean;
  isEarlyDeath: boolean;
  lowOverlap: boolean;
}

export function SimilarityScatter({
  data,
  doseGroups,
  selectedSubject,
  onSubjectSelect,
}: SimilarityScatterProps) {
  const [hoveredDot, setHoveredDot] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const colorFn = useMemo(() => buildDoseColorMap(doseGroups), [doseGroups]);

  // Boundary detail lookup for tooltip enrichment
  const boundaryDetailMap = useMemo(() => {
    const m = new Map<string, { dominantDose: number; topFeature: string; exceeds: boolean }>();
    for (const bd of data.interpretability.boundary_subjects) {
      const top = bd.top_contributing_features[0];
      m.set(bd.subject, {
        dominantDose: bd.cluster_dominant_dose_group,
        topFeature: top?.feature ?? "",
        exceeds: top?.exceeds_control_p90 ?? false,
      });
    }
    return m;
  }, [data.interpretability.boundary_subjects]);

  // Build dot data from subjects with MDS coords
  const allDots: DotData[] = useMemo(() => {
    const dots: DotData[] = [];
    // Boundary status at k=4 (middle of backend's k=2..6 multi-cut range; BFIELD-89)
    for (const [uid, subj] of Object.entries(data.subjects)) {
      if (subj.mds_x == null || subj.mds_y == null) continue;
      dots.push({
        uid,
        x: subj.mds_x,
        y: subj.mds_y,
        doseLevel: subj.dose_group_order,
        sex: subj.sex,
        isBoundary: subj.is_boundary?.["4"] ?? false,
        isRecovery: subj.is_recovery,
        isEarlyDeath: subj.is_early_death,
        lowOverlap: subj.low_overlap,
      });
    }
    return dots;
  }, [data.subjects]);

  const visibleDots = useMemo(
    () => allDots.filter((d) => !hiddenGroups.has(d.doseLevel)),
    [allDots, hiddenGroups],
  );

  const presentGroups = useMemo(() => {
    const levels = new Set(allDots.map((d) => d.doseLevel));
    return doseGroups.filter((dg) => levels.has(dg.dose_level));
  }, [allDots, doseGroups]);

  const isSmall = allDots.length > 60;
  const dotR = isSmall ? DOT_R_SMALL : DOT_R;
  const boundaryR = isSmall ? BOUNDARY_RING_R_SMALL : BOUNDARY_RING_R;

  // Domains
  const xRange = useMemo(() => {
    if (visibleDots.length === 0) return { min: -1, max: 1 };
    const xs = visibleDots.map((d) => d.x);
    const mn = Math.min(...xs);
    const mx = Math.max(...xs);
    const pad = (mx - mn) * 0.08 || 0.1;
    return { min: mn - pad, max: mx + pad };
  }, [visibleDots]);

  const yRange = useMemo(() => {
    if (visibleDots.length === 0) return { min: -1, max: 1 };
    const ys = visibleDots.map((d) => d.y);
    const mn = Math.min(...ys);
    const mx = Math.max(...ys);
    const pad = (mx - mn) * 0.08 || 0.1;
    return { min: mn - pad, max: mx + pad };
  }, [visibleDots]);

  const xTicks = useMemo(() => computeNiceTicks(xRange.min, xRange.max), [xRange]);
  const yTicks = useMemo(() => computeNiceTicks(yRange.min, yRange.max), [yRange]);

  // ResizeObserver
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

  const xScale = (v: number) => MARGIN.left + ((v - xRange.min) / (xRange.max - xRange.min)) * plotW;
  const yScale = (v: number) => MARGIN.top + plotH * (1 - (v - yRange.min) / (yRange.max - yRange.min));

  // Interactions
  const handleDotEnter = useCallback(
    (d: DotData, e: React.MouseEvent) => {
      setHoveredDot(d.uid);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const flags: string[] = [];
        if (d.isRecovery) flags.push("recovery");
        if (d.isEarlyDeath) flags.push("early death");
        if (d.lowOverlap) flags.push("low overlap");
        const flagStr = flags.length > 0 ? ` (${flags.join(", ")})` : "";
        let line1 = `${shortId(d.uid)} - ${getDoseLabel(d.doseLevel, doseGroups)} - ${d.sex}${flagStr}`;
        // Boundary detail: show which dose group the subject clusters with and top driver
        const bd = boundaryDetailMap.get(d.uid);
        if (d.isBoundary && bd) {
          const domLabel = getDoseLabel(bd.dominantDose, doseGroups);
          line1 += `\nClusters with ${domLabel}`;
          if (bd.topFeature) {
            line1 += ` -- driven by ${bd.topFeature.replace(/_/g, " ")}`;
          }
        }
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top - 10,
          text: line1,
        });
      }
    },
    [doseGroups, boundaryDetailMap],
  );

  const handleDotLeave = useCallback(() => {
    setHoveredDot(null);
    setTooltip(null);
  }, []);

  const handleDotClick = useCallback(
    (uid: string) => {
      onSubjectSelect(selectedSubject === uid ? null : uid);
    },
    [onSubjectSelect, selectedSubject],
  );

  const handleLegendClick = useCallback((doseLevel: number) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(doseLevel)) next.delete(doseLevel);
      else next.add(doseLevel);
      return next;
    });
  }, []);

  // Suppressed state
  if (data.meta.similarity_suppressed) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">
          Similarity analysis suppressed (N &lt; 15 eligible subjects)
        </p>
      </div>
    );
  }

  if (allDots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">No MDS embedding available</p>
      </div>
    );
  }

  const stress = data.meta.mds_stress;

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
        {stress != null && (
          <span className="ml-auto text-[9px] text-muted-foreground" title="Kruskal stress-1 (lower is better)">
            stress {stress.toFixed(2)}
          </span>
        )}
      </div>

      {/* SVG scatter */}
      <div ref={measuredRef} className="flex-1 min-h-0">
        <svg width={width} height={height} className="select-none">
          {/* Grid lines */}
          {xTicks.map((t) => (
            <line
              key={`xg-${t}`}
              x1={xScale(t)} y1={MARGIN.top}
              x2={xScale(t)} y2={MARGIN.top + plotH}
              stroke="#e5e7eb" strokeWidth={0.5}
            />
          ))}
          {yTicks.map((t) => (
            <line
              key={`yg-${t}`}
              x1={MARGIN.left} y1={yScale(t)}
              x2={MARGIN.left + plotW} y2={yScale(t)}
              stroke="#e5e7eb" strokeWidth={0.5}
            />
          ))}

          {/* X axis ticks */}
          {xTicks.map((t) => (
            <text
              key={`xt-${t}`}
              x={xScale(t)} y={MARGIN.top + plotH + 14}
              textAnchor="middle" fontSize={9} fill="#9ca3af"
            >
              {t.toFixed(1)}
            </text>
          ))}

          {/* Y axis ticks */}
          {yTicks.map((t) => (
            <text
              key={`yt-${t}`}
              x={MARGIN.left - 6} y={yScale(t) + 3}
              textAnchor="end" fontSize={9} fill="#9ca3af"
            >
              {t.toFixed(1)}
            </text>
          ))}

          {/* Axis labels */}
          <text
            x={MARGIN.left + plotW / 2} y={height - 4}
            textAnchor="middle" fontSize={10} fill="#6b7280"
          >
            MDS dimension 1
          </text>
          <text
            x={12} y={MARGIN.top + plotH / 2}
            textAnchor="middle" fontSize={10} fill="#6b7280"
            transform={`rotate(-90, 12, ${MARGIN.top + plotH / 2})`}
          >
            MDS dimension 2
          </text>

          {/* Dots */}
          {visibleDots.map((d) => {
            const cx = xScale(d.x);
            const cy = yScale(d.y);
            const color = colorFn(d.doseLevel);
            const isHovered = hoveredDot === d.uid;
            const isSelected = selectedSubject === d.uid;
            const opacity = d.lowOverlap ? 0.35 : (isHovered || isSelected ? 1 : 0.73);
            const r = isHovered || isSelected ? dotR + 1.5 : dotR;

            return (
              <g
                key={d.uid}
                onMouseEnter={(e) => handleDotEnter(d, e)}
                onMouseLeave={handleDotLeave}
                onClick={() => handleDotClick(d.uid)}
                className="cursor-pointer"
              >
                {/* Boundary ring */}
                {d.isBoundary && (
                  <circle
                    cx={cx} cy={cy} r={boundaryR}
                    fill="none" stroke={color} strokeWidth={1.5}
                    strokeDasharray="3 2" opacity={0.6}
                  />
                )}

                {/* Subject dot */}
                {d.isEarlyDeath ? (
                  // Square for early deaths
                  <rect
                    x={cx - r} y={cy - r} width={r * 2} height={r * 2}
                    fill={color} opacity={opacity}
                    stroke={isSelected ? "#1f2937" : "none"}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                ) : d.isRecovery ? (
                  // Diamond for recovery
                  <polygon
                    points={`${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`}
                    fill={color} opacity={opacity}
                    stroke={isSelected ? "#1f2937" : "none"}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                ) : (
                  // Circle for regular subjects
                  <circle
                    cx={cx} cy={cy} r={r}
                    fill={color} opacity={opacity}
                    stroke={isSelected ? "#1f2937" : "none"}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-sm whitespace-pre-line"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
