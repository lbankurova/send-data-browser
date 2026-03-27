import type { ValidationRuleResult } from "@/hooks/useValidationResults";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { cn } from "@/lib/utils";

/** Left-border pipe color encodes severity (matches findings endpoint pipe pattern). */
const SEV_PIPE: Record<string, string> = {
  Error: "#dc2626",
  Warning: "#d97706",
  Info: "transparent",
};

interface Props {
  rule: ValidationRuleResult;
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

export function ValidationRuleCard({
  rule,
  isSelected,
  isDisabled,
  onClick,
}: Props) {
  const isClean = rule.status === "clean";

  // Parse domain list — may be comma-separated for synthetic catalog entries
  const domains = rule.domain.includes(",")
    ? rule.domain.split(",").map((d) => d.trim())
    : [rule.domain];

  return (
    <button
      className={cn(
        "w-full border-l-2 px-3 py-1.5 text-left text-xs cursor-pointer transition-colors",
        isSelected
          ? "border-primary bg-accent/50"
          : "hover:bg-accent/30",
        isClean && !isSelected && "opacity-60",
        isDisabled && "opacity-40",
      )}
      style={
        !isSelected
          ? { borderLeftColor: SEV_PIPE[rule.severity] ?? "transparent" }
          : undefined
      }
      onClick={onClick}
      aria-selected={isSelected}
    >
      {/* Row 1: rule_id + record count */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "font-mono font-semibold",
            isDisabled && "line-through",
          )}
        >
          {rule.rule_id}
        </span>
        {rule.records_affected > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {rule.records_affected} rec
          </span>
        )}
      </div>

      {/* Row 2: description + domain chips */}
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px] text-muted-foreground",
            isDisabled && "italic",
          )}
          title={rule.description}
        >
          {rule.description}
        </span>
        <div className="shrink-0 flex items-center gap-0.5">
          {domains.map((d) => (
            <DomainLabel key={d} domain={d} />
          ))}
        </div>
      </div>
    </button>
  );
}
