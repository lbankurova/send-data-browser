import { useQuery } from "@tanstack/react-query";
import { fetchSyndromeCorrelationSummaries } from "@/lib/analysis-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndrome-types";
import type { SyndromeCorrelationSummary } from "@/types/analysis";
import { CONTINUOUS_DOMAINS } from "@/lib/domain-types";

/**
 * Eagerly fetch co-variation summaries for all detected syndromes in one batch request.
 * Returns Record<syndromeId, SyndromeCorrelationSummary> for inline display.
 */
export function useSyndromeCorrelationSummaries(
  studyId: string | undefined,
  syndromes: CrossDomainSyndrome[],
) {
  const { queryParams: params } = useStudySettings();

  // Build batch request: one entry per syndrome, filtering out incidence domains
  const batchEntries = syndromes.map((syn) => ({
    syndrome_id: syn.id,
    endpoint_labels: syn.matchedEndpoints
      .filter((m) => CONTINUOUS_DOMAINS.has(m.domain))
      .map((m) => m.endpoint_label)
      .sort(),
  }));

  // Stable query key: sorted syndrome IDs + their endpoint label counts
  const stableKey = batchEntries.map(
    (e) => `${e.syndrome_id}:${e.endpoint_labels.length}`,
  );

  return useQuery({
    queryKey: ["syndrome-correlation-summaries", studyId, stableKey, params],
    queryFn: async () => {
      // Only request syndromes with ≥2 correlatable endpoints
      const eligible = batchEntries.filter((e) => e.endpoint_labels.length >= 2);
      if (eligible.length === 0) return {} as Record<string, SyndromeCorrelationSummary>;

      return fetchSyndromeCorrelationSummaries(studyId!, eligible, params || undefined);
    },
    enabled: !!studyId && syndromes.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}
