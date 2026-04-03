/**
 * Canonical tab bar pattern.
 *
 * Active: h-0.5 bg-primary underline, text-foreground.
 * Inactive: text-muted-foreground.
 * Padding: px-4 py-1.5. Text: text-xs font-medium. Container: bg-muted/30.
 */
import { cn } from "@/lib/utils";

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-4 py-1.5 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
    </button>
  );
}
