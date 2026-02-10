import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Route pairs: original path segment → copy path segment */
const ROUTE_PAIRS: [string, string][] = [
  ["", "copy-study-summary"],                        // /studies/:id → /studies/:id/copy-study-summary
  ["analyses/adverse-effects", "copy-adverse-effects"],
  ["dose-response", "copy-dose-response"],
  ["target-organs", "copy-target-organs"],
  ["histopathology", "copy-histopathology"],
  ["noael-decision", "copy-noael-decision"],
  ["validation", "copy-validation"],
];

function getToggleInfo(pathname: string): { isCopy: boolean; otherPath: string } | null {
  // Match /studies/:studyId/... pattern
  const m = pathname.match(/^\/studies\/([^/]+)(\/(.*))?$/);
  if (!m) return null;
  const studyId = m[1];
  const suffix = m[3] ?? "";

  for (const [original, copy] of ROUTE_PAIRS) {
    if (suffix === copy) {
      const otherPath = original
        ? `/studies/${studyId}/${original}`
        : `/studies/${studyId}`;
      return { isCopy: true, otherPath };
    }
    if (suffix === original) {
      return { isCopy: false, otherPath: `/studies/${studyId}/${copy}` };
    }
  }
  return null;
}

export function PlaygroundToggle() {
  const location = useLocation();
  const navigate = useNavigate();
  const info = getToggleInfo(location.pathname);

  if (!info) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center rounded-full border border-border bg-background/95 p-0.5 shadow-lg backdrop-blur">
      <button
        className={cn(
          "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
          !info.isCopy
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => info.isCopy && navigate(info.otherPath)}
      >
        Original
      </button>
      <button
        className={cn(
          "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
          info.isCopy
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => !info.isCopy && navigate(info.otherPath)}
      >
        Playground
      </button>
    </div>
  );
}
