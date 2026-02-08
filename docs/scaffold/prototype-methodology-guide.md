# Prototype Methodology Guide

How to build a Datagrok-style UX prototype using LLM agents. Extracted from the SEND Data Browser prototype build (2024-2025).

---

## Phase 1: Spec Creation

The spec is the product. A thorough, LLM-consumable spec eliminates 80% of back-and-forth during implementation. Spend the time here.

### 1.1 Start with domain expert conversations

Before writing anything, have structured conversations with domain experts about:

- **The user's workflow.** What do they do today? What order? What are they looking for? What decisions do they make?
- **The data model.** What are the source data formats? What are the entities and relationships? What computations transform raw data into analytical data?
- **The decision logic.** What rules determine the conclusions the app should present? What thresholds matter? What's the hierarchy of evidence?

Capture these as structured notes, not free-form transcripts. Each conversation should produce artifacts: workflow diagrams, data schemas, decision tables.

### 1.2 Structure the spec for LLM consumption

LLM agents will read this spec and build from it. The spec must be:

- **Numbered sections with stable references.** Every section gets a number (1, 2, ..., 19). Every subsection gets a dotted number (9.5, 10.8). Code, prompts, and handoff documents reference these numbers. Never reorganize numbering after agents have started building.
- **Explicit schemas.** Column names, data types, value ranges, null handling. If a DataFrame has 12 columns, list all 12 with exact names, types, and descriptions. Agents will use these column names verbatim.
- **Decision tables over prose.** Instead of "the color should be red for high values and green for low values," write a table: `#D32F2F` (0.8-1.0), `#F57C00` (0.6-0.8), etc. Agents execute tables; they hallucinate from vague prose.
- **Explicit hex colors, exact component names, exact CSS classes.** "A nice shade of blue" is unusable. `#1976D2` is buildable.
- **Cross-reference index.** A table showing where each concept is defined and where it is consumed. Agents working on View 3 need to know that signal scores are defined in 10.7, colored per 12.3, and displayed in the heatmap per 12.4.

### 1.3 Layer the spec in dependency order

Write the spec in four layers. Each layer depends only on prior layers.

| Layer | Sections | Contains |
|-------|----------|----------|
| **Layer 1: Architecture** | Principles, data model, import, semantic types | What the app does, what data it works with, how data gets in |
| **Layer 2: Domain Logic** | View structure, validation, derived computations, rule engine | User workflow, analytical pipeline, insight generation |
| **Layer 3: UI/UX** | Context panels, viewer configs, annotation schemas, color schemes | What each screen looks like, how interactions work, what updates on click |
| **Layer 4: Implementation** | Phasing, open questions, spec document map | Build order, unresolved items, developer reading guide |

The build prompt references layers by section number: "Read 7.4 for view overview, then 9.6 for schemas, then 11 for context panels, then 12 for charts."

### 1.4 Create a platform API patterns file

If the target platform has an API or component library the prototype must emulate, create a **patterns file** — a reference document (or `.ts` file with examples) showing:

- Layout patterns (three-panel shell, toolbox tree, context panel)
- Interaction patterns (linked selection, cross-view navigation, filter propagation)
- Component patterns (accordion panes, color-coded grids, ribbon actions)

This file gets fed to the agent alongside the spec. It answers "how does this platform do X?" without requiring the agent to read full platform docs.

### 1.5 Capture decisions in a running handoff document

From the first conversation, maintain a running document with:

- Decisions made and rationale
- Open questions and who owns them
- Scope boundaries (what is in, what is explicitly out)
- Terminology definitions

This becomes the seed for handoff documents during the build (Phase 3).

---

## Phase 2: Prototype Architecture

### 2.1 Choose the stack

The proven pattern for Datagrok-style prototypes:

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | **FastAPI** (Python) | Fast to write, agents know it well, matches data science ecosystem (pandas, scipy) |
| Frontend | **React + TypeScript + Vite** | Agents produce high-quality React. TypeScript catches schema mismatches. Vite is fast. |
| Styling | **TailwindCSS + shadcn/ui** | Utility classes are explicit (LLM-friendly). shadcn gives accessible base components. |
| State | **TanStack React Query** | Server state management with caching. Hooks are the API boundary. |
| Tables | **TanStack React Table** | Client-side sorting, column definitions match spec schemas directly. |
| Charts | **Recharts or ECharts** | Only for interactive charts. Static charts are pre-rendered HTML/SVG. |

### 2.2 Define the REAL / STUB / SKIP decision matrix

Before building, classify every feature in the spec:

| Classification | Definition | Example |
|---------------|-----------|---------|
| **REAL** | Computed from actual data, fully interactive, spec-faithful | Statistical pipeline, signal heatmap, context panel with live data |
| **STUB** | UI exists and is interactive, but backed by hardcoded/fake data | Landing page demo studies, validation rules, import section |
| **SKIP** | Not built at all | Auth, database, CI/CD, error boundaries, multi-study support |

This matrix goes into the build prompt. It tells the agent what to spend time on and what to fake. It also becomes the seed for the Demo/Stub Migration Guide in CLAUDE.md.

**The rule:** If a Datagrok developer needs to see the UX pattern, build it REAL or STUB. If they don't need to see it, SKIP.

### 2.3 Pre-computed data architecture

The architecture that worked for the SEND prototype:

```
Generator script (Python)
    reads source data files
    computes all statistics (real scipy/pandas)
    evaluates all rules
    writes JSON files (one per view)
    writes static chart HTML/SVG

Backend (FastAPI)
    serves JSON files as API endpoints
    serves static charts as HTML endpoints

Frontend (React)
    fetches JSON via hooks
    renders grids, charts, context panels
    doesn't know if data is live or pre-computed
```

**Why this works:**
- The computation is real. P-values, effect sizes, signal scores come from actual statistical tests on actual data.
- The frontend is identical to what the production app would render. When porting to Datagrok, the computation moves to request-time, but the data schemas and rendering don't change.
- The generator script is a self-contained artifact. It documents every computation the production pipeline must implement.

**When to use this pattern:** When the app has a significant computation layer (statistics, rule engines, derived data). The generator script is ~3-4 hours of work and eliminates the need for a live pipeline during prototyping.

**When NOT to use this pattern:** When the app is primarily CRUD (create/read/update/delete) with minimal computation. In that case, build a real backend with a database.

---

## Phase 3: Iterative Build with LLM Agents

### 3.1 Feed spec + patterns to the agent

The agent's initial context should include:

1. **Build prompt** — what to build, in what order, with what classifications (REAL/STUB/SKIP)
2. **Spec sections** — referenced by number, read in dependency order
3. **Patterns file** — platform-specific UX patterns to replicate
4. **CLAUDE.md** — project structure, conventions, commands, current state

The build prompt should specify a reading order: "For any view, read 7.4 (overview) then 9.6 (schema) then 11 (context panels) then 12 (charts)."

### 3.2 Build view by view, not layer by layer

**Do this:** Build View 1 end-to-end (data + grid + charts + context panel + insights), then View 2 end-to-end, etc.

**Not this:** Build all grids first, then all charts, then all context panels.

View-by-view delivery means:
- Each view is testable and reviewable immediately
- Patterns established in View 1 propagate to Views 2-5
- If the approach is wrong, you discover it on View 1, not after building all 5 grids

This mirrors the spec's phasing principle: "vertical slices, not horizontal layers."

### 3.3 After each view: UX audit

After each view is built, do a UX audit cycle:

1. **Screenshot the view** in several states (empty, loaded, selection active, context panel populated)
2. **Compare to spec** — column names, colors, layout, interaction patterns
3. **Write a view description file** (see `view-audit-template.md`) documenting what was actually built
4. **Feed the audit back** to the agent as a correction prompt: "The heatmap uses wrong colors. Spec says #D32F2F for 0.8-1.0, but the build uses #E53935. Fix."

The view description files become the portability package — they document what the Datagrok developer will see and must replicate.

### 3.4 CLAUDE.md as agent instruction file

CLAUDE.md is not just documentation — it is the agent's memory across sessions. It must contain:

- **Project overview** — one paragraph explaining what the app does
- **Commands** — exact terminal commands for backend, frontend, generator
- **Architecture** — backend structure, frontend structure, routes, API endpoints
- **Conventions** — TypeScript rules, styling approach, casing rules
- **Design decisions** — explicit choices that the agent must follow
- **Implementation status** — what is done, what is next
- **Demo/Stub migration guide** — every hardcoded, fake, or stub item with file paths, line numbers, and production replacement instructions

**Agent commit protocol:** Every commit must update the migration guide. If the agent introduced a stub, it documents it. If it resolved a stub, it moves it to Resolved. If it shifted line numbers, it updates references. This keeps the migration guide accurate as the codebase evolves.

### 3.5 Handoff documents for context continuity

When switching between agent sessions (or between agents), write a handoff document:

```
# Handoff: [Date] — [What was accomplished]

## What was built
- View 3 (Target Organs) — grid, evidence matrix, context panel
- Bug fix: heatmap color scale was inverted

## Current state
- Views 1-3 complete, Views 4-5 not started
- Known issue: cross-view links from View 3 don't pass organ filter

## Next steps
1. Build View 4 (Histopathology) — spec sections 7.4, 9.6, 11.7, 12.7
2. Fix cross-view link filter passing (affects all views)

## Open questions
- Should severity heatmap use ordinal or continuous color scale?
```

Store these in `docs/handoffs/`. The next session starts by reading the latest handoff.

---

## Phase 4: Portability Prep

The prototype's job is to prove the UX, not ship to production. But the prototype must be **portable** — a Datagrok developer must be able to pick it up and build the real plugin.

### 4.1 Create the portability package

At the end of prototyping, assemble:

| Document | Purpose |
|----------|---------|
| **Porting guide** | Maps prototype components to Datagrok equivalents. React component X becomes Datagrok panel Y. |
| **Pipeline spec** | The generator script, annotated. "This computation must run at import-time in the plugin." |
| **Decisions log** | Every design decision, with rationale. "We chose ordinal severity colors because continuous was unreadable at 5 grades." |
| **Implementation plan** | Phased build order for the Datagrok developer. Matches the spec's Phase 0-1D structure. |

### 4.2 View description files

One file per view (see `view-audit-template.md`). Each documents:

- Route and component name
- Layout (ASCII diagram)
- Every UI section with exact detail (Tailwind classes, colors, column definitions)
- Context panel behavior (no selection, with selection, per pane)
- State management
- Data flow
- Cross-view navigation
- Known issues and improvement opportunities

These files are the bridge between "what the prototype shows" and "what the plugin must build."

### 4.3 Demo/stub migration guide

The migration guide in CLAUDE.md (see 3.4) is the single most important portability artifact. It tells the Datagrok developer:

- What is real and can be reused (statistical pipeline, data hooks, UI components)
- What is fake and must be replaced (demo studies, hardcoded validation rules)
- What is missing and must be built (auth, database, multi-study)

Every item has a file path, line number, description, and production replacement instruction.

---

## Anti-Patterns to Avoid

Learned from actual experience building the SEND Data Browser prototype.

### Build anti-patterns

| Anti-pattern | What happens | Instead |
|-------------|-------------|---------|
| **Building all layers before any views** | You don't see a working screen for days. When you do, the data shape doesn't match the UI assumptions. | Build one view end-to-end first. Fix the pattern, then replicate. |
| **Vague spec sections** | "Show relevant statistics" produces agent-hallucinated UIs that don't match what the domain expert expects. | Specify every column, every color, every pane. Decision tables, not prose. |
| **No patterns file** | Agent invents its own layout/interaction model. Doesn't match the target platform. | Write a patterns file with concrete examples of the platform's UX idioms. |
| **Skipping the generator script** | Frontend uses hardcoded JSON blobs. When real data arrives, half the fields are different. | Run real computations on real data. Even for a prototype, the data should be genuine. |
| **Building infrastructure** | Agent spends 2 hours on error boundaries, auth middleware, CI/CD, Docker setup. None of this ships. | SKIP. The prototype is a demo. No auth, no database, no CI/CD. JSON files + a rendering frontend. |

### Spec anti-patterns

| Anti-pattern | What happens | Instead |
|-------------|-------------|---------|
| **Unstable section numbering** | Agent references section 9.6, but you reorganized and it's now 10.6. Agent builds wrong thing. | Lock numbering before the build starts. Never renumber after agents are working. |
| **Prose where tables belong** | "Colors should convey severity, with warmer colors for more severe values." Agent picks random colors. | Explicit hex table: `#FFF9C4` (minimal), `#FFE0B2` (slight), `#FFB74D` (moderate), `#FF8A65` (marked), `#E57373` (severe). |
| **Missing cross-references** | Agent building View 3 doesn't know signal scores are defined in 10.7 and colored per 12.3. Invents its own scoring. | Cross-reference index mapping concept to definition section and consumption sections. |
| **No phasing** | Agent tries to build everything at once. Runs out of context. Makes inconsistent choices across views. | Phase the spec explicitly. Phase 0 (validate platform), Phase 1A (foundation), Phase 1B (first view), etc. |

### Agent management anti-patterns

| Anti-pattern | What happens | Instead |
|-------------|-------------|---------|
| **No CLAUDE.md** | Each session starts from scratch. Agent re-discovers project structure, conventions, status. | Maintain CLAUDE.md as living memory. Agent reads it first, updates it last. |
| **No handoff documents** | Context is lost between sessions. Agent rebuilds things that already work, or contradicts earlier decisions. | Write a handoff doc at the end of every session. Next session reads it first. |
| **No migration guide** | Prototype ships with undocumented stubs. Datagrok developer doesn't know what's real vs. fake. | Agent commit protocol: every commit updates the migration guide. |
| **Reviewing too late** | Agent builds 5 views before anyone checks. Views 2-5 all have the same layout bug from View 1. | Review after every view. UX audit cycle: screenshot, compare to spec, feed corrections back. |

---

## Checklist: Starting a New Prototype

Use this checklist when beginning a new prototype app.

### Before building

- [ ] Domain expert conversations completed, structured notes captured
- [ ] Spec written in 4 layers (architecture, domain logic, UI/UX, implementation)
- [ ] All schemas explicit (column names, types, value ranges)
- [ ] Decision tables for colors, thresholds, classifications
- [ ] Cross-reference index created
- [ ] Section numbering locked
- [ ] Platform API patterns file written
- [ ] REAL / STUB / SKIP matrix defined
- [ ] Build prompt written with step-by-step plan and reading order
- [ ] Generator script scope defined (what computations, what outputs)

### During the build

- [ ] CLAUDE.md initialized with project overview, commands, architecture
- [ ] View 1 built end-to-end and reviewed before starting View 2
- [ ] UX audit after each view (screenshot, compare to spec, write view description)
- [ ] Handoff document written at end of each session
- [ ] Migration guide updated with every commit
- [ ] Cross-view links tested after all views complete

### After building

- [ ] All view description files written
- [ ] Portability package assembled (porting guide, pipeline spec, decisions log, implementation plan)
- [ ] Migration guide complete and accurate (file paths, line numbers verified)
- [ ] Demo walkthrough recorded or scripted
- [ ] Handoff to platform developer scheduled
