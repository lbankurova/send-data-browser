import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { PolymorphicRail } from "./PolymorphicRail";
import { FindingsRail } from "@/components/analysis/findings/FindingsRail";
import type { RailVisibleState } from "@/components/analysis/findings/FindingsRail";
import { getFindingsRailCallback, setFindingsClearScopeCallback, setFindingsExcludedCallback } from "@/components/analysis/findings/FindingsView";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { ValidationRuleRail } from "@/components/analysis/validation/ValidationRuleRail";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import type { ValidationViewSelection } from "@/contexts/ViewSelectionContext";
import { useStudySummaryTab } from "@/hooks/useStudySummaryTab";
import type { ValidationRuleResult } from "@/hooks/useValidationResults";
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

  // Excluded endpoints — synced from view via reverse callback
  const [excludedEndpoints, setExcludedEndpoints] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setFindingsExcludedCallback((excluded) => setExcludedEndpoints(excluded));
    return () => setFindingsExcludedCallback(null);
  }, []);

  // FindingSelectionContext for group selection + bidirectional sync
  const { selectedFinding, selectGroup } = useFindingSelection();

  // ── View-aware handlers ──

  const handleGroupScopeChange = useCallback((scope: { type: GroupingMode; value: string } | null) => {
    setGroupScope(scope);
    setActiveEndpoint(null);
    // Update group selection in context for context panel routing
    if (scope && (scope.type === "organ" || scope.type === "syndrome")) {
      selectGroup(scope.type, scope.value);
    } else {
      selectGroup(null, null);
    }
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
  }, [isFindingsRoute, isDRView, navigateTo, selectGroup]);

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

  // Rail restore: excluded endpoint icon clicked → forward to view
  const handleRestoreEndpoint = useCallback((label: string) => {
    getFindingsRailCallback()?.({ restoreEndpoint: label });
  }, []);

  // ── Bidirectional sync: table/context → rail highlight ──
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

  // Route detection — validation view, study summary details tab
  const isValidationRoute = pathname.includes("/validation");
  const isStudySummaryRoute = studyId && pathname === `/studies/${encodeURIComponent(studyId)}`;
  const [summaryTab] = useStudySummaryTab();

  // Validation rail: read/write selected rule via ViewSelectionContext
  const { selection: viewSelection, setSelection } = useViewSelection();
  const selectedRuleId =
    viewSelection?._view === "validation" ? viewSelection.rule_id : null;

  const handleValidationRuleSelect = useCallback(
    (rule: ValidationRuleResult) => {
      // Toggle off if re-selecting
      if (selectedRuleId === rule.rule_id) {
        setSelection(null);
        return;
      }
      const sel: ValidationViewSelection = {
        _view: "validation",
        mode: "rule",
        rule_id: rule.rule_id,
        severity: rule.severity,
        domain: rule.domain,
        category: rule.category,
        description: rule.description,
        records_affected: rule.records_affected,
        source: rule.source,
        status: rule.status,
      };
      setSelection(sel);
    },
    [selectedRuleId, setSelection]
  );

  // Don't render on landing page, non-study routes, domain browser,
  // or study summary "details" tab (no organ rail needed for metadata)
  if (!studyId || domainName) return null;
  if (isStudySummaryRoute && summaryTab === "details") return null;

  return (
    <>
      <div
        className="shrink-0 overflow-hidden border-r"
        style={{ width }}
      >
        {isValidationRoute ? (
          <ValidationRuleRail
            studyId={studyId}
            selectedRuleId={selectedRuleId}
            onRuleSelect={handleValidationRuleSelect}
          />
        ) : isFindingsView ? (
          <FindingsRail
            studyId={studyId}
            activeGroupScope={groupScope}
            activeEndpoint={activeEndpoint}
            onGroupScopeChange={handleGroupScopeChange}
            onEndpointSelect={handleEndpointSelect}
            onGroupingChange={handleGroupingChange}
            onVisibleEndpointsChange={handleVisibleEndpointsChange}
            excludedEndpoints={excludedEndpoints}
            onRestoreEndpoint={handleRestoreEndpoint}
          />
        ) : (
          <PolymorphicRail />
        )}
      </div>
      <PanelResizeHandle onPointerDown={onPointerDown} />
    </>
  );
}
