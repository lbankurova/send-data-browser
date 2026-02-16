import { cn } from "@/lib/utils";
import { getDoseGroupColor } from "@/lib/severity-colors";

interface DoseLabelProps {
  level: number;
  /** Short display label (e.g., "20 mg/kg" or "Control") */
  label: string;
  /** Full group name shown as tooltip (e.g., "Group 3, 20 mg/kg PCDRUG") */
  tooltip?: string;
  className?: string;
}

/** Renders a dose label with left border color-coded by dose level and optional tooltip. */
export function DoseLabel({ level, label, tooltip, className }: DoseLabelProps) {
  return (
    <span
      className={cn("border-l-2 pl-1.5 font-mono text-[11px]", className)}
      style={{ borderLeftColor: getDoseGroupColor(level) }}
      title={tooltip}
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
