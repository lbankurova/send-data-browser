import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { PolymorphicRail } from "./PolymorphicRail";
import { FindingsRail } from "@/components/analysis/findings/FindingsRail";
import type { RailVisibleState } from "@/components/analysis/findings/FindingsRail";
import { getFindingsRailCallback, setFindingsClearScopeCallback, setFindingsExcludedCallback, setFindingsSetScopeCallback } from "@/components/analysis/findings/findings-bridge";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { ValidationRuleRail } from "@/components/analysis/validation/ValidationRuleRail";
import { CohortRail } from "@/components/analysis/cohort/CohortRail";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import type { ValidationViewSelection } from "@/contexts/ViewSelectionContext";
import type { ValidationRuleResult } from "@/hooks/useValidationResults";
import type { GroupingMode } from "@/lib/findings-rail-engine";

/**
 * Shell-level rail panel. Renders PolymorphicRail by default,
 * or FindingsRail when on findings-aware views (Findings, Dose-Response).
 * Only renders when inside a study route (studyId present).
 */
export function ShellRailPanel() {
  const { studyId, domainName } = useParams<{ studyId: string; domainName: string }>();
  const { width, targetRef, onPointerDown } = useResizePanel(260, { direction: "left", storageKey: "pcc.layout.railWidth" });
  const { pathname } = useLocation();
  const { selection: studySelection } = useStudySelection();

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
  const [activeDomain, setActiveDomain] = useState<string | undefined>(undefined);

  // Route detection
  const isFindingsView = pathname.includes("/findings");

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

  // Register reverse callback so view can SET a specific scope (cross-scope nav, F8).
  useEffect(() => {
    setFindingsSetScopeCallback((scope) => {
      setGroupScope(scope);
      setActiveEndpoint(null);
      if (scope.type === "organ" || scope.type === "syndrome" || scope.type === "specimen") {
        selectGroup(scope.type, scope.value);
      } else {
        selectGroup(null, null);
      }
    });
    return () => setFindingsSetScopeCallback(null);
  }, [selectGroup]);

  // ── View-aware handlers ──

  const handleGroupScopeChange = useCallback((scope: { type: GroupingMode; value: string } | null) => {
    setGroupScope(scope);
    setActiveEndpoint(null);
    // Update group selection in context for context panel routing
    if (scope && (scope.type === "organ" || scope.type === "syndrome" || scope.type === "specimen")) {
      selectGroup(scope.type, scope.value);
    } else {
      selectGroup(null, null);
    }
    if (isFindingsView) {
      getFindingsRailCallback()?.({ activeEndpoint: null });
    }
  }, [isFindingsView, selectGroup]);

  const handleEndpointSelect = useCallback((endpointLabel: string | null, domain?: string) => {
    setActiveEndpoint(endpointLabel);
    setActiveDomain(domain);
    if (isFindingsView) {
      getFindingsRailCallback()?.({ activeEndpoint: endpointLabel, activeDomain: domain });
    }
  }, [isFindingsView]);

  const handleGroupingChange = useCallback((mode: GroupingMode) => {
    if (isFindingsView) {
      getFindingsRailCallback()?.({ activeGrouping: mode });
    }
  }, [isFindingsView]);

  // Rail sends fully-filtered visible endpoint set → forward to view
  const handleVisibleEndpointsChange = useCallback((state: RailVisibleState) => {
    if (isFindingsView) {
      getFindingsRailCallback()?.({ visibleEndpoints: state });
    }
  }, [isFindingsView]);

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
    if (!isFindingsView) return;
    const newEndpoint = selectedFinding?.endpoint_label ?? null;
    if (newEndpoint !== prevEndpointRef.current) {
      setActiveEndpoint(newEndpoint);
      setActiveDomain(selectedFinding?.domain);
    }
  }, [selectedFinding, isFindingsView]);

  // Route detection — validation view, cohort view, study summary details tab
  const isValidationRoute = pathname.includes("/validation");
  const isCohortRoute = pathname.includes("/cohort");
  const isStudySummaryRoute = studyId && pathname === `/studies/${encodeURIComponent(studyId)}`;

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
  if (isStudySummaryRoute) return null;

  return (
    <>
      <div
        ref={targetRef}
        className="shrink-0 overflow-hidden border-r"
        style={{ width }}
      >
        {isCohortRoute ? (
          <CohortRail />
        ) : isValidationRoute ? (
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
            activeDomain={activeDomain}
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
