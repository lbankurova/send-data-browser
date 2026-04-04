/**
 * AnimalInfluencePanel — per-animal dumbbell strip chart.
 *
 * Shows biological extremity (teal dot) and signal instability (red/amber dot)
 * across affected endpoints for the selected animal. Pre-filtered and pre-sorted
 * from the backend.
 */
import { useMemo, useState, useCallback } from "react";
import type {
  AnimalInfluenceData,
  AnimalInfluenceSummary,
  AnimalEndpointDetail,
} from "@/types/analysis-views";
import { shortId } from "@/lib/chart-utils";

// ── Constants ─────────────────────────────────────────────────

const MAX_ROWS = 30;
const LABEL_W = 128;
const ROW_H = 20;
const GAP = 10;
const DOT_R = 4.5;
const TEAL = "#0d9488";        // teal-600
const DANGER = "#dc2626";      // red-600
const AMBER = "#d97706";       // amber-600
const FRAGILITY_X = 20;        // instability threshold line at 20% (LOO = 80%)

type SortKey = "alarm" | "bio" | "instability" | "name";

export interface AnimalInfluencePanelProps {
  data: AnimalInfluenceData;
  selectedAnimal: string | null;
  onEndpointClick?: (endpointId: string, subjectId: string) => void;
}

export function AnimalInfluencePanel({
  data,
  selectedAnimal,
  onEndpointClick,
}: AnimalInfluencePanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>("alarm");
  const [showAll, setShowAll] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const animal: AnimalInfluenceSummary | undefined = useMemo(
    () => data.animals.find((a) => a.subject_id === selectedAnimal),
    [data.animals, selectedAnimal],
  );

  const details: AnimalEndpointDetail[] = useMemo(() => {
    if (!selectedAnimal) return [];
    const raw = data.endpoint_details[selectedAnimal] ?? [];
    const sorted = [...raw];
    switch (sortKey) {
      case "bio":
        sorted.sort((a, b) => (b.bio_norm ?? 0) - (a.bio_norm ?? 0));
        break;
      case "instability":
        sorted.sort((a, b) => (b.instability ?? 0) - (a.instability ?? 0));
        break;
      case "name":
        sorted.sort((a, b) => a.endpoint_name.localeCompare(b.endpoint_name));
        break;
      default: // alarm
        sorted.sort((a, b) => b.alarm_score - a.alarm_score);
    }
    return sorted;
  }, [data.endpoint_details, selectedAnimal, sortKey]);

  const displayRows = showAll ? details : details.slice(0, MAX_ROWS);
  const hasMore = details.length > MAX_ROWS;

  const handleDotEnter = useCallback(
    (text: string, e: React.MouseEvent) => {
      const rect = (e.currentTarget as SVGElement).closest(".influence-panel")?.getBoundingClientRect();
      if (rect) {
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top - 10,
          text,
        });
      }
    },
    [],
  );

  const handleDotLeave = useCallback(() => setTooltip(null), []);

  // ── Empty states ───────────────────────────────────────────
  if (!selectedAnimal) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-muted-foreground text-center">
          Select an animal in the cohort map to inspect its influence profile.
        </p>
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-muted-foreground text-center">
          No data for {shortId(selectedAnimal)}.
        </p>
      </div>
    );
  }

  if (details.length === 0) {
    return (
      <div className="flex h-full flex-col p-3">
        <AnimalHeader animal={animal} />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground text-center">
            No influential endpoints detected for this animal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="influence-panel relative flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 pt-2 pb-1">
        <AnimalHeader animal={animal} />
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {details.length} of {animal.n_endpoints_total} measured endpoints
          </span>
          <div className="ml-auto flex gap-1">
            {(["alarm", "bio", "instability", "name"] as SortKey[]).map((k) => (
              <button
                key={k}
                className={`text-[9px] px-1.5 py-0.5 rounded ${
                  sortKey === k
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setSortKey(k)}
              >
                {k === "alarm" ? "Score" : k === "bio" ? "Bio" : k === "instability" ? "Inst" : "Name"}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-1 flex items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: TEAL }} />
            Biological extremity
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: DANGER }} />
            Signal instability
          </span>
        </div>

        {/* Scale ticks */}
        <div className="mt-0.5 flex text-[8px] text-muted-foreground" style={{ paddingLeft: LABEL_W + GAP }}>
          {[0, 25, 50, 75, 100].map((v) => (
            <span key={v} className="flex-1 text-center first:text-left last:text-right">
              {v}
            </span>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {displayRows.map((d) => (
          <DumbbellRow
            key={d.endpoint_id}
            detail={d}
            isHovered={hoveredRow === d.endpoint_id}
            onMouseEnter={() => setHoveredRow(d.endpoint_id)}
            onMouseLeave={() => setHoveredRow(null)}
            onClick={() => onEndpointClick?.(d.endpoint_id, selectedAnimal)}
            onDotEnter={handleDotEnter}
            onDotLeave={handleDotLeave}
          />
        ))}

        {hasMore && !showAll && (
          <button
            className="mt-1 w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowAll(true)}
          >
            Show all {details.length} endpoints
          </button>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 rounded border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-sm whitespace-pre-line"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function AnimalHeader({ animal }: { animal: AnimalInfluenceSummary }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold">
        {shortId(animal.subject_id)}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {animal.group_id} - {animal.sex}
        {animal.terminal_bw != null && ` - ${animal.terminal_bw}g`}
      </span>
      {animal.is_alarm && (
        <span className="ml-auto rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-destructive">
          Alarm
        </span>
      )}
    </div>
  );
}

// eslint-disable-next-line complexity -- visual rendering with many conditional dot states (overlap, leverage-only, high-instability ring, control-side color)
function DumbbellRow({
  detail,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onDotEnter,
  onDotLeave,
}: {
  detail: AnimalEndpointDetail;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
  onDotEnter: (text: string, e: React.MouseEvent) => void;
  onDotLeave: () => void;
}) {
  const { bio_norm, instability, bio_z_raw, loo_ratio, loo_dose_group, is_control_side } = detail;

  const bioX = bio_norm != null ? `${bio_norm}%` : null;
  const instX = instability != null ? `${instability}%` : null;

  // Dot positions as percentages
  const bioPos = bio_norm ?? 0;
  const instPos = instability ?? 0;

  // Check if dots overlap (within 2% of track width)
  const dotsOverlap = bio_norm != null && instability != null && Math.abs(bioPos - instPos) < 2;

  // Instability dot color: amber for control-side, danger for treated-side
  const instColor = is_control_side ? AMBER : DANGER;

  // High instability ring
  const highInstability = instability != null && instability > 80;

  // Leverage-only: LOO influential but low biological signal
  const leverageOnly = bio_norm != null && bio_norm < 10 && instability != null && instability > 0;

  const bioTooltip = `Within-group |z|: ${bio_z_raw?.toFixed(2) ?? "N/A"} (normalised: ${bio_norm ?? "N/A"})`;
  const instTooltip = `Signal instability: ${instability ?? "N/A"}% (LOO ratio ${loo_ratio?.toFixed(3) ?? "N/A"}, ${loo_dose_group ?? "?"} vs control)${is_control_side ? " (control-side)" : ""}`;

  return (
    <div
      className={`grid cursor-pointer items-center ${isHovered ? "bg-muted/40" : ""}`}
      style={{ gridTemplateColumns: `${LABEL_W}px 1fr`, gap: GAP, height: ROW_H }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Label */}
      <div className="truncate text-[11px] text-foreground" title={detail.endpoint_name}>
        {detail.endpoint_name}
        {leverageOnly && (
          <span className="ml-1 text-[9px] text-muted-foreground">(leverage only)</span>
        )}
      </div>

      {/* Track */}
      <svg width="100%" height={ROW_H} className="overflow-visible">
        {/* Axis line */}
        <line
          x1="0%" y1={ROW_H / 2}
          x2="100%" y2={ROW_H / 2}
          stroke="var(--border)" strokeWidth={0.5}
        />

        {/* Fragility threshold */}
        <line
          x1={`${FRAGILITY_X}%`} y1={2}
          x2={`${FRAGILITY_X}%`} y2={ROW_H - 2}
          stroke={DANGER} strokeWidth={0.5} opacity={0.4}
        />

        {/* Connector line between dots */}
        {bioX && instX && (
          <line
            x1={bioX} y1={ROW_H / 2}
            x2={instX} y2={ROW_H / 2}
            stroke="var(--muted-foreground)" strokeWidth={1.5} opacity={0.35}
          />
        )}

        {/* Bio extremity dot (teal) */}
        {bioX && (
          <circle
            cx={bioX}
            cy={ROW_H / 2 + (dotsOverlap ? -2 : 0)}
            r={DOT_R}
            fill={TEAL}
            stroke="var(--background)"
            strokeWidth={1.5}
            opacity={leverageOnly ? 0.4 : 1}
            onMouseEnter={(e) => onDotEnter(bioTooltip, e)}
            onMouseLeave={onDotLeave}
          />
        )}

        {/* Instability dot (red or amber) */}
        {instX && (
          <>
            {highInstability && (
              <circle
                cx={instX}
                cy={ROW_H / 2 + (dotsOverlap ? 2 : 0)}
                r={DOT_R + 2}
                fill="none"
                stroke={instColor}
                strokeWidth={1.5}
                opacity={0.6}
              />
            )}
            <circle
              cx={instX}
              cy={ROW_H / 2 + (dotsOverlap ? 2 : 0)}
              r={DOT_R}
              fill={instColor}
              stroke="var(--background)"
              strokeWidth={1.5}
              onMouseEnter={(e) => onDotEnter(instTooltip, e)}
              onMouseLeave={onDotLeave}
            />
          </>
        )}
      </svg>
    </div>
  );
}
