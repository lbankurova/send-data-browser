import { useState, useMemo, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { EyeOff, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSeverityDotColor,
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  getDirectionColor,
  formatDoseShortLabel,
} from "@/lib/severity-colors";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { effectSizeLabel } from "@/lib/domain-types";
import { DoseHeader, DoseLabel } from "@/components/ui/DoseLabel";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { usePrefetchFindingContext } from "@/hooks/usePrefetchFindingContext";
import { useSessionState } from "@/hooks/useSessionState";
import { getSignalTier } from "@/lib/findings-rail-engine";
import type { GroupingMode } from "@/lib/findings-rail-engine";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

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
  severity: string;
  dose_level: number;
  dose_label: string;
  n: number;
  mean: number | null;
  sd: number | null;
  affected: number | null;
  incidence: number | null;
  p_value: number | null;
  effect_size: number | null;
  trend_p: number | null;
  dose_response_pattern: string;
}

const pivCol = createColumnHelper<PivotedRow>();
const PIVOTED_ABSORBER_ID = "piv_finding";

interface FindingsTableProps {
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  signalScores?: Map<string, number>;
  excludedEndpoints?: Set<string>;
  onToggleExclude?: (label: string) => void;
  /** Active endpoint label — all rows matching this endpoint get a subtle highlight. */
  activeEndpoint?: string | null;
  /** Current rail grouping mode — when "finding", table sorts by endpoint by default. */
  activeGrouping?: GroupingMode | null;
  /** Callback to open the table in its own tab. */
  onOpenInTab?: () => void;
}

export function FindingsTable({ findings, doseGroups, signalScores, excludedEndpoints, onToggleExclude, activeEndpoint, activeGrouping, onOpenInTab }: FindingsTableProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectedFindingId, selectFinding } = useFindingSelection();
  const prefetch = usePrefetchFindingContext(studyId);
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);
  const resizingRef = useRef(false);
  const [sorting, setSorting] = useSessionState<SortingState>("pcc.findings.sorting", []);
  const [columnSizing, setColumnSizing] = useSessionState<ColumnSizingState>("pcc.findings.columnSizing", {});

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

  // Table display mode: "all" shows every row; "worst" collapses to strongest timepoint per endpoint
  type TableMode = "all" | "worst";
  const [tableMode, setTableMode] = useState<TableMode>("all");

  // Layout mode: "standard" (dose groups as columns) vs "pivoted" (dose groups as rows)
  type LayoutMode = "standard" | "pivoted";
  const [layoutMode, setLayoutMode] = useSessionState<LayoutMode>("pcc.findings.layoutMode", "standard");

  // Pivoted table sorting (separate from standard table)
  const [pivotedSorting, setPivotedSorting] = useSessionState<SortingState>("pcc.findings.pivotedSorting", []);
  const [pivotedColumnSizing, setPivotedColumnSizing] = useSessionState<ColumnSizingState>("pcc.findings.pivotedColumnSizing", {});

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

  // "Worst" mode: for each endpoint, keep only the day with the strongest signal (both sexes)
  const displayFindings = useMemo(() => {
    if (tableMode === "all") return findings;

    const byEndpoint = new Map<string, UnifiedFinding[]>();
    for (const f of findings) {
      const key = f.endpoint_label ?? f.finding;
      if (!byEndpoint.has(key)) byEndpoint.set(key, []);
      byEndpoint.get(key)!.push(f);
    }

    const result: UnifiedFinding[] = [];
    for (const [, group] of byEndpoint) {
      const days = new Set(group.map(f => f.day));
      if (days.size <= 1) {
        result.push(...group);
        continue;
      }
      // Pick the finding with min p-value (primary), max |effect size| (tiebreaker)
      const best = group.reduce((a, b) => {
        const pA = a.min_p_adj ?? Infinity;
        const pB = b.min_p_adj ?? Infinity;
        if (pB < pA) return b;
        if (pB === pA && Math.abs(b.max_effect_size ?? 0) > Math.abs(a.max_effect_size ?? 0)) return b;
        return a;
      });
      // Keep all findings (both sexes) at the worst day
      result.push(...group.filter(f => f.day === best.day));
    }

    return result;
  }, [findings, tableMode]);

  // ─── Pivoted data: flatten finding × dose group into rows ───
  const pivotedRows = useMemo(() => {
    const doseMap = new Map(doseGroups.map(dg => [dg.dose_level, dg]));
    const rows: PivotedRow[] = [];
    for (const f of displayFindings) {
      for (const gs of f.group_stats) {
        const dg = doseMap.get(gs.dose_level);
        const pw = f.pairwise.find(p => p.dose_level === gs.dose_level);
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
          severity: f.severity,
          dose_level: gs.dose_level,
          dose_label: dg ? (dg.dose_level === 0 ? "Control" : dg.label) : `Level ${gs.dose_level}`,
          n: gs.n,
          mean: gs.mean,
          sd: gs.sd,
          affected: gs.affected ?? null,
          incidence: gs.incidence ?? null,
          p_value: pw?.p_value_adj ?? pw?.p_value ?? null,
          effect_size: pw?.cohens_d ?? null,
          trend_p: f.trend_p,
          dose_response_pattern: f.dose_response_pattern ?? "",
        });
      }
    }
    return rows;
  }, [displayFindings, doseGroups]);

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
      col.accessor("sex", { header: "Sex" }),
      col.accessor("day", {
        header: () => {
          const hasCl = findings.some(f => f.domain === "CL");
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
        header: () => <span title="Data type: continuous (group mean) or incidence (affected/N)">Type</span>,
        cell: (info) => {
          const dt = info.getValue();
          return (
            <span className="text-muted-foreground" title={dt === "continuous" ? "Continuous \u2014 dose columns show group mean" : "Incidence \u2014 dose columns show affected/N"}>
              {dt === "continuous" ? "cont" : "inc"}
            </span>
          );
        },
      }),
      ...doseGroups.map((dg, idx) => {
        // Short labels: control → "C", non-zero → numeric only
        const shortLabel = dg.dose_level === 0 ? "C" : String(dg.dose_value ?? formatDoseShortLabel(dg.label));
        const fullLabel = dg.dose_value != null && dg.dose_unit
          ? `${dg.dose_value} ${dg.dose_unit}` : dg.label;
        const headerTooltip = `${fullLabel}\nMean (continuous) \u00b7 Affected/N (incidence)`;
        return col.display({
          id: `dose_${dg.dose_level}`,
          header: () => (
            <DoseHeader
              level={dg.dose_level}
              label={shortLabel}
              tooltip={headerTooltip}
            />
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
                <span className="font-mono">
                  {gs.mean != null ? gs.mean.toFixed(2) : "\u2014"}{excludedMark}
                </span>
              );
            }
            return (
              <span className="font-mono">
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
            ? "Global scale — bar height reflects actual magnitude across all findings (e.g., 1 affected out of N=15 appears small). Right-click to change."
            : "Row scale — each row scaled to its own max. Right-click to change."}>
            Sparkline{sparkScale === "global" ? "*" : ""}
          </span>
        ),
        cell: (info) => {
          const f = info.row.original;
          const stats = f.group_stats;
          if (stats.length < 2) return null;
          const isCont = f.data_type === "continuous";
          const vals = stats
            .slice()
            .sort((a, b) => a.dose_level - b.dose_level)
            .map((g) => isCont ? g.mean : g.incidence);
          if (vals.every((v) => v == null)) return null;
          const nums = vals.map((v) => v ?? 0);
          const control = isCont ? nums[0] : 0;
          const max = sparkScale === "global"
            ? (isCont ? globalSparkMax.continuous : globalSparkMax.incidence)
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
        },
      }),
      col.accessor("min_p_adj", {
        header: "P-value",
        cell: (info) => (
          <span className="ev font-mono text-muted-foreground">{formatPValue(info.getValue())}</span>
        ),
      }),
      col.accessor("trend_p", {
        header: "Trend p",
        cell: (info) => (
          <span className="ev font-mono text-muted-foreground">{formatPValue(info.getValue())}</span>
        ),
      }),
      col.accessor("direction", {
        header: "Dir",
        cell: (info) => (
          <span className={getDirectionColor(info.getValue())}>
            {getDirectionSymbol(info.getValue())}
          </span>
        ),
      }),
      col.accessor("max_effect_size", {
        header: "Effect",
        cell: (info) => {
          const v = info.getValue();
          const domain = info.row.original.domain;
          return (
            <span className="ev font-mono text-muted-foreground" title={v != null ? `${effectSizeLabel(domain)} = ${v.toFixed(3)}` : undefined}>
              {formatEffectSize(v)}
            </span>
          );
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
          const isNormal = severity === "normal";

          const borderClass = isNormal
            ? "border-l"
            : tier === 3 ? "border-l-4" : tier === 2 ? "border-l-2" : "border-l";
          const fontClass = isNormal
            ? "text-muted-foreground"
            : tier === 3 ? "font-semibold text-gray-600"
            : tier === 2 ? "font-medium text-gray-600"
            : "text-gray-600";

          return (
            <span
              className={`inline-block ${borderClass} pl-1.5 py-0.5 ${fontClass}`}
              style={{ borderLeftColor: getSeverityDotColor(severity) }}
            >
              {severity}
            </span>
          );
        },
      }),
    ],
    [doseGroups, signalScores, excludedEndpoints, onToggleExclude, findings, clDayMode, sparkScale, globalSparkMax]
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
          const full = r.specimen ? `${r.specimen}: ${r.finding}` : r.finding;
          return (
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
          );
        },
      }),
      pivCol.accessor("sex", { header: "Sex" }),
      pivCol.accessor("day", {
        header: "Day",
        cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? "\u2014"}</span>,
      }),
      pivCol.accessor("dose_level", {
        header: "Dose",
        cell: (info) => {
          const r = info.row.original;
          const shortLabel = r.dose_level === 0 ? "C" : formatDoseShortLabel(r.dose_label);
          return <DoseLabel level={r.dose_level} label={shortLabel} tooltip={r.dose_label} />;
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
          return <span className="font-mono">{r.affected != null && r.n ? `${r.affected}/${r.n}` : "\u2014"}</span>;
        },
      }),
      pivCol.display({
        id: "sd_inc",
        header: () => <span title="SD (continuous) or Incidence % (incidence)">SD/%</span>,
        cell: (info) => {
          const r = info.row.original;
          if (r.data_type === "continuous") {
            return <span className="font-mono text-muted-foreground">{r.sd != null ? r.sd.toFixed(2) : "\u2014"}</span>;
          }
          return (
            <span className="font-mono text-muted-foreground">
              {r.incidence != null ? `${(r.incidence * 100).toFixed(0)}%` : "\u2014"}
            </span>
          );
        },
      }),
      pivCol.accessor("p_value", {
        header: "P-value",
        cell: (info) => {
          const r = info.row.original;
          if (r.dose_level === 0) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          return <span className="ev font-mono text-muted-foreground">{formatPValue(info.getValue())}</span>;
        },
      }),
      pivCol.accessor("effect_size", {
        header: "Effect",
        cell: (info) => {
          const r = info.row.original;
          if (r.dose_level === 0) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
          const v = info.getValue();
          return (
            <span className="ev font-mono text-muted-foreground" title={v != null ? `${effectSizeLabel(r.domain)} = ${v.toFixed(3)}` : undefined}>
              {formatEffectSize(v)}
            </span>
          );
        },
      }),
      pivCol.accessor("trend_p", {
        header: "Trend p",
        cell: (info) => <span className="ev font-mono text-muted-foreground">{formatPValue(info.getValue())}</span>,
      }),
      pivCol.accessor("dose_response_pattern", {
        header: "Pattern",
        cell: (info) => {
          const v = info.getValue();
          return <span className="text-muted-foreground">{v ? v.replace(/_/g, " ") : "\u2014"}</span>;
        },
      }),
      pivCol.accessor("severity", {
        header: "Severity",
        cell: (info) => {
          const r = info.row.original;
          const severity = info.getValue();
          const signal = signalScores?.get(r.endpoint_label) ?? 0;
          const tier = getSignalTier(signal);
          const isNormal = severity === "normal";
          const borderClass = isNormal
            ? "border-l"
            : tier === 3 ? "border-l-4" : tier === 2 ? "border-l-2" : "border-l";
          const fontClass = isNormal
            ? "text-muted-foreground"
            : tier === 3 ? "font-semibold text-gray-600"
            : tier === 2 ? "font-medium text-gray-600"
            : "text-gray-600";
          return (
            <span
              className={`inline-block ${borderClass} pl-1.5 py-0.5 ${fontClass}`}
              style={{ borderLeftColor: getSeverityDotColor(severity) }}
            >
              {severity}
            </span>
          );
        },
      }),
    ],
    [signalScores]
  );

  // ─── Standard table instance ───────────────────────────────
  const table = useReactTable({
    data: displayFindings,
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

  // Ref for the first sibling row (same endpoint) — used for scroll target
  const firstSiblingRef = useRef<HTMLTableRowElement | null>(null);
  // Autoscroll: when activeEndpoint changes, scroll the first sibling row into view;
  // when only selectedFindingId changes (within same endpoint), scroll that row.
  // Use RAF to let the render with updated refs complete first.
  useEffect(() => {
    requestAnimationFrame(() => {
      if (firstSiblingRef.current) {
        firstSiblingRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
      } else if (selectedRowRef.current) {
        selectedRowRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  }, [activeEndpoint, selectedFindingId]);

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

  const rowCount = layoutMode === "pivoted" ? pivotedRows.length : displayFindings.length;
  const totalCount = layoutMode === "pivoted" ? findings.length * doseGroups.length : findings.length;

  return (
    <div className="flex h-full flex-col">
      {/* Table header bar: mode toggles + count + open-in-tab */}
      <div className="flex items-center gap-3 border-b bg-muted/20 px-2 py-1">
        {/* All / Worst toggle */}
        <div className="flex items-center overflow-hidden rounded-sm border border-border/50">
          <button
            type="button"
            className={cn(
              "px-2 py-0.5 text-[10px] font-medium transition-colors",
              tableMode === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTableMode("all")}
            title="Show all measurements across all timepoints"
          >
            All
          </button>
          <button
            type="button"
            className={cn(
              "px-2 py-0.5 text-[10px] font-medium transition-colors",
              tableMode === "worst" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTableMode("worst")}
            title="Show only the strongest timepoint per endpoint (both sexes)"
          >
            Worst
          </button>
        </div>
        {/* Standard / Pivoted toggle */}
        <div className="flex items-center overflow-hidden rounded-sm border border-border/50">
          <button
            type="button"
            className={cn(
              "px-2 py-0.5 text-[10px] font-medium transition-colors",
              layoutMode === "standard" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setLayoutMode("standard")}
            title="Dose groups as columns — one row per finding"
          >
            Standard
          </button>
          <button
            type="button"
            className={cn(
              "px-2 py-0.5 text-[10px] font-medium transition-colors",
              layoutMode === "pivoted" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setLayoutMode("pivoted")}
            title="Dose groups as rows — one row per finding per dose group"
          >
            Pivoted
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {rowCount}{tableMode === "worst" && rowCount !== totalCount ? `/${totalCount}` : ""} {layoutMode === "pivoted" ? "rows" : (rowCount === 1 ? "finding" : "findings")}
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

      {/* ─── Standard table ─────────────────────────────────── */}
      {layoutMode === "standard" && (
      <div className="flex-1 overflow-auto">
      <table className="w-full text-[10px]">
        <thead className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b bg-muted/30">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
                  style={colStyle(header.id)}
                  onClick={(e) => {
                    if (resizingRef.current) return;
                    header.column.getToggleSortingHandler()?.(e);
                  }}
                  onContextMenu={
                    header.id === "day" ? (e) => {
                      if (findings.some(f => f.domain === "CL")) {
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
          {(() => {
            let firstSiblingAssigned = false;
            return table.getRowModel().rows.map((row) => {
            const isSelected = selectedFindingId === row.original.id;
            const epLabel = row.original.endpoint_label ?? row.original.finding;
            const isSibling = activeEndpoint != null && epLabel === activeEndpoint;
            const isPrimary = isSelected && isSibling;
            const isSecondary = !isSelected && isSibling;

            // Assign firstSiblingRef to the first row in the active endpoint group
            let refCb: ((el: HTMLTableRowElement | null) => void) | undefined;
            if (isSibling && !firstSiblingAssigned) {
              firstSiblingAssigned = true;
              refCb = (el) => {
                firstSiblingRef.current = el;
                if (isSelected) selectedRowRef.current = el;
              };
            } else if (isSelected) {
              refCb = (el) => { selectedRowRef.current = el; };
            }

            return (
              <tr
                key={row.id}
                ref={refCb}
                className={cn(
                  "cursor-pointer border-b transition-colors hover:bg-accent/50",
                  isPrimary && "bg-primary/15 font-medium",
                  isSecondary && "bg-accent/40",
                  isSelected && !isSibling && !activeEndpoint && "bg-accent font-medium",
                )}
                data-selected={isSelected || undefined}
                onClick={() => selectFinding(row.original)}
                onMouseEnter={() => prefetch(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => {
                  const isAbsorber = cell.column.id === ABSORBER_ID;
                  const style = colStyle(cell.column.id);
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-1.5 py-px",
                        isAbsorber && !columnSizing[ABSORBER_ID] && "overflow-hidden text-ellipsis whitespace-nowrap",
                      )}
                      style={style}
                      data-evidence=""
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          });
          })()}
        </tbody>
      </table>
      {displayFindings.length === 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground">
          No findings match the current filters.
        </div>
      )}
      </div>
      )}

      {/* ─── Pivoted table ──────────────────────────────────── */}
      {layoutMode === "pivoted" && (
      <div className="flex-1 overflow-auto">
      <table className="w-full text-[10px]">
        <thead className="sticky top-0 z-10 bg-background">
          {pivotedTable.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b bg-muted/30">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
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
          {pivotedTable.getRowModel().rows.map((row) => {
            const r = row.original;
            const isSelected = selectedFindingId === r.original.id;
            const epLabel = r.endpoint_label;
            const isSibling = activeEndpoint != null && epLabel === activeEndpoint;
            return (
              <tr
                key={row.id}
                className={cn(
                  "cursor-pointer border-b transition-colors hover:bg-accent/50",
                  isSelected && isSibling && "bg-primary/15 font-medium",
                  !isSelected && isSibling && "bg-accent/40",
                  isSelected && !isSibling && !activeEndpoint && "bg-accent font-medium",
                )}
                data-selected={isSelected || undefined}
                onClick={() => selectFinding(r.original)}
                onMouseEnter={() => prefetch(r.original.id)}
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
        </tbody>
      </table>
      {pivotedRows.length === 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground">
          No findings match the current filters.
        </div>
      )}
      </div>
      )}

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
              <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{clDayMode === opt.value ? "\u2713" : ""}</span>
              <span className="text-[11px] font-medium">{opt.label}</span>
              <span className="text-[9px] text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
          <div className="mt-0.5 border-t border-border/40 px-2 py-1">
            <span className="text-[9px] italic text-muted-foreground/50">Applies to CL rows only</span>
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
              <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{sparkScale === opt.value ? "\u2713" : ""}</span>
              <span className="text-[11px] font-medium">{opt.label}</span>
              <span className="text-[9px] text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
