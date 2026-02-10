import { useState, useMemo, useEffect } from "react";
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
import { DomainLabel } from "@/components/ui/DomainLabel";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useValidationResults } from "@/hooks/useValidationResults";
import type { ValidationRuleResult } from "@/hooks/useValidationResults";
import { useAffectedRecords } from "@/hooks/useAffectedRecords";
import { useRunValidation } from "@/hooks/useRunValidation";
import type { AffectedRecordData } from "@/hooks/useAffectedRecords";
import type { ValidationRecordReview } from "@/types/annotations";

// ── Types ──────────────────────────────────────────────────────────────

// Category-specific evidence for Finding section rendering
export type RecordEvidence =
  | { type: "value-correction"; from: string; to: string }
  | { type: "value-correction-multi"; from: string; candidates: string[] }
  | { type: "code-mapping"; value: string; code: string }
  | { type: "range-check"; lines: { label: string; value: string }[] }
  | { type: "missing-value"; variable: string; derivation?: string; suggested?: string }
  | { type: "metadata"; lines: { label: string; value: string }[] };

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

const SEVERITY_STYLES: Record<string, string> = {
  Error: "bg-red-100 text-red-800 border-red-200",
  Warning: "bg-amber-100 text-amber-800 border-amber-200",
  Info: "bg-blue-100 text-blue-800 border-blue-200",
};

// ── Fix & Review status badges ─────────────────────────────────────────

export const FIX_STATUS_STYLES: Record<string, string> = {
  "Not fixed": "bg-gray-100 text-gray-600 border-gray-200",
  "Auto-fixed": "bg-teal-100 text-teal-800 border-teal-200",
  "Manually fixed": "bg-green-100 text-green-800 border-green-200",
  "Accepted as-is": "bg-blue-100 text-blue-800 border-blue-200",
  "Flagged": "bg-orange-100 text-orange-800 border-orange-200",
};

export const REVIEW_STATUS_STYLES: Record<string, string> = {
  "Not reviewed": "bg-gray-100 text-gray-600 border-gray-200",
  "Reviewed": "bg-blue-100 text-blue-800 border-blue-200",
  "Approved": "bg-green-100 text-green-800 border-green-200",
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
        <span className={cn("inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold", SEVERITY_STYLES[sev])}>
          {sev}
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
  const [ruleSorting, setRuleSorting] = useState<SortingState>([]);
  const [recordSorting, setRecordSorting] = useState<SortingState>([]);
  const [ruleColumnSizing, setRuleColumnSizing] = useState<ColumnSizingState>({});
  const [recordColumnSizing, setRecordColumnSizing] = useState<ColumnSizingState>({});
  const [selectedRule, setSelectedRule] = useState<ValidationRuleResult | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [recordFilters, setRecordFilters] = useState<{ fixStatus: string; reviewStatus: string; subjectId: string }>({ fixStatus: "", reviewStatus: "", subjectId: "" });
  const [severityFilter, setSeverityFilter] = useState<"" | "Error" | "Warning" | "Info">("");

  // API hooks
  const { data: validationData, isLoading: resultsLoading } = useValidationResults(studyId);
  const { data: affectedData } = useAffectedRecords(studyId, selectedRule?.rule_id);
  const { mutate: runValidation, isPending: isValidating } = useRunValidation(studyId);

  const allRules = validationData?.rules ?? [];
  const rules = severityFilter ? allRules.filter((r) => r.severity === severityFilter) : allRules;

  // Load record annotations
  const { data: recordAnnotations } = useAnnotations<ValidationRecordReview>(studyId, "validation-records");

  // Severity counts from API summary
  const counts = useMemo(() => {
    if (!validationData?.summary) return { errors: 0, warnings: 0, info: 0 };
    return {
      errors: validationData.summary.errors ?? 0,
      warnings: validationData.summary.warnings ?? 0,
      info: validationData.summary.info ?? 0,
    };
  }, [validationData]);

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
          className="font-mono text-xs text-[#3a7bd5] hover:underline"
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

  // ── Loading state ──
  if (resultsLoading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-4 border-b px-4 py-3">
          <h2 className="text-lg font-semibold">SEND Validation</h2>
        </div>
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
        <div className="flex items-center gap-4 border-b px-4 py-3">
          <h2 className="text-lg font-semibold">SEND Validation</h2>
          <button
            className="ml-auto rounded bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={isValidating}
            onClick={() => runValidation()}
          >
            {isValidating ? "RUNNING..." : "RUN VALIDATION"}
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No validation results available for this study.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Summary header */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <h2 className="text-lg font-semibold">SEND Validation</h2>
        <div className="flex items-center gap-3 text-xs">
          <button
            className={cn(
              "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity",
              severityFilter === "Error" && "ring-1 ring-red-300 bg-red-50",
              severityFilter && severityFilter !== "Error" && "opacity-40"
            )}
            onClick={() => setSeverityFilter((prev) => (prev === "Error" ? "" : "Error"))}
            title="Filter by errors"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-red-600" />
            <span className="font-medium">{counts.errors}</span>
            <span className="text-muted-foreground">errors</span>
          </button>
          <button
            className={cn(
              "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity",
              severityFilter === "Warning" && "ring-1 ring-amber-300 bg-amber-50",
              severityFilter && severityFilter !== "Warning" && "opacity-40"
            )}
            onClick={() => setSeverityFilter((prev) => (prev === "Warning" ? "" : "Warning"))}
            title="Filter by warnings"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-amber-600" />
            <span className="font-medium">{counts.warnings}</span>
            <span className="text-muted-foreground">warnings</span>
          </button>
          <button
            className={cn(
              "flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-opacity",
              severityFilter === "Info" && "ring-1 ring-blue-300 bg-blue-50",
              severityFilter && severityFilter !== "Info" && "opacity-40"
            )}
            onClick={() => setSeverityFilter((prev) => (prev === "Info" ? "" : "Info"))}
            title="Filter by info"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />
            <span className="font-medium">{counts.info}</span>
            <span className="text-muted-foreground">info</span>
          </button>
          {validationData.summary.elapsed_seconds != null && (
            <span className="text-muted-foreground">
              ({validationData.summary.elapsed_seconds}s)
            </span>
          )}
        </div>
        <button
          className="ml-auto rounded bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={isValidating}
          onClick={() => runValidation()}
        >
          {isValidating ? "RUNNING..." : "RUN VALIDATION"}
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          {severityFilter && allRules.length > 0 ? (
            <>
              <span>No {severityFilter.toLowerCase()} rules found.</span>
              <button
                className="rounded border px-2 py-1 text-xs hover:bg-muted/50"
                onClick={() => setSeverityFilter("")}
              >
                Show all
              </button>
            </>
          ) : (
            <span>No validation issues found. Dataset passed all checks.</span>
          )}
        </div>
      ) : (
        <>
          {/* Top table — Rule Summary (40%) */}
          <div className="flex-[4] overflow-auto border-b">
            <table className="text-sm" style={{ width: ruleTable.getCenterTotalSize(), tableLayout: "fixed" }}>
              <thead className="sticky top-0 z-10 bg-background">
                {ruleTable.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b bg-muted/50">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="relative cursor-pointer select-none border-b px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        style={{ width: header.getSize() }}
                        onClick={header.column.getToggleSortingHandler()}
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
                        isSelected && "bg-accent"
                      )}
                      onClick={() => handleRuleClick(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-2 py-1 text-xs" style={{ width: cell.column.getSize() }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Divider bar */}
          {selectedRule && (
            <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
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
                <select
                  className="rounded border bg-background px-2 py-1 text-xs"
                  value={recordFilters.fixStatus}
                  onChange={(e) => setRecordFilters((prev) => ({ ...prev, fixStatus: e.target.value }))}
                >
                  <option value="">Fix status</option>
                  <option value="Not fixed">Not fixed</option>
                  <option value="Auto-fixed">Auto-fixed</option>
                  <option value="Manually fixed">Manually fixed</option>
                  <option value="Accepted as-is">Accepted as-is</option>
                  <option value="Flagged">Flagged</option>
                </select>
                {/* Review status filter */}
                <select
                  className="rounded border bg-background px-2 py-1 text-xs"
                  value={recordFilters.reviewStatus}
                  onChange={(e) => setRecordFilters((prev) => ({ ...prev, reviewStatus: e.target.value }))}
                >
                  <option value="">Review status</option>
                  <option value="Not reviewed">Not reviewed</option>
                  <option value="Reviewed">Reviewed</option>
                  <option value="Approved">Approved</option>
                </select>
                {/* Subject filter */}
                <select
                  className="rounded border bg-background px-2 py-1 text-xs"
                  value={recordFilters.subjectId}
                  onChange={(e) => setRecordFilters((prev) => ({ ...prev, subjectId: e.target.value }))}
                >
                  <option value="">Subject</option>
                  {uniqueSubjects.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Bottom table — Affected Records (60%) */}
          {selectedRule ? (
            <div className="flex-[6] overflow-auto">
              <table className="text-sm" style={{ width: recordTable.getCenterTotalSize(), tableLayout: "fixed" }}>
                <thead className="sticky top-0 z-10 bg-background">
                  {recordTable.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b bg-muted/50">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="relative cursor-pointer select-none border-b px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                          style={{ width: header.getSize() }}
                          onClick={header.column.getToggleSortingHandler()}
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
                          isSelected && "bg-accent"
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
                          <td key={cell.id} className="px-2 py-1 text-xs" style={{ width: cell.column.getSize() }}>
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
          ) : (
            <div className="flex flex-[6] items-center justify-center text-xs text-muted-foreground">
              Select a rule above to view affected records
            </div>
          )}
        </>
      )}
    </div>
  );
}
