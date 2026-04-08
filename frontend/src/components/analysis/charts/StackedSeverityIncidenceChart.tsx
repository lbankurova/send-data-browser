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
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getSeverityGradeColor, getSexColor, BINARY_AFFECTED_FILL } from "@/lib/severity-colors";
import { PanePillToggle } from "@/components/ui/PanePillToggle";

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
  /** Ultra-short label for tight spaces (e.g. "C", "5", "200"). */
  doseAbbrev: string;
  /** Positional hex color for this dose group (from DoseGroup.display_color). */
  doseColor?: string;
  bySex: Record<string, SexBarData>;
}

export interface ClusterData {
  groups: DoseGroupData[];
  sexes: string[]; // sorted F before M
}

export type DisplayMode = "counts" | "percent";

/**
 * Sex differentiation style for multi-sex bar charts.
 * - "dashed": dashed stroke on full envelope (current)
 * - "solid": solid thin stroke on full envelope
 * - "tint": subtle background wash inside envelope
 * - "edge": thick colored bottom edge
 */
export type SexDiffStyle = "dashed" | "solid" | "tint" | "edge";

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
  /** Hide the entire header (legend + toggle). Use when caller renders a shared header. */
  hideHeader?: boolean;
  /** Hide only the legend row (when legend is shared by parent). Title row still shows. */
  hideLegend?: boolean;
  /** Use natural width instead of inflated dual-sex+recovery viewBox. For split panels. */
  compactWidth?: boolean;
  /** Override the cluster label text. Default: "Main" / "Recovery". */
  clusterLabels?: { main?: string; recovery?: string };
  /** Sex differentiation style. Default "dashed". */
  sexDiffStyle?: SexDiffStyle;
  /** When true, bars are grouped by sex (all F doses, then all M doses)
   *  instead of the default dose-grouped layout (F+M paired at each dose). */
  sexGrouped?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Severity grades. Order is invariant: Minimal at index 0 → Severe at index 4.
 *  In the stacked bar, index 0 (Minimal) ALWAYS sits at the bottom of the stack,
 *  index 4 (Severe) at the top, and (when present) "Ungraded" sits above Severe. */
export const SEV_GRADE_LABELS = ["Minimal", "Mild", "Moderate", "Marked", "Severe"] as const;
const SEV_COLORS = [1, 2, 3, 4, 5].map((g) => getSeverityGradeColor(g).bg);
const SEV_TEXT_COLORS = [1, 2, 3, 4, 5].map((g) => getSeverityGradeColor(g).text);

/** Pattern fill ID for "Ungraded" — animals with the finding present but no MISEV. */
const UNGRADED_PATTERN_ID = "stacked-sev-ungraded-pattern";
const UNGRADED_LABEL = "Ungraded";


// Solid bar color for CL/MA (no severity) — cool neutral from severity palette
const SOLID_BAR_COLOR = BINARY_AFFECTED_FILL;

// Layout constants
const BAR_W = 18;
const SEX_GAP = 4;
const DOSE_GAP = 16;
const SEX_GROUP_GAP = 24; // gap between F group and M group in sexGrouped layout
const DOSE_INNER_GAP = 3; // gap between dose bars within a sex group
const CLUSTER_GAP = 16;
const PADDING_TOP = 28;
const PADDING_BOTTOM = 28;
const PADDING_LEFT = 30;
const PADDING_RIGHT = 16;
const Y_AXIS_TICK_COUNT = 4;
const ENVELOPE_STROKE = "#D1D5DB"; // gray-300
const NE_COLOR = "#9CA3AF";
const RECOVERY_TINT = "#f7f8fa";

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

function clusterWidth(numDoses: number, sexes: string[], sexGrouped: boolean): number {
  if (sexGrouped) {
    const sexGroupW = numDoses * BAR_W + Math.max(0, numDoses - 1) * DOSE_INNER_GAP;
    return sexes.length * sexGroupW + Math.max(0, sexes.length - 1) * SEX_GROUP_GAP;
  }
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
  hideHeader = false,
  hideLegend = false,
  compactWidth = false,
  clusterLabels,
  sexDiffStyle = "dashed",
  sexGrouped = false,
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
      {/* Header: title present → row 1 title+toggle, row 2 legend. No title → single row legend+toggle */}
      {!hideHeader && (
        <div className="shrink-0 px-2 pt-0.5">
          {title ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  {title}
                </span>
                {!hideToggle && <ModeToggle mode={mode} onChange={setMode} />}
              </div>
              {!hideLegend && (
                <div className="pb-0.5">
                  {hasSeverity ? <SeverityLegend multiSex={multiSex} /> : <SolidLegend multiSex={multiSex} />}
                </div>
              )}
            </>
          ) : (
            /* No title: legend LEFT + toggle RIGHT on one line */
            <div className="flex items-center justify-between pb-0.5">
              {!hideLegend && (
                <div className="min-w-0 flex-1">
                  {hasSeverity ? <SeverityLegend multiSex={multiSex} /> : <SolidLegend multiSex={multiSex} />}
                </div>
              )}
              {!hideToggle && <div className="shrink-0 ml-2"><ModeToggle mode={mode} onChange={setMode} /></div>}
            </div>
          )}
        </div>
      )}

      {/* Chart body — fills remaining space */}
      <ChartBody
        main={main}
        recovery={recovery}
        hasSeverity={hasSeverity}
        mode={mode}
        yMaxCounts={yMaxCounts}
        fallbackHeight={height}
        compactWidth={compactWidth}
        clusterLabels={clusterLabels}
        sexDiffStyle={sexDiffStyle}
        sexGrouped={sexGrouped}
        useFaceted={useFaceted}
      />
    </div>
  );
}

// ─── Chart body — measures container height, passes to SVG ───────────

function ChartBody({ main, recovery, hasSeverity, mode, yMaxCounts, fallbackHeight, compactWidth, clusterLabels, sexDiffStyle, sexGrouped, useFaceted }: Omit<ChartCoreProps, "height"> & { fallbackHeight: number; useFaceted: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  // Measure on mount + resize via ResizeObserver
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) setMeasured(Math.round(h));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const height = measured > 50 ? measured : fallbackHeight;

  return (
    <div ref={ref} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {useFaceted ? (
        <FacetedChart main={main} recovery={recovery} hasSeverity={hasSeverity} mode={mode} yMaxCounts={yMaxCounts} height={height} compactWidth={compactWidth} clusterLabels={clusterLabels} sexDiffStyle={sexDiffStyle} sexGrouped={sexGrouped} />
      ) : (
        <SingleChart main={main} recovery={recovery} hasSeverity={hasSeverity} mode={mode} yMaxCounts={yMaxCounts} height={height} compactWidth={compactWidth} clusterLabels={clusterLabels} sexDiffStyle={sexDiffStyle} sexGrouped={sexGrouped} />
      )}
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
  compactWidth: boolean;
  clusterLabels?: { main?: string; recovery?: string };
  height: number;
  sexDiffStyle: SexDiffStyle;
  sexGrouped: boolean;
}

function SingleChart({ main, recovery, hasSeverity, mode, yMaxCounts, height, compactWidth, clusterLabels, sexDiffStyle, sexGrouped }: ChartCoreProps) {
  const sexes = main.sexes;
  const mainW = clusterWidth(main.groups.length, sexes, sexGrouped);
  const recW = recovery ? clusterWidth(recovery.groups.length, sexes, sexGrouped) : 0;
  const totalInnerW = mainW + (recovery ? CLUSTER_GAP + recW : 0);
  const naturalW = PADDING_LEFT + totalInnerW + PADDING_RIGHT;
  let svgW: number;
  if (compactWidth) {
    // Use natural width — for split panels where space is tight
    svgW = naturalW;
  } else {
    // Fixed minimum viewBox width: always assume dual-sex + recovery so all
    // endpoints scale identically regardless of sex count or recovery presence.
    const dualSexRecW = PADDING_LEFT
      + clusterWidth(main.groups.length, ["F", "M"], sexGrouped)
      + CLUSTER_GAP
      + clusterWidth(main.groups.length, ["F", "M"], sexGrouped)
      + PADDING_RIGHT;
    svgW = Math.max(naturalW, dualSexRecW);
  }
  const innerH = height - PADDING_TOP - PADDING_BOTTOM;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${svgW} ${height}`}
      preserveAspectRatio={compactWidth ? "xMinYMin meet" : "xMinYMin slice"}
      style={{ minWidth: 0, display: "block", overflow: "hidden" }}
    >
      <defs>
        {/* Ungraded segment fill — diagonal stripes on white */}
        <pattern id={UNGRADED_PATTERN_ID} patternUnits="userSpaceOnUse" width="6" height="6">
          <rect width="6" height="6" fill="#F3F4F6" />
          <path
            d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2"
            stroke="#6B7280"
            strokeWidth="1"
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
        clusterLabel={recovery ? (clusterLabels?.main ?? "Treatment") : undefined}
        sexDiffStyle={sexDiffStyle}
        sexGrouped={sexGrouped}
      />
      {recovery && (
        <>
          {/* Cool grey tint behind recovery cluster — matches severity matrix */}
          <rect
            x={PADDING_LEFT + mainW + CLUSTER_GAP / 2 + 1}
            y={PADDING_TOP}
            width={recW + CLUSTER_GAP / 2 + PADDING_RIGHT}
            height={innerH}
            fill={RECOVERY_TINT}
          />
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
            clusterLabel={clusterLabels?.recovery ?? "Recovery"}
            sexDiffStyle={sexDiffStyle}
            sexGrouped={sexGrouped}
          />
        </>
      )}
    </svg>
  );
}

// ─── Faceted (two charts: F left, M right) ───────────────────────────

function FacetedChart({ main, recovery, hasSeverity, mode, yMaxCounts, height, compactWidth, clusterLabels, sexDiffStyle, sexGrouped }: ChartCoreProps) {
  return (
    <div className="flex h-full min-w-0 gap-3">
      {main.sexes.map((sex) => {
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
              compactWidth={compactWidth}
              clusterLabels={clusterLabels}
              sexDiffStyle={sexDiffStyle}
              sexGrouped={sexGrouped}
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
  sexDiffStyle: SexDiffStyle;
  sexGrouped: boolean;
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
  sexDiffStyle,
  sexGrouped,
}: ClusterProps) {
  return (
    <g>
      {clusterLabel && (
        <text
          x={xOffset}
          y={10}
          fontSize={9}
          fill="#9CA3AF"
          textAnchor="start"
          fontWeight={500}
          style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
        >
          {clusterLabel}
        </text>
      )}
      {sexGrouped ? (
        // Sex-grouped layout: [F: all doses] [M: all doses]
        <SexGroupedBars
          cluster={cluster}
          xOffset={xOffset}
          innerH={innerH}
          hasSeverity={hasSeverity}
          mode={mode}
          yMaxCounts={yMaxCounts}
          isRecovery={isRecovery}
          sexDiffStyle={sexDiffStyle}
        />
      ) : (
        // Default: dose-grouped layout: [F M] [F M] [F M]
        <DoseGroupedBars
          cluster={cluster}
          xOffset={xOffset}
          innerH={innerH}
          hasSeverity={hasSeverity}
          mode={mode}
          yMaxCounts={yMaxCounts}
          isRecovery={isRecovery}
          sexDiffStyle={sexDiffStyle}
        />
      )}
    </g>
  );
}

/** Default dose-grouped: [F M] at each dose */
function DoseGroupedBars({ cluster, xOffset, innerH, hasSeverity, mode, yMaxCounts, isRecovery, sexDiffStyle }: Omit<ClusterProps, "clusterLabel" | "sexGrouped">) {
  const sexes = cluster.sexes;
  const groupW = sexes.length * BAR_W + Math.max(0, sexes.length - 1) * SEX_GAP;
  return (
    <g>
      {cluster.groups.map((g, i) => {
        const groupX = xOffset + i * (groupW + DOSE_GAP);
        return (
          <g key={`${g.doseLevel}-${i}`}>
            {sexes.map((sex, sexIdx) => {
              const barX = groupX + sexIdx * (BAR_W + SEX_GAP);
              return (
                <Bar
                  key={sex}
                  x={barX}
                  data={g.bySex[sex]}
                  innerH={innerH}
                  hasSeverity={hasSeverity}
                  mode={mode}
                  yMaxCounts={yMaxCounts}
                  isRecovery={isRecovery}
                  sex={sex}
                  sexDiffStyle={sexDiffStyle}
                  doseLabel={g.doseLabel}
                />
              );
            })}
            <text
              x={groupX + groupW / 2}
              y={PADDING_TOP + innerH + 14}
              fontSize={9}
              fill={g.doseColor ?? "#374151"}
              fontWeight={500}
              textAnchor="middle"
            >
              {g.doseLabel}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Sex-grouped: [all F doses] gap [all M doses]
 *  Two-tier bottom border: sex-colored edge (top), dose-colored edge (bottom), then dose label. */
function SexGroupedBars({ cluster, xOffset, innerH, hasSeverity, mode, yMaxCounts, isRecovery, sexDiffStyle }: Omit<ClusterProps, "clusterLabel" | "sexGrouped">) {
  const sexes = cluster.sexes;
  const numDoses = cluster.groups.length;
  const sexGroupW = numDoses * BAR_W + Math.max(0, numDoses - 1) * DOSE_INNER_GAP;
  const baseY = PADDING_TOP + innerH;

  return (
    <g>
      {sexes.map((sex, sexIdx) => {
        const groupX = xOffset + sexIdx * (sexGroupW + SEX_GROUP_GAP);
        return (
          <g key={sex}>
            {cluster.groups.map((g, doseIdx) => {
              const barX = groupX + doseIdx * (BAR_W + DOSE_INNER_GAP);
              return (
                <g key={`${g.doseLevel}-${doseIdx}`}>
                  <Bar
                    x={barX}
                    data={g.bySex[sex]}
                    innerH={innerH}
                    hasSeverity={hasSeverity}
                    mode={mode}
                    yMaxCounts={yMaxCounts}
                    isRecovery={isRecovery}
                    sex={sex}
                    sexDiffStyle={sexDiffStyle}
                    doseLabel={g.doseLabel}
                  />
                  {/* Dose abbreviation label */}
                  <text
                    x={barX + BAR_W / 2}
                    y={baseY + 14}
                    fontSize={8}
                    fill={g.doseColor ?? "#6b7280"}
                    fontWeight={500}
                    textAnchor="middle"
                    fontFamily="ui-monospace, monospace"
                  >
                    {g.doseAbbrev}
                  </text>
                </g>
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
  sexDiffStyle: SexDiffStyle;
  doseLabel: string;
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

function Bar({ x, data, innerH, hasSeverity, mode, yMaxCounts, isRecovery, sex, sexDiffStyle, doseLabel }: BarProps) {
  const baseY = PADDING_TOP + innerH;
  const titleId = useId();

  // Not examined: no bar, just "NE" label + group N + sex edge.
  if (!data || data.n === 0) {
    return (
      <g>
        <text
          x={x + BAR_W / 2}
          y={baseY - 10}
          fontSize={9}
          fill={NE_COLOR}
          textAnchor="middle"
          fontStyle="italic"
          fontWeight={500}
        >
          NE
        </text>
        {/* Sex edge */}
        {sexDiffStyle === "edge" && (
          <line
            x1={x} x2={x + BAR_W} y1={baseY} y2={baseY}
            stroke={getSexColor(sex)} strokeWidth={2.5}
            style={{ pointerEvents: "none" }}
          />
        )}
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
  // Rich tooltip: dose label, severity breakdown, total
  const period = isRecovery ? "Recovery" : "Treatment";
  const summaryLines: string[] = [`${doseLabel} \u2014 ${period}`, ""];
  if (hasSeverity && severityCounts && affected > 0) {
    let gradedSum = 0;
    for (let g = 1; g <= 5; g++) {
      const cnt = severityCounts[String(g)] ?? 0;
      if (cnt > 0) {
        summaryLines.push(`${SEV_GRADE_LABELS[g - 1].padEnd(10)} ${cnt}/${n}`);
        gradedSum += cnt;
      }
    }
    const ung = affected - gradedSum;
    if (ung > 0) summaryLines.push(`${"Ungraded".padEnd(10)} ${ung}/${n}`);
    summaryLines.push("");
  }
  summaryLines.push(`Total affected ${affected}/${n} (${incPct}%)`);
  const summaryTooltip = summaryLines.join("\n");

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
        fill: "#FFFFFF",
        textColor: "#6B7280",
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

  return (
    <g aria-labelledby={titleId}>
      <title id={titleId}>{summaryTooltip}</title>

      {/* Envelope (group size N): outlined dashed rectangle from baseline to N height */}
      <rect
        x={x}
        y={baseY - envelopeH}
        width={BAR_W}
        height={envelopeH}
        fill="#FFFFFF"
        stroke={ENVELOPE_STROKE}
        strokeWidth={0.5}
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
                    <rect
                      x={x + 0.5}
                      y={segY}
                      width={BAR_W - 1}
                      height={seg.h}
                      fill={seg.fill}
                      stroke={seg.key === "U" ? "#9CA3AF" : seg.key === "1" ? "rgba(0,0,0,0.06)" : "none"}
                      strokeWidth={seg.key === "U" ? 1 : 0.5}
                    />
                    {showLabel && (
                      <text
                        x={x + BAR_W / 2}
                        y={segY + seg.h / 2 + 3}
                        fontSize={8}
                        fill={seg.textColor}
                        textAnchor="middle"
                        fontFamily="ui-monospace, monospace"
                        stroke="none"
                        strokeWidth={0}
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
                fill="var(--foreground)"
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

      {/* Sex differentiation overlay — covers the FULL envelope */}
      {envelopeH > 0 && sexDiffStyle === "dashed" && (
        <rect
          x={x + 0.5} y={baseY - envelopeH} width={BAR_W - 1} height={envelopeH}
          fill="none" stroke={getSexColor(sex)} strokeWidth={1} strokeDasharray="3 2" rx={2}
          style={{ pointerEvents: "none" }}
        />
      )}
      {envelopeH > 0 && sexDiffStyle === "solid" && (
        <rect
          x={x + 0.5} y={baseY - envelopeH} width={BAR_W - 1} height={envelopeH}
          fill="none" stroke={getSexColor(sex)} strokeWidth={1.5} rx={2}
          style={{ pointerEvents: "none" }}
        />
      )}
      {envelopeH > 0 && sexDiffStyle === "tint" && (
        <rect
          x={x + 0.5} y={baseY - envelopeH} width={BAR_W - 1} height={envelopeH}
          fill={getSexColor(sex)} fillOpacity={0.08} stroke="none" rx={2}
          style={{ pointerEvents: "none" }}
        />
      )}
      {envelopeH > 0 && sexDiffStyle === "edge" && (
        <line
          x1={x} x2={x + BAR_W} y1={baseY} y2={baseY}
          stroke={getSexColor(sex)} strokeWidth={2.5}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Summary label above the envelope — always shown when animals exist */}
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
    </g>
  );
}

// ─── Cluster divider ─────────────────────────────────────────────────

function ClusterDivider({ x, innerH }: { x: number; innerH: number }) {
  return (
    <line
      x1={x}
      x2={x}
      y1={PADDING_TOP}
      y2={PADDING_TOP + innerH}
      stroke="#D1D5DB"
      strokeWidth={1}
    />
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: "counts" as const, label: "N" },
  { value: "percent" as const, label: "%" },
];

function ModeToggle({ mode, onChange }: { mode: DisplayMode; onChange: (m: DisplayMode) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Incidence</span>
      <PanePillToggle value={mode} options={MODE_OPTIONS} onChange={onChange} />
    </div>
  );
}

// ─── Legends ─────────────────────────────────────────────────────────

function SexLegendEntries() {
  return (
    <>
      <span className="whitespace-nowrap font-medium" style={{ color: getSexColor("F") }}>F</span>
      <span className="whitespace-nowrap font-medium" style={{ color: getSexColor("M") }}>M</span>
    </>
  );
}

function SeverityLegend({ multiSex }: { multiSex: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-x-2 text-[9px] text-muted-foreground">
      <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Severity</span>
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
        <span className="inline-block h-2 w-2 rounded-sm border border-gray-400 bg-white" />
        {UNGRADED_LABEL}
      </span>
      <span className="flex items-center gap-0.5 whitespace-nowrap">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: SOLID_BAR_COLOR }} />
        Affected
      </span>
      {multiSex && <SexLegendEntries />}
    </div>
  );
}

function SolidLegend({ multiSex }: { multiSex: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
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
      {multiSex && <SexLegendEntries />}
    </div>
  );
}
