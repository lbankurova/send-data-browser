import type { ReactNode } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STRIP_HEIGHT = 28;

interface SectionHeaderProps {
  height: number;
  title?: string;
  titleContent?: ReactNode;
  count?: number | string;
  selectionZone: ReactNode;
  headerRight?: ReactNode;
  onDoubleClick: () => void;
  onStripClick: () => void;
}

export function SectionHeader({
  height,
  title,
  titleContent,
  count,
  selectionZone,
  headerRight,
  onDoubleClick,
  onStripClick,
}: SectionHeaderProps) {
  const isStrip = height <= STRIP_HEIGHT;
  const Chevron = isStrip ? ChevronRight : ChevronDown;

  return (
    <div
      className={cn(
        "flex h-7 shrink-0 select-none items-center gap-2 px-3",
        isStrip && "cursor-pointer border-b bg-muted/20",
      )}
      onClick={isStrip ? onStripClick : undefined}
      onDoubleClick={(e) => {
        e.preventDefault();
        onDoubleClick();
      }}
    >
      <Chevron
        className="h-3 w-3 shrink-0 cursor-pointer text-muted-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onStripClick();
        }}
      />

      {/* Chrome zone */}
      {titleContent ?? (
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      )}
      {count != null && (
        <span className="shrink-0 text-[10px] text-muted-foreground">({count})</span>
      )}

      {/* Separator */}
      <span className="mx-1.5 shrink-0 text-muted-foreground/30">&middot;</span>

      {/* Selection zone */}
      <div className="flex min-w-0 flex-1 items-center gap-1 truncate text-[10px]">
        {selectionZone}
      </div>

      {/* Header right (hidden when strip) */}
      {!isStrip && headerRight && (
        <span
          className="ml-auto flex shrink-0 items-center"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {headerRight}
        </span>
      )}
    </div>
  );
}

/** Dot separator used between items in section headers / selection zones. */
export function StripSep() {
  return <span className="mx-1.5 shrink-0 text-muted-foreground/30">&middot;</span>;
}
