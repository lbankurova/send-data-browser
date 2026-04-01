/**
 * Web Worker for findings analytics derivation.
 *
 * Offloads the computation-heavy pipeline (endpoint summaries, syndromes,
 * signal scoring) from the main thread. Receives raw findings + context,
 * returns computed analytics. All types are structured-cloneable (plain
 * data + Maps, no functions/DOM).
 */

import { mapFindingsToRows, deriveEndpointSummaries, deriveOrganCoherence, computeEndpointNoaelMap, computeRiskDifference, computeCohensH, benjaminiHochberg } from "@/lib/derive-summaries";
import type { EndpointSummary, OrganCoherence } from "@/lib/derive-summaries";
import { attachEndpointConfidence } from "@/lib/endpoint-confidence";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndrome-types";
import { evaluateLabRules, getClinicalFloor, getClinicalMultiplier, EFFECT_SIZE_CONFIDENCE_LEVEL } from "@/lib/lab-clinical-catalog";
import { computeGLower, computeGUpper } from "@/lib/g-lower";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { getSexConcordanceBoost } from "@/lib/organ-sex-concordance";
import { withSignalScores, classifyEndpointConfidence, getConfidenceMultiplier } from "@/lib/findings-rail-engine";
import { hasWelchPValues as checkWelchPValues } from "@/lib/stat-method-transforms";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

export interface AnalyticsWorkerInput {
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[] | undefined;
  hasEstrousData: boolean;
  normContexts: NormalizationContext[] | undefined;
}

export interface AnalyticsWorkerOutput {
  endpoints: EndpointSummary[];
  syndromes: CrossDomainSyndrome[];
  organCoherence: Map<string, OrganCoherence>;
  labMatches: LabClinicalMatch[];
  signalScores: Map<string, number>;
  endpointSexes: Map<string, string[]>;
  hasWelchPValues: boolean;
}

function computeAnalytics(input: AnalyticsWorkerInput): AnalyticsWorkerOutput {
  const { findings, doseGroups, hasEstrousData, normContexts } = input;

  if (!findings.length) {
    return {
      endpoints: [],
      syndromes: [],
      organCoherence: new Map(),
      labMatches: [],
      signalScores: new Map(),
      endpointSexes: new Map(),
      hasWelchPValues: false,
    };
  }

  // 1. Endpoint summaries
  const rows = mapFindingsToRows(findings);
  const endpoints = deriveEndpointSummaries(rows);
  if (doseGroups) {
    const noaelMap = computeEndpointNoaelMap(findings, doseGroups);
    for (const ep of endpoints) {
      const noael = noaelMap.get(ep.endpoint_label);
      if (noael) {
        ep.noaelTier = noael.combined.tier;
        ep.noaelDoseValue = noael.combined.doseValue;
        ep.noaelDoseUnit = noael.combined.doseUnit;
        if (noael.bySex.size >= 2) ep.noaelBySex = noael.bySex;
      }
    }
  }

  // 2. ECI (endpoint confidence integrity)
  attachEndpointConfidence(endpoints, findings, hasEstrousData);

  // 3. Pharmacological candidate propagation
  for (const ep of endpoints) {
    for (const f of findings) {
      if ((f.endpoint_label ?? f.finding) === ep.endpoint_label && f._confidence?._pharmacological_candidate) {
        ep.isPharmacologicalCandidate = true;
        const d9 = f._confidence.dimensions?.find((d: { dimension: string }) => d.dimension === "D9");
        if (d9?.rationale) ep.pharmacologicalRationale = d9.rationale;
        break;
      }
    }
  }

  // 4. Cross-domain analysis
  const organCoherence = deriveOrganCoherence(endpoints);
  const syndromes = detectCrossDomainSyndromes(endpoints, normContexts);
  const labMatches = evaluateLabRules(endpoints, organCoherence, syndromes);

  // 5. R1: Attach g_lower and g_upper to each continuous endpoint
  for (const ep of endpoints) {
    if (ep.controlStats && ep.worstTreatedStats && ep.maxEffectSize !== null) {
      const n1 = ep.controlStats.n;
      const n2 = ep.worstTreatedStats.n;
      let gl = computeGLower(ep.maxEffectSize, n1, n2, EFFECT_SIZE_CONFIDENCE_LEVEL);
      if (ep.bySex && ep.bySex.size >= 2) {
        for (const sexData of ep.bySex.values()) {
          if (sexData.maxEffectSize != null) {
            const sexGL = computeGLower(sexData.maxEffectSize, n1, n2, EFFECT_SIZE_CONFIDENCE_LEVEL);
            if (sexGL > gl) gl = sexGL;
          }
        }
      }
      ep.gLower = gl;
      // Phase 0C: gUpper via separate non-central t bisection (NOT symmetric formula)
      ep.gUpper = computeGUpper(ep.maxEffectSize, n1, n2, EFFECT_SIZE_CONFIDENCE_LEVEL);
    }
  }

  // 5b. Phase 0A/0B: Attach risk difference, Cohen's h to incidence endpoints
  const findingByLabel = new Map<string, UnifiedFinding>();
  for (const f of findings) {
    const label = f.endpoint_label ?? f.finding;
    if (label && !findingByLabel.has(label)) findingByLabel.set(label, f);
  }
  for (const ep of endpoints) {
    const f = findingByLabel.get(ep.endpoint_label);
    if (!f) continue;
    const gs = f.scheduled_group_stats ?? f.group_stats;
    if (!gs || gs.length === 0) continue;
    const ctrl = gs.find(g => g.dose_level === 0 && g.affected != null && g.n > 0);
    if (!ctrl || ctrl.affected == null) continue;
    const treated = gs.filter(g => g.dose_level > 0 && g.affected != null && g.n > 0);
    if (treated.length === 0) continue;
    const worst = treated.reduce((best, g) =>
      (g.affected ?? 0) / g.n > (best.affected ?? 0) / best.n ? g : best
    );
    if (worst.affected == null) continue;
    const rdResult = computeRiskDifference(worst.affected, worst.n, ctrl.affected, ctrl.n);
    if (rdResult) {
      ep.riskDifference = rdResult.rd;
      ep.rdCiLower = rdResult.rdLower;
      ep.rdCiUpper = rdResult.rdUpper;
    }
    const hResult = computeCohensH(worst.affected, worst.n, ctrl.affected, ctrl.n);
    if (hResult) {
      ep.cohensH = hResult.h;
      ep.hCiLower = hResult.hLower;
      ep.hCiUpper = hResult.hUpper;
    }
  }

  // 5c. BH-FDR q-values across all endpoints
  {
    const pValues = endpoints.map(ep => ep.minPValue ?? null);
    const qValues = benjaminiHochberg(pValues);
    for (let i = 0; i < endpoints.length; i++) {
      endpoints[i].qValue = qValues[i];
    }
  }

  // 6. Signal scoring
  const boostMap = new Map<string, { syndromeBoost: number; coherenceBoost: number; clinicalFloor: number; clinicalMultiplier: number; sexConcordanceBoost: number; confidenceMultiplier: number }>();
  for (const ep of endpoints) {
    let synBoost = 0;
    for (const syn of syndromes) {
      if (syn.matchedEndpoints.some((m) => m.endpoint_label === ep.endpoint_label)) {
        synBoost = syn.confidence === "HIGH" ? 6 : syn.confidence === "MODERATE" ? 3 : 1;
        break;
      }
    }
    const coh = organCoherence.get(ep.organ_system);
    const cohBoost = coh ? Math.min(coh.domainCount - 1, 3) * 2 : 0;
    let floor = 0;
    let clinMult = 1.0;
    for (const match of labMatches) {
      if (match.matchedEndpoints.includes(ep.endpoint_label)) {
        floor = Math.max(floor, getClinicalFloor(match.severity));
        clinMult = Math.max(clinMult, getClinicalMultiplier(match.severity));
      }
    }
    const sexConc = getSexConcordanceBoost(ep);
    const conf = classifyEndpointConfidence(ep);
    const confMult = getConfidenceMultiplier(conf);
    if (cohBoost > 0 || synBoost > 0 || floor > 0 || clinMult > 1 || sexConc !== 0 || confMult !== 1) {
      boostMap.set(ep.endpoint_label, { syndromeBoost: synBoost, coherenceBoost: cohBoost, clinicalFloor: floor, clinicalMultiplier: clinMult, sexConcordanceBoost: sexConc, confidenceMultiplier: confMult });
    }
  }
  const scored = withSignalScores(endpoints, boostMap);
  const signalScores = new Map<string, number>();
  for (const ep of scored) signalScores.set(ep.endpoint_label, ep.signal);

  // 7. Endpoint sexes
  const endpointSexes = new Map<string, string[]>();
  for (const ep of endpoints) endpointSexes.set(ep.endpoint_label, ep.sexes);

  return {
    endpoints,
    syndromes,
    organCoherence,
    labMatches,
    signalScores,
    endpointSexes,
    hasWelchPValues: checkWelchPValues(findings),
  };
}

// Worker message handler
self.onmessage = (e: MessageEvent<AnalyticsWorkerInput>) => {
  const result = computeAnalytics(e.data);
  self.postMessage(result);
};
