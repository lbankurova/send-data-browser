import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { PolymorphicRail } from "./PolymorphicRail";
import { FindingsRail } from "@/components/analysis/findings/FindingsRail";
import { getAERailCallback } from "@/components/analysis/findings/AdverseEffectsView";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import type { GroupingMode } from "@/lib/findings-rail-engine";

/**
 * Shell-level rail panel. Renders PolymorphicRail by default,
 * or FindingsRail when on findings-aware views (Adverse Effects, Dose-Response).
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
  const isAEView = pathname.includes("/adverse-effects");
  const isDRView = pathname.includes("/dose-response");
  const isFindingsView = isAEView || isDRView;

  // Reset rail-driven state on study change
  const prevStudyRef = useRef(studyId);
  useEffect(() => {
    if (studyId !== prevStudyRef.current) {
      prevStudyRef.current = studyId;
      setGroupScope(null);
      setActiveEndpoint(null);
      getAERailCallback()?.({ activeGroupScope: null, activeEndpoint: null, activeGrouping: "organ" });
    }
  }, [studyId]);

  // ── View-aware handlers ──

  const handleGroupScopeChange = useCallback((scope: { type: GroupingMode; value: string } | null) => {
    setGroupScope(scope);
    setActiveEndpoint(null);
    if (isAEView) {
      getAERailCallback()?.({ activeGroupScope: scope, activeEndpoint: null });
    } else if (isDRView) {
      // Organ grouping → set organSystem, cascade clears endpoint, D-R auto-selects
      if (scope && scope.type === "organ") {
        navigateTo({ organSystem: scope.value });
      } else if (!scope) {
        // Cleared scope → clear organSystem
        navigateTo({ organSystem: undefined });
      }
      // Domain/pattern grouping: visual-only, no StudySelectionContext update
    }
  }, [isAEView, isDRView, navigateTo]);

  const handleEndpointSelect = useCallback((endpointLabel: string | null) => {
    setActiveEndpoint(endpointLabel);
    if (isAEView) {
      getAERailCallback()?.({ activeEndpoint: endpointLabel });
    } else if (isDRView) {
      if (endpointLabel) {
        navigateTo({ endpoint: endpointLabel });
      }
    }
  }, [isAEView, isDRView, navigateTo]);

  const handleGroupingChange = useCallback((mode: GroupingMode) => {
    if (isAEView) {
      getAERailCallback()?.({ activeGrouping: mode });
    } else if (isDRView) {
      // Switching grouping mode clears organ scope
      navigateTo({ organSystem: undefined });
    }
  }, [isAEView, isDRView, navigateTo]);

  // ── Bidirectional sync: table/context → rail highlight ──

  // AE sync: FindingSelectionContext
  const { selectedFinding } = useFindingSelection();
  const prevEndpointRef = useRef(activeEndpoint);
  useEffect(() => {
    prevEndpointRef.current = activeEndpoint;
  }, [activeEndpoint]);

  // AE path: table row click updates FindingSelectionContext → sync to rail
  useEffect(() => {
    if (!isAEView) return;
    const newEndpoint = selectedFinding?.endpoint_label ?? null;
    if (newEndpoint !== prevEndpointRef.current) {
      setActiveEndpoint(newEndpoint);
    }
  }, [selectedFinding, isAEView]);

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
          />
        ) : (
          <PolymorphicRail />
        )}
      </div>
      <PanelResizeHandle onPointerDown={onPointerDown} />
    </>
  );
}
