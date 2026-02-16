import { cn } from "@/lib/utils";

export type ChartDisplayMode = "compact" | "scaled";

export function ChartModeToggle({ mode, onChange }: { mode: ChartDisplayMode; onChange: (m: ChartDisplayMode) => void }) {
  return (
    <div className="flex gap-px rounded-sm bg-muted/40 p-px">
      {(["compact", "scaled"] as const).map((m) => (
        <button
          key={m}
          type="button"
          title={m === "compact" ? "Compact — auto-scale to data" : "Scaled — fixed axis range"}
          className={cn(
            "rounded-sm px-1 py-px text-[9px] font-semibold leading-none transition-colors",
            mode === m ? "bg-foreground text-background" : "text-muted-foreground/50 hover:text-muted-foreground",
          )}
          onClick={() => onChange(m)}
        >
          {m === "compact" ? "C" : "S"}
        </button>
      ))}
    </div>
  );
}
