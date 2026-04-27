import { useState, useMemo, useRef, useEffect, memo } from "react";
import { useParams } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EyeOff, ExternalLink, Filter, Search, X } from "lucide-react";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { cn } from "@/lib/utils";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import {
  getSeverityDotColor,
  formatPValue,
  formatEffectSize,
  formatDoseShortLabel,
  getPValueHex,
  getSeverityGradeColor,
  BINARY_AFFECTED_FILL,
  isExactTestSuppressed,
  EXACT_TEST_SUPPRESSED_TITLE,
} from "@/lib/severity-colors";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { effectSizeLabel } from "@/lib/domain-types";
import type { EffectSizeMethod } from "@/lib/stat-method-transforms";
import { getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { DoseHeader, DoseLabel } from "@/components/ui/DoseLabel";
import { getSexColor } from "@/lib/severity-colors";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { usePrefetchFindingContext } from "@/hooks/usePrefetchFindingContext";
import { useSessionState } from "@/hooks/useSessionState";
import { getSignalTier } from "@/lib/findings-rail-engine";
import { formatOnsetDose } from "@/lib/onset-dose";
import {
  usePatternOverrideActions,
  derivePatternState,
  deriveOnsetState,
  buildPreviewText,
  getSystemOnsetLevel,
  OVERRIDE_OPTIONS,
} from "@/hooks/usePatternOverrideActions";
import type { PreviewResult } from "@/hooks/usePatternOverrideActions";
import { OverridePill } from "@/components/ui/OverridePill";
import type { GroupingMode } from "@/lib/findings-rail-engine";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import { FindingsTableFilterPanel } from "./findings/FindingsTableFilterPanel";
import {
  DEFAULT_FILTER_STATE,
  countActiveFilters,
  applyTableFilters,
} from "./findings/table-filters";
import type { TableFilterState } from "./findings/table-filters";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import type { RecoveryOverrideAnnotation } from "@/hooks/useRecoveryOverrideActions";
import { buildFindingVerdictMap } from "@/lib/recovery-table-verdicts";
import { classifyFindingNature } from "@/lib/finding-nature";
import { RecoveryOverrideDropdown } from "./panes/RecoveryOverrideDropdown";
import { LOO_THRESHOLD, LOO_SMALL_N_THRESHOLD } from "@/lib/loo-constants";

const col = createColumnHelper<UnifiedFinding>();

/** The absorber column — takes remaining space */
const ABSORBER_ID = "finding";

// ─── Pivoted row type ──────────────────────────────────────
/** One row per finding × dose group (groups as rows instead of columns). */
interface PivotedRow {
  id: string;
  original: UnifiedFinding;
  domain: string;
  finding: string;
  specimen: string | null;
  endpoint_label: string;
  sex: string;
  day: number | null;
  data_type: "continuous" | "incidence";
  severity: string | null;
  dose_level: number;
  dose_label: string;
  n: number;
  mean: number | null;
  sd: number | null;
  /** True when SD > 2× control SD — high within-group variance flag. */
  sdOutlier: boolean;
  affected: number | null;
  incidence: number | null;
  p_value: number | null;
  effect_size: number | null;
  trend_p: number | null;
  dose_response_pattern: string;
  fold_change: number | null;
  direction: string | null;
  loo_stability: number | null;
  loo_control_fragile?: boolean | null;
}

const pivCol = createColumnHelper<PivotedRow>();
const PIVOTED_ABSORBER_ID = "piv_finding";

// ─── Memoized sparkline cell ────────────────────────────────
// Inline SVG generation is expensive in table renders. Memo prevents
// re-rendering when only parent re-renders (sort, filter, selection).
const SparklineCell = memo(function SparklineCell({
  stats,
  dataType,
  sparkScale,
  globalMax,
}: {
  stats: UnifiedFinding["group_stats"];
  dataType: string;
  sparkScale: "row" | "global";
  globalMax: number;
}) {
  if (stats.length < 2) return null;
  const isCont = dataType === "continuous";
  const sorted = stats.slice().sort((a, b) => a.dose_level - b.dose_level);
  const nums = sorted.map((g) => (isCont ? g.mean : g.incidence) ?? 0);
  if (sorted.every((g) => (isCont ? g.mean : g.incidence) == null)) return null;
  const control = isCont ? nums[0] : 0;
  const max = sparkScale === "global"
    ? globalMax
    : Math.max(...nums.map((v) => Math.abs(isCont ? v - control : v)), 1e-9);
  const W = 28;
  const H = 14;
  const barW = Math.max(2, Math.floor((W - (nums.length - 1)) / nums.length));
  const gap = 1;
  return (
    <svg width={W} height={H} className="inline-block align-middle">
      {nums.map((v, i) => {
        const delta = isCont ? v - control : v;
        const barH = max > 0 ? Math.max(1, Math.abs(delta) / max * (H / 2)) : 1;
        const isUp = delta >= 0;
        const x = i * (barW + gap);
        const y = isUp ? H / 2 - barH : H / 2;
        const fill = i === 0 ? "#9ca3af" : "#6b7280";
        return <rect key={i} x={x} y={y} width={barW} height={barH} fill={fill} rx={0.5} />;
      })}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#d1d5db" strokeWidth={0.5} />
    </svg>
  );
});

function renderLooCell(v: number, isCtrl: boolean, n: number | null) {
  const smallN = n != null && n < LOO_SMALL_N_THRESHOLD;
  const pct = `${(v * 100).toFixed(0)}%`;
  const qualifier = isCtrl ? "ctrl" : null;
  const nTag = smallN ? `N=${n}` : null;
  const suffix = [qualifier, nTag].filter(Boolean).join(", ");
  const title = smallN
    ? `LOO stability ${pct}${isCtrl ? " (control-side dominant)" : ""} -- N=${n}: LOO has low detection power at this sample size. Prefer HCD context for outlier assessment.`
    : isCtrl
      ? "Control-side fragile: removing one control animal substantially changes the effect. Signal may not be treatment-related."
      : "Leave-one-out stability: fraction of effect surviving worst single-animal removal.";
  return <span className={`font-mono ${v < LOO_THRESHOLD ? "text-foreground font-medium" : "text-muted-foreground"}`} title={title}>{pct}{suffix ? ` (${suffix})` : ""}</span>;
}

interface FindingsTableProps {
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  signalScores?: Map<string, number>;
  excludedEndpoints?: Set<string>;
  onToggleExclude?: (label: string) => void;
  /** Active endpoint label — all rows matching this endpoint get a subtle highlight. */
  activeEndpoint?: string | null;
  /** Domain of the active endpoint (for multi-domain endpoints like MI + MA). */
  activeDomain?: string;
  /** Current rail grouping mode — when "finding", table sorts by endpoint by default. */
  activeGrouping?: GroupingMode | null;
  /** Callback to open the table in its own tab. */
  onOpenInTab?: () => void;
  /** Active effect size method — controls header label for continuous endpoints. */
  effectSizeMethod?: EffectSizeMethod;
  /** Current global day stepper value (one-way sync: global → table). */
  globalDay?: number | null;
  /** Day labels from the global stepper ("terminal" | "peak") — applied to matching days in the combo-box. */
  globalDayLabels?: Map<number, string>;
  /** Recovery comparison data for verdict column. */
  recoveryData?: RecoveryComparisonResponse;
  /** Recovery override annotations keyed by finding ID. */
  recoveryOverrides?: Record<string, RecoveryOverrideAnnotation>;
}

export function FindingsTable({ findings, doseGroups, signalScores, excludedEndpoints, onToggleExclude, activeEndpoint, activeDomain, activeGrouping, onOpenInTab, effectSizeMethod = "hedges-g", globalDay, globalDayLabels, recoveryData, recoveryOverrides }: FindingsTableProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectedFindingId, selectFinding } = useFindingSelection();
  const prefetch = usePrefetchFindingContext(studyId);
  const resizingRef = useRef(false);
  const [sorting, setSorting] = useSessionState<SortingState>("pcc.findings.sorting", []);
  const [columnSizing, setColumnSizing] = useSessionState<ColumnSizingState>("pcc.findings.columnSizing", {});

  // Crossover detection: all findings have day=null → within-subject design
  const isCrossover = useMemo(
    () => findings.length > 0 && findings.every((f) => f.day == null),
    [findings],
  );
  const doseColumnLabel = isCrossover ? "Treatments" : "Dose groups";

  // CL day-mode toggle state
  type ClDayMode = "mode" | "first_observed";
  const [clDayMode, setClDayMode] = useState<ClDayMode>("mode");
  const [dayMenu, setDayMenu] = useState<{ x: number; y: number } | null>(null);
  const dayMenuRef = useRef<HTMLDivElement>(null);

  // Sparkline scale mode
  type SparkScale = "row" | "global";
  const [sparkScale, setSparkScale] = useState<SparkScale>("row");
  const [sparkMenu, setSparkMenu] = useState<{ x: number; y: number } | null>(null);
  const sparkMenuRef = useRef<HTMLDivElement>(null);

  // Pattern & onset override context menus
  const overrideActions = usePatternOverrideActions(studyId);
  const [patternMenu, setPatternMenu] = useState<{ x: number; y: number; finding: UnifiedFinding } | null>(null);
  const patternMenuRef = useRef<HTMLDivElement>(null);
  const [onsetMenu, setOnsetMenu] = useState<{ x: number; y: number; finding: UnifiedFinding } | null>(null);
  const onsetMenuRef = useRef<HTMLDivElement>(null);
  const [hoveredPatternOption, setHoveredPatternOption] = useState<string | null>(null);
  const [patternPreview, setPatternPreview] = useState<PreviewResult | null>(null);
  const patternPreviewAbortRef = useRef<AbortController | null>(null);

  // ── Follow rail checkbox + day combo-box ───────────────────
  // followRail: true → two-way sync between rail and table (endpoint scope + row clicks update rail).
  //             false → table independent, no rail interaction.
  const [followRail, setFollowRail] = useState(true);
  const [manualDay, setManualDay] = useState<string>("all");

  // Reset day filter when endpoint changes — days differ across endpoints.
  // Track whether we just reset so filterDay uses "all" in the same render pass.
  const prevEndpointRef = useRef(activeEndpoint);
  let currentDay = manualDay;
  if (activeEndpoint !== prevEndpointRef.current) {
    prevEndpointRef.current = activeEndpoint;
    currentDay = "all";
    setManualDay("all");
  }

  // Day combo-box only filters when the user explicitly picks a day.
  const filterDay: number | null = currentDay === "all" ? null : Number(currentDay);

  // Layout mode: "standard" (dose groups as columns) vs "pivoted" (dose groups as rows)
  type LayoutMode = "standard" | "pivoted";
  const [layoutMode, setLayoutMode] = useSessionState<LayoutMode>("pcc.findings.layoutMode.v2", "standard");

  // Pivoted table sorting (separate from standard table)
  const [pivotedSorting, setPivotedSorting] = useSessionState<SortingState>("pcc.findings.pivotedSorting", [
    { id: "finding", desc: false }, { id: "day", desc: false }, { id: "dose_level", desc: false }, { id: "sex", desc: false },
  ]);
  const [pivotedColumnSizing, setPivotedColumnSizing] = useSessionState<ColumnSizingState>("pcc.findings.pivotedColumnSizing", {});

  // Filter panel state
  const [filterState, setFilterState] = useSessionState<TableFilterState>(
    "pcc.findings.tableFilters.v2", DEFAULT_FILTER_STATE,
  );
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = countActiveFilters(filterState);
  const filterResize = useResizePanel(140, { min: 100, max: 320, direction: "left", storageKey: "pcc.findings.filterPanelWidth" });

  // Layout stays as user chose — no auto-switching on endpoint selection

  // When grouping switches to "finding" (endpoint mode), sort by endpoint name ascending
  const prevGroupingRef = useRef(activeGrouping);
  useEffect(() => {
    if (activeGrouping === "finding" && prevGroupingRef.current !== "finding") {
      setSorting([{ id: ABSORBER_ID, desc: false }]);
    }
    prevGroupingRef.current = activeGrouping;
  }, [activeGrouping, setSorting]);

  // Close day-mode menu on outside click
  useEffect(() => {
    if (!dayMenu) return;
    const handler = (e: MouseEvent) => {
      if (dayMenuRef.current && !dayMenuRef.current.contains(e.target as Node)) setDayMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dayMenu]);

  // Close sparkline menu on outside click
  useEffect(() => {
    if (!sparkMenu) return;
    const handler = (e: MouseEvent) => {
      if (sparkMenuRef.current && !sparkMenuRef.current.contains(e.target as Node)) setSparkMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sparkMenu]);

  // Close pattern menu on outside click
  useEffect(() => {
    if (!patternMenu) return;
    const handler = (e: MouseEvent) => {
      if (patternMenuRef.current && !patternMenuRef.current.contains(e.target as Node)) setPatternMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [patternMenu]);

  // Close onset menu on outside click
  useEffect(() => {
    if (!onsetMenu) return;
    const handler = (e: MouseEvent) => {
      if (onsetMenuRef.current && !onsetMenuRef.current.contains(e.target as Node)) setOnsetMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onsetMenu]);

  // Escape closes any open override menu
  useEffect(() => {
    if (!patternMenu && !onsetMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPatternMenu(null); setOnsetMenu(null); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [patternMenu, onsetMenu]);

  // Close override menus on scroll
  useEffect(() => {
    if (!patternMenu && !onsetMenu) return;
    const el = stdScrollRef.current;
    if (!el) return;
    const handler = () => { setPatternMenu(null); setOnsetMenu(null); };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, [patternMenu, onsetMenu]);

  // Preview fetch for pattern menu
  useEffect(() => {
    if (!patternMenu || !hoveredPatternOption) { setPatternPreview(null); return; }
    const ps = derivePatternState(patternMenu.finding, overrideActions.annotations);
    if (hoveredPatternOption === ps.currentOverrideKey) { setPatternPreview(null); return; }
    patternPreviewAbortRef.current?.abort();
    const ac = new AbortController();
    patternPreviewAbortRef.current = ac;
    overrideActions.fetchPreview(patternMenu.finding.id, hoveredPatternOption, ac.signal)
      .then(r => { if (r && !ac.signal.aborted) setPatternPreview(r); });
    return () => ac.abort();
  }, [hoveredPatternOption, patternMenu, overrideActions]);

  // Clear preview when pattern menu closes
  useEffect(() => {
    if (!patternMenu) { setPatternPreview(null); setHoveredPatternOption(null); }
  }, [patternMenu]);

  // Pre-compute whether CL domain exists (avoids capturing `findings` in columns useMemo)
  const hasCl = useMemo(() => findings.some(f => f.domain === "CL"), [findings]);
  const hasMiMa = useMemo(() => findings.some(f => f.domain === "MI" || f.domain === "MA"), [findings]);

  // Global max for sparkline scaling: max |delta from control| (continuous) or max incidence (categorical)
  const globalSparkMax = useMemo(() => {
    let maxCont = 1e-9;
    let maxInc = 1e-9;
    for (const f of findings) {
      const stats = f.group_stats.slice().sort((a, b) => a.dose_level - b.dose_level);
      if (stats.length < 2) continue;
      if (f.data_type === "continuous") {
        const control = stats[0]?.mean ?? 0;
        for (const g of stats) {
          if (g.mean != null) maxCont = Math.max(maxCont, Math.abs(g.mean - control));
        }
      } else {
        for (const g of stats) {
          if (g.incidence != null) maxInc = Math.max(maxInc, g.incidence);
        }
      }
    }
    return { continuous: maxCont, incidence: maxInc };
  }, [findings]);

  // Recovery verdict map — worst-case verdict per finding for the Recovery column
  const verdictMap = useMemo(
    () => buildFindingVerdictMap(findings, recoveryData, recoveryOverrides),
    [findings, recoveryData, recoveryOverrides],
  );

  // Pipeline: panel filters → endpoint scope (when synced) → available days → day filter.
  const panelFilteredFindings = useMemo(() => {
    if (activeFilterCount === 0) return findings;
    return applyTableFilters(findings, filterState);
  }, [findings, filterState, activeFilterCount]);

  // When synced with charts AND an endpoint is active, scope table to that endpoint
  const scopedFindings = useMemo(() => {
    if (!followRail || !activeEndpoint) return panelFilteredFindings;
    let scoped = panelFilteredFindings.filter(
      (f) => (f.endpoint_label ?? f.finding) === activeEndpoint,
    );
    // Multi-domain endpoints (MI + MA): scope to the clicked domain
    if (activeDomain) scoped = scoped.filter((f) => f.domain === activeDomain);
    return scoped;
  }, [panelFilteredFindings, followRail, activeEndpoint, activeDomain]);

  // Available days — only days with visible rows after panel + scope filters
  const availableDays = useMemo(() => {
    const days = new Set<number>();
    for (const f of scopedFindings) {
      if (f.day != null) days.add(f.day);
    }
    return [...days].sort((a, b) => a - b);
  }, [scopedFindings]);

  function formatDayOption(day: number): string {
    const label = globalDayLabels?.get(day);
    if (label === "terminal") return `D${day} (terminal)`;
    if (label === "peak") return `D${day} (peak)`;
    return `D${day}`;
  }

  // Apply day combo filter on top of scoped findings
  const filteredFindings = useMemo(() => {
    if (filterDay == null) return scopedFindings;
    return scopedFindings.filter((f) => f.day === filterDay);
  }, [scopedFindings, filterDay]);

  // ─── Pivoted data: flatten finding × dose group into rows ───
  // Only compute when pivoted layout is active (avoids O(N*D) work in standard mode)
  const pivotedRows = useMemo(() => {
    if (layoutMode !== "pivoted") return [];
    const doseMap = new Map(doseGroups.map(dg => [dg.dose_level, dg]));
    const rows: PivotedRow[] = [];
    for (const f of filteredFindings) {
      // Control stats for fold change + SD outlier detection
      const controlGs = f.group_stats.find(g => g.dose_level === 0);
      const controlMean = f.data_type === "continuous" ? (controlGs?.mean ?? null) : null;
      const controlSd = f.data_type === "continuous" ? (controlGs?.sd ?? null) : null;
      for (const gs of f.group_stats) {
        const dg = doseMap.get(gs.dose_level);
        const pw = f.pairwise.find(p => p.dose_level === gs.dose_level);
        // Fold change = treated mean / control mean (continuous only, treated only)
        let fold: number | null = null;
        if (controlMean != null && controlMean !== 0 && gs.dose_level > 0 && gs.mean != null) {
          fold = gs.mean / controlMean;
        }
        // SD outlier: treated SD > 2× control SD (high within-group variance)
        const sdOutlier = f.data_type === "continuous"
          && gs.sd != null && controlSd != null && controlSd > 0
          && gs.dose_level > 0 && gs.sd > controlSd * 2;
        rows.push({
          id: `${f.id}_${gs.dose_level}`,
          original: f,
          domain: f.domain,
          finding: f.finding,
          specimen: f.specimen ?? null,
          endpoint_label: f.endpoint_label ?? f.finding,
          sex: f.sex,
          day: f.day,
          data_type: f.data_type,
          // Endpoint-level fields nulled in pivoted mode — each row is a dose group, not an endpoint
          severity: null,
          dose_level: gs.dose_level,
          dose_label: dg ? (dg.dose_level === 0 ? "Control" : dg.label) : `Level ${gs.dose_level}`,
          n: gs.n,
          mean: gs.mean,
          sd: gs.sd,
          sdOutlier,
          affected: gs.affected ?? null,
          incidence: gs.incidence ?? null,
          p_value: pw?.p_value_adj ?? pw?.p_value ?? null,
          effect_size: pw?.effect_size ?? null,
          trend_p: null,
          dose_response_pattern: "",
          fold_change: f.domain === "MI"
            ? (gs.avg_severity ?? null)
            : f.data_type === "incidence"
              ? (pw?.odds_ratio ?? null)
              : fold,
          direction: null,
          loo_stability: pw?.loo_stability ?? null,
          loo_control_fragile: pw?.loo_control_fragile ?? null,
        });
      }
    }
    return rows;
  }, [filteredFindings, doseGroups, layoutMode]);

  // ─── Standard columns ──────────────────────────────────────
  const columns = useMemo(
    () => [
      col.accessor("domain", {
        header: "Domain",
        cell: (info) => <DomainLabel domain={info.getValue()} />,
      }),
      col.accessor("finding", {
        id: ABSORBER_ID,
        header: "Finding",
        cell: (info) => {
          const f = info.row.original;
          const epLabel = f.endpoint_label ?? f.finding;
          const isExcluded = excludedEndpoints?.has(epLabel);
          const full = f.specimen ? `${f.specimen}: ${f.finding}` : f.finding;
          return (
            <div className="flex items-center gap-1 overflow-hidden">
              {isExcluded && (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
                  title="Restore to scatter plot"
                  onClick={(e) => { e.stopPropagation(); onToggleExclude?.(epLabel); }}
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              )}
              <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={full}>
                {f.specimen ? (
                  <>
                    <span className="text-muted-foreground">{f.specimen}: </span>
                    {f.finding}
                  </>
                ) : (
                  f.finding
                )}
              </span>
            </div>
          );
        },
      }),
      col.accessor("sex", {
        header: "Sex",
        cell: (info) => <span style={{ color: getSexColor(info.getValue()) }}>{info.getValue()}</span>,
      }),
      col.accessor("day", {
        header: () => {
          const baseTooltip = "Longitudinal domains: actual study day. Terminal domains: most frequent observation day (mode).";
          if (!hasCl) return <span title={baseTooltip}>Day</span>;
          const labels: Record<ClDayMode, { label: string; tooltip: string }> = {
            mode:           { label: "Day",         tooltip: `${baseTooltip} CL rows: peak prevalence day (mode). Right-click to change.` },
            first_observed: { label: "Day (onset)", tooltip: `${baseTooltip} CL rows: earliest observation day (onset). Right-click to change.` },
          };
          const { label, tooltip } = labels[clDayMode];
          return (
            <span title={tooltip}>
              {label}
            </span>
          );
        },
        cell: (info) => {
          const row = info.row.original;
          const val = (row.domain === "CL" && clDayMode === "first_observed")
            ? row.day_first ?? row.day
            : row.day;
          return <span className="text-muted-foreground">{val ?? "\u2014"}</span>;
        },
      }),
      col.accessor("data_type", {
        header: () => <span title="Continuous: group mean ± SD per dose. Incidence: affected/N per dose.">Type</span>,
        cell: (info) => {
          const dt = info.getValue();
          return (
            <span className="text-muted-foreground" title={dt === "continuous" ? "Continuous \u2014 dose columns show group mean (hover for N)" : "Incidence \u2014 dose columns show affected/N"}>
              {dt === "continuous" ? "cont" : "inc"}
            </span>
          );
        },
      }),
      // Distribution + Temporality columns — MI/MA only, hidden when no MI/MA data
      ...(hasMiMa ? [
        col.display({
          id: "distribution",
          header: () => <span title="Dominant distribution qualifier (MI/MA only). Shows most frequent qualifier (>50%) or 'mixed'.">Dist</span>,
          cell: (info) => {
            const f = info.row.original;
            if (f.domain !== "MI" && f.domain !== "MA") return <span className="text-muted-foreground">&mdash;</span>;
            const val = f.modifier_profile?.dominant_distribution;
            return <span className="text-muted-foreground">{val ?? "\u2014"}</span>;
          },
        }),
        col.display({
          id: "temporality",
          header: () => <span title="Dominant temporality qualifier (MI/MA only). Shows most frequent qualifier (>50%) or 'mixed'.">Temp</span>,
          cell: (info) => {
            const f = info.row.original;
            if (f.domain !== "MI" && f.domain !== "MA") return <span className="text-muted-foreground">&mdash;</span>;
            const val = f.modifier_profile?.dominant_temporality;
            return <span className="text-muted-foreground">{val ?? "\u2014"}</span>;
          },
        }),
      ] : []),
      ...doseGroups.map((dg, idx) => {
        // Prefer backend short_label, fall back to legacy logic
        const shortLabel = dg.short_label
          ?? (dg.dose_level === 0 ? "C" : String(dg.dose_value ?? formatDoseShortLabel(dg.label)));
        const fullLabel = dg.dose_value != null && dg.dose_unit
          ? `${dg.dose_value} ${dg.dose_unit}` : dg.label;
        const headerTooltip = `${fullLabel}\nMean (continuous) \u00b7 Affected/N (incidence)`
          + (isCrossover ? "\nWithin-subject: same animals across all treatments" : "");
        return col.display({
          id: `dose_${dg.dose_level}`,
          header: () => (
            <>
              {idx === 0 && (
                <span className="absolute -top-3 left-0 text-[8px] font-normal uppercase tracking-wider text-muted-foreground/60">{doseColumnLabel}</span>
              )}
              <DoseHeader
                level={dg.dose_level}
                label={shortLabel}
                tooltip={headerTooltip}
                color={dg.display_color}
              />
            </>
          ),
          cell: (info) => {
            const f = info.row.original;
            // group_stats is already the correct variant (backend applied settings)
            const gs = f.group_stats.find((g) => g.dose_level === dg.dose_level);
            if (!gs) return "\u2014";
            // Finding-level exclusion indicator (shown on first dose column only)
            const hasExclusions = idx === 0 && f.n_excluded != null && f.n_excluded > 0;
            const excludedMark = hasExclusions
              ? <span className="ml-0.5 text-muted-foreground/50" title={`${f.n_excluded} subjects excluded`}>*</span>
              : null;
            if (f.data_type === "continuous") {
              return (
                <span className="font-mono" title={`N=${gs.n}`}>
                  {gs.mean != null ? gs.mean.toFixed(2) : "\u2014"}{excludedMark}
                </span>
              );
            }
            // MI/MA/TF: heat-color incidence cells — severity for MI, binary fill for MA/TF/CL
            const isMiMa = f.domain === "MI" || f.domain === "MA" || f.domain === "TF";
            const incidence = gs.incidence ?? 0;
            const isBinary = f.domain !== "MI";
            const heat = isMiMa && dg.dose_level > 0 && incidence > 0
              ? isBinary
                ? { bg: BINARY_AFFECTED_FILL, text: "var(--foreground)" }
                : getSeverityGradeColor(gs.avg_severity ?? 1)
              : null;
            return (
              <span
                className={cn("font-mono", heat && "rounded px-1")}
                style={heat ? { backgroundColor: heat.bg, color: heat.text } : undefined}
              >
                {gs.affected != null && gs.n ? `${gs.affected}/${gs.n}` : "\u2014"}{excludedMark}
              </span>
            );
          },
        });
      }),
      col.display({
        id: "sparkline",
        header: () => (
          <span title={sparkScale === "global"
            ? "Dose-response trend (delta from control). Global scale — bar height reflects actual magnitude across all findings. Right-click to change."
            : "Dose-response trend (delta from control). Row scale — each row scaled to its own max. Right-click to change."}>
            DR Trend{sparkScale === "global" ? "*" : ""}
          </span>
        ),
        cell: (info) => {
          const f = info.row.original;
          const isCont = f.data_type === "continuous";
          return (
            <SparklineCell
              stats={f.group_stats}
              dataType={f.data_type}
              sparkScale={sparkScale}
              globalMax={isCont ? globalSparkMax.continuous : globalSparkMax.incidence}
            />
          );
        },
      }),
      col.display({
        id: "pattern",
        header: () => <span title="Dose-response pattern shape. Right-click to override.">Pattern</span>,
        cell: (info) => {
          const f = info.row.original;
          const ps = derivePatternState(f, overrideActions.annotations);
          return (
            <div className="flex items-center gap-0.5" title="Right-click to override">
              <span className="text-muted-foreground">{ps.currentLabel || "\u2014"}</span>
              <OverridePill
                isOverridden={ps.patternChanged}
                note={ps.annotation?.pattern_note}
                user={ps.annotation?.pathologist}
                timestamp={ps.annotation?.reviewDate ? new Date(ps.annotation.reviewDate).toLocaleDateString() : undefined}
                onSaveNote={(text) => overrideActions.savePatternNote(f, text)}
                placeholder="Consistent downward drift from first dose"
                popoverSide="left"
                popoverAlign="start"
              />
            </div>
          );
        },
      }),
      col.display({
        id: "onset_dose",
        header: () => <span title="Lowest dose at which the effect is first observed. Right-click to override.">Onset</span>,
        cell: (info) => {
          const f = info.row.original;
          const os = deriveOnsetState(f, doseGroups, overrideActions.annotations);
          return (
            <div className={cn("flex items-center gap-0.5", os.needsAttention && "border-b border-red-500/40")} title={os.needsAttention ? "Onset dose needs selection" : os.overrideTooltip ?? "Right-click to override"}>
              <span className={cn("font-mono", os.onset ? "text-muted-foreground" : "text-muted-foreground/40")}>
                {os.displayLabel}
              </span>
              <OverridePill
                isOverridden={os.isOverridden}
                note={os.annotation?.onset_note}
                user={os.annotation?.pathologist}
                timestamp={os.annotation?.reviewDate ? new Date(os.annotation.reviewDate).toLocaleDateString() : undefined}
                onSaveNote={(text) => overrideActions.saveOnsetNote(f, text)}
                placeholder="Onset at dose 2 — earliest statistically significant effect"
                popoverSide="left"
                popoverAlign="start"
              />
            </div>
          );
        },
      }),
      col.accessor("max_effect_size", {
        header: () => {
          const sym = getEffectSizeSymbol(effectSizeMethod);
          return <span title={`Largest standardized effect size (|${sym}|) across dose groups. Continuous endpoints only.`}>Max |{sym}|</span>;
        },
        cell: (info) => {
          const v = info.getValue();
          const domain = info.row.original.domain;
          const label = effectSizeLabel(domain, effectSizeMethod);
          return (
            <span className="ev font-mono text-muted-foreground" title={v != null ? `${label} = ${v.toFixed(3)}` : undefined}>
              {formatEffectSize(v)}
            </span>
          );
        },
      }),
      col.accessor("max_fold_change", {
        header: () => <span title="Magnitude vs control — fold change (continuous), incidence ratio (MA/CL), avg severity (MI). Control = 0% shows raw incidence.">Magnitude</span>,
        cell: (info) => {
          const f = info.row.original;
          // Domain-appropriate magnitude — mirrors pivoted view logic at endpoint level
          if (f.domain === "MI") {
            const sev = f.avg_severity;
            if (sev == null) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
            return <span className="font-mono text-muted-foreground" title={`avg severity = ${sev.toFixed(2)}`}>{sev.toFixed(1)}</span>;
          }
          if (f.data_type === "incidence") {
            // Incidence ratio: max treated incidence / control incidence
            const controlGs = f.group_stats.find(gs => gs.dose_level === 0);
            const controlInc = controlGs?.incidence ?? 0;
            const treatedGs = f.group_stats.filter(gs => gs.dose_level > 0);
            const maxTreatedInc = treatedGs.reduce((max, gs) => Math.max(max, gs.incidence ?? 0), 0);
            if (controlInc > 0 && maxTreatedInc > 0) {
              const ratio = maxTreatedInc / controlInc;
              return <span className="font-mono text-muted-foreground" title={`incidence ratio: ${(maxTreatedInc * 100).toFixed(0)}% / ${(controlInc * 100).toFixed(0)}% = ${ratio.toFixed(2)}`}>{`\u00d7${ratio.toFixed(1)}`}</span>;
            }
            // Control is zero — show max incidence as fallback (can't compute ratio)
            if (maxTreatedInc > 0) {
              return <span className="font-mono text-muted-foreground" title={`max incidence ${(maxTreatedInc * 100).toFixed(0)}% (control: 0%)`}>{`${(maxTreatedInc * 100).toFixed(0)}%`}</span>;
            }
            return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          }
          const v = info.getValue();
          if (v == null) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          return <span className="font-mono text-muted-foreground" title={`fold change = ${v.toFixed(2)}`}>{`\u00d7${v.toFixed(1)}`}</span>;
        },
      }),
      col.accessor("min_p_adj", {
        header: () => <span title="Minimum adjusted pairwise p-value across dose groups">Pairwise p</span>,
        cell: (info) => {
          const f = info.row.original;
          if (isExactTestSuppressed(f.data_type, f.group_stats)) {
            return <span className="font-mono text-muted-foreground/40 cursor-help" title={EXACT_TEST_SUPPRESSED_TITLE}>N/I</span>;
          }
          const v = info.getValue();
          const hex = getPValueHex(v);
          return <span className={`font-mono text-muted-foreground${hex ? " ev" : ""}`} style={hex ? { "--ev-color": hex } as React.CSSProperties : undefined}>{formatPValue(v)}</span>;
        },
      }),
      col.accessor("trend_p", {
        header: () => <span title="Dose-response trend test p-value">Trend p</span>,
        cell: (info) => {
          const v = info.getValue();
          const hex = getPValueHex(v);
          return <span className={`font-mono text-muted-foreground${hex ? " ev" : ""}`} style={hex ? { "--ev-color": hex } as React.CSSProperties : undefined}>{formatPValue(v)}</span>;
        },
      }),
      col.accessor("loo_stability", {
        header: () => <span title="Leave-one-out stability: what fraction of the effect size survives removing the most influential animal. Below 80% = fragile. At N<10, LOO has reduced detection power.">LOO</span>,
        cell: (info) => {
          const v = info.getValue();
          if (v == null) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          const f = info.row.original;
          const treatedStats = f.group_stats.filter(g => g.dose_level > 0);
          const minN = treatedStats.length > 0 ? Math.min(...treatedStats.map(g => g.n)) : null;
          return renderLooCell(v, f.loo_control_fragile === true, minN);
        },
      }),
      col.accessor("severity", {
        header: "Severity",
        cell: (info) => {
          const severity = info.getValue();
          const f = info.row.original;
          const label = f.endpoint_label ?? f.finding;
          const signal = signalScores?.get(label) ?? 0;
          const tier = getSignalTier(signal);
          const isNormal = severity === "normal" || severity === "not_assessed";
          const isPharmCandidate = f._confidence?._pharmacological_candidate === true;

          const borderClass = isNormal
            ? "border-l"
            : tier === 3 ? "border-l-4" : tier === 2 ? "border-l-2" : "border-l";
          const fontClass = isNormal
            ? "text-muted-foreground"
            : tier === 3 ? "font-semibold text-gray-600"
            : tier === 2 ? "font-medium text-gray-600"
            : "text-gray-600";

          const pharmTooltip = isPharmCandidate
            ? (f._confidence?.dimensions?.find(d => d.dimension === "D9")?.rationale ?? "Matches expected pharmacological effect profile")
            : undefined;

          return (
            <span className="inline-flex items-center gap-1">
              <span
                className={`inline-block ${borderClass} pl-1.5 py-0.5 ${fontClass}`}
                style={{ borderLeftColor: isNormal ? "transparent" : getSeverityDotColor(severity) }}
              >
                {severity}
              </span>
              {isPharmCandidate && (
                <span
                  className="inline-flex items-center rounded-full border px-1 py-0.5 text-[9px] font-medium leading-none bg-violet-50 text-violet-600 border-violet-200"
                  title={pharmTooltip}
                >
                  Pharm
                </span>
              )}
            </span>
          );
        },
      }),
      ...(hasMiMa ? [col.display({
        id: "nature",
        header: () => <span title="Biological classification of the finding (MI/MA only). Informs recovery expectations and adversity interpretation.">Nature</span>,
        cell: (info) => {
          const f = info.row.original;
          if (f.domain !== "MI" && f.domain !== "MA") return <span className="text-muted-foreground">{"\u2014"}</span>;
          const nature = classifyFindingNature(f.finding, null, f.specimen ?? null);
          if (nature.nature === "unknown") return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          return <span className="text-muted-foreground" title={`${nature.nature} \u2014 reversibility: ${nature.expected_reversibility}`}>{nature.nature}</span>;
        },
      })] : []),
      col.display({
        id: "recovery",
        header: () => <span className="text-muted-foreground" title="Recovery verdict (worst-case across dose groups)">Recovery</span>,
        cell: (info) => {
          const f = info.row.original;
          const vi = verdictMap.get(f.id);
          if (!vi) return <span className="text-muted-foreground">{"\u2014"}</span>;
          return <RecoveryOverrideDropdown finding={f} verdictInfo={vi} doseGroups={doseGroups} />;
        },
      }),
    ],
    [doseGroups, signalScores, excludedEndpoints, onToggleExclude, hasCl, hasMiMa, clDayMode, sparkScale, globalSparkMax, effectSizeMethod, overrideActions.annotations, verdictMap]
  );

  // ─── Pivoted columns ──────────────────────────────────────
  const pivotedColumns = useMemo(
    () => [
      pivCol.accessor("domain", {
        header: "Domain",
        cell: (info) => <DomainLabel domain={info.getValue()} />,
      }),
      pivCol.accessor("finding", {
        id: PIVOTED_ABSORBER_ID,
        header: "Finding",
        cell: (info) => {
          const r = info.row.original;
          const epLabel = r.endpoint_label;
          const isExcluded = excludedEndpoints?.has(epLabel);
          const full = r.specimen ? `${r.specimen}: ${r.finding}` : r.finding;
          return (
            <div className="flex items-center gap-1 overflow-hidden">
              {isExcluded && (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
                  title="Restore to scatter plot"
                  onClick={(e) => { e.stopPropagation(); onToggleExclude?.(epLabel); }}
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              )}
              <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={full}>
                {r.specimen ? (
                  <>
                    <span className="text-muted-foreground">{r.specimen}: </span>
                    {r.finding}
                  </>
                ) : (
                  r.finding
                )}
              </span>
            </div>
          );
        },
      }),
      pivCol.accessor("sex", {
        header: "Sex",
        cell: (info) => <span style={{ color: getSexColor(info.getValue()) }}>{info.getValue()}</span>,
      }),
      pivCol.accessor("day", {
        header: () => {
          const baseTooltip = "Longitudinal domains: actual study day. Terminal domains: most frequent observation day (mode).";
          if (!hasCl) return <span title={baseTooltip}>Day</span>;
          const labels: Record<ClDayMode, { label: string; tooltip: string }> = {
            mode:           { label: "Day",         tooltip: `${baseTooltip} CL rows: peak prevalence day (mode). Right-click to change.` },
            first_observed: { label: "Day (onset)", tooltip: `${baseTooltip} CL rows: earliest observation day (onset). Right-click to change.` },
          };
          const { label, tooltip } = labels[clDayMode];
          return (
            <span title={tooltip}>
              {label}
            </span>
          );
        },
        cell: (info) => {
          const r = info.row.original;
          const val = (r.original.domain === "CL" && clDayMode === "first_observed")
            ? r.original.day_first ?? r.day
            : r.day;
          return <span className="text-muted-foreground">{val ?? "\u2014"}</span>;
        },
      }),
      pivCol.accessor("data_type", {
        header: () => <span title="Continuous: group mean ± SD per dose. Incidence: affected/N per dose.">Type</span>,
        cell: (info) => {
          const dt = info.getValue();
          return (
            <span className="text-muted-foreground" title={dt === "continuous" ? "Continuous \u2014 Value column shows group mean" : "Incidence \u2014 Value column shows affected/N"}>
              {dt === "continuous" ? "cont" : "inc"}
            </span>
          );
        },
      }),
      pivCol.accessor("dose_level", {
        header: "Dose",
        cell: (info) => {
          const r = info.row.original;
          const dg = doseGroups.find((d) => d.dose_level === r.dose_level);
          const shortLabel = dg?.short_label ?? (r.dose_level === 0 ? "C" : formatDoseShortLabel(r.dose_label));
          return <DoseLabel level={r.dose_level} label={shortLabel} tooltip={r.dose_label} color={dg?.display_color} />;
        },
      }),
      pivCol.accessor("n", {
        header: "N",
        cell: (info) => <span className="font-mono text-muted-foreground">{info.getValue()}</span>,
      }),
      pivCol.display({
        id: "value",
        header: () => <span title="Mean (continuous) or Affected/N (incidence)">Value</span>,
        cell: (info) => {
          const r = info.row.original;
          if (r.data_type === "continuous") {
            return <span className="font-mono">{r.mean != null ? r.mean.toFixed(2) : "\u2014"}</span>;
          }
          // MI/MA/TF: heat-color incidence cells — severity for MI, binary fill for MA/TF/CL
          const isMiMa = r.domain === "MI" || r.domain === "MA" || r.domain === "TF";
          const inc = r.incidence ?? 0;
          const isBinary = r.domain !== "MI";
          const doseAvgSev = r.domain === "MI" ? r.fold_change : null;
          const heat = isMiMa && r.dose_level > 0 && inc > 0
            ? isBinary
              ? { bg: BINARY_AFFECTED_FILL, text: "var(--foreground)" }
              : getSeverityGradeColor(doseAvgSev ?? 1)
            : null;
          return (
            <span
              className={cn("font-mono", heat && "rounded px-1")}
              style={heat ? { backgroundColor: heat.bg, color: heat.text } : undefined}
            >
              {r.affected != null && r.n ? `${r.affected}/${r.n}` : "\u2014"}
            </span>
          );
        },
      }),
      pivCol.display({
        id: "sd_inc",
        header: () => <span title="Standard deviation (continuous) or incidence percentage (incidence)">SD / Inc%</span>,
        cell: (info) => {
          const r = info.row.original;
          if (r.data_type === "continuous") {
            return (
              <span
                className="font-mono text-muted-foreground inline-flex items-baseline justify-end"
                title={r.sdOutlier ? "SD > 2\u00d7 control SD \u2014 high within-group variance" : undefined}
              >
                <span>{r.sd != null ? r.sd.toFixed(2) : "\u2014"}</span>
                <span className="w-2 pl-0.5 text-left text-[8px]">{r.sdOutlier ? "*" : ""}</span>
              </span>
            );
          }
          return (
            <span className="font-mono text-muted-foreground">
              {r.incidence != null ? `${(r.incidence * 100).toFixed(0)}%` : "\u2014"}
            </span>
          );
        },
      }),
      pivCol.accessor("effect_size", {
        header: () => {
          const sym = getEffectSizeSymbol(effectSizeMethod);
          return <span title={`Standardized effect size (|${sym}|) for this dose group vs control. Continuous endpoints only.`}>|{sym}|</span>;
        },
        cell: (info) => {
          const r = info.row.original;
          if (r.dose_level === 0) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          const v = info.getValue();
          const label = effectSizeLabel(r.domain, effectSizeMethod);
          return (
            <span className="ev font-mono text-muted-foreground" title={v != null ? `${label} = ${v.toFixed(3)}` : undefined}>
              {formatEffectSize(v)}
            </span>
          );
        },
      }),
      pivCol.accessor("fold_change", {
        header: () => <span title="Magnitude vs control — fold change (continuous), odds ratio (MA/CL/TF), avg severity (MI)">Magnitude</span>,
        cell: (info) => {
          const r = info.row.original;
          if (r.dose_level === 0) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          const v = info.getValue();
          if (v == null) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          if (r.domain === "MI") {
            return <span className="font-mono text-muted-foreground" title={`avg severity = ${v.toFixed(2)}`}>{v.toFixed(1)}</span>;
          }
          if (r.data_type === "incidence") {
            return <span className="font-mono text-muted-foreground" title={`odds ratio = ${v.toFixed(2)}`}>{v.toFixed(1)}</span>;
          }
          return <span className="font-mono text-muted-foreground" title={`fold change = ${v.toFixed(2)}`}>{`\u00d7${v.toFixed(1)}`}</span>;
        },
      }),
      pivCol.accessor("p_value", {
        header: () => <span title="Adjusted pairwise p-value for this dose group vs control">P-value</span>,
        cell: (info) => {
          const r = info.row.original;
          if (r.dose_level === 0) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          if (isExactTestSuppressed(r.data_type, r.original.group_stats)) {
            return <span className="font-mono text-muted-foreground/40 cursor-help" title={EXACT_TEST_SUPPRESSED_TITLE}>N/I</span>;
          }
          const v = info.getValue();
          const hex = getPValueHex(v);
          return <span className={`font-mono text-muted-foreground${hex ? " ev" : ""}`} style={hex ? { "--ev-color": hex } as React.CSSProperties : undefined}>{formatPValue(v)}</span>;
        },
      }),
      pivCol.accessor("loo_stability", {
        header: () => <span title="Leave-one-out stability for this dose group vs control. Below 80% = fragile. At N<10, LOO has reduced detection power.">LOO</span>,
        cell: (info) => {
          const r = info.row.original;
          if (r.dose_level === 0) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          const v = info.getValue();
          if (v == null) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          return renderLooCell(v, r.loo_control_fragile === true, r.n);
        },
      }),
      // Endpoint-level columns (trend_p, pattern, severity) omitted from
      // pivoted view — each row is a dose group, not an endpoint. These are shown in
      // standard view only. Recovery column IS included since it summarizes endpoint-level
      // worst-case and helps scanning without switching layouts.
      pivCol.display({
        id: "recovery",
        header: () => <span className="text-muted-foreground" title="Recovery verdict (worst-case across dose groups)">Recovery</span>,
        cell: (info) => {
          const f = info.row.original.original;
          const vi = verdictMap.get(f.id);
          if (!vi) return <span className="text-muted-foreground">{"\u2014"}</span>;
          return <RecoveryOverrideDropdown finding={f} verdictInfo={vi} doseGroups={doseGroups} />;
        },
      }),
    ],
    [signalScores, excludedEndpoints, onToggleExclude, hasCl, clDayMode, effectSizeMethod, verdictMap]
  );

  // ─── Standard table instance ───────────────────────────────
  const table = useReactTable({
    data: filteredFindings,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  // ─── Pivoted table instance ────────────────────────────────
  const pivotedTable = useReactTable({
    data: pivotedRows,
    columns: pivotedColumns,
    state: { sorting: pivotedSorting, columnSizing: pivotedColumnSizing },
    onSortingChange: setPivotedSorting,
    onColumnSizingChange: setPivotedColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  // ─── Virtualizer setup ────────────────────────────────────
  const ROW_HEIGHT = 22;
  const stdScrollRef = useRef<HTMLDivElement>(null);
  const pivScrollRef = useRef<HTMLDivElement>(null);
  const stdRows = table.getRowModel().rows;
  const pivRows = pivotedTable.getRowModel().rows;

  const stdVirtualizer = useVirtualizer({
    count: stdRows.length,
    getScrollElement: () => stdScrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const pivVirtualizer = useVirtualizer({
    count: pivRows.length,
    getScrollElement: () => pivScrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  // Reset scroll when data source changes (day filter, layout switch)
  useEffect(() => {
    if (stdScrollRef.current) stdScrollRef.current.scrollTop = 0;
  }, [filterDay, findings]);
  useEffect(() => {
    if (pivScrollRef.current) pivScrollRef.current.scrollTop = 0;
  }, [filterDay, findings]);

  // Autoscroll: when activeEndpoint changes, scroll to the first matching row
  useEffect(() => {
    if (!activeEndpoint && !selectedFindingId) return;
    requestAnimationFrame(() => {
      if (layoutMode === "standard") {
        for (let i = 0; i < stdRows.length; i++) {
          const ep = stdRows[i].original.endpoint_label ?? stdRows[i].original.finding;
          if ((activeEndpoint && ep === activeEndpoint) || (!activeEndpoint && selectedFindingId === stdRows[i].original.id)) {
            stdVirtualizer.scrollToIndex(i, { align: "start", behavior: "smooth" });
            return;
          }
        }
      } else {
        for (let i = 0; i < pivRows.length; i++) {
          const ep = pivRows[i].original.endpoint_label;
          if ((activeEndpoint && ep === activeEndpoint) || (!activeEndpoint && selectedFindingId === pivRows[i].original.original.id)) {
            pivVirtualizer.scrollToIndex(i, { align: "start", behavior: "smooth" });
            return;
          }
        }
      }
    });
  }, [activeEndpoint, selectedFindingId, layoutMode, stdVirtualizer, pivVirtualizer, stdRows, pivRows]);

  /** Content-hugging: non-absorber columns shrink to fit; absorber takes the rest.
   *  Manual resize overrides with an explicit width. */
  function colStyle(colId: string) {
    const manualWidth = columnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    if (colId === ABSORBER_ID) return { width: "100%" };
    return { width: 1, whiteSpace: "nowrap" as const };
  }

  function pivColStyle(colId: string) {
    const manualWidth = pivotedColumnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    if (colId === PIVOTED_ABSORBER_ID) return { width: "100%" };
    return { width: 1, whiteSpace: "nowrap" as const };
  }


  return (
    <div className="flex h-full flex-col">
      {/* Table header bar: mode toggles + count + open-in-tab */}
      <div className="flex items-center gap-3 border-b bg-muted/20 px-2 py-1">
        {/* Follow rail checkbox + day combo-box */}
        <span className="flex items-center gap-1.5">
          <label className="flex cursor-pointer items-center gap-0.5 text-[10px] text-muted-foreground select-none" title="Two-way sync: rail click scopes table, table row click selects in rail">
            <input
              type="checkbox"
              checked={followRail}
              onChange={(e) => {
                setFollowRail(e.target.checked);
                if (e.target.checked) setManualDay("all");
              }}
              className="h-2.5 w-2.5 accent-primary"
            />
            follow rail
          </label>
          <span className="relative inline-flex items-center" title={filterDay != null ? `Filtering to day ${filterDay}` : "Showing all timepoints"}>
            <select
              className="appearance-none rounded border border-border/40 bg-transparent py-0.5 pl-1.5 pr-4 text-[10px] font-medium tabular-nums text-foreground outline-none cursor-pointer hover:border-border"
              value={manualDay}
              onChange={(e) => setManualDay(e.target.value)}
            >
              <option value="all">All days</option>
              {availableDays.map((d) => (
                <option key={d} value={String(d)}>
                  {d === globalDay ? "\u25CF " : ""}{formatDayOption(d)}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-1 text-[10px] text-muted-foreground">{"\u25BE"}</span>
          </span>
        </span>
        {/* Standard / Pivoted toggle */}
        <span title={layoutMode === "standard" ? "One row per endpoint — endpoint-level stats" : "One row per dose group — dose-level comparisons"}>
          <PanePillToggle
            value={layoutMode}
            options={[
              { value: "standard" as const, label: "Endpoint" },
              { value: "pivoted" as const, label: "Dose group" },
            ]}
            onChange={setLayoutMode}
          />
        </span>
        {/* Showing text + filter icon + clear — grouped together */}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <button
            type="button"
            className={cn(
              "relative rounded p-0.5 transition-colors",
              (filterDay != null || activeFilterCount > 0)
                ? "text-primary hover:text-primary/80"
                : "text-muted-foreground hover:text-foreground",
              showFilters && "bg-primary/10",
            )}
            onClick={() => setShowFilters((p) => !p)}
            title="Toggle column filters"
          >
            <Filter className="h-3 w-3" />
          </button>
          {((filterDay != null) || activeFilterCount > 0) && (
            <button
              type="button"
              className="flex items-center rounded px-0.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                setFilterState(DEFAULT_FILTER_STATE);
                setFollowRail(true);
                setManualDay("all");
              }}
              title="Clear all filters"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
          {/* Active filter indicators — only when filters are set */}
          {(activeFilterCount > 0 || filterDay != null) && (() => {
            const chips: { label: string; values: string[] }[] = [];
            if (filterDay != null) chips.push({ label: "day", values: [`D${filterDay}`] });
            if (filterState.domain) chips.push({ label: "", values: filterState.domain });
            if (filterState.sex) chips.push({ label: "sex", values: filterState.sex });
            if (filterState.severity) chips.push({ label: "sev", values: filterState.severity });
            if (filterState.direction) chips.push({ label: "dir", values: filterState.direction });
            if (filterState.pattern) chips.push({ label: "pattern", values: filterState.pattern });
            if (filterState.dataType) chips.push({ label: "type", values: filterState.dataType });
            if (filterState.pValueRange[0] != null || filterState.pValueRange[1] != null) {
              const lo = filterState.pValueRange[0]; const hi = filterState.pValueRange[1];
              const fmt = lo != null && hi != null ? `${lo}\u2013${hi}`
                : hi != null ? `\u2264${hi}` : `\u2265${lo}`;
              chips.push({ label: "p", values: [fmt] });
            }
            if (filterState.trendPRange[0] != null || filterState.trendPRange[1] != null) {
              const lo = filterState.trendPRange[0]; const hi = filterState.trendPRange[1];
              const fmt = lo != null && hi != null ? `${lo}\u2013${hi}`
                : hi != null ? `\u2264${hi}` : `\u2265${lo}`;
              chips.push({ label: "trend", values: [fmt] });
            }
            if (filterState.effectSizeRange[0] != null || filterState.effectSizeRange[1] != null) {
              const lo = filterState.effectSizeRange[0]; const hi = filterState.effectSizeRange[1];
              const fmt = lo != null && hi != null ? `${lo}\u2013${hi}`
                : hi != null ? `\u2264${hi}` : `\u2265${lo}`;
              chips.push({ label: "|g|", values: [fmt] });
            }
            if (filterState.foldChangeRange[0] != null || filterState.foldChangeRange[1] != null) {
              const lo = filterState.foldChangeRange[0]; const hi = filterState.foldChangeRange[1];
              const fmt = lo != null && hi != null ? `${lo}\u2013${hi}`
                : hi != null ? `\u2264${hi}` : `\u2265${lo}`;
              chips.push({ label: "FC", values: [fmt] });
            }
            return chips.length > 0 ? (
              <span className="flex items-center gap-1 text-[10px]">
                <span className="text-muted-foreground">Showing:</span>
                {chips.map((c, i) => (
                  <span key={i} className="text-primary/60">
                    {c.label ? <span className="mr-0.5">{c.label}:</span> : null}
                    {c.values.map((v) => (
                      <span key={v} className="font-medium mr-0.5">{v}</span>
                    ))}
                  </span>
                ))}
              </span>
            ) : null;
          })()}
        </span>
        <span className="relative flex items-center">
          <Search className="absolute left-1 h-2.5 w-2.5 text-muted-foreground/50" />
          <input
            type="text"
            value={filterState.findingSearch}
            onChange={(e) => setFilterState((prev) => ({ ...prev, findingSearch: e.target.value }))}
            placeholder="Search..."
            className="w-24 rounded border border-border/40 bg-transparent py-0.5 pl-4 pr-1.5 text-[10px] outline-none placeholder:text-muted-foreground/40 focus:border-primary/50 focus:w-36 transition-all"
          />
        </span>
        {onOpenInTab && (
          <button
            type="button"
            className="ml-auto text-muted-foreground/60 transition-colors hover:text-foreground"
            onClick={onOpenInTab}
            title="Open table in its own tab"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Content row: optional filter panel + table */}
      <div className="flex flex-1 min-h-0">
        {showFilters && (<>
          <div ref={filterResize.targetRef} className="shrink-0 overflow-y-auto" style={{ width: filterResize.width }}>
            <FindingsTableFilterPanel
              findings={findings}
              filterState={filterState}
              onFilterChange={setFilterState}
              onClearDayFilter={() => { setFollowRail(true); setManualDay("all"); }}
              activeDayLabel={filterDay != null ? `Day ${filterDay}` : null}
              effectSizeSymbol={getEffectSizeSymbol(effectSizeMethod)}
              onClose={() => setShowFilters(false)}
            />
          </div>
          <PanelResizeHandle onPointerDown={filterResize.onPointerDown} />
        </>)}

      {/* ─── Standard table (virtualized) ─────────────────────── */}
      {layoutMode === "standard" && (
      <div ref={stdScrollRef} className="flex-1 min-w-0 overflow-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b bg-muted/30">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="relative cursor-pointer px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
                  style={colStyle(header.id)}
                  onClick={(e) => {
                    if (resizingRef.current) return;
                    header.column.getToggleSortingHandler()?.(e);
                  }}
                  onContextMenu={
                    header.id === "day" ? (e) => {
                      if (hasCl) {
                        e.preventDefault();
                        setDayMenu({ x: e.clientX, y: e.clientY });
                      }
                    } : header.id === "sparkline" ? (e) => {
                      e.preventDefault();
                      setSparkMenu({ x: e.clientX, y: e.clientY });
                    } : undefined
                  }
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: " \u2191", desc: " \u2193" }[header.column.getIsSorted() as string] ?? ""}
                  <div
                    onMouseDown={(e) => {
                      resizingRef.current = true;
                      const clear = () => {
                        setTimeout(() => { resizingRef.current = false; }, 0);
                        document.removeEventListener("mouseup", clear);
                      };
                      document.addEventListener("mouseup", clear);
                      header.getResizeHandler()(e);
                    }}
                    onTouchStart={header.getResizeHandler()}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "absolute -right-1 top-0 z-10 h-full w-3 cursor-col-resize select-none touch-none",
                      header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30"
                    )}
                  />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {stdVirtualizer.getVirtualItems().length > 0 && (
            <tr><td colSpan={999} style={{ height: stdVirtualizer.getVirtualItems()[0].start, padding: 0, border: "none" }} /></tr>
          )}
          {stdVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = stdRows[virtualRow.index];
            const isSelected = selectedFindingId === row.original.id;
            return (
              <tr
                key={row.id}
                data-index={virtualRow.index}
                ref={stdVirtualizer.measureElement}
                className={cn(
                  "border-b transition-colors hover:bg-accent/50",
                  followRail && "cursor-pointer",
                  isSelected && "bg-accent font-medium",
                )}
                data-selected={isSelected || undefined}
                onClick={() => { if (followRail) selectFinding(row.original); }}
                onMouseEnter={() => { if (followRail) prefetch(row.original.id); }}
              >
                {row.getVisibleCells().map((cell) => {
                  const isAbsorber = cell.column.id === ABSORBER_ID;
                  const isOverridable = cell.column.id === "pattern" || cell.column.id === "onset_dose" || cell.column.id === "recovery";
                  const isOverridden = cell.column.id === "pattern"
                    ? derivePatternState(row.original, overrideActions.annotations).patternChanged
                    : cell.column.id === "onset_dose"
                    ? deriveOnsetState(row.original, doseGroups, overrideActions.annotations).isOverridden
                    : cell.column.id === "recovery"
                    ? (verdictMap.get(row.original.id)?.isOverridden ?? false)
                    : false;
                  const style = colStyle(cell.column.id);
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-1.5 py-px",
                        isAbsorber && !columnSizing[ABSORBER_ID] && "overflow-hidden text-ellipsis whitespace-nowrap",
                        isOverridable && "bg-violet-100/50",
                        isOverridden && "cell-overridable",
                      )}
                      style={style}
                      data-evidence=""
                      onContextMenu={
                        cell.column.id === "pattern" ? (e) => {
                          e.preventDefault();
                          setPatternMenu({ x: e.clientX, y: e.clientY, finding: row.original });
                        } : cell.column.id === "onset_dose" ? (e) => {
                          e.preventDefault();
                          setOnsetMenu({ x: e.clientX, y: e.clientY, finding: row.original });
                        } : undefined
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {stdVirtualizer.getVirtualItems().length > 0 && (
            <tr><td colSpan={999} style={{ height: stdVirtualizer.getTotalSize() - (stdVirtualizer.getVirtualItems().at(-1)?.end ?? 0), padding: 0, border: "none" }} /></tr>
          )}
        </tbody>
      </table>
      {filteredFindings.length === 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground">
          No findings match the current filters.
        </div>
      )}
      </div>
      )}

      {/* ─── Pivoted table (virtualized) ──────────────────────── */}
      {layoutMode === "pivoted" && (
      <div ref={pivScrollRef} className="flex-1 min-w-0 overflow-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 z-10 bg-background">
          {pivotedTable.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b bg-muted/30">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="relative cursor-pointer px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
                  style={pivColStyle(header.id)}
                  onClick={(e) => {
                    if (resizingRef.current) return;
                    header.column.getToggleSortingHandler()?.(e);
                  }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: " \u2191", desc: " \u2193" }[header.column.getIsSorted() as string] ?? ""}
                  <div
                    onMouseDown={(e) => {
                      resizingRef.current = true;
                      const clear = () => {
                        setTimeout(() => { resizingRef.current = false; }, 0);
                        document.removeEventListener("mouseup", clear);
                      };
                      document.addEventListener("mouseup", clear);
                      header.getResizeHandler()(e);
                    }}
                    onTouchStart={header.getResizeHandler()}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "absolute -right-1 top-0 z-10 h-full w-3 cursor-col-resize select-none touch-none",
                      header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30"
                    )}
                  />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {pivVirtualizer.getVirtualItems().length > 0 && (
            <tr><td colSpan={999} style={{ height: pivVirtualizer.getVirtualItems()[0].start, padding: 0, border: "none" }} /></tr>
          )}
          {pivVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = pivRows[virtualRow.index];
            const r = row.original;
            const isSelected = selectedFindingId === r.original.id;
            return (
              <tr
                key={row.id}
                data-index={virtualRow.index}
                ref={pivVirtualizer.measureElement}
                className={cn(
                  "border-b transition-colors hover:bg-accent/50",
                  followRail && "cursor-pointer",
                  r.dose_level === 0 && "bg-muted/15",
                  isSelected && "bg-accent font-medium",
                )}
                data-selected={isSelected || undefined}
                onClick={() => { if (followRail) selectFinding(r.original); }}
                onMouseEnter={() => { if (followRail) prefetch(r.original.id); }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "px-1.5 py-px",
                      cell.column.id === PIVOTED_ABSORBER_ID && !pivotedColumnSizing[PIVOTED_ABSORBER_ID] && "overflow-hidden text-ellipsis whitespace-nowrap",
                    )}
                    style={pivColStyle(cell.column.id)}
                    data-evidence=""
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {pivVirtualizer.getVirtualItems().length > 0 && (
            <tr><td colSpan={999} style={{ height: pivVirtualizer.getTotalSize() - (pivVirtualizer.getVirtualItems().at(-1)?.end ?? 0), padding: 0, border: "none" }} /></tr>
          )}
        </tbody>
      </table>
      {pivotedRows.length === 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground">
          No findings match the current filters.
        </div>
      )}
      </div>
      )}

      </div>
      {/* end: content row */}

      {/* Context menus */}
      {dayMenu && (
        <div ref={dayMenuRef} className="fixed z-50 min-w-[190px] rounded border bg-popover py-0.5 shadow-md"
          style={{ left: dayMenu.x, top: dayMenu.y }}>
          {([
            { value: "mode" as const, label: "Most frequent", desc: "Peak prevalence day (mode)" },
            { value: "first_observed" as const, label: "First observed", desc: "Onset day (earliest)" },
          ]).map((opt) => (
            <button key={opt.value} type="button"
              className={cn("flex w-full items-baseline gap-1.5 px-2 py-1 text-left hover:bg-accent/50",
                clDayMode === opt.value && "bg-accent/30")}
              onClick={() => { setClDayMode(opt.value); setDayMenu(null); }}>
              <span className="w-3 shrink-0 text-[11px] text-muted-foreground">{clDayMode === opt.value ? "\u2713" : ""}</span>
              <span className="text-xs font-medium">{opt.label}</span>
              <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
          <div className="mt-0.5 border-t border-border/40 px-2 py-1">
            <span className="text-[10px] italic text-muted-foreground/50">Applies to CL rows only</span>
          </div>
        </div>
      )}
      {sparkMenu && (
        <div ref={sparkMenuRef} className="fixed z-50 min-w-[180px] rounded border bg-popover py-0.5 shadow-md"
          style={{ left: sparkMenu.x, top: sparkMenu.y }}>
          {([
            { value: "row" as const, label: "Row scale", desc: "Each row scaled independently" },
            { value: "global" as const, label: "Global scale", desc: "All rows share one scale" },
          ]).map((opt) => (
            <button key={opt.value} type="button"
              className={cn("flex w-full items-baseline gap-1.5 px-2 py-1 text-left hover:bg-accent/50",
                sparkScale === opt.value && "bg-accent/30")}
              onClick={() => { setSparkScale(opt.value); setSparkMenu(null); }}>
              <span className="w-3 shrink-0 text-[11px] text-muted-foreground">{sparkScale === opt.value ? "\u2713" : ""}</span>
              <span className="text-xs font-medium">{opt.label}</span>
              <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}
      {/* Pattern override context menu */}
      {patternMenu && (() => {
        const ps = derivePatternState(patternMenu.finding, overrideActions.annotations);
        const pvText = buildPreviewText(patternPreview);
        return (
          <div ref={patternMenuRef} className="fixed z-50 min-w-[160px] rounded border bg-popover py-0.5 shadow-md"
            style={{ left: patternMenu.x, top: patternMenu.y }}>
            {OVERRIDE_OPTIONS.map((opt) => {
              const isActive = opt.value === ps.currentOverrideKey;
              const isSystem = opt.value === ps.originalKey;
              return (
                <button key={opt.value} type="button"
                  onMouseEnter={() => setHoveredPatternOption(opt.value)}
                  onClick={() => { overrideActions.selectPattern(patternMenu.finding, opt.value); setPatternMenu(null); }}
                  disabled={overrideActions.isPending}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                    isActive ? "bg-muted/50 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                  )}>
                  <span>{opt.label}</span>
                  {isSystem && ps.patternChanged && (
                    <span className="ml-auto text-[11px] text-muted-foreground/50">system</span>
                  )}
                </button>
              );
            })}
            {ps.patternChanged && (
              <button type="button"
                onClick={() => { overrideActions.resetPattern(patternMenu.finding); setPatternMenu(null); }}
                disabled={overrideActions.isPending}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-colors border-t border-border/40">
                Reset to system
              </button>
            )}
            {pvText && (
              <div className="border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                {pvText}
              </div>
            )}
          </div>
        );
      })()}
      {/* Onset dose override context menu */}
      {onsetMenu && (() => {
        const os = deriveOnsetState(onsetMenu.finding, doseGroups, overrideActions.annotations);
        const treatmentGroups = doseGroups.filter(g => g.dose_level > 0);
        const systemLevel = getSystemOnsetLevel(onsetMenu.finding);
        const hasOnsetOverride = os.onset?.source === "override";
        return (
          <div ref={onsetMenuRef} className="fixed z-50 min-w-[120px] rounded border bg-popover py-0.5 shadow-md"
            style={{ left: onsetMenu.x, top: onsetMenu.y }}>
            {treatmentGroups.map((g) => {
              const isSystem = g.dose_level === systemLevel;
              const isCurrent = os.onset && g.dose_level === os.onset.doseLevel;
              return (
                <button key={g.dose_level} type="button"
                  onClick={() => { overrideActions.selectOnset(onsetMenu.finding, g.dose_level); setOnsetMenu(null); }}
                  disabled={overrideActions.isPending}
                  className={cn(
                    "flex w-full items-center px-3 py-1 text-left text-[11px] transition-colors",
                    isCurrent ? "bg-muted/50 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                  )}>
                  <span>{formatOnsetDose(g.dose_level, doseGroups)}</span>
                  {isSystem && hasOnsetOverride && (
                    <span className="ml-auto text-[11px] text-muted-foreground/50">system</span>
                  )}
                </button>
              );
            })}
            {hasOnsetOverride && (
              <button type="button"
                onClick={() => { overrideActions.resetOnset(onsetMenu.finding); setOnsetMenu(null); }}
                disabled={overrideActions.isPending}
                className="flex w-full items-center px-3 py-1 text-left text-[11px] text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-colors border-t border-border/40">
                Reset to system
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
