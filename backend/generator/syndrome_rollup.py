"""Per-study syndrome rollup with dose x phase breakdown.

Aggregates per-subject syndrome matches from `subject_syndromes.json` into
per-organ-system buckets indexed by dose x study-phase. Surfaces five
modifier flags per syndrome that the synthesis page (GAP-288 Stage 2)
uses to qualify each row.

Schema: see `docs/_internal/incoming/gap-288-stage2-noael-synthesis-spec.md` Section 3.2.

The function is a pure aggregation of inputs already on disk -- no XPT
re-read, no statistical computation. Determinism is enforced via sorted
iteration so byte-equal regen is verifiable by `scripts/audit-syndrome-rollup.py`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


import json
import re
from pathlib import Path

from generator.subject_syndromes import HISTOPATH_RULES
from services.analysis.send_knowledge import ORGAN_SYSTEM_MAP

# ----------------------------------------------------------------------
# Syndrome -> organ_system mapping
#
# Cross-domain syndromes (XS01-XS10, XC*) carry no organ_system field in
# their definition (shared/syndrome-definitions.json). The mapping below
# encodes the primary organ_system that each syndrome's evidence row will
# render under in the synthesis page. Multi-organ syndromes also surface
# in `cross_organ_syndromes`. The vocabulary matches `target_organ_summary[].organ_system`
# (which is fed by `services.analysis.send_knowledge.ORGAN_SYSTEM_MAP` --
# the same dict reused below for histopath syndromes).
#
# Convention notes:
#   - XS06 Phospholipidosis: primary readout is hepatic; truly multi-organ
#     instances surface via histopath rule `phospholipidosis`.
#   - XS07 Immunotoxicity: WBC/LYM driven (LB) with thymus/lymph_node
#     corroboration -- ORGAN_SYSTEM_MAP routes those organs to hematologic,
#     so XS07 lives there too for consistency.
#   - XS08 Stress / XS09 Wasting: not organ-localized; default `general`.
# ----------------------------------------------------------------------

CROSS_DOMAIN_SYNDROME_ORGAN: dict[str, list[str]] = {
    # XS series (10 base syndromes)
    "XS01": ["hepatic"],
    "XS02": ["hepatic"],
    "XS03": ["renal"],
    "XS04": ["hematologic"],
    "XS05": ["hematologic"],
    "XS06": ["hepatic"],
    # XS07 Immunotoxicity: canonical SOC is "immune system disorders"
    # (docs/_internal/knowledge/syndrome-engine-reference.md:790), but
    # target_organ_summary's organ_system vocabulary has no `immune`
    # bucket -- routing XS07 there would orphan the syndrome on the
    # synthesis page. Until an `immune` bucket is added system-wide
    # (target_organ_summary + organ_map + frontend), placing XS07 in
    # `general` matches where target_organ_summary already files
    # immune-domain findings (XS07's WBC/LYM-driven LB evidence + thymus
    # corroboration). See TODO follow-up "Immune system as first-class
    # organ_system bucket".
    "XS07": ["general"],
    "XS08": ["general"],
    "XS09": ["general"],
    "XS10": ["cardiovascular"],
    # XC bone marrow
    "XC01a": ["hematologic"],
    "XC01b": ["hematologic"],
    "XC01c": ["hematologic"],
    "XC02":  ["hematologic"],
    # XC thyroid / adrenal / endocrine
    "XC03a": ["endocrine"],
    "XC03b": ["endocrine"],
    "XC04a": ["endocrine"],
    "XC04b": ["endocrine"],
    "XC04c": ["endocrine"],
    "XC05":  ["endocrine"],
    # XC reproductive
    "XC06a": ["reproductive"],
    "XC06b": ["reproductive"],
    "XC06c": ["reproductive"],
    "XC07a": ["reproductive"],
    "XC08a": ["reproductive"],
    "XC08b": ["reproductive"],
    # XC neurological
    "XC09":  ["neurological"],
    "XC10":  ["neurological"],
    # XC dermal / injection
    "XC11a": ["integumentary"],
    "XC11b": ["integumentary"],
    # XC ocular
    "XC12a": ["ocular"],
    "XC12b": ["ocular"],
    "XC12c": ["ocular"],
}


def _build_histopath_organ_map() -> dict[str, list[str]]:
    """Derive {syndrome_id: [organ_system, ...]} for histopath syndromes.

    Aggregates the SEND organ tokens listed in each rule's `organ` field
    through the canonical `ORGAN_SYSTEM_MAP`. Multiple distinct
    organ_systems -> the syndrome is multi-organ (it will surface in
    `cross_organ_syndromes`). Unmapped tokens fall through to
    `general`.
    """
    out: dict[str, list[str]] = {}
    for rule in HISTOPATH_RULES:
        sid = rule["syndrome_id"]
        organs = rule.get("organ", []) or []
        systems: list[str] = []
        seen: set[str] = set()
        for org in organs:
            sys = ORGAN_SYSTEM_MAP.get(str(org).upper())
            if sys and sys not in seen:
                systems.append(sys)
                seen.add(sys)
        out[sid] = systems if systems else ["general"]
    return out


HISTOPATH_SYNDROME_ORGAN: dict[str, list[str]] = _build_histopath_organ_map()


def _normalize_term(s: str) -> str:
    """Normalize an endpoint label or test code for comparison: lowercase, alnum-only."""
    return re.sub(r"[^a-z0-9]+", "", str(s or "").lower())


def _build_syndrome_term_lookup() -> dict[str, set[str]]:
    """For each syndrome_id, the set of normalized endpoint identifiers it monitors.

    Cross-domain syndromes (XS/XC): aggregate `testCodes` + `canonicalLabels`
    from each term in `shared/syndrome-definitions.json`.
    Histopath syndromes: aggregate `required_findings` + `supporting_findings`
    from `HISTOPATH_RULES`.

    Used by drives-loael detection to ask "does any syndrome member finding
    appear in noael_summary.adverse_findings_at_loael?" -- the canonical
    spec semantics, distinct from the previous (broken) syndrome-name
    substring heuristic.
    """
    out: dict[str, set[str]] = {}

    # Cross-domain
    defs_path = Path(__file__).parent.parent.parent / "shared" / "syndrome-definitions.json"
    try:
        with defs_path.open() as f:
            defs = json.load(f)
        for s in defs.get("syndromes", []):
            sid = str(s.get("id") or "")
            if not sid:
                continue
            terms: set[str] = set()
            for t in s.get("terms", []):
                for tc in t.get("testCodes", []) or []:
                    terms.add(_normalize_term(tc))
                for cl in t.get("canonicalLabels", []) or []:
                    terms.add(_normalize_term(cl))
            terms.discard("")
            if terms:
                out[sid] = terms
    except (OSError, json.JSONDecodeError):
        pass

    # Histopath
    for rule in HISTOPATH_RULES:
        sid = str(rule.get("syndrome_id") or "")
        if not sid:
            continue
        terms = set()
        for f in rule.get("required_findings", []) or []:
            terms.add(_normalize_term(f))
        for f in rule.get("supporting_findings", []) or []:
            terms.add(_normalize_term(f))
        terms.discard("")
        if terms:
            out[sid] = terms

    return out


SYNDROME_TERM_LOOKUP: dict[str, set[str]] = _build_syndrome_term_lookup()


def _organs_for(syndrome_id: str) -> list[str]:
    """Return the organ_systems a syndrome belongs to. Defaults to ['general']."""
    if syndrome_id in CROSS_DOMAIN_SYNDROME_ORGAN:
        return CROSS_DOMAIN_SYNDROME_ORGAN[syndrome_id]
    if syndrome_id in HISTOPATH_SYNDROME_ORGAN:
        return HISTOPATH_SYNDROME_ORGAN[syndrome_id]
    return ["general"]


# ----------------------------------------------------------------------
# Modifier-note thresholds (per spec Section 3.2)
# ----------------------------------------------------------------------

LIKELY_BACKGROUND_N_THRESHOLD = 2     # syndrome-N <=2 at LOAEL AND at all higher doses


# ----------------------------------------------------------------------
# Builder
# ----------------------------------------------------------------------

def build_syndrome_rollup(
    *,
    subject_syndromes: dict,
    subject_context: list[dict],
    noael_summary: list[dict] | None,
    mortality: dict | None,
    recovery_verdicts: dict | None,
) -> dict:
    """Aggregate per-subject syndrome matches into a per-organ rollup.

    Args:
        subject_syndromes: Loaded subject_syndromes.json ({"meta":..., "subjects": {USUBJID: {...}}}).
        subject_context: List of subject context dicts (USUBJID, DOSE, STUDY_PHASE, ...).
        noael_summary: Loaded noael_summary.json (per-sex list with Combined row); used for
            sets-loael / drives-loael / mortality-cap derivation.
        mortality: Loaded study_mortality.json or None.
        recovery_verdicts: Loaded recovery_verdicts.json or None.

    Returns:
        dict matching the schema in spec Section 3.2.
    """

    # 1. Subject -> (dose_value, study_phase) lookup, plus syndrome name table
    subj_dose_phase: dict[str, tuple[float | None, str]] = {}
    for s in subject_context:
        uid = str(s.get("USUBJID", ""))
        if not uid:
            continue
        dose = s.get("DOSE")
        if dose is not None:
            try:
                dose = float(dose)
            except (TypeError, ValueError):
                dose = None
        phase = str(s.get("STUDY_PHASE") or "Main Study")
        subj_dose_phase[uid] = (dose, phase)

    # 2. Build the (dose, phase) -> n_evaluable totals.
    # Evaluable = non-TK subjects in subject_context. Group by (dose, phase).
    n_evaluable_by_cell: dict[tuple[float | None, str], int] = {}
    for s in subject_context:
        if bool(s.get("IS_TK")):
            continue
        dose = s.get("DOSE")
        if dose is not None:
            try:
                dose = float(dose)
            except (TypeError, ValueError):
                dose = None
        phase = str(s.get("STUDY_PHASE") or "Main Study")
        key = (dose, phase)
        n_evaluable_by_cell[key] = n_evaluable_by_cell.get(key, 0) + 1

    # 3. Walk per-subject syndromes and accumulate per-syndrome aggregates.
    # Per spec: full matches only count toward the rollup (partial_syndromes
    # are inspectable on the per-subject path but the rollup surface is for
    # confirmed matches the synthesis page uses to justify NOAEL).
    subjects_block = subject_syndromes.get("subjects") or {}

    # syndrome_id -> {
    #   "name": str,
    #   "organ_systems": list[str],
    #   "subjects_total": set[uid],
    #   "subjects_main": set[uid],
    #   "subjects_recovery": set[uid],
    #   "confidence_distribution": {HIGH: n, MODERATE: n, LOW: n},
    #   "by_dose_phase_subjects": {(dose, phase): set[uid]},
    # }
    agg: dict[str, dict[str, Any]] = {}

    for uid, payload in subjects_block.items():
        uid = str(uid)
        dose_phase = subj_dose_phase.get(uid)
        if dose_phase is None:
            continue
        dose, phase = dose_phase
        for entry in payload.get("syndromes") or []:
            sid = str(entry.get("syndrome_id") or "")
            if not sid:
                continue
            if sid not in agg:
                agg[sid] = {
                    "name": entry.get("syndrome_name") or sid,
                    "organ_systems": _organs_for(sid),
                    "subjects_total": set(),
                    "subjects_main": set(),
                    "subjects_recovery": set(),
                    "confidence_distribution": {"HIGH": 0, "MODERATE": 0, "LOW": 0},
                    "by_dose_phase_subjects": {},
                }
            bucket = agg[sid]
            bucket["subjects_total"].add(uid)
            if phase == "Recovery":
                bucket["subjects_recovery"].add(uid)
            else:
                bucket["subjects_main"].add(uid)
            conf = str(entry.get("confidence") or "").upper()
            if conf in bucket["confidence_distribution"]:
                bucket["confidence_distribution"][conf] += 1
            cell_key = (dose, phase)
            cell_set: set[str] = bucket["by_dose_phase_subjects"].setdefault(cell_key, set())
            cell_set.add(uid)

    # 4. Pull LOAEL dose value, mortality cap, and adverse-finding names from noael_summary.
    loael_dose_value: float | None = None
    drives_loael_findings: set[str] = set()
    mortality_cap_dose_value: float | None = None
    high_dose_value: float | None = None

    if noael_summary:
        combined = next(
            (r for r in noael_summary if r.get("sex") == "Combined"),
            None,
        )
        if combined is None and noael_summary:
            combined = noael_summary[0]
        if combined is not None:
            # Try to extract LOAEL dose value from the label (the dose_value field is null
            # in the schema we observed; the dose value is encoded in loael_label as
            # "Group N,X mg/kg ..."). Prefer an explicit field if present.
            loael_dose_value = combined.get("loael_dose_value")
            if loael_dose_value is None:
                loael_dose_value = _parse_dose_from_label(combined.get("loael_label"))
            else:
                try:
                    loael_dose_value = float(loael_dose_value)
                except (TypeError, ValueError):
                    loael_dose_value = None
            mortality_cap_dose_value = combined.get("mortality_cap_dose_value")
            if mortality_cap_dose_value is not None:
                try:
                    mortality_cap_dose_value = float(mortality_cap_dose_value)
                except (TypeError, ValueError):
                    mortality_cap_dose_value = None
            deriv = combined.get("noael_derivation") or {}
            for f in (deriv.get("adverse_findings_at_loael") or []):
                name = f.get("finding") or f.get("endpoint_label")
                if name:
                    # Normalized for membership-comparison against
                    # SYNDROME_TERM_LOOKUP (which holds normalized
                    # testCodes + canonicalLabels). Both sides go
                    # through `_normalize_term` so equivalence is
                    # case + whitespace + punctuation insensitive.
                    drives_loael_findings.add(_normalize_term(name))

    # Highest treated (non-control) dose across non-TK subject_context.
    treated_doses = sorted({
        d for (d, _phase) in n_evaluable_by_cell.keys()
        if d is not None and d > 0
    })
    if treated_doses:
        high_dose_value = treated_doses[-1]

    # mortality at high dose (>0 deaths). Falls back to the noael_summary
    # mortality_cap_dose_value when raw mortality is unavailable.
    deaths_at_high_dose = 0
    if mortality and high_dose_value is not None:
        for d in (mortality.get("deaths") or []):
            if d.get("is_accidental"):
                continue
            ddose = d.get("dose")
            if ddose is None:
                continue
            try:
                ddose = float(ddose)
            except (TypeError, ValueError):
                continue
            if abs(ddose - high_dose_value) < 1e-9:
                deaths_at_high_dose += 1

    # 5. Recovery overlap: which subjects appear in BOTH a Main and Recovery
    #    cell of the same syndrome. The audit script re-derives this from
    #    the per-subject path -- the rollup must match exactly.
    # (Already encoded in subjects_main vs subjects_recovery; intersection
    #  is the persists_in_recovery test.)

    # 6. Emit syndrome rows.
    by_organ: dict[str, list[dict]] = {}
    cross_organ: list[dict] = []

    for sid in sorted(agg.keys()):
        bucket = agg[sid]
        organs: list[str] = bucket["organ_systems"]
        n_total = len(bucket["subjects_total"])

        # by_dose_phase emission (sorted for determinism)
        cells_out: dict[str, dict[str, int]] = {}
        for cell_key in sorted(
            bucket["by_dose_phase_subjects"].keys(),
            key=lambda kp: (kp[0] if kp[0] is not None else -1.0, kp[1]),
        ):
            dose, phase = cell_key
            n_subj = len(bucket["by_dose_phase_subjects"][cell_key])
            n_eval = n_evaluable_by_cell.get(cell_key, 0)
            label = _cell_label(dose, phase)
            cells_out[label] = {"n_subjects": n_subj, "n_evaluable": n_eval}

        # Modifier-note + LOAEL-role derivations
        modifier_notes: list[str] = []
        loael_role: str | None = None

        # Lowest dose (>0) where this syndrome fired in Main Study phase
        main_doses_with_match = sorted({
            d for (d, ph) in bucket["by_dose_phase_subjects"].keys()
            if ph != "Recovery" and d is not None and d > 0
        })
        lowest_match_dose = main_doses_with_match[0] if main_doses_with_match else None

        if (
            loael_dose_value is not None
            and lowest_match_dose is not None
            and abs(lowest_match_dose - loael_dose_value) < 1e-9
        ):
            loael_role = "sets-loael"
            modifier_notes.append("sets_loael")

        # drives-loael: any of this syndrome's MEMBER findings (test_codes /
        # canonical_labels for cross-domain; required/supporting findings for
        # histopath) appears in noael_summary.adverse_findings_at_loael.
        # Per spec Section 3.2: "true if any syndrome member finding is in
        # noael_summary.adverse_findings_at_loael". The previous heuristic
        # compared the syndrome's *name* against finding names, which would
        # almost never match (e.g. "Hepatocellular Injury" vs "ALT increased").
        if drives_loael_findings:
            syn_terms = SYNDROME_TERM_LOOKUP.get(sid, set())
            if syn_terms and (syn_terms & drives_loael_findings):
                if loael_role is None:
                    loael_role = "drives-loael"

        # mortality_cap: subject count drops at a dose >= mortality_cap_dose AND deaths>0 at high dose.
        if (
            mortality_cap_dose_value is not None
            and deaths_at_high_dose > 0
            and main_doses_with_match
        ):
            # subject counts at each Main dose (non-recovery)
            counts_by_dose: dict[float, int] = {}
            for (d, ph), subs in bucket["by_dose_phase_subjects"].items():
                if ph == "Recovery" or d is None or d <= 0:
                    continue
                counts_by_dose[d] = counts_by_dose.get(d, 0) + len(subs)
            doses_sorted = sorted(counts_by_dose.keys())
            # detect a strict drop between any two consecutive doses where the
            # higher dose is at or above the mortality cap
            for i in range(1, len(doses_sorted)):
                lo = doses_sorted[i - 1]
                hi = doses_sorted[i]
                if hi >= mortality_cap_dose_value and counts_by_dose[hi] < counts_by_dose[lo]:
                    modifier_notes.append("mortality_cap")
                    break

        # likely_background: small N at LOAEL AND small N at every higher Main dose.
        if loael_dose_value is not None and main_doses_with_match:
            counts_per_dose: dict[float, int] = {}
            for (d, ph), subs in bucket["by_dose_phase_subjects"].items():
                if ph == "Recovery" or d is None or d <= 0:
                    continue
                counts_per_dose[d] = counts_per_dose.get(d, 0) + len(subs)
            n_at_loael = counts_per_dose.get(loael_dose_value, 0)
            higher_counts = [
                counts_per_dose.get(d, 0)
                for d in counts_per_dose
                if d > loael_dose_value
            ]
            if (
                n_at_loael > 0
                and n_at_loael <= LIKELY_BACKGROUND_N_THRESHOLD
                and (not higher_counts or all(c <= LIKELY_BACKGROUND_N_THRESHOLD for c in higher_counts))
            ):
                modifier_notes.append("likely_background")

        # persists_in_recovery: same subject in both Main and Recovery cells of this syndrome.
        if bucket["subjects_main"] and bucket["subjects_recovery"]:
            if bucket["subjects_main"].intersection(bucket["subjects_recovery"]):
                modifier_notes.append("persists_in_recovery")

        # primary organ_system for the row -- first entry; multi-organ rows
        # surface in cross_organ_syndromes regardless.
        primary_organ = organs[0] if organs else "general"

        row: dict[str, Any] = {
            "syndrome_id": sid,
            "syndrome_name": bucket["name"],
            "organ_system": primary_organ,
            "n_subjects_total": n_total,
            "confidence_distribution": dict(bucket["confidence_distribution"]),
            "by_dose_phase": cells_out,
            "loael_role": loael_role,
            "modifier_notes": sorted(set(modifier_notes)),
        }

        if len(organs) > 1:
            # Mirror the row into cross-organ; also leave it in the primary
            # organ bucket so existing per-organ consumers don't lose it.
            cross_row = dict(row)
            cross_row["organ_systems"] = list(organs)
            cross_organ.append(cross_row)

        by_organ.setdefault(primary_organ, []).append(row)

    # Sort within each organ by n_subjects_total desc, then syndrome_id for ties.
    for organ in by_organ:
        by_organ[organ].sort(key=lambda r: (-r["n_subjects_total"], r["syndrome_id"]))

    cross_organ.sort(key=lambda r: (-r["n_subjects_total"], r["syndrome_id"]))

    meta = subject_syndromes.get("meta") or {}
    return {
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat(),
            "syndrome_definitions_version": meta.get("syndrome_definitions_version", "1.0"),
            "study_id": meta.get("study_id"),
            "n_syndromes_detected": len(agg),
            "n_organs_with_match": len(by_organ),
        },
        "cross_organ_syndromes": cross_organ,
        "by_organ": by_organ,
    }


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def _cell_label(dose: float | None, phase: str) -> str:
    """Produce '<dose>:<phase>' label. Dose '0' means control."""
    if dose is None:
        dose_str = "null"
    elif float(dose).is_integer():
        dose_str = str(int(dose))
    else:
        dose_str = str(dose)
    return f"{dose_str}:{phase}"


def _parse_dose_from_label(label: str | None) -> float | None:
    """Best-effort dose extraction from a label like 'Group 2,2 mg/kg PCDRUG'.

    The noael_summary entries we observe carry loael_label but not loael_dose_value
    on PointCross; this fallback parses the numeric portion. Returns None on failure.
    """
    if not label:
        return None
    import re
    # Match patterns like "Group 2,2 mg/kg" -> 2; "Group 4, 4200 mg/kg" -> 4200.
    m = re.search(r",\s*([\d.]+)\s*(?:mg|ug|g)/kg", str(label))
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    # Fallback: any number followed by mg/kg
    m = re.search(r"([\d.]+)\s*(?:mg|ug|g)/kg", str(label))
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None
