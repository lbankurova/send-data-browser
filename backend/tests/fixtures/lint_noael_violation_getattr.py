"""Lint fixture: getattr(obj, "clinical_confidence") dodge.

Tests that the AST walker inspects getattr call arguments.
"""


class _Adapter:
    clinical_confidence = "High"


def _is_loael_driving(finding) -> bool:
    # Violation: uses getattr with string literal.
    cc = getattr(finding, "clinical_confidence", None)
    return cc == "High"
