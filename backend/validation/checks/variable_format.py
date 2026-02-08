"""Check: Variable naming conventions."""

from __future__ import annotations

import re

import pandas as pd

from validation.models import AffectedRecordResult, RuleDefinition

# Standard cross-domain variables that don't follow the 2-char domain prefix
STANDARD_VARS = {
    "STUDYID", "DOMAIN", "USUBJID", "SUBJID", "POOLID",
    "VISITNUM", "VISIT", "VISITDY", "EPOCH", "ELEMENT",
    "ARMCD", "ARM", "SETCD", "SET",
    "TAETORD", "ETCD", "TESTRL",
    "TSSEQ", "TSGRPID", "TSPARMCD", "TSPARM", "TSVAL", "TSVALNF", "TSVALCD",
    "TXSEQ", "TXPARMCD", "TXPARM", "TXVAL",
}

# Findings domain codes (2-char prefix for variable names)
FINDINGS_DOMAINS = {"BW", "CL", "DD", "EG", "FW", "LB", "MA", "MI", "OM", "PC", "PP", "TF", "VS"}


def check_variable_format(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Check variable naming: length ≤8, uppercase alphanumeric, domain prefix."""
    results: list[AffectedRecordResult] = []
    max_length = rule.parameters.get("max_length", 8)

    for domain_code, df in sorted(domains.items()):
        dc = domain_code.upper()
        for col_name in df.columns:
            cn = col_name.upper()

            # Skip standard cross-domain variables
            if cn in STANDARD_VARS:
                continue

            # Check length
            if len(cn) > max_length:
                results.append(AffectedRecordResult(
                    issue_id="",
                    rule_id=f"{rule_id_prefix}-{dc}",
                    subject_id="--",
                    visit="--",
                    domain=dc,
                    variable=cn,
                    actual_value=f"{cn} ({len(cn)} chars)",
                    expected_value=f"≤{max_length} characters",
                    fix_tier=2,
                    auto_fixed=False,
                    evidence={
                        "type": "value-correction",
                        "from": f"{cn} ({len(cn)} chars)",
                        "to": f"Truncate to {max_length} chars",
                    },
                    diagnosis=f"Variable name '{cn}' exceeds {max_length} character limit.",
                ))

            # Check uppercase alphanumeric
            if not re.match(r"^[A-Z0-9_]+$", cn):
                results.append(AffectedRecordResult(
                    issue_id="",
                    rule_id=f"{rule_id_prefix}-{dc}",
                    subject_id="--",
                    visit="--",
                    domain=dc,
                    variable=cn,
                    actual_value=cn,
                    expected_value="Uppercase alphanumeric",
                    fix_tier=2,
                    auto_fixed=False,
                    suggestions=[cn.upper()],
                    evidence={
                        "type": "value-correction",
                        "from": cn,
                        "to": cn.upper(),
                    },
                    diagnosis=f"Variable name '{cn}' contains non-uppercase characters.",
                ))

            # Check findings domain prefix: non-standard vars must start with 2-char domain code
            if dc in FINDINGS_DOMAINS and len(cn) > 2:
                expected_prefix = dc[:2]
                if not cn.startswith(expected_prefix) and cn not in STANDARD_VARS:
                    # Check against SENDIG metadata for known variables
                    domain_vars = _get_domain_variables(metadata, dc)
                    if cn not in domain_vars:
                        results.append(AffectedRecordResult(
                            issue_id="",
                            rule_id=f"{rule_id_prefix}-{dc}",
                            subject_id="--",
                            visit="--",
                            domain=dc,
                            variable=cn,
                            actual_value=cn,
                            expected_value=f"{expected_prefix}* prefix",
                            fix_tier=1,
                            auto_fixed=False,
                            evidence={
                                "type": "value-correction",
                                "from": cn,
                                "to": f"{expected_prefix}{cn[2:] if len(cn) > 2 else cn}",
                            },
                            diagnosis=f"Variable '{cn}' in findings domain {dc} does not use the expected '{expected_prefix}' prefix and is not a standard SENDIG variable.",
                        ))

    return results


def _get_domain_variables(metadata: dict, domain_code: str) -> set[str]:
    """Get valid variable names for a domain from SENDIG metadata."""
    domains = metadata.get("domains", {})
    domain_def = domains.get(domain_code, {})
    variables = domain_def.get("variables", {})
    return {v.upper() for v in variables}
