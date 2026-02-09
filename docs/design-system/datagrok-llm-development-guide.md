# Datagrok LLM Development Guide

Meta-guide for LLM-assisted Datagrok application development.

> **Condensed 2026-02-09.** Full original: `datagrok-llm-development-guide-original.md`. Restore by copying it over this file if agent performance degrades.

---

## 1. What Works

### Spec-First Development
Write the spec before code. Include: layout diagram, data schema (columns, types, grain), every UI element (widths, classes, colors), interaction model, state management, cross-view links, error/empty states. Ambiguity produces mediocre results; precision produces production-quality components.

### Layered Specs
Feed in order: (1) CLAUDE.md — architecture, permanent context. (2) Domain spec — data schemas, rules, terminology. (3) View spec — layout, columns, colors, interactions. (4) datagrok-patterns.ts — API patterns.

### Canonical Patterns File
`datagrok-patterns.ts` (27 patterns) is the LLM's API reference. Include in every coding session. Without it, the LLM hallucinates API calls. Update quarterly against DG releases.

### Handoff Documents
End-of-session: what was accomplished, files changed, current state, known issues, next steps, decisions made. CLAUDE.md serves as persistent handoff.

### UX Audits
Screenshot + spec → gap list. LLMs catch wrong fonts, missing empty states, incorrect colors, inconsistent casing.

### Real vs. Stub Separation
CLAUDE.md's migration guide catalogs every demo/stub/hardcoded item with file paths and line numbers. A developer can trust real components and focus effort on stubs.

---

## 2. What Doesn't Work

- **Asking LLMs to infer domain logic.** Write SEND rules in specs/YAML; the LLM implements the engine.
- **Expecting DG API knowledge without reference.** Always include `datagrok-patterns.ts`.
- **Long conversations (30+ exchanges).** Start new sessions with handoff doc.
- **Building everything in one pass.** Phase: (1) data pipeline, (2) one view as proof, (3) remaining views, (4) cross-view links, (5) polish.

---

## 3. Prompt Patterns

| Pattern | When to use |
|---------|-------------|
| "Read these files, tell me what you understand about X" | Before building — forces internalization, catches misunderstandings |
| "Here's the spec. Here's the code. Audit the gap." | Iteration — produces prioritized punch list |
| "Create a handoff document" | End of session — captures state for next session |
| "Build X in this phase order: types → hooks → component → wiring" | Multi-file features — prevents forward references |
| "Implement Pattern #N from datagrok-patterns.ts" | Specific DG features — eliminates API ambiguity |

---

## 4. Asset Maintenance

- **datagrok-patterns.ts** must compile against current DG API. Test quarterly.
- **Spec documents are living** — append, don't rewrite. Changelog at bottom, mark superseded sections.
- **Handoff documents** — archive with dates, never delete.
- **View specs** are dual-purpose: human docs + LLM-consumable specs. Include exact column names/widths, CSS classes, color values, state tables, data flow diagrams, error states.
- **CLAUDE.md** is the single source of truth for agent context. Every session reads it. Contains: architecture, conventions, decisions, status, migration guide.
