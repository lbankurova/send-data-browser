/**
 * RelatedSyndromesTable — organ-scope sister table beside DomainDoseRollup.
 *
 * Replaces the prior inline `<SyndromeDoseStrip>` rendering on FindingsView's
 * organ scope. Same data source (SyndromeRollupRow filtered by organ), now
 * rendered via TanStack Table for resizable / sortable columns matching the
 * canonical FindingsTable.tsx pattern. Column sizing persisted via session
 * storage at "pcc.findings.related-syndromes.colSizing".
 *
 * Click semantics: row click triggers onRowClick(row) — FindingsView wires
 * that to F8 cross-scope navigation (push route state with `back`, then call
 * setScopeCallback to switch the rail).
 */

import { useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { useSessionState } from "@/hooks/useSessionState";
import { DoseHeader } from "@/components/ui/DoseLabel";
import { buildDoseLevelMap } from "@/lib/dose-columns";
import type { DoseGroup } from "@/types/analysis";
import type {
  DoseColumn,
  SyndromeRollupRow,
  SyndromeModifierNote,
  SyndromeLoaelRole,
} from "@/types/syndrome-rollup";

interface Props {
  syndromes: SyndromeRollupRow[];
  doseColumns: DoseColumn[];
  doseGroups: DoseGroup[];
  onRowClick?: (row: SyndromeRollupRow) => void;
}

const colHelper = createColumnHelper<SyndromeRollupRow>();

function cellValue(s: SyndromeRollupRow, doseValue: number, phase: "Main Study" | "Recovery"): string | number {
  const key = `${doseValue}:${phase}`;
  const cell = s.by_dose_phase[key];
  if (!cell || cell.n_subjects === 0) return "−";
  return cell.n_subjects;
}

function sumRecovery(s: SyndromeRollupRow): number {
  let total = 0;
  for (const [key, cell] of Object.entries(s.by_dose_phase)) {
    if (key.endsWith(":Recovery")) total += cell.n_subjects;
  }
  return total;
}

function formatConfidence(s: SyndromeRollupRow): string {
  const { HIGH, MODERATE, LOW } = s.confidence_distribution;
  const segments: string[] = [];
  if (HIGH > 0) segments.push(`HIGH${HIGH > 1 ? "×" + HIGH : ""}`);
  if (MODERATE > 0) segments.push(`MOD${MODERATE > 1 ? "×" + MODERATE : ""}`);
  if (LOW > 0) segments.push(`LOW${LOW > 1 ? "×" + LOW : ""}`);
  return segments.join(" · ");
}

const NOTE_LABELS: Record<SyndromeModifierNote, string> = {
  sets_loael: "sets LOAEL",
  mortality_cap: "mortality cap",
  likely_background: "likely background",
  persists_in_recovery: "persists in recovery",
};

function formatNote(notes: SyndromeModifierNote[], loaelRole: SyndromeLoaelRole): string {
  const ordered = notes.filter((n) => n in NOTE_LABELS).map((n) => NOTE_LABELS[n]);
  if (ordered.length === 0 && loaelRole === "drives-loael") return "drives LOAEL";
  return ordered.join(" · ");
}

export function RelatedSyndromesTable({ syndromes, doseColumns, doseGroups, onRowClick }: Props) {
  const doseLevelByValue = useMemo(() => buildDoseLevelMap(doseGroups), [doseGroups]);
  const doseGroupByLevel = useMemo(() => {
    const m = new Map<number, DoseGroup>();
    for (const dg of doseGroups) {
      if (!m.has(dg.dose_level)) m.set(dg.dose_level, dg);
    }
    return m;
  }, [doseGroups]);
  const [sorting, setSorting] = useSessionState<SortingState>(
    "pcc.findings.related-syndromes.sorting",
    [],
  );
  const [columnSizing, setColumnSizing] = useSessionState<ColumnSizingState>(
    "pcc.findings.related-syndromes.colSizing",
    {},
  );
  const resizingRef = useRef(false);

  const columns = useMemo(() => {
    return [
      colHelper.accessor("syndrome_name", {
        id: "name",
        header: "Related syndrome",
        size: 200,
        cell: (info) => (
          <span>
            {info.getValue()}
            {info.row.original.loael_role === "sets-loael" && (
              <span
                className="ml-1 text-[10px]"
                style={{ color: "#ca8a04" }}
                title="Sets the LOAEL"
              >
                {"★"}
              </span>
            )}
          </span>
        ),
      }),
      colHelper.accessor((row) => Number(cellValue(row, 0, "Main Study")) || 0, {
        id: "ctrl",
        header: () => <DoseHeader level={0} label="Ctrl" />,
        size: 50,
        cell: (info) => <span className="tabular-nums">{cellValue(info.row.original, 0, "Main Study")}</span>,
      }),
      ...doseColumns.map((c) => {
        const dl = doseLevelByValue.get(c.dose_value);
        const dg = dl != null ? doseGroupByLevel.get(dl) : null;
        return colHelper.accessor((row) => Number(cellValue(row, c.dose_value, "Main Study")) || 0, {
          id: `dose_${c.dose_value}`,
          header: () => (
            <DoseHeader level={dl ?? 0} label={dg?.short_label ?? c.label} color={dg?.display_color} />
          ),
          size: 60,
          cell: (info) => (
            <span className="tabular-nums">{cellValue(info.row.original, c.dose_value, "Main Study")}</span>
          ),
        });
      }),
      colHelper.accessor((row) => sumRecovery(row), {
        id: "rec",
        header: "Rec",
        size: 50,
        cell: (info) => {
          const v = sumRecovery(info.row.original);
          return <span className="tabular-nums">{v === 0 ? "−" : v}</span>;
        },
      }),
      colHelper.accessor("n_subjects_total", {
        id: "n",
        header: "N",
        size: 50,
        cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
      }),
      colHelper.accessor((row) => formatConfidence(row), {
        id: "confidence",
        header: "Confidence",
        size: 180,
        cell: (info) => {
          const s = info.row.original;
          const conf = formatConfidence(s);
          const note = formatNote(s.modifier_notes, s.loael_role);
          const sep = conf && note ? " · " : "";
          return (
            <span className="text-muted-foreground">
              {conf}
              {sep}
              {note}
            </span>
          );
        },
      }),
    ];
  }, [doseColumns, doseLevelByValue, doseGroupByLevel]);

  const table = useReactTable({
    data: syndromes,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  if (syndromes.length === 0 || doseColumns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        No related syndromes for this organ.
      </div>
    );
  }

  function colStyle(colId: string) {
    const manualWidth = columnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    const c = table.getColumn(colId);
    const size = c?.getSize();
    return size ? { width: size, maxWidth: size } : { width: 1, whiteSpace: "nowrap" as const };
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b bg-muted/30">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="relative cursor-pointer px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
                  style={colStyle(header.id)}
                  onClick={(e) => {
                    if (resizingRef.current) return;
                    header.column.getToggleSortingHandler()?.(e);
                  }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                  <div
                    onMouseDown={(e) => {
                      resizingRef.current = true;
                      const clear = () => {
                        setTimeout(() => { resizingRef.current = false; }, 0);
                        document.removeEventListener("mouseup", clear);
                      };
                      document.addEventListener("mouseup", clear);
                      header.getResizeHandler()(e);
                    }}
                    onTouchStart={header.getResizeHandler()}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "absolute -right-1 top-0 z-10 h-full w-3 cursor-col-resize select-none touch-none",
                      header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30",
                    )}
                  />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "border-b transition-colors hover:bg-accent/50",
                onRowClick && "cursor-pointer",
              )}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-1.5 py-px"
                  style={colStyle(cell.column.id)}
                  data-evidence=""
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
