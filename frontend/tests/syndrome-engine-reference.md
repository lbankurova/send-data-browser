# Syndrome Engine Reference

**Generated:** 2026-04-15  
**Source:** Live code extraction via `generate-engine-reference.test.ts`  
**Syndromes:** 33  
**Magnitude floor classes:** 14 + 3 organ weight subclasses  
**Directional gates:** 9 syndromes gated  
**Discriminator sets:** 8  

---

## 1. Syndrome Definitions

### XS01: Hepatocellular injury

- **SOC:** hepatobiliary disorders
- **Required logic:** ANY of 2 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | ALT | LB | ↑ | ALT/ALAT | ALT ↑ |
| **R** | AST | LB | ↑ | AST/ASAT | AST ↑ |
| S | SDH | LB | ↑ | SDH | SDH ↑ |
| S | GLDH | LB | ↑ | GLDH/GDH | GLDH ↑ |
| S |  | LB | ↑ | BILI/TBILI | BILI ↑ |
| S |  | OM | ↕ | OM:liver | Liver weight |
| S |  | MI | ↕ | liver|hepat — necrosis|apoptosis|degeneration|single cell necrosis|hepatocellular necrosis | Liver necrosis |
| S |  | MI | ↕ | liver|hepat — hypertrophy|hepatocellular hypertrophy|centrilobular hypertrophy | Liver hypertrophy |

**Discriminating evidence:**
- Differential: XS02 (Cholestatic injury)
- ALP ↓ [LB, strong] — ALP within normal limits supports pure hepatocellular injury. ALP elevation indicates cholestatic component. (absence meaningful)
- GGT ↓ [LB, moderate] — GGT within normal limits supports hepatocellular. GGT elevation is a sensitive cholestatic marker. (absence meaningful)
- LIVER::NECROSIS ↑ [MI, strong] — Hepatocyte necrosis confirms cellular injury consistent with hepatocellular pattern.
- LIVER::BILE DUCT HYPERPLASIA ↓ [MI, strong] — Absence of bile duct changes supports pure hepatocellular. Bile duct hyperplasia indicates cholestatic component.

**Expected clinical observations:**
- Tier 2: JAUNDICE
- Tier 3: DARK URINE

---

### XS02: Hepatobiliary / Cholestatic

- **SOC:** hepatobiliary disorders
- **Required logic:** COMPOUND: ALP AND (GGT OR 5NT)
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | ALP | LB | ↑ | ALP/ALKP | ALP ↑ |
| **R** | GGT | LB | ↑ | GGT | GGT ↑ |
| **R** | 5NT | LB | ↑ | 5NT | 5NT ↑ |
| S |  | LB | ↑ | BILI/TBILI | BILI ↑ |
| S |  | LB | ↑ | CHOL | CHOL ↑ |
| S | LIVER_WT | OM | ↑ | OM:liver | Liver weight ↑ |
| S |  | MI | ↕ | liver|hepat — bile duct hyperplasia|cholangitis|bile duct proliferation|bile plugs|cholestasis|bile duct | Liver bile duct hyperplasia |

**Discriminating evidence:**
- Differential: XS01 (Hepatocellular injury)
- ALP ↑ [LB, strong] — ALP elevation is the primary cholestatic marker. (absence meaningful)
- GGT ↑ [LB, strong] — GGT elevation confirms biliary involvement. (absence meaningful)
- LIVER::BILE DUCT HYPERPLASIA ↑ [MI, strong] — Bile duct hyperplasia is the histopathologic hallmark of cholestasis.
- LIVER::NECROSIS ↓ [MI, moderate] — Absence of significant hepatocyte necrosis supports pure cholestatic pattern.
- TBILI ↑ [LB, moderate] — Elevated bilirubin (especially conjugated fraction) supports cholestasis.

---

### XS03: Nephrotoxicity

- **SOC:** renal and urinary disorders
- **Required logic:** COMPOUND: ANY((CREAT AND BUN), (CREAT AND KIDNEY_WT), (CREAT AND URINE_SG), (CREAT AND MI_KIDNEY))
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | CREAT | LB | ↑ | CREAT/CREA | CREAT ↑ |
| **R** | BUN | LB | ↑ | BUN/UREA | BUN ↑ |
| S | KIDNEY_WT | OM | ↕ | OM:kidney | Kidney weight |
| S | URINE_SG | LB | ↓ | SPGRAV/SG/UOSMO | SPGRAV ↓ |
| S | MI_KIDNEY | MI | ↕ | kidney — tubular degeneration|tubular necrosis|tubular basophilia|tubular dilatation|cast|casts|mineralization|regeneration|papillary necrosis | Kidney tubular degeneration |
| S | UPROT | LB | ↑ | UPROT/UTP | UPROT ↑ |
| S | UGLUC | LB | ↑ | UGLUC/UGLU | UGLUC ↑ |

**Discriminating evidence:**
- Differential: pre-renal azotemia
- KIDNEY::TUBULAR DEGENERATION ↑ [MI, strong] — Tubular degeneration/necrosis confirms intrinsic renal injury.
- KIDNEY::CAST ↑ [MI, moderate] — Tubular casts indicate active tubular damage and protein leakage.
- KIDNEY_WT ↑ [OM, moderate] — Increased kidney weight suggests inflammation or compensatory hypertrophy.
- URINE_SG ↓ [LB, moderate] — Decreased urine specific gravity indicates loss of concentrating ability — tubular dysfunction.

**Expected clinical observations:**
- Tier 3: POLYURIA
- Tier 3: POLYDIPSIA

---

### XS04: Myelosuppression

- **SOC:** blood and lymphatic system disorders
- **Required logic:** COMPOUND: ANY(NEUT, PLAT, (RBC AND HGB))
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | NEUT | LB | ↓ | NEUT/ANC/HET/HETERO | NEUT ↓ |
| **R** | PLAT | LB | ↓ | PLAT/PLT | PLAT ↓ |
| **R** | RBC | LB | ↓ | RBC | RBC ↓ |
| **R** | HGB | LB | ↓ | HGB/HB | HGB ↓ |
| S |  | MI | ↕ | bone marrow — hypocellularity|hypocellular|decreased cellularity|aplasia|hypoplasia|atrophy | Bone marrow hypocellularity |
| S | RETIC | LB | ↓ | RETIC/RET | RETIC ↓ |
| S |  | MI | ↕ | spleen — atrophy|decreased extramedullary|hypoplasia|lymphoid depletion | Spleen atrophy |
| S | SPLEEN_WT | OM | ↓ | OM:spleen | Spleen weight ↓ |
| S | MCV | LB | ↕ | MCV | MCV |
| S | MCHC | LB | ↕ | MCHC | MCHC |

**Directional gates:**
- RETIC expected ↓ → action: `reject` (override: MI_MARROW_HYPOCELLULARITY)

**Discriminating evidence:**
- Differential: XS05 (Hemolytic anemia)
- RETIC ↓ [LB, strong] — Reticulocyte decrease indicates marrow failure to compensate. Increase indicates peripheral destruction with compensatory erythropoiesis.
- BONE MARROW::HYPOCELLULARITY ↑ [MI, strong] — Hypocellular marrow confirms production failure. Hypercellular marrow argues against (compensatory response).
- SPLEEN_WT ↓ [OM, moderate] — Decreased spleen weight is consistent with reduced hematopoiesis. Increased spleen weight suggests extramedullary hematopoiesis or sequestration.
- SPLEEN::EXTRAMEDULLARY HEMATOPOIESIS ↓ [MI, moderate] — Absence of extramedullary hematopoiesis supports marrow failure. Presence supports peripheral destruction with compensatory production.

**Expected clinical observations:**
- Tier 2: PALLOR
- Tier 3: PETECHIAE

---

### XS05: Hemolytic anemia

- **SOC:** blood and lymphatic system disorders
- **Required logic:** ALL 2 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | RBC | LB | ↓ | RBC | RBC ↓ |
| **R** | RETIC | LB | ↑ | RETIC/RET | RETIC ↑ |
| S |  | LB | ↑ | BILI/TBILI | BILI ↑ |
| S | SPLEEN_WT | OM | ↑ | OM:spleen | Spleen weight ↑ |
| S |  | MI | ↕ | spleen — extramedullary hematopoiesis|increased hematopoiesis|congestion | Spleen extramedullary hematopoiesis |
| S |  | MI | ↕ | spleen — pigmentation|hemosiderin|hemosiderosis | Spleen pigmentation |
| S |  | LB | ↓ | HAPTO/HPT | HAPTO ↓ |
| S | MCV | LB | ↑ | MCV | MCV ↑ |

**Directional gates:**
- SPLEEN_WT expected ↑ → action: `weak_against`

**Discriminating evidence:**
- Differential: XS04 (Myelosuppression)
- RETIC ↑ [LB, strong] — Reticulocyte increase confirms compensatory erythropoiesis in response to peripheral red cell destruction.
- BONE MARROW::HYPERCELLULARITY ↑ [MI, strong] — Hypercellular marrow confirms compensatory expansion. Erythroid hyperplasia specifically points to hemolytic response.
- SPLEEN_WT ↑ [OM, moderate] — Splenomegaly suggests splenic sequestration or extramedullary hematopoiesis — both support hemolytic process.
- SPLEEN::PIGMENTATION ↑ [MI, moderate] — Splenic pigmentation (hemosiderin) indicates iron deposition from destroyed red cells.
- TBILI ↑ [LB, moderate] — Elevated bilirubin from hemoglobin catabolism. Unconjugated fraction specifically indicates hemolysis.

**Expected clinical observations:**
- Tier 2: PALLOR
- Tier 3: DARK URINE

---

### XS06: Phospholipidosis

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | PHOS | LB | ↑ | PL/PLIPID/PHOSLPD | PL ↑ |
| S |  | MI | ↕ | * — foamy macrophage|foamy macrophages|vacuolation|lamellar bodies|phospholipidosis | Any foamy macrophage |
| S |  | OM | ↑ | OM:liver|lung|kidney|spleen | Liver weight ↑ |

**Discriminating evidence:**
- Differential: simple lipidosis
- PHOSPHOLIPID ↑ [LB, strong] — Elevated serum phospholipids are the biochemical hallmark.
- ::LAMELLAR BODIES ↑ [MI, strong] — Lamellar bodies on electron microscopy are pathognomonic. Standard light microscopy shows foamy macrophages.

---

### XS07: Immunotoxicity

- **SOC:** immune system disorders
- **Required logic:** ANY of 3 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | WBC | LB | ↓ | WBC | WBC ↓ |
| **R** | LYMPH | LB | ↓ | LYMPH/LYM | LYMPH ↓ |
| **R** | THYMUS_WT | OM | ↓ | OM:thymus | Thymus weight ↓ |
| S | SPLEEN_WT | OM | ↓ | OM:spleen | Spleen weight ↓ |
| S |  | MI | ↕ | spleen|thymus|lymph node — lymphoid depletion|atrophy|decreased cellularity|lymphocytolysis|necrosis|apoptosis | Spleen lymphoid depletion |

**Directional gates:**
- LYMPH expected ↓ → action: `strong_against`

---

### XS08: Stress response

- **SOC:** unmapped
- **Required logic:** COMPOUND: ADRENAL_WT AND (BW OR THYMUS_WT OR LYMPH)
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | ADRENAL_WT | OM | ↑ | OM:adrenal | Adrenal weight ↑ |
| **R** | THYMUS_WT | OM | ↓ | OM:thymus | Thymus weight ↓ |
| **R** | LYMPH | LB | ↓ | LYMPH/LYM | LYMPH ↓ |
| **R** | BW | BW | ↓ | body weight | Body Weight ↓ |
| S |  | LB | ↑ | CORT | CORT ↑ |

**Directional gates:**
- LYMPH expected ↓ → action: `weak_against`
- ADRENAL_WT expected ↑ → action: `weak_against`
- THYMUS_WT expected ↓ → action: `weak_against`

**Discriminating evidence:**
- Differential: direct adrenal toxicity
- GLAND, ADRENAL::HYPERTROPHY ↑ [MI, strong] — Adrenal cortical hypertrophy is the classic stress response finding. Adrenal necrosis or atrophy would suggest direct toxicity instead.
- THYMUS_WT ↓ [OM, moderate] — Thymic involution (weight decrease) is a sensitive stress marker. Supports HPA axis activation rather than direct immune toxicity.

**Expected clinical observations:**
- Tier 3: PILOERECTION
- Tier 3: DECREASED ACTIVITY
- Tier 2: CHROMODACRYORRHEA

---

### XS09: Target organ wasting

- **SOC:** metabolism and nutrition disorders
- **Required logic:** ANY of 1 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | BW | BW | ↓ | body weight | Body Weight ↓ |
| S |  | BW | ↓ | food consumption/food intake | Food Consumption ↓ |
| S | OM_WT | OM | ↓ | OM:* | Organ weight ↓ |
| S |  | MI | ↕ | * — atrophy|wasting|decreased size | Any atrophy |

**Directional gates:**
- OM_WT expected ↓ → action: `weak_against`

**Expected clinical observations:**
- Tier 2: EMACIATION
- Tier 3: THIN
- Tier 3: DECREASED ACTIVITY
- Tier 3: HUNCHED POSTURE

---

### XS10: Cardiovascular

- **SOC:** cardiac disorders
- **Required logic:** ANY of 4 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | QTC | EG | ↕ | QTCBAG/QTCFAG/QTCVAG/QTCAG | QTCBAG |
| **R** | PR | EG | ↕ | PRAG | PRAG |
| **R** | RR | EG | ↕ | RRAG | RRAG |
| **R** | HR | VS | ↕ | HR | HR |
| S |  | OM | ↑ | OM:heart | Heart weight ↑ |
| S |  | MI | ↕ | heart — cardiomyopathy|myocyte degeneration|necrosis|myocardial degeneration|fibrosis|vacuolation|myocardial necrosis|inflammation | Heart cardiomyopathy |
| S |  | LB | ↑ | CTNI/CTNT/TNNI/TNNT | CTNI ↑ |
| S | BP | CV | ↕ | SYSBP/DIABP/MAP | SYSBP |
| S | CV_HR | CV | ↕ | HR | HR |

**Discriminating evidence:**
- Differential: functional (rate change) vs structural cardiovascular toxicity
- QTCBAG ↑ [EG, strong] — QTc prolongation indicates repolarization delay — a direct proarrhythmic risk independent of rate changes.
- HEART::CARDIOMYOPATHY ↑ [MI, strong] — Cardiomyopathy confirms structural myocardial damage beyond functional rate changes.
- HEART_WT ↑ [OM, moderate] — Increased heart weight suggests cardiac hypertrophy — a structural adaptation or pathological response.
- CTNI ↑ [LB, strong] — Elevated cardiac troponin confirms active myocardial injury. Absence supports functional change without structural damage. (absence meaningful)

**Expected clinical observations:**
- Tier 2: BRADYCARDIA
- Tier 2: TACHYCARDIA
- Tier 2: ARRHYTHMIA
- Tier 3: DYSPNEA

---

### XC01a: BM Myeloid Suppression

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | NEUT | LB | ↓ | NEUT/ANC | NEUT ↓ |
| S |  | LB | ↓ | WBC | WBC ↓ |
| S |  | MI | ↕ | bone marrow — decreased cellularity|hypocellularity|aplasia|hypoplasia|myeloid depletion|granulocytic hypoplasia | Bone marrow decreased cellularity |
| S |  | OM | ↓ | OM:spleen | Spleen weight ↓ |

---

### XC01b: BM Erythroid Suppression

- **SOC:** unmapped
- **Required logic:** COMPOUND: RBC AND HGB AND RETIC
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | RBC | LB | ↓ | RBC | RBC ↓ |
| **R** | HGB | LB | ↓ | HGB/HB | HGB ↓ |
| **R** | RETIC | LB | ↓ | RETIC/RET/RETI | RETIC ↓ |
| S |  | LB | ↓ | HCT | HCT ↓ |
| S |  | MI | ↕ | bone marrow — decreased cellularity|hypocellularity|erythroid hypoplasia|erythroid depletion | Bone marrow decreased cellularity |
| S |  | OM | ↕ | OM:spleen | Spleen weight |
| S |  | CL | ↕ | pallor/hypoactivity/decreased activity/tachypnea | Pallor |

**Directional gates:**
- RETIC expected ↓ → action: `reject` (override: MI_MARROW_HYPOCELLULARITY)

---

### XC01c: BM Megakaryocyte Suppression

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | PLAT | LB | ↓ | PLAT/PLT | PLAT ↓ |
| S |  | MI | ↕ | bone marrow — decreased cellularity|megakaryocyte decreased|megakaryocytic hypoplasia | Bone marrow decreased cellularity |
| S |  | CL | ↕ | petechiae/ecchymoses/hemorrhage | Petechiae |

---

### XC02: Hemolytic Anemia Multi-Organ

- **SOC:** unmapped
- **Required logic:** ALL 3 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | RBC | LB | ↓ | RBC | RBC ↓ |
| **R** | RETIC | LB | ↑ | RETIC/RET/RETI | RETIC ↑ |
| **R** | TBILI | LB | ↑ | BILI/TBILI | BILI ↑ |
| S |  | LB | ↑ | MCV | MCV ↑ |
| S |  | LB | ↑ | LDH | LDH ↑ |
| S |  | LB | ↓ | HAPTO/HPT | HAPTO ↓ |
| S |  | MI | ↕ | spleen — extramedullary hematopoiesis|congestion|hemosiderosis|hemosiderin|pigmentation | Spleen extramedullary hematopoiesis |
| S |  | MI | ↕ | bone marrow — erythroid hyperplasia|increased cellularity | Bone marrow erythroid hyperplasia |
| S |  | MI | ↕ | liver|hepat — hemosiderosis|hemosiderin|pigmentation | Liver hemosiderosis |
| S |  | MI | ↕ | kidney — hemosiderin|pigmentation|hemosiderosis | Kidney hemosiderin |
| S | SPLEEN_WT | OM | ↑ | OM:spleen | Spleen weight ↑ |
| S |  | CL | ↕ | pallor/dark urine/decreased activity/hypoactivity/icterus | Pallor |

**Directional gates:**
- RETIC expected ↑ → action: `reject`
- SPLEEN_WT expected ↑ → action: `weak_against`

---

### XC03a: Thyroid FCHH (Enzyme Induction)

- **SOC:** unmapped
- **Required logic:** ALL 2 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | T4 | LB | ↓ | T4/THYROX | T4 ↓ |
| **R** | TSH | LB | ↑ | TSH | TSH ↑ |
| S |  | MI | ↕ | thyroid — hypertrophy, follicular cell|follicular cell hypertrophy|hyperplasia, follicular cell|follicular cell hyperplasia|colloid alteration|colloid depletion | Thyroid hypertrophy, follicular cell |
| S | LIVER_HYPERTROPHY | MI | ↕ | liver|hepat — hypertrophy|hepatocellular hypertrophy|centrilobular hypertrophy | Liver hypertrophy |
| S |  | OM | ↑ | OM:thyroid | Thyroid weight ↑ |
| S | LIVER_WT | OM | ↑ | OM:liver | Liver weight ↑ |

---

### XC03b: Thyroid FCHH (Direct)

- **SOC:** unmapped
- **Required logic:** ALL 2 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | T4 | LB | ↓ | T4/THYROX | T4 ↓ |
| **R** | TSH | LB | ↑ | TSH | TSH ↑ |
| S |  | MI | ↕ | thyroid — hypertrophy, follicular cell|follicular cell hypertrophy|hyperplasia, follicular cell|follicular cell hyperplasia|colloid alteration|colloid depletion | Thyroid hypertrophy, follicular cell |
| S |  | OM | ↑ | OM:thyroid | Thyroid weight ↑ |

---

### XC04a: Adrenal Cortical Hypertrophy (Stress)

- **SOC:** unmapped
- **Required logic:** COMPOUND: ADRENAL_MI AND (ADRENAL_WT OR THYMUS_WT OR BW)
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | ADRENAL_MI | MI | ↕ | adrenal — cortical hypertrophy|hypertrophy, cortical|hypertrophy, zona fasciculata | Adrenal cortical hypertrophy |
| **R** | ADRENAL_WT | OM | ↑ | OM:adrenal | Adrenal weight ↑ |
| **R** | THYMUS_WT | OM | ↓ | OM:thymus | Thymus weight ↓ |
| S |  | LB | ↓ | LYMPH/LYM | LYMPH ↓ |
| S |  | LB | ↑ | NEUT/ANC | NEUT ↑ |
| S |  | LB | ↑ | CORT/CORTCST | CORT ↑ |
| **R** | BW | BW | ↓ | body weight | Body Weight ↓ |
| S |  | CL | ↕ | piloerection/decreased activity/hypoactivity | Piloerection |

**Directional gates:**
- ADRENAL_WT expected ↑ → action: `weak_against`
- THYMUS_WT expected ↓ → action: `weak_against`

---

### XC04b: Adrenal Cortical Atrophy (HPA Suppression)

- **SOC:** unmapped
- **Required logic:** ALL 2 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | ADRENAL_MI | MI | ↕ | adrenal — cortical atrophy|atrophy, cortical|atrophy, zona fasciculata | Adrenal cortical atrophy |
| **R** | ADRENAL_WT | OM | ↓ | OM:adrenal | Adrenal weight ↓ |
| S |  | LB | ↓ | ACTH | ACTH ↓ |
| S |  | LB | ↓ | CORT/CORTCST | CORT ↓ |

---

### XC04c: Adrenal Cortical Vacuolation (Steroidogenesis Block)

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | ADRENAL_MI | MI | ↕ | adrenal — vacuolation, cortical|cortical vacuolation|vacuolation, zona fasciculata | Adrenal vacuolation, cortical |
| S |  | LB | ↓ | CORT/CORTCST | CORT ↓ |
| S |  | LB | ↑ | ACTH | ACTH ↑ |
| S |  | LB | ↑ | K | K ↑ |
| S |  | LB | ↓ | SODIUM/NA | SODIUM ↓ |
| S |  | OM | ↕ | OM:adrenal | Adrenal weight |

---

### XC05: Adrenal Medullary Effects

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | ADRENAL_MED_MI | MI | ↕ | adrenal — chromaffin cell hyperplasia|hyperplasia, chromaffin cell|hyperplasia, medullary|pheochromocytoma|medullary hyperplasia | Adrenal chromaffin cell hyperplasia |
| S |  | OM | ↑ | OM:adrenal | Adrenal weight ↑ |

---

### XC06a: Testicular Germ Cell Toxicity

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | TESTIS_MI | MI | ↕ | testis|testes — tubular degeneration|degeneration, tubular|germ cell depletion|germ cell necrosis|spermatid retention|tubular atrophy|atrophy, tubular | Testis tubular degeneration |
| S | TESTIS_WT | OM | ↓ | OM:testis|testes | Testis weight ↓ |
| S |  | LB | ↓ | TESTO | TESTO ↓ |
| S |  | LB | ↑ | FSH | FSH ↑ |
| S |  | LB | ↓ | INHBB | INHBB ↓ |

**Directional gates:**
- TESTIS_WT expected ↓ → action: `weak_against`

---

### XC06b: Leydig Cell Effects

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | LEYDIG_MI | MI | ↕ | testis|testes — leydig cell atrophy|atrophy, leydig cell|leydig cell hyperplasia|hyperplasia, leydig cell|leydig cell hypertrophy|hypertrophy, leydig cell | Testis leydig cell atrophy |
| S |  | LB | ↕ | TESTO | TESTO |
| S |  | LB | ↑ | LH | LH ↑ |
| S |  | OM | ↕ | OM:testis|testes | Testis weight |

---

### XC06c: Male Accessory Sex Organ Atrophy

- **SOC:** unmapped
- **Required logic:** ANY of 3 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | ASO_MI | MI | ↕ | epididymis — atrophy|decreased weight | Epididymis atrophy |
| **R** | ASO_MI | MI | ↕ | prostate — atrophy|secretory depletion|acinar atrophy|atrophy, acinar | Prostate atrophy |
| **R** | ASO_MI | MI | ↕ | seminal vesicle — atrophy|decreased secretion | Seminal vesicle atrophy |
| S | ASO_WT | OM | ↓ | OM:prostate|epididymis|seminal vesicle | Prostate weight ↓ |
| S |  | LB | ↓ | TESTO | TESTO ↓ |

---

### XC07a: Ovarian Follicular Effects

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | OVARY_MI | MI | ↕ | ovary|ovaries — follicular atresia|atresia|primordial follicle depletion|depletion, primordial follicle|cyst, follicular|follicular cyst|corpora lutea, decreased|decreased corpora lutea | Ovary follicular atresia |
| S |  | LB | ↓ | ESTRA | ESTRA ↓ |
| S |  | LB | ↑ | FSH | FSH ↑ |
| S |  | LB | ↑ | LH | LH ↑ |
| S |  | LB | ↓ | PROG | PROG ↓ |
| S |  | OM | ↓ | OM:ovary|ovaries | Ovary weight ↓ |
| S |  | CL | ↕ | irregular cycling/prolonged diestrus/persistent estrus/persistent diestrus | Irregular Cycling |

---

### XC08a: Uterine Atrophy

- **SOC:** unmapped
- **Required logic:** ALL 2 required
- **Min domains:** 2

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | UTERUS_MI | MI | ↕ | uterus — atrophy|endometrial atrophy|atrophy, endometrial | Uterus atrophy |
| **R** | UTERUS_WT | OM | ↓ | OM:uterus | Uterus weight ↓ |
| S |  | LB | ↓ | ESTRA | ESTRA ↓ |
| S |  | CL | ↕ | prolonged diestrus/irregular cycling/persistent diestrus | Prolonged Diestrus |

---

### XC08b: Uterine Hyperplasia

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | UTERUS_MI | MI | ↕ | uterus — endometrial hyperplasia|hyperplasia, endometrial|squamous metaplasia|metaplasia, squamous | Uterus endometrial hyperplasia |
| S |  | OM | ↑ | OM:uterus | Uterus weight ↑ |
| S |  | LB | ↑ | ESTRA | ESTRA ↑ |
| S |  | CL | ↕ | persistent estrus/swollen vulva/vaginal discharge | Persistent Estrus |

---

### XC09: CNS Neuronal Degeneration

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | CNS_MI | MI | ↕ | brain — neuronal degeneration|degeneration, neuronal|necrosis, neuronal|neuronal necrosis|gliosis|edema|vacuolation, white matter|purkinje cell degeneration|degeneration, purkinje cell|necrosis, hippocampal | Brain neuronal degeneration |
| S |  | OM | ↕ | OM:brain | Brain weight |
| S |  | CL | ↕ | tremors/convulsions/seizures/ataxia/decreased activity/hypoactivity/gait abnormality/head tilt/abnormal posture | Tremors |

---

### XC10: PNS Axonal Degeneration

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | PNS_MI | MI | ↕ | peripheral nerve|sciatic nerve|nerve — axonal degeneration|degeneration, axonal|demyelination|degeneration|schwann cell hypertrophy|hypertrophy, schwann cell | Peripheral nerve axonal degeneration |
| S |  | CL | ↕ | decreased grip strength/foot splay/limb weakness/gait abnormality | Decreased Grip Strength |

---

### XC11a: Dermal Effects

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | SKIN_MI | MI | ↕ | skin — acanthosis|epidermal hyperplasia|hyperplasia, epidermal|inflammation, dermal|dermal inflammation|necrosis, dermal|ulceration|ulcer | Skin acanthosis |
| S |  | CL | ↕ | erythema/edema/desquamation/eschar/scab/alopecia | Erythema |

---

### XC11b: Injection Site Effects

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | INJ_MI | MI | ↕ | injection site — fibrosis|granuloma|inflammation|hemorrhage|necrosis | Injection site fibrosis |
| S |  | CL | ↕ | injection site erythema/injection site induration/injection site swelling/injection site mass/injection site discoloration/injection site reactions | Injection Site Erythema |

---

### XC12a: Retinal Effects

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | RETINA_MI | MI | ↕ | eye — retinal degeneration|degeneration, retinal|degeneration, rpe|retinal atrophy|atrophy, retinal | Eye retinal degeneration |
| S |  | CL | ↕ | fundoscopic abnormality/retinal pigment changes/vascular attenuation | Fundoscopic Abnormality |

---

### XC12b: Lens Effects

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | LENS_MI | MI | ↕ | eye — cataract|lens degeneration|degeneration, lens | Eye cataract |
| S |  | CL | ↕ | lens opacity/slit lamp abnormality | Lens Opacity |

---

### XC12c: Corneal Effects

- **SOC:** unmapped
- **Required logic:** ANY of 1 required
- **Min domains:** 1

| Role | Tag | Domain | Dir | Identity | Display label |
|------|-----|--------|-----|----------|---------------|
| **R** | CORNEA_MI | MI | ↕ | eye — corneal opacity|opacity, corneal|corneal edema|edema, corneal|corneal mineralization|mineralization, corneal | Eye corneal opacity |
| S |  | CL | ↕ | corneal opacity/slit lamp abnormality | Corneal Opacity |

---

## 2. Magnitude Floors (v0.2.0)

Logic: endpoint passes if `|g| ≥ minG` **OR** `|FC-1| ≥ minFcDelta`. Either criterion is sufficient.

### 2.1 Endpoint class floors

| Class | min |g| | min |FC-1| | Test codes |
|-------|---------|------------|------------|
| hematology_erythroid | 0.8 | 0.1 | RBC, HGB, HB, HCT |
| hematology_leukocyte | 0.8 | 0.15 | WBC, NEUT, ANC, LYMPH, LYM |
| hematology_leukocyte_rare | 0.8 | 0.3 | MONO, EOS, BASO |
| hematology_indices | 1 | 0.05 | MCV, MCH, MCHC, RDW |
| platelets | 0.8 | 0.15 | PLAT, PLT |
| reticulocytes | 0.8 | 0.25 | RETIC, RET, RETI |
| coagulation | 0.8 | 0.15 | PT, APTT, INR, FIB, FIBRINO |
| liver_enzymes | 0.5 | 0.5 | ALT, ALAT, AST, ASAT, ALP, ALKP, GGT, SDH, GLDH, GDH, 5NT, LDH |
| renal_markers | 0.5 | 0.2 | BUN, UREA, UREAN, CREAT, CREA |
| clinical_chemistry | 0.5 | 0.25 | GLUC, CHOL, BILI, TBILI, TRIG, ALB, GLOBUL, PROT, ALBGLOB, TP |
| electrolytes | 0.8 | 0.1 | SODIUM, NA, K, CA, PHOS, CL, MG |
| body_weight | 0.5 | 0.05 | BW, BWGAIN |
| food_consumption | 0.5 | 0.1 | FOOD, FC |
| endocrine_hormones | 0.5 | 0.3 | T4, T4FREE, T3, TSH, CORT, CORTCST, ACTH, TESTO, ESTRA, FSH, LH, PROG, INHBB |

### 2.2 Organ weight subclasses

OM domain endpoints have `testCode=WEIGHT` for all organs. Subclass determined by keyword matching on `specimen` or `endpoint_label`.

| Subclass | min |g| | min |FC-1| | Organ keywords |
|----------|---------|------------|----------------|
| General | 0.8 | 0.10 | liver, kidney, heart, spleen, lung, brain |
| Reproductive | 0.8 | 0.05 | testis, epididymis, ovary, uterus, prostate, seminal |
| Immune | 0.8 | 0.10 | thymus, adrenal |

### 2.3 Conditional overrides

**RETIC conditional override:** When checking RETIC/RET/RETI, if concordant anemia is present (≥2 of RBC/HGB/HCT ↓ each meeting erythroid floor), the RETIC floor relaxes:
- Base: minFcDelta = 0.25
- Relaxed: minFcDelta = 0.15

**Rare leukocyte concordance:** MONO/EOS/BASO must have ≥1 primary leukocyte (WBC/NEUT/ANC/LYMPH/LYM) shifting same direction with meaningful effect (p ≤ 0.05 or |g| ≥ 0.5 or |FC-1| ≥ 0.05). Without concordance, the finding is blocked even if it passes the magnitude floor.

## 3. Certainty Assessment & Caps

Certainty levels (ordered): `pattern_only` < `mechanism_uncertain` < `mechanism_confirmed`

### 3.1 Base certainty logic (assessCertainty)

1. If `requiredMet = false` → `pattern_only`
2. If strong argues_against evidence → `mechanism_uncertain`
3. If strong supporting + no strong against → `mechanism_confirmed`
4. If moderate supporting only + no against → `mechanism_confirmed`
5. If no discriminating evidence available → `mechanism_uncertain`
6. If moderate against only → `mechanism_uncertain`

### 3.2 Certainty caps (applyCertaintyCaps)

Applied in order after base certainty:

| Cap | Condition | Max certainty | Rationale |
|-----|-----------|---------------|-----------|
| Directional gate | Gate fired (REM-09) | Per gate action | Opposite-direction key term contradicts syndrome |
| Single-domain | XS04 or XS05 + 1 domain only | pattern_only | Single domain cannot confirm mechanism |
| Data sufficiency | Confirmatory domain missing | pattern_only | MI required for XS01/XS03/XS04/XS07; LB supporting for XS10 |
| Data sufficiency | Supporting domain missing | mechanism_uncertain | Missing supporting domain reduces confidence |
| Liver enzyme | XS01 + single enzyme + no MI/OM/multi-enzyme | pattern_only | Single biomarker cannot confirm hepatotoxicity (Ramaiah 2017) |

### 3.3 Data sufficiency requirements

| Syndrome | Domain | Role | Effect when missing |
|----------|--------|------|---------------------|
| XS01 | MI | confirmatory | cap at pattern_only |
| XS03 | MI | confirmatory | cap at pattern_only |
| XS04 | MI | confirmatory | cap at pattern_only |
| XS07 | MI | confirmatory | cap at pattern_only |
| XS10 | LB | supporting | cap at mechanism_uncertain |

## 4. Treatment-Relatedness Assessment (A-factors)

Six A-factors scored independently, then combined:

| Factor | Method | Weight |
|--------|--------|--------|
| A-1 Dose-response | Pattern classification + trend p-value | Primary |
| A-2 Cross-endpoint | Domain count from syndrome detection | Primary |
| A-3 HCD comparison | (Reserved — not yet implemented) | Secondary |
| A-4 Temporal onset | (Reserved — not yet implemented) | Secondary |
| A-5 Mechanism plausibility | (Reserved — not yet implemented) | Secondary |
| A-6 Statistical significance | Min p-value from matched endpoints | Primary |
| CL support | Clinical observation correlation | Modifier |

**Dose-response thresholds:**
- Strong pattern p-value: < 0.1
- Pairwise high-confidence p: < 0.01
- Pairwise min effect size: ≥ 0.8
- Strong patterns: linear, monotonic, threshold, threshold_increase, threshold_decrease

**Statistical significance thresholds:**
- Significant: p ≤ 0.05
- Borderline: p ≤ 0.1

## 5. Adversity Assessment (B-factors)

| Factor | Method |
|--------|--------|
| B-1 Adaptive response | Liver weight + hypertrophy without necrosis → equivocal |
| B-2 Stress confound | (Reserved) XS08 endpoints overlapping XS07/XS04 |
| B-3 Reversibility | Recovery arm data: endpoint recovery status |
| B-4 Magnitude | Cohen's d thresholds: <0.5=minimal, 0.5–1.0=mild, 1.0–2.0=moderate, 2.0–3.0=marked, ≥3.0=severe |
| B-5 Cross-domain support | Domain count from syndrome detection |
| B-6 Precursor to worse | (Reserved) Progression from adaptive to adverse |
| B-7 Secondary to other | (Reserved) Effects secondary to primary toxicity |

**Adversity outcomes:** `adverse`, `non_adverse`, `equivocal`

## 6. Severity Scale

| Tier | Label | Condition |
|------|-------|-----------|
| S0 | Death | Treatment-related deaths |
| — | Carcinogenic | Tumor progression detected |
| — | Proliferative | Tumor present, no progression |
| S4 | Critical | adverse + marked/severe + mechanism_confirmed, OR treatment-related deaths |
| S3 | Adverse | adverse + (mechanism_confirmed OR mechanism_uncertain) |
| S2 | Concern | adverse + pattern_only, OR non_adverse/equivocal + any certainty |
| S1 | Monitor | Non-adverse + minimal magnitude, or insufficient evidence |

## 7. Translational Confidence

### 7.1 SOC classification

| Syndrome | Primary SOC |
|----------|-------------|
| XS01 | hepatobiliary disorders (Hepatocellular injury) |
| XS02 | hepatobiliary disorders (Hepatobiliary / Cholestatic) |
| XS03 | renal and urinary disorders (Nephrotoxicity) |
| XS04 | blood and lymphatic system disorders (Myelosuppression) |
| XS05 | blood and lymphatic system disorders (Hemolytic anemia) |
| XS07 | immune system disorders (Immunotoxicity) |
| XS09 | metabolism and nutrition disorders (Target organ wasting) |
| XS10 | cardiac disorders (Cardiovascular) |

### 7.2 Translational tier bins

| Level | Endpoint LR+ | SOC LR+ |
|-------|-------------|---------|
| High | ≥ 10 | ≥ 5 |
| Moderate | ≥ 3 | ≥ 2 |
| Low | below moderate | below moderate |
| Insufficient data | LR+ not available | LR+ not available |

## 8. Interface Summary

### 8.1 Key types

```typescript
// Syndrome term matching
interface SyndromeTermMatch {
  testCodes?: string[];              // LB domain matching (OR)
  canonicalLabels?: string[];         // Normalized label matching (OR)
  specimenTerms?: {                   // MI/MA: specimen AND finding
    specimen: string[];
    finding: string[];
  };
  organWeightTerms?: {                // OM: organ specimen matching
    specimen: string[];
  };
  domain: string;                     // Required domain (LB, MI, MA, OM, BW, CL)
  direction: "up" | "down" | "any";
  role: "required" | "supporting";
  tag?: string;                       // For compound logic grouping
}

// Syndrome definition
interface SyndromeDefinition {
  id: string;                         // XS01-XS10
  name: string;
  requiredLogic: RequiredLogic;       // any | all | compound
  terms: SyndromeTermMatch[];
  minDomains: number;                 // Minimum matched domains
}

// Required logic types
type RequiredLogic =
  | { type: "any" }                           // >=1 required term matches
  | { type: "all" }                           // ALL required terms must match
  | { type: "compound"; expression: string }; // e.g., "ALP AND (GGT OR 5NT)"

// Directional gate
interface DirectionalGateConfig {
  term: string;                       // Tag to check (e.g., "RETIC")
  expectedDirection: "up" | "down";
  action: "reject" | "strong_against" | "weak_against";
  overrideCondition?: string;         // Softens reject to strong_against
}

// Discriminator config
interface SyndromeDiscriminators {
  findings: DiscriminatorFinding[];
  differential: string;               // e.g., "cholestatic vs hepatocellular"
}

// Discriminator finding (config shape, in SyndromeDiscriminators.findings[])
interface DiscriminatorFinding {
  endpoint: string;                   // Test code or label
  expectedDirection: "up" | "down";
  source: "LB" | "MI" | "MA" | "OM" | "EG" | "VS";
  weight: "strong" | "moderate";
  rationale: string;                  // Why this endpoint discriminates
  absenceMeaningful?: boolean;        // true = absence argues against
}

// Magnitude floor
interface MagnitudeFloor {
  minG: number;                       // Minimum |Hedges' g|
  minFcDelta: number;                 // Minimum |fold change - 1|
}
```

### 8.2 Key functions

| Function | Module | Input | Output |
|----------|--------|-------|--------|
| `detectCrossDomainSyndromes` | cross-domain-syndromes | EndpointSummary[] | CrossDomainSyndrome[] |
| `getSyndromeTermReport` | cross-domain-syndromes | syndromeId, endpoints | SyndromeTermReport |
| `checkMagnitudeFloor` | cross-domain-syndromes | endpoint, domain, allEndpoints? | string (blocked) or null (pass) |
| `assessCertainty` | syndrome-interpretation | syndrome, discriminators, endpoints, histopath | { certainty, evidence, rationale } |
| `computeTreatmentRelatedness` | syndrome-interpretation | syndrome, endpoints, context, … | TreatmentRelatednessScore |
| `computeAdversity` | syndrome-interpretation | syndrome, certainty, recovery, … | AdversityAssessment |
| `deriveOverallSeverity` | syndrome-interpretation | certainty, adversity, mortality, tumor | OverallSeverity |
| `assignTranslationalTier` | syndrome-interpretation | species, soc, endpointLRs | high/moderate/low/insufficient |
| `interpretSyndrome` | syndrome-interpretation | syndrome, endpoints, context, … | SyndromeInterpretation (full) |

