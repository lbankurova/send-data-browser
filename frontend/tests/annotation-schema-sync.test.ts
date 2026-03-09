/**
 * Annotation Schema Sync Tests
 *
 * Ensures every schema name string passed to useAnnotations() or
 * useSaveAnnotation() in frontend source matches a valid schema type
 * registered in backend/routers/annotations.py VALID_SCHEMA_TYPES.
 *
 * Catches: singular/plural typos, underscore vs hyphen, unregistered schemas.
 * Runs on every `npm test` — no running backend required.
 */
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const BACKEND_ANNOTATIONS = path.join(ROOT, "backend/routers/annotations.py");
const FRONTEND_SRC = path.join(ROOT, "frontend/src");

/** Parse VALID_SCHEMA_TYPES from backend annotations.py */
function parseBackendSchemaTypes(): Set<string> {
  const content = fs.readFileSync(BACKEND_ANNOTATIONS, "utf-8");
  // Match everything between VALID_SCHEMA_TYPES = { ... }
  const match = content.match(/VALID_SCHEMA_TYPES\s*=\s*\{([^}]+)\}/s);
  if (!match) throw new Error("Could not find VALID_SCHEMA_TYPES in annotations.py");

  const types = new Set<string>();
  const re = /"([a-z][a-z0-9-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(match[1])) !== null) {
    types.add(m[1]);
  }
  return types;
}

/** Recursively find all .ts/.tsx files under a directory */
function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...findTsFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

interface SchemaUsage {
  file: string;
  line: number;
  hook: string;
  schema: string;
}

/** Scan frontend source for useAnnotations / useSaveAnnotation calls */
function findSchemaUsages(): SchemaUsage[] {
  const usages: SchemaUsage[] = [];
  const files = findTsFiles(FRONTEND_SRC);
  // Match: useAnnotations<...>(anything, "schema-name")
  //    or: useSaveAnnotation<...>(anything, "schema-name")
  const re = /\b(useAnnotations|useSaveAnnotation)\b[^(]*\([^,]+,\s*"([^"]+)"\)/g;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(lines[i])) !== null) {
        usages.push({
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          line: i + 1,
          hook: m[1],
          schema: m[2],
        });
      }
    }
  }
  return usages;
}

describe("Annotation Schema Sync", () => {
  const validTypes = parseBackendSchemaTypes();
  const usages = findSchemaUsages();

  test("backend VALID_SCHEMA_TYPES is non-empty", () => {
    expect(validTypes.size).toBeGreaterThan(5);
  });

  test("frontend has annotation hook usages", () => {
    expect(usages.length).toBeGreaterThan(0);
  });

  test("every frontend schema name matches a backend VALID_SCHEMA_TYPE", () => {
    const mismatches = usages.filter((u) => !validTypes.has(u.schema));
    if (mismatches.length > 0) {
      const details = mismatches
        .map((u) => `  ${u.file}:${u.line}  ${u.hook}(..., "${u.schema}")`)
        .join("\n");
      expect.fail(
        `${mismatches.length} schema name mismatch(es):\n${details}\n\n` +
        `Valid backend types: ${[...validTypes].sort().join(", ")}`
      );
    }
  });
});
