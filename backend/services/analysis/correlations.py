"""Cross-endpoint Spearman correlations using individual animal data.

Correlations are computed on residualized values: each animal's measurement
minus its (dose_level, sex) group mean. This removes dose-driven trends so
the correlation reflects biological co-variation, not shared dose response.

Endpoints are grouped by organ_system (not specimen or domain) and pooled
across both sexes.
"""

from services.analysis.statistics import spearman_correlation


def compute_correlations(findings: list[dict], max_per_organ: int = 30) -> list[dict]:
    """Compute Spearman correlations between endpoints using individual animal data.

    Groups endpoints by organ_system. Uses residualized values (subtracting
    dose x sex group means) to remove dose trend and sex effects.
    Returns top ``max_per_organ`` per organ system to prevent any single
    system (e.g. hematologic with 150+ pairs) from crowding out others.
    """
    # 1. Collect continuous endpoints with subject-level data.
    #    An endpoint is identified by (domain, test_code, day) — sex is NOT part
    #    of the key so M and F findings for the same test are pooled.
    #    Derived endpoints (ratios/indices) are excluded — they create
    #    tautological correlations with their source components.
    endpoints: dict[str, list[dict]] = {}
    for f in findings:
        if f.get("data_type") != "continuous":
            continue
        if not f.get("raw_subject_values"):
            continue
        if f.get("is_derived"):
            continue
        key = _endpoint_key(f)
        endpoints.setdefault(key, []).append(f)

    # 2. Group endpoint keys by organ_system for pairing.
    by_organ: dict[str, list[str]] = {}
    for ep_key, ep_findings in endpoints.items():
        org = ep_findings[0].get("organ_system", "unknown")
        by_organ.setdefault(org, []).append(ep_key)

    correlations: list[dict] = []

    for organ, ep_keys in by_organ.items():
        if len(ep_keys) < 2:
            continue

        organ_corrs: list[dict] = []
        for i in range(len(ep_keys)):
            for j in range(i + 1, len(ep_keys)):
                result = _residualized_correlation(
                    endpoints[ep_keys[i]], endpoints[ep_keys[j]]
                )
                if result is None:
                    continue

                f1 = endpoints[ep_keys[i]][0]
                f2 = endpoints[ep_keys[j]][0]

                organ_corrs.append({
                    "endpoint_key_1": ep_keys[i],
                    "endpoint_key_2": ep_keys[j],
                    "endpoint_label_1": f1.get("endpoint_label", f1.get("finding", "")),
                    "endpoint_label_2": f2.get("endpoint_label", f2.get("finding", "")),
                    "finding_ids_1": [f["id"] for f in endpoints[ep_keys[i]]],
                    "finding_ids_2": [f["id"] for f in endpoints[ep_keys[j]]],
                    "endpoint_1": f1.get("finding", ""),
                    "endpoint_2": f2.get("finding", ""),
                    "domain_1": f1.get("domain", ""),
                    "domain_2": f2.get("domain", ""),
                    "organ_system": organ,
                    "rho": round(result["rho"], 4),
                    "p_value": round(result["p_value"], 6) if result["p_value"] is not None else None,
                    "n": result["n"],
                    "basis": "individual",
                })

        # Keep top N per organ system so no single system crowds out others
        organ_corrs.sort(key=lambda c: abs(c.get("rho", 0)), reverse=True)
        correlations.extend(organ_corrs[:max_per_organ])

    correlations.sort(key=lambda c: abs(c.get("rho", 0)), reverse=True)
    return correlations


def compute_syndrome_correlations(
    findings: list[dict],
    endpoint_labels: list[str],
) -> tuple[list[dict], list[dict]]:
    """Compute pairwise correlations among specified endpoints, ignoring organ boundaries.

    Returns (correlations, excluded_endpoints) where excluded_endpoints are
    endpoint_labels that couldn't participate (no individual data, < 10 subjects).
    """
    label_set = set(endpoint_labels)

    # 1. Collect continuous endpoints with subject-level data, scoped to requested labels
    endpoints: dict[str, list[dict]] = {}
    matched_labels: set[str] = set()
    for f in findings:
        label = f.get("endpoint_label", f.get("finding", ""))
        if label not in label_set:
            continue
        if f.get("data_type") != "continuous":
            continue
        if f.get("is_derived"):
            continue
        if not f.get("raw_subject_values"):
            matched_labels.add(label)  # found but no individual data
            continue
        key = _endpoint_key(f)
        endpoints.setdefault(key, []).append(f)
        matched_labels.add(label)

    # 2. Track which labels produced valid endpoint keys
    labels_with_keys: dict[str, str] = {}  # label -> endpoint_key
    for ep_key, ep_findings in endpoints.items():
        label = ep_findings[0].get("endpoint_label", ep_findings[0].get("finding", ""))
        labels_with_keys[label] = ep_key

    # 3. Compute all pairwise correlations (no organ grouping)
    ep_keys = list(endpoints.keys())
    correlations: list[dict] = []

    for i in range(len(ep_keys)):
        for j in range(i + 1, len(ep_keys)):
            result = _residualized_correlation(
                endpoints[ep_keys[i]], endpoints[ep_keys[j]]
            )
            if result is None:
                continue

            f1 = endpoints[ep_keys[i]][0]
            f2 = endpoints[ep_keys[j]][0]

            correlations.append({
                "endpoint_key_1": ep_keys[i],
                "endpoint_key_2": ep_keys[j],
                "endpoint_label_1": f1.get("endpoint_label", f1.get("finding", "")),
                "endpoint_label_2": f2.get("endpoint_label", f2.get("finding", "")),
                "finding_ids_1": [f["id"] for f in endpoints[ep_keys[i]]],
                "finding_ids_2": [f["id"] for f in endpoints[ep_keys[j]]],
                "endpoint_1": f1.get("finding", ""),
                "endpoint_2": f2.get("finding", ""),
                "domain_1": f1.get("domain", ""),
                "domain_2": f2.get("domain", ""),
                "rho": round(result["rho"], 4),
                "p_value": round(result["p_value"], 6) if result["p_value"] is not None else None,
                "n": result["n"],
                "basis": "individual",
            })

    # Determine which endpoint keys produced at least one valid correlation
    correlated_keys: set[str] = set()
    for c in correlations:
        correlated_keys.add(c["endpoint_key_1"])
        correlated_keys.add(c["endpoint_key_2"])
    insufficient_labels = {
        label for label, key in labels_with_keys.items()
        if key not in correlated_keys
    }

    # 4. Build excluded list
    excluded: list[dict] = []
    for label in endpoint_labels:
        if label not in matched_labels:
            # Not found at all (incidence-only or missing) — caller handles incidence exclusion
            continue
        if label not in labels_with_keys:
            excluded.append({
                "endpoint_label": label,
                "domain": _find_domain_for_label(findings, label),
                "reason": "no_individual_data",
            })
        elif label in insufficient_labels:
            excluded.append({
                "endpoint_label": label,
                "domain": _find_domain_for_label(findings, label),
                "reason": "insufficient_subjects",
            })

    correlations.sort(key=lambda c: abs(c.get("rho", 0)), reverse=True)
    return correlations, excluded


def _find_domain_for_label(findings: list[dict], label: str) -> str:
    """Find the domain code for an endpoint label."""
    for f in findings:
        if f.get("endpoint_label", f.get("finding", "")) == label:
            return f.get("domain", "")
    return ""


def _endpoint_key(finding: dict) -> str:
    """Unique key for an endpoint regardless of sex.

    Includes specimen when present (critical for OM where all findings share
    test_code='WEIGHT' but differ by organ specimen).
    """
    parts = [finding["domain"], finding.get("test_code", "")]
    specimen = finding.get("specimen")
    if specimen:
        parts.append(specimen)
    parts.append(str(finding.get("day", "")))
    return "_".join(parts)


def _residualized_correlation(
    findings_a: list[dict], findings_b: list[dict]
) -> dict | None:
    """Compute Spearman correlation on residualized individual animal values.

    For each endpoint, pool all findings (both sexes). For each animal,
    subtract its (dose_level, sex) group mean. Then correlate residuals
    across subjects that appear in both endpoints.
    """
    subj_resid_a = _subject_residuals(findings_a)
    subj_resid_b = _subject_residuals(findings_b)

    if not subj_resid_a or not subj_resid_b:
        return None

    common = sorted(set(subj_resid_a) & set(subj_resid_b))
    if len(common) < 10:
        return None

    vals_a = [subj_resid_a[s] for s in common]
    vals_b = [subj_resid_b[s] for s in common]

    result = spearman_correlation(vals_a, vals_b)
    if result["rho"] is None:
        return None

    return {"rho": result["rho"], "p_value": result["p_value"], "n": len(common)}


def _subject_residuals(findings: list[dict]) -> dict[str, float]:
    """Build {USUBJID: residualized_value} across all findings for an endpoint.

    Pools M and F findings. For each animal, the residual is its measured value
    minus the group mean for its (dose_level, sex) cell.
    """
    residuals: dict[str, float] = {}
    for f in findings:
        rsv_list = f.get("raw_subject_values", [])
        group_stats = f.get("group_stats", [])

        for dose_idx, gs in enumerate(group_stats):
            if dose_idx >= len(rsv_list):
                break
            group_mean = gs.get("mean")
            if group_mean is None:
                continue

            subj_vals = rsv_list[dose_idx]
            if not subj_vals:
                continue

            for subj_id, val in subj_vals.items():
                residuals[subj_id] = float(val) - group_mean

    return residuals
