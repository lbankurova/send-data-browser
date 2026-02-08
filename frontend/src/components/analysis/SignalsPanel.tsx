import { useState, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SignalsPanelData,
  OrganBlock,
  PanelStatement,
} from "@/lib/signals-panel-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  data: SignalsPanelData;
  organSelection?: string | null;
  onOrganNavigate?: (organKey: string) => void;
  onOrganSelect?: (organKey: string) => void;
  onEndpointClick?: (endpointLabel: string) => void;
}

type ExpandableSection = "TargetOrgans" | "Modifiers" | "Caveats";

// ---------------------------------------------------------------------------
// Icon rendering
// ---------------------------------------------------------------------------

function StatementIcon({ icon }: { icon: PanelStatement["icon"] }) {
  switch (icon) {
    case "fact":
      return <span className="mt-0.5 shrink-0 text-[11px] text-blue-600">{"\u25CF"}</span>;
    case "warning":
      return <span className="mt-0.5 shrink-0 text-[11px] text-amber-600">{"\u25B2"}</span>;
    case "review-flag":
      return <span className="mt-0.5 shrink-0 text-[11px] text-amber-600">{"\u26A0"}</span>;
  }
}

// ---------------------------------------------------------------------------
// Domain chip
// ---------------------------------------------------------------------------

function DomainChip({ domain }: { domain: string }) {
  return (
    <span className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {domain}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Clickable statement (endpoints in study statements)
// ---------------------------------------------------------------------------

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
// Study Statements
// ---------------------------------------------------------------------------

function StudyStatementsSection({
  statements,
  onEndpointClick,
}: {
  statements: PanelStatement[];
  onEndpointClick?: (ep: string) => void;
}) {
  if (statements.length === 0) return null;

  return (
    <div className="mb-4">
      {statements.map((s, i) => (
        <div key={i} className="flex items-start gap-2 text-sm leading-relaxed">
          <StatementIcon icon={s.icon} />
          <span>
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
  );
}

// ---------------------------------------------------------------------------
// Target Organs Section
// ---------------------------------------------------------------------------

function TargetOrgansSection({
  blocks,
  expanded,
  onToggle,
  organSelection,
  onOrganNavigate,
  onOrganSelect,
}: {
  blocks: OrganBlock[];
  expanded: boolean;
  onToggle: () => void;
  organSelection?: string | null;
  onOrganNavigate?: (organKey: string) => void;
  onOrganSelect?: (organKey: string) => void;
}) {
  if (blocks.length === 0) return null;

  const handleOrganClick = (e: React.MouseEvent, organKey: string) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: stay in findings, just set selection
      onOrganSelect?.(organKey);
    } else {
      // Normal click: navigate to heatmap
      onOrganNavigate?.(organKey);
    }
  };

  return (
    <div className="mb-4">
      <button
        className="mb-2 flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        <ChevronRight
          className="h-3.5 w-3.5 transition-transform"
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
              isSelected={organSelection === block.organKey}
              onOrganClick={handleOrganClick}
            />
          ) : (
            <CompactOrganLine
              key={block.organKey}
              block={block}
              isSelected={organSelection === block.organKey}
              onOrganClick={handleOrganClick}
            />
          )
        )}
      </div>
    </div>
  );
}

function CompactOrganLine({
  block,
  isSelected,
  onOrganClick,
}: {
  block: OrganBlock;
  isSelected: boolean;
  onOrganClick: (e: React.MouseEvent, organKey: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
        isSelected && "bg-blue-50 dark:bg-blue-950/20"
      )}
    >
      <span className="shrink-0 text-[11px] text-blue-600">{"\u25CF"}</span>
      <button
        className="font-semibold text-blue-600 hover:underline"
        onClick={(e) => onOrganClick(e, block.organKey)}
        title="View in heatmap"
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
  isSelected,
  onOrganClick,
}: {
  block: OrganBlock;
  isSelected: boolean;
  onOrganClick: (e: React.MouseEvent, organKey: string) => void;
}) {
  return (
    <div
      className={cn(
        "mb-2 rounded-md px-2 py-1.5 transition-colors",
        isSelected && "bg-blue-50 dark:bg-blue-950/20"
      )}
    >
      {/* Headline */}
      <div className="group flex items-start gap-2 text-sm">
        <span className="mt-0.5 shrink-0 text-[11px] text-blue-600">{"\u25CF"}</span>
        <button
          className="font-semibold text-blue-600 hover:underline"
          onClick={(e) => onOrganClick(e, block.organKey)}
          title="View in heatmap"
        >
          {block.organ}
        </button>
        <span className="text-muted-foreground">&mdash; target organ identified</span>
      </div>

      {/* Evidence sub-line: domains */}
      <div className="ml-6 mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        <span>Evidence:</span>
        <div className="flex flex-wrap gap-0.5">
          {block.domains.map((d) => (
            <DomainChip key={d} domain={d} />
          ))}
        </div>
      </div>

      {/* Dose-response sub-line */}
      {block.doseResponse && (
        <div className="ml-6 mt-0.5 text-xs text-muted-foreground">
          Dose-response: {block.doseResponse.nEndpoints} endpoints &middot;{" "}
          {block.doseResponse.topEndpoint} strongest
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modifiers Section
// ---------------------------------------------------------------------------

function ModifiersSection({
  modifiers,
  expanded,
  onToggle,
  onOrganNavigate,
}: {
  modifiers: PanelStatement[];
  expanded: boolean;
  onToggle: () => void;
  onOrganNavigate?: (organKey: string) => void;
}) {
  if (modifiers.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        className="flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        <ChevronRight
          className="h-3.5 w-3.5 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : undefined }}
        />
        Modifiers ({modifiers.length})
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1">
          {modifiers.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-sm leading-relaxed">
              <StatementIcon icon={s.icon} />
              <span
                className={cn(
                  "flex-1",
                  s.clickOrgan &&
                    "cursor-pointer text-blue-600 hover:underline"
                )}
                onClick={
                  s.clickOrgan
                    ? () => onOrganNavigate?.(s.clickOrgan!)
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
  onOrganNavigate,
}: {
  caveats: PanelStatement[];
  expanded: boolean;
  onToggle: () => void;
  onOrganNavigate?: (organKey: string) => void;
}) {
  if (caveats.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        className="flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        <ChevronRight
          className="h-3.5 w-3.5 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : undefined }}
        />
        Review flags ({caveats.length})
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1">
          {caveats.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded bg-amber-50/50 px-2 py-1.5 text-sm leading-relaxed"
            >
              <StatementIcon icon={s.icon} />
              <span
                className={cn(
                  "flex-1",
                  s.clickOrgan &&
                    "cursor-pointer text-blue-600 hover:underline"
                )}
                onClick={
                  s.clickOrgan
                    ? () => onOrganNavigate?.(s.clickOrgan!)
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
// Main Component — FindingsView (full-width center panel content)
// ---------------------------------------------------------------------------

export function FindingsView({
  data,
  organSelection,
  onOrganNavigate,
  onOrganSelect,
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

  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      {/* Study-scope statements (e.g., treatment-related effects) */}
      <StudyStatementsSection
        statements={data.studyStatements}
        onEndpointClick={onEndpointClick}
      />

      {/* Target Organs */}
      <TargetOrgansSection
        blocks={data.organBlocks}
        expanded={expandedSections.has("TargetOrgans")}
        onToggle={() => toggle("TargetOrgans")}
        organSelection={organSelection}
        onOrganNavigate={onOrganNavigate}
        onOrganSelect={onOrganSelect}
      />

      {/* Modifiers */}
      <ModifiersSection
        modifiers={data.modifiers}
        expanded={expandedSections.has("Modifiers")}
        onToggle={() => toggle("Modifiers")}
        onOrganNavigate={onOrganNavigate}
      />

      {/* Caveats */}
      <CaveatsSection
        caveats={data.caveats}
        expanded={expandedSections.has("Caveats")}
        onToggle={() => toggle("Caveats")}
        onOrganNavigate={onOrganNavigate}
      />
    </div>
  );
}
