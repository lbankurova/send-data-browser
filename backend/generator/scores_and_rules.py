"""Signal scores, rule engine, and adversity determination.

Evaluates 19 canonical rules and emits structured rule results.
"""

import logging
from collections import defaultdict

from services.analysis.clinical_catalog import apply_clinical_layer

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

    # Effect magnitude rules (domain-aware label via effect_size_label)
    {"id": "R10", "scope": "endpoint", "severity": "warning",
     "condition": "large_effect",
     "template": "{endpoint_label}: {effect_metric} = {effect_size:.2f} at high dose in {sex}."},
    {"id": "R11", "scope": "endpoint", "severity": "info",
     "condition": "moderate_effect",
     "template": "{endpoint_label}: {effect_metric} = {effect_size:.2f} at high dose."},

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

    # R18/R19 protective rules — removed. Now emitted as synthetic rule_results
    # from protective_syndromes.py output via _emit_protective_rule_results().
    # Placeholder entries retained for index stability (RULES[17], RULES[18]
    # are never referenced after this change — all R18/R19 emission is synthetic).
]


def _emit_protective_rule_results(
    protective_syndromes: dict,
) -> list[dict]:
    """Convert protective syndrome matches to synthetic R18/R19 rule_results.

    R18/R19 are emitted for backward compatibility with frontend consumers.
    R20-R25 are stored in protective_syndromes[] only (no synthetic results
    until frontend display definitions are added).
    """
    results = []
    matches = protective_syndromes.get("protective_syndromes", [])

    for match in matches:
        sid = match.get("syndromeId", "")
        # Only R18 and R19 get synthetic rule_results
        if sid not in ("R18", "R19"):
            continue

        tier = match.get("evidence_tier", "inference")
        endpoints = match.get("matched_endpoints", [])

        # Build params dict matching the existing R18/R19 contract
        # consumed by rule-synthesis.ts and rule-definitions.ts.
        # Populate ctrl_pct/high_pct from the inference gate if available,
        # otherwise leave as "" (no incidence data for continuous-only rules).
        params = {
            "ctrl_pct": "",
            "high_pct": "",
            "protective_excluded": False,
            "evidence_tier": tier,
            "source": "S11_protective",
            "syndrome_name": match.get("name", ""),
            "matched_domains": match.get("matched_domains", []),
            "confidence_ceiling": match.get("confidence_ceiling", "MODERATE"),
        }

        if tier == "descriptive_only":
            params["qualifier"] = match.get("qualifier", "")

        # Gate result params (inference tier)
        gate = (match.get("inference_gate") or [None])[0]
        if gate and gate.get("passes"):
            params["ctrl_pct"] = str(gate.get("ctrl_incidence_pct", ""))
            params["high_pct"] = str(gate.get("treat_incidence_pct", ""))
            params["boschloo_p"] = gate.get("boschloo_p")
            params["bayesian_p_less"] = gate.get("bayesian_p_less")
            params["spared_cases"] = gate.get("spared_cases")

        sex = endpoints[0].get("sex", "") if endpoints else ""
        finding_label = endpoints[0].get("endpoint_label", "") if endpoints else ""
        specimen = endpoints[0].get("specimen", "") if endpoints else ""

        severity = "info"
        if sid == "R18":
            condition = "histo_incidence_decrease"
            template = (
                f"Protective pattern: {match.get('name', '')} detected "
                f"in {sex}. Evidence tier: {tier}."
            )
        else:
            condition = "potential_protective_effect"
            template = (
                f"Protective pattern: {match.get('name', '')} detected "
                f"in {sex}. Evidence tier: {tier}."
            )

        result = {
            "rule_id": sid,
            "scope": "endpoint",
            "severity": severity,
            "condition": condition,
            "message": template,
            "context_key": f"{finding_label}_{specimen}_{sex}",
            "endpoint_label": finding_label,
            "specimen": specimen,
            "sex": sex,
            "domain": endpoints[0].get("domain", "") if endpoints else "",
            "params": params,
            "evidence_tier": tier,
            "source": "S11_protective",
        }
        results.append(result)

    return results


def evaluate_rules(
    findings: list[dict],
    target_organs: list[dict],
    noael_summary: list[dict],
    dose_groups: list[dict],
    protective_syndromes: dict | None = None,
    study_context: dict | None = None,
) -> list[dict]:
    """Evaluate all rules against findings and return structured results.

    Args:
        study_context: passthrough to `apply_clinical_layer` for F9 HCD wiring.
            Supported keys: species, strain, study_start_year,
            duration_category, enable_alpha_cell_scaling.
    """
    results = []
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}

    for finding in findings:
        ctx = _build_finding_context(finding, dose_label_map)

        # R01: Treatment-related
        if finding.get("treatment_related"):
            results.append(_emit(RULES[0], ctx, finding,
                                 params={"pattern": finding.get("dose_response_pattern", "")}))

        # R02: Significant pairwise
        for pw in finding.get("pairwise", []):
            p = pw.get("p_value_adj", pw.get("p_value"))
            if p is not None and p < 0.05:
                pw_ctx = {**ctx, "dose_label": dose_label_map.get(pw["dose_level"], ""),
                          "p_value": p, "effect_size": pw.get("effect_size", 0) or 0}
                results.append(_emit(RULES[1], pw_ctx, finding))

        # R03: Significant trend
        if finding.get("trend_p") is not None and finding["trend_p"] < 0.05:
            results.append(_emit(RULES[2], {**ctx, "trend_p": finding["trend_p"]}, finding))

        # R04: Adverse severity
        if finding.get("severity") == "adverse":
            best_p = finding.get("min_p_adj", 0) or 0
            fc = finding.get("finding_class")
            r04_params = {}
            if fc is not None:
                r04_params["finding_class"] = fc
                if fc != "tr_adverse":
                    r04_params["finding_class_disagrees"] = True
            results.append(_emit(RULES[3], {**ctx, "p_value": best_p}, finding,
                                 params=r04_params))

        # R05-R07: Dose-response patterns
        pattern = finding.get("dose_response_pattern", "")
        if pattern in ("monotonic_increase", "monotonic_decrease"):
            results.append(_emit(RULES[4], {**ctx, "pattern": pattern}, finding,
                                 params={"pattern": pattern}))
        elif pattern == "threshold":
            results.append(_emit(RULES[5], ctx, finding))
        elif pattern == "non_monotonic":
            results.append(_emit(RULES[6], ctx, finding))

        # R10-R11: Effect magnitude (continuous domains only -- Hedges' g fallback).
        # For MI, max_effect_size is avg_severity (1-5) not Hedges' g -- skip magnitude rules.
        # For MA/CL/TF/DS, max_effect_size is None -- already skipped.
        #
        # F5 rewire (species-magnitude-thresholds-dog-nhp Phase B): R10 fires
        # when the FCT verdict is adverse/strong_adverse; R11 when verdict is
        # concern. When no FCT entry exists for the endpoint (verdict=
        # 'provisional' with coverage='none'), fall back to the legacy |g|
        # gates (|g|>=1.0 R10; |g|>=0.5 R11) so non-OM behavior is preserved
        # pending per-domain FCT population. Rule payload threads the
        # uncertainty-first fields (coverage/fallback_used/provenance/
        # entry_ref) regardless of which path fired.
        from services.analysis.send_knowledge import get_effect_size as _get_es
        es = _get_es(finding)
        if es is not None:
            gs_r10 = finding.get("group_stats", [])
            n_aff = sum(g.get("affected", 0) for g in gs_r10 if g.get("dose_level", 0) > 0)
            verdict = finding.get("verdict")
            coverage = finding.get("coverage") or "none"
            fct_fires_r10 = verdict in ("adverse", "strong_adverse") and coverage != "none"
            fct_fires_r11 = verdict == "concern" and coverage != "none"
            fct_reliance_extra = {
                "fct_coverage": coverage,
                "fct_fallback_used": finding.get("fallback_used"),
                "fct_provenance": finding.get("provenance"),
                "fct_entry_ref": finding.get("entry_ref"),
                "fct_verdict": verdict,
            }

            fires_r10 = fct_fires_r10 or (not fct_fires_r10 and coverage == "none" and abs(es) >= 1.0)
            fires_r11 = (not fires_r10) and (
                fct_fires_r11 or (coverage == "none" and 0.5 <= abs(es) < 1.0)
            )

            if fires_r10:
                extra = {"effect_size": es, "n_affected": n_aff, **fct_reliance_extra}
                if n_aff <= 1:
                    # Dampen: single-animal finding -- mathematically correct but
                    # statistically meaningless, so downgrade to info severity
                    dampened_rule = {**RULES[9], "severity": "info"}
                    extra["dampened"] = True
                    extra["dampening_reason"] = "single_affected"
                    results.append(_emit(dampened_rule, {**ctx, "effect_size": es}, finding,
                                         params=extra))
                else:
                    results.append(_emit(RULES[9], {**ctx, "effect_size": es}, finding,
                                         params=extra))
            elif fires_r11:
                r11_params = {"effect_size": es, "n_affected": n_aff, **fct_reliance_extra}
                results.append(_emit(RULES[10], {**ctx, "effect_size": es}, finding,
                                     params=r11_params))

        # R12-R13: Histopathology — incidence increase / severity increase
        if finding.get("domain") in ("MI", "MA", "CL"):
            if finding.get("direction") == "up" and finding.get("severity") != "normal":
                results.append(_emit(RULES[11], ctx, finding))
            if finding.get("dose_response_pattern") in ("monotonic_increase", "threshold"):
                if finding.get("avg_severity") is not None:
                    results.append(_emit(RULES[12], ctx, finding))

            # R18/R19 protective detection moved to protective_syndromes.py.
            # Synthetic rule_results are emitted by _emit_protective_rule_results().

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
            results.append(_emit_organ(RULES[8], organ_ctx,
                                       params={"n_endpoints": organ["n_endpoints"],
                                               "n_domains": organ["n_domains"],
                                               "domains": organ["domains"]}))

        # R16: Correlated findings
        organ_findings = [f for f in findings if f.get("organ_system") == organ["organ_system"]]
        if len(organ_findings) >= 2:
            labels = sorted(set(f.get("endpoint_label", "") for f in organ_findings))[:5]
            results.append(_emit_organ(RULES[15], {
                **organ_ctx, "endpoint_labels": ", ".join(labels)
            }, params={"endpoint_labels": labels}))

    # NOAEL rules (R14, R15) — with derivation trace (IMP-10)
    for noael_row in noael_summary:
        sex = noael_row["sex"]
        if noael_row["noael_dose_level"] is not None:
            noael_params = {
                "noael_label": noael_row["noael_label"],
                "noael_dose_value": noael_row.get("noael_dose_value", ""),
                "noael_dose_unit": noael_row.get("noael_dose_unit", ""),
                "noael_derivation": noael_row.get("noael_derivation"),
            }
            results.append(_emit_study(RULES[13], {
                "sex": sex,
                "noael_label": noael_row["noael_label"],
                "noael_dose_value": noael_row.get("noael_dose_value", ""),
                "noael_dose_unit": noael_row.get("noael_dose_unit", ""),
            }, params=noael_params))
        else:
            noael_params_ne = {
                "noael_derivation": noael_row.get("noael_derivation"),
            }
            results.append(_emit_study(RULES[14], {"sex": sex}, params=noael_params_ne))

    # R17: Mortality signal (DS domain)
    for finding in findings:
        if finding.get("domain") == "DS" and finding.get("test_code") == "MORTALITY":
            count = finding.get("mortality_count", 0)
            if count > 0:
                results.append(_emit_study(RULES[16], {
                    "sex": finding.get("sex", ""),
                    "count": count,
                }, params={"count": count}))

    # Emit synthetic R18/R19 rule_results from protective syndrome matches
    if protective_syndromes:
        results.extend(_emit_protective_rule_results(protective_syndromes))

    results = _apply_suppressions(results)
    results = apply_clinical_layer(results, findings, study_context=study_context)
    return results


def _apply_suppressions(results: list[dict]) -> list[dict]:
    """Remove contradictory/redundant rule results.

    Suppression rules (grouped by context_key):
    - R01 present → suppress R07 (treatment significance subsumes pattern diagnostic)
    - R04 present → suppress R01, R03 (adverse classification subsumes trend tests)
    """
    by_context = defaultdict(list)
    for r in results:
        by_context[r["context_key"]].append(r)

    suppressed_indices = set()
    for ctx_rules in by_context.values():
        ids = {r["rule_id"] for r in ctx_rules}

        if "R01" in ids and "R07" in ids:
            for r in ctx_rules:
                if r["rule_id"] == "R07":
                    suppressed_indices.add(id(r))

        if "R04" in ids:
            for r in ctx_rules:
                if r["rule_id"] in ("R01", "R03"):
                    suppressed_indices.add(id(r))

    return [r for r in results if id(r) not in suppressed_indices]


def _build_finding_context(finding: dict, dose_label_map: dict) -> dict:
    """Build template context from finding dict."""
    from services.analysis.send_knowledge import effect_size_label
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
        "effect_size": (finding.get("max_effect_size") or finding.get("avg_severity") or 0),
        "effect_metric": effect_size_label(finding),
        "trend_p": finding.get("trend_p", 0) or 0,
    }


def _emit(rule: dict, ctx: dict, finding: dict, params=None) -> dict:
    """Emit a rule result for an endpoint-scoped rule."""
    try:
        text = rule["template"].format(**ctx)
    except (KeyError, ValueError) as e:
        logger.warning("Template error in rule %s: %s", rule["id"], e)
        text = rule["template"]

    # Base params — available for all endpoint-scoped rules
    gs = finding.get("group_stats", [])
    n_affected_treated = sum(g.get("affected", 0) for g in gs if g.get("dose_level", 0) > 0)
    max_n = max((g.get("n", 0) for g in gs), default=0)

    base = {
        "endpoint_label": finding.get("endpoint_label", ""),
        "domain": finding.get("domain", ""),
        "test_code": finding.get("test_code", ""),
        "sex": finding.get("sex", ""),
        "direction": finding.get("direction", ""),
        "specimen": finding.get("specimen"),
        "finding": finding.get("finding", ""),
        "data_type": finding.get("data_type", ""),
        "dose_response_pattern": finding.get("dose_response_pattern", ""),
        "severity_class": finding.get("severity", ""),
        "treatment_related": finding.get("treatment_related", False),
        "p_value": finding.get("min_p_adj"),
        "trend_p": finding.get("trend_p"),
        "effect_size": finding.get("max_effect_size") or finding.get("avg_severity"),
        "n_affected": n_affected_treated,
        "max_n": max_n,
    }
    merged = {**base, **(params or {})}

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
        "params": merged,
    }


def _emit_organ(rule: dict, ctx: dict, params=None) -> dict:
    """Emit a rule result for an organ-scoped rule."""
    try:
        text = rule["template"].format(**ctx)
    except (KeyError, ValueError) as e:
        logger.warning("Template error in rule %s: %s", rule["id"], e)
        text = rule["template"]

    base = {"organ_system": ctx.get("organ_system", "")}
    merged = {**base, **(params or {})}

    return {
        "rule_id": rule["id"],
        "scope": rule["scope"],
        "severity": rule["severity"],
        "context_key": f"organ_{ctx.get('organ_system', '')}",
        "organ_system": ctx.get("organ_system", ""),
        "output_text": text,
        "evidence_refs": [],
        "params": merged,
    }


def _emit_study(rule: dict, ctx: dict, params=None) -> dict:
    """Emit a rule result for a study-scoped rule."""
    try:
        text = rule["template"].format(**ctx)
    except (KeyError, ValueError) as e:
        logger.warning("Template error in rule %s: %s", rule["id"], e)
        text = rule["template"]

    base = {"sex": ctx.get("sex", "")}
    merged = {**base, **(params or {})}

    return {
        "rule_id": rule["id"],
        "scope": rule["scope"],
        "severity": rule["severity"],
        "context_key": f"study_{ctx.get('sex', 'Combined')}",
        "organ_system": "",
        "output_text": text,
        "evidence_refs": [],
        "params": merged,
    }
