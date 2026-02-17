/** TypeScript interfaces matching backend analysis schemas */

export interface DoseGroup {
  dose_level: number;
  armcd: string;
  label: string;
  dose_value: number | null;
  dose_unit: string | null;
  n_male: number;
  n_female: number;
  n_total: number;
}

export interface GroupStat {
  dose_level: number;
  n: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  mean_pct_change?: number | null;
  mean_relative?: number | null;
  affected?: number | null;
  incidence?: number | null;
  avg_severity?: number | null;
}

export interface PairwiseResult {
  dose_level: number;
  p_value: number | null;
  p_value_adj: number | null;
  statistic: number | null;
  cohens_d: number | null;
  odds_ratio?: number | null;
  risk_ratio?: number | null;
}

export interface UnifiedFinding {
  id: string;
  domain: string;
  test_code: string;
  test_name: string;
  specimen: string | null;
  finding: string;
  day: number | null;
  sex: string;
  unit: string | null;
  data_type: "continuous" | "incidence";
  severity: "adverse" | "warning" | "normal";
  direction: "up" | "down" | "none" | null;
  dose_response_pattern: string | null;
  treatment_related: boolean;
  max_effect_size: number | null;
  min_p_adj: number | null;
  trend_p: number | null;
  trend_stat: number | null;
  avg_severity?: number | null;
  organ_system?: string | null;
  endpoint_label?: string | null;
  max_fold_change?: number | null;
  group_stats: GroupStat[];
  pairwise: PairwiseResult[];
}

export interface AnalysisSummary {
  total_findings: number;
  total_adverse: number;
  total_warning: number;
  total_normal: number;
  total_treatment_related: number;
  target_organs: string[];
  domains_with_findings: string[];
  suggested_noael: {
    dose_level: number;
    label: string;
    dose_value: number | null;
    dose_unit: string | null;
  } | null;
}

export interface Insight {
  text: string;
  level: "info" | "warning" | "critical";
}

export interface FindingsResponse {
  study_id: string;
  dose_groups: DoseGroup[];
  findings: UnifiedFinding[];
  total_findings: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: AnalysisSummary;
}

export interface FindingContext {
  finding_id: string;
  treatment_summary: {
    severity: string;
    treatment_related: boolean;
    severity_counts: Record<string, number>;
    target_organs: string[];
    convergent_evidence: Array<{
      finding_id: string;
      domain: string;
      finding: string;
      severity: string;
    }>;
    insights: Insight[];
  };
  statistics: {
    data_type: string;
    rows: Array<{
      dose_level: number;
      label: string;
      dose_value: number | null;
      dose_unit: string | null;
      n: number;
      mean?: number | null;
      sd?: number | null;
      median?: number | null;
      affected?: number;
      incidence?: number;
      p_value?: number | null;
      p_value_adj?: number | null;
      cohens_d?: number | null;
      odds_ratio?: number | null;
    }>;
    trend_p: number | null;
    trend_stat: number | null;
    unit: string | null;
    insights: Insight[];
  };
  dose_response: {
    pattern: string;
    direction: string | null;
    bars: Array<{
      dose_level: number;
      label: string;
      dose_value: number | null;
      value: number | null;
      sd?: number | null;
      count?: number;
      total?: number;
    }>;
    trend_p: number | null;
    pattern_confidence?: string | null;
    onset_dose_value?: number | null;
    onset_dose_unit?: string | null;
    insights: Insight[];
  };
  correlations: {
    related: Array<{
      finding_id: string;
      endpoint: string;
      domain: string;
      rho: number;
      p_value: number | null;
      n?: number | null;
      basis?: string | null;
    }>;
    total_correlations: number;
    insights: Insight[];
  };
  effect_size: {
    current_effect_size: number | null;
    data_type: string;
    interpretation: string;
    largest_effects: Array<{
      finding_id: string;
      finding: string;
      domain: string;
      effect_size: number;
      data_type: string;
    }>;
    total_with_effects: number;
    insights: Insight[];
  };
}

export interface FindingsFilters {
  domain: string | null;
  sex: string | null;
  severity: string | null;
  search: string;
  organ_system: string | null;
  endpoint_label: string | null;
  dose_response_pattern: string | null;
}
