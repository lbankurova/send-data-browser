import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  FlaskConical,
  Folder,
  FolderOpen,
  FileSpreadsheet,
  Loader2,
  BarChart3,
  AlertTriangle,
  TrendingUp,
  Crosshair,
  Microscope,
  Target,
  ShieldCheck,
  Minus,
} from "lucide-react";
import { useStudies } from "@/hooks/useStudies";
import { useCategorizedDomains } from "@/hooks/useDomainsByStudy";
import { getDomainDescription } from "@/lib/send-categories";
import { ANALYSIS_VIEWS } from "@/lib/analysis-definitions";
import { TreeNode } from "./TreeNode";

const VIEW_ICONS: Record<string, React.ReactNode> = {
  "study-summary": <BarChart3 className="h-4 w-4 text-muted-foreground" />,
  "dose-response": <TrendingUp className="h-4 w-4 text-muted-foreground" />,
  "target-organs": <Crosshair className="h-4 w-4 text-muted-foreground" />,
  histopathology: <Microscope className="h-4 w-4 text-muted-foreground" />,
  "noael-decision": <Target className="h-4 w-4 text-muted-foreground" />,
  "clinical-observations": <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
  validation: <ShieldCheck className="h-4 w-4 text-muted-foreground" />,
};

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
}: {
  studyId: string;
  isExpanded: boolean;
  onToggle: () => void;
  activeStudyId: string | undefined;
  activeDomainName: string | undefined;
}) {
  const { categories, isLoading } = useCategorizedDomains(
    isExpanded ? studyId : undefined
  );
  const navigate = useNavigate();
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
    // Check old analyses routes
    const analysisMatch = path.match(/\/analyses\/([^/]+)/);
    if (analysisMatch) return `analyses-${analysisMatch[1]}`;
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
    if (!isExpanded) onToggle();
  }, [navigate, studyId, isExpanded, onToggle]);

  const isDomainsExpanded = expandedCategories.has("domains");

  return (
    <>
      {/* Study root node — click = Study Summary */}
      <TreeNode
        label={`Study: ${studyId}`}
        depth={1}
        icon={<FlaskConical className="h-4 w-4 text-muted-foreground" />}
        isExpanded={isExpanded}
        isActive={isStudyActive}
        onClick={handleStudyClick}
      />
      {isExpanded && (
        <>
          {/* Analysis views */}
          {ANALYSIS_VIEWS.filter((v) => v.key !== "study-summary").map(
            (view) => {
              const isActive = activeView === view.key;
              return (
                <TreeNode
                  key={view.key}
                  label={view.label}
                  depth={2}
                  icon={
                    VIEW_ICONS[view.key] ?? (
                      <Minus className="h-4 w-4 text-muted-foreground" />
                    )
                  }
                  isActive={isActive}
                  onClick={() => {
                    if (view.implemented) {
                      navigate(viewRoute(studyId, view.key));
                    } else {
                      navigate(viewRoute(studyId, view.key));
                    }
                  }}
                />
              );
            }
          )}

          {/* Separator */}
          <div className="mx-4 my-1 border-t" />

          {/* Domains section */}
          <TreeNode
            label={`Domains`}
            depth={2}
            icon={
              isDomainsExpanded ? (
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Folder className="h-4 w-4 text-muted-foreground" />
              )
            }
            isExpanded={isDomainsExpanded}
            onClick={() => toggleCategory("domains")}
          />

          {isDomainsExpanded && (
            <>
              {isLoading && (
                <div
                  className="flex items-center gap-2 py-1"
                  style={{ paddingLeft: "56px" }}
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
                      depth={3}
                      icon={
                        isCatExpanded ? (
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Folder className="h-4 w-4 text-muted-foreground" />
                        )
                      }
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
                            depth={4}
                            icon={
                              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                            }
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

          {/* Legacy analyses link */}
          <div className="mx-4 my-1 border-t" />
          <TreeNode
            label="Adverse effects"
            depth={2}
            icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            isActive={activeView === "analyses-adverse-effects"}
            onClick={() =>
              navigate(
                `/studies/${encodeURIComponent(studyId)}/analyses/adverse-effects`
              )
            }
          />
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

  const [expandedStudies, setExpandedStudies] = useState<Set<string>>(
    new Set()
  );

  // Auto-expand: if only one study, expand it; also expand study from URL
  useEffect(() => {
    if (!studies) return;
    setExpandedStudies((prev) => {
      const next = new Set(prev);
      if (studies.length === 1) next.add(studies[0].study_id);
      if (activeStudyId) next.add(activeStudyId);
      return next;
    });
  }, [studies, activeStudyId]);

  const toggleStudy = useCallback((id: string) => {
    setExpandedStudies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading...</div>
    );
  }

  const isHomeActive = location.pathname === "/";

  return (
    <nav className="py-2">
      <TreeNode
        label="Home"
        depth={0}
        icon={<Home className="h-4 w-4 text-muted-foreground" />}
        isActive={isHomeActive}
        onClick={() => navigate("/")}
      />
      <div className="mb-1 mt-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Studies
      </div>
      {studies?.map((study) => (
        <StudyBranch
          key={study.study_id}
          studyId={study.study_id}
          isExpanded={expandedStudies.has(study.study_id)}
          onToggle={() => toggleStudy(study.study_id)}
          activeStudyId={activeStudyId}
          activeDomainName={activeDomainName}
        />
      ))}
    </nav>
  );
}
