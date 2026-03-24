import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapseAllButtons } from "./CollapseAllButtons";

interface ContextPanelHeaderProps {
  /** Main title — string or complex ReactNode (e.g., with inline badges) */
  title: ReactNode;
  /** Extra className on the h3 wrapper (e.g., "font-mono") */
  titleClassName?: string;
  /** Subtitle content — rendered in a text-[11px] text-muted-foreground container */
  subtitle?: ReactNode;
  /** Extra content below subtitle (e.g., TierCountBadges) */
  children?: ReactNode;
  /** Extra className on the sticky header container (e.g., severity border) */
  className?: string;
  /** Extra style on the sticky header container */
  style?: React.CSSProperties;
  /** Extra actions rendered inline after CollapseAll (e.g., close button) */
  headerActions?: ReactNode;

  /** Pass both to show CollapseAll buttons */
  onExpandAll?: () => void;
  onCollapseAll?: () => void;

  /** Pass onBack/onForward to show the < > navigation bar above the header */
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
}

const navBtnClass =
  "rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

export function ContextPanelHeader({
  title,
  titleClassName,
  subtitle,
  children,
  className,
  style,
  headerActions,
  onExpandAll,
  onCollapseAll,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
}: ContextPanelHeaderProps) {
  const hasNav = onBack != null || onForward != null;
  const hasCollapseAll = onExpandAll != null && onCollapseAll != null;

  return (
    <>
      {hasNav && (
        <div className="flex items-center gap-0.5 border-b px-2 py-1">
          <button
            className={navBtnClass}
            disabled={!canGoBack}
            onClick={onBack}
            title="Back"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            className={navBtnClass}
            disabled={!canGoForward}
            onClick={onForward}
            title="Forward"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div
        className={cn(
          "sticky top-0 z-10 border-b bg-background px-4 py-3",
          className,
        )}
        style={style}
      >
        <div className="flex items-center justify-between">
          <h3 className={cn("text-sm font-semibold", titleClassName)}>
            {title}
          </h3>
          <div className="flex items-center gap-1">
            {hasCollapseAll && (
              <CollapseAllButtons
                onExpandAll={onExpandAll}
                onCollapseAll={onCollapseAll}
              />
            )}
            {headerActions}
          </div>
        </div>
        {subtitle && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            {subtitle}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
