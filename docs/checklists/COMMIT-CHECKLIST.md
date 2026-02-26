# Agent Commit Checklist

Run every item before committing changes that alter system or view behavior. Every item must PASS.

---

- [ ] **1. Tests pass.** Run `npm test`. All pipeline assertions must pass. If a test fails, the fix is wrong — do not commit. If the fix intentionally changes behavior, update the test first and explain why.

- [ ] **2. Spec updated.** If you changed how a system or view works, update the corresponding `docs/systems/*.md` or `docs/views/*.md` to match. Specs must reflect code, not the other way around.

- [ ] **3. MANIFEST.md marked.** Set "Last validated" to today for any spec you updated. If you can't update the spec, mark it `STALE — <reason>` in MANIFEST.

- [ ] **4. Incoming specs checked.** Check `docs/incoming/` for feature specs that conflict with your changes. If a conflict exists, ask the user before committing.

- [ ] **5. Issue tracker updated.** Mark resolved items in `docs/incoming/arch-overhaul/spec-cleanup-b66dfd0.md` with strikethrough + commit hash. Update the summary counts and per-view table. Mandatory for every commit — no exceptions.

- [ ] **6. Knowledge docs updated (if analytical logic changed).** Skip if commit only touches UI, docs, or tests without changing analytical logic or field contracts.
  - Statistical test / algorithm / scoring formula changed → update `docs/knowledge/methods.md` (scan `docs/knowledge/methods-index.md` first)
  - Computed field at engine→UI boundary changed → update `docs/knowledge/field-contracts.md` (scan `docs/knowledge/field-contracts-index.md` first)
  - Backend generator output field changed → update `docs/knowledge/api-field-contracts.md`

- [ ] **7. UI components verified.** Every UI primitive (selects, dialogs, tooltips, popovers, badges, buttons) uses the project's shadcn/Radix component from `components/ui/`. No raw HTML equivalents where a shadcn component exists.

- [ ] **8. TOPIC hubs updated.** If your commit touches files listed in a TOPIC hub's File Map → Implementation section (`docs/incoming/arch-overhaul/TOPIC-*.md`), check whether the hub's "What Shipped" / "What's NOT Shipped" / line counts / commit table need updating. Skip if the commit doesn't touch any TOPIC-tracked files.

---

**Data pipeline bug fix protocol:** Write the failing test FIRST, then apply the fix, then confirm all tests pass. Non-negotiable for: `derive-summaries.ts`, `lab-clinical-catalog.ts`, `cross-domain-syndromes.ts`, `findings-rail-engine.ts`, `syndrome-interpretation.ts`, `SyndromeContextPanel.tsx`, `recovery-classification.ts`, `finding-nature.ts`, `protective-signal.ts`, classification.py, or any findings_*.py module.

**Agent verification boundaries:** Agents verify logic (`npm test`, `npm run build`, grep-based static checks). Agents do NOT verify visuals. If a change affects rendering, state: "Visual verification required by user."
