/**
 * GroupForestPlot — table+chart hybrid for multi-endpoint effect size overview.
 *
 * Renders in the chart area when a grouped rail card (organ/specimen/syndrome)
 * is selected. Shows all endpoints in the group with CI whiskers.
 *
 * Phase 1A of multi-endpoint investigation synthesis.
 *
 * Design:
 * - Left columns: endpoint label, domain badge, severity dot, direction, effect size
 * - Right: horizontal CI whisker (SVG inline)
 * - Default sort: caterpillar by gLower descending (per R2 peer review)
 * - Two sections: continuous (Hedges' g axis) + incidence (risk difference axis)
 * - Filled circle = FDR q < 0.05; hollow = non-significant
 * - Click row -> selects endpoint (parent handles navigation)
 */

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import type { EndpointSummary } from "@/lib/derive-summaries";
import { getSexColor } from "@/lib/severity-colors";
import { computeGLowerCI, computeGUpper } from "@/lib/g-lower";

interface Props {
  endpoints: EndpointSummary[];
}

type SortMode = "gLower" | "effect" | "pValue" | "domain";

// ── Shared axis helpers ──────────────────────────────────────

const WHISKER_WIDTH = 200;
const WHISKER_HEIGHT = 20;
const WHISKER_PAD = 12;

function toX(v: number, axisMin: number, axisMax: number): number {
  const range = axisMax - axisMin;
  if (range === 0) return WHISKER_PAD;
  return WHISKER_PAD + ((v - axisMin) / range) * (WHISKER_WIDTH - 2 * WHISKER_PAD);
}

/** Compute "nice" tick values for an axis range. */
function niceAxisTicks(min: number, max: number): number[] {
  const range = max - min;
  // Pick step: 0.5, 1, or 2 depending on range
  let step = 0.5;
  if (range > 4) step = 1;
  if (range > 8) step = 2;
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max; v += step) {
    ticks.push(Math.round(v * 100) / 100); // avoid float noise
  }
  return ticks;
}

// ── Axis header (renders above the whisker column) ───────────

function AxisHeader({ axisMin, axisMax, label }: { axisMin: number; axisMax: number; label: string }) {
  const ticks = niceAxisTicks(axisMin, axisMax);
  const zeroX = toX(0, axisMin, axisMax);
  return (
    <div className="relative" style={{ width: WHISKER_WIDTH, height: 28 }}>
      <svg width={WHISKER_WIDTH} height={28}>
        {/* Axis line */}
        <line x1={WHISKER_PAD} y1={20} x2={WHISKER_WIDTH - WHISKER_PAD} y2={20} stroke="#d1d5db" strokeWidth={1} />
        {/* Zero line — dashed, prominent */}
        <line x1={zeroX} y1={4} x2={zeroX} y2={20} stroke="#9ca3af" strokeWidth={1} strokeDasharray="2,2" />
        <text x={zeroX} y={3} textAnchor="middle" className="fill-muted-foreground" fontSize={8} fontWeight={600}>0</text>
        {/* Tick marks and labels */}
        {ticks.filter(v => v !== 0).map((v) => {
          const x = toX(v, axisMin, axisMax);
          return (
            <g key={v}>
              <line x1={x} y1={17} x2={x} y2={20} stroke="#d1d5db" strokeWidth={1} />
              <text x={x} y={14} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>{v}</text>
            </g>
          );
        })}
      </svg>
      {/* Axis label centered below */}
      <div className="absolute -bottom-0.5 left-0 w-full text-center text-[8px] text-muted-foreground/60">{label}</div>
    </div>
  );
}

// ── CI Whisker SVG (inline, per row) ─────────────────────────

interface WhiskerMarkerStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

function CIWhisker({
  center,
  lower,
  upper,
  axisMin,
  axisMax,
  significant,
  radius = 4,
  marker,
}: {
  center: number;
  lower: number | null;
  upper: number | null;
  axisMin: number;
  axisMax: number;
  significant: boolean;
  radius?: number;
  marker: WhiskerMarkerStyle;
}) {
  const range = axisMax - axisMin;
  if (range === 0) return null;
  const cx = toX(center, axisMin, axisMax);
  const lx = lower != null ? toX(Math.max(lower, axisMin), axisMin, axisMax) : cx;
  const ux = upper != null ? toX(Math.min(upper, axisMax), axisMin, axisMax) : cx;
  const cy = WHISKER_HEIGHT / 2;
  const zeroX = toX(0, axisMin, axisMax);

  // Whisker style: solid = significant (Dunnett p < 0.05), dashed = not
  const whiskerDash = significant ? undefined : "3,2";

  return (
    <svg width={WHISKER_WIDTH} height={WHISKER_HEIGHT} className="shrink-0">
      {/* Zero reference line */}
      <line x1={zeroX} y1={0} x2={zeroX} y2={WHISKER_HEIGHT} stroke="#d1d5db" strokeWidth={1} />
      {/* CI whisker line: solid = significant, dashed = not */}
      <line x1={lx} y1={cy} x2={ux} y2={cy} stroke="#6b7280" strokeWidth={1.5} strokeDasharray={whiskerDash} />
      {/* CI caps */}
      {lower != null && <line x1={lx} y1={cy - 4} x2={lx} y2={cy + 4} stroke="#6b7280" strokeWidth={1} />}
      {upper != null && <line x1={ux} y1={cy - 4} x2={ux} y2={cy + 4} stroke="#6b7280" strokeWidth={1} />}
      {/* Center marker: encoding matches scatter (fill=NOAEL weight, stroke=severity) */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={marker.fill}
        stroke={marker.stroke}
        strokeWidth={marker.strokeWidth}
      />
    </svg>
  );
}

// ── Legend ────────────────────────────────────────────────────

function ForestLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-border/30 px-3 py-1 text-[10px] text-muted-foreground">
      <Info className="h-3 w-3 shrink-0 text-muted-foreground/50" />
      {/* Marker fill = NOAEL weight (same as scatter) */}
      <div className="flex items-center gap-1">
        <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill="rgba(248,113,113,0.7)" stroke="#374151" strokeWidth={1.5} /></svg>
        <span>NOAEL determining</span>
      </div>
      <div className="flex items-center gap-1">
        <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill="#9CA3AF" stroke="#374151" strokeWidth={1.5} /></svg>
        <span>Adverse</span>
      </div>
      <div className="flex items-center gap-1">
        <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill="#9CA3AF" stroke="transparent" strokeWidth={0} /></svg>
        <span>Contributing</span>
      </div>
      <div className="flex items-center gap-1">
        <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill="transparent" stroke="#9CA3AF" strokeWidth={1} /></svg>
        <span>Supporting</span>
      </div>
      <span className="text-muted-foreground/40">|</span>
      {/* Whisker style = pairwise significance */}
      <div className="flex items-center gap-1">
        <svg width={20} height={10}>
          <line x1={2} y1={5} x2={18} y2={5} stroke="#6b7280" strokeWidth={1.5} />
        </svg>
        <span>p&lt;0.05</span>
      </div>
      <div className="flex items-center gap-1">
        <svg width={20} height={10}>
          <line x1={2} y1={5} x2={18} y2={5} stroke="#6b7280" strokeWidth={1.5} strokeDasharray="3,2" />
        </svg>
        <span>Not sig</span>
      </div>
      <span className="text-muted-foreground/40">|</span>
      <span>Left of 0 = decrease, right = increase</span>
    </div>
  );
}

// ── Incidence detection ─────────────────────────────────────

/** True if this endpoint has incidence data (affected/n) — determines panel placement.
 *  Uses riskDifference as the indicator: only computed when group_stats has affected/n.
 *  This correctly classifies MI as incidence (it has affected/n despite not being in
 *  the INCIDENCE_DOMAINS set, which excludes MI because MI's max_effect_size stores
 *  avg_severity rather than Hedges' g). */
function isIncidenceEndpoint(ep: EndpointSummary): boolean {
  return ep.riskDifference != null || ep.cohensH != null;
}

// ── Sort helpers ─────────────────────────────────────────────

function getSortValue(ep: EndpointSummary, mode: SortMode): number {
  switch (mode) {
    case "gLower": {
      if (isIncidenceEndpoint(ep)) return Math.abs(ep.riskDifference ?? 0);
      return ep.gLower ?? 0;
    }
    case "effect":
      if (isIncidenceEndpoint(ep)) return Math.abs(ep.riskDifference ?? 0);
      return Math.abs(ep.maxEffectSize ?? 0);
    case "pValue":
      return -(ep.minPValue ?? 1);
    case "domain":
      return 0; // domain sort handled by sortFn
  }
}

// ── Main component ──────────────────────────────────────────

export function GroupForestPlot({ endpoints }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>("gLower");

  // Split into continuous and incidence sections based on actual data, not domain set.
  // MI has incidence data (affected/n) but is not in INCIDENCE_DOMAINS — use isIncidenceEndpoint().
  const { continuous, incidence } = useMemo(() => {
    const cont: EndpointSummary[] = [];
    const inc: EndpointSummary[] = [];
    for (const ep of endpoints) {
      if (isIncidenceEndpoint(ep)) {
        inc.push(ep);
      } else {
        cont.push(ep);
      }
    }
    return { continuous: cont, incidence: inc };
  }, [endpoints]);

  // Sort each section
  const sortedContinuous = useMemo(() => {
    const sorted = [...continuous];
    if (sortMode === "domain") {
      sorted.sort((a, b) => {
        const d = a.domain.localeCompare(b.domain);
        return d !== 0 ? d : getSortValue(b, "gLower") - getSortValue(a, "gLower");
      });
    } else {
      sorted.sort((a, b) => getSortValue(b, sortMode) - getSortValue(a, sortMode));
    }
    return sorted;
  }, [continuous, sortMode]);

  const sortedIncidence = useMemo(() => {
    const sorted = [...incidence];
    if (sortMode === "domain") {
      sorted.sort((a, b) => {
        const d = a.domain.localeCompare(b.domain);
        return d !== 0 ? d : getSortValue(b, "gLower") - getSortValue(a, "gLower");
      });
    } else {
      sorted.sort((a, b) => getSortValue(b, sortMode) - getSortValue(a, sortMode));
    }
    return sorted;
  }, [incidence, sortMode]);

  // Compute axis ranges using 95% CIs (wider than the 80% stored on EndpointSummary)
  const contAxis = useMemo(() => {
    let absMax = 0.5;
    for (const ep of sortedContinuous) {
      const absG = Math.abs(ep.maxEffectSize ?? 0);
      const n1 = ep.controlStats?.n ?? 0;
      const n2 = ep.worstTreatedStats?.n ?? 0;
      const gu95 = (n1 >= 2 && n2 >= 2 && absG > 0) ? computeGUpper(ep.maxEffectSize ?? 0, n1, n2, 0.975) : absG;
      absMax = Math.max(absMax, gu95);
    }
    return { min: -absMax * 1.1, max: absMax * 1.1 };
  }, [sortedContinuous]);

  const incAxis = useMemo(() => {
    let min = 0, max = 0;
    for (const ep of sortedIncidence) {
      const rd = ep.riskDifference ?? 0;
      const rdl = ep.rdCiLower ?? rd;
      const rdu = ep.rdCiUpper ?? rd;
      min = Math.min(min, rdl);
      max = Math.max(max, rdu);
    }
    const absMax = Math.max(Math.abs(min), Math.abs(max), 0.1);
    return { min: -absMax * 1.1, max: absMax * 1.1 };
  }, [sortedIncidence]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Legend + sort controls */}
      <ForestLegend />
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sort</span>
        {(["gLower", "effect", "pValue", "domain"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              sortMode === mode
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode === "gLower" ? "Confident effect" : mode === "effect" ? "Raw effect" : mode === "pValue" ? "P-value" : "Domain"}
          </button>
        ))}
      </div>

      {/* Side-by-side: continuous (left) + incidence (right) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: continuous endpoints */}
        <div className={`flex flex-col overflow-hidden ${sortedIncidence.length > 0 ? "flex-1 border-r border-border/30" : "flex-1"}`}>
          {sortedContinuous.length > 0 ? (
            <>
              <div className="shrink-0 border-b border-border/30 bg-muted/30">
                <div className="flex items-end justify-between px-3 pt-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Continuous ({sortedContinuous.length})
                  </span>
                  <AxisHeader axisMin={contAxis.min} axisMax={contAxis.max} label="Hedges' g" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <tbody>
                    {sortedContinuous.map((ep) => (
                      <ForestRow
                        key={`${ep.endpoint_label}\0${ep.domain}`}
                        ep={ep}
                        axisMin={contAxis.min}
                        axisMax={contAxis.max}
                        type="continuous"
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">No continuous endpoints</div>
          )}
        </div>

        {/* Right: incidence endpoints */}
        {sortedIncidence.length > 0 && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border/30 bg-muted/30">
              <div className="flex items-end justify-between px-3 pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Incidence ({sortedIncidence.length})
                </span>
                <AxisHeader axisMin={incAxis.min} axisMax={incAxis.max} label="Risk difference" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[11px]">
                <tbody>
                  {sortedIncidence.map((ep) => (
                    <ForestRow
                      key={`${ep.endpoint_label}\0${ep.domain}`}
                      ep={ep}
                      axisMin={incAxis.min}
                      axisMax={incAxis.max}
                      type="incidence"
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sortedContinuous.length === 0 && sortedIncidence.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">No endpoints in this group</div>
        )}
      </div>
    </div>
  );
}

// ── Row component ───────────────────────────────────────────

function ForestRow({
  ep,
  axisMin,
  axisMax,
  type,
}: {
  ep: EndpointSummary;
  axisMin: number;
  axisMax: number;
  type: "continuous" | "incidence";
}) {
  const isSig = ep.minPValue != null && ep.minPValue < 0.05;

  // Which sex drives the displayed effect?
  let drivingSex = ep.sexes.length === 1 ? ep.sexes[0] : "";
  if (ep.bySex && ep.bySex.size >= 2) {
    let bestAbs = -1;
    for (const [sex, sexData] of ep.bySex) {
      const abs = Math.abs(sexData.maxEffectSize ?? 0);
      if (abs > bestAbs) { bestAbs = abs; drivingSex = sex; }
    }
  }

  // Marker encoding — matches scatter (FindingsQuadrantScatter):
  //   Fill  → NOAEL weight: determining=rose, contributing=gray, supporting=transparent
  //   Stroke → severity: adverse=dark, non-adverse=light/none
  const nw = ep.endpointConfidence?.noaelContribution.weight;
  const isAdverse = ep.worstSeverity === "adverse";
  let markerFill: string;
  if (nw === 1.0) markerFill = "rgba(248,113,113,0.7)";       // NOAEL determining — rose
  else if (nw === 0.7) markerFill = "#9CA3AF";                 // NOAEL contributing — gray
  else if (nw === 0.3) markerFill = "transparent";             // NOAEL supporting — outline
  else markerFill = "#9CA3AF";                                  // default — gray
  const marker: WhiskerMarkerStyle = {
    fill: markerFill,
    stroke: isAdverse ? "#374151" : (nw === 0.3 ? "#9CA3AF" : "transparent"),
    strokeWidth: isAdverse ? 1.5 : 1,
  };

  const effectVal = type === "continuous"
    ? ep.maxEffectSize
    : ep.riskDifference;

  // 95% two-sided CIs for display (NOT the 80% one-sided used for ranking)
  let lower: number | null = null;
  let upper: number | null = null;
  let center: number;

  if (type === "continuous") {
    const absG = Math.abs(ep.maxEffectSize ?? 0);
    const n1 = ep.controlStats?.n ?? 0;
    const n2 = ep.worstTreatedStats?.n ?? 0;
    // 97.5% one-sided = 95% two-sided
    const gl95 = (n1 >= 2 && n2 >= 2 && absG > 0) ? computeGLowerCI(ep.maxEffectSize ?? 0, n1, n2, 0.975) : 0;
    const gu95 = (n1 >= 2 && n2 >= 2 && absG > 0) ? computeGUpper(ep.maxEffectSize ?? 0, n1, n2, 0.975) : absG;
    if (ep.direction === "down") {
      center = -absG;
      lower = -gu95;
      upper = -gl95;
    } else {
      center = absG;
      lower = gl95;
      upper = gu95;
    }
  } else {
    center = ep.riskDifference ?? 0;
    lower = ep.rdCiLower ?? null;
    upper = ep.rdCiUpper ?? null;
  }

  // Marker size: scales with effective sample size (harmonic mean of n1, n2).
  // When all endpoints have equal n (common in balanced parallel designs),
  // all markers are the same size — no false precision signal.
  // When n varies (crossover, escalation, TK exclusions, recovery arms),
  // markers communicate real precision differences.
  const n1 = ep.controlStats?.n ?? 5;
  const n2 = ep.worstTreatedStats?.n ?? 5;
  const nHarmonic = (n1 > 0 && n2 > 0) ? 2 * n1 * n2 / (n1 + n2) : 5;
  // Map sqrt(nHarmonic) to radius 3-7px. sqrt(3)=1.7, sqrt(5)=2.2, sqrt(15)=3.9, sqrt(50)=7.1
  const radius = Math.min(7, Math.max(3, Math.sqrt(nHarmonic) * 1.2));

  // Tooltip
  const tooltip = [
    ep.endpoint_label,
    `Organ: ${ep.organ_system}`,
    type === "continuous"
      ? `g = ${effectVal != null ? effectVal.toFixed(3) : "N/A"}  95% CI [${(lower ?? 0).toFixed(2)}, ${(upper ?? 0).toFixed(2)}]`
      : `RD = ${effectVal != null ? effectVal.toFixed(3) : "N/A"}  95% CI [${(lower ?? 0).toFixed(2)}, ${(upper ?? 0).toFixed(2)}]`,
    ep.minPValue != null ? `Dunnett p = ${ep.minPValue < 0.001 ? "<0.001" : ep.minPValue.toFixed(4)}` : "",
    ep.controlStats ? `Control n=${ep.controlStats.n}` : "",
    ep.worstTreatedStats ? `Treated n=${ep.worstTreatedStats.n}` : "",
  ].filter(Boolean).join("\n");

  return (
    <tr className="border-b border-border/20" title={tooltip}>
      {/* Domain */}
      <td className="w-[1px] whitespace-nowrap py-1 pl-3 pr-1 text-muted-foreground">
        {ep.domain}
      </td>
      {/* Driving sex */}
      <td className="w-[1px] whitespace-nowrap py-1 pr-1.5" style={{ color: getSexColor(drivingSex) }}>
        {drivingSex}
      </td>
      {/* Endpoint label — absorber column */}
      <td className="truncate py-1 pr-2 text-foreground">
        {ep.endpoint_label}
      </td>
      {/* CI whisker */}
      <td className="w-[1px] whitespace-nowrap py-0.5 pr-3">
        <CIWhisker
          center={center}
          lower={lower}
          upper={upper}
          axisMin={axisMin}
          axisMax={axisMax}
          significant={isSig}
          radius={radius}
          marker={marker}
        />
      </td>
    </tr>
  );
}
