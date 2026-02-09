# Datagrok LLM Development Guide

A meta-guide on using large language models (LLMs) effectively for Datagrok application development. These practices were refined during the development of the SEND Data Browser prototype, where every view, component, and design decision was produced through LLM-assisted development. The lessons generalize to any Datagrok project.

---

## 1. What Works Well

### 1.1 Spec-First Development

Write the specification document before opening a code editor or starting an LLM conversation. The spec is the contract between the human designer and the LLM implementer.

**What a spec document contains:**
- Scientific question the view answers ("What happened in this study?")
- Layout diagram (ASCII art of the panel arrangement)
- Data schema (columns, types, grain, key identifiers)
- Every UI element enumerated: column headers, badge styles, color mappings, filter controls
- Interaction model: what happens when the user clicks, hovers, selects, navigates
- State management: what state exists, where it lives, what triggers updates
- Cross-view links: where each navigation link goes, what filter it applies
- Error and empty states: what shows when data is missing, loading, or filtered to zero

**Why it works:** LLMs excel at translating precise specifications into code. They struggle with ambiguity. A spec that says "show a grid with appropriate columns" produces mediocre results. A spec that says "12 columns: endpoint_label (200px, truncated at 25 chars), domain (colored badge, LB=bg-blue-100 text-blue-700), dose_level (colored badge, white text on dose color), ..." produces production-quality components on the first pass.

**SEND Data Browser evidence:** Every view was built from a detailed spec document. The study-summary.md spec alone is 370 lines covering the tab bar, heatmap cell rendering, grid columns, context panel panes, and data flow. The resulting component matched the spec within one revision cycle.

---

### 1.2 Layered Specs (Architecture to Implementation)

Structure specifications in layers, from abstract to concrete. Feed each layer in the right order.

| Layer | Document type | Content | When to feed to LLM |
|-------|--------------|---------|---------------------|
| 1. Architecture | CLAUDE.md, architecture section | Backend/frontend structure, API endpoints, routing, state management approach | Session start -- permanent context |
| 2. Domain logic | Spec documents (p1-p4) | Data schemas, statistical methods, rule engine, domain terminology | When building domain-specific features |
| 3. UI/UX | View descriptions (study-summary.md, dose-response.md, etc.) | Layout, columns, colors, interactions, empty states | When building specific views |
| 4. Implementation | datagrok-patterns.ts | API patterns, code snippets, component-to-API mapping | Permanent context for any coding task |

**Why it works:** LLMs have limited context windows. Feeding all four layers at once for a complex application overwhelms the context. Feeding them in sequence lets the LLM build up the right mental model incrementally.

**SEND Data Browser evidence:** The prototype prompt (`send-browser-prototype-prompt.md`) explicitly defines reading order: "Reading order for any view: section 7.4 (overview) -> section 9.6 (DataFrame schema) -> section 10.8 (rules) -> section 11 (context panel panes) -> section 12 (charts)." This layered approach was followed for every view.

---

### 1.3 Canonical Patterns File as Permanent LLM Context

Maintain a single file (`datagrok-patterns.ts`) containing every Datagrok API pattern the LLM needs to know. Include it in every coding session.

**What the file contains:**
- 27 numbered patterns covering the complete Datagrok API surface
- Actual TypeScript code (not pseudocode) that compiles
- Comments explaining when to use each pattern
- A reference table mapping UI concepts to API calls

**Why it works:** LLMs do not reliably know Datagrok's API. The API is specialized, sparsely documented on the public web, and updated frequently. Without the patterns file, the LLM will hallucinate API calls, invent methods that do not exist, or use deprecated patterns. With the patterns file, the LLM produces correct API usage on the first attempt.

**Maintenance rule:** Update `datagrok-patterns.ts` whenever Datagrok releases a new API version. Test each pattern against the current API. Remove deprecated patterns and add new ones. The file must compile.

---

### 1.4 Handoff Documents for Cross-Session Continuity

At the end of a development session, generate a handoff document that captures the current state. Feed it to the next session.

**Handoff document structure:**
1. What was accomplished (completed features, resolved issues)
2. What changed (files modified, new files created, deleted files)
3. Current state of each view/feature (working, partially working, broken, not started)
4. Known issues and their locations (file, line number, description)
5. Next steps (ordered by priority)
6. Key decisions made and their rationale

**Why it works:** LLMs have no memory between sessions. The handoff document is synthetic memory. Without it, the next session starts from zero and may redo work, contradict decisions, or miss context.

**SEND Data Browser evidence:** The CLAUDE.md file in the project root serves as a persistent handoff document. It contains: architecture description, route table, API endpoint table, generated data catalog, color schemes, implementation status, design decisions, UI casing conventions, and a complete demo/stub migration guide with file paths and line numbers. Any new LLM session that reads CLAUDE.md can immediately understand the project state and contribute productively.

---

### 1.5 UX Audits (Screenshot + Spec = LLM Critique)

Feed the LLM a screenshot of the current UI alongside the spec document and ask it to identify gaps.

**Prompt pattern:** "Here is a screenshot of the [view name]. Here is the spec for that view (from [file]). Audit the gap: list every element specified in the spec that is missing, wrong, or different from the spec."

**Why it works:** LLMs are good at systematic comparison. They will catch things humans miss: wrong font size, missing empty state, incorrect color, omitted column, inconsistent casing.

**SEND Data Browser evidence:** The view description documents include "Current Issues / Improvement Opportunities" sections that read like audit reports: "P-value and trend columns show formatted text but no color coding (spec calls for background colors from the p-value scale)," "Tox Assessment form is default-closed -- easy to miss." These were generated by comparing the spec against the running prototype.

---

### 1.6 Separating REAL Computation from STUB Presentation

Explicitly mark which code performs real computation and which is a placeholder. Maintain a migration guide.

**SEND Data Browser evidence:** The CLAUDE.md contains a "Demo/Stub/Prototype Code -- Production Migration Guide" with five priority tiers:
- P1: Infrastructure dependencies (auth, database, multi-study)
- P2: Hardcoded demo data (fake studies, mock validation rules)
- P3: Stub features (import section, export buttons)
- P4: Pre-generated static data (architecture decision to keep or change)
- P5: Hardcoded configuration (dose group mapping, skip folders)

And a summary table:
```
| Statistical analysis pipeline | Real    |
| Signal scoring & rule engine  | Real    |
| All 8 analysis views (UI)    | Real    |
| Landing page demo studies     | Demo    |
| Validation rules & records    | Demo    |
| Import section                | Stub    |
| Export (CSV/Excel)            | Stub    |
| Authentication                | Missing |
```

This separation means a developer can trust the real components and focus migration effort on the stubs. Without it, every component is suspect.

---

## 2. What Does Not Work

### 2.1 Asking LLMs to Infer Domain-Specific Logic

Do not ask: "Build a SEND validation engine." The LLM does not know CDISC SENDIG rules, controlled terminology codes, or the regulatory requirements for preclinical study data submission.

**Instead:** Write the validation rules in a spec document (or YAML file), then ask the LLM to implement the engine that evaluates those rules. The domain expert writes the rules. The LLM writes the code that processes them.

**SEND Data Browser evidence:** The validation engine build prompt (`validation-engine-build-prompt.md`) specifies 18 rules across 3 phases, SENDIG metadata, API endpoints, and frontend hook swap. The LLM could not have inferred any of this. The domain knowledge came from a human; the LLM translated it to code.

---

### 2.2 Expecting LLMs to Know Datagrok APIs Without Reference Material

LLMs trained on public data have minimal Datagrok API knowledge. The API is niche. Without the patterns file:
- The LLM will invent `grok.ui.createPanel()` (does not exist)
- It will use `new DG.View()` instead of `grok.shell.newView()`
- It will try React-style component lifecycle instead of Datagrok's viewer attachment model
- It will not know about `ui.accordion()`, `DG.debounce()`, or `grid.onCellPrepare()`

**Fix:** Always include `datagrok-patterns.ts` in the context. The 875-line file covers every pattern needed for application development.

---

### 2.3 Long Conversations Exceeding Context Windows

After 30-50 back-and-forth exchanges, the LLM starts losing context from earlier in the conversation. Symptoms:
- It forgets design decisions made 20 messages ago
- It re-introduces code patterns you explicitly rejected
- It stops referencing the spec documents
- It starts hallucinating file paths or function names

**Fix:**
- Keep sessions focused: one view per session, or one feature per session.
- When the conversation gets long, start a new session with a handoff document.
- Front-load all reference material at the start of the session, not incrementally.
- Use the CLAUDE.md pattern (Section 4.5) so the LLM reads critical context on every session start.

---

### 2.4 Building Everything in One Pass

Do not prompt: "Build the entire SEND Data Browser." Even with perfect specs, a single pass will produce:
- Inconsistent patterns across views (each view built without knowledge of the others)
- Missing cross-view integration (links, shared state, consistent colors)
- Architectural decisions that conflict

**Instead:** Build in phases:
1. Generator + backend shell (data pipeline)
2. One view fully working (architectural proof)
3. Remaining views (replicate the proven pattern)
4. Cross-view connectivity (links, shared state)
5. Polish (landing page, validation, report generation)

**SEND Data Browser evidence:** The prototype prompt explicitly defines five steps. Step 2 ("View 1: architectural proof") is the critical one: "Get one view fully working. This proves the entire pattern: grid + chart + context panel + insights." Steps 3-5 replicate and extend the proven pattern.

---

## 3. Prompt Patterns That Produce Results

### 3.1 "Read These Files First, Then Tell Me What You Understand"

Before asking the LLM to build anything, have it read the reference material and summarize its understanding. This forces the LLM to internalize the context and gives you a chance to correct misunderstandings before code is written.

**Example:**
```
Read these files:
- datagrok-patterns.ts (27 canonical Datagrok API patterns)
- CLAUDE.md (architecture, color schemes, UI conventions)
- views/study-summary.md (View 1 spec)

Tell me what you understand about:
1. The three-panel layout
2. How selection flows from heatmap to context panel
3. What colors the signal score cells use
```

---

### 3.2 "Here's the Spec. Here's the Current Code. Audit the Gap."

The most productive prompt for iteration. Provide the spec document and the current implementation file. Ask the LLM to list every discrepancy.

**Example:**
```
Here is the spec for the Dose-Response view (views/dose-response.md).
Here is the current implementation (DoseResponseView.tsx).

Audit the gap. List every element in the spec that is:
1. Missing from the implementation
2. Implemented differently than specified
3. Present in the implementation but not in the spec
```

This produces a prioritized punch list that you can work through systematically.

---

### 3.3 "Create a Handoff Document for a New Session"

At the end of a session, ask:
```
Create a handoff document for a new LLM session. Include:
1. What we accomplished in this session
2. Files modified (with line ranges for significant changes)
3. Current state of each feature
4. Known issues
5. Next steps in priority order
6. Any design decisions we made and why
```

The LLM will produce a structured document you can paste into CLAUDE.md or save as a session artifact.

---

### 3.4 Explicit Phasing Instructions

When building a feature that spans multiple files, give the LLM an explicit phase order:

```
Build the Validation view in this order:
Phase 1: Data types and interfaces (types/validation.ts)
Phase 2: API hook (hooks/useValidation.ts)
Phase 3: Center panel component (ValidationView.tsx)
Phase 4: Context panel component (ValidationContextPanel.tsx)
Phase 5: Wire into routing (App.tsx) and tree navigation (BrowsingTree.tsx)

Complete each phase fully before moving to the next. After each phase,
show me the file so I can review before proceeding.
```

**Why it works:** Without phasing, the LLM tries to build everything at once and produces files with forward references, missing types, and inconsistent interfaces. Phasing forces bottom-up construction where each layer is complete before the next begins.

---

### 3.5 "Implement Pattern N from datagrok-patterns.ts"

When you need a specific Datagrok feature, reference the pattern by number:

```
Implement Pattern #9 (Toolbox) for this application.
The tree should have these groups:
- Analysis: Study Summary, Dose-Response, Target Organs
- Data: DM, LB, BW, MI
Each item click should call switchView(viewName).
```

This eliminates ambiguity about which API to use and how.

---

## 4. Asset Maintenance

### 4.1 datagrok-patterns.ts Must Stay Current

The patterns file is the LLM's API reference. If it contains deprecated patterns, the LLM will generate deprecated code.

**Maintenance protocol:**
- Review against Datagrok release notes quarterly
- Test every pattern compiles against the current API
- Add new patterns when new API features are used in production code
- Remove patterns that are no longer supported
- Update the reference table at the bottom of the file

---

### 4.2 Spec Documents Are Living -- Append, Do Not Replace

When a view evolves (new columns, changed interactions, added features), append to the spec document. Do not rewrite it from scratch.

**Why:** The spec document contains the "what" and "why" behind every design decision. Rewriting it loses the rationale. Appending preserves the history and makes it clear what changed.

**Convention:**
- Add a "Changelog" section at the bottom of each view spec
- Each entry: date, what changed, why
- Mark superseded sections with "[SUPERSEDED -- see Changelog entry DATE]" rather than deleting them

**SEND Data Browser evidence:** The view description files include "Current Issues / Improvement Opportunities" sections. These are additive -- each audit pass adds new issues without removing resolved ones (resolved issues get moved to a "Resolved" section). This preserves the full history of the view's evolution.

---

### 4.3 Handoff Documents Are Session Artifacts -- Archive, Do Not Delete

Each handoff document captures the project state at a point in time. Keep them in a dated archive.

**File naming:** `handoff-YYYY-MM-DD-topic.md` (e.g., `handoff-2025-03-15-view2-complete.md`)

**Why archive:** When debugging a regression, the handoff archive shows what changed between sessions. When onboarding a new developer, the archive shows the project's evolution.

**Do not delete:** Disk space is cheap. Project history is valuable.

---

### 4.4 View Description Files as LLM-Consumable Documentation

The view description files (`views/study-summary.md`, `views/dose-response.md`, etc.) serve a dual purpose:
1. Human-readable design documentation
2. LLM-consumable specification for building or auditing the view

**What makes a view description LLM-consumable:**
- Exact column names, widths, and rendering descriptions (not "a grid with the usual columns")
- Exact CSS classes (not "styled appropriately")
- Exact color values (not "use red for errors")
- State management table (state name, scope, managed by)
- Data flow diagram (ASCII art showing data source -> transform -> render)
- Cross-view navigation table (from, action, navigates to)
- Error/loading states enumerated

**SEND Data Browser evidence:** Each view description file follows the same template: Layout, Filter Bar, Chart Area, Grid, Context Panel, State Management, Data Flow, Cross-View Navigation, Error/Loading States, Current Issues. This consistency means the LLM knows exactly where to look for any piece of information.

---

### 4.5 The CLAUDE.md Pattern

Use CLAUDE.md (placed at the project root) as the single source of truth for agent instructions. Any LLM-based development tool that reads CLAUDE.md at session start gets immediate context.

**What CLAUDE.md contains:**
1. Project overview (one paragraph)
2. Development commands (backend, frontend, shell notes)
3. Architecture (backend structure, frontend structure, API endpoints, routes)
4. Design decisions (explicit choices that should not be re-litigated)
5. UI conventions (casing rules, with examples)
6. TypeScript conventions (strict mode, import syntax)
7. Data description (study count, domain structure)
8. Generated data catalog (every JSON file with grain and key columns)
9. Color schemes (exact hex values in a table)
10. Implementation status (completed features, in-progress items)
11. Demo/stub migration guide (every non-production item cataloged with file paths and line numbers)

**Why it works:** Every new LLM session reads CLAUDE.md automatically (Claude Code does this by convention). The LLM immediately knows: the tech stack, the architecture, the conventions, what is real vs. stub, and what to work on next. No "getting up to speed" conversation needed.

**Agent commit protocol:** CLAUDE.md includes a mandatory agent commit protocol. Before every commit, the LLM must check whether its changes affect the demo/stub migration guide and update it accordingly. This keeps the migration guide accurate as the codebase evolves. The protocol is stated as a mandate in CLAUDE.md, ensuring every LLM session respects it.

---

## 5. The Development Workflow (End to End)

### 5.1 Starting a New Feature

1. Write the spec document (view description, data schema, interactions)
2. Open a new LLM session
3. Feed: CLAUDE.md + datagrok-patterns.ts + the new spec document
4. Prompt: "Read these files. Tell me what you understand about the feature I want to build."
5. Correct any misunderstandings
6. Give explicit phasing instructions
7. Build phase by phase, reviewing after each

### 5.2 Iterating on an Existing Feature

1. Open a new LLM session
2. Feed: CLAUDE.md + datagrok-patterns.ts + the view spec + the current source file
3. Prompt: "Audit the gap between the spec and the implementation."
4. Review the punch list
5. Prioritize items and build them in order

### 5.3 Ending a Session

1. Ask the LLM to produce a handoff document
2. Update CLAUDE.md with any new design decisions, status changes, or migration guide updates
3. Archive the handoff document
4. Commit all changes with descriptive messages

### 5.4 Onboarding a New Developer (Human or LLM)

1. Point them to CLAUDE.md
2. Point them to the view description files in `views/`
3. Point them to `datagrok-patterns.ts`
4. These three assets are sufficient to understand the project, the design, and the implementation patterns

---

## 6. Lessons Learned

### 6.1 The Spec Is the Product

The SEND Data Browser prototype proved that with sufficiently detailed specs, an LLM can build a complete application: 8 analysis views, context panels with synthesized insights, cross-view navigation, annotation forms, a validation workflow, and a report generator. The human contribution was entirely in the specifications and design decisions. The LLM contribution was entirely in the implementation.

This means the highest-leverage activity is writing better specs, not writing better code.

### 6.2 Consistency Comes from Convention, Not Discipline

Left to its own devices, the LLM will use different patterns in different views. The Dose-Response view might use CSS variables for hover states while the Study Summary uses Tailwind classes. The fix is not to tell the LLM "be consistent" -- it is to codify the conventions in a design system document (this file and its companions) and include them in every session.

### 6.3 The Migration Guide Prevents Knowledge Loss

The demo/stub migration guide in CLAUDE.md is the most operationally valuable section of the entire project. Without it, a developer picking up the codebase must read every file to determine what is real and what is fake. With it, they have a prioritized, file-path-specific list of everything that needs to change for production.

### 6.4 Context Panel Is the Product

The SEND Data Browser prototype prompt states it plainly: "Context panel is the product. If the grid works but the context panel does not update on row click with insights/stats/links -- the prototype fails." This applies to every Datagrok application. The grid and charts are necessary but not sufficient. The context panel -- with its synthesized insights, statistics, cross-view links, and annotation forms -- is where the user makes decisions. Build it with the same rigor as the main content area.

### 6.5 Pre-Computation Simplifies Everything

The architectural decision to pre-compute all analysis data (via a generator script) and serve it as static JSON eliminated an entire category of complexity: live statistical pipelines, caching strategies, error handling for computation failures, progress indicators for long-running analyses. The frontend was built entirely against static JSON APIs. When the production system needs live computation, the frontend does not change -- only the backend does. This separation was invisible to the LLM and made every view-building session faster and more predictable.
