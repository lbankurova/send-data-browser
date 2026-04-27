"""Historical Control Data (HCD) reference ranges — A-3 factor for ECETOC.

Phase 1: static JSON ranges from published data (Envigo C11963 SD rat).
Phase 2: SQLite database built from NTP DTT IAD (14+ strains, 40+ tissues).

Architecture: SQLite-first, JSON fallback. assess_a3() is the public API —
callers don't need to know which backend is serving data.

A-3 scoring:
  within_hcd  → -0.5 (reduces treatment-relatedness: within normal variation)
  outside_hcd → +0.5 (increases treatment-relatedness: exceeds normal variation)
  no_hcd      →  0.0 (no reference data available, neutral)
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

from config import SHARED_DIR

_JSON_PATH = SHARED_DIR / "hcd-reference-ranges.json"

# Lazy-loaded singletons
_DB: HcdRangeDB | None = None
_SQLITE_DB = None  # HcdSqliteDB | None — lazy import to avoid circular deps


@dataclass(frozen=True)
class HcdRange:
    """A single HCD reference range entry."""
    organ: str
    sex: str
    duration_category: str
    mean: float
    sd: float
    n: int
    lower: float  # mean - 2*SD, clipped to >= 0 (see _compute_bounds)
    upper: float  # mean + 2*SD
    source: str
    bounds_method: str = "normal_2sd_clipped"  # provenance per GAP-236


def _compute_bounds(mean: float, sd: float) -> tuple[float, float, bool]:
    # GAP-236: parametric mean +/- 2*sd interval assumes the distribution is
    # approximately Normal. For organ weights this typically holds at population
    # level, but the lower bound can fall below zero (biologically impossible).
    # Clip the lower bound to 0 and flag whether clipping was applied so callers
    # can interpret "lower=0.0" as "clipped, distribution skewed" rather than
    # "negative organ weight is plausible".
    raw_lower = mean - 2.0 * sd
    clipped = raw_lower < 0.0
    lower = 0.0 if clipped else raw_lower
    upper = mean + 2.0 * sd
    return lower, upper, clipped


class HcdRangeDB:
    """Indexed lookup for HCD reference ranges."""

    def __init__(self, data: dict):
        self._index: dict[tuple[str, str, str, str], HcdRange] = {}
        self._strain_aliases: dict[str, str] = {}
        self._build(data)

    def _build(self, data: dict) -> None:
        strains = data.get("strains", {})
        for strain_key, strain_data in strains.items():
            # Register aliases → canonical strain key
            aliases = strain_data.get("aliases", [])
            for alias in aliases:
                self._strain_aliases[alias.strip().upper()] = strain_key
            self._strain_aliases[strain_key.strip().upper()] = strain_key

            # Index entries
            for entry in strain_data.get("entries", []):
                organ = entry["organ"].strip().upper()
                sex = entry["sex"].strip().upper()
                dur = entry["duration_category"]
                mean = entry["mean"]
                sd = entry["sd"]
                n = entry.get("n", 0)

                lower, upper, clipped = _compute_bounds(mean, sd)
                rng = HcdRange(
                    organ=organ,
                    sex=sex,
                    duration_category=dur,
                    mean=mean,
                    sd=sd,
                    n=n,
                    lower=lower,
                    upper=upper,
                    source=strain_key,
                    bounds_method="normal_2sd_clipped" if clipped else "normal_2sd",
                )
                key = (strain_key, sex, dur, organ)
                self._index[key] = rng

    def resolve_strain(self, strain_raw: str | None) -> str | None:
        """Map raw TS STRAIN value to canonical strain key."""
        if not strain_raw:
            return None
        return self._strain_aliases.get(strain_raw.strip().upper())

    def query(
        self,
        strain: str,
        sex: str,
        duration_category: str,
        organ: str,
    ) -> HcdRange | None:
        """Look up HCD range by exact strain/sex/duration/organ."""
        key = (strain, sex.strip().upper(), duration_category, organ.strip().upper())
        return self._index.get(key)


def _load_sqlite_db():
    """Lazy-load the SQLite HCD database (singleton). Returns HcdSqliteDB or None."""
    global _SQLITE_DB
    if _SQLITE_DB is not None:
        return _SQLITE_DB if _SQLITE_DB.available else None
    try:
        from services.analysis.hcd_database import get_sqlite_db
        _SQLITE_DB = get_sqlite_db()
        if _SQLITE_DB.available:
            log.info("HCD SQLite database loaded successfully")
            return _SQLITE_DB
    except Exception as e:
        log.debug("HCD SQLite not available: %s", e)
    return None


def _load_db() -> HcdRangeDB:
    """Lazy-load the JSON HCD range database (singleton fallback)."""
    global _DB
    if _DB is not None:
        return _DB
    try:
        with open(_JSON_PATH) as f:
            data = json.load(f)
        _DB = HcdRangeDB(data)
    except Exception as e:
        log.warning("Failed to load HCD ranges from %s: %s", _JSON_PATH, e)
        _DB = HcdRangeDB({"strains": {}})
    return _DB


# ---------------------------------------------------------------------------
# Specimen → HCD organ key mapping (reuse from organ_thresholds.py)
# ---------------------------------------------------------------------------
_SPECIMEN_TO_HCD_ORGAN: dict[str, str] = {
    "ADRENAL GLAND": "ADRENAL",
    "ADRENAL GLANDS": "ADRENAL",
    "ADRENALS": "ADRENAL",
    "GLAND, ADRENAL": "ADRENAL",
    "THYROID GLAND": "THYROID",
    "THYROID GLANDS": "THYROID",
    "THYROID": "THYROID",
    "GLAND, THYROID": "THYROID",
    "TESTIS": "TESTES",
    "TESTES": "TESTES",
    "OVARY": "OVARIES",
    "OVARIES": "OVARIES",
    "EPIDIDYMIS": "EPIDIDYMIDES",
    "EPIDIDYMIDES": "EPIDIDYMIDES",
    "UTERUS": "UTERUS",
    "LIVER": "LIVER",
    "KIDNEY": "KIDNEY",
    "KIDNEYS": "KIDNEY",
    "HEART": "HEART",
    "BRAIN": "BRAIN",
    "SPLEEN": "SPLEEN",
    "THYMUS": "THYMUS",
    "LUNG": "LUNGS",
    "LUNGS": "LUNGS",
    "PANCREAS": "PANCREAS",
    "GLAND, PITUITARY": "PITUITARY",
    "PITUITARY GLAND": "PITUITARY",
    "PITUITARY": "PITUITARY",
}


def _resolve_specimen(specimen: str) -> str:
    """Map SEND specimen name to HCD organ key."""
    return _SPECIMEN_TO_HCD_ORGAN.get(specimen.strip().upper(), specimen.strip().upper())


# ---------------------------------------------------------------------------
# Duration parsing
# ---------------------------------------------------------------------------

def parse_iso8601_duration_to_days(duration_str: str) -> int | None:
    """Parse ISO 8601 duration (PnW, PnD, PnM) to approximate days.

    Examples: P13W → 91, P28D → 28, P3M → 90, P6M → 180
    """
    if not duration_str:
        return None
    m = re.match(r"P(\d+)([DWMY])", duration_str.strip().upper())
    if not m:
        return None
    val = int(m.group(1))
    unit = m.group(2)
    if unit == "D":
        return val
    if unit == "W":
        return val * 7
    if unit == "M":
        return val * 30  # approximate
    if unit == "Y":
        return val * 365
    return None


def _duration_to_category(days: int | None) -> str | None:
    """Map study duration in days to HCD duration category.

    Categories: '28-day' (<=42d), '90-day' (43-180d), 'chronic' (181-364d),
    'carcinogenicity' (>364d). Returns None if duration unknown.
    """
    if days is None:
        return None
    if days <= 42:
        return "28-day"
    if days <= 180:
        return "90-day"
    if days <= 364:
        return "chronic"
    return "carcinogenicity"


# ---------------------------------------------------------------------------
# A-3 assessment
# ---------------------------------------------------------------------------

def assess_a3(
    treated_group_mean: float | None,
    specimen: str,
    sex: str,
    strain: str | None,
    duration_days: int | None,
    *,
    route: str | None = None,
    vehicle: str | None = None,
    control_group_mean: float | None = None,
    species: str | None = None,
    age_months: float | None = None,
) -> dict:
    """Assess A-3 factor: is the treated-group mean within HCD range?

    Compares the highest-dose group mean against [mean-2SD, mean+2SD] from
    matching HCD entry. Tries SQLite database first (Phase 2), then falls
    back to static JSON (Phase 1).

    When control_group_mean is provided, also checks whether the study's
    concurrent control falls outside the HCD range — a conflict that means
    the HCD comparison may be unreliable (reviewer audit 2026-03).

    Returns dict with:
      result: 'within_hcd' | 'outside_hcd' | 'no_hcd'
      score: -0.5 | +0.5 | 0.0
      detail: human-readable annotation
      control_outside_hcd: bool (True if concurrent control is outside HCD range)
      control_hcd_detail: str (description of control vs HCD comparison)
    Plus optional extended fields when SQLite is the source:
      percentile_rank, n, study_count, source
    """
    if treated_group_mean is None:
        return {"result": "no_hcd", "score": 0.0, "detail": "No treated-group mean available"}

    organ_key = _resolve_specimen(specimen)

    # Dog (non-rodent) path: age-based HCD lookup
    if _is_dog_species(species):
        return _assess_a3_dog(
            treated_group_mean, organ_key, sex, strain,
            duration_days, age_months,
            control_group_mean=control_group_mean,
        )

    # NHP path: bracket-based age matching
    if _is_nhp_species(species):
        return _assess_a3_nhp(
            treated_group_mean, organ_key, sex, strain,
            duration_days, age_months,
            control_group_mean=control_group_mean,
        )

    dur_cat = _duration_to_category(duration_days)
    if not dur_cat:
        return {"result": "no_hcd", "score": 0.0, "detail": f"Duration {duration_days}d outside HCD coverage"}

    # Try SQLite first (Phase 2)
    sqlite_db = _load_sqlite_db()
    if sqlite_db is not None:
        resolved = sqlite_db.resolve_strain(strain)
        if resolved:
            hcd = sqlite_db.query_extended(
                resolved, sex, dur_cat, organ_key,
                route=route, vehicle=vehicle,
            )
            if hcd:
                return _evaluate_hcd(treated_group_mean, hcd, sqlite_db, resolved, sex, dur_cat, organ_key,
                                     control_group_mean=control_group_mean)

    # Fallback to JSON (Phase 1)
    json_db = _load_db()
    resolved_strain = json_db.resolve_strain(strain)
    if not resolved_strain:
        return {"result": "no_hcd", "score": 0.0, "detail": f"Strain '{strain}' not in HCD database"}

    hcd = json_db.query(resolved_strain, sex, dur_cat, organ_key)
    if not hcd:
        return {"result": "no_hcd", "score": 0.0, "detail": f"No HCD entry for {organ_key}/{sex}/{dur_cat}"}

    within = hcd.lower <= treated_group_mean <= hcd.upper
    result = "within_hcd" if within else "outside_hcd"
    score = -0.5 if within else 0.5

    detail = (
        f"Treated mean {treated_group_mean:.3f} vs HCD [{hcd.lower:.3f}, {hcd.upper:.3f}] "
        f"(ref: {hcd.mean}±{hcd.sd}, n={hcd.n}, {hcd.source})"
    )
    out = {"result": result, "score": score, "detail": detail}
    _check_control_vs_hcd(out, control_group_mean, hcd.lower, hcd.upper, hcd.mean, hcd.sd)
    return out


def _is_dog_species(species: str | None) -> bool:
    """Check if the species string indicates dog/beagle.

    Delegates to the canonical species resolver to avoid split-brain
    recognition (CANINE vs MONGREL etc.).
    """
    from services.analysis.organ_thresholds import _resolve_species_category
    return _resolve_species_category(species) == "dog"


_DEFAULT_DOG_START_AGE_MONTHS = 6.0  # standard beagle subchronic start age


def _estimate_dog_age_months(duration_days: int | None, age_months: float | None) -> float:
    """Estimate terminal age in months for a dog study.

    If age_months is provided, it is the terminal age (AGELO + duration,
    pre-computed by the caller). Otherwise estimate from default start
    age (6 months for beagle subchronic) + study duration.
    """
    if age_months is not None:
        return age_months
    duration_months = (duration_days / 30.0) if duration_days else 0.0
    return _DEFAULT_DOG_START_AGE_MONTHS + duration_months


def _assess_a3_dog(
    treated_group_mean: float,
    organ_key: str,
    sex: str,
    strain: str | None,
    duration_days: int | None,
    age_months: float | None,
    *,
    control_group_mean: float | None = None,
) -> dict:
    """A-3 assessment for dog studies using age-based HCD lookup."""
    sqlite_db = _load_sqlite_db()
    if sqlite_db is None:
        return {"result": "no_hcd", "score": 0.0, "detail": "HCD database not available"}

    resolved = sqlite_db.resolve_strain(strain) if strain else sqlite_db.resolve_strain("BEAGLE")
    if not resolved:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"Dog strain '{strain}' not in HCD database"}

    terminal_age = _estimate_dog_age_months(duration_days, age_months)

    hcd = sqlite_db.query_by_age(resolved, sex, terminal_age, organ_key)
    if not hcd:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"No dog HCD for {organ_key}/{sex} (age ~{terminal_age:.1f}mo)"}

    # Use sd_inflated when study_count < 3 (single-source HCD)
    sd = hcd["sd"]
    study_count = hcd.get("study_count", 1)
    if study_count < 3 and hcd.get("sd_inflated"):
        sd = hcd["sd_inflated"]
        # GAP-236: clip lower to non-negative (see _compute_bounds).
        lower, upper, clipped = _compute_bounds(hcd["mean"], sd)
        hcd["lower"] = round(lower, 6)
        hcd["upper"] = round(upper, 6)
        hcd["bounds_method"] = "normal_2sd_clipped" if clipped else "normal_2sd"

    within = hcd["lower"] <= treated_group_mean <= hcd["upper"]
    result_str = "within_hcd" if within else "outside_hcd"
    score = -0.5 if within else 0.5

    age_matched = hcd.get("age_matched", terminal_age)
    age_gap = hcd.get("age_gap", 0.0)
    n = hcd.get("n", 0)
    source = hcd.get("source", "CHOI2011")
    confidence = hcd.get("confidence", "MODERATE")

    detail = (
        f"Treated mean {treated_group_mean:.3f} vs dog HCD "
        f"[{hcd['lower']:.3f}, {hcd['upper']:.3f}] "
        f"(ref: {hcd['mean']:.4f}+/-{sd:.4f}, n={n}, {source}, "
        f"age-matched to {age_matched:.0f}mo"
    )
    if age_gap > 0:
        detail += f", age gap: {age_gap:.1f}mo"
    detail += ")"

    # Age gap caveat
    if age_gap > 3:
        detail += " WARNING: age gap >3 months -- HCD match confidence reduced"
        confidence = "LOW"

    out: dict = {
        "result": result_str,
        "score": score,
        "detail": detail,
        "domain": "OM",
        "n": n,
        "study_count": study_count,
        "source": source,
        "confidence": confidence,
        "age_matched": age_matched,
        "age_gap": age_gap,
    }

    # Control vs HCD check
    _check_control_vs_hcd(out, control_group_mean, hcd["lower"], hcd["upper"],
                          hcd["mean"], sd)

    return out


# ---------------------------------------------------------------------------
# NHP (cynomolgus monkey) age-based HCD
# ---------------------------------------------------------------------------

def _is_nhp_species(species: str | None) -> bool:
    """Check if the species string indicates NHP/monkey."""
    from services.analysis.organ_thresholds import _resolve_species_category
    return _resolve_species_category(species) == "nhp"


_DEFAULT_NHP_START_AGE_MONTHS = 36.0  # midpoint of typical 2.5-4y GLP NHP range

# Age brackets for Amato 2022 data. Each: (lo_months, hi_months, midpoint, label).
# Bracket matching: lo <= age < hi.
# Future NHP HCD data sources must extend this list.
_NHP_AGE_BRACKETS = [
    (30.0, 48.0, 42.0, "peripubertal"),    # >2.5-4y (not yet in DB)
    (48.0, 114.0, 81.0, "young_adult"),     # >4-9.5y
    (114.0, 240.0, 177.0, "adult"),         # >9.5-20y
]


def _estimate_nhp_age_months(
    duration_days: int | None, age_months: float | None,
) -> tuple[float, bool]:
    """Estimate terminal age in months for an NHP study.

    Returns (age_months, is_estimated). When age_months is provided
    (from TS AGELO), uses it directly. Otherwise estimates from default
    start age + study duration.
    """
    if age_months is not None:
        return age_months, False
    duration_months = (duration_days / 30.0) if duration_days else 0.0
    return _DEFAULT_NHP_START_AGE_MONTHS + duration_months, True


def _assess_a3_nhp(
    treated_group_mean: float,
    organ_key: str,
    sex: str,
    strain: str | None,
    duration_days: int | None,
    age_months: float | None,
    *,
    control_group_mean: float | None = None,
) -> dict:
    """A-3 assessment for NHP studies using bracket-based age matching.

    Bracket matching determines which Amato age stratum to compare against,
    then delegates to query_by_age() for the actual DB lookup. Midpoints are
    passed directly because the Amato data is stored at these exact age_months
    values in hcd_aggregates.
    """
    sqlite_db = _load_sqlite_db()
    if sqlite_db is None:
        return {"result": "no_hcd", "score": 0.0, "detail": "HCD database not available"}

    resolved = sqlite_db.resolve_strain(strain) if strain else sqlite_db.resolve_strain("CYNOMOLGUS")
    if not resolved:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"NHP strain '{strain}' not in HCD database"}

    terminal_age, is_estimated = _estimate_nhp_age_months(duration_days, age_months)

    # Bracket matching: find which Amato bracket the terminal age falls in
    matched_bracket = None
    for lo, hi, midpoint, label in _NHP_AGE_BRACKETS:
        if lo <= terminal_age < hi:
            matched_bracket = (midpoint, label)
            break

    if matched_bracket is None:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"Study animal age ({terminal_age:.1f}mo) outside NHP HCD "
                          f"reference range (2.5-20y)"}

    bracket_midpoint, bracket_name = matched_bracket

    hcd = sqlite_db.query_by_age(resolved, sex, bracket_midpoint, organ_key)
    if not hcd:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"No NHP HCD for {organ_key}/{sex} "
                          f"(bracket: {bracket_name}, age ~{terminal_age:.1f}mo)"}

    # Detect stratum mismatch: bracket matched one stratum but query_by_age
    # returned data from a different stratum (e.g., peripubertal bracket matched
    # but only young_adult data exists). Adjust label to reflect actual data source.
    stratum_mismatch = False
    actual_age = hcd.get("age_matched", bracket_midpoint)
    if abs(actual_age - bracket_midpoint) > 1.0:
        stratum_mismatch = True
        # Find the label for the actual stratum
        actual_label = bracket_name
        for lo, hi, mid, label in _NHP_AGE_BRACKETS:
            if abs(actual_age - mid) < 1.0:
                actual_label = label
                break
        bracket_name = actual_label

    # NO sd_inflated for Amato colony data
    within = hcd["lower"] <= treated_group_mean <= hcd["upper"]
    result_str = "within_hcd" if within else "outside_hcd"
    score = -0.5 if within else 0.5

    n = hcd.get("n", 0)
    source = hcd.get("source", "AMATO2022")
    confidence = "LOW" if stratum_mismatch else hcd.get("confidence", "MODERATE")
    sd = hcd["sd"]

    detail = (
        f"Treated mean {treated_group_mean:.3f} vs NHP HCD "
        f"[{hcd['lower']:.3f}, {hcd['upper']:.3f}] "
        f"(ref: {hcd['mean']:.4f}+/-{sd:.4f}, n={n}, {source}, {bracket_name})"
    )

    if is_estimated:
        detail += (
            " -- terminal age estimated from default start age; "
            "AGELO not in study metadata. Bracket assignment may be incorrect"
        )

    # Low-power caveat: always present for NHP OM (N=3-5/sex typical)
    low_power_msg = (
        f"Low statistical power (N={n}/sex); "
        "organ weight assessment relies on histopathology concordance "
        "and dose-response pattern"
    )

    out: dict = {
        "result": result_str,
        "score": score,
        "detail": detail,
        "domain": "OM",
        "n": n,
        "source": source,
        "confidence": confidence,
        "bracket": bracket_name,
        "hcd_source_caveat": "colony_reference",
        "low_power_caveat": low_power_msg,
    }

    # Control vs HCD check
    _check_control_vs_hcd(out, control_group_mean, hcd["lower"], hcd["upper"],
                          hcd["mean"], sd)

    return out


def _check_control_vs_hcd(
    out: dict,
    control_group_mean: float | None,
    hcd_lower: float,
    hcd_upper: float,
    hcd_mean: float,
    hcd_sd: float,
) -> None:
    """Check if the study's concurrent control falls outside the HCD range.

    When the concurrent control itself is an outlier relative to the HCD,
    the HCD-based scoring may be unreliable — the study's baseline differs
    substantially from historical norms. Mutates `out` in place.
    """
    if control_group_mean is None:
        out["control_outside_hcd"] = False
        out["control_hcd_detail"] = "No control mean available"
        return

    ctrl_within = hcd_lower <= control_group_mean <= hcd_upper
    out["control_outside_hcd"] = not ctrl_within
    if ctrl_within:
        out["control_hcd_detail"] = (
            f"Control mean {control_group_mean:.3f} within HCD "
            f"[{hcd_lower:.3f}, {hcd_upper:.3f}]"
        )
    else:
        # Flag: concurrent control disagrees with HCD — scoring may mislead
        n_sd_from_mean = abs(control_group_mean - hcd_mean) / hcd_sd if hcd_sd > 0 else 0
        out["control_hcd_detail"] = (
            f"WARNING: Control mean {control_group_mean:.3f} outside HCD "
            f"[{hcd_lower:.3f}, {hcd_upper:.3f}] ({n_sd_from_mean:.1f} SD from HCD mean) "
            f"— concurrent control dominates; HCD comparison may be unreliable"
        )
        log.warning(
            "HCD conflict: control mean %.3f outside HCD [%.3f, %.3f] for this organ/sex",
            control_group_mean, hcd_lower, hcd_upper,
        )


def _evaluate_hcd(
    treated_group_mean: float,
    hcd: dict,
    sqlite_db,
    strain: str,
    sex: str,
    dur_cat: str,
    organ_key: str,
    *,
    control_group_mean: float | None = None,
) -> dict:
    """Evaluate a treated-group mean against an HCD entry (SQLite source)."""
    within = hcd["lower"] <= treated_group_mean <= hcd["upper"]
    result_str = "within_hcd" if within else "outside_hcd"
    score = -0.5 if within else 0.5

    detail = (
        f"Treated mean {treated_group_mean:.3f} vs HCD [{hcd['lower']:.3f}, {hcd['upper']:.3f}] "
        f"(ref: {hcd['mean']:.4f}±{hcd['sd']:.4f}, n={hcd['n']}, {hcd['source']})"
    )

    out = {"result": result_str, "score": score, "detail": detail}

    # Extended fields from SQLite
    out["n"] = hcd.get("n")
    out["study_count"] = hcd.get("study_count")
    out["source"] = hcd.get("source", "sqlite")

    # Percentile rank
    pct = sqlite_db.percentile_rank(treated_group_mean, strain, sex, dur_cat, organ_key)
    if pct is not None:
        out["percentile_rank"] = pct

    # Concurrent control vs HCD conflict check
    _check_control_vs_hcd(out, control_group_mean, hcd["lower"], hcd["upper"],
                          hcd["mean"], hcd["sd"])

    return out


# ---------------------------------------------------------------------------
# A-3 assessment for LB (clinical pathology) domain
# ---------------------------------------------------------------------------

def assess_a3_lb(
    treated_group_mean: float | None,
    test_code: str,
    sex: str,
    species: str | None,
    strain: str | None,
    duration_days: int | None,
    *,
    control_group_mean: float | None = None,
    value_unit: str | None = None,
) -> dict:
    """Assess A-3 factor for LB findings: is the treated-group mean within HCD?

    Looks up clinical pathology reference ranges from the LB HCD database
    (populated by etl.hcd_lb_etl from published reference data).

    The LB HCD database is keyed by species (not strain like OM), with
    optional strain-specific refinement. Query hierarchy:
      1. Exact species + strain match
      2. Species-only match (highest confidence source)

    For log-normal parameters (ViCoG Wistar Han data), the bounds are
    tolerance intervals, not mean +/- 2*SD. The comparison logic is the
    same: value inside [lower, upper] = within_hcd.

    Returns dict with:
      result: 'within_hcd' | 'outside_hcd' | 'no_hcd'
      score: -0.5 | +0.5 | 0.0
      detail: human-readable annotation
      domain: 'LB' (to distinguish from OM HCD assessments)
    """
    if treated_group_mean is None:
        return {"result": "no_hcd", "score": 0.0, "detail": "No treated-group mean available",
                "domain": "LB"}

    dur_cat = _duration_to_category(duration_days)
    if not dur_cat:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"Duration {duration_days}d outside HCD coverage",
                "domain": "LB"}

    sqlite_db = _load_sqlite_db()
    if sqlite_db is None or not getattr(sqlite_db, 'lb_available', False):
        return {"result": "no_hcd", "score": 0.0,
                "detail": "LB HCD database not available",
                "domain": "LB"}

    # Resolve species
    canonical_species = sqlite_db.resolve_species(species)
    if not canonical_species:
        # Try extracting from strain
        canonical_strain, canonical_species_from_strain = sqlite_db.resolve_lb_strain(strain)
        if canonical_species_from_strain:
            canonical_species = canonical_species_from_strain
        else:
            return {"result": "no_hcd", "score": 0.0,
                    "detail": f"Species '{species}' not in LB HCD database",
                    "domain": "LB"}

    # Resolve strain for refinement
    canonical_strain = None
    if strain:
        resolved_strain, _ = sqlite_db.resolve_lb_strain(strain)
        if resolved_strain:
            canonical_strain = resolved_strain

    # Normalize test code before lookup (BUN/UREAN/UREA → canonical)
    # Also collect all aliases to try — the HCD database may use a different
    # variant of the same analyte code than the study data.
    try:
        from services.analysis.send_knowledge import normalize_test_code, get_test_code_aliases
        normalized_code = normalize_test_code(test_code)
        codes_to_try = get_test_code_aliases(test_code)
        # Ensure normalized code is first (most likely match)
        if normalized_code in codes_to_try:
            codes_to_try.remove(normalized_code)
        codes_to_try.insert(0, normalized_code)
    except ImportError:
        normalized_code = test_code
        codes_to_try = [test_code]

    # Query LB HCD — try each code variant until we find a match
    hcd = None
    matched_code = normalized_code
    for code_variant in codes_to_try:
        hcd = sqlite_db.query_lb(
            species=canonical_species,
            sex=sex,
            test_code=code_variant,
            duration_category=dur_cat,
            strain=canonical_strain,
        )
        if hcd:
            matched_code = code_variant
            break

    if not hcd:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"No LB HCD for {canonical_species}/{normalized_code}/{sex}/{dur_cat} "
                          f"(tried: {', '.join(codes_to_try)})",
                "domain": "LB"}

    # Evaluate: is treated mean within [lower, upper]?
    lower = hcd["lower"]
    upper = hcd["upper"]
    within = lower <= treated_group_mean <= upper

    result_str = "within_hcd" if within else "outside_hcd"
    score = -0.5 if within else 0.5

    # Build center description
    center_desc = ""
    if hcd.get("mean") is not None and hcd.get("sd") is not None:
        center_desc = f"ref: {hcd['mean']:.4f}+/-{hcd['sd']:.4f}"
    elif hcd.get("geom_mean") is not None:
        center_desc = f"ref: geom_mean={hcd['geom_mean']:.4f} (log-normal)"
    elif hcd.get("median") is not None:
        center_desc = f"ref: median={hcd['median']:.4f} (nonparametric RI)"

    detail = (
        f"Treated mean {treated_group_mean:.4f} vs LB HCD "
        f"[{lower:.4f}, {upper:.4f}] "
        f"({center_desc}, n={hcd['n']}, {hcd['source']})"
    )

    out: dict = {
        "result": result_str,
        "score": score,
        "detail": detail,
        "domain": "LB",
        "n": hcd["n"],
        "source": hcd["source"],
        "confidence": hcd.get("confidence", "MODERATE"),
        "test_code": test_code,
    }

    # Empirical percentile rank (requires NTP DTT IAD individual animal data)
    if getattr(sqlite_db, 'lb_iad_available', False):
        # Try NTP strain resolution (IAD data uses NTP naming)
        ntp_strain = sqlite_db.resolve_strain(strain) if strain else None
        pct = None
        if ntp_strain:
            pct = sqlite_db.percentile_rank_lb(
                treated_group_mean, ntp_strain, sex, matched_code, dur_cat,
                value_unit=value_unit,
            )
        if pct is None and canonical_strain:
            # Fallback: try the LB-resolved strain
            pct = sqlite_db.percentile_rank_lb(
                treated_group_mean, canonical_strain, sex, matched_code, dur_cat,
                value_unit=value_unit,
            )
        if pct is not None:
            out["percentile_rank"] = pct
            if value_unit is not None:
                out["percentile_unit_filter"] = value_unit.strip().upper()

    # Warn if this is a flagged parameter
    notes = hcd.get("notes", "")
    if notes and "CAUTION" in notes:
        out["caution"] = notes

    # Control vs HCD check
    if control_group_mean is not None:
        hcd_mean = hcd.get("mean") or hcd.get("geom_mean") or hcd.get("median") or 0
        hcd_sd = hcd.get("sd") or (abs(upper - lower) / 4) or 1  # estimate SD from range
        _check_control_vs_hcd(out, control_group_mean, lower, upper, hcd_mean, hcd_sd)
    else:
        out["control_outside_hcd"] = False
        out["control_hcd_detail"] = "No control mean available"

    return out


# ---------------------------------------------------------------------------
# A-3 assessment for BW (body weight) domain
# ---------------------------------------------------------------------------

def assess_a3_bw(
    treated_group_mean: float | None,
    sex: str,
    strain: str | None,
    duration_days: int | None,
    *,
    control_group_mean: float | None = None,
    species: str | None = None,
) -> dict:
    """Assess A-3 factor for BW findings: is the treated-group mean within HCD?

    Looks up terminal body weight reference ranges from the BW HCD database
    (populated by etl.hcd_bw_etl from NTP DTT IAD data — 117K records, 11 strains).

    The BW HCD database is keyed by strain/sex/duration (no organ dimension —
    BW is a whole-animal measurement). Query: query_bw() on the SQLite DB.

    Returns dict with:
      result: 'within_hcd' | 'outside_hcd' | 'no_hcd'
      score: -0.5 | +0.5 | 0.0
      detail: human-readable annotation
      domain: 'BW'
    Plus optional extended fields from SQLite:
      percentile_rank, n, study_count, source
    """
    if treated_group_mean is None:
        return {"result": "no_hcd", "score": 0.0, "detail": "No treated-group mean available",
                "domain": "BW"}

    dur_cat = _duration_to_category(duration_days)
    if not dur_cat:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"Duration {duration_days}d outside HCD coverage",
                "domain": "BW"}

    sqlite_db = _load_sqlite_db()
    if sqlite_db is None or not getattr(sqlite_db, 'bw_available', False):
        return {"result": "no_hcd", "score": 0.0,
                "detail": "BW HCD database not available",
                "domain": "BW"}

    # Resolve strain via OM strain aliases (same NTP strains)
    resolved_strain = sqlite_db.resolve_strain(strain)
    if not resolved_strain:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"Strain '{strain}' not in HCD database",
                "domain": "BW"}

    hcd = sqlite_db.query_bw(resolved_strain, sex, dur_cat, species=species)
    if not hcd:
        return {"result": "no_hcd", "score": 0.0,
                "detail": f"No BW HCD for {resolved_strain}/{sex}/{dur_cat}",
                "domain": "BW"}

    # Evaluate: is treated mean within [lower, upper]?
    lower = hcd["lower"]
    upper = hcd["upper"]
    within = lower <= treated_group_mean <= upper

    result_str = "within_hcd" if within else "outside_hcd"
    score = -0.5 if within else 0.5

    detail = (
        f"Treated mean {treated_group_mean:.1f} vs BW HCD "
        f"[{lower:.1f}, {upper:.1f}] "
        f"(ref: {hcd['mean']:.1f}+/-{hcd['sd']:.1f}, n={hcd['n']}, "
        f"{hcd['study_count']} studies, {hcd['source']})"
    )

    out: dict = {
        "result": result_str,
        "score": score,
        "detail": detail,
        "domain": "BW",
        "n": hcd["n"],
        "study_count": hcd["study_count"],
        "source": hcd["source"],
    }

    # Percentile rank
    pct = sqlite_db.bw_percentile_rank(treated_group_mean, resolved_strain, sex, dur_cat)
    if pct is not None:
        out["percentile_rank"] = pct

    # Single-source flag (only one NTP study contributed — lower confidence)
    if hcd.get("single_source"):
        out["single_source"] = True

    # Control vs HCD check
    if control_group_mean is not None:
        hcd_mean = hcd["mean"]
        hcd_sd = hcd["sd"]
        _check_control_vs_hcd(out, control_group_mean, lower, upper, hcd_mean, hcd_sd)
    else:
        out["control_outside_hcd"] = False
        out["control_hcd_detail"] = "No control mean available"

    return out


# ---------------------------------------------------------------------------
# TS domain extraction helpers
# ---------------------------------------------------------------------------

def get_strain(study) -> str | None:
    """Get strain from TS domain. Returns raw TSVAL string or None."""
    if "ts" not in study.xpt_files:
        return None
    try:
        from services.xpt_processor import read_xpt
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        strain_rows = ts_df[ts_df["TSPARMCD"].str.upper() == "STRAIN"]
        if not strain_rows.empty:
            return str(strain_rows.iloc[0].get("TSVAL", "")).strip().upper() or None
    except Exception:
        pass
    return None


def get_route(study) -> str | None:
    """Get route of administration from TS domain. Returns raw TSVAL or None."""
    if "ts" not in study.xpt_files:
        return None
    try:
        from services.xpt_processor import read_xpt
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        rows = ts_df[ts_df["TSPARMCD"].str.upper() == "ROUTE"]
        if not rows.empty:
            return str(rows.iloc[0].get("TSVAL", "")).strip().upper() or None
    except Exception:
        pass
    return None


def get_vehicle(study) -> str | None:
    """Get treatment vehicle from TS domain. Returns raw TSVAL or None."""
    if "ts" not in study.xpt_files:
        return None
    try:
        from services.xpt_processor import read_xpt
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        # Try TRTV (treatment vehicle) first, then VCONT (vehicle control)
        for parmcd in ("TRTV", "VCONT"):
            rows = ts_df[ts_df["TSPARMCD"].str.upper() == parmcd]
            if not rows.empty:
                val = str(rows.iloc[0].get("TSVAL", "")).strip().upper()
                if val:
                    return val
    except Exception:
        pass
    return None


def get_study_duration_days(study) -> int | None:
    """Get study dosing duration from TS domain, parsed to days.

    Looks for DOSDUR (dosing duration) in TS domain.
    Falls back to TRTDUR (treatment duration).
    """
    if "ts" not in study.xpt_files:
        return None
    try:
        from services.xpt_processor import read_xpt
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]

        for parmcd in ("DOSDUR", "TRTDUR"):
            rows = ts_df[ts_df["TSPARMCD"].str.upper() == parmcd]
            if not rows.empty:
                val = str(rows.iloc[0].get("TSVAL", "")).strip()
                days = parse_iso8601_duration_to_days(val)
                if days is not None:
                    return days
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# User HCD reference lookup (display-only, priority chain)
# ---------------------------------------------------------------------------

_ANNOTATIONS_DIR = Path(__file__).parent.parent.parent / "annotations"


def get_hcd_references(study, study_id: str) -> dict:
    """Build merged HCD reference dict: user-uploaded (priority 1) + system (priority 2).

    Returns {
        species, strain, duration_category, duration_status,
        references: { "TEST_CODE:SEX": { ... HcdReference fields ... }, ... }
    }

    This is the coordination facade. It reads user annotations and delegates
    system HCD lookup to hcd_database.query_lb(). Does NOT modify scoring.
    """
    from services.analysis.subject_context import get_ts_metadata
    from generator.subject_sentinel import LOGNORMAL_ENDPOINTS

    meta = get_ts_metadata(study)
    species = (meta.get("species") or "").strip()
    strain_raw = meta.get("strain") or ""

    duration_days = get_study_duration_days(study)
    dur_cat = _duration_to_category(duration_days)
    duration_status = "known" if dur_cat else "unknown"

    references: dict[str, dict] = {}

    # Priority 1: user-uploaded HCD
    user_path = _ANNOTATIONS_DIR / study_id / "hcd_user.json"
    if user_path.exists():
        try:
            with open(user_path) as f:
                user_data = json.load(f)
            for key, ref in user_data.get("references", {}).items():
                references[key] = ref
        except Exception as e:
            log.warning("Failed to read user HCD for %s: %s", study_id, e)

    # Priority 2: system HCD from hcd.db (only if duration is known)
    if dur_cat:
        sqlite_db = _load_sqlite_db()
        if sqlite_db is not None:
            # Resolve strain for LB
            resolved_strain, resolved_species = sqlite_db.resolve_lb_strain(strain_raw)
            lookup_species = resolved_species or species

            # Get all available LB test codes from system HCD
            lb_test_codes = sqlite_db.get_lb_test_codes(lookup_species, dur_cat)

            for tc in lb_test_codes:
                for sex in ("F", "M"):
                    key = f"{tc}:{sex}"
                    if key in references:
                        continue  # user upload takes priority
                    result = sqlite_db.query_lb(
                        lookup_species, sex, tc, dur_cat,
                        strain=resolved_strain,
                    )
                    if result is None:
                        continue
                    is_lognormal = tc in LOGNORMAL_ENDPOINTS
                    references[key] = {
                        "test_code": tc,
                        "sex": sex,
                        "mean": result.get("mean"),
                        "sd": result.get("sd"),
                        "geom_mean": result.get("geom_mean"),
                        "n": result.get("n"),
                        "lower": result.get("lower"),
                        "upper": result.get("upper"),
                        "unit": result.get("unit"),
                        "confidence": result.get("confidence"),
                        "source": result.get("source", "system"),
                        "source_type": "system",
                        "isLognormal": is_lognormal,
                        "values": None,
                    }

    return {
        "species": species,
        "strain": strain_raw,
        "duration_category": dur_cat,
        "duration_status": duration_status,
        "references": references,
    }


# ---------------------------------------------------------------------------
# Tumor HCD — strain-specific background tumor incidence rates
# ---------------------------------------------------------------------------

_TUMOR_HCD_PATH = SHARED_DIR / "config" / "hcd-tumor-rates.json"
_TUMOR_HCD: dict | None = None

# Translate (organ, morphology) from SEND data to HCD key.
# Organ is normalized (GLAND stripped), morphology is first comma-token or full.
_ORGAN_MORPHOLOGY_TO_HCD_KEY: dict[tuple[str, str], str] = {
    ("PITUITARY", "ADENOMA"): "PITUITARY_ADENOMA",
    ("PITUITARY", "CARCINOMA"): "PITUITARY_ADENOMA",  # combined
    ("THYROID", "C-CELL ADENOMA"): "THYROID_C_CELL_ADENOMA",
    ("THYROID", "C CELL ADENOMA"): "THYROID_C_CELL_ADENOMA",
    ("THYROID", "FOLLICULAR ADENOMA"): "THYROID_FOLLICULAR_ADENOMA",
    ("THYROID", "FOLLICULAR CARCINOMA"): "THYROID_FOLLICULAR_ADENOMA",
    ("ADRENAL", "PHEOCHROMOCYTOMA"): "ADRENAL_PHEOCHROMOCYTOMA",
    ("ADRENAL", "PHEOCHROMOCYTOMA BENIGN"): "ADRENAL_PHEOCHROMOCYTOMA",
    ("ADRENAL", "PHEOCHROMOCYTOMA MALIGNANT"): "ADRENAL_PHEOCHROMOCYTOMA",
    ("TESTIS", "INTERSTITIAL CELL TUMOR"): "LEYDIG_CELL_TUMOR",
    ("TESTIS", "LEYDIG CELL TUMOR"): "LEYDIG_CELL_TUMOR",
    ("TESTIS", "INTERSTITIAL CELL ADENOMA"): "LEYDIG_CELL_TUMOR",
    ("MAMMARY", "FIBROADENOMA"): "MAMMARY_FIBROADENOMA",
    ("MAMMARY", "CARCINOMA"): "MAMMARY_CARCINOMA",
    ("MAMMARY", "ADENOCARCINOMA"): "MAMMARY_CARCINOMA",
    ("LIVER", "HEPATOCELLULAR ADENOMA"): "HEPATOCELLULAR_ADENOMA",
    ("LIVER", "HEPATOCELLULAR CARCINOMA"): "HEPATOCELLULAR_CARCINOMA",
    ("LIVER", "ADENOMA"): "HEPATOCELLULAR_ADENOMA",
    ("LIVER", "CARCINOMA"): "HEPATOCELLULAR_CARCINOMA",
    ("SPLEEN", "MONONUCLEAR CELL LEUKEMIA"): "MONONUCLEAR_CELL_LEUKEMIA",
    ("THYMUS", "THYMOMA"): "THYMOMA",
}

# Strain aliases for tumor HCD (reuses the same pattern as HcdRangeDB)
_TUMOR_STRAIN_ALIASES: dict[str, str] = {}


def _load_tumor_hcd() -> dict:
    """Lazy-load tumor HCD seed data."""
    global _TUMOR_HCD, _TUMOR_STRAIN_ALIASES
    if _TUMOR_HCD is not None:
        return _TUMOR_HCD
    try:
        with open(_TUMOR_HCD_PATH) as f:
            data = json.load(f)
        _TUMOR_HCD = data
        # Build strain alias index
        for strain_key, strain_data in data.get("strains", {}).items():
            _TUMOR_STRAIN_ALIASES[strain_key.strip().upper()] = strain_key
            for alias in strain_data.get("aliases", []):
                _TUMOR_STRAIN_ALIASES[alias.strip().upper()] = strain_key
    except Exception as e:
        log.warning("Failed to load tumor HCD rates: %s", e)
        _TUMOR_HCD = {"strains": {}}
    return _TUMOR_HCD


def _normalize_organ(organ: str) -> str:
    """Normalize organ name for HCD key lookup: strip GLAND suffix/prefix."""
    o = organ.strip().upper()
    # "GLAND, THYROID" -> "THYROID"
    if o.startswith("GLAND,"):
        o = o[6:].strip()
    # "PITUITARY GLAND" -> "PITUITARY"
    if o.endswith(" GLAND"):
        o = o[:-6].strip()
    return o


def _normalize_morphology(morph: str) -> list[str]:
    """Return candidate morphology keys for HCD lookup.

    Tries: first comma-token, full string, with behavior suffixes stripped.
    """
    m = morph.strip().upper()
    candidates = []
    # Strip behavior suffixes
    for sfx in (", BENIGN", ", MALIGNANT", ", UNDETERMINED"):
        if m.endswith(sfx):
            m = m[: -len(sfx)].strip()
            break
    # First comma-token
    if "," in m:
        first_token = m.split(",")[0].strip()
        candidates.append(first_token)
    # Full string
    candidates.append(m)
    return candidates


def assess_tumor_hcd(
    organ: str,
    morphology: str,
    strain: str | None,
    sex: str,
) -> dict:
    """Look up background tumor incidence rate for HCD-informed Haseman classification.

    Returns {background_rate, n, source, is_rare} or all-None if no match.
    """
    data = _load_tumor_hcd()
    result = {"background_rate": None, "n": None, "source": None, "is_rare": None}

    if not strain:
        return result

    # Resolve strain
    canonical = _TUMOR_STRAIN_ALIASES.get(strain.strip().upper())
    if not canonical:
        return result

    strain_data = data.get("strains", {}).get(canonical)
    if not strain_data:
        return result

    sex_key = sex.strip().upper()
    rates = strain_data.get("rates", {}).get(sex_key)
    if not rates:
        return result

    # Normalize organ and morphology, try lookup
    norm_organ = _normalize_organ(organ)
    morph_candidates = _normalize_morphology(morphology)

    hcd_key = None
    for mc in morph_candidates:
        hcd_key = _ORGAN_MORPHOLOGY_TO_HCD_KEY.get((norm_organ, mc))
        if hcd_key:
            break

    if not hcd_key:
        return result

    entry = rates.get(hcd_key)
    if not entry:
        return result

    rate = entry["rate"]
    return {
        "background_rate": rate,
        "n": entry.get("n"),
        "source": entry.get("source"),
        "is_rare": rate < 0.01,
    }


