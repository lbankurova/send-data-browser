/**
 * Pattern classification, confidence scoring, alerts, and sparkline computation
 * for histopathology dose-response analysis.
 *
 * Replaces the old 4-tier getDoseConsistency system with a 7-type pattern
 * classification, 3-level confidence scoring with modifier boosts, and
 * sparkline visualization data.
 */

import type { SyndromeMatch } from "./syndrome-rules";
import type { LesionSeverityRow, FindingDoseTrend, SignalSummaryRow } from "@/types/analysis-views";
import type { LateralityAggregate } from "./laterality";
import { lateralitySignalModifier } from "./laterality";

// ── Types ───────────────────────────────────────────────────

export type PatternType =
  | "MONOTONIC_UP"
  | "MONOTONIC_DOWN"
  | "THRESHOLD"
  | "NON_MONOTONIC"
  | "SINGLE_GROUP"
  | "CONTROL_ONLY"
  | "NO_PATTERN";

export type ConfidenceLevel = "HIGH" | "MODERATE" | "LOW";

export interface PatternAlert {
  id: string;
  priority: "HIGH" | "MEDIUM" | "INFO";
  text: string;
}

export interface PatternClassification {
  pattern: PatternType;
  confidence: ConfidenceLevel;
  detail: string | null;
  sparkline: number[];
  confidenceFactors: string[];
  alerts: PatternAlert[];
  syndrome: SyndromeMatch | null;
  /** For SINGLE_GROUP: true when the affected group is the highest dose */
  isHighestDoseGroup?: boolean;
}

export interface DoseGroupData {
  dose_level: number;
  dose_label: string;
  incidence: number;
  avg_severity: number;
  n_affected: number;
  n_examined: number;
  is_control: boolean;
}

export interface PatternConfig {
  monotonic_tolerance: number;
  control_threshold: number;
  min_affected_non_monotonic: number;
}

const DEFAULT_CONFIG: PatternConfig = {
  monotonic_tolerance: 0.02,
  control_threshold: 0.05,
  min_affected_non_monotonic: 2,
};

// ── Signal score weights ─────────────────────────────────────

const PATTERN_BASE: Record<PatternType, number> = {
  MONOTONIC_UP: 2.5,
  THRESHOLD: 2.0,
  NON_MONOTONIC: 1.5,
  SINGLE_GROUP: 0.75,    // IMP-07: lowered from 1.0 (often incidental)
  MONOTONIC_DOWN: 0.5,   // histopath default; domain-aware in patternWeight
  CONTROL_ONLY: 0,
  NO_PATTERN: 0,
};

/** Domain-specific MONOTONIC_DOWN weights (IMP-07) */
const MONOTONIC_DOWN_BY_DOMAIN: Record<string, number> = {
  MI: 0.5,    // Histopath incidence — decreasing lesion rarely adverse
  OM: 2.0,    // Organ weight — dose-dependent decrease is classic tox
  LB: 1.5,    // Clinical chemistry — decreases can be significant
  BW: 2.0,    // Body weight — dose-dependent decrease is adverse
  MA: 0.5,    // Macroscopic — similar to histopath
};

const CONF_MULT: Record<ConfidenceLevel, number> = {
  HIGH: 1.0,
  MODERATE: 0.7,
  LOW: 0.4,
};

// ── Utility ──────────────────────────────────────────────────

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ── Build dose group data ────────────────────────────────────

export function buildDoseGroupData(
  rows: LesionSeverityRow[],
  finding?: string,
): DoseGroupData[] {
  const filtered = finding
    ? rows.filter((r) => r.finding === finding && !r.dose_label.toLowerCase().includes("recovery"))
    : rows.filter((r) => !r.dose_label.toLowerCase().includes("recovery"));

  const groupMap = new Map<number, {
    dose_label: string;
    n_affected: number;
    n_examined: number;
    total_severity: number;
    severity_count: number;
  }>();

  for (const r of filtered) {
    const existing = groupMap.get(r.dose_level);
    if (existing) {
      existing.n_affected += r.affected;
      existing.n_examined += r.n;
      if (r.avg_severity != null) {
        existing.total_severity += (r.avg_severity * r.affected);
        existing.severity_count += r.affected;
      }
    } else {
      groupMap.set(r.dose_level, {
        dose_label: r.dose_label,
        n_affected: r.affected,
        n_examined: r.n,
        total_severity: r.severity_status === "graded" ? r.avg_severity! * r.affected : 0,
        severity_count: r.severity_status === "graded" ? r.affected : 0,
      });
    }
  }

  const sorted = [...groupMap.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.map(([dose_level, g]) => ({
    dose_level,
    dose_label: g.dose_label,
    incidence: g.n_examined > 0 ? g.n_affected / g.n_examined : 0,
    avg_severity: g.severity_count > 0 ? g.total_severity / g.severity_count : 0,
    n_affected: g.n_affected,
    n_examined: g.n_examined,
    is_control: dose_level === 0,
  }));
}

// ── Classification algorithm ─────────────────────────────────

export function classifyPattern(
  groups: DoseGroupData[],
  trendP?: number | null,
  config?: PatternConfig,
): PatternClassification {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const _trendP = trendP ?? null;

  if (groups.length < 2) {
    return makeResult("NO_PATTERN", null, groups, _trendP);
  }

  const control = groups[0];
  const treated = groups.slice(1);

  // Trivial cases
  const treatedActive = treated.filter(
    (g) => g.incidence > 0 || g.avg_severity > 0,
  );

  if (treatedActive.length === 0) {
    if (control.incidence > 0 || control.avg_severity > 0) {
      return makeResult("CONTROL_ONLY", null, groups, _trendP);
    }
    return makeResult("NO_PATTERN", null, groups, _trendP);
  }

  if (treatedActive.length === 1) {
    const isHighest = treatedActive[0].dose_level === treated[treated.length - 1].dose_level;
    const result = makeResult(
      "SINGLE_GROUP",
      treatedActive[0].dose_label,
      groups,
      _trendP,
    );
    result.isHighestDoseGroup = isHighest;
    return result;
  }

  // Baseline-awareness gate
  const treatedMedian = median(treated.map((g) => g.incidence));
  const maxTreatedInc = Math.max(...treated.map((g) => g.incidence));
  if (
    control.incidence > treatedMedian &&
    maxTreatedInc <= control.incidence + cfg.control_threshold
  ) {
    return makeResult("NO_PATTERN", "control exceeds treated", groups, _trendP);
  }

  // Monotonic up test
  if (isMonotonicUp(treated, cfg.monotonic_tolerance) &&
      maxTreatedInc > control.incidence + cfg.control_threshold) {
    // Check threshold subtype
    const firstActiveIdx = treated.findIndex(
      (g) => g.incidence > control.incidence + cfg.control_threshold,
    );
    if (firstActiveIdx > 0) {
      const allBeforeNearControl = treated
        .slice(0, firstActiveIdx)
        .every((g) => Math.abs(g.incidence - control.incidence) <= cfg.control_threshold);
      if (allBeforeNearControl) {
        return makeResult(
          "THRESHOLD",
          treated[firstActiveIdx].dose_label,
          groups,
          _trendP,
        );
      }
    }
    return makeResult("MONOTONIC_UP", null, groups, _trendP);
  }

  // Monotonic down test
  if (isMonotonicDown(treated, cfg.monotonic_tolerance) &&
      control.incidence > maxTreatedInc + cfg.control_threshold) {
    return makeResult("MONOTONIC_DOWN", null, groups, _trendP);
  }

  // Non-monotonic
  const peakIdx = treated.reduce(
    (maxI, g, i) => (g.incidence > treated[maxI].incidence ? i : maxI),
    0,
  );
  if (
    peakIdx > 0 &&
    peakIdx < treated.length - 1 &&
    treated[peakIdx].incidence > treated[peakIdx - 1].incidence &&
    treated[peakIdx].incidence > treated[peakIdx + 1].incidence
  ) {
    if (treated[peakIdx].n_affected >= cfg.min_affected_non_monotonic) {
      return makeResult(
        "NON_MONOTONIC",
        treated[peakIdx].dose_label,
        groups,
        _trendP,
      );
    }
    const peakResult = makeResult(
      "SINGLE_GROUP",
      treated[peakIdx].dose_label,
      groups,
      _trendP,
    );
    peakResult.isHighestDoseGroup = peakIdx === treated.length - 1;
    return peakResult;
  }

  return makeResult("NO_PATTERN", null, groups, _trendP);
}

function isMonotonicUp(treated: DoseGroupData[], tolerance: number): boolean {
  for (let i = 1; i < treated.length; i++) {
    if (treated[i].incidence < treated[i - 1].incidence - tolerance) return false;
  }
  return true;
}

function isMonotonicDown(treated: DoseGroupData[], tolerance: number): boolean {
  for (let i = 1; i < treated.length; i++) {
    if (treated[i].incidence > treated[i - 1].incidence + tolerance) return false;
  }
  return true;
}

function makeResult(
  pattern: PatternType,
  detail: string | null,
  groups: DoseGroupData[],
  _trendP: number | null,
): PatternClassification {
  return {
    pattern,
    confidence: "LOW",
    detail,
    sparkline: computeSparkline(groups),
    confidenceFactors: [],
    alerts: [],
    syndrome: null,
  };
}

// ── Confidence scoring ───────────────────────────────────────

export function computeConfidence(
  groups: DoseGroupData[],
  _pattern: PatternType,
  trendP: number | null,
  syndromeMatch: SyndromeMatch | null,
  organWeightSignificant: boolean,
  laterality?: LateralityAggregate | null,
): { level: ConfidenceLevel; factors: string[] } {
  const treated = groups.filter((g) => !g.is_control);
  const totalAffected = treated.reduce((s, g) => s + g.n_affected, 0);
  const activeGroups = treated.filter((g) => g.incidence > 0).length;
  const peakSeverity = Math.max(...groups.map((g) => g.avg_severity), 0);

  let level: number; // 0=LOW, 1=MODERATE, 2=HIGH
  const factors: string[] = [];

  if (trendP !== null && trendP < 0.05 && activeGroups >= 3 && totalAffected >= 5) {
    level = 2; // HIGH
    factors.push(`trend p=${trendP.toFixed(4)}`, `${activeGroups} groups`, `${totalAffected} affected`);
  } else if (
    (trendP !== null && trendP < 0.1) ||
    activeGroups >= 2 ||
    (totalAffected >= 3 && totalAffected <= 4)
  ) {
    level = 1; // MODERATE
    if (trendP !== null && trendP < 0.1) factors.push(`trend p=${trendP.toFixed(4)}`);
    if (activeGroups >= 2) factors.push(`${activeGroups} groups`);
    factors.push(`${totalAffected} affected`);
  } else {
    level = 0; // LOW
    factors.push(`${totalAffected} affected`);
  }

  // Modifiers
  if (syndromeMatch) {
    level = Math.min(level + 1, 2);
    factors.push("concordant syndrome");
  }
  if (organWeightSignificant) {
    level = Math.min(level + 1, 2);
    factors.push("organ weight");
  }
  if (peakSeverity >= 3.0) {
    level = Math.min(level + 1, 2);
    factors.push(`peak severity ${peakSeverity.toFixed(1)}`);
  }

  // Laterality modifier (IMP-08)
  if (laterality) {
    const { modifier, interpretation } = lateralitySignalModifier(laterality);
    if (modifier > 0) {
      level = Math.min(level + 1, 2);
      factors.push(interpretation);
    } else if (modifier < 0) {
      level = Math.max(level - 1, 0);
      factors.push(interpretation);
    }
  }

  return {
    level: (["LOW", "MODERATE", "HIGH"] as const)[level],
    factors,
  };
}

// ── Alerts ───────────────────────────────────────────────────

export function computeAlerts(
  groups: DoseGroupData[],
  pattern: PatternType,
  specimenData: LesionSeverityRow[],
): PatternAlert[] {
  const alerts: PatternAlert[] = [];

  // RECOVERY_NOT_EXAMINED
  const hasRecovery = specimenData.some((r) =>
    r.dose_label.toLowerCase().includes("recovery"),
  );
  const concerningPattern = ["MONOTONIC_UP", "THRESHOLD", "NON_MONOTONIC"].includes(pattern);
  if (!hasRecovery && concerningPattern) {
    alerts.push({
      id: "RECOVERY_NOT_EXAMINED",
      priority: "MEDIUM",
      text: "Recovery not examined",
    });
  }

  // SINGLE_ANIMAL
  if (pattern === "SINGLE_GROUP") {
    const treated = groups.filter((g) => !g.is_control);
    if (treated.length > 0) {
      const signalGroup = treated.reduce((a, b) =>
        a.n_affected > b.n_affected ? a : b,
      );
      if (signalGroup.n_affected === 1) {
        alerts.push({
          id: "SINGLE_ANIMAL",
          priority: "INFO",
          text: `Single animal in ${signalGroup.dose_label}`,
        });
      }
    }
  }

  // LOW_N_EXAMINED
  const nExamined = groups.map((g) => g.n_examined).filter((n) => n > 0);
  const medianN = median(nExamined);
  for (const g of groups) {
    if (g.n_examined > 0 && g.n_examined < medianN * 0.6) {
      alerts.push({
        id: "LOW_N_EXAMINED",
        priority: "HIGH",
        text: `Low N: ${g.n_examined}/${Math.round(medianN)} in ${g.dose_label}`,
      });
    }
  }

  return alerts;
}

// ── Sparkline ────────────────────────────────────────────────

export function computeSparkline(groups: DoseGroupData[]): number[] {
  return groups.map((g) => g.incidence);
}

// ── Formatting ───────────────────────────────────────────────

const PATTERN_LABELS: Record<PatternType, string> = {
  MONOTONIC_UP: "Dose-dep \u2191",
  MONOTONIC_DOWN: "Dose-dep \u2193",
  THRESHOLD: "Threshold",
  NON_MONOTONIC: "Non-monotonic",
  SINGLE_GROUP: "Single-grp",
  CONTROL_ONLY: "Control only",
  NO_PATTERN: "No pattern",
};

const CONF_SHORT: Record<ConfidenceLevel, string> = {
  HIGH: "High",
  MODERATE: "Mod",
  LOW: "Low",
};

export function formatPatternLabel(classification: PatternClassification): string {
  const base = PATTERN_LABELS[classification.pattern];
  const detail = classification.detail
    ? ` (${formatDoseDetail(classification.detail)})`
    : "";
  const conf = CONF_SHORT[classification.confidence];

  // Check for confidence boost (modifiers changed the level)
  const hasBoost = classification.confidenceFactors.some(
    (f) =>
      f === "concordant syndrome" ||
      f === "organ weight" ||
      f.startsWith("peak severity"),
  );

  if (hasBoost) {
    // Determine base level (before boost)
    const boostFactors = classification.confidenceFactors.filter(
      (f) =>
        f === "concordant syndrome" ||
        f === "organ weight" ||
        f.startsWith("peak severity"),
    );
    const boostCount = boostFactors.length;
    const levels: ConfidenceLevel[] = ["LOW", "MODERATE", "HIGH"];
    const currentIdx = levels.indexOf(classification.confidence);
    const baseIdx = Math.max(0, currentIdx - boostCount);
    if (baseIdx < currentIdx) {
      const baseConf = CONF_SHORT[levels[baseIdx]];
      const boostNames = boostFactors
        .map((f) => {
          if (f === "concordant syndrome") return "concordance";
          if (f === "organ weight") return "organ weight";
          return "severity";
        })
        .join(" + ");
      return `${base}${detail} \u00B7 ${baseConf} \u2192 ${conf} (${boostNames})`;
    }
  }

  return `${base}${detail} \u00B7 ${conf}`;
}

function formatDoseDetail(detail: string): string {
  // Shorten dose labels like "Group 2, 200 mg/kg PCDRUG" -> "Grp 2"
  const match = detail.match(/^Group\s+(\d+)/i);
  if (match) return `Grp ${match[1]}`;
  return detail;
}

// ── Signal score weight ──────────────────────────────────────

export function patternWeight(
  pattern: PatternType,
  confidence: ConfidenceLevel,
  syndrome: SyndromeMatch | null,
  options?: { domain?: string; isHighestDoseGroup?: boolean },
): { pw: number; syndromeBoost: number } {
  let base = PATTERN_BASE[pattern];

  // IMP-07: Domain-aware MONOTONIC_DOWN weight
  if (pattern === "MONOTONIC_DOWN" && options?.domain) {
    base = MONOTONIC_DOWN_BY_DOMAIN[options.domain] ?? 0.5;
  }

  // IMP-07: SINGLE_GROUP at highest dose → 1.5 (plausible threshold effect)
  if (pattern === "SINGLE_GROUP" && options?.isHighestDoseGroup) {
    base = 1.5;
  }

  const pw = base * CONF_MULT[confidence];
  const syndromeBoost = syndrome ? 1.0 : 0;
  return { pw, syndromeBoost };
}

// ── Per-finding convenience wrapper ──────────────────────────

export function classifyFindingPattern(
  specimenRows: LesionSeverityRow[],
  finding: string,
  trendP: number | null,
  syndromeMatch: SyndromeMatch | null,
  organWeightSig: boolean,
): PatternClassification {
  const groups = buildDoseGroupData(specimenRows, finding);
  if (groups.length < 2) {
    return {
      pattern: "NO_PATTERN",
      confidence: "LOW",
      detail: null,
      sparkline: groups.map((g) => g.incidence),
      confidenceFactors: ["insufficient data"],
      alerts: [],
      syndrome: null,
    };
  }

  const result = classifyPattern(groups, trendP);
  const { level, factors } = computeConfidence(
    groups,
    result.pattern,
    trendP,
    syndromeMatch,
    organWeightSig,
  );
  const alerts = computeAlerts(groups, result.pattern, specimenRows);

  return {
    ...result,
    confidence: level,
    confidenceFactors: factors,
    alerts,
    syndrome: syndromeMatch,
  };
}

// ── Specimen-level classification ────────────────────────────

export function classifySpecimenPattern(
  specimenData: LesionSeverityRow[],
  trendData: FindingDoseTrend[] | null,
  syndromeMatches: SyndromeMatch[],
  signalData: SignalSummaryRow[] | null,
): PatternClassification {
  const findings = [...new Set(specimenData.map((r) => r.finding))];
  if (findings.length === 0) {
    return {
      pattern: "NO_PATTERN",
      confidence: "LOW",
      detail: null,
      sparkline: [],
      confidenceFactors: [],
      alerts: [],
      syndrome: null,
    };
  }

  // Find syndrome match for this specimen's organ
  const organ = specimenData[0]?.specimen ?? "";
  const syndrome = syndromeMatches.find(
    (m) => m.organ.toUpperCase() === organ.toUpperCase(),
  ) ?? null;

  // Organ weight significance
  const organSystem = specimenData[0]?.specimen ?? "";
  const organWeightSig = signalData?.some(
    (s) =>
      s.domain === "OM" &&
      s.organ_system?.toUpperCase() === organSystem.toUpperCase() &&
      s.p_value !== null &&
      s.p_value < 0.05,
  ) ?? false;

  // Classify each finding, pick worst
  const PATTERN_RANK: Record<PatternType, number> = {
    MONOTONIC_UP: 6,
    THRESHOLD: 5,
    NON_MONOTONIC: 4,
    SINGLE_GROUP: 3,
    MONOTONIC_DOWN: 2,
    CONTROL_ONLY: 1,
    NO_PATTERN: 0,
  };

  let worstResult: PatternClassification | null = null;
  let worstRank = -1;

  for (const finding of findings) {
    const trendP = trendData?.find(
      (t) => t.finding === finding && t.specimen === organ,
    )?.ca_trend_p ?? null;

    const result = classifyFindingPattern(
      specimenData,
      finding,
      trendP,
      syndrome,
      organWeightSig,
    );
    const rank = PATTERN_RANK[result.pattern];
    if (rank > worstRank) {
      worstRank = rank;
      worstResult = result;
    }
  }

  if (!worstResult) {
    return {
      pattern: "NO_PATTERN",
      confidence: "LOW",
      detail: null,
      sparkline: [],
      confidenceFactors: [],
      alerts: [],
      syndrome: null,
    };
  }

  // Use specimen-level sparkline (aggregate across all findings)
  const specimenGroups = buildDoseGroupData(specimenData);
  const specimenSparkline = computeSparkline(specimenGroups);

  // Recompute specimen-level confidence
  const specimenTrendP = trendData
    ? Math.min(
        ...findings
          .map((f) => trendData.find((t) => t.finding === f && t.specimen === organ)?.ca_trend_p)
          .filter((p): p is number => p != null),
        Infinity,
      )
    : null;
  const effectiveTrendP = specimenTrendP === Infinity ? null : specimenTrendP;

  const { level, factors } = computeConfidence(
    specimenGroups,
    worstResult.pattern,
    effectiveTrendP,
    syndrome,
    organWeightSig,
  );

  // Compute specimen-level alerts
  const alerts = computeAlerts(specimenGroups, worstResult.pattern, specimenData);

  return {
    pattern: worstResult.pattern,
    confidence: level,
    detail: worstResult.detail,
    sparkline: specimenSparkline,
    confidenceFactors: factors,
    alerts,
    syndrome,
  };
}

// ── Legacy compatibility bridge ──────────────────────────────

export function patternToLegacyConsistency(
  pattern: PatternType,
  confidence: ConfidenceLevel,
): "Weak" | "Moderate" | "Strong" | "NonMonotonic" {
  if (pattern === "NON_MONOTONIC") return "NonMonotonic";
  if (["MONOTONIC_UP", "MONOTONIC_DOWN", "THRESHOLD"].includes(pattern)) {
    if (confidence === "HIGH") return "Strong";
    if (confidence === "MODERATE") return "Moderate";
    return "Weak";
  }
  if (pattern === "SINGLE_GROUP") return "Weak";
  return "Weak";
}
