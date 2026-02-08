import { useQuery } from "@tanstack/react-query";
import type { RecordEvidence } from "@/components/analysis/ValidationView";

export interface AffectedRecordData {
  issue_id: string;
  rule_id: string;
  subject_id: string;
  visit: string;
  domain: string;
  variable: string;
  actual_value: string;
  expected_value: string;
  fix_tier: 1 | 2 | 3;
  auto_fixed: boolean;
  suggestions: string[] | null;
  script_key: string | null;
  evidence: RecordEvidence;
  diagnosis: string;
}

interface AffectedRecordsResponse {
  records: AffectedRecordData[];
  total: number;
  page: number;
  page_size: number;
}

export function useAffectedRecords(
  studyId: string | undefined,
  ruleId: string | undefined,
) {
  return useQuery<AffectedRecordsResponse>({
    queryKey: ["affected-records", studyId, ruleId],
    queryFn: async () => {
      const res = await fetch(
        `/api/studies/${studyId}/validation/results/${encodeURIComponent(ruleId!)}/records?page_size=500`
      );
      if (!res.ok) throw new Error(`Affected records fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!studyId && !!ruleId,
    staleTime: 5 * 60 * 1000,
  });
}
