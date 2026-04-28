# Commit-intent protocol

> **Purpose:** prevent the autopilot-vs-manual-staging conflation pattern. Documented 4 occurrences (commits 1370c103, 521f1d16, a47ee865, abdb31c9) with the same root cause: git's index is global per repo, so a parallel session's `git add` pollutes the staged set of any other session that hasn't yet committed.
>
> **Status:** Strict from day one. No advisory grace period.

---

## The failure mode

Git's staging area (the index) is **shared across sessions** working in the same checkout. Concrete sequence:

1. Session A runs `git add foo.py bar.py`.
2. Session B (concurrent autopilot) runs `git add unrelated.txt`.
3. Session A runs `git commit -m "feat: foo + bar"`. The commit includes `foo.py`, `bar.py`, AND `unrelated.txt` because they all sit in the same index.
4. Session A's commit message describes only foo+bar; `unrelated.txt` is misattributed.
5. Future readers grep `git log -- unrelated.txt` and see the wrong message.

Pre-commit Step -1 (commit-lock acquisition) catches **concurrent commits** but not **concurrent staging** that already happened before either commit's hook ran.

## The protocol

Every commit in this repo declares its intended file set BEFORE staging:

```
bash scripts/declare-commit-intent.sh <topic-slug> <file1> <file2> ...
git add <file1> <file2> ...
git commit -m "..."
```

Pre-commit Step -0.5 reads `.lattice/commit-intent.txt`, computes `staged_set - intent_set` and `intent_set - staged_set`, and:

- **Unexpected files staged** (`staged \ intent`) → BLOCK with a list of intruders + cite the four prior CONFLATED-COMMIT precedents.
- **Declared-not-staged** (`intent \ staged`) → WARN (split-commit and partial-commit are legitimate; the author may have chosen to commit a subset).
- **No intent file** → BLOCK with remediation message.

Post-commit hook deletes `.lattice/commit-intent.txt` on success. Single-shot semantics: the next commit must re-declare.

## Helper script flags

```
bash scripts/declare-commit-intent.sh <topic> <file1> [...]   # initial declaration
bash scripts/declare-commit-intent.sh --add <file1> [...]     # extend declared set
bash scripts/declare-commit-intent.sh --clear                 # remove intent file
bash scripts/declare-commit-intent.sh --show                  # inspect current intent
```

## Intent file format

```
# Commit intent file -- consumed by hooks/pre-commit Step -0.5
# Single-shot: cleared by hooks/post-commit on successful commit.
# See feedback_concurrent_autopilot_staging.md for the pattern this prevents.
Topic: lattice-framework-redesign-spec-f4
Holder: manual-pid-12345
Created: 2026-04-28T22:00:00Z

scripts/foo.py
backend/tests/baseline.json
hooks/pre-commit
```

Lines starting with `#` are comments. `Key: value` lines (Topic / Holder / Created) are headers. All other non-blank lines are file paths. Paths are exact — no globs, no wildcards. Use `--add` for in-flight scope additions.

## Holder identity

The `Holder` field is sourced from `LATTICE_LOCK_HOLDER` env var if set (autopilot path), else `manual-pid-$$` (manual path). Surfaced in the BLOCK message so a conflation surfaces *which* session's intent was violated.

## Why exact paths, not globs

Globs defeat the gate. An intent file containing `**/*.py` makes every Python file "expected"; the conflation slips through unflagged. The gate's purpose is to force the author to know precisely what they're committing. The legitimate concern (evolving file sets — e.g., a script emits multiple files into a directory) is solved by `--add`, not by relaxing the contract.

## Why strict from day one (no advisory grace period)

Four documented occurrences of the same conflation. Each iteration of "tighten later" was another instance of the bug shipping. CLAUDE.md rule 14 — "no unprompted deferrals" — applies: "tighten later" is exactly that anti-pattern. The friction of declaring intent is acceptable; silent conflation is not.

## Failure modes the gate does NOT catch

- **Same-session conflation.** If a single session stages 10 files when only 5 were intended, the gate works only if the author declared intent for 5. If they declared all 10, no block. The protocol pushes intent-discipline upstream of the gate.
- **Pre-staged work from a previous session.** If the index already has unrelated files when a session starts, declaring intent for *only the new files* will trip the block. The remediation message tells the author to `git restore --staged` the unrelated files OR `--add` them deliberately. This is a feature: forces a conscious choice.
- **Sub-file conflation.** Two sessions modify the same file at different lines; one session's diff bleeds into the other's commit. Outside this gate's scope; `git diff --cached` would catch it pre-commit but no automatic discipline exists.

## Cross-references

- `feedback_concurrent_autopilot_staging.md` — the original memory note that named the pattern (after commit 1370c103, 2026-04-26).
- `.lattice/decisions.log` — search `CONFLATED-COMMIT` for the four occurrences.
- `hooks/pre-commit` Step -1 — the existing commit-lock that catches concurrent commits but not concurrent staging.
- `hooks/pre-commit` Step -0.5 — the new gate this protocol implements.
- `hooks/post-commit` — single-shot cleanup of the intent file.
- `scripts/declare-commit-intent.sh` — the helper.
