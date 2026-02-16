import { useState, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { PolymorphicRail } from "./PolymorphicRail";
import { FindingsRail } from "@/components/analysis/findings/FindingsRail";
import { getAERailCallback } from "@/components/analysis/findings/AdverseEffectsView";
import type { GroupingMode } from "@/lib/findings-rail-engine";

/**
 * Shell-level rail panel. Renders PolymorphicRail by default,
 * or FindingsRail when on findings-aware views (Adverse Effects).
 * Only renders when inside a study route (studyId present).
 */
export function ShellRailPanel() {
  const { studyId, domainName } = useParams<{ studyId: string; domainName: string }>();
  const { width, onPointerDown } = useResizePanel(300, 180, 500, "left", "pcc.layout.railWidth");
  const { pathname } = useLocation();

  // Rail-driven scope state (owned here, synced to AE view via callback)
  const [groupScope, setGroupScope] = useState<{ type: GroupingMode; value: string } | null>(null);
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);

  const handleGroupScopeChange = useCallback((scope: { type: GroupingMode; value: string } | null) => {
    setGroupScope(scope);
    setActiveEndpoint(null);
    getAERailCallback()?.({ activeGroupScope: scope, activeEndpoint: null });
  }, []);

  const handleEndpointSelect = useCallback((endpointLabel: string | null) => {
    setActiveEndpoint(endpointLabel);
    getAERailCallback()?.({ activeEndpoint: endpointLabel });
  }, []);

  // Don't render on landing page, non-study routes, or domain browser
  if (!studyId || domainName) return null;

  const isAEView = pathname.includes("/adverse-effects");

  return (
    <>
      <div
        className="shrink-0 overflow-hidden border-r"
        style={{ width }}
      >
        {isAEView ? (
          <FindingsRail
            studyId={studyId}
            activeGroupScope={groupScope}
            activeEndpoint={activeEndpoint}
            onGroupScopeChange={handleGroupScopeChange}
            onEndpointSelect={handleEndpointSelect}
          />
        ) : (
          <PolymorphicRail />
        )}
      </div>
      <PanelResizeHandle onPointerDown={onPointerDown} />
    </>
  );
}
