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
    <span className="inline-block font-mono text-[10px] text-muted-foreground">
      {domain}
    </span>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-baseline justify-between border-b border-border pb-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <span className="text-xs text-muted-foreground">({count})</span>
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
// Study Statements (above organ rows)
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
// Target Organ Row (tabular — replaces card)
// ---------------------------------------------------------------------------

function OrganRow({
  block,
  isSelected,
  onOrganClick,
  onOrganNavigate,
}: {
  block: OrganBlock;
  isSelected: boolean;
  onOrganClick: (organKey: string) => void;
  onOrganNavigate?: (organKey: string) => void;
}) {
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-baseline gap-3 border-b border-border/50 px-2 py-2 transition-colors",
        isSelected
          ? "border-l-2 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
          : "border-l-2 border-l-transparent hover:bg-accent/30"
      )}
      onClick={() => onOrganClick(block.organKey)}
      title="Click to select · View in heatmap from selected row"
    >
      {/* Organ name — bold */}
      <span className="min-w-[140px] shrink-0 text-sm font-semibold">
        {block.organ}
      </span>

      {/* Domain chips — muted, middot-separated */}
      <span className="flex flex-wrap gap-1 text-muted-foreground">
        {block.domains.map((d, i) => (
          <span key={d} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-[10px]">&middot;</span>}
            <DomainChip domain={d} />
          </span>
        ))}
      </span>

      {/* Dose-response — cool accent */}
      {block.doseResponse && (
        <span className="ml-auto shrink-0 text-xs text-blue-600/80">
          D-R: {block.doseResponse.nEndpoints} ({block.doseResponse.topEndpoint})
        </span>
      )}

      {/* "View in heatmap" — only on selected row */}
      {isSelected && onOrganNavigate && (
        <button
          className="ml-2 inline-flex shrink-0 items-center gap-0.5 text-xs text-blue-600 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onOrganNavigate(block.organKey);
          }}
        >
          View in heatmap
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left Column: Target Organs (tabular rows)
// ---------------------------------------------------------------------------

function TargetOrgansColumn({
  statements,
  blocks,
  organSelection,
  onOrganSelect,
  onOrganNavigate,
  onEndpointClick,
}: {
  statements: PanelStatement[];
  blocks: OrganBlock[];
  organSelection?: string | null;
  onOrganSelect?: (organKey: string) => void;
  onOrganNavigate?: (organKey: string) => void;
  onEndpointClick?: (ep: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      {/* Study-scope statement */}
      <StudyStatementsSection
        statements={statements}
        onEndpointClick={onEndpointClick}
      />

      {/* Target organs */}
      {blocks.length > 0 && (
        <div>
          <SectionHeader title="Target organs" count={blocks.length} />
          <div>
            {blocks.map((block) => (
              <OrganRow
                key={block.organKey}
                block={block}
                isSelected={organSelection === block.organKey}
                onOrganClick={(key) => onOrganSelect?.(key)}
                onOrganNavigate={onOrganNavigate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right Column: Conditions Rail (Modifiers + Review Flags)
// ---------------------------------------------------------------------------

/** Extract sex + organ from modifier text for compact rendering */
function parseModifier(text: string): { organ: string; condition: string } | null {
  // Pattern: "Organ Name changes in males/females only."
  const match = text.match(/^(.+?)\s+changes?\s+in\s+(males|females)\s+only\.?$/i);
  if (match) return { organ: match[1], condition: match[2] };
  return null;
}

/** Split caveat text into primary (bold) and detail (muted) at first ". " or " — " */
function splitCaveatText(text: string): {
  primary: string;
  detail: string | null;
} {
  const dashIdx = text.indexOf(" — ");
  if (dashIdx !== -1) {
    return { primary: text.slice(0, dashIdx + 3), detail: text.slice(dashIdx + 3) };
  }
  const dotIdx = text.indexOf(". ");
  if (dotIdx === -1) return { primary: text, detail: null };
  return {
    primary: text.slice(0, dotIdx + 1),
    detail: text.slice(dotIdx + 2),
  };
}

function ConditionsRail({
  modifiers,
  caveats,
  onOrganSelect,
}: {
  modifiers: PanelStatement[];
  caveats: PanelStatement[];
  onOrganSelect?: (organKey: string) => void;
}) {
  if (modifiers.length === 0 && caveats.length === 0) return null;

  return (
    <div className="w-[280px] shrink-0 overflow-y-auto border-l border-border/50 pl-4">
      {/* Modifiers */}
      {modifiers.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-700">
            <span className="text-[10px]">{"\u25B2"}</span>
            Modifiers
            <span className="font-normal text-amber-600/70">({modifiers.length})</span>
          </div>
          <div className="space-y-0.5">
            {modifiers.map((s, i) => {
              const parsed = parseModifier(s.text);
              return (
                <div key={i} className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                  {parsed ? (
                    <span>
                      {s.clickOrgan ? (
                        <button
                          className="font-medium hover:underline"
                          onClick={() => onOrganSelect?.(s.clickOrgan!)}
                        >
                          {parsed.organ}
                        </button>
                      ) : (
                        <span className="font-medium">{parsed.organ}</span>
                      )}
                      {" — "}
                      {parsed.condition}
                    </span>
                  ) : (
                    <span>
                      {s.clickOrgan ? (
                        <ClickableOrganText
                          text={s.text}
                          organKey={s.clickOrgan}
                          onClick={() => onOrganSelect?.(s.clickOrgan!)}
                        />
                      ) : (
                        s.text
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Review Flags */}
      {caveats.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-orange-700">
            <span className="text-[10px]">{"\u26A0"}</span>
            Review flags
            <span className="font-normal text-orange-600/70">({caveats.length})</span>
          </div>
          <div className="space-y-2">
            {caveats.map((s, i) => {
              const { primary, detail } = splitCaveatText(s.text);
              return (
                <div
                  key={i}
                  className="rounded border border-orange-200 bg-orange-50/50 p-2 dark:border-orange-800 dark:bg-orange-950/20"
                >
                  <div className="text-xs font-medium leading-snug text-orange-900 dark:text-orange-200">
                    {s.clickOrgan ? (
                      <ClickableOrganText
                        text={primary}
                        organKey={s.clickOrgan}
                        onClick={() => onOrganSelect?.(s.clickOrgan!)}
                      />
                    ) : (
                      primary
                    )}
                  </div>
                  {detail && (
                    <div className="mt-0.5 text-[11px] leading-snug text-orange-700/80 dark:text-orange-400/80">
                      {detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component — FindingsView (two-column signal landscape)
// ---------------------------------------------------------------------------

export function FindingsView({
  data,
  organSelection,
  onOrganNavigate,
  onOrganSelect,
  onEndpointClick,
}: Props) {
  return (
    <div className="flex flex-1 gap-0 overflow-hidden">
      {/* Two-column layout: left (findings) + right (conditions rail) */}
      {/* Responsive: side-by-side at >=1440px center width, stacked below */}
      <div className="findings-landscape flex min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-0 w-full flex-col px-4 py-3 min-[1440px]:flex-row min-[1440px]:gap-0">
          {/* Left column: study statements + organ rows */}
          <TargetOrgansColumn
            statements={data.studyStatements}
            blocks={data.organBlocks}
            organSelection={organSelection}
            onOrganSelect={onOrganSelect}
            onOrganNavigate={onOrganNavigate}
            onEndpointClick={onEndpointClick}
          />

          {/* Right column: conditions rail */}
          <div className="mt-6 min-[1440px]:mt-0">
            <ConditionsRail
              modifiers={data.modifiers}
              caveats={data.caveats}
              onOrganSelect={onOrganSelect}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
