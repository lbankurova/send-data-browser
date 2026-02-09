import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { RuleResult } from "@/types/analysis-views";
import {
  buildOrganGroups,
  cleanText,
  type Tier,
  type SynthLine,
  type SynthEndpoint,
} from "@/lib/rule-synthesis";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  rules: RuleResult[];
  tierFilter?: Tier | null;
}

export function InsightsList({ rules, tierFilter }: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const organGroups = useMemo(() => buildOrganGroups(rules), [rules]);

  const visible = useMemo(
    () => tierFilter ? organGroups.filter((g) => g.tier === tierFilter) : organGroups,
    [organGroups, tierFilter]
  );

  if (rules.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No insights available.</p>;
  }

  return (
    <div className="divide-y divide-border/40">
      {/* Organ groups */}
      {visible.map((g, gi) => {
        const expanded = expandedGroups.has(g.organ);
        return (
          <div key={g.organ} className={cn("pb-2.5", gi > 0 ? "pt-2.5" : "")}>
            {/* Organ header: tier + name + endpoint count */}
            <div className="mb-1 flex items-baseline gap-1.5">
              <TierBadge tier={g.tier} />
              <span className="text-[11px] font-semibold">
                {g.displayName}
              </span>
              {g.endpointCount > 0 && (
                <span className="text-[9px] text-muted-foreground/50">
                  {g.endpointCount} ep{g.domainCount > 0 && ` · ${g.domainCount} dom`}
                </span>
              )}
            </div>

            {/* Synthesis lines */}
            <div className="space-y-1 pl-1">
              {g.synthLines.map((line, i) => (
                <SynthLineItem key={i} line={line} />
              ))}
            </div>

            {g.rules.length > 0 && (
              <button
                className="mt-1 pl-1 text-[10px] text-muted-foreground hover:text-foreground"
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
          No signals available.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SynthLineItem({ line }: { line: SynthLine }) {
  // Structured endpoint signals
  if (line.endpoints && line.endpoints.length > 0) {
    return (
      <div className="space-y-0.5">
        {line.endpoints.map((ep, i) => (
          <EndpointRow key={i} ep={ep} />
        ))}
        {line.extraCount != null && line.extraCount > 0 && (
          <div className="pl-1 text-[10px] text-muted-foreground/50">
            +{line.extraCount} more
          </div>
        )}
        {line.qualifiers && line.qualifiers.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1 pl-1">
            {line.qualifiers.map((q) => (
              <span
                key={q}
                className="rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground"
              >
                {q}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // List layout (histopath findings)
  if (line.listItems && line.listItems.length > 0) {
    return (
      <div className="pl-1">
        <div className="mb-0.5 text-[10px] font-medium text-muted-foreground/70">
          {line.text}
        </div>
        <div className="space-y-1">
          {line.listItems.map((item, j) => (
            <div key={j} className="text-[11px] leading-snug text-foreground">
              <HistopathItem text={item} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Chip layout (R16 correlations)
  if (line.chips) {
    return (
      <div className="pl-1">
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

  // Plain text
  return (
    <div
      className={cn(
        "pl-1 text-[11px] leading-snug",
        line.isWarning ? "font-medium text-foreground" : "text-muted-foreground"
      )}
    >
      {line.text}
    </div>
  );
}

function EndpointRow({ ep }: { ep: SynthEndpoint }) {
  const bySex = new Map(ep.effectSizes.map((e) => [e.sex, e.d]));
  const fVal = bySex.get("F");
  const mVal = bySex.get("M");

  return (
    <div className="flex items-baseline gap-1.5 py-px pl-1 text-[11px]">
      <span className="min-w-0 truncate font-medium" title={ep.name}>
        {ep.name}
      </span>
      {ep.direction && (
        <span className="shrink-0 text-[#9CA3AF]">{ep.direction}</span>
      )}
      {(fVal != null || mVal != null) && (
        <span className="ml-auto shrink-0 font-mono text-[10px]">
          <span className="inline-block w-[32px] text-right">
            {fVal != null ? (
              <>
                <span className={cn("text-muted-foreground", fVal >= 0.8 && "ev font-semibold")}>{fVal.toFixed(1)}</span>
                <span className="text-muted-foreground/50">F</span>
              </>
            ) : (
              <span className="text-muted-foreground/20">F</span>
            )}
          </span>
          <span className="inline-block w-[32px] text-right">
            {mVal != null ? (
              <>
                <span className={cn("text-muted-foreground", mVal >= 0.8 && "ev font-semibold")}>{mVal.toFixed(1)}</span>
                <span className="text-muted-foreground/50">M</span>
              </>
            ) : (
              <span className="text-muted-foreground/20">M</span>
            )}
          </span>
        </span>
      )}
    </div>
  );
}

/** Split "FINDING in SPECIMEN (sex)" — color the "in" as a muted separator */
function HistopathItem({ text }: { text: string }) {
  const m = text.match(/^(.+?)\s+in\s+(.+)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="font-medium">{m[1]}</span>
      <span className="text-[#7C3AED]/70"> in </span>
      {m[2]}
    </>
  );
}

const TIER_COLOR: Record<Tier, string> = {
  Critical: "text-[#DC2626]",
  Notable: "text-[#D97706]",
  Observed: "text-muted-foreground/60",
};

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={cn("text-[9px] font-semibold uppercase", TIER_COLOR[tier])}>
      {tier}
    </span>
  );
}
