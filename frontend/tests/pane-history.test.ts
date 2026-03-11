/**
 * Pane history — back/forward navigation state machine tests.
 *
 * The usePaneHistory hook manages a linear history stack with push, back,
 * forward, and forward-truncation. We test the core state transitions
 * extracted from the hook without React rendering.
 */
import { describe, it, expect } from "vitest";

// ── State machine mirroring usePaneHistory ──

interface HistoryState<T> {
  stack: T[];
  index: number;
}

function empty<T>(): HistoryState<T> {
  return { stack: [], index: -1 };
}

/** Mirrors the useEffect push logic: push if not duplicate of current position. */
function push<T>(
  state: HistoryState<T>,
  value: T,
  toKey: (v: T) => string = JSON.stringify,
): HistoryState<T> {
  const currentKey = toKey(value);
  // Skip if same as current position
  if (
    state.stack.length > 0 &&
    state.index >= 0 &&
    toKey(state.stack[state.index]) === currentKey
  ) {
    return state;
  }
  // Truncate forward history and push
  const newStack = [...state.stack.slice(0, state.index + 1), value];
  return { stack: newStack, index: newStack.length - 1 };
}

/** Mirrors goBack: decrement index, return target for onNavigate. */
function goBack<T>(
  state: HistoryState<T>,
): { state: HistoryState<T>; target: T | null } {
  if (state.index <= 0) return { state, target: null };
  const newIndex = state.index - 1;
  return {
    state: { ...state, index: newIndex },
    target: state.stack[newIndex],
  };
}

/** Mirrors goForward: increment index, return target for onNavigate. */
function goForward<T>(
  state: HistoryState<T>,
): { state: HistoryState<T>; target: T | null } {
  if (state.index >= state.stack.length - 1) return { state, target: null };
  const newIndex = state.index + 1;
  return {
    state: { ...state, index: newIndex },
    target: state.stack[newIndex],
  };
}

function canGoBack<T>(state: HistoryState<T>): boolean {
  return state.index > 0;
}

function canGoForward<T>(state: HistoryState<T>): boolean {
  return state.index < state.stack.length - 1;
}

// ── Tests ──

describe("pane history state machine", () => {
  describe("push", () => {
    it("adds first item to empty history", () => {
      const s = push(empty<string>(), "A");
      expect(s.stack).toEqual(["A"]);
      expect(s.index).toBe(0);
    });

    it("appends consecutive distinct items", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "B");
      s = push(s, "C");
      expect(s.stack).toEqual(["A", "B", "C"]);
      expect(s.index).toBe(2);
    });

    it("deduplicates consecutive identical pushes", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "A");
      s = push(s, "A");
      expect(s.stack).toEqual(["A"]);
      expect(s.index).toBe(0);
    });

    it("allows non-consecutive duplicates", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "B");
      s = push(s, "A");
      expect(s.stack).toEqual(["A", "B", "A"]);
      expect(s.index).toBe(2);
    });

    it("uses custom toKey for equality", () => {
      const toKey = (v: { id: number; label: string }) => String(v.id);
      let s = empty<{ id: number; label: string }>();
      s = push(s, { id: 1, label: "first" }, toKey);
      // Same id, different label — should be deduplicated
      s = push(s, { id: 1, label: "second" }, toKey);
      expect(s.stack).toHaveLength(1);
      expect(s.stack[0].label).toBe("first");
    });
  });

  describe("back/forward navigation", () => {
    it("cannot go back from empty history", () => {
      const result = goBack(empty<string>());
      expect(result.target).toBeNull();
    });

    it("cannot go back from single-item history", () => {
      const s = push(empty<string>(), "A");
      expect(canGoBack(s)).toBe(false);
      const result = goBack(s);
      expect(result.target).toBeNull();
    });

    it("goes back through history", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "B");
      s = push(s, "C");

      expect(canGoBack(s)).toBe(true);
      const r1 = goBack(s);
      expect(r1.target).toBe("B");
      s = r1.state;

      expect(canGoBack(s)).toBe(true);
      const r2 = goBack(s);
      expect(r2.target).toBe("A");
      s = r2.state;

      expect(canGoBack(s)).toBe(false);
    });

    it("goes forward after going back", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "B");
      s = push(s, "C");

      // Go back twice
      s = goBack(s).state;
      s = goBack(s).state;
      expect(s.index).toBe(0);

      // Go forward
      expect(canGoForward(s)).toBe(true);
      const r1 = goForward(s);
      expect(r1.target).toBe("B");
      s = r1.state;

      const r2 = goForward(s);
      expect(r2.target).toBe("C");
      s = r2.state;

      expect(canGoForward(s)).toBe(false);
    });

    it("cannot go forward from latest position", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "B");
      expect(canGoForward(s)).toBe(false);
      const result = goForward(s);
      expect(result.target).toBeNull();
    });
  });

  describe("forward truncation", () => {
    it("truncates forward history when pushing after going back", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "B");
      s = push(s, "C");

      // Go back to A
      s = goBack(s).state;
      s = goBack(s).state;
      expect(s.index).toBe(0);

      // Push new item D — should truncate B and C
      s = push(s, "D");
      expect(s.stack).toEqual(["A", "D"]);
      expect(s.index).toBe(1);
      expect(canGoForward(s)).toBe(false);
    });

    it("truncates forward history when pushing from middle", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "B");
      s = push(s, "C");
      s = push(s, "D");

      // Go back to B
      s = goBack(s).state;
      s = goBack(s).state;
      expect(s.index).toBe(1);
      expect(s.stack[s.index]).toBe("B");

      // Push E — should truncate C and D
      s = push(s, "E");
      expect(s.stack).toEqual(["A", "B", "E"]);
      expect(s.index).toBe(2);
    });
  });

  describe("complex navigation sequences", () => {
    it("handles back → push → back → forward correctly", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "B");
      s = push(s, "C");

      // Back to B
      s = goBack(s).state;
      expect(s.stack[s.index]).toBe("B");

      // Push D (truncates C)
      s = push(s, "D");
      expect(s.stack).toEqual(["A", "B", "D"]);

      // Back to B
      s = goBack(s).state;
      expect(s.stack[s.index]).toBe("B");

      // Forward to D
      const r = goForward(s);
      expect(r.target).toBe("D");
      s = r.state;
      expect(canGoForward(s)).toBe(false);
    });

    it("push after back does not affect history before current position", () => {
      let s = empty<string>();
      s = push(s, "A");
      s = push(s, "B");
      s = push(s, "C");
      s = push(s, "D");
      s = push(s, "E");

      // Go back 3 times to B
      s = goBack(s).state;
      s = goBack(s).state;
      s = goBack(s).state;
      expect(s.stack[s.index]).toBe("B");

      // Push X — A and B preserved, C/D/E truncated
      s = push(s, "X");
      expect(s.stack).toEqual(["A", "B", "X"]);
    });
  });

  describe("FindingsContextPanel nav entry types (realistic)", () => {
    type NavEntry =
      | { type: "finding"; id: string }
      | { type: "organ"; key: string }
      | { type: "syndrome"; key: string };

    const toKey = (e: NavEntry) =>
      e.type === "finding" ? `f:${e.id}` : `${e.type}:${e.key}`;

    it("tracks finding → organ → syndrome → back → back", () => {
      let s = empty<NavEntry>();
      s = push(s, { type: "finding", id: "F001" }, toKey);
      s = push(s, { type: "organ", key: "Liver" }, toKey);
      s = push(s, { type: "syndrome", key: "XS01" }, toKey);

      expect(s.stack).toHaveLength(3);

      // Back to organ
      const r1 = goBack(s);
      expect(r1.target).toEqual({ type: "organ", key: "Liver" });
      s = r1.state;

      // Back to finding
      const r2 = goBack(s);
      expect(r2.target).toEqual({ type: "finding", id: "F001" });
      s = r2.state;

      expect(canGoBack(s)).toBe(false);
      expect(canGoForward(s)).toBe(true);
    });

    it("deduplicates by key, not object identity", () => {
      let s = empty<NavEntry>();
      s = push(s, { type: "finding", id: "F001" }, toKey);
      // Same finding id, new object — should deduplicate
      s = push(s, { type: "finding", id: "F001" }, toKey);
      expect(s.stack).toHaveLength(1);
    });
  });
});
