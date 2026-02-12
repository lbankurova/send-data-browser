import { useState, useMemo, useEffect, useCallback } from "react";
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
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { cn } from "@/lib/utils";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { FilterSelect } from "@/components/ui/FilterBar";
import {
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  titleCase,
} from "@/lib/severity-colors";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import type { SignalSummaryRow } from "@/types/analysis-views";

export interface FindingsOverviewSelection {
  endpoint_label: string;
  organ_system: string;
  sex?: string;
  domain?: string;
}

// ─── Rail item ───────────────────────────────────────────────

function FindingItem({
  row,
  isSelected,
  onClick,
}: {
  row: SignalSummaryRow;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "w-full text-left border-b border-border/40 px-2 py-1 transition-colors",
        isSelected ? "bg-blue-50/60 dark:bg-blue-950/20" : "hover:bg-accent/30",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium truncate" title={row.endpoint_label}>
          {row.endpoint_label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums font-semibold">
          {row.signal_score.toFixed(2)}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <DomainLabel domain={row.domain} />
        <span>&middot;</span>
        <span>{titleCase(row.organ_system)}</span>
        <span>&middot;</span>
        <span>{row.sex}</span>
      </div>
    </button>
  );
}

// ─── Organ group in rail ─────────────────────────────────────

function OrganGroup({
  organSystem,
  rows,
  selectedKey,
  onSelect,
}: {
  organSystem: string;
  rows: SignalSummaryRow[];
  selectedKey: string | null;
  onSelect: (row: SignalSummaryRow) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const count = rows.length;

  return (
    <div>
      <button
        className="flex w-full items-center gap-1 bg-muted/30 px-2 py-1 text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        <span className="text-[10px] text-muted-foreground">{expanded ? "▾" : "▸"}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {titleCase(organSystem)}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">{count}</span>
      </button>
      {expanded &&
        rows.map((r) => {
          const key = `${r.endpoint_label}|${r.dose_level}|${r.sex}`;
          return (
            <FindingItem
              key={key}
              row={r}
              isSelected={selectedKey === key}
              onClick={() => onSelect(r)}
            />
          );
        })}
    </div>
  );
}

// ─── Rail ────────────────────────────────────────────────────

function FindingsRail({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: SignalSummaryRow[];
  selectedKey: string | null;
  onSelect: (row: SignalSummaryRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [sexFilter, setSexFilter] = useState<string | null>(null);

  const domains = useMemo(() => [...new Set(rows.map((r) => r.domain))].sort(), [rows]);
  const sexes = useMemo(() => [...new Set(rows.map((r) => r.sex))].sort(), [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.endpoint_label.toLowerCase().includes(q) ||
          r.organ_system.toLowerCase().includes(q) ||
          r.domain.toLowerCase().includes(q),
      );
    }
    if (domainFilter) result = result.filter((r) => r.domain === domainFilter);
    if (severityFilter) result = result.filter((r) => r.severity === severityFilter);
    if (sexFilter) result = result.filter((r) => r.sex === sexFilter);
    return result;
  }, [rows, search, domainFilter, severityFilter, sexFilter]);

  // Group by organ_system
  const grouped = useMemo(() => {
    const map = new Map<string, SignalSummaryRow[]>();
    for (const r of filtered) {
      let arr = map.get(r.organ_system);
      if (!arr) {
        arr = [];
        map.set(r.organ_system, arr);
      }
      arr.push(r);
    }
    // Sort organ groups by max signal score descending
    return [...map.entries()].sort((a, b) => {
      const maxA = Math.max(...a[1].map((r) => r.signal_score));
      const maxB = Math.max(...b[1].map((r) => r.signal_score));
      return maxB - maxA;
    });
  }, [filtered]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="border-b px-2 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          All findings ({rows.length})
        </span>
        <input
          type="text"
          placeholder="Search findings\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1 w-full rounded border bg-background px-2 py-0.5 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="mt-1 flex flex-wrap gap-1">
          <FilterSelect
            value={domainFilter ?? ""}
            onChange={(e) => setDomainFilter(e.target.value || null)}
          >
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={severityFilter ?? ""}
            onChange={(e) => setSeverityFilter(e.target.value || null)}
          >
            <option value="">All severities</option>
            <option value="adverse">Adverse</option>
            <option value="warning">Warning</option>
            <option value="normal">Normal</option>
          </FilterSelect>
          <FilterSelect
            value={sexFilter ?? ""}
            onChange={(e) => setSexFilter(e.target.value || null)}
          >
            <option value="">All sexes</option>
            {sexes.map((s) => (
              <option key={s} value={s}>{s === "M" ? "Male" : s === "F" ? "Female" : s}</option>
            ))}
          </FilterSelect>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {grouped.map(([organ, items]) => (
          <OrganGroup
            key={organ}
            organSystem={organ}
            rows={items}
            selectedKey={selectedKey}
            onSelect={onSelect}
          />
        ))}
        {grouped.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            No matches found
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Evidence table ──────────────────────────────────────────

const col = createColumnHelper<SignalSummaryRow>();

function EvidenceTable({
  rows,
  selectedKey,
  onRowClick,
}: {
  rows: SignalSummaryRow[];
  selectedKey: string | null;
  onRowClick: (row: SignalSummaryRow) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "signal_score", desc: true }]);

  const columns = useMemo(
    () => [
      col.accessor("endpoint_label", {
        header: "Endpoint",
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 35 ? info.getValue().slice(0, 35) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      col.accessor("domain", {
        header: "Domain",
        cell: (info) => <DomainLabel domain={info.getValue()} />,
      }),
      col.accessor("organ_system", {
        header: "Organ",
        cell: (info) => <span className="text-muted-foreground">{titleCase(info.getValue())}</span>,
      }),
      col.accessor("dose_label", {
        header: "Dose",
        cell: (info) => <span className="text-muted-foreground">{info.getValue().split(",")[0]}</span>,
      }),
      col.accessor("sex", { header: "Sex" }),
      col.accessor("signal_score", {
        header: "Score",
        cell: (info) => (
          <span className={cn("font-mono", info.getValue() >= 0.6 ? "font-semibold" : "")}>
            {info.getValue().toFixed(2)}
          </span>
        ),
      }),
      col.accessor("p_value", {
        header: "P-value",
        cell: (info) => (
          <span className={cn(
            "ev font-mono",
            info.getValue() == null && "text-muted-foreground",
            info.getValue() != null && info.getValue()! < 0.001 ? "font-semibold" :
            info.getValue() != null && info.getValue()! < 0.01 ? "font-medium" : "",
          )}>
            {formatPValue(info.getValue())}
          </span>
        ),
      }),
      col.accessor("effect_size", {
        header: "Effect",
        cell: (info) => (
          <span className={cn(
            "ev font-mono",
            info.getValue() == null && "text-muted-foreground",
            info.getValue() != null && Math.abs(info.getValue()!) >= 0.8 ? "font-semibold" :
            info.getValue() != null && Math.abs(info.getValue()!) >= 0.5 ? "font-medium" : "",
          )}>
            {formatEffectSize(info.getValue())}
          </span>
        ),
      }),
      col.accessor("direction", {
        header: "Dir",
        cell: (info) => (
          <span className="text-sm text-muted-foreground">{getDirectionSymbol(info.getValue())}</span>
        ),
      }),
      col.accessor("severity", {
        header: "Severity",
        cell: (info) => (
          <span className="inline-block rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-xs" style={{ tableLayout: "auto" }}>
        <thead className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b bg-muted/50">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="cursor-pointer px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
                  onDoubleClick={header.column.getToggleSortingHandler()}
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
            const key = `${orig.endpoint_label}|${orig.dose_level}|${orig.sex}`;
            const isSelected = selectedKey === key;
            return (
              <tr
                key={row.id}
                className={cn(
                  "cursor-pointer border-b transition-colors hover:bg-accent/50",
                  isSelected && "bg-accent",
                )}
                onClick={() => onRowClick(orig)}
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
  );
}

// ─── Summary header for selected endpoint ────────────────────

function EndpointSummaryHeader({ row }: { row: SignalSummaryRow }) {
  return (
    <div className="shrink-0 border-b px-3 py-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">{row.endpoint_label}</h3>
        <DomainLabel domain={row.domain} />
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0 text-[10px]">
        <span>
          <span className="text-muted-foreground">Organ: </span>
          <span className="font-medium">{titleCase(row.organ_system)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Score: </span>
          <span className="font-mono font-semibold">{row.signal_score.toFixed(2)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Pattern: </span>
          <span className="font-medium">{row.dose_response_pattern.replace(/_/g, " ")}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Sex: </span>
          <span className="font-medium">{row.sex}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────

export function AllFindingsOverviewView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: FindingsOverviewSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: signalData, isLoading, error } = useStudySignalSummary(studyId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { width: railWidth, onPointerDown: onRailResize } = useResizePanel(300, 180, 500);

  // Sorted by signal score descending
  const sorted = useMemo(() => {
    if (!signalData) return [];
    return [...signalData].sort((a, b) => b.signal_score - a.signal_score);
  }, [signalData]);

  // Auto-select top on load
  useEffect(() => {
    if (sorted.length > 0 && selectedKey === null) {
      const r = sorted[0];
      const key = `${r.endpoint_label}|${r.dose_level}|${r.sex}`;
      setSelectedKey(key);
      onSelectionChange?.({
        endpoint_label: r.endpoint_label,
        organ_system: r.organ_system,
        sex: r.sex,
        domain: r.domain,
      });
    }
  }, [sorted]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRow = useMemo(() => {
    if (!selectedKey || !signalData) return null;
    return signalData.find((r) => `${r.endpoint_label}|${r.dose_level}|${r.sex}` === selectedKey) ?? null;
  }, [signalData, selectedKey]);

  // All rows for the selected endpoint (across doses/sexes)
  const endpointRows = useMemo(() => {
    if (!selectedRow || !signalData) return [];
    return signalData.filter((r) => r.endpoint_label === selectedRow.endpoint_label);
  }, [signalData, selectedRow]);

  const handleSelect = useCallback(
    (row: SignalSummaryRow) => {
      const key = `${row.endpoint_label}|${row.dose_level}|${row.sex}`;
      setSelectedKey(key);
      onSelectionChange?.({
        endpoint_label: row.endpoint_label,
        organ_system: row.organ_system,
        sex: row.sex,
        domain: row.domain,
      });
    },
    [onSelectionChange],
  );

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
        <span className="text-sm text-muted-foreground">Loading findings data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden max-[1200px]:flex-col">
      {/* Left: Findings rail */}
      <div
        className="shrink-0 border-r max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b max-[1200px]:overflow-x-auto"
        style={{ width: railWidth }}
      >
        <FindingsRail rows={sorted} selectedKey={selectedKey} onSelect={handleSelect} />
      </div>
      <div className="max-[1200px]:hidden">
        <PanelResizeHandle onPointerDown={onRailResize} />
      </div>

      {/* Right: Evidence panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5">
        {selectedRow && (
          <>
            <EndpointSummaryHeader row={selectedRow} />
            <div className="flex shrink-0 items-center gap-0 border-b bg-muted/30">
              <span className="relative px-3 py-1 text-xs font-medium text-foreground">
                Evidence
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
              </span>
              <span className="ml-auto mr-3 text-[10px] text-muted-foreground">
                {endpointRows.length} rows for this endpoint
              </span>
            </div>
            <EvidenceTable rows={endpointRows} selectedKey={selectedKey} onRowClick={handleSelect} />
          </>
        )}

        {!selectedRow && sorted.length > 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a finding to view evidence details.
          </div>
        )}

        {sorted.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No findings data available.
          </div>
        )}
      </div>
    </div>
  );
}
