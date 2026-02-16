import { useState, useRef, useCallback } from "react";

function readSession(key: string | undefined): number | undefined {
  if (!key) return undefined;
  try {
    const v = sessionStorage.getItem(key);
    if (v !== null) return JSON.parse(v) as number;
  } catch { /* ignore */ }
  return undefined;
}

function writeSession(key: string | undefined, value: number) {
  if (!key) return;
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/**
 * Hook for resizable panels. Returns current width and a pointer-down handler
 * to attach to a resize handle element.
 *
 * @param initial - default width in px
 * @param min - minimum width
 * @param max - maximum width
 * @param direction - "left" means dragging right increases width
 * @param storageKey - optional sessionStorage key to persist width across view switches
 */
export function useResizePanel(
  initial: number,
  min: number,
  max: number,
  direction: "left" | "right" = "left",
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

  if (storageKey) writeSession(storageKey, width);

  return { width, onPointerDown };
}

/**
 * Vertical variant — returns current height and a pointer-down handler.
 * Dragging down increases height.
 */
export function useResizePanelY(
  initial: number,
  min: number,
  max: number,
  storageKey?: string,
) {
  const [height, setHeight] = useState(() => readSession(storageKey) ?? initial);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = height;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientY - startY.current;
        setHeight(Math.max(min, Math.min(max, startH.current + delta)));
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
    [height, min, max],
  );

  if (storageKey) writeSession(storageKey, height);

  return { height, onPointerDown };
}
