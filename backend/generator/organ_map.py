"""Tissue/lab-test to organ system lookup.

Reuses send_knowledge.py mappings and adds generator-specific helpers.
"""

from services.analysis.send_knowledge import BIOMARKER_MAP, ORGAN_SYSTEM_MAP


def get_organ_system(specimen: str | None, test_code: str | None = None,
                     domain: str | None = None) -> str:
    """Resolve organ system from specimen name, test code, or domain.

    Priority: specimen > biomarker map > domain default.
    """
    if specimen:
        upper = specimen.upper().strip()
        if upper in ORGAN_SYSTEM_MAP:
            return ORGAN_SYSTEM_MAP[upper]
        # Partial match for compound names like "LYMPH NODE, INGUINAL"
        for key, system in ORGAN_SYSTEM_MAP.items():
            if upper.startswith(key):
                return system

    if test_code and test_code in BIOMARKER_MAP:
        return BIOMARKER_MAP[test_code].get("system", "general")

    # Domain-level defaults
    domain_defaults = {
        "BW": "general",
        "FW": "general",
        "LB": "general",
        "MI": "general",
        "MA": "general",
        "OM": "general",
        "CL": "general",
        "DS": "general",
        "TF": "general",
        "PM": "general",
        "EG": "cardiovascular",
        "VS": "cardiovascular",
        "BG": "general",
    }
    if domain:
        return domain_defaults.get(domain, "general")

    return "general"


def get_organ_name(specimen: str | None, test_code: str | None = None) -> str:
    """Get a human-readable organ name."""
    if specimen:
        return specimen.strip().title()
    if test_code and test_code in BIOMARKER_MAP:
        organ = BIOMARKER_MAP[test_code].get("organ")
        if organ:
            return organ.title()
    return "General"
