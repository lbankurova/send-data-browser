"""Per-animal influence analysis.

Computes per-animal biological extremity (within-group |z|) and signal
instability (% endpoints where LOO ratio < 0.8) from existing pipeline
outputs.  Produces animal_influence.json consumed by the frontend
CohortInfluenceMap scatter and AnimalInfluencePanel dumbbell.

Data sources:
  - raw_subject_values on findings (per-subject values, pre-strip)
  - group_stats on findings (group mean, SD, N)
  - loo_per_subject on each pairwise entry (per-animal LOO ratios)
  - subject context DataFrame (IS_TK, IS_CONTROL, DOSE_GROUP_ORDER, SEX)
"""

from __future__ import annotations

from typing import Any


# ── Thresholds ───────────────────────────────────────────────────

DESTABILISING_LOO_THRESHOLD = 0.80  # ratio below this = destabilising
DESTABILISING_PCT_THRESHOLD = 30    # % endpoints -> alarm zone x-axis
BIO_EXTREMITY_Z_THRESHOLD = 1.3    # mean |z| -> alarm zone y-axis
ENDPOINT_DETAIL_Z_THRESHOLD = 0.8  # |z| filter for endpoint_details
MAD_FLOOR = 0.5                    # semi-quant MAD floor (grade units)
MIN_N_FOR_LOO = 3                  # below this, LOO is degenerate
MIN_N_FOR_RELIABLE_LOO = 5         # below this, LOO has masking effects


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

    # ── Collect per-animal-per-endpoint metrics ──────────────────
    # z_scores[uid][(endpoint_id, endpoint_name, domain, etype)] = z_raw
    # instability[uid][(endpoint_id, ...)] = (worst_ratio, loo_dose_group_label)
    z_scores: dict[str, dict[tuple, float]] = {}
    instability: dict[str, dict[tuple, tuple]] = {}
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

    # ── Assemble per-animal summaries ────────────────────────────
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

        # Signal instability
        if loo_confidence == "insufficient":
            pct_destabilising = None
            n_destabilising = None
            n_endpoints_with_loo = None
        else:
            n_endpoints_with_loo = len(uid_inst)
            n_destabilising = sum(
                1 for (ratio, _) in uid_inst.values()
                if ratio < DESTABILISING_LOO_THRESHOLD
            )
            pct_destabilising = (
                round(n_destabilising / n_endpoints_with_loo * 100, 1)
                if n_endpoints_with_loo > 0
                else None
            )

        # All endpoints this animal participates in
        all_ep_keys = set(uid_zs.keys()) | set(uid_inst.keys())
        n_endpoints_total = len(all_ep_keys)

        if n_endpoints_total == 0:
            continue  # no data for this animal

        # is_alarm: quadrant membership
        is_alarm = (
            pct_destabilising is not None
            and pct_destabilising > DESTABILISING_PCT_THRESHOLD
            and mean_bio_z > BIO_EXTREMITY_Z_THRESHOLD
        )

        # Terminal BW (from raw_subject_values of BW findings)
        terminal_bw = _get_terminal_bw(findings, uid)

        animal_rec = {
            "subject_id": uid,
            "group_id": meta["group_id"],
            "dose_level": meta["dose_level"],
            "sex": meta["sex"],
            "terminal_bw": terminal_bw,
            "is_control": meta["is_control"],
            "pct_destabilising": pct_destabilising,
            "mean_bio_z": mean_bio_z,
            "n_endpoints_total": n_endpoints_total,
            "n_endpoints_with_loo": n_endpoints_with_loo,
            "n_destabilising": n_destabilising,
            "is_alarm": is_alarm,
        }
        animals.append(animal_rec)

        # ── Endpoint details (pre-filtered, pre-sorted) ─────────
        details = _build_endpoint_details(
            uid, uid_zs, uid_inst, all_z_by_type, meta["is_control"],
        )
        if details:
            endpoint_details[uid] = details

    # Sort animals by alarm status desc, then pct_destabilising desc
    animals.sort(
        key=lambda a: (
            a["is_alarm"],
            a["pct_destabilising"] if a["pct_destabilising"] is not None else -1,
            a["mean_bio_z"],
        ),
        reverse=True,
    )

    return {
        "min_group_n": min_group_n,
        "loo_confidence": loo_confidence,
        "thresholds": {
            "destabilising_pct": DESTABILISING_PCT_THRESHOLD,
            "bio_extremity_z": BIO_EXTREMITY_Z_THRESHOLD,
        },
        "animals": animals,
        "endpoint_details": endpoint_details,
    }


# ── Helpers ──────────────────────────────────────────────────────


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
    dl_values: dict[int, list[float]] = {}

    for dose_idx, dose_dict in enumerate(rsv):
        if not isinstance(dose_dict, dict):
            continue
        for uid, val in dose_dict.items():
            if val is None or uid not in subj_meta:
                continue
            dl = subj_meta[uid]["dose_level"]
            dl_values.setdefault(dl, []).append(val)

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
    for dose_dict in rsv:
        if not isinstance(dose_dict, dict):
            continue
        for uid, val in dose_dict.items():
            if val is None or uid not in subj_meta:
                continue
            dl = subj_meta[uid]["dose_level"]
            stats = gs_map.get(dl)
            if stats is None:
                continue

            mean, sd, n, median = stats

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
    instability: dict[str, dict[tuple, tuple]],
) -> None:
    """Collect worst LOO ratio per animal from ALL pairwise comparisons."""
    for pw in pairwise:
        loo = pw.get("loo_per_subject")
        if not loo:
            continue
        pw_dl = pw.get("dose_level")
        pw_label = dg_map.get(int(pw_dl), {}).get("label", f"Dose {pw_dl}") if pw_dl is not None else "?"

        for uid, loo_data in loo.items():
            if uid not in subj_meta:
                continue
            ratio = loo_data.get("ratio") if isinstance(loo_data, dict) else None
            if ratio is None:
                continue

            existing = instability.get(uid, {}).get(endpoint_key)
            if existing is None or ratio < existing[0]:
                instability.setdefault(uid, {})[endpoint_key] = (ratio, pw_label)


def _build_endpoint_details(
    uid: str,
    uid_zs: dict[tuple, float],
    uid_inst: dict[tuple, tuple],
    all_z_by_type: dict[str, list[float]],
    is_control: bool,
) -> list[dict]:
    """Build pre-filtered, pre-sorted endpoint details for one animal."""
    all_keys = set(uid_zs.keys()) | set(uid_inst.keys())
    details: list[dict] = []

    for ep_key in all_keys:
        endpoint_id, endpoint_name, domain, etype = ep_key
        z_raw = uid_zs.get(ep_key)
        abs_z = abs(z_raw) if z_raw is not None else None
        inst_data = uid_inst.get(ep_key)
        ratio = inst_data[0] if inst_data else None
        loo_dose_group = inst_data[1] if inst_data else None

        # Pre-filter: |z| > 0.8 OR loo_ratio < 0.8
        z_pass = abs_z is not None and abs_z > ENDPOINT_DETAIL_Z_THRESHOLD
        loo_pass = ratio is not None and ratio < DESTABILISING_LOO_THRESHOLD
        if not z_pass and not loo_pass:
            continue

        # bio_norm: percentile rank of |z| within same endpoint type
        bio_norm = None
        if abs_z is not None and etype in all_z_by_type:
            pool = all_z_by_type[etype]
            if pool:
                n_below = sum(1 for v in pool if v < abs_z)
                bio_norm = round(n_below / len(pool) * 100, 0)

        # instability: (1 - ratio) * 100
        instability_pct = round((1.0 - ratio) * 100, 1) if ratio is not None else None

        # is_control_side: the LOO comparison involves the control group
        # True when the animal is in the control group
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
            "loo_ratio": round(ratio, 3) if ratio is not None else None,
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
