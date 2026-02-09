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
}

export interface PathologyReview {
  peerReviewStatus: "Not Reviewed" | "Agreed" | "Disagreed" | "Deferred";
  revisedSeverity: "Minimal" | "Mild" | "Moderate" | "Marked" | "Severe" | "N/A";
  revisedDiagnosis: string;
  comment: string;
  pathologist: string;
  reviewDate: string;
}
