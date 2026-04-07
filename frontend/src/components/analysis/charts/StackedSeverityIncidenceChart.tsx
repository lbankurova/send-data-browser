/**
 * StackedSeverityIncidenceChart — single-chart replacement for the
 * dual incidence + severity panels in IncidenceDoseCharts.
 *
 * Visual model:
 *   - Doses on X axis, sex-grouped vertical bars (F | M at each dose).
 *   - Each bar is an "envelope" sized to the group denominator N.
 *     The filled portion is the affected count, stacked by severity grade.
 *     Empty space above the fill = unaffected animals.
 *   - Recovery cluster optionally drawn to the right of a vertical divider.
 *   - Toggle: counts (default) vs percent (Y normalized to 100%).
 *
 * Data expectation (caller-built; see incidence-chart-data.ts):
 *   ClusterData = doseGroups[].bySex[F|M] = { affected, n, severityCounts }
 *
 * Falls back to faceted-by-sex layout (two SVGs side by side) when
 * the dose count exceeds facetedFallbackThreshold (default 6) AND
 * there is more than one sex.
 */
import { useId, useMemo, useState } from "react";
import { getNeutralHeatColor } from "@/lib/severity-colors";

// ─── Types ───────────────────────────────────────────────────────────

export interface SexBarData {
  affected: number;
  n: number;
  /** Per-grade affected counts. Keys "1".."5". Sum should equal `affected`. */
  severityCounts?: Record<string, number> | null;
}

export interface DoseGroupData {
  doseLevel: number;
  doseLabel: string;
  bySex: Record<string, SexBarData>;
}

export interface ClusterData {
  groups: DoseGroupData[];
  sexes: string[]; // sorted F before M
}

export type DisplayMode = "counts" | "percent";

interface Props {
  main: ClusterData;
  recovery?: ClusterData;
  /** When false, severity stacks collapse to a solid neutral fill (CL/MA). */
  hasSeverity: boolean;
  /** Default mode and onChange. If onModeChange omitted, internal state is used. */
  mode?: DisplayMode;
  defaultMode?: DisplayMode;
  onModeChange?: (mode: DisplayMode) => void;
  /** Chart height in px. Default 300. */
  height?: number;
  /** When dose count exceeds this AND multi-sex, use faceted-by-sex layout. Default 6. */
  facetedFallbackThreshold?: number;
  /** Optional title shown above the chart. */
  title?: string;
  /** Hide the counts/percent toggle (when caller manages it elsewhere). */
  hideToggle?: boolean;
  /** Shared dose unit (e.g. "mg/kg") rendered once below the X-axis labels. */
  xAxisUnit?: string;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Severity grades. Order is invariant: Minimal at index 0 → Severe at index 4.
 *  In the stacked bar, index 0 (Minimal) ALWAYS sits at the bottom of the stack,
 *  index 4 (Severe) at the top, and (when present) "Ungraded" sits above Severe. */
const SEV_GRADE_LABELS = ["Minimal", "Mild", "Moderate", "Marked", "Severe"] as const;
const SEV_GRADE_SCORES = [0.1, 0.3, 0.5, 0.7, 0.9] as const;
const SEV_COLORS = SEV_GRADE_SCORES.map((s) => getNeutralHeatColor(s).bg);
const SEV_TEXT_COLORS = SEV_GRADE_SCORES.map((s) => getNeutralHeatColor(s).text);

/** Pattern fill ID for "Ungraded" — animals with the finding present but no MISEV. */
const UNGRADED_PATTERN_ID = "stacked-sev-ungraded-pattern";
const UNGRADED_LABEL = "Ungraded";
const UNGRADED_TEXT_COLOR = "#374151";

// Solid bar color for CL/MA (no severity)
const SOLID_BAR_COLOR = "#9CA3AF"; // gray-400 — matches IncidenceRecoveryChart precedent

// Layout constants
const BAR_W = 18;
const SEX_GAP = 2;
const DOSE_GAP = 16;
const CLUSTER_GAP = 28;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 44;
const PADDING_LEFT = 36;
const PADDING_RIGHT = 12;
const Y_AXIS_TICK_COUNT = 4;
const ENVELOPE_STROKE = "#D1D5DB"; // gray-300
const ENVELOPE_DASH = "2 2";
const NE_COLOR = "#9CA3AF";
const DIVIDER_COLOR = "#E5E7EB";

// ─── Helpers ─────────────────────────────────────────────────────────

function clusterMaxN(c: ClusterData | undefined): number {
  if (!c) return 0;
  let max = 0;
  for (const g of c.groups) {
    for (const sex of c.sexes) {
      const n = g.bySex[sex]?.n ?? 0;
      if (n > max) max = n;
    }
  }
  return max;
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  if (v <= 20) return 20;
  if (v <= 50) return 50;
  return Math.ceil(v / 10) * 10;
}

function clusterWidth(numDoses: number, sexes: string[]): number {
  const groupW = sexes.length * BAR_W + Math.max(0, sexes.length - 1) * SEX_GAP;
  return numDoses * groupW + Math.max(0, numDoses - 1) * DOSE_GAP;
}

// ─── Component ───────────────────────────────────────────────────────

export function StackedSeverityIncidenceChart({
  main,
  recovery,
  hasSeverity,
  mode: controlledMode,
  defaultMode = "counts",
  onModeChange,
  height = 300,
  facetedFallbackThreshold = 6,
  title,
  hideToggle = false,
  xAxisUnit,
}: Props) {
  const [internalMode, setInternalMode] = useState<DisplayMode>(defaultMode);
  const mode = controlledMode ?? internalMode;
  const setMode = (m: DisplayMode) => {
    if (onModeChange) onModeChange(m);
    else setInternalMode(m);
  };

  const sexes = main.sexes;
  const multiSex = sexes.length > 1;
  const useFaceted = multiSex && main.groups.length > facetedFallbackThreshold;

  // Y scale max — only matters in counts mode. Use global max across main + recovery.
  const yMaxCounts = useMemo(() => {
    const m = clusterMaxN(main);
    const r = clusterMaxN(recovery);
    return niceCeil(Math.max(m, r));
  }, [main, recovery]);

  if (main.groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No incidence data for this endpoint.
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header: title + toggle */}
      {(title || !hideToggle) && (
        <div className="flex shrink-0 items-center justify-between px-2 pt-1">
          {title ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
          ) : <span />}
          {!hideToggle && <ModeToggle mode={mode} onChange={setMode} />}
        </div>
      )}

      {/* Chart body */}
      <div className="flex min-h-0 min-w-0 flex-1 px-2">
        {useFaceted ? (
          <FacetedChart
            main={main}
            recovery={recovery}
            hasSeverity={hasSeverity}
            mode={mode}
            yMaxCounts={yMaxCounts}
            height={height}
            xAxisUnit={xAxisUnit}
          />
        ) : (
          <SingleChart
            main={main}
            recovery={recovery}
            hasSeverity={hasSeverity}
            mode={mode}
            yMaxCounts={yMaxCounts}
            height={height}
            xAxisUnit={xAxisUnit}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-2 py-1">
        {hasSeverity ? <SeverityLegend /> : <SolidLegend />}
      </div>
    </div>
  );
}

// ─── Single chart (main + optional recovery cluster) ─────────────────

interface ChartCoreProps {
  main: ClusterData;
  recovery?: ClusterData;
  hasSeverity: boolean;
  mode: DisplayMode;
  yMaxCounts: number;
  height: number;
  xAxisUnit?: string;
}

function SingleChart({ main, recovery, hasSeverity, mode, yMaxCounts, height, xAxisUnit }: ChartCoreProps) {
  const sexes = main.sexes;
  const mainW = clusterWidth(main.groups.length, sexes);
  const recW = recovery ? clusterWidth(recovery.groups.length, sexes) : 0;
  const totalInnerW = mainW + (recovery ? CLUSTER_GAP + recW : 0);
  const svgW = PADDING_LEFT + totalInnerW + PADDING_RIGHT;
  const innerH = height - PADDING_TOP - PADDING_BOTTOM;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${svgW} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ minWidth: 0, display: "block" }}
    >
      <defs>
        {/* Ungraded segment fill — diagonal stripes on white */}
        <pattern id={UNGRADED_PATTERN_ID} patternUnits="userSpaceOnUse" width="6" height="6">
          <rect width="6" height="6" fill="#FFFFFF" />
          <path
            d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2"
            stroke="#9CA3AF"
            strokeWidth="0.8"
          />
        </pattern>
      </defs>
      <YAxis innerH={innerH} mode={mode} yMaxCounts={yMaxCounts} />
      <Cluster
        cluster={main}
        xOffset={PADDING_LEFT}
        innerH={innerH}
        hasSeverity={hasSeverity}
        mode={mode}
        yMaxCounts={yMaxCounts}
        isRecovery={false}
        clusterLabel={recovery ? "Main" : undefined}
      />
      {recovery && (
        <>
          <ClusterDivider
            x={PADDING_LEFT + mainW + CLUSTER_GAP / 2}
            innerH={innerH}
          />
          <Cluster
            cluster={recovery}
            xOffset={PADDING_LEFT + mainW + CLUSTER_GAP}
            innerH={innerH}
            hasSeverity={hasSeverity}
            mode={mode}
            yMaxCounts={yMaxCounts}
            isRecovery={true}
            clusterLabel="Recovery"
          />
        </>
      )}
      {/* Unit caption (canonical pattern: shown once, mirrors DoseHeader's unitLabel) */}
      {xAxisUnit && (
        <text
          x={PADDING_LEFT}
          y={PADDING_TOP + innerH + 38}
          fontSize={9}
          fill="#9CA3AF"
          fontStyle="italic"
          textAnchor="start"
        >
          ({xAxisUnit})
        </text>
      )}
    </svg>
  );
}

// ─── Faceted (two charts: F left, M right) ───────────────────────────

function FacetedChart({ main, recovery, hasSeverity, mode, yMaxCounts, height, xAxisUnit }: ChartCoreProps) {
  return (
    <div className="flex h-full min-w-0 gap-3">
      {main.sexes.map((sex, sexIdx) => {
        const facetMain: ClusterData = {
          groups: main.groups.map((g) => ({
            ...g,
            bySex: g.bySex[sex] ? { [sex]: g.bySex[sex] } : {},
          })),
          sexes: [sex],
        };
        const facetRec: ClusterData | undefined = recovery
          ? {
              groups: recovery.groups.map((g) => ({
                ...g,
                bySex: g.bySex[sex] ? { [sex]: g.bySex[sex] } : {},
              })),
              sexes: [sex],
            }
          : undefined;
        return (
          <div key={sex} className="flex min-w-0 flex-1 flex-col">
            <div className="text-center text-[10px] font-medium" style={{ color: sex === "F" ? "#C62828" : "#1565C0" }}>
              {sex === "F" ? "Females" : "Males"}
            </div>
            <SingleChart
              main={facetMain}
              recovery={facetRec}
              hasSeverity={hasSeverity}
              mode={mode}
              yMaxCounts={yMaxCounts}
              height={height - 14}
              xAxisUnit={sexIdx === 0 ? xAxisUnit : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Y axis ──────────────────────────────────────────────────────────

function YAxis({ innerH, mode, yMaxCounts }: { innerH: number; mode: DisplayMode; yMaxCounts: number }) {
  const max = mode === "counts" ? yMaxCounts : 100;
  const ticks: number[] = [];
  for (let i = 0; i <= Y_AXIS_TICK_COUNT; i++) {
    ticks.push((max / Y_AXIS_TICK_COUNT) * i);
  }
  return (
    <g>
      {ticks.map((t) => {
        const y = PADDING_TOP + innerH - (t / max) * innerH;
        return (
          <g key={t}>
            <line
              x1={PADDING_LEFT - 4}
              x2={PADDING_LEFT}
              y1={y}
              y2={y}
              stroke="#9CA3AF"
              strokeWidth={1}
            />
            <text
              x={PADDING_LEFT - 6}
              y={y + 3}
              fontSize={9}
              fill="#6B7280"
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
            >
              {mode === "counts" ? Math.round(t) : `${Math.round(t)}%`}
            </text>
          </g>
        );
      })}
      {/* Y axis line */}
      <line
        x1={PADDING_LEFT}
        x2={PADDING_LEFT}
        y1={PADDING_TOP}
        y2={PADDING_TOP + innerH}
        stroke="#D1D5DB"
        strokeWidth={1}
      />
      {/* X baseline */}
      <line
        x1={PADDING_LEFT}
        x2={PADDING_LEFT + 9999}
        y1={PADDING_TOP + innerH}
        y2={PADDING_TOP + innerH}
        stroke="#D1D5DB"
        strokeWidth={1}
      />
    </g>
  );
}

// ─── Cluster (one or more dose groups) ───────────────────────────────

interface ClusterProps {
  cluster: ClusterData;
  xOffset: number;
  innerH: number;
  hasSeverity: boolean;
  mode: DisplayMode;
  yMaxCounts: number;
  isRecovery: boolean;
  clusterLabel?: string;
}

function Cluster({
  cluster,
  xOffset,
  innerH,
  hasSeverity,
  mode,
  yMaxCounts,
  isRecovery,
  clusterLabel,
}: ClusterProps) {
  const sexes = cluster.sexes;
  const groupW = sexes.length * BAR_W + Math.max(0, sexes.length - 1) * SEX_GAP;
  const totalW = clusterWidth(cluster.groups.length, sexes);

  return (
    <g>
      {clusterLabel && (
        <text
          x={xOffset + totalW / 2}
          y={PADDING_TOP - 3}
          fontSize={10}
          fill="#6B7280"
          textAnchor="middle"
          fontWeight={600}
          style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
        >
          {clusterLabel}
        </text>
      )}
      {cluster.groups.map((g, i) => {
        const groupX = xOffset + i * (groupW + DOSE_GAP);
        return (
          <g key={`${g.doseLevel}-${i}`}>
            {sexes.map((sex, sexIdx) => {
              const barX = groupX + sexIdx * (BAR_W + SEX_GAP);
              const data = g.bySex[sex];
              return (
                <Bar
                  key={sex}
                  x={barX}
                  data={data}
                  innerH={innerH}
                  hasSeverity={hasSeverity}
                  mode={mode}
                  yMaxCounts={yMaxCounts}
                  isRecovery={isRecovery}
                  sex={sex}
                />
              );
            })}
            {/* Dose label below */}
            <text
              x={groupX + groupW / 2}
              y={PADDING_TOP + innerH + 14}
              fontSize={9}
              fill="#374151"
              textAnchor="middle"
            >
              {g.doseLabel}
            </text>
            {/* Sex letters under each bar (multi-sex only) */}
            {sexes.length > 1 && sexes.map((sex, sexIdx) => {
              const barX = groupX + sexIdx * (BAR_W + SEX_GAP);
              return (
                <text
                  key={`sex-${sex}`}
                  x={barX + BAR_W / 2}
                  y={PADDING_TOP + innerH + 25}
                  fontSize={8}
                  fill={sex === "F" ? "#C62828" : "#1565C0"}
                  textAnchor="middle"
                  fontWeight={500}
                >
                  {sex}
                </text>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

// ─── One bar ─────────────────────────────────────────────────────────

interface BarProps {
  x: number;
  data: SexBarData | undefined;
  innerH: number;
  hasSeverity: boolean;
  mode: DisplayMode;
  yMaxCounts: number;
  isRecovery: boolean;
  sex: string;
}

interface Segment {
  /** "1".."5" for graded; "U" for ungraded. */
  key: string;
  /** Display label for this segment (e.g., "Minimal", "Ungraded"). */
  label: string;
  /** Animal count in this segment. */
  count: number;
  /** Pixel height of this segment. */
  h: number;
  /** Fill: hex color for graded, pattern URL for ungraded. */
  fill: string;
  /** Text color for in-segment labels. */
  textColor: string;
}

function Bar({ x, data, innerH, hasSeverity, mode, yMaxCounts, isRecovery, sex }: BarProps) {
  const baseY = PADDING_TOP + innerH;
  const titleId = useId();

  // Not examined: render distinct NE marker.
  // Visually distinct from "examined, 0 affected" (which shows a dashed envelope outline):
  //   - NE: faded tinted slot + "NE" italic text, no envelope, no baseline tick
  //   - 0 affected: full dashed envelope outline, no fill
  if (!data || data.n === 0) {
    const slotH = innerH * 0.35;
    const slotY = baseY - slotH;
    return (
      <g>
        <rect
          x={x}
          y={slotY}
          width={BAR_W}
          height={slotH}
          fill="#F3F4F6"
          stroke="#E5E7EB"
          strokeWidth={0.5}
          strokeDasharray="2 3"
          rx={2}
        />
        <text
          x={x + BAR_W / 2}
          y={slotY + slotH / 2 + 3}
          fontSize={9}
          fill={NE_COLOR}
          textAnchor="middle"
          fontStyle="italic"
          fontWeight={500}
        >
          NE
        </text>
      </g>
    );
  }

  // Compute heights
  const { n, affected, severityCounts } = data;
  let envelopeH: number;
  let affectedH: number;
  if (mode === "counts") {
    envelopeH = (n / yMaxCounts) * innerH;
    affectedH = (affected / yMaxCounts) * innerH;
  } else {
    // percent: envelope = full chart height (100%), fill = incidence pct
    envelopeH = innerH;
    const pct = n > 0 ? (affected / n) * 100 : 0;
    affectedH = (pct / 100) * innerH;
  }

  const incPct = n > 0 ? Math.round((affected / n) * 100) : 0;
  const summaryTooltip = `${sex}: ${affected}/${n} affected (${incPct}%)${isRecovery ? " — recovery" : ""}`;

  // Build stack segments — invariant order from bottom to top:
  //   grade 1 (Minimal) → grade 2 → grade 3 → grade 4 → grade 5 (Severe) → Ungraded (top)
  // Ungraded sits ABOVE Severe because tox convention treats unknowns as worst-case.
  const segments: Segment[] = [];
  if (hasSeverity && affected > 0) {
    let gradedSum = 0;
    if (severityCounts) {
      for (let g = 1; g <= 5; g++) {
        const cnt = severityCounts[String(g)] ?? 0;
        if (cnt <= 0) continue;
        gradedSum += cnt;
        segments.push({
          key: String(g),
          label: SEV_GRADE_LABELS[g - 1],
          count: cnt,
          h: 0, // computed below
          fill: SEV_COLORS[g - 1],
          textColor: SEV_TEXT_COLORS[g - 1],
        });
      }
    }
    // Ungraded = affected animals not accounted for in severityCounts
    const ungraded = Math.max(0, affected - gradedSum);
    if (ungraded > 0) {
      segments.push({
        key: "U",
        label: UNGRADED_LABEL,
        count: ungraded,
        h: 0,
        fill: `url(#${UNGRADED_PATTERN_ID})`,
        textColor: UNGRADED_TEXT_COLOR,
      });
    }
    // Compute heights (proportional to affectedH) and reconcile floating-point drift
    let runningSum = 0;
    for (const seg of segments) {
      seg.h = (seg.count / affected) * affectedH;
      runningSum += seg.h;
    }
    if (segments.length > 0) {
      const drift = affectedH - runningSum;
      if (Math.abs(drift) > 0.01) segments[segments.length - 1].h += drift;
    }
  }

  const opacity = isRecovery ? 0.7 : 1;

  // Per-segment label format: count or percent-of-N
  const segLabel = (seg: Segment): string => {
    if (mode === "counts") return String(seg.count);
    const pct = n > 0 ? (seg.count / n) * 100 : 0;
    // Show integer pct for >= 10, else 1dp (e.g. "5%" or "2.5%")
    return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
  };
  // Per-segment tooltip
  const segTooltip = (seg: Segment): string => {
    const pct = n > 0 ? Math.round((seg.count / n) * 100) : 0;
    return `${sex} ${seg.label}: ${seg.count}/${n} (${pct}%)${isRecovery ? " — recovery" : ""}`;
  };

  return (
    <g aria-labelledby={titleId}>
      <title id={titleId}>{summaryTooltip}</title>

      {/* Envelope (group size N): outlined dashed rectangle from baseline to N height */}
      <rect
        x={x}
        y={baseY - envelopeH}
        width={BAR_W}
        height={envelopeH}
        fill="rgba(0,0,0,0.015)"
        stroke={ENVELOPE_STROKE}
        strokeWidth={1}
        strokeDasharray={ENVELOPE_DASH}
        rx={2}
      />

      {/* Affected fill */}
      {affectedH > 0 && (
        hasSeverity && segments.length > 0 ? (
          // Stacked severity grades + optional ungraded segment
          <g opacity={opacity}>
            {(() => {
              let yCursor = baseY;
              return segments.map((seg) => {
                yCursor -= seg.h;
                const segY = yCursor;
                const showLabel = seg.h >= 9;
                return (
                  <g key={seg.key}>
                    <title>{segTooltip(seg)}</title>
                    <rect
                      x={x + 0.5}
                      y={segY}
                      width={BAR_W - 1}
                      height={seg.h}
                      fill={seg.fill}
                      stroke={seg.key === "1" ? "rgba(0,0,0,0.06)" : "none"}
                      strokeWidth={0.5}
                    />
                    {showLabel && (
                      <text
                        x={x + BAR_W / 2}
                        y={segY + seg.h / 2 + 3}
                        fontSize={8}
                        fill={seg.textColor}
                        textAnchor="middle"
                        fontFamily="ui-monospace, monospace"
                        style={{ pointerEvents: "none" }}
                      >
                        {segLabel(seg)}
                      </text>
                    )}
                  </g>
                );
              });
            })()}
          </g>
        ) : (
          // Solid fill (CL/MA, no severity)
          <g>
            <title>{summaryTooltip}</title>
            <rect
              x={x + 0.5}
              y={baseY - affectedH}
              width={BAR_W - 1}
              height={affectedH}
              fill={SOLID_BAR_COLOR}
              opacity={opacity}
            />
            {affectedH >= 9 && (
              <text
                x={x + BAR_W / 2}
                y={baseY - affectedH / 2 + 3}
                fontSize={8}
                fill="#FFFFFF"
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                style={{ pointerEvents: "none" }}
              >
                {mode === "counts" ? affected : `${incPct}%`}
              </text>
            )}
          </g>
        )
      )}

      {/* Summary label above the envelope: always raw counts.
       * In % mode the bar HEIGHT encodes the percentage, so the label adds the
       * raw n that the percentage is computed against (avoids redundancy with
       * height + adds the missing denominator context). */}
      {(affected > 0 || !hasSeverity) && (
        <text
          x={x + BAR_W / 2}
          y={baseY - envelopeH - 2}
          fontSize={8}
          fill="#6B7280"
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
        >
          {`${affected}/${n}`}
        </text>
      )}
    </g>
  );
}

// ─── Cluster divider ─────────────────────────────────────────────────

function ClusterDivider({ x, innerH }: { x: number; innerH: number }) {
  return (
    <line
      x1={x}
      x2={x}
      y1={PADDING_TOP - 2}
      y2={PADDING_TOP + innerH + 4}
      stroke={DIVIDER_COLOR}
      strokeWidth={1}
      strokeDasharray="3 2"
    />
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: DisplayMode; onChange: (m: DisplayMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-full bg-muted/50 p-0.5 text-[10px]">
      <button
        type="button"
        onClick={() => onChange("counts")}
        className={
          mode === "counts"
            ? "rounded-full bg-background px-2 py-0.5 font-medium text-foreground shadow-sm"
            : "rounded-full px-2 py-0.5 text-muted-foreground hover:text-foreground"
        }
      >
        Counts
      </button>
      <button
        type="button"
        onClick={() => onChange("percent")}
        className={
          mode === "percent"
            ? "rounded-full bg-background px-2 py-0.5 font-medium text-foreground shadow-sm"
            : "rounded-full px-2 py-0.5 text-muted-foreground hover:text-foreground"
        }
      >
        %
      </button>
    </div>
  );
}

// ─── Legends ─────────────────────────────────────────────────────────

function SeverityLegend() {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
      {SEV_GRADE_LABELS.map((label, i) => (
        <span key={label} className="flex items-center gap-0.5 whitespace-nowrap">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: SEV_COLORS[i] }}
          />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-0.5 whitespace-nowrap">
        <svg width="8" height="8" className="inline-block">
          <rect width="8" height="8" fill="#FFFFFF" stroke="#D1D5DB" strokeWidth="0.5" />
          <path d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2" stroke="#9CA3AF" strokeWidth="0.8" />
        </svg>
        {UNGRADED_LABEL}
      </span>
      <span className="flex items-center gap-0.5 whitespace-nowrap">
        <span className="font-mono italic" style={{ color: NE_COLOR }}>NE</span>
        <span>not examined</span>
      </span>
    </div>
  );
}

function SolidLegend() {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
      <span className="flex items-center gap-0.5 whitespace-nowrap">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ backgroundColor: SOLID_BAR_COLOR }}
        />
        Affected
      </span>
      <span className="flex items-center gap-0.5 whitespace-nowrap">
        <span
          className="inline-block h-2 w-2 rounded-sm border border-dashed"
          style={{ borderColor: ENVELOPE_STROKE, backgroundColor: "transparent" }}
        />
        Group N
      </span>
    </div>
  );
}
