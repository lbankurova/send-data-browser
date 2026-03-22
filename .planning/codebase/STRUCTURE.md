# Directory Structure

```
/c/pg/pcc/
├── backend/                             # FastAPI Python application
│   ├── main.py                          # App entry, lifespan, router mounting
│   ├── config.py                        # Global settings (paths, filters)
│   ├── requirements.txt                 # Python dependencies
│   ├── routers/                         # 9 API route handlers
│   │   ├── studies.py                   # Domain browsing, metadata
│   │   ├── analyses.py                  # Dynamic adverse effects
│   │   ├── analysis_views.py            # Pre-generated JSON serving
│   │   ├── annotations.py              # Annotation CRUD
│   │   ├── validation.py               # Validation engine
│   │   ├── temporal.py                  # Time-course data
│   │   ├── import_study.py             # Study import
│   │   ├── scenarios.py                # Test scenarios
│   │   └── study_portfolio.py          # Multi-study views
│   ├── services/                        # Business logic layer
│   │   ├── study_discovery.py           # Study scanning
│   │   ├── xpt_processor.py             # XPT I/O + CSV caching
│   │   ├── study_metadata_service.py    # TS domain → StudyMetadata
│   │   ├── insights_engine.py           # R01-R17 rule engine
│   │   └── analysis/                    # 45 analysis modules
│   │       ├── parameterized_pipeline.py # Main orchestrator (8 settings)
│   │       ├── findings_pipeline.py     # Shared enrichment
│   │       ├── findings_lb.py ... findings_vs.py  # 12 domain finders
│   │       ├── statistics.py            # Statistical tests
│   │       ├── classification.py        # Effect grading
│   │       └── ...                      # 30+ utility modules
│   ├── generator/                       # Pre-generation pipeline
│   │   ├── generate.py                  # CLI entry point
│   │   ├── domain_stats.py              # Per-domain statistics
│   │   ├── static_charts.py             # HTML chart output
│   │   └── ...                          # Specialized generators
│   ├── validation/                      # Rule-based validation
│   │   ├── engine.py                    # Main ValidationEngine
│   │   ├── core_runner.py               # CDISC CORE integration
│   │   ├── models.py                    # Validation schemas
│   │   ├── checks/                      # Check implementations
│   │   ├── rules/                       # 14 YAML rule definitions
│   │   └── metadata/                    # SENDIG variable metadata
│   ├── models/                          # Pydantic schemas
│   ├── annotations/                     # JSON annotation storage
│   ├── generated/                       # Pre-generated outputs
│   │   └── {study_id}/                  # 8 JSON + 1 HTML per study
│   ├── cache/                           # XPT → CSV cache
│   ├── data/                            # Reference data (hcd.db)
│   ├── etl/                             # ETL utilities
│   ├── scenarios/                       # Test fixtures
│   ├── tests/                           # Backend tests
│   ├── _core_engine/                    # CDISC CORE version mgmt
│   └── venv/                            # Python virtual environment
│
├── frontend/                            # React + Vite application
│   ├── src/
│   │   ├── main.tsx                     # React init, QueryClient
│   │   ├── App.tsx                      # Router setup (8 routes)
│   │   ├── index.css                    # TailwindCSS, design tokens
│   │   ├── components/
│   │   │   ├── layout/                  # Three-panel layout
│   │   │   │   ├── Layout.tsx           # Main 3-panel structure
│   │   │   │   └── Header.tsx           # App header
│   │   │   ├── tree/                    # Navigation
│   │   │   │   └── BrowsingTree.tsx     # Study/domain tree
│   │   │   ├── panels/                  # Content panels
│   │   │   │   ├── AppLandingPage.tsx   # Landing page
│   │   │   │   ├── CenterPanel.tsx      # Center content
│   │   │   │   └── ContextPanel.tsx     # Right detail panel
│   │   │   ├── analysis/               # View components
│   │   │   │   ├── *ViewWrapper.tsx     # 6 view wrappers
│   │   │   │   └── ...                  # 25+ supporting components
│   │   │   ├── data-table/             # TanStack Table impls
│   │   │   ├── ui/                     # shadcn/ui components
│   │   │   ├── shell/                  # Rail management
│   │   │   └── portfolio/              # Multi-study views
│   │   ├── contexts/                    # 10 React Contexts
│   │   ├── hooks/                       # 75+ custom hooks
│   │   ├── lib/                         # 70+ utility modules
│   │   ├── types/                       # 6 TypeScript type files
│   │   ├── data/                        # Static reference data
│   │   └── assets/                      # Images, icons
│   ├── tests/                           # Vitest test files
│   ├── dist/                            # Production build output
│   ├── public/                          # Static assets
│   ├── package.json                     # npm dependencies
│   ├── vite.config.ts                   # Vite config
│   └── tsconfig.app.json               # TypeScript config
│
├── send/                                # SEND study data
│   └── {study_id}/                      # 16 study folders
│       └── *.xpt                        # Domain files (DM, LB, MI, etc.)
│
├── shared/                              # Cross-stack shared utilities
├── docs/                                # Comprehensive documentation
│   ├── systems/                         # 5 subsystem specs
│   ├── views/                           # 7 view specifications
│   ├── design-system/                   # Design tokens, audit checklist
│   ├── decisions/                       # 15+ ADRs
│   ├── deep-research/                   # Domain research
│   ├── knowledge/                       # Methods, species, vehicles
│   ├── reference/                       # Implementation status, API ref
│   ├── checklists/                      # COMMIT, POST-IMPLEMENTATION
│   ├── incoming/                        # Feature specs for handoff
│   ├── portability/                     # Datagrok migration guides
│   └── scaffold/                        # Templates
│
├── .claude/                             # Claude Code config
│   ├── commands/                        # Slash commands (custom + GSD)
│   ├── get-shit-done/                   # GSD framework
│   ├── agents/                          # GSD agent definitions
│   ├── hooks/                           # GSD hooks
│   ├── plans/                           # Claude Code plans
│   └── roles/                           # Agent roles
│
├── .planning/                           # GSD planning artifacts
│   └── codebase/                        # Codebase mapping docs
│
├── CLAUDE.md                            # Claude Code development guide
├── ARCHITECTURE.md                      # System architecture overview
├── README.md                            # Project README
└── LICENSE                              # MIT License
```

## Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Backend files | snake_case | `study_discovery.py`, `xpt_processor.py` |
| Frontend components | PascalCase | `StudySummaryViewWrapper.tsx`, `BrowsingTree.tsx` |
| Frontend hooks | camelCase with `use` prefix | `useStudies.ts`, `useDomainData.ts` |
| Frontend lib utilities | kebab-case | `cross-domain-syndromes.ts`, `severity-colors.ts` |
| Directories | kebab-case | `data-table/`, `design-system/` |
| URL routes | kebab-case | `/dose-response`, `/noael-determination` |
| Generated JSON | kebab-case | `study-signal-summary.json` |
| YAML rules | snake_case | `study_design.yaml` |

## Code Organization Principles

1. **Routers are thin** — dispatch only, business logic lives in services
2. **Services are reusable** — no route-specific logic, independently testable
3. **Hooks encapsulate** — data fetching + state + computed values
4. **Lib utilities are pure** — stateless, testable, composable functions
5. **Components are presentational** — UI rendering + event handling
6. **Types are centralized** — single source of truth shared across codebase
7. **Contexts are minimal** — only non-fetched UI state
