/**
 * StudySummaryRecord Builder — assembles Pipeline 1 outputs into the
 * cross-study contract type.
 *
 * Bridges single-study analysis (18+ JSON files) → StudySummaryRecord
 * so Pipeline 2 (cross-study engine) can consume real data.
 */

import type {
  StudySummaryRecord,
  SyndromeSummary,
} from "@/types/pipeline-contracts";
import { mapPipelineStageToStudyStage } from "@/types/pipeline-contracts";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { SyndromeInterpretation } from "@/lib/syndrome-interpretation";
import type { TargetOrganRow } from "@/types/analysis-views";

// ─── Input types (from existing API responses) ──────────────

interface StudyMetadataInput {
  study_id: string;
  project?: string | null;
  species?: string | null;
  strain?: string | null;
  route?: string | null;
  study_type?: string | null;
  duration_weeks?: number | null;
  recovery_weeks?: number | null;
  glp?: string | null;
  sex_population?: string | null;
  pipeline_stage?: string | null;
}

interface DoseGroup {
  dose_level: number;
  dose_label: string;
  dose_value?: number | null;
  dose_unit?: string | null;
}

interface NoaelSummaryRow {
  sex: string;
  noael_dose_level: number | null;
  noael_dose_value?: number | null;
  noael_label?: string;
  loael_dose_level?: number | null;
  noael_confidence?: number;
  noael_derivation?: string;
}

interface PkIntegrationInput {
  available: boolean;
  noael_exposure?: {
    auc?: { mean: number };
    cmax?: { mean: number };
  } | null;
  loael_exposure?: {
    auc?: { mean: number };
    cmax?: { mean: number };
  } | null;
  lloq_unit?: string;
}

// ─── Builder ────────────────────────────────────────────────

/**
 * Build a StudySummaryRecord from single-study pipeline outputs.
 *
 * All inputs come from existing API responses / generated JSON.
 * This function does no computation — it maps and assembles.
 */
export function buildStudySummaryRecord(params: {
  metadata: StudyMetadataInput;
  doseGroups: DoseGroup[];
  noaelBySex: NoaelSummaryRow[];
  targetOrgans: TargetOrganRow[];
  syndromes: CrossDomainSyndrome[];
  interpretations: SyndromeInterpretation[];
  recoveryOutcomes: Record<string, string>;
  pkIntegration?: PkIntegrationInput | null;
  dataQualityFlags?: string[];
}): StudySummaryRecord {
  const { metadata, doseGroups, noaelBySex, targetOrgans, syndromes, interpretations, recoveryOutcomes, pkIntegration, dataQualityFlags } = params;

  // Map syndromes + interpretations → SyndromeSummary[]
  const detectedSyndromes: SyndromeSummary[] = syndromes.map((syn) => {
    const interp = interpretations.find((i) => i.syndromeId === syn.id);
    return {
      syndrome_id: syn.id,
      name: syn.name,
      certainty: interp?.certainty ?? "insufficient_data",
      severity: interp?.overallSeverity ?? "S1_Monitor",
      treatment_relatedness: interp?.treatmentRelatedness?.overall ?? "not_related",
      adversity: interp?.adversity?.overall ?? "equivocal",
      target_organ: syn.domainsCovered[0] ?? "UNKNOWN",
      domains_covered: syn.domainsCovered,
      affected_parameters: syn.matchedEndpoints.map((m) => m.endpoint_label),
      noael_dose: null, // Would need per-syndrome NOAEL computation
      loael_dose: null,
      translational_tier: interp?.translationalConfidence?.tier ?? "insufficient_data",
    };
  });

  // Determine combined NOAEL (most conservative across sexes)
  const validNoaels = noaelBySex.filter((n) => n.noael_dose_level !== null && n.noael_dose_level > 0);
  const mostConservative = validNoaels.length > 0
    ? validNoaels.reduce((a, b) => (a.noael_dose_level! <= b.noael_dose_level! ? a : b))
    : null;

  const combinedNoael = mostConservative
    ? {
        dose_level: mostConservative.noael_dose_level!,
        dose_value: mostConservative.noael_dose_value ?? null,
        dose_unit: doseGroups[0]?.dose_unit ?? "mg/kg/day",
        label: mostConservative.noael_label ?? `Dose level ${mostConservative.noael_dose_level}`,
        basis: mostConservative.noael_derivation ?? "",
      }
    : null;

  // Extract TK exposure at NOAEL
  const aucAtNoael = pkIntegration?.noael_exposure?.auc?.mean ?? null;
  const cmaxAtNoael = pkIntegration?.noael_exposure?.cmax?.mean ?? null;

  return {
    schema_version: "1.0",
    study_id: metadata.study_id,
    program_id: metadata.project ?? null,
    species: metadata.species ?? "UNKNOWN",
    strain: metadata.strain ?? "UNKNOWN",
    route: metadata.route ?? "UNKNOWN",
    study_type: metadata.study_type ?? "REPEAT_DOSE",
    duration_weeks: metadata.duration_weeks ?? null,
    recovery_weeks: metadata.recovery_weeks ?? null,
    dose_levels: doseGroups.map((d) => d.dose_level),
    dose_labels: doseGroups.map((d) => d.dose_label),
    dose_unit: doseGroups[0]?.dose_unit ?? "mg/kg/day",
    glp_compliant: metadata.glp?.toUpperCase() === "Y" || metadata.glp?.toUpperCase() === "YES",
    sex_population: (metadata.sex_population as "BOTH" | "MALE_ONLY" | "FEMALE_ONLY") ?? "BOTH",
    noael_by_sex: noaelBySex.map((n) => ({
      sex: n.sex,
      noael_dose_level: n.noael_dose_level,
      noael_dose_value: n.noael_dose_value ?? null,
      noael_label: n.noael_label ?? "",
      loael_dose_level: n.loael_dose_level ?? null,
      confidence: n.noael_confidence ?? 0,
    })),
    combined_noael: combinedNoael,
    target_organs: targetOrgans.map((to) => ({
      organ_system: to.organ_system,
      evidence_score: to.evidence_score,
      n_domains: to.n_domains ?? 0,
      domains: to.domains ?? [],
      max_severity: to.max_severity != null ? String(to.max_severity) : "normal",
      treatment_related: (to.n_treatment_related ?? 0) > 0,
    })),
    detected_syndromes: detectedSyndromes,
    recovery_outcomes: recoveryOutcomes,
    auc_at_noael: aucAtNoael,
    cmax_at_noael: cmaxAtNoael,
    tk_unit: pkIntegration?.lloq_unit ?? null,
    study_stage: mapPipelineStageToStudyStage(metadata.pipeline_stage ?? null),
    data_quality_flags: dataQualityFlags ?? [],
  };
}
