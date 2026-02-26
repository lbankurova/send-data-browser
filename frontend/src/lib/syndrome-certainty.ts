/**
 * Syndrome Certainty Grading Module
 *
 * Evaluates discriminating evidence to determine mechanism certainty.
 * Includes enzyme magnitude tiering, upgrade evidence, species-specific markers,
 * and certainty caps (directional gate, single-domain, data sufficiency, liver enzyme).
 *
 * Extracted from syndrome-interpretation.ts for module ergonomics.
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { LesionSeverityRow } from "@/types/analysis-views";
import {
  CANONICAL_SYNONYMS,
  HISTOPATH_PROXIES,
  DOSE_RESPONSE_THRESHOLDS,
} from "@/lib/syndrome-interpretation-types";
import type {
  SyndromeCertainty,
  EnzymeTier,
  UpgradeEvidenceItem,
  UpgradeEvidenceResult,
  DiscriminatingFinding,
  HistopathObservation,
  SyndromeDiscriminators,
} from "@/lib/syndrome-interpretation-types";

// ─── Helper functions (shared with cross-reference module) ────

/**
 * Find an endpoint by canonical name using synonym-aware matching.
 *
 * Resolution order:
 *   1. Exact test code match against all known synonyms
 *   2. _WT suffix → OM domain specimen match
 *   3. Label pattern match against known synonym labels
 *   4. Bare label substring fallback (last resort)
 */
function findByCanonical(
  endpoints: EndpointSummary[],
  canonical: string,
): EndpointSummary | null {
  const upper = canonical.toUpperCase();
  const synonyms = CANONICAL_SYNONYMS[upper];

  // 1. Test code match — try all synonym codes
  const codesToTry = synonyms ? synonyms.testCodes : [upper];
  for (const code of codesToTry) {
    const match = endpoints.find(
      (e) => e.testCode?.toUpperCase() === code.toUpperCase(),
    );
    if (match) return match;
  }

  // 2. For _WT suffix (organ weights), match OM domain by specimen
  if (upper.endsWith("_WT")) {
    const organ = upper.replace("_WT", "").replace(/_/g, " ");
    return (
      endpoints.find(
        (e) =>
          e.domain.toUpperCase() === "OM" &&
          e.endpoint_label.toUpperCase().includes(organ),
      ) ?? null
    );
  }

  // 3. Label pattern match — try all known label patterns
  if (synonyms) {
    for (const pattern of synonyms.labelPatterns) {
      const match = endpoints.find((e) =>
        e.endpoint_label.toUpperCase().includes(pattern.toUpperCase()),
      );
      if (match) return match;
    }
  }

  // 4. Bare label substring fallback
  const byLabel = endpoints.find((e) =>
    e.endpoint_label.toUpperCase().includes(upper),
  );
  return byLabel ?? null;
}

export function annotateWithProxy(observation: HistopathObservation): HistopathObservation {
  for (const proxy of HISTOPATH_PROXIES) {
    if (proxy.pattern.test(observation.finding)) {
      return {
        ...observation,
        proxy: {
          implies: proxy.implies,
          relationship: proxy.relationship,
          confidence: proxy.confidence,
        },
      };
    }
  }
  return observation;
}

/**
 * Check if an expected finding is present, using proxy matching for coding variations.
 */
export function checkFindingWithProxies(
  expectedFinding: string,
  observations: HistopathObservation[],
): { found: boolean; direct: boolean; proxyMatch?: HistopathObservation } {
  // Direct match first
  const direct = observations.find((o) =>
    (o.finding ?? "").toUpperCase().includes(expectedFinding.toUpperCase()),
  );
  if (direct) return { found: true, direct: true };

  // Proxy match
  for (const obs of observations) {
    if (!obs.proxy) continue;

    if (
      expectedFinding.toUpperCase().includes("HYPOCELLUL") &&
      obs.proxy.implies === "CELLULARITY_CHANGE" &&
      obs.doseResponse.includes("increase")
    ) {
      return { found: true, direct: false, proxyMatch: obs };
    }
    if (
      expectedFinding.toUpperCase().includes("HYPOCELLUL") &&
      obs.proxy.implies === "CELLULARITY_CHANGE" &&
      obs.doseResponse.includes("decrease")
    ) {
      return { found: false, direct: false, proxyMatch: obs };
    }
    if (
      expectedFinding.toUpperCase().includes("HYPERCELLUL") &&
      obs.proxy.implies === "CELLULARITY_CHANGE" &&
      obs.doseResponse.includes("decrease")
    ) {
      return { found: true, direct: false, proxyMatch: obs };
    }
  }

  return { found: false, direct: false };
}

/**
 * Classify finding dose-response from lesion severity rows.
 */
export function classifyFindingDoseResponse(rows: LesionSeverityRow[]): string {
  const byDose = new Map<number, number>();
  for (const r of rows) {
    const inc = r.n > 0 ? r.affected / r.n : 0;
    byDose.set(r.dose_level, Math.max(byDose.get(r.dose_level) ?? 0, inc));
  }
  const sorted = [...byDose.entries()].sort((a, b) => a[0] - b[0]);
  if (sorted.length < 2) return "insufficient data";
  const incidences = sorted.map((s) => s[1]);
  const increasing = incidences.every(
    (v, i) => i === 0 || v >= incidences[i - 1] - 0.05,
  );
  const decreasing = incidences.every(
    (v, i) => i === 0 || v <= incidences[i - 1] + 0.05,
  );
  if (increasing) return "dose-dependent increase";
  if (decreasing) return "dose-dependent decrease";
  return "non-monotonic";
}

// ─── Component 1: Certainty grading ───────────────────────

/**
 * Evaluate a single discriminating finding against available data.
 */
export function evaluateDiscriminator(
  disc: SyndromeDiscriminators["findings"][0],
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
): DiscriminatingFinding {
  // Lab/OM endpoint (no "::" in name)
  if (!disc.endpoint.includes("::")) {
    const ep = findByCanonical(allEndpoints, disc.endpoint);
    if (!ep) {
      return {
        endpoint: disc.endpoint,
        description: disc.rationale,
        expectedDirection: disc.expectedDirection,
        actualDirection: null,
        status: "not_available",
        weight: disc.weight,
        source: disc.source,
      };
    }

    const actualDir: "up" | "down" | null =
      ep.direction === "up" || ep.direction === "down" ? ep.direction : null;
    const significant = ep.minPValue != null && ep.minPValue < 0.05;
    if (!significant) {
      if (disc.absenceMeaningful && ep.minPValue != null) {
        // Direction-aware absence logic:
        // expectedDirection="down" + not significant → supports (expected absence confirmed)
        // expectedDirection="up" + not significant → argues_against (expected to see it, didn't)
        return {
          endpoint: disc.endpoint,
          description: disc.rationale,
          expectedDirection: disc.expectedDirection,
          actualDirection: actualDir,
          status: disc.expectedDirection === "down" ? "supports" : "argues_against",
          weight: "moderate",
          source: disc.source,
        };
      }
      // Endpoint measured and direction matches expected → weak support even without
      // statistical significance. Organ weights often have lower power; the directional
      // signal is still biologically informative for discriminator evaluation.
      if (actualDir === disc.expectedDirection) {
        return {
          endpoint: disc.endpoint,
          description: disc.rationale,
          expectedDirection: disc.expectedDirection,
          actualDirection: actualDir,
          status: "supports",
          weight: "moderate",
          source: disc.source,
        };
      }
      return {
        endpoint: disc.endpoint,
        description: disc.rationale,
        expectedDirection: disc.expectedDirection,
        actualDirection: actualDir,
        status: "not_available",
        weight: disc.weight,
        source: disc.source,
      };
    }

    const directionMatches = ep.direction === disc.expectedDirection;
    return {
      endpoint: disc.endpoint,
      description: disc.rationale,
      expectedDirection: disc.expectedDirection,
      actualDirection: actualDir,
      status: directionMatches ? "supports" : "argues_against",
      weight: disc.weight,
      source: disc.source,
    };
  }

  // Histopath finding (SPECIMEN::FINDING)
  const [specimen, finding] = disc.endpoint.split("::");
  const specimenRows = histopathData.filter((r) =>
    (r.specimen ?? "").toUpperCase().includes(specimen.toUpperCase()),
  );

  if (specimenRows.length === 0) {
    // REM-13: Also check syndrome matchedEndpoints for MI-domain matches
    // (histopathData may be empty but the cross-domain detector matched via endpoint summaries)
    const miMatch = allEndpoints.find((ep) =>
      ep.domain === "MI" &&
      (ep.specimen ?? "").toUpperCase().includes(specimen.toUpperCase()) &&
      (ep.finding ?? "").toUpperCase().includes(finding.toUpperCase()),
    );
    if (miMatch) {
      const isPresent = miMatch.direction === disc.expectedDirection ||
        (miMatch.minPValue != null && miMatch.minPValue < 0.2);
      return {
        endpoint: disc.endpoint,
        description: disc.rationale,
        expectedDirection: disc.expectedDirection,
        actualDirection: miMatch.direction === "up" || miMatch.direction === "down" ? miMatch.direction : null,
        status: isPresent && miMatch.direction === disc.expectedDirection ? "supports" : "not_available",
        weight: disc.weight,
        source: disc.source,
      };
    }
    return {
      endpoint: disc.endpoint,
      description: disc.rationale,
      expectedDirection: disc.expectedDirection,
      actualDirection: null,
      status: "not_available",
      weight: disc.weight,
      source: disc.source,
    };
  }

  // Specimen examined — check for finding
  const findingRows = specimenRows.filter((r) =>
    (r.finding ?? "").toUpperCase().includes(finding.toUpperCase()),
  );

  if (findingRows.length === 0) {
    // No direct finding — try proxy matching before giving up
    const allFindings = [...new Set(specimenRows.map((r) => r.finding ?? ""))].filter(Boolean);
    const observations: HistopathObservation[] = allFindings.map((f) => {
      const rows = specimenRows.filter((r) => r.finding === f);
      const maxInc = Math.max(...rows.map((r) => (r.n > 0 ? r.affected / r.n : 0)));
      return annotateWithProxy({
        finding: f,
        peakSeverity: Math.max(...rows.map((r) => r.avg_severity ?? 0)),
        peakIncidence: maxInc,
        doseResponse: classifyFindingDoseResponse(rows),
        relevance: "neutral",
      });
    });

    const proxyResult = checkFindingWithProxies(finding, observations);
    if (proxyResult.found) {
      return {
        endpoint: disc.endpoint,
        description: disc.rationale,
        expectedDirection: disc.expectedDirection,
        actualDirection: disc.expectedDirection === "up" ? "up" : "down",
        status: "supports",
        weight: disc.weight,
        source: disc.source,
      };
    }

    return {
      endpoint: disc.endpoint,
      description: disc.rationale,
      expectedDirection: disc.expectedDirection,
      actualDirection: null,
      status: disc.expectedDirection === "up" ? "argues_against" : "supports",
      weight: disc.weight,
      source: disc.source,
    };
  }

  // Finding observed
  const maxIncidence = Math.max(
    ...findingRows.map((r) => (r.n > 0 ? r.affected / r.n : 0)),
  );
  const isPresent = maxIncidence > 0;

  return {
    endpoint: disc.endpoint,
    description: disc.rationale,
    expectedDirection: disc.expectedDirection,
    actualDirection: isPresent ? "up" : "down",
    status:
      isPresent === (disc.expectedDirection === "up")
        ? "supports"
        : "argues_against",
    weight: disc.weight,
    source: disc.source,
  };
}

/**
 * Assess certainty of a detected syndrome using discriminating evidence.
 */
// @field FIELD-02 — syndrome certainty base assessment
export function assessCertainty(
  syndrome: CrossDomainSyndrome,
  discriminators: SyndromeDiscriminators,
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
): {
  certainty: SyndromeCertainty;
  evidence: DiscriminatingFinding[];
  rationale: string;
  upgradeEvidence?: UpgradeEvidenceResult | null;
} {
  const evidence: DiscriminatingFinding[] = [];
  for (const disc of discriminators.findings) {
    evidence.push(evaluateDiscriminator(disc, allEndpoints, histopathData));
  }

  const supporting = evidence.filter((e) => e.status === "supports");
  const against = evidence.filter((e) => e.status === "argues_against");
  const strongSupporting = supporting.filter((e) => e.weight === "strong");
  const strongAgainst = against.filter((e) => e.weight === "strong");
  const available = evidence.filter((e) => e.status !== "not_available");

  // First gate: did the syndrome fire through required path or fallback?
  if (!syndrome.requiredMet) {
    return {
      certainty: "pattern_only",
      evidence,
      rationale:
        "Syndrome detected through supporting evidence only. Required findings not fully met.",
    };
  }

  // Required IS met — assess mechanism certainty from discriminators
  let certainty: SyndromeCertainty;
  let rationale: string;

  if (strongAgainst.length > 0) {
    certainty = "mechanism_uncertain";
    rationale =
      `Required findings met. But ${strongAgainst.map((e) => e.endpoint).join(", ")} ` +
      `argue${strongAgainst.length === 1 ? "s" : ""} against this specific mechanism. ` +
      `Consider differential (${discriminators.differential}).`;
  } else if (strongSupporting.length > 0) {
    if (against.length === 0) {
      certainty = "mechanism_confirmed";
      rationale =
        `Required findings met. ${strongSupporting.map((e) => e.endpoint).join(", ")} ` +
        `confirm${strongSupporting.length === 1 ? "s" : ""} this mechanism. No contradicting evidence.`;
    } else {
      // Only moderate contradictions remain (strong already excluded above).
      // Strong supporting + moderate-only against = confirmed with caveat.
      certainty = "mechanism_confirmed";
      rationale =
        `Required findings met. ${strongSupporting.map((e) => e.endpoint).join(", ")} ` +
        `confirm${strongSupporting.length === 1 ? "s" : ""} this mechanism. ` +
        `Minor contradicting signal from ${against.map((e) => e.endpoint).join(", ")} ` +
        `(moderate weight) does not override strong evidence.`;
    }
  } else if (supporting.length > 0 && against.length === 0) {
    certainty = "mechanism_confirmed";
    rationale =
      `Required findings met. Moderate supporting evidence from ` +
      `${supporting.map((e) => e.endpoint).join(", ")}. No contradicting evidence.`;
  } else if (available.length === 0) {
    certainty = "mechanism_uncertain";
    rationale =
      "Required findings met but no discriminating evidence available. Cannot confirm specific mechanism.";
  } else {
    certainty = "mechanism_uncertain";
    rationale =
      against.length > 0
        ? `Required findings met. But ${against.map((e) => e.endpoint).join(", ")} argue against. ` +
          `Consider differential (${discriminators.differential}).`
        : "Required findings met. Insufficient discriminating evidence to confirm mechanism.";
  }

  // REM-24: Amend rationale when contradicting evidence exists but template claims none
  const hasGateFired = syndrome.directionalGate?.gateFired;
  const hasContradictingEvidence = hasGateFired || against.length > 0;
  if (hasContradictingEvidence) {
    // Remove any "no contradicting evidence" or "no discriminating evidence" claim
    if (/No contradicting evidence/i.test(rationale) || /no discriminating evidence/i.test(rationale)) {
      // Build the contradiction description
      const contradictions: string[] = [];
      if (hasGateFired) {
        const gate = syndrome.directionalGate!;
        const gateText = gate.explanation.replace(/\.+$/, "");
        contradictions.push(`Directional gate fired (${gate.action}): ${gateText}`);
      }
      for (const a of against) {
        contradictions.push(`${a.endpoint} argues against (${a.weight})`);
      }
      // Replace the misleading claim with accurate contradiction info
      rationale = rationale
        .replace(/\. No contradicting evidence\.?/i, `. Contradicting evidence: ${contradictions.join("; ")}.`)
        .replace(/no discriminating evidence available\. Cannot confirm specific mechanism\.?/i,
          `contradicting evidence present: ${contradictions.join("; ")}.`);
    }
  }

  const capsResult = applyCertaintyCaps(syndrome, certainty, rationale, allEndpoints, histopathData);
  certainty = capsResult.certainty;
  rationale = capsResult.rationale;

  return { certainty, evidence, rationale, upgradeEvidence: capsResult.upgradeEvidence ?? null };
}

/**
 * v0.3.0 PATCH-01: Determine the enzyme magnitude tier for XS01 liver enzyme cap.
 * Cross-references matchedEndpoints (label/domain only) with allEndpoints (has maxFoldChange).
 * Returns the highest tier reached, or null if no enzyme matched or all FC null.
 *
 * Tiers: watchlist (|FC-1|≥0.5, i.e. FC≥1.5×), concern (≥1.0, FC≥2.0×), high (≥2.0, FC≥3.0×).
 * Per Hall 2012 (<2× = adaptive noise), EMA (2-4× "may raise concern", >3-5× "considered adverse").
 */
const LIVER_ENZYME_CODES = new Set([
  "ALT", "ALAT", "AST", "ASAT", "ALP", "ALKP", "GGT",
  "SDH", "GLDH", "GDH", "5NT", "LDH",
]);
const LIVER_ENZYME_LABELS = new Set([
  "alanine aminotransferase", "aspartate aminotransferase",
  "alkaline phosphatase", "gamma-glutamyltransferase",
  "sorbitol dehydrogenase", "glutamate dehydrogenase",
  "5-nucleotidase", "lactate dehydrogenase",
]);

function isLiverEnzyme(endpointLabel: string): boolean {
  return LIVER_ENZYME_CODES.has(endpointLabel.toUpperCase().trim())
    || LIVER_ENZYME_LABELS.has(endpointLabel.toLowerCase().trim());
}

const ENZYME_TIER_THRESHOLDS: { tier: EnzymeTier; minFcDelta: number }[] = [
  { tier: "high", minFcDelta: 2.0 },
  { tier: "concern", minFcDelta: 1.0 },
  { tier: "watchlist", minFcDelta: 0.5 },
];

export function getEnzymeMagnitudeTier(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
): { tier: EnzymeTier; maxFcDelta: number } | null {
  // Identify matched liver enzyme labels
  const matchedEnzymeLabels = new Set<string>();
  for (const m of syndrome.matchedEndpoints) {
    if (m.domain === "LB" && isLiverEnzyme(m.endpoint_label)) {
      matchedEnzymeLabels.add(m.endpoint_label.toLowerCase().trim());
    }
  }
  if (matchedEnzymeLabels.size === 0) return null;

  // Find max |FC-1| among matched enzymes by cross-referencing allEndpoints
  let maxFcDelta = -1;
  for (const ep of allEndpoints) {
    if (ep.domain !== "LB") continue;
    const label = ep.endpoint_label.toLowerCase().trim();
    if (!matchedEnzymeLabels.has(label)) continue;
    if (ep.maxFoldChange == null) continue;
    const fcDelta = Math.abs(ep.maxFoldChange - 1);
    if (fcDelta > maxFcDelta) maxFcDelta = fcDelta;
  }

  if (maxFcDelta < 0) return null; // no FC data

  // Best tier wins
  for (const { tier, minFcDelta } of ENZYME_TIER_THRESHOLDS) {
    if (maxFcDelta >= minFcDelta) return { tier, maxFcDelta };
  }
  // Below watchlist threshold — no tier
  return null;
}

/**
 * v0.3.0 PATCH-04: Evaluate corroborating evidence that can lift a liver enzyme tier cap.
 * 7 evaluators (UE-01, UE-03–UE-08; UE-02 skipped — needs longitudinal data).
 * Strong items score 1.0, moderate items score 0.5.
 */
export function evaluateUpgradeEvidence(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
  histopathData?: LesionSeverityRow[],
): UpgradeEvidenceItem[] {
  const items: UpgradeEvidenceItem[] = [];

  // Helper: find enzyme endpoints matched in this syndrome
  const matchedEnzymes = syndrome.matchedEndpoints.filter(
    (m) => m.domain === "LB" && isLiverEnzyme(m.endpoint_label),
  );
  const matchedEnzymeLabels = new Set(matchedEnzymes.map(m => m.endpoint_label.toLowerCase().trim()));

  // Cross-reference matched enzymes with allEndpoints for full data
  const enzymeData = allEndpoints.filter(
    ep => ep.domain === "LB" && matchedEnzymeLabels.has(ep.endpoint_label.toLowerCase().trim()),
  );

  // ── UE-01: Dose-response pattern ──
  const strongPatterns: Set<string> = new Set(DOSE_RESPONSE_THRESHOLDS.strongPatterns);
  const hasDoseResponse = enzymeData.some(
    ep => ep.pattern != null && strongPatterns.has(ep.pattern) && ep.minPValue != null && ep.minPValue < 0.1,
  );
  const drDetail = hasDoseResponse
    ? enzymeData.filter(ep => ep.pattern && strongPatterns.has(ep.pattern) && ep.minPValue != null && ep.minPValue < 0.1)
        .map(ep => `${ep.endpoint_label}: ${ep.pattern} (p=${ep.minPValue?.toFixed(4)})`)
        .join("; ")
    : "No matched enzyme has strong dose-response pattern with p<0.1";
  items.push({
    id: "UE-01", label: "Dose-response", strength: "strong", score: 1.0,
    met: hasDoseResponse, detail: drDetail,
  });

  // ── UE-02: Time consistency — SKIP (needs longitudinal LB data not available) ──
  items.push({
    id: "UE-02", label: "Time consistency", strength: "strong", score: 1.0,
    met: false, detail: "Requires longitudinal LB data not available in current pipeline",
  });

  // ── UE-03: Co-marker coherence ──
  const findEnzymeFC = (codes: string[]): number | null => {
    for (const code of codes) {
      const ep = allEndpoints.find(e => e.domain === "LB" && e.testCode?.toUpperCase() === code);
      if (ep?.maxFoldChange != null) return ep.maxFoldChange;
    }
    return null;
  };
  const altFC = findEnzymeFC(["ALT", "ALAT"]);
  const astFC = findEnzymeFC(["AST", "ASAT"]);
  const coMarkerCodes = ["BILI", "TBILI", "SDH", "GLDH", "GDH"];
  const hasSignificantCoMarker = allEndpoints.some(
    ep => ep.domain === "LB" && coMarkerCodes.includes(ep.testCode?.toUpperCase() ?? "") &&
      ep.direction === "up" && ep.minPValue != null && ep.minPValue < 0.05,
  );
  const altGtAst = altFC != null && astFC != null && altFC > astFC;
  const coMarkerMet = altGtAst && hasSignificantCoMarker;
  items.push({
    id: "UE-03", label: "Co-marker coherence", strength: "strong", score: 1.0,
    met: coMarkerMet,
    detail: coMarkerMet
      ? `ALT FC ${altFC?.toFixed(2)}× > AST FC ${astFC?.toFixed(2)}× with significant co-marker`
      : altGtAst ? "ALT > AST but no significant BILI/SDH/GLDH"
      : altFC == null || astFC == null ? "ALT or AST FC not available"
      : "AST ≥ ALT (mixed/muscle source pattern)",
  });

  // ── UE-04: Anatomic pathology ──
  const hasMI = syndrome.domainsCovered.includes("MI");
  const hasLiverHistopath = (histopathData ?? []).some(
    r => /liver/i.test(r.specimen ?? "") && (r.affected > 0),
  );
  items.push({
    id: "UE-04", label: "Anatomic pathology", strength: "strong", score: 1.0,
    met: hasMI || hasLiverHistopath,
    detail: hasMI ? "MI domain present in syndrome detection"
      : hasLiverHistopath ? "Liver lesion(s) in histopathology data"
      : "No MI domain coverage and no liver histopathology findings",
  });

  // ── UE-05: Organ weight concordance ──
  const hasLiverWeight = syndrome.matchedEndpoints.some(
    m => m.domain === "OM" && /liver/i.test(m.endpoint_label),
  );
  items.push({
    id: "UE-05", label: "Organ weight concordance", strength: "moderate", score: 0.5,
    met: hasLiverWeight,
    detail: hasLiverWeight
      ? "Liver weight change in matched endpoints"
      : "No liver weight endpoint in syndrome match",
  });

  // ── UE-06: Functional impairment ──
  const funcCriteria: { codes: string[]; direction: "up" | "down" }[] = [
    { codes: ["ALB"], direction: "down" },
    { codes: ["PT", "APTT", "INR"], direction: "up" },
    { codes: ["CHOL", "TRIG", "GLUC"], direction: "up" },
    { codes: ["CHOL", "TRIG", "GLUC"], direction: "down" },
  ];
  const funcMatches: string[] = [];
  for (const crit of funcCriteria) {
    const match = allEndpoints.find(
      ep => ep.domain === "LB" && crit.codes.includes(ep.testCode?.toUpperCase() ?? "")
        && ep.direction === crit.direction && ep.minPValue != null && ep.minPValue < 0.05,
    );
    if (match) funcMatches.push(`${match.testCode} ${crit.direction === "up" ? "↑" : "↓"}`);
  }
  items.push({
    id: "UE-06", label: "Functional impairment", strength: "moderate", score: 0.5,
    met: funcMatches.length > 0,
    detail: funcMatches.length > 0
      ? `Functional markers: ${funcMatches.join(", ")}`
      : "No significant ALB↓, PT/APTT↑, or CHOL/TRIG/GLUC abnormality",
  });

  // ── UE-07: GLDH liver-specific ──
  const liverSpecificCodes = ["GLDH", "GDH", "SDH"];
  const liverSpecificMatch = allEndpoints.find(
    ep => ep.domain === "LB" && liverSpecificCodes.includes(ep.testCode?.toUpperCase() ?? "")
      && ep.direction === "up" && ep.minPValue != null && ep.minPValue < 0.05,
  );
  items.push({
    id: "UE-07", label: "GLDH liver-specific", strength: "moderate", score: 0.5,
    met: !!liverSpecificMatch,
    detail: liverSpecificMatch
      ? `${liverSpecificMatch.testCode} ↑ significant (p=${liverSpecificMatch.minPValue?.toFixed(4)})`
      : "No significant GLDH/GDH/SDH elevation",
  });

  // ── UE-08: miR-122 ──
  const mir122Match = allEndpoints.find(
    ep => ep.domain === "LB" && (ep.testCode?.toUpperCase() ?? "").includes("MIR122")
      && ep.direction === "up",
  );
  const othersMet = items.filter(i => i.id !== "UE-02" && i.id !== "UE-08" && i.met).length;
  const mir122Met = !!mir122Match && othersMet >= 1;
  items.push({
    id: "UE-08", label: "miR-122", strength: "moderate", score: 0.5,
    met: mir122Met,
    detail: mir122Match
      ? mir122Met ? "miR-122 ↑ with ≥1 other upgrade evidence"
        : "miR-122 ↑ detected but no other upgrade evidence met (co-requirement)"
      : "miR-122 not measured",
  });

  return items;
}

/**
 * Apply all certainty caps (directional gate, single-domain, data sufficiency, liver enzyme tiers).
 * Extracted so both the discriminator and no-discriminator paths use the same logic.
 */
// @field FIELD-02 — certainty caps (can only reduce, except liver enzyme upgrade)
export function applyCertaintyCaps(
  syndrome: CrossDomainSyndrome,
  certainty: SyndromeCertainty,
  rationale: string,
  allEndpoints: EndpointSummary[],
  histopathData?: LesionSeverityRow[],
): { certainty: SyndromeCertainty; rationale: string; upgradeEvidence?: UpgradeEvidenceResult | null } {
  const CERTAINTY_ORDER: Record<SyndromeCertainty, number> = {
    pattern_only: 0, mechanism_uncertain: 1, mechanism_confirmed: 2,
  };

  // REM-09: Apply directional gate certainty cap
  if (syndrome.directionalGate?.gateFired && syndrome.directionalGate.certaintyCap) {
    const cap = syndrome.directionalGate.certaintyCap;
    if (CERTAINTY_ORDER[certainty] > CERTAINTY_ORDER[cap]) {
      certainty = cap;
      rationale += ` Capped at ${cap} due to directional gate: ${syndrome.directionalGate.explanation}`;
    }
  }

  // REM-12: Single-domain certainty cap for XS04/XS05
  const SINGLE_DOMAIN_CAP_SYNDROMES = new Set(["XS04", "XS05"]);
  if (SINGLE_DOMAIN_CAP_SYNDROMES.has(syndrome.id) && syndrome.domainsCovered.length === 1) {
    if (CERTAINTY_ORDER[certainty] > CERTAINTY_ORDER["pattern_only"]) {
      certainty = "pattern_only";
      rationale += ` Capped at pattern_only: single-domain detection (${syndrome.domainsCovered[0]} only) cannot confirm mechanism.`;
    }
  }

  // REM-15: Data sufficiency gate — cap certainty when confirmatory domains are missing
  const DATA_SUFFICIENCY: Record<string, { domain: string; role: "confirmatory" | "supporting" }[]> = {
    XS01: [{ domain: "MI", role: "confirmatory" }],
    XS03: [{ domain: "MI", role: "confirmatory" }],
    XS04: [{ domain: "MI", role: "confirmatory" }],
    XS07: [{ domain: "MI", role: "confirmatory" }],
    XS10: [{ domain: "LB", role: "supporting" }],
  };
  const suffReqs = DATA_SUFFICIENCY[syndrome.id];
  if (suffReqs) {
    const coveredDomains = new Set(syndrome.domainsCovered);
    for (const req of suffReqs) {
      if (!coveredDomains.has(req.domain)) {
        const maxCert: SyndromeCertainty = req.role === "confirmatory" ? "pattern_only" : "mechanism_uncertain";
        if (CERTAINTY_ORDER[certainty] > CERTAINTY_ORDER[maxCert]) {
          certainty = maxCert;
          rationale += ` Capped at ${maxCert}: ${req.role} domain ${req.domain} not available in study data.`;
        }
      }
    }
  }

  // v0.3.0 PATCH-01 + PATCH-04: Tiered liver enzyme certainty cap with upgrade evidence.
  let upgradeEvidence: UpgradeEvidenceResult | null = null;
  if (syndrome.id === "XS01") {
    const tierResult = getEnzymeMagnitudeTier(syndrome, allEndpoints);
    if (tierResult && tierResult.tier !== "high") {
      const TIER_CAPS: Record<Exclude<EnzymeTier, "high">, SyndromeCertainty> = {
        watchlist: "pattern_only",
        concern: "mechanism_uncertain",
      };
      const tierCap = TIER_CAPS[tierResult.tier];
      const preCertainty = certainty;

      if (CERTAINTY_ORDER[certainty] > CERTAINTY_ORDER[tierCap]) {
        certainty = tierCap;
      }
      const cappedCertainty = certainty;

      // PATCH-04: Evaluate upgrade evidence and potentially lift the cap
      const ueItems = evaluateUpgradeEvidence(
        syndrome, allEndpoints, histopathData,
      );
      const totalScore = ueItems.reduce((s, item) => s + (item.met ? item.score : 0), 0);

      // Lift levels: ≥1.0 → lift one, ≥2.0 → lift two
      let levelsLifted = 0;
      if (totalScore >= 2.0) levelsLifted = 2;
      else if (totalScore >= 1.0) levelsLifted = 1;

      // Apply lift (pattern_only → mechanism_uncertain → mechanism_confirmed)
      const CERTAINTY_LADDER: SyndromeCertainty[] = ["pattern_only", "mechanism_uncertain", "mechanism_confirmed"];
      let finalCertainty = cappedCertainty;
      if (levelsLifted > 0) {
        const currentIdx = CERTAINTY_LADDER.indexOf(cappedCertainty);
        const liftedIdx = Math.min(currentIdx + levelsLifted, CERTAINTY_LADDER.length - 1);
        finalCertainty = CERTAINTY_LADDER[liftedIdx];
        // Clamp: cannot exceed preCertainty (upgrade only reverses enzyme cap, not other caps)
        if (CERTAINTY_ORDER[finalCertainty] > CERTAINTY_ORDER[preCertainty]) {
          finalCertainty = preCertainty;
        }
      }
      certainty = finalCertainty;

      // Build rationale
      const metItems = ueItems.filter(i => i.met);
      if (levelsLifted > 0) {
        rationale += ` Liver enzyme tier: ${tierResult.tier} (max FC ${(tierResult.maxFcDelta + 1).toFixed(1)}×). Capped at ${cappedCertainty}, lifted ${levelsLifted} level(s) to ${finalCertainty} by upgrade evidence (score ${totalScore.toFixed(1)}: ${metItems.map(i => i.id).join(", ")}).`;
      } else if (CERTAINTY_ORDER[cappedCertainty] < CERTAINTY_ORDER[preCertainty]) {
        rationale += ` Liver enzyme tier: ${tierResult.tier} (max FC ${(tierResult.maxFcDelta + 1).toFixed(1)}×). Capped at ${cappedCertainty}. No upgrade evidence met (score ${totalScore.toFixed(1)}).`;
      }

      upgradeEvidence = {
        items: ueItems,
        totalScore,
        levelsLifted,
        tier: tierResult.tier,
        cappedCertainty,
        finalCertainty: certainty,
      };
    }
  }

  return { certainty, rationale, upgradeEvidence };
}

// ─── REM-11: Species-specific preferred biomarkers ───────────

/**
 * Species-specific preferred markers — superior alternatives to standard markers
 * that improve certainty when present but carry no penalty when absent.
 * Per O'Brien 2002 (GLDH/SDH for rat), FDA/EMA guidance (KIM-1 for rat nephrotoxicity).
 */
// @species SPECIES-01 — rat-only preferred biomarkers (GLDH, SDH, KIM-1, clusterin, troponin)
const SPECIES_PREFERRED_MARKERS: Record<string, Record<string, {
  markers: string[];
  rationale: string;
}>> = {
  rat: {
    XS01: {
      markers: ["GLDH", "SDH"],
      rationale: "GLDH/SDH are liver-specific in rats (ALT has muscle/RBC sources).",
    },
    XS02: {
      markers: ["BILE ACIDS", "TBA"],
      rationale: "GGT is virtually undetectable in healthy rats; bile acids are more sensitive for cholestasis.",
    },
    XS03: {
      markers: ["KIM-1", "CLUSTERIN", "URINARY ALBUMIN"],
      rationale: "FDA/EMA-qualified urinary biomarkers for rat nephrotoxicity.",
    },
    XS10: {
      markers: ["CTNI", "CTNT", "TROPONIN"],
      rationale: "Cardiac troponins improve certainty for structural cardiac damage in rats.",
    },
  },
};

/**
 * Check species-specific preferred markers and return annotations.
 * Returns { present: matched markers, absent: not-measured markers, narrative }.
 */
// @field FIELD-32 — species-specific preferred marker annotations
export function checkSpeciesPreferredMarkers(
  syndromeId: string,
  species: string,
  allEndpoints: EndpointSummary[],
): {
  present: string[];
  absent: string[];
  narrative: string | null;
  certaintyBoost: boolean;
} {
  const speciesKey = species.toLowerCase();
  const config = SPECIES_PREFERRED_MARKERS[speciesKey]?.[syndromeId];
  if (!config) return { present: [], absent: [], narrative: null, certaintyBoost: false };

  const epTestCodes = new Set(allEndpoints.map((ep) => ep.testCode?.toUpperCase()).filter(Boolean));
  const epLabels = new Set(allEndpoints.map((ep) => ep.endpoint_label.toUpperCase()));

  const present: string[] = [];
  const absent: string[] = [];
  for (const marker of config.markers) {
    if (epTestCodes.has(marker.toUpperCase()) || epLabels.has(marker.toUpperCase())) {
      present.push(marker);
    } else {
      absent.push(marker);
    }
  }

  let narrative: string | null = null;
  if (present.length > 0) {
    narrative = `Species-specific markers measured: ${present.join(", ")}. ${config.rationale}`;
  } else if (absent.length > 0) {
    narrative = `Species-specific markers (${absent.join(", ")}) not measured. ${config.rationale} Certainty may improve if these biomarkers are available.`;
  }

  return {
    present,
    absent,
    narrative,
    certaintyBoost: present.length > 0,
  };
}
