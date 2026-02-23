"""Pydantic models for adverse effects analysis API responses."""

from pydantic import BaseModel


class Insight(BaseModel):
    text: str
    level: str = "info"  # "info" | "warning" | "critical"


class DoseGroup(BaseModel):
    dose_level: int
    armcd: str
    label: str
    dose_value: float | None = None
    dose_unit: str | None = None
    n_male: int = 0
    n_female: int = 0
    n_total: int = 0


class GroupStat(BaseModel):
    dose_level: int
    n: int = 0
    mean: float | None = None
    sd: float | None = None
    median: float | None = None
    mean_pct_change: float | None = None
    mean_relative: float | None = None
    affected: int | None = None
    incidence: float | None = None
    avg_severity: float | None = None


class PairwiseResult(BaseModel):
    dose_level: int
    p_value: float | None = None
    p_value_adj: float | None = None
    statistic: float | None = None
    cohens_d: float | None = None
    odds_ratio: float | None = None
    risk_ratio: float | None = None
    p_value_welch: float | None = None


class UnifiedFinding(BaseModel):
    id: str
    domain: str
    test_code: str
    test_name: str
    specimen: str | None = None
    finding: str
    day: int | None = None
    sex: str
    unit: str | None = None
    data_type: str = "continuous"
    severity: str = "normal"
    direction: str | None = None
    dose_response_pattern: str | None = None
    treatment_related: bool = False
    max_effect_size: float | None = None
    min_p_adj: float | None = None
    trend_p: float | None = None
    trend_stat: float | None = None
    avg_severity: float | None = None
    organ_system: str | None = None
    endpoint_label: str | None = None
    max_fold_change: float | None = None
    group_stats: list[GroupStat] = []
    pairwise: list[PairwiseResult] = []


class AnalysisSummary(BaseModel):
    total_findings: int
    total_adverse: int
    total_warning: int
    total_normal: int
    total_treatment_related: int = 0
    target_organs: list[str] = []
    domains_with_findings: list[str] = []
    suggested_noael: dict | None = None


class AdverseEffectsResponse(BaseModel):
    study_id: str
    dose_groups: list[DoseGroup] = []
    findings: list[UnifiedFinding] = []
    total_findings: int = 0
    page: int = 1
    page_size: int = 50
    total_pages: int = 1
    summary: AnalysisSummary


class CorrelationEntry(BaseModel):
    finding_id: str
    endpoint: str
    domain: str
    rho: float
    p_value: float | None = None


class CorrelationsPane(BaseModel):
    related: list[CorrelationEntry] = []
    total_correlations: int = 0


class EffectEntry(BaseModel):
    finding_id: str
    finding: str
    domain: str
    effect_size: float
    data_type: str = "continuous"


class EffectSizePane(BaseModel):
    current_effect_size: float | None = None
    data_type: str = "continuous"
    interpretation: str = "Not available"
    largest_effects: list[EffectEntry] = []
    total_with_effects: int = 0


class FindingContext(BaseModel):
    finding_id: str
    treatment_summary: dict
    statistics: dict
    dose_response: dict
    correlations: dict
    effect_size: dict
