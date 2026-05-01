import { useEffect, useRef, useState } from "react";
import type { Table } from "@tanstack/react-table";
import { ArrowUp, ArrowDown, GripVertical, X, Search, ArrowUpDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  getColumnHeaderLabel,
  reorderSort,
  moveSortByOffset,
  filterAddableColumns,
} from "@/lib/sort-helpers";

interface SortPopoverProps<TData> {
  table: Table<TData>;
}

export function SortPopover<TData>({ table }: SortPopoverProps<TData>) {
  const sorting = table.getState().sorting;
  const allColumns = table.getAllLeafColumns().filter((c) => c.getCanSort());

  const labelById = new Map<string, string>();
  for (const c of allColumns) {
    labelById.set(c.id, getColumnHeaderLabel(c.columnDef.header, c.id));
  }

  const sortedIds = new Set(sorting.map((s) => s.id));
  const unsortedColumns = allColumns.filter((c) => !sortedIds.has(c.id));

  const [search, setSearch] = useState("");
  const filteredAddable = filterAddableColumns(
    unsortedColumns.map((c) => ({ id: c.id, label: labelById.get(c.id) ?? c.id })),
    search,
  );

  const addSort = (id: string) => {
    table.setSorting([...sorting, { id, desc: false }]);
    setSearch("");
  };
  const removeSort = (id: string) => {
    table.setSorting(sorting.filter((s) => s.id !== id));
  };
  const toggleDir = (id: string) => {
    table.setSorting(sorting.map((s) => s.id === id ? { ...s, desc: !s.desc } : s));
  };
  const clearAll = () => {
    table.setSorting([]);
  };

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const liRefs = useRef<Map<string, HTMLLIElement | null>>(new Map());
  const focusOnNextRender = useRef<string | null>(null);
  useEffect(() => {
    if (focusOnNextRender.current) {
      liRefs.current.get(focusOnNextRender.current)?.focus();
      focusOnNextRender.current = null;
    }
  }, [sorting]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, id: string) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusOnNextRender.current = id;
      table.setSorting(moveSortByOffset(sorting, id, -1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusOnNextRender.current = id;
      table.setSorting(moveSortByOffset(sorting, id, 1));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeSort(id);
    } else if (e.key === " " || e.key === "Enter") {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        focusOnNextRender.current = id;
        toggleDir(id);
      }
    }
  };

  const totalActive = sorting.length;
  const triggerActive = totalActive > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative rounded p-0.5 transition-colors data-[state=open]:bg-primary/10",
            triggerActive ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground",
          )}
          title={triggerActive ? `Sorted by ${totalActive} column${totalActive > 1 ? "s" : ""}` : "Sort columns"}
        >
          <ArrowUpDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sorted by
          </span>
          {totalActive > 0 && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={clearAll}
            >
              Clear all
            </button>
          )}
        </div>

        {sorting.length > 0 ? (
          <ul className="divide-y" role="list" aria-label="Active sort columns. Use arrow keys to reorder.">
            {sorting.map((s, i) => (
              <li
                key={s.id}
                ref={(el) => { liRefs.current.set(s.id, el); }}
                tabIndex={0}
                role="listitem"
                aria-label={`Sort priority ${i + 1}: ${labelById.get(s.id) ?? s.id}, ${s.desc ? "descending" : "ascending"}. Arrow keys reorder, Enter toggles direction, Delete removes.`}
                draggable
                onKeyDown={(e) => handleKeyDown(e, s.id)}
                onDragStart={() => setDragId(s.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(s.id);
                }}
                onDragLeave={() => setOverId((o) => (o === s.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) table.setSorting(reorderSort(sorting, dragId, s.id));
                  setDragId(null);
                  setOverId(null);
                }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  overId === s.id && dragId !== s.id && "bg-accent",
                  dragId === s.id && "opacity-50",
                )}
              >
                <GripVertical className="h-3 w-3 cursor-grab text-muted-foreground/60" aria-hidden />
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-muted text-[9px] font-medium text-muted-foreground" aria-hidden>
                  {i + 1}
                </span>
                <span className="flex-1 truncate" title={labelById.get(s.id) ?? s.id}>
                  {labelById.get(s.id) ?? s.id}
                </span>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => toggleDir(s.id)}
                  title={s.desc ? "Descending -- click for ascending" : "Ascending -- click for descending"}
                  aria-label={`Direction: ${s.desc ? "descending" : "ascending"}. Click to flip.`}
                >
                  {s.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => removeSort(s.id)}
                  title="Remove sort"
                  aria-label={`Remove ${labelById.get(s.id) ?? s.id} from sort`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-3 py-3 text-center text-xs text-muted-foreground">
            No sort applied. Add a column below.
          </div>
        )}

        <div className="border-t">
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Add column
          </div>
          <div className="px-2 pb-2">
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search columns..."
                className="h-6 w-full rounded border bg-background pl-6 pr-2 text-xs outline-none focus:border-ring"
                aria-label="Search columns to add to sort"
              />
            </div>
            <div className="max-h-40 overflow-y-auto">
              {filteredAddable.length === 0 ? (
                <div className="px-2 py-2 text-center text-xs text-muted-foreground">
                  {unsortedColumns.length === 0 ? "All columns are sorted." : `No columns match "${search}"`}
                </div>
              ) : (
                filteredAddable.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
                    onClick={() => addSort(c.id)}
                  >
                    {c.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SortChipsProps<TData> {
  table: Table<TData>;
  max?: number;
}

export function SortChips<TData>({ table, max = 3 }: SortChipsProps<TData>) {
  const sorting = table.getState().sorting;
  const allColumns = table.getAllLeafColumns();
  const labelById = new Map<string, string>();
  for (const c of allColumns) {
    labelById.set(c.id, getColumnHeaderLabel(c.columnDef.header, c.id));
  }

  if (sorting.length === 0) return null;

  const head = sorting.slice(0, max);
  const overflow = sorting.length - head.length;

  return (
    <span className="flex items-center gap-1 text-[10px]">
      <span className="text-muted-foreground">Sorted by:</span>
      {head.map((s) => (
        <span key={s.id} className="text-primary/60">
          <span className="font-medium">{labelById.get(s.id) ?? s.id}</span>
          <span className="ml-0.5">{s.desc ? "↓" : "↑"}</span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-muted-foreground">+{overflow} more</span>
      )}
    </span>
  );
}
