import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { InsightsList } from "./InsightsList";
import { TierCountBadges } from "./TierCountBadges";
import { ToxFindingForm } from "./ToxFindingForm";
import { computeTierCounts } from "@/lib/rule-synthesis";
import type { Tier } from "@/lib/rule-synthesis";
import type { RuleResult } from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DoseResponseContextPanel({
  ruleResults,
  selection,
  studyId: studyIdProp,
}: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
  const navigate = useNavigate();
  const [tierFilter, setTierFilter] = useState<Tier | null>(null);

  // Rules for selected endpoint — filter by organ system + domain prefix
  const endpointRules = useMemo(() => {
    if (!selection) return [];
    const domainPrefix = selection.domain ? selection.domain + "_" : null;
    return ruleResults.filter((r) => {
      if (selection.organ_system && r.organ_system === selection.organ_system) return true;
      if (domainPrefix && r.scope === "endpoint" && r.context_key.startsWith(domainPrefix)) return true;
      return false;
    });
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
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <h3 className="text-sm font-semibold">{selection.endpoint_label}</h3>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {selection.domain} &middot; {selection.organ_system?.replace(/_/g, " ")}
            {selection.sex && <> &middot; {selection.sex}</>}
          </p>
          <span className="text-xs">
            <TierCountBadges
              counts={computeTierCounts(endpointRules)}
              activeTier={tierFilter}
              onTierClick={setTierFilter}
            />
          </span>
        </div>

      </div>

      {/* Endpoint insights */}
      <CollapsiblePane title="Insights" defaultOpen>
        <InsightsList rules={endpointRules} tierFilter={tierFilter} />
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
