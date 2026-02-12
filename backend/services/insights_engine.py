"""
Cross-Study Insights Engine

Generates insights for a selected study by comparing against reference studies
and detecting discrepancies between reported and derived data layers.

Rules:
- Rule 0: Reported vs Derived Discrepancy (self-referencing)
- Rules 1-18: Cross-study intelligence (implemented in Phase 5)
"""

from typing import List
from models.study_metadata import StudyMetadata
from models.insight import Insight
from services.study_accessors import (
    has_target_organ_discrepancy,
    has_noael_discrepancy,
    has_loael_discrepancy,
    get_derived_only_organs,
    get_reported_only_organs,
)


def rule_00_discrepancy(study: StudyMetadata) -> List[Insight]:
    """
    Rule 0: Reported vs Derived Discrepancy

    Detects when reported (nSDRG) and derived (XPT) data layers differ.
    This is a self-referencing rule (ref_study=null, priority=0).

    Generates insights for:
    - Target organs that appear only in derived data
    - Target organs that appear only in reported data
    - NOAEL differences with interpretation
    - LOAEL differences
    """
    insights = []

    # Target organ discrepancy
    if has_target_organ_discrepancy(study):
        reported = study.target_organs_reported or []
        derived = study.target_organs_derived or []

        derived_only = get_derived_only_organs(study)
        reported_only = get_reported_only_organs(study)

        if derived_only:
            detail = (
                f"Data analysis identifies {', '.join(derived_only)} as potential target organ(s) "
                f"not listed in study report. Report lists: {', '.join(reported)}. "
                f"Data suggests: {', '.join(derived)}. Review histopathology assessment."
            )
            insights.append(Insight(
                priority=0,
                rule="discrepancy",
                title="Target Organ Discrepancy",
                detail=detail,
                ref_study=None
            ))

        if reported_only:
            detail = (
                f"Study report lists {', '.join(reported_only)} as target organ(s) "
                f"not flagged by data analysis. Report may include clinical observation-based assessment."
            )
            insights.append(Insight(
                priority=0,
                rule="discrepancy",
                title="Target Organ Discrepancy (Report Only)",
                detail=detail,
                ref_study=None
            ))

    # NOAEL discrepancy
    if has_noael_discrepancy(study):
        r = study.noael_reported
        d = study.noael_derived

        if d.dose < r.dose:
            interpretation = (
                f"Statistical analysis is more conservative — data flags findings at {d.dose} {d.unit} "
                f"that study director considered non-adverse."
            )
        elif d.dose > r.dose:
            interpretation = (
                f"Study director applied additional clinical judgment beyond statistical thresholds."
            )
        else:
            interpretation = ""

        detail = (
            f"Study report NOAEL ({r.dose} {r.unit}) differs from data-derived NOAEL "
            f"({d.dose} {d.unit}, {d.method}). {interpretation}"
        )
        insights.append(Insight(
            priority=0,
            rule="discrepancy",
            title="NOAEL Discrepancy",
            detail=detail,
            ref_study=None
        ))

    # LOAEL discrepancy
    if has_loael_discrepancy(study):
        r = study.loael_reported
        d = study.loael_derived
        detail = (
            f"Study report LOAEL ({r.dose} {r.unit}) differs from data-derived LOAEL ({d.dose} {d.unit})."
        )
        insights.append(Insight(
            priority=0,
            rule="discrepancy",
            title="LOAEL Discrepancy",
            detail=detail,
            ref_study=None
        ))

    return insights


def generate_insights(selected: StudyMetadata, all_studies: List[StudyMetadata]) -> List[Insight]:
    """
    Generate all insights for a selected study.

    Phase 4: Only Rule 0 implemented
    Phase 5: Will add Rules 1-18
    """
    insights = []

    # Step 0: Self-referencing rules
    insights.extend(rule_00_discrepancy(selected))

    # Step 1: Filter references (submitted studies of same compound)
    # Phase 5: Cross-study rules will use this
    # references = [
    #     s for s in all_studies
    #     if s.id != selected.id
    #     and s.test_article == selected.test_article
    #     and s.pipeline_stage == "submitted"
    # ]

    # Step 2: Cross-study rules (Phase 5)
    # for ref in references:
    #     insights.extend(rule_01_dose_selection(selected, ref))
    #     insights.extend(rule_02_monitoring_watchlist(selected, ref))
    #     # ... etc

    # Step 3: Sort by priority (0 = critical, 1 = high, 2 = medium, 3 = low)
    insights.sort(key=lambda i: i.priority)

    return insights
