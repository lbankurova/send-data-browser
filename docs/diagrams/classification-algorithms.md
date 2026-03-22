# Classification Algorithm Flowcharts

Every classification decision the SENDEX analysis engine produces, as flowcharts.

**Source files:** `backend/services/analysis/classification.py`, `backend/generator/view_dataframes.py`, `backend/services/analysis/corroboration.py`, `backend/services/analysis/adversity_dictionary.py`, `backend/services/analysis/adaptive_trees.py`, `backend/services/analysis/progression_chains.py`

---

## Table of Contents

1. [Master Dispatch (assess_finding_with_context)](#1-master-dispatch)
2. [Severity Classification (classify_severity)](#2-severity-classification)
3. [ECETOC Adversity Assessment (assess_finding)](#3-ecetoc-adversity-assessment)
4. [OM Two-Gate Classification (_assess_om_two_gate)](#4-om-two-gate-classification)
5. [Histopath Classification (_classify_histopath)](#5-histopath-classification)
6. [Dose-Response Pattern (classify_dose_response)](#6-dose-response-pattern-classification)
7. [Treatment-Related Determination (determine_treatment_related)](#7-treatment-related-determination)
8. [NOAEL Derivation (build_noael_summary)](#8-noael-derivation)
9. [Signal Score Computation (_compute_signal_score)](#9-signal-score-computation)
10. [Target Organ Determination (build_target_organ_summary)](#10-target-organ-determination)
11. [Intrinsic Adversity Lookup](#11-intrinsic-adversity-lookup)
12. [Corroboration Status](#12-corroboration-status)
13. [NOAEL Confidence Score](#13-noael-confidence-score)
14. [A-Factor Scoring (Treatment-Relatedness)](#14-a-factor-scoring)
15. [B-6 Progression Chain Evaluation](#15-b-6-progression-chain-evaluation)

---

## 1. Master Dispatch

Top-level router: `assess_finding_with_context()` in `classification.py:795`. Every finding passes through here.

```mermaid
flowchart TD
    START([Finding enters assessment]) --> A3{Domain = OM?}

    A3 -->|Yes| COMP_A3[Compute A-3 HCD score<br/>compare treated mean vs<br/>historical control range]
    COMP_A3 --> OM_GATE[_assess_om_two_gate<br/>See §4]
    OM_GATE --> DONE([Return finding_class])

    A3 -->|No| HISTO{Domain ∈<br/>MI, MA, TF?}

    HISTO -->|Yes| HISTO_CLASS[_classify_histopath<br/>See §5]
    HISTO_CLASS --> B6[Evaluate B-6<br/>progression chains<br/>See §15]
    B6 --> DONE

    HISTO -->|No| BASE[assess_finding<br/>base ECETOC<br/>See §3]
    BASE --> DONE

    style START fill:#f9f,stroke:#333
    style DONE fill:#9f9,stroke:#333
    style OM_GATE fill:#ffd,stroke:#333
    style HISTO_CLASS fill:#ffd,stroke:#333
    style BASE fill:#ffd,stroke:#333
```

---

## 2. Severity Classification

`classify_severity()` in `classification.py:23`. Three-tier signal classification (adverse/warning/normal). Used for initial signal triage before ECETOC assessment.

### 2a. Continuous Endpoints (default threshold: grade-ge-2-or-dose-dep)

```mermaid
flowchart TD
    START([Continuous finding]) --> P{p_adj < 0.05?}

    P -->|Yes| D1{"|d| ≥ 0.5?"}
    D1 -->|Yes| ADV([ADVERSE])
    D1 -->|No| WARN1([WARNING])

    P -->|No| T{trend_p < 0.05?}
    T -->|Yes| D2{"|d| ≥ 0.8?"}
    D2 -->|Yes| ADV2([ADVERSE])
    D2 -->|No| WARN2([WARNING])

    T -->|No| D3{"|d| ≥ 1.0?"}
    D3 -->|Yes| WARN3([WARNING])
    D3 -->|No| NORM([NORMAL])

    style ADV fill:#f66,stroke:#333,color:#fff
    style ADV2 fill:#f66,stroke:#333,color:#fff
    style WARN1 fill:#fc6,stroke:#333
    style WARN2 fill:#fc6,stroke:#333
    style WARN3 fill:#fc6,stroke:#333
    style NORM fill:#9f9,stroke:#333
```

### 2b. Incidence Endpoints (all threshold modes)

```mermaid
flowchart TD
    START([Incidence finding]) --> DIR{direction?}

    DIR -->|down / protective| PD{p_adj < 0.05?}
    PD -->|Yes| WARN1([WARNING])
    PD -->|No| TD{trend_p < 0.05?}
    TD -->|Yes| WARN2([WARNING])
    TD -->|No| NORM1([NORMAL])

    DIR -->|up / not down| PU{p_adj < 0.05?}
    PU -->|Yes| ADV([ADVERSE])
    PU -->|No| TU{trend_p < 0.05?}
    TU -->|Yes| WARN3([WARNING])
    TU -->|No| PM{p_adj < 0.10?}
    PM -->|Yes| WARN4([WARNING])
    PM -->|No| NORM2([NORMAL])

    style ADV fill:#f66,stroke:#333,color:#fff
    style WARN1 fill:#fc6,stroke:#333
    style WARN2 fill:#fc6,stroke:#333
    style WARN3 fill:#fc6,stroke:#333
    style WARN4 fill:#fc6,stroke:#333
    style NORM1 fill:#9f9,stroke:#333
    style NORM2 fill:#9f9,stroke:#333
```

---

## 3. ECETOC Adversity Assessment

`assess_finding()` in `classification.py:487`. Five-class ECETOC-style assessment. This is the base classifier; context-aware wrappers (OM two-gate, histopath trees) override it when applicable.

```mermaid
flowchart TD
    START([Finding]) --> STEP0{Domain ∈ MI/MA/TF<br/>AND finding_text?}

    STEP0 -->|Yes| INTR0[lookup_intrinsic_adversity]
    INTR0 --> AA{always_adverse?}
    AA -->|Yes| ASCORE0[Compute A-score]
    ASCORE0 --> AA_GATE{A-score ≥ 1.0?}
    AA_GATE -->|Yes| TR_ADV0([tr_adverse])
    AA_GATE -->|No| EQUIV0([equivocal])
    AA -->|No| STEP1

    STEP0 -->|No| STEP1[Step 1: A-factor scoring<br/>See §14]
    STEP1 --> TR_CHK{A-score < 1.0?}
    TR_CHK -->|Yes| NTR([not_treatment_related])

    TR_CHK -->|No| DTYPE{data_type?}

    DTYPE -->|Incidence| INC_DOM{domain?}
    INC_DOM -->|MI| MI_FB([equivocal<br/>MI fallback])
    INC_DOM -->|CL, DS| CL_CHK{p_adj < 0.05?}
    CL_CHK -->|Yes| CL_PAT{monotonic or<br/>threshold pattern?}
    CL_PAT -->|Yes| TR_ADV_CL([tr_adverse])
    CL_PAT -->|No| EQUIV_CL([equivocal])
    CL_CHK -->|No| CL_TR{A-score ≥ 1.0?}
    CL_TR -->|Yes| EQUIV_CL2([equivocal])
    CL_TR -->|No| TR_NA_CL([tr_non_adverse])

    DTYPE -->|Continuous| B0{Domain ∈ MI/MA/TF<br/>with finding_text?}
    B0 -->|Yes| B0_INTR[lookup_intrinsic_adversity]
    B0_INTR --> B0_LA{likely_adverse?}
    B0_LA -->|Yes| TR_ADV_B0([tr_adverse])
    B0_LA -->|No| B0_CD{context_dependent?}
    B0_CD -->|Yes| B0_MAG{"|d| ≥ 1.5?"}
    B0_MAG -->|Yes| TR_ADV_CD([tr_adverse])
    B0_MAG -->|No| TR_ADAP([tr_adaptive])
    B0_CD -->|No| B1

    B0 -->|No| B1{"|d| ≥ 1.5?"}
    B1 -->|Yes| TR_ADV_B1([tr_adverse])
    B1 -->|No| B2{"|d| ≥ 0.8 AND<br/>corroborated?"}
    B2 -->|Yes| TR_ADV_B2([tr_adverse])
    B2 -->|No| B3{"|d| < 0.5?"}
    B3 -->|Yes| TR_NA([tr_non_adverse])
    B3 -->|No| EQUIV_B4([equivocal])

    style TR_ADV0 fill:#c00,stroke:#333,color:#fff
    style TR_ADV_CL fill:#c00,stroke:#333,color:#fff
    style TR_ADV_B0 fill:#c00,stroke:#333,color:#fff
    style TR_ADV_CD fill:#c00,stroke:#333,color:#fff
    style TR_ADV_B1 fill:#c00,stroke:#333,color:#fff
    style TR_ADV_B2 fill:#c00,stroke:#333,color:#fff
    style NTR fill:#9f9,stroke:#333
    style TR_NA fill:#9df,stroke:#333
    style TR_NA_CL fill:#9df,stroke:#333
    style TR_ADAP fill:#9cf,stroke:#333
    style EQUIV0 fill:#fc6,stroke:#333
    style MI_FB fill:#fc6,stroke:#333
    style EQUIV_CL fill:#fc6,stroke:#333
    style EQUIV_CL2 fill:#fc6,stroke:#333
    style EQUIV_B4 fill:#fc6,stroke:#333
```

**Legend:** 🔴 tr_adverse | 🟠 equivocal | 🔵 tr_adaptive / tr_non_adverse | 🟢 not_treatment_related

---

## 4. OM Two-Gate Classification

`_assess_om_two_gate()` in `classification.py:609`. Organ weight findings use a two-gate system: statistical significance × magnitude (% change vs organ-specific threshold).

```mermaid
flowchart TD
    START([OM Finding]) --> PCT{pct_change<br/>available?}
    PCT -->|No| FALLBACK[Fall through to<br/>assess_finding §3]

    PCT -->|Yes| BRAIN{floor = 0?<br/>Brain special case}
    BRAIN -->|Yes| BRAIN_STAT{p_adj < 0.05?}
    BRAIN_STAT -->|Yes| TR_ADV_BR([tr_adverse])
    BRAIN_STAT -->|No| BRAIN_TR{trend_p < 0.05?}
    BRAIN_TR -->|Yes| EQ_BR([equivocal])
    BRAIN_TR -->|No| NTR_BR([not_treatment_related])

    BRAIN -->|No| STRONG{"|pct| ≥ strong_adverse<br/>AND p < 0.05?"}
    STRONG -->|Yes| TR_ADV_STR([tr_adverse<br/>HCD cannot override])

    STRONG -->|No| GATES["Evaluate gates:<br/>stat_gate = p < 0.05<br/>mag_floor = |pct| ≥ adverse_floor<br/>mag_ceiling = |pct| ≥ variation_ceiling"]

    GATES --> BOTH{stat AND<br/>mag ≥ floor?}
    BOTH -->|Yes| HCD_DN{within HCD?}
    HCD_DN -->|Yes| EQ_HCD([equivocal<br/>HCD downgrade])
    HCD_DN -->|No| TR_ADV([tr_adverse])

    BOTH -->|No| SC{stat AND<br/>ceiling ≤ |pct| < floor?}
    SC -->|Yes| EQ_MOD([equivocal<br/>moderate magnitude])

    SC -->|No| SMALL{stat AND<br/>|pct| < ceiling?}
    SMALL -->|Yes| VSMALL{p < 0.001 AND<br/>|pct| > ceiling/2?}
    VSMALL -->|Yes| EQ_VS([equivocal])
    VSMALL -->|No| HCD_UP{outside HCD?}
    HCD_UP -->|Yes| EQ_HCD2([equivocal<br/>HCD upgrade])
    HCD_UP -->|No| TR_NA([tr_non_adverse])

    SMALL -->|No| NOSTAT{NOT stat AND<br/>mag ≥ floor?}
    NOSTAT -->|Yes| EQ_NS([equivocal<br/>+ trend tiebreaker])

    NOSTAT -->|No| MARG{marginal stats AND<br/>mag ≥ floor AND trend?}
    MARG -->|Yes| EQ_MG([equivocal])

    MARG -->|No| NEITHER{NOT stat AND<br/>NOT mag ≥ floor?}
    NEITHER -->|Yes| TR_CEIL{trend AND<br/>mag ≥ ceiling?}
    TR_CEIL -->|Yes| EQ_TC([equivocal])
    TR_CEIL -->|No| NTR([not_treatment_related])

    NEITHER -->|No| NTR2([not_treatment_related])

    style TR_ADV fill:#c00,stroke:#333,color:#fff
    style TR_ADV_BR fill:#c00,stroke:#333,color:#fff
    style TR_ADV_STR fill:#c00,stroke:#333,color:#fff
    style EQ_HCD fill:#fc6,stroke:#333
    style EQ_MOD fill:#fc6,stroke:#333
    style EQ_VS fill:#fc6,stroke:#333
    style EQ_HCD2 fill:#fc6,stroke:#333
    style EQ_NS fill:#fc6,stroke:#333
    style EQ_MG fill:#fc6,stroke:#333
    style EQ_TC fill:#fc6,stroke:#333
    style EQ_BR fill:#fc6,stroke:#333
    style TR_NA fill:#9df,stroke:#333
    style NTR fill:#9f9,stroke:#333
    style NTR2 fill:#9f9,stroke:#333
    style NTR_BR fill:#9f9,stroke:#333
```

### OM Threshold Reference

| Organ | Variation Ceiling | Adverse Floor | Strong Adverse |
|-------|:-:|:-:|:-:|
| Brain | 0% | 0% | 0% |
| Heart | 5% | 10% | 20% |
| Liver | 10% | 15% | 30% |
| Kidney | 8% | 15% | 30% |
| Spleen | 15% | 25% | 50% |
| Thymus | 20% | 30% | 60% |
| Default | 5% | 15% | 30% |

---

## 5. Histopath Classification

`_classify_histopath()` in `classification.py:854`. For MI/MA/TF findings. Routes context-dependent terms through adaptive decision trees.

```mermaid
flowchart TD
    START([MI/MA/TF Finding]) --> HAS_TEXT{finding_text<br/>present?}

    HAS_TEXT -->|No| BASE[assess_finding<br/>base ECETOC §3]

    HAS_TEXT -->|Yes| LOOKUP[lookup_intrinsic_adversity]
    LOOKUP --> CD{context_dependent?}

    CD -->|No| BASE

    CD -->|Yes| TREE[evaluate_adaptive_trees<br/>organ-specific decision trees]
    TREE --> MATCH{Tree matched?}
    MATCH -->|Yes| TREE_CLASS([Return tree classification<br/>tr_adaptive / tr_adverse / equivocal])
    MATCH -->|No| NO_TREE[No tree matched]
    NO_TREE --> BASE2[assess_finding base ECETOC]
    BASE2 --> ADAP_CHK{Result =<br/>tr_adaptive?}
    ADAP_CHK -->|Yes| OVERRIDE([equivocal<br/>no biological context])
    ADAP_CHK -->|No| PASS([Return base result])

    TREE_CLASS --> B6[B-6 progression chain<br/>evaluation §15]
    PASS --> B6
    OVERRIDE --> B6
    BASE --> B6_ALT[B-6 evaluation §15]

    style TREE_CLASS fill:#ffd,stroke:#333
    style OVERRIDE fill:#fc6,stroke:#333
```

### Adaptive Decision Tree: Liver Example (Hall 2012)

```mermaid
flowchart TD
    ENTRY([MI LIVER + hypertrophy]) --> N1{Concurrent adverse<br/>indicators?<br/>necrosis/fibrosis/<br/>degeneration in same organ}

    N1 -->|Yes| ADV([tr_adverse<br/>adaptive compensation<br/>with tissue damage])

    N1 -->|No| N2{LB panel clean?<br/>ALT, AST within limits<br/>max fold-change ≤ threshold}
    N2 --> SEV{Severity ≤<br/>max_severity_for_adaptive?}
    SEV -->|Yes| ADAP([tr_adaptive<br/>compensatory response<br/>without damage markers])
    SEV -->|No| EQ([equivocal<br/>high severity without<br/>clear damage pattern])

    N2 -->|Panel dirty| EQ2([equivocal<br/>enzyme elevation<br/>suggests damage])

    style ADV fill:#c00,stroke:#333,color:#fff
    style ADAP fill:#9cf,stroke:#333
    style EQ fill:#fc6,stroke:#333
    style EQ2 fill:#fc6,stroke:#333
```

---

## 6. Dose-Response Pattern Classification

`classify_dose_response()` in `classification.py:300`. Determines the shape of the dose-response curve using noise-tolerant equivalence bands.

### 6a. Continuous Data

```mermaid
flowchart TD
    START([Group stats by dose]) --> VALID{≥ 2 groups<br/>with means?}
    VALID -->|No| INSUF([insufficient_data])

    VALID -->|Yes| POOL[Compute pooled SD<br/>RMS of per-group SDs]
    POOL --> TIER[Determine CV% tier<br/>Tier 1: 0.5 SD — BW, RBC, protein<br/>Tier 2: 0.5 SD — liver, kidney, ALT<br/>Tier 3: 0.75 SD — spleen, WBC, TRIG]
    TIER --> BAND[equivalence_band =<br/>tier_fraction × pooled_SD]
    BAND --> STEPS["Build step sequence:<br/>For each consecutive pair:<br/>|diff| ≤ band → 'flat'<br/>diff > 0 → 'up'<br/>diff < 0 → 'down'"]

    STEPS --> CLASSIFY{Non-flat steps?}
    CLASSIFY -->|None| FLAT([flat])
    CLASSIFY -->|All same direction| FLATS{Flats at start?}
    FLATS -->|No| MONO([monotonic_increase<br/>or monotonic_decrease])
    FLATS -->|Yes| THRESH([threshold_increase<br/>or threshold_decrease])
    CLASSIFY -->|Mixed directions| NONMONO([non_monotonic])

    THRESH --> ONSET[onset_dose_level =<br/>first non-flat step]

    MONO --> CONF[Confidence scoring]
    NONMONO --> CONF
    THRESH --> CONF
    FLAT --> CONF

    CONF --> F1{max |d| ≥ 2.0?}
    F1 -->|Yes| S2[score += 2]
    F1 -->|No| F1B{max |d| ≥ 0.8?}
    F1B -->|Yes| S1[score += 1]
    F1B -->|No| S0[score += 0]

    S2 --> F2{Naturally monotonic<br/>without band?}
    S1 --> F2
    S0 --> F2
    F2 -->|Yes| SPLUS[score += 1]
    F2 -->|No| SKEEP[score unchanged]

    SPLUS --> CLVL{score?}
    SKEEP --> CLVL
    CLVL -->|≥ 3| HIGH([HIGH confidence])
    CLVL -->|≥ 1| MOD([MODERATE confidence])
    CLVL -->|0| LOW([LOW confidence])

    style MONO fill:#cfc,stroke:#333
    style THRESH fill:#ffc,stroke:#333
    style NONMONO fill:#fcc,stroke:#333
    style FLAT fill:#eee,stroke:#333
    style INSUF fill:#eee,stroke:#333
```

### 6b. Incidence Data

```mermaid
flowchart TD
    START([Incidence data by dose]) --> VALID{≥ 2 groups?}
    VALID -->|No| INSUF([insufficient_data])

    VALID -->|Yes| STEPS["For each consecutive pair:<br/>tolerance = max(1.5 × SE, 2pp)<br/>where SE = √(p(1-p)/n)<br/>|diff| ≤ tolerance → 'flat'"]

    STEPS --> CLASSIFY["Same step classification as continuous:<br/>all same dir → monotonic<br/>same dir + leading flats → threshold<br/>mixed → non_monotonic<br/>none → flat"]

    CLASSIFY --> RESULT([Pattern + onset_dose_level<br/>No confidence score])

    style RESULT fill:#ddf,stroke:#333
```

---

## 7. Treatment-Related Determination

`determine_treatment_related()` in `classification.py:408`. Conservative rule-based determination.

```mermaid
flowchart TD
    START([Finding]) --> CONV{p_adj < 0.05<br/>AND<br/>trend_p < 0.05?}
    CONV -->|Yes| TRUE([treatment_related = TRUE<br/>Strong convergence])

    CONV -->|No| ADV_MONO{severity = adverse<br/>AND monotonic<br/>dose-response?}
    ADV_MONO -->|Yes| TRUE2([treatment_related = TRUE<br/>Adverse + dose-dependent])

    ADV_MONO -->|No| STRONG_P{p_adj < 0.01?}
    STRONG_P -->|Yes| TRUE3([treatment_related = TRUE<br/>Very significant])

    STRONG_P -->|No| FALSE([treatment_related = FALSE])

    style TRUE fill:#f99,stroke:#333
    style TRUE2 fill:#f99,stroke:#333
    style TRUE3 fill:#f99,stroke:#333
    style FALSE fill:#9f9,stroke:#333
```

---

## 8. NOAEL Derivation

`build_noael_summary()` in `view_dataframes.py:352`. Determines the No Observed Adverse Effect Level for each sex.

```mermaid
flowchart TD
    START([All findings for sex]) --> FILTER[Exclude derived endpoints<br/>ratios/indices]

    FILTER --> LOAEL_ID["For each finding where<br/>finding_class = tr_adverse<br/>(or legacy: severity = adverse)"]

    LOAEL_ID --> DOSE_COLLECT["Collect dose levels where<br/>pairwise p_adj < 0.05"]

    DOSE_COLLECT --> HAS_ADV{Any adverse<br/>dose levels?}

    HAS_ADV -->|No| NO_EST([NOAEL: Not established<br/>No adverse effects detected])

    HAS_ADV -->|Yes| LOAEL["LOAEL = min(adverse dose levels)"]
    LOAEL --> NOAEL_CALC{LOAEL > 0?}
    NOAEL_CALC -->|Yes| NOAEL["NOAEL = LOAEL - 1"]
    NOAEL_CALC -->|No| NO_NOAEL([NOAEL: Not established<br/>Adverse at lowest dose])

    NOAEL --> MORT{Mortality LOAEL<br/>exists?}
    MORT -->|Yes| MORT_CMP{NOAEL ≥<br/>mortality LOAEL?}
    MORT_CMP -->|Yes| CAP["Cap NOAEL to<br/>mortality LOAEL - 1"]
    MORT_CMP -->|No| CONF
    MORT -->|No| CONF

    CAP --> CONF[Compute confidence<br/>See §13]

    CONF --> SCHED{Scheduled data<br/>available?}
    SCHED -->|Yes| SCHED_CALC["Repeat NOAEL derivation<br/>using scheduled_pairwise<br/>(early-death excluded)"]
    SCHED_CALC --> DIFF{Scheduled NOAEL<br/>≠ base NOAEL?}
    DIFF -->|Yes| FLAG([Flag difference])
    DIFF -->|No| DONE([NOAEL complete])
    SCHED -->|No| DONE

    style NO_EST fill:#ffd,stroke:#333
    style NO_NOAEL fill:#fcc,stroke:#333
    style FLAG fill:#fc6,stroke:#333
    style DONE fill:#9f9,stroke:#333
```

---

## 9. Signal Score Computation

`_compute_signal_score()` in `view_dataframes.py:567`. Combines statistical and biological significance into a 0–1 score.

### 9a. Continuous Data (weights: p=0.35, trend=0.20, effect=0.25, pattern=0.20)

```mermaid
flowchart TD
    START([Continuous endpoint]) --> P{p_value available?}
    P -->|Yes| P_SCORE["p_component = 0.35 × min(-log₁₀(p)/4, 1.0)"]
    P -->|No| P_ZERO[p_component = 0]

    P_SCORE --> T{trend_p available?}
    P_ZERO --> T
    T -->|Yes| T_SCORE["trend_component = 0.20 × min(-log₁₀(trend)/4, 1.0)"]
    T -->|No| T_ZERO[trend_component = 0]

    T_SCORE --> E{effect_size available?}
    T_ZERO --> E
    E -->|Yes| E_SCORE["effect_component = 0.25 × min(|d|/2.0, 1.0)"]
    E -->|No| E_ZERO[effect_component = 0]

    E_SCORE --> PAT["pattern_component = 0.20 × pattern_score<br/>monotonic: 1.0 | threshold: 0.7<br/>non_monotonic: 0.3 | flat: 0.0"]
    E_ZERO --> PAT

    PAT --> SUM["signal_score = min(Σ components, 1.0)"]
    SUM --> RESULT([Signal score 0.0 – 1.0])

    style RESULT fill:#ddf,stroke:#333
```

### 9b. Incidence Data (weights: p=0.45, trend=0.30, pattern=0.25, +MI severity 0.10)

```mermaid
flowchart TD
    START([Incidence endpoint]) --> P["p_component = 0.45 × min(-log₁₀(p)/4, 1.0)"]
    P --> T["trend_component = 0.30 × min(-log₁₀(trend)/4, 1.0)"]
    T --> PAT["pattern_component = 0.25 × pattern_score"]
    PAT --> MI{MI domain with<br/>severity grade?}
    MI -->|Yes| SEV["severity_bonus = 0.10 × min((grade-1)/4, 1.0)"]
    MI -->|No| NO_SEV[severity_bonus = 0]
    SEV --> SUM["signal_score = min(Σ components, 1.0)"]
    NO_SEV --> SUM
    SUM --> RESULT([Signal score 0.0 – 1.0])

    style RESULT fill:#ddf,stroke:#333
```

---

## 10. Target Organ Determination

`build_target_organ_summary()` in `view_dataframes.py:109`. Identifies target organs from multi-domain convergent evidence.

```mermaid
flowchart TD
    START([All findings]) --> AGG["Per organ_system:<br/>1. Compute signal_score per endpoint<br/>2. Deduplicate by endpoint key<br/>   (max signal per key)<br/>3. Track domains represented"]

    AGG --> AVG["avg_signal = mean(deduped signal scores)"]

    AVG --> CONV["convergence_count =<br/>count of distinct convergence groups<br/>(MI+MA+TF → one PATHOLOGY group,<br/>others each separate)"]

    CONV --> EVIDENCE["evidence_score =<br/>avg_signal × (1 + 0.2 × (convergence_count - 1))"]

    EVIDENCE --> FLAG{evidence_score ≥ 0.3<br/>AND<br/>n_significant ≥ 1?}

    FLAG -->|Yes| TARGET([target_organ_flag = TRUE])
    FLAG -->|No| NOT_TARGET([target_organ_flag = FALSE])

    style TARGET fill:#f99,stroke:#333
    style NOT_TARGET fill:#9f9,stroke:#333
```

---

## 11. Intrinsic Adversity Lookup

`lookup_intrinsic_adversity()` in `adversity_dictionary.py:41`. Three-tier substring matching for histopathology terms. First match wins (priority order).

```mermaid
flowchart TD
    START([finding_text]) --> LOWER[Lowercase text]
    LOWER --> T1{"Substring match in<br/>always_adverse?<br/>necrosis, fibrosis,<br/>carcinoma, sarcoma,<br/>adenoma, ..."}

    T1 -->|Yes| ALWAYS([always_adverse<br/>Adverse by definition])

    T1 -->|No| T2{"Substring match in<br/>likely_adverse?<br/>atrophy, degeneration,<br/>hemorrhage,<br/>inflammation, ..."}

    T2 -->|Yes| LIKELY([likely_adverse<br/>Adverse in most contexts])

    T2 -->|No| T3{"Substring match in<br/>context_dependent?<br/>hypertrophy, hyperplasia,<br/>metaplasia, ..."}

    T3 -->|Yes| CONTEXT([context_dependent<br/>Requires decision tree])

    T3 -->|No| NONE([None<br/>No intrinsic adversity])

    style ALWAYS fill:#c00,stroke:#333,color:#fff
    style LIKELY fill:#f66,stroke:#333,color:#fff
    style CONTEXT fill:#fc6,stroke:#333
    style NONE fill:#eee,stroke:#333
```

---

## 12. Corroboration Status

`compute_corroboration()` in `corroboration.py`. Determines if a finding has cross-domain support via syndrome definitions.

```mermaid
flowchart TD
    START([Finding]) --> MATCH["Match finding against<br/>all syndrome term definitions<br/>(domain, direction, test_code,<br/>label, specimen+finding, OM specimen)"]

    MATCH --> HIT{Matches any<br/>syndrome term?}
    HIT -->|No| NA([not_applicable<br/>No syndrome relevance])

    HIT -->|Yes| SEARCH["For each matched syndrome:<br/>Search same-sex findings for<br/>other terms in that syndrome"]

    SEARCH --> SUPPORT{≥ 2 terms matched<br/>from different domains<br/>AND supporting finding<br/>passes quality gate?}

    SUPPORT -->|Yes| CORR([corroborated<br/>Cross-domain support])
    SUPPORT -->|No| UNCORR([uncorroborated<br/>Matches syndrome but<br/>no cross-domain support])

    CORR --> NOTE["Quality gate:<br/>supporting finding must have<br/>treatment_related = True"]

    style CORR fill:#9f9,stroke:#333
    style UNCORR fill:#ffc,stroke:#333
    style NA fill:#eee,stroke:#333
```

---

## 13. NOAEL Confidence Score

`_compute_noael_confidence()` in `view_dataframes.py:499`. Score starts at 1.0 with penalty deductions.

```mermaid
flowchart TD
    START([Base score: 1.0]) --> P1{n_adverse_at_LOAEL ≤ 1?}
    P1 -->|Yes| D1["−0.20 (single_endpoint)"]
    P1 -->|No| P2

    D1 --> P2{M/F sex AND<br/>opposite sex has<br/>different NOAEL?}
    P2 -->|Yes| D2["−0.20 (sex_inconsistency)"]
    P2 -->|No| P3

    D2 --> P3{Any continuous finding with<br/>|effect_size| ≥ 1.0 AND<br/>p ≥ 0.05?}
    P3 -->|Yes| D3["−0.20 (large_effect_non_significant)"]
    P3 -->|No| P4

    D3 --> P4{ALL adverse findings<br/>at LOAEL are<br/>uncorroborated?}
    P4 -->|Yes| D4["−0.15 (all_uncorroborated)"]
    P4 -->|No| RESULT

    D4 --> RESULT["confidence = max(score, 0.0)<br/>Range: 0.0 – 1.0"]
    RESULT --> OUT([NOAEL confidence])

    style OUT fill:#ddf,stroke:#333
```

---

## 14. A-Factor Scoring

`_score_treatment_relatedness()` in `classification.py:449`. Computes treatment-relatedness score (0–4+ scale).

```mermaid
flowchart TD
    START([Finding]) --> A1["A-1: Dose-response pattern (0–2 pts)"]
    A1 --> A1_PAT{pattern?}
    A1_PAT -->|monotonic| A1_2["+2.0"]
    A1_PAT -->|threshold| A1_15["+1.5"]
    A1_PAT -->|non_monotonic/U| A1_05["+0.5"]
    A1_PAT -->|other| A1_0["+0.0"]

    A1_2 --> A2
    A1_15 --> A2
    A1_05 --> A2
    A1_0 --> A2

    A2["A-2: Concordance (0–1 pt)"] --> A2_CHK{corroboration_status<br/>= corroborated?}
    A2_CHK -->|Yes| A2_1["+1.0"]
    A2_CHK -->|No| A2_0["+0.0"]

    A2_1 --> A3
    A2_0 --> A3

    A3["A-3: Historical Control Data (±0.5)"] --> A3_CHK{HCD result?}
    A3_CHK -->|within_hcd| A3_M["−0.5"]
    A3_CHK -->|outside_hcd| A3_P["+0.5"]
    A3_CHK -->|no_hcd| A3_0["+0.0"]

    A3_M --> A6
    A3_P --> A6
    A3_0 --> A6

    A6["A-6: Statistics (0–1 pt)"] --> A6_CHK{p_adj < 0.05?}
    A6_CHK -->|Yes| A6_1["+1.0"]
    A6_CHK -->|No| A6_TR{trend_p < 0.05?}
    A6_TR -->|Yes| A6_05["+0.5"]
    A6_TR -->|No| A6_0["+0.0"]

    A6_1 --> TOTAL["A-score = Σ factors"]
    A6_05 --> TOTAL
    A6_0 --> TOTAL

    TOTAL --> GATE{A-score ≥ 1.0?}
    GATE -->|Yes| TR([Treatment-related<br/>→ proceed to B-factors])
    GATE -->|No| NTR([not_treatment_related])

    style TR fill:#fcc,stroke:#333
    style NTR fill:#9f9,stroke:#333
```

---

## 15. B-6 Progression Chain Evaluation

`evaluate_b6()` in `progression_chains.py`. Checks if a finding is a precursor to documented adverse outcomes via organ-specific progression pathways.

```mermaid
flowchart TD
    START([MI/MA/TF Finding]) --> MATCH["Match finding against<br/>14 organ-specific<br/>progression chains<br/>(organ, domain, finding text)"]

    MATCH --> HIT{Matches a<br/>chain stage?}
    HIT -->|No| DONE([No B-6 effect<br/>Return original class])

    HIT -->|Yes| TYPE{Obligate<br/>precursor?}
    TYPE -->|Yes| FIRES["B-6 FIRES<br/>(always fires for<br/>obligate precursors)"]

    TYPE -->|No| SEV_CHK{severity ≥<br/>chain trigger<br/>threshold?}
    SEV_CHK -->|Yes| FIRES
    SEV_CHK -->|No| NO_FIRE([B-6 does not fire<br/>Return original class])

    FIRES --> CUR_CLASS{Current class<br/>= tr_adverse?}
    CUR_CLASS -->|Yes| KEEP([Keep tr_adverse<br/>Already worst class])
    CUR_CLASS -->|No| NTR_CHK{Current class<br/>= not_treatment_related?}
    NTR_CHK -->|Yes| NO_ESC([No escalation<br/>Must be treatment-related<br/>to escalate])
    NTR_CHK -->|No| ESCALATE([ESCALATE to tr_adverse<br/>Precursor to adverse outcome])

    style ESCALATE fill:#c00,stroke:#333,color:#fff
    style FIRES fill:#f99,stroke:#333
    style NO_FIRE fill:#eee,stroke:#333
    style DONE fill:#eee,stroke:#333
    style NO_ESC fill:#eee,stroke:#333
```

---

## Complete Classification Pipeline

End-to-end flow from raw finding to all output classifications:

```mermaid
flowchart LR
    RAW([Raw finding<br/>from XPT]) --> STATS["Statistical analysis<br/>p-values, trend,<br/>effect size"]

    STATS --> DR["Dose-response<br/>classification §6"]
    STATS --> SEV["Severity<br/>classification §2"]
    STATS --> TR["Treatment-related<br/>determination §7"]

    DR --> ECETOC
    SEV --> ECETOC
    TR --> ECETOC

    ECETOC["ECETOC assessment<br/>(master dispatch §1)<br/>→ OM two-gate §4<br/>→ Histopath trees §5<br/>→ Base ECETOC §3"] --> CLASS["finding_class:<br/>tr_adverse<br/>tr_adaptive<br/>tr_non_adverse<br/>equivocal<br/>not_treatment_related"]

    STATS --> SIG["Signal score §9"]
    SIG --> TARGET["Target organ §10"]

    CLASS --> NOAEL["NOAEL<br/>derivation §8"]
    TARGET --> NOAEL

    STATS --> CORR["Corroboration §12"]
    CORR --> ECETOC
```
