/**
 * TRUST-01p3: Custom Insight Engine Rule Builder
 * Form-based UI for authoring custom insight rules.
 * Custom rules are persisted via annotations and displayed alongside R01-R17.
 * Execution requires backend pipeline extensions (future work).
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { CollapsiblePane } from "./panes/CollapsiblePane";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { cn } from "@/lib/utils";
import type { CustomInsightRule } from "@/types/annotations";

// ── Condition type presets ────────────────────────────────────────────

const CONDITION_PRESETS = [
  { value: "treatment_related", label: "Treatment-related", humanTemplate: "treatment_related == true", templateHint: "{endpoint_label}: treatment-related in {sex}." },
  { value: "p_value_below", label: "P-value below threshold", humanTemplate: "p_value_adj < {value}", templateHint: "{endpoint_label}: significant pairwise (p < {value}) in {sex}." },
  { value: "trend_p_below", label: "Trend p below threshold", humanTemplate: "trend_p < {value}", templateHint: "{endpoint_label}: significant trend (p < {value})." },
  { value: "effect_size_above", label: "Effect size above threshold", humanTemplate: "|effect_size| >= {value}", templateHint: "{endpoint_label}: Cohen's d >= {value} in {sex}." },
  { value: "specific_domain", label: "Specific domain", humanTemplate: 'domain == "{value}"', templateHint: "{endpoint_label}: finding in {value} domain." },
  { value: "specific_pattern", label: "Dose-response pattern", humanTemplate: 'pattern == "{value}"', templateHint: "{endpoint_label}: {value} pattern in {sex}." },
  { value: "specific_organ", label: "Specific organ system", humanTemplate: 'organ_system == "{value}"', templateHint: "Finding in {value}: {endpoint_label}." },
  { value: "custom", label: "Custom condition", humanTemplate: "", templateHint: "" },
] as const;

const PATTERN_OPTIONS = ["monotonic_increase", "monotonic_decrease", "threshold", "non_monotonic"];
const DOMAIN_OPTIONS = ["LB", "BW", "MI", "MA", "CL", "OM", "FW", "DS"];

// ── Props ─────────────────────────────────────────────────────────────

interface Props {
  studyId: string;
  expandAll?: number;
  collapseAll?: number;
}

// ── Component ─────────────────────────────────────────────────────────

export function CustomInsightRuleBuilder({ studyId, expandAll, collapseAll }: Props) {
  const { data: annotations } = useAnnotations<CustomInsightRule>(studyId, "custom-insight-rules");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<CustomInsightRule>(studyId, "custom-insight-rules");

  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(() => reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reset]);

  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"endpoint" | "organ" | "study">("endpoint");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("info");
  const [conditionType, setConditionType] = useState("treatment_related");
  const [conditionValue, setConditionValue] = useState("");
  const [conditionHuman, setConditionHuman] = useState("treatment_related == true");
  const [template, setTemplate] = useState("{endpoint_label}: treatment-related in {sex}.");

  // Sorted custom rules
  const customRules = useMemo(() => {
    if (!annotations) return [];
    return Object.entries(annotations).sort(([a], [b]) => a.localeCompare(b));
  }, [annotations]);

  // Next ID
  const nextId = useMemo(() => {
    const existing = customRules.map(([k]) => k);
    let n = 1;
    while (existing.includes(`C${String(n).padStart(2, "0")}`)) n++;
    return `C${String(n).padStart(2, "0")}`;
  }, [customRules]);

  // Update condition human-readable text and template hint when preset changes
  const handleConditionTypeChange = useCallback((type: string) => {
    setConditionType(type);
    const preset = CONDITION_PRESETS.find((p) => p.value === type);
    if (preset && preset.value !== "custom") {
      setConditionHuman(preset.humanTemplate);
      setTemplate(preset.templateHint);
    }
  }, []);

  // Update human-readable text when condition value changes
  const handleConditionValueChange = useCallback((val: string) => {
    setConditionValue(val);
    const preset = CONDITION_PRESETS.find((p) => p.value === conditionType);
    if (preset && preset.value !== "custom") {
      setConditionHuman(preset.humanTemplate.replace("{value}", val));
      setTemplate(preset.templateHint.replace("{value}", val));
    }
  }, [conditionType]);

  const resetForm = () => {
    setName("");
    setScope("endpoint");
    setSeverity("info");
    setConditionType("treatment_related");
    setConditionValue("");
    setConditionHuman("treatment_related == true");
    setTemplate("{endpoint_label}: treatment-related in {sex}.");
    setEditingKey(null);
    setShowForm(false);
  };

  const handleSave = () => {
    const key = editingKey ?? nextId;
    save({
      entityKey: key,
      data: {
        name,
        scope,
        severity,
        conditionType,
        conditionValue,
        conditionHuman,
        template,
        enabled: true,
      },
    });
    resetForm();
  };

  const handleEdit = (key: string, rule: CustomInsightRule) => {
    setEditingKey(key);
    setName(rule.name);
    setScope(rule.scope);
    setSeverity(rule.severity);
    setConditionType(rule.conditionType);
    setConditionValue(rule.conditionValue);
    setConditionHuman(rule.conditionHuman);
    setTemplate(rule.template);
    setShowForm(true);
  };

  const handleToggleEnabled = (key: string, rule: CustomInsightRule) => {
    save({
      entityKey: key,
      data: { ...rule, enabled: !rule.enabled },
    });
  };

  const canSave = name.trim().length > 0 && conditionHuman.trim().length > 0;

  return (
    <CollapsiblePane
      title="Custom insight rules"
      defaultOpen={false}
      expandAll={expandAll}
      collapseAll={collapseAll}
      headerRight={
        customRules.length > 0
          ? <span className="text-[9px] font-mono text-muted-foreground">{customRules.length} defined</span>
          : undefined
      }
    >
      <div className="space-y-2 text-[11px]">
        {/* Existing custom rules */}
        {customRules.length > 0 && (
          <div className="rounded border">
            {customRules.map(([key, rule]) => (
              <CustomRuleRow
                key={key}
                ruleId={key}
                rule={rule}
                onEdit={() => handleEdit(key, rule)}
                onToggleEnabled={() => handleToggleEnabled(key, rule)}
              />
            ))}
          </div>
        )}

        {/* Add button */}
        {!showForm && (
          <button
            className="rounded border border-dashed border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground hover:border-border hover:bg-muted/30"
            onClick={() => { resetForm(); setShowForm(true); }}
          >
            + Add custom rule
          </button>
        )}

        {/* Form */}
        {showForm && (
          <div className="space-y-2 rounded border border-primary/20 bg-muted/10 p-3">
            <div className="text-[10px] font-medium">
              {editingKey ? `Edit rule ${editingKey}` : `New rule ${nextId}`}
            </div>

            {/* Name */}
            <div className="flex items-center gap-2">
              <label className="w-16 text-[10px] text-muted-foreground">Name</label>
              <input
                type="text"
                className="flex-1 rounded border bg-background px-2 py-1 text-[10px]"
                placeholder="e.g., High-dose kidney effect"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Scope + Severity */}
            <div className="flex gap-3">
              <div className="flex items-center gap-2">
                <label className="w-16 text-[10px] text-muted-foreground">Scope</label>
                <select
                  className="rounded border bg-background px-1.5 py-1 text-[10px]"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as typeof scope)}
                >
                  <option value="endpoint">Endpoint</option>
                  <option value="organ">Organ</option>
                  <option value="study">Study</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted-foreground">Severity</label>
                <select
                  className="rounded border bg-background px-1.5 py-1 text-[10px]"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as typeof severity)}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            {/* Condition type */}
            <div className="flex items-center gap-2">
              <label className="w-16 text-[10px] text-muted-foreground">Condition</label>
              <select
                className="flex-1 rounded border bg-background px-1.5 py-1 text-[10px]"
                value={conditionType}
                onChange={(e) => handleConditionTypeChange(e.target.value)}
              >
                {CONDITION_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Condition value (for parameterized conditions) */}
            {conditionType !== "treatment_related" && conditionType !== "custom" && (
              <div className="flex items-center gap-2">
                <label className="w-16 text-[10px] text-muted-foreground">Value</label>
                {conditionType === "specific_pattern" ? (
                  <select
                    className="flex-1 rounded border bg-background px-1.5 py-1 text-[10px]"
                    value={conditionValue}
                    onChange={(e) => handleConditionValueChange(e.target.value)}
                  >
                    <option value="">Select pattern...</option>
                    {PATTERN_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                ) : conditionType === "specific_domain" ? (
                  <select
                    className="flex-1 rounded border bg-background px-1.5 py-1 text-[10px]"
                    value={conditionValue}
                    onChange={(e) => handleConditionValueChange(e.target.value)}
                  >
                    <option value="">Select domain...</option>
                    {DOMAIN_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="flex-1 rounded border bg-background px-2 py-1 text-[10px] font-mono"
                    placeholder={conditionType.includes("p_") ? "0.05" : conditionType.includes("effect") ? "1.0" : "value"}
                    value={conditionValue}
                    onChange={(e) => handleConditionValueChange(e.target.value)}
                  />
                )}
              </div>
            )}

            {/* Condition preview */}
            <div className="flex items-center gap-2">
              <label className="w-16 text-[10px] text-muted-foreground">Expression</label>
              {conditionType === "custom" ? (
                <input
                  type="text"
                  className="flex-1 rounded border bg-background px-2 py-1 font-mono text-[10px]"
                  placeholder='e.g., organ_system == "renal" AND p_value < 0.01'
                  value={conditionHuman}
                  onChange={(e) => setConditionHuman(e.target.value)}
                />
              ) : (
                <span className="flex-1 font-mono text-[10px] text-muted-foreground">
                  {conditionHuman}
                </span>
              )}
            </div>

            {/* Template */}
            <div className="flex items-start gap-2">
              <label className="w-16 pt-1 text-[10px] text-muted-foreground">Template</label>
              <input
                type="text"
                className="flex-1 rounded border bg-background px-2 py-1 text-[10px]"
                placeholder="Output text with {placeholders}"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
            </div>
            <div className="pl-[72px] text-[9px] text-muted-foreground/60">
              Placeholders: {"{endpoint_label}"}, {"{sex}"}, {"{domain}"}, {"{organ_system}"}, {"{p_value}"}, {"{effect_size}"}, {"{pattern}"}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 border-t pt-2">
              <button
                className="rounded bg-primary px-3 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={handleSave}
                disabled={!canSave || isPending}
              >
                {isPending ? "Saving..." : editingKey ? "Update" : "Add rule"}
              </button>
              <button
                className="rounded border px-3 py-1 text-[10px] text-muted-foreground hover:bg-muted/50"
                onClick={resetForm}
              >
                Cancel
              </button>
              {isSuccess && (
                <span className="text-[10px] text-green-600">Saved</span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-[9px] text-muted-foreground/60">
          Custom rules document expert-defined criteria. Execution requires backend pipeline
          extensions and will be available in a future update.
        </p>
      </div>
    </CollapsiblePane>
  );
}

// ── Custom rule row ───────────────────────────────────────────────────

function CustomRuleRow({
  ruleId,
  rule,
  onEdit,
  onToggleEnabled,
}: {
  ruleId: string;
  rule: CustomInsightRule;
  onEdit: () => void;
  onToggleEnabled: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("border-b last:border-b-0", !rule.enabled && "opacity-40")}>
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-muted-foreground">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-primary/70">{ruleId}</span>
        <span className={cn("min-w-0 flex-1 truncate text-[11px] font-medium", !rule.enabled && "line-through")}>
          {rule.name}
        </span>
        <span className="shrink-0 rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600">
          {rule.scope}
        </span>
        <span className="shrink-0 rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600">
          {rule.severity}
        </span>
        <span className="shrink-0 rounded-sm border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[9px] text-primary/70">
          custom
        </span>
      </button>

      {expanded && (
        <div className="space-y-1 border-t bg-muted/10 px-4 py-2 text-[10px]">
          <div>
            <span className="font-medium text-muted-foreground">Condition: </span>
            <span className="font-mono">{rule.conditionHuman}</span>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Template: </span>
            <span className="italic">&ldquo;{rule.template}&rdquo;</span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              className="text-[10px] text-primary hover:underline"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              Edit
            </button>
            <button
              className="text-[10px] text-muted-foreground hover:underline"
              onClick={(e) => { e.stopPropagation(); onToggleEnabled(); }}
            >
              {rule.enabled ? "Disable" : "Enable"}
            </button>
            <span className="ml-auto text-[9px] text-muted-foreground">
              {rule.createdBy} &middot; {new Date(rule.createdDate).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
