import { useState, useRef, useCallback, useEffect } from "react";
import type { RefObject } from "react";

// ─── Types ──────────────────────────────────────────────────

export interface SectionConfig {
  id: string;          // persistence key, e.g. "charts"
  min: number;         // minimum height
  max: number;         // maximum height
  defaultHeight: number; // fallback before measurement
}

export interface SectionResult {
  height: number;
  contentRef: RefObject<HTMLDivElement | null>;
  onPointerDown: (e: React.PointerEvent) => void;
}

// ─── Persistence helpers ────────────────────────────────────

function loadSaved(viewKey: string): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(`pcc.sections.${viewKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch { /* ignore */ }
  return null;
}

function savePersisted(viewKey: string, heights: Record<string, number>) {
  try {
    localStorage.setItem(`pcc.sections.${viewKey}`, JSON.stringify(heights));
  } catch { /* ignore */ }
}

// ─── Constants ──────────────────────────────────────────────

const HEADER_HEIGHT = 28;   // ViewSection header bar
const HANDLE_HEIGHT = 8;    // HorizontalResizeHandle

// ─── Hook ───────────────────────────────────────────────────

export function useAutoFitSections(
  containerRef: RefObject<HTMLElement | null>,
  viewKey: string,
  configs: SectionConfig[],
): SectionResult[] {
  const count = configs.length;

  // Track which sections have been manually resized (persisted)
  const savedRef = useRef<Record<string, number> | null>(null);
  if (savedRef.current === null) {
    savedRef.current = loadSaved(viewKey);
  }
  const saved = savedRef.current;

  // Initialize heights: use saved values or defaults
  const [heights, setHeights] = useState<number[]>(() =>
    configs.map((c) => {
      const s = saved?.[c.id];
      return s != null ? Math.max(c.min, Math.min(c.max, s)) : c.defaultHeight;
    }),
  );

  // Track which sections user has manually dragged (indices)
  const manualRef = useRef<Set<number>>(
    new Set(configs.map((c, i) => (saved?.[c.id] != null ? i : -1)).filter((i) => i >= 0)),
  );

  // Content refs for measuring natural height
  const contentRefs = useRef<Array<RefObject<HTMLDivElement | null>>>(
    configs.map(() => ({ current: null })),
  );
  // Ensure stable length
  if (contentRefs.current.length !== count) {
    while (contentRefs.current.length < count) contentRefs.current.push({ current: null });
    contentRefs.current.length = count;
  }

  // Auto-fit: measure content and distribute space
  const autoFit = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const available = container.clientHeight;
    // Overhead: each section has a header; each fixed section has a resize handle
    const overhead = count * HEADER_HEIGHT + count * HANDLE_HEIGHT;
    const usable = available - overhead;
    if (usable <= 0) return;

    // Measure natural heights
    const naturals: number[] = contentRefs.current.map((ref) => {
      const el = ref.current;
      return el ? el.scrollHeight : 0;
    });

    setHeights((prev) => {
      const next = [...prev];
      // Only auto-fit sections that haven't been manually resized
      const autoIndices: number[] = [];
      let usedByManual = 0;
      for (let i = 0; i < count; i++) {
        if (manualRef.current.has(i)) {
          usedByManual += next[i];
        } else {
          autoIndices.push(i);
        }
      }

      if (autoIndices.length === 0) return prev;

      const availableForAuto = usable - usedByManual;
      if (availableForAuto <= 0) return prev;

      const totalNatural = autoIndices.reduce((sum, i) => sum + (naturals[i] || configs[i].defaultHeight), 0);

      if (totalNatural <= availableForAuto) {
        // Everything fits — give each its natural height
        for (const i of autoIndices) {
          const nat = naturals[i] || configs[i].defaultHeight;
          next[i] = Math.max(configs[i].min, Math.min(configs[i].max, nat));
        }
      } else {
        // Proportional distribution
        for (const i of autoIndices) {
          const nat = naturals[i] || configs[i].defaultHeight;
          const share = totalNatural > 0 ? (nat / totalNatural) * availableForAuto : availableForAuto / autoIndices.length;
          next[i] = Math.max(configs[i].min, Math.min(configs[i].max, Math.round(share)));
        }
      }

      // Check if heights actually changed to avoid unnecessary re-renders
      const changed = next.some((h, i) => h !== prev[i]);
      return changed ? next : prev;
    });
  }, [containerRef, configs, count]);

  // ResizeObserver on content refs — re-run auto-fit when content changes
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      autoFit();
    });

    for (const ref of contentRefs.current) {
      if (ref.current) observer.observe(ref.current);
    }

    // Also observe container for size changes
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Initial fit
    autoFit();

    return () => observer.disconnect();
  }, [autoFit, containerRef]);

  // Build pointer-down handlers (manual drag)
  const makePointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startH = heights[index];
      const cfg = configs[index];

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientY - startY;
        const newH = Math.max(cfg.min, Math.min(cfg.max, startH + delta));
        setHeights((prev) => {
          const next = [...prev];
          next[index] = newH;
          return next;
        });
      };

      const onUp = () => {
        // Mark as manual and persist
        manualRef.current.add(index);
        setHeights((prev) => {
          const persisted: Record<string, number> = {};
          for (let i = 0; i < count; i++) {
            if (manualRef.current.has(i)) {
              persisted[configs[i].id] = prev[i];
            }
          }
          savedRef.current = persisted;
          savePersisted(viewKey, persisted);
          return prev;
        });

        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [heights, configs, count, viewKey],
  );

  // Build results
  return configs.map((_, i) => ({
    height: heights[i],
    contentRef: contentRefs.current[i],
    onPointerDown: makePointerDown(i),
  }));
}
