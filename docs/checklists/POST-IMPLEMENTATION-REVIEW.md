# Post-Implementation Review Checklist

Run after implementing a feature from a spec in `docs/incoming/`. Must complete before considering work done or committing.

**CRITICAL: This review must be a genuine verification pass, not a recall exercise.** You wrote the code — your memory of what you coded is unreliable. The only valid evidence is the spec text compared side-by-side against the actual code. If you find yourself writing "PASS" without having the spec open in one hand and the code open in the other, you are shortcutting the review.

**MANDATORY: Steps 0–1 must be executed by an independent review agent** (see Step 0 below). The agent that wrote the code cannot review its own work.

---

## Step 0: Launch independent review agent

**Do not perform Steps 0–1 yourself.** Launch a separate agent to do the review. The agent that implemented the code has confirmation bias — it will recall what it intended to write, not what it actually wrote.

Launch the agent with:
- **Prompt:** "You are reviewing someone else's implementation against a spec. You have not seen the implementation before. Your job is to find every mismatch between spec and code. Read the spec file, then read each changed file, and produce the evidence table described below."
- **Inputs:** (1) The spec file path. (2) The list of changed/created files. (3) The evidence format template from Step 1.
- **No implementation context.** Do not include your implementation notes, rationale, or design decisions in the prompt. The agent must form its own understanding from the spec and code alone.

The agent returns the evidence table. You then proceed from Step 2 onward (data reuse audit, contracts, etc.) — those are mechanical checks that don't suffer from confirmation bias.

### If the spec has its own verification checklist

Tell the agent to run it first. Every item: PASS, FAIL, or N/A with a file:line reference.

---

Many specs include a verification/gate checklist (often the final section, e.g., "§11 Verification Checklist"). If the spec has one, **run it first**. Every item: PASS, FAIL, or N/A with a file:line reference. Do not skip items or mark PASS without reading the code.

---

## Step 1: Four-dimension requirement trace

**Re-read the spec from the file** (do not rely on memory). For every requirement, verify four dimensions:

| Dimension | Question | What to check |
|-----------|----------|---------------|
| **WHAT** | Does the right thing happen? | Feature exists, function is called, UI element renders |
| **WHEN** | Does it trigger under exactly the right conditions? | Every "when", "if", "only when" clause has a matching code condition |
| **UNLESS** | Is it suppressed when it should be? | Every "unless", "not when", "hidden when" clause has a negation guard |
| **HOW** | Does the exact format, text, styling match? | See HOW sub-checks below |

**Most common failure mode: WHEN/UNLESS.** A feature that exists but activates unconditionally when the spec says "only when X" is a behavioral gap.

### Evidence requirement

**Every PASS must include both the spec quote AND the corresponding code quote, side by side.** No evidence = no PASS. Format:

```
Requirement: [exact quote from spec]
Code: [file:line] [exact code that implements it]
Verdict: PASS / FAIL
```

This makes mismatches self-evident. If the spec says "horizontal bars" and the code says `xAxis: { type: "category" }` with vertical bars, the contradiction is visible in the evidence itself. You cannot write PASS after producing contradictory evidence without it being obviously wrong.

**Do not paraphrase the spec.** Copy the exact sentence. Paraphrasing lets you unconsciously rewrite the requirement to match what you built.

### HOW sub-checks

| Sub-check | What to compare | Example failures |
|-----------|----------------|------------------|
| **Text content** | Exact wording, labels, suffixes, prefixes | Missing "(worst case)" suffix |
| **Text layout** | Line breaks, indentation, separators | Flat list instead of primary/others split |
| **Typography** | `text-[size]`, `font-weight`, `text-color` | Wrong font-weight, wrong opacity |
| **Spacing** | Margins, padding, gaps (Tailwind) | `mx-0.5` instead of `mx-1.5` |
| **Visual elements** | Icons, markers, symbols, borders, orientation | Vertical chart instead of horizontal |
| **Sort/order** | Column order, sort direction, axis orientation | Ascending instead of descending, wrong axis |

When spec says "promoted from [Component]" or "same as [Component]", **read that component's code** and verify the implementation matches its behavior — don't invent from scratch.

When spec includes a code snippet or className, compare **character by character**.

---

## Step 2: Data reuse audit

For every new function/computation/derived value:
- Search codebase for existing hooks, utilities, generated JSON, derived-summary functions computing the same value
- Cross-reference `docs/knowledge/methods-index.md` and `docs/knowledge/field-contracts-index.md`
- Flag duplications: "DUPLICATION — [new location] recomputes [value] already available from [existing source]"

### Step 2a: Contract field entry audit

For every new or changed computed field crossing the engine→UI boundary:
- **Backend field:** Does `docs/knowledge/api-field-contracts.md` have a BFIELD-XX entry? Are the type, nullability, enum values, and invariants still accurate?
- **Frontend field:** Does `docs/knowledge/field-contracts.md` have a FIELD-XX entry? Do the documented invariants match the code?
- If no entry exists, create one (next available ID). If an entry exists but is stale, update it.
- Flag: "CONTRACT DRIFT — [BFIELD-XX / FIELD-XX] documented as [X], code produces [Y]"

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

## Step 6: Produce the full spec-vs-code diff for user review

**Before declaring work done**, present the complete requirement trace to the user. This is not a summary — it is the evidence from Step 1 (spec quote + code quote + verdict for every requirement). The user reviews the side-by-side evidence and confirms or challenges each verdict.

**This step is non-negotiable.** The review is not complete until the user has seen the evidence. "Visual verification required" is acceptable for rendering-only items, but the spec-vs-code textual comparison must be presented regardless.

---

## Anti-patterns (how this review fails)

These are the specific ways this review has been shortcut in the past. Watch for them:

1. **Reviewing your own code.** The implementer has confirmation bias. This is why Step 0 requires launching an independent agent. If you skip the agent and do Steps 0–1 yourself, the review is invalid.
2. **Writing PASS from memory.** Re-read both the spec and the code. Every time. The independent agent enforces this by design — it has no memory of the implementation.
3. **Paraphrasing the spec.** "The spec says to add a bar chart" ≠ "SVG horizontal bars, side-by-side per sex, promoted from DoseDetailPane." Copy the exact words.
4. **Checking WHAT but not HOW.** "Bar chart exists" is WHAT. "Bar chart is horizontal with doses on Y axis" is HOW. Both must pass.
5. **Treating build+tests as behavioral verification.** TypeScript compilation tells you the types are right. Tests tell you the logic is right. Neither tells you the chart is oriented correctly or the stepper filters the table.
6. **Feeding implementation context to the review agent.** The agent's prompt should contain ONLY the spec path and changed file list. No design rationale, no "here's what I did" summaries. The agent must form its own understanding from the artifacts alone.
