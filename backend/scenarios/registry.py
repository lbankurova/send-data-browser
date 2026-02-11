"""Scenario definitions for Design Mode QA testing."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

SCENARIOS_DIR = Path(__file__).parent


@dataclass
class ExpectedIssue:
    severity: str  # "Error" | "Warning" | "Info"
    count: int


@dataclass
class ScenarioDefinition:
    scenario_id: str
    name: str
    description: str
    species: str | None = None
    study_type: str | None = None
    subjects: int | None = None
    domain_count: int = 0
    validation_status: str = "Not Run"  # Pass | Warnings | Fail | Not Run
    expected_issues: dict[str, ExpectedIssue] = field(default_factory=dict)
    what_to_check: list[str] = field(default_factory=list)


SCENARIOS: dict[str, ScenarioDefinition] = {
    "SCENARIO-001": ScenarioDefinition(
        scenario_id="SCENARIO-001",
        name="Empty study",
        description="TS domain only, DM with 0 subjects. Tests empty states across all views.",
        species="Rat",
        study_type="28-Day Oral Toxicity",
        subjects=0,
        domain_count=2,
        validation_status="Fail",
        expected_issues={
            "SD-004": ExpectedIssue(severity="Error", count=1),
            "CORE-SEND0035-TS": ExpectedIssue(severity="Error", count=1),
            "CORE-SEND0036-DM": ExpectedIssue(severity="Error", count=1),
        },
        what_to_check=[
            "Does every view have a proper empty state? No blank screens, no crashes.",
            "Is the empty state message helpful?",
            "Does the navigation tree handle empty domains gracefully?",
        ],
    ),
    "SCENARIO-002": ScenarioDefinition(
        scenario_id="SCENARIO-002",
        name="Perfect study",
        description="Clean, well-formed study with no issues. Golden path for all views.",
        species="Rat",
        study_type="28-Day Oral Toxicity",
        subjects=80,
        domain_count=12,
        validation_status="Pass",
        expected_issues={},
        what_to_check=[
            "Does the happy path look polished? No visual glitches.",
            "Are dose-response signals obvious in the charts?",
            "Does cross-domain correlation work (lab + organ weight + histopath)?",
        ],
    ),
    "SCENARIO-003": ScenarioDefinition(
        scenario_id="SCENARIO-003",
        name="No control group",
        description="3 dose groups, no vehicle control. Tests graceful degradation of comparative statistics.",
        species="Rat",
        study_type="28-Day Oral Toxicity",
        subjects=60,
        domain_count=10,
        validation_status="Warnings",
        expected_issues={
            "SD-003": ExpectedIssue(severity="Warning", count=1),
            "CORE-SEND0073-EX": ExpectedIssue(severity="Warning", count=1),
            "CORE-SEND0035-TS": ExpectedIssue(severity="Info", count=1),
        },
        what_to_check=[
            "Are comparative stat columns clearly blank (not zero, not 'N/A')?",
            "Does the provenance message explain the gap clearly?",
            "Does the [Review] link navigate correctly to validation?",
        ],
    ),
    "SCENARIO-004": ScenarioDefinition(
        scenario_id="SCENARIO-004",
        name="Broken metadata",
        description="Multiple enrichment issues: orphaned subjects, label mismatches, missing TS params.",
        species="Rat",
        study_type="28-Day Oral Toxicity",
        subjects=80,
        domain_count=10,
        validation_status="Fail",
        expected_issues={
            "SD-001": ExpectedIssue(severity="Error", count=1),
            "SD-004": ExpectedIssue(severity="Error", count=1),
            "SD-007": ExpectedIssue(severity="Error", count=1),
            "CORE-SEND0035-TS": ExpectedIssue(severity="Error", count=1),
            "CORE-SEND0074-DM": ExpectedIssue(severity="Warning", count=1),
            "CORE-SEND0075-DM": ExpectedIssue(severity="Warning", count=1),
        },
        what_to_check=[
            "Can the user work through multiple issues sequentially?",
            "Is the ERROR (SD-007) visually distinct from WARNINGs?",
            "Does resolving one issue update provenance messages?",
        ],
    ),
}


def get_scenario(scenario_id: str) -> ScenarioDefinition | None:
    return SCENARIOS.get(scenario_id)


def list_scenarios() -> list[ScenarioDefinition]:
    return list(SCENARIOS.values())
