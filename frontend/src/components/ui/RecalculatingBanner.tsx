import { Loader2 } from "lucide-react";

export function RecalculatingBanner({ isRecalculating }: { isRecalculating: boolean }) {
  if (!isRecalculating) return null;
  return (
    <div className="pointer-events-none absolute right-3 top-2 z-20 flex items-center gap-1.5 rounded-full bg-muted/80 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
      <Loader2 className="h-3 w-3 animate-spin" />
      Recalculating…
    </div>
  );
}
