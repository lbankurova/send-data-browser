/**
 * JSX Unicode Escape Lint
 *
 * Catches \uXXXX escape sequences in JSX text content where they render as
 * literal strings instead of Unicode characters. In JSX, escapes only work
 * inside JS expressions: {"\u2013"} or {`\u2013`}. Outside braces they
 * appear verbatim as "\u2013" in the browser.
 *
 * Valid:   {"\u2013"}  or  {`Day ${start}\u2013${end}`}
 * Invalid: <div>Day 1\u201314</div>  or  <option>A\u2013Z</option>
 */
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/** Recursively collect all .tsx files under a directory. */
function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...collectTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Detect unicode escapes in JSX text content.
 *
 * Strategy: walk each line, track brace depth to distinguish JSX text
 * (depth 0 after a `>`) from JS expressions (depth > 0 or inside quotes).
 * A simplified heuristic that catches the common case.
 */
function findBareUnicodeEscapes(
  filePath: string,
): { line: number; text: string }[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: { line: number; text: string }[] = [];
  const escapePattern = /\\u[0-9a-fA-F]{4}/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    escapePattern.lastIndex = 0;

    while ((match = escapePattern.exec(line)) !== null) {
      const col = match.index;
      const before = line.slice(0, col);

      // Skip if inside a JS string literal or template literal.
      // Count unescaped quotes before this position — odd means we're inside.
      const inDoubleQuote = (before.match(/(?<!\\)"/g)?.length ?? 0) % 2 === 1;
      const inSingleQuote = (before.match(/(?<!\\)'/g)?.length ?? 0) % 2 === 1;
      const inTemplateLit = (before.match(/(?<!\\)`/g)?.length ?? 0) % 2 === 1;

      if (inDoubleQuote || inSingleQuote || inTemplateLit) continue;

      // Skip if inside a JSX expression (brace depth > 0)
      let braceDepth = 0;
      for (let j = 0; j < col; j++) {
        if (line[j] === "{") braceDepth++;
        else if (line[j] === "}") braceDepth--;
      }
      if (braceDepth > 0) continue;

      // This escape is in JSX text content — it's a bug
      violations.push({ line: i + 1, text: line.trim() });
      break; // one report per line is enough
    }
  }
  return violations;
}

describe("JSX unicode escape lint", () => {
  const srcDir = path.resolve(__dirname, "../src");
  const tsxFiles = collectTsxFiles(srcDir);

  test("no bare \\\\uXXXX escapes in JSX text content", () => {
    const allViolations: { file: string; line: number; text: string }[] = [];

    for (const file of tsxFiles) {
      const violations = findBareUnicodeEscapes(file);
      for (const v of violations) {
        allViolations.push({
          file: path.relative(srcDir, file).replace(/\\/g, "/"),
          line: v.line,
          text: v.text,
        });
      }
    }

    if (allViolations.length > 0) {
      const report = allViolations
        .map((v) => `  ${v.file}:${v.line} — ${v.text}`)
        .join("\n");
      expect.fail(
        `Found ${allViolations.length} bare unicode escape(s) in JSX text content.\n` +
          `These render as literal "\\uXXXX" in the browser.\n` +
          `Fix by wrapping in JS expression: {"\\u2013"} or use the actual character.\n\n` +
          report,
      );
    }
  });
});
