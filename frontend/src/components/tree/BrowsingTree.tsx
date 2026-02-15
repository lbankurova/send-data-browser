import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  FlaskConical,
  Loader2,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { useStudies } from "@/hooks/useStudies";
import { useDesignMode } from "@/contexts/DesignModeContext";
import { useScenarios } from "@/hooks/useScenarios";
import { useCategorizedDomains } from "@/hooks/useDomainsByStudy";
import { getDomainDescription } from "@/lib/send-categories";
import { ANALYSIS_VIEWS } from "@/lib/analysis-definitions";
import { useRailMode } from "@/contexts/RailModeContext";
import { useTreeControl } from "@/contexts/TreeControlContext";
import { TreeNode } from "./TreeNode";

/** Map view key to route path segment */
function viewRoute(studyId: string, viewKey: string): string {
  const enc = encodeURIComponent(studyId);
  if (viewKey === "study-summary") return `/studies/${enc}`;
  return `/studies/${enc}/${viewKey}`;
}

function StudyBranch({
  studyId,
  isExpanded,
  onToggle,
  activeStudyId,
  activeDomainName,
  emphasize,
}: {
  studyId: string;
  isExpanded: boolean;
  onToggle: () => void;
  activeStudyId: string | undefined;
  activeDomainName: string | undefined;
  emphasize?: boolean;
}) {
  const { categories, isLoading } = useCategorizedDomains(
    isExpanded ? studyId : undefined
  );
  const navigate = useNavigate();
  const { clearToggle } = useRailMode();
  const location = useLocation();

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  // Determine active view from URL
  const getActiveView = (): string | undefined => {
    if (activeStudyId !== studyId) return undefined;
    const path = location.pathname;
    const prefix = `/studies/${encodeURIComponent(studyId)}`;
    if (path === prefix) return "study-summary";
    for (const v of ANALYSIS_VIEWS) {
      if (v.key !== "study-summary" && path === `${prefix}/${v.key}`) {
        return v.key;
      }
    }
    return undefined;
  };
  const activeView = getActiveView();

  // Study node is active when on study summary
  const isStudyActive = activeView === "study-summary";

  // Auto-expand category containing active domain
  useEffect(() => {
    if (activeStudyId !== studyId || !activeDomainName || categories.length === 0)
      return;
    for (const cat of categories) {
      if (cat.domains.some((d) => d.name === activeDomainName)) {
        setExpandedCategories((prev) => {
          if (prev.has(cat.key)) return prev;
          const next = new Set(prev);
          next.add(cat.key);
          return next;
        });
        break;
      }
    }
  }, [activeStudyId, activeDomainName, studyId, categories]);

  // Auto-expand domains section when viewing a domain
  useEffect(() => {
    if (activeDomainName && activeStudyId === studyId) {
      setExpandedCategories((prev) => {
        if (prev.has("domains")) return prev;
        const next = new Set(prev);
        next.add("domains");
        return next;
      });
    }
  }, [activeDomainName, activeStudyId, studyId]);

  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleStudyClick = useCallback(() => {
    navigate(`/studies/${encodeURIComponent(studyId)}`);
  }, [navigate, studyId]);

  const isDomainsExpanded = expandedCategories.has("domains");

  return (
    <>
      {/* Study root node — click = Study Summary, chevron = toggle */}
      <TreeNode
        label={`Study: ${studyId}`}
        depth={1}
        isExpanded={isExpanded}
        isActive={isStudyActive}
        className={emphasize ? "font-medium" : undefined}
        onClick={handleStudyClick}
        onToggle={onToggle}
      />
      {isExpanded && (
        <>
          {/* Analysis views */}
          {ANALYSIS_VIEWS.filter((v) => v.key !== "study-summary").map((view) => (
            <TreeNode
              key={view.key}
              label={view.label}
              depth={1}
              isActive={activeView === view.key}
              onClick={() => {
                clearToggle();
                navigate(viewRoute(studyId, view.key));
              }}
            />
          ))}

          {/* Separator */}
          <div className="mx-4 my-1 border-t" />

          {/* Domains section */}
          <TreeNode
            label={`Domains`}
            depth={1}
            isExpanded={isDomainsExpanded}
            onClick={() => toggleCategory("domains")}
          />

          {isDomainsExpanded && (
            <>
              {isLoading && (
                <div
                  className="flex items-center gap-2 py-1"
                  style={{ paddingLeft: "44px" }}
                >
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Loading...
                  </span>
                </div>
              )}
              {categories.map((cat) => {
                const isCatExpanded = expandedCategories.has(cat.key);
                return (
                  <div key={cat.key}>
                    <TreeNode
                      label={`${cat.label} (${cat.domains.length})`}
                      depth={2}
                      isExpanded={isCatExpanded}
                      onClick={() => toggleCategory(cat.key)}
                    />
                    {isCatExpanded &&
                      cat.domains.map((domain) => {
                        const isActive =
                          activeStudyId === studyId &&
                          activeDomainName === domain.name;
                        return (
                          <TreeNode
                            key={domain.name}
                            label={`${domain.name.toUpperCase()} \u2014 ${getDomainDescription(domain)}`}
                            depth={3}
                            isActive={isActive}
                            onClick={() =>
                              navigate(
                                `/studies/${encodeURIComponent(studyId)}/domains/${encodeURIComponent(domain.name)}`
                              )
                            }
                          />
                        );
                      })}
                  </div>
                );
              })}
            </>
          )}

        </>
      )}
    </>
  );
}

export function BrowsingTree() {
  const { data: studies, isLoading } = useStudies();
  const { studyId: activeStudyId, domainName: activeDomainName } = useParams<{
    studyId: string;
    domainName: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [rootExpanded, setRootExpanded] = useState(true);
  const {
    hasExpanded,
    expandAll,
    collapseAll,
    expandedStudies,
    setExpandedStudies,
    manuallyCollapsed,
    register,
  } = useTreeControl();

  // Auto-expand: if only one study, expand it; also expand study from URL
  useEffect(() => {
    if (!studies) return;
    setExpandedStudies((prev) => {
      const next = new Set(prev);
      if (studies.length === 1 && !manuallyCollapsed.current.has(studies[0].study_id)) {
        next.add(studies[0].study_id);
      }
      if (activeStudyId && !manuallyCollapsed.current.has(activeStudyId)) {
        next.add(activeStudyId);
      }
      return next;
    });
  }, [studies, activeStudyId, setExpandedStudies, manuallyCollapsed]);

  const toggleStudy = useCallback((id: string) => {
    setExpandedStudies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        manuallyCollapsed.current.add(id);
      } else {
        next.add(id);
        manuallyCollapsed.current.delete(id);
      }
      return next;
    });
  }, [setExpandedStudies, manuallyCollapsed]);

  const isHomeActive = location.pathname === "/";

  const { designMode } = useDesignMode();
  const { data: scenarios } = useScenarios(designMode);

  const allStudyIds = [
    ...(studies ?? []).map((s) => s.study_id),
    ...(designMode ? (scenarios ?? []).map((s) => s.scenario_id) : []),
  ];

  // Register IDs so the landing page expand/collapse control can use them
  const idsKey = allStudyIds.join(",");
  useEffect(() => {
    register(allStudyIds);
  }, [idsKey, register]);

  if (isLoading) {
    return (
      <div className="p-4 text-xs text-muted-foreground">Loading...</div>
    );
  }

  return (
    <nav>
      {/* Datagrok-style tree header — icons hidden in app focus mode */}
      <div className="flex h-5 items-center border-b px-2">
        {/* Reserved icon slots (hidden in focus mode, configurable later) */}
      </div>

      <div className="py-2">
      <TreeNode
        label="Preclinical Case"
        depth={0}
        icon={<FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />}
        isExpanded={rootExpanded}
        isActive={isHomeActive}
        onClick={() => navigate("/")}
        onToggle={() => setRootExpanded((p) => !p)}
        action={
          rootExpanded ? (
            <button
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={hasExpanded ? "Collapse all studies" : "Expand all studies"}
              onClick={() => (hasExpanded ? collapseAll() : expandAll())}
            >
              {hasExpanded ? (
                <ChevronsDownUp className="h-3 w-3" />
              ) : (
                <ChevronsUpDown className="h-3 w-3" />
              )}
            </button>
          ) : undefined
        }
      />
      {rootExpanded &&
        allStudyIds.map((id) => (
          <StudyBranch
            key={id}
            studyId={id}
            isExpanded={expandedStudies.has(id)}
            onToggle={() => toggleStudy(id)}
            activeStudyId={activeStudyId}
            activeDomainName={activeDomainName}
            emphasize={expandedStudies.size > 0}
          />
        ))}
      </div>
    </nav>
  );
}
