"""Generate provenance messages (Prov-001 to Prov-007) from enrichment results.

Provenance messages are transparency annotations that tell the user how the
enrichment layer interpreted the study data. They appear on the Study Summary
view below the study design table.
"""

from __future__ import annotations

import logging

import pandas as pd

logger = logging.getLogger(__name__)


def generate_provenance_messages(context_result: dict) -> list[dict]:
    """Evaluate Prov-001 through Prov-007 against the enrichment result.

    Args:
        context_result: Output from build_subject_context()

    Returns:
        List of provenance messages, each with:
        - rule_id: str (e.g., "Prov-001")
        - icon: "info" | "warning"
        - message: str
        - link_to_rule: str | None (SD-xxx rule ID for warning messages)
    """
    messages: list[dict] = []
    ctx = context_result["subject_context"]
    ts_meta = context_result["study_metadata"]
    dose_method = context_result["dose_method"]
    issues = context_result["issues"]
    hints = context_result.get("_provenance_hints", {})

    # Prov-001: Dose Source (always fires)
    messages.append(_prov_001(dose_method, hints))

    # Prov-002: Route Source (always fires)
    messages.append(_prov_002(hints, ts_meta, ctx))

    # Prov-003: TK Subjects Detected (conditional)
    msg = _prov_003(ctx)
    if msg:
        messages.append(msg)

    # Prov-004: Recovery Groups Detected (conditional)
    msg = _prov_004(ctx)
    if msg:
        messages.append(msg)

    # Prov-005: Dose Escalation Detected (conditional)
    msg = _prov_005(ctx, issues)
    if msg:
        messages.append(msg)

    # Prov-006: Control Group Identification (conditional)
    msg = _prov_006(ctx, issues)
    if msg:
        messages.append(msg)

    # Prov-007: Incomplete Metadata Fallbacks (conditional, may emit multiple)
    messages.extend(_prov_007(hints))

    logger.info("Generated %d provenance messages", len(messages))
    return messages


# ── Individual rule evaluators ───────────────────────────────────────────


def _prov_001(dose_method: str, hints: dict) -> dict:
    """Prov-001: Dose extraction method."""
    if dose_method == "EX":
        return {
            "rule_id": "Prov-001",
            "icon": "info",
            "message": "Dose values extracted from EX domain.",
            "link_to_rule": None,
        }
    if dose_method == "TX":
        return {
            "rule_id": "Prov-001",
            "icon": "info",
            "message": "Dose values derived from TX domain (EX not available).",
            "link_to_rule": None,
        }
    if dose_method == "ARM":
        return {
            "rule_id": "Prov-001",
            "icon": "warning",
            "message": "Dose values parsed from ARM labels (EX and TX not available). Verify accuracy.",
            "link_to_rule": "SD-003",
        }
    if dose_method == "MIXED":
        n_ex = hints.get("ex_subject_count", 0)
        n_other = hints.get("non_ex_subject_count", 0)
        return {
            "rule_id": "Prov-001",
            "icon": "info",
            "message": (
                f"Dose values extracted from EX domain for {n_ex} subjects; "
                f"derived from TX for {n_other} subjects."
            ),
            "link_to_rule": None,
        }
    # Fallback for unexpected method
    return {
        "rule_id": "Prov-001",
        "icon": "info",
        "message": f"Dose values resolved via {dose_method} method.",
        "link_to_rule": None,
    }


def _prov_002(hints: dict, ts_meta: dict, ctx: pd.DataFrame) -> dict:
    """Prov-002: Route source."""
    route_source = hints.get("route_source")

    if route_source == "EX":
        return {
            "rule_id": "Prov-002",
            "icon": "info",
            "message": "Route of administration from EX domain.",
            "link_to_rule": None,
        }
    if route_source == "TS":
        return {
            "rule_id": "Prov-002",
            "icon": "info",
            "message": "Route of administration from TS (TSPARMCD = ROUTE).",
            "link_to_rule": None,
        }
    # Check if we actually have route data from any source
    if "ROUTE" in ctx.columns and ctx["ROUTE"].notna().any():
        non_empty = ctx["ROUTE"].astype(str).str.strip().replace("", pd.NA).dropna()
        if len(non_empty) > 0:
            return {
                "rule_id": "Prov-002",
                "icon": "info",
                "message": "Route of administration from study data.",
                "link_to_rule": None,
            }
    return {
        "rule_id": "Prov-002",
        "icon": "info",
        "message": "Route of administration not specified in data. Set manually if needed.",
        "link_to_rule": None,
    }


def _prov_003(ctx: pd.DataFrame) -> dict | None:
    """Prov-003: TK subjects detected."""
    if "IS_TK" not in ctx.columns:
        return None
    tk_count = int(ctx["IS_TK"].sum())
    if tk_count == 0:
        return None
    return {
        "rule_id": "Prov-003",
        "icon": "info",
        "message": f"{tk_count} TK subject(s) detected and excluded from statistical analysis by default.",
        "link_to_rule": None,
    }


def _prov_004(ctx: pd.DataFrame) -> dict | None:
    """Prov-004: Recovery groups detected."""
    if "HAS_RECOVERY" not in ctx.columns:
        return None
    recovery_subjects = ctx[ctx["HAS_RECOVERY"] == True]  # noqa: E712
    if recovery_subjects.empty:
        return None
    n_arms = recovery_subjects["ARMCD"].nunique()
    return {
        "rule_id": "Prov-004",
        "icon": "info",
        "message": f"Recovery groups detected in {n_arms} arm(s). Recovery-phase data is analyzed separately.",
        "link_to_rule": None,
    }


def _prov_005(ctx: pd.DataFrame, issues: list[dict]) -> dict | None:
    """Prov-005: Dose escalation detected."""
    sd005 = [i for i in issues if i.get("rule") == "SD-005"]
    if sd005:
        n = sd005[0].get("n", 0)
    elif "DOSE_VARIES" in ctx.columns and ctx["DOSE_VARIES"].any():
        n = int(ctx["DOSE_VARIES"].sum())
    else:
        return None

    if n == 0:
        return None

    return {
        "rule_id": "Prov-005",
        "icon": "warning",
        "message": (
            f"{n} subject(s) have variable dosing across study. "
            "Maximum dose used for group assignment. "
            "Review EX domain for per-timepoint doses."
        ),
        "link_to_rule": "SD-005",
    }


def _prov_006(ctx: pd.DataFrame, issues: list[dict]) -> dict | None:
    """Prov-006: Control group identification."""
    if "IS_CONTROL" not in ctx.columns:
        return None

    control_subjects = ctx[ctx["IS_CONTROL"] == True]  # noqa: E712

    # No control detected
    if control_subjects.empty:
        return {
            "rule_id": "Prov-006",
            "icon": "warning",
            "message": (
                "No control group detected. Comparative statistics "
                "(Dunnett's test, % vs control, effect size) are unavailable "
                "until a control group is assigned."
            ),
            "link_to_rule": "SD-003",
        }

    # Multiple distinct control arms — but recovery arms share the same
    # vehicle as the main control (different sacrifice timepoint, not a
    # separate control group).  Only flag if there are multiple *main-study*
    # control arms.
    main_control = control_subjects
    if "HAS_RECOVERY" in ctx.columns:
        main_control = control_subjects[control_subjects["HAS_RECOVERY"] != True]  # noqa: E712
    control_arms = main_control["ARMCD"].unique()
    if len(control_arms) > 1:
        labels = []
        for armcd in control_arms:
            arm_rows = ctx[ctx["ARMCD"] == armcd]
            if "ARM" in ctx.columns and len(arm_rows) > 0:
                labels.append(str(arm_rows["ARM"].iloc[0]))
            else:
                labels.append(str(armcd))
        primary = labels[0]
        return {
            "rule_id": "Prov-006",
            "icon": "warning",
            "message": (
                f"{len(control_arms)} control groups detected: "
                f"{', '.join(labels)}. '{primary}' used as primary "
                "comparator for statistical tests."
            ),
            "link_to_rule": "SD-003",
        }

    # Check for SD-003 issues (ambiguous control)
    sd003_issues = [i for i in issues if i.get("rule") == "SD-003"]
    if sd003_issues:
        return {
            "rule_id": "Prov-006",
            "icon": "warning",
            "message": (
                "Control group identified from ARM label "
                "(no explicit control flag in EX/TX). Verify assignment."
            ),
            "link_to_rule": "SD-003",
        }

    # Single, clear control → no message per spec
    return None


def _prov_007(hints: dict) -> list[dict]:
    """Prov-007: Incomplete metadata fallbacks."""
    messages: list[dict] = []

    fallback_fields = {
        "species": "Species",
        "strain": "Strain",
    }

    for field_key, field_label in fallback_fields.items():
        source = hints.get(f"{field_key}_source")
        if source == "DM":
            messages.append({
                "rule_id": "Prov-007",
                "icon": "info",
                "message": f"{field_label} derived from DM (not present in TS).",
                "link_to_rule": None,
            })

    return messages
