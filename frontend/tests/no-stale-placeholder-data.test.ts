/**
 * Stale Placeholder Guard
 *
 * React Query's `keepPreviousData` / `placeholderData: keepPreviousData` shows
 * the PREVIOUS query's result while a new query loads. This is dangerous for
 * entity-specific queries (e.g., finding context) because:
 *
 * 1. The old entity may have a different structure (sibling vs no sibling,
 *    different row count, different data_type).
 * 2. Components render the stale data with the wrong layout (rowSpan mismatch,
 *    wrong columns, duplicated group labels).
 * 3. The bug is intermittent — it only appears when switching between entities
 *    with different shapes, making it hard to reproduce.
 *
 * ROOT CAUSE (2026-03-08): useFindingContext used keepPreviousData. Clicking an
 * endpoint with a different structure (e.g., sibling sex present) would "infect"
 * all subsequent endpoint views with the stale layout until a hard refresh.
 *
 * This test scans hooks/ for keepPreviousData usage in entity-specific queries.
 * Hooks that legitimately need it (e.g., list/collection queries where shape is
 * stable) are allowlisted.
 */
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const HOOKS_DIR = path.resolve(__dirname, "../src/hooks");

// Hooks where keepPreviousData is safe — study-level collection queries
// whose shape is stable across settings changes (keyed by studyId+params only).
// DANGEROUS: hooks keyed by an entity ID (findingId, organId, etc.) where
// switching entities produces structurally different responses.
const ALLOWLIST = new Set<string>([
  "useAdverseEffectSummary.ts", // study-level summary list
  "useAESummary.ts",            // study-level summary
  "useFindingDoseTrends.ts",    // study-level trends list
  "useFindings.ts",             // study-level findings list
  "useLesionSeveritySummary.ts",// study-level summary
  "useNoaelSummary.ts",         // study-level NOAEL list
  "useOrganEvidenceDetail.ts",  // study-level organ list
  "useRuleResults.ts",          // study-level rule results
  "useStudySignalSummary.ts",   // study-level signal summary
  "useTargetOrganSummary.ts",   // study-level organ summary
  "useExclusionPreview.ts",     // exclusion preview keyed by study+endpoint, shape stable
  "useSyndromeRollup.ts",       // study-level syndrome rollup (keyed by studyId only; shape stable)
  "useLooFragilitySummary.ts",  // study-level findings aggregation, cache-shares with useFindings
]);

describe("no-stale-placeholder-data", () => {
  test("hooks/ files outside allowlist do not use keepPreviousData", () => {
    const files = fs.readdirSync(HOOKS_DIR).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    const violations: string[] = [];

    for (const file of files) {
      if (ALLOWLIST.has(file)) continue;

      const content = fs.readFileSync(path.join(HOOKS_DIR, file), "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        // Skip comments and import lines — only flag actual usage
        const trimmed = lines[i].trimStart();
        if (/keepPreviousData/.test(lines[i]) && !trimmed.startsWith("//") && !trimmed.startsWith("import ")) {
          violations.push(
            `${file}:${i + 1} — uses keepPreviousData. ` +
            `This causes stale cross-entity data to render with wrong layout. ` +
            `Remove it, or add ${file} to the allowlist with justification.`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("allowlist files actually exist", () => {
    const missing: string[] = [];
    for (const file of ALLOWLIST) {
      if (!fs.existsSync(path.join(HOOKS_DIR, file))) {
        missing.push(`Allowlisted file "${file}" does not exist`);
      }
    }
    expect(missing).toEqual([]);
  });
});
