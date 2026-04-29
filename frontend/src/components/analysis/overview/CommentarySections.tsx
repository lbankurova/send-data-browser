/**
 * About / Headline finding / Findings paragraph sections — gated by the
 * Commentary toggle. Renders nothing when `enabled === false`.
 *
 * Spec sections 2 (About), 3 (Headline finding), 4 (Findings paragraph)
 * from `docs/_internal/incoming/overview-executive-summary-redesign-synthesis.md`.
 */

import type { HeadlineFinding } from "@/lib/overview-prose";

interface CommentarySectionsProps {
  enabled: boolean;
  aboutText: string | null;
  headline: HeadlineFinding;
  findingsText: string | null;
  /** Click target for the "{N}% confidence" chip — navigate to the NOAEL/LOAEL rail tab. */
  onConfidenceClick: () => void;
}

export function CommentarySections({
  enabled,
  aboutText,
  headline,
  findingsText,
  onConfidenceClick,
}: CommentarySectionsProps) {
  if (!enabled) return null;

  return (
    <div className="space-y-4 px-4 py-3">
      {/* Section 2: About paragraph */}
      {aboutText && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {aboutText}
        </p>
      )}

      {/* Section 3: Headline finding */}
      <div className="space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Headline finding
        </div>
        <div className="text-[18px] font-medium leading-snug text-foreground">
          {headline.headline}
        </div>
        {headline.subline && (
          <div className="text-[13px] text-muted-foreground">
            {headline.subline}
            {headline.confidencePercent != null && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={onConfidenceClick}
                  title="Open NOAEL/LOAEL evidence chain"
                  className="rounded text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
                >
                  {headline.confidencePercent}% confidence
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section 4: Findings paragraph */}
      {findingsText && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Findings
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            {findingsText}
          </p>
        </div>
      )}
    </div>
  );
}
