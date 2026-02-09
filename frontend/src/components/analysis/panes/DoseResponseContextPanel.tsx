import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { InsightsList } from "./InsightsList";
import { ToxFindingForm } from "./ToxFindingForm";
import type { RuleResult } from "@/types/analysis-views";

interface DoseResponseSelection {
  endpoint_label: string;
  sex?: string;
  domain?: string;
  organ_system?: string;
}

interface Props {
  ruleResults: RuleResult[];
  selection: DoseResponseSelection | null;
  studyId?: string;
}

export function DoseResponseContextPanel({ ruleResults, selection, studyId: studyIdProp }: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
  const navigate = useNavigate();

  // Rules for selected endpoint
  const endpointRules = useMemo(() => {
    if (!selection) return [];
    return ruleResults.filter(
      (r) =>
        r.context_key.includes(selection.domain ?? "") ||
        r.output_text.toLowerCase().includes(selection.endpoint_label.toLowerCase().slice(0, 20))
    );
  }, [ruleResults, selection]);

  if (!selection) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an endpoint from the list or chart to view insights and assessment.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{selection.endpoint_label}</h3>
        <p className="text-xs text-muted-foreground">
          {selection.domain} &middot; {selection.organ_system?.replace(/_/g, " ")}
          {selection.sex && <> &middot; {selection.sex}</>}
        </p>
      </div>

      {/* Endpoint insights */}
      <CollapsiblePane title="Insights" defaultOpen>
        <InsightsList rules={endpointRules} />
      </CollapsiblePane>

      {/* Tox Assessment */}
      {studyId && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.endpoint_label} defaultOpen />
      )}

      {/* Cross-view links */}
      <CollapsiblePane title="Related views" defaultOpen={false}>
        <div className="space-y-1 text-[11px]">
          {selection.organ_system && (
            <a
              href="#"
              className="block hover:underline"
              style={{ color: "#3a7bd5" }}
              onClick={(e) => {
                e.preventDefault();
                if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`, { state: { organ_system: selection.organ_system } });
              }}
            >
              View target organ: {selection.organ_system.replace(/_/g, " ")} &#x2192;
            </a>
          )}
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { organ_system: selection.organ_system } });
            }}
          >
            View histopathology &#x2192;
          </a>
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: selection.organ_system } });
            }}
          >
            View NOAEL decision &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}
