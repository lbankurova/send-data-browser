import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { fetchStaticChart } from "@/lib/analysis-view-api";
import { generateStudyReport } from "@/lib/report-generator";
import { buildSignalsPanelData, buildFilteredMetrics } from "@/lib/signals-panel-engine";
import { StudySummaryFilters } from "./StudySummaryFilters";
import { StudySummaryGrid } from "./StudySummaryGrid";
import { SignalHeatmap } from "./charts/SignalHeatmap";
import { SignalsPanel } from "./SignalsPanel";
import type {
  StudySummaryFilters as Filters,
  SignalSelection,
} from "@/types/analysis-views";

interface StudySummaryViewProps {
  onSelectionChange?: (selection: SignalSelection | null) => void;
  onOrganSelect?: (organSystem: string | null) => void;
}

type Tab = "details" | "signals";

export function StudySummaryView({ onSelectionChange, onOrganSelect }: StudySummaryViewProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: signalData, isLoading, error } = useStudySignalSummary(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  const { data: noaelData } = useNoaelSummary(studyId);
  const { data: meta } = useStudyMetadata(studyId!);

  const [tab, setTab] = useState<Tab>("details");
  const [filters, setFilters] = useState<Filters>({
    endpoint_type: null,
    organ_system: null,
    signal_score_min: 0,
    sex: null,
    significant_only: false,
  });

  const [selection, setSelection] = useState<SignalSelection | null>(null);
  const [staticHtml, setStaticHtml] = useState<string>("");

  useEffect(() => {
    if (!studyId) return;
    fetchStaticChart(studyId, "target_organ_bar")
      .then(setStaticHtml)
      .catch(() => setStaticHtml(""));
  }, [studyId]);

  useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);

  const filteredData = useMemo(() => {
    if (!signalData) return [];
    return signalData.filter((row) => {
      if (filters.endpoint_type && row.endpoint_type !== filters.endpoint_type)
        return false;
      if (filters.organ_system && row.organ_system !== filters.organ_system)
        return false;
      if (row.signal_score < filters.signal_score_min) return false;
      if (filters.sex && row.sex !== filters.sex) return false;
      if (
        filters.significant_only &&
        (row.p_value === null || row.p_value >= 0.05)
      )
        return false;
      return true;
    });
  }, [signalData, filters]);

  const panelData = useMemo(() => {
    if (!signalData || !targetOrgans || !noaelData) return null;
    return buildSignalsPanelData(noaelData, targetOrgans, signalData);
  }, [signalData, targetOrgans, noaelData]);

  // Metrics line updates with filters; panel findings stay static
  const displayMetrics = useMemo(() => {
    if (!panelData) return null;
    return buildFilteredMetrics(panelData.metrics, filteredData);
  }, [panelData, filteredData]);

  const handleOrganClick = (organSystem: string) => {
    setSelection(null); // clear endpoint selection
    onOrganSelect?.(organSystem);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">
            Analysis data not available
          </h1>
          <p className="text-sm text-red-600">
            Run the generator to produce analysis data:
          </p>
          <code className="mt-2 block rounded bg-red-100 px-3 py-1.5 text-xs text-red-800">
            cd backend && python -m generator.generate {studyId}
          </code>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading study summary...
        </span>
      </div>
    );
  }

  if (!signalData) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b">
        <div className="flex">
          {([
            { key: "details" as Tab, label: "Study details" },
            { key: "signals" as Tab, label: "Signals" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "relative px-4 py-2.5 text-xs font-medium transition-colors",
                tab === key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {tab === key && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
        <div className="ml-auto px-3 py-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
            onClick={() => studyId && generateStudyReport(studyId)}
          >
            <FileText className="h-3.5 w-3.5" />
            Generate report
          </button>
        </div>
      </div>

      {/* Tab content */}
      {tab === "details" && <DetailsTab meta={meta} studyId={studyId!} />}
      {tab === "signals" && (
        <div className="flex h-full overflow-hidden">
          {/* Signals panel — left side */}
          {panelData && (
            <div className="w-[280px] shrink-0">
              <SignalsPanel
                data={panelData}
                filteredMetrics={displayMetrics ?? undefined}
                onOrganClick={handleOrganClick}
                onEndpointClick={(ep) => {
                  // Find the signal row for this endpoint and select it
                  const match = signalData?.find(
                    (s) => s.endpoint_label === ep
                  );
                  if (match) {
                    setSelection({
                      endpoint_label: match.endpoint_label,
                      dose_level: match.dose_level,
                      sex: match.sex,
                      domain: match.domain,
                      test_code: match.test_code,
                      organ_system: match.organ_system,
                    });
                  }
                }}
              />
            </div>
          )}

          {/* Main content — right side */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Filters */}
            <StudySummaryFilters
              data={signalData}
              filters={filters}
              onChange={setFilters}
            />

            {/* Scrollable content */}
            <div className="flex-1 overflow-auto">
              <div className="border-b p-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Signal heatmap
                </h2>
                <SignalHeatmap
                  data={filteredData}
                  selection={selection}
                  onSelect={setSelection}
                />
              </div>

              <div className="border-b">
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Signal summary ({filteredData.length} rows)
                  </h2>
                </div>
                <StudySummaryGrid
                  data={filteredData}
                  selection={selection}
                  onSelect={setSelection}
                />
              </div>

              {staticHtml && (
                <div className="p-4">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Target organ summary
                    {targetOrgans && (
                      <span className="ml-1 font-normal normal-case">
                        ({targetOrgans.filter((o) => o.target_organ_flag).length}{" "}
                        identified)
                      </span>
                    )}
                  </h2>
                  <div dangerouslySetInnerHTML={{ __html: staticHtml }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details tab — study metadata
// ---------------------------------------------------------------------------

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="select-all">{value}</span>
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
  const parts = [total];
  if (males && females) parts.push(`(${males}M, ${females}F)`);
  return parts.join(" ");
}

import type { StudyMetadata } from "@/types";

function DetailsTab({ meta, studyId }: { meta: StudyMetadata | undefined; studyId: string }) {
  if (!meta) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading details...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Study: {meta.study_id}</h1>
        {meta.title && (
          <p className="mt-1 text-muted-foreground">{meta.title}</p>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Study overview
        </h2>
        <MetadataRow label="Species" value={meta.species} />
        <MetadataRow label="Strain" value={meta.strain} />
        <MetadataRow label="Study type" value={meta.study_type} />
        <MetadataRow label="Design" value={meta.design} />
        <MetadataRow
          label="Subjects"
          value={formatSubjects(meta.subjects, meta.males, meta.females)}
        />
        <MetadataRow label="Start date" value={meta.start_date} />
        <MetadataRow label="End date" value={meta.end_date} />
        <MetadataRow
          label="Duration"
          value={meta.dosing_duration ? formatDuration(meta.dosing_duration) : null}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Treatment
        </h2>
        <MetadataRow label="Test article" value={meta.treatment} />
        <MetadataRow label="Vehicle" value={meta.vehicle} />
        <MetadataRow label="Route" value={meta.route} />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Administration
        </h2>
        <MetadataRow label="Sponsor" value={meta.sponsor} />
        <MetadataRow label="Test facility" value={meta.test_facility} />
        <MetadataRow label="Study director" value={meta.study_director} />
        <MetadataRow label="GLP" value={meta.glp} />
        <MetadataRow label="SEND version" value={meta.send_version} />
      </section>

      <section>
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Domains ({meta.domain_count})
        </h2>
        <div className="flex flex-wrap gap-2">
          {meta.domains.map((d) => (
            <Link
              key={d}
              to={`/studies/${studyId}/domains/${d}`}
              className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs hover:bg-primary/20 transition-colors"
            >
              {d}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
