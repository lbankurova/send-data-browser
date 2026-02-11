export interface AnalysisType {
  key: string;
  label: string;
  icon: string;
  implemented: boolean;
}

export const ANALYSIS_TYPES: AnalysisType[] = [
  { key: "adverse-effects", label: "Adverse effects", icon: "AlertTriangle", implemented: true },
  { key: "noael", label: "NOAEL", icon: "Target", implemented: false },
  { key: "target-organs", label: "Target organs", icon: "Crosshair", implemented: false },
  { key: "validation", label: "Validation", icon: "CheckCircle", implemented: false },
  { key: "sex-differences", label: "Sex differences", icon: "Users", implemented: false },
  { key: "reversibility", label: "Reversibility", icon: "RotateCcw", implemented: false },
];

export interface AnalysisView {
  key: string;
  label: string;
  implemented: boolean;
  /** Optional group key — views sharing the same group render under a collapsible folder */
  group?: string;
}

/** Group metadata for collapsible folders in the tree */
export interface AnalysisViewGroup {
  key: string;
  label: string;
}

export const ANALYSIS_VIEW_GROUPS: AnalysisViewGroup[] = [
  { key: "findings", label: "Findings" },
];

export const ANALYSIS_VIEWS: AnalysisView[] = [
  { key: "study-summary", label: "Study Summary", implemented: true },
  { key: "findings-overview", label: "All findings", implemented: true, group: "findings" },
  { key: "signal-heatmap", label: "Signal heatmap", implemented: true, group: "findings" },
  { key: "findings-dashboard", label: "Findings dashboard", implemented: true, group: "findings" },
  { key: "adverse-effects", label: "Adverse effects", implemented: true, group: "findings" },
  { key: "dose-response", label: "Dose-Response", implemented: true },
  { key: "target-organs", label: "Target organs & systems", implemented: true },
  { key: "histopathology", label: "Histopathology review", implemented: true },
  { key: "noael-decision", label: "NOAEL & decision", implemented: true },
  { key: "validation", label: "Validation", implemented: true },
];
