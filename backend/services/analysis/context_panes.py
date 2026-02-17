"""Compute per-finding context pane payloads for the 5 info panes."""

from services.analysis.insights import (
    treatment_summary_insights,
    statistics_insights,
    dose_response_insights,
    correlations_insights,
    effect_size_insights,
    _interpret_effect_size_domain_aware,
)


def build_finding_context(finding: dict, all_findings: list[dict], correlations: list[dict], dose_groups: list[dict]) -> dict:
    """Build context pane data for a selected finding.

    Returns dict with 5 pane payloads:
    - treatment_summary
    - statistics
    - dose_response
    - correlations
    - effect_size
    """
    finding_id = finding.get("id", "")

    # 1. Treatment-Related Summary
    treatment_summary = _build_treatment_summary(finding, all_findings)
    treatment_summary["insights"] = treatment_summary_insights(finding, all_findings, dose_groups)

    # 2. Statistics pane
    statistics = _build_statistics(finding, dose_groups)
    statistics["insights"] = statistics_insights(finding, dose_groups)

    # 3. Dose-Response pane
    dose_response = _build_dose_response(finding, dose_groups)
    dose_response["insights"] = dose_response_insights(finding, dose_groups)

    # 4. Correlations pane
    corr_pane = _build_correlations(finding_id, finding, correlations)
    corr_pane["insights"] = correlations_insights(finding, corr_pane)

    # 5. Effect Size pane
    effect_size = _build_effect_size(finding, all_findings)
    effect_size["insights"] = effect_size_insights(finding, all_findings)

    return {
        "finding_id": finding_id,
        "treatment_summary": treatment_summary,
        "statistics": statistics,
        "dose_response": dose_response,
        "correlations": corr_pane,
        "effect_size": effect_size,
    }


def _build_treatment_summary(finding: dict, all_findings: list[dict]) -> dict:
    """Treatment-related summary pane."""
    severity = finding.get("severity", "normal")
    treatment_related = finding.get("treatment_related", False)

    # Count by severity across all findings
    severity_counts = {"adverse": 0, "warning": 0, "normal": 0}
    target_organs = set()
    for f in all_findings:
        sev = f.get("severity", "normal")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
        if f.get("treatment_related") and f.get("specimen"):
            target_organs.add(f["specimen"])

    # Convergent evidence: multiple domains showing effects for same organ
    specimen = finding.get("specimen")
    convergent = []
    if specimen:
        for f in all_findings:
            if f.get("specimen") == specimen and f.get("id") != finding.get("id") and f.get("severity") != "normal":
                convergent.append({
                    "finding_id": f.get("id", ""),
                    "domain": f.get("domain", ""),
                    "finding": f.get("finding", ""),
                    "severity": f.get("severity", "normal"),
                })

    return {
        "severity": severity,
        "treatment_related": treatment_related,
        "severity_counts": severity_counts,
        "target_organs": sorted(target_organs),
        "convergent_evidence": convergent[:10],
    }


def _build_statistics(finding: dict, dose_groups: list[dict]) -> dict:
    """Statistics pane: group comparison table."""
    group_stats = finding.get("group_stats", [])
    pairwise = finding.get("pairwise", [])
    data_type = finding.get("data_type", "continuous")

    # Build comparison rows
    rows = []
    for gs in group_stats:
        dl = gs.get("dose_level", 0)
        dg = next((d for d in dose_groups if d.get("dose_level") == dl), {})
        pw = next((p for p in pairwise if p.get("dose_level") == dl), None)

        row = {
            "dose_level": dl,
            "label": dg.get("label", f"Group {dl}"),
            "dose_value": dg.get("dose_value"),
            "dose_unit": dg.get("dose_unit"),
            "n": gs.get("n", 0),
        }

        if data_type == "continuous":
            row["mean"] = gs.get("mean")
            row["sd"] = gs.get("sd")
            row["median"] = gs.get("median")
        else:
            row["affected"] = gs.get("affected", 0)
            row["incidence"] = gs.get("incidence", 0)

        if pw:
            row["p_value"] = pw.get("p_value")
            row["p_value_adj"] = pw.get("p_value_adj")
            row["cohens_d"] = pw.get("cohens_d")
            row["odds_ratio"] = pw.get("odds_ratio")

        rows.append(row)

    return {
        "data_type": data_type,
        "rows": rows,
        "trend_p": finding.get("trend_p"),
        "trend_stat": finding.get("trend_stat"),
        "unit": finding.get("unit"),
    }


def _build_dose_response(finding: dict, dose_groups: list[dict]) -> dict:
    """Dose-response pane: bar chart data + pattern."""
    group_stats = finding.get("group_stats", [])
    data_type = finding.get("data_type", "continuous")

    bars = []
    for gs in group_stats:
        dl = gs.get("dose_level", 0)
        dg = next((d for d in dose_groups if d.get("dose_level") == dl), {})

        bar = {
            "dose_level": dl,
            "label": dg.get("label", f"Group {dl}"),
            "dose_value": dg.get("dose_value"),
        }

        if data_type == "continuous":
            bar["value"] = gs.get("mean")
            bar["sd"] = gs.get("sd")
        else:
            bar["value"] = gs.get("incidence", 0)
            bar["count"] = gs.get("affected", 0)
            bar["total"] = gs.get("n", 0)

        bars.append(bar)

    onset_dose_level = finding.get("onset_dose_level")
    onset_dg = next(
        (d for d in dose_groups if d.get("dose_level") == onset_dose_level), {}
    ) if onset_dose_level else {}

    return {
        "pattern": finding.get("dose_response_pattern", "unknown"),
        "direction": finding.get("direction"),
        "bars": bars,
        "trend_p": finding.get("trend_p"),
        "pattern_confidence": finding.get("pattern_confidence"),
        "onset_dose_value": onset_dg.get("dose_value") if onset_dose_level else None,
        "onset_dose_unit": onset_dg.get("dose_unit") if onset_dose_level else None,
    }


def _build_correlations(finding_id: str, finding: dict, correlations: list[dict]) -> dict:
    """Correlations pane: related findings.

    Matches by endpoint key (domain_testcode_day) so both M and F findings
    for the same endpoint see the same correlations.
    """
    ep_key = f"{finding.get('domain', '')}_{finding.get('test_code', '')}_{finding.get('day', '')}"
    sex = finding.get("sex")

    related = []
    for c in correlations:
        # Match by endpoint key (new) or finding_id list (new) or legacy finding_id (backward compat)
        is_side_1 = (
            c.get("endpoint_key_1") == ep_key
            or finding_id in c.get("finding_ids_1", [])
            or c.get("finding_id_1") == finding_id
        )
        is_side_2 = (
            c.get("endpoint_key_2") == ep_key
            or finding_id in c.get("finding_ids_2", [])
            or c.get("finding_id_2") == finding_id
        )

        if is_side_1:
            # Pick a finding_id from the other side, preferring same sex
            other_ids = c.get("finding_ids_2", [])
            other_id = c.get("finding_id_2", other_ids[0] if other_ids else "")
            related.append({
                "finding_id": other_id,
                "endpoint": c["endpoint_2"],
                "domain": c["domain_2"],
                "rho": c["rho"],
                "p_value": c["p_value"],
                "n": c.get("n"),
                "basis": c.get("basis"),
            })
        elif is_side_2:
            other_ids = c.get("finding_ids_1", [])
            other_id = c.get("finding_id_1", other_ids[0] if other_ids else "")
            related.append({
                "finding_id": other_id,
                "endpoint": c["endpoint_1"],
                "domain": c["domain_1"],
                "rho": c["rho"],
                "p_value": c["p_value"],
                "n": c.get("n"),
                "basis": c.get("basis"),
            })

    related.sort(key=lambda x: abs(x.get("rho", 0)), reverse=True)

    return {
        "related": related[:10],
        "total_correlations": len(correlations),
    }


def _build_effect_size(finding: dict, all_findings: list[dict]) -> dict:
    """Effect size pane: context for the selected finding's effect magnitude."""
    data_type = finding.get("data_type", "continuous")
    domain = finding.get("domain", "")

    # Collect all effect sizes
    all_effects = []
    for f in all_findings:
        es = f.get("max_effect_size")
        if es is not None:
            all_effects.append({
                "finding_id": f.get("id", ""),
                "finding": f.get("finding", ""),
                "domain": f.get("domain", ""),
                "effect_size": es,
                "data_type": f.get("data_type", "continuous"),
            })

    all_effects.sort(key=lambda x: abs(x.get("effect_size", 0)), reverse=True)

    # Current finding's effect — use domain-aware interpretation
    current_es = finding.get("max_effect_size")
    if data_type == "continuous":
        interpretation, _ = _interpret_effect_size_domain_aware(current_es, domain)
    else:
        interpretation = _interpret_effect_size_incidence(current_es)

    return {
        "current_effect_size": current_es,
        "data_type": data_type,
        "interpretation": interpretation,
        "largest_effects": all_effects[:10],
        "total_with_effects": len(all_effects),
    }


def _interpret_effect_size_incidence(d: float | None) -> str:
    """Interpret effect size for incidence data (avg severity score)."""
    if d is None:
        return "Not available"
    abs_d = abs(d)
    if abs_d < 1.5:
        return "Mild"
    if abs_d < 2.5:
        return "Moderate"
    return "Marked"
