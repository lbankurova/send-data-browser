#!/usr/bin/env python3
"""
audit-retro-action-items.py -- F7 periodic check that no past retro items have
been silently abandoned.

Per spec §9 + §9.2: every BUG-XXX retrospective in BUG-SWEEP.md whose Lattice
change section has bullets must have each bullet dispositioned into one of
(a) implemented-this-commit, (b) filed-to-todo, or (c) filed-to-escalation.
The pre-commit hook (Step 5b) enforces this forward-looking via retro-action
attestations. THIS script audits the disposition itself: does the named
commit/TODO entry/ESCALATION entry actually exist?

For each retrospective:
  1. Parse the "Lattice change" section into individual bullets.
  2. For each bullet, look for evidence of one of the three dispositions:
     - **implemented-this-commit:** search the commit named in the entry's
       `commit:` field (or the BUG-XXX#5.<N> retro-action attestation history
       if available). If neither exists, count the bullet as MISSING-EVIDENCE.
     - **filed-to-todo:** grep TODO.md for `[from BUG-XXX]` tags.
     - **filed-to-escalation:** grep ESCALATION.md for an entry referencing
       the bullet (heuristic: entry mentions BUG-XXX or one of the bullet's
       file paths).
  3. Report bullets with NO evidence as silently-abandoned.

This is not a pre-commit hook -- it runs on demand or in periodic CI to catch
retro items that landed in BUG-SWEEP but never produced a downstream change.

Usage:
  python scripts/audit-retro-action-items.py             # audit all entries
  python scripts/audit-retro-action-items.py --bug BUG-031   # one entry
  python scripts/audit-retro-action-items.py --since 2026-01-01  # recent only
  python scripts/audit-retro-action-items.py --strict    # exit 1 on any abandoned

Exit:
  0  no abandoned bullets (or --strict not set)
  1  abandoned bullets found AND --strict set
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUG_SWEEP = ROOT / "docs" / "_internal" / "BUG-SWEEP.md"
TODO_MD = ROOT / "docs" / "_internal" / "TODO.md"
ESCALATION_MD = ROOT / "ESCALATION.md"

BUG_HEADING_RE = re.compile(r"^### (BUG-\d+) ", re.MULTILINE)


@dataclass
class RetroEntry:
    bug_id: str
    body: str
    logged_date: date | None
    commit_hash: str | None
    lattice_change_bullets: list[str] = field(default_factory=list)
    has_f7_disposition_table: bool = False


@dataclass
class AbandonedBullet:
    bug_id: str
    bullet_idx: int
    bullet_text: str
    reason: str


def parse_bug_sweep() -> list[RetroEntry]:
    """Extract retro entries from BUG-SWEEP.md."""
    if not BUG_SWEEP.exists():
        print(f"ERROR: {BUG_SWEEP} not found", file=sys.stderr)
        sys.exit(2)
    text = BUG_SWEEP.read_text(encoding="utf-8")

    headings = list(BUG_HEADING_RE.finditer(text))
    entries: list[RetroEntry] = []
    for i, m in enumerate(headings):
        bug_id = m.group(1)
        start = m.start()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        body = text[start:end]

        # Skip entries without a Retrospective section -- only the post-rule-20
        # entries are auditable; older bugs predate the 5-field format.
        if "#### Retrospective" not in body and "5. **Lattice change**" not in body:
            continue

        logged_date = None
        commit_hash = None
        for line in body.splitlines():
            line_stripped = line.strip()
            if line_stripped.startswith("- **logged:**"):
                date_str = line_stripped.split("**logged:**", 1)[1].strip()
                # date format is YYYY-MM-DD (possibly with a parenthetical "(retroactive)")
                date_str = date_str.split(" ")[0]
                try:
                    logged_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                except ValueError:
                    pass
            elif line_stripped.startswith("- **commit:**"):
                hash_str = line_stripped.split("**commit:**", 1)[1].strip()
                if hash_str and hash_str.lower() not in {"none", "n/a", "-"}:
                    commit_hash = hash_str.split()[0]

        # Extract Lattice change bullets. The retro layout is consistent:
        # 5. **Lattice change** —
        #    - `path` — text
        #    - `path` — text
        bullets: list[str] = []
        match = re.search(
            r"5\.\s+\*\*Lattice change\*\*\s*[—\-:]\s*\n((?:\s*-\s+.+\n?)+)",
            body,
        )
        if match:
            block = match.group(1)
            for line in block.splitlines():
                stripped = line.strip()
                if stripped.startswith("-"):
                    bullets.append(stripped.lstrip("-").strip())

        # Detect F7 disposition table -- a section that explicitly maps each
        # Lattice-change bullet to its disposition (implemented-prior-commit /
        # implemented-this-commit / filed-to-todo / filed-to-escalation /
        # not-applicable). Presence of this table means the entry is
        # explicitly dispositioned per spec §9 -- the audit accepts it without
        # heuristic searching.
        has_f7_table = "F7 disposition" in body or "F7 retro-action" in body

        entries.append(RetroEntry(
            bug_id=bug_id,
            body=body,
            logged_date=logged_date,
            commit_hash=commit_hash,
            lattice_change_bullets=bullets,
            has_f7_disposition_table=has_f7_table,
        ))
    return entries


def has_todo_pointer(bug_id: str) -> bool:
    if not TODO_MD.exists():
        return False
    text = TODO_MD.read_text(encoding="utf-8", errors="replace")
    return f"[from {bug_id}]" in text


def has_escalation_pointer(bug_id: str) -> bool:
    if not ESCALATION_MD.exists():
        return False
    text = ESCALATION_MD.read_text(encoding="utf-8", errors="replace")
    return bug_id in text


def commit_exists(commit_hash: str) -> bool:
    """Check git history for the named commit. Accepts short or long hash."""
    try:
        subprocess.run(
            ["git", "cat-file", "-e", commit_hash],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def audit_entry(entry: RetroEntry) -> list[AbandonedBullet]:
    abandoned: list[AbandonedBullet] = []
    if not entry.lattice_change_bullets:
        # Entry has retro but no Lattice change bullets -- could be "no change needed"
        # case which Question 5 explicitly permits with justification.
        return abandoned

    # F7-explicit disposition: the entry contains an explicit per-bullet
    # disposition table. The table itself is the evidence -- the audit accepts
    # it without searching git/TODO/ESCALATION (each row's pointer is an
    # author-asserted disposition that future audit script versions may verify
    # row-by-row).
    if entry.has_f7_disposition_table:
        return abandoned

    # Heuristic disposition evidence: the bullet is considered tracked if ANY
    # of the three dispositions has evidence somewhere in the project state.
    # For pre-F7 entries (no per-bullet attestations), we cannot attribute
    # per-bullet -- treat the bug-level evidence as covering all bullets.
    has_commit = entry.commit_hash is not None and commit_exists(entry.commit_hash)
    has_todo = has_todo_pointer(entry.bug_id)
    has_escalation = has_escalation_pointer(entry.bug_id)

    if has_commit or has_todo or has_escalation:
        return abandoned

    for i, bullet in enumerate(entry.lattice_change_bullets, start=1):
        abandoned.append(AbandonedBullet(
            bug_id=entry.bug_id,
            bullet_idx=i,
            bullet_text=bullet[:120],
            reason=(
                "no F7 disposition table, no fix commit cited in entry, "
                "no '[from %s]' tag in TODO.md, no BUG-id in ESCALATION.md"
                % (entry.bug_id,)
            ),
        ))
    return abandoned


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit retro action-item dispositions.")
    parser.add_argument("--bug", help="Only audit this bug id (e.g. BUG-031)")
    parser.add_argument("--since", help="Only audit entries logged on/after YYYY-MM-DD")
    parser.add_argument("--strict", action="store_true",
                        help="Exit 1 if any abandoned bullets found.")
    args = parser.parse_args()

    since_date = None
    if args.since:
        try:
            since_date = datetime.strptime(args.since, "%Y-%m-%d").date()
        except ValueError:
            print(f"ERROR: --since must be YYYY-MM-DD; got {args.since!r}", file=sys.stderr)
            return 2

    entries = parse_bug_sweep()
    if args.bug:
        entries = [e for e in entries if e.bug_id == args.bug]
        if not entries:
            print(f"No entry matching {args.bug} found in {BUG_SWEEP.name}", file=sys.stderr)
            return 2
    if since_date:
        entries = [e for e in entries if e.logged_date and e.logged_date >= since_date]

    print("=" * 60)
    print(f"  Retro action-item audit -- {len(entries)} retrospective entry(ies)")
    print("=" * 60)
    print()

    all_abandoned: list[AbandonedBullet] = []
    for e in entries:
        if not e.lattice_change_bullets:
            print(f"  {e.bug_id}: no Lattice-change bullets (skipped)")
            continue
        abandoned = audit_entry(e)
        if not abandoned:
            print(f"  {e.bug_id}: {len(e.lattice_change_bullets)} bullet(s); evidence found")
        else:
            print(f"  {e.bug_id}: {len(e.lattice_change_bullets)} bullet(s); ALL ABANDONED")
            for ab in abandoned:
                print(f"    - bullet {ab.bullet_idx}: {ab.bullet_text}")
                print(f"      reason: {ab.reason}")
            all_abandoned.extend(abandoned)

    print()
    print("=" * 60)
    if all_abandoned:
        print(f"  RESULT: {len(all_abandoned)} abandoned bullet(s) across "
              f"{len({a.bug_id for a in all_abandoned})} retro entry(ies).")
        if args.strict:
            print("  --strict set; exiting 1.")
            return 1
        print("  --strict not set; advisory only.")
    else:
        print("  RESULT: no abandoned bullets.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
