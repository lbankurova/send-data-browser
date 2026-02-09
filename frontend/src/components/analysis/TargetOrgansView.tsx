import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useOrganEvidenceDetail } from "@/hooks/useOrganEvidenceDetail";
import { cn } from "@/lib/utils";
import {
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  getDomainBadgeColor,
  titleCase,
} from "@/lib/severity-colors";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import type { TargetOrganRow, OrganEvidenceRow } from "@/types/analysis-views";

export interface OrganSelection {
  organ_system: string;
  endpoint_label?: string;
  sex?: string;
}

// ---------------------------------------------------------------------------
// OrganListItem — enriched rail item with evidence bar + stats
// ---------------------------------------------------------------------------

function OrganListItem({
  organ,
  isSelected,
  maxEvidenceScore,
  onClick,
}: {
  organ: TargetOrganRow;
  isSelected: boolean;
  maxEvidenceScore: number;
  onClick: () => void;
}) {
  const barWidth = maxEvidenceScore > 0
    ? Math.max(4, (organ.evidence_score / maxEvidenceScore) * 100)
    : 0;

  return (
    <button
      className={cn(
        "w-full text-left border-b border-border/40 px-3 py-2.5 transition-colors",
        organ.target_organ_flag
          ? "border-l-2 border-l-[#DC2626]"
          : "border-l-2 border-l-transparent",
        isSelected
          ? "bg-blue-50/60 dark:bg-blue-950/20"
          : "hover:bg-accent/30"
      )}
      onClick={onClick}
    >
      {/* Row 1: organ name + TARGET badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">
          {titleCase(organ.organ_system)}
        </span>
        {organ.target_organ_flag && (
          <span className="text-[9px] font-semibold uppercase text-[#DC2626]">
            TARGET
          </span>
        )}
      </div>

      {/* Row 2: evidence bar (neutral gray) */}
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted/50">
          <div
            className="h-full rounded-full bg-foreground/25 transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span
          className={cn(
            "shrink-0 text-[10px]",
            organ.evidence_score >= 0.5 ? "font-semibold" : organ.evidence_score >= 0.3 ? "font-medium" : ""
          )}
        >
          {organ.evidence_score.toFixed(2)}
        </span>
      </div>

      {/* Row 3: stats + domain chips (outline + dot) */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>{organ.n_significant} sig</span>
        <span>&middot;</span>
        <span>{organ.n_treatment_related} TR</span>
        <span>&middot;</span>
        <span>{organ.n_domains} domains</span>
        {organ.domains.map((d) => {
          const dc = getDomainBadgeColor(d);
          return (
            <span key={d} className="inline-flex items-center gap-1 rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dc.bg)} />
              {d}
            </span>
          );
        })}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// OrganRail — left column: scrollable organ list with header
// ---------------------------------------------------------------------------

function OrganRail({
  organs,
  selectedOrgan,
  maxEvidenceScore,
  onOrganClick,
}: {
  organs: TargetOrganRow[];
  selectedOrgan: string | null;
  maxEvidenceScore: number;
  onOrganClick: (organ: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return organs;
    const q = search.toLowerCase();
    return organs.filter((o) => o.organ_system.replace(/_/g, " ").toLowerCase().includes(q));
  }, [organs, search]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="border-b px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Organ systems ({organs.length})
        </span>
        <input
          type="text"
          placeholder="Search organs\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((organ) => (
          <OrganListItem
            key={organ.organ_system}
            organ={organ}
            isSelected={selectedOrgan === organ.organ_system}
            maxEvidenceScore={maxEvidenceScore}
            onClick={() => onOrganClick(organ.organ_system)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            No matches for &ldquo;{search}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrganSummaryHeader — conclusion text + compact metrics
// ---------------------------------------------------------------------------

function OrganSummaryHeader({ organ }: { organ: TargetOrganRow }) {
  const significantPct = organ.n_endpoints > 0
    ? ((organ.n_significant / organ.n_endpoints) * 100).toFixed(0)
    : "0";

  return (
    <div className="shrink-0 border-b px-4 py-3">
      {/* Title + badge */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {titleCase(organ.organ_system)}
        </h3>
        {organ.target_organ_flag && (
          <span className="text-[10px] font-semibold uppercase text-[#DC2626]">
            TARGET ORGAN
          </span>
        )}
      </div>

      {/* Conclusion text */}
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {organ.target_organ_flag ? "Convergent" : "Evidence from"}{" "}
        {organ.n_domains === 1 ? "1 domain" : `${organ.n_domains} domains`}:{" "}
        {organ.n_significant}/{organ.n_endpoints} endpoints significant ({significantPct}%),{" "}
        {organ.n_treatment_related} treatment-related.
      </p>

      {/* Compact metrics */}
      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        <div>
          <span className="text-muted-foreground">Max signal: </span>
          <span className="font-medium">{organ.max_signal_score.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Evidence: </span>
          <span className={cn(
            organ.evidence_score >= 0.5 ? "font-semibold" : "font-medium"
          )}>
            {organ.evidence_score.toFixed(2)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Endpoints: </span>
          <span className="font-medium">{organ.n_endpoints}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OverviewTab — domain breakdown + top findings
// ---------------------------------------------------------------------------

interface DomainBreakdown {
  domain: string;
  endpoints: number;
  significant: number;
  treatmentRelated: number;
}

function OverviewTab({
  evidenceRows,
}: {
  organ: TargetOrganRow;
  evidenceRows: OrganEvidenceRow[];
}) {
  const domainBreakdown = useMemo(() => {
    const map = new Map<string, { endpoints: Set<string>; significant: number; tr: number }>();
    for (const row of evidenceRows) {
      let entry = map.get(row.domain);
      if (!entry) {
        entry = { endpoints: new Set(), significant: 0, tr: 0 };
        map.set(row.domain, entry);
      }
      entry.endpoints.add(row.endpoint_label);
      if (row.p_value !== null && row.p_value < 0.05) entry.significant++;
      if (row.treatment_related) entry.tr++;
    }
    const result: DomainBreakdown[] = [];
    for (const [domain, entry] of map) {
      result.push({
        domain,
        endpoints: entry.endpoints.size,
        significant: entry.significant,
        treatmentRelated: entry.tr,
      });
    }
    return result.sort((a, b) => b.significant - a.significant);
  }, [evidenceRows]);

  // Top findings by effect size
  const topFindings = useMemo(() => {
    return [...evidenceRows]
      .filter((r) => r.effect_size !== null && r.effect_size > 0)
      .sort((a, b) => Math.abs(b.effect_size ?? 0) - Math.abs(a.effect_size ?? 0))
      .slice(0, 10);
  }, [evidenceRows]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {/* Domain breakdown */}
      <div className="mb-4">
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Domain breakdown
        </h4>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-1 pr-3 font-medium">Domain</th>
              <th className="pb-1 pr-3 font-medium">Endpoints</th>
              <th className="pb-1 pr-3 font-medium">Significant</th>
              <th className="pb-1 font-medium">TR</th>
            </tr>
          </thead>
          <tbody>
            {domainBreakdown.map((d) => {
              const dc = getDomainBadgeColor(d.domain);
              return (
                <tr key={d.domain} className="border-b border-border/30">
                  <td className="py-1.5 pr-3">
                    <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dc.bg)} />
                      {d.domain}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">{d.endpoints}</td>
                  <td className="py-1.5 pr-3">
                    <span className={d.significant > 0 ? "font-semibold" : ""}>
                      {d.significant}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <span className={d.treatmentRelated > 0 ? "font-semibold" : ""}>
                      {d.treatmentRelated}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Top findings */}
      {topFindings.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top findings by effect size
          </h4>
          <div className="space-y-1">
            {topFindings.map((row, i) => (
              <div
                key={`${row.endpoint_label}-${row.dose_level}-${row.sex}-${i}`}
                className="group/finding flex items-center gap-2 rounded border border-border/30 px-2 py-1.5 text-[11px] hover:bg-accent/30"
              >
                <span className="min-w-[140px] truncate font-medium" title={row.endpoint_label}>
                  {row.endpoint_label}
                </span>
                <span className="shrink-0 text-sm text-[#9CA3AF]">
                  {getDirectionSymbol(row.direction)}
                </span>
                <span className={cn(
                  "shrink-0 font-mono group-hover/finding:text-[#DC2626]",
                  Math.abs(row.effect_size ?? 0) >= 0.8 ? "font-semibold" : "font-normal"
                )}>
                  {formatEffectSize(row.effect_size)}
                </span>
                <span className={cn(
                  "shrink-0 font-mono group-hover/finding:text-[#DC2626]",
                  row.p_value != null && row.p_value < 0.001 ? "font-semibold" :
                  row.p_value != null && row.p_value < 0.01 ? "font-medium" : "font-normal"
                )}>
                  {formatPValue(row.p_value)}
                </span>
                <span className="shrink-0 rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                  {row.severity}
                </span>
                {row.treatment_related && (
                  <span className="shrink-0 text-[9px] font-medium text-muted-foreground">TR</span>
                )}
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {row.sex} · {row.dose_label.split(",")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {evidenceRows.length === 0 && (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No evidence rows for this organ.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EvidenceTableTab — existing TanStack table preserved
// ---------------------------------------------------------------------------

const evidenceCol = createColumnHelper<OrganEvidenceRow>();

function EvidenceTableTab({
  evidenceRows,
  selectedRow,
  onRowClick,
  sexFilter,
  setSexFilter,
  domainFilter,
  setDomainFilter,
  domainsInOrgan,
}: {
  evidenceRows: OrganEvidenceRow[];
  selectedRow: OrganSelection | null;
  onRowClick: (row: OrganEvidenceRow) => void;
  sexFilter: string | null;
  setSexFilter: (v: string | null) => void;
  domainFilter: string | null;
  setDomainFilter: (v: string | null) => void;
  domainsInOrgan: string[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const filteredEvidence = useMemo(() => {
    return evidenceRows.filter((row) => {
      if (sexFilter && row.sex !== sexFilter) return false;
      if (domainFilter && row.domain !== domainFilter) return false;
      return true;
    });
  }, [evidenceRows, sexFilter, domainFilter]);

  const columns = useMemo(
    () => [
      evidenceCol.accessor("endpoint_label", {
        header: "Endpoint",
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 30 ? info.getValue().slice(0, 30) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      evidenceCol.accessor("domain", {
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
      evidenceCol.accessor("dose_level", {
        header: "Dose",
        cell: (info) => (
          <span className="text-muted-foreground">{info.row.original.dose_label.split(",")[0]}</span>
        ),
      }),
      evidenceCol.accessor("sex", { header: "Sex" }),
      evidenceCol.accessor("p_value", {
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
      evidenceCol.accessor("effect_size", {
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
      evidenceCol.accessor("direction", {
        header: "Dir",
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {getDirectionSymbol(info.getValue())}
          </span>
        ),
      }),
      evidenceCol.accessor("severity", {
        header: "Severity",
        cell: (info) => (
          <span className="inline-block rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
      evidenceCol.accessor("treatment_related", {
        header: "TR",
        cell: (info) => (
          <span className={info.getValue() ? "font-medium" : "text-muted-foreground"}>
            {info.getValue() ? "Yes" : "No"}
          </span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredEvidence,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={domainFilter ?? ""}
          onChange={(e) => setDomainFilter(e.target.value || null)}
        >
          <option value="">All domains</option>
          {domainsInOrgan.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={sexFilter ?? ""}
          onChange={(e) => setSexFilter(e.target.value || null)}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filteredEvidence.length} findings
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="text-xs" style={{ width: table.getCenterTotalSize(), tableLayout: "fixed" }}>
          <thead>
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
                selectedRow?.endpoint_label === orig.endpoint_label &&
                selectedRow?.sex === orig.sex &&
                selectedRow?.organ_system === orig.organ_system;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "cursor-pointer border-b transition-colors hover:bg-accent/50",
                    isSelected && "bg-accent"
                  )}
                  data-selected={isSelected || undefined}
                  onClick={() => onRowClick(orig)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isEvidence = cell.column.id === "p_value" || cell.column.id === "effect_size";
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: TargetOrgansView — two-panel layout
// ---------------------------------------------------------------------------

type EvidenceTab = "overview" | "table";

export function TargetOrgansView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: OrganSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { data: organData, isLoading: organLoading, error: organError } = useTargetOrganSummary(studyId);
  const { data: evidenceData, isLoading: evidLoading, error: evidError } = useOrganEvidenceDetail(studyId);

  const [selectedOrgan, setSelectedOrgan] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<OrganSelection | null>(null);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("overview");
  const [sexFilter, setSexFilter] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const { width: railWidth, onPointerDown: onRailResize } = useResizePanel(300, 180, 500);

  // Sorted organs by evidence_score desc
  const sortedOrgans = useMemo(() => {
    if (!organData) return [];
    return [...organData].sort((a, b) => b.evidence_score - a.evidence_score);
  }, [organData]);

  const maxEvidenceScore = useMemo(() => {
    if (sortedOrgans.length === 0) return 1;
    return Math.max(...sortedOrgans.map((o) => o.evidence_score), 0.01);
  }, [sortedOrgans]);

  // Auto-select top organ on data load
  useEffect(() => {
    if (sortedOrgans.length > 0 && selectedOrgan === null) {
      const top = sortedOrgans[0].organ_system;
      setSelectedOrgan(top);
      const sel = { organ_system: top };
      setSelectedRow(sel);
      onSelectionChange?.(sel);
    }
  }, [sortedOrgans]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-view navigation from location.state
  useEffect(() => {
    const state = location.state as { organ_system?: string } | null;
    if (state?.organ_system && organData) {
      setSelectedOrgan(state.organ_system);
      const sel = { organ_system: state.organ_system };
      setSelectedRow(sel);
      onSelectionChange?.(sel);
      window.history.replaceState({}, "");
    }
  }, [location.state, organData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selected organ summary
  const selectedOrganData = useMemo(() => {
    if (!selectedOrgan || !organData) return null;
    return organData.find((o) => o.organ_system === selectedOrgan) ?? null;
  }, [organData, selectedOrgan]);

  // All evidence rows for selected organ (unfiltered — for overview)
  const organEvidenceRows = useMemo(() => {
    if (!evidenceData || !selectedOrgan) return [];
    return evidenceData.filter((r) => r.organ_system === selectedOrgan);
  }, [evidenceData, selectedOrgan]);

  // Unique domains in selected organ
  const domainsInOrgan = useMemo(() => {
    return [...new Set(organEvidenceRows.map((r) => r.domain))].sort();
  }, [organEvidenceRows]);

  const handleOrganClick = (organ: string) => {
    setSelectedOrgan(organ);
    setDomainFilter(null);
    setSexFilter(null);
    const sel = { organ_system: organ };
    setSelectedRow(sel);
    onSelectionChange?.(sel);
  };

  const handleRowClick = (row: OrganEvidenceRow) => {
    const sel: OrganSelection = {
      organ_system: row.organ_system,
      endpoint_label: row.endpoint_label,
      sex: row.sex,
    };
    const isSame =
      selectedRow?.organ_system === sel.organ_system &&
      selectedRow?.endpoint_label === sel.endpoint_label &&
      selectedRow?.sex === sel.sex;
    const next = isSame ? { organ_system: row.organ_system } : sel;
    setSelectedRow(next);
    onSelectionChange?.(next);
  };

  const isLoading = organLoading || evidLoading;
  const error = organError || evidError;

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
        <span className="text-sm text-muted-foreground">Loading target organ data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden max-[1200px]:flex-col">
      {/* Left: Organ rail */}
      <div
        className="shrink-0 border-r max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b max-[1200px]:overflow-x-auto"
        style={{ width: railWidth }}
      >
        <OrganRail
          organs={sortedOrgans}
          selectedOrgan={selectedOrgan}
          maxEvidenceScore={maxEvidenceScore}
          onOrganClick={handleOrganClick}
        />
      </div>
      <div className="max-[1200px]:hidden">
        <PanelResizeHandle onPointerDown={onRailResize} />
      </div>

      {/* Right: Evidence panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedOrganData && (
          <>
            {/* Summary header */}
            <OrganSummaryHeader organ={selectedOrganData} />

            {/* Tab bar */}
            <div className="flex shrink-0 items-center gap-0 border-b px-4">
              <button
                className={cn(
                  "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                  activeTab === "overview"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab("overview")}
              >
                Overview
              </button>
              <button
                className={cn(
                  "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                  activeTab === "table"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab("table")}
              >
                Evidence table
              </button>
            </div>

            {/* Tab content */}
            {activeTab === "overview" ? (
              <OverviewTab
                organ={selectedOrganData}
                evidenceRows={organEvidenceRows}
              />
            ) : (
              <EvidenceTableTab
                evidenceRows={organEvidenceRows}
                selectedRow={selectedRow}
                onRowClick={handleRowClick}
                sexFilter={sexFilter}
                setSexFilter={setSexFilter}
                domainFilter={domainFilter}
                setDomainFilter={setDomainFilter}
                domainsInOrgan={domainsInOrgan}
              />
            )}
          </>
        )}

        {!selectedOrganData && sortedOrgans.length > 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select an organ system to view evidence details.
          </div>
        )}

        {sortedOrgans.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No target organ data available.
          </div>
        )}
      </div>
    </div>
  );
}
