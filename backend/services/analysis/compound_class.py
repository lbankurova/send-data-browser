"""Compound-class inference from TS metadata and study characteristics.

Phase 1 of Expected Pharmacological Effect Classification (SG-01).
Infers compound modality from PCLAS, INTTYPE, available domains, route,
and species using a cascading heuristic (first match wins).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Expected-effect profile directory (shared between backend and frontend)
_PROFILES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "shared" / "expected-effect-profiles"

# Cached profiles (loaded on first access)
_profile_cache: dict[str, dict] | None = None


def _load_profiles() -> dict[str, dict]:
    """Load all expected-effect profile JSONs from shared/expected-effect-profiles/.

    Returns: {profile_id: profile_dict}
    """
    global _profile_cache
    if _profile_cache is not None:
        return _profile_cache

    profiles: dict[str, dict] = {}
    if not _PROFILES_DIR.exists():
        logger.warning("Expected-effect profiles directory not found: %s", _PROFILES_DIR)
        return profiles

    for path in _PROFILES_DIR.glob("*.json"):
        try:
            with open(path, "r") as f:
                profile = json.load(f)
            pid = profile.get("profile_id")
            if pid:
                profiles[pid] = profile
        except Exception as e:
            logger.warning("Failed to load profile %s: %s", path.name, e)

    _profile_cache = profiles
    logger.info("Loaded %d expected-effect profiles from %s", len(profiles), _PROFILES_DIR)
    return profiles


def get_profile(profile_id: str) -> dict | None:
    """Get a single expected-effect profile by ID."""
    return _load_profiles().get(profile_id)


def list_profiles() -> list[dict]:
    """Return summary metadata for all available profiles."""
    profiles = _load_profiles()
    return [
        {
            "profile_id": p["profile_id"],
            "display_name": p.get("display_name", p["profile_id"]),
            "modality": p.get("modality"),
            "finding_count": len(p.get("expected_findings", [])),
        }
        for p in profiles.values()
    ]


# ── Keyword sets for heuristic matching ────────────────────────────────────

_ANTIBODY_KEYWORDS = {
    "immunoglobulin", "antibody", "monoclonal", "mab", "bispecific",
    "anti-pd", "anti-ctla", "anti-vegf", "anti-her2", "anti-tnf",
    "checkpoint inhibitor", "immune checkpoint",
}

_VACCINE_KEYWORDS = {
    "vaccine", "antigen", "adjuvant", "immunization", "immunogen",
    "toxoid", "conjugate vaccine", "mrna vaccine", "subunit vaccine",
}

_GENE_THERAPY_KEYWORDS = {
    "gene therapy", "aav", "adeno-associated", "adenovir",
    "lentivir", "retrovir", "vector", "transgene",
}

_OLIGONUCLEOTIDE_KEYWORDS = {
    "oligonucleotide", "antisense", "sirna", "shrna", "mirna",
    "aso", "gapmer", "phosphorothioate", "aptamer",
}


def _contains_any(text: str, keywords: set[str]) -> bool:
    """Check if text contains any keyword (case-insensitive)."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)


# ── Main inference function ────────────────────────────────────────────────

def infer_compound_class(
    ts_meta: dict,
    available_domains: set[str] | None = None,
    species: str | None = None,
) -> dict:
    """Infer compound modality from TS metadata and study characteristics.

    Uses a cascading heuristic (first match wins) as defined in the spec:

    1. PCLAS contains immunoglobulin/antibody terms -> Monoclonal antibody (HIGH)
    2. PCLAS contains vaccine/antigen terms -> Vaccine (HIGH)
    3. PCLAS contains gene therapy/AAV terms -> AAV gene therapy (HIGH)
    4. PCLAS contains oligonucleotide terms -> Oligonucleotide (HIGH)
    5. IS domain present + ROUTE = IM/SC -> Biologic probable vaccine (MEDIUM)
    6. ROUTE = SC/IM + species = NHP -> Biologic unspecified (LOW)
    7. INTTYPE = BIOLOGICAL -> Biologic unspecified (LOW)
    8. Default -> Small molecule

    Returns: {
        "compound_class": str,         # Profile ID or class name
        "confidence": str,             # HIGH, MEDIUM, LOW, or DEFAULT
        "inference_method": str,       # Which heuristic fired
        "suggested_profiles": list,    # Matching profile IDs
    }
    """
    available_domains = available_domains or set()
    pclas = (ts_meta.get("pharmacologic_class") or "").strip()
    inttype = (ts_meta.get("intervention_type") or "").strip()
    route = (ts_meta.get("route") or "").strip().upper()
    species_val = (species or ts_meta.get("species") or "").strip().upper()

    # Heuristic 1: PCLAS contains checkpoint inhibitor / antibody terms
    if pclas and _contains_any(pclas, _ANTIBODY_KEYWORDS):
        # Distinguish checkpoint inhibitors from other mAbs
        if _contains_any(pclas, {"checkpoint", "anti-pd", "anti-ctla", "pd-1", "pd-l1", "ctla-4"}):
            return {
                "compound_class": "checkpoint_inhibitor",
                "confidence": "HIGH",
                "inference_method": "PCLAS_checkpoint_inhibitor",
                "suggested_profiles": ["checkpoint_inhibitor"],
            }
        return {
            "compound_class": "monoclonal_antibody",
            "confidence": "HIGH",
            "inference_method": "PCLAS_antibody",
            "suggested_profiles": ["checkpoint_inhibitor"],  # Offer as option
        }

    # Heuristic 2: PCLAS contains vaccine/antigen terms
    if pclas and _contains_any(pclas, _VACCINE_KEYWORDS):
        return {
            "compound_class": "vaccine",
            "confidence": "HIGH",
            "inference_method": "PCLAS_vaccine",
            "suggested_profiles": ["vaccine_adjuvanted", "vaccine_non_adjuvanted"],
        }

    # Heuristic 3: PCLAS contains gene therapy / AAV terms
    if pclas and _contains_any(pclas, _GENE_THERAPY_KEYWORDS):
        return {
            "compound_class": "aav_gene_therapy",
            "confidence": "HIGH",
            "inference_method": "PCLAS_gene_therapy",
            "suggested_profiles": ["aav_gene_therapy"],
        }

    # Heuristic 4: PCLAS contains oligonucleotide terms
    if pclas and _contains_any(pclas, _OLIGONUCLEOTIDE_KEYWORDS):
        return {
            "compound_class": "oligonucleotide",
            "confidence": "HIGH",
            "inference_method": "PCLAS_oligonucleotide",
            "suggested_profiles": ["oligonucleotide"],
        }

    # Heuristic 5: INTTYPE contains gene therapy signal
    if inttype and _contains_any(inttype, {"genetic", "gene therapy"}):
        return {
            "compound_class": "aav_gene_therapy",
            "confidence": "MEDIUM",
            "inference_method": "INTTYPE_genetic",
            "suggested_profiles": ["aav_gene_therapy"],
        }

    # Heuristic 6: IS domain present + ROUTE = IM/SC -> probable vaccine
    if "is" in available_domains and route in {"INTRAMUSCULAR", "SUBCUTANEOUS", "IM", "SC"}:
        return {
            "compound_class": "vaccine",
            "confidence": "MEDIUM",
            "inference_method": "IS_domain_plus_route",
            "suggested_profiles": ["vaccine_adjuvanted", "vaccine_non_adjuvanted"],
        }

    # Heuristic 7: ROUTE = SC/IM + species = NHP -> biologic unspecified
    if route in {"SUBCUTANEOUS", "INTRAMUSCULAR", "SC", "IM"}:
        if any(nhp in species_val for nhp in ["MONKEY", "CYNOMOLGUS", "MACAQUE", "NHP", "PRIMATE"]):
            return {
                "compound_class": "biologic_unspecified",
                "confidence": "LOW",
                "inference_method": "route_plus_nhp_species",
                "suggested_profiles": [],
            }

    # Heuristic 8: INTTYPE = BIOLOGICAL
    if inttype and inttype.upper() in {"BIOLOGICAL", "BIOLOGIC"}:
        return {
            "compound_class": "biologic_unspecified",
            "confidence": "LOW",
            "inference_method": "INTTYPE_biological",
            "suggested_profiles": [],
        }

    # Default: small molecule (no expected-effect profile)
    return {
        "compound_class": "small_molecule",
        "confidence": "DEFAULT",
        "inference_method": "default",
        "suggested_profiles": [],
    }
