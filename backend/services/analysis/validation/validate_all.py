"""Run all validation scripts and report overall result."""

import subprocess
import sys
from pathlib import Path

SCRIPTS = [
    "validate_dunnett.py",
    "validate_trend_test.py",
    "validate_hedges_g.py",
    "validate_fixed_williams.py",
    "validate_ancova.py",
    "validate_fisher_boschloo.py",
]

root = Path(__file__).parent
failed = []

for script in SCRIPTS:
    print(f"{'=' * 60}")
    print(f"Running {script}")
    print(f"{'=' * 60}")
    result = subprocess.run([sys.executable, root / script], cwd=root)
    if result.returncode != 0:
        failed.append(script)

print(f"{'=' * 60}")
if failed:
    print(f"FAILED: {', '.join(failed)}")
    sys.exit(1)
else:
    print(f"ALL {len(SCRIPTS)} VALIDATIONS PASSED")
