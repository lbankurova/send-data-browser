/**
 * TRUST-06: Fetch audit log for a study.
 */
import { useQuery } from "@tanstack/react-query";

export interface AuditLogEntry {
  timestamp: string;
  user: string;
  schemaType: string;
  entityKey: string;
  action: "create" | "update";
  changes: Record<string, { old: unknown; new: unknown }>;
}

export function useAuditLog(
  studyId: string | undefined,
  schemaType?: string,
  entityKey?: string,
) {
  return useQuery<AuditLogEntry[]>({
    queryKey: ["audit-log", studyId, schemaType, entityKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (schemaType) params.set("schema_type", schemaType);
      if (entityKey) params.set("entity_key", entityKey);
      const qs = params.toString();
      const url = `/api/studies/${encodeURIComponent(studyId!)}/audit-log${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Audit log fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!studyId,
    staleTime: 30 * 1000, // Refresh frequently for active editing sessions
  });
}
