import { useMemo } from "react";
import { useStudyMetadata } from "./useStudyMetadata";
import { parseStudyContext } from "@/lib/parse-study-context";
import type { StudyContext } from "@/types/study-context";

/**
 * Returns a parsed StudyContext derived from the study metadata endpoint.
 * Shares React Query cache with useStudyMetadata (same query key).
 */
export function useStudyContext(
  studyId: string | undefined
): { data: StudyContext | undefined; isLoading: boolean } {
  const { data: meta, isLoading } = useStudyMetadata(studyId ?? "");

  const data = useMemo(
    () => (meta ? parseStudyContext(meta) : undefined),
    [meta]
  );

  return { data, isLoading };
}
