import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { EyeOff } from "lucide-react";
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
import { DoseHeader } from "@/components/ui/DoseLabel";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useSessionState } from "@/hooks/useSessionState";
import { getSignalTier } from "@/lib/findings-rail-engine";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

const col = createColumnHelper<UnifiedFinding>();

/** The absorber column — takes remaining space */
const ABSORBER_ID = "finding";

interface FindingsTableProps {
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  signalScores?: Map<string, number>;
  excludedEndpoints?: Set<string>;
  onToggleExclude?: (label: string) => void;
}

export function FindingsTable({ findings, doseGroups, signalScores, excludedEndpoints, onToggleExclude }: FindingsTableProps) {
  const { selectedFindingId, selectFinding } = useFindingSelection();
  const [sorting, setSorting] = useSessionState<SortingState>("pcc.findings.sorting", []);
  const [columnSizing, setColumnSizing] = useSessionState<ColumnSizingState>("pcc.findings.columnSizing", {});

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
        header: "Day",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue() ?? "\u2014"}</span>
        ),
      }),
      ...doseGroups.map((dg, idx) => {
        // Short labels: control → "C", non-zero → numeric only
        const shortLabel = dg.dose_level === 0 ? "C" : String(dg.dose_value ?? formatDoseShortLabel(dg.label));
        const fullLabel = dg.dose_value != null && dg.dose_unit
          ? `${dg.dose_value} ${dg.dose_unit}` : dg.label;
        // Extract unit from first dose group that has one
        const unit = idx === 0 ? (doseGroups.find((d) => d.dose_unit)?.dose_unit ?? undefined) : undefined;
        return col.display({
          id: `dose_${dg.dose_level}`,
          header: () => (
            <DoseHeader
              level={dg.dose_level}
              label={shortLabel}
              tooltip={fullLabel}
              unitLabel={unit}
            />
          ),
          cell: (info) => {
            const f = info.row.original;
            const gs = f.group_stats.find((g) => g.dose_level === dg.dose_level);
            if (!gs) return "\u2014";
            if (f.data_type === "continuous") {
              return <span className="font-mono">{gs.mean != null ? gs.mean.toFixed(2) : "\u2014"}</span>;
            }
            return (
              <span className="font-mono">
                {gs.affected != null && gs.n ? `${gs.affected}/${gs.n}` : "\u2014"}
              </span>
            );
          },
        });
      }),
      col.accessor("min_p_adj", {
        header: "P-value",
        cell: (info) => (
          <span className="ev font-mono text-muted-foreground">{formatPValue(info.getValue())}</span>
        ),
      }),
      col.accessor("trend_p", {
        header: "Trend",
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
        cell: (info) => (
          <span className="ev font-mono text-muted-foreground">{formatEffectSize(info.getValue())}</span>
        ),
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
    [doseGroups, signalScores, excludedEndpoints, onToggleExclude]
  );

  const table = useReactTable({
    data: findings,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  /** Content-hugging: non-absorber columns shrink to fit; absorber takes the rest.
   *  Manual resize overrides with an explicit width. */
  function colStyle(colId: string) {
    const manualWidth = columnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    if (colId === ABSORBER_ID) return { width: "100%" };
    return { width: 1, whiteSpace: "nowrap" as const };
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[10px]">
        <thead className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b bg-muted/30">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold text-muted-foreground hover:bg-accent/50"
                  style={colStyle(header.id)}
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
            const isSelected = selectedFindingId === row.original.id;
            return (
              <tr
                key={row.id}
                className={cn(
                  "cursor-pointer border-b transition-colors hover:bg-accent/50",
                  isSelected && "bg-accent font-medium"
                )}
                data-selected={isSelected || undefined}
                onClick={() => selectFinding(isSelected ? null : row.original)}
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
          })}
        </tbody>
      </table>
      {findings.length === 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground">
          No findings match the current filters.
        </div>
      )}
    </div>
  );
}
