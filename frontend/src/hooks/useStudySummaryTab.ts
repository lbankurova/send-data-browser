import { useEffect, useCallback } from "react";
import { useSessionState } from "./useSessionState";

type StudySummaryTab = "details" | "insights";

const TAB_CHANGE_EVENT = "pcc:studySummaryTabChange";
const SESSION_KEY = "pcc.studySummary.tab";

/**
 * Cross-component tab sync for StudySummaryView ↔ ContextPanel.
 * Both components use the same sessionStorage key; changes propagate
 * via a custom DOM event so both React trees re-render immediately.
 */
export function useStudySummaryTab(initialTab?: StudySummaryTab) {
  const [tab, setTabRaw] = useSessionState<StudySummaryTab>(
    SESSION_KEY,
    initialTab ?? "details",
  );

  // Dispatch event when tab changes so the other component picks it up
  const setTab = useCallback(
    (newTab: StudySummaryTab) => {
      setTabRaw(newTab);
      window.dispatchEvent(
        new CustomEvent(TAB_CHANGE_EVENT, { detail: newTab }),
      );
    },
    [setTabRaw],
  );

  // Listen for changes from the other component
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<StudySummaryTab>).detail;
      setTabRaw(detail);
    };
    window.addEventListener(TAB_CHANGE_EVENT, handler);
    return () => window.removeEventListener(TAB_CHANGE_EVENT, handler);
  }, [setTabRaw]);

  return [tab, setTab] as const;
}
