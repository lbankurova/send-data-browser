# Regulatory Standards for Automated Toxicological Finding Assessment

**No codified adversity algorithm exists in regulatory toxicology.** The entire framework for evaluating nonclinical repeat-dose toxicity findings rests on a weight-of-evidence approach requiring expert judgment, guided by overlapping position papers from the STP, ESTP, OECD, and ECETOC. This audit identifies the closest approximations to decision logic across six domains—adversity determination, biological plausibility, sex differences, NOAEL logic, confidence scoring, and organ weight interpretation—and maps where common automated engine assumptions systematically deviate from established practice. The most important finding for automated SEND assessment: **statistical significance is a flagging mechanism, not a classification mechanism**, and any engine that auto-classifies based on p-values alone will over-call adversity on isolated adaptive findings while under-calling biologically coherent toxic syndromes that lack pairwise statistical significance.

---

## 1. Adversity determination rests on a two-step framework, not statistical thresholds

### The ECETOC TR 085 framework is the operational backbone

The most structured and widely cited decision framework is the **ECETOC Technical Report 085 (2002)**, formalized by Lewis et al. (2002, *Toxicologic Pathology* 30:66–74). It proposes a two-step process that is the closest thing to a codifiable algorithm in regulatory toxicology:

**Step 1 — Is the difference treatment-related?** Five discriminating factors (A-1 through A-5) reduce the likelihood a finding is treatment-related: absence of dose-response, presence of outliers, imprecise measurement, values within historical control range, and lack of biological plausibility. **Step 2 — Is the treatment-related effect adverse?** Eight discriminating factors (B-1 through B-8) reduce the likelihood a finding is adverse: no functional alteration, adaptive response, transient nature, limited severity, isolated finding without cross-domain corroboration, not a precursor to established adverse progression, secondary to other effects, or an experimental model artifact.

This framework was reinforced by **Kerlin et al. (2016, *Toxicologic Pathology* 44:147–162)**, the STP Scientific and Regulatory Policy Committee's 10 best practice recommendations, and by **Palazzi et al. (2016, *Toxicologic Pathology* 44:810–824)**, the ESTP 4th International Expert Workshop. Palazzi et al. defined adversity as "a test item-related change that likely results in an impairment of functional capacity to maintain homeostasis and/or an impairment of the capacity to respond to an additional challenge."

### The taxonomy of finding classifications

Established practice recognizes five categories, not the binary adverse/non-adverse that many automated systems impose:

- **Not treatment-related** — chance deviation, within normal variation, no dose-response. No NOAEL impact.
- **Treatment-related, non-adverse** — related to treatment but adaptive, transient, minimal, or without functional significance. **Does not affect NOAEL.** This is the most critical category that automated systems commonly mishandle.
- **Treatment-related, adaptive** — a subset of non-adverse representing physiological compensation without functional impairment (e.g., hepatocellular hypertrophy from enzyme induction). Does not affect NOAEL.
- **Treatment-related, adverse** — causes harm to functional capacity or morphological integrity. **Defines the NOAEL.**
- **Equivocal/uncertain** — cannot be definitively classified; reported transparently but not used to set NOAEL without justification.

### Intrinsically adverse vs. context-dependent findings

Certain findings are **always adverse regardless of context**: necrosis, inflammation beyond minimal, fibrosis, neoplasia, functional organ failure indicators. Others are **context-dependent**: hypertrophy (adaptive vs. adverse per Hall et al. 2012), hyperplasia (depends on type and progression potential), vacuolation (per ESTP 5th workshop, Lenz et al. 2018), organ weight changes alone, and clinical pathology changes—which Ramaiah et al. (2017, *Toxicologic Pathology* 45:260–266) concluded are "rarely adverse by themselves."

### Statistical vs. biological significance

All authoritative sources are unequivocal: **biological significance takes absolute precedence over statistical significance**. Reviewers routinely dismiss statistically significant findings when there is no dose-response, when values fall within historical control range, when magnitude is trivial, or when the finding is isolated without cross-domain support. Conversely, they call findings adverse despite marginal statistics when biological plausibility is strong, when a monotonic dose-response trend exists, when cross-domain concordance supports the finding, or when low-incidence but severe pathology is observed. ECETOC TR 085 explicitly warns: "One must be cautious in relating a statistical finding to a true adverse biological effect."

### Where automated engine logic deviates

A statistical-first classification engine will **over-call adversity** for: statistically significant but biologically meaningless changes, isolated one-sex findings without dose-response, changes driven by aberrant concurrent controls, adaptive responses, and clinical pathology changes not adverse in isolation. It will **under-call adversity** for: low-incidence severe histopathology, findings showing biological dose-response trends without pairwise significance, and integrated cross-domain patterns where individual changes are marginal.

### Proposed revised decision framework for automation

An automated engine should implement the ECETOC two-step framework as a layered architecture: (1) **Detection layer** — statistical significance testing plus magnitude flagging; (2) **Treatment-relatedness layer** — algorithmic application of ECETOC Step 1 factors A-1 through A-5; (3) **Cross-domain integration layer** — concordance detection across histopathology, organ weights, clinical pathology, clinical signs; (4) **Intrinsic adversity layer** — dictionary-based classification of inherently adverse findings like necrosis and neoplasia; (5) **Contextual adversity layer** — ECETOC Step 2 factors B-1 through B-8 as scoring criteria; (6) **Expert review package** — structured output presenting all evidence with provisional classification. The system should **never auto-assign NOAEL**; this must remain a human expert decision per Kerlin et al. (2016) Recommendation #7.

---

## 2. Biological plausibility has no published scoring rubric

### The field explicitly rejects checklist approaches

There is no published scoring rubric for biological plausibility in toxicological assessment. The Epid-Tox Framework (Adami et al. 2011) explicitly states: "A checkbox approach to characterize the nature of the evidence that would lead an expert team to reach a weight of evidence decision is not practical." OECD Series No. 311 (2019) provides guiding principles for weight-of-evidence approaches but does not prescribe specific scoring. The weight-of-evidence approach is operationalized as **qualitative expert judgment**, not a semi-quantitative framework.

### Cross-domain corroboration follows an informal hierarchy

While no formal scoring system ranks corroboration types, a consistent hierarchy emerges from the literature:

**Strongest corroboration** involves histopathology plus concordant organ weight change plus concordant clinical pathology changes — the classic example being increased liver weight + hepatocellular hypertrophy + elevated ALT/AST establishing hepatotoxicity. **Strong corroboration** pairs clinical chemistry with histopathology (elevated ALT + hepatocellular necrosis) or hematology with bone marrow histopathology (cytopenias + marrow hypocellularity, per Reagan et al. 2011 STP bone marrow position paper). **Conditional corroboration** involves organ weight plus clinical chemistry without histopathology — acknowledged as potentially meaningful but weaker, since increased liver weight plus elevated enzymes but no microscopic changes may represent adaptive enzyme induction rather than toxicity. The ESTP 9th Workshop (Arndt et al. 2024, *Toxicologic Pathology* 52:319–332) made a critical point: "The lack of correlative microscopic findings does not preclude the importance of a clinical pathology finding."

### How marginal corroborating evidence is handled

When a corroborating finding is itself marginal, **dose-response relationship is prioritized over p-values**. A finding showing a dose-response trend, even if individual comparisons lack significance, is given more weight than an isolated significant finding without dose-response. Marginal corroboration still contributes to the weight of evidence but should neither be dismissed nor treated as definitive. The ESTP 9th Workshop explicitly concluded on "de-emphasis of reliance on statistics based on the understanding of the limitations of common statistical approaches."

### Pharmacological class is a critical plausibility factor

Every major framework recognizes pharmacological class as essential context. ECETOC TR 085 lists "lack of biological plausibility (i.e., inconsistent with class effects, mode of action)" as a key discriminating factor. The STP Organ Weight Position Paper (Sellers et al. 2007) states organ weight changes "must be evaluated within the context of the compound class, mechanism of action, and the entire data set." Known class effects — phospholipidosis with cationic amphiphilic drugs, hepatocyte hypertrophy with enzyme inducers, immunosuppression with immunomodulators — provide the biological plausibility framework that automated systems typically lack.

### Historical control data serves primarily as a false-positive filter

Historical control data (HCD) is used "routinely and exclusively to avoid potential false positive decisions regarding the treatment-relatedness of effects" (Kluxen et al. 2024 analysis of JMPR 2004–2021). The STP best practices (Keenan et al. 2009, *Toxicologic Pathology* 37:679–693) establish that **the concurrent control group is always the most relevant comparator**. HCD should be matched for strain, sex, age, laboratory, and recent time period (<5 years). ECETOC TR 085 warns: "Historical control data should not be seen only as a convenient device for discounting unwanted or 'difficult' findings."

### Where automated logic deviates: absence of evidence ≠ positive evidence

A critical deviation in common automated approaches is treating the **absence of corroborating evidence as disconfirmation** of a finding. Established practice holds the opposite: absence of histopathological correlate does not disprove a clinical pathology finding's importance. Automated systems that require cross-domain corroboration to "confirm" a finding will systematically under-call genuine toxicity detected by a single sensitive endpoint. Conversely, systems that treat mere co-occurrence of multiple marginal findings as strong corroboration without requiring mechanistic coherence will over-call incidental associations.

### Proposed plausibility assessment logic

For automation, plausibility should be assessed in four tiers: **Tier 1 (Strongest)** — histopathology + concordant organ weight + concordant clinical pathology + dose-response + consistency with pharmacological mechanism; **Tier 2 (Strong)** — any two concordant domains plus dose-response; **Tier 3 (Supportive)** — single domain finding with dose-response plus biological plausibility from class knowledge; **Tier 4 (Insufficient for standalone conclusion)** — single marginal finding in one domain only. The system must explicitly code the asymmetry: **absence of corroboration should not decrease confidence, but presence of corroboration should increase it**. Pharmacological class context should be a mandatory input, not an optional annotation.

---

## 3. Sex differences require independent per-sex adversity assessment

### Adversity is assessed independently per sex, then integrated

Established practice assesses adversity using a weight-of-evidence approach **across all endpoints within each sex**, considering constellations of findings. The same endpoint may be adverse in one sex (where it's part of a toxic syndrome) and non-adverse in the other (where it's isolated and mild). Kale et al. (2022, *International Journal of Toxicology* 41:143–162), incorporating FDA Pharm/Tox reviewer perspectives, provides a hypothetical case example directly addressing sex-specific NOAEL determination.

### Biological mechanisms drive sex-dimorphic responses

The primary mechanism is **CYP enzyme sexual dimorphism**, especially in rats. Waxman & Holloway (2009, *Molecular Pharmacology* 76:215–228) documented that sex differences in CYP expression are regulated by the temporal pattern of plasma growth hormone release — pulsatile in male rats driving male-specific CYPs (CYP2C11, CYP2C13) and continuous in females driving female-specific CYPs (CYP2C12). Over 1,000 sex-dependent genes have been identified in rat liver. Additional mechanisms include **alpha-2u globulin nephropathy** (male rat-specific, not human-relevant per EPA 1991), **adrenal cortical sexual dimorphism** driven by gonadal hormones, and **body composition differences** affecting toxicokinetics.

### Expected sex differences by organ

Sex differences are **expected and normal** for liver (CYP-driven, males often higher weights in rats), kidney (males larger, α2u effects), adrenal (females typically larger relative weights), thyroid (secondary effects from sex-dependent enzyme induction), and reproductive organs (inherently sex-specific). Sex differences would be **unusual** for heart, brain (weight is "highly conserved" per Sellers et al. 2007), and immune organs like spleen and thymus, where opposite-direction treatment effects warrant careful investigation.

### NOAEL determination when sexes differ

The combined NOAEL defaults to the **more conservative (lower) of the two per-sex NOAELs**, but this is not absolute. Kale et al. (2022) explicitly describes circumstances where the less conservative NOAEL may be appropriate: when the intended clinical population is sex-specific, when the lower NOAEL is driven by a species-specific finding not relevant to humans (α2u nephropathy), when the finding driving the lower NOAEL is classified as non-adverse or adaptive, or when toxicokinetic data shows dramatically different exposures between sexes. Critically, **the adversity classification of each sex's finding directly affects the combined NOAEL** — if a sex-specific finding is determined non-adverse, it does not drive the NOAEL for that sex and therefore does not affect the combined NOAEL.

### Where min(M,F) logic deviates from practice

An automated system that always takes min(M,F) for combined NOAEL is **overly conservative** in cases where one sex's lower NOAEL is driven by non-human-relevant mechanisms, is **inappropriate** when the drug targets a single sex, and is **unable to account for adversity classification nuances**. Furthermore, systems that apply per-endpoint rather than per-sex adversity assessment ignore sex-dependent baseline physiology, sex-specific mechanisms, and the fact that constellations of findings differ between sexes.

### Proposed revised logic for sex differences

The automated engine should: (1) perform all statistical analyses and threshold flagging **per sex independently**; (2) identify cross-domain constellations per sex separately; (3) flag opposite-direction effects as requiring mechanistic explanation rather than treating both directions identically; (4) apply the conservative min(M,F) NOAEL as default but flag cases where the driver of the lower NOAEL involves known sex-specific artifacts (α2u nephropathy, female reproductive cycling variability), adaptive classifications, or sex-specific intended populations; (5) always present both per-sex NOAELs alongside any combined NOAEL for human review.

---

## 4. NOAEL is a professional opinion, not a statistical determination

### The NOAEL has no consistent standard definition

Dorato & Engelhardt (2005, *Regulatory Toxicology and Pharmacology* 42:265–274) established definitively: "The NOAEL is **a professional opinion** based on the design of the study, indication of the drug, expected pharmacology, and spectrum of off-target effects. There is no consistent standard definition of NOAEL." This is not mere semantic flexibility — it reflects the fundamental reality that NOAEL determination requires integrating heterogeneous evidence types (continuous clinical chemistry data, ordinal histopathology grades, binary clinical observations) into a single dose-level determination.

### The hierarchy of evidence for NOAEL determination

**Histopathology sits at the apex.** Kale et al. (2022) states the study pathologist's assessment is "often most critical, as it enables the identification of target organs and helps characterize the nature of organ-specific effects as adverse or not." Below histopathology, the practical hierarchy is: **clinical signs** (severe/irreversible can independently drive NOAEL), then **clinical pathology** (hematology, clinical chemistry — supporting evidence that "rarely drives NOAEL alone" per Ramaiah et al. 2017), then **organ weights** (sensitive but non-specific, require histopathological correlation), then **body weight/food consumption** (non-specific, confounding).

A landmark principle emerges from actual FDA review practice: **organ weight changes without histopathological correlates generally do not lower the NOAEL**. The FDA's review of lumacaftor explicitly demonstrates this: "Liver weights were increased... however, there were no corresponding histopathological findings... The NOAEL was identified as the high dose of 500 mg/kg/day." The ESTP (Hall et al. 2012) further established that hepatomegaly from hepatocellular hypertrophy "without histologic or clinical pathology alterations indicative of liver toxicity was considered an adaptive and a non-adverse reaction."

### Treatment-related non-adverse findings do not affect NOAEL

This is perhaps the most critical distinction for automated systems. The EPA definition explicitly states: "Some effects may be produced at this level, but they are not considered as adverse, or as precursors to adverse effects." Classic examples include hepatocellular hypertrophy from enzyme induction without liver damage (Hall et al. 2012), expected pharmacological effects at low doses (for immunosuppressive drugs, immunosuppression is pharmacology, not toxicity — Dorato & Engelhardt 2005), and organ weight changes proportional to body weight changes (ECETOC Factor B-7).

### Body weight confounding requires sophisticated handling

When treatment decreases body weight, apparent organ weight changes may be artifactual. Sellers et al. (2007) recommends routine calculation of organ-to-body weight ratios, but Kluxen et al. (2020, *Scientific Reports* 10:6625) demonstrated that ratios "inadequately control for the dependence on body weight — a point made by statisticians for decades." **ANCOVA using body weight as a covariate is the statistically correct approach** but is rarely used in practice. The ECETOC framework classifies organ weight changes secondary to body weight changes as non-adverse (Factor B-7). OECD guidance establishes that body weight decreases **>10%** raise concern and **>20%** are considered adverse.

### The benchmark dose approach remains peripheral in pharma

Despite EPA's position that "the BMD approach is the USEPA's preferred approach for the derivation of points of departure" and EFSA's endorsement of BMD as "a scientifically more advanced method," pharmaceutical regulators (FDA, EMA, PMDA) under ICH still primarily use NOAEL for setting clinical starting doses. BMD is not standard practice in pharmaceutical toxicology because typical study designs have only 3–4 dose groups (insufficient for robust modeling), histopathological endpoints are ordinal and challenging for dose-response modeling, and no harmonized BMD standards exist across ICH regions.

### Proposed NOAEL determination logic for automation

The engine should implement a **three-step framework** adapted from Kale et al. (2022): **Step 1** — Is the finding treatment-related? (Apply ECETOC Step 1 factors algorithmically: dose-response, historical control context, plausibility.) **Step 2** — Is the treatment-related finding adverse? (Apply evidence hierarchy: intrinsically adverse findings auto-classify; context-dependent findings require cross-domain integration; treatment-related non-adverse findings explicitly excluded from NOAEL impact.) **Step 3** — NOAEL determination per sex, then integration. The system should **propose** a NOAEL with structured justification but flag it as requiring expert confirmation. It should never auto-assign a NOAEL based solely on the lowest dose with any statistically significant change.

---

## 5. No finding-level confidence scoring system exists — but one can be built

### The gap between study reliability and finding confidence

The Klimisch scoring system (1997) assesses **study-level reliability** (four categories from "reliable without restrictions" to "not assignable"), not individual finding confidence. A Klimisch 1 study can contain equivocal findings; a Klimisch 2 study may have highly reliable individual findings. The ToxRTool (ECVAM 2009) extended Klimisch with detailed scoring criteria but remains study-level. **No published system analogous to Klimisch exists for scoring confidence in individual toxicological findings** — this represents the exact gap an automated engine needs to fill.

### Existing quantitative weight-of-evidence frameworks

**Becker et al. (2017, *Regulatory Toxicology and Pharmacology* 86:205–220)** provides the most directly relevant quantitative framework. It extends the WHO/IPCS mode-of-action framework with numerical scoring of quality and relevance at each key event, producing a ratio of summary score to maximum achievable score as a "confidence indicator." **Dekant et al. (2017)** developed QWoE scoring sheets with 14 quality aspects and 0–4 relevance/effects scores, multiplying quality by relevance to produce numerical strength of evidence. However, both operate at the mode-of-action level, not individual finding level.

The **NTP evidence levels** for carcinogenicity (clear evidence, some evidence, equivocal evidence, no evidence, inadequate study) provide a useful verbal confidence spectrum but are specific to carcinogenicity and operate at the study-experiment level rather than per-finding.

### GRADE provides the best structural template

The **GRADE framework** (Grading of Recommendations Assessment, Development and Evaluation) classifies evidence certainty as High, Moderate, Low, or Very Low using explicit downgrading criteria (risk of bias, inconsistency, indirectness, imprecision, publication bias) and upgrading criteria (large magnitude, dose-response, residual confounding direction). The **NTP OHAT approach** explicitly adapts GRADE for environmental health toxicology. Hooijmans et al. (2018) demonstrated GRADE's applicability to preclinical animal studies, noting "the presented GRADE approach could possibly be applied to evidence from animal studies in toxicology, but further research is needed."

### How reviewers express uncertainty in practice

Regulatory toxicologists use specific language conventions to signal confidence levels: **"equivocal"** (NTP term for marginal evidence), **"possibly related"** or **"may have been related"** (boundary of evidence), **"of uncertain biological relevance"** (statistically significant but mechanistically unsupported), **"within historical control range"** (implicit low-confidence attribution), and **"inconsistent with dose-response"** (grounds for discounting). These linguistic conventions map loosely to a 4-level confidence spectrum that could be formalized.

### The EPA warns against pseudo-quantification

A critical caution from the USEPA WoE Framework (2016): "We do not recommend assigning numbers to qualities and combining them as if they were quantities with common units." An automated system must distinguish between **genuinely quantifiable dimensions** (statistical p-values, effect sizes, dose-response monotonicity, historical control position) and **qualitative dimensions** (biological plausibility for novel mechanisms, adversity of context-dependent findings) that should be presented as structured evidence rather than collapsed into a single number.

### Proposed confidence scoring architecture

A finding-level confidence system should assess six dimensions: (1) **Statistical robustness** — p-values, effect size, trend tests (fully automatable); (2) **Dose-response quality** — monotonicity score, number of dose levels affected (fully automatable); (3) **Biological plausibility/concordance** — number of concordant endpoints, known class effect (semi-automatable with pharmacological class lookup); (4) **Historical control context** — position relative to HCD (fully automatable with database access); (5) **Temporal pattern** — reversibility, progression (automatable from recovery data); (6) **Consistency** — cross-sex and cross-study concordance (automatable). Following GRADE, the system should assign initial confidence based on study quality, then explicitly downgrade for inconsistency, lack of dose-response, HCD overlap, isolated findings, or poor statistical strength, and upgrade for strong dose-response, large magnitude, multi-parameter concordance, or biological plausibility. Output should be a **4-level rating (High/Moderate/Low/Very Low)** with optional continuous 0–100 score.

---

## 6. Organ weight interpretation requires organ-specific normalization and integration with histopathology

### The normalization approach must be organ-specific

Bailey et al. (2004, *Toxicologic Pathology* 32:448–466) established the definitive guidance: **organ-to-body weight ratio** is appropriate for liver and thyroid (proportional relationship with body weight); **organ-to-brain weight ratio** is appropriate for adrenal glands and ovaries (brain weight is highly conserved); **absolute weight** is most appropriate for brain, heart, kidney, and testes (no proportional relationship with body weight, or significant non-zero intercept in regression). For pituitary, neither ratio is optimal — ANCOVA is recommended. Despite this, Nirogi et al. (2014) found organ-to-body weight ratio is "optimum for most organs" in routine screening, and the STP (Sellers et al. 2007) "advocates the routine calculation and evaluation of organ-to-body weight ratios."

**ANCOVA is the statistically correct approach** across all organs when body weight is affected by treatment, but Kluxen et al. (2020) documented it is "rarely used" in practice. Bayesian causal models were proposed as superior to both ratios and ANCOVA, formally decomposing direct treatment effects from indirect body-weight-mediated effects, but these remain experimental.

### Magnitude thresholds are best established for liver

The liver has the most thoroughly documented thresholds. **JMPR (2015)** established that relative liver weight increases **≤15%** without histopathological effects "should not be considered adverse as such degree of increase has been seen in controls in numerous studies and is considered part of normal biological variation." **EFSA** considers isolated liver weight increases up to **20%** without histopathological changes as non-adverse, but liver weight increases **>10%** accompanied by histopathological or clinical chemistry changes as adverse. The **EU Biocides Working Group** defaults to treating relative liver weight increases **>10%** as adverse absent further information, while permitting refinement to **≤15%** as non-adverse when accompanied by hepatocellular hypertrophy only, without histopathological damage or relevant clinical chemistry changes. Importantly, the EU guidance states this "15% level should not be interpreted as a rigid cut-off limit but more as a guidance value."

For other organs, thresholds are less formally defined. Heart has low inter-animal variability, so even **5–10%** changes merit attention. Adrenals show very high variability in mice (CV **20–51%** per Marxfeld et al. 2019) vs. rats (CV 5–17%), requiring higher thresholds (**15–20%**) before flagging. Brain is rarely affected by treatment, so any significant change is noteworthy. Testes changes **<10%** are generally within normal distribution per WHO (2015). Thyroid changes **>10%** are potentially significant when correlated with thyroid hormone changes.

### Organ weight without histopathological correlate: interpret with caution

Sellers et al. (2007) is unambiguous: "Organ weight changes without macroscopic or microscopic correlation should be interpreted with caution" and "detectable weight changes in and of themselves may not necessarily be treatment-related or adverse." Hall et al. (2012) established the paradigm: hepatomegaly from hypertrophy without histopathological evidence of liver toxicity is adaptive and non-adverse — but this conclusion "should normally be reached by an integrative weight of evidence approach" that includes a complete set of histopathological investigations and clinical chemistry parameters (ALT, AST, ALP, GGT, bile acids, cholesterol, bilirubin). Without this complete dataset, it is impossible to conclude the effect is non-adverse.

Organ weight changes alone **may** be considered adverse when magnitude is very large (>20–30%), when clear dose-response exists, when consistent with pharmacological mechanism, when correlated with clinical pathology changes, or when histopathology sampling limitations may have missed diffuse changes below detection threshold.

### Decision tree for organ weight increases

Based on Hall et al. (2012) and regulatory guidance integration: **(1)** Assess statistical significance and dose-response — if no dose-response and isolated to one dose, less likely treatment-related. **(2)** Evaluate magnitude — liver <10% generally within biological variation; 10–15% may be adaptive without histopath/clin path correlates; >15% potentially adverse requiring WoE assessment; ≥150% of control correlated with carcinogenic outcome in lifetime studies (Carmichael et al. 1997). **(3)** Check histopathological correlation — hypertrophy without necrosis/inflammation/fibrosis suggests adaptive; hypertrophy WITH these changes is adverse. **(4)** Check clinical pathology correlates — ALT/AST >2-fold suggests hepatocellular damage (adverse); small enzyme changes with hypertrophy only may be adaptive. **(5)** Assess mechanism — CAR/PXR/PPARα-mediated enzyme induction in rodents is often species-specific and adaptive. **(6)** Evaluate reversibility — persistent changes are more concerning.

### CDISC SEND considerations for organ weight data

Organ weights are stored in the **OM (Organ Measurements) domain** in SEND, a Findings-class domain. Key variables include OMTESTCD/OMTEST (test code/name), OMSTRESN (numeric standardized result), OMSTRESU (standardized units), and OMSPEC (specimen name using CDISC controlled terminology, e.g., "GLAND, ADRENAL" not "ADRENAL GLAND"). **Absolute weights are the primary stored values**; relative organ weights are derived by linking OM to the BW (Body Weights) domain via subject identifier and timing. Brain weight is another OM record, requiring joins for organ-to-brain ratios. Paired organs use OMLOC for laterality. FDA's Janus Nonclinical system automatically generates organ weight tables, percent-of-control calculations, and scatter plots from SEND datasets, making data quality in OM critical.

Common SEND data quality issues include inconsistent organ naming not using CDISC CT, missing timing variables preventing proper grouping, failure to include brain weights preventing ratio calculations, and SEND datasets not matching study report tables.

### Proposed tiered organ weight interpretation for automation

**Tier 1 (Automated screening)**: Calculate absolute weights, organ-to-body weight ratios, and organ-to-brain weight ratios per Bailey et al. organ-specific recommendations. Apply organ-specific statistical tests. Flag changes exceeding organ-specific thresholds (liver >10%, kidney >10%, heart >5%, adrenals >15%, thyroid >10%, spleen/thymus >15%, brain any significant change, testes >10%). Compare to historical control database. **Tier 2 (Semi-automated contextual integration)**: Cross-reference with MI domain (histopathology), LB domain (clinical pathology), and BW domain (body weight effects). Check dose-response consistency and mechanism-of-action context. **Tier 3 (Human expert review)**: Final classification as not treatment-related, treatment-related non-adverse/adaptive, or treatment-related adverse, applying the Hall et al. framework for liver specifically and the general ESTP/STP weight-of-evidence approach.

---

## 7. Where expert judgment is irreducible: a map for human review triggers

Across all six research areas, a clear boundary emerges between what can be codified and what must be flagged for human review.

### Fully automatable components

Statistical significance testing (Dunnett's, Williams', trend tests), dose-response monotonicity assessment, historical control range comparison, magnitude threshold flagging with organ-specific cutoffs, organ-to-body and organ-to-brain weight ratio calculations, cross-domain concordance detection using predefined endpoint linkage rules, intrinsically adverse finding identification (dictionary-based: necrosis, fibrosis, neoplasia), sex concordance assessment, reversibility comparison between main study and recovery groups, and body weight change threshold flagging (>10% concern, >20% adverse).

### Requiring irreducible expert judgment

**Weight-of-evidence integration** across all endpoints — the core of adversity determination requires holistic assessment that cannot be reduced to rules. **Adaptive vs. adverse classification for borderline cases** — the same finding (hepatocellular hypertrophy, hyperplasia, vacuolation) can be either depending on context. **Pharmacological mechanism relevance** — requires compound-specific knowledge about expected on-target vs. off-target effects. **Species relevance determination** — whether rodent-specific mechanisms (α2u nephropathy, CAR/PXR activation) apply to humans. **Histopathological severity grading** — inherently subjective (Schafer et al. 2018). **Non-monotonic dose-response interpretation** — requires mechanistic understanding of different MOAs at different dose levels. **Integration of equivocal findings** — when multiple borderline observations form a pattern that may or may not represent a coherent toxic syndrome. **NOAEL assignment** — Kale et al. (2022) describes this as "a collaborative effort among the key players, including the Study Director, Study Pathologist, senior management, consultants, and regulatory reviewers."

### The engine's role: structured decision support, not replacement

The literature is unambiguous that an automated SEND assessment engine should function as a **decision support system** that maximizes the efficiency of expert review, not as a replacement for it. The system should: flag all potentially treatment-related findings with supporting evidence, propose adversity classifications with explicit confidence ratings, present cross-domain concordance maps visually, identify where findings deviate from historical controls or expected pharmacological class effects, generate structured adversity assessment packages following the ECETOC two-step framework, propose per-sex and combined NOAELs with documented rationale, and clearly flag every determination that falls into an "irreducible judgment" category for mandatory human review. The six ESTP International Expert Workshops (liver hypertrophy, adversity framework, lysosomal accumulation, thyroid follicular cell changes, clinical pathology terminology) provide organ-specific and lesion-specific adversity criteria that should be encoded as lookup rules, creating an expanding knowledge base that makes the automated screening increasingly sophisticated while preserving the human expert's irreplaceable role in final interpretation.

---

## Conclusion: five principles for rebuilding the decision engine

This audit reveals five foundational principles that should govern the redesign of automated SEND toxicological assessment logic:

First, **statistical significance is a screening input, never a classification output**. Every authoritative source from ECETOC TR 085 through Kerlin et al. (2016) to Kale et al. (2022) insists that biological significance overrides statistical significance. The engine must separate flagging from classification.

Second, **the five-category taxonomy must replace the binary adverse/non-adverse classification**. The "treatment-related but not adverse" category is the single most important distinction for correct NOAEL determination, and its absence from automated systems produces the most consequential errors — systematically over-conservative NOAELs that constrain clinical development unnecessarily.

Third, **cross-domain integration is the gold standard, but absence of corroboration is not disconfirmation**. The engine must detect concordant patterns across OM, MI, LB, and clinical sign domains while respecting the ESTP's conclusion that lack of correlative microscopic findings does not preclude clinical pathology importance.

Fourth, **per-sex analysis with context-aware NOAEL integration replaces simple min(M,F)**. The engine should perform all analyses per sex independently, propose per-sex NOAELs with documented drivers, and apply min(M,F) as a default while flagging exceptions where species-specific, sex-specific, or adaptive findings drive the lower NOAEL.

Fifth, **confidence scoring fills a genuine gap in regulatory toxicology**. No existing system scores confidence at the individual finding level. A GRADE-adapted framework with explicit downgrade/upgrade criteria operating across six quantifiable dimensions (statistical robustness, dose-response quality, biological plausibility, historical control context, temporal pattern, consistency) would represent a genuine methodological advance — providing the structured transparency that EFSA, ECHA, and the EPA increasingly demand while preserving the mandatory human review checkpoint for all high-stakes determinations.