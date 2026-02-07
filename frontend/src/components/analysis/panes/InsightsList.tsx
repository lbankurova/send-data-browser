import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { RuleResult } from "@/types/analysis-views";
import {
  buildOrganGroups,
  cleanText,
  type Tier,
  type SynthLine,
} from "@/lib/rule-synthesis";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  rules: RuleResult[];
}

export function InsightsList({ rules }: Props) {
  const [activeTiers, setActiveTiers] = useState<Set<Tier>>(
    () => new Set<Tier>(["Critical", "Notable"])
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const organGroups = useMemo(() => buildOrganGroups(rules), [rules]);

  const tierCounts = useMemo(() => {
    const counts: Record<Tier, number> = { Critical: 0, Notable: 0, Observed: 0 };
    for (const g of organGroups) counts[g.tier]++;
    return counts;
  }, [organGroups]);

  const hasHighTiers = tierCounts.Critical > 0 || tierCounts.Notable > 0;

  const visible = useMemo(() => {
    if (!hasHighTiers) return organGroups;
    return organGroups.filter((g) => activeTiers.has(g.tier));
  }, [organGroups, activeTiers, hasHighTiers]);

  const toggleTier = (tier: Tier) => {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  if (rules.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No insights available.</p>;
  }

  return (
    <div className="space-y-2">
      {/* Tier filter bar */}
      {hasHighTiers && (
        <div className="flex gap-1">
          {(["Critical", "Notable", "Observed"] as const).map((tier) => {
            const count = tierCounts[tier];
            if (count === 0) return null;
            const active = activeTiers.has(tier);
            return (
              <button
                key={tier}
                onClick={() => toggleTier(tier)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-medium leading-relaxed transition-opacity",
                  TIER_STYLES[tier],
                  active ? "opacity-100" : "opacity-30"
                )}
              >
                {tier} {count}
              </button>
            );
          })}
        </div>
      )}

      {/* Organ groups */}
      {visible.map((g) => {
        const expanded = expandedGroups.has(g.organ);
        return (
          <div key={g.organ}>
            <div className="mb-0.5 flex items-center gap-1.5">
              <TierBadge tier={g.tier} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.displayName}
              </span>
            </div>

            {g.endpointCount > 0 && (
              <div className="mb-1 pl-2 text-[10px] text-muted-foreground/60">
                {g.endpointCount} endpoint{g.endpointCount !== 1 ? "s" : ""}
                {g.domainCount > 0 &&
                  `, ${g.domainCount} domain${g.domainCount !== 1 ? "s" : ""}`}
              </div>
            )}

            <div className="space-y-1.5">
              {g.synthLines.map((line, i) => (
                <SynthLineItem key={i} line={line} />
              ))}
            </div>

            {g.rules.length > 0 && (
              <button
                className="mt-0.5 text-[10px] text-blue-600 hover:text-blue-800"
                onClick={() => {
                  const next = new Set(expandedGroups);
                  if (expanded) next.delete(g.organ);
                  else next.add(g.organ);
                  setExpandedGroups(next);
                }}
              >
                {expanded
                  ? "Hide rules"
                  : `Show ${g.rules.length} rule${g.rules.length !== 1 ? "s" : ""}`}
              </button>
            )}

            {expanded && (
              <div className="mt-1 space-y-0.5 border-l border-border pl-2">
                {g.rules.map((rule, i) => (
                  <div
                    key={`${rule.rule_id}-${i}`}
                    className="text-[10px] leading-snug text-muted-foreground"
                  >
                    <span className="font-mono text-muted-foreground/50">
                      {rule.rule_id}
                    </span>{" "}
                    {cleanText(rule.output_text)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {visible.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No signals for selected tiers.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SynthLineItem({ line }: { line: SynthLine }) {
  if (line.chips) {
    return (
      <div className="pl-2">
        <div className="mb-1 text-[10px] text-muted-foreground/70">
          {line.text}
        </div>
        <div className="flex flex-wrap gap-1">
          {line.chips.map((chip, j) => (
            <span
              key={j}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "pl-2 text-[11px] leading-snug",
        line.isWarning
          ? "border-l-2 border-l-amber-500 text-foreground"
          : "text-muted-foreground"
      )}
    >
      {line.text}
    </div>
  );
}

const TIER_STYLES: Record<Tier, string> = {
  Critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Notable: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Observed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0 text-[9px] font-medium leading-relaxed",
        TIER_STYLES[tier]
      )}
    >
      {tier}
    </span>
  );
}
