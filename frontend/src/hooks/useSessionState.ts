import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

/**
 * Drop-in replacement for useState that persists to sessionStorage.
 * Survives view switches within a browser session; resets on new tab.
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

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // storage full or unavailable — silently ignore
    }
  }, [key, state]);

  return [state, setState];
}
