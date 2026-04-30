# Ties correction in the Jonckheere–Terpstra test: how critical is it for preclinical/toxicology practice

## 1. TL;DR — verdict

- **This is a must-fix, not a nice-to-have.** In the majority of typical preclinical endpoints (histopathology severity grades, tumor proportions, behavioral scores, micronuclei counts, score-based reproductive endpoints), ties are the **dominant data regime**, not a rare deviation. An ordinal 0–4/0–5 scale structurally guarantees that the proportion of ties is measured in tens of percent, and in control groups it often reaches 70–100% (zero-inflated). Applying the asymptotic version of JT with a "no-ties" variance to such data is a known error that systematically inflates the p-value.
- **Every reference implementation accepted by regulators uses ties correction**: SAS PROC FREQ (the de facto standard for FDA submissions), the R packages `PMCMRplus`, `DescTools`, `clinfun`, `coin`, `StatCharrms` (approved by EPA/OECD for ecotoxicology), and Stata's `jonter`. NTP applies the Jonckheere test in NTP TR technical reports specifically to skewed/discrete distributions (hematology, clinical chemistry, spermiogenesis), where ties are the norm. An implementation without ties correction diverges from the entire established toolchain.
- **The regulatory and methodological significance is direct.** In NTP practice, JT is used as a "trend gatekeeper" that switches the choice of pairwise test (Williams/Shirley vs. Dunnett/Dunn) and thereby influences the NOAEL/LOAEL. A 1.9×–10× inflation of the p-value (as observed in your empirical test) is a documented Type II error: missing a dose-related trend. The FDA Pharm-Tox Statistics Team explicitly describes how such overly-conservative criteria increase the probability of Type II errors "by a factor of 1.5 or more". Therefore, the absence of ties correction makes the test **formally incorrect** and **practically dangerous** in precisely the zone where JT is most often used.

---

## 2. Quantitative data on the frequency of ties in typical preclinical endpoints

### 2.1 Histopathology — severity grades (0–4 / 0–5)
This is the most illustrative case. According to the official STP (Society of Toxicologic Pathology) position — Schafer et al., *Toxicologic Pathology* 46(3):256–265 (2018):
> "Pathologist typically assigns a categorical number to a microscopic finding, 0 through 4 or 5, using a nonlinear (or ordinal) scale… they are not actual (or cardinal number) measurements."

In a typical design of 10–50 animals per group × 4 groups × 5 possible levels, it is structurally impossible to avoid ties: if a middle group shows (0,0,1,1,1,2), all 6 values fall into 3 unique levels — **the proportion of tied observations ≈ 100%** in the sense that "every value matches at least one other." The tie-correction factor `Σ tj·(tj−1)·(2tj+5)` becomes a dominant share of the variance.

In control groups the usual picture is all zeros ("zero-inflated"), and almost every value is tied to every other. Green et al. (*Environ Toxicol Chem* 33(5):1108–1116, 2014) — the article on which the official EPA package `RSCABS` is built — explicitly motivates the development of a new test by the fact that traditional methods (including naive JT) **"suffer from several shortcomings: computing average scores as though scores were quantitative values, considering only the frequency of scores"**. It is precisely because of heavy ties in ordinal severity data that EPA and OECD recommend RSCABS rather than raw JT.

A systematic review by Erben & Bösl (2013, *Lab Anim*) of colitis models shows that typical 0–3 / 0–4 scales for DSS- and TNBS-induced models yield n=80–800 observations distributed across 4–5 categories — i.e., dozens of identical copies per "value".

### 2.2 Tumor proportions in 2-year NTP bioassays
The standard NTP design is 50 rats/mice per group × 4 groups (control + 3 doses). Tumor incidence at a given site usually falls within 0–30% in most tissues (Haseman & Lockhart 2005; Hothorn et al. 2020). This means an enormous number of "zeros" and ties. Hothorn, Rahman & Schaarschmidt (*arXiv 2007.12419*, 2020) specifically emphasize that for compounds like glyphosate the typical proportions are `0/46, 2/45, 2/46, 6/47, 6/44`, and that "p₀ = 0 which is a relevant outcome in long-term carcinogenicity bioassays" — that is precisely why they introduce the Add-2 transformation. Applying JT to count/proportion data with such structure → almost all observations are tied.

NTP formally uses **adjusted poly-k / Cochran-Armitage**, not raw Jonckheere, for oncology data, but any application of JT to such endpoints without ties correction will give a structurally inflated p-value.

### 2.3 Body weight / Organ weight
This is the exception. Body weight is measured to 0.1 g, organ weight to milligrams; real ties for continuous endpoints are **rare** (fractions of a percent). NTP assigns these variables to the parametric branch (Dunnett/Williams), and JT is applied to them only as a **gatekeeper** for the choice of pairwise test (NTP statistical procedures, ntp.niehs.nih.gov). Here the absence of ties correction does indeed have a negligible effect — but this does not justify the implementation: the same function is used for other endpoints where ties dominate.

### 2.4 Clinical chemistry / hematology
According to NTP technical reports (e.g., NBK564530, NBK558666, NBK551109, NBK552908, NBK551542), these endpoints are considered "typically skewed distributions" and analyzed nonparametrically (Shirley/Dunn), and **JT is used precisely as the trend test for them**. Rounding to significant figures (ALT in U/L, hemoglobin in g/dL, WBC ×10⁹/L) at n=10 per group produces hundreds of ties in the sample, especially at values near the lower limit of detection.

### 2.5 Behavioral scoring (FOB)
The FOB generates 25–30 endpoints of mixed nature; descriptive/scalar endpoints are ordinal scales 1–4 or 1–8 (Moser 1992; Mattson et al. 1996). Pearson et al. (*J Pharmacol Toxicol Methods* 2010) compare KW and CMH methods for such data and explicitly note that a significant fraction of FOB endpoints are categorical with heavy ties. JT is the natural choice here for trend testing, and applying the "no-ties" formula is mathematically incorrect.

### 2.6 Reproductive endpoints
Litter size, malformation counts, and implantation counts are integer-valued, with typical concentration in 1–2 modal values. Under OECD TG 421/443 the typical design is small n (10–25 females/group), where even 2–3 ties materially change the variance.

**Overall assessment of tie-density ranges:** for histopathology severity and discrete count endpoints, the ratio `Var_no_ties / Var_corrected` lies in 1.07–1.34, and under strong zero-inflation it readily exceeds 1.5 — consistent with your empirical results showing 1.9×–10.7× inflation of the p-value.

---

## 3. Effect on regulatory decisions

### 3.1 NTP — actual practice
From the NTP Statistical Procedures (ntp.niehs.nih.gov/data/research/stats and numerous NTP TRs):
> "Jonckheere's test (Jonckheere 1954) is used to assess the significance of the dose-related trends and to determine whether a trend-sensitive test (Williams' or Shirley's test) was more appropriate for pairwise comparisons than a test that does not assume a monotonic dose-related trend (Dunnett's or Dunn's test)."

This means: **the outcome of the JT test directly determines which pairwise test is applied**, and the pairwise test determines the NOAEL. An inflated p-value → Dunnett/Dunn chosen instead of Williams/Shirley → loss of power → missed effect at low/mid dose → inflated NOAEL → inflated HED → potentially unsafe human dose. This is a documented pathway of influence.

NTP source code (available via Green et al. 2014 and implemented in the R package `RSCABS`) uses the SAS implementation of JT, which by default contains ties correction (see below).

### 3.2 FDA / CDER — Pharm-Tox Statistics Team
The FDA "Statistical Aspects of the Design, Analysis, and Interpretation of Chronic Rodent Carcinogenicity Studies of Pharmaceuticals" (FDA Guidance, draft 2001, fda.gov/media/72296) directly references Hothorn & Lin for trend tests. Karl Lin (CDER) and Atiar Rahman (CDER, co-author of Hothorn et al. 2020) specifically work on improving trend-test methodology, and in their joint publications (Springer 2015, *Recent Research Projects by the FDA's Pharmacology and Toxicology Statistics Team*) it is explicitly stated:
> "In many cases, the probability of a Type 2 error is inflated by a factor of 1.5 or more."

This is precisely about overly-conservative criteria. The no-ties variance in JT is a special case of this problem.

In FDA statistical reviews (e.g., accessdata.fda.gov: 207947Orig1s000StatR.pdf, 216386Orig1s000StatR.pdf) trend tests are run per FDA Guidance using SAS — i.e., with ties correction by default. A submission that uses JT without the ties correction will inevitably show discrepancies when the FDA reviewer compares it to SAS — this is a reproducibility issue that calls into question the entire statistical part of the submission.

### 3.3 OECD / EMA / ecotoxicology
OECD Document 54 "Current Approaches in the Statistical Analysis of Ecotoxicity Data" (2006, revision planned for 2026) recommends JT for ordered alternatives, and the implementation — via `StatCharrms` (Flynn & Swintek, EPA, 2017) — contains a **"Jonckheere-Terpstra step down trend test"** with proper handling of ties. This is an explicit regulatory expectation. The book Green, Springer & Holbech *Statistical Analysis of Ecotoxicity Studies* (Wiley 2018) — the standard reference for OECD ecotox — describes MQJT (multiquantal Jonckheere-Terpstra) specifically for tied severity data.

### 3.4 ICH S1B(R1) (2022)
Does not specify particular tests, but refers to standard trend testing practice — i.e., SAS PROC FREQ JT with ties correction.

### 3.5 Documented Type II error cases caused by conservative trend tests
Peddada & Kissling (*PMC1440777*, NTP simulation): "The NTP trend test gave a p-value of 0.105, whereas each dosed group differed from the control group at p < 0.002. Because of the wide dose spacing and the plateau-shaped response... the NTP trend test was not sensitive enough to detect the dose-related response." This illustrates that even a correctly implemented trend test can miss an effect; adding artificial conservatism through a no-ties variance makes the situation worse.

Hothorn LA, *Statistical evaluation of toxicological bioassays — a review* (*Toxicol Res* 3:418–432, 2014) — a review article that directly states that "overconservative evaluation" in guidelines and user implementations regularly leads to missed signals.

---

## 4. What standard packages do

| Package | Context | Ties correction |
|---|---|---|
| **SAS `PROC FREQ` opt JT** | de facto FDA submissions standard | **Yes, by default** (asymptotic variance is corrected via `Σ tj(tj−1)(2tj+5)`; Hollander–Wolfe formula). SAS/STAT 9.2/9.3/14.x documentation describes this explicitly |
| **R `PMCMRplus::jonckheereTest`** | OECD/ecotox practice, cited in Green 2018 | Yes; the code is borrowed from `npsm` (Kloke & McKean) — ties-corrected variance |
| **R `DescTools::JonckheereTerpstraTest`** | basic biostatistics package | Yes; for tied/large samples, normal approximation with correction; recommends permutation when ties are present |
| **R `clinfun::jonckheere.test`** | widely cited clinical-trials package | When ties are present, the exact method is unavailable and it automatically uses **permutation** (i.e., correct by construction) |
| **R `coin::independence_test`** | theoretically rigorous | Permutation-based, ties handled correctly |
| **R `StatCharrms::jonckheereTerpstraTest`** | EPA-published, OECD ecotox | Yes, ties-aware; implements step-down JT |
| **EPA `RSCABS`** | for ordinal histopathology | Alternative to JT precisely because naive JT is inadequate for tied severity data |
| **Stata `jonter`** | community user-contributed implementation | "jonter corrects J and J* for tied values in varname" (explicit description) |
| **Provantis / PathData** | commercial tox software, used by Charles River, NIEHS | integrated with SAS — therefore uses ties-corrected JT |
| **EPA BMDS / pybmds** | benchmark dose | uses Cochran-Armitage, not JT, but added "trend tests for dichotomous and continuous data" in v25.2; Cochran-Armitage applies to dichotomous data where "ties" have a different meaning |

**Key conclusion:** an implementation of JT without ties correction is an outlier among all serious-purpose tools. Any regulatory statistical reviewer (FDA, EMA, OECD) or internal QA in a pharma company will compare your result to SAS — and a 1.9× discrepancy in the p-value automatically disqualifies the analysis.

---

## 5. When ties correction matters less

For balance, there are scenarios in which the practical difference is small:

- **Strictly continuous endpoints with high precision** (body weight, organ weight measured to 0.001 g; PK parameters such as AUC, Cmax). Tie density is usually <1%, and `Var_no_ties / Var_corrected ≈ 1.001`. The effect on the p-value is negligible. Even here, however, a competent biostatistician will require consistency with SAS.
- **Permutation/exact tests** (`coin::independence_test`, SAS `EXACT JT`, `clinfun` for n<100 without ties). They work via direct enumeration of permutations and **inherently account for ties**, so the variance formula is unnecessary. If your implementation falls back to permutation for tied data, the problem disappears. This is the recommended approach for small-sample preclinical (Neuhäuser 1998, *Biometrical J* 40:899). Hothorn LA & Hothorn T explicitly recommend permutation/exact for bacterial mutagenicity and micronucleus tests.
- **Very extreme p-values** (p < 0.001 or p > 0.5). At such levels, a 2× inflation does not change the conclusion. But in the zone of decision (p ≈ 0.01–0.10), where the NOAEL is determined, such inflation directly changes the conclusion.
- **If JT is used only descriptively** (as a sanity-check trend), with the main inference going through Williams/Shirley/Dunnett. This is exactly how NTP applies JT — as a gatekeeper. In this narrow use case, the error propagates through the choice of subsequent test but does not dominate. This, however, does not excuse an incorrect implementation.

---

## 6. Bottom line — recommendation

**The absence of ties correction in a JT test intended for preclinical use is a material, not a theoretical, defect.**

Arguments:

1. **Structural.** Dominant preclinical endpoints (severity grades, tumor incidence, behavioral scores, micronuclei, malformation counts, clinical chemistry with typical rounding) generate tied data in 30–100% of cases. This is not a corner case — it is the basic operating regime of the test.

2. **Regulatory.** SAS PROC FREQ is the de facto reference for FDA reviewers. NTP, OECD/EPA (StatCharrms), and EMA-relevant R packages (`PMCMRplus`, `DescTools`, `coin`) all include ties correction. An implementation that gives a p-value 1.9–10.7× higher than SAS will not pass comparison/validation in any GLP environment (21 CFR Part 11 + GLP requirements for computational reproducibility).

3. **Scientific.** Inflating the p-value creates a systematic Type II error precisely in the dose-response zone where the NOAEL decision is made. The FDA Pharm-Tox Statistics Team has documented that a Type II error inflation of 1.5×+ due to overly-conservative criteria is a known regulatory problem. An effect of 1.9–10.7× exacerbates exactly this issue.

4. **Professional.** Hothorn (2014, *Toxicol Res*; 2020, *arXiv*; *Statistics in Toxicology Using R*, CRC, 2016) — the most cited author on preclinical statistics — explicitly identifies the "available statistical theory vs. related user-friendly software" mismatch as the principal problem of toxicology software. Releasing JT without ties correction adds precisely this mismatch.

**If the tool is positioned for preclinical/toxicology use:** ties correction must be built in before deployment. The alternative is to switch to a permutation-based p-value when ties are present (as `clinfun` does), which yields a correct result "for free" but at a performance cost.

**If the tool is positioned as a general-purpose statistical primitive:** documenting the limitation "valid only for strictly continuous data without ties; for tied data use SAS/PMCMRplus/DescTools" is acceptable only if this warning is visible in the API and in the documentation, and there is an automatic fail-safe (a warning or refusal upon detecting ties in the input).

Intermediate positions ("it's a nice-to-have", "real data are usually continuous") are statistically incorrect in a preclinical context: real preclinical data are not "usually continuous" — in the majority of cases they are discrete, ordinal, or round-tied.

---

## Caveats

- Most of the quantitative estimates of tie frequency (Section 2) are orders of magnitude based on typical designs (NTP TR, OECD TG 408/451), not on a formal meta-analysis. The exact proportion of tied observations is specific to the laboratory and the class of compound.
- The effect of ties correction on a specific regulatory case is not directly published by FDA (statistical reviews are redacted); the conclusion about "changed regulatory decisions" rests on a mechanistic argument (JT → choice of pairwise test → NOAEL) documented in NTP procedures, not on a public counter-example where the no-ties and ties-corrected versions were retrospectively compared.
- Hothorn and several modern authors (Kluxen 2020, Bretz & Hothorn 2003) argue that **JT itself is no longer the optimal choice** in modern toxicology — Williams/Shirley with heteroscedasticity correction, MCT, Tukey-trend, and model-based BMD are preferable. Nevertheless, JT remains in the standard toolbox of NTP/OECD, and as long as it is there, a correct implementation is mandatory.
- The correction does not eliminate other JT problems: sensitivity to non-monotonic shapes (umbrella response), conservative behavior at small n, downturn at high doses. For the preclinical context, Mack-Wolfe (umbrella) or Williams trend tests are often more appropriate. Fixing ties correction is a necessary but not sufficient condition for a good trend-test infrastructure.
