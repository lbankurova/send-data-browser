"""Per-animal sentinel annotations: outlier detection + cross-domain concordance.

Computes per-animal statistical outlier flags, per-organ concordance (POC),
cross-organ concordance (COC), and incidence influence annotations.  Produces
subject_sentinel.json consumed by the frontend CohortView sentinel overlays.

Annotation-only at S01/S02 layer -- MUST NOT modify S10 signal scores.
LOO owns score modification for fragility.

Data sources:
  - raw_subject_values on findings (per-subject values, pre-strip)
  - group_stats on findings (group mean, SD, N)
  - pairwise entries on findings (p-values for BW significance check)
  - subject context DataFrame (IS_TK, IS_CONTROL, DOSE_GROUP_ORDER, SEX)
  - early_death_subjects dict (USUBJID -> DSDECOD)
  - compound_class profile (for stress heuristic gate)
"""

from __future__ import annotations

import math
from typing import Any

from generator.animal_influence import iter_subject_values
from generator.organ_map import get_organ_system
from services.analysis.send_knowledge import BIOMARKER_MAP
from services.analysis.statistics import qn_scale, hamada_studentized_residuals


# ── Thresholds ───────────────────────────────────────────────────

OUTLIER_Z_THRESHOLD = 3.5       # |z| above this -> outlier flag (Iglewicz & Hoaglin)
CONCORDANCE_Z_THRESHOLD = 2.0   # |z| above this -> concordance evidence
POC_DOMAIN_THRESHOLD = 2        # domains required per organ for POC
COC_ORGAN_THRESHOLD = 2         # organ systems required for COC >= 2

# Right-skewed endpoints requiring log-transform before z-scoring.
# Well-established in tox literature (Hubert & Van der Veeken 2008).
# TODO(catalog): migrate to biomarker-catalog.json distribution field when catalog gains distribution annotations.
LOGNORMAL_ENDPOINTS: frozenset[str] = frozenset({
    "ALT", "AST", "ALP", "GGT", "TBIL", "BILI", "TG", "TRIG",
})

# Immunomodulatory compound class profile IDs -- stress heuristic annotates
# rather than flags for these (pharmacologically expected HPA/immune changes).
IMMUNOMOD_PROFILE_IDS: frozenset[str] = frozenset({
    "checkpoint_inhibitor", "anti_cd20_mab", "anti_tnf_mab",
    "immunosuppressant", "corticosteroid", "cytotoxic_agent",
    # mAb subtypes with immune modulation
    "anti_il17_mab", "anti_il1_mab", "anti_il4_il13_mab",
    "anti_il6_mab", "bispecific_tce", "fc_fusion_ctla4",
})

# Non-scheduled dispositions that suppress stress flag
SEVERE_DISPOSITIONS: frozenset[str] = frozenset({
    "MORIBUND", "FOUND DEAD", "UNSCHEDULED SACRIFICE",
    "MORIBUND SACRIFICE",
})

# ── BW confounding: organs where relative OM is suspect when BW drops ────
BW_CONFOUND_ORGANS: frozenset[str] = frozenset({
    "LIVER", "KIDNEY", "KIDNEYS", "SPLEEN",
    "HEART", "BRAIN", "ADRENAL", "ADRENALS",
    "THYROID", "PITUITARY",
})


def build_subject_sentinel(
    findings: list[dict],
    subjects_df: Any,  # pandas.DataFrame
    dose_groups: list[dict],
    early_death_subjects: dict[str, str] | None = None,
    compound_profile: dict | None = None,
) -> dict:
    """Build per-animal sentinel annotations from pipeline findings.

    Args:
        findings: Raw findings list (pre-strip, has raw_subject_values).
        subjects_df: Subject context DataFrame.
        dose_groups: Dose group metadata list.
        early_death_subjects: {USUBJID: DSDECOD} for early deaths.
        compound_profile: Resolved compound class profile, or None.

    Returns:
        Dict with animals list, endpoint_details, and thresholds.
    """
    import pandas as pd  # noqa: F811

    if early_death_subjects is None:
        early_death_subjects = {}

    # ── Build subject lookup (exclude TK satellites, recovery-only) ───
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
            "group_id": "",
        }

    # Map dose_level -> group info and assign group_id
    dg_map: dict[int, dict] = {}
    for dg in dose_groups:
        dg_map[int(dg["dose_level"])] = dg
    for uid, meta in subj_meta.items():
        dl = meta["dose_level"]
        meta["group_id"] = dg_map.get(dl, {}).get("label", f"Dose {dl}")

    # Disposition lookup
    disposition_map: dict[str, str] = {}
    for uid, dsdecod in early_death_subjects.items():
        if uid in subj_meta:
            disposition_map[uid] = dsdecod.upper().strip()

    # ── Collect per-endpoint z-scores and metadata ───────────────
    # z_data[uid][(endpoint_key)] = {z, organ_system, domain, ...}
    z_data: dict[str, dict[str, dict]] = {}

    # Collect dose_levels list for Hamada
    all_dose_levels = sorted(dg_map.keys())

    # Pass 1: Collect BW significance per dose level (for confounding gate)
    bw_sig_dose: set[int] = set()
    # Also collect absolute OM significance per (specimen_root, dose_level)
    # to gate BW confounding: only suppress relative OM if absolute is NOT significant
    abs_om_sig: set[tuple[str, int]] = set()
    for f in findings:
        if f.get("domain") == "BW":
            _track_bw_significance(f, bw_sig_dose)
        elif f.get("domain") == "OM":
            _track_abs_om_significance(f, abs_om_sig)

    # Detection metadata accumulator (per-endpoint detection window parameters)
    detection_meta: dict[str, dict] = {}

    # Pass 2: Process all continuous endpoints
    for f in findings:
        domain = f.get("domain", "")
        test_code = f.get("test_code", "")
        specimen = f.get("specimen") or ""
        sex = f.get("sex", "")

        if domain in ("MI", "MA"):
            continue  # incidence handled separately in Layer D

        rsv = f.get("raw_subject_values")
        group_stats = f.get("group_stats", [])
        if not rsv or not group_stats:
            continue

        organ_system = get_organ_system(
            specimen=specimen if specimen else None,
            test_code=test_code if test_code else None,
            domain=domain,
        )

        endpoint_key = _make_endpoint_key(domain, test_code, specimen, sex)
        is_lognormal = test_code.upper() in LOGNORMAL_ENDPOINTS

        _process_continuous_endpoint(
            rsv, group_stats, subj_meta, endpoint_key, domain,
            test_code, specimen, organ_system, is_lognormal,
            all_dose_levels, bw_sig_dose, abs_om_sig,
            z_data, sex, detection_meta,
        )

    # ── Layer D: Incidence influence ─────────────────────────────
    _process_incidence_findings(findings, subj_meta, z_data)

    # ── Assemble per-animal summaries ────────────────────────────
    # Determine immunomod status for stress heuristic
    is_immunomod = False
    stress_heuristic_mode = "flag"
    if compound_profile:
        pid = compound_profile.get("profile_id", "")
        if pid in IMMUNOMOD_PROFILE_IDS:
            is_immunomod = True
            stress_heuristic_mode = "annotate"

    animals: list[dict] = []
    endpoint_details_out: dict[str, list[dict]] = {}

    for uid, meta in subj_meta.items():
        uid_z = z_data.get(uid, {})
        if not uid_z:
            continue

        # Layer A: Per-endpoint outlier flags
        n_outlier_flags = 0
        max_z: float | None = None
        outlier_organs: set[str] = set()

        # Layer B: Per-organ concordance (POC)
        # organ_system -> set of domains with evidence
        poc_domains: dict[str, set[str]] = {}

        for ep_key, ep in uid_z.items():
            z = ep.get("z")
            if z is None:
                continue
            abs_z = abs(z)

            if max_z is None or abs_z > max_z:
                max_z = abs_z

            organ_sys = ep.get("organ_system", "general")
            ep_domain = ep.get("domain", "")

            # Outlier flag
            if abs_z > OUTLIER_Z_THRESHOLD:
                n_outlier_flags += 1
                outlier_organs.add(organ_sys)

            # Concordance evidence (softer threshold)
            if abs_z > CONCORDANCE_Z_THRESHOLD:
                # BW confounding gate: suppress relative OM concordance
                if ep.get("bw_confound_suppressed"):
                    continue
                poc_domains.setdefault(organ_sys, set()).add(ep_domain)

            # Sole-finding evidence also contributes to concordance
            if ep.get("is_sole_finding"):
                poc_domains.setdefault(organ_sys, set()).add(ep_domain)

        # Compute POC and COC
        poc: dict[str, int] = {}
        for organ_sys, domains in poc_domains.items():
            poc[organ_sys] = len(domains)
        coc = sum(1 for count in poc.values() if count >= POC_DOMAIN_THRESHOLD)

        # Incidence metrics
        n_sole_findings = sum(1 for ep in uid_z.values() if ep.get("is_sole_finding"))
        sole_finding_organs = sorted(set(
            ep.get("organ_system", "general")
            for ep in uid_z.values()
            if ep.get("is_sole_finding")
        ))
        n_non_responder = sum(1 for ep in uid_z.values() if ep.get("is_non_responder"))

        # Layer C: Stress flag (Everds triad detection)
        disp = disposition_map.get(uid)
        stress_flag = False
        stress_flag_pharmacological = False
        if disp not in SEVERE_DISPOSITIONS:
            stress_flag = _detect_everds_triad(uid, uid_z, findings, subj_meta)
            if stress_flag and is_immunomod:
                stress_flag_pharmacological = True

        animal_rec = {
            "subject_id": uid,
            "dose_level": meta["dose_level"],
            "sex": meta["sex"],
            "group_id": meta["group_id"],
            "n_outlier_flags": n_outlier_flags,
            "max_z": round(max_z, 2) if max_z is not None else None,
            "outlier_organs": sorted(outlier_organs),
            "poc": poc,
            "coc": coc,
            "stress_flag": stress_flag,
            "stress_flag_pharmacological": stress_flag_pharmacological,
            "stress_heuristic_mode": stress_heuristic_mode if stress_flag else None,
            "n_sole_findings": n_sole_findings,
            "sole_finding_organs": sole_finding_organs,
            "n_non_responder": n_non_responder,
            "disposition": disp,
            "is_control": meta["is_control"],
        }
        animals.append(animal_rec)

        # Build filtered endpoint details for this animal
        details = _build_endpoint_details(uid_z)
        if details:
            endpoint_details_out[uid] = details

    # Sort by COC desc, then n_outlier_flags desc
    animals.sort(
        key=lambda a: (a["coc"], a["n_outlier_flags"], a["max_z"] or 0),
        reverse=True,
    )

    return {
        "thresholds": {
            "outlier_z": OUTLIER_Z_THRESHOLD,
            "concordance_z": CONCORDANCE_Z_THRESHOLD,
            "poc_domains": POC_DOMAIN_THRESHOLD,
            "coc_organs": COC_ORGAN_THRESHOLD,
        },
        "stress_heuristic_mode": stress_heuristic_mode,
        "animals": animals,
        "endpoint_details": endpoint_details_out,
        "detection_metadata": detection_meta,
    }


# ── Helpers ──────────────────────────────────────────────────────


def _make_endpoint_key(domain: str, test_code: str, specimen: str, sex: str) -> str:
    parts = [domain.lower(), test_code.lower()]
    if specimen:
        parts.append(specimen.lower())
    if sex:
        parts.append(sex.lower())
    return ":".join(parts)


def _track_abs_om_significance(finding: dict, abs_om_sig: set[tuple[str, int]]) -> None:
    """Track absolute OM findings with significant pairwise results.

    Only tracks absolute (non-relative) OM findings. Used by the BW
    confounding gate: relative OM is only suppressed when the absolute
    OM for the same organ is NOT significant.
    """
    tc = finding.get("test_code", "").upper()
    if "REL" in tc or "RATIO" in tc or "%" in tc:
        return  # relative OM -- skip
    specimen = (finding.get("specimen") or "").upper().strip()
    if not specimen:
        return
    organ_root = next((o for o in BW_CONFOUND_ORGANS if specimen.startswith(o)), None)
    if organ_root is None:
        return
    for pw in finding.get("pairwise", []):
        p = pw.get("p_value")
        dl = pw.get("dose_level")
        if p is not None and dl is not None and p < 0.05:
            abs_om_sig.add((organ_root, int(dl)))


def _track_bw_significance(finding: dict, bw_sig_dose: set[int]) -> None:
    """Check if BW finding has significant pairwise results at any dose."""
    for pw in finding.get("pairwise", []):
        p = pw.get("p_value")
        dl = pw.get("dose_level")
        if p is not None and dl is not None and p < 0.05:
            bw_sig_dose.add(int(dl))


def _process_continuous_endpoint(
    rsv: list,
    group_stats: list[dict],
    subj_meta: dict[str, dict],
    endpoint_key: str,
    domain: str,
    test_code: str,
    specimen: str,
    organ_system: str,
    is_lognormal: bool,
    all_dose_levels: list[int],
    bw_sig_dose: set[int],
    abs_om_sig: set[tuple[str, int]],
    z_data: dict[str, dict[str, dict]],
    sex: str = "",
    detection_meta: dict | None = None,
) -> None:
    """Process a continuous endpoint: compute robust z-scores and Hamada residuals."""
    # Build group-level stats lookup
    gs_map: dict[int, tuple] = {}
    for gs in group_stats:
        dl = gs.get("dose_level")
        if dl is not None:
            gs_map[int(dl)] = (gs.get("mean"), gs.get("sd"), gs.get("n", 0), gs.get("median"))

    # Collect per-dose-level values for all eligible subjects
    dl_values = iter_subject_values(rsv, subj_meta)

    # Compute Qn/MAD scale per group
    scale_map: dict[int, float] = {}
    median_map: dict[int, float] = {}
    group_n: dict[int, int] = {}
    for dl, uid_vals in dl_values.items():
        vals = [v for _, v in uid_vals]
        if is_lognormal:
            vals = [math.log(v) for v in vals if v > 0]
        group_n[dl] = len(vals)
        if len(vals) < 2:
            scale_map[dl] = 0.0
            median_map[dl] = vals[0] if vals else 0.0
            continue
        vals_sorted = sorted(vals)
        n = len(vals_sorted)
        median_map[dl] = vals_sorted[n // 2] if n % 2 == 1 else (vals_sorted[n // 2 - 1] + vals_sorted[n // 2]) / 2
        # Qn for small groups (N <= 15), MAD for larger
        if n <= 15:
            scale_map[dl] = qn_scale(vals)
        else:
            deviations = sorted(abs(v - median_map[dl]) for v in vals)
            m = len(deviations)
            mad = deviations[m // 2] if m % 2 == 1 else (deviations[m // 2 - 1] + deviations[m // 2]) / 2
            scale_map[dl] = mad * 1.4826  # consistency factor for Gaussian

    # ── Detection metadata: persist detection window parameters ───
    if detection_meta is not None:
        endpoint_name = _make_endpoint_name(domain, test_code, specimen)
        groups_meta: list[dict] = []
        for dl in sorted(scale_map.keys()):
            n = group_n.get(dl, 0)
            if n < 2:
                continue
            scale = scale_map[dl]
            med = median_map[dl]  # log-space for lognormal, original for others
            median_orig = round(math.exp(med), 1) if is_lognormal else round(med, 1)

            # Parametric CV from group_stats (complementary to robust scale)
            gs_entry = gs_map.get(dl)
            cv_pct = None
            if gs_entry:
                mean_val, sd_val = gs_entry[0], gs_entry[1]
                if mean_val and sd_val is not None and mean_val != 0:
                    cv_pct = round(abs(sd_val / mean_val) * 100, 1)

            # Detection windows in original units
            if scale == 0:
                w_lo = w_hi = median_orig
                w_lo_c = w_hi_c = median_orig
            elif is_lognormal:
                w_lo = round(math.exp(med - OUTLIER_Z_THRESHOLD * scale), 1)
                w_hi = round(math.exp(med + OUTLIER_Z_THRESHOLD * scale), 1)
                w_lo_c = round(math.exp(med - CONCORDANCE_Z_THRESHOLD * scale), 1)
                w_hi_c = round(math.exp(med + CONCORDANCE_Z_THRESHOLD * scale), 1)
            else:
                w_lo = round(med - OUTLIER_Z_THRESHOLD * scale, 1)
                w_hi = round(med + OUTLIER_Z_THRESHOLD * scale, 1)
                w_lo_c = round(med - CONCORDANCE_Z_THRESHOLD * scale, 1)
                w_hi_c = round(med + CONCORDANCE_Z_THRESHOLD * scale, 1)

            groups_meta.append({
                "dose_level": dl,
                "n": n,
                "median": median_orig,
                "scale": round(scale, 4),
                "cv_pct": cv_pct,
                "window_lo": w_lo,
                "window_hi": w_hi,
                "window_lo_concordance": w_lo_c,
                "window_hi_concordance": w_hi_c,
            })

        if groups_meta:
            detection_meta[endpoint_key] = {
                "endpoint_name": endpoint_name,
                "domain": domain,
                "sex": sex,
                "log_transformed": is_lognormal,
                "groups": groups_meta,
            }

    # Compute Hamada residuals -- pre-computed for endpoint detail tooltip display.
    # NOT used in outlier/concordance flag decisions (spec §Feature 1b).
    # Provides dose-response context: "this animal deviates from the D-R trend."
    hamada_groups: dict[int, list[float]] = {}
    hamada_uid_index: dict[int, list[str]] = {}  # dl -> [uids in order]
    for dl, uid_vals in dl_values.items():
        hamada_groups[dl] = [v for _, v in uid_vals]
        hamada_uid_index[dl] = [u for u, _ in uid_vals]

    hamada_res: dict[tuple[int, int], float] = {}
    if hamada_groups:
        hamada_res = hamada_studentized_residuals(hamada_groups, all_dose_levels)

    # Compute z-scores and store
    for dl, uid_vals in dl_values.items():
        scale = scale_map.get(dl, 0.0)
        med = median_map.get(dl, 0.0)
        uid_order = hamada_uid_index.get(dl, [])

        for i, (uid, raw_val) in enumerate(uid_vals):
            val = math.log(raw_val) if (is_lognormal and raw_val > 0) else raw_val
            z = (val - med) / scale if scale > 0 else 0.0

            # Look up Hamada residual
            hamada_r = hamada_res.get((dl, i))

            # BW confounding gate: suppress relative OM concordance when
            # BW is significantly decreased at this dose level AND
            # absolute OM for this organ is NOT also significantly changed
            bw_suppressed = False
            if domain == "OM" and specimen and dl in bw_sig_dose:
                spec_upper = specimen.upper().strip()
                is_confound_organ = any(spec_upper.startswith(o) for o in BW_CONFOUND_ORGANS)
                if is_confound_organ:
                    tc_upper = test_code.upper()
                    if "REL" in tc_upper or "RATIO" in tc_upper or "%" in tc_upper:
                        # Only suppress if absolute OM for same organ is NOT significant
                        organ_root = next((o for o in BW_CONFOUND_ORGANS if spec_upper.startswith(o)), spec_upper)
                        if (organ_root, dl) not in abs_om_sig:
                            bw_suppressed = True

            ep_entry = {
                "z": z,
                "hamada_residual": round(hamada_r, 3) if hamada_r is not None else None,
                "is_outlier": abs(z) > OUTLIER_Z_THRESHOLD,
                "log_transformed": is_lognormal,
                "domain": domain,
                "organ_system": organ_system,
                "endpoint_key": endpoint_key,
                "endpoint_name": _make_endpoint_name(domain, test_code, specimen),
                "is_sole_finding": False,
                "is_non_responder": False,
                "bw_confound_suppressed": bw_suppressed,
            }
            z_data.setdefault(uid, {})[endpoint_key] = ep_entry

    return


def _process_incidence_findings(
    findings: list[dict],
    subj_meta: dict[str, dict],
    z_data: dict[str, dict[str, dict]],
) -> None:
    """Layer D: Compute sole-finding and non-responder flags for incidence.

    MI/MA findings don't carry raw_subject_values. Uses _relrec_subject_seqs
    (affected subject list) + group_stats (per-dose n/affected count).
    """
    # Build dose_level -> set of eligible UIDs for group membership
    dl_subjects: dict[int, set[str]] = {}
    for uid, meta in subj_meta.items():
        dl_subjects.setdefault(meta["dose_level"], set()).add(uid)

    for f in findings:
        domain = f.get("domain", "")
        if domain not in ("MI", "MA"):
            continue

        test_code = f.get("test_code", "")
        specimen = f.get("specimen") or ""
        sex = f.get("sex", "")
        finding_label = f.get("finding") or f.get("endpoint_label") or test_code
        organ_system = get_organ_system(
            specimen=specimen if specimen else None,
            test_code=None,
            domain=domain,
        )
        endpoint_key = _make_endpoint_key(domain, test_code, specimen, sex)

        # Get affected subjects from relrec linkage
        relrec = f.get("_relrec_subject_seqs", [])
        affected_uids = set(uid for uid, _ in relrec) if relrec else set()

        group_stats = f.get("group_stats", [])
        if not group_stats:
            continue

        # Sex filter: finding is sex-specific, only consider same-sex subjects
        finding_sex = f.get("sex", "")

        for gs in group_stats:
            dl = gs.get("dose_level")
            if dl is None:
                continue
            n_total = gs.get("n", 0)
            n_affected = gs.get("affected", 0)
            if n_total == 0:
                continue

            is_treated = dl > 0
            dl_eligible = dl_subjects.get(dl, set())

            # Filter by sex if finding is sex-specific
            if finding_sex:
                dl_eligible = {uid for uid in dl_eligible if subj_meta[uid]["sex"] == finding_sex}

            for uid in dl_eligible:
                has_finding = uid in affected_uids

                # Sole-finding flag: only animal with this finding at this dose
                is_sole = has_finding and n_affected == 1

                # Non-responder: treated group, >= 50% groupmates respond, this one doesn't
                is_non_responder = False
                if is_treated and not has_finding and n_total > 0:
                    incidence_rate = n_affected / n_total
                    if incidence_rate >= 0.5:
                        is_non_responder = True

                if is_sole or is_non_responder:
                    ep_entry = {
                        "z": None,
                        "hamada_residual": None,
                        "is_outlier": False,
                        "log_transformed": False,
                        "domain": domain,
                        "organ_system": organ_system,
                        "endpoint_key": endpoint_key,
                        "endpoint_name": finding_label,
                        "is_sole_finding": is_sole,
                        "is_non_responder": is_non_responder,
                        "bw_confound_suppressed": False,
                    }
                    uid_data = z_data.setdefault(uid, {})
                    inc_key = f"{endpoint_key}:inc"
                    uid_data[inc_key] = ep_entry


def _detect_everds_triad(
    uid: str,
    uid_z: dict[str, dict],
    findings: list[dict],
    subj_meta: dict[str, dict],
) -> bool:
    """Detect the Everds stress triad for a single animal.

    All 3 components required:
    1. Thymic atrophy (MI: thymus decreased/atrophy)
    2. Adrenal hypertrophy (OM: adrenal increased weight, or MI: cortical hypertrophy)
    3. Stress leukogram (LB: >= 2 of lymphopenia, neutrophilia, eosinopenia)
    """
    has_thymic = False
    has_adrenal = False
    leukogram_hits = 0

    for ep_key, ep in uid_z.items():
        domain = ep.get("domain", "")
        organ_sys = ep.get("organ_system", "")
        z = ep.get("z")
        ep_name = ep.get("endpoint_name", "").upper()
        ek = ep.get("endpoint_key", "").upper()

        # Component 1: Thymic atrophy
        if domain == "MI" and "THYMUS" in ek:
            # Check for atrophy/decreased direction
            if any(term in ep_name for term in ("ATROPHY", "DECREASED", "INVOLUTION")):
                has_thymic = True

        # Component 2: Adrenal hypertrophy (absolute weight only, not relative)
        if "ADRENAL" in ek:
            if domain == "OM" and z is not None and z > 0:
                # Only count absolute OM (not relative/ratio)
                if not ("REL" in ek or "RATIO" in ek or "%" in ek):
                    has_adrenal = True
            elif domain == "MI":
                if any(term in ep_name for term in ("HYPERTROPHY", "HYPERPLASIA", "INCREASED")):
                    has_adrenal = True

        # Component 3: Stress leukogram
        if domain == "LB" and z is not None:
            tc = ek.split(":")[1].upper() if ":" in ek else ""
            # Map test codes to leukogram components
            bio = BIOMARKER_MAP.get(tc, {})
            bio_name = bio.get("name", "").upper() if bio else ""

            # Lymphopenia: LYM/LYMPH z < -2.0
            if tc in ("LYM", "LYMPH") or "LYMPHOCYTE" in bio_name:
                if z < -CONCORDANCE_Z_THRESHOLD:
                    leukogram_hits += 1
            # Neutrophilia: NEUT/SEG z > 2.0
            elif tc in ("NEUT", "SEG") or "NEUTROPHIL" in bio_name:
                if z > CONCORDANCE_Z_THRESHOLD:
                    leukogram_hits += 1
            # Eosinopenia: EOS/EOSIN z < -2.0
            elif tc in ("EOS", "EOSIN") or "EOSINOPHIL" in bio_name:
                if z < -CONCORDANCE_Z_THRESHOLD:
                    leukogram_hits += 1

    has_leukogram = leukogram_hits >= 2
    return has_thymic and has_adrenal and has_leukogram


def _make_endpoint_name(domain: str, test_code: str, specimen: str) -> str:
    """Build a human-readable endpoint name."""
    if specimen:
        return f"{test_code} ({specimen})" if test_code else specimen
    return test_code or f"{domain} endpoint"


def _build_endpoint_details(uid_z: dict[str, dict]) -> list[dict]:
    """Build filtered endpoint detail list for one animal."""
    details: list[dict] = []
    for ep_key, ep in uid_z.items():
        z = ep.get("z")
        abs_z = abs(z) if z is not None else None

        # Include if: outlier, concordance evidence, or incidence flag
        include = (
            (abs_z is not None and abs_z > CONCORDANCE_Z_THRESHOLD)
            or ep.get("is_sole_finding")
            or ep.get("is_non_responder")
            or ep.get("is_outlier")
        )
        if not include:
            continue

        details.append({
            "endpoint_id": ep.get("endpoint_key", ep_key),
            "endpoint_name": ep.get("endpoint_name", ""),
            "domain": ep.get("domain", ""),
            "organ_system": ep.get("organ_system", "general"),
            "z_score": round(z, 3) if z is not None else None,
            "hamada_residual": ep.get("hamada_residual"),
            "is_outlier": ep.get("is_outlier", False),
            "log_transformed": ep.get("log_transformed", False),
            "is_sole_finding": ep.get("is_sole_finding", False),
            "is_non_responder": ep.get("is_non_responder", False),
            "bw_confound_suppressed": ep.get("bw_confound_suppressed", False),
        })

    # Sort by |z| descending, then sole findings
    details.sort(
        key=lambda d: (
            abs(d["z_score"]) if d["z_score"] is not None else 0,
            d["is_sole_finding"],
        ),
        reverse=True,
    )
    return details
