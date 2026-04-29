/**
 * Needs attention list — always rendered (not gated by Commentary toggle).
 * Each item has a colored left pipe (red for errors, amber for warnings)
 * and an optional inline link.
 *
 * Spec section 5 ("Needs attention").
 */

import { Link } from "react-router-dom";

export type AttentionLevel = "error" | "warning";

export interface AttentionLink {
  label: string;
  to?: string;
  onClick?: () => void;
}

export interface AttentionItem {
  id: string;
  level: AttentionLevel;
  /** Lead text rendered in the colored phrase (e.g., "2 validation errors"). */
  leadText: string;
  /** Continuation rendered in muted secondary text. */
  body?: string;
  link?: AttentionLink;
}

interface NeedsAttentionListProps {
  items: AttentionItem[];
}

export function NeedsAttentionList({ items }: NeedsAttentionListProps) {
  if (items.length === 0) return null;

  // Sort: red errors first, amber warnings second; preserve input order
  // within each bucket.
  const ordered = [
    ...items.filter((i) => i.level === "error"),
    ...items.filter((i) => i.level === "warning"),
  ];

  return (
    <div className="space-y-1 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Needs attention
      </div>
      <ul className="space-y-1">
        {ordered.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 border-l-2 pl-2 text-[12px] leading-snug"
            style={{
              borderLeftColor:
                item.level === "error"
                  ? "var(--color-text-danger, #DC2626)"
                  : "var(--color-text-warning, #D97706)",
            }}
          >
            <span
              className={
                item.level === "error"
                  ? "font-medium text-[color:var(--color-text-danger,#DC2626)]"
                  : "font-medium text-[color:var(--color-text-warning,#D97706)]"
              }
            >
              {item.leadText}
            </span>
            {item.body && (
              <span className="text-muted-foreground">{item.body}</span>
            )}
            {item.link && (
              <span className="ml-auto">
                {item.link.to ? (
                  <Link
                    to={item.link.to}
                    className="text-primary hover:underline"
                  >
                    {item.link.label} &rarr;
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={item.link.onClick}
                    className="text-primary hover:underline"
                  >
                    {item.link.label} &rarr;
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
