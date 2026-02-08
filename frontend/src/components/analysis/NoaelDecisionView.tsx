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
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import { useAdverseEffectSummary } from "@/hooks/useAdverseEffectSummary";
import { cn } from "@/lib/utils";
import {
  getSeverityBadgeClasses,
  getPValueColor,
  getEffectSizeColor,
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  getDirectionColor,
  getDomainBadgeColor,
  getDoseGroupColor,
} from "@/lib/severity-colors";
import type {
  NoaelSummaryRow,
  AdverseEffectSummaryRow,
} from "@/types/analysis-views";

interface NoaelSelection {
  endpoint_label: string;
  dose_level: number;
  sex: string;
}

interface Filters {
  severity: string | null;
  organ_system: string | null;
  sex: string | null;
  treatment_related: string | null;
}

const col = createColumnHelper<AdverseEffectSummaryRow>();

export function NoaelDecisionView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: NoaelSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { data: noaelData, isLoading: noaelLoading, error: noaelError } = useNoaelSummary(studyId);
  const { data: aeData, isLoading: aeLoading, error: aeError } = useAdverseEffectSummary(studyId);

  const [filters, setFilters] = useState<Filters>({
    severity: null,
    organ_system: null,
    sex: null,
    treatment_related: null,
  });
  const [selection, setSelection] = useState<NoaelSelection | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Apply cross-view state from navigate()
  useEffect(() => {
    const state = location.state as { organ_system?: string } | null;
    if (state?.organ_system && aeData) {
      setFilters((f) => ({ ...f, organ_system: state.organ_system ?? null }));
      window.history.replaceState({}, "");
    }
  }, [location.state, aeData]);

  // Unique filter values
  const organSystems = useMemo(() => {
    if (!aeData) return [];
    return [...new Set(aeData.map((r) => r.organ_system))].sort();
  }, [aeData]);

  // Filtered data
  const filteredData = useMemo(() => {
    if (!aeData) return [];
    return aeData.filter((row) => {
      if (filters.severity && row.severity !== filters.severity) return false;
      if (filters.organ_system && row.organ_system !== filters.organ_system) return false;
      if (filters.sex && row.sex !== filters.sex) return false;
      if (filters.treatment_related !== null) {
        const wantTR = filters.treatment_related === "yes";
        if (row.treatment_related !== wantTR) return false;
      }
      return true;
    });
  }, [aeData, filters]);

  // Adversity matrix data
  const matrixData = useMemo(() => {
    if (!aeData) return { endpoints: [], doseLevels: [], cells: new Map<string, AdverseEffectSummaryRow>() };
    const doseLevels = [...new Set(aeData.map((r) => r.dose_level))].sort((a, b) => a - b);
    // Get unique endpoints, sorted by first adverse dose
    const endpointFirstDose = new Map<string, number>();
    for (const row of aeData) {
      if (row.severity === "adverse" && row.treatment_related) {
        const key = row.endpoint_label;
        const existing = endpointFirstDose.get(key);
        if (existing === undefined || row.dose_level < existing) {
          endpointFirstDose.set(key, row.dose_level);
        }
      }
    }
    // Only show endpoints that have at least one adverse + treatment_related
    const endpoints = [...endpointFirstDose.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([ep]) => ep);

    const cells = new Map<string, AdverseEffectSummaryRow>();
    for (const row of aeData) {
      if (endpoints.includes(row.endpoint_label)) {
        const key = `${row.endpoint_label}|${row.dose_level}`;
        // Keep worst severity per endpoint×dose (across sexes)
        const existing = cells.get(key);
        if (!existing || (row.severity === "adverse" && existing.severity !== "adverse")) {
          cells.set(key, row);
        }
      }
    }
    return { endpoints, doseLevels, cells };
  }, [aeData]);

  // Table columns
  const columns = useMemo(
    () => [
      col.accessor("endpoint_label", {
        header: "Endpoint",
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 30 ? info.getValue().slice(0, 30) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      col.accessor("endpoint_type", {
        header: "Type",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue().replace(/_/g, " ")}</span>
        ),
      }),
      col.accessor("organ_system", {
        header: "Organ",
        cell: (info) => info.getValue().replace(/_/g, " "),
      }),
      col.accessor("dose_level", {
        header: "Dose",
        cell: (info) => (
          <span
            className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: getDoseGroupColor(info.getValue()) }}
          >
            {info.row.original.dose_label.split(",")[0]}
          </span>
        ),
      }),
      col.accessor("sex", { header: "Sex" }),
      col.accessor("p_value", {
        header: "P-value",
        cell: (info) => (
          <span className={cn("font-mono", getPValueColor(info.getValue()))}>
            {formatPValue(info.getValue())}
          </span>
        ),
      }),
      col.accessor("effect_size", {
        header: "Effect",
        cell: (info) => (
          <span className={cn("font-mono", getEffectSizeColor(info.getValue()))}>
            {formatEffectSize(info.getValue())}
          </span>
        ),
      }),
      col.accessor("direction", {
        header: "Dir",
        cell: (info) => (
          <span className={cn("text-sm", getDirectionColor(info.getValue()))}>
            {getDirectionSymbol(info.getValue())}
          </span>
        ),
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
      col.accessor("treatment_related", {
        header: "TR",
        cell: (info) => (
          <span className={info.getValue() ? "font-medium text-red-600" : "text-muted-foreground"}>
            {info.getValue() ? "Yes" : "No"}
          </span>
        ),
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
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleRowClick = (row: AdverseEffectSummaryRow) => {
    const sel: NoaelSelection = {
      endpoint_label: row.endpoint_label,
      dose_level: row.dose_level,
      sex: row.sex,
    };
    const isSame =
      selection?.endpoint_label === sel.endpoint_label &&
      selection?.dose_level === sel.dose_level &&
      selection?.sex === sel.sex;
    const next = isSame ? null : sel;
    setSelection(next);
    onSelectionChange?.(next);
  };

  const isLoading = noaelLoading || aeLoading;
  const error = noaelError || aeError;

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
        <span className="text-sm text-muted-foreground">Loading NOAEL data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* NOAEL Banner */}
      {noaelData && <NoaelBanner data={noaelData} />}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={filters.severity ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value || null }))}
        >
          <option value="">All severities</option>
          <option value="adverse">Adverse</option>
          <option value="warning">Warning</option>
          <option value="normal">Normal</option>
        </select>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={filters.organ_system ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, organ_system: e.target.value || null }))}
        >
          <option value="">All organs</option>
          {organSystems.map((os) => (
            <option key={os} value={os}>{os.replace(/_/g, " ")}</option>
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
          value={filters.treatment_related ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, treatment_related: e.target.value || null }))}
        >
          <option value="">TR: Any</option>
          <option value="yes">Treatment-related</option>
          <option value="no">Not treatment-related</option>
        </select>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filteredData.length} of {aeData?.length ?? 0} findings
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Adversity Matrix */}
        {matrixData.endpoints.length > 0 && (
          <div className="border-b p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adversity matrix ({matrixData.endpoints.length} endpoints)
            </h2>
            <div className="overflow-x-auto">
              <div className="inline-block">
                {/* Header row */}
                <div className="flex">
                  <div className="w-48 shrink-0" />
                  {matrixData.doseLevels.map((dl) => (
                    <div
                      key={dl}
                      className="w-16 shrink-0 text-center text-[10px] font-medium text-muted-foreground"
                    >
                      Dose {dl}
                    </div>
                  ))}
                </div>
                {/* Data rows */}
                {matrixData.endpoints.slice(0, 30).map((ep) => (
                  <div key={ep} className="flex border-t">
                    <div
                      className="w-48 shrink-0 truncate py-0.5 pr-2 text-[10px]"
                      title={ep}
                    >
                      {ep.length > 35 ? ep.slice(0, 35) + "\u2026" : ep}
                    </div>
                    {matrixData.doseLevels.map((dl) => {
                      const cell = matrixData.cells.get(`${ep}|${dl}`);
                      let bg = "#e5e7eb"; // gray
                      if (cell) {
                        if (cell.severity === "adverse" && cell.treatment_related) {
                          bg = "#ef4444"; // red
                        } else if (cell.severity === "warning") {
                          bg = "#fbbf24"; // amber
                        } else {
                          bg = "#4ade80"; // green
                        }
                      }
                      return (
                        <div
                          key={dl}
                          className="flex h-5 w-16 shrink-0 items-center justify-center"
                        >
                          <div
                            className="h-4 w-12 rounded-sm"
                            style={{ backgroundColor: bg }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
                {matrixData.endpoints.length > 30 && (
                  <div className="py-1 text-[10px] text-muted-foreground">
                    +{matrixData.endpoints.length - 30} more endpoints...
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
                Adverse
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "#fbbf24" }} />
                Warning
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "#4ade80" }} />
                Normal
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "#e5e7eb" }} />
                N/A
              </span>
            </div>
          </div>
        )}

        {/* Grid */}
        <div>
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adverse effect summary ({filteredData.length} rows)
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
                {table.getRowModel().rows.map((row) => {
                  const orig = row.original;
                  const isSelected =
                    selection?.endpoint_label === orig.endpoint_label &&
                    selection?.dose_level === orig.dose_level &&
                    selection?.sex === orig.sex;
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
        </div>
      </div>
    </div>
  );
}

function NoaelBanner({ data }: { data: NoaelSummaryRow[] }) {
  const combined = data.find((r) => r.sex === "Combined");
  const males = data.find((r) => r.sex === "M");
  const females = data.find((r) => r.sex === "F");

  return (
    <div className="border-b bg-muted/20 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        NOAEL determination
      </h2>
      <div className="flex flex-wrap gap-3">
        {[combined, males, females].filter(Boolean).map((row) => {
          const r = row!;
          const established = r.noael_dose_value > 0;
          return (
            <div
              key={r.sex}
              className={cn(
                "flex-1 rounded-lg border p-3",
                established ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {r.sex === "Combined" ? "Combined" : r.sex === "M" ? "Males" : "Females"}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    established ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  )}
                >
                  {established ? "Established" : "Not established"}
                </span>
              </div>
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NOAEL</span>
                  <span className="font-medium">
                    {r.noael_dose_value} {r.noael_dose_unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LOAEL</span>
                  <span className="font-medium">{r.loael_label.split(",")[0]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adverse at LOAEL</span>
                  <span className="font-medium">{r.n_adverse_at_loael}</span>
                </div>
                {r.noael_confidence != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Confidence</span>
                    <span
                      className={cn(
                        "font-medium",
                        r.noael_confidence >= 0.8 ? "text-green-700" :
                        r.noael_confidence >= 0.6 ? "text-yellow-700" :
                        "text-red-700"
                      )}
                    >
                      {Math.round(r.noael_confidence * 100)}%
                    </span>
                  </div>
                )}
                {r.adverse_domains_at_loael.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.adverse_domains_at_loael.map((d) => {
                      const dc = getDomainBadgeColor(d);
                      return (
                        <span
                          key={d}
                          className={cn("rounded px-1 py-0.5 text-[9px] font-medium", dc.bg, dc.text)}
                        >
                          {d}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
