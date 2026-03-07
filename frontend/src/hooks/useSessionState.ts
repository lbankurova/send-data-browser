import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

/**
 * Custom event name used to synchronize useSessionState hooks sharing
 * the same key across different components in the same tab.
 */
const SESSION_STATE_EVENT = "pcc:session-state";

/**
 * Drop-in replacement for useState that persists to sessionStorage.
 * Survives view switches within a browser session; resets on new tab.
 *
 * Cross-component sync: when one component writes a new value, all other
 * mounted hooks sharing the same key receive the update via a custom DOM
 * event — no polling, no context provider needed.
 *
 * @param validate  Optional boundary guard. When provided, stored values
 *                  that fail validation fall back to `defaultValue`. Use
 *                  for constrained types (string-literal unions) where
 *                  stale sessionStorage values would break downstream
 *                  consumers (e.g. backend query params).
 */
export function useSessionState<T>(
  key: string,
  defaultValue: T,
  validate?: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        if (validate && !validate(parsed)) return defaultValue;
        return parsed as T;
      }
    } catch {
      // corrupted or unparseable — fall through
    }
    return defaultValue;
  });

  // Persist to sessionStorage and notify other hooks with the same key
  useEffect(() => {
    try {
      const newVal = JSON.stringify(state);
      const oldVal = sessionStorage.getItem(key);
      sessionStorage.setItem(key, newVal);
      // Only dispatch if the stored value actually changed
      if (oldVal !== newVal) {
        window.dispatchEvent(
          new CustomEvent(SESSION_STATE_EVENT, { detail: { key } }),
        );
      }
    } catch {
      // storage full or unavailable — silently ignore
    }
  }, [key, state]);

  // Listen for writes from other hooks sharing the same key
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.key !== key) return;
      try {
        const stored = sessionStorage.getItem(key);
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (validate && !validate(parsed)) return;
          setState((prev) => {
            const raw = JSON.stringify(prev);
            return raw === stored ? prev : parsed as T;
          });
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener(SESSION_STATE_EVENT, handler);
    return () => window.removeEventListener(SESSION_STATE_EVENT, handler);
  }, [key]);

  return [state, setState];
}

/**
 * Create a type guard for string-literal unions from a const array.
 * The array IS the source of truth — the TypeScript type is derived from it.
 *
 * Usage:
 *   const MODES = ["pool", "separate"] as const;
 *   type Mode = typeof MODES[number];
 *   const isMode = isOneOf(MODES);
 *   useSessionState<Mode>(key, "pool", isMode);
 */
export function isOneOf<T extends string>(
  values: readonly T[],
): (v: unknown) => v is T {
  const set = new Set<string>(values);
  return (v: unknown): v is T => typeof v === "string" && set.has(v);
}
