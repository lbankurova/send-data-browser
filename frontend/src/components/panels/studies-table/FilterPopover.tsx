import { useState } from "react";
import { Filter as FilterIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { describeFilter, isFilterActive } from "../studies-table-helpers";
import type { ColumnFilter } from "../studies-table-helpers";
import type { StudyColumn } from "./types";

export function FilterPopover({
  col,
  filter,
  distinctValues,
  onChange,
  onClear,
}: {
  col: StudyColumn;
  filter: ColumnFilter | undefined;
  distinctValues: string[];
  onChange: (f: ColumnFilter) => void;
  onClear: () => void;
}) {
  const active = isFilterActive(filter);
  const [search, setSearch] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "rounded p-0.5 transition-colors",
            active ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
          )}
          title={active ? `Active filter — ${describeFilter(col, filter!)}` : `Filter ${col.label}`}
          onClick={(e) => e.stopPropagation()}
        >
          <FilterIcon className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between border-b px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{col.label}</span>
          <button
            onClick={onClear}
            disabled={!active}
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            Clear
          </button>
        </div>
        <div className="p-3">
          {col.type === "category" && (
            <CategoryFilterUI
              filter={(filter?.kind === "category" ? filter : undefined) ?? { kind: "category", values: [] }}
              distinctValues={distinctValues}
              search={search}
              onSearch={setSearch}
              onChange={onChange}
            />
          )}
          {col.type === "text" && (
            <input
              autoFocus
              value={filter?.kind === "text" ? filter.query : ""}
              onChange={(e) => onChange({ kind: "text", query: e.target.value })}
              placeholder="Contains..."
              className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:border-ring"
            />
          )}
          {col.type === "number" && (
            <NumberFilterUI
              filter={(filter?.kind === "number" ? filter : undefined) ?? { kind: "number", min: null, max: null }}
              onChange={onChange}
            />
          )}
          {col.type === "date" && (
            <DateFilterUI
              filter={(filter?.kind === "date" ? filter : undefined) ?? { kind: "date", from: null, to: null }}
              onChange={onChange}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CategoryFilterUI({
  filter, distinctValues, search, onSearch, onChange,
}: {
  filter: Extract<ColumnFilter, { kind: "category" }>;
  distinctValues: string[];
  search: string;
  onSearch: (s: string) => void;
  onChange: (f: ColumnFilter) => void;
}) {
  const q = search.trim().toLowerCase();
  const shown = q ? distinctValues.filter((v) => v.toLowerCase().includes(q)) : distinctValues;
  const sel = new Set(filter.values);
  const toggle = (v: string) => {
    const next = new Set(sel);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange({ kind: "category", values: [...next] });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <input
        autoFocus
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search values..."
        className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:border-ring"
      />
      <div className="flex items-center justify-between text-[10px]">
        <button
          className="text-primary hover:underline disabled:text-muted-foreground/50"
          disabled={sel.size === distinctValues.length}
          onClick={() => onChange({ kind: "category", values: [...distinctValues] })}
        >
          Select all
        </button>
        <button
          className="text-primary hover:underline disabled:text-muted-foreground/50"
          disabled={sel.size === 0}
          onClick={() => onChange({ kind: "category", values: [] })}
        >
          Clear
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {shown.length === 0 ? (
          <div className="py-2 text-center text-[11px] text-muted-foreground">No matches</div>
        ) : shown.map((v) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
            <Checkbox checked={sel.has(v)} onCheckedChange={() => toggle(v)} />
            <span className="truncate text-xs">{v}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function NumberFilterUI({
  filter, onChange,
}: {
  filter: Extract<ColumnFilter, { kind: "number" }>;
  onChange: (f: ColumnFilter) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={filter.min ?? ""}
        onChange={(e) => onChange({ ...filter, min: e.target.value === "" ? null : Number(e.target.value) })}
        placeholder="min"
        className="w-20 rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-ring"
      />
      <span className="text-[10px] text-muted-foreground">to</span>
      <input
        type="number"
        value={filter.max ?? ""}
        onChange={(e) => onChange({ ...filter, max: e.target.value === "" ? null : Number(e.target.value) })}
        placeholder="max"
        className="w-20 rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-ring"
      />
    </div>
  );
}

function DateFilterUI({
  filter, onChange,
}: {
  filter: Extract<ColumnFilter, { kind: "date" }>;
  onChange: (f: ColumnFilter) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        From
        <input
          type="date"
          value={filter.from ?? ""}
          onChange={(e) => onChange({ ...filter, from: e.target.value || null })}
          className="flex-1 rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-ring"
        />
      </label>
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        To
        <input
          type="date"
          value={filter.to ?? ""}
          onChange={(e) => onChange({ ...filter, to: e.target.value || null })}
          className="flex-1 rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-ring"
        />
      </label>
    </div>
  );
}
