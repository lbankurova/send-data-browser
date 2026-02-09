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
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { AdverseEffectsContextPanel } from "@/components/analysis/panes/AdverseEffectsContextPanel";
import { StudySummaryContextPanel } from "@/components/analysis/panes/StudySummaryContextPanel";
import { NoaelContextPanel } from "@/components/analysis/panes/NoaelContextPanel";
import { TargetOrgansContextPanel } from "@/components/analysis/panes/TargetOrgansContextPanel";
import { DoseResponseContextPanel } from "@/components/analysis/panes/DoseResponseContextPanel";
import { HistopathologyContextPanel } from "@/components/analysis/panes/HistopathologyContextPanel";
import { ValidationContextPanel } from "@/components/analysis/panes/ValidationContextPanel";
import { SubjectProfilePanel } from "@/components/analysis/panes/SubjectProfilePanel";
import { useValidationResults } from "@/hooks/useValidationResults";
import { useClinicalObservations } from "@/hooks/useClinicalObservations";
import { useAnnotations } from "@/hooks/useAnnotations";
import { getDoseGroupColor } from "@/lib/severity-colors";
import type { ToxFinding, PathologyReview, ValidationRecordReview } from "@/types/annotations";
import type { CLTimecourseResponse } from "@/types/timecourse";
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
  const { selection, organSelection } = useSignalSelection();
  const { data: signalData } = useStudySignalSummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);

  return (
    <StudySummaryContextPanel
      signalData={signalData ?? []}
      ruleResults={ruleResults ?? []}
      selection={selection}
      organSelection={organSelection}
      studyId={studyId}
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
      studyId={studyId}
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
      studyId={studyId}
    />
  );
}

function DoseResponseContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection } = useViewSelection();
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: signalData } = useStudySignalSummary(studyId);

  const sel = selection?._view === "dose-response" ? selection as { endpoint_label: string; sex?: string; domain?: string; organ_system?: string } : null;

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

  const sel = selection?._view === "histopathology" ? selection as { finding: string; specimen: string; sex?: string } : null;

  return (
    <HistopathologyContextPanel
      lesionData={lesionData ?? []}
      ruleResults={ruleResults ?? []}
      selection={sel}
      studyId={studyId}
    />
  );
}

function deriveCLStats(data: CLTimecourseResponse, finding: string) {
  let totalOccurrences = 0;
  const uniqueSubjects = new Set<string>();
  let firstDay = Infinity;
  let lastDay = -Infinity;
  let peakDay = 0;
  let peakCount = 0;
  const doseGroupTotals = new Map<number, { count: number; total: number; label: string }>();

  for (const tp of data.timecourse) {
    let dayCount = 0;
    for (const gc of tp.counts) {
      const count = gc.findings[finding] ?? 0;
      if (count > 0) {
        totalOccurrences += count;
        dayCount += count;
        const ids = gc.subjects?.[finding];
        if (ids) for (const id of ids) uniqueSubjects.add(id);
      }
      const existing = doseGroupTotals.get(gc.dose_level);
      if (existing) {
        existing.count += count;
        existing.total = Math.max(existing.total, gc.total_subjects);
      } else {
        doseGroupTotals.set(gc.dose_level, { count, total: gc.total_subjects, label: gc.dose_label });
      }
    }
    if (dayCount > 0) {
      if (tp.day < firstDay) firstDay = tp.day;
      if (tp.day > lastDay) lastDay = tp.day;
      if (dayCount > peakCount) { peakCount = dayCount; peakDay = tp.day; }
    }
  }

  // Sex distribution: unique subjects per sex
  const sexCounts: Record<string, number> = {};
  for (const tp of data.timecourse) {
    for (const gc of tp.counts) {
      const ids = gc.subjects?.[finding];
      if (ids && ids.length > 0) {
        if (!sexCounts[gc.sex]) sexCounts[gc.sex] = 0;
        // Use Set to avoid double-counting across days (handled by uniqueSubjects above)
        // But per-sex we need a separate set
      }
    }
  }
  // Recalculate sex distribution properly with per-sex unique subject sets
  const sexSubjects: Record<string, Set<string>> = {};
  for (const tp of data.timecourse) {
    for (const gc of tp.counts) {
      const ids = gc.subjects?.[finding];
      if (ids) {
        if (!sexSubjects[gc.sex]) sexSubjects[gc.sex] = new Set();
        for (const id of ids) sexSubjects[gc.sex].add(id);
      }
    }
  }
  for (const [sex, set] of Object.entries(sexSubjects)) {
    sexCounts[sex] = set.size;
  }

  // Dose-response pattern
  const sorted = [...doseGroupTotals.entries()].sort((a, b) => a[0] - b[0]);
  let dosePattern = "No clear dose relationship";
  const nonZero = sorted.filter(([, v]) => v.count > 0);
  if (nonZero.length === 0) {
    dosePattern = "Not observed";
  } else if (nonZero.length === 1 && nonZero[0][0] === sorted[sorted.length - 1][0]) {
    dosePattern = "Present in high dose only";
  } else {
    let increasing = true;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i][1].count < sorted[i - 1][1].count) { increasing = false; break; }
    }
    const controlCount = sorted[0]?.[1].count ?? 0;
    if (increasing && sorted[sorted.length - 1][1].count > controlCount * 2) {
      dosePattern = "Increasing with dose";
    } else if (nonZero.length === sorted.length) {
      dosePattern = "Present across all groups";
    }
  }

  return {
    totalOccurrences,
    subjectsAffected: uniqueSubjects.size,
    firstDay: firstDay === Infinity ? null : firstDay,
    lastDay: lastDay === -Infinity ? null : lastDay,
    peakDay,
    peakCount,
    sexCounts,
    doseGroupTotals: sorted,
    dosePattern,
  };
}

function ClinicalObsContextPanelWrapper({ studyId }: { studyId: string }) {
  const { selection } = useViewSelection();
  const navigate = useNavigate();
  const { data: clData, isLoading } = useClinicalObservations(studyId);

  const sel = selection?._view === "clinical-observations"
    ? (selection as { finding: string })
    : null;

  if (!sel) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an observation to view details.
      </div>
    );
  }

  if (isLoading || !clData) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-sm font-semibold">{sel.finding}</h3>
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const stats = deriveCLStats(clData, sel.finding);
  const sexKeys = Object.keys(stats.sexCounts).sort();
  const sexDistribution = sexKeys.length > 1
    ? sexKeys.map((s) => `${s}: ${stats.sexCounts[s]}`).join(", ")
    : sexKeys.length === 1
      ? `${sexKeys[0]} only (${stats.sexCounts[sexKeys[0]]})`
      : "\u2014";

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{sel.finding}</h3>

      <CollapsibleSection title="Statistics" defaultOpen>
        <MetadataRow label="Total occurrences" value={String(stats.totalOccurrences)} />
        <MetadataRow label="Subjects affected" value={String(stats.subjectsAffected)} />
        <MetadataRow label="First observed" value={stats.firstDay != null ? `Day ${stats.firstDay}` : "\u2014"} />
        <MetadataRow label="Last observed" value={stats.lastDay != null ? `Day ${stats.lastDay}` : "\u2014"} />
        <MetadataRow label="Peak day" value={`Day ${stats.peakDay} (${stats.peakCount} obs)`} />
        <MetadataRow label="Sex distribution" value={sexDistribution} />
      </CollapsibleSection>

      <CollapsibleSection title="Dose relationship" defaultOpen>
        <p className="mb-1.5 text-xs font-medium">{stats.dosePattern}</p>
        <div className="space-y-0.5">
          {stats.doseGroupTotals.map(([dl, { count, total, label }]) => (
            <div key={dl} className="flex items-center justify-between gap-2 py-0.5 text-xs">
              <span style={{ color: getDoseGroupColor(dl) }}>{label.split(",")[0]}</span>
              <span className="font-mono text-muted-foreground">
                {count}/{total}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Related views">
        <div className="space-y-1">
          {[
            { label: "Dose-response", path: "dose-response" },
            { label: "NOAEL decision", path: "noael-decision" },
            { label: "Histopathology", path: "histopathology" },
          ].map(({ label, path }) => (
            <a
              key={path}
              href="#"
              className="block text-xs hover:underline"
              style={{ color: "#3a7bd5" }}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/studies/${encodeURIComponent(studyId)}/${path}`);
              }}
            >
              View {label} &rarr;
            </a>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}

export function ContextPanel() {
  const { selectedStudyId } = useSelection();
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { selectedSubject, setSelectedSubject } = useViewSelection();

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
  const isClinicalObsRoute = /\/studies\/[^/]+\/clinical-observations/.test(location.pathname);

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

  if (isClinicalObsRoute && activeStudyId) {
    return <ClinicalObsContextPanelWrapper studyId={activeStudyId} />;
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
