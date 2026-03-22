/**
 * DayStepper — section-level day navigation control for the findings view.
 * Drives the D-R charts to show data for a specific study day.
 */

interface DayStepperProps {
  availableDays: number[];
  selectedDay: number | null;
  onDayChange: (day: number) => void;
  /** Map of day → label key ("terminal" | "peak") */
  dayLabels: Map<number, string>;
  /** Peak day number, used for label formatting */
  peakDay: number | null;
}

function formatDayLabel(day: number, label: string | undefined): string {
  if (label === "terminal") return `Terminal (Day ${day})`;
  if (label === "peak") return `Peak (Day ${day})`;
  return `Day ${day}`;
}

export function DayStepper({
  availableDays,
  selectedDay,
  onDayChange,
  dayLabels,
}: DayStepperProps) {
  const dayIdx = selectedDay != null ? availableDays.indexOf(selectedDay) : -1;
  const interactive = availableDays.length > 1;
  const canPrev = interactive && dayIdx > 0;
  const canNext = interactive && dayIdx >= 0 && dayIdx < availableDays.length - 1;

  if (availableDays.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5">
      {interactive && (
        <button
          type="button"
          disabled={!canPrev}
          className="px-1 text-[10px] text-muted-foreground disabled:opacity-20 hover:text-foreground"
          onClick={() => onDayChange(availableDays[dayIdx - 1])}
        >
          &lsaquo;
        </button>
      )}
      <span className="relative inline-flex items-center">
        <select
          className="appearance-none border-none bg-transparent pr-3 text-center text-[9px] font-semibold tabular-nums text-foreground outline-none cursor-pointer disabled:cursor-default disabled:opacity-70"
          value={selectedDay ?? ""}
          onChange={(e) => onDayChange(Number(e.target.value))}
          disabled={!interactive}
        >
          {availableDays.map((d) => (
            <option key={d} value={d}>
              {formatDayLabel(d, dayLabels.get(d))}
            </option>
          ))}
        </select>
        {interactive && (
          <span className="pointer-events-none absolute right-0 text-[7px] text-muted-foreground">&#x25BE;</span>
        )}
      </span>
      {interactive && (
        <button
          type="button"
          disabled={!canNext}
          className="px-1 text-[10px] text-muted-foreground disabled:opacity-20 hover:text-foreground"
          onClick={() => onDayChange(availableDays[dayIdx + 1])}
        >
          &rsaquo;
        </button>
      )}
    </div>
  );
}
