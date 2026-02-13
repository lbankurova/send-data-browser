import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";

export function MasterDetailLayout({
  railWidth,
  onRailResize,
  rail,
  children,
  className,
  railClassName,
}: {
  railWidth: number;
  onRailResize: (e: React.PointerEvent) => void;
  rail: ReactNode;
  children: ReactNode;
  className?: string;
  railClassName?: string;
}) {
  return (
    <div className={cn("flex h-full overflow-hidden max-[1200px]:flex-col", className)}>
      <div
        className={cn(
          "shrink-0 border-r max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b max-[1200px]:overflow-x-auto",
          railClassName
        )}
        style={{ width: railWidth }}
      >
        {rail}
      </div>
      <div className="flex max-[1200px]:hidden">
        <PanelResizeHandle onPointerDown={onRailResize} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5">
        {children}
      </div>
    </div>
  );
}
