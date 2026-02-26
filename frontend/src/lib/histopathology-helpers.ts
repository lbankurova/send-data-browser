/**
 * Shared types and pure functions extracted from HistopathologyView.
 * Consumed by: CompareTab, DoseChartsSelectionZone, FindingsSelectionZone,
 *              MatrixSelectionZone, HistopathologyContextPanel, SpecimenRailMode.
 */

import type { LesionSeverityRow, RuleResult, FindingDoseTrend, SignalSummaryRow } from "@/types/analysis-views";
import type { SyndromeMatch } from "@/lib/syndrome-rules";
import type { PatternClassification } from "@/lib/pattern-classification";
import { classifySpecimenPattern, patternWeight, formatPatternLabel } from "@/lib/pattern-classification";
import type { PathologyReview } from "@/types/annotations";
import type { RecoveryVerdict } from "@/lib/recovery-assessment";

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
  dominantDistribution?: string | null;
  dominantTemporality?: string | null;
  modifierRaw?: string[];
}

export interface HeatmapData {
  doseLevels: number[];
  doseLabels: Map<number, string>;
  findings: string[];
  cells: Map<string, { incidence: number; avg_severity: number; affected: number; n: number; max_severity: number }>;
  findingMeta: Map<string, { maxSev: number; hasSeverityData: boolean }>;
  totalFindings: number;
}

// ─── Neutral heat color (§6.1 evidence tier) ─────────────

export function getNeutralHeatColor(avgSev: number): { bg: string; text: string } {
  if (avgSev >= 5) return { bg: "#4B5563", text: "white" };
  if (avgSev >= 4) return { bg: "#6B7280", text: "white" };
  if (avgSev >= 3) return { bg: "#9CA3AF", text: "var(--foreground)" };
  if (avgSev >= 2) return { bg: "#D1D5DB", text: "var(--foreground)" };
  return { bg: "transparent", text: "var(--muted-foreground)" };
}

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
    if (row.severity_status === "graded" && row.avg_severity! > entry.maxSev) entry.maxSev = row.avg_severity!;
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
      { domain: "MI", isHighestDoseGroup: specimenPattern.isHighestDoseGroup },
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
    if (row.severity_status === "graded" && row.avg_severity! > entry.maxSev) entry.maxSev = row.avg_severity!;
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
