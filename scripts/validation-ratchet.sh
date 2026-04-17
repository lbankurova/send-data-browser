#!/bin/bash
# validation-ratchet.sh — Nuanced validation comparison for scientific apps
#
# The ratchet is NOT binary keep/discard. Degradation in a scientific app
# may mean "we learned something that changes analytical behavior" — which
# needs research, not rollback.
#
# Usage:
#   bash scripts/validation-ratchet.sh baseline     — capture current scores as baseline
#   bash scripts/validation-ratchet.sh compare      — compare current scores against baseline
#   bash scripts/validation-ratchet.sh auto         — baseline + run validation + compare
#
# Requires: validation summary at docs/validation/summary.md
# Baseline stored at: .lattice/validation-baseline.json

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LATTICE_DIR="$REPO_ROOT/.lattice"
BASELINE_FILE="$LATTICE_DIR/validation-baseline.json"
SUMMARY_FILE="$REPO_ROOT/docs/validation/summary.md"
DECISIONS_LOG="$LATTICE_DIR/decisions.log"

mkdir -p "$LATTICE_DIR"

# --- Parse summary.md into structured scores ---
parse_summary() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo "ERROR: $file not found. Run validation first." >&2
        exit 1
    fi

    # Extract totals line: "**Totals:** 48/49 signals detected, 81/82 design matched, 29/29 assertions passed"
    local totals
    totals=$(grep -E '^\*\*Totals:\*\*' "$file" || echo "")
    if [ -z "$totals" ]; then
        echo "ERROR: Could not parse totals from $file" >&2
        exit 1
    fi

    local signals_hit signals_total design_hit design_total assert_hit assert_total
    signals_hit=$(echo "$totals" | grep -oP '\d+(?=/\d+ signals)' | head -1)
    signals_total=$(echo "$totals" | grep -oP '(?<=\d)/\K\d+(?= signals)' | head -1)
    design_hit=$(echo "$totals" | grep -oP '\d+(?=/\d+ design)' | head -1)
    design_total=$(echo "$totals" | grep -oP '(?<=\d)/\K\d+(?= design)' | head -1)
    assert_hit=$(echo "$totals" | grep -oP '\d+(?=/\d+ assertions)' | head -1)
    assert_total=$(echo "$totals" | grep -oP '(?<=\d)/\K\d+(?= assertions)' | head -1)

    # Extract commit
    local commit
    commit=$(grep -oP '(?<=commit `)[^`]+' "$file" || echo "unknown")

    # Extract per-study scores as array
    local studies=""
    while IFS='|' read -r _ study _ signals design assertions notes _; do
        study=$(echo "$study" | xargs)
        signals=$(echo "$signals" | xargs)
        design=$(echo "$design" | xargs)
        assertions=$(echo "$assertions" | xargs)
        notes=$(echo "$notes" | xargs)
        [ -z "$study" ] && continue
        [[ "$study" == "Study" ]] && continue
        [[ "$study" == "-"* ]] && continue
        studies="$studies{\"study\":\"$study\",\"signals\":\"$signals\",\"design\":\"$design\",\"assertions\":\"$assertions\",\"notes\":\"$notes\"},"
    done < <(grep -E '^\|.*\|.*\|.*\|.*\|.*\|' "$file" | tail -n +3)

    # Remove trailing comma
    studies="${studies%,}"

    cat <<EOF
{
  "commit": "$commit",
  "timestamp": "$(date -Iseconds)",
  "totals": {
    "signals": {"hit": $signals_hit, "total": $signals_total},
    "design": {"hit": $design_hit, "total": $design_total},
    "assertions": {"hit": $assert_hit, "total": $assert_total}
  },
  "studies": [$studies]
}
EOF
}

# --- Capture baseline ---
cmd_baseline() {
    echo "Capturing validation baseline..."
    parse_summary "$SUMMARY_FILE" > "$BASELINE_FILE"
    echo "Baseline saved to $BASELINE_FILE"
    echo "  Signals: $(jq -r '.totals.signals.hit' "$BASELINE_FILE")/$(jq -r '.totals.signals.total' "$BASELINE_FILE")"
    echo "  Design:  $(jq -r '.totals.design.hit' "$BASELINE_FILE")/$(jq -r '.totals.design.total' "$BASELINE_FILE")"
    echo "  Assert:  $(jq -r '.totals.assertions.hit' "$BASELINE_FILE")/$(jq -r '.totals.assertions.total' "$BASELINE_FILE")"
}

# --- Compare current vs baseline ---
cmd_compare() {
    if [ ! -f "$BASELINE_FILE" ]; then
        echo "ERROR: No baseline found. Run 'validation-ratchet.sh baseline' first." >&2
        exit 1
    fi

    echo "Comparing current validation against baseline..."
    echo ""

    local current
    current=$(parse_summary "$SUMMARY_FILE")

    # Extract baseline and current totals
    local b_sig b_des b_ast c_sig c_des c_ast
    b_sig=$(jq -r '.totals.signals.hit' "$BASELINE_FILE")
    b_des=$(jq -r '.totals.design.hit' "$BASELINE_FILE")
    b_ast=$(jq -r '.totals.assertions.hit' "$BASELINE_FILE")
    c_sig=$(echo "$current" | jq -r '.totals.signals.hit')
    c_des=$(echo "$current" | jq -r '.totals.design.hit')
    c_ast=$(echo "$current" | jq -r '.totals.assertions.hit')

    local b_sig_t c_sig_t b_des_t c_des_t b_ast_t c_ast_t
    b_sig_t=$(jq -r '.totals.signals.total' "$BASELINE_FILE")
    c_sig_t=$(echo "$current" | jq -r '.totals.signals.total')
    b_des_t=$(jq -r '.totals.design.total' "$BASELINE_FILE")
    c_des_t=$(echo "$current" | jq -r '.totals.design.total')
    b_ast_t=$(jq -r '.totals.assertions.total' "$BASELINE_FILE")
    c_ast_t=$(echo "$current" | jq -r '.totals.assertions.total')

    local b_commit c_commit
    b_commit=$(jq -r '.commit' "$BASELINE_FILE")
    c_commit=$(echo "$current" | jq -r '.commit')

    echo "  Baseline: commit $b_commit"
    echo "  Current:  commit $c_commit"
    echo ""

    # Classify each metric
    local status="SAME"
    local degraded=""

    classify_metric() {
        local name="$1" before="$2" after="$3" before_t="$4" after_t="$5"
        local delta=$((after - before))
        local delta_t=$((after_t - before_t))

        if [ "$delta" -gt 0 ]; then
            echo "  $name: $before/$before_t -> $after/$after_t  IMPROVED (+$delta)"
        elif [ "$delta" -lt 0 ]; then
            echo "  $name: $before/$before_t -> $after/$after_t  DEGRADED ($delta)"
            status="DEGRADED"
            degraded="$degraded $name"
        elif [ "$delta_t" -ne 0 ]; then
            echo "  $name: $before/$before_t -> $after/$after_t  CHANGED (total shifted)"
        else
            echo "  $name: $before/$before_t -> $after/$after_t  SAME"
        fi
    }

    classify_metric "Signals" "$b_sig" "$c_sig" "$b_sig_t" "$c_sig_t"
    classify_metric "Design" "$b_des" "$c_des" "$b_des_t" "$c_des_t"
    classify_metric "Asserts" "$b_ast" "$c_ast" "$b_ast_t" "$c_ast_t"

    echo ""

    # Overall classification
    if [ "$status" = "DEGRADED" ]; then
        echo "=========================================="
        echo "  VALIDATION DEGRADATION DETECTED"
        echo "  Degraded metrics:$degraded"
        echo "=========================================="
        echo ""
        echo "This is NOT an automatic rollback."
        echo "Degradation means analytical behavior changed."
        echo ""
        echo "Next steps:"
        echo "  1. Identify WHICH signals/assertions changed (diff the summary.md)"
        echo "  2. Determine: was this EXPECTED from the current work?"
        echo "     - If YES: update ground truth references + document the change"
        echo "     - If NO:  the change introduced unintended analytical drift"
        echo "               -> route to /lattice:research on the specific regression"
        echo "  3. Log the decision in .lattice/decisions.log"
        echo ""

        # Append to decisions log
        echo "$(date -Iseconds)	validation-ratchet	DEGRADED	$b_commit->$c_commit	signals:$b_sig/$b_sig_t->$c_sig/$c_sig_t design:$b_des/$b_des_t->$c_des/$c_des_t asserts:$b_ast/$b_ast_t->$c_ast/$c_ast_t	degraded:$degraded" >> "$DECISIONS_LOG"

        # Set comparison marker (even on degradation — the agent saw it and must handle it)
        touch "$LATTICE_DIR/validation-compared"
        exit 2  # exit 2 = degradation detected (not a script error)
    else
        echo "  Status: $status"
        if [ "$c_sig" -gt "$b_sig" ] || [ "$c_des" -gt "$b_des" ] || [ "$c_ast" -gt "$b_ast" ]; then
            echo "  Validation scores IMPROVED. Updating baseline."
            echo "$current" > "$BASELINE_FILE"
            echo "$(date -Iseconds)	validation-ratchet	IMPROVED	$b_commit->$c_commit	signals:$b_sig/$b_sig_t->$c_sig/$c_sig_t design:$b_des/$b_des_t->$c_des/$c_des_t asserts:$b_ast/$b_ast_t->$c_ast/$c_ast_t" >> "$DECISIONS_LOG"
        else
            echo "$(date -Iseconds)	validation-ratchet	SAME	$b_commit->$c_commit	signals:$b_sig/$b_sig_t design:$b_des/$b_des_t asserts:$b_ast/$b_ast_t" >> "$DECISIONS_LOG"
        fi

        # Set comparison marker — validation was checked, commit can proceed
        touch "$LATTICE_DIR/validation-compared"
        # Clear engine-changed marker
        rm -f "$LATTICE_DIR/engine-changed" 2>/dev/null
        exit 0
    fi
}

# --- Auto mode: baseline + regen + compare ---
cmd_auto() {
    if [ ! -f "$BASELINE_FILE" ]; then
        echo "No baseline exists. Capturing current state as baseline."
        cmd_baseline
        echo ""
    fi

    echo "Running full validation suite..."
    echo ""
    if [ -f "$REPO_ROOT/scripts/regenerate-validation.sh" ]; then
        bash "$REPO_ROOT/scripts/regenerate-validation.sh"
    else
        echo "ERROR: regenerate-validation.sh not found" >&2
        exit 1
    fi

    echo ""
    cmd_compare
}

# --- Main ---
case "${1:-}" in
    baseline) cmd_baseline ;;
    compare)  cmd_compare ;;
    auto)     cmd_auto ;;
    *)
        echo "Usage: validation-ratchet.sh {baseline|compare|auto}"
        echo ""
        echo "  baseline  — capture current validation scores"
        echo "  compare   — compare current vs baseline (exit 0=ok, 2=degraded)"
        echo "  auto      — baseline (if needed) + regenerate + compare"
        exit 1
        ;;
esac
