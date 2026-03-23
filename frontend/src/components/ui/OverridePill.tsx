import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ── OverridePill ─────────────────────────────────────────────

export interface OverridePillProps {
  isOverridden: boolean;
  note?: string;
  user?: string;
  timestamp?: string;
  onSaveNote: (text: string) => void;
  placeholder?: string;
  /** Auto-open the note popover on mount (used by mortality revert → update flow). */
  autoOpen?: boolean;
  onAutoOpened?: () => void;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
}

export function OverridePill({
  isOverridden,
  note,
  user,
  timestamp,
  onSaveNote,
  placeholder,
  autoOpen,
  onAutoOpened,
  popoverSide = "right",
  popoverAlign = "start",
}: OverridePillProps) {
  const [draft, setDraft] = useState(note ?? "");
  const [open, setOpen] = useState(autoOpen ?? false);

  if (!isOverridden) return null;

  // Handle auto-open trigger (parent sets autoOpen, we open once then clear)
  if (autoOpen && !open) {
    setOpen(true);
    setDraft(note ?? "");
    onAutoOpened?.();
  }

  const hasNote = (note?.length ?? 0) > 0;

  // Build tooltip (intercepted by GlobalTooltip)
  const tooltipParts: string[] = [];
  if (hasNote) tooltipParts.push(`Note: ${note}`);
  if (user && timestamp) tooltipParts.push(`Overridden by ${user} on ${timestamp}`);
  else if (user) tooltipParts.push(`Overridden by ${user}`);
  else if (timestamp) tooltipParts.push(`Overridden on ${timestamp}`);
  const tooltip = tooltipParts.length > 0 ? tooltipParts.join(" \u00b7 ") : "Add override note";

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setDraft(note ?? ""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-4 w-3 items-center justify-center"
          title={tooltip}
        >
          <span
            className={cn(
              "block h-[6px] w-[6px] rounded-full",
              hasNote
                ? "bg-primary"
                : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align={popoverAlign} side={popoverSide} className="w-56 p-2">
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">Override note</div>
        <textarea
          className="w-full rounded border bg-background px-1.5 py-1 text-xs leading-snug placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
          rows={3}
          placeholder={placeholder ? `e.g., ${placeholder}` : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && !draft.trim() && placeholder) {
              e.preventDefault();
              setDraft(placeholder);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && draft !== (note ?? "")) {
              e.preventDefault();
              onSaveNote(draft);
              setOpen(false);
            }
          }}
        />
        <div className="mt-1 flex justify-end gap-1">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={draft === (note ?? "")}
            onClick={() => { onSaveNote(draft); setOpen(false); }}
          >
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── OverrideCell ─────────────────────────────────────────────

export interface OverrideCellProps extends OverridePillProps {
  children: ReactNode;
  /** Thin red bottom border indicating a dependency needs attention. */
  needsAttention?: boolean;
  /** Tooltip explaining why attention is needed. */
  attentionTooltip?: string;
}

export function OverrideCell({
  children,
  needsAttention,
  attentionTooltip,
  ...pillProps
}: OverrideCellProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        needsAttention && "border-b border-red-500",
      )}
      title={needsAttention ? attentionTooltip : undefined}
    >
      <div className="w-3 shrink-0">
        <OverridePill {...pillProps} />
      </div>
      {children}
    </div>
  );
}
