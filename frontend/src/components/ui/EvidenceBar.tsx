import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EvidenceBar({
  value,
  max,
  label,
  className,
  labelClassName,
}: {
  value: number;
  max: number;
  label: ReactNode;
  className?: string;
  labelClassName?: string;
}) {
  const barWidth = max > 0 ? Math.max(4, (value / max) * 100) : 0;

  return (
    <div className={cn("mt-1.5 flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 rounded-full bg-[#E5E7EB]">
        <div
          className="h-full rounded-full bg-[#D1D5DB] transition-all"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] tabular-nums",
          labelClassName
        )}
      >
        {label}
      </span>
    </div>
  );
}
