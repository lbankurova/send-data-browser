import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ColumnInfo } from "@/types";

interface DataTableProps {
  columns: ColumnInfo[];
  rows: Record<string, string | null>[];
}

export function DataTable({ columns, rows }: DataTableProps) {
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
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
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
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No data.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
