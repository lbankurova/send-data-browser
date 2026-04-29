/**
 * ScopeBanner — full-width banner above the resizable split in FindingsView.
 *
 * Shows scope-level context (organ or syndrome) on a single line:
 * counts, NOAEL contribution, classification chip line. Replaces the
 * radar/forest layout's per-panel headers; sits above both rollup panels
 * so it is anchored to the active scope, not to one of the table panels.
 *
 * Pattern modeled on NoaelBannerCompact (single-line, tier-dot, dot-separator)
 * but read-only — no override popovers.
 */

import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrganScopeStats {
  organSystem: string;
  nEndpoints: number;
  nDomains: number;
  domains: string[];
  nAdverse: number;
  noaelLabel: string | null;
  nUnscheduledDeaths: number;
  recoveryStatus: string | null;
}

interface SyndromeScopeStats {
  syndromeId: string;
  syndromeName: string;
  nEndpoints: number;
  nDomains: number;
  sexes: "F+M" | "F-only" | "M-only" | "—";
  classificationChips: string[];
}

type Props =
  | { kind: "organ"; stats: OrganScopeStats; onBack?: () => void; backLabel?: string }
  | { kind: "syndrome"; stats: SyndromeScopeStats; onBack?: () => void; backLabel?: string };

export function ScopeBanner(props: Props) {
  const backButton = props.onBack && (
    <button
      type="button"
      onClick={props.onBack}
      title={props.backLabel ? `Back to ${props.backLabel}` : "Back"}
      className="mr-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    >
      <ChevronLeft className="h-3 w-3" />
      <span>{props.backLabel ?? "Back"}</span>
    </button>
  );

  if (props.kind === "organ") {
    const s = props.stats;
    return (
      <div className="rounded-md border bg-muted/5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
          {backButton}
          <span className="text-xs font-semibold capitalize">{s.organSystem}</span>
          <Sep />
          <Stat label={`${s.nEndpoints}`} note="endpoints" />
          <Sep />
          <Stat
            label={`${s.nDomains}`}
            note={`domain${s.nDomains === 1 ? "" : "s"}`}
            detail={s.domains.length > 0 ? `(${s.domains.join(", ")})` : undefined}
          />
          {s.nAdverse > 0 && (
            <>
              <Sep />
              <span className="text-[11px] text-foreground">
                <span className="font-semibold">{s.nAdverse}</span>
                <span className="ml-1 text-muted-foreground">adverse</span>
              </span>
            </>
          )}
          {s.noaelLabel && (
            <>
              <Sep />
              <span className="text-[11px]">
                <span className="text-muted-foreground">Organ NOAEL </span>
                <span className="font-mono font-semibold">{s.noaelLabel}</span>
              </span>
            </>
          )}
          {s.nUnscheduledDeaths > 0 && (
            <>
              <Sep />
              <span className="text-[11px] text-foreground">
                <span className="font-semibold">{s.nUnscheduledDeaths}</span>
                <span className="ml-1 text-muted-foreground">unscheduled deaths</span>
              </span>
            </>
          )}
          {s.recoveryStatus && (
            <>
              <Sep />
              <span className="text-[11px]">
                <span className="text-muted-foreground">Recovery: </span>
                <span className="font-medium">{s.recoveryStatus}</span>
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  const s = props.stats;
  return (
    <div className="rounded-md border bg-muted/5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
        {backButton}
        <span className="text-xs font-semibold">{s.syndromeName}</span>
        <span className="text-[10px] text-muted-foreground">({s.syndromeId})</span>
        <Sep />
        <Stat label={`${s.nEndpoints}`} note="endpoints" />
        <Sep />
        <Stat label={`${s.nDomains}`} note={`domain${s.nDomains === 1 ? "" : "s"}`} />
        <Sep />
        <span className="text-[11px] font-mono">{s.sexes}</span>
        {s.classificationChips.length > 0 && (
          <>
            <Sep />
            <span className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
              {s.classificationChips.map((chip, i) => (
                <span key={i} className={cn(i === 0 && "font-semibold")}>
                  {chip}
                  {i < s.classificationChips.length - 1 && (
                    <span className="ml-2 text-muted-foreground/60">·</span>
                  )}
                </span>
              ))}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Sep() {
  return <span className="text-border">|</span>;
}

function Stat({ label, note, detail }: { label: string; note: string; detail?: string }) {
  return (
    <span className="text-[11px] text-foreground">
      <span className="font-semibold">{label}</span>
      <span className="ml-1 text-muted-foreground">{note}</span>
      {detail && <span className="ml-1 text-muted-foreground/70">{detail}</span>}
    </span>
  );
}
