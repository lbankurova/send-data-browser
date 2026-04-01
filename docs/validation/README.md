# SENDEX Validation Suite

Automated validation of SENDEX signal detection against known ground truth from synthetic datasets and study reports.

## Approach

Two layers, cleanly separated:

1. **Engine output** (`engine-output.md`) — per-study facts read directly from generated JSON. No verdicts, no human input. Shows what the engine produced: study design, dose groups, finding classification counts, NOAEL/LOAEL, target organs, provenance, validation issues.

2. **Signal detection** (`signal-detection.md`) — compares engine output against reference cards encoding injected/documented signals. Verdicts are binary: DETECTED or MISSED. Design assertions use MATCH or MISMATCH. Dashboard in `summary.md`.

Most studies are **synthetic datasets** with known, deliberately injected signals. The engine either found what was planted or it missed it.

## Reference Cards

Each study has a YAML file in `references/` encoding what is known about the dataset by construction. Every claim traces to a source document (nSDRG, study report, define.pdf). Cards are version-controlled facts, not opinions.

## Study Sources

All datasets from [PhUSE SEND pilot](https://github.com/phuse-org/phuse-scripts/tree/master/data/send) (MIT license). Source documents in `C:/pg/pcc-studies2import/`.

| Study | Origin | Species | Signals Known | Source |
|---|---|---|---|---|
| PointCross | Synthetic | SD Rat | 13 engineered (nSDRG 6.2) | nSDRG |
| Study1 (CBER-POC) | Synthetic | Cynomolgus | None (single-arm) | Covance report |
| Study2 (CBER-POC) | Synthetic | NZW Rabbit | 10 vaccine pharmacology | Study report |
| Study3 (CBER-POC) | Synthetic | Cynomolgus | None (no control) | VECTORSTUDYU1 report |
| Study4 (CBER-POC) | Synthetic | NZW Rabbit | 11 vaccine pharmacology | rabbivi.pdf |
| Study5 (CBER-POC) | Synthetic | Beagle Dog | 7 CV safety pharm | Study report |
| CJUGSEND00 | Synthetic | Cynomolgus | 2 CV/EG (no report) | nSDRG |
| CJ16050 | Synthetic | SD Rat | 6 respiratory biphasic | Raw RE data |
| PDS | Synthetic | SD Rat | None documented | readme.md |
| instem/GLP003 | Synthetic | SD Rat | None documented | readme.txt |
| FFU | Real | Cynomolgus | None (no report) | define.pdf |
| Nimble | Synthetic | F344 Rat | None documented | define.pdf |
| TOXSCI (4 studies) | Real | SD Rat / Beagle | None (no reports) | TOXSCI publication |

## Regeneration

All validation documents are auto-generated. Never edit them manually.

```bash
# Full pipeline: regenerate study data + run tests + regenerate docs
bash scripts/regenerate-validation.sh

# Docs only (skip data regeneration):
cd frontend && npx vitest run tests/generate-validation-docs.test.ts
```

Or use the slash command: `/regen-validation`

## Documents

- [summary.md](summary.md) — dashboard with totals, missed signals, design mismatches
- [engine-output.md](engine-output.md) — per-study engine facts (auto-generated)
- [signal-detection.md](signal-detection.md) — actual vs planted signals (auto-generated)
- [references/](references/) — per-study YAML reference cards with expert notes on discrepancies

## Ground Truth Tests

`frontend/tests/ground-truth-validation.test.ts` — 26 vitest assertions, CI gate. Runs on every commit. Separate from the docs (tests catch regressions, docs communicate results).
