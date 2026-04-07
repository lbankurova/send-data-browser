"""Check handler for domain completeness rules (DC-001+).

Single entry point with internal dispatch per rule, same pattern as
fda_data_quality.py.
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from services.study_discovery import StudyInfo
from validation.models import AffectedRecordResult, RuleDefinition

logger = logging.getLogger(__name__)


def check_domain_completeness(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
    study: StudyInfo | None = None,
    ct_data: dict | None = None,
    **_kwargs: Any,
) -> list[AffectedRecordResult]:
    """Evaluate a single DC-xxx rule against loaded domains."""
    dc_rule = rule.parameters.get("dc_rule", rule.id)

    dispatch = {
        "DC-001": _check_dc001,
    }

    handler = dispatch.get(dc_rule)
    if handler is None:
        logger.warning("Unknown DC rule: %s", dc_rule)
        return []

    return handler(
        rule=rule,
        domains=domains,
        rule_id_prefix=rule_id_prefix,
    )


# -- DC-001: MI finding without severity grade --------------------------------


def _check_dc001(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    rule_id_prefix: str,
) -> list[AffectedRecordResult]:
    """Flag MI records where MISTRESC has a positive finding but MISEV is empty.

    A "positive finding" means MISTRESC is populated and not "NORMAL".
    Neoplastic findings (MIRESCAT = BENIGN/MALIGNANT) are still flagged but
    the diagnosis notes that severity grading may not apply.
    """
    mi = domains.get("MI")
    if mi is None or mi.empty:
        return []

    if "MISTRESC" not in mi.columns:
        return []

    # Identify positive findings: MISTRESC populated and not NORMAL
    mistresc = mi["MISTRESC"].fillna("").astype(str).str.strip()
    has_finding = (mistresc != "") & (mistresc.str.upper() != "NORMAL")

    # Identify missing severity
    if "MISEV" in mi.columns:
        misev = mi["MISEV"].fillna("").astype(str).str.strip()
        missing_sev = misev == ""
    else:
        missing_sev = pd.Series(True, index=mi.index)

    flagged = mi[has_finding & missing_sev]
    if flagged.empty:
        return []

    results: list[AffectedRecordResult] = []
    has_spec = "MISPEC" in mi.columns
    has_rescat = "MIRESCAT" in mi.columns
    has_dy = "MIDY" in mi.columns
    has_orres = "MIORRES" in mi.columns
    has_subj = "USUBJID" in mi.columns

    for _idx, row in flagged.iterrows():
        subj = str(row["USUBJID"]).strip() if has_subj else "--"
        specimen = str(row["MISPEC"]).strip() if has_spec else "--"
        finding = str(row["MISTRESC"]).strip()
        rescat = str(row["MIRESCAT"]).strip() if has_rescat else ""
        orres = str(row["MIORRES"]).strip() if has_orres else ""

        # Build visit from MIDY
        if has_dy and pd.notna(row["MIDY"]):
            try:
                visit = f"Day {int(float(row['MIDY']))}"
            except (ValueError, TypeError):
                visit = "--"
        else:
            visit = "--"

        is_neoplasm = rescat.upper() in ("BENIGN", "MALIGNANT")

        evidence_lines = [
            {"label": "Subject", "value": subj},
            {"label": "Specimen", "value": specimen},
            {"label": "Finding (MISTRESC)", "value": finding},
        ]
        if orres:
            evidence_lines.append({"label": "MIORRES", "value": orres})
        if rescat:
            evidence_lines.append({"label": "MIRESCAT", "value": rescat})
        evidence_lines.append({"label": "MISEV", "value": "(empty)"})

        neoplasm_note = ""
        if is_neoplasm:
            neoplasm_note = (
                " This is a neoplastic finding classified as "
                f"{rescat} -- severity grading typically does not apply "
                "to neoplasms, but MISEV should still be reviewed."
            )

        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=f"{rule_id_prefix}-MI",
            subject_id=subj,
            visit=visit,
            domain="MI",
            variable="MISEV",
            actual_value=f"{specimen}: {finding}",
            expected_value="Severity grade (e.g., MINIMAL, MILD, MODERATE, MARKED, SEVERE)",
            fix_tier=rule.default_fix_tier,
            auto_fixed=False,
            suggestions=["MINIMAL", "MILD", "MODERATE", "MARKED", "SEVERE"],
            evidence={
                "type": "missing-value",
                "variable": "MISEV",
                "lines": evidence_lines,
            },
            diagnosis=(
                f"Subject {subj} has MI finding '{finding}' in {specimen} "
                f"({visit}) but MISEV is empty.{neoplasm_note}"
            ),
        ))

    return results
