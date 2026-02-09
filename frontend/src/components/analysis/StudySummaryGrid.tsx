import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { SignalSummaryRow, SignalSelection } from "@/types/analysis-views";
import {
  getSignalScoreColor,
  getDomainBadgeColor,
  getSexColor,
  formatPValue,
  getDirectionSymbol,
  getDirectionColor,
} from "@/lib/severity-colors";

const columnHelper = createColumnHelper<SignalSummaryRow>();

interface Props {
  data: SignalSummaryRow[];
  selection: SignalSelection | null;
  onSelect: (sel: SignalSelection | null) => void;
}

export function StudySummaryGrid({ data, selection, onSelect }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "signal_score", desc: true },
  ]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const columns = useMemo(
    () => [
      columnHelper.accessor("endpoint_label", {
        header: "Endpoint",
        size: 200,
        cell: (info) => (
          <span className="truncate text-xs" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("endpoint_type", {
        header: "Type",
        size: 100,
        cell: (info) => {
          const v = info.getValue();
          return (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
              {v.replace(/_/g, " ")}
            </span>
          );
        },
      }),
      columnHelper.accessor("organ_system", {
        header: "Organ",
        size: 100,
        cell: (info) => (
          <span className="text-xs">{info.getValue().replace(/_/g, " ")}</span>
        ),
      }),
      columnHelper.accessor("dose_label", {
        header: "Dose",
        size: 80,
        cell: (info) => (
          <span className="text-xs font-medium">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("sex", {
        header: "Sex",
        size: 40,
        cell: (info) => (
          <span
            className="text-xs font-semibold"
            style={{ color: getSexColor(info.getValue()) }}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("signal_score", {
        header: "Signal",
        size: 70,
        cell: (info) => {
          const v = info.getValue();
          return (
            <span
              className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: getSignalScoreColor(v) }}
            >
              {v.toFixed(2)}
            </span>
          );
        },
      }),
      columnHelper.accessor("direction", {
        header: "Dir",
        size: 40,
        cell: (info) => {
          const v = info.getValue();
          return (
            <span className={`text-sm font-bold ${getDirectionColor(v)}`}>
              {getDirectionSymbol(v)}
            </span>
          );
        },
      }),
      columnHelper.accessor("p_value", {
        header: "P-val",
        size: 70,
        cell: (info) => (
          <span className="font-mono text-[11px]">
            {formatPValue(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("trend_p", {
        header: "Trend",
        size: 70,
        cell: (info) => (
          <span className="font-mono text-[11px]">
            {formatPValue(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("effect_size", {
        header: "d",
        size: 60,
        cell: (info) => {
          const v = info.getValue();
          return (
            <span className="font-mono text-[11px]">
              {v != null ? v.toFixed(2) : "\u2014"}
            </span>
          );
        },
      }),
      columnHelper.accessor("statistical_flag", {
        header: "Stat",
        size: 30,
        cell: (info) => (
          <span className="text-xs">
            {info.getValue() ? "\u2713" : ""}
          </span>
        ),
      }),
      columnHelper.accessor("dose_response_flag", {
        header: "DR",
        size: 30,
        cell: (info) => (
          <span className="text-xs">
            {info.getValue() ? "\u2713" : ""}
          </span>
        ),
      }),
      columnHelper.accessor("domain", {
        header: "Dom",
        size: 50,
        cell: (info) => {
          const v = info.getValue();
          const c = getDomainBadgeColor(v);
          return (
            <span
              className={`rounded px-1 py-0.5 text-[10px] font-semibold ${c.bg} ${c.text}`}
            >
              {v}
            </span>
          );
        },
      }),
    ],
    []
  );

  const table = useReactTable({
    data,
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
    <div className="overflow-auto">
      <table className="text-xs" style={{ width: table.getCenterTotalSize(), tableLayout: "fixed" }}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b bg-muted/50">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="relative cursor-pointer px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  style={{ width: header.getSize() }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {header.column.getIsSorted() === "asc" && " \u25b2"}
                  {header.column.getIsSorted() === "desc" && " \u25bc"}
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
            const rowData = row.original;
            const isSelected =
              selection &&
              selection.endpoint_label === rowData.endpoint_label &&
              selection.dose_level === rowData.dose_level &&
              selection.sex === rowData.sex;

            return (
              <tr
                key={row.id}
                className={`cursor-pointer border-b transition-colors hover:bg-accent/30 ${
                  isSelected ? "bg-accent" : ""
                }`}
                onClick={() => {
                  if (isSelected) {
                    onSelect(null);
                  } else {
                    onSelect({
                      endpoint_label: rowData.endpoint_label,
                      dose_level: rowData.dose_level,
                      sex: rowData.sex,
                      domain: rowData.domain,
                      test_code: rowData.test_code,
                      organ_system: rowData.organ_system,
                    });
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-1" style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No signals match current filters
        </div>
      )}
    </div>
  );
}
