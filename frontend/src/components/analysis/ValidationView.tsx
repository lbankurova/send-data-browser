import { useState, useMemo, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { useAnnotations } from "@/hooks/useAnnotations";
import type { ValidationRecordReview } from "@/types/annotations";

// ── Types ──────────────────────────────────────────────────────────────

export interface ValidationRule {
  rule_id: string;
  severity: "Error" | "Warning" | "Info";
  domain: string;
  category: string;
  description: string;
  records_affected: number;
}

// Category-specific evidence for Finding section rendering
export type RecordEvidence =
  | { type: "value-correction"; from: string; to: string }
  | { type: "value-correction-multi"; from: string; candidates: string[] }
  | { type: "code-mapping"; value: string; code: string }
  | { type: "range-check"; lines: { label: string; value: string }[] }
  | { type: "missing-value"; variable: string; derivation?: string; suggested?: string }
  | { type: "metadata"; lines: { label: string; value: string }[] };

export interface AffectedRecord {
  issue_id: string;
  rule_id: string;
  subject_id: string;
  visit: string;
  domain: string;
  variable: string;
  actual_value: string;
  expected_value: string;
  fixTier: 1 | 2 | 3;
  autoFixed: boolean;
  suggestions?: string[];
  scriptKey?: string;
  evidence?: RecordEvidence;
  diagnosis: string;
}

export interface RuleDetail {
  standard: string;
  section: string;
  rationale: string;
  howToFix: string;
}

export interface FixScript {
  name: string;
  description: string;
  applicableRules: string[];
  mockPreview: { subject: string; field: string; from: string; to: string }[];
}

// ── Hardcoded Data ─────────────────────────────────────────────────────

export const HARDCODED_RULES: ValidationRule[] = [
  {
    rule_id: "SD1002",
    severity: "Error",
    domain: "DM",
    category: "Required Variable",
    description: "RFSTDTC (Reference Start Date) is missing for 3 subjects in DM domain",
    records_affected: 3,
  },
  {
    rule_id: "SD1019",
    severity: "Error",
    domain: "EX",
    category: "Controlled Terminology",
    description: "EXROUTE contains non-standard value 'ORAL GAVAGE' — expected 'ORAL GAVAGE' per CDISC CT",
    records_affected: 48,
  },
  {
    rule_id: "SD0064",
    severity: "Warning",
    domain: "BW",
    category: "Data Consistency",
    description: "Body weight decrease >20% between consecutive visits for 2 subjects without corresponding CL record",
    records_affected: 2,
  },
  {
    rule_id: "SD1035",
    severity: "Warning",
    domain: "MI",
    category: "Controlled Terminology",
    description: "MISTRESC values not mapped to SEND controlled terminology for 12 microscopic findings",
    records_affected: 12,
  },
  {
    rule_id: "SD0083",
    severity: "Warning",
    domain: "LB",
    category: "Range Check",
    description: "LBSTRESN values outside expected physiological range for ALT in 5 records",
    records_affected: 5,
  },
  {
    rule_id: "SD0021",
    severity: "Info",
    domain: "TS",
    category: "Metadata",
    description: "TSVAL for SDESIGN (Study Design) uses free text — consider using controlled terminology",
    records_affected: 1,
  },
  {
    rule_id: "SD0045",
    severity: "Info",
    domain: "TA",
    category: "Metadata",
    description: "Trial Arms domain has 4 arms defined but only 3 dose groups found in EX domain",
    records_affected: 1,
  },
  {
    rule_id: "SD0092",
    severity: "Info",
    domain: "SUPPMI",
    category: "Supplemental",
    description: "SUPP qualifier QNAM='MISEV' could be represented using standard --SEV variable in MI",
    records_affected: 24,
  },
];

export const RULE_DETAILS: Record<string, RuleDetail> = {
  SD1002: {
    standard: "SENDIG v3.1.1",
    section: "Section 4.1 — Demographics (DM)",
    rationale: "RFSTDTC is required for all subjects to establish the reference start date for relative timing of all study events.",
    howToFix: "Populate RFSTDTC with the date of first exposure (EXSTDTC) for each subject missing this value.",
  },
  SD1019: {
    standard: "SENDIG v3.1.1",
    section: "Section 4.3 — Exposure (EX)",
    rationale: "EXROUTE must use CDISC Controlled Terminology (CT) for Route of Administration. Non-standard values prevent cross-study comparison.",
    howToFix: "Map 'ORAL GAVAGE' to the CDISC CT code C38288 ('ORAL GAVAGE'). Verify the value exactly matches CT including case.",
  },
  SD0064: {
    standard: "SENDIG v3.1.1",
    section: "Section 6.1 — Body Weights (BW)",
    rationale: "A >20% decrease in body weight between consecutive visits is a significant clinical finding that should be documented with a corresponding Clinical Observation (CL) record.",
    howToFix: "Review the flagged subjects and add CL records if clinically relevant observations were made, or add a comment explaining the weight loss.",
  },
  SD1035: {
    standard: "SENDIG v3.1.1",
    section: "Section 6.4 — Microscopic Findings (MI)",
    rationale: "MISTRESC should use standardized result terms from CDISC Controlled Terminology to ensure consistent interpretation across studies.",
    howToFix: "Map each non-standard MISTRESC value to the closest CDISC CT term. Retain original verbatim text in MIORRES.",
  },
  SD0083: {
    standard: "SENDIG v3.1.1",
    section: "Section 6.3 — Laboratory Test Results (LB)",
    rationale: "Lab values significantly outside expected physiological range may indicate data entry errors or require clinical review.",
    howToFix: "Verify source data for flagged ALT values. If correct, no action needed — values will be captured as-is with a note in the study report.",
  },
  SD0021: {
    standard: "SENDIG v3.1.1",
    section: "Section 3.1 — Trial Summary (TS)",
    rationale: "Using controlled terminology for SDESIGN improves machine readability and cross-study querying.",
    howToFix: "Replace free text TSVAL with the corresponding CDISC CT term (e.g., 'PARALLEL' for parallel group designs).",
  },
  SD0045: {
    standard: "SENDIG v3.1.1",
    section: "Section 3.2 — Trial Arms (TA)",
    rationale: "Mismatch between defined trial arms and actual dose groups may indicate an incomplete TA definition or unused arm.",
    howToFix: "Review TA domain and confirm all defined arms correspond to actual treatment groups in EX. Remove or annotate unused arms.",
  },
  SD0092: {
    standard: "SENDIG v3.1.1",
    section: "Section 8.4 — Supplemental Qualifiers",
    rationale: "When a standard variable exists for the data, it should be used instead of a supplemental qualifier to improve data accessibility.",
    howToFix: "Move MISEV values from SUPPMI (QNAM='MISEV') to the MI domain --SEV variable. Remove the corresponding SUPPMI records.",
  },
};

export const AFFECTED_RECORDS: Record<string, AffectedRecord[]> = {
  SD1002: [
    { issue_id: "SD1002-001", rule_id: "SD1002", subject_id: "PC-001-0042", visit: "--", domain: "DM", variable: "RFSTDTC", actual_value: "(missing)", expected_value: "Date of first exposure", fixTier: 3, autoFixed: false, scriptKey: "derive-rfstdtc", diagnosis: "RFSTDTC is empty. Required per SENDIG v3.1.1.", evidence: { type: "missing-value", variable: "RFSTDTC", derivation: "Derivable from first exposure date (EXSTDTC).", suggested: "2016-01-15" } },
    { issue_id: "SD1002-002", rule_id: "SD1002", subject_id: "PC-001-0087", visit: "--", domain: "DM", variable: "RFSTDTC", actual_value: "(missing)", expected_value: "Date of first exposure", fixTier: 3, autoFixed: false, scriptKey: "derive-rfstdtc", diagnosis: "RFSTDTC is empty. Required per SENDIG v3.1.1.", evidence: { type: "missing-value", variable: "RFSTDTC", derivation: "Derivable from first exposure date (EXSTDTC).", suggested: "2016-01-15" } },
    { issue_id: "SD1002-003", rule_id: "SD1002", subject_id: "PC-001-0103", visit: "--", domain: "DM", variable: "RFSTDTC", actual_value: "(missing)", expected_value: "Date of first exposure", fixTier: 3, autoFixed: false, scriptKey: "derive-rfstdtc", diagnosis: "RFSTDTC is empty. Required per SENDIG v3.1.1.", evidence: { type: "missing-value", variable: "RFSTDTC", derivation: "Derivable from first exposure date (EXSTDTC).", suggested: "2016-01-22" } },
  ],
  SD1019: [
    { issue_id: "SD1019-001", rule_id: "SD1019", subject_id: "PC-001-0001", visit: "Day 1", domain: "EX", variable: "EXROUTE", actual_value: "ORAL GAVAGE", expected_value: "ORAL GAVAGE (C38288)", fixTier: 2, autoFixed: true, suggestions: ["ORAL GAVAGE (C38288)"], diagnosis: "EXROUTE mapped to CDISC controlled terminology code.", evidence: { type: "code-mapping", value: "ORAL GAVAGE", code: "C38288" } },
    { issue_id: "SD1019-002", rule_id: "SD1019", subject_id: "PC-001-0002", visit: "Day 1", domain: "EX", variable: "EXROUTE", actual_value: "ORAL GAVAGE", expected_value: "ORAL GAVAGE (C38288)", fixTier: 2, autoFixed: true, suggestions: ["ORAL GAVAGE (C38288)"], diagnosis: "EXROUTE mapped to CDISC controlled terminology code.", evidence: { type: "code-mapping", value: "ORAL GAVAGE", code: "C38288" } },
    { issue_id: "SD1019-003", rule_id: "SD1019", subject_id: "PC-001-0003", visit: "Day 1", domain: "EX", variable: "EXROUTE", actual_value: "ORAL GAVAGE", expected_value: "ORAL GAVAGE (C38288)", fixTier: 2, autoFixed: true, suggestions: ["ORAL GAVAGE (C38288)"], diagnosis: "EXROUTE mapped to CDISC controlled terminology code.", evidence: { type: "code-mapping", value: "ORAL GAVAGE", code: "C38288" } },
    { issue_id: "SD1019-004", rule_id: "SD1019", subject_id: "PC-001-0004", visit: "Day 1", domain: "EX", variable: "EXROUTE", actual_value: "ORAL GAVAGE", expected_value: "ORAL GAVAGE (C38288)", fixTier: 2, autoFixed: true, suggestions: ["ORAL GAVAGE (C38288)"], diagnosis: "EXROUTE mapped to CDISC controlled terminology code.", evidence: { type: "code-mapping", value: "ORAL GAVAGE", code: "C38288" } },
    { issue_id: "SD1019-005", rule_id: "SD1019", subject_id: "PC-001-0005", visit: "Day 7", domain: "EX", variable: "EXROUTE", actual_value: "ORAL GAVAGE", expected_value: "ORAL GAVAGE (C38288)", fixTier: 2, autoFixed: true, suggestions: ["ORAL GAVAGE (C38288)"], diagnosis: "EXROUTE mapped to CDISC controlled terminology code.", evidence: { type: "code-mapping", value: "ORAL GAVAGE", code: "C38288" } },
    { issue_id: "SD1019-006", rule_id: "SD1019", subject_id: "PC-001-0006", visit: "Day 7", domain: "EX", variable: "EXROUTE", actual_value: "ORAL GAVAGE", expected_value: "ORAL GAVAGE (C38288)", fixTier: 2, autoFixed: true, suggestions: ["ORAL GAVAGE (C38288)"], diagnosis: "EXROUTE mapped to CDISC controlled terminology code.", evidence: { type: "code-mapping", value: "ORAL GAVAGE", code: "C38288" } },
  ],
  SD0064: [
    { issue_id: "SD0064-001", rule_id: "SD0064", subject_id: "PC-001-0023", visit: "Day 14→21", domain: "BW", variable: "BWSTRESN", actual_value: "−22.3% decrease", expected_value: "≤20% change", fixTier: 3, autoFixed: false, scriptKey: "generate-cl-records", diagnosis: "Body weight decrease >20% between consecutive visits.", evidence: { type: "range-check", lines: [{ label: "Day 14", value: "245.3 g" }, { label: "Day 21", value: "190.6 g (\u221222.3%)" }] } },
    { issue_id: "SD0064-002", rule_id: "SD0064", subject_id: "PC-001-0056", visit: "Day 21→28", domain: "BW", variable: "BWSTRESN", actual_value: "−20.8% decrease", expected_value: "≤20% change", fixTier: 3, autoFixed: false, scriptKey: "generate-cl-records", diagnosis: "Body weight decrease >20% between consecutive visits.", evidence: { type: "range-check", lines: [{ label: "Day 21", value: "232.1 g" }, { label: "Day 28", value: "183.8 g (\u221220.8%)" }] } },
  ],
  SD1035: [
    // 4 auto-fixed (obvious CT mapping — word reorder)
    { issue_id: "SD1035-001", rule_id: "SD1035", subject_id: "PC-001-0011", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Hepatocellular hypertrophy, centrilobular", expected_value: "Hypertrophy, hepatocellular, centrilobular", fixTier: 2, autoFixed: true, suggestions: ["Hypertrophy, hepatocellular, centrilobular"], diagnosis: "MISTRESC value uses non-standard word order.", evidence: { type: "value-correction", from: "Hepatocellular hypertrophy, centrilobular", to: "Hypertrophy, hepatocellular, centrilobular" } },
    { issue_id: "SD1035-002", rule_id: "SD1035", subject_id: "PC-001-0015", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Hepatocellular hypertrophy, centrilobular", expected_value: "Hypertrophy, hepatocellular, centrilobular", fixTier: 2, autoFixed: true, suggestions: ["Hypertrophy, hepatocellular, centrilobular"], diagnosis: "MISTRESC value uses non-standard word order.", evidence: { type: "value-correction", from: "Hepatocellular hypertrophy, centrilobular", to: "Hypertrophy, hepatocellular, centrilobular" } },
    { issue_id: "SD1035-003", rule_id: "SD1035", subject_id: "PC-001-0022", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Hepatocellular hypertrophy, centrilobular", expected_value: "Hypertrophy, hepatocellular, centrilobular", fixTier: 2, autoFixed: true, suggestions: ["Hypertrophy, hepatocellular, centrilobular"], diagnosis: "MISTRESC value uses non-standard word order.", evidence: { type: "value-correction", from: "Hepatocellular hypertrophy, centrilobular", to: "Hypertrophy, hepatocellular, centrilobular" } },
    { issue_id: "SD1035-004", rule_id: "SD1035", subject_id: "PC-001-0031", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Hepatocellular hypertrophy, centrilobular", expected_value: "Hypertrophy, hepatocellular, centrilobular", fixTier: 2, autoFixed: true, suggestions: ["Hypertrophy, hepatocellular, centrilobular"], diagnosis: "MISTRESC value uses non-standard word order.", evidence: { type: "value-correction", from: "Hepatocellular hypertrophy, centrilobular", to: "Hypertrophy, hepatocellular, centrilobular" } },
    // 5 not auto-fixed (multiple candidates)
    { issue_id: "SD1035-005", rule_id: "SD1035", subject_id: "PC-001-0018", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Tubular basophilia", expected_value: "Basophilia, tubular", fixTier: 2, autoFixed: false, suggestions: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"], diagnosis: "MISTRESC value does not match SEND controlled terminology.", evidence: { type: "value-correction-multi", from: "Tubular basophilia", candidates: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"] } },
    { issue_id: "SD1035-006", rule_id: "SD1035", subject_id: "PC-001-0025", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Tubular basophilia", expected_value: "Basophilia, tubular", fixTier: 2, autoFixed: false, suggestions: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"], diagnosis: "MISTRESC value does not match SEND controlled terminology.", evidence: { type: "value-correction-multi", from: "Tubular basophilia", candidates: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"] } },
    { issue_id: "SD1035-007", rule_id: "SD1035", subject_id: "PC-001-0033", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Tubular basophilia", expected_value: "Basophilia, tubular", fixTier: 2, autoFixed: false, suggestions: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"], diagnosis: "MISTRESC value does not match SEND controlled terminology.", evidence: { type: "value-correction-multi", from: "Tubular basophilia", candidates: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"] } },
    { issue_id: "SD1035-008", rule_id: "SD1035", subject_id: "PC-001-0041", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Tubular basophilia", expected_value: "Basophilia, tubular", fixTier: 2, autoFixed: false, suggestions: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"], diagnosis: "MISTRESC value does not match SEND controlled terminology.", evidence: { type: "value-correction-multi", from: "Tubular basophilia", candidates: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"] } },
    { issue_id: "SD1035-009", rule_id: "SD1035", subject_id: "PC-001-0048", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Tubular basophilia", expected_value: "Basophilia, tubular", fixTier: 2, autoFixed: false, suggestions: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"], diagnosis: "MISTRESC value does not match SEND controlled terminology.", evidence: { type: "value-correction-multi", from: "Tubular basophilia", candidates: ["Basophilia, tubular", "Basophilia, renal tubular", "Tubular basophilia, NOS"] } },
    // 3 not auto-fixed (multiple candidates)
    { issue_id: "SD1035-010", rule_id: "SD1035", subject_id: "PC-001-0052", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Inflammatory cell infiltrate, mixed", expected_value: "Infiltrate, inflammatory cell, mixed", fixTier: 2, autoFixed: false, suggestions: ["Infiltrate, inflammatory cell, mixed", "Infiltrate, mixed cell", "Inflammation, mixed cell"], diagnosis: "MISTRESC value does not match SEND controlled terminology.", evidence: { type: "value-correction-multi", from: "Inflammatory cell infiltrate, mixed", candidates: ["Infiltrate, inflammatory cell, mixed", "Infiltrate, mixed cell", "Inflammation, mixed cell"] } },
    { issue_id: "SD1035-011", rule_id: "SD1035", subject_id: "PC-001-0061", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Inflammatory cell infiltrate, mixed", expected_value: "Infiltrate, inflammatory cell, mixed", fixTier: 2, autoFixed: false, suggestions: ["Infiltrate, inflammatory cell, mixed", "Infiltrate, mixed cell", "Inflammation, mixed cell"], diagnosis: "MISTRESC value does not match SEND controlled terminology.", evidence: { type: "value-correction-multi", from: "Inflammatory cell infiltrate, mixed", candidates: ["Infiltrate, inflammatory cell, mixed", "Infiltrate, mixed cell", "Inflammation, mixed cell"] } },
    { issue_id: "SD1035-012", rule_id: "SD1035", subject_id: "PC-001-0072", visit: "Day 29", domain: "MI", variable: "MISTRESC", actual_value: "Inflammatory cell infiltrate, mixed", expected_value: "Infiltrate, inflammatory cell, mixed", fixTier: 2, autoFixed: false, suggestions: ["Infiltrate, inflammatory cell, mixed", "Infiltrate, mixed cell", "Inflammation, mixed cell"], diagnosis: "MISTRESC value does not match SEND controlled terminology.", evidence: { type: "value-correction-multi", from: "Inflammatory cell infiltrate, mixed", candidates: ["Infiltrate, inflammatory cell, mixed", "Infiltrate, mixed cell", "Inflammation, mixed cell"] } },
  ],
  SD0083: [
    { issue_id: "SD0083-001", rule_id: "SD0083", subject_id: "PC-001-0012", visit: "Day 28", domain: "LB", variable: "LBSTRESN", actual_value: "487 U/L", expected_value: "<200 U/L", fixTier: 1, autoFixed: false, diagnosis: "LBSTRESN outside expected physiological range for ALT.", evidence: { type: "range-check", lines: [{ label: "Value", value: "487 U/L" }, { label: "Reference range", value: "20\u2013200 U/L" }] } },
    { issue_id: "SD0083-002", rule_id: "SD0083", subject_id: "PC-001-0012", visit: "Day 29", domain: "LB", variable: "LBSTRESN", actual_value: "523 U/L", expected_value: "<200 U/L", fixTier: 1, autoFixed: false, diagnosis: "LBSTRESN outside expected physiological range for ALT.", evidence: { type: "range-check", lines: [{ label: "Value", value: "523 U/L" }, { label: "Reference range", value: "20\u2013200 U/L" }] } },
    { issue_id: "SD0083-003", rule_id: "SD0083", subject_id: "PC-001-0034", visit: "Day 28", domain: "LB", variable: "LBSTRESN", actual_value: "412 U/L", expected_value: "<200 U/L", fixTier: 1, autoFixed: false, diagnosis: "LBSTRESN outside expected physiological range for ALT.", evidence: { type: "range-check", lines: [{ label: "Value", value: "412 U/L" }, { label: "Reference range", value: "20\u2013200 U/L" }] } },
    { issue_id: "SD0083-004", rule_id: "SD0083", subject_id: "PC-001-0034", visit: "Day 29", domain: "LB", variable: "LBSTRESN", actual_value: "398 U/L", expected_value: "<200 U/L", fixTier: 1, autoFixed: false, diagnosis: "LBSTRESN outside expected physiological range for ALT.", evidence: { type: "range-check", lines: [{ label: "Value", value: "398 U/L" }, { label: "Reference range", value: "20\u2013200 U/L" }] } },
    { issue_id: "SD0083-005", rule_id: "SD0083", subject_id: "PC-001-0089", visit: "Day 28", domain: "LB", variable: "LBSTRESN", actual_value: "445 U/L", expected_value: "<200 U/L", fixTier: 1, autoFixed: false, diagnosis: "LBSTRESN outside expected physiological range for ALT.", evidence: { type: "range-check", lines: [{ label: "Value", value: "445 U/L" }, { label: "Reference range", value: "20\u2013200 U/L" }] } },
  ],
  SD0021: [
    { issue_id: "SD0021-001", rule_id: "SD0021", subject_id: "--", visit: "--", domain: "TS", variable: "TSVAL", actual_value: "Parallel dose group design", expected_value: "PARALLEL (CT term)", fixTier: 2, autoFixed: false, suggestions: ["PARALLEL"], diagnosis: "TSVAL for SDESIGN uses free text.", evidence: { type: "metadata", lines: [{ label: "Current", value: "Parallel dose group design" }, { label: "CT term", value: "PARALLEL" }] } },
  ],
  SD0045: [
    { issue_id: "SD0045-001", rule_id: "SD0045", subject_id: "--", visit: "--", domain: "TA", variable: "ARM", actual_value: "4 arms (Vehicle, Low, Mid, High)", expected_value: "3 groups in EX (Vehicle, Low, High)", fixTier: 1, autoFixed: false, diagnosis: "Trial Arms domain has 4 arms defined\nbut only 3 dose groups found in EX domain.", evidence: { type: "metadata", lines: [{ label: "TA arms", value: "Vehicle, Low, Mid, High" }, { label: "EX groups", value: "Vehicle, Low, High" }] } },
  ],
  SD0092: [
    { issue_id: "SD0092-001", rule_id: "SD0092", subject_id: "PC-001-0011", visit: "Day 29", domain: "SUPPMI", variable: "QNAM", actual_value: "MISEV (in SUPPMI)", expected_value: "MI.MISEV (standard variable)", fixTier: 3, autoFixed: true, scriptKey: "move-suppmi-to-mi", diagnosis: "SUPP qualifier QNAM='MISEV' should use standard MI.MISEV variable.", evidence: { type: "metadata", lines: [{ label: "Current", value: "SUPPMI.QNAM = MISEV" }, { label: "Standard", value: "MI.MISEV" }] } },
    { issue_id: "SD0092-002", rule_id: "SD0092", subject_id: "PC-001-0015", visit: "Day 29", domain: "SUPPMI", variable: "QNAM", actual_value: "MISEV (in SUPPMI)", expected_value: "MI.MISEV (standard variable)", fixTier: 3, autoFixed: true, scriptKey: "move-suppmi-to-mi", diagnosis: "SUPP qualifier QNAM='MISEV' should use standard MI.MISEV variable.", evidence: { type: "metadata", lines: [{ label: "Current", value: "SUPPMI.QNAM = MISEV" }, { label: "Standard", value: "MI.MISEV" }] } },
    { issue_id: "SD0092-003", rule_id: "SD0092", subject_id: "PC-001-0022", visit: "Day 29", domain: "SUPPMI", variable: "QNAM", actual_value: "MISEV (in SUPPMI)", expected_value: "MI.MISEV (standard variable)", fixTier: 3, autoFixed: true, scriptKey: "move-suppmi-to-mi", diagnosis: "SUPP qualifier QNAM='MISEV' should use standard MI.MISEV variable.", evidence: { type: "metadata", lines: [{ label: "Current", value: "SUPPMI.QNAM = MISEV" }, { label: "Standard", value: "MI.MISEV" }] } },
    { issue_id: "SD0092-004", rule_id: "SD0092", subject_id: "PC-001-0031", visit: "Day 29", domain: "SUPPMI", variable: "QNAM", actual_value: "MISEV (in SUPPMI)", expected_value: "MI.MISEV (standard variable)", fixTier: 3, autoFixed: true, scriptKey: "move-suppmi-to-mi", diagnosis: "SUPP qualifier QNAM='MISEV' should use standard MI.MISEV variable.", evidence: { type: "metadata", lines: [{ label: "Current", value: "SUPPMI.QNAM = MISEV" }, { label: "Standard", value: "MI.MISEV" }] } },
    { issue_id: "SD0092-005", rule_id: "SD0092", subject_id: "PC-001-0041", visit: "Day 29", domain: "SUPPMI", variable: "QNAM", actual_value: "MISEV (in SUPPMI)", expected_value: "MI.MISEV (standard variable)", fixTier: 3, autoFixed: true, scriptKey: "move-suppmi-to-mi", diagnosis: "SUPP qualifier QNAM='MISEV' should use standard MI.MISEV variable.", evidence: { type: "metadata", lines: [{ label: "Current", value: "SUPPMI.QNAM = MISEV" }, { label: "Standard", value: "MI.MISEV" }] } },
    { issue_id: "SD0092-006", rule_id: "SD0092", subject_id: "PC-001-0048", visit: "Day 29", domain: "SUPPMI", variable: "QNAM", actual_value: "MISEV (in SUPPMI)", expected_value: "MI.MISEV (standard variable)", fixTier: 3, autoFixed: true, scriptKey: "move-suppmi-to-mi", diagnosis: "SUPP qualifier QNAM='MISEV' should use standard MI.MISEV variable.", evidence: { type: "metadata", lines: [{ label: "Current", value: "SUPPMI.QNAM = MISEV" }, { label: "Standard", value: "MI.MISEV" }] } },
  ],
};

// ── Fix Scripts ─────────────────────────────────────────────────────────

export const FIX_SCRIPTS: Record<string, FixScript> = {
  "derive-rfstdtc": {
    name: "Derive RFSTDTC from EX",
    description: "Derives Reference Start Date from the first exposure date (EXSTDTC) in the EX domain for each subject.",
    applicableRules: ["SD1002"],
    mockPreview: [
      { subject: "PC-001-0042", field: "RFSTDTC", from: "(missing)", to: "2016-01-15" },
      { subject: "PC-001-0087", field: "RFSTDTC", from: "(missing)", to: "2016-01-15" },
      { subject: "PC-001-0103", field: "RFSTDTC", from: "(missing)", to: "2016-01-22" },
    ],
  },
  "generate-cl-records": {
    name: "Generate CL records for weight loss events",
    description: "Creates Clinical Observation (CL) records for subjects with >20% body weight decrease, cross-referencing BW visit dates.",
    applicableRules: ["SD0064"],
    mockPreview: [
      { subject: "PC-001-0023", field: "CLTEST", from: "(no CL record)", to: "WEIGHT LOSS >20%" },
      { subject: "PC-001-0056", field: "CLTEST", from: "(no CL record)", to: "WEIGHT LOSS >20%" },
    ],
  },
  "move-suppmi-to-mi": {
    name: "Move SUPPMI qualifiers to standard variables",
    description: "Moves QNAM='MISEV' values from SUPPMI to the MI domain --SEV variable and removes corresponding SUPPMI records.",
    applicableRules: ["SD0092"],
    mockPreview: [
      { subject: "PC-001-0011", field: "MISEV", from: "SUPPMI.QVAL", to: "MI.MISEV = Minimal" },
      { subject: "PC-001-0015", field: "MISEV", from: "SUPPMI.QVAL", to: "MI.MISEV = Mild" },
    ],
  },
};

// ── Severity styles ────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  Error: "bg-red-100 text-red-800 border-red-200",
  Warning: "bg-amber-100 text-amber-800 border-amber-200",
  Info: "bg-blue-100 text-blue-800 border-blue-200",
};

// ── Fix & Review status badges ─────────────────────────────────────────

export const FIX_STATUS_STYLES: Record<string, string> = {
  "Not fixed": "bg-gray-100 text-gray-600 border-gray-200",
  "Auto-fixed": "bg-teal-100 text-teal-800 border-teal-200",
  "Manually fixed": "bg-green-100 text-green-800 border-green-200",
  "Accepted as-is": "bg-blue-100 text-blue-800 border-blue-200",
  "Flagged": "bg-orange-100 text-orange-800 border-orange-200",
};

export const REVIEW_STATUS_STYLES: Record<string, string> = {
  "Not reviewed": "bg-gray-100 text-gray-600 border-gray-200",
  "Reviewed": "bg-blue-100 text-blue-800 border-blue-200",
  "Approved": "bg-green-100 text-green-800 border-green-200",
};

export function StatusBadge({ status, styles }: { status: string; styles: Record<string, string> }) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
        styles[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
      )}
    >
      {status}
    </span>
  );
}

// ── Record row with live annotation ────────────────────────────────────

interface RecordRowData extends AffectedRecord {
  fixStatus: string;
  reviewStatus: string;
  assignedTo: string;
}

// ── Top table columns ──────────────────────────────────────────────────

const ruleColumnHelper = createColumnHelper<ValidationRule>();

const ruleColumns = [
  ruleColumnHelper.accessor("rule_id", {
    header: "Rule",
    size: 80,
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  ruleColumnHelper.accessor("severity", {
    header: "Severity",
    size: 90,
    cell: (info) => {
      const sev = info.getValue();
      return (
        <span className={cn("inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold", SEVERITY_STYLES[sev])}>
          {sev}
        </span>
      );
    },
  }),
  ruleColumnHelper.accessor("domain", {
    header: "Domain",
    size: 70,
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  ruleColumnHelper.accessor("category", {
    header: "Category",
    size: 140,
  }),
  ruleColumnHelper.accessor("description", {
    header: "Description",
    size: 400,
  }),
  ruleColumnHelper.accessor("records_affected", {
    header: "Records",
    size: 70,
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
];

// ── Bottom table columns ───────────────────────────────────────────────

const recordColumnHelper = createColumnHelper<RecordRowData>();

// ── Component ──────────────────────────────────────────────────────────

interface Props {
  studyId?: string;
  onSelectionChange?: (sel: Record<string, unknown> | null) => void;
  viewSelection?: Record<string, unknown> | null;
}

export function ValidationView({ studyId, onSelectionChange, viewSelection }: Props) {
  const [ruleSorting, setRuleSorting] = useState<SortingState>([]);
  const [recordSorting, setRecordSorting] = useState<SortingState>([]);
  const [selectedRule, setSelectedRule] = useState<ValidationRule | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [recordFilters, setRecordFilters] = useState<{ fixStatus: string; reviewStatus: string }>({ fixStatus: "", reviewStatus: "" });

  // Load record annotations
  const { data: recordAnnotations } = useAnnotations<ValidationRecordReview>(studyId, "validation-records");

  // Severity counts
  const counts = useMemo(() => {
    const errors = HARDCODED_RULES.filter((i) => i.severity === "Error").length;
    const warnings = HARDCODED_RULES.filter((i) => i.severity === "Warning").length;
    const info = HARDCODED_RULES.filter((i) => i.severity === "Info").length;
    return { errors, warnings, info };
  }, []);

  // Records for selected rule, enriched with annotation data
  const recordRows = useMemo<RecordRowData[]>(() => {
    if (!selectedRule) return [];
    const records = AFFECTED_RECORDS[selectedRule.rule_id] ?? [];
    return records.map((r) => {
      const ann = recordAnnotations?.[r.issue_id];
      return {
        ...r,
        fixStatus: ann?.fixStatus ?? (r.autoFixed ? "Auto-fixed" : "Not fixed"),
        reviewStatus: ann?.reviewStatus ?? "Not reviewed",
        assignedTo: ann?.assignedTo ?? "",
      };
    });
  }, [selectedRule, recordAnnotations]);

  // Filter records
  const filteredRecords = useMemo(() => {
    let rows = recordRows;
    if (recordFilters.fixStatus) {
      rows = rows.filter((r) => r.fixStatus === recordFilters.fixStatus);
    }
    if (recordFilters.reviewStatus) {
      rows = rows.filter((r) => r.reviewStatus === recordFilters.reviewStatus);
    }
    return rows;
  }, [recordRows, recordFilters]);

  // Record columns (defined inside component to use click handler)
  const recordColumns = useMemo(() => [
    recordColumnHelper.accessor("issue_id", {
      header: "Issue ID",
      size: 110,
      cell: (info) => (
        <button
          className="font-mono text-xs hover:underline"
          style={{ color: "#3a7bd5" }}
          onClick={(e) => {
            e.stopPropagation();
            const rec = info.row.original;
            setSelectedIssueId(rec.issue_id);
            onSelectionChange?.({
              _view: "validation",
              mode: "issue",
              rule_id: selectedRule?.rule_id,
              severity: selectedRule?.severity,
              domain: rec.domain,
              category: selectedRule?.category,
              description: selectedRule?.description,
              records_affected: selectedRule?.records_affected,
              issue_id: rec.issue_id,
              subject_id: rec.subject_id,
              visit: rec.visit,
              variable: rec.variable,
              actual_value: rec.actual_value,
              expected_value: rec.expected_value,
            });
          }}
        >
          {info.getValue()}
        </button>
      ),
    }),
    recordColumnHelper.accessor("subject_id", {
      header: "Subject",
      size: 110,
      cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
    }),
    recordColumnHelper.accessor("visit", {
      header: "Visit",
      size: 90,
    }),
    recordColumnHelper.accessor("actual_value", {
      header: "Key value",
      size: 180,
      cell: (info) => <span className="text-xs">{info.getValue()}</span>,
    }),
    recordColumnHelper.accessor("expected_value", {
      header: "Expected",
      size: 180,
      cell: (info) => <span className="text-xs text-muted-foreground">{info.getValue()}</span>,
    }),
    recordColumnHelper.accessor("fixStatus", {
      header: "Fix status",
      size: 110,
      cell: (info) => <StatusBadge status={info.getValue()} styles={FIX_STATUS_STYLES} />,
    }),
    recordColumnHelper.accessor("reviewStatus", {
      header: "Review status",
      size: 110,
      cell: (info) => <StatusBadge status={info.getValue()} styles={REVIEW_STATUS_STYLES} />,
    }),
    recordColumnHelper.accessor("assignedTo", {
      header: "Assigned to",
      size: 90,
      cell: (info) => <span className="text-xs">{info.getValue() || "—"}</span>,
    }),
  ], [selectedRule, onSelectionChange]);

  // Top table
  const ruleTable = useReactTable({
    data: HARDCODED_RULES,
    columns: ruleColumns,
    state: { sorting: ruleSorting },
    onSortingChange: setRuleSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Bottom table
  const recordTable = useReactTable({
    data: filteredRecords,
    columns: recordColumns,
    state: { sorting: recordSorting },
    onSortingChange: setRecordSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Watch for filter changes from context panel
  useEffect(() => {
    if (viewSelection?._view === "validation" && viewSelection.recordFixStatusFilter !== undefined) {
      setRecordFilters((prev) => ({
        ...prev,
        fixStatus: viewSelection.recordFixStatusFilter as string,
      }));
    }
    if (viewSelection?._view === "validation" && viewSelection.recordReviewStatusFilter !== undefined) {
      setRecordFilters((prev) => ({
        ...prev,
        reviewStatus: viewSelection.recordReviewStatusFilter as string,
      }));
    }
  }, [viewSelection?.recordFixStatusFilter, viewSelection?.recordReviewStatusFilter]);

  // Watch for mode changes from context panel (back link)
  useEffect(() => {
    if (viewSelection?._view === "validation" && viewSelection.mode === "rule") {
      setSelectedIssueId(null);
    }
    if (viewSelection?._view === "validation" && viewSelection.mode === "issue" && viewSelection.issue_id) {
      setSelectedIssueId(viewSelection.issue_id as string);
    }
  }, [viewSelection?.mode, viewSelection?.issue_id]);

  const handleRuleClick = (rule: ValidationRule) => {
    const isReselect = selectedRule?.rule_id === rule.rule_id;
    if (isReselect) {
      setSelectedRule(null);
      setSelectedIssueId(null);
      setRecordFilters({ fixStatus: "", reviewStatus: "" });
      onSelectionChange?.(null);
    } else {
      setSelectedRule(rule);
      setSelectedIssueId(null);
      setRecordFilters({ fixStatus: "", reviewStatus: "" });
      onSelectionChange?.({
        _view: "validation",
        mode: "rule",
        rule_id: rule.rule_id,
        severity: rule.severity,
        domain: rule.domain,
        category: rule.category,
        description: rule.description,
        records_affected: rule.records_affected,
      });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Summary header */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">SEND Validation</h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#dc2626" }} />
            <span className="font-medium">{counts.errors}</span>
            <span className="text-muted-foreground">errors</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#d97706" }} />
            <span className="font-medium">{counts.warnings}</span>
            <span className="text-muted-foreground">warnings</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#2563eb" }} />
            <span className="font-medium">{counts.info}</span>
            <span className="text-muted-foreground">info</span>
          </span>
        </div>
      </div>

      {/* Top table — Rule Summary (40%) */}
      <div className="flex-[4] overflow-auto border-b">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            {ruleTable.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ background: "#f8f8f8" }}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? null}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {ruleTable.getRowModel().rows.map((row) => {
              const isSelected = selectedRule?.rule_id === row.original.rule_id;
              return (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b transition-colors last:border-b-0"
                  style={{ background: isSelected ? "var(--selection-bg)" : undefined }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isSelected ? "var(--selection-bg)" : ""; }}
                  onClick={() => handleRuleClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 text-xs">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Divider bar */}
      {selectedRule && (
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
          <span className="text-xs font-medium">
            {filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""} for{" "}
            <span className="font-mono">{selectedRule.rule_id}</span>
            {" — "}
            {selectedRule.category}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {/* Fix status filter */}
            <select
              className="rounded-full border bg-background px-2.5 py-0.5 text-[10px]"
              value={recordFilters.fixStatus}
              onChange={(e) => setRecordFilters((prev) => ({ ...prev, fixStatus: e.target.value }))}
            >
              <option value="">Fix status</option>
              <option value="Not fixed">Not fixed</option>
              <option value="Auto-fixed">Auto-fixed</option>
              <option value="Manually fixed">Manually fixed</option>
              <option value="Accepted as-is">Accepted as-is</option>
              <option value="Flagged">Flagged</option>
            </select>
            {/* Review status filter */}
            <select
              className="rounded-full border bg-background px-2.5 py-0.5 text-[10px]"
              value={recordFilters.reviewStatus}
              onChange={(e) => setRecordFilters((prev) => ({ ...prev, reviewStatus: e.target.value }))}
            >
              <option value="">Review status</option>
              <option value="Not reviewed">Not reviewed</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Approved">Approved</option>
            </select>
          </div>
        </div>
      )}

      {/* Bottom table — Affected Records (60%) */}
      {selectedRule ? (
        <div className="flex-[6] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              {recordTable.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} style={{ background: "#f8f8f8" }}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="cursor-pointer select-none border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                      style={{ width: header.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? null}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {recordTable.getRowModel().rows.map((row) => {
                const isSelected = selectedIssueId === row.original.issue_id;
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b transition-colors last:border-b-0"
                    style={{ background: isSelected ? "var(--selection-bg)" : undefined }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isSelected ? "var(--selection-bg)" : ""; }}
                    onClick={() => {
                      const rec = row.original;
                      setSelectedIssueId(rec.issue_id);
                      onSelectionChange?.({
                        _view: "validation",
                        mode: "issue",
                        rule_id: selectedRule.rule_id,
                        severity: selectedRule.severity,
                        domain: rec.domain,
                        category: selectedRule.category,
                        description: selectedRule.description,
                        records_affected: selectedRule.records_affected,
                        issue_id: rec.issue_id,
                        subject_id: rec.subject_id,
                        visit: rec.visit,
                        variable: rec.variable,
                        actual_value: rec.actual_value,
                        expected_value: rec.expected_value,
                      });
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 text-xs">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={recordColumns.length} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-[6] items-center justify-center text-xs text-muted-foreground">
          Select a rule above to view affected records
        </div>
      )}
    </div>
  );
}
