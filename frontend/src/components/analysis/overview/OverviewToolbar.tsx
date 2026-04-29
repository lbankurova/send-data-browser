/**
 * Overview header toolbar — chip strip (left) + Commentary toggle, Notes
 * badge, Generate report button (right). Always renders, regardless of
 * Commentary state.
 *
 * Spec: docs/_internal/incoming/overview-executive-summary-redesign-synthesis.md
 * Section 1 ("Header toolbar"). Toggle persistence + study-scoped key are
 * owned by the parent — this component is presentation only.
 */

import { FileText, Info } from "lucide-react";
import { PanePillToggle } from "@/components/ui/PanePillToggle";

export type CommentaryMode = "on" | "off";

interface OverviewToolbarProps {
  /** Pre-formatted chip strings (left → right). Empty/null entries are skipped. */
  chips: (string | null)[];
  commentary: CommentaryMode;
  onCommentaryChange: (v: CommentaryMode) => void;
  /** True when the study has a non-empty user note. */
  hasNote: boolean;
  onNotesClick: () => void;
  onGenerate: () => void;
}

export function OverviewToolbar({
  chips,
  commentary,
  onCommentaryChange,
  hasNote,
  onNotesClick,
  onGenerate,
}: OverviewToolbarProps) {
  const visibleChips = chips.filter((c): c is string => !!c);
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
      {/* Left: chip strip */}
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {visibleChips.map((chip, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">·</span>}
            <span className={i === 0 ? "font-semibold text-foreground" : undefined}>
              {chip}
            </span>
          </span>
        ))}
      </div>

      {/* Right: Commentary toggle + Notes badge + Generate report */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Commentary</span>
          <PanePillToggle<CommentaryMode>
            value={commentary}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
            onChange={onCommentaryChange}
          />
          <button
            type="button"
            tabIndex={0}
            aria-label="About commentary"
            title="System commentary is deterministic — generated from analytical outputs by versioned templates."
            className="inline-flex h-3.5 w-3.5 items-center justify-center text-muted-foreground/70 hover:text-muted-foreground focus-visible:text-muted-foreground focus:outline-none"
          >
            <Info className="h-3 w-3" />
          </button>
        </div>

        {hasNote && (
          <button
            type="button"
            onClick={onNotesClick}
            title="Open study-level notes"
            className="rounded border border-muted bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent/30"
          >
            Note
          </button>
        )}

        <button
          type="button"
          onClick={onGenerate}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
        >
          <FileText className="h-3.5 w-3.5" />
          Generate report
        </button>
      </div>
    </div>
  );
}
