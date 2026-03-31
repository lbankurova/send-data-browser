import { useState, useRef, useEffect } from "react";
import { useStudyTypeOverride } from "@/hooks/useStudyTypeOverride";
import {
  routeStudyTypeWithQuality,
  getAllStudyTypeConfigs,
} from "@/lib/study-type-registry";
import type { StudyTypeRouting } from "@/types/pipeline-contracts";

/**
 * Displays the resolved study type with fallback indicator and right-click override.
 *
 * - Direct match: plain display name
 * - Fallback: display name + amber "(fallback)" badge, tooltip shows raw SSTYP
 * - Override: display name + violet corner triangle
 */
export function StudyTypeLabel({
  studyId,
  rawSstyp,
}: {
  studyId: string;
  rawSstyp: string | null | undefined;
}) {
  const { override, save, clear } = useStudyTypeOverride(studyId);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const routing: StudyTypeRouting = routeStudyTypeWithQuality(
    rawSstyp ?? null,
    override?.study_type,
  );

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setMenuOpen(true);
  }

  function handleSelect(configId: string) {
    // If selecting the same as auto-detected, clear override instead
    const autoRouting = routeStudyTypeWithQuality(rawSstyp ?? null);
    if (configId === autoRouting.config.study_type) {
      clear();
    } else {
      save(configId, "User override");
    }
    setMenuOpen(false);
  }

  function handleClear() {
    clear();
    setMenuOpen(false);
  }

  const allConfigs = getAllStudyTypeConfigs();

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span
        className={`cursor-context-menu select-all rounded-sm px-1 bg-violet-100/50 ${
          routing.match === "override" ? "cell-overridable" : ""
        }`}
        onContextMenu={handleContextMenu}
        title={
          routing.match === "fallback"
            ? `TS.SSTYP "${rawSstyp}" not recognized. Defaulting to ${routing.config.display_name}. Right-click to override.`
            : routing.match === "override"
              ? `Overridden by user. Original TS.SSTYP: "${rawSstyp}". Right-click to change or clear.`
              : `Right-click to override`
        }
      >
        {routing.config.display_name}
      </span>

      {routing.match === "fallback" && (
        <span
          className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700"
          title={`Unrecognized SSTYP: "${rawSstyp}"`}
        >
          fallback
        </span>
      )}

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-md border bg-popover p-1 shadow-md"
        >
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Study type
          </div>
          {allConfigs.map((cfg) => (
            <button
              key={cfg.study_type}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${
                routing.config.study_type === cfg.study_type
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
              onClick={() => handleSelect(cfg.study_type)}
            >
              <span className="flex-1">{cfg.display_name}</span>
              {routing.config.study_type === cfg.study_type && (
                <span className="text-xs">&#10003;</span>
              )}
            </button>
          ))}
          {override && (
            <>
              <div className="my-1 border-t" />
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
                onClick={handleClear}
              >
                Clear override
              </button>
            </>
          )}
          {rawSstyp && (
            <div className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
              TS.SSTYP: {rawSstyp}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
