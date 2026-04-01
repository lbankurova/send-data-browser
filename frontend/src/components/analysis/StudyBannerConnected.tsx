/**
 * Self-fetching StudyBanner wrapper for use in view wrappers.
 * Fetches study context, metadata, and findings data,
 * then renders the StudyBanner presentation component.
 */
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StudyBanner } from "./StudyBanner";
import { useStudyContext } from "@/hooks/useStudyContext";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import { fetchStudyMetadataEnriched } from "@/lib/analysis-view-api";
import type { StudyMetadataEnriched } from "@/lib/analysis-view-api";

export function StudyBannerConnected() {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: studyContext } = useStudyContext(studyId);
  const { data: findingsData } = useFindingsAnalyticsResult();

  const { data: enrichedMeta } = useQuery<StudyMetadataEnriched>({
    queryKey: ["study-metadata-enriched", studyId],
    queryFn: () => fetchStudyMetadataEnriched(studyId!),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });

  const doseGroupCount = findingsData?.dose_groups?.length ?? 0;

  // Detect within-subject N from crossover findings (all groups have same N)
  const withinSubjectN = useMemo(() => {
    if (!enrichedMeta?.is_crossover || !findingsData?.findings?.length) return null;
    const first = findingsData.findings.find(
      (f) => f.data_type === "continuous" && f.group_stats?.length > 0,
    );
    return first?.group_stats[0]?.n ?? null;
  }, [enrichedMeta?.is_crossover, findingsData?.findings]);

  if (!studyContext || !studyId) return null;

  return (
    <StudyBanner
      studyContext={studyContext}
      doseGroupCount={doseGroupCount}
      isMultiCompound={enrichedMeta?.is_multi_compound ?? false}
      designTypeLabel={enrichedMeta?.design_type_label}
      designCaveat={enrichedMeta?.design_caveat}
      isCrossover={enrichedMeta?.is_crossover ?? false}
      withinSubjectN={withinSubjectN}
    />
  );
}
