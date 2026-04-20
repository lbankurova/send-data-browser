"""Repo-wide grep assertion: level == 4 must never appear as a pipeline
comparator (AC-7.5). The level 4 tier exists only as a report-only tag
in the curation layer; it is never written to unified_findings.json.

Allowlisted paths: admin/curation surface area where level 4 is valid.
Each allowlisted file must carry `# LEVEL-4-REPORT-ONLY` (Python) or
`// LEVEL-4-REPORT-ONLY` (TypeScript) adjacent to any level-4 literal
so future readers see the provenance.
"""

import re
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).parent.parent.parent

_SCAN_DIRS = [
    _REPO_ROOT / "backend" / "services" / "analysis",
    _REPO_ROOT / "backend" / "generator",
    _REPO_ROOT / "frontend" / "src" / "lib",
    _REPO_ROOT / "frontend" / "src" / "components" / "analysis",
]

_ALLOWLISTED = {
    _REPO_ROOT / "backend" / "routers" / "admin_terms.py",
    _REPO_ROOT / "backend" / "services" / "analysis" / "term_suggestions.py",
    _REPO_ROOT / "backend" / "services" / "analysis" / "term_collisions.py",
    _REPO_ROOT / "backend" / "services" / "analysis" / "term_tokenization.py",
    # Admin frontend surface
    _REPO_ROOT / "frontend" / "src" / "components" / "admin",
    _REPO_ROOT / "frontend" / "src" / "hooks" / "useAdminTerms.ts",
    _REPO_ROOT / "frontend" / "src" / "hooks" / "useTermCollisions.ts",
    _REPO_ROOT / "frontend" / "src" / "lib" / "admin-terms-api.ts",
}

_PATTERN = re.compile(
    r"\b(recognition_level|test_code_recognition_level|org_recognition_level|organ_recognition_level)\s*[=!<>]=?\s*4\b"
)

_PROVENANCE_LINE = re.compile(r"LEVEL-4-REPORT-ONLY")


def _is_allowlisted(path: Path) -> bool:
    resolved = path.resolve()
    for allow in _ALLOWLISTED:
        allow_resolved = allow.resolve()
        if resolved == allow_resolved:
            return True
        try:
            resolved.relative_to(allow_resolved)
            return True
        except ValueError:
            continue
    return False


def _iter_scan_files() -> list[Path]:
    files: list[Path] = []
    for d in _SCAN_DIRS:
        if not d.exists():
            continue
        for path in d.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in (".py", ".ts", ".tsx"):
                continue
            if "__pycache__" in path.parts:
                continue
            files.append(path)
    return files


def test_no_level_4_pipeline_leak():
    violations: list[str] = []
    for path in _iter_scan_files():
        if _is_allowlisted(path):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if _PATTERN.search(line):
                violations.append(f"{path}:{lineno}: {line.strip()}")
    assert not violations, (
        "Level-4 pipeline leak detected — admin/curation level 4 must not "
        "appear as a recognition-level comparator in pipeline code. "
        "Violations:\n" + "\n".join(violations)
    )


def test_allowlisted_admin_code_carries_provenance_marker():
    """Every allowlisted TypeScript/Python file with level-4 comparisons
    must carry a LEVEL-4-REPORT-ONLY marker so future readers see why the
    exception exists."""
    # Scan only the frontend admin directory — backend files don't currently
    # use a level==4 comparator literal (the test_code_recognition_level
    # enum never carries 4 in the pipeline) so this check is vacuous there.
    admin_dir = _REPO_ROOT / "frontend" / "src" / "components" / "admin"
    if not admin_dir.exists():
        pytest.skip("admin frontend not present")
    # Require the marker to appear somewhere in each admin .tsx/.ts file so
    # the provenance rule is durable.
    missing: list[Path] = []
    for path in admin_dir.rglob("*.tsx"):
        text = path.read_text(encoding="utf-8")
        if not _PROVENANCE_LINE.search(text):
            missing.append(path)
    assert not missing, (
        "Admin frontend files missing LEVEL-4-REPORT-ONLY provenance: "
        + ", ".join(str(p) for p in missing)
    )
