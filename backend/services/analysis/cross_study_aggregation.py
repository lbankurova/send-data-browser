"""Cross-study aggregation service (Phase 1A + 1D).

Loads per-study generated JSONs from disk and aggregates them into
cross-study view data structures. All data access is from generated JSON
files, NOT via internal API endpoints.
"""

import json
import logging
import os
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


def _file_mtime(study_id: str, filename: str) -> float:
    """Get mtime for cache invalidation."""
    path = GENERATED_DIR / study_id / filename
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


@lru_cache(maxsize=32)
def _load_study_data_cached(study_id: str, cache_key: float) -> StudyData:
    """Load all relevant generated JSONs for one study. Cached by mtime."""
    # Load metadata
    metadata = _read_json(study_id, "study_metadata_enriched.json") or {}

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
    """Load study data with mtime-based cache invalidation."""
    # Check study directory exists
    study_dir = GENERATED_DIR / study_id
    if not study_dir.exists():
        return None

    # Use unified_findings mtime as cache key (regeneration updates this)
    cache_key = _file_mtime(study_id, "unified_findings.json")
    return _load_study_data_cached(study_id, cache_key)


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


def build_concordance_matrix(studies: list[StudyData],
                             domains: list[str] | None = None) -> dict:
    """Build organ x study concordance matrix with evidence strength.

    Each cell: {present: bool, evidence: {incidence_count, severity_max, domains[]}}
    """
    # Collect all organ systems across studies
    all_organs: set[str] = set()
    for sd in studies:
        for f in sd.unified_findings:
            if f.get("organ_system"):
                all_organs.add(f["organ_system"])

    # Build matrix
    matrix: dict[str, dict[str, dict]] = {}
    for organ in sorted(all_organs):
        matrix[organ] = {}
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

            matrix[organ][sd.study_id] = {
                "present": True,
                "evidence": {
                    "incidence_count": incidence_count,
                    "severity_max": max_severity if max_severity > 0 else None,
                    "domains": sorted(finding_domains),
                    "n_findings": len(organ_findings),
                },
            }

    return {
        "organs": sorted(all_organs),
        "studies": [_study_context_dict(sd.context) for sd in studies],
        "matrix": matrix,
    }


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
    }


# ─── Findings matrix ────────────────────────────────────────


def build_findings_matrix(studies: list[StudyData],
                          organ_system: str | None = None,
                          domain: str | None = None) -> dict:
    """Build integrated findings matrix (finding x study).

    Matches findings across studies by canonical_testcd + organ_system.
    """
    # Build canonical finding index: (canonical_testcd, organ_system) -> per-study data
    # Fallback to test_code when canonical_testcd is not populated (pre-Phase 0B data)
    finding_index: dict[tuple[str, str], dict[str, dict]] = {}

    for sd in studies:
        for f in sd.unified_findings:
            ctc = f.get("canonical_testcd") or f.get("test_code")
            os_val = f.get("organ_system")
            if not ctc or not os_val:
                continue

            # Apply filters
            if organ_system and os_val != organ_system:
                continue
            if domain and f.get("domain") != domain:
                continue

            key = (ctc, os_val)
            if key not in finding_index:
                finding_index[key] = {}

            # Store per-study finding summary
            existing = finding_index[key].get(sd.study_id)
            if existing is None:
                finding_index[key][sd.study_id] = {
                    "present": True,
                    "treatment_related": f.get("treatment_related", False),
                    "finding_class": f.get("finding_class"),
                    "severity_grade_5pt": f.get("severity_grade_5pt"),
                    "max_effect_size": f.get("max_effect_size"),
                    "min_p_adj": f.get("min_p_adj"),
                    "direction": f.get("direction"),
                    "domain": f.get("domain"),
                    "dose_response_pattern": f.get("dose_response_pattern"),
                    "sex": f.get("sex"),
                    "endpoint_label": f.get("endpoint_label"),
                }
            else:
                # Merge: keep worst severity, smallest p-value, largest effect
                sev = f.get("severity_grade_5pt")
                if sev is not None and (existing["severity_grade_5pt"] is None or sev > existing["severity_grade_5pt"]):
                    existing["severity_grade_5pt"] = sev
                es = f.get("max_effect_size")
                if es is not None and (existing["max_effect_size"] is None or abs(es) > abs(existing["max_effect_size"])):
                    existing["max_effect_size"] = es
                p = f.get("min_p_adj")
                if p is not None and (existing["min_p_adj"] is None or p < existing["min_p_adj"]):
                    existing["min_p_adj"] = p
                if f.get("treatment_related"):
                    existing["treatment_related"] = True

    # Build result rows
    rows = []
    study_ids = [sd.study_id for sd in studies]

    for (ctc, os_val), per_study in sorted(finding_index.items()):
        per_study_list = {}
        for sid in study_ids:
            if sid in per_study:
                per_study_list[sid] = per_study[sid]
            else:
                per_study_list[sid] = {"present": False}

        rows.append({
            "canonical_testcd": ctc,
            "organ_system": os_val,
            "per_study": per_study_list,
            "n_studies_present": sum(1 for v in per_study.values() if v.get("present")),
        })

    # Sort: most cross-study findings first
    rows.sort(key=lambda r: (-r["n_studies_present"], r["organ_system"], r["canonical_testcd"]))

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
    }
