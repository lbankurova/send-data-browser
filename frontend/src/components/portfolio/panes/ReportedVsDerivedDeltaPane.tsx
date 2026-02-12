import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";
import {
  hasTargetOrganDiscrepancy,
  hasNoaelDiscrepancy,
  hasLoaelDiscrepancy,
  getDerivedOnlyOrgans,
  getReportedOnlyOrgans,
} from "@/lib/study-accessors";

interface Props {
  study: StudyMetadata;
}

export function ReportedVsDerivedDeltaPane({ study }: Props) {
  const hasOrganDisc = hasTargetOrganDiscrepancy(study);
  const hasNoaelDisc = hasNoaelDiscrepancy(study);
  const hasLoaelDisc = hasLoaelDiscrepancy(study);

  // Don't show if no discrepancies
  if (!hasOrganDisc && !hasNoaelDisc && !hasLoaelDisc) {
    return null;
  }

  const derivedOnlyOrgans = getDerivedOnlyOrgans(study);
  const reportedOnlyOrgans = getReportedOnlyOrgans(study);

  return (
    <CollapsiblePane title="Reported vs Derived" defaultOpen>
      <div className="space-y-3 text-[11px]">
        {/* Target Organ Discrepancy */}
        {hasOrganDisc && (
          <div>
            <div className="font-medium">Target organs:</div>
            <div className="mt-1 space-y-0.5">
              <div>
                <span className="text-muted-foreground">Report:</span>{" "}
                {study.target_organs_reported?.join(", ") || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Data:</span>{" "}
                {study.target_organs_derived?.join(", ") || "—"}
              </div>
              {derivedOnlyOrgans.length > 0 && (
                <div className="mt-1 text-[10px] text-amber-700">
                  → Data suggests: {derivedOnlyOrgans.join(", ")}
                </div>
              )}
              {reportedOnlyOrgans.length > 0 && (
                <div className="mt-1 text-[10px] text-blue-700">
                  → Report includes: {reportedOnlyOrgans.join(", ")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* NOAEL Discrepancy */}
        {hasNoaelDisc && study.noael_reported && study.noael_derived && (
          <div>
            <div className="font-medium">NOAEL:</div>
            <div className="mt-1 space-y-0.5">
              <div>
                <span className="text-muted-foreground">Report:</span>{" "}
                {study.noael_reported.dose} {study.noael_reported.unit}
              </div>
              <div>
                <span className="text-muted-foreground">Data:</span>{" "}
                {study.noael_derived.dose} {study.noael_derived.unit} (
                {study.noael_derived.method})
              </div>
              {study.noael_derived.dose < study.noael_reported.dose && (
                <div className="mt-1 text-[10px] text-amber-700">
                  → Statistical analysis more conservative
                </div>
              )}
              {study.noael_derived.dose > study.noael_reported.dose && (
                <div className="mt-1 text-[10px] text-blue-700">
                  → Study director more conservative
                </div>
              )}
            </div>
          </div>
        )}

        {/* LOAEL Discrepancy */}
        {hasLoaelDisc && study.loael_reported && study.loael_derived && (
          <div>
            <div className="font-medium">LOAEL:</div>
            <div className="mt-1 space-y-0.5">
              <div>
                <span className="text-muted-foreground">Report:</span>{" "}
                {study.loael_reported.dose} {study.loael_reported.unit}
              </div>
              <div>
                <span className="text-muted-foreground">Data:</span>{" "}
                {study.loael_derived.dose} {study.loael_derived.unit}
              </div>
            </div>
          </div>
        )}
      </div>
    </CollapsiblePane>
  );
}
