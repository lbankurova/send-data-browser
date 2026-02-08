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
import type { SortingState } from "@tanstack/react-table";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useOrganEvidenceDetail } from "@/hooks/useOrganEvidenceDetail";
import { cn } from "@/lib/utils";
import {
  getSignalScoreColor,
  getPValueColor,
  getEffectSizeColor,
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  getDirectionColor,
  getDomainBadgeColor,
  getSeverityBadgeClasses,
} from "@/lib/severity-colors";
import type { OrganEvidenceRow } from "@/types/analysis-views";

export interface OrganSelection {
  organ_system: string;
  endpoint_label?: string;
  sex?: string;
}

const evidenceCol = createColumnHelper<OrganEvidenceRow>();

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
  const [sexFilter, setSexFilter] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedRow, setSelectedRow] = useState<OrganSelection | null>(null);

  // Apply cross-view state from navigate()
  useEffect(() => {
    const state = location.state as { organ_system?: string } | null;
    if (state?.organ_system && organData) {
      setSelectedOrgan(state.organ_system);
      window.history.replaceState({}, "");
    }
  }, [location.state, organData]);

  // Sorted organs by evidence score
  const sortedOrgans = useMemo(() => {
    if (!organData) return [];
    return [...organData].sort((a, b) => b.evidence_score - a.evidence_score);
  }, [organData]);

  // Filtered evidence for selected organ
  const filteredEvidence = useMemo(() => {
    if (!evidenceData || !selectedOrgan) return [];
    return evidenceData.filter((row) => {
      if (row.organ_system !== selectedOrgan) return false;
      if (sexFilter && row.sex !== sexFilter) return false;
      if (domainFilter && row.domain !== domainFilter) return false;
      return true;
    });
  }, [evidenceData, selectedOrgan, sexFilter, domainFilter]);

  // Unique domains in selected organ
  const domainsInOrgan = useMemo(() => {
    if (!evidenceData || !selectedOrgan) return [];
    return [...new Set(evidenceData.filter((r) => r.organ_system === selectedOrgan).map((r) => r.domain))].sort();
  }, [evidenceData, selectedOrgan]);

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
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", dc.bg, dc.text)}>
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
        cell: (info) => (
          <span className={cn("font-mono", getPValueColor(info.getValue()))}>
            {formatPValue(info.getValue())}
          </span>
        ),
      }),
      evidenceCol.accessor("effect_size", {
        header: "Effect",
        cell: (info) => (
          <span className={cn("font-mono", getEffectSizeColor(info.getValue()))}>
            {formatEffectSize(info.getValue())}
          </span>
        ),
      }),
      evidenceCol.accessor("direction", {
        header: "Dir",
        cell: (info) => (
          <span className={cn("text-sm", getDirectionColor(info.getValue()))}>
            {getDirectionSymbol(info.getValue())}
          </span>
        ),
      }),
      evidenceCol.accessor("severity", {
        header: "Severity",
        cell: (info) => (
          <span
            className={cn(
              "inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
              getSeverityBadgeClasses(info.getValue())
            )}
          >
            {info.getValue()}
          </span>
        ),
      }),
      evidenceCol.accessor("treatment_related", {
        header: "TR",
        cell: (info) => (
          <span className={info.getValue() ? "font-medium text-red-600" : "text-muted-foreground"}>
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
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleOrganClick = (organ: string) => {
    const next = selectedOrgan === organ ? null : organ;
    setSelectedOrgan(next);
    setDomainFilter(null);
    const sel = next ? { organ_system: next } : null;
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
    const next = isSame ? null : sel;
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Organ summary cards */}
      <div className="border-b p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Target organ systems ({sortedOrgans.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {sortedOrgans.map((organ) => (
            <button
              key={organ.organ_system}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent/50",
                selectedOrgan === organ.organ_system && "ring-2 ring-primary"
              )}
              onClick={() => handleOrganClick(organ.organ_system)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">
                  {organ.organ_system.replace(/_/g, " ")}
                </span>
                {organ.target_organ_flag && (
                  <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-medium text-red-700">
                    TARGET
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px]">
                <span
                  className="rounded px-1 py-0.5 font-medium text-white"
                  style={{ backgroundColor: getSignalScoreColor(organ.evidence_score / 2) }}
                >
                  {organ.evidence_score.toFixed(2)}
                </span>
                <span className="text-muted-foreground">
                  {organ.n_endpoints} endpoints
                </span>
                <span className="text-muted-foreground">
                  {organ.n_domains} domains
                </span>
              </div>
              <div className="mt-1 flex gap-1">
                {organ.domains.map((d) => {
                  const dc = getDomainBadgeColor(d);
                  return (
                    <span key={d} className={cn("rounded px-1 py-0.5 text-[9px] font-medium", dc.bg, dc.text)}>
                      {d}
                    </span>
                  );
                })}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Evidence detail filters + grid */}
      {selectedOrgan && (
        <>
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
            <span className="text-xs font-medium">
              {selectedOrgan.replace(/_/g, " ")} — Evidence Detail
            </span>
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
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b bg-muted/50">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="cursor-pointer px-2 py-1.5 text-left font-medium hover:bg-accent/50"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " \u25b2", desc: " \u25bc" }[header.column.getIsSorted() as string] ?? ""}
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
                      onClick={() => handleRowClick(orig)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-2 py-1">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!selectedOrgan && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select an organ system above to view evidence details.
        </div>
      )}
    </div>
  );
}
