"""Subject similarity engine -- per-subject feature vectors, Gower distance, MDS, clustering.

Produces subject_similarity.json with:
- Per-subject organ-system composite feature vectors
- Gower distance matrix with per-feature decomposition
- Non-metric MDS 2D embedding
- Complete-linkage hierarchical clustering
- Validation metrics (ARI, silhouette, boundary subjects, permutation tests)
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

import numpy as np
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import squareform

from services.study_discovery import StudyInfo
from services.analysis.send_knowledge import BIOMARKER_MAP
from generator.subject_syndromes import (
    _build_subject_value_indexes,
    _load_histopath_findings,
    _build_om_fold_changes,
    SEVERITY_MAP,
)
from generator.organ_map import get_organ_system

# ── Constants ────────────────────────────────────────────────

LOG2_CAP = 10.0  # |log2(fold_change)| cap (~1000x change)
MIN_ELIGIBLE = 15  # Below this, suppress MDS and clustering
OVERLAP_THRESHOLD = 0.4  # Min feature overlap for reliable distance
N_PERMUTATIONS = 1000
RANDOM_SEED = 42
K_RANGE = range(2, 7)  # k=2..6 multi-cut validation

# Organ systems used for composites (union of biomarker catalog + organ_system_map)
_ORGAN_SYSTEMS = [
    "hepatic", "renal", "hematologic", "metabolic", "electrolyte",
    "musculoskeletal", "cardiovascular", "respiratory", "endocrine",
    "reproductive", "neurological", "gastrointestinal", "integumentary",
    "ocular", "general",
]


# ── Main entry point ─────────────────────────────────────────

def build_subject_similarity(
    findings: list[dict],
    study: StudyInfo,
    ctx_records: list[dict],
    noael_overlay: dict | None = None,
    early_death_subjects: dict | None = None,
) -> dict:
    """Build subject similarity analysis.

    Args:
        findings: unified findings with raw_subject_values intact
        study: StudyInfo for XPT access
        ctx_records: subject_context records (list of dicts from ctx_df)
        noael_overlay: noael overlay output (for bw_terminal_pct)
        early_death_subjects: {USUBJID: reason} dict of early deaths
    """
    ctx_by_uid: dict[str, dict] = {}
    for rec in ctx_records:
        uid = rec.get("USUBJID", "")
        if uid:
            ctx_by_uid[uid] = rec

    # Eligible = non-TK subjects
    eligible_uids: list[str] = []
    excluded_reasons: dict[str, int] = {}
    for uid, ctx in ctx_by_uid.items():
        if ctx.get("IS_TK"):
            excluded_reasons["TK_satellite"] = excluded_reasons.get("TK_satellite", 0) + 1
            continue
        eligible_uids.append(uid)

    n_eligible = len(eligible_uids)
    suppressed = n_eligible < MIN_ELIGIBLE
    early_deaths = early_death_subjects or {}

    # BP-1: Feature vectors
    feature_defs, subject_features = _build_feature_vectors(
        findings, study, eligible_uids, ctx_by_uid, noael_overlay, early_deaths,
    )

    # Base subject output
    subjects_out: dict[str, dict] = {}
    for uid in eligible_uids:
        ctx = ctx_by_uid.get(uid, {})
        subjects_out[uid] = {
            "features": subject_features.get(uid, {}),
            "dose_group_order": ctx.get("DOSE_GROUP_ORDER", 0),
            "sex": ctx.get("SEX", ""),
            "is_recovery": bool(ctx.get("HAS_RECOVERY")),
            "is_early_death": uid in early_deaths,
        }

    if suppressed or n_eligible < 2:
        return _build_suppressed_output(
            subjects_out, feature_defs, n_eligible,
            excluded_reasons,
        )

    # Deterministic subject ordering
    uid_order = sorted(eligible_uids)
    feature_names = [fd["name"] for fd in feature_defs]
    feature_types = {fd["name"]: fd["type"] for fd in feature_defs}
    feature_max_ranks = {fd["name"]: fd.get("max_rank", 5) for fd in feature_defs}

    # Build numeric matrix: rows=subjects, cols=features
    n_subj = len(uid_order)
    n_feat = len(feature_names)
    X = np.full((n_subj, n_feat), np.nan)
    for i, uid in enumerate(uid_order):
        feats = subject_features.get(uid, {})
        for j, fname in enumerate(feature_names):
            val = feats.get(fname)
            if val is not None:
                X[i, j] = val

    # BP-2: Gower distance
    dist_mat, feat_contrib, overlap_mat = _compute_gower(
        X, feature_names, feature_types, feature_max_ranks,
    )

    control_idx = [i for i, uid in enumerate(uid_order)
                   if ctx_by_uid.get(uid, {}).get("DOSE_GROUP_ORDER", -1) == 0]
    control_cal = _compute_control_calibration(
        feat_contrib, control_idx, feature_names,
    )

    condensed = squareform(dist_mat, checks=False)

    # BP-3: MDS embedding
    mds_coords, mds_stress = _compute_mds(dist_mat)

    # BP-4: Hierarchical clustering
    Z = linkage(condensed, method="complete")

    # BP-5: Validation metrics
    dose_labels = np.array([ctx_by_uid.get(uid, {}).get("DOSE_GROUP_ORDER", 0)
                            for uid in uid_order])

    # Populate per-subject overlap and count low-overlap subjects
    n_low_overlap_subjects = 0
    for i, uid in enumerate(uid_order):
        subj = subjects_out[uid]
        row = overlap_mat[i]
        other = np.concatenate([row[:i], row[i + 1:]])
        overlap_pct = float(np.mean(other)) if len(other) > 0 else 1.0
        subj["feature_overlap_pct"] = round(overlap_pct, 4)
        subj["low_overlap"] = overlap_pct < OVERLAP_THRESHOLD
        if subj["low_overlap"]:
            n_low_overlap_subjects += 1

    validation = _compute_validation(
        Z, dose_labels, n_subj, condensed,
        n_low_overlap_subjects=n_low_overlap_subjects,
    )

    # Precompute cluster assignments at each k for per-subject output
    cluster_labels_by_k: dict[int, np.ndarray] = {}
    for k in K_RANGE:
        cluster_labels_by_k[k] = fcluster(Z, k, criterion="maxclust")

    # Populate per-subject MDS coords, cluster IDs, boundary flags
    for i, uid in enumerate(uid_order):
        subj = subjects_out[uid]
        subj["mds_x"] = round(float(mds_coords[i, 0]), 6) if mds_coords is not None else None
        subj["mds_y"] = round(float(mds_coords[i, 1]), 6) if mds_coords is not None else None

        cluster_ids: dict[str, int] = {}
        is_boundary: dict[str, bool] = {}
        for k in K_RANGE:
            labels = cluster_labels_by_k[k]
            cid = int(labels[i])
            cluster_ids[str(k)] = cid
            members = np.where(labels == cid)[0]
            own_dose = dose_labels[i]
            same_count = int(np.sum(dose_labels[members] == own_dose))
            is_boundary[str(k)] = same_count <= len(members) / 2
        subj["cluster_ids"] = cluster_ids
        subj["is_boundary"] = is_boundary

    # Boundary subject detail (at best ARI k)
    boundary_detail = _build_boundary_detail(
        uid_order, dose_labels, Z, feat_contrib, feature_names, control_cal,
        validation,
    )

    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "n_subjects_eligible": n_eligible,
            "n_excluded": sum(excluded_reasons.values()),
            "excluded_reasons": excluded_reasons,
            "n_features": len(feature_defs),
            "similarity_suppressed": False,
            "mds_stress": round(float(mds_stress), 6) if mds_stress is not None else None,
            "method": {
                "distance": "gower",
                "range_normalization": "robust_5_95",
                "embedding": "nmds_kruskal",
                "clustering": "complete_linkage",
            },
        },
        "feature_definitions": feature_defs,
        "subjects": subjects_out,
        "interpretability": {
            "control_calibration": control_cal,
            "boundary_subjects": boundary_detail,
        },
        "validation": validation,
        "linkage_matrix": Z.tolist(),
        "distance_matrix_condensed": condensed.tolist(),
    }


# ── BP-1: Feature vector assembly ────────────────────────────

def _build_feature_vectors(
    findings: list[dict],
    study: StudyInfo,
    eligible_uids: list[str],
    ctx_by_uid: dict[str, dict],
    noael_overlay: dict | None,
    early_deaths: dict[str, Any],
) -> tuple[list[dict], dict[str, dict[str, float | None]]]:
    """Build per-subject organ-system composite feature vectors.

    Returns (feature_definitions, {USUBJID: {feature_name: value}}).
    """
    eligible_set = set(eligible_uids)

    # --- Continuous composites (LB/OM/BW) via log2(fold-change) ---
    subj_vals, ctrl_means = _build_subject_value_indexes(findings)
    om_folds = _build_om_fold_changes(findings)

    # Precompute per-endpoint pseudocount (half min non-zero value across all subjects)
    endpoint_pseudocounts: dict[tuple, float] = {}
    for uid_vals in subj_vals.values():
        for key, val in uid_vals.items():
            if val is not None and val != 0:
                cur = endpoint_pseudocounts.get(key, float("inf"))
                endpoint_pseudocounts[key] = min(cur, abs(float(val)) / 2)
    # Include control means in pseudocount computation
    for key, cm in ctrl_means.items():
        if cm is not None and cm != 0:
            cur = endpoint_pseudocounts.get(key, float("inf"))
            endpoint_pseudocounts[key] = min(cur, abs(float(cm)) / 2)

    # Map LB endpoints to organ systems via biomarker catalog
    lb_system: dict[str, dict[str, list[float]]] = {}  # {uid: {system: [log2_fc values]}}
    for uid in eligible_set:
        vals = subj_vals.get(uid, {})
        for key, val in vals.items():
            domain, test_code, k_sex, day = key
            if domain not in ("LB", "BW", "BG", "VS", "EG", "RE"):
                continue
            cm = ctrl_means.get(key)
            if cm is None:
                continue
            pc = endpoint_pseudocounts.get(key, 1e-10)
            log2_fc = _safe_log2_fold_change(val, cm, pseudocount=pc)
            if log2_fc is None:
                continue
            if domain == "LB":
                system = BIOMARKER_MAP.get(test_code, {}).get("system", "general")
            else:
                system = get_organ_system(None, test_code, domain)
            if uid not in lb_system:
                lb_system[uid] = {}
            lb_system[uid].setdefault(system, []).append(abs(log2_fc))

    # Map OM fold-changes to organ systems (apply pseudocount for zero OM values)
    om_system: dict[str, dict[str, list[float]]] = {}
    # Precompute OM pseudocount per specimen from all non-zero fold-changes
    om_min_fc: dict[str, float] = {}
    for uid_folds in om_folds.values():
        for spec, fc in uid_folds.items():
            if fc > 0:
                om_min_fc[spec] = min(om_min_fc.get(spec, float("inf")), fc / 2)
    for uid in eligible_set:
        folds = om_folds.get(uid, {})
        for specimen_upper, fc in folds.items():
            system = get_organ_system(specimen_upper)
            if fc <= 0:
                # Apply pseudocount: use half min non-zero fold-change for this specimen
                pc_fc = om_min_fc.get(specimen_upper, 0.001)
                log2_fc = _log2_fc_capped(pc_fc)
            else:
                log2_fc = _log2_fc_capped(fc)
            if log2_fc is None:
                continue
            if uid not in om_system:
                om_system[uid] = {}
            om_system[uid].setdefault(system, []).append(abs(log2_fc))

    # --- Ordinal composites (MI) ---
    mi_findings = _load_histopath_findings(study, "mi")
    mi_system: dict[str, dict[str, int]] = {}  # {uid: {system: max_severity}}
    for uid in eligible_set:
        for entry in mi_findings.get(uid, []):
            specimen = entry.get("specimen", "")
            system = get_organ_system(specimen)
            grade = entry.get("severity_grade", 0)
            if uid not in mi_system:
                mi_system[uid] = {}
            mi_system[uid][system] = max(mi_system[uid].get(system, 0), grade)

    # --- Binary composites (MA/CL) ---
    ma_findings = _load_histopath_findings(study, "ma")
    ma_system: dict[str, set[str]] = {}  # {uid: {systems with MA findings}}
    for uid in eligible_set:
        for entry in ma_findings.get(uid, []):
            specimen = entry.get("specimen", "")
            system = get_organ_system(specimen)
            if uid not in ma_system:
                ma_system[uid] = set()
            ma_system[uid].add(system)

    cl_by_subject = _load_cl_findings(study)
    cl_system: dict[str, set[str]] = {}
    for uid in eligible_set:
        for entry in cl_by_subject.get(uid, []):
            loc = entry.get("location", "")
            system = get_organ_system(loc) if loc else "general"
            if uid not in cl_system:
                cl_system[uid] = set()
            cl_system[uid].add(system)

    # --- Determine which organ systems have any data ---
    active_systems: set[str] = set()
    for uid_data in lb_system.values():
        active_systems.update(uid_data.keys())
    for uid_data in om_system.values():
        active_systems.update(uid_data.keys())
    for uid_data in mi_system.values():
        active_systems.update(uid_data.keys())
    for uid_data in ma_system.values():
        active_systems.update(uid_data)
    for uid_data in cl_system.values():
        active_systems.update(uid_data)
    # Keep only organ systems with data, in canonical order
    systems_ordered = [s for s in _ORGAN_SYSTEMS if s in active_systems]

    # --- Build feature definitions ---
    feature_defs: list[dict] = []
    for sys_name in systems_ordered:
        # Continuous: LB+OM+BW fold-change composite
        has_continuous = any(sys_name in d for d in lb_system.values()) or \
                         any(sys_name in d for d in om_system.values())
        if has_continuous:
            feature_defs.append({
                "name": f"{sys_name}_continuous",
                "type": "continuous",
                "organ_system": sys_name,
                "domain": "LB/OM/BW",
                "description": f"Max |log2(fold-change)| across {sys_name} continuous endpoints",
            })

        # Ordinal: MI severity
        has_ordinal = any(sys_name in d for d in mi_system.values())
        if has_ordinal:
            feature_defs.append({
                "name": f"{sys_name}_mi",
                "type": "ordinal",
                "organ_system": sys_name,
                "domain": "MI",
                "description": f"Max MI severity grade in {sys_name} organs",
                "max_rank": 5,
            })

        # Binary: MA/CL presence
        has_binary = any(sys_name in d for d in ma_system.values()) or \
                     any(sys_name in d for d in cl_system.values())
        if has_binary:
            feature_defs.append({
                "name": f"{sys_name}_binary",
                "type": "binary",
                "organ_system": sys_name,
                "domain": "MA/CL",
                "description": f"Any MA/CL finding in {sys_name}",
            })

    # Cross-cutting features
    feature_defs.append({
        "name": "bw_terminal_pct",
        "type": "continuous",
        "organ_system": "general",
        "domain": "BW",
        "description": "Terminal BW % change from sex-matched control mean",
    })
    feature_defs.append({
        "name": "cl_finding_count",
        "type": "continuous",
        "organ_system": "general",
        "domain": "CL",
        "description": "Total CL finding count",
    })
    feature_defs.append({
        "name": "disposition",
        "type": "binary",
        "organ_system": "general",
        "domain": "DS",
        "description": "1 if early/unscheduled death, 0 otherwise",
    })

    # --- Populate feature values per subject ---
    subject_features: dict[str, dict[str, float | None]] = {}
    overlay_subjects = (noael_overlay or {}).get("subjects", {})

    for uid in eligible_uids:
        feats: dict[str, float | None] = {}

        for fd in feature_defs:
            fname = fd["name"]
            ftype = fd["type"]
            sys_name = fd.get("organ_system", "general")

            if fname == "bw_terminal_pct":
                overlay = overlay_subjects.get(uid, {})
                feats[fname] = overlay.get("bw_terminal_pct")
            elif fname == "cl_finding_count":
                cl_entries = cl_by_subject.get(uid, [])
                feats[fname] = float(len(cl_entries)) if cl_entries else None
            elif fname == "disposition":
                feats[fname] = 1.0 if uid in early_deaths else 0.0
            elif ftype == "continuous":
                # Max across LB and OM for this system
                lb_vals = lb_system.get(uid, {}).get(sys_name, [])
                om_vals = om_system.get(uid, {}).get(sys_name, [])
                all_vals = lb_vals + om_vals
                feats[fname] = max(all_vals) if all_vals else None
            elif ftype == "ordinal":
                feats[fname] = float(mi_system.get(uid, {}).get(sys_name, 0)) \
                    if mi_system.get(uid, {}).get(sys_name) else None
            elif ftype == "binary":
                has_ma = sys_name in ma_system.get(uid, set())
                has_cl = sys_name in cl_system.get(uid, set())
                if has_ma or has_cl:
                    feats[fname] = 1.0
                else:
                    feats[fname] = 0.0

        subject_features[uid] = feats

    return feature_defs, subject_features


def _log2_fc_capped(fold_change: float) -> float | None:
    """Convert a fold-change ratio to log2, capped at LOG2_CAP."""
    if fold_change is None or fold_change <= 0:
        return None
    try:
        fc = float(fold_change)
    except (ValueError, TypeError):
        return None
    log2_fc = math.log2(fc)
    if abs(log2_fc) > LOG2_CAP:
        log2_fc = math.copysign(LOG2_CAP, log2_fc)
    return log2_fc


def _safe_log2_fold_change(
    subject_val: float, control_mean: float, pseudocount: float = 1e-10,
) -> float | None:
    """Compute log2(fold_change) with pseudocount floor and cap.

    Args:
        pseudocount: pre-computed per-endpoint floor (half of min non-zero
            value across all subjects for the endpoint).
    """
    if subject_val is None or control_mean is None:
        return None
    try:
        sv = float(subject_val)
        cm = float(control_mean)
    except (ValueError, TypeError):
        return None

    c = pseudocount if (sv == 0 or cm == 0) else 0.0
    fc = (sv + c) / (cm + c) if (cm + c) != 0 else 1.0
    return _log2_fc_capped(fc)


def _load_cl_findings(study: StudyInfo) -> dict[str, list[dict[str, str]]]:
    """Load per-subject CL (clinical observation) findings from raw XPT.

    Returns: {USUBJID: [{location, finding}]}
    """
    result: dict[str, list[dict[str, str]]] = {}
    if "cl" not in study.xpt_files:
        return result
    try:
        from services.xpt_processor import read_xpt
        df, _ = read_xpt(study.xpt_files["cl"])
        df.columns = [c.upper() for c in df.columns]
    except Exception:
        return result

    for _, row in df.iterrows():
        uid = str(row.get("USUBJID", "")).strip()
        if not uid:
            continue
        # Filter NOT DONE
        if "CLSTAT" in df.columns:
            stat = str(row.get("CLSTAT", "")).strip().upper()
            if stat == "NOT DONE":
                continue
        finding = str(row.get("CLSTRESC", "")).strip()
        if not finding or finding.upper() in ("NORMAL", "NONE", ""):
            continue
        loc = str(row.get("CLLOC", "")).strip()
        if uid not in result:
            result[uid] = []
        result[uid].append({"location": loc, "finding": finding})
    return result


# ── BP-2: Gower distance ─────────────────────────────────────

def _compute_gower(
    X: np.ndarray,
    feature_names: list[str],
    feature_types: dict[str, str],
    feature_max_ranks: dict[str, int],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute Gower distance matrix with per-feature decomposition.

    Returns: (distance_matrix, per_feature_contributions, overlap_matrix)
    - distance_matrix: (n, n) symmetric, d(i,i)=0
    - per_feature_contributions: (n, n, n_features) w_k * d_k per pair
    - overlap_matrix: (n, n) fraction of shared features per pair
    """
    n_subj, n_feat = X.shape

    # Robust range normalization for continuous features (P5/P95)
    ranges: dict[int, float] = {}
    for j, fname in enumerate(feature_names):
        if feature_types[fname] == "continuous":
            col = X[:, j]
            valid = col[~np.isnan(col)]
            if len(valid) >= 2:
                p5, p95 = np.percentile(valid, [5, 95])
                r = p95 - p5
                ranges[j] = r if r > 0 else 1.0
            elif len(valid) == 1:
                ranges[j] = 1.0
            else:
                ranges[j] = 1.0

    dist_mat = np.zeros((n_subj, n_subj))
    feat_contrib = np.zeros((n_subj, n_subj, n_feat))
    overlap_mat = np.ones((n_subj, n_subj))

    for i in range(n_subj):
        for j in range(i + 1, n_subj):
            w_sum = 0.0
            wd_sum = 0.0
            n_shared = 0
            n_total = 0

            for k in range(n_feat):
                fname = feature_names[k]
                ftype = feature_types[fname]
                xi, xj = X[i, k], X[j, k]
                n_total += 1

                # w_k = 0 if either missing
                if np.isnan(xi) or np.isnan(xj):
                    continue

                n_shared += 1
                w_k = 1.0

                if ftype == "continuous":
                    r = ranges.get(k, 1.0)
                    # Unclipped: d_k may exceed 1.0 for extreme pairs
                    d_k = abs(xi - xj) / r
                elif ftype == "ordinal":
                    max_rank = feature_max_ranks.get(fname, 5)
                    d_k = abs(xi - xj) / max_rank if max_rank > 0 else 0.0
                elif ftype == "binary":
                    d_k = 0.0 if xi == xj else 1.0
                else:
                    d_k = 0.0

                contrib = w_k * d_k
                w_sum += w_k
                wd_sum += contrib
                # Store raw contribution; normalize after loop
                feat_contrib[i, j, k] = contrib
                feat_contrib[j, i, k] = contrib

            gower_d = wd_sum / w_sum if w_sum > 0 else np.nan
            dist_mat[i, j] = gower_d
            dist_mat[j, i] = gower_d

            # Normalize per-feature contributions so they sum to total Gower distance
            if w_sum > 0:
                feat_contrib[i, j, :] /= w_sum
                feat_contrib[j, i, :] /= w_sum

            overlap_frac = n_shared / n_total if n_total > 0 else 0.0
            overlap_mat[i, j] = overlap_frac
            overlap_mat[j, i] = overlap_frac

    return dist_mat, feat_contrib, overlap_mat


def _compute_control_calibration(
    feat_contrib: np.ndarray,
    control_idx: list[int],
    feature_names: list[str],
) -> dict[str, dict[str, float]]:
    """Compute P90 of control-control distances per feature (pooled sexes)."""
    result: dict[str, dict[str, float]] = {}
    n_ctrl = len(control_idx)
    if n_ctrl < 2:
        return result

    n_pairs = n_ctrl * (n_ctrl - 1) // 2
    for k, fname in enumerate(feature_names):
        pair_vals = []
        for ci in range(n_ctrl):
            for cj in range(ci + 1, n_ctrl):
                i, j = control_idx[ci], control_idx[cj]
                val = feat_contrib[i, j, k]
                pair_vals.append(val)
        if pair_vals:
            arr = np.array(pair_vals)
            result[fname] = {
                "p90": round(float(np.percentile(arr, 90)), 6),
                "mean": round(float(np.mean(arr)), 6),
                "n_control_pairs": len(pair_vals),
            }
    return result


# ── BP-3: Non-metric MDS ─────────────────────────────────────

def _compute_mds(
    dist_mat: np.ndarray,
) -> tuple[np.ndarray | None, float | None]:
    """2D non-metric MDS embedding. Returns (coords, stress)."""
    try:
        from sklearn.manifold import MDS
    except ImportError:
        return None, None

    n = dist_mat.shape[0]
    if n < 3:
        return None, None

    # Replace NaN distances with max observed distance
    clean_dist = dist_mat.copy()
    nan_mask = np.isnan(clean_dist)
    if np.any(nan_mask):
        max_d = np.nanmax(clean_dist)
        clean_dist[nan_mask] = max_d if not np.isnan(max_d) else 1.0

    mds = MDS(
        n_components=2,
        dissimilarity="precomputed",
        metric=False,
        random_state=RANDOM_SEED,
        n_init=8,
        max_iter=300,
        normalized_stress="auto",
    )
    coords = mds.fit_transform(clean_dist)
    return coords, mds.stress_


# ── BP-4: Clustering is inline (scipy.cluster.hierarchy.linkage) ──


# ── BP-5: Validation metrics ─────────────────────────────────

def _compute_validation(
    Z: np.ndarray,
    dose_labels: np.ndarray,
    n_subj: int,
    condensed: np.ndarray,
    n_low_overlap_subjects: int = 0,
) -> dict:
    """Multi-cut ARI, silhouette, boundary subjects, permutation p-values."""
    try:
        from sklearn.metrics import adjusted_rand_score, silhouette_score
    except ImportError:
        return {"error": "scikit-learn not available"}

    rng = np.random.RandomState(RANDOM_SEED)

    # Silhouette on dose group labels
    dist_sq = squareform(condensed)
    nan_mask = np.isnan(dist_sq)
    if np.any(nan_mask):
        max_d = np.nanmax(dist_sq)
        dist_sq[nan_mask] = max_d if not np.isnan(max_d) else 1.0

    n_unique_doses = len(set(dose_labels))
    if n_unique_doses >= 2:
        sil_mean = float(silhouette_score(dist_sq, dose_labels, metric="precomputed"))
    else:
        sil_mean = 0.0

    by_k: dict[str, dict[str, Any]] = {}

    for k in K_RANGE:
        labels = fcluster(Z, k, criterion="maxclust")
        ari = adjusted_rand_score(dose_labels, labels)

        # Precompute cluster membership indices (constant across permutations)
        unique_clusters = np.unique(labels)
        cluster_members: dict[int, np.ndarray] = {
            int(c): np.where(labels == c)[0] for c in unique_clusters
        }
        cluster_sizes: dict[int, int] = {
            c: len(m) for c, m in cluster_members.items()
        }

        # Boundary subjects at this k (vectorized)
        n_boundary = _count_boundary(dose_labels, labels, cluster_members, cluster_sizes)

        # Permutation test (cluster membership is fixed; only labels shuffle)
        perm_aris = np.empty(N_PERMUTATIONS)
        perm_boundaries = np.empty(N_PERMUTATIONS, dtype=int)
        for p in range(N_PERMUTATIONS):
            shuffled = rng.permutation(dose_labels)
            perm_aris[p] = adjusted_rand_score(shuffled, labels)
            perm_boundaries[p] = _count_boundary(
                shuffled, labels, cluster_members, cluster_sizes,
            )

        ari_p = float(np.mean(perm_aris >= ari))
        boundary_p = float(np.mean(perm_boundaries <= n_boundary)) \
            if n_boundary > 0 else 1.0

        by_k[str(k)] = {
            "ari": round(ari, 4),
            "ari_perm_p": round(ari_p, 4),
            "n_boundary": n_boundary,
            "boundary_perm_p": round(boundary_p, 4),
        }

    return {
        "by_k": by_k,
        "silhouette_mean": round(sil_mean, 4),
        "silhouette_label": "dose_group_separability",
        "n_permutations": N_PERMUTATIONS,
        "n_low_overlap_subjects": n_low_overlap_subjects,
    }


def _count_boundary(
    dose_labels: np.ndarray,
    cluster_labels: np.ndarray,
    cluster_members: dict[int, np.ndarray],
    cluster_sizes: dict[int, int],
) -> int:
    """Count boundary subjects: those in clusters where >50% are from other dose groups."""
    n_boundary = 0
    for cid, members in cluster_members.items():
        member_doses = dose_labels[members]
        size = cluster_sizes[cid]
        half = size / 2
        for idx in members:
            own_dose = dose_labels[idx]
            same = int(np.sum(member_doses == own_dose))
            if same <= half:
                n_boundary += 1
    return n_boundary


# ── Boundary subject detail ──────────────────────────────────

def _build_boundary_detail(
    uid_order: list[str],
    dose_labels: np.ndarray,
    Z: np.ndarray,
    feat_contrib: np.ndarray,
    feature_names: list[str],
    control_cal: dict[str, dict[str, float]],
    validation: dict | None = None,
) -> list[dict]:
    """Identify boundary subjects at best-ARI k with top contributing features."""
    result: list[dict] = []
    # Pick k with highest ARI (most meaningful clustering)
    k = 4  # default
    if validation and "by_k" in validation:
        best_k, best_ari = 4, -1.0
        for k_str, metrics in validation["by_k"].items():
            if metrics.get("ari", 0) > best_ari:
                best_ari = metrics["ari"]
                best_k = int(k_str)
        k = best_k
    if len(uid_order) < k:
        return result

    labels = fcluster(Z, k, criterion="maxclust")

    for i, uid in enumerate(uid_order):
        cid = labels[i]
        members = np.where(labels == cid)[0]
        own_dose = int(dose_labels[i])
        member_doses = dose_labels[members]
        same = int(np.sum(member_doses == own_dose))
        if same > len(members) / 2:
            continue

        # Find dominant dose group in this cluster
        unique_doses, counts = np.unique(member_doses, return_counts=True)
        dominant_dose = int(unique_doses[np.argmax(counts)])

        # Top contributing features (average contribution to other cluster members)
        mean_contribs = []
        for fk, fname in enumerate(feature_names):
            vals = [feat_contrib[i, j, fk] for j in members if j != i]
            avg = float(np.mean(vals)) if vals else 0.0
            p90 = control_cal.get(fname, {}).get("p90", float("inf"))
            mean_contribs.append({
                "feature": fname,
                "contribution": round(avg, 4),
                "exceeds_control_p90": avg > p90,
            })
        mean_contribs.sort(key=lambda x: x["contribution"], reverse=True)

        result.append({
            "subject": uid,
            "own_dose_group": own_dose,
            "cluster_dominant_dose_group": dominant_dose,
            "top_contributing_features": mean_contribs[:5],
        })

    return result


# ── Suppressed output (N < 15) ────────────────────────────────

def _build_suppressed_output(
    subjects_out: dict[str, dict],
    feature_defs: list[dict],
    n_eligible: int,
    excluded_reasons: dict[str, int],
) -> dict:
    """Output when N < 15: feature vectors only, no MDS/clustering."""
    for subj in subjects_out.values():
        subj["mds_x"] = None
        subj["mds_y"] = None
        subj["cluster_ids"] = {}
        subj["is_boundary"] = {}
        subj["low_overlap"] = False
        subj["feature_overlap_pct"] = None

    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "n_subjects_eligible": n_eligible,
            "n_excluded": sum(excluded_reasons.values()),
            "excluded_reasons": excluded_reasons,
            "n_features": len(feature_defs),
            "similarity_suppressed": True,
            "mds_stress": None,
            "method": {
                "distance": "gower",
                "range_normalization": "robust_5_95",
                "embedding": "nmds_kruskal",
                "clustering": "complete_linkage",
            },
        },
        "feature_definitions": feature_defs,
        "subjects": subjects_out,
        "interpretability": {"control_calibration": {}, "boundary_subjects": []},
        "validation": {},
        "linkage_matrix": [],
        "distance_matrix_condensed": [],
    }
