/**
 * TRUST-05p1 + TRUST-05p2: Validation Rule Catalog & Customization
 * Browsable inspector showing all validation rules, fix tiers,
 * evidence types, and fix scripts.
 * Phase 2 adds enable/disable and severity override per rule.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { CollapsiblePane } from "./panes/CollapsiblePane";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { cn } from "@/lib/utils";
import {
  VALIDATION_RULE_CATALOG,
  FIX_TIER_DEFINITIONS,
  EVIDENCE_TYPE_DEFINITIONS,
} from "@/lib/validation-rule-catalog";
import type { ValidationRuleDef } from "@/lib/validation-rule-catalog";
import type { ValidationRuleResult, FixScriptDef } from "@/hooks/useValidationResults";
import { CustomValidationRuleBuilder } from "./CustomValidationRuleBuilder";
import type { ValidationRuleOverride } from "@/types/annotations";

// ── Severity filter styles ────────────────────────────────────────────

const SEV_ICON: Record<string, string> = {
  Error: "\u2716",
  Warning: "\u26A0",
  Info: "\u2139",
};

const SEVERITY_OPTIONS = ["Error", "Warning", "Info"] as const;

// ── Props ─────────────────────────────────────────────────────────────

interface Props {
  /** Rules that fired in the current validation run */
  firedRules: ValidationRuleResult[];
  /** Fix scripts from API */
  scripts: FixScriptDef[];
  /** CORE conformance info */
  coreConformance: { engine_version: string; standard: string; ct_version: string } | null;
  /** Study ID for persisting rule customizations */
  studyId?: string;
}

// ── Rule row (expandable, with customization) ────────────────────────

function RuleRow({
  rule,
  firedCount,
  isExpanded,
  onToggle,
  override,
  onOverrideChange,
}: {
  rule: ValidationRuleDef;
  firedCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  override?: ValidationRuleOverride;
  onOverrideChange?: (ruleId: string, field: Partial<ValidationRuleOverride>) => void;
}) {
  const fired = firedCount > 0;
  const isDisabled = override?.enabled === false;
  const hasSeverityOverride = override?.severityOverride != null;
  const effectiveSeverity = override?.severityOverride ?? rule.severity;

  return (
    <div
      className={cn(
        "border-b last:border-b-0",
        !fired && !isDisabled && "opacity-50",
        isDisabled && "opacity-30",
      )}
    >
      {/* Header row */}
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
        onClick={onToggle}
      >
        <span className="text-[10px] text-muted-foreground">
          {isExpanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className={cn("font-mono text-[11px] font-semibold", isDisabled && "line-through")}>{rule.id}</span>
        <span className={cn("text-[11px]", isDisabled && "line-through")}>{rule.name}</span>
        <span
          className={cn(
            "rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600",
            hasSeverityOverride && "border-amber-300",
          )}
        >
          {effectiveSeverity}
          {hasSeverityOverride && <span className="ml-0.5 text-[8px] text-amber-600">*</span>}
        </span>
        <span className="flex items-center gap-0.5">
          {rule.applicable_domains.map((d) => (
            <DomainLabel key={d} domain={d} />
          ))}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {isDisabled ? (
            <span className="text-[9px] text-amber-600">disabled</span>
          ) : fired ? (
            <span className="rounded-full bg-muted px-1.5 text-[9px] font-mono">
              {firedCount} issue{firedCount !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-[9px] text-muted-foreground">passed</span>
          )}
        </span>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="space-y-2 border-t bg-muted/10 px-4 py-3 text-[11px]">
          {/* Description */}
          <div>
            <span className="font-medium text-muted-foreground">Condition: </span>
            <span>{rule.description}</span>
          </div>

          {/* Fix guidance */}
          <div>
            <span className="font-medium text-muted-foreground">Fix guidance: </span>
            <span>{rule.fix_guidance}</span>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
            <div>
              <span className="text-muted-foreground">Evidence type: </span>
              <span className="font-mono">{rule.evidence_type}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fix tier: </span>
              <span className="font-mono">{rule.default_fix_tier}</span>
              <span className="ml-1 text-muted-foreground">
                ({FIX_TIER_DEFINITIONS.find((t) => t.tier === rule.default_fix_tier)?.name})
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Auto-fixable: </span>
              <span>{rule.auto_fixable ? "Yes" : "No"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">CDISC ref: </span>
              <span>{rule.cdisc_reference}</span>
            </div>
          </div>

          {/* Customization controls (TRUST-05p2) */}
          {onOverrideChange && (
            <div className="border-t pt-2">
              <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">Rule configuration</div>
              <div className="flex items-center gap-4">
                {/* Enable/disable toggle */}
                <label className="flex items-center gap-1.5 text-[10px]">
                  <input
                    type="checkbox"
                    checked={override?.enabled !== false}
                    onChange={(e) => {
                      e.stopPropagation();
                      onOverrideChange(rule.id, { enabled: e.target.checked });
                    }}
                    className="h-3 w-3"
                  />
                  <span>Enabled</span>
                </label>

                {/* Severity override */}
                <label className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-muted-foreground">Severity:</span>
                  <select
                    className={cn(
                      "rounded border bg-background px-1.5 py-0.5 text-[10px]",
                      hasSeverityOverride && "border-amber-300",
                    )}
                    value={override?.severityOverride ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      const val = e.target.value;
                      onOverrideChange(rule.id, {
                        severityOverride: val ? (val as "Error" | "Warning" | "Info") : null,
                      });
                    }}
                  >
                    <option value="">Default ({rule.severity})</option>
                    {SEVERITY_OPTIONS.filter((s) => s !== rule.severity).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function ValidationRuleCatalog({ firedRules, scripts, coreConformance, studyId }: Props) {
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // Rule override annotations
  const { data: overrideAnnotations } = useAnnotations<ValidationRuleOverride>(
    studyId, "validation-rule-config",
  );
  const { mutate: saveOverride, isPending: overrideSaving, isSuccess: overrideSaved, reset: overrideReset } = useSaveAnnotation<ValidationRuleOverride>(
    studyId, "validation-rule-config",
  );

  // Auto-reset success flash
  useEffect(() => {
    if (overrideSaved) {
      const t = setTimeout(() => overrideReset(), 2000);
      return () => clearTimeout(t);
    }
  }, [overrideSaved, overrideReset]);

  // Count fired issues per custom rule
  const firedCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of firedRules) {
      if (r.source === "custom") {
        map.set(r.rule_id, r.records_affected);
      }
    }
    return map;
  }, [firedRules]);

  // CORE rule counts
  const coreRules = useMemo(
    () => firedRules.filter((r) => r.source === "core"),
    [firedRules],
  );

  // Filter catalog
  const filteredCatalog = useMemo(() => {
    if (!severityFilter) return VALIDATION_RULE_CATALOG;
    return VALIDATION_RULE_CATALOG.filter((r) => r.severity === severityFilter);
  }, [severityFilter]);

  // Severity counts
  const sevCounts = useMemo(() => {
    const c = { Error: 0, Warning: 0, Info: 0 };
    for (const r of VALIDATION_RULE_CATALOG) {
      c[r.severity]++;
    }
    return c;
  }, []);

  const firedTotal = useMemo(() => {
    let count = 0;
    for (const r of VALIDATION_RULE_CATALOG) {
      if (firedCountMap.has(r.id)) count++;
    }
    return count;
  }, [firedCountMap]);

  // Count customized rules
  const customizedCount = useMemo(() => {
    if (!overrideAnnotations) return 0;
    return Object.values(overrideAnnotations).filter(
      (o) => o.enabled === false || o.severityOverride != null,
    ).length;
  }, [overrideAnnotations]);

  const toggleRule = (id: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAllRules = () => {
    setExpandedRules(new Set(VALIDATION_RULE_CATALOG.map((r) => r.id)));
    expandAll();
  };

  const collapseAllRules = () => {
    setExpandedRules(new Set());
    collapseAll();
  };

  const handleOverrideChange = useCallback(
    (ruleId: string, field: Partial<ValidationRuleOverride>) => {
      const existing = overrideAnnotations?.[ruleId];
      saveOverride({
        entityKey: ruleId,
        data: {
          enabled: existing?.enabled ?? true,
          severityOverride: existing?.severityOverride ?? null,
          comment: existing?.comment ?? "",
          ...field,
        },
      });
    },
    [overrideAnnotations, saveOverride],
  );

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <span className="text-xs font-medium">
          {VALIDATION_RULE_CATALOG.length} custom rules, {firedTotal} triggered
          {coreRules.length > 0 && (
            <span className="text-muted-foreground">
              {" "}&middot; {coreRules.length} CORE rules
            </span>
          )}
          {customizedCount > 0 && (
            <span className="text-amber-600">
              {" "}&middot; {customizedCount} customized
            </span>
          )}
        </span>

        {/* Severity filter */}
        <div className="ml-auto flex items-center gap-2 text-xs">
          {(["Error", "Warning", "Info"] as const).map((sev) => (
            <button
              key={sev}
              className={cn(
                "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity",
                severityFilter === sev && "ring-1 ring-border bg-muted/50",
                severityFilter && severityFilter !== sev && "opacity-40",
              )}
              onClick={() => setSeverityFilter((prev) => (prev === sev ? "" : sev))}
              title={`Filter by ${sev.toLowerCase()}`}
            >
              <span className="text-[10px] text-muted-foreground">{SEV_ICON[sev]}</span>
              <span className="font-medium">{sevCounts[sev]}</span>
            </button>
          ))}
        </div>

        {/* Expand/collapse */}
        <div className="flex items-center gap-1 border-l pl-3">
          <button
            className="rounded p-0.5 text-[10px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={expandAllRules}
            title="Expand all"
          >
            +
          </button>
          <button
            className="rounded p-0.5 text-[10px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={collapseAllRules}
            title="Collapse all"
          >
            &minus;
          </button>
        </div>
      </div>

      {/* Save indicator */}
      {(overrideSaving || overrideSaved) && (
        <div className={cn(
          "px-4 py-1 text-[10px]",
          overrideSaved ? "text-green-600" : "text-muted-foreground",
        )}>
          {overrideSaving ? "Saving rule configuration..." : "Rule configuration saved"}
        </div>
      )}

      {/* Custom rules list */}
      <CollapsiblePane
        title={`Custom rules (${filteredCatalog.length})`}
        defaultOpen
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        <div className="border rounded">
          {filteredCatalog.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              firedCount={firedCountMap.get(rule.id) ?? 0}
              isExpanded={expandedRules.has(rule.id)}
              onToggle={() => toggleRule(rule.id)}
              override={overrideAnnotations?.[rule.id]}
              onOverrideChange={studyId ? handleOverrideChange : undefined}
            />
          ))}
          {filteredCatalog.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              No rules match the current filter.
            </div>
          )}
        </div>
      </CollapsiblePane>

      {/* CORE rules summary */}
      <CollapsiblePane
        title={`CDISC CORE rules (${coreRules.length} triggered)`}
        defaultOpen={false}
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        <div className="space-y-2 text-[11px]">
          {coreConformance ? (
            <div className="space-y-1 text-[10px] text-muted-foreground">
              <div>
                <span className="font-medium">Standard: </span>
                <span>{coreConformance.standard}</span>
              </div>
              <div>
                <span className="font-medium">Engine: </span>
                <span>v{coreConformance.engine_version}</span>
              </div>
              {coreConformance.ct_version && (
                <div>
                  <span className="font-medium">CT version: </span>
                  <span>{coreConformance.ct_version}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              CDISC CORE engine was not run for this study.
            </p>
          )}
          {coreRules.length > 0 && (
            <div className="border rounded">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider text-muted-foreground">Rule</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider text-muted-foreground">Severity</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider text-muted-foreground">Domain</th>
                    <th className="px-2 py-1 text-left font-semibold uppercase tracking-wider text-muted-foreground">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {coreRules.map((r) => (
                    <tr key={r.rule_id} className="border-b last:border-b-0">
                      <td className="px-2 py-1 font-mono">{r.rule_id}</td>
                      <td className="px-2 py-1">
                        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1 py-0.5 text-[9px] font-semibold text-gray-600">
                          {r.severity}
                        </span>
                      </td>
                      <td className="px-2 py-1"><DomainLabel domain={r.domain} /></td>
                      <td className="px-2 py-1 tabular-nums">{r.records_affected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsiblePane>

      {/* Fix tier system */}
      <CollapsiblePane
        title="Fix tier system"
        defaultOpen={false}
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        <div className="space-y-2">
          {FIX_TIER_DEFINITIONS.map((t) => (
            <div key={t.tier} className="text-[11px]">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-muted px-1.5 text-[10px] font-mono font-semibold">
                  {t.tier}
                </span>
                <span className="font-medium">{t.name}</span>
              </div>
              <p className="ml-6 text-[10px] text-muted-foreground">{t.description}</p>
            </div>
          ))}
        </div>
      </CollapsiblePane>

      {/* Evidence types */}
      <CollapsiblePane
        title="Evidence types"
        defaultOpen={false}
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        <div className="space-y-1.5">
          {EVIDENCE_TYPE_DEFINITIONS.map((e) => (
            <div key={e.type} className="text-[11px]">
              <span className="font-mono text-[10px] font-medium">{e.type}</span>
              <span className="mx-1.5 text-muted-foreground">&mdash;</span>
              <span className="text-muted-foreground">{e.description}</span>
            </div>
          ))}
        </div>
      </CollapsiblePane>

      {/* Fix scripts */}
      <CollapsiblePane
        title={`Fix scripts (${scripts.length})`}
        defaultOpen={false}
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        {scripts.length > 0 ? (
          <div className="space-y-2">
            {scripts.map((s) => (
              <div key={s.key} className="text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-semibold">{s.key}</span>
                  <span className="font-medium">{s.name}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{s.description}</p>
                {s.applicable_rules.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Applies to:{" "}
                    {s.applicable_rules.map((r, i) => (
                      <span key={r}>
                        {i > 0 && ", "}
                        <span className="font-mono">{r}</span>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No fix scripts available.</p>
        )}
      </CollapsiblePane>

      {/* Custom validation rules (TRUST-05p3) */}
      {studyId && (
        <CustomValidationRuleBuilder
          studyId={studyId}
          expandAll={expandGen}
          collapseAll={collapseGen}
        />
      )}

      {/* Configuration note */}
      {studyId && (
        <div className="px-4 py-2 text-[9px] text-muted-foreground/60">
          Rule configuration is saved per-study. Expand a rule to enable/disable or adjust severity.
          Changes document expert preferences — they do not re-run validation.
        </div>
      )}
    </div>
  );
}
