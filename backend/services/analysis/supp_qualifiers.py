"""SUPP domain parser — reads SUPPxx XPT, parses QVAL into structured categories.

Handles SUPPMI and SUPPMA supplemental qualifier domains. Parses semicolon-separated
QVAL tokens into distribution, temporality, laterality, and location categories.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt


DISTRIBUTION_TERMS = {
    "focal", "multifocal", "focal/multifocal", "diffuse", "segmental",
    "perivascular", "periportal", "centrilobular", "global", "zonal",
}
TEMPORALITY_TERMS = {"acute", "subacute", "chronic"}
LATERALITY_TERMS = {"left", "right", "bilateral", "unilateral"}


@dataclass
class ParsedModifiers:
    raw: str
    distribution: str | None = None
    temporality: str | None = None
    laterality: str | None = None
    location: list[str] = field(default_factory=list)
    other: list[str] = field(default_factory=list)


def parse_qval(qval: str, *, is_ma: bool = False) -> ParsedModifiers:
    """Parse a QVAL string into structured modifier categories.

    QVAL tokens are semicolon-separated. Each token is classified into:
    - distribution (focal, diffuse, etc.)
    - temporality (acute, subacute, chronic)
    - laterality (left, right, bilateral)
    - location (anatomical sub-locations like cortex, ventral)
    - other (unclassified tokens)

    For SUPPMA, also check comma-separated sub-tokens for trailing laterality
    (handles patterns like "foot pad, left").
    """
    result = ParsedModifiers(raw=qval)
    if not qval or not qval.strip():
        return result

    tokens = [t.strip() for t in qval.split(";")]

    for token in tokens:
        if not token:
            continue
        token_lower = token.lower()

        # Check distribution
        if token_lower in DISTRIBUTION_TERMS:
            result.distribution = token_lower
            continue

        # Check temporality
        if token_lower in TEMPORALITY_TERMS:
            result.temporality = token_lower
            continue

        # Check laterality (exact match)
        if token_lower in LATERALITY_TERMS:
            result.laterality = token_lower
            continue

        # For SUPPMA: check comma-separated sub-tokens for trailing laterality
        # e.g., "foot pad, left" → laterality=left, location=["foot pad"]
        if is_ma and "," in token:
            parts = [p.strip() for p in token.split(",")]
            last_part = parts[-1].lower()
            if last_part in LATERALITY_TERMS:
                result.laterality = last_part
                remaining = ", ".join(parts[:-1]).strip()
                if remaining and len(remaining) < 30:
                    result.location.append(remaining.lower())
                elif remaining:
                    result.other.append(remaining)
                continue

        # Classify as location (short) or other (long/complex)
        if len(token) < 30:
            result.location.append(token_lower)
        else:
            result.other.append(token)

    return result


def load_supp_modifiers(
    study: StudyInfo,
    domain: str,
) -> dict[tuple[str, int], ParsedModifiers]:
    """Load and parse SUPP domain modifiers.

    Args:
        study: StudyInfo with xpt_files mapping.
        domain: "mi" or "ma" (lowercase).

    Returns:
        Map of (USUBJID, SEQ) → ParsedModifiers.
    """
    supp_key = f"supp{domain}"
    if supp_key not in study.xpt_files:
        return {}

    supp_df, _ = read_xpt(study.xpt_files[supp_key])
    supp_df.columns = [c.upper() for c in supp_df.columns]

    # Filter to MIRESMOD / MARESMOD qualifiers
    qnam_col = "QNAM" if "QNAM" in supp_df.columns else None
    qval_col = "QVAL" if "QVAL" in supp_df.columns else None
    usubjid_col = "USUBJID" if "USUBJID" in supp_df.columns else None
    idvarval_col = "IDVARVAL" if "IDVARVAL" in supp_df.columns else None

    if not all([qnam_col, qval_col, usubjid_col, idvarval_col]):
        return {}

    # MIRESMOD or MARESMOD
    resmod_name = f"{domain.upper()}RESMOD"
    filtered = supp_df[supp_df[qnam_col].astype(str).str.strip().str.upper() == resmod_name]

    if len(filtered) == 0:
        return {}

    is_ma = domain == "ma"
    result: dict[tuple[str, int], ParsedModifiers] = {}

    for _, row in filtered.iterrows():
        usubjid = str(row[usubjid_col]).strip()
        try:
            seq = int(float(row[idvarval_col]))
        except (ValueError, TypeError):
            continue
        qval = str(row[qval_col]).strip()
        if not qval or qval.upper() == "NAN":
            continue

        result[(usubjid, seq)] = parse_qval(qval, is_ma=is_ma)

    return result


def aggregate_modifiers(records: list[ParsedModifiers]) -> dict:
    """Aggregate ParsedModifiers across multiple subjects into a profile.

    Returns:
        {
            "distribution": {"focal": 3, "diffuse": 2},
            "temporality": {"acute": 4, "chronic": 1},
            "location": {"cortex": 2, "ventral": 1},
            "laterality": {"left": 1, "bilateral": 2},
            "dominant_distribution": "focal" or "mixed" or None,
            "dominant_temporality": "acute" or None,
            "n_with_modifiers": 6,
            "n_total": 6,
            "raw_values": ["acute; focal", "chronic; diffuse", ...]
        }
    """
    dist_counts: Counter[str] = Counter()
    temp_counts: Counter[str] = Counter()
    loc_counts: Counter[str] = Counter()
    lat_counts: Counter[str] = Counter()
    raw_values: set[str] = set()

    for m in records:
        raw_values.add(m.raw)
        if m.distribution:
            dist_counts[m.distribution] += 1
        if m.temporality:
            temp_counts[m.temporality] += 1
        if m.laterality:
            lat_counts[m.laterality] += 1
        for loc in m.location:
            loc_counts[loc] += 1

    # Dominant distribution: most common, or "mixed" if >1 value with counts
    dominant_dist = None
    if dist_counts:
        if len(dist_counts) == 1:
            dominant_dist = next(iter(dist_counts))
        else:
            dominant_dist = "mixed"

    dominant_temp = None
    if temp_counts:
        dominant_temp = temp_counts.most_common(1)[0][0]

    return {
        "distribution": dict(dist_counts) if dist_counts else None,
        "temporality": dict(temp_counts) if temp_counts else None,
        "location": dict(loc_counts) if loc_counts else None,
        "laterality": dict(lat_counts) if lat_counts else None,
        "dominant_distribution": dominant_dist,
        "dominant_temporality": dominant_temp,
        "n_with_modifiers": len(records),
        "n_total": len(records),
        "raw_values": sorted(raw_values),
    }


def count_distributions(records: list[ParsedModifiers]) -> dict[str, int] | None:
    """Count distribution values across modifier records. Returns None if no distributions."""
    counts: Counter[str] = Counter()
    for m in records:
        if m.distribution:
            counts[m.distribution] += 1
    return dict(counts) if counts else None
