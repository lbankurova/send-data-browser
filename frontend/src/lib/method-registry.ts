/**
 * Method Registry — pluggable statistical methods, HCD sources, and custom models.
 *
 * The Evidence Collector resolves methods through this registry instead of
 * switch statements. Customers can register custom methods at runtime.
 *
 * Categories:
 * - effect_size: Hedges' g, Cohen's d, Glass's delta
 * - pairwise: Dunnett's, Williams', Steel's
 * - trend: Jonckheere-Terpstra, Cuzick, Williams-trend
 * - hcd_source: JSON fallback, SQLite, custom
 *
 * @see docs/_internal/incoming/scalability-architecture-plan.md (Phase 6)
 */

// ─── Types ──────────────────────────────────────────────────

export interface ParameterDef {
  name: string;
  type: "number" | "string" | "boolean" | "array";
  description: string;
  required: boolean;
}

export type MethodCategory = "effect_size" | "pairwise" | "trend" | "hcd_source" | "multiplicity";

export interface RegisteredMethod {
  id: string;
  name: string;
  version: string;
  category: MethodCategory;
  description: string;
  /** Which study types can use this method */
  applicable_study_types: string[];
  /** Which statistical units this method supports */
  applicable_stat_units: ("individual" | "litter")[];
  /** Input parameter schema */
  inputs: ParameterDef[];
  /** Output parameter schema */
  outputs: ParameterDef[];
  /** Provenance metadata */
  provenance: { source: string; reference: string };
  /** Display label for UI */
  label: string;
  /** Short symbol for compact display */
  symbol: string;
}

// ─── Registry ───────────────────────────────────────────────

const REGISTRY = new Map<string, RegisteredMethod>();

/** Register a method. Overwrites if ID already exists. */
export function registerMethod(method: RegisteredMethod): void {
  REGISTRY.set(method.id, method);
}

/** Get a method by ID. */
export function getMethod(id: string): RegisteredMethod | undefined {
  return REGISTRY.get(id);
}

/** Get all methods in a category. */
export function getMethodsByCategory(category: MethodCategory): RegisteredMethod[] {
  return [...REGISTRY.values()].filter((m) => m.category === category);
}

/** Get all methods applicable to a study type. */
export function getMethodsForStudyType(
  category: MethodCategory,
  studyType: string,
): RegisteredMethod[] {
  return getMethodsByCategory(category).filter((m) =>
    m.applicable_study_types.some(
      (t) => t === studyType || t.endsWith("*") && studyType.startsWith(t.slice(0, -1)),
    ),
  );
}

/** Get all registered method IDs. */
export function getAllMethodIds(): string[] {
  return [...REGISTRY.keys()];
}

// ─── Built-in methods ───────────────────────────────────────

const INDIVIDUAL_UNIT: ("individual" | "litter")[] = ["individual"];
const ALL_STUDY_TYPES = ["REPEAT_DOSE_*", "ACUTE", "DOSE_RANGE_FINDER", "SAFETY_PHARM_CARDIOVASCULAR"];

// Effect size methods
registerMethod({
  id: "hedges-g",
  name: "Hedges' g",
  version: "1.0.0",
  category: "effect_size",
  description: "Bias-corrected standardized mean difference. Preferred for small samples (n < 20). Corrects Cohen's d upward bias via J = 1 - 3/(4df - 1).",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [
    { name: "controlMean", type: "number", description: "Control group mean", required: true },
    { name: "controlSd", type: "number", description: "Control group SD", required: true },
    { name: "controlN", type: "number", description: "Control group n", required: true },
    { name: "treatedMean", type: "number", description: "Treated group mean", required: true },
    { name: "treatedSd", type: "number", description: "Treated group SD", required: true },
    { name: "treatedN", type: "number", description: "Treated group n", required: true },
  ],
  outputs: [{ name: "effectSize", type: "number", description: "Hedges' g value", required: true }],
  provenance: { source: "Hedges LV. Psychol Bull 1981;86:461-465", reference: "doi:10.1037/0033-2909.86.5.461" },
  label: "Hedges\u2019 g",
  symbol: "g",
});

registerMethod({
  id: "cohens-d",
  name: "Cohen's d",
  version: "1.0.0",
  category: "effect_size",
  description: "Standardized mean difference using pooled SD. Biased upward for small samples — use Hedges' g when n < 20.",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [
    { name: "controlMean", type: "number", description: "Control group mean", required: true },
    { name: "controlSd", type: "number", description: "Control group SD", required: true },
    { name: "controlN", type: "number", description: "Control group n", required: true },
    { name: "treatedMean", type: "number", description: "Treated group mean", required: true },
    { name: "treatedSd", type: "number", description: "Treated group SD", required: true },
    { name: "treatedN", type: "number", description: "Treated group n", required: true },
  ],
  outputs: [{ name: "effectSize", type: "number", description: "Cohen's d value", required: true }],
  provenance: { source: "Cohen J. Statistical Power Analysis. 1988", reference: "ISBN:0-8058-0283-5" },
  label: "Cohen\u2019s d",
  symbol: "d",
});

registerMethod({
  id: "glass-delta",
  name: "Glass's delta",
  version: "1.0.0",
  category: "effect_size",
  description: "Standardized mean difference using control SD only. Appropriate when treatment affects variance (heteroscedasticity).",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [
    { name: "controlMean", type: "number", description: "Control group mean", required: true },
    { name: "controlSd", type: "number", description: "Control group SD", required: true },
    { name: "treatedMean", type: "number", description: "Treated group mean", required: true },
  ],
  outputs: [{ name: "effectSize", type: "number", description: "Glass's delta value", required: true }],
  provenance: { source: "Glass GV. Educ Researcher 1976;5:3-8", reference: "doi:10.3102/0013189X005010003" },
  label: "Glass\u2019s \u0394",
  symbol: "\u0394",
});

// Pairwise test methods
registerMethod({
  id: "dunnett",
  name: "Dunnett's Test",
  version: "1.0.0",
  category: "pairwise",
  description: "Many-to-one comparison against control with FWER control. Preferred for balanced designs. More powerful than Bonferroni for control-vs-treated comparisons.",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [{ name: "groups", type: "array", description: "Group-level summary stats", required: true }],
  outputs: [{ name: "pValues", type: "array", description: "Adjusted p-values per treated group", required: true }],
  provenance: { source: "Dunnett CW. JASA 1955;50:1096-1121", reference: "doi:10.1080/01621459.1955.10501294" },
  label: "Dunnett\u2019s test",
  symbol: "Dunnett",
});

registerMethod({
  id: "williams",
  name: "Williams' Test",
  version: "1.0.0",
  category: "pairwise",
  description: "Step-down test assuming monotonic dose-response. More powerful than Dunnett's when monotonicity holds. Falls back to Dunnett's if monotonicity violated.",
  applicable_study_types: ["REPEAT_DOSE_*", "ACUTE", "DOSE_RANGE_FINDER"],
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [{ name: "groups", type: "array", description: "Group-level summary stats (ordered by dose)", required: true }],
  outputs: [{ name: "pValues", type: "array", description: "Step-down p-values", required: true }],
  provenance: { source: "Williams DA. Biometrics 1971;27:103-117", reference: "doi:10.2307/2528930" },
  label: "Williams\u2019 test",
  symbol: "Williams",
});

registerMethod({
  id: "steel",
  name: "Steel's Test",
  version: "1.0.0",
  category: "pairwise",
  description: "Nonparametric many-to-one comparison (rank-based). For non-normal data or ordinal endpoints.",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [{ name: "groups", type: "array", description: "Group-level raw values", required: true }],
  outputs: [{ name: "pValues", type: "array", description: "Rank-based p-values", required: true }],
  provenance: { source: "Steel RGD. Technometrics 1959;1:27-52", reference: "doi:10.1080/00401706.1959.10489941" },
  label: "Steel\u2019s test",
  symbol: "Steel",
});

// Trend test methods
registerMethod({
  id: "jonckheere",
  name: "Jonckheere-Terpstra Test",
  version: "1.0.0",
  category: "trend",
  description: "Distribution-free trend test for ordered alternatives. Sums Mann-Whitney U counts across ordered dose-group pairs.",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [{ name: "groups", type: "array", description: "Group-level values (ordered by dose)", required: true }],
  outputs: [{ name: "trendP", type: "number", description: "Trend p-value", required: true }],
  provenance: { source: "Jonckheere AR. Biometrika 1954;41:133-145; Terpstra TJ. NAMS 1952;53:98-115", reference: "REM-29" },
  label: "Jonckheere-Terpstra",
  symbol: "JT",
});

registerMethod({
  id: "cochran-armitage",
  name: "Cochran-Armitage Trend Test",
  version: "1.0.0",
  category: "trend",
  description: "Trend test for proportions (incidence data). Tests for linear trend in binomial proportions across ordered dose groups.",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [{ name: "incidences", type: "array", description: "Incidence proportions per dose group", required: true }],
  outputs: [{ name: "trendP", type: "number", description: "Trend p-value", required: true }],
  provenance: { source: "Armitage P. Biometrics 1955;11:375-386", reference: "doi:10.2307/3001775" },
  label: "Cochran-Armitage",
  symbol: "CA",
});

// Multiplicity methods
registerMethod({
  id: "dunnett-fwer",
  name: "Dunnett FWER",
  version: "1.0.0",
  category: "multiplicity",
  description: "Family-wise error rate control via Dunnett's procedure. Default multiplicity correction.",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [],
  outputs: [],
  provenance: { source: "Dunnett CW. JASA 1955", reference: "REM-28" },
  label: "Dunnett FWER",
  symbol: "FWER",
});

registerMethod({
  id: "bonferroni",
  name: "Bonferroni Correction",
  version: "1.0.0",
  category: "multiplicity",
  description: "Simple Bonferroni correction. More conservative than Dunnett's. Divide alpha by number of comparisons.",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [],
  outputs: [],
  provenance: { source: "Bonferroni CE. Pubblicazioni del R Istituto, 1936", reference: "classical" },
  label: "Bonferroni",
  symbol: "Bonf",
});

// HCD source methods
registerMethod({
  id: "hcd-json",
  name: "JSON Historical Control Data",
  version: "1.0.0",
  category: "hcd_source",
  description: "Static JSON HCD reference ranges (Envigo C11963 SD rat). Fallback when SQLite database is unavailable.",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [{ name: "strain", type: "string", description: "Species/strain key", required: true }],
  outputs: [{ name: "ranges", type: "array", description: "HCD reference ranges per organ", required: true }],
  provenance: { source: "shared/hcd-reference-ranges.json", reference: "Envigo C11963" },
  label: "JSON HCD",
  symbol: "JSON",
});

registerMethod({
  id: "hcd-sqlite",
  name: "SQLite Historical Control Database",
  version: "1.0.0",
  category: "hcd_source",
  description: "SQLite database with 14+ strains, 40+ tissues. Primary HCD source with per-strain, per-organ, per-duration aggregates.",
  applicable_study_types: ALL_STUDY_TYPES,
  applicable_stat_units: INDIVIDUAL_UNIT,
  inputs: [
    { name: "strain", type: "string", description: "Species/strain key", required: true },
    { name: "organ", type: "string", description: "Organ/tissue name", required: true },
    { name: "duration", type: "string", description: "Study duration category", required: false },
  ],
  outputs: [{ name: "ranges", type: "array", description: "HCD reference ranges with n, mean, SD", required: true }],
  provenance: { source: "backend/data/hcd.db", reference: "NTP CEBS + literature" },
  label: "SQLite HCD",
  symbol: "SQLite",
});
