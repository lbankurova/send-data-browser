"""ParallelDesignAdapter — wraps the existing between-group pipeline.

This is a thin wrapper around the existing dose_groups.build_dose_groups()
and domain_stats.compute_all_findings(). No logic changes — the adapter
delegates entirely to existing code.
"""

from __future__ import annotations

from services.study_discovery import StudyInfo
from services.analysis.dose_groups import build_dose_groups
from generator.domain_stats import compute_all_findings
from generator.adapters.base import StudyDesignAdapter, DoseContext


class ParallelDesignAdapter(StudyDesignAdapter):

    def build_dose_context(self, study: StudyInfo) -> DoseContext:
        dg_data = build_dose_groups(study)
        return DoseContext(
            dose_groups=dg_data["dose_groups"],
            subjects=dg_data["subjects"],
            has_concurrent_control=dg_data.get("has_concurrent_control", True),
            control_dose_level=0,
            raw_dg_data=dg_data,
        )

    def compute_findings(
        self,
        study: StudyInfo,
        dose_context: DoseContext,
        early_death_subjects: dict[str, str] | None = None,
        last_dosing_day_override: int | None = None,
        animal_exclusions: dict[str, set[str]] | None = None,
    ) -> tuple[list[dict], dict]:
        findings, dg_data = compute_all_findings(
            study,
            early_death_subjects=early_death_subjects,
            last_dosing_day_override=last_dosing_day_override,
            animal_exclusions=animal_exclusions,
        )
        return findings, dg_data

    def get_design_type(self) -> str:
        return "parallel_between_group"
