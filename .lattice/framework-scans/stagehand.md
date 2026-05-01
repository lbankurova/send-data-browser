# Stagehand — Lattice/SENDEX Leverage Analysis

**URL:** https://github.com/browserbase/stagehand
**Verdict:** LOW
**One-line:** A Node SDK that wraps Playwright with `act/extract/observe` LLM primitives, but it is not exposed as an MCP server, doesn't slot into the Claude-Code-driven `/lattice:ux-audit-walk` pipeline without rewriting it as a TS test harness, and the friction it solves (selector self-healing for repeated runs) is not a friction the Lattice walks actually have.

## What it is (mechanically)

Stagehand is a **TypeScript SDK** (MIT, ~22.4k stars, last pushed 2026-04-30, primary lang TypeScript, owned by Browserbase) that sits on top of Playwright and adds three LLM-powered primitives:

- **`observe(instruction)`** → returns `Action[]` where each action is `{description, method, arguments[], selector}` (XPath/CSS). LLM-graded mapping from natural language ("find the dose-response chart legend") to a candidate action descriptor. Handles iframes and shadow DOM. **Costs LLM tokens per call** unless server-cached.
- **`act(instruction | Action)`** → executes either a natural-language instruction (one LLM call) OR a pre-computed `Action` object from `observe()` (zero LLM calls — pure Playwright dispatch). Caches resolved (instruction, page) → action mappings; on cache hit, no LLM is invoked. On cache miss after a UI shift, "self-healing" re-queries the LLM.
- **`extract(instruction, ZodSchema)`** → LLM-shaped structured-data extraction over the rendered page, validated against a Zod schema. Server-side cached on Browserbase.
- **`agent.execute(task)`** → multi-step autonomous loop driven by a "computer use" model (Claude Sonnet 4.x, GPT, Gemini). Each step is its own LLM round-trip; complex tasks document themselves as 20-40 LLM calls. Cited Stagehand-with-Claude task-completion rate is ~75% vs hand-written Playwright at ~98% on the same workloads.

**Local vs cloud.** Both are supported. `env: "LOCAL"` runs Playwright against a local Chromium directly (no Browserbase API key required), but **server-side caching of observed actions and extract results is Browserbase-only** — locally you get filesystem caching by passing `cacheDir`. Production-grade reliability features (stealth, residential proxies, persistent sessions, model-key gateway) are gated to the `BROWSERBASE` env. Cost reference for sustained traffic: a Stagehand reviewer cites "$50-200/day in LLM fees" for 10k extractions/day under GPT-4.1 pricing — this is a TS SDK that bills LLM tokens, not a free Playwright wrapper.

**The critical packaging fact:** Stagehand is a Node SDK. There is no first-party Stagehand MCP server. Search-engine results conflating the two are noise — qtrl.ai and morphllm.com both clarify that "Stagehand is the framework, MCP is the protocol; they don't overlap." Third-party Stagehand-MCP wrappers exist on npm but none are the canonical browserbase-published surface that Playwright MCP enjoys.

## How it compares to current Playwright MCP usage in Lattice

| Axis | Current: Playwright MCP (used in `/lattice:ux-audit-walk`) | Stagehand |
|---|---|---|
| **Calling shape** | Claude Code agent calls `mcp__playwright__browser_*` tools directly inside the conversation | TS SDK invoked from Node program; no MCP surface, would need a wrapper agent or a script |
| **Selector strategy** | Accessibility-tree snapshot via `browser_snapshot` returns refs; `browser_click(ref)` uses snapshot-derived refs (self-targeting via aria roles, NOT XPath) | LLM-mapped natural language → XPath/CSS selectors with cache+self-heal |
| **Brittleness on UI change** | Snapshot regenerates each call; ref is per-snapshot, so "selector drift" is a non-problem within a walk session | Cached selector breaks → re-LLM-query (self-heal); pays a token tax to re-discover |
| **Brittleness across walks** | Each walk starts fresh; no cross-walk state | Disk cache across runs; subsequent runs of the same walk are ~deterministic and free |
| **Screenshot/snapshot cost** | `browser_snapshot` and `browser_take_screenshot` are deterministic CDP ops, zero LLM cost | Same — Stagehand uses Playwright's screenshot under the hood; equivalent there |
| **Cost per click in the walk** | One Claude turn (already-paid agent context) + zero extra LLM (CDP op) | One Claude turn to write the `act("...")` line + Stagehand's own LLM call (Gemini/Claude/GPT) for selector grounding — **double-billing** |
| **Persona-driven exploration** | Agent reads snapshot, decides next click, calls `browser_click`. The persona reasoning happens in the Claude Code agent's context window — already first-class | `act("click the dose-response chart legend")` packs the reasoning into a single Stagehand call. Looks tighter, but the Claude Code agent has to write that string anyway from the snapshot it just read |
| **Debug affordance** | `browser_console_messages`, `browser_network_requests`, `browser_evaluate` are all direct CDP — full DevTools-grade inspection | Available via the underlying Playwright `page` object Stagehand exposes, but the LLM primitives don't add anything for inspection |
| **Validation step** | `/lattice:ux-audit-validate` runs a 5-step Grep checklist against the codebase to refute walk hypotheses (~21% refute rate). Code-grounded, no LLM round-trip per claim | Stagehand provides nothing for this stage — it's a browser SDK, not a code-validator |

## Where Stagehand would help in Lattice

Three honest places:

1. **Cross-run determinism for the walk happy path.** If the SENDEX dev server's Findings view shifts a className and the next walk needs to click "the rail header for Body Weight," Stagehand's cached selector + self-heal would reach the right element where a hand-written Playwright `page.click('.rail-header-bw')` would fail. **However:** the current pipeline doesn't hand-write CSS selectors — it uses `browser_snapshot` accessibility refs that are regenerated each call, so the brittleness Stagehand fixes doesn't actually exist in the current pipeline. Browserbase's own docs concede this: Playwright MCP "relies on accessibility tree snapshots rather than selectors, which avoids brittleness."

2. **`extract()` for chart-data assertions.** The audit pipeline currently doesn't extract structured data from rendered charts — it screenshots them and the agent reads them visually. If a future audit step wanted to assert "the Body Weight dose-response chart shows 4 dose groups in the legend with these labels," `extract(..., zodSchema)` against rendered DOM is a real capability. But this assertion is also achievable with `browser_evaluate(jsCode)` against the chart's data attributes for free, and the SENDEX charts we've audited are ECharts — their data lives in the option object reachable via `__echartsInstance__`, not in DOM text.

3. **Agent mode for autonomous workflows.** `agent.execute("Walk the toxicologist persona through the recovery-reversal workflow on study Nimble")` is a tighter spec than the current "agent reads INDEX.md + persona file and decides each click." But the current Claude-Code agent is *already* an autonomous LLM-driven workflow agent; Stagehand's `agent` is a strict subset of what Claude Code is doing as the outer loop. Using Stagehand `agent` here would be an LLM calling an LLM.

## Where Stagehand would NOT help

- **Step 1 of the audit walk (persona × workflow → candidate README).** The reasoning (which persona, which workflow, which study fixture per `STUDY-FIXTURES.md`, what to click next given the snapshot) is *already* the Claude-Code agent's job, and the agent has full project context (CLAUDE.md, persona file, audit conventions). Routing those decisions through `act("...")` adds a second LLM with strictly less context.
- **Step 2 of the pipeline (`/lattice:ux-audit-validate`).** This is pure code grep against rule files and `frontend/src/` — Stagehand provides zero leverage; it doesn't read source.
- **Step 3 (`/lattice:ux-audit-file`).** Also pure file I/O against `TODO.md` — irrelevant to a browser SDK.
- **Screenshot capture for audit artifacts.** `browser_take_screenshot` is already free CDP; Stagehand doesn't improve on this and would charge LLM tokens for the surrounding `act()` to navigate to the screenshot point.
- **The 5-step Grep checklist's "code-precision" stance.** The checklist is explicitly a *DOM/code-precision oracle that overrides walk-time observations* (rule 2 in `ux-audit-validate.md`: walk produces hypotheses, code refutes). Adding a self-healing LLM-driven selector layer on the *walk* side weakens the precision contract; it doesn't help the validator side.
- **Anything involving the 24 already-built audits.** They're done. The historical artifact set is on disk.

## Cost / lock-in assessment

- **Lock-in to Browserbase's cloud:** medium. Stagehand the SDK is MIT and runs locally. But the production reliability story (server-side action cache, stealth, persistent sessions, model gateway) requires `BROWSERBASE_API_KEY` and Browserbase credits. Self-hosting gives you ~70% of the SDK with filesystem cache.
- **Per-walk LLM cost:** non-trivial. A walk of ~40 actions with `act()` natural-language semantics is 40 LLM calls @ Stagehand's recommended Gemini-2.5 / Claude pricing — call it $0.10-0.50 per walk uncached. Multiply by 24 audits in a sweep and the marginal LLM bill is real even before counting the Claude Code outer-loop cost. Cache amortizes this to near-zero on **repeated** walks of unchanged UIs, but Lattice's walk pattern is mostly **first-time** explorations of new persona×workflow combinations — exactly the case the cache doesn't help.
- **Setup tax:** porting `/lattice:ux-audit-walk` from MCP-tool calls to a Node script that imports Stagehand changes the orchestration model. Currently the agent is the orchestrator and tools are leaves; with Stagehand the orchestrator becomes a TS file and the agent must call into it (or Stagehand's own `agent.execute()` becomes the orchestrator and Claude Code becomes a launcher). Both reshape the pipeline non-trivially.
- **No first-party MCP server.** This is the biggest packaging issue. Playwright MCP is an off-the-shelf MCP server published and maintained; Stagehand has no equivalent. A team adopting Stagehand for a Claude Code workflow would need to either (a) write a Stagehand-MCP shim themselves, (b) run Stagehand from a Bash tool against a TS file, or (c) shift orchestration outside Claude Code entirely.

## Recommendation

**Ignore for now. Existing Playwright MCP usage is sufficient.**

The frictions Stagehand is built to remove — selector brittleness across long-running test suites, cross-run determinism on changing UIs, fewer-lines-of-code natural-language test authoring — are all friction shapes from the **production E2E test suite** world, not the **one-off persona-driven exploratory walk** world Lattice operates in. Browserbase's own positioning supports this read: their pitch is "internal tools with semi-stable UIs and awkward selectors" and "QA flows where humans want the script readable" — both are *recurring-test* shapes. Lattice walks are neither recurring nor scripts.

Specific decision tests that would flip this to MEDIUM/HIGH if any becomes true:

1. **Lattice gains a continuous regression-walk surface.** If a nightly job re-walked all 24 audits to detect UX drift between SENDEX deploys, Stagehand's selector cache + self-heal becomes load-bearing — that's its native shape. **Today this surface does not exist.**
2. **Walks start needing chart-data assertions.** If Stage-2 validation began asserting "the legend shows exactly these dose labels in this order" against rendered DOM rather than against `unified_findings.json`, `extract(..., zodSchema)` is a clean fit. **Today validation reads generated JSON, not DOM.**
3. **A first-party Browserbase Stagehand-MCP server ships.** Removes the orchestration-reshape tax. Worth re-checking on quarterly cadence. **Not available as of 2026-04-30.**

If the user wants empirical proof rather than this analytical verdict, the cheapest pilot is: pick **one** existing audit (e.g., `p1-noael-determination` against TOXSCI-87497, listed in `STUDY-FIXTURES.md`), re-run it as a Stagehand TS script with `env: "LOCAL"` against `localhost:5173`, and measure (a) wall-clock time, (b) LLM token spend, (c) whether the resulting candidate README is meaningfully different from the existing one in `docs/_internal/audits/workflow-audits/`. Predicted outcome: Stagehand walk is 2-3x slower (extra LLM round-trips per action), costs ~$0.30 in tokens vs $0 for snapshot CDP, and produces a candidate README of equivalent quality — confirming LOW.
