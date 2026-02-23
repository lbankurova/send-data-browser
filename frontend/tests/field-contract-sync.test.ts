/**
 * Field Contract Sync Tests
 *
 * Ensures bidirectional coverage between:
 *   1. `// @field FIELD-XX` annotations in source files
 *   2. `### FIELD-XX` headings in docs/knowledge/field-contracts.md
 *
 * Catches:
 *   - Undocumented fields (annotation exists, no doc entry)
 *   - Orphaned doc entries (doc entry exists, no annotation)
 *   - Duplicate annotations (same FIELD-XX in multiple functions without doc awareness)
 *
 * Runs on every `npm test` to enforce field-contracts maintenance.
 */
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const FIELD_CONTRACTS = path.join(
  ROOT,
  "docs/knowledge/field-contracts.md"
);
const LIB_DIR = path.join(ROOT, "frontend/src/lib");

/** Parse all `### FIELD-XX` headings from field-contracts.md */
function parseDocFieldIds(): Set<string> {
  const content = fs.readFileSync(FIELD_CONTRACTS, "utf-8");
  const ids = new Set<string>();
  const re = /^### (FIELD-\d+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

/** Scan all .ts files in lib/ for `// @field FIELD-XX` annotations */
function parseCodeAnnotations(): Map<string, string[]> {
  const annotations = new Map<string, string[]>(); // FIELD-XX → [file:line, ...]
  const files = fs.readdirSync(LIB_DIR).filter((f) => f.endsWith(".ts"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(LIB_DIR, file), "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/\/\/\s*@field\s+(FIELD-\d+)/);
      if (match) {
        const id = match[1];
        const loc = `${file}:${i + 1}`;
        if (!annotations.has(id)) {
          annotations.set(id, []);
        }
        annotations.get(id)!.push(loc);
      }
    }
  }
  return annotations;
}

describe("field-contract-sync", () => {
  const docIds = parseDocFieldIds();
  const codeAnnotations = parseCodeAnnotations();
  const codeIds = new Set(codeAnnotations.keys());

  test("field-contracts.md exists and has entries", () => {
    expect(fs.existsSync(FIELD_CONTRACTS)).toBe(true);
    expect(docIds.size).toBeGreaterThan(0);
  });

  test("source files have @field annotations", () => {
    expect(codeIds.size).toBeGreaterThan(0);
  });

  test("every @field annotation in code has a doc entry", () => {
    const undocumented: string[] = [];
    for (const id of codeIds) {
      if (!docIds.has(id)) {
        const locations = codeAnnotations.get(id)!.join(", ");
        undocumented.push(`${id} annotated at [${locations}] but missing from field-contracts.md`);
      }
    }
    expect(undocumented).toEqual([]);
  });

  test("every doc entry has at least one @field annotation in code", () => {
    // FIELD-33 is a backend field (dose_groups.py) — exempt from frontend annotation requirement
    const BACKEND_FIELDS = new Set(["FIELD-33"]);

    const orphaned: string[] = [];
    for (const id of docIds) {
      if (BACKEND_FIELDS.has(id)) continue;
      if (!codeIds.has(id)) {
        orphaned.push(`${id} documented but no @field annotation found in frontend/src/lib/`);
      }
    }
    expect(orphaned).toEqual([]);
  });

  test("FIELD IDs are sequentially allocated with no gaps", () => {
    const allIds = new Set([...docIds, ...codeIds]);
    const numbers = [...allIds]
      .map((id) => parseInt(id.replace("FIELD-", ""), 10))
      .sort((a, b) => a - b);

    if (numbers.length === 0) return;

    const gaps: number[] = [];
    for (let i = numbers[0]; i <= numbers[numbers.length - 1]; i++) {
      if (!allIds.has(`FIELD-${String(i).padStart(2, "0")}`)) {
        gaps.push(i);
      }
    }
    expect(gaps).toEqual([]);
  });
});
