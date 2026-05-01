import { describe, it, expect } from "vitest";
import type { SortingState } from "@tanstack/react-table";
import {
  prettifyId,
  getColumnHeaderLabel,
  shouldShowSortPriority,
  reorderSort,
  moveSortByOffset,
  filterAddableColumns,
} from "@/lib/sort-helpers";

describe("prettifyId", () => {
  it("replaces underscores with spaces", () => {
    expect(prettifyId("max_effect_size")).toBe("Max Effect Size");
  });
  it("title-cases words", () => {
    expect(prettifyId("min_p_adj")).toBe("Min P Adj");
  });
  it("preserves single words", () => {
    expect(prettifyId("severity")).toBe("Severity");
  });
  it("handles empty string", () => {
    expect(prettifyId("")).toBe("");
  });
});

describe("getColumnHeaderLabel", () => {
  it("returns string headers verbatim", () => {
    expect(getColumnHeaderLabel("Severity", "severity")).toBe("Severity");
  });
  it("falls back to prettified id when header is a function", () => {
    const headerFn = () => null;
    expect(getColumnHeaderLabel(headerFn, "max_effect_size")).toBe("Max Effect Size");
  });
  it("falls back when header is undefined", () => {
    expect(getColumnHeaderLabel(undefined, "loo_stability")).toBe("Loo Stability");
  });
  it("falls back when header is empty string", () => {
    expect(getColumnHeaderLabel("", "min_p_adj")).toBe("Min P Adj");
  });
});

describe("shouldShowSortPriority", () => {
  it("hides badge when only one column is sorted", () => {
    expect(shouldShowSortPriority(1, 0)).toBe(false);
  });
  it("shows badge when 2+ columns are sorted", () => {
    expect(shouldShowSortPriority(2, 0)).toBe(true);
    expect(shouldShowSortPriority(3, 1)).toBe(true);
  });
  it("hides badge when column is unsorted (sortIndex = -1)", () => {
    expect(shouldShowSortPriority(2, -1)).toBe(false);
  });
  it("hides badge when no sorts active", () => {
    expect(shouldShowSortPriority(0, -1)).toBe(false);
  });
});

describe("reorderSort", () => {
  const base: SortingState = [
    { id: "a", desc: false },
    { id: "b", desc: true },
    { id: "c", desc: false },
  ];

  it("is a no-op when from === to", () => {
    expect(reorderSort(base, "a", "a")).toBe(base);
  });
  it("moves first to last", () => {
    expect(reorderSort(base, "a", "c")).toEqual([
      { id: "b", desc: true },
      { id: "c", desc: false },
      { id: "a", desc: false },
    ]);
  });
  it("moves last to first", () => {
    expect(reorderSort(base, "c", "a")).toEqual([
      { id: "c", desc: false },
      { id: "a", desc: false },
      { id: "b", desc: true },
    ]);
  });
  it("preserves direction when reordering", () => {
    const result = reorderSort(base, "b", "a");
    expect(result[0]).toEqual({ id: "b", desc: true });
  });
  it("returns input when fromId is missing", () => {
    expect(reorderSort(base, "missing", "a")).toBe(base);
  });
  it("returns input when toId is missing", () => {
    expect(reorderSort(base, "a", "missing")).toBe(base);
  });
});

describe("moveSortByOffset", () => {
  const base: SortingState = [
    { id: "a", desc: false },
    { id: "b", desc: true },
    { id: "c", desc: false },
  ];

  it("moves up by one", () => {
    expect(moveSortByOffset(base, "b", -1)).toEqual([
      { id: "b", desc: true },
      { id: "a", desc: false },
      { id: "c", desc: false },
    ]);
  });
  it("moves down by one", () => {
    expect(moveSortByOffset(base, "b", 1)).toEqual([
      { id: "a", desc: false },
      { id: "c", desc: false },
      { id: "b", desc: true },
    ]);
  });
  it("clamps at start (no-op when first moved up)", () => {
    expect(moveSortByOffset(base, "a", -1)).toBe(base);
  });
  it("clamps at end (no-op when last moved down)", () => {
    expect(moveSortByOffset(base, "c", 1)).toBe(base);
  });
  it("returns input when id is missing", () => {
    expect(moveSortByOffset(base, "missing", 1)).toBe(base);
  });
});

describe("filterAddableColumns", () => {
  const cols = [
    { id: "severity", label: "Severity" },
    { id: "max_effect_size", label: "Max Effect Size" },
    { id: "min_p_adj", label: "Min P Adj" },
    { id: "domain", label: "Domain" },
  ];

  it("returns all when query is empty", () => {
    expect(filterAddableColumns(cols, "")).toEqual(cols);
  });
  it("returns all when query is whitespace", () => {
    expect(filterAddableColumns(cols, "   ")).toEqual(cols);
  });
  it("matches case-insensitively on label", () => {
    expect(filterAddableColumns(cols, "severity")).toEqual([
      { id: "severity", label: "Severity" },
    ]);
    expect(filterAddableColumns(cols, "EFFECT")).toEqual([
      { id: "max_effect_size", label: "Max Effect Size" },
    ]);
  });
  it("matches on raw id when label does not match", () => {
    expect(filterAddableColumns(cols, "p_adj")).toEqual([
      { id: "min_p_adj", label: "Min P Adj" },
    ]);
  });
  it("returns empty when no match", () => {
    expect(filterAddableColumns(cols, "zzznotfound")).toEqual([]);
  });
});
