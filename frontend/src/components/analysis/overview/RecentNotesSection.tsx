/**
 * Recent notes section — renders only when the study-level user note is
 * non-empty. "View all →" deep-links to the Notes rail tab; once the
 * cross-schema notes-aggregation epic ships, the deep-link target evolves.
 *
 * Spec section 6 ("Recent notes").
 */

interface RecentNotesSectionProps {
  noteText: string;
  lastEdited?: string;
  onViewAll: () => void;
}

export function RecentNotesSection({
  noteText,
  lastEdited,
  onViewAll,
}: RecentNotesSectionProps) {
  if (!noteText) return null;

  const relativeTime = lastEdited ? formatRelative(lastEdited) : null;

  return (
    <div className="space-y-1 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent notes
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-[11px] text-primary hover:underline"
        >
          View all &rarr;
        </button>
      </div>
      <div className="flex items-start gap-2 rounded-md bg-muted/30 px-3 py-2.5">
        <div
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
        >
          U
        </div>
        <div className="flex-1 space-y-0.5 text-xs">
          <div className="text-[11px] text-muted-foreground">
            You{relativeTime ? ` · ${relativeTime}` : ""} · study-level
          </div>
          <div className="leading-relaxed text-foreground/90">{noteText}</div>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - dt.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return "just now";
    return `${hours}h ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return dt.toLocaleDateString();
}
