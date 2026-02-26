/**
 * Re-derivation Lint Test
 *
 * Prevents frontend lib/ files from re-aggregating `group_stats` to derive
 * metrics that the backend already computes (e.g., max_incidence, max_fold_change).
 *
 * Files that legitimately need group_stats access for runtime computation
 * (method switching, ECI checks, normalization, etc.) are allowlisted.
 *
 * Catches future agents re-deriving from group_stats in new utility files.
 */
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const LIB_DIR = path.resolve(__dirname, "../src/lib");

// Files justified to access group_stats for computation
const ALLOWLIST = new Set([
  "stat-method-transforms.ts",    // runtime method switching (Hedges' g / Cohen's d / Glass's delta)
  "endpoint-confidence.ts",       // ECI integrity checks (variance, monotonicity, trend concordance)
  "organ-weight-normalization.ts", // BW confounding detection
  "organ-proportionality.ts",     // OPI syndrome computation
  "derive-summaries.ts",          // endpoint-level cross-sex aggregation (controlStats/worstTreatedStats)
  "recovery-assessment.ts",       // derived from raw subject data, no backend equivalent
]);

// Patterns that indicate re-aggregation of group_stats
const FLAGGED_PATTERNS = [
  /group_stats[^;]*\.filter\([^)]*\)\.(reduce|map)/,
  /group_stats[^;]*\.reduce\(/,
  /group_stats[^;]*\.find\([^)]*dose_level\s*===\s*0/,
];

describe("no-redundant-derivation", () => {
  test("lib/ files outside allowlist do not aggregate group_stats", () => {
    const files = fs.readdirSync(LIB_DIR).filter((f) => f.endsWith(".ts"));
    const violations: string[] = [];

    for (const file of files) {
      if (ALLOWLIST.has(file)) continue;

      const content = fs.readFileSync(path.join(LIB_DIR, file), "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        for (const pattern of FLAGGED_PATTERNS) {
          if (pattern.test(lines[i])) {
            violations.push(
              `${file}:${i + 1} — re-derives from group_stats (pattern: ${pattern.source}). ` +
              `Use a backend-computed field instead, or add ${file} to the allowlist with justification.`
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("allowlist files actually exist", () => {
    const missing: string[] = [];
    for (const file of ALLOWLIST) {
      if (!fs.existsSync(path.join(LIB_DIR, file))) {
        missing.push(`Allowlisted file "${file}" does not exist`);
      }
    }
    expect(missing).toEqual([]);
  });
});
