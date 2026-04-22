import { cn } from "@/lib/utils";
import { useCallback, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface StudyDetailsRailItem {
  key: string;
  label: string;
  count?: number | null;
  /** Optional trailing indicator (e.g., status dot). Prefer surfacing status on the Overview cards rather than here — keep sparse. */
  warning?: ReactNode;
  disabled?: boolean;
}

export function StudyDetailsRail({
  items,
  activeKey,
  onSelect,
}: {
  items: StudyDetailsRailItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keyboard navigation: ArrowUp / ArrowDown move focus across enabled items
  // (wrapping); Home / End jump to first / last enabled; Enter / Space activate
  // the focused item. Matches the pattern rails use in FindingsRail.
  const focusAt = useCallback((index: number) => {
    const btn = buttonRefs.current[index];
    if (btn) btn.focus();
  }, []);

  const nextEnabledIndex = useCallback((start: number, dir: 1 | -1): number => {
    const n = items.length;
    if (n === 0) return -1;
    let i = start;
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n;
      if (!items[i].disabled) return i;
    }
    return -1;
  }, [items]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = nextEnabledIndex(i, 1);
        if (next >= 0) focusAt(next);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = nextEnabledIndex(i, -1);
        if (prev >= 0) focusAt(prev);
      } else if (e.key === "Home") {
        e.preventDefault();
        const first = items.findIndex((it) => !it.disabled);
        if (first >= 0) focusAt(first);
      } else if (e.key === "End") {
        e.preventDefault();
        for (let j = items.length - 1; j >= 0; j--) {
          if (!items[j].disabled) {
            focusAt(j);
            break;
          }
        }
      }
    },
    [items, focusAt, nextEnabledIndex],
  );

  return (
    <nav
      className="flex h-full flex-col overflow-hidden"
      aria-label="Study details sections"
    >
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2" role="tablist" aria-orientation="vertical">
        {items.map((item, i) => (
          <li key={item.key} role="presentation">
            <button
              ref={(el) => { buttonRefs.current[i] = el; }}
              type="button"
              role="tab"
              disabled={item.disabled}
              onClick={() => onSelect(item.key)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              tabIndex={activeKey === item.key ? 0 : -1}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-1 text-left text-xs transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : activeKey === item.key
                  ? "bg-accent/50 text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/25 hover:text-foreground",
              )}
              aria-selected={activeKey === item.key}
              aria-current={activeKey === item.key ? "page" : undefined}
            >
              <span className="truncate">{item.label}</span>
              <span className="flex items-center gap-1 shrink-0">
                {item.count != null && (
                  <span className="tabular-nums text-[11px] text-muted-foreground">
                    {item.count}
                  </span>
                )}
                {item.warning}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
