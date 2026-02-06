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
