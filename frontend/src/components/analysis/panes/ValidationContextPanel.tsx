import { useMemo } from "react";
import { CollapsiblePane } from "./CollapsiblePane";
import { cn } from "@/lib/utils";

interface ValidationSelection {
  rule_id: string;
  severity: "Error" | "Warning" | "Info";
  domain: string;
  category: string;
  description: string;
  records_affected: number;
}

interface Props {
  selection: ValidationSelection | null;
}

interface RuleDetail {
  standard: string;
  section: string;
  rationale: string;
  howToFix: string;
  affectedRecords: string[];
}

const RULE_DETAILS: Record<string, RuleDetail> = {
  SD1002: {
    standard: "SENDIG v3.1.1",
    section: "Section 4.1 — Demographics (DM)",
    rationale:
      "RFSTDTC is required for all subjects to establish the reference start date for relative timing of all study events.",
    howToFix:
      "Populate RFSTDTC with the date of first exposure (EXSTDTC) for each subject missing this value.",
    affectedRecords: [
      "USUBJID: PC-001-0042, DM row 42",
      "USUBJID: PC-001-0087, DM row 87",
      "USUBJID: PC-001-0103, DM row 103",
    ],
  },
  SD1019: {
    standard: "SENDIG v3.1.1",
    section: "Section 4.3 — Exposure (EX)",
    rationale:
      "EXROUTE must use CDISC Controlled Terminology (CT) for Route of Administration. Non-standard values prevent cross-study comparison.",
    howToFix:
      "Map 'ORAL GAVAGE' to the CDISC CT code C38288 ('ORAL GAVAGE'). Verify the value exactly matches CT including case.",
    affectedRecords: [
      "All EX records (48 rows) — EXROUTE value mismatch",
      "Expected: 'ORAL GAVAGE' (CDISC CT C38288)",
    ],
  },
  SD0064: {
    standard: "SENDIG v3.1.1",
    section: "Section 6.1 — Body Weights (BW)",
    rationale:
      "A >20% decrease in body weight between consecutive visits is a significant clinical finding that should be documented with a corresponding Clinical Observation (CL) record.",
    howToFix:
      "Review the flagged subjects and add CL records if clinically relevant observations were made, or add a comment explaining the weight loss.",
    affectedRecords: [
      "USUBJID: PC-001-0023, BW Day 14→21 (−22.3%)",
      "USUBJID: PC-001-0056, BW Day 21→28 (−20.8%)",
    ],
  },
  SD1035: {
    standard: "SENDIG v3.1.1",
    section: "Section 6.4 — Microscopic Findings (MI)",
    rationale:
      "MISTRESC should use standardized result terms from CDISC Controlled Terminology to ensure consistent interpretation across studies.",
    howToFix:
      "Map each non-standard MISTRESC value to the closest CDISC CT term. Retain original verbatim text in MIORRES.",
    affectedRecords: [
      "MISTRESC='Hepatocellular hypertrophy, centrilobular' (4 records)",
      "MISTRESC='Tubular basophilia' (5 records)",
      "MISTRESC='Inflammatory cell infiltrate, mixed' (3 records)",
    ],
  },
  SD0083: {
    standard: "SENDIG v3.1.1",
    section: "Section 6.3 — Laboratory Test Results (LB)",
    rationale:
      "Lab values significantly outside expected physiological range may indicate data entry errors or require clinical review.",
    howToFix:
      "Verify source data for flagged ALT values. If correct, no action needed — values will be captured as-is with a note in the study report.",
    affectedRecords: [
      "USUBJID: PC-001-0012, Day 28, ALT=487 U/L (expected <200)",
      "USUBJID: PC-001-0012, Day 29, ALT=523 U/L",
      "USUBJID: PC-001-0034, Day 28, ALT=412 U/L",
      "USUBJID: PC-001-0034, Day 29, ALT=398 U/L",
      "USUBJID: PC-001-0089, Day 28, ALT=445 U/L",
    ],
  },
  SD0021: {
    standard: "SENDIG v3.1.1",
    section: "Section 3.1 — Trial Summary (TS)",
    rationale:
      "Using controlled terminology for SDESIGN improves machine readability and cross-study querying.",
    howToFix:
      "Replace free text TSVAL with the corresponding CDISC CT term (e.g., 'PARALLEL' for parallel group designs).",
    affectedRecords: [
      "TS row: TSPARMCD=SDESIGN, TSVAL='Parallel dose group design'",
    ],
  },
  SD0045: {
    standard: "SENDIG v3.1.1",
    section: "Section 3.2 — Trial Arms (TA)",
    rationale:
      "Mismatch between defined trial arms and actual dose groups may indicate an incomplete TA definition or unused arm.",
    howToFix:
      "Review TA domain and confirm all defined arms correspond to actual treatment groups in EX. Remove or annotate unused arms.",
    affectedRecords: [
      "TA defines: Vehicle, Low, Mid, High (4 arms)",
      "EX contains: Vehicle, Low, High (3 groups)",
    ],
  },
  SD0092: {
    standard: "SENDIG v3.1.1",
    section: "Section 8.4 — Supplemental Qualifiers",
    rationale:
      "When a standard variable exists for the data, it should be used instead of a supplemental qualifier to improve data accessibility.",
    howToFix:
      "Move MISEV values from SUPPMI (QNAM='MISEV') to the MI domain --SEV variable. Remove the corresponding SUPPMI records.",
    affectedRecords: [
      "SUPPMI: 24 records with QNAM='MISEV'",
      "Target: MI.MISEV standard variable",
    ],
  },
};

const SEVERITY_BORDER: Record<string, string> = {
  Error: "border-l-red-500",
  Warning: "border-l-amber-500",
  Info: "border-l-blue-500",
};

export function ValidationContextPanel({ selection }: Props) {
  const detail = useMemo(
    () => (selection ? RULE_DETAILS[selection.rule_id] ?? null : null),
    [selection]
  );

  if (!selection) {
    return (
      <div>
        <CollapsiblePane title="Overview" defaultOpen>
          <div className="space-y-2 text-[11px]">
            <p className="text-muted-foreground">
              SEND compliance validation checks the dataset against CDISC SENDIG
              implementation rules and controlled terminology requirements.
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#dc2626" }}
                />
                <span>
                  <strong>Error</strong> — Must fix before submission
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#d97706" }}
                />
                <span>
                  <strong>Warning</strong> — Review recommended
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#2563eb" }}
                />
                <span>
                  <strong>Info</strong> — Best practice suggestion
                </span>
              </div>
            </div>
          </div>
        </CollapsiblePane>
        <div className="px-4 py-2 text-xs text-muted-foreground">
          Select a rule to view details and affected records.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">
            {selection.rule_id}
          </span>
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
              selection.severity === "Error" && "border-red-200 bg-red-100 text-red-800",
              selection.severity === "Warning" && "border-amber-200 bg-amber-100 text-amber-800",
              selection.severity === "Info" && "border-blue-200 bg-blue-100 text-blue-800"
            )}
          >
            {selection.severity}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {selection.domain} &middot; {selection.category}
        </p>
      </div>

      {/* Rule detail */}
      <CollapsiblePane title="Rule Detail" defaultOpen>
        {detail ? (
          <div className="space-y-2 text-[11px]">
            <div>
              <span className="font-medium text-muted-foreground">
                Standard:{" "}
              </span>
              <span>{detail.standard}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">
                Section:{" "}
              </span>
              <span>{detail.section}</span>
            </div>
            <div
              className={cn(
                "border-l-2 pl-2",
                SEVERITY_BORDER[selection.severity]
              )}
            >
              {selection.description}
            </div>
            <div>
              <span className="font-medium text-muted-foreground">
                Rationale:{" "}
              </span>
              <span>{detail.rationale}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">
                How to fix:{" "}
              </span>
              <span>{detail.howToFix}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No detail available for this rule.
          </p>
        )}
      </CollapsiblePane>

      {/* Affected records */}
      <CollapsiblePane title="Affected Records" defaultOpen>
        {detail && detail.affectedRecords.length > 0 ? (
          <div className="space-y-1">
            {detail.affectedRecords.map((rec, i) => (
              <div
                key={i}
                className="rounded bg-muted/50 px-2 py-1 font-mono text-[10px] leading-snug"
              >
                {rec}
              </div>
            ))}
            <p className="mt-1 text-[10px] text-muted-foreground">
              {selection.records_affected} record(s) affected total
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No record examples available.
          </p>
        )}
      </CollapsiblePane>
    </div>
  );
}
