import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ViewTab {
  key: string;
  label: string;
  count?: number;
  /** Show an X button on hover to close this tab. */
  closable?: boolean;
}

export function ViewTabBar({
  tabs,
  value,
  onChange,
  onClose,
  right,
  className,
}: {
  tabs: ViewTab[];
  value: string;
  onChange: (key: string) => void;
  /** Called when a closable tab's X is clicked. */
  onClose?: (key: string) => void;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center border-b bg-muted/30", className)}>
      <div className="flex">
        {tabs.map(({ key, label, count, closable }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              "group relative flex items-center gap-1 px-4 py-1.5 text-xs font-medium transition-colors",
              value === key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {count != null && count > 0 && (
              <span className="ml-1.5 text-[11px] text-muted-foreground">
                ({count})
              </span>
            )}
            {closable && (
              <span
                role="button"
                className="ml-0.5 rounded-sm opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onClose?.(key); }}
                title={`Close ${label}`}
              >
                <X className="h-3 w-3" />
              </span>
            )}
            {value === key && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
