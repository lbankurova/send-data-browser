"""Serves pre-generated analysis JSON files and static HTML.

For parameterized views, non-default settings trigger on-demand pipeline
computation with file-based caching.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import numpy as np

from services.study_discovery import StudyInfo
from services.analysis.analysis_settings import AnalysisSettings, parse_settings_from_query, load_scoring_params
from services.analysis.analysis_cache import (
    read_cache, write_cache, invalidate_study,
    acquire_compute_lock, release_compute_lock, wait_for_cache,
)
from services.analysis.override_reader import (
    get_last_dosing_day_override,
    apply_pattern_overrides,
    apply_tox_overrides,
    apply_noael_overrides,
    load_all_pattern_overrides,
    load_tox_overrides,
    load_noael_overrides,
    VALID_PATTERN_OVERRIDES,
    _resolve_override,
)
from services.analysis.classification import determine_treatment_related, assess_finding

log = logging.getLogger(__name__)

GENERATED_DIR = Path(__file__).parent.parent / "generated"
SCENARIOS_DIR = Path(__file__).parent.parent / "scenarios"

VALID_VIEW_NAMES = {
    "study-signal-summary",
    "target-organ-summary",
    "dose-response-metrics",
    "organ-evidence-detail",
    "lesion-severity-summary",
    "adverse-effect-summary",
    "noael-summary",
    "rule-results",
    "finding-dose-trends",
    "subject-context",
    "provenance-messages",
    "study-metadata-enriched",
    "study-mortality",
    "tumor-summary",
    "food-consumption-summary",
    "pk-integration",
    "cross-animal-flags",
    "unified-findings",
    "subject-syndromes",
    "syndrome-rollup",
    "subject-onset-days",
    "recovery-verdicts",
    "subject-noael-overlay",
    "control-comparison",
    "assay-validation",
    "animal-influence",
    "subject-similarity",
    "subject-sentinel",
    "subject-correlations",
}

# The 10 view names that the parameterized pipeline produces
PARAMETERIZED_VIEWS = {
    "study-signal-summary", "target-organ-summary", "dose-response-metrics",
    "organ-evidence-detail", "lesion-severity-summary", "adverse-effect-summary",
    "noael-summary", "finding-dose-trends", "rule-results",
    "unified-findings",
}

# Map URL slugs to file names (slug uses hyphens, files use underscores)
_slug_to_file = {slug: slug.replace("-", "_") + ".json" for slug in VALID_VIEW_NAMES}

router = APIRouter(prefix="/api", tags=["analysis-views"])

# Reference to studies (set at startup)
_studies: dict[str, StudyInfo] = {}


def init_analysis_views(studies: dict[str, StudyInfo]):
    _studies.clear()
    _studies.update(studies)


def _resolve_study(study_id: str) -> StudyInfo:
    if study_id not in _studies:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")
    return _studies[study_id]


# ---------------------------------------------------------------------------
# HTTP caching helpers
# ---------------------------------------------------------------------------

ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations"

# Views where user overrides affect the response (must include override
# file mtimes in ETag to avoid serving stale data after annotation edits).
_OVERRIDE_AFFECTED_VIEWS = {"unified-findings", "noael-summary"}

_OVERRIDE_FILES = ("pattern_overrides.json", "tox_findings.json", "noael_overrides.json", "animal_exclusions.json")


def _compute_etag(study_id: str, file_name: str, view_name: str, cache_key: str | None = None) -> str | None:
    """Build an ETag from file mtimes (generated data + overrides when applicable).

    Returns a quoted ETag string like '"abc123"', or None if file not found.
    """
    if cache_key:
        # Parameterized (non-default settings): ETag = settings hash + cached file mtime + override mtimes.
        # The cached file mtime ensures the ETag changes when the pipeline recomputes
        # (e.g. after an enrichment bugfix), so browsers refetch the body instead of
        # getting a stale 304.  Without this, the ETag was content-independent and
        # clients could pin a buggy response indefinitely (GAP-249/GAP-250).
        parts = [cache_key]
        cached_path = GENERATED_DIR / study_id / ".settings_cache" / cache_key / file_name
        if cached_path.exists():
            parts.append(str(cached_path.stat().st_mtime_ns))
    else:
        # Default settings: ETag = generated file mtime
        file_path = GENERATED_DIR / study_id / file_name
        if not file_path.exists():
            file_path = SCENARIOS_DIR / study_id / file_name
        if not file_path.exists():
            return None
        parts = [str(file_path.stat().st_mtime_ns)]

    # Include override file mtimes for views that apply overrides
    if view_name in _OVERRIDE_AFFECTED_VIEWS:
        ann_dir = ANNOTATIONS_DIR / study_id
        for ovr_file in _OVERRIDE_FILES:
            ovr_path = ann_dir / ovr_file
            if ovr_path.exists():
                parts.append(str(ovr_path.stat().st_mtime_ns))

    import hashlib
    raw = "|".join(parts)
    return f'"{hashlib.md5(raw.encode()).hexdigest()[:16]}"'


def _set_cache_headers(response: Response, etag: str | None):
    """Set Cache-Control and ETag on the response.

    Always ``max-age=0, must-revalidate`` so browsers revalidate every
    request (ETag-based 304 for efficiency).  The previous ``max-age=300``
    caused stale responses to pin in browser disk cache indefinitely
    after enrichment-class regressions (GAP-249/GAP-250).
    """
    response.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
    if etag:
        response.headers["ETag"] = etag


def _load_mortality(study_id: str) -> dict | None:
    """Read study_mortality.json from generated dir."""
    path = GENERATED_DIR / study_id / "study_mortality.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=64)
def _load_from_disk_cached(file_path: str, _mtime_ns: int):
    """Deserialize a JSON file with in-memory LRU caching.

    Keyed on (path, mtime) so cache auto-invalidates when the file changes.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_from_disk(study_id: str, file_name: str):
    """Load a JSON file from generated/ or scenarios/ fallback, cached in memory."""
    file_path = GENERATED_DIR / study_id / file_name
    if not file_path.exists():
        file_path = SCENARIOS_DIR / study_id / file_name
    if not file_path.exists():
        return None
    mtime_ns = file_path.stat().st_mtime_ns
    return _load_from_disk_cached(str(file_path), mtime_ns)


# Fields produced by the generator for internal computation (e.g. correlations)
# but never consumed by the frontend.  Strip before serving to reduce payload.
_STRIP_FIELDS = ("raw_subject_values",)


def _strip_fields(findings: list[dict]) -> list[dict]:
    """Remove generator-internal fields from findings (creates new dicts)."""
    return [{k: v for k, v in f.items() if k not in _STRIP_FIELDS} for f in findings]


def _apply_finding_overrides(findings: list[dict], study_id: str) -> list[dict]:
    """Apply all finding-level overrides in precedence order.

    Precedence (applied in order, later overrides earlier):
      Level 1: Pattern overrides (existing)
      Level 3: Tox assessment overrides (highest finding-level authority)

    After all overrides, full D1-D9 confidence recomputation runs.
    compute_all_confidence() already does full recomputation (same function
    called after pattern overrides in override_reader.py).
    """
    findings = apply_pattern_overrides(findings, study_id)
    tox_overrides = load_tox_overrides(study_id)
    if tox_overrides:
        findings = apply_tox_overrides(findings, study_id)
        # Full D1-D9 confidence recomputation. Required because tox overrides
        # change treatment_related (D5 cross-sex concordance), finding_class
        # (D2 pattern quality interpretation), and corroboration counts (D3).
        from services.analysis.confidence import compute_all_confidence
        compute_all_confidence(findings)
    return findings


def _apply_overrides(data, study_id: str, view_name: str):
    """Apply user annotation overrides and strip internal fields before serving.

    Handles:
      - unified-findings: pattern overrides + tox overrides + strip
      - noael-summary: recompute from finding-level overrides, then
        apply expert NOAEL override on top

    Works on copies to avoid mutating LRU-cached originals.
    """
    if view_name == "unified-findings" and isinstance(data, dict):
        findings = data.get("findings")
        if findings and isinstance(findings, list):
            has_pattern = bool(load_all_pattern_overrides(study_id))
            has_tox = bool(load_tox_overrides(study_id))
            if not has_pattern and not has_tox:
                return {**data, "findings": _strip_fields(findings)}
            findings_copy = [{**f} for f in findings]
            findings_copy = _apply_finding_overrides(findings_copy, study_id)
            return {**data, "findings": _strip_fields(findings_copy)}

    if view_name == "noael-summary" and isinstance(data, list):
        noael_result = [{**row} for row in data]

        # Step 1: Recompute NOAEL from finding-level overrides FIRST.
        # Check both pattern and tox overrides — either can change TR/finding_class.
        has_pattern = bool(load_all_pattern_overrides(study_id))
        has_tox = bool(load_tox_overrides(study_id))
        if has_pattern or has_tox:
            from routers.analyses import _load_unified_findings
            try:
                unified = _load_unified_findings(study_id)
            except Exception:
                unified = None
            if unified:
                uf_copy = [{**f} for f in unified.get("findings", [])]
                overridden = _apply_finding_overrides(uf_copy, study_id)
                # Check if any finding was actually changed
                has_changes = any(
                    f.get("has_tox_override") or f.get("_pattern_override")
                    for f in overridden
                )
                if has_changes:
                    dose_groups = unified.get("dose_groups", [])
                    mortality = _load_mortality(study_id)
                    scoring = load_scoring_params(study_id)
                    has_control = unified.get("has_concurrent_control", True)
                    noael_result = _recompute_noael(
                        overridden, dose_groups, mortality, scoring,
                        noael_result, has_control,
                        study_id=study_id,
                    )

        # Step 2: Apply NOAEL expert overrides AFTER recomputation.
        # Expert NOAEL is the final authority (Level 4 > recomputation).
        noael_result = apply_noael_overrides(noael_result, study_id)
        return noael_result

    return data


def _recompute_noael(
    overridden_findings: list[dict],
    dose_groups: list[dict],
    mortality: dict | None,
    params,
    original_noael: list[dict],
    has_concurrent_control: bool = True,
    study_id: str | None = None,
) -> list[dict]:
    """Full NOAEL recomputation using overridden findings.

    Calls build_noael_summary() with the post-override findings list.
    Re-runs ALL logic: LOAEL identification, NOAEL bracketing, mortality
    cap, confidence penalties, derivation trace.

    Adds provenance to rows where the NOAEL shifted. ``study_id`` is
    plumbed through to resolve study_pharmacologic_class for C7 wiring;
    when None (e.g., legacy callers), C7 silently no-ops.
    """
    from generator.view_dataframes import build_noael_summary
    from services.analysis.compound_class import resolve_pharmacologic_class

    study_pharmacologic_class = (
        resolve_pharmacologic_class(study_id) if study_id else None
    )
    recomputed = build_noael_summary(
        overridden_findings, dose_groups,
        mortality=mortality, params=params,
        has_concurrent_control=has_concurrent_control,
        study_pharmacologic_class=study_pharmacologic_class,
    )

    # Build lookup of original NOAEL for provenance
    orig_by_sex = {r["sex"]: r for r in original_noael}
    for row in recomputed:
        sex = row.get("sex", "")
        orig = orig_by_sex.get(sex)
        if orig and orig.get("noael_dose_level") != row.get("noael_dose_level"):
            row["_recomputed"] = True
            row["_original_noael_dose_level"] = orig.get("noael_dose_level")
            row["_original_noael_dose_value"] = orig.get("noael_dose_value")
    return recomputed


# Regenerate endpoint — runs the full generation pipeline synchronously.
# Plain `def` (not `async def`) so FastAPI runs it in a threadpool,
# keeping the event loop responsive during the ~10s rebuild.
@router.post("/studies/{study_id}/regenerate")
def regenerate_study(study_id: str):
    """Re-run the generator pipeline for a study.

    Reads analysis settings (e.g. last_dosing_day_override) from
    annotations and rebuilds all generated JSON files.
    """
    from generator.generate import generate

    if "/" in study_id or "\\" in study_id or ".." in study_id:
        raise HTTPException(status_code=400, detail="Invalid study ID")

    try:
        generate(study_id)
    except SystemExit:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")

    # Invalidate caches after regeneration
    invalidate_study(study_id)
    _load_from_disk_cached.cache_clear()
    from routers.analyses import invalidate_findings_cache
    invalidate_findings_cache(study_id)

    # Read back the enriched metadata for response
    meta_path = GENERATED_DIR / study_id / "study_metadata_enriched.json"
    last_dosing_day = None
    last_dosing_day_override = None
    findings_count = 0
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
        last_dosing_day = meta.get("last_dosing_day")
        last_dosing_day_override = meta.get("last_dosing_day_override")

    # Count findings from signal summary
    signal_path = GENERATED_DIR / study_id / "study_signal_summary.json"
    if signal_path.exists():
        findings_count = len(json.loads(signal_path.read_text()))

    return {
        "status": "ok",
        "last_dosing_day": last_dosing_day,
        "last_dosing_day_override": last_dosing_day_override,
        "findings_count": findings_count,
    }


# Static route MUST be defined before the wildcard route
@router.get("/studies/{study_id}/analysis/static/{chart_name}")
async def get_static_chart(study_id: str, chart_name: str):
    """Return static HTML chart."""
    if "/" in chart_name or "\\" in chart_name or ".." in chart_name:
        raise HTTPException(status_code=400, detail="Invalid chart name")

    if not chart_name.endswith(".html"):
        chart_name += ".html"

    file_path = GENERATED_DIR / study_id / "static" / chart_name

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Chart not found: {chart_name}")

    with open(file_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@router.get("/studies/{study_id}/analysis/{view_name}")
def get_analysis_view(
    study_id: str,
    view_name: str,
    request: Request,
    response: Response,
    settings: AnalysisSettings = Depends(parse_settings_from_query),
):
    """Return analysis view JSON, parameterized by settings.

    Default settings serve pre-generated files (zero overhead).
    Non-default settings go through cache -> pipeline.

    Plain `def` (not `async def`) so FastAPI runs it in a threadpool
    during the ~2-5s computation for non-default settings.
    """
    if view_name not in VALID_VIEW_NAMES:
        raise HTTPException(status_code=404, detail=f"Unknown view: {view_name}. Has control-comparison: {'control-comparison' in VALID_VIEW_NAMES}. Last 3: {sorted(VALID_VIEW_NAMES)[-3:]}")

    file_name = _slug_to_file[view_name]

    # Load expert scoring params (defaults if none saved)
    scoring = load_scoring_params(study_id)

    # Non-parameterized views (mortality, context, PK, etc.) or all defaults -> from disk
    if view_name not in PARAMETERIZED_VIEWS or (settings.is_default() and scoring.is_default()):
        data = _load_from_disk(study_id, file_name)
        if data is None:
            raise HTTPException(
                status_code=404,
                detail=f"Analysis data not generated for {study_id}/{view_name}. Run the generator first.",
            )

        # HTTP caching: default views are stable -- ETag for 304, must-revalidate
        etag = _compute_etag(study_id, file_name, view_name)
        if etag and request.headers.get("if-none-match") == etag:
            return Response(status_code=304)
        _set_cache_headers(response, etag)

        return _apply_overrides(data, study_id, view_name)

    # Non-default settings or scoring -> cache -> pipeline
    cache_key = settings.settings_hash(scoring=scoring)
    cached = read_cache(study_id, cache_key, view_name)
    if cached is not None:
        etag = _compute_etag(study_id, file_name, view_name, cache_key=cache_key)
        if etag and request.headers.get("if-none-match") == etag:
            return Response(status_code=304)
        _set_cache_headers(response, etag)
        return _apply_overrides(cached, study_id, view_name)

    # Cache miss -> file-based lock prevents thundering herd across workers.
    # Lock is keyed on settings_hash: only requests with the SAME non-default
    # settings are serialized; different settings combinations run independently.
    if acquire_compute_lock(study_id, cache_key):
        try:
            # Double-check: cache may have appeared between our read and lock
            cached = read_cache(study_id, cache_key, view_name)
            if cached is not None:
                return _apply_overrides(cached, study_id, view_name)

            log.info("Cache miss for %s/%s (hash=%s), computing...", study_id, view_name, cache_key)
            study = _resolve_study(study_id)

            from services.analysis.parameterized_pipeline import ParameterizedAnalysisPipeline

            pipeline = ParameterizedAnalysisPipeline(study)
            mortality = _load_mortality(study_id)
            early_deaths = mortality.get("early_death_subjects") if mortality else None
            ldd_override = get_last_dosing_day_override(study_id)

            views = pipeline.run(
                settings,
                early_death_subjects=early_deaths,
                last_dosing_day_override=ldd_override,
                mortality=mortality,
            )
            write_cache(study_id, cache_key, views)
        finally:
            release_compute_lock(study_id, cache_key)
    else:
        # Another worker/thread is computing — wait for result
        log.info("Waiting for pipeline %s/%s (hash=%s)...", study_id, view_name, cache_key)
        cached = wait_for_cache(study_id, cache_key, view_name)
        if cached is not None:
            _set_cache_headers(response, _compute_etag(study_id, file_name, view_name, cache_key=cache_key))
            return _apply_overrides(cached, study_id, view_name)
        raise HTTPException(status_code=503, detail="Pipeline computation timed out")

    # Return the requested view from cache
    cached = read_cache(study_id, cache_key, view_name)
    if cached is None:
        raise HTTPException(status_code=500, detail=f"Pipeline did not produce {view_name}")
    _set_cache_headers(response, _compute_etag(study_id, file_name, view_name, cache_key=cache_key))
    return _apply_overrides(cached, study_id, view_name)


# ---------------------------------------------------------------------------
# Pattern override preview (FF-01)
# ---------------------------------------------------------------------------

class PatternOverridePreviewRequest(BaseModel):
    finding_id: str
    proposed_pattern: str


@router.post("/studies/{study_id}/analyses/pattern-override-preview")
async def pattern_override_preview(study_id: str, body: PatternOverridePreviewRequest):
    """Simulate a pattern override without saving — returns downstream changes.

    Read-only: loads the finding, applies the proposed pattern on a copy,
    re-derives treatment_related and finding_class, and returns what would change.
    """
    if body.proposed_pattern not in VALID_PATTERN_OVERRIDES:
        raise HTTPException(status_code=400,
                            detail=f"Invalid pattern: {body.proposed_pattern}")

    # Reuse in-memory cached loader from analyses.py
    from routers.analyses import _load_unified_findings
    data = _load_unified_findings(study_id)

    findings = data.get("findings", [])
    original = next((f for f in findings if f.get("id") == body.finding_id), None)
    if original is None:
        raise HTTPException(status_code=404,
                            detail=f"Finding not found: {body.finding_id}")

    # Simulate on a shallow copy
    sim = {**original}
    direction = sim.get("direction", "down") or "down"
    sim["dose_response_pattern"] = _resolve_override(body.proposed_pattern, direction)
    sim["treatment_related"] = determine_treatment_related(sim)
    sim["finding_class"] = assess_finding(sim)

    # Re-derive confidence (D2 reads pattern, D5 reads sibling finding_class)
    from services.analysis.confidence import compute_confidence
    opposite = {"M": "F", "F": "M"}
    opp_sex = opposite.get(sim.get("sex", ""), "")
    sibling = next(
        (f for f in findings
         if f.get("endpoint_label") == sim.get("endpoint_label")
         and f.get("day") == sim.get("day")
         and f.get("sex") == opp_sex),
        None,
    )
    sim["_confidence"] = compute_confidence(sim, sibling)

    original_confidence = original.get("_confidence", {})
    return {
        "finding_id": body.finding_id,
        "original_pattern": original.get("dose_response_pattern"),
        "proposed_pattern": body.proposed_pattern,
        "resolved_pattern": sim["dose_response_pattern"],
        "treatment_related": {
            "original": original.get("treatment_related"),
            "proposed": sim["treatment_related"],
            "changed": original.get("treatment_related") != sim["treatment_related"],
        },
        "finding_class": {
            "original": original.get("finding_class"),
            "proposed": sim["finding_class"],
            "changed": original.get("finding_class") != sim["finding_class"],
        },
        "confidence": {
            "original": original_confidence.get("grade"),
            "proposed": sim["_confidence"]["grade"],
            "changed": original_confidence.get("grade") != sim["_confidence"]["grade"],
        },
    }


# ---------------------------------------------------------------------------
# Exclusion impact preview
# ---------------------------------------------------------------------------

class ExclusionPreviewRequest(BaseModel):
    endpoint_label: str
    domain: str
    excluded_subjects: list[str]


@router.post("/studies/{study_id}/exclusion-preview")
def exclusion_preview(study_id: str, body: ExclusionPreviewRequest):
    """Day-scoped, per-dose-group exclusion impact preview.

    Returns one entry per affected dose group, each at the worst-case
    LOO-flagged day for that group.  Only evaluates days where at least
    one excluded subject has ratio < DESTABILISING_LOO_THRESHOLD.
    """
    from routers.analyses import _load_unified_findings
    from services.analysis.statistics import compute_effect_size, compute_g_lower
    from generator.animal_influence import DESTABILISING_LOO_THRESHOLD

    data = _load_unified_findings(study_id)
    findings = data.get("findings", [])
    excluded_set = set(body.excluded_subjects)

    # Step 1: candidate findings -- matching endpoint/domain with rsv + loo data
    candidates = [
        f for f in findings
        if (f.get("endpoint_label") or f.get("finding")) == body.endpoint_label
        and f.get("domain") == body.domain
        and f.get("raw_subject_values") is not None
        and f.get("loo_per_subject") is not None
    ]

    if not candidates:
        return {"groups": []}

    # Per-finding results, keyed by treated dose_level
    # Each value: list of {dose_level, day, impact, result_dict}
    group_results: dict[int, list] = {}

    for f in candidates:
        loo = f.get("loo_per_subject", {})
        rsv = f.get("raw_subject_values")
        if not rsv or len(rsv) < 2:
            continue

        # Step 2: LOO-day filter -- any excluded subject LOO-flagged on this finding?
        any_flagged = False
        for uid in excluded_set:
            entry = loo.get(uid)
            if entry and entry.get("ratio", 1.0) < DESTABILISING_LOO_THRESHOLD:
                any_flagged = True
                break
        if not any_flagged:
            continue

        # Step 3a: determine the pairwise comparison (single treated group).
        # loo_per_subject originates from a single pairwise (the max-g_lower
        # comparison), so exactly one non-zero dose_level exists.
        treated_levels = {
            e.get("dose_level") for e in loo.values() if e.get("dose_level", 0) != 0
        }
        if len(treated_levels) != 1:
            continue
        treated_idx = next(iter(treated_levels))
        if treated_idx < 1 or treated_idx >= len(rsv):
            continue

        ctrl_dict = rsv[0]
        treated_dict = rsv[treated_idx]
        day = f.get("day")

        # Step 3b: before
        ctrl_vals = np.array(list(ctrl_dict.values()), dtype=float)
        treat_vals = np.array(list(treated_dict.values()), dtype=float)
        before_g = compute_effect_size(ctrl_vals, treat_vals)
        if before_g is None:
            continue

        # Step 3c: after -- remove ALL excluded subjects from both groups
        ctrl_filtered = np.array(
            [v for uid, v in ctrl_dict.items() if uid not in excluded_set],
            dtype=float,
        )
        treat_filtered = np.array(
            [v for uid, v in treated_dict.items() if uid not in excluded_set],
            dtype=float,
        )
        after_g = compute_effect_size(ctrl_filtered, treat_filtered)

        before_gl = compute_g_lower(before_g, len(ctrl_vals), len(treat_vals))
        after_gl = (
            compute_g_lower(after_g, len(ctrl_filtered), len(treat_filtered))
            if after_g is not None else None
        )

        # Step 3d: impact score
        g_delta = abs(abs(before_g) - (abs(after_g) if after_g is not None else 0.0))
        gl_drop = (before_gl or 0.0) - (after_gl or 0.0)
        impact = max(g_delta, gl_drop)

        entry = {
            "dose_level": treated_idx,
            "day": day,
            "impact": impact,
            "result": {
                "dose_level": treated_idx,
                "day": day,
                "before": {
                    "g": round(abs(before_g), 4),
                    "g_lower": round(before_gl, 4) if before_gl is not None else None,
                    "n_ctrl": int(len(ctrl_vals)),
                    "n_treated": int(len(treat_vals)),
                },
                "after": {
                    "g": round(abs(after_g), 4) if after_g is not None else None,
                    "g_lower": round(after_gl, 4) if after_gl is not None else None,
                    "n_ctrl": int(len(ctrl_filtered)),
                    "n_treated": int(len(treat_filtered)),
                },
            },
        }
        group_results.setdefault(treated_idx, []).append(entry)

    # Step 4: pick worst day per dose group
    groups = []
    for dose_level in sorted(group_results):
        best = max(group_results[dose_level], key=lambda e: e["impact"])
        groups.append(best["result"])

    return {"groups": groups}


# ---------------------------------------------------------------------------
# HCD references — user-uploaded + system, merged with priority chain
# ---------------------------------------------------------------------------

@router.get("/studies/{study_id}/hcd-references")
async def get_hcd_references(study_id: str):
    """Return merged HCD references for a study (user-uploaded priority, system fallback)."""
    study = _resolve_study(study_id)
    from services.analysis.hcd import get_hcd_references as _get_hcd_refs
    return _get_hcd_refs(study, study_id)
