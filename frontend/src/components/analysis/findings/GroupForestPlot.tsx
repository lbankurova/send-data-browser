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
import { computeGLowerCI, computeGUpper, sigmoidTransform } from "@/lib/g-lower";

interface Props {
  endpoints: EndpointSummary[];
}

type SortMode = "gLower" | "effect" | "pValue" | "domain";

// ── Shared axis helpers ──────────────────────────────────────

export const WHISKER_WIDTH = 200;
export const WHISKER_HEIGHT = 20;
export const WHISKER_PAD = 12;

export function toX(v: number, axisMin: number, axisMax: number): number {
  const range = axisMax - axisMin;
  if (range === 0) return WHISKER_PAD;
  return WHISKER_PAD + ((v - axisMin) / range) * (WHISKER_WIDTH - 2 * WHISKER_PAD);
}

/** Fixed tick values for the sigmoid-transformed axis.
 *  Show raw effect sizes at meaningful thresholds, positioned via sigmoid transform. */
function sigmoidAxisTicks(): { raw: number; transformed: number }[] {
  const rawTicks = [0, 0.5, 1, 2, 3];
  const result: { raw: number; transformed: number }[] = [];
  for (const r of rawTicks) {
    result.push({ raw: r, transformed: sigmoidTransform(r) });
    if (r > 0) result.push({ raw: -r, transformed: -sigmoidTransform(r) });
  }
  return result.sort((a, b) => a.transformed - b.transformed);
}

// ── Axis header (renders above the whisker column) ───────────

export function AxisHeader({ axisMin, axisMax, label }: { axisMin: number; axisMax: number; label: string }) {
  const ticks = sigmoidAxisTicks();
  const zeroX = toX(0, axisMin, axisMax);
  return (
    <div className="relative" style={{ width: WHISKER_WIDTH, height: 28 }}>
      <svg width={WHISKER_WIDTH} height={28}>
        {/* Axis line */}
        <line x1={WHISKER_PAD} y1={20} x2={WHISKER_WIDTH - WHISKER_PAD} y2={20} stroke="#d1d5db" strokeWidth={1} />
        {/* Zero line — dashed, prominent */}
        <line x1={zeroX} y1={4} x2={zeroX} y2={20} stroke="#9ca3af" strokeWidth={1} strokeDasharray="2,2" />
        <text x={zeroX} y={3} textAnchor="middle" className="fill-muted-foreground" fontSize={8} fontWeight={600}>0</text>
        {/* Tick marks: show raw effect sizes at sigmoid-transformed positions */}
        {ticks.filter(t => t.raw !== 0 && t.transformed >= axisMin && t.transformed <= axisMax).map((t) => {
          const x = toX(t.transformed, axisMin, axisMax);
          return (
            <g key={t.raw}>
              <line x1={x} y1={17} x2={x} y2={20} stroke="#d1d5db" strokeWidth={1} />
              <text x={x} y={14} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>{t.raw}</text>
            </g>
          );
        })}
      </svg>
      <div className="absolute -bottom-0.5 left-0 w-full text-center text-[8px] text-muted-foreground/60">{label}</div>
    </div>
  );
}

// ── CI Whisker SVG (inline, per row) ─────────────────────────

export interface WhiskerMarkerStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export function CIWhisker({
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

// ── Unified effect size ─────────────────────────────────────

/** True if this endpoint has incidence data (affected/n).
 *  MI has affected/n despite not being in INCIDENCE_DOMAINS. */
function isIncidenceEndpoint(ep: EndpointSummary): boolean {
  return ep.riskDifference != null || ep.cohensH != null;
}

/** Raw (unsigned) effect size on the unified scale: |g| for continuous, |h| for incidence. */
function rawEffectSize(ep: EndpointSummary): number {
  if (isIncidenceEndpoint(ep)) return Math.abs(ep.cohensH ?? 0);
  return Math.abs(ep.maxEffectSize ?? 0);
}

/** Signed sigmoid: preserves sign, compresses magnitude. */
export function signedSigmoid(x: number): number {
  return x >= 0 ? sigmoidTransform(x) : -sigmoidTransform(-x);
}

// ── Sort helpers ─────────────────────────────────────────────

function getSortValue(ep: EndpointSummary, mode: SortMode): number {
  switch (mode) {
    case "gLower":
      return ep.gLower ?? 0;
    case "effect":
      return rawEffectSize(ep);
    case "pValue":
      return -(ep.minPValue ?? 1);
    case "domain":
      return 0;
  }
}

// ── Main component ──────────────────────────────────────────

export function GroupForestPlot({ endpoints }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>("gLower");

  // Single sorted list — all endpoints on unified sigmoid-transformed scale
  const sortedEndpoints = useMemo(() => {
    const sorted = [...endpoints];
    if (sortMode === "domain") {
      sorted.sort((a, b) => {
        const d = a.domain.localeCompare(b.domain);
        return d !== 0 ? d : getSortValue(b, "gLower") - getSortValue(a, "gLower");
      });
    } else {
      sorted.sort((a, b) => getSortValue(b, sortMode) - getSortValue(a, sortMode));
    }
    return sorted;
  }, [endpoints, sortMode]);

  // Unified axis: sigmoid-transformed effect size. Axis range is fixed at [-SIGMOID_SCALE, +SIGMOID_SCALE]
  // since sigmoid asymptotes there. We use a slightly smaller range for visual padding.
  const SIGMOID_SCALE = 4.0;
  const axis = useMemo(() => ({
    min: -SIGMOID_SCALE * 0.95,
    max: SIGMOID_SCALE * 0.95,
  }), []);

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

      {/* Single unified panel — all endpoints on sigmoid-transformed scale */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border/30 bg-muted/30">
          <div className="flex items-end justify-between px-3 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {sortedEndpoints.length} endpoints
            </span>
            <AxisHeader axisMin={axis.min} axisMax={axis.max} label="Effect size" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedEndpoints.length > 0 ? (
            <table className="w-full text-[11px]">
              <tbody>
                {sortedEndpoints.map((ep) => (
                  <ForestRow
                    key={`${ep.endpoint_label}\0${ep.domain}`}
                    ep={ep}
                    axisMin={axis.min}
                    axisMax={axis.max}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">No endpoints in this group</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Row component ───────────────────────────────────────────

function ForestRow({
  ep,
  axisMin,
  axisMax,
}: {
  ep: EndpointSummary;
  axisMin: number;
  axisMax: number;
}) {
  const isSig = ep.minPValue != null && ep.minPValue < 0.05;
  const isInc = isIncidenceEndpoint(ep);

  // Which sex drives the displayed effect?
  let drivingSex = ep.sexes.length === 1 ? ep.sexes[0] : "";
  if (ep.bySex && ep.bySex.size >= 2) {
    let bestAbs = -1;
    for (const [sex, sexData] of ep.bySex) {
      const abs = Math.abs(sexData.maxEffectSize ?? 0);
      if (abs > bestAbs) { bestAbs = abs; drivingSex = sex; }
    }
  }

  // Marker encoding — matches scatter (FindingsQuadrantScatter)
  const nw = ep.endpointConfidence?.noaelContribution.weight;
  const isAdverse = ep.worstSeverity === "adverse";
  let markerFill: string;
  if (nw === 1.0) markerFill = "rgba(248,113,113,0.7)";
  else if (nw === 0.7) markerFill = "#9CA3AF";
  else if (nw === 0.3) markerFill = "transparent";
  else markerFill = "#9CA3AF";
  const marker: WhiskerMarkerStyle = {
    fill: markerFill,
    stroke: isAdverse ? "#374151" : (nw === 0.3 ? "#9CA3AF" : "transparent"),
    strokeWidth: isAdverse ? 1.5 : 1,
  };

  // Unified effect size: g for continuous, h for incidence — both sigmoid-transformed
  let rawCenter: number;
  let rawLower: number;
  let rawUpper: number;
  let rawEffectLabel: string;

  if (isInc) {
    // Incidence: use Cohen's h (comparable scale to g)
    const h = ep.cohensH ?? 0;
    rawCenter = h;
    rawLower = ep.hCiLower ?? h;
    rawUpper = ep.hCiUpper ?? h;
    rawEffectLabel = `h = ${h.toFixed(3)}  95% CI [${rawLower.toFixed(2)}, ${rawUpper.toFixed(2)}]`;
  } else {
    // Continuous: use Hedges' g with 95% CI
    const absG = Math.abs(ep.maxEffectSize ?? 0);
    const n1 = ep.controlStats?.n ?? 0;
    const n2 = ep.worstTreatedStats?.n ?? 0;
    const gl95 = (n1 >= 2 && n2 >= 2 && absG > 0) ? computeGLowerCI(ep.maxEffectSize ?? 0, n1, n2, 0.975) : 0;
    const gu95 = (n1 >= 2 && n2 >= 2 && absG > 0) ? computeGUpper(ep.maxEffectSize ?? 0, n1, n2, 0.975) : absG;
    if (ep.direction === "down") {
      rawCenter = -absG;
      rawLower = -gu95;
      rawUpper = -gl95;
    } else {
      rawCenter = absG;
      rawLower = gl95;
      rawUpper = gu95;
    }
    rawEffectLabel = `g = ${rawCenter.toFixed(3)}  95% CI [${rawLower.toFixed(2)}, ${rawUpper.toFixed(2)}]`;
  }

  // Sigmoid-transform for axis positioning (compresses extreme values)
  const center = signedSigmoid(rawCenter);
  const lower = signedSigmoid(rawLower);
  const upper = signedSigmoid(rawUpper);

  // Marker size: effective sample size
  const n1 = ep.controlStats?.n ?? 5;
  const n2 = ep.worstTreatedStats?.n ?? 5;
  const nHarmonic = (n1 > 0 && n2 > 0) ? 2 * n1 * n2 / (n1 + n2) : 5;
  const radius = Math.min(7, Math.max(3, Math.sqrt(nHarmonic) * 1.2));

  // Tooltip shows RAW (untransformed) values
  const tooltip = [
    ep.endpoint_label,
    `Organ: ${ep.organ_system}`,
    rawEffectLabel,
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
