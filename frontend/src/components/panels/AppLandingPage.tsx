import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, MoreVertical } from "lucide-react";
import { useStudies } from "@/hooks/useStudies";
import { useSelection } from "@/contexts/SelectionContext";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudySummary } from "@/types";

function formatStandard(raw: string | null): string {
  if (!raw) return "—";
  const match = raw.match(/(\d+\.\d+)/);
  return match ? `SEND ${match[1]}` : raw;
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === "Complete"
      ? { background: "#4caf5018", color: "#2e7d32" }
      : status === "Failed" || status === "Invalid"
        ? { background: "#e5393518", color: "#c62828" }
        : { background: "#f0f0f0", color: "#5f5f5f" };
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
      style={style}
    >
      {status}
    </span>
  );
}

function StudyContextMenu({
  position,
  onClose,
  onOpen,
}: {
  position: { x: number; y: number };
  onClose: () => void;
  onOpen: () => void;
}) {
  const items: { label: string; action: () => void; disabled?: boolean; separator?: boolean }[] = [
    { label: "Open Study", action: onOpen },
    { label: "Open Validation Report", action: () => onClose(), disabled: true },
    { label: "Share...", action: () => onClose(), disabled: true },
    { label: "Export...", action: () => onClose(), disabled: true },
    { label: "Re-validate SEND...", action: () => onClose(), disabled: true },
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

export function AppLandingPage() {
  const { data: studies, isLoading } = useStudies();
  const navigate = useNavigate();
  const { selectedStudyId, selectStudy } = useSelection();

  const [contextMenu, setContextMenu] = useState<{
    study: StudySummary;
    x: number;
    y: number;
  } | null>(null);

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(
    (study: StudySummary) => {
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
    (study: StudySummary) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      navigate(`/studies/${encodeURIComponent(study.study_id)}`);
    },
    [navigate]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, study: StudySummary) => {
      e.preventDefault();
      selectStudy(study.study_id);
      setContextMenu({ study, x: e.clientX, y: e.clientY });
    },
    [selectStudy]
  );

  const handleActionsClick = useCallback(
    (e: React.MouseEvent, study: StudySummary) => {
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
        <div className="flex items-center gap-10">
          <div className="flex shrink-0 items-center gap-4">
            <FlaskConical className="h-12 w-12" style={{ color: "#3a7bd5" }} />
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
              className="mt-2 inline-block text-sm hover:underline"
              style={{ color: "#3a7bd5" }}
              onClick={(e) => e.preventDefault()}
            >
              Learn more &#x2197;
            </a>
          </div>
        </div>
      </div>

      {/* Studies table */}
      <div className="px-8 py-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Studies ({studies?.length ?? 0})
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : studies && studies.length > 0 ? (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead>
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
                {studies.map((study) => {
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
                      <td className="px-3 py-2">
                        <StatusPill status={study.status} />
                      </td>
                      <td className="px-3 py-2 text-center text-muted-foreground">
                        —
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
