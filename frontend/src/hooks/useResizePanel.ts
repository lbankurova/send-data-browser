import { useState, useRef, useCallback, useEffect } from "react";

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

interface ResizePanelOptions {
  min?: number;
  max?: number;
  direction?: "left" | "right";
  storageKey?: string;
}

/**
 * Hook for resizable panels. Returns current width, a ref to attach to the
 * resizable element, and a pointer-down handler for the resize handle.
 *
 * During drag, width is updated via direct DOM manipulation (zero re-renders).
 * React state + sessionStorage are committed only on pointer-up.
 */
export function useResizePanel(
  initial: number,
  options?: ResizePanelOptions,
) {
  const min = options?.min ?? 0;
  const max = options?.max ?? Infinity;
  const direction = options?.direction ?? "left";
  const storageKey = options?.storageKey;

  const [width, setWidth] = useState(() => readSession(storageKey) ?? initial);
  const widthRef = useRef(width);

  // Keep ref in sync with state (for when state changes outside of drag)
  useEffect(() => { widthRef.current = width; }, [width]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targetRef = useRef<any>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      // If targetRef is attached, use direct DOM updates (zero re-renders).
      // Otherwise fall back to setState (for multi-element consumers like SubjectHeatmap).
      const target = targetRef.current as HTMLElement | null;
      const hasDomTarget = !!target;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const newW =
          direction === "left"
            ? startW + delta
            : startW - delta;
        const clamped = Math.max(min, Math.min(max, newW));
        widthRef.current = clamped;
        if (hasDomTarget) {
          target!.style.width = clamped + "px";
        } else {
          setWidth(clamped);
        }
      };

      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        // Single state commit + sessionStorage write on drag end
        setWidth(widthRef.current);
        writeSession(storageKey, widthRef.current);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [min, max, direction, storageKey],
  );

  return { width, targetRef, onPointerDown };
}

interface ResizePanelYOptions {
  min?: number;
  max?: number;
  storageKey?: string;
}

/**
 * Vertical variant — returns current height, a ref, and a pointer-down handler.
 * Dragging down increases height.
 */
export function useResizePanelY(
  initial: number,
  options?: ResizePanelYOptions,
) {
  const min = options?.min ?? 0;
  const max = options?.max ?? Infinity;
  const storageKey = options?.storageKey;

  const [height, setHeight] = useState(() => readSession(storageKey) ?? initial);
  const heightRef = useRef(height);

  useEffect(() => { heightRef.current = height; }, [height]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targetRef = useRef<any>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = heightRef.current;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      const target = targetRef.current as HTMLElement | null;
      const hasDomTarget = !!target;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientY - startY;
        const clamped = Math.max(min, Math.min(max, startH + delta));
        heightRef.current = clamped;
        if (hasDomTarget) {
          target!.style.height = clamped + "px";
        } else {
          setHeight(clamped);
        }
      };

      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        setHeight(heightRef.current);
        writeSession(storageKey, heightRef.current);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [min, max, storageKey],
  );

  return { height, targetRef, onPointerDown };
}
