"""Signal scores, rule engine, and adversity determination.

Evaluates 16 canonical rules and emits structured rule results.
"""

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


RULES = [
    # Treatment-related rules
    {"id": "R01", "scope": "endpoint", "severity": "info",
     "condition": "treatment_related",
     "template": "{endpoint_label}: significant dose-dependent {direction} in {sex} ({pattern})."},
    {"id": "R02", "scope": "endpoint", "severity": "info",
     "condition": "significant_pairwise",
     "template": "Significant pairwise difference at {dose_label} (p={p_value:.4f}, d={effect_size:.2f})."},
    {"id": "R03", "scope": "endpoint", "severity": "info",
     "condition": "significant_trend",
     "template": "Significant dose-response trend (p={trend_p:.4f})."},
    {"id": "R04", "scope": "endpoint", "severity": "warning",
     "condition": "adverse_severity",
     "template": "{endpoint_label} classified as adverse in {sex} (p={p_value:.4f})."},

    # Dose-response pattern rules
    {"id": "R05", "scope": "endpoint", "severity": "info",
     "condition": "monotonic_pattern",
     "template": "{endpoint_label}: {pattern} across dose groups in {sex}."},
    {"id": "R06", "scope": "endpoint", "severity": "info",
     "condition": "threshold_pattern",
     "template": "{endpoint_label}: threshold pattern in {sex}."},
    {"id": "R07", "scope": "endpoint", "severity": "info",
     "condition": "non_monotonic",
     "template": "{endpoint_label}: inconsistent dose-response in {sex}."},

    # Target organ rules
    {"id": "R08", "scope": "organ", "severity": "warning",
     "condition": "target_organ",
     "template": "Convergent evidence from {n_domains} domains ({domains})."},
    {"id": "R09", "scope": "organ", "severity": "info",
     "condition": "multi_domain_evidence",
     "template": "{n_endpoints} endpoints across {domains}."},

    # Effect magnitude rules
    {"id": "R10", "scope": "endpoint", "severity": "warning",
     "condition": "large_effect",
     "template": "{endpoint_label}: Cohen's d = {effect_size:.2f} at high dose in {sex}."},
    {"id": "R11", "scope": "endpoint", "severity": "info",
     "condition": "moderate_effect",
     "template": "{endpoint_label}: Cohen's d = {effect_size:.2f} at high dose."},

    # Histopathology rules
    {"id": "R12", "scope": "endpoint", "severity": "warning",
     "condition": "histo_incidence_increase",
     "template": "Increased incidence of {finding} in {specimen} at high dose ({sex})."},
    {"id": "R13", "scope": "endpoint", "severity": "info",
     "condition": "severity_grade_increase",
     "template": "{finding} in {specimen}: dose-dependent severity increase."},

    # NOAEL rules
    {"id": "R14", "scope": "study", "severity": "info",
     "condition": "noael_established",
     "template": "NOAEL at {noael_label} ({noael_dose_value} {noael_dose_unit}) for {sex}."},
    {"id": "R15", "scope": "study", "severity": "warning",
     "condition": "noael_not_established",
     "template": "NOAEL not established for {sex} \u2014 adverse effects at lowest dose tested."},

    # Correlation rules
    {"id": "R16", "scope": "organ", "severity": "info",
     "condition": "correlated_findings",
     "template": "{endpoint_labels} show convergent pattern."},

    # Mortality rule
    {"id": "R17", "scope": "study", "severity": "critical",
     "condition": "mortality_signal",
     "template": "{count} deaths in {sex}, dose-dependent pattern."},
]


def evaluate_rules(
    findings: list[dict],
    target_organs: list[dict],
    noael_summary: list[dict],
    dose_groups: list[dict],
) -> list[dict]:
    """Evaluate all rules against findings and return structured results."""
    results = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}

    for finding in findings:
        ctx = _build_finding_context(finding, dose_label_map)

        # R01: Treatment-related
        if finding.get("treatment_related"):
            results.append(_emit(RULES[0], ctx, finding))

        # R02: Significant pairwise
        for pw in finding.get("pairwise", []):
            p = pw.get("p_value_adj", pw.get("p_value"))
            if p is not None and p < 0.05:
                pw_ctx = {**ctx, "dose_label": dose_label_map.get(pw["dose_level"], ""),
                          "p_value": p, "effect_size": pw.get("cohens_d", 0) or 0}
                results.append(_emit(RULES[1], pw_ctx, finding))

        # R03: Significant trend
        if finding.get("trend_p") is not None and finding["trend_p"] < 0.05:
            results.append(_emit(RULES[2], {**ctx, "trend_p": finding["trend_p"]}, finding))

        # R04: Adverse severity
        if finding.get("severity") == "adverse":
            best_p = finding.get("min_p_adj", 0) or 0
            results.append(_emit(RULES[3], {**ctx, "p_value": best_p}, finding))

        # R05-R07: Dose-response patterns
        pattern = finding.get("dose_response_pattern", "")
        if pattern in ("monotonic_increase", "monotonic_decrease"):
            results.append(_emit(RULES[4], {**ctx, "pattern": pattern}, finding))
        elif pattern == "threshold":
            results.append(_emit(RULES[5], ctx, finding))
        elif pattern == "non_monotonic":
            results.append(_emit(RULES[6], ctx, finding))

        # R10-R11: Effect magnitude
        es = finding.get("max_effect_size")
        if es is not None:
            if abs(es) >= 1.0:
                results.append(_emit(RULES[9], {**ctx, "effect_size": es}, finding))
            elif abs(es) >= 0.5:
                results.append(_emit(RULES[10], {**ctx, "effect_size": es}, finding))

        # R12-R13: Histopathology
        if finding.get("domain") in ("MI", "MA", "CL"):
            if finding.get("direction") == "up" and finding.get("severity") != "normal":
                results.append(_emit(RULES[11], ctx, finding))
            if finding.get("dose_response_pattern") in ("monotonic_increase", "threshold"):
                if finding.get("avg_severity") is not None:
                    results.append(_emit(RULES[12], ctx, finding))

    # Target organ rules (R08, R09, R16)
    for organ in target_organs:
        organ_ctx = {
            "organ_system": organ["organ_system"],
            "n_domains": organ["n_domains"],
            "domains": ", ".join(organ["domains"]),
            "n_endpoints": organ["n_endpoints"],
        }
        if organ.get("target_organ_flag"):
            results.append(_emit_organ(RULES[7], organ_ctx))
        if organ["n_domains"] >= 2:
            results.append(_emit_organ(RULES[8], organ_ctx))

        # R16: Correlated findings
        organ_findings = [f for f in findings if f.get("organ_system") == organ["organ_system"]]
        if len(organ_findings) >= 2:
            labels = sorted(set(f.get("endpoint_label", "") for f in organ_findings))[:5]
            results.append(_emit_organ(RULES[15], {
                **organ_ctx, "endpoint_labels": ", ".join(labels)
            }))

    # NOAEL rules (R14, R15)
    for noael_row in noael_summary:
        sex = noael_row["sex"]
        if noael_row["noael_dose_level"] is not None:
            results.append(_emit_study(RULES[13], {
                "sex": sex,
                "noael_label": noael_row["noael_label"],
                "noael_dose_value": noael_row.get("noael_dose_value", ""),
                "noael_dose_unit": noael_row.get("noael_dose_unit", ""),
            }))
        else:
            results.append(_emit_study(RULES[14], {"sex": sex}))

    # R17: Mortality signal (DS domain)
    for finding in findings:
        if finding.get("domain") == "DS" and finding.get("test_code") == "MORTALITY":
            count = finding.get("mortality_count", 0)
            if count > 0:
                results.append(_emit_study(RULES[16], {
                    "sex": finding.get("sex", ""),
                    "count": count,
                }))

    return results


def _build_finding_context(finding: dict, dose_label_map: dict) -> dict:
    """Build template context from finding dict."""
    return {
        "endpoint_label": finding.get("endpoint_label", ""),
        "domain": finding.get("domain", ""),
        "test_code": finding.get("test_code", ""),
        "sex": finding.get("sex", ""),
        "direction": finding.get("direction", ""),
        "pattern": finding.get("dose_response_pattern", ""),
        "severity": finding.get("severity", ""),
        "specimen": finding.get("specimen", ""),
        "finding": finding.get("finding", ""),
        "organ_system": finding.get("organ_system", ""),
        "p_value": finding.get("min_p_adj", 0) or 0,
        "effect_size": finding.get("max_effect_size", 0) or 0,
        "trend_p": finding.get("trend_p", 0) or 0,
    }


def _emit(rule: dict, ctx: dict, finding: dict) -> dict:
    """Emit a rule result for an endpoint-scoped rule."""
    try:
        text = rule["template"].format(**ctx)
    except (KeyError, ValueError) as e:
        logger.warning("Template error in rule %s: %s", rule["id"], e)
        text = rule["template"]

    return {
        "rule_id": rule["id"],
        "scope": rule["scope"],
        "severity": rule["severity"],
        "context_key": f"{finding.get('domain')}_{finding.get('test_code')}_{finding.get('sex')}",
        "organ_system": finding.get("organ_system", ""),
        "output_text": text,
        "evidence_refs": [
            f"{finding.get('domain')}: {finding.get('endpoint_label', '')} ({finding.get('sex', '')})"
        ],
    }


def _emit_organ(rule: dict, ctx: dict) -> dict:
    """Emit a rule result for an organ-scoped rule."""
    try:
        text = rule["template"].format(**ctx)
    except (KeyError, ValueError) as e:
        logger.warning("Template error in rule %s: %s", rule["id"], e)
        text = rule["template"]

    return {
        "rule_id": rule["id"],
        "scope": rule["scope"],
        "severity": rule["severity"],
        "context_key": f"organ_{ctx.get('organ_system', '')}",
        "organ_system": ctx.get("organ_system", ""),
        "output_text": text,
        "evidence_refs": [],
    }


def _emit_study(rule: dict, ctx: dict) -> dict:
    """Emit a rule result for a study-scoped rule."""
    try:
        text = rule["template"].format(**ctx)
    except (KeyError, ValueError) as e:
        logger.warning("Template error in rule %s: %s", rule["id"], e)
        text = rule["template"]

    return {
        "rule_id": rule["id"],
        "scope": rule["scope"],
        "severity": rule["severity"],
        "context_key": f"study_{ctx.get('sex', 'Combined')}",
        "organ_system": "",
        "output_text": text,
        "evidence_refs": [],
    }
