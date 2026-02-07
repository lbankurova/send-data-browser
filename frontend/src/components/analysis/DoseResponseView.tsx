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
  getPValueColor,
  getEffectSizeColor,
  formatPValue,
  formatEffectSize,
  getDomainBadgeColor,
  getDoseGroupColor,
} from "@/lib/severity-colors";
import type { DoseResponseRow } from "@/types/analysis-views";

export interface DoseResponseSelection {
  endpoint_label: string;
  sex?: string;
  domain?: string;
  organ_system?: string;
}

interface Filters {
  endpoint: string | null;
  sex: string | null;
  data_type: string | null;
  organ_system: string | null;
}

const col = createColumnHelper<DoseResponseRow>();

export function DoseResponseView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: DoseResponseSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: drData, isLoading, error } = useDoseResponseMetrics(studyId);

  const [filters, setFilters] = useState<Filters>({
    endpoint: null,
    sex: null,
    data_type: null,
    organ_system: null,
  });
  const [selection, setSelection] = useState<DoseResponseSelection | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [endpointSearch, setEndpointSearch] = useState("");

  // Unique values
  const endpoints = useMemo(() => {
    if (!drData) return [];
    return [...new Set(drData.map((r) => r.endpoint_label))].sort();
  }, [drData]);

  const organSystems = useMemo(() => {
    if (!drData) return [];
    return [...new Set(drData.map((r) => r.organ_system))].sort();
  }, [drData]);

  const filteredEndpoints = useMemo(() => {
    if (!endpointSearch) return endpoints.slice(0, 50);
    const q = endpointSearch.toLowerCase();
    return endpoints.filter((e) => e.toLowerCase().includes(q)).slice(0, 50);
  }, [endpoints, endpointSearch]);

  // Filtered data
  const filteredData = useMemo(() => {
    if (!drData) return [];
    return drData.filter((row) => {
      if (filters.endpoint && row.endpoint_label !== filters.endpoint) return false;
      if (filters.sex && row.sex !== filters.sex) return false;
      if (filters.data_type && row.data_type !== filters.data_type) return false;
      if (filters.organ_system && row.organ_system !== filters.organ_system) return false;
      return true;
    });
  }, [drData, filters]);

  // Chart data for selected endpoint
  const chartEndpoint = selection?.endpoint_label ?? filters.endpoint;
  const chartData = useMemo(() => {
    if (!drData || !chartEndpoint) return null;
    const rows = drData.filter((r) => r.endpoint_label === chartEndpoint);
    if (rows.length === 0) return null;
    const dataType = rows[0].data_type;
    const sexes = [...new Set(rows.map((r) => r.sex))].sort();
    const doseLevels = [...new Set(rows.map((r) => r.dose_level))].sort((a, b) => a - b);

    // Build chart points per sex
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
        };
      });
      return { sex, points };
    });

    return { dataType, sexes, doseLevels, series };
  }, [drData, chartEndpoint]);

  const columns = useMemo(
    () => [
      col.accessor("endpoint_label", {
        header: "Endpoint",
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 25 ? info.getValue().slice(0, 25) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      col.accessor("domain", {
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
      col.accessor("trend_p", {
        header: "Trend P",
        cell: (info) => (
          <span className={cn("font-mono", getPValueColor(info.getValue()))}>
            {formatPValue(info.getValue())}
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

  const handleRowClick = (row: DoseResponseRow) => {
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
        <span className="text-sm text-muted-foreground">Loading dose-response data...</span>
      </div>
    );
  }

  const sexColors: Record<string, string> = { M: "#3b82f6", F: "#ec4899" };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Search endpoints..."
            className="w-48 rounded border bg-background px-2 py-1 text-xs"
            value={endpointSearch}
            onChange={(e) => setEndpointSearch(e.target.value)}
          />
          {endpointSearch && filteredEndpoints.length > 0 && !filters.endpoint && (
            <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-64 overflow-auto rounded border bg-background shadow-lg">
              {filteredEndpoints.map((ep) => (
                <button
                  key={ep}
                  className="block w-full truncate px-2 py-1 text-left text-xs hover:bg-accent/50"
                  onClick={() => {
                    setFilters((f) => ({ ...f, endpoint: ep }));
                    setEndpointSearch("");
                  }}
                >
                  {ep}
                </button>
              ))}
            </div>
          )}
        </div>
        {filters.endpoint && (
          <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs">
            {filters.endpoint.length > 25 ? filters.endpoint.slice(0, 25) + "\u2026" : filters.endpoint}
            <button
              className="ml-1 text-muted-foreground hover:text-foreground"
              onClick={() => setFilters((f) => ({ ...f, endpoint: null }))}
            >
              &times;
            </button>
          </span>
        )}
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
          value={filters.data_type ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, data_type: e.target.value || null }))}
        >
          <option value="">All types</option>
          <option value="continuous">Continuous</option>
          <option value="categorical">Categorical</option>
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
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filteredData.length} of {drData?.length ?? 0} rows
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Chart */}
        {chartData && (
          <div className="border-b p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {chartEndpoint}
            </h2>
            <div className="flex gap-4">
              {chartData.series.map(({ sex, points }) => (
                <div key={sex} className="flex-1">
                  <div className="mb-1 text-center text-[10px] font-medium" style={{ color: sexColors[sex] ?? "#666" }}>
                    {sex === "M" ? "Males" : sex === "F" ? "Females" : sex}
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
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
                          dot={{ r: 4 }}
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
                        <Bar dataKey="incidence" fill={sexColors[sex] ?? "#666"} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        )}

        {!chartEndpoint && (
          <div className="border-b p-4 text-center text-xs text-muted-foreground">
            Select an endpoint from the grid or filter to view the dose-response chart.
          </div>
        )}

        {/* Grid */}
        <div>
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dose-Response Metrics ({filteredData.length} rows)
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
                    selection?.endpoint_label === orig.endpoint_label &&
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
