"""Admin curation API (Phase D Feature 2).

Three token-gated endpoints for managing finding-synonym additions:
    GET    /api/admin/unrecognized-terms
    PUT    /api/admin/synonym-mapping
    DELETE /api/admin/synonym-mapping/{id}

Auth MVP: X-Admin-Token header compared constant-time against
os.environ["ADMIN_TOKEN"] (>=32 chars required). Rate-limit 5/min per
source-IP (in-memory token bucket). CORS rejected for cross-origin
Origin headers. Full RBAC is a rule-14 deferral (no user-auth substrate).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import math
import os
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request, status

from services.analysis.send_knowledge import (
    _FINDING_DICTIONARY_DOMAINS,
    _FINDING_SYNONYMS_ADMIN_PATH,
    _load_finding_synonyms_data,
    _reset_finding_synonyms_caches,
    assess_organ_recognition,
    get_dictionary_versions,
)
from services.analysis.term_suggestions import (
    apply_bh_fdr,
    evaluate_promotion_signal,
    suggest_candidates,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin-terms"])

# ─── Paths & constants ──────────────────────────────────────────────────────

_BACKEND_ROOT = Path(__file__).parent.parent
_GENERATED_ROOT = _BACKEND_ROOT / "generated"
_SHARED_CONFIG_DIR = _BACKEND_ROOT.parent / "shared" / "config"
_REJECTIONS_PATH = _SHARED_CONFIG_DIR / "finding-synonym-rejections.json"
_STALE_STUDIES_PATH = _BACKEND_ROOT / "generated" / "_dict_stale_studies.json"

_MIN_TOKEN_LENGTH = 32
_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW_S = 60.0
_DEFAULT_IMPACT_THRESHOLD = int(os.environ.get("ADMIN_IMPACT_CONFIRM_THRESHOLD", "50"))

# In-memory rate buckets: {ip: [timestamps...]}. Failed-auth requests do
# NOT decrement the bucket (gate-as-DoS protection, R1 F9).
_RATE_BUCKETS: dict[str, list[float]] = defaultdict(list)


# ─── Auth / CORS / rate-limit helpers ───────────────────────────────────────


def _admin_token_configured() -> tuple[bool, str | None]:
    """Return (configured, reason) — reason set when the gate is off."""
    token = os.environ.get("ADMIN_TOKEN")
    if not token:
        return (False, "admin endpoints not configured")
    if len(token) < _MIN_TOKEN_LENGTH:
        return (False, f"ADMIN_TOKEN too short (min {_MIN_TOKEN_LENGTH})")
    return (True, None)


def _verify_admin(request: Request, x_admin_token: Optional[str]) -> None:
    """Raise HTTPException unless the request passes auth, CORS, rate-limit."""
    # CORS reject: any explicit cross-origin Origin header fails.
    origin = request.headers.get("origin", "")
    if origin:
        host = request.url.hostname or ""
        if host and host not in origin:
            raise HTTPException(status_code=403, detail="cross-origin admin access rejected")

    configured, reason = _admin_token_configured()
    if not configured:
        raise HTTPException(status_code=503, detail=reason or "admin endpoints not configured")

    if not x_admin_token:
        raise HTTPException(status_code=401, detail="missing X-Admin-Token header")

    expected = os.environ["ADMIN_TOKEN"]
    if not hmac.compare_digest(expected, x_admin_token):
        raise HTTPException(status_code=403, detail="invalid admin token")


def _check_rate_limit(request: Request) -> None:
    """Apply a simple sliding-window rate limit per source IP."""
    ip = (request.client.host if request.client else "unknown") or "unknown"
    now = time.monotonic()
    bucket = _RATE_BUCKETS[ip]
    # Evict expired entries.
    cutoff = now - _RATE_LIMIT_WINDOW_S
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= _RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="rate limit exceeded")
    bucket.append(now)


# ─── Load helpers ───────────────────────────────────────────────────────────


def _load_admin_overlay() -> dict:
    """Read the admin overlay file; return empty skeleton if absent."""
    if not _FINDING_SYNONYMS_ADMIN_PATH.exists():
        return {
            "version": "0.0.0",
            "generated_at": None,
            "domains": {d: {"entries": {}} for d in _FINDING_DICTIONARY_DOMAINS},
        }
    with open(_FINDING_SYNONYMS_ADMIN_PATH, encoding="utf-8") as f:
        return json.load(f)


def _atomic_write_json(path: Path, data: dict) -> None:
    """Write JSON atomically via temp file + rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def _load_rejections() -> list[dict]:
    if not _REJECTIONS_PATH.exists():
        return []
    try:
        with open(_REJECTIONS_PATH, encoding="utf-8") as f:
            payload = json.load(f)
        return list(payload) if isinstance(payload, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _bump_version(current: str) -> str:
    """Semver minor bump; "0.0.0" -> "0.1.0"; unparseable -> "0.1.0"."""
    parts = (current or "0.0.0").split(".")
    try:
        major, minor, _patch = (int(p) for p in parts[:3])
    except (ValueError, IndexError):
        return "0.1.0"
    return f"{major}.{minor + 1}.0"


def _item_id(domain: str, raw_code: str, organ_system: str | None) -> str:
    key = f"{domain}|{raw_code.upper().strip()}|{(organ_system or '__NONE__').upper()}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


# ─── Aggregation ────────────────────────────────────────────────────────────


def _load_study_reports() -> list[tuple[str, dict]]:
    """Return [(study_id, report_dict), ...] from each study's unrecognized_terms.json."""
    reports: list[tuple[str, dict]] = []
    if not _GENERATED_ROOT.exists():
        return reports
    for study_dir in _GENERATED_ROOT.iterdir():
        if not study_dir.is_dir():
            continue
        path = study_dir / "unrecognized_terms.json"
        if not path.exists():
            continue
        try:
            with open(path, encoding="utf-8") as f:
                reports.append((study_dir.name, json.load(f)))
        except (OSError, json.JSONDecodeError):
            continue
    return reports


def _study_cro(study_id: str) -> str | None:
    """Read TSPARMCD=SPONSOR from study_metadata_enriched.json if available."""
    path = _GENERATED_ROOT / study_id / "study_metadata_enriched.json"
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            meta = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    # Common shapes: {"trial_summary": [{"TSPARMCD": "SPONSOR", "TSVAL": "..."}]}
    for ts in meta.get("trial_summary", []) or []:
        if (ts.get("TSPARMCD") or "").upper() == "SPONSOR":
            val = ts.get("TSVAL")
            if val:
                return str(val).strip()
    return meta.get("sponsor") or meta.get("cro") or None


def _normalize_specimens_to_canonical(
    specimens: list[str],
) -> list[tuple[str | None, int | None, str | None]]:
    """Each specimen -> (canonical_organ_or_None, level, tier)."""
    out = []
    for specimen in specimens or []:
        canonical, level, tier = assess_organ_recognition(specimen)
        if level in (1, 2):
            out.append((canonical, level, tier))
        else:
            out.append((None, level, tier))
    return out


def _aggregate_unrecognized_items() -> tuple[list[dict], int]:
    """Aggregate across studies; return (items, total_studies)."""
    reports = _load_study_reports()
    total_studies = len(reports)
    if not reports:
        return ([], 0)

    # key -> {domain, raw_code, organ_system, frequency, studies, cros, specimens, ...}
    grouped: dict[str, dict] = {}

    for study_id, report in reports:
        cro = _study_cro(study_id)
        for entry in report.get("unrecognized_test_codes", []) or []:
            domain = entry.get("domain")
            if domain not in _FINDING_DICTIONARY_DOMAINS:
                continue
            if entry.get("reason") != "unmatched":
                continue
            raw_code = (entry.get("raw_code") or "").upper().strip()
            if not raw_code:
                continue
            count = int(entry.get("count") or 0)
            specimens = entry.get("specimens") or []
            normalized = _normalize_specimens_to_canonical(specimens)
            # Group specimens by canonical organ; split rows when distinct canonicals.
            by_organ: dict[str | None, list[tuple[int | None, str | None]]] = defaultdict(list)
            for canonical, level, tier in normalized:
                by_organ[canonical].append((level, tier))
            if not by_organ:
                by_organ[None] = []

            for canonical_organ, tiers in by_organ.items():
                reliable = (
                    canonical_organ is not None
                    and any(lvl in (1, 2) for lvl, _ in tiers)
                )
                organ_key = canonical_organ if reliable else None
                key = _item_id(domain, raw_code, organ_key)
                g = grouped.setdefault(
                    key,
                    {
                        "id": key,
                        "domain": domain,
                        "raw_term": raw_code,
                        "organ_system": organ_key,
                        "organ_scope_reliable": reliable,
                        "frequency": 0,
                        "seen_in_studies": set(),
                        "seen_in_cros": set(),
                    },
                )
                g["frequency"] += count
                g["seen_in_studies"].add(study_id)
                if cro:
                    g["seen_in_cros"].add(cro)

    items: list[dict] = []
    for g in grouped.values():
        g["seen_in_studies"] = sorted(g["seen_in_studies"])
        cros_list = sorted(g["seen_in_cros"]) if g["seen_in_cros"] else None
        g["seen_in_cros"] = cros_list
        items.append(g)

    return (items, total_studies)


def _rank_score(frequency: int, proportion_studies: float) -> float:
    return proportion_studies * math.log(1 + max(0, frequency))


# ─── GET /api/admin/unrecognized-terms ──────────────────────────────────────


@router.get("/unrecognized-terms")
async def get_unrecognized_terms(
    request: Request,
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
    min_frequency: int = Query(1, ge=1),
    domain: Optional[str] = Query(None),
    organ_system: Optional[str] = Query(None),
    include_rejected: int = Query(0),
    include_concordance_impact: int = Query(0),
):
    _verify_admin(request, x_admin_token)
    _check_rate_limit(request)

    items, total_studies = _aggregate_unrecognized_items()
    dict_versions = get_dictionary_versions()
    dict_version = dict_versions.get("finding_synonyms", "unknown")

    rejected_ids = {r["id"] for r in _load_rejections()}
    rejection_meta = {r["id"]: r for r in _load_rejections()}

    filtered = []
    for it in items:
        if it["frequency"] < min_frequency:
            continue
        if domain and it["domain"] != domain.upper():
            continue
        if organ_system and (it.get("organ_system") or "").upper() != organ_system.upper():
            continue
        if it["id"] in rejected_ids and not include_rejected:
            continue
        filtered.append(it)

    # Compute candidates + promotion signal for each item.
    raw_p_values: list[float | None] = []
    enriched: list[dict] = []
    for it in filtered:
        cands = suggest_candidates(
            raw_term=it["raw_term"],
            domain=it["domain"],
            organ_system=it.get("organ_system"),
        )
        ps = evaluate_promotion_signal(
            raw_term=it["raw_term"],
            domain=it["domain"],
            organ_system=it.get("organ_system"),
            seen_in_studies=list(it["seen_in_studies"]),
            seen_in_cros=list(it["seen_in_cros"]) if it["seen_in_cros"] else None,
            per_study_severity_distributions={},
            per_study_direction_hints={},
            total_loaded_studies=max(1, total_studies),
        )
        raw_p_values.append(ps.homonym_p_raw)
        concordance_impact = None
        if include_concordance_impact:
            concordance_impact = 0.0  # placeholder; RG-E-1 post-ship computation
        enriched.append(
            {
                **it,
                "candidates": [_serialize_candidate(c) for c in cands],
                "promotion_signal": {
                    "promotable": ps.promotable,
                    "proportion_studies": ps.proportion_studies,
                    "cross_cro": ps.cross_cro,
                    "effective_threshold": ps.effective_threshold,
                    "structural_variant_of": ps.structural_variant_of,
                    "homonym_flag": ps.homonym_flag,
                    "homonym_evidence": ps.homonym_evidence,
                    "homonym_p_raw": ps.homonym_p_raw,
                    "homonym_p_adj": None,
                },
                "concordance_impact": concordance_impact,
                "prior_rejection": (
                    rejection_meta.get(it["id"])
                    if it["id"] in rejection_meta and include_rejected
                    else None
                ),
            }
        )

    # BH-FDR across the response (R1 F1 / AC-3.3b).
    adjusted = apply_bh_fdr(raw_p_values, q=0.05)
    for it, p_adj in zip(enriched, adjusted, strict=False):
        it["promotion_signal"]["homonym_p_adj"] = p_adj
        if p_adj is not None and p_adj >= 0.05:
            it["promotion_signal"]["homonym_flag"] = False

    # Default sort: proportion_studies * log(1 + frequency), desc.
    enriched.sort(
        key=lambda x: _rank_score(x["frequency"], x["promotion_signal"]["proportion_studies"]),
        reverse=True,
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "dictionary_version": dict_version,
        "total_studies": total_studies,
        "items": enriched,
    }


def _serialize_candidate(c) -> dict:
    return {
        "canonical": c.canonical,
        "confidence": c.confidence,
        "token_jaccard": c.token_jaccard,
        "string_similarity": c.string_similarity,
        "match_reason": c.match_reason,
        "organ_scope_reliable": c.organ_scope_reliable,
        "organ_norm_tier_reason": c.organ_norm_tier_reason,
        "ncit_code": c.ncit_code,
        "source": c.source,
    }


# ─── PUT /api/admin/synonym-mapping ─────────────────────────────────────────


async def _parse_put_body(request: Request) -> dict:
    try:
        return await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"invalid JSON body: {e}")


def _find_canonical_for_alias(
    dictionary: dict, domain: str, raw_upper: str
) -> str | None:
    entries = ((dictionary.get("domains") or {}).get(domain, {}) or {}).get("entries", {}) or {}
    for canonical, entry in entries.items():
        canonical_upper = str(canonical).upper()
        if canonical_upper == raw_upper:
            return canonical_upper
        for alias in entry.get("aliases") or []:
            if str(alias).upper() == raw_upper:
                return canonical_upper
    return None


def _count_impact(alias_upper: str, domain: str) -> int:
    """Sum of `count` fields across all studies' unrecognized_test_codes that
    match (alias_upper, domain). AC-2.12 optimized scan — no dispatcher sweep.
    """
    total = 0
    for _sid, report in _load_study_reports():
        for entry in report.get("unrecognized_test_codes", []) or []:
            if entry.get("domain") != domain:
                continue
            if (entry.get("raw_code") or "").upper().strip() != alias_upper:
                continue
            total += int(entry.get("count") or 0)
    return total


def _affected_studies(alias_upper: str, domain: str) -> list[str]:
    out = []
    for sid, report in _load_study_reports():
        for entry in report.get("unrecognized_test_codes", []) or []:
            if entry.get("domain") == domain and (entry.get("raw_code") or "").upper().strip() == alias_upper:
                out.append(sid)
                break
    return sorted(out)


def _merge_stale_studies(new_sids: list[str]) -> list[str]:
    current: list[str] = []
    if _STALE_STUDIES_PATH.exists():
        try:
            with open(_STALE_STUDIES_PATH, encoding="utf-8") as f:
                current = list(json.load(f) or [])
        except (OSError, json.JSONDecodeError):
            current = []
    merged = sorted({*current, *new_sids})
    _atomic_write_json(_STALE_STUDIES_PATH, merged)  # type: ignore[arg-type]
    return merged


@router.put("/synonym-mapping")
async def put_synonym_mapping(
    request: Request,
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
    x_confirm_impact: Optional[str] = Header(None, alias="X-Confirm-Impact"),
    x_force_sequential: Optional[str] = Header(None, alias="X-Force-Sequential"),
):
    _verify_admin(request, x_admin_token)
    _check_rate_limit(request)
    body = await _parse_put_body(request)

    domain = (body.get("domain") or "").upper()
    canonical = (body.get("canonical") or "").upper().strip()
    alias = (body.get("alias") or "").upper().strip()
    organ_scope = body.get("organ_scope")
    added_by = (body.get("added_by") or "").strip()
    source_justification = (body.get("source_justification") or "").strip()
    add_new_canonical = bool(body.get("add_new_canonical"))

    if domain not in _FINDING_DICTIONARY_DOMAINS:
        raise HTTPException(status_code=400, detail=f"unsupported domain: {domain}")
    if not canonical or not alias:
        raise HTTPException(status_code=400, detail="canonical and alias required")
    if not added_by or not source_justification:
        raise HTTPException(status_code=400, detail="added_by and source_justification required")

    # Load merged dictionary (base + current admin overlay).
    merged = _load_finding_synonyms_data()
    entries = ((merged.get("domains") or {}).get(domain, {}) or {}).get("entries", {}) or {}
    canonical_exists = canonical in entries

    if add_new_canonical:
        if canonical_exists:
            raise HTTPException(
                status_code=409,
                detail=f"canonical {canonical} already exists; drop add_new_canonical to add aliases",
            )
    else:
        if not canonical_exists:
            raise HTTPException(status_code=400, detail=f"canonical {canonical} not in dictionary")

    # Bidirectional validation: alias cannot already map to a different canonical.
    existing_canonical = _find_canonical_for_alias(merged, domain, alias)
    if existing_canonical and existing_canonical != canonical:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "alias_reassign_conflict",
                "alias": alias,
                "existing_canonical": existing_canonical,
                "requested_canonical": canonical,
            },
        )

    # Stacked-PUT staleness gate (R1 F5 / AC-2.13).
    stale_warning: str | None = None
    had_stale = _STALE_STUDIES_PATH.exists() and bool(
        _load_json_safe(_STALE_STUDIES_PATH)
    )
    if had_stale:
        stale_warning = (
            "Previous admin PUTs are pending regeneration; impact preview is "
            "lower-bound only. Regenerate affected studies or set "
            "X-Force-Sequential: accept-lower-bound."
        )

    # Impact preview (optimized via unrecognized_terms.json scan).
    impact_count = _count_impact(alias, domain)
    impact_threshold = _DEFAULT_IMPACT_THRESHOLD
    if impact_count > impact_threshold and not x_confirm_impact:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "confirm_impact_required",
                "impact_count": impact_count,
                "threshold": impact_threshold,
                "hint": "resend with X-Confirm-Impact: 1",
            },
        )
    if had_stale and impact_count > impact_threshold and not x_force_sequential:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "stacked_put_staleness",
                "message": stale_warning,
                "impact_count": impact_count,
            },
        )

    # Apply the overlay mutation.
    overlay = _load_admin_overlay()
    domain_entries = overlay.setdefault("domains", {}).setdefault(domain, {"entries": {}}).setdefault("entries", {})
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if canonical in domain_entries:
        entry = domain_entries[canonical]
        aliases = list(entry.get("aliases") or [])
        if alias not in aliases:
            aliases.append(alias)
        entry["aliases"] = aliases
        entry["added_by"] = added_by
        entry["added_date"] = now_iso
        entry["source_justification"] = source_justification
    else:
        domain_entries[canonical] = {
            "canonical": canonical,
            "aliases": [alias] if not add_new_canonical else list(body.get("aliases") or [alias]),
            "ncit_code": body.get("ncit_code"),
            "source": body.get("source") or ["admin"],
            "organ_scope": organ_scope,
            "added_by": added_by,
            "added_date": now_iso,
            "source_justification": source_justification,
        }
    overlay["version"] = _bump_version(overlay.get("version", "0.0.0"))
    overlay["generated_at"] = now_iso

    # Atomic write.
    try:
        _atomic_write_json(_FINDING_SYNONYMS_ADMIN_PATH, overlay)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"admin overlay write failed: {e}")

    # Cache invalidation (R1 F4 belt-and-braces).
    _reset_finding_synonyms_caches()
    try:
        from services.analysis import term_collisions as _tc

        _tc.collision_cache.clear()
    except Exception:
        pass  # collision cache is best-effort — missing module not fatal

    # Affected-study flagging.
    affected = _affected_studies(alias, domain)
    if affected:
        _merge_stale_studies(affected)

    return {
        "status": "accepted",
        "new_dict_version": overlay["version"],
        "affected_studies": affected,
        "impact_count": impact_count,
        "staleness_warning": stale_warning,
    }


def _load_json_safe(path: Path):
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


# ─── DELETE /api/admin/synonym-mapping/{id} ─────────────────────────────────


@router.delete("/synonym-mapping/{item_id}")
async def delete_synonym_mapping(
    item_id: str,
    request: Request,
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
):
    _verify_admin(request, x_admin_token)
    _check_rate_limit(request)
    body = await _parse_put_body(request)
    rejected_by = (body.get("rejected_by") or "").strip()
    reason = (body.get("reason") or "").strip()
    if not rejected_by or not reason:
        raise HTTPException(status_code=400, detail="rejected_by and reason required")

    rejections = _load_rejections()
    # Upsert by id.
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    rejections = [r for r in rejections if r.get("id") != item_id]
    rejections.append(
        {
            "id": item_id,
            "rejected_by": rejected_by,
            "rejected_date": now_iso,
            "reason": reason,
        }
    )
    _atomic_write_json(_REJECTIONS_PATH, rejections)  # type: ignore[arg-type]
    return {"status": "rejected", "id": item_id}


# Re-export the helper id builder so tests and cross-study "Resolve as synonym"
# flow can compute the same hash.
compute_item_id = _item_id
