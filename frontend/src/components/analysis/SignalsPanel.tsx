import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { organName } from "@/lib/signals-panel-engine";
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

// ---------------------------------------------------------------------------
// Shared sub-components
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

function DomainChip({ domain }: { domain: string }) {
  return (
    <span className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {domain}
    </span>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between border-b border-border pb-1.5">
      <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <span className="text-sm text-muted-foreground">({count})</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clickable organ name within text
// ---------------------------------------------------------------------------

function ClickableOrganText({
  text,
  organKey,
  onClick,
}: {
  text: string;
  organKey: string;
  onClick: () => void;
}) {
  const displayName = organName(organKey);
  const idx = text.indexOf(displayName);
  if (idx === -1) {
    return (
      <span
        className="cursor-pointer text-blue-600 hover:underline"
        onClick={onClick}
      >
        {text}
      </span>
    );
  }

  const before = text.slice(0, idx);
  const after = text.slice(idx + displayName.length);

  return (
    <span>
      {before}
      <button
        className="font-medium text-blue-600 hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {displayName}
      </button>
      {after}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Clickable endpoint within text
// ---------------------------------------------------------------------------

function ClickableEndpointText({
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
    <div className="mb-6">
      {statements.map((s, i) => (
        <div key={i} className="flex items-start gap-2 text-sm leading-relaxed">
          <StatementIcon icon={s.icon} />
          <span>
            {s.clickEndpoint ? (
              <ClickableEndpointText
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
// Target Organ Card
// ---------------------------------------------------------------------------

function OrganCard({
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
        "group cursor-pointer rounded-lg border p-4 transition-all",
        isSelected
          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
          : "border-border bg-background hover:border-blue-300 hover:shadow-sm"
      )}
      onClick={(e) => onOrganClick(e, block.organKey)}
      title="Click to view in heatmap · Ctrl+click to browse insights"
    >
      {/* Header: organ name + navigate icon */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-[11px] text-blue-600">
            {"\u25CF"}
          </span>
          <span className="text-sm font-semibold">{block.organ}</span>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* Evidence: domain chips */}
      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <span>Evidence:</span>
        <div className="flex flex-wrap gap-0.5">
          {block.domains.map((d) => (
            <DomainChip key={d} domain={d} />
          ))}
        </div>
      </div>

      {/* Dose-response sub-line */}
      {block.doseResponse && (
        <div className="mt-1 text-xs text-muted-foreground">
          Dose-response: {block.doseResponse.nEndpoints} endpoints &middot;{" "}
          {block.doseResponse.topEndpoint} strongest
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target Organs Section (card grid)
// ---------------------------------------------------------------------------

function TargetOrgansSection({
  blocks,
  organSelection,
  onOrganNavigate,
  onOrganSelect,
}: {
  blocks: OrganBlock[];
  organSelection?: string | null;
  onOrganNavigate?: (organKey: string) => void;
  onOrganSelect?: (organKey: string) => void;
}) {
  if (blocks.length === 0) return null;

  const handleOrganClick = (e: React.MouseEvent, organKey: string) => {
    if (e.ctrlKey || e.metaKey) {
      onOrganSelect?.(organKey);
    } else {
      onOrganNavigate?.(organKey);
    }
  };

  return (
    <div className="mb-8">
      <SectionHeader title="Target organs" count={blocks.length} />
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          alignItems: "start",
        }}
      >
        {blocks.map((block) => (
          <OrganCard
            key={block.organKey}
            block={block}
            isSelected={organSelection === block.organKey}
            onOrganClick={handleOrganClick}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modifiers Section
// ---------------------------------------------------------------------------

/** Extract sex badge from modifier text */
function extractSexBadge(text: string): string | null {
  if (text.includes("females only")) return "F";
  if (text.includes("males only")) return "M";
  return null;
}

function ModifiersSection({
  modifiers,
  onOrganNavigate,
}: {
  modifiers: PanelStatement[];
  onOrganNavigate?: (organKey: string) => void;
}) {
  if (modifiers.length === 0) return null;

  return (
    <div className="mb-8">
      <SectionHeader title="Modifiers" count={modifiers.length} />
      <div className="space-y-1">
        {modifiers.map((s, i) => {
          const sexBadge = extractSexBadge(s.text);
          return (
            <div
              key={i}
              className="flex items-start gap-2 text-sm leading-relaxed"
            >
              <StatementIcon icon={s.icon} />
              <span className="flex-1">
                {s.clickOrgan ? (
                  <ClickableOrganText
                    text={s.text}
                    organKey={s.clickOrgan}
                    onClick={() => onOrganNavigate?.(s.clickOrgan!)}
                  />
                ) : (
                  s.text
                )}
              </span>
              {sexBadge && (
                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                    sexBadge === "F"
                      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
                      : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400"
                  )}
                >
                  {sexBadge}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Flags (Caveats) Section
// ---------------------------------------------------------------------------

/** Split caveat text into primary (bold) and detail (muted) at first ". " */
function splitCaveatText(text: string): {
  primary: string;
  detail: string | null;
} {
  const idx = text.indexOf(". ");
  if (idx === -1) return { primary: text, detail: null };
  return {
    primary: text.slice(0, idx + 1),
    detail: text.slice(idx + 2),
  };
}

function CaveatsSection({
  caveats,
  onOrganNavigate,
}: {
  caveats: PanelStatement[];
  onOrganNavigate?: (organKey: string) => void;
}) {
  if (caveats.length === 0) return null;

  return (
    <div className="mb-8">
      <SectionHeader title="Review flags" count={caveats.length} />
      <div className="space-y-2">
        {caveats.map((s, i) => {
          const { primary, detail } = splitCaveatText(s.text);
          return (
            <div
              key={i}
              className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20"
            >
              <div className="flex items-start gap-2">
                <StatementIcon icon={s.icon} />
                <div className="flex-1">
                  {s.clickOrgan ? (
                    <span className="text-sm font-medium">
                      <ClickableOrganText
                        text={primary}
                        organKey={s.clickOrgan}
                        onClick={() => onOrganNavigate?.(s.clickOrgan!)}
                      />
                    </span>
                  ) : (
                    <span className="text-sm font-medium">{primary}</span>
                  )}
                  {detail && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {detail}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      {/* Study-scope statements */}
      <StudyStatementsSection
        statements={data.studyStatements}
        onEndpointClick={onEndpointClick}
      />

      {/* Target Organs — card grid */}
      <TargetOrgansSection
        blocks={data.organBlocks}
        organSelection={organSelection}
        onOrganNavigate={onOrganNavigate}
        onOrganSelect={onOrganSelect}
      />

      {/* Modifiers — always visible list */}
      <ModifiersSection
        modifiers={data.modifiers}
        onOrganNavigate={onOrganNavigate}
      />

      {/* Review Flags — always visible blocks */}
      <CaveatsSection
        caveats={data.caveats}
        onOrganNavigate={onOrganNavigate}
      />
    </div>
  );
}
