/**
 * PkExposureSection — Study-level PK exposure visualization.
 *
 * Left:  Concentration-time chart (log Y, hours X, 95% CI bands, LLOQ line)
 * Right: PK parameters table + dose proportionality badge
 */
import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PkIntegration } from "@/types/analysis-views";
import type { DoseGroup } from "@/types/index";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { shortDoseLabel } from "@/lib/dose-label-utils";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";

interface Props {
  pkData: PkIntegration;
  doseGroups: DoseGroup[];
}

export function PkExposureSection({ pkData, doseGroups }: Props) {
  const PK_WIDTH_KEY = "pcc.pk.chartWidth";
  const chartResize = useResizePanel(400, { min: 200, max: 800, direction: "left", storageKey: PK_WIDTH_KEY });
  let hasStoredWidth = false;
  try { hasStoredWidth = sessionStorage.getItem(PK_WIDTH_KEY) !== null; } catch { /* ignore */ }

  const allGroups = pkData.by_dose_group ?? [];
  if (allGroups.length === 0) return null;

  const [selectedDoses, setSelectedDoses] = useState<number[]>([]);
  const [showMarginBand, setShowMarginBand] = useState(true);
  const hasDoseFilter = selectedDoses.length > 0;
  const groups = hasDoseFilter
    ? allGroups.filter(dg => selectedDoses.includes(dg.dose_level))
    : allGroups;

  const hasMarginData = pkData.noael_exposure != null && pkData.loael_exposure != null;

  const dp = pkData.dose_proportionality;
  const hasNonLinear = dp && dp.assessment !== "linear" && dp.assessment !== "insufficient_data";

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-baseline gap-3 text-[10px] text-muted-foreground">
        {pkData.analyte && <span>Analyte: <span className="font-medium text-foreground">{pkData.analyte}</span></span>}
        {pkData.specimen && <span>Specimen: {pkData.specimen}</span>}
        {pkData.lloq != null && <span>LLOQ: {pkData.lloq} {pkData.lloq_unit ?? ""}</span>}
        {pkData.tk_design && (
          <span>TK: {pkData.tk_design.n_tk_subjects} satellite subjects{pkData.tk_design.has_satellite_groups ? ` (${pkData.tk_design.satellite_set_codes.length} groups)` : ""}</span>
        )}
      </div>

      {/* Dose group filter chips + margin toggle */}
      <div className="flex items-center gap-2">
        <DoseFilterChips allGroups={allGroups} selectedDoses={selectedDoses} setSelectedDoses={setSelectedDoses} doseGroups={doseGroups} />
        <button
          type="button"
          disabled={!hasMarginData}
          className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded-full transition-colors ${
            !hasMarginData
              ? "bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
              : showMarginBand
                ? "bg-amber-100 text-amber-800 font-medium"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
          }`}
          onClick={hasMarginData ? () => setShowMarginBand(v => !v) : undefined}
          title={hasMarginData
            ? "Show NOAEL\u2013LOAEL exposure margin on chart"
            : pkData.noael_exposure == null
              ? "No NOAEL established \u2014 NOAEL is at control (no exposure to compare)"
              : "No LOAEL established \u2014 cannot compute safety margin"
          }
        >
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: hasMarginData ? "#BA7517" : "#d1d5db" }} />
          Safety margin
        </button>
      </div>

      {/* Left: chart | Right: table + verdict */}
      <div className="flex min-h-0">
        <div ref={chartResize.targetRef} className="shrink-0 min-w-0 overflow-hidden" style={hasStoredWidth ? { width: chartResize.width } : { flex: '55 0 0%' }}>
          <ConcentrationTimeChart
            groups={groups}
            allGroups={allGroups}
            lloq={pkData.lloq ?? null}
            noaelDoseLevel={showMarginBand ? pkData.noael_exposure?.dose_level : undefined}
            loaelDoseLevel={showMarginBand ? pkData.loael_exposure?.dose_level : undefined}
          />
        </div>
        <PanelResizeHandle onPointerDown={chartResize.onPointerDown} />
        <div className="min-w-0 space-y-2 pl-2" style={hasStoredWidth ? { flex: '1 1 0%' } : { flex: '45 0 0%' }}>
          <PkParameterTable groups={groups} doseGroups={doseGroups} allGroups={allGroups} />
          {hasNonLinear && dp && <DoseProportionalityBadge dp={dp} />}
          <SafetyMarginFlag pkData={pkData} allGroups={allGroups} />
        </div>
      </div>
    </div>
  );
}


// ── Dose filter chips (same pattern as TimeCoursePane) ────────────────────

function DoseFilterChips({
  allGroups,
  selectedDoses,
  setSelectedDoses,
  doseGroups,
}: {
  allGroups: PkIntegration["by_dose_group"] & object[];
  selectedDoses: number[];
  setSelectedDoses: Dispatch<SetStateAction<number[]>>;
  doseGroups: DoseGroup[];
}) {
  const toggle = (dl: number) => {
    setSelectedDoses(prev => {
      if (prev.length === 0) {
        // Nothing selected → select only this one (deselect others)
        return [dl];
      }
      if (prev.includes(dl)) {
        const next = prev.filter(d => d !== dl);
        return next; // empty = show all
      }
      return [...prev, dl];
    });
  };

  return (
    <div className="flex flex-wrap gap-1">
      {allGroups.map(dg => {
        const isSelected = selectedDoses.length === 0 || selectedDoses.includes(dg.dose_level);
        return (
          <button
            key={dg.dose_level}
            type="button"
            className={`flex items-center gap-0.5 px-1 py-0.5 text-[9px] rounded transition-opacity ${
              isSelected ? "opacity-100" : "opacity-30"
            }`}
            onClick={() => toggle(dg.dose_level)}
          >
            <span
              className="inline-block rounded-full"
              style={{ width: 5, height: 5, backgroundColor: getDoseGroupColor(dg.dose_level) }}
            />
            <span className="text-muted-foreground">
              {shortDoseLabel(dg.dose_label, doseGroups)} <span className="text-muted-foreground/60">n={dg.n_subjects}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}


// ── 95% CI helper (same as TimeCoursePane) ────────────────────────────────

function ci95Half(sd: number, n: number): number {
  if (n < 2 || sd <= 0) return 0;
  const tCrit = n >= 30 ? 1.96
    : n >= 20 ? 2.09
    : n >= 15 ? 2.14
    : n >= 10 ? 2.26
    : n >= 8 ? 2.36
    : n >= 6 ? 2.57
    : n >= 5 ? 2.78
    : n >= 4 ? 3.18
    : n >= 3 ? 4.30
    : 12.71;
  return tCrit * sd / Math.sqrt(n);
}


// ═══════════════════════════════════════════════════════════════════════════
// Concentration-Time Chart (SVG)
// ═══════════════════════════════════════════════════════════════════════════

function ConcentrationTimeChart({
  groups,
  allGroups,
  lloq,
  noaelDoseLevel,
  loaelDoseLevel,
}: {
  groups: PkIntegration["by_dose_group"] & object[];
  allGroups: PkIntegration["by_dose_group"] & object[];
  lloq: number | null;
  noaelDoseLevel?: number;
  loaelDoseLevel?: number;
}) {
  const SVG_HEIGHT = 240;
  const PAD = { left: 30, right: 28, top: 6, bottom: 18 };

  const [width, setWidth] = useState(300);
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

  const plotW = width - PAD.left - PAD.right;
  const plotH = SVG_HEIGHT - PAD.top - PAD.bottom;

  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  // Collect all timepoints and value ranges (using CI bounds for range)
  const { allHours, yMin, yMax } = useMemo(() => {
    const hours = new Set<number>();
    let lo = Infinity, hi = -Infinity;
    for (const dg of groups) {
      for (const ct of dg.concentration_time) {
        const h = ct.elapsed_h ?? 0;
        hours.add(h);
        const half = ci95Half(ct.sd, ct.n);
        const vals = [ct.mean, ct.mean - half, ct.mean + half];
        for (const v of vals) {
          if (v > 0) {
            lo = Math.min(lo, Math.log10(v));
            hi = Math.max(hi, Math.log10(v));
          }
        }
      }
    }
    if (lloq != null && lloq > 0) lo = Math.min(lo, Math.log10(lloq * 0.5));
    return {
      allHours: [...hours].sort((a, b) => a - b),
      yMin: Math.floor(lo),
      yMax: Math.ceil(hi) + 0.3,
    };
  }, [groups, lloq]);

  const maxH = allHours[allHours.length - 1] ?? 1;
  const xScale = (h: number) => PAD.left + (h / maxH) * plotW;
  const yScale = (val: number) => {
    const lv = Math.log10(Math.max(val, 10 ** yMin));
    return PAD.top + plotH - ((lv - yMin) / (yMax - yMin)) * plotH;
  };

  // Y ticks
  const yTicks = useMemo(() => {
    const t: number[] = [];
    for (let e = yMin; e <= yMax; e++) t.push(e);
    return t;
  }, [yMin, yMax]);

  const fmtY = (exp: number) => {
    if (exp <= 0) return `${10 ** exp}`;
    if (exp === 1) return "10";
    if (exp === 2) return "100";
    if (exp === 3) return "1K";
    if (exp === 4) return "10K";
    return `10^${exp}`;
  };

  // Collect BQL labels across all groups, de-overlap vertically
  const bqlLabels = useMemo(() => {
    const LINE_H = 10; // min vertical spacing between labels
    const raw: { y: number; bql: number; n: number; h: number; color: string; doseLevel: number }[] = [];
    for (const dg of groups) {
      const color = getDoseGroupColor(dg.dose_level);
      for (const ct of dg.concentration_time) {
        const h = ct.elapsed_h ?? 0;
        if (ct.n_bql > 0 && h > 0 && ct.mean > 0) {
          raw.push({ y: yScale(ct.mean), bql: ct.n_bql, n: ct.n, h, color, doseLevel: dg.dose_level });
        }
      }
    }
    // Sort by Y position (top to bottom)
    raw.sort((a, b) => a.y - b.y);
    // Push overlapping labels apart
    for (let i = 1; i < raw.length; i++) {
      if (raw[i].y - raw[i - 1].y < LINE_H) {
        raw[i] = { ...raw[i], y: raw[i - 1].y + LINE_H };
      }
    }
    return raw;
  }, [groups, yScale]);

  // Voronoi snap: mouse X → nearest hour
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (allHours.length === 0) return;
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      const svgPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      let best = allHours[0];
      for (let i = 0; i < allHours.length - 1; i++) {
        const mid = (xScale(allHours[i]) + xScale(allHours[i + 1])) / 2;
        if (svgPt.x > mid) best = allHours[i + 1];
        else break;
      }
      setHoveredHour(best);
    },
    [allHours, xScale],
  );

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Plasma concentration &middot; log scale &middot; 95% CI shaded
      </div>
      <svg
        ref={measuredRef}
        className="w-full"
        viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
        preserveAspectRatio="xMinYMin meet"
        style={{ height: SVG_HEIGHT }}
      >
        {/* Y gridlines */}
        {yTicks.map(e => (
          <g key={e}>
            <line x1={PAD.left} x2={width - PAD.right} y1={yScale(10 ** e)} y2={yScale(10 ** e)} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2" />
            <text x={PAD.left - 3} y={yScale(10 ** e)} textAnchor="end" dominantBaseline="central" className="text-[8px]" fill="var(--muted-foreground)">{fmtY(e)}</text>
          </g>
        ))}

        {/* LLOQ line */}
        {lloq != null && lloq > 0 && (
          <>
            <line x1={PAD.left} x2={width - PAD.right} y1={yScale(lloq)} y2={yScale(lloq)} stroke="var(--muted-foreground)" strokeWidth={0.5} strokeDasharray="4 3" opacity={0.4} />
            <text x={width - PAD.right + 6} y={yScale(lloq)} textAnchor="start" dominantBaseline="central" className="text-[8px] font-semibold" fill="var(--muted-foreground)">LLOQ</text>
          </>
        )}

        {/* Safety margin band — area between NOAEL CI upper and LOAEL CI lower */}
        {noaelDoseLevel != null && loaelDoseLevel != null && (() => {
          const noaelGroup = allGroups.find(dg => dg.dose_level === noaelDoseLevel);
          const loaelGroup = allGroups.find(dg => dg.dose_level === loaelDoseLevel);
          if (!noaelGroup || !loaelGroup) return null;

          const noaelByH = new Map(noaelGroup.concentration_time.map(ct => [ct.elapsed_h ?? 0, ct]));
          const loaelByH = new Map(loaelGroup.concentration_time.map(ct => [ct.elapsed_h ?? 0, ct]));
          const sharedHours = allHours.filter(h => noaelByH.has(h) && loaelByH.has(h));
          if (sharedHours.length < 2) return null;

          const pts = sharedHours.map(h => {
            const n = noaelByH.get(h)!;
            const l = loaelByH.get(h)!;
            const nUpper = n.mean > 0 ? n.mean + ci95Half(n.sd, n.n) : 0;
            const lLower = l.mean > 0 ? Math.max(l.mean - ci95Half(l.sd, l.n), 0.1) : 0;
            return { x: xScale(h), nUpper, lLower };
          }).filter(p => p.nUpper > 0 && p.lLower > 0);

          if (pts.length < 2) return null;

          const upper = pts.map(p => `${p.x},${yScale(p.lLower)}`).join(" L ");
          const lower = [...pts].reverse().map(p => `${p.x},${yScale(p.nUpper)}`).join(" L ");

          return (
            <path
              d={`M ${upper} L ${lower} Z`}
              fill="#BA7517"
              opacity={0.18}
            >
              <title>Safety margin: area between NOAEL CI upper and LOAEL CI lower</title>
            </path>
          );
        })()}

        {/* CI bands + lines per dose group */}
        {groups.map(dg => {
          const color = getDoseGroupColor(dg.dose_level);
          const pts = dg.concentration_time
            .filter(ct => ct.mean > 0)
            .map(ct => {
              const half = ci95Half(ct.sd, ct.n);
              return {
                h: ct.elapsed_h ?? 0,
                x: xScale(ct.elapsed_h ?? 0),
                y: ct.mean,
                lo: Math.max(ct.mean - half, 0.1),
                hi: ct.mean + half,
                bql: ct.n_bql,
              };
            });

          if (pts.length === 0) return null;

          const bandUp = pts.map(p => `${p.x},${yScale(p.hi)}`).join(" L ");
          const bandDn = [...pts].reverse().map(p => `${p.x},${yScale(p.lo)}`).join(" L ");
          const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${yScale(p.y)}`).join(" ");

          return (
            <g key={dg.dose_level}>
              <path d={`M ${bandUp} L ${bandDn} Z`} fill={color} opacity={0.10} />
              <path d={line} fill="none" stroke={color} strokeWidth={1} />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={yScale(p.y)} r={2.5} fill={color} />
              ))}
            </g>
          );
        })}

        {/* BQL labels — right margin, color-coded, de-overlapped */}
        {bqlLabels.map((b, i) => (
          <text key={`bql-${i}`} x={width - PAD.right + 6} y={b.y} textAnchor="start" dominantBaseline="central" className="text-[7px] font-semibold" fill={b.color}>
            {b.bql} BQL
            <title>{b.bql} of {b.n} subjects below quantitation limit at {b.h}h</title>
          </text>
        ))}

        {/* Hover crosshair */}
        {hoveredHour != null && (
          <line
            x1={xScale(hoveredHour)}
            x2={xScale(hoveredHour)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="#64748b"
            strokeWidth={0.5}
            opacity={0.5}
          />
        )}

        {/* Hover dots */}
        {hoveredHour != null && groups.map(dg => {
          const ct = dg.concentration_time.find(c => (c.elapsed_h ?? 0) === hoveredHour);
          if (!ct || ct.mean <= 0) return null;
          return (
            <circle
              key={dg.dose_level}
              cx={xScale(hoveredHour)}
              cy={yScale(ct.mean)}
              r={3.5}
              fill={getDoseGroupColor(dg.dose_level)}
              stroke="white"
              strokeWidth={1}
            />
          );
        })}

        {/* X-axis labels */}
        {allHours.map(h => (
          <text key={h} x={xScale(h)} y={SVG_HEIGHT - 4} textAnchor="middle" dominantBaseline="auto" className="text-[8px]" fill="var(--muted-foreground)">
            {h === 0 ? "Pre" : `${h}h`}
          </text>
        ))}

        {/* Invisible hit area for hover */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredHour(null)}
        />
      </svg>

      {/* Hover detail row */}
      {hoveredHour != null && (
        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          <span className="font-medium">{hoveredHour === 0 ? "Pre-dose" : `${hoveredHour}h`}</span>
          {groups.map(dg => {
            const ct = dg.concentration_time.find(c => (c.elapsed_h ?? 0) === hoveredHour);
            if (!ct || ct.mean <= 0) return null;
            return (
              <span key={dg.dose_level} style={{ color: getDoseGroupColor(dg.dose_level) }}>
                {ct.mean >= 100 ? Math.round(ct.mean) : ct.mean.toPrecision(3)}
              </span>
            );
          })}
        </div>
      )}

    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// PK Parameters Table
// ═══════════════════════════════════════════════════════════════════════════

function PkParameterTable({
  groups,
  doseGroups,
  allGroups,
}: {
  groups: PkIntegration["by_dose_group"] & object[];
  doseGroups: DoseGroup[];
  allGroups: PkIntegration["by_dose_group"] & object[];
}) {
  // Pick best AUC parameter
  const aucKey = useMemo(() => {
    for (const k of ["AUCLST", "AUCTAU", "AUCIFO"]) {
      if (allGroups.some(dg => dg.parameters[k]?.mean != null)) return k;
    }
    return null;
  }, [allGroups]);

  const fmtVal = (v: number | null | undefined) => {
    if (v == null) return "\u2014";
    if (v >= 10000) return `${(v / 1000).toFixed(1)}K`;
    if (v >= 100) return Math.round(v).toString();
    return v.toFixed(1);
  };

  const fmtSd = (sd: number | null | undefined) => {
    if (sd == null) return "";
    if (sd >= 10000) return `\u00B1${(sd / 1000).toFixed(1)}K`;
    if (sd >= 100) return `\u00B1${Math.round(sd)}`;
    return `\u00B1${sd.toFixed(1)}`;
  };

  const fmtCv = (mean: number | null | undefined, sd: number | null | undefined) => {
    if (mean == null || sd == null || mean === 0) return "\u2014";
    return `${Math.round((sd / mean) * 100)}%`;
  };

  const cmaxUnit = allGroups[0]?.parameters.CMAX?.unit ?? "";
  const aucUnit = aucKey ? (allGroups[0]?.parameters[aucKey]?.unit ?? "") : "";

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">PK parameters</div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b">
            <th className="text-left py-0.5 pr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dose</th>
            <th className="text-right py-0.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">C<sub>max</sub>{cmaxUnit && <div className="text-[9px] font-normal normal-case tracking-normal">{cmaxUnit}</div>}</th>
            {aucKey && (
              <th className="text-right py-0.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AUC{aucUnit && <div className="text-[9px] font-normal normal-case tracking-normal">{aucUnit}</div>}</th>
            )}
            <th className="text-right py-0.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">T<sub>max</sub><div className="text-[9px] font-normal normal-case tracking-normal">h</div></th>
            <th className="text-right py-0.5 pl-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" title="Coefficient of variation on Cmax">CV%</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(dg => {
            const cmax = dg.parameters.CMAX;
            const auc = aucKey ? dg.parameters[aucKey] : null;
            const tmax = dg.parameters.TMAX;
            const cv = cmax?.mean && cmax?.sd ? Math.round((cmax.sd / cmax.mean) * 100) : null;
            const highCv = cv != null && cv > 50;
            return (
              <tr key={dg.dose_level} className="border-b border-border/50">
                <td className="py-1 pr-1 whitespace-nowrap text-foreground">
                  <span className="font-medium">{shortDoseLabel(dg.dose_label, doseGroups)}</span>
                </td>
                <td className="text-right py-1 px-1 tabular-nums">
                  {fmtVal(cmax?.mean)} <span className="text-muted-foreground/60">{fmtSd(cmax?.sd)}</span>
                </td>
                {aucKey && (
                  <td className="text-right py-1 px-1 tabular-nums">
                    {fmtVal(auc?.mean)} <span className="text-muted-foreground/60">{fmtSd(auc?.sd)}</span>
                  </td>
                )}
                <td className="text-right py-1 px-1 tabular-nums">{fmtVal(tmax?.mean)}</td>
                <td className={`text-right py-1 pl-1 tabular-nums ${highCv ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                  {fmtCv(cmax?.mean, cmax?.sd)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Safety Margin Flag — directional CI overlap between NOAEL and LOAEL
// ═══════════════════════════════════════════════════════════════════════════

function SafetyMarginFlag({
  pkData,
  allGroups,
}: {
  pkData: PkIntegration;
  allGroups: PkIntegration["by_dose_group"] & object[];
}) {
  const flag = useMemo(() => {
    const noaelExp = pkData.noael_exposure;
    const loaelExp = pkData.loael_exposure;
    if (!noaelExp || !loaelExp) return null;

    // Find the by_dose_group entries for NOAEL and LOAEL to get n
    const noaelGroup = allGroups.find(dg => dg.dose_level === noaelExp.dose_level);
    const loaelGroup = allGroups.find(dg => dg.dose_level === loaelExp.dose_level);

    // Check AUC first (primary exposure metric), fall back to Cmax
    const checks: { param: string; noael: { mean: number; sd: number | null }; loael: { mean: number; sd: number | null }; noaelN: number; loaelN: number }[] = [];

    if (noaelExp.auc?.mean && loaelExp.auc?.mean) {
      // Try to get AUC stats from by_dose_group for n and sd
      const aucKey = ["AUCLST", "AUCTAU", "AUCIFO"].find(k =>
        noaelGroup?.parameters[k]?.mean != null && loaelGroup?.parameters[k]?.mean != null,
      );
      const noaelAuc = aucKey ? noaelGroup?.parameters[aucKey] : null;
      const loaelAuc = aucKey ? loaelGroup?.parameters[aucKey] : null;
      checks.push({
        param: "AUC",
        noael: { mean: noaelExp.auc.mean, sd: noaelAuc?.sd ?? noaelExp.auc.sd },
        loael: { mean: loaelExp.auc.mean, sd: loaelAuc?.sd ?? loaelExp.auc.sd },
        noaelN: noaelAuc?.n ?? noaelGroup?.n_subjects ?? 3,
        loaelN: loaelAuc?.n ?? loaelGroup?.n_subjects ?? 3,
      });
    }

    if (noaelExp.cmax?.mean && loaelExp.cmax?.mean) {
      const noaelCmax = noaelGroup?.parameters.CMAX;
      const loaelCmax = loaelGroup?.parameters.CMAX;
      checks.push({
        param: "Cmax",
        noael: { mean: noaelExp.cmax.mean, sd: noaelCmax?.sd ?? noaelExp.cmax.sd },
        loael: { mean: loaelExp.cmax.mean, sd: loaelCmax?.sd ?? loaelExp.cmax.sd },
        noaelN: noaelCmax?.n ?? noaelGroup?.n_subjects ?? 3,
        loaelN: loaelCmax?.n ?? loaelGroup?.n_subjects ?? 3,
      });
    }

    for (const c of checks) {
      if (c.noael.sd == null || c.loael.sd == null) continue;
      const noaelUpper = c.noael.mean + ci95Half(c.noael.sd, c.noaelN);
      const loaelLower = c.loael.mean - ci95Half(c.loael.sd, c.loaelN);
      if (noaelUpper >= loaelLower) {
        return {
          param: c.param,
          noaelUpper: Math.round(noaelUpper),
          loaelLower: Math.round(loaelLower),
        };
      }
    }
    return null;
  }, [pkData, allGroups]);

  if (!flag) return null;

  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded px-2 py-1.5">
      <div className="text-[10px] font-semibold text-amber-700 mb-0.5">
        Safety margin overlap
      </div>
      <div className="text-[10px] text-amber-600/80 leading-snug">
        NOAEL {flag.param} CI upper ({flag.noaelUpper}) reaches LOAEL CI lower ({flag.loaelLower}).
        Exposure-based safety margin may be statistically indistinguishable.
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Dose Proportionality Badge
// ═══════════════════════════════════════════════════════════════════════════

function DoseProportionalityBadge({ dp }: { dp: NonNullable<PkIntegration["dose_proportionality"]> }) {
  const label = dp.non_monotonic ? "Non-monotonic" : dp.assessment === "sublinear" ? "Sublinear" : "Supralinear";

  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded px-2 py-1.5">
      <div className="text-[10px] font-semibold text-amber-700 mb-0.5">
        Dose proportionality: {label}
      </div>
      <div className="text-[10px] text-amber-600/80 leading-snug">
        {dp.slope != null && <span>Slope {dp.slope.toFixed(2)}</span>}
        {dp.r_squared != null && <span> &middot; R&sup2; {dp.r_squared.toFixed(2)}</span>}
      </div>
      {dp.interpretation && (
        <div className="text-[10px] text-muted-foreground leading-snug mt-1">{dp.interpretation}</div>
      )}
    </div>
  );
}
