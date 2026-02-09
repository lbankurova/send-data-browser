import { useCallback } from "react";
import { useAnnotations, useSaveAnnotation } from "./useAnnotations";

export interface EndpointBookmark {
  bookmarked: boolean;
  note: string;
  bookmarkedDate?: string;
  pathologist?: string;
}

export function useEndpointBookmarks(studyId: string | undefined) {
  return useAnnotations<EndpointBookmark>(studyId, "endpoint-bookmarks");
}

export function useToggleBookmark(studyId: string | undefined) {
  const save = useSaveAnnotation<EndpointBookmark>(studyId, "endpoint-bookmarks");

  return useCallback(
    (endpointLabel: string, currentlyBookmarked: boolean) => {
      save.mutate({
        entityKey: endpointLabel,
        data: {
          bookmarked: !currentlyBookmarked,
          note: "",
          bookmarkedDate: new Date().toISOString(),
        },
      });
    },
    [save]
  );
}
