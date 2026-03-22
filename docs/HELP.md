# SENDEX

Decision support for preclinical toxicology studies in
[CDISC SEND](https://www.cdisc.org/standards/foundational/send) format. Load a
study folder of SAS Transport (.xpt) files, and SENDEX runs a statistical and
classification pipeline that produces structured findings, dose-response
characterization, cross-domain syndrome detection, adversity assessment, and
NOAEL determination — all surfaced through question-driven analysis views.

The guiding principle: **the system computes what it can**, so the toxicologist
reviews conclusions, not raw data. Every computed result is backed by
drillable evidence, and expert judgment forms are built into every view so
annotations travel with the data.

## Data pipeline

SENDEX uses two pipelines that share the same core statistical modules.

**Pre-generated pipeline.** Runs offline via CLI
(`python -m generator.generate <study_id>`). Reads XPT files, computes all
domain statistics, classifies findings, evaluates rules, and writes structured
JSON to `backend/generated/{study_id}/`. The frontend fetches these files
through the REST API.

**On-demand pipeline.** Runs on first request, then cached. Adds cross-finding
correlations and per-finding context pane data for the Findings view.

```
SEND study (XPT files)
  |
  v
DM + TX --> dose group mapping, subject roster, TK satellite detection
  |
  v
12 domain modules --> per-domain statistical analysis, classification, organ mapping
  |
  v
Enriched findings --> 8 JSON output files, 19 rule evaluations, clinical post-pass
  |
  v
REST API (FastAPI) --> React frontend (analysis views)
                       Expert annotations (persisted JSON)
```

### Domain modules

| Domain | Code | Data type | What's computed |
|--------|------|-----------|-----------------|
| Laboratory | LB | Continuous | Pairwise comparisons, trend tests, effect sizes, 31 graded clinical significance rules |
| Body weights | BW | Continuous | Percent change from baseline, group means, pairwise tests |
| Organ measurements | OM | Continuous | Absolute + relative (body weight, brain) + ANCOVA normalization, two-gate classification |
| Microscopic findings | MI | Incidence + severity | Incidence rates, severity mapping, progression chain evaluation |
| Macroscopic findings | MA | Incidence | Incidence rates, pairwise Fisher's exact |
| Clinical observations | CL | Incidence | Incidence rates, clinical catalog matching |
| Food/water consumption | FW | Continuous | Group means, pairwise tests |
| Disposition | DS | Events | Mortality detection, early death tracking |
| ECG | EG | Continuous | Interval analysis, pairwise tests |
| Vital signs | VS | Continuous | Pairwise tests, trend analysis |
| Body weight gain | BG | Continuous | Growth rate analysis |
| Tumor findings | TF | Incidence | Tumor incidence rates, progression chains |

The seven primary analytical domains (LB, BW, OM, MI, MA, CL, FW) carry the
deepest analysis. The remaining modules contribute findings used in cross-domain
enrichment, mortality rules, and NOAEL derivation.

### Output files

The pre-generated pipeline produces eight core analysis files per study:

| Output | Contents | Typical rows |
|--------|----------|:------------:|
| Study signal summary | Per-endpoint signal scores, p-values, effect sizes, patterns | ~989 |
| Target organ summary | Per-organ evidence scores, domain counts, target organ flags | ~14 |
| Dose-response metrics | Per-endpoint x dose: mean, SD, n, incidence, p-value, effect size, pattern | ~1,342 |
| Organ evidence detail | Non-normal findings: evidence per organ x endpoint x dose | ~357 |
| Lesion severity summary | Histopath findings: severity grades, incidence per dose x sex | ~728 |
| Adverse effect summary | Adversity determinations, patterns, treatment-relatedness | ~357 |
| NOAEL summary | NOAEL/LOAEL per sex with exposure and human equivalent dose | 3 |
| Rule results | 19 rule instances with structured parameters and clinical annotations | ~975 |

Row counts are from a real study (PointCross — mixed-sex rat study with
recovery arms).

### Statistical methods

Three categories of computation:

**Statistical tests.** Dunnett's test (pairwise vs. control), Williams'
step-down test (monotone dose-response), Fisher's exact (incidence), Welch's
t-test, Mann-Whitney U, Jonckheere-Terpstra trend (continuous),
Cochran-Armitage trend (binary), ANOVA F-test, Kruskal-Wallis, Spearman
correlation, Bonferroni correction, ANCOVA (organ weight normalization).

**Algorithmic methods (38).** Dose-response pattern classification, TK
satellite exclusion, severity mapping, organ system resolution, progression
chain evaluation, cross-organ chain detection, GRADE-style confidence scoring,
magnitude floor filtering, and more. Full registry in
`docs/knowledge/methods-index.md`.

**Classification algorithms (27).** Severity (adverse/warning/normal), pattern
(6 shapes), treatment-relatedness, NOAEL/LOAEL, target organ flagging, syndrome
confidence, recovery verdict, adversity assessment (ECETOC), and more.

## Analysis views

Each view answers a specific question in the toxicological workflow. All views
share a three-panel layout: browsing/rail (left), analysis (center), context
(right). Clicking an item in the center panel updates the context panel with
relevant detail.

| View | Question | Key features |
|------|----------|--------------|
| Study summary | What happened? | NOAEL banner, target organs ranked by evidence, signal matrix, study design |
| Findings | What's affected? | Cross-domain scatter plot + table, organ drill-down, syndrome detection |
| Dose-response | Is it treatment-related? | D-R charts, time-course, pairwise stats, Bradford Hill causality worksheet |
| Histopathology | Are the lesions real? | Severity matrices, dose-group/subject modes, recovery classification, peer review |
| NOAEL determination | What's the NOAEL? | Signal analysis, adversity assessment, confidence scoring, narrative generation |
| Validation | Is the data clean? | CDISC CORE + custom rules, per-record evidence, triage workflow |

Additional: domain browser (raw data grids) and HTML report generator.

Cross-view navigation carries context — clicking "Related views" in the context
panel navigates to the target view with the relevant organ or endpoint
pre-selected.

> This section will be expanded after the current view merge is complete.

## Rules engine

The rules engine transforms unified findings into structured signals through
four sequential steps.

### Step 1: Rule evaluation

19 rules at three scopes evaluate each finding:

| Rule | Scope | What it detects |
|------|-------|-----------------|
| R01 | Endpoint | Treatment-related finding (dose-dependent change) |
| R02 | Endpoint | Statistically significant pairwise difference at specific dose |
| R03 | Endpoint | Statistically significant dose-response trend |
| R04 | Endpoint | Adverse-classified finding (ECETOC assessment) |
| R05 | Endpoint | Monotonic dose-response pattern |
| R06 | Endpoint | Threshold dose-response pattern |
| R07 | Endpoint | Non-monotonic / inconsistent pattern |
| R08 | Organ | Convergent target organ evidence (multi-domain flag) |
| R09 | Organ | Multi-domain evidence (2+ domains for same organ) |
| R10 | Endpoint | Large effect size (\|g\| >= 1.0) |
| R11 | Endpoint | Moderate effect size (0.5 <= \|g\| < 1.0) |
| R12 | Endpoint | Histopathology incidence increase at high dose |
| R13 | Endpoint | Dose-dependent severity grade increase |
| R14 | Study | NOAEL successfully established |
| R15 | Study | NOAEL not established (adverse effects at lowest dose) |
| R16 | Organ | Correlated findings within same organ system |
| R17 | Study | Mortality signal (dose-dependent deaths) — critical severity |
| R18 | Endpoint | Protective effect — decreased incidence with treatment |
| R19 | Endpoint | Strong protective effect — high baseline + large treatment reduction |

Each rule emits a severity level (info / warning / critical), structured
evidence, and parameters. Endpoint rules run per-finding (~989 signals produce
up to ~975 rule results).

### Step 2: Clinical enrichment

A 15-entry clinical catalog (C01–C15) adds biological context after rule
evaluation:

| ID | Pattern | Class | Target organs | Action |
|----|---------|-------|---------------|--------|
| C01 | Male reproductive atrophy/degeneration | Sentinel | Testis, epididymis, seminal vesicle, prostate | Adverse |
| C02 | Ovary atrophy/follicular depletion | Sentinel | Ovary | Adverse |
| C03 | Uterus atrophy | High concern | Uterus | Adverse |
| C04 | Malignant neoplasia | Sentinel | Any organ | Adverse |
| C05 | Benign neoplasia | Context dep. | Any organ | Flag |
| C06 | Neurotoxic injury | Sentinel | Brain, spinal cord, peripheral nerve | Adverse |
| C07 | Bone marrow hypocellularity/aplasia | Sentinel | Bone marrow | Adverse |
| C08 | Liver necrosis/degeneration | High concern | Liver | Adverse |
| C09 | Kidney tubular necrosis/degeneration | High concern | Kidney | Adverse |
| C10 | Heart myocardial necrosis/degeneration | High concern | Heart | Adverse |
| C11 | Lung diffuse alveolar damage/hemorrhage | High concern | Lung | Adverse |
| C12 | GI tract ulceration/perforation | Sentinel | Stomach, intestine, colon | Adverse |
| C13 | Lymphoid depletion | High concern | Thymus, spleen, lymph node | Adverse |
| C14 | Liver hypertrophy (adaptive) | Moderate | Liver | Flag |
| C15 | Thyroid follicular hypertrophy/hyperplasia | Moderate | Thyroid | Flag |

Sentinel findings have severity promoted (info -> warning). Seven protective
exclusion rules (PEX01–PEX07) suppress protective labels when clinical context
makes them irrelevant (reproductive organs, neoplasia, sentinel/high-concern
matches, single-animal decreases).

### Step 3: Suppression

Redundant signals are removed so each finding carries only its strongest signal:

- R04 (adverse) suppresses R01 (treatment-related) and R03 (trend)
- R01 (treatment-related) suppresses R07 (non-monotonic)

### Step 4: Signals panel

The signals panel engine synthesizes natural-language statements from NOAEL,
target organ, and signal summary data. Each statement has a fixed priority
constant that routes it to a UI zone:

| Priority band | UI zone | Examples |
|:-------------:|---------|---------|
| 900–1000 | Decision bar | NOAEL assignment, sex difference, low confidence |
| 800–899 | Target organs | Organ identification (multi-domain convergence) |
| 600–799 | Evidence | Dose-response synthesis, treatment-related signal |
| 400–599 | Modifiers | Sex-specific organ patterns |
| 200–399 | Caveats | Single-domain organs, widespread low power |
| < 200 | Suppressed | Not rendered |

## Cross-domain syndromes

Syndromes connect findings across domains (laboratory, organ weights,
histopathology, clinical observations) into toxicological mechanisms. Each
syndrome specifies **required evidence** (must be present) and **supporting
evidence** (strengthens confidence), with compound boolean logic and minimum
domain count requirements.

### Organ-focused syndromes (XS01–XS10)

| ID | Syndrome | SOC | Required evidence |
|----|----------|-----|-------------------|
| XS01 | Hepatocellular injury | Hepatobiliary | ALT or AST + supporting (SDH, BILI, liver weight, liver necrosis/hypertrophy) |
| XS02 | Cholestatic injury | Hepatobiliary | ALP AND (GGT or 5NT) |
| XS03 | Nephrotoxicity | Renal | CREAT AND (BUN or kidney weight or urine SG or kidney tubular pathology) |
| XS04 | Myelosuppression | Blood/Lymphatic | NEUT or PLAT or (RBC AND HGB) |
| XS05 | Hemolytic anemia | Blood/Lymphatic | RBC AND HGB AND RETIC |
| XS06 | Phospholipidosis | Metabolic | Multiple organ foamy macrophages + phospholipid markers |
| XS07 | Immunotoxicity | Immune | WBC or LYMPH or thymus weight |
| XS08 | Stress response | Systemic | Adrenal weight AND (BW or thymus weight or LYMPH) |
| XS09 | Target organ wasting | Metabolism | Body weight + supporting (food consumption, organ weight, atrophy) |
| XS10 | Cardiovascular | Cardiac | QTc or PR or RR or HR intervals + supporting (heart weight, cardiomyopathy, troponins) |

### Extended syndromes (XC01a–XC12c)

23 additional syndromes covering bone marrow lineages (myeloid, erythroid,
megakaryocyte), hemolytic anemia multi-organ, thyroid disruption (enzyme
induction vs. direct), adrenal effects (stress, HPA suppression,
steroidogenesis block), reproductive toxicity (testicular, Leydig cell,
accessory organs, ovarian, uterine), CNS/PNS degeneration, dermal/injection
site effects, and ocular effects (retinal, lens, corneal).

Full syndrome definitions and term matching tables are in
`docs/knowledge/syndrome-engine-reference.md`.

### Syndrome intelligence

Beyond detection, each syndrome is assessed for:

- **Discriminating evidence** — differential diagnosis between similar
  syndromes (e.g., hepatocellular vs. cholestatic liver injury)
- **Magnitude floors** — biologically trivial findings are filtered out
  (organ-specific thresholds on Hedges' g and fold change)
- **Directional gating** — key markers must change in the expected direction
  (e.g., reticulocytes must decrease for myelosuppression)
- **Certainty levels** — `pattern_only`, `mechanism_uncertain`, or
  `mechanism_confirmed`, with caps applied for single-domain evidence,
  missing confirmatory domains, or directional gate violations
- **Treatment-relatedness** — per-syndrome A-factor assessment (dose-response,
  cross-endpoint corroboration, statistical significance)
- **Adversity** — per-syndrome adverse/non-adverse/equivocal determination
- **Recovery tracking** — per-syndrome recovery assessment across terminal and
  recovery arms
- **Translational confidence** — species-to-human concordance using
  likelihood ratios from published data

## Assessment framework

### ECETOC adversity assessment

Two-phase finding classification aligned with the ECETOC framework:

**Phase 1 — A-factors (treatment-relatedness gate):**

| Factor | What it measures | Scoring |
|--------|------------------|---------|
| A-1 | Dose-response pattern | Monotonic = 2, threshold = 1.5, non-monotonic = 0.5, flat = 0 |
| A-2 | Cross-domain corroboration | Corroborated = 1, uncorroborated = 0 |
| A-3 | Historical control comparison | Outside 2SD = +0.5, within = -0.5 (OM only) |
| A-6 | Statistical significance | p < 0.05 = 1, trend p < 0.05 = 0.5 |

A-score < 1.0 -> "not treatment-related" (stops here). A-score >= 1.0 ->
proceed to B-factors.

**Phase 2 — B-factors (adversity determination):**

| Factor | Condition | Result |
|--------|-----------|--------|
| B-0 | Adversity dictionary lookup | tr_adverse |
| B-1 | \|g\| >= 1.5 | tr_adverse (large magnitude) |
| B-2 | \|g\| >= 0.8 AND corroborated | tr_adverse (moderate + supported) |
| B-3 | \|g\| < 0.5 | tr_non_adverse (small effect) |
| B-4 | Fallback | equivocal |
| B-6 | Progression chain evaluation | Escalate if on path to worse outcome |

Output: one of `tr_adverse`, `tr_non_adverse`, `non_tr`, `equivocal`,
`adaptive`.

Six adaptive decision trees handle context-dependent assessment for specific
organs (liver, thyroid, adrenal, thymus/spleen, kidney, gastric).

### Progression chains

14 organ-specific progression chains (YAML-driven) evaluate whether a current
finding is a precursor to a more severe outcome. Example — liver:

```
minimal hepatocellular hypertrophy -> moderate hypertrophy ->
vacuolation -> single cell necrosis -> hepatocellular necrosis
```

If a finding is an obligate precursor to a more severe finding observed in the
same study, the assessment escalates to `tr_adverse`.

Organs covered: liver, kidney, thyroid, adrenal, testis, ovary, mammary gland,
lymph node, spleen, bone marrow, lung, heart, GI tract, pancreas.

### Confidence scoring

Six independent dimensions produce a GRADE-style evidence confidence score:

| Dimension | What it measures | Score |
|-----------|------------------|:-----:|
| D1 — Statistical strength | p-value and trend significance | +1 / 0 / -1 |
| D2 — Dose-response quality | Pattern quality (monotonic > threshold > non-monotonic) | +1 / 0 / -1 |
| D3 — Concordance | Corroboration from other domains for same organ | +1 / 0 / -1 |
| D4 — Historical control | Within or outside historical control range | +1 / 0 / -1 |
| D5 — Cross-sex consistency | Same finding classification in both sexes | +1 / 0 / -1 |
| D6 — Equivocal zone | Finding in 0.75–1.0 SD equivalence band | 0 / -1 |

Grade thresholds: sum >= 2 -> HIGH, 0–1 -> MODERATE, <= -1 -> LOW.

### Historical controls

Historical control data contextualizes findings against published reference
ranges:

- **Source:** NTP DTT IAD (National Toxicology Program Dose-to-Tox Interactive
  Analysis Database)
- **Coverage:** 12 strains (4 rat, 3 mouse, beagle, 2 NHP, rabbit, minipig),
  16 organs, 3 study durations (28-day, 90-day, chronic)
- **Matching:** strain-specific, sex-specific, duration-specific with
  progressive filter relaxation (exact match -> same species -> pooled)
- **Assessment:** treated-group mean vs. historical control [mean +/- 2SD].
  Within range -> reduces concern (-0.5). Outside range -> increases concern
  (+0.5).

## Annotations

Expert judgments persist as JSON alongside the study data — no database
required. Annotation files can be version-controlled, shared, or archived with
the study.

### Expert forms

| Annotation | View | What the expert provides |
|------------|------|-------------------------|
| Treatment-relatedness | Dose-response | Yes / No / Equivocal / Not Evaluated |
| Adversity | Dose-response | Adverse / Non-Adverse-Adaptive / Not Determined |
| Pathology peer review | Histopathology | Agreed / Disagreed / Deferred + revised severity |
| Bradford Hill causality | Dose-response | 9-criteria causal assessment (5 auto-scored + 4 expert) |
| Normalization override | Findings | Override auto-selected organ weight normalization mode |
| Endpoint bookmarks | Dose-response | Star-toggle for endpoints of interest |
| Validation disposition | Validation | Per-rule and per-record review status |

### Backend overrides

| Override | What it controls |
|----------|------------------|
| Pattern override | Expert selects correct dose-response pattern; system re-derives treatment-relatedness -> adversity -> confidence |
| Mortality override | Include or exclude individual early deaths from analysis |
| NOAEL override | Expert determination of NOAEL with rationale |

Pattern overrides trigger a full re-derivation chain: the downstream fields
(treatment-relatedness, adversity, confidence) are recomputed automatically to
maintain consistency.

### Organ weight normalization

Four normalization modes, auto-selected based on body weight confounding
detection:

| Mode | When appropriate | Limitation |
|------|------------------|------------|
| Absolute | No BW confounding | Misses changes when BW varies |
| Body weight-relative | Standard approach | Misleading when BW is treatment-affected |
| Brain-relative | BW confounded + brain unaffected | Brain must be unaffected by treatment |
| ANCOVA | BW confounded | Requires sufficient n; adjusts for covariate |

The expert can override the auto-selection per organ.

## Settings

Eight analysis parameters that recalculate results when changed:

| Setting | Controls |
|---------|----------|
| Recovery pooling | Pool recovery animals with terminal, or analyze separately |
| Scheduled-only toggle | Include or exclude unscheduled sacrifice animals |
| TK satellite exclusion | Automatically detected and excluded from main analysis |
| Significance threshold | p-value cutoff for statistical significance (default 0.05) |
| Trend test method | Jonckheere-Terpstra or Cochran-Armitage |
| Effect size metric | Hedges' g (default), Cohen's d, or Glass's delta |
| Multiplicity correction | Bonferroni or Dunnett's |
| Equivalence band | Threshold for flat vs. non-monotonic pattern classification |

## Validation

Dual-engine validation combines standard conformance with study-specific data
quality checks.

**CDISC CORE engine** — 400+ standard conformance rules for SEND data (required
variables, controlled terminology, referential integrity, metadata
completeness).

**Custom rules (14)** — 7 study design rules (SD-001 through SD-007) that
interpret trial design domains (DM, TA, TE, TX, EX) to flag study design
interpretation issues (orphaned subjects, ambiguous controls, dose
inconsistencies), plus 7 FDA data quality rules (FDA-001 through FDA-007)
targeting common reviewer concerns (categorical data in numeric fields, timing
alignment, BQL imputation, early-death bias, QTc correction documentation).

Results are merged (CORE takes precedence on overlaps) and surfaced in a
triage UI:

1. Rules evaluate every record in the study
2. Issues appear in a sortable, filterable grid with severity and affected
   record counts
3. Per-record drill-in: inspect individual records, mark as
   reviewed/accepted/flagged
4. Evidence renderers tailored to different issue types show source data, rule
   logic, and suggested resolution

## SEND standard support

SENDEX targets **SENDIG v3.1** (Standard for Exchange of Nonclinical Data
Implementation Guide). Input data is read from SAS XPT transport files
conforming to SEND 3.0 or 3.1 datasets. The SENDIG version and controlled
terminology version are extracted per-study from TS parameters (`SNDIGVER`,
`SNDCTVER`) when available.

Non-conforming datasets are not rejected — the validation engine flags missing
required domains, variables, and controlled terminology violations as findings
with severity tiers, so partial or legacy datasets can still be explored.

### Supported domains

| Category | Domains |
|----------|---------|
| Special Purpose | DM, DS, TS, TA, TE, TX, SE |
| Interventions | EX |
| Findings | BG, BW, CL, CO, DD, EG, FW, LB, MA, MI, OM, PC, PP, SC, VS |
| Supplemental | SUPPMA, SUPPMI |
| Relationships | RELREC |

### Species coverage

| Species | Concordance | ECG | Preferred biomarkers | HCD | PK scaling |
|---------|:-----------:|:---:|:--------------------:|:---:|:----------:|
| Rat | Full | Yes | SDH, GLDH, KIM-1, Clusterin, Troponins | SD, Wistar Han, F344 | Yes |
| Dog | Full | Yes (gold-standard QTc) | -- | -- | Yes |
| Monkey | Full | Yes (Fridericia QTc) | -- | -- | Yes |
| Mouse | Full | Yes | -- | CD-1, C57BL/6 | Yes |
| Rabbit | Partial | -- | -- | -- | Yes |
| Minipig | -- | -- | -- | -- | Yes |
| Hamster | -- | -- | -- | -- | Yes |
| Guinea Pig | -- | -- | -- | -- | Yes |

Rat has the deepest support: strain-specific historical control data,
FDA-qualified biomarker panels, and human non-relevance mechanism detection.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript 5.9, TailwindCSS 4, TanStack Query + Table, Radix UI, ECharts, Vite |
| Backend | FastAPI, Python, pandas, scipy, pyreadstat, orjson |
| Data | SEND .xpt files, pre-generated analysis JSON, SQLite (historical control database) |
