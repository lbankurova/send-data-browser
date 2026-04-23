import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AdminFilters,
  type SynonymMappingBody,
  type UnrecognizedTermsResponse,
  deleteSynonymMapping,
  fetchUnrecognizedTerms,
  putSynonymMapping,
} from "@/lib/admin-terms-api";

const KEY = ["admin", "unrecognized-terms"] as const;
const XSTUDY_COLLISIONS_KEY = ["xstudy", "term-collisions"] as const;

export function useAdminTerms(filters: AdminFilters = {}, enabled = true) {
  return useQuery<UnrecognizedTermsResponse>({
    queryKey: [...KEY, filters],
    queryFn: () => fetchUnrecognizedTerms(filters),
    enabled,
    // User-mutable + persisted to IndexedDB: must always background-refetch on
    // mount so cross-session edits (synonym accept/reject) override the
    // hydrated snapshot.
    staleTime: 0,
    retry: false,
  });
}

export function useAcceptSynonym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { body: SynonymMappingBody; confirmImpact?: boolean; forceSequential?: boolean }) =>
      putSynonymMapping(args.body, {
        confirmImpact: args.confirmImpact,
        forceSequential: args.forceSequential,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // AC-6.6: dictionary changed -> any cached collision list is stale.
      qc.invalidateQueries({ queryKey: XSTUDY_COLLISIONS_KEY });
    },
  });
}

export function useRejectSynonym() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; rejected_by: string; reason: string }) =>
      deleteSynonymMapping(args.id, args.rejected_by, args.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
