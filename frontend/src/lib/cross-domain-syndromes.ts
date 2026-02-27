/**
 * Cross-Domain Syndrome Detection Engine (Layer B).
 * Matches endpoints against 10 predefined cross-domain patterns (XS01-XS10)
 * using structured term dictionaries with test codes, canonical labels,
 * specimen+finding matching, and compound required logic.
 *
 * Types live in cross-domain-syndrome-types.ts, static data in
 * cross-domain-syndrome-data.ts. This file contains all engine logic
 * and re-exports everything for backward-compatible imports.
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import { checkMagnitudeFloorOM } from "@/lib/organ-weight-normalization";
import type {
  SyndromeTermMatch,
  RequiredLogic,
  SyndromeDefinition,
  CrossDomainSyndrome,
  EndpointMatch,
  DirectionalGateResult,
  MagnitudeFloor,
  TermReportEntry,
  SyndromeTermReport,
} from "./cross-domain-syndrome-types";
import {
  SYNDROME_DEFINITIONS,
  DIRECTIONAL_GATES,
  ENDPOINT_CLASS_FLOORS,
} from "./cross-domain-syndrome-data";

// ─── Re-exports (backward compatibility) ──────────────────

export type {
  SyndromeTermMatch,
  RequiredLogic,
  SyndromeDefinition,
  EndpointMatch,
  DirectionalGateConfig,
  DirectionalGateResult,
  CrossDomainSyndrome,
  MagnitudeFloor,
  TermReportEntry,
  SyndromeTermReport,
  SyndromeNearMissInfo,
} from "./cross-domain-syndrome-types";

export {
  SYNDROME_DEFINITIONS,
  DIRECTIONAL_GATES,
  ENDPOINT_CLASS_FLOORS,
} from "./cross-domain-syndrome-data";

// ─── Normalization & parsing helpers ───────────────────────

/** Normalize a label for comparison: lowercase, collapse separators & whitespace. */
function normalizeLabel(label: string): string {
  return label.toLowerCase().trim()
    .replace(/[_\-:,]/g, " ")
    .replace(/\s+/g, " ");
}

/** Check if `term` appears as a whole word/phrase within `text` (both pre-normalized). */
function containsWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(` ${text} `);
}

/**
 * Parse "SPECIMEN — FINDING" or "SPECIMEN, LOCATION — FINDING" from endpoint_label.
 * Returns null if the label doesn't match the specimen:finding format.
 */
function parseSpecimenFinding(label: string): { specimen: string; finding: string } | null {
  // Pattern: "SPECIMEN — FINDING" or "SPECIMEN - FINDING" or "SPECIMEN: FINDING"
  const match = label.match(/^(.+?)\s*[—:\u2014]\s*(.+)$/);
  if (match) return { specimen: match[1].trim(), finding: match[2].trim() };
  // Fallback: try simple dash separator (but not within compound words)
  const dashMatch = label.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) return { specimen: dashMatch[1].trim(), finding: dashMatch[2].trim() };
  return null;
}

// ─── Matching logic ────────────────────────────────────────

/** Check if an endpoint matches a single term definition. */
function matchEndpoint(ep: EndpointSummary, term: SyndromeTermMatch): boolean {
  // 1. Domain must match
  if (ep.domain.toUpperCase() !== term.domain) return false;

  // 2. Direction must match (if specified)
  if (term.direction !== "any") {
    if (ep.direction !== term.direction) return false;
  }

  // 3. Match by test code (LB domain, highest priority)
  if (term.testCodes) {
    const epTestCode = ep.testCode?.toUpperCase();
    if (epTestCode && term.testCodes.includes(epTestCode)) return true;
  }

  // 4. Match by canonical label (exact after normalization)
  if (term.canonicalLabels) {
    const normalized = normalizeLabel(ep.endpoint_label);
    if (term.canonicalLabels.some((cl) => normalized === cl)) return true;
  }

  // 5. Match by specimen + finding (MI/MA domain)
  if (term.specimenTerms) {
    let specimen = ep.specimen;
    let finding = ep.finding;
    if (!specimen || !finding) {
      const parsed = parseSpecimenFinding(ep.endpoint_label);
      if (parsed) {
        specimen = specimen ?? parsed.specimen;
        finding = finding ?? parsed.finding;
      }
    }
    if (specimen && finding) {
      const normSpecimen = normalizeLabel(specimen);
      const normFinding = normalizeLabel(finding);
      const specimenMatch = term.specimenTerms.specimen.length === 0 ||
        term.specimenTerms.specimen.some((s) => containsWord(normSpecimen, s));
      const findingMatch = term.specimenTerms.finding.some((f) => containsWord(normFinding, f));
      if (specimenMatch && findingMatch) return true;
    }
  }

  // 6. Match by organ weight specimen (OM domain)
  if (term.organWeightTerms) {
    let specimen = ep.specimen;
    if (!specimen) {
      const parsed = parseSpecimenFinding(ep.endpoint_label);
      specimen = parsed?.specimen ?? ep.endpoint_label;
    }
    const normSpecimen = normalizeLabel(specimen);
    if (term.organWeightTerms.specimen.length === 0 ||
        term.organWeightTerms.specimen.some((s) => containsWord(normSpecimen, s))) {
      return true;
    }
  }

  return false;
}

/**
 * Identity-only matching: checks domain + test codes / canonical labels /
 * specimen+finding / organ weight — but skips the direction check.
 * Used for two-pass term evaluation (find the endpoint first, classify status second).
 */
function matchEndpointIdentity(ep: EndpointSummary, term: SyndromeTermMatch): boolean {
  // 1. Domain must match
  if (ep.domain.toUpperCase() !== term.domain) return false;

  // NO direction check — identity only

  // 2. Match by test code (LB domain, highest priority)
  if (term.testCodes) {
    const epTestCode = ep.testCode?.toUpperCase();
    if (epTestCode && term.testCodes.includes(epTestCode)) return true;
  }

  // 3. Match by canonical label (exact after normalization)
  if (term.canonicalLabels) {
    const normalized = normalizeLabel(ep.endpoint_label);
    if (term.canonicalLabels.some((cl) => normalized === cl)) return true;
  }

  // 4. Match by specimen + finding (MI/MA domain)
  if (term.specimenTerms) {
    let specimen = ep.specimen;
    let finding = ep.finding;
    if (!specimen || !finding) {
      const parsed = parseSpecimenFinding(ep.endpoint_label);
      if (parsed) {
        specimen = specimen ?? parsed.specimen;
        finding = finding ?? parsed.finding;
      }
    }
    if (specimen && finding) {
      const normSpecimen = normalizeLabel(specimen);
      const normFinding = normalizeLabel(finding);
      const specimenMatch = term.specimenTerms.specimen.length === 0 ||
        term.specimenTerms.specimen.some((s) => containsWord(normSpecimen, s));
      const findingMatch = term.specimenTerms.finding.some((f) => containsWord(normFinding, f));
      if (specimenMatch && findingMatch) return true;
    }
  }

  // 5. Match by organ weight specimen (OM domain)
  if (term.organWeightTerms) {
    let specimen = ep.specimen;
    if (!specimen) {
      const parsed = parseSpecimenFinding(ep.endpoint_label);
      specimen = parsed?.specimen ?? ep.endpoint_label;
    }
    const normSpecimen = normalizeLabel(specimen);
    if (term.organWeightTerms.specimen.length === 0 ||
        term.organWeightTerms.specimen.some((s) => containsWord(normSpecimen, s))) {
      return true;
    }
  }

  return false;
}

/** Supporting finding gate: must show SOME evidence of being real. */
function passesSupportingGate(ep: EndpointSummary): boolean {
  return (
    ep.worstSeverity === "adverse" ||
    ep.worstSeverity === "warning" ||
    (ep.minPValue !== null && ep.minPValue < 0.1) ||
    (ep.maxIncidence !== undefined && ep.maxIncidence !== null && ep.maxIncidence >= 0.2)
  );
}

// ─── Compound required logic evaluator ────────────────────

/**
 * Evaluate compound required logic against a set of matched tags.
 * Tags are assigned to each required term in the term dictionary.
 */
function evaluateRequiredLogic(
  logic: RequiredLogic,
  matchedTags: Set<string>,
): boolean {
  switch (logic.type) {
    case "any":
      // At least one required term must match
      return matchedTags.size > 0;

    case "all":
      // All required terms must match — checked by caller
      return true; // "all" is checked differently: caller verifies all tags are present

    case "compound":
      return evaluateCompoundExpression(logic.expression, matchedTags);
  }
}

/**
 * REM-26: Evaluate a compound expression and return the satisfied clause + participating tags.
 * Returns null if the expression is not satisfied.
 */
function evaluateCompoundExpressionDetailed(
  expr: string,
  matchedTags: Set<string>,
): { clause: string; tags: string[] } | null {
  const normalized = expr.trim();

  // ANY(a, b, (c AND d)) — return the FIRST satisfied branch
  const anyMatch = normalized.match(/^ANY\((.+)\)$/);
  if (anyMatch) {
    const items = splitTopLevel(anyMatch[1]);
    for (const item of items) {
      const result = evaluateCompoundExpressionDetailed(item.trim(), matchedTags);
      if (result) return result;
    }
    return null;
  }

  // (X AND Y) — parenthesized sub-expression
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    return evaluateCompoundExpressionDetailed(normalized.slice(1, -1).trim(), matchedTags);
  }

  // X AND Y — all parts must be satisfied; collect all tags, resolve each part's clause
  if (normalized.includes(" AND ")) {
    const parts = normalized.split(" AND ").map((p) => p.trim());
    const allTags: string[] = [];
    const resolvedParts: string[] = [];
    for (const p of parts) {
      const result = evaluateCompoundExpressionDetailed(p, matchedTags);
      if (!result) return null;
      allTags.push(...result.tags);
      resolvedParts.push(result.clause);
    }
    return { clause: resolvedParts.join(" AND "), tags: allTags };
  }

  // X OR Y — return the first satisfied branch
  if (normalized.includes(" OR ")) {
    const parts = normalized.split(" OR ").map((p) => p.trim());
    for (const p of parts) {
      const result = evaluateCompoundExpressionDetailed(p, matchedTags);
      if (result) return result;
    }
    return null;
  }

  // Simple tag name
  if (matchedTags.has(normalized)) {
    return { clause: normalized, tags: [normalized] };
  }
  return null;
}

/**
 * Evaluate a compound expression like "ALP AND (GGT OR 5NT)"
 * or "ANY(NEUT, PLAT, (RBC AND HGB))".
 */
function evaluateCompoundExpression(expr: string, matchedTags: Set<string>): boolean {
  const normalized = expr.trim();

  // ANY(a, b, (c AND d)) — at least one of the items must be true
  const anyMatch = normalized.match(/^ANY\((.+)\)$/);
  if (anyMatch) {
    const items = splitTopLevel(anyMatch[1]);
    return items.some((item) => evaluateCompoundExpression(item.trim(), matchedTags));
  }

  // (X AND Y) — parenthesized sub-expression
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    return evaluateCompoundExpression(normalized.slice(1, -1).trim(), matchedTags);
  }

  // X AND Y
  if (normalized.includes(" AND ")) {
    const parts = normalized.split(" AND ").map((p) => p.trim());
    return parts.every((p) => evaluateCompoundExpression(p, matchedTags));
  }

  // X OR Y
  if (normalized.includes(" OR ")) {
    const parts = normalized.split(" OR ").map((p) => p.trim());
    return parts.some((p) => evaluateCompoundExpression(p, matchedTags));
  }

  // Simple tag name
  return matchedTags.has(normalized);
}

/**
 * Split a comma-separated list at the top level (respecting parentheses).
 * "NEUT, PLAT, (RBC AND HGB)" => ["NEUT", "PLAT", "(RBC AND HGB)"]
 */
function splitTopLevel(str: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

// ─── Confidence assignment ────────────────────────────────

function assignConfidence(
  requiredMet: boolean,
  supportCount: number,
  domainCount: number,
  oppositeCount: number = 0,
): "HIGH" | "MODERATE" | "LOW" {
  // Base confidence from matched evidence
  let base: "HIGH" | "MODERATE" | "LOW" = "LOW";
  if (requiredMet && supportCount >= 3 && domainCount >= 3) base = "HIGH";
  else if (requiredMet && supportCount >= 1 && domainCount >= 2) base = "MODERATE";

  // Cap confidence when opposite-direction matches exist (BTM-1/2)
  if (oppositeCount >= 2) return "LOW";
  if (oppositeCount >= 1 && base === "HIGH") return "MODERATE";

  return base;
}

// ─── Per-sex projection ──────────────────────────────────

/** Check if an endpoint has sex-divergent directions. */
function hasSexDivergence(ep: EndpointSummary): boolean {
  if (!ep.bySex || ep.bySex.size < 2) return false;
  const dirs = new Set([...ep.bySex.values()].map(s => s.direction));
  return dirs.has("up") && dirs.has("down");
}

/** Create a sex-specific view of an endpoint. Only overrides for divergent endpoints. */
function projectToSex(ep: EndpointSummary, sex: string): EndpointSummary {
  const sexData = ep.bySex?.get(sex);
  if (!sexData) return ep; // no data for this sex — use aggregate

  // Only override for divergent endpoints; non-divergent use aggregate (stronger signal)
  if (!hasSexDivergence(ep)) return ep;

  return {
    ...ep,
    direction: sexData.direction,
    maxEffectSize: sexData.maxEffectSize,
    maxFoldChange: sexData.maxFoldChange,
    minPValue: sexData.minPValue,
    pattern: sexData.pattern,
    worstSeverity: sexData.worstSeverity,
    treatmentRelated: sexData.treatmentRelated,
    sexes: [sex],
  };
}

/** Merge endpoint match lists from multiple syndrome results. */
function mergeEndpoints(groups: EndpointMatch[][]): EndpointMatch[] {
  const seen = new Set<string>();
  const result: EndpointMatch[] = [];
  for (const group of groups) {
    for (const m of group) {
      const key = `${m.endpoint_label}::${m.role}::${m.sex ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(m);
      }
    }
  }
  return result;
}

/** Deduplicate syndromes that fired for multiple sexes. */
function deduplicateSyndromes(syndromes: CrossDomainSyndrome[]): CrossDomainSyndrome[] {
  const byId = new Map<string, CrossDomainSyndrome[]>();
  for (const s of syndromes) {
    if (!byId.has(s.id)) byId.set(s.id, []);
    byId.get(s.id)!.push(s);
  }

  const results: CrossDomainSyndrome[] = [];
  for (const [, group] of byId) {
    if (group.length === 1) {
      results.push(group[0]);
      continue;
    }
    // Same syndrome fired for multiple sexes — merge
    const merged: CrossDomainSyndrome = {
      ...group[0],
      matchedEndpoints: mergeEndpoints(group.map(g => g.matchedEndpoints)),
      domainsCovered: [...new Set(group.flatMap(g => g.domainsCovered))].sort(),
      confidence: group.some(g => g.confidence === "HIGH") ? "HIGH"
        : group.some(g => g.confidence === "MODERATE") ? "MODERATE" : "LOW",
      supportScore: Math.max(...group.map(g => g.supportScore)),
      sexes: group.flatMap(g => g.sexes).filter((s, i, a) => a.indexOf(s) === i).sort(),
    };
    results.push(merged);
  }
  return results;
}

// ─── REM-09: Directional gate evaluation ──────────────────

/**
 * REM-09: Evaluate directional gates for a detected syndrome.
 * Checks if any gate-configured term was matched in the opposite direction.
 */
function evaluateDirectionalGates(
  syndromeId: string,
  endpoints: EndpointSummary[],
  _hasMarrowHypocellularity: boolean = false,
  normalizationContexts?: NormalizationContext[],
): DirectionalGateResult {
  const gates = DIRECTIONAL_GATES[syndromeId];
  if (!gates) return { gateFired: false, action: "none", overrideApplied: false, explanation: "" };

  const synDef = SYNDROME_DEFINITIONS.find((s) => s.id === syndromeId);
  if (!synDef) return { gateFired: false, action: "none", overrideApplied: false, explanation: "" };

  for (const gate of gates) {
    // Find the term definition in the syndrome
    const termDef = synDef.terms.find((t) => t.tag === gate.term);
    if (!termDef) continue;

    // Check if any endpoint matches the term identity but in the opposite direction
    for (const ep of endpoints) {
      if (!matchEndpointIdentity(ep, termDef)) continue;

      const isSignificant = ep.minPValue != null && ep.minPValue < 0.05;
      if (!isSignificant) continue;

      // SE-7: Resolve effective direction — use ANCOVA directG for OM gates when available
      let effectiveDirection = ep.direction;
      let ancovaUsed = false;
      if (gate.domain === "OM" && normalizationContexts) {
        const specimen = (ep.specimen ?? "").toUpperCase();
        const normCtx = normalizationContexts.find(c => c.organ === specimen);
        if (normCtx?.effectDecomposition) {
          const { directG, directP } = normCtx.effectDecomposition;
          if (directP < 0.10) {  // Relaxed threshold — gate is a flag, not a finding
            effectiveDirection = directG > 0 ? "up" : directG < 0 ? "down" : ep.direction;
            ancovaUsed = effectiveDirection !== ep.direction;
          }
        }
      }

      // Check if direction is opposite to expected
      if (effectiveDirection && effectiveDirection !== gate.expectedDirection) {
        // Gate fires!
        if (gate.action === "reject" && gate.overrideCondition && _hasMarrowHypocellularity) {
          // Override: soften reject to strong_against
          return {
            gateFired: true,
            action: "strong_against",
            overrideApplied: true,
            overrideReason: "direct_lesion",
            certaintyCap: "mechanism_uncertain",
            explanation: `${gate.term} ${ep.direction === "up" ? "↑" : "↓"} contradicts ${syndromeId}; ` +
              `retained as differential — direct marrow lesion overrides peripheral signal.`,
            ancovaSource: ancovaUsed || undefined,
          };
        }

        const cap: "mechanism_uncertain" | "pattern_only" =
          gate.action === "reject" ? "pattern_only" :
          gate.action === "strong_against" ? "pattern_only" :
          "mechanism_uncertain";

        const dirArrow = effectiveDirection === "up" ? "↑" : "↓";
        const source = ancovaUsed ? " (ANCOVA direct effect)" : "";

        return {
          gateFired: true,
          action: gate.action,
          overrideApplied: false,
          certaintyCap: cap,
          explanation: `${gate.term} ${dirArrow}${source} contradicts expected ` +
            `${gate.expectedDirection === "up" ? "↑" : "↓"} for ${syndromeId}.`,
          ancovaSource: ancovaUsed || undefined,
        };
      }
      break;
    }
  }

  return { gateFired: false, action: "none", overrideApplied: false, explanation: "" };
}

/**
 * REM-09: Apply directional gates to detected syndromes as post-processing.
 * Marks syndromes with gate results but does NOT remove them from the array.
 */
function applyDirectionalGates(
  syndromes: CrossDomainSyndrome[],
  endpoints: EndpointSummary[],
  normalizationContexts?: NormalizationContext[],
): CrossDomainSyndrome[] {
  return syndromes.map((s) => {
    const gate = evaluateDirectionalGates(s.id, endpoints, false, normalizationContexts);
    if (!gate.gateFired) return s;
    return { ...s, directionalGate: gate };
  });
}

// ─── Main detection function ──────────────────────────────

/**
 * Detect syndromes from a set of endpoints, tagging with sex if provided.
 *
 * SE-1/SE-2: normalizationContexts is accepted here for call-chain consistency
 * (the caller forwards it to applyDirectionalGates for SE-7 ANCOVA gate evaluation)
 * but the detection path itself intentionally does NOT use it. Detection is
 * pure pattern-matching — ANCOVA corrections are applied as post-processing
 * via directional gates, and magnitude floors belong in the reporting path.
 */
function detectFromEndpoints(
  endpoints: EndpointSummary[],
  sex: string | null,
  normalizationContexts?: NormalizationContext[],
): CrossDomainSyndrome[] {
  // SE-1/SE-2: Detection path is normalization-unaware by design (see doc above)
  void normalizationContexts;
  const results: CrossDomainSyndrome[] = [];

  for (const syndrome of SYNDROME_DEFINITIONS) {
    const matchedEndpoints: EndpointMatch[] = [];
    const matchedRequiredTags = new Set<string>();
    const matchedSupportingTags = new Set<string>();
    let supportCount = 0;

    const requiredTerms = syndrome.terms.filter((t) => t.role === "required");
    const supportingTerms = syndrome.terms.filter((t) => t.role === "supporting");

    const allRequiredTags = new Set(
      requiredTerms.map((t) => t.tag).filter((t): t is string => t !== undefined)
    );

    const adverseWarning = endpoints.filter(
      (ep) => ep.worstSeverity === "adverse" || ep.worstSeverity === "warning"
    );
    for (const term of requiredTerms) {
      for (const ep of adverseWarning) {
        if (matchEndpoint(ep, term)) {
          if (term.tag) matchedRequiredTags.add(term.tag);
          const alreadyMatched = matchedEndpoints.some(
            (m) => m.endpoint_label === ep.endpoint_label && m.role === "required"
          );
          if (!alreadyMatched) {
            matchedEndpoints.push({
              endpoint_label: ep.endpoint_label,
              domain: ep.domain,
              role: "required",
              direction: ep.direction ?? "none",
              severity: ep.worstSeverity,
              sex,
            });
          }
          break;
        }
      }
    }

    // Collect supporting term matches BEFORE evaluating requiredMet,
    // because compound expressions may reference supporting term tags (REM-12: XS03).
    for (const term of supportingTerms) {
      for (const ep of endpoints) {
        if (matchEndpoint(ep, term) && passesSupportingGate(ep)) {
          if (term.tag) matchedSupportingTags.add(term.tag);
          const alreadyRequired = matchedEndpoints.some(
            (m) => m.endpoint_label === ep.endpoint_label && m.role === "required"
          );
          if (!alreadyRequired) {
            const alreadySupporting = matchedEndpoints.some(
              (m) => m.endpoint_label === ep.endpoint_label && m.role === "supporting"
            );
            if (!alreadySupporting) {
              supportCount++;
              matchedEndpoints.push({
                endpoint_label: ep.endpoint_label,
                domain: ep.domain,
                role: "supporting",
                direction: ep.direction ?? "none",
                severity: ep.worstSeverity,
                sex,
              });
            }
          }
          break;
        }
      }
    }

    // Evaluate required logic — compound expressions see all matched tags (required + supporting)
    let requiredMet = false;
    if (syndrome.requiredLogic.type === "all") {
      requiredMet = allRequiredTags.size > 0 &&
        [...allRequiredTags].every((tag) => matchedRequiredTags.has(tag));
    } else if (syndrome.requiredLogic.type === "compound") {
      // REM-12: Compound expressions can reference both required and supporting tags
      const allMatchedTags = new Set([...matchedRequiredTags, ...matchedSupportingTags]);
      requiredMet = evaluateRequiredLogic(syndrome.requiredLogic, allMatchedTags);
    } else {
      requiredMet = evaluateRequiredLogic(syndrome.requiredLogic, matchedRequiredTags);
    }

    const domainsCovered = [...new Set(matchedEndpoints.map((m) => m.domain))].sort();
    const meetsMinDomains = domainsCovered.length >= syndrome.minDomains;

    if ((requiredMet && meetsMinDomains) || (!requiredMet && supportCount >= 3)) {
      // Count opposite-direction matches for confidence capping (BTM-1/2).
      let oppositeCount = 0;
      const allTerms = [...requiredTerms, ...supportingTerms];
      for (const term of allTerms) {
        const alreadyMatched = matchedEndpoints.some((m) =>
          endpoints.some((ep) =>
            ep.endpoint_label === m.endpoint_label && matchEndpoint(ep, term),
          ),
        );
        if (alreadyMatched) continue;

        for (const ep of endpoints) {
          if (matchEndpointIdentity(ep, term)) {
            const isSignificant = ep.minPValue != null && ep.minPValue < 0.05;
            if (isSignificant && term.direction !== "any" && ep.direction !== term.direction) {
              oppositeCount++;
            }
            break;
          }
        }
      }

      // @field FIELD-03 — patternConfidence (confidence assignment)
      // @field FIELD-18 — requiredMet (compound logic evaluation)
      // @field FIELD-19 — domainsCovered (unique domain list)
      // @field FIELD-20 — supportScore (supporting term count)
      results.push({
        id: syndrome.id,
        name: syndrome.name,
        matchedEndpoints,
        requiredMet,
        domainsCovered,
        confidence: assignConfidence(requiredMet, supportCount, domainsCovered.length, oppositeCount),
        supportScore: supportCount,
        sexes: sex ? [sex] : [],
      });
    }
  }

  return results;
}

export function detectCrossDomainSyndromes(
  endpoints: EndpointSummary[],
  normalizationContexts?: NormalizationContext[],
): CrossDomainSyndrome[] {
  // Check if any endpoint has sex-divergent directions
  const hasDivergent = endpoints.some(ep => hasSexDivergence(ep));

  let results: CrossDomainSyndrome[];
  if (!hasDivergent) {
    results = detectFromEndpoints(endpoints, null, normalizationContexts);
  } else {
  // Collect unique sexes from divergent endpoints
  const allSexes = new Set<string>();
  for (const ep of endpoints) {
    if (hasSexDivergence(ep) && ep.bySex) {
      for (const sex of ep.bySex.keys()) allSexes.add(sex);
    }
  }

  // Run detection per sex with projected endpoints
  const allResults: CrossDomainSyndrome[] = [];
  for (const sex of [...allSexes].sort()) {
    const sexEndpoints = endpoints.map(ep => projectToSex(ep, sex));
    allResults.push(...detectFromEndpoints(sexEndpoints, sex, normalizationContexts));
  }

  results = deduplicateSyndromes(allResults);
  }

  // REM-12: XS10 significance gate — require at least one matched required
  // endpoint with p < 0.05 to prevent over-detection from borderline findings
  results = results.filter((s) => {
    if (s.id !== "XS10") return true;
    const requiredMatched = s.matchedEndpoints.filter((me) => me.role === "required");
    return requiredMatched.some((me) => {
      const ep = endpoints.find((e) => e.endpoint_label === me.endpoint_label);
      return ep && ep.minPValue != null && ep.minPValue < 0.05;
    });
  });

  // REM-09: Apply directional gates as post-processing (SE-7: ANCOVA-aware)
  return applyDirectionalGates(results, endpoints, normalizationContexts);
}

// ─── Near-miss analysis (for Organ Context Panel) ─────────

/**
 * For a syndrome that was NOT detected, analyze which required terms
 * partially matched against the available endpoints.
 * Returns null if the syndrome ID is unknown.
 */
export function getSyndromeNearMissInfo(
  syndromeId: string,
  endpoints: EndpointSummary[],
): { wouldRequire: string; matched: string[]; missing: string[] } | null {
  const def = SYNDROME_DEFINITIONS.find((s) => s.id === syndromeId);
  if (!def) return null;

  const requiredTerms = def.terms.filter((t) => t.role === "required");
  if (requiredTerms.length === 0) return null;

  // Find which required tags matched against adverse/warning endpoints
  const adverseWarning = endpoints.filter(
    (ep) => ep.worstSeverity === "adverse" || ep.worstSeverity === "warning",
  );
  const matchedTags = new Set<string>();
  for (const term of requiredTerms) {
    for (const ep of adverseWarning) {
      if (matchEndpoint(ep, term) && term.tag) {
        matchedTags.add(term.tag);
        break;
      }
    }
  }

  // Collect all required tags
  const allTags = [...new Set(requiredTerms.map((t) => t.tag).filter((t): t is string => !!t))];
  const matched = allTags.filter((t) => matchedTags.has(t));
  const missing = allTags.filter((t) => !matchedTags.has(t));

  // Build "would require" text from the requiredLogic
  const wouldRequire = formatRequiredLogic(def.requiredLogic, allTags);

  return { wouldRequire, matched, missing };
}

// ─── REM-27: Magnitude floors ──────────────────────────────

// Pre-build lookup: testCode → MagnitudeFloor
const MAGNITUDE_FLOOR_BY_CODE: Map<string, MagnitudeFloor> = new Map();
for (const entry of ENDPOINT_CLASS_FLOORS) {
  for (const code of entry.testCodes) {
    MAGNITUDE_FLOOR_BY_CODE.set(code, entry.floor);
  }
}

// Organ weight floors — by specimen name (OM domain has testCode=WEIGHT for all)
// Per-organ calibration: §4.2 reproductive normalization spec (Creasy 2013, Sellers 2007)
const ORGAN_WEIGHT_GONADAL: MagnitudeFloor = { minG: 0.8, minFcDelta: 0.05 };   // testes, epididymides — CV 5–15%
const ORGAN_WEIGHT_PROSTATE: MagnitudeFloor = { minG: 1.0, minFcDelta: 0.10 };   // prostate, seminal vesicles — CV 10–20%
const ORGAN_WEIGHT_OVARY: MagnitudeFloor = { minG: 1.5, minFcDelta: 0.15 };      // ovaries — CV 25–40%
const ORGAN_WEIGHT_UTERUS: MagnitudeFloor = { minG: 1.5, minFcDelta: 0.15 };     // uterus — CV 30–50%
const ORGAN_WEIGHT_GENERAL: MagnitudeFloor = { minG: 0.8, minFcDelta: 0.10 };
const ORGAN_WEIGHT_IMMUNE: MagnitudeFloor = { minG: 0.8, minFcDelta: 0.10 };

const GONADAL_KEYWORDS = ["testis", "testes", "epididymis", "epididymides"];
const PROSTATE_KEYWORDS = ["prostate", "seminal"];
const OVARY_KEYWORDS = ["ovary", "ovaries"];
const UTERUS_KEYWORDS = ["uterus"];
const IMMUNE_ORGAN_KEYWORDS = ["thymus", "adrenal"];

/** Determine organ weight floor subclass from the endpoint label. */
function getOrganWeightFloor(ep: EndpointSummary): MagnitudeFloor {
  const label = (ep.specimen ?? ep.endpoint_label ?? "").toLowerCase();
  if (GONADAL_KEYWORDS.some((kw) => label.includes(kw))) return ORGAN_WEIGHT_GONADAL;
  if (PROSTATE_KEYWORDS.some((kw) => label.includes(kw))) return ORGAN_WEIGHT_PROSTATE;
  if (OVARY_KEYWORDS.some((kw) => label.includes(kw))) return ORGAN_WEIGHT_OVARY;
  if (UTERUS_KEYWORDS.some((kw) => label.includes(kw))) return ORGAN_WEIGHT_UTERUS;
  if (IMMUNE_ORGAN_KEYWORDS.some((kw) => label.includes(kw))) return ORGAN_WEIGHT_IMMUNE;
  return ORGAN_WEIGHT_GENERAL;
}

// RETIC codes for conditional override detection
const RETIC_CODES = new Set(["RETIC", "RET", "RETI"]);
// Erythroid codes for concordant anemia check
const ERYTHROID_CODES = new Set(["RBC", "HGB", "HB", "HCT"]);
const ERYTHROID_FLOOR: MagnitudeFloor = { minG: 0.8, minFcDelta: 0.10 };
// Relaxed RETIC floor when concordant anemia present (v0.2.0: 25% → 15%)
const RETIC_OVERRIDE_FLOOR: MagnitudeFloor = { minG: 0.8, minFcDelta: 0.15 };
// Rare leukocyte codes that require concordance with primary leukocytes
const RARE_LEUKOCYTE_CODES = new Set(["MONO", "EOS", "BASO"]);
// Primary leukocyte codes used for concordance validation
const PRIMARY_LEUKOCYTE_CODES = new Set(["WBC", "NEUT", "ANC", "LYMPH", "LYM"]);

/**
 * Check if concordant anemia is present: ≥2 of RBC/HGB/HCT are ↓ AND
 * each meets the erythroid magnitude floor (|g| ≥ 0.8 OR |FC-1| ≥ 0.10).
 */
function hasConcordantAnemia(allEndpoints: EndpointSummary[]): boolean {
  let count = 0;
  for (const ep of allEndpoints) {
    const code = ep.testCode?.toUpperCase() ?? "";
    if (!ERYTHROID_CODES.has(code)) continue;
    if (ep.direction !== "down") continue;
    const absG = ep.maxEffectSize != null ? Math.abs(ep.maxEffectSize) : null;
    const absFcDelta = ep.maxFoldChange != null ? Math.abs(ep.maxFoldChange - 1.0) : null;
    const passesG = absG != null && absG >= ERYTHROID_FLOOR.minG;
    const passesFc = absFcDelta != null && absFcDelta >= ERYTHROID_FLOOR.minFcDelta;
    if (passesG || passesFc) count++;
    if (count >= 2) return true;
  }
  return false;
}

/**
 * Phase 3: Check if a rare leukocyte has concordant primary leukocyte shifting same direction.
 */
function hasLeukocyteConcordance(
  direction: "up" | "down" | "none" | null | undefined,
  allEndpoints: EndpointSummary[],
): boolean {
  if (!direction || direction === "none") return false;
  for (const ep of allEndpoints) {
    const code = ep.testCode?.toUpperCase() ?? "";
    if (!PRIMARY_LEUKOCYTE_CODES.has(code)) continue;
    if (ep.direction === direction) {
      const isSignificant = ep.minPValue != null && ep.minPValue <= 0.05;
      const hasMeaningfulEffect = (ep.maxEffectSize != null && Math.abs(ep.maxEffectSize) >= 0.5) ||
        (ep.maxFoldChange != null && Math.abs(ep.maxFoldChange - 1.0) >= 0.05);
      if (isSignificant || hasMeaningfulEffect) return true;
    }
  }
  return false;
}

/**
 * REM-27: Check if an endpoint meets the magnitude floor for its class.
 * Returns null if no floor applies (pass through), or a description string if blocked.
 * @internal Exported for testing only.
 */
export function checkMagnitudeFloor(
  ep: EndpointSummary,
  domain: string,
  allEndpoints?: EndpointSummary[],
  normalizationContexts?: NormalizationContext[],
): string | null {
  const code = ep.testCode?.toUpperCase() ?? "";
  let floor = MAGNITUDE_FLOOR_BY_CODE.get(code);

  // OM domain: use organ-specific floor
  if (!floor && domain === "OM") floor = getOrganWeightFloor(ep);
  // BW domain fallback
  if (!floor && domain === "BW") floor = MAGNITUDE_FLOOR_BY_CODE.get("BW");
  // FW domain fallback
  if (!floor && domain === "FW") floor = MAGNITUDE_FLOOR_BY_CODE.get("FC");

  if (!floor) return null; // No floor defined → pass through

  // Phase 2: RETIC conditional override
  if (RETIC_CODES.has(code) && allEndpoints && hasConcordantAnemia(allEndpoints)) {
    floor = RETIC_OVERRIDE_FLOOR;
  }

  const absG = ep.maxEffectSize != null ? Math.abs(ep.maxEffectSize) : null;
  const absFcDelta = ep.maxFoldChange != null ? Math.abs(ep.maxFoldChange - 1.0) : null;

  // OM domain with normalization context: use normalization-aware floor check
  if (domain === "OM" && normalizationContexts) {
    const specimen = (ep.specimen ?? "").toUpperCase();
    const normCtx = normalizationContexts.find(c => c.organ === specimen);
    if (normCtx) {
      const result = checkMagnitudeFloorOM(absG, absFcDelta, normCtx, floor);
      if (result.pass) return null;
      const parts: string[] = [];
      if (absG != null) parts.push(`|g|=${absG.toFixed(2)} < ${floor.minG}`);
      if (absFcDelta != null) parts.push(`|FC-1|=${absFcDelta.toFixed(2)} < ${floor.minFcDelta}`);
      const base = parts.join(", ") || "below magnitude floor";
      return result.annotation ? `${base} — ${result.annotation}` : base;
    }
  }

  // Must fail BOTH checks to be blocked (either criterion sufficient)
  const passesG = absG != null && absG >= floor.minG;
  const passesFc = absFcDelta != null && absFcDelta >= floor.minFcDelta;

  if (passesG || passesFc) {
    // Phase 3: Rare leukocyte concordance
    if (RARE_LEUKOCYTE_CODES.has(code) && allEndpoints) {
      if (!hasLeukocyteConcordance(ep.direction, allEndpoints)) {
        return "rare leukocyte without primary concordance (MONO/EOS/BASO require WBC/NEUT/LYMPH same direction)";
      }
    }
    return null; // Passes floor + concordance → acceptable
  }

  // Build description of why it failed
  const parts: string[] = [];
  if (absG != null) parts.push(`|g|=${absG.toFixed(2)} < ${floor.minG}`);
  if (absFcDelta != null) parts.push(`|FC-1|=${absFcDelta.toFixed(2)} < ${floor.minFcDelta}`);
  return parts.join(", ") || "below magnitude floor";
}

// ─── Term report for Evidence Summary pane ────────────────

/**
 * Build a structured evidence report for the Evidence Summary pane.
 * For each term in the syndrome definition, checks whether any endpoint matches.
 */
export function getSyndromeTermReport(
  syndromeId: string,
  endpoints: EndpointSummary[],
  syndromeSexes?: string[],
  normalizationContexts?: NormalizationContext[],
): SyndromeTermReport | null {
  const def = SYNDROME_DEFINITIONS.find((s) => s.id === syndromeId);
  if (!def) return null;

  const requiredEntries: TermReportEntry[] = [];
  const supportingEntries: TermReportEntry[] = [];

  for (const term of def.terms) {
    const label = getTermDisplayLabel(term);
    const entry: TermReportEntry = {
      label,
      domain: term.domain,
      role: term.role,
      tag: term.tag,
      status: "not_measured",
    };

    // Pass 1: Full match (identity + direction + severity gate)
    let fullMatch = false;
    for (const ep of endpoints) {
      if (matchEndpoint(ep, term)) {
        // For required terms, only match adverse/warning
        if (term.role === "required" && ep.worstSeverity !== "adverse" && ep.worstSeverity !== "warning") continue;
        // For supporting terms, apply supporting gate
        if (term.role === "supporting" && !passesSupportingGate(ep)) continue;

        // REM-25: Check statistical significance for "matched" vs "trend" classification
        const isSignificant = ep.minPValue != null && ep.minPValue <= 0.05;
        const hasMeaningfulEffect = (ep.maxEffectSize != null && Math.abs(ep.maxEffectSize) >= 0.5) ||
          (ep.maxFoldChange != null && Math.abs(ep.maxFoldChange - 1.0) >= 0.05);

        // REM-27: Check magnitude floor
        const floorNote = checkMagnitudeFloor(ep, term.domain, endpoints, normalizationContexts);

        if (isSignificant && !floorNote) {
          entry.status = "matched";
        } else if (isSignificant && floorNote) {
          entry.status = "not_significant";
          entry.magnitudeFloorNote = floorNote;
          entry.matchedEndpoint = ep.endpoint_label;
          entry.pValue = ep.minPValue;
          entry.severity = ep.worstSeverity;
          entry.foundDirection = ep.direction;
          break;
        } else if (hasMeaningfulEffect) {
          entry.status = "trend";
        } else {
          entry.status = "not_significant";
          entry.matchedEndpoint = ep.endpoint_label;
          entry.pValue = ep.minPValue;
          entry.severity = ep.worstSeverity;
          entry.foundDirection = ep.direction;
          break;
        }

        entry.matchedEndpoint = ep.endpoint_label;
        entry.pValue = ep.minPValue;
        entry.severity = ep.worstSeverity;
        entry.foundDirection = ep.direction;
        if (syndromeSexes && syndromeSexes.length === 1) entry.sex = syndromeSexes[0];
        // Normalization annotation for OM terms with BW confounding
        if (term.domain === "OM" && normalizationContexts) {
          const specimen = (ep.specimen ?? "").toUpperCase();
          const normCtx = normalizationContexts.find(c => c.organ === specimen);
          if (normCtx && normCtx.tier >= 2) {
            entry.magnitudeFloorNote = `BW confounding tier ${normCtx.tier} (BW g=${normCtx.bwG.toFixed(2)}), using ${normCtx.activeMode}`;
          }
        }
        fullMatch = true;
        break;
      }
    }

    // Pass 2: Identity-only match (if Pass 1 failed) — classify WHY it didn't match
    if (!fullMatch) {
      let identityMatch: EndpointSummary | null = null;
      for (const ep of endpoints) {
        if (matchEndpointIdentity(ep, term)) {
          identityMatch = ep;
          break;
        }
      }

      if (!identityMatch) {
        entry.status = "not_measured";
      } else {
        const isSignificant = identityMatch.minPValue != null && identityMatch.minPValue < 0.05;
        if (!isSignificant) {
          entry.status = "not_significant";
        } else {
          entry.status = "opposite";
        }
        entry.matchedEndpoint = identityMatch.endpoint_label;
        entry.pValue = identityMatch.minPValue;
        entry.severity = identityMatch.worstSeverity;
        entry.foundDirection = identityMatch.direction;
      }
    }

    if (term.role === "required") {
      requiredEntries.push(entry);
    } else {
      supportingEntries.push(entry);
    }
  }

  // REM-25: "trend" satisfies required logic but is tracked separately
  const requiredMatchedOnly = requiredEntries.filter((e) => e.status === "matched").length;
  const requiredTrendOnly = requiredEntries.filter((e) => e.status === "trend").length;
  const requiredMetCount = requiredMatchedOnly + requiredTrendOnly;
  const supportingMetCount = supportingEntries.filter((e) => e.status === "matched" || e.status === "trend").length;

  const domainsCovered = [...new Set(
    [...requiredEntries, ...supportingEntries]
      .filter((e) => e.status !== "not_measured")
      .map((e) => e.domain),
  )].sort();

  const allTermDomains = [...new Set(def.terms.map((t) => t.domain))];
  const missingDomains = allTermDomains
    .filter((d) => !domainsCovered.includes(d))
    .sort();

  const oppositeCount = [...requiredEntries, ...supportingEntries]
    .filter((e) => e.status === "opposite").length;

  const allRequiredTags = [...new Set(
    requiredEntries.map((e) => e.tag).filter((t): t is string => !!t),
  )];
  const requiredLogicText = formatRequiredLogic(def.requiredLogic, allRequiredTags);

  // REM-26: Determine which compound clause was satisfied and identify promoted supporting tags
  let satisfiedClause: string | null = null;
  const promotedSupportingTags: string[] = [];
  if (def.requiredLogic.type === "compound") {
    const matchedTags = new Set<string>();
    for (const e of [...requiredEntries, ...supportingEntries]) {
      if ((e.status === "matched" || e.status === "trend") && e.tag) {
        matchedTags.add(e.tag);
      }
    }
    const detailed = evaluateCompoundExpressionDetailed(def.requiredLogic.expression, matchedTags);
    if (detailed) {
      satisfiedClause = detailed.clause
        .replace(/\bAND\b/g, "+")
        .replace(/\bOR\b/g, "or");
      const supportingTagSet = new Set(
        supportingEntries.map((e) => e.tag).filter((t): t is string => !!t),
      );
      for (const tag of detailed.tags) {
        if (supportingTagSet.has(tag)) {
          promotedSupportingTags.push(tag);
        }
      }
    }
  }

  return {
    requiredEntries,
    supportingEntries,
    requiredMetCount,
    requiredTrendCount: requiredTrendOnly,
    requiredTotal: requiredEntries.length,
    supportingMetCount,
    supportingTotal: supportingEntries.length,
    domainsCovered,
    missingDomains,
    oppositeCount,
    requiredLogicText,
    requiredLogicType: def.requiredLogic.type,
    satisfiedClause,
    promotedSupportingTags,
  };
}

/**
 * Derive a human-readable display label from a SyndromeTermMatch.
 * Priority: testCodes → canonicalLabels → specimenTerms → organWeightTerms.
 */
export function getTermDisplayLabel(term: SyndromeTermMatch): string {
  const dirArrow = term.direction === "up" ? " ↑" : term.direction === "down" ? " ↓" : "";

  if (term.testCodes && term.testCodes.length > 0) {
    return term.testCodes[0] + dirArrow;
  }
  if (term.canonicalLabels && term.canonicalLabels.length > 0) {
    const label = term.canonicalLabels[0]
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return label + dirArrow;
  }
  if (term.specimenTerms) {
    const specimen = term.specimenTerms.specimen.length > 0
      ? term.specimenTerms.specimen[0].charAt(0).toUpperCase() + term.specimenTerms.specimen[0].slice(1)
      : "Any";
    const finding = term.specimenTerms.finding[0] ?? "finding";
    return `${specimen} ${finding}${dirArrow}`;
  }
  if (term.organWeightTerms) {
    const specimen = term.organWeightTerms.specimen.length > 0
      ? term.organWeightTerms.specimen[0].charAt(0).toUpperCase() + term.organWeightTerms.specimen[0].slice(1)
      : "Organ";
    return `${specimen} weight${dirArrow}`;
  }
  return "Unknown term" + dirArrow;
}

// ─── Syndrome definition lookup ───────────────────────────

/** Get a syndrome definition by ID (for external consumers). */
export function getSyndromeDefinition(syndromeId: string): SyndromeDefinition | undefined {
  return SYNDROME_DEFINITIONS.find((s) => s.id === syndromeId);
}

/** Format required logic as human-readable text. */
function formatRequiredLogic(logic: RequiredLogic, allTags: string[]): string {
  switch (logic.type) {
    case "any":
      return allTags.join(" or ");
    case "all":
      return allTags.join(" + ");
    case "compound":
      return logic.expression
        .replace(/\bAND\b/g, "+")
        .replace(/\bOR\b/g, "or")
        .replace(/\bANY\(/g, "any of (")
        .replace(/,\s*/g, ", ");
  }
}
