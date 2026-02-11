"""API router for Design Mode scenario studies."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from scenarios.registry import get_scenario, list_scenarios

router = APIRouter(prefix="/api", tags=["scenarios"])


@router.get("/scenarios")
def get_scenarios():
    """List all available scenario studies for the landing page."""
    return [
        {
            "scenario_id": s.scenario_id,
            "name": s.name,
            "description": s.description,
            "species": s.species,
            "study_type": s.study_type,
            "subjects": s.subjects,
            "domain_count": s.domain_count,
            "validation_status": s.validation_status,
        }
        for s in list_scenarios()
    ]


@router.get("/scenarios/{scenario_id}/expected-issues")
def get_expected_issues(scenario_id: str):
    """Return expected rule IDs and metadata for QA verification."""
    scenario = get_scenario(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")

    return {
        "scenario_id": scenario.scenario_id,
        "name": scenario.name,
        "description": scenario.description,
        "validation_status": scenario.validation_status,
        "expected_issues": {
            rule_id: {"severity": issue.severity, "count": issue.count}
            for rule_id, issue in scenario.expected_issues.items()
        },
        "what_to_check": scenario.what_to_check,
    }
