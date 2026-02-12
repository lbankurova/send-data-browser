import { useState, useMemo } from "react";
import { CollapsiblePane } from "./panes/CollapsiblePane";
import { ThresholdEditor } from "./ThresholdEditor";
import { CustomInsightRuleBuilder } from "./CustomInsightRuleBuilder";
import { FilterBar, FilterBarCount, FilterSelect } from "@/components/ui/FilterBar";
import {
  RULE_CATALOG,
  THRESHOLDS,
  SIGNAL_SCORE_WEIGHTS,
  PATTERN_SCORES,
  TIER_CLASSIFICATION,
  PRIORITY_BANDS,
  NOAEL_CONFIDENCE_PENALTIES,
} from "@/lib/rule-definitions";
import type { RuleDef } from "@/lib/rule-definitions";
import type { RuleResult } from "@/types/analysis-views";

interface Props {
  ruleResults: RuleResult[];
  organFilter: string | null;
  studyId?: string;
}

export function RuleInspectorTab({ ruleResults, organFilter, studyId }: Props) {
  const [scopeFilter, setScopeFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");

  // Count fired per rule
  const firedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of ruleResults) {
      counts.set(r.rule_id, (counts.get(r.rule_id) ?? 0) + 1);
    }
    return counts;
  }, [ruleResults]);

  // Organ-filtered fired counts (when organ is selected)
  const organFiredCounts = useMemo(() => {
    if (!organFilter) return firedCounts;
    const counts = new Map<string, number>();
    const organRules = ruleResults.filter(
      (r) =>
        r.organ_system === organFilter ||
        r.context_key?.includes(organFilter) ||
        r.scope === "study"
    );
    for (const r of organRules) {
      counts.set(r.rule_id, (counts.get(r.rule_id) ?? 0) + 1);
    }
    return counts;
  }, [ruleResults, organFilter, firedCounts]);

  // Filter rules
  const filteredRules = useMemo(() => {
    return RULE_CATALOG.filter((rule) => {
      if (scopeFilter && rule.scope !== scopeFilter) return false;
      if (severityFilter && rule.severity !== severityFilter) return false;
      return true;
    });
  }, [scopeFilter, severityFilter]);

  const totalFired = useMemo(() => {
    let count = 0;
    for (const rule of filteredRules) {
      count += organFiredCounts.get(rule.id) ?? 0;
    }
    return count;
  }, [filteredRules, organFiredCounts]);

  // Get a sample output text for a rule
  const getSample = (ruleId: string): string | null => {
    const match = ruleResults.find((r) => r.rule_id === ruleId);
    return match?.output_text ?? null;
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <FilterBar>
        <FilterSelect
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value)}
        >
          <option value="">All scopes</option>
          <option value="endpoint">Endpoint</option>
          <option value="organ">Organ</option>
          <option value="study">Study</option>
        </FilterSelect>
        <FilterSelect
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">All severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </FilterSelect>
        <FilterBarCount>
          {filteredRules.length} rules, {totalFired} fired
        </FilterBarCount>
      </FilterBar>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Signal score formula */}
        <CollapsiblePane title="Signal score formula" defaultOpen>
          <div className="space-y-2 text-[11px]">
            <div className="rounded bg-muted/40 px-3 py-2 font-mono text-[10px]">
              {SIGNAL_SCORE_WEIGHTS.pValue} &times; p-value + {SIGNAL_SCORE_WEIGHTS.trend} &times; trend + {SIGNAL_SCORE_WEIGHTS.effectSize} &times; effect size + {SIGNAL_SCORE_WEIGHTS.pattern} &times; pattern
            </div>
            <ComponentDetails />
            <div className="mt-2 border-t pt-2">
              <div className="mb-1 text-[10px] font-medium text-muted-foreground">Evidence score formula</div>
              <div className="rounded bg-muted/40 px-3 py-2 font-mono text-[10px]">
                (total_signal / n_endpoints) &times; (1 + 0.2 &times; (n_domains &minus; 1))
              </div>
            </div>
            <div className="mt-2 border-t pt-2">
              <div className="mb-1 text-[10px] font-medium text-muted-foreground">Target organ threshold</div>
              <div className="font-mono text-[10px]">
                evidence &ge; 0.3 AND n_significant &ge; 1
              </div>
            </div>
          </div>
        </CollapsiblePane>

        {/* Rules list */}
        <CollapsiblePane title="Rules" defaultOpen>
          <div className="space-y-0">
            {filteredRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                firedCount={organFiredCounts.get(rule.id) ?? 0}
                sample={getSample(rule.id)}
              />
            ))}
          </div>
        </CollapsiblePane>

        {/* Thresholds */}
        <CollapsiblePane title="Thresholds" defaultOpen={false}>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-1 text-left font-medium">Name</th>
                <th className="pb-1 text-left font-medium">Value</th>
                <th className="pb-1 text-left font-medium">Used by</th>
              </tr>
            </thead>
            <tbody>
              {THRESHOLDS.map((t) => (
                <tr key={t.key} className="border-b border-border/30">
                  <td className="py-1 pr-2">{t.name}</td>
                  <td className="py-1 pr-2 font-mono">{t.value}</td>
                  <td className="py-1 font-mono text-muted-foreground">
                    {t.usedBy.length > 0 ? t.usedBy.join(", ") : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsiblePane>

        {/* Tier classification */}
        <CollapsiblePane title="Tier classification" defaultOpen={false}>
          <div className="space-y-1.5 text-[11px]">
            {TIER_CLASSIFICATION.map((t) => (
              <div key={t.tier} className="flex items-baseline gap-2">
                <span className="font-semibold">{t.tier}:</span>
                <span className="text-muted-foreground">{t.condition}</span>
              </div>
            ))}
          </div>
        </CollapsiblePane>

        {/* Priority bands */}
        <CollapsiblePane title="Priority bands" defaultOpen={false}>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-1 text-left font-medium">Range</th>
                <th className="pb-1 text-left font-medium">Section</th>
                <th className="pb-1 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {PRIORITY_BANDS.map((b) => (
                <tr key={b.range} className="border-b border-border/30">
                  <td className="py-1 pr-2 font-mono">{b.range}</td>
                  <td className="py-1 pr-2 font-semibold">{b.section}</td>
                  <td className="py-1 text-muted-foreground">{b.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsiblePane>

        {/* NOAEL confidence */}
        <CollapsiblePane title="NOAEL confidence" defaultOpen={false}>
          <div className="space-y-1.5 text-[11px]">
            <div className="font-mono text-[10px]">Base: 1.00, penalized by:</div>
            {NOAEL_CONFIDENCE_PENALTIES.map((p) => (
              <div key={p.key} className="flex items-baseline gap-2 font-mono text-[10px]">
                <span className="text-muted-foreground">{p.name}:</span>
                <span>{p.penalty.toFixed(2)}</span>
                <span className="text-muted-foreground">({p.condition})</span>
              </div>
            ))}
          </div>
        </CollapsiblePane>

        {/* Threshold editor (TRUST-01p2) */}
        {studyId && <ThresholdEditor studyId={studyId} />}

        {/* Custom insight rules (TRUST-01p3) */}
        {studyId && <CustomInsightRuleBuilder studyId={studyId} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component details (collapsible sub-section)
// ---------------------------------------------------------------------------

function ComponentDetails() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        className="text-[10px] text-primary hover:underline"
        onClick={() => setOpen(!open)}
      >
        {open ? "\u25BC" : "\u25B6"} Component details
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 pl-3 text-[10px] text-muted-foreground">
          <div>&bull; p-value: min(&minus;log<sub>10</sub>(p) / 4.0, 1.0), cap at p = 0.0001</div>
          <div>&bull; Trend: min(&minus;log<sub>10</sub>(trend_p) / 4.0, 1.0)</div>
          <div>&bull; Effect size: min(|d| / 2.0, 1.0), cap at |d| = 2.0</div>
          <div>&bull; Pattern: lookup table ({Object.entries(PATTERN_SCORES).map(([k, v]) => `${k.replace(/_/g, " ")}=${v}`).join(", ")})</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual rule row
// ---------------------------------------------------------------------------

function RuleRow({
  rule,
  firedCount,
  sample,
}: {
  rule: RuleDef;
  firedCount: number;
  sample: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const notFired = firedCount === 0;

  return (
    <div
      className={`border-b border-border/30 px-1 py-1.5 ${notFired ? "opacity-50" : ""}`}
    >
      <button
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {rule.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {rule.name}
        </span>
        <span className="shrink-0 rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600">
          {rule.scope}
        </span>
        <span className="shrink-0 rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600">
          {rule.severity}
        </span>
        {firedCount > 0 ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 text-[9px] font-mono">
            {firedCount} fired
          </span>
        ) : (
          <span className="shrink-0 text-[9px] italic text-muted-foreground">
            not triggered
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-1 space-y-1 pl-5">
          <div className="text-[10px] text-muted-foreground">
            <span className="font-medium">Condition:</span>{" "}
            <span className="font-mono">{rule.conditionHuman}</span>
          </div>
          {sample && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium">Sample:</span>{" "}
              <span className="italic">&ldquo;{sample}&rdquo;</span>
            </div>
          )}
          {rule.thresholdRefs.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium">Thresholds:</span>{" "}
              {rule.thresholdRefs
                .map((ref) => THRESHOLDS.find((t) => t.key === ref)?.name ?? ref)
                .join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
