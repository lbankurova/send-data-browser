#!/usr/bin/env python3
"""
lint-spec.py -- F5 specification linter.

Audits markdown files in docs/_internal/incoming/ against four criteria per
spec §7.1. Errs toward flagging for human review (false-positive tolerant) per
§7.4 -- the architect-reviewer is the final judge, this is a pre-filter.

Criteria:

  1. Empirical claims must cite data. Sentences with numeric claims about
     generated output ("count drops to N", "header reads X", "<= N rows",
     "shows N findings") must cite a generated JSON path or a fixture test.
     This catches the BUG-031 anti-pattern where the spec author treated
     "BW reads below tested range" as desired without citing the data.

  2. Behavioral requirements must have tests. Sentences with "must", "shall",
     "requires", ">= N" must reference a test file, a CLAUDE.md rule, a gate
     name, or an applies_to knowledge fact.

  3. Multi-feature specs must reference SPEC-VALUE-AUDIT (per CLAUDE.md
     rule 17).

  4. Algorithmic specs must cite domain truth. Specs that propose or modify
     analytical algorithms must reference at least one knowledge-graph fact
     (HCD-FACT-* / NOAEL-FACT-* / METH-FACT-* / etc.) or document running
     scripts/query-knowledge.py.

Usage:
  python scripts/lint-spec.py <path-to-spec.md>
  python scripts/lint-spec.py --all-incoming                # lint every .md in docs/_internal/incoming/
  python scripts/lint-spec.py --strict <path>               # exit 1 on any flag
  python scripts/lint-spec.py --quiet --strict <path>       # for hook usage

Default exit:
  0  no defects, OR defects found in advisory mode (no --strict)
  1  defects found AND --strict

Wired into:
  - /lattice:architect Step 1.5 (gates spec acceptance; --strict block)
  - Pre-commit hook (advisory) when an incoming/ file is staged
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INCOMING_DIR = ROOT / "docs" / "_internal" / "incoming"

# --- Criterion 1: Empirical claims ---
# Patterns that suggest a claim about specific generated output. False positives
# are common (e.g., "≥ 30 facts" in an acceptance criterion is intentional);
# we err toward flagging and let a human triage.
EMPIRICAL_CLAIM_PATTERNS = [
    re.compile(r"\b(?:reads?|shows?|displays?|renders?)\s+[\"`'][^\"`']{1,80}[\"`']", re.IGNORECASE),
    re.compile(r"\bcount\s+(?:drops?|rises?|jumps?|falls?|changes?)\s+(?:from|to)\s+\d+", re.IGNORECASE),
    re.compile(r"\b(?:<=|>=|≤|≥|<|>)\s*\d+\s+(?:rows?|findings?|entries?|records?)\b", re.IGNORECASE),
    re.compile(r"\bshows?\s+(?:exactly|only|just)?\s*\d+\s+(?:rows?|findings?|entries?|records?)\b", re.IGNORECASE),
    re.compile(r"\bheader\s+reads?\s+[\"`'][^\"`']{1,80}[\"`']", re.IGNORECASE),
    re.compile(r"\b(?:NOAEL|LOAEL)\s+(?:is|=|equals?)\s+(?:[\"`'][^\"`']+[\"`']|\d+\s*(?:mg/kg|µg/kg)?)", re.IGNORECASE),
    re.compile(r"\b(?:value|result|output)\s+(?:is|=|equals?)\s+[\"`'][^\"`']{1,80}[\"`']", re.IGNORECASE),
]

# Citations: paths, file refs, generated-JSON keys
CITATION_PATTERNS = [
    re.compile(r"backend/generated/[\w\-]+/[\w_]+\.json", re.IGNORECASE),
    re.compile(r"\bunified_findings\.json\b", re.IGNORECASE),
    re.compile(r"\b\w+\.test\.(?:ts|tsx|py)\b"),
    re.compile(r"\btests?/[\w/\-_]+\.(?:test\.)?(?:py|ts|tsx)\b", re.IGNORECASE),
    re.compile(r"\bfixture\b", re.IGNORECASE),
    re.compile(r"\b(?:approval-baselines|baseline\.json)\b", re.IGNORECASE),
    re.compile(r"\bvalidation/references/[\w\-]+\.yaml\b"),
]

# --- Criterion 2: Behavioral requirements ---
BEHAVIORAL_PATTERNS = [
    # Match strong-modal statements but exclude common spec-meta uses
    # (e.g., "the spec MUST pass SPEC-VALUE-AUDIT" is itself a process rule, not
    # a per-feature requirement). We require the sentence to mention behavior
    # of the system (not the process), filtered downstream.
    re.compile(r"\b(?:must|shall|requires?)\s+(?!be\s+a\s+spec)(?!pass\s+SPEC-)", re.IGNORECASE),
    re.compile(r"\b(?:>=|≥)\s*\d+\b"),
]

# Test/gate references that satisfy criterion 2
TEST_REF_PATTERNS = [
    re.compile(r"\b(?:test|tests?|testing|fixture|gate|hook|invariant|audit|lint)\b", re.IGNORECASE),
    re.compile(r"\bCLAUDE\.md\b", re.IGNORECASE),
    re.compile(r"\brule\s+\d+\b", re.IGNORECASE),
    re.compile(r"\b(?:HCD-FACT|NOAEL-FACT|METH-FACT)-[\w]+\b"),
    re.compile(r"\bapplies_to\b"),
    re.compile(r"`scripts?/[\w\-]+\.(?:py|sh)`"),
]

# --- Criterion 3: Multi-feature spec detection ---
FEATURE_HEADING_RE = re.compile(r"^\s*###?\s+(?:F\d+|Feature\s+\d+)\b", re.IGNORECASE | re.MULTILINE)
ALT_FEATURE_HEADING_RE = re.compile(r"^\s*##\s+(?:\d+\.\s+)?Feature\s*[:\-]", re.IGNORECASE | re.MULTILINE)
SPEC_VALUE_AUDIT_REF = re.compile(r"SPEC-VALUE-AUDIT|spec.value.audit", re.IGNORECASE)

# --- Criterion 4: Algorithmic spec detection ---
ALGORITHMIC_KEYWORDS = re.compile(
    r"\b(?:NOAEL|LOAEL|severity\s+grading|severity\s+classification|"
    r"adverse\s+classification|signal\s+score|syndrome\s+detection|"
    r"onset\s+determination|onset\s+dose|dose-response\s+pattern|"
    r"target\s+organ\s+identification|treatment-related\s+classification|"
    r"effect\s+size|recovery\s+verdict)\b",
    re.IGNORECASE,
)
KNOWLEDGE_FACT_REF = re.compile(r"\b(?:HCD-FACT|NOAEL-FACT|METH-FACT|REG-FACT|GATE-FACT)-[\w]+\b")
QUERY_KNOWLEDGE_REF = re.compile(r"query-knowledge\.py")


@dataclass
class Defect:
    criterion: int
    line_no: int
    snippet: str
    message: str


@dataclass
class LintResult:
    path: Path
    defects: list[Defect] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.defects


def split_paragraphs(text: str) -> list[tuple[int, str]]:
    """Split text into (start_line, paragraph) tuples. Blank lines are dividers.
    Code fences are treated as opaque blocks (not split internally)."""
    paragraphs: list[tuple[int, str]] = []
    lines = text.splitlines()
    buf: list[str] = []
    buf_start = 1
    in_code = False
    for i, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code = not in_code
            buf.append(line)
            continue
        if in_code:
            buf.append(line)
            continue
        if stripped == "":
            if buf:
                paragraphs.append((buf_start, "\n".join(buf)))
                buf = []
            buf_start = i + 1
            continue
        if not buf:
            buf_start = i
        buf.append(line)
    if buf:
        paragraphs.append((buf_start, "\n".join(buf)))
    return paragraphs


def has_citation(paragraph: str) -> bool:
    return any(p.search(paragraph) for p in CITATION_PATTERNS)


def has_test_ref(paragraph: str) -> bool:
    return any(p.search(paragraph) for p in TEST_REF_PATTERNS)


def is_acceptance_criteria_section(paragraph: str, full_text: str, para_start_line: int) -> bool:
    """Acceptance-criteria sections naturally use 'must' / '>= N' for spec
    contracts -- not per-feature behavioral requirements about the system.
    Skip behavioral-requirement checks when the paragraph is inside an
    'Acceptance criteria' / 'Acceptance' section (heading H2/H3 above)."""
    lines = full_text.splitlines()
    # Walk backwards from the paragraph start looking for a heading
    for i in range(min(para_start_line - 1, len(lines)) - 1, -1, -1):
        line = lines[i].strip()
        if line.startswith("#"):
            heading_text = line.lstrip("#").strip().lower()
            if "acceptance" in heading_text or "non-goal" in heading_text:
                return True
            # Stop at the first heading we hit, regardless
            return False
    return False


def lint_criterion_1(path: Path, paragraphs: list[tuple[int, str]]) -> list[Defect]:
    """Empirical claims must cite data."""
    defects: list[Defect] = []
    for start_line, para in paragraphs:
        # Skip code blocks for criterion 1 -- code is its own evidence
        if para.lstrip().startswith("```"):
            continue
        for pattern in EMPIRICAL_CLAIM_PATTERNS:
            for match in pattern.finditer(para):
                if has_citation(para):
                    continue
                snippet = match.group(0)[:120]
                # Locate the line within the paragraph
                line_offset = para[:match.start()].count("\n")
                defects.append(Defect(
                    criterion=1,
                    line_no=start_line + line_offset,
                    snippet=snippet,
                    message=(
                        "empirical claim with no data citation in the same paragraph "
                        "(no generated JSON path, fixture test, baseline.json, or "
                        "validation reference). Add a citation or move to an "
                        "Acceptance / Non-goals section."
                    ),
                ))
                break  # one defect per paragraph per pattern is enough
    return defects


def lint_criterion_2(path: Path, paragraphs: list[tuple[int, str]], full_text: str) -> list[Defect]:
    """Behavioral requirements must have tests."""
    defects: list[Defect] = []
    for start_line, para in paragraphs:
        if para.lstrip().startswith("```"):
            continue
        if is_acceptance_criteria_section(para, full_text, start_line):
            continue
        # Each pattern at most once per paragraph
        for pattern in BEHAVIORAL_PATTERNS:
            match = pattern.search(para)
            if not match:
                continue
            if has_test_ref(para):
                break
            snippet = match.group(0)[:120]
            line_offset = para[:match.start()].count("\n")
            defects.append(Defect(
                criterion=2,
                line_no=start_line + line_offset,
                snippet=snippet,
                message=(
                    "behavioral requirement (must / shall / requires / >=N) with no "
                    "test, gate, rule, or knowledge-fact reference in the same paragraph. "
                    "Cite the test file, CLAUDE.md rule, or applies_to knowledge fact."
                ),
            ))
            break
    return defects


def lint_criterion_3(path: Path, full_text: str) -> list[Defect]:
    """Multi-feature specs must reference SPEC-VALUE-AUDIT."""
    feature_count = len(FEATURE_HEADING_RE.findall(full_text)) + len(ALT_FEATURE_HEADING_RE.findall(full_text))
    if feature_count <= 1:
        return []
    if SPEC_VALUE_AUDIT_REF.search(full_text):
        return []
    return [Defect(
        criterion=3,
        line_no=1,
        snippet=f"{feature_count} features detected",
        message=(
            f"multi-feature spec ({feature_count} features) does not reference "
            "SPEC-VALUE-AUDIT.md. Per CLAUDE.md rule 17, every multi-feature spec "
            "must run the audit before architect review signs off."
        ),
    )]


def lint_criterion_4(path: Path, full_text: str) -> list[Defect]:
    """Algorithmic specs must cite domain truth."""
    if not ALGORITHMIC_KEYWORDS.search(full_text):
        return []
    if KNOWLEDGE_FACT_REF.search(full_text) or QUERY_KNOWLEDGE_REF.search(full_text):
        return []
    return [Defect(
        criterion=4,
        line_no=1,
        snippet="algorithmic spec without knowledge-fact citation",
        message=(
            "spec proposes/modifies an analytical algorithm (NOAEL/LOAEL/scoring/"
            "syndrome/severity/onset etc.) but cites no knowledge-graph fact "
            "(HCD-FACT-*, NOAEL-FACT-*, etc.) and does not reference "
            "scripts/query-knowledge.py. Per spec §7.1 criterion 4, every "
            "algorithmic spec must reference at least one typed domain-truth fact "
            "per major decision point. Run query-knowledge.py during spec write "
            "and cite the returned fact(s)."
        ),
    )]


def is_incoming_spec(path: Path) -> bool:
    """Per spec §7.2, the lint targets new specs entering docs/_internal/incoming/.
    Reference checklists, audit-rule docs, READMEs, etc. live elsewhere and
    use spec-like vocabulary ('must', 'NOAEL') for process / domain reasons,
    not as per-feature requirements. Apply criteria 2/3/4 only to files
    under incoming/. Criterion 1 (empirical-claim citation) applies universally."""
    try:
        rel = path.resolve().relative_to(ROOT)
    except ValueError:
        return False
    parts = rel.parts
    if len(parts) < 4:
        return False
    return parts[0] == "docs" and parts[1] == "_internal" and parts[2] == "incoming"


def lint_file(path: Path) -> LintResult:
    if not path.exists():
        return LintResult(path=path, defects=[Defect(
            criterion=0, line_no=0, snippet="",
            message=f"file not found: {path}",
        )])
    text = path.read_text(encoding="utf-8", errors="replace")
    paragraphs = split_paragraphs(text)
    result = LintResult(path=path)
    # Criterion 1 applies to every file -- empirical numeric claims about
    # generated output need a data citation regardless of doc type.
    result.defects.extend(lint_criterion_1(path, paragraphs))
    # Criteria 2/3/4 are spec-specific -- only apply to incoming/ specs.
    if is_incoming_spec(path):
        result.defects.extend(lint_criterion_2(path, paragraphs, text))
        result.defects.extend(lint_criterion_3(path, text))
        result.defects.extend(lint_criterion_4(path, text))
    return result


def render(result: LintResult, quiet: bool = False) -> None:
    if result.passed:
        if not quiet:
            print(f"OK: {result.path} -- 0 defects")
        return
    by_criterion: dict[int, list[Defect]] = {}
    for d in result.defects:
        by_criterion.setdefault(d.criterion, []).append(d)
    print(f"FLAGGED: {result.path} -- {len(result.defects)} defect(s)")
    for c in sorted(by_criterion):
        criterion_name = {
            1: "empirical-claims-cite-data",
            2: "behavioral-requirements-have-tests",
            3: "multi-feature-references-SPEC-VALUE-AUDIT",
            4: "algorithmic-specs-cite-domain-truth",
            0: "file-error",
        }.get(c, str(c))
        print(f"  Criterion {c} ({criterion_name}):")
        for d in by_criterion[c]:
            print(f"    L{d.line_no}: {d.snippet}")
            print(f"           {d.message}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="F5 specification linter (4 criteria; advisory by default)",
    )
    parser.add_argument("paths", nargs="*", help="Spec files to lint")
    parser.add_argument("--all-incoming", action="store_true",
                        help=f"Lint every .md in {INCOMING_DIR.relative_to(ROOT)}")
    parser.add_argument("--strict", action="store_true",
                        help="Exit 1 on any defect (use in /lattice:architect Step 1.5)")
    parser.add_argument("--quiet", action="store_true",
                        help="Suppress 'OK' lines for clean files")
    args = parser.parse_args()

    paths: list[Path] = [Path(p) for p in args.paths]
    if args.all_incoming:
        if not INCOMING_DIR.exists():
            print(f"ERROR: {INCOMING_DIR} not found", file=sys.stderr)
            return 2
        for p in sorted(INCOMING_DIR.glob("*.md")):
            paths.append(p)
    if not paths:
        parser.error("provide at least one path or use --all-incoming")

    total_defects = 0
    flagged_files = 0
    for p in paths:
        result = lint_file(p.resolve())
        render(result, quiet=args.quiet)
        if not result.passed:
            total_defects += len(result.defects)
            flagged_files += 1

    if total_defects > 0:
        print()
        print(f"Summary: {total_defects} defect(s) across {flagged_files} file(s).")
        if args.strict:
            return 1
        print("(--strict not set; advisory only)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
