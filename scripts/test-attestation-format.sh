#!/bin/bash
#
# test-attestation-format.sh -- exercise write-review-gate.sh's attestation
# handling end-to-end. Used as a regression check after SIMPLIFY-1 lands and
# every time write-review-gate.sh changes.
#
# Run from any repo that has write-review-gate.sh installed:
#   bash scripts/test-attestation-format.sh
#
# Cases covered:
#   1. No attestations -- gate writes with attestations: [] (backward compat).
#   2. One valid env-var attestation -- gate captures it.
#   3. Multiple valid file attestations -- gate captures all; pending file consumed.
#   4. Invalid JSON in env -- write fails.
#   5. Missing required field -- write fails with clear message.
#   6. Trivial rationale ("n/a") -- write fails.
#   7. Too-short rationale -- write fails.
#   8. Duplicate (kind, ref) within a gate -- write fails.
#   9. Both env and file present -- file wins, env ignored with warning.
#  10. append-attestation.sh composes two entries; gate captures both.
#
# Each case runs in a temp git repo so it does not perturb the hosting repo's
# .lattice/ state. Exit 0 = all pass; non-zero = first failure.

set -e

# Locate the script dir so we can find the canonical write-review-gate.sh /
# append-attestation.sh regardless of which repo this is invoked from.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRITE_GATE="$SCRIPT_DIR/write-review-gate.sh"
APPEND_ATTESTATION="$SCRIPT_DIR/append-attestation.sh"

if [ ! -f "$WRITE_GATE" ]; then
    echo "ERROR: $WRITE_GATE not found" 1>&2
    exit 1
fi
if [ ! -f "$APPEND_ATTESTATION" ]; then
    echo "ERROR: $APPEND_ATTESTATION not found" 1>&2
    exit 1
fi

PASS=0
FAIL=0
FAIL_NAMES=""

setup_repo() {
    local tmp resolved
    tmp="$(mktemp -d)"
    git -C "$tmp" init -q
    git -C "$tmp" config user.email "test@test"
    git -C "$tmp" config user.name "test"
    git -C "$tmp" config core.autocrlf false
    # On Windows/MSYS2 mktemp returns /tmp/... but git rev-parse --show-toplevel
    # returns the Windows-style C:/Users/.../Temp/... path. The gate file lands
    # at the Windows path; we return that resolved path so callers can find the
    # gate file with the same path the script writes to.
    resolved="$(cd "$tmp" && git rev-parse --show-toplevel)"
    mkdir -p "$resolved/scripts" "$resolved/.lattice"
    cp "$WRITE_GATE" "$resolved/scripts/write-review-gate.sh"
    cp "$APPEND_ATTESTATION" "$resolved/scripts/append-attestation.sh"
    chmod +x "$resolved/scripts/"*.sh
    # Need at least one file in the index so STAGED_LIST is non-empty (the
    # gate writes either way, but this exercises the realistic path).
    echo "placeholder" > "$resolved/README.md"
    git -C "$resolved" add README.md
    echo "$resolved"
}

cleanup_repo() {
    rm -rf "$1"
}

run_case() {
    local name="$1"
    local expected="$2"   # "pass" or "fail"
    local actual_rc="$3"
    if [ "$expected" = "pass" ] && [ "$actual_rc" -eq 0 ]; then
        PASS=$((PASS + 1))
        echo "  PASS  $name"
    elif [ "$expected" = "fail" ] && [ "$actual_rc" -ne 0 ]; then
        PASS=$((PASS + 1))
        echo "  PASS  $name (failed as expected)"
    else
        FAIL=$((FAIL + 1))
        FAIL_NAMES="$FAIL_NAMES\n    - $name (expected=$expected, rc=$actual_rc)"
        echo "  FAIL  $name (expected=$expected, rc=$actual_rc)"
    fi
}

# --- Case 1: no attestations -> gate writes with attestations: []
run_case_1() {
    local tmp gate
    tmp="$(setup_repo)"
    gate="$tmp/.lattice/review-gate.json"
    set +e
    (cd "$tmp" && bash scripts/write-review-gate.sh pass "test 1" > /dev/null 2>&1)
    local rc=$?
    set -e
    if [ "$rc" -eq 0 ] && [ -f "$gate" ]; then
        # Verify attestations is empty array
        if python -c "import json; d=json.load(open(r'$gate')); assert d.get('attestations') == [], 'attestations not empty: %r' % d.get('attestations')" 2>/dev/null; then
            run_case "case 1: no attestations -> empty array" "pass" 0
        else
            run_case "case 1: no attestations -> empty array" "pass" 1
        fi
    else
        run_case "case 1: no attestations -> empty array" "pass" "$rc"
    fi
    cleanup_repo "$tmp"
}

# --- Case 2: one valid env attestation
run_case_2() {
    local tmp gate
    tmp="$(setup_repo)"
    gate="$tmp/.lattice/review-gate.json"
    set +e
    (cd "$tmp" && LATTICE_ATTESTATIONS='[{"kind":"peer-review","ref":"commands/lattice/peer-review.md","verdict":"SOUND","rationale":"Algorithm matches OECD 407 multi-timepoint policy"}]' \
        bash scripts/write-review-gate.sh pass "test 2" > /dev/null 2>&1)
    local rc=$?
    set -e
    if [ "$rc" -eq 0 ] && [ -f "$gate" ]; then
        if python -c "import json; d=json.load(open(r'$gate')); a=d['attestations']; assert len(a)==1 and a[0]['kind']=='peer-review' and a[0]['verdict']=='SOUND'" 2>/dev/null; then
            run_case "case 2: one env attestation captured" "pass" 0
        else
            run_case "case 2: one env attestation captured" "pass" 1
        fi
    else
        run_case "case 2: one env attestation captured" "pass" "$rc"
    fi
    cleanup_repo "$tmp"
}

# --- Case 3: multi-entry pending-attestations.json; pending file consumed
run_case_3() {
    local tmp gate pending
    tmp="$(setup_repo)"
    gate="$tmp/.lattice/review-gate.json"
    pending="$tmp/.lattice/pending-attestations.json"
    cat > "$pending" << 'EOF'
[
  {"kind":"peer-review","ref":"commands/lattice/peer-review.md","verdict":"SOUND","rationale":"Algorithm grounded in OECD 407"},
  {"kind":"bug-pattern","ref":"multi-timepoint-kitchen-sink-aggregation","verdict":"verified-not-applicable","rationale":"Diff is display-only; pattern lives in derive-summaries.ts"}
]
EOF
    set +e
    (cd "$tmp" && bash scripts/write-review-gate.sh pass "test 3" > /dev/null 2>&1)
    local rc=$?
    set -e
    if [ "$rc" -eq 0 ] && [ -f "$gate" ]; then
        if python -c "import json,os; d=json.load(open(r'$gate')); a=d['attestations']; assert len(a)==2; assert not os.path.exists(r'$pending'), 'pending file not consumed'" 2>/dev/null; then
            run_case "case 3: multi-entry file captured + pending consumed" "pass" 0
        else
            run_case "case 3: multi-entry file captured + pending consumed" "pass" 1
        fi
    else
        run_case "case 3: multi-entry file captured + pending consumed" "pass" "$rc"
    fi
    cleanup_repo "$tmp"
}

# --- Case 4: invalid JSON in env -> fail
run_case_4() {
    local tmp
    tmp="$(setup_repo)"
    set +e
    (cd "$tmp" && LATTICE_ATTESTATIONS='not-json' bash scripts/write-review-gate.sh pass "test 4" > /dev/null 2>&1)
    local rc=$?
    set -e
    run_case "case 4: invalid JSON rejected" "fail" "$rc"
    cleanup_repo "$tmp"
}

# --- Case 5: missing required field
run_case_5() {
    local tmp
    tmp="$(setup_repo)"
    set +e
    (cd "$tmp" && LATTICE_ATTESTATIONS='[{"kind":"peer-review","verdict":"SOUND","rationale":"Has length over ten chars"}]' \
        bash scripts/write-review-gate.sh pass "test 5" > /dev/null 2>&1)
    local rc=$?
    set -e
    run_case "case 5: missing 'ref' field rejected" "fail" "$rc"
    cleanup_repo "$tmp"
}

# --- Case 6: trivial rationale
run_case_6() {
    local tmp
    tmp="$(setup_repo)"
    set +e
    (cd "$tmp" && LATTICE_ATTESTATIONS='[{"kind":"peer-review","ref":"x","verdict":"SOUND","rationale":"n/a"}]' \
        bash scripts/write-review-gate.sh pass "test 6" > /dev/null 2>&1)
    local rc=$?
    set -e
    run_case "case 6: trivial rationale 'n/a' rejected" "fail" "$rc"
    cleanup_repo "$tmp"
}

# --- Case 7: too-short rationale
run_case_7() {
    local tmp
    tmp="$(setup_repo)"
    set +e
    (cd "$tmp" && LATTICE_ATTESTATIONS='[{"kind":"peer-review","ref":"x","verdict":"SOUND","rationale":"short"}]' \
        bash scripts/write-review-gate.sh pass "test 7" > /dev/null 2>&1)
    local rc=$?
    set -e
    run_case "case 7: too-short rationale rejected" "fail" "$rc"
    cleanup_repo "$tmp"
}

# --- Case 8: duplicate (kind, ref)
run_case_8() {
    local tmp
    tmp="$(setup_repo)"
    set +e
    (cd "$tmp" && LATTICE_ATTESTATIONS='[
        {"kind":"peer-review","ref":"x","verdict":"SOUND","rationale":"First entry rationale long enough"},
        {"kind":"peer-review","ref":"x","verdict":"SOUND","rationale":"Second entry rationale long enough"}
    ]' bash scripts/write-review-gate.sh pass "test 8" > /dev/null 2>&1)
    local rc=$?
    set -e
    run_case "case 8: duplicate (kind, ref) rejected" "fail" "$rc"
    cleanup_repo "$tmp"
}

# --- Case 9: both env and file -> file wins
run_case_9() {
    local tmp gate pending
    tmp="$(setup_repo)"
    gate="$tmp/.lattice/review-gate.json"
    pending="$tmp/.lattice/pending-attestations.json"
    cat > "$pending" << 'EOF'
[{"kind":"bug-pattern","ref":"file-source","verdict":"verified-not-applicable","rationale":"From the file source rationale"}]
EOF
    set +e
    (cd "$tmp" && LATTICE_ATTESTATIONS='[{"kind":"peer-review","ref":"env-source","verdict":"SOUND","rationale":"From the env source rationale"}]' \
        bash scripts/write-review-gate.sh pass "test 9" > /dev/null 2>&1)
    local rc=$?
    set -e
    if [ "$rc" -eq 0 ] && [ -f "$gate" ]; then
        if python -c "import json; d=json.load(open(r'$gate')); a=d['attestations']; assert len(a)==1 and a[0]['ref']=='file-source'" 2>/dev/null; then
            run_case "case 9: file wins over env" "pass" 0
        else
            run_case "case 9: file wins over env" "pass" 1
        fi
    else
        run_case "case 9: file wins over env" "pass" "$rc"
    fi
    cleanup_repo "$tmp"
}

# --- Case 10: append-attestation.sh composes two entries; gate captures both
run_case_10() {
    local tmp gate
    tmp="$(setup_repo)"
    gate="$tmp/.lattice/review-gate.json"
    set +e
    (cd "$tmp" && bash scripts/append-attestation.sh \
        peer-review commands/lattice/peer-review.md SOUND \
        "Composed via helper, rationale long enough" > /dev/null 2>&1)
    local rc1=$?
    (cd "$tmp" && bash scripts/append-attestation.sh \
        retro-action BUG-031 implemented-this-commit \
        "Composed via helper, retro pointer rationale" > /dev/null 2>&1)
    local rc2=$?
    (cd "$tmp" && bash scripts/write-review-gate.sh pass "test 10" > /dev/null 2>&1)
    local rc3=$?
    set -e
    if [ "$rc1" -eq 0 ] && [ "$rc2" -eq 0 ] && [ "$rc3" -eq 0 ] && [ -f "$gate" ]; then
        if python -c "import json; d=json.load(open(r'$gate')); a=d['attestations']; assert len(a)==2; kinds={x['kind'] for x in a}; assert kinds=={'peer-review','retro-action'}" 2>/dev/null; then
            run_case "case 10: append-attestation composes -> gate captures" "pass" 0
        else
            run_case "case 10: append-attestation composes -> gate captures" "pass" 1
        fi
    else
        run_case "case 10: append-attestation composes -> gate captures" "pass" 1
    fi
    cleanup_repo "$tmp"
}

echo "========================================"
echo "  Attestation-format regression suite"
echo "========================================"
echo ""

run_case_1
run_case_2
run_case_3
run_case_4
run_case_5
run_case_6
run_case_7
run_case_8
run_case_9
run_case_10

echo ""
echo "========================================"
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
    echo "  RESULT: $PASS/$TOTAL passed."
    exit 0
else
    echo "  RESULT: $FAIL/$TOTAL failed."
    echo -e "$FAIL_NAMES"
    exit 1
fi
