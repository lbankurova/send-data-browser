import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface CollapsedStripProps {
  title: string;
  count?: number | string;
  summary: ReactNode;
  onExpand: () => void;
  onMaximize: () => void;
}

/**
 * A 28px summary strip shown when a ViewSection is collapsed.
 * Displays a chevron, section title, item count, and contextual summary.
 *
 * - Single-click anywhere: expand (restore) the section.
 * - Double-click anywhere: maximize (collapse the other two sections).
 * - Summary content updates reactively when selection changes elsewhere.
 */
export function CollapsedStrip({ title, count, summary, onExpand, onMaximize }: CollapsedStripProps) {
  return (
    <div
      className="flex h-7 shrink-0 cursor-pointer select-none items-center gap-2 border-b border-border/50 bg-muted/20 px-3"
      onClick={onExpand}
      onDoubleClick={(e) => { e.stopPropagation(); onMaximize(); }}
    >
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {count != null && (
        <span className="text-[10px] text-muted-foreground/60">({count})</span>
      )}
      <span className="mx-0.5 text-muted-foreground/30">·</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
        {summary}
      </div>
    </div>
  );
}

/** Dot separator used between summary items in a collapsed strip. */
export function StripSep() {
  return <span className="mx-1 shrink-0 text-muted-foreground/30">·</span>;
}
