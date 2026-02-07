import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Loader2, FileText } from "lucide-react";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { fetchStaticChart } from "@/lib/analysis-view-api";
import { generateStudyReport } from "@/lib/report-generator";
import { StudySummaryFilters } from "./StudySummaryFilters";
import { StudySummaryGrid } from "./StudySummaryGrid";
import { SignalHeatmap } from "./charts/SignalHeatmap";
import type {
  StudySummaryFilters as Filters,
  SignalSelection,
} from "@/types/analysis-views";

interface StudySummaryViewProps {
  onSelectionChange?: (selection: SignalSelection | null) => void;
}

export function StudySummaryView({ onSelectionChange }: StudySummaryViewProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: signalData, isLoading, error } = useStudySignalSummary(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);

  const [filters, setFilters] = useState<Filters>({
    endpoint_type: null,
    organ_system: null,
    signal_score_min: 0,
    sex: null,
    significant_only: false,
  });

  const [selection, setSelection] = useState<SignalSelection | null>(null);
  const [staticHtml, setStaticHtml] = useState<string>("");

  // Load static chart
  useEffect(() => {
    if (!studyId) return;
    fetchStaticChart(studyId, "target_organ_bar")
      .then(setStaticHtml)
      .catch(() => setStaticHtml(""));
  }, [studyId]);

  // Propagate selection to parent (for context panel)
  useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);

  // Filtered data
  const filteredData = useMemo(() => {
    if (!signalData) return [];
    return signalData.filter((row) => {
      if (
        filters.endpoint_type &&
        row.endpoint_type !== filters.endpoint_type
      )
        return false;
      if (filters.organ_system && row.organ_system !== filters.organ_system)
        return false;
      if (row.signal_score < filters.signal_score_min) return false;
      if (filters.sex && row.sex !== filters.sex) return false;
      if (filters.significant_only && (row.p_value === null || row.p_value >= 0.05))
        return false;
      return true;
    });
  }, [signalData, filters]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">
            Analysis Data Not Available
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
      {/* Filters + actions */}
      <div className="flex items-center">
        <div className="flex-1">
          <StudySummaryFilters
            data={signalData}
            filters={filters}
            onChange={setFilters}
          />
        </div>
        <div className="border-b px-3 py-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
            onClick={() => studyId && generateStudyReport(studyId)}
          >
            <FileText className="h-3.5 w-3.5" />
            Generate Report
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Signal Heatmap */}
        <div className="border-b p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Signal Heatmap
          </h2>
          <SignalHeatmap
            data={filteredData}
            selection={selection}
            onSelect={setSelection}
          />
        </div>

        {/* Grid */}
        <div className="border-b">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Signal Summary ({filteredData.length} rows)
            </h2>
          </div>
          <StudySummaryGrid
            data={filteredData}
            selection={selection}
            onSelect={setSelection}
          />
        </div>

        {/* Target Organ Bar Chart (static) */}
        {staticHtml && (
          <div className="p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target Organ Summary
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
  );
}
