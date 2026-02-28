"""Historical Control Data (HCD) reference ranges — A-3 factor for ECETOC.

Phase 1: static JSON ranges from published data (Envigo C11963 SD rat).
Compares treated-group organ weight means against [mean-2SD, mean+2SD]
to determine if the finding falls within normal historical variation.

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

_JSON_PATH = Path(__file__).resolve().parents[3] / "shared" / "hcd-reference-ranges.json"

# Lazy-loaded singleton
_DB: HcdRangeDB | None = None


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


def _load_db() -> HcdRangeDB:
    """Lazy-load the HCD range database (singleton)."""
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

    Categories: '28-day' (≤42 days), '90-day' (43-180 days)
    Returns None if duration unknown or out of range.
    """
    if days is None:
        return None
    if days <= 42:
        return "28-day"
    if days <= 180:
        return "90-day"
    # Chronic studies (>180 days) — no HCD data yet in Phase 1
    return None


# ---------------------------------------------------------------------------
# A-3 assessment
# ---------------------------------------------------------------------------

def assess_a3(
    treated_group_mean: float | None,
    specimen: str,
    sex: str,
    strain: str | None,
    duration_days: int | None,
) -> dict:
    """Assess A-3 factor: is the treated-group mean within HCD range?

    Compares the highest-dose group mean against [mean-2SD, mean+2SD] from
    matching HCD entry.

    Returns dict with:
      result: 'within_hcd' | 'outside_hcd' | 'no_hcd'
      score: -0.5 | +0.5 | 0.0
      detail: human-readable annotation
    """
    if treated_group_mean is None:
        return {"result": "no_hcd", "score": 0.0, "detail": "No treated-group mean available"}

    db = _load_db()
    resolved_strain = db.resolve_strain(strain)
    if not resolved_strain:
        return {"result": "no_hcd", "score": 0.0, "detail": f"Strain '{strain}' not in HCD database"}

    dur_cat = _duration_to_category(duration_days)
    if not dur_cat:
        return {"result": "no_hcd", "score": 0.0, "detail": f"Duration {duration_days}d outside HCD coverage"}

    organ_key = _resolve_specimen(specimen)
    hcd = db.query(resolved_strain, sex, dur_cat, organ_key)
    if not hcd:
        return {"result": "no_hcd", "score": 0.0, "detail": f"No HCD entry for {organ_key}/{sex}/{dur_cat}"}

    within = hcd.lower <= treated_group_mean <= hcd.upper
    result = "within_hcd" if within else "outside_hcd"
    score = -0.5 if within else 0.5

    detail = (
        f"Treated mean {treated_group_mean:.3f} vs HCD [{hcd.lower:.3f}, {hcd.upper:.3f}] "
        f"(ref: {hcd.mean}±{hcd.sd}, n={hcd.n}, {hcd.source})"
    )
    return {"result": result, "score": score, "detail": detail}


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
