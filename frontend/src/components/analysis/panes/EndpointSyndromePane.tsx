/**
 * EndpointSyndromePane — shows syndrome participation for a selected endpoint.
 *
 * Displayed inside FindingsContextPanel between Evidence and Dose detail panes.
 * Only mounted when the endpoint participates in ≥1 detected cross-domain syndrome.
 *
 * Per syndrome:
 *   Line 1: Syndrome name · severity · mechanism certainty
 *   Table:  other endpoints in the syndrome (domain, direction, p-value)
 *   Link:   "View full syndrome →" (switches to SyndromeContextPanel)
 */

import { useMemo } from "react";
import { useFindings } from "@/hooks/useFindings";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useTumorSummary } from "@/hooks/useTumorSummary";
import { useFoodConsumptionSummary } from "@/hooks/useFoodConsumptionSummary";
import { useClinicalObservations } from "@/hooks/useClinicalObservations";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import { useStudyContext } from "@/hooks/useStudyContext";
import { interpretSyndrome, mapDeathRecordsToDispositions } from "@/lib/syndrome-interpretation";
import type {
  SyndromeInterpretation,
  OverallSeverity,
  RecoveryRow,
  TumorFinding,
  SyndromeCertainty,
} from "@/lib/syndrome-interpretation-types";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import type { FindingsFilters } from "@/types/analysis";
import { formatPValue } from "@/lib/severity-colors";

const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

// ─── Display helpers ──────────────────────────────────────

const SEVERITY_LABELS: Record<OverallSeverity, string> = {
  S0_Death: "S0 Death",
  carcinogenic: "Carcinogenic",
  proliferative: "Proliferative",
  S4_Critical: "S4 Critical",
  S3_Adverse: "S3 Adverse",
  S2_Concern: "S2 Concern",
  S1_Monitor: "S1 Monitor",
};

function getSeverityTextClass(severity: OverallSeverity): string {
  switch (severity) {
    case "S0_Death":
    case "S4_Critical":
    case "carcinogenic":
      return "text-red-600 font-semibold";
    case "S3_Adverse":
    case "proliferative":
      return "text-amber-600 font-semibold";
    case "S2_Concern":
      return "text-foreground font-medium";
    case "S1_Monitor":
    default:
      return "text-muted-foreground font-medium";
  }
}

function getMechanismLabel(certainty: SyndromeCertainty): string {
  switch (certainty) {
    case "mechanism_confirmed": return "Confirmed mechanism";
    case "mechanism_uncertain": return "Uncertain mechanism";
    case "insufficient_data": return "Insufficient data";
    default: return "Pattern only";
  }
}

// ─── Component ────────────────────────────────────────────

interface EndpointSyndromePaneProps {
  studyId: string;
  currentEndpointLabel: string;
  /** Syndromes that include the current endpoint (pre-filtered by parent). */
  syndromes: CrossDomainSyndrome[];
  /** All detected syndromes (for interpretSyndrome's stress confound cross-check). */
  allSyndromeIds: string[];
  endpoints: EndpointSummary[];
  signalScores: Map<string, number>;
  normalizationContexts?: NormalizationContext[];
  onViewSyndrome: (syndromeId: string) => void;
}

export function EndpointSyndromePane({
  studyId,
  currentEndpointLabel,
  syndromes,
  allSyndromeIds,
  endpoints,
  signalScores,
  normalizationContexts,
  onViewSyndrome,
}: EndpointSyndromePaneProps) {
  // ── Data hooks (study-level, React Query cached) ──
  const { data: rawData } = useFindings(studyId, 1, 10000, ALL_FILTERS);
  const { data: histopathData } = useLesionSeveritySummary(studyId);
  const { data: studyContext } = useStudyContext(studyId);
  const { data: mortalityRaw } = useStudyMortality(studyId);
  const { data: foodConsumptionSummary } = useFoodConsumptionSummary(studyId);
  const { data: tumorSummary } = useTumorSummary(studyId);
  const { data: clTimecourse } = useClinicalObservations(studyId);
  const { data: recoveryComparison } = useRecoveryComparison(studyId);

  // ── Derived data for interpretSyndrome ──

  const tumorFindings = useMemo<TumorFinding[]>(() => {
    if (!tumorSummary?.has_tumors) return [];
    const findings: TumorFinding[] = [];
    for (const s of tumorSummary.summaries) {
      for (const byDose of s.by_dose) {
        for (let i = 0; i < byDose.affected; i++) {
          findings.push({
            organ: s.organ,
            morphology: s.morphology,
            behavior: s.behavior === "MALIGNANT" ? "MALIGNANT" : "BENIGN",
            animalId: `${s.organ}-${s.morphology}-${byDose.dose_level}-${i}`,
            doseGroup: byDose.dose_level,
          });
        }
      }
    }
    return findings;
  }, [tumorSummary]);

  const clinicalObservations = useMemo(() => {
    if (!clTimecourse?.timecourse?.length) return [];
    const peaks = new Map<string, { observation: string; doseGroup: number; sex: string; incidence: number; totalN: number }>();
    for (const tp of clTimecourse.timecourse) {
      for (const g of tp.counts) {
        for (const [finding, count] of Object.entries(g.findings)) {
          const k = `${finding}|${g.dose_level}|${g.sex}`;
          const existing = peaks.get(k);
          if (!existing || count > existing.incidence) {
            peaks.set(k, { observation: finding, doseGroup: g.dose_level, sex: g.sex, incidence: count, totalN: g.total_subjects });
          }
        }
      }
    }
    return [...peaks.values()];
  }, [clTimecourse]);

  const recoveryData = useMemo<RecoveryRow[]>(() => {
    if (!recoveryComparison?.available) return [];
    return recoveryComparison.rows.map((r) => ({
      endpoint_label: r.endpoint_label,
      sex: r.sex,
      recovery_day: r.recovery_day,
      dose_level: r.dose_level,
      mean: r.mean,
      sd: r.sd,
      p_value: r.p_value,
      effect_size: r.effect_size,
      terminal_effect: r.terminal_effect,
    }));
  }, [recoveryComparison]);

  const organWeightRows = useMemo(() => {
    if (!rawData?.findings?.length) return [];
    return rawData.findings
      .filter((f) => f.domain === "OM")
      .flatMap((f) =>
        f.group_stats
          .filter((g) => g.mean != null)
          .map((g) => ({
            specimen: f.specimen ?? f.finding,
            dose_level: g.dose_level,
            sex: f.sex,
            mean: g.mean!,
            p_value: f.pairwise?.find((p) => p.dose_level === g.dose_level)?.p_value ?? null,
          })),
      );
  }, [rawData]);

  // ── Compute interpretations ──

  const interpretations = useMemo(() => {
    if (!studyContext || syndromes.length === 0) return new Map<string, SyndromeInterpretation>();
    const mortalityDispositions = mortalityRaw
      ? mapDeathRecordsToDispositions(mortalityRaw)
      : [];
    const result = new Map<string, SyndromeInterpretation>();
    for (const syn of syndromes) {
      const interp = interpretSyndrome(
        syn,
        endpoints,
        histopathData ?? [],
        recoveryData,
        organWeightRows,
        tumorFindings,
        mortalityDispositions,
        foodConsumptionSummary ?? { available: false, water_consumption: null },
        clinicalObservations,
        studyContext,
        mortalityRaw?.mortality_noael_cap,
        allSyndromeIds,
        normalizationContexts,
      );
      result.set(syn.id, interp);
    }
    return result;
  }, [syndromes, endpoints, histopathData, studyContext, mortalityRaw, tumorFindings, foodConsumptionSummary, clinicalObservations, recoveryData, organWeightRows, allSyndromeIds, normalizationContexts]);

  // ── p-value lookup ──

  const pValueMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const ep of endpoints) {
      map.set(ep.endpoint_label, ep.minPValue);
    }
    return map;
  }, [endpoints]);

  // ── Render ──

  return (
    <div className="space-y-3 text-[11px]">
      {syndromes.map((syn) => {
        const interp = interpretations.get(syn.id);
        const otherEndpoints = syn.matchedEndpoints
          .filter((m) => m.endpoint_label !== currentEndpointLabel)
          .slice()
          .sort((a, b) => {
            // Required first
            const roleOrd = (a.role === "required" ? 0 : 1) - (b.role === "required" ? 0 : 1);
            if (roleOrd !== 0) return roleOrd;
            // Then by signal score descending
            return (signalScores.get(b.endpoint_label) ?? 0) - (signalScores.get(a.endpoint_label) ?? 0);
          });
        const currentMatch = syn.matchedEndpoints.find(
          (m) => m.endpoint_label === currentEndpointLabel
        );

        return (
          <div key={syn.id}>
            {/* Line 1: name + severity + mechanism certainty */}
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-semibold text-foreground">{syn.name}</span>
              {interp ? (
                <>
                  <span className={`text-[10px] ${getSeverityTextClass(interp.overallSeverity)}`}>
                    {SEVERITY_LABELS[interp.overallSeverity]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    · {getMechanismLabel(interp.mechanismCertainty)}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {syn.confidence}
                </span>
              )}
            </div>

            {/* Role of current endpoint */}
            {currentMatch && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                This endpoint: {currentMatch.role}
                {syn.sexes.length > 0 && (
                  <> · {syn.sexes.length === 1 ? `${syn.sexes[0]} only` : "both sexes"}</>
                )}
              </div>
            )}

            {/* Other endpoints table */}
            {otherEndpoints.length > 0 && (
              <table className="mt-1.5 w-full">
                <thead>
                  <tr className="text-[10px] text-muted-foreground">
                    <th className="py-0.5 text-left font-medium" style={{ width: "1px", whiteSpace: "nowrap" }}>Domain</th>
                    <th className="py-0.5 text-left font-medium">Endpoint</th>
                    <th className="py-0.5 text-center font-medium" style={{ width: "1px", whiteSpace: "nowrap" }}>Dir</th>
                    <th className="py-0.5 text-right font-medium" style={{ width: "1px", whiteSpace: "nowrap" }}>p</th>
                  </tr>
                </thead>
                <tbody>
                  {otherEndpoints.map((m, i) => (
                    <tr key={`${m.endpoint_label}-${m.domain}-${i}`} className="border-t border-border/20">
                      <td className="py-0.5 pr-2 text-[10px] font-semibold text-muted-foreground" style={{ width: "1px", whiteSpace: "nowrap" }}>
                        {m.domain}
                      </td>
                      <td className="py-0.5">
                        <span className="truncate">{m.endpoint_label}</span>
                        <span
                          className="ml-1 text-[8px] text-muted-foreground"
                          title={m.role === "required" ? "Required for syndrome detection" : "Supporting evidence"}
                        >
                          {m.role === "required" ? "R" : "S"}
                        </span>
                      </td>
                      <td className="py-0.5 text-center" style={{ width: "1px", whiteSpace: "nowrap" }}>
                        {m.direction === "up" ? "\u2191" : m.direction === "down" ? "\u2193" : "\u2014"}
                      </td>
                      <td className="py-0.5 text-right font-mono" style={{ width: "1px", whiteSpace: "nowrap" }}>
                        {formatPValue(pValueMap.get(m.endpoint_label) ?? null)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* View full syndrome link */}
            <button
              className="mt-1 text-[10px] text-primary hover:underline"
              onClick={() => onViewSyndrome(syn.id)}
            >
              View full syndrome &rarr;
            </button>
          </div>
        );
      })}
    </div>
  );
}
