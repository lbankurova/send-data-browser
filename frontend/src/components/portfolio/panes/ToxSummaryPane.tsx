import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";
import {
  targetOrgans,
  noael,
  loael,
  hasTargetOrganDiscrepancy,
  hasNoaelDiscrepancy,
  hasLoaelDiscrepancy,
} from "@/lib/study-accessors";
import { AlertCircle } from "lucide-react";

interface Props {
  study: StudyMetadata;
  showDerivedOnly?: boolean;
}

export function ToxSummaryPane({ study, showDerivedOnly = false }: Props) {
  const organs = targetOrgans(study);
  const resolvedNoael = noael(study);
  const resolvedLoael = loael(study);
  const hasOrganDisc = hasTargetOrganDiscrepancy(study);
  const hasNoaelDisc = hasNoaelDiscrepancy(study);
  const hasLoaelDisc = hasLoaelDiscrepancy(study);

  if (organs.length === 0 && !resolvedNoael && !resolvedLoael) {
    return null;
  }

  return (
    <CollapsiblePane title="Tox Summary" defaultOpen>
      <div className="space-y-3">
        {/* Target Organs */}
        {organs.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-medium text-muted-foreground">
              Target organs
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {organs.map((organ) => (
                <span
                  key={organ}
                  style={{ color: "#D47A62" }}
                  className="text-xs font-medium"
                >
                  {organ}
                </span>
              ))}
              {showDerivedOnly && study.target_organs_derived && !study.target_organs_reported && (
                <span className="text-[9px] text-muted-foreground">(derived from data)</span>
              )}
            </div>
            {hasOrganDisc && (
              <div className="mt-1 flex items-start gap-1 text-[10px] text-amber-700">
                <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                <span>Discrepancy between report and data — see Delta section</span>
              </div>
            )}
          </div>
        )}

        {/* NOAEL / LOAEL Boxes */}
        {(resolvedNoael || resolvedLoael) && (
          <div className="flex gap-2">
            {/* NOAEL Box */}
            {resolvedNoael && (
              <div
                className="flex-1 rounded p-2"
                style={{ backgroundColor: "#8CD4A2" }}
              >
                <div className="text-[10px] font-medium text-gray-700">NOAEL</div>
                <div className="text-sm font-bold text-gray-900">
                  {resolvedNoael.dose} {resolvedNoael.unit}
                </div>
                <div className="mt-1 text-[10px] italic leading-tight text-gray-600">
                  {resolvedNoael.basisOrMethod}
                </div>
                {hasNoaelDisc && study.noael_derived && (
                  <div className="mt-1 text-[9px] font-semibold text-amber-800">
                    ✓ Reported (derived: {study.noael_derived.dose})
                  </div>
                )}
              </div>
            )}

            {/* LOAEL Box */}
            {resolvedLoael && (
              <div
                className="flex-1 rounded p-2"
                style={{ backgroundColor: "#E8D47C" }}
              >
                <div className="text-[10px] font-medium text-gray-700">LOAEL</div>
                <div className="text-sm font-bold text-gray-900">
                  {resolvedLoael.dose} {resolvedLoael.unit}
                </div>
                {hasLoaelDisc && study.loael_derived && (
                  <div className="mt-1 text-[9px] font-semibold text-amber-800">
                    ✓ Reported (derived: {study.loael_derived.dose})
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </CollapsiblePane>
  );
}
