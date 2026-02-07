import type { Insight } from "@/types/analysis";

const ACCENT_COLORS: Record<string, string> = {
  warning: "border-l-amber-500",
  critical: "border-l-red-500",
};

interface Props {
  insights: Insight[];
}

export function InsightBlock({ insights }: Props) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {insights.map((insight, i) => {
        const accent = ACCENT_COLORS[insight.level];
        return accent ? (
          <div
            key={i}
            className={`border-l-2 ${accent} pl-2 text-[11px] leading-snug text-foreground`}
          >
            {insight.text}
          </div>
        ) : (
          <div
            key={i}
            className="pl-2 text-[11px] leading-snug text-muted-foreground"
          >
            {insight.text}
          </div>
        );
      })}
    </div>
  );
}
