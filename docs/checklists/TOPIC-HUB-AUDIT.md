# TOPIC Hub Audit Checklist

Run after any refactor touching >3 files, after major feature work, or after code splits/merges. Can also be run on-demand to verify hub quality.

**Scope:** All 10 TOPIC hubs in `docs/incoming/arch-overhaul/TOPIC-*.md`.

---

## Hub inventory

| # | Hub | File |
|---|-----|------|
| 1 | Data Pipeline | `TOPIC-data-pipeline.md` |
| 2 | Organ Measurements | `TOPIC-organ-measurements.md` |
| 3 | Syndrome Engine | `TOPIC-syndrome-engine.md` |
| 4 | Histopathology | `TOPIC-histopathology.md` |
| 5 | Recovery Phase Detection | `TOPIC-recovery-phase-detection.md` |
| 6 | NOAEL Determination | `TOPIC-noael-determination.md` |
| 7 | Study Intelligence | `TOPIC-study-intelligence.md` |
| 8 | Dose-Response View | `TOPIC-dose-response-view.md` |
| 9 | Subject Profile | `TOPIC-subject-profile.md` |
| 10 | Validation Engine | `TOPIC-validation-engine.md` |

---

## Step 1: Structural consistency

Every hub must have these sections in order:

- [ ] **Header** — Title (`# Topic Hub: {Name}`), last-updated date, overall status summary
- [ ] **What Shipped** — Subsections describing shipped features with tables
- [ ] **Key Commits** — Table of milestone commits (hash + description)
- [ ] **What's NOT Shipped** — "Deferred by Design" table + "Known Gaps" or "Known Bugs" tables
- [ ] **Roadmap** — Near-term / Medium-term / Production tiers
- [ ] **File Map** — Grouped by backend/frontend, with line counts and role descriptions
- [ ] **Cross-TOPIC Boundaries** — Table of files owned by other hubs that this subsystem touches
- [ ] **Totals** — Summary table (scope / files / lines) at the end of File Map

Flag any hub missing a section. First 4 hubs (data-pipeline, organ-measurements, syndrome-engine, histopathology) were written by explorer agents and are most likely to have structural gaps.

---

## Step 2: Line count verification

For every file listed in a hub's File Map → Implementation section:

```bash
# Run from repo root. Example for one file:
wc -l frontend/src/lib/cross-domain-syndromes.ts
```

- [ ] **File exists.** Every listed file must exist at the stated path.
- [ ] **Line count matches.** Hub's stated count must match `wc -l` output. Tolerance: 0 lines (exact match expected).
- [ ] **Section subtotals match.** Sum of individual file counts must equal the section header total.
- [ ] **Grand total matches.** Sum of all section subtotals must equal the Totals table.

Record mismatches as: `{hub} — {file}: hub says {N}, actual {M} (delta {±D})`.

---

## Step 3: Ownership audit

Each implementation file should be "owned" by exactly one hub. Shared files appear in multiple hubs but must be annotated.

- [ ] **No duplicate ownership.** A file listed in Hub A's Implementation section must not also appear in Hub B's Implementation section without an italic cross-reference annotation (e.g., `*also in TOPIC-X*` or `*owned by TOPIC-X*`).
- [ ] **Cross-references are bidirectional.** If Hub A lists a file as `*owned by TOPIC-B*`, Hub B must list that file in its Implementation section (or Cross-TOPIC Boundaries must reference it).
- [ ] **New files are claimed.** After a refactor that creates new files, verify each new file appears in exactly one hub's File Map.

Known shared files to watch:
- `findings_pipeline.py` — owned by data-pipeline, referenced by syndrome-engine
- `insights_engine.py` — owned by study-intelligence, referenced by data-pipeline
- `useFindingsAnalyticsLocal.ts` — owned by data-pipeline, referenced by syndrome-engine and dose-response
- `FindingsContextPanel.tsx` — ownership depends on which subsystem's panes dominate

---

## Step 4: Cross-reference accuracy

- [ ] **Commit hashes resolve.** Spot-check 2-3 commit hashes per hub with `git log --oneline {hash}`.
- [ ] **"What's NOT Shipped" items are still unshipped.** Scan deferred items — if any have since been implemented, move them to "What Shipped" or remove them.
- [ ] **Roadmap items are still future.** If a roadmap item has shipped, move it.

---

## Step 5: Content quality

- [ ] **Status line is current.** The header's overall status summary should reflect the current state, not the state at initial writing.
- [ ] **Last-updated date.** Must be updated whenever the hub is modified.
- [ ] **No stale renames.** If a file was renamed (e.g., `AdverseEffectsView.tsx` → `FindingsView.tsx`), all hubs must use the current name.

---

## When to run

| Trigger | Scope |
|---------|-------|
| Refactor touching >3 files | Hubs whose File Maps list affected files |
| Major feature implementation | Hub for the affected subsystem |
| Code split or merge | Both old and new hubs |
| File rename | All hubs (grep for old name) |
| On-demand quality check | All 10 hubs |
| New hub created | Structural consistency check only |
