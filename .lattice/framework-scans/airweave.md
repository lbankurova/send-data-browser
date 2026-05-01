# Airweave — Lattice/SENDEX Leverage Analysis

**URL:** https://github.com/airweave-ai/airweave
**Verdict:** LOW
**One-line:** A SaaS-connector → vector-DB retrieval layer for agents; SENDEX has no SaaS sources and no agent-facing RAG surface, so the value prop misses by two axes.

## What it is (mechanically)

Airweave is an open-source "context retrieval layer for AI agents and RAG systems." Concretely: it owns a fleet of **50+ source connectors** (Notion, Slack, Google Drive, Confluence, Jira, Linear, GitHub, Gmail, HubSpot, Salesforce, Stripe, Zendesk, Intercom, OneDrive, SharePoint, Dropbox, Asana, ClickUp, Trello, Airtable, Box, Coda, Slab, ServiceNow, Freshdesk, Apollo, Attio, etc. — overwhelmingly SaaS productivity/CRM/ticketing). It pulls data from those sources on a schedule (orchestrated via **Temporal**), normalizes it, embeds chunks (OpenAI/Mistral are mentioned in the bootstrap script), and writes to **Vespa** as the vector sink with **Postgres** for metadata and **Redis** for pub/sub. Agents then query it via a unified search API (REST, Python/TypeScript SDKs, MCP, or CLI) and get back retrieval-shaped chunks for grounding.

The runtime is a multi-container stack: backend (FastAPI), frontend (React/ShadCN), Postgres, Vespa, Redis, Temporal, plus the worker. **Deployment model is dual:** managed cloud at app.airweave.ai, OR self-hosted via `docker-compose` / Kubernetes (`./start.sh` boots eight services with health checks). It expects an OpenAI or Mistral API key for embeddings.

The shape of the abstraction: *connector authenticates against a SaaS API → entities streamed → chunked + embedded → indexed → exposed through a `collections.search.instant(query)` interface*. The unit of sync is "entity"-flavored documents (a Notion page, a Slack message, a Salesforce account), not files or arbitrary blobs. The product is the **sync runtime + the connector library**, not the search engine — Vespa is doing the actual retrieval work.

## Where SENDEX has data-integration needs (if any)

Honest survey of SENDEX's data flow against integration-shaped problems:

1. **SEND `.xpt` ingest (primary path).** Local files under `send/<study>/`, deterministic Python pipeline producing `backend/generated/<study>/unified_findings.json`. No network, no SaaS, no auth, no schedule. Zero overlap with Airweave.

2. **Historical control databases.** Currently embedded as typed YAML facts in `docs/_internal/knowledge/knowledge-graph.md`. If SENDEX ever consumed an external HCD vendor feed (Charles River, BioReliance, Envigo) that exposed an authenticated API with periodic updates, Airweave's "auth + sync + schedule" runtime could in principle host that. **But:** HCD facts are load-bearing scientific values that go through the typed knowledge graph contradiction audit (CLAUDE.md rule 22). They cannot live in a vector store as embedded chunks — they must be typed records with `value`, `confidence`, `scope`, `contradicts`. Airweave's sink shape is wrong.

3. **Regulatory document corpus** (ICH, OECD, CDISC, FDA SEND review process). These are static PDFs/HTML that change on regulator timescales (years), already curated as markdown under `docs/_internal/research/`. Could one imagine a RAG layer over these? Yes — but the corpus is small, mostly hand-extracted into typed knowledge already, and the consumer is the human author of `knowledge-graph.md`, not an LLM at runtime. Adding an embedding layer here is solution-looking-for-problem.

4. **Study-management / LIMS systems.** Hypothetical future: pulling study metadata from a sponsor's Veeva Vault, Benchling, or LabWare. None of these are in Airweave's connector list (Airweave's catalog is overwhelmingly horizontal-SaaS, not life-sciences-vertical), so the connector library doesn't help even if the use case appeared.

5. **Lattice meta-knowledge** (research/, audits/, decisions.log, TODO.md, MANIFEST.md). These are local markdown the framework already greps deterministically. An agent searching them via embedding would lose the citation precision that the current Grep-based skills depend on.

## Where airweave would fit vs not

| SENDEX/Lattice surface | Fit? | Reasoning |
|---|---|---|
| SEND `.xpt` ingest → `unified_findings.json` | **No** | Local file → deterministic Polars/Pandas pipeline. No SaaS, no embedding, no agent retrieval. Replacing this with Airweave would substitute a fragile network-bound vector layer for a reproducible deterministic one. |
| Frontend ↔ FastAPI generated-JSON serving | **No** | Structured findings consumed by typed React components. Embedding-based retrieval would destroy the field-contract typing that BFIELD-* invariants depend on (CLAUDE.md rule 18). |
| HCD external feeds | **No (sink mismatch)** | Even if a vendor exposed an API tomorrow, HCD values must land in the typed knowledge graph (rule 22), not a Vespa collection. Airweave's "embed and chunk" sink is the wrong shape for atomic contradictable facts. |
| Regulatory doc RAG (ICH/OECD/CDISC) | **Marginal** | Could work technically. But the corpus is already curated to typed facts, the consumer is the human author at spec-write time, and runtime LLM grounding against regulatory text is not a SENDEX feature. No stakeholder asking for it. |
| Lattice agent skills retrieving across `docs/_internal/` | **No** | Lattice skills currently use Grep/Read with explicit citations (`file.ext:LINE`). Switching to embedding retrieval would break the reuse-anchor-drift audit (CLAUDE.md rule 5) which depends on exact-citation provenance. |
| Datagrok plugin migration target | **No** | Datagrok is the deployment target, not a data source. Plugin runs in-platform against Datagrok's data services; no SaaS sync layer needed. |

## Recommendation

**Ignore Airweave for SENDEX.** The value prop — "auth + sync + chunk + embed + retrieve from 50+ horizontal-SaaS connectors" — misses on two independent axes:

1. **No SaaS sources.** SENDEX's data is local SEND files, processed deterministically. The connector library has no toxicology/LIMS/HCD entries; even if it did, none of SENDEX's current data flow is bottlenecked on integration code.
2. **Wrong sink shape for the load-bearing knowledge.** SENDEX's external-facts surface (HCD thresholds, regulatory cutoffs) lives in the typed knowledge graph because contradiction-audit and provenance-gap checks require typed records, not embedded chunks. Routing those through a vector DB would *regress* CLAUDE.md rule 22 compliance.

**One small idea worth extracting (not the framework itself):** Airweave's stack choice of **Temporal for sync orchestration with health-checked containerized services** is a reasonable reference for the day SENDEX needs scheduled regenerate-and-validate runs across a study portfolio. The Lattice `regen-validation` skill currently runs on demand; if portfolio-scale automation lands on the roadmap, Temporal (or its lighter siblings: Prefect, Dagster) is the right primitive. That's a one-line architectural note, not a dependency on Airweave.

**Not recommended:** wiring Airweave anywhere in SENDEX, even for the "regulatory doc RAG" hypothetical — small static corpus + human-curator consumer + typed-fact destination = embedding retrieval is overkill.
