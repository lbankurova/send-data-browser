"""Pydantic models for the SEND validation engine."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


# ── Rule definition (loaded from YAML) ──────────────────────────────────

class RuleDefinition(BaseModel):
    id: str
    core_ref: str | None = None
    name: str
    description: str
    severity: Literal["Error", "Warning", "Info"]
    category: str
    applicable_domains: list[str]  # ["ALL"] or list of domain codes
    check_type: str
    parameters: dict[str, Any] = {}
    fix_guidance: str = ""
    auto_fixable: bool = False
    default_fix_tier: Literal[1, 2, 3] = 1
    evidence_type: str = "metadata"
    cdisc_reference: str = ""


# ── Engine output models ────────────────────────────────────────────────

class ValidationRuleResult(BaseModel):
    rule_id: str  # e.g. "SEND-VAL-001-DM" or "CORE-000252-BW"
    severity: Literal["Error", "Warning", "Info"]
    domain: str
    category: str
    description: str
    records_affected: int
    # Embedded detail
    standard: str
    section: str
    rationale: str
    how_to_fix: str
    cdisc_reference: str | None = None
    source: Literal["custom", "core"] = "custom"  # Rule origin


class AffectedRecordResult(BaseModel):
    issue_id: str  # e.g. "SEND-VAL-001-DM-001"
    rule_id: str
    subject_id: str
    visit: str
    domain: str
    variable: str
    actual_value: str
    expected_value: str
    fix_tier: Literal[1, 2, 3]
    auto_fixed: bool
    suggestions: list[str] | None = None
    script_key: str | None = None
    evidence: dict[str, Any]  # RecordEvidence union
    diagnosis: str


class FixScriptDefinition(BaseModel):
    key: str
    name: str
    description: str
    applicable_rules: list[str]


class FixScriptPreviewRow(BaseModel):
    subject: str
    field: str
    from_val: str
    to_val: str


class ConformanceDetails(BaseModel):
    """CDISC CORE engine conformance metadata."""
    engine_version: str
    standard: str
    ct_version: str


class ValidationResults(BaseModel):
    """Full validation run output — cached as JSON."""
    rules: list[ValidationRuleResult]
    records: dict[str, list[AffectedRecordResult]]  # rule_id -> records
    scripts: list[FixScriptDefinition]
    summary: dict[str, Any]
    core_conformance: ConformanceDetails | None = None


# ── API response models ─────────────────────────────────────────────────

class ValidationResultsResponse(BaseModel):
    rules: list[ValidationRuleResult]
    scripts: list[FixScriptDefinition]
    summary: dict[str, Any]
    core_conformance: ConformanceDetails | None = None


class AffectedRecordsResponse(BaseModel):
    records: list[AffectedRecordResult]
    total: int
    page: int
    page_size: int


class FixScriptPreviewResponse(BaseModel):
    preview: list[FixScriptPreviewRow]


class ValidationSummaryResponse(BaseModel):
    total_issues: int
    errors: int
    warnings: int
    info: int
    domains_affected: list[str]
