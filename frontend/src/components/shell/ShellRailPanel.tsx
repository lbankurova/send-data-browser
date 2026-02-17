import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { PolymorphicRail } from "./PolymorphicRail";
import { FindingsRail } from "@/components/analysis/findings/FindingsRail";
import type { RailVisibleState } from "@/components/analysis/findings/FindingsRail";
import { getFindingsRailCallback, setFindingsClearScopeCallback } from "@/components/analysis/findings/FindingsView";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import type { GroupingMode } from "@/lib/findings-rail-engine";

/**
 * Shell-level rail panel. Renders PolymorphicRail by default,
 * or FindingsRail when on findings-aware views (Findings, Dose-Response).
 * Only renders when inside a study route (studyId present).
 */
export function ShellRailPanel() {
  const { studyId, domainName } = useParams<{ studyId: string; domainName: string }>();
  const { width, onPointerDown } = useResizePanel(300, 180, 500, "left", "pcc.layout.railWidth");
  const { pathname } = useLocation();
  const { selection: studySelection, navigateTo } = useStudySelection();

  // Rail-driven scope state (owned here, synced to view via callback or context)
  const [groupScope, setGroupScope] = useState<{ type: GroupingMode; value: string } | null>(() => {
    if (studySelection.organSystem) {
      return { type: "organ" as GroupingMode, value: studySelection.organSystem };
    }
    return null;
  });
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(
    () => studySelection.endpoint ?? null
  );

  // Route detection
  const isFindingsRoute = pathname.includes("/findings");
  const isDRView = pathname.includes("/dose-response");
  const isFindingsView = isFindingsRoute || isDRView;

  // Reset rail-driven state on study change
  const prevStudyRef = useRef(studyId);
  useEffect(() => {
    if (studyId !== prevStudyRef.current) {
      prevStudyRef.current = studyId;
      setGroupScope(null);
      setActiveEndpoint(null);
      getFindingsRailCallback()?.({ activeEndpoint: null, activeGrouping: "organ" });
    }
  }, [studyId]);

  // Register reverse callback so view can clear rail scope
  useEffect(() => {
    setFindingsClearScopeCallback(() => {
      setGroupScope(null);
      setActiveEndpoint(null);
    });
    return () => setFindingsClearScopeCallback(null);
  }, []);

  // ── View-aware handlers ──

  const handleGroupScopeChange = useCallback((scope: { type: GroupingMode; value: string } | null) => {
    setGroupScope(scope);
    setActiveEndpoint(null);
    if (isFindingsRoute) {
      // Scope change → rail's useEffect will send new visibleEndpointLabels.
      // We just need to forward endpoint deselection.
      getFindingsRailCallback()?.({ activeEndpoint: null });
    } else if (isDRView) {
      if (scope && scope.type === "organ") {
        navigateTo({ organSystem: scope.value });
      } else if (!scope) {
        navigateTo({ organSystem: undefined });
      }
    }
  }, [isFindingsRoute, isDRView, navigateTo]);

  const handleEndpointSelect = useCallback((endpointLabel: string | null) => {
    setActiveEndpoint(endpointLabel);
    if (isFindingsRoute) {
      getFindingsRailCallback()?.({ activeEndpoint: endpointLabel });
    } else if (isDRView) {
      if (endpointLabel) {
        navigateTo({ endpoint: endpointLabel });
      }
    }
  }, [isFindingsRoute, isDRView, navigateTo]);

  const handleGroupingChange = useCallback((mode: GroupingMode) => {
    if (isFindingsRoute) {
      getFindingsRailCallback()?.({ activeGrouping: mode });
    } else if (isDRView) {
      navigateTo({ organSystem: undefined });
    }
  }, [isFindingsRoute, isDRView, navigateTo]);

  // Rail sends fully-filtered visible endpoint set → forward to view
  const handleVisibleEndpointsChange = useCallback((state: RailVisibleState) => {
    if (isFindingsRoute) {
      getFindingsRailCallback()?.({ visibleEndpoints: state });
    }
  }, [isFindingsRoute]);

  // ── Bidirectional sync: table/context → rail highlight ──

  const { selectedFinding } = useFindingSelection();
  const prevEndpointRef = useRef(activeEndpoint);
  useEffect(() => {
    prevEndpointRef.current = activeEndpoint;
  }, [activeEndpoint]);

  // Findings path: table row click updates FindingSelectionContext → sync to rail
  useEffect(() => {
    if (!isFindingsRoute) return;
    const newEndpoint = selectedFinding?.endpoint_label ?? null;
    if (newEndpoint !== prevEndpointRef.current) {
      setActiveEndpoint(newEndpoint);
    }
  }, [selectedFinding, isFindingsRoute]);

  // D-R path: StudySelectionContext.endpoint changes → sync to rail
  useEffect(() => {
    if (!isDRView) return;
    const newEndpoint = studySelection.endpoint ?? null;
    if (newEndpoint !== prevEndpointRef.current) {
      setActiveEndpoint(newEndpoint);
    }
  }, [studySelection.endpoint, isDRView]);

  // Don't render on landing page, non-study routes, or domain browser
  if (!studyId || domainName) return null;

  return (
    <>
      <div
        className="shrink-0 overflow-hidden border-r"
        style={{ width }}
      >
        {isFindingsView ? (
          <FindingsRail
            studyId={studyId}
            activeGroupScope={groupScope}
            activeEndpoint={activeEndpoint}
            onGroupScopeChange={handleGroupScopeChange}
            onEndpointSelect={handleEndpointSelect}
            onGroupingChange={handleGroupingChange}
            onVisibleEndpointsChange={handleVisibleEndpointsChange}
          />
        ) : (
          <PolymorphicRail />
        )}
      </div>
      <PanelResizeHandle onPointerDown={onPointerDown} />
    </>
  );
}
