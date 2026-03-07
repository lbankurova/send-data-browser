import { cn } from "@/lib/utils";

interface PanePillToggleOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface PanePillToggleProps<T extends string> {
  options: PanePillToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function PanePillToggle<T extends string>({
  options,
  value,
  onChange,
}: PanePillToggleProps<T>) {
  return (
    <div className="flex gap-0.5 bg-muted/30 rounded p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={opt.disabled}
          className={cn(
            "px-1.5 py-0.5 text-[9px] rounded transition-colors",
            value === opt.value
              ? "bg-background text-foreground shadow-sm font-medium"
              : "text-muted-foreground hover:text-foreground",
            opt.disabled && "opacity-40 cursor-not-allowed",
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
