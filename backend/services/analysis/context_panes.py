"""Compute per-finding context pane payloads for the 5 info panes."""

from statistics import median

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

    result = {
        "finding_id": finding_id,
        "treatment_summary": treatment_summary,
        "statistics": statistics,
        "dose_response": dose_response,
        "correlations": corr_pane,
        "effect_size": effect_size,
    }

    # Sibling sex detection: same endpoint_label + day, different sex
    sibling_finding = next(
        (f for f in all_findings
         if f.get("endpoint_label") == finding.get("endpoint_label")
         and f.get("sex") != finding.get("sex")
         and f.get("day") == finding.get("day")),
        None
    )
    sibling_context = None
    if sibling_finding:
        sibling_context = {
            "finding_id": sibling_finding.get("id", ""),
            "sex": sibling_finding.get("sex"),
            "treatment_summary": _build_treatment_summary(sibling_finding, all_findings),
            "statistics": _build_statistics(sibling_finding, dose_groups),
            "dose_response": _build_dose_response(sibling_finding, dose_groups),
            "correlations": _build_correlations(sibling_finding.get("id", ""), sibling_finding, correlations),
            "effect_size": _build_effect_size(sibling_finding, all_findings),
        }
    result["sibling"] = sibling_context

    return result


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


def _build_stat_rows(group_stats: list, pairwise: list, data_type: str, dose_groups: list[dict]) -> list[dict]:
    """Build comparison rows from group_stats + pairwise lists."""
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
    return rows


def _build_statistics(finding: dict, dose_groups: list[dict]) -> dict:
    """Statistics pane: group comparison table."""
    data_type = finding.get("data_type", "continuous")

    rows = _build_stat_rows(
        finding.get("group_stats", []),
        finding.get("pairwise", []),
        data_type, dose_groups,
    )

    result = {
        "data_type": data_type,
        "rows": rows,
        "trend_p": finding.get("trend_p"),
        "trend_stat": finding.get("trend_stat"),
        "unit": finding.get("unit"),
    }

    # Build scheduled-only rows when dual-pass data exists
    if finding.get("scheduled_group_stats"):
        result["scheduled_rows"] = _build_stat_rows(
            finding["scheduled_group_stats"],
            finding.get("scheduled_pairwise", []),
            data_type, dose_groups,
        )
        result["n_excluded"] = finding.get("n_excluded", 0)

    return result


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
    """Correlations pane: related endpoints.

    Matches by endpoint key (domain_testcode_day) so both M and F findings
    for the same endpoint see the same correlations.

    Filters out same-endpoint_label autocorrelations (e.g. BW Day 8 ↔ BW Day 15)
    which are uninformative repeated-measure autocorrelations.
    """
    # Build endpoint key matching correlations._endpoint_key() — includes specimen when present
    parts = [finding.get("domain", ""), finding.get("test_code", "")]
    specimen = finding.get("specimen")
    if specimen:
        parts.append(specimen)
    parts.append(str(finding.get("day", "")))
    ep_key = "_".join(parts)
    my_label = finding.get("endpoint_label", finding.get("finding", ""))

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
            # Filter same-endpoint_label autocorrelations (same test, different day)
            other_label = c.get("endpoint_label_2", c.get("endpoint_2", ""))
            if other_label == my_label:
                continue
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
            other_label = c.get("endpoint_label_1", c.get("endpoint_1", ""))
            if other_label == my_label:
                continue
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
    """Effect size pane: endpoint-level ranking split by data type.

    Aggregates findings by endpoint_label, keeping only the peak effect per
    endpoint (max |effect_size| across all days and sexes). Preserves which
    day and sex produced the peak so the UI can show it.

    Returns separate ranked lists for continuous (Hedges' g) and incidence
    (severity score) endpoints — these scales are not comparable.
    """
    data_type = finding.get("data_type", "continuous")
    domain = finding.get("domain", "")
    my_label = finding.get("endpoint_label", finding.get("finding", ""))

    # Group findings by endpoint_label, keeping peak per endpoint
    by_endpoint: dict[str, dict] = {}
    for f in all_findings:
        es = f.get("max_effect_size")
        if es is None:
            continue
        label = f.get("endpoint_label", f.get("finding", ""))
        existing = by_endpoint.get(label)
        if existing is None or abs(es) > abs(existing["effect_size"]):
            by_endpoint[label] = {
                "finding_id": f.get("id", ""),
                "endpoint_label": label,
                "finding": f.get("finding", ""),
                "domain": f.get("domain", ""),
                "effect_size": es,
                "data_type": f.get("data_type", "continuous"),
                "peak_day": f.get("day"),
                "peak_sex": f.get("sex"),
            }

    # Split into continuous and incidence, rank each by |effect_size|
    continuous = sorted(
        [e for e in by_endpoint.values() if e["data_type"] == "continuous"],
        key=lambda x: abs(x["effect_size"]),
        reverse=True,
    )
    incidence = sorted(
        [e for e in by_endpoint.values() if e["data_type"] != "continuous"],
        key=lambda x: abs(x["effect_size"]),
        reverse=True,
    )

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
        "current_endpoint_label": my_label,
        "continuous_effects": continuous,
        "incidence_effects": incidence,
        "total_continuous": len(continuous),
        "total_incidence": len(incidence),
        # Backward compat: largest_effects as merged list (deprecated)
        "largest_effects": (continuous + incidence)[:10],
        "total_with_effects": len(by_endpoint),
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


# ─── Organ correlation matrix ─────────────────────────────


def build_organ_correlation_matrix(organ_key: str, correlations: list[dict]) -> dict:
    """Build correlation matrix for an organ system from precomputed correlations.

    Reshapes the flat list of pairwise correlations into an NxN lower-triangle
    matrix suitable for heatmap rendering. No new computation — purely a reshape.

    Endpoints are sorted by domain then alphabetically within domain so that
    biologically related endpoints (same domain) are visually adjacent.
    """
    organ_corrs = [
        c for c in correlations
        if c.get("organ_system", "").lower() == organ_key.lower()
        and c.get("basis") == "individual"
    ]

    if not organ_corrs:
        return {
            "organ_system": organ_key,
            "endpoints": [],
            "endpoint_domains": [],
            "matrix": [],
            "p_values": [],
            "n_values": [],
            "endpoint_finding_ids": [],
            "total_pairs": 0,
            "summary": {
                "median_abs_rho": 0.0,
                "strong_pairs": 0,
                "total_pairs": 0,
                "coherence_label": "Insufficient data",
            },
        }

    # Collect unique endpoints with their domain and finding_ids
    ep_info: dict[str, dict] = {}
    for c in organ_corrs:
        for side in (1, 2):
            label = c.get(f"endpoint_label_{side}", c.get(f"endpoint_{side}", ""))
            if label and label not in ep_info:
                ep_info[label] = {
                    "domain": c.get(f"domain_{side}", ""),
                    "finding_ids": c.get(f"finding_ids_{side}", []),
                }

    # Sort by domain then alphabetically within domain
    sorted_labels = sorted(ep_info.keys(), key=lambda lbl: (ep_info[lbl]["domain"], lbl))

    n = len(sorted_labels)
    label_idx = {lbl: i for i, lbl in enumerate(sorted_labels)}

    # Build lower-triangle matrices
    rho_matrix: list[list[float | None]] = [[None] * n for _ in range(n)]
    p_matrix: list[list[float | None]] = [[None] * n for _ in range(n)]
    n_matrix: list[list[int | None]] = [[None] * n for _ in range(n)]

    for c in organ_corrs:
        lbl1 = c.get("endpoint_label_1", c.get("endpoint_1", ""))
        lbl2 = c.get("endpoint_label_2", c.get("endpoint_2", ""))
        if lbl1 not in label_idx or lbl2 not in label_idx:
            continue
        i, j = label_idx[lbl1], label_idx[lbl2]
        # Ensure lower triangle: row > col
        if i < j:
            i, j = j, i
        rho_matrix[i][j] = c.get("rho")
        p_matrix[i][j] = c.get("p_value")
        n_matrix[i][j] = c.get("n")

    # Summary stats
    abs_rhos = [abs(c["rho"]) for c in organ_corrs if c.get("rho") is not None]
    strong = sum(1 for r in abs_rhos if r >= 0.7)
    total = len(abs_rhos)
    med = median(abs_rhos) if abs_rhos else 0.0

    if total < 2:
        coherence = "Insufficient data"
    elif med >= 0.7:
        coherence = "Highly coherent"
    elif med >= 0.4:
        coherence = "Moderately coherent"
    else:
        coherence = "Fragmented"

    return {
        "organ_system": organ_key,
        "endpoints": sorted_labels,
        "endpoint_domains": [ep_info[lbl]["domain"] for lbl in sorted_labels],
        "matrix": rho_matrix,
        "p_values": p_matrix,
        "n_values": n_matrix,
        "endpoint_finding_ids": [ep_info[lbl]["finding_ids"] for lbl in sorted_labels],
        "total_pairs": total,
        "summary": {
            "median_abs_rho": round(med, 3),
            "strong_pairs": strong,
            "total_pairs": total,
            "coherence_label": coherence,
        },
    }
