import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
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
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={cn(
        filter.select,
        className,
      )}
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

  const toggleAll = useCallback(() => {
    onChange(null);
  }, [onChange]);

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
          {/* All option */}
          <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-xs hover:bg-accent/50">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleAll}
              className="h-3 w-3 rounded border-border"
            />
            <span className="font-medium">{allLabel}</span>
          </label>
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
