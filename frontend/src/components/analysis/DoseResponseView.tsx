import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Loader2, ChevronDown, ChevronRight, Search, TrendingUp, GitBranch, ScatterChart, Link2, BoxSelect, Pin, Plus, Star, Scale, Edit2, HelpCircle } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, Table, ColumnSizingState } from "@tanstack/react-table";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import {
  buildDoseResponseLineOption,
  buildIncidenceBarOption,
  buildEffectSizeBarOption,
  buildCLTimecourseBarOption,
  buildTimecourseLineOption,
  buildVolcanoScatterOption,
} from "@/components/analysis/charts/dose-response-charts";
import type { MergedPoint, SubjectTrace, VolcanoPoint } from "@/components/analysis/charts/dose-response-charts";
import { useDoseResponseMetrics } from "@/hooks/useDoseResponseMetrics";
import { useTimecourseGroup, useTimecourseSubject } from "@/hooks/useTimecourse";
import { useClinicalObservations } from "@/hooks/useClinicalObservations";
import { useEndpointBookmarks, useToggleBookmark } from "@/hooks/useEndpointBookmarks";
import { useRuleResults } from "@/hooks/useRuleResults";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { BookmarkStar } from "@/components/ui/BookmarkStar";
import { cn } from "@/lib/utils";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { FilterBar, FilterBarCount, FilterSelect } from "@/components/ui/FilterBar";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { DoseLabel } from "@/components/ui/DoseLabel";
import {
  formatPValue,
  formatEffectSize,
  getDoseGroupColor,
  getSexColor,
  titleCase,
} from "@/lib/severity-colors";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { ViewSection } from "@/components/ui/ViewSection";
import { useAutoFitSections } from "@/hooks/useAutoFitSections";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { CollapseAllButtons } from "@/components/analysis/panes/CollapseAllButtons";
import type { DoseResponseRow, RuleResult, SignalSummaryRow, NoaelSummaryRow } from "@/types/analysis-views";
import type { TimecourseResponse } from "@/types/timecourse";
import type { ToxFinding } from "@/types/annotations";

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
  test_code: string;
  data_type: "continuous" | "categorical";
  dose_response_pattern: string;
  min_p_value: number | null;
  min_trend_p: number | null;
  max_effect_size: number | null;
  direction: "up" | "down" | "mixed" | null;
  sexes: string[];
  signal_score: number;
  min_n: number | null;
  has_timecourse: boolean;
  sex_divergence: number | null; // |d_M - d_F|
  divergent_sex: "M" | "F" | null; // Which sex has larger effect
}

interface OrganGroup {
  organ_system: string;
  endpoints: EndpointSummary[];
  max_signal_score: number;
  domains: string[];
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

    let minN: number | null = null;
    for (const r of rows) {
      sexSet.add(r.sex);
      if (r.p_value != null && (minP === null || r.p_value < minP)) minP = r.p_value;
      if (r.trend_p != null && (minTrendP === null || r.trend_p < minTrendP)) minTrendP = r.trend_p;
      if (r.n != null && (minN === null || r.n < minN)) minN = r.n;
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

    // Compute sex divergence: |d_M - d_F|
    let sexDivergence: number | null = null;
    let divergentSex: "M" | "F" | null = null;
    if (sexSet.has("M") && sexSet.has("F")) {
      const mRows = rows.filter((r) => r.sex === "M");
      const fRows = rows.filter((r) => r.sex === "F");
      let maxEffectM: number | null = null;
      let maxEffectF: number | null = null;
      for (const r of mRows) {
        if (r.effect_size != null) {
          const abs = Math.abs(r.effect_size);
          if (maxEffectM === null || abs > maxEffectM) maxEffectM = abs;
        }
      }
      for (const r of fRows) {
        if (r.effect_size != null) {
          const abs = Math.abs(r.effect_size);
          if (maxEffectF === null || abs > maxEffectF) maxEffectF = abs;
        }
      }
      if (maxEffectM != null && maxEffectF != null) {
        sexDivergence = Math.abs(maxEffectM - maxEffectF);
        divergentSex = maxEffectM > maxEffectF ? "M" : "F";
      }
    }

    summaries.push({
      endpoint_label: label,
      organ_system: first.organ_system,
      domain: first.domain,
      test_code: first.test_code,
      data_type: first.data_type,
      dose_response_pattern: bestPattern,
      min_p_value: minP,
      min_trend_p: minTrendP,
      max_effect_size: maxEffect,
      direction,
      sexes: [...sexSet].sort(),
      signal_score: computeSignalScore(minTrendP, maxEffect),
      min_n: minN,
      has_timecourse: first.data_type === "continuous" || first.domain === "CL",
      sex_divergence: sexDivergence,
      divergent_sex: divergentSex,
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
    const domainSet = new Set<string>();
    for (const ep of endpoints) domainSet.add(ep.domain);
    groups.push({
      organ_system: organ,
      endpoints,
      max_signal_score: endpoints[0]?.signal_score ?? 0,
      domains: [...domainSet].sort(),
    });
  }

  return groups.sort((a, b) => b.max_signal_score - a.max_signal_score);
}

function directionArrow(dir: "up" | "down" | "mixed" | null): string {
  if (dir === "up") return "\u2191";
  if (dir === "down") return "\u2193";
  if (dir === "mixed") return "\u2195";
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
  onSubjectClick,
}: {
  onSelectionChange?: (sel: DoseResponseSelection | null) => void;
  onSubjectClick?: (usubjid: string) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { data: drData, isLoading, error } = useDoseResponseMetrics(studyId);

  // State
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"evidence" | "hypotheses" | "metrics">("evidence");
  const [railSearch, setRailSearch] = useState("");
  const [expandedOrgans, setExpandedOrgans] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<DoseResponseSelection | null>(null);
  const { expandGen: sectionExpandGen, collapseGen: sectionCollapseGen, expandAll: sectionExpandAll, collapseAll: sectionCollapseAll } = useCollapseAll();

  const [bookmarkFilter, setBookmarkFilter] = useState(false);

  // Endpoint bookmarks
  const { data: bookmarksData } = useEndpointBookmarks(studyId);
  const toggleBookmark = useToggleBookmark(studyId);
  const bookmarks = bookmarksData ?? {};

  // Data for Causality tool (fetched at view level, passed to Hypotheses tab)
  const { data: ruleResultsData } = useRuleResults(studyId);
  const { data: signalSummaryData } = useStudySignalSummary(studyId);
  const { data: noaelData } = useNoaelSummary(studyId);
  const ruleResults: RuleResult[] = ruleResultsData ?? [];
  const signalSummary: SignalSummaryRow[] = signalSummaryData ?? [];
  const noaelSummary: NoaelSummaryRow[] = noaelData ?? [];

  // ToxFinding annotations (for assessment status display)
  const { data: toxFindingAnnotations } = useAnnotations<ToxFinding>(studyId, "tox-finding");

  // Metrics tab state
  const [metricsFilters, setMetricsFilters] = useState<{
    sex: string | null;
    data_type: string | null;
    organ_system: string | null;
  }>({ sex: null, data_type: null, organ_system: null });
  const [sigOnly, setSigOnly] = useState(false);
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

  // Bookmark count
  const bookmarkCount = useMemo(() => {
    return Object.values(bookmarks).filter((b) => b.bookmarked).length;
  }, [bookmarks]);

  // Filtered rail endpoints by search + bookmark filter
  const filteredOrganGroups = useMemo(() => {
    let groups = organGroups;
    if (bookmarkFilter) {
      groups = groups
        .map((g) => ({
          ...g,
          endpoints: g.endpoints.filter((ep) => bookmarks[ep.endpoint_label]?.bookmarked),
        }))
        .filter((g) => g.endpoints.length > 0);
    }
    if (!railSearch) return groups;
    const q = railSearch.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        endpoints: g.endpoints.filter(
          (ep) =>
            ep.endpoint_label.toLowerCase().includes(q) ||
            ep.organ_system.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.endpoints.length > 0);
  }, [organGroups, railSearch, bookmarkFilter, bookmarks]);

  // Chart data for selected endpoint — merged M/F per dose level
  const chartData = useMemo(() => {
    if (!drData || !selectedEndpoint) return null;
    const rows = drData.filter((r) => r.endpoint_label === selectedEndpoint);
    if (rows.length === 0) return null;
    const dataType = rows[0].data_type;
    const sexes = [...new Set(rows.map((r) => r.sex))].sort();
    const doseLevels = [...new Set(rows.map((r) => r.dose_level))].sort((a, b) => a - b);

    // Build a lookup: (sex, dose_level) → row
    const lookup = new Map<string, DoseResponseRow>();
    for (const r of rows) lookup.set(`${r.sex}_${r.dose_level}`, r);

    const mergedPoints: MergedPoint[] = doseLevels.map((dl) => {
      // Find any row for the dose label
      const anyRow = rows.find((r) => r.dose_level === dl);
      const point: MergedPoint = {
        dose_level: dl,
        dose_label: anyRow?.dose_label.split(",")[0] ?? `Dose ${dl}`,
      };
      for (const sex of sexes) {
        const r = lookup.get(`${sex}_${dl}`);
        point[`mean_${sex}`] = r?.mean ?? null;
        point[`sd_${sex}`] = r?.sd ?? null;
        point[`p_${sex}`] = r?.p_value ?? null;
        point[`incidence_${sex}`] = r?.incidence ?? null;
        point[`effect_${sex}`] = r?.effect_size ?? null;
      }
      return point;
    });

    return { dataType, sexes, doseLevels, mergedPoints };
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
      if (sigOnly && (row.p_value == null || row.p_value >= 0.05)) return false;
      return true;
    });
  }, [drData, metricsFilters, sigOnly]);

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
        cell: (info) => <DomainLabel domain={info.getValue()} />,
      }),
      col.accessor("dose_level", {
        header: "Dose",
        cell: (info) => (
          <DoseLabel level={info.getValue()} label={info.row.original.dose_label.split(",")[0]} />
        ),
      }),
      col.accessor("n", {
        header: "N",
        cell: (info) => <span>{info.getValue() ?? "\u2014"}</span>,
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
          const v = info.getValue();
          return (
            <span className="ev font-mono text-muted-foreground">
              {formatPValue(v)}
            </span>
          );
        },
      }),
      col.accessor("effect_size", {
        header: "Effect",
        cell: (info) => {
          const v = info.getValue();
          return (
            <span className="ev font-mono text-muted-foreground">
              {formatEffectSize(v)}
            </span>
          );
        },
      }),
      col.accessor("trend_p", {
        header: "Trend p",
        cell: (info) => {
          const v = info.getValue();
          return (
            <span className="ev font-mono text-muted-foreground">
              {formatPValue(v)}
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
      col.accessor("data_type", {
        header: "Method",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue() === "continuous" ? "Dunnett" : "Fisher"}
          </span>
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
      setActiveTab("evidence");
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

  const sexColors: Record<string, string> = { M: getSexColor("M"), F: getSexColor("F") };
  const totalEndpoints = endpointSummaries.length;

  return (
    <div className="flex h-full overflow-hidden max-[1200px]:flex-col">
      {/* ───── Endpoint Rail (left) ───── */}
      <div
        className="flex shrink-0 flex-col max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b"
        style={{ width: railWidth }}
      >
        {/* Rail header */}
        <div className="shrink-0 border-b px-2 py-1.5">
          <div className="mb-0.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
          <p className="mb-1.5 text-[10px] text-muted-foreground/60">by signal strength</p>
          <div className="flex items-center gap-1.5">
            <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search endpoints..."
              className="w-full bg-transparent py-1 text-xs focus:outline-none"
              value={railSearch}
              onChange={(e) => setRailSearch(e.target.value)}
            />
          </div>
          {bookmarkCount > 0 && (
            <button
              className={cn(
                "mt-1.5 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                bookmarkFilter
                  ? "border-amber-300 bg-amber-100 text-amber-800"
                  : "border-border text-muted-foreground hover:bg-accent/50"
              )}
              onClick={() => setBookmarkFilter(!bookmarkFilter)}
            >
              <Star className="h-2.5 w-2.5" fill={bookmarkFilter ? "currentColor" : "none"} />
              <span className="font-mono">{bookmarkCount}</span> bookmarked
            </button>
          )}
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate">{titleCase(group.organ_system)}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {group.endpoints.length}
                      </span>
                    </div>
                    {group.domains.length > 0 && (
                      <div className="flex gap-1.5">
                        {group.domains.map((d) => (
                          <DomainLabel key={d} domain={d} />
                        ))}
                      </div>
                    )}
                  </div>
                </button>

                {/* Endpoint items */}
                {isExpanded &&
                  group.endpoints.map((ep) => {
                    const isSelected = ep.endpoint_label === selectedEndpoint;
                    return (
                      <button
                        key={ep.endpoint_label}
                        className={cn(
                          "w-full border-b border-dashed border-l-2 px-3 py-1.5 text-left transition-colors",
                          isSelected ? "border-l-primary bg-blue-50/80 dark:bg-blue-950/30" : "border-l-transparent hover:bg-accent/30"
                        )}
                        data-rail-item=""
                        data-selected={isSelected || undefined}
                        onClick={() => selectEndpoint(ep.endpoint_label)}
                      >
                        {/* Row 1: name + bookmark + direction */}
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
                          <BookmarkStar
                            bookmarked={!!bookmarks[ep.endpoint_label]?.bookmarked}
                            onClick={() => toggleBookmark(ep.endpoint_label, !!bookmarks[ep.endpoint_label]?.bookmarked)}
                          />
                          {ep.direction && (
                            <span
                              className="text-xs text-muted-foreground"
                              title={ep.direction === "up" ? "Effect increases with dose" : ep.direction === "down" ? "Effect decreases with dose" : "Mixed direction across sexes/doses"}
                            >
                              {directionArrow(ep.direction)}
                            </span>
                          )}
                          {ep.sex_divergence != null && ep.sex_divergence > 0.5 && (
                            <span
                              className="text-[10px] font-semibold text-muted-foreground"
                              title={`Sex divergence: |d_M - d_F| = ${ep.sex_divergence.toFixed(2)} (${ep.divergent_sex} has larger effect)`}
                            >
                              {ep.divergent_sex === "M" ? "\u2642" : "\u2640"}{ep.divergent_sex}
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
                            "ev text-[10px] font-mono text-muted-foreground",
                            ep.min_trend_p != null && ep.min_trend_p < 0.01 ? "font-semibold" : ""
                          )}>
                            p={formatPValue(ep.min_trend_p)}
                          </span>
                          {ep.max_effect_size != null && (
                            <span className={cn(
                              "ev text-[10px] font-mono text-muted-foreground",
                              ep.max_effect_size >= 0.8 ? "font-semibold" : ""
                            )}>
                              |d|={ep.max_effect_size.toFixed(2)}
                            </span>
                          )}
                          {ep.min_n != null && (
                            <span className="text-[10px] font-mono text-muted-foreground/60">
                              n={ep.min_n}
                            </span>
                          )}
                          {ep.has_timecourse && (
                            <span className="text-[10px] text-muted-foreground/40" title="Temporal data available">
                              ◷
                            </span>
                          )}
                          {toxFindingAnnotations?.[ep.endpoint_label] &&
                           toxFindingAnnotations[ep.endpoint_label].treatmentRelated !== "Not Evaluated" && (
                            <span className="text-[10px] text-muted-foreground/40" title="Assessment complete">
                              ✓
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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5">
        {/* Summary header */}
        {selectedSummary ? (
          <div className="sticky top-0 z-10 shrink-0 border-b bg-background px-3 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{selectedSummary.endpoint_label}</h2>
                <p className="text-[11px] text-muted-foreground">
                  <DomainLabel domain={selectedSummary.domain} /> &middot; {titleCase(selectedSummary.organ_system)}
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
            {/* Compact metrics — font-weight emphasis only (Tier 3 evidence, no color at rest) */}
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
              <span>
                <span className="text-muted-foreground">Trend p: </span>
                <span className={cn(
                  "font-mono",
                  selectedSummary.min_trend_p != null && selectedSummary.min_trend_p < 0.01
                    ? "font-semibold"
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
                    ? "font-semibold"
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
                      ? "font-semibold"
                      : selectedSummary.max_effect_size >= 0.5
                        ? "font-medium" : ""
                  )}>
                    {selectedSummary.max_effect_size.toFixed(2)}
                  </span>
                </span>
              )}
              <span>
                <span className="text-muted-foreground">Data: </span>
                <span>{selectedSummary.data_type}</span>
              </span>
              {noaelSummary.length > 0 && (() => {
                // Show combined NOAEL, or first available
                const noael = noaelSummary.find((n) => n.sex === "Combined") ?? noaelSummary[0];
                return (
                  <span>
                    <span className="text-muted-foreground">NOAEL: </span>
                    <span className="font-mono">
                      {noael.noael_dose_value} {noael.noael_dose_unit}
                    </span>
                    <span className="text-muted-foreground/60"> (Dose {noael.noael_dose_level})</span>
                  </span>
                );
              })()}
              {selectedEndpoint && toxFindingAnnotations?.[selectedEndpoint] && (() => {
                const ann = toxFindingAnnotations[selectedEndpoint];
                // Only show if assessment has been started (not "Not Evaluated")
                if (ann.treatmentRelated === "Not Evaluated") return null;
                const trLabel = ann.treatmentRelated.toLowerCase();
                const advLabel = ann.adversity.toLowerCase();
                return (
                  <span>
                    <span className="text-muted-foreground">Assessed: </span>
                    <span>{trLabel}, {advLabel}</span>
                  </span>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-b px-3 py-1.5">
            <p className="text-xs text-muted-foreground">
              Select an endpoint from the list to view dose-response details.
            </p>
          </div>
        )}

        {/* Tab bar */}
        <ViewTabBar
          tabs={[
            { key: "evidence", label: "Evidence" },
            { key: "hypotheses", label: "Hypotheses" },
            { key: "metrics", label: "Metrics" },
          ]}
          value={activeTab}
          onChange={(k) => setActiveTab(k as typeof activeTab)}
          right={activeTab === "metrics" ? (
            <span className="mr-3 text-[10px] text-muted-foreground">
              {metricsData.length} of {drData?.length ?? 0} rows
            </span>
          ) : activeTab === "evidence" ? (
            <CollapseAllButtons onExpandAll={sectionExpandAll} onCollapseAll={sectionCollapseAll} />
          ) : undefined}
        />

        {/* Tab content */}
        <div className={cn("flex-1", activeTab === "evidence" ? "flex flex-col overflow-hidden" : "overflow-auto")}>
          {activeTab === "evidence" ? (
            <ChartOverviewContent
              chartData={chartData}
              selectedEndpoint={selectedEndpoint}
              pairwiseRows={pairwiseRows}
              sexColors={sexColors}
              studyId={studyId}
              selectedSummary={selectedSummary}
              onSubjectClick={onSubjectClick}
              noaelDoseLevel={noaelSummary.length > 0 ? (noaelSummary.find((n) => n.sex === "Combined") ?? noaelSummary[0]).noael_dose_level : null}
              expandGen={sectionExpandGen}
              collapseGen={sectionCollapseGen}
            />
          ) : activeTab === "metrics" ? (
            <MetricsTableContent
              table={table}
              metricsData={metricsData}
              metricsFilters={metricsFilters}
              setMetricsFilters={setMetricsFilters}
              sigOnly={sigOnly}
              setSigOnly={setSigOnly}
              organSystems={organSystems}
              selection={selection}
              handleRowClick={handleRowClick}
            />
          ) : (
            <HypothesesTabContent
              selectedEndpoint={selectedEndpoint}
              selectedSummary={selectedSummary}
              endpointSummaries={endpointSummaries}
              studyId={studyId}
              ruleResults={ruleResults}
              signalSummary={signalSummary}
              onSelectEndpoint={selectEndpoint}
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
    mergedPoints: MergedPoint[];
  } | null;
  selectedEndpoint: string | null;
  pairwiseRows: DoseResponseRow[];
  sexColors: Record<string, string>;
  studyId: string | undefined;
  selectedSummary: EndpointSummary | null;
  onSubjectClick?: (usubjid: string) => void;
  noaelDoseLevel?: number | null;
  expandGen?: number;
  collapseGen?: number;
}

function ChartOverviewContent({
  chartData,
  selectedEndpoint,
  pairwiseRows,
  sexColors,
  studyId,
  selectedSummary,
  onSubjectClick,
  noaelDoseLevel,
  expandGen,
  collapseGen,
}: ChartOverviewProps) {
  const chartRowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPct, setSplitPct] = useState(50); // default 50/50
  const sections = useAutoFitSections(containerRef, "dose-response", [
    { id: "charts", min: 120, max: 600, defaultHeight: 280 },
    { id: "timecourse", min: 80, max: 500, defaultHeight: 250 },
  ]);
  const chartsSection = sections[0];
  const tcSection = sections[1];

  const onChartResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const container = chartRowRef.current;
      if (!container) return;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const pct = ((ev.clientX - rect.left) / rect.width) * 100;
        setSplitPct(Math.max(20, Math.min(80, pct)));
      };
      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [],
  );

  if (!chartData || !selectedEndpoint) {
    return (
      <div className="flex items-center justify-center p-12 text-xs text-muted-foreground">
        Select an endpoint to view chart and overview.
      </div>
    );
  }

  const sexLabels: Record<string, string> = { M: "Males", F: "Females" };
  const hasEffect = chartData.sexes.some((s) =>
    chartData.mergedPoints.some((p) => p[`effect_${s}`] != null)
  );

  // Find NOAEL dose label for reference line
  const noaelLabel = noaelDoseLevel != null
    ? (chartData.mergedPoints.find((p) => p.dose_level === noaelDoseLevel) as Record<string, unknown> | undefined)?.dose_label as string | undefined
    : undefined;

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Chart area — two independent containers with resize handle */}
      <ViewSection
        mode="fixed"
        title="Charts"
        height={chartsSection.height}
        onResizePointerDown={chartsSection.onPointerDown}
        contentRef={chartsSection.contentRef}
        expandGen={expandGen}
        collapseGen={collapseGen}
      >
      <div ref={chartRowRef} className="flex h-full">
        {/* ── Dose-response chart container ── */}
        <div
          className="flex shrink-0 flex-col overflow-hidden px-2 py-1.5"
          style={{ width: hasEffect ? `${splitPct}%` : "100%" }}
        >
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {chartData.dataType === "continuous" ? "Mean \u00b1 SD by dose" : "Incidence by dose"}
          </div>
          {chartData.dataType === "continuous" ? (
            <EChartsWrapper
              option={buildDoseResponseLineOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, noaelLabel)}
              style={{ width: "100%", height: 220 }}
            />
          ) : (
            <EChartsWrapper
              option={buildIncidenceBarOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels, noaelLabel)}
              style={{ width: "100%", height: 220 }}
            />
          )}
          {/* Legend — dose-response */}
          <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
            {chartData.sexes.map((sex) => (
              <span key={sex} className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: sexColors[sex] ?? "#666" }} />
                {sexLabels[sex] ?? sex}
              </span>
            ))}
            {chartData.dataType === "continuous" && (
              <>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-gray-700 bg-gray-400" />
                  p&lt;0.05
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
                  NS
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Resize handle ── */}
        {hasEffect && <PanelResizeHandle onPointerDown={onChartResize} />}

        {/* ── Effect size chart container ── */}
        {hasEffect && (
          <div className="flex min-w-0 flex-1 flex-col px-2 py-1.5">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Effect size (Cohen&apos;s d)
            </div>
            <EChartsWrapper
              option={buildEffectSizeBarOption(chartData.mergedPoints, chartData.sexes, sexColors, sexLabels)}
              style={{ width: "100%", height: 220 }}
            />
            {/* Legend — effect size */}
            <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
              {chartData.sexes.map((sex) => (
                <span key={sex} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: sexColors[sex] ?? "#666" }} />
                  {sexLabels[sex] ?? sex}
                </span>
              ))}
              <span className="text-muted-foreground/60">d=0.5, 0.8</span>
            </div>
          </div>
        )}
      </div>
      </ViewSection>

      {/* Time-course — peer visualization, visible by default when data exists */}
      {selectedEndpoint && selectedSummary && (
        <TimecourseSection
          studyId={studyId}
          selectedEndpoint={selectedEndpoint}
          selectedSummary={selectedSummary}
          onSubjectClick={onSubjectClick}
          tcSectionHeight={tcSection.height}
          onTcSectionResize={tcSection.onPointerDown}
          tcContentRef={tcSection.contentRef}
          expandGen={expandGen}
          collapseGen={collapseGen}
        />
      )}

      {/* Pairwise comparison table */}
      {pairwiseRows.length > 0 && (
        <ViewSection
          mode="flex"
          title={`Pairwise comparison (${pairwiseRows.length})`}
          expandGen={expandGen}
          collapseGen={collapseGen}
        >
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dose</th>
                  <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sex</th>
                  <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mean</th>
                  <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SD</th>
                  <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">N</th>
                  <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">p-value</th>
                  <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Effect</th>
                  <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pattern</th>
                </tr>
              </thead>
              <tbody>
                {pairwiseRows.map((row, i) => (
                  <tr key={i} className="border-b border-dashed">
                    <td className="px-2 py-1">
                      <DoseLabel level={row.dose_level} label={row.dose_label.split(",")[0]} />
                    </td>
                    <td className="px-2 py-1">{row.sex}</td>
                    <td className="px-2 py-1 text-right font-mono">
                      {row.mean != null ? row.mean.toFixed(2) : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                      {row.sd != null ? row.sd.toFixed(2) : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right">{row.n ?? "\u2014"}</td>
                    <td className="px-2 py-1 text-right" data-evidence="">
                      <span className="ev font-mono">
                        {formatPValue(row.p_value)}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right" data-evidence="">
                      <span className="ev font-mono">
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
        </ViewSection>
      )}
    </div>
  );
}

// ─── Time-course section (collapsible, inside Evidence tab) ──

type YAxisMode = "absolute" | "pct_change" | "pct_vs_control";

interface TimecourseSectionProps {
  studyId: string | undefined;
  selectedEndpoint: string;
  selectedSummary: EndpointSummary;
  onSubjectClick?: (usubjid: string) => void;
  tcSectionHeight: number;
  onTcSectionResize: (e: React.PointerEvent) => void;
  tcContentRef?: React.RefObject<HTMLDivElement | null>;
  expandGen?: number;
  collapseGen?: number;
}

function TimecourseSection({ studyId, selectedEndpoint, selectedSummary, onSubjectClick, tcSectionHeight, onTcSectionResize, tcContentRef, expandGen, collapseGen }: TimecourseSectionProps) {
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>("absolute");
  const [showSubjects, setShowSubjects] = useState(false);

  const domain = selectedSummary.domain;
  const testCode = selectedSummary.test_code;
  const isContinuous = selectedSummary.data_type === "continuous";
  const isCL = domain === "CL";

  // Continuous temporal data
  const { data: tcData, isLoading: tcLoading, error: tcError } = useTimecourseGroup(
    isContinuous ? studyId : undefined,
    isContinuous ? domain : undefined,
    isContinuous ? testCode : undefined,
  );

  // Subject data: only fetch when toggle is ON and continuous
  const { data: subjData, isLoading: subjLoading } = useTimecourseSubject(
    showSubjects && isContinuous ? studyId : undefined,
    showSubjects && isContinuous ? domain : undefined,
    showSubjects && isContinuous ? testCode : undefined,
  );

  // CL temporal data
  const { data: clData, isLoading: clLoading } = useClinicalObservations(
    isCL ? studyId : undefined,
    isCL ? selectedEndpoint : undefined,
  );

  // Non-CL categorical endpoints have no temporal data — render nothing
  const hasTimecourse = isContinuous || isCL;
  if (!hasTimecourse) return null;

  const tcHeaderRight = (
    <div className="flex items-center gap-2">
      {isContinuous && (
        <div className="flex items-center gap-1">
          {(["absolute", "pct_change", "pct_vs_control"] as const).map((mode) => (
            <button
              key={mode}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                yAxisMode === mode
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
              onClick={() => setYAxisMode(mode)}
            >
              {{ absolute: "Absolute", pct_change: "% change", pct_vs_control: "% vs control" }[mode]}
            </button>
          ))}
        </div>
      )}
      {isContinuous && (
        <button
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            showSubjects
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-accent/50"
          )}
          onClick={() => setShowSubjects(!showSubjects)}
        >
          {subjLoading ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </span>
          ) : (
            "Show subjects"
          )}
        </button>
      )}
    </div>
  );

  return (
    <ViewSection
      mode="fixed"
      title="Time-course"
      height={tcSectionHeight}
      onResizePointerDown={onTcSectionResize}
      contentRef={tcContentRef}
      headerRight={tcHeaderRight}
      expandGen={expandGen}
      collapseGen={collapseGen}
    >
      {/* Continuous time-course */}
      {isContinuous && (
        <>
          {tcLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading time-course...</span>
            </div>
          ) : tcError || !tcData ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Time-course data not available for this endpoint.
            </div>
          ) : (
            <TimecourseCharts
              tcData={tcData}
              yAxisMode={yAxisMode}
              showSubjects={showSubjects}
              subjData={subjData ?? null}
              onSubjectClick={onSubjectClick}
            />
          )}
        </>
      )}

      {/* CL time-course */}
      {isCL && (
        <>
          {clLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading time-course...</span>
            </div>
          ) : !clData || clData.timecourse.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No temporal data available for this finding.
            </div>
          ) : (
            <CLTimecourseCharts
              clData={clData}
              finding={selectedEndpoint}
            />
          )}
        </>
      )}
    </ViewSection>
  );
}

/** Renders sex-faceted CL finding count bar charts from temporal data. */
function CLTimecourseCharts({
  clData,
  finding,
}: {
  clData: import("@/types/timecourse").CLTimecourseResponse;
  finding: string;
}) {
  // Determine sexes and dose levels
  const sexes = useMemo(() => {
    const s = new Set<string>();
    for (const tp of clData.timecourse) {
      for (const gc of tp.counts) s.add(gc.sex);
    }
    return [...s].sort();
  }, [clData]);

  const doseLevels = useMemo(() => {
    const d = new Map<number, string>();
    for (const tp of clData.timecourse) {
      for (const gc of tp.counts) {
        if (!d.has(gc.dose_level)) d.set(gc.dose_level, gc.dose_label);
      }
    }
    return [...d.entries()].sort((a, b) => a[0] - b[0]);
  }, [clData]);

  // Build chart data per sex: array of { day, dose_0, dose_1, ... }
  const chartsBySex = useMemo(() => {
    return sexes.map((sex) => {
      const points = clData.timecourse.map((tp) => {
        const point: Record<string, unknown> = { day: tp.day };
        for (const gc of tp.counts) {
          if (gc.sex !== sex) continue;
          const count = gc.findings[finding] ?? 0;
          const subjects = gc.subjects?.[finding] ?? [];
          point[`dose_${gc.dose_level}`] = count;
          point[`dose_${gc.dose_level}_total`] = gc.total_subjects;
          point[`dose_${gc.dose_level}_subjects`] = subjects.join(", ");
          point[`dose_${gc.dose_level}_label`] = gc.dose_label;
        }
        return point;
      });
      return { sex, points };
    });
  }, [sexes, clData, finding]);

  const sexLabels: Record<string, string> = { M: "Males", F: "Females" };

  return (
    <div>
      <div className="flex gap-2 border-b px-2 py-1.5">
        {chartsBySex.map(({ sex, points }) => (
          <div key={sex} className="flex-1 min-w-[300px]">
            <p className="mb-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {sexLabels[sex] ?? sex}
            </p>
            <EChartsWrapper
              option={buildCLTimecourseBarOption(points, doseLevels, getDoseGroupColor)}
              style={{ width: "100%", height: 180 }}
            />
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 px-2 py-1 text-[10px] text-muted-foreground">
        {doseLevels.map(([dl, label]) => (
          <span key={dl} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: getDoseGroupColor(dl) }}
            />
            {label.split(",")[0]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Renders sex-faceted time-course line charts with optional subject overlay. */
function TimecourseCharts({
  tcData,
  yAxisMode,
  showSubjects,
  subjData,
  onSubjectClick,
}: {
  tcData: TimecourseResponse;
  yAxisMode: YAxisMode;
  showSubjects: boolean;
  subjData: import("@/types/timecourse").TimecourseSubjectResponse | null;
  onSubjectClick?: (usubjid: string) => void;
}) {
  // Determine available sexes
  const sexes = useMemo(() => {
    const s = new Set<string>();
    for (const tp of tcData.timepoints) {
      for (const g of tp.groups) s.add(g.sex);
    }
    return [...s].sort();
  }, [tcData]);

  // Get unique dose levels
  const doseLevels = useMemo(() => {
    const d = new Set<number>();
    for (const tp of tcData.timepoints) {
      for (const g of tp.groups) d.add(g.dose_level);
    }
    return [...d].sort((a, b) => a - b);
  }, [tcData]);

  // Build baseline lookup: dose_level×sex → first timepoint mean (for % change / % vs control)
  const baselines = useMemo(() => {
    const map = new Map<string, number>();
    if (tcData.timepoints.length === 0) return map;
    const first = tcData.timepoints[0];
    for (const g of first.groups) {
      map.set(`${g.dose_level}_${g.sex}`, g.mean);
    }
    return map;
  }, [tcData]);

  // Control baseline per sex (for % vs control)
  const controlBaselines = useMemo(() => {
    const map = new Map<string, number>();
    if (tcData.timepoints.length === 0) return map;
    for (const tp of tcData.timepoints) {
      for (const g of tp.groups) {
        if (g.dose_level === 0 && !map.has(`${tp.day}_${g.sex}`)) {
          map.set(`${tp.day}_${g.sex}`, g.mean);
        }
      }
    }
    return map;
  }, [tcData]);

  // Subject baseline lookup: usubjid → first value (for % change)
  const subjectBaselines = useMemo(() => {
    const map = new Map<string, number>();
    if (!subjData) return map;
    for (const s of subjData.subjects) {
      if (s.values.length > 0) {
        // Sort by day and take the first
        const sorted = [...s.values].sort((a, b) => a.day - b.day);
        map.set(s.usubjid, sorted[0].value);
      }
    }
    return map;
  }, [subjData]);

  // Build chart data per sex
  const chartsBySex = useMemo(() => {
    return sexes.map((sex) => {
      const points = tcData.timepoints.map((tp) => {
        const point: Record<string, unknown> = { day: tp.day };
        for (const g of tp.groups) {
          if (g.sex !== sex) continue;
          let value = g.mean;
          let sd = g.sd;
          const key = `dose_${g.dose_level}`;

          if (yAxisMode === "pct_change") {
            const bl = baselines.get(`${g.dose_level}_${sex}`);
            if (bl && bl !== 0) {
              value = ((g.mean - bl) / bl) * 100;
              sd = (g.sd / bl) * 100;
            } else {
              value = 0;
              sd = 0;
            }
          } else if (yAxisMode === "pct_vs_control") {
            const ctrl = controlBaselines.get(`${tp.day}_${sex}`);
            if (ctrl && ctrl !== 0) {
              value = ((g.mean - ctrl) / ctrl) * 100;
              sd = (g.sd / ctrl) * 100;
            } else {
              value = 0;
              sd = 0;
            }
          }

          point[key] = Math.round(value * 100) / 100;
          point[`${key}_sd`] = Math.round(sd * 100) / 100;
          point[`${key}_n`] = g.n;
          point[`${key}_label`] = g.dose_label;
        }
        return point;
      });

      // Build subject traces for this sex
      const subjectTraces = showSubjects && subjData
        ? subjData.subjects
            .filter((s) => s.sex === sex)
            .map((s) => ({
              usubjid: s.usubjid,
              dose_level: s.dose_level,
              dose_label: s.dose_label,
              values: s.values.map((v) => {
                let val = v.value;
                if (yAxisMode === "pct_change") {
                  const bl = subjectBaselines.get(s.usubjid);
                  val = bl && bl !== 0 ? ((v.value - bl) / bl) * 100 : 0;
                } else if (yAxisMode === "pct_vs_control") {
                  const ctrl = controlBaselines.get(`${v.day}_${sex}`);
                  val = ctrl && ctrl !== 0 ? ((v.value - ctrl) / ctrl) * 100 : 0;
                }
                return { day: v.day, value: Math.round(val * 100) / 100 };
              }),
            }))
        : [];

      return { sex, points, subjectTraces };
    });
  }, [sexes, tcData, yAxisMode, baselines, controlBaselines, showSubjects, subjData, subjectBaselines]);

  // Y-axis label
  const yLabel = yAxisMode === "absolute"
    ? (tcData.unit || "Value")
    : yAxisMode === "pct_change"
      ? "% change from baseline"
      : "% vs control";

  // Baseline reference value (Day 1 control mean for absolute mode)
  const baselineRefValue = useMemo(() => {
    if (yAxisMode !== "absolute" || tcData.timepoints.length === 0) return null;
    const first = tcData.timepoints[0];
    const ctrl = first.groups.find((g) => g.dose_level === 0);
    return ctrl?.mean ?? null;
  }, [tcData, yAxisMode]);

  const sexLabels: Record<string, string> = { M: "Males", F: "Females" };
  return (
    <div>
      {/* Charts */}
      <div className="flex gap-2 border-b px-2 py-1.5">
        {chartsBySex.map(({ sex, points, subjectTraces }) => (
          <div key={sex} className="flex-1">
            <p className="mb-0.5 text-center text-[10px] font-medium" style={{ color: getSexColor(sex) }}>
              {sexLabels[sex] ?? sex}
            </p>
            <EChartsWrapper
              option={buildTimecourseLineOption(points, doseLevels, getDoseGroupColor, yLabel, baselineRefValue, yAxisMode, showSubjects, subjectTraces)}
              style={{ width: "100%", height: 240 }}
              onClick={(params) => {
                if (onSubjectClick && params.seriesName && subjectTraces.some((t: SubjectTrace) => t.usubjid === params.seriesName)) {
                  onSubjectClick(params.seriesName);
                }
              }}
            />
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 border-b px-2 py-1 text-[10px] text-muted-foreground">
        {doseLevels.map((dl) => {
          // Get label from first available timepoint
          const label = tcData.timepoints[0]?.groups.find((g) => g.dose_level === dl)?.dose_label ?? `Dose ${dl}`;
          return (
            <span key={dl} className="flex items-center gap-1">
              <span
                className="inline-block h-0.5 w-3 rounded"
                style={{ backgroundColor: getDoseGroupColor(dl) }}
              />
              {label}
            </span>
          );
        })}
        {yAxisMode === "absolute" && baselineRefValue != null && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t border-dashed border-gray-400" />
            Baseline
          </span>
        )}
      </div>

      {/* Subject count indicator */}
      {showSubjects && subjData && (
        <div className="px-4 py-1 text-center text-[10px] text-muted-foreground">
          Showing {subjData.subjects.length} subjects · Click a line to view subject profile
        </div>
      )}

      {/* Day-by-dose table below chart */}
      <TimecourseTable tcData={tcData} yAxisMode={yAxisMode} baselines={baselines} controlBaselines={controlBaselines} />
    </div>
  );
}

/** Compact day-by-dose comparison table below the time-course chart. */
function TimecourseTable({
  tcData,
  yAxisMode,
  baselines,
  controlBaselines,
}: {
  tcData: TimecourseResponse;
  yAxisMode: YAxisMode;
  baselines: Map<string, number>;
  controlBaselines: Map<string, number>;
}) {
  // Get dose levels and their labels
  const doseInfo = useMemo(() => {
    const map = new Map<number, string>();
    for (const tp of tcData.timepoints) {
      for (const g of tp.groups) {
        if (!map.has(g.dose_level)) map.set(g.dose_level, g.dose_label);
      }
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [tcData]);

  // Get sexes
  const sexes = useMemo(() => {
    const s = new Set<string>();
    for (const tp of tcData.timepoints) {
      for (const g of tp.groups) s.add(g.sex);
    }
    return [...s].sort();
  }, [tcData]);

  return (
    <div className="p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Day-by-dose detail
      </h3>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b bg-muted/50">
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Day
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sex
              </th>
              {doseInfo.map(([dl, label]) => (
                <th
                  key={dl}
                  className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {label.split(",")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tcData.timepoints.map((tp) =>
              sexes.map((sex, si) => {
                const groups = tp.groups.filter((g) => g.sex === sex);
                const allZero = groups.every((g) => g.mean === 0 && g.n === 0);

                return (
                  <tr
                    key={`${tp.day}_${sex}`}
                    className={cn(
                      "border-b border-dashed",
                      allZero && "text-muted-foreground/50",
                      si === 0 && sexes.length > 1 && "border-t border-border/60"
                    )}
                  >
                    {si === 0 ? (
                      <td className="px-2 py-1 text-right font-mono" rowSpan={sexes.length}>
                        {tp.day}
                      </td>
                    ) : null}
                    <td className="px-2 py-1 text-[10px]">{sex}</td>
                    {doseInfo.map(([dl]) => {
                      const g = groups.find((gg) => gg.dose_level === dl);
                      if (!g) return <td key={dl} className="px-2 py-1 text-right font-mono">&mdash;</td>;

                      let displayVal = g.mean;
                      if (yAxisMode === "pct_change") {
                        const bl = baselines.get(`${dl}_${sex}`);
                        displayVal = bl && bl !== 0 ? ((g.mean - bl) / bl) * 100 : 0;
                      } else if (yAxisMode === "pct_vs_control") {
                        const ctrl = controlBaselines.get(`${tp.day}_${sex}`);
                        displayVal = ctrl && ctrl !== 0 ? ((g.mean - ctrl) / ctrl) * 100 : 0;
                      }

                      return (
                        <td key={dl} className="px-2 py-1 text-right font-mono text-[11px]">
                          {displayVal.toFixed(1)}
                          <span className="ml-0.5 text-[9px] text-muted-foreground">
                            {"\u00b1"}{g.sd.toFixed(1)}
                          </span>
                          <span className="ml-1 text-[9px] text-muted-foreground/60">
                            n={g.n}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
  sigOnly: boolean;
  setSigOnly: React.Dispatch<React.SetStateAction<boolean>>;
  organSystems: string[];
  selection: DoseResponseSelection | null;
  handleRowClick: (row: DoseResponseRow) => void;
}

function MetricsTableContent({
  table,
  metricsData,
  metricsFilters,
  setMetricsFilters,
  sigOnly,
  setSigOnly,
  organSystems,
  selection,
  handleRowClick,
}: MetricsTableProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <FilterBar className="flex-wrap">
        <FilterSelect
          value={metricsFilters.sex ?? ""}
          onChange={(e) => setMetricsFilters((f) => ({ ...f, sex: e.target.value || null }))}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </FilterSelect>
        <FilterSelect
          value={metricsFilters.data_type ?? ""}
          onChange={(e) => setMetricsFilters((f) => ({ ...f, data_type: e.target.value || null }))}
        >
          <option value="">All data types</option>
          <option value="continuous">Continuous</option>
          <option value="categorical">Categorical</option>
        </FilterSelect>
        <FilterSelect
          value={metricsFilters.organ_system ?? ""}
          onChange={(e) => setMetricsFilters((f) => ({ ...f, organ_system: e.target.value || null }))}
        >
          <option value="">All organs</option>
          {organSystems.map((os) => (
            <option key={os} value={os}>
              {titleCase(os)}
            </option>
          ))}
        </FilterSelect>
        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={sigOnly}
            onChange={(e) => setSigOnly(e.target.checked)}
            className="h-3 w-3 rounded border-gray-300"
          />
          p &lt; 0.05
        </label>
        <FilterBarCount>{metricsData.length} rows</FilterBarCount>
      </FilterBar>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="text-xs" style={{ width: table.getCenterTotalSize(), tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/50">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="relative cursor-pointer px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
                    style={{ width: header.getSize() }}
                    onDoubleClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " \u2191", desc: " \u2193" }[header.column.getIsSorted() as string] ?? ""}
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
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1" style={{ width: cell.column.getSize() }} data-evidence="">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
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

// ─── Hypotheses Tab ─────────────────────────────────────────

type HypothesisIntent = "shape" | "model" | "pareto" | "correlation" | "outliers" | "causality";

interface HypothesisTool {
  value: HypothesisIntent;
  label: string;
  icon: typeof TrendingUp;
  available: boolean;
  description: string;
}

const HYPOTHESIS_TOOLS: HypothesisTool[] = [
  { value: "shape", label: "Shape", icon: TrendingUp, available: true, description: "Interactive dose-response curve" },
  { value: "model", label: "Model fit", icon: GitBranch, available: false, description: "Fit models to dose-response data" },
  { value: "pareto", label: "Pareto front", icon: ScatterChart, available: true, description: "Effect size vs. significance trade-offs" },
  { value: "correlation", label: "Correlation", icon: Link2, available: false, description: "Co-movement between endpoints" },
  { value: "outliers", label: "Outliers", icon: BoxSelect, available: false, description: "Distribution and outlier detection" },
  { value: "causality", label: "Causality", icon: Scale, available: true, description: "Bradford Hill causal assessment" },
];

const DEFAULT_FAVORITES: HypothesisIntent[] = ["shape", "pareto"];

interface HypothesesTabProps {
  selectedEndpoint: string | null;
  selectedSummary: EndpointSummary | null;
  endpointSummaries: EndpointSummary[];
  studyId: string | undefined;
  ruleResults: RuleResult[];
  signalSummary: SignalSummaryRow[];
  onSelectEndpoint?: (label: string) => void;
}

function HypothesesTabContent({ selectedEndpoint, selectedSummary, endpointSummaries, studyId, ruleResults, signalSummary, onSelectEndpoint }: HypothesesTabProps) {
  const [intent, setIntent] = useState<HypothesisIntent>("shape");
  const [favorites, setFavorites] = useState<HypothesisIntent[]>(DEFAULT_FAVORITES);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tool: HypothesisIntent } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown and context menu on outside click
  useEffect(() => {
    if (!dropdownOpen && !contextMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
        setDropdownSearch("");
      }
      if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, contextMenu]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (dropdownOpen) searchInputRef.current?.focus();
  }, [dropdownOpen]);

  const toggleFavorite = useCallback((tool: HypothesisIntent) => {
    setFavorites((prev) =>
      prev.includes(tool) ? prev.filter((f) => f !== tool) : [...prev, tool]
    );
  }, []);

  const filteredTools = useMemo(() => {
    if (!dropdownSearch) return HYPOTHESIS_TOOLS;
    const q = dropdownSearch.toLowerCase();
    return HYPOTHESIS_TOOLS.filter(
      (t) => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [dropdownSearch]);

  const favTools = useMemo(
    () => favorites.map((f) => HYPOTHESIS_TOOLS.find((t) => t.value === f)!).filter(Boolean),
    [favorites]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: favorite pills + tool dropdown */}
      <div className="flex items-center gap-1 border-b bg-muted/20 px-4 py-1.5">
        {/* Favorite pills */}
        {favTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.value}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                intent === tool.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              onClick={() => setIntent(tool.value)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, tool: tool.value });
              }}
            >
              <Icon className="h-3 w-3" />
              {tool.label}
            </button>
          );
        })}

        {/* Add tool dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => { setDropdownOpen(!dropdownOpen); setDropdownSearch(""); }}
            title="Browse tools"
          >
            <Plus className="h-3 w-3" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg">
              {/* Search */}
              <div className="border-b px-2 py-1.5">
                <div className="relative">
                  <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    className="w-full rounded border-none bg-transparent py-0.5 pl-6 pr-2 text-xs outline-none placeholder:text-muted-foreground/50"
                    placeholder="Search tools..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Tool list */}
              <div className="max-h-48 overflow-y-auto py-1">
                {filteredTools.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching tools</p>
                )}
                {filteredTools.map((tool) => {
                  const Icon = tool.icon;
                  const isFav = favorites.includes(tool.value);
                  return (
                    <button
                      key={tool.value}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
                      onClick={() => {
                        setIntent(tool.value);
                        if (!favorites.includes(tool.value)) {
                          setFavorites((prev) => [...prev, tool.value]);
                        }
                        setDropdownOpen(false);
                        setDropdownSearch("");
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setDropdownOpen(false);
                        setDropdownSearch("");
                        setContextMenu({ x: e.clientX, y: e.clientY, tool: tool.value });
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{tool.label}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{tool.description}</div>
                      </div>
                      {isFav && <Pin className="h-3 w-3 shrink-0 fill-muted-foreground/50 text-muted-foreground/50" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <span className="ml-auto text-[10px] italic text-muted-foreground">
          {intent === "causality" ? "Persists assessment" : "Does not affect conclusions"}
        </span>
      </div>

      {/* Context menu for favorite toggle */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] rounded-md border bg-popover py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              toggleFavorite(contextMenu.tool);
              setContextMenu(null);
            }}
          >
            <Pin className={cn("h-3 w-3", favorites.includes(contextMenu.tool) ? "fill-current text-muted-foreground" : "text-muted-foreground/40")} />
            {favorites.includes(contextMenu.tool) ? "Remove from favorites" : "Add to favorites"}
          </button>
        </div>
      )}

      {/* Intent content */}
      <div className="flex-1 overflow-auto p-4">
        {intent === "shape" && (
          <ShapePlaceholder selectedEndpoint={selectedEndpoint} selectedSummary={selectedSummary} />
        )}
        {intent === "model" && <ModelPlaceholder />}
        {intent === "pareto" && (
          <VolcanoScatter endpointSummaries={endpointSummaries} selectedEndpoint={selectedEndpoint} onSelectEndpoint={onSelectEndpoint} />
        )}
        {intent === "correlation" && <CorrelationPlaceholder />}
        {intent === "outliers" && (
          <OutliersPlaceholder selectedEndpoint={selectedEndpoint} selectedSummary={selectedSummary} />
        )}
        {intent === "causality" && (
          <CausalityWorksheet
            studyId={studyId}
            selectedEndpoint={selectedEndpoint}
            selectedSummary={selectedSummary}
            ruleResults={ruleResults}
            signalSummary={signalSummary}
          />
        )}
      </div>
    </div>
  );
}

// ─── Hypotheses placeholders ────────────────────────────────

/** Compact chart placeholder area with viewer type label */
function ViewerPlaceholder({
  icon: Icon,
  viewerType,
  context,
}: {
  icon: typeof TrendingUp;
  viewerType: string;
  context?: string;
}) {
  return (
    <div className="flex h-28 items-center justify-center rounded-md border bg-muted/30">
      <div className="text-center">
        <Icon className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/25" />
        <p className="text-[11px] text-muted-foreground/50">{viewerType}</p>
        {context && (
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/35">{context}</p>
        )}
      </div>
    </div>
  );
}

/** Compact key-value config line */
function ConfigLine({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
      {items.map(([k, v]) => (
        <span key={k}>
          <span className="text-muted-foreground">{k}: </span>
          <span className="font-mono text-foreground/70">{v}</span>
        </span>
      ))}
    </div>
  );
}

/** Note for intents that require production infrastructure */
function ProductionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] italic text-muted-foreground/60">{children}</p>
  );
}

function ShapePlaceholder({
  selectedEndpoint,
  selectedSummary,
}: {
  selectedEndpoint: string | null;
  selectedSummary: EndpointSummary | null;
}) {
  return (
    <div className="space-y-3">
      <ViewerPlaceholder
        icon={TrendingUp}
        viewerType="DG Line Chart"
        context={selectedEndpoint
          ? `${selectedEndpoint}${selectedSummary ? ` \u00b7 ${titleCase(selectedSummary.organ_system)}` : ""}`
          : undefined}
      />

      <p className="text-xs text-muted-foreground">
        Same dose-response chart as Evidence, with full interactivity: zoom, pan, brush selection,
        and per-sex series toggling. No static annotations or significance encoding.
      </p>

      <div className="rounded-md border bg-card px-2 py-1.5">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <ConfigLine items={[
          ["X", "dose_group"],
          ["Y", "mean"],
          ["Split", "sex"],
          ["Error bars", "\u00b1SD"],
          ["Interpolation", "linear"],
        ]} />
        <div className="mt-1.5">
          <ConfigLine items={[
            ["Zoom/Pan", "enabled"],
            ["Brush", "enabled"],
            ["Tooltip", "dose, value, sex, mean, sd, n"],
          ]} />
        </div>
      </div>
    </div>
  );
}

function ModelPlaceholder() {
  return (
    <div className="space-y-3">
      <ViewerPlaceholder icon={GitBranch} viewerType="DG Line Chart + fit overlay" />

      <p className="text-xs text-muted-foreground">
        Fit dose-response models to observed data with goodness-of-fit metrics.
        Model parameters are session-scoped and never stored as authoritative.
      </p>

      <div className="rounded-md border bg-card px-2 py-1.5">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Available models</p>
        <div className="flex flex-wrap gap-1.5">
          {["Linear", "4PL sigmoid", "Emax", "Polynomial (2-3)"].map((m) => (
            <span key={m} className="rounded border px-1.5 py-0.5 text-[10px] text-foreground/70">{m}</span>
          ))}
        </div>
        <div className="mt-2">
          <ConfigLine items={[
            ["Metrics", "R\u00b2, AIC, residual plot"],
            ["Backend", "scipy.optimize.curve_fit()"],
            ["State", "session-scoped"],
          ]} />
        </div>
      </div>

      <ProductionNote>
        Requires Datagrok compute backend for scipy curve fitting. Available in production.
      </ProductionNote>
    </div>
  );
}

/** Deterministic hue for organ system names (pastel-ish, well-spaced). */
const ORGAN_COLORS: Record<string, string> = {};
function getOrganColor(organ: string): string {
  if (ORGAN_COLORS[organ]) return ORGAN_COLORS[organ];
  // Golden-angle hue spacing seeded by organ string hash
  let h = 0;
  for (let i = 0; i < organ.length; i++) h = (h * 31 + organ.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  const color = `hsl(${hue}, 55%, 50%)`;
  ORGAN_COLORS[organ] = color;
  return color;
}

function VolcanoScatter({
  endpointSummaries,
  selectedEndpoint,
  onSelectEndpoint,
}: {
  endpointSummaries: EndpointSummary[];
  selectedEndpoint: string | null;
  onSelectEndpoint?: (label: string) => void;
}) {
  const points = useMemo<VolcanoPoint[]>(() => {
    return endpointSummaries
      .filter((ep) => ep.max_effect_size != null && ep.min_trend_p != null && ep.min_trend_p > 0)
      .map((ep) => ({
        endpoint_label: ep.endpoint_label,
        organ_system: ep.organ_system,
        x: Math.abs(ep.max_effect_size!),
        y: -Math.log10(ep.min_trend_p!),
        color: getOrganColor(ep.organ_system),
      }));
  }, [endpointSummaries]);

  const organSystems = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of points) seen.set(p.organ_system, p.color);
    return [...seen.entries()];
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
        No endpoints with both effect size and trend p-value.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] text-muted-foreground">
          {points.length} endpoints &middot; click to select
        </p>
        {selectedEndpoint && (
          <p className="text-[10px] text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{selectedEndpoint}</span>
          </p>
        )}
      </div>

      <EChartsWrapper
        option={buildVolcanoScatterOption(points, selectedEndpoint, organSystems)}
        style={{ width: "100%", height: 260 }}
        onClick={(params) => {
          if (params.name && onSelectEndpoint) {
            onSelectEndpoint(String(params.name));
          }
        }}
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
        {organSystems.map(([os, color]) => (
          <span key={os} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {titleCase(os)}
          </span>
        ))}
      </div>
    </div>
  );
}

function CorrelationPlaceholder() {
  return (
    <div className="space-y-3">
      <ViewerPlaceholder icon={Link2} viewerType="DG Scatter Plot" />

      <p className="text-xs text-muted-foreground">
        Select two endpoints from the same organ system to visualize co-movement across subjects.
        Determines whether signals are independent or share an underlying mechanism.
      </p>

      <div className="rounded-md border bg-card px-2 py-1.5">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <ConfigLine items={[
          ["X", "endpoint A (per subject)"],
          ["Y", "endpoint B (per subject)"],
          ["Color", "dose_group"],
          ["Shape", "sex"],
        ]} />
        <div className="mt-1.5">
          <ConfigLine items={[
            ["Statistics", "Pearson r, Spearman \u03C1, regression line"],
            ["Data", "subject-level (raw, not aggregated)"],
          ]} />
        </div>
      </div>

      <ProductionNote>
        Requires subject-level cross-endpoint data. Available in production via DG DataFrame joining.
      </ProductionNote>
    </div>
  );
}

function OutliersPlaceholder({
  selectedEndpoint,
  selectedSummary,
}: {
  selectedEndpoint: string | null;
  selectedSummary: EndpointSummary | null;
}) {
  return (
    <div className="space-y-3">
      <ViewerPlaceholder
        icon={BoxSelect}
        viewerType="DG Box Plot"
        context={selectedEndpoint
          ? `${selectedEndpoint}${selectedSummary ? ` \u00b7 ${selectedSummary.sexes.join(", ")}` : ""}`
          : undefined}
      />

      <p className="text-xs text-muted-foreground">
        Box plots per dose group with individual data points (jitter overlay).
        Distinguishes outlier-driven signals from consistent group shifts.
      </p>

      <div className="rounded-md border bg-card px-2 py-1.5">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <ConfigLine items={[
          ["X", "dose_group"],
          ["Y", "endpoint value (per subject)"],
          ["Category", "sex"],
          ["Jitter", "semi-transparent points"],
        ]} />
        <div className="mt-1.5">
          <ConfigLine items={[
            ["Outlier rule", ">1.5 IQR"],
            ["Tooltip", "USUBJID, value, dose, sex"],
            ["Data", "subject-level (raw, not aggregated)"],
          ]} />
        </div>
      </div>

      <ProductionNote>
        Requires subject-level values. Available in production via raw domain endpoint.
      </ProductionNote>
    </div>
  );
}

// ─── Causality Worksheet ──────────────────────────────────────

const STRENGTH_LABELS: Record<number, string> = {
  0: "Not assessed",
  1: "Weak",
  2: "Weak-moderate",
  3: "Moderate",
  4: "Strong",
  5: "Very strong",
};

const STRENGTH_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

function DotGauge({ level }: { level: 0 | 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            i <= level ? "bg-foreground/70" : "bg-foreground/15"
          )}
        />
      ))}
    </span>
  );
}

interface CausalAssessment {
  overrides: Record<string, { level: number; justification: string }>;
  expert: Record<string, { level: number; rationale: string }>;
  overall: string;
  comment: string;
}

const EXPERT_CRITERIA = [
  { key: "temporality", label: "Temporality", guidance: "Is the timing of onset consistent with treatment exposure? Consider recovery group data if available." },
  { key: "biological_plausibility", label: "Biological plausibility", guidance: "Is there a known biological mechanism? Reference published literature or compound class effects." },
  { key: "experiment", label: "Experiment", guidance: "Do the controlled study conditions support a causal interpretation? Consider study design adequacy." },
  { key: "analogy", label: "Analogy", guidance: "Do similar compounds in the same class produce similar effects?" },
] as const;

function computeBiologicalGradient(ep: EndpointSummary): { level: 0 | 1 | 2 | 3 | 4 | 5; evidence: string } {
  const pattern = ep.dose_response_pattern;
  let base = 1;
  if (pattern === "monotonic_increase" || pattern === "monotonic_decrease") base = 4;
  else if (pattern === "threshold") base = 3;
  else if (pattern === "non_monotonic") base = 2;

  if (ep.min_trend_p != null && ep.min_trend_p < 0.01) base = Math.min(base + 1, 5);

  const patternLabel = pattern.replace(/_/g, " ");
  const trendText = ep.min_trend_p != null ? ` · trend p ${ep.min_trend_p < 0.001 ? "< 0.001" : `= ${ep.min_trend_p.toFixed(3)}`}` : "";
  return { level: base as 0 | 1 | 2 | 3 | 4 | 5, evidence: `${patternLabel}${trendText}` };
}

function computeStrength(ep: EndpointSummary): { level: 0 | 1 | 2 | 3 | 4 | 5; evidence: string } {
  const d = ep.max_effect_size != null ? Math.abs(ep.max_effect_size) : 0;
  let level: 0 | 1 | 2 | 3 | 4 | 5;
  if (d >= 1.2) level = 5;
  else if (d >= 0.8) level = 4;
  else if (d >= 0.5) level = 3;
  else if (d >= 0.2) level = 2;
  else level = 1;

  const pText = ep.min_p_value != null ? ` · p ${ep.min_p_value < 0.001 ? "< 0.001" : `= ${ep.min_p_value.toFixed(3)}`}` : "";
  return { level, evidence: `|d| = ${d.toFixed(2)}${pText}` };
}

function computeConsistency(ep: EndpointSummary): { level: 0 | 1 | 2 | 3 | 4 | 5; evidence: string } {
  const both = ep.sexes.length >= 2;
  return {
    level: both ? 4 : 2,
    evidence: both ? `Both sexes affected (${ep.sexes.join(", ")})` : `${ep.sexes[0] === "M" ? "Males" : "Females"} only`,
  };
}

function computeSpecificity(ep: EndpointSummary, signalSummary: SignalSummaryRow[]): { level: 0 | 1 | 2 | 3 | 4 | 5; evidence: string } {
  // Count distinct organ systems with signals for this endpoint label
  const organs = new Set<string>();
  for (const s of signalSummary) {
    if (s.endpoint_label === ep.endpoint_label && s.signal_score > 0) {
      organs.add(s.organ_system);
    }
  }
  const count = Math.max(organs.size, 1); // at least the current organ
  let level: 0 | 1 | 2 | 3 | 4 | 5;
  if (count === 1) level = 4;
  else if (count === 2) level = 3;
  else if (count === 3) level = 2;
  else level = 1;

  const organList = organs.size > 0 ? ` (${[...organs].map(titleCase).join(", ")})` : "";
  return { level, evidence: `Signals in ${count} organ system${count !== 1 ? "s" : ""}${organList}` };
}

function computeCoherence(ep: EndpointSummary, ruleResults: RuleResult[]): { level: 0 | 1 | 2 | 3 | 4 | 5; evidence: string } {
  // Count R16 rules where organ_system matches
  const r16Count = ruleResults.filter(
    (r) => r.rule_id === "R16" && r.organ_system === ep.organ_system
  ).length;

  let level: 0 | 1 | 2 | 3 | 4 | 5;
  if (r16Count >= 3) level = 4;
  else if (r16Count >= 1) level = 3;
  else level = 1;

  return {
    level,
    evidence: r16Count > 0
      ? `${r16Count} correlated endpoint${r16Count !== 1 ? "s" : ""} in ${titleCase(ep.organ_system)} (R16 rules)`
      : `No correlated endpoints in ${titleCase(ep.organ_system)}`,
  };
}

function CausalityWorksheet({
  studyId,
  selectedEndpoint,
  selectedSummary,
  ruleResults,
  signalSummary,
}: {
  studyId: string | undefined;
  selectedEndpoint: string | null;
  selectedSummary: EndpointSummary | null;
  ruleResults: RuleResult[];
  signalSummary: SignalSummaryRow[];
}) {
  // Load saved annotations for this study
  const { data: savedAnnotations } = useAnnotations<CausalAssessment>(studyId, "causal-assessment");
  const saveMutation = useSaveAnnotation<CausalAssessment>(studyId, "causal-assessment");

  // Local form state
  const [overrides, setOverrides] = useState<Record<string, { level: number; justification: string }>>({});
  const [expert, setExpert] = useState<Record<string, { level: number; rationale: string }>>({});
  const [overall, setOverall] = useState("Not assessed");
  const [comment, setComment] = useState("");
  const [editingOverride, setEditingOverride] = useState<string | null>(null);
  const [expandedGuidance, setExpandedGuidance] = useState<Set<string>>(new Set());
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Load saved data when endpoint changes
  useEffect(() => {
    if (!selectedEndpoint || !savedAnnotations) {
      setOverrides({});
      setExpert({});
      setOverall("Not assessed");
      setComment("");
      setLastSaved(null);
      setDirty(false);
      return;
    }
    const saved = savedAnnotations[selectedEndpoint];
    if (saved) {
      setOverrides(saved.overrides ?? {});
      setExpert(saved.expert ?? {});
      setOverall(saved.overall ?? "Not assessed");
      setComment(saved.comment ?? "");
      setLastSaved("Previously saved");
    } else {
      setOverrides({});
      setExpert({});
      setOverall("Not assessed");
      setComment("");
      setLastSaved(null);
    }
    setDirty(false);
  }, [selectedEndpoint, savedAnnotations]);

  // Empty state
  if (!selectedEndpoint || !selectedSummary) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an endpoint to assess causality.
      </div>
    );
  }

  // Compute auto-populated criteria
  const gradient = computeBiologicalGradient(selectedSummary);
  const strength = computeStrength(selectedSummary);
  const consistency = computeConsistency(selectedSummary);
  const specificity = computeSpecificity(selectedSummary, signalSummary);
  const coherence = computeCoherence(selectedSummary, ruleResults);

  const computedCriteria = [
    { key: "biological_gradient", label: "Biological gradient", ...gradient },
    { key: "strength", label: "Strength of association", ...strength },
    { key: "consistency", label: "Consistency", ...consistency },
    { key: "specificity", label: "Specificity", ...specificity },
    { key: "coherence", label: "Coherence", ...coherence },
  ];

  const handleSave = () => {
    if (!studyId || !selectedEndpoint) return;
    const payload: CausalAssessment = { overrides, expert, overall, comment };
    saveMutation.mutate(
      { entityKey: selectedEndpoint, data: payload },
      {
        onSuccess: () => {
          setLastSaved(`User · ${new Date().toLocaleDateString()}`);
          setDirty(false);
        },
        onError: () => {
          setLastSaved("Save failed");
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold">Causality: {selectedSummary.endpoint_label}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <DomainLabel domain={selectedSummary.domain} />
          {" · "}
          {titleCase(selectedSummary.organ_system)}
        </p>
      </div>

      {/* Computed evidence section */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Computed evidence
        </p>
        <div className="rounded-md border">
          {computedCriteria.map((c, idx) => {
            const override = overrides[c.key];
            const isEditing = editingOverride === c.key;
            const displayLevel = (override ? override.level : c.level) as 0 | 1 | 2 | 3 | 4 | 5;

            return (
              <div key={c.key} className={cn("px-3 py-2.5", idx < computedCriteria.length - 1 && "border-b")}>
                {/* Label + gauge + strength + override toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{c.label}</span>
                  <div className="flex items-center gap-2">
                    {override && (
                      <span className="text-[9px] text-muted-foreground">(overridden)</span>
                    )}
                    <DotGauge level={displayLevel} />
                    <span className="w-20 text-right text-[10px] font-medium text-muted-foreground">
                      {STRENGTH_LABELS[displayLevel]}
                    </span>
                    <button
                      className="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                      title="Override computed score"
                      onClick={() => {
                        if (isEditing) {
                          setEditingOverride(null);
                        } else {
                          setEditingOverride(c.key);
                          if (!override) {
                            setOverrides((prev) => ({ ...prev, [c.key]: { level: c.level, justification: "" } }));
                            setDirty(true);
                          }
                        }
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Evidence line */}
                <p className="mt-0.5 text-[10px] text-muted-foreground">{c.evidence}</p>

                {/* Override editor */}
                {isEditing && (
                  <div className="mt-2 space-y-1.5 rounded border bg-muted/20 p-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-muted-foreground">Override:</label>
                      <select
                        className="rounded border bg-background px-1.5 py-0.5 text-xs"
                        value={override?.level ?? c.level}
                        onChange={(e) => {
                          const level = Number(e.target.value);
                          setOverrides((prev) => ({
                            ...prev,
                            [c.key]: { ...prev[c.key], level, justification: prev[c.key]?.justification ?? "" },
                          }));
                          setDirty(true);
                        }}
                      >
                        {STRENGTH_OPTIONS.map((v) => (
                          <option key={v} value={v}>{STRENGTH_LABELS[v]}</option>
                        ))}
                      </select>
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setOverrides((prev) => {
                            const next = { ...prev };
                            delete next[c.key];
                            return next;
                          });
                          setEditingOverride(null);
                          setDirty(true);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <textarea
                      className="w-full rounded border px-2 py-1.5 text-xs"
                      rows={2}
                      placeholder="Reason for override..."
                      value={override?.justification ?? ""}
                      onChange={(e) => {
                        setOverrides((prev) => ({
                          ...prev,
                          [c.key]: { ...prev[c.key], level: prev[c.key]?.level ?? c.level, justification: e.target.value },
                        }));
                        setDirty(true);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expert assessment section */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Expert assessment
        </p>
        <div className="rounded-md border">
          {EXPERT_CRITERIA.map((c, idx) => {
            const val = expert[c.key] ?? { level: 0, rationale: "" };
            const isGuidanceOpen = expandedGuidance.has(c.key);

            return (
              <div key={c.key} className={cn("px-3 py-2.5", idx < EXPERT_CRITERIA.length - 1 && "border-b")}>
                {/* Label + help toggle */}
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium">{c.label}</span>
                  <button
                    className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                    title="Show guidance"
                    onClick={() => {
                      setExpandedGuidance((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.key)) next.delete(c.key);
                        else next.add(c.key);
                        return next;
                      });
                    }}
                  >
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </div>

                {/* Dot gauge + dropdown */}
                <div className="mt-1 flex items-center gap-2">
                  <DotGauge level={val.level as 0 | 1 | 2 | 3 | 4 | 5} />
                  <select
                    className="rounded border bg-background px-1.5 py-0.5 text-xs"
                    value={val.level}
                    onChange={(e) => {
                      const level = Number(e.target.value);
                      setExpert((prev) => ({
                        ...prev,
                        [c.key]: { ...prev[c.key], level, rationale: prev[c.key]?.rationale ?? "" },
                      }));
                      setDirty(true);
                    }}
                  >
                    {STRENGTH_OPTIONS.map((v) => (
                      <option key={v} value={v}>{STRENGTH_LABELS[v]}</option>
                    ))}
                  </select>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {STRENGTH_LABELS[val.level as keyof typeof STRENGTH_LABELS] ?? "Not assessed"}
                  </span>
                </div>

                {/* Guidance text */}
                {isGuidanceOpen && (
                  <p className="mt-0.5 text-[10px] italic text-muted-foreground">{c.guidance}</p>
                )}

                {/* Rationale text area */}
                <textarea
                  className="mt-1 w-full rounded border px-2 py-1.5 text-xs"
                  rows={2}
                  placeholder="Notes..."
                  value={val.rationale}
                  onChange={(e) => {
                    setExpert((prev) => ({
                      ...prev,
                      [c.key]: { ...prev[c.key], level: prev[c.key]?.level ?? 0, rationale: e.target.value },
                    }));
                    setDirty(true);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall assessment section */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Overall assessment
        </p>
        <div className="rounded-md border px-3 py-2.5">
          <div className="flex flex-col gap-1.5">
            {["Likely causal", "Possibly causal", "Unlikely causal", "Not assessed"].map((opt) => (
              <label key={opt} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="overall-assessment"
                  className="accent-primary"
                  checked={overall === opt}
                  onChange={() => {
                    setOverall(opt);
                    setDirty(true);
                  }}
                />
                {opt}
              </label>
            ))}
          </div>

          <textarea
            className="mt-2 w-full rounded border px-2 py-1.5 text-xs"
            rows={2}
            placeholder="Overall assessment notes..."
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setDirty(true);
            }}
          />

          {/* Save button + footer */}
          <div className="mt-3 flex items-center justify-between">
            <button
              className={cn(
                "rounded bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase text-primary-foreground transition-colors hover:bg-primary/90",
                (!dirty || saveMutation.isPending) && "cursor-not-allowed opacity-50"
              )}
              disabled={!dirty || saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? "Saving..." : "SAVE"}
            </button>
            {lastSaved && (
              <span className="text-[10px] text-muted-foreground">{lastSaved}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
