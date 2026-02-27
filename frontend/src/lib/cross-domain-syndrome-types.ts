/**
 * Cross-Domain Syndrome Detection — Type Definitions.
 *
 * Extracted from cross-domain-syndromes.ts for module clarity.
 * All types are re-exported from cross-domain-syndromes.ts — no import path changes needed.
 */

// ─── Types ─────────────────────────────────────────────────

/** Structured term match definition — replaces substring matching. */
export interface SyndromeTermMatch {
  /** LBTESTCD values for LB domain matching (OR logic) */
  testCodes?: string[];
  /** Exact match after normalization (OR logic) */
  canonicalLabels?: string[];
  /** MI/MA: must match BOTH specimen AND finding */
  specimenTerms?: {
    specimen: string[];   // empty = any specimen
    finding: string[];
  };
  /** OM: specimen + direction */
  organWeightTerms?: {
    specimen: string[];   // empty = any specimen
  };

  /** Required domain match */
  domain: string;
  /** Required direction match */
  direction: "up" | "down" | "any";
  /** Role in syndrome detection */
  role: "required" | "supporting";
  /** Optional tag for compound logic grouping */
  tag?: string;
}

/** Compound required logic for syndrome definitions. */
export type RequiredLogic =
  | { type: "any" }                           // >=1 required term matches
  | { type: "all" }                           // ALL required terms must match
  | { type: "compound"; expression: string }; // custom: "ALP AND (GGT OR 5NT)"

export interface SyndromeDefinition {
  id: string;
  name: string;
  requiredLogic: RequiredLogic;
  terms: SyndromeTermMatch[];
  minDomains: number;
}

export interface EndpointMatch {
  endpoint_label: string;
  domain: string;
  role: "required" | "supporting";
  direction: string;
  severity: string;
  /** Sex this match came from. null = aggregate. */
  sex?: string | null;
}

/** REM-09: Directional gate configuration per syndrome. */
export interface DirectionalGateConfig {
  term: string;           // tag to check (e.g., "RETIC", "LYMPH")
  expectedDirection: "up" | "down";
  action: "reject" | "strong_against" | "weak_against";
  /** Condition under which reject softens to strong_against */
  overrideCondition?: string;
  /** Domain of the gated term — enables ANCOVA direction resolution for OM gates (SE-7). */
  domain?: string;
}

/** REM-09: Result of directional gate evaluation. */
export interface DirectionalGateResult {
  gateFired: boolean;
  action: "reject" | "strong_against" | "weak_against" | "none";
  overrideApplied: boolean;
  overrideReason?: "direct_lesion" | "timecourse";
  certaintyCap?: "mechanism_uncertain" | "pattern_only";
  explanation: string;
  /** True when gate direction was determined from ANCOVA decomposition. */
  ancovaSource?: boolean;
}

export interface CrossDomainSyndrome {
  id: string;
  name: string;
  matchedEndpoints: EndpointMatch[];
  requiredMet: boolean;
  domainsCovered: string[];
  confidence: "HIGH" | "MODERATE" | "LOW";
  supportScore: number;
  /** Which sexes this syndrome was detected in. Empty = aggregate (both). */
  sexes: string[];
  /** REM-09: Directional gate evaluation result, if applicable. */
  directionalGate?: DirectionalGateResult;
}

// ─── Magnitude floor types ─────────────────────────────────

export interface MagnitudeFloor {
  /** Minimum |Hedges' g| to qualify as biologically meaningful */
  minG: number;
  /** Minimum |fold change - 1| to qualify (e.g. 0.10 = 10% change) */
  minFcDelta: number;
}

// ─── Term report types ─────────────────────────────────────

export interface TermReportEntry {
  label: string;        // "ALT ↑", "Bone marrow hypocellularity"
  domain: string;       // "LB", "MI", "OM"
  role: "required" | "supporting";
  tag?: string;
  status: "matched" | "trend" | "opposite" | "not_significant" | "not_measured";
  matchedEndpoint?: string;  // endpoint_label if matched or found
  pValue?: number | null;
  severity?: string;
  /** Direction of the found endpoint (for opposite status display) */
  foundDirection?: "up" | "down" | "none" | null;
  /** Sex tag when syndrome detected for one sex only (e.g. "M" or "F") */
  sex?: string | null;
  /** REM-27: Note when magnitude floor prevented a match (null = not applicable or passed) */
  magnitudeFloorNote?: string | null;
}

export interface SyndromeTermReport {
  requiredEntries: TermReportEntry[];
  supportingEntries: TermReportEntry[];
  requiredMetCount: number;
  /** REM-25: How many required terms were met only by trend (p > α but biologically meaningful) */
  requiredTrendCount: number;
  requiredTotal: number;
  supportingMetCount: number;
  supportingTotal: number;
  domainsCovered: string[];
  missingDomains: string[];   // domains with terms but no matches
  /** Count of "opposite" entries across required + supporting (active counter-evidence) */
  oppositeCount: number;
  /** Human-readable required logic expression (e.g. "any of (NEUT, PLAT, (RBC + HGB))") */
  requiredLogicText: string;
  /** Required logic type from syndrome definition */
  requiredLogicType: "any" | "all" | "compound";
  /** REM-26: Which clause of compound required logic was satisfied (null for simple logic) */
  satisfiedClause: string | null;
  /** REM-26: Tags of supporting terms that participated in compound required logic (promoted S→R) */
  promotedSupportingTags: string[];
}

// ─── Near-miss types ───────────────────────────────────────

export interface SyndromeNearMissInfo {
  /** Human-readable "Would require" text, e.g. "ALP↑ + GGT↑ or 5'NT↑" */
  wouldRequire: string;
  /** Tags of required terms that matched (e.g. ["ALP"]) */
  matched: string[];
  /** Tags of required terms that did NOT match (e.g. ["GGT", "5NT"]) */
  missing: string[];
}
