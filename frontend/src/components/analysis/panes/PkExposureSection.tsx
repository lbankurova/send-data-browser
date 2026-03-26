/**
 * PkExposureSection — Study-level PK exposure visualization.
 *
 * Left:  Concentration-time chart (log Y, hours X, SD bands, LLOQ line)
 * Right: PK parameters table + dose proportionality badge
 */
import { useMemo } from "react";
import type { PkIntegration } from "@/types/analysis-views";
import type { DoseGroup } from "@/types/index";
import { getDoseGroupColor } from "@/lib/severity-colors";

interface Props {
  pkData: PkIntegration;
  doseGroups: DoseGroup[];
}

export function PkExposureSection({ pkData, doseGroups }: Props) {
  const groups = pkData.by_dose_group ?? [];
  if (groups.length === 0) return null;

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

      {/* Chart + Table */}
      <div className="flex gap-3 min-h-0">
        {/* Left: concentration-time chart */}
        <div className="flex-1 min-w-0">
          <ConcentrationTimeChart groups={groups} doseGroups={doseGroups} lloq={pkData.lloq ?? null} />
        </div>

        {/* Right: parameter table + dose proportionality */}
        <div className="w-[260px] shrink-0 space-y-2">
          <PkParameterTable groups={groups} />
          {hasNonLinear && dp && <DoseProportionalityBadge dp={dp} />}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Concentration-Time Chart (SVG)
// ═══════════════════════════════════════════════════════════════════════════

function ConcentrationTimeChart({
  groups,
  doseGroups,
  lloq,
}: {
  groups: PkIntegration["by_dose_group"] & object[];
  doseGroups: DoseGroup[];
  lloq: number | null;
}) {
  const W = 460, H = 220;
  const PAD = { left: 52, right: 12, top: 16, bottom: 28 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Collect all timepoints and value ranges
  const { allHours, yMin, yMax } = useMemo(() => {
    const hours = new Set<number>();
    let lo = Infinity, hi = -Infinity;
    for (const dg of groups) {
      for (const ct of dg.concentration_time) {
        const h = ct.elapsed_h ?? 0;
        hours.add(h);
        const vals = [ct.mean, ct.mean - ct.sd, ct.mean + ct.sd];
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

  // Map dose_level to DoseGroup for colors
  const dgMap = useMemo(() => new Map(doseGroups.map(d => [d.dose_level, d])), [doseGroups]);

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Plasma concentration &middot; log scale &middot; mean &plusmn; SD
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Y gridlines */}
        {yTicks.map(e => (
          <g key={e}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yScale(10 ** e)} y2={yScale(10 ** e)} stroke="#e5e7eb" strokeWidth={0.5} />
            <text x={PAD.left - 4} y={yScale(10 ** e) + 3} textAnchor="end" fontSize={8} className="fill-muted-foreground">{fmtY(e)}</text>
          </g>
        ))}

        {/* LLOQ line */}
        {lloq != null && lloq > 0 && (
          <>
            <line x1={PAD.left} x2={W - PAD.right} y1={yScale(lloq)} y2={yScale(lloq)} stroke="#ef4444" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.5} />
            <text x={W - PAD.right + 2} y={yScale(lloq) + 3} fontSize={7} className="fill-red-400">LLOQ</text>
          </>
        )}

        {/* Lines per dose group */}
        {groups.map(dg => {
          const color = getDoseGroupColor(dg.dose_level);
          const pts = dg.concentration_time
            .filter(ct => ct.mean > 0)
            .map(ct => ({
              x: xScale(ct.elapsed_h ?? 0),
              y: ct.mean,
              lo: Math.max(ct.mean - ct.sd, 0.1),
              hi: ct.mean + ct.sd,
              bql: ct.n_bql,
            }));

          if (pts.length === 0) return null;

          // SD band
          const bandUp = pts.map(p => `${p.x},${yScale(p.hi)}`).join(" L ");
          const bandDn = [...pts].reverse().map(p => `${p.x},${yScale(p.lo)}`).join(" L ");

          // Line
          const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${yScale(p.y)}`).join(" ");

          return (
            <g key={dg.dose_level}>
              <path d={`M ${bandUp} L ${bandDn} Z`} fill={color} opacity={0.1} />
              <path d={line} fill="none" stroke={color} strokeWidth={1.5} />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={yScale(p.y)} r={2.5} fill={color} />
                  {p.bql > 0 && (
                    <text x={p.x} y={yScale(p.y) + 10} textAnchor="middle" fontSize={6} className="fill-amber-500">{p.bql} BQL</text>
                  )}
                </g>
              ))}
            </g>
          );
        })}

        {/* X-axis */}
        {allHours.map(h => (
          <text key={h} x={xScale(h)} y={H - 4} textAnchor="middle" fontSize={8} className="fill-muted-foreground">
            {h === 0 ? "Pre" : `${h}h`}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1 text-[10px] text-muted-foreground">
        {groups.map(dg => {
          const info = dgMap.get(dg.dose_level);
          return (
            <span key={dg.dose_level} className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: getDoseGroupColor(dg.dose_level) }} />
              {info?.label ?? `Group ${dg.dose_level}`} &middot; n={dg.n_subjects}
            </span>
          );
        })}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// PK Parameters Table
// ═══════════════════════════════════════════════════════════════════════════

function PkParameterTable({
  groups,
}: {
  groups: PkIntegration["by_dose_group"] & object[];
}) {
  // Pick best AUC parameter
  const aucKey = useMemo(() => {
    for (const k of ["AUCLST", "AUCTAU", "AUCIFO"]) {
      if (groups.some(dg => dg.parameters[k]?.mean != null)) return k;
    }
    return null;
  }, [groups]);

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

  const cmaxUnit = groups[0]?.parameters.CMAX?.unit ?? "";
  const aucUnit = aucKey ? (groups[0]?.parameters[aucKey]?.unit ?? "") : "";

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">PK Parameters</div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b">
            <th className="text-left py-0.5 pr-1 text-muted-foreground font-normal">Dose</th>
            <th className="text-right py-0.5 px-1 text-muted-foreground font-normal">C<sub>max</sub><div className="text-[8px] font-normal">{cmaxUnit}</div></th>
            {aucKey && (
              <th className="text-right py-0.5 px-1 text-muted-foreground font-normal">AUC<div className="text-[8px] font-normal">{aucUnit}</div></th>
            )}
            <th className="text-right py-0.5 pl-1 text-muted-foreground font-normal">T<sub>max</sub><div className="text-[8px] font-normal">h</div></th>
          </tr>
        </thead>
        <tbody>
          {groups.map(dg => {
            const cmax = dg.parameters.CMAX;
            const auc = aucKey ? dg.parameters[aucKey] : null;
            const tmax = dg.parameters.TMAX;
            return (
              <tr key={dg.dose_level} className="border-b border-border/50">
                <td className="py-1 pr-1 whitespace-nowrap" style={{ color: getDoseGroupColor(dg.dose_level) }}>
                  <span className="font-medium">{dg.dose_value} {dg.dose_unit}</span>
                </td>
                <td className="text-right py-1 px-1 tabular-nums">
                  {fmtVal(cmax?.mean)} <span className="text-muted-foreground/60">{fmtSd(cmax?.sd)}</span>
                </td>
                {aucKey && (
                  <td className="text-right py-1 px-1 tabular-nums">
                    {fmtVal(auc?.mean)} <span className="text-muted-foreground/60">{fmtSd(auc?.sd)}</span>
                  </td>
                )}
                <td className="text-right py-1 pl-1 tabular-nums">{fmtVal(tmax?.mean)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
      <div className="text-[9px] text-amber-600/80 leading-snug">
        {dp.slope != null && <span>Slope {dp.slope.toFixed(2)}</span>}
        {dp.r_squared != null && <span> &middot; R&sup2; {dp.r_squared.toFixed(2)}</span>}
      </div>
      {dp.interpretation && (
        <div className="text-[9px] text-muted-foreground leading-snug mt-1">{dp.interpretation}</div>
      )}
    </div>
  );
}
