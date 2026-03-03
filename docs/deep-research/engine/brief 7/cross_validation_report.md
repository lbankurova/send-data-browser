# Cross-validation report: three-way merge of recovery duration lookup table

## Sources merged

- **Source A** (Claude artifact): "Literature-Grounded Recovery Duration Lookup Table for Toxicologic Pathology" — broad literature survey with detailed organ-by-organ tables, specific severity multiplier values, granular species modifier table (10 organ-process categories), richer citations (Capen 1997, Huisinga 2021, Clegg 1997, Berridge 2016, etc.), and comprehensive continuous endpoint coverage with species-specific half-life data
- **Source B** (uploaded JSON): `recovery_duration_lookup_latest.json` with structured evidence log of 26 entries — threshold severity model, evidence_level field, standardized audit trail
- **Source C** (first merge): resolved major architectural decisions but flattened Source A's granular data

This report documents what Source A contributed that was missing from the first merge.

## What Source A added that the first merge missed

### 1. Specific severity multiplier values

Source B used templated severity models (all `modest` entries had identical 1.0/1.0/1.25/1.5/null; all `threshold` had 1.0/1.0/1.25/null/null). Source A had calibrated values per finding. The three-way merge incorporates A's differentiation where evidence supports it:

| Finding | First merge (B template) | Three-way merge (A-calibrated) | Rationale |
|---|---|---|---|
| Liver hypertrophy | mo=1.25 mk=1.5 | **mo=1.3** mk=1.5 | Hall 2012 supports 1.3x for moderate enzyme induction |
| Liver necrosis | ml=1.0 mo=1.25 mk=null | **ml=1.25 mo=1.5** mk=null | Michalopoulos 2007 supports graduated scaling below threshold |
| Spleen hemosiderosis | all 1.0 (no scaling) | **deposit-proportional: mo=1.5 mk=2.0 sv=2.5** | Iron deposit volume directly affects clearance time |
| Pigmentation (general) | (not present) | **deposit-proportional: mo=1.5 mk=2.0 sv=2.5** | Same deposit-proportional logic |

### 2. Species modifier table: 10 organ-process categories

First merge kept B's 6 categories. Source A had a detailed table grounded in specific biological parameters. Three-way merge adopts A's full table:

| Category | Key change from first merge | Biological basis |
|---|---|---|
| `liver_necrosis_repair` | **NEW** (separated from adaptive) | Same regenerative biology but injury severity matters more |
| `testis_spermatogenic_recovery` | nhp changed from **1.4 to 0.8** | Cynomolgus cycle 42d < rat 52d, so nhp is actually FASTER |
| `thymus_stress_recovery` | nhp changed from **1.5 to 2.0** | Large animal thymic regeneration slower than rodent |
| `bone_marrow_recovery` | nhp changed from **1.4 to 2.0** | HSC frequency inversely proportional to body weight |
| `anemia_rbc_recovery` | **NEW** | RBC lifespan: mouse 45d, rat 60d, dog 110d — largest validated species effect |
| `thyroid_adaptive_recovery` | **NEW** | Rat more sensitive (no TBG, short T4 half-life) |
| `generic_default` | nhp set to **2.0** | Allometric tissue turnover scaling |

**Most consequential change:** NHP spermatogenic modifier went from 1.4 (slower than rat) to 0.8 (faster than rat). This is correct because cynomolgus spermatogenic cycle is ~42 days vs rat ~52 days. The first merge inherited B's value which was biologically wrong.

### 3. Enriched conditions text with specific mechanistic detail

Source A had detailed mechanistic explanations citing specific authors. Examples of what was added:

- **Liver necrosis**: reticulin framework integrity as the irreversibility threshold, rat vs dog peak proliferation timing (24h vs 72h, Michalopoulos 2007)
- **Thyroid hypertrophy**: rat sensitivity due to absent TBG and short T4 half-life (Capen 1997)
- **Testicular recovery**: specific spermatogenic cycle lengths for all 4 species, stem cell vs post-meiotic cell distinction
- **Thymic atrophy**: age as dominant modifier over species, with specific examples (6-week-old rat: ~1 week; 2-year-old dog: minimal recovery)
- **Adrenal**: stress vs direct toxic distinction (Everds 2013, Harvey & Sutcliffe 2010)
- **Heart**: explicit note that inflammation resolution != full recovery (underlying cardiomyocyte loss is permanent)
- **Spleen hemosiderosis**: critical interpretive note that persistence is NOT ongoing toxicity

### 4. Additional source citations

Source A cited ~40 specific references. Key additions to the merged JSON:

| Finding | Citations added |
|---|---|
| Liver hypertrophy | Maronpot 2010, Thoolen 2010 INHAND |
| Liver necrosis | Michalopoulos 2007, Mehendale 2005, Francavilla 1978 |
| Phospholipidosis | Chatman 2009, Lenz 2018 ESTP, Reasor 1984 |
| Bile duct | Hailey 2014, Thoolen 2010 INHAND |
| Kidney | Frazier 2012 INHAND, Hard & Khan 2004, Ritskes-Hoitinga 1992 |
| Thyroid | Capen 1997, Huisinga 2021, Hood 1999, McClain 1989, EPA 1998 |
| Adrenal | Everds 2013, Harvey & Sutcliffe 2010, Rosol 2001, Korpershoek 2014 |
| Thymus | Everds 2013, Pearse 2006, Elmore 2006 |
| Testes | Creasy 1997, Creasy 2001, Lanning 2002, Clegg 1997, Sinha-Hikim 1994 |
| Bone marrow | Reagan 2011, Travlos 2006 |
| Stomach | Ghanayem 1991, Iverson 1985 |
| Heart | Berridge 2016 INHAND |
| Lymph node | Elmore 2006, Haley 2005 |
| Hematology | Derelanko 1987 (RBC lifespan) |

### 5. Granular continuous endpoint tables

First merge had combined ALT/AST and BUN/creatinine. Source A had separate entries with species-specific half-life data. Three-way merge adds:

| Endpoint | Key data from Source A |
|---|---|
| ALT (separate) | Half-life: rat <8h, dog ~60h. 7x faster clearance in rat. |
| AST (separate) | Shorter half-life than ALT. Less liver-specific. |
| ALP | EXCEPTION: recovery LAGS structural repair. Dog C-ALP persists. |
| Albumin | EXCEPTION: LAGS repair. Half-life: rat ~1.7d, dog ~8d. |
| GGT | Induction enzyme, concurrent with ALP. |
| BUN (separate) | GFR and protein catabolism marker. |
| Creatinine (separate) | More specific GFR marker. |
| RBC (severity-stratified) | Mild 10-15%: rat 2-3wk dog 4-6wk. Moderate: rat 3-5wk dog 6-10wk. Severe: rat 6-8wk dog 10-16wk. |
| Kidney weight | 2-6 wk, parallels tubular changes |
| Adrenal weight | 2-4 wk, parallels cortical hypertrophy |
| Spleen weight | 1-4 wk, parallels EMH/lymphoid changes |

### 6. Uncertainty model: organ-specific overrides

Source A noted that highly predictable findings (liver hypertrophy, thymic stress atrophy) warrant tighter bounds, while highly variable findings (injection site, kidney with CPN) warrant wider bounds. Three-way merge adds:

- `organ_specific_tightening`: liver_hypertrophy and thymic_stress_atrophy get +/-20/30% instead of default
- `organ_specific_widening`: injection_site and kidney_with_CPN get +/-30/75%

## All 21 cross-validation decisions

The `cross_validation_log.json` file documents every merge decision with source-A value, source-B value, merged value, and rationale. Summary:

| # | Organ | Finding | Decision type |
|---|---|---|---|
| 1 | LIVER | hypertrophy_hepatocellular | Severity multiplier calibration |
| 2 | LIVER | necrosis_hepatocellular | Severity + species modifier |
| 3 | LIVER | vacuolation_phospholipidosis | New row from A |
| 4 | LIVER | kupffer_cell | Base weeks + reversibility merge |
| 5 | LIVER | glycogen_depletion | Base weeks widened |
| 6 | KIDNEY | tubular_degeneration_necrosis | Base weeks widened |
| 7 | KIDNEY | mineralization | Reclassified to irreversible |
| 8 | KIDNEY | cast_formation | Base weeks merged |
| 9 | THYROID | focal_hyperplasia | New row from A |
| 10 | SPLEEN | hemosiderosis | Severity model changed |
| 11 | THYMUS | cortical_atrophy | Base weeks widened |
| 12 | TESTIS | decreased_spermatogenesis | Base weeks + species (cycle-based) |
| 13 | TESTIS | seminiferous_tubule_atrophy | Base weeks widened |
| 14 | BONE_MARROW | hypocellularity | Base weeks widened |
| 15 | STOMACH | forestomach_hyperplasia | Upper bound extended |
| 16 | STOMACH | ulceration | Upper bound extended |
| 17 | HEART | cardiomyocyte_necrosis | Base weeks nullified |
| 18 | LUNG | inflammation | Base weeks widened |
| 19 | LUNG | alveolar_epithelial_hyperplasia | Base weeks widened |
| 20 | LYMPH_NODE | atrophy | Upper bound extended |
| 21 | GENERAL | hemorrhage/congestion/pigmentation | New section from A |

## Final statistics

| Metric | First merge | Three-way merge |
|---|---|---|
| Organs | 14 | 14 |
| Histopath finding entries | 56 | 56 |
| Species modifier categories | 6 | **10** |
| Continuous endpoint entries | ~15 | **~24** |
| Unique source citations | ~30 | **~50** |
| Cross-validation decisions documented | 8 | **21** |
| Findings with calibrated (non-template) severity | ~2 | **~8** |

## Deliverables

- `recovery_duration_lookup_v3_merged.json` (107 KB) — authoritative machine-readable lookup
- `cross_validation_log.json` (5.4 KB) — decision-by-decision audit trail
- `cross_validation_report.md` — this document
