import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { UnrecognizedTermItem } from "@/lib/admin-terms-api";
import { PaneTable } from "@/components/analysis/panes/PaneTable";
import { HomonymWarning } from "./HomonymWarning";

type Props = {
  item: UnrecognizedTermItem;
  onAccept: (item: UnrecognizedTermItem, canonicalOverride?: string) => void;
  onReject: (item: UnrecognizedTermItem) => void;
};

// LEVEL-4-REPORT-ONLY: the term list surfaces pending admin candidates;
// no level 4 enum value is ever written to unified_findings.json.
export function CurationTermRow({ item, onAccept, onReject }: Props) {
  const [expanded, setExpanded] = useState(false);
  const top = item.candidates[0];
  const hasCandidate = top != null;
  const homonymFlag = item.promotion_signal.homonym_flag;
  const organScopeUnreliable = !item.organ_scope_reliable;

  return (
    <>
      <tr className="border-b border-border/40 hover:bg-muted/40">
        <PaneTable.Td className="align-top px-2">
          <button
            className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </PaneTable.Td>
        <PaneTable.Td className="align-top px-2 font-mono text-xs" title={item.raw_term}>
          {item.raw_term}
        </PaneTable.Td>
        <PaneTable.Td className="align-top px-2 text-[10px] font-semibold uppercase text-muted-foreground">
          {item.domain}
        </PaneTable.Td>
        <PaneTable.Td className="align-top px-2 text-xs">
          {item.organ_system ?? <span className="text-muted-foreground">—</span>}
          {organScopeUnreliable && (
            <span className="ml-1 text-[10px] text-muted-foreground" title="ambiguous organ scope">
              (ambiguous)
            </span>
          )}
        </PaneTable.Td>
        <PaneTable.Td numeric className="align-top px-2 text-xs">{item.frequency}</PaneTable.Td>
        <PaneTable.Td className="align-top px-2 text-xs">
          {hasCandidate ? (
            <span className="font-mono" title={`confidence ${top.confidence.toFixed(2)}`}>
              {top.canonical}
              <span className="ml-1 text-[10px] text-muted-foreground">{top.confidence.toFixed(2)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">no candidate</span>
          )}
        </PaneTable.Td>
        <PaneTable.Td className="align-top px-2">
          {homonymFlag && <HomonymWarning evidence={item.promotion_signal.homonym_evidence} />}
        </PaneTable.Td>
        <PaneTable.Td className="align-top px-2">
          <div className="flex items-center gap-1">
            <button
              className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted"
              onClick={() => onAccept(item)}
              disabled={!hasCandidate}
            >
              Accept
            </button>
            <button
              className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted"
              onClick={() => onReject(item)}
            >
              Reject
            </button>
          </div>
        </PaneTable.Td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/40 bg-muted/20">
          <PaneTable.Td className="px-2 py-1.5" />
          <PaneTable.Td className="whitespace-normal overflow-visible px-2 py-1.5" colSpan={7}>
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                All candidates
              </div>
              {item.candidates.length === 0 ? (
                <div className="text-xs text-muted-foreground">No candidates above threshold.</div>
              ) : (
                <ul className="space-y-0.5">
                  {item.candidates.map((c) => (
                    <li key={c.canonical} className="flex items-center gap-2 text-xs">
                      <button
                        className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
                        onClick={() => onAccept(item, c.canonical)}
                      >
                        Use
                      </button>
                      <span className="font-mono">{c.canonical}</span>
                      <span className="text-[10px] text-muted-foreground">
                        conf {c.confidence.toFixed(2)} / jaccard {c.token_jaccard.toFixed(2)} / sim {c.string_similarity.toFixed(2)}
                        {c.organ_scope_reliable ? "" : " / organ scope ambiguous"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 text-[10px] text-muted-foreground">
                Seen in {item.seen_in_studies.length} studies
                {item.seen_in_cros && item.seen_in_cros.length > 0 ? ` across ${item.seen_in_cros.length} CROs` : ""}.
                Promotion: proportion {item.promotion_signal.proportion_studies.toFixed(2)} / threshold {item.promotion_signal.effective_threshold.toFixed(2)}.
                {item.promotion_signal.rejection_reason ? ` Blocked: ${item.promotion_signal.rejection_reason}.` : ""}
              </div>
            </div>
          </PaneTable.Td>
        </tr>
      )}
    </>
  );
}
