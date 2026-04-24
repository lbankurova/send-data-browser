# FCT Phase B — M4 Public-Dataset Fixture Selection

**Topic:** `species-magnitude-thresholds-dog-nhp`
**Phase:** B (F1 + F3 + F3b + F4 + F5 + F6 atomic PR)
**Spec:** `docs/_internal/incoming/species-magnitude-thresholds-dog-nhp-synthesis.md` AC-F3-5 / M4
**Status:** Dog coverage resolved. NHP gap documented (unblockable without sourcing new data).

---

## Summary

| Dimension | Resolution |
|-----------|-----------|
| Dog fixture | **`TOXSCI-24-0062--35449 1 month dog- Compound B-xpt`** (primary) + `TOXSCI-24-0062--43066 1 month dog- Compound A-xpt` (secondary) |
| NHP fixture | **None — gap accepted.** No NHP severity-classifier-suitable study in the 16-study corpus. See §3. |
| BioCelerate | Not pursued — consortium membership required; no access at this time |
| eTRANSAFE | Not pursued — IMI2 consortium access agreement required; no access at this time |

M4 is satisfied by the dog selection. The NHP gap is real and documented — Phase B scientist sign-off proceeds without NHP fixture coverage, with all NHP findings carrying `provenance: extrapolated` as an honest-uncertainty flag.

---

## 1. Dog fixture — primary: `toxsci-35449-dog-cmpb`

**Source.** TOXSCI-24-0062 publication (cross-study analysis dataset). Real study data, publication-backed, no study report (nSDRG only). Paired with rat Compound B study (87497) for cross-species comparison.

**Design.**
- Species: **Beagle dog** (species category `dog` per `resolve_species_category`).
- Route: oral gavage.
- Groups: 4 (0 / 3 / 18 / 356 mg/kg/day) — **119x dose range**.
- N: 6/group main (3M+3F); 4/group recovery (2M+2F).
- Duration: 4 weeks + 4-week recovery.
- Pharmacology: IDO1 inhibitor (6576).

**Endpoint coverage** (from regenerated `unified_findings.json`, 2026-04-22):

| Target endpoint (per spec AC-F3-5) | Count | Evidence |
|-----------------------------------|-------|----------|
| LB ALT — dog | 13 findings | **1 `tr_adverse`** (M, g=1.71, p=0.017, Hall 2012 threshold exceeded). Multiple equivocal at mid doses. |
| OM LIVER — dog | 6 findings | **1 `tr_adverse`** (M, pct_change=29.5%, p=0.048). 1 equivocal at pct_change=32% (above dog adverse_floor=25% but p=0.072). Exactly the FCT-vs-|g|-proxy zone the Phase B spec targets. |
| BW — dog | 17 findings | Multiple findings with \|g\| > 1.0 (largest: \|g\|=1.14 warning). Exercises BW classifier severity bands. |

**Total findings:** 862 across 10 domains (LB, OM, MI, MA, BW, CL, EG, VS, BG, FW).

**Why primary:** highest-density coverage of the three most-shifted endpoints named in the Phase B spec. Dose range spans the full FCT classification ladder (variation → concern → adverse → strong_adverse).

---

## 2. Dog fixture — secondary: `toxsci-43066-dog-cmpa`

**Source.** TOXSCI-24-0062 publication (Compound A companion). Paired with rat Compound A (96298).

**Design.**
- Beagle dog, oral gavage.
- Groups: 4 (0 / 25 / 50 / 100 mg/kg/day) — **4x dose range**.
- N: 6/group main; 4/group recovery (3 recovery pairs — unusual).
- Duration: 1 month + 2-week recovery.
- Sex-divergent NOAEL (M: below range; F: 25 mg/kg/day).

**Endpoint coverage:**

| Target endpoint | Count | Evidence |
|-----------------|-------|----------|
| LB ALT — dog | 6 findings | **2 `tr_adverse`**. Additional signal below 25% adverse threshold. |
| OM LIVER — dog | 6 findings | **0 adverse** — max pct_change = 19.5% (M), within 10–20% "middle zone" below dog adverse_floor. Useful for Phase B to confirm FCT classifier correctly classifies these as `concern` or `variation`, not `adverse`. |
| BW — dog | 21 findings | Multiple shifts; exercises the bands. |

**Why secondary:** exercises the sub-adverse zone (10–25% OM liver change) where FCT-vs-|g| diverge most sharply. Complements cmpb's adverse-zone exercise. Together the two studies span the full band ladder.

---

## 3. NHP gap — accepted, documented

### 3.1 What we looked at

Four NHP studies in the 16-study corpus. None is severity-classifier-suitable:

| Study | Species | Why unsuitable |
|-------|---------|----------------|
| `CJUGSEND00` | Cynomolgus | **CV safety pharm only** (CV/EG/RE/VS domains). No OM, no MI, no LB → no severity classification surface. Within-subject dose escalation (N=4). |
| `FFU-Contribution-to-FDA` | Cynomolgus | **Multi-compound study** — 3 test articles across groups. N=2/group (below N=3 threshold for small-N statistics). Female-only. Confounded severity calibration. |
| `CBER-POC-Pilot-Study1-Vaccine` | Cynomolgus | **Single-arm vaccine immunogenicity** study, no control, not a tox study. |
| `CBER-POC-Pilot-Study3-Gene-Therapy` | Cynomolgus | **AAV gene therapy**, 2 treatment groups, no vehicle control. Non-GLP. N=3/group, males only. "No adverse findings noted" per report — no severity gradient to calibrate against. |

### 3.2 Why we aren't sourcing new NHP data

1. **PhUSE Goldilocks** — does not include a standard repeat-dose NHP toxicity study. The four NHP-adjacent PhUSE datasets are safety-pharm (CJUGSEND00), CV telemetry (CDISC-SafetyPharmacology-POC is dog), or non-tox vaccine/gene-therapy designs.
2. **BioCelerate** — consortium membership required; no project access.
3. **eTRANSAFE** — IMI2 consortium access agreement required; no project access.
4. **FDA submission portal** — SEND submissions from real IND/NDA packages are sponsor-confidential.

### 3.3 Impact on Phase B sign-off

All NHP findings emitted by classify_severity in the Phase B rewire will carry:

- `provenance: extrapolated` (entry-level, weakest-of across species — honest-uncertainty default per spec §F2)
- `coverage: none` for spleen/thymus/lungs/pancreas (Tier C qualitative per Amato 2022)
- `fallback_used: true` where the FCT species band is null
- `verdict: provisional` (5-value vocabulary) where no numeric bands exist

**Scientist sign-off instruction:** NHP severity classifications are unsupported by fixture evidence. Reviewers must treat them as "calibration pending" rather than as validated output. The `provisional` verdict + `provenance: extrapolated` flags make this machine-readable; the `fct-migration-signoff.md` YAML front-matter should note NHP coverage as `fixture_exercised: false`.

**Downstream paths to close the NHP gap** (tracked, NOT required for Phase B ship):

- Future cycle sources an NHP public dataset (DATA-GAP-SMT-BP-02 / RG-SMT-BP-04 consolidate).
- Research partnership with BioCelerate / eTRANSAFE / academic labs with licensable NHP SEND data.
- Expert elicitation (M3 parallel track, F10 methodology paper) to populate NHP FCT bands with formally-sourced values rather than fixture-derived ones.

### 3.4 Decision log

> 2026-04-22 — After reviewing all 16 studies in the corpus, no NHP study is severity-classifier-suitable. Pursuing BioCelerate / eTRANSAFE requires consortium access this project does not hold. Phase B ships with dog fixture only; NHP findings carry `provenance: extrapolated` and `verdict: provisional` as honest-uncertainty flags. User-acknowledged; NHP gap is an accepted residual limitation, not a blocking dependency.

---

## 4. Phase B diff review artifact

Pre-production project, single decision-maker. The spec's original formal sign-off machinery (`approved-toxicology-reviewers.yml` allowlist + `validate-fct-signoff.sh` pre-commit hook + YAML front-matter with per-finding reviewer decisions) is scaffolding for a regulatory workflow this project doesn't yet have. **Not built.** See `docs/_internal/architecture/fct-registry.md` § "Phase B sign-off gate — pre-production reality" for rationale.

Phase B produces a plain markdown reviewer-facing artifact:

**`docs/validation/fct-migration-diff.md`** (authored by the Phase B cycle):

1. **4-cell severity distribution shift table** per study (`normal` / `warning` / `adverse` / `not_assessed`, pre-migration count vs post-migration count). One table per study × 16 studies.
2. **Highlight section** for surprising shifts — cells where the delta exceeds `max(3 findings, 5% of pre-count, 10% relative of pre-count)` per spec AC-F3b-4.
3. **NOAEL shift table** per study per sex: pre-migration NOAEL dose step vs post-migration. Flag any ≥1 dose-step shifts.
4. **Provisional-verdict inventory** — per-study count of NHP findings now carrying `verdict: provisional` (no numeric FCT band), split by organ/endpoint.
5. **Dog fixture endpoint detail** — for `TOXSCI-35449 cmpb` and `TOXSCI-43066 cmpa`, a direct table of the spec's three target endpoints (LB ALT, OM LIVER, BW) showing pre/post severity + verdict for each finding.

Reviewer workflow (user):

1. Open `fct-migration-diff.md`
2. Scan distribution shifts — do the cells that changed match scientific expectation?
3. Inspect the dog fixture detail — do `TOXSCI-35449`'s 1 ALT adverse and 1 OM liver adverse stay adverse? Do equivocal findings in the 10-25% OM liver zone resolve sensibly?
4. Check NHP provisional inventory — unsurprising for spleen/thymus/lungs/pancreas (Tier C qualitative); flag anything else as needing investigation.
5. Accept or reject the PR.

No YAML front-matter. No allowlist. No hook. If rejected, Phase B branch holds until the underlying issue (FCT band values, classifier logic, etc.) is corrected.

---

## 5. Update path

Updating this document requires:

- Adding a new dog study to the corpus → append to §1 or §2 with endpoint-shift evidence from the study's `unified_findings.json`.
- Sourcing an NHP study → replace §3.1 with the new study's characterisation; update §4 to describe NHP exercise in the diff artifact.
- Deciding to pursue consortium access → update §3.2 row status.
- Project reaching regulatory-submission scale → reinstate the formal machinery described in `architecture/fct-registry.md` § "Phase B sign-off gate" as future scaffolding, with named reviewer allowlist and hook-enforced front-matter contract.

---

## 6. LB + BW band coverage status (fct-lb-bw-band-values cycle, 2026-04-23)

Dog ALT fixture consumption transitions — documented here so future readers can trace the handoff from Phase A (shipped registry infrastructure, no LB/BW bands) to the fct-lb-bw-band-values cycle (populated LB chem + LB hem + BW per-species bands):

| Entry | Pre-append state (Phase A) | Post-append state (fct-lb-bw-band-values) |
|---|---|---|
| `LB.ALT.up` | `coverage: "none"`, `fallback_used: true`, `provenance: "extrapolated"`, verdict derived from legacy \|g\|-ladder | `coverage: "partial"`, `fallback_used: false`, species-resolved provenance (dog: `regulatory`, nhp: `extrapolated`), verdict from 1.5/2.0/3.0/5.0 fold bands (dog: 1.8 ceiling) |
| `LB.AST.up`, `LB.TBILI.up`, `LB.ALP.up`, `LB.GGT.up`, `LB.BUN.up`, `LB.CREAT.up`, `LB.CHOL.{up,down}`, `LB.GLUC.{up,down}`, `LB.TP.down`, `LB.ALB.down` | Same as above | Populated per research §2 / §7 |
| 12 LB hematology entries (`LB.WBC.{up,down}`, `LB.RBC.down`, `LB.HGB.down`, `LB.HCT.down`, `LB.PLT.down`, `LB.RETIC.{up,down}`, `LB.NEUT.up`, `LB.LYM.{up,down}`, `LB.EOS.down`) | Same as above | Populated per research §3.1 (Bourges-Abella 2015 dog primary; rat/mouse best_practice extrapolated; NHP extrapolated with ketamine + small-n flags) |
| `BW.BODYWEIGHT.down` | Missing entry (no bands) | 5-species bands per research §4 (OECD TG 407/408 regulatory for rat/mouse/dog/other; NHP stopping_criterion_used_as_proxy 6%/week) |

**Fixture-selection rationale update:** the dog ALT fixture (TOXSCI-35449 `|g|=1.71` finding) now consumes populated FCT bands (dog adverse_floor 3.0x) rather than falling through to the legacy |g|-ladder. The 29.5% pct_change OM LIVER finding remains covered by the Phase A OM entries (unchanged). Post-append diff doc at `fct-migration-diff-lb-bw.md` documents the verdict transitions per study.

**Sign-off path:** see `fct-migration-signoff.md` sibling doc. Sign-off gates parent cycle's Phase B rewire of `classify_severity`, D6/D4, R10/R11, and NOAEL cascade.
