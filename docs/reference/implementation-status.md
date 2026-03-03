# Implementation Status — What's Real vs. Demo

Full migration guide with file paths and line numbers: `docs/reference/demo-stub-guide.md`

| Component | Status | Notes |
|-----------|--------|-------|
| Statistical analysis pipeline (generator/) | **Real** | Computes actual statistics from XPT data |
| Signal scoring & rule engine | **Real** | Rules R01-R17 derive from actual data patterns |
| HTML report generator (frontend) | **Real** | Fetches live data, builds complete standalone report |
| All 7 analysis views (UI) | **Real** | Fully interactive, data-driven UI components |
| Context panels & insights synthesis | **Real** | Rule synthesis, organ grouping, tier classification |
| ToxFinding / PathologyReview forms | **Real** | Functional forms, persist via API (storage is file-based) |
| Annotation API contract | **Real** | GET/PUT endpoints, 4 schema types — only storage backend needs changing |
| React Query data hooks | **Real** | All hooks are production-ready, no mocking |
| Landing page | **Real** | Shows all discovered studies, no demo entries |
| Validation engine & rules | **Real** | 14 YAML rules (7 SD + 7 FDA), Python engine reads XPT data, optional CDISC CORE, API serves results via hooks |
| Import section | **Real** | Drag-and-drop .zip upload, backend extraction, auto-registration |
| Delete study | **Real** | Context menu delete with confirmation, removes all dirs |
| Treatment arms | **Real** | Dynamic ARMCD detection from TX/DM, treatment arms table in details |
| Multi-study support | **Real** | ALLOWED_STUDIES empty, all studies in send/ served |
| Parameterized analysis pipeline | **Real** | 8/10 settings active (Phase 1-3). Transforms: scheduled_only, recovery_pooling, effect_size, multiplicity, pairwise_test (Williams), trend_test (Williams-trend), organ_weight_method, adversity_threshold. 3 still placeholder: Steel, Cuzick, logistic-slope. |
| Export (CSV/Excel) | **Stub** | alert() placeholder |
| Share | **Stub** | Disabled menu item, no implementation |
| Authentication | **Missing** | No auth anywhere, hardcoded "User" identity |
| Database storage | **Missing** | Annotations use JSON files on disk |
