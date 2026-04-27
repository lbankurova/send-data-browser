# FCT LB + BW Migration Diff

**Generated:** auto via `scripts/compute-fct-lb-bw-migration-diff.py`
**Pre-append snapshot source:** `.lattice/fct-lb-bw-pre-append-snapshots/<study>/`
**Post-append source:** `backend/generated/<study>/`
**Studies:** 16

## Scope statement (AC-F4-7, verbatim)

> Scientist sign-off validates directional correctness of verdict and confidence deltas under FCT-verdict vs legacy |g|-ladder. Direction-sign-off validates: (a) FCT-verdict direction vs legacy-severity direction agrees with clinical reasoning for this finding, OR (b) the disagreement is attributable to a documented band-value concern that the reviewer flags via `magnitude_concern` for re-assessment at DATA-GAP-FCT-LB-BW-05 recalibration. Direction-sign-off does NOT validate: specific band numeric values (frozen at merge per Keystone 8), penalty constant magnitudes (pre-production, DATA-GAP-FCT-LB-BW-05), or cross-finding calibration (pre-production).

Absolute magnitudes are subject to penalty-constant recalibration. Values in this packet are correct-direction, provisional-magnitude. Post-recalibration values may shift again without invalidating the directional conclusions of this cycle.

## 1. Per-study verdict distribution shift (LB + BW)

| Study | variation | concern | adverse | strong_adverse | provisional |
|---|---|---|---|---|---|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | 0 | 0 | 0 | 0 | 115 |
| CBER-POC-Pilot-Study2-Vaccine_xpt | 153 -> 179 (+26) | 86 -> 72 (-14) | 52 -> 46 (-6) | 0 | 22 -> 16 (-6) |
| CBER-POC-Pilot-Study3-Gene-Therapy | 272 -> 293 (+21) | 180 -> 173 (-7) | 106 -> 92 (-14) | 0 | 3 |
| CBER-POC-Pilot-Study4-Vaccine | 134 -> 179 (+45) | 152 -> 135 (-17) | 92 -> 64 (-28) | 0 | 9 |
| CBER-POC-Pilot-Study5 | 0 | 0 | 0 | 0 | 0 |
| CJ16050-xptonly | 0 | 0 | 0 | 0 | 0 |
| CJUGSEND00 | 0 | 0 | 0 | 0 | 0 |
| FFU-Contribution-to-FDA | 221 -> 265 (+44) | 202 -> 203 (+1) | 198 -> 139 (-59) | 0 -> 14 (+14) | 28 |
| Nimble | 7 -> 6 (-1) | 1 -> 2 (+1) | 0 | 0 | 0 |
| PDS | 39 -> 54 (+15) | 91 -> 109 (+18) | 158 -> 103 (-55) | 0 -> 23 (+23) | 123 -> 122 (-1) |
| PointCross | 18 -> 23 (+5) | 29 -> 35 (+6) | 63 -> 30 (-33) | 0 -> 22 (+22) | 80 |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | 81 -> 114 (+33) | 112 -> 102 (-10) | 93 -> 70 (-23) | 0 | 255 |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | 67 -> 106 (+39) | 116 -> 95 (-21) | 81 -> 63 (-18) | 0 | 30 |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | 25 -> 35 (+10) | 52 -> 50 (-2) | 28 -> 19 (-9) | 0 -> 1 (+1) | 3 |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | 92 -> 107 (+15) | 116 -> 113 (-3) | 57 -> 46 (-11) | 0 | 19 -> 18 (-1) |
| instem | 54 -> 72 (+18) | 77 -> 72 (-5) | 58 -> 45 (-13) | 0 | 1 |

## 2. Coverage transitions (LB + BW)

| Study | none (pre) | full (post) | partial (post) | still-none (post) |
|---|---|---|---|---|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | 115 | 0 | 0 | 115 |
| CBER-POC-Pilot-Study2-Vaccine_xpt | 313 | 88 | 0 | 225 |
| CBER-POC-Pilot-Study3-Gene-Therapy | 561 | 87 | 0 | 474 |
| CBER-POC-Pilot-Study4-Vaccine | 387 | 117 | 0 | 270 |
| CBER-POC-Pilot-Study5 | 0 | 0 | 0 | 0 |
| CJ16050-xptonly | 0 | 0 | 0 | 0 |
| CJUGSEND00 | 0 | 0 | 0 | 0 |
| FFU-Contribution-to-FDA | 649 | 203 | 0 | 446 |
| Nimble | 8 | 2 | 0 | 6 |
| PDS | 411 | 93 | 0 | 318 |
| PointCross | 178 | 52 | 0 | 138 |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | 541 | 72 | 0 | 469 |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | 294 | 58 | 0 | 236 |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | 108 | 38 | 0 | 70 |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | 284 | 44 | 0 | 240 |
| instem | 190 | 40 | 0 | 150 |

## 3. NHP study coverage (AC-F4-5 enumeration)

**4 NHP studies identified via TS SPECIES (study_metadata_enriched.json):**

| Study | TS SPECIES | LB provisional | LB extrapolated | BW stopping-proxy |
|---|---|---|---|---|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | MONKEY | 104 | 104 | 0 |
| CBER-POC-Pilot-Study3-Gene-Therapy | MONKEY | 3 | 528 | 6 |
| CJUGSEND00 | MONKEY | 0 | 0 | 0 |
| FFU-Contribution-to-FDA | MONKEY | 28 | 616 | 33 |

**AC-F4-5 gate PASS:** NHP studies contribute 1383 findings to provisional/extrapolated inventory.

## 4. Provisional / extrapolated-reliance inventory (post-append)

NHP findings are expected to carry `provenance: extrapolated` (LB) or `stopping_criterion_used_as_proxy` (BW) with `threshold_reliability: low` / `moderate`.

| Study | LB provisional | LB extrapolated | BW stopping-proxy |
|---|---|---|---|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | 104 | 104 | 0 |
| CBER-POC-Pilot-Study2-Vaccine_xpt | 16 | 209 | 0 |
| CBER-POC-Pilot-Study3-Gene-Therapy | 3 | 528 | 6 |
| CBER-POC-Pilot-Study4-Vaccine | 9 | 270 | 0 |
| CBER-POC-Pilot-Study5 | 0 | 0 | 0 |
| CJ16050-xptonly | 0 | 0 | 0 |
| CJUGSEND00 | 0 | 0 | 0 |
| FFU-Contribution-to-FDA | 28 | 616 | 33 |
| Nimble | 0 | 5 | 0 |
| PDS | 120 | 313 | 0 |
| PointCross | 79 | 137 | 0 |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | 252 | 464 | 0 |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | 30 | 215 | 0 |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | 1 | 61 | 0 |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | 18 | 233 | 0 |
| instem | 1 | 140 | 0 |

## 5. Per-species per-endpoint finding count matrix (post-append)

Cells with < 5 findings marked `⚠ thin-coverage` -- band correctness validated via primary-literature inheritance only.

| Species | Endpoint | Total | M | F | Combined | Coverage |
|---|---|---|---|---|---|---|
| dog | BW.BW | 38 | 20 | 18 | 0 |  |
| dog | LB.ALB | 19 | 11 | 8 | 0 |  |
| dog | LB.ALBGLOB | 19 | 11 | 8 | 0 |  |
| dog | LB.ALP | 19 | 11 | 8 | 0 |  |
| dog | LB.ALT | 19 | 11 | 8 | 0 |  |
| dog | LB.APTT | 20 | 11 | 9 | 0 |  |
| dog | LB.AST | 19 | 11 | 8 | 0 |  |
| dog | LB.BASO | 19 | 11 | 8 | 0 |  |
| dog | LB.BICARB | 6 | 3 | 3 | 0 |  |
| dog | LB.BILI | 19 | 11 | 8 | 0 |  |
| dog | LB.CA | 19 | 11 | 8 | 0 |  |
| dog | LB.CHOL | 19 | 11 | 8 | 0 |  |
| dog | LB.CK | 19 | 11 | 8 | 0 |  |
| dog | LB.CL | 20 | 12 | 8 | 0 |  |
| dog | LB.CREAT | 20 | 12 | 8 | 0 |  |
| dog | LB.EOS | 19 | 11 | 8 | 0 |  |
| dog | LB.FIBRINO | 6 | 3 | 3 | 0 |  |
| dog | LB.GGT | 19 | 11 | 8 | 0 |  |
| dog | LB.GLDH | 6 | 3 | 3 | 0 |  |
| dog | LB.GLOBUL | 19 | 11 | 8 | 0 |  |
| dog | LB.GLUC | 20 | 12 | 8 | 0 |  |
| dog | LB.HCT | 19 | 11 | 8 | 0 |  |
| dog | LB.HGB | 19 | 11 | 8 | 0 |  |
| dog | LB.K | 20 | 12 | 8 | 0 |  |
| dog | LB.LGUNSCE | 19 | 11 | 8 | 0 |  |
| dog | LB.LYM | 19 | 11 | 8 | 0 |  |
| dog | LB.MCH | 19 | 11 | 8 | 0 |  |
| dog | LB.MCHC | 19 | 11 | 8 | 0 |  |
| dog | LB.MCV | 19 | 11 | 8 | 0 |  |
| dog | LB.MONO | 19 | 11 | 8 | 0 |  |
| dog | LB.NAG | 5 | 3 | 2 | 0 |  |
| dog | LB.NEUT | 13 | 8 | 5 | 0 |  |
| dog | LB.NEUTSG | 6 | 3 | 3 | 0 |  |
| dog | LB.PHOS | 20 | 12 | 8 | 0 |  |
| dog | LB.PLAT | 19 | 11 | 8 | 0 |  |
| dog | LB.PROT | 20 | 12 | 8 | 0 |  |
| dog | LB.PT | 20 | 11 | 9 | 0 |  |
| dog | LB.RBC | 19 | 11 | 8 | 0 |  |
| dog | LB.RBCNUCLE | 4 | 2 | 2 | 0 | ⚠ thin |
| dog | LB.RDW | 19 | 11 | 8 | 0 |  |
| dog | LB.RETI | 19 | 11 | 8 | 0 |  |
| dog | LB.SODIUM | 20 | 12 | 8 | 0 |  |
| dog | LB.SPGRAV | 17 | 10 | 7 | 0 |  |
| dog | LB.TRIG | 19 | 11 | 8 | 0 |  |
| dog | LB.TROPONI | 5 | 2 | 3 | 0 |  |
| dog | LB.UREAN | 19 | 11 | 8 | 0 |  |
| dog | LB.VOLUME | 17 | 10 | 7 | 0 |  |
| dog | LB.WBC | 19 | 11 | 8 | 0 |  |
| nhp | BW.BW | 77 | 33 | 44 | 0 |  |
| nhp | LB.ALB | 29 | 12 | 17 | 0 |  |
| nhp | LB.ALBGLOB | 29 | 12 | 17 | 0 |  |
| nhp | LB.ALP | 29 | 12 | 17 | 0 |  |
| nhp | LB.ALT | 29 | 12 | 17 | 0 |  |
| nhp | LB.APTT | 29 | 12 | 17 | 0 |  |
| nhp | LB.AST | 29 | 12 | 17 | 0 |  |
| nhp | LB.BACT | 2 | 0 | 2 | 0 | ⚠ thin |
| nhp | LB.BASO | 29 | 11 | 18 | 0 |  |
| nhp | LB.BASOLE | 13 | 11 | 2 | 0 |  |
| nhp | LB.BICARB | 15 | 0 | 15 | 0 |  |
| nhp | LB.BILI | 28 | 11 | 17 | 0 |  |
| nhp | LB.BUN | 15 | 0 | 15 | 0 |  |
| nhp | LB.CA | 29 | 12 | 17 | 0 |  |
| nhp | LB.CASTS | 2 | 0 | 2 | 0 | ⚠ thin |
| nhp | LB.CHOL | 29 | 12 | 17 | 0 |  |
| nhp | LB.CK | 29 | 12 | 17 | 0 |  |
| nhp | LB.CL | 29 | 12 | 17 | 0 |  |
| nhp | LB.CREAT | 29 | 12 | 17 | 0 |  |
| nhp | LB.CRYSTALS | 2 | 0 | 2 | 0 | ⚠ thin |
| nhp | LB.EOS | 29 | 11 | 18 | 0 |  |
| nhp | LB.EOSLE | 13 | 11 | 2 | 0 |  |
| nhp | LB.EPIC | 2 | 0 | 2 | 0 | ⚠ thin |
| nhp | LB.FIBRINO | 27 | 12 | 15 | 0 |  |
| nhp | LB.GGT | 29 | 12 | 17 | 0 |  |
| nhp | LB.GLOBUL | 29 | 12 | 17 | 0 |  |
| nhp | LB.GLUC | 29 | 12 | 17 | 0 |  |
| nhp | LB.HCT | 29 | 11 | 18 | 0 |  |
| nhp | LB.HGB | 29 | 11 | 18 | 0 |  |
| nhp | LB.K | 29 | 12 | 17 | 0 |  |
| nhp | LB.LGLUCLE | 13 | 11 | 2 | 0 |  |
| nhp | LB.LGUNSCE | 13 | 11 | 2 | 0 |  |
| nhp | LB.LYM | 29 | 11 | 18 | 0 |  |
| nhp | LB.LYMLE | 13 | 11 | 2 | 0 |  |
| nhp | LB.MCH | 29 | 11 | 18 | 0 |  |
| nhp | LB.MCHC | 29 | 11 | 18 | 0 |  |
| nhp | LB.MCV | 29 | 11 | 18 | 0 |  |
| nhp | LB.MONO | 29 | 11 | 18 | 0 |  |
| nhp | LB.MONOLE | 13 | 11 | 2 | 0 |  |
| nhp | LB.MPV | 16 | 0 | 16 | 0 |  |
| nhp | LB.NEUT | 29 | 11 | 18 | 0 |  |
| nhp | LB.NEUTLE | 13 | 11 | 2 | 0 |  |
| nhp | LB.PH | 2 | 0 | 2 | 0 | ⚠ thin |
| nhp | LB.PHOS | 29 | 12 | 17 | 0 |  |
| nhp | LB.PLAT | 29 | 11 | 18 | 0 |  |
| nhp | LB.PROT | 29 | 12 | 17 | 0 |  |
| nhp | LB.PT | 29 | 12 | 17 | 0 |  |
| nhp | LB.RBC | 29 | 11 | 18 | 0 |  |
| nhp | LB.RDW | 27 | 11 | 16 | 0 |  |
| nhp | LB.RETI | 29 | 11 | 18 | 0 |  |
| nhp | LB.RETIRBC | 13 | 11 | 2 | 0 |  |
| nhp | LB.SODIUM | 29 | 12 | 17 | 0 |  |
| nhp | LB.SPGRAV | 2 | 0 | 2 | 0 | ⚠ thin |
| nhp | LB.TRIG | 29 | 12 | 17 | 0 |  |
| nhp | LB.UREAN | 14 | 12 | 2 | 0 |  |
| nhp | LB.UROBIL | 2 | 0 | 2 | 0 | ⚠ thin |
| nhp | LB.VOLUME | 2 | 0 | 2 | 0 | ⚠ thin |
| nhp | LB.WBC | 29 | 11 | 18 | 0 |  |
| other | BW.BW | 70 | 35 | 35 | 0 |  |
| other | LB.ALB | 15 | 8 | 7 | 0 |  |
| other | LB.ALBGLOB | 15 | 8 | 7 | 0 |  |
| other | LB.ALP | 15 | 8 | 7 | 0 |  |
| other | LB.ALT | 15 | 8 | 7 | 0 |  |
| other | LB.APTT | 16 | 8 | 8 | 0 |  |
| other | LB.AST | 15 | 8 | 7 | 0 |  |
| other | LB.BASO | 16 | 8 | 8 | 0 |  |
| other | LB.BILI | 15 | 8 | 7 | 0 |  |
| other | LB.CA | 15 | 8 | 7 | 0 |  |
| other | LB.CHOL | 15 | 8 | 7 | 0 |  |
| other | LB.CK | 15 | 8 | 7 | 0 |  |
| other | LB.CL | 15 | 8 | 7 | 0 |  |
| other | LB.CREAT | 15 | 8 | 7 | 0 |  |
| other | LB.CRP | 16 | 8 | 8 | 0 |  |
| other | LB.EOS | 16 | 8 | 8 | 0 |  |
| other | LB.FIBRINO | 16 | 8 | 8 | 0 |  |
| other | LB.GGT | 15 | 8 | 7 | 0 |  |
| other | LB.GLOBUL | 15 | 8 | 7 | 0 |  |
| other | LB.GLUC | 15 | 8 | 7 | 0 |  |
| other | LB.HCT | 16 | 8 | 8 | 0 |  |
| other | LB.HGB | 16 | 8 | 8 | 0 |  |
| other | LB.K | 15 | 8 | 7 | 0 |  |
| other | LB.LDH | 9 | 5 | 4 | 0 |  |
| other | LB.LGUNSCE | 16 | 8 | 8 | 0 |  |
| other | LB.LYM | 16 | 8 | 8 | 0 |  |
| other | LB.MCH | 16 | 8 | 8 | 0 |  |
| other | LB.MCHC | 16 | 8 | 8 | 0 |  |
| other | LB.MCV | 16 | 8 | 8 | 0 |  |
| other | LB.MONO | 16 | 8 | 8 | 0 |  |
| other | LB.NEUT | 16 | 8 | 8 | 0 |  |
| other | LB.PHOS | 15 | 8 | 7 | 0 |  |
| other | LB.PLAT | 16 | 8 | 8 | 0 |  |
| other | LB.PROT | 15 | 8 | 7 | 0 |  |
| other | LB.PT | 16 | 8 | 8 | 0 |  |
| other | LB.RBC | 16 | 8 | 8 | 0 |  |
| other | LB.RBCNUCLE | 1 | 0 | 1 | 0 | ⚠ thin |
| other | LB.RDW | 8 | 4 | 4 | 0 |  |
| other | LB.RETI | 16 | 8 | 8 | 0 |  |
| other | LB.RETIRBC | 8 | 4 | 4 | 0 |  |
| other | LB.SODIUM | 15 | 8 | 7 | 0 |  |
| other | LB.TRIG | 15 | 8 | 7 | 0 |  |
| other | LB.UREA | 6 | 3 | 3 | 0 |  |
| other | LB.UREAN | 9 | 5 | 4 | 0 |  |
| other | LB.WBC | 16 | 8 | 8 | 0 |  |
| rat | BW.BW | 159 | 82 | 77 | 0 |  |
| rat | LB.ALB | 20 | 11 | 9 | 0 |  |
| rat | LB.ALBCREAT | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.ALBGLOB | 18 | 10 | 8 | 0 |  |
| rat | LB.ALP | 18 | 10 | 8 | 0 |  |
| rat | LB.ALT | 18 | 10 | 8 | 0 |  |
| rat | LB.AMORPHSD | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.ANISO | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.APTT | 18 | 10 | 8 | 0 |  |
| rat | LB.AST | 18 | 10 | 8 | 0 |  |
| rat | LB.BACT | 6 | 3 | 3 | 0 |  |
| rat | LB.BASO | 18 | 10 | 8 | 0 |  |
| rat | LB.BASOCE | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.BICARB | 8 | 4 | 4 | 0 |  |
| rat | LB.BILI | 18 | 10 | 8 | 0 |  |
| rat | LB.BLAST | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.BLASTLE | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.BLSTNMCE | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.BUN | 8 | 4 | 4 | 0 |  |
| rat | LB.CA | 18 | 10 | 8 | 0 |  |
| rat | LB.CASULPH | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CHOL | 18 | 10 | 8 | 0 |  |
| rat | LB.CK | 6 | 3 | 3 | 0 |  |
| rat | LB.CL | 20 | 11 | 9 | 0 |  |
| rat | LB.CLCREAT | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CLEXR | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CREAT | 18 | 10 | 8 | 0 |  |
| rat | LB.CSEPI | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CSFAT | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CSGRAN | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CSHYAL | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CSRBC | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CSWAX | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CSWBC | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CYAMORPH | 1 | 1 | 0 | 0 | ⚠ thin |
| rat | LB.CYBILI | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CYCACAR | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CYCAOXA | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CYCAPHOS | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CYCHOL | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CYCYSTIN | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CYSTARCH | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CYTRPHOS | 7 | 4 | 3 | 0 |  |
| rat | LB.CYTYRO | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.CYURIAC | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.EOS | 18 | 10 | 8 | 0 |  |
| rat | LB.EOSCE | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.EPIC | 6 | 3 | 3 | 0 |  |
| rat | LB.EPISQCE | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.EPITUCE | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.FATACFR | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.FATDROP | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.FIBRINO | 18 | 10 | 8 | 0 |  |
| rat | LB.GGT | 6 | 2 | 4 | 0 |  |
| rat | LB.GLDH | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.GLOBUL | 18 | 10 | 8 | 0 |  |
| rat | LB.GLUC | 18 | 10 | 8 | 0 |  |
| rat | LB.GLUCCRT | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.HCT | 18 | 10 | 8 | 0 |  |
| rat | LB.HGB | 18 | 10 | 8 | 0 |  |
| rat | LB.HPOCROM | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.HYPERCHR | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.K | 20 | 11 | 9 | 0 |  |
| rat | LB.KCREAT | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.KETONES | 10 | 5 | 5 | 0 |  |
| rat | LB.KEXR | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.LGLUCLE | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.LGUNSCE | 18 | 10 | 8 | 0 |  |
| rat | LB.LYM | 18 | 10 | 8 | 0 |  |
| rat | LB.LYMAT | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.LYMATLE | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.LYMCE | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.MACROCY | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.MCH | 18 | 10 | 8 | 0 |  |
| rat | LB.MCHC | 18 | 10 | 8 | 0 |  |
| rat | LB.MCV | 18 | 10 | 8 | 0 |  |
| rat | LB.METAMY | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.METAMYCE | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.MICROCY | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.MONO | 18 | 10 | 8 | 0 |  |
| rat | LB.MONOCE | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.MPV | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.MYCY | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.MYCYCE | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.NACREAT | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.NAG | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.NAGCREAT | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.NEUT | 14 | 8 | 6 | 0 |  |
| rat | LB.NEUTCE | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.NEUTSG | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.OCCBLD | 5 | 3 | 2 | 0 |  |
| rat | LB.PH | 15 | 8 | 7 | 0 |  |
| rat | LB.PHOS | 18 | 10 | 8 | 0 |  |
| rat | LB.PHOSCRT | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.PHOSEXR | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.PLAT | 18 | 10 | 8 | 0 |  |
| rat | LB.PLATCLMP | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.PLATLRG | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.PROMY | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.PROMYCE | 1 | 0 | 1 | 0 | ⚠ thin |
| rat | LB.PROT | 20 | 11 | 9 | 0 |  |
| rat | LB.PROTCRT | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.PT | 18 | 10 | 8 | 0 |  |
| rat | LB.RBC | 18 | 10 | 8 | 0 |  |
| rat | LB.RDW | 18 | 10 | 8 | 0 |  |
| rat | LB.RETI | 18 | 10 | 8 | 0 |  |
| rat | LB.RETIRBC | 8 | 4 | 4 | 0 |  |
| rat | LB.SODIUM | 18 | 10 | 8 | 0 |  |
| rat | LB.SODMEXR | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.SPERM | 6 | 4 | 2 | 0 |  |
| rat | LB.SPGRAV | 17 | 9 | 8 | 0 |  |
| rat | LB.TRIG | 18 | 10 | 8 | 0 |  |
| rat | LB.TUCR | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.TUGL | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.TUNAG | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.TUPRO | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.TURMA | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.UREAN | 10 | 6 | 4 | 0 |  |
| rat | LB.UROBIL | 4 | 2 | 2 | 0 | ⚠ thin |
| rat | LB.VOLUME | 17 | 9 | 8 | 0 |  |
| rat | LB.WBC | 19 | 10 | 9 | 0 |  |
| rat | LB.YEAST | 4 | 2 | 2 | 0 | ⚠ thin |

## 6. Legacy severity byte-parity (AC-F4-1 hard gate)

| Study | pre | post | status |
|---|---|---|---|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | {'not_assessed': 135} | {'not_assessed': 135} | OK |
| CBER-POC-Pilot-Study2-Vaccine_xpt | {'normal': 388, 'adverse': 79, 'warning': 23} | {'normal': 388, 'adverse': 79, 'warning': 23} | OK |
| CBER-POC-Pilot-Study3-Gene-Therapy | {'not_assessed': 593} | {'not_assessed': 593} | OK |
| CBER-POC-Pilot-Study4-Vaccine | {'adverse': 123, 'normal': 555, 'warning': 69} | {'adverse': 123, 'normal': 555, 'warning': 69} | OK |
| CBER-POC-Pilot-Study5 | {'adverse': 11, 'normal': 36, 'warning': 5} | {'adverse': 11, 'normal': 36, 'warning': 5} | OK |
| CJ16050-xptonly | {'adverse': 5} | {'adverse': 5} | OK |
| CJUGSEND00 | {'normal': 27, 'adverse': 2, 'warning': 2} | {'normal': 27, 'adverse': 2, 'warning': 2} | OK |
| FFU-Contribution-to-FDA | {'normal': 572, 'warning': 174, 'adverse': 65} | {'normal': 572, 'warning': 174, 'adverse': 65} | OK |
| Nimble | {'normal': 41, 'warning': 8, 'adverse': 3} | {'normal': 41, 'warning': 8, 'adverse': 3} | OK |
| PDS | {'warning': 65, 'adverse': 200, 'normal': 424} | {'warning': 65, 'adverse': 200, 'normal': 424} | OK |
| PointCross | {'warning': 23, 'normal': 280, 'adverse': 112} | {'warning': 23, 'normal': 280, 'adverse': 112} | OK |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | {'normal': 623, 'adverse': 109, 'warning': 130} | {'normal': 623, 'adverse': 109, 'warning': 130} | OK |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | {'normal': 308, 'warning': 91, 'adverse': 37} | {'normal': 308, 'warning': 91, 'adverse': 37} | OK |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | {'normal': 225, 'adverse': 64, 'warning': 54} | {'normal': 225, 'adverse': 64, 'warning': 54} | OK |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | {'normal': 389, 'adverse': 64, 'warning': 38} | {'normal': 389, 'adverse': 64, 'warning': 38} | OK |
| instem | {'normal': 220, 'warning': 42, 'adverse': 55} | {'normal': 220, 'warning': 42, 'adverse': 55} | OK |

## 7. NOAEL dose-level byte-parity (AC-F4-2 hard gate, scoped)

Scoped to `noael_dose_level` and `loael_dose_level` only.
`noael_confidence` shift is the DESIGNED downstream cascade (see sec 7).

| Study | rows_pre | rows_post | dose_level diffs | status |
|---|---|---|---|---|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | 3 | 3 | 0 | OK |
| CBER-POC-Pilot-Study2-Vaccine_xpt | 3 | 3 | 0 | OK |
| CBER-POC-Pilot-Study3-Gene-Therapy | 3 | 3 | 0 | OK |
| CBER-POC-Pilot-Study4-Vaccine | 3 | 3 | 0 | OK |
| CBER-POC-Pilot-Study5 | 3 | 3 | 0 | OK |
| CJ16050-xptonly | 3 | 3 | 0 | OK |
| CJUGSEND00 | 3 | 3 | 0 | OK |
| FFU-Contribution-to-FDA | 9 | 9 | 0 | OK |
| Nimble | 3 | 3 | 0 | OK |
| PDS | 3 | 3 | 0 | OK |
| PointCross | 3 | 3 | 0 | OK |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | 3 | 3 | 0 | OK |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | 3 | 3 | 0 | OK |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | 3 | 3 | 0 | OK |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | 3 | 3 | 0 | OK |
| instem | 3 | 3 | 0 | OK |

## 8. NOAEL confidence delta (AC-F4-2 cascade -- sign-off reviewed)

`noael_confidence` shifts are the DESIGNED downstream cascade of populating LB/BW bands. Scoped OUT of byte-parity per probe resolution. Direction-correct, magnitude-provisional pending DATA-GAP-FCT-LB-BW-05 recalibration.

| Study | sex | pre | post | delta | gating_mechanism | rationale |
|---|---|---|---|---|---|---|
| _no shifts observed_ | | | | | | |

## 9. Dog ALT fixture detail (TOXSCI-35449 + TOXSCI-43066)

Post-F1 populated-band path: dog ALT findings consume LB.ALT.up bands (1.8 / 2.0 / 3.0 / 5.0 fold) instead of the legacy |g|-ladder. The visible payoff: TOXSCI-35449 ALT finding (|g|=1.71 pre-F1 -> legacy-adverse via |g|>=1.0) now emits FCT-verdict based on fold-ratio magnitude vs dog adverse_floor 3.0x. **Expected direction** of the shift: findings where |g| was above 1.0 but fold-ratio is below 3.0x will DOWNGRADE from legacy-adverse to FCT-concern/variation -- this is the INTENDED scientific correction (|g| >= 1.0 is coarser than the fold-ratio threshold for hepatic enzymes). Reviewers cross-reference `severity` (byte-parity preserved) vs `verdict` (FCT-derived) at sign-off.

| Study | test_code | dir | pre_verdict | post_verdict | post_coverage | post_provenance |
|---|---|---|---|---|---|---|
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | down | variation | variation | none | extrapolated |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | down | variation | variation | none | extrapolated |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | None | provisional | provisional | none | extrapolated |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | up | adverse | concern | full | regulatory |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | down | variation | variation | none | extrapolated |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | None | provisional | provisional | none | extrapolated |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | None | provisional | provisional | none | extrapolated |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | None | provisional | provisional | none | extrapolated |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | down | variation | variation | none | extrapolated |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | up | adverse | variation | full | regulatory |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | None | provisional | provisional | none | extrapolated |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | up | concern | variation | full | regulatory |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | ALT | none | provisional | provisional | none | extrapolated |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | ALT | up | variation | variation | full | regulatory |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | ALT | up | concern | variation | full | regulatory |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | ALT | up | variation | variation | full | regulatory |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | ALT | up | adverse | variation | full | regulatory |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | ALT | down | adverse | adverse | none | extrapolated |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | ALT | down | adverse | adverse | none | extrapolated |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | ALT | down | concern | concern | none | extrapolated |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | ALT | up | variation | variation | full | regulatory |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | ALT | down | variation | variation | none | extrapolated |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | ALT | down | concern | concern | none | extrapolated |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | ALT | up | concern | variation | full | regulatory |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | ALT | down | adverse | adverse | none | extrapolated |
