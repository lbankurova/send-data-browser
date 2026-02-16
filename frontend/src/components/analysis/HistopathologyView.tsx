import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import { Loader2, Microscope, BarChart3, Users, TrendingUp, Search, Plus, Pin, Undo2 } from "lucide-react";
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
import { useFindingDoseTrends } from "@/hooks/useFindingDoseTrends";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import { cn } from "@/lib/utils";
import { signal } from "@/lib/design-tokens";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { FilterBar, FilterSelect, FilterMultiSelect, FilterShowingLine } from "@/components/ui/FilterBar";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { DoseHeader } from "@/components/ui/DoseLabel";
import { getNeutralHeatColor as getNeutralHeatColor01, getDoseGroupColor, titleCase, formatDoseShortLabel } from "@/lib/severity-colors";
import { classifySpecimenPattern, classifyFindingPattern, formatPatternLabel, patternWeight, patternToLegacyConsistency } from "@/lib/pattern-classification";
import type { PatternClassification } from "@/lib/pattern-classification";
import { detectSyndromes } from "@/lib/syndrome-rules";
import type { SyndromeMatch } from "@/lib/syndrome-rules";
import { SparklineGlyph } from "@/components/ui/SparklineGlyph";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useResizePanel } from "@/hooks/useResizePanel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FindingsSelectionZone } from "@/components/analysis/FindingsSelectionZone";
import { DoseChartsSelectionZone } from "@/components/analysis/DoseChartsSelectionZone";
import { MatrixSelectionZone } from "@/components/analysis/MatrixSelectionZone";
import { useSectionLayout } from "@/hooks/useSectionLayout";
import { HorizontalResizeHandle } from "@/components/ui/PanelResizeHandle";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import { buildDoseIncidenceBarOption, buildDoseSeverityBarOption } from "@/components/analysis/charts/histopathology-charts";
import type { DoseIncidenceGroup, DoseSeverityGroup } from "@/components/analysis/charts/histopathology-charts";
import { ChartModeToggle } from "@/components/ui/ChartModeToggle";
import type { ChartDisplayMode } from "@/components/ui/ChartModeToggle";
import { specimenToOrganSystem } from "@/components/analysis/panes/HistopathologyContextPanel";
import { CompareTab } from "@/components/analysis/CompareTab";
import type { LesionSeverityRow, RuleResult, FindingDoseTrend, SignalSummaryRow } from "@/types/analysis-views";
import type { SubjectHistopathEntry } from "@/types/timecourse";
import type { PathologyReview } from "@/types/annotations";
import {
  deriveRecoveryAssessments,
  specimenRecoveryLabel,
  verdictPriority,
  verdictArrow,
  buildRecoveryTooltip,
  MIN_RECOVERY_N,
} from "@/lib/recovery-assessment";
import type { RecoveryVerdict } from "@/lib/recovery-assessment";
import { classifyRecovery, classifySpecimenRecovery, CLASSIFICATION_LABELS, CLASSIFICATION_PRIORITY, CLASSIFICATION_BORDER } from "@/lib/recovery-classification";
import type { RecoveryClassification } from "@/lib/recovery-classification";
import { classifyFindingNature, reversibilityLabel } from "@/lib/finding-nature";
import type { FindingNatureInfo } from "@/lib/finding-nature";
import { fishersExact2x2 } from "@/lib/statistics";
import { getHistoricalControl, classifyVsHCD, HCD_STATUS_LABELS, HCD_STATUS_SORT } from "@/lib/mock-historical-controls";
import type { HistoricalControlData, HCDStatus } from "@/lib/mock-historical-controls";
import { isPairedOrgan, specimenHasLaterality, aggregateFindingLaterality } from "@/lib/laterality";
import { useSpecimenLabCorrelation } from "@/hooks/useSpecimenLabCorrelation";

// ─── Neutral heat color (§6.1 evidence tier) ─────────────
export function getNeutralHeatColor(avgSev: number): { bg: string; text: string } {
  if (avgSev >= 5) return { bg: "#4B5563", text: "white" };
  if (avgSev >= 4) return { bg: "#6B7280", text: "white" };
  if (avgSev >= 3) return { bg: "#9CA3AF", text: "var(--foreground)" };
  if (avgSev >= 2) return { bg: "#D1D5DB", text: "var(--foreground)" };
  return { bg: "transparent", text: "var(--muted-foreground)" };
}

// ─── Public types ──────────────────────────────────────────

export interface HistopathSelection {
  specimen: string;
  finding?: string;
  sex?: string;
}

// ─── Derived data types ────────────────────────────────────

export interface SpecimenSummary {
  specimen: string;
  findingCount: number;
  adverseCount: number;
  warningCount: number;
  maxSeverity: number;
  /** Highest incidence (0–1) from any single (finding × dose × sex) row */
  maxIncidence: number;
  domains: string[];
  pattern: PatternClassification;
  signalScore: number;
  sexSkew: "M>F" | "F>M" | "M=F" | null;
  hasRecovery: boolean;
  hasSentinel: boolean;
  highestClinicalClass: "Sentinel" | "HighConcern" | "ModerateConcern" | "ContextDependent" | null;
  signalScoreBreakdown: { adverse: number; severity: number; incidence: number; pattern: number; syndromeBoost: number; clinicalFloor: number; sentinelBoost: number };
}

export interface FindingSummary {
  finding: string;
  maxSeverity: number;
  maxIncidence: number;
  totalAffected: number;
  totalN: number;
  severity: "adverse" | "warning" | "decreased" | "normal";
}

export interface RelatedOrganInfo {
  organ: string;
  specimen: string;
  incidence: number;
}

export interface FindingTableRow extends FindingSummary {
  isDoseDriven: boolean;
  isNonMonotonic: boolean;
  doseDirection: "increasing" | "decreasing" | "mixed" | "flat";
  controlIncidence: number;
  highDoseIncidence: number;
  relatedOrgans: string[] | undefined;
  relatedOrgansWithIncidence: RelatedOrganInfo[] | undefined;
  trendData?: FindingDoseTrend;
  clinicalClass?: "Sentinel" | "HighConcern" | "ModerateConcern" | "ContextDependent";
  catalogId?: string;
  recoveryVerdict?: RecoveryVerdict;
  laterality?: { left: number; right: number; bilateral: number };
}

export interface HeatmapData {
  doseLevels: number[];
  doseLabels: Map<number, string>;
  findings: string[];
  cells: Map<string, { incidence: number; avg_severity: number; affected: number; n: number; max_severity: number }>;
  findingMeta: Map<string, { maxSev: number; hasSeverityData: boolean }>;
  totalFindings: number;
}

const findingColHelper = createColumnHelper<FindingTableRow>();

// ─── Helpers ───────────────────────────────────────────────

export function deriveSpecimenSummaries(
  data: LesionSeverityRow[],
  ruleResults?: RuleResult[],
  trendData?: FindingDoseTrend[] | null,
  syndromeMatches?: SyndromeMatch[],
  signalData?: SignalSummaryRow[] | null,
): SpecimenSummary[] {
  const map = new Map<string, {
    findings: Set<string>;
    adverseFindings: Set<string>;
    warningFindings: Set<string>;
    maxSev: number;
    maxIncidence: number;
    maxMaleInc: number;
    maxFemaleInc: number;
    hasMale: boolean;
    hasFemale: boolean;
    domains: Set<string>;
    hasRecovery: boolean;
    /** Track worst severity classification per finding */
    findingSeverity: Map<string, "adverse" | "warning" | "normal">;
  }>();

  for (const row of data) {
    if (!row.specimen) continue;
    let entry = map.get(row.specimen);
    if (!entry) {
      entry = {
        findings: new Set(), adverseFindings: new Set(), warningFindings: new Set(),
        maxSev: 0, maxIncidence: 0, maxMaleInc: 0, maxFemaleInc: 0,
        hasMale: false, hasFemale: false, domains: new Set(),
        hasRecovery: false, findingSeverity: new Map(),
      };
      map.set(row.specimen, entry);
    }
    entry.findings.add(row.finding);
    if ((row.avg_severity ?? 0) > entry.maxSev) entry.maxSev = row.avg_severity ?? 0;
    if (row.incidence > entry.maxIncidence) entry.maxIncidence = row.incidence;
    entry.domains.add(row.domain);

    // Per-sex max incidence for sex skew
    if (row.sex === "M") { entry.hasMale = true; if (row.incidence > entry.maxMaleInc) entry.maxMaleInc = row.incidence; }
    else if (row.sex === "F") { entry.hasFemale = true; if (row.incidence > entry.maxFemaleInc) entry.maxFemaleInc = row.incidence; }

    // Recovery detection
    if (row.dose_label.toLowerCase().includes("recovery")) entry.hasRecovery = true;

    // Track worst severity per finding (adverse > warning > normal)
    const prev = entry.findingSeverity.get(row.finding);
    if (row.severity === "adverse") {
      entry.adverseFindings.add(row.finding);
      entry.findingSeverity.set(row.finding, "adverse");
    } else if (row.severity === "warning" && prev !== "adverse") {
      entry.warningFindings.add(row.finding);
      entry.findingSeverity.set(row.finding, "warning");
    } else if (!prev) {
      entry.findingSeverity.set(row.finding, "normal");
    }
  }

  // Build set of specimens with R01/R04 rule signals (authoritative dose evidence)
  const doseRules = ruleResults?.filter((r) => r.rule_id === "R01" || r.rule_id === "R04") ?? [];
  const hasDoseRuleFor = (specimen: string) => {
    const key = specimen.toLowerCase().replace(/[, ]+/g, "_");
    return doseRules.some(
      (r) => r.context_key.toLowerCase().includes(key) ||
        r.output_text.toLowerCase().includes(specimen.toLowerCase()) ||
        r.organ_system.toLowerCase() === specimen.toLowerCase()
    );
  };

  // Build clinical class map per specimen (from rule results)
  const CLINICAL_PRIORITY: Record<string, number> = { Sentinel: 4, HighConcern: 3, ModerateConcern: 2, ContextDependent: 1 };
  const CLINICAL_FLOOR: Record<string, number> = { Sentinel: 20, HighConcern: 12, ModerateConcern: 6, ContextDependent: 2 };
  const clinicalBySpecimen = new Map<string, { highest: string; hasSentinel: boolean }>();
  for (const r of ruleResults ?? []) {
    const cc = r.params?.clinical_class;
    if (!cc) continue;
    const rSpec = (r.params?.specimen ?? "").toLowerCase();
    if (!rSpec) continue;
    const existing = clinicalBySpecimen.get(rSpec);
    const pri = CLINICAL_PRIORITY[cc] ?? 0;
    if (!existing) {
      clinicalBySpecimen.set(rSpec, { highest: cc, hasSentinel: cc === "Sentinel" });
    } else {
      if (pri > (CLINICAL_PRIORITY[existing.highest] ?? 0)) existing.highest = cc;
      if (cc === "Sentinel") existing.hasSentinel = true;
    }
  }

  const summaries: SpecimenSummary[] = [];
  for (const [specimen, entry] of map) {
    const specimenRows = data.filter((r) => r.specimen === specimen);

    // Pattern classification (replaces getDoseConsistencyFull)
    const specimenPattern = classifySpecimenPattern(
      specimenRows,
      trendData ?? null,
      syndromeMatches ?? [],
      signalData ?? null,
    );

    // If specimen has R01/R04 rule signals, boost confidence to at least MODERATE
    if (hasDoseRuleFor(specimen) && specimenPattern.confidence === "LOW") {
      specimenPattern.confidence = "MODERATE";
      specimenPattern.confidenceFactors.push("rule engine (R01/R04)");
    }

    const { pw, syndromeBoost: synBoost } = patternWeight(
      specimenPattern.pattern,
      specimenPattern.confidence,
      specimenPattern.syndrome,
    );

    // Clinical-aware signal score
    const clin = clinicalBySpecimen.get(specimen.toLowerCase());
    const highestClinicalClass = (clin?.highest ?? null) as SpecimenSummary["highestClinicalClass"];
    const hasSentinel = clin?.hasSentinel ?? false;
    const clinicalFloor = CLINICAL_FLOOR[highestClinicalClass ?? ""] ?? 0;
    const sentinelBoost = hasSentinel ? 15 : 0;

    const adverseComponent = entry.adverseFindings.size * 3;
    const severityComponent = entry.maxSev;
    const incidenceComponent = entry.maxIncidence * 5;

    // Modified score formula for purely decreasing specimens
    let signalScore: number;
    if (specimenPattern.pattern === "MONOTONIC_DOWN") {
      // Compute actual control - highDose magnitude across all findings
      const doseLevels = [...new Set(specimenRows.map((r) => r.dose_level))].sort((a, b) => a - b);
      const ctrlLevel = doseLevels[0];
      const highLevel = doseLevels[doseLevels.length - 1];
      const ctrlRows = specimenRows.filter((r) => r.dose_level === ctrlLevel);
      const highRows = specimenRows.filter((r) => r.dose_level === highLevel);
      const ctrlInc = ctrlRows.length > 0 ? Math.max(...ctrlRows.map((r) => r.incidence)) : 0;
      const highInc = highRows.length > 0 ? Math.max(...highRows.map((r) => r.incidence)) : 0;
      const decreaseMagnitude = Math.max(0, ctrlInc - highInc);
      signalScore = (severityComponent * 0.5) + (decreaseMagnitude * 3) + pw + synBoost;
    } else {
      signalScore = adverseComponent + severityComponent + incidenceComponent + pw + synBoost + clinicalFloor + sentinelBoost;
    }

    // Sex skew: compare max incidence per sex
    let sexSkew: "M>F" | "F>M" | "M=F" | null = null;
    if (entry.hasMale && entry.hasFemale) {
      const hi = Math.max(entry.maxMaleInc, entry.maxFemaleInc);
      const lo = Math.min(entry.maxMaleInc, entry.maxFemaleInc);
      const ratio = lo > 0 ? hi / lo : (hi > 0 ? Infinity : 1);
      if (ratio > 1.5) sexSkew = entry.maxMaleInc > entry.maxFemaleInc ? "M>F" : "F>M";
      else sexSkew = "M=F";
    }

    summaries.push({
      specimen,
      findingCount: entry.findings.size,
      adverseCount: entry.adverseFindings.size,
      warningCount: entry.warningFindings.size,
      maxSeverity: entry.maxSev,
      maxIncidence: entry.maxIncidence,
      domains: [...entry.domains].sort(),
      pattern: specimenPattern,
      signalScore,
      sexSkew,
      hasRecovery: entry.hasRecovery,
      hasSentinel,
      highestClinicalClass,
      signalScoreBreakdown: {
        adverse: adverseComponent,
        severity: severityComponent,
        incidence: incidenceComponent,
        pattern: pw,
        syndromeBoost: synBoost,
        clinicalFloor,
        sentinelBoost,
      },
    });
  }

  // Default sort: signal score descending
  return summaries.sort((a, b) => b.signalScore - a.signalScore || b.findingCount - a.findingCount);
}

export function deriveFindingSummaries(rows: LesionSeverityRow[]): FindingSummary[] {
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

export function deriveSexLabel(rows: LesionSeverityRow[]): string {
  const sexes = new Set(rows.map((r) => r.sex));
  if (sexes.size === 1) {
    const s = [...sexes][0];
    return s === "M" ? "Male only" : s === "F" ? "Female only" : `${s} only`;
  }
  return "Both sexes";
}

// Old getDoseConsistency* functions deleted — replaced by pattern-classification.ts

export function deriveSpecimenConclusion(
  summary: SpecimenSummary,
  specimenData: LesionSeverityRow[],
  _specimenRules: RuleResult[],
): string {
  const maxIncidencePct = (summary.maxIncidence * 100).toFixed(0);

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

  // Dose relationship: from pattern classification
  const doseDesc = formatPatternLabel(summary.pattern);

  return `${incidenceDesc} (${maxIncidencePct}%), ${sevDesc}, ${sexDesc}, ${doseDesc}.`;
}

// ─── Review status aggregation ────────────────────────────

export type SpecimenReviewStatus = "Preliminary" | "In review" | "Under dispute" | "Confirmed" | "Revised" | "PWG pending";

export function deriveSpecimenReviewStatus(
  findingNames: string[],
  reviews: Record<string, PathologyReview> | undefined
): SpecimenReviewStatus {
  if (!reviews || findingNames.length === 0) return "Preliminary";
  const reviewList = findingNames.map(f => reviews[f]).filter(Boolean) as PathologyReview[];
  if (reviewList.length === 0) return "Preliminary";

  const statuses = findingNames.map(f => reviews[f]?.peerReviewStatus ?? "Not Reviewed");
  if (statuses.every(s => s === "Not Reviewed")) return "Preliminary";

  // Priority: PWG pending > Under dispute > In review > Revised > Confirmed > Preliminary
  const hasPwgPending = reviewList.some(r => r.resolution === "pwg_pending");
  if (hasPwgPending) return "PWG pending";

  const hasUnresolvedDisagreement = reviewList.some(
    r => r.peerReviewStatus === "Disagreed" && (!r.resolution || r.resolution === "unresolved")
  );
  if (hasUnresolvedDisagreement) return "Under dispute";

  const hasResolvedDisagreement = reviewList.some(
    r => r.peerReviewStatus === "Disagreed" && !!r.resolution && r.resolution !== "unresolved"
  );
  const hasNotReviewed = statuses.some(s => s === "Not Reviewed");
  const allReviewed = !hasNotReviewed;

  if (hasNotReviewed) return "In review";
  if (hasResolvedDisagreement) return "Revised";
  if (allReviewed && statuses.every(s => s === "Agreed" || s === "Deferred")) return "Confirmed";
  return "In review";
}

// ChartModeToggle is now imported from @/components/ui/ChartModeToggle

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
  minSeverity,
  studyId,
  onSubjectClick,
  trendsByFinding,
  comparisonSubjects,
  onComparisonChange,
  onCompareClick,
  allLesionData,
  onSpecimenNavigate,
}: {
  specimenData: LesionSeverityRow[];
  findingSummaries: FindingSummary[];
  allRuleResults: RuleResult[];
  specimen: string;
  selection: HistopathSelection | null;
  onFindingClick: (finding: string) => void;
  onHeatmapClick: (finding: string) => void;
  sexFilter: string | null;
  minSeverity: number;
  studyId?: string;
  onSubjectClick?: (usubjid: string) => void;
  trendsByFinding: Map<string, FindingDoseTrend>;
  comparisonSubjects: Set<string>;
  onComparisonChange: (subjects: Set<string>) => void;
  onCompareClick: () => void;
  allLesionData?: LesionSeverityRow[];
  onSpecimenNavigate?: (specimen: string) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [findingColSizing, setFindingColSizing] = useState<ColumnSizingState>({});
  const [heatmapView, setHeatmapView] = useState<"severity" | "incidence">("severity");
  const [matrixMode, setMatrixMode] = useState<"group" | "subject">("group");
  const [affectedOnly, setAffectedOnly] = useState(true);
  const [subjectSort, setSubjectSort] = useState<"dose" | "severity">("dose");
  const [doseGroupFilter, setDoseGroupFilter] = useState<ReadonlySet<string> | null>(null);
  const [doseDepThreshold, setDoseDepThreshold] = useState<"moderate" | "strong" | "ca_trend" | "severity_trend" | "fisher_pairwise">("moderate");
  const [doseDepMenu, setDoseDepMenu] = useState<{ x: number; y: number } | null>(null);
  const [hideZeroSeverity, setHideZeroSeverity] = useState(false);
  const [severityGradedOnly, setSeverityGradedOnly] = useState(false);
  const [incidenceMode, setIncidenceMode] = useState<ChartDisplayMode>("scaled");
  const [severityMode, setSeverityMode] = useState<ChartDisplayMode>("scaled");
  const doseDepMenuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);


  // Close dose-dep context menu on outside click
  useEffect(() => {
    if (!doseDepMenu) return;
    const handler = (e: MouseEvent) => {
      if (doseDepMenuRef.current && !doseDepMenuRef.current.contains(e.target as Node)) setDoseDepMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [doseDepMenu]);

  // Reset heatmap view state when specimen changes (preserve matrix mode)
  useEffect(() => {
    setAffectedOnly(true);
    setSubjectSort("dose");
    setDoseGroupFilter(null);
    setSeverityGradedOnly(false);
  }, [specimen]);

  // Subject-level data (always fetch — needed for recovery assessment + subject matrix)
  const { data: subjData, isLoading: subjLoading } = useHistopathSubjects(
    studyId,
    specimen ?? null,
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

  // Dose group options for multi-select dropdown
  const doseGroupOptions = useMemo(() => {
    const shortLabel = (label: string) => {
      const parts = label.split(/,\s*/);
      if (parts.length < 2) return label;
      return parts.slice(1).join(", ").replace(/\s+\S*DRUG\S*/i, "").trim() || label;
    };
    return [
      ...availableDoseGroups.main.map(([level, label]) => ({
        key: String(level),
        label: shortLabel(label),
      })),
      ...availableDoseGroups.recovery.map(([level, label]) => ({
        key: `R${level}`,
        label: shortLabel(label),
        group: "Recovery",
      })),
    ];
  }, [availableDoseGroups]);

  // Per-finding dose consistency (with direction)
  const findingConsistency = useMemo(() => {
    const map = new Map<string, PatternClassification>();
    for (const fs of findingSummaries) {
      const trendP = trendsByFinding.get(fs.finding)?.ca_trend_p ?? null;
      map.set(fs.finding, classifyFindingPattern(specimenData, fs.finding, trendP, null, false));
    }
    return map;
  }, [findingSummaries, specimenData, trendsByFinding]);

  // Per-finding cross-organ coherence (R16)
  const findingRelatedOrgans = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!allRuleResults.length || !specimen) return map;
    const selfOrgan = specimenToOrganSystem(specimen).toLowerCase();
    const otherR16 = allRuleResults.filter(
      (r) => r.rule_id === "R16" && r.organ_system.toLowerCase() !== selfOrgan
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

  // Per-finding cross-organ coherence with incidence data (R16 + lesion data)
  const findingRelatedOrgansWithIncidence = useMemo(() => {
    const map = new Map<string, RelatedOrganInfo[]>();
    if (!allLesionData || findingRelatedOrgans.size === 0) return map;
    for (const [finding, organs] of findingRelatedOrgans) {
      const findingLower = finding.toLowerCase();
      const infos: RelatedOrganInfo[] = [];
      for (const organ of organs) {
        // Find specimens belonging to this organ system
        const organLower = organ.toLowerCase();
        const organRows = allLesionData.filter(
          (r) =>
            r.finding.toLowerCase() === findingLower &&
            r.specimen !== specimen &&
            specimenToOrganSystem(r.specimen).toLowerCase() === organLower,
        );
        if (organRows.length === 0) {
          infos.push({ organ, specimen: organ, incidence: 0 });
          continue;
        }
        // Find the specimen with max incidence for this finding
        const bySpec = new Map<string, number>();
        for (const r of organRows) {
          const prev = bySpec.get(r.specimen) ?? 0;
          if (r.incidence > prev) bySpec.set(r.specimen, r.incidence);
        }
        let bestSpec = organRows[0].specimen;
        let bestInc = 0;
        for (const [sp, inc] of bySpec) {
          if (inc > bestInc) { bestInc = inc; bestSpec = sp; }
        }
        infos.push({ organ, specimen: bestSpec, incidence: bestInc });
      }
      if (infos.length > 0) map.set(finding, infos);
    }
    return map;
  }, [findingRelatedOrgans, allLesionData, specimen]);

  // Per-finding clinical catalog lookup
  const findingClinical = useMemo(() => {
    const map = new Map<string, { clinicalClass: string; catalogId: string }>();
    if (!allRuleResults.length || !specimen) return map;
    const specLower = specimen.toLowerCase();
    for (const r of allRuleResults) {
      const cc = r.params?.clinical_class;
      const cid = r.params?.catalog_id;
      if (!cc || !cid) continue;
      const rSpec = (r.params?.specimen ?? "").toLowerCase();
      if (rSpec !== specLower) continue;
      const finding = r.params?.finding ?? "";
      if (finding && !map.has(finding)) {
        map.set(finding, { clinicalClass: cc, catalogId: cid });
      }
    }
    return map;
  }, [allRuleResults, specimen]);

  // Filtered data for group heatmap (respects shared sex/severity filters)
  const filteredData = useMemo(() => {
    return specimenData.filter((row) => {
      if (sexFilter && row.sex !== sexFilter) return false;
      if ((row.avg_severity ?? 0) < minSeverity) return false;
      return true;
    });
  }, [specimenData, sexFilter, minSeverity]);

  // Matrix base data: sex-filtered only (no minSeverity) so non-graded findings appear
  const matrixBaseData = useMemo(() => {
    return specimenData.filter((row) => {
      if (sexFilter && row.sex !== sexFilter) return false;
      return true;
    });
  }, [specimenData, sexFilter]);

  // Stable frame: all dose groups + sexes from the entire specimen (not finding-filtered)
  const { stableDoseLevels, stableAllSexes, stableSexKeys, stableUseSexGrouping } = useMemo(() => {
    if (!filteredData.length) return { stableDoseLevels: [] as { level: number; label: string }[], stableAllSexes: [] as string[], stableSexKeys: [] as string[], stableUseSexGrouping: false };
    const doseLabels = new Map<number, string>();
    const sexSet = new Set<string>();
    for (const r of filteredData) {
      if (!doseLabels.has(r.dose_level)) doseLabels.set(r.dose_level, formatDoseShortLabel(r.dose_label));
      sexSet.add(r.sex);
    }
    const levels = [...doseLabels.entries()].sort((a, b) => a[0] - b[0]).map(([level, label]) => ({ level, label }));
    const allSexes = [...sexSet].sort();
    const useSexGrouping = allSexes.length > 1 && !sexFilter;
    const sexKeys = useSexGrouping ? allSexes : allSexes.length === 1 ? allSexes : ["Combined"];
    return { stableDoseLevels: levels, stableAllSexes: allSexes, stableSexKeys: sexKeys, stableUseSexGrouping: useSexGrouping };
  }, [filteredData, sexFilter]);

  // Recovery flag (moved up — needed by recovery chart data builders below)
  const specimenHasRecovery = useMemo(
    () => subjData?.subjects?.some((s) => s.is_recovery) ?? false,
    [subjData],
  );

  // Laterality flag — show column only for paired organs with laterality data
  const showLaterality = useMemo(
    () => !!selection?.specimen && isPairedOrgan(selection.specimen) && specimenHasLaterality(subjData?.subjects ?? []),
    [selection?.specimen, subjData?.subjects],
  );

  // Recovery incidence groups (built from subject-level data for chart recovery bars)
  const recoveryIncidenceGroups = useMemo<DoseIncidenceGroup[] | undefined>(() => {
    if (!specimenHasRecovery || !subjData?.subjects || !availableDoseGroups.recovery.length) return undefined;
    const recSubjects = subjData.subjects.filter((s) => s.is_recovery);
    if (recSubjects.length === 0) return undefined;

    const selectedFinding = selection?.finding;
    const filtered = sexFilter ? recSubjects.filter((s) => s.sex === sexFilter) : recSubjects;

    // Group by dose_level → sex → { affected, n }
    const doseMap = new Map<number, Map<string, { affected: number; n: number }>>();

    if (selectedFinding) {
      // Single finding: one affected/n observation per subject
      for (const s of filtered) {
        let bySex = doseMap.get(s.dose_level);
        if (!bySex) { bySex = new Map(); doseMap.set(s.dose_level, bySex); }
        const hasF = !!s.findings[selectedFinding];
        const sexEntry = bySex.get(s.sex);
        if (sexEntry) { sexEntry.n += 1; if (hasF) sexEntry.affected += 1; }
        else { bySex.set(s.sex, { affected: hasF ? 1 : 0, n: 1 }); }
      }
    } else {
      // Aggregate: iterate per-finding, sum affected/n across findings
      // (matches main arm which sums per-finding rows from filteredData)
      const allFindings = new Set<string>();
      for (const s of filtered) for (const f of Object.keys(s.findings)) allFindings.add(f);
      for (const finding of allFindings) {
        for (const s of filtered) {
          let bySex = doseMap.get(s.dose_level);
          if (!bySex) { bySex = new Map(); doseMap.set(s.dose_level, bySex); }
          const hasF = !!s.findings[finding];
          const sexEntry = bySex.get(s.sex);
          if (sexEntry) { sexEntry.n += 1; if (hasF) sexEntry.affected += 1; }
          else { bySex.set(s.sex, { affected: hasF ? 1 : 0, n: 1 }); }
        }
      }
    }

    return availableDoseGroups.recovery.map(([level, rawLabel]) => {
      const label = formatDoseShortLabel(rawLabel);
      const bySexMap = doseMap.get(level);
      if (stableUseSexGrouping) {
        const bySex: Record<string, { affected: number; n: number }> = {};
        for (const sex of stableAllSexes) {
          bySex[sex] = bySexMap?.get(sex) ?? { affected: 0, n: 0 };
        }
        return { doseLevel: level, doseLabel: label, bySex };
      }
      if (stableAllSexes.length === 1) {
        const sex = stableAllSexes[0];
        return { doseLevel: level, doseLabel: label, bySex: { [sex]: bySexMap?.get(sex) ?? { affected: 0, n: 0 } } };
      }
      let totalAffected = 0;
      let totalN = 0;
      if (bySexMap) for (const [, v] of bySexMap) { totalAffected += v.affected; totalN += v.n; }
      return { doseLevel: level, doseLabel: label, bySex: { Combined: { affected: totalAffected, n: totalN } } };
    });
  }, [specimenHasRecovery, subjData, availableDoseGroups.recovery, selection?.finding, sexFilter, stableUseSexGrouping, stableAllSexes]);

  // ── Recovery assessment (needed by chart verdicts below) ──
  const recoveryAssessments = useMemo(() => {
    if (!specimenHasRecovery || !subjData?.subjects) return null;
    const findingNames = findingSummaries.map((f) => f.finding);
    return deriveRecoveryAssessments(findingNames, subjData.subjects);
  }, [specimenHasRecovery, subjData, findingSummaries]);

  // Recovery chart anomaly summary for header icon (§4.4)
  const recoveryChartAnomalies = useMemo(() => {
    if (!selection?.finding || !recoveryAssessments) return undefined;
    const assessment = recoveryAssessments.find((a) => a.finding === selection.finding);
    if (!assessment) return undefined;
    let anomalyCount = 0;
    let insufficientCount = 0;
    for (const a of assessment.assessments) {
      if (a.verdict === "anomaly") anomalyCount++;
      else if (a.verdict === "insufficient_n") insufficientCount++;
    }
    if (anomalyCount === 0 && insufficientCount === 0) return undefined;
    const parts: string[] = [];
    if (anomalyCount > 0) parts.push(`${anomalyCount} anomal${anomalyCount === 1 ? "y" : "ies"}: finding absent in main arm`);
    if (insufficientCount > 0) parts.push(`${insufficientCount} dose group${insufficientCount === 1 ? "" : "s"} with insufficient recovery N`);
    return { anomalyCount, insufficientCount, tooltip: parts.join("; ") };
  }, [selection?.finding, recoveryAssessments]);

  // Dose-incidence chart data
  const { chartOption: doseChartOption, hasDoseChartData } = useMemo(() => {
    if (!stableDoseLevels.length) return { chartOption: null, hasDoseChartData: false };

    // Optionally filter to selected finding
    const rows = selection?.finding
      ? filteredData.filter((r) => r.finding === selection.finding)
      : filteredData;

    // Group by dose_level → sex → { affected, n }
    const doseMap = new Map<number, Map<string, { affected: number; n: number }>>();
    for (const r of rows) {
      let bySex = doseMap.get(r.dose_level);
      if (!bySex) { bySex = new Map(); doseMap.set(r.dose_level, bySex); }
      const sexEntry = bySex.get(r.sex);
      if (sexEntry) { sexEntry.affected += r.affected; sexEntry.n += r.n; }
      else { bySex.set(r.sex, { affected: r.affected, n: r.n }); }
    }

    // Build groups using stable frame — always all dose levels, all sexes
    const groups: DoseIncidenceGroup[] = stableDoseLevels.map(({ level, label }) => {
      const bySexMap = doseMap.get(level);
      if (stableUseSexGrouping) {
        const bySex: Record<string, { affected: number; n: number }> = {};
        for (const sex of stableAllSexes) {
          const s = bySexMap?.get(sex);
          bySex[sex] = s ?? { affected: 0, n: 0 };
        }
        return { doseLevel: level, doseLabel: label, bySex };
      }
      if (stableAllSexes.length === 1) {
        const sex = stableAllSexes[0];
        const s = bySexMap?.get(sex);
        return { doseLevel: level, doseLabel: label, bySex: { [sex]: s ?? { affected: 0, n: 0 } } };
      }
      let totalAffected = 0;
      let totalN = 0;
      if (bySexMap) for (const [, s] of bySexMap) { totalAffected += s.affected; totalN += s.n; }
      return { doseLevel: level, doseLabel: label, bySex: { Combined: { affected: totalAffected, n: totalN } } };
    });

    // Determine direction for selected finding (or specimen aggregate)
    const selectedFindingFull = selection?.finding ? findingConsistency.get(selection.finding) : undefined;
    const chartDirection = selectedFindingFull?.pattern === "MONOTONIC_DOWN" ? "decreasing" as const : selectedFindingFull?.pattern === "MONOTONIC_UP" ? "increasing" as const : undefined;

    return { chartOption: buildDoseIncidenceBarOption(groups, stableSexKeys, incidenceMode, recoveryIncidenceGroups, chartDirection), hasDoseChartData: true };
  }, [filteredData, selection?.finding, stableDoseLevels, stableAllSexes, stableSexKeys, stableUseSexGrouping, incidenceMode, recoveryIncidenceGroups, findingConsistency]);

  // Recovery severity groups (built from subject-level data for chart recovery bars)
  const recoverySeverityGroups = useMemo<DoseSeverityGroup[] | undefined>(() => {
    if (!specimenHasRecovery || !subjData?.subjects || !availableDoseGroups.recovery.length) return undefined;
    const recSubjects = subjData.subjects.filter((s) => s.is_recovery);
    if (recSubjects.length === 0) return undefined;

    const selectedFinding = selection?.finding;
    const filtered = sexFilter ? recSubjects.filter((s) => s.sex === sexFilter) : recSubjects;

    // Group by dose_level → sex → { totalSeverity, count }
    const doseMap = new Map<number, Map<string, { totalSeverity: number; count: number }>>();
    for (const s of filtered) {
      let bySex = doseMap.get(s.dose_level);
      if (!bySex) { bySex = new Map(); doseMap.set(s.dose_level, bySex); }
      const findings = selectedFinding
        ? (s.findings[selectedFinding] ? { [selectedFinding]: s.findings[selectedFinding] } : {})
        : s.findings;
      for (const [, f] of Object.entries(findings)) {
        if (f.severity_num > 0) {
          const sexEntry = bySex.get(s.sex);
          if (sexEntry) { sexEntry.totalSeverity += f.severity_num; sexEntry.count += 1; }
          else { bySex.set(s.sex, { totalSeverity: f.severity_num, count: 1 }); }
        }
      }
    }

    return availableDoseGroups.recovery.map(([level, rawLabel]) => {
      const label = formatDoseShortLabel(rawLabel);
      const bySexMap = doseMap.get(level);
      if (stableUseSexGrouping) {
        const bySex: Record<string, { totalSeverity: number; count: number }> = {};
        for (const sex of stableAllSexes) {
          bySex[sex] = bySexMap?.get(sex) ?? { totalSeverity: 0, count: 0 };
        }
        return { doseLevel: level, doseLabel: label, bySex };
      }
      if (stableAllSexes.length === 1) {
        const sex = stableAllSexes[0];
        return { doseLevel: level, doseLabel: label, bySex: { [sex]: bySexMap?.get(sex) ?? { totalSeverity: 0, count: 0 } } };
      }
      let totalSev = 0;
      let totalCount = 0;
      if (bySexMap) for (const [, v] of bySexMap) { totalSev += v.totalSeverity; totalCount += v.count; }
      return { doseLevel: level, doseLabel: label, bySex: { Combined: { totalSeverity: totalSev, count: totalCount } } };
    });
  }, [specimenHasRecovery, subjData, availableDoseGroups.recovery, selection?.finding, sexFilter, stableUseSexGrouping, stableAllSexes]);

  // Dose-severity chart data
  const { chartOption: doseSeverityChartOption, hasSeverityChartData } = useMemo(() => {
    if (!stableDoseLevels.length) return { chartOption: null, hasSeverityChartData: false };

    const rows = selection?.finding
      ? filteredData.filter((r) => r.finding === selection.finding)
      : filteredData;
    // Only include rows with non-null avg_severity for aggregation
    const sevRows = rows.filter((r) => (r.avg_severity ?? 0) > 0);

    const doseMap = new Map<number, Map<string, { totalSeverity: number; count: number }>>();
    for (const r of sevRows) {
      let bySex = doseMap.get(r.dose_level);
      if (!bySex) { bySex = new Map(); doseMap.set(r.dose_level, bySex); }
      const sexEntry = bySex.get(r.sex);
      const sev = r.avg_severity ?? 0;
      if (sexEntry) { sexEntry.totalSeverity += sev; sexEntry.count += 1; }
      else { bySex.set(r.sex, { totalSeverity: sev, count: 1 }); }
    }

    // Build groups using stable frame — always all dose levels, all sexes
    const groups: DoseSeverityGroup[] = stableDoseLevels.map(({ level, label }) => {
      const bySexMap = doseMap.get(level);
      if (stableUseSexGrouping) {
        const bySex: Record<string, { totalSeverity: number; count: number }> = {};
        for (const sex of stableAllSexes) {
          const s = bySexMap?.get(sex);
          bySex[sex] = s ?? { totalSeverity: 0, count: 0 };
        }
        return { doseLevel: level, doseLabel: label, bySex };
      }
      if (stableAllSexes.length === 1) {
        const sex = stableAllSexes[0];
        const s = bySexMap?.get(sex);
        return { doseLevel: level, doseLabel: label, bySex: { [sex]: s ?? { totalSeverity: 0, count: 0 } } };
      }
      let totalSev = 0;
      let totalCount = 0;
      if (bySexMap) for (const [, s] of bySexMap) { totalSev += s.totalSeverity; totalCount += s.count; }
      return { doseLevel: level, doseLabel: label, bySex: { Combined: { totalSeverity: totalSev, count: totalCount } } };
    });

    const hasData = sevRows.length > 0;
    return { chartOption: buildDoseSeverityBarOption(groups, stableSexKeys, severityMode, recoverySeverityGroups), hasSeverityChartData: hasData };
  }, [filteredData, selection?.finding, stableDoseLevels, stableAllSexes, stableSexKeys, stableUseSexGrouping, severityMode, recoverySeverityGroups]);

  // Group-level heatmap data (uses matrixBaseData so non-graded findings appear)
  const heatmapData = useMemo(() => {
    if (!matrixBaseData.length) return null;
    const doseLevels = [...new Set(matrixBaseData.map((r) => r.dose_level))].sort((a, b) => a - b);
    const doseLabels = new Map<number, string>();
    for (const r of matrixBaseData) {
      if (!doseLabels.has(r.dose_level)) {
        doseLabels.set(r.dose_level, formatDoseShortLabel(r.dose_label));
      }
    }

    // Build finding metadata: max severity and whether any row has severity data
    const findingMeta = new Map<string, { maxSev: number; hasSeverityData: boolean }>();
    for (const r of matrixBaseData) {
      const sev = r.avg_severity ?? 0;
      const existing = findingMeta.get(r.finding);
      if (!existing) {
        findingMeta.set(r.finding, { maxSev: sev, hasSeverityData: sev > 0 });
      } else {
        if (sev > existing.maxSev) existing.maxSev = sev;
        if (sev > 0) existing.hasSeverityData = true;
      }
    }

    // Filter and sort findings
    let findingList = [...findingMeta.entries()];
    const totalFindings = findingList.length;
    if (severityGradedOnly) findingList = findingList.filter(([, m]) => m.hasSeverityData);
    findingList = findingList.filter(([, m]) => !m.hasSeverityData || m.maxSev >= minSeverity);

    const findings = findingList
      .sort((a, b) => {
        if (a[1].hasSeverityData && !b[1].hasSeverityData) return -1;
        if (!a[1].hasSeverityData && b[1].hasSeverityData) return 1;
        if (a[1].hasSeverityData && b[1].hasSeverityData) return b[1].maxSev - a[1].maxSev;
        return a[0].localeCompare(b[0]);
      })
      .map(([f]) => f);

    // Build cells from matrixBaseData
    const cells = new Map<string, { incidence: number; avg_severity: number; affected: number; n: number; max_severity: number }>();
    for (const r of matrixBaseData) {
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
          max_severity: 0,
        });
      }
    }

    // Second pass: compute max_severity from subject-level data
    if (subjData?.subjects) {
      for (const subj of subjData.subjects) {
        if (subj.is_recovery) continue;
        for (const [finding, val] of Object.entries(subj.findings)) {
          const key = `${finding}|${subj.dose_level}`;
          const cell = cells.get(key);
          if (cell && val.severity_num > cell.max_severity) {
            cell.max_severity = val.severity_num;
          }
        }
      }
    }

    return { doseLevels, doseLabels, findings, cells, findingMeta, totalFindings } satisfies HeatmapData;
  }, [matrixBaseData, severityGradedOnly, minSeverity, subjData]);

  // Subject-mode finding counts for section header (SM-4)
  const subjectModeFindingCounts = useMemo(() => {
    if (!subjData?.subjects) return { filtered: 0, total: 0 };
    let filtered = subjData.subjects;
    if (sexFilter) filtered = filtered.filter((s) => s.sex === sexFilter);
    if (affectedOnly) filtered = filtered.filter((s) => Object.keys(s.findings).length > 0);
    const findingMaxSev = new Map<string, number>();
    for (const subj of filtered) {
      for (const [finding, val] of Object.entries(subj.findings)) {
        const sev = val.severity_num;
        const existing = findingMaxSev.get(finding) ?? 0;
        if (sev > existing) findingMaxSev.set(finding, sev);
      }
    }
    const total = findingMaxSev.size;
    let entries = [...findingMaxSev.entries()].map(([f, maxSev]) => {
      const hasGrade = heatmapData?.findingMeta?.get(f)?.hasSeverityData ?? (maxSev > 0);
      return { maxSev, hasSeverityData: hasGrade };
    });
    if (severityGradedOnly) entries = entries.filter((e) => e.hasSeverityData);
    entries = entries.filter((e) => !e.hasSeverityData || e.maxSev >= minSeverity);
    return { filtered: entries.length, total };
  }, [subjData, sexFilter, affectedOnly, severityGradedOnly, minSeverity, heatmapData?.findingMeta]);

  // Recovery heatmap data for group heatmap
  const recoveryHeatmapData = useMemo(() => {
    if (!specimenHasRecovery || !subjData?.subjects || !heatmapData) return null;
    const recSubjects = subjData.subjects.filter((s) => s.is_recovery);
    if (recSubjects.length === 0) return null;

    // Dose levels and labels for recovery groups
    const doseLevelSet = new Map<number, string>();
    for (const s of recSubjects) {
      if (!doseLevelSet.has(s.dose_level))
        doseLevelSet.set(s.dose_level, formatDoseShortLabel(s.dose_label));
    }
    const doseLevels = [...doseLevelSet.keys()].sort((a, b) => a - b);
    const doseLabels = doseLevelSet;

    // Pre-compute examined count per dose level (v3: examination-aware)
    // Heuristic: if ANY subject at this dose level has any finding → all examined
    const examinedByDose = new Map<number, number>();
    for (const dl of doseLevels) {
      const doseSubjects = recSubjects.filter((s) => s.dose_level === dl);
      const anyExamined = doseSubjects.some((s) => Object.keys(s.findings).length > 0);
      examinedByDose.set(dl, anyExamined ? doseSubjects.length : 0);
    }

    // Build cells: per-finding per-dose incidence and avg severity
    const cells = new Map<string, { incidence: number; avg_severity: number; affected: number; n: number; examined: number }>();
    for (const finding of heatmapData.findings) {
      for (const dl of doseLevels) {
        const doseSubjects = recSubjects.filter((s) => s.dose_level === dl);
        const n = doseSubjects.length;
        const examined = examinedByDose.get(dl) ?? 0;
        let affected = 0;
        let totalSev = 0;
        for (const s of doseSubjects) {
          const f = s.findings[finding];
          if (f) {
            affected++;
            totalSev += f.severity_num;
          }
        }
        if (n > 0) {
          cells.set(`${finding}|${dl}`, {
            incidence: examined > 0 ? affected / examined : 0,
            avg_severity: affected > 0 ? totalSev / affected : 0,
            affected,
            n,
            examined,
          });
        }
      }
    }

    return { doseLevels, doseLabels, cells };
  }, [specimenHasRecovery, subjData, heatmapData]);

  // Pairwise Fisher's exact tests (each dose group vs control)
  interface PairwiseFisherResult { doseLabel: string; doseLevel: number; p: number }
  const pairwiseFisherResults = useMemo(() => {
    const map = new Map<string, PairwiseFisherResult[]>();
    if (!specimenData.length || !findingSummaries.length) return map;

    // Aggregate affected/total by finding × dose_level (combine sexes)
    const byFindingDose = new Map<string, Map<number, { affected: number; n: number; label: string }>>();
    for (const r of specimenData) {
      if (r.dose_label.toLowerCase().includes("recovery")) continue;
      let doseMap = byFindingDose.get(r.finding);
      if (!doseMap) { doseMap = new Map(); byFindingDose.set(r.finding, doseMap); }
      const existing = doseMap.get(r.dose_level);
      if (existing) { existing.affected += r.affected; existing.n += r.n; }
      else doseMap.set(r.dose_level, { affected: r.affected, n: r.n, label: r.dose_label });
    }

    for (const [finding, doseMap] of byFindingDose) {
      // Control = dose_level 0 (or lowest)
      const doseLevels = [...doseMap.keys()].sort((a, b) => a - b);
      if (doseLevels.length < 2) continue;
      const controlDose = doseLevels[0];
      const ctrl = doseMap.get(controlDose)!;
      const results: PairwiseFisherResult[] = [];
      for (const dl of doseLevels) {
        if (dl === controlDose) continue;
        const grp = doseMap.get(dl)!;
        const p = fishersExact2x2(grp.affected, grp.n - grp.affected, ctrl.affected, ctrl.n - ctrl.affected);
        results.push({ doseLabel: grp.label, doseLevel: dl, p });
      }
      if (results.length > 0) map.set(finding, results);
    }
    return map;
  }, [specimenData, findingSummaries]);

  // Dose group labels for Fisher's compact display (G1, G2, G3...)
  const doseGroupLabels = useMemo(() => {
    const levels = [...new Set(specimenData.filter(r => !r.dose_label.toLowerCase().includes("recovery")).map(r => r.dose_level))].sort((a, b) => a - b);
    const labelMap = new Map<number, string>();
    levels.forEach((dl, i) => labelMap.set(dl, `G${i + 1}`));
    return labelMap;
  }, [specimenData]);

  // Combined table data
  const tableData = useMemo<FindingTableRow[]>(
    () =>
      findingSummaries.map((fs) => {
        const pc = findingConsistency.get(fs.finding);
        const patternType = pc?.pattern ?? "NO_PATTERN";
        const trend = trendsByFinding.get(fs.finding);
        let isDoseDriven: boolean;
        let isNonMonotonic = false;
        switch (doseDepThreshold) {
          case "strong":
            isDoseDriven = ["MONOTONIC_UP", "MONOTONIC_DOWN", "THRESHOLD"].includes(patternType);
            break;
          case "ca_trend":
            isDoseDriven = trend?.ca_trend_p != null && trend.ca_trend_p < 0.05;
            break;
          case "severity_trend":
            isDoseDriven = trend?.severity_trend_p != null && trend.severity_trend_p < 0.05;
            break;
          case "fisher_pairwise": {
            const fisherResults = pairwiseFisherResults.get(fs.finding);
            isDoseDriven = fisherResults?.some((r) => r.p < 0.05) ?? false;
            break;
          }
          default: // "moderate"
            isDoseDriven = !["NO_PATTERN", "CONTROL_ONLY"].includes(patternType);
            break;
        }
        if (patternType === "NON_MONOTONIC") isNonMonotonic = true;
        // Derive direction from pattern
        const doseDirection: "increasing" | "decreasing" | "mixed" | "flat" =
          patternType === "MONOTONIC_DOWN" ? "decreasing"
          : ["MONOTONIC_UP", "THRESHOLD"].includes(patternType) ? "increasing"
          : patternType === "NON_MONOTONIC" ? "mixed"
          : "flat";
        const clin = findingClinical.get(fs.finding);
        const recAssessment = recoveryAssessments?.find((a) => a.finding === fs.finding);
        // Compute control and high-dose incidence for this finding
        const findingRows = specimenData.filter((r) => r.finding === fs.finding && !r.dose_label.toLowerCase().includes("recovery"));
        const doseMap = new Map<number, { affected: number; n: number }>();
        for (const r of findingRows) {
          const ex = doseMap.get(r.dose_level);
          if (ex) { ex.affected += r.affected; ex.n += r.n; }
          else doseMap.set(r.dose_level, { affected: r.affected, n: r.n });
        }
        const sortedDoses = [...doseMap.entries()].sort((a, b) => a[0] - b[0]);
        const ctrlEntry = sortedDoses.length > 0 ? sortedDoses[0][1] : null;
        const highEntry = sortedDoses.length > 1 ? sortedDoses[sortedDoses.length - 1][1] : null;
        const controlIncidence = ctrlEntry && ctrlEntry.n > 0 ? ctrlEntry.affected / ctrlEntry.n : 0;
        const highDoseIncidence = highEntry && highEntry.n > 0 ? highEntry.affected / highEntry.n : 0;
        // Override severity to "decreased" for decreasing findings (warning → decreased; adverse stays adverse)
        const effectiveSeverity: FindingTableRow["severity"] =
          doseDirection === "decreasing" && fs.severity === "warning" ? "decreased" : fs.severity;
        // Laterality aggregation (only for paired organs with laterality data)
        const latAgg = subjData?.subjects
          ? aggregateFindingLaterality(subjData.subjects, fs.finding)
          : undefined;
        const hasLat = latAgg && (latAgg.left > 0 || latAgg.right > 0 || latAgg.bilateral > 0);
        return {
          ...fs, severity: effectiveSeverity, isDoseDriven, isNonMonotonic, doseDirection,
          controlIncidence, highDoseIncidence,
          relatedOrgans: findingRelatedOrgans.get(fs.finding),
          relatedOrgansWithIncidence: findingRelatedOrgansWithIncidence.get(fs.finding),
          trendData: trend,
          clinicalClass: clin?.clinicalClass as FindingTableRow["clinicalClass"],
          catalogId: clin?.catalogId,
          recoveryVerdict: recAssessment?.overall,
          laterality: hasLat ? { left: latAgg.left, right: latAgg.right, bilateral: latAgg.bilateral } : undefined,
        };
      }),
    [findingSummaries, findingConsistency, findingRelatedOrgans, findingRelatedOrgansWithIncidence, findingClinical, doseDepThreshold, trendsByFinding, recoveryAssessments, pairwiseFisherResults, subjData?.subjects]
  );

  // Mortality masking: for NonMonotonic findings, check if high-dose mortality may mask findings
  const mortalityMaskFindings = useMemo(() => {
    const mask = new Set<string>();
    if (!subjData?.subjects) return mask;
    const mainSubjects = subjData.subjects.filter((s) => !s.is_recovery);
    if (mainSubjects.length === 0) return mask;

    // Get sorted dose levels
    const doseLevels = [...new Set(mainSubjects.map((s) => s.dose_level))].sort((a, b) => a - b);
    if (doseLevels.length < 3) return mask;
    const highestDose = doseLevels[doseLevels.length - 1];

    for (const row of tableData) {
      if (!row.isNonMonotonic) continue;
      // Check if highest dose has lower incidence than a mid-dose group
      const byDose = new Map<number, { affected: number; n: number }>();
      for (const dl of doseLevels) {
        const groupSubjects = mainSubjects.filter((s) => s.dose_level === dl);
        let affected = 0;
        for (const s of groupSubjects) {
          if (s.findings[row.finding] && s.findings[row.finding].severity_num > 0) affected++;
        }
        byDose.set(dl, { affected, n: groupSubjects.length });
      }
      const highDoseData = byDose.get(highestDose);
      if (!highDoseData || highDoseData.n === 0) continue;
      const highInc = highDoseData.affected / highDoseData.n;
      // Check mid-dose groups
      const midGroupsHigher = doseLevels.slice(0, -1).some((dl) => {
        const d = byDose.get(dl);
        return d && d.n > 0 && (d.affected / d.n) > highInc + 0.001;
      });
      if (!midGroupsHigher) continue;
      // Check for moribund/dead subjects at highest dose
      const highDoseSubjects = mainSubjects.filter((s) => s.dose_level === highestDose);
      const mortalityCount = highDoseSubjects.filter((s) =>
        s.disposition != null && (
          s.disposition.toUpperCase().includes("MORIBUND") ||
          s.disposition.toUpperCase().includes("FOUND DEAD") ||
          s.disposition.toUpperCase().includes("DIED")
        )
      ).length;
      if (mortalityCount > 0) mask.add(row.finding);
    }
    return mask;
  }, [tableData, subjData]);

  const findingColumns = useMemo(
    () => [
      findingColHelper.accessor("finding", {
        header: "Finding",
        size: 120,
        minSize: 60,
        maxSize: 260,
        cell: (info) => {
          const v = info.getValue();
          const sev = info.row.original.maxSeverity;
          return (
            <div className="flex items-center gap-1.5 overflow-hidden">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: getNeutralHeatColor(sev).bg }}
              />
              <span className={cn("truncate", sev >= 4 ? "font-bold" : sev >= 2 ? "font-semibold" : "font-medium")} title={v}>{v}</span>
            </div>
          );
        },
      }),
      findingColHelper.accessor("maxSeverity", {
        header: "Peak sev",
        size: 50,
        minSize: 40,
        maxSize: 80,
        cell: (info) => {
          const v = info.getValue();
          return (
            <span
              className={cn(
                "font-mono text-[10px]",
                v >= 4 ? "font-bold text-foreground" : v >= 2 ? "font-semibold text-foreground/80" : v > 0 ? "font-medium text-muted-foreground" : "text-muted-foreground/40",
              )}
              title={`Max severity: ${v.toFixed(1)} (scale 1\u20135)`}
            >
              {v > 0 ? v.toFixed(1) : "\u2013"}
            </span>
          );
        },
      }),
      findingColHelper.display({
        id: "incidence",
        header: "Incid.",
        size: 50,
        minSize: 42,
        maxSize: 80,
        cell: (info) => {
          const r = info.row.original;
          const peak = (r.maxIncidence ?? 0) * 100;
          return (
            <span
              className={cn(
                "font-mono text-[10px]",
                peak >= 30 ? "font-bold text-foreground" : peak >= 10 ? "font-semibold text-foreground/80" : peak > 0 ? "font-medium text-muted-foreground" : "text-muted-foreground/40",
              )}
              title={`Peak incidence: ${peak.toFixed(0)}%`}
            >
              {peak > 0 ? `${peak.toFixed(0)}%` : "\u2013"}
            </span>
          );
        },
      }),
      findingColHelper.accessor("severity", {
        header: "Signal",
        size: 60,
        minSize: 48,
        maxSize: 100,
        sortingFn: (a, b) => {
          const order: Record<string, number> = { adverse: 4, warning: 3, decreased: 1.5, normal: 1 };
          const aVal = a.original.clinicalClass && a.original.severity === "normal" ? 2 : order[a.original.severity] ?? 0;
          const bVal = b.original.clinicalClass && b.original.severity === "normal" ? 2 : order[b.original.severity] ?? 0;
          return aVal - bVal;
        },
        cell: (info) => {
          const sev = info.getValue();
          const cc = info.row.original.clinicalClass;
          const row = info.row.original;
          // Clinical class replaces misleading "normal" when present
          if (sev === "normal" && cc) {
            const label = cc === "Sentinel" ? "Sentinel"
              : cc === "HighConcern" ? "High concern"
              : cc === "ModerateConcern" ? "Moderate"
              : "Flag";
            return (
              <span
                className={signal.clinicalOverride}
                title={`Clinical catalog: ${cc} (${info.row.original.catalogId ?? ""}). Statistical severity: normal.`}
              >
                {label}
              </span>
            );
          }
          if (sev === "decreased") {
            const ctrlPct = Math.round(row.controlIncidence * 100);
            const hiPct = Math.round(row.highDoseIncidence * 100);
            return (
              <span
                className={signal.decreased}
                title={`Finding decreases with dose (control ${ctrlPct}% \u2192 high dose ${hiPct}%). Classified as decreased at study level.`}
              >
                decreased
              </span>
            );
          }
          return (
            <span className={sev === "adverse" ? signal.adverse : sev === "warning" ? signal.warning : signal.normal}>
              {sev}
            </span>
          );
        },
      }),
      findingColHelper.accessor("isDoseDriven", {
        header: () => {
          const labels: Record<typeof doseDepThreshold, { label: string; tooltip: string }> = {
            moderate: { label: "Dose-dep.", tooltip: "Heuristic: monotonic incidence increase across \u22652 dose groups. Click to change method." },
            strong: { label: "Dose-dep. (strict)", tooltip: "Heuristic: monotonic incidence increase across \u22653 dose groups. Click to change method." },
            ca_trend: { label: "CA trend", tooltip: "Cochran-Armitage exact permutation test for trend, p < 0.05. Click to change method." },
            severity_trend: { label: "J-T trend", tooltip: "Jonckheere-Terpstra ordered alternatives on severity grades, p < 0.05. Click to change method." },
            fisher_pairwise: { label: "Fisher vs ctrl", tooltip: "Fisher\u2019s exact test: each dose group vs control, p < 0.05. Click to change method." },
          };
          const { label, tooltip } = labels[doseDepThreshold];
          return (
            <span title={tooltip}>
              {label} <span className="text-muted-foreground/40">▾</span>
            </span>
          );
        },
        size: doseDepThreshold === "fisher_pairwise" ? 100 : 80,
        minSize: doseDepThreshold === "fisher_pairwise" ? 80 : 55,
        maxSize: 140,
        cell: (info) => {
          // Fisher's pairwise: show per-group indicators
          if (doseDepThreshold === "fisher_pairwise") {
            const results = pairwiseFisherResults.get(info.row.original.finding);
            if (!results || results.length === 0) {
              return <span className="text-muted-foreground/40">{"\u2013"}</span>;
            }
            const tipLines = ["Fisher\u2019s exact test vs control:", ...results.map(
              (r) => `  ${r.doseLabel}: p = ${r.p.toFixed(3)}${r.p < 0.01 ? " **" : r.p < 0.05 ? " *" : ""}`,
            )];
            return (
              <span className="font-mono text-[9px]" title={tipLines.join("\n")}>
                {results.map((r) => {
                  const label = doseGroupLabels.get(r.doseLevel) ?? `D${r.doseLevel}`;
                  if (r.p < 0.01) return <span key={r.doseLevel} className="text-muted-foreground">{label}:✓✓ </span>;
                  if (r.p < 0.05) return <span key={r.doseLevel} className="text-muted-foreground">{label}:✓ </span>;
                  return <span key={r.doseLevel} className="text-muted-foreground/40">{label}:{"\u2013"} </span>;
                })}
              </span>
            );
          }
          const isTrendStatistical = doseDepThreshold === "ca_trend" || doseDepThreshold === "severity_trend";
          const trend = info.row.original.trendData;
          if (isTrendStatistical) {
            const pVal = doseDepThreshold === "ca_trend" ? trend?.ca_trend_p : trend?.severity_trend_p;
            if (info.getValue()) {
              return (
                <span
                  className="text-muted-foreground"
                  title={`p = ${pVal != null ? pVal.toFixed(4) : "N/A"}`}
                >
                  ✓
                </span>
              );
            }
            // Not significant or no data
            const reason = pVal == null
              ? (doseDepThreshold === "severity_trend" ? "No severity data (MI domain only)" : "No trend data available")
              : `p = ${pVal.toFixed(4)} (not significant)`;
            return (
              <span className="text-muted-foreground/40" title={reason}>
                –
              </span>
            );
          }
          // Heuristic modes
          if (info.row.original.isNonMonotonic) {
            const hasMortMask = mortalityMaskFindings.has(info.row.original.finding);
            return (
              <span
                className="text-muted-foreground/70"
                title={`Non-monotonic dose-response: incidence does not increase consistently with dose but shows a significant pattern across multiple dose groups${hasMortMask ? "\n⚠ High-dose mortality may mask findings at top dose." : ""}`}
              >
                ⚡
              </span>
            );
          }
          return info.getValue() ? (
            <span
              className="text-muted-foreground"
              title={doseDepThreshold === "strong"
                ? "Monotonic incidence increase across 3+ dose groups"
                : "Incidence increases with dose or finding present in 2+ dose groups"}
            >
              ✓
            </span>
          ) : null;
        },
      }),
      ...(specimenHasRecovery
        ? [
            findingColHelper.accessor("recoveryVerdict", {
              header: "Recovery",
              size: 70,
              minSize: 55,
              maxSize: 120,
              cell: (info) => {
                const v = info.getValue();
                if (!v || v === "not_observed" || v === "no_data")
                  return <span className="text-muted-foreground/40">{"\u2014"}</span>;
                const recAssessment = recoveryAssessments?.find(
                  (a) => a.finding === info.row.original.finding,
                );
                const nature = classifyFindingNature(info.row.original.finding);
                const tip = buildRecoveryTooltip(recAssessment, subjData?.recovery_days, nature.nature !== "other" ? nature : null);
                // v3: not_examined → "∅ not examined" in font-medium
                if (v === "not_examined")
                  return <span className="text-[9px] font-medium text-foreground/70" title={tip}>{"\u2205"} not examined</span>;
                // v3: low_power → "~ low power" in muted/50
                if (v === "low_power")
                  return <span className="text-[9px] text-muted-foreground/50" title={tip}>~ low power</span>;
                // §4.2: insufficient_n → "† (N<3)" in muted/50
                if (v === "insufficient_n")
                  return <span className="text-[9px] text-muted-foreground/50" title={tip}>{"\u2020"} (N&lt;3)</span>;
                const arrow = verdictArrow(v);
                // §4.2: persistent, progressing, anomaly get font-medium emphasis
                const emphasis = v === "persistent" || v === "progressing" || v === "anomaly";
                return (
                  <span
                    className={cn(
                      "text-[9px]",
                      emphasis
                        ? "font-medium text-foreground/70"
                        : "text-muted-foreground",
                    )}
                    title={tip}
                  >
                    <span className="inline-block w-[10px] text-center">{arrow}</span> {v}
                  </span>
                );
              },
              sortingFn: (a, b) =>
                verdictPriority(b.original.recoveryVerdict) -
                verdictPriority(a.original.recoveryVerdict),
            }),
          ]
        : []),
      ...(showLaterality
        ? [
            findingColHelper.display({
              id: "laterality",
              header: "Lat.",
              size: 60,
              minSize: 40,
              maxSize: 90,
              cell: (info) => {
                const lat = info.row.original.laterality;
                if (!lat) return <span className="text-muted-foreground/40">{"\u2014"}</span>;
                const total = lat.left + lat.right + lat.bilateral;
                const tooltip = `Bilateral: ${lat.bilateral} subjects, Left only: ${lat.left}, Right only: ${lat.right}`;
                // Determine display label and style per spec
                const hasUnilateral = lat.left > 0 || lat.right > 0;
                const hasBilateral = lat.bilateral > 0;
                const isMixed = hasUnilateral && hasBilateral;
                const label = isMixed
                  ? "mixed"
                  : hasBilateral
                    ? "B"
                    : lat.left > 0 && lat.right > 0
                      ? "mixed"
                      : lat.left > 0
                        ? "L"
                        : "R";
                const colorClass = isMixed || (lat.left > 0 && lat.right > 0 && !hasBilateral)
                  ? "text-amber-600/70"
                  : label === "B"
                    ? "text-foreground"
                    : "text-muted-foreground";
                return (
                  <span className={`text-[9px] ${colorClass}`} title={tooltip}>
                    {label}{total > 1 && <span className="ml-0.5 text-muted-foreground/50">({total})</span>}
                  </span>
                );
              },
            }),
          ]
        : []),
      findingColHelper.accessor("relatedOrgans", {
        header: () => (
          <span title={"Cross-organ coherence (Rule R16):\nFindings with the same standardized name appearing in other specimens within this study. Matching is case-insensitive on the finding term.\n\nThis indicates anatomical spread, not necessarily biological relatedness. Use clinical judgment to assess whether cross-organ presence reflects systemic toxicity."}>
            Also in <span className="text-muted-foreground/40">{"\u24D8"}</span>
          </span>
        ),
        size: 140,
        minSize: 50,
        maxSize: 300,
        cell: (info) => {
          const organsWithInc = info.row.original.relatedOrgansWithIncidence;
          if (!organsWithInc || organsWithInc.length === 0) return null;
          return (
            <span className="flex flex-wrap gap-x-1 text-[9px]">
              {organsWithInc.map((o, i) => (
                <span key={o.organ}>
                  <button
                    type="button"
                    className="text-primary/70 hover:underline"
                    title={`Navigate to ${o.specimen}: ${info.row.original.finding}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSpecimenNavigate?.(o.specimen);
                    }}
                  >
                    {o.organ}
                  </button>
                  <span className="text-muted-foreground/60">
                    {" "}({Math.round(o.incidence * 100)}%)
                  </span>
                  {i < organsWithInc.length - 1 && <span className="text-muted-foreground/30">, </span>}
                </span>
              ))}
            </span>
          );
        },
      }),
    ],
    [doseDepThreshold, specimenHasRecovery, recoveryAssessments, subjData?.recovery_days, mortalityMaskFindings, pairwiseFisherResults, doseGroupLabels, showLaterality]
  );

  const filteredTableData = useMemo(
    () => hideZeroSeverity ? tableData.filter((r) => r.maxSeverity > 0) : tableData,
    [tableData, hideZeroSeverity],
  );

  const findingsTable = useReactTable({
    data: filteredTableData,
    columns: findingColumns,
    state: { sorting, columnSizing: findingColSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setFindingColSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  // ── Selection zone: selected row for header content ──
  const selectedRow = selection?.finding
    ? filteredTableData.find((r) => r.finding === selection.finding) ?? null
    : null;

  // ── Adaptive section layout ─────────────────────────────────
  // Matrix overhead: filter line + controls + legend + dose headers + subject IDs + sex/examined rows + padding.
  // Subject mode adds a checkbox row (~20px) and the overall overhead is larger (~200px vs ~130px for group).
  const matrixOverhead = matrixMode === "subject" ? 200 : 130;
  const naturalHeights = useMemo(() => {
    // Dose charts height: base 170 for main, add recovery bars + spacer when present
    const barsPerGroup = stableSexKeys.length > 1 ? stableSexKeys.length : 1;
    const recoveryCount = availableDoseGroups.recovery.length;
    const doseChartsHeight = specimenHasRecovery && recoveryCount > 0
      ? (stableDoseLevels.length * barsPerGroup + recoveryCount * barsPerGroup + 1) * 16 + 60
      : 170;
    return {
      findings: filteredTableData.length * 28 + 40,
      doseCharts: doseChartsHeight,
      matrix: (heatmapData?.findings.length ?? 5) * 24 + matrixOverhead,
    };
  }, [filteredTableData.length, heatmapData?.findings.length, matrixOverhead, specimenHasRecovery, stableDoseLevels.length, stableSexKeys.length, availableDoseGroups.recovery.length]);

  const {
    heights, showHint, hintFading, isStrip,
    handleDoubleClick, restoreDefaults, makeResizePointerDown,
  } = useSectionLayout(containerRef, naturalHeights);

  // Reset section layout when specimen changes
  useEffect(() => {
    restoreDefaults();
  }, [specimen, restoreDefaults]);

  return (
    <div ref={containerRef} className="relative flex flex-1 flex-col overflow-hidden">
      {/* One-time focus hint */}
      {showHint && (
        <div className={cn(
          "absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-muted/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-opacity duration-500",
          hintFading ? "opacity-0" : "opacity-100",
        )}>
          Tip: double-click any section header to maximize it. Double-click again to restore.
        </div>
      )}

      {/* ── Findings table ──────────────────────────────────── */}
      <SectionHeader
        height={heights.findings}
        title="Observed findings"
        count={(() => {
          const countStr = `${filteredTableData.length}${hideZeroSeverity ? ` of ${findingSummaries.length}` : ""} findings`;
          const peakSev = filteredTableData.reduce((max, f) => Math.max(max, f.maxSeverity), 0);
          const adverseCount = filteredTableData.filter((f) => f.severity === "adverse").length;
          const parts = [countStr];
          if (peakSev > 0) parts.push(`peak sev ${peakSev.toFixed(1)}`);
          if (adverseCount > 0) parts.push(`${adverseCount} adverse`);
          return parts.join(", ");
        })()}
        selectionZone={<FindingsSelectionZone findings={filteredTableData} selectedRow={selectedRow} isStrip={isStrip("findings")} onStripRestore={restoreDefaults} />}
        headerRight={
          <label className="flex items-center gap-1 text-[9px] font-normal normal-case tracking-normal text-muted-foreground">
            <input
              type="checkbox"
              checked={hideZeroSeverity}
              onChange={(e) => setHideZeroSeverity(e.target.checked)}
              className="h-3 w-3 rounded border-gray-300"
            />
            Hide zero severity
          </label>
        }
        onDoubleClick={() => handleDoubleClick("findings")}
        onStripClick={restoreDefaults}
      />
      {!isStrip("findings") && (
      <div style={{ height: heights.findings - 28 }} className="shrink-0 overflow-auto">
      <div className="px-4 py-2">
        {findingSummaries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No findings for this specimen.</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 z-10 bg-background">
              {findingsTable.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b bg-muted/30">
                  {hg.headers.map((header) => {
                    // Absorber column gets remaining space; all others shrink-to-content.
                    // Manual resize overrides with an explicit width.
                    const id = header.column.id;
                    const isAbsorber = id === "relatedOrgans";
                    const isResized = id in findingColSizing;
                    const colStyle: React.CSSProperties = isResized
                      ? { width: header.getSize() }
                      : isAbsorber
                        ? {}
                        : { width: 1, maxWidth: header.column.columnDef.maxSize };
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "relative cursor-pointer whitespace-nowrap px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground/70",
                          id === "maxSeverity" && "text-right",
                          id === "incidence" && "text-right",
                          id === "isDoseDriven" && "text-center",
                        )}
                        style={colStyle}
                        onDoubleClick={id === "isDoseDriven" ? undefined : header.column.getToggleSortingHandler()}
                        onClick={id === "isDoseDriven" ? (e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setDoseDepMenu({ x: rect.left, y: rect.bottom + 2 });
                        } : undefined}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " \u2191", desc: " \u2193" }[header.column.getIsSorted() as string] ?? ""}
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            "absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none touch-none",
                            header.column.getIsResizing() ? "bg-primary" : "hover:bg-primary/30"
                          )}
                        />
                      </th>
                    );
                  })}
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
                    data-finding={orig.finding}
                    className={cn(
                      "cursor-pointer border-b border-border/20 transition-colors hover:bg-accent/30",
                      isSelected && "bg-accent font-medium"
                    )}
                    onClick={() => onFindingClick(orig.finding)}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const id = cell.column.id;
                      const isAbsorber = id === "relatedOrgans";
                      const isResized = id in findingColSizing;
                      const colStyle: React.CSSProperties = isResized
                        ? { width: cell.column.getSize() }
                        : isAbsorber
                          ? {}
                          : { width: 1, maxWidth: cell.column.columnDef.maxSize };
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "whitespace-nowrap py-px px-1.5",
                            id === "maxSeverity" && "text-right",
                            id === "incidence" && "text-right",
                            id === "isDoseDriven" && "text-center",
                            id === "finding" && "overflow-hidden text-ellipsis",
                            isAbsorber && "overflow-hidden text-ellipsis",
                          )}
                          style={colStyle}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {/* Dose-dependence method dropdown */}
        {doseDepMenu && (
          <div
            ref={doseDepMenuRef}
            className="fixed z-50 min-w-[190px] rounded border bg-popover py-0.5 shadow-md"
            style={{ left: doseDepMenu.x, top: doseDepMenu.y }}
          >
            <div className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Heuristic
            </div>
            {([
              { value: "moderate" as const, label: "Heuristic: Moderate+", desc: "Monotonic increase across \u22652 dose groups" },
              { value: "strong" as const, label: "Heuristic: Strong only", desc: "Monotonic increase across \u22653 dose groups" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "flex w-full items-baseline gap-1.5 px-2 py-1 text-left hover:bg-accent/50",
                  doseDepThreshold === opt.value && "bg-accent/30",
                )}
                onClick={() => { setDoseDepThreshold(opt.value); setDoseDepMenu(null); }}
              >
                <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{doseDepThreshold === opt.value ? "✓" : ""}</span>
                <span className="text-[11px] font-medium">{opt.label}</span>
                <span className="text-[9px] text-muted-foreground">{opt.desc}</span>
              </button>
            ))}
            <div className="my-0.5 border-t border-border/40" />
            <div className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Statistical (trend)
            </div>
            {([
              { value: "ca_trend" as const, label: "Cochran-Armitage trend", desc: "Exact permutation test, p < 0.05" },
              { value: "severity_trend" as const, label: "Jonckheere-Terpstra trend", desc: "Ordered alternatives on severity, p < 0.05" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "flex w-full items-baseline gap-1.5 px-2 py-1 text-left hover:bg-accent/50",
                  doseDepThreshold === opt.value && "bg-accent/30",
                )}
                onClick={() => { setDoseDepThreshold(opt.value); setDoseDepMenu(null); }}
              >
                <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{doseDepThreshold === opt.value ? "✓" : ""}</span>
                <span className="text-[11px] font-medium">{opt.label}</span>
                <span className="text-[9px] text-muted-foreground">{opt.desc}</span>
              </button>
            ))}
            <div className="my-0.5 border-t border-border/40" />
            <div className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Statistical (pairwise)
            </div>
            {([
              { value: "fisher_pairwise" as const, label: "Fisher\u2019s exact vs control", desc: "Each group vs control, p < 0.05" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "flex w-full items-baseline gap-1.5 px-2 py-1 text-left hover:bg-accent/50",
                  doseDepThreshold === opt.value && "bg-accent/30",
                )}
                onClick={() => { setDoseDepThreshold(opt.value); setDoseDepMenu(null); }}
              >
                <span className="w-3 shrink-0 text-[10px] text-muted-foreground">{doseDepThreshold === opt.value ? "✓" : ""}</span>
                <span className="text-[11px] font-medium">{opt.label}</span>
                <span className="text-[9px] text-muted-foreground">{opt.desc}</span>
              </button>
            ))}
          </div>
        )}
        {/* Multiple testing footnote for statistical methods */}
        {(doseDepThreshold === "ca_trend" || doseDepThreshold === "severity_trend" || doseDepThreshold === "fisher_pairwise") && (
          <p className="px-1 py-0.5 text-[9px] italic text-muted-foreground/50">
            Statistical tests are unadjusted for multiplicity. Significance should be interpreted in context of dose-response pattern and biological plausibility.
          </p>
        )}
      </div>
      </div>
      )}

      {/* Resize handle between findings and dose charts */}
      {!isStrip("findings") && !isStrip("doseCharts") && (
        <HorizontalResizeHandle onPointerDown={makeResizePointerDown("findings")} />
      )}

      {/* ── Dose charts ─────────────────────────────────────── */}
      <SectionHeader
        height={heights.doseCharts}
        title={selection?.finding
          ? `Dose charts: ${selection.finding}`
          : "Dose charts (specimen aggregate)"}
        selectionZone={<DoseChartsSelectionZone findings={filteredTableData} selectedRow={selectedRow} heatmapData={heatmapData} recoveryHeatmapData={recoveryHeatmapData} specimenHasRecovery={specimenHasRecovery} />}
        onDoubleClick={() => handleDoubleClick("doseCharts")}
        onStripClick={restoreDefaults}
      />
      {!isStrip("doseCharts") && (
      <div style={{ height: heights.doseCharts - 28 }} className="shrink-0 overflow-hidden">
        <div className="flex h-full">
          <div className="relative flex-1 border-r border-border/30">
            <div className="absolute left-2 top-1 z-10 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Incidence</span>
              <ChartModeToggle mode={incidenceMode} onChange={setIncidenceMode} />
              {recoveryChartAnomalies && (
                <span className="text-[10px] text-muted-foreground" title={recoveryChartAnomalies.tooltip}>
                  {recoveryChartAnomalies.anomalyCount > 0 && <span className="mr-0.5">{"\u26A0"}</span>}
                  {recoveryChartAnomalies.insufficientCount > 0 && <span>{"\u2020"}</span>}
                </span>
              )}
            </div>
            {hasDoseChartData && doseChartOption ? (
              <EChartsWrapper
                option={doseChartOption}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                No incidence data.
              </div>
            )}
          </div>
          <div className="relative flex-1">
            <div className="absolute left-2 top-1 z-10 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Severity</span>
              <ChartModeToggle mode={severityMode} onChange={setSeverityMode} />
              {recoveryChartAnomalies && (
                <span className="text-[10px] text-muted-foreground" title={recoveryChartAnomalies.tooltip}>
                  {recoveryChartAnomalies.anomalyCount > 0 && <span className="mr-0.5">{"\u26A0"}</span>}
                  {recoveryChartAnomalies.insufficientCount > 0 && <span>{"\u2020"}</span>}
                </span>
              )}
            </div>
            {hasSeverityChartData && doseSeverityChartOption ? (
              <EChartsWrapper
                option={doseSeverityChartOption}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                No severity data.
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Resize handle between dose charts and matrix */}
      {!isStrip("doseCharts") && !isStrip("matrix") && (
        <HorizontalResizeHandle onPointerDown={makeResizePointerDown("doseCharts")} />
      )}

      {/* ── Severity matrix ─────────────────────────────────── */}
      <div id="severity-matrix-section" />
      <SectionHeader
        height={heights.matrix}
        titleContent={
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            SEVERITY MATRIX:{" "}
            <span
              className={cn("cursor-pointer", matrixMode === "group" ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground/60")}
              onClick={(e) => { e.stopPropagation(); setMatrixMode("group"); }}
            >GROUP</span>
            <span className="mx-0.5 text-muted-foreground/30">|</span>
            <span
              className={cn("cursor-pointer", matrixMode === "subject" ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground/60")}
              onClick={(e) => { e.stopPropagation(); setMatrixMode("subject"); }}
            >SUBJECTS</span>
          </span>
        }
        count={(() => {
          if (matrixMode === "subject") {
            const { filtered, total } = subjectModeFindingCounts;
            if (total === 0) return undefined;
            return filtered < total
              ? `${filtered} of ${total} findings`
              : `${filtered} findings`;
          }
          if (!heatmapData) return undefined;
          return heatmapData.findings.length < heatmapData.totalFindings
            ? `${heatmapData.findings.length} of ${heatmapData.totalFindings} findings`
            : `${heatmapData.findings.length} findings`;
        })()}
        selectionZone={<MatrixSelectionZone selectedRow={selectedRow} heatmapData={heatmapData} subjects={subjData?.subjects} isStrip={isStrip("matrix")} onStripRestore={restoreDefaults} />}
        onDoubleClick={() => handleDoubleClick("matrix")}
        onStripClick={restoreDefaults}
      />
      {!isStrip("matrix") && (
      <div style={{ height: heights.matrix - 28 }} className="shrink-0 overflow-auto">
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
              doseGroupOptions={doseGroupOptions}
              severityGradedOnly={severityGradedOnly}
              findingSeverityMap={heatmapData?.findingMeta ?? new Map()}
              comparisonSubjects={comparisonSubjects}
              onComparisonChange={onComparisonChange}
              onCompareClick={onCompareClick}
              showLaterality={showLaterality}
              controls={
                <FilterBar className="border-0 bg-transparent px-0">
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={severityGradedOnly}
                      onChange={(e) => setSeverityGradedOnly(e.target.checked)}
                      className="h-3 w-3 rounded border-gray-300"
                    />
                    Severity graded only
                  </label>
                  <FilterMultiSelect
                    options={doseGroupOptions}
                    selected={doseGroupFilter}
                    onChange={setDoseGroupFilter}
                    allLabel="All dose groups"
                  />
                  <FilterSelect
                    value={subjectSort}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSubjectSort(e.target.value as "dose" | "severity")}
                                      >
                    <option value="dose">Sort: dose group</option>
                    <option value="severity">Sort: max severity</option>
                  </FilterSelect>
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
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
              {severityGradedOnly && (() => {
                const parts: string[] = ["Severity graded only"];
                if (sexFilter) parts.push(sexFilter === "M" ? "Male" : "Female");
                if (minSeverity > 0) parts.push(`Severity ${minSeverity}+`);
                return <FilterShowingLine className="mb-1" parts={parts} />;
              })()}
              <FilterBar className="border-0 bg-transparent px-0">
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={severityGradedOnly}
                    onChange={(e) => setSeverityGradedOnly(e.target.checked)}
                    className="h-3 w-3 rounded border-gray-300"
                  />
                  Severity graded only
                </label>
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
              <p className="mb-0.5 text-[10px] text-muted-foreground">
                {heatmapView === "incidence"
                  ? "Cells show % animals affected per dose group."
                  : "Cells show average severity grade per dose group. Non-graded findings show incidence."}
              </p>
              {/* Legend */}
              <div className="mb-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] text-muted-foreground">
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
                      { label: "1 Minimal", color: getNeutralHeatColor(1).bg },
                      { label: "2 Mild", color: getNeutralHeatColor(2).bg },
                      { label: "3 Moderate", color: getNeutralHeatColor(3).bg },
                      { label: "4 Marked", color: getNeutralHeatColor(4).bg },
                      { label: "5 Severe", color: getNeutralHeatColor(5).bg },
                    ]
                ).map(({ label, color }) => (
                  <span key={label} className="flex items-center gap-0.5">
                    <span className={cn("inline-block h-3 w-3 rounded-sm", color === "transparent" && "border border-border")} style={{ backgroundColor: color }} />
                    {label}
                  </span>
                ))}
                <span className="mx-0.5 text-muted-foreground/30">|</span>
                <span className="flex items-center gap-0.5">
                  <span className="inline-block h-3 w-3 rounded-sm border border-dashed border-gray-200 bg-gray-50" />
                  0/N = examined, no finding
                </span>
                <span className="flex items-center gap-0.5">
                  <span className="inline-block h-3 w-3 rounded-sm" />
                  blank = not examined
                </span>
                <span className="flex items-center gap-0.5">
                  <span className="text-[7px] font-medium text-foreground/50">▴</span>
                  = max severity outlier
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
                        <DoseHeader level={dl} label={heatmapData.doseLabels.get(dl) ?? `Dose ${dl}`} />
                      </div>
                    ))}
                    {recoveryHeatmapData && (<>
                      <div className="mx-0.5 w-px self-stretch bg-border" />
                      <div className="shrink-0">
                        <div className="text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                          Recovery
                        </div>
                        <div className="flex">
                          {recoveryHeatmapData.doseLevels.map((dl) => (
                            <div
                              key={`R${dl}`}
                              className="w-20 shrink-0 text-center text-[10px] font-medium text-muted-foreground/60"
                              title={`Recovery: ${recoveryHeatmapData.doseLabels.get(dl) ?? `Dose ${dl}`}`}
                            >
                              {(recoveryHeatmapData.doseLabels.get(dl) ?? `${dl}`)} (R)
                            </div>
                          ))}
                        </div>
                      </div>
                    </>)}
                  </div>
                  {/* Data rows */}
                  {heatmapData.findings.map((finding) => (
                    <div
                      key={finding}
                      data-finding={finding}
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
                        const meta = heatmapData.findingMeta.get(finding);
                        const isNonGraded = meta && !meta.hasSeverityData;
                        if (!cell) {
                          // Not examined — blank (no inner block)
                          return (
                            <div key={dl} className="flex h-6 w-20 shrink-0 items-center justify-center" />
                          );
                        }
                        // Examined, no findings — dashed border with 0/N
                        if (cell.affected === 0 && (cell.avg_severity ?? 0) === 0) {
                          return (
                            <div key={dl} className="flex h-6 w-20 shrink-0 items-center justify-center">
                              <div
                                className="flex h-5 w-16 items-center justify-center rounded-sm border border-dashed border-gray-200 bg-gray-50 font-mono text-[9px] text-muted-foreground/50"
                                title={`${finding} — ${heatmapData.doseLabels.get(dl) ?? `Dose ${dl}`}\nExamined: ${cell.n} subjects\nFinding not observed`}
                              >
                                0/{cell.n}
                              </div>
                            </div>
                          );
                        }
                        // Non-graded findings in severity mode: show incidence %
                        if (heatmapView === "severity" && isNonGraded) {
                          return (
                            <div key={dl} className="flex h-6 w-20 shrink-0 items-center justify-center">
                              <div
                                className="flex h-5 w-12 items-center justify-center rounded-sm bg-gray-100 font-mono text-[10px] text-muted-foreground"
                                title={`Incidence: ${cell.affected}/${cell.n} (no severity grade)`}
                              >
                                {`${(cell.incidence * 100).toFixed(0)}%`}
                              </div>
                            </div>
                          );
                        }
                        const cellColors = heatmapView === "incidence"
                          ? getNeutralHeatColor01(cell.incidence)
                          : getNeutralHeatColor(cell.avg_severity ?? 0);
                        const cellLabel = heatmapView === "incidence"
                          ? `${(cell.incidence * 100).toFixed(0)}%`
                          : (cell.avg_severity ?? 0) > 0 ? cell.avg_severity.toFixed(1) : `${cell.affected}/${cell.n}`;
                        const hasMaxSevOutlier = cell.max_severity >= 3 && (cell.max_severity - (cell.avg_severity ?? 0)) >= 2;
                        const incPct = (cell.incidence * 100).toFixed(0);
                        const extendedTooltip = `${finding} — ${heatmapData.doseLabels.get(dl) ?? `Dose ${dl}`}\nAvg severity: ${cell.avg_severity != null ? cell.avg_severity.toFixed(1) : "N/A"}\nMax severity: ${cell.max_severity}\nAffected: ${cell.affected}/${cell.n} (${incPct}%)`;
                        return (
                          <div
                            key={dl}
                            className="flex h-6 w-20 shrink-0 items-center justify-center"
                          >
                            <div
                              className="relative flex h-5 w-16 items-center justify-center rounded-sm text-[9px] font-medium"
                              style={{
                                backgroundColor: cellColors.bg,
                                color: cellColors.text,
                              }}
                              title={extendedTooltip}
                            >
                              {cellLabel}
                              {hasMaxSevOutlier && (
                                <span className="absolute right-0.5 top-0 text-[7px] font-medium text-foreground/50" title={`Max severity outlier: ${cell.max_severity}`}>
                                  ▴
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {recoveryHeatmapData && (<>
                        <div className="mx-0.5 w-px self-stretch bg-border" />
                        {recoveryHeatmapData.doseLevels.map((dl) => {
                          const rCell = recoveryHeatmapData.cells.get(`${finding}|${dl}`);
                          const mainCell = heatmapData.cells.get(`${finding}|${dl}`);
                          const rMeta = heatmapData.findingMeta.get(finding);
                          const rIsNonGraded = rMeta && !rMeta.hasSeverityData;

                          // v3 §6.5 Guard 0: not examined → ∅
                          if (rCell && rCell.examined === 0) {
                            return (
                              <div key={`R${dl}`} className="flex h-6 w-20 shrink-0 items-center justify-center">
                                <div
                                  className="flex h-5 w-16 items-center justify-center rounded-sm text-[10px] text-muted-foreground/30"
                                  title={`Not examined (0/${rCell.n} examined)`}
                                >
                                  {"\u2205"}
                                </div>
                              </div>
                            );
                          }

                          // v3 §6.5 Guard 1: insufficient examined → †
                          if (rCell && rCell.examined < MIN_RECOVERY_N) {
                            return (
                              <div key={`R${dl}`} className="flex h-6 w-20 shrink-0 items-center justify-center">
                                <div
                                  className="flex h-5 w-16 items-center justify-center rounded-sm text-[10px] text-muted-foreground/30"
                                  title={`Recovery N=${rCell.examined} examined, too few for comparison`}
                                >
                                  {"\u2020"}
                                </div>
                              </div>
                            );
                          }

                          // §6.5 Guard 2: anomaly — main=0, recovery>0 → ⚠
                          const mainInc = mainCell?.incidence ?? 0;
                          if (rCell && mainInc === 0 && rCell.incidence > 0) {
                            return (
                              <div key={`R${dl}`} className="flex h-6 w-20 shrink-0 items-center justify-center">
                                <div
                                  className="flex h-5 w-16 items-center justify-center rounded-sm text-[10px] text-muted-foreground/50"
                                  title="Finding present in recovery but not in main arm \u2014 anomaly"
                                >
                                  {"\u26A0"}
                                </div>
                              </div>
                            );
                          }

                          // v3 §6.5 Guard 3: low power → ~
                          if (rCell && mainInc * rCell.examined < 2) {
                            return (
                              <div key={`R${dl}`} className="flex h-6 w-20 shrink-0 items-center justify-center">
                                <div
                                  className="flex h-5 w-16 items-center justify-center rounded-sm text-[10px] text-muted-foreground/30"
                                  title={`Low power: main ${Math.round(mainInc * 100)}%, expected \u2248${(mainInc * rCell.examined).toFixed(1)} affected in ${rCell.examined} examined`}
                                >
                                  ~
                                </div>
                              </div>
                            );
                          }

                          // §6.5: Main incidence = 0, recovery incidence = 0 → empty
                          if (!rCell || (mainInc === 0 && rCell.incidence === 0)) {
                            return (
                              <div key={`R${dl}`} className="flex h-6 w-20 shrink-0 items-center justify-center">
                                <div className="h-5 w-16 rounded-sm bg-gray-50" />
                              </div>
                            );
                          }

                          // Non-graded findings in severity mode: show incidence %
                          if (heatmapView === "severity" && rIsNonGraded) {
                            return (
                              <div key={`R${dl}`} className="flex h-6 w-20 shrink-0 items-center justify-center">
                                <div
                                  className="flex h-5 w-12 items-center justify-center rounded-sm bg-gray-100 font-mono text-[10px] text-muted-foreground"
                                  title={`Recovery — Incidence: ${rCell.affected}/${rCell.n} (no severity grade)`}
                                >
                                  {`${(rCell.incidence * 100).toFixed(0)}%`}
                                </div>
                              </div>
                            );
                          }

                          // Normal heat-colored cell
                          const rColors = heatmapView === "incidence"
                            ? getNeutralHeatColor01(rCell.incidence)
                            : getNeutralHeatColor(rCell.avg_severity ?? 0);
                          const rLabel = heatmapView === "incidence"
                            ? `${(rCell.incidence * 100).toFixed(0)}%`
                            : (rCell.avg_severity ?? 0) > 0 ? rCell.avg_severity.toFixed(1) : `${rCell.affected}/${rCell.n}`;
                          return (
                            <div
                              key={`R${dl}`}
                              className="flex h-6 w-20 shrink-0 items-center justify-center"
                            >
                              <div
                                className="flex h-5 w-16 items-center justify-center rounded-sm text-[9px] font-medium"
                                style={{
                                  backgroundColor: rColors.bg,
                                  color: rColors.text,
                                }}
                                title={`Recovery — Severity: ${rCell.avg_severity != null ? rCell.avg_severity.toFixed(1) : "N/A"}, Incidence: ${rCell.affected}/${rCell.n}`}
                              >
                                {rLabel}
                              </div>
                            </div>
                          );
                        })}
                      </>)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2">
              <div className="py-8 text-center text-xs text-muted-foreground">
                {specimenData.length === 0 ? "No data for this specimen." : "No heatmap data available."}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SubjectHeatmap ──────────────────────────────────────
// Subject-level severity matrix: one column per subject, grouped by dose group.
// Cells show severity grade (1-5) color-coded with getNeutralHeatColor().

const SEV_LABELS: Record<number, string> = { 1: "Minimal", 2: "Mild", 3: "Moderate", 4: "Marked", 5: "Severe" };

const MAX_COMPARISON_SUBJECTS = 8;

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
  doseGroupOptions = [],
  severityGradedOnly = false,
  findingSeverityMap,
  controls,
  comparisonSubjects,
  onComparisonChange,
  onCompareClick,
  showLaterality = false,
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
  doseGroupFilter?: ReadonlySet<string> | null;
  doseGroupOptions?: { key: string; label: string; group?: string }[];
  severityGradedOnly?: boolean;
  findingSeverityMap?: Map<string, { maxSev: number; hasSeverityData: boolean }>;
  controls?: React.ReactNode;
  comparisonSubjects?: Set<string>;
  onComparisonChange?: (subjects: Set<string>) => void;
  onCompareClick?: () => void;
  showLaterality?: boolean;
}) {
  // Selected subject for column highlight
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  // Track last checked subject for shift+click range select
  const lastCheckedRef = useRef<string | null>(null);
  // Toast state for max subjects message
  const [maxToast, setMaxToast] = useState(false);

  // Resizable finding label column
  const { width: labelColW, onPointerDown: onLabelResize } = useResizePanel(124, 100, 400);

  // Filter subjects: dose group first (so control subjects survive), then sex, then affected-only
  const subjects = useMemo(() => {
    if (!subjData) return [];
    let filtered = subjData;
    if (doseGroupFilter !== null) {
      filtered = filtered.filter((s) => {
        const key = `${s.is_recovery ? "R" : ""}${s.dose_level}`;
        return doseGroupFilter.has(key);
      });
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

  // All unique findings (rows) — include non-graded, apply filters
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
    let entries = [...findingMaxSev.entries()].map(([f, maxSev]) => {
      const hasGrade = findingSeverityMap?.get(f)?.hasSeverityData ?? (maxSev > 0);
      return { finding: f, maxSev, hasSeverityData: hasGrade };
    });
    if (severityGradedOnly) entries = entries.filter((e) => e.hasSeverityData);
    entries = entries.filter((e) => !e.hasSeverityData || e.maxSev >= minSeverity);
    return entries
      .sort((a, b) => {
        if (a.hasSeverityData && !b.hasSeverityData) return -1;
        if (!a.hasSeverityData && b.hasSeverityData) return 1;
        if (a.hasSeverityData && b.hasSeverityData) return b.maxSev - a.maxSev;
        return a.finding.localeCompare(b.finding);
      })
      .map((e) => e.finding);
  }, [subjects, minSeverity, severityGradedOnly, findingSeverityMap]);

  // Map finding → hasSeverityData for cell rendering
  const findingGradeMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!findingSeverityMap) return map;
    for (const [f, meta] of findingSeverityMap) {
      map.set(f, meta.hasSeverityData);
    }
    return map;
  }, [findingSeverityMap]);

  // Group subjects by dose level + recovery status
  const doseGroups = useMemo(() => {
    const groups: { doseLevel: number; doseLabel: string; isRecovery: boolean; subjects: typeof subjects }[] = [];
    let currentKey = "";
    for (const subj of subjects) {
      const key = `${subj.is_recovery ? "R" : ""}${subj.dose_level}`;
      if (key !== currentKey) {
        currentKey = key;
        const label = subj.is_recovery ? `${formatDoseShortLabel(subj.dose_label)} (Recovery)` : formatDoseShortLabel(subj.dose_label);
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

  // Flatten all visible subjects for range-select
  const allVisibleSubjects = useMemo(() => doseGroups.flatMap((dg) => dg.subjects), [doseGroups]);

  // Toggle comparison subject (with max enforcement)
  const toggleComparison = useCallback((id: string, shiftKey: boolean) => {
    if (!comparisonSubjects || !onComparisonChange) return;
    const next = new Set(comparisonSubjects);

    if (shiftKey && lastCheckedRef.current) {
      // Range select: all subjects between lastChecked and current
      const ids = allVisibleSubjects.map((s) => s.usubjid);
      const from = ids.indexOf(lastCheckedRef.current);
      const to = ids.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        for (let i = lo; i <= hi; i++) {
          if (next.size < MAX_COMPARISON_SUBJECTS) next.add(ids[i]);
        }
      }
    } else {
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_COMPARISON_SUBJECTS) {
          setMaxToast(true);
          setTimeout(() => setMaxToast(false), 3000);
          return;
        }
        next.add(id);
      }
    }
    lastCheckedRef.current = id;
    onComparisonChange(next);
  }, [comparisonSubjects, onComparisonChange, allVisibleSubjects]);

  // Toggle all subjects in a dose group
  const toggleDoseGroup = useCallback((groupSubjects: SubjectHistopathEntry[]) => {
    if (!comparisonSubjects || !onComparisonChange) return;
    const groupIds = groupSubjects.map((s) => s.usubjid);
    const allSelected = groupIds.every((id) => comparisonSubjects.has(id));
    const next = new Set(comparisonSubjects);
    if (allSelected) {
      for (const id of groupIds) next.delete(id);
    } else {
      for (const id of groupIds) {
        if (next.size < MAX_COMPARISON_SUBJECTS) next.add(id);
      }
    }
    onComparisonChange(next);
  }, [comparisonSubjects, onComparisonChange]);

  // Column tint helper
  const colTint = (subjId: string) => {
    const isSingleSelected = selectedSubject === subjId;
    const isCompSelected = comparisonSubjects?.has(subjId) ?? false;
    if (isSingleSelected) return "bg-blue-50/50";
    if (isCompSelected) return "bg-amber-50/40";
    return "";
  };

  // Selection bar summary
  const selectionBarInfo = useMemo(() => {
    if (!comparisonSubjects || comparisonSubjects.size === 0) return null;
    const infos: string[] = [];
    for (const id of comparisonSubjects) {
      const s = allVisibleSubjects.find((sub) => sub.usubjid === id);
      if (s) infos.push(`${shortId(id)} (${s.sex}, ${formatDoseShortLabel(s.dose_label)})`);
      else infos.push(shortId(id));
    }
    return infos;
  }, [comparisonSubjects, allVisibleSubjects]);

  // Empty state message (null = show matrix)
  const emptyMessage = isLoading
    ? null
    : !subjData || subjects.length === 0
      ? "Subject-level data not available for this specimen."
      : findings.length === 0
        ? "No findings match the current filters."
        : null;

  return (
    <div className="relative border-b p-3">
      {/* Active filter summary */}
      {!isLoading && subjData && (() => {
        const parts: string[] = [];
        if (doseGroupFilter !== null) {
          const labels = doseGroupOptions
            .filter((o) => doseGroupFilter.has(o.key))
            .map((o) => o.group ? `${o.label} (R)` : o.label);
          parts.push(labels.join(", "));
        } else {
          parts.push("All groups");
        }
        parts.push(sexFilter ? (sexFilter === "M" ? "Male" : "Female") : "Both sexes");
        if (minSeverity > 0) parts.push(`Severity ${minSeverity}+`);
        if (severityGradedOnly) parts.push("Severity graded only");
        if (affectedOnly) parts.push("Affected only");
        return <FilterShowingLine className="mb-1" parts={parts} />;
      })()}

      {/* Controls */}
      {controls}

      {/* Severity legend */}
      {!isLoading && subjData && (
        <div className="flex items-center gap-1 px-3 pb-2 pt-1 text-[10px] text-muted-foreground">
          <span>Severity:</span>
          {[
            { label: "1 Minimal", color: getNeutralHeatColor(1).bg },
            { label: "2 Mild", color: getNeutralHeatColor(2).bg },
            { label: "3 Moderate", color: getNeutralHeatColor(3).bg },
            { label: "4 Marked", color: getNeutralHeatColor(4).bg },
            { label: "5 Severe", color: getNeutralHeatColor(5).bg },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-0.5">
              <span className={cn("inline-block h-3 w-3 rounded-sm", color === "transparent" && "border border-border")} style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
          <span className="ml-2 flex items-center gap-1">
            <span className="text-[10px] text-gray-400">●</span>
            = present (no grade)
          </span>
          <span className="ml-2">&mdash; = examined, no finding</span>
          <span className="ml-2">blank = not examined</span>
        </div>
      )}

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

      <div className="mt-1 overflow-x-auto">
        <div className="inline-block">
          {/* Tier 1: Dose group headers */}
          <div className="flex">
            <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: labelColW }}>
              {/* Resize handle */}
              <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30"
                onPointerDown={onLabelResize}
              />
            </div>
            {doseGroups.map((dg, gi) => {
              const groupIds = dg.subjects.map((s) => s.usubjid);
              const allChecked = comparisonSubjects ? groupIds.every((id) => comparisonSubjects.has(id)) : false;
              const someChecked = comparisonSubjects ? groupIds.some((id) => comparisonSubjects.has(id)) : false;

              return (
              <div
                key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`}
                className={cn(
                  "flex-shrink-0 border-b",
                  gi > 0 && "border-l-2 border-border"
                )}
              >
                <div className="text-center" style={{ width: dg.subjects.length * 32 }}>
                  <div className="h-0.5 rounded-full" style={{ backgroundColor: getDoseGroupColor(dg.doseLevel) }} />
                  <div className="flex items-center justify-center gap-1 px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {comparisonSubjects && onComparisonChange && (
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                        onChange={() => toggleDoseGroup(dg.subjects)}
                        className="h-3 w-3 rounded-sm border-gray-300"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {dg.doseLabel} ({dg.subjects.length})
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {/* Tier 2: Subject IDs */}
          <div className="flex">
            <div className="sticky left-0 z-10 shrink-0 bg-background py-0.5 text-right pr-2 text-[8px] font-semibold text-muted-foreground" style={{ width: labelColW }}>
              Subject ID
            </div>
            {doseGroups.map((dg, gi) => (
              <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                {dg.subjects.map((subj) => (
                  <button
                    key={subj.usubjid}
                    className={cn(
                      "w-8 shrink-0 cursor-pointer py-0.5 text-center font-mono text-[9px] text-muted-foreground hover:bg-accent/30",
                      colTint(subj.usubjid),
                    )}
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

          {/* Laterality header row (paired organs only) */}
          {showLaterality && (
            <div className="flex">
              <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: labelColW }} />
              {doseGroups.map((dg, gi) => (
                <div key={`lat-${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                  {dg.subjects.map((subj) => {
                    // Compute per-subject laterality summary
                    const latValues = Object.values(subj.findings)
                      .map((f) => f.laterality?.toUpperCase())
                      .filter(Boolean) as string[];
                    const hasLeft = latValues.some((l) => l === "LEFT");
                    const hasRight = latValues.some((l) => l === "RIGHT");
                    const hasBilateral = latValues.some((l) => l === "BILATERAL");
                    const label = hasBilateral ? "B" : (hasLeft && hasRight) ? "B" : hasLeft ? "L" : hasRight ? "R" : "";
                    return (
                      <div
                        key={subj.usubjid}
                        className={cn(
                          "w-8 shrink-0 text-center text-[7px] font-medium text-muted-foreground",
                          colTint(subj.usubjid),
                        )}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Checkbox row for comparison selection */}
          {comparisonSubjects && onComparisonChange && (
            <div className="flex">
              <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: labelColW }} />
              {doseGroups.map((dg, gi) => (
                <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                  {dg.subjects.map((subj) => (
                    <div
                      key={subj.usubjid}
                      className={cn(
                        "flex h-5 w-8 shrink-0 items-center justify-center",
                        colTint(subj.usubjid),
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={comparisonSubjects.has(subj.usubjid)}
                        onChange={(e) => toggleComparison(subj.usubjid, (e.nativeEvent as MouseEvent).shiftKey)}
                        className="h-3 w-3 rounded-sm border-gray-300"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Sex indicator row */}
          {!sexFilter && (
            <div className="flex">
              <div className="sticky left-0 z-10 shrink-0 bg-background py-0.5 text-right pr-2 text-[8px] font-semibold text-muted-foreground" style={{ width: labelColW }}>
                Sex
              </div>
              {doseGroups.map((dg, gi) => (
                <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                  {dg.subjects.map((subj) => (
                    <div
                      key={subj.usubjid}
                      className={cn(
                        "flex h-4 w-8 shrink-0 items-center justify-center text-[8px] font-semibold text-muted-foreground",
                        colTint(subj.usubjid),
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
          <div className="flex border-b">
            <div className="sticky left-0 z-10 shrink-0 bg-background py-0.5 text-right pr-2 text-[9px] text-muted-foreground" style={{ width: labelColW }}>
              Examined
            </div>
            {doseGroups.map((dg, gi) => (
              <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                {dg.subjects.map((subj) => {
                  const hasAny = Object.keys(subj.findings).length > 0;
                  return (
                    <div
                      key={subj.usubjid}
                      className={cn(
                        "flex h-4 w-8 shrink-0 items-center justify-center text-[9px] text-muted-foreground",
                        colTint(subj.usubjid),
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
                className="sticky left-0 z-10 shrink-0 truncate bg-background py-0.5 pr-2 text-[10px]"
                style={{ width: labelColW }}
                title={finding}
              >
                {finding}
              </div>
              {/* Cells per dose group */}
              {doseGroups.map((dg, gi) => (
                <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
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
                          colTint(subj.usubjid),
                        )}
                        title={
                          hasEntry
                            ? `${subj.usubjid}: ${finding} \u2014 ${entry.severity ?? SEV_LABELS[sevNum] ?? "N/A"}`
                            : `${subj.usubjid}: not observed`
                        }
                      >
                        {sevNum > 0 ? (
                          <div
                            className="relative flex h-5 w-6 items-center justify-center rounded-sm font-mono text-[9px]"
                            style={{ backgroundColor: colors!.bg, color: colors!.text }}
                          >
                            {sevNum}
                            {showLaterality && entry?.laterality && (() => {
                              const lat = entry.laterality!.toUpperCase();
                              if (lat === "BILATERAL") return null;
                              return (
                                <span
                                  className={cn("absolute top-0 h-1.5 w-1.5 rounded-full opacity-70", lat === "LEFT" ? "left-0" : "right-0")}
                                  style={{ backgroundColor: colors!.text }}
                                  title={lat === "LEFT" ? "Left" : "Right"}
                                />
                              );
                            })()}
                          </div>
                        ) : hasEntry && findingGradeMap.get(finding) ? (
                          <span className="text-[9px] text-muted-foreground">&mdash;</span>
                        ) : hasEntry ? (
                          <span className="relative text-[10px] text-gray-400">
                            ●
                            {showLaterality && entry?.laterality && (() => {
                              const lat = entry.laterality!.toUpperCase();
                              if (lat === "BILATERAL") return null;
                              return (
                                <span
                                  className={cn("absolute top-0 h-1 w-1 rounded-full bg-gray-400", lat === "LEFT" ? "-left-1" : "-right-1")}
                                  title={lat === "LEFT" ? "Left" : "Right"}
                                />
                              );
                            })()}
                          </span>
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

      </>)}

      {/* Selection bar for comparison */}
      {selectionBarInfo && selectionBarInfo.length > 0 && (
        <div className="flex items-center gap-2 border-t bg-muted/30 px-3 py-1.5 text-xs">
          <span className="font-medium text-foreground">
            {comparisonSubjects!.size} subjects selected:
          </span>
          <span
            className="flex-1 truncate text-muted-foreground"
            title={selectionBarInfo.join(", ")}
          >
            {selectionBarInfo.join(", ")}
          </span>
          <button
            disabled={comparisonSubjects!.size < 2}
            onClick={onCompareClick}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Compare
          </button>
          <button
            onClick={() => onComparisonChange?.(new Set())}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            Clear
          </button>
        </div>
      )}

      {/* Max subjects toast */}
      {maxToast && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-muted/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          Maximum {MAX_COMPARISON_SUBJECTS} subjects for comparison. Deselect one to add another.
        </div>
      )}
    </div>
  );
}

// ─── Hypotheses tab — specimen-level exploratory tools ──────

type SpecimenToolIntent = "severity" | "treatment" | "peer" | "doseTrend" | "recovery";

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
  { value: "peer", label: "Peer comparison", icon: Users, available: true, description: "Compare against historical control incidence data (mock)" },
  { value: "doseTrend", label: "Dose-severity trend", icon: TrendingUp, available: true, description: "Severity and incidence changes across dose groups" },
  { value: "recovery", label: "Recovery assessment", icon: Undo2, available: false, description: "Classify recovery patterns across all findings in specimen" },
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

function PeerComparisonToolContent({
  specimenName,
  specimenData,
  specimen,
}: {
  specimenName: string;
  specimenData?: LesionSeverityRow[];
  specimen?: string;
}) {
  // Compute control group incidence per finding
  const peerRows = useMemo(() => {
    if (!specimenData || !specimen) return [];

    // Get unique findings
    const findings = [...new Set(specimenData.filter(r => !r.dose_label.toLowerCase().includes("recovery")).map(r => r.finding))];

    // Aggregate control group incidence per finding
    const controlByFinding = new Map<string, { affected: number; n: number }>();
    for (const r of specimenData) {
      if (r.dose_label.toLowerCase().includes("recovery")) continue;
      if (r.dose_level !== 0) continue; // Control group only
      const existing = controlByFinding.get(r.finding);
      if (existing) { existing.affected += r.affected; existing.n += r.n; }
      else controlByFinding.set(r.finding, { affected: r.affected, n: r.n });
    }

    // If no dose_level 0 (no labeled control), try lowest dose
    if (controlByFinding.size === 0) {
      const minDose = Math.min(...specimenData.filter(r => !r.dose_label.toLowerCase().includes("recovery")).map(r => r.dose_level));
      for (const r of specimenData) {
        if (r.dose_label.toLowerCase().includes("recovery")) continue;
        if (r.dose_level !== minDose) continue;
        const existing = controlByFinding.get(r.finding);
        if (existing) { existing.affected += r.affected; existing.n += r.n; }
        else controlByFinding.set(r.finding, { affected: r.affected, n: r.n });
      }
    }

    // Look up HCD for each finding
    const organName = specimen.toLowerCase().replace(/_/g, " ");
    const rows: Array<{
      finding: string;
      controlIncidence: number;
      hcd: HistoricalControlData | null;
      status: HCDStatus;
    }> = [];

    for (const finding of findings) {
      const ctrl = controlByFinding.get(finding);
      const controlInc = ctrl && ctrl.n > 0 ? ctrl.affected / ctrl.n : 0;
      const hcd = getHistoricalControl(finding, organName);
      const status: HCDStatus = hcd ? classifyVsHCD(controlInc, hcd) : "no_data";
      rows.push({ finding, controlIncidence: controlInc, hcd, status });
    }

    // Sort: Above range first, then At upper, then others
    rows.sort((a, b) => {
      const sd = HCD_STATUS_SORT[a.status] - HCD_STATUS_SORT[b.status];
      if (sd !== 0) return sd;
      return b.controlIncidence - a.controlIncidence;
    });

    return rows;
  }, [specimenData, specimen]);

  if (peerRows.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md border bg-muted/30">
        <p className="text-[11px] text-muted-foreground/50">No findings data for peer comparison.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={Users} viewerType="Peer Comparison" context={`${specimenName} vs. HCD`} />
      <p className="text-xs text-muted-foreground">
        Control group incidence compared against historical control data (HCD) for the same strain.
        Findings with incidence above the HCD range may indicate treatment-related effects rather than spontaneous background.
      </p>

      {/* Peer comparison table */}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider">Finding</th>
            <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">Study ctrl</th>
            <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">HCD range</th>
            <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {peerRows.map(({ finding, controlIncidence, hcd, status }) => (
            <tr key={finding} className="border-b border-dashed">
              <td className="max-w-[120px] truncate py-1 text-[11px] font-medium" title={finding}>
                {finding}
              </td>
              <td className="py-1 text-right font-mono text-muted-foreground">
                {Math.round(controlIncidence * 100)}%
              </td>
              <td className="py-1 text-right text-muted-foreground">
                {hcd ? (
                  <span title={`n=${hcd.n_studies} studies, mean=${Math.round(hcd.mean_incidence * 100)}%`}>
                    <span className="font-mono">{Math.round(hcd.min_incidence * 100)}{"\u2013"}{Math.round(hcd.max_incidence * 100)}%</span>
                    <br />
                    <span className="text-[9px] text-muted-foreground/60">mean {Math.round(hcd.mean_incidence * 100)}%, n={hcd.n_studies}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground/40">{"\u2014"}</span>
                )}
              </td>
              <td className="py-1 text-right">
                {status === "no_data" ? (
                  <span className="text-muted-foreground/40">No data</span>
                ) : (
                  <span className={cn(
                    "text-[9px]",
                    status === "above_range"
                      ? "font-medium text-foreground"
                      : status === "at_upper"
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60",
                  )}>
                    {status === "above_range" && "\u25B2 "}
                    {status === "at_upper" && "\u26A0 "}
                    {HCD_STATUS_LABELS[status]}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mock badge */}
      <div className="flex items-center gap-2">
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">mock</span>
        <span className="text-[9px] text-muted-foreground/50">Simulated historical control data (SD rat, 14-24 studies)</span>
      </div>

      <HypProductionNote>
        Production version will query facility-specific historical control database with strain, age, and laboratory matching.
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
  specimenHasRecovery,
  recoveryClassifications,
  specimenRecoveryClassification,
  onFindingClick,
  specimenData,
  specimen,
}: {
  specimenName: string;
  findingCount: number;
  selectedFinding?: string | null;
  specimenHasRecovery: boolean;
  recoveryClassifications: Array<{ finding: string; classification: RecoveryClassification; findingNature?: FindingNatureInfo }> | null;
  specimenRecoveryClassification: RecoveryClassification | undefined;
  onFindingClick: (finding: string) => void;
  specimenData?: LesionSeverityRow[];
  specimen?: string;
}) {
  const [intent, setIntent] = useState<SpecimenToolIntent>("severity");

  // Build tools list with recovery availability gated on specimenHasRecovery
  const activeTools = useMemo(() =>
    SPECIMEN_TOOLS.map((t) =>
      t.value === "recovery" ? { ...t, available: specimenHasRecovery } : t,
    ),
    [specimenHasRecovery],
  );

  // Auto-switch intent when a finding is selected:
  // - Treatment-related wins if both apply (higher priority)
  // - Recovery fires when finding has recovery data but no treatment classification
  useEffect(() => {
    if (!selectedFinding) return;
    // Check if finding has a non-UNCLASSIFIABLE recovery classification
    const findingRecClass = recoveryClassifications?.find(
      (c) => c.finding === selectedFinding,
    );
    const hasRecovery =
      findingRecClass != null &&
      findingRecClass.classification.classification !== "UNCLASSIFIABLE";
    // Treatment wins by default; recovery only when specimen has recovery data
    // and finding has a meaningful recovery classification
    if (hasRecovery) {
      setIntent("recovery");
    } else {
      setIntent("treatment");
    }
  }, [selectedFinding, recoveryClassifications]);
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
    const available = activeTools.filter((t) => t.available);
    if (!dropdownSearch) return available;
    const q = dropdownSearch.toLowerCase();
    return available.filter(
      (t) => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [dropdownSearch, activeTools]);

  const favTools = useMemo(
    () => favorites.map((f) => activeTools.find((t) => t.value === f)!).filter(Boolean),
    [favorites, activeTools]
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
            {favorites.includes(contextMenu.tool) ? "Remove from Favorites" : "Add to Favorites"}
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
          <PeerComparisonToolContent
            specimenName={specimenName}
            specimenData={specimenData}
            specimen={specimen}
          />
        )}
        {intent === "doseTrend" && (
          <DoseSeverityTrendPlaceholder specimenName={specimenName} selectedFinding={selectedFinding} />
        )}
        {intent === "recovery" && (
          <RecoveryAssessmentToolContent
            specimenName={specimenName}
            recoveryClassifications={recoveryClassifications}
            specimenRecoveryClassification={specimenRecoveryClassification}
            onFindingClick={onFindingClick}
          />
        )}
      </div>
    </div>
  );
}

// ─── Recovery assessment tool content ─────────────────────

function RecoveryAssessmentToolContent({
  specimenName,
  recoveryClassifications,
  specimenRecoveryClassification,
  onFindingClick,
}: {
  specimenName: string;
  recoveryClassifications: Array<{ finding: string; classification: RecoveryClassification; findingNature?: FindingNatureInfo }> | null;
  specimenRecoveryClassification: RecoveryClassification | undefined;
  onFindingClick: (finding: string) => void;
}) {
  if (!recoveryClassifications || recoveryClassifications.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md border bg-muted/30">
        <p className="text-[11px] text-muted-foreground/50">No recovery data for this specimen.</p>
      </div>
    );
  }

  // Count concerning classifications
  const concerningCount = recoveryClassifications.filter(
    (c) =>
      c.classification.classification === "INCOMPLETE_RECOVERY" ||
      c.classification.classification === "DELAYED_ONSET_POSSIBLE" ||
      c.classification.classification === "PATTERN_ANOMALY",
  ).length;

  // Sort by classification priority (most concerning first)
  const sorted = [...recoveryClassifications].sort(
    (a, b) =>
      CLASSIFICATION_PRIORITY[a.classification.classification] -
      CLASSIFICATION_PRIORITY[b.classification.classification],
  );

  // Deduplicate missing inputs across all classifications
  const allMissing = [...new Set(recoveryClassifications.flatMap((c) => c.classification.inputsMissing))];

  return (
    <div className="space-y-3">
      <HypViewerPlaceholder icon={Undo2} viewerType="Recovery Assessment" context={specimenName} />

      {/* Specimen-level summary */}
      {specimenRecoveryClassification && (
        <div className={cn("py-1 pl-2", CLASSIFICATION_BORDER[specimenRecoveryClassification.classification])}>
          <div className="text-[11px] font-medium">
            Specimen-level: {CLASSIFICATION_LABELS[specimenRecoveryClassification.classification]} ({specimenRecoveryClassification.confidence} confidence)
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {concerningCount > 0
              ? `${concerningCount} of ${recoveryClassifications.length} findings show incomplete or delayed recovery.`
              : `${recoveryClassifications.length} findings assessed \u2014 no concerning recovery patterns.`}
          </div>
        </div>
      )}

      {/* Findings table */}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider">Finding</th>
            <th className="pb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider">Nature</th>
            <th className="pb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider">Classification</th>
            <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ finding, classification, findingNature }) => {
            const isProliferative = findingNature?.nature === "proliferative";
            return (
              <tr
                key={finding}
                className="cursor-pointer border-b border-dashed transition-colors hover:bg-muted/40"
                onClick={() => onFindingClick(finding)}
              >
                <td className="max-w-[120px] truncate py-1 font-medium" title={finding}>
                  {finding}
                </td>
                <td className="py-1 text-muted-foreground" title={findingNature ? reversibilityLabel(findingNature) : undefined}>
                  {findingNature ? titleCase(findingNature.nature) : "\u2014"}
                </td>
                <td className={cn("py-1", isProliferative ? "text-muted-foreground/40" : "text-muted-foreground")}>
                  {isProliferative ? "not applicable" : CLASSIFICATION_LABELS[classification.classification]}
                </td>
                <td className={cn("py-1 text-right", isProliferative ? "text-muted-foreground/40" : "text-muted-foreground")}>
                  {isProliferative ? "\u2014" : classification.confidence}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Missing inputs */}
      {allMissing.length > 0 && (
        <div className="border-l border-border/40 pl-2 text-[10px] text-muted-foreground/50">
          {allMissing.map((m) => (
            <div key={m}>{m.replace(/_/g, " ")} not available</div>
          ))}
        </div>
      )}

      <HypConfigLine items={[["Classification method", "Rule-based (5 categories)"]]} />
      <HypProductionNote>Include historical controls (toggle disabled \u2014 requires peer comparison data)</HypProductionNote>
    </div>
  );
}

// ─── Main: HistopathologyView ──────────────────────────────

type EvidenceTab = "overview" | "hypotheses" | "compare";

export function HistopathologyView() {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { selection: studySelection, navigateTo } = useStudySelection();
  const { setSelection: setViewSelection, setSelectedSubject, pendingCompare, setPendingCompare } = useViewSelection();
  const { data: lesionData, isLoading, error } = useLesionSeveritySummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: trendData } = useFindingDoseTrends(studyId);

  // Read selected specimen from StudySelectionContext
  const selectedSpecimen = studySelection.specimen ?? null;
  const [activeTab, setActiveTab] = useState<EvidenceTab>("overview");
  const [selection, setSelection] = useState<HistopathSelection | null>(null);
  const [comparisonSubjects, setComparisonSubjects] = useState<Set<string>>(new Set());
  const { filters } = useGlobalFilters();
  const sexFilter = filters.sex;
  const minSeverity = filters.minSeverity;

  // E-1: Consume pendingCompare from context panel recovery pane
  useEffect(() => {
    if (pendingCompare && pendingCompare.length >= 2) {
      setComparisonSubjects(new Set(pendingCompare));
      setActiveTab("compare");
      setPendingCompare(null);
    }
  }, [pendingCompare, setPendingCompare]);

  // Subject data for recovery assessment (React Query caches, so shared with OverviewTab)
  const { data: subjData } = useHistopathSubjects(studyId, selectedSpecimen);

  // Lab correlation for summary strip
  const labCorrelation = useSpecimenLabCorrelation(studyId, selectedSpecimen);

  // Signal data for syndrome detection + organ weight confidence
  const { data: signalData } = useStudySignalSummary(studyId);

  // Syndrome detection (runs once per study, cached via useMemo)
  const syndromeMatches = useMemo(() => {
    if (!lesionData) return [];
    const organMap = new Map<string, LesionSeverityRow[]>();
    for (const r of lesionData) {
      if (!r.specimen) continue;
      const key = r.specimen.toUpperCase();
      const arr = organMap.get(key) ?? [];
      arr.push(r);
      organMap.set(key, arr);
    }
    return detectSyndromes(organMap, signalData ?? null);
  }, [lesionData, signalData]);

  // Derived: specimen summaries
  const specimenSummaries = useMemo(() => {
    if (!lesionData) return [];
    return deriveSpecimenSummaries(lesionData, ruleResults, trendData, syndromeMatches, signalData);
  }, [lesionData, ruleResults, trendData, syndromeMatches, signalData]);

  // Auto-select top specimen on load (spec §5.2)
  const autoSelectDone = useRef(false);
  useEffect(() => {
    if (autoSelectDone.current) return;
    if (!specimenSummaries.length || studySelection.specimen) return;

    autoSelectDone.current = true;
    const top = specimenSummaries[0]; // sorted by signal score desc
    navigateTo({
      organSystem: specimenToOrganSystem(top.specimen),
      specimen: top.specimen,
    });
  }, [specimenSummaries, studySelection.specimen, navigateTo]);

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

  // Trends for selected specimen
  const trendsByFinding = useMemo(() => {
    const map = new Map<string, FindingDoseTrend>();
    if (!trendData || !selectedSpecimen) return map;
    for (const t of trendData) {
      if (t.specimen === selectedSpecimen) {
        map.set(t.finding, t);
      }
    }
    return map;
  }, [trendData, selectedSpecimen]);

  // Recovery assessment for specimen summary strip
  const specimenRecoveryOverall = useMemo(() => {
    if (!subjData?.subjects?.some((s) => s.is_recovery)) return null;
    const findingNames = findingSummaries.map((f) => f.finding);
    if (findingNames.length === 0) return null;
    const assessments = deriveRecoveryAssessments(findingNames, subjData.subjects);
    return specimenRecoveryLabel(assessments);
  }, [subjData, findingSummaries]);

  // Recovery classifications (interpretive layer — for Hypotheses tab)
  const specimenHasRecovery = useMemo(
    () => subjData?.subjects?.some((s) => s.is_recovery) ?? false,
    [subjData],
  );

  const allRecoveryClassifications = useMemo(() => {
    if (!specimenHasRecovery || !subjData?.subjects) return null;
    const findingNames = findingSummaries.map((f) => f.finding);
    if (findingNames.length === 0) return null;
    const assessments = deriveRecoveryAssessments(findingNames, subjData.subjects);

    // Build per-finding clinical catalog lookup
    const findingClinicalMap = new Map<string, { clinicalClass: string; catalogId: string }>();
    if (ruleResults && selectedSpecimen) {
      const specLower = selectedSpecimen.toLowerCase();
      for (const r of ruleResults) {
        const cc = r.params?.clinical_class;
        const cid = r.params?.catalog_id;
        if (!cc || !cid) continue;
        const rSpec = (r.params?.specimen ?? "").toLowerCase();
        if (rSpec !== specLower) continue;
        const finding = r.params?.finding ?? "";
        if (finding && !findingClinicalMap.has(finding)) {
          findingClinicalMap.set(finding, { clinicalClass: cc, catalogId: cid });
        }
      }
    }

    return assessments.map((assessment) => {
      const finding = assessment.finding;
      const clinical = findingClinicalMap.get(finding);
      const specLower = (selectedSpecimen ?? "").toLowerCase();
      const findingLower = finding.toLowerCase();
      const findingRulesLocal = (ruleResults ?? []).filter(
        (r) =>
          (r.params?.finding && r.params.finding.toLowerCase().includes(findingLower)) &&
          (r.params?.specimen && r.params.specimen.toLowerCase() === specLower),
      );
      const isAdverse = findingRulesLocal.some(
        (r) =>
          r.rule_id === "R04" || r.rule_id === "R12" || r.rule_id === "R13" ||
          (r.rule_id === "R10" && r.severity === "warning"),
      );
      const trend = trendData?.find(
        (t) => t.finding === finding && t.specimen === selectedSpecimen,
      );
      const findingPattern = classifyFindingPattern(specimenData, finding, trend?.ca_trend_p ?? null, null, false);
      const doseConsistency = patternToLegacyConsistency(findingPattern.pattern, findingPattern.confidence);
      const findingNature = classifyFindingNature(finding);

      const signalClass: "adverse" | "warning" | "normal" = isAdverse
        ? "adverse"
        : clinical
          ? "warning"
          : "normal";

      const classification = classifyRecovery(assessment, {
        isAdverse,
        doseConsistency,
        doseResponsePValue: trend?.ca_trend_p ?? null,
        clinicalClass: clinical?.clinicalClass ?? null,
        signalClass,
        findingNature,
        historicalControlIncidence: null,
        crossDomainCorroboration: null,
        recoveryPeriodDays: null,
      });

      return { finding, classification, findingNature };
    });
  }, [specimenHasRecovery, subjData, findingSummaries, ruleResults, specimenData, trendData, selectedSpecimen]);

  const specimenRecoveryClassification = useMemo(() => {
    if (!allRecoveryClassifications || allRecoveryClassifications.length === 0) return undefined;
    return classifySpecimenRecovery(allRecoveryClassifications.map((c) => c.classification));
  }, [allRecoveryClassifications]);

  // Reset finding selection and comparison when specimen changes (from shell rail)
  // If endpoint is set (from cross-organ navigation), auto-select that finding
  useEffect(() => {
    const autoFinding = studySelection.endpoint ?? undefined;
    setSelection(selectedSpecimen ? { specimen: selectedSpecimen, finding: autoFinding } : null);
    setComparisonSubjects(new Set());
    // Clear the endpoint hint after consuming it
    if (autoFinding) navigateTo({ endpoint: undefined });
  }, [selectedSpecimen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch away from Compare tab when selection drops below 2
  useEffect(() => {
    if (activeTab === "compare" && comparisonSubjects.size < 2) {
      setActiveTab("overview");
    }
  }, [activeTab, comparisonSubjects.size]);

  // Bridge finding-level selection to ViewSelectionContext for context panel
  useEffect(() => {
    if (selection?.specimen) {
      setViewSelection({ _view: "histopathology", specimen: selection.specimen, finding: selection.finding, sex: selection.sex });
    } else {
      setViewSelection(null);
    }
  }, [selection, setViewSelection]);

  // Cross-view navigation from location.state — clear after consuming
  useEffect(() => {
    const state = location.state as { specimen?: string } | null;
    if (state?.specimen) {
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  // Escape clears finding selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleHeatmapClick = (finding: string) => {
    if (!selectedSpecimen) return;
    const row = specimenData.find((r) => r.finding === finding);
    if (row) {
      const sel: HistopathSelection = { finding, specimen: row.specimen };
      const isSame = selection?.finding === finding;
      setSelection(isSame ? null : sel);
    }
  };

  const handleFindingClick = (finding: string) => {
    if (!selectedSpecimen) return;
    const sel: HistopathSelection = { finding, specimen: selectedSpecimen };
    const isSame = selection?.finding === finding && selection?.specimen === selectedSpecimen;
    setSelection(isSame ? null : sel);
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
    <div className="flex h-full flex-col overflow-hidden">
      {selectedSummary && (
        <>
          {/* Specimen summary strip */}
          <div className="shrink-0 border-b bg-background px-3 py-1.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{selectedSummary.specimen.replace(/_/g, " ")}</h2>
              {selectedSummary.domains.map((d) => (
                <DomainLabel key={d} domain={d} />
              ))}
              <span className="text-[10px] text-muted-foreground">{deriveSexLabel(specimenData)}</span>
              {selectedSummary.adverseCount > 0 && (
                <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {selectedSummary.adverseCount} adverse
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-4 text-[10px] text-muted-foreground">
              <span>Peak incidence: <span className="font-mono font-medium">{Math.round(selectedSummary.maxIncidence * 100)}%</span></span>
              <span>Max sev: <span className="font-mono font-medium">{selectedSummary.maxSeverity.toFixed(1)}</span></span>
              <span className="inline-flex items-center gap-1">
                <SparklineGlyph values={selectedSummary.pattern.sparkline} pattern={selectedSummary.pattern.pattern} />
                <span className="font-medium">{formatPatternLabel(selectedSummary.pattern)}</span>
              </span>
              <span>Findings: <span className="font-mono font-medium">{selectedSummary.findingCount}</span>
                {selectedSummary.warningCount > 0 && <> ({selectedSummary.adverseCount}adv/{selectedSummary.warningCount}warn)</>}
              </span>
              {selectedSummary.sexSkew && (
                <span>Sex: <span className="font-medium">{selectedSummary.sexSkew === "M>F" ? "males higher" : selectedSummary.sexSkew === "F>M" ? "females higher" : "balanced"}</span></span>
              )}
              {specimenRecoveryOverall && specimenRecoveryOverall !== "reversed" && (
                <span>Recovery: <span className="font-medium">{specimenRecoveryOverall}</span></span>
              )}
              {labCorrelation.hasData && labCorrelation.topSignal && labCorrelation.topSignal.signal >= 2 && (
                <span
                  className="cursor-pointer hover:underline"
                  title={`Top lab signal: ${labCorrelation.topSignal.test} ${labCorrelation.topSignal.pctChange >= 0 ? "+" : ""}${labCorrelation.topSignal.pctChange.toFixed(0)}% vs control — click to view lab correlates`}
                  onClick={() => {
                    // Scroll to / expand Lab correlates pane in context panel
                    const el = document.querySelector('[data-pane="lab-correlates"]');
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }}
                >
                  Lab: <span className="font-mono font-medium">
                    {labCorrelation.topSignal.signal >= 3 ? "●●●" : "●●"}{" "}
                    {labCorrelation.topSignal.test} {labCorrelation.topSignal.pctChange >= 0 ? "+" : ""}{labCorrelation.topSignal.pctChange.toFixed(0)}%
                  </span>
                </span>
              )}
            </div>
            {/* Syndrome line */}
            {selectedSummary.pattern.syndrome && (
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground/70" title={`${selectedSummary.pattern.syndrome.syndrome.syndrome_name}: ${selectedSummary.pattern.syndrome.requiredFinding}${selectedSummary.pattern.syndrome.supportingFindings.length > 0 ? ` + ${selectedSummary.pattern.syndrome.supportingFindings.join(", ")}` : ""}`}>
                {"\uD83D\uDD17"} {selectedSummary.pattern.syndrome.syndrome.syndrome_name}: {selectedSummary.pattern.syndrome.requiredFinding}
                {selectedSummary.pattern.syndrome.supportingFindings.length > 0 && ` + ${selectedSummary.pattern.syndrome.supportingFindings.join(", ")}`}
              </div>
            )}
            {/* Pattern alerts */}
            {selectedSummary.pattern.alerts.length > 0 && (
              <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                {selectedSummary.pattern.alerts.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && " \u00B7 "}
                    {a.priority === "HIGH" || a.priority === "MEDIUM" ? "\u26A0" : "\u24D8"} {a.text}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Tab bar */}
          <ViewTabBar
            tabs={[
              { key: "overview", label: "Evidence" },
              { key: "hypotheses", label: "Hypotheses" },
              ...(comparisonSubjects.size >= 2
                ? [{ key: "compare", label: "Compare", count: comparisonSubjects.size }]
                : []),
            ]}
            value={activeTab}
            onChange={(k) => setActiveTab(k as typeof activeTab)}
          />

          {/* Tab content — OverviewTab stays mounted to preserve state */}
          <div className={cn("flex min-h-0 flex-1 flex-col", activeTab !== "overview" && "hidden")}>
            <OverviewTab
              specimenData={specimenData}
              findingSummaries={findingSummaries}
              allRuleResults={ruleResults ?? []}
              specimen={selectedSpecimen!}
              selection={selection}
              onFindingClick={handleFindingClick}
              onHeatmapClick={handleHeatmapClick}
              onSubjectClick={setSelectedSubject}
              sexFilter={sexFilter}
              minSeverity={minSeverity}
              studyId={studyId}
              trendsByFinding={trendsByFinding}
              comparisonSubjects={comparisonSubjects}
              onComparisonChange={setComparisonSubjects}
              onCompareClick={() => setActiveTab("compare")}
              allLesionData={lesionData}
              onSpecimenNavigate={(spec) => {
                const organ = specimenToOrganSystem(spec);
                navigateTo({ organSystem: organ, specimen: spec });
              }}
            />
          </div>
          {activeTab === "hypotheses" && (
            <HistopathHypothesesTab
              specimenName={selectedSummary.specimen.replace(/_/g, " ")}
              findingCount={findingSummaries.length}
              selectedFinding={selection?.finding}
              specimenHasRecovery={specimenHasRecovery}
              recoveryClassifications={allRecoveryClassifications}
              specimenRecoveryClassification={specimenRecoveryClassification}
              onFindingClick={handleFindingClick}
              specimenData={specimenData}
              specimen={selectedSpecimen ?? undefined}
            />
          )}
          {activeTab === "compare" && studyId && (
            <CompareTab
              studyId={studyId}
              specimen={selectedSpecimen!}
              subjectIds={[...comparisonSubjects]}
              onEditSelection={() => {
                setActiveTab("overview");
                // Double rAF ensures DOM has updated after tab switch before scrolling
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    document.getElementById("severity-matrix-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                });
              }}
              onFindingClick={handleFindingClick}
            />
          )}
        </>
      )}

      {!selectedSummary && specimenSummaries.length > 0 && (() => {
        const organFilter = studySelection.organSystem;
        if (organFilter) {
          // Organ-level aggregate: show specimens belonging to this organ system
          const organSpecimens = specimenSummaries.filter(
            (s) => specimenToOrganSystem(s.specimen).toLowerCase() === organFilter.toLowerCase()
          );
          const totalFindings = organSpecimens.reduce((sum, s) => sum + s.findingCount, 0);
          const totalAdverse = organSpecimens.reduce((sum, s) => sum + s.adverseCount, 0);
          const maxScore = organSpecimens.length > 0
            ? Math.max(...organSpecimens.map((s) => s.signalScore))
            : 0;

          return (
            <div className="flex flex-1 flex-col overflow-y-auto p-4">
              {/* Organ system header */}
              <div className="mb-3">
                <h2 className="text-sm font-semibold">{titleCase(organFilter)}</h2>
                <div className="mt-1 flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>{organSpecimens.length} specimen{organSpecimens.length !== 1 ? "s" : ""}</span>
                  <span>{totalFindings} finding{totalFindings !== 1 ? "s" : ""}</span>
                  {totalAdverse > 0 && <span>{totalAdverse} adverse</span>}
                  <span>Peak signal: <span className="font-mono font-medium">{maxScore.toFixed(2)}</span></span>
                </div>
              </div>

              {/* Specimen list */}
              <div className="flex flex-col gap-1">
                {organSpecimens.map((s) => (
                  <button
                    key={s.specimen}
                    className="flex items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                    onClick={() => navigateTo({ organSystem: organFilter, specimen: s.specimen })}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {s.specimen.replace(/_/g, " ")}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {s.signalScore.toFixed(2)}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {s.findingCount} finding{s.findingCount !== 1 ? "s" : ""}
                    </span>
                    {s.adverseCount > 0 && (
                      <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {s.adverseCount} adverse
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatPatternLabel(s.pattern)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a specimen from the rail to view histopathology details.
          </div>
        );
      })()}

      {specimenSummaries.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No histopathology data available.
        </div>
      )}
    </div>
  );
}
