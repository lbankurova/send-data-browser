# Domain Knowledge Map

Before writing or modifying logic involving these topics, read the referenced file first.

## Knowledge (durable, maintained)

| Topic | File | When to consult |
|-------|------|-----------------|
| Species biology | `docs/_internal/knowledge/species-profiles.md` | Species-specific thresholds, expected findings, strain differences |
| Vehicle controls | `docs/_internal/knowledge/vehicle-profiles.md` | Control group classification, vehicle-related artifacts |
| Statistical methods | `docs/_internal/knowledge/methods-index.md` | Adding/modifying statistical tests, method selection logic |
| Field contracts (API) | `docs/_internal/knowledge/field-contracts-index.md` | API shape changes, adding new fields to generated JSON |
| Field contracts (full) | `docs/_internal/knowledge/field-contracts.md` | Detailed field definitions, nullable semantics |
| Contract triangles | `docs/_internal/knowledge/contract-triangles.md` | **Read first when modifying any contract-level enum/field** — lists declaration/enforcement/consumption sites per CLAUDE.md rule 18 |
| Knowledge graph (atomic facts) | `docs/_internal/knowledge/knowledge-graph.md` | **Read first when adding/modifying domain-truth facts** (HCD thresholds, syndrome rules, severity gradings). Typed schema with multi-dim scope, fact_kind, confidence + scoring_eligible enforcement, contradicts edges. Audit: `scripts/audit-knowledge-graph.py`. **Query (F1):** `python scripts/query-knowledge.py --scope species:rat --kind clinical_threshold --format markdown` — structured exact-match interface used by `/lattice:peer-review`, `/lattice:architect`, and `/lattice:review` ALGORITHM CHECK. Day-1 stub: when no fact matches, the script prints a fallback notice ("no fact found in domain-truth oracle; falling back to LLM judgment with explicit caveat") and exits 0. Use `--strict` for fail-loud callers. Free-text / embedding queries are deferred to F1 Phase 2. |
| Knowledge-graph schema spec | `docs/_internal/architecture/typed-knowledge-graph-spec.md` | **Read first when extending the schema** (new fact_kind / encoding / confidence level) or instantiating a new typed registry beyond HCD. Names the 7 schema extensions with motivation + audit semantics. |
| Syndrome engine | `docs/_internal/knowledge/syndrome-engine-reference.md` | Syndrome rule changes, threshold tuning, certainty scoring |
| Recovery data handling | `docs/_internal/knowledge/recovery-animal-data-handling-spec.md` | Recovery logic, verdict computation, baseline selection |
| Recovery verdict audit | `docs/_internal/knowledge/continuous-recovery-verdict-audit.md` | Continuous domain recovery correctness |
| Methods (generated doc) | `docs/methods.md` | Public-facing methods reference (auto-generated, 145KB) |
| PhUSE study inventory | `docs/_internal/knowledge/phuse-scripts-inventory.md` | Available validation studies, what data each has |
| System manifest (Layer 0) | `docs/_internal/knowledge/system-manifest.md` | **Read first** for any cross-subsystem question. 25 subsystems, data flow, override cascades, invariants. |
| Scoring engine model (Layer 1) | `docs/_internal/knowledge/scoring-engine-model.md` | Detailed 17-step scoring pipeline. Drill-down from system manifest S10. |
| Code quality guardrails | `docs/_internal/knowledge/code-quality-guardrails.md` | Complexity budgets, canonical patterns, domain-critical modules |

## Meta-Orchestration

| Topic | File | When to consult |
|-------|------|-----------------|
| Research registry | `docs/_internal/research/REGISTRY.md` | Before starting research — check for active streams and known implications |
| Literature registry (domain) | `docs/_internal/research/literature/README.md` | Before extracting numeric/regulatory claims into `knowledge/` — check whether the source already has a literature note. Schema and registry of external domain sources (regulatory, toxicology, HCD, methods papers). |
| Cross-impact probe | `/lattice:probe` | After concluding research or making a design decision that touches ANY subsystem |

## Research (session artifacts — check INDEX.md for status)

| Topic | Path | When to consult |
|-------|------|-----------------|
| Species-specific scientific logic | `docs/_internal/research/scientific-logic-review-answers-*.md` | 5 files: rat, dog, rabbit, NHP, guinea pig. Species-specific expected findings and thresholds. |
| Organ weight normalization | `docs/_internal/research/organ-weight-normalization.md` | BW mediation, Hedges' g, normalization decisions |
| Dose-response patterns | `docs/_internal/research/dose-response-pattern.md` | Pattern classification, non-monotonic detection |
| Non-monotonic D-R | `docs/_internal/research/d-r/NonMonotonic_DoseResponse_29mar2026.md` | U-shape, inverted-U, hormesis |
| Historical control data | `docs/_internal/research/hcd/` | HCD sourcing, species coverage, seed data |
| Compound class profiles | `docs/_internal/research/compound profiles/` | ADCs, gene therapy, mAb expected effects |
| Expected effects (AAV) | `docs/_internal/research/aav-gene-therapy-expected-effects.md` | AAV vector gene therapy pharmacology |
| Expected effects (oligo) | `docs/_internal/research/oligo-checkpoint-expected-effects.md` | Oligonucleotide / checkpoint inhibitor pharmacology |
| Tumor evaluation | `docs/_internal/research/tumor-evaluation.md` | Tumor classification, progression chains |
| Signal scoring | `docs/_internal/research/signal-scoring.md` | Composite signal score computation |
| PK-tox integration | `docs/_internal/research/pk-tox-integration.md` | TK satellite handling, exposure-response |
| FDA SEND review process | `docs/_internal/research/fda-send-review-process.md` | How FDA reviewers use SEND data |
| Regulatory standards | `docs/_internal/research/regulatory-standards.md` | ICH, OECD, CDISC standards |
| Multi-compound studies | `docs/_internal/research/multi-compound-studies/` | Trend suppression, cross-compound analysis |
| Control group models | `docs/_internal/research/control-groups/` | Dual control, negative control handling |
| Recovery duration | `docs/_internal/research/recovery-duration/` | Cross-validation, duration lookup tables |
| CV telemetry | `docs/_internal/research/engine/cardiovascular-telementry-analysis.md` | Safety pharm CV endpoint analysis |

## Validation

| Topic | Path | When to consult |
|-------|------|-----------------|
| Study reference cards | `docs/validation/references/*.yaml` | After engine changes — check which studies exercise the pattern |
| Validation summary | `docs/validation/summary.md` | Current signal detection and design match scores |
| Signal detection detail | `docs/validation/signal-detection.md` | Per-study signal tables with effect sizes |
