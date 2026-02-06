"""Cross-finding Spearman correlations for findings sharing organ/system."""

import numpy as np
from services.analysis.statistics import spearman_correlation


def compute_correlations(findings: list[dict], max_pairs: int = 50) -> list[dict]:
    """Compute Spearman correlations between findings.

    Pairs findings by shared specimen/organ and same sex.
    Uses group means across dose levels as the correlation vector.
    Returns top `max_pairs` by absolute rho.
    """
    correlations = []

    # Index findings by (specimen, sex) for fast lookup
    by_organ_sex: dict[tuple, list[dict]] = {}
    for f in findings:
        spec = f.get("specimen") or f.get("domain", "")
        sex = f.get("sex", "")
        key = (spec, sex)
        by_organ_sex.setdefault(key, []).append(f)

    for key, group in by_organ_sex.items():
        if len(group) < 2:
            continue

        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                f1 = group[i]
                f2 = group[j]

                # Extract group means as vectors
                gs1 = f1.get("group_stats", [])
                gs2 = f2.get("group_stats", [])

                if f1.get("data_type") == "continuous":
                    vals1 = [g.get("mean") for g in gs1]
                else:
                    vals1 = [g.get("incidence", 0) for g in gs1]

                if f2.get("data_type") == "continuous":
                    vals2 = [g.get("mean") for g in gs2]
                else:
                    vals2 = [g.get("incidence", 0) for g in gs2]

                # Need at least 3 dose levels
                min_len = min(len(vals1), len(vals2))
                if min_len < 3:
                    continue

                vals1 = vals1[:min_len]
                vals2 = vals2[:min_len]

                # Skip if any None
                if any(v is None for v in vals1) or any(v is None for v in vals2):
                    continue

                result = spearman_correlation(vals1, vals2)
                if result["rho"] is not None:
                    correlations.append({
                        "finding_id_1": f1.get("id", ""),
                        "finding_id_2": f2.get("id", ""),
                        "endpoint_1": f1.get("finding", ""),
                        "endpoint_2": f2.get("finding", ""),
                        "domain_1": f1.get("domain", ""),
                        "domain_2": f2.get("domain", ""),
                        "specimen": key[0],
                        "sex": key[1],
                        "rho": round(result["rho"], 4),
                        "p_value": round(result["p_value"], 6) if result["p_value"] is not None else None,
                    })

    # Sort by absolute rho descending, take top N
    correlations.sort(key=lambda c: abs(c.get("rho", 0)), reverse=True)
    return correlations[:max_pairs]
