/**
 * Finding nature classification — CT-normalized lookup + keyword fallback.
 * Classifies histopathology findings into biological nature categories
 * with expected reversibility, typical recovery timelines, and severity-aware
 * modulation of recovery expectations (IMP-04, IMP-12).
 */

import { normalizeFinding } from "./finding-term-map";
import { lookupRecoveryDuration } from "./recovery-duration-table";
import type { LookupConfidence } from "./recovery-duration-table";

// ─── Types ────────────────────────────────────────────────

export type FindingNature =
  | "adaptive"
  | "degenerative"
  | "proliferative"
  | "inflammatory"
  | "depositional"
  | "vascular"
  | "unknown";

export type ReversibilityQualifier = "expected" | "possible" | "unlikely" | "none" | "unknown";

export interface FindingNatureInfo {
  nature: FindingNature;
  expected_reversibility: "high" | "moderate" | "low" | "none";
  typical_recovery_weeks: number | null;
  reversibilityQualifier: ReversibilityQualifier;
  source?: "ct_mapped" | "substring_match" | "organ_lookup";
  normalizedTerm?: string;
  /** Organ-specific recovery range from literature-backed lookup table. */
  recovery_weeks_range?: { low: number; high: number } | null;
  /** Confidence of the lookup table entry. */
  lookup_confidence?: LookupConfidence;
  /** Organ key matched in the lookup table. */
  organ_key?: string;
  /** True when severity exceeded threshold → reversibility downgraded. */
  severity_capped?: boolean;
}

// ─── Keyword tables (longest-match priority via ordered scan) ───

interface KeywordEntry {
  keyword: string;
  nature: FindingNature;
  expected_reversibility: "high" | "moderate" | "low" | "none";
  typical_recovery_weeks: number | null;
}

/**
 * Ordered by longest keyword first within each nature category.
 * Proliferative checked first (neoplastic = irreversible, highest priority).
 * Depositional and vascular checked before inflammatory to avoid ambiguity
 * (e.g., "hemorrhage" should match vascular, not be missed and fall to inflammatory).
 */
const KEYWORD_TABLE: KeywordEntry[] = [
  // Proliferative — neoplastic findings, not expected to reverse
  { keyword: "carcinoma", nature: "proliferative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "papilloma", nature: "proliferative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "lymphoma", nature: "proliferative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "neoplasm", nature: "proliferative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "sarcoma", nature: "proliferative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "adenoma", nature: "proliferative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "tumor", nature: "proliferative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "mass", nature: "proliferative", expected_reversibility: "none", typical_recovery_weeks: null },

  // Degenerative — fibrosis/sclerosis are irreversible
  { keyword: "mineralization", nature: "degenerative", expected_reversibility: "moderate", typical_recovery_weeks: 13 },
  { keyword: "degeneration", nature: "degenerative", expected_reversibility: "moderate", typical_recovery_weeks: 10 },
  { keyword: "sclerosis", nature: "degenerative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "fibrosis", nature: "degenerative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "necrosis", nature: "degenerative", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "atrophy", nature: "degenerative", expected_reversibility: "moderate", typical_recovery_weeks: 10 },
  { keyword: "decreased spermatogenesis", nature: "degenerative", expected_reversibility: "low", typical_recovery_weeks: 16 },

  // Depositional — often incidental, low-none reversibility (IMP-04b)
  { keyword: "hemosiderin", nature: "depositional", expected_reversibility: "low", typical_recovery_weeks: null },
  { keyword: "lipofuscin", nature: "depositional", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "mineral deposit", nature: "depositional", expected_reversibility: "none", typical_recovery_weeks: null },

  // Vascular — variable reversibility (IMP-04b)
  { keyword: "hemorrhage", nature: "vascular", expected_reversibility: "moderate", typical_recovery_weeks: 4 },
  { keyword: "thrombosis", nature: "vascular", expected_reversibility: "low", typical_recovery_weeks: null },
  { keyword: "congestion", nature: "vascular", expected_reversibility: "high", typical_recovery_weeks: 2 },
  { keyword: "angiectasis", nature: "vascular", expected_reversibility: "low", typical_recovery_weeks: null },

  // Adaptive — generally reversible
  { keyword: "glycogen depletion", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "weight change", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "pigmentation", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "hyperplasia", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "hypertrophy", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "vacuolation", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "basophilia", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 4 },
  { keyword: "enlarged", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },

  // Inflammatory — moderate reversibility
  { keyword: "inflammatory", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "inflammation", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "infiltrate", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "granuloma", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "abscess", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
];

// ─── Severity modulation tables (IMP-04a) ────────────────

/**
 * Modulate typical_recovery_weeks and qualifier based on max severity.
 * Higher severity → longer recovery time and less certainty.
 */
interface SeverityModulation {
  weekMultiplier: number;
  qualifier: ReversibilityQualifier;
}

const SEVERITY_MODULATION: Record<FindingNature, Record<"low" | "mid" | "high", SeverityModulation>> = {
  adaptive:      { low: { weekMultiplier: 1.0, qualifier: "expected" },  mid: { weekMultiplier: 1.5, qualifier: "expected" },  high: { weekMultiplier: 2.0, qualifier: "possible" } },
  inflammatory:  { low: { weekMultiplier: 1.0, qualifier: "expected" },  mid: { weekMultiplier: 1.3, qualifier: "possible" },  high: { weekMultiplier: 2.0, qualifier: "unlikely" } },
  degenerative:  { low: { weekMultiplier: 1.0, qualifier: "possible" },  mid: { weekMultiplier: 1.6, qualifier: "unlikely" },  high: { weekMultiplier: 2.5, qualifier: "unlikely" } },
  depositional:  { low: { weekMultiplier: 1.0, qualifier: "unlikely" },  mid: { weekMultiplier: 1.0, qualifier: "unlikely" },  high: { weekMultiplier: 1.0, qualifier: "none" } },
  vascular:      { low: { weekMultiplier: 1.0, qualifier: "expected" },  mid: { weekMultiplier: 1.5, qualifier: "possible" },  high: { weekMultiplier: 2.0, qualifier: "unlikely" } },
  proliferative: { low: { weekMultiplier: 1.0, qualifier: "none" },      mid: { weekMultiplier: 1.0, qualifier: "none" },      high: { weekMultiplier: 1.0, qualifier: "none" } },
  unknown:       { low: { weekMultiplier: 1.0, qualifier: "unknown" },   mid: { weekMultiplier: 1.5, qualifier: "unknown" },   high: { weekMultiplier: 2.0, qualifier: "unknown" } },
};

function severityBand(maxSeverity: number): "low" | "mid" | "high" {
  if (maxSeverity <= 2) return "low";
  if (maxSeverity <= 3) return "mid";
  return "high";
}

function baseQualifier(nature: FindingNature, reversibility: FindingNatureInfo["expected_reversibility"]): ReversibilityQualifier {
  if (reversibility === "none") return "none";
  if (nature === "unknown") return "unknown";
  if (reversibility === "high") return "expected";
  if (reversibility === "moderate") return "possible";
  return "unlikely";
}

// ─── Classification function ──────────────────────────────

/**
 * Classify a histopathology finding name into a biological nature category.
 * Uses case-insensitive substring matching with longest-match priority.
 *
 * When maxSeverity is provided, recovery timeline and qualifier are modulated:
 * higher severity → longer expected recovery and less certainty.
 *
 * When organ and/or species are provided, the organ-specific literature-backed
 * lookup table is consulted first for recovery duration (overrides the generic
 * keyword-based weeks). The nature classification (adaptive/degenerative/etc.)
 * still comes from CT/keyword matching — the lookup table only provides duration.
 */
// @field FIELD-39 — finding nature (adaptive/degenerative/proliferative/etc.)
// @field FIELD-40 — expected reversibility (high/moderate/low/none)
// @field FIELD-41 — typical recovery weeks
export function classifyFindingNature(
  findingName: string,
  maxSeverity?: number | null,
  organ?: string | null,
  species?: string | null,
): FindingNatureInfo {
  // 1. Get nature classification from CT/keyword (unchanged logic)
  const base = classifyNatureOnly(findingName, maxSeverity);

  // 2. Try organ-specific lookup table for recovery duration
  const lookup = lookupRecoveryDuration(findingName, { organ, species, maxSeverity });
  if (lookup) {
    const expectedRev: FindingNatureInfo["expected_reversibility"] =
      lookup.reversibility === "expected" ? "high"
        : lookup.reversibility === "possible" ? "moderate"
          : lookup.reversibility === "unlikely" ? "low"
            : "none";
    // For irreversible findings, typical_recovery_weeks stays null —
    // the lookup range documents persistence duration, not expected recovery.
    const midpoint = lookup.reversibility === "none"
      ? null
      : Math.round((lookup.weeks.low + lookup.weeks.high) / 2);
    return {
      ...base,
      typical_recovery_weeks: midpoint,
      expected_reversibility: expectedRev,
      reversibilityQualifier: lookup.reversibility,
      source: "organ_lookup",
      recovery_weeks_range: lookup.weeks,
      lookup_confidence: lookup.confidence,
      organ_key: lookup.organ_key ?? undefined,
      severity_capped: lookup.severity_capped,
    };
  }

  return base;
}

/**
 * Internal: classify nature + apply legacy severity modulation.
 * Used when no organ-specific lookup is available.
 */
function classifyNatureOnly(
  findingName: string,
  maxSeverity?: number | null,
): FindingNatureInfo {
  // 1. Try CT-normalized lookup (IMP-12)
  const mapped = normalizeFinding(findingName);
  if (mapped) {
    const rev = mapped.reversibility;
    const weeks = rev.weeksLow != null && rev.weeksHigh != null
      ? Math.round((rev.weeksLow + rev.weeksHigh) / 2)
      : null;
    const expectedRev: FindingNatureInfo["expected_reversibility"] =
      rev.qualifier === "none" ? "none"
        : rev.qualifier === "expected" ? "high"
          : rev.qualifier === "unlikely" ? "low"
            : rev.qualifier === "unknown" ? "moderate"
              : "moderate";
    const base: FindingNatureInfo = {
      nature: mapped.category,
      expected_reversibility: expectedRev,
      typical_recovery_weeks: weeks,
      reversibilityQualifier: rev.qualifier,
      source: "ct_mapped",
      normalizedTerm: mapped.normalizedTerm,
    };
    return maxSeverity != null ? modulateBySeverity(base, maxSeverity) : base;
  }

  // 2. Fall back to legacy substring matching
  const lower = findingName.toLowerCase();
  for (const entry of KEYWORD_TABLE) {
    if (lower.includes(entry.keyword)) {
      const base: FindingNatureInfo = {
        nature: entry.nature,
        expected_reversibility: entry.expected_reversibility,
        typical_recovery_weeks: entry.typical_recovery_weeks,
        reversibilityQualifier: baseQualifier(entry.nature, entry.expected_reversibility),
        source: "substring_match",
      };
      return maxSeverity != null ? modulateBySeverity(base, maxSeverity) : base;
    }
  }

  // 3. Explicit "unknown" fallback (IMP-04c)
  return {
    nature: "unknown",
    expected_reversibility: "moderate",
    typical_recovery_weeks: null,
    reversibilityQualifier: "unknown",
    source: "substring_match",
  };
}

function modulateBySeverity(info: FindingNatureInfo, maxSeverity: number): FindingNatureInfo {
  if (info.expected_reversibility === "none") return info; // irreversible stays irreversible
  const band = severityBand(maxSeverity);
  const mod = SEVERITY_MODULATION[info.nature][band];
  return {
    ...info,
    typical_recovery_weeks: info.typical_recovery_weeks != null
      ? Math.round(info.typical_recovery_weeks * mod.weekMultiplier)
      : null,
    reversibilityQualifier: mod.qualifier,
  };
}

// ─── Display helpers ──────────────────────────────────────

const REVERSIBILITY_DESCRIPTIONS: Record<FindingNatureInfo["expected_reversibility"], string> = {
  high: "Typically reversible",
  moderate: "May be reversible",
  low: "Poorly reversible",
  none: "Not expected to reverse",
};

const QUALIFIER_LABELS: Record<ReversibilityQualifier, string> = {
  expected: "expected",
  possible: "possible",
  unlikely: "unlikely",
  none: "not expected",
  unknown: "uncertain",
};

export { QUALIFIER_LABELS };

/**
 * Build a reversibility description with recovery timeline when available.
 * When organ-specific range is available, uses it directly.
 * Falls back to legacy midpoint ± 2 weeks for keyword-only classifications.
 * E.g., "expected to reverse within 1–4 weeks" or "not expected to reverse".
 */
export function reversibilityLabel(info: FindingNatureInfo): string {
  // Irreversible findings — skip range display (range documents persistence, not recovery)
  if (info.reversibilityQualifier === "none" || info.expected_reversibility === "none") {
    return REVERSIBILITY_DESCRIPTIONS.none;
  }

  // Organ-specific range from lookup table — display directly
  if (info.recovery_weeks_range != null) {
    const { low, high } = info.recovery_weeks_range;
    const qualLabel = info.reversibilityQualifier !== "expected"
      ? ` (${QUALIFIER_LABELS[info.reversibilityQualifier]})`
      : "";
    return `Expected to reverse within ${formatWeeksRange(low)}\u2013${formatWeeksRange(high)} weeks${qualLabel}`;
  }

  // Legacy path: midpoint ± 2 weeks
  if (info.typical_recovery_weeks != null) {
    const low = Math.max(1, info.typical_recovery_weeks - 2);
    const high = info.typical_recovery_weeks + 2;
    const qualLabel = info.reversibilityQualifier !== "expected"
      ? ` (${QUALIFIER_LABELS[info.reversibilityQualifier]})`
      : "";
    return `Expected to reverse within ${low}\u2013${high} weeks${qualLabel}`;
  }
  return REVERSIBILITY_DESCRIPTIONS[info.expected_reversibility];
}

/** Format week values — sub-1 shown as "<1", otherwise rounded to 1 decimal. */
function formatWeeksRange(w: number): string | number {
  if (w < 1) return "<1";
  return Math.round(w * 10) / 10;
}
