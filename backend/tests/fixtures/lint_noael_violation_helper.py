"""Lint fixture: same-file helper reads clinical_confidence, caller does not co-read.

Tests that the AST walker follows same-file helper calls.
"""


def _hcd_should_suppress(finding: dict) -> bool:
    cc = finding.get("clinical_confidence")
    return cc == "Low"


def _is_loael_driving(finding: dict) -> bool:
    # Violation via helper: helper reads clinical_confidence; caller function
    # has no direct reference and no noael_floor_applied check.
    if _hcd_should_suppress(finding):
        return False
    return True
