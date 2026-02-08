# Incoming Feature Specs

This directory is the handoff point for feature specifications from external contributors.

## How it works

1. **Contributor** writes a feature spec following the format below
2. **Contributor** places it in this directory and commits
3. **Implementing agent** reads the spec, creates or updates the relevant `systems/*.md` doc, and implements
4. **After implementation**, the incoming spec is archived (moved to `incoming/archive/`) — the `systems/*.md` doc is now the authoritative source

## Spec format

Use this template. The goal is to give an LLM agent everything it needs to implement the feature without asking questions.

```markdown
# [Feature Name]

## What this does
(1-2 sentences. What user problem does this solve?)

## User workflow
(Step-by-step: what the user does, what the system does in response)

## Data model
(Input data: where it comes from, schema, format)
(Output data: what's computed/stored, schema, format)
(API endpoints: method, path, request/response — if applicable)

## UI specification
(Which view(s) this appears in)
(Layout: where in the three-panel layout does this live?)
(Components: what UI elements, what interactions)
(States: loading, empty, error, populated)

## Integration points
(Which existing systems does this touch? Reference docs/systems/*.md)
(Which existing views does this affect? Reference docs/views/*.md)
(New dependencies: libraries, APIs, data sources)

## Acceptance criteria
(Bulleted list of testable statements: "When X, then Y")

## Datagrok notes
(How should this work in the production Datagrok plugin?)
(Which Datagrok APIs are relevant? Reference docs/platform/datagrok-patterns.ts by pattern #)

## Open questions
(Anything the implementer needs to decide or clarify)
```

## Naming convention

`[feature-name].md` — lowercase, hyphenated. Examples:
- `study-import.md`
- `batch-export.md`
- `subject-view.md`

## What NOT to put here

- Bug reports (use GitHub issues)
- Design discussions (use the spec's "Open questions" section)
- Code (specs only — no `.ts`, `.py`, `.tsx` files)
