# Temporal pattern should merge into existing ECI dimensions, not stand alone

**Temporal pattern does not merit inclusion as a standalone sixth dimension in the Evidence Confidence Index.** While temporal information carries genuine analytical value — particularly for body weight and clinical observations — three converging lines of evidence argue against a dedicated dimension: data sparsity across the most critical SEND domains, absence of temporal pattern as a formal criterion in any existing regulatory or evidence framework, and the practical reality that the unique temporal signals can be captured more efficiently within the existing dose-response quality and reversibility dimensions. The recommended path is **(b) Merge into existing dimensions** with targeted enhancements.

## Half of SEND domains lack the temporal data to score

The single most decisive factor is data availability. A dimension that cannot be scored for the majority of toxicology finding types creates framework inconsistency and penalizes findings through missing data rather than through genuine evidence weakness.

**Temporal data richness by SEND domain in standard repeat-dose studies (28-day / 90-day):**

| Domain | Frequency | Timepoints per animal | Temporal richness |
|---|---|---|---|
| **BW** (body weight) | Weekly (mandated) | 5–14 | **Rich** |
| **CL** (clinical observations) | Daily cage-side, weekly detailed | 28–90+ | **Rich** |
| **FW** (food/water consumption) | Weekly (mandated) | 4–13 | Moderate |
| **LB** (clinical pathology) | Terminal only (mandated) | **1** | **Sparse** |
| **OM** (organ weights) | Terminal only | **1** | **Sparse** |
| **MI** (histopathology) | Terminal only (destructive) | **1** | **Sparse** |

The critical gap is **LB (clinical pathology)**. This domain contains the most quantitatively precise, continuous-variable data in toxicology — hepatic enzymes (ALT, AST, ALP), renal markers (BUN, creatinine), hematology parameters — yet **OECD TG 407 and TG 408 mandate only terminal collection**. No interim clinical pathology bleeds are required. In a standard 28-day study, there is exactly one LB measurement per animal. Temporal pattern analysis — onset timing, progression, on-dose adaptation — is simply impossible with one datapoint.

Only chronic studies (OECD TG 452) reach moderate resolution with **3–4 collection timepoints** at 3, 6, and 12 months. Even then, three points provide marginal statistical power for time-course modeling. Body weight and clinical observations are the only domains where temporal analysis is consistently feasible, and these represent a subset of the finding types the ECI must score.

## No existing framework treats temporal pattern as a standalone dimension

A systematic review of the relevant evidence and regulatory frameworks reveals **unanimous absence** of temporal pattern as a named, formal criterion:

**GRADE (clinical evidence)** defines eight domains — five for downgrading (risk of bias, inconsistency, indirectness, imprecision, publication bias) and three for upgrading (large effect, dose-response gradient, plausible confounding). None addresses time-course. GRADE Guidance 38 on dose-response gradient focuses exclusively on dose-amount relationships and does not mention temporal concordance.

**OHAT (NTP's adaptation of GRADE for animal toxicology)** added consistency as an explicit upgrading factor and reframed dose-response as "exposure-response," but **did not add a temporal dimension** despite being purpose-built for the exact evidence context where temporal concordance matters most. This omission — by the group most positioned to recognize the need — is significant.

**STP Best Practices on adversity determination** (Kerlin et al. 2016, co-authored by FDA's Sabine Francke) lists 10 formal recommendations. Temporal pattern is absent. The criteria focus on severity, dose-response, biological plausibility, and reversibility. The paper notes that "reversibility per se is insufficient to establish lack of adversity" — acknowledging temporal complexity but framing it within the reversibility paradigm.

**NTP Technical Reports** extensively collect and present temporal data (growth curves, survival curves, time-to-tumor analyses, interim sacrifice data) and name "latency in tumor induction" as a consideration for borderline evidence determinations. However, temporal pattern is **not a primary criterion** in NTP's formal evidence categories (clear evidence, some evidence, equivocal evidence, no evidence).

The one notable exception is the **Bradford Hill / Mode of Action framework** (Meek et al. 2014), which explicitly treats temporal concordance as a distinct dimension co-equal with dose-response concordance under "empirical support." This suggests the toxicology community recognizes temporal pattern's conceptual importance in causal reasoning — but has not translated this into evidence certainty scoring frameworks.

## FDA reviewers subordinate temporal information to other dimensions

Examination of FDA pharmacology/toxicology reviews (Revumenib NDA 218944, Tapentadol ER NDA 200533, Resmetirom NDA 217785, among others) reveals a consistent hierarchy of analytical dimensions. **Dose-response relationship** dominates, followed by magnitude/severity of change, exposure margins (animal vs. human), reversibility, histopathological correlations, and mechanism-based interpretation. Temporal pattern ranks last and appears primarily as a qualitative modifier ("transient elevation") rather than a quantitative analytical input.

FDA reviewers' primary temporal analysis is **binary reversibility** — comparing findings at end-of-dosing versus end-of-recovery. They do not typically write "the early onset at Week 2 suggests greater concern" or "the late appearance at Week 10 indicates a different mechanism." When temporal language appears, it is almost always either describing reversibility or noting that a finding was "transient" — a word used to imply lower concern without formal weighting.

The **OECD test guidelines themselves** require reporting of temporal characteristics — "time of onset, duration, and severity" per TG 407 paragraph 50 — but provide no quantitative criteria or formal framework for how temporal patterns should discriminate between adverse and non-adverse effects. Interpretation is left entirely to expert judgment.

## Where temporal pattern genuinely adds unique information

Despite the strong case against a standalone dimension, temporal pattern does carry **real discriminating value** in two specific scenarios that existing ECI dimensions do not fully capture:

**On-dose adaptation is distinct from recovery-period reversibility.** An ALT elevation that appears at Day 7 and normalizes by Day 28 *while the animal remains on dose* represents hepatic enzyme induction — a fundamentally different biological process from a finding that persists through end-of-dosing and resolves only after treatment stops. The current B-3 reversibility factor, defined around recovery-period assessment, does not capture adaptation during dosing. However, this scenario is largely theoretical in standard SEND datasets because **LB data in 28-day studies has only one timepoint** — the Day 28 terminal value. If ALT adapted, the terminal value would simply appear normal, and the transient elevation would never be observed. Only studies with interim bleeds (not mandated) could detect this pattern.

**Onset timing in body weight changes carries mechanistic information.** A body weight decrease starting at Day 1 likely reflects palatability issues or acute stress, while one emerging at Day 21 suggests cumulative toxicity — a distinction that affects adversity classification. This information is genuinely orthogonal to both dose-response quality (both patterns can show clean dose-response) and reversibility (both can be reversible or irreversible). Body weight's rich weekly temporal data makes this analysis consistently feasible.

## Recommended implementation: targeted enhancements to B-3 and dose-response

The practical path forward is to **enrich two existing ECI dimensions** rather than add a sixth:

**Expand B-3 (reversibility) to include on-dose adaptation.** Redefine the reversibility factor to encompass three temporal outcomes rather than a binary present/absent-after-recovery: (1) finding persists through recovery → no reversibility, (2) finding resolves during recovery → standard reversibility, (3) finding resolves during dosing → on-dose adaptation (highest confidence of non-adversity). This captures the most toxicologically meaningful temporal signal without requiring a new dimension. When interim clinical pathology data exists in the SEND dataset, it can inform this three-tier assessment; when it doesn't, the factor defaults to the current binary assessment.

**Add an onset-timing modifier within dose-response quality scoring.** For domains with rich temporal data (primarily BW and CL), incorporate onset timing as a sub-factor that contextualizes the dose-response pattern. Early onset (within first 10% of study duration) versus late onset (beyond 50% of study duration) can flag mechanistic differences — palatability versus cumulative toxicity, acute pharmacology versus progressive organ damage — that affect confidence in the finding's adversity classification. This is most naturally housed within dose-response quality because it refines the interpretation of the exposure-response relationship rather than standing as an independent evidence dimension.

**Do not score temporal pattern for domains with terminal-only data.** For LB, OM, and MI findings from standard 28-day and 90-day studies, temporal pattern should be marked as "not assessable" within these sub-factors. This avoids penalizing findings for missing data that study design does not provide.

## Conclusion

The case against a standalone temporal dimension rests on practical constraints, not conceptual dismissal. Temporal concordance is recognized as genuinely important in causal reasoning frameworks (Bradford Hill/MOA), and the fact that OHAT did not incorporate it when adapting GRADE for toxicology represents an acknowledged gap in the field — not validation that temporal information lacks value. The recommended merge strategy captures the **two specific temporal signals** that carry unique discriminating power (on-dose adaptation and onset timing) within existing dimensions, avoids creating a dimension that would be unscorable for half of SEND finding types, and aligns the ECI with actual FDA reviewer practice. If Datagrok's platform later encounters SEND datasets with richer interim clinical pathology data (e.g., from sponsors who exceed OECD minimum requirements), the enhanced B-3 and dose-response sub-factors are already positioned to leverage that data without requiring framework restructuring.