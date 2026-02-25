import { useState, useMemo, useEffect } from "react";
import { useSessionState } from "@/hooks/useSessionState";
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
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useValidationResults } from "@/hooks/useValidationResults";
import type { ValidationRuleResult } from "@/hooks/useValidationResults";
import { useValidationCatalog } from "@/hooks/useValidationCatalog";
import { useAffectedRecords } from "@/hooks/useAffectedRecords";
import type { AffectedRecordData } from "@/hooks/useAffectedRecords";
import type { ValidationRecordReview } from "@/types/annotations";

// ── Types ──────────────────────────────────────────────────────────────

// Category-specific evidence for Finding section rendering
export type RecordEvidence =
  | { type: "value-correction"; from: string; to: string }
  | { type: "value-correction-multi"; from: string; candidates: string[] }
  | { type: "code-mapping"; value: string; code: string }
  | { type: "range-check"; lines: { label: string; value: string }[] }
  | { type: "missing-value"; variable: string; derivation?: string; suggested?: string; lines?: { label: string; value: string }[] }
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

// ── Bottom table columns ───────────────────────────────────────────────

const recordColumnHelper = createColumnHelper<RecordRowData>();

// ── Component ──────────────────────────────────────────────────────────

interface Props {
  studyId?: string;
  onSelectionChange?: (sel: ValidationViewSelection | null) => void;
  viewSelection?: ValidationViewSelection | null;
}

export function ValidationView({ studyId, onSelectionChange, viewSelection }: Props) {
  const [recordSorting, setRecordSorting] = useSessionState<SortingState>("pcc.validation.recordSorting", []);
  const [recordColumnSizing, setRecordColumnSizing] = useSessionState<ColumnSizingState>("pcc.validation.recordColumnSizing", {});
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [recordFilters, setRecordFilters] = useState<{ fixStatus: string; reviewStatus: string; subjectId: string }>({ fixStatus: "", reviewStatus: "", subjectId: "" });

  // Derive selected rule from viewSelection (set by rail via context)
  const { data: validationData, isLoading: resultsLoading } = useValidationResults(studyId);
  // Catalog has ALL rules (triggered + clean + disabled) with full detail
  const { data: catalogData } = useValidationCatalog(studyId);
  const selectedRule = useMemo<ValidationRuleResult | null>(() => {
    if (!viewSelection || viewSelection._view !== "validation") return null;
    if (viewSelection.mode !== "rule" && viewSelection.mode !== "issue") return null;
    // First try triggered results (most detail for triggered rules)
    const fromResults = validationData?.rules?.find((r) => r.rule_id === viewSelection.rule_id);
    if (fromResults) return fromResults;
    // Second: try full catalog (has detail for clean/disabled/CORE rules)
    const fromCatalog = catalogData?.rules?.find((r) => r.rule_id === viewSelection.rule_id);
    if (fromCatalog) return fromCatalog;
    // Last resort: reconstruct from viewSelection
    return {
      rule_id: viewSelection.rule_id,
      severity: viewSelection.severity,
      domain: viewSelection.domain,
      category: viewSelection.category,
      description: viewSelection.description,
      records_affected: viewSelection.records_affected,
      standard: "",
      section: "",
      rationale: "",
      how_to_fix: "",
      cdisc_reference: null,
      source: viewSelection.rule_id.startsWith("CORE-") ? "core" as const : "custom" as const,
      status: viewSelection.records_affected > 0 ? "triggered" as const : "clean" as const,
    };
  }, [viewSelection, validationData, catalogData]);

  // Catalog stats for header bar (catalogData already fetched above)
  const catalogStats = useMemo(() => {
    const rules = catalogData?.rules ?? [];
    const total = rules.length;
    const enabled = rules.filter((r) => r.status !== "disabled").length;
    const triggered = rules.filter((r) => r.status === "triggered").length;
    const summary = catalogData?.summary;
    let lastRun: { ago: number; elapsed: number | undefined } | null = null;
    if (summary?.validated_at) {
      const d = new Date(summary.validated_at);
      lastRun = {
        ago: Math.round((Date.now() - d.getTime()) / 60000),
        elapsed: summary.elapsed_seconds,
      };
    }
    return { total, enabled, triggered, lastRun };
  }, [catalogData]);

  const { data: affectedData } = useAffectedRecords(studyId, selectedRule?.rule_id);

  // Load record annotations
  const { data: recordAnnotations } = useAnnotations<ValidationRecordReview>(studyId, "validation-records");

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

  // Reset record filters when rule changes
  useEffect(() => {
    setSelectedIssueId(null);
    setRecordFilters({ fixStatus: "", reviewStatus: "", subjectId: "" });
  }, [selectedRule?.rule_id]);

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

  // Record table
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

  // Absorber pattern
  const RECORD_ABSORBER = "actual_value";
  function recordColStyle(colId: string) {
    const manualWidth = recordColumnSizing[colId];
    if (manualWidth) return { width: manualWidth, maxWidth: manualWidth };
    if (colId === RECORD_ABSORBER) return undefined;
    return { width: 1, whiteSpace: "nowrap" as const };
  }

  // ── Loading state ──
  if (resultsLoading) {
    return (
      <div className="flex h-full flex-col">
        <CatalogStatsBar stats={catalogStats} />
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading validation results...
        </div>
      </div>
    );
  }

  // ── No results state ──
  if (!validationData) {
    return (
      <div className="flex h-full flex-col">
        <CatalogStatsBar stats={catalogStats} />
        <div className="flex flex-1 items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>No validation results available. Use the RUN button in the rule rail.</span>
        </div>
      </div>
    );
  }

  // ── No rule selected ──
  if (!selectedRule) {
    return (
      <div className="flex h-full flex-col">
        <CatalogStatsBar stats={catalogStats} />
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Select a rule in the left panel to view affected records
        </div>
      </div>
    );
  }

  // ── Clean rule selected ──
  if (selectedRule.status === "clean") {
    return (
      <div className="flex h-full flex-col">
        <CatalogStatsBar stats={catalogStats} />
        <RuleHeader rule={selectedRule} recordCount={0} />
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          This rule passed — no issues detected.
        </div>
      </div>
    );
  }

  // ── Disabled rule selected ──
  if (selectedRule.status === "disabled") {
    return (
      <div className="flex h-full flex-col">
        <CatalogStatsBar stats={catalogStats} />
        <RuleHeader rule={selectedRule} recordCount={0} />
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          This rule is disabled. Enable it in the context panel to run checks.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CatalogStatsBar stats={catalogStats} />
      {/* Rule header bar */}
      <RuleHeader rule={selectedRule} recordCount={filteredRecords.length} />

      {/* Record filter bar */}
      <FilterBar>
        <span className="text-xs font-medium">
          {recordFilters.fixStatus || recordFilters.reviewStatus || recordFilters.subjectId
            ? <>{filteredRecords.length} of {recordRows.length} record{recordRows.length !== 1 ? "s" : ""}</>
            : <>{filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}</>
          }
        </span>
        <div className="ml-auto flex items-center gap-1.5">
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
          <FilterSelect
            value={recordFilters.reviewStatus}
            onChange={(e) => setRecordFilters((prev) => ({ ...prev, reviewStatus: e.target.value }))}
          >
            <option value="">All review status</option>
            <option value="Not reviewed">Not reviewed</option>
            <option value="Reviewed">Reviewed</option>
            <option value="Approved">Approved</option>
          </FilterSelect>
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

      {/* Records table — full height */}
      <div className="min-h-0 flex-1 overflow-auto">
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
    </div>
  );
}

// ── Catalog stats bar (always visible at top of center panel) ────────────

function CatalogStatsBar({ stats }: {
  stats: { total: number; enabled: number; triggered: number; lastRun: { ago: number; elapsed: number | undefined } | null };
}) {
  return (
    <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-1.5">
      <span className="text-[10px] text-muted-foreground">
        {stats.total} rules &middot; {stats.enabled} enabled &middot;{" "}
        {stats.triggered} triggered
      </span>
      {stats.lastRun && (
        <span className="text-[10px] text-muted-foreground">
          Last run: {stats.lastRun.ago}m ago
          {stats.lastRun.elapsed != null && ` (${stats.lastRun.elapsed}s)`}
        </span>
      )}
    </div>
  );
}

// ── Rule header bar (shown when a rule is selected) ─────────────────────

function RuleHeader({ rule, recordCount }: { rule: ValidationRuleResult; recordCount: number }) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-2">
      <span className="font-mono text-xs font-semibold">{rule.rule_id}</span>
      <span
        className="border-l-2 pl-1.5 text-[10px] font-semibold text-gray-600"
        style={{ borderLeftColor: SEVERITY_BORDER_COLORS[rule.severity] ?? "#6B7280" }}
      >
        {rule.severity}
      </span>
      <DomainLabel domain={rule.domain} />
      <span className="text-xs text-muted-foreground">{rule.description}</span>
      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
        {recordCount} rec
      </span>
    </div>
  );
}
