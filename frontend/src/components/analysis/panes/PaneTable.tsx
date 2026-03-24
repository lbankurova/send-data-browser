import type { ReactNode, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared table primitives for context-panel panes.
 *
 * Uses table-layout:fixed with caller-supplied column widths.
 * One label column (absorber) takes remaining width after sized columns.
 * Numeric columns get explicit pixel widths computed from data content.
 */
export function PaneTable({
  className,
  children,
  ...rest
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full table-fixed text-[11px] tabular-nums", className)} {...rest}>
      {children}
    </table>
  );
}

/** Header cell.  `absorber` marks the column that takes remaining width.
 *  Sized columns receive explicit `style={{ width }}` from the caller. */
function Th({
  className,
  children,
  numeric,
  absorber,
  style,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; absorber?: boolean; children?: ReactNode }) {
  return (
    <th
      {...rest}
      className={cn(
        "py-1 font-medium whitespace-nowrap overflow-hidden text-ellipsis",
        numeric && "text-right pl-2",
        (absorber || (!numeric && !absorber)) && "text-left",
        className,
      )}
      style={style}
    >
      {children}
    </th>
  );
}

/** Data cell.  All cells clip overflow (table-layout:fixed safety). */
function Td({
  className,
  children,
  numeric,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; children?: ReactNode }) {
  return (
    <td
      {...rest}
      className={cn(
        "py-0.5 overflow-hidden text-ellipsis whitespace-nowrap",
        numeric && "text-right font-mono pl-2",
        className,
      )}
    >
      {children}
    </td>
  );
}

PaneTable.Th = Th;
PaneTable.Td = Td;
