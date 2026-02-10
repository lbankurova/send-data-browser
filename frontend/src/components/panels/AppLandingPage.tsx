import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, MoreVertical, Check, X, TriangleAlert, ChevronRight, Upload, Loader2, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStudies } from "@/hooks/useStudies";
import { cn } from "@/lib/utils";
import { useSelection } from "@/contexts/SelectionContext";
import { generateStudyReport } from "@/lib/report-generator";
import { importStudy, deleteStudy } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudySummary } from "@/types";

function formatStandard(raw: string | null): string {
  if (!raw) return "—";
  const match = raw.match(/(\d+\.\d+)/);
  return match ? `SEND ${match[1]}` : raw;
}

const VAL_DISPLAY: Record<string, { icon: React.ReactNode; tooltip: string }> = {
  Pass: { icon: <Check className="h-3.5 w-3.5" style={{ color: "#16a34a" }} />, tooltip: "SEND validation passed" },
  Warnings: { icon: <TriangleAlert className="h-3.5 w-3.5" style={{ color: "#d97706" }} />, tooltip: "Passed with warnings" },
  Fail: { icon: <X className="h-3.5 w-3.5" style={{ color: "#dc2626" }} />, tooltip: "SEND validation failed" },
  "Not Run": { icon: <span className="text-xs text-muted-foreground">—</span>, tooltip: "Not validated" },
};

type DisplayStudy = StudySummary & { validation: string };

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

  const detectedStudyId = selectedFile
    ? selectedFile.name.replace(/\.zip$/i, "")
    : null;

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
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 transition-colors",
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
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Importing study...</p>
              </>
            ) : selectedFile ? (
              <>
                <Upload className="h-8 w-8 text-primary/60" />
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB &mdash; ready to import
                </p>
                <button
                  className="mt-1 text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => { setSelectedFile(null); setImportError(null); setImportSuccess(null); }}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Drop SEND study folder here
                </p>
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
              </>
            )}
          </div>

          {/* Metadata fields */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <label className="w-20 shrink-0 text-xs text-muted-foreground">Study ID</label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked disabled className="h-3 w-3" />
                Auto-detect
              </label>
              <input
                type="text"
                readOnly
                value={detectedStudyId ?? ""}
                placeholder="Detected from filename"
                className="h-7 flex-1 rounded-md border bg-muted/50 px-2 text-xs text-muted-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-20 shrink-0 text-xs text-muted-foreground">Protocol</label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked disabled className="h-3 w-3" />
                Auto-detect
              </label>
              <input
                type="text"
                readOnly
                placeholder="Detected from TS domain"
                className="h-7 flex-1 rounded-md border bg-muted/50 px-2 text-xs text-muted-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-20 shrink-0 text-xs text-muted-foreground">Description</label>
              <input
                type="text"
                placeholder="Optional description"
                className="h-7 flex-1 rounded-md border bg-muted/50 px-2 text-xs text-muted-foreground placeholder:text-muted-foreground/50"
              />
            </div>
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedStudyId, selectStudy } = useSelection();
  const realStudies: DisplayStudy[] = (studies ?? []).map((s) => ({
    ...s,
    validation: "Not Run",
  }));

  const demoStudies: DisplayStudy[] = [
    {
      study_id: "DEMO-Pass",
      name: "DEMO-Pass",
      domain_count: 12,
      species: "Rat",
      study_type: "28-Day Oral Toxicity",
      protocol: "PRO-2025-001",
      standard: "3.1",
      subjects: 80,
      start_date: "2025-01-15",
      end_date: "2025-03-10",
      status: "Complete",
      validation: "Pass",
    },
    {
      study_id: "DEMO-Warnings",
      name: "DEMO-Warnings",
      domain_count: 9,
      species: "Dog",
      study_type: "13-Week Oral Toxicity",
      protocol: "PRO-2025-002",
      standard: "3.1",
      subjects: 32,
      start_date: "2025-02-01",
      end_date: "2025-05-20",
      status: "Complete",
      validation: "Warnings",
    },
    {
      study_id: "DEMO-Fail",
      name: "DEMO-Fail",
      domain_count: 7,
      species: "Mouse",
      study_type: "Carcinogenicity",
      protocol: "PRO-2024-018",
      standard: "3.0",
      subjects: 200,
      start_date: "2024-06-01",
      end_date: "2025-01-30",
      status: "Complete",
      validation: "Fail",
    },
    {
      study_id: "DEMO-NotRun",
      name: "DEMO-NotRun",
      domain_count: 5,
      species: "Rabbit",
      study_type: "Embryo-Fetal Development",
      protocol: "PRO-2025-007",
      standard: "3.1",
      subjects: 44,
      start_date: "2025-04-01",
      end_date: null,
      status: "Ongoing",
      validation: "Not Run",
    },
  ];

  const allStudies: DisplayStudy[] = [...realStudies, ...demoStudies];

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
            <FlaskConical className="mt-0.5 h-12 w-12 text-primary" />
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
            Studies ({allStudies.length})
          </h2>
          <button
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Collapse/expand all studies in tree"
            onClick={() => {
              /* Tree expand/collapse — wired when shared state is available */
            }}
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : allStudies.length > 0 ? (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b bg-muted/30">
                  <th className="w-8 px-2 py-1.5"></th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Study</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Protocol</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Standard</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subjects</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Start</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">End</th>
                  <th className="pl-5 pr-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Val</th>
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
                      <td className="px-3 py-1 font-medium">{study.study_id}</td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {study.protocol && study.protocol !== "NOT AVAILABLE"
                          ? study.protocol
                          : "—"}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {formatStandard(study.standard)}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
                        {study.subjects ?? "—"}
                      </td>
                      <td className="px-3 py-1 tabular-nums text-muted-foreground">
                        {study.start_date ?? "—"}
                      </td>
                      <td className="px-3 py-1 tabular-nums text-muted-foreground">
                        {study.end_date ?? "—"}
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
