/**
 * Cross-Domain Syndrome Detection Engine (Layer B).
 * Matches endpoint labels against 9 predefined cross-domain patterns (XS01–XS09).
 * Pure functions — no UI integration. Syndromes surface in Phase 3.
 */

import type { EndpointSummary } from "@/lib/derive-summaries";

// ─── Types ─────────────────────────────────────────────────

interface SyndromeParameter {
  terms: string[];           // case-insensitive substring matches against endpoint_label
  direction: "up" | "down";  // must match EndpointSummary.direction
  domain?: string;           // optional domain filter (e.g., "LB", "MI", "OM")
}

interface SyndromeDefinition {
  id: string;
  name: string;
  requiredParams: SyndromeParameter[];
  supportingParams: SyndromeParameter[];
  minDomains: number;
}

export interface EndpointMatch {
  endpoint_label: string;
  domain: string;
  role: "required" | "supporting";
  direction: string;
  severity: string;
}

export interface CrossDomainSyndrome {
  id: string;
  name: string;
  matchedEndpoints: EndpointMatch[];
  requiredMet: boolean;
  domainsCovered: string[];
  confidence: "HIGH" | "MODERATE" | "LOW";
  supportScore: number;
}

// ─── Syndrome definitions (XS01–XS09) ──────────────────────

const CROSS_DOMAIN_SYNDROMES: SyndromeDefinition[] = [
  {
    id: "XS01",
    name: "Hepatocellular injury",
    requiredParams: [
      { terms: ["alt", "alanine aminotransferase"], direction: "up", domain: "LB" },
      { terms: ["ast", "aspartate aminotransferase"], direction: "up", domain: "LB" },
    ],
    supportingParams: [
      { terms: ["sdh", "sorbitol dehydrogenase"], direction: "up", domain: "LB" },
      { terms: ["gdh", "gldh", "glutamate dehydrogenase"], direction: "up", domain: "LB" },
      { terms: ["bilirubin"], direction: "up", domain: "LB" },
      { terms: ["liver weight", "liver wt"], direction: "up", domain: "OM" },
      { terms: ["hepatocellular necrosis", "hepatocellular apoptosis", "necrosis, hepatocellular"], direction: "up" },
    ],
    minDomains: 2,
  },
  {
    id: "XS02",
    name: "Hepatobiliary / Cholestatic",
    requiredParams: [
      { terms: ["alp", "alkaline phosphatase"], direction: "up", domain: "LB" },
      { terms: ["ggt", "gamma-glutamyl", "5'nt", "5'-nucleotidase"], direction: "up", domain: "LB" },
    ],
    supportingParams: [
      { terms: ["bilirubin"], direction: "up", domain: "LB" },
      { terms: ["bile duct", "cholangitis"], direction: "up", domain: "MI" },
      { terms: ["bile plug"], direction: "up", domain: "MI" },
      { terms: ["cholesterol"], direction: "up", domain: "LB" },
      { terms: ["liver weight", "liver wt"], direction: "up", domain: "OM" },
    ],
    minDomains: 2,
  },
  {
    id: "XS03",
    name: "Nephrotoxicity",
    requiredParams: [
      { terms: ["bun", "blood urea nitrogen", "urea nitrogen"], direction: "up", domain: "LB" },
      { terms: ["creatinine", "crea"], direction: "up", domain: "LB" },
    ],
    supportingParams: [
      { terms: ["kidney weight", "kidney wt"], direction: "up", domain: "OM" },
      { terms: ["urine concentrating", "urine volume"], direction: "up", domain: "LB" },
      { terms: ["cast", "urinary cast"], direction: "up", domain: "LB" },
      { terms: ["tubular degeneration", "tubular necrosis"], direction: "up", domain: "MI" },
      { terms: ["specific gravity"], direction: "down", domain: "LB" },
    ],
    minDomains: 2,
  },
  {
    id: "XS04",
    name: "Myelosuppression",
    requiredParams: [
      { terms: ["neutrophil"], direction: "down", domain: "LB" },
      { terms: ["platelet"], direction: "down", domain: "LB" },
      { terms: ["rbc", "red blood cell", "erythrocyte"], direction: "down", domain: "LB" },
      { terms: ["hgb", "hemoglobin"], direction: "down", domain: "LB" },
    ],
    supportingParams: [
      { terms: ["bone marrow", "marrow hypocellularity", "marrow cellularity"], direction: "up", domain: "MI" },
      { terms: ["reticulocyte"], direction: "down", domain: "LB" },
      { terms: ["spleen"], direction: "up", domain: "MI" },
    ],
    minDomains: 1,
  },
  {
    id: "XS05",
    name: "Hemolytic anemia",
    requiredParams: [
      { terms: ["rbc", "red blood cell", "erythrocyte"], direction: "down", domain: "LB" },
      { terms: ["reticulocyte"], direction: "up", domain: "LB" },
    ],
    supportingParams: [
      { terms: ["bilirubin"], direction: "up", domain: "LB" },
      { terms: ["spleen weight", "spleen wt"], direction: "up", domain: "OM" },
      { terms: ["extramedullary hematopoiesis"], direction: "up", domain: "MI" },
      { terms: ["haptoglobin"], direction: "down", domain: "LB" },
    ],
    minDomains: 1,
  },
  {
    id: "XS06",
    name: "Phospholipidosis",
    requiredParams: [
      { terms: ["phospholipid"], direction: "up", domain: "LB" },
    ],
    supportingParams: [
      { terms: ["foamy macrophage"], direction: "up", domain: "MI" },
      { terms: ["organ weight"], direction: "up", domain: "OM" },
      { terms: ["lamellar bod"], direction: "up", domain: "MI" },
    ],
    minDomains: 2,
  },
  {
    id: "XS07",
    name: "Immunotoxicity",
    requiredParams: [
      { terms: ["wbc", "white blood cell", "leukocyte"], direction: "down", domain: "LB" },
      { terms: ["lymphocyte"], direction: "down", domain: "LB" },
    ],
    supportingParams: [
      { terms: ["spleen weight", "spleen wt"], direction: "down", domain: "OM" },
      { terms: ["thymus weight", "thymus wt"], direction: "down", domain: "OM" },
      { terms: ["lymphoid depletion"], direction: "up", domain: "MI" },
    ],
    minDomains: 2,
  },
  {
    id: "XS08",
    name: "Stress response",
    requiredParams: [
      { terms: ["adrenal weight", "adrenal wt"], direction: "up", domain: "OM" },
    ],
    supportingParams: [
      { terms: ["corticosterone"], direction: "up", domain: "LB" },
      { terms: ["thymus weight", "thymus wt"], direction: "down", domain: "OM" },
      { terms: ["lymphocyte"], direction: "down", domain: "LB" },
      { terms: ["body weight", "body wt"], direction: "down", domain: "BW" },
    ],
    minDomains: 2,
  },
  {
    id: "XS09",
    name: "Target organ wasting",
    requiredParams: [
      { terms: ["body weight", "body wt"], direction: "down", domain: "BW" },
    ],
    supportingParams: [
      { terms: ["food consumption"], direction: "down", domain: "BW" },
      { terms: ["organ weight"], direction: "down", domain: "OM" },
      { terms: ["muscle atrophy", "skeletal muscle"], direction: "up", domain: "MI" },
    ],
    minDomains: 2,
  },
];

// ─── Matching logic ─────────────────────────────────────────

function matchesParam(ep: EndpointSummary, param: SyndromeParameter): boolean {
  // Direction must match
  if (ep.direction !== param.direction) return false;
  // Domain filter (if specified)
  if (param.domain && ep.domain.toUpperCase() !== param.domain) return false;
  // Case-insensitive substring match on endpoint_label
  const label = ep.endpoint_label.toLowerCase();
  return param.terms.some((term) => label.includes(term.toLowerCase()));
}

function assignConfidence(
  requiredMet: boolean,
  supportCount: number,
  domainCount: number,
): "HIGH" | "MODERATE" | "LOW" {
  if (requiredMet && supportCount >= 3 && domainCount >= 3) return "HIGH";
  if (requiredMet && supportCount >= 1 && domainCount >= 2) return "MODERATE";
  return "LOW";
}

export function detectCrossDomainSyndromes(
  endpoints: EndpointSummary[],
): CrossDomainSyndrome[] {
  const results: CrossDomainSyndrome[] = [];

  for (const syndrome of CROSS_DOMAIN_SYNDROMES) {
    const matchedEndpoints: EndpointMatch[] = [];
    let requiredMet = false;
    let supportCount = 0;

    // Match required params — only adverse/warning endpoints
    const adverseWarning = endpoints.filter(
      (ep) => ep.worstSeverity === "adverse" || ep.worstSeverity === "warning"
    );
    for (const param of syndrome.requiredParams) {
      for (const ep of adverseWarning) {
        if (matchesParam(ep, param)) {
          requiredMet = true;
          matchedEndpoints.push({
            endpoint_label: ep.endpoint_label,
            domain: ep.domain,
            role: "required",
            direction: ep.direction ?? "none",
            severity: ep.worstSeverity,
          });
          break; // one match per param is enough
        }
      }
    }

    // Match supporting params — any severity
    for (const param of syndrome.supportingParams) {
      for (const ep of endpoints) {
        if (matchesParam(ep, param)) {
          // Avoid duplicating an endpoint already matched as required
          const alreadyMatched = matchedEndpoints.some(
            (m) => m.endpoint_label === ep.endpoint_label && m.role === "required"
          );
          if (!alreadyMatched) {
            supportCount++;
            matchedEndpoints.push({
              endpoint_label: ep.endpoint_label,
              domain: ep.domain,
              role: "supporting",
              direction: ep.direction ?? "none",
              severity: ep.worstSeverity,
            });
          }
          break; // one match per param
        }
      }
    }

    // Check if syndrome fires
    const domainsCovered = [...new Set(matchedEndpoints.map((m) => m.domain))].sort();
    const meetsMinDomains = domainsCovered.length >= syndrome.minDomains;

    if ((requiredMet && meetsMinDomains) || (!requiredMet && supportCount >= 3)) {
      results.push({
        id: syndrome.id,
        name: syndrome.name,
        matchedEndpoints,
        requiredMet,
        domainsCovered,
        confidence: assignConfidence(requiredMet, supportCount, domainsCovered.length),
        supportScore: supportCount,
      });
    }
  }

  return results;
}
