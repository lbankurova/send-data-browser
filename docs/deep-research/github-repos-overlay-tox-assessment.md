# Addendum: Open-Source GitHub Repository Landscape for Automated Toxicological Assessment

**Overlay to:** *Regulatory Standards for Automated Toxicological Finding Assessment*  
**Purpose:** Map existing open-source tools to each report section, identifying what's already solved, what's partially addressed, and where Datagrok's engine needs to build from scratch.

---

## Executive Summary

The open-source landscape for SEND-based toxicological assessment is **fragmented by design layer**. Strong tooling exists for data ingestion, historical control analysis, and dose-response modeling. There is essentially **nothing open-source for adversity classification, biological plausibility scoring, or automated NOAEL determination** — the exact logic layers where your engine diverges from regulatory practice. This gap is consistent with the report's finding that these are expert-judgment domains that the field has intentionally not algorithmicized.

---

## 1. Adversity Determination → No open-source implementation exists

**Gap status: Complete gap — no open-source adversity classification engine**

No public repository implements the ECETOC TR 085 two-step framework, the Palazzi et al. (2016) adversity criteria, or any structured adversity decision tree. This is the highest-value proprietary opportunity for Datagrok.

**Closest adjacent tools:**

- **NIEHS/ToxicR** ([github.com/NIEHS/ToxicR](https://github.com/NIEHS/ToxicR)) — R package from NIEHS/NTP/EPA. Implements dose-response modeling (Bayesian, MLE, model averaging) using the same codebase as EPA BMDS. Provides Jonckheere trend tests and poly-K tests. **Relevance:** ToxicR handles the *statistical screening* layer of adversity (Step 0 in the proposed framework — is there a dose-response signal?) but has zero adversity classification logic. It could feed your detection layer but cannot replace Steps 1–2.

- **USEPA/BMDS** ([github.com/USEPA/BMDS](https://github.com/USEPA/BMDS)) — EPA's Benchmark Dose Modeling Software. C++ core (`bmdscore`) with Python wrapper (`pybmds`). Fits dose-response curves for continuous and dichotomous data. **Relevance:** Directly relevant to the report's discussion of BMD as an alternative to NOAEL. While BMD isn't standard in pharma tox, having pybmds available means your engine could optionally compute BMD alongside NOAEL without building the math from scratch.

- **USEPA/BMDS-UI** ([github.com/USEPA/BMDS-UI](https://github.com/USEPA/BMDS-UI)) — Web UI for BMDS. Django/React application. **Relevance:** UX reference for how regulatory scientists interact with dose-response analysis tools.

**Implication for Datagrok:** The five-category taxonomy (not treatment-related / treatment-related non-adverse / treatment-related adaptive / treatment-related adverse / equivocal), the ECETOC Step 1 and Step 2 discriminating factors, and the intrinsically-adverse finding dictionary all need to be built as proprietary logic. There is no open-source starting point.

---

## 2. Biological Plausibility Assessment → Partial tooling for cross-domain concordance

**Gap status: Severe gap — no plausibility scoring exists, but cross-domain data integration tools exist**

**Directly relevant tools:**

- **phuse-org/sendigR** ([github.com/phuse-org/sendigR](https://github.com/phuse-org/sendigR)) — The most important open-source tool in this space. R package developed via FDA/CDER + BioCelerate + PHUSE partnership. Constructs SQLite/Oracle databases from SEND XPT files and enables cross-study queries. Includes `xptcleaner` Python module for CDISC controlled terminology harmonization. **Critical capability:** Calculates background incidence rates of findings in matched control populations (same species/strain, age, sex, route). This directly addresses the report's Section 2 on historical control databases as false-positive filters. The sendigR Shiny app lets toxicologists query HCD without coding.

- **phuse-org/BioCelerate** ([github.com/phuse-org/BioCelerate](https://github.com/phuse-org/BioCelerate)) — Search scripts for querying SEND datasets. Predecessor to sendigR. Contains R scripts for cross-study analysis including microscopic findings incidence in controls (Carfagna et al. 2021).

**Adjacent tools:**

- **phuse-org/send-summarizer** ([github.com/phuse-org/send-summarizer](https://github.com/phuse-org/send-summarizer)) — R package that calculates "toxicity scores" for repeat-dose studies. Normalizes, aggregates, and visualizes treatment effects across target organ systems. **Relevance:** The concept of scoring treatment effects across organ systems is adjacent to cross-domain concordance detection. However, the scoring is statistical (not plausibility-based) and doesn't implement the tiered corroboration hierarchy described in the report.

**What's missing:** No open-source tool implements the four-tier plausibility framework proposed in the report (histopath + organ weight + clinical path > any two domains + dose-response > single domain + class knowledge > isolated finding). No tool encodes pharmacological class as a plausibility input. The asymmetric rule (absence of corroboration ≠ disconfirmation) is not implemented anywhere.

**Implication for Datagrok:** Use sendigR's HCD infrastructure for the historical control comparison component. Build the plausibility scoring, cross-domain concordance hierarchy, and pharmacological class context engine from scratch.

---

## 3. Sex Differences → No sex-specific assessment logic exists

**Gap status: Complete gap**

No open-source repository implements sex-specific adversity assessment, opposite-direction effect detection, or context-aware NOAEL integration across sexes. All statistical tools (ToxicR, BMDS, sendigR) can filter by sex for their analyses, but none implement the logic described in the report: independent constellation assessment per sex, flagging of sex-dimorphic mechanisms (CYP differences, α2u nephropathy), or exceptions to min(M,F) NOAEL.

**Implication for Datagrok:** Entirely proprietary logic layer. The organ-specific sex-dimorphism expectations table (liver expected, heart unusual) and the mechanism-aware NOAEL integration rules must be built from the literature.

---

## 4. NOAEL Determination → Dose-response tools exist, but NOAEL decision logic doesn't

**Gap status: Dose-response math is solved; NOAEL judgment logic is a complete gap**

**Relevant tools for the statistical substrate:**

- **NIEHS/ToxicR** — Implements Williams' and Dunnett's tests, Jonckheere trend test, and full BMD suite. The Jonckheere test is particularly relevant — it's the standard trend test for NOAEL support (is there a monotonic dose-response?). ToxicR also implements Bayesian model averaging, which the report notes is preferred by WHO/EFSA.

- **USEPA/BMDS + pybmds** — Full BMD computation. While the report notes BMD isn't standard in pharma tox, having `pybmds` available means Datagrok could offer optional BMD analysis for clients moving toward EFSA compliance.

- **auerbachs/BMDExpress-3** ([github.com/auerbachs/BMDExpress-3](https://github.com/auerbachs/BMDExpress-3)) — NTP/NIEHS software for analyzing high-dimensional dose-response data (toxicogenomics). Uses ToxicR's underlying engine with added Bayesian model averaging and forward toxicokinetic modeling. **Relevance:** Forward tox for your engine if you ever handle -omics data; otherwise a reference for how NTP structures BMD analyses.

- **PNNL-CompBio/bmdrc** ([github.com/PNNL-CompBio/bmdrc](https://github.com/PNNL-CompBio/bmdrc)) — Python library for benchmark dose response curves, following EPA guidelines with filters, model fitting, and visualization. **Relevance:** Python-native BMD if your stack is Python-first rather than R.

**What's completely missing:** The three-step NOAEL determination framework from the report (treatment-relatedness → adversity classification → per-sex integration) has no open-source implementation. The hierarchy of evidence (histopath > clinical signs > clinical path > organ weights > body weight) is not codified in any tool. The treatment-related-non-adverse exclusion from NOAEL, which the report identifies as the single most consequential engine error, is not implemented anywhere.

**Implication for Datagrok:** Leverage ToxicR or pybmds for the statistical layer (trend tests, pairwise comparisons, optional BMD). Build the NOAEL determination logic — the integration of heterogeneous evidence types into a dose-level determination — as proprietary.

---

## 5. Confidence Scoring → No finding-level confidence framework exists anywhere

**Gap status: Complete gap — this is a genuine methodological innovation opportunity**

The report establishes that no published system scores confidence at the individual finding level (Klimisch is study-level; GRADE hasn't been adapted for individual tox findings). No open-source repository attempts this.

**Adjacent frameworks:**

- The NTP evidence levels for carcinogenicity (clear / some / equivocal / no evidence) are used in NTP reports but aren't coded in any open-source tool as a reusable scoring engine.

- The Klimisch score (1–4 reliability) is sometimes referenced in chemical assessment databases but has no structured open-source implementation for automated scoring.

**Implication for Datagrok:** The GRADE-adapted six-dimension confidence scoring architecture proposed in the report (statistical robustness, dose-response quality, biological plausibility, HCD context, temporal pattern, consistency) would be a genuine first in open or proprietary software. This is potentially publishable and differentiating. The fully-automatable dimensions (statistical robustness, dose-response monotonicity, HCD position) can draw on ToxicR/sendigR outputs. The semi-automatable dimensions (plausibility, consistency) require the cross-domain integration engine from Section 2.

---

## 6. Organ Weight Interpretation → Statistical normalization exists, interpretation logic doesn't

**Gap status: Normalization math is available; organ-specific interpretation is a gap**

**Relevant tools:**

- **Kluxen et al. (2020) Bayesian causal models** — Published in *Scientific Reports* with methodology for decomposing direct treatment effects from body-weight-mediated effects on organ weights. No public repository, but the Bayesian methodology is described in sufficient detail for implementation. This directly addresses the report's finding that ANCOVA is rarely used despite being statistically correct, and that organ-to-body weight ratios are inadequate.

- **sendigR** — The OM (Organ Measurements) and BW (Body Weights) domains are both queryable, enabling the organ-to-body and organ-to-brain weight ratio calculations the STP recommends. The xptcleaner module handles CDISC CT harmonization for organ naming (addressing the OMSPEC consistency issue flagged in the report).

- **phuse-org SEND clinical pathology visualization app** ([github.com/phuse-org/phuse-scripts/.../LBapp](https://github.com/phuse-org/phuse-scripts/tree/master/contributed/Nonclinical/R/LBapp/)) — R Shiny app for visualizing LB (clinical pathology) domain data from SEND datasets. Includes individual animal plots, group summaries, distribution comparisons. **Relevance:** The clinical pathology visualization patterns here are relevant to the cross-domain concordance your engine needs (organ weight + LB findings like ALT/AST).

**What's missing:** No open-source tool implements the organ-specific normalization recommendations from Bailey et al. 2004 (liver → body weight ratio; adrenals → brain weight ratio; heart → absolute weight). No tool implements the organ-specific magnitude thresholds from the report (liver <10% likely biological variation, 10–15% potentially adaptive, >15% potentially adverse). The Hall et al. (2012) liver hypertrophy decision tree (hypertrophy + no necrosis/inflammation → adaptive; hypertrophy + necrosis → adverse) is not codified anywhere.

**Implication for Datagrok:** The organ-specific normalization lookup table, magnitude threshold library, and hypertrophy-vs-toxicity decision tree from the report all need proprietary implementation. sendigR provides the data access layer; the interpretation layer is yours to build.

---

## 7. Cross-Study & Visualization Infrastructure → Well-served by PHUSE ecosystem

**Solved problems you should not rebuild:**

- **phuse-org/toxSummary** ([github.com/phuse-org/toxSummary](https://github.com/phuse-org/toxSummary)) — R Shiny app for visualizing safety margins and severity of toxicities across studies in a drug development program. Developed with FDA toxicologist consultation. Generates plots of NOAEL-based safety margins across species, routes, and durations. Exportable to CSV/Excel/Word. **Relevance:** This is the study-level summary view your customers expect. Consider whether Datagrok's output should feed into or replicate this presentation format.

- **sendigR Shiny app** — Historical control exploration without coding. Live demo at phuse-org.shinyapps.io/sendigR/. **Relevance:** Your customers' toxicologists may already be familiar with this interface for HCD queries.

- **Carfagna et al. (2024) toxicity profile classification** — Cross-study SEND analyses published in *Toxicological Sciences*. Methodology for classifying toxicity profiles across studies using sendigR infrastructure. **Relevance:** Represents the state of the art in what the PHUSE/BioCelerate/FDA ecosystem is doing with SEND data — primarily cross-study HCD analysis, not single-study adversity assessment. Datagrok's engine occupies a different (and more ambitious) niche.

---

## 8. CDISC SEND Data Pipeline → Mostly solved

**Available infrastructure:**

- **sendigR + xptcleaner** — XPT file ingestion, CDISC CT harmonization, SQLite/Oracle database construction. MIT license.
- **SEND 4.0** (publication expected Q4 2025/Q1 2026) adds 8 new domains including cell phenotyping, immunogenicity, ophthalmology. Plan for MI domain updates including targeted staining and reproductive cycle results.
- **SENDIG-DART v1.2** — Standard for developmental/reproductive toxicity data (if Datagrok expands scope beyond repeat-dose).

**Implication:** The SEND data ingestion problem is well-addressed by the PHUSE ecosystem. Datagrok's value is entirely in what happens *after* ingestion — the assessment logic that sits on top of structured SEND data.

---

## Summary: Build vs. Leverage Matrix

| Report Section | Open-Source Status | Recommendation |
|---|---|---|
| SEND data ingestion & HCD | **Solved** (sendigR, xptcleaner) | Leverage or integrate |
| Statistical screening (trend tests, pairwise) | **Solved** (ToxicR, BMDS) | Leverage |
| Dose-response modeling / BMD | **Solved** (pybmds, ToxicR) | Leverage for optional BMD |
| Clinical path visualization | **Partial** (PHUSE LBapp) | Reference for UI patterns |
| Cross-study safety summaries | **Solved** (toxSummary) | Leverage for output format |
| CDISC terminology harmonization | **Solved** (xptcleaner) | Leverage |
| Adversity classification (ECETOC framework) | **Complete gap** | Build from scratch — highest value |
| Biological plausibility scoring | **Complete gap** | Build from scratch |
| Cross-domain concordance engine | **Complete gap** | Build from scratch |
| Sex-specific assessment logic | **Complete gap** | Build from scratch |
| NOAEL determination logic | **Complete gap** | Build from scratch |
| Finding-level confidence scoring | **Complete gap** | Build from scratch — publishable innovation |
| Organ weight interpretation rules | **Complete gap** | Build from scratch |
| Pharmacological class context | **Complete gap** | Build from scratch |

The pattern is clear: the statistical and data management layers are open-source commodities. **Every layer that requires biological/regulatory judgment is a complete gap.** This is both the challenge and the competitive moat.

---

## Key Repositories Reference

| Repository | Owner | Language | License | Primary Capability |
|---|---|---|---|---|
| [sendigR](https://github.com/phuse-org/sendigR) | PHUSE/BioCelerate | R + Python | MIT | SEND cross-study HCD analysis |
| [toxSummary](https://github.com/phuse-org/toxSummary) | PHUSE | R Shiny | — | Repeat-dose tox study visualization |
| [send-summarizer](https://github.com/phuse-org/send-summarizer) | PHUSE | R | — | Toxicity scoring across organ systems |
| [BioCelerate](https://github.com/phuse-org/BioCelerate) | PHUSE | R | MIT | SEND cross-study query scripts |
| [ToxicR](https://github.com/NIEHS/ToxicR) | NIEHS/NTP | R + C++ | — | Dose-response modeling (Bayesian/MLE/MA) |
| [BMDS](https://github.com/USEPA/BMDS) | US EPA | C++ + Python | — | Benchmark dose modeling engine |
| [BMDS-UI](https://github.com/USEPA/BMDS-UI) | US EPA | Python/Django | — | BMD web interface |
| [BMDExpress-3](https://github.com/auerbachs/BMDExpress-3) | NIEHS/Sciome | Java | — | Toxicogenomics dose-response analysis |
| [bmdrc](https://github.com/PNNL-CompBio/bmdrc) | PNNL | Python | — | BMD for proportional data (EPA guidelines) |
