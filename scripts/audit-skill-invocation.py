#!/usr/bin/env python3
"""
audit-skill-invocation.py -- F8 skill consolidation audit.

Per spec §10. Per spec §10.2, runs AFTER F3 lands (F3 promotes peer-review
from aspirational to wired-into-gate; running this before F3 would
mis-classify peer-review as a sunset candidate).

For each lattice skill (commands/lattice/, commands/ops/) and agent
(agents/), classifies on three axes:

  - Skill age (days since first git commit of the .md file)
  - Invocation count (grep .lattice/decisions.log for skill-name references
    over max(skill-age, 90 days) -- per spec §20a Review-4 grace period)
  - Wired-into-gate (referenced by workflow YAMLs in lattice/workflows/,
    pre-commit hooks in lattice/hooks/ + pcc/hooks/, or another skill prompt)

Classification:
  - RETAIN              wired-into-gate (regardless of invocation count)
  - GRACE-PERIOD        skill-age < 90 days AND not wired (exempt from
                        invocation-based sunset per Review-4)
  - LOW-INVOCATION      skill-age >= 90 days AND not wired AND
                        invocations >= 1 (review individually)
  - CANDIDATE-SUNSET    skill-age >= 90 days AND not wired AND
                        invocations == 0

Conservative bias per spec §10.4 non-goals: when in doubt, classify RETAIN.
The audit OUTPUTS a report for user review; it does NOT sunset anything.

Usage:
  python scripts/audit-skill-invocation.py                       # text report to stdout
  python scripts/audit-skill-invocation.py --markdown            # markdown report to stdout
  python scripts/audit-skill-invocation.py --markdown --out PATH # markdown to file

Exit:
  0  audit completed (any classification mix)
  2  lattice repo or skill dirs not findable
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

PCC_ROOT = Path(__file__).resolve().parent.parent
LATTICE_ROOT = PCC_ROOT.parent / "lattice"
LATTICE_SKILLS_DIR = LATTICE_ROOT / "commands" / "lattice"
LATTICE_OPS_DIR = LATTICE_ROOT / "commands" / "ops"
LATTICE_AGENTS_DIR = LATTICE_ROOT / "agents"
LATTICE_WORKFLOWS_DIR = LATTICE_ROOT / "workflows"
LATTICE_HOOKS_DIR = LATTICE_ROOT / "hooks"
LATTICE_DECISIONS_LOG = LATTICE_ROOT / ".lattice" / "decisions.log"
PCC_DECISIONS_LOG = PCC_ROOT / ".lattice" / "decisions.log"
PCC_HOOKS_DIR = PCC_ROOT / "hooks"

GRACE_PERIOD_DAYS = 90
TODAY = date.today()


@dataclass
class Skill:
    name: str
    namespace: str       # lattice / ops / agents
    path: Path
    age_days: int
    invocations: int
    wired_into: list[str]   # human-readable list of where the skill is referenced
    classification: str


def get_skill_files() -> list[tuple[str, str, Path]]:
    skills: list[tuple[str, str, Path]] = []
    for d, ns in [
        (LATTICE_SKILLS_DIR, "lattice"),
        (LATTICE_OPS_DIR, "ops"),
        (LATTICE_AGENTS_DIR, "agents"),
    ]:
        if not d.exists():
            continue
        for f in sorted(d.glob("*.md")):
            skills.append((f.stem, ns, f))
    return skills


def get_skill_age(path: Path) -> int:
    """Days since the file was first added to git history. Falls back to file
    mtime if git is unavailable. Conservative: when unknown, treat as old."""
    try:
        result = subprocess.run(
            ["git", "log", "--diff-filter=A", "--follow", "--format=%aI", "--", path.name],
            cwd=path.parent,
            capture_output=True, text=True, check=True,
        )
        lines = [line for line in result.stdout.splitlines() if line.strip()]
        if lines:
            first = lines[-1]  # oldest
            d = datetime.fromisoformat(first.replace("Z", "+00:00")).date()
            return (TODAY - d).days
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        pass
    try:
        mtime = datetime.fromtimestamp(path.stat().st_mtime).date()
        return (TODAY - mtime).days
    except OSError:
        return 9999


def count_invocations(name: str, namespace: str, age_days: int) -> int:
    """Count references to this skill in decisions.log within max(age, 90) days.

    Searches BOTH lattice and pcc decisions.log. References look like:
      - 'lattice:peer-review' (slash-command form)
      - 'commands/lattice/peer-review' (file-path form)
      - 'peer-review' bare (looser; conservative count)

    Returns the count. 0 = no references in window.
    """
    window_days = max(age_days, GRACE_PERIOD_DAYS)
    cutoff = TODAY - timedelta(days=window_days)
    patterns = [
        re.escape(f"{namespace}:{name}"),
        re.escape(f"commands/{namespace}/{name}"),
        re.escape(f"/{name}.md"),
    ]
    if name in ("review", "implement", "research", "synthesize", "blueprint-cycle",
                "architect", "peer-review", "spike", "spec-from-code"):
        # Bare-name match for the most-referenced skills
        patterns.append(rf"\b{re.escape(name)}\b")
    pat = re.compile("|".join(patterns), re.IGNORECASE)
    count = 0
    for log_path in (LATTICE_DECISIONS_LOG, PCC_DECISIONS_LOG):
        if not log_path.exists():
            continue
        try:
            text = log_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line in text.splitlines():
            if not line.strip():
                continue
            # The first column of decisions.log is the ISO timestamp.
            ts_str = line.split("\t", 1)[0]
            try:
                line_date = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).date()
            except ValueError:
                continue
            if line_date < cutoff:
                continue
            if pat.search(line):
                count += 1
    return count


def get_wired_into(name: str, namespace: str) -> list[str]:
    """Return list of locations that reference this skill (workflow YAMLs,
    pre-commit hooks, other skill prompts)."""
    wired: list[str] = []
    needles = [
        f"{namespace}:{name}",
        f"commands/{namespace}/{name}",
        f"/{name}.md",
    ]

    def file_references(path: Path) -> bool:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return False
        return any(n in text for n in needles)

    # Workflow YAMLs
    if LATTICE_WORKFLOWS_DIR.exists():
        for f in LATTICE_WORKFLOWS_DIR.glob("*.yaml"):
            if file_references(f):
                wired.append(f"workflow:{f.name}")

    # Pre-commit hooks (lattice + pcc)
    for d in (LATTICE_HOOKS_DIR, PCC_HOOKS_DIR):
        if d.exists() and (d / "pre-commit").exists():
            if file_references(d / "pre-commit"):
                rel = "lattice" if d == LATTICE_HOOKS_DIR else "pcc"
                wired.append(f"hook:{rel}/pre-commit")

    # Other skills' prompts (lattice / ops / agents)
    for d in (LATTICE_SKILLS_DIR, LATTICE_OPS_DIR, LATTICE_AGENTS_DIR):
        if not d.exists():
            continue
        for f in d.glob("*.md"):
            if f.stem == name:  # don't count self-references
                continue
            if file_references(f):
                wired.append(f"skill:{f.parent.name}/{f.stem}")

    return wired


def classify(skill: Skill) -> str:
    if skill.wired_into:
        return "RETAIN"
    if skill.age_days < GRACE_PERIOD_DAYS:
        return "GRACE-PERIOD"
    if skill.invocations == 0:
        return "CANDIDATE-SUNSET"
    return "LOW-INVOCATION"


def audit() -> list[Skill]:
    skills: list[Skill] = []
    for name, namespace, path in get_skill_files():
        age = get_skill_age(path)
        wired = get_wired_into(name, namespace)
        invocations = count_invocations(name, namespace, age)
        s = Skill(
            name=name, namespace=namespace, path=path,
            age_days=age, invocations=invocations,
            wired_into=wired,
            classification="",
        )
        s.classification = classify(s)
        skills.append(s)
    return skills


def render_text(skills: list[Skill]) -> str:
    lines = []
    lines.append("=" * 78)
    lines.append(f"  Skill invocation audit (F8) -- {len(skills)} skill(s) classified")
    lines.append(f"  Today: {TODAY}    Grace period: {GRACE_PERIOD_DAYS} days")
    lines.append("=" * 78)
    by_cls: dict[str, list[Skill]] = {}
    for s in skills:
        by_cls.setdefault(s.classification, []).append(s)
    for cls in ("CANDIDATE-SUNSET", "LOW-INVOCATION", "GRACE-PERIOD", "RETAIN"):
        items = by_cls.get(cls, [])
        if not items:
            continue
        lines.append("")
        lines.append(f"  {cls}: {len(items)}")
        for s in sorted(items, key=lambda x: (x.namespace, x.name)):
            wired_summary = (
                f" wired:{','.join(s.wired_into[:3])}" + ("..." if len(s.wired_into) > 3 else "")
                if s.wired_into else ""
            )
            lines.append(
                f"    {s.namespace}:{s.name:<28}  age={s.age_days}d  inv={s.invocations}{wired_summary}"
            )
    return "\n".join(lines) + "\n"


def render_markdown(skills: list[Skill]) -> str:
    lines = []
    lines.append("# Skill invocation audit (F8)")
    lines.append("")
    lines.append(f"**Generated:** {TODAY}")
    lines.append(f"**Skills audited:** {len(skills)}")
    lines.append(f"**Grace period:** {GRACE_PERIOD_DAYS} days (per spec §20a Review-4)")
    lines.append(f"**Sources:** lattice/commands/lattice/, lattice/commands/ops/, lattice/agents/")
    lines.append("")
    lines.append("## Methodology")
    lines.append("")
    lines.append("- **Skill age:** days since first git commit of the .md file (falls back to file mtime).")
    lines.append("- **Invocations:** references in `lattice/.lattice/decisions.log` + `pcc/.lattice/decisions.log` over `max(skill-age, 90 days)` window.")
    lines.append("- **Wired-into-gate:** referenced by `lattice/workflows/*.yaml`, `lattice/hooks/pre-commit`, `pcc/hooks/pre-commit`, or another skill prompt.")
    lines.append("")
    lines.append("Classification (conservative bias per spec §10.4 non-goals):")
    lines.append("")
    lines.append("| Classification | Rule |")
    lines.append("|---|---|")
    lines.append("| **RETAIN** | wired-into-gate is non-empty (regardless of invocation count) |")
    lines.append("| **GRACE-PERIOD** | age < 90 days AND not wired -- exempt from invocation-based sunset per Review-4 |")
    lines.append("| **LOW-INVOCATION** | age >= 90 days AND not wired AND invocations >= 1 -- review individually |")
    lines.append("| **CANDIDATE-SUNSET** | age >= 90 days AND not wired AND invocations == 0 -- propose for 30-day deprecation |")
    lines.append("")

    by_cls: dict[str, list[Skill]] = {}
    for s in skills:
        by_cls.setdefault(s.classification, []).append(s)

    for cls in ("CANDIDATE-SUNSET", "LOW-INVOCATION", "GRACE-PERIOD", "RETAIN"):
        items = sorted(by_cls.get(cls, []), key=lambda x: (x.namespace, x.name))
        lines.append(f"## {cls} ({len(items)})")
        lines.append("")
        if not items:
            lines.append("_None._")
            lines.append("")
            continue
        lines.append("| Skill | Age (days) | Invocations | Wired into |")
        lines.append("|---|---:|---:|---|")
        for s in items:
            wired_str = ", ".join(s.wired_into) if s.wired_into else "_(none)_"
            lines.append(f"| `{s.namespace}:{s.name}` | {s.age_days} | {s.invocations} | {wired_str} |")
        lines.append("")

    lines.append("## Sunset proposal")
    lines.append("")
    candidates = by_cls.get("CANDIDATE-SUNSET", [])
    if not candidates:
        lines.append("**No candidates for sunset.** All skills either wired-into-gate, in grace period, or actively invoked. The audit's conservative bias means CANDIDATE-SUNSET classification requires a 90+-day-old skill with zero invocations and zero gate references -- a high bar.")
    else:
        lines.append(f"{len(candidates)} skill(s) classified CANDIDATE-SUNSET. **User decides per skill** -- the audit does NOT sunset anything automatically (per spec §10.1 + §10.4 conservative bias).")
        lines.append("")
        lines.append("Per spec §10.1: confirmed sunset candidates enter a 30-day deprecation period (warning printed on invocation, then deletion). The user may VETO any candidate, in which case the skill is retained and re-classified.")
        lines.append("")
        for s in candidates:
            lines.append(f"- `{s.namespace}:{s.name}` (age={s.age_days}d, invocations={s.invocations})")
    lines.append("")

    low_inv = by_cls.get("LOW-INVOCATION", [])
    if low_inv:
        lines.append("## Low-invocation review")
        lines.append("")
        lines.append("These skills are NOT sunset candidates (they have at least one invocation in the window) but warrant individual review:")
        lines.append("")
        for s in low_inv:
            lines.append(f"- `{s.namespace}:{s.name}` -- {s.invocations} invocation(s) over the past {max(s.age_days, GRACE_PERIOD_DAYS)} days. Consider whether the value justifies maintenance overhead.")
        lines.append("")

    lines.append("## Cross-references")
    lines.append("")
    lines.append("- Spec: `docs/_internal/incoming/lattice-framework-redesign-spec.md` §10 + §20a Review-4")
    lines.append("- F3 dependency: peer-review wired in lattice f9b2ca5 (Agent D in `commands/lattice/review.md` + Step 1.25 in `commands/lattice/architect.md`); this audit ran AFTER F3 per spec §10.2.")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="F8 skill consolidation audit")
    parser.add_argument("--markdown", action="store_true", help="Output markdown report")
    parser.add_argument("--out", help="Write report to PATH instead of stdout")
    args = parser.parse_args()

    if not LATTICE_ROOT.exists() or not LATTICE_SKILLS_DIR.exists():
        print(f"ERROR: lattice repo not found at {LATTICE_ROOT}", file=sys.stderr)
        return 2

    skills = audit()
    if args.markdown:
        out = render_markdown(skills)
    else:
        out = render_text(skills)

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(out, encoding="utf-8")
        print(f"Wrote report to {out_path}")
    else:
        sys.stdout.write(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
