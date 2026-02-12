/**
 * TRUST-05p3: Custom Validation Rule Builder
 * Form-based UI for authoring custom validation rules.
 * Custom rules are persisted via annotations and displayed alongside SD-001 to SD-007.
 * Execution requires backend validation engine extensions (future work).
 */
import { useState, useEffect, useMemo } from "react";
import { CollapsiblePane } from "./panes/CollapsiblePane";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { cn } from "@/lib/utils";
import type { CustomValidationRule } from "@/types/annotations";

// ── Constants ─────────────────────────────────────────────────────────

const ALL_DOMAINS = ["DM", "TX", "TA", "TS", "EX", "LB", "BW", "MI", "MA", "CL", "OM", "FW", "DS", "SE"];
const CATEGORIES = ["Study design", "Domain conformance", "Data quality", "Cross-domain consistency"];
const SEVERITY_OPTIONS = ["Error", "Warning", "Info"] as const;

// ── Props ─────────────────────────────────────────────────────────────

interface Props {
  studyId: string;
  expandAll?: number;
  collapseAll?: number;
}

// ── Component ─────────────────────────────────────────────────────────

export function CustomValidationRuleBuilder({ studyId, expandAll, collapseAll }: Props) {
  const { data: annotations } = useAnnotations<CustomValidationRule>(studyId, "custom-validation-rules");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<CustomValidationRule>(studyId, "custom-validation-rules");

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
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"Error" | "Warning" | "Info">("Warning");
  const [category, setCategory] = useState("Study design");
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [fixGuidance, setFixGuidance] = useState("");

  // Sorted custom rules
  const customRules = useMemo(() => {
    if (!annotations) return [];
    return Object.entries(annotations).sort(([a], [b]) => a.localeCompare(b));
  }, [annotations]);

  // Next ID
  const nextId = useMemo(() => {
    const existing = customRules.map(([k]) => k);
    let n = 1;
    while (existing.includes(`CSD-${String(n).padStart(3, "0")}`)) n++;
    return `CSD-${String(n).padStart(3, "0")}`;
  }, [customRules]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setSeverity("Warning");
    setCategory("Study design");
    setSelectedDomains([]);
    setFixGuidance("");
    setEditingKey(null);
    setShowForm(false);
  };

  const handleSave = () => {
    const key = editingKey ?? nextId;
    save({
      entityKey: key,
      data: {
        name,
        description,
        severity,
        category,
        applicableDomains: selectedDomains,
        fixGuidance,
        enabled: true,
      },
    });
    resetForm();
  };

  const handleEdit = (key: string, rule: CustomValidationRule) => {
    setEditingKey(key);
    setName(rule.name);
    setDescription(rule.description);
    setSeverity(rule.severity);
    setCategory(rule.category);
    setSelectedDomains(rule.applicableDomains);
    setFixGuidance(rule.fixGuidance);
    setShowForm(true);
  };

  const handleToggleEnabled = (key: string, rule: CustomValidationRule) => {
    save({
      entityKey: key,
      data: { ...rule, enabled: !rule.enabled },
    });
  };

  const toggleDomain = (domain: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domain)
        ? prev.filter((d) => d !== domain)
        : [...prev, domain],
    );
  };

  const canSave = name.trim().length > 0 && description.trim().length > 0;

  return (
    <CollapsiblePane
      title="Custom validation rules"
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
              <CustomValidationRuleRow
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
            + Add custom validation rule
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
              <label className="w-20 text-[10px] text-muted-foreground">Name</label>
              <input
                type="text"
                className="flex-1 rounded border bg-background px-2 py-1 text-[10px]"
                placeholder="e.g., Missing dose units"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Severity + Category */}
            <div className="flex gap-3">
              <div className="flex items-center gap-2">
                <label className="w-20 text-[10px] text-muted-foreground">Severity</label>
                <select
                  className="rounded border bg-background px-1.5 py-1 text-[10px]"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as typeof severity)}
                >
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted-foreground">Category</label>
                <select
                  className="rounded border bg-background px-1.5 py-1 text-[10px]"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Applicable domains */}
            <div className="flex items-start gap-2">
              <label className="w-20 pt-0.5 text-[10px] text-muted-foreground">Domains</label>
              <div className="flex flex-wrap gap-1">
                {ALL_DOMAINS.map((d) => (
                  <button
                    key={d}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[9px] transition-colors",
                      selectedDomains.includes(d)
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/40 text-muted-foreground hover:border-border",
                    )}
                    onClick={() => toggleDomain(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="flex items-start gap-2">
              <label className="w-20 pt-1 text-[10px] text-muted-foreground">Description</label>
              <textarea
                className="flex-1 rounded border bg-background px-2 py-1 text-[10px]"
                rows={3}
                placeholder="What does this rule check? When does it fire?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Fix guidance */}
            <div className="flex items-start gap-2">
              <label className="w-20 pt-1 text-[10px] text-muted-foreground">Fix guidance</label>
              <textarea
                className="flex-1 rounded border bg-background px-2 py-1 text-[10px]"
                rows={2}
                placeholder="How should the user resolve this issue?"
                value={fixGuidance}
                onChange={(e) => setFixGuidance(e.target.value)}
              />
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
          Custom validation rules document organization-specific quality checks.
          Execution requires validation engine extensions and will be available in a future update.
        </p>
      </div>
    </CollapsiblePane>
  );
}

// ── Custom rule row ───────────────────────────────────────────────────

function CustomValidationRuleRow({
  ruleId,
  rule,
  onEdit,
  onToggleEnabled,
}: {
  ruleId: string;
  rule: CustomValidationRule;
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
        <span className={cn("font-mono text-[11px] font-semibold text-primary/70", !rule.enabled && "line-through")}>
          {ruleId}
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-[11px]", !rule.enabled && "line-through")}>
          {rule.name}
        </span>
        <span className="shrink-0 rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600">
          {rule.severity}
        </span>
        <span className="flex items-center gap-0.5">
          {rule.applicableDomains.slice(0, 3).map((d) => (
            <DomainLabel key={d} domain={d} />
          ))}
          {rule.applicableDomains.length > 3 && (
            <span className="text-[9px] text-muted-foreground">
              +{rule.applicableDomains.length - 3}
            </span>
          )}
        </span>
        <span className="shrink-0 rounded-sm border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[9px] text-primary/70">
          custom
        </span>
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t bg-muted/10 px-4 py-2 text-[10px]">
          <div>
            <span className="font-medium text-muted-foreground">Condition: </span>
            <span>{rule.description}</span>
          </div>
          {rule.fixGuidance && (
            <div>
              <span className="font-medium text-muted-foreground">Fix guidance: </span>
              <span>{rule.fixGuidance}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <div>
              <span className="text-muted-foreground">Category: </span>
              <span>{rule.category}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Domains: </span>
              <span className="font-mono">{rule.applicableDomains.join(", ")}</span>
            </div>
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
