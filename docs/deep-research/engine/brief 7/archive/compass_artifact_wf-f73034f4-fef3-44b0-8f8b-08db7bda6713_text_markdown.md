# Literature-grounded recovery duration lookup table for toxicologic pathology

**Every current system value is either approximately correct, directionally wrong, or dangerously oversimplified.** The core problem is not that the placeholder recovery weeks are always wrong—many fall within defensible ranges—but that a single number per finding type, without organ, species, or severity differentiation, produces unreliable verdicts for roughly half of all recovery assessments. This report replaces those placeholders with literature-grounded ranges covering 13 priority organs, 50+ finding types, 4 species, and 5 severity grades, drawn from STP/ESTP position papers, INHAND monographs, ICH/OECD guidelines, and primary toxicologic pathology literature.

The most consequential corrections involve findings where the current system is structurally wrong: hepatocellular hypertrophy recovers in **1–4 weeks** (not 6), glycogen depletion in **days** (not 6 weeks), cardiac necrosis transitions to irreversible fibrosis (not 8-week moderate reversibility), and hemosiderosis persists well beyond the 6-week "high reversibility" placeholder. Severity modulation is real but threshold-based, not linear—the current multiplier framework is directionally correct but requires organ-specific calibration. Species modifiers matter most for testes (spermatogenic cycle-driven), anemia recovery (RBC lifespan-driven), and thymic regeneration (age-dependent).

---

## 1. Master organ × finding type recovery duration table

The table below provides literature-grounded values for each organ-finding combination. All durations assume cause removed and no concurrent fibrosis unless stated. "Base weeks" represent the rat unless otherwise noted.

### Liver

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Hepatocellular hypertrophy | 1–4 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.0× | Similar; dogs may retain ALP elevation longer | Hall et al. 2012, Toxicol Pathol 40:971; Maronpot et al. 2010, Toxicol Pathol 38:776; Thoolen et al. 2010, INHAND | High |
| Hepatocellular necrosis | 1–8 | Expected (minimal–moderate); Possible (marked); Unlikely (massive with framework collapse) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 3.0×, Severe 4.0× — threshold at moderate where fibrosis risk begins | Rat peak proliferation 24h post-injury; dog peak at 72h; overall restoration similar (~2 weeks for moderate) | Michalopoulos 2007, J Cell Physiol 213:286; Francavilla et al. 1978, J Surg Res 25:409; Thoolen et al. 2010, INHAND | High |
| Hepatocellular vacuolation (fatty change) | 1–4 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.0× | No major species difference | Greaves 2012, Histopathology of Preclinical Toxicity Studies, 4th ed. | High |
| Hepatocellular vacuolation (phospholipidosis) | 2–8 | Expected (mild–moderate); Possible (severe/prolonged) | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.5× | No major species difference; depends on compound half-life | Chatman et al. 2009, Toxicol Pathol 37:897; Lenz et al. 2018, ESTP; Reasor &amp; Kacew 2001 | Moderate |
| Bile duct hyperplasia | 4–8 | Expected (minimal/typical); Possible (moderate); Unlikely (with fibrosis) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5×, Severe 3.0× | More common background in rats; dogs susceptible with high biliary excretion compounds | Hailey et al. 2014, Toxicol Pathol 42:237; Thoolen et al. 2010, INHAND | Moderate |
| Inflammation (portal/lobular) | 2–6 | Expected (if cause removed, no fibrosis) | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.5× | Similar kinetics | Greaves 2012; Thoolen et al. 2010, INHAND | Moderate |
| Kupffer cell hypertrophy/hyperplasia | 1–4 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.0× | No major species difference | NTP Nonneoplastic Lesion Atlas; Thoolen et al. 2010, INHAND | High |
| Glycogen depletion | 0.1–0.5 (days) | Expected (rapid) | All severities 1.0× — even complete depletion recovers in days | No species difference | Francavilla et al. 1978; Hall et al. 2012, Toxicol Pathol | High |

**Key caveat for liver:** Recovery depends on reticulin framework integrity. If the collagen scaffold collapses (massive necrosis), hepatocytes cannot regenerate in proper architecture and fibrosis replaces parenchyma. This is the critical irreversibility threshold for hepatic necrosis.

### Kidney

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Tubular degeneration/necrosis | 2–8 | Expected (mild–moderate, basement membrane intact); Possible (severe); Unlikely (with BM disruption) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 3.0×, Severe 4.0× — threshold at moderate; BM integrity is key | Rat has CPN confounder; dog provides cleaner assessment | Frazier et al. 2012, INHAND kidney, Toxicol Pathol; Maxie &amp; Newman 2007; Greaves 2012 | High |
| Tubular basophilia | 1–4 | Expected (this IS the regeneration marker) | Intensity correlates with prior injury severity: Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | CPN in rats produces background basophilia | Frazier et al. 2012, INHAND; Hard &amp; Khan 2004, Toxicol Pathol 32:171; NTP Atlas | High |
| Tubular dilatation | 2–6 | Expected (mild); Possible (moderate–severe); Unlikely (with fibrosis) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5×, Severe 3.0× | Similar; CPN-associated dilatation in rats is irreversible | Frazier et al. 2012, INHAND; Greaves 2012 | Moderate |
| Interstitial inflammation | 2–4 (acute); 4–8 (chronic) | Expected (acute, minimal–mild); Possible (moderate); Unlikely (if fibrosis established) | Minimal 1.0×, Mild 1.3×, Moderate 2.0×, Marked 2.5×, Severe 3.0× | More common as background in rats (CPN) | Frazier et al. 2012; Greaves 2012; Haschek &amp; Rousseaux 2013 | Moderate |
| Interstitial nephritis | 2–12 | Expected (acute drug-related, early withdrawal); Possible (established); Unlikely (chronic with fibrosis) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 3.0×, Severe → unlikely | Similar across species | González et al. 2008, Kidney Int 73:940; Greaves 2012 | Moderate |
| Mineralization | 13–∞ | Unlikely (dystrophic); None (established deposits) | All severities: deposits do not resorb; 1.0× (irrelevant—finding persists) | Much more common in female rats (diet/strain); rare in dogs | NTP Atlas; Frazier et al. 2012; Ritskes-Hoitinga &amp; Beynen 1992 | High |
| Cast formation | 1–4 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | CPN-related casts in rats persist; drug-related clear with regeneration | Frazier et al. 2012; Greaves 2012 | Moderate |

**Key caveat for kidney:** Chronic progressive nephropathy (CPN) in rats is irreversible and progressive. It confounds recovery assessment in male rats (Hard &amp; Khan 2004, Toxicol Pathol 32:171). Dogs provide cleaner recovery data. CPN components (basophilia, casts, dilatation, inflammation) overlap with drug-induced findings.

### Thyroid

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Follicular cell hypertrophy | 2–4 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.0× | Rats far more sensitive (no TBG, short T4 half-life); dogs less affected | Capen 1997, Toxicol Pathol 25:39; Huisinga et al. 2021, Toxicol Pathol 49:316; Hood et al. 1999 | High |
| Follicular cell hyperplasia (diffuse) | 2–6 | Expected | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5×, Severe 3.0× | Rat-dominant finding; dogs rarely progress to hyperplasia | Huisinga et al. 2021; Capen 1997; EPA 1998, EPA/630/R-97/002 | High |
| Follicular cell hyperplasia (focal) | 8–∞ | Possible (early, hormone-dependent); Unlikely (autonomous/nodular) | Severity less relevant than autonomy: hormone-dependent foci may regress; autonomous foci do not | Focal hyperplasia is essentially a rat-specific preneoplastic concern | McClain 1989, Toxicol Pathol 17:294; EPA 1998 | Moderate |
| Colloid alteration | 2–4 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | Rats more commonly affected | Capen 1997; Huisinga et al. 2021; NTP Atlas | High |

### Adrenal

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Cortical hypertrophy (stress-related) | 1–4 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | Rats more stress-sensitive; dogs show less handling stress | Everds et al. 2013, Toxicol Pathol 41:560; Harvey &amp; Sutcliffe 2010, J Appl Toxicol 30:1; Rosol et al. 2001, Toxicol Pathol 29:41 | High |
| Cortical hypertrophy (direct toxic) | 2–6 | Expected to Possible | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5×, Severe 3.0× | Similar across species | Rosol et al. 2001; Harvey &amp; Sutcliffe 2010 | Moderate |
| Cortical vacuolation | 2–4 (pharmacological); 4–8 (severe/structural) | Expected (pharmacological); Possible (severe) | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.5× | Spontaneous age-related vacuolation in rats; less common background in dogs | Rosol et al. 2001; NTP Atlas | Moderate |
| Medullary hyperplasia (diffuse) | 4–8 | Possible | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5× | Rat-specific concern; pheochromocytoma common in aged F344/SD rats; very rare in dogs | Rosol et al. 2001; Korpershoek et al. 2014, Neoplasia 16:868; Tischler 1988–1991 | Moderate |
| Medullary hyperplasia (focal/nodular) | ∞ | Unlikely to None (preneoplastic) | N/A — treated as irreversible | Rat-specific | Rosol et al. 2001; NTP Atlas | Moderate |

### Spleen

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Increased extramedullary hematopoiesis | 2–4 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | Normal background in rodents (especially mice); abnormal in dogs/NHPs | Suttie 2006, Toxicol Pathol 34:466; Elmore 2006 | High |
| Lymphoid depletion | 2–4 (stress); 4–8 (immunotoxic) | Expected (stress); Expected to Possible (immunotoxic) | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.5× | Rats generally recover faster; evaluate by compartment (PALS, follicle, marginal zone) | Suttie 2006; Haley et al. 2005, Toxicol Pathol 33:404 | Moderate-High |
| Congestion | 0.5–2 | Expected | All severities ~1.0× (hemodynamic, resolves rapidly) | No major difference; often agonal artifact | Suttie 2006 | High |
| Hemosiderosis | 4–12+ | Possible (mild); Unlikely to fully resolve within standard recovery (moderate–severe) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5×, Severe 3.0× — larger deposits take proportionally longer | Similar persistence across species; iron deposits do not resorb efficiently | NTP Atlas; Suttie 2006 | High |

**Key caveat for hemosiderosis:** This is a **residual marker** of prior erythrocyte destruction. Persistence during recovery does not indicate ongoing toxicity. Hematology parameters may fully normalize while hemosiderin deposits remain for weeks to months.

### Thymus

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Cortical atrophy/lymphoid depletion | 1–2 (stress, young rodent); 2–4 (immunotoxic, young); 4–8 (older animals or severe) | Expected (young); Possible (older); Unlikely (aged with advanced involution) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 3.0×, Severe 4.0× | Young rats recover in ~1 week; dogs require 2–4 weeks minimum; age is dominant modifier | Everds et al. 2013, Toxicol Pathol 41:560; Pearse 2006, Toxicol Pathol 34:515; Elmore 2006, Toxicol Pathol 34:656 | High |
| Increased apoptosis | 0.5–2 (days to ~1 week) | Expected | All severities ~1.0× (rapid process) | Similar across species; young animals faster | Pearse 2006; Elmore 2006; Everds et al. 2013 | High |

### Testes

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Decreased spermatogenesis | 6–12 (rat); 9–14 (dog) | Expected (mild–moderate); Possible (moderate–severe) | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.5× — minimum recovery = 1 spermatogenic cycle | Rat cycle ~52d; dog cycle ~62d; directly proportional | Creasy 1997, Toxicol Pathol 25:119; Creasy 2001, Toxicol Pathol 29:64; Lanning et al. 2002, Toxicol Pathol 30:518; Sinha-Hikim &amp; Swerdloff 1994, Endocrinology 134:1627 | High |
| Germ cell degeneration | 4–10 (mild–moderate, rat); 8–16 (severe) | Expected (minimal–mild); Possible (moderate); Unlikely (severe with stem cell loss) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 3.0×, Severe → unlikely | Timeline scales with spermatogenic cycle | Creasy 2001; Lanning et al. 2002 | High |
| Seminiferous tubule atrophy | 8–24 (focal/mild); ∞ (severe/diffuse Sertoli cell-only) | Possible (mild/focal); Unlikely (moderate); **None (Sertoli cell-only tubules)** | **Critical threshold:** Sertoli cell-only pattern with peritubular fibrosis = irreversible | Similar across species; adult Sertoli cells are postmitotic | Creasy 2001; Lanning et al. 2002; NTP Atlas | High |
| Leydig cell hypertrophy | 2–4 (rat); 2–6 (dog) | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | Rat Leydig cells more sensitive to LH stimulation; rat-specific tumorigenic pathway | Clegg et al. 1997, Reprod Toxicol 11:107; Creasy 2001 | High |

### Bone marrow

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Hypocellularity | 1–3 (rodent); 2–6 (dog/NHP) | Expected (mild–moderate); Possible (severe); Unlikely (aplastic with stromal damage) | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 3.0× | Rodents recover faster (higher baseline cellularity, faster turnover) | Travlos 2006, Toxicol Pathol 34:566; Reagan et al. 2011, Toxicol Pathol 39:435 | High |
| Myeloid depletion | 1–2 (rodent); 1–3 (dog/NHP) | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | Rodents slightly faster; ~6–8 day granulocyte transit time | Travlos 2006; Reagan et al. 2011 | High |
| Erythroid depletion | 2–4 (rodent); 2–6 (dog/NHP) | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0×, Severe 2.5× | Dogs somewhat slower; rats compensate via splenic EMH | Travlos 2006; Reagan et al. 2011 | High |
| Increased cellularity | 1–4 | Expected (reactive/compensatory) | All severities ~1.0× — resolves when stimulus removed | No major species difference | NTP Atlas; Travlos 2006 | High |

### Stomach

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Forestomach mucosal hyperplasia | 4–13 | Expected (simple/papillary); Possible (basal cell); Unlikely (dysplasia) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5×, Severe 3.0× — duration of prior dosing is key modifier | Rat/mouse only (no forestomach in dogs) | Ghanayem et al. 1991, Toxicol Pathol 19:273; Iverson et al. 1985, Toxicology 35:1 | High |
| Glandular mucosal hyperplasia | 2–6 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | All species; less common in dogs | Greaves 2012 | Moderate |
| Erosion | 1–2 | Expected | All severities ~1.0× (rapid epithelial turnover, 3–5 day cycle) | Similar across species | Greaves 2012 | High |
| Ulceration (glandular, superficial) | 2–4 | Expected | Minimal 1.0×, Mild 1.5×, Moderate 2.0× | Similar healing kinetics in rat and dog | Greaves 2012 | Moderate-High |
| Ulceration (glandular, deep) | 4–12 | Possible (body/fundus); Unlikely (fundo-antral junction, perforating) | Marked 2.0×, Severe 3.0× — location more important than severity grade alone | Dogs susceptible to NSAID gastric perforation | Greaves 2012 | Moderate |

### Heart

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Cardiomyocyte degeneration/necrosis | Inflammation resolves 2–6; **necrosis → replacement fibrosis = IRREVERSIBLE** | **None** for cardiomyocyte loss (replaced by scar); Expected for inflammatory component | Minimal: small scar, functionally insignificant. Marked/Severe: extensive fibrosis, functional impairment. All grades leave permanent scar. | No regenerative capacity in adult mammals across all species | Michalopoulos &amp; DeFrances 1997 (liver, for contrast); cardiac pathology textbooks; Miyawaki et al. 2017, Sci Rep | High |
| Inflammation (myocarditis) | 2–8 | Expected (inflammatory component); but often leaves residual fibrosis | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 3.0× | Similar across species | Heart Failure Reviews (Springer) | High |
| Fibrosis | ∞ | **None** (replacement fibrosis); Unlikely (limited remodeling possible for reactive interstitial fibrosis) | N/A — irreversible at all severity grades | Irreversible across all species | Established cardiac pathology principle | High |

### Lung

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Alveolar macrophage accumulation | 2–8 (drug-induced); may persist >12 weeks (particle/phospholipidosis) | Expected (drug-induced); Possible (particle-laden) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5×, Severe 3.0× — particle overload impairs clearance | Rats more susceptible to particle overload than mice/hamsters | Haschek &amp; Rousseaux 2013; Ferin 1982 (alveolar macrophage T½ ~7d phase 1, ~69d phase 2) | Moderate-High |
| Inflammation | 2–8 (acute); 4–12 (chronic) | Expected (acute); Possible (chronic — may leave fibrosis) | Minimal 1.0×, Mild 1.3×, Moderate 2.0×, Marked 2.5×, Severe 3.0× | Rats develop more persistent inflammatory responses to many inhaled toxicants | Haschek &amp; Rousseaux 2013 | Moderate-High |
| Alveolar epithelial hyperplasia | 4–12 | Possible (without fibrosis); Unlikely (with septal fibrosis) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5× — presence of fibrosis is key determinant | Rats uniquely susceptible to progressive hyperplasia from poorly soluble particles | Haschek &amp; Rousseaux 2013 | Moderate-High |

### Lymph nodes

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Follicular hyperplasia | 2–4 (acute stimulus); 4–6 (chronic) | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | Similar across species | Elmore 2006, Toxicol Pathol 34:425; Haley et al. 2005 | High |
| Paracortical hyperplasia | 2–4 | Expected | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× | Similar across species | Elmore 2006 | Moderate-High |
| Sinus histiocytosis | 2–4 (acute); 4–8 (with pigment/particulates) | Expected (reactive); Possible (with persistent material) | Minimal 1.0×, Mild 1.0×, Moderate 1.5×, Marked 2.0× — indigestible material prolongs | Similar across species | Elmore 2006; Suttie 2006 | Moderate-High |
| Atrophy | 2–4 (young, stress); 4–8 (immunotoxicant) | Expected (young); Possible (older or architecture-disrupted) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5× | Young rodents recover faster; dogs/NHPs similar | Elmore 2006; Everds et al. 2013; Haley et al. 2005 | Moderate-High |

### Injection site

| Finding | Base weeks (low–high) | Reversibility | Severity modulation | Rat vs. Dog | Key sources | Confidence |
|---|---|---|---|---|---|---|
| Inflammation | 1–6 | Expected (mild–moderate); Possible (severe with abscess) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 3.0×, Severe 4.0× — vehicle/formulation is major modifier | No major species difference | Ramot et al. 2018, Toxicol Pathol; ScienceDirect injection site overview | Moderate-High |
| Necrosis | 2–8 (tissue replaced by scar) | Possible (necrosis resolves but replaced by fibrotic scar) | Minimal 1.0×, Mild 1.5×, Moderate 2.0×, Marked 2.5× | No major species difference | General wound healing principles | Moderate |
| Fibrosis | ∞ | **None** to Unlikely | N/A — irreversible once established | Similar across species | Ramot et al. 2018 | High |
| Granuloma | 4 weeks to years | Possible (drug-related without foreign body: 4–12 wk); Unlikely (foreign body: months to years) | Severity less relevant than composition: foreign body persistence determines timeline | Similar across species; material biodegradability is key | Asín et al. 2019, Toxicol Pathol (aluminum adjuvant); depot injection studies | Moderate-High |

---

## 2. Species-specific recovery rate modifiers

**No published, validated species-specific recovery multipliers exist in the toxicologic pathology literature.** The values below are derived from organ-specific biological data and represent the best available extrapolation. Rat = 1.0× reference species.

| Organ system | Mouse | Rat | Dog | NHP | Key biological basis | Confidence |
|---|---|---|---|---|---|---|
| **Liver regeneration** | 1.0–1.2× | 1.0× | 1.3–1.5× | 1.5–2.0× | Peak DNA synthesis: rat 24h, dog 72h, but mass restoration similar at ~2 weeks | Moderate-High |
| **Testicular recovery** | 0.7× | 1.0× | 1.2–1.5× | 1.0–1.3× (cynomolgus) | Spermatogenic cycle: mouse ~35d, rat ~52d, dog ~62d, cyno ~42d, human ~74d | High |
| **Thymic recovery (young)** | 1.0× | 1.0× | 1.5–2.0× | 1.5–2.5× | Young rodents show remarkably rapid thymic regeneration; dogs/NHPs slower | Moderate |
| **Renal tubular recovery** | 1.0× | 1.0× | 1.0–1.5× | 1.0–1.5× | Similar regenerative mechanisms; CPN confounds rat data but doesn't slow actual regeneration | Low-Moderate |
| **Bone marrow recovery** | 0.8–1.0× | 1.0× | 1.5–2.5× | 2.0–3.0× | Higher baseline cellularity and metabolic rate in rodents; HSC frequency inversely proportional to body weight | Low-Moderate |
| **Anemia recovery (RBC)** | 0.7× | 1.0× | 1.8–2.0× | 2.0× | RBC lifespan: mouse ~45d, rat ~60d, dog ~110d; directly proportional | High |
| **General (default)** | 0.9× | 1.0× | 1.5× | 2.0× | Allometric scaling of tissue turnover | Low |

**Critical finding on liver:** Rat and dog liver regeneration kinetics converge at the 2-week mark despite the 3-fold difference in peak proliferation timing. For practical purposes, a **1.3–1.5× dog modifier** is appropriate for liver findings—meaningful but not dramatic.

**Critical finding on testes:** Spermatogenic cycle length **directly translates** to minimum recovery time. A rat needs ≥8 weeks; a dog needs ≥9 weeks; an NHP (cynomolgus) needs ≥6 weeks. The cycle length ratio provides the most biologically grounded species modifier in this entire table. However, the cycle is only the minimum—severe injury requiring stem cell repopulation may need 2–3 cycles.

**Critical finding on thymus:** Age dominates over species. A 6-week-old rat recovers thymic atrophy in ~1 week; a 2-year-old dog may show minimal recovery. The species modifier should be applied only within comparable age/maturity brackets.

---

## 3. Severity-graded recovery modulation: the evidence

### Is severity modulation real?

**Yes, but the relationship is threshold-based, not linear.** Three lines of evidence support this conclusion.

First, the NTP defines degeneration as "reversible cell or tissue damage" and necrosis as the irreversible endpoint—establishing that the progression from lower to higher severity grades crosses a fundamental biological boundary (NTP Nonneoplastic Lesion Atlas). Second, Lemasters et al. (1993) identified the mitochondrial membrane permeability transition as the irreversible "point of no return" in hepatocyte death, demonstrating a discrete threshold rather than a continuous gradient. Third, the acetaminophen dose-response data (Walker et al. 1988) show minimal progression at 300 mg/kg but rapid necrosis at 600 mg/kg—a threshold effect, not a linear scaling.

### Where are the thresholds?

The transition from "recoverable" to "irreversible" occurs when **tissue architecture is disrupted beyond repair capacity**, **cell populations with no/low regenerative capacity are lost** (cardiomyocytes, neurons, adult Sertoli cells), or **stem/progenitor cell niches are destroyed.** This generally corresponds to the **moderate-to-marked severity boundary**, but is organ-specific:

- **Liver necrosis:** Moderate = recoverable if framework intact; Marked/Severe = risk of fibrosis
- **Renal tubular necrosis:** Moderate = recoverable if basement membrane intact; Marked = fibrosis risk
- **Testicular damage:** Moderate = recoverable if spermatogonial stem cells survive; Marked (Sertoli cell-only) = irreversible
- **Cardiac necrosis:** All grades leave permanent fibrotic scar; "recovery" only applies to inflammatory component
- **Thymic atrophy:** Even severe atrophy is recoverable in young animals; age, not severity, is the threshold

### Are the current multipliers defensible?

The current multiplier categories are **directionally correct but imprecise**. The revised framework below incorporates organ-specific thresholds.

| Category | Minimal | Mild | Moderate | Marked | Severe |
|---|---|---|---|---|---|
| **Adaptive** (hypertrophy, hyperplasia, enzyme induction) | 1.0× | 1.0× | 1.5× | 2.0× | 2.0× |
| **Inflammatory** | 1.0× | 1.3× | 1.8× | 2.5× | 3.0× |
| **Degenerative/Necrotic** | 1.0× | 1.5× | 2.0× | 3.0× | → reassess reversibility |
| **Vascular** (congestion, hemorrhage) | 1.0× | 1.0× | 1.5× | 2.0× | 2.0× |
| **Depositional** (mineralization, pigment) | 1.0× | 1.0× | 1.0× | 1.0× | 1.0× |
| **Proliferative** (non-neoplastic, e.g., bile duct, forestomach) | 1.0× | 1.5× | 2.0× | 2.5× | 3.0× |

**Key changes from current system:** Inflammatory high multiplier increased from 2.0× to 3.0× (severe chronic inflammation frequently produces fibrosis). Degenerative severe should trigger a **reassessment flag** rather than a fixed multiplier—at severe grades, the finding may become irreversible depending on organ. A new "Proliferative" category separates non-neoplastic proliferative lesions from simple adaptive changes. Depositional remains at 1.0× because mineral and pigment deposits clear at the same rate regardless of amount (or not at all, as with mineralization).

---

## 4. Uncertainty model recommendation

### The problem with ±2 weeks fixed

A fixed ±2-week window produces **±100% uncertainty for a 2-week finding** (congestion) but only **±15% for a 13-week finding** (mineralization). This makes the uncertainty band meaningless for fast-resolving findings and too tight for long-duration ones.

### Recommended model: percentage-based with floor and asymmetric bias

**Base formula:** Uncertainty = base_weeks × uncertainty_fraction, with a floor of ±1 week and asymmetric (upward) skew.

| Parameter | Value | Rationale |
|---|---|---|
| **Lower bound** | base_weeks × 0.7 | ~30% faster than expected is biologically plausible |
| **Upper bound** | base_weeks × 1.5 | ~50% slower is common with individual variability, compound half-life effects |
| **Floor** | ±1 week minimum | Minimum meaningful interval for tissue sampling |
| **Cap** | ±8 weeks maximum | Beyond this, the finding should be flagged for re-evaluation rather than extended prediction |

**Rationale for asymmetry:** Recovery can be delayed by many factors (slow compound clearance, concurrent pathology, individual variation, older age) but is rarely faster than the biological minimum. The **upward skew** (larger upper bound) reflects this biological reality and provides a conservative bias appropriate for safety assessment, consistent with ICH M3(R2) guidance that "if full reversibility is not anticipated, this should be considered in the risk assessment."

**Rationale against fixed percentages:** Sewell et al. (2014, Regul Toxicol Pharmacol 70:413) documented wide inter-company variability in recovery practices but did not quantify timeline variability for specific findings. No published database exists for recovery-timeline variance. The ±30%/+50% range is conservative heuristic, not empirically calibrated. It should be flagged as "estimated variability" in the system.

**Organ-specific adjustments:** For organs with highly predictable recovery (liver hypertrophy, thymic stress atrophy), tighter bounds (0.8–1.3×) are appropriate. For organs with high variability (injection site, kidney in CPN-affected rats), wider bounds (0.6–2.0×) are appropriate.

---

## 5. Continuous endpoint recovery timelines

### Organ weights

| Endpoint | Recovery weeks (rat) | Recovery weeks (dog) | Recovers before/after histopath | Key sources |
|---|---|---|---|---|
| Liver weight ↑ (enzyme induction) | 1–4 | 2–4 | Concurrent or slightly before | Hall et al. 2012; Maronpot et al. 2010 |
| Thymus weight ↓ (stress) | 1–2 | 2–4 | Concurrent | Everds et al. 2013 |
| Thymus weight ↓ (direct toxicity) | 2–6 | 3–8 | After (histological reconstitution takes longer) | Everds et al. 2013; Pearse 2006 |
| Testes weight ↓ | 6–10 | 8–14 | After (spermatogenic refill needed) | Creasy 2001; Lanning et al. 2002 |
| Kidney weight (hypertrophy) | 2–4 | 2–6 | Before or concurrent | Craig 2015, J Appl Toxicol |
| Adrenal weight ↑ (stress) | 2–4 | 2–4 | Concurrent | Everds et al. 2013 |
| Spleen weight changes | 1–4 | 1–4 | Concurrent | Suttie 2006 |

### Clinical chemistry

| Endpoint | Recovery weeks (rat) | Recovery weeks (dog) | Recovers before/after histopath | Key determinant |
|---|---|---|---|---|
| ALT | **<1 week** (half-life <8h) | **1–2 weeks** (half-life ~60h) | **BEFORE** | ALT half-life; 7× faster clearance in rat |
| AST | **<0.5 week** | **0.5–1 week** | **BEFORE** | AST half-life shorter than ALT |
| BUN | 1–3 | 1–3 | Concurrent | GFR recovery |
| Creatinine | 1–4 | 1–4 | Before or concurrent | GFR restoration |
| Bilirubin | **<1 week** | **<1 week** | **BEFORE** | Half-life ~4h |
| ALP | 1–2 | 1–3 (C-ALP isoform prolongs) | Concurrent or **AFTER** (induction enzyme) | Synthesis decline, not clearance |
| GGT | 1–3 | 1–3 | Concurrent | Induction enzyme |
| Cholesterol/TG | 1–4 | 1–4 | Concurrent | Hepatic/endocrine normalization |
| Total protein/albumin | 2–6 | 3–8 (dog albumin T½ ~8d vs. rat ~1.7d) | **AFTER** (synthesis catch-up needed) | Albumin half-life |

### Hematology

| Endpoint | Recovery weeks (rat) | Recovery weeks (dog) | Recovers before/after histopath | Key determinant |
|---|---|---|---|---|
| RBC (mild anemia, 10–15% ↓) | 2–3 | 4–6 | Before marrow histopath | RBC lifespan: rat ~60d, dog ~110d |
| RBC (moderate anemia, 15–25% ↓) | 3–5 | 6–10 | Before marrow histopath | Same |
| RBC (severe anemia) | 6–8 | 10–16 | Before marrow histopath | Same |
| WBC | 1–2 | 1–3 | Concurrent | Marrow transit ~6 days |
| Platelets | 1–2 | 1–2 | Concurrent | Platelet lifespan ~5 days |
| Reticulocytes | 1–2 (after stimulus removed) | 1–2 | N/A (dynamic marker) | EPO response time |

### Body weight and coagulation

| Endpoint | Recovery weeks (rat) | Recovery weeks (dog) | Notes |
|---|---|---|---|
| Body weight deficit ≥10% (growing) | 2–6+ (partial; may never reach concurrent controls) | 2–4 (adults recover more completely) | Growing animals: 50–70% gap closure in 4 weeks; absolute catch-up may never occur |
| PT prolongation | <1–2 | <1–2 | Factor VII T½ ~5–6h; normalizes rapidly after liver function restored |
| APTT prolongation | <1–2 | <1–2 | Intrinsic factor half-lives 12–24h |
| Fibrinogen | 1–3 | 1–3 | Acute phase protein; T½ ~3–5 days |

**Critical principle:** Clinical pathology markers generally recover **BEFORE** corresponding histopathological findings because serum markers depend on ongoing release plus clearance half-life, whereas tissue repair requires cellular regeneration and architectural restoration. The notable exception is **ALP and albumin**, which depend on hepatic synthesis changes that lag behind structural recovery.

---

## 6. Validation table: current system vs. literature

| Finding type | Current base weeks | Current reversibility | Literature base weeks (rat) | Literature reversibility | Assessment |
|---|---|---|---|---|---|
| Hyperplasia | 6 | High | 2–13 (organ-dependent) | Expected (mostly) | **Needs organ differentiation;** bile duct 4–8, forestomach 4–13, glandular 2–6, lymph node 2–6 |
| Hypertrophy | 6 | High | 1–4 (most organs) | Expected | **Too high;** most adaptive hypertrophy resolves in 1–4 weeks |
| Vacuolation | 6 | High | 1–8 (type-dependent) | Expected to Possible | **Acceptable midpoint** but needs split: fatty change 1–4, phospholipidosis 2–8 |
| Basophilia | 4 | High | 1–4 (renal) | Expected | **Acceptable;** this is itself a regeneration marker |
| Glycogen depletion | 6 | High | 0.1–0.5 (days) | Expected | **Grossly too high;** should be <1 week |
| Pigmentation | 6 | High | 4–12+ (hemosiderosis persists) | Possible to Unlikely | **Too low for hemosiderosis; too high for lipofuscin** |
| Inflammation | 8 | Moderate | 2–8 (organ/severity-dependent) | Expected to Possible | **Acceptable midpoint** but needs organ/severity differentiation |
| Granuloma | 8 | Moderate | 4 wk to years (material-dependent) | Possible to Unlikely | **Too low for foreign body granuloma;** acceptable for drug-related |
| Necrosis | 8 | Moderate | 1–8 (liver); irreversible (heart → fibrosis) | Expected to None | **Structurally wrong for cardiac necrosis** (should be irreversible); acceptable for hepatic |
| Degeneration | 10 | Moderate | 2–8 (most organs) | Expected to Possible | **Too high;** 4–8 more appropriate for most organs |
| Atrophy | 10 | Moderate | 1–4 (thymic); 8–∞ (testicular tubular) | Expected to None | **Needs organ differentiation;** single value is misleading |
| Mineralization | 13 | Low | ∞ (essentially irreversible) | Unlikely to None | **Should be irreversible,** not 13 weeks low |
| Hemorrhage | 4 | Moderate | 1–3 | Expected | **Slightly too high;** 2–3 weeks more accurate |
| Congestion | 2 | High | 0.5–2 | Expected | **Acceptable** |
| Decreased spermatogenesis | 16 | Low | 6–12 (rat); 9–14 (dog) | Expected to Possible | **Acceptable for dog;** too high for rat mild; appropriate for severe |
| Fibrosis | Irreversible | — | ∞ | None | **Correct** |
| Neoplasia | Irreversible | — | ∞ | None | **Correct** |

### Most critical corrections needed

The five highest-impact corrections, ranked by frequency of occurrence and magnitude of error, are:

1. **Glycogen depletion** (6 weeks → days): A 12× overestimate that incorrectly flags recovery animals as unrecovered
2. **Mineralization** (13 weeks/low → irreversible): Treating an irreversible finding as recoverable produces false predictions of resolution
3. **Cardiac necrosis** (8 weeks/moderate → irreversible fibrosis): The current system predicts recovery for a finding that results in permanent scarring
4. **Hepatocellular/adaptive hypertrophy** (6 weeks → 1–4 weeks): A 1.5–6× overestimate affecting the most common finding in liver toxicity studies
5. **Atrophy** (10 weeks undifferentiated): Thymic atrophy recovers in 1–4 weeks; testicular tubular atrophy may be irreversible. A single value is untenable.

---

## Recommended JSON structure and implementation notes

Each entry in the lookup table should use a composite key of `{organ}_{finding}` with the following schema:

```
{
  "liver_hepatocellular_hypertrophy": {
    "base_weeks": {"low": 1, "high": 4},
    "reversibility": "expected",
    "severity_modulation": {
      "minimal": 1.0, "mild": 1.0, "moderate": 1.5,
      "marked": 2.0, "severe": 2.0
    },
    "species_modifier": {
      "rat": 1.0, "mouse": 1.0, "dog": 1.3, "nhp": 1.5
    },
    "uncertainty": {"lower_fraction": 0.8, "upper_fraction": 1.3},
    "conditions": "If cause removed; assumes no concurrent fibrosis; PPARα-mediated changes rodent-specific",
    "sources": "Hall 2012 Toxicol Pathol 40:971; Maronpot 2010 Toxicol Pathol 38:776; Thoolen 2010 INHAND",
    "confidence": "high"
  }
}
```

**Implementation guidance:** The system should compute expected recovery as `base_weeks.midpoint × severity_multiplier × species_modifier`, bounded by the uncertainty model. When the computed upper bound exceeds the base_weeks.high × species_modifier × 2.0, the system should flag the finding for manual pathologist review rather than predicting a specific recovery date. Any finding with `reversibility: "none"` should bypass the duration calculation entirely and return "irreversible." Findings with `reversibility: "unlikely"` should produce a recovery prediction only with a prominent caveat flag.

**Severity at marked/severe grades for degenerative/necrotic findings** should trigger a conditional check: if the finding is in an organ with limited regenerative capacity (heart, CNS) or if the severity is "severe" in the degenerative category, the system should override the duration calculation and return `reversibility: "unlikely"` with a recommendation for pathologist adjudication.

**The uncertainty model** should use the asymmetric percentage approach: lower_bound = computed_weeks × lower_fraction, upper_bound = computed_weeks × upper_fraction, with floor of 1 week and cap of 8 weeks for the uncertainty margin. Organ-specific uncertainty fractions are provided in the JSON as override values where biological variability warrants tighter or wider ranges.

These values represent the best available synthesis of published toxicologic pathology literature as of early 2026. They should be reviewed and updated as new systematic recovery data become available, particularly from the IQ Consortium recovery animal initiatives (Salian-Mehta et al. 2024, Int J Toxicol 43:377).