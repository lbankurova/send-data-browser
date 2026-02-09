# Push Checklist — Squash 72 Commits to Master

> **Created:** 2026-02-09
> **Purpose:** Step-by-step instructions for preparing a clean single-commit push to origin/master.

---

## Step 1: Remove competitor product references

Application code (`frontend/`, `backend/`) is clean — no references.

### Files to edit

| File | Line(s) | Reference | Action |
|------|---------|-----------|--------|
| `docs/systems/validation-engine.md` | 512 | "compare with Pinnacle 21/CDISC CORE output" | Remove product names, keep the validation concept |
| `docs/portability/prototype-decisions-log.md` | 39 | "Pinnacle 21 (commercial)" + "compare against Pinnacle 21 output" | Remove product names from alternatives and port impact columns |
| `docs/decisions/05-endpoint-bookmarks.md` | 9 | "Inspired by Certara sendexplorer's 'Endpoints of Interest' feature" | Rewrite as generic pattern description |
| `docs/decisions/06-subject-level-histopath.md` | 9, 161, 162 | "Certara sendexplorer's Microscopic Findings Heatmap" / "Certara convention" | Rewrite as generic pattern descriptions |
| `docs/decisions/07-clinical-observations-view.md` | 7 | "The Certara sendexplorer handles this with grouped bar charts" | Rewrite as generic design rationale |
| `docs/design-system/user-personas-and-view-analysis-original.md` | 716 | "CDISC Pinnacle 21 parity" | Remove product name, keep capability gap description |
| `.claude/commands/ux-designer.md` | 208 | "Existing tools (Certara sendexplorer, Pinnacle 21, Instem Provantis, PathData, ToxSuite)" | Remove the full competitor list |
| `.claude/roles/ux-designer-notes.md` | 36 | "Certara sendexplorer analysis" | Remove line |

---

## Step 2: Remove Claude Code / Anthropic references

Application code (`frontend/`, `backend/`) is clean — no references.

### Files to edit

| File | What to clean |
|------|--------------|
| `CLAUDE.md` | Line 3: "guidance to Claude Code (claude.ai/code)" — rewrite as neutral project instructions header |
| `.gitignore` | Lines 24-25: "# Claude Code local settings" comment — remove or neutralize |
| `docs/reference/claude-md-archive.md` | Lines 1, 3, 5: title and description reference "CLAUDE.md" — rewrite as neutral archive reference |
| `docs/reference/demo-stub-guide.md` | Line 3: "Extracted from CLAUDE.md" — rewrite as neutral source reference |
| `docs/design-system/datagrok-llm-development-guide.md` | Lines 13, 19, 25, 56: "CLAUDE.md" references — replace with neutral term (e.g., "project instructions file") |
| `docs/design-system/datagrok-llm-development-guide-original.md` | 20+ CLAUDE.md references throughout — replace with neutral terms |
| `docs/portability/clinical-case-handoff.md` | 12+ CLAUDE.md references — replace with neutral terms |
| `docs/portability/prototype-decisions-log.md` | Lines 71, 77: CLAUDE.md references — neutralize |
| `docs/portability/porting-guide.md` | Line 6: "Source of truth... CLAUDE.md" — neutralize |
| `docs/scaffold/prototype-methodology-guide.md` | 10+ CLAUDE.md references — replace with neutral terms |
| `docs/scaffold/prototype-project-template/README.md` | 10+ references including template — replace with neutral terms |
| `docs/views/dose-response.md` | Line 351, 999: "see CLAUDE.md" / "Added standing rule to CLAUDE.md" — neutralize |
| `docs/design-system/datagrok-visual-design-guide.md` | Line 102: "Hard rule — see CLAUDE.md" — neutralize |
| `docs/systems/validation-engine.md` | Line 560: changelog mentions CLAUDE.md as source |
| `docs/systems/annotations.md` | Line 249: changelog mentions CLAUDE.md as source |
| `docs/systems/navigation-and-layout.md` | Line 289: changelog mentions CLAUDE.md as source |
| `docs/systems/insights-engine.md` | Line 703: changelog mentions CLAUDE.md as source |
| `docs/decisions/dose-response-redesign.md` | Line 235: "CLAUDE.md updates" |
| `docs/incoming/archive/09-dr-cl-consolidation.md` | Line 180: "from §12.3 in CLAUDE.md" |
| `docs/MANIFEST.md` | Line 45: "claude-md-archive.md" reference — rename if file is renamed |

### Decision: CLAUDE.md filename

Keep the filename. It is a convention for LLM-driven project instructions files and carries no branding. The internal references to "CLAUDE.md" as a concept (in scaffold docs, handoff docs) describe the pattern, not the product.

If you prefer to rename: `CLAUDE.md` → `PROJECT.md` or `DEVELOPMENT.md`, then update all internal references accordingly.

---

## Step 3: Squash 72 commits into 1

```bash
# Create a backup branch
git branch backup-pre-squash

# Soft reset to origin/master (keeps all file changes staged)
git reset --soft origin/master

# Commit with a clean message (no Co-Authored-By)
git commit -m "SEND Data Browser — complete prototype with 8 analysis views, validation engine, and Datagrok portability docs"
```

---

## Step 4: Verify and push

```bash
# Verify the squash produced 1 commit ahead of origin
git log --oneline -3

# Verify all files are present
git diff origin/master --stat

# Verify build still passes
cd C:/pg/pcc/frontend && npm run build

# Push
git push origin master
```

---

## Step 5: Post-push cleanup

- Delete backup branch: `git branch -d backup-pre-squash`
- Clear stale commit hashes from `.claude/roles/*.md` handoff notes (all hashes are now invalid)
