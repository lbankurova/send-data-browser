export interface ValidationIssue {
  status: "Not Reviewed" | "In Progress" | "Resolved" | "Exception" | "Won't Fix";
  assignedTo: string;
  resolution: "" | "Fixed in Source" | "Auto-Fixed" | "Documented Exception" | "Not Applicable";
  disposition: "" | "Accept All" | "Needs Fix" | "Partial Fix" | "Not Applicable";
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
  reviewedBy: string;
  reviewedDate: string;
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
