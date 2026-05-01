# Memvid — Lattice/SENDEX Leverage Analysis

**URL:** https://github.com/memvid/memvid
**Verdict:** LOW
**One-line:** A single-file, append-only memory archive (Tantivy + HNSW + WAL packed into one `.mv2` blob) aimed at "give your AI agent portable long-term memory" — solves a deployment-portability problem we don't have, with semantic-search machinery we *could* lift but cheaper to build directly on `sentence-transformers` + a vector store.

## What it is (mechanically)

Memvid is a Rust library (`memvid-core` crate, ~15k stars, last push 2026-03-16, Apache-2.0) with PyO3 Python bindings (`memvid-sdk`, pre-built wheels) and Node/CLI SDKs. Despite the name and the "Smart Frames" branding that gestures at video encoding, **the v2 format is not video-encoded** — the README explicitly deprecates v1's QR-code-into-video-frames trick. The "video-inspired" framing is a marketing metaphor: append-only segments are called "frames," nothing more. (Topics still list `opencv` and `video-processing`, but those tie to v1 and to the optional CLIP/Whisper features for indexing actual media.)

Mechanically, memvid packs **everything into one `.mv2` file**: a 4 KB header (magic `MV2\0`, version, footer offset), a 1–64 MB embedded WAL for crash recovery, zstd/LZ4-compressed data segments holding frames (`frame_id`, `uri`, `title`, timestamp, payload, tags, status), an optional Tantivy lex index segment (BM25 full-text), an optional HNSW vec index segment (default 384-dim BGE-small via ONNX, cosine, M=16, ef=200), a time index, and a footer TOC with per-segment SHA-256 checksums. No sidecar `.wal`/`.lock`/`.shm` files. URIs follow `mv2://path/to/doc`. See `MV2_SPEC.md` and `src/{footer,lex,vec,reader,memvid}.rs`.

The write/read API is small: `Memvid::create(path)` → `put_bytes_with_options(bytes, PutOptions{title,uri,tags})` → `commit()` → `search(SearchRequest{query, top_k, scope, as_of_frame, as_of_ts, ...})` returning ranked hits with snippets. Optional features include `lex` (Tantivy), `vec` (HNSW + local BGE-small/base, Nomic, GTE-large), `clip` (image search), `whisper` (audio transcription), `api_embed` (OpenAI), `temporal_track` ("last Tuesday" parsing), `encryption` (password capsules `.mv2e`), `pdf_extract`, `symspell_cleanup`. Deployment surfaces: cargo crate, Python wheel (7–100 MB depending on platform), npm CLI/SDK. Embedding models are downloaded out-of-band from HuggingFace into `~/.cache/memvid/text-models/`.

## Comparison to Lattice's existing memory + knowledge graph + research corpus

| Feature | Lattice has it? | Memvid better? | Gap closed? |
|---|---|---|---|
| Plain-text markdown corpus with frontmatter | Yes (`memory/`, `docs/_internal/research/`, `docs/_internal/knowledge/`) | No — memvid stores opaque compressed blobs in one binary file | None |
| Per-domain index files (MEMORY.md, methods-index.md, etc.) | Yes | No — TOC is internal, not human-readable | None |
| Full-text search (BM25) | grep / ripgrep is what we use; no BM25 ranking | Yes for *ranked relevance*, not for navigation | Marginal — we rarely rank-search; we navigate by index |
| Semantic / embedding-based retrieval | **No** | Yes — HNSW + BGE-small built-in | **Real gap** (literature registry, research corpus) |
| Append-only, contradiction-edge knowledge graph | Yes (`knowledge-graph.md` typed YAML facts with `contradicts:` edges, `audit-knowledge-graph.py`) | **No** — memvid frames are flat; tags are k/v strings, no relational schema | None — memvid is *less* expressive |
| Mechanical contradiction detection | Yes (`scripts/audit-knowledge-graph.py`, within-graph + provenance audits) | No | None |
| Time-travel / "as of" queries | No (we use git history) | Yes (`as_of_frame`, `as_of_ts` in `SearchRequest`) | Curiosity, not a need — git already gives us this for any text artifact |
| Crash safety / WAL | N/A (we have git) | Yes | None — we have git |
| Cross-platform single-file portability | N/A (whole repo is the unit) | Yes | None — not a goal |
| Multi-modal (image via CLIP, audio via Whisper) | No | Yes | Marginal — SENDEX doesn't ingest images/audio; if we did, we'd reach for CLIP/Whisper directly |
| Auto-archival / lifecycle (research-temp → durable knowledge) | No (manual; rule 7 honor-system) | **No** — memvid is append-only and has no concept of "promote to durable" | None — orthogonal |
| Schema evolution / typed facts | Yes (`fact_kind`, `confidence`, `scope`) | No — bag of `tags: Map<String,String>` | None — memvid is *less* expressive |

## Concrete leverage opportunities (if any)

Only one of Lattice's stated gaps maps to memvid at all, and it does so *weakly*:

1. **Embedding-based retrieval over the literature registry** (`docs/_internal/research/literature/*.md`, ~18 papers today, growing) is a real Lattice gap. Memvid *could* serve it: ingest each paper's `.md`, get HNSW retrieval over BGE-small embeddings, query from a `/lattice:research` step "find prior literature notes that mention rabbit LB baselines." But the win is the **embedding + ANN index**, not the file format. The `.mv2` envelope (WAL, single-file, time-index, mv2:// URIs) is dead weight for our use case — we already have git, file paths, and lifecycle. **A 30-line script wrapping `sentence-transformers` + `faiss` (or `chromadb` or `lancedb`) gives us the same retrieval quality with a lookup table of `path → vector` we can regenerate on commit and check into the repo.** No native binary, no PyO3 bridge, no opaque blob.

The other three gaps the task brief named are **not addressed by memvid at all**:

- *research-temp/ archival lifecycle* — memvid has no archival lifecycle; it's append-only with tombstones. Promotion-vs-deletion is exactly the curation work the human/agent must do regardless of storage backend.
- *Cross-conversation continuity beyond MEMORY.md* — memvid would just be another store. The actual gap is "semantic search over our markdown corpus," which collapses to gap #1 above.
- *Auto-curation of new knowledge-graph facts* — memvid has no schema, no contradiction edges, no provenance gates. It's strictly weaker than `knowledge-graph.md`.

## Why it might NOT be relevant

- **Use-case mismatch.** Memvid's pitch is "give your deployed AI agent portable memory it can carry across machines without a server." Our agents run inside Claude Code on one developer machine; portability of a `.mv2` blob solves nothing. Our knowledge IS the markdown repo, which is already portable, version-controlled, diff-able, and human-readable.
- **Strictly weaker schema than our knowledge graph.** Memvid frames are `(uri, title, payload bytes, k/v tags, timestamp)`. Our typed facts are `(value, encoding, confidence, scope{species,sex,domain,...}, fact_kind, derives_from, contradicts, scoring_eligible)`. Storing typed facts in memvid would *lose* the contradiction-edge semantics that the audit script depends on (CLAUDE.md rule 22, exemplar HCD-FACT-008 ↔ FACT-010).
- **Opaque storage breaks our review/diff workflow.** Pre-commit hooks, `/lattice:review` spec-vs-code traces, `git blame` on a knowledge-graph row, and human inspection of `audits/workflow-audits/*.md` all rely on plaintext. A `.mv2` binary blob can't be code-reviewed.
- **The interesting machinery is commodity.** Tantivy, HNSW, BGE-small via ONNX — each is independently usable in Python (`tantivy-py`, `hnswlib`/`faiss`, `sentence-transformers`) without buying into the wrapping format. If we want any of them, we use them directly.
- **Smart Frames branding is mostly marketing.** "Append-only ultra-efficient sequence of Smart Frames" describes any segmented log-structured store; the README's bullet list of benefits (append-only writes, time-travel, crash safety, frame compression) reduces to "we have a WAL + segments + a time index." Nothing here is a novel idea Lattice should import as a concept.
- **Dependency footprint.** Adding memvid to SENDEX or Lattice means a 7–100 MB native wheel per platform plus an ONNX runtime plus a HuggingFace model download (~120 MB BGE-small) — for retrieval over ~30 markdown files that grep handles in <50 ms.
- **v1 (QR-into-video) is deprecated.** The genuinely novel-sounding part of the project — the original "store text in QR codes embedded in video frames so a video file becomes your memory" — is the deprecated path. v2 is a conventional embedded vector+lex DB with a flair-of-frames vocabulary.

## Recommendation

**Ignore — covered by existing grep + knowledge graph for almost every Lattice need.** Take nothing from the library or its file format.

If/when the literature registry crosses ~50 papers and ranked semantic recall over it becomes a real workflow bottleneck, **extract the idea (embedding + ANN over markdown), don't take the library**: a ~30-line script using `sentence-transformers` (BGE-small or all-MiniLM-L6-v2) writing `(path, sha, vector)` rows into a checked-in `.lattice/literature-vectors.parquet` plus an inline `numpy` cosine top-k loader gives us the same retrieval quality with zero native dependencies and full grep/diff visibility on the index file. That work belongs as a future Lattice TODO under the literature registry, not as a memvid integration.

The one watch-list item worth a sentence in `feedback_*` form: if memvid v2 ships an `.mv2` → JSON dump tool that round-trips losslessly, the Tantivy+HNSW packed format becomes a curiosity for offline-shipped agent profiles — still not us.
