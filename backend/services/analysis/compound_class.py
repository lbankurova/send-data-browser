"""Compound-class inference from TS metadata and study characteristics.

Phase 1 of Expected Pharmacological Effect Classification (SG-01).
Infers compound modality from PCLASS, TRT, STITLE, INTTYPE, available
domains, route, and species using a cascading heuristic (first match wins).
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
    """Load all expected-effect profile JSONs and resolve composition.

    After this function returns, every profile has a flat expected_findings
    array.  Downstream consumers (D9 matcher, API, frontend) never see
    base_profiles — composition is resolved here.

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

    # ── Composition pass: resolve base_profiles into flat expected_findings ──
    resolved: set[str] = set()

    def _resolve(pid: str, chain: list[str] | None = None) -> None:
        if pid in resolved:
            return
        if chain is None:
            chain = []
        if pid in chain:
            logger.warning(
                "Circular base_profiles reference: %s -> %s",
                " -> ".join(chain), pid,
            )
            resolved.add(pid)
            return

        profile = profiles.get(pid)
        if not profile:
            return

        base_ids = profile.get("base_profiles", [])
        if not base_ids:
            resolved.add(pid)
            return

        # Resolve bases first (recursive)
        for base_id in base_ids:
            _resolve(base_id, chain + [pid])

        # Merge: collect base findings, then child findings.
        # Child findings override base findings with the same key.
        child_findings = profile.get("expected_findings", [])
        child_keys = {f.get("key") for f in child_findings if f.get("key")}

        merged: list[dict] = []
        total_base_count = 0
        base_profile_ids: list[str] = []

        for base_id in base_ids:
            base = profiles.get(base_id)
            if not base:
                logger.warning(
                    "base_profiles references unknown profile: %s (in %s)",
                    base_id, pid,
                )
                continue
            base_findings = base.get("expected_findings", [])
            for bf in base_findings:
                if bf.get("key") not in child_keys:
                    merged.append(bf)
            total_base_count += len(base_findings)
            base_profile_ids.append(base_id)

        merged.extend(child_findings)
        profile["expected_findings"] = merged

        # Provenance metadata (underscore prefix = internal, not schema)
        if base_profile_ids:
            profile["_base_profile_ids"] = base_profile_ids
            profile["_base_finding_count"] = total_base_count

        # Inherit display metadata from first base if not overridden
        first_base = profiles.get(base_ids[0]) if base_ids else None
        if first_base:
            for field in ("source", "modality"):
                if field not in profile and field in first_base:
                    profile[field] = first_base[field]

        resolved.add(pid)

    for pid in list(profiles.keys()):
        _resolve(pid)

    _profile_cache = profiles
    logger.info("Loaded %d expected-effect profiles from %s", len(profiles), _PROFILES_DIR)
    return profiles


def get_profile(profile_id: str) -> dict | None:
    """Get a single expected-effect profile by ID.

    Returns the resolved profile (base_profiles already merged into a flat
    expected_findings array).  Composition is resolved at load time in
    _load_profiles(), so this is a simple dict lookup.
    """
    return _load_profiles().get(profile_id)


def _read_sme_annotation(study_id: str) -> dict | None:
    """Read compound profile SME annotation for a study."""
    from pathlib import Path as _Path
    ann_dir = _Path(__file__).resolve().parent.parent.parent / "annotations"
    ann_path = ann_dir / study_id / "compound_profile.json"
    if not ann_path.exists():
        return None
    try:
        import json as _json
        with open(ann_path, "r") as f:
            data = _json.load(f)
        return data.get("study")
    except Exception:
        return None


def _apply_cross_reactivity_filter(
    profile: dict, cross_reactivity: str,
) -> dict:
    """Apply cross-reactivity gating to a resolved profile.

    When a profile has ``cross_reactivity_required: true``, target-layer
    findings are gated by the SME-declared cross-reactivity status:

    - ``"unknown"`` (default) → strip target-layer findings (conservative)
    - ``"partial"`` → keep all findings, add qualifier metadata
    - ``"full"`` → keep all findings without modification
    """
    if not profile.get("cross_reactivity_required"):
        return profile
    if cross_reactivity == "full":
        return profile

    # Shallow copy so we don't mutate the cached profile dict
    filtered = {**profile}

    if cross_reactivity == "unknown" or not cross_reactivity:
        filtered["expected_findings"] = [
            f for f in profile.get("expected_findings", [])
            if f.get("layer") != "target"
        ]
        filtered["_cross_reactivity_filter"] = "base_only"
    elif cross_reactivity == "partial":
        filtered["_cross_reactivity_filter"] = "partial_qualifier"

    return filtered


def resolve_active_profile(
    study_id: str,
    ts_meta: dict | None = None,
    available_domains: set[str] | None = None,
    species: str | None = None,
) -> dict | None:
    """Resolve the active expected-effect profile for a study.

    Priority: SME-confirmed annotation > inference suggestion.
    Returns the full profile dict, or None if no profile applies.
    Used by the findings pipeline to wire D9 scoring.

    If ts_meta is None or missing key fields (pharmacologic_class, treatment,
    study_title), reads the TS domain directly from the study's XPT files.
    This avoids depending on build_subject_context() which can crash on
    studies with unparseable dose values.

    Cross-reactivity gating: when the resolved profile has
    ``cross_reactivity_required: true``, target-layer findings are filtered
    based on the SME annotation's ``cross_reactivity`` field.
    """
    sme_data = _read_sme_annotation(study_id)

    # Check SME-confirmed override
    sme_profile_id = None
    if sme_data and sme_data.get("confirmed_by_sme") and sme_data.get("compound_class"):
        sme_profile_id = sme_data["compound_class"]

    profile = None
    if sme_profile_id:
        profile = get_profile(sme_profile_id)

    if profile is None:
        # Enrich ts_meta from TS domain if missing key inference fields
        _inference_keys = {"pharmacologic_class", "treatment", "study_title"}
        if not ts_meta or not any(ts_meta.get(k) for k in _inference_keys):
            ts_meta = _read_ts_for_study(study_id, ts_meta)
            if available_domains is None:
                available_domains = _get_study_domains(study_id)
            if species is None:
                species = ts_meta.get("species")

        # Inference from TS metadata — only auto-resolve when unambiguous
        if ts_meta:
            inference = infer_compound_class(ts_meta, available_domains, species)
            suggested = inference.get("suggested_profiles", [])
            if len(suggested) == 1:
                profile = get_profile(suggested[0])

    if profile is None:
        return None

    # Cross-reactivity gating for layered profiles
    cross_reactivity = (sme_data or {}).get("cross_reactivity", "unknown")
    return _apply_cross_reactivity_filter(profile, cross_reactivity)


def _read_ts_for_study(study_id: str, base_meta: dict | None = None) -> dict:
    """Read TS metadata directly from study XPT files.

    Merges with base_meta if provided (base_meta values take priority
    for fields that are already populated).
    """
    try:
        from services.study_discovery import discover_studies
        from services.analysis.subject_context import get_ts_metadata
        studies = discover_studies()
        study = studies.get(study_id)
        if not study:
            return base_meta or {}
        ts_meta = get_ts_metadata(study)
        # Merge: keep existing non-None values from base_meta
        if base_meta:
            for k, v in base_meta.items():
                if v is not None:
                    ts_meta[k] = v
        return ts_meta
    except Exception:
        return base_meta or {}


def _get_study_domains(study_id: str) -> set[str]:
    """Get available domains for a study."""
    try:
        from services.study_discovery import discover_studies
        studies = discover_studies()
        study = studies.get(study_id)
        return set(study.xpt_files.keys()) if study else set()
    except Exception:
        return set()


def list_profiles() -> list[dict]:
    """Return summary metadata for all user-selectable profiles.

    Profiles with ``user_selectable: false`` are loadable by ID (for
    composition) but excluded from the user-facing dropdown.
    """
    profiles = _load_profiles()
    result = []
    for p in profiles.values():
        if not p.get("user_selectable", True):
            continue
        entry: dict = {
            "profile_id": p["profile_id"],
            "display_name": p.get("display_name", p["profile_id"]),
            "modality": p.get("modality"),
            "finding_count": len(p.get("expected_findings", [])),
        }
        if "_base_profile_ids" in p:
            entry["base_profiles"] = p["_base_profile_ids"]
        result.append(entry)
    return result


# ── Keyword sets for heuristic matching ────────────────────────────────────

_ANTIBODY_KEYWORDS = {
    "immunoglobulin", "antibody", "monoclonal", "mab", "bispecific",
    "anti-pd", "anti-ctla", "anti-vegf", "anti-her2", "anti-tnf",
    "checkpoint inhibitor", "immune checkpoint",
    "anti-il", "tocilizumab", "adalimumab", "bevacizumab",
    "t-cell engager", "cd3",
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

# ── mAb sub-classification keyword sets (ordered by specificity) ──────────

_ICI_KEYWORDS = {
    "checkpoint", "anti-pd", "anti-ctla", "pd-1", "pd-l1", "ctla-4",
    "immune checkpoint", "checkpoint inhibitor",
    "nivolumab", "pembrolizumab", "ipilimumab", "atezolizumab",
    "durvalumab", "avelumab", "cemiplimab", "tremelimumab",
}

_ANTI_VEGF_KEYWORDS = {
    "anti-vegf", "anti-vegfr", "bevacizumab", "ranibizumab",
    "vegf-trap", "vegf trap", "aflibercept", "ramucirumab",
}

_BISPECIFIC_TCE_KEYWORDS = {
    "bispecific", "t-cell engager", "tce", "bite",
    "cd3x", "cd3 x", "dual-targeting",
    "blinatumomab", "mosunetuzumab", "glofitamab",
    "teclistamab", "epcoritamab",
}

_ANTI_IL6_KEYWORDS = {
    "anti-il-6", "anti-il6", "anti-il-6r", "anti-il6r",
    "tocilizumab", "sarilumab", "siltuximab",
}

_ANTI_TNF_KEYWORDS = {
    "anti-tnf", "anti-tnfa", "anti-tnf-alpha",
    "adalimumab", "infliximab", "golimumab", "certolizumab",
}

_ANTI_IL17_KEYWORDS = {
    "anti-il-17", "anti-il17",
    "secukinumab", "ixekizumab", "brodalumab",
}

_ANTI_IL4_IL13_KEYWORDS = {
    "anti-il-4", "anti-il4", "anti-il-13", "anti-il13",
    "anti-il-4/13", "anti-il4/il13",
    "dupilumab", "tralokinumab",
}

_ANTI_IL1_KEYWORDS = {
    "anti-il-1", "anti-il1",
    "canakinumab", "anakinra", "rilonacept",
}

_FC_FUSION_KEYWORDS = {
    "fc-fusion", "fc fusion", "receptor-fc", "receptor fc",
    "abatacept", "ctla4-ig", "ctla-4-ig",
}

_RECOMBINANT_EPO_KEYWORDS = {
    "erythropoietin", "epoetin", "darbepoetin",
    " epo", "epo ", "(epo)",  # word-boundary variants to avoid "repository" false match
}

_RECOMBINANT_GCSF_KEYWORDS = {
    "filgrastim", "pegfilgrastim", "g-csf",
    "granulocyte colony-stimulating", "granulocyte colony stimulating",
}

_RECOMBINANT_IFN_KEYWORDS = {
    "interferon", "ifn-alpha", "ifn-beta", "ifn-gamma",
    "peginterferon",
}


def _contains_any(text: str, keywords: set[str]) -> bool:
    """Check if text contains any keyword (case-insensitive)."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)


def _classify_antibody(text: str) -> dict:
    """Sub-classify within the antibody/mAb branch.

    13-step cascade ordered by specificity (first match wins).
    Profiles that don't exist yet still route correctly — the SME
    will see the suggestion and can override.
    """
    # 1. ICI (checkpoint inhibitors)
    if _contains_any(text, _ICI_KEYWORDS):
        return {"compound_class": "checkpoint_inhibitor",
                "suggested_profiles": ["checkpoint_inhibitor"]}

    # 2. Anti-VEGF
    if _contains_any(text, _ANTI_VEGF_KEYWORDS):
        return {"compound_class": "anti_vegf_mab",
                "suggested_profiles": ["anti_vegf_mab"]}

    # 3. Bispecific TCE
    if _contains_any(text, _BISPECIFIC_TCE_KEYWORDS):
        return {"compound_class": "bispecific_tce",
                "suggested_profiles": ["bispecific_tce"]}

    # 4. Anti-IL-6
    if _contains_any(text, _ANTI_IL6_KEYWORDS):
        return {"compound_class": "anti_il6_mab",
                "suggested_profiles": ["anti_il6_mab"]}

    # 5. Anti-TNF
    if _contains_any(text, _ANTI_TNF_KEYWORDS):
        return {"compound_class": "anti_tnf_mab",
                "suggested_profiles": ["anti_tnf_mab"]}

    # 6. Anti-IL-17
    if _contains_any(text, _ANTI_IL17_KEYWORDS):
        return {"compound_class": "anti_il17_mab",
                "suggested_profiles": ["anti_il17_mab"]}

    # 7. Anti-IL-4/13
    if _contains_any(text, _ANTI_IL4_IL13_KEYWORDS):
        return {"compound_class": "anti_il4_il13_mab",
                "suggested_profiles": ["anti_il4_il13_mab"]}

    # 8. Anti-IL-1
    if _contains_any(text, _ANTI_IL1_KEYWORDS):
        return {"compound_class": "anti_il1_mab",
                "suggested_profiles": ["anti_il1_mab"]}

    # 9. Fc-fusion
    if _contains_any(text, _FC_FUSION_KEYWORDS):
        return {"compound_class": "fc_fusion_ctla4",
                "suggested_profiles": ["fc_fusion_ctla4"]}

    # 10. Recombinant EPO
    if _contains_any(text, _RECOMBINANT_EPO_KEYWORDS):
        return {"compound_class": "recombinant_epo",
                "suggested_profiles": ["recombinant_epo"]}

    # 11. Recombinant G-CSF
    if _contains_any(text, _RECOMBINANT_GCSF_KEYWORDS):
        return {"compound_class": "recombinant_gcsf",
                "suggested_profiles": ["recombinant_gcsf"]}

    # 12. Recombinant IFN
    if _contains_any(text, _RECOMBINANT_IFN_KEYWORDS):
        return {"compound_class": "recombinant_ifn",
                "suggested_profiles": ["recombinant_ifn"]}

    # 13. Generic mAb — no sub-class match → general_mab base profile
    return {"compound_class": "monoclonal_antibody",
            "suggested_profiles": ["general_mab"]}


# ── ADC keyword sets ──────────────────────────────────────────────────────

_ADC_KEYWORDS = {
    "antibody-drug conjugate", "antibody drug conjugate",
    "adc", "immunoconjugate", "drug conjugate",
    # Payload chemistry shorthand
    "mmae", "mmaf", "dm1", "dm4", "dxd", "sn-38", "sn38",
    "calicheamicin", "pbd", "duocarmycin",
    # Specific approved ADC names
    "brentuximab", "polatuzumab", "enfortumab",
    "trastuzumab emtansine", "trastuzumab deruxtecan",
    "sacituzumab", "loncastuximab", "gemtuzumab",
    "belantamab", "tisotumab", "mirvetuximab",
    "inotuzumab",
}

# INN suffix → specific payload profile auto-resolution
_INN_PAYLOAD_MAP = {
    "vedotin": "adc_mmae",
    "mafodotin": "adc_mmaf",
    "emtansine": "adc_maytansinoid",
    "ravtansine": "adc_maytansinoid",
    "soravtansine": "adc_maytansinoid",
    "ozogamicin": "adc_calicheamicin",
    "deruxtecan": "adc_topo1",
    "govitecan": "adc_topo1",
    "tesirine": "adc_pbd",
}

_ALL_ADC_PROFILES = [
    "adc_mmae", "adc_mmaf", "adc_maytansinoid",
    "adc_calicheamicin", "adc_topo1", "adc_pbd",
    "adc_immune_stimulator",
]


# Non-informative PCLASS values that should be treated as absent
_PCLASS_EMPTY = {"", "not provided", "not available", "none", "unknown", "na", "n/a"}


def _classify_text(text: str) -> dict | None:
    """Classify compound modality from a free-text string.

    Cascade ordering (first match wins, most specific first):
      1. ADC (+ INN suffix sub-resolution) — most specific antibody subtype
      2. Recombinant proteins (EPO, G-CSF, IFN) — before antibody (not mAbs)
      3. Fc-fusion proteins — before generic antibody
      4. Antibody/mAb → sub-classification via _classify_antibody()
      5. Vaccine
      6. Gene therapy (AAV)
      7. Oligonucleotide

    Returns a partial result dict (compound_class, suggested_profiles) or None.
    """
    # ADC — check FIRST (more specific than generic antibody; 'antibody'
    # appears in 'antibody-drug conjugate')
    if _contains_any(text, _ADC_KEYWORDS):
        # Try INN suffix for auto-resolution to specific payload profile
        text_lower = text.lower()
        for suffix, profile_id in _INN_PAYLOAD_MAP.items():
            if suffix in text_lower:
                return {"compound_class": "adc",
                        "suggested_profiles": [profile_id]}
        # Generic ADC — suggest all payload profiles for SME selection
        return {"compound_class": "adc",
                "suggested_profiles": list(_ALL_ADC_PROFILES)}
    # Recombinant proteins — check before antibody (these are not mAbs)
    if _contains_any(text, _RECOMBINANT_EPO_KEYWORDS):
        return {"compound_class": "recombinant_epo", "suggested_profiles": ["recombinant_epo"]}
    if _contains_any(text, _RECOMBINANT_GCSF_KEYWORDS):
        return {"compound_class": "recombinant_gcsf", "suggested_profiles": ["recombinant_gcsf"]}
    if _contains_any(text, _RECOMBINANT_IFN_KEYWORDS):
        return {"compound_class": "recombinant_ifn", "suggested_profiles": ["recombinant_ifn"]}
    # Fc-fusion — check before generic antibody
    if _contains_any(text, _FC_FUSION_KEYWORDS):
        return {"compound_class": "fc_fusion_ctla4", "suggested_profiles": ["fc_fusion_ctla4"]}
    # Antibody/mAb — sub-classification cascade
    if _contains_any(text, _ANTIBODY_KEYWORDS):
        return _classify_antibody(text)
    if _contains_any(text, _VACCINE_KEYWORDS):
        return {"compound_class": "vaccine", "suggested_profiles": ["vaccine_adjuvanted", "vaccine_non_adjuvanted"]}
    if _contains_any(text, _GENE_THERAPY_KEYWORDS):
        return {"compound_class": "aav_gene_therapy", "suggested_profiles": ["aav_gene_therapy"]}
    if _contains_any(text, _OLIGONUCLEOTIDE_KEYWORDS):
        return {"compound_class": "oligonucleotide", "suggested_profiles": ["oligonucleotide"]}
    return None


# ── Main inference function ────────────────────────────────────────────────

def infer_compound_class(
    ts_meta: dict,
    available_domains: set[str] | None = None,
    species: str | None = None,
) -> dict:
    """Infer compound modality from TS metadata and study characteristics.

    Uses a cascading heuristic (first match wins):

    Tier 1 — PCLASS keyword match (HIGH confidence)
    Tier 2 — Treatment name (TRT) keyword match (MEDIUM confidence)
    Tier 3 — Study title (STITLE) keyword match (MEDIUM confidence)
    Tier 4 — INTTYPE contains gene therapy signal (MEDIUM confidence)
    Tier 5 — IS domain present + ROUTE = IM/SC (MEDIUM confidence)
    Tier 6 — ROUTE = SC/IM + NHP species (LOW confidence)
    Tier 7 — INTTYPE = BIOLOGICAL (LOW confidence)
    Tier 8 — Default: small molecule

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
    treatment = (ts_meta.get("treatment") or "").strip()
    study_title = (ts_meta.get("study_title") or "").strip()

    # Tier 1: PCLASS keyword match (highest signal — explicit pharmacologic class)
    if pclas and pclas.lower() not in _PCLASS_EMPTY:
        result = _classify_text(pclas)
        if result:
            return {**result, "confidence": "HIGH", "inference_method": f"PCLASS_{result['compound_class']}"}

    # Tier 2: Treatment name keyword match
    if treatment:
        result = _classify_text(treatment)
        if result:
            return {**result, "confidence": "MEDIUM", "inference_method": f"TRT_{result['compound_class']}"}

    # Tier 3: Study title keyword match
    if study_title:
        result = _classify_text(study_title)
        if result:
            return {**result, "confidence": "MEDIUM", "inference_method": f"STITLE_{result['compound_class']}"}

    # Tier 4: INTTYPE contains gene therapy signal
    if inttype and _contains_any(inttype, {"genetic", "gene therapy"}):
        return {
            "compound_class": "aav_gene_therapy",
            "confidence": "MEDIUM",
            "inference_method": "INTTYPE_genetic",
            "suggested_profiles": ["aav_gene_therapy"],
        }

    # Tier 5: IS domain present + ROUTE = IM/SC -> probable vaccine
    if "is" in available_domains and route in {"INTRAMUSCULAR", "SUBCUTANEOUS", "IM", "SC"}:
        return {
            "compound_class": "vaccine",
            "confidence": "MEDIUM",
            "inference_method": "IS_domain_plus_route",
            "suggested_profiles": ["vaccine_adjuvanted", "vaccine_non_adjuvanted"],
        }

    # Tier 6: ROUTE = SC/IM + species = NHP -> biologic unspecified
    # Suggest general_mab as starting point for SME override
    if route in {"SUBCUTANEOUS", "INTRAMUSCULAR", "SC", "IM"}:
        if any(nhp in species_val for nhp in ["MONKEY", "CYNOMOLGUS", "MACAQUE", "NHP", "PRIMATE"]):
            return {
                "compound_class": "biologic_unspecified",
                "confidence": "LOW",
                "inference_method": "route_plus_nhp_species",
                "suggested_profiles": ["general_mab"],
            }

    # Tier 7: INTTYPE = BIOLOGICAL
    if inttype and inttype.upper() in {"BIOLOGICAL", "BIOLOGIC"}:
        return {
            "compound_class": "biologic_unspecified",
            "confidence": "LOW",
            "inference_method": "INTTYPE_biological",
            "suggested_profiles": ["general_mab"],
        }

    # Default: small molecule (no expected-effect profile)
    return {
        "compound_class": "small_molecule",
        "confidence": "DEFAULT",
        "inference_method": "default",
        "suggested_profiles": [],
    }
