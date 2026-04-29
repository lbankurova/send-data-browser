/**
 * DomainDoseRollup — domain x dose summary table for FindingsView's
 * organ/syndrome scope center pane (replaces OrganToxicityRadar +
 * GroupForestPlot's mixed-domain spatial encodings).
 *
 * Cell encoding splits three ways by domain class:
 *   - Continuous (LB/BW/OM/EG/VS/BG/FW): n_significant / n_endpoints,
 *     `*` superscript when n_significant > 0.
 *   - Severity-graded (MI): worst severity label x count, rendered as a
 *     getSeverityGradeColor-filled chip.
 *   - Pure-incidence (MA/CL/TF/DS): n_affected / n_total, BINARY_AFFECTED_FILL
 *     background when affected > 0; `*` when any pairwise p_adj < 0.05.
 *
 * Rendered via TanStack Table (canonical FindingsTable.tsx pattern):
 *   useReactTable + createColumnHelper + ColumnSizingState persisted via
 *   useSessionState("pcc.findings.domain-dose-rollup.colSizing"). Resizable
 *   columns; sortable headers (click = sort, drag handle on right = resize).
 *   Dose column headers use <DoseHeader> with display_color underline so the
 *   colored bar matches FindingsTable's bottom dose stripe.
 *
 * Per-cell fragility (dotted underline) renders when any endpoint contributing
 * to that specific dose cell has looStability < 0.8 OR endpointConfidence
 * integrated grade === 'low'.
 *
 * Rightmost column "1st adv. dose": lowest dose where any endpoint in the
 * domain has worstSeverity='adverse' AND treatmentRelated=true. `<= {dose}`
 * prefix when the lowest tested dose is itself adverse (BUG-031 below-lowest
 * case).
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
import { DomainLabel } from "@/components/ui/DomainLabel";
import { DoseHeader } from "@/components/ui/DoseLabel";
import {
  getSeverityGradeColor,
  BINARY_AFFECTED_FILL,
} from "@/lib/severity-colors";
import { CONTINUOUS_DOMAINS, INCIDENCE_DOMAINS } from "@/lib/domain-types";
import { buildDoseColumns, buildDoseLevelMap } from "@/lib/dose-columns";
import { buildDomainRows } from "@/lib/domain-rollup-aggregator";
import type { CellResult, DomainRow } from "@/lib/domain-rollup-aggregator";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { NoaelSummaryRow } from "@/types/analysis-views";

interface Props {
  endpoints: EndpointSummary[];
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  noaelData: NoaelSummaryRow[];
  onDomainClick?: (domain: string) => void;
  onDoseClick?: (doseLevel: number) => void;
}

const colHelper = createColumnHelper<DomainRow>();

function CellView({ cell, domain }: { cell: CellResult; domain: string }) {
  if (cell.empty) return <span className="text-muted-foreground/50">{"—"}</span>;

  const isMI = domain === "MI";
  const isIncidence = INCIDENCE_DOMAINS.has(domain);
  const isContinuous = CONTINUOUS_DOMAINS.has(domain);

  let style: React.CSSProperties | undefined;
  let chip = false;
  if (isMI && cell.severityGrade != null && cell.severityGrade > 0) {
    const c = getSeverityGradeColor(cell.severityGrade);
    style = { backgroundColor: c.bg, color: c.text };
    chip = true;
  } else if (isIncidence && cell.affected != null && cell.affected > 0) {
    style = { backgroundColor: BINARY_AFFECTED_FILL, color: "var(--foreground)" };
    chip = true;
  }

  const fragileTitle = cell.fragile
    ? `${cell.fragileCount} endpoint(s) in this cell are LOO-fragile or LOW confidence — verify with bottom table`
    : undefined;

  let title = fragileTitle;
  if (isContinuous) {
    title = `${cell.content} (n_significant / n_endpoints) at this dose${cell.sig ? "; * = at least one endpoint reaches p_adj < 0.05" : ""}${fragileTitle ? ` · ${fragileTitle}` : ""}`;
  } else if (isMI && cell.severityGrade != null) {
    title = `Worst severity grade ${cell.severityGrade} at this dose · ${cell.content} endpoints${fragileTitle ? ` · ${fragileTitle}` : ""}`;
  } else if (isIncidence) {
    title = `${cell.affected ?? 0}/${cell.total ?? 0} animals affected at this dose${cell.sig ? " · * = pairwise p_adj < 0.05" : ""}${fragileTitle ? ` · ${fragileTitle}` : ""}`;
  }

  // For MI: render the count alone — the chip color IS the severity. For
  // incidence: render n_aff/n_total — the chip fill IS the affected indicator.
  // For continuous: render n_sig/n_endpoints with the * marker.
  const display = isMI
    ? (cell.severityCount != null ? String(cell.severityCount) : cell.content)
    : cell.content;

  return (
    <span
      className={cn(
        chip && "rounded px-1 font-mono tabular-nums",
        cell.fragile && !chip && "underline decoration-dotted decoration-amber-500 underline-offset-2",
      )}
      style={style}
      title={title}
    >
      {display}
      {cell.sig && (
        <sup
          className="ml-0.5 text-foreground"
          title="* = at least one endpoint in this domain reaches pairwise p_adj < 0.05 at this dose"
        >
          *
        </sup>
      )}
    </span>
  );
}

export function DomainDoseRollup({
  endpoints,
  findings,
  doseGroups,
  noaelData,
  onDomainClick,
  onDoseClick,
}: Props) {
  const doseColumns = useMemo(
    () => buildDoseColumns(doseGroups, noaelData),
    [doseGroups, noaelData],
  );
  const doseLevelByValue = useMemo(() => buildDoseLevelMap(doseGroups), [doseGroups]);
  const doseGroupByLevel = useMemo(() => {
    const m = new Map<number, DoseGroup>();
    for (const dg of doseGroups) {
      if (!m.has(dg.dose_level)) m.set(dg.dose_level, dg);
    }
    return m;
  }, [doseGroups]);

  const rows = useMemo(
    () => buildDomainRows(endpoints, findings, doseColumns, doseLevelByValue),
    [endpoints, findings, doseColumns, doseLevelByValue],
  );

  const [sorting, setSorting] = useSessionState<SortingState>(
    "pcc.findings.domain-dose-rollup.sorting",
    [],
  );
  const [columnSizing, setColumnSizing] = useSessionState<ColumnSizingState>(
    "pcc.findings.domain-dose-rollup.colSizing",
    {},
  );
  const resizingRef = useRef(false);

  const columns = useMemo(() => {
    return [
      colHelper.accessor("domain", {
        id: "domain",
        header: () => <span title="Domain">Dom.</span>,
        size: 80,
        cell: (info) => (
          <span className="flex items-center gap-1">
            <DomainLabel domain={info.getValue()} />
            <span className="text-[10px] text-muted-foreground">
              ({info.row.original.nEndpoints})
            </span>
          </span>
        ),
      }),
      colHelper.accessor((row) => row.ctrlCell.content, {
        id: "ctrl",
        header: () => <DoseHeader level={0} label="Ctrl" />,
        size: 60,
        cell: (info) => <CellView cell={info.row.original.ctrlCell} domain={info.row.original.domain} />,
      }),
      ...doseColumns.map((c, i) => {
        const dl = doseLevelByValue.get(c.dose_value);
        const dg = dl != null ? doseGroupByLevel.get(dl) : null;
        return colHelper.accessor((row) => row.cells[i]?.content ?? "", {
          id: `dose_${c.dose_value}`,
          header: () => {
            const interactive = onDoseClick && dl != null;
            return (
              <span
                className={cn(interactive && "cursor-pointer hover:text-foreground")}
                title={interactive ? `Filter rail to dose ${c.label}` : undefined}
                onClick={
                  interactive
                    ? (e) => {
                        e.stopPropagation();
                        onDoseClick(dl);
                      }
                    : undefined
                }
              >
                <DoseHeader
                  level={dl ?? 0}
                  label={dg?.short_label ?? c.label}
                  color={dg?.display_color}
                />
              </span>
            );
          },
          size: 70,
          cell: (info) => (
            <CellView
              cell={info.row.original.cells[i] ?? {
                content: "—", sig: false, fragile: false, fragileCount: 0, empty: true,
              }}
              domain={info.row.original.domain}
            />
          ),
          enableSorting: false,
        });
      }),
      colHelper.accessor("firstAdverseLabel", {
        id: "firstAdverse",
        header: () => (
          <span title="Lowest dose at which any endpoint in this domain shows worstSeverity='adverse' AND treatmentRelated=true. ≤ prefix when the lowest tested dose is itself adverse.">
            1st adv. dose
          </span>
        ),
        size: 100,
        cell: (info) => {
          const v = info.getValue();
          return v ? (
            <span className="font-mono">{v}</span>
          ) : (
            <span className="text-muted-foreground/60" title="No adverse + treatment-related endpoints in scope at any tested dose">
              {"> HD"}
            </span>
          );
        },
      }),
    ];
  }, [doseColumns, doseLevelByValue, doseGroupByLevel, onDoseClick]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  if (doseColumns.length === 0 || rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        No domain endpoints in this scope.
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
                onDomainClick && "cursor-pointer",
              )}
              onClick={onDomainClick ? () => onDomainClick(row.original.domain) : undefined}
              title={onDomainClick ? `Filter rail to ${row.original.domain}` : undefined}
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
