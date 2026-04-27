#!/usr/bin/env python3
"""
validate-approval-baseline.py -- structural validation of an approval-test
baseline against backend/tests/approval-baselines/baseline.schema.json.

Used by:
  1. The F4 capture script to verify its emitted file before writing.
  2. The F4 diff script to refuse to compare against a malformed baseline.
  3. The regression test (run on the _example fixture) to catch schema
     defects in PRs that change schema.json.

This validator implements the subset of JSON Schema Draft 2020-12 actually
used by baseline.schema.json (type, required, properties, additionalProperties,
patternProperties, enum, const, minLength, minimum, uniqueItems, format-date-time).
We avoid the upstream `jsonschema` PyPI package to keep approval-test tooling
runnable from the existing venv without a new dependency. If the schema grows
to need richer keywords later, swap to `jsonschema` in backend/requirements.txt.

Usage:
  python scripts/validate-approval-baseline.py <baseline.json>
  python scripts/validate-approval-baseline.py --self-check    # validates _example fixture

Exit:
  0  baseline conforms
  1  validation error (with detailed messages)
  2  schema or baseline file unreadable
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "backend" / "tests" / "approval-baselines" / "baseline.schema.json"
EXAMPLE_BASELINE = ROOT / "backend" / "tests" / "approval-baselines" / "_example" / "baseline.json"


def load_json(path: Path) -> Any:
    if not path.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        sys.exit(2)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read {path}: {exc}", file=sys.stderr)
        sys.exit(2)


def _type_match(value: Any, schema_type: str | list[str]) -> bool:
    if isinstance(schema_type, list):
        return any(_type_match(value, t) for t in schema_type)
    if schema_type == "object":
        return isinstance(value, dict)
    if schema_type == "array":
        return isinstance(value, list)
    if schema_type == "string":
        return isinstance(value, str)
    # JSON: bool is a subtype of int. Reject bools where integer/number is expected.
    if schema_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if schema_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if schema_type == "boolean":
        return isinstance(value, bool)
    if schema_type == "null":
        return value is None
    return False


def _validate_format(value: str, fmt: str) -> str | None:
    if fmt == "date-time":
        # Accept Z suffix and +HH:MM offsets; Python parses Z as UTC since 3.11.
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            return f"format date-time parse error: {exc}"
    return None


def validate(value: Any, schema: dict, path: str = "") -> list[str]:
    """Return a list of validation error messages. Empty list = valid."""
    errors: list[str] = []

    # const
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path or '<root>'}: must be const {schema['const']!r}, got {value!r}")
        return errors  # const failure short-circuits other checks

    # enum
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path or '<root>'}: must be one of {schema['enum']!r}, got {value!r}")

    # type
    if "type" in schema and not _type_match(value, schema["type"]):
        actual = "null" if value is None else type(value).__name__
        errors.append(f"{path or '<root>'}: expected type {schema['type']!r}, got {actual}")
        return errors  # cannot continue meaningful checks on type mismatch

    # string
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path or '<root>'}: string length {len(value)} < minLength {schema['minLength']}")
        if "format" in schema:
            err = _validate_format(value, schema["format"])
            if err:
                errors.append(f"{path or '<root>'}: {err}")

    # number / integer
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path or '<root>'}: value {value} < minimum {schema['minimum']}")

    # array
    if isinstance(value, list):
        if "uniqueItems" in schema and schema["uniqueItems"]:
            seen_serialized = []
            for i, item in enumerate(value):
                key = json.dumps(item, sort_keys=True)
                if key in seen_serialized:
                    errors.append(f"{path or '<root>'}[{i}]: uniqueItems violated -- duplicate of earlier item")
                seen_serialized.append(key)
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for i, item in enumerate(value):
                errors.extend(validate(item, item_schema, f"{path}[{i}]"))

    # object
    if isinstance(value, dict):
        for required_field in schema.get("required", []):
            if required_field not in value:
                errors.append(f"{path or '<root>'}: missing required field {required_field!r}")

        properties = schema.get("properties") or {}
        pattern_properties = schema.get("patternProperties") or {}
        additional_allowed = schema.get("additionalProperties", True)

        for key, child_value in value.items():
            child_path = f"{path}.{key}" if path else key
            matched = False
            if key in properties:
                matched = True
                errors.extend(validate(child_value, properties[key], child_path))
            for pat, pat_schema in pattern_properties.items():
                if re.search(pat, key):
                    matched = True
                    errors.extend(validate(child_value, pat_schema, child_path))
            if not matched and additional_allowed is False:
                errors.append(f"{child_path}: property not allowed (additionalProperties: false; not in properties or patternProperties)")
            elif not matched and isinstance(additional_allowed, dict):
                errors.extend(validate(child_value, additional_allowed, child_path))

    return errors


def validate_baseline(baseline_path: Path) -> int:
    schema = load_json(SCHEMA_PATH)
    baseline = load_json(baseline_path)
    if not isinstance(schema, dict):
        print("ERROR: baseline.schema.json is not a JSON object", file=sys.stderr)
        return 2
    errors = validate(baseline, schema)
    if not errors:
        print(f"OK: {baseline_path} conforms to baseline.schema.json")
        return 0
    print(f"FAIL: {baseline_path} has {len(errors)} schema violation(s):", file=sys.stderr)
    for e in errors:
        print(f"  - {e}", file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate an approval-test baseline against the F4 schema.")
    parser.add_argument("baseline", nargs="?", help="Path to baseline.json")
    parser.add_argument("--self-check", action="store_true",
                        help="Validate the _example fixture (CI/regression usage).")
    args = parser.parse_args()

    if args.self_check:
        return validate_baseline(EXAMPLE_BASELINE)
    if not args.baseline:
        parser.error("either pass a baseline path or use --self-check")
    return validate_baseline(Path(args.baseline))


if __name__ == "__main__":
    sys.exit(main())
