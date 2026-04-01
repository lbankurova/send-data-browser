#!/bin/bash
# regenerate-validation.sh — Regenerate all study data and validate against ground truth
#
# Usage: bash scripts/regenerate-validation.sh [--test-only]
#   --test-only   Skip regeneration, only run validation tests
#
# This script:
#   1. Regenerates analysis data for all studies (unless --test-only)
#   2. Runs the ground truth validation test suite
#   3. Reports pass/fail for each study
#
# Run after changing scientific logic in:
#   - backend/services/analysis/*.py
#   - backend/generator/*.py
#   - shared/rules/*.yaml
#   - frontend/src/lib/ (pattern-classification, syndrome rules, etc.)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$REPO_ROOT/backend"
FRONTEND="$REPO_ROOT/frontend"
PYTHON="$BACKEND/venv/Scripts/python.exe"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================"
echo "  SENDEX Validation Suite"
echo "========================================"
echo ""

# Check for --test-only flag
TEST_ONLY=false
if [[ "${1:-}" == "--test-only" ]]; then
    TEST_ONLY=true
    echo "  Mode: test-only (skipping regeneration)"
else
    echo "  Mode: full (regenerate + test)"
fi
echo ""

if [[ "$TEST_ONLY" == "false" ]]; then
    # Set environment for pandas
    export OPENBLAS_NUM_THREADS=1

    STUDIES=(
        "PointCross"
        "instem"
        "CBER-POC-Pilot-Study1-Vaccine_xpt_only"
        "CBER-POC-Pilot-Study2-Vaccine_xpt"
        "CBER-POC-Pilot-Study3-Gene-Therapy"
        "CBER-POC-Pilot-Study4-Vaccine"
        "CBER-POC-Pilot-Study5"
        "CJUGSEND00"
        "CJ16050-xptonly"
        "FFU-Contribution-to-FDA"
        "Nimble"
        "PDS"
        "TOXSCI-24-0062--35449 1 month dog- Compound B-xpt"
        "TOXSCI-24-0062--43066 1 month dog- Compound A-xpt"
        "TOXSCI-24-0062--87497 1 month rat- Compound B-xpt"
        "TOXSCI-24-0062--96298 1 month rat- Compound A xpt"
    )

    echo "--- Step 1: Regenerating study data ---"
    echo ""

    FAILED_STUDIES=()
    for study in "${STUDIES[@]}"; do
        echo -n "  Generating $study... "
        if (cd "$BACKEND" && "$PYTHON" -m generator.generate "$study" > /dev/null 2>&1); then
            echo -e "${GREEN}OK${NC}"
        else
            echo -e "${RED}FAILED${NC}"
            FAILED_STUDIES+=("$study")
        fi
    done

    echo ""
    if [ ${#FAILED_STUDIES[@]} -gt 0 ]; then
        echo -e "${YELLOW}Warning: ${#FAILED_STUDIES[@]} studies failed regeneration:${NC}"
        for s in "${FAILED_STUDIES[@]}"; do
            echo "    - $s"
        done
        echo ""
    fi
fi

echo "--- Step 2: Running ground truth validation tests ---"
echo ""

cd "$FRONTEND"
npx vitest run tests/ground-truth-validation.test.ts

echo ""
echo "--- Step 3: Regenerating validation documents ---"
echo ""

npx vitest run tests/generate-validation-docs.test.ts

echo ""
echo "========================================"
echo -e "  ${GREEN}Validation complete.${NC}"
echo "========================================"
