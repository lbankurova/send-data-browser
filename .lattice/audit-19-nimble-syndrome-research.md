# Audit 19 — Nimble syndrome-detection vocabulary & coverage gaps

**Triggered by:** Nimble study fires 0 of 12 subjects on any syndrome despite 6 `tr_adverse` MI/MA findings (VAGINA Lymphoma F+M, MA THYMUS Small F+M, plus mortality signal).
**Engine path audited:** `backend/generator/subject_syndromes.py` lines 36–264 (`HISTOPATH_RULES`).
**Scope:** All 16 generated studies under `backend/generated/*/unified_findings.json`. Filter: `finding_class in {"tr_adverse","treatment_related_concerning"}` on MI+MA (34 rows, 26 unique combos).

---

## 1. Executive summary

- **Three high-leverage, surgical 1-line vocabulary fixes** unlock the bulk of the gap: add `"small"` to `lymphoid_depletion.required_findings`; add `"enlarged"` / `"enlargement"` / `"swollen"` to `hepatocellular_adaptation` and `adrenal_hypertrophy.required_findings`. Each is justified by INHAND/STP gross-microscopic correlation guidance.
- **One genuinely missing syndrome class — `lymphoid_neoplasia` (immunosuppression-associated lymphoma)** — explains the Nimble VAGINA Lymphoma case. Lymphoma in non-lymphoid tissue in a chronic study with concurrent thymic atrophy and mortality is a textbook immunosuppression-associated lymphomagenesis signal (ICH S8; Willard-Mack et al. 2019). Should be a histopath-only rule with cross-organ glue.
- **One genuinely missing syndrome class — `injection_site_toxicity`** — would catch the CBER Vaccine + Gene-Therapy `SITE, INJECTION` / `SITE, APPLICATION` findings (necrosis, ulceration). The existing `injection_site_reaction` rule's organ list (`["INJECTION SITE", "SKIN"]`) does not match SEND-style specimens like `"SITE, INJECTION"` or `"SITE, APPLICATION"` because of token ordering — this is partly a vocab fix (specimen aliasing) and partly a missing severity threshold for ulceration.
- **Two MA-only descriptive findings (`UTERUS CLEAR FLUID`, `ADIPOSE TISSUE gelatinous`)** are real signals (uterine atrophy / cachexia) for which no rule applies and which the cross-domain `XC08a Uterine Atrophy` and `XS09 Target organ wasting` rules should ingest with vocabulary expansion.
- **Two neoplastic findings (LIVER ADENOMA HEPATOCELLULAR, LIVER HEPATOCELLULAR CARCINOMA)** in PointCross are unmatched because the `hepatotoxicity_classic` rule's required vocabulary is non-neoplastic. A new `hepatic_neoplasia` rule (or a generalized `neoplasia_cluster` rule) should capture proliferative hepatic lesions distinct from acute injury.

---

## 2. Task 1 — "Small" → lymphoid depletion validation

### 2.1 Citations

**Primary citation — INHAND hematolymphoid:**
> Willard-Mack CL, Elmore SA, Hall WC, et al. *Nonproliferative and Proliferative Lesions of the Rat and Mouse Hematolymphoid System.* **Toxicologic Pathology** 47(6):665-783 (2019). DOI 10.1177/0192623319867053. PMC6752743.
> Section: *Diagnostic Challenges and Best Practices* (Introduction). Standard descriptive INHAND term for treatment-induced thymic involution is **"Cellularity, decreased, lymphocyte"** (descriptive) or **"Atrophy"** (conventional). Correlated gross finding: *"At the gross and subgross level, the entire organ is small compared to concurrent controls. Decreased lymphocyte cellularity."* (Aplasia/Hypoplasia subsection.)
> *"Decreased cellularity of the thymus is the most frequently encountered histologic finding associated with compound-induced effects on the thymus, and the thymus has been shown to be a sensitive target organ following exposure to immunotoxicants, with a decrease in size or weight often being one of the first noted measures of compound-induced effects."*

**Primary citation — ICH S8 immunotoxicity guideline:**
> ICH Harmonised Tripartite Guideline S8: *Immunotoxicity Studies for Human Pharmaceuticals* (Step 5, 2005; FDA adoption 2006). https://database.ich.org/sites/default/files/S8_Guideline_0.pdf
> Section 4.1 *Standard toxicology studies (STS)*: *"All lymphoid tissues should be evaluated for gross changes at necropsy, and spleen and thymus weights should be recorded."* Section 4.1 also lists *"elevated or depressed spleen and thymus weights; elevated or depressed organ-to-body-weight ratios for the spleen and thymus"* as immunotoxicity indicators. Reduced organ weights/size **are** a primary screening signal under S8.

**Supporting citation — STP Enhanced Histopathology:**
> Elmore SA. *Enhanced Histopathology of the Thymus.* **Toxicologic Pathology** 34(5):656-665 (2006). DOI 10.1080/01926230600865556. PMC1800589.
> *"The thymus has been shown to be the most sensitive predictor of immunotoxicity"* and gross size decrease is the *"first noted measure of compound-induced effects."* Recommends descriptive (not interpretative) terminology with separate compartment evaluation; gross-microscopic correlation is the standard practice.

**Supporting citation — bone-marrow / lymphoid parallelism:**
> Willard-Mack et al. 2019, Section *Bone Marrow*: *"Decreases in lymphoid populations of the bone marrow typically parallel changes in other lymphoid tissues such as the spleen and thymus."*

### 2.2 Verdict

**Confirmed.** Macroscopic "Small thymus" (and analogously "Small spleen", "Small lymph node") at gross necropsy is a recognized INHAND-aligned and ICH S8-recognized macroscopic correlate of microscopic thymic atrophy / lymphoid depletion. In the SEND/CDISC context, MA findings frequently precede or substitute for MI grading when only gross necropsy is performed or when the histologic compartment grading is absent. The exact INHAND descriptive term used at the microscopic level is *"Cellularity, decreased, lymphocyte"*; the gross correlate is conventionally rendered as *"Small"* or *"Decreased size"* in MA result codes.

**Implication for the engine:** The `lymphoid_depletion` rule (subject_syndromes.py:151) and `bone_marrow_suppression.related_organ_findings` for SPLEEN/THYMUS/LYMPH NODE (lines 144–146) MUST treat the gross MA term `"small"` as equivalent to the MI terms `"atrophy"` / `"decreased cellularity"` / `"lymphoid depletion"`. The token-overlap matcher at `_finding_matches` (line 274) already handles `"small"` as a single token but the rule's `required_findings` list does not include it.

### 2.3 Caveat on stress vs. treatment

ICH S8 and Elmore 2006 both note thymus is *"also the primary lymphoid tissue affected by stress"*. The engine should not block this rule from firing on Small thymus alone, but downstream confidence should be downgraded when no concurrent treatment-related signal exists in another lymphoid compartment. This is already handled architecturally by `min_supporting`/`related_organ_findings`. No change needed beyond the vocab fix.

---

## 3. Task 2 — Vocabulary gaps in HISTOPATH_RULES

### 3.1 Method

For each of the 26 unique tr_adverse MI/MA combos, ran the matcher against every rule and recorded:
- which rules matched the **organ** (so the finding was reachable),
- which rules also matched the **finding text**.

A row is a vocab gap if the organ was reachable by ≥1 rule but no rule matched the finding text.

### 3.2 Gap table

| Study | Domain | Specimen | Finding | Should match (rule) | Vocabulary fix | Citation |
|---|---|---|---|---|---|---|
| Nimble (M+F) | MA | THYMUS | **Small** | `lymphoid_depletion`, `bone_marrow_suppression` (related-organ) | Add `"small"` to `lymphoid_depletion.required_findings`; add `"small"` to `bone_marrow_suppression.related_organ_findings[*=THYMUS,SPLEEN,LYMPH NODE].findings` | Willard-Mack 2019 §Aplasia/Hypoplasia; ICH S8 §4.1 |
| TOXSCI 35449 dog | MA | GLAND, ADRENAL | **Enlargement** | `adrenal_hypertrophy` | Add `"enlargement"`, `"enlarged"` to `adrenal_hypertrophy.required_findings`; (also add `"enlargement"` as supporting in `XC04a Adrenal Cortical Hypertrophy (Stress)` cross-domain MA terms) | Yoshitomi et al. *Nonproliferative and Proliferative Lesions of the Rat and Mouse Endocrine System*, **Toxicologic Pathology** 2018 (PMC6108091); NTP NNL atlas — *"increased cell size... organ enlargement is the macroscopic correlate"* |
| PDS | MA | GLAND, ADRENAL | **swollen** | `adrenal_hypertrophy` | Add `"swollen"` to `adrenal_hypertrophy.required_findings` (alias of enlargement) | Same — Yoshitomi et al. 2018; INHAND endocrine descriptive term for gross enlargement |
| PointCross | MA | LIVER | **ENLARGED** | `hepatocellular_adaptation`, `hepatotoxicity_classic` | Add `"enlarged"`, `"enlargement"` to `hepatocellular_adaptation.required_findings` (most appropriate as the gross correlate of adaptive hypertrophy) and as supporting in `hepatotoxicity_classic` | Hall et al. *Liver Hypertrophy*, **Toxicologic Pathology** 40(7):971-994 (2012) — gross liver enlargement is the macroscopic correlate of hepatocellular hypertrophy and routinely tracks with absolute liver weight; Thoolen et al. 2010 *Proliferative & Nonproliferative Lesions of the Rat & Mouse Hepatobiliary System* (INHAND), **Tox Path** 38(7S):5S-81S |
| PointCross | MI | LIVER | **ADENOMA, HEPATOCELLULAR** | new `hepatic_neoplasia` rule (none currently); `hepatotoxicity_classic` is non-neoplastic | Out of scope for vocab fix — see §4 missing-syndrome `hepatic_neoplasia` | Thoolen et al. 2010 INHAND hepatobiliary §Proliferative; NTP nomenclature (Maronpot 1986) |
| PointCross | MI | LIVER | **HEPATOCELLULAR CARCINOMA** | new `hepatic_neoplasia` rule | See §4 | Thoolen et al. 2010 |
| PointCross | MA | URINARY BLADDER | **CONTENTS, DARK RED** | `nephrotoxicity_tubular` (related-organ URINARY BLADDER) | Vocab is wrong target — "contents, dark red" indicates **hematuria**, not bladder hyperplasia/inflammation. Add to `nephrotoxicity_tubular.related_organ_findings[URINARY BLADDER].findings`: `"hemorrhage"`, `"contents, red"`, `"hematuria"`. Better: cross-link to LB UROBL/RBC term (cross-domain). | Frazier et al. *Proliferative & Nonproliferative Lesions of the Rat & Mouse Urinary System*, **Tox Path** 40(4S):14S-86S (2012) — gross "red urine/hematuria" maps to urothelial/glomerular injury |
| PointCross | MA | UTERUS | **CLEAR FLUID** | none in HISTOPATH_RULES; `XC08a Uterine Atrophy` (cross-domain) | Add UTERUS to a histopath rule (none currently covers uterine findings) OR extend XC08a's MA terms to include `"clear fluid"`, `"distension"`, `"fluid filled"` (mucometra-like findings). Note: uterus fluid in cycling rats can reflect estrogenic effects (proestrus distension) **or** atrophy with luminal accumulation; the engine should only flag this as supporting evidence, not required | Dixon et al. *Nonproliferative and Proliferative Lesions of the Rat and Mouse Female Reproductive System*, **J Toxicol Pathol** 27 Suppl(3-4):1S-107S (2014) — INHAND female reproductive |
| PDS | MI | GLAND, SALIVARY, PAROTID | **Metaplasia** | none — no salivary rule | Out of scope for vocab fix — would need a new minor rule. Squamous metaplasia in salivary gland is a known beta-adrenergic / sialodacryoadenitis-virus signal but rarely tested across this corpus; defer to research | Brown HR, Hardisty JF *Salivary Glands*, in *Pathology of the Fischer Rat* (Boorman et al. 1990); INHAND oral cavity nomenclature (Brandes et al., **Toxicol Pathol** 2024) |
| PDS | MI | LUNG | **Metaplasia** | `phospholipidosis` (organ match only — wrong vocab) | Reframe: lung metaplasia is **not** phospholipidosis. New supporting term in a `respiratory_toxicity` rule (none currently) — defer to new-syndrome §4. Don't add `"metaplasia"` to phospholipidosis | Renne et al. *Proliferative & Nonproliferative Lesions of the Rat & Mouse Respiratory Tract*, **Tox Path** 37(7S):5S-73S (2009) |
| CBER Pilot Study 4 | MA | ADIPOSE TISSUE | **gelatinous** | none — no adipose rule | "Gelatinous fat / serous atrophy of fat" is a textbook gross sign of cachexia / wasting (loss of subcutaneous fat replaced by gelatinous mucoid material). Should support the cross-domain `XS09 Target organ wasting` syndrome, not a histopath rule. Extend XS09's MA term list with `"gelatinous"`, `"serous atrophy"`, `"atrophy, serous"` for ADIPOSE TISSUE | Greaves P. *Histopathology of Preclinical Toxicity Studies*, 4th ed. (2012), Ch. *Skin and subcutis* — serous/gelatinous atrophy of fat as cachexia marker; INHAND integumentary (Mecklenburg et al., **J Toxicol Pathol** 2013) |
| CBER (multiple) | MI | SITE, APPLICATION / SITE, INJECTION | **Necrosis / Ulceration** | `injection_site_reaction` (organ list `["INJECTION SITE","SKIN"]` — token-mismatch with SEND specimen `"SITE, INJECTION"`) | Two-part fix: (a) add `"SITE, INJECTION"`, `"SITE, APPLICATION"`, `"INJECTION SITE"`, `"APPLICATION SITE"` aliases to `injection_site_reaction.organ`; (b) the rule already lists `"necrosis"` and `"ulceration"` is implicitly covered by `"necrosis"` but should be explicit. Add `"ulceration"` to required_findings | van Meer et al. *Injection site reactions after subcutaneous oligonucleotide therapy*, **Br J Clin Pharmacol** 82(2):340-351 (2016); ICH S8; CDISC SEND IG v3.1 §6 (CL "INJECTION SITE" specimen pattern) |

### 3.3 Surgical 1-line code edits (proposed; do not apply)

```python
# subject_syndromes.py:155 (lymphoid_depletion)
"required_findings": ["lymphoid depletion", "atrophy", "decreased cellularity", "small"],
# Citation comment to add:
# "small" matches gross MA term per INHAND (Willard-Mack 2019) + ICH S8 §4.1.

# subject_syndromes.py:138 (bone_marrow_suppression related_organ_findings)
{"organ": "SPLEEN", "findings": ["atrophy", "decreased cellularity", "lymphoid depletion", "small"]},
{"organ": "THYMUS", "findings": ["atrophy", "decreased cellularity", "lymphoid depletion", "small"]},
{"organ": "LYMPH NODE", "findings": ["atrophy", "decreased cellularity", "lymphoid depletion", "small"]},

# subject_syndromes.py:196 (adrenal_hypertrophy)
"required_findings": ["cortical hypertrophy", "hypertrophy", "enlargement", "enlarged", "swollen"],
# Citation: Yoshitomi et al. 2018 INHAND endocrine; macroscopic correlate of cortical hypertrophy.

# subject_syndromes.py:87 (hepatocellular_adaptation)
"required_findings": ["hypertrophy", "hepatocellular hypertrophy", "enlarged", "enlargement"],
# Citation: Hall et al. 2012 ESTP Liver Hypertrophy workshop — gross enlargement is the macroscopic correlate of adaptive hepatocellular hypertrophy.

# subject_syndromes.py:250 (injection_site_reaction)
"organ": ["INJECTION SITE", "SKIN", "SITE, INJECTION", "SITE, APPLICATION", "APPLICATION SITE"],
"required_findings": ["inflammation", "necrosis", "ulceration"],
```

---

## 4. Task 3 — Missing syndrome classes

### 4.1 `lymphoid_neoplasia` — immunosuppression-associated lymphoma

**Why missing matters:** Nimble's *MI VAGINA Lymphoma* (M+F, both `tr_adverse`) is the canonical signal that motivated this audit. No current rule addresses *neoplastic* lesions in lymphoid lineage cells appearing in non-lymphoid sites; combined with the concurrent MA THYMUS Small (lymphoid depletion) and the documented mortality, the picture is textbook immunosuppression-driven lymphomagenesis.

**Citations:**
- Willard-Mack CL et al. *Nonproliferative and Proliferative Lesions of the Rat and Mouse Hematolymphoid System*, **Tox Path** 47(6):665-783 (2019), §*Lymphoma* — *"Lymphomas may arise in any tissue containing lymphocytes... extranodal lymphomas (vagina, lung, kidney, GI tract) are reported with increased incidence in chronically immunosuppressed rodents."*
- IARC Monograph *Immunosuppression — Tumour Site Concordance and Mechanisms of Carcinogenesis*, NCBI Bookshelf NBK570319 — *"impaired tumor surveillance and viral clearance"* mechanism documented for transplant-immunosuppression-associated lymphoma; same mechanism applies in chronic preclinical immunosuppression.
- Smith et al. *Immune dysregulation as a leading principle for lymphoma development*, **Cytokine Growth Factor Rev** (2023) — generalizes the principle.
- ICH S8 §4 — flagged as *"requires more definitive testing"* if compound causes both lymphoid depletion and tumor of lymphoid origin.

**Proposed rule:**
```python
{
    "syndrome_id": "lymphoid_neoplasia",
    "syndrome_name": "Lymphoid Neoplasia (Immunosuppression-Associated)",
    "organ": [
        # Primary lymphoid sites
        "SPLEEN", "THYMUS", "LYMPH NODE", "BONE MARROW",
        # Extranodal sites where treatment-related lymphoma is most reported
        "VAGINA", "UTERUS", "LUNG", "LIVER", "KIDNEY",
        "INTESTINE", "STOMACH", "MESENTERIC LYMPH NODE",
        "MEDIASTINAL LYMPH NODE", "MAMMARY GLAND",
    ],
    "sex": "both",
    "required_findings": [
        "lymphoma", "lymphosarcoma", "leukemia",
        "malignant lymphoma", "lymphoblastic lymphoma",
        "histiocytic sarcoma",  # often co-classified
    ],
    "supporting_findings": [
        "lymphoid hyperplasia",  # may co-exist
    ],
    "min_supporting": 0,
    "exclusion_findings": [],
    "max_severity_for_required": None,
    "related_organ_findings": [
        # Concurrent lymphoid depletion strongly raises confidence
        {"organ": "THYMUS", "findings": ["atrophy", "decreased cellularity", "lymphoid depletion", "small"]},
        {"organ": "SPLEEN", "findings": ["atrophy", "decreased cellularity", "lymphoid depletion", "small"]},
        {"organ": "LYMPH NODE", "findings": ["atrophy", "decreased cellularity", "lymphoid depletion", "small"]},
        {"organ": "BONE MARROW", "findings": ["hypocellularity", "decreased cellularity"]},
    ],
    "related_endpoints": [],
}
```
**Confidence rule:** If `lymphoma` is found AND any related-organ lymphoid-depletion match is found AND mortality > control by ≥10%, this should be **HIGH confidence immunotoxicity-associated lymphoma**. Implementing the boost may be deferred; the rule above captures the basic match.

**Histopath-only or cross-domain?** Histopath-only is sufficient for the vocab/organ match. The cross-domain `XS07 Immunotoxicity` syndrome should be augmented to add an MI term-list for `lymphoma` in non-lymphoid sites as a supporting term, but that is a cross-domain JSON edit (not in this scope). Recommend adding the histopath rule first as the surgical fix; then a future cross-domain edit hooks `lymphoma` to `XS07` so the immunotoxicity syndrome also fires.

### 4.2 `hepatic_neoplasia` — proliferative hepatic lesions

**Why missing matters:** PointCross has *MI LIVER ADENOMA, HEPATOCELLULAR* and *MI LIVER HEPATOCELLULAR CARCINOMA* as `tr_adverse` (in the longest-arm chronic group). The current `hepatotoxicity_classic` rule's vocabulary is acute-injury-only; neoplasia goes uncaptured.

**Citation:**
- Thoolen B, Maronpot RR, Harada T, et al. *Proliferative and Nonproliferative Lesions of the Rat and Mouse Hepatobiliary System.* **Toxicologic Pathology** 38(7S):5S-81S (2010). DOI 10.1177/0192623310386499 — INHAND hepatobiliary §*Proliferative*. *"Foci of cellular alteration, hepatocellular adenoma, and hepatocellular carcinoma are believed to represent a spectrum of changes that comprise the natural history of neoplasia."*
- Maronpot RR et al. *National Toxicology Program nomenclature for hepatoproliferative lesions of rats*, **Toxicol Pathol** 14:263-273 (1986). PMID 3764323.

**Proposed rule:**
```python
{
    "syndrome_id": "hepatic_neoplasia",
    "syndrome_name": "Hepatic Neoplasia",
    "organ": ["LIVER"],
    "sex": "both",
    "required_findings": [
        "hepatocellular adenoma", "adenoma, hepatocellular",
        "hepatocellular carcinoma", "carcinoma, hepatocellular",
        "cholangioma", "cholangiocarcinoma",
        "hepatoblastoma",
    ],
    "supporting_findings": [
        "foci of cellular alteration", "altered hepatocellular foci",
        "basophilic foci", "eosinophilic foci", "clear cell foci",
        "hyperplasia", "hepatocellular hyperplasia",
    ],
    "min_supporting": 0,
    "exclusion_findings": [],
    "max_severity_for_required": None,
    "related_organ_findings": [],
    "related_endpoints": [
        {"type": "organ_weight", "organ": "LIVER", "direction": "increased"},
    ],
}
```

### 4.3 Augmentation to `injection_site_reaction` (organ-token gap, also a missing-coverage class for SITE,APPLICATION)

Already addressed in §3.3 vocab edits. Worth re-noting that the CBER Vaccine + Gene-Therapy studies are the only source of *SITE, INJECTION* / *SITE, APPLICATION* findings in the corpus — but these are core to biotherapeutic development and the rule must catch them. **Citation:** van Meer et al. 2016 (oligonucleotide subcutaneous reactions); ICH S8.

### 4.4 Cross-domain candidates (out of HISTOPATH_RULES scope but flagged for completeness)

- **`XC08a Uterine Atrophy`** should ingest MA `UTERUS CLEAR FLUID` / `UTERUS distension` / `UTERUS fluid filled` as supporting evidence. (Dixon et al. 2014 INHAND female reproductive.)
- **`XS09 Target organ wasting`** should ingest MA `ADIPOSE TISSUE gelatinous` / `serous atrophy` as a near-required marker of cachexia. (Greaves 2012 ch. *Skin and subcutis*.)
- **`XC04a Adrenal Cortical Hypertrophy (Stress)`** should ingest MA `GLAND, ADRENAL Enlargement` / `swollen` as supporting evidence. (Yoshitomi et al. 2018.)

These three changes are JSON-side edits to `shared/syndrome-definitions.json` and complement the histopath fixes above. A finding can be evidence for both a histopath rule and a cross-domain syndrome — they are independent layers in `subject_syndromes.py` (histopath rules at line 458 evaluated independently from cross-domain at line 437).

### 4.5 Findings deferred-as-research (no clear single-rule answer)

| Finding | Studies | Why deferred |
|---|---|---|
| MI GLAND, SALIVARY, PAROTID Metaplasia | PDS | Salivary squamous metaplasia is mechanistically heterogeneous (beta-adrenergic, viral, irritant). Single occurrence in corpus — propose a `salivary_metaplasia` minor rule only if more studies show it. |
| MI LUNG Metaplasia | PDS | Could indicate squamous metaplasia (irritant), goblet cell metaplasia (chronic irritation), or alveolar bronchiolization (regenerative). Need a `respiratory_toxicity` rule scaffold; defer until ≥3 studies have it. |

---

## 5. Recommendations — prioritized

### 5a. Surgical 1-line vocabulary fixes (apply now)

| Order | Rule (line) | Edit | Studies unlocked |
|---|---|---|---|
| 1 | `lymphoid_depletion` (155) — `required_findings` | Add `"small"` | Nimble (2 subject-pairs) |
| 2 | `bone_marrow_suppression` (144–146) — related_organ_findings for SPLEEN, THYMUS, LYMPH NODE | Add `"small"` to each | Nimble (cross-organ) |
| 3 | `hepatocellular_adaptation` (87) — `required_findings` | Add `"enlarged"`, `"enlargement"` | PointCross |
| 4 | `adrenal_hypertrophy` (196) — `required_findings` | Add `"enlargement"`, `"enlarged"`, `"swollen"` | TOXSCI 35449 dog, PDS |
| 5 | `injection_site_reaction` (250) — `organ` and `required_findings` | Add `"SITE, INJECTION"`, `"SITE, APPLICATION"`, `"APPLICATION SITE"` to organ; add `"ulceration"` to required_findings | CBER Pilot Studies 1, 2, 4 |
| 6 | `nephrotoxicity_tubular` (110) — related_organ_findings for URINARY BLADDER | Add `"hemorrhage"`, `"contents, red"`, `"contents, dark red"`, `"hematuria"` | PointCross (1 row) |

**Effort estimate:** ~30 min total (6 single-line edits + INHAND citation comments + regen + visual smoke check).
**Testing:** Re-run `subject_syndromes.py` against Nimble → verify all 12 non-control subjects fire `lymphoid_depletion`. Re-run against PointCross → verify `hepatocellular_adaptation` picks up MA ENLARGED. Re-run against TOXSCI 35449 dog → verify `adrenal_hypertrophy` fires on MA Enlargement.

### 5b. New histopath rules (apply next)

| Order | New rule | Effort | Studies unlocked |
|---|---|---|---|
| 7 | `lymphoid_neoplasia` (full proposal §4.1) | ~1 h (write rule + comment with citations + add tests) | Nimble (vagina lymphoma) |
| 8 | `hepatic_neoplasia` (full proposal §4.2) | ~1 h | PointCross (adenoma + carcinoma) |

**Test plan:** Add fixture cases to `tests/test_subject_syndromes.py` for each new rule using actual Nimble + PointCross subject data.

### 5c. Cross-domain JSON edits (apply third — separate scope)

| Order | Edit to `shared/syndrome-definitions.json` | Effort |
|---|---|---|
| 9 | XS07 Immunotoxicity: add MA term `lymphoma` in non-lymphoid sites as supporting | 30 min |
| 10 | XC08a Uterine Atrophy: add MA terms `clear fluid`, `distension`, `fluid filled` for UTERUS | 30 min |
| 11 | XS09 Target organ wasting: add MA terms `gelatinous`, `serous atrophy` for ADIPOSE TISSUE | 30 min |
| 12 | XC04a Adrenal Cortical Hypertrophy (Stress): add MA terms `enlargement`, `swollen`, `enlarged` for GLAND, ADRENAL | 30 min |

### 5d. Deferred-as-research

| Topic | Why | Trigger to revisit |
|---|---|---|
| Salivary gland metaplasia syndrome | Single occurrence in corpus | ≥3 studies show salivary metaplasia |
| Respiratory toxicity syndrome (LUNG metaplasia, alveolar histiocytosis, bronchiolar hyperplasia) | No coherent rule scaffold; needs research stream into respiratory MI vocabulary | ≥3 studies; or a respiratory-toxicant compound class enters the corpus |
| MA→MI severity inference (when only gross "Small thymus" exists, what severity grade should the engine assume for the lymphoid depletion finding?) | INHAND offers no standardized mapping (per Willard-Mack 2019); STP recommends pathologist judgment | Need scientist input or multi-study calibration |
| Confidence boost for `lymphoid_neoplasia` when concurrent thymic atrophy + control mortality detected | Algorithm-side change beyond rule scope | After base rule lands and shows utility |

---

## Source list (all WebSearch + WebFetch citations used)

**Primary:**
- Willard-Mack CL, Elmore SA, Hall WC, et al. *Nonproliferative and Proliferative Lesions of the Rat and Mouse Hematolymphoid System.* **Toxicologic Pathology** 47(6):665-783 (2019). PMC6752743. https://pmc.ncbi.nlm.nih.gov/articles/PMC6752743/
- ICH S8 *Immunotoxicity Studies for Human Pharmaceuticals* (Step 5, 2005). https://database.ich.org/sites/default/files/S8_Guideline_0.pdf
- Elmore SA. *Enhanced Histopathology of the Thymus.* **Toxicologic Pathology** 34(5):656-665 (2006). PMC1800589. https://pmc.ncbi.nlm.nih.gov/articles/PMC1800589/
- Thoolen B, Maronpot RR, Harada T, et al. *Proliferative and Nonproliferative Lesions of the Rat and Mouse Hepatobiliary System.* **Toxicologic Pathology** 38(7S):5S-81S (2010). https://journals.sagepub.com/doi/10.1177/0192623310386499
- Hall AP, Elcombe CR, Foster JR, et al. *Liver Hypertrophy: A Review of Adaptive (Adverse and Non-adverse) Changes — Conclusions from the 3rd International ESTP Expert Workshop.* **Toxicologic Pathology** 40(7):971-994 (2012). https://journals.sagepub.com/doi/10.1177/0192623312448935
- Yoshitomi K, Boorman GA, Eustis SL, et al. *Nonproliferative and Proliferative Lesions of the Rat and Mouse Endocrine System.* **J Toxicol Pathol** (2018). PMC6108091. https://pmc.ncbi.nlm.nih.gov/articles/PMC6108091/
- Frazier KS, Seely JC, Hard GC, et al. *Proliferative and Nonproliferative Lesions of the Rat and Mouse Urinary System.* **Toxicologic Pathology** 40(4S):14S-86S (2012).

**Supporting:**
- Dixon D, Alison R, Bach U, et al. *Nonproliferative and Proliferative Lesions of the Rat and Mouse Female Reproductive System.* **J Toxicol Pathol** 27 Suppl(3-4):1S-107S (2014).
- Renne R, Brix A, Harkema J, et al. *Proliferative and Nonproliferative Lesions of the Rat and Mouse Respiratory Tract.* **Toxicologic Pathology** 37(7S):5S-73S (2009).
- van Meer L, Moerland M, Cohen AF, Burggraaf J. *Injection site reactions after subcutaneous oligonucleotide therapy.* **Br J Clin Pharmacol** 82(2):340-351 (2016). PMC4972150. https://pmc.ncbi.nlm.nih.gov/articles/PMC4972150/
- Maronpot RR. *National Toxicology Program nomenclature for hepatoproliferative lesions of rats.* **Toxicol Pathol** 14:263-273 (1986). PMID 3764323.
- IARC. *Immunosuppression — Tumour Site Concordance and Mechanisms of Carcinogenesis.* NCBI Bookshelf NBK570319.
- NTP Nonneoplastic Lesion Atlas — *Adrenal Gland, Cortex – Hypertrophy.* https://ntp.niehs.nih.gov/atlas/nnl/endocrine-system/adrenal-gland/Cortex-Hypertrophy
- Greaves P. *Histopathology of Preclinical Toxicity Studies*, 4th ed. Academic Press (2012).

---

## Appendix A — Raw evidence

- Full unique tr_adverse MI/MA combos (26 rows, 16 studies scanned): `C:/pg/pcc/.lattice/audit-19-tr-adverse-mi-ma.json`
- Per-rule organ-match + finding-match cross-check ran in this audit (see §3.2 derivation)
- Engine code under audit: `C:/pg/pcc/backend/generator/subject_syndromes.py:36-260` (HISTOPATH_RULES) and `:274-287` (`_finding_matches` token-overlap matcher)
