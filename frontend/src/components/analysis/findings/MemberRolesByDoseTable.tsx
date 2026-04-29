/**
 * MemberRolesByDoseTable — syndrome scope center-pane top-region.
 *
 * Source: getSyndromeTermReport(syndromeId, endpoints, sexes), reshaped via
 * buildMemberRolesRows into one row per term (required + supporting), sorted
 * by domain (alphabetical) then required-first then alphabetical. The table
 * inserts a domain header row whenever the domain key changes between
 * consecutive rows (LB (4), MI (1), OM (1), ...) — domain becomes the
 * row-grouping dimension so cross-domain corroboration reads at a glance.
 *
 * Columns (post 2026-04-29 design audit, second pass):
 *   - Endpoint — UPPERCASE, em-dashed for MI/MA matched (specimen + finding,
 *     modifier suffix dropped); short testCode form for LB/BW/etc.; never
 *     sentence case. Direction arrow from the term's direction (load-bearing —
 *     wrong arrow can flip syndrome interpretation). Tooltip carries the full
 *     canonical name including any modifier.
 *   - Role — "req." / "sup." with tooltip ("required" / "supporting").
 *   - Ctrl + treated dose columns — value + endpoint direction arrow + p
 *     tooltip; severity-graded MI cells use getSeverityGradeColor chip;
 *     incidence cells use BINARY_AFFECTED_FILL.
 *
 * Status column dropped (revisit after this pass lands). Required-met banner
 * above the table is unchanged.
 *
 * Rendered via TanStack Table; column sizing persists at
 * "pcc.findings.member-roles.colSizing".
 */

import { useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { ColumnSizingState } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { useSessionState } from "@/hooks/useSessionState";
import { DoseHeader } from "@/components/ui/DoseLabel";
import {
  formatPValue,
  getSeverityGradeColor,
  BINARY_AFFECTED_FILL,
} from "@/lib/severity-colors";
import { CONTINUOUS_DOMAINS, INCIDENCE_DOMAINS } from "@/lib/domain-types";
import { buildDoseColumns, buildDoseLevelMap } from "@/lib/dose-columns";
import { buildPerEndpointCellRich } from "@/lib/domain-rollup-aggregator";
import type { PerEndpointCell } from "@/lib/domain-rollup-aggregator";
import { getSyndromeTermReport } from "@/lib/cross-domain-syndromes";
import { buildBannerSpec, buildMemberRolesRows } from "@/lib/member-roles-row";
import type { MemberRolesRow } from "@/lib/member-roles-row";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { NoaelSummaryRow } from "@/types/analysis-views";

interface Props {
  syndromeId: string;
  endpoints: EndpointSummary[];
  syndromeSexes: string[];
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  noaelData: NoaelSummaryRow[];
}

const colHelper = createColumnHelper<MemberRolesRow>();

function DirectionGlyph({ d, className }: { d: "up" | "down" | null; className?: string }) {
  if (d === "up") return <span className={cn("text-foreground/70", className)}>↑</span>;
  if (d === "down") return <span className={cn("text-foreground/70", className)}>↓</span>;
  return null;
}

function DoseCellView({
  cell,
  domain,
  rowDirection,
  doseLabel,
}: {
  cell: PerEndpointCell;
  domain: string;
  rowDirection: "up" | "down" | null;
  doseLabel: string;
}) {
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

  const dir = cell.direction ?? rowDirection;
  const pPart = cell.pValue != null ? `p_adj=${formatPValue(cell.pValue)}` : "no pairwise at this dose";
  const nPart = cell.n != null ? `N=${cell.n}` : "";
  const sigNote = isContinuous && cell.sig ? "* = pairwise p_adj < 0.05" : "";
  const tooltip = [doseLabel, pPart, nPart, sigNote].filter(Boolean).join(" · ");

  // For MI: render the severity COUNT alone — chip color IS the severity.
  // For continuous: just the * marker (significance) — direction arrow shown
  // adjacent. For incidence: n_aff/n_total — chip fill IS affected indicator.
  const display = isContinuous
    ? (cell.sig ? "*" : "")
    : (isMI && cell.severityCount != null
        ? String(cell.severityCount)
        : cell.content);

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", chip && "rounded px-1 font-mono")}
      style={style}
      title={tooltip}
    >
      {dir && <DirectionGlyph d={dir} />}
      <span className={isContinuous ? "tabular-nums" : ""}>{display}</span>
    </span>
  );
}

export function MemberRolesByDoseTable({
  syndromeId,
  endpoints,
  syndromeSexes,
  findings,
  doseGroups,
  noaelData,
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

  const findingsByEndpoint = useMemo(() => {
    const m = new Map<string, UnifiedFinding[]>();
    for (const f of findings) {
      const key = f.endpoint_label ?? "";
      if (!key) continue;
      let arr = m.get(key);
      if (!arr) {
        arr = [];
        m.set(key, arr);
      }
      arr.push(f);
    }
    return m;
  }, [findings]);

  const rows = useMemo(
    () => buildMemberRolesRows(syndromeId, endpoints, syndromeSexes),
    [syndromeId, endpoints, syndromeSexes],
  );

  /** Per-domain row counts for the group-header labels. */
  const rowsByDomain = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.domain, (m.get(r.domain) ?? 0) + 1);
    return m;
  }, [rows]);

  const report = useMemo(
    () => getSyndromeTermReport(syndromeId, endpoints, syndromeSexes),
    [syndromeId, endpoints, syndromeSexes],
  );

  const bannerSpec = useMemo(() => report ? buildBannerSpec(report) : null, [report]);

  const [columnSizing, setColumnSizing] = useSessionState<ColumnSizingState>(
    "pcc.findings.member-roles.colSizing",
    {},
  );
  const resizingRef = useRef(false);

  const columns = useMemo(() => {
    return [
      colHelper.accessor("displayLabel", {
        id: "endpoint",
        header: "Endpoint",
        size: 200,
        cell: (info) => (
          <span
            className="overflow-hidden text-ellipsis whitespace-nowrap font-mono"
            title={info.row.original.displayTooltip}
          >
            {info.getValue()}
          </span>
        ),
      }),
      colHelper.accessor("role", {
        id: "role",
        header: "Role",
        size: 50,
        cell: (info) => {
          const r = info.getValue();
          return (
            <span
              className="text-[10px] text-muted-foreground"
              title={r === "required" ? "Required term" : "Supporting term"}
            >
              {r === "required" ? "req." : "sup."}
            </span>
          );
        },
      }),
      colHelper.accessor((row) => row.endpointLabel ?? "", {
        id: "ctrl",
        header: () => <DoseHeader level={0} label="Ctrl" />,
        size: 50,
        cell: (info) => {
          const ep = info.row.original.endpointLabel;
          if (!ep) return <span className="text-muted-foreground/50">{"—"}</span>;
          const fs = findingsByEndpoint.get(ep) ?? [];
          const c = buildPerEndpointCellRich(info.row.original.domain, fs, 0);
          return (
            <DoseCellView
              cell={c}
              domain={info.row.original.domain}
              rowDirection={info.row.original.direction}
              doseLabel="Ctrl"
            />
          );
        },
      }),
      ...doseColumns.map((c) => {
        const dl = doseLevelByValue.get(c.dose_value);
        const dg = dl != null ? doseGroupByLevel.get(dl) : null;
        return colHelper.accessor((row) => row.endpointLabel ?? "", {
          id: `dose_${c.dose_value}`,
          header: () => (
            <DoseHeader
              level={dl ?? 0}
              label={dg?.short_label ?? c.label}
              color={dg?.display_color}
            />
          ),
          size: 60,
          cell: (info) => {
            const ep = info.row.original.endpointLabel;
            if (!ep) return <span className="text-muted-foreground/50">{"—"}</span>;
            if (dl == null) return <span className="text-muted-foreground/50">{"—"}</span>;
            const fs = findingsByEndpoint.get(ep) ?? [];
            const cellInfo = buildPerEndpointCellRich(info.row.original.domain, fs, dl);
            return (
              <DoseCellView
                cell={cellInfo}
                domain={info.row.original.domain}
                rowDirection={info.row.original.direction}
                doseLabel={dg?.short_label ?? c.label}
              />
            );
          },
        });
      }),
    ];
  }, [doseColumns, doseLevelByValue, doseGroupByLevel, findingsByEndpoint]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  if (doseColumns.length === 0 || rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        No syndrome member endpoints in scope.
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

  /** Walk the pre-sorted rows, emitting a domain header tr whenever the
   *  domain key changes. The buildMemberRolesRows ordering guarantees
   *  contiguous per-domain blocks. */
  let lastDomain: string | null = null;
  const tableRows = table.getRowModel().rows;
  const tbodyContent: React.ReactNode[] = [];
  for (const row of tableRows) {
    const d = row.original.domain;
    if (d !== lastDomain) {
      tbodyContent.push(
        <tr key={`group-${d}`}>
          <td
            colSpan={columns.length}
            className="bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {d} ({rowsByDomain.get(d) ?? 0})
          </td>
        </tr>,
      );
      lastDomain = d;
    }
    tbodyContent.push(
      <tr key={row.id} className="border-b transition-colors hover:bg-accent/50">
        {row.getVisibleCells().map((cell) => (
          <td key={cell.id} className="px-1.5 py-px" style={colStyle(cell.column.id)} data-evidence="">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>,
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {bannerSpec && (
        <div
          className="border-b bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground"
          title={
            bannerSpec.kind === "supporting"
              ? "Syndrome fired via supporting-evidence fallback (>= 3 supporting matched). Required path was NOT met."
              : `Syndrome rule: ${bannerSpec.ruleText} AND >= ${bannerSpec.minDomains} domain${bannerSpec.minDomains === 1 ? "" : "s"} covered.`
          }
        >
          {bannerSpec.kind === "supporting" ? (
            <>
              <span className="font-semibold">Met via supporting evidence:</span>{" "}
              <span className="tabular-nums">{bannerSpec.supportingMet}</span> endpoints
              {" "}across <span className="tabular-nums">{bannerSpec.domainsCovered}</span> domains
              {" · "}required: not met
            </>
          ) : (
            <>
              <span className="font-semibold">Met:</span> {bannerSpec.ruleText} AND ≥{" "}
              <span className="tabular-nums">{bannerSpec.minDomains}</span>{" "}
              domain{bannerSpec.minDomains === 1 ? "" : "s"}
            </>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/30">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="relative px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    style={colStyle(header.id)}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
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
          <tbody>{tbodyContent}</tbody>
        </table>
      </div>
    </div>
  );
}
