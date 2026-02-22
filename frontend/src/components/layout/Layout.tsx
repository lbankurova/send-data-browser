import { Outlet, useLocation, matchPath } from "react-router-dom";
import { useCallback, useRef, useState, useMemo } from "react";
import { Settings, HelpCircle, Compass } from "lucide-react";
import { Header } from "./Header";
import { BrowsingTree } from "@/components/tree/BrowsingTree";
import { ContextPanel } from "@/components/panels/ContextPanel";
import { SelectionProvider } from "@/contexts/SelectionContext";
import { FindingSelectionProvider } from "@/contexts/FindingSelectionContext";
import { ViewSelectionProvider } from "@/contexts/ViewSelectionContext";
import { TreeControlProvider } from "@/contexts/TreeControlContext";
import { DesignModeProvider } from "@/contexts/DesignModeContext";
import { StudySelectionProvider } from "@/contexts/StudySelectionContext";
import { GlobalFilterProvider } from "@/contexts/GlobalFilterContext";
import { RailModeProvider } from "@/contexts/RailModeContext";
import { ScheduledOnlyProvider } from "@/contexts/ScheduledOnlyContext";
import { ShellRailPanel } from "@/components/shell/ShellRailPanel";
import { GlobalTooltip } from "@/components/ui/GlobalTooltip";

const LEFT_DEFAULT = 260;
const RIGHT_DEFAULT = 380;
const LEFT_MIN = 180;
const LEFT_MAX = 500;
const RIGHT_MIN = 200;
const RIGHT_MAX = 600;

function readSession(key: string | undefined): number | undefined {
  if (!key) return undefined;
  try {
    const v = sessionStorage.getItem(key);
    if (v !== null) return JSON.parse(v) as number;
  } catch { /* ignore */ }
  return undefined;
}

function useResize(
  initial: number,
  min: number,
  max: number,
  direction: "left" | "right",
  storageKey?: string,
) {
  const [width, setWidth] = useState(() => readSession(storageKey) ?? initial);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = width;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - startX.current;
        const newW =
          direction === "left"
            ? startW.current + delta
            : startW.current - delta;
        setWidth(Math.max(min, Math.min(max, newW)));
      };

      const onUp = () => {
        dragging.current = false;
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [width, min, max, direction],
  );

  if (storageKey) {
    try { sessionStorage.setItem(storageKey, JSON.stringify(width)); } catch { /* ignore */ }
  }

  return { width, onPointerDown };
}

function ResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="shrink-0 cursor-col-resize select-none border-r border-border bg-transparent transition-colors hover:bg-primary/10 active:bg-primary/20"
      style={{ width: 4 }}
    />
  );
}

export function Layout() {
  const left = useResize(LEFT_DEFAULT, LEFT_MIN, LEFT_MAX, "left", "pcc.layout.leftWidth");
  const right = useResize(RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX, "right", "pcc.layout.rightWidth");
  const location = useLocation();
  const studyId = useMemo(() => {
    const match = matchPath("/studies/:studyId/*", location.pathname);
    return match?.params.studyId ?? "";
  }, [location.pathname]);

  return (
    <DesignModeProvider>
    <SelectionProvider>
      <ViewSelectionProvider>
        <FindingSelectionProvider>
        <StudySelectionProvider studyId={studyId}>
        <GlobalFilterProvider>
        <RailModeProvider studyId={studyId}>
        <ScheduledOnlyProvider>
        <TreeControlProvider>
        <div className="flex h-screen flex-col">
          <Header />
          <div className="flex min-h-0 flex-1">
            {/* Datagrok-style icon sidebar — spans full height below header */}
            <div
              className="flex shrink-0 flex-col items-center justify-between py-2"
              style={{ width: 36, background: "#1a3a5c" }}
            >
              <div className="flex flex-col items-center gap-1">
                {/* Datagrok logo */}
                <button
                  className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/15"
                  title="Datagrok"
                >
                  <svg viewBox="0 0 39 38" className="h-4 w-4" fill="none">
                    <path d="M19.0678 30.1313C16.9241 30.1313 15.1858 31.8552 15.1858 33.9809C15.1858 36.1067 16.9241 37.8305 19.0678 37.8305C21.2115 37.8305 22.9498 36.1067 22.9498 33.9809C22.9498 31.8552 21.2115 30.1313 19.0678 30.1313ZM38.1356 18.9175C38.1356 17.5241 37.388 16.3005 36.2666 15.6261C35.3074 14.465 34.7805 12.9957 34.7805 11.388C34.7805 9.78029 35.2624 8.15024 36.2666 7.14988C37.388 6.47553 38.1356 5.25188 38.1356 3.85852C38.1356 1.73276 36.3972 0.00893177 34.2536 0.00893177C33.0061 0.00893177 31.8937 0.593963 31.1867 1.50054C29.9843 2.55449 28.4035 3.2199 26.6607 3.2199C24.9223 3.2199 23.3371 2.55895 22.1347 1.50054C21.4276 0.593963 20.3153 0.00893177 19.0678 0.00893177C17.8203 0.00893177 16.708 0.593963 16.0009 1.50054C14.7985 2.55449 13.2133 3.2199 11.4749 3.2199C9.73656 3.2199 8.15133 2.55895 6.94889 1.50054L6.94439 1.49161C6.93088 1.47821 6.92187 1.46034 6.90836 1.44695L6.87684 1.41122C6.86333 1.39336 6.84531 1.37549 6.8273 1.35316L6.74173 1.25938C6.73272 1.24598 6.71921 1.23705 6.71021 1.22365L6.63365 1.14773C6.62014 1.13433 6.60663 1.12094 6.59312 1.10754C6.57961 1.09414 6.5706 1.08521 6.55709 1.07628L6.48503 1.00482C6.46251 0.982495 6.43549 0.960165 6.41298 0.942302L6.33642 0.879779C6.32291 0.870848 6.3139 0.861916 6.30039 0.852984L6.21933 0.790462C6.20582 0.777064 6.1878 0.768132 6.16979 0.754735L6.07972 0.692212C6.07071 0.68328 6.0572 0.678814 6.04819 0.669883C6.02117 0.652019 5.99415 0.634156 5.96263 0.616292L5.87256 0.562701C5.85905 0.55377 5.85004 0.549304 5.83653 0.540372L5.74646 0.486781C5.72845 0.47785 5.70593 0.464452 5.68791 0.45552L5.57082 0.388532C5.52579 0.375134 5.49426 0.357271 5.46274 0.343873L5.36817 0.30368C5.35916 0.299214 5.34565 0.294748 5.33664 0.290282L5.23306 0.25009C5.21054 0.241158 5.18803 0.232226 5.161 0.223294L5.03941 0.183101C5.03491 0.183101 5.03491 0.183101 5.0304 0.178635C4.99438 0.169704 4.96285 0.156306 4.92682 0.147374L4.82324 0.120579C4.81424 0.116113 4.80073 0.116113 4.79172 0.111647L4.68363 0.0848518C4.65661 0.0803859 4.62959 0.07592 4.60257 0.0669883L4.35488 0.0312612C4.34587 0.0312612 4.33686 0.0312612 4.32786 0.0267953C4.30084 0.0223294 4.27382 0.0223294 4.24229 0.0178635L4.1297 0.00893177C4.11619 0.00893177 4.10719 0.00893177 4.09368 0.00446588C4.06666 0.00446588 4.03963 0 4.01261 0H3.98109C3.94506 0 3.90453 0 3.8685 0C1.73835 0.00893177 0 1.73276 0 3.85852C0 4.91694 0.432335 5.8771 1.13038 6.57378V6.61397C2.26526 7.83763 3.12543 9.52573 3.12543 11.3925C3.12543 13.2592 2.26526 14.9473 1.13038 16.171V16.2112C0.432335 16.8989 0 17.8591 0 18.9175C0 19.9759 0.432335 20.9361 1.13038 21.6327V21.6729C2.26526 22.8966 3.12543 24.5847 3.12543 26.4514C3.12543 28.3182 2.26526 30.0063 1.13038 31.2299V31.2701C0.432335 31.9623 0 32.9225 0 33.9809C0 36.1067 1.73835 37.8305 3.88201 37.8305C6.02568 37.8305 7.76402 36.1067 7.76402 33.9809C7.76402 33.2396 7.55236 32.5429 7.18307 31.9579C5.72394 30.0777 4.39991 28.6888 4.39991 26.4291C4.39991 22.6152 7.52084 19.5204 11.3668 19.5204C13.479 19.5204 15.3704 20.4538 16.6494 21.923C17.3159 22.45 18.1581 22.7671 19.0768 22.7671C21.2205 22.7671 22.9588 21.0432 22.9588 18.9175C22.9588 18.2342 22.7787 17.5911 22.4634 17.0373C21.4096 15.251 19.5317 14.1122 19.5317 11.4014C19.5317 7.58754 22.6526 4.49268 26.4986 4.49268C27.4803 4.49268 28.4125 4.69364 29.2592 5.05538C30.0473 5.37246 30.7634 5.83691 31.3758 6.41748L31.4524 6.49786C31.4524 6.49786 33.47 8.45839 33.47 11.4014C33.47 13.2994 32.6999 15.0143 31.4524 16.2648V16.2781C30.7949 16.9659 30.3941 17.8993 30.3941 18.922C30.3941 21.0477 32.1324 22.7715 34.2761 22.7715C36.4017 22.7671 38.1356 21.0432 38.1356 18.9175ZM11.3623 18.3101C7.51633 18.3101 4.39541 15.2153 4.39541 11.4014C4.39541 7.58754 7.51633 4.49268 11.3623 4.49268C15.2083 4.49268 18.3292 7.58754 18.3292 11.4014C18.3292 15.2153 15.2083 18.3101 11.3623 18.3101Z" fill="white" fillOpacity="0.9" />
                  </svg>
                </button>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded text-white/70 hover:bg-white/15 hover:text-white/90"
                  title="Browse"
                >
                  <Compass className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col items-center gap-1">
                <button
                  className="flex h-7 w-7 items-center justify-center rounded text-white/70 hover:bg-white/15 hover:text-white/90"
                  title="Help"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded text-white/70 hover:bg-white/15 hover:text-white/90"
                  title="Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Content area: tree + panels + status bar */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1">
                <aside
                  className="shrink-0 overflow-y-auto"
                  style={{ width: left.width }}
                >
                  <BrowsingTree />
                </aside>
                <ResizeHandle onPointerDown={left.onPointerDown} />
                <main className="relative min-w-0 flex-1 overflow-hidden">
                  <div className="flex h-full overflow-hidden">
                    <ShellRailPanel />
                    <div className="min-w-0 flex-1 overflow-y-auto">
                      <Outlet />
                    </div>
                  </div>
                </main>
                <ResizeHandle onPointerDown={right.onPointerDown} />
                <aside
                  className="shrink-0 overflow-y-auto"
                  style={{ width: right.width }}
                >
                  <ContextPanel />
                </aside>
              </div>
              {/* Status bar */}
              <div className="flex h-5 shrink-0 items-center border-t px-3" style={{ background: "#f5f4f2" }}>
                <span className="text-[10px] text-muted-foreground">Ready</span>
              </div>
            </div>
          </div>
        </div>
        </TreeControlProvider>
        </ScheduledOnlyProvider>
        </RailModeProvider>
        </GlobalFilterProvider>
        </StudySelectionProvider>
        </FindingSelectionProvider>
      </ViewSelectionProvider>
    </SelectionProvider>
    <GlobalTooltip />
    </DesignModeProvider>
  );
}
