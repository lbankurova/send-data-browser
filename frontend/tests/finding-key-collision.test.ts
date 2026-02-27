/**
 * Finding Key Collision Tests
 *
 * Validates that `finding_key()` produces unique keys for real study data.
 * Catches regressions where key construction misses a discriminating field
 * (e.g. the pre-fix 4-tuple key that missed `specimen` for terminal domains,
 * causing OM findings for different organs to collide).
 */
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { TERMINAL_DOMAINS } from "@/lib/send-constants";

const ROOT = path.resolve(__dirname, "../..");
const UNIFIED_PATH = path.join(
  ROOT,
  "backend/generated/PointCross/unified_findings.json"
);

/** Mirror of backend findings_pipeline.finding_key() */
function findingKey(f: Record<string, unknown>): string {
  const base = `${f.domain}|${f.test_code ?? ""}|${f.sex}|${f.day ?? ""}`;
  if (TERMINAL_DOMAINS.has(f.domain as string)) {
    return `${base}|${f.specimen ?? ""}`;
  }
  return base;
}

/** Old 4-tuple key (pre-fix) — no specimen for any domain */
function oldKey(f: Record<string, unknown>): string {
  return `${f.domain}|${f.test_code ?? ""}|${f.sex}|${f.day ?? ""}`;
}

describe("finding-key-collision", () => {
  const skip = !fs.existsSync(UNIFIED_PATH);

  test("unified_findings.json has unique keys with finding_key (includes specimen)", () => {
    if (skip) return;
    const data = JSON.parse(fs.readFileSync(UNIFIED_PATH, "utf-8"));
    const findings: Record<string, unknown>[] = data.findings ?? data;

    const seen = new Map<string, number>();
    const collisions: string[] = [];

    for (const f of findings) {
      const key = findingKey(f);
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count === 2) {
        collisions.push(key);
      }
    }

    expect(collisions).toEqual([]);
  });

  test("old 4-tuple key (without specimen) would have collisions for terminal domains", () => {
    if (skip) return;
    const data = JSON.parse(fs.readFileSync(UNIFIED_PATH, "utf-8"));
    const findings: Record<string, unknown>[] = data.findings ?? data;

    // Only check terminal domains where specimen matters
    const terminalFindings = findings.filter((f) =>
      TERMINAL_DOMAINS.has(f.domain as string)
    );

    if (terminalFindings.length === 0) return;

    const seen = new Map<string, number>();
    let collisionCount = 0;

    for (const f of terminalFindings) {
      const key = oldKey(f);
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count === 2) collisionCount++;
    }

    // OM domain typically has multiple organs with test_code="WEIGHT" — expect collisions
    expect(collisionCount).toBeGreaterThan(0);
  });

  test("finding_key covers all discriminating fields", () => {
    if (skip) return;
    const data = JSON.parse(fs.readFileSync(UNIFIED_PATH, "utf-8"));
    const findings: Record<string, unknown>[] = data.findings ?? data;

    // Every finding must have the required key fields
    for (const f of findings) {
      expect(f).toHaveProperty("domain");
      expect(f).toHaveProperty("sex");
      // test_code should exist (may be null for some domains but key handles it)
      expect("test_code" in f).toBe(true);
    }

    // Terminal domain findings must have specimen
    const terminal = findings.filter((f) =>
      TERMINAL_DOMAINS.has(f.domain as string)
    );
    for (const f of terminal) {
      expect("specimen" in f).toBe(true);
    }
  });
});
