import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Loader2, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, Table, ColumnSizingState } from "@tanstack/react-table";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ErrorBar,
  ResponsiveContainer,
} from "recharts";
import { useDoseResponseMetrics } from "@/hooks/useDoseResponseMetrics";
import { cn } from "@/lib/utils";
import {
  formatPValue,
  formatEffectSize,
  getDomainBadgeColor,
  titleCase,
} from "@/lib/severity-colors";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { CollapseAllButtons } from "@/components/analysis/panes/CollapseAllButtons";
import type { DoseResponseRow } from "@/types/analysis-views";

// ─── Public types ──────────────────────────────────────────

export interface DoseResponseSelection {
  endpoint_label: string;
  sex?: string;
  domain?: string;
  organ_system?: string;
}

// ─── Pattern label & color maps ────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  monotonic_increase: "Monotonic increase",
  monotonic_decrease: "Monotonic decrease",
  threshold: "Threshold effect",
  non_monotonic: "Non-monotonic",
  flat: "Flat (no effect)",
  insufficient_data: "Insufficient data",
};

const PATTERN_BG: Record<string, string> = {
  monotonic_increase: "bg-gray-100 text-gray-600",
  monotonic_decrease: "bg-gray-100 text-gray-600",
  threshold: "bg-gray-100 text-gray-600",
  non_monotonic: "bg-gray-100 text-gray-600",
  flat: "bg-gray-100 text-gray-500",
  insufficient_data: "bg-gray-100 text-gray-400",
};

// ─── Derived data types ────────────────────────────────────

interface EndpointSummary {
  endpoint_label: string;
  organ_system: string;
  domain: string;
  data_type: "continuous" | "categorical";
  dose_response_pattern: string;
  min_p_value: number | null;
  min_trend_p: number | null;
  max_effect_size: number | null;
  direction: "up" | "down" | "mixed" | null;
  sexes: string[];
  signal_score: number;
}

interface OrganGroup {
  organ_system: string;
  endpoints: EndpointSummary[];
  max_signal_score: number;
}

// ─── Helpers ───────────────────────────────────────────────

function computeSignalScore(minTrendP: number | null, maxEffect: number | null): number {
  const pPart = minTrendP != null && minTrendP > 0 ? -Math.log10(minTrendP) : 0;
  const ePart = maxEffect != null ? Math.abs(maxEffect) : 0;
  return pPart + ePart;
}

function deriveEndpointSummaries(data: DoseResponseRow[]): EndpointSummary[] {
  const map = new Map<string, DoseResponseRow[]>();
  for (const row of data) {
    const existing = map.get(row.endpoint_label);
    if (existing) existing.push(row);
    else map.set(row.endpoint_label, [row]);
  }

  const summaries: EndpointSummary[] = [];
  for (const [label, rows] of map) {
    const first = rows[0];
    let minP: number | null = null;
    let minTrendP: number | null = null;
    let maxEffect: number | null = null;
    const sexSet = new Set<string>();
    let hasUp = false;
    let hasDown = false;

    for (const r of rows) {
      sexSet.add(r.sex);
      if (r.p_value != null && (minP === null || r.p_value < minP)) minP = r.p_value;
      if (r.trend_p != null && (minTrendP === null || r.trend_p < minTrendP)) minTrendP = r.trend_p;
      if (r.effect_size != null) {
        const abs = Math.abs(r.effect_size);
        if (maxEffect === null || abs > maxEffect) maxEffect = abs;
        if (r.effect_size > 0) hasUp = true;
        if (r.effect_size < 0) hasDown = true;
      }
    }

    // Determine dominant pattern (prefer non-flat)
    const patternCounts = new Map<string, number>();
    for (const r of rows) {
      patternCounts.set(r.dose_response_pattern, (patternCounts.get(r.dose_response_pattern) ?? 0) + 1);
    }
    let bestPattern = first.dose_response_pattern;
    let bestCount = 0;
    for (const [p, c] of patternCounts) {
      if (p !== "flat" && p !== "insufficient_data" && c > bestCount) {
        bestPattern = p;
        bestCount = c;
      }
    }
    // If only flat/insufficient, use the most common
    if (bestCount === 0) {
      for (const [p, c] of patternCounts) {
        if (c > bestCount) {
          bestPattern = p;
          bestCount = c;
        }
      }
    }

    const direction = hasUp && hasDown ? "mixed" : hasUp ? "up" : hasDown ? "down" : null;

    summaries.push({
      endpoint_label: label,
      organ_system: first.organ_system,
      domain: first.domain,
      data_type: first.data_type,
      dose_response_pattern: bestPattern,
      min_p_value: minP,
      min_trend_p: minTrendP,
      max_effect_size: maxEffect,
      direction,
      sexes: [...sexSet].sort(),
      signal_score: computeSignalScore(minTrendP, maxEffect),
    });
  }

  return summaries.sort((a, b) => b.signal_score - a.signal_score);
}

function deriveOrganGroups(summaries: EndpointSummary[]): OrganGroup[] {
  const map = new Map<string, EndpointSummary[]>();
  for (const s of summaries) {
    const existing = map.get(s.organ_system);
    if (existing) existing.push(s);
    else map.set(s.organ_system, [s]);
  }

  const groups: OrganGroup[] = [];
  for (const [organ, endpoints] of map) {
    // Endpoints are already sorted by signal_score desc from deriveEndpointSummaries
    groups.push({
      organ_system: organ,
      endpoints,
      max_signal_score: endpoints[0]?.signal_score ?? 0,
    });
  }

  return groups.sort((a, b) => b.max_signal_score - a.max_signal_score);
}

function directionArrow(dir: "up" | "down" | "mixed" | null): string {
  if (dir === "up") return "↑";
  if (dir === "down") return "↓";
  if (dir === "mixed") return "↕";
  return "";
}

function generateConclusion(ep: EndpointSummary): string {
  const patternLabel = PATTERN_LABELS[ep.dose_response_pattern] ?? ep.dose_response_pattern.replace(/_/g, " ");
  const parts: string[] = [];

  parts.push(`${patternLabel} across doses`);

  if (ep.min_trend_p != null) {
    parts.push(`trend p=${formatPValue(ep.min_trend_p)}`);
  }

  if (ep.max_effect_size != null) {
    parts.push(`max effect size ${ep.max_effect_size.toFixed(2)}`);
  }

  const sexNote =
    ep.sexes.length === 2
      ? "Both sexes affected"
      : ep.sexes.length === 1
        ? `${ep.sexes[0] === "M" ? "Males" : "Females"} only`
        : "";

  let text = parts.join(", ");
  if (sexNote) text += `. ${sexNote}`;
  text += ".";
  return text;
}

// ─── TanStack Table column defs ────────────────────────────

const col = createColumnHelper<DoseResponseRow>();

// ─── Main component ────────────────────────────────────────

export function DoseResponseView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: DoseResponseSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { data: drData, isLoading, error } = useDoseResponseMetrics(studyId);

  // State
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chart" | "metrics">("chart");
  const [railSearch, setRailSearch] = useState("");
  const [expandedOrgans, setExpandedOrgans] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<DoseResponseSelection | null>(null);

  // Metrics tab state
  const [metricsFilters, setMetricsFilters] = useState<{
    sex: string | null;
    data_type: string | null;
    organ_system: string | null;
  }>({ sex: null, data_type: null, organ_system: null });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const { width: railWidth, onPointerDown: onRailResize } = useResizePanel(300, 180, 500);

  // ── Derived data ──────────────────────────────────────

  const endpointSummaries = useMemo(() => {
    if (!drData) return [];
    return deriveEndpointSummaries(drData);
  }, [drData]);

  const organGroups = useMemo(() => {
    return deriveOrganGroups(endpointSummaries);
  }, [endpointSummaries]);

  const organSystems = useMemo(() => {
    if (!drData) return [];
    return [...new Set(drData.map((r) => r.organ_system))].sort();
  }, [drData]);

  // Selected endpoint summary
  const selectedSummary = useMemo(() => {
    if (!selectedEndpoint) return null;
    return endpointSummaries.find((s) => s.endpoint_label === selectedEndpoint) ?? null;
  }, [endpointSummaries, selectedEndpoint]);

  // Filtered rail endpoints by search
  const filteredOrganGroups = useMemo(() => {
    if (!railSearch) return organGroups;
    const q = railSearch.toLowerCase();
    return organGroups
      .map((g) => ({
        ...g,
        endpoints: g.endpoints.filter(
          (ep) =>
            ep.endpoint_label.toLowerCase().includes(q) ||
            ep.organ_system.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.endpoints.length > 0);
  }, [organGroups, railSearch]);

  // Chart data for selected endpoint
  const chartData = useMemo(() => {
    if (!drData || !selectedEndpoint) return null;
    const rows = drData.filter((r) => r.endpoint_label === selectedEndpoint);
    if (rows.length === 0) return null;
    const dataType = rows[0].data_type;
    const sexes = [...new Set(rows.map((r) => r.sex))].sort();
    const doseLevels = [...new Set(rows.map((r) => r.dose_level))].sort((a, b) => a - b);

    const series = sexes.map((sex) => {
      const sexRows = rows.filter((r) => r.sex === sex);
      const points = doseLevels.map((dl) => {
        const row = sexRows.find((r) => r.dose_level === dl);
        return {
          dose_level: dl,
          dose_label: row?.dose_label.split(",")[0] ?? `Dose ${dl}`,
          mean: row?.mean ?? null,
          sd: row?.sd ?? null,
          incidence: row?.incidence ?? null,
          n: row?.n ?? null,
          p_value: row?.p_value ?? null,
        };
      });
      return { sex, points };
    });

    return { dataType, sexes, doseLevels, series };
  }, [drData, selectedEndpoint]);

  // Pairwise comparison table for selected endpoint
  const pairwiseRows = useMemo(() => {
    if (!drData || !selectedEndpoint) return [];
    return drData
      .filter((r) => r.endpoint_label === selectedEndpoint)
      .sort((a, b) => a.dose_level - b.dose_level || a.sex.localeCompare(b.sex));
  }, [drData, selectedEndpoint]);

  // Metrics table data
  const metricsData = useMemo(() => {
    if (!drData) return [];
    return drData.filter((row) => {
      if (metricsFilters.sex && row.sex !== metricsFilters.sex) return false;
      if (metricsFilters.data_type && row.data_type !== metricsFilters.data_type) return false;
      if (metricsFilters.organ_system && row.organ_system !== metricsFilters.organ_system) return false;
      return true;
    });
  }, [drData, metricsFilters]);

  // ── Columns ───────────────────────────────────────────

  const columns = useMemo(
    () => [
      col.accessor("endpoint_label", {
        header: "Endpoint",
        cell: (info) => {
          const v = info.getValue();
          return (
            <span className="truncate" title={v}>
              {v.length > 25 ? v.slice(0, 25) + "\u2026" : v}
            </span>
          );
        },
      }),
      col.accessor("domain", {
        header: "Domain",
        cell: (info) => {
          const dc = getDomainBadgeColor(info.getValue());
          return (
            <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dc.bg)} />
              {info.getValue()}
            </span>
          );
        },
      }),
      col.accessor("dose_level", {
        header: "Dose",
        cell: (info) => (
          <span className="text-[11px]">
            {info.row.original.dose_label.split(",")[0]}
          </span>
        ),
      }),
      col.accessor("sex", { header: "Sex" }),
      col.accessor("mean", {
        header: "Mean",
        cell: (info) => (
          <span className="font-mono">{info.getValue() != null ? info.getValue()!.toFixed(2) : "\u2014"}</span>
        ),
      }),
      col.accessor("sd", {
        header: "SD",
        cell: (info) => (
          <span className="font-mono text-muted-foreground">
            {info.getValue() != null ? info.getValue()!.toFixed(2) : "\u2014"}
          </span>
        ),
      }),
      col.accessor("n", {
        header: "N",
        cell: (info) => <span>{info.getValue() ?? "\u2014"}</span>,
      }),
      col.accessor("incidence", {
        header: "Incid.",
        cell: (info) => (
          <span className="font-mono">
            {info.getValue() != null ? (info.getValue()! * 100).toFixed(0) + "%" : "\u2014"}
          </span>
        ),
      }),
      col.accessor("p_value", {
        header: "P-value",
        cell: (info) => {
          const p = info.getValue();
          const sorted = !!info.column.getIsSorted();
          return (
            <span className={cn(
              "font-mono",
              p != null ? "ev" : "text-muted-foreground",
              p != null && p < 0.001 ? "font-semibold" :
              p != null && p < 0.01 ? "font-medium" : "",
              sorted && p != null && p < 0.05 ? "text-[#DC2626]" : ""
            )}>
              {formatPValue(p)}
            </span>
          );
        },
      }),
      col.accessor("effect_size", {
        header: "Effect",
        cell: (info) => {
          const d = info.getValue();
          const sorted = !!info.column.getIsSorted();
          return (
            <span className={cn(
              "font-mono",
              d != null ? "ev" : "text-muted-foreground",
              d != null && Math.abs(d) >= 0.8 ? "font-semibold" :
              d != null && Math.abs(d) >= 0.5 ? "font-medium" : "",
              sorted && d != null && Math.abs(d) >= 0.5 ? "text-[#DC2626]" : ""
            )}>
              {formatEffectSize(d)}
            </span>
          );
        },
      }),
      col.accessor("trend_p", {
        header: "Trend p",
        cell: (info) => {
          const p = info.getValue();
          const sorted = !!info.column.getIsSorted();
          return (
            <span className={cn(
              "font-mono",
              p != null ? "ev" : "text-muted-foreground",
              p != null && p < 0.001 ? "font-semibold" :
              p != null && p < 0.01 ? "font-medium" : "",
              sorted && p != null && p < 0.05 ? "text-[#DC2626]" : ""
            )}>
              {formatPValue(p)}
            </span>
          );
        },
      }),
      col.accessor("dose_response_pattern", {
        header: "Pattern",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue().replace(/_/g, " ")}</span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: metricsData,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  // ── Selection handling ────────────────────────────────

  const selectEndpoint = useCallback(
    (endpointLabel: string) => {
      setSelectedEndpoint(endpointLabel);
      setActiveTab("chart");
      // Find representative row for selection
      const row = drData?.find((r) => r.endpoint_label === endpointLabel);
      if (row) {
        const sel: DoseResponseSelection = {
          endpoint_label: row.endpoint_label,
          domain: row.domain,
          organ_system: row.organ_system,
        };
        setSelection(sel);
        onSelectionChange?.(sel);
      }
    },
    [drData, onSelectionChange]
  );

  const handleRowClick = useCallback(
    (row: DoseResponseRow) => {
      const sel: DoseResponseSelection = {
        endpoint_label: row.endpoint_label,
        sex: row.sex,
        domain: row.domain,
        organ_system: row.organ_system,
      };
      const isSame = selection?.endpoint_label === sel.endpoint_label && selection?.sex === sel.sex;
      const next = isSame ? null : sel;
      setSelection(next);
      onSelectionChange?.(next);
      if (next) {
        setSelectedEndpoint(next.endpoint_label);
      }
    },
    [selection, onSelectionChange]
  );

  const toggleOrgan = useCallback((organ: string) => {
    setExpandedOrgans((prev) => {
      const next = new Set(prev);
      if (next.has(organ)) next.delete(organ);
      else next.add(organ);
      return next;
    });
  }, []);

  // ── Auto-select on data load ──────────────────────────

  useEffect(() => {
    if (!drData || drData.length === 0 || selectedEndpoint) return;
    const summaries = deriveEndpointSummaries(drData);
    if (summaries.length === 0) return;
    const top = summaries[0];
    setSelectedEndpoint(top.endpoint_label);
    // Expand the organ group that contains the top endpoint
    setExpandedOrgans(new Set([top.organ_system]));
    // Set selection for context panel
    const row = drData.find((r) => r.endpoint_label === top.endpoint_label);
    if (row) {
      const sel: DoseResponseSelection = {
        endpoint_label: row.endpoint_label,
        domain: row.domain,
        organ_system: row.organ_system,
      };
      setSelection(sel);
      onSelectionChange?.(sel);
    }
  }, [drData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cross-view state from navigate() ──────────────────

  useEffect(() => {
    const state = location.state as { organ_system?: string; endpoint_label?: string } | null;
    if (state && drData) {
      if (state.endpoint_label) {
        selectEndpoint(state.endpoint_label);
        // Find and expand the organ group
        const row = drData.find((r) => r.endpoint_label === state.endpoint_label);
        if (row) {
          setExpandedOrgans((prev) => new Set([...prev, row.organ_system]));
        }
      } else if (state.organ_system) {
        setExpandedOrgans((prev) => new Set([...prev, state.organ_system!]));
        // Select first endpoint in that organ
        const summaries = deriveEndpointSummaries(drData);
        const first = summaries.find((s) => s.organ_system === state.organ_system);
        if (first) {
          selectEndpoint(first.endpoint_label);
        }
      }
      window.history.replaceState({}, "");
    }
  }, [location.state, drData, selectEndpoint]);

  // ── Error / Loading states ────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">Analysis data not available</h1>
          <p className="text-sm text-red-600">Run the generator to produce analysis data:</p>
          <code className="mt-2 block rounded bg-red-100 px-3 py-1.5 text-xs text-red-800">
            cd backend && python -m generator.generate {studyId}
          </code>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading dose-response data...</span>
      </div>
    );
  }

  const sexColors: Record<string, string> = { M: "#3b82f6", F: "#ec4899" };
  const totalEndpoints = endpointSummaries.length;

  return (
    <div className="flex h-full overflow-hidden max-[1200px]:flex-col">
      {/* ───── Endpoint Rail (left) ───── */}
      <div
        className="flex shrink-0 flex-col max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b"
        style={{ width: railWidth }}
      >
        {/* Rail header */}
        <div className="shrink-0 border-b px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Endpoints ({totalEndpoints})</span>
            <CollapseAllButtons
              onExpandAll={() =>
                setExpandedOrgans(
                  new Set(filteredOrganGroups.map((g) => g.organ_system))
                )
              }
              onCollapseAll={() => setExpandedOrgans(new Set())}
            />
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search endpoints..."
              className="w-full rounded border bg-background py-1 pl-7 pr-2 text-xs"
              value={railSearch}
              onChange={(e) => setRailSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Rail body */}
        <div className="flex-1 overflow-y-auto">
          {filteredOrganGroups.length === 0 && (
            <div className="p-3 text-center text-xs text-muted-foreground">
              No endpoints match your search.
            </div>
          )}
          {filteredOrganGroups.map((group) => {
            const isExpanded = expandedOrgans.has(group.organ_system);
            const hasSelected = group.endpoints.some((ep) => ep.endpoint_label === selectedEndpoint);

            return (
              <div key={group.organ_system}>
                {/* Organ group header */}
                <button
                  className={cn(
                    "flex w-full items-center gap-1.5 border-b px-3 py-1.5 text-left text-[11px] font-semibold hover:bg-accent/50",
                    hasSelected && !isExpanded && "bg-accent/30"
                  )}
                  onClick={() => toggleOrgan(group.organ_system)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">{titleCase(group.organ_system)}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {group.endpoints.length}
                  </span>
                </button>

                {/* Endpoint items */}
                {isExpanded &&
                  group.endpoints.map((ep) => {
                    const isSelected = ep.endpoint_label === selectedEndpoint;
                    return (
                      <button
                        key={ep.endpoint_label}
                        className={cn(
                          "w-full border-b border-dashed px-3 py-1.5 text-left transition-colors hover:bg-accent/50",
                          isSelected && "bg-accent"
                        )}
                        data-rail-item=""
                        data-selected={isSelected || undefined}
                        onClick={() => selectEndpoint(ep.endpoint_label)}
                      >
                        {/* Row 1: name + direction */}
                        <div className="flex items-center gap-1">
                          <span
                            className={cn(
                              "flex-1 truncate text-xs",
                              isSelected ? "font-semibold" : "font-medium"
                            )}
                            title={ep.endpoint_label}
                          >
                            {ep.endpoint_label}
                          </span>
                          {ep.direction && (
                            <span
                              className="text-xs text-[#9CA3AF]"
                              title={ep.direction === "up" ? "Effect increases with dose" : ep.direction === "down" ? "Effect decreases with dose" : "Mixed direction across sexes/doses"}
                            >
                              {directionArrow(ep.direction)}
                            </span>
                          )}
                        </div>
                        {/* Row 2: pattern badge + min p + max |d| */}
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded px-1 py-0.5 text-[9px] font-medium leading-tight",
                              PATTERN_BG[ep.dose_response_pattern] ?? "bg-gray-100 text-gray-500"
                            )}
                          >
                            {(PATTERN_LABELS[ep.dose_response_pattern] ?? ep.dose_response_pattern)
                              .split(" ")[0]}
                          </span>
                          <span className={cn(
                            "ev text-[10px] font-mono",
                            ep.min_trend_p != null && ep.min_trend_p < 0.01 ? "font-semibold" : ""
                          )}>
                            p={formatPValue(ep.min_trend_p)}
                          </span>
                          {ep.max_effect_size != null && (
                            <span className={cn(
                              "ev text-[10px] font-mono",
                              ep.max_effect_size >= 0.8 ? "font-semibold" : ""
                            )}>
                              |d|={ep.max_effect_size.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-[1200px]:hidden">
        <PanelResizeHandle onPointerDown={onRailResize} />
      </div>

      {/* ───── Evidence Panel (right) ───── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Summary header */}
        {selectedSummary ? (
          <div className="shrink-0 border-b px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{selectedSummary.endpoint_label}</h2>
                <p className="text-[11px] text-muted-foreground">
                  {selectedSummary.domain} &middot; {titleCase(selectedSummary.organ_system)}
                  {selectedSummary.data_type === "categorical" && " &middot; Categorical"}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  PATTERN_BG[selectedSummary.dose_response_pattern] ?? "bg-gray-100 text-gray-500"
                )}
              >
                {PATTERN_LABELS[selectedSummary.dose_response_pattern] ??
                  selectedSummary.dose_response_pattern.replace(/_/g, " ")}
              </span>
            </div>
            {/* Conclusion text */}
            <p className="mt-1 text-xs text-foreground/80">
              {generateConclusion(selectedSummary)}
            </p>
            {/* Compact metrics — active context, #DC2626 for strong signal only */}
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
              <span>
                <span className="text-muted-foreground">Trend p: </span>
                <span className={cn(
                  "font-mono",
                  selectedSummary.min_trend_p != null && selectedSummary.min_trend_p < 0.01
                    ? "font-semibold text-[#DC2626]"
                    : selectedSummary.min_trend_p != null && selectedSummary.min_trend_p < 0.05
                      ? "font-medium" : ""
                )}>
                  {formatPValue(selectedSummary.min_trend_p)}
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Min p: </span>
                <span className={cn(
                  "font-mono",
                  selectedSummary.min_p_value != null && selectedSummary.min_p_value < 0.01
                    ? "font-semibold text-[#DC2626]"
                    : selectedSummary.min_p_value != null && selectedSummary.min_p_value < 0.05
                      ? "font-medium" : ""
                )}>
                  {formatPValue(selectedSummary.min_p_value)}
                </span>
              </span>
              {selectedSummary.max_effect_size != null && (
                <span>
                  <span className="text-muted-foreground">Max |d|: </span>
                  <span className={cn(
                    "font-mono",
                    selectedSummary.max_effect_size >= 0.8
                      ? "font-semibold text-[#DC2626]"
                      : selectedSummary.max_effect_size >= 0.5
                        ? "font-medium" : ""
                  )}>
                    {selectedSummary.max_effect_size.toFixed(2)}
                  </span>
                </span>
              )}
              <span>
                <span className="text-muted-foreground">Sexes: </span>
                <span className="font-mono">{selectedSummary.sexes.join(", ")}</span>
              </span>
              <span>
                <span className="text-muted-foreground">Data: </span>
                <span>{selectedSummary.data_type}</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-b px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Select an endpoint from the list to view dose-response details.
            </p>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex shrink-0 items-center gap-0 border-b bg-muted/30">
          <button
            className={cn(
              "px-4 py-1.5 text-xs font-medium transition-colors",
              activeTab === "chart"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("chart")}
          >
            Chart & overview
          </button>
          <button
            className={cn(
              "px-4 py-1.5 text-xs font-medium transition-colors",
              activeTab === "metrics"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("metrics")}
          >
            Metrics table
          </button>
          {activeTab === "metrics" && (
            <span className="ml-auto mr-3 text-[10px] text-muted-foreground">
              {metricsData.length} of {drData?.length ?? 0} rows
            </span>
          )}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          {activeTab === "chart" ? (
            <ChartOverviewContent
              chartData={chartData}
              selectedEndpoint={selectedEndpoint}
              pairwiseRows={pairwiseRows}
              sexColors={sexColors}
            />
          ) : (
            <MetricsTableContent
              table={table}
              metricsData={metricsData}
              metricsFilters={metricsFilters}
              setMetricsFilters={setMetricsFilters}
              organSystems={organSystems}
              selection={selection}
              handleRowClick={handleRowClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Chart & Overview tab ──────────────────────────────────

interface ChartOverviewProps {
  chartData: {
    dataType: string;
    sexes: string[];
    doseLevels: number[];
    series: {
      sex: string;
      points: {
        dose_level: number;
        dose_label: string;
        mean: number | null;
        sd: number | null;
        incidence: number | null;
        n: number | null;
        p_value: number | null;
      }[];
    }[];
  } | null;
  selectedEndpoint: string | null;
  pairwiseRows: DoseResponseRow[];
  sexColors: Record<string, string>;
}

function ChartOverviewContent({
  chartData,
  selectedEndpoint,
  pairwiseRows,
  sexColors,
}: ChartOverviewProps) {
  if (!chartData || !selectedEndpoint) {
    return (
      <div className="flex items-center justify-center p-12 text-xs text-muted-foreground">
        Select an endpoint to view chart and overview.
      </div>
    );
  }

  return (
    <div>
      {/* Chart */}
      <div className="border-b p-4">
        <div className="flex gap-4">
          {chartData.series.map(({ sex, points }) => (
            <div key={sex} className="flex-1">
              <div
                className="mb-1 text-center text-[10px] font-medium"
                style={{ color: sexColors[sex] ?? "#666" }}
              >
                {sex === "M" ? "Males" : sex === "F" ? "Females" : sex}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                {chartData.dataType === "continuous" ? (
                  <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="dose_label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 11 }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, name: any) => [
                        value != null ? Number(value).toFixed(2) : "\u2014",
                        name === "mean" ? "Mean" : String(name ?? ""),
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="mean"
                      stroke={sexColors[sex] ?? "#666"}
                      strokeWidth={2}
                      dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: { p_value: number | null } }) => {
                        if (cx == null || cy == null) return null;
                        const sig = payload.p_value != null && payload.p_value < 0.05;
                        const color = sexColors[sex] ?? "#666";
                        return (
                          <circle
                            key={`${cx}-${cy}`}
                            cx={cx}
                            cy={cy}
                            r={sig ? 5 : 3}
                            fill={sig ? color : "#fff"}
                            stroke={color}
                            strokeWidth={sig ? 2 : 1.5}
                          />
                        );
                      }}
                      connectNulls
                    >
                      <ErrorBar
                        dataKey="sd"
                        width={4}
                        strokeWidth={1}
                        stroke={sexColors[sex] ?? "#666"}
                      />
                    </Line>
                  </LineChart>
                ) : (
                  <BarChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="dose_label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 1]} />
                    <Tooltip
                      contentStyle={{ fontSize: 11 }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [
                        value != null ? (Number(value) * 100).toFixed(0) + "%" : "\u2014",
                        "Incidence",
                      ]}
                    />
                    <Bar
                      dataKey="incidence"
                      fill={sexColors[sex] ?? "#666"}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      shape={(props: any) => {
                        const sig = props.payload?.p_value != null && props.payload.p_value < 0.05;
                        const color = sexColors[sex] ?? "#666";
                        return (
                          <rect
                            x={props.x}
                            y={props.y}
                            width={props.width}
                            height={props.height}
                            fill={color}
                            stroke={sig ? "#1F2937" : "none"}
                            strokeWidth={sig ? 1.5 : 0}
                            rx={2}
                          />
                        );
                      }}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-gray-500 bg-gray-500" />
            Significant (p&lt;0.05)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full border-[1.5px] border-gray-400 bg-white" />
            Not significant
          </span>
        </div>
      </div>

      {/* Pairwise comparison table */}
      {pairwiseRows.length > 0 && (
        <div className="p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pairwise comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-1.5 text-left font-medium">Dose</th>
                  <th className="px-2 py-1.5 text-left font-medium">Sex</th>
                  <th className="px-2 py-1.5 text-right font-medium">Mean</th>
                  <th className="px-2 py-1.5 text-right font-medium">SD</th>
                  <th className="px-2 py-1.5 text-right font-medium">N</th>
                  <th className="px-2 py-1.5 text-right font-medium">p-value</th>
                  <th className="px-2 py-1.5 text-right font-medium">Effect</th>
                  <th className="px-2 py-1.5 text-left font-medium">Pattern</th>
                </tr>
              </thead>
              <tbody>
                {pairwiseRows.map((row, i) => (
                  <tr key={i} className="border-b border-dashed">
                    <td className="px-2 py-1 text-[11px]">
                      {row.dose_label.split(",")[0]}
                    </td>
                    <td className="px-2 py-1">{row.sex}</td>
                    <td className="px-2 py-1 text-right font-mono">
                      {row.mean != null ? row.mean.toFixed(2) : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                      {row.sd != null ? row.sd.toFixed(2) : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right">{row.n ?? "\u2014"}</td>
                    <td className="px-2 py-1 text-right" data-evidence>
                      <span className={cn(
                        "font-mono",
                        row.p_value != null ? "ev" : "text-muted-foreground",
                        row.p_value != null && row.p_value < 0.001 ? "font-semibold" :
                        row.p_value != null && row.p_value < 0.01 ? "font-medium" : ""
                      )}>
                        {formatPValue(row.p_value)}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right" data-evidence>
                      <span className={cn(
                        "font-mono",
                        row.effect_size != null ? "ev" : "text-muted-foreground",
                        row.effect_size != null && Math.abs(row.effect_size) >= 0.8 ? "font-semibold" :
                        row.effect_size != null && Math.abs(row.effect_size) >= 0.5 ? "font-medium" : ""
                      )}>
                        {formatEffectSize(row.effect_size)}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {row.dose_response_pattern.replace(/_/g, " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Metrics Table tab ─────────────────────────────────────

interface MetricsTableProps {
  table: Table<DoseResponseRow>;
  metricsData: DoseResponseRow[];
  metricsFilters: { sex: string | null; data_type: string | null; organ_system: string | null };
  setMetricsFilters: React.Dispatch<
    React.SetStateAction<{ sex: string | null; data_type: string | null; organ_system: string | null }>
  >;
  organSystems: string[];
  selection: DoseResponseSelection | null;
  handleRowClick: (row: DoseResponseRow) => void;
}

function MetricsTableContent({
  table,
  metricsData,
  metricsFilters,
  setMetricsFilters,
  organSystems,
  selection,
  handleRowClick,
}: MetricsTableProps) {
  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={metricsFilters.sex ?? ""}
          onChange={(e) => setMetricsFilters((f) => ({ ...f, sex: e.target.value || null }))}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={metricsFilters.data_type ?? ""}
          onChange={(e) => setMetricsFilters((f) => ({ ...f, data_type: e.target.value || null }))}
        >
          <option value="">All types</option>
          <option value="continuous">Continuous</option>
          <option value="categorical">Categorical</option>
        </select>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={metricsFilters.organ_system ?? ""}
          onChange={(e) => setMetricsFilters((f) => ({ ...f, organ_system: e.target.value || null }))}
        >
          <option value="">All organs</option>
          {organSystems.map((os) => (
            <option key={os} value={os}>
              {titleCase(os)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {metricsData.length} rows
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="text-xs" style={{ width: table.getCenterTotalSize(), tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/50">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="relative cursor-pointer px-2 py-1.5 text-left font-medium hover:bg-accent/50"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " \u25b2", desc: " \u25bc" }[header.column.getIsSorted() as string] ?? ""}
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={cn(
                        "absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none",
                        header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30"
                      )}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const orig = row.original;
              const isSelected =
                selection?.endpoint_label === orig.endpoint_label &&
                selection?.sex === orig.sex;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "cursor-pointer border-b transition-colors hover:bg-accent/50",
                    isSelected && "bg-accent"
                  )}
                  data-selected={isSelected || undefined}
                  onClick={() => handleRowClick(orig)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isEvidence = cell.column.id === "p_value" || cell.column.id === "effect_size" || cell.column.id === "trend_p";
                    return (
                      <td key={cell.id} className="px-2 py-1" style={{ width: cell.column.getSize() }} data-evidence={isEvidence || undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {metricsData.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No rows match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
