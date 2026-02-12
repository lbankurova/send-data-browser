import { useCallback, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, MoreVertical, Check, X, TriangleAlert, ChevronRight, Upload, Loader2, Wrench } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStudies } from "@/hooks/useStudies";
import { useStudyPortfolio } from "@/hooks/useStudyPortfolio";
import { useProjects } from "@/hooks/useProjects";
import { cn } from "@/lib/utils";
import { useSelection } from "@/contexts/SelectionContext";
import { generateStudyReport } from "@/lib/report-generator";
import { importStudy, deleteStudy } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useDesignMode } from "@/contexts/DesignModeContext";
import { useScenarios } from "@/hooks/useScenarios";
import type { ScenarioSummary } from "@/hooks/useScenarios";
import type { StudySummary } from "@/types";
import { getPipelineStageColor } from "@/lib/severity-colors";
import { noael } from "@/lib/study-accessors";
import type { StudyMetadata } from "@/hooks/useStudyPortfolio";

const VAL_DISPLAY: Record<string, { icon: React.ReactNode; tooltip: string }> = {
  Pass: { icon: <Check className="h-3.5 w-3.5" style={{ color: "#16a34a" }} />, tooltip: "SEND validation passed" },
  Warnings: { icon: <TriangleAlert className="h-3.5 w-3.5" style={{ color: "#d97706" }} />, tooltip: "Passed with warnings" },
  Fail: { icon: <X className="h-3.5 w-3.5" style={{ color: "#dc2626" }} />, tooltip: "SEND validation failed" },
  "Not Run": { icon: <span className="text-xs text-muted-foreground">—</span>, tooltip: "Not validated" },
};

type DisplayStudy = StudySummary & {
  validation: string;
  // Portfolio fields (may be null for non-portfolio studies)
  pipeline_stage?: string;
  duration_weeks?: number;
  noael_value?: string;  // Resolved NOAEL display value
  portfolio_metadata?: StudyMetadata;  // Full portfolio metadata if available
};

function StudyContextMenu({
  position,
  study,
  onClose,
  onOpen,
  onDelete,
}: {
  position: { x: number; y: number };
  study: DisplayStudy;
  onClose: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const items: { label: string; action: () => void; disabled?: boolean; separator?: boolean; danger?: boolean }[] = [
    { label: "Open Study", action: onOpen },
    {
      label: "Open Validation Report",
      action: () => {
        onClose();
        navigate(`/studies/${encodeURIComponent(study.study_id)}/validation`);
      },
    },
    {
      label: "Generate Report",
      action: () => {
        onClose();
        generateStudyReport(study.study_id);
      },
    },
    { label: "Share...", action: () => onClose(), disabled: true },
    {
      label: "Export...",
      action: () => {
        onClose();
        alert("CSV/Excel export coming soon.");
      },
    },
    {
      label: "Re-validate SEND...",
      action: () => {
        onClose();
        navigate(`/studies/${encodeURIComponent(study.study_id)}/validation`);
        fetch(`/api/studies/${encodeURIComponent(study.study_id)}/validate`, { method: "POST" })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["validation-results", study.study_id] });
            queryClient.invalidateQueries({ queryKey: ["affected-records", study.study_id] });
          });
      },
    },
    { label: "Delete", action: onDelete, separator: true, danger: true },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[200px] rounded-md border bg-popover py-1 shadow-lg"
        style={{ left: position.x, top: position.y }}
      >
        {items.map((item, i) => (
          <div key={i}>
            {item.separator && <div className="my-1 border-t" />}
            <button
              className={cn(
                "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent",
                item.danger && "text-red-600 hover:bg-red-50"
              )}
              onClick={item.action}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function ImportSection({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validate, setValidate] = useState(true);
  const [autoFix, setAutoFix] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFile = useCallback(async (file: File) => {
    setImportError(null);
    setImportSuccess(null);
    setImporting(true);
    try {
      const result = await importStudy(file, { validate, autoFix: autoFix });
      setImportSuccess(`Imported ${result.study_id} (${result.domain_count} domains)`);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["studies"] });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [queryClient, validate, autoFix]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        setSelectedFile(file);
        setImportError(null);
        setImportSuccess(null);
      }
    },
    []
  );

  return (
    <div className="border-b px-8 py-4">
      <button
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className="h-3 w-3 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        />
        Import new study
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-5 transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : selectedFile
                  ? "border-primary/50 bg-primary/5"
                  : "border-muted-foreground/25 bg-muted/30"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {importing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Importing study...</p>
              </>
            ) : selectedFile ? (
              <>
                <Upload className="h-5 w-5 text-primary/60" />
                <p className="text-xs font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB &mdash; ready to import
                  {" "}<button
                    className="text-muted-foreground underline hover:text-foreground"
                    onClick={() => { setSelectedFile(null); setImportError(null); setImportSuccess(null); }}
                  >
                    Remove
                  </button>
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-5 w-5 text-muted-foreground/50" />
                <p className="text-xs font-medium text-muted-foreground">drop SEND study folder</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                      setImportError(null);
                      setImportSuccess(null);
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse...
                </button>
              </div>
            )}
          </div>

          {/* Description field */}
          <div className="flex items-start gap-3">
            <label className="shrink-0 pt-1.5 text-xs text-muted-foreground">Description</label>
            <textarea
              rows={2}
              placeholder="Optional study notes..."
              className="w-[260px] max-w-full resize rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Validation options */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={validate}
                onChange={(e) => setValidate(e.target.checked)}
                className="h-3 w-3"
              />
              Validate SEND compliance
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoFix}
                onChange={(e) => setAutoFix(e.target.checked)}
                className="h-3 w-3"
              />
              Attempt automatic fixes
            </label>
          </div>

          {/* Import button */}
          <button
            disabled={!selectedFile || importing}
            onClick={() => selectedFile && handleFile(selectedFile)}
            className={cn(
              "rounded-md px-4 py-2 text-xs font-medium",
              selectedFile && !importing
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-primary/50 text-primary-foreground/70 cursor-not-allowed"
            )}
          >
            {importing ? "Importing..." : "Import study"}
          </button>

          {importError && (
            <p className="text-xs text-red-600">{importError}</p>
          )}
          {importSuccess && (
            <p className="text-xs" style={{ color: "#16a34a" }}>{importSuccess}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteConfirmDialog({
  studyId,
  onConfirm,
  onCancel,
}: {
  studyId: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover p-6 shadow-xl">
        <h3 className="text-sm font-semibold">Confirm Deletion</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Delete study <span className="font-medium text-foreground">{studyId}</span> and all
          associated data? This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </>
  );
}

export function AppLandingPage() {
  const { data: studies, isLoading } = useStudies();
  const { data: portfolioStudies } = useStudyPortfolio();
  const { data: projects } = useProjects();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedStudyId, selectStudy } = useSelection();
  const { designMode, toggleDesignMode } = useDesignMode();
  const { data: scenarios } = useScenarios(designMode);
  const [projectFilter, setProjectFilter] = useState<string>("");

  const realStudies: DisplayStudy[] = (studies ?? []).map((s) => {
    // Try to calculate duration from start/end dates if available
    let durationWeeks: number | undefined = undefined;
    if (s.start_date && s.end_date) {
      try {
        const start = new Date(s.start_date);
        const end = new Date(s.end_date);
        const diffMs = end.getTime() - start.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        durationWeeks = Math.round(diffDays / 7);
      } catch (e) {
        // Invalid date format, leave undefined
      }
    }

    return {
      ...s,
      validation: "Not Run",
      // Populate portfolio-style fields from regular study data where available
      pipeline_stage: undefined, // Regular studies don't have pipeline stage
      duration_weeks: durationWeeks,
      noael_value: undefined, // Regular studies don't have NOAEL metadata
      portfolio_metadata: undefined,
    };
  });

  // Add portfolio studies (mock studies with metadata) to the list
  const portfolioDisplayStudies: DisplayStudy[] = (portfolioStudies ?? []).map((s) => {
    const resolvedNoael = noael(s);
    const noaelDisplay = resolvedNoael
      ? `${resolvedNoael.dose} ${resolvedNoael.unit}`
      : "—";
    const noaelWithSuffix = resolvedNoael && s.noael_derived && !s.noael_reported
      ? `${noaelDisplay} (d)`
      : noaelDisplay;

    return {
      study_id: s.id,
      name: s.title,
      domain_count: s.domains?.length ?? 0,
      species: s.species,
      study_type: s.study_type,
      protocol: s.protocol,
      standard: null,
      subjects: s.subjects,
      start_date: null,
      end_date: null,
      status: s.status,
      validation: s.validation ? (s.validation.errors > 0 ? "Fail" : s.validation.warnings > 0 ? "Warnings" : "Pass") : "Not Run",
      // Portfolio-specific fields
      pipeline_stage: s.pipeline_stage,
      duration_weeks: s.duration_weeks,
      noael_value: noaelWithSuffix,
      portfolio_metadata: s,
    };
  });

  const scenarioStudies: DisplayStudy[] = designMode
    ? (scenarios ?? []).map((s: ScenarioSummary) => ({
        study_id: s.scenario_id,
        name: s.name,
        domain_count: s.domain_count,
        species: s.species,
        study_type: s.study_type,
        protocol: null,
        standard: null,
        subjects: s.subjects,
        start_date: null,
        end_date: null,
        status: "Scenario",
        validation: s.validation_status,
      }))
    : [];

  const allStudiesUnfiltered: DisplayStudy[] = [...realStudies, ...portfolioDisplayStudies];

  // Filter by program if selected
  const allStudies: DisplayStudy[] = useMemo(() => {
    if (!projectFilter) return allStudiesUnfiltered;
    return allStudiesUnfiltered.filter((s) => s.portfolio_metadata?.project === projectFilter);
  }, [allStudiesUnfiltered, projectFilter]);

  const [contextMenu, setContextMenu] = useState<{
    study: DisplayStudy;
    x: number;
    y: number;
  } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(
    (study: DisplayStudy) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      clickTimerRef.current = setTimeout(() => {
        selectStudy(study.study_id);
        clickTimerRef.current = null;
      }, 250);
    },
    [selectStudy]
  );

  const handleDoubleClick = useCallback(
    (study: DisplayStudy) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      navigate(`/studies/${encodeURIComponent(study.study_id)}`);
    },
    [navigate]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, study: DisplayStudy) => {
      e.preventDefault();
      selectStudy(study.study_id);
      setContextMenu({ study, x: e.clientX, y: e.clientY });
    },
    [selectStudy]
  );

  const handleActionsClick = useCallback(
    (e: React.MouseEvent, study: DisplayStudy) => {
      e.stopPropagation();
      selectStudy(study.study_id);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setContextMenu({ study, x: rect.left, y: rect.bottom + 4 });
    },
    [selectStudy]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteStudy(deleteTarget);
      queryClient.invalidateQueries({ queryKey: ["studies"] });
    } catch {
      alert("Failed to delete study.");
    }
    setDeleteTarget(null);
  }, [deleteTarget, queryClient]);

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <div className="border-b bg-card px-8 py-8">
        <div className="flex items-start gap-10">
          <div className="flex shrink-0 items-start gap-4">
            <FlaskConical className="h-11 w-11 text-primary" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Preclinical Case</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Analyze and validate your SEND data
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Visualize and explore SEND data</li>
              <li>Identify patterns and trends</li>
              <li>Navigate study and subject level views</li>
              <li>Browse adverse events</li>
              <li>Validate SEND compliance</li>
            </ul>
            <a
              href="#"
              className="mt-2 inline-block pl-4 text-xs text-primary hover:underline"
              onClick={(e) => {
                e.preventDefault();
                alert("Documentation is not available in this prototype.");
              }}
            >
              Learn more &#x2197;
            </a>
          </div>
        </div>
      </div>

      {/* Import section */}
      <ImportSection defaultOpen={!isLoading && (studies ?? []).length === 0} />

      {/* Studies table */}
      <div className="px-8 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Studies ({allStudies.length + scenarioStudies.length})
          </h2>

          {/* Program Filter */}
          {projects && projects.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Program:</span>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="">All programs</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.compound})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : allStudies.length > 0 || scenarioStudies.length > 0 ? (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b bg-muted/30">
                  <th className="w-8 px-2 py-1.5"></th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Study</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Protocol</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Species</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stage</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subjects</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">NOAEL</th>
                  <th className="pl-5 pr-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {allStudies.map((study) => {
                  const isSelected = selectedStudyId === study.study_id;
                  return (
                    <tr
                      key={study.study_id}
                      className={cn(
                        "cursor-pointer border-b last:border-b-0 transition-colors hover:bg-accent/50",
                        isSelected && "bg-accent"
                      )}
                      onClick={() => handleClick(study)}
                      onDoubleClick={() => handleDoubleClick(study)}
                      onContextMenu={(e) => handleContextMenu(e, study)}
                    >
                      <td className="px-2 py-1 text-center">
                        <button
                          className="rounded p-0.5 hover:bg-accent"
                          onClick={(e) => handleActionsClick(e, study)}
                          title="Actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </td>
                      <td className="px-3 py-1 font-medium text-primary">{study.study_id}</td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {study.protocol && study.protocol !== "NOT AVAILABLE"
                          ? study.protocol
                          : "—"}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {study.species ?? "—"}
                      </td>
                      <td className="px-3 py-1">
                        {study.pipeline_stage ? (
                          <span style={{ color: getPipelineStageColor(study.pipeline_stage) }}>
                            {study.pipeline_stage.charAt(0).toUpperCase() + study.pipeline_stage.slice(1).replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
                        {study.subjects ?? "—"}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {study.duration_weeks ? `${study.duration_weeks}w` : "—"}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {study.study_type ?? "—"}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        {study.noael_value ?? "—"}
                      </td>
                      <td className="relative pl-5 pr-3 py-1 text-xs text-muted-foreground">
                        {study.status === "Complete" && (
                          <span
                            className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
                            style={{ background: "#16a34a" }}
                          />
                        )}
                        {study.status}
                      </td>
                    </tr>
                  );
                })}
                {scenarioStudies.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={9} className="px-3 py-0">
                        <div className="border-t border-dashed" />
                      </td>
                    </tr>
                    {scenarioStudies.map((study) => {
                      const isSelected = selectedStudyId === study.study_id;
                      return (
                        <tr
                          key={study.study_id}
                          className={cn(
                            "cursor-pointer border-b last:border-b-0 transition-colors hover:bg-accent/50",
                            isSelected && "bg-accent"
                          )}
                          onClick={() => handleClick(study)}
                          onDoubleClick={() => handleDoubleClick(study)}
                          onContextMenu={(e) => handleContextMenu(e, study)}
                        >
                          <td className="px-2 py-1 text-center">
                            <Wrench className="mx-auto h-3.5 w-3.5 text-muted-foreground/60" />
                          </td>
                          <td className="px-3 py-1 font-medium text-muted-foreground">{study.name}</td>
                          <td className="px-3 py-1 text-muted-foreground/60">{study.study_type ?? "—"}</td>
                          <td className="px-3 py-1 text-muted-foreground/60">—</td>
                          <td className="px-3 py-1 text-right tabular-nums text-muted-foreground/60">
                            {study.subjects ?? "—"}
                          </td>
                          <td className="px-3 py-1 text-muted-foreground/60">—</td>
                          <td className="px-3 py-1 text-muted-foreground/60">—</td>
                          <td className="px-3 py-1 text-xs text-muted-foreground/60">Scenario</td>
                          <td className="px-3 py-1">
                            <div
                              className="flex items-center justify-center"
                              title={VAL_DISPLAY[study.validation]?.tooltip ?? study.validation}
                            >
                              {VAL_DISPLAY[study.validation]?.icon ?? <span className="text-xs text-muted-foreground">—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border bg-card py-12 text-center">
            <FlaskConical className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No studies imported yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Import your first study to get started.
            </p>
          </div>
        )}

        {/* Design mode toggle */}
        <div className="mt-3 flex items-center gap-2">
          <Wrench className="h-3 w-3 text-muted-foreground/50" />
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={designMode}
              onChange={toggleDesignMode}
              className="h-3 w-3"
            />
            Design mode
          </label>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <StudyContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          study={contextMenu.study}
          onClose={() => setContextMenu(null)}
          onOpen={() => {
            setContextMenu(null);
            navigate(
              `/studies/${encodeURIComponent(contextMenu.study.study_id)}`
            );
          }}
          onDelete={() => {
            const id = contextMenu.study.study_id;
            setContextMenu(null);
            setDeleteTarget(id);
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmDialog
          studyId={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
