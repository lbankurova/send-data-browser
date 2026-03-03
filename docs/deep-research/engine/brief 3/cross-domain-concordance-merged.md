# Brief 3: Cross-Domain Concordance Linkage Map (Merged v2.0)

**Merged from two independent research passes.** This report defines expected co-occurrence patterns across microscopic pathology (MI), organ weights (OM), clinical pathology (LB), and clinical observations (CL) for organ systems that fall outside the existing 10 syndromes (XS01–XS10). Concordance strength tiers: Tier 1 (MI + concordant OM + concordant LB + dose-response), Tier 2 (any 2 concordant domains + dose-response), Tier 3 (1 domain + dose-response + plausibility), Tier 4 (single marginal finding, one domain only).

---

## 1. Bone Marrow — CBC Lineage Specificity Drives Concordance

### Sources: Reagan et al. 2011 (STP/ASVCP BM Working Group); Travlos 2006; NTP Nonneoplastic Lesion Atlas

The bone marrow is unique: it cannot be weighed, and its primary correlates are circulating blood cell counts. Reagan et al. (2011) established that **91% concordance** exists between preclinically identified hematotoxicity and subsequent clinical trial toxicity. The critical interpretive principle is lineage specificity.

**Lineage-specific MI → LB mapping:**

| BM Finding | Primary LB Correlate | Temporal Lag | CL Signs |
|---|---|---|---|
| Myeloid depletion | ↓WBC, ↓ANC (most sensitive) | 2–3 days | Injection site reactions, delayed wound healing |
| Erythroid depletion | ↓RBC/HGB/HCT, ↓RETIC (earliest indicator) | RETIC 2–3d; anemia weeks (RBC lifespan ~60d rat) | Pallor, hypoactivity, tachypnea |
| Megakaryocyte depletion | ↓PLT | 9–14 days (longest latency) | Petechiae, ecchymoses, hemorrhage |
| General hypocellularity | Pancytopenia: ↓WBC + ↓RBC + ↓PLT | Variable by lineage | Pallor, petechiae, moribund |

**Reticulocyte count is the single most sensitive early indicator** of erythroid perturbation. Decreased reticulocytes with anemia = production failure (bone marrow origin). Increased reticulocytes with anemia = peripheral destruction or hemorrhage. This distinction between regenerative and non-regenerative anemia is essential for mechanism determination.

**Effective vs. ineffective erythropoiesis** — a critical interpretive concept: Erythroid hyperplasia with rising reticulocytes and stabilizing RBC = effective regeneration. Erythroid hyperplasia with continued anemia and inadequate reticulocytes = ineffective production with intramedullary precursor death. This distinction changes the assessment from "compensatory" to "pathological."

**Splenic EMH** is the key organ weight correlate. Spleen weight increase with histologic EMH represents compensatory hematopoiesis. Baseline splenic EMH is normal in rodents (more prominent in mice than rats, in females, in young animals) — increases must be evaluated against concurrent controls. In non-rodents, EMH in spleen is always pathological. Three processes induce EMH: marrow damage, myelostimulation exceeding marrow capacity, and abnormal circulating hematopoietic factors.

**Concordance logic notes:**
- BM hypocellularity WITHOUT cytopenias → acute onset (cells still circulating from pre-treatment) or sampling artifact
- Cytopenias WITHOUT BM changes → peripheral destruction (hemolysis, consumption), not production failure
- EMH with anemia → supports regenerative capability; absence of EMH with severe anemia → concerning for marrow failure
- Diet restriction sufficient to stop weight gain caused 50%, 40%, and 20% decreases in erythroid, myeloid, and megakaryocytic precursors; M:E ratio unaffected (NTP Atlas)

### Hemolytic Anemia Cascade (Cross-Organ Chain)

Hemolysis generates a multi-organ signature spanning blood, bone marrow, spleen, liver, and kidney — the most extensive cross-organ chain in standard tox studies.

| Domain | Finding | Direction | Specificity |
|---|---|---|---|
| LB | RBC, HGB, HCT | ↓ | Primary signal |
| LB | RETIC | ↑ | **Required** — hallmark of peripheral destruction vs production failure |
| LB | TBIL (unconjugated) | ↑ | **Required** — heme catabolism product |
| LB | MCV | ↑ | Reticulocytes are larger than mature RBCs |
| LB | LDH | ↑ | Released from lysed erythrocytes |
| LB | HPT (haptoglobin) | ↓ | Consumed by free hemoglobin |
| MI | Splenic congestion, hemosiderosis, EMH | Present | Extravascular hemolysis site |
| MI | BM erythroid hyperplasia | Present | Compensatory production |
| MI | Hepatic hemosiderosis (Kupffer cells) | Present | Iron deposition from heme recycling |
| MI | Renal tubular hemosiderin | Present | Hemoglobin filtration/reabsorption |
| OM | Spleen weight | ↑ (2–3x possible) | Congestion + EMH |
| CL | Pallor, ↓activity, dark urine | Present | Dark urine = hemoglobinuria in severe intravascular |

**Intravascular vs. extravascular hemolysis** — critical mechanistic distinction:

| Feature | Intravascular | Extravascular |
|---|---|---|
| Hemoglobinemia | Yes | No |
| Hemoglobinuria | Yes | No |
| LDH | Markedly increased | Mildly increased |
| Haptoglobin | Severely depleted | Mildly decreased |
| Renal damage | Possible (hemoglobin casts, tubular necrosis) | No |
| Hepatosplenomegaly | Less prominent | Prominent |

**Blood smear flags:** Heinz bodies + eccentrocytes → oxidative hemolysis. Spherocytes + agglutination → immune-mediated. Schistocytes + keratocytes → mechanical/microangiopathic.

**Species note:** Haptoglobin is reliable in dogs but confounded in rats where it is an acute phase protein (rises with inflammation). Cats are highly susceptible to oxidative hemolysis.

**Strength hierarchy:** ↓RBC + ↑RETIC + ↑TBIL = Tier 1 (definitive). ↓RBC + ↑RETIC = Tier 2 (probable). ↓RBC alone = Tier 3 (mechanism unspecified).

---

## 2. Liver–Thyroid Axis — Multi-Organ Concordance Chain

### Sources: Capen 1997; Hood et al. 1999; Huisinga et al. 2021 (6th ESTP Workshop); Bartsch et al. 2018; Dellarco et al. 2006; OECD GD 150

The complete chain spans three organs. Sequential key events:

1. Hepatic nuclear receptor activation (CAR/PXR/AhR) by test article
2. UGT enzyme induction (UGT1A1, UGT1A6 for T4; UGT2B2 for T3) → hepatocellular hypertrophy + ↑liver weight (10–30%)
3. Enhanced T4 glucuronidation → increased biliary T4 clearance
4. Decreased serum T4 (most sensitive thyroid parameter)
5. Loss of negative feedback → compensatory TSH increase
6. Thyroid follicular cell hypertrophy → ↑thyroid weight (20–50% subchronic; >100% with potent goitrogens)
7. Sustained TSH → follicular hyperplasia (chronic studies)
8. Chronic hyperplasia → follicular cell adenoma/carcinoma (2-year rat)

**Not all enzyme inducers that decrease T4 increase TSH.** Hood et al. (1999) showed 3-methylcholanthrene and PCBs decrease T4 without consistently elevating TSH or stimulating follicular proliferation, suggesting T3 glucuronidation rather than T4 alone may mediate the TSH response.

**Concordance check logic:**
- Full chain: Liver MI (hypertrophy) + Liver OM↑ + ↓T4 + ↑TSH + Thyroid MI (follicular hypertrophy) + Thyroid OM↑ = **Tier 1, liver-mediated MOA**
- Thyroid MI + ↓T4 + ↑TSH WITHOUT liver changes = direct thyroid mechanism (TPO/NIS inhibition, iodine deficiency) → different human relevance
- Thyroid weight ↑ alone = Tier 3 — insufficient without MI or LB

**Species differences:** Rats lack thyroid-binding globulin (TBG), relying on albumin; T4 half-life 12–24 hours vs 5–9 days in humans. UGT-mediated thyroid tumors in rats are accepted as **not relevant to human risk** by FDA, ECHA CLP, and ESTP. Clinical signs are essentially absent unless severe hypothyroidism develops.

**LB measurement requirements:** T4/TSH should be measured in morning samples within a 2-hour window (diurnal variation). Stress affects TSH. T3 is less reliable in rats.

---

## 3. Adrenal — Three Distinct Mechanisms Producing Overlapping Histology

### Sources: Rosol et al. 2001; Everds et al. 2013; Brandli-Baiocco et al. 2018 (INHAND)

Adrenal interpretation hinges on distinguishing three fundamentally different pathogenic mechanisms.

### 3A. Primary Adrenal Toxicity (Steroidogenesis Block)

Cortical vacuolation (cholesterol/steroid precursor accumulation) + ↓cortisol/corticosterone + compensatory ↑ACTH. Possible electrolyte disturbance (↓Na, ↑K) if aldosterone synthesis also impaired. Key examples: ketoconazole (CYP11B1/CYP17A1 inhibition), aminoglutethimide, etomidate, mitotane (selective adrenolytic). Distinguished from stress by **absence of body weight loss and stress markers in other organs.** Tier 2 (MI + LB concordance).

### 3B. Secondary (Stress-Mediated) Adrenal Changes

Cortical hypertrophy + ↑adrenal weight as part of the stress constellation. **Cannot distinguish from direct effect by histopath alone** — both result from increased ACTH.

**Diagnostic triad (Everds 2013):** Thymic atrophy + adrenal hypertrophy + stress leukogram (neutrophilia, lymphopenia, eosinopenia) = strong indicator of stress-mediated secondary changes.

**Full pattern check** — when ≥4 of these 8 indicators present at same dose:
1. Body weight decrease >10%
2. Food consumption decrease
3. ↑Adrenal weight with cortical hypertrophy
4. ↓Thymus weight with lymphocyte depletion
5. Splenic lymphoid depletion
6. ↑Neutrophils
7. ↓Lymphocytes
8. ↓Reproductive organ weights

→ Classify all findings as stress-mediated secondary. Flag for weight-of-evidence assessment.

**Thymus sensitivity hierarchy:** Thymus is the most sensitive organ to glucocorticoid stress. If spleen/lymph nodes are depleted but thymus is preserved → suspect primary immunosuppression, NOT stress.

### 3C. Tertiary Adrenal Changes (HPA Suppression)

Exogenous corticosteroid → ↓ACTH → cortical atrophy (fasciculata/reticularis, glomerulosa preserved) → ↓adrenal weight. Distinguished by known pharmacology, atrophy rather than hypertrophy, and low ACTH.

**Species note:** Rats and mice lack CYP17 → corticosterone is primary glucocorticoid. Dogs and primates produce cortisol. Corticosterone measurement in rodents confounded by blood collection stress — dogs preferred for cortisol assessment.

---

## 4. Reproductive Organs — Cascading Hormone-Dependent Networks

### Sources: Creasy 1997, 2001, 2003; Lanning et al. 2002 (STP); Creasy et al. 2012 (INHAND); Chapin & Creasy 2012; Dixon et al. 2014; Halpern et al. 2016; Catlin et al. 2018

### 4A. Testes — Histopathology Is the Gold Standard

**Most testicular toxicity occurs with NORMAL circulating hormones** (Chapin & Creasy 2012). Direct germ cell and Sertoli cell toxicants produce tubular degeneration and oligospermia without altering testosterone, LH, or FSH. Only Leydig cell damage or HPG axis disruption reliably changes hormones.

Testicular weight is **insensitive** to mild-moderate injury: germ cells lost through degeneration are replaced by intratubular fluid, maintaining volume. Only when >50% of tubules are affected does weight reliably decrease. Sensitivity hierarchy: MI > OM > LB.

| MI Finding | OM | LB | CL | Tier |
|---|---|---|---|---|
| Germ cell degeneration (stage VII/VIII) | ↓ (late) | Often normal | — | Tier 2 (MI + OM) |
| Tubular atrophy (end-stage) | ↓↓ | ↓Testosterone, ↑LH/FSH | — | Tier 1 |
| Sertoli cell vacuolation | Variable | Often normal | — | Tier 3 |
| Leydig cell atrophy | ↓ | ↓Testosterone, ↓DHT | — | Tier 1 |
| Leydig cell hyperplasia | ↑ or normal | Variable testosterone, ↑LH | — | Tier 3 |

**Downstream cascade (Creasy 2001):** Leydig cell damage → ↓testosterone → ↓epididymis weight + epithelial changes → ↓prostate weight + atrophy → ↓seminal vesicle weight + atrophy → pituitary gonadotroph hypertrophy. **Rule:** When accessory sex organ weight decreases occur, check testes first.

**Male accessory sex organs are the most sensitive OM indicator of androgen status.** Seminal vesicle weight can decrease ~40% with androgen deprivation. Stress and feed restriction decrease GnRH → LH → testosterone, producing ASO atrophy **without** testicular weight changes (Halpern 2016) — this distinguishes non-specific stress from direct reproductive toxicity.

**Confounders:** (1) Stress via GnRH suppression → stage VII/VIII degeneration; discriminate by concurrent stress indicators. (2) Immaturity: require >9 weeks (rat) or >7 weeks (mouse) at termination.

### 4B. Ovaries — Estrous Cycle Dominates Interpretation

Dixon et al. (2014) established INHAND nomenclature and a two-tier evaluation: qualitative histopathologic assessment, followed by quantitative follicle counting when triggered. Sellers et al. (2007) did not recommend routine ovarian weighing due to extreme variability (CV 15–40%).

| MI Finding | OM | LB | CL | Tier |
|---|---|---|---|---|
| Follicular atresia (increased) | ↓ | ↓Estradiol, ↑FSH | Disrupted cycling | Tier 1 (MI+LB+cycling) |
| Primordial follicle depletion | ↓ | ↑FSH, ↑LH | Persistent diestrus | Tier 1 |
| Follicular cyst | Variable | Variable estradiol | Persistent estrus | Tier 2 |
| Decreased corpora lutea | ↓ | ↓Progesterone | Disrupted cycling | Tier 2 |

**Ovarian-uterine concordance should always be checked:** estradiol decrease → uterine atrophy; persistent estrogen → endometrial hyperplasia. Discordance suggests exogenous hormonal effects or direct uterine toxicity.

### 4C. Uterus

Uterus weight is the most variable organ measured (CV 25–60%; Sellers 2007). Estrous stage at necropsy is the dominant factor. Uterine atrophy is almost always secondary to ovarian/hormonal changes. Uterine hyperplasia with squamous metaplasia + persistent estrus + follicular cysts → unopposed estrogen pattern.

---

## 5. CL-Driven Organs — CNS, PNS, Eye, Skin

Three organ systems share a fundamental characteristic: they are **primarily CL→MI concordance domains** with minimal or no routine LB contribution.

### 5A. CNS

**Sources: Bolon et al. 2006, 2013 (STP CNS Working Group); Sellers 2007**

Brain weight is "highly conserved" (CV 3–5%). Even 5–10% change warrants investigation. However, most neurotoxic lesions do NOT produce weight changes because they are focal/regional. No routine clinical pathology biomarkers exist for CNS injury in standard studies. Emerging biomarkers from EU IMI TransBioLine and NeuroDeRisk projects: neurofilament light chain (NfL; AUC 0.97–0.99), GFAP, NSE, S100B — not yet routine.

Clinical signs (tremors, convulsions, ataxia, decreased activity, seizures, gait abnormality) are the primary in-life concordance domain. FOB or Irwin screen should be cross-referenced with neuropathology.

**Temporal interpretation:** Transient CL signs → pharmacodynamic (may lack structural correlate). Progressive CL signs → structural damage (expanded neuropathology warranted).

### 5B. PNS

**Source: Bolon et al. 2018 (STP PNS Working Group)**

Decreased grip strength, hind-limb foot splay, and nerve conduction velocity changes correlate with axonal degeneration and demyelination. Chronic, slowly reversible signs → expanded PNS examination. Transient signs → more likely pharmacodynamic. NfL is sensitive for PNS injury but cannot distinguish site of origin from CNS.

### 5C. Eyes

**Sources: Weir & Collins 2013; Zimmerman et al. 2021**

Ophthalmic examinations (slit-lamp, indirect ophthalmoscopy) are the exclusive in-life correlate. Eyes not weighed; no blood-based biomarkers. OCT shows **strong correlation with histopathology** (Zimmerman 2021); ERG provides functional retinal assessment. Split into three concordance targets: retinal, lens, corneal.

Drug class flags: chloroquine → retinal pigment epithelium degeneration; corticosteroids → posterior subcapsular cataract; ethambutol → optic neuropathy; tamoxifen → crystalline maculopathy.

### 5D. Skin / Injection Site

**Sources: Chandra et al. 2015; Sellers et al. 2020; OECD TG 410/411**

Draize scoring (erythema/edema, each 0–4) provides standardized in-life assessment. Chandra et al. (2015) documented that **Draize scores and histopathology may not always correlate.** Route-dependent considerations: SC → granuloma/fibrosis; IM → myofiber necrosis; IV → perivascular inflammation/phlebitis.

Local reactions are distinct from systemic toxicity. They do NOT determine systemic NOAEL unless secondary systemic effects occur (stress from pain, infection).

---

## Cross-Organ Linkage Chains — Summary

| Chain | Pathway | Complete Chain Tier | Key Discrimination |
|---|---|---|---|
| **CHAIN_01: Liver→Thyroid** | Enzyme induction → ↑T4 clearance → ↓T4 → ↑TSH → follicular hypertrophy/hyperplasia | Tier 1 | Thyroid MI without liver MI → direct thyroid mechanism (different human relevance) |
| **CHAIN_02: BM→Blood→Spleen** | BM suppression → cytopenias → splenic EMH. Reverse: hemolysis → reticulocytosis → BM erythroid hyperplasia + splenic hemosiderosis | Tier 1 | Forward: non-regenerative (↓RETIC). Reverse: regenerative (↑RETIC) |
| **CHAIN_03: Stress/Wasting** | Severe toxicity → ↓BW → HPA activation → adrenal hypertrophy + thymic atrophy + stress leukogram + generalized organ weight decreases | ≥4 indicators → secondary | Thymus sensitivity hierarchy: if thymus preserved but lymphoid organs depleted → primary immunosuppression, NOT stress |
| **CHAIN_04: Testes→Reproductive** | Leydig cell damage → ↓testosterone → ↓epididymis/prostate/SV weights + pituitary gonadotroph hypertrophy | Tier 1 when complete | ASO weight ↓ without testes weight ↓ → stress pathway via GnRH suppression |
| **CHAIN_05: Hemolytic Multi-Organ** | RBC destruction → ↑TBIL + ↑RETIC → BM erythroid hyperplasia → splenic hemosiderosis/EMH → hepatic Kupffer cell hemosiderosis → renal hemosiderin | Tier 1 | Intravascular: hemoglobinuria + renal casts. Extravascular: hepatosplenomegaly |

---

## Concordance Paradigms

The 25 concordance entries fall into four fundamentally distinct paradigms that automated corroboration logic must handle differently:

1. **Metabolically active visceral organs** (liver, kidney — existing XS01–XS03): LB↔MI primary concordance
2. **Endocrine organs** (thyroid, adrenal, gonads): LB (hormones) ↔ MI, with cross-organ cascades common
3. **CL-driven organs** (CNS/PNS, eye, skin): CL→MI primary; a finding scored "not_applicable" for LB corroboration is the **expected pattern**, not an evidence gap
4. **Hematopoietic tissues** (bone marrow/spleen): unique — organ cannot be weighed but has richest LB correlate set through CBC; lineage-specific mapping essential

**Concordance modifiers:**
- Cross-organ concordance **elevates** confidence by one tier (e.g., thyroid weight ↑ alone = Tier 3; thyroid weight ↑ + liver hypertrophy + ↓T4 = Tier 1)
- Discordant findings **reduce** confidence (e.g., thyroid follicular hypertrophy + normal T4/TSH = discordant)
- **Absence of expected concordant findings is as informative as presence** (e.g., thyroid MI without liver changes → not enzyme-induction mechanism)

---

## Source Catalog

| ID | Citation | Key Content |
|---|---|---|
| S33 | Reagan et al. 2011 (Toxicol Pathol 39:435-448) | STP/ASVCP BM Working Group; 91% concordance with clinical hematotoxicity |
| S34 | Capen 1997 (Toxicol Pathol 25:39-48) | Thyroid MOA framework |
| S35 | Huisinga et al. 2021 (Toxicol Pathol) | 6th ESTP Workshop: thyroid adversity criteria |
| S36 | Rosol et al. 2001 (Toxicol Pathol 29:41-48) | Adrenal structure/function/toxicity |
| S37 | Everds et al. 2013 (Toxicol Pathol 41:560-614) | Stress responses: comprehensive 54-page review |
| S38 | Creasy 1997 (Toxicol Pathol 25:119-131) | Testicular toxicity: spermatogenic staging |
| S39 | Creasy 2001 (Toxicol Pathol 29:64-76) | Male reproductive toxicity: target sites and cascades |
| S40 | Lanning et al. 2002 (Toxicol Pathol 30:518-531) | STP testicular/epididymal evaluation |
| S41 | Creasy et al. 2012 (Toxicol Pathol 40:40S-121S) | INHAND male reproductive nomenclature |
| S42 | Bolon et al. 2013 (Toxicol Pathol 41:1028-1048) | STP CNS Working Group |
| S43 | Bolon et al. 2018 (Toxicol Pathol 46:372-402) | STP PNS Working Group |
| S44 | Catlin et al. 2018 | Testicular toxicity vs sexual immaturity |
| S45 | Dellarco et al. 2006 | Thyroid MOA risk assessment framework |
| S46 | OECD GD 150 | Enhanced TH clearance as endocrine MOA |
| S_Hood1999 | Hood et al. 1999 | PB/PCN: 65%/95% TSH increase; 625%/1200% follicular proliferation |
| S_Bartsch2018 | Bartsch et al. 2018 | Rodent thyroid tumors from UGT induction: not human-relevant |
| S_Travlos2006 | Travlos 2006 (Toxicol Pathol 34:566-598) | BM histopathology |
| S_ChapinCreasy2012 | Chapin & Creasy 2012 | Most testicular toxicity occurs with normal hormones |
| S_Dixon2014 | Dixon et al. 2014 | STP/INHAND female reproductive; two-tier ovarian evaluation |
| S_Halpern2016 | Halpern et al. 2016 | Stress-mediated ASO atrophy without testicular weight change |
| S_Sellers2007 | Sellers et al. 2007 | Organ weight recommendations |
| S_WeirCollins2013 | Weir & Collins 2013 | Ocular toxicity evaluation |
| S_Zimmerman2021 | Zimmerman et al. 2021 | OCT/histopath correlation |
| S_Chandra2015 | Chandra et al. 2015 | Draize/histopath correlation discordance |
| S_Sellers2020 | Sellers et al. 2020 | Injection site evaluation |
| S_Elmore2006 | Elmore 2006 | Splenic EMH interpretation |
| S_Ramaiah2013 | Ramaiah et al. 2013 | Effective vs ineffective erythropoiesis |
| S_BrandliBaiocco2018 | Brandli-Baiocco et al. 2018 | INHAND adrenal nomenclature |
