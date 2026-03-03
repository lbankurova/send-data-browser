# Evaluating tumor findings in SEND-formatted preclinical toxicology data

**The evaluation of tumor findings in preclinical carcinogenicity studies requires a tightly integrated system of statistical methods, historical context, standardized terminology, and pathological judgment.** For someone building a toxicology data analysis application, the core challenge is implementing the interplay between survival-adjusted statistics (poly-3, Peto, Fisher's exact), historical control database comparisons, SEND TF domain parsing, and the biological logic of tumor combination and progression. This report provides the complete technical foundation across all seven domains, including specific regulatory text, published incidence rates, SEND variable structures, and implementation decision logic.

The regulatory landscape was reshaped by the **ICH S1B(R1) 2022 revision**, which introduced a weight-of-evidence approach that can eliminate the need for a 2-year rat bioassay in approximately 27% of cases. This makes systematic integration of chronic toxicity histopathology with carcinogenicity endpoints more critical than ever—and places new demands on data analysis platforms to synthesize proliferative and non-proliferative findings across study types.

---

## Statistical methods for distinguishing treatment-related from spontaneous tumors

Three statistical methods dominate carcinogenicity tumor evaluation, each addressing the fundamental problem that differential mortality across dose groups confounds raw tumor incidence comparisons.

### The Peto mortality-adjusted trend test

Published by Peto et al. in 1980 (IARC Monographs Supplement 2), this method partitions each tumor into one of two analytical contexts based on pathologist judgment. **Fatal tumors**—those that directly caused or contributed to the animal's death—are analyzed using a death-rate (survival) method equivalent to a stratified log-rank test. **Incidental tumors**—found at necropsy but unrelated to cause of death—are analyzed using a prevalence method that examines tumor proportions among animals examined within each time interval. The test divides the study into time intervals, calculates observed-versus-expected counts under the null hypothesis within each interval, and combines results across intervals using the Mantel-Haenszel procedure.

The Peto test's critical weakness is the **subjectivity of cause-of-death determination**. The FDA CDER Draft Guidance (2001) acknowledges this directly: "the difficulty and subjectivity in the determination of cause of death and lethality of a tumor may render the information too inaccurate and unobjective to allow valid analysis." Misclassifying a fatal tumor as incidental understates carcinogenic risk; the reverse overstates it. OECD Guidance Document 116 recommends the Peto analysis when "the pathologist can accurately differentiate between incidental and fatal tumours" but endorses the poly-3 test as the alternative when this cannot be achieved.

### The poly-k test (Bailer-Portier method)

Developed by **A. John Bailer and Christopher J. Portier** at NIEHS and published in Biometrics (1988, 44:417–431), the poly-k test was designed to eliminate the need for cause-of-death determination entirely. The key insight is that an animal dying early without a tumor contributes less than a full animal to the at-risk denominator—specifically, it contributes (t/T)^k, where t is time of death, T is total study duration, and **k is the Weibull shape parameter** describing how tumor onset probability increases with age.

The default value **k = 3** was established empirically by Portier, Hedges, and Hoel (Cancer Research, 1986), who analyzed tumor onset distributions across multiple sites in NTP historical control F344 rats and B6C3F1 mice. Bailer and Portier (1988) demonstrated that the poly-3 test produces valid results for true k values anywhere from 1 to 5, providing substantial robustness.

The poly-k adjusted tumor rate for dose group i is calculated as:

**π̂ᵢ = Σⱼ yᵢⱼ / Σⱼ wᵢⱼ**

where yᵢⱼ = 1 if animal j in group i had the tumor, and wᵢⱼ = 1 for tumor-bearing or terminally sacrificed animals, or (tᵢⱼ)^k for animals dying early without the tumor. The trend test is then a survival-adjusted Cochran-Armitage test using these adjusted denominators. Bieler and Williams (Biometrics, 1993) corrected the original variance estimate using a jackknife estimator, which is now standard in NTP and most implementations. The NTP adopted the poly-3 test as its **standard method for all 2-year bioassays**, performing both poly-3 trend tests and continuity-corrected poly-3 pairwise comparisons.

### Fisher's exact test and the Cochran-Armitage trend test

Fisher's exact test provides **pairwise comparisons** between control and each dose group using the hypergeometric distribution, computing exact probabilities without relying on asymptotic approximations. It is preferred for rare tumors where expected cell counts fall below approximately 5. The standard Cochran-Armitage trend test evaluates whether tumor proportions increase linearly with dose across all groups simultaneously.

The standard analytical approach uses **both trend and pairwise tests**. The FDA CDER guidance states that "statistical tests for positive trends in tumor rates are usually of greatest interest, but… in some situations, pairwise comparisons are considered to be more indicative of drug effects than trend tests." Trend tests are more powerful when a true linear dose-response exists; pairwise tests are essential when the response is non-monotonic or when only one dose group shows an effect. NTP reports both, declaring significance if either is significant.

### Significance thresholds and the Haseman criteria

Per Haseman (1983, Fundamentals of Applied Toxicology 3:334–339), adopted by FDA and NTP: **p ≤ 0.05 for rare tumors** (background rate <1%) and **p ≤ 0.01 for common tumors** (background rate ≥1%). This two-tier threshold controls the overall false-positive rate at approximately 8% given the 30–60 tumor sites tested per species/sex combination.

For application implementation, the decision hierarchy is: use the poly-3 test as default when cause-of-death data is unavailable or unreliable; use the Peto test when reliable cause-of-death classification exists; always report both trend and pairwise p-values; apply the Haseman rare/common threshold; and use one-sided tests for increased tumor incidence.

---

## Historical control databases anchor tumor interpretation

### Why concurrent controls are insufficient alone

The concurrent control group—typically 50–65 animals—is universally acknowledged as the **most relevant comparator** for determining treatment-related effects. However, concurrent controls can exhibit aberrantly high or low spontaneous tumor rates by chance. Historical control databases (HCDs) provide the distributional context needed to assess whether a marginally significant finding is biologically meaningful. The FDA Redbook 2000 (IV.B.3) states that "the additional information most often requested by the Agency is clarification of the diagnostic criteria used and historical control data for a specific lesion."

HCDs are particularly critical for **rare tumors**: when a tumor type occurs at ≤1% spontaneous incidence, even a single occurrence in a treated group can reach statistical significance against a concurrent control with zero incidence. The NTP approach uses HCD as supplementary evidence—when all lifetime tumor rates in a study fall within the historical range, findings may be considered "not exposure related" even with borderline statistical significance.

### Published background incidence rates by strain

The table below compiles key published rates from multiple sources. These numbers are essential reference data for any carcinogenicity analysis application.

| Tumor type | SD males | SD females | Wistar Han males | Wistar Han females | F344 males | F344 females |
|---|---|---|---|---|---|---|
| Pituitary adenoma (pars distalis) | 56.4% | 77.1% | 40.7% | 58.6% | High | Very high |
| Mammary fibroadenoma | — | 31–72% | — | 10–22% | — | Lower |
| Mammary carcinoma | — | 10–25% | — | Lower than SD | — | Lower |
| Thyroid C-cell adenoma | 10.9% | 8.5% | Variable | Variable | 17–31% | 11–24% |
| Adrenal pheochromocytoma (benign) | 8.9–19% | — | Lower | — | Higher | — |
| Leydig cell tumor | 2–6% | — | 0.8–40%* | — | 83–100% | — |
| Mononuclear cell leukemia | <1% | <1% | Low | Low | 38% (8–58%) | 21% (8–40%) |
| Thymoma | 0.4% | — | 1.3–2.5% | 3.3–13.4% | 0.2–0.4% | — |

*Leydig cell tumor rates in Wistar vary dramatically by breeder source (2.8–39.9% per RITA database, Nolte et al. 2010).

SD female data from Kumar et al. (2023, Toxicol Pathol, Labcorp HCD, ~1800 animals); NTP data from Dinse et al. (2010, Toxicol Pathol 38:765–775) and Brix et al. (2005, Toxicol Pathol 33:477–483); F344 data from NTP historical control reports (2009) and Haseman et al. (1998, Toxicol Pathol 26:428–441).

### Major HCD sources and their characteristics

**NTP (National Toxicology Program)** maintains the most publicly accessible database at ntp.niehs.nih.gov/data/controls, updated annually with a rolling 5-year window. Data is organized by species, sex, route, vehicle, and laboratory, with downloadable Excel files. Individual animal-level data is available through the CEBS (Chemical Effects in Biological Systems) database. NTP covers Hsd:Sprague Dawley SD (current default since ~2010), historical F344/N data spanning 30+ years, and Crl:WI(Han). The NTP transitioned away from F344 in 2006 due primarily to confounding high background rates of Leydig cell tumors and mononuclear cell leukemia.

**Charles River Laboratories** maintains internal databases by strain/sex from control groups across their preclinical services sites. Key publications include Giknis and Clifford compilations (2004, 2013 updates) for Crl:CD(SD) and Crl:WI(Han), plus peer-reviewed papers by Isobe, Mukaratirwa, and Bradley on organ-specific background rates. Morse et al. (2025, Int J Toxicol) published a comparison across 51 SD and 31 Wistar Hannover studies from 2016–2023, reporting that **47 of 51 SD studies were terminated early due to poor survival**, with total spontaneous neoplasm incidence reaching 95.93% in female SD rats.

**Envigo/Inotiv** (formerly Harlan) provides extensive HCD for RccHan:WIST (Wistar Hannover) and Hsd:Sprague Dawley SD, including survival data from 50+ carcinogenicity studies. Their white papers document the striking survival advantage of Wistar Han rats: **~70–72% male survival and ~65–73% female survival at 104 weeks**, compared to ~31% and ~38% respectively for SD rats.

**RITA (Registry of Industrial Toxicology Animal-data)**, maintained by Fraunhofer ITEM in Hannover, aggregates data from ~13 pharmaceutical/agrochemical companies across ~10,896 rats from 106 studies. All data undergo peer review by a database pathologist, with standardized WHO/IARC nomenclature.

### The 5-year relevance window

The consensus standard is to use HCD from the **most recent 5 years**, as explicitly stated by NTP and recommended by STP best practices (Keenan et al., 2009, Toxicol Pathol 37:679–693). This window exists because genetic drift in outbred stocks alters tumor predisposition over time—Tennekes et al. (2004) demonstrated that "tumor drift was not common but occurred far more often in outbred rat strains (Wistar and Sprague-Dawley) than in the inbred rat strain (F344)." Diet changes (NTP's switch from NIH-07 to NTP-2000 significantly affected rates), housing transitions, and diagnostic criteria evolution also shift baseline rates. Temporal drift is well-documented: at BoZo Research Center, F344 thyroid C-cell adenoma rates in males rose from **17.4% (1990–1999) to 30.8% (2005–2009)**.

The STP recommends displaying HCD using boxplots rather than simple mean ± SD or ranges, overlaying current study dose groups on the historical distribution. Range alone is misleading because it inevitably widens as database size increases.

---

## The adenoma-to-carcinoma morphological continuum

### How pathologists evaluate neoplastic progression

Neoplastic development follows a recognized **multistep continuum**: preneoplastic lesion → hyperplasia → benign neoplasm (adenoma) → malignant neoplasm (carcinoma). The FDA Redbook 2000 (IV.C.6) explicitly acknowledges the diagnostic challenge: "it is frequently a matter of arbitrary definition and expert pathologists may disagree about how to designate tumors on the borderline of the continuum between benign and malignant."

The liver provides the best-characterized progression model. Per INHAND consensus nomenclature (Thoolen et al., Toxicol Pathol 2010;38(7S):5S–81S), the sequence is: **foci of cellular alteration (FCA) → hepatocellular adenoma (HCA) → hepatocellular carcinoma (HCC)**. FCAs include basophilic, eosinophilic, clear cell, mixed, and amphophilic subtypes—they show tinctorial variation from normal parenchyma but critically do **not** compress adjacent tissue. The transition to adenoma is marked by sharp demarcation with slight compression, uniform morphology, and preserved reticulin framework. Carcinoma is diagnosed by trabecular cord thickness ≥3 cells, loss of reticulin framework, cellular atypia with nuclear pleomorphism, invasive growth, and potential for metastasis (most commonly to lung). HCCs may arise within pre-existing HCAs—direct evidence for the progression paradigm.

Other well-characterized organ progressions include thyroid follicular cell (diffuse hyperplasia → follicular adenoma → follicular carcinoma, driven by chronic TSH stimulation), thyroid C-cell (hyperplasia → adenoma → medullary carcinoma), mammary gland (hyperplasia → fibroadenoma/adenoma → adenocarcinoma), and urinary bladder (hyperplasia → papilloma → transitional cell carcinoma).

### Combining tumors for statistical analysis

The foundational guidelines for tumor combination come from **McConnell et al. (JNCI, 1986;76(2):283–289)**, updated by Brix et al. (2010) and most recently by **Keenan et al. (2024, Toxicol Pathol)**, which was created at FDA request by a joint STP/ESTP/BSTP/FDA/INHAND working group.

The core principle: **tumors should be combined when benign and malignant neoplasms arise from the same cell type and a morphological continuum (progression paradigm) is established.** The FDA Redbook 2000 (IV.C.6) states: "because it is frequently a matter of arbitrary definition… and because of practical difficulties in categorizing certain tumors as benign or malignant, it is usually necessary to combine the incidence of certain benign tumors with that of malignant tumors occurring in the same tissue and organ for statistical analysis."

Standard combinations include hepatocellular adenoma + carcinoma, thyroid follicular adenoma + carcinoma, adrenal cortical adenoma + carcinoma, pituitary adenoma + carcinoma, and lung bronchiolo-alveolar adenoma + carcinoma. Tumors should **not** be combined across different cell types within the same organ—hepatocellular adenoma must not be pooled with cholangiocellular (bile duct) adenoma despite both originating in the liver, because they arise from different cell lineages.

Best practice is to always run **three parallel analyses**: adenoma alone, carcinoma alone, and adenoma + carcinoma combined. NTP criteria for "clear evidence" of carcinogenic activity include "a dose-related increase of malignant neoplasms, a combination of malignant and benign neoplasms, or benign neoplasms if there is any indication that such tumors could progress to malignancy."

The 2024 Keenan et al. Tumor Combination Guide provides a tabular format correlating INHAND tumor names with SEND NEOPLASM controlled terminology NCI C-codes, designed specifically for FDA reviewers and biostatisticians performing carcinogenicity analyses on SEND-formatted data.

---

## SEND TF domain structure and TFSTRESC encoding

### Architecture of the TF domain

The Tumor Findings (TF) domain, defined in SENDIG v3.0/v3.1, follows the SDTM Findings General Observation Class. TF is a **derived subset of the MI (Microscopic Findings) domain**—only records representing diagnosed neoplastic findings are transferred from MI into TF. An important note for future-proofing: **SEND v4.0 (expected Q1 2026) deprecates TF entirely**, migrating tumor data back into MI with expanded variables.

The critical variables for analytical purposes are:

- **TFSTRESC** (Standardized Character Result): Uses the NEOPLASM codelist (NCI C88025), an extensible codelist containing hundreds of terms harmonized with INHAND nomenclature. Terms encode morphology and behavior directly in the name—benign suffixes (-oma: adenoma, fibroma, papilloma) versus malignant suffixes (-carcinoma, -sarcoma). Some terms require explicit qualification: "pheochromocytoma, benign" versus "pheochromocytoma, malignant."

- **TFRESCAT** (Result Category): Uses the NEOSTAT codelist (NCI C90004), a **non-extensible codelist with exactly three values**: BENIGN, MALIGNANT, and UNDETERMINED. Unlike MIRESCAT (Permissible in MI), TFRESCAT is **Required** in TF—every tumor record must be classified.

- **TFLOC** (Location): Anatomical site using SEND CT location terminology (e.g., "LIVER," "MAMMARY GLAND," "THYROID GLAND").

- **TFLAT** (Laterality): LEFT, RIGHT, or BILATERAL for paired organs.

### Cross-domain relationships for tumor tracking

A single mass can appear across up to five SEND domains, linked via RELREC (Related Records) using TFSPID/--SPID identifiers:

- **CL** (Clinical Observations): Mass first observed in life
- **PM** (Palpable Masses): Mass measured by palpation
- **MA** (Macroscopic Findings): Mass observed at necropsy
- **MI** (Microscopic Findings): Full histopathological diagnosis
- **TF** (Tumor Findings): Neoplastic classification for statistical analysis

To link tumors to treatment groups, the application must join TF → DM (Demographics) on USUBJID to obtain ARM and SETCD, then join to TX (Trial Sets) for dose levels. The DS (Disposition) domain provides cause and date of death, essential for survival-adjusted analyses.

### Implementation guidance for parsing

Use **TFRESCAT as the authoritative source** for benign/malignant classification, with TFSTRESC term parsing as validation. Cross-reference the NEOPLASM codelist NCI C-codes for metadata including neoplastic status. The NEOPLASM codelist is extensible—sponsor-specific terms may appear that are not in the standard published list, requiring graceful handling of unknown values. CDISC controlled terminology is published quarterly by NCI Enterprise Vocabulary Services, available at evs.nci.nih.gov, with diff files comparing each release to the previous version. The **SEND Tumor Combinations v1.0 spreadsheet** (Keenan et al., 2024) serves as the lookup table for combining tumor types, correlating INHAND names with NEOPLASM CT entries and NCI C-codes.

---

## Study duration determines what tumor findings mean

### 13-week, 26-week, and 2-year study expectations

At **13 weeks**, true neoplasms are rare and almost always spontaneous. The value lies in preneoplastic indicators: cellular hyperplasia, hypertrophy, foci of cellular alteration, and tissue degeneration with regenerative proliferation. Per ICH S1C(R2), dose selection for carcinogenicity studies is "generally determined from 90-day studies using the route and method of administration that will be used in the bioassay." A survey of SD rats (2,249 animals, ages 12–18 weeks) found only 3 tubular carcinomas and 1 tubular adenoma—all considered spontaneous.

At **26 weeks**, the data becomes highly predictive. ICH S1B(R1) identifies histopathology findings from 6-month rat studies as one of six critical WoE factors for determining whether a 2-year study is needed. Reddy et al. (Toxicol Pathol, 2010) analyzed 80 pharmaceuticals and found that **25 of 30 rat carcinogens showed histopathologic signals in chronic studies (83% sensitivity)** with 88% negative predictive value. The 26-week rasH2 transgenic mouse model—carrying ~3 copies of the human c-Ha-ras proto-oncogene—provides an accelerated carcinogenicity assessment accepted by FDA, EMA, and PMDA as an alternative to the 2-year mouse bioassay, using just 25 animals/sex/group versus ≥50 for conventional studies.

The **2-year (104-week) study** remains the gold standard for carcinogenicity assessment. OECD TG 451 requires at least 50 animals/sex/group across ≥3 dose levels plus concurrent control. The FDA Redbook requires "at least 25 rodents per sex per group survive to the end of the study" (50% minimum survival). Termination should be considered when control or low-dose group survival drops to 25%. Many treatment-related tumors manifest in the final quarter (weeks 78–104), making late-study survival critical.

### Strain selection profoundly affects interpretation

The three major rat strains differ dramatically in background tumor profiles, survival characteristics, and suitability for carcinogenicity assessment.

**Sprague-Dawley rats** carry the highest overall tumor burden in females (total spontaneous neoplasm incidence reaching **95.93%** per Morse et al. 2025), dominated by pituitary adenoma (~77% in females) and mammary fibroadenoma (31–72%). Their poor survival—approximately **31% in males and 38% in females at 104 weeks**—frequently forces early study termination (47 of 51 Charles River SD studies terminated early). Mononuclear cell leukemia is rare (<1%).

**Wistar Han rats** offer the lowest overall tumor burden and dramatically better survival: **~70–72% in males and ~65–73% in females at 104 weeks**—more than double SD survival rates. Lower pituitary and mammary tumor rates provide a cleaner baseline, though Leydig cell tumor rates vary dramatically by breeder source (2.8–39.9% per RITA data). The pharmaceutical industry, particularly in Europe and Japan, increasingly favors Wistar Han.

**Fischer 344 rats** were the NTP workhorse for over 30 years but were abandoned in 2006 due to three confounding high-background tumors: **Leydig cell tumors (~83–100% in males)**, **mononuclear cell leukemia (~38% in males, ~21% in females)**, and tunica vaginalis mesothelioma. These strain-specific tumors created interpretive challenges where treatment-related increases were difficult to distinguish from extreme baseline variability. Additional problems included decreased fecundity, sporadic seizures, and idiopathic chylothorax.

---

## Integrating proliferative and non-proliferative findings through weight of evidence

### The STP framework for mechanistic integration

The Society of Toxicologic Pathology, through INHAND publications and position papers, systematically catalogs both proliferative (hyperplasia → adenoma → carcinoma) and non-proliferative findings (degeneration, necrosis, inflammation) for each organ system precisely because **non-proliferative findings often represent precursor events or mechanistic evidence** explaining proliferative outcomes.

Critical mechanistic pathways include hepatotoxicity chains (chronic necrosis → regenerative hyperplasia → neoplasia), enzyme induction cascades (phenobarbital-type CYP induction → hepatocellular hypertrophy → hyperplasia → tumors), thyroid hormone disruption (increased hepatic UDGT → decreased T4 → increased TSH → follicular hyperplasia → tumors), and α2u-globulin nephropathy (male rat–specific protein accumulation → proximal tubular injury → regenerative proliferation → renal tumors). Several of these mechanisms have established **human non-relevance**: PPARα-mediated rodent liver tumors, TSH-mediated thyroid follicular tumors at pharmacological doses, and α2u-globulin renal tumors are all considered not predictive of human risk per consensus positions from STP, IARC, EPA, and FDA.

### Weight-of-evidence integration across all endpoints

The WoE approach, codified in ICH S1B(R1), integrates tumor incidence and statistical significance, dose-response relationships, HCD comparisons, the full spectrum of proliferative lesions, non-neoplastic findings providing mechanistic clues, genotoxicity data, pharmacological mechanism, time-of-onset data, species/strain/sex concordance, and human relevance considerations.

NTP applies this through its five-tier evidence classification: **clear evidence**, **some evidence**, **equivocal evidence**, **no evidence**, and **inadequate study**—using 15 reference points for borderline cases including presence of dose relationships, statistical significance, whether tumors are rare or common, latency shifts, historical control context, and biological plausibility.

The IPCS/WHO Mode of Action Framework provides the structured approach for evaluating whether a specific mechanism operates in humans, using modified Bradford-Hill criteria (dose-response concordance, temporal concordance, strength, consistency, plausibility, coherence). EPA carcinogen risk assessment guidelines (2005) establish three defaults: linear low-dose extrapolation for mutagenic MOAs, margin-of-exposure for threshold/non-genotoxic MOAs, and discounting for mechanisms not relevant to humans.

Key STP position papers and best practices publications include Keenan et al. (2009) on HCD best practices, Elmore and Peddada (2009) on statistical considerations, Keenan et al. (2024) on tumor combinations, the STP Peto Analysis Working Group (2001) on neoplasm classification, Kerlin et al. (2016) on determining and communicating adverse effects, and Schafer et al. (2018) on standardized severity grading.

---

## ICH S1 guidelines define the regulatory framework

**ICH S1A** (1995) establishes that carcinogenicity studies are required for pharmaceuticals with expected continuous clinical use of **≥6 months**, with the practical expectation that most drugs indicated for 3-month treatment will also be used for 6 months. Cause-for-concern triggers—including structure-activity relationships, preneoplastic lesions in repeat-dose studies, or long-term tissue retention—can mandate studies regardless of treatment duration.

**ICH S1B** (1997) originally required one long-term rodent study (typically 2-year rat) plus one additional assay (either a 26-week transgenic mouse study or a second 2-year rodent study). The **S1B(R1) addendum (August 2022)** introduced a transformative WoE approach evaluating six factors: drug target biology, secondary pharmacology, chronic toxicity histopathology, hormonal perturbation evidence, genotoxicity, and immune modulation. Three outcome categories determine whether a 2-year rat study is needed, adds value, or does not add value. Sponsors using the WoE approach must submit a Carcinogenicity Assessment Document and obtain regulatory concurrence. The ICH S1 Prospective Evaluation Study demonstrated that ~27% of 2-year rat studies could have been avoided under this framework.

**ICH S1C(R2)** governs high-dose selection through multiple accepted approaches: **maximum tolerated dose** (≤10% body weight gain decrease vs. controls), **25-fold AUC exposure ratio** (rodent:human, raised to 50-fold for rasH2 studies per S1B(R1)), **saturation of absorption**, and a **limit dose of 1500 mg/kg/day**. Low and middle doses should provide dose-response data, with low dose producing minimal toxicity.

---

## Conclusion

Building a toxicology data analysis application for SEND-formatted tumor data requires implementing several interconnected analytical layers. The **poly-3 test should serve as the default statistical engine**, with Peto analysis available when cause-of-death data is reliable. The application must parse TFRESCAT for benign/malignant classification, use the SEND Tumor Combinations spreadsheet as a lookup for pooling decisions, and run three parallel analyses (adenoma alone, carcinoma alone, combined) for each organ/cell type. Historical control comparison should use rolling 5-year windows with poly-3 adjusted rates, displaying results as boxplots with dose groups overlaid. The system should cross-reference non-proliferative MI findings with TF neoplastic findings in the same organ to support mechanistic interpretation, and flag tumors with established human non-relevance mechanisms (PPARα liver, TSH thyroid, α2u-globulin renal). Strain-specific background rate tables are essential for contextualizing findings—the difference between 77% pituitary adenoma in SD females and ~58% in Wistar Han females fundamentally changes what constitutes a meaningful treatment-related increase. With SEND v4.0 retiring the TF domain, designing a flexible data model that can accommodate both TF-based and MI-based tumor extraction will ensure forward compatibility.