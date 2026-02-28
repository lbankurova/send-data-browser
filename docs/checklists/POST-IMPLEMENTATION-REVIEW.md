# Post-Implementation Review Checklist

Run after implementing a feature from a spec in `docs/incoming/`. Must complete before considering work done or committing.

---

## Step 0: Spec's own verification checklist

Many specs include a verification/gate checklist (often the final section, e.g., "§11 Verification Checklist"). If the spec has one, **run it first**. Every item: PASS, FAIL, or N/A with a file:line reference. Do not skip items or mark PASS without reading the code.

---

## Step 1: Four-dimension requirement trace

Re-read the spec section by section. For every requirement, verify four dimensions:

| Dimension | Question | What to check |
|-----------|----------|---------------|
| **WHAT** | Does the right thing happen? | Feature exists, function is called, UI element renders |
| **WHEN** | Does it trigger under exactly the right conditions? | Every "when", "if", "only when" clause has a matching code condition |
| **UNLESS** | Is it suppressed when it should be? | Every "unless", "not when", "hidden when" clause has a negation guard |
| **HOW** | Does the exact format, text, styling match? | See HOW sub-checks below |

**Most common failure mode: WHEN/UNLESS.** A feature that exists but activates unconditionally when the spec says "only when X" is a behavioral gap.

### HOW sub-checks

| Sub-check | What to compare | Example failures |
|-----------|----------------|------------------|
| **Text content** | Exact wording, labels, suffixes, prefixes | Missing "(worst case)" suffix |
| **Text layout** | Line breaks, indentation, separators | Flat list instead of primary/others split |
| **Typography** | `text-[size]`, `font-weight`, `text-color` | Wrong font-weight, wrong opacity |
| **Spacing** | Margins, padding, gaps (Tailwind) | `mx-0.5` instead of `mx-1.5` |
| **Visual elements** | Icons, markers, symbols, borders | Wrong separator character |
| **Sort/order** | Column order, sort direction | Ascending instead of descending |

When spec includes a code snippet or className, compare **character by character**.

---

## Step 2: Data reuse audit

For every new function/computation/derived value:
- Search codebase for existing hooks, utilities, generated JSON, derived-summary functions computing the same value
- Cross-reference `docs/knowledge/methods-index.md` and `docs/knowledge/field-contracts-index.md`
- Flag duplications: "DUPLICATION — [new location] recomputes [value] already available from [existing source]"

---

## Step 3: Create todo items for all gaps

Each gap needs: spec section reference, which dimension failed (WHAT/WHEN/UNLESS/HOW), exact spec quote, code's actual behavior, file:line reference.

---

## Step 4: Document decision points

If implementation chose one approach over alternatives in the spec, record the choice and rationale.

---

## Step 5: Flag cross-spec integration gaps

If spec references other specs/views needing changes, create a todo for each.

---

## Step 6: Present the full gap list to the user

Present before moving on, so they can prioritize or dismiss items.
