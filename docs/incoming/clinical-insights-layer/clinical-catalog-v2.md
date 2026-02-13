## **clinical-catalog-v2**

## **1\) Clinical catalog entries (10–15)**

* **id:** C01  
   **finding/organ pair:** Testis — atrophy/degeneration (organ\_system fallback: Male reproductive system)  
   **clinical\_class:** Sentinel  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 1, min\_incidence\_treated: 0.0, min\_severity\_grade: 1}  
   **corroboration (optional):** anyOf: \[Epididymis—hypospermia/oligospermia, Seminiferous tubule degeneration, Decreased testis weight, Sperm parameters abnormal, Accessory sex gland atrophy\]  
   **rationale:** Male gonadal atrophy/degeneration is a high-regulatory-weight adverse signal; often treatment-related even at low incidence.  
   **notes:** Raise min\_severity\_grade to 2 for strains with common mild tubular vacuolation; lower threshold for fertility studies, juvenile tox, or when correlated with organ weight.

* **id:** C02  
   **finding/organ pair:** Ovary — atrophy/follicular depletion (organ\_system fallback: Female reproductive system)  
   **clinical\_class:** Sentinel  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 1, min\_incidence\_treated: 0.0, min\_severity\_grade: 1}  
   **corroboration (optional):** anyOf: \[Uterus—atrophy, Estrous cycle disruption, Decreased ovary weight, Reduced corpora lutea, Vaginal cytology changes\]  
   **rationale:** Ovarian atrophy/depletion is a sentinel reproductive toxicity endpoint with direct adversity implications.  
   **notes:** Background age-related follicle loss requires age-matched interpretation; strengthen corroboration requirement in aged animals or long studies.

* **id:** C03  
   **finding/organ pair:** Uterus — atrophy (organ\_system fallback: Female reproductive system)  
   **clinical\_class:** HighConcern  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 2, min\_incidence\_treated: 0.10, min\_severity\_grade: 1}  
   **corroboration (optional):** anyOf: \[Ovary—atrophy, Vaginal cytology changes, Hormone-related findings, Decreased uterus weight\]  
   **rationale:** Uterine atrophy is often hormonally mediated; can be adaptive but becomes adverse when dose-related and/or accompanied by ovarian/estrous changes.  
   **notes:** In short studies, require corroboration; in endocrine-active test articles, lower min\_n\_affected to 1 if consistent across related endpoints.

* **id:** C04  
   **finding/organ pair:** Any organ — malignant neoplasm (organ\_system fallback: Neoplasia)  
   **clinical\_class:** Sentinel  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 1, min\_incidence\_treated: 0.0, min\_severity\_grade: 1}  
   **corroboration (optional):** anyOf: \[Preneoplastic lesion in same organ, Increased benign neoplasms in same lineage, Dose-related hyperplasia/dysplasia\]  
   **rationale:** A single malignant neoplasm can be reportable and high impact; treat as adverse unless clearly spontaneous with strong historical control context.  
   **notes:** Require careful historical control alignment (strain/site/age); do not “average out” via statistics—flag for pathologist review and narrative consistency.

* **id:** C05  
   **finding/organ pair:** Bone marrow — hypocellularity/aplasia (organ\_system fallback: Hematopoietic system)  
   **clinical\_class:** Sentinel  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 1, min\_incidence\_treated: 0.0, min\_severity\_grade: 2}  
   **corroboration (optional):** anyOf: \[CBC—pancytopenia, Reticulocytes decreased, Thymus atrophy, Spleen—lymphoid depletion\]  
   **rationale:** Myelosuppression/aplasia is a core adverse tox signal; severity drives immediate regulatory concern.  
   **notes:** If only grade 1 and no CBC support, downgrade confidence; in rodents, require alignment with systemic stress signals vs sampling artifact.

* **id:** C06  
   **finding/organ pair:** Liver — necrosis (single cell/focal/multifocal) (organ\_system fallback: Hepatobiliary system)  
   **clinical\_class:** HighConcern  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 2, min\_incidence\_treated: 0.10, min\_severity\_grade: 2}  
   **corroboration (optional):** anyOf: \[ALT/AST increased, Hepatocellular degeneration, Inflammation, Bile duct hyperplasia/cholestasis\]  
   **rationale:** Hepatic necrosis/degeneration with dose relationship and/or enzyme support is typically adverse.  
   **notes:** For minimal focal necrosis common in some strains, require corroboration; for centrilobular necrosis with enzymes, lower thresholds.

* **id:** C07  
   **finding/organ pair:** Kidney — tubular necrosis/degeneration (organ\_system fallback: Renal/urinary system)  
   **clinical\_class:** HighConcern  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 2, min\_incidence\_treated: 0.10, min\_severity\_grade: 2}  
   **corroboration (optional):** anyOf: \[BUN/Creatinine increased, Urinalysis—casts/protein, Tubular basophilia/regeneration, Papillary necrosis\]  
   **rationale:** Tubular injury is a standard adverse tox driver when dose-related and supported by clinical pathology.  
   **notes:** Male rat hyaline droplet nephropathy context can confound—require pattern \+ lesion constellation.

* **id:** C08  
   **finding/organ pair:** Brain/spinal cord/peripheral nerve — neuronal necrosis/axonal degeneration (organ\_system fallback: Nervous system)  
   **clinical\_class:** Sentinel  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 1, min\_incidence\_treated: 0.0, min\_severity\_grade: 2}  
   **corroboration (optional):** anyOf: \[Clinical signs—tremor/ataxia, Neurobehavioral change, Gliosis, Peripheral nerve degeneration, Schwann cell changes\]  
   **rationale:** Structural neurotox injury is high-weight and generally adverse even at low incidence.  
   **notes:** If only minimal change without functional correlate, keep adverse elevation but mark confidence medium pending corroboration.

* **id:** C09  
   **finding/organ pair:** Heart — myocardial necrosis/degeneration (organ\_system fallback: Cardiovascular system)  
   **clinical\_class:** HighConcern  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 2, min\_incidence\_treated: 0.10, min\_severity\_grade: 2}  
   **corroboration (optional):** anyOf: \[Troponin increased, Inflammation/fibrosis, ECG changes, Clinical signs\]  
   **rationale:** Myocardial injury is typically adverse; severity and biomarkers strengthen causal interpretation.  
   **notes:** Some rodent strains have background cardiomyopathy—require dose relationship and/or biomarker support.

* **id:** C10  
   **finding/organ pair:** Lung — diffuse alveolar damage/hemorrhage (organ\_system fallback: Respiratory system)  
   **clinical\_class:** HighConcern  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 2, min\_incidence\_treated: 0.10, min\_severity\_grade: 2}  
   **corroboration (optional):** anyOf: \[Inflammation, Edema, Clinical signs—dyspnea, BAL changes, Increased lung weight\]  
   **rationale:** Acute lung injury patterns have clear adversity implications when dose-related.  
   **notes:** Aspiration artifacts require pathologist context; require distribution pattern consistency (treatment-related vs procedural).

* **id:** C11  
   **finding/organ pair:** GI tract — ulceration/perforation (organ\_system fallback: Gastrointestinal system)  
   **clinical\_class:** Sentinel  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 1, min\_incidence\_treated: 0.0, min\_severity\_grade: 2}  
   **corroboration (optional):** anyOf: \[Anemia, Melena, Inflammation, Decreased body weight/food, Clinical signs\]  
   **rationale:** Ulceration/perforation is inherently adverse and can drive morbidity/mortality interpretation.  
   **notes:** For minimal erosion, downgrade to HighConcern and require ≥2 affected \+ clinical correlate.

* **id:** C12  
   **finding/organ pair:** Immune organs — lymphoid depletion (thymus/spleen/LN) (organ\_system fallback: Immune system)  
   **clinical\_class:** ModerateConcern  
   **elevate\_to:** Adverse  
   **threshold\_overrides:** {min\_n\_affected: 3, min\_incidence\_treated: 0.20, min\_severity\_grade: 2}  
   **corroboration (optional):** anyOf: \[Leukocytes decreased, Stress markers, Bone marrow hypocellularity, Infection-related findings\]  
   **rationale:** Lymphoid depletion may be stress-related or immunotoxic; becomes adverse when consistent, dose-related, and moderate+ severity.  
   **notes:** In short-term studies or high stress contexts, require corroboration; in immunotoxicity-focused studies, lower thresholds.

---

## **2\) Protective plausibility exclusions**

* **id:** PEX01  
   **excluded\_organ\_systems:** \[Male reproductive system, Female reproductive system\]  
   **rationale:** “Protective” labeling is generally inappropriate for reproductive organs; reduced lesions/incidence can reflect endocrine suppression, stage-shifts, sampling, or background variability rather than true benefit.  
   **recommended\_engine\_behavior:** Never elevate to Protective; at most downgrade adverse narrative to “No evidence of treatment-related worsening” with confidence gating and require corroboration (weights, cycle data) before any positive framing.

* **id:** PEX02  
   **excluded\_findings:** \[Any neoplasm (benign or malignant), preneoplastic lesions\]  
   **rationale:** Decreased tumor incidence is rarely interpretable as protective in standard tox studies (insufficient power, competing risks, survival bias).  
   **recommended\_engine\_behavior:** Disallow Protective; output “lower incidence observed” as Informational only, require survival-adjusted context and historical controls to discuss.

* **id:** PEX03  
   **exclusion\_conditions:** {control\_incidence \< 0.10}  
   **rationale:** When baseline is low, decreases are not meaningful; small absolute differences create misleading relative effects.  
   **recommended\_engine\_behavior:** Block Protective; downgrade to Informational; require minimum absolute difference (e.g., ≥2 animals) AND monotonic decrease AND plausible mechanism to even mention.

* **id:** PEX04  
   **excluded\_findings:** \[Any sentinel lesion from catalog C01–C11\]  
   **rationale:** Sentinel lesions should not generate “protective” interpretations from inverse patterns; these endpoints are primarily assessed for harm.  
   **recommended\_engine\_behavior:** If incidence decreases, emit neutral statement only (Trend/Informational), and ensure it cannot co-exist with an “Adverse” label for the same finding\_key in the same scope.

* **id:** PEX05  
   **exclusion\_conditions:** {direction: "decrease", n\_affected\_treated \<= 1}  
   **rationale:** Single-animal decreases are usually noise or coding artifacts; “protective” is over-claiming.  
   **recommended\_engine\_behavior:** Force Informational; require ≥2 animals and ≥10% absolute incidence difference plus monotonic decrease before any non-neutral language.

* **id:** PEX06  
   **excluded\_organ\_systems:** \[Hematopoietic system, Immune system\]  
   **rationale:** Apparent “improvements” can reflect immunosuppression, marrow effects, stress physiology, or regression-to-mean rather than benefit.  
   **recommended\_engine\_behavior:** Do not label Protective; allow “lower incidence vs control” only with strong corroboration and absence of any immunotoxicity markers.

* **id:** PEX07  
   **exclusion\_conditions:** {pattern: "non-monotonic decrease" AND (no Tier1 significance) AND (no corroboration)}  
   **rationale:** Non-monotonic decreases are especially prone to false-positive “benefit” narratives.  
   **recommended\_engine\_behavior:** Downgrade to Informational; require monotonic decrease OR clear threshold pattern plus corroboration.

---

## **3\) Confidence threshold tuning**

### **Keep / Adjust (with proposed thresholds)**

* **Low confidence:** **Adjust**  
   **Proposed adjusted thresholds:**

  * Low if **(n\_affected ≤ 1\)** *and* not Sentinel **OR** evidence is effect-size-only with **(n\_affected \< guard\_R10(n\_group))** **OR** control incidence \< 10% for *decrease* narratives **OR** non-monotonic without Tier1 significance/corroboration.

  * Add rule: if direction \== “decrease”, default Low unless (baseline ≥20% AND ≥2-animal absolute drop AND monotonic).

* **Medium confidence:** **Adjust (tighten slightly)**  
   **Proposed adjusted thresholds:**

  * Medium if **(n\_affected ≥ 2\)** and **(incidence\_treated ≥ 10%)** and at least **one** of: (Tier1 significance OR monotonic/threshold pattern OR corroboration across domains).

  * If only “pattern” without stats and without corroboration, keep at Medium **only** when effect size is large *and* R10 guard satisfied.

* **High confidence:** **Adjust (require both consistency \+ support)**  
   **Proposed adjusted thresholds:**

  * High if **(n\_affected ≥ 3\)** and **(incidence\_treated ≥ 20%)** and **(monotonic/threshold)** and at least **one** of: (Tier1 significance OR cross-domain corroboration).

  * Exception: Sentinel catalog entries may be High with n\_affected=1 **only** when severity is moderate+ and corroborated (or clearly specific pathology pattern).

### **Specific pitfalls for common group sizes**

* **n=10/group:**

  * One animal \= 10% incidence: looks “meets 10%” but is still single-animal noise → must remain Low unless Sentinel exception.

  * Two animals \= 20%: can inflate “High” if not guarded; require monotonic \+ corroboration/Tier1.

* **n=15/group:**

  * One animal \= 6.7%: below 10% guard (good), but effect-size metrics can still spike → enforce R10 guard tied to n.

  * Two animals \= 13.3%: often borderline; keep Medium unless strong pattern \+ corroboration.

### **Example scenarios → confidence result (at least 6\)**

| Scenario | Key inputs (illustrative) | Result |
| ----- | ----- | ----- |
| S1 Sentinel: testis atrophy grade 3 in 1 animal at high dose | Sentinel=C01, n\_group=10, n\_affected=1, incidence=10%, severity=3, corroboration: ↓testis weight | **High** (Sentinel exception: severity+corroboration) |
| S2 Non-sentinel enzyme shift with n=1 | ALT ↑, n\_group=10, n\_affected=1, effect-size-only, no trend p | **Low** |
| S3 Kidney tubular necrosis in 2/10 with monotonic trend | C07, n\_affected=2, incidence=20%, trend\_p sig, UA casts | **High** |
| S4 Decrease narrative with low baseline | Control 1/15 (6.7%), treated 0/15, direction=decrease | **Low** (PEX03) |
| S5 Non-monotonic finding without Tier1 support | 1/10, 0/10, 2/10 across doses; no p/trend; no corroboration | **Low** |
| S6 Moderate lymphoid depletion 3/15, grade 2, corroborated by ↓WBC | C12, n\_affected=3, incidence=20%, corroboration present, pattern threshold | **High** |
| S7 Trend significant but narrative “inconsistent” risk | trend\_p sig, but mid-dose higher than high-dose; corroboration absent | **Medium** (keep trend, suppress “inconsistent” contradiction; require qualifier) |

---

## **4\) R10 minimum support thresholds (confirm/adjust)**

**Confirm / Adjust:** **Adjust (make it group-size adaptive and direction-aware)**

**Recommended rule (adaptive formula):**  
 Let `n = n_group`, `k = n_affected_treated`, `p = k/n`. For effect-size-driven triggers (e.g., Cohen’s d):

* **Support guard:** `k >= max(2, ceil(0.10 * n))`

* **Incidence guard:** `p >= max(0.10, 2/n)`

* **Plus:** if direction \== “decrease”, also require `control_incidence >= 0.20` to avoid “protective” over-interpretation.

**Sentinel exception policy:**

* If finding matches **Clinical catalog Sentinel** (C01, C02, C04, C05, C08, C11): allow **k \= 1** *only if* `severity_grade >= 2` **AND** at least one corroboration signal exists **OR** the lesion is inherently unambiguous (e.g., malignant neoplasm). Otherwise apply standard guard.

**Examples**

* **group\_size \= 10:**

  * `max(2, ceil(0.10*10)) = max(2,1)=2` → need **k ≥ 2** (unless Sentinel exception)

  * `max(0.10, 2/10)=max(0.10,0.20)=0.20` → need **≥20% incidence** (2/10)  
     **Effect:** blocks k=1 alarms cleanly.

* **group\_size \= 15:**

  * `max(2, ceil(0.10*15)) = max(2,2)=2` → need **k ≥ 2**

  * `max(0.10, 2/15)=max(0.10,0.133)=0.133` → need **≥13.3% incidence** (2/15)  
     **Effect:** still blocks k=1; allows modestly powered 2/15 effects.

---

### **Optional unit tests (5–8)**

1. **No duplicates:** Same finding\_key hits “Adverse” via C07 and also hits “Trend” via Rxx → output must be **single consolidated insight** with label=Adverse and a nested “supporting evidence: trend” (not a second card).

2. **Contradiction suppression:** trend\_p significant \+ non-monotonic flag → insight must not state “inconsistent”; it must say “dose-related trend observed; minor non-monotonicity noted” and confidence capped at Medium unless corroborated.

3. **R10 guard:** n\_group=10, k=1, Cohen’s d large → must **not** escalate; confidence Low unless Sentinel exception applies.

4. **Sentinel exception works:** C01 testis atrophy grade 3, n\_group=10, k=1, corroboration present → confidence High and elevate\_to=Adverse.

5. **Protective exclusion (repro):** uterus atrophy incidence decreases vs control → must **not** label Protective; must output neutral/informational per PEX01.

6. **Low baseline protective block:** control 1/15, treated 0/15 for any lesion → Protective disallowed; Informational only (PEX03).

7. **Neoplasia protective block:** benign tumor incidence decreases → Protective disallowed (PEX02), even if p-value suggests decrease.

