import { flexRender, type Header } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { shouldShowSortPriority } from "@/lib/sort-helpers";

interface SortableHeaderProps<TData, TValue> {
  header: Header<TData, TValue>;
  style?: React.CSSProperties;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Shared ref so resize-drag suppresses the sort double-click. */
  resizingRef?: React.MutableRefObject<boolean>;
  className?: string;
}

export function SortableHeader<TData, TValue>({
  header,
  style,
  onContextMenu,
  resizingRef,
  className,
}: SortableHeaderProps<TData, TValue>) {
  const { column } = header;
  const sortDir = column.getIsSorted();
  const sortIndex = column.getSortIndex();
  const ctx = header.getContext();
  const totalSorts = ctx.table.getState().sorting.length;
  const showPriority = shouldShowSortPriority(totalSorts, sortIndex);
  const canSort = column.getCanSort();

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (resizingRef?.current) return;
    if (!canSort) return;
    column.getToggleSortingHandler()?.(e);
  };

  return (
    <th
      className={cn(
        "relative px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
        canSort && "cursor-pointer select-none hover:bg-accent/50",
        className,
      )}
      style={style}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu}
      title={canSort ? "Double-click to sort. Shift+double-click adds to multi-sort." : undefined}
    >
      <span className="inline-flex items-baseline gap-0.5">
        {flexRender(column.columnDef.header, ctx)}
        {sortDir === "asc" && <span aria-hidden>{"↑"}</span>}
        {sortDir === "desc" && <span aria-hidden>{"↓"}</span>}
        {showPriority && (
          <span
            className="ml-0.5 text-[9px] font-medium text-muted-foreground/70"
            aria-label={`sort priority ${sortIndex + 1}`}
          >
            {sortIndex + 1}
          </span>
        )}
      </span>
      <div
        onMouseDown={(e) => {
          if (resizingRef) {
            resizingRef.current = true;
            const clear = () => {
              setTimeout(() => { if (resizingRef) resizingRef.current = false; }, 0);
              document.removeEventListener("mouseup", clear);
            };
            document.addEventListener("mouseup", clear);
          }
          header.getResizeHandler()(e);
        }}
        onTouchStart={header.getResizeHandler()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute -right-1 top-0 z-10 h-full w-3 cursor-col-resize select-none touch-none",
          column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30",
        )}
      />
    </th>
  );
}
