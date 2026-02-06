import { cn } from "@/lib/utils";
import {
  formatEffectSize,
  getEffectSizeColor,
} from "@/lib/severity-colors";
import type { FindingContext } from "@/types/analysis";
import { InsightBlock } from "./InsightBlock";

interface Props {
  data: FindingContext["effect_size"];
}

export function EffectSizePane({ data }: Props) {
  return (
    <div className="space-y-3">
      <InsightBlock insights={data.insights} />

      {/* Current finding detail */}
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Selected finding
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-lg font-mono",
              getEffectSizeColor(data.current_effect_size)
            )}
          >
            {formatEffectSize(data.current_effect_size)}
          </span>
          <span className="text-xs text-muted-foreground">
            {data.data_type === "continuous" ? "Cohen's d" : "Avg severity"}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {data.interpretation}
        </div>
      </div>

      {/* Largest effects table */}
      {data.largest_effects.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Largest effects (top 10)
          </div>
          <div className="space-y-0.5">
            {data.largest_effects.map((e) => (
              <div
                key={e.finding_id}
                className="flex items-center gap-1 text-[11px]"
              >
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
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground">
        {data.total_with_effects} findings with computed effect sizes
      </div>
    </div>
  );
}
