# SENDEX — SEND Explorer

Analytical browser and decision support framework for preclinical toxicology
studies in [CDISC SEND](https://www.cdisc.org/standards/foundational/send) (.xpt)
format. Reads study folders, runs a statistical and classification pipeline, and
surfaces findings through question-driven analysis views.

**Your feedback is important** — We are soliciting feedback and contributions
from the preclinical toxicology community.
- Try the [hosted demo](https://send-data-browser.onrender.com) (first load may
  take ~1 minute)
- or [open an issue](https://github.com/lbankurova/send-data-browser/issues) on
  GitHub.

> The production version will also be integrated into
> [Datagrok](https://datagrok.ai) as a plugin to enable richer "free-world"
> exploration, and enterprise features like connecting to proprietary databases,
> access control, etc.

## What it does

SENDEX structures the analytical workflow around the common tasks: detect
treatment-related effects → characterize dose-response → assess causality →
determine NOAEL → evaluate reversibility. At each step SENDEX pre-computes
statistics (Dunnett's, Williams', Fisher's exact, ANCOVA, trend tests), flags
cross-domain syndromes (47 rules across 10 organ-focused and 23 cross-organ
chain patterns), scores signals against ECETOC assessment tiers, and puts the
evidence in front of the reviewer to interpret.

30 compound class profiles across 9 modalities (monoclonal antibodies, ADCs,
vaccines, gene therapy, oligonucleotides, and more) contextualize expected
pharmacological findings so they don't drive adversity calls.

Dual-engine validation runs 400+ CDISC CORE conformance rules alongside 14
custom study design and FDA data quality checks, with per-record evidence and a
triage UI.

![sendex-app](docs/img/sendex-app.png)

## Analysis views

| View | Question it answers |
|---|---|
| Study details | What happened? Study metadata, design interpretation, dose groups, provenance messages, mortality |
| Findings | What's affected? Cross-domain signal detection, dose-response characterization, time course, distribution, recovery, NOAEL determination, syndrome detection, organ drill-down |
| Cohort | Who are the driving animals? Subject similarity, biological outlier detection, LOO sensitivity, per-animal influence *(in development)* |
| Validation | Is the data clean? CDISC CORE + custom rules, unified triage UI |

Plus a domain data browser for raw SEND tables and an HTML report generator.

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
| Special Purpose | CO, DM, DS, SC, SE, TA, TE, TS, TX |
| Interventions | EX |
| Findings | BG, BW, CL, DD, EG, FW, LB, MA, MI, OM, PC, PP, TF, VS |
| Supplemental | SUPPMA, SUPPMI |
| Relationships | RELREC |

### Species coverage

| Species | Domains | Syndrome Overrides | HCD (Organ Weight) | HCD (Lab) | ECG |
|---------|:-------:|:------------------:|:-------------------:|:---------:|:---:|
| Rat | Full (15) | 2 (baseline species) | SD, F344, Wistar Han (16 organs, 59-190+ studies) | He 2017 + NTP IAD (77 tests) | Yes |
| Dog | Full (15) | 9 | Choi 2011 (15 organs, 950 animals) | Choi 2011 (30 tests) | Yes (gold-standard QTc) |
| Monkey | Full (15) | 8 | Amato 2022 (7 organs, 4047 animals) | Kim 2016 (64 tests) | Yes (Fridericia QTc) |
| Mouse | Full (15) | — (proxied from rat) | B6C3F1, C57BL/6, CD-1 | NTP IAD (22-60 tests) | Yes |
| Rabbit | Partial | 11 | — | Ozkan 2012 (25 tests, low confidence) | — |
| Guinea Pig | Partial | 11 | — | — | — |
| Minipig | Partial | — | — | — | — |
| Hamster | Partial | — | — | — | — |

Rat has the deepest support: strain-specific historical control data,
FDA/EMA-qualified renal biomarker panels (KIM-1, clusterin, NGAL), and human
non-relevance mechanism detection (PPARa agonism, male rat alpha-2u-globulin
nephropathy, TSH-mediated thyroid tumors).

### Compound class profiles

30 profiles across 9 modalities gate expected pharmacological findings from
adverse classification within severity thresholds.

| Modality | Profiles |
|----------|:--------:|
| Monoclonal antibody | 13 (9 mAb sub-classes + Fc-fusion + 3 recombinant proteins) |
| ADC | 8 (base + 7 payload classes) |
| Gene therapy | 6 (AAV, lentiviral, LNP-mRNA, 3 gene editing) |
| Vaccine | 2 (adjuvanted, non-adjuvanted) |
| Oligonucleotide | 1 (ASO/siRNA/shRNA/aptamer) |
| Small molecule | Not profiled. Too diverse for class-level expected effects; drug-specific annotation planned. |

## Quick start

```bash
# Backend
cd backend
pip install -r requirements.txt
OPENBLAS_NUM_THREADS=1 python -m generator.generate PointCross  # pre-generate analysis
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev                               # http://localhost:5173
```

> **Windows note:** Set `$env:OPENBLAS_NUM_THREADS = 1` in PowerShell before
> running the backend — without it, pandas import hangs on some configurations.

14 validation studies ship with the repo (4 real-world submissions, 10 CDISC
synthetic) covering rat, dog, NHP, rabbit, and safety pharmacology designs.
Ground truth is established per study via YAML reference cards
(`docs/validation/references/`) with expert-annotated expected signals and
design decisions.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript 5.9, TailwindCSS 4, TanStack Query + Table, Radix UI, ECharts, Vite |
| Backend | FastAPI, Python, pandas, polars, scipy, pyreadstat, orjson |
| Data | SEND .xpt files, pre-generated analysis JSON, SQLite historical control database (NTP IAD, published literature, user uploads) |

See [ARCHITECTURE.md](ARCHITECTURE.md) for pipeline details, module map, and
engine inventory.

## License

[Apache 2.0](LICENSE)
