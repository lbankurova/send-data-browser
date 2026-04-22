"""Lint fixture: string-constant composition dodge.

Tests that the AST constant-folder catches "clinical_" + "confidence".
"""


def _is_loael_driving(finding: dict) -> bool:
    # Violation: builds the attr name from string literals.
    attr = "clinical_" + "confidence"
    cc = finding.get(attr)
    return cc == "High"
