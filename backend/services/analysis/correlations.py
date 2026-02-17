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
    endpoints: dict[str, list[dict]] = {}
    for f in findings:
        if f.get("data_type") != "continuous":
            continue
        if not f.get("raw_subject_values"):
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


def _endpoint_key(finding: dict) -> str:
    """Unique key for an endpoint regardless of sex."""
    return f"{finding['domain']}_{finding.get('test_code', '')}_{finding.get('day', '')}"


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
