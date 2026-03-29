"""Study design adapter interface and shared DoseContext dataclass.

Each adapter (parallel, crossover, escalation) produces:
  1. A DoseContext describing dose groups, subjects, and control structure
  2. A list of finding dicts conforming to the FindingRecord contract

The shared analysis core (classification, confidence, NOAEL, syndromes,
recovery) consumes these outputs without knowing which adapter produced them.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import pandas as pd

from services.study_discovery import StudyInfo


@dataclass
class DoseContext:
    """Everything the shared core needs from the adapter about study design."""
    dose_groups: list[dict]
    subjects: pd.DataFrame  # USUBJID, SEX, ARMCD, dose_level, is_recovery, is_satellite
    has_concurrent_control: bool
    control_dose_level: int | None = None

    # Full dg_data dict for backward compatibility with existing consumers
    # (tk_setcds, tx_map, tk_count, tk_report, etc.)
    raw_dg_data: dict = field(default_factory=dict)

    # Parallel-specific
    early_death_subjects: dict | None = None
    last_dosing_day: int | None = None

    # Crossover-specific
    treatment_periods: list[dict] | None = None
    period_doses: dict | None = None  # {subject_id: {period_index: dose_value}}
    is_escalation: bool = False


class StudyDesignAdapter(ABC):
    """Produces normalized findings from raw SEND XPT data."""

    @abstractmethod
    def build_dose_context(self, study: StudyInfo) -> DoseContext:
        """Build dose groups (parallel) or treatment periods (crossover).

        Returns context needed by downstream (dose_groups list, subjects df,
        has_concurrent_control flag, etc.).
        """
        ...

    @abstractmethod
    def compute_findings(
        self,
        study: StudyInfo,
        dose_context: DoseContext,
        early_death_subjects: dict[str, str] | None = None,
        last_dosing_day_override: int | None = None,
    ) -> tuple[list[dict], dict]:
        """Run domain-specific statistics and return normalized findings.

        Returns (findings_list, dg_data_dict) for backward compatibility
        with existing generate.py consumers.
        """
        ...

    @abstractmethod
    def get_design_type(self) -> str:
        """Return design identifier for provenance tracking."""
        ...
