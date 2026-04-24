---
review_date: null
studies_reviewed: 16
scope_statement: |
  Scientist sign-off validates directional correctness of verdict and confidence deltas under
  FCT-verdict vs legacy |g|-ladder. Direction-sign-off validates: (a) FCT-verdict direction vs
  legacy-severity direction agrees with clinical reasoning for this finding, OR (b) the
  disagreement is attributable to a documented band-value concern that the reviewer flags via
  `magnitude_concern` for re-assessment at DATA-GAP-FCT-LB-BW-05 recalibration. Direction-sign-off
  does NOT validate: specific band numeric values (frozen at merge per Keystone 8), penalty
  constant magnitudes (pre-production, DATA-GAP-FCT-LB-BW-05), or cross-finding calibration
  (pre-production). Absolute magnitudes are subject to penalty-constant recalibration. Values in
  this packet are correct-direction, provisional-magnitude. Post-recalibration values may shift
  again without invalidating the directional conclusions of this cycle.

  `coverage: partial` for LB entries means all 5 species have numeric bands but NHP (and
  sometimes other extrapolation sources) carry `provenance: extrapolated`; reviewers
  cross-reference the reliance block (`provenance`, `threshold_reliability`) at sign-off, not
  just the top-level `coverage` label. For (species, endpoint) cells with <5 corpus findings
  (thin-coverage cells enumerated in the diff doc per AC-F4-5), band correctness is validated
  via primary-literature inheritance only, not empirical fit; reviewers weight these cells
  accordingly.

  NHP reliability sub-tiering per R1 Finding 4 -- uniformly `low` at band level is a
  conservative default; per-endpoint differentiation (e.g., NHP BUN/CREAT/TBILI as `moderate`
  because mammalian-conserved, ALT/AST/WBC/LYM as `low` because ketamine-confounded, ALP/CHOL/GLUC
  as `low` for NHP-specific biology) awaits either RG-FCT-LB-BW-01 empirical data or explicit
  reviewer override during this sign-off via `band_reclassifications`.

per_endpoint_decisions: []
# Schema (populated during review):
#   - study: str            # e.g., "TOXSCI-24-0062--35449 1 month dog- Compound B-xpt"
#     endpoint: str         # e.g., "LB.ALT.up"
#     domain: str           # LB / BW
#     species: str          # rat / mouse / dog / nhp / other
#     finding_id: str       # stable id from unified_findings.json
#     pre_verdict: str      # legacy path verdict
#     post_verdict: str     # FCT-band verdict
#     pre_severity: str     # legacy 3-value severity
#     post_severity: str    # 3-value severity post-append (byte-parity -- should be identical)
#     reviewer_decision: str  # accept / reject / provisional_ok
#     rationale: str
#     finding_id_group: null or str   # allow identical-rationale collapse
#     magnitude_concern: null or str  # populated entries trigger DATA-GAP-FCT-LB-BW-05 (c)

band_reclassifications: []
# Schema (populated if reviewer proposes amendments -- Keystone 8 revisable):
#   - entry_key: str        # e.g., "LB.BUN.up"
#     field: str            # e.g., "threshold_reliability" or "bands.nhp.adverse_floor"
#     pre_value: any
#     post_value: any
#     rationale: str

approval:
  status: null   # approved | approved_with_amendments | rejected
  amendments: []
  reviewers: []  # list[str] -- must match docs/_internal/knowledge/approved-toxicology-reviewers.yml
                 # when that allowlist ships (parent cycle Phase B); cycle merges without
                 # allowlist enforcement but the STRUCTURE is forward-compatible.
---

# FCT LB + BW Migration Sign-Off Packet

**Purpose:** scientist review packet for the LB + BW band append. Unblocks parent cycle
`species-magnitude-thresholds-dog-nhp` Phase B rewire (classify_severity, D6/D4, R10/R11,
NOAEL cascade).

**Merge gate:** PR cannot merge until `approval.status: approved` above. `approved_with_amendments`
applies amendments in the same PR and re-runs the regen/diff before merge.

## Review process

1. Read `docs/validation/fct-migration-diff-lb-bw.md` (auto-generated).
2. For each row whose verdict OR severity shifted pre/post append, add a `per_endpoint_decisions`
   entry above. Identical-rationale findings may be collapsed via `finding_id_group`.
3. For any band-value concern that surfaces during review, EITHER:
   - Add a `band_reclassifications` entry (in-PR amendment; e.g., flip NHP BUN reliability to
     `moderate` per R1 Finding 4 sub-tiering), OR
   - Flag the specific finding's `magnitude_concern` in its `per_endpoint_decisions` row and
     route to DATA-GAP-FCT-LB-BW-05 recalibration queue.
4. Set `approval.status` and list reviewers (length >= 1 for merge; >= 2 distinct reviewers per
   study to count toward DATA-GAP-FCT-LB-BW-05 trigger (a) 10-study recalibration threshold).
5. Check dose-level byte-parity table in the diff doc (AC-F4-2 hard gate). Any FAIL rows block
   merge regardless of sign-off status.
6. Check legacy severity byte-parity table (AC-F4-1 hard gate). Any FAIL rows block merge.

## Scope boundaries (what this sign-off does NOT cover)

- **Specific band numeric values**: frozen at merge per Keystone 8. Amendments go via
  `band_reclassifications` above, not by editing the registry directly.
- **Penalty constant magnitudes** (`penalty_large_effect_non_sig = 0.15`): pre-production,
  DATA-GAP-FCT-LB-BW-05 recalibration when triggered.
- **Cross-finding calibration**: pre-production; each finding reviewed in isolation.
- **Frontend changes**: none in this cycle; phase B parent cycle wires UI consumers.

## Expected outcomes (pre-production check)

- LB findings with up/down direction + valid stats: shift from `coverage: none` / `verdict:
  provisional` (legacy |g|-ladder) to `coverage: partial` / `verdict: {variation, concern,
  adverse, strong_adverse}` (FCT bands).
- NHP LB findings: `provenance: extrapolated`, `threshold_reliability: low`. Reviewer may
  propose per-endpoint sub-tiering via `band_reclassifications`.
- BW findings: `coverage: full` now (5-species bands). NHP: `provenance:
  stopping_criterion_used_as_proxy`, 6%/week safety cutoff.
- Dog ALT fixture (TOXSCI-35449): `|g|=1.71` finding previously `verdict: adverse` via
  |g|>=1.0 ladder; now `verdict: adverse` via 3x fold threshold. Same direction; different
  provenance path. Visible product-thesis payoff.
- Legacy `severity` 3-value field: byte-equal pre/post (AC-F4-1 hard gate; `classify_severity`
  is NOT rewired in this cycle).
- `noael_dose_level` / `loael_dose_level`: byte-equal pre/post (AC-F4-2 hard gate, scoped;
  `_is_loael_driving` reads `finding_class` / `severity` only).
- `noael_confidence`: explicitly scoped OUT of byte-parity. Shifts are the designed cascade of
  Phase A's shipped verdict-consumer wiring (`_compute_noael_confidence` at
  `view_dataframes.py:1198-1208`). Each row in the diff doc's gating_mechanism table indicates
  which penalty-gate drove the shift.

## Unblock: Phase B parent cycle

Signed-off sign-off with `approval.status: approved` (or `approved_with_amendments` with
amendments applied) unblocks:

- parent F3 `classify_severity()` call-site rewire (GAP-SMT-BP-04..07)
- parent F4 D6/D4 confidence rewire
- parent F5 R10/R11 signal-scoring rewire
- parent F6 NOAEL cascade M2-folded
- parent F9 UI FCT pane + provisional verdict badge

## Research gaps for follow-up cycles (persisted during blueprint)

- RG-FCT-LB-BW-01..20 in `docs/_internal/research/REGISTRY.md` (NHP CV decomposition, electrolyte
  bands, muscle/pancreatic enzymes, joint rules for Hy's Law + stress-leukogram + C-ALP + BUN
  prerenal, rodent-specific CV calibration, geographic origin stratification)
- DATA-GAP-FCT-LB-BW-01..05 in `docs/_internal/TODO.md` (concrete trigger conditions)
