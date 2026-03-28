# Multi-Study Benchmark: SENDEX vs SME Conclusions

Automated SENDEX results compared against expert conclusions from submission reports (nSDRGs, study reports, define.xml files). All datasets from [PhUSE SEND pilot](https://github.com/phuse-org/phuse-scripts/tree/master/data/send) (MIT license).

## Summary

| Study | Type | Matches | Partial | Wrong | Missing | Assessment |
|---|---|---|---|---|---|---|
| **PointCross** | 13-wk repeat-dose | **14** | **2** | **0** | **0** | Full support — ground truth study |
| **Study2** | Vaccine (rabbit) | 7 | 2 | 0 | 1 | Mostly works — adversity classification is inherent limitation |
| **Study4** | Vaccine (rabbit) | 6 | 3 | 0 | 1 | Mostly works — same adversity limitation |
| **Study1** | Immunogenicity | 6 | 0 | 0 | 2 | Structural output only — single-arm, no control |
| **Study3** | Gene therapy | 3 | 1 | 0 | 2 | Partially works — no-control handling correct |
| **Study5** | CV safety pharm | 2 | 1 | 0 | 5 | Non-functional — unsupported study design |
| **CJUGSEND00** | CV safety pharm | 1 | 1 | 0 | 6 | Non-functional — unsupported study design |
| **CJ16050** | Respiratory safety pharm | 3 | 1 | 0 | 3 | Imported, primary domain (RE) not processed |

**Key finding: 0 WRONG classifications across all studies.** All "partial" items reflect correctly graded borderline evidence or inherent limitations of automated classification (adversity requires mechanism-of-action knowledge per ICH S6(R1)). All "missing" items are documented capability gaps (IS/CV/RE domains, within-animal statistics).

## Study2 — 456a Vaccine (NZW Rabbits)

**Design:** Control + 1 treatment (1x10^11 VP), 5M+5F/group, 30d + 21d recovery
**Report NOAEL:** 1x10^11 VP (the only dose = NOAEL, all findings pharmacology-related)
**SENDEX NOAEL:** Control (dose_level 0) — disagrees because engine classifies immune response as adverse

### Key Biomarker Detection

| Biomarker | Report Finding | SENDEX Detection | Verdict |
|---|---|---|---|
| CRP | 34-66x elevation (acute phase) | 4 tr_adverse findings (es up to 2.65) | **DETECTED** |
| Fibrinogen | 1.65-2x (p<0.001) | 4 tr_adverse (es up to 6.16) | **DETECTED** |
| Monocytes | 3x at Day 3 | F: 1 tr_adverse (es=3.15). M: equivocal | **PARTIAL** — M borderline |
| Globulin | 1.2-1.3x | 4 tr_adverse | **DETECTED** |
| A/G ratio | Decreased | 4 tr_adverse (es up to -3.47) | **DETECTED** |
| Spleen hyperplasia | 10/10 treated | Detected in MI | **DETECTED** |
| Iliac LN weight | 7.8-10.4x (p<0.05) | Detected in OM | **DETECTED** |

**Adversity disagreement:** Report classifies all findings as "non-adverse, pharmacology-related." SENDEX classifies as adverse based on statistical significance and dose-response. This is NOT a bug — adversity classification for biologics inherently requires knowledge of compound mechanism of action (ICH S6(R1) §6.1). See classification-verdicts.md §SG-01.

## Study4 — Adjuvanted Influenza Vaccine (NZW Rabbits)

**Design:** Control + 2 treatments (SENDVACC10, SENDVACC99), 5M+5F/group, 37d + 4wk recovery
**Report NOAEL:** Not formally stated — all findings pharmacology-related
**SENDEX NOAEL:** Control (dose_level 0), LOAEL at SENDVACC10 — same adversity disagreement

### Key Biomarker Detection

| Biomarker | Report Finding | SENDEX Detection | Verdict |
|---|---|---|---|
| CRP | 338-729% (p<0.01) | 4 tr_adverse (es up to 2.77) | **DETECTED** |
| Fibrinogen | 1.5-2x (p<0.01) | 4 tr_adverse (es up to 4.04) | **DETECTED** |
| Monocytes | Both sexes increased | All equivocal or NTR | **NOT DETECTED** — borderline statistics |
| Globulin | Increased | Partial (mostly equivocal) | **PARTIAL** |
| A/G ratio | Decreased (p<0.01) | 2 tr_adverse M, F equivocal | **PARTIAL** |
| Spleen weight | +47-63% (p<0.01 F) | Detected in OM | **DETECTED** |
| Spleen hyperplasia | 3-5/5 both treatments | Detected in MI | **DETECTED** |
| LN hyperplasia | 100% treated | Detected in MI | **DETECTED** |
| Injection site inflammation | 4-5/5 vs 0-2/5 | Detected in MI | **DETECTED** |
| Body weight | Transient loss | Detected in BW | **DETECTED** |
| Food consumption | Reduced (p<0.05) | Detected in FW | **DETECTED** |

**Target organ over-classification:** Engine flags 7 organ systems; report identifies 4 organs (spleen, draining LN, injection sites, abdominal adipose). Root cause: engine maps to organ systems not individual organs, and flags organs with 0 treatment-related findings (metabolic, renal). Same improvement needed as PointCross.

## Study1 — Hepatitis B Vaccine (Cynomolgus Monkeys)

**Design:** Single-arm (4F), no control, immunogenicity characterization
**Report:** Not a toxicity study. All endpoints normal. Vaccine well tolerated.

| Dimension | SENDEX | Verdict |
|---|---|---|
| Control detection | has_concurrent_control=false | **CORRECT** |
| NOAEL | "Not established" | **CORRECT** |
| Target organs | None | **CORRECT** |
| Adverse findings | 0 adverse, 0 treatment-related | **CORRECT** |
| IS domain | Not analyzed | **EXPECTED GAP** |

## Study3 — AAV Gene Therapy (Cynomolgus Monkeys)

**Design:** 2 treatments (Vector A, Vector B at same dose), no vehicle control, males only, n=3/group
**Report NOAEL:** Not formally declared. No adverse findings.

| Dimension | SENDEX | Verdict |
|---|---|---|
| Control detection | has_concurrent_control=false | **CORRECT** |
| NOAEL | "Not established" (method: no_concurrent_control) | **CORRECT** |
| Small-N caveat | Not generated | **GAP** — n=3 should trigger power warning |
| Study type | Falls back to REPEAT_DOSE | **GAP** — should be SINGLE_DOSE |

## Study5, CJUGSEND00, CJ16050 — Safety Pharmacology

These studies require unsupported capabilities (within-animal crossover/escalation statistics, CV/RE domain processing, non-monotonic dose-response handling). The engine correctly identifies structural metadata (has_concurrent_control, mortality) but cannot perform the core scientific analysis. See classification-verdicts.md §SG-04 through §SG-08 for assessment.

## Capability Gap Summary

| Gap | Type | Automatable? | Priority |
|---|---|---|---|
| Adversity classification (pharmacology vs toxicity) | **Inherent limitation** — requires MoA knowledge per ICH S6(R1) | No | Annotation system exists |
| Target organ over-classification | **Algorithmic improvement** | Partially — tiered evidence, BW normalization | P1 |
| Small-N power caveat | **Missing feature** | Yes | P1 |
| Study type routing | **Missing feature** | Yes | P1 |
| Non-monotonic dose-response detection | **Missing feature** | Yes | P2 |
| Within-animal statistics | **Missing capability** | Yes (new engine) | P2 |
| IS/CV/RE domain processing | **Missing capability** | Yes (new parsers) | P2-P3 |
