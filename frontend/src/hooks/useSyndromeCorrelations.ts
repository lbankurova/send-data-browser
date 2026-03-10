import { useQuery } from "@tanstack/react-query";
import { fetchSyndromeCorrelations } from "@/lib/analysis-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import type { OrganCorrelationMatrix } from "@/types/analysis";
import type { ExcludedMember, SyndromeCorrelationResult } from "@/types/analysis";

/** Domains whose findings are always incidence (non-correlatable). */
const INCIDENCE_DOMAINS = new Set(["MI", "MA"]);

export interface SyndromeCorrelationData {
  matrix: OrganCorrelationMatrix;
  excludedMembers: ExcludedMember[];
}

export interface SyndromeMember {
  endpoint_label: string;
  domain: string;
}

/**
 * Adapt SyndromeCorrelationResult → OrganCorrelationMatrix so
 * CorrelationMatrixPane can be reused without modification.
 */
function adaptToOrganMatrix(result: SyndromeCorrelationResult): SyndromeCorrelationData {
  return {
    matrix: {
      organ_system: result.syndrome_id,
      endpoints: result.endpoints,
      endpoint_domains: result.endpoint_domains,
      matrix: result.matrix,
      p_values: result.p_values,
      n_values: result.n_values,
      endpoint_finding_ids: result.endpoint_finding_ids,
      total_pairs: result.total_pairs,
      summary: {
        median_abs_rho: result.summary.median_abs_rho,
        strong_pairs: result.summary.strong_pairs,
        total_pairs: result.summary.total_pairs,
        coherence_label: result.summary.validation_label,
        gloss: result.summary.gloss,
      },
    },
    excludedMembers: result.excluded_members,
  };
}

export function useSyndromeCorrelations(
  studyId: string | undefined,
  syndromeId: string | null,
  members: SyndromeMember[],
) {
  const { queryParams: params } = useStudySettings();

  // Filter out incidence domains client-side, build exclusion list
  const incidenceExcluded: ExcludedMember[] = [];
  const continuousMembers: SyndromeMember[] = [];
  for (const m of members) {
    if (INCIDENCE_DOMAINS.has(m.domain)) {
      incidenceExcluded.push({
        endpoint_label: m.endpoint_label,
        domain: m.domain,
        reason: "incidence_data",
      });
    } else {
      continuousMembers.push(m);
    }
  }

  const sortedLabels = continuousMembers
    .map((m) => m.endpoint_label)
    .sort();

  const query = useQuery({
    queryKey: ["syndrome-correlations", studyId, syndromeId, sortedLabels, params],
    queryFn: async () => {
      const result = await fetchSyndromeCorrelations(
        studyId!,
        sortedLabels,
        syndromeId!,
        params || undefined,
      );
      // Merge client-side incidence exclusions with backend exclusions
      const allExcluded = [...incidenceExcluded, ...result.excluded_members];
      const adapted = adaptToOrganMatrix({ ...result, excluded_members: allExcluded });
      return adapted;
    },
    enabled: !!studyId && !!syndromeId && sortedLabels.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  return query;
}
