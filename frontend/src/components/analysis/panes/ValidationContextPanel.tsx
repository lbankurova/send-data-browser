import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { CollapsiblePane } from "./CollapsiblePane";
import { ValidationIssueForm } from "./ValidationIssueForm";
import { cn } from "@/lib/utils";
import {
  RULE_DETAILS,
  AFFECTED_RECORDS,
  FIX_SCRIPTS,
  FIX_STATUS_STYLES,
  StatusBadge,
} from "@/components/analysis/ValidationView";
import type { RuleDetail, AffectedRecord, FixScript } from "@/components/analysis/ValidationView";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { ValidationRecordReview } from "@/types/annotations";

interface ValidationSelection {
  _view: string;
  mode: "rule" | "issue";
  rule_id: string;
  severity: "Error" | "Warning" | "Info";
  domain: string;
  category: string;
  description: string;
  records_affected: number;
  // Issue-mode fields
  issue_id?: string;
  subject_id?: string;
  visit?: string;
  variable?: string;
  actual_value?: string;
  expected_value?: string;
}

interface Props {
  selection: ValidationSelection | null;
  studyId?: string;
  setSelection?: (sel: Record<string, unknown> | null) => void;
}

const SEVERITY_BORDER: Record<string, string> = {
  Error: "border-l-red-500",
  Warning: "border-l-amber-500",
  Info: "border-l-blue-500",
};

// Fix status count colors (colored count numbers, muted text)
const FIX_COUNT_COLOR: Record<string, string> = {
  "Not fixed": "text-gray-500",
  "Auto-fixed": "text-teal-700",
  "Manually fixed": "text-green-700",
  "Accepted as-is": "text-blue-700",
  "Flagged": "text-orange-700",
};

// Review status count colors
const REVIEW_COUNT_COLOR: Record<string, string> = {
  "Not reviewed": "text-gray-500",
  "Reviewed": "text-blue-700",
  "Approved": "text-green-700",
};

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
      className="font-mono text-blue-600 hover:underline"
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

// ── Mode 1: Rule Review Summary ────────────────────────────────────────

function RuleReviewSummary({
  selection,
  detail,
  studyId,
}: {
  selection: ValidationSelection;
  detail: RuleDetail | null;
  studyId?: string;
}) {
  const records = AFFECTED_RECORDS[selection.rule_id] ?? [];
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

  return (
    <div>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{selection.rule_id}</span>
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
              selection.severity === "Error" && "border-red-200 bg-red-100 text-red-800",
              selection.severity === "Warning" && "border-amber-200 bg-amber-100 text-amber-800",
              selection.severity === "Info" && "border-blue-200 bg-blue-100 text-blue-800"
            )}
          >
            {selection.severity}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {selection.domain} &middot; {selection.category}
        </p>
      </div>

      {/* Rule detail */}
      <CollapsiblePane title="Rule detail" defaultOpen>
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

      {/* Review progress */}
      <CollapsiblePane title="Review progress" defaultOpen>
        <div className="space-y-2.5 text-[11px]">
          {/* Progress bar */}
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{reviewedCount} of {records.length} reviewed</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
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
                <span className={cn("font-medium", REVIEW_COUNT_COLOR[status])}>
                  {count}
                </span>
              </span>
            ))}
          </div>
          {/* Fix status counts */}
          <div className="text-[10px] text-muted-foreground">
            {Object.entries(fixCounts).map(([status, count], i) => (
              <span key={status}>
                {i > 0 && <span className="mx-1">&middot;</span>}
                {status}{" "}
                <span className={cn("font-medium", FIX_COUNT_COLOR[status])}>
                  {count}
                </span>
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
  // Find applicable scripts
  const applicableScripts = useMemo(() => {
    return Object.entries(FIX_SCRIPTS).filter(([, s]) =>
      s.applicableRules.includes(ruleId)
    );
  }, [ruleId]);

  const [selectedScript, setSelectedScript] = useState<string>(
    record.scriptKey ?? applicableScripts[0]?.[0] ?? ""
  );
  const [scope, setScope] = useState<"single" | "all">("all");

  const script: FixScript | undefined = FIX_SCRIPTS[selectedScript];
  const allRecords = AFFECTED_RECORDS[ruleId] ?? [];

  // Count only unfixed records (skip Manually fixed, Accepted as-is)
  const unfixedRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      const ann = recordAnnotations?.[rec.issue_id];
      const status = ann?.fixStatus ?? (rec.autoFixed ? "Auto-fixed" : "Not fixed");
      return status === "Not fixed" || status === "Flagged";
    });
  }, [allRecords, recordAnnotations]);

  // Suppress unused var warning - studyId is passed for future use
  void studyId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[500px] rounded-lg border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
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
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">Script</label>
            <select
              className="w-full rounded border bg-background px-2 py-1.5 text-[11px]"
              value={selectedScript}
              onChange={(e) => setSelectedScript(e.target.value)}
            >
              {applicableScripts.map(([key, s]) => (
                <option key={key} value={key}>{s.name}</option>
              ))}
            </select>
          </div>

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
          {script && (
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
                    {script.mockPreview.map((row, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-2 py-1 font-mono">{row.subject}</td>
                        <td className="px-2 py-1 font-mono">{row.field}</td>
                        <td className="px-2 py-1 text-red-600">{row.from}</td>
                        <td className="px-2 py-1 text-green-700">{row.to}</td>
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
            disabled={!selectedScript}
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
  selection: ValidationSelection;
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
      (evidence?.type === "metadata" && record.suggestions?.length === 1);

    const hasMultipleCandidates = evidence?.type === "value-correction-multi";

    // Build Fix ▾ dropdown options
    const fixOptions: { label: string; action: () => void }[] = [];
    if (hasSingleSuggestion) {
      fixOptions.push({ label: "Apply suggestion", action: applySuggestion });
    }
    if (hasMultipleCandidates) {
      fixOptions.push({ label: "Apply selected", action: applySelected });
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
    const scriptName = FIX_SCRIPTS[scriptKey]?.name ?? scriptKey;
    if (scope === "all") {
      const allRecords = AFFECTED_RECORDS[record.rule_id] ?? [];
      // Only apply to unfixed records — skip already Manually fixed / Accepted as-is
      let applied = 0;
      for (const rec of allRecords) {
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
      const skipped = allRecords.length - applied;
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
          className={`rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${isSuccess ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          onClick={handleSave}
          disabled={!dirty || isPending || isSuccess}
        >
          {isPending ? "SAVING..." : isSuccess ? "SAVED" : "SAVE"}
        </button>

        {existing?.reviewedBy && (
          <p className="text-[10px] text-muted-foreground">
            Reviewed by {existing.reviewedBy} on{" "}
            {new Date(existing.reviewedDate).toLocaleDateString()}
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
  selection: ValidationSelection;
  studyId?: string;
}) {
  // Look up the full record metadata from AFFECTED_RECORDS
  const record = useMemo(() => {
    const records = AFFECTED_RECORDS[selection.rule_id] ?? [];
    return records.find((r) => r.issue_id === selection.issue_id) ?? null;
  }, [selection.rule_id, selection.issue_id]);

  const detail = RULE_DETAILS[selection.rule_id] ?? null;

  return (
    <div>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{selection.issue_id}</span>
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
              selection.severity === "Error" && "border-red-200 bg-red-100 text-red-800",
              selection.severity === "Warning" && "border-amber-200 bg-amber-100 text-amber-800",
              selection.severity === "Info" && "border-blue-200 bg-blue-100 text-blue-800"
            )}
          >
            {selection.severity}
          </span>
        </div>
        {/* Rule ID with hover popover showing full rule detail */}
        <RulePopover ruleId={selection.rule_id} domain={selection.domain} category={selection.category} severity={selection.severity} description={selection.description} detail={detail} />
      </div>

      {/* Record context — one-liner */}
      <div className="border-b px-4 py-2 text-xs text-muted-foreground">
        {selection.subject_id} &middot; {selection.visit} &middot; {selection.domain}
      </div>

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
  const [history, setHistory] = useState<ValidationSelection[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Track selection changes to build history
  const currentKey = selection ? `${selection.mode}:${selection.rule_id}:${selection.issue_id ?? ""}` : "";

  // Push to history when selection changes (not from nav buttons)
  useMemo(() => {
    if (!selection) return;
    const lastEntry = history[historyIndex];
    const lastKey = lastEntry ? `${lastEntry.mode}:${lastEntry.rule_id}:${lastEntry.issue_id ?? ""}` : "";
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

  const detail = useMemo(
    () => (selection ? RULE_DETAILS[selection.rule_id] ?? null : null),
    [selection]
  );

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
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#dc2626" }} />
                <span><strong>Error</strong> — Must fix before submission</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#d97706" }} />
                <span><strong>Warning</strong> — Review recommended</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#2563eb" }} />
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
        />
      )}
    </div>
  );
}
