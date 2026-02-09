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
}

export const ANALYSIS_VIEWS: AnalysisView[] = [
  { key: "study-summary", label: "Study Summary", implemented: true },
  { key: "dose-response", label: "Dose-Response", implemented: true },
  { key: "target-organs", label: "Target organs & systems", implemented: true },
  { key: "histopathology", label: "Histopathology review", implemented: true },
  { key: "noael-decision", label: "NOAEL & decision", implemented: true },
  { key: "clinical-observations", label: "Clinical observations", implemented: true },
  { key: "validation", label: "Validation", implemented: true },
];
