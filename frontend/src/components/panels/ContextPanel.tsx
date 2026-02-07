import { useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useSignalSelection } from "@/contexts/SignalSelectionContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useAESummary } from "@/hooks/useAESummary";
import { generateStudyReport } from "@/lib/report-generator";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useRuleResults } from "@/hooks/useRuleResults";
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import { useAdverseEffectSummary } from "@/hooks/useAdverseEffectSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useOrganEvidenceDetail } from "@/hooks/useOrganEvidenceDetail";
import { useDoseResponseMetrics } from "@/hooks/useDoseResponseMetrics";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { AdverseEffectsContextPanel } from "@/components/analysis/panes/AdverseEffectsContextPanel";
import { StudySummaryContextPanel } from "@/components/analysis/panes/StudySummaryContextPanel";
import { NoaelContextPanel } from "@/components/analysis/panes/NoaelContextPanel";
import { TargetOrgansContextPanel } from "@/components/analysis/panes/TargetOrgansContextPanel";
import { DoseResponseContextPanel } from "@/components/analysis/panes/DoseResponseContextPanel";
import { HistopathologyContextPanel } from "@/components/analysis/panes/HistopathologyContextPanel";
import { ValidationContextPanel } from "@/components/analysis/panes/ValidationContextPanel";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalysisSummary } from "@/types/analysis";

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

function AdverseEffectsSummarySection({
  studyId,
  data,
}: {
  studyId: string;
  data: AnalysisSummary;
}) {
  const navigate = useNavigate();

  const noaelValue = data.suggested_noael;
  const noaelEstablished = noaelValue && noaelValue.dose_value != null && noaelValue.dose_value > 0;
  const trPct = data.total_findings > 0
    ? Math.round((data.total_treatment_related / data.total_findings) * 100)
    : 0;

  return (
    <div>
      <div className="flex justify-between gap-2 py-0.5 text-xs">
        <span className="text-muted-foreground">Findings</span>
        <span className="text-right">
          <span className="font-medium text-red-600">{data.total_adverse}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="font-medium text-amber-600">{data.total_warning}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="font-medium text-green-600">{data.total_normal}</span>
        </span>
      </div>
      <div className="flex justify-between gap-2 py-0.5 text-xs">
        <span className="text-muted-foreground">Treatment-related</span>
        <span className="text-right">
          {data.total_treatment_related}
          <span className="text-muted-foreground"> ({trPct}%)</span>
        </span>
      </div>
      <div className="flex justify-between gap-2 py-0.5 text-xs">
        <span className="text-muted-foreground">NOAEL</span>
        {noaelEstablished ? (
          <span className="text-right">
            {noaelValue.dose_value} {noaelValue.dose_unit}
          </span>
        ) : (
          <span className="text-right font-medium text-red-600">
            Not established
          </span>
        )}
      </div>
      <a
        href="#"
        className="mt-1.5 inline-block text-xs hover:underline"
        style={{ color: "#3a7bd5" }}
        onClick={(e) => {
          e.preventDefault();
          navigate(
            `/studies/${encodeURIComponent(studyId)}/analyses/adverse-effects`
          );
        }}
      >
        View adverse effects &#x2192;
      </a>
    </div>
  );
}

function StudyInspector({ studyId }: { studyId: string }) {
  const { data: meta, isLoading } = useStudyMetadata(studyId);
  const { data: aeSummary, isLoading: aeLoading } = useAESummary(studyId);
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

      <CollapsibleSection title="Adverse findings" defaultOpen>
        {aeLoading ? (
          <div className="space-y-1">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : aeSummary ? (
          <AdverseEffectsSummarySection studyId={meta.study_id} data={aeSummary} />
        ) : (
          <p className="text-xs text-muted-foreground">No analysis available</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Actions">
        <div className="space-y-0.5">
          <a
            href="#"
            className="block text-xs hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/studies/${encodeURIComponent(meta.study_id)}`);
            }}
          >
            Open study
          </a>
          <a
            href="#"
            className="block text-xs hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/studies/${encodeURIComponent(meta.study_id)}/validation`);
            }}
          >
            Validation report
          </a>
          <a
            href="#"
            className="block text-xs hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              generateStudyReport(meta.study_id);
            }}
          >
            Generate report
          </a>
          <a
            href="#"
            className="block text-xs hover:underline"
            style={{ color: "#3a7bd5" }}
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
  const { selection } = useSignalSelection();
  const { data: signalData } = useStudySignalSummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  return (
    <StudySummaryContextPanel
      signalData={signalData ?? []}
      ruleResults={ruleResults ?? []}
      selection={selection}
    />
  );
}

function NoaelContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection } = useViewSelection();
  const { data: noaelData } = useNoaelSummary(studyId);
  const { data: aeData } = useAdverseEffectSummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  const sel = selection?._view === "noael" ? selection as { endpoint_label: string; dose_level: number; sex: string } : null;

  return (
    <NoaelContextPanel
      noaelData={noaelData ?? []}
      aeData={aeData ?? []}
      ruleResults={ruleResults ?? []}
      selection={sel}
    />
  );
}

function TargetOrgansContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection } = useViewSelection();
  const { data: organData } = useTargetOrganSummary(studyId);
  const { data: evidenceData } = useOrganEvidenceDetail(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  const sel = selection?._view === "target-organs" ? selection as { organ_system: string; endpoint_label?: string; sex?: string } : null;

  return (
    <TargetOrgansContextPanel
      organData={organData ?? []}
      evidenceData={evidenceData ?? []}
      ruleResults={ruleResults ?? []}
      selection={sel}
    />
  );
}

function DoseResponseContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection } = useViewSelection();
  const { data: drData } = useDoseResponseMetrics(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  const sel = selection?._view === "dose-response" ? selection as { endpoint_label: string; sex?: string; domain?: string; organ_system?: string } : null;

  return (
    <DoseResponseContextPanel
      drData={drData ?? []}
      ruleResults={ruleResults ?? []}
      selection={sel}
    />
  );
}

function ValidationContextPanelWrapper({ studyId: _studyId }: { studyId: string }) {
  const { selection } = useViewSelection();

  const sel = selection?._view === "validation" ? selection as {
    rule_id: string;
    severity: "Error" | "Warning" | "Info";
    domain: string;
    category: string;
    description: string;
    records_affected: number;
  } : null;

  return <ValidationContextPanel selection={sel} />;
}

function HistopathologyContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection } = useViewSelection();
  const { data: lesionData } = useLesionSeveritySummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  const sel = selection?._view === "histopathology" ? selection as { finding: string; specimen: string; sex?: string } : null;

  return (
    <HistopathologyContextPanel
      lesionData={lesionData ?? []}
      ruleResults={ruleResults ?? []}
      selection={sel}
    />
  );
}

export function ContextPanel() {
  const { selectedStudyId } = useSelection();
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();

  const activeStudyId = studyId ?? selectedStudyId;

  // Route detection
  const isAdverseEffectsRoute = /\/studies\/[^/]+\/analyses\/adverse-effects/.test(
    location.pathname
  );
  const isStudySummaryRoute =
    activeStudyId &&
    location.pathname === `/studies/${encodeURIComponent(activeStudyId)}`;
  const isNoaelRoute = /\/studies\/[^/]+\/noael-decision/.test(location.pathname);
  const isTargetOrgansRoute = /\/studies\/[^/]+\/target-organs/.test(location.pathname);
  const isDoseResponseRoute = /\/studies\/[^/]+\/dose-response/.test(location.pathname);
  const isHistopathologyRoute = /\/studies\/[^/]+\/histopathology/.test(location.pathname);
  const isValidationRoute = /\/studies\/[^/]+\/validation/.test(location.pathname);

  if (isAdverseEffectsRoute) {
    return <AdverseEffectsContextPanel />;
  }

  if (isNoaelRoute && activeStudyId) {
    return <NoaelContextPanelWrapper studyId={activeStudyId} />;
  }

  if (isTargetOrgansRoute && activeStudyId) {
    return <TargetOrgansContextPanelWrapper studyId={activeStudyId} />;
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

  if (selectedStudyId !== "PointCross") {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-sm font-semibold">{selectedStudyId}</h3>
        <p className="text-xs text-muted-foreground">
          This is a demo entry. Select PointCross to explore full functionality.
        </p>
      </div>
    );
  }

  return <StudyInspector studyId={selectedStudyId} />;
}
