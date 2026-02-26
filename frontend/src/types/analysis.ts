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
  pooled_n_male?: number;
  pooled_n_female?: number;
  pooled_n_total?: number;
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
  p_value_welch?: number | null;
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
  /** Scheduled-only stats (early-death subjects excluded from terminal domains). */
  scheduled_group_stats?: GroupStat[];
  scheduled_pairwise?: PairwiseResult[];
  scheduled_direction?: "up" | "down" | "none" | null;
  /** Number of early-death subjects excluded (0 for longitudinal domains). */
  n_excluded?: number;
  /** Separate (main-only) stats — recovery animals excluded from in-life domains. */
  separate_group_stats?: GroupStat[];
  separate_pairwise?: PairwiseResult[];
  separate_direction?: "up" | "down" | "none" | null;
  /** Tumor behavior classification (TF domain only). */
  behavior?: "BENIGN" | "MALIGNANT" | "UNCERTAIN";
  /** True for all TF (tumor) domain findings — categorically different from non-neoplastic. */
  isNeoplastic?: boolean;
  /** Williams' test results (OM domain only). */
  williams?: WilliamsTestResult | null;
  /** Normalization decision metadata (OM domain only). */
  normalization?: NormalizationMetadata | null;
  /** ANCOVA results (OM domain, tier >= 3 or brain affected). */
  ancova?: ANCOVAResult | null;
  /** Alternative metric stats for OM endpoints. */
  alternatives?: Record<string, AlternativeMetricStats> | null;
}

export interface WilliamsStepDownResult {
  dose_label: string;
  test_statistic: number;
  critical_value: number;
  p_value: number;
  significant: boolean;
}

export interface WilliamsTestResult {
  direction: string;
  constrained_means: number[];
  step_down_results: WilliamsStepDownResult[];
  minimum_effective_dose: string | null;
  pooled_variance: number;
  pooled_df: number;
}

/** Persisted user override for organ weight normalization mode */
export interface NormalizationOverride {
  organ: string;
  mode: "absolute" | "body_weight" | "brain_weight" | "ancova";
  reason: string;
  /** Set by backend on save */
  pathologist?: string;
  reviewDate?: string;
}

export interface NormalizationMetadata {
  recommended_metric: string;
  organ_category: string;
  tier: number;
  confidence: string;
  bw_hedges_g: number;
  brain_hedges_g: number | null;
}

export interface AlternativeMetricStats {
  group_stats: GroupStat[];
  pairwise: PairwiseResult[];
  trend_p: number | null;
  trend_stat: number | null;
}

export interface ANCOVAAdjustedMean {
  group: number;
  raw_mean: number;
  adjusted_mean: number;
  n: number;
  se: number;
}

export interface ANCOVAPairwise {
  group: number;
  difference: number;
  se: number;
  t_statistic: number;
  p_value: number;
  significant: boolean;
}

export interface ANCOVAEffectDecomposition {
  group: number;
  total_effect: number;
  direct_effect: number;
  indirect_effect: number;
  proportion_direct: number;
  direct_g: number;
  direct_p: number;
}

export interface ANCOVAResult {
  adjusted_means: ANCOVAAdjustedMean[];
  pairwise: ANCOVAPairwise[];
  slope: {
    estimate: number;
    se: number;
    t_statistic: number;
    p_value: number;
  };
  slope_homogeneity: {
    f_statistic: number | null;
    p_value: number | null;
    homogeneous: boolean;
  };
  effect_decomposition: ANCOVAEffectDecomposition[];
  model_r_squared: number;
  mse: number;
  use_organ_free_bw: boolean;
  covariate_mean: number;
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
    /** Scheduled-only rows (early-death subjects excluded). Present only for terminal domains. */
    scheduled_rows?: Array<{
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
    /** Number of early-death subjects excluded from scheduled_rows. */
    n_excluded?: number;
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
