import { useState, useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from "@tanstack/react-table";
import { Columns3, Search, Eye, EyeOff } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { ColumnInfo } from "@/types";

interface DataTableProps {
  columns: ColumnInfo[];
  rows: Record<string, string | null>[];
}

export function DataTable({ columns, rows }: DataTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [search, setSearch] = useState("");

  const tableColumns: ColumnDef<Record<string, string | null>>[] = columns.map(
    (col) => ({
      accessorKey: col.name,
      header: () => (
        <div>
          <div className="font-semibold">{col.name}</div>
          {col.label && (
            <div className="text-xs font-normal text-muted-foreground">
              {col.label}
            </div>
          )}
        </div>
      ),
      cell: ({ getValue }) => {
        const val = getValue() as string | null;
        return val != null && val !== "" ? (
          val
        ) : (
          <span className="text-muted-foreground">--</span>
        );
      },
    })
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  const visibleCount = table.getVisibleLeafColumns().length;
  const totalCount = table.getAllLeafColumns().length;
  const hasHidden = visibleCount < totalCount;

  const filteredColumns = useMemo(() => {
    const q = search.toLowerCase();
    return table.getAllLeafColumns().filter((col) => {
      const colInfo = columns.find((c) => c.name === col.id);
      const name = col.id.toLowerCase();
      const label = colInfo?.label?.toLowerCase() ?? "";
      return name.includes(q) || label.includes(q);
    });
  }, [table, columns, search]);

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {hasHidden
            ? `${visibleCount} of ${totalCount} columns`
            : `${totalCount} columns`}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors hover:bg-accent ${
                hasHidden
                  ? "text-blue-600 font-medium"
                  : "text-muted-foreground"
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <div className="border-b px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search columns..."
                  className="h-7 w-full rounded border bg-background pl-7 pr-2 text-xs outline-none focus:border-ring"
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-b px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                {visibleCount} of {totalCount} visible
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    const vis: VisibilityState = {};
                    table
                      .getAllLeafColumns()
                      .forEach((col) => (vis[col.id] = true));
                    setColumnVisibility(vis);
                  }}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                  title="Show all"
                >
                  <Eye className="h-3 w-3" />
                </button>
                <button
                  onClick={() => {
                    const vis: VisibilityState = {};
                    table
                      .getAllLeafColumns()
                      .forEach((col) => (vis[col.id] = false));
                    setColumnVisibility(vis);
                  }}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                  title="Hide all"
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredColumns.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No columns match "{search}"
                </div>
              ) : (
                filteredColumns.map((col) => {
                  const colInfo = columns.find((c) => c.name === col.id);
                  return (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-accent"
                    >
                      <Checkbox
                        checked={col.getIsVisible()}
                        onCheckedChange={(val) =>
                          col.toggleVisibility(!!val)
                        }
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">
                          {col.id}
                        </div>
                        {colInfo?.label && (
                          <div className="truncate text-xs text-muted-foreground">
                            {colInfo.label}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="whitespace-nowrap">
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleLeafColumns().length || 1}
                className="h-24 text-center"
              >
                No data.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
