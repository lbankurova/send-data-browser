import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 border-b bg-muted/30 px-4 py-2", className)}>
      {children}
    </div>
  );
}

export function FilterBarCount({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("ml-auto text-[10px] text-muted-foreground", className)}>
      {children}
    </span>
  );
}
