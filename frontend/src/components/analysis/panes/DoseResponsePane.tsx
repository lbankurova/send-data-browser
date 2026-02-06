import { cn } from "@/lib/utils";
import { formatPValue, getPValueColor } from "@/lib/severity-colors";
import type { FindingContext } from "@/types/analysis";
import { InsightBlock } from "./InsightBlock";

interface Props {
  data: FindingContext["dose_response"];
}

const PATTERN_LABELS: Record<string, string> = {
  monotonic_increase: "Monotonic increase",
  monotonic_decrease: "Monotonic decrease",
  threshold: "Threshold effect",
  non_monotonic: "Non-monotonic",
  flat: "Flat (no effect)",
  insufficient_data: "Insufficient data",
};

const PATTERN_COLORS: Record<string, string> = {
  monotonic_increase: "bg-red-100 text-red-700 border-red-200",
  monotonic_decrease: "bg-blue-100 text-blue-700 border-blue-200",
  threshold: "bg-amber-100 text-amber-700 border-amber-200",
  non_monotonic: "bg-purple-100 text-purple-700 border-purple-200",
  flat: "bg-green-100 text-green-700 border-green-200",
  insufficient_data: "bg-gray-100 text-gray-500 border-gray-200",
};

export function DoseResponsePane({ data }: Props) {
  // Find max value for bar scaling
  const values = data.bars
    .map((b) => b.value)
    .filter((v): v is number => v != null);
  const maxVal = values.length > 0 ? Math.max(...values.map(Math.abs)) : 1;

  return (
    <div className="space-y-3">
      <InsightBlock insights={data.insights} />

      {/* Pattern badge */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded border px-2 py-0.5 text-[10px] font-medium",
            PATTERN_COLORS[data.pattern] ?? PATTERN_COLORS.insufficient_data
          )}
        >
          {PATTERN_LABELS[data.pattern] ?? data.pattern}
        </span>
        {data.direction && data.direction !== "none" && (
          <span className="text-xs text-muted-foreground">
            {data.direction === "up" ? "Increasing" : "Decreasing"}
          </span>
        )}
      </div>

      {/* CSS bar chart */}
      <div className="space-y-1">
        {data.bars.map((bar) => {
          const pct =
            bar.value != null && maxVal > 0
              ? (Math.abs(bar.value) / maxVal) * 100
              : 0;

          return (
            <div key={bar.dose_level} className="flex items-center gap-2">
              <span className="w-[50px] shrink-0 truncate text-right text-[10px] text-muted-foreground">
                {bar.dose_value != null ? bar.dose_value : bar.label}
              </span>
              <div className="flex-1">
                <div
                  className="h-4 rounded-sm bg-primary/30"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="w-[55px] shrink-0 text-right font-mono text-[10px]">
                {bar.value != null ? bar.value.toFixed(2) : "—"}
                {bar.count != null && bar.total != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({bar.count}/{bar.total})
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Trend */}
      <div className="text-xs">
        <span className="text-muted-foreground">Trend test: </span>
        <span className={cn("font-mono", getPValueColor(data.trend_p))}>
          p={formatPValue(data.trend_p)}
        </span>
      </div>
    </div>
  );
}
