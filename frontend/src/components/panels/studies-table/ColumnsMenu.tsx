import { useState } from "react";
import { Columns3, Eye, EyeOff, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { COLUMN_BY_KEY, STUDY_COLUMNS } from "./columns-registry";
import type { StudyColumn } from "./types";

export function ColumnsMenu({
  visible,
  order,
  onChangeVisible,
  onResetOrder,
}: {
  visible: ReadonlySet<string>;
  order: string[];
  onChangeVisible: (next: Set<string>) => void;
  onResetOrder: () => void;
}) {
  const [search, setSearch] = useState("");
  const orderedCols = order.map((k) => COLUMN_BY_KEY.get(k)).filter((c): c is StudyColumn => !!c);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? orderedCols.filter((c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
    : orderedCols;

  const toggle = (key: string) => {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChangeVisible(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded border border-border/50 px-2 py-1 text-[11px] transition-colors hover:bg-accent",
            visible.size < STUDY_COLUMNS.length && "text-primary border-primary/40"
          )}
          title="Show / hide columns"
        >
          <Columns3 className="h-3 w-3" />
          Columns
          {visible.size < STUDY_COLUMNS.length && (
            <span className="text-muted-foreground">({visible.size}/{STUDY_COLUMNS.length})</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search columns..."
              className="h-7 w-full rounded border bg-background pl-6 pr-2 text-xs outline-none focus:border-ring"
            />
          </div>
        </div>
        <div className="flex items-center justify-between border-b px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground">{visible.size} of {STUDY_COLUMNS.length} visible</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChangeVisible(new Set(STUDY_COLUMNS.map((c) => c.key)))}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
              title="Show all"
            >
              <Eye className="h-3 w-3" />
            </button>
            <button
              onClick={() => onChangeVisible(new Set())}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
              title="Hide all"
            >
              <EyeOff className="h-3 w-3" />
            </button>
            <button
              onClick={onResetOrder}
              className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
              title="Reset to default order"
            >
              Reset order
            </button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No columns match "{search}"</div>
          ) : (
            filtered.map((col) => (
              <label key={col.key} className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-accent">
                <Checkbox
                  checked={visible.has(col.key)}
                  onCheckedChange={() => toggle(col.key)}
                />
                <span className="truncate text-xs">{col.label}</span>
                <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground/60">{col.type}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
