# How the FDA reviews SEND submissions: a complete technical reference

**The FDA reviews nonclinical SEND data through a layered system of gateway validation, automated data fitness checks, interactive visualization tools, and cross-study analysis—all managed by CDER's Office of Computational Science (OCS).** The primary review platform is **Janus Nonclinical**, a proprietary data repository now holding over 10,000 sponsor-submitted SEND datasets, which replaced the earlier NIMS system around 2018. Understanding this review pipeline is essential for building a toxicology data browser that mirrors how FDA reviewers actually interact with SEND data. This document covers the complete FDA review infrastructure, cross-domain analytical patterns, domain-specific interpretation methods, common submission deficiencies, and the computational toxicology research programs driving next-generation analysis.

---

## The FDA's SEND review pipeline: from gateway to reviewer's desk

SEND datasets pass through four distinct processing stages before reaching a pharmacology/toxicology reviewer. Each stage applies different validation and analysis tools.

**Stage 1: Electronic gateway Technical Rejection Criteria (TRC).** Enforced since **September 15, 2021**, TRC performs four sequential automated checks at the eCTD submission gateway. Failure at any step halts processing and the submission is rejected outright—it never enters the FDA system. The four rules are: Rule 1789 (Study Tagging File must be present), Rule 1734 (ts.xpt with study start date required), Rule 1735 (correct STF file-tags for datasets and define.xml), and Rule 1736 (DM dataset and define.xml required for SEND sections). TRC applies to eCTD folders **4.2.3.1** (single-dose toxicity), **4.2.3.2** (repeat-dose toxicity), and **4.2.3.4** (carcinogenicity). In CY2020, **46.3% of submissions** with study data in TRC-applicable sections failed at least one rule—a remarkably high failure rate.

**Stage 2: Janus Nonclinical automated loading and validation.** Every SEND study that passes the gateway undergoes automated extraction, transformation, and loading into Janus Nonclinical. During loading, the system checks define.xml integrity, missing reference values, special characters, file naming compliance, and required domain completeness. Historically, the majority of datasets required at least two loading attempts. The FDA's internal validation instance—**DataFit**, built on Pinnacle 21 Enterprise—applies **480+ validator rules** (as of v1.6, December 2022), combining CDISC conformance rules with FDA-specific business rules. The MI (microscopic findings) and tumor data domains alone carry **14 specific business rules** requiring cross-domain validation checks.

**Stage 3: KickStart data fitness assessment.** OCS offers its **KickStart service** (now called OCS Nonclinical Services) to all pharmacology/toxicology reviewers. This includes a 60-minute pre-training session on SEND concepts and Janus Nonclinical features, followed by a combined automated and manual **Data Fitness Assessment** that checks CDISC compliance, confirms completeness, verifies consistency across study files (nSDRG, define.xml, datasets), and tests whether summarizations in the study report can be reproduced from SEND data. Two deliverables result: a Sponsor Data Fitness Report sent back to the sponsor, and a Reviewer Summary Presentation highlighting issues affecting review. Through December 2019, **80 applications** received KickStart service across **124 studies**.

**Stage 4: Interactive reviewer analysis.** Pharmacology/toxicology reviewers in the Office of New Drugs access Janus Nonclinical directly for visualization and analysis. The system generates automated outputs that reviewers can export directly into review documents.

### Automated outputs available in Janus Nonclinical by domain

| Domain | Automated Output |
|--------|-----------------|
| **BW** (Body Weight) | Body weight trend graphs by dose group over time, group mean calculations |
| **LB** (Laboratory) | Group means and SDs for continuous results; incidence counts for categorical results (urinalysis); identification of tests with/without LBSTRESN |
| **MI** (Microscopic Findings) | Histopathology heat maps by organ/tissue and dose group; incidence summaries |
| **MA** (Macroscopic Findings) | Tables of study-specific gross pathology findings |
| **CL** (Clinical Observations) | Incidence summaries; scored observations for Draize test, FOB, body condition |
| **OM** (Organ Measurements) | Tabulated organ weight data (absolute and relative) |
| **DS** (Disposition) | Details on animal deaths, sacrifice timing |
| **PC/PP** (Pharmacokinetics) | Concentration-time graphs; PK parameter tables |

The 90-minute **Data Exploration Session** walks reviewers through domain-specific outputs and teaches independent query generation. This is the environment your toxicology browser should aim to replicate and improve upon.

---

## Cross-domain signal patterns that drive FDA safety assessment

FDA reviewers do not evaluate SEND domains in isolation. The **weight of evidence** approach—mandated by ICH M3(R2), ICH S6(R1), and ICH S8—requires correlating findings across all domains to characterize toxicity profiles and determine the NOAEL. Specific cross-domain patterns flag target organ toxicity with high confidence.

**Hepatotoxicity is the paradigm case for cross-domain correlation.** Reviewers look for elevated ALT (most liver-specific) and AST in the LB domain, increased liver weight (absolute and relative) in OM, hepatocellular necrosis/vacuolation/hypertrophy in MI, and enlarged or discolored liver in MA. The **"Hy's Law" pattern**—ALT/AST >3× upper limit of normal combined with bilirubin >2× ULN—triggers the highest concern. When all four domain signals converge with dose-dependence, the finding is considered unambiguously treatment-related.

**Nephrotoxicity follows a similar multi-domain pattern.** LB changes include elevated BUN and creatinine, proteinuria and glucosuria on urinalysis, and electrolyte imbalances. Emerging biomarkers like KIM-1, NGAL, and clusterin add specificity. OM shows altered kidney weight, MI reveals tubular necrosis or glomerular changes, and MA may show enlarged, pale, or pitted kidneys. Critically, **increased water consumption in the FW domain** (polydipsia) may indicate renal concentrating defect, providing an early signal that precedes overt laboratory changes.

**Hematopoietic toxicity** combines decreased RBC/hemoglobin/hematocrit in LB with altered spleen and thymus weights in OM, bone marrow hypocellularity or splenic atrophy in MI, and pallor or petechiae in CL. The Society of Toxicologic Pathology (STP) position paper (Sellers et al., 2007) specifically warns that lymphoid organ weight changes without corresponding histopathological alteration are unreliable and should be "interpreted with caution."

### The integration hierarchy reviewers apply

Findings gain evidentiary weight when they satisfy multiple criteria simultaneously. The strongest treatment-related conclusions arise when findings are **dose-dependent** (increasing incidence or severity with dose), **concordant across domains** (converging signals from LB, OM, MI, MA), **consistent across sexes** (or with biologically explicable sex differences), **consistent across species**, and **biologically plausible** given the pharmacological mechanism of action. The NOAEL—the ultimate output of nonclinical review—is determined at the highest dose where no adverse effects are observed across all endpoints collectively. When findings appear in only a single domain without cross-domain corroboration, they may be classified as non-adverse or adaptive, preserving a higher NOAEL.

The OM-MI correlation deserves special attention for your browser. The STP recommends that **the study pathologist examine all organ weight data prior to initiating histopathological evaluation**, because organ weight changes must be interpreted within the context of microscopic findings. Your application should facilitate this workflow by enabling side-by-side or linked views of OM and MI data for the same organs.

---

## How DD/DS data frames the severity ceiling for all other domains

The DD (death diagnosis) and DS (disposition) domains establish the **severity ceiling** for the entire study and fundamentally alter interpretation of every other domain. Animals found dead or sacrificed moribund represent the most extreme toxicity outcome, and FDA reviewers treat these events as the first-order signal when evaluating a submission.

**Early deaths determine whether a dose level exceeds the maximum tolerated dose (MTD).** When reviewers open a study in Janus Nonclinical, animal death details are among the first automated outputs they examine. The DS domain records terminal sacrifice, unscheduled death, and moribund sacrifice status for each animal, while DD captures the official cause of death and circumstances. In published FDA pharmacology/toxicology reviews (e.g., NDA 211675 for upadacitinib, BLA 761238 for ublituximab), reviewers explicitly note animals "found dead or sacrificed moribund" and correlate these events with dose levels, clinical signs, and postmortem findings.

**Early deaths contaminate data from other domains in specific, predictable ways.** The STP explicitly recommends that **organ weights should NOT be collected from animals dying before scheduled necropsy** because differences in nutritional status, exsanguination quality, tissue congestion/edema, and the absence of matched concurrent controls confound interpretation. Histopathology findings in early-death animals must be interpreted separately from scheduled sacrifice animals—autolytic changes in animals found dead may render microscopic evaluation unreliable. Terminal body weights from moribund animals reflect combined toxicity and moribundity effects, contaminating dose-response analysis if pooled with scheduled sacrifice data. Terminal blood samples from moribund animals may show extreme laboratory values reflecting the agonal state rather than specific drug effects.

**For your browser, this means DD/DS data should serve as a filter layer across all other domains.** Implement the ability to segregate animals by disposition status—separating scheduled sacrifice, moribund sacrifice, and found-dead animals—before displaying BW, LB, MI, MA, or OM data. Flag any domain data from early-death animals with visual indicators, and provide the option to exclude these animals from group summary calculations while still displaying them separately for review.

---

## FW data distinguishes direct toxicity from secondary effects

Food and water consumption data serve a specific, well-defined analytical purpose in FDA review: determining whether observed body weight changes reflect **direct organ toxicity** or **secondary effects of reduced food intake**. The FDA Redbook 2000 guidance (Section IV.B.1) provides the foundational framework for this analysis.

**The food efficiency ratio is the critical derived metric.** Five parameters are typically analyzed together: body weight, body weight gain, food consumption, food consumption relative to body weight, and the **efficiency of food utilization** (weight gained divided by food consumed). When food efficiency remains normal—animals gain weight proportionally to what they eat—reduced food intake explains the weight loss (a palatability or taste aversion effect). When food efficiency is reduced—animals gain less weight per unit of food consumed—direct toxicity is indicated through metabolic disruption, malabsorption, or catabolic processes. Your browser should calculate and display this ratio.

**Temporal correlation between FW and BW reveals mechanism.** Body weight loss that precedes food consumption reduction suggests direct toxicity. Food consumption reduction preceding weight loss suggests a palatability issue. If FW decreases track BW decreases proportionally across dose groups, secondary effects are more likely. If organ toxicity indices (LB, MI) appear without proportional FW reduction, direct toxicity is implicated. During recovery periods, if food consumption normalizes before body weight, palatability is supported; if body weight recovers more slowly than food consumption, residual organ damage may persist.

**Water consumption provides independent signals.** Increased water consumption (polydipsia) may indicate renal toxicity (concentrating defect), diabetes-like effects, or electrolyte imbalances. Decreased water consumption typically correlates with decreased food intake or general debility. FW water data correlated with urinalysis from the LB domain and kidney weight/histopathology from OM/MI distinguishes renal from non-renal causes. The FDA explicitly requires **single-caging** for individual food consumption determination—this is the prerequisite for meaningful FW-BW correlation analysis.

**Caloric dilution is an additional confounder** your browser should account for. When a non-nutritive test substance composes more than 5% of the diet, both caloric and nutrient densities are diluted. Animals may compensate by eating more, masking apparent toxicity. The FDA recommends two control groups in such cases: an undiluted control and a control with inert filler at the same percentage.

---

## The six most common SEND submission deficiencies

FDA's KickStart Data Fitness assessments across hundreds of studies have identified recurring deficiency patterns. Understanding these informs both what your browser should validate and what data quality issues it should flag for users.

**Timing variable errors appear in 87% of studies reviewed** and represent the single most prevalent deficiency class. The planned/nominal day (VISITDY/--NOMDY) frequently fails to align data with study report summaries because sponsors report actual collection day rather than the planned study day. Elapsed time post-dose (--ELTM) for plasma concentration results is missing or incorrect, and --TPTREF lacks sufficient specificity for complex dosing regimens. In SENDIG 3.0, unscheduled results should have blank VISITDY; in SENDIG 3.1, --USCHFL="Y" should be used—many sponsors confuse these conventions.

**Categorical result misclassification in the LB domain** causes Janus Nonclinical to produce wrong statistical summaries. When sponsors incorrectly populate LBSTRESN (numeric result) for semi-quantitative results like urine protein scored as trace/1+/2+, the system calculates means and standard deviations instead of incidence counts. The same issue affects CL domain data for Draize tests, functional observation batteries, and body condition scoring. Your browser should detect when LBSTRESN contains categorical data and switch to incidence-based display.

**Missing replacement values for below-quantitation results affect approximately 50% of studies.** Character replacement values (--CALCN in SUPP-- datasets) for results below the limit of quantitation are omitted, most commonly for plasma concentration results. Without these values, FDA tools exclude below-LLOQ results from mean calculations rather than applying the sponsor's substitution method (typically half of LLOQ).

**Undefined codes and abbreviations appear in nearly 50% of studies**, found as result values, in reason fields, as finding modifiers, and in comments. Unit abbreviations not conforming to the published UNIT codelist are particularly problematic.

**Cross-domain linking failures** undermine the analytical power of SEND data. Determining the study EPOCH for a finding requires linking through four domains (Findings → SE → DM → TA), and overlapping dates in the SE domain break this chain. Animal age calculation requires three "Permissible" variables across TS, DM, and Findings domains—successfully calculable only 98.2% of the time. Historical control queries are impeded by inconsistent animal supplier names and test facility names, for which no controlled terminology exists.

**The study report–dataset disconnect** is a structural problem: SEND datasets and study reports are generated by independent processes from common source data, leading to inconsistencies in summarizations, missing datasets for data types present in the report, and individual data tables that don't align with dataset content. The PhUSE white paper WP-070 identified five critical alignment areas where this disconnect manifests.

---

## FDA's computational toxicology groups and their analytical programs

Two distinct organizational units within FDA drive computational approaches to nonclinical data analysis, with increasingly overlapping missions.

**CDER's Office of Computational Science (OCS)** handles operational review support. Led by **Lilliam Rosario, Ph.D.**, OCS manages Janus Nonclinical, the KickStart service, DataFit validation, and cross-study analysis tool development. Key personnel include **Kevin Snyder** (data scientist, lead developer of sendigR, central figure in SEND cross-study analysis), **Jesse Anderson** (KickStart program manager), **Md Yousuf Ali** (developer of the toxSummary R Shiny app), and **Catherine Li** (Janus Nonclinical presentations). OCS's motto—"Better data, better tools, better decisions"—captures their review-focused mission.

**NCTR's Division of Bioinformatics and Biostatistics (DBB)** drives fundamental computational toxicology research. Led by **Weida Tong, Ph.D.** (over 300 publications), DBB houses 18+ principal investigators developing next-generation AI tools. **William Slikker Jr., Ph.D.** served as NCTR Director providing institutional leadership. The flagship **AI4TOX program** comprises five initiatives:

- **AnimalGAN**: Generative AI creating virtual animal "digital twins" to predict toxicological outcomes without additional animal studies
- **SafetAI**: Deep learning QSAR models predicting hepatotoxicity, carcinogenicity, mutagenicity, nephrotoxicity, and cardiotoxicity—a collaborative initiative between CDER and NCTR, led by **Shraddha Thakkar, Ph.D.**
- **BERTox**: NLP and large language models for analyzing FDA documents and toxicology literature
- **PathologAI**: AI framework for histopathological data analysis from animal studies
- **TranslAI**: The newest initiative focusing on translational safety prediction

The **sendigR R package** represents the most directly relevant tool for your browser's design. Developed collaboratively by FDA/CDER, BioCelerate, and PhUSE, sendigR builds relational SQLite databases from collections of SEND XPT files and enables historical control data extraction based on species, strain, route, study duration, and animal age. It includes an R Shiny web application for non-coding toxicologists and an **xptcleaner** Python module that harmonizes terminology by mapping synonymous terms to CDISC controlled terminology. The landmark publication by Carfagna et al. (2024, Toxicological Sciences) demonstrated Z-score normalization across BW, LB, and MI domains for toxicity profile classification using radar plots grouped by organ system—a visualization pattern your browser should consider implementing.

A 2024 FDA fellowship posting (FDA-CDER-2024-1449) explicitly bridges SEND and computational toxicology, focusing on "development of methods to detect toxicity signals in SEND datasets" and "deployment of QSAR models to predict the detection of toxicity, based on signals in SEND datasets." This confirms that FDA is actively building toward automated signal detection within SEND data—the direction your browser should anticipate.

---

## Conclusion: design implications for a toxicology data browser

Several concrete patterns emerge from this research. First, **replicate the Janus Nonclinical output set**: body weight trend graphs, histopathology heat maps, laboratory group means with incidence toggles for categorical data, and clinical observation summaries form the baseline reviewer experience. Second, **implement DD/DS as a filter layer** that segregates animals by disposition status across all domain views, flagging early-death data and enabling exclusion from group summaries. Third, **calculate and prominently display food efficiency ratios** alongside BW and FW data to support the direct-versus-secondary toxicity distinction. Fourth, **build cross-domain correlation views** for the key toxicity patterns (hepatotoxicity, nephrotoxicity, hematopoietic toxicity) that simultaneously display relevant signals from LB, OM, MI, MA, and CL for the same organ system. Fifth, **validate incoming data against the known deficiency patterns**—timing variable alignment, categorical result detection in LB, missing replacement values, and study report–dataset consistency. Sixth, consider implementing Z-score normalization and radar plot visualization for cross-study toxicity profile comparison, following the Carfagna et al. methodology. The FDA's own analytical trajectory—from manual review through Janus Nonclinical to AI-powered signal detection via AI4TOX—charts the path your application should follow.