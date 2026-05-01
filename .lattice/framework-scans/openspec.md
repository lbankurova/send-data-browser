# OpenSpec — Lattice/SENDEX Leverage Analysis

**URL:** https://github.com/Fission-AI/OpenSpec
**Verdict:** MEDIUM
**One-line:** OpenSpec is a lightweight TypeScript CLI that scaffolds + validates `proposal/design/tasks/spec` markdown bundles for AI-assistant-driven feature work; the schema itself is too thin for SENDEX, but its *cumulative-spec-with-delta-merge* architecture is a genuine pattern Lattice does not have and would benefit from.

## What it is

OpenSpec is an npm package (`@fission-ai/openspec`, v1.3.1, MIT) you install globally and run `openspec init` inside a project. It writes an `openspec/` directory and registers slash-command files for ~20 AI-assistant tools (Claude Code, Cursor, Copilot, etc.) so you can drive the workflow with `/opsx:propose <name>`, `/opsx:apply`, `/opsx:archive`, plus extras (`new`, `continue`, `ff`, `verify`, `sync`, `bulk-archive`, `onboard`).

The actual abstraction is a **two-tier directory model**: `openspec/specs/<capability>/spec.md` is a cumulative source-of-truth describing how the system currently behaves; `openspec/changes/<feature-name>/` is a self-contained proposal bundle (`proposal.md` + optional `design.md` + `tasks.md` + a `specs/<capability>/spec.md` *delta file*). At archive time the CLI parses each delta file's `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` sections and *merges them into the main capability spec*, then moves the change folder under `openspec/changes/archive/<timestamp>-<name>/`. The cumulative spec keeps growing; the changes folder is just the staging area for one increment.

The validation layer is a Zod schema (`src/core/schemas/{base,change,spec}.schema.ts`) plus a markdown parser (`src/core/parsers/markdown-parser.ts`, `requirement-blocks.ts`) that enforces a deliberately small set of structural rules: every requirement must contain "SHALL" or "MUST", every requirement must have at least one `#### Scenario:` (exactly four hashtags — three fail silently is called out in their schema), the proposal `## Why` section must be 50-1000 chars, max 10 deltas per change. Dependencies are minimal: `commander` (CLI), `@inquirer/prompts` (interactive selects), `zod` (schemas), `yaml`, `fast-glob`, `chalk`, `ora`, `posthog-node` (telemetry, opt-out). No LLM calls — the CLI is pure scaffolding + validation; the LLM lives in whatever assistant you point at it.

## Comparison to Lattice's spec lifecycle

| Concern | OpenSpec | Lattice/SENDEX | Stronger |
|---|---|---|---|
| Spec authoring | 4 markdown files per change (proposal/design/tasks/spec-deltas), templates baked in | 1 spec markdown in `incoming/`, free-form per `spec-template.md`, frequently composed via `/lattice:research → /lattice:synthesize → /lattice:architect` | Lattice (richer authoring pipeline, per-feature value audit) |
| Spec format | Strict markdown grammar enforced by Zod + parser; SHALL/MUST + `#### Scenario:` mandatory | Free-form markdown; structure enforced by review skill prompts, not parsers | OpenSpec (mechanical) |
| Validation | `openspec validate` + zod runtime + parser; `archive` blocks on errors | Pre-commit hook chain, review-gate file, contract triangle audit, knowledge-graph audit, attestations dispatcher | Lattice (vastly broader — domain invariants, science gate, contract triangles); OpenSpec (sharper *spec-grammar* gate) |
| Change/spec separation | **First-class.** `specs/` is cumulative truth, `changes/` is staging | **Absent.** Specs live in `incoming/`, get archived as-is to `incoming/archive/`, and durable knowledge is *manually* extracted to `knowledge/` + `architecture/` per CLAUDE.md rule 7 | OpenSpec |
| Delta semantics | ADDED/MODIFIED/REMOVED/RENAMED with name-matching rebuild | None. New specs replace or layer on prior specs by convention; no automated merge | OpenSpec |
| Lifecycle gates | `propose → apply → archive` (3 phases) | `incoming → architect-review → research/synthesize/blueprint → build → review → commit → archive → extract-learnings` (8+ phases, multi-skill) | Lattice (much richer for high-stakes domain work) |
| Domain enforcement | None — spec-grammar only | Science preservation gate (rule 14), contract triangles (rule 18), algorithm defensibility (rule 19), knowledge-graph contradiction audit | Lattice |
| AI-assistant integration | Polished — `openspec init` writes slash-command files for 20+ tools | Lattice ships skills/rules for Claude Code; broader assistant fanout is not a goal | OpenSpec |
| Task tracking | `tasks.md` checkbox list parsed to track progress on apply | TODO.md as a prose registry; cycle-state YAML for in-flight work | Different abstractions; both work |
| Multi-author / agent-author awareness | Single-author assumption | Spec lifecycle explicitly anticipates agent-author + human-reviewer with `architect-review`, `peer-review`, `SPEC-VALUE-AUDIT.md` checklist | Lattice |

Honest summary: OpenSpec is *narrower* than Lattice and *sharper at the narrow thing*. It assumes the user is a single dev driving a vanilla feature change with an AI assistant; it does not (and does not try to) handle scientific defensibility, multi-skill pipelines, or domain knowledge graphs. Lattice's lifecycle is richer, but Lattice has nothing equivalent to OpenSpec's cumulative-spec model with delta merging.

## Concrete leverage opportunities

1. **Borrow the cumulative `specs/` + `changes/` separation** — high-value pattern.
   - OpenSpec source: `docs/concepts.md` "The Big Picture" section + `src/core/specs-apply.ts` (delta merge implementation).
   - Lattice slot: extend the spec lifecycle so that after `/lattice:extract-learnings` runs, a *cumulative behavior spec per capability* is maintained at e.g. `docs/_internal/specs/<capability>/spec.md`, and each `incoming/<feature>.md` carries a delta section describing what's being added/modified. CLAUDE.md rule 7 currently says "extract durable knowledge into `docs/_internal/knowledge/` or `docs/_internal/architecture/`" — that's prose extraction. A *structured cumulative spec* per capability would give us a queryable behavior contract, mirroring the structure of `contract-triangles.md` but for product behavior rather than data fields.
   - Why this is worth it for SENDEX specifically: today, a question like *"what is the canonical behavior of recovery verdict computation across all the specs we've ever shipped"* requires re-reading the archive. A cumulative spec keeps that answer one file away.

2. **Borrow the `## ADDED / ## MODIFIED / ## REMOVED Requirements` delta grammar** — medium value.
   - OpenSpec source: `schemas/spec-driven/schema.yaml` (the `specs` artifact instruction block), `src/core/parsers/requirement-blocks.ts`.
   - Lattice slot: add an optional `## Spec Deltas` section to `spec-template.md` (`C:/pg/lattice/scaffold/docs/_internal/scaffold/spec-template.md:1`) that, when present, declares how the spec modifies the cumulative behavior spec. Pairs with leverage #1.
   - Caveat: don't import the *whole* schema (RFC-2119 SHALL/MUST is overkill for SENDEX — most behavior changes are about analytical correctness, not contractual obligations). Borrow the delta-section structure only.

3. **Consider Zod + a markdown parser for spec validation** — low/medium value.
   - OpenSpec source: `src/core/schemas/*.schema.ts` (~40 lines of Zod) + `src/core/validation/validator.ts` (700 lines).
   - Lattice slot: would replace nothing existing — Lattice currently validates specs via skill-prompt review (`/lattice:architect`, `/lattice:peer-review`, `SPEC-VALUE-AUDIT.md`), not mechanical parsing. A 50-line zod schema enforcing "every spec has Behavior + Verification + Out-of-scope sections, every behavior has at least one Edge case" could be a `scripts/audit-spec-structure.py` (or .ts) similar to `scripts/audit-knowledge-graph.py`. Low priority because Lattice's existing review skills catch most of these issues; the value would be making the structural rules *mechanical and pre-commit-blocking* instead of skill-attentional.

4. **Cherry-pick the slash-command bootstrap pattern for new contributors** — low value.
   - OpenSpec source: `src/core/init.ts` (~28KB — writes per-tool slash-command files).
   - Lattice slot: no direct slot. Lattice's skill model already handles this via the `/lattice:*` namespace. Note as informational only.

## Risks / mismatches

- **Single-author / single-agent assumption.** OpenSpec's flow assumes one author per change. Lattice routinely has agent-author + architect-reviewer + peer-reviewer + human approver, with attestation logs and gate files. Importing OpenSpec wholesale would lose all of that; cherry-picking the structural pieces (leverage #1, #2) avoids the conflict.
- **No domain semantics.** OpenSpec's "valid spec" is a structural property (sections present, SHALL keyword present, scenario present). Lattice's "valid spec" is a *scientific* property (algorithm defensibility, knowledge-graph consistency, contract-triangle alignment). Adopting OpenSpec's validator without keeping Lattice's enforcement layer would be a regression.
- **MAX_DELTAS_PER_CHANGE = 10** (`src/core/validation/constants.ts:7`) is a hard cap with a "consider splitting" message. SENDEX specs routinely touch >10 surfaces (Phase 3 matchers, contract-triangle widening). Their cap doesn't fit our shape — would have to lift it or make it configurable.
- **The `#### Scenario:` four-hashtag rule** is brittle; their docs explicitly call out that three hashtags fail silently. If we adopt the parser we inherit that footgun.
- **OpenSpec is ~3 months old, single-org maintained, posthog telemetry on by default.** Importing the *library* (vs. copying the patterns) ties us to their release cadence and their telemetry posture. Pattern adoption is safer than dependency adoption.

## Recommendation

**Pattern-borrow, don't dependency-import.** Specifically:

1. **Adopt the cumulative-spec model** — propose a Lattice extension where `/lattice:extract-learnings` writes/updates `docs/_internal/specs/<capability>/spec.md` (cumulative behavior contract) in addition to its current knowledge/ and architecture/ outputs. The `incoming/<feature>.md` spec file gains an optional `## Spec Deltas` section using ADDED/MODIFIED/REMOVED/RENAMED grammar. Implementation is a small Python/TS script + a CLAUDE.md rule update. Reference implementation: `https://github.com/Fission-AI/OpenSpec/blob/main/src/core/specs-apply.ts`.

2. **Do not import `@fission-ai/openspec` as a dependency.** Their `init` writes slash-command files, their `apply` runs tasks — both conflict with Lattice's own skill model. Their Zod schemas are short enough (~40 lines) to re-author in our context if we want them.

3. **Skip the proposal/design/tasks separation.** Lattice already has richer equivalents (`SPEC-VALUE-AUDIT.md` for proposal, `/lattice:synthesize` for design, TODO.md + cycle-state for tasks). The 4-file split would be ceremony without value.

4. **Re-evaluate in 6 months** if OpenSpec adds: (a) configurable per-project schema (currently hard-coded RFC-2119 keywords are too narrow for science domains), (b) multi-author / reviewer-state tracking, (c) machine-readable cumulative-spec query API. Any of those would change the calculus from "borrow patterns" to "consider integration."

Bottom line for SENDEX: the cumulative-spec-with-deltas pattern (leverage #1) is the only piece worth real engineering effort. Everything else is either covered better by existing Lattice skills, or too thin to be worth the import cost.
