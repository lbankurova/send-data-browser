import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

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
  return (
    <nav
      className="flex h-full flex-col overflow-hidden"
      aria-label="Study details sections"
    >
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              disabled={item.disabled}
              onClick={() => onSelect(item.key)}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-1 text-left text-xs transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : activeKey === item.key
                  ? "bg-accent/50 text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/25 hover:text-foreground",
              )}
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
