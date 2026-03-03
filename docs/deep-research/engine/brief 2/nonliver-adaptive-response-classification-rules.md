# Organ-specific adaptive response classification decision trees

Five non-liver organ systems frequently produce findings in preclinical studies that may be adaptive rather than adverse. **The decision trees below encode morphological pattern recognition logic with concurrent finding checks**, designed as extensions to a syndrome detection engine analogous to the Hall 2012 liver framework. Each tree terminates in a classification of **adaptive**, **adverse**, or **equivocal**, and cites the primary regulatory or expert consensus source supporting each branch.

The overarching framework draws from ECETOC Technical Report No. 85 (2002), which established the B-2 criterion ("an effect is less likely to be adverse if it is an adaptive response") and the B-7 criterion ("an effect is less likely to be adverse if it is secondary to other adverse effects"). These criteria inform every tree below. The ESTP 4th International Expert Workshop (Palazzi et al., *Toxicologic Pathology* 44:810–824, 2016) further defined adversity as "a test item-related change that likely results in impairment of functional capacity to maintain homeostasis and/or impairment of the capacity to respond to an additional challenge." This operational definition anchors the adversity thresholds throughout.

---

## 1. Thyroid follicular cell hypertrophy and hyperplasia in rodents

The central question is whether thyroid follicular changes arise from hepatic enzyme induction (extrathyroidal, adaptive) or from direct thyroid gland toxicity (intrathyroidal, adverse). The Capen 1997 mode-of-action framework established the key event sequence: hepatic UGT induction → increased T4 glucuronidation → decreased serum T4 → compensatory TSH elevation → follicular cell stimulation. Rats are uniquely vulnerable because adult rats functionally lack thyroxine-binding globulin, producing a **T4 half-life of 12–24 hours versus 5–9 days in humans** — an 8- to 16-fold difference in turnover rate. This species difference underpins every regulatory position on human relevance.

The ESTP 6th International Expert Workshop (Huisinga et al., *Toxicologic Pathology* 48:920–938, 2020) — endorsed by all major toxicologic pathology societies — concluded that diffuse follicular cell hypertrophy and diffuse follicular cell hyperplasia are physiological adaptive responses when recorded in the absence of focal hyperplasia or neoplasia. Focal follicular cell hyperplasia and neoplasia are generally irreversible and adverse.

```
DECISION TREE 1: THYROID FOLLICULAR CELL HYPERTROPHY/HYPERPLASIA

ENTRY: Thyroid follicular cell hypertrophy OR diffuse hyperplasia detected

├─ NODE 1: Lesion morphology classification
│   ├─ IF focal follicular cell hyperplasia OR follicular adenoma/carcinoma
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Focal hyperplasia is pre-neoplastic and generally irreversible
│   │   (Huisinga et al. 2020, Toxicol Pathol 48:920–938; Capen 1997,
│   │   Toxicol Pathol 25:39–48)
│   │
│   └─ IF diffuse follicular cell hypertrophy OR diffuse follicular cell hyperplasia
│       THEN → proceed to NODE 2
│
├─ NODE 2: Severity assessment
│   ├─ IF severity grade = minimal to mild
│   │   THEN → proceed to NODE 3
│   │
│   └─ IF severity grade = moderate to marked
│       THEN → proceed to NODE 3 (but flag: higher severity increases
│       equivocal risk even with supportive MOA data)
│
├─ NODE 3: Evidence of hepatic enzyme induction (extrathyroidal MOA)?
│   ├─ IF concurrent liver weight increase (≥10% above control)
│   │   AND concurrent hepatocellular hypertrophy (centrilobular)
│   │   AND evidence of UGT/CYP enzyme induction (measured or inferred
│   │       from compound class: CAR/PXR/AhR activator)
│   │   AND no concurrent hepatic necrosis or severe hepatotoxicity
│   │   THEN → proceed to NODE 4
│   │   RATIONALE: Liver findings confirm extrathyroidal mechanism
│   │   (Capen 1997; McClain 1995, Mutat Res 333:131–142;
│   │   Hall et al. 2012, Toxicol Pathol 40:971–994)
│   │
│   └─ IF liver weight/hypertrophy/enzyme induction NOT present
│       THEN → proceed to NODE 5 (intrathyroidal mechanism suspected)
│
├─ NODE 4: Hormonal pattern consistent with enzyme induction?
│   ├─ IF serum T4 decreased
│   │   AND serum TSH increased
│   │   AND dose-response concordance between liver and thyroid changes
│   │   AND compound is non-genotoxic (negative Ames, no clastogenicity)
│   │   THEN → proceed to NODE 4A
│   │
│   ├─ IF hormonal data unavailable
│   │   AND all other criteria in NODE 3 met
│   │   THEN classification = "EQUIVOCAL"
│   │   RATIONALE: EPA 1998 framework requires hormonal data as one of
│   │   five required data lines (EPA/630/R-97/002; Hill et al. 1998,
│   │   Environ Health Perspect 106:447–457)
│   │
│   └─ IF T4 NOT decreased OR TSH NOT increased
│       THEN → proceed to NODE 5
│
├─ NODE 4A: Species-relevance assessment (rodent-specific mechanism)
│   ├─ IF species = rat
│   │   AND diffuse hypertrophy/hyperplasia only (no focal lesions)
│   │   AND severity ≤ mild
│   │   AND all NODE 3 + NODE 4 criteria met
│   │   THEN classification = "ADAPTIVE"
│   │   (Not adverse to the animal; not relevant to humans)
│   │   RATIONALE: Rat lacks functional TBG; T4 half-life 12–24 h vs.
│   │   5–9 days in humans; TSH-mediated follicular proliferation is
│   │   a rodent-specific sensitivity (Capen 1997; Bartsch et al. 2018,
│   │   Regul Toxicol Pharmacol 98:199–208; ECHA CLP Guidance 2015/2024;
│   │   Huisinga et al. 2020)
│   │
│   ├─ IF species = rat
│   │   AND diffuse hyperplasia (moderate to marked)
│   │   AND all NODE 3 + NODE 4 criteria met
│   │   THEN classification = "EQUIVOCAL"
│   │   RATIONALE: Higher severity diffuse hyperplasia may indicate
│   │   greater proliferative stimulus; reversibility should be
│   │   demonstrated (ESTP 6th Workshop, Huisinga et al. 2020)
│   │
│   └─ IF species ≠ rat (mouse, dog, primate)
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: Species-specific protection argument is weaker
│       outside the rat; requires case-specific evaluation
│       (Dellarco et al. 2006, Crit Rev Toxicol 36:793–801)
│
├─ NODE 5: Evidence of direct thyroid toxicity (intrathyroidal MOA)?
│   ├─ IF compound inhibits TPO (thyroid peroxidase) OR NIS (sodium-iodide
│   │   symporter) OR thyroid hormone synthesis directly
│   │   OR thyroid changes occur WITHOUT liver enzyme induction
│   │   OR compound is genotoxic
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Direct thyroid toxicants operate through mechanisms
│   │   conserved across species; human relevance presumed
│   │   (EPA 1998; Capen 1997; Hurley 1998, Environ Health Perspect
│   │   106:437–445)
│   │
│   └─ IF mechanism unclear and data insufficient to assign MOA
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: EPA default — thyroid tumors presumed relevant to
│       humans absent chemical-specific MOA data (EPA/630/R-97/002)

REGULATORY POSITION SUMMARY:
- FDA: TSH-mediated thyroid tumors in rats NOT relevant to humans
- ECHA/CLP: UGT-induction-mediated thyroid tumors NOT relevant to humans
- IARC: Rodents more sensitive; limited human relevance (IARC Sci Pub 147, 1999)
- EPA: More conservative — presumes relevance but permits nonlinear dose-response
  for established TSH-mediated MOA (EPA/630/R-97/002, 1998)
- ICH S1B(R1) (2022): WoE approach can determine thyroid follicular tumors from
  enzyme induction do not add value to human carcinogenicity risk assessment
```

**Key encodable parameters for the syndrome engine:** Liver weight ratio (≥1.10× control), hepatocellular hypertrophy (present/absent), serum T4 fold-change (decreased), serum TSH fold-change (increased), genotoxicity battery result (positive/negative), lesion type (diffuse vs. focal), severity grade (1–4 scale), species identifier.

---

## 2. Adrenal cortical hypertrophy

Adrenal cortical hypertrophy is one of the most common endocrine findings in toxicology studies, yet its interpretation is notoriously context-dependent. The critical distinction is between **stress-mediated ACTH-driven hypertrophy** (secondary, non-adverse per ECETOC B-7) and **direct adrenocortical toxicity** (adverse). Harvey and Sutcliffe (2010) provided the definitive diagnostic framework, concluding that "all cases of adrenocortical hypertrophy require further investigation" and that adrenocortical insufficiency — whether structural or pharmacological — **is always a serious adverse effect**.

Rosol et al. (2001) established that the adrenal cortex is the most common endocrine organ affected by chemically induced lesions, with the zona fasciculata and reticularis affected more frequently than the zona glomerulosa. Everds et al. (2013) defined the stress constellation: decreased body weight, decreased food consumption, thymic/splenic involution, adrenal weight increase, and stress leukogram.

```
DECISION TREE 2: ADRENAL CORTICAL HYPERTROPHY

ENTRY: Adrenal cortical hypertrophy detected (increased adrenal weight
       and/or histological cortical cell enlargement)

├─ NODE 1: Evidence of direct cortical toxicity?
│   ├─ IF cortical necrosis present
│   │   OR cortical hemorrhage present
│   │   OR cortical inflammation present
│   │   OR cortical fibrosis present
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Structural damage to cortex = direct toxicity
│   │   regardless of concurrent stress findings
│   │   (Rosol et al. 2001, Toxicol Pathol 29:41–48)
│   │
│   └─ IF no cortical necrosis, hemorrhage, inflammation, or fibrosis
│       THEN → proceed to NODE 2
│
├─ NODE 2: Which cortical zone is affected?
│   ├─ IF zona fasciculata hypertrophy (diffuse, bilateral)
│   │   THEN → proceed to NODE 3
│   │   RATIONALE: ZF hypertrophy is ACTH-mediated; can be either
│   │   stress (adaptive) or compensatory to steroidogenic inhibition
│   │   (Rosol et al. 2001; NTP Nonneoplastic Lesion Atlas)
│   │
│   ├─ IF zona glomerulosa hypertrophy/hyperplasia
│   │   THEN classification = "EQUIVOCAL"
│   │   RATIONALE: ZG changes suggest mineralocorticoid pathway
│   │   perturbation or renin-angiotensin system derangement;
│   │   requires mechanism-specific evaluation
│   │   (Rosol et al. 2001; NTP Atlas)
│   │
│   └─ IF multiple zones affected OR zone cannot be determined
│       THEN → proceed to NODE 3 (with elevated concern)
│
├─ NODE 3: Stress constellation present?
│   ├─ IF concurrent body weight decrease >10% vs. control
│   │   AND concurrent thymic involution/weight decrease
│   │   AND ≥1 additional stress indicator:
│   │       - splenic weight decrease / lymphoid depletion
│   │       - stress leukogram (neutrophilia + lymphopenia + eosinopenia)
│   │       - decreased food consumption
│   │   THEN → proceed to NODE 4
│   │   RATIONALE: Classical stress triad supports HPA axis-mediated
│   │   secondary response (Everds et al. 2013, Toxicol Pathol
│   │   41:560–614; ECETOC TR 85, B-7 criterion)
│   │
│   └─ IF stress constellation NOT present
│       (body weight loss <10%, no thymic involution, no stress leukogram)
│       THEN → proceed to NODE 5
│
├─ NODE 4: Cortical vacuolation assessment
│   ├─ IF cortical vacuolation ABSENT
│   │   AND adrenal hypertrophy limited to zona fasciculata
│   │   AND severity ≤ mild
│   │   THEN classification = "ADAPTIVE"
│   │   (Secondary to generalized stress; non-adverse per ECETOC B-7)
│   │   RATIONALE: ZF hypertrophy with full stress constellation,
│   │   no structural damage, and no vacuolation = physiological
│   │   ACTH-mediated response (Harvey & Sutcliffe 2010, J Appl
│   │   Toxicol 30:617–626; Everds et al. 2013)
│   │
│   ├─ IF cortical vacuolation PRESENT (minimal to mild)
│   │   AND stress constellation fully present
│   │   AND no progression over study duration
│   │   THEN classification = "EQUIVOCAL"
│   │   RATIONALE: Vacuolation may reflect impaired steroidogenesis
│   │   even in stress context; requires hormonal confirmation
│   │   (Harvey & Sutcliffe 2010; Rosol et al. 2001)
│   │
│   └─ IF cortical vacuolation PRESENT (moderate to marked)
│       OR progressive vacuolation over study duration
│       THEN classification = "ADVERSE"
│       RATIONALE: Progressive vacuolation indicates steroidogenic
│       enzyme inhibition with cholesterol accumulation
│       (Rosol et al. 2001; Harvey et al. 2007, J Appl Toxicol
│       27:103–115)
│
├─ NODE 5: Adrenal functional reserve assessment
│   (stress constellation absent — evaluate for direct adrenal effect)
│   ├─ IF basal corticosterone/cortisol DECREASED
│   │   OR ACTH stimulation test shows blunted corticosterone response
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Adrenocortical insufficiency regardless of
│   │   mechanism (structural or pharmacological) is a serious
│   │   adverse effect (Harvey & Sutcliffe 2010; Harvey 2016,
│   │   J Steroid Biochem Mol Biol 155:199–206)
│   │
│   ├─ IF basal corticosterone/cortisol NORMAL or ELEVATED
│   │   AND ACTH stimulation response NORMAL
│   │   AND no cortical vacuolation
│   │   AND severity ≤ mild
│   │   THEN classification = "EQUIVOCAL"
│   │   RATIONALE: Compensatory hypertrophy maintaining function,
│   │   but absence of stress constellation requires mechanistic
│   │   explanation; Harvey & Sutcliffe 2010 caution that "unaltered
│   │   basal levels can mask inhibition due to compensatory ACTH drive"
│   │
│   └─ IF hormonal data unavailable
│       AND no stress constellation
│       AND cortical vacuolation present
│       THEN classification = "ADVERSE"
│       RATIONALE: Without functional data to confirm reserve capacity,
│       vacuolation + hypertrophy without stress explanation defaults
│       to adverse (Harvey & Sutcliffe 2010; Sellers et al. 2007,
│       Toxicol Pathol 35:751–755)
```

**Key encodable parameters:** Body weight change (%), thymus weight ratio, spleen weight ratio, adrenal weight ratio, cortical zone affected (ZF/ZG/ZR), vacuolation grade, basal corticosterone level, ACTH stimulation response, leukogram differential, food consumption change.

---

## 3. Splenic and thymic lymphoid changes

Immune organ changes occupy a uniquely sensitive position in preclinical safety assessment because they sit at the intersection of two common confounders — **stress-induced glucocorticoid-mediated lymphocytolysis** and **genuine immunotoxicity**. ICH S8 (2005) established that immune organ weight and histology changes are among the primary triggers for additional immunotoxicity testing, but explicitly acknowledges that stress-related changes must be differentiated. Elmore (2006) demonstrated that the thymus is the most sensitive target organ for both immunotoxicants and endogenous corticosteroids, making discrimination critical.

The Everds et al. (2013) stress review established the key principle: stress-mediated lymphoid changes are **secondary and indirect** (ECETOC B-7), typically limited to high doses with other evidence of intoxication, while direct immunotoxicity produces dose-related effects at non-overtly-toxic doses.

```
DECISION TREE 3A: THYMIC CHANGES (ATROPHY / DECREASED CELLULARITY)

ENTRY: Thymic weight decrease and/or thymic cortical lymphocyte depletion
       detected

├─ NODE 1: Age-related involution screen
│   ├─ IF study duration >6 months in rodents
│   │   AND thymic changes accompanied by adipocyte infiltration
│   │   AND medullary epithelial hyperplasia (ribbons/cords/tubules)
│   │   AND follicular B-cell aggregates in medulla
│   │   AND no dose-response relationship
│   │   THEN classification = "NOT TREATMENT-RELATED" (physiological
│   │   involution; exclude from adversity assessment)
│   │   RATIONALE: Age-related involution is a normal physiological
│   │   process distinct from drug-induced atrophy
│   │   (Pearse 2006, Toxicol Pathol 34:504–514; Elmore 2006,
│   │   Toxicol Pathol 34:656–665)
│   │
│   └─ IF dose-response present OR study duration ≤6 months
│       OR no adipocyte infiltration
│       THEN → proceed to NODE 2
│
├─ NODE 2: Compartment affected
│   ├─ IF cortical lymphocyte depletion ONLY
│   │   AND medullary cellularity preserved
│   │   AND corticomedullary demarcation maintained
│   │   THEN → proceed to NODE 3 (stress pattern)
│   │   RATIONALE: Cortical thymocytes (CD4+CD8+ double-positive)
│   │   are exquisitely sensitive to glucocorticoids; selective
│   │   cortical depletion = hallmark stress response
│   │   (Elmore 2006; Everds et al. 2013, Toxicol Pathol 41:560–614)
│   │
│   └─ IF BOTH cortex AND medulla depleted
│       OR loss of corticomedullary demarcation
│       OR total thymic atrophy
│       THEN → proceed to NODE 4 (potential immunotoxicity)
│
├─ NODE 3: Stress constellation check
│   ├─ IF concurrent body weight decrease >10%
│   │   AND ≥1 additional: adrenal weight increase, stress leukogram,
│   │       decreased food consumption, splenic lymphoid depletion
│   │   AND changes occur predominantly at highest dose(s) with
│   │       other evidence of generalized toxicity
│   │   THEN classification = "ADAPTIVE"
│   │   (Stress-mediated, secondary, non-adverse per ECETOC B-7)
│   │   RATIONALE: Classical glucocorticoid-mediated thymic involution
│   │   (Everds et al. 2013; ECETOC TR 85, 2002; Haley et al. 2005,
│   │   Toxicol Pathol 33:404–407)
│   │
│   └─ IF stress constellation ABSENT or INCOMPLETE
│       AND cortical depletion only
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: Cortical-only pattern suggests stress, but
│       without supporting constellation, pharmacological
│       immunosuppression cannot be excluded; consider ICH S8
│       WoE evaluation (ICH S8 2005, Section 2.2)
│
├─ NODE 4: Functional impairment indicators
│   ├─ IF concurrent opportunistic infections observed
│   │   OR decreased serum immunoglobulins
│   │   OR decreased TDAR (T-cell dependent antibody response)
│   │   OR decreased lymphocyte subsets (flow cytometry)
│   │   OR concordant depletion in spleen + lymph nodes + bone marrow
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Functional immune impairment = immunotoxicity;
│   │   triggers ICH S8 additional testing requirements
│   │   (ICH S8 2005; Germolec et al. 2004, Toxicol Sci 82:504–514)
│   │
│   ├─ IF total thymic atrophy at doses WITHOUT generalized toxicity
│   │   AND dose-response relationship present
│   │   AND no stress constellation
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Direct immunotoxicity — "powerful immunosuppressive
│   │   drugs produce thymic effects in a dose-related manner at
│   │   essentially non-toxic doses" (Kuper et al. 2000, Toxicol
│   │   Pathol 28:454–466; Haley et al. 2005)
│   │
│   └─ IF total thymic atrophy with partial stress constellation
│       OR equivocal functional data
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: ICH S8 WoE review recommended; TDAR testing
│       should be considered (ICH S8 2005)

---

DECISION TREE 3B: SPLENIC CHANGES

ENTRY: Splenic weight change and/or histological changes detected

├─ NODE 1: Type of splenic change
│   ├─ IF increased extramedullary hematopoiesis (EMH) in red pulp
│   │   THEN → proceed to NODE 1A
│   │
│   ├─ IF white pulp lymphoid depletion / atrophy
│   │   THEN → proceed to NODE 1B
│   │
│   └─ IF white pulp lymphoid hyperplasia / increased cellularity
│       THEN → proceed to NODE 1C
│
├─ NODE 1A: Splenic EMH assessment
│   ├─ IF concurrent anemia present (decreased RBC, Hct, Hgb)
│   │   AND reticulocytosis present
│   │   AND no EMH in unusual sites (liver sinusoids, adrenal, kidney)
│   │   THEN classification = "ADAPTIVE"
│   │   (Compensatory hematopoietic response to peripheral demand)
│   │   RATIONALE: Splenic EMH is a normal compensatory mechanism
│   │   in rodents (Willard-Mack et al. 2019, Toxicol Pathol
│   │   47:665–783 [INHAND]; Elmore 2006, Toxicol Pathol 34:648–655)
│   │
│   ├─ IF EMH present in unusual sites (liver, adrenal, kidney)
│   │   OR concurrent bone marrow hypocellularity
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Ectopic EMH indicates bone marrow failure/toxicity
│   │   (Willard-Mack et al. 2019)
│   │
│   └─ IF no concurrent anemia AND EMH increased
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: EMH without hematologic correlate requires
│       bone marrow evaluation for occult myelotoxicity
│
├─ NODE 1B: White pulp depletion assessment
│   ├─ IF stress constellation present (body weight ↓>10%, thymic
│   │   involution, adrenal ↑, stress leukogram)
│   │   AND depletion primarily in PALS (T-cell zone)
│   │   AND occurs at highest dose(s) with generalized toxicity
│   │   THEN classification = "ADAPTIVE"
│   │   (Stress-mediated, secondary)
│   │   RATIONALE: (Everds et al. 2013; ECETOC TR 85 B-7)
│   │
│   ├─ IF dose-related depletion at non-overtly-toxic doses
│   │   AND no stress constellation
│   │   AND concordant with thymic and/or lymph node changes
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Pattern consistent with direct immunotoxicity;
│   │   ICH S8 trigger for functional testing
│   │   (ICH S8 2005; Haley et al. 2005; Kuper et al. 2000)
│   │
│   └─ IF partial stress constellation OR mixed presentation
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: ICH S8 WoE review recommended
│
├─ NODE 1C: White pulp hyperplasia assessment
│   ├─ IF germinal center hyperplasia
│   │   AND consistent with pharmacological immunostimulation
│   │       (e.g., vaccine adjuvant, immune agonist)
│   │   AND no autoimmune-pattern findings
│   │   THEN classification = "ADAPTIVE"
│   │   (Expected pharmacological effect)
│   │   RATIONALE: Immunostimulation within physiological range
│   │   is not adverse per se (ICH S8; Germolec et al. 2017,
│   │   Curr Opin Toxicol 5:55–59)
│   │
│   └─ IF hyperplasia accompanied by autoimmune markers
│       OR hypergammaglobulinemia
│       OR immune complex deposition
│       THEN classification = "ADVERSE"
│       RATIONALE: Immunoenhancement with autoimmune potential
│       (ICH S8 2005)

ICH S8 TRIGGER ENCODING:
Flag for additional immunotoxicity testing (TDAR) if:
  - Any single immune parameter change of "sufficient magnitude" OR
  - ≥2 immune parameters each showing sub-threshold changes OR
  - Pharmacological class suggests immune function effects OR
  - Lymphoid organ changes at doses below generalized toxicity
(ICH S8, Section 2.1–2.2)
```

**Key encodable parameters:** Thymic weight ratio, splenic weight ratio, body weight change (%), thymic compartment affected (cortex/medulla/both), adipocyte infiltration (present/absent), white pulp compartment affected (PALS/follicles/marginal zone), EMH grade, hematology panel (RBC, Hct, reticulocytes, differential), serum globulins, bone marrow cellularity.

---

## 4. Renal tubular hypertrophy, basophilia, and vacuolation

Renal tubular changes require a three-pronged evaluation: the morphological finding itself, concurrent indicators of tubular injury, and species-specific confounders. The INHAND nomenclature document (Frazier et al., *Toxicologic Pathology* 40:14S–86S, 2012) provides the definitive classification system. The ESTP 5th International Expert Workshop (Lenz et al., *Toxicologic Pathology* 46:224–246, 2018) established that lysosomal accumulations found in isolation without morphologic or functional consequences are **generally not adverse**, while those associated with cytotoxicity, inflammation, or fibrosis are adverse. Two major species-specific confounders — **chronic progressive nephropathy** (CPN) in aged rats and **α2u-globulin nephropathy** in male rats — must be flagged and excluded from human risk assessment.

```
DECISION TREE 4A: RENAL TUBULAR HYPERTROPHY

ENTRY: Renal tubular epithelial hypertrophy detected (enlarged cells,
       increased cytoplasm, no increase in cell number)

├─ NODE 1: Concurrent injury markers?
│   ├─ IF concurrent tubular degeneration present
│   │   OR concurrent tubular necrosis (single cell or overt)
│   │   OR concurrent tubular regeneration (basophilia + mitoses)
│   │   OR BUN/creatinine elevated (>1.5× control)
│   │   OR proteinuria present
│   │   OR qualified biomarkers elevated (KIM-1, NGAL, clusterin)
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Hypertrophy in context of active tubular injury
│   │   indicates nephrotoxicity, not compensation
│   │   (Frazier et al. 2012, Toxicol Pathol 40:14S–86S [INHAND];
│   │   Seely & Frazier 2015, Toxicol Pathol 43:457–463;
│   │   FDA/EMA qualified renal biomarker panel 2008)
│   │
│   └─ IF no concurrent degeneration, necrosis, or functional impairment
│       THEN → proceed to NODE 2
│
├─ NODE 2: Severity and context
│   ├─ IF hypertrophy severity ≤ mild
│   │   AND no proteinaceous/hyaline casts
│   │   AND no inflammatory cell infiltrates
│   │   AND no mineralization
│   │   AND kidney weight increase correlates with hypertrophy
│   │       (no disproportionate weight change)
│   │   THEN classification = "ADAPTIVE"
│   │   RATIONALE: Isolated tubular hypertrophy without injury =
│   │   compensatory/adaptive response (analogous to hepatocellular
│   │   hypertrophy framework); not preneoplastic per NTP Atlas
│   │   (NTP Nonneoplastic Lesion Atlas — Seely, Brix, Frazier,
│   │   Hard, Elmore; Palazzi et al. 2016, Toxicol Pathol 44:810–824
│   │   [ESTP 4th Workshop])
│   │
│   └─ IF hypertrophy moderate to marked
│       OR kidney weight increase disproportionate to hypertrophy
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: Marked hypertrophy may indicate significant
│       functional compensation for nephron loss; investigate CPN
│       (Hard & Khan 2004, Toxicol Pathol 32:171–180)

---

DECISION TREE 4B: RENAL TUBULAR BASOPHILIA

ENTRY: Tubular basophilia detected (increased cytoplasmic basophilia,
       nuclear crowding, ± increased mitoses)

├─ NODE 1: Concurrent active injury?
│   ├─ IF concurrent tubular degeneration OR necrosis present
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Basophilia + ongoing injury = active regenerative
│   │   response to current toxicity; the overall syndrome is adverse
│   │   (Seely & Frazier 2015, Toxicol Pathol 43:457–463)
│   │
│   └─ IF no concurrent degeneration or necrosis
│       THEN → proceed to NODE 2
│
├─ NODE 2: CPN confound check (rat studies only)
│   ├─ IF species = rat
│   │   AND basophilia is focal/multifocal
│   │   AND accompanied by thickened tubular basement membranes
│   │   AND proteinaceous casts in outer medulla
│   │   AND changes correlate with age/sex (male > female; older > younger)
│   │   THEN classification = "CPN-RELATED" (background confound;
│   │   not treatment-related unless treatment-exacerbated)
│   │   RATIONALE: Basophilia is an early hallmark of CPN;
│   │   chemically exacerbated CPN should not be acknowledged as
│   │   indicator of human toxic hazard (Hard & Khan 2004,
│   │   Toxicol Pathol 32:171–180; Hard et al. 2013, Toxicol Sci
│   │   132:268–275)
│   │
│   └─ IF basophilia does NOT match CPN pattern
│       OR species ≠ rat
│       THEN → proceed to NODE 3
│
├─ NODE 3: Resolved vs. ongoing process
│   ├─ IF basophilia present in recovery group with resolved injury
│   │   AND biomarkers (KIM-1, BUN/Cr) returning to normal
│   │   AND no ongoing necrosis
│   │   THEN classification = "ADAPTIVE"
│   │   (Successful regeneration following resolved injury)
│   │   RATIONALE: Regenerative basophilia after injury cessation
│   │   indicates tissue repair capacity (Seely & Frazier 2015;
│   │   Tomlinson et al. 2016 [STP recovery study guidance])
│   │
│   └─ IF basophilia persistent without resolution
│       OR in main study group (not recovery)
│       AND no concurrent necrosis identifiable
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: Persistent basophilia may indicate ongoing
│       subclinical injury; biomarker follow-up recommended

---

DECISION TREE 4C: RENAL TUBULAR VACUOLATION

ENTRY: Renal tubular cytoplasmic vacuolation detected

├─ NODE 1: Vacuolation type determination
│   ├─ IF vacuoles contain lamellar bodies (EM confirmation)
│   │   OR compound is a cationic amphiphilic drug (CAD)
│   │   OR LAMP-2 immunolabeling positive
│   │   THEN → proceed to NODE 2 (phospholipidosis pathway)
│   │
│   ├─ IF hyaline droplet accumulation in male rat proximal tubules
│   │   AND immunohistochemistry confirms α2u-globulin
│   │   AND absent in female rats
│   │   THEN → proceed to NODE 3 (α2u-globulin pathway)
│   │
│   └─ IF clear/watery cytoplasmic swelling (hydropic change)
│       OR vacuolation type undetermined
│       THEN → proceed to NODE 4
│
├─ NODE 2: Phospholipidosis (PLD) adversity assessment
│   ├─ IF PLD in isolation
│   │   AND no concurrent cytotoxicity, inflammation, or fibrosis
│   │   AND no distortion of tissue architecture
│   │   AND organ function preserved (BUN/Cr normal)
│   │   AND tissue has regenerative capacity (kidney = yes)
│   │   THEN classification = "ADAPTIVE"
│   │   RATIONALE: PLD alone without functional consequences is
│   │   generally not adverse (Lenz et al. 2018, Toxicol Pathol
│   │   46:224–246 [ESTP 5th Workshop])
│   │
│   └─ IF PLD accompanied by cytotoxicity OR inflammation OR fibrosis
│       OR functional impairment (elevated BUN/Cr)
│       THEN classification = "ADVERSE"
│       RATIONALE: PLD with pathological sequelae = adverse
│       (Lenz et al. 2018)
│
├─ NODE 3: α2u-Globulin nephropathy species-artifact flag
│   ├─ IF all criteria met:
│   │   - Male rat only
│   │   - Hyaline droplets in P2 segment of proximal tubules
│   │   - α2u-globulin confirmed by IHC
│   │   - Absent in female rats and other species
│   │   - ± granular casts at corticomedullary junction
│   │   - ± linear papillary mineralization
│   │   THEN classification = "SPECIES-ARTIFACT — NOT HUMAN-RELEVANT"
│   │   RATIONALE: α2u-globulin is produced only in male rats;
│   │   mechanism has no human counterpart. EPA 1991 position:
│   │   renal tumors and nephrotoxicity associated with α2u-globulin
│   │   accumulation should not be used in human risk assessment
│   │   (EPA/625/3-91/019F, 1991; endorsed by IARC)
│   │
│   └─ IF criteria incompletely met
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: Full α2u-globulin criteria must be demonstrated
│       before species-artifact exclusion applies (EPA 1991)
│
├─ NODE 4: Hydropic degeneration / uncharacterized vacuolation
│   ├─ IF vacuolation accompanied by cell swelling
│   │   OR progression to necrosis observed
│   │   OR organelle disruption on EM
│   │   THEN classification = "ADVERSE"
│   │   RATIONALE: Hydropic degeneration reflects direct cellular
│   │   osmotic injury, typically preceding necrosis
│   │   (Frazier et al. 2012 [INHAND])
│   │
│   └─ IF vacuolation type cannot be determined
│       AND no concurrent injury markers
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: EM characterization recommended to distinguish
│       PLD from hydropic degeneration (Lenz et al. 2018)
```

**Key encodable parameters:** Vacuolation type (lamellar/hyaline droplet/hydropic/undetermined), sex + species, concurrent degeneration/necrosis (present/absent), BUN and creatinine fold-change, KIM-1/NGAL/clusterin levels, proteinuria grade, α2u-globulin IHC result, CPN severity grade, tubular basement membrane thickening, cast type and location.

---

## 5. Gastric mucosal changes

Gastric findings require an immediate anatomical sort: **forestomach** (squamous epithelium, no human counterpart) versus **glandular stomach** (columnar epithelium, direct human counterpart). This distinction fundamentally alters human relevance assessment. Greaves (2012) documented that forestomach squamous hyperplasia is "presumably an adaptive response to the effects of continued insult." Proctor et al. (2007) developed the formal mode-of-action framework establishing that forestomach tumors from chronic irritation should not form the basis for carcinogenic classification in humans. The IARC Technical Publication No. 39 (2003) concluded that agents producing only forestomach tumors via non-DNA-reactive mechanisms may be of uncertain relevance to humans.

```
DECISION TREE 5: GASTRIC MUCOSAL CHANGES

ENTRY: Gastric mucosal finding detected

├─ NODE 0: Anatomical compartment sort
│   ├─ IF finding in FORESTOMACH (squamous epithelium)
│   │   THEN → proceed to TREE 5A
│   │
│   └─ IF finding in GLANDULAR STOMACH (columnar epithelium)
│       THEN → proceed to TREE 5B

===== TREE 5A: FORESTOMACH (SQUAMOUS EPITHELIUM) =====

├─ NODE 1: Lesion type
│   ├─ IF squamous epithelial hyperplasia ± hyperkeratosis
│   │   THEN → proceed to NODE 2
│   │
│   ├─ IF erosion (epithelial loss not extending below muscularis mucosae)
│   │   THEN → proceed to NODE 3
│   │
│   └─ IF ulceration (tissue destruction extending through/below
│       muscularis mucosae into submucosa)
│       OR perforation
│       THEN classification = "ADVERSE"
│       RATIONALE: Ulceration = structural tissue destruction
│       beyond repair capacity of mucosa
│       (Greaves 2012, Histopathology of Preclinical Toxicity
│       Studies, 4th ed., Ch 8; Wester & Kroes 1988, Toxicol
│       Pathol 16:165–171)
│
├─ NODE 2: Forestomach hyperplasia assessment
│   ├─ IF hyperplasia is focal, mild (minimal to mild severity)
│   │   AND limited to limiting ridge region
│   │   AND no dysplasia
│   │   AND no papillomatous architecture
│   │   AND no concurrent inflammation beyond minimal
│   │   THEN classification = "ADAPTIVE"
│   │   + FLAG: "NOT HUMAN-RELEVANT — humans lack forestomach"
│   │   RATIONALE: Mild squamous hyperplasia is a protective
│   │   adaptive response to local irritation; humans lack a
│   │   forestomach, making this a species-specific artifact
│   │   (Greaves 2012; Proctor et al. 2007, Toxicol Sci 98:313–326;
│   │   ECETOC TR 85 B-2 + B-8 [predictable consequence of
│   │   experimental model])
│   │
│   ├─ IF hyperplasia is diffuse, moderate to marked
│   │   OR accompanied by dysplasia
│   │   OR papillomatous architecture present
│   │   THEN classification = "ADVERSE"
│   │   + NOTE: Assess human relevance via MOA framework
│   │   RATIONALE: Diffuse severe hyperplasia ± dysplasia is
│   │   within the neoplastic progression sequence
│   │   (Wester & Kroes 1988; Chandra et al. 2010, Toxicol Pathol
│   │   38:188–197)
│   │
│   └─ IF hyperplasia moderate, no dysplasia, but diffuse
│       THEN classification = "EQUIVOCAL"
│       RATIONALE: Diffuse moderate hyperplasia exceeds typical
│       adaptive response but lacks pre-neoplastic features;
│       reversibility assessment recommended
│
├─ NODE 2A: Human relevance MOA assessment (for adverse forestomach findings)
│   ├─ IF compound is non-genotoxic
│   │   AND hyperplasia/tumors occur only in forestomach
│   │       (no tumors at other sites)
│   │   AND MOA = local irritation / cytotoxicity (confirmed by
│   │       absence of effect via non-oral routes)
│   │   THEN HUMAN RELEVANCE = "LOW"
│   │   RATIONALE: Non-genotoxic, irritation-driven forestomach
│   │   tumors at a site absent in humans have low human relevance
│   │   (Proctor et al. 2007; Proctor et al. 2018, Regul Toxicol
│   │   Pharmacol 103:88–103 [AOP framework]; IARC Tech Pub 39,
│   │   2003; EPA Guidelines for Carcinogen Risk Assessment 2005;
│   │   NTP delisting of ethyl acrylate 2005)
│   │
│   └─ IF compound is genotoxic
│       OR tumors at multiple sites
│       OR systemic MOA (not local irritation)
│       THEN HUMAN RELEVANCE = "PRESUMED RELEVANT"
│       RATIONALE: Genotoxic agents or systemic carcinogens acting
│       on forestomach may also act on human esophageal/oropharyngeal
│       squamous epithelium (EPA 2005; IARC Tech Pub 39)
│
├─ NODE 3: Forestomach erosion assessment
│   ├─ IF erosion is focal, minimal to mild
│   │   AND evidence of regenerative response (basal cell hyperplasia)
│   │   AND gavage study (consider procedural contribution)
│   │   THEN classification = "EQUIVOCAL"
│   │   RATIONALE: Mild focal erosion may be gavage-related or
│   │   represent transient irritation with adequate repair;
│   │   requires dose-response evaluation
│   │   (Greaves 2012; Proctor et al. 2007)
│   │
│   └─ IF erosion is multifocal or diffuse
│       OR accompanied by hemorrhage
│       OR concurrent with significant inflammation
│       THEN classification = "ADVERSE"
│       RATIONALE: Widespread erosion indicates tissue damage
│       exceeding local repair capacity

===== TREE 5B: GLANDULAR STOMACH (COLUMNAR EPITHELIUM) =====

├─ NODE 1: Lesion type
│   ├─ IF mucosal/foveolar hyperplasia
│   │   THEN → proceed to NODE 2
│   │
│   ├─ IF ECL (enterochromaffin-like) cell hyperplasia
│   │   THEN → proceed to NODE 3
│   │
│   ├─ IF erosion
│   │   AND focal, minimal to mild
│   │   AND no concurrent hemorrhage or deep ulceration
│   │   THEN classification = "EQUIVOCAL"
│   │   RATIONALE: Focal mild glandular erosion may be transient;
│   │   but glandular stomach = human-relevant organ, so threshold
│   │   for adversity is lower than forestomach
│   │
│   └─ IF ulceration (extends through muscularis mucosae)
│       OR hemorrhagic erosion
│       THEN classification = "ADVERSE"
│       RATIONALE: Glandular stomach ulceration = direct human-
│       relevant tissue destruction (Greaves 2012; Kerlin et al.
│       2016, Toxicol Pathol 44:147–162)
│
├─ NODE 2: Glandular mucosal hyperplasia
│   ├─ IF foveolar/surface mucosal hyperplasia
│   │   AND severity ≤ mild
│   │   AND no dysplasia, no glandular dilation, no inflammation
│   │   THEN classification = "ADAPTIVE"
│   │   RATIONALE: Mild mucosal hyperplasia = protective response
│   │   to luminal irritation (Greaves 2012; ECETOC TR 85 B-2)
│   │
│   └─ IF hyperplasia moderate to marked
│       OR accompanied by glandular dilation, inflammation, or dysplasia
│       THEN classification = "ADVERSE"
│       RATIONALE: Exceeds adaptive threshold; human-relevant organ
│       requires conservative adversity call
│       (Palazzi et al. 2016, Toxicol Pathol 44:810–824)
│
├─ NODE 3: ECL cell hyperplasia (specific to acid-suppressing drugs)
│   ├─ IF compound inhibits gastric acid secretion (PPI, H2 blocker)
│   │   AND serum gastrin elevated (hypergastrinemia)
│   │   AND ECL hyperplasia is diffuse, simple (linear/micronodular)
│   │   AND severity ≤ mild to moderate
│   │   AND no dysplasia or neuroendocrine tumor
│   │   THEN classification = "EQUIVOCAL"
│   │   + FLAG: "HUMAN-RELEVANT MECHANISM — requires clinical
│   │   gastrin monitoring"
│   │   RATIONALE: ECL cell hyperplasia from hypergastrinemia IS
│   │   human-relevant (unlike forestomach); mechanism conserved
│   │   across species. In rodents, readily progresses to carcinoid;
│   │   in humans, progression rare but documented
│   │   (Greaves 2012; Waldum et al. 2020, Int J Mol Sci 21:662)
│   │
│   └─ IF ECL cell dysplasia OR neuroendocrine tumor present
│       THEN classification = "ADVERSE"
│       RATIONALE: Neoplastic progression in human-relevant pathway

REGULATORY POSITIONS ON FORESTOMACH FINDINGS:
- EPA (2005): Default = any tumor site relevant; MOA analysis can
  establish species/site-specificity; nonlinear approach for
  irritation-driven forestomach tumors
- IARC (Tech Pub 39, 2003): Non-DNA-reactive forestomach tumors
  "may be of uncertain relevance to humans"
- NTP: Delisted ethyl acrylate (2005) based on forestomach-specific
  irritation MOA
- FDA/EMA: MOA/Human Relevance Framework approach; ECL cell changes
  from acid suppression ARE human-relevant
```

**Key encodable parameters:** Anatomical compartment (forestomach/glandular), epithelial type (squamous/columnar), lesion type (hyperplasia/erosion/ulceration/ECL hyperplasia), severity grade, dysplasia (present/absent), distribution (focal/diffuse), limiting ridge involvement, genotoxicity result, route of administration (gavage flag), serum gastrin level, compound pharmacological class.

---

## Cross-cutting framework integration with ECETOC TR 85

All five decision trees share a common upstream logic layer derived from ECETOC Technical Report No. 85 (2002) and its companion publication (Lewis et al., *Toxicologic Pathology* 30:66–74, 2002). The B-factor criteria provide a unified scoring system:

- **B-2 (Adaptive response):** The finding represents a physiological response to maintain normal function — applies to thyroid follicular hypertrophy from enzyme induction, adrenal ZF hypertrophy from stress, thymic cortical depletion from glucocorticoids, renal tubular hypertrophy from compensatory workload, and mucosal hyperplasia from irritation.
- **B-3 (Transient):** The finding disappears during treatment or in recovery groups — strengthens adaptive classification for all five organs.
- **B-4 (Small magnitude):** Minimal-to-mild severity supports non-adverse interpretation across all trees.
- **B-5 (No associated effects in related endpoints):** Isolated organ finding without downstream functional impairment supports adaptive classification.
- **B-6 (Not a precursor):** No progression toward neoplasia on the continuum (critical for thyroid focal hyperplasia and forestomach dysplasia calls).
- **B-7 (Secondary to other adverse effects):** The finding is directly attributable to another primary effect — specifically applicable to stress-mediated adrenal, thymic, and splenic changes.
- **B-8 (Predictable consequence of experimental model):** Species-specific artifacts — α2u-globulin nephropathy in male rats, forestomach findings in rodents, TSH-mediated thyroid tumors in rats.

For syndrome engine encoding, each decision tree terminal node should output: **(1)** the classification label, **(2)** the primary ECETOC B-factor(s) supporting it, **(3)** the human relevance flag where applicable, and **(4)** the key citation. All trees are designed to operate from morphological pattern recognition plus concurrent clinical/anatomic pathology data, independent of compound identity, consistent with the constraint that they must function as generic classifiers within an automated data analysis platform.

## Conclusion

These five decision trees extend the Hall 2012 liver hypertrophy paradigm to the most common non-liver adaptive findings in preclinical toxicology. Three recurring patterns emerge across all organ systems. First, **severity is the primary branch point**: minimal-to-mild changes without concurrent injury markers consistently classify as adaptive, while moderate-to-marked changes require additional evidence. Second, **the stress constellation** (body weight loss >10%, thymic involution, adrenal hypertrophy, stress leukogram) functions as a shared upstream classifier for adrenal, thymic, and splenic trees — when fully present, downstream changes in these organs classify as secondary per ECETOC B-7. Third, **species-specific mechanism flags** (rat thyroid TSH sensitivity, male rat α2u-globulin, rodent forestomach) represent a distinct classification axis that modifies human relevance without changing the adversity call in the test species.

The equivocal classification, present in every tree, serves a deliberate engineering purpose: it identifies cases where automated classification has insufficient confidence and human pathologist review is required. This is consistent with the ESTP 4th Workshop position that adversity determination requires "a holistic, weight-of-evidence, case-specific approach" — the decision trees capture the deterministic branches, while equivocal outputs route to expert adjudication.