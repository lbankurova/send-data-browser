# FCT Band Corpus Coverage Report

**Generated:** auto via `scripts/verify_fct_lb_bw_corpus_coverage.py`

Per-entry verification of registry alignment with corpus tables in
`docs/_internal/research/fct-lb-bw-band-values.md` (sec 2.3, 2.4, 3.1).
Covers the 18 entries NOT byte-checked by `verify_fct_lb_bw_numerics.py`
(which covers sec 7.1 hepatic, 7.2 renal, 7.6 BW).

## Per-entry status

| Entry | Corpus sec | Ladder | NHP provenance | Dog provenance | Source_refs | Primary source |
|---|---|---|---|---|---|---|
| `LB.CHOL.up` | 7.3 | OK | OK | OK | OK | tox-pathology consensus (no named primary) * |
| `LB.CHOL.down` | 7.3 | OK | OK | OK | OK | tox-pathology consensus (no named primary) * |
| `LB.GLUC.up` | 7.3 | OK | OK | OK | OK | tox-pathology consensus (no named primary) * |
| `LB.GLUC.down` | 7.3 | OK | OK | OK | OK | tox-pathology consensus (no named primary) * |
| `LB.TP.down` | 7.4 | OK | OK | OK | OK | tox-pathology consensus (no named primary) * |
| `LB.ALB.down` | 7.4 | OK | OK | OK | OK | tox-pathology consensus (no named primary) * |
| `LB.WBC.up` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.WBC.down` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.RBC.down` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.HGB.down` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.HCT.down` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.PLT.down` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.RETIC.up` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.RETIC.down` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.NEUT.up` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.LYM.up` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.LYM.down` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |
| `LB.EOS.down` | 7.5 | OK | OK | OK | OK | Bourges-Abella 2015 |

## Notes

- All 18 entries have uniform ladders across rat/mouse/dog/nhp/other per corpus sec 3.3 (hematology) and sec 2.3/2.4 (chemistry uniformity).
- NHP rows carry `provenance: extrapolated` per corpus sec 5 confidence-tier map (no published NHP CVI/CVG study comparable to Bourges-Abella 2015 for dog).
- Dog hematology rows carry `provenance: industry_survey` (Bourges-Abella 2015 n=55 beagle CVs).

## Soft-citation gap

Entries marked `*` cite generic 'tox-pathology consensus' rather than naming a primary source paper. Corpus sec 5 confidence-map groups these with Hall 2012 + tox-pathology, but corpus sec 2.3 and sec 2.4 do not anchor to a specific paper. This is a corpus gap, not a registry defect: `LB.CHOL.up`, `LB.CHOL.down`, `LB.GLUC.up`, `LB.GLUC.down`, `LB.TP.down`, `LB.ALB.down`.

**Follow-up:** RG-FCT-LB-BW candidate -- elicit named primary source(s) for CHOL/GLUC/TP/ALB band thresholds, or downgrade `threshold_reliability` from `moderate` to `low` if no primary anchor exists.
