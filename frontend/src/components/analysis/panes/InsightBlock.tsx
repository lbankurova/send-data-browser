import { cn } from "@/lib/utils";
import type { Insight } from "@/types/analysis";

const LEVEL_STYLES: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-red-200 bg-red-50 text-red-800",
};

interface Props {
  insights: Insight[];
}

export function InsightBlock({ insights }: Props) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {insights.map((insight, i) => (
        <div
          key={i}
          className={cn(
            "rounded-md border px-2.5 py-1.5 text-[11px] leading-snug",
            LEVEL_STYLES[insight.level] ?? LEVEL_STYLES.info
          )}
        >
          {insight.text}
        </div>
      ))}
    </div>
  );
}
