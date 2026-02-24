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
 */
export function useSessionState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
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
          setState((prev) => {
            const raw = JSON.stringify(prev);
            return raw === stored ? prev : (JSON.parse(stored) as T);
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
