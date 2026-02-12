import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Loader2, Microscope, BarChart3, Users, TrendingUp, Search, Plus, Pin, Info } from "lucide-react";
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
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import { useAnnotations } from "@/hooks/useAnnotations";
import { cn } from "@/lib/utils";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { EvidenceBar } from "@/components/ui/EvidenceBar";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { getDoseGroupColor, getNeutralHeatColor as getNeutralHeatColor01 } from "@/lib/severity-colors";
import { useResizePanel, useResizePanelY } from "@/hooks/useResizePanel";
import { PanelResizeHandle, HorizontalResizeHandle } from "@/components/ui/PanelResizeHandle";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { CollapseAllButtons } from "@/components/analysis/panes/CollapseAllButtons";
import type { LesionSeverityRow, RuleResult } from "@/types/analysis-views";
import type { SubjectHistopathEntry } from "@/types/timecourse";
import type { PathologyReview } from "@/types/annotations";

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
  doseConsistency: "Weak" | "Moderate" | "Strong";
}

interface FindingSummary {
  finding: string;
  maxSeverity: number;
  maxIncidence: number;
  totalAffected: number;
  totalN: number;
  severity: "adverse" | "warning" | "normal";
}

interface FindingTableRow extends FindingSummary {
  isDoseDriven: boolean;
  relatedOrgans: string[] | undefined;
}

const findingColHelper = createColumnHelper<FindingTableRow>();

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
    const specimenRows = data.filter((r) => r.specimen === specimen);
    summaries.push({
      specimen,
      findingCount: entry.findings.size,
      adverseCount: entry.adverseFindings.size,
      maxSeverity: entry.maxSev,
      totalAffected: entry.totalAffected,
      totalN: entry.totalN,
      domains: [...entry.domains].sort(),
      doseConsistency: getDoseConsistency(specimenRows),
    });
  }

  // Risk-density weighted sort: severity (2x) + adverse count (1.5x) + dose consistency weight
  const doseWeight = (c: "Weak" | "Moderate" | "Strong") =>
    c === "Strong" ? 2 : c === "Moderate" ? 1 : 0;
  const riskScore = (s: SpecimenSummary) =>
    (s.maxSeverity * 2) + (s.adverseCount * 1.5) + doseWeight(s.doseConsistency);

  return summaries.sort((a, b) => riskScore(b) - riskScore(a) || b.findingCount - a.findingCount);
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
  const doseGroupsAffected = new Set<number>();
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

/** Per-finding dose consistency: filters rows to one finding, groups by dose_level, checks monotonicity. */
function getFindingDoseConsistency(rows: LesionSeverityRow[], finding: string): "Weak" | "Moderate" | "Strong" {
  const findingRows = rows.filter((r) => r.finding === finding);
  const doseMap = new Map<number, { affected: number; n: number }>();
  for (const r of findingRows) {
    const existing = doseMap.get(r.dose_level);
    if (existing) {
      existing.affected += r.affected;
      existing.n += r.n;
    } else {
      doseMap.set(r.dose_level, { affected: r.affected, n: r.n });
    }
  }
  const sorted = [...doseMap.entries()].sort((a, b) => a[0] - b[0]);
  if (sorted.length < 2) return "Weak";

  const incidences = sorted.map(([, v]) => (v.n > 0 ? v.affected / v.n : 0));
  let isMonotonic = true;
  for (let i = 1; i < incidences.length; i++) {
    if (incidences[i] < incidences[i - 1] - 0.001) {
      isMonotonic = false;
      break;
    }
  }

  const doseGroupsAffected = sorted.filter(([, v]) => v.affected > 0).length;
  if (isMonotonic && doseGroupsAffected >= 3) return "Strong";
  if (isMonotonic || doseGroupsAffected >= 2) return "Moderate";
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

// ─── Review status aggregation ────────────────────────────

type SpecimenReviewStatus = "Preliminary" | "In review" | "Confirmed" | "Revised";

function deriveSpecimenReviewStatus(
  findingNames: string[],
  reviews: Record<string, PathologyReview> | undefined
): SpecimenReviewStatus {
  if (!reviews || findingNames.length === 0) return "Preliminary";
  const statuses = findingNames.map(f => reviews[f]?.peerReviewStatus ?? "Not Reviewed");
  if (statuses.every(s => s === "Not Reviewed")) return "Preliminary";
  if (statuses.some(s => s === "Disagreed")) return "Revised";
  if (statuses.every(s => s === "Agreed")) return "Confirmed";
  return "In review";
}

const REVIEW_STATUS_STYLES: Record<SpecimenReviewStatus, string> = {
  "Preliminary": "border-border/50 text-muted-foreground/60",
  "In review": "border-border text-muted-foreground/80",
  "Confirmed": "border-border text-muted-foreground",
  "Revised": "border-border text-muted-foreground",
};

const REVIEW_STATUS_TOOLTIPS: Record<SpecimenReviewStatus, string> = {
  "Preliminary": "No peer review recorded yet",
  "In review": "Some findings reviewed, others pending",
  "Confirmed": "All findings agreed by peer reviewer",
  "Revised": "One or more findings disagreed by peer reviewer",
};

// ─── SpecimenRailItem ──────────────────────────────────────

function SpecimenRailItem({
  summary,
  isSelected,
  maxGlobalSeverity,
  onClick,
  reviewStatus,
}: {
  summary: SpecimenSummary;
  isSelected: boolean;
  maxGlobalSeverity: number;
  onClick: () => void;
  reviewStatus?: SpecimenReviewStatus;
}) {
  return (
    <button
      className={cn(
        "w-full text-left border-b border-border/40 px-2.5 py-1.5 transition-colors",
        "border-l-2 border-l-transparent",
        isSelected
          ? "bg-blue-50/60 dark:bg-blue-950/20"
          : "hover:bg-accent/30"
      )}
      onClick={onClick}
    >
      {/* Row 1: specimen name + dose trend glyph + review indicator + finding count */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">
          {summary.specimen.replace(/_/g, " ")}
        </span>
        {summary.doseConsistency === "Strong" && (
          <span className="text-[9px] text-muted-foreground" title="Strong dose trend">{"\u25B2"}</span>
        )}
        {summary.doseConsistency === "Moderate" && (
          <span className="text-[9px] text-muted-foreground/70" title="Moderate dose trend">{"\u25B4"}</span>
        )}
        {reviewStatus === "Confirmed" && (
          <span className="text-[9px] text-muted-foreground" title="All findings confirmed">{"\u2713"}</span>
        )}
        {reviewStatus === "Revised" && (
          <span className="text-[9px] text-muted-foreground" title="Findings revised">{"\u007E"}</span>
        )}
        <span className="text-[10px] text-muted-foreground" title={`${summary.findingCount} findings observed`}>
          {summary.findingCount}
        </span>
      </div>

      {/* Row 2: severity bar (neutral, fill darkness encodes severity) */}
      <div title={`Max severity: ${summary.maxSeverity.toFixed(1)} (scale 1\u20135)`}>
        <EvidenceBar
          value={summary.maxSeverity}
          max={maxGlobalSeverity}
          label={summary.maxSeverity.toFixed(1)}
          labelClassName="text-muted-foreground"
          fillColor={getNeutralHeatColor(summary.maxSeverity).bg}
        />
      </div>

      {/* Row 3: stats + domain chips */}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] text-muted-foreground">
        <span>{summary.findingCount} findings</span>
        <span>&middot;</span>
        <span>
          {summary.adverseCount} adverse
          {summary.findingCount > 0 && ` (${Math.round((summary.adverseCount / summary.findingCount) * 100)}%)`}
        </span>
        {summary.domains.map((d) => (
          <DomainLabel key={d} domain={d} />
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
  pathReviews,
  findingNamesBySpecimen,
}: {
  specimens: SpecimenSummary[];
  selectedSpecimen: string | null;
  maxGlobalSeverity: number;
  onSpecimenClick: (specimen: string) => void;
  pathReviews?: Record<string, PathologyReview>;
  findingNamesBySpecimen?: Map<string, string[]>;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return specimens;
    const q = search.toLowerCase();
    return specimens.filter((s) => s.specimen.replace(/_/g, " ").toLowerCase().includes(q));
  }, [specimens, search]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="border-b px-2.5 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Specimens ({specimens.length})
        </span>
        <input
          type="text"
          placeholder="Search specimens\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1 w-full rounded border bg-background px-2 py-0.5 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
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
            reviewStatus={findingNamesBySpecimen ? deriveSpecimenReviewStatus(findingNamesBySpecimen.get(s.specimen) ?? [], pathReviews) : undefined}
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
  pathReviews,
  findingNames,
}: {
  summary: SpecimenSummary;
  specimenData: LesionSeverityRow[];
  specimenRules: RuleResult[];
  pathReviews?: Record<string, PathologyReview>;
  findingNames: string[];
}) {
  const sexLabel = useMemo(() => deriveSexLabel(specimenData), [specimenData]);
  const conclusion = useMemo(
    () => deriveSpecimenConclusion(summary, specimenData, specimenRules),
    [summary, specimenData, specimenRules]
  );
  // Merge domains from lesion data + rule results for complete coverage
  const allDomains = useMemo(() => {
    const set = new Set(summary.domains);
    for (const r of specimenRules) {
      const m = r.context_key.match(/^([A-Z]{2})_/);
      if (m) set.add(m[1]);
    }
    return [...set].sort();
  }, [summary.domains, specimenRules]);

  return (
    <div className="shrink-0 border-b px-4 py-2">
      {/* Title + badges */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {summary.specimen.replace(/_/g, " ")}
        </h3>
        {summary.adverseCount > 0 && (
          <span className="rounded-sm border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
            {summary.adverseCount} adverse
          </span>
        )}
        <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">
          {sexLabel}
        </span>
        {(() => {
          const reviewStatus = deriveSpecimenReviewStatus(findingNames, pathReviews);
          return (
            <span
              className={cn("rounded border px-1 py-0.5 text-[10px]", REVIEW_STATUS_STYLES[reviewStatus])}
              title={`Review status: ${REVIEW_STATUS_TOOLTIPS[reviewStatus]}`}
            >
              {reviewStatus}
            </span>
          );
        })()}
      </div>

      {/* Domain subtitle */}
      {allDomains.length > 0 && (
        <div className="mt-0.5 flex items-center gap-1">
          {allDomains.map((d) => (
            <DomainLabel key={d} domain={d} />
          ))}
        </div>
      )}

      {/* 1-line conclusion */}
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
        {conclusion}
      </p>

      {/* Structured metrics */}
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Incidence</span>
          <span className="font-mono text-[10px] font-medium">
            {summary.totalAffected}/{summary.totalN}
            {summary.totalN > 0 && ` (${Math.round((summary.totalAffected / summary.totalN) * 100)}%)`}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Max severity</span>
          <span className={cn(
            "font-mono text-[10px]",
            summary.maxSeverity >= 3.0 ? "font-semibold" : "font-medium"
          )}>
            {summary.maxSeverity.toFixed(1)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Dose trend</span>
          <span className="font-mono text-[10px] font-medium">{summary.doseConsistency}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Adverse</span>
          <span className="font-mono text-[10px] font-medium">
            {summary.adverseCount}/{summary.findingCount}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Sex scope</span>
          <span className="text-[10px] font-medium">{sexLabel}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Findings</span>
          <span className="font-mono text-[10px] font-medium">{summary.findingCount}</span>
        </div>
      </div>
    </div>
  );
}

// ─── OverviewTab ───────────────────────────────────────────

function OverviewTab({
  specimenData,
  findingSummaries,
  allRuleResults,
  specimen,
  selection,
  onFindingClick,
  onHeatmapClick,
  sexFilter,
  setSexFilter,
  minSeverity,
  setMinSeverity,
  studyId,
  onSubjectClick,
}: {
  specimenData: LesionSeverityRow[];
  findingSummaries: FindingSummary[];
  allRuleResults: RuleResult[];
  specimen: string;
  selection: HistopathSelection | null;
  onFindingClick: (finding: string) => void;
  onHeatmapClick: (finding: string) => void;
  sexFilter: string | null;
  setSexFilter: (v: string | null) => void;
  minSeverity: number;
  setMinSeverity: (v: number) => void;
  studyId?: string;
  onSubjectClick?: (usubjid: string) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [findingColSizing, setFindingColSizing] = useState<ColumnSizingState>({});
  const [heatmapView, setHeatmapView] = useState<"severity" | "incidence">("severity");
  const [matrixMode, setMatrixMode] = useState<"group" | "subject">("group");
  const [affectedOnly, setAffectedOnly] = useState(true);
  const [subjectSort, setSubjectSort] = useState<"dose" | "severity">("dose");
  const [doseGroupFilter, setDoseGroupFilter] = useState<string | null>(null);
  const { height: findingsHeight, onPointerDown: onResizeY } = useResizePanelY(200, 80, 500);

  // Reset heatmap view state when specimen changes
  useEffect(() => {
    setAffectedOnly(true);
    setMatrixMode("group");
    setSubjectSort("dose");
    setDoseGroupFilter(null);
  }, [specimen]);

  // Subject-level data (fetch when in subject mode)
  const { data: subjData, isLoading: subjLoading } = useHistopathSubjects(
    matrixMode === "subject" ? studyId : undefined,
    matrixMode === "subject" ? (specimen ?? null) : null,
  );

  // Available dose groups for filter (from subject data), separated main vs recovery
  const availableDoseGroups = useMemo(() => {
    if (!subjData?.subjects) return { main: [] as [number, string][], recovery: [] as [number, string][] };
    const mainGroups = new Map<number, string>();
    const recoveryGroups = new Map<number, string>();
    for (const s of subjData.subjects) {
      const target = s.is_recovery ? recoveryGroups : mainGroups;
      if (!target.has(s.dose_level)) target.set(s.dose_level, s.dose_label);
    }
    return {
      main: [...mainGroups.entries()].sort((a, b) => a[0] - b[0]),
      recovery: [...recoveryGroups.entries()].sort((a, b) => a[0] - b[0]),
    };
  }, [subjData]);

  // Per-finding dose consistency
  const findingConsistency = useMemo(() => {
    const map = new Map<string, "Weak" | "Moderate" | "Strong">();
    for (const fs of findingSummaries) {
      map.set(fs.finding, getFindingDoseConsistency(specimenData, fs.finding));
    }
    return map;
  }, [findingSummaries, specimenData]);

  // Per-finding cross-organ coherence (R16)
  const findingRelatedOrgans = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!allRuleResults.length || !specimen) return map;
    const specLower = specimen.toLowerCase();
    const otherR16 = allRuleResults.filter(
      (r) => r.rule_id === "R16" && r.organ_system.toLowerCase() !== specLower
    );
    for (const fs of findingSummaries) {
      const findingLower = fs.finding.toLowerCase();
      const organs: string[] = [];
      for (const rule of otherR16) {
        if (rule.output_text.toLowerCase().includes(findingLower)) {
          if (!organs.includes(rule.organ_system)) organs.push(rule.organ_system);
        }
      }
      if (organs.length > 0) map.set(fs.finding, organs);
    }
    return map;
  }, [allRuleResults, specimen, findingSummaries]);

  // Filtered data for group heatmap (respects shared sex/severity filters)
  const filteredData = useMemo(() => {
    return specimenData.filter((row) => {
      if (sexFilter && row.sex !== sexFilter) return false;
      if ((row.avg_severity ?? 0) < minSeverity) return false;
      return true;
    });
  }, [specimenData, sexFilter, minSeverity]);

  // Group-level heatmap data
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

  // Combined table data
  const tableData = useMemo<FindingTableRow[]>(
    () =>
      findingSummaries.map((fs) => ({
        ...fs,
        isDoseDriven: findingConsistency.get(fs.finding) === "Strong",
        relatedOrgans: findingRelatedOrgans.get(fs.finding),
      })),
    [findingSummaries, findingConsistency, findingRelatedOrgans]
  );

  const findingColumns = useMemo(
    () => [
      findingColHelper.accessor("finding", {
        header: "Finding",
        size: 160,
        minSize: 100,
        maxSize: 300,
        cell: (info) => {
          const v = info.getValue();
          return (
            <div className="flex items-center gap-1.5 overflow-hidden">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: getNeutralHeatColor(info.row.original.maxSeverity).bg }}
              />
              <span className="truncate font-medium" title={v}>{v}</span>
            </div>
          );
        },
      }),
      findingColHelper.accessor("maxSeverity", {
        header: "Sev",
        size: 40,
        minSize: 35,
        maxSize: 70,
        cell: (info) => (
          <span
            className="font-mono text-[10px] text-muted-foreground"
            title={`Max severity: ${info.getValue().toFixed(1)} (scale 1\u20135)`}
          >
            {info.getValue().toFixed(1)}
          </span>
        ),
      }),
      findingColHelper.display({
        id: "incidence",
        header: "Incid.",
        size: 48,
        minSize: 40,
        maxSize: 80,
        cell: (info) => {
          const r = info.row.original;
          return (
            <span
              className="font-mono text-[10px] text-muted-foreground"
              title={`${r.totalAffected} affected of ${r.totalN}`}
            >
              {r.totalAffected}/{r.totalN}
            </span>
          );
        },
      }),
      findingColHelper.accessor("severity", {
        header: "Class",
        size: 60,
        minSize: 48,
        maxSize: 100,
        cell: (info) => (
          <span className="rounded-sm border border-border px-1 py-px text-[9px] font-medium text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
      findingColHelper.accessor("isDoseDriven", {
        header: "Dose-driven",
        size: 78,
        minSize: 50,
        maxSize: 120,
        cell: (info) =>
          info.getValue() ? (
            <span
              className="text-muted-foreground"
              title="Incidence increases monotonically with dose across 3+ groups"
            >
              ✓
            </span>
          ) : null,
      }),
      findingColHelper.accessor("relatedOrgans", {
        header: "Also in",
        size: 160,
        minSize: 60,
        maxSize: 400,
        cell: (info) => {
          const organs = info.getValue();
          if (!organs) return null;
          const text = organs.join(", ");
          return (
            <span
              className="block truncate text-[9px] italic text-muted-foreground/60"
              title={`Cross-organ coherence (R16): also observed in ${text}`}
            >
              {text}
            </span>
          );
        },
      }),
    ],
    []
  );

  const findingsTable = useReactTable({
    data: tableData,
    columns: findingColumns,
    state: { sorting, columnSizing: findingColSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setFindingColSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top: Findings table (resizable height) */}
      <div className="shrink-0 overflow-y-auto px-4 py-2" style={{ height: findingsHeight }}>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Observed findings
        </h4>
        {findingSummaries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No findings for this specimen.</p>
        ) : (
          <table className="w-full text-[11px]" style={{ tableLayout: "fixed" }}>
            <thead className="sticky top-0 z-10 bg-background">
              {findingsTable.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border/40">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={cn(
                        "relative cursor-pointer pb-2 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground/70",
                        header.column.id === "maxSeverity" && "text-right",
                        header.column.id === "incidence" && "text-right",
                        header.column.id === "isDoseDriven" && "text-center",
                      )}
                      style={{ width: header.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: " \u25B2", desc: " \u25BC" }[header.column.getIsSorted() as string] ?? ""}
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
              {findingsTable.getRowModel().rows.map((row) => {
                const orig = row.original;
                const isSelected = selection?.finding === orig.finding && selection?.specimen === specimen;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "cursor-pointer border-b border-border/20 transition-colors hover:bg-accent/30",
                      isSelected && "bg-accent"
                    )}
                    onClick={() => onFindingClick(orig.finding)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          "py-1 pr-2",
                          cell.column.id === "maxSeverity" && "text-right",
                          cell.column.id === "incidence" && "text-right",
                          cell.column.id === "isDoseDriven" && "text-center",
                          cell.column.id === "relatedOrgans" && "overflow-hidden",
                        )}
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Resize handle */}
      <HorizontalResizeHandle onPointerDown={onResizeY} />

      {/* Bottom: Heatmap container (group + subject) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Heatmap content */}
        <div className="flex-1 overflow-auto">
          {matrixMode === "subject" ? (
            <SubjectHeatmap
              subjData={subjData?.subjects ?? null}
              isLoading={subjLoading}
              sexFilter={sexFilter}
              minSeverity={minSeverity}
              selection={selection}
              onHeatmapClick={onHeatmapClick}
              onSubjectClick={onSubjectClick}
              affectedOnly={affectedOnly}
              sortMode={subjectSort}
              doseGroupFilter={doseGroupFilter}
              controls={
                <FilterBar>
                  <div className="flex items-center gap-0.5">
                    {(["group", "subject"] as const).map((mode) => (
                      <button
                        key={mode}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                          matrixMode === mode
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:bg-accent/50"
                        )}
                        onClick={() => setMatrixMode(mode)}
                      >
                        {mode === "group" ? "Group" : "Subject"}
                      </button>
                    ))}
                  </div>
                  <FilterSelect
                    value={sexFilter ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSexFilter(e.target.value || null)}
                  >
                    <option value="">All sexes</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </FilterSelect>
                  <FilterSelect
                    value={minSeverity}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMinSeverity(Number(e.target.value))}
                  >
                    <option value={0}>Min severity: any</option>
                    <option value={1}>Min severity: 1+</option>
                    <option value={2}>Min severity: 2+</option>
                    <option value={3}>Min severity: 3+</option>
                  </FilterSelect>
                  <FilterSelect
                    value={doseGroupFilter ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setDoseGroupFilter(e.target.value || null)
                    }
                  >
                    <option value="">All dose groups</option>
                    {availableDoseGroups.main.map(([level, label]) => (
                      <option key={level} value={String(level)}>
                        {label}
                      </option>
                    ))}
                    {availableDoseGroups.recovery.length > 0 && (
                      <optgroup label="Recovery arms">
                        {availableDoseGroups.recovery.map(([level, label]) => (
                          <option key={`R${level}`} value={`R${level}`}>
                            {label} (Recovery)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </FilterSelect>
                  <FilterSelect
                    value={subjectSort}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSubjectSort(e.target.value as "dose" | "severity")}
                  >
                    <option value="dose">Sort: dose group</option>
                    <option value="severity">Sort: max severity</option>
                  </FilterSelect>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={affectedOnly}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAffectedOnly(e.target.checked)}
                      className="h-3 w-3 rounded border-border"
                    />
                    Affected only
                  </label>
                </FilterBar>
              }
            />
          ) : heatmapData && heatmapData.findings.length > 0 ? (
            <div className="px-4 py-2">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {heatmapView === "incidence" ? "Incidence" : "Severity"} heatmap ({heatmapData.findings.length} findings)
                </h4>
                <span className="text-[10px] text-muted-foreground">
                  Dose consistency: {(() => {
                    const c = getDoseConsistency(specimenData);
                    if (c === "Strong") return "Strong \u25B2\u25B2\u25B2";
                    if (c === "Moderate") return "Moderate \u25B4\u25B4";
                    return "Weak \u00B7";
                  })()}
                </span>
              </div>
              <FilterBar>
                <div className="flex items-center gap-0.5">
                  {(["group", "subject"] as const).map((mode) => (
                    <button
                      key={mode}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                        matrixMode === mode
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-accent/50"
                      )}
                      onClick={() => setMatrixMode(mode)}
                    >
                      {mode === "group" ? "Group" : "Subject"}
                    </button>
                  ))}
                </div>
                <FilterSelect
                  value={sexFilter ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSexFilter(e.target.value || null)}
                >
                  <option value="">All sexes</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </FilterSelect>
                <FilterSelect
                  value={minSeverity}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMinSeverity(Number(e.target.value))}
                >
                  <option value={0}>Min severity: any</option>
                  <option value={1}>Min severity: 1+</option>
                  <option value={2}>Min severity: 2+</option>
                  <option value={3}>Min severity: 3+</option>
                </FilterSelect>
                <div className="flex items-center gap-0.5">
                  {(["severity", "incidence"] as const).map((mode) => (
                    <button
                      key={mode}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                        heatmapView === mode
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-accent/50"
                      )}
                      onClick={() => setHeatmapView(mode)}
                    >
                      {mode === "severity" ? "Severity" : "Incidence"}
                    </button>
                  ))}
                </div>
              </FilterBar>
              <p className="mb-1 text-[10px] text-muted-foreground">
                {heatmapView === "incidence"
                  ? "Cells show % animals affected per dose group."
                  : "Cells show average severity grade per dose group."}
              </p>
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
                        className="w-52 shrink-0 truncate py-0.5 pr-2 text-[10px]"
                        title={finding}
                      >
                        {finding.length > 40 ? finding.slice(0, 40) + "\u2026" : finding}
                      </div>
                      {heatmapData.doseLevels.map((dl) => {
                        const cell = heatmapData.cells.get(`${finding}|${dl}`);
                        if (!cell) {
                          return (
                            <div key={dl} className="flex h-6 w-20 shrink-0 items-center justify-center">
                              <div className="h-5 w-16 rounded-sm bg-gray-100" />
                            </div>
                          );
                        }
                        const cellColors = heatmapView === "incidence"
                          ? getNeutralHeatColor01(cell.incidence)
                          : getNeutralHeatColor(cell.avg_severity ?? 0);
                        const cellLabel = heatmapView === "incidence"
                          ? `${(cell.incidence * 100).toFixed(0)}%`
                          : `${cell.affected}/${cell.n}`;
                        return (
                          <div
                            key={dl}
                            className="flex h-6 w-20 shrink-0 items-center justify-center"
                          >
                            <div
                              className="flex h-5 w-16 items-center justify-center rounded-sm text-[9px] font-medium"
                              style={{
                                backgroundColor: cellColors.bg,
                                color: cellColors.text,
                              }}
                              title={`Severity: ${cell.avg_severity != null ? cell.avg_severity.toFixed(1) : "N/A"}, Incidence: ${cell.affected}/${cell.n}`}
                            >
                              {cellLabel}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              {/* Legend */}
              <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>{heatmapView === "incidence" ? "Incidence:" : "Severity:"}</span>
                {(heatmapView === "incidence"
                  ? [
                      { label: "1\u201319%", color: "#E5E7EB" },
                      { label: "20\u201339%", color: "#D1D5DB" },
                      { label: "40\u201359%", color: "#9CA3AF" },
                      { label: "60\u201379%", color: "#6B7280" },
                      { label: "80\u2013100%", color: "#4B5563" },
                    ]
                  : [
                      { label: "Minimal", color: "#E5E7EB" },
                      { label: "Mild", color: "#D1D5DB" },
                      { label: "Moderate", color: "#9CA3AF" },
                      { label: "Marked", color: "#6B7280" },
                      { label: "Severe", color: "#4B5563" },
                    ]
                ).map(({ label, color }) => (
                  <span key={label} className="flex items-center gap-0.5">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-4 py-2">
              <FilterBar>
                <div className="flex items-center gap-0.5">
                  {(["group", "subject"] as const).map((mode) => (
                    <button
                      key={mode}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                        matrixMode === mode
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-accent/50"
                      )}
                      onClick={() => setMatrixMode(mode)}
                    >
                      {mode === "group" ? "Group" : "Subject"}
                    </button>
                  ))}
                </div>
              </FilterBar>
              <div className="py-8 text-center text-xs text-muted-foreground">
                {specimenData.length === 0 ? "No data for this specimen." : "No heatmap data available."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SubjectHeatmap ──────────────────────────────────────
// Subject-level severity matrix: one column per subject, grouped by dose group.
// Cells show severity grade (1-5) color-coded with getNeutralHeatColor().

const SEV_LABELS: Record<number, string> = { 1: "Minimal", 2: "Mild", 3: "Moderate", 4: "Marked", 5: "Severe" };

function SubjectHeatmap({
  subjData,
  isLoading,
  sexFilter,
  minSeverity,
  selection,
  onHeatmapClick,
  onSubjectClick,
  affectedOnly,
  sortMode = "dose",
  doseGroupFilter = null,
  controls,
}: {
  subjData: SubjectHistopathEntry[] | null;
  isLoading: boolean;
  sexFilter: string | null;
  minSeverity: number;
  selection: HistopathSelection | null;
  onHeatmapClick: (finding: string) => void;
  onSubjectClick?: (usubjid: string) => void;
  affectedOnly?: boolean;
  sortMode?: "dose" | "severity";
  doseGroupFilter?: string | null;
  controls?: React.ReactNode;
}) {
  // Selected subject for column highlight
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  // Filter subjects: dose group first (so control subjects survive), then sex, then affected-only
  const subjects = useMemo(() => {
    if (!subjData) return [];
    let filtered = subjData;
    if (doseGroupFilter !== null) {
      // Parse filter: "R0" = recovery dose_level 0, "2" = main dose_level 2
      const isRecoveryFilter = doseGroupFilter.startsWith("R");
      const level = Number(isRecoveryFilter ? doseGroupFilter.slice(1) : doseGroupFilter);
      filtered = filtered.filter((s) => s.dose_level === level && s.is_recovery === isRecoveryFilter);
    }
    if (sexFilter) filtered = filtered.filter((s) => s.sex === sexFilter);
    if (affectedOnly) filtered = filtered.filter((s) => Object.keys(s.findings).length > 0);

    // Sort: main arms first, then recovery; within each category, dose_level ascending
    const recOrd = (s: SubjectHistopathEntry) => (s.is_recovery ? 1 : 0);
    if (sortMode === "severity") {
      return [...filtered].sort((a, b) => {
        const r = recOrd(a) - recOrd(b);
        if (r !== 0) return r;
        if (a.dose_level !== b.dose_level) return a.dose_level - b.dose_level;
        const aMax = Math.max(0, ...Object.values(a.findings).map((f) => f.severity_num));
        const bMax = Math.max(0, ...Object.values(b.findings).map((f) => f.severity_num));
        return bMax - aMax || a.usubjid.localeCompare(b.usubjid);
      });
    }
    // Default: recovery last, dose_level asc, then sex, then usubjid
    return [...filtered].sort(
      (a, b) =>
        recOrd(a) - recOrd(b) ||
        a.dose_level - b.dose_level ||
        a.sex.localeCompare(b.sex) ||
        a.usubjid.localeCompare(b.usubjid),
    );
  }, [subjData, sexFilter, affectedOnly, sortMode, doseGroupFilter]);

  // All unique findings (rows) — filter by minSeverity
  const findings = useMemo(() => {
    if (!subjects.length) return [];
    const findingMaxSev = new Map<string, number>();
    for (const subj of subjects) {
      for (const [finding, val] of Object.entries(subj.findings)) {
        const sev = val.severity_num;
        const existing = findingMaxSev.get(finding) ?? 0;
        if (sev > existing) findingMaxSev.set(finding, sev);
      }
    }
    return [...findingMaxSev.entries()]
      .filter(([, maxSev]) => maxSev >= minSeverity)
      .sort((a, b) => b[1] - a[1])
      .map(([f]) => f);
  }, [subjects, minSeverity]);

  // Group subjects by dose level + recovery status
  const doseGroups = useMemo(() => {
    const groups: { doseLevel: number; doseLabel: string; isRecovery: boolean; subjects: typeof subjects }[] = [];
    let currentKey = "";
    for (const subj of subjects) {
      const key = `${subj.is_recovery ? "R" : ""}${subj.dose_level}`;
      if (key !== currentKey) {
        currentKey = key;
        const label = subj.is_recovery ? `${subj.dose_label} (Recovery)` : subj.dose_label;
        groups.push({ doseLevel: subj.dose_level, doseLabel: label, isRecovery: subj.is_recovery, subjects: [] });
      }
      groups[groups.length - 1].subjects.push(subj);
    }
    return groups;
  }, [subjects]);

  const shortId = (id: string) => {
    const parts = id.split("-");
    return parts[parts.length - 1] || id.slice(-4);
  };

  // Empty state message (null = show matrix)
  const emptyMessage = isLoading
    ? null
    : !subjData || subjects.length === 0
      ? "Subject-level data not available for this specimen."
      : findings.length === 0
        ? "No findings match the current filters."
        : null;

  return (
    <div className="border-b p-3">
      {/* Header — always visible so user sees context */}
      <div className="mb-1.5 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Subject-level matrix{!isLoading && subjData ? ` (${findings.length} findings)` : ""}
        </h2>
        {!isLoading && subjects.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {subjects.length} subjects across {doseGroups.length} dose groups &middot; Scroll horizontally &rarr;
          </span>
        )}
      </div>

      {/* Controls — always visible so user can adjust filters */}
      {controls}

      {/* Loading spinner */}
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading subject data&hellip;</span>
        </div>
      ) : emptyMessage ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (<>

      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Tier 1: Dose group headers */}
          <div className="flex">
            <div className="w-52 shrink-0" /> {/* Finding label column spacer */}
            {doseGroups.map((dg, gi) => (
              <div
                key={dg.doseLevel}
                className={cn(
                  "flex-shrink-0 border-b",
                  gi > 0 && "border-l-2 border-border"
                )}
              >
                <div className="text-center" style={{ width: dg.subjects.length * 32 }}>
                  <div
                    className="h-0.5"
                    style={{ backgroundColor: getDoseGroupColor(dg.doseLevel) }}
                  />
                  <div className="px-1 py-0.5 text-[10px] font-semibold">
                    {dg.doseLabel} ({dg.subjects.length})
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tier 2: Subject IDs */}
          <div className="flex">
            <div className="w-52 shrink-0 py-0.5 text-right pr-2 text-[8px] font-semibold text-muted-foreground">
              Subject ID
            </div>
            {doseGroups.map((dg, gi) => (
              <div key={dg.doseLevel} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                {dg.subjects.map((subj) => (
                  <button
                    key={subj.usubjid}
                    className={cn(
                      "w-8 shrink-0 py-0.5 text-center font-mono text-[9px] text-muted-foreground hover:bg-accent/30",
                      selectedSubject === subj.usubjid && "bg-blue-50/50"
                    )}
                    title={`${subj.usubjid} — click to view details`}
                    onClick={() => {
                      const next = selectedSubject === subj.usubjid ? null : subj.usubjid;
                      setSelectedSubject(next);
                      if (next) onSubjectClick?.(next);
                    }}
                  >
                    {shortId(subj.usubjid)}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Sex indicator row */}
          {!sexFilter && (
            <div className="flex">
              <div className="w-52 shrink-0 py-0.5 text-right pr-2 text-[8px] font-semibold text-muted-foreground">
                Sex
              </div>
              {doseGroups.map((dg, gi) => (
                <div key={dg.doseLevel} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                  {dg.subjects.map((subj) => (
                    <div
                      key={subj.usubjid}
                      className={cn(
                        "flex h-4 w-8 shrink-0 items-center justify-center text-[8px] font-semibold",
                        selectedSubject === subj.usubjid && "bg-blue-50/50",
                        subj.sex === "M" ? "text-blue-600" : "text-red-600"
                      )}
                    >
                      {subj.sex}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Examined row */}
          <div className="flex border-b bg-muted/20">
            <div className="w-52 shrink-0 py-0.5 text-right pr-2 text-[9px] text-muted-foreground">
              Examined
            </div>
            {doseGroups.map((dg, gi) => (
              <div key={dg.doseLevel} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                {dg.subjects.map((subj) => {
                  const hasAny = Object.keys(subj.findings).length > 0;
                  return (
                    <div
                      key={subj.usubjid}
                      className={cn(
                        "flex h-4 w-8 shrink-0 items-center justify-center text-[9px] text-muted-foreground",
                        selectedSubject === subj.usubjid && "bg-blue-50/50"
                      )}
                      title={hasAny ? `${subj.usubjid}: examined, has findings` : `${subj.usubjid}: no findings recorded`}
                    >
                      {hasAny ? "E" : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Data rows — one per finding */}
          {findings.map((finding) => (
            <div
              key={finding}
              className={cn(
                "flex cursor-pointer border-t hover:bg-accent/20",
                selection?.finding === finding && "ring-1 ring-primary"
              )}
              onClick={() => onHeatmapClick(finding)}
            >
              {/* Finding label — sticky */}
              <div
                className="sticky left-0 z-10 w-52 shrink-0 truncate bg-background py-0.5 pr-2 text-[10px]"
                title={finding}
              >
                {finding.length > 40 ? finding.slice(0, 40) + "\u2026" : finding}
              </div>
              {/* Cells per dose group */}
              {doseGroups.map((dg, gi) => (
                <div key={dg.doseLevel} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                  {dg.subjects.map((subj) => {
                    const entry = subj.findings[finding];
                    const sevNum = entry?.severity_num ?? 0;
                    const hasEntry = !!entry;
                    const colors = sevNum > 0 ? getNeutralHeatColor(sevNum) : null;

                    return (
                      <div
                        key={subj.usubjid}
                        className={cn(
                          "flex h-6 w-8 shrink-0 items-center justify-center",
                          selectedSubject === subj.usubjid && "bg-blue-50/50"
                        )}
                        title={
                          hasEntry
                            ? `${subj.usubjid}: ${finding} \u2014 ${entry.severity ?? SEV_LABELS[sevNum] ?? "N/A"}`
                            : `${subj.usubjid}: not observed`
                        }
                      >
                        {sevNum > 0 ? (
                          <div
                            className="flex h-5 w-6 items-center justify-center rounded-sm font-mono text-[9px]"
                            style={{ backgroundColor: colors!.bg, color: colors!.text }}
                          >
                            {sevNum}
                          </div>
                        ) : hasEntry ? (
                          <span className="text-[9px] text-muted-foreground">&mdash;</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>Severity:</span>
        {[
          { label: "1 Minimal", color: "#E5E7EB" },
          { label: "2 Mild", color: "#D1D5DB" },
          { label: "3 Moderate", color: "#9CA3AF" },
          { label: "4 Marked", color: "#6B7280" },
          { label: "5 Severe", color: "#4B5563" },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-0.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
        <span className="ml-2">&mdash; = examined, no finding</span>
        <span className="ml-2">blank = not examined</span>
      </div>
      </>)}
    </div>
  );
}

// ─── MetricsTab ──────────────────────────────────────────

const col = createColumnHelper<LesionSeverityRow>();

function MetricsTab({
  specimenData,
  selection,
  onRowClick,
  sexFilter,
  setSexFilter,
  minSeverity,
  setMinSeverity,
}: {
  specimenData: LesionSeverityRow[];
  selection: HistopathSelection | null;
  onRowClick: (row: LesionSeverityRow) => void;
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

  const columns = useMemo(
    () => [
      col.accessor("finding", {
        header: "Finding",
        size: 200,
        minSize: 120,
        maxSize: 400,
        cell: (info) => (
          <span className="truncate" title={info.getValue()}>
            {info.getValue().length > 30 ? info.getValue().slice(0, 30) + "\u2026" : info.getValue()}
          </span>
        ),
      }),
      col.accessor("domain", { header: "Domain", size: 55, minSize: 40, maxSize: 80 }),
      col.accessor("dose_level", {
        header: "Dose",
        size: 80,
        minSize: 60,
        maxSize: 120,
        cell: (info) => (
          <span className="text-muted-foreground">{info.row.original.dose_label.split(",")[0]}</span>
        ),
      }),
      col.accessor("sex", { header: "Sex", size: 40, minSize: 32, maxSize: 60 }),
      col.accessor("n", { header: "N", size: 40, minSize: 32, maxSize: 60 }),
      col.accessor("affected", { header: "Aff.", size: 45, minSize: 36, maxSize: 70 }),
      col.accessor("incidence", {
        header: () => (
          <span className="inline-flex items-center gap-0.5">
            Incid.
            <span title="Incidence = affected / N per dose group × sex. Numerator: subjects with at least one finding record. Denominator: total subjects in the group. Filtered by current sex and severity filters.">
              <Info className="inline h-2.5 w-2.5 text-muted-foreground/50" />
            </span>
          </span>
        ),
        size: 60,
        minSize: 50,
        maxSize: 90,
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
        size: 60,
        minSize: 50,
        maxSize: 90,
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
        size: 72,
        minSize: 60,
        maxSize: 120,
        cell: (info) => (
          <span className="inline-block rounded-sm border border-border px-1 py-px text-[10px] font-medium text-muted-foreground">
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
      <FilterBar>
        <FilterSelect
          value={sexFilter ?? ""}
          onChange={(e) => setSexFilter(e.target.value || null)}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </FilterSelect>
        <FilterSelect
          value={minSeverity}
          onChange={(e) => setMinSeverity(Number(e.target.value))}
        >
          <option value={0}>Min severity: any</option>
          <option value={1}>Min severity: 1+</option>
          <option value={2}>Min severity: 2+</option>
          <option value={3}>Min severity: 3+</option>
        </FilterSelect>
      </FilterBar>

      {/* Details grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/50">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="relative cursor-pointer px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
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
                    <td key={cell.id} className="px-1.5 py-0.5" style={{ width: cell.column.getSize() }}>
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
    </div>
  );
}

// ─── Hypotheses tab — specimen-level exploratory tools ──────

type SpecimenToolIntent = "severity" | "treatment" | "peer" | "doseTrend";

interface SpecimenTool {
  value: SpecimenToolIntent;
  label: string;
  icon: typeof Microscope;
  available: boolean;
  description: string;
}

const SPECIMEN_TOOLS: SpecimenTool[] = [
  { value: "severity", label: "Severity distribution", icon: BarChart3, available: true, description: "Severity grade distribution across dose groups for this specimen" },
  { value: "treatment", label: "Treatment-related assessment", icon: Microscope, available: true, description: "Evaluate whether findings are treatment-related or incidental" },
  { value: "peer", label: "Peer comparison", icon: Users, available: false, description: "Compare against historical control incidence data" },
  { value: "doseTrend", label: "Dose-severity trend", icon: TrendingUp, available: true, description: "Severity and incidence changes across dose groups" },
];

const DEFAULT_SPECIMEN_FAVORITES: SpecimenToolIntent[] = ["severity", "treatment"];

function HypViewerPlaceholder({
  icon: Icon,
  viewerType,
  context,
}: {
  icon: typeof Microscope;
  viewerType: string;
  context?: string;
}) {
  return (
    <div className="flex h-28 items-center justify-center rounded-md border bg-muted/30">
      <div className="text-center">
        <Icon className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/25" />
        <p className="text-[11px] text-muted-foreground/50">{viewerType}</p>
        {context && (
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/35">{context}</p>
        )}
      </div>
    </div>
  );
}

function HypConfigLine({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
      {items.map(([k, v]) => (
        <span key={k}>
          <span className="text-muted-foreground">{k}: </span>
          <span className="font-mono text-foreground/70">{v}</span>
        </span>
      ))}
    </div>
  );
}

function HypProductionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] italic text-muted-foreground/60">{children}</p>
  );
}

function SeverityDistributionPlaceholder({ specimenName, findingCount, selectedFinding }: { specimenName: string; findingCount: number; selectedFinding?: string | null }) {
  const context = selectedFinding
    ? `${specimenName} \u00b7 ${findingCount} findings \u00b7 Focus: ${selectedFinding}`
    : `${specimenName} \u00b7 ${findingCount} findings`;
  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={BarChart3} viewerType="DG Bar Chart" context={context} />
      <p className="text-xs text-muted-foreground">
        Distribution of severity grades (1-5) across dose groups for all findings in this specimen.
        Stacked bars show the proportion of each grade per dose level, highlighting dose-related severity escalation.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <HypConfigLine items={[
          ["X", "dose group"],
          ["Y", "finding count"],
          ["Stack", "severity grade (1\u20135)"],
          ["Color", "severity gradient"],
        ]} />
      </div>
    </div>
  );
}

function TreatmentRelatedPlaceholder({ specimenName, selectedFinding }: { specimenName: string; selectedFinding?: string | null }) {
  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={Microscope} viewerType="DG Assessment Grid" context={specimenName} />
      <p className="text-xs text-muted-foreground">
        {selectedFinding
          ? `Assess whether \u201c${selectedFinding}\u201d is treatment-related, incidental, or spontaneous. Uses dose-response pattern, historical control incidence, severity progression, and biological plausibility as evidence columns.`
          : "Classification tool for pathologists to assess each finding as treatment-related, incidental, or spontaneous. Uses dose-response pattern, historical control incidence, severity progression, and biological plausibility as evidence columns."}
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <HypConfigLine items={[
          ["Rows", "findings in specimen"],
          ["Columns", "dose pattern, HCD incidence, severity trend, classification"],
          ["Actions", "classify (treatment / incidental / equivocal)"],
          ["Output", "pathologist assessment per finding"],
        ]} />
      </div>
    </div>
  );
}

function PeerComparisonPlaceholder({ specimenName }: { specimenName: string }) {
  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={Users} viewerType="DG Comparative Grid" context={`${specimenName} vs. HCD`} />
      <p className="text-xs text-muted-foreground">
        Compare this specimen&apos;s finding incidences against historical control data (HCD)
        from the same strain and laboratory. Findings with incidence exceeding the HCD range
        are flagged as potentially treatment-related.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <HypConfigLine items={[
          ["Rows", "findings"],
          ["Study incidence", "current study (%)"],
          ["HCD range", "min\u2013max (%) from historical data"],
          ["Flag", "exceeds HCD range"],
        ]} />
      </div>
      <HypProductionNote>
        Requires historical control database integration. Available in production.
      </HypProductionNote>
    </div>
  );
}

function DoseSeverityTrendPlaceholder({ specimenName, selectedFinding }: { specimenName: string; selectedFinding?: string | null }) {
  const context = selectedFinding
    ? `${specimenName} \u00b7 Focus: ${selectedFinding}`
    : specimenName;
  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={TrendingUp} viewerType="DG Line Chart" context={context} />
      <p className="text-xs text-muted-foreground">
        Visualize how average severity and incidence change across dose groups for each finding.
        Monotonic increases support dose-response relationship; non-monotonic patterns may indicate
        threshold effects or incidental findings.
      </p>
      <div className="rounded-md border bg-card p-3">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Viewer settings</p>
        <HypConfigLine items={[
          ["X", "dose level"],
          ["Y (left)", "average severity"],
          ["Y (right)", "incidence (%)"],
          ["Series", "finding"],
        ]} />
      </div>
    </div>
  );
}

function HistopathHypothesesTab({
  specimenName,
  findingCount,
  selectedFinding,
}: {
  specimenName: string;
  findingCount: number;
  selectedFinding?: string | null;
}) {
  const [intent, setIntent] = useState<SpecimenToolIntent>("severity");

  // Auto-switch to treatment assessment when a finding is selected
  useEffect(() => {
    if (selectedFinding) {
      setIntent("treatment");
    }
  }, [selectedFinding]);
  const [favorites, setFavorites] = useState<SpecimenToolIntent[]>(DEFAULT_SPECIMEN_FAVORITES);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tool: SpecimenToolIntent } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown and context menu on outside click
  useEffect(() => {
    if (!dropdownOpen && !contextMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
        setDropdownSearch("");
      }
      if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, contextMenu]);

  useEffect(() => {
    if (dropdownOpen) searchInputRef.current?.focus();
  }, [dropdownOpen]);

  const toggleFavorite = useCallback((tool: SpecimenToolIntent) => {
    setFavorites((prev) =>
      prev.includes(tool) ? prev.filter((f) => f !== tool) : [...prev, tool]
    );
  }, []);

  const filteredTools = useMemo(() => {
    if (!dropdownSearch) return SPECIMEN_TOOLS;
    const q = dropdownSearch.toLowerCase();
    return SPECIMEN_TOOLS.filter(
      (t) => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [dropdownSearch]);

  const favTools = useMemo(
    () => favorites.map((f) => SPECIMEN_TOOLS.find((t) => t.value === f)!).filter(Boolean),
    [favorites]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: favorite pills + tool dropdown */}
      <div className="flex items-center gap-1 border-b bg-muted/20 px-4 py-1.5">
        {favTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.value}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                intent === tool.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              onClick={() => setIntent(tool.value)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, tool: tool.value });
              }}
            >
              <Icon className="h-3 w-3" />
              {tool.label}
            </button>
          );
        })}

        {/* Add tool dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => { setDropdownOpen(!dropdownOpen); setDropdownSearch(""); }}
            title="Browse tools"
          >
            <Plus className="h-3 w-3" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg">
              <div className="border-b px-2 py-1.5">
                <div className="relative">
                  <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    className="w-full rounded border-none bg-transparent py-0.5 pl-6 pr-2 text-xs outline-none placeholder:text-muted-foreground/50"
                    placeholder="Search tools..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto py-1">
                {filteredTools.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching tools</p>
                )}
                {filteredTools.map((tool) => {
                  const Icon = tool.icon;
                  const isFav = favorites.includes(tool.value);
                  return (
                    <button
                      key={tool.value}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
                      onClick={() => {
                        setIntent(tool.value);
                        if (!favorites.includes(tool.value)) {
                          setFavorites((prev) => [...prev, tool.value]);
                        }
                        setDropdownOpen(false);
                        setDropdownSearch("");
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setDropdownOpen(false);
                        setDropdownSearch("");
                        setContextMenu({ x: e.clientX, y: e.clientY, tool: tool.value });
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{tool.label}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{tool.description}</div>
                      </div>
                      {isFav && <Pin className="h-3 w-3 shrink-0 fill-muted-foreground/50 text-muted-foreground/50" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <span className="ml-auto text-[10px] italic text-muted-foreground">
          Does not affect conclusions
        </span>
      </div>

      {/* Context menu for favorite toggle */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] rounded-md border bg-popover py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              toggleFavorite(contextMenu.tool);
              setContextMenu(null);
            }}
          >
            <Pin className={cn("h-3 w-3", favorites.includes(contextMenu.tool) ? "fill-current text-muted-foreground" : "text-muted-foreground/40")} />
            {favorites.includes(contextMenu.tool) ? "Remove from favorites" : "Add to favorites"}
          </button>
        </div>
      )}

      {/* Intent content */}
      <div className="flex-1 overflow-auto p-4">
        {intent === "severity" && (
          <SeverityDistributionPlaceholder specimenName={specimenName} findingCount={findingCount} selectedFinding={selectedFinding} />
        )}
        {intent === "treatment" && (
          <TreatmentRelatedPlaceholder specimenName={specimenName} selectedFinding={selectedFinding} />
        )}
        {intent === "peer" && (
          <PeerComparisonPlaceholder specimenName={specimenName} />
        )}
        {intent === "doseTrend" && (
          <DoseSeverityTrendPlaceholder specimenName={specimenName} selectedFinding={selectedFinding} />
        )}
      </div>
    </div>
  );
}

// ─── Main: HistopathologyView ──────────────────────────────

type EvidenceTab = "overview" | "hypotheses" | "metrics";

export function HistopathologyView({
  onSelectionChange,
  onSubjectClick,
}: {
  onSelectionChange?: (sel: HistopathSelection | null) => void;
  onSubjectClick?: (usubjid: string) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { data: lesionData, isLoading, error } = useLesionSeveritySummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: pathReviews } = useAnnotations<PathologyReview>(studyId, "pathology-reviews");

  const [selectedSpecimen, setSelectedSpecimen] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("overview");
  const [selection, setSelection] = useState<HistopathSelection | null>(null);
  const [sexFilter, setSexFilter] = useState<string | null>(null);
  const [minSeverity, setMinSeverity] = useState(0);
  const { width: railWidth, onPointerDown: onRailResize } = useResizePanel(300, 180, 500);
  const { expandAll, collapseAll } = useCollapseAll();

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

  // Finding names per specimen (for review status aggregation)
  const findingNamesBySpecimen = useMemo(() => {
    if (!lesionData) return new Map<string, string[]>();
    const map = new Map<string, Set<string>>();
    for (const row of lesionData) {
      if (!row.specimen) continue;
      let set = map.get(row.specimen);
      if (!set) {
        set = new Set();
        map.set(row.specimen, set);
      }
      set.add(row.finding);
    }
    const result = new Map<string, string[]>();
    for (const [spec, set] of map) {
      result.set(spec, [...set]);
    }
    return result;
  }, [lesionData]);

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
          pathReviews={pathReviews}
          findingNamesBySpecimen={findingNamesBySpecimen}
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
            <SpecimenHeader
              summary={selectedSummary}
              specimenData={specimenData}
              specimenRules={specimenRules}
              pathReviews={pathReviews}
              findingNames={findingNamesBySpecimen.get(selectedSummary.specimen) ?? []}
            />

            {/* Tab bar */}
            <ViewTabBar
              tabs={[
                { key: "overview", label: "Evidence" },
                { key: "hypotheses", label: "Hypotheses" },
                { key: "metrics", label: "Metrics" },
              ]}
              value={activeTab}
              onChange={(k) => setActiveTab(k as typeof activeTab)}
              right={activeTab === "overview" ? (
                <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
              ) : undefined}
            />

            {/* Tab content */}
            {activeTab === "overview" && (
              <OverviewTab
                specimenData={specimenData}
                findingSummaries={findingSummaries}
                allRuleResults={ruleResults ?? []}
                specimen={selectedSpecimen!}
                selection={selection}
                onFindingClick={handleFindingClick}
                onHeatmapClick={handleHeatmapClick}
                sexFilter={sexFilter}
                setSexFilter={setSexFilter}
                minSeverity={minSeverity}
                setMinSeverity={setMinSeverity}
                studyId={studyId}
                onSubjectClick={onSubjectClick}
              />
            )}
            {activeTab === "metrics" && (
              <MetricsTab
                specimenData={specimenData}
                selection={selection}
                onRowClick={handleRowClick}
                sexFilter={sexFilter}
                setSexFilter={setSexFilter}
                minSeverity={minSeverity}
                setMinSeverity={setMinSeverity}
              />
            )}
            {activeTab === "hypotheses" && (
              <HistopathHypothesesTab
                specimenName={selectedSummary.specimen.replace(/_/g, " ")}
                findingCount={findingSummaries.length}
                selectedFinding={selection?.finding}
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
