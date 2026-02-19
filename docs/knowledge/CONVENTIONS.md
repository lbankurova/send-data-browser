# Knowledge Reference Conventions

Specs reference knowledge files. Knowledge files never reference specs.

```
docs/knowledge/dependencies.md   — external standards, datasets, references (stable IDs)
docs/knowledge/methods.md        — statistical tests, algorithms, scoring formulas (stable IDs)
```

## Frontmatter Schema

Every spec in `docs/incoming/` and `docs/views/` carries a YAML block:

```yaml
---
depends-on: [SENDIG-3.1, CDISC-CT, HCD-CRL]
methods: [STAT-07, CLASS-01, METRIC-01]
status: active
replaces: [old-spec-name.md]
blocked-by: [HCD-CRL]
---
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `depends-on` | list of IDs | yes | IDs from `dependencies.md` |
| `methods` | list of IDs | yes | IDs from `methods.md` |
| `status` | enum | yes | `active` \| `implemented` \| `archived` \| `blocked` |
| `replaces` | list of filenames | no | Spec files this one supersedes |
| `blocked-by` | list of IDs | no | Dependency IDs that are stubbed or unavailable |

Empty lists are fine: `depends-on: []` means the spec has no external dependencies.

## Status Values

- **active** — spec is current, not yet fully implemented
- **implemented** — spec has been built and committed
- **archived** — superseded or abandoned (moved to `archive/`)
- **blocked** — cannot proceed until `blocked-by` entries are resolved

## Common Queries

```bash
# What specs depend on SENDIG 3.1?
grep -r "SENDIG-3.1" docs/incoming/ docs/views/

# What specs use Dunnett's test?
grep -r "STAT-07" docs/incoming/ docs/views/

# What's blocked on historical control data?
grep -r "blocked-by:.*HCD" docs/incoming/

# All blocked specs
grep -rl "status: blocked" docs/incoming/

# What references a specific method?
grep -r "METRIC-09" docs/incoming/ docs/views/
```

## Rules

1. **One-way dependency.** Specs reference knowledge files via stable IDs.
   Knowledge files never reference spec filenames. This means renaming,
   archiving, or deleting a spec requires zero changes to knowledge files.

2. **Add before tagging.** If a spec references an external standard, dataset,
   or method that doesn't have an ID yet, add the entry to `dependencies.md`
   or `methods.md` first, then tag the spec with the new ID.

3. **IDs are stable.** Once assigned, an ID is never reassigned to a different
   entry. Deleted entries leave their ID permanently retired.

4. **Grep is the query engine.** No index file, no database. The frontmatter
   is plain text; grep answers every cross-reference question.
