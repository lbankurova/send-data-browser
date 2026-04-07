"""Cross-study aggregation service (Phase 1A + 1D).

Loads per-study generated JSONs from disk and aggregates them into
cross-study view data structures. All data access is from generated JSON
files, NOT via internal API endpoints.
"""

import json
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

GENERATED_DIR = Path(__file__).resolve().parent.parent.parent / "generated"
ANNOTATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "annotations"


# ─── Data structures ─────────────────────────────────────────


@dataclass
class StudyContext:
    """Per-study metadata threaded into every cross-study response (Feature 1D)."""
    study_id: str
    species: str | None = None
    strain: str | None = None
    route: str | None = None
    vehicle: str | None = None
    control_type: str | None = None
    duration_weeks: float | None = None
    study_type: str | None = None
    dose_groups: list[dict] = field(default_factory=list)
    compound_class: str | None = None
    # Inter-pathologist severity band -- pathologist-source annotation (Feature 4)
    pathologist_name: str | None = None
    cro_name: str | None = None
    grading_scale: str | None = None  # "4pt" | "5pt" | None


@dataclass
class StudyData:
    """All relevant generated data for one study, loaded from disk."""
    study_id: str
    context: StudyContext
    metadata: dict = field(default_factory=dict)
    noael: list[dict] = field(default_factory=list)
    pk_integration: dict = field(default_factory=dict)
    unified_findings: list[dict] = field(default_factory=list)
    dose_response_metrics: list[dict] = field(default_factory=list)
    recovery_verdicts: dict = field(default_factory=dict)
    target_organ_summary: list[dict] = field(default_factory=list)
    dose_groups: list[dict] = field(default_factory=list)
    study_mortality: dict = field(default_factory=dict)


# ─── Data loading ────────────────────────────────────────────


def _read_json(study_id: str, filename: str) -> dict | list | None:
    """Read a generated JSON file for a study. Returns None on any failure."""
    path = GENERATED_DIR / study_id / filename
    if not path.exists():
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        log.warning("Failed to read %s for %s: %s", filename, study_id, e)
        return None


def _read_annotation_json(study_id: str, filename: str) -> dict | None:
    """Read a per-study annotation JSON file. Returns None on any failure."""
    path = ANNOTATIONS_DIR / study_id / filename
    if not path.exists():
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        log.warning("Failed to read annotation %s for %s: %s", filename, study_id, e)
        return None


def _file_mtime_ns(study_id: str, filename: str) -> int:
    """Nanosecond mtime for cache invalidation (F7 resolution).

    Nanosecond resolution avoids Windows 100ns write/read flakiness that
    can make same-tick writes invisible to float-second mtime keys.
    """
    path = GENERATED_DIR / study_id / filename
    try:
        return path.stat().st_mtime_ns
    except OSError:
        return 0


def _annotation_mtime_ns(study_id: str, filename: str) -> int:
    """Nanosecond mtime for a per-study annotation file (Feature 4)."""
    path = ANNOTATIONS_DIR / study_id / filename
    try:
        return path.stat().st_mtime_ns
    except OSError:
        return 0


@lru_cache(maxsize=32)
def _load_study_data_cached(study_id: str, cache_key: tuple) -> StudyData:
    """Load all relevant generated JSONs for one study. Cached by mtime tuple.

    The cache_key is a tuple of nanosecond mtimes so edits to either the
    generated findings or the pathologist-source annotation invalidate the
    cache (Feature 4: pathologist annotation changes must not be masked by
    a stale lru_cache entry).
    """
    # Load metadata
    metadata = _read_json(study_id, "study_metadata_enriched.json") or {}

    # Load pathologist-source annotation (Feature 4). Optional; a missing or
    # empty annotation leaves all three fields as None (conservative default
    # drives tier=different_cro downstream).
    path_src = _read_annotation_json(study_id, "pathologist_source.json") or {}
    path_entry = path_src.get("_study") or {}
    pathologist_name = path_entry.get("pathologist_name") or None
    cro_name = path_entry.get("cro_name") or None
    grading_scale = path_entry.get("grading_scale") or None

    # Load dose groups from unified_findings (has full group data)
    uf_data = _read_json(study_id, "unified_findings.json") or {}
    dose_groups_raw = uf_data.get("dose_groups", [])

    # Detect control type from dose groups
    control_type = None
    for dg in dose_groups_raw:
        if dg.get("is_control") and dg.get("is_primary_control"):
            control_type = dg.get("control_type")
            break

    # Infer compound class
    compound_class = None
    pk_data = _read_json(study_id, "pk_integration.json") or {}
    if pk_data.get("available"):
        compound_class = pk_data.get("compound_class")

    if compound_class is None:
        # Try from study_metadata_enriched
        from services.analysis.compound_class import infer_compound_class
        ts_meta = {
            "species": metadata.get("species"),
            "strain": metadata.get("strain"),
            "route": metadata.get("route"),
            "pharmacologic_class": metadata.get("pharmacologic_class"),
            "intervention_type": metadata.get("intervention_type"),
            "treatment": metadata.get("treatment"),
            "study_title": metadata.get("study_title"),
        }
        cc_info = infer_compound_class(ts_meta, species=metadata.get("species"))
        compound_class = cc_info.get("compound_class")

    context = StudyContext(
        study_id=study_id,
        species=metadata.get("species"),
        strain=metadata.get("strain"),
        route=metadata.get("route"),
        vehicle=metadata.get("vehicle"),
        control_type=control_type,
        duration_weeks=metadata.get("duration_weeks"),
        study_type=metadata.get("study_type"),
        dose_groups=[{
            "dose_level": dg.get("dose_level"),
            "label": dg.get("label"),
            "dose_value": dg.get("dose_value"),
            "dose_unit": dg.get("dose_unit"),
            "is_control": dg.get("is_control"),
        } for dg in dose_groups_raw],
        compound_class=compound_class,
        pathologist_name=pathologist_name,
        cro_name=cro_name,
        grading_scale=grading_scale,
    )

    findings = uf_data.get("findings", [])
    noael = _read_json(study_id, "noael_summary.json") or []
    dr_metrics = _read_json(study_id, "dose_response_metrics.json") or []
    recovery = _read_json(study_id, "recovery_verdicts.json") or {}
    target_organs = _read_json(study_id, "target_organ_summary.json") or []
    mortality = _read_json(study_id, "study_mortality.json") or {}

    return StudyData(
        study_id=study_id,
        context=context,
        metadata=metadata,
        noael=noael,
        pk_integration=pk_data,
        unified_findings=findings,
        dose_response_metrics=dr_metrics,
        recovery_verdicts=recovery,
        target_organ_summary=target_organs,
        dose_groups=dose_groups_raw,
        study_mortality=mortality,
    )


def load_study_data(study_id: str) -> StudyData | None:
    """Load study data with mtime-based cache invalidation.

    Cache key is a tuple of nanosecond mtimes so annotation updates
    (Feature 4 pathologist-source) invalidate the cache even when
    the generated files have not been regenerated.
    """
    # Check study directory exists
    study_dir = GENERATED_DIR / study_id
    if not study_dir.exists():
        return None

    cache_key = (
        _file_mtime_ns(study_id, "unified_findings.json"),
        _annotation_mtime_ns(study_id, "pathologist_source.json"),
    )
    return _load_study_data_cached(study_id, cache_key)


def _clear_study_data_cache() -> None:
    """Test-only helper. Clears the lru_cache to avoid mtime-resolution
    flakiness in integration tests that write annotations and immediately
    re-load studies within the filesystem mtime resolution (F7 resolution).
    """
    _load_study_data_cached.cache_clear()


def load_multiple_studies(study_ids: list[str]) -> list[StudyData]:
    """Load data for multiple studies, skipping missing ones."""
    results = []
    for sid in study_ids:
        data = load_study_data(sid)
        if data is not None:
            results.append(data)
        else:
            log.warning("Study '%s' not found in generated data, skipping", sid)
    return results


# ─── Concordance matrix ─────────────────────────────────────


_BAND_CLASSIFICATION_COUNTERS = (
    "exact_match",
    "within_uncertainty",
    "exceeds_uncertainty",
    "within_diagnostic",
    "missing_data",
    "within_study",
)
_BAND_COUNTER_TO_KEY = {
    "exact_match": "n_exact",
    "within_uncertainty": "n_within_uncertainty",
    "exceeds_uncertainty": "n_exceeds_uncertainty",
    "within_diagnostic": "n_within_diagnostic",
    "missing_data": "n_missing_data",
    "within_study": "n_within_study",
}


def _empty_band_summary(tier: str) -> dict:
    """Zero-initialised per-pair severity_band_summary entry."""
    return {
        "n_compared": 0,
        "n_exact": 0,
        "n_within_uncertainty": 0,
        "n_exceeds_uncertainty": 0,
        "n_within_diagnostic": 0,
        "n_missing_data": 0,
        "n_within_study": 0,
        "tier": tier,
        "any_noael_boundary": False,
        "scale_heterogeneity": False,
    }


def build_concordance_matrix(studies: list[StudyData],
                             domains: list[str] | None = None) -> dict:
    """Build organ x study concordance matrix with evidence strength.

    Each cell: {present: bool, evidence: {incidence_count, severity_max,
    domains[], n_findings, severity_band_summary}}.

    ``severity_band_summary`` is a per-other-study count roll-up over
    Feature 3's per-finding severity bands for findings in this organ
    (F1 FLAWED resolution: no band on the organ-level severity_max aggregate).
    The roll-up is computed by iterating Feature 3's findings matrix rows
    filtered by ``organ_system == organ`` -- this guarantees the Feature 2/3
    consistency invariant (AC-20a) by construction.
    """
    from services.analysis.severity_band import classify_pathologist_tier

    # Collect all organ systems across studies
    all_organs: set[str] = set()
    for sd in studies:
        for f in sd.unified_findings:
            if f.get("organ_system"):
                all_organs.add(f["organ_system"])

    # Build Feature 3 findings matrix once so concordance roll-up stays in
    # lock-step with the per-finding bands (AC-20a contract).
    findings_matrix = build_findings_matrix(studies)
    findings_by_organ: dict[str, list[dict]] = {}
    for row in findings_matrix.get("findings", []):
        organ = row.get("organ_system")
        if not organ:
            continue
        findings_by_organ.setdefault(organ, []).append(row)

    # Pre-compute pathologist tier per unordered study pair.
    ctx_by_id = {sd.study_id: sd.context for sd in studies}
    study_ids = [sd.study_id for sd in studies]
    tier_cache: dict[tuple[str, str], str] = {}

    def _tier_for(a: str, b: str) -> str:
        key = tuple(sorted([a, b]))
        if key in tier_cache:
            return tier_cache[key]
        ctx_a = ctx_by_id.get(a)
        ctx_b = ctx_by_id.get(b)
        t = classify_pathologist_tier(
            ctx_a.pathologist_name if ctx_a else None,
            ctx_b.pathologist_name if ctx_b else None,
            ctx_a.cro_name if ctx_a else None,
            ctx_b.cro_name if ctx_b else None,
        )
        tier_cache[key] = t
        return t

    # Build matrix
    matrix: dict[str, dict[str, dict]] = {}
    for organ in sorted(all_organs):
        matrix[organ] = {}
        organ_rows = findings_by_organ.get(organ, [])

        for sd in studies:
            # Filter findings for this organ
            organ_findings = [
                f for f in sd.unified_findings
                if f.get("organ_system") == organ
                and (domains is None or f.get("domain") in domains)
                and f.get("treatment_related")
            ]

            if not organ_findings:
                matrix[organ][sd.study_id] = {
                    "present": False,
                    "evidence": None,
                }
                continue

            # Aggregate evidence
            finding_domains = set()
            max_severity = 0
            incidence_count = 0
            for f in organ_findings:
                finding_domains.add(f.get("domain", ""))
                sev = f.get("severity_grade_5pt")
                if sev is not None and sev > max_severity:
                    max_severity = sev
                inc = f.get("max_incidence")
                if inc is not None:
                    incidence_count += inc

            # Per-other-study severity_band_summary roll-up (F1 resolution).
            # Iterate Feature 3 row-level bands for this organ and accumulate
            # classifications for this study vs every other study.
            band_summary: dict[str, dict] = {}
            for other in study_ids:
                if other == sd.study_id:
                    continue
                band_summary[other] = _empty_band_summary(_tier_for(sd.study_id, other))

            for row in organ_rows:
                row_bands = row.get("severity_bands") or {}
                for pair_key, band in row_bands.items():
                    first, _, second = pair_key.partition("::")
                    if sd.study_id not in (first, second):
                        continue
                    other = second if first == sd.study_id else first
                    entry = band_summary.get(other)
                    if entry is None:
                        continue
                    classification = band.get("classification")
                    if classification not in _BAND_COUNTER_TO_KEY:
                        continue
                    # AC-20a invariant: Feature 2 classification counters
                    # must equal Feature 3's per-organ roll-up exactly, so
                    # update every counter Feature 3 emitted for this organ.
                    entry[_BAND_COUNTER_TO_KEY[classification]] += 1
                    if band.get("flag_noael_boundary"):
                        entry["any_noael_boundary"] = True
                    if band.get("scale_heterogeneity"):
                        entry["scale_heterogeneity"] = True
                    # n_compared counts ONLY findings shared with severity
                    # data in both studies (AC-19 semantic: "share NO
                    # canonical findings with severity data" -> n_compared=0).
                    # Within_diagnostic (present in one, absent in other) and
                    # missing_data are reported via their own counters but
                    # do not bump n_compared.
                    per_study = row.get("per_study", {})
                    ps_first = per_study.get(first, {})
                    ps_second = per_study.get(second, {})
                    if (
                        ps_first.get("present")
                        and ps_second.get("present")
                        and ps_first.get("severity_modal_at_loael") is not None
                        and ps_second.get("severity_modal_at_loael") is not None
                    ):
                        entry["n_compared"] += 1

            # Empty-pair caveat (spec line 191): keep the summary present so
            # frontends can distinguish "zero shared" from "not computed".
            for other, entry in band_summary.items():
                if entry["n_compared"] == 0:
                    entry["caveat"] = "no shared findings with severity data"

            matrix[organ][sd.study_id] = {
                "present": True,
                "evidence": {
                    "incidence_count": incidence_count,
                    "severity_max": max_severity if max_severity > 0 else None,
                    "domains": sorted(finding_domains),
                    "n_findings": len(organ_findings),
                    "severity_band_summary": band_summary,
                },
            }

    return {
        "organs": sorted(all_organs),
        "studies": [_study_context_dict(sd.context) for sd in studies],
        "matrix": matrix,
    }


# ─── NOAEL adjacent-grade severity caveats (Feature 5) ─────


def _driving_finding_modal_severity_at_dose(
    sd: StudyData,
    domain: str,
    specimen: str | None,
    finding: str,
    sex: str,
    dose_level: int,
) -> tuple[str | None, str | None, int | None]:
    """Look up a LOAEL-driving finding and return its modal severity at the
    LOAEL dose level.

    Matches unified_findings on ``(domain, specimen, finding, sex)``. Returns
    ``(canonical_testcd, organ_system, modal_grade_at_dose_level)``.

    F2 resolution: modal grade (argmax, tie-break by max) via ``_modal_grade()``.
    F10 resolution: sex is part of the lookup key.
    R2 N3 resolution: when sex == "Combined" and no exact match exists, iterate
    per-sex findings (M, F) and return the worst (highest) modal. Without this
    fallback, rodent Combined-sex NOAEL caveats would silently zero.
    """

    def _lookup_one(target_sex: str) -> tuple[str | None, str | None, int | None]:
        for f in sd.unified_findings:
            if (f.get("domain") == domain
                    and f.get("specimen") == specimen
                    and f.get("finding") == finding
                    and f.get("sex") == target_sex):
                ctc = f.get("canonical_testcd") or f.get("test_code")
                os_val = f.get("organ_system")
                for gs in f.get("group_stats", []) or []:
                    if gs.get("dose_level") == dose_level:
                        return (
                            ctc,
                            os_val,
                            _modal_grade(gs.get("severity_grade_counts") or {}),
                        )
                return (ctc, os_val, None)
        return (None, None, None)

    # Exact sex match first
    result = _lookup_one(sex)
    if result[0] is not None and result[2] is not None:
        return result

    # R2 N3 fallback: Combined-sex NOAEL -> try M and F, return worst modal
    if sex == "Combined":
        candidates: list[tuple[str, str, int]] = []
        for s in ("M", "F"):
            r = _lookup_one(s)
            if r[0] is not None and r[2] is not None:
                # mypy: narrow the tuple
                candidates.append((r[0], r[1] or "", r[2]))
        if candidates:
            best = max(candidates, key=lambda r: r[2])
            return (best[0], best[1] or None, best[2])

    return result  # whatever exact match returned, possibly (ctc, os, None)


def _compute_noael_severity_caveats(studies: list[StudyData]) -> list[dict]:
    """Flag pairs of studies whose NOAEL determinations hinge on a 1-grade
    severity shift for the same LOAEL-driving finding (Feature 5).

    Semantics: for each study and each noael_summary row, pull the
    LOAEL-driving findings (``noael_derivation.adverse_findings_at_loael``,
    from IMP-10). For each driver, resolve the finding via
    ``_driving_finding_modal_severity_at_dose`` and extract its modal
    severity at the LOAEL dose level. Key each driver by
    ``(canonical_testcd, organ_system, sex)``. Then iterate unordered
    study pairs, skip same_pathologist pairs, and emit a caveat when both
    studies share a key AND the sorted severity pair is (1,2) or (2,3).

    Output is grouped by ``(canonical_testcd, organ_system, sex)`` with inner
    per-pair observations (F11 resolution).
    """
    from services.analysis.severity_band import classify_pathologist_tier

    # Step 1: per-study per-key LOAEL-driver modal severity map.
    per_study_drivers: dict[str, dict[tuple[str, str, str], int]] = {}
    for sd in studies:
        per_key_best: dict[tuple[str, str, str], int] = {}
        for noael_row in sd.noael:
            sex = noael_row.get("sex") or "Combined"
            loael_level = noael_row.get("loael_dose_level")
            if loael_level is None:
                continue
            derivation = noael_row.get("noael_derivation", {}) or {}
            drivers_raw = derivation.get("adverse_findings_at_loael", []) or []
            for d in drivers_raw:
                ctc, os_val, sev = _driving_finding_modal_severity_at_dose(
                    sd,
                    d.get("domain", ""),
                    d.get("specimen"),
                    d.get("finding", ""),
                    sex,
                    loael_level,
                )
                if ctc is None or os_val is None or sev is None:
                    continue
                key = (ctc, os_val, sex)
                # Keep worst modal across multiple driver entries for same key
                if key not in per_key_best or sev > per_key_best[key]:
                    per_key_best[key] = sev
        per_study_drivers[sd.study_id] = per_key_best

    # Tier cache
    ctx_by_id = {sd.study_id: sd.context for sd in studies}
    tier_cache: dict[tuple[str, str], str] = {}

    def _tier_for(a: str, b: str) -> str:
        k = tuple(sorted([a, b]))
        if k in tier_cache:
            return tier_cache[k]
        ca = ctx_by_id.get(a)
        cb = ctx_by_id.get(b)
        t = classify_pathologist_tier(
            ca.pathologist_name if ca else None,
            cb.pathologist_name if cb else None,
            ca.cro_name if ca else None,
            cb.cro_name if cb else None,
        )
        tier_cache[k] = t
        return t

    # Step 2: pairwise compare, grouped by (canonical_testcd, organ_system, sex).
    grouped: dict[tuple[str, str, str], dict] = {}
    sids = [sd.study_id for sd in studies if sd.study_id in per_study_drivers]
    for i in range(len(sids)):
        for j in range(i + 1, len(sids)):
            a, b = sids[i], sids[j]
            tier = _tier_for(a, b)
            if tier == "same_pathologist":
                continue  # within-study exemption (Section 3.5)
            da = per_study_drivers[a]
            db = per_study_drivers[b]
            shared_keys = set(da.keys()) & set(db.keys())
            for key in shared_keys:
                sa, sb = da[key], db[key]
                if abs(sa - sb) != 1:
                    continue
                sorted_pair = tuple(sorted([sa, sb]))
                if sorted_pair not in {(1, 2), (2, 3)}:
                    continue  # only adversity-boundary pairs fire
                if key not in grouped:
                    grouped[key] = {
                        "canonical_testcd": key[0],
                        "organ_system": key[1],
                        "sex": key[2],
                        "observations": [],
                    }
                grouped[key]["observations"].append({
                    "study_a": a,
                    "study_b": b,
                    "severity_a": sa,
                    "severity_b": sb,
                    "delta": sb - sa,
                    "boundary": f"grade_{sorted_pair[0]}_{sorted_pair[1]}",
                    "tier": tier,
                })

    # Step 3: attach caveat template per group
    caveats: list[dict] = []
    for key, entry in grouped.items():
        entry["caveat_template"] = (
            f"NOAEL-driving finding {entry['canonical_testcd']} in "
            f"{entry['organ_system']} ({entry['sex']}) shows a 1-grade "
            f"difference between studies. This shift crosses the adversity "
            f"boundary, which is within inter-pathologist variability "
            f"(weighted kappa ~0.56, Steinbach 2024). See observations."
        )
        caveats.append(entry)

    # Stable ordering: by canonical_testcd, organ_system, sex
    caveats.sort(key=lambda e: (e["canonical_testcd"], e["organ_system"], e["sex"]))
    return caveats


# ─── Safety margin table ────────────────────────────────────


def _load_program_clinical_values(study_id: str) -> dict:
    """Load clinical dose/AUC from program annotations as fallback."""
    result: dict = {"clinical_dose": None, "clinical_auc": None}
    programs_dir = ANNOTATIONS_DIR / "_programs"
    if not programs_dir.exists():
        return result

    for prog_dir in programs_dir.iterdir():
        if not prog_dir.is_dir():
            continue
        for schema_file, key in [("clinical_dose.json", "clinical_dose"),
                                 ("clinical_auc.json", "clinical_auc")]:
            fpath = prog_dir / schema_file
            if fpath.exists():
                try:
                    with open(fpath) as f:
                        data = json.load(f)
                    for _entity, entry in data.items():
                        if entry.get("study_id") == study_id or _entity == study_id:
                            if result[key] is None:
                                result[key] = entry.get("value")
                except Exception:
                    pass
    return result


def build_safety_margin_table(studies: list[StudyData],
                              clinical_dose: float | None = None,
                              clinical_auc: float | None = None) -> dict:
    """Build NOAEL + HED + margin table per study."""
    rows = []
    for sd in studies:
        # Get NOAEL from noael_summary (prefer Combined sex)
        noael_row = next(
            (r for r in sd.noael if r.get("sex") == "Combined"),
            sd.noael[0] if sd.noael else None,
        )

        noael_dose = noael_row.get("noael_dose_value") if noael_row else None
        noael_label = noael_row.get("noael_label") if noael_row else None
        noael_level = noael_row.get("noael_dose_level") if noael_row else None
        loael_dose = None
        if noael_row and noael_row.get("loael_dose_level") is not None:
            # Find loael dose value from dose groups
            loael_level = noael_row["loael_dose_level"]
            for dg in sd.dose_groups:
                if dg.get("dose_level") == loael_level:
                    loael_dose = dg.get("dose_value")
                    break

        # PK data
        pk = sd.pk_integration
        sm = pk.get("safety_margin", {}) if pk.get("available") else {}

        # Clinical values: query params override, else program annotations, else generated
        study_clinical_dose = clinical_dose
        study_clinical_auc = clinical_auc
        if study_clinical_dose is None or study_clinical_auc is None:
            prog_vals = _load_program_clinical_values(sd.study_id)
            if study_clinical_dose is None:
                study_clinical_dose = prog_vals.get("clinical_dose")
            if study_clinical_auc is None:
                study_clinical_auc = prog_vals.get("clinical_auc")

        # Recompute AUC margin on the fly when clinical AUC is now available
        auc_based = sm.get("auc_based")
        if (study_clinical_auc is not None
                and isinstance(study_clinical_auc, (int, float))
                and study_clinical_auc > 0):
            # Check if we have NOAEL AUC from the stored margin
            noael_auc = None
            if auc_based and auc_based.get("noael_auc") is not None:
                noael_auc = auc_based["noael_auc"]
            if noael_auc is not None:
                auc_based = {
                    "available": True,
                    "margin": round(noael_auc / study_clinical_auc, 2),
                    "noael_auc": noael_auc,
                    "noael_auc_unit": auc_based.get("noael_auc_unit"),
                    "clinical_auc": study_clinical_auc,
                }

        row = {
            "study_id": sd.study_id,
            "species": sd.context.species,
            "route": sd.context.route,
            "duration_weeks": sd.context.duration_weeks,
            "noael_dose_value": noael_dose,
            "noael_label": noael_label,
            "noael_dose_level": noael_level,
            "loael_dose_value": loael_dose,
            "hed": pk.get("hed") if pk.get("available") else None,
            "safety_margin": sm,
            "auc_based_live": auc_based,
            "clinical_dose": study_clinical_dose,
            "clinical_auc": study_clinical_auc,
            "margin_method": sm.get("margin_method"),
            "primary_method": sm.get("primary_method"),
            "compound_class": sd.context.compound_class,
        }
        rows.append(row)

    return {
        "studies": [_study_context_dict(sd.context) for sd in studies],
        "rows": rows,
        "clinical_dose": clinical_dose,
        "clinical_auc": clinical_auc,
        "noael_severity_caveats": _compute_noael_severity_caveats(studies),
    }


# ─── Severity helpers (shared by findings matrix + NOAEL caveats) ──


def _modal_grade(sgc: dict | None) -> int | None:
    """Modal grade from a severity_grade_counts dict.

    Returns argmax of count distribution. Ties broken by max (deliberate
    safety-oriented choice -- R2 N7 rationale). Returns None if the dict is
    empty, None, or has no positive integer-keyed counts.
    """
    if not sgc:
        return None
    grade_items: list[tuple[int, float]] = []
    for k, v in sgc.items():
        try:
            grade = int(k)
        except (ValueError, TypeError):
            continue
        if isinstance(v, (int, float)) and v > 0:
            grade_items.append((grade, float(v)))
    if not grade_items:
        return None
    max_count = max(v for _, v in grade_items)
    modal_grades = [g for g, v in grade_items if v == max_count]
    return max(modal_grades)  # tie-break by max (R2 N7: conservative)


def _loael_level_for_sex(sd: StudyData, sex: str) -> int | None:
    """Look up the LOAEL dose level for a given sex in a study.

    Order of preference:
      1. Exact sex match in noael_summary
      2. "Combined" row (rodent Combined-sex NOAELs)
      3. None

    Returns None if the study has no LOAEL for the requested sex (e.g.
    NOAEL == highest dose, no adversity).
    """
    if not sd.noael:
        return None
    # Exact sex match first
    for row in sd.noael:
        if row.get("sex") == sex and row.get("loael_dose_level") is not None:
            return row.get("loael_dose_level")
    # Fall back to Combined
    for row in sd.noael:
        if row.get("sex") == "Combined" and row.get("loael_dose_level") is not None:
            return row.get("loael_dose_level")
    return None


def _highest_treated_dose_level(finding: dict) -> int | None:
    """Return the highest treated (dose_level > 0) entry from a finding's
    group_stats, or None if the finding has no treated groups.
    """
    treated = [
        gs for gs in finding.get("group_stats", []) or []
        if gs.get("dose_level") is not None and gs.get("dose_level") > 0
    ]
    if not treated:
        return None
    return max(gs.get("dose_level") for gs in treated)


def _finding_modal_at_dose(finding: dict, dose_level: int) -> int | None:
    """Modal severity grade for a finding at a specific dose level."""
    for gs in finding.get("group_stats", []) or []:
        if gs.get("dose_level") == dose_level:
            return _modal_grade(gs.get("severity_grade_counts") or {})
    return None


def _finding_modal_at_loael(
    finding: dict, loael_level: int | None
) -> int | None:
    """Modal grade at the study's LOAEL dose level, falling back to the
    highest treated dose if LOAEL is undefined (Feature 3 spec).
    """
    if loael_level is not None:
        m = _finding_modal_at_dose(finding, loael_level)
        if m is not None:
            return m
    # Fall back: highest treated dose
    hd = _highest_treated_dose_level(finding)
    if hd is None:
        return None
    return _finding_modal_at_dose(finding, hd)


def _finding_has_grade1_any_dose(finding: dict) -> bool:
    """True if any treated-dose group has a grade-1 count > 0 (F13 gate)."""
    for gs in finding.get("group_stats", []) or []:
        if gs.get("dose_level") is None or gs.get("dose_level") <= 0:
            continue
        sgc = gs.get("severity_grade_counts") or {}
        v = sgc.get("1")
        if v is None:
            v = sgc.get(1)
        if isinstance(v, (int, float)) and v > 0:
            return True
    return False


# ─── Findings matrix ────────────────────────────────────────


def build_findings_matrix(studies: list[StudyData],
                          organ_system: str | None = None,
                          domain: str | None = None) -> dict:
    """Build integrated findings matrix (finding x study).

    Matches findings across studies by (canonical_testcd, organ_system, sex).

    Sex-keyed rows (F10 resolution): male and female instances of the same
    canonical finding appear as separate rows. This is biologically correct
    -- a female-only hepatic hypertrophy in Study A and a male-only hepatic
    hypertrophy in Study B are different states, not an agreement.

    Per-finding severity bands (Feature 3): each row carries a
    ``severity_bands`` dict keyed by canonical pair strings (sorted study
    IDs joined by ``"::"``). The band is computed from the modal severity
    grade at each study's own LOAEL dose level -- no exposure harmonisation.
    """
    # Import here to keep the module import graph tidy.
    from services.analysis.severity_band import (
        classify_pair,
        classify_pathologist_tier,
        band_result_to_dict,
    )

    # Build canonical finding index: (canonical_testcd, organ_system, sex) -> per-study data
    # Fallback to test_code when canonical_testcd is not populated (pre-Phase 0B data)
    finding_index: dict[tuple[str, str, str], dict[str, dict]] = {}

    for sd in studies:
        for f in sd.unified_findings:
            ctc = f.get("canonical_testcd") or f.get("test_code")
            os_val = f.get("organ_system")
            sex = f.get("sex") or "Combined"
            if not ctc or not os_val:
                continue

            # Apply filters
            if organ_system and os_val != organ_system:
                continue
            if domain and f.get("domain") != domain:
                continue

            # Per-finding severity derivatives (new for Feature 3)
            loael_level = _loael_level_for_sex(sd, sex)
            modal_at_loael = _finding_modal_at_loael(f, loael_level)
            grade1_any_dose = _finding_has_grade1_any_dose(f)

            key = (ctc, os_val, sex)
            if key not in finding_index:
                finding_index[key] = {}

            # Store per-study finding summary. Merges across multiple findings
            # in the SAME (ctc, os_val, sex) bucket within a single study
            # (e.g. multi-compound studies with several matches). Merges take
            # the worst signal per-sex -- R2 N1: never across sex, because the
            # key now includes sex.
            existing = finding_index[key].get(sd.study_id)
            if existing is None:
                finding_index[key][sd.study_id] = {
                    "present": True,
                    "treatment_related": f.get("treatment_related", False),
                    "finding_class": f.get("finding_class"),
                    "severity_grade_5pt": f.get("severity_grade_5pt"),
                    "severity_modal_at_loael": modal_at_loael,
                    "has_grade1_any_dose": grade1_any_dose,
                    "max_effect_size": f.get("max_effect_size"),
                    "min_p_adj": f.get("min_p_adj"),
                    "direction": f.get("direction"),
                    "domain": f.get("domain"),
                    "dose_response_pattern": f.get("dose_response_pattern"),
                    "sex": sex,
                    "endpoint_label": f.get("endpoint_label"),
                }
            else:
                # Merge: keep worst severity, smallest p-value, largest effect.
                # Same-sex merge ONLY (R2 N1) -- the sex-keyed tuple key guarantees
                # this; two findings with different sex produce two rows.
                sev = f.get("severity_grade_5pt")
                if sev is not None and (existing["severity_grade_5pt"] is None or sev > existing["severity_grade_5pt"]):
                    existing["severity_grade_5pt"] = sev
                # severity_modal_at_loael: take the worst modal across merged findings
                if modal_at_loael is not None and (
                    existing.get("severity_modal_at_loael") is None
                    or modal_at_loael > existing["severity_modal_at_loael"]
                ):
                    existing["severity_modal_at_loael"] = modal_at_loael
                if grade1_any_dose:
                    existing["has_grade1_any_dose"] = True
                es = f.get("max_effect_size")
                if es is not None and (existing["max_effect_size"] is None or abs(es) > abs(existing["max_effect_size"])):
                    existing["max_effect_size"] = es
                p = f.get("min_p_adj")
                if p is not None and (existing["min_p_adj"] is None or p < existing["min_p_adj"]):
                    existing["min_p_adj"] = p
                if f.get("treatment_related"):
                    existing["treatment_related"] = True

    # Pre-compute pathologist tier for each unordered study pair (cached).
    study_ids = [sd.study_id for sd in studies]
    ctx_by_id = {sd.study_id: sd.context for sd in studies}
    tier_cache: dict[tuple[str, str], str] = {}

    def _get_tier(a: str, b: str) -> str:
        # Canonical unordered key
        key = tuple(sorted([a, b]))
        cached = tier_cache.get(key)
        if cached is not None:
            return cached
        ctx_a = ctx_by_id.get(a)
        ctx_b = ctx_by_id.get(b)
        tier = classify_pathologist_tier(
            ctx_a.pathologist_name if ctx_a else None,
            ctx_b.pathologist_name if ctx_b else None,
            ctx_a.cro_name if ctx_a else None,
            ctx_b.cro_name if ctx_b else None,
        )
        tier_cache[key] = tier
        return tier

    def _scale_het(a: str, b: str) -> bool:
        ctx_a = ctx_by_id.get(a)
        ctx_b = ctx_by_id.get(b)
        ga = ctx_a.grading_scale if ctx_a else None
        gb = ctx_b.grading_scale if ctx_b else None
        return bool(ga and gb and ga != gb)

    # Build result rows
    rows = []

    for (ctc, os_val, sex), per_study in sorted(finding_index.items()):
        per_study_list: dict[str, dict] = {}
        for sid in study_ids:
            if sid in per_study:
                per_study_list[sid] = per_study[sid]
            else:
                per_study_list[sid] = {"present": False}

        # Compute per-pair severity bands (F8 resolution: hoisted to row level).
        # Iterate unordered pairs of all studies in the request and emit a
        # canonical-pair-keyed entry for each.
        severity_bands: dict[str, dict] = {}
        for i in range(len(study_ids)):
            for j in range(i + 1, len(study_ids)):
                a, b = study_ids[i], study_ids[j]
                first, second = sorted([a, b])  # lex order (R2 N2)
                pa = per_study_list[first]
                pb = per_study_list[second]
                # Skip pairs where both sides are absent -- no band signal
                if not pa.get("present") and not pb.get("present"):
                    continue
                try:
                    result = classify_pair(
                        grade_a=pa.get("severity_modal_at_loael"),
                        grade_b=pb.get("severity_modal_at_loael"),
                        tier=_get_tier(first, second),
                        grade_a_present=bool(pa.get("present")),
                        grade_b_present=bool(pb.get("present")),
                        grade_a_present_any_dose=bool(pa.get("has_grade1_any_dose", False)),
                        grade_b_present_any_dose=bool(pb.get("has_grade1_any_dose", False)),
                        scale_heterogeneity=_scale_het(first, second),
                        study_a_id=first,
                        study_b_id=second,
                    )
                except ValueError:
                    # Invalid state should not occur in practice (we just
                    # constructed the pa/pb dicts from present=True/False
                    # paired with None/int grades consistently), but guard
                    # anyway so a single bad row doesn't break the response.
                    continue
                severity_bands[f"{first}::{second}"] = band_result_to_dict(result)

        rows.append({
            "canonical_testcd": ctc,
            "organ_system": os_val,
            "sex": sex,
            "per_study": per_study_list,
            "severity_bands": severity_bands,
            "n_studies_present": sum(1 for v in per_study.values() if v.get("present")),
        })

    # Sort: most cross-study findings first
    rows.sort(key=lambda r: (-r["n_studies_present"], r["organ_system"], r["canonical_testcd"], r["sex"]))

    return {
        "studies": [_study_context_dict(sd.context) for sd in studies],
        "findings": rows,
        "total_findings": len(rows),
        "filters": {"organ_system": organ_system, "domain": domain},
    }


# ─── Recovery summary ───────────────────────────────────────


def build_recovery_summary(studies: list[StudyData]) -> dict:
    """Build per-finding recovery classification per study.

    recovery_verdicts.json keys findings by "domain:specimen:finding" composite.
    We build a reverse-lookup from unified_findings.json to get canonical_testcd,
    then re-key recovery verdicts for cross-study matching.
    """
    # Build result
    recovery_index: dict[tuple[str, str], dict[str, dict]] = {}

    for sd in studies:
        per_finding = sd.recovery_verdicts.get("per_finding", {})

        # Build reverse-lookup: "domain:specimen:finding" -> canonical_testcd
        reverse_lookup: dict[str, tuple[str, str]] = {}
        for f in sd.unified_findings:
            ctc = f.get("canonical_testcd") or f.get("test_code")
            os_val = f.get("organ_system")
            dom = f.get("domain", "")
            spec = f.get("specimen", "")
            finding = f.get("finding", "")
            if ctc and os_val:
                key = f"{dom}:{spec}:{finding}"
                reverse_lookup[key] = (ctc, os_val)

        for finding_key, verdict in per_finding.items():
            canonical = reverse_lookup.get(finding_key)
            if canonical is None:
                continue

            ctc, os_val = canonical
            idx_key = (ctc, os_val)
            if idx_key not in recovery_index:
                recovery_index[idx_key] = {}

            recovery_index[idx_key][sd.study_id] = {
                "verdict": verdict.get("verdict"),
                "main_incidence": verdict.get("main_incidence"),
                "recovery_incidence": verdict.get("recovery_incidence"),
                "subjects_reversed": verdict.get("subjects_reversed"),
                "subjects_persistent": verdict.get("subjects_persistent"),
            }

    # Build rows
    study_ids = [sd.study_id for sd in studies]
    rows = []
    for (ctc, os_val), per_study in sorted(recovery_index.items()):
        per_study_list = {}
        for sid in study_ids:
            per_study_list[sid] = per_study.get(sid, {"verdict": None})

        rows.append({
            "canonical_testcd": ctc,
            "organ_system": os_val,
            "per_study": per_study_list,
        })

    return {
        "studies": [_study_context_dict(sd.context) for sd in studies],
        "findings": rows,
        "total_findings": len(rows),
    }


# ─── Cross-study dose-response ──────────────────────────────


def build_cross_study_dr(studies: list[StudyData],
                         canonical_id: str) -> dict:
    """Build cross-study dose-response for one finding (by canonical_testcd).

    Joins unified_findings (for finding metadata) with dose_response_metrics
    (for per-dose statistics) via test_code + domain + sex.
    """
    result_studies = []

    for sd in studies:
        # Find matching findings in unified_findings
        matching = [
            f for f in sd.unified_findings
            if (f.get("canonical_testcd") or f.get("test_code")) == canonical_id
        ]

        if not matching:
            result_studies.append({
                "study_id": sd.study_id,
                "context": _study_context_dict(sd.context),
                "present": False,
                "dose_response": [],
            })
            continue

        # For each matching finding, get its dose-response data
        dr_data = []
        for f in matching:
            test_code = f.get("test_code")
            dom = f.get("domain")
            sex = f.get("sex")

            # Find matching dose-response metrics
            dr_rows = [
                r for r in sd.dose_response_metrics
                if r.get("test_code") == test_code
                and r.get("domain") == dom
                and r.get("sex") == sex
            ]

            for dr in dr_rows:
                dr_data.append({
                    "dose_level": dr.get("dose_level"),
                    "dose_label": dr.get("dose_label"),
                    "sex": sex,
                    "mean": dr.get("mean"),
                    "sd": dr.get("sd"),
                    "n": dr.get("n"),
                    "effect_size": dr.get("effect_size"),
                    "p_value": dr.get("p_value"),
                    "incidence": dr.get("incidence"),
                })

        result_studies.append({
            "study_id": sd.study_id,
            "context": _study_context_dict(sd.context),
            "present": True,
            "finding_metadata": {
                "endpoint_label": matching[0].get("endpoint_label"),
                "organ_system": matching[0].get("organ_system"),
                "domain": matching[0].get("domain"),
                "treatment_related": matching[0].get("treatment_related"),
                "dose_response_pattern": matching[0].get("dose_response_pattern"),
            },
            "dose_response": dr_data,
        })

    return {
        "canonical_id": canonical_id,
        "studies": result_studies,
        "n_studies_present": sum(1 for s in result_studies if s.get("present")),
    }


# ─── Helpers ─────────────────────────────────────────────────


def _study_context_dict(ctx: StudyContext) -> dict:
    """Convert StudyContext to JSON-serializable dict."""
    return {
        "study_id": ctx.study_id,
        "species": ctx.species,
        "strain": ctx.strain,
        "route": ctx.route,
        "vehicle": ctx.vehicle,
        "control_type": ctx.control_type,
        "duration_weeks": ctx.duration_weeks,
        "study_type": ctx.study_type,
        "dose_groups": ctx.dose_groups,
        "compound_class": ctx.compound_class,
        "pathologist_name": ctx.pathologist_name,
        "cro_name": ctx.cro_name,
        "grading_scale": ctx.grading_scale,
    }
