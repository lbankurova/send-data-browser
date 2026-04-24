# backend/data/source/ — MI/MA HCD source extractions

Curated per-row extractions from published histopathology HCD papers, feeding
`hcd_mi_incidence` via `backend/etl/hcd_mi_{chamanza,maita}.py`.

Covers DATA-GAP-MIMA-18. Extraction protocol:
`docs/_internal/incoming/datagap-mima-18-extraction-protocol.md`.

## Files

### Canonical (ETL input)

| File | Content |
|---|---|
| `chamanza_2010.csv` | Post-review Chamanza 2010 extraction — 234 per-sex rows, cyno, 60 studies 2003–2009 |
| `maita_1977.csv` | Post-review Maita 1977 extraction — 19 per-sex rows, Beagle, Sankyo 1977 |
| `catalog_coverage.json` | Per-species coverage state (partial/full, sources, row-count targets + actuals) |

### Audit trail (retained per protocol Q1 decision)

| File | Content |
|---|---|
| `{source}_pass1.csv` | First-pass linear extraction (manual tuple encoding) |
| `{source}_pass2.csv` | Second-pass verification (different extraction path: regex-based cell parse for Chamanza, full-text percentage scan for Maita) |
| `{source}_ambiguities.md` | Ambiguity log — every non-trivial interpretation decision documented with Chosen / Alternative / User-review checkbox |

Pass-1 and pass-2 CSVs MUST agree before merge (automated diff gate). Any disagreement
becomes an AMB entry. All pass-1/pass-2 disagreements at time of commit: **0**.

## Re-running

```bash
# Regenerate pass-1 from TABLE_DATA encoding in the encoder scripts
python backend/data/source/.chamanza_pass1_encoder.py
python backend/data/source/.maita_pass1_encoder.py

# Re-verify pass-2 against pass-1 (reparses PDF, flags any disagreement)
python backend/data/source/.chamanza_pass2_verifier.py
python backend/data/source/.maita_pass2_verifier.py

# Rebuild canonical + regenerate spot-check list
python backend/data/source/.build_canonical.py

# Validate provenance (strict — every row's cited PDF page must resolve)
python backend/etl/validate_hcd_mi_source_csv.py backend/data/source/chamanza_2010.csv docs/_internal/research/hcd-nhp-dog_beagle/chamanza2010.pdf
python backend/etl/validate_hcd_mi_source_csv.py backend/data/source/maita_1977.csv docs/_internal/research/hcd-nhp-dog_beagle/maita1977.pdf

# Load into hcd.db
python -m etl.hcd_mi_chamanza build
python -m etl.hcd_mi_maita build

# Run fixture tests
pytest backend/tests/test_hcd_mi_chamanza_maita_etl.py -v
```

## Source PDFs

Not in this directory. See `docs/_internal/research/hcd-nhp-dog_beagle/`:
- `chamanza2010.pdf` — Chamanza et al. 2010, *Toxicol Pathol* 38(4):642–657
- `maita1977.pdf` — Maita, Masuda, Suzuki 1977, *Exp. Anim.* 26(2):161–167

## Coverage state

| Species | Sources | Status | DATA-GAP |
|---|---|---|---|
| CYNO | chamanza_2010 | Full (234 rows, 33 organs) | — |
| BEAGLE | maita_1977 | **Partial** (19 rows, 5 organs) | DATA-GAP-MIMA-21 (Chandra 2010 acquisition) |

Frontend/engine consumers should read `catalog_coverage.json` and surface
partial-coverage state per product thesis (honest uncertainty communication).

## Validator escape hatch

Rows flagged `validator_known_failure` bypass provenance validation. This requires:
1. Explicit AMB entry documenting why `fitz` can't resolve the cited PDF cell
   (rotated table, multi-column layout, figure-embedded text)
2. Manual visual check recorded in the AMB entry
3. User sign-off on that specific AMB entry before merge

This is **not** a tier-based exemption (confidence=LOW rows still must validate);
it is a per-row documented exception. No escape-hatch rows in current commit.
