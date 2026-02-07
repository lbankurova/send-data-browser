import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { RuleResult } from "@/types/analysis-views";

/** Category grouping based on rule_id */
const CATEGORY_MAP: Record<string, string> = {
  R04: "Adverse Findings",
  R12: "Adverse Findings",
  R10: "Effect Size",
  R11: "Effect Size",
  R01: "Dose-Response",
  R05: "Dose-Response",
  R06: "Dose-Response",
  R07: "Dose-Response",
  R02: "Statistical",
  R03: "Statistical",
  R08: "Organ Evidence",
  R09: "Organ Evidence",
  R16: "Organ Evidence",
  R14: "NOAEL",
};

const CATEGORY_ORDER = [
  "Adverse Findings",
  "Effect Size",
  "Dose-Response",
  "Statistical",
  "Organ Evidence",
  "NOAEL",
  "Other",
];

/** Prefixes to strip from output_text for cleaner display */
const STRIP_PREFIXES = [
  "Treatment-related: ",
  "Adverse finding: ",
  "Large effect: ",
  "Moderate effect: ",
  "Monotonic dose-response: ",
  "Non-monotonic: ",
  "Threshold effect: ",
  "Histopathology: ",
  "Severity grade increase: ",
];

function cleanText(text: string): string {
  for (const prefix of STRIP_PREFIXES) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length);
    }
  }
  return text;
}

interface Props {
  rules: RuleResult[];
  maxPerGroup?: number;
}

export function InsightsList({ rules, maxPerGroup = 3 }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Check if any warning/critical exist
  const hasHighSeverity = useMemo(
    () => rules.some((r) => r.severity === "warning" || r.severity === "critical"),
    [rules]
  );

  // Filter by severity
  const visibleRules = useMemo(() => {
    if (showAll || !hasHighSeverity) return rules;
    return rules.filter((r) => r.severity === "warning" || r.severity === "critical");
  }, [rules, showAll, hasHighSeverity]);

  // Group by category
  const groups = useMemo(() => {
    const map = new Map<string, RuleResult[]>();
    for (const rule of visibleRules) {
      const category = CATEGORY_MAP[rule.rule_id] ?? "Other";
      const list = map.get(category);
      if (list) {
        list.push(rule);
      } else {
        map.set(category, [rule]);
      }
    }
    // Sort by defined order
    return CATEGORY_ORDER
      .filter((cat) => map.has(cat))
      .map((cat) => ({ category: cat, rules: map.get(cat)! }));
  }, [visibleRules]);

  if (rules.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No insights available.</p>;
  }

  if (groups.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No insights match current filter.</p>;
  }

  return (
    <div>
      {/* Severity toggle */}
      {hasHighSeverity && (
        <div className="mb-2">
          <button
            className="text-[10px] text-blue-600 hover:text-blue-800"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Hide info-level" : "Show all"}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {groups.map(({ category, rules: groupRules }) => {
          const isExpanded = expandedGroups.has(category);
          const limit = isExpanded ? groupRules.length : maxPerGroup;
          const shown = groupRules.slice(0, limit);
          const remaining = groupRules.length - shown.length;

          return (
            <div key={category}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </div>
              <div className="space-y-1">
                {shown.map((rule, i) => {
                  const borderClass =
                    rule.severity === "warning"
                      ? "border-l-amber-500"
                      : rule.severity === "critical"
                        ? "border-l-red-500"
                        : "";
                  return (
                    <div
                      key={`${rule.rule_id}-${i}`}
                      className={cn(
                        borderClass ? `border-l-2 ${borderClass}` : "",
                        "pl-2 text-[11px] leading-snug"
                      )}
                    >
                      <span
                        className={
                          borderClass ? "text-foreground" : "text-muted-foreground"
                        }
                      >
                        {cleanText(rule.output_text)}
                      </span>
                      {rule.evidence_refs.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                          {rule.evidence_refs.join("; ")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {remaining > 0 && (
                <button
                  className="mt-0.5 text-[10px] text-blue-600 hover:text-blue-800"
                  onClick={() => {
                    const next = new Set(expandedGroups);
                    next.add(category);
                    setExpandedGroups(next);
                  }}
                >
                  Show {remaining} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
