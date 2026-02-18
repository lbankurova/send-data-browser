import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { ValidationIssueForm } from "./ValidationIssueForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { cn } from "@/lib/utils";
import {
  FIX_STATUS_STYLES,
  StatusBadge,
  mapApiRecord,
  extractRuleDetail,
} from "@/components/analysis/ValidationView";
import type { RuleDetail, AffectedRecord } from "@/components/analysis/ValidationView";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { useValidationResults } from "@/hooks/useValidationResults";
import { useValidationCatalog } from "@/hooks/useValidationCatalog";
import { useAffectedRecords } from "@/hooks/useAffectedRecords";
import type { ValidationRecordReview, ValidationRuleOverride } from "@/types/annotations";
import type { ValidationViewSelection, ValidationIssueViewSelection } from "@/contexts/ViewSelectionContext";
import { getValidationRuleDef, FIX_TIER_DEFINITIONS } from "@/lib/validation-rule-catalog";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  selection: ValidationViewSelection | null;
  studyId?: string;
  setSelection?: (sel: ValidationViewSelection | null) => void;
}

const SEVERITY_BORDER: Record<string, string> = {
  Error: "border-l-gray-400",
  Warning: "border-l-gray-400",
  Info: "border-l-gray-400",
};

// Count text — neutral font-mono per "quiet context panel" rule (§1.10)
const COUNT_TEXT = "text-foreground font-mono";

// ── Domain link helper ────────────────────────────────────────────────

const SEND_DOMAINS = new Set([
  "BG", "BW", "CL", "CO", "DD", "DM", "DS", "EG", "EX", "FW",
  "LB", "MA", "MI", "OM", "PC", "PM", "PP", "SC", "SE", "TA",
  "TE", "TF", "TS", "TX", "VS",
  "SUPPMA", "SUPPMI",
]);

/** Infer the SEND domain from a variable name (e.g., EXSTDTC → EX) */
function inferDomain(variable: string): string | null {
  const upper = variable.toUpperCase();
  // Check 6-char prefix first (SUPPMI, SUPPMA)
  if (upper.length > 4 && SEND_DOMAINS.has(upper.slice(0, 6))) return upper.slice(0, 6);
  // Standard 2-char prefix
  const prefix = upper.slice(0, 2);
  if (SEND_DOMAINS.has(prefix)) return prefix;
  return null;
}

function DomainLink({
  domain,
  label,
  studyId,
}: {
  domain: string;
  label: string;
  studyId: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      className="font-mono text-primary hover:underline"
      onClick={() =>
        navigate(
          `/studies/${encodeURIComponent(studyId)}/domains/${encodeURIComponent(domain)}`
        )
      }
      title={`View ${domain} domain`}
    >
      {label}
    </button>
  );
}

// ── Navigation bar ─────────────────────────────────────────────────────

function PaneNavBar({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1">
      <button
        className="rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        disabled={!canGoBack}
        onClick={onBack}
        title="Back"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        className="rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        disabled={!canGoForward}
        onClick={onForward}
        title="Forward"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Rule configuration pane (enable/disable toggle) ────────────────────

function RuleConfigPane({
  studyId,
  ruleId,
  expandGen,
  collapseGen,
}: {
  studyId: string;
  ruleId: string;
  expandGen: number;
  collapseGen: number;
}) {
  const queryClient = useQueryClient();
  const { data: overrideAnnotations } = useAnnotations<ValidationRuleOverride>(
    studyId,
    "validation-rule-config"
  );
  const { mutate: saveOverride, isPending } = useSaveAnnotation<ValidationRuleOverride>(
    studyId,
    "validation-rule-config"
  );

  const existing = overrideAnnotations?.[ruleId];
  const isEnabled = existing?.enabled !== false;

  const handleToggle = () => {
    saveOverride(
      {
        entityKey: ruleId,
        data: {
          enabled: !isEnabled,
          severityOverride: existing?.severityOverride ?? null,
          comment: existing?.comment ?? "",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["validation-catalog", studyId] });
        },
      }
    );
  };

  return (
    <CollapsiblePane
      title="Rule configuration"
      defaultOpen={false}
      expandAll={expandGen}
      collapseAll={collapseGen}
    >
      <div className="flex items-center gap-3 text-[11px]">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Rule status</span>
          <button
            className={cn(
              "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
              isEnabled ? "bg-primary border-primary" : "bg-gray-300 border-gray-300",
              isPending && "opacity-50",
            )}
            onClick={handleToggle}
            disabled={isPending}
            role="switch"
            aria-checked={isEnabled}
          >
            <span
              className={cn(
                "pointer-events-none block h-3 w-3 rounded-full bg-white shadow transition-transform",
                isEnabled ? "translate-x-3.5" : "translate-x-0.5"
              )}
            />
          </button>
          <span className="font-medium">
            {isEnabled ? "Enabled" : "Disabled"}
          </span>
        </label>
      </div>
      {!isEnabled && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Disabled rules are skipped during validation runs.
        </p>
      )}
    </CollapsiblePane>
  );
}

// ── Mode 1: Rule Review Summary ────────────────────────────────────────

function RuleReviewSummary({
  selection,
  detail,
  studyId,
  setSelection,
}: {
  selection: ValidationViewSelection;
  detail: RuleDetail | null;
  studyId?: string;
  setSelection?: (sel: ValidationViewSelection | null) => void;
}) {
  const { data: affectedData } = useAffectedRecords(studyId, selection.rule_id);
  const records = useMemo(() => (affectedData?.records ?? []).map(mapApiRecord), [affectedData]);
  const { data: recordAnnotations } = useAnnotations<ValidationRecordReview>(
    studyId,
    "validation-records"
  );

  // Review progress counts
  const { reviewCounts, fixCounts } = useMemo(() => {
    const rc: Record<string, number> = {
      "Not reviewed": 0,
      "Reviewed": 0,
      "Approved": 0,
    };
    const fc: Record<string, number> = {
      "Not fixed": 0,
      "Auto-fixed": 0,
      "Manually fixed": 0,
      "Accepted as-is": 0,
      "Flagged": 0,
    };
    for (const rec of records) {
      const ann = recordAnnotations?.[rec.issue_id];
      const rs = ann?.reviewStatus ?? "Not reviewed";
      const fs = ann?.fixStatus ?? (rec.autoFixed ? "Auto-fixed" : "Not fixed");
      rc[rs] = (rc[rs] ?? 0) + 1;
      fc[fs] = (fc[fs] ?? 0) + 1;
    }
    return { reviewCounts: rc, fixCounts: fc };
  }, [records, recordAnnotations]);

  const reviewedCount = records.length - reviewCounts["Not reviewed"];
  const progressPct = records.length > 0 ? (reviewedCount / records.length) * 100 : 0;
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{selection.rule_id}</span>
          <span
            className="text-[10px] font-semibold"
            style={{ color: selection.severity === "Error" ? "#dc2626" : selection.severity === "Warning" ? "#d97706" : "#16a34a" }}
          >
            {selection.severity}
          </span>
          <span className="ml-auto">
            <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {selection.domain} &middot; {selection.category}
        </p>
      </div>

      {/* Rule detail */}
      <CollapsiblePane title="Rule detail" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {detail ? (
          <div className="space-y-2 text-[11px]">
            <div>
              <span className="font-medium text-muted-foreground">Standard: </span>
              <span>{detail.standard}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Section: </span>
              <span>{detail.section}</span>
            </div>
            <div className={cn("border-l-2 pl-2", SEVERITY_BORDER[selection.severity])}>
              {selection.description}
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Rationale: </span>
              <span>{detail.rationale}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">How to fix: </span>
              <span>{detail.howToFix}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No detail available for this rule.</p>
        )}
      </CollapsiblePane>

      {/* Rule metadata — static catalog for SD-* rules, API data for others */}
      {(() => {
        const catalogRule = getValidationRuleDef(selection.rule_id);
        if (catalogRule) {
          // Rich metadata from static catalog (SD-* custom rules)
          const tierDef = FIX_TIER_DEFINITIONS.find((t) => t.tier === catalogRule.default_fix_tier);
          return (
            <CollapsiblePane title="Rule metadata" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
              <div className="space-y-2 text-[11px]">
                <div>
                  <span className="font-medium text-muted-foreground">Applicable domains: </span>
                  <span className="inline-flex gap-1">
                    {catalogRule.applicable_domains.map((d) => (
                      <DomainLabel key={d} domain={d} />
                    ))}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Evidence type: </span>
                  <span className="font-mono text-[10px]">{catalogRule.evidence_type}</span>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Default fix tier: </span>
                  <span className="font-mono text-[10px]">{catalogRule.default_fix_tier}</span>
                  {tierDef && (
                    <span className="ml-1 text-muted-foreground">({tierDef.name})</span>
                  )}
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Auto-fixable: </span>
                  <span>{catalogRule.auto_fixable ? "Yes" : "No"}</span>
                </div>
                {catalogRule.cdisc_reference && (
                  <div>
                    <span className="font-medium text-muted-foreground">CDISC reference: </span>
                    <span>{catalogRule.cdisc_reference}</span>
                  </div>
                )}
              </div>
            </CollapsiblePane>
          );
        }
        // For CORE / FDA-* rules: show source, domain, and CDISC reference from API detail
        const source = ("source" in selection ? selection.source : undefined) ?? (selection.rule_id.startsWith("CORE-") ? "core" : "custom");
        return (
          <CollapsiblePane title="Rule metadata" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
            <div className="space-y-2 text-[11px]">
              <div>
                <span className="font-medium text-muted-foreground">Source: </span>
                <span>{source === "core" ? "CDISC CORE" : "Custom"}</span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Applicable domains: </span>
                <span className="inline-flex gap-1">
                  {selection.domain.split(",").map((d) => d.trim()).filter(Boolean).map((d) => (
                    <DomainLabel key={d} domain={d} />
                  ))}
                </span>
              </div>
              {detail?.standard && (
                <div>
                  <span className="font-medium text-muted-foreground">Standard: </span>
                  <span>{detail.standard}</span>
                </div>
              )}
              {detail?.howToFix && detail.howToFix !== "See CDISC rules catalog for detailed guidance" && (
                <div>
                  <span className="font-medium text-muted-foreground">How to fix: </span>
                  <span>{detail.howToFix}</span>
                </div>
              )}
            </div>
          </CollapsiblePane>
        );
      })()}

      {/* Rule configuration — enable/disable toggle */}
      {studyId && (
        <RuleConfigPane
          studyId={studyId}
          ruleId={selection.rule_id}
          expandGen={expandGen}
          collapseGen={collapseGen}
        />
      )}

      {/* Review progress */}
      <CollapsiblePane title="Review progress" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-2.5 text-[11px]">
          {/* Progress bar */}
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{reviewedCount} of {records.length} reviewed</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  progressPct >= 70 ? "bg-green-500" : progressPct >= 30 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          {/* Review status counts */}
          <div className="text-[10px] text-muted-foreground">
            {Object.entries(reviewCounts).map(([status, count], i) => (
              <span key={status}>
                {i > 0 && <span className="mx-1">&middot;</span>}
                {status}{" "}
                <button
                  className={cn("font-medium hover:underline", COUNT_TEXT)}
                  onClick={() => setSelection?.({
                    ...selection,
                    recordReviewStatusFilter: status,
                  })}
                  title={`Filter records by "${status}"`}
                >
                  {count}
                </button>
              </span>
            ))}
          </div>
          {/* Fix status counts */}
          <div className="text-[10px] text-muted-foreground">
            {Object.entries(fixCounts).map(([status, count], i) => (
              <span key={status}>
                {i > 0 && <span className="mx-1">&middot;</span>}
                {status}{" "}
                <button
                  className={cn("font-medium hover:underline", COUNT_TEXT)}
                  onClick={() => setSelection?.({
                    ...selection,
                    recordFixStatusFilter: status,
                  })}
                  title={`Filter records by "${status}"`}
                >
                  {count}
                </button>
              </span>
            ))}
          </div>
        </div>
      </CollapsiblePane>

      {/* Rule disposition */}
      {studyId && (
        <ValidationIssueForm studyId={studyId} ruleId={selection.rule_id} />
      )}
    </div>
  );
}

// ── Fix Script Dialog (Modal) ──────────────────────────────────────────

function FixScriptDialog({
  record,
  ruleId,
  studyId,
  onClose,
  onRun,
  recordAnnotations,
}: {
  record: AffectedRecord;
  ruleId: string;
  studyId: string;
  onClose: () => void;
  onRun: (scriptKey: string, scope: "single" | "all") => void;
  recordAnnotations?: Record<string, ValidationRecordReview> | null;
}) {
  // Get scripts from validation results (React Query serves from cache)
  const { data: validationData } = useValidationResults(studyId);
  const { data: affectedData } = useAffectedRecords(studyId, ruleId);

  const scripts = validationData?.scripts ?? [];
  const allRecords = useMemo(() => (affectedData?.records ?? []).map(mapApiRecord), [affectedData]);

  // Find applicable scripts
  const applicableScripts = useMemo(() => {
    return scripts.filter(s => s.applicable_rules.includes(ruleId));
  }, [scripts, ruleId]);

  const [selectedScript, setSelectedScript] = useState<string>(
    record.scriptKey ?? applicableScripts[0]?.key ?? ""
  );
  const [scope, setScope] = useState<"single" | "all">("all");
  const [preview, setPreview] = useState<{ subject: string; field: string; from_val: string; to_val: string }[]>([]);

  const script = applicableScripts.find(s => s.key === selectedScript);

  // Fetch preview when script changes
  useEffect(() => {
    if (!selectedScript || !studyId) {
      setPreview([]);
      return;
    }
    fetch(`/api/studies/${encodeURIComponent(studyId)}/validation/scripts/${encodeURIComponent(selectedScript)}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, rule_id: ruleId }),
    })
      .then(r => r.ok ? r.json() : { preview: [] })
      .then(data => setPreview(data.preview ?? []))
      .catch(() => setPreview([]));
  }, [selectedScript, studyId, scope, ruleId]);

  // Count only unfixed records (skip Manually fixed, Accepted as-is)
  const unfixedRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      const ann = recordAnnotations?.[rec.issue_id];
      const status = ann?.fixStatus ?? (rec.autoFixed ? "Auto-fixed" : "Not fixed");
      return status === "Not fixed" || status === "Flagged";
    });
  }, [allRecords, recordAnnotations]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[500px] rounded-lg border bg-background shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3">
          <h3 className="text-sm font-semibold">Run Fix Script</h3>
          <button
            className="rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {/* Script selector */}
          {applicableScripts.length > 0 ? (
            <div>
              <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">Script</label>
              <select
                className="w-full rounded border bg-background px-2 py-1.5 text-[11px]"
                value={selectedScript}
                onChange={(e) => setSelectedScript(e.target.value)}
              >
                {applicableScripts.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">No fix scripts available for this rule.</p>
          )}

          {/* Description */}
          {script && (
            <p className="text-[11px] text-muted-foreground">{script.description}</p>
          )}

          {/* Scope */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Scope</label>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-[11px]">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "single"}
                  onChange={() => setScope("single")}
                  className="h-3 w-3"
                />
                This record only ({record.subject_id})
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                  className="h-3 w-3"
                  disabled={unfixedRecords.length === 0}
                />
                {unfixedRecords.length === allRecords.length
                  ? `All ${allRecords.length} records for ${ruleId}`
                  : `${unfixedRecords.length} unfixed records for ${ruleId} (${allRecords.length - unfixedRecords.length} already fixed)`}
              </label>
            </div>
          </div>

          {/* Preview table */}
          {preview.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Preview</label>
              <div className="max-h-40 overflow-auto rounded border">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground">Subject</th>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground">Field</th>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground">From</th>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-2 py-1 font-mono">{row.subject}</td>
                        <td className="px-2 py-1 font-mono">{row.field}</td>
                        <td className="px-2 py-1 text-red-600">{row.from_val}</td>
                        <td className="px-2 py-1 text-green-700">{row.to_val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            className="rounded border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted/50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!selectedScript || applicableScripts.length === 0}
            onClick={() => onRun(selectedScript, scope)}
          >
            RUN
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Diff Utilities ──────────────────────────────────────────────────────

type DiffSegment = { text: string; type: "same" | "insert" | "delete" };
type DiffMode = "char" | "replacement" | "missing";

/** Levenshtein edit distance ratio (0 = identical, 1 = completely different) */
function editDistanceRatio(a: string, b: string): number {
  if (a === b) return 0;
  if (!a || !b) return 1;
  const maxLen = Math.max(a.length, b.length);
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n] / maxLen;
}

/** LCS-based character diff → array of same/insert/delete segments */
function computeCharDiff(original: string, corrected: string): DiffSegment[] {
  const m = original.length, n = corrected.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = original[i - 1] === corrected[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack
  const raw: { char: string; type: "same" | "insert" | "delete" }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && original[i - 1] === corrected[j - 1]) {
      raw.unshift({ char: original[i - 1], type: "same" });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ char: corrected[j - 1], type: "insert" });
      j--;
    } else {
      raw.unshift({ char: original[i - 1], type: "delete" });
      i--;
    }
  }
  // Collapse consecutive same-type segments
  const segments: DiffSegment[] = [];
  for (const item of raw) {
    const last = segments[segments.length - 1];
    if (last && last.type === item.type) {
      last.text += item.char;
    } else {
      segments.push({ text: item.char, type: item.type });
    }
  }
  return segments;
}

/** Pick rendering mode based on edit distance */
function getDiffMode(actual: string, expected: string): DiffMode {
  if (!actual || actual === "(missing)") return "missing";
  const ratio = editDistanceRatio(actual, expected);
  return ratio <= 0.3 ? "char" : "replacement";
}

// ── Inline Diff Rendering ───────────────────────────────────────────────

function InlineDiff({ actual, expected }: { actual: string; expected: string }) {
  const mode = getDiffMode(actual, expected);

  if (mode === "missing") {
    return (
      <div className="font-mono text-[11px]">
        <span className="text-muted-foreground">{actual || "(empty)"}</span>
        {expected && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            — expected: {expected}
          </span>
        )}
      </div>
    );
  }

  if (mode === "replacement") {
    return (
      <div className="space-y-0.5 font-mono text-[11px]">
        <div>
          <span className="mr-1.5 text-[10px] text-muted-foreground">From:</span>
          <span className="text-muted-foreground/70">{actual}</span>
        </div>
        <div>
          <span className="mr-1.5 text-[10px] text-muted-foreground">
            &nbsp;&nbsp;To:
          </span>
          <span>{expected}</span>
        </div>
      </div>
    );
  }

  // Character-level diff
  const segments = computeCharDiff(actual, expected);
  return (
    <div className="font-mono text-[11px]">
      {segments.map((seg, idx) => {
        if (seg.type === "same") return <span key={idx}>{seg.text}</span>;
        if (seg.type === "insert")
          return (
            <span key={idx} className="rounded-[1px] bg-green-200">
              {seg.text}
            </span>
          );
        if (seg.type === "delete")
          return (
            <span key={idx} className="rounded-[1px] bg-red-200 line-through">
              {seg.text}
            </span>
          );
        return null;
      })}
    </div>
  );
}

// ── Evidence Renderers (category-specific) ──────────────────────────────

function ValueCorrectionEvidence({ from, to }: { from: string; to: string }) {
  return <InlineDiff actual={from} expected={to} />;
}

function ValueCorrectionMultiEvidence({
  from,
  candidates,
  selectedCandidate,
  onSelect,
}: {
  from: string;
  candidates: string[];
  selectedCandidate: string;
  onSelect: (s: string) => void;
}) {
  return (
    <>
      <div className="text-[10px] text-muted-foreground">
        {candidates.length} possible matches found.
      </div>
      <div className="font-mono text-[11px] text-muted-foreground/70">
        Current: {from}
      </div>
      <div className="space-y-1">
        {candidates.map((s) => (
          <label key={s} className="flex items-center gap-2 text-[10px]">
            <input
              type="radio"
              name="candidate"
              checked={selectedCandidate === s}
              onChange={() => onSelect(s)}
              className="h-3 w-3"
            />
            <span className="font-mono">{s}</span>
          </label>
        ))}
      </div>
    </>
  );
}

function CodeMappingEvidence({ value, code }: { value: string; code: string }) {
  return (
    <div className="font-mono text-[11px]">
      {value} <span className="text-muted-foreground">&rarr;</span> {code}
    </div>
  );
}

function RangeCheckEvidence({ lines }: { lines: { label: string; value: string }[] }) {
  return (
    <div className="space-y-0.5 text-[11px]">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-muted-foreground">{line.label}:</span>
          <span className="font-mono">{line.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Render text with SEND variable names linkified to their domain tables */
function LinkifiedText({
  text,
  studyId,
  className,
}: {
  text: string;
  studyId?: string;
  className?: string;
}) {
  if (!studyId) return <span className={className}>{text}</span>;

  // Match uppercase SEND variable names (2-char domain prefix + 3+ more uppercase chars/digits)
  const parts = text.split(/\b([A-Z]{2}[A-Z0-9]{2,})\b/);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const domain = inferDomain(part);
          if (domain) {
            return (
              <DomainLink key={i} domain={domain} label={part} studyId={studyId} />
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/** Render text with "DOMAIN.VAR" patterns (e.g. "SUPPMI.QNAM") linkified */
function LinkifiedDomainRef({
  text,
  studyId,
  className,
}: {
  text: string;
  studyId?: string;
  className?: string;
}) {
  if (!studyId) return <span className={className}>{text}</span>;

  // Match DOMAIN.VARIABLE patterns (e.g., SUPPMI.QNAM, MI.MISEV)
  const parts = text.split(/\b((?:SUPP)?[A-Z]{2,4}\.[A-Z][A-Z0-9]*)\b/);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const dotIdx = part.indexOf(".");
          const domain = part.slice(0, dotIdx);
          if (SEND_DOMAINS.has(domain)) {
            return (
              <DomainLink key={i} domain={domain} label={part} studyId={studyId} />
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function MissingValueEvidence({
  variable,
  derivation,
  suggested,
  studyId,
}: {
  variable: string;
  derivation?: string;
  suggested?: string;
  studyId?: string;
}) {
  if (suggested) {
    const source = derivation
      ? ` (${derivation.replace(/^Derivable from\s+/i, "from ")})`
      : "";
    return (
      <div className="text-[11px]">
        <span className="text-muted-foreground">Suggested: </span>
        <span className="font-mono">{suggested}</span>
        {source && (
          <LinkifiedText
            text={source}
            studyId={studyId}
            className="text-muted-foreground"
          />
        )}
      </div>
    );
  }
  return (
    <div className="font-mono text-[11px] text-muted-foreground/70">{variable}: (empty)</div>
  );
}

function MetadataEvidence({
  lines,
  studyId,
}: {
  lines: { label: string; value: string }[];
  studyId?: string;
}) {
  return (
    <div className="space-y-0.5 text-[11px]">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-muted-foreground">{line.label}:</span>
          <LinkifiedDomainRef
            text={line.value}
            studyId={studyId}
            className={i === 0 ? "font-mono text-muted-foreground/70" : "font-mono"}
          />
        </div>
      ))}
    </div>
  );
}

// ── Finding Section (category-based evidence + buttons) ─────────────────

function FindingSection({
  record,
  selection,
  studyId,
}: {
  record: AffectedRecord;
  selection: ValidationIssueViewSelection;
  studyId: string;
}) {
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<string>(
    record.evidence?.type === "value-correction-multi"
      ? record.evidence.candidates[0]
      : record.suggestions?.[0] ?? ""
  );
  const [showScriptDialog, setShowScriptDialog] = useState(false);
  const [showAcceptView, setShowAcceptView] = useState(false);
  const [showEnterValue, setShowEnterValue] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [fixDropdownOpen, setFixDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: recordAnnotations } = useAnnotations<ValidationRecordReview>(
    studyId,
    "validation-records"
  );
  const { mutate: save } = useSaveAnnotation<ValidationRecordReview>(
    studyId,
    "validation-records"
  );
  const { data: validationData } = useValidationResults(studyId);
  const { data: affectedData } = useAffectedRecords(studyId, record.rule_id);
  const allRecordsForRule = useMemo(() => (affectedData?.records ?? []).map(mapApiRecord), [affectedData]);

  const currentFixStatus =
    recordAnnotations?.[record.issue_id]?.fixStatus ??
    (record.autoFixed ? "Auto-fixed" : "Not fixed");

  // Reset state when record changes
  useEffect(() => {
    setFixResult(null);
    setJustification("");
    setSelectedCandidate(
      record.evidence?.type === "value-correction-multi"
        ? record.evidence.candidates[0]
        : record.suggestions?.[0] ?? ""
    );
    setShowScriptDialog(false);
    setShowAcceptView(false);
    setShowEnterValue(false);
    setManualValue("");
    setFixDropdownOpen(false);
  }, [record.issue_id, record.suggestions, record.evidence]);

  // Close Fix ▾ dropdown on outside click
  useEffect(() => {
    if (!fixDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFixDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fixDropdownOpen]);

  const diagnosis = record.diagnosis;
  const evidence = record.evidence;

  // Status badge
  const statusBadge = (
    <div className="flex items-center gap-1.5">
      <StatusBadge status={currentFixStatus} styles={FIX_STATUS_STYLES} />
      {currentFixStatus === "Auto-fixed" && (
        <span className="text-[10px] text-muted-foreground">on import</span>
      )}
    </div>
  );

  // ── Fix result feedback ──
  if (fixResult) {
    return (
      <CollapsiblePane title="Finding" defaultOpen>
        <div className="space-y-2 text-[11px]">
          {statusBadge}
          <p className="text-muted-foreground">{diagnosis}</p>
          <div className="rounded bg-green-50 p-2 font-medium text-green-800">
            {fixResult}
          </div>
        </div>
      </CollapsiblePane>
    );
  }

  // ── Accept-as-is sub-view ──
  if (showAcceptView) {
    return (
      <CollapsiblePane title="Finding" defaultOpen>
        <div className="space-y-2 text-[11px]">
          {statusBadge}
          <p className="text-muted-foreground">{diagnosis}</p>
          <div>
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Justification</label>
            <input
              className="w-full rounded border bg-background px-2 py-1 text-[11px]"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Reason for accepting..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={!justification}
              onClick={() => {
                save({
                  entityKey: record.issue_id,
                  data: {
                    fixStatus: "Accepted as-is",
                    justification,
                    comment: `Accepted as-is: ${justification}`,
                  },
                });
                setFixResult("Accepted as-is — justification recorded.");
              }}
            >
              Accept
            </button>
            <button
              className="rounded border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50"
              onClick={() => setShowAcceptView(false)}
            >
              Back
            </button>
          </div>
        </div>
      </CollapsiblePane>
    );
  }

  // ── Render evidence by type ──
  const renderEvidence = () => {
    if (!evidence) return null;
    switch (evidence.type) {
      case "value-correction":
        return <ValueCorrectionEvidence from={evidence.from} to={evidence.to} />;
      case "value-correction-multi":
        return (
          <ValueCorrectionMultiEvidence
            from={evidence.from}
            candidates={evidence.candidates}
            selectedCandidate={selectedCandidate}
            onSelect={setSelectedCandidate}
          />
        );
      case "code-mapping":
        return <CodeMappingEvidence value={evidence.value} code={evidence.code} />;
      case "range-check":
        return <RangeCheckEvidence lines={evidence.lines} />;
      case "missing-value":
        return (
          <MissingValueEvidence
            variable={evidence.variable}
            derivation={evidence.derivation}
            suggested={evidence.suggested}
            studyId={studyId}
          />
        );
      case "metadata":
        return <MetadataEvidence lines={evidence.lines} studyId={studyId} />;
      case "cross-domain":
        return <MetadataEvidence lines={evidence.lines} studyId={studyId} />;
    }
  };

  // ── Apply suggestion helper ──
  const applySuggestion = () => {
    let chosen: string;
    if (evidence?.type === "value-correction") {
      chosen = evidence.to;
    } else if (evidence?.type === "code-mapping") {
      chosen = evidence.code;
    } else if (evidence?.type === "missing-value" && evidence.suggested) {
      chosen = evidence.suggested;
    } else if (record.suggestions?.length === 1) {
      chosen = record.suggestions[0];
    } else {
      chosen = "";
    }
    save({
      entityKey: record.issue_id,
      data: {
        fixStatus: "Manually fixed",
        comment: `Fix applied: ${selection.variable} → '${chosen}'`,
      },
    });
    setFixResult(`Fix applied — ${selection.variable} set to '${chosen}'.`);
  };

  // ── Apply selected candidate helper ──
  const applySelected = () => {
    save({
      entityKey: record.issue_id,
      data: {
        fixStatus: "Manually fixed",
        comment: `Fix applied: ${selection.variable} → '${selectedCandidate}'`,
      },
    });
    setFixResult(`Fix applied — ${selection.variable} set to '${selectedCandidate}'.`);
  };

  // ── Apply manual value helper ──
  const applyManualValue = () => {
    save({
      entityKey: record.issue_id,
      data: {
        fixStatus: "Manually fixed",
        comment: `Manual value entered: ${selection.variable} → '${manualValue}'`,
      },
    });
    setFixResult(`Fix applied — ${selection.variable} set to '${manualValue}'.`);
  };

  // ── Determine buttons based on fix status + record properties ──
  const renderButtons = () => {
    // Auto-fixed → just Revert
    if (currentFixStatus === "Auto-fixed") {
      return (
        <button
          className="rounded border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50"
          onClick={() => {
            save({
              entityKey: record.issue_id,
              data: { fixStatus: "Not fixed", comment: "Reverted auto-fix" },
            });
            setFixResult("Reverted — fix status set to Not fixed.");
          }}
        >
          Revert
        </button>
      );
    }

    // Already resolved (Manually fixed / Accepted as-is) → show undo option
    if (currentFixStatus === "Manually fixed" || currentFixStatus === "Accepted as-is") {
      return (
        <button
          className="rounded border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50"
          onClick={() => {
            save({
              entityKey: record.issue_id,
              data: { fixStatus: "Not fixed", comment: `Reverted from ${currentFixStatus}` },
            });
            setFixResult("Reverted — fix status set to Not fixed.");
          }}
        >
          Undo fix
        </button>
      );
    }

    // Not fixed / Flagged → adaptive Fix ▾ + Accept
    const hasSingleSuggestion =
      evidence?.type === "value-correction" ||
      evidence?.type === "code-mapping" ||
      (evidence?.type === "missing-value" && evidence.suggested) ||
      ((evidence?.type === "metadata" || evidence?.type === "cross-domain") && record.suggestions?.length === 1);

    const hasMultipleCandidates = evidence?.type === "value-correction-multi";

    const hasMultipleSuggestions =
      !hasSingleSuggestion &&
      !hasMultipleCandidates &&
      (record.suggestions?.length ?? 0) > 1;

    // Build Fix ▾ dropdown options
    const fixOptions: { label: string; action: () => void }[] = [];
    if (hasSingleSuggestion) {
      fixOptions.push({ label: "Apply suggestion", action: applySuggestion });
    }
    if (hasMultipleCandidates) {
      fixOptions.push({ label: "Apply selected", action: applySelected });
    }
    if (hasMultipleSuggestions) {
      for (const suggestion of record.suggestions!) {
        fixOptions.push({
          label: suggestion,
          action: () => {
            save({
              entityKey: record.issue_id,
              data: {
                fixStatus: "Manually fixed",
                comment: `Fix applied: ${suggestion}`,
              },
            });
            setFixResult(`Fix applied — ${suggestion}.`);
          },
        });
      }
    }
    fixOptions.push({
      label: "Enter value\u2026",
      action: () => setShowEnterValue(true),
    });
    if (record.scriptKey) {
      fixOptions.push({
        label: "Run script\u2026",
        action: () => setShowScriptDialog(true),
      });
    }

    return (
      <div className="flex items-center gap-2">
        <div className="relative" ref={dropdownRef}>
          <button
            className="rounded bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90"
            onClick={() => setFixDropdownOpen(!fixDropdownOpen)}
          >
            Fix ▾
          </button>
          {fixDropdownOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-[160px] rounded border bg-background shadow-lg">
              {fixOptions.map((opt) => (
                <button
                  key={opt.label}
                  className="w-full px-3 py-1.5 text-left text-[10px] hover:bg-muted/50"
                  onClick={() => {
                    setFixDropdownOpen(false);
                    opt.action();
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="rounded border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50"
          onClick={() => setShowAcceptView(true)}
        >
          Accept
        </button>
      </div>
    );
  };

  // Handle script runs
  const handleScriptRun = (scriptKey: string, scope: "single" | "all") => {
    const scriptName = validationData?.scripts?.find(s => s.key === scriptKey)?.name ?? scriptKey;
    if (scope === "all") {
      // Only apply to unfixed records — skip already Manually fixed / Accepted as-is
      let applied = 0;
      for (const rec of allRecordsForRule) {
        const ann = recordAnnotations?.[rec.issue_id];
        const status = ann?.fixStatus ?? (rec.autoFixed ? "Auto-fixed" : "Not fixed");
        if (status === "Manually fixed" || status === "Accepted as-is") continue;
        save({
          entityKey: rec.issue_id,
          data: {
            fixStatus: "Manually fixed",
            comment: `Script applied: ${scriptName}`,
          },
        });
        applied++;
      }
      const skipped = allRecordsForRule.length - applied;
      setFixResult(
        `Script "${scriptName}" applied to ${applied} record${applied !== 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} already fixed, skipped)` : ""}.`
      );
    } else {
      save({
        entityKey: record.issue_id,
        data: {
          fixStatus: "Manually fixed",
          comment: `Script applied: ${scriptName}`,
        },
      });
      setFixResult(`Script "${scriptName}" applied to ${record.subject_id}.`);
    }
    setShowScriptDialog(false);
  };

  return (
    <>
      <CollapsiblePane title="Finding" defaultOpen>
        <div className="space-y-2 text-[11px]">
          {statusBadge}
          <p className="text-muted-foreground">{diagnosis}</p>
          {renderEvidence()}
          {/* Inline enter-value field */}
          {showEnterValue && (
            <div className="space-y-1.5">
              <input
                className="w-full rounded border bg-background px-2 py-1 font-mono text-[11px]"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder={`Enter ${selection.variable} value...`}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  className="rounded bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  disabled={!manualValue}
                  onClick={applyManualValue}
                >
                  Apply
                </button>
                <button
                  className="rounded border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50"
                  onClick={() => {
                    setShowEnterValue(false);
                    setManualValue("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {!showEnterValue && renderButtons()}
        </div>
      </CollapsiblePane>
      {showScriptDialog && (
        <FixScriptDialog
          record={record}
          ruleId={record.rule_id}
          studyId={studyId}
          onClose={() => setShowScriptDialog(false)}
          onRun={handleScriptRun}
          recordAnnotations={recordAnnotations}
        />
      )}
    </>
  );
}

// ── Inline Review Section ──────────────────────────────────────────────

function InlineReviewSection({
  studyId,
  issueId,
}: {
  studyId: string;
  issueId: string;
}) {
  const { data: annotations } = useAnnotations<ValidationRecordReview>(studyId, "validation-records");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<ValidationRecordReview>(studyId, "validation-records");

  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(() => reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reset]);

  const existing = annotations?.[issueId];

  const [reviewStatus, setReviewStatus] = useState<ValidationRecordReview["reviewStatus"]>("Not reviewed");
  const [assignedTo, setAssignedTo] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (existing) {
      setReviewStatus(existing.reviewStatus ?? "Not reviewed");
      setAssignedTo(existing.assignedTo ?? "");
      setComment(existing.comment ?? "");
    } else {
      setReviewStatus("Not reviewed");
      setAssignedTo("");
      setComment("");
    }
  }, [existing, issueId]);

  const handleSave = () => {
    save({
      entityKey: issueId,
      data: { reviewStatus, assignedTo, comment },
    });
  };

  const dirty =
    reviewStatus !== (existing?.reviewStatus ?? "Not reviewed") ||
    assignedTo !== (existing?.assignedTo ?? "") ||
    comment !== (existing?.comment ?? "");

  return (
    <CollapsiblePane title="Review" defaultOpen>
      <div className="space-y-2 text-[11px]">
        {/* Review status */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Review status</label>
          <select
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value as ValidationRecordReview["reviewStatus"])}
          >
            <option value="Not reviewed">Not reviewed</option>
            <option value="Reviewed">Reviewed</option>
            <option value="Approved">Approved</option>
          </select>
        </div>

        {/* Assigned to */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Assigned to</label>
          <input
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Name..."
          />
        </div>

        {/* Comment */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Comment</label>
          <textarea
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Notes..."
          />
        </div>

        {/* Save */}
        <button
          className={cn(
            "rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50",
            isSuccess ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          onClick={handleSave}
          disabled={!dirty || isPending || isSuccess}
        >
          {isPending ? "SAVING..." : isSuccess ? "SAVED" : "SAVE"}
        </button>

        {existing?.reviewedBy && (
          <p className="text-[10px] text-muted-foreground">
            Reviewed by {existing.reviewedBy} on{" "}
            {existing.reviewedDate ? new Date(existing.reviewedDate).toLocaleDateString() : "unknown date"}
          </p>
        )}
      </div>
    </CollapsiblePane>
  );
}

// ── Rule detail popover (portal-based to escape overflow containers) ────

function RulePopover({
  ruleId,
  domain,
  category,
  severity,
  description,
  detail,
}: {
  ruleId: string;
  domain: string;
  category: string;
  severity: string;
  description: string;
  detail: RuleDetail | null;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const handleEnter = useCallback(() => {
    if (!detail || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Place above the trigger, aligned to left edge
    setPos({ top: rect.top, left: rect.left });
    setShow(true);
  }, [detail]);

  const handleLeave = useCallback(() => {
    setShow(false);
  }, []);

  return (
    <div
      ref={triggerRef}
      className="mt-1 inline-block text-xs"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <span className="cursor-default font-medium text-muted-foreground underline decoration-dotted underline-offset-2">
        Rule {ruleId}
      </span>
      <span className="mx-1 text-muted-foreground">&middot;</span>
      <span className="text-muted-foreground">{domain} &middot; {category}</span>
      {show && pos && detail && createPortal(
        <div
          className="fixed z-[9999] w-72 rounded border bg-background p-3 shadow-lg"
          style={{ top: pos.top, left: pos.left, transform: "translateY(24px)" }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="space-y-1.5 text-[11px]">
            <div>
              <span className="font-medium text-muted-foreground">Standard: </span>
              <span>{detail.standard}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Section: </span>
              <span>{detail.section}</span>
            </div>
            <div className={cn("border-l-2 pl-2", SEVERITY_BORDER[severity])}>
              {description}
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Rationale: </span>
              <span>{detail.rationale}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">How to fix: </span>
              <span>{detail.howToFix}</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Mode 2: Issue Review ───────────────────────────────────────────────

function IssueReview({
  selection,
  studyId,
}: {
  selection: ValidationIssueViewSelection;
  studyId?: string;
}) {
  // Look up the full record from API data
  const { data: validationData } = useValidationResults(studyId);
  const { data: affectedData } = useAffectedRecords(studyId, selection.rule_id);

  const record = useMemo(() => {
    if (!affectedData?.records) return null;
    const apiRec = affectedData.records.find(r => r.issue_id === selection.issue_id);
    return apiRec ? mapApiRecord(apiRec) : null;
  }, [affectedData, selection.issue_id]);

  const detail = useMemo(() => {
    const rule = validationData?.rules?.find(r => r.rule_id === selection.rule_id);
    return rule ? extractRuleDetail(rule) : null;
  }, [validationData, selection.rule_id]);

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{selection.issue_id}</span>
          <span
            className="text-[10px] font-semibold"
            style={{ color: selection.severity === "Error" ? "#dc2626" : selection.severity === "Warning" ? "#d97706" : "#16a34a" }}
          >
            {selection.severity}
          </span>
        </div>
        {/* Rule ID with hover popover showing full rule detail */}
        <RulePopover ruleId={selection.rule_id} domain={selection.domain} category={selection.category} severity={selection.severity} description={selection.description} detail={detail} />
      </div>

      {/* Record context */}
      <CollapsiblePane title="Record context" defaultOpen>
        <div className="space-y-1 text-[11px]">
          <div>
            <span className="font-medium text-muted-foreground">Subject ID: </span>
            <span className="font-mono">{selection.subject_id}</span>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Visit: </span>
            <span>{selection.visit}</span>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Domain: </span>
            <span className="font-mono">{selection.domain}</span>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Variable: </span>
            <span className="font-mono">{selection.variable}</span>
          </div>
        </div>
      </CollapsiblePane>

      {/* Finding (merged — diagnosis + diff + action) */}
      {studyId && record && (
        <FindingSection
          record={record}
          selection={selection}
          studyId={studyId}
        />
      )}

      {/* Review */}
      {studyId && selection.issue_id && (
        <InlineReviewSection studyId={studyId} issueId={selection.issue_id} />
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function ValidationContextPanel({ selection, studyId, setSelection }: Props) {
  // Navigation history for < > buttons
  const [history, setHistory] = useState<ValidationViewSelection[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Track selection changes to build history
  const issueId = selection?.mode === "issue" ? selection.issue_id : "";
  const currentKey = selection ? `${selection.mode}:${selection.rule_id}:${issueId}` : "";

  // Push to history when selection changes (not from nav buttons)
  useMemo(() => {
    if (!selection) return;
    const lastEntry = history[historyIndex];
    const lastIssueId = lastEntry?.mode === "issue" ? lastEntry.issue_id : "";
    const lastKey = lastEntry ? `${lastEntry.mode}:${lastEntry.rule_id}:${lastIssueId}` : "";
    if (currentKey !== lastKey) {
      const newHistory = [...history.slice(0, historyIndex + 1), selection];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const handleBack = () => {
    if (!canGoBack || !setSelection) return;
    const prev = history[historyIndex - 1];
    setHistoryIndex(historyIndex - 1);
    setSelection({ ...prev });
  };

  const handleForward = () => {
    if (!canGoForward || !setSelection) return;
    const next = history[historyIndex + 1];
    setHistoryIndex(historyIndex + 1);
    setSelection({ ...next });
  };

  const { data: validationData } = useValidationResults(studyId);
  const { data: catalogData } = useValidationCatalog(studyId);
  const detail = useMemo(() => {
    if (!selection) return null;
    // Try triggered results first (most detailed for triggered rules)
    const fromResults = validationData?.rules?.find(r => r.rule_id === selection.rule_id);
    if (fromResults) return extractRuleDetail(fromResults);
    // Fall back to full catalog (clean/disabled/CORE rules)
    const fromCatalog = catalogData?.rules?.find(r => r.rule_id === selection.rule_id);
    if (fromCatalog) return extractRuleDetail(fromCatalog);
    return null;
  }, [selection, validationData, catalogData]);

  if (!selection) {
    return (
      <div>
        <CollapsiblePane title="Overview" defaultOpen>
          <div className="space-y-2 text-[11px]">
            <p className="text-muted-foreground">
              SEND compliance validation checks the dataset against CDISC SENDIG
              implementation rules and controlled terminology requirements.
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">&#x2716;</span>
                <span><strong>Error</strong> — Must fix before submission</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">&#x26A0;</span>
                <span><strong>Warning</strong> — Review recommended</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">&#x2139;</span>
                <span><strong>Info</strong> — Best practice suggestion</span>
              </div>
            </div>
          </div>
        </CollapsiblePane>
        <div className="px-4 py-2 text-xs text-muted-foreground">
          Select a rule to view details and affected records.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* < > navigation buttons */}
      <PaneNavBar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={handleBack}
        onForward={handleForward}
      />

      {selection.mode === "issue" && selection.issue_id ? (
        <IssueReview
          selection={selection}
          studyId={studyId}
        />
      ) : (
        <RuleReviewSummary
          selection={selection}
          detail={detail}
          studyId={studyId}
          setSelection={setSelection}
        />
      )}
    </div>
  );
}
