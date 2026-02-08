import { useState, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SignalsPanelData,
  OrganBlock,
  PanelStatement,
  MetricsLine,
} from "@/lib/signals-panel-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  data: SignalsPanelData;
  /** Filter-responsive metrics (updates with signal filters) */
  filteredMetrics?: MetricsLine;
  onOrganClick?: (organKey: string) => void;
  onEndpointClick?: (endpointLabel: string) => void;
}

type ExpandableSection = "TargetOrgans" | "Modifiers" | "Caveats";

// ---------------------------------------------------------------------------
// Icon rendering
// ---------------------------------------------------------------------------

function StatementIcon({ icon }: { icon: PanelStatement["icon"] }) {
  switch (icon) {
    case "fact":
      return <span className="mt-0.5 shrink-0 text-[10px] text-blue-600">{"\u25CF"}</span>;
    case "warning":
      return <span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u25B2"}</span>;
    case "review-flag":
      return <span className="mt-0.5 shrink-0 text-[10px] text-amber-600">{"\u26A0"}</span>;
  }
}

// ---------------------------------------------------------------------------
// Domain chip
// ---------------------------------------------------------------------------

function DomainChip({ domain }: { domain: string }) {
  return (
    <span className="inline-block rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
      {domain}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Decision Summary
// ---------------------------------------------------------------------------

function DecisionSummarySection({
  statements,
  onEndpointClick,
}: {
  statements: PanelStatement[];
  onEndpointClick?: (ep: string) => void;
}) {
  if (statements.length === 0) return null;

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2.5">
      <div className="space-y-1.5">
        {statements.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px] leading-snug">
            <StatementIcon icon={s.icon} />
            <span className="flex-1">
              {s.clickEndpoint ? (
                <ClickableStatement
                  text={s.text}
                  clickEndpoint={s.clickEndpoint}
                  onEndpointClick={onEndpointClick}
                />
              ) : (
                s.text
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Render statement text with the driving endpoint as a clickable link */
function ClickableStatement({
  text,
  clickEndpoint,
  onEndpointClick,
}: {
  text: string;
  clickEndpoint: string;
  onEndpointClick?: (ep: string) => void;
}) {
  const idx = text.indexOf(clickEndpoint);
  if (idx === -1) return <>{text}</>;

  const before = text.slice(0, idx);
  const after = text.slice(idx + clickEndpoint.length);

  return (
    <>
      {before}
      <button
        className="font-medium text-blue-600 hover:underline"
        onClick={() => onEndpointClick?.(clickEndpoint)}
      >
        {clickEndpoint}
      </button>
      {after}
    </>
  );
}

// ---------------------------------------------------------------------------
// Target Organs
// ---------------------------------------------------------------------------

function TargetOrgansSection({
  blocks,
  expanded,
  onToggle,
  onOrganClick,
}: {
  blocks: OrganBlock[];
  expanded: boolean;
  onToggle: () => void;
  onOrganClick?: (organKey: string) => void;
}) {
  if (blocks.length === 0) return null;

  return (
    <div>
      <button
        className="mb-1 flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        <ChevronRight
          className="h-3 w-3 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : undefined }}
        />
        Target organs
      </button>

      <div className="space-y-1">
        {blocks.map((block) =>
          expanded ? (
            <ExpandedOrganBlock
              key={block.organKey}
              block={block}
              onOrganClick={onOrganClick}
            />
          ) : (
            <CompactOrganLine
              key={block.organKey}
              block={block}
              onOrganClick={onOrganClick}
            />
          )
        )}
      </div>
    </div>
  );
}

function CompactOrganLine({
  block,
  onOrganClick,
}: {
  block: OrganBlock;
  onOrganClick?: (organKey: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      <span className="shrink-0 text-[10px] text-blue-600">{"\u25CF"}</span>
      <button
        className="font-medium text-blue-600 hover:underline"
        onClick={() => onOrganClick?.(block.organKey)}
      >
        {block.organ}
      </button>
      <span className="text-muted-foreground">&mdash;</span>
      <div className="flex flex-wrap gap-0.5">
        {block.domains.map((d) => (
          <DomainChip key={d} domain={d} />
        ))}
      </div>
    </div>
  );
}

function ExpandedOrganBlock({
  block,
  onOrganClick,
}: {
  block: OrganBlock;
  onOrganClick?: (organKey: string) => void;
}) {
  return (
    <div className="mb-2">
      {/* Headline */}
      <div className="group flex items-start gap-1.5 text-[12px]">
        <span className="mt-0.5 shrink-0 text-[10px] text-blue-600">{"\u25CF"}</span>
        <button
          className="font-medium text-blue-600 hover:underline"
          onClick={() => onOrganClick?.(block.organKey)}
        >
          {block.organ}
        </button>
        <span className="text-muted-foreground">&mdash; target organ identified</span>
        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* Evidence sub-line: domains */}
      <div className="ml-5 mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        <span>Evidence:</span>
        <div className="flex flex-wrap gap-0.5">
          {block.domains.map((d) => (
            <DomainChip key={d} domain={d} />
          ))}
        </div>
      </div>

      {/* Dose-response sub-line */}
      {block.doseResponse && (
        <div className="ml-5 mt-0.5 text-[11px] text-muted-foreground">
          Dose-response: {block.doseResponse.nEndpoints} endpoints &middot;{" "}
          {block.doseResponse.topEndpoint} strongest
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

function ModifiersSection({
  modifiers,
  expanded,
  onToggle,
  onOrganClick,
}: {
  modifiers: PanelStatement[];
  expanded: boolean;
  onToggle: () => void;
  onOrganClick?: (organKey: string) => void;
}) {
  if (modifiers.length === 0) return null;

  return (
    <div>
      <button
        className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        <ChevronRight
          className="h-3 w-3 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : undefined }}
        />
        Modifiers ({modifiers.length})
      </button>

      {expanded && (
        <div className="mt-1 space-y-1">
          {modifiers.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px] leading-snug">
              <StatementIcon icon={s.icon} />
              <span
                className={cn(
                  "flex-1",
                  s.clickOrgan && "cursor-pointer hover:text-blue-700"
                )}
                onClick={
                  s.clickOrgan
                    ? () => onOrganClick?.(s.clickOrgan!)
                    : undefined
                }
              >
                {s.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Caveats & Review Flags
// ---------------------------------------------------------------------------

function CaveatsSection({
  caveats,
  expanded,
  onToggle,
  onOrganClick,
}: {
  caveats: PanelStatement[];
  expanded: boolean;
  onToggle: () => void;
  onOrganClick?: (organKey: string) => void;
}) {
  if (caveats.length === 0) return null;

  return (
    <div>
      <button
        className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        <ChevronRight
          className="h-3 w-3 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : undefined }}
        />
        Review flags ({caveats.length})
      </button>

      {expanded && (
        <div className="mt-1 space-y-1">
          {caveats.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded bg-amber-50/50 px-2 py-1 text-[12px] leading-snug"
            >
              <StatementIcon icon={s.icon} />
              <span
                className={cn(
                  "flex-1",
                  s.clickOrgan && "cursor-pointer hover:text-blue-700"
                )}
                onClick={
                  s.clickOrgan
                    ? () => onOrganClick?.(s.clickOrgan!)
                    : undefined
                }
              >
                {s.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Metrics
// ---------------------------------------------------------------------------

function SummaryMetricsFooter({ metrics }: { metrics: MetricsLine }) {
  return (
    <div className="flex flex-wrap gap-x-1 text-[11px] text-muted-foreground">
      <span>
        <span className="font-medium">NOAEL</span>{" "}
        <span
          className={cn(
            "font-semibold",
            metrics.noael === "Not established"
              ? "text-amber-600"
              : "text-foreground"
          )}
        >
          {metrics.noael}
        </span>
        {metrics.noaelSex && (
          <span className="text-muted-foreground"> ({metrics.noaelSex})</span>
        )}
      </span>
      <span>&middot;</span>
      <span>
        {metrics.targets} target{metrics.targets !== 1 ? "s" : ""}
      </span>
      <span>&middot;</span>
      <span>{metrics.significantRatio} significant</span>
      <span>&middot;</span>
      <span>{metrics.doseResponse} D-R</span>
      <span>&middot;</span>
      <span>
        {metrics.domains} domain{metrics.domains !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SignalsPanel({
  data,
  filteredMetrics,
  onOrganClick,
  onEndpointClick,
}: Props) {
  const [expandedSections, setExpandedSections] = useState<
    Set<ExpandableSection>
  >(new Set());

  const toggle = useCallback((section: ExpandableSection) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const metrics = filteredMetrics ?? data.metrics;

  return (
    <div className="flex h-full flex-col overflow-hidden border-r">
      <div className="flex-1 space-y-3 overflow-auto px-3 py-3">
        {/* Decision Summary — always visible */}
        <DecisionSummarySection
          statements={data.decisionSummary}
          onEndpointClick={onEndpointClick}
        />

        {/* Target Organs */}
        <TargetOrgansSection
          blocks={data.organBlocks}
          expanded={expandedSections.has("TargetOrgans")}
          onToggle={() => toggle("TargetOrgans")}
          onOrganClick={onOrganClick}
        />

        {/* Modifiers */}
        <ModifiersSection
          modifiers={data.modifiers}
          expanded={expandedSections.has("Modifiers")}
          onToggle={() => toggle("Modifiers")}
          onOrganClick={onOrganClick}
        />

        {/* Caveats */}
        <CaveatsSection
          caveats={data.caveats}
          expanded={expandedSections.has("Caveats")}
          onToggle={() => toggle("Caveats")}
          onOrganClick={onOrganClick}
        />
      </div>

      {/* Summary Metrics — always visible, bottom */}
      <div className="border-t px-3 py-2">
        <SummaryMetricsFooter metrics={metrics} />
      </div>
    </div>
  );
}
