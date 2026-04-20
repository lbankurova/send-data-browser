import { Star, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SavedView } from "./types";

export function PresetsMenu({
  presets,
  onApply,
  onSaveCurrent,
  onDelete,
}: {
  presets: Record<string, SavedView>;
  onApply: (name: string) => void;
  onSaveCurrent: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  const names = Object.keys(presets).sort();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded border border-border/50 px-2 py-1 text-[11px] hover:bg-accent"
          title="Saved presets (columns + sort + filters)"
        >
          <Star className="h-3 w-3" />
          Presets
          {names.length > 0 && <span className="text-muted-foreground">({names.length})</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-0">
        <div className="border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Saved presets
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {names.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">No saved presets yet</div>
          ) : names.map((name) => (
            <div key={name} className="flex items-center gap-1 px-2 py-0.5 hover:bg-accent">
              <button
                onClick={() => onApply(name)}
                className="flex-1 truncate text-left text-xs"
                title={`Apply "${name}"`}
              >
                {name}
              </button>
              <button
                onClick={() => onDelete(name)}
                className="rounded p-1 text-muted-foreground/60 hover:text-red-600"
                title={`Delete "${name}"`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t px-2 py-1.5">
          <button
            onClick={() => {
              const name = window.prompt("Save current layout as:")?.trim();
              if (name) onSaveCurrent(name);
            }}
            className="w-full rounded px-2 py-1 text-left text-xs text-primary hover:bg-accent"
          >
            + Save current as...
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
