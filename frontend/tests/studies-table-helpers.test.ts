import { describe, it, expect } from "vitest";
import {
  isFilterActive,
  describeFilter,
  matchesFilter,
  compareValues,
  type ColumnFilter,
  type StudyColumnBase,
} from "@/components/panels/studies-table-helpers";

const CATEGORY_COL: StudyColumnBase = { key: "species", label: "Species", type: "category" };
const TEXT_COL: StudyColumnBase = { key: "protocol", label: "Protocol", type: "text" };
const NUMBER_COL: StudyColumnBase = { key: "subjects", label: "Subj", type: "number" };
const DATE_COL: StudyColumnBase = { key: "start_date", label: "Start", type: "date" };

describe("isFilterActive", () => {
  it("returns false for undefined", () => {
    expect(isFilterActive(undefined)).toBe(false);
  });

  it("category: inactive when values empty, active otherwise", () => {
    expect(isFilterActive({ kind: "category", values: [] })).toBe(false);
    expect(isFilterActive({ kind: "category", values: ["RAT"] })).toBe(true);
  });

  it("text: inactive when query is empty / whitespace, active otherwise", () => {
    expect(isFilterActive({ kind: "text", query: "" })).toBe(false);
    expect(isFilterActive({ kind: "text", query: "   " })).toBe(false);
    expect(isFilterActive({ kind: "text", query: "foo" })).toBe(true);
  });

  it("number: inactive when both bounds null, active when either set", () => {
    expect(isFilterActive({ kind: "number", min: null, max: null })).toBe(false);
    expect(isFilterActive({ kind: "number", min: 1, max: null })).toBe(true);
    expect(isFilterActive({ kind: "number", min: null, max: 10 })).toBe(true);
    expect(isFilterActive({ kind: "number", min: 0, max: 0 })).toBe(true);
  });

  it("date: inactive when both null/empty, active otherwise", () => {
    expect(isFilterActive({ kind: "date", from: null, to: null })).toBe(false);
    expect(isFilterActive({ kind: "date", from: "2020-01-01", to: null })).toBe(true);
    expect(isFilterActive({ kind: "date", from: null, to: "2020-12-31" })).toBe(true);
  });
});

describe("describeFilter", () => {
  it("category: 'Label: v1, v2'", () => {
    expect(describeFilter(CATEGORY_COL, { kind: "category", values: ["RAT", "DOG"] }))
      .toBe("Species: RAT, DOG");
  });

  it("text: 'Label contains \"q\"'", () => {
    expect(describeFilter(TEXT_COL, { kind: "text", query: "PDS" }))
      .toBe("Protocol contains \"PDS\"");
  });

  it("number: min+max uses en-dash; open ends use ≥ / ≤", () => {
    expect(describeFilter(NUMBER_COL, { kind: "number", min: 10, max: 100 }))
      .toBe("Subj: 10–100");
    expect(describeFilter(NUMBER_COL, { kind: "number", min: 10, max: null }))
      .toBe("Subj ≥ 10");
    expect(describeFilter(NUMBER_COL, { kind: "number", min: null, max: 100 }))
      .toBe("Subj ≤ 100");
  });

  it("date: both uses arrow; open ends use ≥ / ≤", () => {
    expect(describeFilter(DATE_COL, { kind: "date", from: "2020-01-01", to: "2020-12-31" }))
      .toBe("Start: 2020-01-01 → 2020-12-31");
    expect(describeFilter(DATE_COL, { kind: "date", from: "2020-01-01", to: null }))
      .toBe("Start ≥ 2020-01-01");
    expect(describeFilter(DATE_COL, { kind: "date", from: null, to: "2020-12-31" }))
      .toBe("Start ≤ 2020-12-31");
  });

  it("falls back to col.label for unknown / empty filters", () => {
    expect(describeFilter(NUMBER_COL, { kind: "number", min: null, max: null }))
      .toBe("Subj");
    expect(describeFilter(DATE_COL, { kind: "date", from: null, to: null }))
      .toBe("Start");
  });
});

describe("matchesFilter — category", () => {
  const f: ColumnFilter = { kind: "category", values: ["RAT", "DOG"] };

  it("empty values passes everything", () => {
    expect(matchesFilter(CATEGORY_COL, "RAT", { kind: "category", values: [] })).toBe(true);
    expect(matchesFilter(CATEGORY_COL, null, { kind: "category", values: [] })).toBe(true);
  });

  it("null value fails when filter has active values", () => {
    expect(matchesFilter(CATEGORY_COL, null, f)).toBe(false);
  });

  it("includes vs excludes by exact String() equality", () => {
    expect(matchesFilter(CATEGORY_COL, "RAT", f)).toBe(true);
    expect(matchesFilter(CATEGORY_COL, "MONKEY", f)).toBe(false);
  });

  it("coerces numeric value to string", () => {
    expect(matchesFilter(CATEGORY_COL, 1, { kind: "category", values: ["1"] })).toBe(true);
    expect(matchesFilter(CATEGORY_COL, 1, { kind: "category", values: ["2"] })).toBe(false);
  });
});

describe("matchesFilter — text", () => {
  it("empty / whitespace query passes everything (including null)", () => {
    expect(matchesFilter(TEXT_COL, null, { kind: "text", query: "" })).toBe(true);
    expect(matchesFilter(TEXT_COL, null, { kind: "text", query: "   " })).toBe(true);
    expect(matchesFilter(TEXT_COL, "anything", { kind: "text", query: "" })).toBe(true);
  });

  it("null value fails when query is non-empty", () => {
    expect(matchesFilter(TEXT_COL, null, { kind: "text", query: "foo" })).toBe(false);
  });

  it("case-insensitive substring match", () => {
    expect(matchesFilter(TEXT_COL, "PointCross", { kind: "text", query: "cross" })).toBe(true);
    expect(matchesFilter(TEXT_COL, "PointCross", { kind: "text", query: "CROSS" })).toBe(true);
    expect(matchesFilter(TEXT_COL, "PointCross", { kind: "text", query: "xyz" })).toBe(false);
  });
});

describe("matchesFilter — number", () => {
  it("null value passes when both bounds null; fails otherwise", () => {
    expect(matchesFilter(NUMBER_COL, null, { kind: "number", min: null, max: null })).toBe(true);
    expect(matchesFilter(NUMBER_COL, null, { kind: "number", min: 0, max: null })).toBe(false);
    expect(matchesFilter(NUMBER_COL, null, { kind: "number", min: null, max: 0 })).toBe(false);
  });

  it("non-numeric string fails both bounds", () => {
    expect(matchesFilter(NUMBER_COL, "abc", { kind: "number", min: 0, max: 100 })).toBe(false);
  });

  it("inclusive min/max bounds", () => {
    expect(matchesFilter(NUMBER_COL, 10, { kind: "number", min: 10, max: 100 })).toBe(true);
    expect(matchesFilter(NUMBER_COL, 100, { kind: "number", min: 10, max: 100 })).toBe(true);
    expect(matchesFilter(NUMBER_COL, 9, { kind: "number", min: 10, max: 100 })).toBe(false);
    expect(matchesFilter(NUMBER_COL, 101, { kind: "number", min: 10, max: 100 })).toBe(false);
  });

  it("numeric string values are coerced", () => {
    expect(matchesFilter(NUMBER_COL, "42", { kind: "number", min: 10, max: 100 })).toBe(true);
  });
});

describe("matchesFilter — date", () => {
  it("null value passes when both bounds null; fails otherwise", () => {
    expect(matchesFilter(DATE_COL, null, { kind: "date", from: null, to: null })).toBe(true);
    expect(matchesFilter(DATE_COL, null, { kind: "date", from: "2020-01-01", to: null })).toBe(false);
  });

  it("ISO lexicographic comparison matches chronological order", () => {
    const f: ColumnFilter = { kind: "date", from: "2020-01-01", to: "2020-12-31" };
    expect(matchesFilter(DATE_COL, "2020-01-01", f)).toBe(true); // inclusive
    expect(matchesFilter(DATE_COL, "2020-06-15", f)).toBe(true);
    expect(matchesFilter(DATE_COL, "2020-12-31", f)).toBe(true); // inclusive
    expect(matchesFilter(DATE_COL, "2019-12-31", f)).toBe(false);
    expect(matchesFilter(DATE_COL, "2021-01-01", f)).toBe(false);
  });

  it("ISO with time component still compares correctly", () => {
    const f: ColumnFilter = { kind: "date", from: "2020-01-01", to: "2020-12-31" };
    expect(matchesFilter(DATE_COL, "2020-06-15T00:00:00", f)).toBe(true);
  });
});

describe("compareValues", () => {
  it("both null → 0", () => {
    expect(compareValues(null, null, "asc")).toBe(0);
    expect(compareValues(null, null, "desc")).toBe(0);
  });

  it("nulls always sort to the bottom — ignoring direction", () => {
    expect(compareValues(null, 5, "asc")).toBeGreaterThan(0);
    expect(compareValues(null, 5, "desc")).toBeGreaterThan(0);
    expect(compareValues(5, null, "asc")).toBeLessThan(0);
    expect(compareValues(5, null, "desc")).toBeLessThan(0);
  });

  it("numbers compared numerically", () => {
    expect(compareValues(2, 10, "asc")).toBeLessThan(0);
    expect(compareValues(2, 10, "desc")).toBeGreaterThan(0);
  });

  it("strings compared via localeCompare with numeric option (natural sort)", () => {
    // Natural sort: "study-2" < "study-10"
    expect(compareValues("study-2", "study-10", "asc")).toBeLessThan(0);
    expect(compareValues("study-10", "study-2", "asc")).toBeGreaterThan(0);
  });

  it("mixed types compared as strings", () => {
    expect(compareValues(10, "abc", "asc")).toBeLessThan(0);
    expect(compareValues("abc", 10, "asc")).toBeGreaterThan(0);
  });

  it("desc reverses the sign", () => {
    expect(compareValues(1, 2, "asc")).toBeLessThan(0);
    expect(compareValues(1, 2, "desc")).toBeGreaterThan(0);
  });
});
