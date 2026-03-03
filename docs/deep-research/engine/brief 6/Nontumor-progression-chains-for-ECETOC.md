# Generic lesion progression chains for ECETOC B-6 factor encoding

**Fourteen organ-specific, non-compound-specific progression chains are ready for YAML implementation**, covering neoplastic and non-neoplastic endpoints across all major target organs in repeat-dose rodent toxicity studies. Each chain below includes the staging, severity trigger, species specificity, spontaneous background, and time dependency required to construct B-6 logic that fires only when findings exceed historical control data or reach precursor-grade severity. The chains span the liver, kidney (two distinct pathways), thyroid, adrenal medulla, testis, lung, forestomach, urinary bladder, mammary gland, pancreas, nasal cavity, and two non-neoplastic fibrosis chains (liver, heart). Sources are drawn from INHAND organ-system nomenclature publications, NTP historical control databases, and the key mechanistic reviews by Hard, Capen, Maronpot, and Cohen cited in the request.

---

## 1. Liver hepatocellular neoplastic progression

**Chain:** Hepatocellular hypertrophy → Altered hepatocellular foci (eosinophilic, basophilic, clear cell, mixed) → Hepatocellular adenoma → Hepatocellular carcinoma (→ Hepatoblastoma in mice)

This is the most extensively characterized rodent progression chain. Altered hepatocellular foci (AHF) are clonally expanded populations of initiated hepatocytes and represent the earliest morphologically identifiable pre-neoplastic step. Eosinophilic foci predominate in mice and frequently harbor H-ras codon 61 mutations; basophilic foci predominate in rats. The INHAND hepatobiliary guide (Thoolen, Maronpot et al., *Toxicol Pathol* 2010; 38:5S–81S) codifies the full spectrum.

**Severity trigger.** Hepatocellular hypertrophy alone is adaptive and non-adverse per the 3rd ESTP Expert Workshop (Hall et al., *Toxicol Pathol* 2012; 40:971–994). The B-6 flag should fire when hypertrophy reaches **grade ≥3 (marked)** AND is accompanied by necrosis, sustained proliferation (Ki-67/PCNA elevation), or clinical-pathology liver markers. Any AHF of any grade should be flagged as pre-neoplastic.

**Species/strain specificity.** **B6C3F1 male mice** have extreme susceptibility — NTP historical control hepatocellular adenoma incidence is **~60%** and carcinoma **~34%** (males, all routes). Female mice are substantially lower (~20–40% adenoma). F344 rat males show <3–5% adenoma and <1–2% carcinoma. Susceptibility varies >50-fold across inbred mouse strains (Maronpot, *J Toxicol Pathol* 2009; 22:11–33). CAR, PXR, and PPARα-mediated hepatocarcinogenesis is considered rodent-specific; human hepatocytes are refractory to mitogen-driven proliferation from these nuclear receptor agonists (Lake, *Toxicol Res* 2018; 7:697–717).

**Spontaneous/HCD threshold.** B-6 should fire only when AHF or tumor incidence exceeds concurrent and historical control ranges, particularly for B6C3F1 mice where the control range for combined adenoma + carcinoma can reach 46–78% in males.

**Time dependency.** Subchronic (13-week): hypertrophy and enzyme induction visible; AHF rarely seen; no neoplasia. Chronic (2-year): adenomas appear ~52 weeks, carcinomas ~78+ weeks. Stop-exposure studies demonstrate regression of hypertrophy and early AHF if exposure ceases before neoplastic commitment.

---

## 2. Kidney chronic progressive nephropathy and renal tubular neoplasia

**Chain A (non-neoplastic):** Tubular basophilia/regeneration → Tubular degeneration → Hyaline casts → Interstitial inflammation → Interstitial fibrosis/Glomerulosclerosis → End-stage kidney (CPN)

**Chain B (neoplastic extension):** Advanced CPN → Atypical tubule hyperplasia (ATH) → Renal tubule adenoma → Renal tubule carcinoma

CPN is the single most important renal confounder in rat toxicity studies and the most frequently diagnosed kidney lesion. It occurs in **100% of control male F344 rats** by 90 days (Hard et al., *Toxicol Pathol* 2011; 39:291–304), though severity varies. Hard, Betz & Seely (*Toxicol Pathol* 2012; 40:473–481) demonstrated a **statistically significant association between advanced CPN severity (grade ≥6 on an expanded 0–8 scale) and renal tubule tumors (RTT) plus their precursor, atypical tubule hyperplasia (ATH)** in a survey of 2,436 F344 control rats. Advanced CPN is thus a risk factor for spontaneous RTT.

**Severity trigger.** Early CPN (tubular basophilia with hyaline casts, grade 1–2) is ubiquitous and not a precursor concern per se. **CPN exacerbation — defined as treatment-related increase in severity beyond concurrent controls — in 90-day studies predicts renal tubule tumors in subsequent 2-year bioassays** (Hard et al. 2011). The B-6 flag should fire when CPN severity is ≥ moderate (grade ≥3) AND exceeds the concurrent control mean, or when ATH is identified at any grade.

**Species/strain specificity.** F344 males are most severely affected; males >> females across all rat strains. Sprague-Dawley and Wistar rats also develop CPN but generally at lower severity. Mice develop CPN but less severely. **CPN has no human counterpart** — it lacks the vascular changes of hypertensive nephropathy, has no immunological basis, and features prominently dilated tubules with proteinaceous casts rather than the shrunken kidneys of human end-stage renal disease (Hard, Johnson & Cohen, *Crit Rev Toxicol* 2009; 39:332–346).

**Spontaneous rates.** CPN incidence: F344 males ~67%, females ~39%; SD males ~81%, females ~44% (Frazier et al., *Toxicol Pathol* 2012; 40:14S–86S, INHAND Urinary System). Spontaneous renal tubule adenoma: F344 males <1%.

**Time dependency.** Early CPN visible in 90-day studies (grade 1–2 in nearly all male F344 rats). Full progression to end-stage kidney and secondary RTT requires chronic (2-year) exposure.

---

## 3. Kidney α2u-globulin nephropathy (male rat–specific)

**Chain:** Hyaline droplet accumulation (proximal tubule) → Tubular cell necrosis/degeneration → Granular casts (corticomedullary junction) → Linear papillary mineralization → Regenerative tubular hyperplasia → Atypical tubule hyperplasia → Renal tubule adenoma/carcinoma

This is an entirely **male rat–specific** pathway driven by the protein α2u-globulin, which is synthesized exclusively by adult male rats. Chemicals bind reversibly to α2u-globulin, forming a complex resistant to lysosomal degradation. Accumulation triggers cytotoxicity, sustained cell proliferation, and ultimately a low incidence of renal tumors (Hard et al., *Environ Health Perspect* 1993; 99:313–349).

**Severity trigger.** Hyaline droplet accumulation at severity **≥ grade 3 (frequent small-to-moderately-sized droplets)** in 90-day studies, accompanied by regenerative tubule clusters and granular casts, constitutes a precursor concern. B-6 should fire when hyaline droplets are confirmed as α2u-globulin positive (by immunohistochemistry or Mallory-Heidenhain stain) AND exceed control severity.

**Species specificity.** Exclusively male rats — absent in female rats, mice, dogs, primates, and humans. The EPA (1991) concluded that **renal tumors mediated through α2u-globulin should not be used in human risk assessment**. The adverse outcome pathway is formalized on AOP-Wiki and in the OECD guidance document.

**Spontaneous/HCD.** Low-grade hyaline droplets are present in all male rat controls (grade 1). The B-6 flag requires treatment-related exacerbation above concurrent control severity.

**Time dependency.** Hyaline droplets and cytotoxicity appear within 2–4 weeks. Granular casts and regeneration within 13 weeks. Tumors require chronic (2-year) exposure.

---

## 4. Thyroid follicular cell progression

**Chain:** Follicular cell hypertrophy → Follicular cell hyperplasia, diffuse → Follicular cell hyperplasia, focal/nodular → Follicular cell adenoma → Follicular cell carcinoma

The thyroid chain is driven by a well-defined hormonal mechanism: hepatic enzyme induction → increased T4 glucuronidation → decreased circulating T4 → compensatory TSH elevation → chronic follicular cell stimulation → proliferation → neoplasia. Capen (*Toxicol Pathol* 1997; 25:39–48) established that **chronic TSH hypersecretion is the final common pathway** regardless of whether the upstream trigger is direct thyroid inhibition or indirect hepatic enzyme induction.

The critical morphological distinction is between **diffuse hyperplasia** (TSH-mediated adaptive response, potentially reversible) and **focal/nodular hyperplasia** (pre-neoplastic, in morphologic continuum with adenoma). The INHAND endocrine guide (Brändli-Baiocco et al., *J Toxicol Pathol* 2018; 31:1S–95S) codifies both entities.

**Severity trigger.** Moderate-to-marked diffuse hypertrophy/hyperplasia persisting into chronic studies with confirmed ↓T4/↑TSH triggers the B-6 flag. Focal/nodular hyperplasia of any grade should always be flagged. In 90-day studies, moderate hypertrophy with **confirmed thyroid hormone perturbation** (↓T4 ≥50%, ↑TSH ≥2-fold) warrants progression concern.

**Species specificity.** **Rodent-specific for non-genotoxic TSH-mediated mechanism.** Rat T4 half-life is 12–24 hours vs. 5–9 days in humans; rats lack thyroxine-binding globulin (TBG), so T4 is loosely bound to albumin and cleared much faster. No chemicals are verified human thyroid carcinogens; only ionizing radiation is established (Hill et al., *Environ Health Perspect* 1998; 106:447–457).

**Spontaneous rates.** Thyroid follicular cell adenoma: F344 rats 1–4%, Wistar 4.3%, SD 1.4%; B6C3F1 mice <1%. Carcinoma is rare across all strains.

**Time dependency.** 28-day: hypertrophy, hormone changes detectable. 90-day: diffuse hyperplasia. 2-year: adenoma/carcinoma. EPA (1998) supports a threshold-based nonlinear dose-response for non-mutagenic TSH-mediated thyroid tumors.

---

## 5. Adrenal medulla pheochromocytoma progression

**Chain:** Medullary hyperplasia, diffuse → Medullary hyperplasia, focal → Pheochromocytoma, benign → Pheochromocytoma, malignant (rare)

Pheochromocytomas arise from chromaffin cells and are among the most common spontaneous tumors in male F344 rats. The INHAND endocrine guide defines diffuse medullary hyperplasia as symmetric expansion of the medulla, and focal hyperplasia as discrete aggregates that may compress adjacent tissue. The transition from focal hyperplasia to benign pheochromocytoma is defined by size and architectural criteria.

**Severity trigger.** Focal medullary hyperplasia at any grade is the pre-neoplastic step. The B-6 flag should fire when focal hyperplasia incidence exceeds historical controls or when diffuse hyperplasia is **moderate or greater** in the context of known promoting factors (e.g., hypercalcemia, systemic hypoxemia from pulmonary fibrosis in inhalation studies).

**Species/strain specificity.** F344 male rats have very high background. Sprague-Dawley rats show a negative trend over time for pheochromocytoma. Ozaki et al. (*Toxicol Pathol* 2002; 30:228–235) demonstrated an association between lung pathology in inhalation studies and pheochromocytoma in F344 males, mediated by systemic hypoxemia → catecholamine stimulation.

**Spontaneous rates.** F344 males: benign pheochromocytoma **~32%** (Haseman et al. 1998); SD males substantially lower. Historical control ranges show positive trends over time in some breeding colonies.

**Time dependency.** Chronic only. Pheochromocytomas appear predominantly in the second year. Medullary hyperplasia may be detectable from ~52 weeks.

---

## 6. Testicular Leydig cell progression

**Chain:** Leydig cell hypertrophy → Leydig cell hyperplasia, diffuse → Leydig cell hyperplasia, focal → Leydig cell adenoma → Leydig cell carcinoma (extremely rare)

The Leydig cell chain is driven by chronic LH stimulation. Any interference with the hypothalamic-pituitary-testicular axis that elevates LH will promote Leydig cell mitosis in the rat (Clegg et al., *Reprod Toxicol* 1997; 11:107–121). The INHAND male reproductive guide (Creasy et al., *Toxicol Pathol* 2012; 40:29S–112S) defines the hyperplasia-adenoma threshold as **>3 seminiferous tubule diameters** for adenoma, ≤3 for hyperplasia.

**Severity trigger.** Focal hyperplasia exceeding 3 tubule diameters = adenoma. Diffuse hyperplasia in 90-day studies in context of confirmed hormonal perturbation (↑LH, altered testosterone) = precursor concern. In F344 rats, the extremely high spontaneous incidence renders this endpoint essentially unusable for hazard identification.

**Species/strain specificity.** **F344 rats: ~81–100% incidence** of Leydig cell adenoma by 2 years. SD rats: 4.2%; Wistar: 13.7%; B6C3F1 mice: <1% (Nolte et al., *Exp Toxicol Pathol* 2011; 63:645–655). Maronpot et al. (*Crit Rev Toxicol* 2016; 46:641–675) explicitly stated that F344 Leydig cell tumors are **inappropriate for human risk assessment** due to species-specific LH sensitivity. Human Leydig cells are terminally differentiated and mitotically quiescent. Carcinoma was documented in only **1 case among 7,453 males** in the RITA database.

**Spontaneous rates.** See above. B-6 should fire only in non-F344 strains where incidence exceeds HCD, or in F344 only if onset is clearly accelerated (before 12–15 months).

**Time dependency.** Subchronic: diffuse hyperplasia with hormonal perturbation. Chronic: adenomas (spontaneous by 12–15 months in F344). In SD/Wistar, treatment-related adenomas appear in the second year.

---

## 7. Lung alveolar/bronchiolar progression

**Chain:** Alveolar epithelial hyperplasia (Type II pneumocyte/Club cell) → Alveolar/bronchiolar adenoma → Alveolar/bronchiolar carcinoma

The INHAND respiratory guide (Renne et al., *Toxicol Pathol* 2009; 37:5S–73S) defines the key diagnostic boundary: hyperplasia maintains alveolar septal architecture without compression, whereas adenoma shows discrete expansile growth with **compression of surrounding parenchyma**. Dixon et al. (*Toxicol Pathol* 2008; 36:428–439) note that the cell of origin (Type II pneumocyte vs. Club cell) remains debated; NTP classifies all as alveolar/bronchiolar (A/B) tumors.

**Severity trigger.** Hyperplasia at **grade ≥3 (moderate)** with features of increasing cellularity approaching compression of adjacent tissue. Reactive post-inflammatory hyperplasia (diffuse, associated with inflammation, reversible) should be distinguished from focal pre-neoplastic hyperplasia (clonal expansion, may harbor K-ras mutations).

**Species/strain specificity.** **B6C3F1 male mice are the primary concern** — spontaneous A/B adenoma ~15–17%, carcinoma ~8–14%, combined ~20–28%. Female B6C3F1: combined ~8–10%. F344 rats: combined ~3.6% males, ~1.4–2.3% females (Pandiri et al., PMID 23726758; Haseman et al., *Toxicol Pathol* 1998; 26:428). Among inbred mice, strain susceptibility ranges from A/J (100% by 24 months) to C57BL/6 (8%).

**Time dependency.** Spontaneous tumors appear overwhelmingly in 2-year studies. In 90-day studies, hyperplasia is detectable but tumors are absent.

---

## 8. Forestomach squamous progression

**Chain:** Squamous epithelial hyperplasia (± hyperkeratosis) → Atypical squamous hyperplasia → Squamous cell papilloma → Squamous cell carcinoma

The forestomach is a **rodent-specific organ** (keratinized stratified squamous epithelium; humans lack a forestomach). The INHAND GI guide (Nolte et al., *J Toxicol Pathol* 2016; 29:1S–125S) and NTP Nonneoplastic Lesion Atlas define diagnostic criteria. The critical precursor step is **atypical hyperplasia** — characterized by diskeratinization, disorganization, nuclear atypia, and rete peg–like basal cell projections into the submucosa.

**Severity trigger.** Simple hyperplasia at minimal/mild severity is adaptive. **Marked hyperplasia (grade ≥3) with atypical features** = precursor concern. Atypical squamous hyperplasia should always be flagged regardless of severity grade.

**Spontaneous rates.** B6C3F1 mice: papilloma up to ~1.9%; F344 rats: near 0%. Squamous cell carcinoma in controls is essentially absent (Pandiri & Elmore, *Toxicol Pathol* 2011, PMC3166531).

**Human relevance.** Disputed. Some analogy exists to human esophageal squamous epithelium. At least 26 chemicals induce forestomach tumors in both rats and mice (high species concordance).

**Time dependency.** Subchronic: hyperplasia/hyperkeratosis readily induced; no neoplasia. Stop-exposure studies demonstrate that hyperplasia **regresses** if exposure ceases at ≤6 months; sustained exposure ≥12 months required for neoplasia. Papillomas ~52 weeks; carcinomas >78 weeks.

---

## 9. Urinary bladder urothelial progression

**Chain (rat):** Simple urothelial hyperplasia → Papillary/nodular hyperplasia → Transitional cell papilloma → Transitional cell carcinoma (noninvasive → invasive)

**Chain (mouse alternate):** Dysplasia (± hyperplasia) → Carcinoma in situ → High-grade invasive carcinoma

Cohen (*Toxicol Pathol* 1998; 26:121–127) established that the rat pathway progresses through morphologically distinct stages — simple hyperplasia, papillary and nodular hyperplasia, papilloma, and carcinoma — closely paralleling human bladder carcinogenesis. The mouse can follow a similar papillary pathway or a distinct flat dysplasia → CIS → invasive carcinoma sequence. Both genotoxic (aromatic amines, nitrosamines) and non-genotoxic (calculus-forming sodium salts, e.g., sodium saccharin, melamine) mechanisms produce this progression.

**Severity trigger.** Simple hyperplasia alone is insufficient; **papillary or nodular hyperplasia** at any grade is the key pre-neoplastic step. The calculus/irritation pathway (sodium salts → urinary calculi → sustained mechanical irritation → hyperplasia → neoplasia) is rat-specific and dose-dependent; the B-6 flag should fire when papillary/nodular hyperplasia is identified AND exceeds historical controls.

**Species specificity.** The calculus-mediated pathway is considered **rat-specific** and not relevant to humans because the sodium salt concentrations required exceed those achievable in human diet (Capen et al., *IARC Sci Publ* 1999; 147). Genotoxic bladder carcinogens (aromatic amines) are relevant across species. Spontaneous bladder tumors are **extremely rare** — essentially 0% in NTP historical controls for both F344 rats and B6C3F1 mice.

**Time dependency.** Hyperplasia in 13-week studies; tumors only in 2-year studies. The INHAND urinary system guide (Frazier et al. 2012) covers the full nomenclature for lower urinary tract lesions.

---

## 10. Mammary gland progression

**Chain:** Lobular alveolar hyperplasia → Hyperplasia with atypia (HAN/MIN) → Adenoma → Adenocarcinoma

Fibroadenoma occupies a complex position in this chain. Gene expression profiling showed **no molecular evidence of progression from fibroadenoma to adenocarcinoma** in spontaneous tumors, though the INHAND mammary guide (Rudmann et al., *Toxicol Pathol* 2012; 40:S11–S30) recognizes "adenocarcinoma arising in fibroadenoma" as a separate entity. For B-6 encoding, fibroadenoma should be classified as a **hormonally-driven independent benign neoplasm** rather than an obligate precursor; the true pre-malignant lesion is **hyperplasia with atypia (hyperplastic alveolar nodule/mammary intraepithelial neoplasia)**, which is immortalized and has high risk of malignant transformation.

The hormonal mechanism is: chronic estrogen → pituitary prolactin-secreting adenoma → elevated prolactin → mammary epithelial proliferation → hyperplasia → neoplasia. Ovariectomy reduces mammary tumor incidence by **90–95%** (Planas-Silva et al. 2008).

**Severity trigger.** Diffuse alveolar hyperplasia without atypia is often physiological (late gestation/lactation). **Hyperplasia with atypia (HAN/MIN)** at any grade is pre-malignant and should trigger B-6.

**Species/strain specificity.** **Sprague-Dawley female rats:** fibroadenoma **35–71%**, adenocarcinoma **10–25%** (Dinse et al., *Toxicol Pathol* 2010; 38:765; Brix et al. 2005; Labcorp 2024 HCD). F344 females: fibroadenoma 41–48%. B6C3F1 mice: very rare, MMTV-dependent biology. Males: fibroadenoma 1–2%.

**Time dependency.** Subchronic: hyperplasia possible; tumors not expected. Chronic: fibroadenomas extremely common; adenocarcinoma incidence continues to increase with age.

---

## 11. Pancreas exocrine acinar cell progression

**Chain:** Foci of acinar cell alteration (basophilic/eosinophilic) → Acinar cell hypertrophy → Focal acinar cell hyperplasia (<5 mm) → Acinar cell adenoma (≥5 mm) → Acinar cell carcinoma

The hyperplasia-adenoma distinction is based primarily on a **5 mm diameter threshold** in two-dimensional sections rather than distinct morphologic differences, which creates diagnostic variability (INHAND GI/Pancreas: Nolte et al. 2016; Boorman & Eustis, *Environ Health Perspect* 1984; 56:213–217). Eosinophilic foci are proposed as the earliest pre-neoplastic lesion, analogous to altered hepatocellular foci in the liver.

**Severity trigger.** Focal hyperplasia at **grade ≥2 (moderate)** with enlargement approaching 5 mm, or multiple foci = precursor concern. Any hyperplasia in the context of CCK-elevating treatment, dietary fat manipulation, or PPARα agonists = mechanistic concern.

**Species/strain specificity.** **Male F344 rats** and **male SD rats** are primarily affected; strong male sex bias (testosterone-dependent). Extremely rare in B6C3F1 mice. Corn oil gavage dramatically increases incidence: adenoma jumps from **0.5% (untreated, routine sampling) to 37% (corn oil gavage, extended sampling)** in male F344 rats (Boorman et al. 1987). Body weight is a positive modifier.

**Spontaneous rates.** Male F344 untreated (routine): adenoma 0.5–0.9%, hyperplasia 2.6%. Male F344 corn oil gavage (routine): adenoma 4–5%, hyperplasia 12.6%. Carcinoma <1%.

**Time dependency.** Subchronic: hypertrophy/early hyperplasia. Chronic: full progression in second year.

---

## 12. Nasal cavity respiratory epithelium progression

**Chain:** Goblet cell hyperplasia → Squamous metaplasia → Atypical squamous metaplasia → Squamous cell papilloma (rare) → Squamous cell carcinoma (rare)

Nasal tumors are **virtually always chemically induced** — spontaneous incidence is essentially 0% in both F344 rats and B6C3F1 mice. This makes nasal lesion progression particularly significant for the B-6 factor: any treatment-related increase in pre-neoplastic lesions is meaningful. The classic example is formaldehyde-induced nasal squamous cell carcinoma.

**Severity trigger.** Low-grade, focal squamous metaplasia at sites of direct irritant contact is **adaptive** (protective epithelial response). **Moderate-to-marked squamous metaplasia (grade ≥3) with atypia, keratinization, and rete peg formation** = adverse and potentially pre-neoplastic (Renne et al., *Toxicol Pathol* 2009; 37:5S–73S, INHAND Respiratory). The NTP Nonneoplastic Lesion Atlas states that squamous metaplasia may give rise to papilloma or carcinoma in chronic studies depending on the test article.

**Species differences.** Rats have more complex turbinate structure and larger relative olfactory surface area; they are generally more susceptible to inhaled irritant nasal toxicity than mice. Both are obligate nasal breathers unlike humans.

**Time dependency.** Metaplasia and hyperplasia develop within 13-week studies. Neoplasia requires chronic (≥18 months) sustained exposure.

---

## Two non-neoplastic organ fibrosis chains

### 13. Liver non-neoplastic fibrosis progression

**Chain:** Hepatocyte degeneration/necrosis → Inflammation (portal/lobular) → Biliary hyperplasia/Oval cell hyperplasia → Fibrosis (portal → bridging) → Cirrhosis

This non-neoplastic chain complements the neoplastic liver chain (#1). The INHAND hepatobiliary guide (Thoolen et al. 2010) defines all stages. Fibrosis results from stellate cell (Ito cell) activation → myofibroblast transformation → collagen deposition. **Bridging fibrosis represents an irreversible threshold** — the B-6 flag should fire when fibrosis reaches this stage.

**Severity trigger.** Minimal/mild: focal necrosis with inflammation — usually reversible. Moderate: multifocal necrosis with early fibrosis — potentially irreversible. **Severe/bridging fibrosis → cirrhosis = irreversible organ failure.** B-6 should fire at moderate fibrosis (grade ≥2) or when any bridging fibrosis is present.

**Spontaneous rates.** Spontaneous hepatic fibrosis/cirrhosis is **rare** in untreated rats and mice. No significant background fibrosis in standard NTP chronic studies.

**Time dependency.** Subchronic: fibrosis achievable with potent hepatotoxicants. Chronic: progression to cirrhosis requires sustained injury. This chain can progress in subchronic studies unlike most neoplastic chains.

### 14. Heart myocardial fibrosis progression (progressive cardiomyopathy)

**Chain:** Cardiomyocyte degeneration/necrosis → Inflammatory cell infiltrate → Mononuclear cell infiltrate/fibrosis → Cardiomyopathy (PCM)

The INHAND cardiovascular guide (*J Toxicol Pathol* 2016; 29:1S–47S) defines the preferred diagnostic terms for each stage. Progressive cardiomyopathy (PCM) is a spontaneous, chronic, progressive myocardial disease more prominent in males than females, with fibrosis increasing with age.

**Severity trigger.** Minimal: focal cardiomyocyte necrosis may resolve without fibrosis. Mild-moderate: multifocal necrosis with inflammatory infiltrate → reparative fibrosis. **Moderate fibrosis (grade ≥2) replacing myocardium = irreversible functional impairment.** B-6 flag at grade ≥2 fibrosis or when treatment-related exacerbation exceeds background PCM severity.

**Spontaneous rates.** F344 males: cardiomyopathy **~33%**, females ~18%. Common in SD rats, especially older males.

**Time dependency.** Necrosis/inflammation in subchronic studies (preferred INHAND term: "necrosis/inflammatory cell infiltrate"); fibrosis in chronic studies (preferred: "mononuclear cell infiltrate/fibrosis"). PCM is age-progressive and can confound treatment-related interpretation.

---

## Master progression chain table

| # | Organ | Early Lesion | Intermediate Lesion | Late/Severe Lesion | Severity Trigger | Species/Strain | Spontaneous Rate | Time Dep. | Key Source |
|---|-------|-------------|--------------------|--------------------|-----------------|----------------|-----------------|-----------|------------|
| 1 | **Liver** | Hepatocellular hypertrophy; Altered hepatocellular foci | Hepatocellular adenoma | Hepatocellular carcinoma; hepatoblastoma (mice) | Hypertrophy ≥ grade 3 + toxicity markers; any AHF | B6C3F1 mouse M: highest; F344 rat: low | B6C3F1 M: adenoma 60%, carcinoma 34%; F344 M: <5% | Chronic (adenomas ~52 wk) | Thoolen/Maronpot et al. 2010; Maronpot 2009; Hall et al. 2012 |
| 2 | **Kidney (CPN)** | Tubular basophilia/regeneration; hyaline casts | Interstitial inflammation/fibrosis; glomerulosclerosis | End-stage kidney; ATH → RT adenoma/carcinoma | CPN severity exceeding concurrent controls; any ATH | F344 M >> F344 F > SD; no human counterpart | CPN 100% M F344; RTT <1% | Chronic; early CPN by 90 days | Hard et al. 2004, 2009, 2012; Frazier et al. 2012 |
| 3 | **Kidney (α2u-glob.)** | Hyaline droplet accumulation (P2 segment) | Tubular necrosis; granular casts; papillary mineralization | Regenerative/atypical tubule hyperplasia → RT adenoma | Hyaline droplets ≥ grade 3 + regeneration + granular casts | Male rat only; EPA 1991: not relevant to humans | Background hyaline droplets grade 1 in all male rats | 2–4 wk onset; tumors chronic | Hard et al. 1993; EPA 1991; Swenberg et al. 1989 |
| 4 | **Thyroid** | Follicular cell hypertrophy; diffuse hyperplasia | Focal/nodular hyperplasia | Follicular cell adenoma → carcinoma | Moderate+ hypertrophy with ↓T4/↑TSH; any focal hyperplasia | Rodent >> human (T4 t½ 12–24 h vs 5–9 d) | Adenoma: F344 1–4%; B6C3F1 <1% | 28-d: hormone Δ; 90-d: hyperplasia; 2-yr: tumors | Capen 1997; Brändli-Baiocco et al. 2018; Hill et al. 1998 |
| 5 | **Adrenal medulla** | Medullary hyperplasia, diffuse | Medullary hyperplasia, focal | Pheochromocytoma (benign → malignant) | Any focal hyperplasia; diffuse ≥ moderate | F344 M: very high; SD M: lower | F344 M: ~32% pheo | Chronic (2nd year) | Brändli-Baiocco et al. 2018; Ozaki et al. 2002 |
| 6 | **Testis** | Leydig cell hypertrophy; diffuse hyperplasia | Focal hyperplasia (>3 tubule diameters) | Leydig cell adenoma (carcinoma: 1/7,453 in RITA) | Focal hyperplasia >3 tubule diameters; hormonal perturbation | F344: ~100%; SD: 4%; Wistar: 14%; B6C3F1: <1% | F344 M: 81–100% adenoma | Subchronic: hyperplasia; chronic: adenoma | Creasy et al. 2012; Clegg et al. 1997; Maronpot et al. 2016 |
| 7 | **Lung** | Alveolar epithelial hyperplasia (Type II/Club cell) | Alveolar/bronchiolar adenoma | Alveolar/bronchiolar carcinoma | Hyperplasia ≥ grade 3 with atypia/compression | B6C3F1 M: 20–28% combined; F344: 3.6% | See species column | Chronic (tumors 2nd year) | Renne et al. 2009; Dixon et al. 2008; Pandiri et al. 2013 |
| 8 | **Forestomach** | Squamous hyperplasia (± hyperkeratosis) | Atypical squamous hyperplasia; papilloma | Squamous cell carcinoma | Marked hyperplasia ≥ grade 3 + atypia; any atypical hyperplasia | Rodent-specific organ; humans lack forestomach | B6C3F1: papilloma ~1.9%; F344: ~0% | Subchronic: hyperplasia; chronic (>12 mo): tumors | Nolte et al. 2016; Pandiri & Elmore 2011 |
| 9 | **Urinary bladder** | Simple urothelial hyperplasia | Papillary/nodular hyperplasia; papilloma | Transitional cell carcinoma | Any papillary/nodular hyperplasia; calculus presence | Calculus pathway: rat-specific; genotoxic: cross-species | Essentially 0% spontaneous | Subchronic: hyperplasia; chronic: tumors | Cohen 1998; Frazier et al. 2012; Chow et al. 2000 |
| 10 | **Mammary gland** | Lobular alveolar hyperplasia | Hyperplasia with atypia (HAN/MIN); fibroadenoma (independent) | Adenocarcinoma | Any hyperplasia with atypia; fibroadenoma is independent | SD F: FA 35–71%, carcinoma 10–25%; F344 F: FA 41–48% | Very high in SD/F344 females | Chronic (2nd year); hormonal | Rudmann et al. 2012; Dinse et al. 2010; Brix et al. 2005 |
| 11 | **Pancreas** | Foci of acinar cell alteration; acinar hypertrophy | Focal acinar hyperplasia (<5 mm) | Acinar adenoma (≥5 mm) → carcinoma | Hyperplasia ≥ grade 2; multiple foci; near 5 mm | Male F344/SD rats; testosterone-dependent; rare in mice | F344 M: adenoma 0.5–5% (vehicle-dependent) | Chronic (2nd year) | Nolte et al. 2016; Boorman & Eustis 1984, 1985 |
| 12 | **Nasal cavity** | Goblet cell hyperplasia; respiratory epithelial hyperplasia | Squamous metaplasia (± atypia) | SCC (rare); papillary adenoma (rare) | Metaplasia ≥ grade 3 + atypia/keratinization | Both species; 0% spontaneous tumors | 0% | Subchronic: metaplasia; chronic: tumors | Renne et al. 2009; Harkema et al. 2006 |
| 13 | **Liver (fibrosis)** | Hepatocyte necrosis/degeneration | Inflammation → biliary hyperplasia → portal fibrosis | Bridging fibrosis → cirrhosis | Fibrosis ≥ grade 2; any bridging fibrosis | Not highly strain-specific | Rare spontaneously | Subchronic possible; chronic for cirrhosis | Thoolen et al. 2010 |
| 14 | **Heart** | Cardiomyocyte degeneration/necrosis | Inflammatory infiltrate → reparative fibrosis | Cardiomyopathy (PCM) — extensive fibrosis | Fibrosis ≥ grade 2; exceeds background PCM | Males > females; common F344 and SD | F344 M: ~33%, F: ~18% | Progressive; subchronic to chronic | INHAND CV 2016; Jokinen et al. 2011 |

---

## Implementing the B-6 firing logic across chains

Several cross-cutting principles emerged from this analysis that should govern how the B-6 factor fires in an automated system:

**The B-6 flag should fire when a finding occupies an early or intermediate position in a documented progression chain AND at least one of the following conditions is met:** the severity grade equals or exceeds the chain-specific trigger threshold, the incidence exceeds the upper bound of the historical control range for the relevant strain/sex, the finding is accompanied by a correlated hormonal or clinical-pathology perturbation (e.g., ↓T4/↑TSH for thyroid, ↑LH for Leydig cell), or the finding is a recognized obligate pre-neoplastic lesion regardless of severity (e.g., altered hepatocellular foci, atypical tubule hyperplasia, focal thyroid hyperplasia, atypical squamous hyperplasia, hyperplasia with atypia in mammary gland).

**The B-6 flag should NOT fire when:** the early lesion is at minimal/mild severity and the background incidence at that severity is within the normal HCD range for the strain and sex, the lesion is an adaptive response known not to progress without sustained exposure (e.g., minimal hepatocellular hypertrophy without AHF or proliferation markers, minimal diffuse thyroid hyperplasia in a 28-day study), or the progression chain is specific to a strain not being used in the current study (e.g., α2u-globulin nephropathy flags should not fire for female rats or any mouse study; F344-specific Leydig cell chain is irrelevant in SD rat studies below HCD).

**Non-neoplastic chains (liver fibrosis, CPN, cardiomyopathy) require different logic** than neoplastic chains. For these, the B-6 flag should fire based on the **irreversibility threshold** — the stage beyond which the lesion is unlikely to regress. This is bridging fibrosis for the liver, severe/end-stage CPN for the kidney, and moderate fibrosis for the heart. For CPN specifically, the flag should fire when treatment-related exacerbation of CPN severity exceeds concurrent controls in 90-day studies, as this predicts renal tubule tumors in 2-year bioassays (Hard et al. 2011).

**Time-dependency gating.** Most neoplastic progression chains require chronic (2-year) exposure for the late-stage lesion to manifest. However, the pre-neoplastic precursors (AHF, focal hyperplasia, atypical hyperplasia) can be detected in subchronic studies and should fire the B-6 flag as subchronic-study signals of progression risk. Non-neoplastic fibrosis chains can progress even in subchronic studies and should fire without time-dependency gating.

---

## Conclusion

The fourteen progression chains documented here provide a comprehensive, organ-by-organ framework for pre-coding generic B-6 precursor logic. Three features make this framework immediately actionable for YAML implementation. First, each chain uses standard INHAND terminology that maps directly to SEND-compliant pathology finding codes. Second, the severity triggers are quantified — specific grades and morphologic features define when the B-6 flag fires versus remains silent. Third, the historical control data and strain specificity notes enable the system to contextualize findings appropriately rather than flagging ubiquitous background lesions (F344 Leydig cell adenoma, B6C3F1 liver tumors, CPN in male rats) as treatment-related precursor signals. The most impactful additions beyond the existing neoplastic grading (adenoma → carcinoma) will be the non-neoplastic chains — kidney CPN, liver fibrosis, and cardiomyopathy — which represent the most common confounders in repeat-dose study interpretation and currently have no automated precursor flagging.