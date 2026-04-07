"""Protective syndrome detection engine (R18-R25).

Evaluates protective syndrome rules from shared/rules/protective-syndromes.json
against study findings. Follows the subject_sentinel.py generator pattern.

Architecture: 3-stage detection.
  1. N-tier routing (suppress/descriptive/inference) based on group sizes
  2. Per-rule evaluation: term matching, required logic, magnitude floors, PEX gates
  3. Statistical gate (inference tier only): Boschloo one-sided + Bayesian posterior

Output: protective_syndromes[] in generated JSON with d3_pending: true.
"""

import json
import logging
from pathlib import Path

import numpy as np
from scipy import stats as scipy_stats

log = logging.getLogger(__name__)

_CATALOG_PATH = Path(__file__).parent.parent.parent / "shared" / "rules" / "protective-syndromes.json"
_CATALOG: dict | None = None


def _load_catalog() -> dict:
    global _CATALOG
    if _CATALOG is None:
        with open(_CATALOG_PATH) as f:
            _CATALOG = json.load(f)
    return _CATALOG


# ---------------------------------------------------------------------------
# N-tier routing
# ---------------------------------------------------------------------------

def _determine_evidence_tier(
    dose_groups: list[dict],
) -> tuple[str, int, int]:
    """Determine the evidence tier based on main-study group sizes.

    Uses per-sex N (min of n_male, n_female) since findings are sex-stratified.
    Excludes TK satellite and recovery groups.

    Returns (tier, treat_n, ctrl_n) where tier is one of:
        "suppressed" (N<5), "descriptive_only" (N=5-7), "inference" (N>=8).
    treat_n and ctrl_n are the minimum per-sex N across main-study groups.
    """
    ctrl_n = 0
    treat_ns = []

    for dg in dose_groups:
        if dg.get("is_satellite") is True or dg.get("is_recovery") is True:
            continue

        # Per-sex N: use the smaller of male/female counts.
        # Pipeline dose_groups have n_male, n_female, n_total.
        # Test dose_groups may have just 'n'.
        n_m = dg.get("n_male") or 0
        n_f = dg.get("n_female") or 0
        if n_m > 0 and n_f > 0:
            n = min(n_m, n_f)
        elif n_m > 0:
            n = n_m
        elif n_f > 0:
            n = n_f
        else:
            n = dg.get("n", 0) or 0

        # n_male/n_female already exclude TK satellites (those are in
        # pooled_n_male/pooled_n_female). No subtraction needed.

        is_ctrl = dg.get("is_control") or dg.get("dose_level", -1) == 0
        if is_ctrl:
            ctrl_n = max(ctrl_n, n)
        else:
            treat_ns.append(n)

    min_treat_n = min(treat_ns) if treat_ns else 0
    min_n = min(min_treat_n, ctrl_n) if ctrl_n > 0 else min_treat_n

    if min_n < 5:
        return "suppressed", min_treat_n, ctrl_n
    elif min_n < 8:
        return "descriptive_only", min_treat_n, ctrl_n
    else:
        return "inference", min_treat_n, ctrl_n


# ---------------------------------------------------------------------------
# Term matching
# ---------------------------------------------------------------------------

def _match_finding_to_term(finding: dict, term: dict) -> bool:
    """Check if a finding matches a rule term definition."""
    f_domain = finding.get("domain", "")

    # Domain check
    term_domain = term.get("domain", "")
    if term_domain and f_domain != term_domain:
        return False

    # Direction check
    term_dir = term.get("direction", "any")
    if term_dir != "any":
        f_dir = finding.get("direction", "none")
        if f_dir != term_dir:
            return False

    # LB/BW matching: test_code in testCodes list
    if "testCodes" in term:
        tc = (finding.get("test_code") or "").upper()
        if tc not in [t.upper() for t in term["testCodes"]]:
            return False
        return True

    # MI/MA/CL matching: specimen + finding term matching
    if "specimenTerms" in term:
        st = term["specimenTerms"]
        f_specimen = (finding.get("specimen") or "").lower()
        f_finding = (finding.get("finding") or "").lower()

        # Specimen check (if specified)
        spec_terms = st.get("specimen", [])
        if spec_terms:
            if not any(s.lower() in f_specimen for s in spec_terms):
                return False

        # Finding check (if specified)
        find_terms = st.get("finding", [])
        if find_terms:
            if not any(ft.lower() in f_finding for ft in find_terms):
                return False

        return True

    # OM matching: organWeightTerms
    if "organWeightTerms" in term:
        if f_domain != "OM":
            return False
        owt = term["organWeightTerms"]
        spec_terms = owt.get("specimen", [])
        if spec_terms:
            f_specimen = (finding.get("specimen") or "").lower()
            if not any(s.lower() in f_specimen for s in spec_terms):
                return False
        return True

    return False


def _match_findings_to_rule(
    findings: list[dict],
    rule: dict,
) -> tuple[set, list[dict]]:
    """Match findings against a rule's term set.

    Returns (matched_tags, matched_findings) where matched_tags is the set
    of tags from the rule that were matched, and matched_findings is a list
    of (finding, term) pairs for each match.
    """
    matched_tags: set[str] = set()
    matched_findings: list[dict] = []

    for term in rule.get("terms", []):
        tag = term.get("tag", "")
        for finding in findings:
            if _match_finding_to_term(finding, term):
                matched_tags.add(tag)
                matched_findings.append({
                    "tag": tag,
                    "finding_id": finding.get("id"),
                    "domain": finding.get("domain"),
                    "test_code": finding.get("test_code"),
                    "specimen": finding.get("specimen"),
                    "finding": finding.get("finding"),
                    "direction": finding.get("direction"),
                    "role": term.get("role", "supporting"),
                    "endpoint_label": finding.get("endpoint_label"),
                    "sex": finding.get("sex"),
                })
                break  # one finding per tag is sufficient

    return matched_tags, matched_findings


# ---------------------------------------------------------------------------
# Required logic evaluation
# ---------------------------------------------------------------------------

def _evaluate_required_logic(expression: str, matched_tags: set[str]) -> bool:
    """Evaluate a compound boolean expression against matched tags.

    Supports: AND, OR, NOT, any(), parentheses.
    Example: "(LIVER_WT AND HEPATIC_HYPERTROPHY) AND NOT XS01_REQUIRED"
    """
    if not expression:
        return len(matched_tags) > 0

    # Tokenize
    tokens = expression.replace("(", " ( ").replace(")", " ) ").split()
    pos = 0

    def parse_expr():
        nonlocal pos
        result = parse_and()
        while pos < len(tokens) and tokens[pos] == "OR":
            pos += 1
            right = parse_and()
            result = result or right
        return result

    def parse_and():
        nonlocal pos
        result = parse_not()
        while pos < len(tokens) and tokens[pos] == "AND":
            pos += 1
            right = parse_not()
            result = result and right
        return result

    def parse_not():
        nonlocal pos
        if pos < len(tokens) and tokens[pos] == "NOT":
            pos += 1
            return not parse_primary()
        return parse_primary()

    def parse_primary():
        nonlocal pos
        if pos >= len(tokens):
            return False

        token = tokens[pos]

        if token == "(":
            pos += 1
            result = parse_expr()
            if pos < len(tokens) and tokens[pos] == ")":
                pos += 1
            return result

        if token.startswith("any("):
            # Parse any(TAG1 OR TAG2 OR ...)
            # Collect until closing paren
            inner = token[4:]
            if inner.endswith(")"):
                inner = inner[:-1]
                pos += 1
                return inner in matched_tags
            # Multi-token any
            parts = [inner]
            pos += 1
            while pos < len(tokens):
                t = tokens[pos]
                if t.endswith(")"):
                    parts.append(t[:-1])
                    pos += 1
                    break
                if t != "OR":
                    parts.append(t)
                pos += 1
            return any(p in matched_tags for p in parts if p)

        # Simple tag reference
        pos += 1
        return token in matched_tags

    return parse_expr()


# ---------------------------------------------------------------------------
# Magnitude floor checks
# ---------------------------------------------------------------------------

def _check_magnitude_floors(
    rule: dict,
    findings: list[dict],
    matched_findings: list[dict],
) -> bool:
    """Check if magnitude floors are met for the matched findings."""
    floors = rule.get("magnitudeFloors", {})
    if not floors:
        return True

    # For continuous endpoints: check gLower > threshold
    g_lower_threshold = floors.get("gLower_down", floors.get("liver_weight_gLower_up"))
    if g_lower_threshold is not None:
        has_significant = False
        for mf in matched_findings:
            fid = mf.get("finding_id")
            f = next((x for x in findings if x.get("id") == fid), None)
            if f and f.get("max_effect_lower") is not None:
                if abs(f["max_effect_lower"]) >= g_lower_threshold:
                    has_significant = True
                    break
        if not has_significant and matched_findings:
            # Only fail if there ARE continuous endpoints to check
            continuous_matches = [
                mf for mf in matched_findings
                if mf.get("domain") in ("LB", "OM", "BW")
            ]
            if continuous_matches:
                return False

    return True


# ---------------------------------------------------------------------------
# Statistical gate (inference tier)
# ---------------------------------------------------------------------------

def _boschloo_one_sided(
    treat_affected: int, treat_n: int,
    ctrl_affected: int, ctrl_n: int,
) -> float:
    """One-sided Boschloo test: H1 is treat proportion < control proportion.

    Returns p-value for the one-sided test.
    """
    table = [[treat_affected, treat_n - treat_affected],
             [ctrl_affected, ctrl_n - ctrl_affected]]
    try:
        result = scipy_stats.boschloo_exact(table, alternative="less")
        p = result.pvalue
        if np.isnan(p):
            return 1.0
        return float(p)
    except (ValueError, ZeroDivisionError):
        return 1.0


def _check_inference_gate(
    finding: dict,
    catalog: dict,
) -> dict | None:
    """Check the AND-gate for an incidence finding (inference tier).

    Returns gate result dict or None if finding is not incidence-type.
    """
    gs = finding.get("group_stats", [])
    if len(gs) < 2:
        return None

    # Only for incidence findings (MI/MA/CL with incidence data)
    ctrl_gs = gs[0]
    high_gs = gs[-1]
    ctrl_inc = ctrl_gs.get("incidence")
    high_inc = high_gs.get("incidence")

    if ctrl_inc is None or high_inc is None:
        return None

    ctrl_n = ctrl_gs.get("n", 0)
    ctrl_affected = ctrl_gs.get("affected", 0)
    treat_n = high_gs.get("n", 0)
    treat_affected = high_gs.get("affected", 0)

    if ctrl_n == 0 or treat_n == 0:
        return None

    # Spared cases
    spared = ctrl_affected - treat_affected

    # One-sided Boschloo
    boschloo_p = _boschloo_one_sided(treat_affected, treat_n, ctrl_affected, ctrl_n)

    # Bayesian: P(treat < ctrl) = 1 - P(treat > ctrl)
    bayesian_posterior = finding.get("bayesian_posterior")
    bayesian_p_less = (1.0 - bayesian_posterior) if bayesian_posterior is not None else 0.0

    gate = catalog.get("statistical_gate", {})
    boschloo_threshold = gate.get("boschloo_p_threshold", 0.05)
    bayesian_threshold = gate.get("bayesian_posterior_threshold", 0.95)
    spared_min = gate.get("spared_cases_min", 2)
    if ctrl_n >= gate.get("spared_cases_large_n_threshold", 10):
        spared_min = gate.get("spared_cases_min_large_n", 3)

    passes = (
        boschloo_p < boschloo_threshold
        and bayesian_p_less > bayesian_threshold
        and spared >= spared_min
    )

    return {
        "passes": passes,
        "boschloo_p": round(boschloo_p, 4),
        "bayesian_p_less": round(bayesian_p_less, 4),
        "spared_cases": spared,
        "ctrl_incidence_pct": round(ctrl_inc * 100, 1),
        "treat_incidence_pct": round(high_inc * 100, 1),
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def build_protective_syndromes(
    findings: list[dict],
    dose_groups: list[dict],
    species: str | None = None,
    strain: str | None = None,
    study_type: str = "subchronic",
    mortality: dict | None = None,
    food_summary: dict | None = None,
    design_type: str = "parallel_between_group",
) -> dict:
    """Evaluate protective syndrome rules R18-R25 against study findings.

    Returns dict with:
        evidence_tier: str
        treat_n: int, ctrl_n: int
        protective_syndromes: list[dict]  -- matches with d3_pending: true
        suppression_banner: str | None
    """
    catalog = _load_catalog()
    rules = catalog["rules"]

    # Unsupported designs
    if design_type in ("within_animal_crossover", "within_animal_escalation"):
        return {
            "evidence_tier": "design_not_supported",
            "design_type": design_type,
            "treat_n": 0,
            "ctrl_n": 0,
            "protective_syndromes": [],
            "suppression_banner": None,
            "status": "PROT_DESIGN_NOT_SUPPORTED",
        }

    # N-tier routing
    tier, treat_n, ctrl_n = _determine_evidence_tier(dose_groups)

    if tier == "suppressed":
        return {
            "evidence_tier": "suppressed",
            "treat_n": treat_n,
            "ctrl_n": ctrl_n,
            "protective_syndromes": [],
            "suppression_banner": (
                f"Protective syndrome detection requires N>=5 per group. "
                f"This study has N={treat_n}/{ctrl_n}; R18-R25 are suppressed."
            ),
            "status": "PROT_SUPPRESSED_N_LT_5",
        }

    # Build study context for PEX checks
    study_ctx = {"study_type": study_type, "mortality_pct": 0, "bw_loss_pct": 0}
    if mortality:
        total_treated_deaths = 0
        total_treated_n = 0
        for dg_mort in mortality.get("per_group", []):
            if dg_mort.get("dose_level", 0) > 0:
                total_treated_deaths += dg_mort.get("deaths", 0)
                total_treated_n += dg_mort.get("n", 0)
        if total_treated_n > 0:
            study_ctx["mortality_pct"] = round(100 * total_treated_deaths / total_treated_n, 1)
        # Count dose groups with decedents
        n_dg_decedents = sum(
            1 for dg_mort in mortality.get("per_group", [])
            if dg_mort.get("dose_level", 0) > 0 and dg_mort.get("deaths", 0) > 0
        )
        study_ctx["dose_groups_with_decedents"] = n_dg_decedents

    if food_summary and food_summary.get("available"):
        assessment = food_summary.get("overall_assessment", {})
        study_ctx["food_decrease_pct"] = abs(assessment.get("max_decrease_pct", 0))

    # Check for BW loss: look at BW findings
    for f in findings:
        if f.get("domain") == "BW" and f.get("direction") == "down":
            fc = f.get("max_fold_change")
            if fc is not None and fc < 1:
                bw_loss = (1 - fc) * 100
                study_ctx["bw_loss_pct"] = max(study_ctx.get("bw_loss_pct", 0), bw_loss)

    # Check for LB lipid decrease (for PEX10 combined criterion)
    for f in findings:
        if f.get("domain") == "LB" and f.get("direction") == "down":
            tc = (f.get("test_code") or "").upper()
            if tc in ("CHOL", "TRIG", "LDL"):
                study_ctx["lb_lipid_down"] = True
                break

    # Species/strain for scope checks
    study_species = (species or "").upper()
    study_strain = (strain or "").upper()

    # Evaluate each rule
    matches = []
    from services.analysis.clinical_catalog import _check_protective_exclusion

    for rule in rules:
        rule_id = rule["syndromeId"]

        # R25 is blocked
        if rule.get("blocked_on"):
            continue

        # Species scope check
        sp_scope = rule.get("species_scope")
        if sp_scope and study_species:
            if study_species not in [s.upper() for s in sp_scope]:
                continue

        # Strain scope check
        st_scope = rule.get("strain_scope")
        if st_scope and study_strain:
            # strain_scope entries are like "SD M", "F344 M"
            # We check if study strain + sex matches any entry
            # For now, just check if the strain appears in any entry
            strain_match = any(
                study_strain.upper() in entry.upper()
                for entry in st_scope
            )
            if not strain_match:
                continue

        # R19 dependency on R18
        if rule.get("r18_dependency"):
            r18_fired = any(m["syndromeId"] == "R18" for m in matches)
            if not r18_fired:
                continue

        # Match findings to rule terms
        matched_tags, matched_findings = _match_findings_to_rule(findings, rule)

        # Evaluate required logic
        logic = rule.get("requiredLogic", {})
        expression = logic.get("expression", "")
        if not _evaluate_required_logic(expression, matched_tags):
            continue

        # Check minDomains
        matched_domains = set(mf["domain"] for mf in matched_findings)
        if len(matched_domains) < rule.get("minDomains", 1):
            continue

        # Magnitude floor check
        if not _check_magnitude_floors(rule, findings, matched_findings):
            continue

        # PEX checks
        pex_status = []
        pex_excluded = False
        for mf in matched_findings:
            fid = mf.get("finding_id")
            f = next((x for x in findings if x.get("id") == fid), None)
            if f:
                result_proxy = {
                    "params": {
                        "finding": f.get("finding", ""),
                        "n_affected": sum(
                            g.get("affected", 0) for g in f.get("group_stats", [])[1:]
                        ),
                        "ctrl_pct": str(round(
                            (f.get("group_stats", [{}])[0].get("incidence", 0) or 0) * 100
                        )),
                        "dose_response_pattern": f.get("dose_response_pattern", ""),
                        "p_value": f.get("min_p_adj"),
                        "treatment_related": f.get("treatment_related", False),
                    },
                    "organ_system": f.get("organ_system", ""),
                }
                excluded, pex_id = _check_protective_exclusion(
                    result_proxy, None, rule_id=rule_id, study_context=study_ctx
                )
                if excluded:
                    pex_status.append({"finding_id": fid, "excluded": True, "pex_id": pex_id})
                    pex_excluded = True
                    break
                else:
                    pex_status.append({"finding_id": fid, "excluded": False})

        if pex_excluded:
            continue

        # Statistical gate (inference tier only)
        inference_gate_results = []
        if tier == "inference":
            # Check incidence findings through the AND-gate
            has_incidence_finding = False
            incidence_gate_passed = False

            for mf in matched_findings:
                fid = mf.get("finding_id")
                f = next((x for x in findings if x.get("id") == fid), None)
                if not f:
                    continue

                # Only apply incidence gate to MI/MA/CL/TF with incidence data
                if f.get("domain") in ("MI", "MA", "CL", "TF"):
                    gs = f.get("group_stats", [])
                    if gs and gs[0].get("incidence") is not None:
                        has_incidence_finding = True
                        gate_result = _check_inference_gate(f, catalog)
                        if gate_result:
                            inference_gate_results.append({
                                "finding_id": fid,
                                **gate_result,
                            })
                            if gate_result["passes"]:
                                incidence_gate_passed = True

            # For rules with incidence findings: gate must pass on at least one
            if has_incidence_finding and not incidence_gate_passed:
                continue

        # Build the match
        match = {
            "syndromeId": rule_id,
            "name": rule["name"],
            "category": rule.get("category", ""),
            "evidence_tier": tier,
            "confidence_ceiling": rule.get("confidence_ceiling", "MODERATE"),
            "matched_domains": sorted(matched_domains),
            "matched_endpoints": matched_findings,
            "pex_status": pex_status,
            "d3_pending": True,
        }

        if tier == "descriptive_only":
            match["qualifier"] = (
                f"Descriptive observation -- no statistical test at "
                f"N={min(treat_n, ctrl_n)}"
            )

        if inference_gate_results:
            match["inference_gate"] = inference_gate_results

        matches.append(match)

    return {
        "evidence_tier": tier,
        "treat_n": treat_n,
        "ctrl_n": ctrl_n,
        "protective_syndromes": matches,
        "suppression_banner": None,
        "status": "OK",
    }
