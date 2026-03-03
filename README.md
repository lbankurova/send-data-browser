# SENDEX — SEND Explorer

Decision support framework for preclinical toxicology studies in [CDISC SEND](https://www.cdisc.org/standards/foundational/send) (.xpt) format. Reads study folders, runs a statistical and classification pipeline, and surfaces findings through question-driven analysis views.

## What it does

SENDEX structures the analytical workflow around the common tasks: detect treatment-related effects → characterize dose-response → assess causality → evaluate reversibility → determine NOAEL. At each step SENDEX pre-computes statistics (Dunnett's, Williams', Fisher's exact, ANCOVA, trend tests), flags cross-domain syndromes (24 rules), scores signals against ECETOC assessment tiers, and then puts the evidence in front of the reviewer to interpret.

Dual-engine validation runs 400+ CDISC CORE conformance rules alongside 14 custom study design and FDA data quality checks, with per-record evidence and a triage UI.

## Analysis views

| View | Question it answers |
|---|---|
| Study details | What happened? Metadata, design, timeline, analysis settings |
| Findings | What's affected? Cross-domain adverse effects, syndrome detection, organ drill-down |
| Dose-response | Is it treatment-related? Endpoint characterization, statistical method switching, Bradford Hill causality |
| Histopathology | Are the lesions real? Severity matrices, trends, recovery classification, peer review |
| NOAEL determination | What's the NOAEL? Signal analysis, adversity assessment, protective factors, narrative generation |
| Validation | Is the data clean? CDISC CORE + custom rules, unified triage UI |

Plus a raw domain browser and HTML report generator.

## Quick start

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m generator.generate PointCross   # pre-generate analysis data
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev                               # http://localhost:5173
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript 5.9, TailwindCSS 4, TanStack Query + Table, Radix UI, ECharts, Vite |
| Backend | FastAPI, Python, pandas, scipy, scikit-posthocs, pyreadstat |
| Data | SEND .xpt files, pre-generated analysis JSON, SQLite (historical control database) |

See [ARCHITECTURE.md](ARCHITECTURE.md) for pipeline details, module map, and engine inventory.

## License

[MIT](LICENSE)
