import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { cn } from "@/lib/utils";
import { getSeverityBadgeClasses } from "@/lib/severity-colors";
import type { LesionSeverityRow } from "@/types/analysis-views";

export interface HistopathSelection {
  finding: string;
  specimen: string;
  sex?: string;
}

interface Filters {
  specimen: string | null;
  sex: string | null;
  min_severity: number;
}

/** Severity color scale: pale yellow → deep red per spec §12.3 */
function getSeverityHeatColor(avgSev: number): string {
  if (avgSev >= 4) return "#E57373"; // severe
  if (avgSev >= 3) return "#FF8A65";
  if (avgSev >= 2) return "#FFB74D";
  if (avgSev >= 1) return "#FFE0B2";
  return "#FFF9C4"; // minimal
}

function getIncidenceColor(incidence: number): string {
  if (incidence >= 0.8) return "rgba(239,68,68,0.15)";
  if (incidence >= 0.5) return "rgba(249,115,22,0.1)";
  if (incidence >= 0.2) return "rgba(234,179,8,0.08)";
  return "transparent";
}

const col = createColumnHelper<LesionSeverityRow>();

export function HistopathologyView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: HistopathSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: lesionData, isLoading, error } = useLesionSeveritySummary(studyId);

  const [filters, setFilters] = useState<Filters>({
    specimen: null,
    sex: null,
    min_severity: 0,
  });
  const [selection, setSelection] = useState<HistopathSelection | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Unique specimens
  const specimens = useMemo(() => {
    if (!lesionData) return [];
    return [...new Set(lesionData.map((r) => r.specimen))].sort();
  }, [lesionData]);

  // Filtered data
  const filteredData = useMemo(() => {
    if (!lesionData) return [];
    return lesionData.filter((row) => {
      if (filters.specimen && row.specimen !== filters.specimen) return false;
      if (filters.sex && row.sex !== filters.sex) return false;
      if ((row.avg_severity ?? 0) < filters.min_severity) return false;
      return true;
    });
  }, [lesionData, filters]);

  // Heatmap data
  const heatmapData = useMemo(() => {
    if (!filteredData.length) return null;
    const doseLevels = [...new Set(filteredData.map((r) => r.dose_level))].sort((a, b) => a - b);
    const doseLabels = new Map<number, string>();
    for (const r of filteredData) {
      if (!doseLabels.has(r.dose_level)) {
        doseLabels.set(r.dose_level, r.dose_label.split(",")[0]);
      }
    }

    // Unique findings sorted by max avg_severity desc
    const findingMaxSev = new Map<string, number>();
    for (const r of filteredData) {
      const existing = findingMaxSev.get(r.finding) ?? 0;
      if ((r.avg_severity ?? 0) > existing) findingMaxSev.set(r.finding, r.avg_severity ?? 0);
    }
    const findings = [...findingMaxSev.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f]) => f);

    // Build cell lookup: finding|dose_level → aggregated row
    const cells = new Map<string, { incidence: number; avg_severity: number; affected: number; n: number }>();
    for (const r of filteredData) {
      const key = `${r.finding}|${r.dose_level}`;
      const existing = cells.get(key);
      if (existing) {
        // aggregate across sexes
        existing.affected += r.affected;
        existing.n += r.n;
        existing.incidence = existing.n > 0 ? existing.affected / existing.n : 0;
        existing.avg_severity = Math.max(existing.avg_severity, r.avg_severity ?? 0);
      } else {
        cells.set(key, {
          incidence: r.incidence,
          avg_severity: r.avg_severity ?? 0,
          affected: r.affected,
          n: r.n,
        });
      }
    }

    return { doseLevels, doseLabels, findings, cells };
  }, [filteredData]);

  const columns = useMemo(
    () => [
      col.accessor("finding", {
        header: "Finding",
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 25 ? info.getValue().slice(0, 25) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      col.accessor("specimen", {
        header: "Specimen",
        cell: (info) => (
          <span className="text-muted-foreground" title={info.getValue()}>
            {info.getValue().length > 20 ? info.getValue().slice(0, 20) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      col.accessor("domain", { header: "Domain" }),
      col.accessor("dose_level", {
        header: "Dose",
        cell: (info) => (
          <span className="text-muted-foreground">{info.row.original.dose_label.split(",")[0]}</span>
        ),
      }),
      col.accessor("sex", { header: "Sex" }),
      col.accessor("n", { header: "N" }),
      col.accessor("affected", { header: "Affected" }),
      col.accessor("incidence", {
        header: "Incidence",
        cell: (info) => {
          const v = info.getValue();
          return (
            <span
              className="rounded px-1 font-mono"
              style={{ backgroundColor: getIncidenceColor(v ?? 0) }}
            >
              {v != null ? (v * 100).toFixed(0) + "%" : "\u2014"}
            </span>
          );
        },
      }),
      col.accessor("avg_severity", {
        header: "Avg Sev",
        cell: (info) => {
          const v = info.getValue();
          if (v == null) return <span className="text-muted-foreground">{"\u2014"}</span>;
          return (
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px]"
              style={{ backgroundColor: getSeverityHeatColor(v) }}
            >
              {v.toFixed(1)}
            </span>
          );
        },
      }),
      col.accessor("severity", {
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
    ],
    []
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleRowClick = (row: LesionSeverityRow) => {
    const sel: HistopathSelection = {
      finding: row.finding,
      specimen: row.specimen,
      sex: row.sex,
    };
    const isSame = selection?.finding === sel.finding && selection?.specimen === sel.specimen;
    const next = isSame ? null : sel;
    setSelection(next);
    onSelectionChange?.(next);
  };

  const handleHeatmapClick = (finding: string) => {
    const row = filteredData.find((r) => r.finding === finding);
    if (row) {
      const sel: HistopathSelection = { finding, specimen: row.specimen };
      const isSame = selection?.finding === finding;
      const next = isSame ? null : sel;
      setSelection(next);
      onSelectionChange?.(next);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">Analysis Data Not Available</h1>
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
        <span className="text-sm text-muted-foreground">Loading histopathology data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={filters.specimen ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, specimen: e.target.value || null }))}
        >
          <option value="">All specimens</option>
          {specimens.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={filters.sex ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, sex: e.target.value || null }))}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={filters.min_severity}
          onChange={(e) => setFilters((f) => ({ ...f, min_severity: Number(e.target.value) }))}
        >
          <option value={0}>Min severity: any</option>
          <option value={1}>Min severity: 1+</option>
          <option value={2}>Min severity: 2+</option>
          <option value={3}>Min severity: 3+</option>
        </select>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filteredData.length} of {lesionData?.length ?? 0} rows
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Severity Heatmap */}
        {heatmapData && heatmapData.findings.length > 0 && (
          <div className="border-b p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Severity Heatmap ({heatmapData.findings.length} findings)
            </h2>
            <div className="overflow-x-auto">
              <div className="inline-block">
                {/* Header row */}
                <div className="flex">
                  <div className="w-52 shrink-0" />
                  {heatmapData.doseLevels.map((dl) => (
                    <div
                      key={dl}
                      className="w-20 shrink-0 text-center text-[10px] font-medium text-muted-foreground"
                    >
                      {heatmapData.doseLabels.get(dl) ?? `Dose ${dl}`}
                    </div>
                  ))}
                </div>
                {/* Data rows */}
                {heatmapData.findings.slice(0, 40).map((finding) => (
                  <div
                    key={finding}
                    className={cn(
                      "flex cursor-pointer border-t hover:bg-accent/20",
                      selection?.finding === finding && "ring-1 ring-primary"
                    )}
                    onClick={() => handleHeatmapClick(finding)}
                  >
                    <div
                      className="w-52 shrink-0 truncate py-1 pr-2 text-[10px]"
                      title={finding}
                    >
                      {finding.length > 40 ? finding.slice(0, 40) + "\u2026" : finding}
                    </div>
                    {heatmapData.doseLevels.map((dl) => {
                      const cell = heatmapData.cells.get(`${finding}|${dl}`);
                      return (
                        <div
                          key={dl}
                          className="flex h-6 w-20 shrink-0 items-center justify-center"
                        >
                          {cell ? (
                            <div
                              className="flex h-5 w-16 items-center justify-center rounded-sm text-[9px] font-medium"
                              style={{ backgroundColor: getSeverityHeatColor(cell.avg_severity ?? 0) }}
                              title={`Severity: ${cell.avg_severity != null ? cell.avg_severity.toFixed(1) : "N/A"}, Incidence: ${cell.affected}/${cell.n}`}
                            >
                              {cell.affected}/{cell.n}
                            </div>
                          ) : (
                            <div className="h-5 w-16 rounded-sm bg-gray-100" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {heatmapData.findings.length > 40 && (
                  <div className="py-1 text-[10px] text-muted-foreground">
                    +{heatmapData.findings.length - 40} more findings...
                  </div>
                )}
              </div>
            </div>
            {/* Legend */}
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>Severity:</span>
              {[
                { label: "Minimal", color: "#FFF9C4" },
                { label: "Mild", color: "#FFE0B2" },
                { label: "Moderate", color: "#FFB74D" },
                { label: "Marked", color: "#FF8A65" },
                { label: "Severe", color: "#E57373" },
              ].map(({ label, color }) => (
                <span key={label} className="flex items-center gap-0.5">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Grid */}
        <div>
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lesion Severity Summary ({filteredData.length} rows)
            </h2>
          </div>
          <div className="overflow-x-auto">
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
                {table.getRowModel().rows.slice(0, 200).map((row) => {
                  const orig = row.original;
                  const isSelected =
                    selection?.finding === orig.finding && selection?.specimen === orig.specimen;
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
            {filteredData.length > 200 && (
              <div className="p-2 text-center text-[10px] text-muted-foreground">
                Showing first 200 of {filteredData.length} rows. Use filters to narrow results.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
