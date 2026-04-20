"""Shared fixtures for term_collisions and cross-study collision endpoint tests.

Extracted so the two test modules share one source of truth for the
finding shape expected by services.analysis.term_collisions.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FakeStudy:
    study_id: str
    unified_findings: list[dict] = field(default_factory=list)


def make_finding(
    domain: str,
    raw: str,
    organ: str | None,
    level: int,
    base: str | None = None,
    qualifier: str | None = None,
) -> dict:
    return {
        "domain": domain,
        "test_name": raw,
        "organ_system": organ,
        "test_code_recognition_level": level,
        "canonical_base_finding": base,
        "canonical_qualifier": qualifier,
    }
