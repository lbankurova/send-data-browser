"""FastAPI router for the SEND validation engine."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from validation.core_runner import is_core_available, list_core_rules
from validation.engine import ValidationEngine
from validation.models import (
    AffectedRecordsResponse,
    FixScriptPreviewResponse,
    ValidationResultsResponse,
    ValidationRuleResult,
    ValidationSummaryResponse,
)
from validation.scripts.registry import compute_preview

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

SCENARIOS_DIR = Path(__file__).parent.parent / "scenarios"
ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations"


def _load_rule_config(study_id: str) -> dict:
    """Load validation-rule-config annotation file for a study."""
    path = ANNOTATIONS_DIR / study_id / "validation_rule_config.json"
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _map_core_rule_type(rule_type: str) -> str:
    """Map CORE rule_type to a user-friendly category label."""
    mapping = {
        "Record Data": "Record conformance",
        "Variable Metadata": "Variable metadata",
        "Dataset Metadata": "Dataset metadata",
        "Value Level Metadata": "Value-level metadata",
    }
    return mapping.get(rule_type, rule_type or "CDISC conformance")


def _load_scenario_validation(scenario_id: str) -> dict | None:
    """Load pre-built validation results from scenario fixtures."""
    path = SCENARIOS_DIR / scenario_id / "validation_results.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None


# Module-level state (initialized by main.py lifespan)
_studies: dict = {}
_engine: ValidationEngine | None = None


def init_validation(studies: dict):
    """Initialize validation engine and auto-run validation for all studies."""
    global _studies, _engine
    _studies = studies
    _engine = ValidationEngine()

    # Auto-run validation so results are always cached on startup
    for study_id, study in studies.items():
        try:
            results = _engine.validate(study, skip_core=True)
            _engine.save_results(study_id, results)
            logger.info(
                "Validated %s: %d issues (%.1fs)",
                study_id,
                results.summary["total_issues"],
                results.summary["elapsed_seconds"],
            )
        except Exception:
            logger.exception("Auto-validation failed for %s", study_id)


def register_validation_study(study, *, validate: bool = True, auto_fix: bool = False):
    """Register a study for validation at runtime."""
    _studies[study.study_id] = study
    if _engine and validate:
        try:
            results = _engine.validate(study)
            _engine.save_results(study.study_id, results)
            if auto_fix:
                fix_counts = _engine.apply_auto_fixes(study)
                if fix_counts:
                    logger.info("Auto-fixes for %s: %s", study.study_id, fix_counts)
        except Exception:
            logger.exception("Validation failed for imported study %s", study.study_id)


def unregister_validation_study(study_id: str):
    _studies.pop(study_id, None)


def _get_study(study_id: str):
    study = _studies.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")
    return study


def _get_engine() -> ValidationEngine:
    if _engine is None:
        raise HTTPException(status_code=500, detail="Validation engine not initialized")
    return _engine


@router.post("/studies/{study_id}/validate")
async def run_validation(study_id: str):
    """Run validation on a study and cache results."""
    study = _get_study(study_id)
    engine = _get_engine()

    # Load disabled rule IDs from annotation config
    rule_config = _load_rule_config(study_id)
    disabled_ids = {
        rid for rid, cfg in rule_config.items()
        if cfg.get("enabled") is False
    } or None

    try:
        results = engine.validate(study, disabled_rule_ids=disabled_ids)
        engine.save_results(study_id, results)

        return ValidationSummaryResponse(
            total_issues=results.summary["total_issues"],
            errors=results.summary["errors"],
            warnings=results.summary["warnings"],
            info=results.summary["info"],
            domains_affected=results.summary["domains_affected"],
        )
    except Exception as e:
        logger.error(f"Validation failed for {study_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.get("/studies/{study_id}/validation/results")
async def get_validation_results(
    study_id: str,
    include_catalog: bool = Query(False),
):
    """Serve cached validation results.

    When include_catalog=True, returns ALL rules (triggered + clean + disabled)
    instead of only the triggered rules.
    """
    # Fallback to scenario fixtures for SCENARIO-* IDs
    if study_id.startswith("SCENARIO-"):
        data = _load_scenario_validation(study_id)
        if data is None:
            raise HTTPException(status_code=404, detail=f"Scenario '{study_id}' not found")
        return data

    _get_study(study_id)
    engine = _get_engine()

    cached = engine.load_cached_results(study_id)
    if cached is None:
        raise HTTPException(
            status_code=404,
            detail="Validation has not been run yet. POST to /validate first.",
        )

    rules = list(cached.rules)

    if include_catalog:
        # Load rule config annotation (disabled rules etc.)
        rule_config = _load_rule_config(study_id)
        disabled_ids = {
            rid for rid, cfg in rule_config.items()
            if cfg.get("enabled") is False
        }

        # Mark triggered rules with status
        triggered_ids = {r.rule_id for r in rules}
        for r in rules:
            r.status = "triggered"

        # --- Custom rules: synthesize clean entries ---
        for rule_def in engine.rules:
            # Check if any triggered rule already covers this definition
            if any(rid.startswith(rule_def.id) for rid in triggered_ids):
                continue

            status = "disabled" if rule_def.id in disabled_ids else "clean"
            synth = ValidationRuleResult(
                rule_id=rule_def.id,
                severity=rule_def.severity,
                domain=", ".join(rule_def.applicable_domains),
                category=rule_def.category,
                description=rule_def.description,
                records_affected=0,
                standard=f"SENDIG v{engine.standard_version}",
                section=rule_def.cdisc_reference or f"SENDIG {engine.standard_version}",
                rationale=rule_def.description,
                how_to_fix=rule_def.fix_guidance,
                cdisc_reference=rule_def.cdisc_reference or None,
                source="custom",
                status=status,
            )
            rules.append(synth)

        # --- CORE rules: synthesize clean entries for ALL CORE rules ---
        if is_core_available():
            # Get full CORE rule catalog
            core_catalog = list_core_rules(sendig_version="3-0")
            # Collect triggered CORE rule base IDs (strip domain suffix)
            triggered_core_ids = {
                r.rule_id.rsplit("-", 1)[0]
                for r in rules
                if r.source == "core"
            }
            # Also match full rule_id for exact matches
            triggered_core_full = {r.rule_id for r in rules if r.source == "core"}

            for core_rule in core_catalog:
                core_id = core_rule.get("core_id", "")
                if not core_id:
                    continue
                # Skip if this CORE rule already triggered
                if core_id in triggered_core_ids or core_id in triggered_core_full:
                    continue

                # Extract domains from rule definition
                domains_info = core_rule.get("domains", {})
                domain_list = domains_info.get("Include", []) if isinstance(domains_info, dict) else []
                domain_str = ", ".join(domain_list[:3])
                if len(domain_list) > 3:
                    domain_str += f" +{len(domain_list) - 3}"

                status = "disabled" if core_id in disabled_ids else "clean"
                synth = ValidationRuleResult(
                    rule_id=core_id,
                    severity="Info",  # CORE doesn't expose severity in catalog
                    domain=domain_str or "ALL",
                    category=_map_core_rule_type(core_rule.get("rule_type", "")),
                    description=core_rule.get("description", core_id),
                    records_affected=0,
                    standard="SENDIG v3.0",
                    section=f"CORE Rule {core_id}",
                    rationale=core_rule.get("description", ""),
                    how_to_fix="See CDISC rules catalog for detailed guidance",
                    cdisc_reference=f"https://rule-editor.cdisc.org/core/{core_id.replace('CORE-', '')}",
                    source="core",
                    status=status,
                )
                rules.append(synth)

        # Mark disabled triggered rules
        for r in rules:
            if r.status == "triggered":
                base_id = r.rule_id.rsplit("-", 1)[0] if "-" in r.rule_id else r.rule_id
                if base_id in disabled_ids or r.rule_id in disabled_ids:
                    r.status = "disabled"

    return ValidationResultsResponse(
        rules=rules,
        scripts=cached.scripts,
        summary=cached.summary,
        core_conformance=cached.core_conformance,
    )


@router.get("/studies/{study_id}/validation/results/{rule_id}/records")
async def get_affected_records(
    study_id: str,
    rule_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """Get paginated affected records for a specific rule."""
    # Fallback to scenario fixtures for SCENARIO-* IDs
    if study_id.startswith("SCENARIO-"):
        data = _load_scenario_validation(study_id)
        if data is None:
            raise HTTPException(status_code=404, detail=f"Scenario '{study_id}' not found")
        all_records = data.get("records", {}).get(rule_id, [])
        start = (page - 1) * page_size
        return AffectedRecordsResponse(
            records=all_records[start : start + page_size],
            total=len(all_records),
            page=page,
            page_size=page_size,
        )

    _get_study(study_id)
    engine = _get_engine()

    records, total = engine.get_affected_records(
        _get_study(study_id), rule_id, page, page_size
    )

    return AffectedRecordsResponse(
        records=records,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/studies/{study_id}/validation/scripts/{script_key}/preview")
async def get_script_preview(study_id: str, script_key: str, body: dict | None = None):
    """Compute before/after preview for a fix script."""
    study = _get_study(study_id)
    engine = _get_engine()

    scope = (body or {}).get("scope", "all")
    rule_id = (body or {}).get("rule_id")

    # Load domains for preview computation
    domains = engine.load_study_domains(study)
    preview = compute_preview(script_key, domains, scope, rule_id)

    return FixScriptPreviewResponse(preview=preview)
