import { Outlet } from "react-router-dom";
import { useCallback, useRef, useState } from "react";
import { Header } from "./Header";
import { BrowsingTree } from "@/components/tree/BrowsingTree";
import { ContextPanel } from "@/components/panels/ContextPanel";
import { PlaygroundToggle } from "./PlaygroundToggle";
import { SelectionProvider } from "@/contexts/SelectionContext";
import { FindingSelectionProvider } from "@/contexts/FindingSelectionContext";
import { SignalSelectionProvider } from "@/contexts/SignalSelectionContext";
import { ViewSelectionProvider } from "@/contexts/ViewSelectionContext";
import { TreeControlProvider } from "@/contexts/TreeControlContext";

const LEFT_DEFAULT = 260;
const RIGHT_DEFAULT = 280;
const LEFT_MIN = 180;
const LEFT_MAX = 500;
const RIGHT_MIN = 200;
const RIGHT_MAX = 600;

function useResize(
  initial: number,
  min: number,
  max: number,
  direction: "left" | "right",
) {
  const [width, setWidth] = useState(initial);
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
  const left = useResize(LEFT_DEFAULT, LEFT_MIN, LEFT_MAX, "left");
  const right = useResize(RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX, "right");

  return (
    <SelectionProvider>
      <FindingSelectionProvider>
        <SignalSelectionProvider>
        <ViewSelectionProvider>
        <TreeControlProvider>
        <div className="flex h-screen flex-col">
          <Header />
          <div className="flex min-h-0 flex-1">
            <aside
              className="shrink-0 overflow-y-auto"
              style={{ width: left.width }}
            >
              <BrowsingTree />
            </aside>
            <ResizeHandle onPointerDown={left.onPointerDown} />
            <main className="relative min-w-0 flex-1 overflow-y-auto">
              <Outlet />
              <PlaygroundToggle />
            </main>
            <ResizeHandle onPointerDown={right.onPointerDown} />
            <aside
              className="shrink-0 overflow-y-auto"
              style={{ width: right.width }}
            >
              <ContextPanel />
            </aside>
          </div>
        </div>
        </TreeControlProvider>
        </ViewSelectionProvider>
        </SignalSelectionProvider>
      </FindingSelectionProvider>
    </SelectionProvider>
  );
}
