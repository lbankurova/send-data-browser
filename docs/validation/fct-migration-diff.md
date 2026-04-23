# FCT Migration Diff (Phase B, pre-commit review artifact)

**Topic:** species-magnitude-thresholds-dog-nhp Phase B
**Scope:** F1 + F3 + F3b + F4 + F5 + F6 (atomic PR)

Generated from regen of 16 studies. Pre-counts are captured from `.lattice/phase-b-baseline.json` (snapshot taken before any Phase B code change). Post-counts come from the freshly regenerated `unified_findings.json` per study.

## 1. Severity distribution shift (per study, 4-cell)

Columns: normal / warning / adverse / not_assessed. Each cell shows `pre -> post (delta)`.

| Study | total (pre -> post) | normal | warning | adverse | not_assessed |
|---|---|---|---|---|---|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | 135 -> 135 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 135 -> 135 |
| CBER-POC-Pilot-Study2-Vaccine_xpt | 490 -> 490 | 388 -> 388 | 23 -> 23 | 79 -> 79 | 0 -> 0 |
| CBER-POC-Pilot-Study3-Gene-Therapy | 593 -> 593 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 593 -> 593 |
| CBER-POC-Pilot-Study4-Vaccine | 747 -> 747 | 555 -> 555 | 69 -> 69 | 123 -> 123 | 0 -> 0 |
| CBER-POC-Pilot-Study5 | 52 -> 52 | 36 -> 36 | 5 -> 5 | 11 -> 11 | 0 -> 0 |
| CJ16050-xptonly | 5 -> 5 | 0 -> 0 | 0 -> 0 | 5 -> 5 | 0 -> 0 |
| CJUGSEND00 | 31 -> 31 | 27 -> 27 | 2 -> 2 | 2 -> 2 | 0 -> 0 |
| FFU-Contribution-to-FDA | 811 -> 811 | 572 -> 572 | 174 -> 174 | 65 -> 65 | 0 -> 0 |
| Nimble | 52 -> 52 | 41 -> 41 | 8 -> 8 | 3 -> 3 | 0 -> 0 |
| PDS | 689 -> 689 | 424 -> 424 | 65 -> 65 | 200 -> 200 | 0 -> 0 |
| PointCross | 415 -> 415 | 280 -> 280 | 23 -> 23 | 112 -> 112 | 0 -> 0 |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | 862 -> 862 | 623 -> 623 | 130 -> 130 | 109 -> 109 | 0 -> 0 |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | 436 -> 436 | 308 -> 308 | 91 -> 91 | 37 -> 37 | 0 -> 0 |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | 343 -> 343 | 225 -> 225 | 54 -> 54 | 64 -> 64 | 0 -> 0 |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | 491 -> 491 | 389 -> 389 | 38 -> 38 | 64 -> 64 | 0 -> 0 |
| instem | 317 -> 317 | 220 -> 220 | 42 -> 42 | 55 -> 55 | 0 -> 0 |

## 2. Highlighted shifts

_No cells exceed the AC-F3b-4 numeric bound `max(3 findings, 5% of pre-count, 10% relative)`._

## 3. NOAEL shift table

**Pre-vs-post NOAEL comparison** -- targeted stash-regen-compare on two reference studies (PointCross rat + TOXSCI-35449 dog, the F3 fixture candidate). Under Phase B's additive design the `severity` field is unchanged (classify_severity body preserved), so NOAEL derivation through the ECETOC finding_class cascade is byte-equal by construction. The 2-study stash-regen-compare confirms empirically. For the remaining 14 studies NOAEL is reported post-migration only; severity byte-parity (see §1) plus OM slim-hash preservation across all 16 studies (Appendix) is the structural evidence. Per revised AC-F6-1 (pre-production scope), this evidence combination satisfies the NOAEL sign-off requirement.

| Study | Sex | pre NOAEL | post NOAEL | pre confidence | post confidence | n_provisional_excluded (new) |
|---|---|---|---|---|---|---|
| PointCross | M | Not established | Not established | 0.8 | 0.8 | 73 |
| PointCross | F | Not established | Not established | 0.8 | 0.8 | 1 |
| PointCross | Combined | Not established | Not established | 0.8 | 0.8 | 74 |
| TOXSCI-35449 dog | M | Not established | Not established | 0.8 | 0.8 | 156 |
| TOXSCI-35449 dog | F | Not established | Not established | 0.8 | 0.8 | 78 |
| TOXSCI-35449 dog | Combined | Not established | Not established | 0.8 | 0.8 | 234 |

**Post-migration NOAEL per study/sex (all 16 studies):**

| Study | Sex | NOAEL label | LOAEL label | n_adverse_at_loael | n_provisional_excluded | confidence |
|---|---|---|---|---|---|---|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | M | Not established | N/A | 0 | 0 | 0.0 |
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | F | Not established | N/A | 0 | 119 | 0.0 |
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | Combined | Not established | N/A | 0 | 119 | 0.0 |
| CBER-POC-Pilot-Study2-Vaccine_xpt | M | Not established | Group 2 - 456a 1x10^11 VP | 20 | 1 | 0.8 |
| CBER-POC-Pilot-Study2-Vaccine_xpt | F | Not established | Group 2 - 456a 1x10^11 VP | 15 | 18 | 0.8 |
| CBER-POC-Pilot-Study2-Vaccine_xpt | Combined | Not established | Group 2 - 456a 1x10^11 VP | 35 | 19 | 0.8 |
| CBER-POC-Pilot-Study3-Gene-Therapy | M | Not established | N/A | 0 | 4 | 0.0 |
| CBER-POC-Pilot-Study3-Gene-Therapy | F | Not established | N/A | 0 | 0 | 0.0 |
| CBER-POC-Pilot-Study3-Gene-Therapy | Combined | Not established | N/A | 0 | 4 | 0.0 |
| CBER-POC-Pilot-Study4-Vaccine | M | Not established | Group 2, SENDVACC10 | 30 | 6 | 0.8 |
| CBER-POC-Pilot-Study4-Vaccine | F | Not established | Group 2, SENDVACC10 | 16 | 5 | 0.8 |
| CBER-POC-Pilot-Study4-Vaccine | Combined | Not established | Group 2, SENDVACC10 | 46 | 11 | 0.8 |
| CBER-POC-Pilot-Study5 | M | Not established | 20 mg/kg | 2 | 0 | None |
| CBER-POC-Pilot-Study5 | F | Not established | N/A | 0 | 0 | None |
| CBER-POC-Pilot-Study5 | Combined | Not established | 20 mg/kg | 2 | 0 | None |
| CJ16050-xptonly | M | Not established | Compound A 100 mg/kg | 2 | 0 | 1.0 |
| CJ16050-xptonly | F | Not established | N/A | 0 | 0 | 0.8 |
| CJ16050-xptonly | Combined | Not established | Compound A 100 mg/kg | 2 | 0 | 1.0 |
| CJUGSEND00 | M | Not established | 10 mg/kg | 1 | 0 | None |
| CJUGSEND00 | F | Not established | N/A | 0 | 0 | None |
| CJUGSEND00 | Combined | Not established | 10 mg/kg | 1 | 0 | None |
| FFU-Contribution-to-FDA | M | Not established | Not determined (single dose level) | 0 | 0 | 0.8 |
| FFU-Contribution-to-FDA | F | Not established | G2 - Compound 1: 12 mg/kg | 27 | 22 | 0.65 |
| FFU-Contribution-to-FDA | Combined | Not established | G2 - Compound 1: 12 mg/kg | 27 | 22 | 0.65 |
| FFU-Contribution-to-FDA | M | Not established | N/A | 0 | 0 | 0.8 |
| FFU-Contribution-to-FDA | F | Not established | G3 - Compound 2: 4 mg/kg | 22 | 5 | 0.65 |
| FFU-Contribution-to-FDA | Combined | Not established | G3 - Compound 2: 4 mg/kg | 22 | 5 | 0.65 |
| FFU-Contribution-to-FDA | M | Not established | Not determined (single dose level) | 0 | 0 | 0.8 |
| FFU-Contribution-to-FDA | F | Not established | G5 - Compound 3: 6 mg/kg | 39 | 7 | 0.65 |
| FFU-Contribution-to-FDA | Combined | Not established | G5 - Compound 3: 6 mg/kg | 39 | 7 | 0.65 |
| Nimble | M | Not established | N/A | 0 | 4 | 0.0 |
| Nimble | F | Not established | N/A | 0 | 4 | 0.0 |
| Nimble | Combined | Not established | N/A | 0 | 8 | 0.0 |
| PDS | M | Not established | Low | 20 | 59 | 0.8 |
| PDS | F | Not established | Low | 48 | 74 | 0.8 |
| PDS | Combined | Not established | Low | 68 | 133 | 0.8 |
| PointCross | M | Not established | Group 2,2 mg/kg PCDRUG | 10 | 73 | 0.8 |
| PointCross | F | Not established | Group 2,2 mg/kg PCDRUG | 6 | 1 | 0.8 |
| PointCross | Combined | Not established | Group 2,2 mg/kg PCDRUG | 16 | 74 | 0.8 |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | M | Not established | Group 2 - 6576 3 mg/kg/day | 15 | 156 | 0.8 |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | F | Not established | Group 2 - 6576 3 mg/kg/day | 15 | 78 | 0.8 |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | Combined | Not established | Group 2 - 6576 3 mg/kg/day | 30 | 234 | 0.8 |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | M | Not established | Group 2 25 mg/kg/day | 14 | 20 | 0.8 |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | F | Not established | Group 2 25 mg/kg/day | 7 | 10 | 0.8 |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | Combined | Not established | Group 2 25 mg/kg/day | 21 | 30 | 0.8 |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | M | Not established | Group 2 - 6576  25 mg/kg/day | 4 | 5 | 0.8 |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | F | Not established | Group 2 - 6576  25 mg/kg/day | 1 | 5 | 0.6 |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | Combined | Not established | Group 2 - 6576  25 mg/kg/day | 5 | 10 | 0.8 |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | M | Not established | 50 mg/kg | 3 | 11 | 0.8 |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | F | Not established | 50 mg/kg | 3 | 10 | 0.8 |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | Combined | Not established | 50 mg/kg | 6 | 21 | 0.8 |
| instem | M | Not established | 60 mg/kg/day XYZ-12345 | 8 | 2 | 0.8 |
| instem | F | Not established | 60 mg/kg/day XYZ-12345 | 10 | 0 | 0.8 |
| instem | Combined | Not established | 60 mg/kg/day XYZ-12345 | 18 | 2 | 0.8 |

## 4. Provisional-verdict inventory (NHP focus)

Count of findings with `verdict == 'provisional'` per study, split by domain and (for NHP studies) by organ/specimen. These are endpoints the FCT registry does not yet calibrate; they carry `coverage: none, provenance: extrapolated` and are excluded from NOAEL aggregation.

### CBER-POC-Pilot-Study1-Vaccine_xpt_only

| Domain | Coverage | Count |
|---|---|---|
| LB | none | 104 |
| BW | none | 11 |
| BG | none | 10 |
| CL | catalog_driven | 8 |
| IS | none | 2 |

### CBER-POC-Pilot-Study2-Vaccine_xpt

| Domain | Coverage | Count |
|---|---|---|
| MI | catalog_driven | 41 |
| LB | none | 22 |
| MA | catalog_driven | 18 |
| CL | catalog_driven | 17 |

### CBER-POC-Pilot-Study3-Gene-Therapy

| Domain | Coverage | Count |
|---|---|---|
| MI | catalog_driven | 16 |
| CL | catalog_driven | 9 |
| MA | catalog_driven | 6 |
| LB | none | 3 |
| IS | none | 1 |

### CBER-POC-Pilot-Study4-Vaccine

| Domain | Coverage | Count |
|---|---|---|
| MI | catalog_driven | 108 |
| MA | catalog_driven | 17 |
| CL | catalog_driven | 9 |
| LB | none | 9 |
| IS | none | 2 |

### CBER-POC-Pilot-Study5

| Domain | Coverage | Count |
|---|---|---|
| CL | catalog_driven | 12 |

### CJ16050-xptonly

| Domain | Coverage | Count |
|---|---|---|
| CL | catalog_driven | 2 |

### CJUGSEND00

| Domain | Coverage | Count |
|---|---|---|
| CL | catalog_driven | 1 |

### FFU-Contribution-to-FDA

| Domain | Coverage | Count |
|---|---|---|
| MI | catalog_driven | 38 |
| CL | catalog_driven | 34 |
| LB | none | 28 |
| OM | none | 12 |
| MA | catalog_driven | 3 |

OM specimens with provisional verdict:
- SPLEEN: 6 findings
- THYMUS: 6 findings

### Nimble

| Domain | Coverage | Count |
|---|---|---|
| MA | catalog_driven | 12 |
| CL | catalog_driven | 10 |
| MI | catalog_driven | 10 |
| FW | none | 4 |
| OM | stat-unavailable | 4 |
| DS | catalog_driven | 2 |

OM specimens with provisional verdict:
- HEART: 2 findings
- LIVER: 2 findings

### PDS

| Domain | Coverage | Count |
|---|---|---|
| LB | none | 121 |
| MI | catalog_driven | 82 |
| MA | catalog_driven | 29 |
| CL | catalog_driven | 12 |
| BG | none | 8 |
| BW | none | 2 |
| FW | none | 2 |
| DS | catalog_driven | 1 |

### PointCross

| Domain | Coverage | Count |
|---|---|---|
| MI | catalog_driven | 101 |
| LB | none | 79 |
| MA | catalog_driven | 72 |
| CL | catalog_driven | 9 |
| BG | none | 1 |
| BW | none | 1 |
| DS | catalog_driven | 1 |
| FW | none | 1 |

### TOXSCI-24-0062--35449 1 month dog- Compound B-xpt

| Domain | Coverage | Count |
|---|---|---|
| LB | none | 252 |
| CL | catalog_driven | 98 |
| MA | catalog_driven | 20 |
| MI | catalog_driven | 20 |
| BW | none | 3 |
| BG | none | 2 |
| VS | none | 1 |

### TOXSCI-24-0062--43066 1 month dog- Compound A-xpt

| Domain | Coverage | Count |
|---|---|---|
| MI | catalog_driven | 42 |
| CL | catalog_driven | 30 |
| LB | none | 30 |
| MA | catalog_driven | 3 |

### TOXSCI-24-0062--87497 1 month rat- Compound B-xpt

| Domain | Coverage | Count |
|---|---|---|
| CL | catalog_driven | 72 |
| MI | catalog_driven | 45 |
| MA | catalog_driven | 21 |
| BG | none | 6 |
| BW | none | 2 |
| FW | none | 1 |
| LB | none | 1 |

### TOXSCI-24-0062--96298 1 month rat- Compound A xpt

| Domain | Coverage | Count |
|---|---|---|
| MI | catalog_driven | 70 |
| CL | catalog_driven | 31 |
| LB | none | 19 |
| MA | catalog_driven | 12 |
| FW | none | 2 |
| DS | catalog_driven | 1 |

### instem

| Domain | Coverage | Count |
|---|---|---|
| MI | catalog_driven | 37 |
| CL | catalog_driven | 35 |
| MA | catalog_driven | 8 |
| FW | none | 1 |
| LB | none | 1 |

## 5. Dog fixture endpoint detail

Per-finding verdict/severity for the three spec-target endpoints on the two dog fixtures (TOXSCI-35449 cmpb + TOXSCI-43066 cmpa).

### TOXSCI-24-0062--35449 1 month dog- Compound B-xpt

**LB ALT (dog)** (13 findings)

| Sex | Direction | severity | verdict | coverage | provenance | |g| | p_adj | pct_change |
|---|---|---|---|---|---|---|---|---|
| M | down | normal | variation | none | extrapolated | 0.11 | 0.8534 | -4.5 |
| M | down | normal | variation | none | extrapolated | 0.11 | 0.8484 | -2.9 |
| M | None | normal | provisional | none | extrapolated |  |  |  |
| M | up | adverse | adverse | none | extrapolated | 1.71 | 0.0173 | 126.3 |
| M | down | normal | variation | none | extrapolated | 0.24 | 0.9262 | -4.0 |
| M | None | normal | provisional | none | extrapolated |  |  | 27.6 |
| M | None | normal | provisional | none | extrapolated |  |  | 22.8 |
| M | None | normal | provisional | none | extrapolated |  |  | 4.5 |
| F | down | normal | variation | none | extrapolated | 0.31 | 0.8800 | -7.4 |
| F | up | warning | adverse | none | extrapolated | 1.39 | 0.0598 | -2.3 |
| F | None | normal | provisional | none | extrapolated |  |  | 45.4 |
| F | up | normal | concern | none | extrapolated | 0.99 | 0.1911 | 42.4 |
| F | none | normal | provisional | none | extrapolated |  |  |  |

**OM LIVER (dog)** (6 findings)

| Sex | Direction | severity | verdict | coverage | provenance | |g| | p_adj | pct_change |
|---|---|---|---|---|---|---|---|---|
| F | up | normal | variation | full | industry_survey | 0.70 | 0.6413 | 11.5 |
| M | up | warning | adverse | full | industry_survey | 1.57 | 0.0717 | 32.0 |
| F | up | normal | variation | full | industry_survey | 0.12 | 0.9961 | 1.0 |
| M | up | adverse | adverse | full | industry_survey | 2.39 | 0.0482 | 29.5 |
| F | down | normal | variation | full | industry_survey | 0.30 | 0.9257 | -11.0 |
| M | up | normal | concern | full | industry_survey | 0.97 | 0.4001 | 17.3 |

**BW (dog)** (17 findings)

| Sex | Direction | severity | verdict | coverage | provenance | |g| | p_adj | pct_change |
|---|---|---|---|---|---|---|---|---|
| M | down | normal | concern | none | extrapolated | 0.95 | 0.2201 | -9.9 |
| M | down | normal | variation | none | extrapolated | 0.06 | 0.9150 | -0.7 |
| M | up | normal | variation | none | extrapolated | 0.04 | 0.9391 | 0.5 |
| M | up | normal | variation | none | extrapolated | 0.45 | 0.8062 | -1.7 |
| M | down | normal | concern | none | extrapolated | 0.51 | 0.6427 | -5.6 |
| M | down | warning | adverse | none | extrapolated | 1.14 | 0.0971 | -11.8 |
| M | down | adverse | adverse | none | extrapolated | 1.38 | 0.0485 | -12.3 |
| M | None | normal | provisional | none | extrapolated |  |  | -5.2 |
| M | None | normal | provisional | none | extrapolated |  |  | -3.5 |
| M | None | normal | provisional | none | extrapolated |  |  | -3.5 |
| F | down | normal | concern | none | extrapolated | 0.54 | 0.7191 | -10.0 |
| F | down | normal | variation | none | extrapolated | 0.10 | 0.9976 | -0.3 |
| F | down | normal | variation | none | extrapolated | 0.15 | 0.9911 | -0.5 |
| F | down | normal | variation | none | extrapolated | 0.21 | 0.9640 | -2.9 |
| F | down | normal | concern | none | extrapolated | 0.54 | 0.6987 | -6.4 |
| F | down | normal | concern | none | extrapolated | 0.63 | 0.6068 | -8.1 |
| F | down | warning | adverse | none | extrapolated | 1.09 | 0.2127 | -13.9 |

### TOXSCI-24-0062--43066 1 month dog- Compound A-xpt

**LB ALT (dog)** (6 findings)

| Sex | Direction | severity | verdict | coverage | provenance | |g| | p_adj | pct_change |
|---|---|---|---|---|---|---|---|---|
| M | up | normal | variation | none | extrapolated | 0.34 | 0.8603 | 3.6 |
| F | up | normal | concern | none | extrapolated | 0.85 | 0.7480 | -0.6 |
| M | up | normal | variation | none | extrapolated | 0.50 | 0.5975 | 4.8 |
| F | up | warning | adverse | none | extrapolated | 1.49 | 0.2742 | 4.0 |
| M | down | warning | adverse | none | extrapolated | 4.96 | 0.0842 | 10.7 |
| F | down | adverse | adverse | none | extrapolated | 1.99 | 0.1217 | -28.6 |

**OM LIVER (dog)** (6 findings)

| Sex | Direction | severity | verdict | coverage | provenance | |g| | p_adj | pct_change |
|---|---|---|---|---|---|---|---|---|
| F | up | normal | variation | full | industry_survey | 0.76 | 0.5147 | 6.5 |
| M | up | warning | concern | full | industry_survey | 1.68 | 0.0848 | 19.5 |
| F | up | normal | variation | full | industry_survey | 0.49 | 0.7826 | -2.1 |
| M | down | warning | variation | full | industry_survey | 3.31 | 0.1152 | -5.3 |
| F | down | normal | variation | full | industry_survey | 0.96 | 0.3851 | -10.4 |
| M | up | normal | variation | full | industry_survey | 0.52 | 0.6100 | 11.6 |

**BW (dog)** (21 findings)

| Sex | Direction | severity | verdict | coverage | provenance | |g| | p_adj | pct_change |
|---|---|---|---|---|---|---|---|---|
| M | up | normal | concern | none | extrapolated | 0.56 | 0.6875 | 4.4 |
| M | up | normal | concern | none | extrapolated | 0.55 | 0.6159 | 4.2 |
| M | up | normal | variation | none | extrapolated | 0.48 | 0.6983 | 5.2 |
| M | up | normal | variation | none | extrapolated | 0.50 | 0.6556 | 5.1 |
| M | up | normal | variation | none | extrapolated | 0.38 | 0.8152 | 4.1 |
| M | up | normal | variation | none | extrapolated | 0.43 | 0.7465 | 4.6 |
| M | up | normal | variation | none | extrapolated | 0.48 | 0.7135 | 5.3 |
| M | up | normal | concern | none | extrapolated | 0.56 | 0.6662 | 4.8 |
| M | up | normal | variation | none | extrapolated | 0.42 | 0.7116 | 6.2 |
| M | up | warning | adverse | none | extrapolated | 1.49 | 0.2315 | 17.5 |
| F | up | normal | concern | none | extrapolated | 0.76 | 0.4164 | 4.5 |
| F | up | normal | concern | none | extrapolated | 0.82 | 0.3667 | 4.2 |
| F | up | normal | concern | none | extrapolated | 0.88 | 0.3105 | 4.0 |
| F | up | normal | concern | none | extrapolated | 0.81 | 0.3961 | 3.4 |
| F | up | normal | concern | none | extrapolated | 0.97 | 0.2955 | 4.8 |
| F | up | normal | concern | none | extrapolated | 0.97 | 0.2594 | 3.9 |
| F | up | normal | concern | none | extrapolated | 0.99 | 0.2569 | 5.6 |
| F | up | normal | concern | none | extrapolated | 0.89 | 0.3282 | 5.2 |
| F | up | normal | concern | none | extrapolated | 0.97 | 0.2574 | 6.4 |
| F | up | normal | concern | none | extrapolated | 0.99 | 0.2718 | 5.2 |
| F | up | warning | adverse | none | extrapolated | 1.00 | 0.2119 | 11.8 |


## Appendix: OM slim-hash parity

OM parity gate per Phase A AC-F2-2: slim-hash of `(specimen, sex, severity, finding_class)` across all OM findings per study. Pre-migration value captured in baseline snapshot.

| Study | Pre OM slim-hash | Post OM slim-hash | Match |
|---|---|---|---|
| CBER-POC-Pilot-Study1-Vaccine_xpt_only | d751713988987e9331980363e24189ce | d751713988987e9331980363e24189ce | yes |
| CBER-POC-Pilot-Study2-Vaccine_xpt | 1854da78a21354a6b240a92a07a81c6b | 1854da78a21354a6b240a92a07a81c6b | yes |
| CBER-POC-Pilot-Study3-Gene-Therapy | d751713988987e9331980363e24189ce | d751713988987e9331980363e24189ce | yes |
| CBER-POC-Pilot-Study4-Vaccine | 885110ad75007178523f4f119c337b17 | 885110ad75007178523f4f119c337b17 | yes |
| CBER-POC-Pilot-Study5 | d751713988987e9331980363e24189ce | d751713988987e9331980363e24189ce | yes |
| CJ16050-xptonly | d751713988987e9331980363e24189ce | d751713988987e9331980363e24189ce | yes |
| CJUGSEND00 | d751713988987e9331980363e24189ce | d751713988987e9331980363e24189ce | yes |
| FFU-Contribution-to-FDA | ce1adbd66d1703ab9eb104c3c1e91d1e | ce1adbd66d1703ab9eb104c3c1e91d1e | yes |
| Nimble | 5d8dfaff33e05b2753f186d0f29b80e2 | 5d8dfaff33e05b2753f186d0f29b80e2 | yes |
| PDS | 674a68dadbd83a925ea96fe563195633 | 674a68dadbd83a925ea96fe563195633 | yes |
| PointCross | 69d81d9d7b62418bafb4e182645c8070 | 69d81d9d7b62418bafb4e182645c8070 | yes |
| TOXSCI-24-0062--35449 1 month dog- Compound B-xpt | 30196b184d64c05ff5b8f7b4673c054d | 30196b184d64c05ff5b8f7b4673c054d | yes |
| TOXSCI-24-0062--43066 1 month dog- Compound A-xpt | 883d742742ae4773eba6d7ea144601bc | 883d742742ae4773eba6d7ea144601bc | yes |
| TOXSCI-24-0062--87497 1 month rat- Compound B-xpt | b4c832577389d073fe6ed3b1b147ccd3 | b4c832577389d073fe6ed3b1b147ccd3 | yes |
| TOXSCI-24-0062--96298 1 month rat- Compound A xpt | 0a7139bf3265e43b57c037f6ba0eb571 | 0a7139bf3265e43b57c037f6ba0eb571 | yes |
| instem | 5f5e0b98f30381d0a1ce4e3b24ffe527 | 5f5e0b98f30381d0a1ce4e3b24ffe527 | yes |
