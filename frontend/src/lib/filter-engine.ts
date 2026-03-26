/**
 * Composable filter predicate engine.
 *
 * Pure functions that evaluate filter predicates against CohortSubjects.
 * Each predicate type is a pure function. The engine composes them with AND/OR logic.
 * Zero UI dependencies -- pure data transformation.
 *
 * @see docs/incoming/cohort-view-overhaul.md (PRD section 2.1)
 */
import type {
  CohortSubject,
  CohortPreset,
  FilterGroup,
  FilterPredicate,
  CohortFindingRow,
  SubjectSyndromeProfile,
} from "@/types/cohort";

// ── FilterContext ──────────────────────────────────────────────

/**
 * Auxiliary data needed by predicates that look beyond CohortSubject properties.
 *
 * - syndromes: per-subject syndrome profiles keyed by USUBJID
 * - findings: all CohortFindingRows for the current view
 * - subjectOrganCounts: pre-computed per-subject distinct organ counts
 * - histopathMap: per-subject histopath data with numeric severity grades (0-5)
 *   Keyed by USUBJID, then by FINDING_NAME (uppercased).
 *   This is the correct source for severity predicates (NOT CohortFindingRow.severity).
 */
export interface FilterContext {
  syndromes: Record<string, SubjectSyndromeProfile>;
  findings: CohortFindingRow[];
  subjectOrganCounts: Map<string, number>;
  histopathMap: Map<string, Map<string, { severity_num: number; severity: string | null }>>;
}

// ── Core evaluation ────────────────────────────────────────────

/**
 * Evaluate a FilterGroup against a single subject.
 *
 * - AND: all predicates must pass (empty = true / identity)
 * - OR: any predicate must pass (empty = true / identity)
 */
export function evaluateFilter(
  subject: CohortSubject,
  filter: FilterGroup,
  ctx: FilterContext,
): boolean {
  const { operator, predicates } = filter;

  // Empty predicates = identity filter (passes all)
  if (predicates.length === 0) return true;

  if (operator === "and") {
    return predicates.every((p) => evaluatePredicate(subject, p, ctx));
  }
  // operator === "or"
  return predicates.some((p) => evaluatePredicate(subject, p, ctx));
}

// ── Predicate evaluators ───────────────────────────────────────

/**
 * Evaluate a single predicate against a subject.
 * Exported for direct testing of individual predicates.
 */
export function evaluatePredicate(
  subject: CohortSubject,
  predicate: FilterPredicate,
  ctx: FilterContext,
): boolean {
  switch (predicate.type) {
    case "dose":
      return predicate.values.has(subject.doseGroupOrder);

    case "sex":
      return predicate.values.has(subject.sex);

    case "organ":
      return evalOrgan(subject, predicate, ctx);

    case "domain":
      return evalDomain(subject, predicate, ctx);

    case "syndrome":
      return evalSyndrome(subject, predicate, ctx);

    case "severity":
      return evalSeverity(subject, predicate, ctx);

    case "bw_change":
      return evalBwChange(subject, predicate, ctx);

    case "organ_count":
      return (ctx.subjectOrganCounts.get(subject.usubjid) ?? 0) >= predicate.min;

    case "disposition":
      return evalDisposition(subject, predicate);

    case "recovery":
      return subject.isRecovery === predicate.isRecovery;

    case "tk":
      return subject.isTK === predicate.isTK;

    case "search":
      return subject.usubjid.toLowerCase().includes(predicate.query.toLowerCase());

    // Stubs for Phase 3
    case "onset_day":
      return true;

    case "recovery_verdict":
      return true;
  }
}

// ── Individual predicate evaluators ────────────────────────────

function evalOrgan(
  subject: CohortSubject,
  pred: Extract<FilterPredicate, { type: "organ" }>,
  ctx: FilterContext,
): boolean {
  const role = pred.role ?? "any";

  for (const f of ctx.findings) {
    if (f.organName !== pred.organName) continue;

    // Check if subject has a value in this finding
    if (f.subjectValues[subject.usubjid] == null) continue;

    // Role filter
    if (role === "any") return true;
    if (role === "adverse" && f.severity === "adverse") return true;
    if (role === "warning" && (f.severity === "warning" || f.severity === "adverse")) return true;
  }

  return false;
}

function evalDomain(
  subject: CohortSubject,
  pred: Extract<FilterPredicate, { type: "domain" }>,
  ctx: FilterContext,
): boolean {
  for (const f of ctx.findings) {
    if (f.domain !== pred.domain) continue;
    if (f.subjectValues[subject.usubjid] != null) return true;
  }
  return false;
}

function evalSyndrome(
  subject: CohortSubject,
  pred: Extract<FilterPredicate, { type: "syndrome" }>,
  ctx: FilterContext,
): boolean {
  const profile = ctx.syndromes[subject.usubjid];
  if (!profile) return false;

  const { syndromeId, matchType } = pred;

  // Check full matches
  const hasFullMatch = profile.syndromes.some((s) => s.syndrome_id === syndromeId);
  if (matchType === "full") return hasFullMatch;

  // Check partial matches
  const hasPartialMatch = profile.partial_syndromes.some((s) => s.syndrome_id === syndromeId);
  if (matchType === "partial") return hasPartialMatch;

  // matchType === "any": either full or partial
  return hasFullMatch || hasPartialMatch;
}

/**
 * Severity predicate: uses histopathMap from FilterContext.
 *
 * Looks up the subject's USUBJID in ctx.histopathMap.
 * If found, iterates the inner Map's values and checks if ANY finding
 * has severity_num >= minGrade. Returns false if no entry or no match.
 *
 * IMPORTANT: Does NOT use CohortFindingRow.severity (which is categorical).
 */
function evalSeverity(
  subject: CohortSubject,
  pred: Extract<FilterPredicate, { type: "severity" }>,
  ctx: FilterContext,
): boolean {
  const subjectFindings = ctx.histopathMap.get(subject.usubjid);
  if (!subjectFindings) return false;

  for (const entry of subjectFindings.values()) {
    if (entry.severity_num >= pred.minGrade) return true;
  }
  return false;
}

/**
 * BW change predicate: looks for BW domain findings and checks % change.
 *
 * Searches findings for domain="BW", extracts the subject's value,
 * and checks against minPct threshold in the specified direction.
 */
function evalBwChange(
  subject: CohortSubject,
  pred: Extract<FilterPredicate, { type: "bw_change" }>,
  ctx: FilterContext,
): boolean {
  for (const f of ctx.findings) {
    if (f.domain !== "BW") continue;

    const val = f.subjectValues[subject.usubjid];
    if (val == null || typeof val !== "number") continue;

    if (pred.direction === "loss" && val <= -pred.minPct) return true;
    if (pred.direction === "gain" && val >= pred.minPct) return true;
  }
  return false;
}

/**
 * Disposition predicate: maps disposition values to CohortSubject badge.
 *
 * TRS disposition values ("found_dead", "moribund", "early_sacrifice") map to badge="trs".
 * "scheduled" maps to subjects without TRS badge (normal scheduled sacrifice).
 */
function evalDisposition(
  subject: CohortSubject,
  pred: Extract<FilterPredicate, { type: "disposition" }>,
): boolean {
  const TRS_VALUES = new Set(["found_dead", "moribund", "early_sacrifice"]);
  const hasTrsValue = [...pred.values].some((v) => TRS_VALUES.has(v));
  const hasScheduled = pred.values.has("scheduled");

  if (hasTrsValue && subject.badge === "trs") return true;
  if (hasScheduled && subject.badge !== "trs") return true;
  return false;
}

// ── Preset conversion ──────────────────────────────────────────

/**
 * Convert a CohortPreset into an equivalent FilterGroup.
 *
 * @param preset - The preset to convert
 * @param includeTK - Whether to include TK subjects (default: undefined = no TK exclusion)
 */
export function presetToFilter(
  preset: CohortPreset,
  includeTK?: boolean,
): FilterGroup {
  const predicates: FilterPredicate[] = [];

  switch (preset) {
    case "trs":
      predicates.push({
        type: "disposition",
        values: new Set(["found_dead", "moribund", "early_sacrifice"]),
      });
      break;

    case "histo":
      // OR(severity adverse, organ_count 2) -- severity 4 = "marked" is the "adverse" threshold
      return {
        operator: "or",
        predicates: [
          { type: "severity", minGrade: 4 },
          { type: "organ_count", min: 2 },
          // Add TK exclusion if needed
          ...(includeTK === false ? [] : []),
        ].filter(Boolean) as FilterPredicate[],
      };

    case "recovery":
      predicates.push({ type: "recovery", isRecovery: true });
      break;

    case "all":
      // Empty predicates = identity (all pass)
      break;
  }

  // Add TK exclusion for non-histo presets
  if (includeTK === false) {
    predicates.push({ type: "tk", isTK: false });
  }

  return { operator: "and", predicates };
}
