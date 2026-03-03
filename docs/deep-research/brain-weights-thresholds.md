# Brain weight thresholds in preclinical toxicology: a calibration guide

**A single |Hedges' g| ≥ 0.8 threshold for flagging brain weight as "affected" is defensible but suboptimal.** The evidence strongly supports replacing it with a species-calibrated tiered system. Brain weight coefficient of variation (CV) ranges from **~2–4% in rodents** to **~5–10% in NHPs**, meaning a fixed g = 0.8 translates to a ~2.4% change in rats but a ~6.4% change in cynomolgus monkeys — biologically and statistically different quantities. Compounding this, typical group sizes (n = 10 rodents vs. n = 3–4 NHPs) create **3- to 4-fold differences in minimum detectable effects** across species. No regulatory body or scientific society has published a formal threshold for when brain weight is "affected," creating a genuine gap that your engine must fill with principled defaults.

---

## The regulatory landscape offers strong language but no numbers

The **EPA 1998 Guidelines for Neurotoxicity Risk Assessment** (EPA/630/R-95/001F) contain the most definitive statement in the literature: *"A change in brain weight is considered to be a biologically significant effect. This is true regardless of changes in body weight, because brain weight is generally protected during undernutrition or weight loss."* The EPA explicitly states it is *"inappropriate to express brain weight changes as a ratio of body weight and thereby dismiss changes in absolute brain weight."* Critically, no minimum percentage is specified — the EPA treats any statistically significant change as inherently meaningful.

**OECD Test Guidelines 424 and 426** both require brain weight measurement and statistical analysis but define no quantitative thresholds. TG 426 (developmental neurotoxicity) mandates brain weights at PND 11–22 and ~PND 70, with findings evaluated by weight-of-evidence; TG 424 (adult neurotoxicity) similarly defers interpretation to the evaluator. Neither guideline operationalizes "biologically significant."

The **Society of Toxicologic Pathology** takes a strikingly different position. Sellers et al. (2007, *Toxicologic Pathology*, 35:751–755) state that *"changes in brain weights are rarely associated with neurotoxicity"* and that *"the utility of brain weight rests in the ability to calculate organ to brain weight ratios."* This directly contradicts the EPA's stance and reflects the practical reality that brain weight is far less sensitive than behavioral or neurochemical endpoints. The companion survey by Michael et al. (2007, *Toxicologic Pathology*, 35:742–750) found that **39–50% of industry respondents** considered brain weight primarily useful for normalizing other organ weights, not as a neurotoxicity indicator per se.

**No ILSI-HESI publication specifically addresses brain weight significance thresholds**, though Holson et al. (2008, *Neurotoxicology and Teratology*, 30:326–348) addressed DNT statistical methodology broadly. The closest thing to a quantitative threshold in the entire literature comes from Weichenthal, Hancock, and Raffaele (2010, *Regulatory Toxicology and Pharmacology*, 57:235–240), who found that **the likelihood of detecting a brain weight change smaller than 5% was generally low across all four laboratories studied**, establishing ~5% as a practical detection floor at n = 10/group.

---

## Species-specific brain weight variability differs by 2- to 5-fold

Brain weight is consistently the **least variable organ weight** across all laboratory species, typically 2–5× less variable than body weight within the same study. The table below synthesizes data from Bailey et al. (2004), Piao et al. (2013, *J Toxicol Pathol*, 26:29–34), Marxfeld et al. (2019, *Regulatory Toxicology and Pharmacology*, 108:104472), Amato et al. (2022, *Toxicologic Pathology*, 50:574–590), Herndon et al. (1998, *Neurobiology of Aging*), and Choi et al. (2011, *Lab Anim Res*, 27:283–291):

| Species / Strain | Approx. Brain Wt (g) | Brain CV% | Body Wt CV% | CV Ratio (Body/Brain) |
|---|---|---|---|---|
| **Sprague-Dawley rat** (♂, ~13 wk) | 1.95–2.10 | **2–4%** | 8–15% | ~3–4× |
| **Wistar Han rat** (♂, ~13 wk) | 1.85–1.95 | **2–4%** | 8–12% | ~3× |
| **Fischer 344 rat** (♂, ~13 wk) | 1.80–2.00 | **2–4%** | 6–10% | ~2–3× |
| **CD-1 mouse** (♂, ~10 wk) | 0.45–0.52 | **3–5%** | 10–16% | ~3–4× |
| **C57BL/6 mouse** (♂, ~10 wk) | 0.42–0.48 | **2–4%** | 8–12% | ~3× |
| **Beagle dog** (♂, 6–12 mo) | 72–82 | **3–6%** | 10–20% | ~3× |
| **Cynomolgus monkey** (♂, young adult) | 60–72 | **5–10%** | 15–25% | ~3× |
| **Rhesus monkey** (♂, adult ≥5 yr) | 96.1 ± 8.7 | **~9%** | ~20% | ~2× |

The rhesus CV of **~9%** (Herndon et al. 1998) reflects a wide age range across that colony; within a tight-age toxicology cohort, NHP brain CV typically runs **5–7%** for cynomolgus monkeys. Inbred strains (F344, C57BL/6) show modestly lower variability than outbred strains, as expected. Historical control databases from NTP, Charles River, and BASF (Marxfeld et al. 2019) confirm these ranges, though NTP archives organ weights within individual study reports rather than in a centralized downloadable database.

---

## Brain sparing persists even under severe systemic toxicity

One of the most robust findings in toxicology is that **brain weight is actively protected during body weight loss** — a phenomenon supported by the "Selfish Brain" hypothesis. Sprengell, Kubera, and Peters (2021, *Frontiers in Neuroscience*, 15:639617) conducted a systematic review of 13 studies and found that when body mass decreased by **11–40%**, brain mass changed by only **+0.3% to −7.4%**. The classic demonstration comes from Schärer (1977, *Toxicology*, 7:45–56): growing male rats fed a restricted diet reached only **250 g vs. 366 g in controls** (~32% lower body weight), yet absolute brain weight was essentially preserved — relative brain weight actually *increased* by 30–40%.

In adult animals, **brain weight appears fully protected even at 30–40% body weight loss**. A starvation study in adult female Wistar rats found that at 30–40% body weight loss, most organs lost considerable dry weight, *"but only brain showed no changes in weight."* The failure threshold for adult brain sparing — if one exists at all — exceeds 40% body weight reduction, a level of wasting rarely encountered even in severely toxic preclinical studies.

**Developing animals are more vulnerable.** Crofton's 2024 EFSA analysis (EFSA Supporting Publications, 21(11):EN-9098) of **173 DNT studies** found that **70% (122/173) showed decreased pup body weights**, but of those, **only 41% (50 studies) also showed decreased brain weights**. This means 59% of body-weight-reducing exposures spared brain weight even in developing pups. In total, roughly **31% of DNT studies (~53/173) showed any brain weight decrease**, and three studies produced brain weight decreases without any body weight change — confirming that brain weight reductions, when they occur, reflect genuine neurodevelopmental insult rather than nonspecific growth retardation.

For direct neurotoxicants, brain weight is typically **one of the least sensitive endpoints**. Trimethyltin produces dose-related brain weight decreases alongside selective hippocampal neuronal loss (Reuhl and Cranmer, 1984), but methylmercury at low developmental doses causes profound functional and neurochemical damage **without significant brain weight changes**. Most known neurotoxicants produce brain weight changes of **<10%** except at overtly toxic doses. Behavioral endpoints (motor activity, auditory startle, learning/memory) are consistently more sensitive.

---

## Statistical power creates a species-dependent detection gap

Power analysis reveals that the minimum detectable standardized effect size varies dramatically by species, driven by group size differences. Using standard two-sample t-test assumptions (α = 0.05, two-sided, 80% power), based on Festing (2018, *Laboratory Animals*, 52:341–350):

| Species | Typical n/group | Brain CV | Min detectable d | Min detectable % change |
|---|---|---|---|---|
| **Rodents** | 10 | 2–5% | **~1.3** | ~3–6% |
| **Dogs** | 3–4 | 3–7% | **~2.0–2.5** | ~6–18% |
| **NHPs** | 3–6 | 5–12% | **~1.6–2.5** | ~8–30% |

These numbers expose a critical blind spot: **a biologically real brain weight change of 5% would be undetectable in dog or NHP studies at standard group sizes**. Even in rodent studies, Weichenthal et al. (2010) showed that power to detect a 5% change varied by up to **34 percentage points across laboratories**, with within-laboratory power ranges spanning **>50%** for individual studies. This means the field's ability to detect genuine brain weight effects is fundamentally limited, and many true positives are likely missed.

For your normalization engine, the key implication is asymmetric: **an observed g = 0.8 in a rodent study (n = 10) is below the minimum detectable effect at 80% power (d ≈ 1.3), meaning it is more likely to reflect a real but underpowered signal than random noise.** In contrast, an observed g = 0.8 in an NHP study (n = 3–4) is far below the detection threshold (d ≈ 2.0–2.5), making it statistically unreliable regardless of biological plausibility.

---

## Published normalization frameworks assume brain stability — none address its failure

**Bailey et al. (2004, *Toxicologic Pathology*, 32:448–466)** is the foundational paper on organ weight normalization. Using control data from 26 Sprague-Dawley rat studies, they found that brain weight has a **weak correlation with body weight** and is mainly a function of age. They recommended organ-to-brain weight ratios for **ovary and adrenal gland** (proportional relationship to brain weight), organ-to-body weight ratios for **liver and thyroid**, and ANCOVA for organs poorly modeled by either ratio (including brain itself, heart, kidney, pituitary, and testes). However, Bailey et al. analyzed only control animals and **did not address the scenario where brain weight itself is treatment-affected** — the framework implicitly assumes brain stability.

**Sellers et al. (2007)** reinforced this assumption, recommending organ-to-brain ratios *"in cases of notable body weight changes"* because *"test materials that alter body weight generally do not alter brain weight"* (citing Wilson et al. 2001, a textbook chapter in Hayes' *Principles and Methods of Toxicology*, 4th ed., pp. 917–958). The STP also cautioned that *"reliance on statistical significance (or the lack thereof) alone in the evaluation of organ weight changes is not satisfactory, particularly in studies with a small sample size."*

**Lazic, Semenova, and Williams (2020, *Scientific Reports*, 10:6625)** argued most radically, recommending that **all ratio-based normalization be abandoned** in favor of Bayesian causal mediation models that decompose direct and indirect treatment effects on organ weight. They demonstrated with simulated data how relative organ weights can mislead and proposed "regions of practical equivalence" rather than fixed thresholds. Importantly, Lazic et al. did not specifically address brain weight as a normalizer because their position renders the question moot — if you never use ratios, you never need to know when brain weight is compromised.

**No published decision tree, flowchart, or threshold exists for when brain weight changes invalidate organ-to-brain ratios.** Hothorn (2009/2010, *Toxicology and Applied Pharmacology*) explicitly warned against statistical flowcharts for organ weight analysis. Nirogi et al. (2014, *Int J Pharm Sci Res*) confirmed Bailey's findings but added no threshold guidance. Crofton (2024) called for *"an international consensus on the interpretation of brain weight changes"* — acknowledging this gap remains unfilled.

---

## Recommendation: replace the single threshold with a species-calibrated tiered system

Your current |g| ≥ 0.8 threshold has a defensible rationale (Cohen's "large effect" convention) but is poorly calibrated to brain weight biology. Here is the quantitative case for a species-calibrated tiered system:

**Why the current threshold is suboptimal.** A fixed g = 0.8 translates to ~2.4% brain weight change in rodents (CV ~3%) but ~6.4% in NHPs (CV ~8%). The EPA considers any brain weight change biologically significant, and a 2.4% rodent brain change is below the 5% practical detection floor (Weichenthal et al. 2010), meaning your engine would flag effects that the original study likely could not have detected as statistically significant — creating interpretive tension. Meanwhile, in NHPs with n = 3–4, observed g values are noisy and g = 0.8 is well below the minimum reliably detectable effect (d ≈ 2.0–2.5), inflating false-positive flags.

**The recommended tiered framework** integrates three evidence streams: (1) species-specific brain CV, (2) typical group sizes and associated statistical power, and (3) the biological significance threshold implied by the brain sparing literature:

| Tier | Rodents (n ≈ 10, CV ~3%) | Dogs (n ≈ 3–5, CV ~5%) | NHPs (n ≈ 3–6, CV ~8%) | Action |
|---|---|---|---|---|
| **Unaffected** | \|g\| < 0.5 (<1.5% Δ) | \|g\| < 0.8 (<4% Δ) | \|g\| < 1.0 (<8% Δ) | Use brain normalization freely |
| **Potentially affected** | 0.5 ≤ \|g\| < 1.0 (1.5–3% Δ) | 0.8 ≤ \|g\| < 1.5 (4–7.5% Δ) | 1.0 ≤ \|g\| < 2.0 (8–16% Δ) | Flag for review; report both normalized and absolute organ weights |
| **Affected** | \|g\| ≥ 1.0 (≥3% Δ) | \|g\| ≥ 1.5 (≥7.5% Δ) | \|g\| ≥ 2.0 (≥16% Δ) | Do not use brain as normalizer; default to ANCOVA or absolute weights |

**Rationale for the specific thresholds:**

- **Rodent g ≥ 0.5 (lower tier)**: With brain CV ~3%, this corresponds to ~1.5% change — small but non-trivial for an organ the EPA considers invariant. Given adequate power at n = 10 to detect ~4% changes (g ≈ 1.3), a persistent g = 0.5 across dose groups or sexes likely reflects a real signal. The upper "affected" threshold of g ≥ 1.0 (~3% change) approaches the practical detection limit, meaning it would plausibly achieve statistical significance in well-powered studies.

- **Dog g ≥ 0.8 (lower tier)**: Maintains your current threshold as the caution boundary. With n = 3–5 and CV ~5%, observed g values are noisier; g = 0.8 represents ~4% change, plausible but unreliable. The "affected" threshold of g ≥ 1.5 (~7.5%) aligns with the minimum detectable effect at n = 4.

- **NHP g ≥ 1.0 (lower tier)**: Higher threshold reflects the fundamental statistical limitations of NHP studies. With n = 3–4 and CV ~8%, only very large effects (g > 2.0, >16% change) are reliably detectable. Setting the "affected" threshold at g ≥ 2.0 avoids excessive false-positive flagging while still catching biologically unambiguous effects.

**Two additional implementation considerations.** First, the tiered system should propagate uncertainty: when brain weight falls in the "potentially affected" tier, report organ-to-brain ratios alongside absolute weights and ANCOVA-adjusted values, letting the toxicologist make the final call. Second, consider supplementing the g-based flag with a **percentage-change check**: if absolute brain weight differs by ≥5% from concurrent control mean, flag as potentially affected regardless of g, since the EPA considers any detectable change significant and 5% is the empirical detection floor.

## Conclusion

The literature reveals a striking disconnect: the EPA treats any brain weight change as biologically significant, the STP considers brain weight changes "rarely associated with neurotoxicity," and no authority provides quantitative thresholds for when brain weight is compromised as a normalizer. Your engine operates in this interpretive vacuum. The evidence converges on three conclusions your current binary threshold misses. First, **brain weight's exceptionally low CV means that even small standardized effects represent meaningful biological departures** — Cohen's conventions were never calibrated for an organ this stable. Second, **species differences in CV and group size create 3–4× differences in detection sensitivity**, making a fixed threshold inherently unfair across species. Third, **Lazic et al.'s argument that ratio normalization should be abandoned entirely** deserves consideration for future versions of your engine, as Bayesian causal models would eliminate the need for a brain-weight flag altogether. For now, a species-calibrated tiered system — option (b)+(c) from your list — best balances sensitivity to genuine neurotoxic effects against the statistical noise inherent in small-group, high-variability species.