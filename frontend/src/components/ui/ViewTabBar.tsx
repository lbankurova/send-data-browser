import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ViewTab {
  key: string;
  label: string;
  count?: number;
}

export function ViewTabBar({
  tabs,
  value,
  onChange,
  right,
  className,
}: {
  tabs: ViewTab[];
  value: string;
  onChange: (key: string) => void;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center border-b bg-muted/30", className)}>
      <div className="flex">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              "relative px-4 py-1.5 text-xs font-medium transition-colors",
              value === key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {count != null && count > 0 && (
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                ({count})
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
