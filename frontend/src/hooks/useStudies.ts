import { useQuery } from "@tanstack/react-query";
import { fetchStudies } from "@/lib/api";

export function useStudies() {
  return useQuery({
    queryKey: ["studies"],
    queryFn: fetchStudies,
    // Always refetch on mount so renames/imports/deletes from a previous session
    // override the hydrated IndexedDB snapshot. Hydrated data is shown instantly
    // while the background refetch runs (stale-while-revalidate).
    staleTime: 0,
  });
}
