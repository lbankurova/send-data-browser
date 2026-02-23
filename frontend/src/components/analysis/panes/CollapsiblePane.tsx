import { useState, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CollapsiblePaneProps {
  title: string;
  defaultOpen?: boolean;
  headerRight?: ReactNode;
  badge?: ReactNode;
  summary?: string;
  children: ReactNode;
  expandAll?: number;
  collapseAll?: number;
  onToggle?: (isOpen: boolean) => void;
  variant?: "border" | "margin";
}

export function CollapsiblePane({
  title,
  defaultOpen = true,
  headerRight,
  badge,
  summary,
  children,
  expandAll,
  collapseAll,
  onToggle,
  variant = "border",
}: CollapsiblePaneProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const prevExpand = useRef(expandAll);
  const prevCollapse = useRef(collapseAll);

  useEffect(() => {
    if (expandAll != null && expandAll !== prevExpand.current) {
      setIsOpen(true);
      onToggle?.(true);
    }
    prevExpand.current = expandAll;
  }, [expandAll, onToggle]);

  useEffect(() => {
    if (collapseAll != null && collapseAll !== prevCollapse.current) {
      setIsOpen(false);
      onToggle?.(false);
    }
    prevCollapse.current = collapseAll;
  }, [collapseAll, onToggle]);

  const isBorder = variant === "border";

  return (
    <div className={isBorder ? "border-b last:border-b-0" : "mb-3"}>
      <button
        className={cn(
          "flex w-full items-center gap-1",
          isBorder
            ? "px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
            : "mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground",
        )}
        onClick={() => {
          setIsOpen((v) => {
            const next = !v;
            onToggle?.(next);
            return next;
          });
        }}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            isOpen && "rotate-90",
          )}
        />
        {title}
        {headerRight && (
          <span className="ml-auto flex items-center gap-1.5 text-[9px] font-medium normal-case tracking-normal">
            {headerRight}
          </span>
        )}
        {badge && <span className="ml-auto">{badge}</span>}
        {!isOpen && summary && (
          <span className="ml-auto truncate text-[10px] text-muted-foreground">
            {summary}
          </span>
        )}
      </button>
      {isOpen && (
        <div className={isBorder ? "px-4 pb-3" : "pl-4 pt-1.5"}>
          {children}
        </div>
      )}
    </div>
  );
}
