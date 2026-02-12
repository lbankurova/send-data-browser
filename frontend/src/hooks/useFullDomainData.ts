/**
 * Fetches ALL rows from a SEND domain (all pages) and caches the result.
 * Used by TRUST-07p1 source records expander to get individual animal data.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchDomainData } from "@/lib/api";
import type { ColumnInfo } from "@/types";

const PAGE_SIZE = 500; // backend MAX_PAGE_SIZE

export interface FullDomainResult {
  domain: string;
  columns: ColumnInfo[];
  rows: Record<string, string | null>[];
  totalRows: number;
}

/**
 * Fetch all pages of a domain and return combined rows.
 * Lazy-loaded: only fetches when `enabled` is true.
 */
export function useFullDomainData(
  studyId: string | undefined,
  domain: string | undefined,
  enabled: boolean,
) {
  return useQuery<FullDomainResult | null>({
    queryKey: ["fullDomainData", studyId, domain],
    queryFn: async () => {
      if (!studyId || !domain) return null;

      const domainLower = domain.toLowerCase();

      // Fetch first page to discover total
      const first = await fetchDomainData(studyId, domainLower, 1, PAGE_SIZE);
      const allRows = [...first.rows];

      // Fetch remaining pages in parallel
      if (first.total_pages > 1) {
        const remaining = await Promise.all(
          Array.from({ length: first.total_pages - 1 }, (_, i) =>
            fetchDomainData(studyId, domainLower, i + 2, PAGE_SIZE),
          ),
        );
        for (const page of remaining) {
          allRows.push(...page.rows);
        }
      }

      return {
        domain: first.domain,
        columns: first.columns,
        rows: allRows,
        totalRows: first.total_rows,
      };
    },
    enabled: enabled && !!studyId && !!domain,
    staleTime: 10 * 60 * 1000, // Domain data is immutable
  });
}
