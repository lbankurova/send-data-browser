/**
 * Finding nature classification — keyword-based toxicological categorization.
 * Classifies histopathology findings into biological nature categories
 * (adaptive, degenerative, proliferative, inflammatory) with expected
 * reversibility and typical recovery timelines.
 */

// ─── Types ────────────────────────────────────────────────

export type FindingNature = "adaptive" | "degenerative" | "proliferative" | "inflammatory" | "other";

export interface FindingNatureInfo {
  nature: FindingNature;
  expected_reversibility: "high" | "moderate" | "low" | "none";
  typical_recovery_weeks: number | null;
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
 * Special handling: "fibrosis" overrides degenerative defaults.
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

  // Degenerative — fibrosis is special (irreversible)
  { keyword: "mineralization", nature: "degenerative", expected_reversibility: "moderate", typical_recovery_weeks: 13 },
  { keyword: "degeneration", nature: "degenerative", expected_reversibility: "moderate", typical_recovery_weeks: 10 },
  { keyword: "sclerosis", nature: "degenerative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "fibrosis", nature: "degenerative", expected_reversibility: "none", typical_recovery_weeks: null },
  { keyword: "necrosis", nature: "degenerative", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "atrophy", nature: "degenerative", expected_reversibility: "moderate", typical_recovery_weeks: 10 },

  // Adaptive — generally reversible
  { keyword: "glycogen depletion", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "pigmentation", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "hyperplasia", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "hypertrophy", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "vacuolation", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },
  { keyword: "enlarged", nature: "adaptive", expected_reversibility: "high", typical_recovery_weeks: 6 },

  // Inflammatory — moderate reversibility
  { keyword: "inflammatory", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "inflammation", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "infiltrate", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "granuloma", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
  { keyword: "abscess", nature: "inflammatory", expected_reversibility: "moderate", typical_recovery_weeks: 8 },
];

// ─── Classification function ──────────────────────────────

const DEFAULT_INFO: FindingNatureInfo = {
  nature: "other",
  expected_reversibility: "moderate",
  typical_recovery_weeks: null,
};

/**
 * Classify a histopathology finding name into a biological nature category.
 * Uses case-insensitive substring matching with longest-match priority.
 */
export function classifyFindingNature(findingName: string): FindingNatureInfo {
  const lower = findingName.toLowerCase();

  for (const entry of KEYWORD_TABLE) {
    if (lower.includes(entry.keyword)) {
      return {
        nature: entry.nature,
        expected_reversibility: entry.expected_reversibility,
        typical_recovery_weeks: entry.typical_recovery_weeks,
      };
    }
  }

  return { ...DEFAULT_INFO };
}

// ─── Display helpers ──────────────────────────────────────

const REVERSIBILITY_LABELS: Record<FindingNatureInfo["expected_reversibility"], string> = {
  high: "typically reversible",
  moderate: "may be reversible",
  low: "poorly reversible",
  none: "not expected to reverse",
};

export function reversibilityLabel(info: FindingNatureInfo): string {
  return REVERSIBILITY_LABELS[info.expected_reversibility];
}
