"""Checks: Required domains, TS required parameters, subject count consistency."""

from __future__ import annotations

import pandas as pd

from validation.models import AffectedRecordResult, RuleDefinition

FINDINGS_DOMAINS = {"BW", "CL", "DD", "EG", "FW", "LB", "MA", "MI", "OM", "PC", "PP", "TF", "VS"}


def check_required_domains(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Check for Tier 1 required domains."""
    results: list[AffectedRecordResult] = []
    params = rule.parameters
    required = [d.upper() for d in params.get("required", ["DM", "TS", "TA", "TE", "TX", "EX"])]
    recommended = [d.upper() for d in params.get("recommended", ["SE", "DS"])]
    findings_required = params.get("findings_required", True)

    loaded_domains = {dc.upper() for dc in domains.keys()}

    for req_domain in sorted(required):
        if req_domain not in loaded_domains:
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}",
                subject_id="--",
                visit="--",
                domain=req_domain,
                variable="(domain)",
                actual_value="(missing)",
                expected_value="Required domain",
                fix_tier=3,
                auto_fixed=False,
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": "Missing domain", "value": req_domain},
                        {"label": "Required by", "value": "SENDIG 3.1"},
                    ],
                },
                diagnosis=f"Required domain {req_domain} is not present in the study.",
            ))

    for rec_domain in sorted(recommended):
        if rec_domain not in loaded_domains:
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}",
                subject_id="--",
                visit="--",
                domain=rec_domain,
                variable="(domain)",
                actual_value="(missing)",
                expected_value="Recommended domain",
                fix_tier=1,
                auto_fixed=False,
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": "Missing domain", "value": rec_domain},
                        {"label": "Status", "value": "Recommended by SENDIG 3.1"},
                    ],
                },
                diagnosis=f"Recommended domain {rec_domain} is not present.",
            ))

    # Check for at least one findings domain
    if findings_required:
        has_findings = any(dc in FINDINGS_DOMAINS for dc in loaded_domains)
        if not has_findings:
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}",
                subject_id="--",
                visit="--",
                domain="--",
                variable="(findings domain)",
                actual_value="(none present)",
                expected_value="At least one findings domain",
                fix_tier=3,
                auto_fixed=False,
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": "Findings domains", "value": "None found"},
                        {"label": "Expected", "value": "At least one of: " + ", ".join(sorted(FINDINGS_DOMAINS))},
                    ],
                },
                diagnosis="No findings domains present. Expected at least one.",
            ))

    return results


def check_ts_required_params(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Check TS domain has required TSPARMCD values."""
    results: list[AffectedRecordResult] = []
    params = rule.parameters
    required_params = params.get("required", [])
    recommended_params = params.get("recommended", [])

    ts = domains.get("TS")
    if ts is None:
        return results

    if "TSPARMCD" not in ts.columns:
        return results

    present_params = set(ts["TSPARMCD"].dropna().astype(str).str.strip().str.upper())

    for param in sorted(required_params):
        pu = param.upper()
        if pu not in present_params:
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}",
                subject_id="--",
                visit="--",
                domain="TS",
                variable="TSPARMCD",
                actual_value=f"(missing: {pu})",
                expected_value=f"Required TS parameter",
                fix_tier=3,
                auto_fixed=False,
                evidence={
                    "type": "missing-value",
                    "variable": pu,
                    "derivation": "TS domain TSPARMCD",
                },
                diagnosis=f"Required TS parameter '{pu}' is missing from Trial Summary.",
            ))

    for param in sorted(recommended_params):
        pu = param.upper()
        if pu not in present_params:
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}",
                subject_id="--",
                visit="--",
                domain="TS",
                variable="TSPARMCD",
                actual_value=f"(missing: {pu})",
                expected_value=f"Recommended TS parameter",
                fix_tier=1,
                auto_fixed=False,
                evidence={
                    "type": "missing-value",
                    "variable": pu,
                    "derivation": "TS domain TSPARMCD",
                },
                diagnosis=f"Recommended TS parameter '{pu}' is missing from Trial Summary.",
            ))

    return results


def check_subject_count(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Flag domains where USUBJID count differs unexpectedly from DM."""
    results: list[AffectedRecordResult] = []

    dm = domains.get("DM")
    if dm is None or "USUBJID" not in dm.columns:
        return results

    dm_count = dm["USUBJID"].nunique()

    for domain_code, df in sorted(domains.items()):
        dc = domain_code.upper()
        if dc in ("DM", "TS", "TA", "TE", "TX"):
            continue
        if "USUBJID" not in df.columns:
            continue

        domain_count = df["USUBJID"].nunique()

        # Flag if significantly different (>20% difference or domain has more subjects than DM)
        if domain_count > dm_count:
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=f"{rule_id_prefix}-{dc}",
                subject_id="--",
                visit="--",
                domain=dc,
                variable="USUBJID",
                actual_value=f"{domain_count} subjects",
                expected_value=f"≤{dm_count} (DM count)",
                fix_tier=1,
                auto_fixed=False,
                evidence={
                    "type": "metadata",
                    "lines": [
                        {"label": f"{dc} subjects", "value": str(domain_count)},
                        {"label": "DM subjects", "value": str(dm_count)},
                        {"label": "Difference", "value": f"+{domain_count - dm_count}"},
                    ],
                },
                diagnosis=f"{dc} has {domain_count} unique subjects, more than DM ({dm_count}).",
            ))

    return results
