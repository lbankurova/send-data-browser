import { useQuery } from "@tanstack/react-query";
import { fetchStudies } from "@/lib/api";

export function useStudies() {
  return useQuery({
    queryKey: ["studies"],
    queryFn: fetchStudies,
  });
}
