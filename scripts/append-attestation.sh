#!/bin/bash
#
# append-attestation.sh -- compose one attestation entry into
# .lattice/pending-attestations.json (created if absent).
#
# This is the canonical composition path used by F3 (peer-review wiring), F6
# (bug-pattern propagation), and F7 (retro-action tracking). All three skills
# build attestations via this helper rather than touching the JSON directly.
#
# Usage:
#   bash scripts/append-attestation.sh <kind> <ref> <verdict> <rationale> [agent_id]
#
# Arguments:
#   kind       Attestation category. Reserved values:
#                "peer-review"  (F3 -- peer-review skill verdicts)
#                "bug-pattern"  (F6 -- bug-pattern propagation verifications)
#                "retro-action" (F7 -- retro action-item pointers)
#              Other values are accepted for forward compatibility.
#   ref        Pointer to source artifact (skill name, pattern id, BUG id, etc.).
#   verdict    Kind-specific verdict tag (e.g. "SOUND" for peer-review,
#                "verified-not-applicable" for bug-pattern).
#   rationale  One-line reason. Must be >= 10 chars and not a trivial value
#                like "n/a", "idk", "tbd", etc. (write-review-gate.sh enforces).
#   agent_id   Optional. The session/agent identifier. Defaults to "user-direct".
#
# Validation: this script does light shape checks before writing. The full
# validation (rationale length, trivial-value rejection, duplicate detection)
# happens in write-review-gate.sh when the gate is written. That keeps the
# rules in one place.
#
# Exit codes: 0 on success, 1 on validation failure or write error.

set -e

if [ $# -lt 4 ]; then
    cat << 'EOF' 1>&2
ERROR: append-attestation.sh requires 4 args (5 with optional agent_id).

Usage:
  bash scripts/append-attestation.sh <kind> <ref> <verdict> <rationale> [agent_id]

Example (peer-review):
  bash scripts/append-attestation.sh peer-review \
    commands/lattice/peer-review.md \
    SOUND \
    "Algorithm matches OECD 407 LOAEL gate composition; cited HCD-FACT-NOAEL-01" \
    "peer-review-agent-2026-04-27"

Example (bug-pattern verification):
  bash scripts/append-attestation.sh bug-pattern \
    multi-timepoint-kitchen-sink-aggregation \
    verified-not-applicable \
    "Diff touches FindingsContextPanel.tsx (display only); pattern is in derive-summaries.ts aggregation"
EOF
    exit 1
fi

KIND="$1"
REF="$2"
VERDICT="$3"
RATIONALE="$4"
AGENT_ID="${5:-user-direct}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
PENDING_FILE="$REPO_ROOT/.lattice/pending-attestations.json"
mkdir -p "$REPO_ROOT/.lattice"

export _PENDING_FILE="$PENDING_FILE"
export _KIND="$KIND"
export _REF="$REF"
export _VERDICT="$VERDICT"
export _RATIONALE="$RATIONALE"
export _AGENT_ID="$AGENT_ID"

PYTHONIOENCODING=utf-8 python << 'PYEOF'
import json
import os
import sys

pending_file = os.environ["_PENDING_FILE"]

# Light shape validation -- the heavy lifting (length, triviality, duplicate
# detection) is in write-review-gate.sh so the rules live in one place.
for field in ("_KIND", "_REF", "_VERDICT", "_RATIONALE"):
    value = os.environ.get(field, "")
    if value.strip() == "":
        print("ERROR: %s must be non-empty." % field[1:].lower(), file=sys.stderr)
        sys.exit(1)

entry = {
    "kind": os.environ["_KIND"],
    "ref": os.environ["_REF"],
    "verdict": os.environ["_VERDICT"],
    "rationale": os.environ["_RATIONALE"],
    "agent_id": os.environ["_AGENT_ID"],
}

existing = []
if os.path.exists(pending_file):
    try:
        with open(pending_file, "r", encoding="utf-8") as fh:
            existing = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print("ERROR: could not read existing %s: %s" % (pending_file, exc), file=sys.stderr)
        print("       Delete the file and retry, or fix the JSON manually.", file=sys.stderr)
        sys.exit(1)
    if not isinstance(existing, list):
        print("ERROR: %s exists but is not a JSON array." % pending_file, file=sys.stderr)
        sys.exit(1)

existing.append(entry)

with open(pending_file, "w", encoding="utf-8") as fh:
    json.dump(existing, fh, indent=2)
    fh.write("\n")

print("Appended attestation: kind=%s ref=%s verdict=%s (now %d entries pending)" % (
    entry["kind"], entry["ref"], entry["verdict"], len(existing),
))
PYEOF
