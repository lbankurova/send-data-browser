import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, MoreVertical, Check, X, TriangleAlert, ChevronRight, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStudies } from "@/hooks/useStudies";
import { useSelection } from "@/contexts/SelectionContext";
import { generateStudyReport } from "@/lib/report-generator";
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

type DisplayStudy = StudySummary & { validation: string; demo?: boolean };

const DEMO_STUDIES: DisplayStudy[] = [
  {
    study_id: "DART-2024-0091",
    name: "DART-2024-0091",
    domain_count: 22,
    species: "Rat",
    study_type: "Reproductive",
    protocol: "DART-091-GLP",
    standard: "SEND 3.1",
    subjects: 240,
    start_date: "2024-03-11",
    end_date: "2024-09-28",
    status: "Complete",
    validation: "Pass",
    demo: true,
  },
  {
    study_id: "CARDIO-TX-1147",
    name: "CARDIO-TX-1147",
    domain_count: 18,
    species: "Dog",
    study_type: "Chronic",
    protocol: "CRD-1147-28D",
    standard: "SEND 3.1.1",
    subjects: 32,
    start_date: "2024-06-01",
    end_date: "2024-12-15",
    status: "Complete",
    validation: "Warnings",
    demo: true,
  },
  {
    study_id: "ONCO-MTD-3382",
    name: "ONCO-MTD-3382",
    domain_count: 14,
    species: "Mouse",
    study_type: "Carcinogenicity",
    protocol: "ONC-3382-MTD",
    standard: "SEND 3.0",
    subjects: 400,
    start_date: "2023-11-20",
    end_date: null,
    status: "Ongoing",
    validation: "Fail",
    demo: true,
  },
  {
    study_id: "NEURO-PK-0256",
    name: "NEURO-PK-0256",
    domain_count: 9,
    species: "Rat",
    study_type: "Neurotoxicity",
    protocol: "NPK-256-7D",
    standard: "SEND 3.1.1",
    subjects: 60,
    start_date: "2025-01-06",
    end_date: null,
    status: "Ongoing",
    validation: "Not Run",
    demo: true,
  },
];

function StudyContextMenu({
  position,
  study,
  onClose,
  onOpen,
}: {
  position: { x: number; y: number };
  study: DisplayStudy;
  onClose: () => void;
  onOpen: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDemo = !!study.demo;
  const items: { label: string; action: () => void; disabled?: boolean; separator?: boolean }[] = [
    { label: "Open Study", action: onOpen, disabled: isDemo },
    {
      label: "Open Validation Report",
      action: () => {
        onClose();
        navigate(`/studies/${encodeURIComponent(study.study_id)}/validation`);
      },
      disabled: isDemo,
    },
    {
      label: "Generate Report",
      action: () => {
        onClose();
        generateStudyReport(study.study_id);
      },
      disabled: isDemo,
    },
    { label: "Share...", action: () => onClose(), disabled: true },
    {
      label: "Export...",
      action: () => {
        onClose();
        if (!isDemo) alert("CSV/Excel export coming soon.");
      },
      disabled: isDemo,
    },
    {
      label: "Re-validate SEND...",
      action: () => {
        onClose();
        navigate(`/studies/${encodeURIComponent(study.study_id)}/validation`);
        // Fire-and-forget: re-run validation in background, then refresh the view
        fetch(`/api/studies/${encodeURIComponent(study.study_id)}/validate`, { method: "POST" })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["validation-results", study.study_id] });
            queryClient.invalidateQueries({ queryKey: ["affected-records", study.study_id] });
          });
      },
      disabled: isDemo,
    },
    { label: "Delete", action: () => onClose(), disabled: true, separator: true },
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
              className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-[var(--hover-bg)] disabled:opacity-40 disabled:hover:bg-transparent"
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
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 py-8">
            <Upload className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Drop SEND study folder here
            </p>
            <button
              className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              onClick={() => alert("File browser is not available in this prototype. Drop a SEND folder above.")}
            >
              Browse...
            </button>
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
                disabled
                placeholder="Detected from DM domain"
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
                disabled
                placeholder="Detected from TS domain"
                className="h-7 flex-1 rounded-md border bg-muted/50 px-2 text-xs text-muted-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-20 shrink-0 text-xs text-muted-foreground">Description</label>
              <input
                type="text"
                disabled
                placeholder="Optional description"
                className="h-7 flex-1 rounded-md border bg-muted/50 px-2 text-xs text-muted-foreground placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          {/* Validation options */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked disabled className="h-3 w-3" />
              Validate SEND compliance
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" disabled className="h-3 w-3" />
              Attempt automatic fixes
            </label>
          </div>

          {/* Import button */}
          <button
            disabled
            title="Import not available in prototype"
            className="rounded-md bg-primary/50 px-4 py-2 text-xs font-medium text-primary-foreground/70 cursor-not-allowed"
          >
            Import study
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLandingPage() {
  const { data: studies, isLoading } = useStudies();
  const navigate = useNavigate();
  const { selectedStudyId, selectStudy } = useSelection();
  const allStudies: DisplayStudy[] = [
    ...(studies ?? []).map((s) => ({ ...s, validation: "Pass" })),
    ...DEMO_STUDIES,
  ];

  const [contextMenu, setContextMenu] = useState<{
    study: DisplayStudy;
    x: number;
    y: number;
  } | null>(null);

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
      if (study.demo) return;
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

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <div className="border-b bg-card px-8 py-8">
        <div className="flex items-start gap-10">
          <div className="flex shrink-0 items-start gap-4">
            <FlaskConical className="mt-0.5 h-12 w-12" style={{ color: "#3a7bd5" }} />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Preclinical Case</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Analyze and validate your SEND data
              </p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Visualize and explore SEND data</li>
              <li>Identify patterns and trends</li>
              <li>Navigate study and subject level views</li>
              <li>Browse adverse events</li>
              <li>Validate SEND compliance</li>
            </ul>
            <a
              href="#"
              className="mt-2 inline-block pl-4 text-sm hover:underline"
              style={{ color: "#3a7bd5" }}
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
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Studies ({allStudies.length})
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : allStudies.length > 0 ? (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b" style={{ background: "#f8f8f8" }}>
                  <th className="w-8 px-2 py-2.5"></th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Study</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Protocol</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Standard</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Subjects</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Start</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">End</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">Val</th>
                </tr>
              </thead>
              <tbody>
                {allStudies.map((study) => {
                  const isSelected = selectedStudyId === study.study_id;
                  return (
                    <tr
                      key={study.study_id}
                      className="cursor-pointer border-b last:border-b-0 transition-colors"
                      style={{
                        background: isSelected
                          ? "var(--selection-bg)"
                          : undefined,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected)
                          (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = isSelected
                          ? "var(--selection-bg)"
                          : "";
                      }}
                      onClick={() => handleClick(study)}
                      onDoubleClick={() => handleDoubleClick(study)}
                      onContextMenu={(e) => handleContextMenu(e, study)}
                    >
                      <td className="px-2 py-2 text-center">
                        <button
                          className="rounded p-0.5 hover:bg-[var(--accent)]"
                          onClick={(e) => handleActionsClick(e, study)}
                          title="Actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </td>
                      <td className="px-3 py-2 font-medium">{study.study_id}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {study.protocol && study.protocol !== "NOT AVAILABLE"
                          ? study.protocol
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatStandard(study.standard)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {study.subjects ?? "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {study.start_date ?? "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {study.end_date ?? "—"}
                      </td>
                      <td className="relative pl-5 pr-3 py-2 text-xs text-muted-foreground">
                        {study.status === "Complete" && (
                          <span
                            className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
                            style={{ background: "#16a34a" }}
                          />
                        )}
                        {study.status}
                      </td>
                      <td className="px-3 py-2">
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
        />
      )}
    </div>
  );
}
