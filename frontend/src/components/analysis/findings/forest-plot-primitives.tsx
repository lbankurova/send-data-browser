/**
 * Forest plot SVG primitives shared across single-axis effect-size whisker
 * displays. Domain-honest building blocks (CI whisker, axis header, sigmoid
 * transform). The composed mixed-domain GroupForestPlot consumer was deleted
 * with the radar-forest cleanup; SubjectProfilePanel Detail tab still uses
 * these primitives for per-row whisker rendering.
 */
/* eslint-disable react-refresh/only-export-components */

import { sigmoidTransform } from "@/lib/g-lower";

// ── Shared axis dimensions ──────────────────────────────────

export const WHISKER_WIDTH = 200;
export const WHISKER_HEIGHT = 20;
export const WHISKER_PAD = 12;

function toX(v: number, axisMin: number, axisMax: number): number {
  const range = axisMax - axisMin;
  if (range === 0) return WHISKER_PAD;
  return WHISKER_PAD + ((v - axisMin) / range) * (WHISKER_WIDTH - 2 * WHISKER_PAD);
}

function sigmoidAxisTicks(): { raw: number; transformed: number }[] {
  const rawTicks = [0, 0.5, 1, 2, 3];
  const result: { raw: number; transformed: number }[] = [];
  for (const r of rawTicks) {
    result.push({ raw: r, transformed: sigmoidTransform(r) });
    if (r > 0) result.push({ raw: -r, transformed: -sigmoidTransform(r) });
  }
  return result.sort((a, b) => a.transformed - b.transformed);
}

// ── Axis header (renders above the whisker column) ──────────

export function AxisHeader({ axisMin, axisMax, label }: { axisMin: number; axisMax: number; label: string }) {
  const ticks = sigmoidAxisTicks();
  const zeroX = toX(0, axisMin, axisMax);
  return (
    <div className="relative" style={{ width: WHISKER_WIDTH, height: 28 }}>
      <svg width={WHISKER_WIDTH} height={28}>
        <line x1={WHISKER_PAD} y1={20} x2={WHISKER_WIDTH - WHISKER_PAD} y2={20} stroke="#d1d5db" strokeWidth={1} />
        <line x1={zeroX} y1={4} x2={zeroX} y2={20} stroke="#9ca3af" strokeWidth={1} strokeDasharray="2,2" />
        <text x={zeroX} y={3} textAnchor="middle" className="fill-muted-foreground" fontSize={8} fontWeight={600}>0</text>
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

// ── CI Whisker SVG ──────────────────────────────────────────

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

  const whiskerDash = significant ? undefined : "3,2";

  return (
    <svg width={WHISKER_WIDTH} height={WHISKER_HEIGHT} className="shrink-0">
      <line x1={zeroX} y1={0} x2={zeroX} y2={WHISKER_HEIGHT} stroke="#d1d5db" strokeWidth={1} />
      <line x1={lx} y1={cy} x2={ux} y2={cy} stroke="#6b7280" strokeWidth={1.5} strokeDasharray={whiskerDash} />
      {lower != null && <line x1={lx} y1={cy - 4} x2={lx} y2={cy + 4} stroke="#6b7280" strokeWidth={1} />}
      {upper != null && <line x1={ux} y1={cy - 4} x2={ux} y2={cy + 4} stroke="#6b7280" strokeWidth={1} />}
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

// ── Signed sigmoid (preserves sign, compresses magnitude) ───

export function signedSigmoid(x: number): number {
  return x >= 0 ? sigmoidTransform(x) : -sigmoidTransform(-x);
}
