"""Per-animal influence analysis.

Computes per-animal biological extremity (within-group |z|) and signal
instability (mean instability across all pairwise LOO comparisons) from
existing pipeline outputs.  Produces animal_influence.json consumed by
the frontend CohortInfluenceMap scatter and AnimalInfluencePanel dumbbell.

Data sources:
  - raw_subject_values on findings (per-subject values, pre-strip)
  - group_stats on findings (group mean, SD, N)
  - loo_per_subject on each pairwise entry (per-animal LOO ratios)
  - subject context DataFrame (IS_TK, IS_CONTROL, DOSE_GROUP_ORDER, SEX)
"""

from __future__ import annotations

from typing import Any


# ── Thresholds ───────────────────────────────────────────────────

DESTABILISING_LOO_THRESHOLD = 0.80  # ratio below this = destabilising (endpoint detail filter)
BIO_EXTREMITY_Z_THRESHOLD = 1.3    # mean |z| -> alarm zone y-axis
ENDPOINT_DETAIL_Z_THRESHOLD = 0.8  # |z| filter for endpoint_details
MAD_FLOOR = 0.5                    # semi-quant MAD floor (grade units)
MIN_N_FOR_LOO = 3                  # below this, LOO is degenerate
MIN_N_FOR_RELIABLE_LOO = 5         # below this, LOO has masking effects
INSTABILITY_FLOOR = 0.10           # adaptive threshold never drops below this
MIN_N_FOR_ADAPTIVE_THRESHOLD = 15  # need >= 15 animals for p90 to be distributional


def build_animal_influence(
    findings: list[dict],
    subjects_df: "pandas.DataFrame",  # noqa: F821 — lazy import
    dose_groups: list[dict],
) -> dict:
    """Build per-animal influence metrics from pipeline findings.

    Args:
        findings: Raw findings list (pre-strip, has raw_subject_values).
        subjects_df: Subject context DataFrame with USUBJID, SEX, DOSE_GROUP_ORDER,
            IS_TK, IS_CONTROL, STUDY_PHASE columns.
        dose_groups: Dose group metadata list from dg_data["dose_groups"].

    Returns:
        Dict with animals list, endpoint_details, thresholds, and confidence.
    """
    import pandas as pd  # noqa: F811

    # ── Build subject lookup ─────────────────────────────────────
    # Exclude TK satellites and recovery-only animals
    mask = ~subjects_df["IS_TK"]
    if "STUDY_PHASE" in subjects_df.columns:
        mask = mask & (subjects_df["STUDY_PHASE"] != "Recovery")
    eligible = subjects_df[mask].copy()

    subj_meta: dict[str, dict] = {}
    for _, row in eligible.iterrows():
        uid = str(row["USUBJID"])
        subj_meta[uid] = {
            "subject_id": uid,
            "sex": str(row.get("SEX", "")),
            "dose_level": int(row.get("DOSE_GROUP_ORDER", -1)),
            "is_control": bool(row.get("IS_CONTROL", False)),
        }

    # Map dose_level -> group info
    dg_map: dict[int, dict] = {}
    for dg in dose_groups:
        dg_map[int(dg["dose_level"])] = dg

    # Assign group_id from dose group label
    for uid, meta in subj_meta.items():
        dl = meta["dose_level"]
        dg = dg_map.get(dl, {})
        meta["group_id"] = dg.get("label", f"Dose {dl}")

    # ── Compute per-sex min_group_n ──────────────────────────────
    min_group_n = _compute_min_group_n(eligible, dose_groups)

    if min_group_n < MIN_N_FOR_LOO:
        loo_confidence = "insufficient"
    elif min_group_n < MIN_N_FOR_RELIABLE_LOO:
        loo_confidence = "low"
    else:
        loo_confidence = "adequate"

    # ── Collect per-animal-per-endpoint metrics ───────���──────────
    # z_scores[uid][(endpoint_id, endpoint_name, domain, etype)] = z_raw
    # instability[uid][(endpoint_id, ...)] = {dose_level: ratio}
    z_scores: dict[str, dict[tuple, float]] = {}
    instability: dict[str, dict[tuple, dict[int, float]]] = {}
    endpoint_types: dict[tuple, str] = {}  # endpoint_key -> type

    for f in findings:
        domain = f.get("domain", "")
        # Skip incidence-only findings for z-scores (no meaningful z)
        # but include for instability if they have LOO data
        is_incidence = domain in ("MI", "MA")
        test_code = f.get("test_code", "")
        specimen = f.get("specimen") or ""
        sex = f.get("sex", "")
        day = f.get("day")

        endpoint_id = _make_endpoint_id(domain, test_code, specimen, sex, day)
        endpoint_name = _make_endpoint_name(f)
        etype = "incidence" if is_incidence else _classify_endpoint_type(f)
        endpoint_key = (endpoint_id, endpoint_name, domain, etype)
        endpoint_types[endpoint_key] = etype

        # ── Z-scores from raw_subject_values ─────────────────────
        if not is_incidence:
            rsv = f.get("raw_subject_values")
            group_stats = f.get("group_stats", [])
            if rsv and group_stats:
                _collect_z_scores(
                    rsv, group_stats, subj_meta, endpoint_key, etype,
                    z_scores,
                )

        # ── Instability from ALL pairwise LOO ratios ────────────
        if loo_confidence != "insufficient":
            pairwise = f.get("pairwise", [])
            _collect_instability(
                pairwise, subj_meta, endpoint_key, dg_map, instability,
            )

    # ── Assemble per-animal summaries ────��───────────────────────
    # Collect all |z| values for percentile rank computation
    all_z_by_type: dict[str, list[float]] = {"continuous": [], "semiquant": []}
    for uid, ep_zs in z_scores.items():
        for ep_key, z_val in ep_zs.items():
            etype = ep_key[3]
            if etype in all_z_by_type:
                all_z_by_type[etype].append(abs(z_val))

    animals: list[dict] = []
    endpoint_details: dict[str, list[dict]] = {}

    for uid, meta in subj_meta.items():
        uid_zs = z_scores.get(uid, {})
        uid_inst = instability.get(uid, {})

        # Mean |z| across all endpoints with valid z
        abs_zs = [abs(z) for z in uid_zs.values()]
        mean_bio_z = round(sum(abs_zs) / len(abs_zs), 2) if abs_zs else 0.0

        # Signal instability (mean across pairwise, then across endpoints)
        if loo_confidence == "insufficient":
            mean_instability = None
            max_endpoint_instability = None
            n_endpoints_with_loo = None
            n_pairwise_k = 0
            instability_by_dose: dict = {}
            worst_dose_level = None
            endpoint_coverage_flag = False
        else:
            n_endpoints_with_loo = len(uid_inst)
            # Number of distinct dose levels in comparisons
            all_dose_levels: set[int] = set()
            for ep_ratios in uid_inst.values():
                all_dose_levels.update(ep_ratios.keys())
            n_pairwise_k = len(all_dose_levels)

            # Per-endpoint mean ratio (mean across pairwise dose comparisons)
            mean_ratios_per_ep: dict[tuple, float] = {}
            for ep_key, dose_ratios in uid_inst.items():
                mean_ratios_per_ep[ep_key] = sum(dose_ratios.values()) / len(dose_ratios)

            if mean_ratios_per_ep:
                avg_mean_ratio = sum(mean_ratios_per_ep.values()) / len(mean_ratios_per_ep)
                mean_instability = round(max(0.0, 1.0 - avg_mean_ratio), 4)
                max_endpoint_instability = round(
                    max(1.0 - r for r in mean_ratios_per_ep.values()), 4,
                )
            else:
                mean_instability = None
                max_endpoint_instability = None

            # Per-dose stability vector
            instability_by_dose = _aggregate_by_dose(uid_inst)

            # Worst dose level (lowest mean_ratio)
            if instability_by_dose:
                worst_dose_level = min(
                    instability_by_dose, key=lambda dl: instability_by_dose[dl]["mean_ratio"],
                )
            else:
                worst_dose_level = None

            # Endpoint coverage flag: dual gate (R1 F4)
            if len(instability_by_dose) >= 2:
                n_eps = [v["n_endpoints"] for v in instability_by_dose.values()]
                max_n, min_n = max(n_eps), min(n_eps)
                endpoint_coverage_flag = (
                    (max_n - min_n >= 3) and (min_n > 0 and max_n / min_n > 1.3)
                )
            else:
                endpoint_coverage_flag = False

        # All endpoints this animal participates in
        all_ep_keys = set(uid_zs.keys()) | set(uid_inst.keys())
        n_endpoints_total = len(all_ep_keys)

        if n_endpoints_total == 0:
            continue  # no data for this animal

        # Terminal BW (from raw_subject_values of BW findings)
        terminal_bw = _get_terminal_bw(findings, uid)

        animal_rec = {
            "subject_id": uid,
            "group_id": meta["group_id"],
            "dose_level": meta["dose_level"],
            "sex": meta["sex"],
            "terminal_bw": terminal_bw,
            "is_control": meta["is_control"],
            "mean_instability": mean_instability,
            "max_endpoint_instability": max_endpoint_instability,
            "n_pairwise_k": n_pairwise_k,
            "mean_bio_z": mean_bio_z,
            "n_endpoints_total": n_endpoints_total,
            "n_endpoints_with_loo": n_endpoints_with_loo,
            "is_alarm": False,  # set after adaptive threshold computation
            "instability_by_dose": instability_by_dose,
            "worst_dose_level": worst_dose_level,
            "endpoint_coverage_flag": endpoint_coverage_flag,
        }
        animals.append(animal_rec)

        # ── Endpoint details (pre-filtered, pre-sorted) ────���────
        details = _build_endpoint_details(
            uid, uid_zs, uid_inst, all_z_by_type, meta["is_control"], dg_map,
        )
        if details:
            endpoint_details[uid] = details

    # ── Adaptive alarm threshold (Feature 3) ────────────────────
    non_null = [a["mean_instability"] for a in animals if a["mean_instability"] is not None]
    if len(non_null) >= MIN_N_FOR_ADAPTIVE_THRESHOLD:
        import numpy as np
        p90 = float(np.percentile(non_null, 90))
        instability_threshold = round(max(p90, INSTABILITY_FLOOR), 4)
    else:
        instability_threshold = INSTABILITY_FLOOR

    # Apply is_alarm with adaptive threshold
    for a in animals:
        a["is_alarm"] = (
            a["mean_instability"] is not None
            and a["mean_instability"] > instability_threshold
            and a["mean_bio_z"] > BIO_EXTREMITY_Z_THRESHOLD
        )

    # Sort animals by alarm status desc, then mean_instability desc
    animals.sort(
        key=lambda a: (
            a["is_alarm"],
            a["mean_instability"] if a["mean_instability"] is not None else -1,
            a["mean_bio_z"],
        ),
        reverse=True,
    )

    return {
        "min_group_n": min_group_n,
        "loo_confidence": loo_confidence,
        "thresholds": {
            "instability": instability_threshold,
            "bio_extremity_z": BIO_EXTREMITY_Z_THRESHOLD,
        },
        "animals": animals,
        "endpoint_details": endpoint_details,
    }


# ── Helpers ──────────────────────────────────────────────────────


def iter_subject_values(
    rsv: list,
    subj_meta: dict[str, dict],
) -> dict[int, list[tuple[str, float]]]:
    """Traverse raw_subject_values and collect per-dose-level (uid, value) pairs.

    Shared between animal_influence and subject_sentinel.  Filters to
    eligible subjects (those present in subj_meta) and skips None values.

    Returns:
        dict mapping dose_level -> [(uid, value), ...].
    """
    dl_values: dict[int, list[tuple[str, float]]] = {}
    for dose_dict in rsv:
        if not isinstance(dose_dict, dict):
            continue
        for uid, val in dose_dict.items():
            if val is None or uid not in subj_meta:
                continue
            dl = subj_meta[uid]["dose_level"]
            dl_values.setdefault(dl, []).append((uid, val))
    return dl_values


def _compute_min_group_n(
    eligible: "pandas.DataFrame",  # noqa: F821
    dose_groups: list[dict],
) -> int:
    """Compute minimum per-sex N across all dose groups."""
    min_n = 999
    for dg in dose_groups:
        dl = int(dg["dose_level"])
        grp = eligible[eligible["DOSE_GROUP_ORDER"] == dl]
        for sex in ("M", "F"):
            n = int((grp["SEX"] == sex).sum())
            if n > 0:
                min_n = min(min_n, n)
    return min_n if min_n < 999 else 0


def _classify_endpoint_type(finding: dict) -> str:
    """Classify a non-incidence finding as continuous or semiquant.

    Note: MI/MA findings are classified as incidence at the call site and
    never reach this function.  Only continuous-domain findings (LB, BW,
    OM, CL, FW) are routed here.
    """
    test_code = finding.get("test_code", "")
    if "severity" in test_code.lower():
        return "semiquant"
    return "continuous"


def _make_endpoint_id(
    domain: str, test_code: str, specimen: str, sex: str, day: Any,
) -> str:
    """Build a unique endpoint identifier."""
    parts = [domain.lower(), test_code.lower()]
    if specimen:
        parts.append(specimen.lower())
    if sex:
        parts.append(sex.lower())
    if day is not None:
        parts.append(f"d{day}")
    return ":".join(parts)


def _make_endpoint_name(finding: dict) -> str:
    """Build a human-readable endpoint name."""
    domain = finding.get("domain", "")
    # Use finding-level label if present
    label = finding.get("endpoint_label") or finding.get("finding") or ""
    if label:
        return label
    test_code = finding.get("test_code", "")
    specimen = finding.get("specimen") or ""
    if specimen:
        return f"{test_code} ({specimen})"
    return test_code or f"{domain} endpoint"


def _collect_z_scores(
    rsv: list,
    group_stats: list[dict],
    subj_meta: dict[str, dict],
    endpoint_key: tuple,
    etype: str,
    z_scores: dict[str, dict[tuple, float]],
) -> None:
    """Compute within-group z-scores from raw_subject_values."""
    # Build group-level stats lookup: dose_level -> (mean, sd, n)
    gs_map: dict[int, tuple] = {}
    for gs in group_stats:
        dl = gs.get("dose_level")
        if dl is not None:
            mean = gs.get("mean")
            sd = gs.get("sd")
            n = gs.get("n", 0)
            median = gs.get("median")
            gs_map[int(dl)] = (mean, sd, n, median)

    # Build per-dose-level subject values for MAD computation
    uid_dl_values = iter_subject_values(rsv, subj_meta)
    dl_values: dict[int, list[float]] = {
        dl: [v for _, v in pairs] for dl, pairs in uid_dl_values.items()
    }

    # Compute MAD per group for semi-quant
    mad_map: dict[int, float] = {}
    if etype == "semiquant":
        for dl, vals in dl_values.items():
            if len(vals) < 2:
                mad_map[dl] = MAD_FLOOR
                continue
            vals_sorted = sorted(vals)
            n = len(vals_sorted)
            med = vals_sorted[n // 2] if n % 2 == 1 else (vals_sorted[n // 2 - 1] + vals_sorted[n // 2]) / 2
            deviations = [abs(v - med) for v in vals]
            deviations.sort()
            m = len(deviations)
            mad = deviations[m // 2] if m % 2 == 1 else (deviations[m // 2 - 1] + deviations[m // 2]) / 2
            mad_map[dl] = max(mad, MAD_FLOOR)

    # Compute z-scores
    for dl, uid_vals in uid_dl_values.items():
        stats = gs_map.get(dl)
        if stats is None:
            continue
        mean, sd, n, median = stats
        for uid, val in uid_vals:

            if etype == "semiquant":
                # Use MAD-based z-score
                mad = mad_map.get(dl, MAD_FLOOR)
                center = median if median is not None else (mean if mean is not None else 0)
                z = (val - center) / mad if mad > 0 else 0.0
            else:
                # Standard z-score
                if mean is None:
                    continue
                if n <= 1 or sd is None or sd == 0:
                    z = 0.0  # N=1: animal IS the mean
                else:
                    z = (val - mean) / sd

            z_scores.setdefault(uid, {})[endpoint_key] = z


def _collect_instability(
    pairwise: list[dict],
    subj_meta: dict[str, dict],
    endpoint_key: tuple,
    dg_map: dict[int, dict],
    instability: dict[str, dict[tuple, dict[int, float]]],
) -> None:
    """Collect ALL pairwise LOO ratios per animal per endpoint per dose level."""
    for pw in pairwise:
        loo = pw.get("loo_per_subject")
        if not loo:
            continue
        pw_dl = pw.get("dose_level")
        if pw_dl is None:
            continue
        pw_dl_int = int(pw_dl)

        for uid, loo_data in loo.items():
            if uid not in subj_meta:
                continue
            ratio = loo_data.get("ratio") if isinstance(loo_data, dict) else None
            if ratio is None:
                continue

            uid_data = instability.setdefault(uid, {})
            ep_data = uid_data.setdefault(endpoint_key, {})
            # Keep worst ratio per dose level for this endpoint
            if pw_dl_int not in ep_data or ratio < ep_data[pw_dl_int]:
                ep_data[pw_dl_int] = ratio


def _aggregate_by_dose(
    uid_inst: dict[tuple, dict[int, float]],
) -> dict[int, dict]:
    """Aggregate per-endpoint LOO ratios into per-dose stability summary."""
    dose_ratios: dict[int, list[float]] = {}
    for ep_ratios in uid_inst.values():
        for dl, ratio in ep_ratios.items():
            dose_ratios.setdefault(dl, []).append(ratio)
    result: dict[int, dict] = {}
    for dl, ratios in dose_ratios.items():
        result[dl] = {
            "mean_ratio": round(sum(ratios) / len(ratios), 4),
            "n_endpoints": len(ratios),
        }
    return result


def _build_endpoint_details(
    uid: str,
    uid_zs: dict[tuple, float],
    uid_inst: dict[tuple, dict[int, float]],
    all_z_by_type: dict[str, list[float]],
    is_control: bool,
    dg_map: dict[int, dict],
) -> list[dict]:
    """Build pre-filtered, pre-sorted endpoint details for one animal."""
    all_keys = set(uid_zs.keys()) | set(uid_inst.keys())
    details: list[dict] = []

    for ep_key in all_keys:
        endpoint_id, endpoint_name, domain, etype = ep_key
        z_raw = uid_zs.get(ep_key)
        abs_z = abs(z_raw) if z_raw is not None else None
        dose_ratios = uid_inst.get(ep_key)  # {dose_level: ratio} or None

        # Compute mean_ratio and worst_ratio from all pairwise ratios
        if dose_ratios:
            mean_ratio = sum(dose_ratios.values()) / len(dose_ratios)
            worst_ratio = min(dose_ratios.values())
            worst_dl = min(dose_ratios, key=dose_ratios.get)  # type: ignore[arg-type]
            worst_dose_level = worst_dl
            loo_dose_group = dg_map.get(worst_dl, {}).get("label", f"Dose {worst_dl}")
        else:
            mean_ratio = None
            worst_ratio = None
            worst_dose_level = None
            loo_dose_group = None

        # Pre-filter: |z| > 0.8 OR worst_ratio < 0.8
        z_pass = abs_z is not None and abs_z > ENDPOINT_DETAIL_Z_THRESHOLD
        loo_pass = worst_ratio is not None and worst_ratio < DESTABILISING_LOO_THRESHOLD
        if not z_pass and not loo_pass:
            continue

        # bio_norm: percentile rank of |z| within same endpoint type
        bio_norm = None
        if abs_z is not None and etype in all_z_by_type:
            pool = all_z_by_type[etype]
            if pool:
                n_below = sum(1 for v in pool if v < abs_z)
                bio_norm = round(n_below / len(pool) * 100, 0)

        # instability: based on mean_ratio (consistent with mean_instability)
        instability_pct = round((1.0 - mean_ratio) * 100, 1) if mean_ratio is not None else None

        # is_control_side: the LOO comparison involves the control group
        is_control_side = is_control

        # alarm_score: sorting heuristic
        bn = bio_norm if bio_norm is not None else 0
        ip = instability_pct if instability_pct is not None else 0
        alarm_score = round(bn + ip, 1)

        details.append({
            "endpoint_id": endpoint_id,
            "endpoint_name": endpoint_name,
            "endpoint_type": etype,
            "domain": domain,
            "bio_z_raw": round(abs_z, 2) if abs_z is not None else None,
            "bio_norm": bio_norm,
            "instability": instability_pct,
            "loo_ratios_by_dose": {dl: round(r, 4) for dl, r in dose_ratios.items()} if dose_ratios else {},
            "mean_ratio": round(mean_ratio, 4) if mean_ratio is not None else None,
            "worst_ratio": round(worst_ratio, 3) if worst_ratio is not None else None,
            "worst_dose_level": worst_dose_level,
            "loo_dose_group": loo_dose_group,
            "is_control_side": is_control_side,
            "alarm_score": alarm_score,
        })

    # Sort by alarm_score descending
    details.sort(key=lambda d: d["alarm_score"], reverse=True)
    return details


def _get_terminal_bw(findings: list[dict], uid: str) -> float | None:
    """Extract terminal body weight for a subject from BW findings."""
    best_day = -1
    best_val = None
    for f in findings:
        if f.get("domain") != "BW":
            continue
        day = f.get("day")
        if day is None:
            continue
        rsv = f.get("raw_subject_values")
        if not rsv:
            continue
        for dose_dict in rsv:
            if not isinstance(dose_dict, dict):
                continue
            val = dose_dict.get(uid)
            if val is not None and day > best_day:
                best_day = day
                best_val = round(val, 1)
    return best_val
