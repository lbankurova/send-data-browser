"""Check handler for study design rules (SD-001 through SD-007).

Uses build_subject_context() to evaluate study design issues. The context
computation is cached across all SD rules within a single validation run.
"""

from __future__ import annotations

import logging

import pandas as pd

from services.study_discovery import StudyInfo
from validation.models import AffectedRecordResult, RuleDefinition

logger = logging.getLogger(__name__)

# Module-level cache for context result — reused across all SD rules in one run
_cached_context: dict | None = None
_cached_study_id: str | None = None


def clear_cache() -> None:
    """Clear the cached study design context. Call at start of validation run."""
    global _cached_context, _cached_study_id
    _cached_context = None
    _cached_study_id = None


def _get_context(study: StudyInfo) -> dict:
    """Get or compute the subject context for a study."""
    global _cached_context, _cached_study_id

    if _cached_study_id == study.study_id and _cached_context is not None:
        return _cached_context

    from services.analysis.subject_context import build_subject_context

    _cached_context = build_subject_context(study)
    _cached_study_id = study.study_id
    return _cached_context


def check_study_design(
    rule: RuleDefinition,
    domains: dict[str, pd.DataFrame],
    metadata: dict,
    *,
    rule_id_prefix: str,
    study: StudyInfo | None = None,
) -> list[AffectedRecordResult]:
    """Evaluate a single SD-xxx rule using the enrichment context."""
    if study is None:
        logger.warning("study_design check requires StudyInfo; skipping %s", rule.id)
        return []

    try:
        context = _get_context(study)
    except Exception as e:
        logger.error("Failed to build subject context for %s: %s", study.study_id, e)
        return []

    sd_rule = rule.parameters.get("sd_rule", rule.id)
    matching = [i for i in context["issues"] if i["rule"] == sd_rule]

    if not matching:
        return []

    results: list[AffectedRecordResult] = []
    for issue in matching:
        results.extend(_issue_to_records(sd_rule, issue, rule_id_prefix))

    return results


# ── Issue → AffectedRecordResult mappers ─────────────────────────────────


def _issue_to_records(
    sd_rule: str, issue: dict, prefix: str
) -> list[AffectedRecordResult]:
    """Convert a detected issue dict into AffectedRecordResult list."""
    dispatch = {
        "SD-001": _map_sd001,
        "SD-002": _map_sd002,
        "SD-003": _map_sd003,
        "SD-004": _map_sd004,
        "SD-005": _map_sd005,
        "SD-006": _map_sd006,
        "SD-007": _map_sd007,
    }
    mapper = dispatch.get(sd_rule)
    if mapper is None:
        return []
    return mapper(issue, prefix)


def _map_sd001(issue: dict, prefix: str) -> list[AffectedRecordResult]:
    """SD-001: Orphaned subjects — DM ARMCD not in TA."""
    armcd = issue.get("armcd", "")
    subjects = issue.get("subjects", [])
    n = issue.get("n", len(subjects))

    results = []
    for subj in subjects:
        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=prefix,
            subject_id=str(subj),
            visit="--",
            domain="DM",
            variable="ARMCD",
            actual_value=armcd,
            expected_value="ARMCD present in TA",
            fix_tier=2,
            auto_fixed=False,
            evidence={
                "type": "cross-domain",
                "lines": [
                    {"label": "DM ARMCD", "value": armcd},
                    {"label": "TA ARMCDs", "value": "Does not include this value"},
                    {"label": "Impact", "value": "Epoch-level information unavailable"},
                ],
            },
            diagnosis=(
                f"Subject {subj} has ARMCD '{armcd}' which does not exist in TA. "
                f"Cannot map to trial arm structure."
            ),
        ))
    return results


def _map_sd002(issue: dict, prefix: str) -> list[AffectedRecordResult]:
    """SD-002: Empty arms — TA ARMCD with no subjects."""
    armcd = issue.get("armcd", "")
    arm = issue.get("arm", "")

    return [AffectedRecordResult(
        issue_id="",
        rule_id=prefix,
        subject_id="--",
        visit="--",
        domain="TA",
        variable="ARMCD",
        actual_value=armcd,
        expected_value="At least one subject in DM",
        fix_tier=1,
        auto_fixed=False,
        evidence={
            "type": "metadata",
            "lines": [
                {"label": "ARMCD", "value": armcd},
                {"label": "ARM", "value": arm or "(no label)"},
                {"label": "Subjects in DM", "value": "0"},
            ],
        },
        diagnosis=(
            f"Arm '{armcd}' ({arm}) is defined in TA but has no subjects in DM. "
            "May be a TK satellite group or unused arm."
        ),
    )]


def _map_sd003(issue: dict, prefix: str) -> list[AffectedRecordResult]:
    """SD-003: Ambiguous control status."""
    variant = issue.get("variant", "")
    subjects = issue.get("subjects", [])
    arm = issue.get("arm", "")
    n = issue.get("n", len(subjects) if isinstance(subjects, list) else 0)

    if variant == "a":
        # Dose=0 but not flagged as control
        results = []
        for subj in (subjects if isinstance(subjects, list) else []):
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=prefix,
                subject_id=str(subj),
                visit="--",
                domain="DM",
                variable="IS_CONTROL",
                actual_value="DOSE=0, not flagged as control",
                expected_value="Control status consistent with dose",
                fix_tier=2,
                auto_fixed=False,
                evidence={
                    "type": "cross-domain",
                    "lines": [
                        {"label": "ARM", "value": arm},
                        {"label": "Dose", "value": "0"},
                        {"label": "Control flag", "value": "Not set"},
                    ],
                },
                diagnosis=(
                    f"Subject {subj} has dose=0 but arm '{arm}' does not indicate "
                    "control status. Verify whether this is a control subject."
                ),
            ))
        return results

    if variant == "b":
        # Control with non-zero dose
        dose = issue.get("dose", "")
        results = []
        for subj in (subjects if isinstance(subjects, list) else []):
            results.append(AffectedRecordResult(
                issue_id="",
                rule_id=prefix,
                subject_id=str(subj),
                visit="--",
                domain="DM",
                variable="IS_CONTROL",
                actual_value=f"Control with dose={dose}",
                expected_value="Control subjects should have dose=0",
                fix_tier=2,
                auto_fixed=False,
                evidence={
                    "type": "cross-domain",
                    "lines": [
                        {"label": "ARM", "value": arm},
                        {"label": "Dose", "value": str(dose)},
                        {"label": "Control flag", "value": "Set"},
                    ],
                },
                diagnosis=(
                    f"Subject {subj} in arm '{arm}' appears to be control but has "
                    f"non-zero dose ({dose}). Verify control group assignment."
                ),
            ))
        return results

    if variant == "c":
        # No control group detected
        return [AffectedRecordResult(
            issue_id="",
            rule_id=prefix,
            subject_id="--",
            visit="--",
            domain="DM",
            variable="IS_CONTROL",
            actual_value="No control group detected",
            expected_value="At least one control group",
            fix_tier=2,
            auto_fixed=False,
            evidence={
                "type": "cross-domain",
                "lines": [
                    {"label": "Control groups", "value": "None detected"},
                    {"label": "Impact", "value": "Comparative statistics unavailable"},
                ],
            },
            diagnosis=(
                "No control group detected. Comparative statistics (Dunnett's test, "
                "% vs control, effect size) are unavailable until a control group is assigned."
            ),
        )]

    return []


def _map_sd004(issue: dict, prefix: str) -> list[AffectedRecordResult]:
    """SD-004: Missing TS parameters."""
    missing = issue.get("missing", [])

    results = []
    for param in missing:
        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=prefix,
            subject_id="--",
            visit="--",
            domain="TS",
            variable="TSPARMCD",
            actual_value=f"(missing: {param})",
            expected_value="Required TS parameter",
            fix_tier=1,
            auto_fixed=False,
            evidence={
                "type": "missing-value",
                "variable": param,
                "derivation": "TS domain TSPARMCD",
            },
            diagnosis=f"Trial Summary (TS) is missing parameter '{param}'. Study metadata will be incomplete.",
        ))
    return results


def _map_sd005(issue: dict, prefix: str) -> list[AffectedRecordResult]:
    """SD-005: Dose inconsistency within subject."""
    subjects = issue.get("subjects", [])

    results = []
    for entry in subjects:
        usubjid = entry.get("usubjid", "")
        doses = entry.get("doses", [])
        unit = entry.get("unit", "")
        dose_str = ", ".join(str(d) for d in doses)

        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=prefix,
            subject_id=str(usubjid),
            visit="--",
            domain="EX",
            variable="EXDOSE",
            actual_value=f"Multiple doses: {dose_str} {unit}",
            expected_value="Single dose level per subject",
            fix_tier=2,
            auto_fixed=False,
            evidence={
                "type": "cross-domain",
                "lines": [
                    {"label": "Doses", "value": dose_str},
                    {"label": "Unit", "value": unit or "(not specified)"},
                    {"label": "Action taken", "value": "Max dose used for grouping"},
                ],
            },
            diagnosis=(
                f"Subject {usubjid} has multiple dose levels in EX ({dose_str} {unit}), "
                "suggesting dose escalation. Maximum dose used for group assignment."
            ),
        ))
    return results


def _map_sd006(issue: dict, prefix: str) -> list[AffectedRecordResult]:
    """SD-006: Orphaned sets — TX SETCD with no subjects."""
    setcd = issue.get("setcd", "")
    set_label = issue.get("set", "")

    return [AffectedRecordResult(
        issue_id="",
        rule_id=prefix,
        subject_id="--",
        visit="--",
        domain="TX",
        variable="SETCD",
        actual_value=setcd,
        expected_value="At least one subject in DM",
        fix_tier=1,
        auto_fixed=False,
        evidence={
            "type": "metadata",
            "lines": [
                {"label": "SETCD", "value": setcd},
                {"label": "SET", "value": set_label or "(no label)"},
                {"label": "Subjects in DM", "value": "0"},
            ],
        },
        diagnosis=(
            f"Trial set '{setcd}' ({set_label}) is defined in TX but has no subjects in DM."
        ),
    )]


def _map_sd007(issue: dict, prefix: str) -> list[AffectedRecordResult]:
    """SD-007: ARM/ARMCD mismatch across domains."""
    armcd = issue.get("armcd", "")
    dm_arm = issue.get("dm_arm", "")
    ta_arm = issue.get("ta_arm", "")
    subjects = issue.get("subjects", [])

    results = []
    for subj in subjects:
        results.append(AffectedRecordResult(
            issue_id="",
            rule_id=prefix,
            subject_id=str(subj),
            visit="--",
            domain="DM",
            variable="ARM",
            actual_value=f"DM: '{dm_arm}', TA: '{ta_arm}'",
            expected_value="Same ARM label in DM and TA",
            fix_tier=3,
            auto_fixed=False,
            evidence={
                "type": "cross-domain",
                "lines": [
                    {"label": "ARMCD", "value": armcd},
                    {"label": "DM.ARM", "value": dm_arm},
                    {"label": "TA.ARM", "value": ta_arm},
                ],
            },
            diagnosis=(
                f"ARMCD '{armcd}' has different ARM labels: DM says '{dm_arm}', "
                f"TA says '{ta_arm}'. This is a data integrity issue."
            ),
        ))
    return results
