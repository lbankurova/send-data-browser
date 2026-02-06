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
  Target,
  Crosshair,
  CheckCircle,
  Users,
  RotateCcw,
} from "lucide-react";
import { useStudies } from "@/hooks/useStudies";
import { useCategorizedDomains } from "@/hooks/useDomainsByStudy";
import { getDomainDescription } from "@/lib/send-categories";
import { ANALYSIS_TYPES } from "@/lib/analysis-definitions";
import { TreeNode } from "./TreeNode";

const ANALYSIS_ICONS: Record<string, React.ReactNode> = {
  AlertTriangle: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
  Target: <Target className="h-4 w-4 text-muted-foreground" />,
  Crosshair: <Crosshair className="h-4 w-4 text-muted-foreground" />,
  CheckCircle: <CheckCircle className="h-4 w-4 text-muted-foreground" />,
  Users: <Users className="h-4 w-4 text-muted-foreground" />,
  RotateCcw: <RotateCcw className="h-4 w-4 text-muted-foreground" />,
};

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

  // Determine active analysis type from URL
  const analysisMatch = location.pathname.match(
    /\/studies\/[^/]+\/analyses\/([^/]+)/
  );
  const activeAnalysisType =
    activeStudyId === studyId && analysisMatch ? analysisMatch[1] : undefined;

  // Study node is active when on its landing page (not on a domain page or analysis)
  const isStudyActive =
    activeStudyId === studyId &&
    !activeDomainName &&
    !activeAnalysisType &&
    location.pathname === `/studies/${encodeURIComponent(studyId)}`;

  // Auto-expand category containing active domain when data loads
  useEffect(() => {
    if (
      activeStudyId !== studyId ||
      !activeDomainName ||
      categories.length === 0
    )
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

  // Auto-expand analyses category when an analysis is active
  useEffect(() => {
    if (activeAnalysisType) {
      setExpandedCategories((prev) => {
        if (prev.has("analyses")) return prev;
        const next = new Set(prev);
        next.add("analyses");
        return next;
      });
    }
  }, [activeAnalysisType]);

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

  const isAnalysesExpanded = expandedCategories.has("analyses");

  return (
    <>
      <TreeNode
        label={studyId}
        depth={1}
        icon={<FlaskConical className="h-4 w-4 text-muted-foreground" />}
        isExpanded={isExpanded}
        isActive={isStudyActive}
        onClick={handleStudyClick}
      />
      {isExpanded && (
        <>
          {isLoading && (
            <div
              className="flex items-center gap-2 py-1"
              style={{ paddingLeft: "56px" }}
            >
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
          )}
          {categories.map((cat) => {
            const isCatExpanded = expandedCategories.has(cat.key);
            return (
              <div key={cat.key}>
                <TreeNode
                  label={`${cat.label} (${cat.domains.length})`}
                  depth={2}
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
                        label={`${domain.name.toUpperCase()} — ${getDomainDescription(domain)}`}
                        depth={3}
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

          {/* Analyses section */}
          <TreeNode
            label={`Analyses (${ANALYSIS_TYPES.length})`}
            depth={2}
            icon={
              isAnalysesExpanded ? (
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              ) : (
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              )
            }
            isExpanded={isAnalysesExpanded}
            onClick={() => toggleCategory("analyses")}
          />
          {isAnalysesExpanded &&
            ANALYSIS_TYPES.map((analysis) => {
              const isActive = activeAnalysisType === analysis.key;
              return (
                <TreeNode
                  key={analysis.key}
                  label={analysis.label}
                  depth={3}
                  icon={ANALYSIS_ICONS[analysis.icon]}
                  isActive={isActive}
                  onClick={() =>
                    navigate(
                      `/studies/${encodeURIComponent(studyId)}/analyses/${analysis.key}`
                    )
                  }
                />
              );
            })}
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
