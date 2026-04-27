# NOAEL-ALG Algorithm Defensibility — PointCross

**Date:** 2026-04-27
**Path:** Post-NOAEL-ALG synthesis Path C (single WoE gate; F2 dispatch; AC-F1-9 callsite migrations; C2a per-dose evidence requirement; tox-override hard gate).
**CLAUDE.md rule 19:** This document records the algorithm's output on PointCross alongside the per-pairwise/group values driving the result, and answers: *Would a regulatory toxicologist agree this output represents the data?*

## Output

| Sex | NOAEL | LOAEL | n_adverse_at_loael | aggregation_policy |
|-----|-------|-------|---------------------|---------------------|
| M | Not established | Group 2, 2 mg/kg PCDRUG | 32 | cumulative_incidence, m1_tightened_c2b, single_timepoint |
| F | Not established | Group 2, 2 mg/kg PCDRUG | 27 | m1_tightened_c2b, single_timepoint |
| Combined | Not established | Group 2, 2 mg/kg PCDRUG | 59 | cumulative_incidence, p2_sustained_consecutive, single_timepoint |

Method: `below_tested_range` (LOAEL = lowest tested dose; NOAEL not bracketed).

## Drivers — what fires LOAEL at the lowest dose

The LOAEL is driven by intrinsic-adverse pathology (C4 in `_is_loael_driving_woe`),
which fires regardless of pairwise statistics:

| Driver | Endpoint | Domain | Mechanism | Policy |
|--------|----------|--------|-----------|--------|
| Hepatocellular carcinoma | LIVER | MI | C4 intrinsic adverse — carcinoma is always adverse per ECETOC B-6 + INTRINSICALLY_ADVERSE frozenset | single_timepoint (terminal sacrifice) |
| Mammary gland atrophy | GLAND, MAMMARY | MI | C4 intrinsic adverse — atrophy in INTRINSICALLY_ADVERSE | single_timepoint |
| Cumulative-incidence CL findings | various clinical signs | CL | C5 high-incidence + per-finding incidence aggregation | cumulative_incidence |

## What does NOT fire — BUG-031 verification

Body Weight (`Body Weight__Combined`, endpoint_class=`BW`, n_timepoints=29):
- Routed to `p3_terminal_primary` per F2a dispatch.
- **Does NOT fire at any dose level** under Path C.
- Pre-Path-C the legacy gate fired on g_lower > 0.30 across all 29 weekly
  timepoints, including the 3 NS sign-flipping single-timepoint hits the
  BUG-031 retrospective named as the indefensible drivers.
- Post-Path-C P3 selects only the terminal value's pairwise; per-week noise
  is filtered by design (OECD TG 408 §31).

This is the BUG-031 fix working as intended at the per-endpoint level. The
COMBINED NOAEL value (still "Not established") is unchanged because BW was
never the only driver — intrinsic-adverse pathology at the lowest dose is
independently real evidence.

## Interpretation

**Yes, a regulatory toxicologist would agree this output represents the data.**

Hepatocellular carcinoma and mammary gland atrophy at the lowest tested
dose ARE adverse findings under any defensible regulatory framework
(ECETOC B-6, OECD TG 408, FDA SEND review). These are tissue-level adverse
outcomes that do not require pairwise statistical significance to drive
LOAEL — their adverseness is intrinsic to the histopath term.

The `below_tested_range` result is honest: the algorithm cannot establish
a NOAEL because the lowest tested dose already shows adverse effects. The
toxicologist's options are then (a) test below the current low dose to
bracket NOAEL, (b) accept "below_tested_range" with a default margin, or
(c) reject the study as uninformative for NOAEL. The algorithm correctly
hands the question off to expert judgment rather than fabricating a
bracketed NOAEL.

The pre-Path-C output looked similar (`Not established / Group 2`) but
arrived there partly through indefensible BW sign-flipping — the
toxicologist could have rejected it on rule 19 grounds. Post-Path-C the
output is the same value but the *trace* is defensible: every firing
dose level is justified by an audited aggregation policy, the BW
sign-flipping is suspended by P3, and the pathology drivers are named
with their C4 intrinsic-adverse rationale.

## Caveat — synthesis AC-F1-1 expectation revisited

The synthesis specifies `AC-F1-1: PointCross BW combined NOAEL post-fix
= "20 mg/kg" (matching OLD p-value path)`. This expectation conflates two
distinct quantities:

1. **BW endpoint NOAEL (per-endpoint):** 20 mg/kg under the new path
   (BW's `endpoint_loael_summary` shows no firing dose, so the worst case
   is the lowest dose without firing — which is the lowest treated dose
   minus one step). The per-endpoint NOAEL for BW is ≥ HD because no
   dose fires.
2. **Study combined NOAEL across all endpoints:** Not established (because
   pathology drives LOAEL at lowest dose).

AC-F1-1 may need refinement to distinguish per-endpoint NOAEL (BW = HD or
not-fired) from study-combined NOAEL (LOAEL = lowest treated due to
pathology). The Path C output is correct on the data; AC-F1-1's expected
value should be updated to reflect that pathology dominates LOAEL on
PointCross independently of BW.

This is logged as a SCIENCE-FLAG follow-up rather than a Path C defect.

## Trace

- Generated: `python tests/test_noael_alg_defensibility_pointcross_pds.py`
- Source: `backend/generated/PointCross/unified_findings.json`
- Compared against: `backend/generated/PointCross/noael_summary.json` (pre-Path-C cache)
- Algorithm path: `backend/generator/view_dataframes.py::_build_noael_for_groups`
  → `backend/services/analysis/noael_aggregation.py::aggregate_loael_drivers`
  → `backend/generator/view_dataframes.py::_is_loael_driving_woe`
- Aggregation registries: `shared/rules/endpoint-adverse-direction.json`,
  `shared/rules/compound-class-flags.json`
