#!/usr/bin/env python3
"""
One-shot classifier: parse TODO.md, tag each section with an `autopilot:`
field + `score:` (0-27) based on content heuristics, and split resolved
items into TODO-archive.md.

Heuristics are conservative. Anything ambiguous gets no tag — those
surface as "needs tagging" escalations the next time autopilot runs.

Usage:
  python scripts/tag-todo-autopilot.py \
      --in docs/_internal/TODO.md \
      --out-active docs/_internal/TODO.md \
      --out-archive docs/_internal/TODO-archive.md
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable


HEADER_RE = re.compile(r"^###\s+(.*)$", re.MULTILINE)
RESOLVED_MARKERS = [
    "~~",           # strikethrough
    "RESOLVED",
    "[RESOLVED",
    "**Resolved:**",
    "**Resolved.**",
]

# Pattern → (autopilot_tag, score_hint)
# Order matters: first match wins.
PATTERNS: list[tuple[str, str, int]] = [
    # --- deferred-dg ---
    (r"datagrok|DG migration|post-Datagrok|DG-era|DG port", "deferred-dg", 0),
    (r"Datagrok-era|Datagrok plugin|platform-native", "deferred-dg", 0),

    # --- waiting-data ---
    (r"\*\*Research exhausted:\*\*\s*true", "waiting-data", 0),
    (r"Blocked on:.*(SEND v4\.0|sponsor (pooling|data)|external data|NTP archive|NTP partnership)", "waiting-data", 0),
    (r"no public.*(MA-domain HCD|individual-animal.*HCD|repeated-measures|positive-control)", "waiting-data", 0),

    # --- needs-user: UI epics, design choices, feature scoping ---
    (r"Cohort View.*(redesign|overhaul|epic)|Cohort view redesign|cohort-view-overhaul", "needs-user", 0),
    (r"NOAEL View Overhaul|noael-view-overhaul", "needs-user", 0),
    (r"Favorites\b|favorites.*entities|Starred entities", "needs-user", 0),
    (r"Auth(entication)? (&|and|/) Multi-User|Database-Backed Storage", "needs-user", 0),
    (r"Generated Report Redesign|report redesign", "needs-user", 0),
    (r"Chart.*Export to PPT/PDF|PPT/PDF export|headless browser", "needs-user", 0),
    (r"Overview Tab|Study Intelligence Gaps|Insights Engine Structural Gaps", "needs-user", 0),
    (r"Visual verification pilot|violation audit data collection|visual-baseline gate|skill eval rubric", "needs-user", 0),
    (r"(Layout|Interaction|Design) (decision|choice|taste)", "needs-user", 0),
    (r"Customer check pending|Pending customer feedback|customer-specific|customer-driven", "needs-user", 0),

    # --- ready: mechanical fixes, math corrections, known-bug fixes ---
    # High-score ready items (pillar-touching engine/stats corrections)
    (r"RCV empirical formula.*mean-centering|RCV.*min_baseline|RCV.*moribund", "ready", 18),
    (r"per-timepoint detection windows|detection windows|detection metadata", "ready", 18),
    (r"species normalizer consolidation|three independent species normalization", "ready", 18),
    (r"OM HCD.*BW adjustment|BW-adjusted percentile|allometric.*percentile", "ready", 18),
    (r"harmonize.*percentile.*minimum n|percentile.*n=10", "ready", 15),
    (r"small molecule.*expected pharmacological effect|EPE.*small molecule", "ready", 18),
    (r"mouse syndrome override profile|dedicated mouse.*profile", "ready", 18),
    (r"MI severity_grade_counts.*over-count|severity.*over-count vs affected", "ready", 12),
    (r"HCD mi.*wiring|MI/MA.*S08 clinical catalog|hcd-mi-ma-wiring", "ready", 18),
    (r"Dog magnitude thresholds|NHP magnitude thresholds|species magnitude thresholds", "ready", 21),
    (r"Option D.*recovery|same-arm recovery baseline|within-subject.*recovery", "ready", 15),

    # Medium-score ready (ETL / data expansion / dictionary growth)
    (r"NTP DTT IAD|NTP Histopathology IAD|NTP.*ingestion", "ready", 12),
    (r"term.*alias registry|Expand.*registry|finding-synonyms.*expansion|dictionary expansion", "ready", 12),
    (r"positive control.*fixture|NTP TR-598 PFOA fixture|fixture transcription", "ready", 12),
    (r"Williams.*table|MC-verified values|critical value", "ready", 9),
    (r"LOO.*simulation|non-normal.*simulation|power simulation|FNR simulation", "ready", 9),

    # Low-score ready (tech debt / cleanup)
    (r"triangle audit.*baseline|triangle.*straggler|contract triangle cleanup", "ready", 6),
    (r"extract.*shared.*helper|extract.*module|consolidat(e|ion)", "ready", 6),
    (r"Audit.*`open\(.*\"r\"\)`|encoding.*utf-8.*audit", "ready", 6),
    (r"CDISC.*auto-install|CT versioning.*update", "ready", 6),

    # Bug fixes with known reproduction
    (r"^BUG-\d+", "ready", 9),
    (r"off-by-one|double-exclusion|double-count|incorrect.*flag", "ready", 9),

    # --- Research tagged `ready` (autopilot-safe with peer-review R1+R2) ---
    (r"\[Area:.*Research.*\]", "ready", 9),  # lower-score catch-all for research items
]


def classify(header: str, body: str) -> tuple[str | None, int]:
    """Return (autopilot_tag, score). (None, 0) = untagged."""
    text = (header + "\n" + body).lower()
    for pattern, tag, score in PATTERNS:
        if re.search(pattern, header + " " + body, re.IGNORECASE):
            return tag, score
    # Fallback by Area tag
    if "[area:" in text:
        if any(a in text for a in ["[area: engine", "[area: backend", "[area: etl", "[area: data", "[area: hcd"]):
            return "ready", 6
        if any(a in text for a in ["[area: ui", "[area: frontend"]):
            # UI work usually needs user input, unless it's a clear bug fix
            return "needs-user", 0
    return None, 0


def is_resolved(header: str, body: str) -> bool:
    if header.strip().startswith("~~"):
        return True
    for marker in RESOLVED_MARKERS:
        if marker in header:
            return True
    # Check first few lines of body for resolution markers
    first_lines = "\n".join(body.splitlines()[:3])
    for marker in ["**Resolved.**", "**Resolved:**", "[RESOLVED", "- RESOLVED"]:
        if marker in first_lines:
            return True
    return False


def has_autopilot_tag(body: str) -> bool:
    return bool(re.search(r"^\s*-\s*\*\*autopilot:\*\*", body, re.MULTILINE))


def parse_sections(text: str) -> list[tuple[str, str]]:
    """Split TODO.md at '### ' headers. Returns [(header_line, body), ...]."""
    sections = []
    current_header = None
    current_body: list[str] = []
    preamble: list[str] = []

    for line in text.splitlines(keepends=True):
        if line.startswith("### "):
            if current_header is not None:
                sections.append((current_header, "".join(current_body)))
            else:
                # Preamble before first ### is attached to a sentinel
                sections.append(("__PREAMBLE__", "".join(preamble)))
            current_header = line.rstrip("\n")
            current_body = []
        elif current_header is None:
            preamble.append(line)
        else:
            current_body.append(line)

    if current_header is not None:
        sections.append((current_header, "".join(current_body)))
    elif preamble:
        sections.append(("__PREAMBLE__", "".join(preamble)))

    return sections


def inject_tag(body: str, tag: str, score: int) -> str:
    """Insert an `- **autopilot:** ...` line at the top of the section body."""
    if has_autopilot_tag(body):
        return body
    score_str = f" _score: {score}_" if tag == "ready" else ""
    tag_line = f"- **autopilot:** {tag}{score_str}\n"
    # Insert after the first line break (right after header, body starts)
    # Body typically starts with empty line or a bullet. Insert at the top.
    return tag_line + body


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out-active", dest="out_active", required=True)
    ap.add_argument("--out-archive", dest="out_archive", required=True)
    ap.add_argument("--stats-only", action="store_true",
                    help="Print stats without writing outputs")
    args = ap.parse_args()

    src = Path(args.inp).read_text(encoding="utf-8")
    sections = parse_sections(src)

    # Stats counters
    total = 0
    resolved = 0
    tagged: dict[str, int] = {"ready": 0, "waiting-data": 0, "deferred-dg": 0, "needs-user": 0, "untagged": 0}
    score_buckets: dict[str, int] = {"18+": 0, "12-17": 0, "6-11": 0, "0-5": 0}

    preamble_text = (
        "# TODO\n\n"
        "> **Tactical backlog.** Epics live in `ROADMAP.md`. Resolved items live in `TODO-archive.md`.\n\n"
        "## Autopilot queue contract\n\n"
        "Every section under `### ` carries an `autopilot:` tag that tells `/lattice:autopilot` what to do:\n\n"
        "| Tag | Meaning | Autopilot action |\n"
        "|---|---|---|\n"
        "| `ready` | Safe to advance without user input | Queue for selection, route by size |\n"
        "| `waiting-data` | Blocked on external data (sponsor pooling, unpublished HCD, etc.) | Skip — surfaces in Data Acquisition bucket |\n"
        "| `deferred-dg` | Deferred until Datagrok migration | Skip — revisit post-port |\n"
        "| `needs-user` | Requires design decision, scope call, or user taste | Skip — surfaces in `ESCALATION.md` on demand |\n"
        "| _no tag_ | Unclassified | Escalated to `ESCALATION.md` for tagging on first autopilot run |\n\n"
        "Ready items also carry `score: N` (integer 0-27) using the **pillars × data × impl** rubric "
        "(see `docs/_internal/knowledge/autopilot-flow.md`). Higher score = higher autopilot priority.\n\n"
        "**SCIENCE-FLAG items are autopilot-safe IF ≥3 literature citations exist** for Claude to author "
        "a defensible decision memo. If citations are unavailable, the item is `needs-user`.\n\n"
        "**Regeneration:** `python scripts/tag-todo-autopilot.py --in docs/_internal/TODO.md "
        "--out-active docs/_internal/TODO.md --out-archive docs/_internal/TODO-archive.md`\n\n"
        "---\n\n"
    )
    active_parts: list[str] = [preamble_text]
    archive_parts: list[str] = [
        "# TODO Archive\n\n",
        "> Resolved/strikethrough items split out from `TODO.md` by `scripts/tag-todo-autopilot.py` "
        "so the active backlog stays scannable. Historical reference only.\n\n",
    ]

    for header, body in sections:
        if header == "__PREAMBLE__":
            active_parts.append(body)
            continue
        total += 1
        if is_resolved(header, body):
            resolved += 1
            archive_parts.append(header + "\n")
            archive_parts.append(body)
            continue

        # Active item
        tag, score = classify(header, body)
        if tag is None:
            tagged["untagged"] += 1
        else:
            tagged[tag] += 1
            if tag == "ready":
                if score >= 18:
                    score_buckets["18+"] += 1
                elif score >= 12:
                    score_buckets["12-17"] += 1
                elif score >= 6:
                    score_buckets["6-11"] += 1
                else:
                    score_buckets["0-5"] += 1
            body = inject_tag(body, tag, score)

        active_parts.append(header + "\n")
        active_parts.append(body)

    # Write or print
    if args.stats_only:
        print(f"Total sections: {total}")
        print(f"  Resolved (archived): {resolved}")
        print(f"  Active: {total - resolved}")
        print(f"Tagged:")
        for k, v in tagged.items():
            print(f"  {k}: {v}")
        print(f"Ready score distribution:")
        for k, v in score_buckets.items():
            print(f"  {k}: {v}")
        return 0

    Path(args.out_active).write_text("".join(active_parts), encoding="utf-8")
    Path(args.out_archive).write_text("".join(archive_parts), encoding="utf-8")
    print(f"Wrote {total - resolved} active sections to {args.out_active}")
    print(f"Wrote {resolved} resolved sections to {args.out_archive}")
    print(f"Tag breakdown: {tagged}")
    print(f"Ready score distribution: {score_buckets}")
    print(f"Untagged items to address in ESCALATION.md: {tagged['untagged']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
