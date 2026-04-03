/**
 * Single source of truth for findings analytics derivation.
 *
 * All findings consumers (FindingsView, FindingsRail, FindingsContextPanel,
 * OrganContextPanel, SyndromeContextPanel) use this hook instead of
 * duplicating the derivation pipeline. React Query's 30-min stale cache
 * ensures the underlying useFindings() call returns the same cached
 * response — no extra API calls.
 *
 * Phase 3A: Heavy computation (endpoint summaries, syndromes, signal scores)
 * runs in a Web Worker to avoid blocking the main thread. Falls back to
 * synchronous computation if the worker fails to load.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { useFindings } from "@/hooks/useFindings";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import type { FindingsAnalyticsResult, FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import type { FindingsFilters } from "@/types/analysis";
import type { AnalyticsWorkerInput, AnalyticsWorkerOutput } from "@/workers/findingsAnalytics.worker";

// Sync fallback imports — only used if worker fails
import { mapFindingsToRows, deriveEndpointSummaries, deriveOrganCoherence, computeEndpointNoaelMap, computeRiskDifference, computeCohensH, benjaminiHochberg } from "@/lib/derive-summaries";
import { attachEndpointConfidence } from "@/lib/endpoint-confidence";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import { evaluateLabRules, getClinicalFloor, getClinicalMultiplier, EFFECT_SIZE_CONFIDENCE_LEVEL } from "@/lib/lab-clinical-catalog";
import { computeGLower, computeGUpper } from "@/lib/g-lower";
import { getSexConcordanceBoost } from "@/lib/organ-sex-concordance";
import { withSignalScores, computeEndpointEvidence, classifyEndpointConfidence, getConfidenceMultiplier } from "@/lib/findings-rail-engine";
import { hasWelchPValues as checkWelchPValues } from "@/lib/stat-method-transforms";

const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

const EMPTY_ANALYTICS: FindingsAnalytics = {
  endpoints: [],
  syndromes: [],
  organCoherence: new Map(),
  labMatches: [],
  signalScores: new Map(),
  evidenceScores: new Map(),
  endpointSexes: new Map(),
};

export function useFindingsAnalyticsLocal(studyId: string | undefined): FindingsAnalyticsResult {
  const { data, isLoading, isFetching, isPlaceholderData, error } = useFindings(studyId, 1, 10000, ALL_FILTERS);
  const { settings } = useStudySettings();
  const statMethods = { effectSize: settings.effectSize, multiplicity: settings.multiplicity };
  const { data: studyMeta } = useStudyMetadata(studyId ?? "");
  const normalization = useOrganWeightNormalization(studyId, true, statMethods.effectSize);

  const activeFindings = useMemo(() => data?.findings ?? [], [data?.findings]);
  const normContexts = normalization.state?.contexts;

  // ── Worker lifecycle ──
  // Check support once during state init (avoids setState in effect body).
  // Runtime errors (script load failure) handled via onerror callback.
  const workerRef = useRef<Worker | null>(null);
  const [workerSupported] = useState(() => typeof Worker !== "undefined");
  const [workerFailed, setWorkerFailed] = useState(false);
  const [workerResult, setWorkerResult] = useState<AnalyticsWorkerOutput | null>(null);
  const useWorker = workerSupported && !workerFailed;

  useEffect(() => {
    if (!workerSupported) return;
    const worker = new Worker(
      new URL("../workers/findingsAnalytics.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<AnalyticsWorkerOutput>) => {
      setWorkerResult(e.data);
    };
    worker.onerror = () => {
      setWorkerFailed(true);
      worker.terminate();
      workerRef.current = null;
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [workerSupported]);

  // Post data to worker when inputs change
  useEffect(() => {
    if (!workerRef.current || !activeFindings.length) return;
    const input: AnalyticsWorkerInput = {
      findings: activeFindings,
      doseGroups: data?.dose_groups,
      hasEstrousData: studyMeta?.has_estrous_data ?? false,
      normContexts,
    };
    workerRef.current.postMessage(input);
  }, [activeFindings, data?.dose_groups, studyMeta?.has_estrous_data, normContexts]);

  // ── Sync fallback (used when worker not available) ──
  const syncAnalytics = useMemo(() => {
    if (useWorker) return null; // worker handles it
    if (!activeFindings.length) return EMPTY_ANALYTICS;
    return computeAnalyticsSync(activeFindings, data?.dose_groups, studyMeta?.has_estrous_data ?? false, normContexts);
  }, [useWorker, activeFindings, data?.dose_groups, studyMeta?.has_estrous_data, normContexts]);

  // ── Merge worker result into analytics shape ──
  const analytics = useMemo((): FindingsAnalytics => {
    // Prefer worker result when available
    if (workerResult && useWorker) {
      return {
        endpoints: workerResult.endpoints,
        syndromes: workerResult.syndromes,
        organCoherence: workerResult.organCoherence,
        labMatches: workerResult.labMatches,
        signalScores: workerResult.signalScores,
        evidenceScores: workerResult.evidenceScores,
        endpointSexes: workerResult.endpointSexes,
        activeEffectSizeMethod: statMethods.effectSize,
        activeMultiplicityMethod: statMethods.multiplicity,
        hasWelchPValues: workerResult.hasWelchPValues,
        normalizationContexts: normContexts,
      };
    }
    // Sync fallback
    if (syncAnalytics) {
      return {
        ...syncAnalytics,
        activeEffectSizeMethod: statMethods.effectSize,
        activeMultiplicityMethod: statMethods.multiplicity,
        normalizationContexts: normContexts,
      };
    }
    // Worker is computing — return previous result or empty
    return {
      ...EMPTY_ANALYTICS,
      activeEffectSizeMethod: statMethods.effectSize,
      activeMultiplicityMethod: statMethods.multiplicity,
      normalizationContexts: normContexts,
    };
  }, [workerResult, useWorker, syncAnalytics, statMethods.effectSize, statMethods.multiplicity, normContexts]);

  return { analytics, data, activeFindings, isLoading, isFetching, isPlaceholderData, error: error as Error | null };
}


// ── Sync computation (identical logic to worker, used as fallback) ──

function computeAnalyticsSync(
  findings: import("@/types/analysis").UnifiedFinding[],
  doseGroups: import("@/types/analysis").DoseGroup[] | undefined,
  hasEstrousData: boolean,
  normContexts: import("@/lib/organ-weight-normalization").NormalizationContext[] | undefined,
): FindingsAnalytics {
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
  attachEndpointConfidence(endpoints, findings, hasEstrousData);
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
  // R1: Attach g_lower and g_upper to each continuous endpoint
  // (must run BEFORE syndrome detection so isEndpointSignificant can use gLower)
  for (const ep of endpoints) {
    if (ep.controlStats && ep.worstTreatedStats && ep.maxEffectSize !== null) {
      const n1 = ep.controlStats.n;
      const n2 = ep.worstTreatedStats.n;
      // Aggregate g_lower as baseline
      let gl = computeGLower(ep.maxEffectSize, n1, n2, EFFECT_SIZE_CONFIDENCE_LEVEL);
      // Per-sex: use each sex's effect size with aggregate n (SexEndpointSummary
      // doesn't carry per-sex n, but n1/n2 are conservative approximations since
      // per-sex groups are same size or smaller). Take worst-case across sexes.
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

  const organCoherence = deriveOrganCoherence(endpoints);
  const syndromes = detectCrossDomainSyndromes(endpoints, normContexts);
  const labMatches = evaluateLabRules(endpoints, organCoherence, syndromes);

  // Phase 0A/0B: Attach risk difference, Cohen's h to incidence endpoints
  // Build finding lookup for group_stats access
  const findingByLabel = new Map<string, import("@/types/analysis").UnifiedFinding>();
  for (const f of findings) {
    const label = f.endpoint_label ?? f.finding;
    if (label && !findingByLabel.has(label)) findingByLabel.set(label, f);
  }
  for (const ep of endpoints) {
    const f = findingByLabel.get(ep.endpoint_label);
    if (!f) continue;
    // Use scheduled_group_stats if available (early-death excluded), else group_stats
    const gs = f.scheduled_group_stats ?? f.group_stats;
    if (!gs || gs.length === 0) continue;
    const ctrl = gs.find(g => g.dose_level === 0 && g.affected != null && g.n > 0);
    if (!ctrl || ctrl.affected == null) continue;
    // Find the worst treated group (highest incidence)
    const treated = gs.filter(g => g.dose_level > 0 && g.affected != null && g.n > 0);
    if (treated.length === 0) continue;
    const worst = treated.reduce((best, g) =>
      (g.affected ?? 0) / g.n > (best.affected ?? 0) / best.n ? g : best
    );
    if (worst.affected == null) continue;
    // Risk difference (Phase 0A)
    const rdResult = computeRiskDifference(worst.affected, worst.n, ctrl.affected, ctrl.n);
    if (rdResult) {
      ep.riskDifference = rdResult.rd;
      ep.rdCiLower = rdResult.rdLower;
      ep.rdCiUpper = rdResult.rdUpper;
    }
    // Cohen's h (Phase 0B)
    const hResult = computeCohensH(worst.affected, worst.n, ctrl.affected, ctrl.n);
    if (hResult) {
      ep.cohensH = hResult.h;
      ep.hCiLower = hResult.hLower;
      ep.hCiUpper = hResult.hUpper;
    }
  }

  // Phase 0: BH-FDR q-values across all endpoints
  {
    const pValues = endpoints.map(ep => ep.minPValue ?? null);
    const qValues = benjaminiHochberg(pValues);
    for (let i = 0; i < endpoints.length; i++) {
      endpoints[i].qValue = qValues[i];
    }
  }

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
  const evidenceScores = new Map<string, number>();
  for (const ep of scored) {
    signalScores.set(ep.endpoint_label, ep.signal);
    evidenceScores.set(ep.endpoint_label, computeEndpointEvidence(ep, boostMap.get(ep.endpoint_label)));
  }

  const endpointSexes = new Map<string, string[]>();
  for (const ep of endpoints) endpointSexes.set(ep.endpoint_label, ep.sexes);

  return {
    endpoints,
    syndromes,
    organCoherence,
    labMatches,
    signalScores,
    evidenceScores,
    endpointSexes,
    hasWelchPValues: checkWelchPValues(findings),
  };
}
