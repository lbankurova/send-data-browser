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

const PATTERN_DOT_COLORS: Record<string, string> = {
  monotonic_increase: "#dc2626",
  monotonic_decrease: "#2563eb",
  threshold: "#d97706",
  non_monotonic: "#7c3aed",
  flat: "#16a34a",
  insufficient_data: "#9ca3af",
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

      {/* Pattern */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: PATTERN_DOT_COLORS[data.pattern] ?? "#9ca3af" }}
        />
        <span className="font-medium">
          {PATTERN_LABELS[data.pattern] ?? data.pattern}
        </span>
        {data.direction && data.direction !== "none" && (
          <span className="text-muted-foreground">
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
