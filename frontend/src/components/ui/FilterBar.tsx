import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { filter } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 border-b bg-muted/30 px-4 py-2", className)}>
      {children}
    </div>
  );
}

export function FilterSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
}) {
  return (
    <select
      className={cn(filter.select, className)}
      {...props}
    >
      {children}
    </select>
  );
}

/** Multi-select dropdown with checkboxes. Visually matches FilterSelect. */
export function FilterMultiSelect({
  options,
  selected,
  onChange,
  allLabel = "All",
  className,
}: {
  options: { key: string; label: string; group?: string }[];
  /** null = all selected */
  selected: ReadonlySet<string> | null;
  onChange: (next: ReadonlySet<string> | null) => void;
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const allKeys = options.map((o) => o.key);
  const isAllSelected = selected === null;
  const selectedCount = selected ? selected.size : allKeys.length;

  const toggle = useCallback(
    (key: string) => {
      const current = selected ?? new Set(allKeys);
      const next = new Set(current);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      onChange(next.size === allKeys.length ? null : next);
    },
    [selected, allKeys, onChange],
  );

  const selectAll = useCallback(() => {
    onChange(null);
  }, [onChange]);

  const clearAll = useCallback(() => {
    // Keep only the first option (minimum 1 required)
    if (allKeys.length > 0) onChange(new Set([allKeys[0]]));
  }, [allKeys, onChange]);

  // Build display label
  const displayLabel = isAllSelected
    ? allLabel
    : selectedCount === 1
      ? options.find((o) => selected!.has(o.key))?.label ?? allLabel
      : `${selectedCount} groups`;

  // Group options
  const groups = new Map<string, typeof options>();
  for (const opt of options) {
    const g = opt.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(opt);
  }

  return (
    <div ref={ref} className="relative">
      <button
        className={cn(filter.select, "flex items-center gap-1", className)}
        onClick={() => setOpen((p) => !p)}
        type="button"
      >
        <span className="truncate">{displayLabel}</span>
        <svg className="h-3 w-3 shrink-0 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border bg-popover py-1 shadow-md">
          {/* Select all / Clear all */}
          <div className="flex items-center justify-between px-2.5 py-1">
            <button
              type="button"
              className={cn("text-[10px]", isAllSelected ? "text-muted-foreground/50" : "text-primary hover:underline")}
              onClick={selectAll}
              disabled={isAllSelected}
            >
              Select all
            </button>
            <button
              type="button"
              className={cn("text-[10px]", !isAllSelected && selectedCount === 1 ? "text-muted-foreground/50" : "text-primary hover:underline")}
              onClick={clearAll}
              disabled={!isAllSelected && selectedCount === 1}
            >
              Clear all
            </button>
          </div>
          <div className="my-0.5 border-t" />
          {[...groups.entries()].map(([groupName, groupOpts]) => (
            <div key={groupName}>
              {groupName && (
                <div className="px-2.5 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {groupName}
                </div>
              )}
              {groupOpts.map((opt) => {
                const checked = isAllSelected || selected!.has(opt.key);
                return (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-xs hover:bg-accent/50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.key)}
                      className="h-3 w-3 rounded border-border"
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterBarCount({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("ml-auto text-[10px] text-muted-foreground", className)}>
      {children}
    </span>
  );
}

/** Compact inline search: icon + borderless input. Live filtering, Esc to clear. */
export function FilterSearch({
  value,
  onChange,
  placeholder = "...",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("flex items-center gap-0.5 text-muted-foreground/60", className)}>
      <Search className="h-3 w-3 shrink-0" />
      <input
        ref={ref}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            ref.current?.blur();
          } else if (e.key === "Enter") {
            ref.current?.blur();
          }
        }}
        className="w-12 border-none bg-transparent px-0 text-[10px] text-foreground placeholder:text-muted-foreground/30 focus:w-20 focus:outline-none"
      />
    </div>
  );
}

/** Clear all filters button — only visible when dirty. */
export function FilterClearButton({
  dirty,
  onClear,
  className,
}: {
  /** True when any filter differs from its default value. */
  dirty: boolean;
  onClear: () => void;
  className?: string;
}) {
  if (!dirty) return null;
  return (
    <button
      type="button"
      className={cn("flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground", className)}
      onClick={onClear}
      title="Clear all filters"
    >
      <X className="h-2.5 w-2.5" />
    </button>
  );
}

/** "Showing: All" or "Showing: Severity 3+ · Adverse only · 8/28". */
export function FilterShowingLine({
  parts,
  className,
}: {
  /** Filter description parts. Empty array or undefined = "All". */
  parts?: string[];
  className?: string;
}) {
  const display = parts && parts.length > 0 ? parts.join(" \u00b7 ") : "All";
  return (
    <div className={cn("text-[10px] text-muted-foreground", className)}>
      <span className="font-medium">Showing: </span>{display}
    </div>
  );
}
