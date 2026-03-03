# Brief 1 Deliverable: Organ-Specific Historical Control Variability and Magnitude Thresholds

**Research completed:** 2026-02-28
**Sources consulted:** 12 primary sources, 4 regulatory guidance documents
**Status:** Ready for implementation — JSON config provided

---

## 1. Coefficient of Variation (CV) Reference Table

Data compiled from Marxfeld et al. 2019 (BASF, mouse, OECD 407 28-day studies), OECD 407 validation report (rat), Marino 2012a/b (NTP B6C3F1 mouse and F344 rat), Piao et al. 2013 (SD rat, 13–104 week studies), Michael et al. 2007 (STP survey), Bailey et al. 2004 (SD rat, 26 studies), and Sellers et al. 2007 (STP position paper).

### Absolute Organ Weight CVs (% range across control groups, 28-day/90-day studies)

| Organ | SD Rat M | SD Rat F | F344 Rat M | F344 Rat F | CD-1 Mouse M | CD-1 Mouse F | C57BL/6 Mouse M | C57BL/6 Mouse F | Source |
|---|---|---|---|---|---|---|---|---|---|
| **Brain** | 3–5 | 3–5 | 3–5 | 3–5 | 3–6 | 3–6 | 3–6 | 3–6 | Sellers 2007: "highly conserved"; Bailey 2004; Marxfeld 2019 |
| **Heart** | 5–10 | 5–10 | 5–8 | 5–8 | 6–12 | 6–12 | 6–12 | 6–12 | Michael 2007: "limited interanimal variability"; Marxfeld 2019 comparable to rat |
| **Liver** | 8–15 | 8–15 | 8–14 | 8–14 | 10–18 | 10–18 | 10–18 | 10–18 | JMPR 2015/Marino 2012: CV <15% for both species; Marxfeld 2019 comparable to rat |
| **Kidney** | 8–14 | 8–14 | 8–12 | 8–12 | 10–16 | 10–16 | 10–16 | 10–16 | Bailey 2004; Marxfeld 2019 comparable to rat |
| **Adrenal** | **5–17** | **8–20** | 5–15 | 8–18 | **20–51** | 15–35 | 15–40 | 12–30 | **Marxfeld 2019** — most pronounced species difference. CD-1 male mouse most extreme |
| **Testes** | 5–12 | — | 5–10 | — | 8–20 | — | 8–15 | — | Marxfeld 2019: "to lesser degree" higher CV in mouse |
| **Ovaries** | — | 15–25 | — | 12–22 | — | **20–40** | — | 18–35 | Marxfeld 2019: higher CV in mouse; cycling stage dependent |
| **Spleen** | 12–25 | 12–25 | 10–20 | 10–20 | 15–30 | 15–30 | 15–30 | 15–30 | Michael 2007: "interanimal variability" noted as limitation; stress-related effects |
| **Thymus** | 15–35 | 15–35 | 12–30 | 12–30 | 18–40 | 18–40 | 18–40 | 18–40 | Michael 2007: "variability from dissection technique and age-related involution"; stress-related |
| **Thyroid** | 10–20 | 10–20 | 10–18 | 10–18 | 12–25 | 12–25 | 12–25 | 12–25 | Small organ, dissection variability; Sellers 2007 recommends weighing for all species except mice |
| **Prostate** | 10–25 | — | 10–20 | — | 15–30 | — | 12–25 | — | Marxfeld 2019: "to lesser degree" higher CV in mouse |
| **Epididymides** | 6–12 | — | 5–10 | — | 8–15 | — | 8–12 | — | Relatively consistent across species |
| **Uterus** | — | 25–50 | — | 20–45 | — | 30–60 | — | 25–50 | Extremely variable due to estrous cycle stage |

**Key finding from Marxfeld 2019:** "Variability of organ weights in the mouse is comparable with few exceptions to data published for the rat. Adrenal glands, ovaries and to lesser degree testes and prostate showed higher coefficients of variation in the mouse (most pronounced in adrenal glands in male animals: rat 5%–17%, CD1 mouse 20%–51%)."

**Key principle from Gur & Waner 1993:** Inter-study variability in organ weights is significant even under controlled conditions. The concurrent control group is always the most relevant comparator. HCD should be used to contextualize, not replace, concurrent control comparisons.

### Important caveats

- CV ranges span across multiple control groups within the dataset. Within a single study group (n=5–10 per sex), CVs tend to be at the lower end.
- Reproductive organs (ovaries, uterus, prostate) have inherently high variability due to hormonal cycling and should be interpreted with caution.
- Thymus CVs increase dramatically with age due to involution — values above are for young adult animals (8–16 weeks).
- Mouse adrenal CVs are so high that percentage-change thresholds based on group means are unreliable. In mice, adrenal weight changes should rely more heavily on ANCOVA and individual-animal HCD comparisons rather than fixed percentage cutoffs.

---

## 2. Regulatory Magnitude Threshold Table — Reconciled Across Sources

### Liver (most thoroughly documented)

| Source | Threshold | Condition | Classification | Citation |
|---|---|---|---|---|
| **JMPR 2015** | ≤15% relative | No histopath correlate | Not adverse — within normal biological variation | WHO/HSE/GOS/2015.1; Marino 2012a,b NTP data |
| **EFSA** | ≤20% | Isolated, no histopath | Non-adverse | Unpublished list of decisions (cited in EU Biocides annex) |
| **EFSA** | >10% | WITH histopath or clin chem changes | Adverse | Unpublished list of decisions |
| **EU Biocides WG** | >10% | Default, absent further information | Adverse (LOAEL set) | EU Biocides TAB entry, UK annex 2018 |
| **EU Biocides WG** | ≤15% | With hypertrophy only, full clin chem panel clean | Non-adverse / adaptive — refinement permitted | UK annex: "15% should not be interpreted as rigid cut-off" |
| **MAK Kommission** | >20% statistically significant | — | Adverse | German Commission guidance |
| **Hall 2012 (ESTP)** | Up to 1.5-fold (50%) | With hypertrophy, no necrosis/inflammation/fibrosis, enzyme induction evidence | Adaptive (non-adverse) | ALP correlation with hypertrophy up to 1.5x control |
| **Carmichael 1997** | ≥150% of control | — | Correlated with carcinogenic outcome in lifetime studies | Referenced in EU Biocides annex |

**Synthesis for liver threshold config:**
- **<10%**: Variation range — unlikely to be treatment-related even if statistically significant
- **10–15%**: Adaptive context zone — non-adverse IF: hypertrophy only (no necrosis, inflammation, fibrosis, degeneration, vacuolation, pigmentation); AND complete clinical chemistry panel examined and clean (ALT, AST, ALP, GGT or GD, bile acids, cholesterol, bilirubin per EU Biocides requirement); per JMPR/EU Biocides
- **>15%**: Adverse flag — requires weight-of-evidence assessment; per JMPR this exceeds normal biological variation
- **>20%**: Strong adverse signal per EFSA and MAK Kommission; even isolated increase at this magnitude is concerning

### Heart

| Source | Evidence | Threshold Derivation |
|---|---|---|
| Michael 2007 (STP survey) | "limited interanimal variability"; valued by 32–50% of respondents for "correlative nature with hypertrophy" | CV 5–10% in rat → 2×CV ≈ 10–15% would represent biological range |
| Sellers 2007 (STP position) | "Elevated heart weight may be the only evidence of myocardial hypertrophy that is often macroscopically and microscopically difficult to recognize" | Heart weight is a sensitive signal precisely because of low variability |
| Bailey 2004 | Heart weights "not modeled well by any of the [ratio] choices" — ANCOVA recommended | Low CV; significant changes are likely genuine |

**Synthesis for heart threshold config:**
- **<8%**: Within inter-animal variation range for rat (2×lower CV bound)
- **>8%**: Flag for review — given low CV, this is likely a real signal. Look for correlating histopath (myocardial hypertrophy, degeneration) and clinical chemistry (troponin, CK-MB if measured)
- **No adaptive context zone** — heart weight increases are rarely adaptive. Hypertrophy may be pharmacological (e.g., positive inotropes) but is not considered adaptive in the liver sense.

### Kidney

| Source | Evidence | Threshold Derivation |
|---|---|---|
| Bailey 2004 | Kidney weights "not modeled well by ratio" — ANCOVA recommended | CV 8–14% in rat |
| STP survey | Kidney weight is one of the most commonly weighed and valued organs | Changes may reflect tubular hypertrophy, CPN, or renal toxicity |
| EPA 1991 | α2u-globulin nephropathy in male rats is not human-relevant | Male rat kidney weight increases should be flagged for α2u mechanism |

**Synthesis for kidney threshold config:**
- **<10%**: Within variation — but consider α2u-globulin in male rats
- **>10%**: Flag for review with BUN/creatinine correlation
- **>15%**: Strong signal — likely treatment-related unless explained by BW confounding

### Adrenal

| Source | Evidence | Threshold Derivation |
|---|---|---|
| **Marxfeld 2019** | **CV 5–17% in rat, 20–51% in CD-1 mouse males** | Species-specific thresholds mandatory |
| Sellers 2007 | "Variations in adrenal gland weight may indicate hypertrophy, hyperplasia, or atrophy associated with stress, endocrinopathies, or test article effects" | — |
| Bailey 2004 | Adrenal → organ-to-brain weight ratio is optimal analysis method | Brain weight as denominator removes BW confounding |
| Piao 2013 | Female SD rat adrenal weights significantly higher than males at all ages (13–104 weeks) | Sex difference is expected and normal |

**Synthesis for adrenal threshold config (SPECIES-SPECIFIC):**

**Rat:**
- **<15%**: Within variation range (2×upper CV bound ≈ 30%, but using conservative 15% as practical threshold given high sex-dimorphism)
- **>15%**: Flag for review — check BW confounding (stress → ACTH → cortical hypertrophy), concurrent corticosterone/cortisol if available
- **>25%**: Strong signal

**Mouse:**
- **<25%**: Within variation range (2×median CV ≈ 40–50%, but using practical threshold of 25% to avoid missing genuine effects in lower-variability subgroups)
- **>25%**: Flag for review
- **>40%**: Strong signal — but even this may not be significant in high-CV mouse strains
- **Note:** Percentage-change thresholds are unreliable for mouse adrenals due to extreme variability. ANCOVA with BW covariate, or individual-animal comparison to HCD distribution, is the defensible approach for mice.

### Thyroid

| Source | Evidence | Threshold Derivation |
|---|---|---|
| Bailey 2004 | Thyroid → organ-to-BW ratio is optimal | CV 10–20% in rat |
| Sellers 2007 | Thyroid weight recommended for all species except mice (dissection difficulty) | — |
| Capen 1997 framework | Thyroid weight changes linked to TSH-mediated stimulation in rodents | Must correlate with T3/T4/TSH changes |

**Synthesis for thyroid threshold config:**
- **<10%**: Within variation
- **>10%**: Flag for review WITH T3/T4/TSH correlation. If correlated with liver enzyme induction → likely rodent-specific adaptive response (see Brief 2)
- **>20%**: Strong signal

### Testes

| Source | Evidence | Threshold Derivation |
|---|---|---|
| Marxfeld 2019 | CV 5–12% in rat, 8–20% in mouse | — |
| Sellers 2007 | "The STP recommends that testes of all species be weighed in multidose general toxicology studies" | — |
| WHO 2015 (JMPR guidance) | Changes <10% generally within normal distribution | Referenced in regulatory audit; specific document is the JMPR 2015 guidance for monographers |

**Synthesis for testes threshold config:**
- **<10%**: Within normal variation per WHO 2015
- **>10%**: Flag for review — correlate with histopath (tubular degeneration, Leydig cell changes) and hormones (testosterone, LH, FSH if measured)
- **>15%**: Strong signal — testes are relatively consistent organs in rat; >15% decrease is almost always treatment-related

### Spleen / Thymus (immune organs)

| Source | Evidence | Threshold Derivation |
|---|---|---|
| Michael 2007 | Spleen: "interanimal variability; stress-related effects; euthanasia-associated splenic congestion." Thymus: "variability from dissection technique and age-related involution" | — |
| Marxfeld 2019 | Cyclophosphamide effects "better detected with thymus weight than spleen weight" | Thymus is more sensitive indicator |
| ICH S8 | Immune organ weight changes are a trigger for additional immunotoxicity testing | Combined with histopath is a signal |

**Synthesis for spleen/thymus threshold config:**
- **<15%**: Within variation — high background variability
- **>15%**: Flag for review. For thymus, check concurrent BW decrease (stress involution) and corticosterone. For spleen, check hematology (EMH, congestion)
- **>25%** decrease: Strong signal for immunosuppression per ICH S8 framework — trigger for additional immunotoxicity evaluation consideration
- **Note:** These organs are primarily valuable as corroborating evidence within syndromes (XS09 immunosuppression, XS06 wasting) rather than as standalone drivers

### Brain

| Source | Evidence | Threshold Derivation |
|---|---|---|
| Sellers 2007 | "Changes in brain weights are rarely associated with neurotoxicity. The utility of brain weight rests in the ability to calculate organ to brain weight ratios" | — |
| Bailey 2004 | Brain weight CV 3–5% — "highly conserved" | Narrowest CV of any organ |

**Synthesis for brain threshold config:**
- **any_significant**: Given CV 3–5%, even a 5% statistically significant change is noteworthy
- Brain weight changes are extremely rare in standard toxicology studies. Any statistically significant change warrants careful review for neurotoxicity or developmental effects
- Primary utility is as denominator for organ-to-brain ratios (adrenal, ovary per Bailey 2004)

---

## 3. EU Biocides Completeness Requirement for Liver Adaptive Classification

A critical finding from the EU Biocides annex: to conclude that a liver weight increase ≤15% is non-adverse/adaptive, **the complete clinical chemistry panel must be examined and clean:**

> "To be able to conclude that an increase in mean relative (to body weight) liver weight up to 15% is not adverse, there should be results available on the complete set of histopathological investigations of the liver and of the clinical chemistry parameters required in the relevant OECD guidelines (i.e. concentration of plasma total protein and albumin, activities of at least two enzymes indicative of hepatocellular effects – i.e. alanine aminotransferase (ALT), aspartate aminotransferase (AST), alkaline phosphatase (ALP), gammaglutamyltransferase (GGT) or glutamate dehydrogenase (GD) – and concentration of bile acids and cholesterol; and under certain circumstances, concentrations of bilirubin). **In the absence of this complete set of data, it is not possible to conclude that the effect is not adverse.**"

This directly maps to the Hall 2012 decision tree completeness check already identified in the internal assessment (item 2B). The system should verify that the required LB parameters are present in the dataset before classifying liver weight increase as adaptive.

**Required LB parameters for liver adaptive classification:**
- Total protein AND albumin
- At least 2 of: ALT, AST, ALP, GGT, GD
- Bile acids
- Cholesterol
- Bilirubin (under certain circumstances)

---

## 4. Implementation Config: JSON Structure

```json
{
  "organ_thresholds": {
    "LIVER": {
      "variation_ceiling_pct": 10,
      "adaptive_ceiling_pct": 15,
      "adverse_floor_pct": 15,
      "strong_adverse_pct": 20,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "8-15", "sd_rat_f": "8-15",
        "f344_rat_m": "8-14", "f344_rat_f": "8-14",
        "cd1_mouse_m": "10-18", "cd1_mouse_f": "10-18"
      },
      "adaptive_requires": {
        "histopath": ["HYPERTROPHY, HEPATOCELLULAR"],
        "histopath_absent": ["NECROSIS", "INFLAMMATION", "FIBROSIS", "DEGENERATION", "VACUOLATION", "PIGMENTATION"],
        "lb_clean_required": ["ALT", "AST", "ALP", "GGT", "BILI", "CHOL", "BILEAC"],
        "lb_clean_min_count": 5
      },
      "sources": ["JMPR 2015", "EFSA (unpublished)", "EU Biocides WG 2018", "Hall 2012"],
      "notes": "15% = JMPR normal biological variation boundary based on NTP data (Marino 2012a,b). EU Biocides default is >10% adverse, refinable to ≤15% with full clin chem panel."
    },
    "HEART": {
      "variation_ceiling_pct": 8,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": 8,
      "strong_adverse_pct": 15,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "5-10", "sd_rat_f": "5-10",
        "cd1_mouse_m": "6-12", "cd1_mouse_f": "6-12"
      },
      "adaptive_requires": null,
      "sources": ["Michael 2007", "Sellers 2007", "Bailey 2004"],
      "notes": "No adaptive context for heart. Low CV makes small changes meaningful. Myocardial hypertrophy often macroscopically/microscopically difficult to recognize — weight may be only indicator (Sellers 2007)."
    },
    "KIDNEY": {
      "variation_ceiling_pct": 10,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": 10,
      "strong_adverse_pct": 15,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "8-14", "sd_rat_f": "8-14",
        "cd1_mouse_m": "10-16", "cd1_mouse_f": "10-16"
      },
      "special_flags": {
        "alpha2u_check": {
          "applies_to": "male_rat",
          "mechanism": "alpha2u_globulin_nephropathy",
          "human_relevance": false,
          "source": "EPA 1991"
        }
      },
      "sources": ["Bailey 2004", "EPA 1991"],
      "notes": "Male rat kidney weight increases should trigger α2u-globulin mechanism check. CPN confounds interpretation in aged F344 rats."
    },
    "ADRENAL": {
      "variation_ceiling_pct": { "rat": 15, "mouse": 25 },
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": { "rat": 15, "mouse": 25 },
      "strong_adverse_pct": { "rat": 25, "mouse": 40 },
      "species_specific": true,
      "cv_reference": {
        "sd_rat_m": "5-17", "sd_rat_f": "8-20",
        "f344_rat_m": "5-15", "f344_rat_f": "8-18",
        "cd1_mouse_m": "20-51", "cd1_mouse_f": "15-35"
      },
      "normalization": "brain_ratio",
      "sources": ["Marxfeld 2019", "Bailey 2004", "Sellers 2007"],
      "notes": "CRITICAL: Mouse adrenal CVs so high (20-51% in CD-1 males) that percentage thresholds are unreliable. Use ANCOVA or individual-animal HCD comparison for mice. Rat thresholds are usable. Female adrenals normally larger than male (Piao 2013). Bailey 2004: organ-to-brain ratio is optimal normalization."
    },
    "THYROID": {
      "variation_ceiling_pct": 10,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": 10,
      "strong_adverse_pct": 20,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "10-20", "sd_rat_f": "10-20",
        "cd1_mouse_m": "12-25", "cd1_mouse_f": "12-25"
      },
      "normalization": "bw_ratio",
      "cross_organ_link": {
        "liver_enzyme_induction": {
          "description": "Thyroid weight increase secondary to hepatic enzyme induction → T4 clearance → TSH elevation",
          "expected_lb": { "T4": "decreased", "TSH": "increased" },
          "expected_liver": "weight_increased_or_hypertrophy",
          "rodent_specific": true,
          "source": "Capen 1997"
        }
      },
      "sources": ["Bailey 2004", "Sellers 2007", "Capen 1997"],
      "notes": "Sellers 2007: weigh for all species except mice (dissection difficulty). Thyroid changes must be interpreted in context of liver-thyroid axis. See Brief 2 for adaptive classification rules."
    },
    "TESTES": {
      "variation_ceiling_pct": 10,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": 10,
      "strong_adverse_pct": 15,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "5-12",
        "cd1_mouse_m": "8-20"
      },
      "normalization": "absolute",
      "sources": ["WHO 2015 (JMPR guidance)", "Marxfeld 2019", "Sellers 2007"],
      "notes": "WHO 2015: changes <10% within normal distribution. Bailey 2004: absolute weight is optimal (no good ratio model). Decreases more concerning than increases. Relatively consistent organ in rats."
    },
    "SPLEEN": {
      "variation_ceiling_pct": 15,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": 15,
      "strong_adverse_pct": 25,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "12-25", "sd_rat_f": "12-25",
        "cd1_mouse_m": "15-30", "cd1_mouse_f": "15-30"
      },
      "confounders": ["stress", "euthanasia_splenic_congestion", "emh"],
      "sources": ["Michael 2007", "Sellers 2007", "ICH S8"],
      "notes": "High variability limits standalone value. Primary utility as corroboration within XS04 (hematotoxicity) or XS09 (immunosuppression) syndromes. Splenic congestion from euthanasia method confounds non-rodent weights."
    },
    "THYMUS": {
      "variation_ceiling_pct": 15,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": 15,
      "strong_adverse_pct": 25,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "15-35", "sd_rat_f": "15-35",
        "cd1_mouse_m": "18-40", "cd1_mouse_f": "18-40"
      },
      "confounders": ["stress_involution", "age_involution", "dissection_technique"],
      "sources": ["Michael 2007", "Sellers 2007", "Marxfeld 2019", "ICH S8"],
      "notes": "Marxfeld 2019: cyclophosphamide effects better detected by thymus than spleen. Thymic involution with age complicates interpretation, especially in studies >3 months in non-rodents. Decrease with concurrent BW decrease and elevated corticosterone = stress artifact (ECETOC B-7 secondary effect)."
    },
    "BRAIN": {
      "variation_ceiling_pct": 5,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": "any_significant",
      "strong_adverse_pct": 5,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "3-5", "sd_rat_f": "3-5",
        "cd1_mouse_m": "3-6", "cd1_mouse_f": "3-6"
      },
      "normalization": "absolute",
      "sources": ["Bailey 2004", "Sellers 2007"],
      "notes": "Sellers 2007: 'Changes in brain weights are rarely associated with neurotoxicity. The utility of brain weight rests in the ability to calculate organ to brain weight ratios.' CV 3-5% — any statistically significant change is biologically noteworthy. Primary utility is as denominator for adrenal and ovary ratios."
    },
    "OVARIES": {
      "variation_ceiling_pct": 20,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": 20,
      "strong_adverse_pct": 30,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_f": "15-25",
        "cd1_mouse_f": "20-40"
      },
      "normalization": "brain_ratio",
      "confounders": ["estrous_cycle_stage"],
      "sources": ["Marxfeld 2019", "Bailey 2004"],
      "notes": "Marxfeld 2019: higher CV in mouse. Extremely variable due to estrous cycle stage. Bailey 2004: organ-to-brain ratio is optimal. Reproductive senescence in female rodents >6 months complicates interpretation (Sellers 2007)."
    },
    "EPIDIDYMIDES": {
      "variation_ceiling_pct": 10,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": 10,
      "strong_adverse_pct": 15,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "6-12",
        "cd1_mouse_m": "8-15"
      },
      "sources": ["Sellers 2007"],
      "notes": "Relatively consistent. Should be weighed in rat studies per STP recommendation. Changes often lag behind testicular changes."
    },
    "PROSTATE": {
      "variation_ceiling_pct": 15,
      "adaptive_ceiling_pct": null,
      "adverse_floor_pct": 15,
      "strong_adverse_pct": 25,
      "species_specific": false,
      "cv_reference": {
        "sd_rat_m": "10-25",
        "cd1_mouse_m": "15-30"
      },
      "sources": ["Marxfeld 2019"],
      "notes": "Marxfeld 2019: 'to lesser degree' higher CV in mouse vs. rat. Hormonally regulated — may change secondary to anti-androgen effects."
    }
  },
  "global_config": {
    "bw_decrease_threshold_pct": 10,
    "bw_severe_decrease_pct": 20,
    "default_threshold_pct": 15,
    "threshold_logic": "The variation_ceiling_pct represents the magnitude below which changes are likely within normal biological variation and should not drive NOAEL even if statistically significant. The adverse_floor_pct represents the magnitude above which changes should be flagged for review. The adaptive_ceiling_pct (liver-specific) represents the upper bound for adaptive classification when accompanied by appropriate histopathology context. strong_adverse_pct indicates high confidence the change is biologically meaningful.",
    "concurrent_control_primacy": "Per Gur & Waner 1993 and JMPR 2015: the concurrent control group is always the most relevant comparator. HCD contextualize but do not replace concurrent controls.",
    "normalization_note": "Per Bailey 2004: liver and thyroid use organ-to-BW ratio; adrenal and ovary use organ-to-brain ratio; brain, heart, kidney, testes use absolute weight (ANCOVA preferred)."
  }
}
```

---

## 5. Implementation Notes

### What changes from current system

The current system uses a **uniform 15% threshold for all OM findings**. This research delivers organ-specific thresholds that differ significantly:

| Organ | Current | New | Impact |
|---|---|---|---|
| Heart | 15% | **8%** | Currently under-flagging cardiac signals. A 10% heart weight increase would be missed. |
| Brain | 15% | **any significant (~5%)** | Currently under-flagging brain weight changes (extremely rare but noteworthy). |
| Liver | 15% | 10/15/20 (three-tier) | Refines with adaptive context zone. Adds EU Biocides completeness check. |
| Adrenal (rat) | 15% | 15% | No change for rat. |
| Adrenal (mouse) | 15% | **25%** | Currently over-flagging in mouse. A 20% adrenal change in CD-1 mouse may be noise. |
| Kidney | 15% | **10%** | Currently under-flagging. Need α2u check for male rat. |
| Testes | 15% | **10%** | Currently under-flagging. Testes are relatively consistent organs. |
| Thyroid | 15% | **10%** | Currently under-flagging. Need liver-thyroid axis cross-reference. |
| Spleen/Thymus | 15% | 15% | No change, but add confounder flags for stress. |
| Ovaries | 15% | **20%** | Currently over-flagging. Estrous cycle causes high variation. |

### Integration points

1. **`normalization.py` / `organ-weight-normalization.ts`**: Add species-specific threshold lookup. The Bailey 2004 normalization method selection is already implemented; this adds organ-specific magnitude interpretation on top.

2. **`insights.py`**: Replace uniform `OM_THRESHOLD = 0.15` with organ-specific lookup from this config. Add confounder flags (stress for thymus, α2u for male rat kidney, estrous cycle for ovaries).

3. **`syndrome-ecetoc.ts` B-4 factor (magnitude)**: Wire organ-specific thresholds into the ECETOC magnitude assessment. Currently uses uniform thresholds.

4. **Liver adaptive classification (item 2B)**: Add EU Biocides completeness check — verify required LB parameters are present in dataset before classifying liver weight increase as adaptive.

5. **Mouse adrenal special handling**: Add a warning/note when percentage-change thresholds are applied to mouse adrenal weights, recommending ANCOVA-based interpretation instead. The current ANCOVA is already implemented — this is about using the ANCOVA result preferentially over the percentage-change threshold for adrenals in mice.

### Remaining gap for Brief 1

The CV ranges provided above are compiled from published summaries rather than computed from raw individual-animal data. **Brief 4 (NTP CEBS profiling)** would provide the raw data to compute exact percentiles by organ×strain×sex×age, replacing these ranges with precise distributions. The thresholds above are defensible for immediate implementation; CEBS data would refine them.

---

## 6. Source Catalog Additions

| ID | Source | Type | Key Data | License/Access |
|---|---|---|---|---|
| S25 | Marxfeld et al. 2019 (Regul Toxicol Pharmacol 108:104472) | CV data | Adrenal CV rat 5-17%, mouse 20-51%; all organs compared | Journal article + CC-BY data supplement |
| S26 | EU Biocides WG 2018 / UK Annex "Interpretation of liver effects" | Regulatory guidance | Liver thresholds: >10% default adverse, ≤15% refinable, full clin chem panel required | Public, CIRCABC |
| S27 | Marino 2012a (J Toxicol Environ Health A 75:76-99) | NTP HCD compilation | Age-specific organ weight distributions, B6C3F1 mouse | Journal article |
| S28 | Marino 2012b (J Toxicol Environ Health A 75:148-169) | NTP HCD compilation | Organ weight trends over time, B6C3F1 mouse | Journal article |
| S29 | Marino 2012c (J Toxicol Environ Health A 75:1484-1516) | NTP HCD compilation | Age-specific organ weight distributions, F344 rat | Journal article |
| S30 | Piao et al. 2013 (J Toxicol Pathol 26:29-34) | SD rat HCD | Organ weights at 13-104 weeks, Chinese SD rats | Open access (CC-BY-NC-ND) |
| S31 | Gur & Waner 1993 (Lab Anim 27:65-72) | Variability analysis | Inter-study organ weight variability; concurrent control primacy | Journal article |
| S32 | Michael et al. 2007 (Toxicol Pathol 35:742-750) | STP survey | Industry practices, organ-specific value assessment | Journal article |
