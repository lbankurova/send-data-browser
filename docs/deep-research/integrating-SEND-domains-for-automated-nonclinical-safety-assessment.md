# Integrating SEND domains for automated nonclinical safety assessment

**A toxicology data analysis tool must fuse signals across all SEND domains—disposition, body weight, food consumption, clinical observations, ECG/vital signs, clinical pathology, and histopathology—to produce a defensible, integrated safety assessment.** The key challenge is algorithmic: translating the weight-of-evidence reasoning that experienced toxicologists apply intuitively into structured decision logic. Published frameworks from ECETOC, STP, and ICH provide the scaffolding, while quantitative thresholds from FDA and OECD guidance anchor the numerical criteria. This report maps each SEND domain to its role in NOAEL determination and provides actionable implementation guidance for each integration pattern.

---

## 1. Disposition data drives the severity ceiling for every dose group

The DS (Disposition) and DD (Death Diagnosis) domains define the most consequential finding in any toxicology study: **treatment-related mortality automatically places a dose level above the NOAEL**. The SEND DS domain uses CDISC controlled terminology codelist C89968 with key DSDECOD values that a tool must classify into three categories:

| DSDECOD Value | Mortality Classification | NOAEL Impact |
|---|---|---|
| FOUND DEAD | Potentially treatment-related | Investigate via DD/MA/MI |
| MORIBUND SACRIFICE | Potentially treatment-related | Investigate via DD/CL/MI |
| ACCIDENTAL DEATH | Incidental | Exclude from efficacy analysis |
| TERMINAL SACRIFICE | Scheduled | Not mortality |
| INTERIM SACRIFICE | Scheduled | Not mortality |
| UNSCHEDULED SACRIFICE | Context-dependent | Requires DD review |

**Treatment-relatedness determination** follows a weight-of-evidence approach integrating five factors: dose-response relationship in mortality incidence, temporal relationship to dosing, pathological findings at necropsy (DD domain cause-of-death diagnosis), pre-mortem clinical signs from the CL domain, and comparison against historical control mortality rates for the strain and species. A single early death does not automatically affect NOAEL in rodent studies (typically 10–25 animals/sex/group), but in non-rodent studies with only **3–6 animals per group**, even one confirmed treatment-related death can be determinative.

Regulatory reviewers follow an implicit severity hierarchy: mortality sits at the apex, followed by severe/irreversible organ damage, moderate organ toxicity, mild organ changes, and adaptive responses at the base. Per Kale et al. (2022, *Toxicologic Pathology*), FDA pharmacology/toxicology reviewers treat death as "crucial in determining the NOAEL," and the ICH S4 maximum tolerated dose definition explicitly sets mortality as the upper boundary of acceptable toxicity. The algorithmic implementation should use **Fisher's exact test** for pairwise mortality comparisons against controls (appropriate for small sample sizes), the **Cochran-Armitage trend test** for dose-response in mortality incidence, and **Kaplan-Meier survival analysis with log-rank test** for chronic and carcinogenicity studies where time-to-death matters.

Moribund sacrifice criteria trigger when animals show clinically irreversible conditions: inability to ambulate or reach food/water, agonal breathing, body condition score ≤2, prolonged seizures, sustained weight loss exceeding **20% of body weight**, or persistent recumbency beyond 24 hours. These criteria, codified in OECD Guidance Document 19 and institutional IACUC protocols, should be cross-referenced with CL domain observations to confirm the clinical trajectory preceding each unscheduled death.

---

## 2. Distinguishing primary toxicity from palatability-driven weight loss

The relationship between FW (Food/Water Consumption) and BW (Body Weight) domains contains one of the most analytically consequential distinctions in toxicology: whether body weight decreases reflect **direct toxic injury** to tissues and metabolic pathways or are **secondary to reduced food intake** caused by test article palatability. The Flamm/Mayhew algorithm (Regulatory Toxicology and Pharmacology, 2003) provides the most rigorous published framework for this determination, using seven objective criteria.

**Indicators of secondary (palatability-driven) weight loss:**
- Food consumption decreases temporally precede or are concurrent with body weight decreases
- Food conversion efficiency (FCE = body weight gain per gram of food consumed) remains unchanged
- No corroborating toxicological findings in clinical pathology, organ weights, or histopathology
- Changes track with dietary concentration rather than systemic dose

**Indicators of primary (toxic) weight loss:**
- Body weight decreases without proportional food consumption changes
- FCE is impaired (animals consume normal amounts but gain less weight)
- Correlated organ weight changes, histopathological findings, or clinical pathology abnormalities
- Dose-response relationship with other toxic endpoints

No single universally codified threshold exists for food consumption decrease, but **several quantitative benchmarks are well-established in practice**. The FDA Redbook criterion of **≥10% body weight decrease** relative to controls defines the maximum tolerated dose for carcinogenicity study dose-setting. OECD guidance considers sustained food consumption decreases of **25–60%** acceptable for short-term studies, while decreases **≥60% persisting beyond 72 hours** require immediate action including potential euthanasia. In industry practice, food consumption decreases consistently **>10% relative to controls** are flagged as treatment-related and warrant further investigation.

The critical calculation for software implementation is **food efficiency ratio**: FER (%) = [body weight gain (g/day) / food intake (g/day)] × 100. When FER is unchanged despite decreased body weight, the tool should flag the pattern as "likely palatability-driven." When FER is decreased—animals eat normally but fail to gain weight—the tool should flag "metabolic/toxic impairment." Flamm et al. established an allometric relationship (ΔBWG = b × ΔFC^a, where a ≈ 0.74 for male and 0.68 for female Sprague-Dawley rats at 52 weeks) that can quantitatively predict expected body weight gain from observed food consumption, with deviations flagging direct toxicity.

### Body weight gains versus absolute body weights

Both body weight gains (BG domain) and absolute body weights (BW domain) should always be analyzed, but they serve different purposes. **Body weight gain is more sensitive** for detecting treatment effects in growing animals because it amplifies small differences that may not be apparent in absolute weights, normalizes for baseline weight differences between groups, and captures growth inhibition—the most common body weight effect in young rodents. Cumulative gains from Day 1 are most appropriate for NOAEL/LOAEL determination as they capture total impact, while interval gains between consecutive measurements are more sensitive for detecting onset, recovery, and transient effects.

The statistical approach matters for NOAEL determination. **ANCOVA with baseline body weight as covariate** provides more power than simple change-from-baseline analysis in randomized studies (van Breukelen, 2006), and is the only unbiased method when treatment assignment is stratified by baseline body weight—which is the standard randomization approach in toxicology studies per OECD guidelines. Williams' test is recommended for body weight analysis when monotone dose-response is assumed (more powerful than Dunnett's test in this scenario), with the "umbrella-protected Williams test" (Jaki & Hothorn, 2013) providing an optimal combined approach.

---

## 3. Clinical observations as early warning signals and terminal finding predictors

The CL domain captures the earliest detectable signals of toxicity and provides the critical temporal bridge between dosing and pathological outcomes. A software tool should classify clinical signs into three alert tiers and automatically map them to target organ systems.

**Tier 1 signals (immediate veterinary assessment required)** include convulsions of any type, moribundity indicators, severe dyspnea, and self-mutilation. **Tier 2 signals (review within 24 hours)** include tremors, ataxia/abnormal gait, combined hunched posture with emaciation, and marked chromodacryorrhea in multiple animals. **Tier 3 signals (track for dose-response patterns)** include piloerection, salivation, soft feces, decreased activity, and sporadic chromodacryorrhea.

Chromodacryorrhea—porphyrin-stained red tears and nasal discharge in rats—deserves special attention as a sentinel signal. It reflects **Harderian gland secretion mediated by muscarinic cholinergic mechanisms**, induced within 30–40 minutes by stress, pain, or cholinergic agonists and blocked by atropine. Dose-dependent increases in incidence or severity are treatment-related indicators of systemic stress, with strain differences (Wistar > Sprague-Dawley > Fischer 344) requiring strain-specific interpretation.

The most powerful analytical capability for clinical observations is **cross-domain correlation**. The following mapping table enables automated linking of in-life observations to expected terminal findings:

| Clinical Sign | Expected Clinical Pathology | Expected Organ Weights | Expected Histopathology |
|---|---|---|---|
| Tremors/convulsions | — | Brain weight changes | Neuronal necrosis, gliosis |
| Jaundice | ↑ALT, AST, ALP, bilirubin | ↑Liver weight | Hepatocellular necrosis, cholestasis |
| Polyuria/polydipsia | ↑BUN, creatinine | ↑Kidney weight | Tubular degeneration |
| Pallor | ↓RBC, hemoglobin, hematocrit | ↑Spleen weight | Bone marrow hypocellularity |
| Emaciation | ↓Protein, albumin, glucose | ↓Thymus weight | Thymic atrophy, fat depletion |
| Chromodacryorrhea | Non-specific | ↑Adrenal weight | Adrenal cortical hypertrophy |
| Piloerection | Non-specific stress | ↑Adrenal weight | Adrenal cortical hypertrophy |

Two standardized grading systems exist for clinical observation assessment. The **Functional Observational Battery (FOB)**, required by OECD TG 424 for neurotoxicity screening, evaluates 25–30 parameters across autonomic, neuromuscular, sensorimotor, activity, excitability, and behavioral domains using ordinal severity scales (0 = normal through 4 = severe) plus continuous measures (grip strength in grams, landing foot splay in centimeters). The **Modified Irwin Test**, evaluating 40+ parameters, is the alternative recommended by ICH S7A for CNS safety pharmacology. OECD TG 408 requires twice-daily cage-side observations plus weekly detailed clinical observations outside the home cage "using scoring systems explicitly defined by the testing laboratory."

Treatment-relatedness for clinical observations requires dose-dependent increase in incidence, dose-dependent increase in severity, earlier onset at higher doses, absence or much lower incidence in concurrent controls, and mechanistic plausibility. The Cochran-Armitage trend test for incidence and Jonckheere-Terpstra test for ordinal severity grades provide the appropriate statistical framework.

---

## 4. Baseline subject characteristics anchor the entire statistical framework

The SC (Subject Characteristics) domain provides pre-treatment values that serve two essential functions: **verifying randomization adequacy** and **enabling covariate adjustment** that increases statistical power for all downstream analyses.

OECD test guidelines (TG 407, 408, 452) require animals to be randomly assigned to groups with body weight variation not exceeding **±20% of the mean weight** for each sex at study commencement. The standard method is **stratified randomization by body weight**, where animals are sorted by weight, grouped into strata, and evenly distributed across treatment groups. Verification uses one-way ANOVA (or Kruskal-Wallis for non-normal data) on Day 1 body weights across all groups—though statisticians note this test is technically unnecessary in truly randomized studies since the null hypothesis of equal distributions holds by design. In practice, regulatory toxicology studies include baseline comparison as a quality control check.

The more impactful use of baseline data is **ANCOVA adjustment**. FDA guidance on adjusting for covariates in randomized clinical trials explicitly supports using ANCOVA to "adjust for differences between treatment groups in relevant baseline variables to improve the power of significance tests." The critical constraint is that covariates must not be affected by treatment—only **pre-treatment** baseline body weight should be used, never terminal body weight when it may be treatment-affected. For organ weight analysis specifically, Lazic et al. (2020, *Scientific Reports*) demonstrated that **ANCOVA with body weight as covariate is strongly preferred over organ-to-body-weight ratios**, which inadequately control for body weight dependence and can lead to incorrect conclusions.

---

## 5. Cardiovascular safety parameters require species-specific correction and tiered thresholds

The EG (ECG) and VS (Vital Signs) domains—redesigned in SEND 3.1 to separate cardiovascular parameters into a dedicated CV domain—carry some of the most consequential safety data in the entire submission package. ICH S7B requires both **in vitro hERG channel assay** and **in vivo QT assessment** in a non-rodent species prior to first-in-human dosing.

**The primary clinical threshold is ΔΔQTc (placebo-corrected, baseline-adjusted QTc change) with upper one-sided 95% confidence interval below 10 ms**, which defines a negative Thorough QT study under ICH E14. QTc outliers at **>480 ms absolute** or **>60 ms change from baseline** trigger intensive monitoring, while QTc values **>500 ms** represent a major concern threshold. Nonclinically, no fixed numerical thresholds exist in ICH S7B; instead, assessment relies on comparison to concurrent controls, exposure-response relationships, and safety margins relative to anticipated human Cmax.

**hERG channel safety margins** have evolved from the original **≥30-fold** heuristic (Webster, Leishman & Walker, 2002; Redfern et al., 2003) to more refined thresholds based on ROC analysis of large compound databases. Leishman's 2020 analysis of **367 compounds** found optimal thresholds of **37-fold** (separating known TdP risk from unlisted drugs) and **50-fold** (separating QTc-positive from QTc-negative outcomes). Average margins by risk category were: known TdP risk = **4.8×**, conditional risk = **28×**, possible risk = **71×**, and not listed = **339×**.

The **double-negative concept** from the 2022 ICH E14/S7B Q&As represents the most important recent development. A drug with both negative hERG assay (safety margin exceeding the threshold derived from reference compounds tested under identical conditions) and negative in vivo QTc (no prolongation at exposures exceeding clinical levels) qualifies as "low TdP risk." This double-negative status allows clinical development to proceed with concentration-QTc (C-QTc) modeling from Phase 1 data as a TQT study substitute, potentially eliminating the need for a dedicated thorough QT study entirely.

**QTc correction formula selection** is species-critical. For dogs, **Van de Water's formula** (QTcV = QT − 0.087 × [RR − 1000]) produces the flattest correction across heart rates of 60–160 bpm with only **2.1% variation**, making it the best fixed formula for smaller studies. Individual covariate adjustment (estimating β from pretest data via regression of log(QT) on log(HR)) is preferred for larger studies. Fridericia's correction is preferred for non-human primates and clinical data. **Bazett's formula should not be used for dogs**—it over-corrects at high heart rates and under-corrects at low rates. Adult rats and mice are **not appropriate** for QT assessment because their ventricular repolarization is governed by Ito rather than IKr/IKs channels.

Body temperature confounds QTc in conscious animal studies: QTc changes approximately **14 ms per degree Celsius** in dogs, meaning all safety pharmacology studies should measure core body temperature and apply temperature correction.

---

## 6. Pathology qualifiers determine the granularity of the safety narrative

The SUPPMA and SUPPMI supplemental qualifier domains carry the contextual modifiers that transform raw pathology findings into interpretable safety signals. Three qualifiers matter most for weight-of-evidence assessment.

**Severity grading** follows the STP-recommended scale (Schafer et al., 2018, *Toxicologic Pathology*): Grade 1 (minimal), Grade 2 (mild/slight), Grade 3 (moderate), Grade 4 (marked), and Grade 5 (severe). Both 4-point and 5-point scales are used across the industry. Grades are relative assessments based on the extent—amount and complexity—of morphologic change, with specific criteria varying by lesion type. For example, centrilobular hepatocellular necrosis: Grade 1 = <5% liver affected, Grade 2 = 5–20% affected, Grade 3 = 20–40% with bridging, Grade 4 = >50% with confluent necrosis. Critically, **severity grade interacts with lesion nature for adversity determination**: minimal neuronal necrosis (Grade 1) may be adverse due to the irreversible nature of neuronal loss, while moderate hepatocellular hypertrophy (Grade 3) may be adaptive and non-adverse.

**Distribution patterns** (focal, multifocal, diffuse, locally extensive) serve as both severity modifiers and treatment-relatedness indicators. Diffuse findings strongly suggest systemic treatment effect. Multifocal findings with dose-responsive incidence support treatment-relatedness. Focal findings, particularly in single animals, may suggest incidental or spontaneous origin. **Bilaterality** in paired organs strongly supports treatment-relatedness—a unilateral kidney finding may be spontaneous, while bilateral findings of the same type at the same severity are far more likely treatment-related.

The **INHAND (International Harmonization of Nomenclature and Diagnostic Criteria)** system, established in 2005 by STP, ESTP, BSTP, and JSTP, provides the standardized vocabulary underlying SEND microscopic findings controlled terminology. INHAND covers proliferative and nonproliferative lesions across 9+ organ systems for rodents, with non-rodent guidance published for dogs, minipigs, non-human primates, and rabbits. SEND controlled terminology was explicitly modeled on INHAND nomenclature (Keenan & Goodman, 2013), and the FDA's decision to make SEND mandatory drove INHAND expansion to additional species.

---

## 7. The ECETOC framework provides the algorithmic backbone for integration

The most implementable published framework for cross-domain weight-of-evidence integration is **ECETOC Technical Report 85 (2002)**, which structures the assessment into two sequential decision steps with explicit discriminating factors.

**Step 1—Is the difference treatment-related?** evaluates six A-factors: (A-1) dose-response relationship, (A-2) consistency across measurements and studies, (A-3) measurement precision, (A-4) comparison against historical control ranges, (A-5) biological plausibility, and (A-6) statistical significance. A software tool can automate A-1 through trend testing, A-4 through historical control database queries, and A-6 through standard statistical tests. Factors A-2, A-3, and A-5 require structured rules or expert input.

**Step 2—Is the treatment-related effect adverse?** evaluates nine B-factors: (B-1) general functional impairment, (B-2) adaptive response classification, (B-3) transient vs. persistent nature, (B-4) magnitude of effect, (B-5) association with effects in related endpoints, (B-6) whether the finding is a precursor to more significant effects, (B-7) secondary to other adverse effects, (B-8) specific vs. generalized toxicity, and (B-9) predictable consequence of the experimental model. Factor B-5—cross-endpoint correlation—is where SEND domain integration becomes most powerful: liver weight increase + hepatocellular hypertrophy + elevated ALT/AST constitutes stronger evidence than any finding alone.

The **Kerlin et al. (2016) STP best practices** complement ECETOC with ten major recommendations, most critically that **study NOAELs should be established at the level of the overall study report** by combining expertise of all contributing scientific disciplines, and that markers of toxicity that are not themselves adverse should be discussed alongside the causal toxicity rather than in isolation.

Additional frameworks include **Dorato & Engelhardt (2005)**, who defined adverse response as "impairment of functional capacity to maintain homeostasis, impairment of capacity to compensate for additional stress, or increase in susceptibility to other hazards," and **Palazzi et al. (2016, ESTP)**, whose consensus definition adds "likely results in impairment of functional capacity" to the morphological assessment.

ICH M3(R2) specifies the full set of integrated endpoints required for safety assessment: clinical signs/observations, body weight and food consumption, hematology and clinical chemistry, urinalysis, organ weights, macroscopic and microscopic pathology, and toxicokinetics. A software tool implementing cross-domain integration should follow the M3(R2) endpoint list as its data model.

---

## 8. An algorithmic integration architecture can operationalize these frameworks

A practical software implementation should follow a three-layer architecture: domain-level signal detection, cross-domain correlation, and weight-of-evidence scoring.

**Layer 1: Domain-level signal detection** applies domain-specific statistical tests and threshold checks. For each dose group versus control, calculate: mortality incidence (Fisher's exact), body weight change (Dunnett's or Williams' test with ANCOVA), food consumption change, food efficiency ratio, clinical observation incidence (Cochran-Armitage trend), clinical pathology parameters (Dunnett's), organ weight changes (ANCOVA with terminal body weight), and histopathology incidence and severity (Fisher's exact for incidence, Mann-Whitney for severity grades). Flag any parameter exceeding published thresholds: ≥10% body weight decrease, mortality above historical control rates, QTc prolongation beyond species-specific limits, hERG safety margin below 30-fold.

**Layer 2: Cross-domain correlation** maps findings across SEND domains for each animal (via USUBJID) and each dose group. The system should detect concordant patterns: liver weight increase + hepatocellular hypertrophy + elevated liver enzymes; kidney weight increase + tubular degeneration + elevated BUN/creatinine; clinical tremors + brain histopathology; decreased body weight + decreased food consumption + unchanged food efficiency (palatability pattern) versus decreased body weight + unchanged food consumption + decreased food efficiency (metabolic toxicity pattern).

**Layer 3: Weight-of-evidence scoring** implements ECETOC A-factors and B-factors algorithmically. A treatment-relatedness score combines dose-response strength (trend test p-value), historical control comparison, statistical significance, and cross-endpoint concordance. An adversity score combines severity grade, distribution pattern, reversibility (recovery group data), and whether the finding represents functional impairment versus adaptation. The product of these scores across all domains produces a dose-level risk profile that supports NOAEL determination.

The FDA's own **Janus Nonclinical System** and **KickStart Service** demonstrate that automated SEND analysis is feasible at regulatory scale, providing automated study summaries, body weight graphs, histopathology heat maps, and pharmacokinetic parameter tables. The PHUSE HistoGraphic initiative further demonstrates multi-study histopathology visualization with simultaneous biomarker display.

---

## Conclusion

The integration of SEND domains into automated safety assessment is not merely a data engineering challenge—it requires encoding decades of toxicological reasoning into structured decision logic. The **ECETOC two-step framework** provides the most directly implementable algorithmic structure, with Step 1 (treatment-relatedness) largely automatable through statistical testing and Step 2 (adversity) requiring structured rules informed by the STP severity grading system and INHAND nomenclature. Three quantitative anchors are well-established: **≥10% body weight decrease** as the MTD criterion, **≥30-fold hERG safety margin** (with 37–50-fold emerging as more discriminating), and **<10 ms ΔΔQTc** as the negative TQT threshold. The most underutilized analytical capability is cross-domain correlation—automatically linking clinical observations to expected pathology findings, body weight changes to food efficiency calculations, and cardiovascular signals to exposure-response models. Software that implements these patterns transforms SEND data from a regulatory compliance exercise into a genuine safety intelligence platform.