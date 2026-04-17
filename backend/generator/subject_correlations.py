"""Pairwise endpoint correlations across subjects.

Produces subject_correlations.json with pairs of endpoints whose per-subject
values correlate (Spearman rho) at |rho| >= 0.5 and p < 0.05.
Consumed by the Cohort View context panel for endpoint co-occurrence insight.
"""
from __future__ import annotations

from scipy.stats import spearmanr


# Minimum overlap of subjects between two endpoints to compute correlation
_MIN_OVERLAP = 8
# Minimum absolute rho to include in output
_MIN_RHO = 0.5
# Maximum p-value to include
_MAX_P = 0.05


def build_subject_correlations(findings: list[dict]) -> dict:
    """Build pairwise endpoint correlations from raw_subject_values.

    ``findings`` must still contain raw_subject_values (call before stripping).
    """
    # Step 1: Extract per-endpoint subject value vectors
    endpoint_vectors: dict[str, dict[str, float]] = {}

    for f in findings:
        rsv = f.get("raw_subject_values")
        if not rsv:
            continue

        domain = f.get("domain", "")
        endpoint = f.get("endpoint_label", "")
        sex = f.get("sex", "")
        day = f.get("day")

        # Build a unique key for this endpoint-sex-day combination
        key = f"{domain}:{endpoint}:{sex}"
        if day is not None:
            key += f":{day}"

        # Flatten across dose groups: each dict in rsv maps USUBJID -> value
        vals: dict[str, float] = {}
        for grp in rsv:
            for uid, val in grp.items():
                if val is not None:
                    vals[uid] = val

        # Only keep endpoints with enough subjects
        if len(vals) >= _MIN_OVERLAP:
            # If duplicate key (different day), keep the one with more subjects
            if key not in endpoint_vectors or len(vals) > len(endpoint_vectors[key]):
                endpoint_vectors[key] = vals

    # Step 2: Compute pairwise Spearman correlations
    keys = sorted(endpoint_vectors.keys())
    pairs: list[dict] = []

    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            key_a = keys[i]
            key_b = keys[j]
            vals_a = endpoint_vectors[key_a]
            vals_b = endpoint_vectors[key_b]

            # Find common subjects
            common = set(vals_a.keys()) & set(vals_b.keys())
            if len(common) < _MIN_OVERLAP:
                continue

            # Extract aligned value arrays
            common_sorted = sorted(common)
            arr_a = [vals_a[uid] for uid in common_sorted]
            arr_b = [vals_b[uid] for uid in common_sorted]

            # Check for zero variance (spearmanr would return NaN)
            if len(set(arr_a)) < 2 or len(set(arr_b)) < 2:
                continue

            rho, p = spearmanr(arr_a, arr_b)

            if abs(rho) >= _MIN_RHO and p < _MAX_P:
                # Parse key parts for output
                parts_a = key_a.split(":")
                parts_b = key_b.split(":")
                pairs.append({
                    "ep_a": f"{parts_a[0]}:{parts_a[1]}",
                    "ep_b": f"{parts_b[0]}:{parts_b[1]}",
                    "sex": parts_a[2] if len(parts_a) > 2 else "",
                    "rho": round(rho, 3),
                    "p": round(p, 4),
                    "n": len(common),
                })

    # Sort by absolute rho descending
    pairs.sort(key=lambda x: abs(x["rho"]), reverse=True)

    return {
        "pairs": pairs,
        "meta": {
            "n_endpoints_analyzed": len(keys),
            "n_pairs_tested": len(keys) * (len(keys) - 1) // 2,
            "n_significant_pairs": len(pairs),
            "min_overlap": _MIN_OVERLAP,
            "min_rho": _MIN_RHO,
            "max_p": _MAX_P,
        },
    }
