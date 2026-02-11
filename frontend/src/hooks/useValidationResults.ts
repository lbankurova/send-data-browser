import { useQuery } from "@tanstack/react-query";

export interface ValidationRuleResult {
  rule_id: string;
  severity: "Error" | "Warning" | "Info";
  domain: string;
  category: string;
  description: string;
  records_affected: number;
  standard: string;
  section: string;
  rationale: string;
  how_to_fix: string;
  cdisc_reference: string | null;
  source: "custom" | "core";
}

export interface FixScriptDef {
  key: string;
  name: string;
  description: string;
  applicable_rules: string[];
}

export interface ConformanceDetails {
  engine_version: string;
  standard: string;
  ct_version: string;
}

export interface ValidationResultsData {
  rules: ValidationRuleResult[];
  scripts: FixScriptDef[];
  summary: {
    total_issues: number;
    errors: number;
    warnings: number;
    info: number;
    domains_affected: string[];
    elapsed_seconds?: number;
    validated_at?: string;
  };
  core_conformance: ConformanceDetails | null;
}

export function useValidationResults(studyId: string | undefined) {
  return useQuery<ValidationResultsData>({
    queryKey: ["validation-results", studyId],
    queryFn: async () => {
      const res = await fetch(`/api/studies/${studyId}/validation/results`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Validation results fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
