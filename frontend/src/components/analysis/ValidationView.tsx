import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import type { ValidationViewSelection } from "@/contexts/ViewSelectionContext";
import { cn } from "@/lib/utils";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { ViewSection } from "@/components/ui/ViewSection";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { useAutoFitSections } from "@/hooks/useAutoFitSections";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { CollapseAllButtons } from "@/components/analysis/panes/CollapseAllButtons";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useValidationResults } from "@/hooks/useValidationResults";
import type { ValidationRuleResult } from "@/hooks/useValidationResults";
import { useAffectedRecords } from "@/hooks/useAffectedRecords";
import { useRunValidation } from "@/hooks/useRunValidation";
import type { AffectedRecordData } from "@/hooks/useAffectedRecords";
import type { ValidationRecordReview } from "@/types/annotations";
import { ValidationRuleCatalog } from "./ValidationRuleCatalog";

type ValidationMode = "data-quality" | "study-design" | "rule-catalog";

const STUDY_DESIGN_CATEGORY = "Study design";

// ── Types ──────────────────────────────────────────────────────────────

// Category-specific evidence for Finding section rendering
export type RecordEvidence =
  | { type: "value-correction"; from: string; to: string }
  | { type: "value-correction-multi"; from: string; candidates: string[] }
  | { type: "code-mapping"; value: string; code: string }
  | { type: "range-check"; lines: { label: string; value: string }[] }
  | { type: "missing-value"; variable: string; derivation?: string; suggested?: string }
  | { type: "metadata"; lines: { label: string; value: string }[] }
  | { type: "cross-domain"; lines: { label: string; value: string }[] };

export interface AffectedRecord {
  issue_id: string;
  rule_id: string;
  subject_id: string;
  visit: string;
  domain: string;
  variable: string;
  actual_value: string;
  expected_value: string;
  fixTier: 1 | 2 | 3;
  autoFixed: boolean;
  suggestions?: string[];
  scriptKey?: string;
  evidence?: RecordEvidence;
  diagnosis: string;
}

export interface RuleDetail {
  standard: string;
  section: string;
  rationale: string;
  howToFix: string;
}

// ── Data mapping helpers ──────────────────────────────────────────────

/** Map API record (snake_case) to frontend AffectedRecord (camelCase) */
export function mapApiRecord(rec: AffectedRecordData): AffectedRecord {
  return {
    issue_id: rec.issue_id,
    rule_id: rec.rule_id,
    subject_id: rec.subject_id,
    visit: rec.visit,
    domain: rec.domain,
    variable: rec.variable,
    actual_value: rec.actual_value,
    expected_value: rec.expected_value,
    fixTier: rec.fix_tier,
    autoFixed: rec.auto_fixed,
    suggestions: rec.suggestions ?? undefined,
    scriptKey: rec.script_key ?? undefined,
    evidence: rec.evidence,
    diagnosis: rec.diagnosis,
  };
}

/** Extract RuleDetail from API rule result */
export function extractRuleDetail(rule: ValidationRuleResult): RuleDetail {
  return {
    standard: rule.standard,
    section: rule.section,
    rationale: rule.rationale,
    howToFix: rule.how_to_fix,
  };
}

// ── Severity styles ────────────────────────────────────────────────────

const SEVERITY_BORDER_COLORS: Record<string, string> = {
  Error: "#dc2626",
  Warning: "#d97706",
  Info: "#16a34a",
};

// ── Fix & Review status badges ─────────────────────────────────────────

export const FIX_STATUS_STYLES: Record<string, string> = {
  "Not fixed": "bg-gray-100 text-gray-600 border-gray-200",
  "Auto-fixed": "bg-gray-100 text-gray-600 border-gray-200",
  "Manually fixed": "bg-gray-100 text-gray-600 border-gray-200",
  "Accepted as-is": "bg-gray-100 text-gray-600 border-gray-200",
  "Flagged": "bg-gray-100 text-gray-600 border-gray-200",
};

export const REVIEW_STATUS_STYLES: Record<string, string> = {
  "Not reviewed": "bg-gray-100 text-gray-600 border-gray-200",
  "Reviewed": "bg-gray-100 text-gray-600 border-gray-200",
  "Approved": "bg-gray-100 text-gray-600 border-gray-200",
};

export function StatusBadge({ status, styles }: { status: string; styles: Record<string, string> }) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
        styles[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
      )}
    >
      {status}
    </span>
  );
}

// ── Record row with live annotation ────────────────────────────────────

interface RecordRowData extends AffectedRecord {
  fixStatus: string;
  reviewStatus: string;
  assignedTo: string;
}

// ── Top table columns ──────────────────────────────────────────────────

const ruleColumnHelper = createColumnHelper<ValidationRuleResult>();

const ruleColumns = [
  ruleColumnHelper.accessor("rule_id", {
    header: "Rule",
    size: 150,
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  ruleColumnHelper.accessor("severity", {
    header: "Severity",
    size: 90,
    cell: (info) => {
      const sev = info.getValue();
      return (
        <span
          className="inline-block border-l-2 pl-1.5 py-0.5 text-[10px] font-semibold text-gray-600"
          style={{ borderLeftColor: SEVERITY_BORDER_COLORS[sev] ?? "#6B7280" }}
        >
          {sev}
        </span>
      );
    },
  }),
  ruleColumnHelper.accessor("source", {
    header: "Source",
    size: 60,
    cell: (info) => {
      const src = info.getValue();
      return (
        <span
          className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
          title={src === "core" ? "CDISC CORE conformance rule" : "Custom study design rule"}
        >
          {src}
        </span>
      );
    },
  }),
  ruleColumnHelper.accessor("domain", {
    header: "Domain",
    size: 70,
    cell: (info) => {
      const d = info.getValue();
      return <DomainLabel domain={d} />;
    },
  }),
  ruleColumnHelper.accessor("category", {
    header: "Category",
    size: 140,
  }),
  ruleColumnHelper.accessor("description", {
    header: "Description",
    size: 400,
  }),
  ruleColumnHelper.accessor("records_affected", {
    header: "Records",
    size: 70,
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
];

// ── Bottom table columns ───────────────────────────────────────────────

const recordColumnHelper = createColumnHelper<RecordRowData>();

// ── Component ──────────────────────────────────────────────────────────

interface Props {
  studyId?: string;
  onSelectionChange?: (sel: ValidationViewSelection | null) => void;
  viewSelection?: ValidationViewSelection | null;
}

export function ValidationView({ studyId, onSelectionChange, viewSelection }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [ruleSorting, setRuleSorting] = useState<SortingState>([]);
  const [recordSorting, setRecordSorting] = useState<SortingState>([]);
  const [ruleColumnSizing, setRuleColumnSizing] = useState<ColumnSizingState>({});
  const [recordColumnSizing, setRecordColumnSizing] = useState<ColumnSizingState>({});
  const [selectedRule, setSelectedRule] = useState<ValidationRuleResult | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [recordFilters, setRecordFilters] = useState<{ fixStatus: string; reviewStatus: string; subjectId: string }>({ fixStatus: "", reviewStatus: "", subjectId: "" });
  const [severityFilter, setSeverityFilter] = useState<"" | "Error" | "Warning" | "Info">("");
  const [sourceFilter, setSourceFilter] = useState<"" | "core" | "custom">("");
  const containerRef = useRef<HTMLDivElement>(null);
  const sections = useAutoFitSections(containerRef, "validation", [
    { id: "rules", min: 100, max: 500, defaultHeight: 280 },
  ]);
  const rulesSection = sections[0];
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // Mode: data-quality (default) or study-design
  const [mode, setMode] = useState<ValidationMode>(() => {
    const urlMode = searchParams.get("mode");
    return urlMode === "study-design" ? "study-design" : "data-quality";
  });

  // Track if we've consumed the initial ?rule= param
  const [initialRuleConsumed, setInitialRuleConsumed] = useState(false);
  const urlRuleParam = searchParams.get("rule");

  // API hooks
  const { data: validationData, isLoading: resultsLoading } = useValidationResults(studyId);
  const { data: affectedData } = useAffectedRecords(studyId, selectedRule?.rule_id);
  const { mutate: runValidation, isPending: isValidating } = useRunValidation(studyId);

  // Split rules by mode
  const allRules = useMemo(() => validationData?.rules ?? [], [validationData?.rules]);
  const modeRules = useMemo(
    () => mode === "study-design"
      ? allRules.filter((r) => r.category === STUDY_DESIGN_CATEGORY)
      : allRules.filter((r) => r.category !== STUDY_DESIGN_CATEGORY),
    [allRules, mode]
  );
  const rules = useMemo(() => {
    let filtered = modeRules;
    if (severityFilter) {
      filtered = filtered.filter((r) => r.severity === severityFilter);
    }
    if (sourceFilter) {
      filtered = filtered.filter((r) => r.source === sourceFilter);
    }
    return filtered;
  }, [modeRules, severityFilter, sourceFilter]);

  // Counts per mode
  const modeCounts = useMemo(() => {
    const sd = allRules.filter((r) => r.category === STUDY_DESIGN_CATEGORY);
    const dq = allRules.filter((r) => r.category !== STUDY_DESIGN_CATEGORY);
    return {
      studyDesign: sd.length,
      dataQuality: dq.length,
    };
  }, [allRules]);

  // Auto-select rule from URL param (e.g., ?rule=SD-003)
  useEffect(() => {
    if (initialRuleConsumed || !urlRuleParam || !validationData) return;
    const target = allRules.find(
      (r) => r.rule_id === urlRuleParam || r.rule_id.startsWith(urlRuleParam)
    );
    if (target) {
      setSelectedRule(target);
      onSelectionChange?.({
        _view: "validation",
        mode: "rule",
        rule_id: target.rule_id,
        severity: target.severity,
        domain: target.domain,
        category: target.category,
        description: target.description,
        records_affected: target.records_affected,
      });
    }
    setInitialRuleConsumed(true);
  }, [urlRuleParam, initialRuleConsumed, allRules, validationData, onSelectionChange]);

  // Sync mode to URL
  const handleModeChange = (newMode: ValidationMode) => {
    setMode(newMode);
    setSelectedRule(null);
    setSelectedIssueId(null);
    setSeverityFilter("");
    setSourceFilter("");
    setRecordFilters({ fixStatus: "", reviewStatus: "", subjectId: "" });
    onSelectionChange?.(null);
    // Update URL param without navigation
    const params = new URLSearchParams(searchParams);
    if (newMode === "study-design") {
      params.set("mode", "study-design");
    } else {
      params.delete("mode");
    }
    params.delete("rule");
    setSearchParams(params, { replace: true });
  };

  // Load record annotations
  const { data: recordAnnotations } = useAnnotations<ValidationRecordReview>(studyId, "validation-records");

  // Severity counts — scoped to current mode
  const counts = useMemo(() => {
    return {
      errors: modeRules.filter((r) => r.severity === "Error").length,
      warnings: modeRules.filter((r) => r.severity === "Warning").length,
      info: modeRules.filter((r) => r.severity === "Info").length,
      core: modeRules.filter((r) => r.source === "core").length,
      custom: modeRules.filter((r) => r.source === "custom").length,
    };
  }, [modeRules]);

  // Records for selected rule, enriched with annotation data
  const recordRows = useMemo<RecordRowData[]>(() => {
    if (!affectedData?.records) return [];
    return affectedData.records.map((rec) => {
      const mapped = mapApiRecord(rec);
      const ann = recordAnnotations?.[mapped.issue_id];
      return {
        ...mapped,
        fixStatus: ann?.fixStatus ?? (mapped.autoFixed ? "Auto-fixed" : "Not fixed"),
        reviewStatus: ann?.reviewStatus ?? "Not reviewed",
        assignedTo: ann?.assignedTo ?? "",
      };
    });
  }, [affectedData, recordAnnotations]);

  // Unique subject IDs for subject filter
  const uniqueSubjects = useMemo(() => {
    const set = new Set(recordRows.map((r) => r.subject_id));
    return [...set].sort();
  }, [recordRows]);

  // Filter records
  const filteredRecords = useMemo(() => {
    let rows = recordRows;
    if (recordFilters.fixStatus) {
      rows = rows.filter((r) => r.fixStatus === recordFilters.fixStatus);
    }
    if (recordFilters.reviewStatus) {
      rows = rows.filter((r) => r.reviewStatus === recordFilters.reviewStatus);
    }
    if (recordFilters.subjectId) {
      rows = rows.filter((r) => r.subject_id === recordFilters.subjectId);
    }
    return rows;
  }, [recordRows, recordFilters]);

  // Record columns (defined inside component to use click handler)
  const recordColumns = useMemo(() => [
    recordColumnHelper.accessor("issue_id", {
      header: "Issue ID",
      size: 170,
      cell: (info) => (
        <button
          className="font-mono text-xs text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            if (!selectedRule) return;
            const rec = info.row.original;
            setSelectedIssueId(rec.issue_id);
            onSelectionChange?.({
              _view: "validation",
              mode: "issue",
              rule_id: selectedRule.rule_id,
              severity: selectedRule.severity,
              domain: rec.domain,
              category: selectedRule.category,
              description: selectedRule.description,
              records_affected: selectedRule.records_affected,
              issue_id: rec.issue_id,
              subject_id: rec.subject_id,
              visit: rec.visit,
              variable: rec.variable,
              actual_value: rec.actual_value,
              expected_value: rec.expected_value,
            });
          }}
        >
          {info.getValue()}
        </button>
      ),
    }),
    recordColumnHelper.accessor("subject_id", {
      header: "Subject",
      size: 110,
      cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
    }),
    recordColumnHelper.accessor("visit", {
      header: "Visit",
      size: 90,
    }),
    recordColumnHelper.accessor("actual_value", {
      header: "Key value",
      size: 200,
      cell: (info) => <span className="text-xs">{info.getValue()}</span>,
    }),
    recordColumnHelper.accessor("expected_value", {
      header: "Expected",
      size: 200,
      cell: (info) => <span className="text-xs text-muted-foreground">{info.getValue()}</span>,
    }),
    recordColumnHelper.accessor("fixStatus", {
      header: "Fix status",
      size: 110,
      cell: (info) => <StatusBadge status={info.getValue()} styles={FIX_STATUS_STYLES} />,
    }),
    recordColumnHelper.accessor("reviewStatus", {
      header: "Review status",
      size: 110,
      cell: (info) => <StatusBadge status={info.getValue()} styles={REVIEW_STATUS_STYLES} />,
    }),
    recordColumnHelper.accessor("assignedTo", {
      header: "Assigned to",
      size: 100,
      cell: (info) => <span className="text-xs">{info.getValue() || "\u2014"}</span>,
    }),
  ], [selectedRule, onSelectionChange]);

  // Top table
  const ruleTable = useReactTable({
    data: rules,
    columns: ruleColumns,
    state: { sorting: ruleSorting, columnSizing: ruleColumnSizing },
    onSortingChange: setRuleSorting,
    onColumnSizingChange: setRuleColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  // Bottom table
  const recordTable = useReactTable({
    data: filteredRecords,
    columns: recordColumns,
    state: { sorting: recordSorting, columnSizing: recordColumnSizing },
    onSortingChange: setRecordSorting,
    onColumnSizingChange: setRecordColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  // Absorber pattern helpers
  const RULE_ABSORBER = "description";
  const RECORD_ABSORBER = "actual_value";
  function ruleColStyle(colId: string) {
    const manualWidth = ruleColumnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    if (colId === RULE_ABSORBER) return undefined;
    return { width: 1, whiteSpace: "nowrap" as const };
  }
  function recordColStyle(colId: string) {
    const manualWidth = recordColumnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    if (colId === RECORD_ABSORBER) return undefined;
    return { width: 1, whiteSpace: "nowrap" as const };
  }

  // Derived values for effect dependency tracking
  const vsFixFilter = viewSelection?.recordFixStatusFilter;
  const vsReviewFilter = viewSelection?.recordReviewStatusFilter;
  const vsMode = viewSelection?.mode;
  const vsIssueId = viewSelection?.mode === "issue" ? viewSelection.issue_id : undefined;

  // Watch for filter changes from context panel
  useEffect(() => {
    if (vsFixFilter !== undefined) {
      setRecordFilters((prev) => ({ ...prev, fixStatus: vsFixFilter }));
    }
    if (vsReviewFilter !== undefined) {
      setRecordFilters((prev) => ({ ...prev, reviewStatus: vsReviewFilter }));
    }
  }, [vsFixFilter, vsReviewFilter]);

  // Watch for mode changes from context panel (back link)
  useEffect(() => {
    if (vsMode === "rule") {
      setSelectedIssueId(null);
    }
    if (vsMode === "issue" && vsIssueId) {
      setSelectedIssueId(vsIssueId);
    }
  }, [vsMode, vsIssueId]);

  const handleRuleClick = (rule: ValidationRuleResult) => {
    const isReselect = selectedRule?.rule_id === rule.rule_id;
    if (isReselect) {
      setSelectedRule(null);
      setSelectedIssueId(null);
      setRecordFilters({ fixStatus: "", reviewStatus: "", subjectId: "" });
      onSelectionChange?.(null);
    } else {
      setSelectedRule(rule);
      setSelectedIssueId(null);
      setRecordFilters({ fixStatus: "", reviewStatus: "", subjectId: "" });
      onSelectionChange?.({
        _view: "validation",
        mode: "rule",
        rule_id: rule.rule_id,
        severity: rule.severity,
        domain: rule.domain,
        category: rule.category,
        description: rule.description,
        records_affected: rule.records_affected,
      });
    }
  };

  // Shared mode tab bar for loading/empty states
  const modeTabBar = (
    <ViewTabBar
      tabs={[
        { key: "data-quality", label: "Data quality" },
        { key: "study-design", label: "Study design" },
        { key: "rule-catalog", label: "Rule catalog" },
      ]}
      value={mode}
      onChange={(k) => handleModeChange(k as ValidationMode)}
    />
  );

  // ── Loading state ──
  if (resultsLoading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {modeTabBar}
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading validation results...
        </div>
      </div>
    );
  }

  // ── No results state ──
  if (!validationData) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {modeTabBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>No validation results available for this study.</span>
          <button
            className="rounded bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={isValidating}
            onClick={() => runValidation()}
          >
            {isValidating ? "RUNNING..." : "RUN"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Mode tab bar */}
      <ViewTabBar
        tabs={[
          { key: "data-quality", label: "Data quality", count: modeCounts.dataQuality },
          { key: "study-design", label: "Study design", count: modeCounts.studyDesign },
          { key: "rule-catalog", label: "Rule catalog" },
        ]}
        value={mode}
        onChange={(k) => handleModeChange(k as ValidationMode)}
        right={
          <span className="flex items-center gap-2 mr-3">
            <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
            <button
              className="rounded bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={isValidating}
              onClick={() => runValidation()}
            >
              {isValidating ? "RUNNING..." : "RUN"}
            </button>
          </span>
        }
      />

      {/* Rule catalog mode */}
      {mode === "rule-catalog" ? (
        <ValidationRuleCatalog
          firedRules={allRules}
          scripts={validationData.scripts ?? []}
          coreConformance={validationData.core_conformance ?? null}
          studyId={studyId}
        />
      ) : (
      <>
      {/* Severity filter bar */}
      <div className="flex items-center gap-4 border-b px-4 py-2">
        <div className="flex items-center gap-3 text-xs">
          <button
            className={cn(
              "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity",
              severityFilter === "Error" && "ring-1 ring-border bg-muted/50",
              severityFilter && severityFilter !== "Error" && "opacity-40"
            )}
            onClick={() => setSeverityFilter((prev) => (prev === "Error" ? "" : "Error"))}
            title="Filter by errors"
          >
            <span className="text-[10px] text-muted-foreground">&#x2716;</span>
            <span className="font-medium">{counts.errors}</span>
            <span className="text-muted-foreground">errors</span>
          </button>
          <button
            className={cn(
              "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity",
              severityFilter === "Warning" && "ring-1 ring-border bg-muted/50",
              severityFilter && severityFilter !== "Warning" && "opacity-40"
            )}
            onClick={() => setSeverityFilter((prev) => (prev === "Warning" ? "" : "Warning"))}
            title="Filter by warnings"
          >
            <span className="text-[10px] text-muted-foreground">&#x26A0;</span>
            <span className="font-medium">{counts.warnings}</span>
            <span className="text-muted-foreground">warnings</span>
          </button>
          <button
            className={cn(
              "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity",
              severityFilter === "Info" && "ring-1 ring-border bg-muted/50",
              severityFilter && severityFilter !== "Info" && "opacity-40"
            )}
            onClick={() => setSeverityFilter((prev) => (prev === "Info" ? "" : "Info"))}
            title="Filter by info"
          >
            <span className="text-[10px] text-muted-foreground">&#x2139;</span>
            <span className="font-medium">{counts.info}</span>
            <span className="text-muted-foreground">info</span>
          </button>
          {validationData.summary.elapsed_seconds != null && (
            <span className="text-muted-foreground">
              ({validationData.summary.elapsed_seconds}s)
            </span>
          )}
        </div>
        {/* Source filter (CORE vs Custom) */}
        {(counts.core > 0 || counts.custom > 0) && (
          <div className="ml-auto flex items-center gap-2 border-l pl-4 text-xs">
            <span className="text-muted-foreground">Source:</span>
            <button
              className={cn(
                "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity",
                sourceFilter === "core" && "ring-1 ring-border bg-muted/50",
                sourceFilter && sourceFilter !== "core" && "opacity-40"
              )}
              onClick={() => setSourceFilter((prev) => (prev === "core" ? "" : "core"))}
              title="Show only CDISC CORE rules"
            >
              <span className="font-medium">{counts.core}</span>
              <span className="text-muted-foreground">CORE</span>
            </button>
            <button
              className={cn(
                "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity",
                sourceFilter === "custom" && "ring-1 ring-border bg-muted/50",
                sourceFilter && sourceFilter !== "custom" && "opacity-40"
              )}
              onClick={() => setSourceFilter((prev) => (prev === "custom" ? "" : "custom"))}
              title="Show only custom rules"
            >
              <span className="font-medium">{counts.custom}</span>
              <span className="text-muted-foreground">Custom</span>
            </button>
          </div>
        )}
        {/* CORE conformance metadata */}
        {validationData.core_conformance && (
          <div className="ml-auto flex items-center gap-2 border-l pl-4 text-[10px] text-muted-foreground">
            <span title={`CORE Engine ${validationData.core_conformance.engine_version}`}>
              {validationData.core_conformance.standard}
            </span>
            {validationData.core_conformance.ct_version && (
              <span title="Controlled Terminology Version">
                CT: {validationData.core_conformance.ct_version}
              </span>
            )}
          </div>
        )}
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          {(severityFilter || sourceFilter) && modeRules.length > 0 ? (
            <>
              <span>
                No {severityFilter && severityFilter.toLowerCase()} {sourceFilter && sourceFilter} rules found.
              </span>
              <button
                className="rounded border px-2 py-1 text-xs hover:bg-muted/50"
                onClick={() => {
                  setSeverityFilter("");
                  setSourceFilter("");
                }}
              >
                Show all
              </button>
            </>
          ) : mode === "study-design" ? (
            <span>No study design issues detected.</span>
          ) : (
            <span>No validation issues found. Dataset passed all checks.</span>
          )}
        </div>
      ) : (
        <div ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Top table — Rule Summary */}
          <ViewSection
            mode="fixed"
            title={`Rule summary (${rules.length})`}
            height={rulesSection.height}
            onResizePointerDown={rulesSection.onPointerDown}
            contentRef={rulesSection.contentRef}
            expandGen={expandGen}
            collapseGen={collapseGen}
          >
          <div className="h-full overflow-auto">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 z-10 bg-background">
                {ruleTable.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b bg-muted/30">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="relative cursor-pointer select-none px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        style={ruleColStyle(header.id)}
                        onDoubleClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{ asc: " \u2191", desc: " \u2193" }[header.column.getIsSorted() as string] ?? null}
                        </span>
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            "absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none",
                            header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30"
                          )}
                        />
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {ruleTable.getRowModel().rows.map((row) => {
                  const isSelected = selectedRule?.rule_id === row.original.rule_id;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "cursor-pointer border-b transition-colors hover:bg-accent/50",
                        isSelected && "bg-accent font-medium"
                      )}
                      onClick={() => handleRuleClick(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            "px-1.5 py-px",
                            cell.column.id === RULE_ABSORBER && !ruleColumnSizing[RULE_ABSORBER] && "overflow-hidden text-ellipsis whitespace-nowrap",
                          )}
                          style={ruleColStyle(cell.column.id)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </ViewSection>

          {/* Divider bar */}
          {selectedRule && (
            <FilterBar>
              <span className="text-xs font-medium">
                {recordFilters.fixStatus || recordFilters.reviewStatus || recordFilters.subjectId
                  ? <>{filteredRecords.length} of {recordRows.length} record{recordRows.length !== 1 ? "s" : ""}</>
                  : <>{filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}</>
                } for{" "}
                <span className="font-mono">{selectedRule.rule_id}</span>
                {" \u2014 "}
                {selectedRule.category}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                {/* Fix status filter */}
                <FilterSelect
                  value={recordFilters.fixStatus}
                  onChange={(e) => setRecordFilters((prev) => ({ ...prev, fixStatus: e.target.value }))}
                >
                  <option value="">All fix status</option>
                  <option value="Not fixed">Not fixed</option>
                  <option value="Auto-fixed">Auto-fixed</option>
                  <option value="Manually fixed">Manually fixed</option>
                  <option value="Accepted as-is">Accepted as-is</option>
                  <option value="Flagged">Flagged</option>
                </FilterSelect>
                {/* Review status filter */}
                <FilterSelect
                  value={recordFilters.reviewStatus}
                  onChange={(e) => setRecordFilters((prev) => ({ ...prev, reviewStatus: e.target.value }))}
                >
                  <option value="">All review status</option>
                  <option value="Not reviewed">Not reviewed</option>
                  <option value="Reviewed">Reviewed</option>
                  <option value="Approved">Approved</option>
                </FilterSelect>
                {/* Subject filter */}
                <FilterSelect
                  value={recordFilters.subjectId}
                  onChange={(e) => setRecordFilters((prev) => ({ ...prev, subjectId: e.target.value }))}
                >
                  <option value="">All subjects</option>
                  {uniqueSubjects.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </FilterSelect>
              </div>
            </FilterBar>
          )}

          {/* Bottom table — Affected Records */}
          {selectedRule ? (
            <ViewSection
              mode="flex"
              title={`Affected records (${filteredRecords.length})`}
              expandGen={expandGen}
              collapseGen={collapseGen}
            >
            <div className="h-full overflow-auto">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 z-10 bg-background">
                  {recordTable.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b bg-muted/30">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="relative cursor-pointer select-none px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                          style={recordColStyle(header.id)}
                          onDoubleClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{ asc: " \u2191", desc: " \u2193" }[header.column.getIsSorted() as string] ?? null}
                          </span>
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className={cn(
                              "absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none",
                              header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30"
                            )}
                          />
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {recordTable.getRowModel().rows.map((row) => {
                    const isSelected = selectedIssueId === row.original.issue_id;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "cursor-pointer border-b transition-colors hover:bg-accent/50",
                          isSelected && "bg-accent font-medium"
                        )}
                        onClick={() => {
                          const rec = row.original;
                          setSelectedIssueId(rec.issue_id);
                          onSelectionChange?.({
                            _view: "validation",
                            mode: "issue",
                            rule_id: selectedRule.rule_id,
                            severity: selectedRule.severity,
                            domain: rec.domain,
                            category: selectedRule.category,
                            description: selectedRule.description,
                            records_affected: selectedRule.records_affected,
                            issue_id: rec.issue_id,
                            subject_id: rec.subject_id,
                            visit: rec.visit,
                            variable: rec.variable,
                            actual_value: rec.actual_value,
                            expected_value: rec.expected_value,
                          });
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={cn(
                              "px-1.5 py-px",
                              cell.column.id === RECORD_ABSORBER && !recordColumnSizing[RECORD_ABSORBER] && "overflow-hidden text-ellipsis whitespace-nowrap",
                            )}
                            style={recordColStyle(cell.column.id)}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={recordColumns.length} className="px-4 py-6 text-center text-xs text-muted-foreground">
                        No records match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </ViewSection>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
              Select a rule above to view affected records
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
