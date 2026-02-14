import { useState, useEffect } from "react";
import type { ReactNode, RefObject } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { HorizontalResizeHandle } from "@/components/ui/PanelResizeHandle";

interface ViewSectionBaseProps {
  title: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  expandGen?: number;
  collapseGen?: number;
  /** Double-click on section header (maximize: collapse other sections). */
  onHeaderDoubleClick?: () => void;
}

interface ViewSectionFixed extends ViewSectionBaseProps {
  mode: "fixed";
  height: number;
  onResizePointerDown: (e: React.PointerEvent) => void;
  contentRef?: RefObject<HTMLDivElement | null>;
}

interface ViewSectionFlex extends ViewSectionBaseProps {
  mode: "flex";
}

export type ViewSectionProps = ViewSectionFixed | ViewSectionFlex;

export function ViewSection(props: ViewSectionProps) {
  const { title, headerRight, children, defaultOpen = true, expandGen, collapseGen, mode, onHeaderDoubleClick } = props;
  const [open, setOpen] = useState(defaultOpen);

  // Respond to expand/collapse all signals
  useEffect(() => {
    if (expandGen && expandGen > 0) setOpen(true);
  }, [expandGen]);

  useEffect(() => {
    if (collapseGen && collapseGen > 0) setOpen(false);
  }, [collapseGen]);

  return (
    <>
      {/* Header bar */}
      <button
        className="flex w-full shrink-0 items-center gap-1.5 border-b border-border/50 bg-muted/20 px-3 py-1 text-left"
        onClick={() => setOpen((o) => !o)}
        onDoubleClick={onHeaderDoubleClick ? (e) => { e.preventDefault(); onHeaderDoubleClick(); } : undefined}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {headerRight && (
          <span
            className="ml-auto flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {headerRight}
          </span>
        )}
      </button>

      {/* Content */}
      {open && (
        <div
          className={cn(
            "overflow-hidden",
            mode === "flex" ? "flex min-h-0 flex-1 flex-col" : "shrink-0",
          )}
          style={mode === "fixed" ? { height: props.height } : undefined}
        >
          <div
            ref={mode === "fixed" ? props.contentRef : undefined}
            className={cn("h-full overflow-auto", mode === "flex" && "flex min-h-0 flex-1 flex-col")}
          >
            {children}
          </div>
        </div>
      )}

      {/* Resize handle (fixed mode only, shown when open) */}
      {mode === "fixed" && open && (
        <HorizontalResizeHandle onPointerDown={props.onResizePointerDown} />
      )}
    </>
  );
}
