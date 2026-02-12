"""Resolved accessor functions for study metadata.

These functions implement the dual-layer data access pattern:
- Reported layer (from nSDRG) is preferred
- Derived layer (from XPT analysis) is fallback
- Discrepancy detection when both layers exist and differ
"""

from typing import List, Optional, Dict, Any
from models.study_metadata import StudyMetadata


def target_organs(study: StudyMetadata) -> List[str]:
    """
    Get resolved target organs: reported preferred, derived fallback.

    Args:
        study: Study metadata with reported and/or derived target organs

    Returns:
        List of target organ names (empty list if neither layer exists)
    """
    if study.target_organs_reported is not None:
        return study.target_organs_reported
    if study.target_organs_derived is not None:
        return study.target_organs_derived
    return []


def noael(study: StudyMetadata) -> Optional[Dict[str, Any]]:
    """
    Get resolved NOAEL: reported preferred, derived fallback.

    Args:
        study: Study metadata with reported and/or derived NOAEL

    Returns:
        Dict with dose, unit, source, basis_or_method (None if neither exists)
    """
    if study.noael_reported:
        return {
            "dose": study.noael_reported.dose,
            "unit": study.noael_reported.unit,
            "source": "reported",
            "basis_or_method": study.noael_reported.basis,
        }
    if study.noael_derived:
        return {
            "dose": study.noael_derived.dose,
            "unit": study.noael_derived.unit,
            "source": "derived",
            "basis_or_method": study.noael_derived.method,
        }
    return None


def loael(study: StudyMetadata) -> Optional[Dict[str, Any]]:
    """
    Get resolved LOAEL: reported preferred, derived fallback.

    Args:
        study: Study metadata with reported and/or derived LOAEL

    Returns:
        Dict with dose, unit, source (None if neither exists)
    """
    if study.loael_reported:
        return {
            "dose": study.loael_reported.dose,
            "unit": study.loael_reported.unit,
            "source": "reported",
        }
    if study.loael_derived:
        return {
            "dose": study.loael_derived.dose,
            "unit": study.loael_derived.unit,
            "source": "derived",
        }
    return None


def has_target_organ_discrepancy(study: StudyMetadata) -> bool:
    """
    Check if reported and derived target organs differ.

    Args:
        study: Study metadata with both layers

    Returns:
        True if both exist and differ, False otherwise
    """
    if not study.target_organs_reported or not study.target_organs_derived:
        return False

    reported_set = set(study.target_organs_reported)
    derived_set = set(study.target_organs_derived)

    return reported_set != derived_set


def has_noael_discrepancy(study: StudyMetadata) -> bool:
    """
    Check if reported and derived NOAEL differ.

    Args:
        study: Study metadata with both layers

    Returns:
        True if both exist and doses differ, False otherwise
    """
    if not study.noael_reported or not study.noael_derived:
        return False

    return study.noael_reported.dose != study.noael_derived.dose


def has_loael_discrepancy(study: StudyMetadata) -> bool:
    """
    Check if reported and derived LOAEL differ.

    Args:
        study: Study metadata with both layers

    Returns:
        True if both exist and doses differ, False otherwise
    """
    if not study.loael_reported or not study.loael_derived:
        return False

    return study.loael_reported.dose != study.loael_derived.dose


def get_derived_only_organs(study: StudyMetadata) -> List[str]:
    """
    Get target organs present in derived but not in reported.

    Args:
        study: Study metadata with both layers

    Returns:
        List of organs (empty if no discrepancy or layers missing)
    """
    if not study.target_organs_reported or not study.target_organs_derived:
        return []

    reported_set = set(study.target_organs_reported)
    derived_only = [o for o in study.target_organs_derived if o not in reported_set]
    return derived_only


def get_reported_only_organs(study: StudyMetadata) -> List[str]:
    """
    Get target organs present in reported but not in derived.

    Args:
        study: Study metadata with both layers

    Returns:
        List of organs (empty if no discrepancy or layers missing)
    """
    if not study.target_organs_reported or not study.target_organs_derived:
        return []

    derived_set = set(study.target_organs_derived)
    reported_only = [o for o in study.target_organs_reported if o not in derived_set]
    return reported_only
