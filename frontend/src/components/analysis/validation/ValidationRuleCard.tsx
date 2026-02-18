import type { ValidationRuleResult } from "@/hooks/useValidationResults";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { cn } from "@/lib/utils";

const SEV_ICON: Record<string, string> = {
  Error: "\u2716",
  Warning: "\u26A0",
  Info: "\u2139",
};

const SEV_COLOR: Record<string, string> = {
  Error: "text-[#dc2626]",
  Warning: "text-[#d97706]",
  Info: "text-[#16a34a]",
};

interface Props {
  rule: ValidationRuleResult;
  isSelected: boolean;
  isDisabled: boolean;
  maxRecords: number;
  onClick: () => void;
}

export function ValidationRuleCard({
  rule,
  isSelected,
  isDisabled,
  maxRecords,
  onClick,
}: Props) {
  const isClean = rule.status === "clean";
  const barWidth =
    maxRecords > 0
      ? Math.max(2, (rule.records_affected / maxRecords) * 100)
      : 0;

  // Parse domain list — may be comma-separated for synthetic catalog entries
  const domains = rule.domain.includes(",")
    ? rule.domain.split(",").map((d) => d.trim())
    : [rule.domain];

  return (
    <button
      className={cn(
        "w-full rounded border px-2.5 py-2 text-left transition-colors",
        isSelected
          ? "bg-accent ring-1 ring-primary"
          : "hover:bg-muted/30",
        isClean && !isSelected && "opacity-60",
        isDisabled && "opacity-40",
      )}
      onClick={onClick}
    >
      {/* Row 1: rule_id + severity icon */}
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "font-mono text-[11px] font-semibold",
            isDisabled && "line-through",
          )}
        >
          {rule.rule_id}
        </span>
        <span className={cn("text-[11px]", SEV_COLOR[rule.severity])}>
          {SEV_ICON[rule.severity]}
        </span>
      </div>

      {/* Row 2: description */}
      <p
        className={cn(
          "mt-0.5 line-clamp-2 text-[10px] text-muted-foreground",
          isDisabled && "italic",
        )}
      >
        {rule.description}
      </p>
      {isDisabled && (
        <span className="mt-0.5 inline-block text-[9px] italic text-muted-foreground/60">
          disabled
        </span>
      )}

      {/* Row 3: domain chips */}
      <div className="mt-1 flex flex-wrap gap-0.5">
        {domains.map((d) => (
          <DomainLabel key={d} domain={d} />
        ))}
      </div>

      {/* Row 4: density bar + record count */}
      {rule.records_affected > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-gray-400"
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
            {rule.records_affected} rec
          </span>
        </div>
      )}
    </button>
  );
}
