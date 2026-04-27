---
review_date: null
studies_reviewed: 16
scope_statement: |
  Dev sign-off validates directional correctness of verdict deltas under
  FCT-verdict vs legacy |g|-ladder, plus corpus-grounded plausibility of the
  underlying band registry. Direction-sign-off validates: (a) FCT-verdict
  direction vs legacy-severity direction agrees with the corpus-predicted
  shift pattern (legacy-adverse with |g|>=1.0 but fold<3.0 should DOWNGRADE
  to FCT-concern/variation -- the intended scientific correction), OR
  (b) the disagreement is attributable to a documented band-value concern
  flagged for follow-up.

  Direction-sign-off does NOT validate: specific band numeric values
  (frozen at merge per Keystone 8 -- amendments via follow-up cycle),
  penalty constant magnitudes (pre-production), or cross-finding calibration.
  Values in this packet are correct-direction, provisional-magnitude.

  `coverage: partial` for LB entries means all 5 species have numeric bands
  but NHP (and sometimes other extrapolation sources) carry
  `provenance: extrapolated`; reviewer cross-references the reliance block
  (`provenance`, `threshold_reliability`) at sign-off, not just the top-level
  `coverage` label. For (species, endpoint) cells with <5 corpus findings
  (thin-coverage cells enumerated in the diff doc per AC-F4-5), band
  correctness is validated via primary-literature inheritance only, not
  empirical fit.

  NHP reliability sub-tiering -- uniformly `low` at band level is a
  conservative default; per-endpoint differentiation (e.g., NHP BUN/CREAT/TBILI
  as `moderate` because mammalian-conserved, ALT/AST/WBC/LYM as `low` because
  ketamine-confounded) awaits RG-FCT-LB-BW-01 empirical data.

per_endpoint_decisions:
  - study: "TOXSCI-24-0062--96298 1 month rat- Compound A xpt"
    endpoint: "LB.ALT.down"
    finding_id: "fdfe96cff3c0"
    pre_verdict: "adverse"
    post_verdict: "variation"
    decision: "flag"
    rationale: |
      ALT.down has no FCT band in registry (corpus §7.1 covers ALT.up only).
      Two sibling ALT.down rows in same study preserve legacy verdict
      correctly (adverse->adverse, concern->concern). This row diverges
      with coverage:none, effect_size null, fold null. Verdict resolution
      under coverage:none path appears to differ from legacy |g|-ladder
      output. Out of scope for band-correctness review (no band involved);
      route to follow-up cycle to investigate verdict-resolution fallback
      under coverage:none.
# Schema (populate only for direction shifts the dev wants to flag):
#   - study: str            # e.g., "TOXSCI-24-0062--35449 1 month dog- Compound B-xpt"
#     endpoint: str         # e.g., "LB.ALT.up"
#     finding_id: str       # stable id from unified_findings.json
#     pre_verdict: str      # legacy path verdict
#     post_verdict: str     # FCT-band verdict
#     decision: str         # accept (corpus-predicted) | flag (revisit later)
#     rationale: str

---

# FCT LB + BW Migration Sign-Off Packet

**Purpose:** dev review packet for the LB + BW band append. Unblocks parent cycle
`species-magnitude-thresholds-dog-nhp` Phase B rewire (classify_severity, D6/D4,
R10/R11, NOAEL cascade).

**Merge gate:** PR cannot merge until BOTH verifier scripts (sec 7.1/7.2/7.6
numerics + sec 7.3/7.4/7.5 corpus coverage) exit 0, byte-parity tables
AC-F4-1 and AC-F4-2 in the diff doc are PASS, and any `flag` decisions in
`per_endpoint_decisions` above are routed to follow-up TODOs. No human
sign-off field -- the gate is the artifact set, not a YAML toggle.

## Review process

1. Run `python scripts/verify_fct_lb_bw_numerics.py` -- byte-checks 8 entries
   (sec 7.1, 7.2, 7.6) against research-doc literal JSON. Must PASS.
2. Run `python scripts/verify_fct_lb_bw_corpus_coverage.py` -- byte-checks the
   remaining 18 entries (sec 7.3, 7.4, 7.5: CHOL, GLUC, TP, ALB, hematology)
   against the corpus tables in `docs/_internal/research/fct-lb-bw-band-values.md`
   §2.3/2.4/3.1, and verifies `source_refs` populated. Writes
   `docs/validation/fct-band-corpus-coverage.md`. Must PASS.
3. Read `docs/validation/fct-migration-diff-lb-bw.md` (auto-generated).
4. Check byte-parity hard gates (AC-F4-1 legacy severity, AC-F4-2 NOAEL
   dose-level). Any FAIL row blocks merge regardless of sign-off status.
5. Direction-shift sanity scan on diff sec 9 (Dog ALT fixture): confirm
   shifts go in corpus-predicted direction. Add `per_endpoint_decisions`
   entry only for shifts that look wrong.
6. Set `approval.status` and reviewer. Done.

## Scope boundaries (what this sign-off does NOT cover)

- **Specific band numeric values**: frozen at merge per Keystone 8. Changes
  require a follow-up cycle, not in-PR amendment here.
- **Penalty constant magnitudes** (`penalty_large_effect_non_sig = 0.15`):
  pre-production calibration.
- **Cross-finding calibration**: pre-production; each finding reviewed in
  isolation.
- **Frontend changes**: none in this cycle; phase B parent cycle wires UI consumers.

## Expected outcomes (pre-production check)

- LB findings with up/down direction + valid stats: shift from `coverage: none` /
  `verdict: provisional` (legacy |g|-ladder) to `coverage: partial` /
  `verdict: {variation, concern, adverse, strong_adverse}` (FCT bands).
- NHP LB findings: `provenance: extrapolated`, `threshold_reliability: low`.
- BW findings: `coverage: full` now (5-species bands). NHP:
  `provenance: stopping_criterion_used_as_proxy`, 6%/week safety cutoff.
- Dog ALT fixture (TOXSCI-35449): `|g|=1.71` finding previously
  `verdict: adverse` via |g|>=1.0 ladder; now `verdict: adverse` via 3x fold
  threshold. Same direction; different provenance path. Visible product-thesis
  payoff.
- Legacy `severity` 3-value field: byte-equal pre/post (AC-F4-1 hard gate;
  `classify_severity` is NOT rewired in this cycle).
- `noael_dose_level` / `loael_dose_level`: byte-equal pre/post (AC-F4-2 hard
  gate, scoped; `_is_loael_driving` reads `finding_class` / `severity` only).
- `noael_confidence`: explicitly scoped OUT of byte-parity. Shifts are the
  designed cascade of Phase A's shipped verdict-consumer wiring
  (`_compute_noael_confidence` at `view_dataframes.py:1198-1208`).

## Unblock: Phase B parent cycle

Signed-off sign-off with `approval.status: approved` unblocks:

- parent F3 `classify_severity()` call-site rewire (GAP-SMT-BP-04..07)
- parent F4 D6/D4 confidence rewire
- parent F5 R10/R11 signal-scoring rewire
- parent F6 NOAEL cascade M2-folded
- parent F9 UI FCT pane + provisional verdict badge

## Research gaps for follow-up cycles (persisted during blueprint)

- RG-FCT-LB-BW-01..20 in `docs/_internal/research/REGISTRY.md` (NHP CV
  decomposition, electrolyte bands, muscle/pancreatic enzymes, joint rules
  for Hy's Law + stress-leukogram + C-ALP + BUN prerenal, rodent-specific
  CV calibration, geographic origin stratification)
- DATA-GAP-FCT-LB-BW-01..05 in `docs/_internal/TODO.md`
