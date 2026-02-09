import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState, ColumnSizingState } from "@tanstack/react-table";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { useRuleResults } from "@/hooks/useRuleResults";
import { cn } from "@/lib/utils";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { InsightsList } from "./panes/InsightsList";
import type { LesionSeverityRow, RuleResult } from "@/types/analysis-views";

// ─── Neutral heat color (§6.1 evidence tier) ─────────────
function getNeutralHeatColor(avgSev: number): { bg: string; text: string } {
  if (avgSev >= 4) return { bg: "#4B5563", text: "white" };
  if (avgSev >= 3) return { bg: "#6B7280", text: "white" };
  if (avgSev >= 2) return { bg: "#9CA3AF", text: "var(--foreground)" };
  if (avgSev >= 1) return { bg: "#D1D5DB", text: "var(--foreground)" };
  return { bg: "#E5E7EB", text: "var(--foreground)" };
}

// ─── Public types ──────────────────────────────────────────

export interface HistopathSelection {
  finding: string;
  specimen: string;
  sex?: string;
}

// ─── Derived data types ────────────────────────────────────

interface SpecimenSummary {
  specimen: string;
  findingCount: number;
  adverseCount: number;
  maxSeverity: number;
  totalAffected: number;
  totalN: number;
  domains: string[];
}

interface FindingSummary {
  finding: string;
  maxSeverity: number;
  maxIncidence: number;
  totalAffected: number;
  totalN: number;
  severity: "adverse" | "warning" | "normal";
}

// ─── Helpers ───────────────────────────────────────────────

function deriveSpecimenSummaries(data: LesionSeverityRow[]): SpecimenSummary[] {
  const map = new Map<string, {
    findings: Set<string>;
    adverseFindings: Set<string>;
    maxSev: number;
    totalAffected: number;
    totalN: number;
    domains: Set<string>;
  }>();

  for (const row of data) {
    if (!row.specimen) continue; // skip rows with null specimen (e.g. CL domain findings)
    let entry = map.get(row.specimen);
    if (!entry) {
      entry = { findings: new Set(), adverseFindings: new Set(), maxSev: 0, totalAffected: 0, totalN: 0, domains: new Set() };
      map.set(row.specimen, entry);
    }
    entry.findings.add(row.finding);
    if (row.severity === "adverse") entry.adverseFindings.add(row.finding);
    if ((row.avg_severity ?? 0) > entry.maxSev) entry.maxSev = row.avg_severity ?? 0;
    entry.totalAffected += row.affected;
    entry.totalN += row.n;
    entry.domains.add(row.domain);
  }

  const summaries: SpecimenSummary[] = [];
  for (const [specimen, entry] of map) {
    summaries.push({
      specimen,
      findingCount: entry.findings.size,
      adverseCount: entry.adverseFindings.size,
      maxSeverity: entry.maxSev,
      totalAffected: entry.totalAffected,
      totalN: entry.totalN,
      domains: [...entry.domains].sort(),
    });
  }

  return summaries.sort((a, b) =>
    b.maxSeverity - a.maxSeverity ||
    b.adverseCount - a.adverseCount ||
    b.findingCount - a.findingCount
  );
}

function deriveFindingSummaries(rows: LesionSeverityRow[]): FindingSummary[] {
  const map = new Map<string, {
    maxSev: number;
    maxIncidence: number;
    totalAffected: number;
    totalN: number;
    severity: "adverse" | "warning" | "normal";
  }>();

  for (const row of rows) {
    let entry = map.get(row.finding);
    if (!entry) {
      entry = { maxSev: 0, maxIncidence: 0, totalAffected: 0, totalN: 0, severity: "normal" };
      map.set(row.finding, entry);
    }
    if ((row.avg_severity ?? 0) > entry.maxSev) entry.maxSev = row.avg_severity ?? 0;
    if ((row.incidence ?? 0) > entry.maxIncidence) entry.maxIncidence = row.incidence ?? 0;
    entry.totalAffected += row.affected;
    entry.totalN += row.n;
    // Escalate severity
    if (row.severity === "adverse") entry.severity = "adverse";
    else if (row.severity === "warning" && entry.severity !== "adverse") entry.severity = "warning";
  }

  const summaries: FindingSummary[] = [];
  for (const [finding, entry] of map) {
    summaries.push({
      finding,
      maxSeverity: entry.maxSev,
      maxIncidence: entry.maxIncidence,
      totalAffected: entry.totalAffected,
      totalN: entry.totalN,
      severity: entry.severity,
    });
  }

  return summaries.sort((a, b) => b.maxSeverity - a.maxSeverity);
}

// ─── Specimen-level intelligence helpers ─────────────────────

function deriveSexLabel(rows: LesionSeverityRow[]): string {
  const sexes = new Set(rows.map((r) => r.sex));
  if (sexes.size === 1) {
    const s = [...sexes][0];
    return s === "M" ? "Male only" : s === "F" ? "Female only" : `${s} only`;
  }
  return "Both sexes";
}

function getDoseConsistency(rows: LesionSeverityRow[]): "Weak" | "Moderate" | "Strong" {
  // Group by finding, then check dose-incidence monotonicity
  const byFinding = new Map<string, Map<number, { affected: number; n: number }>>();
  for (const r of rows) {
    let findingMap = byFinding.get(r.finding);
    if (!findingMap) {
      findingMap = new Map();
      byFinding.set(r.finding, findingMap);
    }
    const existing = findingMap.get(r.dose_level);
    if (existing) {
      existing.affected += r.affected;
      existing.n += r.n;
    } else {
      findingMap.set(r.dose_level, { affected: r.affected, n: r.n });
    }
  }

  let monotonic = 0;
  let doseGroupsAffected = new Set<number>();
  for (const [, doseMap] of byFinding) {
    const sorted = [...doseMap.entries()].sort((a, b) => a[0] - b[0]);
    const incidences = sorted.map(([, v]) => (v.n > 0 ? v.affected / v.n : 0));
    // Check if incidence is non-decreasing (monotonic)
    let isMonotonic = true;
    for (let i = 1; i < incidences.length; i++) {
      if (incidences[i] < incidences[i - 1] - 0.001) {
        isMonotonic = false;
        break;
      }
    }
    if (isMonotonic) monotonic++;
    for (const [dl, v] of sorted) {
      if (v.affected > 0) doseGroupsAffected.add(dl);
    }
  }

  const totalFindings = byFinding.size;
  if (totalFindings === 0) return "Weak";

  const monotonePct = monotonic / totalFindings;
  if (monotonePct > 0.5 && doseGroupsAffected.size >= 3) return "Strong";
  if (monotonePct > 0 || doseGroupsAffected.size >= 2) return "Moderate";
  return "Weak";
}

function deriveSpecimenConclusion(
  summary: SpecimenSummary,
  specimenData: LesionSeverityRow[],
  specimenRules: RuleResult[]
): string {
  const maxIncidencePct = summary.totalN > 0
    ? ((summary.totalAffected / summary.totalN) * 100).toFixed(0)
    : "0";

  // Incidence characterization
  const incidenceDesc = Number(maxIncidencePct) > 50
    ? "high-incidence" : Number(maxIncidencePct) > 20
    ? "moderate-incidence" : "low-incidence";

  // Severity characterization
  const sevDesc = summary.adverseCount > 0
    ? `max severity ${summary.maxSeverity.toFixed(1)}`
    : "non-adverse";

  // Sex
  const sexDesc = deriveSexLabel(specimenData).toLowerCase();

  // Dose relationship: check for R01/R04 presence or compute dose consistency
  const hasDoseRule = specimenRules.some((r) => r.rule_id === "R01" || r.rule_id === "R04");
  let doseDesc: string;
  if (hasDoseRule) {
    doseDesc = "with dose-related increase";
  } else {
    const consistency = getDoseConsistency(specimenData);
    doseDesc = consistency === "Strong"
      ? "with dose-related trend"
      : "without dose-related increase";
  }

  return `${incidenceDesc}, ${sevDesc}, ${sexDesc}, ${doseDesc}.`;
}

// ─── SpecimenRailItem ──────────────────────────────────────

function SpecimenRailItem({
  summary,
  isSelected,
  maxGlobalSeverity,
  onClick,
}: {
  summary: SpecimenSummary;
  isSelected: boolean;
  maxGlobalSeverity: number;
  onClick: () => void;
}) {
  const barWidth = maxGlobalSeverity > 0
    ? Math.max(4, (summary.maxSeverity / maxGlobalSeverity) * 100)
    : 0;

  return (
    <button
      className={cn(
        "w-full text-left border-b border-border/40 px-3 py-2.5 transition-colors",
        "border-l-2 border-l-transparent",
        isSelected
          ? "bg-blue-50/60 dark:bg-blue-950/20"
          : "hover:bg-accent/30"
      )}
      onClick={onClick}
    >
      {/* Row 1: specimen name + finding count */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">
          {summary.specimen.replace(/_/g, " ")}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {summary.findingCount}
        </span>
      </div>

      {/* Row 2: severity bar (neutral) */}
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-[#E5E7EB]">
          <div
            className="h-full rounded-full bg-[#D1D5DB] transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {summary.maxSeverity.toFixed(1)}
        </span>
      </div>

      {/* Row 3: stats + domain chips */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>{summary.findingCount} findings</span>
        <span>&middot;</span>
        <span>{summary.adverseCount} adverse</span>
        {summary.domains.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70">
            {d}
          </span>
        ))}
      </div>
    </button>
  );
}

// ─── SpecimenRail ──────────────────────────────────────────

function SpecimenRail({
  specimens,
  selectedSpecimen,
  maxGlobalSeverity,
  onSpecimenClick,
}: {
  specimens: SpecimenSummary[];
  selectedSpecimen: string | null;
  maxGlobalSeverity: number;
  onSpecimenClick: (specimen: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return specimens;
    const q = search.toLowerCase();
    return specimens.filter((s) => s.specimen.replace(/_/g, " ").toLowerCase().includes(q));
  }, [specimens, search]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="border-b px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Specimens ({specimens.length})
        </span>
        <input
          type="text"
          placeholder="Search specimens\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((s) => (
          <SpecimenRailItem
            key={s.specimen}
            summary={s}
            isSelected={selectedSpecimen === s.specimen}
            maxGlobalSeverity={maxGlobalSeverity}
            onClick={() => onSpecimenClick(s.specimen)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            No matches for &ldquo;{search}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SpecimenHeader ────────────────────────────────────────

function SpecimenHeader({
  summary,
  specimenData,
  specimenRules,
}: {
  summary: SpecimenSummary;
  specimenData: LesionSeverityRow[];
  specimenRules: RuleResult[];
}) {
  const sexLabel = useMemo(() => deriveSexLabel(specimenData), [specimenData]);
  const conclusion = useMemo(
    () => deriveSpecimenConclusion(summary, specimenData, specimenRules),
    [summary, specimenData, specimenRules]
  );

  return (
    <div className="shrink-0 border-b px-4 py-3">
      {/* Title + badges */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {summary.specimen.replace(/_/g, " ")}
        </h3>
        {summary.adverseCount > 0 && (
          <span className="rounded border border-border px-1 text-[10px] font-medium uppercase text-muted-foreground">
            {summary.adverseCount} adverse
          </span>
        )}
        <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">
          {sexLabel}
        </span>
        {/* TODO: Derive from useAnnotations<PathologyReview> — aggregate peerReviewStatus across specimen findings */}
        <span className="rounded border border-border/50 px-1 text-[10px] text-muted-foreground/60">
          Preliminary
        </span>
      </div>

      {/* 1-line conclusion */}
      <p className="mt-1 text-[11px] italic leading-relaxed text-muted-foreground">
        {conclusion}
      </p>

      {/* Compact metrics */}
      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        <div>
          <span className="text-muted-foreground">Max severity: </span>
          <span className="font-mono text-[10px] font-medium">
            {summary.maxSeverity.toFixed(1)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Total affected: </span>
          <span className="font-medium">{summary.totalAffected}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Findings: </span>
          <span className="font-medium">{summary.findingCount}</span>
        </div>
      </div>
    </div>
  );
}

// ─── OverviewTab ───────────────────────────────────────────

function OverviewTab({
  specimenData,
  findingSummaries,
  specimenRules,
  specimen,
  studyId,
  selection,
  onFindingClick,
}: {
  specimenData: LesionSeverityRow[];
  findingSummaries: FindingSummary[];
  specimenRules: RuleResult[];
  specimen: string;
  studyId: string | undefined;
  selection: HistopathSelection | null;
  onFindingClick: (finding: string) => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {/* Finding summary */}
      <div className="mb-4">
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Observed findings
        </h4>
        {findingSummaries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No findings for this specimen.</p>
        ) : (
          <div className="space-y-1">
            {findingSummaries.map((fs) => {
              const isSelected = selection?.finding === fs.finding && selection?.specimen === specimen;
              return (
                <button
                  key={fs.finding}
                  className={cn(
                    "flex w-full items-center gap-2 rounded border border-border/30 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/30",
                    isSelected && "bg-accent ring-1 ring-primary"
                  )}
                  onClick={() => onFindingClick(fs.finding)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium" title={fs.finding}>
                    {fs.finding.length > 40 ? fs.finding.slice(0, 40) + "\u2026" : fs.finding}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {fs.maxSeverity.toFixed(1)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {fs.totalAffected}/{fs.totalN}
                  </span>
                  <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                    {fs.severity}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Insights */}
      {specimenRules.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Insights
          </h4>
          <InsightsList rules={specimenRules} />
        </div>
      )}

      {/* Cross-view links */}
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Related views
        </h4>
        <div className="space-y-1 text-[11px]">
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`, { state: { organ_system: specimen } });
            }}
          >
            View in Target Organs &#x2192;
          </a>
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: specimen } });
            }}
          >
            View dose-response &#x2192;
          </a>
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: specimen } });
            }}
          >
            View NOAEL decision &#x2192;
          </a>
        </div>
      </div>

      {specimenData.length === 0 && findingSummaries.length === 0 && (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No data for this specimen.
        </div>
      )}
    </div>
  );
}

// ─── SeverityMatrixTab ─────────────────────────────────────

const col = createColumnHelper<LesionSeverityRow>();

function SeverityMatrixTab({
  specimenData,
  selection,
  onRowClick,
  onHeatmapClick,
  sexFilter,
  setSexFilter,
  minSeverity,
  setMinSeverity,
}: {
  specimenData: LesionSeverityRow[];
  selection: HistopathSelection | null;
  onRowClick: (row: LesionSeverityRow) => void;
  onHeatmapClick: (finding: string) => void;
  sexFilter: string | null;
  setSexFilter: (v: string | null) => void;
  minSeverity: number;
  setMinSeverity: (v: number) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  // Filtered data
  const filteredData = useMemo(() => {
    return specimenData.filter((row) => {
      if (sexFilter && row.sex !== sexFilter) return false;
      if ((row.avg_severity ?? 0) < minSeverity) return false;
      return true;
    });
  }, [specimenData, sexFilter, minSeverity]);

  // Heatmap data
  const heatmapData = useMemo(() => {
    if (!filteredData.length) return null;
    const doseLevels = [...new Set(filteredData.map((r) => r.dose_level))].sort((a, b) => a - b);
    const doseLabels = new Map<number, string>();
    for (const r of filteredData) {
      if (!doseLabels.has(r.dose_level)) {
        doseLabels.set(r.dose_level, r.dose_label.split(",")[0]);
      }
    }

    const findingMaxSev = new Map<string, number>();
    for (const r of filteredData) {
      const existing = findingMaxSev.get(r.finding) ?? 0;
      if ((r.avg_severity ?? 0) > existing) findingMaxSev.set(r.finding, r.avg_severity ?? 0);
    }
    const findings = [...findingMaxSev.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f]) => f);

    const cells = new Map<string, { incidence: number; avg_severity: number; affected: number; n: number }>();
    for (const r of filteredData) {
      const key = `${r.finding}|${r.dose_level}`;
      const existing = cells.get(key);
      if (existing) {
        existing.affected += r.affected;
        existing.n += r.n;
        existing.incidence = existing.n > 0 ? existing.affected / existing.n : 0;
        existing.avg_severity = Math.max(existing.avg_severity, r.avg_severity ?? 0);
      } else {
        cells.set(key, {
          incidence: r.incidence,
          avg_severity: r.avg_severity ?? 0,
          affected: r.affected,
          n: r.n,
        });
      }
    }

    return { doseLevels, doseLabels, findings, cells };
  }, [filteredData]);

  const columns = useMemo(
    () => [
      col.accessor("finding", {
        header: "Finding",
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 25 ? info.getValue().slice(0, 25) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      col.accessor("domain", { header: "Domain" }),
      col.accessor("dose_level", {
        header: "Dose",
        cell: (info) => (
          <span className="text-muted-foreground">{info.row.original.dose_label.split(",")[0]}</span>
        ),
      }),
      col.accessor("sex", { header: "Sex" }),
      col.accessor("n", { header: "N" }),
      col.accessor("affected", { header: "Affected" }),
      col.accessor("incidence", {
        header: "Incidence",
        cell: (info) => {
          const v = info.getValue();
          return (
            <span className="font-mono">
              {v != null ? (v * 100).toFixed(0) + "%" : "\u2014"}
            </span>
          );
        },
      }),
      col.accessor("avg_severity", {
        header: "Avg sev",
        cell: (info) => {
          const v = info.getValue();
          if (v == null) return <span className="text-muted-foreground">{"\u2014"}</span>;
          return (
            <span className="font-mono text-[10px]">
              {v.toFixed(1)}
            </span>
          );
        },
      }),
      col.accessor("severity", {
        header: "Severity",
        cell: (info) => (
          <span className="inline-block rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={sexFilter ?? ""}
          onChange={(e) => setSexFilter(e.target.value || null)}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={minSeverity}
          onChange={(e) => setMinSeverity(Number(e.target.value))}
        >
          <option value={0}>Min severity: any</option>
          <option value={1}>Min severity: 1+</option>
          <option value={2}>Min severity: 2+</option>
          <option value={3}>Min severity: 3+</option>
        </select>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filteredData.length} of {specimenData.length} rows
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Severity Heatmap */}
        {heatmapData && heatmapData.findings.length > 0 && (
          <div className="border-b p-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Severity heatmap ({heatmapData.findings.length} findings)
              </h2>
              <span className="text-[10px] text-muted-foreground">
                Dose consistency: {getDoseConsistency(specimenData)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <div className="inline-block">
                {/* Header row */}
                <div className="flex">
                  <div className="w-52 shrink-0" />
                  {heatmapData.doseLevels.map((dl) => (
                    <div
                      key={dl}
                      className="w-20 shrink-0 text-center text-[10px] font-medium text-muted-foreground"
                    >
                      {heatmapData.doseLabels.get(dl) ?? `Dose ${dl}`}
                    </div>
                  ))}
                </div>
                {/* Data rows */}
                {heatmapData.findings.map((finding) => (
                  <div
                    key={finding}
                    className={cn(
                      "flex cursor-pointer border-t hover:bg-accent/20",
                      selection?.finding === finding && "ring-1 ring-primary"
                    )}
                    onClick={() => onHeatmapClick(finding)}
                  >
                    <div
                      className="w-52 shrink-0 truncate py-1 pr-2 text-[10px]"
                      title={finding}
                    >
                      {finding.length > 40 ? finding.slice(0, 40) + "\u2026" : finding}
                    </div>
                    {heatmapData.doseLevels.map((dl) => {
                      const cell = heatmapData.cells.get(`${finding}|${dl}`);
                      return (
                        <div
                          key={dl}
                          className="flex h-6 w-20 shrink-0 items-center justify-center"
                        >
                          {cell ? (
                            <div
                              className="flex h-5 w-16 items-center justify-center rounded-sm text-[9px] font-medium"
                              style={{
                                backgroundColor: getNeutralHeatColor(cell.avg_severity ?? 0).bg,
                                color: getNeutralHeatColor(cell.avg_severity ?? 0).text,
                              }}
                              title={`Severity: ${cell.avg_severity != null ? cell.avg_severity.toFixed(1) : "N/A"}, Incidence: ${cell.affected}/${cell.n}`}
                            >
                              {cell.affected}/{cell.n}
                            </div>
                          ) : (
                            <div className="h-5 w-16 rounded-sm bg-gray-100" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            {/* Legend */}
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>Severity:</span>
              {[
                { label: "Minimal", color: "#E5E7EB" },
                { label: "Mild", color: "#D1D5DB" },
                { label: "Moderate", color: "#9CA3AF" },
                { label: "Marked", color: "#6B7280" },
                { label: "Severe", color: "#4B5563" },
              ].map(({ label, color }) => (
                <span key={label} className="flex items-center gap-0.5">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Grid — collapsible */}
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between px-4 pt-3 pb-1 list-none [&::-webkit-details-marker]:hidden">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Details ({filteredData.length} rows)
            </h2>
            <span className="text-[10px] text-muted-foreground transition-transform group-open:rotate-90">&#x25B6;</span>
          </summary>
          <div className="overflow-x-auto">
            <table className="text-xs" style={{ width: table.getCenterTotalSize(), tableLayout: "fixed" }}>
              <thead className="sticky top-0 z-10 bg-background">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b bg-muted/50">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="relative cursor-pointer px-2 py-1.5 text-left font-medium hover:bg-accent/50"
                        style={{ width: header.getSize() }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " \u25b2", desc: " \u25bc" }[header.column.getIsSorted() as string] ?? ""}
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
                {table.getRowModel().rows.slice(0, 200).map((row) => {
                  const orig = row.original;
                  const isSelected =
                    selection?.finding === orig.finding && selection?.specimen === orig.specimen;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "cursor-pointer border-b transition-colors hover:bg-accent/50",
                        isSelected && "bg-accent"
                      )}
                      onClick={() => onRowClick(orig)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-2 py-1" style={{ width: cell.column.getSize() }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredData.length > 200 && (
              <div className="p-2 text-center text-[10px] text-muted-foreground">
                Showing first 200 of {filteredData.length} rows. Use filters to narrow results.
              </div>
            )}
            {filteredData.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No rows match the current filters.
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}

// ─── Main: HistopathologyView ──────────────────────────────

type EvidenceTab = "overview" | "matrix";

export function HistopathologyView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: HistopathSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { data: lesionData, isLoading, error } = useLesionSeveritySummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  const [selectedSpecimen, setSelectedSpecimen] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("overview");
  const [selection, setSelection] = useState<HistopathSelection | null>(null);
  const [sexFilter, setSexFilter] = useState<string | null>(null);
  const [minSeverity, setMinSeverity] = useState(0);
  const { width: railWidth, onPointerDown: onRailResize } = useResizePanel(300, 180, 500);

  // Derived: specimen summaries
  const specimenSummaries = useMemo(() => {
    if (!lesionData) return [];
    return deriveSpecimenSummaries(lesionData);
  }, [lesionData]);

  const maxGlobalSeverity = useMemo(() => {
    if (specimenSummaries.length === 0) return 1;
    return Math.max(...specimenSummaries.map((s) => s.maxSeverity), 0.01);
  }, [specimenSummaries]);

  // Rows for selected specimen
  const specimenData = useMemo(() => {
    if (!lesionData || !selectedSpecimen) return [];
    return lesionData.filter((r) => r.specimen === selectedSpecimen);
  }, [lesionData, selectedSpecimen]);

  // Finding summaries for selected specimen
  const findingSummaries = useMemo(() => {
    return deriveFindingSummaries(specimenData);
  }, [specimenData]);

  // Selected specimen summary
  const selectedSummary = useMemo(() => {
    if (!selectedSpecimen) return null;
    return specimenSummaries.find((s) => s.specimen === selectedSpecimen) ?? null;
  }, [specimenSummaries, selectedSpecimen]);

  // Rules scoped to selected specimen (shared with SpecimenHeader and OverviewTab)
  const specimenRules = useMemo(() => {
    if (!ruleResults?.length || !selectedSpecimen) return [];
    const specLower = selectedSpecimen.toLowerCase();
    const specKey = specLower.replace(/[, ]+/g, "_");
    return ruleResults.filter(
      (r) =>
        r.output_text.toLowerCase().includes(specLower) ||
        r.context_key.toLowerCase().includes(specKey) ||
        r.organ_system.toLowerCase() === specLower
    );
  }, [ruleResults, selectedSpecimen]);

  // Auto-select top specimen on load
  useEffect(() => {
    if (specimenSummaries.length > 0 && selectedSpecimen === null) {
      const top = specimenSummaries[0].specimen;
      setSelectedSpecimen(top);
      const sel = { finding: "", specimen: top };
      onSelectionChange?.({ finding: "", specimen: top });
      // Don't set finding-level selection; just set specimen for context panel awareness
      void sel;
    }
  }, [specimenSummaries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-view navigation from location.state
  useEffect(() => {
    const state = location.state as { organ_system?: string; specimen?: string } | null;
    if (state && lesionData) {
      const specimenTarget = state.specimen ?? state.organ_system ?? null;
      if (specimenTarget) {
        // Find matching specimen (case-insensitive)
        const match = specimenSummaries.find(
          (s) => s.specimen.toLowerCase() === specimenTarget.toLowerCase()
        );
        if (match) {
          setSelectedSpecimen(match.specimen);
        }
      }
      window.history.replaceState({}, "");
    }
  }, [location.state, lesionData, specimenSummaries]);

  // Escape clears selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelection(null);
        onSelectionChange?.(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelectionChange]);

  const handleSpecimenClick = (specimen: string) => {
    setSelectedSpecimen(specimen);
    setSexFilter(null);
    setMinSeverity(0);
    setSelection(null);
    onSelectionChange?.(null);
  };

  const handleRowClick = (row: LesionSeverityRow) => {
    const sel: HistopathSelection = {
      finding: row.finding,
      specimen: row.specimen,
      sex: row.sex,
    };
    const isSame = selection?.finding === sel.finding && selection?.specimen === sel.specimen;
    const next = isSame ? null : sel;
    setSelection(next);
    onSelectionChange?.(next);
  };

  const handleHeatmapClick = (finding: string) => {
    if (!selectedSpecimen) return;
    const row = specimenData.find((r) => r.finding === finding);
    if (row) {
      const sel: HistopathSelection = { finding, specimen: row.specimen };
      const isSame = selection?.finding === finding;
      const next = isSame ? null : sel;
      setSelection(next);
      onSelectionChange?.(next);
    }
  };

  const handleFindingClick = (finding: string) => {
    if (!selectedSpecimen) return;
    const sel: HistopathSelection = { finding, specimen: selectedSpecimen };
    const isSame = selection?.finding === finding && selection?.specimen === selectedSpecimen;
    const next = isSame ? null : sel;
    setSelection(next);
    onSelectionChange?.(next);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">Analysis data not available</h1>
          <p className="text-sm text-red-600">Run the generator to produce analysis data:</p>
          <code className="mt-2 block rounded bg-red-100 px-3 py-1.5 text-xs text-red-800">
            cd backend && python -m generator.generate {studyId}
          </code>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading histopathology data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden max-[1200px]:flex-col">
      {/* Left: Specimen rail */}
      <div
        className="shrink-0 border-r max-[1200px]:h-[180px] max-[1200px]:!w-full max-[1200px]:border-b max-[1200px]:overflow-x-auto"
        style={{ width: railWidth }}
      >
        <SpecimenRail
          specimens={specimenSummaries}
          selectedSpecimen={selectedSpecimen}
          maxGlobalSeverity={maxGlobalSeverity}
          onSpecimenClick={handleSpecimenClick}
        />
      </div>
      <div className="max-[1200px]:hidden">
        <PanelResizeHandle onPointerDown={onRailResize} />
      </div>

      {/* Right: Evidence panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/5">
        {selectedSummary && (
          <>
            {/* Summary header */}
            <SpecimenHeader summary={selectedSummary} specimenData={specimenData} specimenRules={specimenRules} />

            {/* Tab bar */}
            <div className="flex shrink-0 items-center gap-0 border-b px-4">
              <button
                className={cn(
                  "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                  activeTab === "overview"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab("overview")}
              >
                Overview
              </button>
              <button
                className={cn(
                  "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                  activeTab === "matrix"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab("matrix")}
              >
                Severity matrix
              </button>
            </div>

            {/* Tab content */}
            {activeTab === "overview" ? (
              <OverviewTab
                specimenData={specimenData}
                findingSummaries={findingSummaries}
                specimenRules={specimenRules}
                specimen={selectedSpecimen!}
                studyId={studyId}
                selection={selection}
                onFindingClick={handleFindingClick}
              />
            ) : (
              <SeverityMatrixTab
                specimenData={specimenData}
                selection={selection}
                onRowClick={handleRowClick}
                onHeatmapClick={handleHeatmapClick}
                sexFilter={sexFilter}
                setSexFilter={setSexFilter}
                minSeverity={minSeverity}
                setMinSeverity={setMinSeverity}
              />
            )}
          </>
        )}

        {!selectedSummary && specimenSummaries.length > 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a specimen to view histopathology details.
          </div>
        )}

        {specimenSummaries.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No histopathology data available.
          </div>
        )}
      </div>
    </div>
  );
}
