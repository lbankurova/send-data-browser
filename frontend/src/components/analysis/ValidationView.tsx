import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

export interface ValidationIssue {
  rule_id: string;
  severity: "Error" | "Warning" | "Info";
  domain: string;
  category: string;
  description: string;
  records_affected: number;
}

const HARDCODED_ISSUES: ValidationIssue[] = [
  {
    rule_id: "SD1002",
    severity: "Error",
    domain: "DM",
    category: "Required Variable",
    description:
      "RFSTDTC (Reference Start Date) is missing for 3 subjects in DM domain",
    records_affected: 3,
  },
  {
    rule_id: "SD1019",
    severity: "Error",
    domain: "EX",
    category: "Controlled Terminology",
    description:
      "EXROUTE contains non-standard value 'ORAL GAVAGE' — expected 'ORAL GAVAGE' per CDISC CT",
    records_affected: 48,
  },
  {
    rule_id: "SD0064",
    severity: "Warning",
    domain: "BW",
    category: "Data Consistency",
    description:
      "Body weight decrease >20% between consecutive visits for 2 subjects without corresponding CL record",
    records_affected: 2,
  },
  {
    rule_id: "SD1035",
    severity: "Warning",
    domain: "MI",
    category: "Controlled Terminology",
    description:
      "MISTRESC values not mapped to SEND controlled terminology for 12 microscopic findings",
    records_affected: 12,
  },
  {
    rule_id: "SD0083",
    severity: "Warning",
    domain: "LB",
    category: "Range Check",
    description:
      "LBSTRESN values outside expected physiological range for ALT in 5 records",
    records_affected: 5,
  },
  {
    rule_id: "SD0021",
    severity: "Info",
    domain: "TS",
    category: "Metadata",
    description:
      "TSVAL for SDESIGN (Study Design) uses free text — consider using controlled terminology",
    records_affected: 1,
  },
  {
    rule_id: "SD0045",
    severity: "Info",
    domain: "TA",
    category: "Metadata",
    description:
      "Trial Arms domain has 4 arms defined but only 3 dose groups found in EX domain",
    records_affected: 1,
  },
  {
    rule_id: "SD0092",
    severity: "Info",
    domain: "SUPPMI",
    category: "Supplemental",
    description:
      "SUPP qualifier QNAM='MISEV' could be represented using standard --SEV variable in MI",
    records_affected: 24,
  },
];

const SEVERITY_STYLES: Record<string, string> = {
  Error: "bg-red-100 text-red-800 border-red-200",
  Warning: "bg-amber-100 text-amber-800 border-amber-200",
  Info: "bg-blue-100 text-blue-800 border-blue-200",
};

const columnHelper = createColumnHelper<ValidationIssue>();

const columns = [
  columnHelper.accessor("rule_id", {
    header: "Rule",
    size: 80,
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("severity", {
    header: "Severity",
    size: 90,
    cell: (info) => {
      const sev = info.getValue();
      return (
        <span
          className={cn(
            "inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
            SEVERITY_STYLES[sev]
          )}
        >
          {sev}
        </span>
      );
    },
  }),
  columnHelper.accessor("domain", {
    header: "Domain",
    size: 70,
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("category", {
    header: "Category",
    size: 140,
  }),
  columnHelper.accessor("description", {
    header: "Description",
    size: 400,
  }),
  columnHelper.accessor("records_affected", {
    header: "Records",
    size: 70,
    cell: (info) => (
      <span className="tabular-nums">{info.getValue()}</span>
    ),
  }),
];

interface Props {
  onSelectionChange?: (issue: ValidationIssue | null) => void;
}

export function ValidationView({ onSelectionChange }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const errors = HARDCODED_ISSUES.filter((i) => i.severity === "Error").length;
    const warnings = HARDCODED_ISSUES.filter(
      (i) => i.severity === "Warning"
    ).length;
    const info = HARDCODED_ISSUES.filter((i) => i.severity === "Info").length;
    return { errors, warnings, info };
  }, []);

  const table = useReactTable({
    data: HARDCODED_ISSUES,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Summary header */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">SEND Validation</h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "#dc2626" }}
            />
            <span className="font-medium">{counts.errors}</span>
            <span className="text-muted-foreground">errors</span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "#d97706" }}
            />
            <span className="font-medium">{counts.warnings}</span>
            <span className="text-muted-foreground">warnings</span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "#2563eb" }}
            />
            <span className="font-medium">{counts.info}</span>
            <span className="text-muted-foreground">info</span>
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ background: "#f8f8f8" }}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {{
                        asc: " \u2191",
                        desc: " \u2193",
                      }[header.column.getIsSorted() as string] ?? null}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isSelected = selectedRuleId === row.original.rule_id;
              return (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b transition-colors last:border-b-0"
                  style={{
                    background: isSelected
                      ? "var(--selection-bg)"
                      : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--hover-bg)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      isSelected ? "var(--selection-bg)" : "";
                  }}
                  onClick={() => {
                    const next = isSelected ? null : row.original;
                    setSelectedRuleId(next?.rule_id ?? null);
                    onSelectionChange?.(next);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 text-xs">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
