import { useState, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSessionState } from "@/hooks/useSessionState";

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
  /** Keep children mounted when collapsed (CSS hidden instead of unmount).
   *  Only safe for panes whose hooks are purely derived from props/context. */
  keepMounted?: boolean;
  /** When provided, open/closed state persists in sessionStorage under this key. */
  sessionKey?: string;
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
  keepMounted = false,
  sessionKey,
}: CollapsiblePaneProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [sessionOpen, setSessionOpen] = useSessionState(sessionKey ?? "", defaultOpen);
  const isOpen = sessionKey ? sessionOpen : localOpen;
  const setIsOpen = sessionKey ? setSessionOpen : setLocalOpen;
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
    <div className={isBorder ? "border-b" : "mb-3"}>
      <div
        role="button"
        tabIndex={0}
        className={cn(
          "flex w-full items-center gap-1 cursor-pointer select-none",
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen((v) => {
              const next = !v;
              onToggle?.(next);
              return next;
            });
          }
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
          <span
            className="flex items-center"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {headerRight}
          </span>
        )}
        {badge && <span className="ml-auto">{badge}</span>}
        {!isOpen && summary && (
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {summary}
          </span>
        )}
      </div>
      {keepMounted ? (
        <div className={cn(isBorder ? "px-4 pb-3" : "pl-4 pt-1.5", !isOpen && "hidden")}>
          {children}
        </div>
      ) : (
        isOpen && (
          <div className={isBorder ? "px-4 pb-3" : "pl-4 pt-1.5"}>
            {children}
          </div>
        )
      )}
    </div>
  );
}
