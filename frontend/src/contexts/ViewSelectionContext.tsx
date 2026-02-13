import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

// ─── Per-view selection shapes ────────────────────────────────

export interface DoseResponseViewSelection {
  _view: "dose-response";
  endpoint_label: string;
  sex?: string;
  domain?: string;
  organ_system?: string;
}

export interface TargetOrgansViewSelection {
  _view: "target-organs";
  organ_system: string;
  endpoint_label?: string;
  sex?: string;
}

export interface HistopathologyViewSelection {
  _view: "histopathology";
  specimen: string;
  finding?: string;
  sex?: string;
}

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

export interface FindingsOverviewViewSelection {
  _view: "findings-overview";
  endpoint_label: string;
  organ_system: string;
  sex?: string;
  domain?: string;
}

export interface SignalHeatmapViewSelection {
  _view: "signal-heatmap";
  endpoint_label: string;
  dose_label: string;
}

export interface FindingsDashboardViewSelection {
  _view: "findings-dashboard";
}

export type ViewSelection =
  | DoseResponseViewSelection
  | TargetOrgansViewSelection
  | HistopathologyViewSelection
  | NoaelViewSelection
  | ValidationViewSelection
  | FindingsOverviewViewSelection
  | SignalHeatmapViewSelection
  | FindingsDashboardViewSelection;

// ─── Context ──────────────────────────────────────────────────

interface ViewSelectionState {
  selection: ViewSelection | null;
  setSelection: (sel: ViewSelection | null) => void;
  selectedSubject: string | null;
  setSelectedSubject: (usubjid: string | null) => void;
}

const ViewSelectionContext = createContext<ViewSelectionState>({
  selection: null,
  setSelection: () => {},
  selectedSubject: null,
  setSelectedSubject: () => {},
});

export function ViewSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionRaw] = useState<ViewSelection | null>(null);
  const [selectedSubject, setSelectedSubjectRaw] = useState<string | null>(null);
  const setSelection = useCallback((sel: ViewSelection | null) => setSelectionRaw(sel), []);
  const setSelectedSubject = useCallback((usubjid: string | null) => setSelectedSubjectRaw(usubjid), []);

  return (
    <ViewSelectionContext.Provider value={{ selection, setSelection, selectedSubject, setSelectedSubject }}>
      {children}
    </ViewSelectionContext.Provider>
  );
}

export function useViewSelection() {
  return useContext(ViewSelectionContext);
}
