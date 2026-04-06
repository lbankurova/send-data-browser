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
    lower: float  # mean - 2*SD
    upper: float  # mean + 2*SD
    source: str


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

                rng = HcdRange(
                    organ=organ,
                    sex=sex,
                    duration_category=dur,
                    mean=mean,
                    sd=sd,
                    n=n,
                    lower=mean - 2 * sd,
                    upper=mean + 2 * sd,
                    source=strain_key,
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
        hcd["lower"] = round(hcd["mean"] - 2 * sd, 6)
        hcd["upper"] = round(hcd["mean"] + 2 * sd, 6)

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
