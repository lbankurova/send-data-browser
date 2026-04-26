import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FlaskConical, MoreVertical, ChevronRight, Upload, Loader2, GripVertical, Pencil,
  ArrowUp, ArrowDown, X, Search,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStudies } from "@/hooks/useStudies";
import { useStudyPortfolio } from "@/hooks/useStudyPortfolio";
import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { useProjects } from "@/hooks/useProjects";
import type { Project } from "@/hooks/useProjects";
import { useStudyPreferences, useRenameStudy, useUpdateStudyOrder, useUpdateTestArticleOverride } from "@/hooks/useStudyPreferences";
import { useSessionState } from "@/hooks/useSessionState";
import { cn } from "@/lib/utils";
import { useSelection } from "@/contexts/SelectionContext";
import { generateStudyReport } from "@/lib/report-generator";
import { importStudy, deleteStudy } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { noael } from "@/lib/study-accessors";
import {
  isFilterActive,
  describeFilter,
  matchesFilter,
  compareValues,
  type ColumnFilter,
} from "./studies-table-helpers";
import {
  COLUMN_BY_KEY,
  ColumnsMenu,
  DEFAULT_ORDER,
  DEFAULT_VISIBLE,
  FilterPopover,
  PresetsMenu,
  STUDY_COLUMNS,
  STUDY_COLUMNS_SCHEMA,
  studyLabel,
  type CellCtx,
  type DisplayStudy,
  type FilterMap,
  type SavedView,
  type SortState,
  type StudyColumn,
} from "./studies-table";


function StudyContextMenu({
  position,
  study,
  onClose,
  onOpen,
  onDelete,
  onRename,
  onResetName,
}: {
  position: { x: number; y: number };
  study: DisplayStudy;
  onClose: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onRename: () => void;
  onResetName: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const items: { label: string; icon?: React.ReactNode; action: () => void; disabled?: boolean; separator?: boolean; danger?: boolean }[] = [
    { label: "Open Study", action: onOpen },
    {
      label: "Rename...",
      icon: <Pencil className="h-3 w-3" />,
      action: onRename,
    },
    ...(study.display_name
      ? [{ label: "Reset Name", action: onResetName }]
      : []),
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
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent",
                item.danger && "text-red-600 hover:bg-red-50"
              )}
              onClick={item.action}
              disabled={item.disabled}
            >
              {item.icon && <span className="text-muted-foreground">{item.icon}</span>}
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [studyId, setStudyId] = useState("");
  const [importMode, setImportMode] = useState<"new" | "existing">("new");
  const [targetStudyId, setTargetStudyId] = useState("");
  const [validate, setValidate] = useState(true);
  const [autoFix, setAutoFix] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { data: studies } = useStudies();

  const isXpt = selectedFiles.length > 0 && selectedFiles[0].name.toLowerCase().endsWith(".xpt");
  const isZip = selectedFiles.length === 1 && selectedFiles[0].name.toLowerCase().endsWith(".zip");
  const canImport = selectedFiles.length > 0 && !importing && (
    isZip
    || (isXpt && importMode === "new" && studyId.trim())
    || (isXpt && importMode === "existing" && targetStudyId)
  );

  const handleFiles = useCallback(async (files: File[]) => {
    setImportError(null);
    setImportSuccess(null);
    setImporting(true);
    try {
      const isAppend = isXpt && importMode === "existing";
      const result = await importStudy(files, {
        validate,
        autoFix,
        studyId: isAppend ? targetStudyId : (studyId.trim() || undefined),
        append: isAppend || undefined,
      });
      const msg = isAppend
        ? `Added ${files.length} file${files.length > 1 ? "s" : ""} to ${result.study_id} (${result.domain_count} domains total${result.overwritten?.length ? `, replaced: ${result.overwritten.join(", ")}` : ""})`
        : `Imported ${result.study_id} (${result.domain_count} domains)`;
      setImportSuccess(msg);
      setSelectedFiles([]);
      setStudyId("");
      setTargetStudyId("");
      queryClient.invalidateQueries({ queryKey: ["studies"] });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [queryClient, validate, autoFix, studyId, importMode, targetStudyId, isXpt]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length) {
        setSelectedFiles(dropped);
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
                : selectedFiles.length
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
            ) : selectedFiles.length ? (
              <>
                <Upload className="h-5 w-5 text-primary/60" />
                <p className="text-xs font-medium">
                  {selectedFiles.length === 1
                    ? selectedFiles[0].name
                    : `${selectedFiles.length} .xpt files`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB &mdash; ready to import
                  {" "}<button
                    className="text-muted-foreground underline hover:text-foreground"
                    onClick={() => { setSelectedFiles([]); setStudyId(""); setTargetStudyId(""); setImportMode("new"); setImportError(null); setImportSuccess(null); }}
                  >
                    Remove
                  </button>
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-5 w-5 text-muted-foreground/50" />
                <p className="text-xs font-medium text-muted-foreground">drop .zip or .xpt files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.xpt"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    if (picked.length) {
                      setSelectedFiles(picked);
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

          {/* Study target — mode toggle for .xpt, simple ID for .zip */}
          {isXpt && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === "new"}
                    onChange={() => setImportMode("new")}
                    className="h-3 w-3"
                  />
                  New study
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === "existing"}
                    onChange={() => setImportMode("existing")}
                    className="h-3 w-3"
                  />
                  Add to existing study
                </label>
              </div>

              {importMode === "new" ? (
                <div className="flex items-center gap-3">
                  <label className="shrink-0 text-xs text-muted-foreground">Study ID</label>
                  <input
                    type="text"
                    value={studyId}
                    onChange={(e) => setStudyId(e.target.value)}
                    placeholder="required"
                    className={cn(
                      "w-[220px] max-w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none",
                      !studyId.trim() ? "border-amber-400" : "border-border/50"
                    )}
                  />
                  {!studyId.trim() && (
                    <span className="text-[10px] text-amber-600">required</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <label className="shrink-0 text-xs text-muted-foreground">Study</label>
                  <select
                    value={targetStudyId}
                    onChange={(e) => setTargetStudyId(e.target.value)}
                    className={cn(
                      "w-[220px] max-w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none",
                      !targetStudyId ? "border-amber-400 text-muted-foreground/50" : "border-border/50"
                    )}
                  >
                    <option value="">Select study...</option>
                    {studies?.map((s) => (
                      <option key={s.study_id} value={s.study_id}>
                        {s.display_name || s.name || s.study_id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          {isZip && (
            <div className="flex items-center gap-3">
              <label className="shrink-0 text-xs text-muted-foreground">Study ID</label>
              <input
                type="text"
                value={studyId}
                onChange={(e) => setStudyId(e.target.value)}
                placeholder={selectedFiles[0].name.replace(/\.zip$/i, "")}
                className="w-[220px] max-w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              />
            </div>
          )}

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
            disabled={!canImport}
            onClick={() => canImport && handleFiles(selectedFiles)}
            className={cn(
              "rounded-md px-4 py-2 text-xs font-medium",
              canImport
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
  const { data: prefs } = useStudyPreferences();
  const renameMutation = useRenameStudy();
  const orderMutation = useUpdateStudyOrder();
  const testArticleMutation = useUpdateTestArticleOverride();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedStudyId, selectedProjectId, selectStudy, selectProject } = useSelection();
  const [viewMode, setViewMode] = useState<"studies" | "portfolio">("studies");

  // Rename state
  const [renamingStudyId, setRenamingStudyId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop reorder state (rows)
  const [dragStudyId, setDragStudyId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Column controls — visible set, order, sort, filters, saved presets, test-article overrides
  const [visibleCols, setVisibleCols] = useSessionState<string[]>("alp.studies.cols.visible", DEFAULT_VISIBLE);
  const [colOrder, setColOrder] = useSessionState<string[]>("alp.studies.cols.order", DEFAULT_ORDER);
  const [sortState, setSortState] = useSessionState<SortState | null>("alp.studies.sort", null);
  const [filters, setFilters] = useSessionState<FilterMap>("alp.studies.filters", {});
  const [savedPresets, setSavedPresets] = useSessionState<Record<string, SavedView>>("alp.studies.presets", {});
  // Test-article overrides are persisted to StudyPreferences on the backend.
  const testArticleOverrides = prefs?.test_article_overrides ?? {};
  const [colsSchemaStamp, setColsSchemaStamp] = useSessionState<number>("alp.studies.cols.schema", 0);
  const [nameQuery, setNameQuery] = useSessionState<string>("alp.studies.nameQuery", "");

  // Column drag state
  const [dragColKey, setDragColKey] = useState<string | null>(null);
  const [dropColKey, setDropColKey] = useState<string | null>(null);

  // Test article inline-edit state
  const [editingTestArticle, setEditingTestArticle] = useState<string | null>(null);
  const [testArticleInputValue, setTestArticleInputValue] = useState("");
  const testArticleInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingTestArticle && testArticleInputRef.current) {
      testArticleInputRef.current.focus();
      testArticleInputRef.current.select();
    }
  }, [editingTestArticle]);

  // Test article right-click context menu
  const [testArticleCtxMenu, setTestArticleCtxMenu] = useState<{ studyId: string; x: number; y: number } | null>(null);

  const visibleSet = useMemo(() => new Set(visibleCols), [visibleCols]);

  // Repair column state if the registry changed since session was saved.
  // Keys are tightly coupled to the STUDY_COLUMNS registry, so on a schema bump we
  // reset visible/order to defaults. Filters, sort, and presets are left alone
  // (their invalid keys will be pruned lazily at lookup time).
  useEffect(() => {
    if (colsSchemaStamp !== STUDY_COLUMNS_SCHEMA) {
      setVisibleCols(DEFAULT_VISIBLE);
      setColOrder(DEFAULT_ORDER);
      setColsSchemaStamp(STUDY_COLUMNS_SCHEMA);
      return;
    }
    // Same schema: still defend against hand-edited sessionStorage by pruning unknowns
    // and appending any never-seen registry keys at the end.
    const known = new Set(STUDY_COLUMNS.map((c) => c.key));
    const filteredOrder = colOrder.filter((k) => known.has(k));
    const missing = STUDY_COLUMNS.map((c) => c.key).filter((k) => !filteredOrder.includes(k));
    if (filteredOrder.length !== colOrder.length || missing.length > 0) {
      setColOrder([...filteredOrder, ...missing]);
    }
    const visibleFixed = visibleCols.filter((k) => known.has(k));
    if (visibleFixed.length !== visibleCols.length) {
      setVisibleCols(visibleFixed);
    }
    // run once on mount — schema repair only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleOrderedCols = useMemo(
    () => colOrder.map((k) => COLUMN_BY_KEY.get(k)).filter((c): c is StudyColumn => !!c && visibleSet.has(c.key)),
    [colOrder, visibleSet]
  );

  // Project lookup for compound resolution
  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects ?? []) m.set(p.id, p);
    return m;
  }, [projects]);

  const cellCtxFor = useCallback(
    (s: DisplayStudy): CellCtx => ({
      project: s.portfolio_metadata?.project ? projectsById.get(s.portfolio_metadata.project) : undefined,
      testArticleOverride: testArticleOverrides[s.study_id],
    }),
    [projectsById, testArticleOverrides]
  );

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingStudyId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingStudyId]);

  const handleRenameStart = useCallback((study: DisplayStudy) => {
    setRenamingStudyId(study.study_id);
    setRenameValue(study.display_name ?? study.study_id);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (!renamingStudyId) return;
    const trimmed = renameValue.trim();
    // If empty or same as study_id, clear the display name
    const displayName = trimmed && trimmed !== renamingStudyId ? trimmed : null;
    renameMutation.mutate({ studyId: renamingStudyId, displayName });
    setRenamingStudyId(null);
  }, [renamingStudyId, renameValue, renameMutation]);

  const handleRenameCancel = useCallback(() => {
    setRenamingStudyId(null);
  }, []);

  // Build portfolio lookup so real studies can be linked to their portfolio metadata
  const portfolioById = useMemo(() => {
    const map = new Map<string, StudyMetadata>();
    for (const s of portfolioStudies ?? []) map.set(s.id, s);
    return map;
  }, [portfolioStudies]);

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
      } catch {
        // Invalid date format, leave undefined
      }
    }

    const pm = portfolioById.get(s.study_id);

    const n = pm ? noael(pm) : null;
    let noaelDisplay: string | undefined;
    if (n) {
      noaelDisplay = `${n.dose} ${n.unit}`;
    } else if (s.noael_dose_value != null && s.noael_dose_unit) {
      noaelDisplay = `${s.noael_dose_value} ${s.noael_dose_unit}`;
    } else if (s.noael_label) {
      noaelDisplay = s.noael_label === "Not established" ? "Not est." : s.noael_label;
    }
    return {
      ...s,
      validation: "Not Run",
      pipeline_stage: pm?.pipeline_stage,
      duration_weeks: pm?.duration_weeks ?? durationWeeks,
      noael_value: noaelDisplay,
      portfolio_metadata: pm,
    };
  });

  // Apply custom row order from user preferences.
  const allStudies: DisplayStudy[] = useMemo(() => {
    const order = prefs?.order;
    if (!order || order.length === 0) return realStudies;
    const orderIndex = new Map(order.map((id, i) => [id, i]));
    return [...realStudies].sort((a, b) => {
      const ai = orderIndex.get(a.study_id) ?? Infinity;
      const bi = orderIndex.get(b.study_id) ?? Infinity;
      return ai - bi;
    });
  }, [realStudies, prefs?.order]);

  const handleDrop = useCallback(
    (targetStudyId: string) => {
      if (!dragStudyId || dragStudyId === targetStudyId) {
        setDragStudyId(null);
        setDropTargetId(null);
        return;
      }
      const ids = allStudies.map((s) => s.study_id);
      const fromIdx = ids.indexOf(dragStudyId);
      const toIdx = ids.indexOf(targetStudyId);
      if (fromIdx === -1 || toIdx === -1) return;
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, dragStudyId);
      orderMutation.mutate(ids);
      setDragStudyId(null);
      setDropTargetId(null);
    },
    [dragStudyId, allStudies, orderMutation]
  );

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

  /* ── filter / sort pipeline ─────────────────────────────────── */

  const displayedStudies: DisplayStudy[] = useMemo(() => {
    // Name search — matches display_name or study_id (studyLabel resolves this).
    const q = nameQuery.trim().toLowerCase();
    const nameFiltered = q === "" ? allStudies : allStudies.filter(
      (s) => studyLabel(s).toLowerCase().includes(q)
    );

    // Apply column filters
    const activeFilterEntries = Object.entries(filters).filter(([, f]) => isFilterActive(f));
    const filtered = activeFilterEntries.length === 0 ? nameFiltered : nameFiltered.filter((s) => {
      for (const [key, f] of activeFilterEntries) {
        const col = COLUMN_BY_KEY.get(key);
        if (!col) continue;
        const v = col.value(s, cellCtxFor(s));
        if (!matchesFilter(col, v, f)) return false;
      }
      return true;
    });

    // Apply sort if active. When inactive, preserve the upstream order (drag-reordered).
    if (!sortState) return filtered;
    const col = COLUMN_BY_KEY.get(sortState.key);
    if (!col) return filtered;
    const dir = sortState.dir;
    return [...filtered].sort((a, b) =>
      compareValues(col.value(a, cellCtxFor(a)), col.value(b, cellCtxFor(b)), dir)
    );
  }, [allStudies, filters, sortState, cellCtxFor, nameQuery]);

  // Distinct values per category column (drives multi-select filter)
  const distinctValuesByCol = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const col of STUDY_COLUMNS) {
      if (col.type !== "category") continue;
      const seen = new Set<string>();
      for (const s of allStudies) {
        const v = col.value(s, cellCtxFor(s));
        if (v != null && v !== "") seen.add(String(v));
      }
      out[col.key] = [...seen].sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [allStudies, cellCtxFor]);

  /* ── column drag-to-reorder ─────────────────────────────────── */

  const handleColDrop = useCallback((targetKey: string) => {
    if (!dragColKey || dragColKey === targetKey) {
      setDragColKey(null);
      setDropColKey(null);
      return;
    }
    const next = [...colOrder];
    const fromIdx = next.indexOf(dragColKey);
    const toIdx = next.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragColKey);
    setColOrder(next);
    setDragColKey(null);
    setDropColKey(null);
  }, [dragColKey, colOrder, setColOrder]);

  /* ── sort cycle ─────────────────────────────────────────────── */

  const cycleSort = useCallback((key: string) => {
    setSortState((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;  // off
    });
  }, [setSortState]);

  /* ── filter handlers ────────────────────────────────────────── */

  const setColFilter = useCallback((key: string, f: ColumnFilter) => {
    setFilters((prev) => ({ ...prev, [key]: f }));
  }, [setFilters]);

  const clearColFilter = useCallback((key: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [setFilters]);

  const clearAllFilters = useCallback(() => setFilters({}), [setFilters]);

  /* ── saved presets ──────────────────────────────────────────── */

  const handleSavePreset = useCallback((name: string) => {
    const preset: SavedView = {
      visible: visibleCols,
      order: colOrder,
      sort: sortState,
      filters,
    };
    setSavedPresets((prev) => ({ ...prev, [name]: preset }));
  }, [visibleCols, colOrder, sortState, filters, setSavedPresets]);

  const handleApplyPreset = useCallback((name: string) => {
    const v = savedPresets[name];
    if (!v) return;
    setVisibleCols(v.visible);
    setColOrder(v.order);
    setSortState(v.sort);
    setFilters(v.filters);
  }, [savedPresets, setVisibleCols, setColOrder, setSortState, setFilters]);

  const handleDeletePreset = useCallback((name: string) => {
    setSavedPresets((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, [setSavedPresets]);

  const handleResetColOrder = useCallback(() => setColOrder(DEFAULT_ORDER), [setColOrder]);

  /* ── test article override ──────────────────────────────────── */

  const startEditTestArticle = useCallback((studyId: string) => {
    setTestArticleCtxMenu(null);
    setEditingTestArticle(studyId);
    const study = allStudies.find((s) => s.study_id === studyId);
    const existing = study ? (testArticleOverrides[studyId]
      ?? study.portfolio_metadata?.test_article
      ?? (study.portfolio_metadata?.project ? projectsById.get(study.portfolio_metadata.project)?.compound : null)
      ?? "") : "";
    setTestArticleInputValue(existing);
  }, [allStudies, projectsById, testArticleOverrides]);

  const commitTestArticle = useCallback(() => {
    if (!editingTestArticle) return;
    const trimmed = testArticleInputValue.trim();
    testArticleMutation.mutate({
      studyId: editingTestArticle,
      testArticle: trimmed || null,
    });
    setEditingTestArticle(null);
  }, [editingTestArticle, testArticleInputValue, testArticleMutation]);

  const cancelTestArticle = useCallback(() => setEditingTestArticle(null), []);

  const resetTestArticleOverride = useCallback((studyId: string) => {
    testArticleMutation.mutate({ studyId, testArticle: null });
    setTestArticleCtxMenu(null);
  }, [testArticleMutation]);

  /* ── filter pills (active filters summary) ──────────────────── */
  const activeFilterPills = useMemo(() => {
    return Object.entries(filters)
      .filter(([, f]) => isFilterActive(f))
      .map(([key, f]) => {
        const col = COLUMN_BY_KEY.get(key);
        return col ? { key, label: describeFilter(col, f) } : null;
      })
      .filter((x): x is { key: string; label: string } => !!x);
  }, [filters]);

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <div className="border-b bg-card px-8 py-8">
        <div className="flex items-start gap-10">
          <div className="flex shrink-0 items-start gap-4">
            <FlaskConical className="h-11 w-11 text-primary" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">SENDEX</h1>
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
              href="/learn-more.html"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block pl-4 text-xs text-primary hover:underline"
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
          <div className="flex items-center gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {viewMode === "studies"
                ? (displayedStudies.length === allStudies.length
                    ? `Studies (${allStudies.length})`
                    : `Studies (${displayedStudies.length} of ${allStudies.length})`)
                : `Programs (${(projects ?? []).length})`}
            </h2>

            {/* View mode toggle */}
            <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
              <button
                onClick={() => {
                  // Preserve selectedProjectId when switching FROM portfolio
                  // so the program-member row tint carries over into Studies.
                  // Only clear when already in Studies (explicit "clear selection").
                  if (viewMode === "studies") selectProject(null);
                  setViewMode("studies");
                }}
                className={cn(
                  "rounded px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                  viewMode === "studies"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Studies
              </button>
              <button
                onClick={() => setViewMode("portfolio")}
                className={cn(
                  "rounded px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                  viewMode === "portfolio"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Portfolio
              </button>
            </div>

            {viewMode === "studies" && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setNameQuery(""); }}
                  placeholder="Search studies..."
                  className="h-7 w-48 rounded border bg-background pl-6 pr-6 text-xs outline-none focus:border-ring"
                />
                {nameQuery && (
                  <button
                    onClick={() => setNameQuery("")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          {viewMode === "studies" && (
            <div className="flex items-center gap-3">
              <PresetsMenu
                presets={savedPresets}
                onApply={handleApplyPreset}
                onSaveCurrent={handleSavePreset}
                onDelete={handleDeletePreset}
              />
              <ColumnsMenu
                visible={visibleSet}
                order={colOrder}
                onChangeVisible={(next) => setVisibleCols([...next])}
                onResetOrder={handleResetColOrder}
              />
            </div>
          )}
        </div>

        {/* Active filter pills */}
        {viewMode === "studies" && activeFilterPills.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Filters:</span>
            {activeFilterPills.map((p) => (
              <span
                key={p.key}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] text-primary"
              >
                {p.label}
                <button
                  onClick={() => clearColFilter(p.key)}
                  className="rounded-full p-0.5 hover:bg-primary/20"
                  title="Remove filter"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <button
              onClick={clearAllFilters}
              className="text-[10px] text-muted-foreground hover:underline"
            >
              Clear all
            </button>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {displayedStudies.length} of {allStudies.length}
            </span>
          </div>
        )}

        {viewMode === "portfolio" ? (
          <ProgramList
            studies={portfolioStudies ?? []}
            projects={projects ?? []}
            selectedProjectId={selectedProjectId ?? ""}
            onProjectClick={(id) => {
              const isToggleOff = selectedProjectId === id;
              selectStudy(null);
              selectProject(isToggleOff ? null : id);
            }}
            onViewStudies={(id) => {
              setViewMode("studies");
              selectProject(id);
              selectStudy(null);
              // Program == test_article grouping. Apply a test_article filter matching the
              // program's compound so switching to Studies shows only its members — the
              // same outcome the old Program picker provided, using our real filter system.
              const p = projects?.find((x) => x.id === id);
              if (p?.compound) {
                setColFilter("test_article", { kind: "category", values: [p.compound] });
              }
            }}
          />
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : allStudies.length > 0 ? (
          <div className="max-h-[60vh] overflow-auto rounded-md border bg-card">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b bg-muted/30">
                  <th className="w-5 px-0 py-1"></th>
                  <th className="w-8 px-1.5 py-1"></th>
                  <th className="px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Study</th>
                  {visibleOrderedCols.map((col) => {
                    const isSorted = sortState?.key === col.key;
                    const isDropTarget = dropColKey === col.key && dragColKey !== col.key;
                    return (
                      <th
                        key={col.key}
                        title="Drag to reorder"
                        className={cn(
                          "px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground select-none cursor-grab active:cursor-grabbing",
                          col.align === "right" ? "text-right" : "text-left",
                          isDropTarget && "border-l-2 border-l-primary"
                        )}
                        draggable
                        onDragStart={(e) => {
                          setDragColKey(col.key);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (!dragColKey) return;
                          e.preventDefault();
                          setDropColKey(col.key);
                        }}
                        onDragLeave={() => {
                          if (dropColKey === col.key) setDropColKey(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleColDrop(col.key);
                        }}
                        onDragEnd={() => {
                          setDragColKey(null);
                          setDropColKey(null);
                        }}
                      >
                        <span className={cn("inline-flex items-center gap-1", col.align === "right" && "justify-end")}>
                          <button
                            onClick={() => cycleSort(col.key)}
                            className="inline-flex items-center gap-0.5 hover:text-foreground"
                            title={`Sort by ${col.label}`}
                          >
                            {col.label}
                            {isSorted && (sortState!.dir === "asc"
                              ? <ArrowUp className="h-2.5 w-2.5" />
                              : <ArrowDown className="h-2.5 w-2.5" />)}
                          </button>
                          <FilterPopover
                            col={col}
                            filter={filters[col.key]}
                            distinctValues={distinctValuesByCol[col.key] ?? []}
                            onChange={(f) => setColFilter(col.key, f)}
                            onClear={() => clearColFilter(col.key)}
                          />
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayedStudies.map((study) => {
                  const isSelected = selectedStudyId === study.study_id;
                  const isInSelectedProgram = !!selectedProjectId
                    && study.portfolio_metadata?.project === selectedProjectId
                    && !isSelected;
                  const isRenaming = renamingStudyId === study.study_id;
                  const isDragOver = dropTargetId === study.study_id && dragStudyId !== study.study_id;
                  const ctx = cellCtxFor(study);
                  return (
                    <tr
                      key={study.study_id}
                      className={cn(
                        "cursor-pointer border-b last:border-b-0 transition-colors hover:bg-accent/50",
                        isSelected && "bg-accent font-medium",
                        isInSelectedProgram && "bg-primary/5",
                        isDragOver && "border-t-2 border-t-primary"
                      )}
                      onClick={() => handleClick(study)}
                      onDoubleClick={() => handleDoubleClick(study)}
                      onContextMenu={(e) => handleContextMenu(e, study)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropTargetId(study.study_id);
                      }}
                      onDragLeave={() => {
                        if (dropTargetId === study.study_id) setDropTargetId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(study.study_id);
                      }}
                    >
                      {/* Drag handle */}
                      <td className="px-0 py-px text-center">
                        <span
                          draggable
                          onDragStart={(e) => {
                            setDragStudyId(study.study_id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragStudyId(null);
                            setDropTargetId(null);
                          }}
                          className="inline-flex cursor-grab rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
                          title="Drag to reorder"
                        >
                          <GripVertical className="h-3 w-3" />
                        </span>
                      </td>
                      <td className="px-1.5 py-px text-center">
                        <button
                          className="rounded p-0.5 hover:bg-accent"
                          onClick={(e) => handleActionsClick(e, study)}
                          title="Actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </td>
                      <td className="px-1.5 py-px font-medium text-primary">
                        {isRenaming ? (
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameConfirm();
                              if (e.key === "Escape") handleRenameCancel();
                            }}
                            onBlur={handleRenameConfirm}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full rounded border border-primary bg-background px-1 py-0 text-[11px] font-medium text-foreground outline-none"
                          />
                        ) : (
                          <span title={study.display_name ? study.study_id : undefined}>
                            {studyLabel(study)}
                          </span>
                        )}
                      </td>
                      {visibleOrderedCols.map((col) => {
                        const isTestArticle = col.key === "test_article";
                        const isEditingThisCell = isTestArticle && editingTestArticle === study.study_id;
                        const align = col.align === "right" ? "text-right" : "text-left";
                        const cellClass = cn("px-1.5 py-px", align, !col.render && "text-muted-foreground");
                        if (isEditingThisCell) {
                          return (
                            <td key={col.key} className={cellClass} onClick={(e) => e.stopPropagation()}>
                              <input
                                ref={testArticleInputRef}
                                value={testArticleInputValue}
                                onChange={(e) => setTestArticleInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitTestArticle();
                                  if (e.key === "Escape") cancelTestArticle();
                                }}
                                onBlur={commitTestArticle}
                                placeholder="test article"
                                className="w-full rounded border border-primary bg-background px-1 py-0 text-[11px] text-foreground outline-none"
                              />
                            </td>
                          );
                        }
                        if (isTestArticle) {
                          const v = col.value(study, ctx);
                          const overridden = !!ctx.testArticleOverride;
                          return (
                            <td
                              key={col.key}
                              className={cn(cellClass, "group/testart")}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setTestArticleCtxMenu({ studyId: study.study_id, x: e.clientX, y: e.clientY });
                              }}
                            >
                              {v == null ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); startEditTestArticle(study.study_id); }}
                                  className="text-[10px] italic text-muted-foreground/60 hover:text-primary"
                                  title="Click to add a test article (or right-click for more options)"
                                >
                                  + add test article
                                </button>
                              ) : (
                                <span className={cn(overridden && "italic", "inline-flex items-center gap-1")}>
                                  {v}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); startEditTestArticle(study.study_id); }}
                                    className="opacity-0 group-hover/testart:opacity-100 text-muted-foreground/60 hover:text-primary"
                                    title={overridden ? "Edit override (right-click to reset)" : "Override test article for this study"}
                                  >
                                    <Pencil className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              )}
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className={cellClass}>
                            {col.render
                              ? col.render(study, ctx)
                              : (() => {
                                  const v = col.value(study, ctx);
                                  return v == null || v === "" ? "—" : String(v);
                                })()}
                          </td>
                        );
                      })}
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
          onRename={() => {
            const study = contextMenu.study;
            setContextMenu(null);
            handleRenameStart(study);
          }}
          onResetName={() => {
            const id = contextMenu.study.study_id;
            setContextMenu(null);
            renameMutation.mutate({ studyId: id, displayName: null });
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

      {/* Test article right-click menu */}
      {testArticleCtxMenu && (() => {
        const hasOverride = !!testArticleOverrides[testArticleCtxMenu.studyId];
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setTestArticleCtxMenu(null)} />
            <div
              className="fixed z-50 min-w-[180px] rounded-md border bg-popover py-1 shadow-lg"
              style={{ left: testArticleCtxMenu.x, top: testArticleCtxMenu.y }}
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => startEditTestArticle(testArticleCtxMenu.studyId)}
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
                {hasOverride ? "Edit test article..." : "Add test article..."}
              </button>
              {hasOverride && (
                <button
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => resetTestArticleOverride(testArticleCtxMenu.studyId)}
                >
                  Reset to metadata default
                </button>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}


/* ── Program context menu ──────────────────────────────────────── */

function ProgramContextMenu({
  position,
  onClose,
  onViewStudies,
  onOpenFirstStudy,
  hasStudies,
}: {
  position: { x: number; y: number };
  onClose: () => void;
  onViewStudies: () => void;
  onOpenFirstStudy: () => void;
  hasStudies: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[200px] rounded-md border bg-popover py-1 shadow-lg"
        style={{ left: position.x, top: position.y }}
      >
        <button
          className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent"
          onClick={onViewStudies}
        >
          View studies
        </button>
        <button
          className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={onOpenFirstStudy}
          disabled={!hasStudies}
        >
          Open first study
        </button>
        <div className="my-1 border-t" />
        <button
          className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={() => { onClose(); alert("CSV/Excel export coming soon."); }}
          disabled
        >
          Export...
        </button>
      </div>
    </>
  );
}

function formatStage(stage: string): string {
  switch (stage) {
    case "submitted": return "Submitted";
    case "pre_submission": return "Pre-submission";
    case "ongoing": return "Ongoing";
    case "planned": return "Planned";
    default: return stage;
  }
}

/* ── Program list (Portfolio mode) ────────────────────────────── */

function ProgramList({
  studies,
  projects,
  selectedProjectId,
  onProjectClick,
  onViewStudies,
}: {
  studies: StudyMetadata[];
  projects: Project[];
  selectedProjectId: string;
  onProjectClick: (id: string) => void;
  onViewStudies: (projectId: string) => void;
}) {
  const navigate = useNavigate();
  const [contextMenu, setContextMenu] = useState<{
    programId: string;
    firstStudyId: string | null;
    x: number;
    y: number;
  } | null>(null);

  // Build program summaries from studies
  const programs = useMemo(() => {
    const byProject = new Map<string, StudyMetadata[]>();
    for (const s of studies) {
      if (!s.project) continue;
      let arr = byProject.get(s.project);
      if (!arr) { arr = []; byProject.set(s.project, arr); }
      arr.push(s);
    }
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const result: {
      id: string;
      name: string;
      compound: string;
      therapeuticArea: string;
      species: string[];
      studyCount: number;
      lowestNoael: { dose: number; unit: string } | null;
      stageSummary: string;
      firstStudyId: string | null;
    }[] = [];
    for (const [pid, arr] of byProject) {
      const p = projectMap.get(pid);
      const species = [...new Set(arr.map((s) => s.species).filter(Boolean) as string[])].sort();

      // Lowest NOAEL across program studies
      let lowestNoael: { dose: number; unit: string } | null = null;
      for (const s of arr) {
        const n = noael(s);
        if (n && (lowestNoael === null || n.dose < lowestNoael.dose)) {
          lowestNoael = { dose: n.dose, unit: n.unit };
        }
      }

      // Stage summary — count per stage, compact text
      const stageCounts = new Map<string, number>();
      for (const s of arr) {
        stageCounts.set(s.pipeline_stage, (stageCounts.get(s.pipeline_stage) ?? 0) + 1);
      }
      const stageOrder = ["submitted", "pre_submission", "ongoing", "planned"];
      const stageParts: string[] = [];
      for (const stage of stageOrder) {
        const count = stageCounts.get(stage);
        if (count) stageParts.push(`${count} ${formatStage(stage).toLowerCase()}`);
      }
      for (const [stage, count] of stageCounts) {
        if (!stageOrder.includes(stage)) stageParts.push(`${count} ${stage}`);
      }

      result.push({
        id: pid,
        name: p?.name ?? pid,
        compound: p?.compound ?? "",
        therapeuticArea: p?.therapeutic_area ?? "",
        species,
        studyCount: arr.length,
        lowestNoael,
        stageSummary: stageParts.join(", "),
        firstStudyId: arr[0]?.id ?? null,
      });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [studies, projects]);

  const handleContextMenu = useCallback((e: React.MouseEvent, prog: typeof programs[0]) => {
    e.preventDefault();
    onProjectClick(prog.id);
    setContextMenu({ programId: prog.id, firstStudyId: prog.firstStudyId, x: e.clientX, y: e.clientY });
  }, [onProjectClick]);

  const handleActionsClick = useCallback((e: React.MouseEvent, prog: typeof programs[0]) => {
    e.stopPropagation();
    onProjectClick(prog.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ programId: prog.id, firstStudyId: prog.firstStudyId, x: rect.left, y: rect.bottom + 4 });
  }, [onProjectClick]);

  const handleDoubleClick = useCallback((prog: typeof programs[0]) => {
    onViewStudies(prog.id);
  }, [onViewStudies]);

  if (programs.length === 0) {
    return (
      <div className="rounded-md border bg-card py-12 text-center">
        <p className="text-xs text-muted-foreground">No programs detected. Import studies with TS domain metadata.</p>
      </div>
    );
  }

  return (
    <>
      <div className="max-h-[60vh] overflow-auto rounded-md border bg-card">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b bg-muted/30">
              <th className="w-8 px-1.5 py-1"></th>
              <th className="px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Program</th>
              <th className="px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Compound</th>
              <th className="px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Area</th>
              <th className="px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Species</th>
              <th className="px-1.5 py-1 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Studies</th>
              <th className="px-1.5 py-1 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">NOAEL</th>
              <th className="px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stage</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((prog) => (
              <tr
                key={prog.id}
                className={cn(
                  "cursor-pointer border-b last:border-b-0 transition-colors hover:bg-accent/50",
                  selectedProjectId === prog.id && "bg-accent"
                )}
                onClick={() => onProjectClick(prog.id)}
                onDoubleClick={() => handleDoubleClick(prog)}
                onContextMenu={(e) => handleContextMenu(e, prog)}
              >
                <td className="px-1.5 py-1 text-center">
                  <button
                    className="rounded p-0.5 hover:bg-accent"
                    onClick={(e) => handleActionsClick(e, prog)}
                    title="Actions"
                  >
                    <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </td>
                <td className="px-1.5 py-1 font-medium text-primary">{prog.name}</td>
                <td className="px-1.5 py-1 text-muted-foreground">{prog.compound || "—"}</td>
                <td className="px-1.5 py-1 text-muted-foreground">{prog.therapeuticArea || "—"}</td>
                <td className="px-1.5 py-1 text-muted-foreground">{prog.species.join(", ") || "—"}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{prog.studyCount}</td>
                <td className="px-1.5 py-1 text-right font-mono tabular-nums">
                  {prog.lowestNoael
                    ? <span style={{ color: "#8CD4A2" }} className="font-medium">{prog.lowestNoael.dose} {prog.lowestNoael.unit}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-1.5 py-1 text-muted-foreground">{prog.stageSummary || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contextMenu && (
        <ProgramContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onViewStudies={() => {
            const id = contextMenu.programId;
            setContextMenu(null);
            onViewStudies(id);
          }}
          onOpenFirstStudy={() => {
            const studyId = contextMenu.firstStudyId;
            setContextMenu(null);
            if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}`);
          }}
          hasStudies={!!contextMenu.firstStudyId}
        />
      )}
    </>
  );
}
