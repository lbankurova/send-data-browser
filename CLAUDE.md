# CLAUDE.md

## Project Overview

SENDEX (SEND Explorer) — web app for exploring pre-clinical regulatory study data (SEND format). XPT files in `send/` → FastAPI REST API → React frontend.

**Product thesis:** Every insight that can be auto-generated MUST be auto-generated. Primary audience is scientists doing daily analytical work. At small N (non-rodent, N=3-5), the system's value is honest uncertainty communication — surfacing fragile estimates, confidence qualifiers, and power limitations — not hiding them. A scientist who knows their NOAEL is fragile makes better decisions than one who doesn't.

- **Docs (internal):** `docs/_internal/` — all specs, architecture, research, decisions, backlog
- **Docs (public):** `docs/` root — methods, species/vehicle profiles, scientific logic
- **Backlog:** `docs/_internal/TODO.md`
- **Feature specs:** `docs/_internal/incoming/`
- **Architecture:** `docs/_internal/architecture/`
- **View specs:** `docs/_internal/views/`
- **Research:** `docs/_internal/research/`

## Development Commands

### Backend (FastAPI + Python)
```bash
# Start dev server (set OPENBLAS_NUM_THREADS=1 to avoid pandas import hang)
# Use PowerShell: $env:OPENBLAS_NUM_THREADS=1
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/uvicorn.exe main:app --reload --port 8000 --reload-exclude ".venv-core" --reload-exclude "_core_engine"

# Install dependencies
C:/pg/pcc/backend/venv/Scripts/pip.exe install -r C:/pg/pcc/backend/requirements.txt

# Run analysis generator for a study
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe -m generator.generate PointCross

# API docs: http://localhost:8000/docs
```

### Frontend (React + Vite)
```bash
cd C:/pg/pcc/frontend && npm run dev      # Dev server at http://localhost:5173
cd C:/pg/pcc/frontend && npm run build    # TypeScript check + production build
cd C:/pg/pcc/frontend && npm run lint     # ESLint
cd C:/pg/pcc/frontend && npm test         # Vitest
```

### Windows Shell Notes
- Always use forward slashes in bash commands (`C:/pg/pcc/...` not `C:\pg\pcc\...`)
- Run Python/pip via full venv path: `C:/pg/pcc/backend/venv/Scripts/python.exe`
- When starting backend in PowerShell, set `$env:OPENBLAS_NUM_THREADS = 1` first
- **Never `pip install` while the dev server is running.** `--reload` corrupts venv DLLs mid-install. Stop server first, install, restart.
- **No non-ASCII characters in print/log statements.** Windows console uses cp1252 encoding — Unicode arrows (`→`), em-dashes (`—`), etc. in `print()` or `logging` calls crash the process with `UnicodeEncodeError`. Use ASCII equivalents (`->`, `--`).

## Rules

1. **Design system changes require explicit user approval.** No agent may modify design system documents (`docs/_internal/design-system/*.md`), design tokens (`design-tokens.ts`), CSS custom properties (`index.css`), design decision tables, or the audit checklist without the user's prior explicit approval. Propose changes, then wait.

2. **Audit checklist is mandatory.** Every design audit must run the full checklist at `docs/_internal/design-system/audit-checklist.md`.

3. **View spec changes that affect UI/UX require explicit user approval.** Propose changes to `docs/_internal/views/*.md`, then wait. Exceptions: changes required for a user-requested feature, designing from scratch, blanket approval.

4. **Never add Claude as a co-author.** No `Co-Authored-By` in commit messages.

5. **Reuse before reinventing.** Before writing new logic: (a) search codebase for existing hooks/functions/generated JSON; (b) check `docs/_internal/knowledge/methods-index.md` and `field-contracts-index.md`; (c) check `docs/_internal/knowledge/species-profiles.md` and `docs/_internal/knowledge/vehicle-profiles.md`. Duplicating existing data is a defect.

6. **Doc lifecycle: specs are disposable, system docs are durable.** After implementing from a spec: archive it (`docs/_internal/incoming/archive/`), extract durable knowledge into `docs/_internal/knowledge/` or `docs/_internal/architecture/`, and log open gaps in `docs/_internal/TODO.md`. Architecture specs must be updated when their subsystem ships changes — create if missing.

7. **Circuit breaker on repeated failures.** Same root cause fails 5 times → stop, report, ask the user.

8. **No directory sprawl.** Agents must not create new top-level directories under `docs/` or anywhere in the repo root. New internal documentation goes into an existing `docs/_internal/` subfolder. If none fits, propose the location to the user first.

9. **Bug fix protocol — read before patching, escalate after two failures.** Before changing code to fix a bug: (a) read the FULL module/component involved — not just the error line; (b) for CSS/layout bugs, map the complete parent->child layout chain and state what the current values ARE before changing what they SHOULD BE; (c) state root cause hypothesis before editing any code. If first fix doesn't work: re-read code, form a genuinely NEW hypothesis — do not patch the patch. If second fix doesn't work: STOP, tell the user both hypotheses and what disproved them, ask for direction.

10. **Pre-write protocol for new code.** Before writing new functionality (features, not bug fixes): (a) read design decision tables in `.claude/rules/design-decisions.md`; (b) read ALL files you're about to modify, not just the entry point; (c) search for existing hooks/utils/patterns that overlap with what you're building (rule 5); (d) state your approach in 3-5 bullets before writing code.

11. **New spec → ROADMAP intake.** When a spec enters `docs/_internal/incoming/`: read `docs/_internal/ROADMAP.md`, classify the spec (bug fix → TODO.md, feature → ROADMAP entry, epic → new ROADMAP section), link to existing items. A spec without a ROADMAP entry is orphaned work.

12. **Merit-driven architectural decisions.** Evaluate every architectural decision on scientific correctness and product value. Effort/complexity is not a valid factor in choosing between approaches. If approach A is more scientifically sound or delivers more analytical value than approach B, choose A regardless of implementation cost.

13. **No unprompted deferrals.** Never defer a feature, capability, or design element to a "later phase" or "future work" unless (a) there is a real technical dependency that blocks it now, or (b) the user has explicitly decided to defer it. "It would be simpler to do later" is not a valid reason.

14. **Science preservation gate.** Code cleanup, refactoring, or "simplification" that changes scientific or analytical behavior is not a cleanup — it's a functional change. Before simplifying domain logic: (a) identify what analytical output would change; (b) if any output changes, flag it as SCIENCE-FLAG — do not proceed without scientist review; (c) distinguish accidental complexity (bad code — simplify) from essential complexity (domain rules encoded in code — protect). Bare lint exemptions are defects — always add a comment explaining why the complexity is load-bearing.

15. **Impact analysis before touching shared code.** Before modifying files in `frontend/src/lib/`, `backend/services/analysis/`, or any export consumed by 3+ files, run `/ops:impact` on the target first. Know what breaks before you edit.

16. **Verify empirical claims against actual data.** When a spec, plan, or criterion makes a numeric claim about data ("count drops to 2", "shows N rows"), verify against `backend/generated/{study}/unified_findings.json` at spec-write, implementation, and review gates. Mirror-pattern tests do NOT satisfy this — use fixture tests against real generated output. Don't infer from code — read the output.

17. **Spec value audit before build.** Any spec entering `docs/_internal/incoming/` that proposes more than one feature / UI surface / override must pass `docs/_internal/checklists/SPEC-VALUE-AUDIT.md` before architect review signs off. The audit catches categorical "we infer N things, each needs a UI" reasoning — the spec author must document per-feature frequency, current workaround, and downstream impact rather than categorical justification. Reviewers produce PASS / SCOPE REDUCTION REQUIRED / EVIDENCE GAP. Failure mode: spec ships featuritis that nobody catches until collision review during an unrelated spike (precedent: `study-design-override-surfaces-scope-challenge.md`, 2026-04-21).

## Architecture Gotchas

**`analysis_views.py` routing:** Must use `APIRouter(prefix="/api")` with full paths in decorators (not path params in the router prefix — FastAPI/Starlette doesn't route those correctly).

**Dual syndrome engines — do not merge.** Two files both detect "syndromes" at different abstraction levels: `syndrome-rules.ts` (histopathology-specific, input: organ lesion rows) and `cross-domain-syndromes.ts` (cross-domain, input: endpoint summaries spanning LB/BW/MI/MA/OM/CL). Intentionally separate.

## Design Decisions

Design decision tables (color, typography, spacing, components, casing, layout) live in `.claude/rules/design-decisions.md` (loaded automatically every session). That file is the source of truth — view specs or design guides may have been incorrectly modified.

## TypeScript Conventions

- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
- Path alias: `@/*` maps to `src/*`

## Where Rules Live

Rules not in this file are enforced by hooks, rules files, or skill prompts:

| What | Where | Enforcement |
|------|-------|-------------|
| Design decisions (31 items) | `.claude/rules/design-decisions.md` | Loaded every session |
| Frontend UI gate (6 rules) | `.claude/rules/frontend-ui-gate.md` | Loaded every session |
| Domain knowledge lookup | `.claude/rules/domain-knowledge-map.md` | Loaded every session |
| UI casing conventions | `docs/_internal/reference/ui-casing-conventions.md` | Reference |
| Interactivity requirements | `docs/_internal/reference/interactivity-rule.md` | Reference |
| Commit checklist (11 items) | `docs/_internal/checklists/COMMIT-CHECKLIST.md` | Review gate hook blocks commits |
| Spec value audit (rule 17) | `docs/_internal/checklists/SPEC-VALUE-AUDIT.md` | Architect-review / peer-review skill prompt |
| Post-implementation review | `docs/_internal/checklists/POST-IMPLEMENTATION-REVIEW.md` | Review gate hook blocks commits |
| Doc regeneration | Pre-commit hook + `/lattice:review` | Hook blocks if stale |
| Topic trailers | PreToolUse hook | Hook warns on missing Topic: |
| Pipeline test-first | PreToolUse hook | Hook blocks without tests |
| Empirical claim detail + example | `/lattice:implement`, `/lattice:review` | Skill prompt |
| Token conformance (raw hex / arbitrary Tailwind / inline px) | `scripts/audit-tokens.sh` | Pre-commit hook Step 4e (advisory — see GAP-264) |
