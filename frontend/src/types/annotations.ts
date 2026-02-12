export interface ValidationIssue {
  status: "Not reviewed" | "In progress" | "Resolved" | "Exception" | "Won't fix";
  assignedTo: string;
  resolution: "" | "Fixed in source" | "Auto-fixed" | "Documented exception" | "Not applicable";
  disposition: "" | "Accept all" | "Needs fix" | "Partial fix" | "Not applicable";
  comment: string;
  reviewedBy: string;
  reviewedDate: string;
}

export interface ValidationRecordReview {
  fixStatus: "Not fixed" | "Auto-fixed" | "Manually fixed" | "Accepted as-is" | "Flagged";
  reviewStatus: "Not reviewed" | "Reviewed" | "Approved";
  assignedTo: string;
  justification: string;
  comment: string;
  pathologist: string;
  reviewDate: string;
  /** @deprecated Use pathologist */
  reviewedBy?: string;
  /** @deprecated Use reviewDate */
  reviewedDate?: string;
}

export interface ToxFinding {
  treatmentRelated: "Yes" | "No" | "Equivocal" | "Not Evaluated";
  adversity: "Adverse" | "Non-Adverse/Adaptive" | "Not Determined";
  comment: string;
  reviewedBy: string;
  reviewedDate: string;
  /** System-suggested value at time of expert review (for audit trail) */
  systemSuggestedTreatment?: "Yes" | "No" | null;
  systemSuggestedAdversity?: "Adverse" | "Non-Adverse/Adaptive" | null;
}

/** System suggestion derived from signal analysis data. */
export interface ToxSystemSuggestion {
  treatmentRelated: "Yes" | "No" | null;
  adversity: "Adverse" | "Non-Adverse/Adaptive" | null;
  basis: string;
}

/** Derive a system suggestion from signal data fields. */
export function deriveToxSuggestion(
  treatmentRelated: boolean,
  severity: "adverse" | "warning" | "normal",
): ToxSystemSuggestion {
  return {
    treatmentRelated: treatmentRelated ? "Yes" : "No",
    adversity:
      severity === "adverse"
        ? "Adverse"
        : severity === "warning"
          ? "Non-Adverse/Adaptive"
          : null,
    basis: `Signal analysis: treatment_related=${treatmentRelated}, severity=${severity}`,
  };
}

/** Expert-configured thresholds for signal scoring (TRUST-01p2). */
export interface ThresholdConfig {
  signalScoreWeights: {
    pValue: number;
    trend: number;
    effectSize: number;
    pattern: number;
  };
  patternScores: Record<string, number>;
  pValueSignificance: number;
  largeEffect: number;
  moderateEffect: number;
  targetOrganEvidence: number;
  targetOrganSignificant: number;
  noaelPenalties: {
    singleEndpoint: number;
    sexInconsistency: number;
    pathologyDisagreement: number;
    largeEffectNonSig: number;
  };
  modifiedBy: string;
  modifiedDate: string;
}

/** Per-rule override for validation rule customization (TRUST-05p2). */
export interface ValidationRuleOverride {
  enabled: boolean;
  severityOverride: "Error" | "Warning" | "Info" | null;
  comment: string;
  modifiedBy: string;
  modifiedDate: string;
}

export interface PathologyReview {
  peerReviewStatus: "Not Reviewed" | "Agreed" | "Disagreed" | "Deferred";
  revisedSeverity: "Minimal" | "Mild" | "Moderate" | "Marked" | "Severe" | "N/A";
  revisedDiagnosis: string;
  comment: string;
  pathologist: string;
  reviewDate: string;
}
