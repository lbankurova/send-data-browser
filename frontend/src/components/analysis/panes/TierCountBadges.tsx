import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/rule-synthesis";

const TIER_COLOR: Record<Tier, string> = {
  Critical: "text-[#DC2626]",
  Notable: "text-[#D97706]",
  Observed: "text-muted-foreground",
};

const TIER_TOOLTIP: Record<Tier, string> = {
  Critical: "High-confidence adverse signals requiring attention",
  Notable: "Moderate signals worth investigating",
  Observed: "Low-level observations for completeness",
};

interface Props {
  counts: Record<Tier, number>;
  activeTier?: Tier | null;
  onTierClick?: (tier: Tier | null) => void;
}

export function TierCountBadges({ counts, activeTier, onTierClick }: Props) {
  const tiers = (["Critical", "Notable", "Observed"] as const).filter(
    (t) => counts[t] > 0
  );
  if (tiers.length === 0) return null;

  return (
    <>
      <span className="text-muted-foreground/60">Insights: </span>
      {tiers.map((tier, i) => (
        <span key={tier}>
          {i > 0 && <span className="text-muted-foreground/40"> · </span>}
          <button
            className={cn(
              TIER_COLOR[tier],
              activeTier === tier && "underline underline-offset-2",
              activeTier != null && activeTier !== tier && "opacity-30"
            )}
            title={`${TIER_TOOLTIP[tier]}. Click to filter.`}
            onClick={(e) => {
              e.stopPropagation();
              onTierClick?.(activeTier === tier ? null : tier);
            }}
          >
            {counts[tier]} {tier.toLowerCase()}
          </button>
        </span>
      ))}
      {activeTier != null && (() => {
        const total = counts.Critical + counts.Notable + counts.Observed;
        const visible = counts[activeTier];
        return (
          <>
            <span className="ml-1 text-muted-foreground/40">
              {visible}/{total}
            </span>
            <button
              className="ml-0.5 text-muted-foreground/40 hover:text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onTierClick?.(null);
              }}
              title="Clear filter"
            >
              {"\u00D7"}
            </button>
          </>
        );
      })()}
    </>
  );
}
