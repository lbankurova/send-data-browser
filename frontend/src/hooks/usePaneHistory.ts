import { useState, useCallback, useRef, useEffect } from "react";

interface PaneHistoryState<T> {
  stack: T[];
  index: number;
}

/**
 * Tracks selection history for context panel back/forward navigation.
 *
 * @param current  The current selection value (null = nothing selected)
 * @param onNavigate  Called when user clicks back/forward — caller should
 *                    update selection state with the returned target
 * @param toKey  Converts a selection to a string key for equality comparison.
 *               Defaults to JSON.stringify.
 */
export function usePaneHistory<T>(
  current: T | null,
  onNavigate: (target: T) => void,
  toKey?: (value: T) => string,
) {
  const [state, setState] = useState<PaneHistoryState<T>>({
    stack: [],
    index: -1,
  });
  const navigatingRef = useRef(false);
  const keyFn = toKey ?? ((v: T) => JSON.stringify(v));

  // Push to history when selection changes (skip if navigating via back/forward)
  useEffect(() => {
    if (current == null) return;
    if (navigatingRef.current) {
      navigatingRef.current = false;
      return;
    }

    const currentKey = keyFn(current);
    setState((prev) => {
      // Skip if same as current position
      if (
        prev.stack.length > 0 &&
        prev.index >= 0 &&
        keyFn(prev.stack[prev.index]) === currentKey
      ) {
        return prev;
      }
      // Truncate forward history and push
      const newStack = [...prev.stack.slice(0, prev.index + 1), current];
      return { stack: newStack, index: newStack.length - 1 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current == null ? "__null__" : keyFn(current)]);

  const canGoBack = state.index > 0;
  const canGoForward = state.index < state.stack.length - 1;

  const goBack = useCallback(() => {
    setState((prev) => {
      if (prev.index <= 0) return prev;
      const newIndex = prev.index - 1;
      navigatingRef.current = true;
      onNavigate(prev.stack[newIndex]);
      return { ...prev, index: newIndex };
    });
  }, [onNavigate]);

  const goForward = useCallback(() => {
    setState((prev) => {
      if (prev.index >= prev.stack.length - 1) return prev;
      const newIndex = prev.index + 1;
      navigatingRef.current = true;
      onNavigate(prev.stack[newIndex]);
      return { ...prev, index: newIndex };
    });
  }, [onNavigate]);

  return { canGoBack, canGoForward, goBack, goForward };
}
