/**
 * IsImmunogenicityPanel — Three-panel immunogenicity visualization.
 *
 * Left:  GMT kinetics (log₁₀ Y, CI bands, BLQ line, epoch shading)
 * Right: Seroconversion table + GMT-at-peak bar chart
 */
import { useMemo } from "react";
import type { UnifiedFinding } from "@/types/analysis";
import type { DoseGroup } from "@/types/index";
import { getDoseGroupColor } from "@/lib/severity-colors";

interface Props {
  finding: UnifiedFinding;
  doseGroups: DoseGroup[];
}

// Access IS-specific fields via type assertion (these are backend-only fields
// not on the UnifiedFinding interface)
function isField<T>(finding: UnifiedFinding, key: string): T | undefined {
  return (finding as unknown as Record<string, T>)[key];
}

// IS-specific fields on the finding
interface IsTimeCourseGroup {
  dose_level: number;
  gmt: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  n: number;
  n_blq: number;
  is_recovery?: boolean;
}
interface IsTimepoint {
  day: number;
  epoch: string | null;
  groups: IsTimeCourseGroup[];
}
interface IsSeroGroup {
  dose_level: number;
  pct_seropositive: number | null;
  pct_4fold_rise: number | null;
  n: number;
}
interface IsSeroTimepoint {
  day: number;
  groups: IsSeroGroup[];
}

export function IsImmunogenicityPanel({ finding, doseGroups }: Props) {
  const timeCourse = isField<IsTimepoint[]>(finding, "is_time_course");
  const seroconversion = isField<IsSeroTimepoint[]>(finding, "is_seroconversion");
  const lloq = isField<number>(finding, "is_lloq");
  const blqPct = isField<number>(finding, "is_blq_pct");
  const blqSub = isField<number>(finding, "is_blq_substitution");
  const peakDay = isField<number>(finding, "is_peak_day");

  const mainGroups = useMemo(
    () => doseGroups.filter(dg => !dg.is_recovery),
    [doseGroups],
  );

  if (!timeCourse || timeCourse.length === 0) {
    return <div className="text-xs text-muted-foreground p-4">No immunogenicity time-course data available.</div>;
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Header */}
      <div className="flex items-baseline gap-3 px-1">
        <span className="bg-gray-100 text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] font-semibold">IS</span>
        <span className="text-sm font-semibold">{finding.test_name}</span>
        <span className="text-[10px] text-muted-foreground">{finding.test_code}</span>
        {lloq != null && (
          <span className="text-[10px] text-muted-foreground">LLOQ {lloq} {finding.unit ?? ""}</span>
        )}
        {blqPct != null && (
          <span className="text-[10px] text-muted-foreground">
            BLQ <span className="text-amber-600 font-medium">{blqPct}%</span>
            {blqSub != null && <span> plotted at LLOQ/2 = {Math.round(blqSub)}</span>}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          N {mainGroups.reduce((s, g) => s + g.n_total + (g.recovery_n ?? 0), 0)}
        </span>
      </div>

      {/* Three-panel layout */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left: GMT kinetics */}
        <div className="flex-1 border rounded bg-muted/5 p-2 min-w-0">
          <GmtKineticsChart
            timeCourse={timeCourse}
            doseGroups={mainGroups}
            lloq={lloq ?? null}
          />
        </div>

        {/* Right column: seroconversion + GMT at peak */}
        <div className="flex flex-col gap-2 w-[280px] shrink-0">
          {seroconversion && (
            <div className="border rounded bg-muted/5 p-2 flex-1 overflow-auto">
              <SeroconversionTable
                seroconversion={seroconversion}
                doseGroups={mainGroups}
                peakDay={peakDay ?? null}
              />
            </div>
          )}
          {peakDay != null && (
            <div className="border rounded bg-muted/5 p-2">
              <GmtAtPeakBars
                timeCourse={timeCourse}
                doseGroups={mainGroups}
                peakDay={peakDay}
                lloq={lloq ?? null}
              />
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-1 text-[10px] text-muted-foreground">
        {mainGroups.map(dg => (
          <span key={dg.dose_level} className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: getDoseGroupColor(dg.dose_level) }} />
            {dg.label} &middot; {dg.dose_value} {dg.dose_unit} &middot; n={dg.n_total + (dg.recovery_n ?? 0)}
          </span>
        ))}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// GMT Kinetics Chart (SVG)
// ═══════════════════════════════════════════════════════════════════════════

function GmtKineticsChart({
  timeCourse,
  doseGroups,
  lloq,
}: {
  timeCourse: IsTimepoint[];
  doseGroups: DoseGroup[];
  lloq: number | null;
}) {
  const W = 500, H = 260;
  const PAD = { left: 52, right: 12, top: 20, bottom: 28 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Compute Y range (log10)
  const { yMin, yMax, allDays } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    const days = new Set<number>();
    for (const tp of timeCourse) {
      days.add(tp.day);
      for (const g of tp.groups) {
        for (const v of [g.gmt, g.ci_lower, g.ci_upper]) {
          if (v != null && v > 0) {
            lo = Math.min(lo, Math.log10(v));
            hi = Math.max(hi, Math.log10(v));
          }
        }
      }
    }
    if (lloq != null && lloq > 0) lo = Math.min(lo, Math.log10(lloq / 2));
    return { yMin: Math.floor(lo), yMax: Math.ceil(hi) + 0.5, allDays: [...days].sort((a, b) => a - b) };
  }, [timeCourse, lloq]);

  const xScale = (day: number) => {
    const idx = allDays.indexOf(day);
    return PAD.left + (idx / Math.max(allDays.length - 1, 1)) * plotW;
  };
  const yScale = (val: number) => {
    const logVal = Math.log10(Math.max(val, 1e-10));
    return PAD.top + plotH - ((logVal - yMin) / (yMax - yMin)) * plotH;
  };

  // Y-axis tick labels
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let e = yMin; e <= yMax; e++) ticks.push(e);
    return ticks;
  }, [yMin, yMax]);

  const formatYLabel = (exp: number) => {
    if (exp <= 0) return `${10 ** exp}`;
    if (exp === 1) return "10";
    if (exp === 2) return "100";
    if (exp === 3) return "1K";
    if (exp === 4) return "10K";
    if (exp === 5) return "100K";
    if (exp === 6) return "1M";
    return `10^${exp}`;
  };

  // Epoch shading
  const epochRanges = useMemo(() => {
    const ranges: { epoch: string; x1: number; x2: number }[] = [];
    let prev: string | null = null;
    let start = 0;
    for (let i = 0; i < allDays.length; i++) {
      const tp = timeCourse.find(t => t.day === allDays[i]);
      const ep = tp?.epoch ?? "";
      if (ep !== prev && prev != null) {
        ranges.push({ epoch: prev, x1: xScale(allDays[start]), x2: xScale(allDays[i - 1]) });
        start = i;
      }
      prev = ep;
    }
    if (prev != null) {
      ranges.push({ epoch: prev, x1: xScale(allDays[start]), x2: xScale(allDays[allDays.length - 1]) });
    }
    return ranges;
  }, [allDays, timeCourse, xScale]);

  // Per-group lines + CI bands
  const doseLevels = doseGroups.map(dg => dg.dose_level);

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        GMT kinetics &middot; log<sub>10</sub> scale &middot; 95% CI shaded
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Epoch background shading */}
        {epochRanges.map((r, i) => {
          const midX = (r.x1 + r.x2) / 2;
          const halfW = Math.max((r.x2 - r.x1) / 2 + 15, 30);
          return (
            <g key={i}>
              <rect x={midX - halfW} y={PAD.top} width={halfW * 2} height={plotH} fill={r.epoch === "Recovery" ? "#fef3c7" : "#f0fdf4"} opacity={0.3} />
              <text x={midX} y={PAD.top - 4} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>
                {r.epoch?.toLowerCase()}
              </text>
            </g>
          );
        })}

        {/* Y gridlines */}
        {yTicks.map(e => (
          <g key={e}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yScale(10 ** e)} y2={yScale(10 ** e)} stroke="#e5e7eb" strokeWidth={0.5} />
            <text x={PAD.left - 4} y={yScale(10 ** e) + 3} textAnchor="end" fontSize={8} className="fill-muted-foreground">{formatYLabel(e)}</text>
          </g>
        ))}

        {/* LLOQ line */}
        {lloq != null && (
          <>
            <line x1={PAD.left} x2={W - PAD.right} y1={yScale(lloq)} y2={yScale(lloq)} stroke="#ef4444" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.6} />
            <text x={W - PAD.right + 2} y={yScale(lloq) + 3} fontSize={7} className="fill-red-400">LLOQ</text>
          </>
        )}

        {/* CI bands + lines per dose group */}
        {doseLevels.map(dl => {
          const color = getDoseGroupColor(dl);
          const points: { x: number; gmt: number; ciLo: number; ciHi: number }[] = [];

          for (const tp of timeCourse) {
            // Merge main + recovery for this dose level (recovery extends the line)
            const mainG = tp.groups.find(g => g.dose_level === dl && !g.is_recovery);
            const recG = tp.groups.find(g => g.dose_level === dl && g.is_recovery);
            const g = mainG ?? recG;
            if (g?.gmt != null) {
              points.push({
                x: xScale(tp.day),
                gmt: g.gmt,
                ciLo: g.ci_lower ?? g.gmt,
                ciHi: g.ci_upper ?? g.gmt,
              });
            }
          }

          if (points.length === 0) return null;

          // CI band path
          const bandUp = points.map(p => `${p.x},${yScale(p.ciHi)}`).join(" L ");
          const bandDn = [...points].reverse().map(p => `${p.x},${yScale(p.ciLo)}`).join(" L ");
          const bandPath = `M ${bandUp} L ${bandDn} Z`;

          // Line path
          const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${yScale(p.gmt)}`).join(" ");

          return (
            <g key={dl}>
              <path d={bandPath} fill={color} opacity={0.12} />
              <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={yScale(p.gmt)} r={2.5} fill={color} />
              ))}
            </g>
          );
        })}

        {/* X-axis labels */}
        {allDays.map(day => (
          <text key={day} x={xScale(day)} y={H - 4} textAnchor="middle" fontSize={8} className="fill-muted-foreground">
            D{day >= 0 ? "+" : ""}{day}
          </text>
        ))}
      </svg>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Seroconversion Table
// ═══════════════════════════════════════════════════════════════════════════

function SeroconversionTable({
  seroconversion,
  doseGroups,
  peakDay,
}: {
  seroconversion: IsSeroTimepoint[];
  doseGroups: DoseGroup[];
  peakDay: number | null;
}) {
  const getSeroColor = (pctSero: number | null, pct4x: number | null): string => {
    if (pctSero == null) return "";
    if (pctSero >= 90 && (pct4x ?? 0) >= 90) return "text-emerald-600 font-semibold";
    if (pctSero >= 50 || (pct4x ?? 0) >= 50) return "text-blue-600 font-medium";
    if (pctSero > 0 || (pct4x ?? 0) > 0) return "text-amber-600";
    return "text-muted-foreground";
  };

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Seroconversion</div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b">
            <th className="text-left py-0.5 pr-2 text-muted-foreground font-normal" />
            {doseGroups.map(dg => (
              <th key={dg.dose_level} className="text-center py-0.5 px-1 font-semibold" style={{ color: getDoseGroupColor(dg.dose_level) }}>
                {dg.label.replace(/^Group \d+,?\s*/, "").slice(0, 10) || `G${dg.dose_level}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {seroconversion.map(tp => {
            const isPeak = tp.day === peakDay;
            return (
              <tr key={tp.day} className={`border-b border-border/50 ${isPeak ? "bg-amber-50/40" : ""}`}>
                <td className="py-1 pr-2 text-muted-foreground whitespace-nowrap">
                  D{tp.day >= 0 ? "+" : ""}{tp.day}
                  {isPeak && <span className="ml-1 text-amber-600">&#9670;</span>}
                </td>
                {doseGroups.map(dg => {
                  const g = tp.groups.find(gg => gg.dose_level === dg.dose_level);
                  if (!g || g.pct_seropositive == null) {
                    return <td key={dg.dose_level} className="text-center text-muted-foreground/40">&mdash;</td>;
                  }
                  return (
                    <td key={dg.dose_level} className={`text-center py-1 px-1 ${getSeroColor(g.pct_seropositive, g.pct_4fold_rise)}`}>
                      <div>{Math.round(g.pct_seropositive)}%</div>
                      <div className="text-[9px] opacity-70">{Math.round(g.pct_4fold_rise ?? 0)}% 4&times;</div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-[9px] text-muted-foreground/60 mt-1">% seropositive &middot; % &ge;4-fold rise from baseline</div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// GMT at Peak — horizontal log-scale bars
// ═══════════════════════════════════════════════════════════════════════════

function GmtAtPeakBars({
  timeCourse,
  doseGroups,
  peakDay,
  lloq,
}: {
  timeCourse: IsTimepoint[];
  doseGroups: DoseGroup[];
  peakDay: number;
  lloq: number | null;
}) {
  const peakTp = timeCourse.find(tp => tp.day === peakDay);

  const barData = useMemo(() => {
    if (!peakTp) return [];
    return doseGroups.map(dg => {
      const g = peakTp.groups.find(gg => gg.dose_level === dg.dose_level && !gg.is_recovery);
      return {
        label: dg.label.replace(/^Group \d+,?\s*/, "") || `G${dg.dose_level}`,
        dose_level: dg.dose_level,
        gmt: g?.gmt ?? null,
        isBLQ: g != null && lloq != null && g.gmt != null && g.gmt < lloq,
      };
    });
  }, [doseGroups, peakTp, lloq]);

  if (!peakTp) return null;

  // Log scale bar width
  const maxLog = Math.max(...barData.map(d => d.gmt != null && d.gmt > 0 ? Math.log10(d.gmt) : 0));

  const formatGmt = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return Math.round(v).toString();
  };

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        GMT at peak &mdash; day {peakDay >= 0 ? "+" : ""}{peakDay}
      </div>
      <div className="space-y-1.5">
        {barData.map(d => {
          const pct = d.gmt != null && d.gmt > 0 && maxLog > 0
            ? (Math.log10(d.gmt) / maxLog) * 100
            : 2;
          return (
            <div key={d.dose_level} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-[80px] truncate text-right">{d.label}</span>
              <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: getDoseGroupColor(d.dose_level) }}
                />
              </div>
              <span className="text-[10px] font-medium tabular-nums w-[40px] text-right">
                {d.gmt != null ? formatGmt(d.gmt) : "—"}
              </span>
              {d.isBLQ && <span className="text-[9px] text-amber-500 font-medium">BLQ</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
