import { cn } from "@/lib/utils";
import { formatEffectSize, getEffectSizeColor } from "@/lib/severity-colors";
import type { FindingContext } from "@/types/analysis";

// ─── Types ─────────────────────────────────────────────────

interface Props {
  effectSize: FindingContext["effect_size"];
  selectedFindingId: string | null;
}

// ─── Component ──────────────────────────────────────────────

export function ContextPane({ effectSize, selectedFindingId }: Props) {
  if (effectSize.largest_effects.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No effect sizes computed for this study.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Largest effects (top 10)
      </div>
      <div className="space-y-0.5">
        {effectSize.largest_effects.map((e, i) => {
          const isSelected = e.finding_id === selectedFindingId;
          return (
            <div
              key={e.finding_id}
              className={cn(
                "flex items-center gap-1 text-[11px]",
                isSelected && "bg-accent font-medium rounded"
              )}
            >
              <span className="w-5 shrink-0 text-right text-[10px] text-muted-foreground">
                #{i + 1}
              </span>
              <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
                {e.domain}
              </span>
              <span className="flex-1 truncate">{e.finding}</span>
              <span
                className={cn(
                  "shrink-0 font-mono",
                  getEffectSizeColor(e.effect_size)
                )}
              >
                {formatEffectSize(e.effect_size)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground">
        {effectSize.total_with_effects} findings with computed effect sizes
      </div>
    </div>
  );
}
