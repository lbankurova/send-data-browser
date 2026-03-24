import { cn } from "@/lib/utils";
import { getDoseGroupColor } from "@/lib/severity-colors";

interface DoseLabelProps {
  level: number;
  /** Short display label (e.g., "20 mg/kg" or "Control") */
  label: string;
  /** Full group name shown as tooltip (e.g., "Group 3, 20 mg/kg PCDRUG") */
  tooltip?: string;
  /** Pipe position: "left" (default) or "right". Right-align is used for bar chart labels. */
  align?: "left" | "right";
  className?: string;
}

/** Renders a dose label with border color-coded by dose level and optional tooltip. */
export function DoseLabel({ level, label, tooltip, align = "left", className }: DoseLabelProps) {
  const color = getDoseGroupColor(level);
  return (
    <span
      className={cn(
        "font-mono text-xs",
        align === "right" ? "border-r-2 pr-1.5 text-right" : "border-l-2 pl-1.5",
        className,
      )}
      style={align === "right" ? { borderRightColor: color } : { borderLeftColor: color }}
      title={tooltip}
    >
      {label}
    </span>
  );
}

interface DoseHeaderProps {
  level: number;
  label: string;
  /** Full dose label shown as tooltip (e.g., "200 mg/kg") */
  tooltip?: string;
  /** Small unit annotation rendered below the underline (e.g., "mg/kg") — only on first dose column */
  unitLabel?: string;
  className?: string;
}

/** Dose column header with colored underline indicator. */
export function DoseHeader({ level, label, tooltip, unitLabel, className }: DoseHeaderProps) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5", className)} title={tooltip}>
      <span>{label}</span>
      <span
        className="h-0.5 w-full rounded-full"
        style={{ backgroundColor: getDoseGroupColor(level) }}
      />
      {unitLabel && (
        <span className="text-[10px] leading-none text-muted-foreground/50">{unitLabel}</span>
      )}
    </div>
  );
}
