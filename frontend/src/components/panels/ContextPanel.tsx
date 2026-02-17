import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useAESummary } from "@/hooks/useAESummary";
import { generateStudyReport } from "@/lib/report-generator";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useRuleResults } from "@/hooks/useRuleResults";
import { useAdverseEffectSummary } from "@/hooks/useAdverseEffectSummary";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { FindingsContextPanel } from "@/components/analysis/panes/FindingsContextPanel";
import { StudySummaryContextPanel } from "@/components/analysis/panes/StudySummaryContextPanel";
import { NoaelContextPanel } from "@/components/analysis/panes/NoaelContextPanel";
import { DoseResponseContextPanel } from "@/components/analysis/panes/DoseResponseContextPanel";
import { HistopathologyContextPanel } from "@/components/analysis/panes/HistopathologyContextPanel";
import { ValidationContextPanel } from "@/components/analysis/panes/ValidationContextPanel";
import { SubjectProfilePanel } from "@/components/analysis/panes/SubjectProfilePanel";
import { StudyPortfolioContextPanel } from "@/components/portfolio/StudyPortfolioContextPanel";
import { useStudyPortfolio } from "@/hooks/useStudyPortfolio";
import { useValidationResults } from "@/hooks/useValidationResults";
import { useAnnotations } from "@/hooks/useAnnotations";
import type { ToxFinding, PathologyReview, ValidationRecordReview } from "@/types/annotations";
import { Wrench } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mb-3">
      <button
        className="mb-1 flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className="h-3 w-3 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        />
        {title}
      </button>
      {open && <div className="pl-4">{children}</div>}
    </section>
  );
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="select-all text-right">{value}</span>
    </div>
  );
}

function formatDuration(iso: string): string {
  const wMatch = iso.match(/^P(\d+)W$/);
  if (wMatch) return `${wMatch[1]} weeks`;
  const dMatch = iso.match(/^P(\d+)D$/);
  if (dMatch) return `${dMatch[1]} days`;
  return iso;
}

function formatSubjects(
  total: string | null,
  males: string | null,
  females: string | null
): string | null {
  if (!total) return null;
  if (males && females) return `${total} (${males}M, ${females}F)`;
  return total;
}

function StudyInspector({ studyId }: { studyId: string }) {
  const { data: meta, isLoading } = useStudyMetadata(studyId);
  const { data: aeSummary, isLoading: aeLoading } = useAESummary(studyId);
  const { data: valResults } = useValidationResults(studyId);
  const { data: toxAnnotations } = useAnnotations<ToxFinding>(studyId, "tox-findings");
  const { data: pathAnnotations } = useAnnotations<PathologyReview>(studyId, "pathology-reviews");
  const { data: valRecordAnnotations } = useAnnotations<ValidationRecordReview>(studyId, "validation-records");
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (!meta) return null;

  // Study health one-liner
  const noael = aeSummary?.suggested_noael;
  const noaelEstablished = noael && noael.dose_value != null;
  const healthLine = aeSummary
    ? `${aeSummary.total_adverse} adverse \u00b7 NOAEL ${noaelEstablished ? `${noael.dose_value} ${noael.dose_unit}` : "not established"}`
    : null;

  // Review progress counts
  const toxReviewed = toxAnnotations ? Object.keys(toxAnnotations).length : 0;
  const toxTotal = aeSummary?.total_findings ?? 0;
  const pathReviewed = pathAnnotations ? Object.keys(pathAnnotations).length : 0;
  const valRecordReviewed = valRecordAnnotations ? Object.keys(valRecordAnnotations).length : 0;
  const valTotal = valResults?.summary?.total_issues ?? 0;
  const validatedAt = valResults?.summary?.validated_at;

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{meta.study_id}</h3>

      <CollapsibleSection title="Study details" defaultOpen>
        <MetadataRow label="Species" value={meta.species} />
        <MetadataRow label="Strain" value={meta.strain} />
        <MetadataRow label="Type" value={meta.study_type} />
        <MetadataRow label="Design" value={meta.design} />
        <div className="my-1.5 border-t" />
        <MetadataRow
          label="Subjects"
          value={formatSubjects(meta.subjects, meta.males, meta.females)}
        />
        <MetadataRow
          label="Duration"
          value={meta.dosing_duration ? formatDuration(meta.dosing_duration) : null}
        />
        <MetadataRow label="Start" value={meta.start_date} />
        <MetadataRow label="End" value={meta.end_date} />
        <div className="my-1.5 border-t" />
        <MetadataRow label="Test article" value={meta.treatment} />
        <MetadataRow label="Vehicle" value={meta.vehicle} />
        <MetadataRow label="Route" value={meta.route} />
        <div className="my-1.5 border-t" />
        <MetadataRow label="Sponsor" value={meta.sponsor} />
        <MetadataRow label="Facility" value={meta.test_facility} />
        <MetadataRow label="Director" value={meta.study_director} />
        <MetadataRow label="GLP" value={meta.glp} />
      </CollapsibleSection>

      <CollapsibleSection title="Study health" defaultOpen>
        {aeLoading ? (
          <Skeleton className="h-4 w-full" />
        ) : healthLine ? (
          <p className="text-xs text-muted-foreground">{healthLine}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No analysis available</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Review progress" defaultOpen>
        <MetadataRow label="Tox findings" value={`${toxReviewed} / ${toxTotal} reviewed`} />
        <MetadataRow label="Pathology" value={`${pathReviewed} annotated`} />
        <MetadataRow
          label="Validation"
          value={`${valRecordReviewed} / ${valTotal} reviewed`}
        />
        {validatedAt && (
          <div className="mt-1 text-[10px] text-muted-foreground/60">
            Last validated: {new Date(validatedAt).toLocaleDateString()}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Actions">
        <div className="space-y-0.5">
          <a
            href="#"
            className="block text-xs text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              navigate(`/studies/${encodeURIComponent(meta.study_id)}`);
            }}
          >
            Open study
          </a>
          <a
            href="#"
            className="block text-xs text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              navigate(`/studies/${encodeURIComponent(meta.study_id)}/validation`);
            }}
          >
            Validation report
          </a>
          <a
            href="#"
            className="block text-xs text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              generateStudyReport(meta.study_id);
            }}
          >
            Generate report
          </a>
          <a
            href="#"
            className="block text-xs text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              alert("CSV/Excel export coming soon.");
            }}
          >
            Export...
          </a>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function StudySummaryContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection: studySel } = useStudySelection();
  const { data: signalData } = useStudySignalSummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  const organSelection = studySel.organSystem ?? null;

  // Build endpoint selection from StudySelectionContext
  const endpointSel = useMemo(() => {
    if (!studySel.endpoint || !signalData) return null;
    const row = signalData.find(r => r.endpoint_label === studySel.endpoint);
    if (!row) return null;
    return {
      endpoint_label: row.endpoint_label,
      dose_level: row.dose_level,
      sex: row.sex,
      domain: row.domain,
      test_code: row.test_code,
      organ_system: row.organ_system,
    };
  }, [studySel.endpoint, signalData]);

  return (
    <StudySummaryContextPanel
      signalData={signalData ?? []}
      ruleResults={ruleResults ?? []}
      selection={endpointSel}
      organSelection={organSelection}
      studyId={studyId}
    />
  );
}

function NoaelContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection: viewSel } = useViewSelection();
  const { data: aeData } = useAdverseEffectSummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  // NoaelContextPanel expects { endpoint_label, dose_level, sex } — these come from
  // NOAEL's local selection state, bridged via ViewSelectionContext during transition
  const sel = viewSel?._view === "noael" ? viewSel as { endpoint_label: string; dose_level: number; sex: string } : null;

  return (
    <NoaelContextPanel
      aeData={aeData ?? []}
      ruleResults={ruleResults ?? []}
      selection={sel}
      studyId={studyId}
    />
  );
}

function DoseResponseContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection: studySel } = useStudySelection();
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: signalData } = useStudySignalSummary(studyId);

  const sel = studySel.endpoint
    ? { endpoint_label: studySel.endpoint, organ_system: studySel.organSystem }
    : null;

  return (
    <DoseResponseContextPanel
      ruleResults={ruleResults ?? []}
      signalData={signalData ?? []}
      selection={sel}
      studyId={studyId}
    />
  );
}

function ValidationContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection, setSelection } = useViewSelection();

  const sel = selection?._view === "validation" ? selection : null;

  return <ValidationContextPanel selection={sel} studyId={studyId} setSelection={setSelection} />;
}

function HistopathologyContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection } = useViewSelection();
  const { data: lesionData } = useLesionSeveritySummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: pathReviews } = useAnnotations<PathologyReview>(studyId, "pathology-reviews");

  const sel = selection?._view === "histopathology" && (selection as { specimen?: string }).specimen
    ? selection as { specimen: string; finding?: string; sex?: string }
    : null;

  return (
    <HistopathologyContextPanel
      lesionData={lesionData ?? []}
      ruleResults={ruleResults ?? []}
      selection={sel}
      studyId={studyId}
      pathReviews={pathReviews}
    />
  );
}

function ScenarioInspector({ scenarioId }: { scenarioId: string }) {
  const navigate = useNavigate();
  const [expected, setExpected] = useState<{
    name: string;
    description: string;
    validation_status: string;
    expected_issues: Record<string, { severity: string; count: number }>;
    what_to_check: string[];
  } | null>(null);

  // Fetch expected issues on mount
  useEffect(() => {
    fetch(`/api/scenarios/${scenarioId}/expected-issues`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setExpected)
      .catch(() => {});
  }, [scenarioId]);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-muted-foreground/60" />
        <h3 className="text-sm font-semibold">{expected?.name ?? scenarioId}</h3>
      </div>
      {expected && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">{expected.description}</p>

          <CollapsibleSection title="Expected issues" defaultOpen>
            {Object.keys(expected.expected_issues).length === 0 ? (
              <p className="text-xs text-muted-foreground">No issues expected (clean study).</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(expected.expected_issues).map(([ruleId, info]) => (
                  <div key={ruleId} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[10px]">{ruleId}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                      {info.severity} ({info.count})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="What to check" defaultOpen>
            <ul className="space-y-1">
              {expected.what_to_check.map((item, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                  <span className="shrink-0">-</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Actions">
            <div className="space-y-0.5">
              <a
                href="#"
                className="block text-xs text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/studies/${encodeURIComponent(scenarioId)}`);
                }}
              >
                Open scenario
              </a>
              <a
                href="#"
                className="block text-xs text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/studies/${encodeURIComponent(scenarioId)}/validation`);
                }}
              >
                Validation report
              </a>
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

export function ContextPanel() {
  const { selectedStudyId } = useSelection();
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { selectedSubject, setSelectedSubject } = useViewSelection();
  const { data: allStudies } = useStudyPortfolio();

  const activeStudyId = studyId ?? selectedStudyId;

  // Subject profile takes priority over route-based panels
  if (selectedSubject && activeStudyId) {
    return (
      <SubjectProfilePanel
        studyId={activeStudyId}
        usubjid={selectedSubject}
        onBack={() => setSelectedSubject(null)}
      />
    );
  }

  // Route detection
  const isLandingPageRoute = location.pathname === "/";
  const isFindingsRoute = /\/studies\/[^/]+\/(findings|(analyses\/)?adverse-effects)/.test(
    location.pathname
  );
  const isStudySummaryRoute =
    activeStudyId &&
    location.pathname === `/studies/${encodeURIComponent(activeStudyId)}`;
  const isNoaelRoute = /\/studies\/[^/]+\/noael-decision/.test(location.pathname);
  const isDoseResponseRoute = /\/studies\/[^/]+\/dose-response/.test(location.pathname);
  const isHistopathologyRoute = /\/studies\/[^/]+\/histopathology/.test(location.pathname);
  const isValidationRoute = /\/studies\/[^/]+\/validation/.test(location.pathname);

  // Landing page with study selected - show portfolio context panel
  if (isLandingPageRoute && selectedStudyId && allStudies) {
    const selectedStudy = allStudies.find((s) => s.id === selectedStudyId);
    if (selectedStudy) {
      return (
        <StudyPortfolioContextPanel
          selectedStudy={selectedStudy}
          allStudies={allStudies}
        />
      );
    }
  }

  if (isFindingsRoute) {
    return <FindingsContextPanel />;
  }

  if (isNoaelRoute && activeStudyId) {
    return <NoaelContextPanelWrapper studyId={activeStudyId} />;
  }

  if (isDoseResponseRoute && activeStudyId) {
    return <DoseResponseContextPanelWrapper studyId={activeStudyId} />;
  }

  if (isHistopathologyRoute && activeStudyId) {
    return <HistopathologyContextPanelWrapper studyId={activeStudyId} />;
  }

  if (isValidationRoute && activeStudyId) {
    return <ValidationContextPanelWrapper studyId={activeStudyId} />;
  }

  if (isStudySummaryRoute && activeStudyId) {
    return <StudySummaryContextPanelWrapper studyId={activeStudyId} />;
  }

  if (!selectedStudyId) {
    return (
      <div className="p-4">
        <p className="text-xs text-muted-foreground">
          Select a study to view details.
        </p>
      </div>
    );
  }

  if (selectedStudyId.startsWith("SCENARIO-")) {
    return <ScenarioInspector scenarioId={selectedStudyId} />;
  }

  return <StudyInspector studyId={selectedStudyId} />;
}
