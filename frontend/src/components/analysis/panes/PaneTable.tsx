import type { ReactNode, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared table primitives for context-panel panes (~300 px wide).
 *
 * Defaults: auto column layout, tabular-nums for numeric alignment,
 * text-[10px], full width.  No content-hugging width hacks —
 * those belong in wide main-area tables only.
 */
export function PaneTable({
  className,
  children,
  ...rest
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full text-[10px] tabular-nums", className)} {...rest}>
      {children}
    </table>
  );
}

/** Header cell — left-aligned label or right-aligned numeric header. */
function Th({
  className,
  children,
  numeric,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; children?: ReactNode }) {
  return (
    <th
      className={cn(
        "py-1 font-medium whitespace-nowrap",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

/** Data cell — numeric cells are right-aligned, monospaced, non-wrapping. */
function Td({
  className,
  children,
  numeric,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; children?: ReactNode }) {
  return (
    <td
      className={cn(
        "py-0.5",
        numeric && "text-right font-mono whitespace-nowrap",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

PaneTable.Th = Th;
PaneTable.Td = Td;
