# Approval-test baselines

> **Status (2026-04-28):** F4 Phase 1 SHIPPED. Capture / diff / rationale parser / pre-commit wiring all live. PointCross baseline captured. Phase 2 (Nimble + PDS baselines) is the next expansion.
>
> Tooling:
> - `scripts/capture-approval-baseline.py {study}` — read engine output, build the baseline dict, validate, write JSON.
> - `scripts/diff-approval-baseline.py {study}` — diff captured baseline against current generated output. Scientific-tier diffs block unless rationale validates; presentation-tier diffs auto-log.
> - `scripts/test-diff-approval-baseline.py` — 15-case regression suite (rationale contract + diff semantics + end-to-end).
> - Pre-commit hook Step 0e auto-fires the diff on every algorithmic-paths commit.

Captures the analytical output of a study at a specific code state, so that future commits can be compared against the baseline and any change forced through a written rationale (per CLAUDE.md rule 19 + spec §6.2 two-tier policy).

This generalizes `scripts/validation-ratchet.sh` (which checks aggregate scores) to per-output values. **A regression in PointCross BW NOAEL = 20 mg/kg specifically would have triggered an explicit approval prompt for the BUG-031 commit.**

---

## Format: JSON per study

```
backend/tests/approval-baselines/
├── README.md             # this file
├── baseline.schema.json  # JSON-schema definition (validates structure, not values)
├── _example/             # minimal exemplar (NOT a real study capture)
│   └── baseline.json
└── {study_id}/           # one directory per study
    └── baseline.json
```

**Why JSON-per-study, not markdown:** `git diff` on JSON is readable AND scriptable; `git diff` on markdown tables is fragile (column-alignment changes produce false diffs). A companion human-readable summary is generated on demand by the F4 capture/diff script — it is not stored. (Resolved in spec §17 Q2.)

**Why per-study, not one combined file:** studies are captured / re-captured independently as data and code evolve; a per-study file keeps blast radius small and lets `git blame` attribute drift to the specific study + commit that produced it.

---

## Two-tier cut-line (spec §6.2 — essential complexity, do NOT collapse)

Per spec §19, the distinction between **scientific** and **presentation** tiers is essential. A future agent might "simplify" by unifying tiers — that would silently auto-approve scientific changes and is a defect.

**The cut question:** *"Does this output reflect an analytical conclusion?"*

| Tier | What goes here | Approval policy on change |
|---|---|---|
| **`scientific`** | NOAEL/LOAEL per endpoint × sex; adverse classification; target organ IDs; syndrome detections; signal scores; effect sizes; p-value adjustments; ECI dimension scores (D1-D9); within-category ranking; summary counts (total adverse / total treatment-related) | Diff BLOCKS commit unless the rationale-format contract is satisfied (see below). Recorded in `.lattice/decisions.log` with format `approval-test \| {study} \| {output} \| {old} -> {new} \| {rationale}`. |
| **`presentation`** | Display labels, formatting strings, doc timestamps, bundle sizes | Auto-approve, logged to `.lattice/approval-log.tsv` for forensic audit. No commit block. |

**Decisive cases:**
- `severity: "moderate"` on a finding → scientific (analytical conclusion about magnitude).
- `severity_label: "Moderate (3 of 5)"` for a presentation grid → presentation (formatting).
- `total_adverse: 12` → scientific (count derives from analytical classification).
- `bundle.frontend.bytes: 703040` → presentation (build artifact size).
- `noael_summary.suggested_noael: "20"` → scientific (regulatory conclusion).
- `noael_label_short: "20 mg/kg"` → presentation (formatting of an underlying scientific value).

**When in doubt, classify as scientific.** The friction of writing a rationale is acceptable; a silent scientific-tier auto-approve is the failure mode the cut-line exists to prevent.

---

## Top-level schema

```json
{
  "schema_version": 1,
  "study_id": "PointCross",
  "captured_at": "2026-04-27T14:30:00Z",
  "captured_against_commit": "abc1234",
  "captured_from": "backend/generated/PointCross/unified_findings.json",
  "captured_by": "scripts/capture-approval-baseline.py",

  "scientific": {
    "summary_counts": { ... },
    "noael_per_endpoint_sex": { ... },
    "adverse_classification": { ... },
    "target_organs": [ ... ],
    "syndrome_detections": [ ... ],
    "signal_scores": { ... },
    "effect_sizes": { ... },
    "p_value_adjustments": { ... },
    "eci_dimensions": { ... }
  },

  "presentation": {
    "labels": { ... },
    "format_strings": { ... },
    "bundle_artifacts": { ... }
  }
}
```

See `baseline.schema.json` for the formal validation rules and `_example/baseline.json` for a minimal concrete instance.

### Finding identifier

Within `scientific.adverse_classification`, `scientific.signal_scores`, `scientific.effect_sizes`, `scientific.p_value_adjustments`, and `scientific.eci_dimensions`, each finding is keyed by a stable composite identifier:

```
"{domain}.{test_code}.{specimen}.{sex}.{day}"
```

Examples:
- `LB.ALT.SERUM.M.29` — male serum ALT at day 29
- `BW..F.29` — female body weight at day 29 (no test_code, no specimen for BW)
- `MI.HEPATIC_DEGEN.LIVER.M.29` — male liver hepatic degeneration at day 29

`null` segments are emitted as empty strings (`""`); the identifier is always exactly 5 dot-separated segments. This format is required so that diff tooling can match findings across captures even when finding-list ordering changes.

### NOAEL identifier

`scientific.noael_per_endpoint_sex` keys are:

```
"{domain}.{test_code}.{specimen}.{sex}"
```

(no day — NOAEL aggregates across days). Each value is an object:

```json
{
  "tier": "high|low|below_tested|above_tested|insufficient_evidence",
  "value": "<dose-level-id-or-null>",
  "loael": "<dose-level-id-or-null>"
}
```

### Syndrome identifier

`scientific.syndrome_detections` is a list (order-independent at diff time, sort by `syndrome_id` for stable serialization):

```json
{
  "syndrome_id": "XS01",
  "certainty": "confirmed|likely|possible",
  "evidence_count": 4,
  "species_required": "rat|dog|cyno|null"
}
```

---

## Rationale-format contract (spec §20a Review-3 — load-bearing)

When a scientific-tier diff is detected, the F4 diff script writes the change to `.lattice/decisions.log` with this format:

```
{timestamp}	approval-test	{verdict}	{study_id}	{output_id}	{old} -> {new} | {rationale}
```

The rationale is parsed structurally. **Reject all of:**

- `n/a`, `na`, `idk`, `none`, `tbd`, `todo`, `same`, `same as before`, `no`, `yes`, `ok`, `fine`, `done`, `.`
- single-word values
- rationales with fewer than 10 non-whitespace characters
- rationales identical to the previous N rationales for the same study + output_id (suggests copy-paste habit, not real reasoning)

This mirrors the validator in `scripts/write-review-gate.sh` for the unified attestation format (SIMPLIFY-1) — same trivial-set, same minimum length, same defect-reporting style. **The rationale parser is a contract, not a heuristic; a shallow regex like `\w+` would collapse the F4 paper-trail goal to "type something" and is the failure mode the contract exists to prevent.**

Acceptable rationale examples:
- `"Switched Dunnett -> Bonferroni per spec X; p-adj changes 5-15% across pairwise; observed within range."`
- `"NOAEL drops from 80 to 20 mg/kg because the new direction-aware filter excludes 3 NS sign-flipping single-timepoint hits previously promoted to LOAEL."`
- `"Syndrome XS04 evidence_count: 3 -> 4 due to METH-XX wiring catching the renal-tubular degeneration cluster previously missed."`

Unacceptable:
- `"updated"` (single word)
- `"see commit message"` (defers; not a rationale in itself)
- `"n/a"` (trivial)
- `"same as PointCross"` (cross-study reference is fine but not a rationale in itself; explain WHY it is the same)

---

## Capture and diff workflow (Phase 1 shipped)

### Capture

```bash
# After regenerating engine output for the study:
python scripts/capture-approval-baseline.py PointCross
# -> backend/tests/approval-baselines/PointCross/baseline.json
```

The capture script reads `backend/generated/{study}/unified_findings.json` plus `syndrome_rollup.json`, projects each value into the scientific or presentation tier per the cut-line, emits a schema-conforming baseline, and validates it before writing. `--regenerate` runs the engine first; `--stdout` writes JSON to stdout for piping.

### Diff

```bash
# Run after a code change. Compare current generated output to captured baseline:
python scripts/diff-approval-baseline.py PointCross
python scripts/diff-approval-baseline.py --all          # every captured study
python scripts/diff-approval-baseline.py PointCross --staleness-check
```

When the diff finds scientific-tier changes, it requires a rationale via ONE of:

1. `--rationale-file <path>` — JSON or key:value file (preferred for tests).
2. `LATTICE_APPROVAL_RATIONALE='{...}'` — env var (one-shot, command-line scoped).
3. `.lattice/pending-approval-rationale.json` — sticky file the pre-commit hook reads. Single-shot: consumed on accept.

Required rationale fields (the F4 rationale contract per Review-3 — the parser is structural, not heuristic):

| Field | Minimum | Purpose |
|---|---|---|
| `study` | matches baseline.study_id | Anchors the rationale to one capture |
| `category` | 1+ char (or `"*"` for any) | Names which scientific category changed |
| `summary_old_new` | 12+ chars | One-liner: e.g. `"BW NOAEL 20 -> 80 mg/kg"` |
| `rationale_text` | 40+ chars, ≥4 distinct alphabetic word tokens, not in trivial-set, not duplicate-of-recent (last 5) | The actual "why" |

The trivial-set (rejected): `n/a`, `na`, `none`, `idk`, `tbd`, `todo`, `fix`, `fixed`, `same as before`, `no change`, `expected`, `looks fine`, `ok`, `approved`, `see commit`, `see code`. The duplicate-of-recent check scans both `.lattice/approval-log.tsv` and approval-test rows in `.lattice/decisions.log` so the rule applies across tiers.

When the rationale validates, the diff:
- Persists one row to `.lattice/decisions.log` per scientific category that changed.
- Auto-logs every presentation-tier diff to `.lattice/approval-log.tsv` (no block).
- Consumes `.lattice/pending-approval-rationale.json` if that was the source.

### Pre-commit wiring

`hooks/pre-commit` Step 0e fires when staged paths match the algorithmic-paths regex (same trigger as F3 peer-review). For each `backend/tests/approval-baselines/{study}/baseline.json` (excluding `_example`), it runs the diff with `--staleness-check`. A `unified_findings.json` older than any staged algorithmic file produces a warning that the regen is needed for the diff to be meaningful.

A scientific-tier diff without an acceptable rationale exits 1 from the diff script, which BLOCKS the commit. The hook prints remediation: write the rationale to `.lattice/pending-approval-rationale.json` and re-attempt.

---

## Schema versioning

`schema_version: 1` is the current shape. When the schema changes:

1. Bump the version field in this README and in `baseline.schema.json`.
2. Provide a one-shot migration script that converts existing baseline.json files to the new shape.
3. Run the migration on every existing study capture in the same commit that introduces the new version.
4. The diff script rejects baselines with mismatched `schema_version` rather than silently misinterpreting them.

This is the same discipline as the typed knowledge-graph schema spec (`docs/_internal/architecture/typed-knowledge-graph-spec.md`).

---

## Cross-references

- Spec: `docs/_internal/incoming/lattice-framework-redesign-spec.md` §6 (F4 acceptance criteria), §18.3 (format-settlement priority), §20a Review-3 (rationale-parser contract)
- Diagnosis: `docs/_internal/research/lattice-framework-defects-and-redesign.md` Part 2 (test-shape problem)
- BUG-031 retro: `docs/_internal/BUG-SWEEP.md#BUG-031` (the exemplar this baseline format would have caught)
- SIMPLIFY-1 attestations: `scripts/write-review-gate.sh` + `scripts/append-attestation.sh` (the validator pattern this rationale contract reuses)
