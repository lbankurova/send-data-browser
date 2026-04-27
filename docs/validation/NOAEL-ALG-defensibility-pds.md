# NOAEL-ALG Algorithm Defensibility — PDS

**Date:** 2026-04-27
**Path:** Post-NOAEL-ALG synthesis Path C.
**CLAUDE.md rule 19:** Second-study verification required for any algorithmic-code change to NOAEL determination. PointCross is the BUG-031 case; PDS provides independent evidence.

## Output

| Sex | NOAEL | LOAEL | n_adverse_at_loael | aggregation_policy |
|-----|-------|-------|---------------------|---------------------|
| M | Not established | Low | 54 | cumulative_incidence, m1_tightened_c2b, single_timepoint |
| F | Not established | Low | 67 | m1_tightened_c2b, p2_sustained_consecutive, single_timepoint |
| Combined | Not established | Low | 121 | cumulative_incidence, m1_tightened_c2b, p2_sustained_consecutive, single_timepoint |

Method: `below_tested_range`.

## Drivers — what fires LOAEL at the lowest dose

| Driver | Endpoint | Domain | Mechanism | Policy |
|--------|----------|--------|-----------|--------|
| Necrosis | KIDNEY | MI | C4 intrinsic adverse | single_timepoint (terminal) |
| Vacuolization | GLAND, ADRENAL | MI | C5 high-incidence histopath gate (≥50% treated, 0% control) | single_timepoint |
| Sustained P2 firings | LB / FW | LB-multi, FW (n_timepoints≥3) | C1+C2b across 2+ consecutive timepoints with direction-consistency (C6) | p2_sustained_consecutive |
| Cumulative incidence | CL findings | CL | C5 cumulative-incidence aggregation | cumulative_incidence |

## P2 sustained_consecutive validation

This study exercises the P2 multi-timepoint policy (LB-multi / FW with
≥3 timepoints) — a path that PointCross does not exercise as deeply
because most PointCross findings are single-timepoint pathology. PDS
F-row Combined fires P2 at all three treated dose levels (`sustained = [1, 2, 3]`),
demonstrating that:
- C6 direction-consistency does not falsely suppress real signals when
  direction is genuine (run is direction-consistent).
- Sustained ≥M=2 consecutive firing is detected correctly.

## Interpretation

**Yes, a regulatory toxicologist would agree this output represents the data.**

Renal necrosis at the lowest tested dose is an intrinsic-adverse outcome.
Adrenal vacuolization at high incidence is a recognized adverse pathology
endpoint. Sustained lab-chemistry signals at multiple consecutive
timepoints are real treatment-related effects. The P2 policy fires only
when direction is consistent across the run — pure statistical fluctuation
would not typically produce direction-consistent multi-timepoint runs.

The `below_tested_range` result is honest: the lowest tested dose already
exhibits multiple independent adverse signal classes (pathology +
sustained chemistry + cumulative clinical-sign incidence). The
toxicologist's interpretation is "no NOAEL bracketable from this study;
need lower-dose data."

## Trace

- Generated: `python tests/test_noael_alg_defensibility_pointcross_pds.py`
- Source: `backend/generated/PDS/unified_findings.json`
- Compared against: `backend/generated/PDS/noael_summary.json` (pre-Path-C cache: also `below_tested_range / Low`).
