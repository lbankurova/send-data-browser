import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

// ─── Per-view selection shapes ────────────────────────────────

export interface NoaelViewSelection {
  _view: "noael";
  endpoint_label: string;
  dose_level: number;
  sex: string;
}

export interface ValidationRuleViewSelection {
  _view: "validation";
  mode: "rule";
  rule_id: string;
  severity: "Error" | "Warning" | "Info";
  domain: string;
  category: string;
  description: string;
  records_affected: number;
  source?: "custom" | "core";
  status?: "triggered" | "clean" | "disabled";
  recordFixStatusFilter?: string;
  recordReviewStatusFilter?: string;
}

export interface ValidationIssueViewSelection {
  _view: "validation";
  mode: "issue";
  rule_id: string;
  severity: "Error" | "Warning" | "Info";
  domain: string;
  category: string;
  description: string;
  records_affected: number;
  recordFixStatusFilter?: string;
  recordReviewStatusFilter?: string;
  issue_id: string;
  subject_id?: string;
  visit?: string;
  variable?: string;
  actual_value?: string;
  expected_value?: string;
}

export type ValidationViewSelection = ValidationRuleViewSelection | ValidationIssueViewSelection;

export interface HistopathologyViewSelection {
  _view: "histopathology";
  specimen: string;
  finding?: string;
  sex?: string;
}

export type ViewSelection =
  | NoaelViewSelection
  | HistopathologyViewSelection
  | ValidationViewSelection;

// ─── Context ──────────────────────────────────────────────────

interface ViewSelectionState {
  selection: ViewSelection | null;
  setSelection: (sel: ViewSelection | null) => void;
  selectedSubject: string | null;
  setSelectedSubject: (usubjid: string | null) => void;
  pendingCompare: string[] | null;
  setPendingCompare: (ids: string[] | null) => void;
}

const ViewSelectionContext = createContext<ViewSelectionState>({
  selection: null,
  setSelection: () => {},
  selectedSubject: null,
  setSelectedSubject: () => {},
  pendingCompare: null,
  setPendingCompare: () => {},
});

export function ViewSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionRaw] = useState<ViewSelection | null>(null);
  const [selectedSubject, setSelectedSubjectRaw] = useState<string | null>(null);
  const [pendingCompare, setPendingCompareRaw] = useState<string[] | null>(null);
  const setSelection = useCallback((sel: ViewSelection | null) => {
    setSelectionRaw(sel);
    if (sel) setSelectedSubjectRaw(null); // clear subject when view selection made
  }, []);
  const setSelectedSubject = useCallback((usubjid: string | null) => {
    setSelectedSubjectRaw(usubjid);
    if (usubjid) setSelectionRaw(null); // clear view selection when subject selected
  }, []);
  const setPendingCompare = useCallback((ids: string[] | null) => setPendingCompareRaw(ids), []);

  return (
    <ViewSelectionContext.Provider value={{ selection, setSelection, selectedSubject, setSelectedSubject, pendingCompare, setPendingCompare }}>
      {children}
    </ViewSelectionContext.Provider>
  );
}

export function useViewSelection() {
  return useContext(ViewSelectionContext);
}
