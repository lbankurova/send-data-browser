import { useCallback } from "react";
import type { KeyboardEvent } from "react";

/**
 * Returns an `onKeyDown` handler that fills a text input with its placeholder
 * value when the user presses Tab while the field is empty.
 *
 * Usage:
 * ```tsx
 * const tabComplete = useTabComplete(value, setValue, "suggested default text");
 * <textarea {...tabComplete} placeholder="suggested default text" value={value} />
 * ```
 *
 * - Only fires when the current value is empty (whitespace-only counts as empty)
 * - Prevents default Tab behavior (focus move) when it fills the value
 * - No-ops when the field already has content, so normal Tab navigation works
 */
export function useTabComplete(
  value: string,
  setValue: (v: string) => void,
  fillText: string,
): { onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void } {
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Tab" && !value.trim()) {
        e.preventDefault();
        setValue(fillText);
      }
    },
    [value, setValue, fillText],
  );

  return { onKeyDown };
}
