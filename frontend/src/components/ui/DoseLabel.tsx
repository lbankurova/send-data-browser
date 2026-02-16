import { cn } from "@/lib/utils";
import { getDoseGroupColor } from "@/lib/severity-colors";

interface DoseLabelProps {
  level: number;
  label: string;
  className?: string;
}

/** Renders a dose label with left border color-coded by dose level. */
export function DoseLabel({ level, label, className }: DoseLabelProps) {
  return (
    <span
      className={cn("border-l-2 pl-1.5 font-mono text-[11px]", className)}
      style={{ borderLeftColor: getDoseGroupColor(level) }}
    >
      {label}
    </span>
  );
}

interface DoseHeaderProps {
  level: number;
  label: string;
  className?: string;
}

/** Dose column header with colored underline indicator. */
export function DoseHeader({ level, label, className }: DoseHeaderProps) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5", className)}>
      <span>{label}</span>
      <span
        className="h-0.5 w-full rounded-full"
        style={{ backgroundColor: getDoseGroupColor(level) }}
      />
    </div>
  );
}
